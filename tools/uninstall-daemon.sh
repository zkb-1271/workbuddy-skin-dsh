#!/bin/bash
# 卸载开机自启：停掉 LaunchAgent、撤掉环境变量、顺手还原界面。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.dsh-skin.agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM=$(id -u)

echo "== 卸载 WorkBuddy dsh 皮肤自启 =="

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null && echo "· 已停止 LaunchAgent" || echo "· LaunchAgent 未在运行"

if [ -f "$PLIST" ]; then
  rm -f "$PLIST" && echo "· 已删除 plist"
fi

launchctl unsetenv WORKBUDDY_REMOTE_DEBUGGING_PORT 2>/dev/null && echo "· 已撤销环境变量" || echo "· 环境变量本就未设置"

rm -rf "$HOME/.dsh-skin/state"

echo
echo "== 还原界面 =="
bash "$ROOT/tools/restore.sh" || true

echo
echo "✔ 已卸载。下次 WorkBuddy 启动就是纯原生界面。"
