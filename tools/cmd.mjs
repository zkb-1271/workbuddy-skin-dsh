/**
 * 前端命令队列（daemon 每 5 秒调一次）
 *
 * 为什么需要它：renderer 是 file:// 页面，读不了也写不了 ~/.workbuddy。
 * 记忆页要能编辑，就必须有人在 Node 侧落盘。
 *
 * 协议（都走 localStorage，页面写、这里执行、这里回写结果）：
 *   wbds.cmd       = { id, op, file, content }
 *   wbds.cmdResult = { id, ok, msg, ts }
 *
 * 支持的操作：
 *   mem.write   改已有记忆文件
 *   mem.create  新建记忆文件
 *   mem.delete  删除（移到 memory/.trash，可恢复）
 *
 * 安全：只允许 memory 目录下的 .md，文件名做 basename 处理，路径必须落在根内。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const HOME = os.homedir();
const WB = path.join(HOME, '.workbuddy');
const MEM = path.join(WB, 'memory');
const TRASH = path.join(MEM, '.trash');
const PORT = process.env.CDP_PORT || '9222';
const BASE = 'http://127.0.0.1:' + PORT;
const LOCALDATA = path.join(path.dirname(new URL(import.meta.url).pathname), 'localdata.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function attach(t) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let seq = 0;
    const waiting = new Map();
    const bail = setTimeout(() => reject(new Error('attach 超时')), 5000);
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
      resolve({
        evalIn: async (expression) => {
          const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
          if (r.result?.subtype === 'error') throw new Error(r.result.description || 'eval error');
          return r.result?.value;
        },
        close: () => ws.close(),
      });
    };
    ws.onerror = () => { clearTimeout(bail); reject(new Error('ws error')); };
  });
}

/* 只允许 memory 目录下的 .md；返回绝对路径 */
const safePath = (file) => {
  const base = path.basename(String(file || ''));
  if (!base || !base.endsWith('.md') || base.startsWith('.')) throw new Error('文件名不合法');
  const p = path.join(MEM, base);
  if (!p.startsWith(MEM + path.sep)) throw new Error('越权路径');
  return p;
};

const slug = (s) =>
  String(s || '')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'memory';

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

const runOp = (cmd) => {
  fs.mkdirSync(MEM, { recursive: true });
  if (cmd.op === 'mem.write') {
    const p = safePath(cmd.file);
    if (!fs.existsSync(p)) throw new Error('文件不存在：' + cmd.file);
    fs.writeFileSync(p, String(cmd.content ?? ''), 'utf8');
    return { file: path.basename(p), msg: '已保存 ' + path.basename(p) };
  }
  if (cmd.op === 'mem.create') {
    const title = String(cmd.title || '').trim();
    if (!title) throw new Error('标题不能为空');
    const file = `${slug(title)}-${stamp()}.md`;
    const p = safePath(file);
    const body = String(cmd.content || '').trim() || `# ${title}\n\n`;
    fs.writeFileSync(p, body, 'utf8');
    return { file, msg: '已新建 ' + file };
  }
  if (cmd.op === 'mem.delete') {
    const p = safePath(cmd.file);
    if (!fs.existsSync(p)) throw new Error('文件不存在');
    fs.mkdirSync(TRASH, { recursive: true });
    const dest = path.join(TRASH, `${stamp()}-${path.basename(p)}`);
    fs.renameSync(p, dest);
    return { file: path.basename(p), msg: '已移到 memory/.trash' };
  }
  throw new Error('未知操作 ' + cmd.op);
};

async function main() {
  const list = await (await fetch(BASE + '/json/list')).json();
  const pages = list.filter((x) => x.type === 'page' && (x.url || '').includes('app.asar/renderer'));
  let c = null;
  for (const p of pages) {
    try {
      const cand = await attach(p);
      const id = await cand.evalIn("document.documentElement.dataset.windowAppId || 'main'");
      if (id === 'main') { c = cand; break; }
      cand.close();
    } catch { /* 下一个 */ }
  }
  if (!c) { console.error('cmd: 主窗口不存在'); process.exit(0); }

  let raw = null;
  try {
    raw = await c.evalIn("localStorage.getItem('wbds.cmd')");
  } catch {
    c.close();
    process.exit(0);
  }
  if (!raw) { c.close(); return; }        /* 没命令：立刻退出，别占资源 */

  let cmd = null;
  try { cmd = JSON.parse(raw); } catch { cmd = null; }
  if (!cmd || !cmd.id) {
    await c.evalIn("localStorage.removeItem('wbds.cmd')");
    c.close();
    return;
  }

  let result;
  try {
    const r = runOp(cmd);
    result = { id: cmd.id, ok: true, msg: r.msg, file: r.file, ts: Date.now() };
    console.log(`cmd: ${cmd.op} 成功 ${r.msg}`);
  } catch (e) {
    result = { id: cmd.id, ok: false, msg: String(e && e.message || e), ts: Date.now() };
    console.log(`cmd: ${cmd.op} 失败 ${result.msg}`);
  }

  const obj = JSON.stringify(result);
  await c.evalIn(`(() => {
    localStorage.setItem('wbds.cmdResult', ${JSON.stringify(obj)});
    localStorage.removeItem('wbds.cmd');
    return 1;
  })()`);
  c.close();

  /* 落盘成功后立刻刷一次列表，页面不用等 60 秒那一档 */
  if (result.ok) {
    spawn(process.execPath, [LOCALDATA], { detached: true, stdio: 'ignore' }).unref();
  }
  await sleep(30);
}

main().catch((e) => { console.error('cmd:', e.message); process.exit(0); });
