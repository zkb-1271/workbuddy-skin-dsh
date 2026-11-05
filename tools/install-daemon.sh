#!/bin/bash
# 安装 LaunchAgent：WorkBuddy 一起来就自动挂 dsh 皮肤。
# 必须由用户在 Terminal 里执行一次 —— agent 的沙箱没有 launchctl 权限。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.dsh-skin.agent"
LEGACY_LABEL="com.zkb.workbuddy-dsh-skin"   # 早期个人版：安装时一并替换掉
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DAEMON="$ROOT/tools/daemon.sh"
LOGDIR="$HOME/.dsh-skin/logs"
PORT=9222
UID_NUM=$(id -u)

echo "== WorkBuddy dsh 皮肤 · 开机自启安装 =="
echo

# ---------- 前置检查 ----------
if [ ! -f "/Applications/WorkBuddy.app/Contents/MacOS/Electron" ]; then
  echo "✘ 找不到 WorkBuddy：/Applications/WorkBuddy.app"
  exit 1
fi

NODE_BIN=$(command -v node 2>/dev/null || true)
if [ -z "$NODE_BIN" ]; then
  echo "✘ PATH 里没有 node。请先确认 node 可用（WorkBuddy 自带的在"
  echo "   ~/.workbuddy/binaries/node/versions/*/bin 下）。"
  exit 1
fi
NODE_DIR=$(dirname "$NODE_BIN")
echo "· node: $NODE_BIN"
echo "· 项目: $ROOT"

chmod +x "$DAEMON" "$ROOT/tools/apply.sh" "$ROOT/tools/restore.sh" 2>/dev/null
mkdir -p "$LOGDIR" "$HOME/.dsh-skin/state" "$HOME/Library/LaunchAgents"

# ---------- 写 plist ----------
cat >"$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DAEMON</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>2</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key><string>$LOGDIR/daemon.out</string>
  <key>StandardErrorPath</key><string>$LOGDIR/daemon.err</string>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>5</integer>
</dict>
</plist>
PLIST_EOF

echo "· plist: $PLIST"

# ---------- 注册 ----------
# 旧个人版 agent 如果存在，先卸掉，避免两套 daemon 互相覆盖
if [ -f "$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist" ]; then
  launchctl bootout "gui/$UID_NUM/$LEGACY_LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
  echo "· 已清理旧版 LaunchAgent（${LEGACY_LABEL}）"
fi

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true

if ! launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null; then
  # 新版 bootstrap 失败时退回老写法（不同 macOS 版本行为不一致）
  if ! launchctl load -w "$PLIST" 2>/dev/null; then
    echo
    echo "✘ 注册 LaunchAgent 失败。"
    echo "  请确认这是在你自己的 Terminal 里运行的（不是通过其他程序转发）。"
    echo "  也可手动执行：launchctl bootstrap gui/$UID_NUM \"$PLIST\""
    exit 1
  fi
fi
# 注册不一定成功（在 IDE / 沙箱里跑会静默失败），必须回查一次
if launchctl print "gui/$UID_NUM/$LABEL" >/dev/null 2>&1; then
  echo "· 已注册（每 2 秒检查一次）"
else
  echo
  echo "✘ LaunchAgent 没有真正挂上（常见原因：在 IDE / 沙箱里运行，launchctl 被限制）。"
  echo "  请打开「终端」App，cd 到本目录后重新执行：./install.sh"
  exit 1
fi

# ---------- 让 Dock 启动也带端口 ----------
# 这一步是关键：setenv 之后，用户从 Dock 正常双击启动的 WorkBuddy
# 也会读到 WORKBUDDY_REMOTE_DEBUGGING_PORT，不需要任何包装脚本。
if launchctl setenv WORKBUDDY_REMOTE_DEBUGGING_PORT "$PORT" 2>/dev/null \
   && [ "$(launchctl getenv WORKBUDDY_REMOTE_DEBUGGING_PORT)" = "$PORT" ]; then
  echo "· 已设置会话环境变量（Dock 启动会自动带调试端口）"
else
  echo "⚠ 无法设置会话环境变量（多半是在 IDE / 沙箱里运行）。"
  echo "  守护进程会自己补设；也可以在你的终端里重跑 ./install.sh。"
fi

# ---------- 立刻跑一轮 ----------
sleep 1
echo
echo "== 首轮执行 =="
bash "$DAEMON"
if [ -f "$LOGDIR/daemon.log" ]; then
  tail -5 "$LOGDIR/daemon.log"
fi

echo
echo "✔ 安装完成"
echo
echo "接下来："
echo "  1. 完全退出 WorkBuddy 再打开（这一次重启是为了让环境变量生效）"
echo "  2. 打开后等 5 秒，皮肤会自动出现，设置页「外观」里能看到「界面风格」开关"
echo
echo "日志：$LOGDIR/daemon.log"
echo "卸载：./uninstall.sh"
