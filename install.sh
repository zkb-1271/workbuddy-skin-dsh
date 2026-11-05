#!/bin/bash
# dsh-skin · 一键安装
#
#   ./install.sh              安装守护进程并立刻注入皮肤
#   ./install.sh --relaunch   安装后自动重启 WorkBuddy（会中断当前会话）
#
# 做的事：装 LaunchAgent（开机自启 + 每 2 秒补注入）→ 确认调试端口 → 注入皮肤
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

APP="${WORKBUDDY_APP:-/Applications/WorkBuddy.app}"
PORT="${CDP_PORT:-9222}"

echo "== dsh-skin · 安装 =="
echo

# ---------- 环境检查 ----------
if [ "$(uname)" != "Darwin" ]; then
  echo "✘ 目前只支持 macOS"
  exit 1
fi
if [ ! -x "$APP/Contents/MacOS/Electron" ]; then
  echo "✘ 找不到 WorkBuddy：$APP"
  echo "  如果是装在别处，用：WORKBUDDY_APP=/path/to/WorkBuddy.app ./install.sh"
  exit 1
fi
for bin in node python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "✘ 需要 $bin 在 PATH 里"
    echo "  node：brew install node（WorkBuddy 自带的也能用，见 README）"
    exit 1
  fi
done
echo "· WorkBuddy: $APP"
echo "· node:      $(command -v node)"
echo

# ---------- 守护进程 ----------
bash tools/install-daemon.sh || exit 1

# ---------- 调试端口 ----------
if ! curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo
  echo "⚠ WorkBuddy 当前没有带调试端口运行（注入需要它）。"
  if [ "${1:-}" = "--relaunch" ]; then
    echo "→ 自动重启 WorkBuddy（当前会话会中断，历史记录不丢）"
    bash tools/cdp-relaunch.sh || exit 1
  else
    echo
    echo "  两种做法，任选其一："
    echo "    a) 手动退出 WorkBuddy 再打开（Cmd+Q，再点图标），端口会自动带上"
    echo "    b) 直接运行：./install.sh --relaunch （脚本帮你重启，约 15 秒）"
    exit 0
  fi
fi

# ---------- 注入 ----------
bash tools/apply.sh
echo
echo "✔ 安装完成。皮肤应该已经出现；没有的话看日志："
echo "   $HOME/.dsh-skin/logs/daemon.log"
echo "   卸载：./uninstall.sh"
