#!/bin/bash
# 一条命令看清自动注入卡在哪一环。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.dsh-skin.agent"                        # 与 install-daemon.sh 保持一致
LEGACY_LABEL="com.zkb.workbuddy-dsh-skin"          # 早期个人版装的，一并认
[ -f "$HOME/Library/LaunchAgents/$LABEL.plist" ] || LABEL="$LEGACY_LABEL"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT=9222
BUNDLE_ID="com.tencent.workbuddy.mac"

ok(){ printf "  ✔ %s\n" "$1"; }
no(){ printf "  ✘ %s\n" "$1"; }
warn(){ printf "  ▲ %s\n" "$1"; }

echo "== WorkBuddy dsh 皮肤 · 自检 =="
echo

echo "[1] WorkBuddy 是否在运行"
PID=$(lsappinfo list 2>/dev/null | grep -A4 "bundleID=\"$BUNDLE_ID\"" | grep -oE 'pid = [0-9]+' | head -1 | grep -oE '[0-9]+')
if [ -n "${PID:-}" ]; then ok "在运行（PID=${PID}）"; else no "没在运行"; fi

echo "[2] 调试端口"
if curl -s -m 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  ok "端口 $PORT 通"
else
  no "端口 $PORT 不通 —— 皮肤无法注入"
  warn "原因通常是这次启动没带环境变量。彻底退出 WorkBuddy 再打开一次。"
fi

echo "[3] 环境变量（决定 Dock 启动是否带端口）"
# 沙箱里 launchctl getenv 读不到用户域，daemon 会把实际值记到 state/env-value，拿它兜底
VAL=$(launchctl getenv WORKBUDDY_REMOTE_DEBUGGING_PORT 2>/dev/null || true)
[ -n "$VAL" ] || VAL=$(cat "$HOME/.dsh-skin/state/env-value" 2>/dev/null || true)
if [ "$VAL" = "$PORT" ]; then
  ok "WORKBUDDY_REMOTE_DEBUGGING_PORT=$VAL"
elif [ -z "$VAL" ]; then
  no "未设置"
  warn "在 Terminal 手动执行：launchctl setenv WORKBUDDY_REMOTE_DEBUGGING_PORT $PORT"
else
  warn "值异常：$VAL"
fi

echo "[4] 后台任务（LaunchAgent）"
if [ -f "$PLIST" ]; then ok "plist 存在"; else no "plist 不存在，未安装"; fi
if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  ok "已加载"
else
  no "未加载"
  warn "重新双击 install-daemon.command"
fi

echo "[5] 当前是否已注入"
if curl -s -m 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  cd "$ROOT" || exit 1
  MAIN=$(CDP_APP=main node "$ROOT/tools/cdp.mjs" eval "document.documentElement.getAttribute('data-wbskin')" 2>/dev/null | tr -d '" \n')
  case "$MAIN" in
    dsh) ok "主窗口已是 dsh 风格" ;;
    null|"") warn "主窗口未注入（当前为原生，或选择的是原生）" ;;
    *) warn "主窗口 data-wbskin=$MAIN" ;;
  esac
fi

echo "[6] 最近日志"
if [ -f "$HOME/.dsh-skin/logs/daemon.log" ]; then
  tail -6 "$HOME/.dsh-skin/logs/daemon.log" | sed 's/^/  /'
else
  warn "还没有日志，说明后台任务没跑过"
fi

echo
echo "结论："
if [ -n "${PID:-}" ] && curl -s -m 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  echo "  三项关键条件都满足。若界面仍是原生，点 设置 → 外观 → 界面风格 选「dsh 风格」。"
else
  echo "  有环节没就绪，按上面标 ✘ 的项处理。多数情况是「重启 WorkBuddy 一次」即可。"
fi
