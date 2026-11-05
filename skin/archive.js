/* ============================================================
   会话行归档 —— 学 zcode 的两段式交互
   · 悬停行 → 右侧出现归档图标
   · 点一下图标 → 变成「确认」小药丸
   · 再点一下 → 真正归档（4 秒不点自动退回图标）
   · 对话的其他设置走右键菜单（WorkBuddy 原生右键就弹同一个菜单）

   归档写的是原生自己的键 `genie-archived-session-ids`：
   LocalAgentProvider.archive(id) 做的事就是把 id 加进这个 Set 写回
   localStorage，列表在 filters 不含 archived 时用 `!r.has(e.id)` 过滤掉。
   所以直接写这个键 == 走原生归档，只是省掉了那个二次确认弹窗
   （确认动作已经由「确认」按钮承担）。

   ⚠️ 按钮挂在 React 自己的节点（.conversation-item）里，随时可能被重渲染丢掉。
   所以「待确认」状态绝不能存在 DOM 上，必须放在外面的 pending Map 里，
   按钮重建时再补回来 —— 否则鼠标一动、行一重渲染，确认态就没了。
   ============================================================ */
window.__wbdsArchive?.destroy?.();   // 重注入先拆旧实例，否则监听器与 pending 会堆叠

window.__wbdsArchive = (() => {
  const KEY = 'genie-archived-session-ids';
  const ROW_SEL = '.conversation-item';
  const BTN_CLS = 'wbds-arc';
  const CONFIRM_MS = 4000;

  /* 原生「归档」菜单项里的图标（16×16，filled），保持一致 */
  const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path transform="translate(1, 1.5)" d="M10.25 0C10.9467 0 11.2952 0 11.585 0.0576C12.775 0.2943 13.7057 1.225 13.9424 2.415C14 2.7048 14 3.0533 14 3.75C14 3.9823 13.9997 4.0987 13.9805 4.1953L13.9404 4.3398C13.8227 4.6658 13.5422 4.9114 13.1953 4.9805L13.0234 4.998L12.75 5L2.2002 5L2.2002 7C2.2002 8.4479 2.2023 9.4135 2.2988 10.1318C2.3908 10.8155 2.5484 11.0932 2.7275 11.2725C2.9068 11.4516 3.1844 11.6083 3.8682 11.7002C4.5866 11.7968 5.5519 11.7998 7 11.7998C8.4481 11.7998 9.4134 11.7968 10.1318 11.7002C10.8156 11.6083 11.0932 11.4516 11.2725 11.2725C11.4516 11.0932 11.6092 10.8155 11.7012 10.1318C11.7977 9.4135 11.7998 8.4479 11.7998 7L11.7998 6.1992L13 6.1992L13 7L12.998 7.9961C12.986 10.1734 12.8898 11.3523 12.1211 12.1211C11.2424 12.9997 9.8283 13 7 13L6.0039 12.998C3.9817 12.9869 2.8209 12.9031 2.0498 12.2754L1.8789 12.1211C1.1102 11.3523 1.014 10.1734 1.002 7.9961L1 7L1 4.9971C0.9179 4.9949 0.8582 4.9911 0.8047 4.9805C0.4578 4.9114 0.1773 4.6658 0.0596 4.3398L0.0195 4.1953C0.0003 4.0987 0 3.9823 0 3.75C0 3.2271 0.0001 2.9004 0.0244 2.6475L0.0576 2.415C0.2795 1.2995 1.1109 0.4121 2.1943 0.1104L2.415 0.0576C2.5599 0.0288 2.7194 0.014 2.9297 0.0068L3.75 0L10.25 0ZM9 7.5996L5 7.5996L5 6.4004L9 6.4004L9 7.5996ZM3.75 1.2002C2.9955 1.2002 2.7931 1.2056 2.6484 1.2344C1.9347 1.3765 1.3765 1.9347 1.2344 2.6484C1.2056 2.7931 1.2002 2.9955 1.2002 3.75C1.2002 3.7677 1.2002 3.7842 1.2002 3.7998L12.7998 3.7998C12.7998 3.7842 12.7998 3.7677 12.7998 3.75C12.7998 2.9955 12.7944 2.7931 12.7656 2.6484C12.6235 1.9347 12.0653 1.3765 11.3516 1.2344C11.2069 1.2056 11.0045 1.2002 10.25 1.2002L3.75 1.2002Z"/></svg>`;

  /* 待确认状态：conversationId → 到期时间戳。放在 DOM 之外，抗 React 重渲染 */
  const pending = new Map();
  const stats = { rows: 0, buttons: 0, archived: 0, lastArchive: null };

  /* ---------- 原生归档集合 ---------- */
  const readSet = () => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  };
  const writeSet = (set) => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...set]));
      return true;
    } catch {
      return false;
    }
  };

  /* ---------- 图标态 / 确认态 ---------- */
  const toIcon = (btn) => {
    btn.classList.remove('wbds-arc--confirm');
    btn.removeAttribute('data-state');
    btn.innerHTML = ICON;
    btn.title = '归档';
    btn.setAttribute('aria-label', '归档');
  };

  const toConfirm = (btn) => {
    btn.classList.add('wbds-arc--confirm');
    btn.textContent = '确认';
    btn.title = '确认归档';
    btn.setAttribute('aria-label', '确认归档');
  };

  const findBtn = (id) =>
    document.querySelector(`.conversation-item[data-conversation-id="${id}"] .${BTN_CLS}`);

  /* ---------- 归档 ---------- */
  const archiveRow = (row) => {
    const id = row.getAttribute('data-conversation-id');
    if (!id) return;
    const set = readSet();
    set.add(id);
    writeSet(set);
    pending.delete(id);

    // 立即从列表消失；原生下次拉列表时会用自己的过滤接管
    row.setAttribute('data-wbds-archived', '1');
    const btn = row.querySelector('.' + BTN_CLS);
    if (btn) toIcon(btn);

    stats.archived = set.size;
    stats.lastArchive = id;
  };

  /* ---------- 事件 ---------- */
  const onBtnClick = (e, row, btn) => {
    // 不能冒泡到会话卡片（那会顺带切到这条对话）
    e.preventDefault();
    e.stopPropagation();

    const id = row.getAttribute('data-conversation-id') || '';
    const until = pending.get(id);
    if (until && until > Date.now()) {
      archiveRow(row);
      return;
    }
    pending.set(id, Date.now() + CONFIRM_MS);
    toConfirm(btn);
    setTimeout(() => {
      const t = pending.get(id);
      if (t && t <= Date.now()) {
        pending.delete(id);
        const cur = findBtn(id);
        if (cur) toIcon(cur);
      }
    }, CONFIRM_MS + 30);
  };

  const attach = (row) => {
    const id = row.getAttribute('data-conversation-id') || '';
    let btn = row.querySelector('.' + BTN_CLS);
    if (btn && !btn.__wbdsOwned) {
      // 别的（旧）实例留下的按钮：换成自己的，避免处理器串台
      btn.remove();
      btn = null;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BTN_CLS;
      toIcon(btn);
      btn.addEventListener('click', (e) => onBtnClick(e, row, btn));
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach((t) =>
        btn.addEventListener(t, (e) => e.stopPropagation())
      );
      btn.__wbdsOwned = true;
      row.appendChild(btn);
    }
    // 重建出来的按钮要把待确认状态补回去，否则一点就丢
    const until = pending.get(id);
    if (until && until > Date.now()) {
      if (!btn.classList.contains('wbds-arc--confirm')) toConfirm(btn);
    } else if (btn.classList.contains('wbds-arc--confirm')) {
      toIcon(btn);
    }
  };

  /* ---------- 空间空壳 ----------
     空间下的会话全被归档后，原生只隐藏会话行，空间标题还留着（34px 空壳），
     看起来像「删了还在」。这里把这类只剩头的空间整块收掉，
     并把「空间 (N)」的数字同步成可见数量。 */
  const syncEmptySpaces = () => {
    const groups = document.querySelector('.conversation-section-groups');
    if (!groups) return;
    /* 空间块在 .conversation-section-content 里面，不是直接子级 */
    const secs = [...groups.querySelectorAll('.collapsible-section')];
    if (!secs.length) return;
    let hidden = 0;
    for (const sec of secs) {
      const items = [...sec.querySelectorAll('.conversation-item')];
      const shown = items.filter((el) => !el.hasAttribute('data-wbds-archived'));
      const empty = items.length > 0 && shown.length === 0;
      if (empty) { sec.setAttribute('data-wbds-empty', '1'); hidden++; }
      else sec.removeAttribute('data-wbds-empty');
    }
    syncGroupsCount(secs.length - hidden);
  };

  /* 计数文案用文本节点改，别用 textContent（会造出重影） */
  const syncGroupsCount = (visibleCount) => {
    const label = document.querySelector('.conversation-section-groups .conversation-section-label-text');
    if (!label) return;
    const tn = [...label.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.textContent));
    if (!tn) return;
    const want = tn.textContent.replace(/\(\d+\)/, '(' + visibleCount + ')');
    if (tn.nodeValue !== want) tn.nodeValue = want;
  };

  /* ---------- 主流程 ---------- */
  let running = false;
  const pass = () => {
    if (running) return stats;
    running = true;
    try {
      document.getElementById('wbds-toast')?.remove();
      const on = document.documentElement.getAttribute('data-wbskin') === 'dsh';
      const rows = [...document.querySelectorAll(ROW_SEL)];
      stats.rows = rows.length;

      if (!on) {
        // 关掉皮肤时把注入物全部撤掉，保证与原生一致
        document.querySelectorAll('.' + BTN_CLS).forEach((b) => b.remove());
        rows.forEach((r) => r.removeAttribute('data-wbds-archived'));
        document.querySelectorAll('[data-wbds-empty]').forEach((el) => el.removeAttribute('data-wbds-empty'));
        pending.clear();
        stats.buttons = 0;
        return stats;
      }

      const archived = readSet();
      stats.archived = archived.size;
      for (const row of rows) {
        const id = row.getAttribute('data-conversation-id');
        if (id && archived.has(id)) row.setAttribute('data-wbds-archived', '1');
        else row.removeAttribute('data-wbds-archived');
        attach(row);
      }
      stats.buttons = document.querySelectorAll('.' + BTN_CLS).length;
      syncEmptySpaces();
      return stats;
    } finally {
      running = false;
    }
  };

  /* 点别处 / Esc / 滚动 → 取消所有待确认 */
  const cancelAll = () => {
    if (!pending.size) return;
    const ids = [...pending.keys()];
    pending.clear();
    for (const id of ids) {
      const btn = findBtn(id);
      if (btn) toIcon(btn);
    }
  };
  const onDocClick = (e) => {
    if (!e.target || !e.target.closest || !e.target.closest('.' + BTN_CLS)) cancelAll();
  };
  const onDocKey = (e) => {
    if (e.key === 'Escape') cancelAll();
  };
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onDocKey);
  /* 注意：**不要**监听 scroll 去取消确认 —— scroll 事件的捕获监听连
     任意子容器的滚动都会触发（消息区自动滚动非常频繁），实测会在
     点完图标后立刻把确认态清掉。只留 click-outside / Esc / 超时。 */

  /* 观察用 rAF 合并：按钮会被 React 重建，要尽快补回，不能用大延迟 */
  const start = () => {
    pass();
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
    window.__wbdsArchiveObserver = obs;
  };

  start();

  const destroy = () => {
    window.__wbdsArchiveObserver?.disconnect();
    window.__wbdsArchiveObserver = null;
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onDocKey);
    document.querySelectorAll('.' + BTN_CLS).forEach((b) => b.remove());
    document.querySelectorAll(ROW_SEL).forEach((r) => r.removeAttribute('data-wbds-archived'));
    document.querySelectorAll('[data-wbds-empty]').forEach((el) => el.removeAttribute('data-wbds-empty'));
    pending.clear();
  };

  return {
    pass,
    cancelAll,
    destroy,
    stats: () => ({ ...stats, pending: [...pending.keys()], archivedIds: [...readSet()] }),
  };
})();
