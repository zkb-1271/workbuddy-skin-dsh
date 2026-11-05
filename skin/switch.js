/**
 * WorkBuddy · dsh 皮肤 —— 设置页「界面风格」开关
 *
 * 设计要点：
 * 1. 皮肤样式（settings.css）全部挂在 :root[data-wbskin="dsh"] 下，
 *    所以「切回原生」= 摘掉这个属性，不需要卸载 style 标签。
 * 2. 开关自身的样式**不带** data-wbskin 前缀，否则切到原生后开关自己也变样、
 *    会出现「切过去切不回来」。样式由本文件自带，自包含。
 * 3. 状态写 localStorage，不碰 WorkBuddy 官方配置结构。
 */

window.__wbdsSwitch = (() => {
  const LS_KEY = 'wbds.skin.mode';
  const MODE_DSH = 'dsh';
  const MODE_NATIVE = 'native';
  const ROW_ID = 'wbds-style-row';
  const STYLE_ID = 'wbds-control-style';

  /* ---------- 开关控件样式（无命名空间前缀） ---------- */
  const CONTROL_CSS = `
  #${ROW_ID} {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    /* 外观页正文是 flex 列容器，不加这行会被压扁 */
    flex: 0 0 auto;
    min-height: 44px;
    padding: 20px 0 16px;
    margin-bottom: 16px;
    border-bottom: 0.5px solid rgba(0, 0, 0, 0.102);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue",
                 "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  #${ROW_ID} .wbds-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  #${ROW_ID} .wbds-title {
    font-size: 14px; font-weight: 500; line-height: 22px; color: #0f1115;
  }
  #${ROW_ID} .wbds-desc {
    font-size: 12px; font-weight: 400; line-height: 18px; color: #81858c;
  }
  #${ROW_ID} .wbds-opts { display: flex; gap: 8px; flex-shrink: 0; }
  #${ROW_ID} button {
    height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    background-color: #f5f6f7;
    color: #0f1115;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
    -webkit-appearance: none;
    appearance: none;
  }
  #${ROW_ID} button:hover { background-color: #eceef2; }
  #${ROW_ID} button[aria-pressed="true"] {
    background-color: #0f1115;
    color: #ffffff;
  }
  `;

  /* ---------- 状态 ---------- */
  const readMode = () => {
    try {
      return localStorage.getItem(LS_KEY) === MODE_NATIVE ? MODE_NATIVE : MODE_DSH;
    } catch {
      return MODE_DSH;
    }
  };

  const paint = (mode) => {
    if (mode === MODE_DSH) {
      document.documentElement.setAttribute('data-wbskin', 'dsh');
    } else {
      document.documentElement.removeAttribute('data-wbskin');
    }
    document.querySelectorAll(`#${ROW_ID} button`).forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
  };

  const setMode = (mode) => {
    try { localStorage.setItem(LS_KEY, mode); } catch {}
    paint(mode);
  };

  /* ---------- 构建 ---------- */
  const build = () => {
    const row = document.createElement('div');
    row.id = ROW_ID;
    row.innerHTML = `
      <div class="wbds-copy">
        <span class="wbds-title">界面风格</span>
        <span class="wbds-desc">切换后立即生效，选择会被记住。</span>
      </div>
      <div class="wbds-opts">
        <button type="button" data-mode="native">WorkBuddy 原生</button>
        <button type="button" data-mode="dsh">dsh 风格</button>
      </div>
    `;
    row.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setMode(b.dataset.mode);
      });
    });
    return row;
  };

  /* 外观页才挂：优先放在「全部主题」标题之前 */
  const ensure = () => {
    // 每次都刷新样式内容，避免改了 CSS 但旧 style 标签留着不更新
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    if (st.textContent !== CONTROL_CSS) st.textContent = CONTROL_CSS;

    // 幂等：已存在就只同步按钮状态，绝不重建 —— 重建会再次触发
    // MutationObserver，形成「插入→触发→再插入」的死循环，把渲染进程拖死。
    if (document.getElementById(ROW_ID)) {
      paint(readMode());
      return true;
    }

    const listHeader = document.querySelector('.appearance-list__header');
    const body = document.querySelector('.appearance-panel__body');
    if (listHeader && listHeader.parentElement) {
      listHeader.parentElement.insertBefore(build(), listHeader);
      paint(readMode());
      return true;
    }
    if (body) {
      body.insertBefore(build(), body.firstChild);
      paint(readMode());
      return true;
    }
    return false;
  };

  /* 页面是 React 渲染的，切页会重建 DOM，需要持续补挂 */
  ensure();
  const host = document.querySelector('.settings-modal__content') || document.body;
  if (!window.__wbdsObserver) {
    window.__wbdsObserver = new MutationObserver(() => ensure());
    window.__wbdsObserver.observe(host, { childList: true, subtree: true });
  }

  // 首次加载按存储值恢复，保证重启后保持上次选择
  paint(readMode());

  return {
    mode: readMode(),
    mounted: !!document.getElementById(ROW_ID),
    hasSkin: document.documentElement.getAttribute('data-wbskin'),
  };
})();
