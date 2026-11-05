#!/bin/bash
# 后台工作者：退出 WorkBuddy → 用内联环境变量直接执行二进制 → 轮询确认 CDP。
#
# 为什么用"直接执行二进制 + 内联环境变量"作为首选：
#   launchctl setenv + open 这条路在实测中没把变量传进去（getenv 为空，端口未起）。
#   而 `WORKBUDDY_REMOTE_DEBUGGING_PORT=9222 /path/to/WorkBuddy` 是进程级继承，
#   不经过 LaunchServices、不经过 launchd，没有中间环节可以丢变量。
#
# 本脚本由 launch-debug.command 用 nohup 拉起，父进程退出也不受影响。

set -u
PORT="${PORT:-9222}"
APP="${WORKBUDDY_APP:-/Applications/WorkBuddy.app}"
BIN="$APP/Contents/MacOS/Electron"
LOG="$HOME/.dsh-skin/logs/relaunch.log"
mkdir -p "$(dirname "$LOG")"

# 直接追加写文件，不走 tee 管道——进程被杀也不会丢已打印的行
exec >>"$LOG" 2>&1

echo "===== $(date '+%F %T') 后台工作者启动 (pid $$) ====="

# ---------- 1. 退出当前 WorkBuddy ----------
echo "→ 退出 WorkBuddy（本会话会中断，重启后在历史里恢复）"
osascript -e 'tell application "WorkBuddy" to quit' >/dev/null 2>&1
for _ in $(seq 1 30); do
  pgrep -f "$BIN" >/dev/null 2>&1 || break
  sleep 0.5
done
if pgrep -f "$BIN" >/dev/null 2>&1; then
  echo "  osascript 未生效，改用 pkill"
  pkill -f "$BIN" >/dev/null 2>&1
  sleep 3
fi
if pgrep -f "$BIN" >/dev/null 2>&1; then
  echo "✘ 无法退出 WorkBuddy，中止。请手动 Cmd+Q 后重跑。"
  exit 1
fi
echo "✔ 已退出"

# ---------- 2. 校验工具 ----------
wait_cdp() {
  local n=${1:-60}
  for _ in $(seq 1 "$n"); do
    if curl -s -m 1 "http://127.0.0.1:$PORT/json/version" 2>/dev/null | grep -q webSocketDebuggerUrl; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

report_ok() {
  echo "✔ CDP 就绪: http://127.0.0.1:$PORT"
  curl -s "http://127.0.0.1:$PORT/json/version"; echo
  echo "  可注入页面数: $(curl -s "http://127.0.0.1:$PORT/json" | grep -c '"type": "page"')"
  echo "  结束时间: $(date '+%F %T')"
  exit 0
}

# ---------- 3. 方式一：直接执行二进制 + 内联环境变量 ----------
echo "→ 方式一：内联环境变量 + 直接执行二进制"
nohup env WORKBUDDY_REMOTE_DEBUGGING_PORT="$PORT" "$BIN" >/tmp/wb-cdp-stdout.log 2>&1 &
disown 2>/dev/null || true
if wait_cdp 60; then
  report_ok
fi
echo "  方式一未起端口（WorkBuddy 可能已在运行或启动失败），查看 /tmp/wb-cdp-stdout.log"

# ---------- 4. 方式二：launchctl setenv + open ----------
echo "→ 方式二：launchctl setenv + open"
launchctl setenv WORKBUDDY_REMOTE_DEBUGGING_PORT "$PORT"
echo "  setenv 后 getenv = $(launchctl getenv WORKBUDDY_REMOTE_DEBUGGING_PORT)"
pkill -f "$BIN" >/dev/null 2>&1
sleep 2
open -a "$APP" >/dev/null 2>&1
if wait_cdp 40; then
  report_ok
fi

echo "✘ 两种方式都失败。诊断信息："
echo "  launchctl getenv = $(launchctl getenv WORKBUDDY_REMOTE_DEBUGGING_PORT)"
echo "  进程: $(pgrep -fl "$BIN" | head -1)"
echo "  标准输出尾部: $(tail -5 /tmp/wb-cdp-stdout.log 2>/dev/null)"
exit 1
