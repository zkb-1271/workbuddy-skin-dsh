/**
 * WorkBuddy · dsh 皮肤 · 侧栏左下角积分小组件
 *
 * 数据链路（file:// 页面跨域拿不到 www.workbuddy.cn 的接口，所以分两层）：
 *   1. 本模块负责：创建隐藏 iframe（加载积分页，为主窗口提供一个
 *      workbuddy.cn 同源的 CDP target）+ 在侧栏左下角渲染小组件。
 *   2. daemon 侧的 .internal/tools/credits.mjs 每 60s 通过 CDP 挂进
 *      iframe 上下文调积分接口（summary / request-usage，已实测可用），
 *      把结果写回 window.__wbdsCreditsData + localStorage 缓存。
 *   3. 本模块每 1.5s 轮询渲染，重启后先显示缓存。
 *
 * 幂等：重复注入先 destroy（iframe 会重建，数据缓存不丢）。
 */
window.__wbdsCredits?.destroy?.();

window.__wbdsCredits = (() => {
  const FRAME_ID = 'wbds-credits-frame';
  const WIDGET_ID = 'wbds-credits-widget';
  const CACHE_KEY = 'wbds.credits.cache';

  /* 隐藏 iframe：本身不读它的 DOM，只为 daemon 提供 CDP target。
     放 body 下（不在 React 树里），SPA 换页不影响。 */
  let frame = document.getElementById(FRAME_ID);
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    frame.src = 'https://www.workbuddy.cn/profile/credits-usage?embed=1&theme=light';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText =
      'position:fixed;left:-9999px;top:0;width:900px;height:700px;border:0;visibility:hidden;';
    (document.body || document.documentElement).appendChild(frame);
  }

  const fmt = (v) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return String(Math.round(v * 10) / 10);
  };

  const ensureWidget = () => {
    let w = document.getElementById(WIDGET_ID);
    if (w && w.isConnected) return w;
    const sb = document.querySelector('.conversation-sidebar');
    if (!sb) return null;
    w = document.createElement('div');
    w.id = WIDGET_ID;
    w.innerHTML =
      '<button class="wbds-c-avatar" type="button" aria-label="打开设置" title="设置">' +
      '<img alt="" src="' + (window.__WBDS_AVATAR || '') + '"></button>' +
      '<span class="wbds-c-label">总积分</span>' +
      '<span class="wbds-c-num" data-c="total">—</span>' +
      '<span class="wbds-c-dot">·</span>' +
      '<span class="wbds-c-label">今日</span>' +
      '<span class="wbds-c-num" data-c="today">—</span>';
    /* 点头像 → 自建设置页（settings2.js）。没有就什么都不做。 */
    w.querySelector('.wbds-c-avatar').addEventListener('click', (e) => {
      e.stopPropagation();
      window.__wbdsSettings2?.open?.();
    });
    sb.appendChild(w);
    return w;
  };

  const render = () => {
    const w = ensureWidget();
    if (!w) return;
    const visible = localStorage.getItem('wbds.credits.visible') !== '0';
    if (w.style.display !== (visible ? '' : 'none')) w.style.display = visible ? '' : 'none';
    let d = window.__wbdsCreditsData;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    if (!d) {
      try { d = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { d = null; }
    }
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    if (!d || d.err) return;
    const t = w.querySelector('[data-c="total"]');
    const day = w.querySelector('[data-c="today"]');
    const total = fmt(d.total);
    const today = d.today === null || d.today === undefined ? '—' : fmt(d.today);
    if (t.textContent !== total) t.textContent = total;
    if (day.textContent !== today) day.textContent = today;
    const when = d.ts ? new Date(d.ts).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    w.title = when ? '更新于 ' + when : '积分';
  };

  const timer = setInterval(render, 1500);
  render();

  return {
    destroy() {
      clearInterval(timer);
      document.getElementById(WIDGET_ID)?.remove();
      document.getElementById(FRAME_ID)?.remove();
    },
  };
})();
