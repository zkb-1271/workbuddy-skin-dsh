#!/bin/bash
# WorkBuddy dsh 皮肤守护进程
#
# 由 LaunchAgent 每 5 秒唤醒一次，每次只做判断、做完就退出，不常驻。
#
# 职责：
#   1. 保活 WORKBUDDY_REMOTE_DEBUGGING_PORT —— 让从 Dock 双击启动也带调试端口
#   2. WorkBuddy 重启 / 开关窗口后，自动把皮肤补注入回去
#   3. 端口不通时只写提示，**绝不擅自杀掉用户的 WorkBuddy**（会丢未保存内容）
#
# 环境事实（踩过的坑，别改回去）：
#   · WorkBuddy 主进程可执行文件是 Contents/MacOS/Electron，不是 MacOS/WorkBuddy
#   · 沙箱下 `ps -o etime` / `ps -eo` 被拒，进程存活时长拿不到
#   · 因此进程识别统一走 lsappinfo，按 bundleID 取 pid
set -uo pipefail

PORT=9222
PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$HOME/.dsh-skin/state"          # 运行时状态放仓库外，仓库保持干净
LOG="$HOME/.dsh-skin/logs/daemon.log"
BUNDLE_ID="com.tencent.workbuddy.mac"

mkdir -p "$STATE" "$(dirname "$LOG")"
log() { echo "$(date '+%F %T') $*" >>"$LOG"; }

# ---------- 1. 保活全局环境变量 ----------
# 这样用户从 Dock 正常双击启动也能读到端口配置，全程无感。
# 没有权限就静默跳过 —— 后果只是"这次启动没带端口"，不会破坏任何东西。
# 记一份当前可见的环境变量值：我们（沙箱里的 agent）读不到用户域，靠这个核对
CUR_ENV=$(launchctl getenv WORKBUDDY_REMOTE_DEBUGGING_PORT 2>/dev/null)
[ "${CUR_ENV:-}" != "$(cat "$STATE/env-value" 2>/dev/null)" ] && printf '%s' "${CUR_ENV:-}" >"$STATE/env-value"

if [ "${CUR_ENV:-}" != "$PORT" ]; then
  ERR=$(launchctl setenv WORKBUDDY_REMOTE_DEBUGGING_PORT "$PORT" 2>&1)
  if [ -z "${ERR:-}" ]; then
    log "setenv -> $PORT"
  else
    # 只在错误变化时记一次，避免刷日志
    if [ "$(cat "$STATE/setenv-err" 2>/dev/null)" != "$ERR" ]; then
      log "setenv 失败：$ERR"
      printf '%s' "$ERR" >"$STATE/setenv-err"
    fi
  fi
fi

# ---------- 2. WorkBuddy 在跑吗 ----------
PID=$(lsappinfo list 2>/dev/null \
  | grep -A4 "bundleID=\"$BUNDLE_ID\"" \
  | grep -oE 'pid = [0-9]+' \
  | head -1 \
  | grep -oE '[0-9]+')

if [ -z "${PID:-}" ]; then
  rm -f "$STATE/last-pid" "$STATE/last-count" 2>/dev/null
  exit 0
fi

# ---------- 3. 端口不通 ----------
if ! curl -s -m 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  # 环境变量丢了就补回来：daemon 跑在 launchd 上下文，这一步通常有权限。
  # 补上之后，用户下次从 Dock 启动 WorkBuddy 就会自动带端口。
  # 记一份当前可见的环境变量值：我们（沙箱里的 agent）读不到用户域，靠这个核对
CUR_ENV=$(launchctl getenv WORKBUDDY_REMOTE_DEBUGGING_PORT 2>/dev/null)
[ "${CUR_ENV:-}" != "$(cat "$STATE/env-value" 2>/dev/null)" ] && printf '%s' "${CUR_ENV:-}" >"$STATE/env-value"

