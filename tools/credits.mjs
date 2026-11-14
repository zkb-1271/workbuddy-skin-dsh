/**
 * 积分数据刷新（daemon 每 60s 调一次，节流在 daemon.sh 里）。
 *
 * 数据源：**主窗口自己的鉴权 HTTP 桥** `window.wb.http`（WorkBuddy 暴露的 SDK，
 * 走主进程发的请求，token 由应用自己续期）。
 *
 * 为什么不再用隐藏 iframe（2026-11-14 改）：
 * 以前是在主窗口里塞一个 workbuddy.cn 的隐藏 iframe，借它的同源 cookie 调接口。
 * 但那个 iframe 的登录态会过期（实测跳到 /login/，接口 401
 * `invalid_token: session expired`），而应用主进程的登录态是好的 ——
 * 结果就是侧栏积分永远显示「—」。现在直接借主进程的凭据，不再依赖 iframe。
 *
 * 接口（POST JSON）：
 *   /billing/meter/get-user-resource-summary  → data.TotalCredits 总剩余积分，
 *       data.CreditGroups[] 各积分池（Kind/Name/Cycle{Total,Remain,Used}Capacity）
 *   /billing/meter/get-user-request-usage     → data.total + data.data[] 每笔消耗
 *     参数 { startTime:'YYYY-MM-DD 00:00:00', endTime:'… 23:59:59', pageNum, pageSize }
 *
 * 写入：
 *   window.__wbdsCreditsData = { total, today, groups, ts }
 *   localStorage['wbds.credits.cache'] = 同上（重启后先显缓存）
 *
 * 失败退出码 1，daemon 记日志、60s 后重试。
 */
const PORT = process.env.CDP_PORT || '9222';
const BASE = 'http://127.0.0.1:' + PORT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' 超时 ' + ms + 'ms')), ms))]);

async function listTargets() {
  const r = await fetch(BASE + '/json/list');
  if (!r.ok) throw new Error('/json/list ' + r.status);
  return r.json();
}

/** 极简 CDP attach：返回 eval 函数 */
function attach(t) {
  return new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('attach 超时')), 5000);
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let seq = 0;
    const waiting = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    };
    ws.onopen = () => {
      clearTimeout(bail);
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = ++seq;
          waiting.set(id, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
          ws.send(JSON.stringify({ id, method, params }));
        });
      const evalIn = async (expression) => {
        const r = await withTimeout(send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }), 20000, 'eval');
        if (r.result?.subtype === 'error') throw new Error(r.result.description || 'eval error');
        return r.result?.value;
      };
      resolve({ send, evalIn, close: () => ws.close() });
    };
    ws.onerror = () => { clearTimeout(bail); reject(new Error('ws error')); };
  });
}

async function findMainTarget() {
  const ts = await listTargets();
  for (const t of ts.filter((x) => x.type === 'page' && (x.url || '').includes('app.asar/renderer'))) {
    try {
      const c = await attach(t);
      const id = await c.evalIn("document.documentElement.dataset.windowAppId || 'main'");
      if (id === 'main') return { t, c };
      c.close();
    } catch { /* 下一个 */ }
  }
  return null;
}

/* 在主窗口里完成：取数 + 写回 window / localStorage。 */
const FETCH_AND_STORE = `(async () => {
  const post = (u, b) => window.wb.http.post(u, b);
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const s = await post('/billing/meter/get-user-resource-summary', {});
  const data = (s && s.data) || {};
  const total = data.TotalCredits === undefined || data.TotalCredits === null
    ? null : parseFloat(data.TotalCredits);
  const groups = (data.CreditGroups || []).map((g) => ({
    kind: g.Kind,
    name: g.Name,
    total: parseFloat(g.CycleTotalCapacity || 0),
    remain: parseFloat(g.CycleRemainCapacity || 0),
    used: parseFloat(g.CycleUsedCapacity || 0),
  })).filter((g) => g.kind);

  let today = null;
  try {
    const pageSize = 500;
    let page = 1, sum = 0, totalRows = 0;
    for (let guard = 0; guard < 5; guard++) {
      const r = await post('/billing/meter/get-user-request-usage',
        { startTime: day + ' 00:00:00', endTime: day + ' 23:59:59', pageNum: page, pageSize });
      const rows = (r.data && r.data.data) || [];
      totalRows = (r.data && r.data.total) || 0;
      for (const row of rows) {
        if (String(row.requestTime || '').startsWith(day)) sum += parseFloat(row.credit || 0);
      }
      if (rows.length === 0 || page * pageSize >= totalRows) break;
      page++;
    }
    today = Math.round(sum * 100) / 100;
  } catch { today = null; }

  if (total === null && today === null) return { err: 'both empty' };
  const payload = { total, today, groups, ts: Date.now() };
  window.__wbdsCreditsData = payload;
  try { localStorage.setItem('wbds.credits.cache', JSON.stringify(payload)); } catch {}
  return payload;
})()`;

async function main() {
  const main = await withTimeout(findMainTarget(), 15000, '找主窗口');
  if (!main) { console.error('credits: 找不到主窗口'); process.exit(1); }

  let data;
  try {
    data = await main.c.evalIn(FETCH_AND_STORE);
  } catch (e) {
    data = { err: String((e && e.message) || e) };
  }
  main.c.close();

  if (!data || data.err) {
    console.error('credits: 取数失败', data && data.err);
    process.exit(1);
  }
  console.log(`credits: 总积分=${data.total} 今日=${data.today}`);
}

main().catch((e) => { console.error('credits:', e.message); process.exit(1); });
