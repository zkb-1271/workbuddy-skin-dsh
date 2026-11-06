#!/bin/bash
# 把 dsh 皮肤注入到 WorkBuddy 的各个窗口。
# 用法：./apply.sh            （按 localStorage 里的选择应用）
#      ./apply.sh dsh        （强制 dsh 风格）
#      ./apply.sh native     （强制原生）
#
# 注意：绝不能按 target 序号选窗口 —— 关掉设置窗口再打开，
# 新窗口会排到列表最前面，序号全变。一律按 data-window-app-id 判定（CDP_APP）。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/tools"
SKIN="$ROOT/skin"
cd "$TOOLS" || exit 1

MODE="${1:-}"
PORT="${CDP_PORT:-9222}"

if ! curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✘ CDP 未开启。先跑 launch-debug.command"
  exit 1
fi

count_pages() {
  curl -s "http://127.0.0.1:$PORT/json/list" | python3 -c "import json,sys; print(len([t for t in json.load(sys.stdin) if t.get('type')=='page' and t.get('webSocketDebuggerUrl')]))"
}

if [ "$(count_pages)" -eq 0 ]; then
  echo "✘ 没有可注入的窗口"
  exit 1
fi

# ---- 主窗口 ----
echo "→ 主窗口"
CDP_APP=main node cdp.mjs css "$SKIN/main.css" || exit 1
if [ -n "$MODE" ]; then
  CDP_APP=main node cdp.mjs eval "(() => { localStorage.setItem('wbds.skin.mode', '$MODE'); return 1 })()" >/dev/null 2>&1
fi
CDP_APP=main node cdp.mjs run "$SKIN/mode-sync.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/launch.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/hide.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/resize.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/archive.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/status.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/avatar.js" >/dev/null 2>&1
# 本地头像（不进货）：用户自己的照片放这里，仓库默认保持占位图
[ -f "$SKIN/avatar.local.js" ] && CDP_APP=main node cdp.mjs run "$SKIN/avatar.local.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/credits.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/settings2.js" >/dev/null 2>&1
CDP_APP=main node cdp.mjs run "$SKIN/tasks.js" >/dev/null 2>&1
echo "   完成"

# ---- 设置窗口：原生外观，只装一个自包含的「界面风格」开关 ----
# 按用户要求：⌘, 打开的就是 WorkBuddy 原生设置（完整功能、原生外观）；
# 自建设置页走侧栏左下角头像（settings2.js，只在主窗口）。
# 唯一的注入是 switch.js —— 它自带样式、不带 data-wbskin 前缀，
# 是「切成原生后怎么切回来」的兜底入口（外观页顶部一行）。
echo "→ 设置窗口（原生外观 + 界面风格开关）"
if CDP_APP=settings node cdp.mjs eval "1" >/dev/null 2>&1; then
  CDP_APP=settings node cdp.mjs run "$SKIN/switch.js" >/dev/null 2>&1
  echo "   完成（开关在 外观 页顶部）"
else
  echo "   未打开，跳过"
fi

echo "✔ 全部完成"
