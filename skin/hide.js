/**
 * WorkBuddy · dsh 皮肤 · 精简界面（隐藏指定入口）
 *
 * 做法：用 JS 按文本/选择器给目标元素打 data-wbds-hide 标记，
 * 再由一条 CSS 统一 display:none。这样 React 重渲染换了节点也能自动补上。
 *
 * 安全性要点：
 *  · 只加属性，不删 DOM、不重建节点 —— 避免触发 MutationObserver 死循环
 *  · 全部规则挂在 :root[data-wbskin="dsh"] 下，切回原生立即恢复
 *  · 用户区可以整块隐藏：设置仍可用 ⌘, 打开（已实测），另可用 restore.sh 兜底
 */

window.__wbdsHide?.destroy?.();   // 重注入先断旧实例，避免观察器绑在旧闭包上

window.__wbdsHide = (() => {
  const STYLE_ID = 'wbds-hide-style';
  const ATTR = 'data-wbds-hide';

  const CSS = `
  :root[data-wbskin="dsh"] [${ATTR}] { display: none; }
  /* 品牌区隐藏后，头部多余的下方留白收掉 */
  :root[data-wbskin="dsh"] .conversation-list-header:has(.conversation-list-logo-row[${ATTR}]) {
    padding-bottom: 0;
  }
  `;

  /* 设置页：按导航项文本隐藏 */
  const NAV_HIDE = [
    '个性化', '个人主页', '快捷键',
    '智能体', '模型', '助理', '设备连接', '对话流',
    '应用管理', '安全中心', '关于', '获取帮助',
  ];

  /* 主窗口侧栏：按导航项文本前辍隐藏 */
  const TAB_HIDE = ['资料库', '更多', '助理', '专家·技能·连接器'];

  /* 主窗口：按选择器隐藏 */
  const SEL_HIDE = [
    '.conversation-list-logo-row',          // WorkBuddy / V5.9.3 / 发现应用
    '.conversation-list-footer',            // 底部整块用户区（头像 + 手机号 + 铃铛 + 设备图标）
    '.conversation-input-area__disclaimer', // 内容由 AI 生成，请核实重要信息
    '.conversation-list-topbar button[aria-label="筛选"]', // 侧栏顶部漏斗（筛选）
    '.workbuddy-topbar button[aria-label="分享"]',         // 右上角分享箭头
  ];

  const isSettings = document.documentElement.dataset.windowAppId === 'settings';

  const mark = (el) => {
    if (el && el.getAttribute(ATTR) !== '1') el.setAttribute(ATTR, '1');
  };

  const ensureStyle = () => {
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = STYLE_ID;
      document.head.appendChild(st);
    }
    if (st.textContent !== CSS) st.textContent = CSS;
  };

  const apply = () => {
    ensureStyle();

    if (isSettings) {
      for (const el of document.querySelectorAll('.settings-navigation__item')) {
        const t = (el.innerText || '').trim();
        if (NAV_HIDE.includes(t)) mark(el);
      }
      // 整组都被隐藏时（如"关于/获取帮助"），把分组标题和分割线一起去掉，
      // 否则导航底部会留一条孤立的分割线
      for (const g of document.querySelectorAll('.settings-navigation__group')) {
        const items = [...g.querySelectorAll('.settings-navigation__item')];
        const alive = items.filter((el) => el.getAttribute(ATTR) !== '1');
        if (items.length && !alive.length) mark(g);
        else if (g.getAttribute(ATTR) === '1') g.removeAttribute(ATTR);
      }
    } else {
      for (const el of document.querySelectorAll('.conversation-list-tab-button')) {
        const t = (el.innerText || '').trim();
        if (TAB_HIDE.some((x) => t.startsWith(x))) mark(el);
      }
      for (const sel of SEL_HIDE) {
        for (const el of document.querySelectorAll(sel)) mark(el);
      }
    }
  };

  /* 防抖：React 重渲染时 MutationObserver 可能高频触发 */
  let timer = null;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; apply(); }, 120);
  };

  apply();

  const obs = new MutationObserver(schedule);
  obs.observe(document.body, { childList: true, subtree: true });
  window.__wbdsHideObserver = obs;

  // 兜底轮询：有些重渲染不会触发 childList（只改属性/文本），
  // 或者观察器在页面重挂载时漏掉一拍，2 秒补一次标记（mark 是幂等的）
  const interval = setInterval(apply, 2000);

  const count = () => document.querySelectorAll(`[${ATTR}]`).length;

  const destroy = () => {
    obs.disconnect();
    clearInterval(interval);
    clearTimeout(timer);
    if (window.__wbdsHideObserver === obs) window.__wbdsHideObserver = null;
  };

  return { window: isSettings ? 'settings' : 'main', hidden: count(), destroy };
})();
