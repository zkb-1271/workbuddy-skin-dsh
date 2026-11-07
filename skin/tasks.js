/**
 * WorkBuddy · dsh 皮肤 · 「任务」分组默认显示 4 条
 *
 * 原生折叠时只渲染 2 条（不是 CSS 藏的），所以改 CSS 没用，得先让原生
 * 展开，再由我们把第 5 条往后收起来，并接管「查看更多 / 收起」这一行。
 *
 * 做法：
 *   1. 首次看到折叠态（行文案里没有「收起」）→ 点一次原生的「查看更多」，
 *      让 React 把条目渲染出来（用 sessionStorage 防重复点击）。
 *   2. 非归档条目按顺序编号，超过 LIMIT 的统一打 data-wbds-over 由 CSS 藏掉。
 *   3. 原生那行「查看更多 (N) / 收起」隐藏，换成我们自己的行：
 *      收起态显示「查看更多 (剩余)」，展开态显示「收起」。
 *   4. 展开时如果原生还有「查看更多 (n)」在，顺手点一下把剩下的加载完。
 *
 * 归档条目（data-wbds-archived）不参与计数 —— 那是 archive.js 藏掉的。
 */
window.__wbdsTasks?.destroy?.();

window.__wbdsTasks = (() => {
  const LIMIT = 4;
  const ROW_CLS = 'wbds-tasks-more';
  const FLAG = 'wbds.tasks.expanded.once';
  const BLOCK_SEL = '.conversation-tasks-independent-block';

  const click = (el) => {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...o, button: 0, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...o, button: 0 }));
  };

  /* 把「查看更多 / 收起」摆到它该在的位置。
     ⚠️ 不能只 append 一次就算完：React 增量渲染会用 insertBefore 往块里插条目，
     我们 append 的节点会被一路挤到块的最前面（表现为「查看更多」跑到列表上方）。
     归档改成真删除后列表条目会频繁增删，这个问题才暴露出来。 */
  const placeRow = (row, items, expanded) => {
    if (!items.length) return;
    const anchor = expanded ? items[items.length - 1] : items[Math.min(LIMIT, items.length) - 1];
    if (anchor && row.previousElementSibling !== anchor) anchor.after(row);
  };

  const ensureRow = (block) => {
    let row = block.querySelector('.' + ROW_CLS);
    if (!row) {
      row = document.createElement('div');
      row.className = ROW_CLS;
      row.addEventListener('click', () => {
        block.dataset.wbdsExpanded = block.dataset.wbdsExpanded === '1' ? '' : '1';
        pass();
      });
      block.appendChild(row);
    }
    return row;
  };

  let running = false;
  const pass = () => {
    if (running) return;
    running = true;
    try {
      const on = document.documentElement.getAttribute('data-wbskin') === 'dsh';
      const blocks = [...document.querySelectorAll(BLOCK_SEL)];
      if (!on) {
        blocks.forEach((b) => {
          b.querySelector('.' + ROW_CLS)?.remove();
          delete b.dataset.wbdsExpanded;
          b.querySelectorAll('[data-wbds-over]').forEach((el) => el.removeAttribute('data-wbds-over'));
        });
        return;
      }
      for (const block of blocks) {
        const nativeRow = block.querySelector('.conversation-show-more-row');
        const nativeText = nativeRow ? nativeRow.innerText.replace(/\s+/g, ' ').trim() : '';
        const expandedNatively = /收起/.test(nativeText);

        /* 1. 折叠态 → 先让原生把条目渲染出来（只自动点一次，避免和用户手动收起打架） */
        if (nativeRow && !expandedNatively && !sessionStorage.getItem(FLAG)) {
          const btn = block.querySelector('.conversation-show-more-button');
          if (btn) {
            sessionStorage.setItem(FLAG, '1');
            click(btn);
            running = false;
            return; /* 等 React 渲染完，下个 tick 再处理 */
          }
        }

        /* 1.5 原生还有「查看更多 (n)」批次 → 全部加载完，数字才准 */
        if (nativeRow) {
          const moreBtn = nativeRow.querySelector('.conversation-show-more-button');
          const moreText = moreBtn ? moreBtn.innerText.replace(/\s+/g, ' ') : '';
          const pending = /查看更多\s*[（(]\d+/.test(moreText);
          if (pending && !block.dataset.wbdsLoading) {
            block.dataset.wbdsLoading = '1';
            click(moreBtn);
            setTimeout(() => {
              delete block.dataset.wbdsLoading;
              pass();
            }, 700);
            running = false;
            return;
          }
        }

        /* 2. 计数（跳过归档和我们自己收起来的） */
        const items = [...block.children].filter(
          (c) => c.classList.contains('conversation-item') && !c.hasAttribute('data-wbds-archived')
        );
        const expanded = block.dataset.wbdsExpanded === '1';
        items.forEach((el, i) => {
          const over = !expanded && i >= LIMIT ? '1' : '';
          if ((el.getAttribute('data-wbds-over') || '') !== over) {
            if (over) el.setAttribute('data-wbds-over', '1');
            else el.removeAttribute('data-wbds-over');
          }
        });

        /* 3. 原生那行藏掉，换我们自己的 */
        if (nativeRow) nativeRow.style.display = 'none';

        const row = ensureRow(block);
        const hidden = Math.max(0, items.length - LIMIT);
        if (!hidden && !expanded) {
          row.style.display = 'none';
          continue;
        }
        row.style.display = '';
        const label = expanded ? '收起' : `查看更多 (${hidden})`;
        if (row.textContent.trim() !== label) row.textContent = label;
        placeRow(row, items, expanded);

      }
    } finally {
      running = false;
    }
  };

  pass();
  /* 250ms：React 重渲染会重建条目（丢掉 data-wbds-over），
     间隔太长会出现「全部展开」的闪动 */
  const timer = setInterval(pass, 250);

  return {
    pass,
    destroy() {
      clearInterval(timer);
      document.querySelectorAll('.' + ROW_CLS).forEach((el) => el.remove());
      document.querySelectorAll('[data-wbds-over]').forEach((el) => el.removeAttribute('data-wbds-over'));
      document.querySelectorAll(BLOCK_SEL).forEach((b) => {
        delete b.dataset.wbdsExpanded;
        delete b.dataset.wbdsLoadingMore;
        const row = b.querySelector('.conversation-show-more-row');
        if (row) row.style.display = '';
      });
      sessionStorage.removeItem(FLAG);
    },
  };
})();
