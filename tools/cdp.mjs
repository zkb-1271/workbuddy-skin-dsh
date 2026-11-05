#!/usr/bin/env node
// 极简 CDP 客户端（零依赖，靠 Node 22 内建的 fetch / WebSocket）
// 用法：
//   node cdp.mjs targets                 列出可注入的页面
//   node cdp.mjs eval "<js 表达式>"       在页面里求值，返回 JSON
//   node cdp.mjs tokens                  导出 WorkBuddy 三层令牌的运行时全量快照
//   node cdp.mjs shot <输出路径.png>      截图
// 端口默认 9222，可用环境变量 CDP_PORT 覆盖。

import fs from 'node:fs';

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;

async function listTargets() {
  const r = await fetch(`${BASE}/json/list`);
  if (!r.ok) throw new Error(`/json/list ${r.status}`);
  return (await r.json()).filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
}

async function pickTarget(hint) {
  const ts = await listTargets();
  if (!ts.length) throw new Error('没有可用的 page target');

  // 最稳的选法：按窗口身份（设置页是独立 BrowserWindow）。
  // 序号不可靠 —— 关掉设置窗口再打开，新窗口会排到列表最前面。
  const want = process.env.CDP_APP;
  if (want) {
    for (const t of ts) {
      try {
        const r = await evalOn(t, "(() => (document.documentElement.dataset.windowAppId || 'main'))()");
        if (r === want) return t;
      } catch { /* 某个窗口没响应就跳过 */ }
    }
    throw new Error(`没有 windowAppId=${want} 的窗口`);
  }

  if (hint && /^\d+$/.test(hint)) {
    const i = Number(hint);
    if (!ts[i]) throw new Error(`target 序号越界：${i}，共 ${ts.length} 个`);
    return ts[i];
  }
  if (hint) {
    const hit = ts.find(t => (t.title || '').includes(hint) || (t.url || '').includes(hint));
    if (hit) return hit;
  }
  return ts[0];
}

/** 在指定 target 上跑一次求值（用于探测窗口身份） */
async function evalOn(t, expression) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
  try {
    const send = (method, params = {}) => new Promise((res, rej) => {
      const id = 1;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id === id) m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      };
      ws.send(JSON.stringify({ id, method, params }));
    });
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result?.value;
  } finally {
    ws.close();
  }
}

async function withSession(fn, hint) {
  const t = await pickTarget(hint || process.env.CDP_HINT || undefined);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let seq = 0;
  const waiting = new Map();
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = e => rej(new Error('ws error: ' + (e.message || 'unknown')));
  });
  ws.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && waiting.has(m.id)) {
      const { res, rej } = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    waiting.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  try {
    return await fn(send, t);
  } finally {
    ws.close();
  }
}

