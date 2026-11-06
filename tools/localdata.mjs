/**
 * 本地配置/数据采集（daemon 每 60s 调一次，与 credits.mjs 同一档节流）
 *
 * 为什么需要它：renderer 是 file:// 页面，读不了 ~/.workbuddy 下的文件；
 * 这些信息（记忆、插件、技能、磁盘占用、权限模式）只能由 Node 侧读盘，
 * 再通过 CDP 写回页面给自建设置页用：
 *   window.__wbdsLocalData = {...}
 *   localStorage['wbds.local.cache'] = 同上
 *
 * 采集项（实测存在）：
 *   ~/.workbuddy/memory/<uid>_memory.md      用户记忆（Markdown）
 *   ~/.workbuddy/user-<uid>-personal/*.md    IDENTITY / MEMORY / USER / SOUL
 *   ~/AGENTS.md                              全局 agent 规则
 *   ~/.workbuddy/plugins/installed_plugins.json + settings.json enabledPlugins
 *   ~/.workbuddy/skills/*                    本地技能目录
 *   ~/.workbuddy/preferences.json (storage/user-*-personal/global/preferences.json)
 *   du -sk ~/.workbuddy/*                    各目录占用
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const HOME = os.homedir();
const WB = path.join(HOME, '.workbuddy');
const PORT = process.env.CDP_PORT || '9222';
const BASE = 'http://127.0.0.1:' + PORT;

const readJson = (p, d = null) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; }
};
const safeStat = (p) => {
  try { const s = fs.statSync(p); return { bytes: s.size, mtime: s.mtimeMs }; } catch { return null; }
};

/* 取 Markdown 的第一个标题当标题，去掉 RAW_JSON 区 */
const titleOf = (text, fallback) => {
  const t = text.split('\n').map((l) => l.trim()).find((l) => /^#{1,3}\s+/.test(l));
  return t ? t.replace(/^#{1,3}\s+/, '').slice(0, 40) : fallback;
};
const cleanBody = (text) =>
  text
    .replace(/<!--\s*RAW_JSON_START[\s\S]*?RAW_JSON_END\s*-->/g, '')
    .replace(/^#.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const collectMemory = (uid) => {
  const dir = path.join(WB, 'memory');
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return out; }
  for (const f of files) {
    const p = path.join(dir, f);
    const st = safeStat(p);
    if (!st) continue;
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const body = cleanBody(text);
    out.push({
      file: f,
      title: titleOf(text, f.replace(/_.*$/, '')),
      bytes: st.bytes,
      mtime: st.mtime,
      // 预览截断，别把整份文件塞进 localStorage
      preview: body.slice(0, 400),
      // 编辑页需要全文；记忆文件都很小，200KB 封顶足够
      content: text.slice(0, 200000),
      mine: f.startsWith(uid),
    });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
};

const collectUserDocs = (uid) => {
  const dir = path.join(WB, 'user-' + uid + '-personal');
  const out = [];
  for (const name of ['IDENTITY.md', 'MEMORY.md', 'USER.md', 'SOUL.md']) {
    const st = safeStat(path.join(dir, name));
    if (st) out.push({ name, bytes: st.bytes, mtime: st.mtime });
  }
  return out;
};

const collectPlugins = () => {
  /* installed_plugins.json 结构：{ version, plugins: { "名字@来源": [...] } }
     —— 直接数 plugins 的键，别递归字符串（会把 marketplace 里的一堆名字也算进去） */
  const installed = readJson(path.join(WB, 'plugins', 'installed_plugins.json'), {});
  const settings = readJson(path.join(WB, 'settings.json'), {});
  const enabled = settings && settings.enabledPlugins ? Object.keys(settings.enabledPlugins) : [];
  const names = installed && installed.plugins && typeof installed.plugins === 'object'
    ? Object.keys(installed.plugins)
    : [];
  const items = [...new Set([...names, ...enabled])].sort();
  return { total: items.length, enabled: enabled.length, items: items.slice(0, 24) };
};

const collectSkills = () => {
  const dir = path.join(WB, 'skills');
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { }
  return names.map((n) => {
    const st = safeStat(path.join(dir, n));
    return { name: n, mtime: st ? st.mtime : 0 };
  });
};

const collectDisk = async () => {
  try {
    const { stdout } = await execFileP('du', ['-sk', WB], { maxBuffer: 8 << 20 });
    // du -sk <dir> 只给总量；下面用 readdir 逐个算一级子目录
    const subs = fs.readdirSync(WB, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    const out = [];
    for (const name of subs) {
      try {
        const { stdout: s } = await execFileP('du', ['-sk', path.join(WB, name)], { maxBuffer: 4 << 20 });
        const kb = parseInt(s.trim().split(/\s+/)[0], 10);
        if (kb >= 1024) out.push({ name, bytes: kb * 1024 });
      } catch { }
    }
    const totalKb = parseInt(stdout.trim().split(/\s+/)[0], 10);
    return { total: totalKb * 1024, items: out.sort((a, b) => b.bytes - a.bytes).slice(0, 6) };
  } catch {
    return null;
  }
};

const collectPrefs = (uid) => {
  const p = path.join(WB, 'storage', 'user-' + uid + '-personal', 'global', 'preferences.json');
  const d = readJson(p, {}) || {};
  return {
    permissionMode: d.localTaskPermissionMode || '',
    skillAutoInstall: d.skillSecurityAutoInstallNonHighRisk,
  };
};

/* ---------- CDP 写回 ---------- */
async function listTargets() {
  const r = await fetch(BASE + '/json/list');
  return r.json();
}
function attach(t) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    const bail = setTimeout(() => reject(new Error('attach 超时')), 5000);
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
      resolve({
        send,
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

/* 沙箱规则：~/.workbuddy/settings.json 的 sandbox 段 */
const collectSandbox = () => {
  const cfg = readJson(path.join(WB, 'settings.json'), {}) || {};
  const sb = cfg.sandbox || {};
  const extra = Array.isArray(sb.extraAllowWrite) ? sb.extraAllowWrite.length : 0;
  const ord = sb.orderedRules || {};
  let rules = 0;
  const groups = [];
  for (const [kind, v] of Object.entries(ord)) {
    const list = Array.isArray(v) ? v : v && Array.isArray(v.rules) ? v.rules : [];
    if (list.length) {
      rules += list.length;
      groups.push({ kind, n: list.length, customized: !!(v && v.customized) });
    }
  }
  return { rules, extra, groups };
};

async function main() {
  const ts = await listTargets();
  /* 设置窗口也是 app.asar/renderer 页面 —— 必须按 windowAppId 挑主窗口 */
  const pages = ts.filter((x) => x.type === 'page' && (x.url || '').includes('app.asar/renderer'));
  let c = null;
  for (const p of pages) {
    try {
      const cand = await attach(p);
      const id = await cand.evalIn("document.documentElement.dataset.windowAppId || 'main'");
      if (id === 'main') { c = cand; break; }
      cand.close();
    } catch { /* 下一个 */ }
  }
  if (!c) { console.error('localdata: 主窗口不存在'); process.exit(1); }
  const uid = await c.evalIn(`(() => {
    try {
      const sp = new URLSearchParams(location.search);
      let raw = sp.get('accountSnapshot') || '';
      for (let i = 0; i < 2 && /%[0-9A-F]{2}/i.test(raw); i++) raw = decodeURIComponent(raw);
      return (JSON.parse(raw) || {}).uid || '';
    } catch { return ''; }
  })()`);

  const agentsMd = safeStat(path.join(HOME, 'AGENTS.md'));
  const data = {
    ts: Date.now(),
    uid,
    memory: collectMemory(uid),
    userDocs: collectUserDocs(uid),
    agentsMd: agentsMd
      ? { bytes: agentsMd.bytes, mtime: agentsMd.mtime, lines: (() => { try { return fs.readFileSync(path.join(HOME, 'AGENTS.md'), 'utf8').split('\n').length; } catch { return 0; } })() }
      : null,
    plugins: collectPlugins(),
    skills: collectSkills(),
    disk: await collectDisk(),
    prefs: collectPrefs(uid),
    sandbox: collectSandbox(),
  };

  const obj = JSON.stringify(data);
  const str = JSON.stringify(obj);
  await c.evalIn(`(() => {
    window.__wbdsLocalData = ${obj};
    try { localStorage.setItem('wbds.local.cache', ${str}); } catch {}
    return 1;
  })()`);
  c.close();
  console.log(`localdata: 记忆 ${data.memory.length} · 插件 ${data.plugins.total} · 技能 ${data.skills.length} · 磁盘 ${data.disk ? Math.round(data.disk.total / 1e9 * 10) / 10 + 'GB' : '—'}`);
}

main().catch((e) => { console.error('localdata:', e.message); process.exit(1); });
