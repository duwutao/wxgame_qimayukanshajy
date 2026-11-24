/**
 * 平台适配层
 * 同时支持 微信小游戏(wx) / 抖音小游戏(tt) / 浏览器(web)
 * 对外只暴露一套 API：canvas、设计坐标、触摸、存储、raf。
 */

const DESIGN_WIDTH = 750;

function detectHost() {
  if (typeof tt !== 'undefined' && typeof tt.createCanvas === 'function') return 'tt';
  if (typeof wx !== 'undefined' && typeof wx.createCanvas === 'function') return 'wx';
  return 'web';
}

function createRuntime() {
  const host = detectHost();
  const api = host === 'tt' ? tt : host === 'wx' ? wx : null;

  let canvas;
  let screenW;
  let screenH;
  let dpr;
  let topInset = 0;

  if (api) {
    canvas = api.createCanvas();
    const info = api.getWindowInfo ? api.getWindowInfo() : api.getSystemInfoSync();
    screenW = info.windowWidth;
    screenH = info.windowHeight;
    dpr = info.pixelRatio || 2;
    // 小游戏右上角有胶囊按钮（微信/抖音都有），顶栏要让开它
    try {
      if (api.getMenuButtonBoundingClientRect) {
        const menu = api.getMenuButtonBoundingClientRect();
        if (menu && menu.height > 0 && menu.bottom > 0) topInset = menu.bottom + 6;
      }
    } catch (e) {
      // ignore
    }
    if (!topInset && info.safeArea && info.safeArea.top) {
      topInset = info.safeArea.top;
    }
  } else {
    const stage = document.getElementById('stage');
    const host = stage || document.body;
    canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.background = '#100d0a';
    document.body.style.overflow = 'hidden';
    host.appendChild(canvas);
    screenW = host.clientWidth || window.innerWidth || 375;
    screenH = host.clientHeight || window.innerHeight || 667;
    dpr = window.devicePixelRatio || 1;
    // 页面首帧可能还没完成布局，尺寸为 0 时用保底值，避免除零产生 NaN
    if (!screenW || screenW <= 0) screenW = 375;
    if (!screenH || screenH <= 0) screenH = 667;
  }

  if (!dpr || dpr <= 0) dpr = 1;

  // 手游端性能保护：像素风对像素密度不敏感，dpr 封顶 2 倍，避免 3 倍屏填充率过高掉帧
  if (dpr > 2) dpr = 2;

  // 顶部让位量兜底：异常机型返回离谱数值时不至于把画面挤空
  if (!(topInset > 0)) topInset = 0;
  if (topInset > screenH * 0.22) topInset = Math.round(screenH * 0.22);

  const scale = screenW / DESIGN_WIDTH;
  const vw = DESIGN_WIDTH;
  let vh = (screenH - topInset) / scale;
  if (!isFinite(vh) || vh <= 0) vh = 1334;

  // 部分安卓机 canvas 单边上限 4096，超限时降低有效 dpr 而不是让画布失真
  const MAX_SIDE = 4096;
  let cw = Math.floor(screenW * dpr);
  let ch = Math.floor(screenH * dpr);
  if (cw > MAX_SIDE || ch > MAX_SIDE) {
    const k = MAX_SIDE / Math.max(cw, ch);
    dpr = Math.max(0.5, dpr * k);
    cw = Math.floor(screenW * dpr);
    ch = Math.floor(screenH * dpr);
  }

  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext('2d');
  // 设计坐标原点整体下移 topInset，让开小游戏胶囊按钮
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, topInset * dpr);
  ctx.imageSmoothingEnabled = false;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';

  const runtime = {
    host,
    api,
    canvas,
    ctx,
    width: vw,
    height: vh,
    screenW,
    screenH,
    dpr,
    scale,
    topInset: topInset * (DESIGN_WIDTH / screenW),
    topInsetPx: topInset,
    createCanvas: function () {
      if (api) return api.createCanvas();
      const c = document.createElement('canvas');
      return c;
    },
    now: function () {
      return Date.now();
    },
    raf: function (cb) {
      if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
      if (api && typeof api.requestAnimationFrame === 'function') {
        return api.requestAnimationFrame(cb);
      }
      return setTimeout(function () {
        cb(Date.now());
      }, 16);
    },
    /** 绑定触摸 / 鼠标，回调参数为设计坐标 */
    onTouch: function (handlers) {
      const k = DESIGN_WIDTH / screenW;
      const toDesignX = function (px) {
        return px * k;
      };
      const toDesignY = function (py) {
        return (py - topInset) * k;
      };

      const fire = function (name, x, y) {
        const fn = handlers[name];
        if (fn) fn(toDesignX(x), toDesignY(y));
      };

      // 双指缩放：两指落下后，单指的点击/拖动全部让位给缩放
      let pinch = null;
      let blocked = false;

      const centerOf = function (ts) {
        const a = ts[0];
        const b = ts[1];
        return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      };
      const distOf = function (ts) {
        const dx = ts[1].clientX - ts[0].clientX;
        const dy = ts[1].clientY - ts[0].clientY;
        return Math.max(1, Math.sqrt(dx * dx + dy * dy));
      };
      const beginPinch = function (ts) {
        pinch = { startDist: distOf(ts) };
        blocked = true;
        const c = centerOf(ts);
        fire('pinchStart', c.x, c.y);
      };
      const movePinch = function (ts) {
        if (!pinch) beginPinch(ts);
        else {
          const c = centerOf(ts);
          fire('pinch', distOf(ts) / pinch.startDist, c.x, c.y);
        }
      };
      const endPinch = function (remain) {
        if (pinch) {
          pinch = null;
          fire('pinchEnd', -999, -999);
        }
        if (remain === 0) blocked = false;
      };

      if (api) {
        api.onTouchStart(function (res) {
          const ts = res.touches || [];
          if (ts.length >= 2) {
            if (!pinch) beginPinch(ts);
            return;
          }
          if (blocked) return;
          const t = ts[0] || (res.changedTouches && res.changedTouches[0]);
          if (t) fire('start', t.clientX, t.clientY);
        });
        api.onTouchMove(function (res) {
          const ts = res.touches || [];
          if (ts.length >= 2) {
            movePinch(ts);
            return;
          }
          if (blocked || pinch) return;
          const t = ts[0] || (res.changedTouches && res.changedTouches[0]);
          if (t) fire('move', t.clientX, t.clientY);
        });
        api.onTouchEnd(function (res) {
          const remain = (res.touches || []).length;
          if (pinch || blocked) {
            endPinch(remain);
            return;
          }
          const t = (res.changedTouches && res.changedTouches[0]) || (res.touches && res.touches[0]);
          if (t) fire('end', t.clientX, t.clientY);
          else fire('end', -999, -999);
        });
        if (api.onTouchCancel) {
          api.onTouchCancel(function () {
            pinch = null;
            blocked = false;
            fire('pinchEnd', -999, -999);
          });
        }
        return;
      }

      const rectPoint = function (e) {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        return [cx * (screenW / rect.width), cy * (screenH / rect.height)];
      };

      let mouseDown = false;
      canvas.addEventListener('mousedown', function (e) {
        mouseDown = true;
        const p = rectPoint(e);
        fire('start', p[0], p[1]);
      });
      canvas.addEventListener('mousemove', function (e) {
        if (!mouseDown) return;
        const p = rectPoint(e);
        fire('move', p[0], p[1]);
      });
      canvas.addEventListener('mouseup', function (e) {
        mouseDown = false;
        const p = rectPoint(e);
        fire('end', p[0], p[1]);
      });
      canvas.addEventListener('mouseleave', function () {
        if (!mouseDown) return;
        mouseDown = false;
        fire('end', -999, -999);
      });
      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        const pts = Array.prototype.map.call(e.touches, function (t) {
          const p = rectPoint(t);
          return { clientX: p[0], clientY: p[1] };
        });
        if (pts.length >= 2) {
          if (!pinch) beginPinch(pts);
          return;
        }
        if (blocked || !pts.length) return;
        fire('start', pts[0].clientX, pts[0].clientY);
      }, { passive: false });
      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        const pts = Array.prototype.map.call(e.touches, function (t) {
          const p = rectPoint(t);
          return { clientX: p[0], clientY: p[1] };
        });
        if (pts.length >= 2) {
          movePinch(pts);
          return;
        }
        if (blocked || pinch || !pts.length) return;
        fire('move', pts[0].clientX, pts[0].clientY);
      }, { passive: false });
      canvas.addEventListener('touchend', function (e) {
        e.preventDefault();
        const remain = e.touches.length;
        if (pinch || blocked) {
          endPinch(remain);
          return;
        }
        const t = e.changedTouches[0];
        if (!t) return;
        const p = rectPoint(t);
        fire('end', p[0], p[1]);
      }, { passive: false });
      canvas.addEventListener('touchcancel', function (e) {
        const remain = e.touches.length;
        if (pinch || blocked) endPinch(remain);
      }, { passive: false });
    },
    storage: {
      get: function (key) {
        try {
          if (api) return api.getStorageSync(key);
          return window.localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      },
      set: function (key, value) {
        try {
          if (api) {
            api.setStorageSync(key, value);
            return true;
          }
          window.localStorage.setItem(key, value);
          return true;
        } catch (e) {
          return false;
        }
      },
      remove: function (key) {
        try {
          if (api) api.removeStorageSync(key);
          else window.localStorage.removeItem(key);
        } catch (e) {
          // ignore
        }
      },
    },
  };

  if (!api) {
    // 浏览器里首帧可能还没完成布局；手机还会有地址栏收放 / 横竖屏切换，故做成可重算
    const applySize = function (sw, sh) {
      if (!sw || !sh) return;
      if (Math.abs(sw - screenW) < 2 && Math.abs(sh - screenH) < 2) return;
      screenW = sw;
      screenH = sh;
      runtime.screenW = sw;
      runtime.screenH = sh;
      runtime.scale = sw / DESIGN_WIDTH;
      runtime.height = sh / runtime.scale;
      canvas.width = Math.floor(sw * dpr);
      canvas.height = Math.floor(sh * dpr);
      ctx.setTransform(dpr * runtime.scale, 0, 0, dpr * runtime.scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';
    };

    const measure = function () {
      const hostEl = document.getElementById('stage') || document.body;
      applySize(
        hostEl.clientWidth || window.innerWidth || 0,
        hostEl.clientHeight || window.innerHeight || 0
      );
    };

    // 首帧布局未完成，50ms 后再校正一次
    setTimeout(measure, 50);

    let resizeTimer = null;
    const onResize = function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 240);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  }

  return runtime;
}

module.exports = { createRuntime, DESIGN_WIDTH, detectHost };
