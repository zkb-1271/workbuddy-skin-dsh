/**
 * WorkBuddy · dsh 皮肤 · 自定义设置页（头像入口）
 *
 * 定位：⌘, 走 WorkBuddy **原生**设置（功能最全）；
 *      点侧栏左下角头像 → 打开这个自建设置页（秒开、设计完全可控）。
 *
 * 设计参考：DeepSeek Harness 设置弹窗 —— 白底、极细描边、行标签小、值加粗。
 *
 * 页面 = 原生导航 19 项。**不再把整页甩回原生**：
 *   · 有本地状态（localStorage）的设置 → 真开关，写入即持久化；
 *   · 有真实数据的（积分、账号、设备 id、存储占用） → 真数据 + 可执行动作
 *     （刷新积分、清理缓存、打开文档）；
 *   · 确实是云端/系统级的（资金、设备配对、快捷键编辑） → 页内说明 + 小入口。
 *
 * 外部依赖：
 *   window.__WBDS_AVATAR     头像 data-uri（avatar.js）
 *   window.__wbdsCreditsData 积分数据（daemon credits.mjs 写入）
 *   window.__wbHostMenuCommand('menu.openSettings') 原生设置（次要入口）
 */
window.__wbdsSettings2?.destroy?.();

window.__wbdsSettings2 = (() => {
  const ROOT_ID = 'wbds-settings2';
  const LS_MODE = 'wbds.skin.mode';
  const LS_CRED_VIS = 'wbds.credits.visible';
  const LS_NAV_HIDDEN = 'wbds.settings.nav.hidden';   /* 被隐藏的导航项 key 数组 */

  /* ---------- 图标（14px 线性，stroke=currentColor） ---------- */
  const P = {
    sliders: '<path d="M3 4h10M3 8h10M3 12h10"/><path d="M6 2.4v3.2M10.6 6.4v3.2M6.2 10.4v3.2"/>',
    user: '<circle cx="8" cy="5.6" r="2.5"/><path d="M3.2 13.4c.8-2.3 2.6-3.4 4.8-3.4s4 1.1 4.8 3.4"/>',
    card: '<rect x="2.2" y="4" width="11.6" height="8" rx="1.6"/><path d="M2.2 7h11.6"/>',
    sun: '<circle cx="8" cy="8" r="2.5"/><path d="M8 1.8v1.3M8 12.9v1.3M1.8 8h1.3M12.9 8h1.3M3.7 3.7l.9.9M11.4 11.4l.9.9M12.3 3.7l-.9.9M4.6 11.4l-.9.9"/>',
    key: '<rect x="2.2" y="4.6" width="11.6" height="6.8" rx="1.6"/><path d="M5 8h.01M8 8h.01M11 8h.01"/>',
    grid: '<rect x="2.6" y="2.6" width="4.3" height="4.3" rx="1.1"/><rect x="9.1" y="2.6" width="4.3" height="4.3" rx="1.1"/><rect x="2.6" y="9.1" width="4.3" height="4.3" rx="1.1"/><rect x="9.1" y="9.1" width="4.3" height="4.3" rx="1.1"/>',
    sparkle: '<path d="M8 2.2l1.35 3.45L12.8 7l-3.45 1.35L8 11.8 6.65 8.35 3.2 7l3.45-1.35L8 2.2z"/>',
    layers: '<path d="M8 2.2l5.4 2.8L8 7.8 2.6 5 8 2.2z"/><path d="M2.6 8.2L8 11l5.4-2.8"/><path d="M2.6 11.2L8 14l5.4-2.8"/>',
    bot: '<rect x="3" y="5" width="10" height="7.4" rx="2"/><path d="M8 2.4V5M5.6 8.4h.01M10.4 8.4h.01"/>',
    cpu: '<rect x="4.4" y="4.4" width="7.2" height="7.2" rx="1.4"/><path d="M6.4 2.2v2.2M9.6 2.2v2.2M6.4 11.6v2.2M9.6 11.6v2.2M2.2 6.4h2.2M2.2 9.6h2.2M11.6 6.4h2.2M11.6 9.6h2.2"/>',
    message: '<path d="M2.6 4.4h10.8v6.2H7.4L4.4 13v-2.4H2.6z"/>',
    link: '<path d="M6.6 9.4l2.8-2.8"/><path d="M9.1 4.4l.8-.8a2.5 2.5 0 013.5 3.5l-.8.8"/><path d="M6.9 11.6l-.8.8a2.5 2.5 0 01-3.5-3.5l.8-.8"/>',
    flow: '<path d="M2.4 5h5.2M2.4 11h5.2"/><path d="M7.6 5l2.6 3-2.6 3M10.4 8h3.2"/>',
    db: '<ellipse cx="8" cy="4.4" rx="4.4" ry="1.9"/><path d="M3.6 4.4v7.2c0 1 2 1.9 4.4 1.9s4.4-.9 4.4-1.9V4.4"/>',
    box: '<path d="M8 2.4l5 2.5v6.2L8 13.6l-5-2.5V4.9l5-2.5z"/><path d="M3 4.9L8 7.4l5-2.5M8 7.4v6.2"/>',
    shield: '<path d="M8 2.2l5 1.8v3.9c0 2.9-2.1 4.9-5 5.7-2.9-.8-5-2.8-5-5.7V4l5-1.8z"/><path d="M5.9 7.9l1.5 1.5 2.8-2.9"/>',
    info: '<circle cx="8" cy="8" r="5.7"/><path d="M8 7.2v4.1M8 5.2h.01"/>',
    help: '<circle cx="8" cy="8" r="5.7"/><path d="M6.5 6.4a1.6 1.6 0 113 .5c-.25.6-.95.95-1.35 1.35v.6M8 11.5h.01"/>',
  };
  const icon = (name) =>
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.info}</svg>`;

  const NAV = [
    { key: 'general', label: '通用', ic: 'sliders' },
    { key: 'profile', label: '个人主页', ic: 'user' },
    { key: 'credits', label: '套餐与积分', ic: 'card' },
    { key: 'appearance', label: '外观', ic: 'sun' },
    { key: 'shortcuts', label: '快捷键', ic: 'key' },
    { key: 'features', label: '功能', ic: 'grid' },
    { key: 'personalization', label: '个性化', ic: 'sparkle' },
    { sep: true },
    { key: 'memory', label: '记忆与进化', ic: 'layers' },
    { key: 'agents', label: '智能体', ic: 'bot' },
    { key: 'models', label: '模型', ic: 'cpu' },
    { key: 'assistant', label: '助理', ic: 'message' },
    { key: 'devices', label: '设备连接', ic: 'link' },
    { key: 'conversation', label: '对话流', ic: 'flow' },
    { sep: true },
    { key: 'import', label: '数据导入', ic: 'db' },
    { key: 'data', label: '数据管理', ic: 'db' },
    { key: 'apps', label: '应用管理', ic: 'box' },
    { key: 'security', label: '安全中心', ic: 'shield' },
    { sep: true },
    { key: 'about', label: '关于', ic: 'info' },
    { key: 'help', label: '获取帮助', ic: 'help' },
  ];

  /* ---------- 真实设置的存储键（全部实测存在） ---------- */
  const K = {
    font: 'agent-ui-font-size-level:v2',
    lang: 'CODEBUDDY_IDE_STORAGE_LANG',
    notify: 'WORKBUDDY_CLIENT_NOTIFICATION_ENABLED',
    sound: 'WORKBUDDY_TIP_SOUND_STYLE',
    preventSleep: 'WORKBUDDY_PREVENT_SYSTEM_SLEEP_WHILE_RUNNING',
    lockRun: 'CODEBUDDY_PREVENT_SLEEP',
    skillInstall: 'skills-security-auto-install-non-high-risk',
    skillUpdate: 'skills_auto_update_enabled',
    suiteUpdate: 'suites_auto_update_initialized',
    skillRecommend: 'skill-recommend-enabled',
    skillsCache: 'market-skills-cache:installed-entitlement',
    appsCache: 'WorkBuddy-BuddyApp-Entrance-Cache',
    machine: 'mindx_machine_id',
  };

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 导航栏自定义（外观页里可增删栏目） ---------- */
  const ALWAYS_ON = ['appearance'];   /* 外观页不能隐藏：它承载这个开关本身 */

  const readHiddenNav = () => {
    try {
      const v = JSON.parse(localStorage.getItem(LS_NAV_HIDDEN) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };
  const writeHiddenNav = (arr) => {
    try { localStorage.setItem(LS_NAV_HIDDEN, JSON.stringify(arr)); } catch { /* 忽略 */ }
  };

  /* 过滤 + 收敛分隔线（连续/首尾的分隔线都去掉） */
  const visibleNav = () => {
    const hidden = new Set(readHiddenNav());
    const out = [];
    for (const n of NAV) {
      if (n.sep) { if (out.length && !out[out.length - 1].sep) out.push(n); continue; }
      if (hidden.has(n.key) && !ALWAYS_ON.includes(n.key)) continue;
      out.push(n);
    }
    while (out.length && out[out.length - 1].sep) out.pop();
    return out;
  };

  const read = (k, d = '') => {
    try { return localStorage.getItem(k) ?? d; } catch { return d; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, v); return true; } catch { return false; }
  };

  /* 值格式因键而异：true/false、1/0、on/off —— 写回时保持原格式 */
  const boolOf = (v) => v === 'true' || v === '1' || v === 'on';
  const writeBool = (k, on) => {
    const cur = read(k);
    if (cur === '1' || cur === '0') write(k, on ? '1' : '0');
    else if (cur === 'on' || cur === 'off') write(k, on ? 'on' : 'off');
    else write(k, on ? 'true' : 'false');
  };

  const readAccount = () => {
    try {
      const sp = new URLSearchParams(location.search);
      let raw = sp.get('accountSnapshot') || '';
      for (let i = 0; i < 2 && /%[0-9A-F]{2}/i.test(raw); i++) raw = decodeURIComponent(raw);
      const o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : null;
    } catch { return null; }
  };
  const uid = () => (readAccount() || {}).uid || '';
  const modelKey = () => 'cb-newtask:model:' + uid();
  const effortKey = () => 'cb-effort:by-model:' + uid();
  const thinkKey = () => 'cb-thinking-pref:by-model:' + uid();

  const readJson = (k, d) => {
    try { return JSON.parse(read(k) || 'null') ?? d; } catch { return d; }
  };

  const readCredits = () => {
    let d = window.__wbdsCreditsData;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    if (!d) d = readJson('wbds.credits.cache', null);
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    return d && !d.err ? d : null;
  };

  /* daemon 的 localdata.mjs 写回：记忆/插件/技能/磁盘/权限模式 */
  const localData = () => {
    let d = window.__wbdsLocalData;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    if (!d) d = readJson('wbds.local.cache', null);
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    return d || null;
  };

  const relTime = (ms) => {
    if (!ms) return '—';
    const diff = Date.now() - ms;
    const m = Math.round(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' 小时前';
    return new Date(ms).toLocaleDateString('zh-CN');
  };

  const fmt = (v, digits = 1) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const n = Number(v);
    const f = Math.pow(10, digits);
    return String(Math.round(n * f) / f);
  };

  const bytes = (n) => {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = Number(n);
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + u[i];
  };

  /* ---------- 行构造器 ---------- */
  const row = (label, value) =>
    `<div class="wbs2-row"><span class="wbs2-row-label">${label}</span><span class="wbs2-row-value">${value}</span></div>`;

  const switchRow = (label, key, desc = '') => {
    const on = boolOf(read(key));
    return `<div class="wbs2-row">
      <span class="wbs2-row-label">${label}${desc ? `<span class="wbs2-row-sub">${desc}</span>` : ''}</span>
      <span class="wbs2-switch${on ? ' is-on' : ''}" data-act="toggle" data-key="${esc(key)}" data-on="${on ? 1 : 0}"><i></i></span>
    </div>`;
  };

  const segRow = (label, key, opts, desc = '') => {
    const cur = read(key);
    const items = opts
      .map((o) => `<button class="wbs2-seg-item${String(o.v) === String(cur) ? ' is-on' : ''}" data-act="seg" data-key="${esc(key)}" data-val="${esc(o.v)}">${esc(o.l)}</button>`)
      .join('');
    return `<div class="wbs2-row">
      <span class="wbs2-row-label">${label}${desc ? `<span class="wbs2-row-sub">${desc}</span>` : ''}</span>
      <span class="wbs2-seg">${items}</span>
    </div>`;
  };

  const actionsRow = (note, buttons) =>
    `<div class="wbs2-actions">
      <span class="wbs2-dim">${note}</span>
      <span class="wbs2-btn-group">${buttons}</span>
    </div>`;

  /* ---------- 各页 ---------- */
  const panelGeneral = () => `
    <div class="wbs2-card">
      ${row('语言', '<span class="wbs2-dim">简体中文</span>')}
      ${segRow('字体大小', K.font, [
        { v: '1', l: '小' },
        { v: '2', l: '默认' },
        { v: '3', l: '大' },
      ])}
      ${switchRow('桌面通知', K.notify, '任务完成或有新消息时弹系统通知')}
      ${segRow('通知提示音', K.sound, [
        { v: 'none', l: '无音效' },
        { v: 'default', l: '默认' },
      ])}
      ${switchRow('运行时防止休眠', K.preventSleep, '执行任务时让电脑保持唤醒')}
      ${segRow('锁屏运行', K.lockRun, [
        { v: 'off', l: '关闭' },
        { v: 'on', l: '允许' },
      ], '锁屏后仍可继续远程/后台任务')}
    </div>
    ${actionsRow('部分开关在 WorkBuddy 重启后完全生效', '<button class="wbs2-btn" data-act="native">原生设置</button>')}`;

  const panelProfile = () => {
    const a = readAccount() || {};
    const credits = readCredits();
    const name = a.nickname || '未登录';
    const id = a.uid || '—';
    return `
      <div class="wbs2-card wbs2-profile">
        <img class="wbs2-avatar" src="${window.__WBDS_AVATAR || ''}" alt="">
        <div class="wbs2-profile-main">
          <div class="wbs2-profile-name">${esc(name)}</div>
          <div class="wbs2-profile-sub">${esc(id.slice(0, 8))}…</div>
        </div>
      </div>
      <div class="wbs2-card">
        ${row('账号昵称', esc(name))}
        ${row('账号类型', a.type === 'personal' ? '个人版' : esc(a.type || '个人版'))}
        ${row('当前套餐', a.isPro ? '专业版' : '体验版')}
        ${row('积分余额', credits ? fmt(credits.total) : '—')}
        ${row('用户 ID', `<button class="wbs2-copy" data-act="copy" data-copy="${esc(id)}" title="点击复制">${esc(id.slice(0, 18))}…</button>`)}
      </div>
      ${actionsRow('昵称与头像由账号体系管理', '<button class="wbs2-btn" data-act="native">账号设置</button>')}`;
  };

  const panelCredits = () => {
    const c = readCredits();
    const groups = (c && Array.isArray(c.groups) ? c.groups : []).filter((g) => Number(g.total) > 0 || Number(g.remain) > 0);
    const groupRows = groups
      .map((g) =>
        row(
          esc(g.name || g.kind || '积分包'),
          `<span class="wbs2-mono">${fmt(g.remain)}</span><span class="wbs2-dim"> / ${fmt(g.total)}</span>`
        )
      )
      .join('');
    const when = c && c.ts ? new Date(c.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '—';
    return `
      <div class="wbs2-card">
        <div class="wbs2-hero">
          <span class="wbs2-row-label">总剩余积分</span>
          <span class="wbs2-hero-num">${c ? fmt(c.total) : '—'}</span>
        </div>
        ${groupRows}
        ${row('今日使用', `<span class="wbs2-mono">${c ? fmt(c.today, 2) : '—'}</span>`)}
        ${row('上次刷新', `<span class="wbs2-dim">${when}</span>`)}
        ${actionsRow(
          '数据每 60 秒由守护进程刷新',
          '<button class="wbs2-btn wbs2-btn--primary" data-act="native">充值与套餐</button>'
        )}
      </div>`;
  };

  const panelAppearance = () => {
    const mode = localStorage.getItem(LS_MODE) === 'native' ? 'native' : 'dsh';
    const credOn = localStorage.getItem(LS_CRED_VIS) !== '0';
    const width = getComputedStyle(document.documentElement).getPropertyValue('--wbds-content-w').trim() || '自适应';
    const hiddenNav = readHiddenNav();
    return `
      <div class="wbs2-card">
        <div class="wbs2-row">
          <span class="wbs2-row-label">界面风格</span>
          <span class="wbs2-seg">
            <button class="wbs2-seg-item${mode === 'dsh' ? ' is-on' : ''}" data-act="mode" data-mode="dsh">dsh 精简</button>
            <button class="wbs2-seg-item${mode === 'native' ? ' is-on' : ''}" data-act="mode" data-mode="native">原生</button>
          </span>
        </div>
        <div class="wbs2-row">
          <span class="wbs2-row-label">侧栏积分条</span>
          <span class="wbs2-switch${credOn ? ' is-on' : ''}" data-act="credvis" data-on="${credOn ? '1' : '0'}"><i></i></span>
        </div>
        ${row(
          '对话内容宽度',
          `<span class="wbs2-dim wbs2-mono">${esc(width)}</span><button class="wbs2-btn" data-act="widthreset">重置</button>`
        )}
        ${row('侧栏宽度', `<span class="wbs2-mono">${esc(read('agent-ui-sidebar-width') || '默认')}</span><span class="wbs2-dim"> px</span>`)}
        ${row('详情面板宽度', `<span class="wbs2-mono">${esc(read('agent-ui-detail-panel-width') || '默认')}</span><span class="wbs2-dim"> px</span>`)}
      </div>
      <div class="wbs2-card">
        <div class="wbs2-row wbs2-row--title">
          <span class="wbs2-row-label">设置栏目<span class="wbs2-row-sub">关掉的栏目会从这个弹窗左侧消失</span></span>
          <button class="wbs2-btn wbs2-btn--sm" data-act="nav-reset">全部显示</button>
        </div>
        ${NAV.filter((n) => !n.sep)
          .map((n) => {
            const hidden = hiddenNav.includes(n.key);
            const lock = ALWAYS_ON.includes(n.key);
            return `<div class="wbs2-row wbs2-row--compact">
              <span class="wbs2-row-label">${n.label}${lock ? '<span class="wbs2-row-sub">始终显示</span>' : ''}</span>
              <span class="wbs2-switch${!hidden && !lock ? ' is-on' : ''}${lock ? ' is-locked' : ''}"
                    data-act="nav-toggle" data-key="${esc(n.key)}" data-on="${!hidden || lock ? 1 : 0}"><i></i></span>
            </div>`;
          })
          .join('')}
      </div>
      <p class="wbs2-note">皮肤通过调试端口注入，不改 WorkBuddy 本体。</p>`;
  };

  const panelFeatures = () => `
    <div class="wbs2-card">
      ${switchRow('技能自动安装', K.skillInstall, '安全检测通过后自动安装')}
      ${switchRow('技能自动更新', K.skillUpdate, '已安装技能保持最新')}
      ${switchRow('套件自动更新', K.suiteUpdate, '已安装套件保持最新')}
      ${switchRow('技能推荐', K.skillRecommend, '在对话里推荐可用技能')}
    </div>
    ${actionsRow('技能的安装与卸载在插件市场', '<button class="wbs2-btn" data-act="native">插件市场</button>')}`;

  const panelModels = () => {
    const m = readJson(modelKey(), {});
    const efforts = readJson(effortKey(), {});
    const thinks = readJson(thinkKey(), {});
    const cur = m.id || '—';
    const eff = efforts[cur] || m.reasoningEffort || 'high';
    const think = thinks[cur] !== undefined ? thinks[cur] : !!m.isThinking;
    return `
      <div class="wbs2-card">
        ${row('默认模型', `<span class="wbs2-mono">${esc(cur)}</span>`)}
        <div class="wbs2-row">
          <span class="wbs2-row-label">思考强度<span class="wbs2-row-sub">当前模型的推理预算</span></span>
          <span class="wbs2-seg">
            <button class="wbs2-seg-item${eff === 'low' ? ' is-on' : ''}" data-act="effort" data-val="low">低</button>
            <button class="wbs2-seg-item${eff === 'medium' ? ' is-on' : ''}" data-act="effort" data-val="medium">中</button>
            <button class="wbs2-seg-item${eff === 'high' ? ' is-on' : ''}" data-act="effort" data-val="high">高</button>
          </span>
        </div>
        <div class="wbs2-row">
          <span class="wbs2-row-label">深度思考<span class="wbs2-row-sub">新对话默认开启思考</span></span>
          <span class="wbs2-switch${think ? ' is-on' : ''}" data-act="think" data-on="${think ? 1 : 0}"><i></i></span>
        </div>
      </div>
      <p class="wbs2-note">换模型本身在对话页的模型菜单里；这里是新对话的默认参数。</p>`;
  };

  const panelShortcuts = () => {
    const groups = [
      ['全局', [
        ['打开设置', '⌘ ,'],
        ['全局搜索', '⌘ K'],
        ['关闭当前浮层', 'Esc'],
      ]],
      ['输入框', [
        ['发送', 'Enter'],
        ['换行', '⇧ Enter'],
        ['语音输入', '按住 ⌥ 说话'],
      ]],
      ['窗口', [
        ['新建任务', '⌘ N'],
        ['关闭窗口', '⌘ W'],
      ]],
    ];
    const cards = groups
      .map(([title, list]) => {
        const rows = list
          .map(([l, k]) => `<div class="wbs2-row"><span class="wbs2-row-label">${l}</span><span class="wbs2-kbd">${esc(k)}</span></div>`)
          .join('');
        return `<div class="wbs2-card"><div class="wbs2-row wbs2-row--title"><span class="wbs2-row-label">${title}</span></div>${rows}</div>`;
      })
      .join('');
    return `${cards}<p class="wbs2-note">快捷键由客户端内置，目前不支持改键；这里只是速查。</p>`;
  };

  const panelMemory = () => {
    const d = localData();
    if (!d) return `<div class="wbs2-card">${row('长期记忆', '<span class="wbs2-dim">读取中…</span>')}</div>`;

    /* 编辑态：整页只留编辑器，避免列表分心 */
    if (memEdit) {
      return `
      <div class="wbs2-card">
        <div class="wbs2-row wbs2-row--title">
          <span class="wbs2-row-label">${memEdit.isNew ? '新建记忆' : esc(memEdit.file)}
            <span class="wbs2-row-sub">Markdown · 保存后写入 ~/.workbuddy/memory</span></span>
        </div>
        ${
          memEdit.isNew
            ? `<div class="wbs2-row"><span class="wbs2-row-label">标题</span>
                 <input class="wbs2-input" data-act="mem-title" value="${esc(memEdit.title || '')}" placeholder="例如：项目偏好" /></div>`
            : ''
        }
        <textarea class="wbs2-editor" data-act="mem-content" spellcheck="false">${esc(memEdit.content || '')}</textarea>
        <div class="wbs2-actions">
          <span class="wbs2-dim">守护进程每 5 秒取一次命令</span>
          <span class="wbs2-btn-group">
            <button class="wbs2-btn" data-act="mem-cancel">取消</button>
            <button class="wbs2-btn wbs2-btn--primary" data-act="mem-save">保存</button>
          </span>
        </div>
      </div>`;
    }

    const mem = d.memory || [];
    const docs = d.userDocs || [];
    const memRows = mem.length
      ? mem
          .map((m, i) => {
            const open = expanded.has('mem' + i);
            return `<div class="wbs2-row wbs2-row--click" data-act="mem-toggle" data-key="mem${i}">
                <span class="wbs2-row-label">${esc(m.title)}<span class="wbs2-row-sub">${bytes(m.bytes)} · ${relTime(m.mtime)}${m.mine ? ' · 当前账号' : ''}</span></span>
                <span class="wbs2-row-ops">
                  <button class="wbs2-btn wbs2-btn--sm" data-act="mem-edit" data-file="${esc(m.file)}">编辑</button>
                  <button class="wbs2-btn wbs2-btn--sm" data-act="mem-del" data-file="${esc(m.file)}">删除</button>
                </span>
              </div>
              ${open ? `<pre class="wbs2-pre">${esc(m.preview || '（内容为空）')}</pre>` : ''}`;
          })
          .join('')
      : row('用户记忆', '<span class="wbs2-dim">暂无</span>');
    const docRows = docs.length
      ? docs.map((x) => row(esc(x.name.replace('.md', '')), `<span class="wbs2-dim">${bytes(x.bytes)} · ${relTime(x.mtime)}</span>`)).join('')
      : '';
    return `
      <div class="wbs2-card">
        <div class="wbs2-row wbs2-row--title">
          <span class="wbs2-row-label">用户记忆<span class="wbs2-row-sub">${mem.length} 个文件</span></span>
          <button class="wbs2-btn wbs2-btn--sm" data-act="mem-new">新建</button>
        </div>
        ${memRows}
      </div>
      ${docRows ? `<div class="wbs2-card">${docRows}</div>` : ''}
      <p class="wbs2-note">编辑直接改写 ~/.workbuddy/memory 下的 Markdown；删除是移到内存目录的 .trash，可以手动找回。</p>`;
  };

  const panelAgents = () => {
    const d = localData();
    if (!d) return `<div class="wbs2-card">${row('插件', '<span class="wbs2-dim">读取中…</span>')}</div>`;
    const p = d.plugins || { total: 0, enabled: 0, items: [] };
    const skills = d.skills || [];
    const pluginRows = (p.items || [])
      .slice(0, 8)
      .map((x) => {
        /* items 是字符串数组（"名字@来源"），不是对象 */
        const name = typeof x === 'string' ? x : (x && x.name) || '';
        const [base, src] = name.split('@');
        return row(esc(base), `<span class="wbs2-dim">${esc(src || '')}</span>`);
      })
      .join('');
    return `
      <div class="wbs2-card">
        ${row('已安装插件', `<span class="wbs2-mono">${p.total}</span><span class="wbs2-dim"> 启用 ${p.enabled}</span>`)}
        ${row('本地技能', `<span class="wbs2-mono">${skills.length}</span>${skills.length ? `<span class="wbs2-dim"> ${esc(skills.map((s) => s.name).join('、'))}</span>` : ''}`)}
      </div>
      ${pluginRows ? `<div class="wbs2-card">${pluginRows}</div>` : ''}
      <p class="wbs2-note">安装 / 卸载在插件市场里完成；这里是本地实况。</p>`;
  };

  const panelAssistant = () => {
    const d = localData();
    const mode = d && d.prefs ? d.prefs.permissionMode : '';
    const modeText = mode === 'full-access' ? '允许完全访问' : mode || '—';
    return `
    <div class="wbs2-card">
      ${row('默认权限', `<span class="wbs2-mono">${esc(modeText)}</span>`)}
      ${row('唤起方式', '<span class="wbs2-dim">⌘ K 全局搜索 · 侧栏入口</span>')}
      ${row('执行确认', '<span class="wbs2-dim">由输入框下方「允许完全访问」切换</span>')}
    </div>
    <p class="wbs2-note">助理行为随每个任务的权限设置生效。</p>`;
  };

  const panelDevices = () => {
    const machine = read(K.machine);
    return `
      <div class="wbs2-card">
        ${row('当前设备', `<span class="wbs2-mono">${machine ? esc(String(machine).slice(0, 16)) + '…' : '—'}</span>`)}
        ${row('连接状态', '<span class="wbs2-dim">本机运行中</span>')}
      </div>
      <p class="wbs2-note">手机等设备的配对需在客户端里扫码完成。</p>`;
  };

  const panelConversation = () => {
    /* 改动详情开关是按账号存的：workbuddy.fileChanges.showDetails:<uid> */
    const fileKey = 'workbuddy.fileChanges.showDetails:' + (uid() || '');
    const hasKey = read(fileKey) !== '';
    return `
    <div class="wbs2-card">
      ${switchRow('显示文件改动详情', fileKey, '执行时改了哪些文件、增删多少行')}
      ${row('流式输出', '<span class="wbs2-dim">始终开启</span>')}
      ${row('执行过程', '<span class="wbs2-dim">折叠在消息里，点开看步骤</span>')}
    </div>
    <p class="wbs2-note">${hasKey ? '改动详情开关存在本机，切换后对之后的消息生效。' : '还没记录过这个开关，切一下就会写入。'}</p>`;
  };

  const panelImport = () => `
    <div class="wbs2-card">
      ${row('支持来源', '<span class="wbs2-dim">WorkBuddy / 其他客户端导出包</span>')}
      ${row('导入记录', '<span class="wbs2-dim">暂无</span>')}
    </div>
    <p class="wbs2-note">导入需要客户端文件系统权限。</p>`;

  const panelData = () => {
    /* 归档真源是 sqlite（sessions.status），由 daemon 的 localdata.mjs 采集；
       老键 genie-archived-session-ids 只作兜底，别再拿它当数量 */
    const d = localData();
    const archN = d?.archived?.count ?? (Array.isArray(readJson('genie-archived-session-ids', [])) ? readJson('genie-archived-session-ids', []).length : 0);
    return `
    <div class="wbs2-card">
      ${row('缓存目录', '<span class="wbs2-mono">~/.workbuddy</span>')}
      ${(() => {
        const d = localData();
        if (!d || !d.disk) return row('磁盘占用', '<span class="wbs2-dim">读取中…</span>');
        const top = d.disk.items.slice(0, 3).map((i) => `${i.name} ${Math.round(i.bytes / 1e6)}MB`).join(' · ');
        return row('磁盘占用', `<span class="wbs2-mono">${(Math.round(d.disk.total / 1e8) / 10).toFixed(1)} GB</span><span class="wbs2-dim"> ${top}</span>`);
      })()}
      ${row('本应用存储占用', '<span class="wbs2-mono" data-fill="storage">计算中…</span>')}
      ${row('可用配额', '<span class="wbs2-mono" data-fill="quota">计算中…</span>')}
      ${row(
        '已归档会话',
        `<span class="wbs2-mono">${archN}</span>${
          archN ? '<button class="wbs2-btn" data-act="open-archived">查看归档列表</button>' : ''
        }`
      )}
      ${actionsRow('只清缓存，不动对话记录', '<button class="wbs2-btn" data-act="clear-cache">清理缓存</button>')}
    </div>`;
  };

  const panelApps = () => {
    const d = localData();
    const entrances = readJson(K.appsCache, {});
    const entN = entrances && typeof entrances === 'object' ? Object.keys(entrances).length : 0;
    const plugins = (d && d.plugins) || { total: 0, enabled: 0 };
    const skills = (d && d.skills) || [];
    const entranceRows = Object.entries(entrances || {})
      .slice(0, 4)
      .map(([k, v]) => row(`账号 ${k.slice(0, 8)}…`, `<span class="wbs2-dim">${v ? '已开启入口' : '已关闭'}</span>`))
      .join('');
    return `
      <div class="wbs2-card">
        ${row('插件', `<span class="wbs2-mono">${plugins.total}</span><span class="wbs2-dim"> 启用 ${plugins.enabled}</span>`)}
        ${row('本地技能', `<span class="wbs2-mono">${skills.length}</span>`)}
        ${row('应用入口', `<span class="wbs2-mono">${entN}</span><span class="wbs2-dim"> 个账号</span>`)}
      </div>
      ${entranceRows ? `<div class="wbs2-card">${entranceRows}</div>` : ''}
      <p class="wbs2-note">这里只是本机实况；应用的安装、权限与下线仍然在客户端里操作。</p>`;
  };

  const panelSecurity = () => {
    const a = readAccount() || {};
    const d = localData();
    const sbx = d && d.sandbox;
    const perms = readJson('system-permissions-activated-ids', []);
    const permText = Array.isArray(perms) && perms.length ? perms.join(' · ') : '未授权';
    return `
      <div class="wbs2-card">
        ${switchRow('沙箱保护', 'CODEBUDDY_SANDBOX_SAFETY_ENABLED', '命令在受限环境里跑，越权写文件会被拦')}
        ${row('强制模式', `<span class="wbs2-dim">${boolOf(read('CODEBUDDY_SANDBOX_SAFETY_FORCED')) ? '开启（不可关闭）' : '关闭'}</span>`)}
        ${row('规则条数', sbx ? `<span class="wbs2-mono">${sbx.rules}</span><span class="wbs2-dim"> 条${sbx.extra ? ` · 额外可写 ${sbx.extra} 个目录` : ''}</span>` : '<span class="wbs2-dim">读取中…</span>')}
        ${row('系统授权', `<span class="wbs2-dim">${esc(permText)}</span>`)}
      </div>
      <div class="wbs2-card">
        ${row('登录账号', `<span class="wbs2-mono">${esc(a.nickname || '—')}</span>`)}
        ${row('本地标识', `<span class="wbs2-mono">${esc((a.uid || '—').slice(0, 18))}…</span>`)}
      </div>
      <p class="wbs2-note">规则明细在 ~/.workbuddy/settings.json 的 sandbox 段，改完重启生效。</p>`;
  };

  const panelPersonalization = () => {
    const d = localData();
    const a = d && d.agentsMd;
    return `
    <div class="wbs2-card">
      ${row('全局规则 ~/AGENTS.md', a ? `<span class="wbs2-mono">${a.lines} 行</span><span class="wbs2-dim"> ${relTime(a.mtime)}</span>` : '<span class="wbs2-dim">未找到</span>')}
      ${row('助手人设', '<span class="wbs2-dim">跟随所选模式</span>')}
      ${row('语气偏好', '<span class="wbs2-dim">简洁、直接</span>')}
    </div>
    <p class="wbs2-note">个性化规则写进 ~/AGENTS.md 与用户记忆，跨项目生效。</p>`;
  };

  const panelAbout = () => `
    <div class="wbs2-card">
      ${row('皮肤版本', '<span class="wbs2-mono">dsh skin · 2026-11</span>')}
      ${row('注入方式', '<span class="wbs2-dim">CDP 运行时注入（不修改 app.asar）</span>')}
      ${row('调试端口', '<span class="wbs2-mono">9222</span>')}
      ${row('积分数据', '<span class="wbs2-dim">守护进程每 60 秒刷新</span>')}
      ${actionsRow('WorkBuddy 原生设置', '<button class="wbs2-btn" data-act="native">打开原生设置 ⌘,</button>')}
    </div>`;

  const panelHelp = () => `
    <div class="wbs2-card">
      ${row('使用文档', '<button class="wbs2-btn" data-act="open-url" data-url="https://www.workbuddy.cn/docs/workbuddy/Overview">打开</button>')}
      ${row('问题反馈', '<button class="wbs2-btn" data-act="open-url" data-url="https://www.workbuddy.cn">反馈</button>')}
    </div>
    <p class="wbs2-note">反馈会带上客户端日志，便于定位问题。</p>`;

  const PANELS = {
    general: panelGeneral,
    profile: panelProfile,
    credits: panelCredits,
    appearance: panelAppearance,
    shortcuts: panelShortcuts,
    features: panelFeatures,
    personalization: panelPersonalization,
    memory: panelMemory,
    agents: panelAgents,
    models: panelModels,
    assistant: panelAssistant,
    devices: panelDevices,
    conversation: panelConversation,
    import: panelImport,
    data: panelData,
    apps: panelApps,
    security: panelSecurity,
    about: panelAbout,
    help: panelHelp,
  };

  /* ---------- 骨架 ---------- */
  let root = document.getElementById(ROOT_ID);
  if (root) root.remove();

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <div class="wbs2-backdrop" data-act="close"></div>
    <div class="wbs2-modal" role="dialog" aria-modal="true" aria-label="设置">
      <div class="wbs2-head">
        <span class="wbs2-title">设置</span>
        <span class="wbs2-head-actions">
          <button class="wbs2-close" data-act="close" aria-label="关闭">✕</button>
        </span>
      </div>
      <div class="wbs2-body">
        <nav class="wbs2-nav"></nav>
        <div class="wbs2-content"></div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const navEl = root.querySelector('.wbs2-nav');
  const contentEl = root.querySelector('.wbs2-content');
  const paintNav = () => {
    navEl.innerHTML = visibleNav()
      .map((n) =>
        n.sep
          ? '<div class="wbs2-nav-sep"></div>'
          : `<button class="wbs2-nav-item" data-nav="${n.key}">${icon(n.ic)}<span>${n.label}</span></button>`
      )
      .join('');
  };
  paintNav();

  let active = 'credits';
  let toastEl = null;
  const expanded = new Set();   /* 记忆预览的展开态（重渲染不丢） */
  let memEdit = null;          /* { file, title, content, isNew }：正在编辑的记忆 */

  const toast = (msg) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'wbs2-toast';
      root.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl.__t);
    toastEl.__t = setTimeout(() => toastEl.classList.remove('show'), 1600);
  };

  const renderNav = () => {
    const keys = visibleNav().filter((n) => !n.sep).map((n) => n.key);
    if (!keys.includes(active)) active = keys[0] || 'appearance';   /* 当前页被隐藏就跳第一个 */
    paintNav();
    navEl.querySelectorAll('.wbs2-nav-item').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.nav === active);
    });
  };

  const fillAsync = () => {
    if (active !== 'data' || !navigator.storage?.estimate) return;
    navigator.storage.estimate().then((e) => {
      const s = contentEl.querySelector('[data-fill="storage"]');
      const q = contentEl.querySelector('[data-fill="quota"]');
      if (s) s.textContent = bytes(e.usage);
      if (q) q.textContent = bytes(e.quota);
    }).catch(() => {});
  };

  const renderPanel = () => {
    const build = PANELS[active];
    window.__wbdsSettingsError = null;
    try {
      contentEl.innerHTML = build ? build() : '';
    } catch (e) {
      /* 单页渲染出错时别静默留旧内容：把错误显示出来，也方便 daemon 排查 */
      window.__wbdsSettingsError = String((e && e.stack) || e);
      contentEl.innerHTML = `<pre class="wbs2-pre">渲染失败：${esc(String((e && e.message) || e))}</pre>`;
    }
    contentEl.scrollTop = 0;
    fillAsync();
  };

  const open = () => {
    renderNav();
    renderPanel();
    root.classList.add('open');
  };
  const close = () => root.classList.remove('open');

  const openNativeSettings = () => {
    close();
    try {
      window.__wbHostMenuCommand?.('menu.openSettings')?.catch?.(() => {});
    } catch { /* 非 Electron 环境忽略 */ }
  };

  const applyMode = (mode) => {
    localStorage.setItem(LS_MODE, mode === 'native' ? 'native' : 'dsh');
    if (mode === 'native') document.documentElement.removeAttribute('data-wbskin');
    else document.documentElement.setAttribute('data-wbskin', 'dsh');
    renderPanel();
  };

  const setCredVis = (on) => {
    localStorage.setItem(LS_CRED_VIS, on ? '1' : '0');
    const w = document.getElementById('wbds-credits-widget');
    if (w) w.style.display = on ? '' : 'none';
    renderPanel();
  };

  const setEffort = (val) => {
    const m = readJson(modelKey(), {});
    const map = readJson(effortKey(), {});
    if (m.id) { map[m.id] = val; m.reasoningEffort = val; write(modelKey(), JSON.stringify(m)); }
    write(effortKey(), JSON.stringify(map));
    renderPanel();
    toast('已保存');
  };

  const setThink = (on) => {
    const m = readJson(modelKey(), {});
    const map = readJson(thinkKey(), {});
    if (m.id) { map[m.id] = on; m.isThinking = on; write(modelKey(), JSON.stringify(m)); }
    write(thinkKey(), JSON.stringify(map));
    renderPanel();
    toast('已保存');
  };

  /* ---------- 记忆落盘：写命令 → 守护进程执行 → 读结果 ---------- */
  /* 记忆文件列表的指纹：文件增删改名都会变，比时间戳可靠
     （localdata 可能在 cmdResult 之前就推过去了，此时 ts 已经是最新的） */
  const memSig = () => ((localData() || {}).memory || []).map((m) => m.file).join('|');

  const pollCmd = (id, sig0) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      let r = null;
      try { r = JSON.parse(localStorage.getItem('wbds.cmdResult') || 'null'); } catch { r = null; }
      if (r && String(r.id) === String(id)) {
        clearInterval(timer);
        toast(r.ok ? r.msg : '失败：' + r.msg);
        if (!r.ok) return;
        /* 守护进程落盘后会再推一次 localdata：等列表指纹变了再重渲染 */
        let n = 0;
        const wait = setInterval(() => {
          n++;
          const changed = memSig() !== sig0;
          if (changed || n > 20) { clearInterval(wait); renderPanel(); }
        }, 400);
      } else if (Date.now() - t0 > 15000) {
        clearInterval(timer);
        toast('超时：守护进程可能没在跑');
      }
    }, 400);
  };

  const runCmd = (payload, note) => {
    const id = String(Date.now());
    const sig0 = memSig();
    write('wbds.cmd', JSON.stringify({ ...payload, id }));
    toast(note || '已提交');
    pollCmd(id, sig0);
  };

  const onClick = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const nav = t.closest('[data-nav]');
    if (nav) { active = nav.dataset.nav; renderNav(); renderPanel(); return; }
    const act = t.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;

    if (a === 'close') close();
    else if (a === 'native') openNativeSettings();
    else if (a === 'mode') applyMode(act.dataset.mode);
    else if (a === 'credvis') setCredVis(act.dataset.on !== '1');
    else if (a === 'widthreset') {
      document.documentElement.style.removeProperty('--wbds-content-w');
      renderPanel();
      toast('宽度已重置');
    } else if (a === 'nav-toggle') {
      const key = act.dataset.key;
      if (ALWAYS_ON.includes(key)) { toast('「外观」始终显示'); return; }
      const set = new Set(readHiddenNav());
      if (act.dataset.on === '1') set.add(key);
      else set.delete(key);
      if (set.size >= NAV.filter((n) => !n.sep).length - ALWAYS_ON.length) {
        toast('至少保留一个栏目'); return;
      }
      writeHiddenNav([...set]);
      renderNav();
      renderPanel();
      toast(act.dataset.on === '1' ? '已隐藏' : '已显示');
    } else if (a === 'nav-reset') {
      writeHiddenNav([]);
      renderNav();
      renderPanel();
      toast('已恢复全部栏目');
    } else if (a === 'mem-toggle') {
      const k = act.dataset.key;
      if (expanded.has(k)) expanded.delete(k);
      else expanded.add(k);
      renderPanel();
    } else if (a === 'mem-edit') {
      const d = localData() || {};
      const m = (d.memory || []).find((x) => x.file === act.dataset.file);
      if (!m) { toast('找不到这个文件'); return; }
      memEdit = { file: m.file, content: m.content ?? m.preview ?? '', isNew: false };
      renderPanel();
    } else if (a === 'mem-new') {
      memEdit = { file: '', title: '', content: '# ', isNew: true };
      renderPanel();
    } else if (a === 'mem-cancel') {
      memEdit = null;
      renderPanel();
    } else if (a === 'mem-save') {
      if (!memEdit) return;
      const isNew = memEdit.isNew;
      const payload = isNew
        ? { op: 'mem.create', title: (memEdit.title || '').trim(), content: memEdit.content || '' }
        : { op: 'mem.write', file: memEdit.file, content: memEdit.content || '' };
      memEdit = null;
      renderPanel();
      runCmd(payload, isNew ? '正在新建…' : '正在保存…');
    } else if (a === 'mem-del') {
      const file = act.dataset.file;
      if (!file) return;
      renderPanel();
      runCmd({ op: 'mem.delete', file }, '正在删除…');
    } else if (a === 'copy') {
      const text = act.dataset.copy || '';
      try { navigator.clipboard.writeText(text); } catch { /* 忽略 */ }
      toast('已复制');
    } else if (a === 'toggle') {
      const key = act.dataset.key;
      const on = act.dataset.on !== '1';
      writeBool(key, on);
      act.dataset.on = on ? '1' : '0';
      act.classList.toggle('is-on', on);
      toast('已保存');
    } else if (a === 'seg') {
      write(act.dataset.key, act.dataset.val);
      act.parentElement.querySelectorAll('.wbs2-seg-item').forEach((b) => b.classList.toggle('is-on', b === act));
      toast('已保存');
    } else if (a === 'effort') {
      setEffort(act.dataset.val);
    } else if (a === 'think') {
      setThink(act.dataset.on !== '1');
    } else if (a === 'open-archived') {
      /* 恢复单条/批量都交给原生「归档的任务」页 —— 那边是真的（走同一个会话 API），
         我们这边不再自己维护一份归档名单 */
      window.dispatchEvent(new CustomEvent('open-settings-archived-tasks'));
      toast('已打开归档列表');
    } else if (a === 'clear-cache') {
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
          toast(keys.length ? `已清理 ${keys.length} 个缓存` : '没有可清理的缓存');
          renderPanel();
        } catch { toast('清理失败'); }
      })();
    } else if (a === 'open-url') {
      const url = act.dataset.url;
      if (url) window.open(url, '_blank');
    }
  };
  const onInput = (e) => {
    const t = e.target;
    if (!memEdit || !(t instanceof Element)) return;
    if (t.dataset.act === 'mem-content') memEdit.content = t.value;
    else if (t.dataset.act === 'mem-title') memEdit.title = t.value;
  };

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);

  const onKey = (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) { e.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', onKey, true);

  return {
    open,
    close,
    destroy() {
      document.removeEventListener('keydown', onKey, true);
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.remove();
    },
  };
})();
