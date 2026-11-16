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

# 带端口重启 WorkBuddy 的唯一入口（前台跑到底，见函数内说明）。
submit_relaunch() {
  # daemon 是被 launchd 每 2 秒拉起的短命进程：`nohup ... &` 起的子进程会跟着
  # 父进程一起被回收（实测 relaunch.log 根本没生成、应用也没重启）。
  # launchctl submit 在沙箱里又被拒。所以干脆前台跑 —— relaunch 脚本自带超时
  # （内联环境变量 60s + setenv/open 40s），跑完 daemon 再退；这期间 launchd
  # 不会重复拉起同一个 job，正好。
  /bin/bash "$PROJ/tools/cdp-relaunch.sh" >/dev/null 2>&1
}

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
  # 刚启动却没带端口（比如从 Dock 双击 / 开机自启）→ 用内联环境变量重启一次。
  # 两道窗口：
  #   ① 进程刚起来 60 秒内 —— 基本等于"刚启动"，重启不会打断任何工作；
  #   ② 开机 15 分钟内 —— 覆盖"重启电脑 → 系统还没把 launchctl 环境变量恢复、
  #      WorkBuddy 就自启了"这种情况（用户 11-16 报的就是这个：开机后皮肤不生效）。
  #      这时用户通常还没开始干活，重启代价最小。
  # 每个开机周期只做一次，靠 state/last-boot-relaunch 记录，避免反复重启。
  PID_APP=$(pgrep -f "/Applications/WorkBuddy.app/Contents/MacOS/Electron" | head -1)
  if [ -n "${PID_APP:-}" ] && [ -x "$PROJ/tools/cdp-relaunch.sh" ]; then
    LAST=$(cat "$STATE/last-relaunch" 2>/dev/null || echo 0)
    NOW0=$(date +%s)
    # 进程存活时长自己记：这台机器上 `ps -p PID -o etimes=` 不被接受
    # （会打印一整页关键字列表 + "integer expression expected"），
    # 改成记住「第一次看到这个 PID 的时间」，两者差就是存活时长。
    PID_SEEN=$(cat "$STATE/pid-seen" 2>/dev/null || echo "")
    SEEN_PID=${PID_SEEN%% *}
    SEEN_TS=${PID_SEEN##* }
    if [ "$SEEN_PID" != "$PID_APP" ] || [ -z "${SEEN_TS:-}" ]; then
      printf '%s %s' "$PID_APP" "$NOW0" >"$STATE/pid-seen"
      SEEN_TS=$NOW0
    fi
    UP=$((NOW0 - SEEN_TS))
    BOOT=$(sysctl -n kern.boottime 2>/dev/null | grep -o 'sec = [0-9]*' | head -1 | grep -o '[0-9]*')
    UP_SYS=""
    [ -n "${BOOT:-}" ] && UP_SYS=$((NOW0 - BOOT))
    BOOT_DONE=$(cat "$STATE/last-boot-relaunch" 2>/dev/null || echo 0)

    FRESH_APP=0
    [ -n "${UP:-}" ] && [ "$UP" -lt 60 ] && FRESH_APP=1
    FRESH_BOOT=0
    if [ -n "${UP_SYS:-}" ] && [ "$UP_SYS" -lt 900 ] && [ "$BOOT_DONE" != "$BOOT" ]; then
      FRESH_BOOT=1
    fi

    if { [ "$FRESH_APP" = 1 ] || [ "$FRESH_BOOT" = 1 ]; } && [ $((NOW0 - LAST)) -gt 120 ]; then
      if [ "$FRESH_BOOT" = 1 ]; then
        log "开机 ${UP_SYS}s 内检测到 WorkBuddy 无调试端口，自动带端口重启一次（本开机周期仅一次）"
        printf '%s' "$BOOT" >"$STATE/last-boot-relaunch"
      else
        log "检测到启动未带端口（已运行 ${UP}s），自动带端口重启一次"
      fi
      date +%s >"$STATE/last-relaunch"
      osascript -e 'display notification "正在重启 WorkBuddy 以启用 dsh 皮肤，历史记录不会丢" with title "dsh 皮肤"' >/dev/null 2>&1
      submit_relaunch
      exit 0
    fi

    # 预约式重启：state/relaunch-at 存一个 epoch 时间点，到点自己带端口重启。
    # 用在「皮肤没生效、但不想当场打断用户」的场合（agent 排障后给用户留出读消息的时间）。
    PENDING=$(cat "$STATE/relaunch-at" 2>/dev/null || echo 0)
    if [ -n "${PENDING:-}" ] && [ "$PENDING" != "0" ] && [ "$NOW0" -ge "$PENDING" ]; then
      rm -f "$STATE/relaunch-at"
      log "按预约时间带端口重启 WorkBuddy"
      date +%s >"$STATE/last-relaunch"
      osascript -e 'display notification "正在重启 WorkBuddy 以启用 dsh 皮肤，历史记录不会丢" with title "dsh 皮肤"' >/dev/null 2>&1
      submit_relaunch
      exit 0
    fi

    # 已经错过自动窗口（开机很久了 / 这个周期已经重启过）→ 只提醒，不擅自杀进程
    if [ "$BOOT_DONE" != "${BOOT:-}" ] && [ -n "${UP:-}" ] && [ "$UP" -gt 60 ]; then
      NUDGE="$STATE/nudge-$BOOT"
      if [ ! -f "$NUDGE" ]; then
        : >"$NUDGE"
        log "皮肤需要重启才能生效：本次启动没带调试端口，请 Cmd+Q 后重开一次 WorkBuddy"
        osascript -e 'display notification "本次启动没带调试端口，Cmd+Q 退出后重新打开 WorkBuddy 即可" with title "dsh 皮肤未生效"' >/dev/null 2>&1
      fi
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

# ---------- 4.6 健康检查（每 10s）----------
# 窗口签名没变不代表皮肤还在：渲染进程重载、脚本被清、注入只成功了一半，
# 都会出现「皮肤在但缺一块」或「整片没挂上」。这里定期问一句页面自己，
# 只要用户选的是 dsh 而 data-wbskin 不在，就清掉签名重注入。
# （用户主动选原生时 mode=native，这里绝不抢回来。）
NOW_H=$(date +%s)
LAST_HEALTH=$(cat "$STATE/health-ts" 2>/dev/null || echo 0)
if [ $((NOW_H - LAST_HEALTH)) -ge 10 ]; then
  echo "$NOW_H" >"$STATE/health-ts"
  HEALTH=$(cd "$PROJ/tools" && CDP_APP=main node cdp.mjs eval \
    "(() => { const m = localStorage.getItem('wbds.skin.mode') || ''; const s = document.documentElement.getAttribute('data-wbskin') || 'none'; const c = document.getElementById('wb-dsh-skin') ? 1 : 0; const o = document.getElementById('wbds-settings2') ? 1 : 0; return [s, m, c, o].join('|'); })()" 2>/dev/null | tr -d '"' | tr -d ' \n' || true)
  HSKIN=$(echo "$HEALTH" | cut -d'|' -f1)
  HMODE=$(echo "$HEALTH" | cut -d'|' -f2)
  HCSS=$(echo "$HEALTH" | cut -d'|' -f3)
  HOVL=$(echo "$HEALTH" | cut -d'|' -f4)
  if [ "$HMODE" != "native" ]; then
    if [ "$HSKIN" = "none" ] || [ "$HCSS" = "0" ] || [ "$HOVL" = "0" ]; then
      log "健康检查：皮肤不完整（skin=$HSKIN css=$HCSS settings=$HOVL mode=${HMODE:-默认}），重新注入"
      rm -f "$STATE/signature"
    fi
  fi

  # 设置窗口（⌘,）里的「界面风格」开关：switch.js 没挂上时，
  # 外观页就只有原生的 浅色/深色/…，切到原生后没有入口切回来。
  # 窗口刚打开时 React 还没渲染，apply.sh 那一次注入经常落空，这里补。
  SET_STATE=$(cd "$PROJ/tools" && CDP_APP=settings node cdp.mjs eval \
    "typeof window.__wbdsSwitch" 2>/dev/null | tr -d '"' | tr -d ' \n' || true)
  if [ "$SET_STATE" = "undefined" ]; then
    ( cd "$PROJ/tools" && CDP_APP=settings node cdp.mjs run ../skin/switch.js >/dev/null 2>&1 ) \
      && log "健康检查：设置窗口缺「界面风格」开关，已补注入"
  fi
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
