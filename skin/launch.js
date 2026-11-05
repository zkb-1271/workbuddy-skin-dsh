/**
 * WorkBuddy · dsh 皮肤启动器（主窗口用）
 *
 * 职责单一：按 localStorage 里的选择决定是否挂 data-wbskin，
 * 并监听跨窗口的 storage 变更 —— 设置页里拨开关，主窗口即时跟随。
 * 不注入任何样式，样式由 main.css 负责。
 */

window.__wbdsLaunch = (() => {
  const KEY = 'wbds.skin.mode';
  const ATTR = 'data-wbskin';

  const read = () => {
    try {
      return localStorage.getItem(KEY) === 'native' ? 'native' : 'dsh';
    } catch {
      return 'dsh';
    }
  };

  const apply = () => {
    if (read() === 'dsh') document.documentElement.setAttribute(ATTR, 'dsh');
    else document.documentElement.removeAttribute(ATTR);
    return document.documentElement.getAttribute(ATTR);
  };

  if (!window.__wbdsStorageBound) {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) apply();
    });
    window.__wbdsStorageBound = true;
  }

  apply();

  return { mode: read(), skin: document.documentElement.getAttribute(ATTR) };
})();
