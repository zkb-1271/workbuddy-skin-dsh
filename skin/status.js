/* ============================================================
   会话行状态点
   · 去掉运行中的绿色旋转齿轮（原生 trailingStatus）
   · 改成右侧一个小圆点：
       green  = 已完成且没点开过（原生 unread）
      red    = 失败
   等确认 / 等权限**不出点**（用户要求：那个橙色小点看着像告警，去掉）
     运行中不显示点（用户要求只保留这三种）
   ------------------------------------------------------------
   状态来源是组件 props，不是猜类名：
   卡片组件的 memoizedProps 里有 `statusText`（"执行中" / "已完成" / …）
   和 `showUnreadDot`（= unread && !running）。React 没给出更细的字段，
   所以按文案归类；文案变了只改 classify() 里的三个正则。
   ============================================================ */
window.__wbdsStatus?.destroy?.();

window.__wbdsStatus = (() => {
  const ATTR = 'data-wbds-status';
  const ROW_SEL = '.conversation-item';

  const stats = { rows: 0, green: 0, yellow: 0, red: 0 };

  /* 从 DOM 节点上取 React fiber 的 memoizedProps */
  const propsOf = (card) => {
    const k = Object.keys(card).find((x) => x.startsWith('__reactFiber$'));
    if (!k) return null;
    let f = card[k];
    for (let i = 0; i < 6 && f; i++) {
      const p = f.memoizedProps;
      if (p && p.dataConversationId !== undefined) return p;
      f = f.return;
    }
    return null;
  };

  /* 取颜色色相，用来判断原生尾部图标是红/黄/绿系 */
  const hueOf = (css) => {
    const m = String(css || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (!d) return null;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  };

  /* 归类：失败 > 待确认 > 未读。运行中返回 null（不出点）
     判断依据按可靠度排序：
       1) statusClassName（status-error / status-warning）
       2) statusText 文案（"执行中" / "已完成" / …）
       3) showUnreadDot —— 原生就是 unread && !running
       4) 尾部图标的颜色（原生对失败/待确认会画非旋转的状态图标） */
  const classify = (p, row) => {
    if (!p) return null;
    const cls = String(p.statusClassName || '');
    const text = String(p.statusText || '');
    if (/status-error/.test(cls)) return 'red';
    if (/status-warning/.test(cls)) return null;   /* 待确认/等权限：不出点 */
    if (/失败|错误|出错|异常|终止|中断|中止/.test(text)) return 'red';
    if (/等待|待确认|待授权|确认|权限|审核|阻塞|排队/.test(text)) return null;
    /* 未读：props 是主信号，DOM 里那个原生未读点作为兜底
       （props 字段名换了的时候还能靠它） */
    if (p.showUnreadDot) return 'green';
    if (row.querySelector('[class*="unreadDot"]')) return 'green';

    const svg = row.querySelector('[class*="trailingStatus"] svg');
    if (svg && !svg.classList.contains('wb-icon--spin')) {
      const h = hueOf(getComputedStyle(svg).color);
      if (h !== null) {
        if (h >= 330 || h <= 20) return 'red';
        if (h > 20 && h < 65) return null;   /* 黄系状态图标也不再补点 */
      }
    }
    return null;
  };

  /* 运行中的行：原生把时间换成齿轮，齿轮被藏掉后那一格就空了。
     这里补一个灰色小齿轮（旋转动画），把节奏补齐。
     一旦原生又渲染出时间（行结束），就把我们补的这个撤掉。 */
  const LABEL_CLS = 'wbds-row-state';
  /* 齿轮 = 原生运行图标的同一枚（16×16 辐条齿轮，fill currentColor），
     这里只把颜色换成灰色，转动由 main.css 的 wbds-gear-spin 驱动 */
  const GEAR_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path transform="matrix(1 0 0 1 2.07097 1.5)" fill-rule="evenodd" d="M6.529 0L6.529 4L5.329 4L5.329 0L6.529 0ZM8.394 5.7697L11.8581 3.7697L11.258 2.7305L7.7939 4.7305L8.394 5.7697ZM3.4641 5.7698L0 3.7698L0.6 2.7305L4.0641 4.7305L3.4641 5.7698ZM7.7939 8.2697L11.258 10.2697L11.8581 9.2305L8.394 7.2305L7.7939 8.2697ZM4.0641 8.2697L0.6 10.2697L0 9.2305L3.4641 7.2305L4.0641 8.2697ZM6.529 9L6.529 13L5.329 13L5.329 9L6.529 9Z"></path></svg>';
  const syncRunningLabel = (row, props) => {
    const wrap = row.querySelector('.cb-agent-card__time-wrapper');
    const hasTime = !!row.querySelector('[class*="timeContainer"]');
    const hasTrailing = !!row.querySelector('[class*="trailingStatus"]');
    let mine = row.querySelector('.' + LABEL_CLS);

    if (!wrap || hasTime || !hasTrailing) {
      if (mine) mine.remove();
      return;
    }
    const raw = String(props && props.statusText ? props.statusText : '');
    /* 判定"在跑"不能只看 statusText：一轮对话进行中时，statusText 还是
       上一轮的"已完成"，真正可靠的信号是那个旋转图标还在。
       旋转图标在 = 这一轮还没结束 → 补灰色齿轮。 */
    const spinning = !!row.querySelector('[class*="trailingStatus"] svg.wb-icon--spin');
    const runningText = /执行中|运行|进行|规划/.test(raw);
    if (!spinning && !runningText) {
      if (mine) mine.remove();
      return;
    }
    if (!mine) {
      mine = document.createElement('span');
      mine.className = LABEL_CLS;
      mine.innerHTML = GEAR_SVG;
      wrap.insertBefore(mine, wrap.firstChild);
    }
  };

  /* ---------- 首页模式切换：把原生的分段控件换成一个下拉 chip ----------
     原生是 办公/开发/设计 三个按钮；目标样式是「当前模式 ⌄」的小 chip，
     点开一个带说明的菜单，选中项打勾。切换动作通过真实事件序列
     打到原生的分段按钮上，让 React 自己更新状态。 */
  const MODE_ROOT = 'wbds-mode-root';
  const MODE_MENU = 'wbds-mode-menu';
  const fireClick = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...o, button: 0, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...o, button: 0 }));
  };
  const caretSvg = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
  const checkSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-6.5"/></svg>';

  const closeModeMenu = () => {
    const m = document.getElementById(MODE_MENU);
    if (m) m.classList.remove('open');
  };
  document.addEventListener('click', (e) => {
    if (!e.target || !e.target.closest || !e.target.closest('.wbds-mode-root')) closeModeMenu();
  }, true);

  let fixedChips = null;
  const resetFixedChips = () => {
    if (!fixedChips) return;
    for (const b of fixedChips) {
      b.style.position = '';
      b.style.left = '';
      b.style.top = '';
      b.style.zIndex = '';
    }
    fixedChips = null;
  };

  /* 只把「选择工作空间」提到顶部 chip 行（对应参考图的 Desktop ⌄）。
     「允许完全访问」首页时钉到 + 按钮右边（用户指定）；
     会话页里它本来就在 + 旁边（cr-input-toolbar__left），不动。
     判定依据：首页的权限按钮挂在 .cr-input-footer 里，会话页不在。 */
  const clearPin = (btn) => {
    if (!btn) return;
    btn.style.position = '';
    btn.style.left = '';
    btn.style.top = '';
    btn.style.zIndex = '';
  };
  const syncTopChips = (root) => {
    const ws = document.querySelector('.cr-input-footer .cr-workspace-picker');
    const acc = document.querySelector('.cr-input-footer .cr-permission-setting');
    /* 不在 footer 里的权限按钮（会话页 / 换页残留）：清掉我们可能写过的内联样式 */
    document.querySelectorAll('.cr-permission-setting').forEach((b) => {
      if (b !== acc) clearPin(b);
    });
    if (!ws) { resetFixedChips(); chipRefs = null; return; }
    fixedChips = [ws];

    /* 记住引用，坐标交给 followChips() 每帧跟随 ——
       用 2 秒一次的 pass 算坐标，布局一变就会出现高度差/错位 */
    chipRefs = { ws, acc, root };
  };

  /* 每帧跟随：把「选择工作空间」钉在模式 chip 同一行，
     首页再把「允许完全访问」钉到 + 按钮右边 */
  let chipRefs = null;
  const followChips = () => {
    if (!chipRefs) return;
    const { ws, acc, root } = chipRefs;
    if (!root.isConnected) { chipRefs = null; return; }
    const rr = root.getBoundingClientRect();
    if (rr.width === 0) return;
    const set = (btn, left, top) => {
      btn.style.position = 'fixed';
      btn.style.left = Math.round(left) + 'px';
      btn.style.top = Math.round(top) + 'px';
      btn.style.zIndex = '30';
    };
    /* fixed 的基准是带 transform 的 grid item（原点随布局移动），
       量一次实际位置把差值补回来 */
    const place = (btn, left, top) => {
      set(btn, left, top);
      const d = btn.getBoundingClientRect();
      if (Math.abs(d.x - left) > 1) btn.style.left = Math.round(left - (d.x - left)) + 'px';
      const dy = d.y - top;
      if (Math.abs(dy) > 1) btn.style.top = Math.round(parseFloat(btn.style.top) - dy) + 'px';
    };
    const centerTop = (btn, refY, refH) =>
      refY + (refH - btn.getBoundingClientRect().height) / 2;

    place(ws, rr.x, centerTop(ws, rr.y, rr.height));
    const chip = root.querySelector('.wbds-mode-chip');
    if (chip) {
      chip.style.position = 'absolute';
      chip.style.top = '50%';
      chip.style.transform = 'translateY(-50%)';
      chip.style.left = Math.round(ws.getBoundingClientRect().width + 8) + 'px';
    }
    /* 权限按钮 → + 右边（+.right + 8，与 + 垂直居中） */
    if (acc && acc.isConnected) {
      const add = document.querySelector('.cr-add-menu');
      if (add) {
        const ar = add.getBoundingClientRect();
        if (ar.width > 0) place(acc, ar.x + ar.width + 8, centerTop(acc, ar.y, ar.height));
      }
    }
  };

  const syncModeChip = () => {
    /* chip 要插进 .wb-scene-tabs 的**外层**无类名 div ——
       插进 tabs 本身会跟着它一起被 display:none 藏掉 */
    const tabs = document.querySelector('.wb-scene-tabs');
    const seg = tabs ? tabs.querySelector('.wb-segmented') : null;
    const wrap = tabs ? tabs.parentElement : null;
    const stale = [...document.querySelectorAll('.' + MODE_ROOT)];
    if (!seg || !wrap) {
      stale.forEach((e) => e.remove());
      resetFixedChips();
      return;
    }
    stale.forEach((e) => { if (e.parentElement !== wrap) e.remove(); });

    const items = [...seg.querySelectorAll('.wb-segmented__item')].map((el) => ({
      el,
      name: (el.innerText || '').trim(),
      selected: /selected/.test(el.className) || el.getAttribute('aria-checked') === 'true',
    }));

    let root = wrap.querySelector('.' + MODE_ROOT);
    if (!root) {
      root = document.createElement('div');
      root.className = MODE_ROOT;
      wrap.insertBefore(root, seg.parentElement === wrap ? seg : wrap.firstChild);
    }

    const current = items.find((x) => x.selected);
    const label = current ? current.name : (items[0] ? items[0].name : '');

    let chip = root.querySelector('.wbds-mode-chip');
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wbds-mode-chip';
      root.appendChild(chip);
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById(MODE_MENU);
        if (menu) menu.classList.toggle('open');
      });
    }
    const wantLabel = label + caretSvg;
    if (chip.__label !== wantLabel) {
      chip.__label = wantLabel;
      chip.innerHTML = '<span class="wbds-mode-chip-text"></span>' + caretSvg;
      chip.querySelector('.wbds-mode-chip-text').textContent = label;
    }

    let menu = root.querySelector('.wbds-mode-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'wbds-mode-menu';
      menu.id = MODE_MENU;
      root.appendChild(menu);
    }
    // 菜单内容只在条目变化时重建，避免每次 pass 都打断交互
    const sig = items.map((x) => x.name + (x.selected ? '*' : '')).join('|');
    if (menu.__sig !== sig) {
      menu.__sig = sig;
      menu.innerHTML = '';
      for (const it of items) {
        const row = document.createElement('div');
        row.className = 'wbds-mode-item';
        const name = document.createElement('span');
        name.textContent = it.name;
        row.appendChild(name);
        if (it.selected) {
          const c = document.createElement('span');
          c.className = 'wbds-mode-check';
          c.innerHTML = checkSvg;
          row.appendChild(c);
        }
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          fireClick(it.el);
          closeModeMenu();
        });
        menu.appendChild(row);
      }
    }
    syncTopChips(root);
  };

  /* 首页大标题文案：换成「探索未至之境」（用户指定）。
     React 重渲染会写回原文案，所以放在 pass 里随观察器/轮询持续纠正。 */
  const HOME_TITLE = '探索未至之境';
  const syncHomeTitle = () => {
    const t = document.querySelector('.wb-home-header__title');
    if (!t || t.textContent === HOME_TITLE) return;
    /* 不能用 textContent 赋值 —— 会把 React 持有的文本节点销毁，
       React 下次更新时再 append 一个，标题就变成「探探索未至之境」这种重影。
       只改原文本节点的 nodeValue，节点引用不动。 */
    /* 标题的文本不在 h1 直接子级，而是包在一层元素里 —— 往里找到文本节点再改 */
    const inner = t.querySelector('*') || t;
    const tn = [...inner.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (tn) tn.nodeValue = HOME_TITLE;
  };

  let running = false;
  const pass = () => {
    if (running) return stats;
    running = true;
    try {
      const on = document.documentElement.getAttribute('data-wbskin') === 'dsh';
      const rows = [...document.querySelectorAll(ROW_SEL)];
      stats.rows = rows.length;
      stats.green = stats.yellow = stats.red = 0;

      if (!on) {
        rows.forEach((r) => r.removeAttribute(ATTR));
        return stats;
      }

      syncHomeTitle();
      syncModeChip();

      for (const row of rows) {
        const card = row.querySelector('[role="button"]');
        if (!card) continue;
        const props = propsOf(card);
        syncRunningLabel(row, props);
        const state = classify(props, row);
        if (state) {
          if (row.getAttribute(ATTR) !== state) row.setAttribute(ATTR, state);
          stats[state] += 1;
        } else if (row.hasAttribute(ATTR)) {
          row.removeAttribute(ATTR);
        }
      }
      return stats;
    } finally {
      running = false;
    }
  };

  /* DOM 变化 + 定时兜底：状态变化不一定引起 DOM 结构变化，
     所以除了 MutationObserver 还要低频轮询一次 */
  const start = () => {
    pass();
    const loop = () => { followChips(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    let queued = false;
    const obs = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        pass();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });

    const timer = setInterval(pass, 2000);

    const destroy = () => {
      obs.disconnect();
      clearInterval(timer);
      document.querySelectorAll(ROW_SEL).forEach((r) => r.removeAttribute(ATTR));
      document.querySelectorAll('.' + LABEL_CLS).forEach((e) => e.remove());
    };

    return { destroy };
  };

  const { destroy } = start();

  return { pass, destroy, stats: () => ({ ...stats }) };
})();
