/**
 * WorkBuddy · dsh 皮肤 · 正文宽度可拖拽
 *
 * 背景：`.cr-message-list__content` 的宽度是 React 写死的内联
 * `max-width: 800.8px`（跟随窗口算出来的），CSS 改不动，只能 !important 压。
 * 这里把它改成读 CSS 变量 --wbds-content-w，再用一个手柄去改这个变量。
 *
 * 手柄放在正文右边缘；因为正文是居中的，向右拖 dx 等于宽度 +2dx。
 * 双击手柄回到默认值。宽度存 localStorage。
 */

window.__wbdsResize = (() => {
  const KEY = 'wbds.content.width';
  const HANDLE_ID = 'wbds-resize-handle';
  const DEFAULT = 1000;
  const MIN = 520;

  const root = document.documentElement;

  const readWidth = () => {
    const v = parseInt(localStorage.getItem(KEY) || '', 10);
    return Number.isFinite(v) ? v : DEFAULT;
  };

  /* 只用 max-width 约束，**不要**按可用宽度去 clamp 变量本身：
     右侧面板一开，可用宽度会临时变小，clamp 出来的小值会被存进 localStorage，
     关掉面板后正文就永远回不去了（这个 bug 就是这么来的）。
     max-width 本身只会「封顶」，容器变窄时元素自然跟着窄，不需要我们算。 */
  const apply = (w, persist = true) => {
    const clamped = Math.max(MIN, Math.round(w));
    root.style.setProperty('--wbds-content-w', clamped + 'px');
    if (persist) {
      try { localStorage.setItem(KEY, String(clamped)); } catch {}
    }
    const h = document.getElementById(HANDLE_ID);
    if (h) h.dataset.width = String(clamped);
    return clamped;
  };

  const ensureHandle = () => {
    let h = document.getElementById(HANDLE_ID);
    if (h) return h;

    h = document.createElement('div');
    h.id = HANDLE_ID;
    h.innerHTML = '<span class="wbds-grip"></span>';
    document.body.appendChild(h);

    let dragging = false;
    let startX = 0;
    let startW = 0;

    h.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      startW = readWidth();
      h.setPointerCapture(e.pointerId);
      document.body.classList.add('wbds-resizing');
      e.preventDefault();
    });

    h.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      // 正文居中：右边界右移 dx，左右各扩 dx，总宽 +2dx
      apply(startW + (e.clientX - startX) * 2);
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('wbds-resizing');
      try { h.releasePointerCapture(e.pointerId); } catch {}
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);

    h.addEventListener('dblclick', () => apply(DEFAULT));

    return h;
  };

  /* 跟随正文右边界。每帧读一次 rect，位置没变就不写 style。 */
  let lastKey = '';
  const follow = () => {
    const content = document.querySelector('.cr-message-list__content');
    const h = ensureHandle();

    /* 右侧面板打开时，正文会变得很窄，而且面板自带一条拖拽 sash（x≈正文右缘），
       我的手柄正好压在它上面会把 sash 挡住 —— 这时直接隐藏手柄。 */
    const panel = document.querySelector('.detail-panel');
    const panelOpen = !!panel && panel.getBoundingClientRect().width > 0;
    if (panelOpen) {
      if (h.style.display !== 'none') h.style.display = 'none';
      requestAnimationFrame(follow);
      return;
    }

    if (content) {
      const r = content.getBoundingClientRect();
      const key = `${Math.round(r.right)}-${Math.round(r.top)}-${Math.round(r.height)}`;
      if (r.width > 0 && key !== lastKey) {
        lastKey = key;
        h.style.display = '';
        h.style.left = Math.round(r.right) - 4 + 'px';
        h.style.top = Math.round(r.top) + 'px';
        h.style.height = Math.round(r.height) + 'px';
      }
    } else if (h.style.display !== 'none') {
      h.style.display = 'none';
    }
    requestAnimationFrame(follow);
  };

  const initial = apply(readWidth(), false);
  requestAnimationFrame(follow);

  return { width: initial };
})();
