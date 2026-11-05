#!/bin/bash
# 还原：移除所有注入，回到 WorkBuddy 原生界面。
# 用法：./restore.sh
#
# 原理：皮肤样式全部挂在 :root[data-wbskin="dsh"] 下，
# 摘掉这个属性即完全失效；再删掉 style 标签与注入的 DOM 即为零残留。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/tools" || exit 1

PORT="${CDP_PORT:-9222}"

if ! curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✘ CDP 未开启；WorkBuddy 未注入时本就不受影响。"
  exit 0
fi

CLEAN="(() => {
  ['wb-dsh-skin','wbds-control-style','wbds-hide-style'].forEach(id => document.getElementById(id)?.remove());
  document.getElementById('wbds-style-row')?.remove();
  document.getElementById('wbds-resize-handle')?.remove();
  document.querySelectorAll('.wbds-arc').forEach(el => el.remove());
  document.querySelectorAll('[data-wbds-archived]').forEach(el => el.removeAttribute('data-wbds-archived'));
  window.__wbdsArchive?.destroy?.();
  window.__wbdsStatus?.destroy?.();
  window.__wbdsCredits?.destroy?.();
  window.__wbdsTasks?.destroy?.();
  window.__wbdsSettings2?.destroy?.();
  window.__wbdsCreditsData = undefined;
  try { localStorage.removeItem('wbds.credits.cache'); } catch {}
  document.querySelectorAll('[data-wbds-status]').forEach(el => el.removeAttribute('data-wbds-status'));
  document.documentElement.style.removeProperty('--wbds-content-w');
  document.body.classList.remove('wbds-resizing');
  document.querySelectorAll('[data-wbds-hide]').forEach(el => el.removeAttribute('data-wbds-hide'));
  document.documentElement.removeAttribute('data-wbskin');
  if (window.__wbdsObserver) { window.__wbdsObserver.disconnect(); window.__wbdsObserver = null; }
  if (window.__wbdsHideObserver) { window.__wbdsHideObserver.disconnect(); window.__wbdsHideObserver = null; }
  window.__wbdsHide = null;
  window.__wbdsSwitch = null;
  window.__wbdsLaunch = null;
  return 'restored';
})()"

echo "→ 主窗口"
CDP_APP=main node cdp.mjs eval "$CLEAN" >/dev/null 2>&1 && echo "   已还原"

if CDP_APP=settings node cdp.mjs eval "1" >/dev/null 2>&1; then
  echo "→ 设置窗口"
  CDP_APP=settings node cdp.mjs eval "$CLEAN" >/dev/null 2>&1 && echo "   已还原"
fi

# 选择也复位，避免下次 apply 又自动挂回来
CDP_APP=main node cdp.mjs eval "(() => { localStorage.removeItem('wbds.skin.mode'); return 1 })()" >/dev/null 2>&1

echo "✔ 已还原为原生界面（无残留样式、无残留 DOM）"