const EXPR = process.argv[3] || '';

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '--help') {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 10).join('\n'));
    return;
  }
  if (cmd === 'targets') {
    for (const t of await listTargets()) console.log(`${t.id}\n  title: ${t.title}\n  url:   ${(t.url || '').slice(0, 120)}`);
    return;
  }
  if (cmd === 'eval') {
    await withSession(async (send) => {
      const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
      console.log(JSON.stringify(r.result?.value ?? r.result, null, 1));
    });
    return;
  }
  if (cmd === 'tokens') {
    await withSession(async (send) => {
      const expr = `(() => {
        const cs = getComputedStyle(document.documentElement);
        const bs = getComputedStyle(document.body);
        const grab = (st, pre) => {
          const o = {};
          for (const n of st) if (n.startsWith(pre)) o[n] = st.getPropertyValue(n).trim();
          return o;
        };
        return {
          rootClass: document.documentElement.className,
          bodyAttrs: [...document.body.attributes].map(a => a.name + '=' + a.value),
          sheetCount: document.styleSheets.length,
          root: { cb: grab(cs,'--cb-'), wb: grab(cs,'--wb-'), cbvscode: grab(cs,'--cb-vscode-') },
          body: { cb: grab(bs,'--cb-'), wb: grab(bs,'--wb-'), dsw: grab(bs,'--dsw-'), dsh: grab(bs,'--dsh-') }
        };
      })()`;
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      const v = r.result?.value;
      if (!v) { console.log(JSON.stringify(r, null, 1)); return; }
      console.log(`root.class = ${v.rootClass}`);
      console.log(`body attrs = ${v.bodyAttrs.join(' ')}`);
      console.log(`styleSheets = ${v.sheetCount}`);
      console.log(`:root --cb-* = ${Object.keys(v.root.cb).length}, --wb-* = ${Object.keys(v.root.wb).length}`);
      console.log(`body --cb-* = ${Object.keys(v.body.cb).length}, --dsw-* = ${Object.keys(v.body.dsw).length}`);
      fs.writeFileSync('runtime-tokens.json', JSON.stringify(v, null, 1));
      console.log('→ 已写 runtime-tokens.json');
    });
    return;
  }
  if (cmd === 'click') {
    const [x, y] = [Number(process.argv[3]), Number(process.argv[4])];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('用法: click <x> <y>');
    await withSession(async (send) => {
      const base = { x, y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await new Promise(r => setTimeout(r, 40));
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
      console.log(`→ clicked ${x},${y}`);
    });
    return;
  }
  if (cmd === 'run') {
    const file = process.argv[3];
    if (!file) throw new Error('缺少脚本路径');
    const code = fs.readFileSync(file, 'utf8');
    await withSession(async (send) => {
      const r = await send('Runtime.evaluate', {
        expression: `(async () => { ${code} })()`,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      });
      if (r.exceptionDetails) {
        console.error('✘ 页面内异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails, null, 1));
        process.exit(1);
      }
      const v = r.result?.value;
      console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
    });
    return;
  }
  if (cmd === 'css') {
    const file = process.argv[3];
    if (!file) throw new Error('用法: css <样式文件路径>');
    const css = fs.readFileSync(file, 'utf8');
    await withSession(async (send) => {
      const expr = `(() => {
        const ID = 'wb-dsh-skin';
        let el = document.getElementById(ID);
        if (!el) { el = document.createElement('style'); el.id = ID; document.head.appendChild(el); }
        el.textContent = ${JSON.stringify(css)};
        return { ok: true, id: ID, bytes: el.textContent.length };
      })()`;
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      console.log('→ 已注入 ' + r.result.value.bytes + ' 字节到 #' + r.result.value.id);
    });
    return;
  }
  if (cmd === 'restore') {
    await withSession(async (send) => {
      const r = await send('Runtime.evaluate', {
        expression: `(() => { const e = document.getElementById('wb-dsh-skin'); if (e) { e.remove(); return 'removed'; } return 'none'; })()`,
        returnByValue: true,
      });
      console.log('→ ' + r.result.value);
    });
    return;
  }
  if (cmd === 'key') {
    // 用法: node cdp.mjs key "Meta+Comma"   （支持 Meta/Shift/Alt/Control 组合）
    const spec = process.argv[3];
    if (!spec) throw new Error('用法: key "Meta+Comma"');
    const parts = spec.split('+');
    const code = parts.pop();
    const mods = parts.map(p => p.toLowerCase());
    const KEYMAP = {
      Comma: { key: ',', vk: 188, text: ',' },
      Period: { key: '.', vk: 190, text: '.' },
      Escape: { key: 'Escape', vk: 27 },
      Enter: { key: 'Enter', vk: 13, text: '\r' },
    };
    const k = KEYMAP[code] || { key: code, vk: 0 };
    let modifiers = 0;
    if (mods.includes('alt')) modifiers |= 1;
    if (mods.includes('control')) modifiers |= 2;
    if (mods.includes('meta')) modifiers |= 4;
    if (mods.includes('shift')) modifiers |= 8;

    await withSession(async (send) => {
      const base = {
        modifiers, key: k.key, code,
        windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
      };
      await send('Input.dispatchKeyEvent', {
        type: k.text ? 'keyDown' : 'rawKeyDown', ...base, text: k.text,
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      console.log(`→ key ${spec}`);
    });
    return;
  }
  if (cmd === 'front') {
    await withSession(async (send) => {
      await send('Page.bringToFront');
      console.log('→ 窗口已置前');
    });
    return;
  }
  if (cmd === 'pseudo') {
    // 强制 :hover 后截图 —— 合成鼠标事件不一定能稳定压住 :hover，这个才可靠
    const [selector, out] = process.argv.slice(3, 5);
    if (!selector || !out) throw new Error('用法: pseudo <selector> <out.png>');
    await withSession(async (send) => {
      await send('DOM.enable');
      await send('CSS.enable');
      const doc = await send('DOM.getDocument', { depth: -1 });
      const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
      if (!q.nodeId) throw new Error('选择器没匹配到元素: ' + selector);
      await send('CSS.forcePseudoState', { nodeId: q.nodeId, forcedPseudoClasses: ['hover'] });
      await new Promise((r) => setTimeout(r, 320));
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      await send('CSS.forcePseudoState', { nodeId: q.nodeId, forcedPseudoClasses: [] });
      console.log('→ ' + out);
    });
    return;
  }
  if (cmd === 'hshot') {
    // 悬停 + 截图同一会话内完成：分开跑会丢 :hover 状态
    const [x, y, out] = process.argv.slice(3, 6);
    if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y)) || !out) {
      throw new Error('用法: hshot <x> <y> <out.png>');
    }
    await withSession(async (send) => {
      for (let i = 0; i < 3; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Number(x) + i, y: Number(y), button: 'none', buttons: 0 });
        await new Promise((r) => setTimeout(r, 60));
      }
      await new Promise((r) => setTimeout(r, 260));
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log('→ ' + out);
    });
    return;
  }
  if (cmd === 'move') {
    const [x, y] = process.argv.slice(3, 5).map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('用法: move <x> <y>');
    await withSession(async (send) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    });
    return;
  }
  if (cmd === 'drag') {
    const [x1, y1, x2, y2] = process.argv.slice(3, 7).map(Number);
    if ([x1, y1, x2, y2].some(n => !Number.isFinite(n))) throw new Error('用法: drag <x1> <y1> <x2> <y2>');
    await withSession(async (send) => {
      const base = { button: 'left', buttons: 1, pointerType: 'mouse' };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1, button: 'none', buttons: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, clickCount: 1, ...base });
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const x = Math.round(x1 + ((x2 - x1) * i) / steps);
        const y = Math.round(y1 + ((y2 - y1) * i) / steps);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, ...base });
        await new Promise(r => setTimeout(r, 16));
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, clickCount: 1, ...base, buttons: 0 });
      console.log(`→ dragged ${x1},${y1} -> ${x2},${y2}`);
    });
    return;
  }
  if (cmd === 'shot') {
    const out = process.argv[3];
    if (!out) throw new Error('缺少输出路径');
    await withSession(async (send) => {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
      console.log('→ ' + out);
    });
    return;
  }
  throw new Error('未知命令: ' + cmd);
}

main().catch(e => { console.error('✘ ' + e.message); process.exit(1); });