if [ "${CUR_ENV:-}" != "$PORT" ]; then
    launchctl setenv WORKBUDDY_REMOTE_DEBUGGING_PORT "$PORT" 2>/dev/null \
      && log "已补设 WORKBUDDY_REMOTE_DEBUGGING_PORT=$PORT"
  fi
  # 刚启动却没带端口（比如从 Dock 双击）→ 用内联环境变量重启一次，
  # 只在启动后 40 秒内动手，绝不碰已经用了很久的会话。
  PID_APP=$(pgrep -f "/Applications/WorkBuddy.app/Contents/MacOS/Electron" | head -1)
  if [ -n "${PID_APP:-}" ] && [ -x "$PROJ/tools/cdp-relaunch.sh" ]; then
    UP=$(ps -p "$PID_APP" -o etimes= 2>/dev/null | tr -d ' ')
    LAST=$(cat "$STATE/last-relaunch" 2>/dev/null || echo 0)
    NOW0=$(date +%s)
    if [ -n "${UP:-}" ] && [ "$UP" -lt 40 ] && [ $((NOW0 - LAST)) -gt 120 ]; then
      log "检测到启动未带端口（已运行 ${UP}s），自动带端口重启一次"
      date +%s >"$STATE/last-relaunch"
      nohup /bin/bash "$PROJ/tools/cdp-relaunch.sh" >/dev/null 2>&1 &
      exit 0
    fi
  fi

  # 限流：每 30 分钟最多提示一次，避免刷日志
  NOW=$(date +%s)
  LAST_WARN=$(cat "$STATE/warn-ts" 2>/dev/null || echo 0)
  if [ $((NOW - LAST_WARN)) -gt 1800 ]; then
    log "WorkBuddy (PID=$PID) 正在无调试端口运行 —— 皮肤暂不可用。下次重启 WorkBuddy 时会自动带上端口。"
    date +%s >"$STATE/warn-ts"
  fi
  exit 0
fi

# ---------- 4. 端口通了：判断要不要（重新）注入 ----------
WIN_COUNT=$(curl -s -m 1 "http://127.0.0.1:$PORT/json" 2>/dev/null | grep -c '"webSocketDebuggerUrl"' || true)
SIGNATURE="$PID-$WIN_COUNT"

# ---------- 4.5 前端命令队列（记忆编辑等，每轮都检查） ----------
# 页面把命令写进 localStorage['wbds.cmd']，这里执行后回写结果。
# 没命令时 cmd.mjs 连上读一次就退出，开销只有一次 node 启动。
node "$PROJ/tools/cmd.mjs" >>"$LOG" 2>&1 || true

# ---------- 3.5 积分数据刷新（60s 节流） ----------
# 依赖主窗口里 credits.js 创建的隐藏 iframe；成功失败都记 ts，
# 避免无 iframe 时每 5s 刷一次日志。
NOW=$(date +%s)
LAST_CRED=$(cat "$STATE/credits-ts" 2>/dev/null || echo 0)
if [ $((NOW - LAST_CRED)) -ge 60 ]; then
  date +%s >"$STATE/credits-ts"
  if node "$PROJ/tools/credits.mjs" >>"$LOG" 2>&1; then
    :
  else
    log "credits 刷新失败，60s 后重试"
  fi
  # 同档：本地配置/记忆/插件/磁盘占用（自建设置页用）
  node "$PROJ/tools/localdata.mjs" >>"$LOG" 2>&1 || log "localdata 采集失败"
fi

if [ "$(cat "$STATE/signature" 2>/dev/null || echo '')" = "$SIGNATURE" ]; then
  exit 0   # 已注入且窗口没变化，绝大多数情况走这里，开销只有两次 curl
fi

cd "$PROJ" || exit 0

if ./tools/apply.sh >/dev/null 2>&1; then
  echo "$SIGNATURE" >"$STATE/signature"
  rm -f "$STATE/warn-ts" 2>/dev/null
  log "已注入 PID=$PID windows=$WIN_COUNT"
else
  log "注入失败 PID=$PID windows=$WIN_COUNT（下轮重试）"
fi
