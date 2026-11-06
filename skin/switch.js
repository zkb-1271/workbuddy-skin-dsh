/**
 * WorkBuddy · dsh 皮肤 —— 原生设置「外观」页里的主题卡
 *
 * 以前是在页面顶部塞一行按钮，现在改成和「浅色 / 深色 / 有风…」并列的一张主题卡：
 *   · 点我们的卡 → 切到 dsh 风格
 *   · 点任何一个原生主题卡 → 切回原生（皮肤摘掉）
 *
 * 跨窗口：设置窗口和主窗口同源（同一个 index.html），localStorage 共享，
 * 所以直接写 localStorage + 广播一个 ping 键，主窗口的 mode-sync.js 收到就切。
 *
 * 坑：卡片是 React 渲染的，切页会重建 DOM —— 必须幂等补挂，
 *     且补挂时不能无脑重建（会触发 MutationObserver 死循环）。
 */

window.__wbdsSwitch?.destroy?.();

window.__wbdsSwitch = (() => {
  const LS_MODE = 'wbds.skin.mode';
  const PING = 'wbds.mode.ping';
  const CELL_ID = 'wbds-theme-cell';
  const STYLE_ID = 'wbds-theme-style';
  const GRID_SEL = '.appearance-card-grid';

  /* 缩略图：白底 + 淡灰结构 + 一点主题蓝，和皮肤气质一致 */
  const COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
<rect width="320" height="200" fill="#ffffff"/>
<rect x="0" y="0" width="86" height="200" fill="#f6f7f8"/>
<rect x="12" y="18" width="52" height="7" rx="3.5" fill="#dfe2e6"/>
<rect x="12" y="34" width="62" height="7" rx="3.5" fill="#e6e8ec"/>
<rect x="12" y="50" width="46" height="7" rx="3.5" fill="#e6e8ec"/>
<rect x="12" y="74" width="58" height="7" rx="3.5" fill="#ebecef"/>
<rect x="12" y="90" width="40" height="7" rx="3.5" fill="#ebecef"/>
<rect x="12" y="106" width="54" height="7" rx="3.5" fill="#ebecef"/>
<circle cx="22" cy="176" r="7" fill="#ccd1d9"/>
<rect x="36" y="170" width="34" height="6" rx="3" fill="#dfe2e6"/>
<rect x="104" y="28" width="176" height="9" rx="4.5" fill="#e4e6ea"/>
<rect x="104" y="48" width="140" height="9" rx="4.5" fill="#eceef1"/>
<rect x="104" y="68" width="158" height="9" rx="4.5" fill="#eceef1"/>
<rect x="100" y="120" width="196" height="46" rx="10" fill="#fcfcfd" stroke="#eaebee"/>
<rect x="114" y="137" width="92" height="7" rx="3.5" fill="#e4e6ea"/>
<circle cx="272" cy="146" r="6" fill="#4e75df"/>
</svg>`;

  const CONTROL_CSS = `
  #${CELL_ID} { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  #${CELL_ID} button.wbds-theme-card {
    background-color: #ffffff;
    background-size: cover;
    background-position: center;
    border: 1px solid rgba(0, 0, 0, 0.09);
  }
  #${CELL_ID} button.wbds-theme-card[aria-pressed="true"] {
    box-shadow: 0 0 0 2px #0f1115;
    border-color: transparent;
  }
  #${CELL_ID} .appearance-card__name { font-weight: 500; }
  `;

  const readMode = () => {
    try { return localStorage.getItem(LS_MODE) === 'native' ? 'native' : 'dsh'; } catch { return 'dsh'; }
  };

  const paint = () => {
    const active = readMode() === 'dsh';
    const card = document.querySelector(`#${CELL_ID} button.wbds-theme-card`);
    if (card) card.setAttribute('aria-pressed', String(active));
    if (active) document.documentElement.setAttribute('data-wbskin', 'dsh');
    else document.documentElement.removeAttribute('data-wbskin');
  };

  const setMode = (mode) => {
    try { localStorage.setItem(LS_MODE, mode); } catch { /* 忽略 */ }
    /* 显式广播一次：storage 事件异步且只发给其他窗口，
       主窗口的 mode-sync.js 两个键都监听，谁先到算谁的。 */
    try {
      localStorage.setItem(PING, JSON.stringify({ mode, ts: Date.now() }));
    } catch { /* 忽略 */ }
    paint();
  };

  const build = () => {
    const cell = document.createElement('div');
    cell.className = 'appearance-card-cell';
    cell.id = CELL_ID;
    cell.innerHTML = `
      <button type="button" class="appearance-card wbds-theme-card" aria-pressed="false"
              style="background-image:url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(COVER_SVG)}')"></button>
      <span class="appearance-card__name">dsh</span>
    `;
    cell.querySelector('button').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMode('dsh');
    });
    return cell;
  };

  /* 点原生主题卡 → 回到原生 */
  const onGridClick = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const card = t.closest('button.appearance-card');
    if (!card || card.classList.contains('wbds-theme-card')) return;
    setMode('native');
  };

  const ensure = () => {
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    if (st.textContent !== CONTROL_CSS) st.textContent = CONTROL_CSS;

    const grid = document.querySelector(GRID_SEL);
    if (!grid) return false;
    grid.removeEventListener('click', onGridClick);
    grid.addEventListener('click', onGridClick);

    const existing = document.getElementById(CELL_ID);
    if (existing && existing.parentElement === grid) {
      paint();
      return true;
    }
    if (existing) existing.remove();

    const cell = build();
    /* 放在「敬请期待」占位卡之前；没有占位卡就追加到末尾 */
    const placeholder = [...grid.querySelectorAll('.appearance-card-cell')].find((c) =>
      /敬请期待/.test(c.textContent || '')
    );
    if (placeholder) grid.insertBefore(cell, placeholder);
    else grid.appendChild(cell);

    paint();
    return true;
  };

  ensure();
  /* 观察 document.body 而不是 .settings-modal__content：切主题会让 React
     整棵重建，挂在旧节点上的 observer 会跟着失效，卡片就再也补不回来。 */
  const observer = new MutationObserver(() => ensure());
  observer.observe(document.body, { childList: true, subtree: true });
  /* 再兜一层定时检查（便宜）：卡片不在就补，在了就什么都不做 */
  const timer = setInterval(() => {
    if (!document.getElementById(CELL_ID)) ensure();
  }, 1200);

  paint();

  return {
    mode: readMode(),
    mounted: !!document.getElementById(CELL_ID),
    setMode,
    destroy() {
      observer.disconnect();
      clearInterval(timer);
      const grid = document.querySelector(GRID_SEL);
      if (grid) grid.removeEventListener('click', onGridClick);
      document.getElementById(CELL_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
})();
