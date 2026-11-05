/**
 * 积分数据刷新（daemon 每 60s 调一次，节流在 daemon.sh 里）。
 *
 * 原理：主窗口（file://）跨域拿不到 www.workbuddy.cn 的积分接口；
 * skin/credits.js 在主窗口里放了一个隐藏 iframe（workbuddy.cn 同源），
 * 本脚本通过 CDP 挂进 iframe 上下文调接口，再把结果写回主窗口：
 *   window.__wbdsCreditsData = { total, today, ts }
 *   localStorage['wbds.credits.cache'] = 同上（重启后先显缓存）
 *
 * 实测可用的两个接口（都是 POST JSON，cookie 鉴权）：
 *   /billing/meter/get-user-resource-summary  → data.TotalCredits 总剩余积分
 *   /billing/meter/get-user-request-usage     → data.total + data.data[] 每笔消耗
 *     参数 { startTime:'YYYY-MM-DD 00:00:00', endTime:'… 23:59:59', pageNum, pageSize }
 *     （注意 get-user-daily-usage 用同样的参数会 400 invalid params，别用）
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

async function findFrameTarget(tries = 20) {
  for (let i = 0; i < tries; i++) {
    try {
      const ts = await listTargets();
      const hit = ts.find((x) => (x.url || '').includes('credits-usage'));
      if (hit) return hit;
    } catch { /* 端口抖动，重试 */ }
    await sleep(500);
  }
  return null;
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

const FETCH_EXPR = `(async () => {
  const post = async (u, b) => {
    const r = await fetch(u, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return r.json();
  };
  try {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const s = await post('/billing/meter/get-user-resource-summary', {});
    const total = s && s.data ? parseFloat(s.data.TotalCredits) : null;
    const groups = ((s && s.data && s.data.CreditGroups) || [])
      .map((g) => ({
        kind: g.Kind,
        name: g.Name,
        total: parseFloat(g.CycleTotalCapacity || 0),
        remain: parseFloat(g.CycleRemainCapacity || 0),
        used: parseFloat(g.CycleUsedCapacity || 0),
      }))
      .filter((g) => g.kind);
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
          if (String(row.requestTime || '').startsWith(day)) {
            sum += parseFloat(row.credit || 0);
          }
        }
        if (rows.length === 0 || page * pageSize >= totalRows) break;
        page++;
      }
      today = Math.round(sum * 100) / 100;
    } catch { today = null; }
    if (total === null && today === null) return { err: 'both empty' };
    return { total, today, groups, ts: Date.now() };
  } catch (e) {
    return { err: String((e && e.message) || e) };
  }
})()`;

async function main() {
  const frame = await withTimeout(findFrameTarget(), 15000, '找 iframe');
  console.error('credits: iframe target', frame ? 'ok' : 'missing');
  if (!frame) {
    console.error('credits: 隐藏 iframe target 不存在（皮肤可能还没注入）');
    process.exit(1);
  }
  const c = await attach(frame);
  console.error('credits: attached iframe');
  const data = await c.evalIn(FETCH_EXPR);
  console.error('credits: fetched', JSON.stringify(data).slice(0, 120));
  c.close();
  if (!data || data.err) {
    console.error('credits: 取数失败', data && data.err);
    process.exit(1);
  }
  const main = await withTimeout(findMainTarget(), 15000, '找主窗口');
  if (!main) {
    console.error('credits: 找不到主窗口');
    process.exit(1);
  }
  const obj = JSON.stringify(data);              /* 对象字面量，赋给 window */
  const str = JSON.stringify(JSON.stringify(data)); /* 字符串字面量，给 localStorage */
  await main.c.evalIn(
    `(() => { window.__wbdsCreditsData = ${obj}; try { localStorage.setItem('wbds.credits.cache', ${str}); } catch {} return 1; })()`
  );
  main.c.close();
  console.log(`credits: 总积分=${data.total} 今日=${data.today}`);
}

main().catch((e) => { console.error('credits:', e.message); process.exit(1); });
