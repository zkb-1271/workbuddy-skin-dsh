/**
 * WorkBuddy · dsh 皮肤 —— 主窗口的模式跟随
 *
 * 设置窗口点了「dsh」主题卡之后，要通知主窗口把皮肤挂上/摘掉。
 * 两个窗口同源（file:// 同一个 index.html），localStorage 是共享的，
 * 因此用 storage 事件做跨窗口广播，不需要额外开端口或 IPC。
 *
 * 只在主窗口生效：设置窗口里有 switch.js 自己处理。
 */
window.__wbdsModeSync?.destroy?.();

window.__wbdsModeSync = (() => {
  const LS_MODE = 'wbds.skin.mode';

  const apply = (mode) => {
    if (mode === 'native') document.documentElement.removeAttribute('data-wbskin');
    else document.documentElement.setAttribute('data-wbskin', 'dsh');
  };

  const readMode = () => {
    try { return localStorage.getItem(LS_MODE) === 'native' ? 'native' : 'dsh'; } catch { return 'dsh'; }
  };

  const onStorage = (e) => {
    if (e.key !== LS_MODE) return;
    apply(e.newValue === 'native' ? 'native' : 'dsh');
  };

  window.addEventListener('storage', onStorage);

  /* 兜底：有些情况下 storage 事件不会跨窗口派发（例如同进程内某些场景），
     再监听一个显式广播键，双方都写一遍。 */
  const broadcastKey = 'wbds.mode.ping';
  const onPing = (e) => {
    if (e.key !== broadcastKey) return;
    const mode = (() => { try { return JSON.parse(e.newValue || '{}').mode; } catch { return null; } })();
    if (mode) apply(mode === 'native' ? 'native' : 'dsh');
  };
  window.addEventListener('storage', onPing);

  /* 当前窗口被重新加载/注入时，按存储值恢复一次 */
  apply(readMode());

  return {
    mode: readMode(),
    apply,
    destroy() {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('storage', onPing);
    },
  };
})();
