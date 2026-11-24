/* 骑砍大师 · 三国 —— 浏览器预览包，由 tools/bundle.js 生成，请勿手改 */
(function () {
  var __defs = {};
  var __cache = {};
  function __require(id) {
    if (__cache[id]) return __cache[id].exports;
    var module = { exports: {} };
    __cache[id] = module;
    __defs[id](module, module.exports, __require);
    return module.exports;
  }

  /* js/render/platform.js */
  __defs[2] = function (module, exports, __require) {
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

const AD_UNIT_ID = ''; // 接入微信/抖音激励视频后，填平台后台的广告位 ID

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
      // 缩放事件参数不是坐标，不能走 fire（否则倍率会被当成 x 坐标再换算一次）
      const firePinchStart = function (x, y) {
        if (handlers.pinchStart) handlers.pinchStart(toDesignX(x), toDesignY(y));
      };
      const firePinch = function (scale, x, y) {
        if (handlers.pinch) handlers.pinch(scale, toDesignX(x), toDesignY(y));
      };
      const firePinchEnd = function () {
        if (handlers.pinchEnd) handlers.pinchEnd();
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
        firePinchStart(c.x, c.y);
      };
      const movePinch = function (ts) {
        if (!pinch) beginPinch(ts);
        else {
          const c = centerOf(ts);
          firePinch(distOf(ts) / pinch.startDist, c.x, c.y);
        }
      };
      const endPinch = function (remain) {
        if (pinch) {
          pinch = null;
          firePinchEnd();
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
            firePinchEnd();
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
      // 桌面浏览器：滚轮只交给场景处理，避免整页跟着滚
      canvas.addEventListener('wheel', function (e) {
        if (handlers.wheel) {
          e.preventDefault();
          const p = rectPoint(e);
          handlers.wheel(e.deltaY, toDesignX(p[0]), toDesignY(p[1]));
        }
      }, { passive: false });
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
    /** 系统键盘输入：浏览器用临时输入框，小游戏用 showKeyboard；返回可关闭的句柄 */
    askText: function (opts) {
      const o = opts || {};
      if (host === 'web' && typeof document !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = Math.max(1, Math.min(8, o.maxLength || 4));
        input.setAttribute('inputmode', 'text');
        input.setAttribute('autocomplete', 'off');
        input.placeholder = o.placeholder || '输入文字';
        input.value = o.value || '';
        // 电脑调试时舞台缩在左上角，输入框也要跟着舞台走，不能飘到整页中心
        const stage = document.getElementById('stage');
        const stageRect = stage && stage.getBoundingClientRect ? stage.getBoundingClientRect() : null;
        const inputLeft = stageRect && stageRect.width ? (stageRect.left + stageRect.width / 2) : null;
        const inputTop = stageRect && stageRect.height ? (stageRect.top + Math.max(24, stageRect.height * 0.12)) : null;
        input.style.cssText = 'position:fixed;left:' + (inputLeft === null ? '50%' : inputLeft + 'px') +
          ';top:' + (inputTop === null ? '12%' : inputTop + 'px') + ';transform:translateX(-50%);' +
          'z-index:99999;width:300px;height:50px;font-size:24px;text-align:center;color:#f0c060;' +
          'background:#241c14;border:2px solid #d9a441;border-radius:4px;outline:none;' +
          'font-family:"PingFang SC","Microsoft YaHei",sans-serif;';
        document.body.appendChild(input);
        let closed = false;
        const close = function () {
          if (closed) return;
          closed = true;
          if (input.parentNode) input.parentNode.removeChild(input);
        };
        const read = function () { if (o.onInput) o.onInput(input.value); };
        input.addEventListener('input', read);
        input.addEventListener('compositionend', read);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            read();
            if (o.onDone) o.onDone(input.value);
            close();
          }
        });
        input.addEventListener('blur', function () {
          setTimeout(function () {
            if (o.onDone) o.onDone(input.value);
            close();
          }, 0);
        });
        setTimeout(function () { input.focus(); }, 30);
        return {
          kind: 'web',
          close: close,
          setValue: function (v) { input.value = v; },
          focus: function () { input.focus(); },
        };
      }
      if (api && typeof api.showKeyboard === 'function') {
        const inputHandler = function (res) {
          if (o.onInput) o.onInput(res && res.value);
        };
        let closed = false;
        const confirmHandler = function (res) {
          if (o.onDone) o.onDone(res && res.value);
          close();
        };
        const close = function () {
          if (closed) return;
          closed = true;
          try {
            if (api.offKeyboardInput) api.offKeyboardInput(inputHandler);
            if (api.offKeyboardConfirm) api.offKeyboardConfirm(confirmHandler);
            if (api.hideKeyboard) api.hideKeyboard();
          } catch (e) { /* ignore */ }
        };
        if (api.onKeyboardInput) api.onKeyboardInput(inputHandler);
        if (api.onKeyboardConfirm) api.onKeyboardConfirm(confirmHandler);
        try {
          api.showKeyboard({
            defaultValue: o.value || '',
            maxLength: o.maxLength || 1,
            multiple: false,
            confirmHold: false,
            confirmType: 'done',
          });
        } catch (e) {
          close();
          return null;
        }
        return {
          kind: 'mini',
          close: close,
          setValue: function () {},
          focus: function () {},
        };
      }
      return null;
    },

    /**
     * 激励视频广告：小游戏里真实拉起；浏览器里只模拟一次观看，方便开发。
     * 真正接入时把 AD_UNIT_ID 换成平台后台的广告位 ID 即可，其余逻辑不用动。
     */
    showRewardedAd: function (cb) {
      const done = function (ok, msg) {
        try { cb(!!ok, msg || ''); } catch (e) { /* ignore */ }
      };
      if (!api) {
        setTimeout(function () { done(true, 'web-sim'); }, 900);
        return true;
      }
      if (typeof api.createRewardedVideoAd !== 'function' || !AD_UNIT_ID) {
        setTimeout(function () { done(false, '广告位尚未接入'); }, 0);
        return false;
      }
      let ad;
      try {
        ad = api.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
      } catch (e) {
        done(false, '广告组件初始化失败');
        return false;
      }
      let settled = false;
      const onClose = function (res) {
        if (settled) return;
        settled = true;
        try { if (ad.offClose) ad.offClose(onClose); } catch (e) { /* ignore */ }
        done(!!(res && res.isEnded), res && res.isEnded ? '' : '广告未看完');
      };
      ad.onClose(onClose);
      if (ad.onError) {
        ad.onError(function (err) {
          if (settled) return;
          settled = true;
          done(false, (err && err.errMsg) || '广告加载失败');
        });
      }
      try {
        ad.load().then(function () { return ad.show(); }).catch(function () {
          if (!settled) { settled = true; done(false, '广告暂时拉不起来'); }
        });
      } catch (e) {
        done(false, '广告拉起失败');
      }
      return true;
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

  };

  /* js/rng.js */
  __defs[4] = function (module, exports, __require) {
/**
 * 可复现随机数（简易版 seed 随机）
 * 世界生成、价格波动、战斗判定都走这里，保证同一存档读档后行为一致。
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class RNG {
  constructor(seed) {
    this.seed = (seed >>> 0) || 1;
    this.next = mulberry32(this.seed);
  }

  /** 0 ~ 1 */
  random() {
    return this.next();
  }

  /** 闭区间整数 */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min, max) {
    return min + this.next() * (max - min);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    if (!list || !list.length) return null;
    return list[Math.floor(this.next() * list.length)];
  }

  /** 原地洗牌 */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }
}

module.exports = { RNG, mulberry32 };

  };

  /* js/data/china.js */
  __defs[5] = function (module, exports, __require) {
/**
 * 三国大地图数据：地形、区域风景、城池、势力、领主、战役链
 * 地图 40 x 48 格，坐标原点左上角，东侧是海。
 * 区域(region)决定地形基色，同一张图从塞北草原到江南水乡各不相同。
 */

/**
 * 原始设计稿是 40x48。所有折线、区域框、据点坐标都按这个尺寸写。
 * 放大 1.6 倍后：地图 64x77，城与城之间拉开距离，TILE 不变，视野仍是 ~11 格。
 */
const BASE_W = 40;
const BASE_H = 48;
// 天下再放大一倍：城与城之间至少拉开两倍路程，领主再多也有地方跑
const MAP_W = 128;
const MAP_H = 154;

/** 地形：cost 影响寻路，hours 为越过一格的游戏小时 */
const TERRAIN = {
  plain: { id: 'plain', name: '原野', cost: 1.0, passable: true, hours: 2.0 },
  farm: { id: 'farm', name: '农田', cost: 0.95, passable: true, hours: 1.9 },
  road: { id: 'road', name: '道路', cost: 0.6, passable: true, hours: 1.3 },
  forest: { id: 'forest', name: '林地', cost: 1.5, passable: true, hours: 2.9 },
  marsh: { id: 'marsh', name: '沼泽', cost: 2.2, passable: true, hours: 4.3 },
  hills: { id: 'hills', name: '丘陵', cost: 1.8, passable: true, hours: 3.4 },
  mountain: { id: 'mountain', name: '山地', cost: 99, passable: false, hours: 99 },
  river: { id: 'river', name: '涉水', cost: 2.4, passable: true, hours: 4.6 },
  desert: { id: 'desert', name: '戈壁', cost: 1.55, passable: true, hours: 3.1 },
  sea: { id: 'sea', name: '海', cost: 99, passable: false, hours: 99 },
};

/**
 * 区域：决定基础地形、杂生地形与配色
 * palette.ground 地面主色 / dark 暗部 / light 亮部 / deco 装饰色
 */
const REGIONS = {
  ssb: {
    name: '塞北草原', base: 'plain', accent: 'hills', density: 0.12,
    palette: { ground: '#7d7a46', dark: '#635f36', light: '#96935a', deco: '#b3ad78' },
    tint: '#8a854f',
    flavor: '风吹草低，牧马成群。这里没有城墙，只有地平线。',
  },
  youyan: {
    name: '幽燕', base: 'forest', accent: 'hills', density: 0.16,
    palette: { ground: '#4a6340', dark: '#37492f', light: '#5e7a50', deco: '#7d9a62' },
    tint: '#40573a',
    flavor: '燕山以北，松林连着松林，冬天来得比信使早。',
  },
  bingzhou: {
    name: '并州山地', base: 'hills', accent: 'forest', density: 0.22,
    palette: { ground: '#6f6142', dark: '#584c31', light: '#877955', deco: '#9c8c66' },
    tint: '#736447',
    flavor: '太行与吕梁夹着一条走廊，谁占了山口谁就掐住河北的脖子。',
  },
  jizhou: {
    name: '冀州平原', base: 'farm', accent: 'forest', density: 0.1,
    palette: { ground: '#7c8244', dark: '#636a34', light: '#969c56', deco: '#b6b86e' },
    tint: '#7d8447',
    flavor: '一望无际的麦田。袁本初的粮，八成从这片地里长出来。',
  },
  liangzhou: {
    name: '凉州戈壁', base: 'desert', accent: 'hills', density: 0.18,
    palette: { ground: '#ad9360', dark: '#8e774b', light: '#c9b078', deco: '#dcc794' },
    tint: '#b09865',
    flavor: '砾石、风沙、还有最好的马。出了玉门关，就没有汉家的县令了。',
  },
  guanzhong: {
    name: '关中', base: 'farm', accent: 'hills', density: 0.15,
    palette: { ground: '#80804a', dark: '#676839', light: '#999a60', deco: '#b7b57c' },
    tint: '#83834d',
    flavor: '八百里秦川，四塞之地。守住函谷与潼关，就守住了半个天下。',
  },
  zhongyuan: {
    name: '中原', base: 'farm', accent: 'forest', density: 0.08,
    palette: { ground: '#8a8443', dark: '#6f6b32', light: '#a49d55', deco: '#c0b56c' },
    tint: '#8b8545',
    flavor: '四通八达，也四战之地。谁都想拿，谁都不好守。',
  },
  xuzhou: {
    name: '徐州', base: 'farm', accent: 'marsh', density: 0.14,
    palette: { ground: '#6f8449', dark: '#586b38', light: '#879e5f', deco: '#a2b876' },
    tint: '#718650',
    flavor: '泗水与沂水在这里打了个结，富庶，也最容易被两路夹击。',
  },
  yizhou: {
    name: '益州', base: 'forest', accent: 'hills', density: 0.26,
    palette: { ground: '#4a6b45', dark: '#384f36', light: '#5d8054', deco: '#7fa06a' },
    tint: '#41663f',
    flavor: '蜀道难。山把这块盆地锁起来，锁住的是粮，也是野心。',
  },
  jingzhou: {
    name: '荆州', base: 'plain', accent: 'marsh', density: 0.26,
    palette: { ground: '#5c7a52', dark: '#476343', light: '#6f9064', deco: '#8aa87a' },
    tint: '#506f4b',
    flavor: '江河湖泊把这片地切成很多块，水军比骑兵管用。',
  },
  jiangdong: {
    name: '江东', base: 'farm', accent: 'marsh', density: 0.18,
    palette: { ground: '#5f7f52', dark: '#496640', light: '#75996a', deco: '#8fae74' },
    tint: '#55784c',
    flavor: '水田、河港、还有一支能逆流而上的船队。',
  },
  jiaozhou: {
    name: '交州', base: 'forest', accent: 'marsh', density: 0.2,
    palette: { ground: '#3f6640', dark: '#2f4d2f', light: '#4f7a4c', deco: '#6a9a5a' },
    tint: '#355e33',
    flavor: '瘴气与密林，中原的兵到了这里，先输给天气。',
  },
};

/** 海岸线：y -> 海起始 x（左闭） */
const COAST = [
  [0, 38], [5, 37], [10, 36], [15, 35], [20, 34], [25, 33],
  [30, 34], [35, 35], [38, 36], [42, 34], [44, 32], [47, 30],
];

/** 黄河：西北 -> 东北入海 */
const RIVER_HUANG = [
  [12, 15], [14, 16], [16, 15], [18, 16], [20, 17], [21, 19], [22, 21],
  [23, 22], [25, 21], [27, 20], [29, 19], [31, 18], [33, 16], [35, 14], [36, 13],
];

/** 长江：西南 -> 东入海 */
const RIVER_YANG = [
  [11, 35], [13, 36], [15, 37], [17, 37], [19, 38], [21, 38],
  [23, 39], [25, 39], [26, 38], [27, 38], [29, 37], [31, 36], [33, 35], [35, 34],
];

/** 淮河：中原 -> 东 */
const RIVER_HUAI = [
  [24, 28], [26, 28], [28, 27], [30, 27], [32, 26], [34, 26], [35, 26],
];

/** 山脉折线，每段会加粗 1 格 */
const MOUNTAINS = [
  // 阴山（塞北）
  [[2, 4], [6, 3], [10, 4], [14, 3], [18, 4]],
  // 太行
  [[23, 9], [24, 12], [25, 15], [24, 18], [23, 21]],
  // 吕梁
  [[17, 10], [18, 13], [17, 16], [16, 19]],
  // 秦岭
  [[10, 26], [13, 27], [16, 26], [19, 27], [22, 26]],
  // 大巴
  [[13, 30], [15, 31], [17, 31], [18, 32]],
  // 巫山
  [[18, 33], [19, 35], [19, 37]],
  // 南岭
  [[20, 43], [23, 42], [26, 43], [29, 42]],
  // 武夷
  [[31, 39], [32, 41], [31, 44]],
  // 燕山
  [[26, 6], [30, 5], [34, 6]],
];

/**
 * 据点：紧凑数组 -> 对象
 * [id, 名称, 类型, 势力, x, y, 粮价系数, 守军, 兵种组, 简介]
 */
const SITE_ROWS = [
  // ---- 塞北 / 幽燕 ----
  ['longcheng', '龙城', 'town', 'xianbei', 7, 3, 1.12, 120, 'xianbei', '鲜卑王庭。帐篷连成城，马比人多。'],
  ['tanhanshan', '弹汗山', 'castle', 'xianbei', 13, 5, 1.16, 100, 'xianbei', '轲比能的老营，山后有整片的马场。'],
  ['ji', '蓟', 'town', 'han', 26, 4, 1.05, 110, 'han', '幽州治所，汉家的北门锁钥。'],
  ['xiangping', '襄平', 'town', 'han', 34, 4, 1.02, 90, 'han', '辽东郡治，离中原很远，离塞外很近。'],
  ['beiping', '北平', 'castle', 'xianbei', 31, 7, 1.1, 85, 'xianbei', '长城边上的小堡，鲜卑的骑兵常来借粮。'],
  ['zhuo', '涿', 'village', 'han', 27, 8, 0.74, 14, 'village', '桃园结义的地方。现在只剩几间草屋和一口井。'],
  // ---- 并州 / 冀州 ----
  ['jinyang', '晋阳', 'town', 'yuan', 19, 11, 1.06, 115, 'yuan', '并州治所，铁器与良马都从这里过。'],
  ['shangdang', '上党', 'castle', 'yuan', 23, 13, 1.14, 95, 'yuan', '太行山上的壶关，一夫当关。'],
  ['ye', '邺', 'town', 'yuan', 28, 13, 1.08, 160, 'yuan', '袁本初的都城。铜雀台还没修，粮仓先满了。'],
  ['nanpi', '南皮', 'castle', 'yuan', 31, 11, 1.12, 90, 'yuan', '渤海郡的壁垒，袁家的后院。'],
  ['pingyuan', '平原', 'town', 'yuan', 31, 17, 1.04, 95, 'yuan', '青州北界的粮城，麦子堆到城墙那么高。'],
  ['puyang', '濮阳', 'town', 'wei', 26, 19, 1.06, 105, 'cao', '兖州的旧治，曹操在这里打赢过吕布。'],
  // ---- 关中 ----
  ['changan', '长安', 'town', 'han', 15, 20, 1.1, 140, 'han', '旧都。宫室烧了一半，百官还在。'],
  ['tongguan', '潼关', 'castle', 'han', 17, 20, 1.18, 110, 'han', '关中东门，谁拿到它谁就能关起门来。'],
  ['luoyang', '洛阳', 'town', 'wei', 20, 22, 1.12, 130, 'cao', '董卓烧过一次，如今又有人回来重新点灯。'],
  ['hulao', '虎牢关', 'castle', 'wei', 21, 20, 1.15, 90, 'cao', '洛阳东面的关口。三英战吕布，就在这下面。'],
  // ---- 凉州 ----
  ['wuwei', '武威', 'town', 'ma', 6, 17, 1.04, 100, 'ma', '凉州治所，马市开在城外，一天能换三百匹。'],
  ['jincheng', '金城', 'town', 'ma', 4, 22, 1.06, 85, 'ma', '黄河边上的渡口城，羊皮筏子昼夜不停。'],
  ['tianshui', '天水', 'castle', 'ma', 10, 22, 1.1, 95, 'ma', '陇右的要冲，姜维的老家。'],
  ['longxi', '陇西村', 'village', 'ma', 8, 24, 0.72, 12, 'village', '黄土坡上的村子，家家有马，家家缺粮。'],
  // ---- 中原 ----
  ['chenliu', '陈留', 'town', 'wei', 25, 23, 1.03, 90, 'cao', '曹操起兵的地方。城外全是募兵的木牌。'],
  ['guandu', '官渡', 'castle', 'wei', 22, 24, 1.2, 100, 'cao', '黄河渡口。两军对峙的时候，这里连水都贵。'],
  ['xuchang', '许昌', 'town', 'wei', 25, 27, 1.08, 170, 'cao', '曹操把天子接来以后，这里就是朝廷。'],
  ['qiao', '谯', 'village', 'wei', 27, 25, 0.75, 16, 'village', '曹氏与夏侯氏的祖宅所在，村口有棵老槐树。'],
  ['runan', '汝南', 'village', 'wei', 23, 30, 0.76, 14, 'village', '袁氏的故里，如今只剩族谱和荒田。'],
  // ---- 徐州 / 淮南 ----
  ['xiapi', '下邳', 'town', 'lv', 31, 24, 1.1, 150, 'lv', '吕布守着这座城。泗水绕着城墙流，水能灌进来。'],
  ['xiaopei', '小沛', 'castle', 'lv', 29, 23, 1.12, 80, 'lv', '刘备借住过的地方，现在插着吕字旗。'],
  ['pengcheng', '彭城', 'village', 'lv', 30, 21, 0.78, 15, 'village', '徐州旧治的残垣，集市还开在墙根下。'],
  ['shouchun', '寿春', 'town', null, 29, 28, 1.05, 80, 'none', '淮南的粮仓，眼下没有主人，谁先到谁拿。'],
  // ---- 荆州 ----
  ['wan', '宛', 'town', 'biao', 22, 30, 1.05, 105, 'biao', '南阳郡治，铁官与作坊都在这。'],
  ['xinye', '新野', 'castle', 'shu', 22, 33, 1.08, 85, 'shu', '刘备屯兵的小城。城不大，人心很齐。'],
  ['xiangyang', '襄阳', 'town', 'biao', 23, 35, 1.09, 150, 'biao', '刘表的治所。城墙临汉水，商船排到江心。'],
  ['jiangling', '江陵', 'town', 'biao', 23, 39, 1.06, 110, 'biao', '荆州的粮仓与船坞，南郡的命门。'],
  ['xiakou', '夏口', 'castle', 'wu', 27, 36, 1.14, 90, 'wu', '汉水入江处。谁在这里扎营，谁就卡住了荆州。'],
  ['chaisang', '柴桑', 'town', 'wu', 28, 38, 1.06, 95, 'wu', '江东的水军基地，船比房子多。'],
  ['chibi', '赤壁', 'castle', null, 26, 38, 1.16, 70, 'none', '江边的石壁。风从东南来，火能烧到对岸。'],
  ['yiling', '夷陵', 'castle', null, 24, 41, 1.12, 75, 'none', '三峡的出口。连营七百里，说的就是这一线。'],
  // ---- 益州 ----
  ['hanzhong', '汉中', 'town', 'zhang', 16, 29, 1.04, 105, 'zhang', '秦岭与巴山之间的粮仓，五斗米道的地盘。'],
  ['jiange', '剑阁', 'castle', 'zhang', 16, 32, 1.18, 100, 'zhang', '一夫当关，万夫莫开。说的不是城，是那条路。'],
  ['chengdu', '成都', 'town', 'zhang', 11, 35, 1.07, 160, 'zhang', '益州治所。锦官城的织机声，隔一条街都听得见。'],
  ['jiangzhou', '江州', 'town', 'zhang', 14, 38, 1.05, 90, 'zhang', '巴郡的水码头，盐船从这里下行。'],
  ['baxi', '巴西村', 'village', 'zhang', 13, 34, 0.73, 13, 'village', '山坳里的村子，出产賨人和好弓。'],
  // ---- 江东 ----
  ['jianye', '建业', 'town', 'wu', 33, 32, 1.08, 160, 'wu', '孙权的新都。钟山脚下，江面宽得看不到对岸。'],
  ['wujun', '吴', 'town', 'wu', 34, 36, 1.06, 120, 'wu', '吴郡。世家大族在这，船坞也在这。'],
  ['kuaiji', '会稽', 'town', 'wu', 34, 40, 1.05, 110, 'wu', '东南的海盐与稻米，一半从这会稽出去。'],
  ['danyang', '丹阳村', 'village', 'wu', 31, 33, 0.76, 15, 'village', '出精兵的地方。山越与汉人混着住。'],
  // ---- 交州 ----
  ['jiaozhi', '交趾', 'town', null, 24, 46, 1.02, 70, 'none', '最南边的郡城。中原的官来了先病三个月。'],
  ['changsha', '长沙村', 'village', null, 23, 42, 0.74, 12, 'village', '湘水边的稻村，孙刘两家都来征过粮。'],
  ['guiyang', '桂阳村', 'village', null, 26, 44, 0.72, 11, 'village', '五岭以南的小村，出锡，也出土话。'],
  // ---- 匪巢 ----
  ['heishan', '黑山营', 'camp', 'bandit', 24, 16, 0, 45, 'bandit', '太行山里的黄巾余部，张燕带着几万人钻山沟。'],
  ['taishan', '泰山寇', 'camp', 'bandit', 32, 19, 0, 38, 'bandit', '泰山周边的山贼，专抢青徐之间的粮队。'],
  ['baibo', '白波谷', 'camp', 'bandit', 18, 17, 0, 40, 'bandit', '白波黄巾的老巢，谷口只容两人并行。'],
  ['mizei', '米贼寨', 'camp', 'bandit', 14, 30, 0, 35, 'bandit', '汉中山里的五斗米道分坛，也收过路钱。'],
  ['poyang', '鄱阳贼', 'camp', 'bandit', 30, 41, 0, 36, 'bandit', '鄱阳湖上的水贼，抢船不抢村。'],
  ['nanzhong', '南中夷寨', 'camp', 'bandit', 16, 42, 0, 42, 'bandit', '南中的部落武装，孟获的远亲在这。'],
];

/** 兵种组 */
const RECRUIT_SETS = {
  cao: ['militia', 'spear', 'crossbow', 'guard'],
  cao2: ['militia', 'crossbow', 'cav', 'heavy'],
  shu: ['militia', 'spear', 'archer', 'baier'],
  shu2: ['militia', 'archer', 'wudang', 'cav'],
  wu: ['militia', 'archer', 'boat', 'huochuan'],
  wu2: ['militia', 'cav', 'qishe', 'danyang'],
  yuan: ['militia', 'spear', 'cav', 'heavy'],
  lv: ['militia', 'spear', 'cav', 'tiefu'],
  biao: ['militia', 'spear', 'archer', 'cav'],
  zhang: ['militia', 'spear', 'archer', 'wudang'],
  xianbei: ['militia', 'qishe', 'xianbei', 'tengri'],
  ma: ['militia', 'spear', 'qishe', 'tiefu'],
  han: ['militia', 'spear', 'crossbow', 'jinjun'],
  none: ['militia', 'spear'],
  village: ['militia'],
  bandit: [],
};

/** 道路连线 */
const ROADS = [
  ['longcheng', 'tanhanshan'], ['tanhanshan', 'ji'], ['ji', 'zhuo'], ['zhuo', 'beiping'],
  ['beiping', 'xiangping'], ['ji', 'nanpi'], ['nanpi', 'ye'], ['ye', 'shangdang'],
  ['shangdang', 'jinyang'], ['jinyang', 'puyang'], ['ye', 'pingyuan'], ['pingyuan', 'puyang'],
  ['puyang', 'chenliu'], ['chenliu', 'guandu'], ['guandu', 'hulao'], ['hulao', 'luoyang'],
  ['luoyang', 'tongguan'], ['tongguan', 'changan'], ['changan', 'tianshui'], ['tianshui', 'longxi'],
  ['longxi', 'jincheng'], ['jincheng', 'wuwei'], ['tianshui', 'hanzhong'], ['hanzhong', 'jiange'],
  ['jiange', 'baxi'], ['baxi', 'chengdu'], ['chengdu', 'jiangzhou'], ['jiangzhou', 'yiling'],
  ['chenliu', 'xuchang'], ['xuchang', 'qiao'], ['xuchang', 'runan'], ['runan', 'wan'],
  ['wan', 'xinye'], ['xinye', 'xiangyang'], ['xiangyang', 'jiangling'], ['jiangling', 'yiling'],
  ['yiling', 'chibi'], ['chibi', 'chaisang'], ['chaisang', 'xiakou'], ['xiakou', 'jiangling'],
  ['xuchang', 'shouchun'], ['shouchun', 'xiaopei'], ['xiaopei', 'xiapi'], ['xiapi', 'pengcheng'],
  ['pengcheng', 'taishan'], ['xiapi', 'danyang'], ['danyang', 'jianye'], ['jianye', 'wujun'],
  ['wujun', 'kuaiji'], ['jianye', 'chaisang'], ['chaisang', 'poyang'], ['poyang', 'changsha'],
  ['changsha', 'guiyang'], ['guiyang', 'jiaozhi'], ['changsha', 'yiling'], ['hanzhong', 'heishan'],
  ['heishan', 'ye'], ['baibo', 'luoyang'], ['mizei', 'hanzhong'], ['nanzhong', 'jiaozhi'],
  ['taishan', 'pingyuan'],
];

/** 各国都城与旧都：地图与天下大势无论缩到多小都要留名字 */
const CAPITAL_IDS = [
  'xuchang', 'chengdu', 'jianye', 'ye', 'xiapi', 'xiangyang', 'longcheng', 'wuwei', 'changan', 'luoyang',
];

/** 势力 */
const FACTIONS = {
  wei: {
    id: 'wei', name: '魏', full: '曹操', color: '#3f6fa8', banner: '曹',
    lord: '曹操', desc: '奉天子以令不臣。屯田、募兵、用法度，最强的那个。',
  },
  shu: {
    id: 'shu', name: '蜀', full: '刘备', color: '#4f8f5a', banner: '刘',
    lord: '刘备', desc: '半生寄人篱下，靠一个“义”字聚人。兵少，但肯跟你走。',
  },
  wu: {
    id: 'wu', name: '吴', full: '孙权', color: '#b06a3c', banner: '孙',
    lord: '孙权', desc: '据长江之险，水军天下第一。守成有余，进取不足。',
  },
  yuan: {
    id: 'yuan', name: '袁', full: '袁绍', color: '#8c6fae', banner: '袁',
    lord: '袁绍', desc: '四世三公，兵多粮足。只是号令出自三门，谁也不服谁。',
  },
  lv: {
    id: 'lv', name: '吕', full: '吕布', color: '#a8433a', banner: '吕',
    lord: '吕布', desc: '人中吕布，马中赤兔。骁勇无谋，反复无常。',
  },
  biao: {
    id: 'biao', name: '刘', full: '刘表', color: '#6a8f8a', banner: '表',
    lord: '刘表', desc: '守荆州二十年，不动如山。老了，也不想动了。',
  },
  zhang: {
    id: 'zhang', name: '璋', full: '刘璋', color: '#8a8a52', banner: '璋',
    lord: '刘璋', desc: '益州天府，闭门自守。兵不少，将不多。',
  },
  xianbei: {
    id: 'xianbei', name: '鲜卑', full: '轲比能', color: '#7a6a4a', banner: '鲜',
    lord: '轲比能', desc: '控弦十万，来去如风。不筑城，只抢城。',
  },
  ma: {
    id: 'ma', name: '凉', full: '马腾', color: '#a5824a', banner: '马',
    lord: '马腾', desc: '西凉重步，天下精锐。粮少，人心散。',
  },
  han: {
    id: 'han', name: '汉', full: '汉廷', color: '#8f8f86', banner: '汉',
    lord: '刘协', desc: '名义上的天下共主。诏书还在，兵没了。',
  },
  bandit: {
    id: 'bandit', name: '贼', full: '黄巾余部', color: '#8b3a3a', banner: '贼',
    lord: '无', desc: '黄巾散了，人还在山里。所有人的敌人。',
  },
  // 自立之后：你自己的那面旗，只在玩家手下有领主时才用到
  player: {
    id: 'player', name: '我', full: '你的旗', color: '#d9a441', banner: '我',
    lord: '你', desc: '没站在任何人后面。旗是旧的，字是新写的。',
  },
};

/**
 * 君位继任表：君主被斩后按这张表往下传。
 * 表里有些人开局不在名册上，轮到他们时再生成；表用完了，
 * 就从本势力还活着的领主里挑一位本地、官职大的。
 */
const SUCCESSION = {
  wei: [
    { id: 'caopi', name: '曹丕', title: '魏太子' },
    { id: 'caozhang', name: '曹彰', title: '任城王' },
    { id: 'caozhi', name: '曹植', title: '陈王' },
    { id: 'caoren', name: '曹仁', title: '征南将军' },
    { id: 'caohong', name: '曹洪', title: '都护将军' },
  ],
  shu: [
    { id: 'liushan', name: '刘禅', title: '汉中王世子' },
    { id: 'liufeng', name: '刘封', title: '副军中郎将' },
    { id: 'zhaoyun', name: '赵云', title: '牙门将军' },
    { id: 'weiyan', name: '魏延', title: '牙门将军' },
  ],
  wu: [
    { id: 'sunliang', name: '孙亮', title: '会稽王' },
    { id: 'sunxiu', name: '孙休', title: '琅琊王' },
    { id: 'zhouyu', name: '周瑜', title: '水军都督' },
    { id: 'lvmeng', name: '吕蒙', title: '横野中郎将' },
    { id: 'luxun', name: '陆逊', title: '镇西将军' },
  ],
  yuan: [
    { id: 'yuantan', name: '袁谭', title: '青州刺史' },
    { id: 'yuanshang', name: '袁尚', title: '邺侯' },
    { id: 'yanliang', name: '颜良', title: '骑都尉' },
    { id: 'wenchou', name: '文丑', title: '骑将' },
    { id: 'chunyuqiong', name: '淳于琼', title: '督军' },
  ],
  lv: [
    { id: 'chengong', name: '陈宫', title: '军师' },
    { id: 'gaoshun', name: '高顺', title: '中郎将' },
    { id: 'houcheng', name: '侯成', title: '骑都尉' },
  ],
  biao: [
    { id: 'liuqi', name: '刘琦', title: '江夏太守' },
    { id: 'liucong', name: '刘琮', title: '襄阳侯' },
    { id: 'caimao', name: '蔡瑁', title: '水军统领' },
    { id: 'wenpin', name: '文聘', title: '大将' },
  ],
  zhang: [
    { id: 'liuxun', name: '刘循', title: '雒城守将' },
    { id: 'wuyi', name: '吴懿', title: '中郎将' },
    { id: 'zhangren', name: '张任', title: '从事' },
    { id: 'liugui', name: '刘璝', title: '中郎将' },
  ],
  xianbei: [
    { id: 'suli', name: '素利', title: '东部大人' },
    { id: 'mijia', name: '弥加', title: '部帅' },
    { id: 'queji', name: '阙机', title: '部帅' },
    { id: 'huaitou', name: '槐头', title: '小帅' },
  ],
  ma: [
    { id: 'machao', name: '马超', title: '偏将军' },
    { id: 'maxiu', name: '马休', title: '奉车都尉' },
    { id: 'matie', name: '马铁', title: '骑都尉' },
    { id: 'pangde', name: '庞德', title: '校尉' },
    { id: 'chengyin', name: '程银', title: '校尉' },
  ],
  han: [
    { id: 'liuxie', name: '刘协', title: '天子' },
    { id: 'huangfusong', name: '皇甫嵩', title: '车骑将军' },
    { id: 'zhujun', name: '朱儁', title: '右中郎将' },
    { id: 'luzhi', name: '卢植', title: '北中郎将' },
  ],
  player: [],
  bandit: [],
};

/** 开局时的君主名，用来在重开/读档时把被继任表改过的全局数据复位 */
const FACTION_RULERS = Object.keys(FACTIONS).reduce(function (out, id) {
  out[id] = { lord: FACTIONS[id].lord, full: FACTIONS[id].full, banner: FACTIONS[id].banner };
  return out;
}, {});

/**
 * 领主 NPC
 * soldiers 为初始兵力模板，home 为驻地
 */
const LORDS = [
  { id: 'caocao', name: '曹操', faction: 'wei', home: 'xuchang', soldiers: { militia: 60, spear: 70, crossbow: 40, cav: 30, guard: 12 }, morale: 92, sight: 7, title: '魏公' },
  { id: 'xiahou', name: '夏侯惇', faction: 'wei', home: 'luoyang', soldiers: { militia: 40, spear: 50, crossbow: 25, cav: 20 }, morale: 86, sight: 7, title: '建武将军' },
  { id: 'zhangliao', name: '张辽', faction: 'wei', home: 'guandu', soldiers: { militia: 30, spear: 40, cav: 35, guard: 8 }, morale: 88, sight: 8, title: '中郎将' },
  { id: 'liubei', name: '刘备', faction: 'shu', home: 'xinye', soldiers: { militia: 45, spear: 35, archer: 25, baier: 8 }, morale: 95, sight: 7, title: '左将军' },
  { id: 'guanyu', name: '关羽', faction: 'shu', home: 'xinye', soldiers: { militia: 20, spear: 40, cav: 25, baier: 10 }, morale: 95, sight: 8, title: '偏将军' },
  { id: 'zhangfei', name: '张飞', faction: 'shu', home: 'xinye', soldiers: { militia: 25, spear: 45, cav: 20 }, morale: 94, sight: 6, title: '别部司马' },
  { id: 'sunquan', name: '孙权', faction: 'wu', home: 'jianye', soldiers: { militia: 70, archer: 50, boat: 40, huochuan: 10 }, morale: 90, sight: 7, title: '讨虏将军' },
  { id: 'zhouyu', name: '周瑜', faction: 'wu', home: 'chaisang', soldiers: { militia: 30, archer: 45, boat: 35, huochuan: 15 }, morale: 92, sight: 8, title: '水军都督' },
  { id: 'taishici', name: '太史慈', faction: 'wu', home: 'wujun', soldiers: { militia: 25, archer: 30, cav: 25, danyang: 10 }, morale: 88, sight: 7, title: '建昌都尉' },
  { id: 'yuanshao', name: '袁绍', faction: 'yuan', home: 'ye', soldiers: { militia: 100, spear: 90, cav: 50, heavy: 10 }, morale: 80, sight: 7, title: '大将军' },
  { id: 'yanliang', name: '颜良', faction: 'yuan', home: 'pingyuan', soldiers: { militia: 40, spear: 50, cav: 35 }, morale: 82, sight: 7, title: '骑都尉' },
  { id: 'lvbu', name: '吕布', faction: 'lv', home: 'xiapi', soldiers: { spear: 40, cav: 45, tiefu: 25, guard: 10 }, morale: 90, sight: 8, title: '徐州牧' },
  { id: 'gaoshun', name: '高顺', faction: 'lv', home: 'xiaopei', soldiers: { spear: 60, guard: 15 }, morale: 88, sight: 6, title: '中郎将' },
  { id: 'liubiao', name: '刘表', faction: 'biao', home: 'xiangyang', soldiers: { militia: 70, spear: 55, archer: 30 }, morale: 76, sight: 6, title: '荆州牧' },
  { id: 'caimao', name: '蔡瑁', faction: 'biao', home: 'jiangling', soldiers: { militia: 40, archer: 30, boat: 20 }, morale: 72, sight: 6, title: '水军统领' },
  { id: 'liuzhang', name: '刘璋', faction: 'zhang', home: 'chengdu', soldiers: { militia: 80, spear: 60, archer: 35 }, morale: 74, sight: 6, title: '益州牧' },
  { id: 'zhangren', name: '张任', faction: 'zhang', home: 'jiange', soldiers: { militia: 40, spear: 45, archer: 25 }, morale: 84, sight: 7, title: '从事' },
  { id: 'kebineng', name: '轲比能', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 80, qishe: 40, xianbei: 30, tengri: 12 }, morale: 86, sight: 9, title: '鲜卑单于' },
  { id: 'mateng', name: '马腾', faction: 'ma', home: 'wuwei', soldiers: { militia: 30, spear: 50, qishe: 30, tiefu: 15 }, morale: 82, sight: 8, title: '征西将军' },
  { id: 'machao', name: '马超', faction: 'ma', home: 'tianshui', soldiers: { cav: 45, tiefu: 25, qishe: 20 }, morale: 90, sight: 9, title: '偏将军' },
  { id: 'huangfusong', name: '皇甫嵩', faction: 'han', home: 'changan', soldiers: { militia: 40, spear: 40, crossbow: 25, jinjun: 6 }, morale: 74, sight: 6, title: '车骑将军' },
  // ---- 魏：宗亲与五子 ----
  { id: 'caoren', name: '曹仁', faction: 'wei', home: 'puyang', soldiers: { spear: 45, crossbow: 25, cav: 20, guard: 8 }, morale: 86, sight: 7, title: '征南将军' },
  { id: 'xiahouyuan', name: '夏侯渊', faction: 'wei', home: 'tongguan', soldiers: { cav: 35, spear: 30, crossbow: 20 }, morale: 88, sight: 8, title: '征西将军' },
  { id: 'xuhuang', name: '徐晃', faction: 'wei', home: 'shangdang', soldiers: { spear: 50, crossbow: 25, militia: 20 }, morale: 87, sight: 7, title: '平寇将军' },
  { id: 'zhanghe', name: '张郃', faction: 'wei', home: 'jinyang', soldiers: { cav: 30, spear: 40, crossbow: 20 }, morale: 84, sight: 8, title: '荡寇将军' },
  { id: 'xuchu', name: '许褚', faction: 'wei', home: 'chenliu', soldiers: { militia: 30, spear: 30, guard: 20 }, morale: 90, sight: 6, title: '虎卫' },
  { id: 'litong', name: '李通', faction: 'wei', home: 'runan', soldiers: { militia: 35, spear: 25, cav: 15 }, morale: 78, sight: 6, title: '裨将军' },
  // ---- 蜀：荆益之间 ----
  { id: 'zhaoyun', name: '赵云', faction: 'shu', home: 'hanzhong', soldiers: { cav: 30, spear: 35, baier: 12 }, morale: 92, sight: 8, title: '牙门将军' },
  { id: 'huangzhong', name: '黄忠', faction: 'shu', home: 'jiangling', soldiers: { archer: 40, spear: 30, militia: 20 }, morale: 90, sight: 7, title: '中郎将' },
  { id: 'weiyan', name: '魏延', faction: 'shu', home: 'hanzhong', soldiers: { spear: 40, militia: 30, cav: 15 }, morale: 86, sight: 7, title: '牙门将军' },
  { id: 'chendao', name: '陈到', faction: 'shu', home: 'jiangzhou', soldiers: { spear: 35, baier: 15, militia: 20 }, morale: 88, sight: 6, title: '白毦统领' },
  { id: 'liufeng', name: '刘封', faction: 'shu', home: 'baxi', soldiers: { militia: 35, spear: 25, cav: 12 }, morale: 80, sight: 6, title: '副军中郎将' },
  { id: 'mizhu', name: '糜竺', faction: 'shu', home: 'chengdu', soldiers: { militia: 30, spear: 20, archer: 15 }, morale: 72, sight: 5, title: '别从事' },
  // ---- 吴：四都督与老将 ----
  { id: 'ganning', name: '甘宁', faction: 'wu', home: 'xiakou', soldiers: { militia: 25, archer: 30, boat: 25, danyang: 12 }, morale: 90, sight: 8, title: '折冲将军' },
  { id: 'lvmeng', name: '吕蒙', faction: 'wu', home: 'chaisang', soldiers: { militia: 30, archer: 35, boat: 25 }, morale: 88, sight: 7, title: '横野中郎将' },
  { id: 'luxun', name: '陆逊', faction: 'wu', home: 'wujun', soldiers: { militia: 35, spear: 30, archer: 20 }, morale: 85, sight: 7, title: '镇西将军' },
  { id: 'chengpu', name: '程普', faction: 'wu', home: 'kuaiji', soldiers: { militia: 30, archer: 25, boat: 25 }, morale: 84, sight: 6, title: '荡寇中郎将' },
  { id: 'handang', name: '韩当', faction: 'wu', home: 'jianye', soldiers: { archer: 30, cav: 20, boat: 20 }, morale: 83, sight: 7, title: '偏将军' },
  // ---- 袁：河北诸将 ----
  { id: 'wenchou', name: '文丑', faction: 'yuan', home: 'pingyuan', soldiers: { cav: 35, spear: 35, militia: 20 }, morale: 82, sight: 7, title: '骑将' },
  { id: 'chunyuqiong', name: '淳于琼', faction: 'yuan', home: 'zhuo', soldiers: { militia: 40, spear: 25, archer: 15 }, morale: 70, sight: 5, title: '督军' },
  { id: 'jiangyiqu', name: '蒋义渠', faction: 'yuan', home: 'beiping', soldiers: { militia: 35, spear: 30, cav: 10 }, morale: 72, sight: 6, title: '校尉' },
  { id: 'guotu', name: '郭图', faction: 'yuan', home: 'ye', soldiers: { militia: 30, spear: 20, archer: 15 }, morale: 68, sight: 5, title: '谋士' },
  { id: 'lvkuang', name: '吕旷', faction: 'yuan', home: 'ji', soldiers: { spear: 30, cav: 15, militia: 20 }, morale: 70, sight: 6, title: '校尉' },
  { id: 'lvxiang', name: '吕翔', faction: 'yuan', home: 'nanpi', soldiers: { spear: 25, cav: 15, militia: 20 }, morale: 70, sight: 6, title: '校尉' },
  // ---- 吕：徐州旧部 ----
  { id: 'chengong', name: '陈宫', faction: 'lv', home: 'xiapi', soldiers: { militia: 35, spear: 25, crossbow: 15 }, morale: 74, sight: 6, title: '军师' },
  { id: 'houcheng', name: '侯成', faction: 'lv', home: 'xiaopei', soldiers: { militia: 25, cav: 20, spear: 15 }, morale: 70, sight: 6, title: '骑都尉' },
  { id: 'songxian', name: '宋宪', faction: 'lv', home: 'pengcheng', soldiers: { militia: 25, spear: 20, cav: 12 }, morale: 68, sight: 6, title: '校尉' },
  { id: 'weixu', name: '魏续', faction: 'lv', home: 'pengcheng', soldiers: { militia: 25, spear: 20, cav: 10 }, morale: 68, sight: 6, title: '校尉' },
  // ---- 荆：守江的人 ----
  { id: 'huangzu', name: '黄祖', faction: 'biao', home: 'xiakou', soldiers: { militia: 35, archer: 25, boat: 20 }, morale: 70, sight: 6, title: '江夏太守' },
  { id: 'wenpin', name: '文聘', faction: 'biao', home: 'xiangyang', soldiers: { militia: 30, spear: 30, archer: 15 }, morale: 78, sight: 6, title: '大将' },
  { id: 'zhangyun', name: '张允', faction: 'biao', home: 'jiangling', soldiers: { militia: 25, archer: 20, boat: 25 }, morale: 68, sight: 5, title: '水军副将' },
  { id: 'wangwei', name: '王威', faction: 'biao', home: 'wan', soldiers: { militia: 25, spear: 25, archer: 10 }, morale: 72, sight: 6, title: '牙门将' },
  // ---- 益：蜀中诸将 ----
  { id: 'wuyi', name: '吴懿', faction: 'zhang', home: 'baxi', soldiers: { spear: 30, militia: 30, archer: 10 }, morale: 76, sight: 6, title: '中郎将' },
  { id: 'leitong', name: '雷铜', faction: 'zhang', home: 'jiangzhou', soldiers: { militia: 30, spear: 25, archer: 10 }, morale: 74, sight: 6, title: '裨将' },
  { id: 'lengbao', name: '冷苞', faction: 'zhang', home: 'jiange', soldiers: { spear: 25, militia: 25, crossbow: 10 }, morale: 72, sight: 6, title: '裨将' },
  { id: 'liugui', name: '刘璝', faction: 'zhang', home: 'chengdu', soldiers: { militia: 30, spear: 25, archer: 15 }, morale: 74, sight: 6, title: '中郎将' },
  // ---- 鲜卑：塞外诸部 ----
  { id: 'suli', name: '素利', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 40, qishe: 20, xianbei: 10 }, morale: 80, sight: 8, title: '东部大人' },
  { id: 'mijia', name: '弥加', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 35, qishe: 20 }, morale: 78, sight: 8, title: '部帅' },
  { id: 'queji', name: '阙机', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 30, qishe: 25 }, morale: 76, sight: 7, title: '部帅' },
  { id: 'huaitou', name: '槐头', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 30, qishe: 15, xianbei: 8 }, morale: 78, sight: 7, title: '小帅' },
  { id: 'pufulu', name: '普富卢', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 35, qishe: 20, xianbei: 6 }, morale: 76, sight: 7, title: '代郡大人' },
  // ---- 西凉：马家的兵 ----
  { id: 'pangde', name: '庞德', faction: 'ma', home: 'jincheng', soldiers: { cav: 30, tiefu: 18, spear: 25 }, morale: 90, sight: 8, title: '校尉' },
  { id: 'maxiu', name: '马休', faction: 'ma', home: 'wuwei', soldiers: { cav: 25, spear: 25, militia: 20 }, morale: 78, sight: 7, title: '奉车都尉' },
  { id: 'matie', name: '马铁', faction: 'ma', home: 'longxi', soldiers: { cav: 25, spear: 20, militia: 20 }, morale: 78, sight: 7, title: '骑都尉' },
  { id: 'chengyin', name: '程银', faction: 'ma', home: 'jincheng', soldiers: { cav: 25, spear: 20, qishe: 10 }, morale: 74, sight: 7, title: '校尉' },
  // ---- 汉：关中残军 ----
  { id: 'zhujun', name: '朱儁', faction: 'han', home: 'luoyang', soldiers: { militia: 35, spear: 30, crossbow: 15, jinjun: 5 }, morale: 78, sight: 6, title: '右中郎将' },
  { id: 'luzhi', name: '卢植', faction: 'han', home: 'zhuo', soldiers: { militia: 30, spear: 30, crossbow: 20 }, morale: 80, sight: 6, title: '北中郎将' },
  { id: 'dongcheng', name: '董承', faction: 'han', home: 'changan', soldiers: { militia: 25, spear: 20, guard: 10 }, morale: 72, sight: 5, title: '车骑将军' },
  { id: 'yangfeng', name: '杨奉', faction: 'han', home: 'hulao', soldiers: { militia: 30, cav: 15, spear: 15 }, morale: 70, sight: 6, title: '兴义将军' },
  { id: 'zhongji', name: '种辑', faction: 'han', home: 'changan', soldiers: { militia: 25, spear: 20, guard: 8 }, morale: 68, sight: 5, title: '越骑校尉' },

  // ---- 放大天下以后补的领主：魏蜀吴袁刘各添一队人 ----
  // 魏：宗亲、五子、宿卫
  { id: 'caohong', name: '曹洪', faction: 'wei', home: 'chenliu', soldiers: { militia: 45, spear: 35, cav: 18 }, morale: 82, sight: 7, title: '都护将军' },
  { id: 'yuejin', name: '乐进', faction: 'wei', home: 'puyang', soldiers: { spear: 40, militia: 30, crossbow: 15 }, morale: 85, sight: 7, title: '折冲将军' },
  { id: 'yujin', name: '于禁', faction: 'wei', home: 'runan', soldiers: { spear: 45, crossbow: 20, guard: 8 }, morale: 84, sight: 7, title: '虎威将军' },
  { id: 'dianwei', name: '典韦', faction: 'wei', home: 'xuchang', soldiers: { spear: 35, guard: 28, militia: 20 }, morale: 93, sight: 6, title: '都尉' },
  { id: 'lidian', name: '李典', faction: 'wei', home: 'qiao', soldiers: { militia: 35, spear: 30, archer: 15 }, morale: 78, sight: 6, title: '破虏将军' },
  // 蜀：荆州旧部与汉中守将
  { id: 'madai', name: '马岱', faction: 'shu', home: 'hanzhong', soldiers: { cav: 32, spear: 30, militia: 18 }, morale: 88, sight: 8, title: '平北将军' },
  { id: 'guanping', name: '关平', faction: 'shu', home: 'xinye', soldiers: { spear: 35, militia: 28, cav: 15 }, morale: 90, sight: 7, title: '军前都督' },
  { id: 'liaohua', name: '廖化', faction: 'shu', home: 'xinye', soldiers: { militia: 35, spear: 25, archer: 12 }, morale: 82, sight: 6, title: '主簿' },
  { id: 'yanyan', name: '严颜', faction: 'shu', home: 'jiangzhou', soldiers: { spear: 38, militia: 25, archer: 16 }, morale: 86, sight: 7, title: '巴郡太守' },
  { id: 'zhoucang', name: '周仓', faction: 'shu', home: 'xinye', soldiers: { militia: 30, spear: 30, baier: 10 }, morale: 88, sight: 6, title: '部曲督' },
  // 吴：江东十二虎臣
  { id: 'zhoutai', name: '周泰', faction: 'wu', home: 'jianye', soldiers: { militia: 32, spear: 30, danyang: 16 }, morale: 90, sight: 7, title: '奋威将军' },
  { id: 'lingtong', name: '凌统', faction: 'wu', home: 'wujun', soldiers: { militia: 30, archer: 28, cav: 18 }, morale: 88, sight: 7, title: '荡寇中郎将' },
  { id: 'xusheng', name: '徐盛', faction: 'wu', home: 'kuaiji', soldiers: { archer: 35, spear: 25, boat: 12 }, morale: 84, sight: 7, title: '建武将军' },
  { id: 'dingfeng', name: '丁奉', faction: 'wu', home: 'chaisang', soldiers: { militia: 30, archer: 25, danyang: 14 }, morale: 85, sight: 7, title: '偏将军' },
  { id: 'zhugejin', name: '诸葛瑾', faction: 'wu', home: 'jianye', soldiers: { militia: 30, spear: 25, archer: 15 }, morale: 76, sight: 6, title: '长史' },
  // 袁：河北旧部
  { id: 'gaolan', name: '高览', faction: 'yuan', home: 'ye', soldiers: { spear: 35, cav: 28, militia: 20 }, morale: 82, sight: 7, title: '中郎将' },
  { id: 'shenpei', name: '审配', faction: 'yuan', home: 'ye', soldiers: { militia: 40, spear: 30, crossbow: 18 }, morale: 78, sight: 6, title: '治中' },
  { id: 'yuantan', name: '袁谭', faction: 'yuan', home: 'pingyuan', soldiers: { militia: 45, spear: 30, cav: 15 }, morale: 76, sight: 6, title: '青州刺史' },
  { id: 'yuanshang', name: '袁尚', faction: 'yuan', home: 'ye', soldiers: { cav: 35, spear: 28, guard: 10 }, morale: 80, sight: 7, title: '冀州牧' },
  { id: 'hanmeng', name: '韩猛', faction: 'yuan', home: 'zhuo', soldiers: { spear: 30, cav: 25, militia: 22 }, morale: 74, sight: 6, title: '骑都尉' },
  // 刘表：荆襄守江的人
  { id: 'liupan', name: '刘磐', faction: 'biao', home: 'xiangyang', soldiers: { militia: 35, spear: 28, archer: 18 }, morale: 78, sight: 6, title: '江夏从事' },
  { id: 'sufei', name: '苏飞', faction: 'biao', home: 'xiakou', soldiers: { militia: 28, archer: 24, boat: 18 }, morale: 74, sight: 6, title: '江夏都督' },
  { id: 'kuaiyue', name: '蒯越', faction: 'biao', home: 'xiangyang', soldiers: { militia: 30, spear: 25, crossbow: 15 }, morale: 76, sight: 6, title: '章陵太守' },
  { id: 'huangshe', name: '黄射', faction: 'biao', home: 'xiakou', soldiers: { archer: 30, boat: 20, militia: 20 }, morale: 72, sight: 6, title: '水军校尉' },
];

/** 声望等级 */
const RENOWN_TIERS = [
  { at: 0, name: '溃兵之首' },
  { at: 40, name: '一方游侠' },
  { at: 100, name: '小有威名' },
  { at: 200, name: '郡国校尉' },
  { at: 350, name: '一方诸侯' },
  { at: 550, name: '天下名将' },
];

/** 装备：十档，越往后价钱翻着涨，别想一进城就把一身换满 */
const EQUIPMENT = {
  blade: {
    slot: 'blade', name: '兵刃',
    tiers: [
      { id: 'blade0', name: '环首刀', price: 0, atkPct: 0, desc: '洛阳溃兵身上仅剩的制式刀。' },
      { id: 'blade1', name: '百炼钢刀', price: 260, atkPct: 0.06, desc: '战团攻击 +6%。' },
      { id: 'blade2', name: '宿铁刀', price: 620, atkPct: 0.12, desc: '战团攻击 +12%。' },
      { id: 'blade3', name: '古锭刀', price: 1400, atkPct: 0.18, desc: '战团攻击 +18%。' },
      { id: 'blade4', name: '青釭剑', price: 3100, atkPct: 0.24, desc: '战团攻击 +24%。' },
      { id: 'blade5', name: '倚天剑', price: 6800, atkPct: 0.30, desc: '战团攻击 +30%。' },
      { id: 'blade6', name: '龙胆亮银枪', price: 15000, atkPct: 0.36, desc: '战团攻击 +36%。' },
      { id: 'blade7', name: '丈八蛇矛', price: 33000, atkPct: 0.42, desc: '战团攻击 +42%。' },
      { id: 'blade8', name: '青龙偃月刀', price: 72000, atkPct: 0.48, desc: '战团攻击 +48%。' },
      { id: 'blade9', name: '方天画戟', price: 160000, atkPct: 0.56, desc: '战团攻击 +56%，阵前一站，三军侧目。' },
    ],
  },
  armor: {
    slot: 'armor', name: '甲胄',
    tiers: [
      { id: 'armor0', name: '皮甲', price: 0, defPct: 0, desc: '挡不住弩，但比布衣强。' },
      { id: 'armor1', name: '玄铁札甲', price: 300, defPct: 0.07, desc: '战团防御 +7%。' },
      { id: 'armor2', name: '鱼鳞甲', price: 720, defPct: 0.13, desc: '战团防御 +13%。' },
      { id: 'armor3', name: '两当铠', price: 1600, defPct: 0.19, desc: '战团防御 +19%。' },
      { id: 'armor4', name: '锁子甲', price: 3500, defPct: 0.25, desc: '战团防御 +25%。' },
      { id: 'armor5', name: '明光铠', price: 7700, defPct: 0.31, desc: '战团防御 +31%，日光下晃眼。' },
      { id: 'armor6', name: '山文甲', price: 17000, defPct: 0.37, desc: '战团防御 +37%。' },
      { id: 'armor7', name: '玄甲', price: 37000, defPct: 0.43, desc: '战团防御 +43%，玄甲铁骑的底子。' },
      { id: 'armor8', name: '黄金甲', price: 81000, defPct: 0.49, desc: '战团防御 +49%。' },
      { id: 'armor9', name: '兽面吞头连环铠', price: 180000, defPct: 0.56, desc: '战团防御 +56%，刀箭难入。' },
    ],
  },
  horse: {
    slot: 'horse', name: '坐骑',
    tiers: [
      { id: 'horse0', name: '驮马', price: 0, speedPct: 0, desc: '能驮粮，不能冲阵。' },
      { id: 'horse1', name: '并州马', price: 340, speedPct: 0.10, desc: '行军速度 +10%。' },
      { id: 'horse2', name: '西凉马', price: 800, speedPct: 0.19, desc: '行军速度 +19%。' },
      { id: 'horse3', name: '辽东马', price: 1800, speedPct: 0.27, desc: '行军速度 +27%。' },
      { id: 'horse4', name: '大宛马', price: 3900, speedPct: 0.34, desc: '行军速度 +34%。' },
      { id: 'horse5', name: '绝影', price: 8500, speedPct: 0.40, desc: '行军速度 +40%，箭追不上。' },
      { id: 'horse6', name: '的卢', price: 18500, speedPct: 0.46, desc: '行军速度 +46%。' },
      { id: 'horse7', name: '爪黄飞电', price: 40000, speedPct: 0.51, desc: '行军速度 +51%。' },
      { id: 'horse8', name: '照夜玉狮子', price: 86000, speedPct: 0.56, desc: '行军速度 +56%。' },
      { id: 'horse9', name: '赤兔', price: 190000, speedPct: 0.62, desc: '行军速度 +62%，人中吕布，马中赤兔。' },
    ],
  },
};

/** 天机简：能改一次战局的一句话；只有增益，没有反噬 */
const HISTORY_MARKS = {
  wind: {
    id: 'wind', name: '南风起', text: '你写下“南风起”，风真的转了向。',
    desc: '本场我方攻击 +90%，火攻类战斗额外 +50%。',
  },
  calm: {
    id: 'calm', name: '风止', text: '你写下“风止”，风停了，火也停了。',
    desc: '只压敌军攻势 70%，持续 3 回合；我方不受反噬。',
  },
  roll: {
    id: 'roll', name: '名册', text: '你写下阵亡者的名字，他们又站了起来。',
    desc: '战后本场阵亡的我方士兵回归 70%。',
  },
};

/**
 * 战役链：章节按顺序推进
 * check 为状态键，由 core/campaign.js 判定
 */
const CAMPAIGN = [
  {
    id: 'prologue', title: '序章 · 洛阳溃兵',
    goal: '带上剩下的几名弟兄，活着抵达陈留',
    story: '洛阳城破那夜，你只带出九个人，往东跑。身后是西凉重步，脚下是结冰的护城河。\n你不是要赢，你只是要过桥。',
    check: 'reach_chenliu',
    reward: { renown: 20, shi: 1 },
    after: '过桥的时候还剩八个。你数了两遍，怕漏了谁。',
  },
  {
    id: 'act1', title: '第一幕 · 陈留募兵',
    goal: '在陈留把队伍扩到 30 人',
    story: '陈留城外插满了募兵的木牌。曹操在招人，刘备在招人，孙策的使者也在。\n谁给粮，你跟谁走。',
    check: 'troops_30',
    reward: { renown: 30, shi: 1, banner: true },
    after: '你有了第一面自己的旗。旗是旧的，字是新写的。',
  },
  {
    id: 'act1b', title: '幕间 · 濮阳城外的粮车',
    goal: '带 45 人去濮阳，打退抢粮的黄巾余部',
    story: '濮阳的粮车被黄巾余部截在城外。守军不敢出城，只肯在城头上看着。\n你手下三十来号人，多是新募的农夫。这一仗不大，但够他们见血。',
    check: 'win_puyang',
    reward: { renown: 35, gold: 160, food: 40 },
    after: '粮车推进了城。守军分你一半，剩下的他们留下过冬。',
  },
  {
    id: 'act1c', title: '幕间 · 陈留整军',
    goal: '把队伍扩到 60 人，粮草备足 80',
    story: '连着两仗，队伍里多了几张生面孔。陈留的校场上，你按十人一队重新编伍。\n乌巢在北边，路上尽是袁军的游骑。人不够、粮不够，去了就是送。',
    check: 'troops_60_food',
    reward: { renown: 40, gold: 200, food: 30 },
    after: '六十人站成六行。你把旗插在校场中央，第一次觉得这面旗有分量。',
  },
  {
    id: 'act2', title: '第二幕 · 官渡 · 乌巢夜袭',
    goal: '带 90 人以上抵近官渡，烧掉袁军的粮囤',
    story: '淳于琼嗜酒。今夜他帐里的灯亮到三更。\n粮囤十二座，堆在最西边的那座是主仓。你的马都上了嚼子，不许出声。',
    check: 'win_wuchao',
    reward: { renown: 60, shi: 1, gold: 300 },
    after: '火顺着风烧了半夜。第二天，袁军的营里没有炊烟。',
  },
  {
    id: 'act3', title: '第三幕 · 下邳 · 白门楼',
    goal: '攻下下邳，处理吕布',
    story: '泗水被断了，城墙泡在水里。云梯队已经搭上城头。\n城门开了，吕布带五十骑冲出来。',
    check: 'take_xiapi',
    reward: { renown: 80 },
    after: '白门楼上风很大。你做了那个决定，后来很多年都有人提起。',
  },
  {
    id: 'act3b', title: '幕间 · 白门楼的降卒',
    goal: '把队伍扩到 120 人，收拢吕布留下的旧部',
    story: '白门楼的血还没干，城外的降卒已经排成了长队。有人认得你腰上的刀，也有人只认得粮。\n你把名册摊在膝上，一页一页地看：这些人昨天还替吕布守城，今天愿意替谁守？',
    check: 'troops_120',
    reward: { renown: 55, gold: 220 },
    after: '一百二十人站满了校场。你把吕布的旧旗折起来，压在箱底。',
  },
  {
    id: 'act3c', title: '幕间 · 寿春的粮市',
    goal: '到寿春，看看淮南的粮价',
    story: '寿春的城门前排着长队，粮袋却一天比一天轻。卖粮的老头说，西边已经三个月没下透雨。\n你买了两车粮，又听见有人在背后说：这天，怕是要变。',
    check: 'reach_shouchun',
    reward: { renown: 45, food: 55 },
    after: '粮车出了寿春。你回头看了一眼城头，旗还在，人心已经散了。',
  },
  {
    id: 'act3d', title: '幕间 · 夏口借船',
    goal: '到夏口，借一支能过江的船',
    story: '夏口的江面全是桅杆。黄祖的水军不让你靠岸，只肯卖你几条旧船。\n船板上有刀痕。船工说，上一任船主死在赤壁。',
    check: 'reach_xiakou',
    reward: { renown: 60, gold: 150 },
    after: '你站在船头，看见江对岸的烽火。南边的事，终于要来了。',
  },
  {
    id: 'act4', title: '第四幕 · 赤壁',
    goal: '抵近赤壁，火烧连环船',
    story: '八艘火船靠上去。风向不对，火会往自己这边烧。\n江面上全是铁链连起来的船，像一条不会动的城。',
    check: 'win_chibi',
    reward: { renown: 100, shi: 1 },
    after: '火烧到天亮。江面漂着一层焦木，和一层没烧完的旗。',
  },
  {
    id: 'act5', title: '第五幕 · 夷陵 · 连营七百里',
    goal: '抵近夷陵，破连营',
    story: '四十座营寨一线排开，从江边排到山脚。\n你先点的火。火顺着风一路烧过去，把四十座营连成一条。',
    check: 'win_yiling',
    reward: { renown: 120, shi: 1 },
    after: '火是从东边烧起来的。烧到第七座营的时候，你看见了熟人的旗。',
  },
  {
    id: 'final', title: '终幕 · 定稿之战',
    goal: '兵过 250，在任一都城与无旗亲军决战',
    story: '三方残余都到了。还有一支没有旗号的亲军，全员重甲，不溃不退。\n史书最后由谁来写，看这一仗。',
    check: 'win_final',
    reward: { renown: 200 },
    after: '你放下了笔。纸上只有一行字，墨还没干。',
  },
];

/** 结局判定文案 */
const ENDINGS = {
  ding: {
    title: '定稿', text: '天下归一。你封了侯，食邑三千户。\n但你的名字，不进任何一块碑。',
  },
  xu: {
    title: '续史', text: '没有正统，也没有太平。\n可你护住的那本名册，一个名字都没少。',
  },
  fen: {
    title: '焚史', text: '你烧掉了所有天机简。\n从此谁也定不了谁，地图永远乱，你的兵永远不缺。',
  },
  self: {
    title: '自立', text: '你没站在任何人后面。\n这一页是你自己写的，写得好不好，也没人改了。',
  },
};

/** 战斗战场地名（用于战报文案） */
const BATTLE_SITES = ['河滩', '断桥', '麦田', '山道', '城门', '江岸', '营地', '林口'];

module.exports = {
  BASE_W,
  BASE_H,
  MAP_W,
  MAP_H,
  TERRAIN,
  REGIONS,
  COAST,
  RIVER_HUANG,
  RIVER_YANG,
  RIVER_HUAI,
  MOUNTAINS,
  SITE_ROWS,
  CAPITAL_IDS,
  RECRUIT_SETS,
  ROADS,
  FACTIONS,
  FACTION_RULERS,
  SUCCESSION,
  LORDS,
  RENOWN_TIERS,
  EQUIPMENT,
  HISTORY_MARKS,
  CAMPAIGN,
  ENDINGS,
  BATTLE_SITES,
};

  };

  /* js/render/pixel.js */
  __defs[3] = function (module, exports, __require) {
/**
 * 像素美术层：所有贴图由代码生成，零图片资源。
 * 地形按「区域 × 地形」懒生成，所以塞北草原、中原麦田、江南水乡看起来不一样。
 */

const { RNG } = __require(4);
const { REGIONS } = __require(5);

const UI_COLORS = {
  bg: '#12100c',
  panel: '#241c14',
  panelAlt: '#1d1711',
  border: '#7d6038',
  borderDark: '#4a3826',
  text: '#efe3c6',
  dim: '#a2947a',
  accent: '#d9a441',
  gold: '#f0c060',
  danger: '#b4463c',
  good: '#6aa84f',
  blue: '#5a7fb5',
  shadow: 'rgba(0,0,0,0.45)',
  ink: '#0d0b08',
};

/** 水系 / 山体固定色（不随区域变，避免绿色河流） */
const FIXED = {
  river: { base: '#33608a', dark: '#28506f', light: '#457a9e', detail: '#8ab6d2' },
  sea: { base: '#22476b', dark: '#1a3752', light: '#2e5b82', detail: '#5f92b4' },
  mountain: { base: '#7c756b', dark: '#635d55', light: '#969085', detail: '#c8c1b4' },
};

function newCanvas(runtime, w, h) {
  const c = runtime.createCanvas();
  c.width = w;
  c.height = h || w;
  return c;
}

function px(g, x, y, color, w, h) {
  g.fillStyle = color;
  g.fillRect(x, y, w || 1, h || 1);
}

/** 取某区域某地形的配色 */
function paletteFor(regionId, terrain) {
  const reg = REGIONS[regionId] || REGIONS.zhongyuan;
  if (terrain === 'river' || terrain === 'sea' || terrain === 'mountain') {
    const base = FIXED[terrain];
    return {
      base: base.base, dark: base.dark, light: base.light,
      detail: terrain === 'mountain' ? (reg.palette.deco || base.detail) : base.detail,
    };
  }
  // 道路固定色：不管在哪个区域，路都得看得见
  if (terrain === 'road') {
    return { base: '#a89068', dark: '#8a7550', light: '#c3a97e', detail: '#6d5a3c' };
  }
  const p = reg.palette;
  return { base: p.ground, dark: p.dark, light: p.light, detail: p.deco };
}

/**
 * 生成一格地形（16x16）
 * 底纹只做很轻的颗粒，山脊 / 河道 / 道路的形状交给大地图折线层统一绘制，
 * 这样整片山地不会变成一排排重复的小山，水面也不会是一格一格的方块。
 */
function makeTerrainSprite(runtime, terrain, pal, seed) {
  const size = 16;
  const c = newCanvas(runtime, size, size);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const rng = new RNG(seed);

  px(g, 0, 0, pal.base, size, size);

  // 统一颗粒：只为破掉纯色，不制造噪点
  for (let i = 0; i < 6; i++) {
    px(g, rng.int(0, 15), rng.int(0, 15), rng.chance(0.5) ? pal.dark : pal.light);
  }

  if (terrain === 'plain') {
    for (let i = 0; i < 3; i++) {
      const x = rng.int(2, 13);
      const y = rng.int(3, 14);
      px(g, x, y, pal.detail, 1, 2);
      px(g, x + 1, y + 1, pal.dark);
    }
  } else if (terrain === 'farm') {
    // 田块：只撒作物点，不画垄线，免得整片地图出现规律条纹
    for (let i = 0; i < 6; i++) {
      const x = rng.int(1, 14);
      const y = rng.int(1, 14);
      px(g, x, y, pal.detail);
      if (i % 2 === 0) px(g, x + 1, y, pal.dark);
    }
  } else if (terrain === 'forest') {
    const trees = [[3, 5], [9, 9], [12, 4]];
    trees.forEach(function (t) {
      px(g, t[0], t[1], '#4a3a24', 1, 3);
      px(g, t[0] - 1, t[1] - 2, pal.dark, 3, 3);
      px(g, t[0], t[1] - 3, pal.dark, 1, 1);
      px(g, t[0] - 1, t[1] - 2, pal.light);
    });
  } else if (terrain === 'marsh') {
    for (let i = 0; i < 2; i++) {
      const x = rng.int(1, 10);
      const y = rng.int(3, 12);
      px(g, x, y, '#3d6672', 4, 2);
      px(g, x + 1, y, '#5f8b93', 2, 1);
    }
    for (let i = 0; i < 2; i++) px(g, rng.int(2, 13), 4, '#b6a165', 1, 3);
  } else if (terrain === 'hills') {
    for (let i = 0; i < 2; i++) {
      const y = 5 + i * 6;
      px(g, 1, y, pal.dark, 14, 1);
      px(g, 3, y - 1, pal.light, 10, 1);
    }
  } else if (terrain === 'mountain') {
    px(g, 3, 6, pal.light, 6, 1);
    px(g, 0, 10, pal.light, 5, 1);
    px(g, 9, 12, pal.light, 5, 1);
    px(g, 4, 7, pal.dark, 3, 1);
  } else if (terrain === 'river') {
    px(g, 3, 5, pal.detail, 5, 1);
    px(g, 8, 11, pal.detail, 4, 1);
  } else if (terrain === 'sea') {
    px(g, 2, 4, pal.detail, 4, 1);
    px(g, 9, 9, pal.detail, 4, 1);
    px(g, 4, 13, pal.light, 5, 1);
  } else if (terrain === 'desert') {
    px(g, 1, 5, pal.light, 7, 1);
    px(g, 8, 10, pal.light, 6, 1);
    px(g, 3, 13, pal.dark, 4, 1);
  } else if (terrain === 'road') {
    for (let i = 0; i < 4; i++) px(g, rng.int(0, 15), rng.int(0, 15), pal.dark, 2, 1);
  }

  return c;
}

/** 城池贴图：石墙/木屋，不带势力色（势力旗另外画） */
function makeSiteSprite(runtime, type, seed) {
  const size = 16;
  const c = newCanvas(runtime, size, size);
  const g = c.getContext('2d');
  const rng = new RNG(seed);
  g.clearRect(0, 0, size, size);

  const stone = '#8f8b82';
  const stoneDark = '#66625b';
  const roof = '#9c4a3c';
  const roofDark = '#70342a';
  const wood = '#8a6a44';
  const woodDark = '#5f4830';
  const tileRoof = '#5a5750';

  if (type === 'town') {
    // 墙基与墙体
    px(g, 0, 9, '#332e26', 16, 7);
    px(g, 1, 6, '#9c9589', 14, 8);
    px(g, 1, 6, '#b4ada0', 14, 1);
    // 城垛
    for (let i = 1; i < 15; i += 3) px(g, i, 4, '#a49d90', 2, 2);
    // 双塔
    px(g, 0, 2, '#7a7468', 4, 13);
    px(g, 12, 2, '#7a7468', 4, 13);
    px(g, 1, 3, '#a49d90', 2, 11);
    px(g, 13, 3, '#a49d90', 2, 11);
    px(g, 1, 1, roof, 2, 2);
    px(g, 13, 1, roof, 2, 2);
    // 城门
    px(g, 6, 9, '#211a12', 4, 6);
    px(g, 6, 8, '#4a3826', 4, 2);
    px(g, 7, 11, '#e8b45a', 2, 2);
    // 城头旗
    px(g, 8, 2, '#6b5136', 1, 5);
    px(g, 9, 2, '#b8342a', 3, 2);
  } else if (type === 'castle') {
    // 关隘：两座墩台夹一座主塔
    px(g, 1, 7, '#332e26', 14, 9);
    px(g, 1, 6, '#9c9589', 14, 2);
    px(g, 0, 3, '#7a7468', 4, 12);
    px(g, 12, 3, '#7a7468', 4, 12);
    px(g, 1, 4, '#a49d90', 2, 10);
    px(g, 13, 4, '#a49d90', 2, 10);
    px(g, 6, 2, '#a49d90', 4, 12);
    px(g, 6, 2, '#b4ada0', 4, 1);
    px(g, 7, 4, '#211a12', 2, 3);
    px(g, 7, 11, '#211a12', 2, 5);
    px(g, 2, 1, roof, 2, 2);
    px(g, 13, 1, roof, 2, 2);
  } else if (type === 'village') {
    px(g, 2, 9, wood, 6, 5);
    px(g, 2, 9, woodDark, 6, 1);
    px(g, 1, 7, roofDark, 8, 2);
    px(g, 2, 6, roof, 6, 1);
    px(g, 8, 11, '#231a12', 2, 3);
    px(g, 9, 10, wood, 5, 4);
    px(g, 9, 10, woodDark, 5, 1);
    px(g, 8, 8, roof, 7, 2);
    px(g, 11, 12, '#231a12', 2, 2);
    // 草垛 / 井
    px(g, 3, 13, '#b0954a', 2, 2);
    px(g, 13, 13, '#4a3826', 2, 2);
  } else if (type === 'camp') {
    px(g, 3, 8, '#8d4a3c', 7, 6);
    px(g, 2, 7, '#6d3427', 9, 2);
    px(g, 2, 14, '#3f2c20', 9, 1);
    px(g, 5, 10, '#1e1610', 2, 4);
    px(g, 11, 11, '#e0b34a', 2, 2);
    px(g, 10, 13, '#7a5230', 4, 1);
    px(g, 12, 4, wood, 1, 6);
    px(g, 12, 3, stone, 1, 1);
  }
  return c;
}

/**
 * 玩家：骑马武将（32 x 40 像素网格）
 * 朱红披风 + 金甲 + 黑马，配长枪与背后旗
 */
function makePlayerSprite(runtime) {
  const W = 32;
  const H = 40;
  const c = newCanvas(runtime, W, H);
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);

  const horse = '#241d18';
  const horseLight = '#3a2f26';
  const cape = '#b8342a';
  const capeLight = '#d9503f';
  const armor = '#e0a83c';
  const armorLight = '#f5cf72';
  const armorDark = '#a97a22';
  const skin = '#e0b98d';
  const steel = '#cfd3da';
  const plume = '#f2e6c8';

  // 马身
  px(g, 9, 24, horse, 16, 9);
  px(g, 9, 24, horseLight, 16, 1);
  px(g, 23, 20, horse, 4, 6); // 颈
  px(g, 25, 17, horse, 4, 4); // 头
  px(g, 27, 15, horse, 2, 2);
  px(g, 24, 16, '#e8e2d2', 1, 2); // 眼
  px(g, 11, 33, horse, 2, 6); // 前腿
  px(g, 15, 33, horse, 2, 6);
  px(g, 21, 33, horse, 2, 6); // 后腿
  px(g, 24, 33, horse, 2, 6);
  px(g, 12, 32, '#1a1512', 2, 1);
  px(g, 22, 32, '#1a1512', 2, 1);
  // 马鞍与缰
  px(g, 12, 23, '#7d4a2a', 10, 3);
  px(g, 13, 22, '#a5683a', 8, 1);
  px(g, 26, 18, '#c9a06a', 4, 1);

  // 披风（在马后飘）
  px(g, 6, 18, cape, 7, 14);
  px(g, 4, 22, cape, 3, 8);
  px(g, 7, 18, capeLight, 5, 2);
  px(g, 5, 30, '#8f251d', 6, 2);

  // 躯干
  px(g, 13, 15, armor, 8, 8);
  px(g, 13, 15, armorLight, 8, 2);
  px(g, 13, 21, armorDark, 8, 2);
  px(g, 12, 17, armor, 1, 6);
  // 肩甲
  px(g, 11, 14, armorLight, 4, 3);
  px(g, 20, 14, armorLight, 4, 3);
  px(g, 11, 16, armorDark, 4, 1);
  px(g, 20, 16, armorDark, 4, 1);

  // 头与盔
  px(g, 15, 8, skin, 6, 7);
  px(g, 14, 6, armorDark, 8, 3);
  px(g, 14, 5, armor, 8, 2);
  px(g, 16, 3, plume, 4, 3); // 盔缨
  px(g, 15, 4, plume, 1, 2);
  px(g, 20, 4, plume, 1, 2);
  px(g, 16, 10, '#3a2a1e', 1, 1); // 眼
  px(g, 19, 10, '#3a2a1e', 1, 1);
  px(g, 16, 12, '#8a5a3a', 4, 1);

  // 长枪（右手，斜指前方）
  px(g, 24, 4, steel, 1, 22);
  px(g, 22, 26, '#5f4830', 3, 2);
  px(g, 24, 1, steel, 1, 3);
  px(g, 23, 2, '#eef2f6', 1, 1);
  // 枪缨
  px(g, 23, 5, '#c93a2a', 3, 2);

  // 背后旗
  px(g, 8, 4, '#5f4830', 1, 14);
  px(g, 8, 3, '#d9a441', 6, 6);
  px(g, 9, 4, '#7a2118', 4, 3);

  return c;
}

/**
 * 领主棋子：小骑马剪影
 * color 为势力色；look 决定这个人的样子：
 *   weapon: ji / dao / qiang / gong / jian
 *   helm:   plume（双翎） / horn（红缨盔） / crown（高冠） / band（头巾）
 *   cape / horse: 披风与马的颜色；beard 长髯；big 壮；tall 高
 * 也可以直接传字符串 'lvbu' / 'normal' 兼容旧调用。
 */
function makeLordSprite(runtime, color, look) {
  if (!look || typeof look === 'string') {
    const old = look;
    look = old === 'lvbu'
      ? { weapon: 'ji', helm: 'plume', cape: '#b03a30', horse: '#6a2a22' }
      : {};
  }
  const size = 20;
  const c = newCanvas(runtime, size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const main = color || '#e6e2d6';
  const dark = shade(main, -0.32);
  const horse = look.horse || '#2a2320';
  const horseHi = shade(horse, 0.22);
  const cape = look.cape || shade(main, -0.16);
  const skin = look.skin || '#d8cdb6';
  const tall = !!look.tall;

  // 马
  px(g, 3, 12, horse, 12, 5);
  px(g, 3, 12, horseHi, 12, 1);
  px(g, 14, 9, horse, 3, 4);
  px(g, 4, 16, shade(horse, -0.18), 2, 3);
  px(g, 12, 16, shade(horse, -0.18), 2, 3);
  px(g, 3, 13, shade(horse, 0.35), 2, 1);

  // 披风（马背上、骑手身后）
  px(g, 5, tall ? 9 : 10, cape, 2, tall ? 8 : 7);
  px(g, 5, tall ? 9 : 10, shade(cape, 0.25), 1, tall ? 8 : 7);

  // 骑手
  const bodyY = tall ? 5 : 6;
  const bodyH = tall ? 7 : 6;
  px(g, 7, bodyY, main, 6, bodyH);
  px(g, 7, bodyY, dark, 1, bodyH);
  px(g, 7, bodyY, 'rgba(0,0,0,0.22)', 6, 1);
  px(g, 7, bodyY + bodyH - 2, '#4a3a28', 6, 1);

  // 头
  const headY = bodyY - 3;
  px(g, 8, headY, skin, 4, 3);
  if (look.beard) px(g, 8, headY + 3, shade(skin, -0.5), 3, 1);

  // 头饰
  const helm = look.helm || 'band';
  if (helm === 'plume') {
    px(g, 8, headY - 1, '#3a3a44', 4, 1);
    px(g, 7, 0, '#c03830', 1, 4);
    px(g, 12, 0, '#c03830', 1, 4);
  } else if (helm === 'horn') {
    px(g, 8, headY - 1, '#3a3a44', 4, 1);
    px(g, 9, headY - 3, '#c03830', 2, 2);
  } else if (helm === 'crown') {
    px(g, 8, headY - 2, '#2a2a30', 4, 2);
    px(g, 8, headY - 2, '#d9a441', 4, 1);
  } else {
    px(g, 8, headY - 1, dark, 4, 1);
  }
  if (look.big) px(g, 6, bodyY, main, 1, bodyH);

  // 兵器
  const weapon = look.weapon || 'dao';
  if (weapon === 'ji') {
    px(g, 16, 2, '#8a8f99', 1, 14);
    px(g, 15, 2, '#d8dde6', 3, 2);
    px(g, 14, 4, '#d8dde6', 2, 1);
  } else if (weapon === 'qiang') {
    px(g, 16, 3, '#7a6a52', 1, 13);
    px(g, 16, 1, '#d8dde6', 1, 2);
    px(g, 15, 3, '#b03a30', 2, 1);
  } else if (weapon === 'gong') {
    px(g, 16, 4, '#6a4a2c', 1, 9);
    px(g, 17, 5, '#8a7a5c', 1, 7);
    px(g, 15, 5, '#d8d2c0', 1, 7);
  } else if (weapon === 'jian') {
    px(g, 16, 4, '#c8ccd6', 1, 9);
    px(g, 15, 12, '#4a3a28', 2, 1);
  } else {
    px(g, 16, 4, '#b8bcc4', 1, 11);
    px(g, 15, 3, '#e2e6ee', 2, 2);
  }

  // 小旗
  px(g, 18, 0, '#5f4830', 1, 9);
  px(g, 18, 1, main, 2, 4);
  return c;
}

/** 匪团棋子：按等级换衣色，青/蓝/橙/红一眼分得开 */
function makeBanditSprite(runtime, color) {
  const size = 14;
  const c = newCanvas(runtime, size, size);
  const g = c.getContext('2d');
  const body = color || '#7d2f28';
  const dark = shade(body, -0.35);
  px(g, 4, 6, body, 5, 6);
  px(g, 4, 6, dark, 1, 6);
  px(g, 5, 3, '#8a6a44', 3, 3);
  px(g, 4, 2, dark, 5, 2);
  px(g, 9, 5, '#c9c9d2', 1, 6);
  px(g, 5, 12, dark, 1, 2);
  px(g, 8, 12, dark, 1, 2);
  return c;
}

/** 颜色明暗调整 */
function shade(hex, amt) {
  const s = hex.replace('#', '');
  const r = Math.max(0, Math.min(255, Math.round(parseInt(s.substring(0, 2), 16) * (1 + amt))));
  const gg = Math.max(0, Math.min(255, Math.round(parseInt(s.substring(2, 4), 16) * (1 + amt))));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(s.substring(4, 6), 16) * (1 + amt))));
  const pad = function (n) { return (n < 16 ? '0' : '') + n.toString(16); };
  return '#' + pad(r) + pad(gg) + pad(b);
}

/** 小旗 */
function makeFlagSprite(runtime, color) {
  const size = 12;
  const c = newCanvas(runtime, size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  px(g, 2, 0, '#5f4830', 1, 12);
  px(g, 3, 1, color, 7, 5);
  px(g, 3, 6, color, 7, 1);
  px(g, 4, 2, 'rgba(255,255,255,0.35)', 5, 1);
  return c;
}

let CACHE = null;

/* ================================================================
 * 队伍 / 人物模型：一套网格画法，放大倍数不同 → 地图棋子 / 对话立绘
 * 网格参考 42 × 40：一匹马加骑手，再带两名步卒
 * ================================================================ */

function sp(g, s, ox, oy, x, y, color, w, h) {
  g.fillStyle = color;
  g.fillRect(Math.round(ox + x * s), Math.round(oy + y * s),
    Math.max(1, Math.round((w || 1) * s)), Math.max(1, Math.round((h || 1) * s)));
}

/** 骑手：马 + 人 + 披风 + 兵器 + 旗 */
function drawKnight(g, s, ox, oy, look, color) {
  const L = look || {};
  const main = color || '#e6e2d6';
  const dark = shade(main, -0.34);
  const cape = L.cape || shade(main, -0.2);
  const horse = L.horse || '#2a2320';
  const hHi = shade(horse, 0.26);
  const hDk = shade(horse, -0.3);
  const skin = '#dcd0b6';
  const skinDk = shade(skin, -0.28);

  // 马：躯干、颈、头、尾、四腿
  sp(g, s, ox, oy, 8, 26, horse, 24, 7);
  sp(g, s, ox, oy, 8, 26, hHi, 24, 1);
  sp(g, s, ox, oy, 30, 18, horse, 5, 8);
  sp(g, s, ox, oy, 30, 18, hHi, 1, 8);
  sp(g, s, ox, oy, 34, 18, hDk, 5, 4);
  sp(g, s, ox, oy, 34, 17, hDk, 2, 1);
  sp(g, s, ox, oy, 4, 27, hDk, 3, 6);
  sp(g, s, ox, oy, 10, 33, hDk, 3, 6);
  sp(g, s, ox, oy, 26, 33, hDk, 3, 6);
  sp(g, s, ox, oy, 9, 38, '#1a1614', 5, 2);
  sp(g, s, ox, oy, 25, 38, '#1a1614', 5, 2);
  sp(g, s, ox, oy, 33, 22, '#3a2c20', 1, 4);   // 缰绳

  // 马鞍
  sp(g, s, ox, oy, 14, 24, '#4a3a28', 9, 3);
  sp(g, s, ox, oy, 14, 24, '#6a5236', 9, 1);

  // 披风（骑手背后）
  sp(g, s, ox, oy, 9, 14, cape, 5, 12);
  sp(g, s, ox, oy, 9, 14, shade(cape, 0.28), 1, 12);

  // 身体、腰带、甲片
  const main2 = L.tall ? 11 : 10;
  sp(g, s, ox, oy, 14, 13, main, 8, main2);
  sp(g, s, ox, oy, 14, 13, dark, 1, main2);
  sp(g, s, ox, oy, 15, 18, shade(main, -0.18), 6, 1);
  sp(g, s, ox, oy, 14, 22, '#4a3a28', 8, 1);

  // 头、胡须
  sp(g, s, ox, oy, 16, 8, skin, 5, 5);
  sp(g, s, ox, oy, 16, 12, skinDk, 5, 1);
  sp(g, s, ox, oy, 17, 9, '#2a2018', 1, 1);   // 眼
  if (L.beard) sp(g, s, ox, oy, 16, 12, shade(skin, -0.55), 4, 2);

  // 头饰
  const helm = L.helm || 'band';
  if (helm === 'plume') {
    sp(g, s, ox, oy, 15, 6, '#2f2f38', 7, 2);
    sp(g, s, ox, oy, 14, 1, '#c03830', 2, 5);
    sp(g, s, ox, oy, 22, 1, '#c03830', 2, 5);
  } else if (helm === 'horn') {
    sp(g, s, ox, oy, 15, 6, '#2f2f38', 7, 2);
    sp(g, s, ox, oy, 18, 4, '#c03830', 2, 2);
    sp(g, s, ox, oy, 19, 3, '#e05a42', 1, 1);
  } else if (helm === 'crown') {
    sp(g, s, ox, oy, 15, 5, '#2a2a30', 7, 3);
    sp(g, s, ox, oy, 15, 5, '#d9a441', 7, 1);
    sp(g, s, ox, oy, 17, 3, '#d9a441', 1, 2);
    sp(g, s, ox, oy, 20, 3, '#d9a441', 1, 2);
  } else {
    sp(g, s, ox, oy, 15, 6, dark, 7, 2);
    sp(g, s, ox, oy, 15, 7, shade(dark, 0.3), 7, 1);
  }

  // 兵器
  const weapon = L.weapon || 'dao';
  if (weapon === 'ji') {
    sp(g, s, ox, oy, 27, 6, '#8a6a44', 1, 20);
    sp(g, s, ox, oy, 26, 4, '#d8dde6', 3, 2);
    sp(g, s, ox, oy, 25, 6, '#d8dde6', 2, 1);
  } else if (weapon === 'qiang') {
    sp(g, s, ox, oy, 27, 5, '#7a6a52', 1, 21);
    sp(g, s, ox, oy, 27, 2, '#e2e8f0', 1, 3);
    sp(g, s, ox, oy, 26, 5, '#b03a30', 3, 1);
  } else if (weapon === 'gong') {
    sp(g, s, ox, oy, 27, 8, '#6a4a2c', 1, 12);
    sp(g, s, ox, oy, 28, 9, '#8a7a5c', 1, 10);
    sp(g, s, ox, oy, 26, 9, '#d8d2c0', 1, 10);
  } else if (weapon === 'jian') {
    sp(g, s, ox, oy, 27, 8, '#c8ccd6', 1, 12);
    sp(g, s, ox, oy, 26, 19, '#4a3a28', 2, 2);
  } else {
    sp(g, s, ox, oy, 27, 8, '#b8bcc4', 1, 13);
    sp(g, s, ox, oy, 26, 7, '#e2e6ee', 2, 2);
  }

  // 旗帜（骑手身后右侧）
  sp(g, s, ox, oy, 38, 1, '#5f4830', 1, 18);
  sp(g, s, ox, oy, 39, 2, main, 3, 6);
  sp(g, s, ox, oy, 39, 2, shade(main, 0.3), 3, 1);
  px(g, ox + 39 * s, oy + 8 * s, '#0d0b08', 3 * s, 1 * s);
}

/** 步卒：身体 + 头 + 兵器，举盾可选 */
function drawFoot(g, s, ox, oy, color, opt) {
  const o = opt || {};
  const main = color || '#7a6a52';
  const dark = shade(main, -0.35);
  const skin = '#d6c9a8';
  const skinDk = shade(skin, -0.3);
  const h = o.tall ? 16 : 14;
  const y0 = o.tall ? 4 : 6;

  // 腿
  sp(g, s, ox, oy, 3, y0 + h - 4, dark, 2, 4);
  sp(g, s, ox, oy, 7, y0 + h - 4, dark, 2, 4);
  // 身体
  sp(g, s, ox, oy, 2, y0, main, 7, h - 4);
  sp(g, s, ox, oy, 2, y0, dark, 1, h - 4);
  sp(g, s, ox, oy, 3, y0 + 3, shade(main, -0.16), 5, 1);
  // 头
  sp(g, s, ox, oy, 3, y0 - 5, skin, 4, 4);
  sp(g, s, ox, oy, 3, y0 - 6, o.band || dark, 4, 2);
  sp(g, s, ox, oy, 4, y0 - 4, '#2a2018', 1, 1);
  if (o.beard) sp(g, s, ox, oy, 3, y0 - 1, skinDk, 4, 1);

  // 兵器
  if (o.weapon === 'gong') {
    sp(g, s, ox, oy, 9, y0 - 2, '#6a4a2c', 1, 10);
    sp(g, s, ox, oy, 10, y0 - 1, '#8a7a5c', 1, 8);
  } else if (o.weapon === 'qiang') {
    sp(g, s, ox, oy, 9, y0 - 6, '#7a6a52', 1, 16);
    sp(g, s, ox, oy, 9, y0 - 8, '#dfe6ee', 1, 2);
  } else {
    sp(g, s, ox, oy, 9, y0 + 1, '#b8bcc4', 1, 6);
  }
  if (o.shield) {
    sp(g, s, ox, oy, 0, y0 + 1, '#4a3a28', 2, 6);
    sp(g, s, ox, oy, 0, y0 + 2, shade(main, 0.2), 2, 4);
  }
}

/**
 * 一支队伍（领主）：骑手居中，两名步卒在两侧，脚下有影子
 * 返回 42 × 40 的图
 */
function makePartySprite(runtime, color, look) {
  const c = newCanvas(runtime, 42, 40);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 42, 40);
  const main = color || '#e6e2d6';
  // 阴影
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.beginPath();
  g.ellipse(21, 38, 19, 3, 0, 0, Math.PI * 2);
  g.fill();
  // 两翼步卒
  const footCol = shade(main, -0.12);
  drawFoot(g, 1, 1, 22, footCol, { weapon: 'qiang', shield: true, band: shade(main, -0.4) });
  drawFoot(g, 1, 31, 22, footCol, { weapon: 'dao', band: shade(main, -0.4) });
  // 骑手（稍微抬高，显得在后面）
  drawKnight(g, 1, 0, 0, look || {}, main);
  return c;
}

/**
 * 一支匪团：按档位换人数与装备
 * qing 三个破衣步卒；lan 四个黄巾步卒带旗；cheng 两卒一骑；hong 两骑三卒
 */
function makeBanditPartySprite(runtime, tier) {
  const c = newCanvas(runtime, 46, 42);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 46, 42);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(22, 40, 21, 3, 0, 0, Math.PI * 2);
  g.fill();

  const t = tier || 'qing';
  if (t === 'qing') {
    drawFoot(g, 1, 8, 20, '#5a4a3a', { weapon: 'dao', band: '#3a3028' });
    drawFoot(g, 1, 18, 18, '#6a5642', { weapon: 'dao', band: '#3a3028', tall: true });
    drawFoot(g, 1, 30, 20, '#4e4032', { weapon: 'gong', band: '#3a3028' });
    // 一根木棍当旗
    sp(g, 1, 0, 24, 6, '#5f4830', 1, 12);
    px(g, 25, 7, '#8a3a30', 4, 3);
  } else if (t === 'lan') {
    const cloth = '#8a6a3a';
    const band = '#d8b24a';
    drawFoot(g, 1, 3, 19, cloth, { weapon: 'qiang', band: band, shield: true });
    drawFoot(g, 1, 13, 17, '#7a5a34', { weapon: 'dao', band: band, tall: true });
    drawFoot(g, 1, 24, 19, cloth, { weapon: 'gong', band: band });
    drawFoot(g, 1, 34, 20, '#6a4a2c', { weapon: 'dao', band: band });
    // 黄旗
    sp(g, 1, 0, 22, 6, '#5f4830', 1, 14);
    px(g, 23, 2, band, 7, 6);
    px(g, 23, 2, '#e8c96a', 7, 1);
  } else if (t === 'cheng') {
    drawFoot(g, 1, 2, 21, '#6a6a72', { weapon: 'qiang', band: '#8a8f99', shield: true });
    drawFoot(g, 1, 34, 21, '#5a5a62', { weapon: 'dao', band: '#8a8f99' });
    drawKnight(g, 1, 2, 0, { weapon: 'qiang', helm: 'horn', cape: '#8a4a30', horse: '#4a4440' }, '#7a7a84');
    px(g, 0, 0, 'rgba(0,0,0,0)', 1, 1);
    sp(g, 1, 0, 30, 2, '#5f4830', 1, 12);
    px(g, 31, 3, '#c07a3c', 5, 4);
  } else {
    drawFoot(g, 1, 2, 22, '#5a2a24', { weapon: 'qiang', band: '#2a2020', shield: true });
    drawFoot(g, 1, 11, 24, '#6a3430', { weapon: 'dao', band: '#2a2020' });
    drawFoot(g, 1, 38, 22, '#5a2a24', { weapon: 'dao', band: '#2a2020' });
    drawKnight(g, 1, 0, 0, { weapon: 'dao', helm: 'horn', cape: '#a8403a', horse: '#3a2a26' }, '#8a3430');
    drawKnight(g, 1, 4, 2, { weapon: 'qiang', helm: 'band', cape: '#7a2a26', horse: '#2a2320' }, '#9a3a34');
    sp(g, 1, 0, 32, 2, '#5f4830', 1, 12);
    px(g, 33, 3, '#a8403a', 6, 5);
    px(g, 33, 3, '#d05a4a', 6, 1);
  }
  return c;
}

/** 兵种小图：16 × 16，队伍页 / 招兵页用 */
function makeUnitSprite(runtime, troopId, color) {
  const c = newCanvas(runtime, 16, 16);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 16, 16);
  const main = color || '#8a7a5a';
  const kind = troopId || '';
  const naval = /boat|huochuan/.test(kind);
  const mounted = !naval && /cav|qishe|tengri|xianbei|jinjun/.test(kind);
  const archer = /archer|crossbow/.test(kind);
  if (mounted && !naval) {
    // 骑
    sp(g, 1, 0, 0, 2, 8, shade(main, -0.5), 10, 4);
    sp(g, 1, 0, 0, 10, 5, shade(main, -0.5), 3, 4);
    sp(g, 1, 0, 0, 2, 12, shade(main, -0.6), 2, 4);
    sp(g, 1, 0, 0, 9, 12, shade(main, -0.6), 2, 4);
    sp(g, 1, 0, 0, 5, 3, main, 4, 5);
    sp(g, 1, 0, 0, 6, 0, '#d6c9a8', 3, 3);
    sp(g, 1, 0, 0, 12, 2, '#cfd4dc', 1, 8);
  } else if (naval) {
    // 船
    sp(g, 1, 0, 0, 1, 10, '#5a3a22', 14, 4);
    sp(g, 1, 0, 0, 1, 10, '#7a5230', 14, 1);
    sp(g, 1, 0, 0, 7, 1, '#6a4a2c', 1, 9);
    px(g, 8, 2, main, 5, 6);
  } else {
    // 步
    sp(g, 1, 0, 0, 5, 6, main, 5, 7);
    sp(g, 1, 0, 0, 5, 6, shade(main, -0.35), 1, 7);
    sp(g, 1, 0, 0, 6, 2, '#d6c9a8', 3, 4);
    sp(g, 1, 0, 0, 6, 1, shade(main, -0.45), 3, 2);
    sp(g, 1, 0, 0, 4, 13, shade(main, -0.5), 2, 3);
    sp(g, 1, 0, 0, 8, 13, shade(main, -0.5), 2, 3);
    if (archer) {
      sp(g, 1, 0, 0, 11, 3, '#6a4a2c', 1, 8);
      sp(g, 1, 0, 0, 10, 4, '#8a7a5c', 1, 6);
    } else {
      sp(g, 1, 0, 0, 11, 2, '#c8ccd6', 1, 9);
      sp(g, 1, 0, 0, 2, 6, shade(main, 0.15), 2, 5);
    }
  }
  return c;
}

/** 对话立绘（骑砍式半身像）：头、盔、肩甲、胸甲、披风、兵器 */
function makeBustPortrait(runtime, color, look, s) {
  const k = s || 10;
  const GW = 26;
  const GH = 32;
  const c = newCanvas(runtime, GW * k, GH * k);
  const g = c.getContext('2d');
  g.clearRect(0, 0, GW * k, GH * k);
  const L = look || {};
  const main = color || '#e6e2d6';
  const dark = shade(main, -0.42);
  const mid = shade(main, -0.18);
  const steel = '#b8b0a0';
  const steelDk = '#7e7768';
  const skin = '#d6a173';
  const cape = L.cape || mid;

  // 披风两片
  sp(g, k, 0, 0, 3, 17, cape, 3, 14);
  sp(g, k, 0, 0, 20, 17, cape, 3, 14);
  sp(g, k, 0, 0, 2, 19, shade(cape, -0.35), 2, 11);

  // 肩甲
  sp(g, k, 0, 0, 4, 16, steel, 7, 3);
  sp(g, k, 0, 0, 15, 16, steel, 7, 3);
  sp(g, k, 0, 0, 4, 16, shade(steel, 0.28), 7, 1);
  sp(g, k, 0, 0, 15, 16, shade(steel, 0.28), 7, 1);
  sp(g, k, 0, 0, 4, 19, steelDk, 3, 2);
  sp(g, k, 0, 0, 19, 19, steelDk, 3, 2);

  // 胸甲
  sp(g, k, 0, 0, 7, 19, mid, 12, 11);
  sp(g, k, 0, 0, 7, 19, main, 12, 1);
  sp(g, k, 0, 0, 8, 21, shade(main, 0.16), 10, 1);
  sp(g, k, 0, 0, 7, 28, dark, 12, 2);
  sp(g, k, 0, 0, 9, 23, 'rgba(0,0,0,0.28)', 1, 1);
  sp(g, k, 0, 0, 16, 23, 'rgba(0,0,0,0.28)', 1, 1);
  sp(g, k, 0, 0, 12, 24, '#d9a441', 2, 4);

  // 脖子
  sp(g, k, 0, 0, 11, 14, shade(skin, -0.18), 4, 2);

  // 脸
  sp(g, k, 0, 0, 10, 8, skin, 6, 7);
  sp(g, k, 0, 0, 10, 8, shade(skin, 0.16), 6, 1);
  sp(g, k, 0, 0, 10, 11, shade(skin, -0.24), 1, 3);
  sp(g, k, 0, 0, 15, 11, shade(skin, -0.24), 1, 3);
  // 眼、眉
  sp(g, k, 0, 0, 11, 10, '#2a1c14', 1, 1);
  sp(g, k, 0, 0, 14, 10, '#2a1c14', 1, 1);
  sp(g, k, 0, 0, 11, 9, '#3a2a20', 1, 1);
  sp(g, k, 0, 0, 14, 9, '#3a2a20', 1, 1);
  // 胡须
  if (L.beard) {
    sp(g, k, 0, 0, 11, 12, '#3a2a20', 4, 2);
    sp(g, k, 0, 0, 12, 14, '#2e2118', 2, 1);
  } else {
    sp(g, k, 0, 0, 12, 13, '#8a5a3a', 2, 1);
  }

  // 盔 / 冠 / 巾
  const helm = L.helm || 'band';
  if (helm === 'plume') {
    sp(g, k, 0, 0, 9, 3, steel, 8, 4);
    sp(g, k, 0, 0, 9, 6, steelDk, 8, 1);
    sp(g, k, 0, 0, 11, 0, '#b8382a', 4, 3);
    sp(g, k, 0, 0, 12, -1, '#e05a3a', 2, 1);
  } else if (helm === 'horn') {
    sp(g, k, 0, 0, 9, 3, steel, 8, 4);
    sp(g, k, 0, 0, 9, 6, steelDk, 8, 1);
    sp(g, k, 0, 0, 6, 2, '#e8dcc0', 2, 3);
    sp(g, k, 0, 0, 18, 2, '#e8dcc0', 2, 3);
  } else if (helm === 'crown') {
    sp(g, k, 0, 0, 9, 3, '#c9973a', 8, 4);
    sp(g, k, 0, 0, 9, 2, '#f0c060', 2, 2);
    sp(g, k, 0, 0, 12, 1, '#f0c060', 2, 3);
    sp(g, k, 0, 0, 15, 2, '#f0c060', 2, 2);
  } else {
    sp(g, k, 0, 0, 9, 3, mid, 8, 4);
    sp(g, k, 0, 0, 9, 6, dark, 8, 1);
  }
  // 护颈
  sp(g, k, 0, 0, 8, 7, shade(main, -0.55), 10, 1);

  // 兵器：右侧一根
  const wp = L.weapon || 'qiang';
  if (wp === 'gong') {
    sp(g, k, 0, 0, 22, 8, '#6a4a2a', 1, 15);
    sp(g, k, 0, 0, 23, 10, '#6a4a2a', 1, 11);
  } else if (wp === 'dao') {
    sp(g, k, 0, 0, 22, 4, '#8a7a5a', 2, 18);
    sp(g, k, 0, 0, 22, 2, steel, 2, 3);
  } else {
    sp(g, k, 0, 0, 22, 2, '#8a7448', 1, 27);
    if (wp === 'ji') sp(g, k, 0, 0, 20, 3, steel, 3, 2);
    else if (wp === 'qiang') sp(g, k, 0, 0, 21, 1, steel, 2, 3);
    else sp(g, k, 0, 0, 22, 3, steel, 1, 4);
  }

  // 底座影
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.beginPath();
  g.ellipse(13 * k, 31.2 * k, 10 * k, 1.5 * k, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** 对话立绘：只画这一位骑手，按 s 倍放大成一幅画（骑砍式单人像） */
function makeLordPortrait(runtime, color, look, s) {
  const k = s || 6;
  const c = newCanvas(runtime, 42 * k, 40 * k);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 42 * k, 40 * k);
  const main = color || '#e6e2d6';
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.ellipse(21 * k, 39 * k, 17 * k, 3 * k, 0, 0, Math.PI * 2);
  g.fill();
  drawKnight(g, k, 0, 0, look || {}, main);
  return c;
}

function buildAssets(runtime) {
  if (CACHE) return CACHE;
  const terrainCache = {};
  const site = {
    town: makeSiteSprite(runtime, 'town', 11),
    castle: makeSiteSprite(runtime, 'castle', 22),
    village: makeSiteSprite(runtime, 'village', 33),
    camp: makeSiteSprite(runtime, 'camp', 44),
  };
  CACHE = {
    runtime,
    terrainCache,
    site,
    player: makePlayerSprite(runtime),
    lord: makeLordSprite(runtime, '#e6e2d6', 'normal'),
    bandit: makeBanditSprite(runtime, '#7d2f28'),
    flag: { player: makeFlagSprite(runtime, '#d9a441') },
    /** 按势力色 + 造型生成领主棋子（带缓存） */
    lordIconFor: function (color, look) {
      const lookKey = typeof look === 'string' ? look : JSON.stringify(look || {});
      const key = (color || 'x') + '|' + lookKey;
      if (!this.lordCache) this.lordCache = {};
      if (!this.lordCache[key]) this.lordCache[key] = makeLordSprite(runtime, color, look);
      return this.lordCache[key];
    },
    /** 领主队伍模型（骑马 + 两卒 + 旗） */
    partyIconFor: function (color, look) {
      const lookKey = typeof look === 'string' ? look : JSON.stringify(look || {});
      const key = (color || 'x') + '|' + lookKey;
      if (!this.partyCache) this.partyCache = {};
      if (!this.partyCache[key]) this.partyCache[key] = makePartySprite(runtime, color, look);
      return this.partyCache[key];
    },
    /** 匪团队伍模型（按档位） */
    banditPartyFor: function (tier, color) {
      if (!this.banditPartyCache) this.banditPartyCache = {};
      const key = (tier || 'qing') + '|' + (color || '');
      if (!this.banditPartyCache[key]) this.banditPartyCache[key] = makeBanditPartySprite(runtime, tier);
      return this.banditPartyCache[key];
    },
    /** 对话立绘 */
    portraitFor: function (color, look) {
      const lookKey = typeof look === 'string' ? look : JSON.stringify(look || {});
      const key = (color || 'x') + '|' + lookKey;
      if (!this.portraitCache) this.portraitCache = {};
      if (!this.portraitCache[key]) this.portraitCache[key] = makeBustPortrait(runtime, color, look, 10);
      return this.portraitCache[key];
    },
    /** 兵种小图 */
    unitIconFor: function (troopId, color) {
      if (!this.unitCache) this.unitCache = {};
      const key = (troopId || 'x') + '|' + (color || '');
      if (!this.unitCache[key]) this.unitCache[key] = makeUnitSprite(runtime, troopId, color);
      return this.unitCache[key];
    },
    /** 按等级色生成匪团棋子 */
    banditIconFor: function (color) {
      if (!this.banditCache) this.banditCache = {};
      const key = color || '#7d2f28';
      if (!this.banditCache[key]) this.banditCache[key] = makeBanditSprite(runtime, key);
      return this.banditCache[key];
    },
    /** 按区域 + 地形取贴图（懒生成并缓存） */
    terrainFor: function (region, terrain) {
      const key = region + '_' + terrain;
      if (!terrainCache[key]) {
        const seed = 20260101 + region.length * 97 + terrain.length * 31;
        terrainCache[key] = makeTerrainSprite(runtime, terrain, paletteFor(region, terrain), seed);
      }
      return terrainCache[key];
    },
  };
  return CACHE;
}

/** 平铺绘制视野内地形（按区域取贴图） */
function drawTerrain(ctx, assets, world, camX, camY, tileSize, viewW, viewH) {
  const startX = Math.max(0, Math.floor(camX / tileSize));
  const startY = Math.max(0, Math.floor(camY / tileSize));
  const endX = Math.min(world.w - 1, Math.ceil((camX + viewW) / tileSize));
  const endY = Math.min(world.h - 1, Math.ceil((camY + viewH) / tileSize));

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const t = world.tiles[y * world.w + x] || 'plain';
      const region = (world.regions && world.regions[y * world.w + x]) || 'zhongyuan';
      const sprite = assets.terrainFor(region, t);
      ctx.drawImage(sprite, x * tileSize - camX, y * tileSize - camY, tileSize, tileSize);
    }
  }
}

/** 画玩家（大号骑马立绘 + 光晕 + 脚下阴影） */
function drawPlayer(ctx, assets, sx, sy, tileSize, phase, facing) {
  const w = tileSize * 1.36;
  const h = tileSize * 1.62;
  const bob = Math.sin(phase) * 1.8;

  // 光晕
  ctx.save();
  ctx.globalAlpha = 0.28 + Math.sin(phase * 0.7) * 0.06;
  ctx.fillStyle = '#f0c060';
  ctx.beginPath();
  ctx.arc(sx, sy + tileSize * 0.1, tileSize * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 阴影
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(sx, sy + tileSize * 0.44, tileSize * 0.42, tileSize * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  if (facing === -1) {
    ctx.translate(sx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(assets.player, -w / 2, sy - h * 0.72 + bob, w, h);
  } else {
    ctx.drawImage(assets.player, sx - w / 2, sy - h * 0.72 + bob, w, h);
  }
  ctx.restore();
}

module.exports = {
  UI_COLORS,
  FIXED,
  buildAssets,
  drawTerrain,
  drawPlayer,
  paletteFor,
};

  };

  /* js/render/ui.js */
  __defs[6] = function (module, exports, __require) {
/**
 * UI 层：硬边像素风面板、按钮、进度条、文字排版
 * 所有热区在 render 时注册，touch 时按最近一帧的热区判定。
 */

const { UI_COLORS } = __require(3);

const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Heiti SC",sans-serif';

function font(size, weight) {
  return (weight || 'bold') + ' ' + size + 'px ' + FONT_STACK;
}

function text(ctx, str, x, y, opts) {
  const o = opts || {};
  ctx.save();
  ctx.font = font(o.size || 24, o.weight || 'bold');
  ctx.fillStyle = o.color || UI_COLORS.text;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'top';
  if (o.shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(str, x + 2, y + 2);
    ctx.fillStyle = o.color || UI_COLORS.text;
  }
  ctx.fillText(str, x, y);
  ctx.restore();
}

function measure(ctx, str, size, weight) {
  ctx.save();
  ctx.font = font(size || 24, weight || 'bold');
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

/** 中英混排按宽度断行 */
function wrap(ctx, str, maxWidth, size, weight) {
  const lines = [];
  let line = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const test = line + ch;
    if (measure(ctx, test, size, weight) > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function panel(ctx, x, y, w, h, opts) {
  const o = opts || {};
  ctx.save();
  if (o.shadow !== false) {
    ctx.fillStyle = UI_COLORS.shadow;
    ctx.fillRect(x + 4, y + 6, w, h);
  }
  ctx.fillStyle = o.fill || UI_COLORS.panel;
  ctx.fillRect(x, y, w, h);
  // 外框
  ctx.fillStyle = o.border || UI_COLORS.border;
  ctx.fillRect(x, y, w, 3);
  ctx.fillRect(x, y + h - 3, w, 3);
  ctx.fillRect(x, y, 3, h);
  ctx.fillRect(x + w - 3, y, 3, h);
  // 内框
  ctx.fillStyle = UI_COLORS.borderDark;
  ctx.fillRect(x + 3, y + 3, w - 6, 2);
  ctx.fillRect(x + 3, y + h - 5, w - 6, 2);
  ctx.fillRect(x + 3, y + 3, 2, h - 6);
  ctx.fillRect(x + w - 5, y + 3, 2, h - 6);
  // 四角装饰
  ctx.fillStyle = UI_COLORS.accent;
  const s = 6;
  ctx.fillRect(x + 6, y + 6, s, 2);
  ctx.fillRect(x + 6, y + 6, 2, s);
  ctx.fillRect(x + w - 12, y + 6, s, 2);
  ctx.fillRect(x + w - 8, y + 6, 2, s);
  ctx.fillRect(x + 6, y + h - 8, s, 2);
  ctx.fillRect(x + 6, y + h - 12, 2, s);
  ctx.fillRect(x + w - 12, y + h - 8, s, 2);
  ctx.fillRect(x + w - 8, y + h - 12, 2, s);
  ctx.restore();
}

function bar(ctx, x, y, w, h, ratio, color, opts) {
  const o = opts || {};
  const r = Math.max(0, Math.min(1, ratio));
  ctx.save();
  ctx.fillStyle = o.bg || '#171310';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color || UI_COLORS.accent;
  ctx.fillRect(x, y, Math.round(w * r), h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, Math.round(w * r), Math.max(1, Math.floor(h / 4)));
  ctx.fillStyle = UI_COLORS.borderDark;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.restore();
}

class UI {
  constructor() {
    this.items = [];
    this.pressed = null;
    this.released = null;
  }

  begin() {
    this.items.length = 0;
  }

  register(item) {
    this.items.push(item);
    return item;
  }

  /** 标准按钮，返回注册项 */
  button(ctx, x, y, w, h, label, opts) {
    const o = opts || {};
    const disabled = !!o.disabled;
    const active = this.pressed && this.pressed.id === o.id;
    const dy = active ? 2 : 0;
    const fill = disabled ? '#1e1a15' : o.fill || '#3a2c1e';
    const border = disabled ? '#4a3f32' : o.border || UI_COLORS.border;
    const labelColor = disabled ? '#6a6355' : o.color || UI_COLORS.text;

    ctx.save();
    if (!disabled) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 3, y + 5, w, h);
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x, y + dy, w, h);
    ctx.fillStyle = border;
    ctx.fillRect(x, y + dy, w, 2);
    ctx.fillRect(x, y + dy + h - 2, w, 2);
    ctx.fillRect(x, y + dy, 2, h);
    ctx.fillRect(x + w - 2, y + dy, 2, h);
    if (!disabled) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 2, y + dy + 2, w - 4, Math.floor(h / 3));
    }
    ctx.restore();

    text(ctx, label, x + w / 2, y + dy + h / 2, {
      size: o.size || 26,
      align: 'center',
      baseline: 'middle',
      color: labelColor,
    });

    const item = this.register({
      id: o.id || label,
      x,
      y,
      w,
      h,
      disabled,
      onTap: o.onTap || null,
      label,
    });
    return item;
  }

  rect(id, x, y, w, h, onTap, data) {
    return this.register({ id: id || 'rect' + this.items.length, x, y, w, h, onTap, data, disabled: false });
  }

  press(x, y) {
    this.pressed = null;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.disabled) continue;
      if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) {
        this.pressed = it;
        return it;
      }
    }
    return null;
  }

  release(x, y) {
    const p = this.pressed;
    this.pressed = null;
    if (!p) return null;
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
      this.released = p;
      if (p.onTap) p.onTap(p);
      return p;
    }
    return null;
  }

  isPressed(x, y) {
    return !!(this.pressed && x >= this.pressed.x && x <= this.pressed.x + this.pressed.w &&
      y >= this.pressed.y && y <= this.pressed.y + this.pressed.h);
  }
}

module.exports = { UI, text, wrap, measure, panel, bar, font, FONT_STACK };

  };

  /* js/core/world.js */
  __defs[8] = function (module, exports, __require) {
/**
 * 世界层：三国大地图生成、区域风景、通行判定、寻路、时间换算
 */

const { RNG } = __require(4);
const {
  BASE_W,
  BASE_H,
  MAP_W,
  MAP_H,
  TERRAIN,
  REGIONS,
  COAST,
  RIVER_HUANG,
  RIVER_YANG,
  RIVER_HUAI,
  MOUNTAINS,
  SITE_ROWS,
  RECRUIT_SETS,
  ROADS,
  FACTIONS,
} = __require(5);

/**
 * 设计稿 40x48 → 实图 64x77。所有静态坐标统一乘这个系数，
 * 地图更大，城与城之间自然拉开，格子的像素尺寸不变。
 */
const SCALE = MAP_W / BASE_W;

/** 设计稿坐标 → 实际格子坐标 */
function S(v) {
  const r = Math.round(v * SCALE);
  return r < 0 ? 0 : r;
}

function SV(v, max) {
  const r = S(v);
  return r > max ? max : r;
}

function idx(x, y) {
  return y * MAP_W + x;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

function terrainAt(world, x, y) {
  if (!inBounds(x, y)) return null;
  return TERRAIN[world.tiles[idx(x, y)]] || TERRAIN.plain;
}

function isPassable(world, x, y) {
  const t = terrainAt(world, x, y);
  return !!(t && t.passable);
}

function regionAt(world, x, y) {
  if (!inBounds(x, y)) return 'zhongyuan';
  return world.regions[idx(x, y)] || 'zhongyuan';
}

function regionDef(id) {
  return REGIONS[id] || REGIONS.zhongyuan;
}

function siteAt(world, x, y) {
  for (let i = 0; i < world.sites.length; i++) {
    const s = world.sites[i];
    if (s.x === x && s.y === y) return s;
  }
  return null;
}

function siteById(world, id) {
  for (let i = 0; i < world.sites.length; i++) {
    if (world.sites[i].id === id) return world.sites[i];
  }
  return null;
}

function setTile(world, x, y, id) {
  if (inBounds(x, y)) world.tiles[idx(x, y)] = id;
}

function bresenham(x0, y0, x1, y1, cb) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (true) {
    cb(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/** 海岸线插值（入参是实图行号，内部换算回设计稿） */
function coastX(y) {
  const sy = y / SCALE;
  for (let i = 0; i < COAST.length - 1; i++) {
    const a = COAST[i];
    const b = COAST[i + 1];
    if (sy >= a[0] && sy <= b[0]) {
      const t = (sy - a[0]) / (b[0] - a[0] || 1);
      return SV(a[1] + (b[1] - a[1]) * t, MAP_W - 1);
    }
  }
  return SV(COAST[COAST.length - 1][1], MAP_W - 1);
}

function createWorld(seed) {
  const rng = new RNG(seed);
  const world = {
    w: MAP_W,
    h: MAP_H,
    tiles: [],
    regions: [],
    sites: [],
    seed,
  };

  for (let i = 0; i < MAP_W * MAP_H; i++) {
    world.tiles.push('plain');
    world.regions.push('zhongyuan');
  }

  // 1. 区域底图
  const regionOrder = [
    'ssb', 'liangzhou', 'bingzhou', 'youyan', 'jizhou', 'guanzhong',
    'zhongyuan', 'xuzhou', 'yizhou', 'jingzhou', 'jiangdong', 'jiaozhou',
  ];
  // 设计稿里的区域矩形，统一换算到放大后的坐标
  const rawBoxes = {
    ssb: [0, 0, 21, 8],
    liangzhou: [0, 9, 12, 26],
    bingzhou: [13, 6, 24, 16],
    youyan: [22, 0, 39, 9],
    jizhou: [25, 8, 36, 18],
    guanzhong: [13, 15, 21, 27],
    zhongyuan: [22, 17, 31, 30],
    xuzhou: [29, 19, 37, 27],
    yizhou: [8, 27, 18, 41],
    jingzhou: [19, 28, 30, 41],
    jiangdong: [30, 29, 38, 42],
    jiaozhou: [18, 42, 30, 47],
  };
  const boxes = {};
  Object.keys(rawBoxes).forEach(function (k) {
    const b = rawBoxes[k];
    boxes[k] = [S(b[0]), S(b[1]), S(b[2]), S(b[3])];
  });
  regionOrder.forEach(function (rid) {
    const b = boxes[rid];
    if (!b) return;
    const def = REGIONS[rid];
    for (let y = b[1]; y <= b[3]; y++) {
      for (let x = b[0]; x <= b[2]; x++) {
        if (!inBounds(x, y)) continue;
        world.regions[idx(x, y)] = rid;
        if (rng.chance(def.density)) world.tiles[idx(x, y)] = def.accent;
        else world.tiles[idx(x, y)] = def.base;
      }
    }
  });

  // 2. 海
  for (let y = 0; y < MAP_H; y++) {
    const cx = coastX(y);
    for (let x = Math.floor(cx); x < MAP_W; x++) {
      if (x < 0) continue;
      world.tiles[idx(x, y)] = 'sea';
    }
  }

  // 3. 山脉（折线加粗；放大后按比例补宽，保持视觉厚度）
  MOUNTAINS.forEach(function (line) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = [S(line[i][0]), SV(line[i][1], MAP_H - 1)];
      const b = [S(line[i + 1][0]), SV(line[i + 1][1], MAP_H - 1)];
      bresenham(a[0], a[1], b[0], b[1], function (x, y) {
        if (!inBounds(x, y)) return;
        if (world.tiles[idx(x, y)] === 'sea') return;
        world.tiles[idx(x, y)] = 'mountain';
        if (rng.chance(0.62)) setTile(world, x + 1, y, 'mountain');
        if (rng.chance(0.5)) setTile(world, x, y + 1, 'mountain');
        if (rng.chance(0.2)) setTile(world, x + 1, y + 1, 'mountain');
      });
    }
  });

  // 4. 河流
  function drawRiver(points, wide) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = [S(points[i][0]), SV(points[i][1], MAP_H - 1)];
      const b = [S(points[i + 1][0]), SV(points[i + 1][1], MAP_H - 1)];
      bresenham(a[0], a[1], b[0], b[1], function (x, y) {
        if (!inBounds(x, y)) return;
        if (world.tiles[idx(x, y)] === 'sea') return;
        world.tiles[idx(x, y)] = 'river';
        if (wide && rng.chance(0.5)) setTile(world, x, y + 1, 'river');
      });
    }
  }
  drawRiver(RIVER_HUANG, true);
  drawRiver(RIVER_YANG, true);
  drawRiver(RIVER_HUAI, false);

  // 5. 森林 / 丘陵 / 沼泽斑块
  function blob(cx, cy, radius, terrainId, density) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!inBounds(x, y)) continue;
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (d > radius) continue;
        if (!rng.chance(density)) continue;
        if (world.tiles[idx(x, y)] === 'sea' || world.tiles[idx(x, y)] === 'river') continue;
        if (world.tiles[idx(x, y)] === 'mountain') continue;
        world.tiles[idx(x, y)] = terrainId;
      }
    }
  }
  for (let i = 0; i < 12; i++) blob(rng.int(1, MAP_W - 2), rng.int(2, MAP_H - 2), rng.int(1, 3), 'forest', 0.6);
  for (let i = 0; i < 9; i++) blob(rng.int(1, MAP_W - 2), rng.int(2, MAP_H - 2), rng.int(1, 2), 'hills', 0.55);
  for (let i = 0; i < 8; i++) blob(rng.int(20, MAP_W - 4), rng.int(26, MAP_H - 3), rng.int(1, 2), 'marsh', 0.5);
  for (let i = 0; i < 5; i++) blob(rng.int(1, 12), rng.int(10, 26), rng.int(1, 2), 'desert', 0.55);

  // 6. 据点
  SITE_ROWS.forEach(function (row) {
    const def = {
      id: row[0], name: row[1], type: row[2], faction: row[3],
      x: S(row[4]), y: SV(row[5], MAP_H - 1),
      priceBase: row[6], garrison: row[7], troopSet: row[8], blurb: row[9],
    };
    const site = {
      id: def.id,
      name: def.name,
      type: def.type,
      region: regionAt(world, def.x, def.y),
      faction: def.faction,
      ownerFaction: def.faction,
      x: def.x,
      y: def.y,
      market: def.type !== 'camp',
      priceBase: def.priceBase,
      garrisonBase: def.garrison,
      garrison: def.garrison,
      recruitList: (RECRUIT_SETS[def.troopSet] || RECRUIT_SETS.none).slice(),
      recruitCap: def.type === 'town' ? 18 : def.type === 'castle' ? 12 : def.type === 'village' ? 5 : 0,
      recruits: {},
      priceIndex: 1,
      blurb: def.blurb,
      visited: false,
      playerOwned: false,
      cleared: false,
      banner: FACTIONS[def.faction] ? FACTIONS[def.faction].banner : '',
      color: FACTIONS[def.faction] ? FACTIONS[def.faction].color : '#8f8f86',
    };
    // 清出场地（只清山与海，保留河流作为渡口）
    const clearR = def.type === 'town' || def.type === 'castle' ? 2 : 1;
    const base = REGIONS[site.region] ? REGIONS[site.region].base : 'plain';
    for (let y = site.y - clearR; y <= site.y + clearR; y++) {
      for (let x = site.x - clearR; x <= site.x + clearR; x++) {
        if (!inBounds(x, y)) continue;
        const t = world.tiles[idx(x, y)];
        if (t === 'mountain' || t === 'sea') {
          world.tiles[idx(x, y)] = base;
        }
      }
    }
    world.sites.push(site);
  });

  // 7. 道路
  ROADS.forEach(function (pair) {
    const a = siteById(world, pair[0]);
    const b = siteById(world, pair[1]);
    if (!a || !b) return;
    bresenham(a.x, a.y, b.x, b.y, function (x, y) {
      if (!inBounds(x, y)) return;
      if (siteAt(world, x, y)) return;
      const t = world.tiles[idx(x, y)];
      if (t === 'sea' || t === 'river') return;
      if (t === 'mountain') {
        world.tiles[idx(x, y)] = 'hills';
        return;
      }
      world.tiles[idx(x, y)] = 'road';
    });
  });

  // 8. 连通性兜底：从陈留铺路
  const start = siteById(world, 'chenliu') || world.sites[0];
  const reach = reachableTiles(world, start.x, start.y);
  world.sites.forEach(function (s) {
    if (reach[idx(s.x, s.y)]) return;
    bresenham(start.x, start.y, s.x, s.y, function (x, y) {
      if (!inBounds(x, y)) return;
      if (siteAt(world, x, y)) return;
      if (world.tiles[idx(x, y)] === 'sea' || world.tiles[idx(x, y)] === 'river') {
        world.tiles[idx(x, y)] = 'road';
      }
    });
  });

  return world;
}

/** 4 向可达集合 */
function reachableTiles(world, sx, sy) {
  const N = MAP_W * MAP_H;
  const seen = new Array(N).fill(false);
  const queue = [idx(sx, sy)];
  seen[queue[0]] = true;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % MAP_W;
    const cy = Math.floor(cur / MAP_W);
    for (let i = 0; i < 4; i++) {
      const nx = cx + dirs[i][0];
      const ny = cy + dirs[i][1];
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (seen[n]) continue;
      if (!isPassable(world, nx, ny)) continue;
      seen[n] = true;
      queue.push(n);
    }
  }
  return seen;
}

/** 二叉最小堆：A* 的 open 表。地图放大到 64x77 后线性扫太慢 */
function MinHeap() {
  this.items = [];
  this.keys = [];
}
MinHeap.prototype.push = function (item, key) {
  const items = this.items;
  const keys = this.keys;
  let i = items.length;
  items.push(item);
  keys.push(key);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (keys[p] <= key) break;
    items[i] = items[p];
    keys[i] = keys[p];
    i = p;
  }
  items[i] = item;
  keys[i] = key;
};
MinHeap.prototype.pop = function () {
  const items = this.items;
  const keys = this.keys;
  const top = items[0];
  const lastItem = items.pop();
  const lastKey = keys.pop();
  if (items.length === 0) return top;
  let i = 0;
  const n = items.length;
  while (true) {
    const l = i * 2 + 1;
    if (l >= n) break;
    const r = l + 1;
    const c = r < n && keys[r] < keys[l] ? r : l;
    if (keys[c] >= lastKey) break;
    items[i] = items[c];
    keys[i] = keys[c];
    i = c;
  }
  items[i] = lastItem;
  keys[i] = lastKey;
  return top;
};

/**
 * A* 8 向寻路，返回不含起点的路径；不可达返回 null
 */
function findPath(world, from, to) {
  if (!inBounds(from.x, from.y) || !inBounds(to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  if (!isPassable(world, to.x, to.y)) return null;

  const N = MAP_W * MAP_H;
  const startI = idx(from.x, from.y);
  const goalI = idx(to.x, to.y);
  const dist = new Float32Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  dist[startI] = 0;
  heap.push(startI, 0);

  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
  ];

  while (heap.items.length) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goalI) break;

    const cx = cur % MAP_W;
    const cy = Math.floor(cur / MAP_W);

    for (let d = 0; d < 8; d++) {
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (!inBounds(nx, ny)) continue;
      if (!isPassable(world, nx, ny)) continue;
      if (dirs[d][0] !== 0 && dirs[d][1] !== 0) {
        if (!isPassable(world, cx + dirs[d][0], cy)) continue;
        if (!isPassable(world, cx, cy + dirs[d][1])) continue;
      }
      const ni = idx(nx, ny);
      if (closed[ni]) continue;
      const stepCost = terrainAt(world, nx, ny).cost * dirs[d][2];
      const nd = dist[cur] + stepCost;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        prev[ni] = cur;
        heap.push(ni, nd + Math.abs(nx - to.x) + Math.abs(ny - to.y));
      }
    }
  }

  if (!isFinite(dist[goalI])) return null;

  const path = [];
  let cur = goalI;
  while (cur !== startI && cur !== -1) {
    path.push({ x: cur % MAP_W, y: Math.floor(cur / MAP_W) });
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

function tileHours(world, x, y) {
  const t = terrainAt(world, x, y);
  return t ? t.hours : 2;
}

function addHours(clock, hours) {
  clock.hour += hours;
  const days = Math.floor(clock.hour / 24);
  clock.hour -= days * 24;
  clock.day += days;
  return days;
}

function formatClock(clock) {
  const h = Math.floor(clock.hour);
  const m = Math.floor((clock.hour - h) * 60);
  const pad = function (n) {
    return n < 10 ? '0' + n : '' + n;
  };
  return '第 ' + clock.day + ' 天 ' + pad(h) + ':' + pad(m);
}

function gridDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

module.exports = {
  idx,
  inBounds,
  terrainAt,
  isPassable,
  regionAt,
  regionDef,
  siteAt,
  siteById,
  createWorld,
  findPath,
  tileHours,
  addHours,
  formatClock,
  gridDistance,
  reachableTiles,
};

  };

  /* js/data/troops.js */
  __defs[10] = function (module, exports, __require) {
/**
 * 兵种表（三国）
 * atk/def/hp 用于战斗模拟；food 为每人每日口粮；tier 决定伤亡顺序（低阶先倒）。
 * 特殊标记：
 *   cav 骑兵 / ranged 远程 / spear 长矛（克骑）
 *   pierce 破甲（弩） / fire 火攻 / lock 士气锁死（不溃） / hill 山地不减速
 */

const TROOPS = {
  militia: {
    id: 'militia', name: '民兵', tier: 1, atk: 6, def: 6, hp: 24, food: 1, recruit: 12,
    desc: '临时征来的农人，给根木棍就上阵。便宜，也容易死。',
  },
  spear: {
    id: 'spear', name: '枪盾兵', tier: 2, atk: 9, def: 11, hp: 26, food: 1, recruit: 30, spear: true,
    desc: '结阵顶住骑兵的中坚。长矛如林，马不敢冲。',
  },
  archer: {
    id: 'archer', name: '弓手', tier: 2, atk: 12, def: 5, hp: 20, food: 1, recruit: 34, ranged: true,
    desc: '开战先射三轮。近战很脆，别让人贴脸。',
  },
  crossbow: {
    id: 'crossbow', name: '弩手', tier: 3, atk: 14, def: 4, hp: 20, food: 1, recruit: 46, ranged: true, pierce: true,
    desc: '上弦慢，但能破甲。对付重骑与亲卫特别好用。',
  },
  cav: {
    id: 'cav', name: '轻骑', tier: 3, atk: 15, def: 8, hp: 30, food: 3, recruit: 64, cav: true,
    desc: '冲锋与包抄的核心。人吃马嚼，口粮三倍。',
  },
  qishe: {
    id: 'qishe', name: '骑射', tier: 3, atk: 13, def: 7, hp: 28, food: 3, recruit: 70, cav: true, ranged: true,
    desc: '边地打法：不贴身，绕着射。打不死你，也追不上他。',
  },
  heavy: {
    id: 'heavy', name: '重骑', tier: 4, atk: 18, def: 13, hp: 36, food: 3, recruit: 118, cav: true,
    desc: '人马皆披甲。正面撞阵，步兵阵线会裂。',
  },
  guard: {
    id: 'guard', name: '亲卫', tier: 4, atk: 17, def: 15, hp: 38, food: 1, recruit: 128, renownReq: 100,
    desc: '主公身边的死士。需声望 100 才招得到。',
  },
  baier: {
    id: 'baier', name: '白毦兵', tier: 4, atk: 16, def: 14, hp: 40, food: 1, recruit: 136, renownReq: 150, lock: true,
    desc: '白毦为饰，士气锁死，不溃不散。刘备手下最后一张牌。',
  },
  wudang: {
    id: 'wudang', name: '无当飞军', tier: 4, atk: 15, def: 12, hp: 34, food: 1, recruit: 132, renownReq: 150, hill: true, ranged: true,
    desc: '南中劲卒，山地如平地。翻山越岭不减速。',
  },
  danyang: {
    id: 'danyang', name: '丹阳兵', tier: 4, atk: 16, def: 13, hp: 36, food: 1, recruit: 142, renownReq: 160,
    desc: '天下精兵出丹阳。江东的底子，靠他们撑。',
  },
  boat: {
    id: 'boat', name: '轻舟兵', tier: 2, atk: 10, def: 8, hp: 24, food: 2, recruit: 54,
    desc: '水上的兵。上岸打不如在水上打。',
  },
  huochuan: {
    id: 'huochuan', name: '火船手', tier: 3, atk: 13, def: 8, hp: 26, food: 2, recruit: 86, fire: true, renownReq: 120,
    desc: '驾火船冲阵，点火不伤己。赤壁那一夜就是他们。',
  },
  xianbei: {
    id: 'xianbei', name: '鲜卑游骑', tier: 3, atk: 16, def: 7, hp: 28, food: 3, recruit: 76, cav: true, ranged: true,
    desc: '塞外的骑射手。来去如风，抢完就走。',
  },
  tengri: {
    id: 'tengri', name: '腾格里卫', tier: 4, atk: 19, def: 12, hp: 34, food: 3, recruit: 168, cav: true, renownReq: 200,
    desc: '鲜卑单于的亲骑。马力最盛，冲阵最狠。',
  },
  tiefu: {
    id: 'tiefu', name: '西凉重步', tier: 4, atk: 20, def: 14, hp: 36, food: 3, recruit: 176, cav: false, renownReq: 180,
    desc: '凉州重甲步卒，持长刀大盾。走得慢，正面极硬。',
  },
  jinjun: {
    id: 'jinjun', name: '禁军', tier: 5, atk: 22, def: 18, hp: 44, food: 2, recruit: 240, renownReq: 300,
    desc: '汉家禁军，最后一支还听诏书的兵。',
  },
  huangjin: {
    id: 'huangjin', name: '黄巾', tier: 1, atk: 7, def: 5, hp: 22, food: 1, recruit: 0,
    desc: '头裹黄巾的流民军。人多，甲少。',
  },
  bandit: {
    id: 'bandit', name: '山贼', tier: 1, atk: 8, def: 6, hp: 24, food: 1, recruit: 0,
    desc: '山里的散兵。人少打不过，人多很麻烦。',
  },
  raider: {
    id: 'raider', name: '贼首', tier: 3, atk: 13, def: 10, hp: 32, food: 1, recruit: 0,
    desc: '寨里的头目，身上有抢来的好甲。',
  },
  raider_cav: {
    id: 'raider_cav', name: '马贼', tier: 3, atk: 14, def: 8, hp: 28, food: 1, recruit: 0, cav: true,
    desc: '骑马的匪。跑得比追兵快。',
  },
};

const TROOP_IDS = Object.keys(TROOPS);

/** 可招募的兵（不含匪类） */
const RECRUITABLE = [
  'militia', 'spear', 'archer', 'crossbow', 'cav', 'qishe', 'heavy',
  'guard', 'baier', 'wudang', 'danyang', 'boat', 'huochuan', 'xianbei',
  'tengri', 'tiefu', 'jinjun',
];

function troopOf(id) {
  return TROOPS[id] || null;
}

module.exports = { TROOPS, TROOP_IDS, RECRUITABLE, troopOf };


  };

  /* js/core/army.js */
  __defs[9] = function (module, exports, __require) {
/**
 * 队伍层：兵力统计、口粮、战力估算、伤亡分配
 */

const { TROOPS } = __require(10);

function troopCount(troops) {
  let n = 0;
  Object.keys(troops || {}).forEach(function (id) {
    n += troops[id] || 0;
  });
  return n;
}

function addTroops(troops, id, n) {
  if (!troops[id]) troops[id] = 0;
  troops[id] += n;
  if (troops[id] <= 0) delete troops[id];
  return troops;
}

function removeTroops(troops, id, n) {
  if (!troops[id]) return 0;
  const removed = Math.min(n, troops[id]);
  troops[id] -= removed;
  if (troops[id] <= 0) delete troops[id];
  return removed;
}

/** 每日口粮消耗 */
function foodPerDay(troops) {
  let points = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    points += (troops[id] || 0) * t.food;
  });
  return Math.max(1, Math.round(points * 0.3));
}

/**
 * 粮草上限：人多辎重多，能带的粮也多；人少也给一份保底。
 * 9 个人 174，30 人 300，100 人 720。
 */
const FOOD_BASE_CAP = 120;
const FOOD_CAP_PER_TROOP = 6;

function foodCap(troops) {
  return FOOD_BASE_CAP + troopCount(troops) * FOOD_CAP_PER_TROOP;
}

function avgTier(troops) {
  let sum = 0;
  let n = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    sum += (troops[id] || 0) * t.tier;
    n += troops[id] || 0;
  });
  return n ? sum / n : 0;
}

/** 战力估算，用于大地图上显示强弱对比 */
function strength(troops) {
  let atk = 0;
  let def = 0;
  let hp = 0;
  let cav = 0;
  let ranged = 0;
  let spear = 0;
  let pierce = 0;
  let fire = 0;
  let lock = 0;
  let n = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    const c = troops[id] || 0;
    atk += t.atk * c;
    def += t.def * c;
    hp += t.hp * c;
    if (t.cav) cav += c;
    if (t.ranged) ranged += c;
    if (t.spear) spear += c;
    if (t.pierce) pierce += c;
    if (t.fire) fire += c;
    if (t.lock) lock += c;
    n += c;
  });
  return {
    count: n,
    atk,
    def,
    hp,
    cav,
    ranged,
    power: Math.round((atk + def * 0.8 + hp * 0.25) * 1),
    cavRatio: n ? cav / n : 0,
    rangedRatio: n ? ranged / n : 0,
    spearRatio: n ? spear / n : 0,
    pierceRatio: n ? pierce / n : 0,
    fireRatio: n ? fire / n : 0,
    lockRatio: n ? lock / n : 0,
  };
}

/**
 * 按 tier 从低到高扣减伤亡（低阶兵先倒下）
 * 返回实际伤亡明细
 */
function distributeLosses(troops, totalLoss) {
  const losses = {};
  let remain = Math.round(totalLoss);
  if (remain <= 0) return losses;

  const order = Object.keys(troops || {})
    .map(function (id) {
      return { id, tier: TROOPS[id] ? TROOPS[id].tier : 1, count: troops[id] };
    })
    .sort(function (a, b) {
      return a.tier - b.tier;
    });

  for (let i = 0; i < order.length && remain > 0; i++) {
    const item = order[i];
    const take = Math.min(item.count, remain);
    if (take <= 0) continue;
    losses[item.id] = (losses[item.id] || 0) + take;
    remain -= take;
  }

  // 若低阶兵不够扣，剩余损失平均摊到各兵种
  if (remain > 0) {
    const ids = Object.keys(troops || {});
    for (let i = 0; i < ids.length && remain > 0; i++) {
      const id = ids[i];
      if (losses[id] >= troops[id]) continue;
      losses[id] = (losses[id] || 0) + 1;
      remain -= 1;
    }
  }

  Object.keys(losses).forEach(function (id) {
    removeTroops(troops, id, losses[id]);
  });
  return losses;
}

/**
 * 部队总人数上限，靠声望提升；开局溃兵允许超编到 30。
 *
 * 每 100 声望算一档，第一档 +30 人，之后每档的增幅只剩上一档的 0.9
 * （锐减度）。前 100 声望 +30，第二个 100 只 +27，再往后 +24.3……
 * 名声越大，能多带的人越少；上限渐进到 330，不会无限膨胀。
 */
const CAPACITY_BASE = 30;
const CAPACITY_FIRST_STEP = 30;
const CAPACITY_DECAY = 0.9;

function troopCapacity(renown) {
  const r = Math.max(0, Number(renown) || 0);
  const blocks = r / 100;
  const cap = CAPACITY_BASE
    + CAPACITY_FIRST_STEP * (1 - Math.pow(CAPACITY_DECAY, blocks)) / (1 - CAPACITY_DECAY);
  return Math.max(CAPACITY_BASE, Math.floor(cap));
}

module.exports = {
  troopCount,
  addTroops,
  removeTroops,
  foodPerDay,
  foodCap,
  avgTier,
  strength,
  distributeLosses,
  troopCapacity,
};

  };

  /* js/data/extra.js */
  __defs[12] = function (module, exports, __require) {
/**
 * 扩展数据：商品、匪徒等级、英雄、领主台词、村庄货物
 * 与 china.js 分开，改平衡只动这个文件
 */

/* ---------------------------------------------------------------- 商品 */
/** base 基准价；spread 各地浮动幅度；unit 计量单位 */
const GOODS = [
  { id: 'grain', name: '粟米袋', base: 34, spread: 0.55, unit: '袋', desc: '关中最贱，河北最贵。灾年能翻一倍。' },
  { id: 'salt', name: '青盐', base: 96, spread: 0.75, unit: '担', desc: '海边晒的，山里缺的。走得越远越值钱。' },
  { id: 'iron', name: '铁锭', base: 178, spread: 0.6, unit: '块', desc: '并州、益州产铁。铸兵器的都要。' },
  { id: 'hide', name: '生皮', base: 72, spread: 0.5, unit: '张', desc: '鲜卑人拿它换盐，中原人拿它做甲。' },
  { id: 'cloth', name: '绢布', base: 132, spread: 0.6, unit: '匹', desc: '蜀锦最贵，荆襄最贱。' },
  { id: 'wine', name: '酒坛', base: 158, spread: 0.7, unit: '坛', desc: '官渡前夜，淳于琼帐里的灯亮到三更。' },
  { id: 'tea', name: '茶砖', base: 124, spread: 0.65, unit: '砖', desc: '南边压成砖，北边换马。' },
  { id: 'herb', name: '药材', base: 146, spread: 0.8, unit: '包', desc: '军中缺药，价钱就由药商说了算。' },
  { id: 'pot', name: '陶器', base: 58, spread: 0.45, unit: '件', desc: '沉，易碎，利润薄但稳。' },
  { id: 'horse', name: '马匹', base: 560, spread: 0.9, unit: '匹', desc: '凉州出好马。一匹顶百口粮。' },
];

/* ---------------------------------------------------------------- 匪徒 */
/**
 * 匪徒分四级：青（多、好打）、蓝（难一点）、橙（主线中段后才出）、红（接近领主）
 * share 为生成权重；pct 用于说明
 */
const BANDIT_TIERS = {
  qing: {
    id: 'qing', name: '劫匪', color: '#4f8f6a', rank: 1, share: 0.60,
    minSize: 6, maxSize: 12, extra: {},
    loot: [18, 40], morale: [50, 66], sight: 5,
    desc: '拦路要过路钱的散匪。人少，刀旧，打赢了够吃三天。',
  },
  lan: {
    id: 'lan', name: '黄巾军', color: '#4a7fb0', rank: 2, share: 0.30,
    minSize: 12, maxSize: 22, extra: { raider: [2, 4] },
    loot: [45, 90], morale: [58, 72], sight: 6,
    desc: '头裹黄巾的流民军。有刀有弓，也有一点信。',
  },
  cheng: {
    id: 'cheng', name: '乱军', color: '#c07a3c', rank: 3, share: 0.08,
    minSize: 24, maxSize: 38, extra: { raider: [4, 8], raider_cav: [2, 4] },
    loot: [110, 190], morale: [66, 80], sight: 7,
    desc: '溃下来的官军，旗号撕了，甲还在。有骑有弓，成建制地抢。',
  },
  hong: {
    id: 'hong', name: '叛军', color: '#a8403a', rank: 4, share: 0.02,
    minSize: 45, maxSize: 70, extra: { raider: [8, 14], raider_cav: [5, 10] },
    loot: [240, 420], morale: [78, 92], sight: 8,
    desc: '已经打出名号的叛部。只比领主差一线，碰上要么跑，要么备好天机简。',
  },
};

const BANDIT_NAMES = {
  qing: ['剪径劫匪', '断道劫匪', '饿虎岗劫匪', '黑店劫匪'],
  lan: ['白波黄巾', '黑山黄巾', '汝南黄巾', '太行黄巾'],
  cheng: ['凉州溃兵', '徐州乱军', '淮南乱军', '颍川乱军'],
  hong: ['西凉叛骑', '黑山飞燕', '泰山群盗', '汉中米贼'],
};

/** 主线推进到第几章开始出高阶匪徒 */
const BANDIT_UNLOCK_STAGE = { qing: 0, lan: 0, cheng: 2, hong: 3 };

/* ---------------------------------------------------------------- 英雄 */
/**
 * 不起眼的将领：能招募，随队不死，靠打仗升级（1-10）
 * power = atk/def 对队伍战力的加成系数来源
 */
const HEROES = [
  { id: 'liaohua', name: '廖化', site: 'xinye', cost: 220, atk: 5, def: 4, hp: 22, bio: '蜀中老将。早年做过山贼，后来跟着关羽，一直活到蜀汉灭亡那年。' },
  { id: 'zhoucang', name: '周仓', site: 'puyang', cost: 200, atk: 6, def: 4, hp: 24, bio: '给关羽扛刀的。据说跑得比马快，水里也能追。' },
  { id: 'madai', name: '马岱', site: 'tianshui', cost: 280, atk: 7, def: 5, hp: 26, bio: '马超的族弟。西凉败了以后，他一个人往南走，走到了蜀。' },
  { id: 'guanping', name: '关平', site: 'jiangling', cost: 260, atk: 6, def: 6, hp: 26, bio: '关羽的长子。跟着父亲守荆州，最后一夜没能突围。' },
  { id: 'lingtong', name: '凌统', site: 'wujun', cost: 260, atk: 7, def: 5, hp: 25, bio: '东吴的少年将。父亲死在甘宁箭下，后来两人却成了同袍。' },
  { id: 'xusheng', name: '徐盛', site: 'jianye', cost: 240, atk: 6, def: 6, hp: 27, bio: '江东守将。曹丕南征时，他在江上摆了一片假城。' },
  { id: 'dingfeng', name: '丁奉', site: 'chaisang', cost: 230, atk: 7, def: 5, hp: 25, bio: '东吴四朝老将。东兴一战，天寒雪大，他脱了甲往上冲。' },
  { id: 'huanggai', name: '黄盖', site: 'jiangling', cost: 250, atk: 6, def: 7, hp: 28, bio: '赤壁那晚，他挨了五十杖，然后带着火船过去了。' },
  { id: 'yanyan', name: '严颜', site: 'jiange', cost: 210, atk: 6, def: 6, hp: 27, bio: '巴郡太守。被张飞捉住时只说了一句：这里只有断头将军。' },
  { id: 'wangping', name: '王平', site: 'hanzhong', cost: 230, atk: 7, def: 6, hp: 28, bio: '不识几个字，却守得住街亭之后的那条路。' },
  { id: 'zhangyi', name: '张翼', site: 'chengdu', cost: 200, atk: 5, def: 7, hp: 27, bio: '益州旧将。跟着刘璋，后来又跟着刘备，一直守到剑阁。' },
  { id: 'lidian', name: '李典', site: 'ye', cost: 250, atk: 6, def: 7, hp: 28, bio: '曹操的旧部。逍遥津那一夜，他和张辽、乐进三个人守住了合肥。' },
  { id: 'yuejin', name: '乐进', site: 'guandu', cost: 240, atk: 7, def: 5, hp: 26, bio: '先登陷阵的常客。每回攻城，第一个上云梯的多半是他。' },
  { id: 'yujin', name: '于禁', site: 'puyang', cost: 220, atk: 6, def: 8, hp: 30, bio: '治军最严的一个。樊城被水淹了，他降了，后半生没抬起头。' },
  { id: 'caohong', name: '曹洪', site: 'luoyang', cost: 230, atk: 6, def: 6, hp: 27, bio: '荥阳那一战，他把自己的马让给了曹操，说天下可以没有曹洪。' },
  { id: 'zangba', name: '臧霸', site: 'xiapi', cost: 210, atk: 7, def: 5, hp: 25, bio: '泰山群盗出身，后来做了青徐的守将，海上的事他管得最清。' },
  // ---- 第二批：各地还能拉上船的 ----
  { id: 'haozhao', name: '郝昭', site: 'jiange', cost: 300, atk: 6, def: 8, hp: 30, bio: '守陈仓的那个。诸葛亮几万人攻了二十多天，城还在。' },
  { id: 'zhuran', name: '朱然', site: 'chaisang', cost: 270, atk: 7, def: 6, hp: 28, bio: '江东的守将。江陵被围，他在城里撑了半年。' },
  { id: 'huojun', name: '霍峻', site: 'jiangzhou', cost: 250, atk: 6, def: 8, hp: 29, bio: '几百人守葭萌关，一年多没丢。刘备入蜀，他在后头看着门。' },
  { id: 'zhangni', name: '张嶷', site: 'chengdu', cost: 240, atk: 7, def: 6, hp: 27, bio: '蜀中的戍将。南中那些年，路是他一寸一寸拓出来的。' },
  { id: 'lvdai', name: '吕岱', site: 'jiaozhi', cost: 230, atk: 6, def: 6, hp: 27, bio: '九十岁还在南方带兵。交州是他替东吴拿下来的。' },
  { id: 'sunhuan', name: '孙桓', site: 'wujun', cost: 220, atk: 6, def: 6, hp: 26, bio: '孙家的年轻人。夷陵那一仗，他守住了要道。' },
  { id: 'niujin', name: '牛金', site: 'hulao', cost: 210, atk: 7, def: 5, hp: 26, bio: '曹军的先锋。江陵城下，几百人冲过吴军的阵。' },
  { id: 'tianyu', name: '田豫', site: 'beiping', cost: 240, atk: 6, def: 7, hp: 28, bio: '守北边的人。乌桓、鲜卑都从他这一段绕过去。' },
  { id: 'qianzhao', name: '牵招', site: 'ji', cost: 230, atk: 6, def: 7, hp: 28, bio: '看着塞外那条线。风一起，他就知道谁要南下。' },
  { id: 'zhangyan', name: '张燕', site: 'heishan', cost: 250, atk: 8, def: 5, hp: 27, bio: '黑山里的头一号。几万人钻山沟，官军拿他没办法。' },
];

/**
 * 酒馆英雄自传：只写这个人自己走过的路，不写他曾经站在谁帐下。
 * 当前归属由英雄页按玩家国号动态补一行“现属……麾下”。
 */
const HERO_STORIES = {
  liaohua: '荆州山野出身，早年聚众自保。后来沿江转战，夷陵败后收拢残兵，护着老母一路西行。蜀亡那年仍在军中，是最后一批放下刀的人。',
  zhoucang: '河东人，脚力极好，能在水里追船。早年替人押镖，后来专扛长刀随军陷阵。荆州失守后，他守在麦城门外，没有退。',
  madai: '西凉人，少年时在马背上长大。潼关败后穿过陇山，一路南行入蜀。后来多次北伐，擅长带小队翻山截粮。',
  guanping: '荆州军中长大，弓马熟。襄樊之战随军北上，水淹七军时率舟师断后。麦城突围那夜，他留下守门。',
  lingtong: '吴郡人，十五岁就上了战船。父亲战死后，他每次冲阵都抢在最前。后来与旧仇同营，仍以军务为先。',
  xusheng: '琅琊人，早年带着乡勇南渡。曹丕南征时，他在江边连夜筑假城，把对岸看退。一生守在江东的潮线上。',
  dingfeng: '庐江人，历经四朝。东兴大雪夜，他脱甲持短刀先登，夺下城头。晚年仍能披甲巡江。',
  huanggai: '零陵人，早年走江湖。赤壁前夜挨了五十杖，诈降带火船冲入连环。火起时，他自己在船尾断后。',
  yanyan: '巴郡人，守城到粮尽。被擒后只留一句断头将军，不肯低头。后来仍带本部守山道。',
  wangping: '巴西人，识字不多。街亭之后收拢散兵，沿山道设旗，把追兵拖住。此后专守险隘，治军极严。',
  zhangyi: '益州人，先守成都，后守剑阁。每战先算粮道，再定进退。蜀亡时随军降，仍护着百姓出城。',
  lidian: '山阳人，喜读书，不好争功。逍遥津夜战，他与友军分守两门，把孙权的大军挡在城外。',
  yuejin: '阳平人，身材短小，先登第一。每回攻城，他扛着梯子走在最前。合肥城下，他的旗始终插在缺口。',
  yujin: '泰山人，治军最严。樊城大水，他带残兵登高，最终放下刀。后半生被人指着脊梁，仍每日整甲。',
  caohong: '沛国人，荥阳一战把马让给主公，自己步战断后。后来管粮，前线缺什么，他从后方押来。',
  zangba: '泰山人，少年聚众自保。后来守青徐，熟悉海路与盐场。谁走海路，都绕不开他的旗。',
  haozhao: '太原人，守陈仓。几万大军攻了二十多天，他带伤巡城，箭尽用石。城始终没破。',
  zhuran: '丹阳人，守江陵。围城半年，城中疫病，他把自己的口粮分给伤兵。援军到时，城头旗还在。',
  huojun: '南郡人，带几百人守葭萌。一年多的攻防，他把每一段城墙都修补了三次。',
  zhangni: '巴郡人，久在南中。开路、修桥、安抚部族，他带兵修出一条能走粮车的山道。',
  lvdai: '广陵人，九十岁仍南征。交州初定，他一边设郡，一边开盐场，把海边的路走熟。',
  sunhuan: '吴郡人，宗室子弟。夷陵之战守要道，被围后仍每日登城。',
  niujin: '南阳人，先锋出身。江陵城下带几百人冲阵，替后军打开缺口。',
  tianyu: '渔阳人，守北边数十年。乌桓、鲜卑南下，他先断粮道，再以小骑扰后。',
  qianzhao: '安平人，长在塞外。风起时能辨马蹄方向，多次在边境设伏。',
  zhangyan: '常山人，黑山头号。几万人钻山沟，官军围不住；他带人时总留一条退路。',
};

function heroStory(id) {
  if (HERO_STORIES[id]) return HERO_STORIES[id];
  const def = HEROES.filter(function (h) { return h.id === id; })[0];
  return def ? def.bio : '';
}

/** 每位英雄给队伍带来一样长处，随等级放大 */
const HERO_BONUS = {
  liaohua: { atk: 0.015, label: '老练：战团攻击微增' },
  zhoucang: { speed: 0.05, label: '跑得快：行军提速' },
  madai: { atk: 0.02, label: '西凉刀法：攻击 +2%' },
  guanping: { def: 0.025, label: '守阵：防御 +2.5%' },
  lingtong: { atk: 0.025, label: '锐气：攻击 +2.5%' },
  xusheng: { def: 0.03, label: '疑城：防御 +3%' },
  dingfeng: { speed: 0.04, label: '雪中先登：行军提速' },
  huanggai: { loot: 0.06, label: '火攻：缴获更多' },
  yanyan: { def: 0.03, label: '断头将军：防御 +3%' },
  wangping: { def: 0.025, label: '守隘：防御 +2.5%' },
  zhangyi: { food: 0.06, label: '会算粮：日耗减少' },
  lidian: { def: 0.02, label: '稳营：防御 +2%' },
  yuejin: { atk: 0.03, label: '先登：攻击 +3%' },
  yujin: { def: 0.035, label: '治军：防御 +3.5%' },
  caohong: { loot: 0.08, label: '救驾之功：缴获更多' },
  zangba: { speed: 0.04, loot: 0.05, label: '海路熟：行军快、缴获多' },
  haozhao: { def: 0.04, label: '守城：防御 +4%' },
  zhuran: { def: 0.03, label: '坚壁：防御 +3%' },
  huojun: { def: 0.035, label: '孤城：防御 +3.5%' },
  zhangni: { speed: 0.05, label: '开山道：行军提速' },
  lvdai: { morale: 2, label: '老将坐镇：每日士气 +2' },
  sunhuan: { atk: 0.02, label: '锐卒：攻击 +2%' },
  niujin: { atk: 0.03, label: '先冲：攻击 +3%' },
  tianyu: { morale: 2, label: '边塞老将：每日士气 +2' },
  qianzhao: { def: 0.025, label: '守边：防御 +2.5%' },
  zhangyan: { speed: 0.06, label: '钻山沟：行军提速' },
};

const HERO_MAX_LEVEL = 10;

/* ---------------------------------------------------------------- 领主台词 */

const LORD_TALK = {
  caocao: {
    greet: '你看我做什么？',
    bio: '曹操，沛国谯人。二十举孝廉，做洛阳北部尉时棒杀过蹇硕的叔父。讨董卓，诸侯都看着，只有他带兵追到荥阳，败得只剩几百人。',
    idle: [
      '在看舆图。这天下，缺口太多了。',
      '在等粮。粮不到，兵就是纸糊的。',
      '在写信。写给很多人，写得都一样。',
    ],
    warLine: '在和袁本初对峙。这一仗，谁先断粮谁就输。',
  },
  xiahou: {
    greet: '要打就快点。',
    bio: '夏侯惇，沛国谯人。早年替人出头，被人射瞎了一只眼，拔矢啖睛，从此军中都叫他盲夏侯。',
    idle: [
      '在点兵。少三个人，我得问清楚。',
      '在修营垒。土要一层一层夯。',
      '在喝粥。军中的粥，比肉香。',
    ],
    warLine: '在北边压着袁军的粮道，一天挪十里。',
  },
  zhangliao: {
    greet: '报上名来。',
    bio: '张辽，雁门马邑人。先跟丁原、吕布，白门楼之后归了曹操。合肥那一夜，八百人冲十万，江东从此不敢过江。',
    idle: [
      '在巡营。夜里最怕火。',
      '在练骑。马不熟，阵就散。',
      '在数箭。箭不够，守城就是空话。',
    ],
    warLine: '在盯着江东的动静。他们一动，我就动。',
  },
  liubei: {
    greet: '壮士，何处来？',
    bio: '刘备，涿郡人。织席卖履出身，讨黄巾起家。半生寄人篱下，四十岁还没有一块自己的地。',
    idle: [
      '在编草鞋。手不闲，心就静。',
      '在等一个人。他会来的。',
      '在和百姓说话。他们记得我。',
    ],
    warLine: '在和曹操抢粮。抢不到，就只能往南走。',
  },
  guanyu: {
    greet: '你的旗，是哪一路？',
    bio: '关羽，河东解良人。亡命到涿郡，遇上刘备。斩颜良于万众之中，水淹七军，最后败走麦城。',
    idle: [
      '在读《春秋》。读到一半，天就黑了。',
      '在擦刀。刀要亮，人才齐。',
      '在看北边。那里有我想杀的人。',
    ],
    warLine: '在围樊城，水已经放了一半。',
  },
  zhangfei: {
    greet: '站住！',
    bio: '张飞，涿郡人。长坂桥上一声吼，曹军不敢近。后来死于自己帐下的两个人手里。',
    idle: [
      '在喝酒。喝完就打。',
      '在骂人。骂完了照样请吃饭。',
      '在练矛。一矛下去，树折了。',
    ],
    warLine: '在守当阳桥。谁过来，我就吼他。',
  },
  sunquan: {
    greet: '江东的船，你坐过吗？',
    bio: '孙权，吴郡富春人。十八岁接兄长孙策的位置，赤壁一把火烧退曹操，此后坐断东南五十年。',
    idle: [
      '在看江。江水比人心好懂。',
      '在听人吵。吵完我就知道该用谁。',
      '在数船。少一艘，江就漏风。',
    ],
    warLine: '在和曹操隔江对望，谁先动谁吃亏。',
  },
  zhouyu: {
    greet: '你懂风向吗？',
    bio: '周瑜，庐江舒人。二十四岁做建威中郎将，江东人都叫他周郎。赤壁那一夜，东南风起，他把火点在了该点的地方。',
    idle: [
      '在听风。今天不对。',
      '在算粮。十万人的嘴，不是小数。',
      '在弹琴。弹错了也不停。',
    ],
    warLine: '在赤壁布火船。等一场东南风。',
  },
  taishici: {
    greet: '来比一场？',
    bio: '太史慈，东莱黄人。为了报恩，单骑出城突围。后来跟了孙策，箭术江东第一。',
    idle: [
      '在射箭。一百步，中了。',
      '在带新兵。他们的手在抖。',
      '在等孙策。他答应过要回来。',
    ],
    warLine: '在盯着豫章的渡口，那边有我要找的人。',
  },
  yuanshao: {
    greet: '四世三公的门，你进得来吗？',
    bio: '袁绍，汝南汝阳人。四世三公之后，据河北四州，带甲十万。官渡之前，天下人都以为他会赢。',
    idle: [
      '在议事。议了三天，还没议完。',
      '在看降表。每天都有人来降。',
      '在喝酒。这酒是冀州最好的。',
    ],
    warLine: '在官渡和曹操耗着。我的粮比他多。',
  },
  yanliang: {
    greet: '前面那个，别挡道。',
    bio: '颜良，河北名将。袁绍麾下第一勇，白马之战，被关羽一骑冲阵斩于麾盖之下。',
    idle: [
      '在磨刀。刀口卷了。',
      '在看阵。对面那排枪，站得不齐。',
      '在骂粮官。粮又晚了。',
    ],
    warLine: '在白马列阵。今天要过去。',
  },
  lvbu: {
    greet: '方天画戟，认得么？',
    bio: '吕布，五原九原人。人中吕布，马中赤兔。杀了丁原、董卓，占了徐州，最后困在下邳白门楼。',
    idle: [
      '在饮马。这匹马只认我。',
      '在练戟。一戟下去，木桩断了三根。',
      '在等人送粮。陈宫说快到了。',
    ],
    warLine: '在下邳城里。曹操的水，围了三面。',
  },
  gaoshun: {
    greet: '陷阵营，不许退。',
    bio: '高顺，吕布麾下。所带七百余人，号陷阵营，攻无不破。吕布败后，他一句话没求，就死了。',
    idle: [
      '在整甲。甲叶子要一片片扣。',
      '在巡城。城墙的裂缝我记着。',
      '在罚人。军法不能松。',
    ],
    warLine: '在小沛驻着，随时能出。',
  },
  liubiao: {
    greet: '荆州八郡，还算安稳。',
    bio: '刘表，山阳高平人。单骑入荆州，收服宗贼，坐守二十年。他不动，别人也不动他。',
    idle: [
      '在宴客。荆襄的士人都在。',
      '在看书。看了半卷，困了。',
      '在听蔡瑁说话。听着，不答。',
    ],
    warLine: '在襄阳按兵。北边打起来，我这边先看看。',
  },
  caimao: {
    greet: '水军的账，你要看？',
    bio: '蔡瑁，襄阳人。荆州水军的头，也是刘表妻族。后来降了曹操，做了水军都督，死在周瑜的反间计里。',
    idle: [
      '在点船。江面上少了两艘。',
      '在算账。这个月的军饷又超了。',
      '在看江雾。雾一起，什么都看不见。',
    ],
    warLine: '在江陵练水军，等着北边的号令。',
  },
  liuzhang: {
    greet: '益州天府，可惜我守得累。',
    bio: '刘璋，江夏竟陵人。接了父亲刘焉的益州，性子软。请刘备入川帮忙，最后把自己请了出去。',
    idle: [
      '在收租。今年的租，收得勉强。',
      '在犹豫。张鲁在北边，刘备在东边。',
      '在听曲。听了就忘了烦。',
    ],
    warLine: '在成都城里，防着北边的张鲁。',
  },
  zhangren: {
    greet: '剑阁的门，我关着。',
    bio: '张任，蜀郡人。刘璋麾下最硬的将。雒城一战射死庞统，后来被擒，不肯降。',
    idle: [
      '在守隘。这地方一个人能挡一百个。',
      '在练兵。弓要拉满才算练过。',
      '在画图。山路我走过三遍。',
    ],
    warLine: '在雒城设伏，等一个入川的人。',
  },
  kebineng: {
    greet: '草原上的规矩，你不懂。',
    bio: '轲比能，鲜卑小帅出身。统一漠南诸部，控弦十余万，曹操、曹丕都拿他没办法。',
    idle: [
      '在放马。马群跑起来像云。',
      '在分肉。分得公平，就没人闹。',
      '在望南边。南边的城，墙都很矮。',
    ],
    warLine: '在阴山南麓游动，等边关换防。',
  },
  mateng: {
    greet: '凉州的马，你骑得住吗？',
    bio: '马腾，扶风茂陵人。凉州军阀，和马超一起反过曹操，后来入朝做人质，死于许都。',
    idle: [
      '在挑马。这一匹前腿好。',
      '在和后生比箭。输赢都不重要。',
      '在等儿子回来。他总在打。',
    ],
    warLine: '在渭水边上列阵，和曹军隔着河。',
  },
  machao: {
    greet: '锦马超，听说过？',
    bio: '马超，扶风茂陵人。潼关一战杀得曹操割须弃袍。后来投了刘备，做了蜀汉的骠骑将军。',
    idle: [
      '在洗马。马比人干净。',
      '在练冲阵。三十步内，没人挡得住。',
      '在看西边。那里埋着我的家。',
    ],
    warLine: '在潼关外，等着冲一次。',
  },
  huangfusong: {
    greet: '汉家的旗，还没倒。',
    bio: '皇甫嵩，安定朝那人。平黄巾的第一功是他立的，长社一把火，烧了波才十万众。',
    idle: [
      '在整军。乱世里，军纪最值钱。',
      '在写表。写给朝廷，多半没人看。',
      '在看城。长安的城墙，比十年前旧了。',
    ],
    warLine: '在长安整兵，等朝廷一句话。',
  },
};

/* ---------------------------------------------------------------- 村庄 */
const VILLAGE_FOOD = [
  { id: 'ox', name: '耕牛', price: 180, food: 60, stockMax: 1, desc: '一头牛换六十口粮。村里人舍不得，但给钱就卖。' },
  { id: 'sheep', name: '羊', price: 70, food: 22, stockMax: 2, desc: '两只羊够一队人吃两天。' },
  { id: 'chicken', name: '鸡鸭', price: 26, food: 8, stockMax: 4, desc: '零碎换的，胜在便宜。' },
  { id: 'grain', name: '谷子', price: 40, food: 30, stockMax: 3, desc: '村里自己的存粮，价比城里低。' },
  { id: 'veg', name: '菜蔬', price: 18, food: 6, stockMax: 5, desc: '地里刚拔的，撑不了几天。' },
];

/**
 * 每位领主长得不一样：兵器、头饰、披风、马色
 * weapon: ji 戟 / dao 刀 / qiang 枪 / gong 弓 / jian 剑
 * helm:   plume 双翎 / horn 红缨盔 / crown 高冠 / band 头巾
 */
const LORD_LOOK = {
  caocao: { weapon: 'jian', helm: 'crown', cape: '#7a2118', horse: '#2a2320' },
  xiahou: { weapon: 'dao', helm: 'horn', cape: '#4a2a20', horse: '#6a3a24' },
  zhangliao: { weapon: 'qiang', helm: 'horn', cape: '#3a4a58', horse: '#4a4440' },
  liubei: { weapon: 'jian', helm: 'crown', cape: '#c9c2ae', horse: '#7a6a52' },
  guanyu: { weapon: 'dao', helm: 'band', cape: '#2f6a3a', horse: '#8a5a36', beard: true, tall: true },
  zhangfei: { weapon: 'qiang', helm: 'horn', cape: '#2a2a2e', horse: '#2a2a2e', beard: true, big: true },
  sunquan: { weapon: 'jian', helm: 'crown', cape: '#4a3a68', horse: '#4a4440' },
  zhouyu: { weapon: 'jian', helm: 'band', cape: '#d8d2c0', horse: '#8a7a5c' },
  taishici: { weapon: 'gong', helm: 'horn', cape: '#3a5a52', horse: '#6a4a30' },
  yuanshao: { weapon: 'jian', helm: 'crown', cape: '#8a6a2a', horse: '#5a4030' },
  yanliang: { weapon: 'dao', helm: 'horn', cape: '#6a2a24', horse: '#5a3a26', big: true },
  lvbu: { weapon: 'ji', helm: 'plume', cape: '#b03a30', horse: '#6a2a22' },
  gaoshun: { weapon: 'qiang', helm: 'horn', cape: '#4a4a4e', horse: '#3a3430' },
  liubiao: { weapon: 'jian', helm: 'crown', cape: '#5a6a4a', horse: '#5a4a3a' },
  caimao: { weapon: 'gong', helm: 'band', cape: '#3a5a6a', horse: '#4a4440' },
  liuzhang: { weapon: 'jian', helm: 'crown', cape: '#6a5a2a', horse: '#6a5a42' },
  zhangren: { weapon: 'qiang', helm: 'horn', cape: '#5a4a2a', horse: '#4a3a28' },
  kebineng: { weapon: 'gong', helm: 'band', cape: '#7a6a3a', horse: '#c9c2ae' },
  mateng: { weapon: 'qiang', helm: 'horn', cape: '#4a5a6a', horse: '#c9c2ae' },
  machao: { weapon: 'qiang', helm: 'horn', cape: '#d8d2c0', horse: '#e2dcd0' },
  huangfusong: { weapon: 'jian', helm: 'crown', cape: '#5a4a3a', horse: '#4a4440' },
};

/** 后补领主的史实一句（台词主体仍走 LORD_TALK，缺省时用势力通用池） */
const LORD_EXTRA_BIO = {
  caoren: '曹仁，曹操从弟。守樊城，关羽水淹七军，他还站在城墙上。',
  xiahouyuan: '夏侯渊，夏侯惇族弟。军中说他三日五百、六日一千，关中的路是他跑出来的。',
  xuhuang: '徐晃，河东杨人。治军像周亚夫，樊城一战长驱直入，曹操说他有古之名将风。',
  zhanghe: '张郃，河间鄚人。官渡投曹，后来在街亭断了马谡的水。',
  xuchu: '许褚，谯国谯人。年轻时拉着牛尾巴走了百步，曹操的虎卫头一号。',
  litong: '李通，江夏平春人。平叛路上病倒，曹操亲自为他吊丧。',
  zhaoyun: '赵云，常山真定人。长坂坡抱着孩子冲出来，一辈子没丢过阵。',
  huangzhong: '黄忠，南阳人。定军山一刀，夏侯渊的头就挂在了旗下。',
  weiyan: '魏延，义阳人。守汉中十年，敢走子午谷那条险路。',
  chendao: '陈到，汝南人。白毦兵的头，刘备最信的那一支。',
  liufeng: '刘封，长沙刘氏之后。上庸的兵是他带的，后来没去救关羽。',
  mizhu: '糜竺，东海朐人。徐州起家时的钱粮，一半是他出的。',
  ganning: '甘宁，巴郡临江人。锦帆贼出身，百骑劫营，回来一个没少。',
  lvmeng: '吕蒙，汝南富陂人。从吴下阿蒙到白衣渡江，只用了几年。',
  luxun: '陆逊，吴郡吴人。夷陵一把火，烧了刘备七百里连营。',
  chengpu: '程普，右北平土垠人。江东三代老将，周瑜也曾在他手下。',
  handang: '韩当，辽西令支人。从孙坚起就在，弓马一辈子。',
  wenchou: '文丑，河北名将。延津一战，死在乱军里。',
  chunyuqiong: '淳于琼，颍川人。乌巢守将，酒还没醒，火就起来了。',
  jiangyiqu: '蒋义渠，河北校尉。袁军的粮道，一半在他手上。',
  guotu: '郭图，颍川人。劝袁谭攻袁尚，兄弟就这样散了。',
  lvkuang: '吕旷，袁家校尉。后来与吕翔一同降了曹。',
  lvxiang: '吕翔，与吕旷同来的那一个。',
  chengong: '陈宫，东郡武阳人。放曹操一马，后来又要杀他。',
  houcheng: '侯成，吕布部将。下邳城破前，是他先开的门。',
  songxian: '宋宪，吕布部将。绑了陈宫出城的人之一。',
  weixu: '魏续，与宋宪同去的那一个。',
  huangzu: '黄祖，江夏太守。守了十几年，射死过孙坚。',
  wenpin: '文聘，南阳宛人。刘表死后守江夏，曹丕说他是真将。',
  zhangyun: '张允，荆州水军副将。船比人多。',
  wangwei: '王威，荆州牙门将。劝刘琮不要降，没人听。',
  wuyi: '吴懿，兖州陈留人。益州老将，妹妹嫁给了刘备。',
  leitong: '雷铜，巴西副将。与张飞同守一条线。',
  lengbao: '冷苞，守剑阁的裨将。粮草总是最紧。',
  liugui: '刘璝，成都城里的中郎将。名是宗室的。',
  suli: '素利，东部鲜卑大人。跟轲比能不一条心。',
  mijia: '弥加，漠南部帅。马比人多。',
  queji: '阙机，与素利争草场的小帅。',
  huaitou: '槐头，弹汗山下的小部。只有几百骑。',
  pufulu: '普富卢，代郡的鲜卑大人。汉人叫他"大人"，他叫自己"牧马的"。',
  zhongji: '种辑，越骑校尉。衣带诏上，签了名的还有他。',
  pangde: '庞德，南安狟道人。抬着棺材去樊城，射过关羽一箭。',
  maxiu: '马休，马腾之子。跟着父亲进了许都。',
  matie: '马铁，与马休一同的骑都尉。',
  chengyin: '程银，西凉九部之一。跟着马超反过。',
  zhujun: '朱儁，会稽上虞人。讨黄巾的三路之一，围宛城围了几个月。',
  luzhi: '卢植，涿郡涿人。刘备、公孙瓒都叫他老师，围广宗时被宦官换了。',
  dongcheng: '董承，汉献帝的国舅。衣带诏那件事，他是领头的人。',
  yangfeng: '杨奉，白波出身。护着天子往东走。',
};

/** 缺台词时的势力通用池 */
const FACTION_TALK = {
  wei: {
    greet: ['魏军大营，闲人退后。', '何事？军务在身。'],
    idle: ['在点粮。少一斗都要查。', '在看舆图，北边那条线要重画。', '在磨刀。刀不快，人就白死。'],
  },
  shu: {
    greet: ['来者何人？', '汉室的事，你也要管？'],
    idle: ['在看南边的山。路太窄。', '在清点伤员。今天又多了七个。', '在写信回成都，写完烧了。'],
  },
  wu: {
    greet: ['江上有雾，别乱走。', '有事说，船要开了。'],
    idle: ['在看水势。这个月风向不对。', '在补船板。木板比人金贵。', '在算粮。水路运粮，省一半。'],
  },
  yuan: {
    greet: ['河北的兵，不是给你看的。', '要见我，先报门第。'],
    idle: ['在等冀州的粮车。', '在看名册。人比册子少。', '在议立谁为主。这事没完。'],
  },
  lv: {
    greet: ['徐州城下，站住。', '我奉温侯之命守这儿。'],
    idle: ['在喂马。赤兔只认一个人。', '在修城门。前天刚撞坏。', '在等并州的旧部。他们还没来。'],
  },
  biao: {
    greet: ['荆州的规矩，先递名帖。', '江水深，话要短。'],
    idle: ['在听琴。城里没什么事。', '在查船。商船比战船多。', '在写表。写给许都，也写给江东。'],
  },
  zhang: {
    greet: ['益州的地界，你从哪儿来？', '天府之国，不缺你这一口饭。'],
    idle: ['在看粮仓。成都的米够吃三年。', '在修栈道。剑阁那条路总塌。', '在听外面的事。关中的消息总慢一步。'],
  },
  xianbei: {
    greet: ['草原上没主，谁的马快谁说了算。', '带了多少盐？'],
    idle: ['在放马。草场往北退了。', '在数牲口。今年雪大。', '在等南边来的铁器。'],
  },
  ma: {
    greet: ['西凉的风沙，吹得眼睛疼。', '羌骑在后头，别挡道。'],
    idle: ['在刷马。马比人耐得住。', '在看关中的方向。', '在分羊肉。今天只够一半人。'],
  },
  han: {
    greet: ['朝廷的旗还在，你要怎样？', '车骑将军帐下，不得喧哗。'],
    idle: ['在等诏书。诏书总在路上。', '在点残兵。名册越翻越薄。', '在看长安的城墙。补了三年还没补完。'],
  },
};

const LOOK_WEAPONS = ['ji', 'dao', 'qiang', 'gong', 'jian'];
const LOOK_HELMS = ['plume', 'horn', 'crown', 'band'];
const LOOK_CAPES = ['#7a2118', '#4a2a20', '#3a4a58', '#2f6a3a', '#4a3a68', '#8a6a2a', '#5a6a4a', '#3a5a6a', '#6a5a2a', '#4a5a6a'];
const LOOK_HORSES = ['#2a2320', '#6a3a24', '#4a4440', '#8a5a36', '#c9c2ae', '#e2dcd0', '#5a4030', '#3a3430'];
const LOOK_CACHE = {};
const LOOK_TAKEN = {};

/** 先查手写造型，没有就按 id 稳定生成一个不撞脸的 */
function lookFor(id) {
  if (LORD_LOOK[id]) return LORD_LOOK[id];
  if (LOOK_CACHE[id]) return LOOK_CACHE[id];
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 131 + id.charCodeAt(i)) >>> 0;
  for (let t = 0; t < 128; t += 1) {
    const k = (h + t * 7919) >>> 0;
    const look = {
      weapon: LOOK_WEAPONS[k % LOOK_WEAPONS.length],
      helm: LOOK_HELMS[Math.floor(k / 5) % LOOK_HELMS.length],
      cape: LOOK_CAPES[Math.floor(k / 20) % LOOK_CAPES.length],
      horse: LOOK_HORSES[Math.floor(k / 200) % LOOK_HORSES.length],
      beard: Math.floor(k / 1600) % 3 === 0,
      tall: Math.floor(k / 4800) % 5 === 0,
      big: Math.floor(k / 24000) % 6 === 0,
    };
    const key = [look.weapon, look.helm, look.cape, look.horse, look.beard, look.tall, look.big].join('|');
    if (!LOOK_TAKEN[key]) {
      LOOK_TAKEN[key] = id;
      LOOK_CACHE[id] = look;
      return look;
    }
  }
  const fallback = { weapon: 'qiang', helm: 'band', cape: LOOK_CAPES[0], horse: LOOK_HORSES[0] };
  LOOK_CACHE[id] = fallback;
  return fallback;
}

module.exports = {
  GOODS,
  BANDIT_TIERS,
  BANDIT_NAMES,
  BANDIT_UNLOCK_STAGE,
  HEROES,
  HERO_STORIES,
  heroStory,
  HERO_BONUS,
  HERO_MAX_LEVEL,
  LORD_TALK,
  LORD_EXTRA_BIO,
  FACTION_TALK,
  LORD_LOOK,
  lookFor,
  VILLAGE_FOOD,
};

  };

  /* js/core/economy.js */
  __defs[11] = function (module, exports, __require) {
/**
 * 经济层：市场粮价、招募、装备升级、每日据点刷新
 */

const { TROOPS } = __require(10);
const { VILLAGE_FOOD } = __require(12);
const { EQUIPMENT } = __require(5);
const { troopCount, troopCapacity, foodCap } = __require(9);

const FOOD_BASE = 5; // 基准粮价（金币 / 单位）

/**
 * 兵价按档次重排：民兵近乎白给，往上每一档都明显更贵。
 * 低阶兵是消耗品，高阶兵是资产。
 */
/**
 * 兵价按档次重排：民兵是个位数，往上每一档明显更贵。
 * 开局 200 金能拉起一支满编民兵，打输了也不至于破产。
 */
const TIER_PRICE_MUL = { 1: 0.34, 2: 0.7, 3: 0.9, 4: 1.0, 5: 1.15 };

function foodPrice(site) {
  if (!site || !site.market) return 0;
  return Math.max(2, Math.round(FOOD_BASE * site.priceBase * (site.priceIndex || 1)));
}

function foodSellPrice(site) {
  if (!site || !site.market) return 0;
  return Math.max(1, Math.round(foodPrice(site) * 0.55));
}

function recruitPrice(site, troopId) {
  const t = TROOPS[troopId];
  if (!t || !site) return 0;
  const typeMul = site.type === 'castle' ? 1.2 : site.type === 'village' ? 0.68 : 1.0;
  const tierMul = TIER_PRICE_MUL[t.tier] || 1;
  return Math.max(4, Math.round(t.recruit * tierMul * typeMul * (site.priceIndex || 1)));
}

function canRecruit(state, site, troopId) {
  const t = TROOPS[troopId];
  if (!t) return { ok: false, msg: '没有这种兵' };
  if (site.faction === 'bandit') return { ok: false, msg: '匪巢不卖人' };
  const pool = site.recruits[troopId] || 0;
  if (pool <= 0) return { ok: false, msg: '这一批已经招完了，等几天再来' };
  if (t.renownReq && state.player.renown < t.renownReq) {
    return { ok: false, msg: '声望不足' + t.renownReq + '，招不到' + t.name };
  }
  return { ok: true };
}

function buyFood(state, site, amount) {
  if (!site.market) return { ok: false, msg: '这里没有市场' };
  const n = Math.max(1, Math.floor(amount));
  const cost = foodPrice(site) * n;
  const cap = foodCap(state.player.troops);
  if (state.player.gold < cost) return { ok: false, msg: '金钱不够，需要 ' + cost };
  if (state.player.food + n > cap) {
    return { ok: false, msg: '粮车装不下了（兵力 ' + troopCount(state.player.troops) + '，上限 ' + cap + '）' };
  }
  state.player.gold -= cost;
  state.player.food += n;
  return { ok: true, msg: '买入 ' + n + ' 单位粮草，花费 ' + cost + ' 金钱', cost };
}

function sellFood(state, site, amount) {
  if (!site.market) return { ok: false, msg: '这里没有市场' };
  const n = Math.min(state.player.food, Math.max(1, Math.floor(amount)));
  if (n <= 0) return { ok: false, msg: '没有粮可卖' };
  const gain = foodSellPrice(site) * n;
  state.player.food -= n;
  state.player.gold += gain;
  return { ok: true, msg: '卖出 ' + n + ' 单位粮草，得到 ' + gain + ' 金钱' };
}

function recruit(state, site, troopId, count) {
  const check = canRecruit(state, site, troopId);
  if (!check.ok) return check;
  const n = Math.max(1, Math.floor(count));
  const price = recruitPrice(site, troopId);
  const affordable = Math.min(n, site.recruits[troopId] || 0, Math.floor(state.player.gold / price));
  if (affordable <= 0) return { ok: false, msg: '金钱不足，单价 ' + price + ' 金钱' };

  const cap = troopCapacity(state.player.renown);
  const room = cap - troopCount(state.player.troops);
  if (room <= 0) return { ok: false, msg: '队伍满编（上限 ' + cap + '），先提升声望' };
  const finalN = Math.min(affordable, room);

  state.player.gold -= price * finalN;
  state.player.troops[troopId] = (state.player.troops[troopId] || 0) + finalN;
  site.recruits[troopId] -= finalN;
  return {
    ok: true,
    msg: '招募 ' + TROOPS[troopId].name + ' × ' + finalN + '，花费 ' + price * finalN + ' 金钱',
    count: finalN,
  };
}

function equipmentTier(state, slot) {
  const equip = EQUIPMENT[slot];
  if (!equip) return null;
  const level = state.player.equip[slot] || 0;
  return equip.tiers[Math.min(level, equip.tiers.length - 1)];
}

function nextEquipment(state, slot) {
  const equip = EQUIPMENT[slot];
  if (!equip) return null;
  const level = (state.player.equip[slot] || 0) + 1;
  return equip.tiers[level] || null;
}

function upgradeEquipment(state, slot) {
  const equip = EQUIPMENT[slot];
  if (!equip) return { ok: false, msg: '没有这个装备位' };
  const next = nextEquipment(state, slot);
  if (!next) return { ok: false, msg: '已经是顶配了' };
  if (state.player.gold < next.price) {
    return { ok: false, msg: '金钱不够，需要 ' + next.price };
  }
  state.player.gold -= next.price;
  state.player.equip[slot] = (state.player.equip[slot] || 0) + 1;
  return { ok: true, msg: '换装：' + next.name };
}

function equipmentBonus(state) {
  const blade = equipmentTier(state, 'blade');
  const armor = equipmentTier(state, 'armor');
  const horse = equipmentTier(state, 'horse');
  return {
    atkPct: blade ? blade.atkPct : 0,
    defPct: armor ? armor.defPct : 0,
    speedPct: horse ? horse.speedPct : 0,
  };
}

/** 守军自然增长：人数越多，招兵越慢；不设硬上限，但到临界点后近乎停滞。
 * 只按“当前守军”算，所以战损之后会从低人数的速度重新长，不会立刻补满。
 */
function garrisonGrowthRate(site) {
  const g = Math.max(0, site.garrison || 0);
  const soft = Math.max(24, site.garrisonBase || 40);
  // 基准 40 人时约 1.7 人/天；100 人时约 1.2；400 人时约 0.5；1000 人时约 0.2。
  return 3.4 / (1 + Math.pow(g / soft, 1.18));
}

function growGarrison(site) {
  if (!site) return 0;
  const rate = garrisonGrowthRate(site);
  site.garrisonGrowth = (site.garrisonGrowth || 0) + rate;
  const inc = Math.floor(site.garrisonGrowth);
  if (inc > 0) {
    site.garrison = Math.max(0, (site.garrison || 0) + inc);
    site.garrisonGrowth -= inc;
  }
  return inc;
}

/** 每日：价格波动 + 招募池刷新 + 守军恢复 */
function dailyMarket(state, rng) {
  state.world.sites.forEach(function (site) {
    const drift = 0.9 + rng.random() * 0.28;
    site.priceIndex = Math.max(0.85, Math.min(1.25, drift));
    if (site.faction === 'bandit') return;

    // 村庄壮丁是有限的一池人：招空就没了，不按天自动回填；城镇/关隘才持续募兵
    if (site.type !== 'village') {
      Object.keys(site.recruits).forEach(function (id) {
        if (site.recruits[id] < (site.recruitCap || 0)) {
          site.recruits[id] += rng.int(1, 3);
        }
      });
      // 补满招募池上限：募兵木牌天天有人来
      (site.recruitList || []).forEach(function (id) {
        if (!site.recruits[id]) site.recruits[id] = rng.int(1, 3);
        const cap = site.recruitCap || 4;
        if (site.recruits[id] > cap) site.recruits[id] = cap;
      });
    }

    // 村市口粮：两天补一次，每样不超过村里能拿出来的那几份
    if (site.type === 'village' && state.clock.day % 2 === 0) {
      site.foodStock = site.foodStock || {};
      VILLAGE_FOOD.forEach(function (f) {
        const cap = f.stockMax || 3;
        if ((site.foodStock[f.id] || 0) < cap) {
          site.foodStock[f.id] = Math.min(cap, (site.foodStock[f.id] || 0) + 1);
        }
      });
    }

    // 领主招兵池：按城/村错开日子补一点，跟玩家招募池分开，也不额外消耗事件随机数
    if (site.type === 'town' || site.type === 'castle' || site.type === 'village') {
      site.lordRecruits = site.lordRecruits || {};
      const lcap = site.type === 'village' ? 2 : 4;
      if (state.clock.day % 3 === (site.x + site.y) % 3) {
        (site.recruitList || []).forEach(function (id) {
          const have = site.lordRecruits[id] || 0;
          if (have < lcap) site.lordRecruits[id] = have + 1;
        });
      }
    }

    // 城池守军按当前人数自然增长：越多越慢，战损后从低处重新长。
    // 村庄的乡勇仍按旧规则补到基准，避免全村都变成兵营。
    if (site.type === 'town' || site.type === 'castle') {
      if (site.ownerFaction !== 'bandit') growGarrison(site);
    } else if (site.playerOwned) {
      site.garrison = Math.min(site.garrisonBase, site.garrison + rng.int(0, 2));
    } else if (site.ownerFaction !== 'bandit') {
      site.garrison = Math.min(site.garrisonBase, site.garrison + rng.int(1, 3));
    }
  });
}

/** 据点每日税收（玩家拥有时） */
function dailyIncome(state) {
  let income = 0;
  state.world.sites.forEach(function (site) {
    if (!site.playerOwned) return;
    if (site.type === 'town') income += 26;
    else if (site.type === 'castle') income += 16;
    else income += 9;
  });
  return income;
}

module.exports = {
  FOOD_BASE,
  foodPrice,
  foodSellPrice,
  recruitPrice,
  canRecruit,
  buyFood,
  sellFood,
  recruit,
  equipmentTier,
  nextEquipment,
  upgradeEquipment,
  equipmentBonus,
  garrisonGrowthRate,
  growGarrison,
  dailyMarket,
  dailyIncome,
};

  };

  /* js/core/trade.js */
  __defs[13] = function (module, exports, __require) {
/**
 * 贸易层：跑商商品、各城物价、估价、买卖
 * 每座城对每种货有固定的偏好（便宜的产地、贵的销地），再叠每天的行情波动。
 */

const { GOODS } = __require(12);

const GOODS_CAP = 80; // 货物总件数上限

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function goodById(id) {
  for (let i = 0; i < GOODS.length; i++) if (GOODS[i].id === id) return GOODS[i];
  return null;
}

/** 该城对该货的固定偏好：0.62 ~ 1.5 */
function cityFactor(site, good) {
  const h = hashStr(site.id + '|' + good.id);
  return 1 + (h - 0.5) * 2 * good.spread;
}

/** 买价：基准 × 城市偏好 × 当日行情 */
function buyPrice(site, goodId) {
  const good = goodById(goodId);
  if (!good || !site || !site.market) return 0;
  const raw = good.base * cityFactor(site, good) * (site.priceIndex || 1);
  return Math.max(2, Math.round(raw));
}

/** 卖给本城：买价的 72%，跑商的利润来自异地差价 */
function sellPrice(site, goodId) {
  const buy = buyPrice(site, goodId);
  if (!buy) return 0;
  return Math.max(1, Math.round(buy * 0.72));
}

function goodsCount(p) {
  const g = p.goods || {};
  let n = 0;
  Object.keys(g).forEach(function (k) { n += g[k] || 0; });
  return n;
}

function buyGoods(state, site, goodId, amount) {
  if (!site || !site.market) return { ok: false, msg: '这里没有市场' };
  const good = goodById(goodId);
  if (!good) return { ok: false, msg: '没有这种货' };
  const n = Math.max(1, Math.floor(amount));
  const cost = buyPrice(site, goodId) * n;
  if (state.player.gold < cost) return { ok: false, msg: '金钱不够，要 ' + cost };
  if (goodsCount(state.player) + n > GOODS_CAP) {
    return { ok: false, msg: '驮队装不下了（上限 ' + GOODS_CAP + ' 件）' };
  }
  state.player.gold -= cost;
  state.player.goods = state.player.goods || {};
  state.player.goods[goodId] = (state.player.goods[goodId] || 0) + n;
  return { ok: true, msg: '买入 ' + good.name + ' ×' + n + '，花费 ' + cost + ' 金钱', cost };
}

function sellGoods(state, site, goodId, amount) {
  if (!site || !site.market) return { ok: false, msg: '这里没有市场' };
  const have = (state.player.goods || {})[goodId] || 0;
  const n = Math.min(have, Math.max(1, Math.floor(amount)));
  if (have <= 0) return { ok: false, msg: '你没有这种货' };
  const gain = sellPrice(site, goodId) * n;
  state.player.goods[goodId] -= n;
  state.player.gold += gain;
  state.stats.goldEarned = (state.stats.goldEarned || 0) + gain;
  return { ok: true, msg: '卖出 ' + goodById(goodId).name + ' ×' + n + '，得 ' + gain + ' 金钱', gain };
}

/**
 * 估价：从当前城出发，这货到哪里卖得最贵。
 * 只报有市场的城，取前三；顺带给个"差价 / 路程"的粗估。
 */
function estimate(state, fromSite, goodId) {
  if (!fromSite || !fromSite.market) return { ok: false, msg: '这里的市集不做这种事' };
  const good = goodById(goodId);
  if (!good) return { ok: false, msg: '没有这种货' };
  const here = buyPrice(fromSite, goodId);
  const rows = [];
  state.world.sites.forEach(function (s) {
    if (!s.market || s.id === fromSite.id) return;
    const price = buyPrice(s, goodId);
    const dist = Math.max(Math.abs(s.x - fromSite.x), Math.abs(s.y - fromSite.y));
    const profit = price - here;
    if (profit <= 0) return;
    rows.push({ site: s, price: price, profit: profit, dist: dist, ratio: profit / Math.max(1, dist) });
  });
  if (!rows.length) {
    return { ok: true, msg: good.name + ' 在本城已经是最低价，别处更贱。', rows: [] };
  }
  rows.sort(function (a, b) { return b.profit - a.profit; });
  return { ok: true, here: here, good: good, rows: rows.slice(0, 3), msg: '估价单' };
}

/** 今日行情：所有城按日微调（已被 dailyMarket 统一调 priceIndex，这里只做商品级的轻微漂移） */
function dailyGoods(state, rng) {
  state.world.sites.forEach(function (site) {
    if (!site.market) return;
    site.goodsTick = (site.goodsTick || 0) + 1;
    if (rng.chance(0.35)) {
      site.priceIndex = Math.max(0.85, Math.min(1.3, (site.priceIndex || 1) * (0.97 + rng.random() * 0.07)));
    }
  });
}

module.exports = {
  GOODS_CAP,
  goodById,
  buyPrice,
  sellPrice,
  goodsCount,
  buyGoods,
  sellGoods,
  estimate,
  dailyGoods,
};

  };

  /* js/core/heroes.js */
  __defs[14] = function (module, exports, __require) {
/**
 * 英雄层：不起眼的将领可招募，随队不死，靠打仗升级（1-10）
 */

const { HEROES, HERO_MAX_LEVEL, HERO_BONUS, heroStory } = __require(12);
const { siteById, gridDistance } = __require(8);

const EXP_PER_LEVEL = 16;
const HERO_CAP_MAX = 15;

/** 随行名额：声望越高带得越多，最多 15 位 */
function heroCap(state) {
  const renown = (state.player && state.player.renown) || 0;
  return Math.min(HERO_CAP_MAX, 3 + Math.floor(renown / 30));
}

/** 英雄驻地校正：数据里写的城若不存在，就就近挂到一座大城 */
function resolveHeroSites(state) {
  const towns = state.world.sites.filter(function (s) {
    return s.type === 'town' || s.type === 'castle';
  });
  if (state.heroSites) return;
  state.heroSites = {};
  HEROES.forEach(function (h) {
    let home = siteById(state.world, h.site);
    if (!home) {
      home = towns[0];
      let best = 1e9;
      towns.forEach(function (t) {
        const s = `${h.id}|${t.id}`;
        let hash = 0;
        for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 9973;
        if (hash < best) {
          best = hash;
          home = t;
        }
      });
    }
    state.heroSites[h.id] = home.id;
  });
}

/** 该城酒馆里今天有谁 */
function offersAt(state, site) {
  resolveHeroSites(state);
  const hired = (state.player.heroes || []).map(function (x) { return x.id; });
  return HEROES.filter(function (h) {
    return state.heroSites[h.id] === site.id && hired.indexOf(h.id) < 0;
  });
}

function heroById(id) {
  for (let i = 0; i < HEROES.length; i++) if (HEROES[i].id === id) return HEROES[i];
  return null;
}

/** 酒馆自传：本人的经历，而不是“谁帐下”的旧履历 */
function storyOf(id) {
  return heroStory(id) || (heroById(id) || {}).bio || '';
}

function hireHero(state, site, heroId) {
  resolveHeroSites(state);
  const def = heroById(heroId);
  if (!def) return { ok: false, msg: '没有这个人' };
  if (state.heroSites[heroId] !== site.id) return { ok: false, msg: '他不在这个城' };
  state.player.heroes = state.player.heroes || [];
  if (state.player.heroes.length >= heroCap(state)) {
    return { ok: false, msg: '随行名额满了（' + heroCap(state) + ' 位），声望再高点才能多带人' };
  }
  if (state.player.heroes.some(function (x) { return x.id === heroId; })) {
    return { ok: false, msg: '他已经在你队里了' };
  }
  if (state.player.gold < def.cost) return { ok: false, msg: '金钱不够，他要 ' + def.cost };
  state.player.gold -= def.cost;
  state.player.heroes.push({ id: heroId, level: 1, exp: 0, kills: 0 });
  return { ok: true, msg: def.name + ' 加入了你的队伍' };
}

/**
 * 队伍加成：每人一样长处，随等级放大（1 级 ×0.68，10 级 ×1.4）
 * 返回的百分比直接喂给战斗、行军、口粮、缴获
 */
function heroBonus(state) {
  const list = state.player.heroes || [];
  const out = {
    atkPct: 0, defPct: 0, speedPct: 0, foodPct: 0, lootPct: 0, morale: 0, count: list.length,
  };
  list.forEach(function (h) {
    const b = HERO_BONUS[h.id];
    if (!b) return;
    const k = 0.6 + (h.level || 1) * 0.08;
    if (b.atk) out.atkPct += b.atk * k;
    if (b.def) out.defPct += b.def * k;
    if (b.speed) out.speedPct += b.speed * k;
    if (b.food) out.foodPct += b.food * k;
    if (b.loot) out.lootPct += b.loot * k;
    if (b.morale) out.morale += b.morale * (0.5 + (h.level || 1) * 0.05);
  });
  out.atkPct = Math.min(0.45, out.atkPct);
  out.defPct = Math.min(0.4, out.defPct);
  out.speedPct = Math.min(0.3, out.speedPct);
  out.foodPct = Math.min(0.35, out.foodPct);
  out.lootPct = Math.min(0.5, out.lootPct);
  out.morale = Math.min(8, Math.round(out.morale));
  return out;
}

/** 这位英雄现在给的是什么加成（给队伍页和对话页演示） */
function bonusOf(heroId, level) {
  const b = HERO_BONUS[heroId];
  if (!b) return { text: '没什么特别的', label: '' };
  const k = 0.6 + (level || 1) * 0.08;
  const parts = [];
  if (b.atk) parts.push('攻击 +' + (b.atk * k * 100).toFixed(1) + '%');
  if (b.def) parts.push('防御 +' + (b.def * k * 100).toFixed(1) + '%');
  if (b.speed) parts.push('行军 +' + (b.speed * k * 100).toFixed(0) + '%');
  if (b.food) parts.push('日耗 -' + (b.food * k * 100).toFixed(0) + '%');
  if (b.loot) parts.push('缴获 +' + (b.loot * k * 100).toFixed(0) + '%');
  if (b.morale) parts.push('士气 +' + Math.round(b.morale * (0.5 + (level || 1) * 0.05)) + '/日');
  return { text: parts.join(' · '), label: b.label || '' };
}

/** 请他走：回原来的城，日后还能在酒馆碰见 */
function dismissHero(state, heroId) {
  const list = state.player.heroes || [];
  const idx = list.map(function (x) { return x.id; }).indexOf(heroId);
  if (idx < 0) return { ok: false, msg: '他不在队里' };
  const def = heroById(heroId) || {};
  list.splice(idx, 1);
  return { ok: true, msg: def.name + ' 抱了抱拳，往' + (def.site ? '旧地' : '北边') + '去了。' };
}

function gainHeroExp(state, exp) {
  const list = state.player.heroes || [];
  if (!list.length) return [];
  const ups = [];
  list.forEach(function (h) {
    if (h.level >= HERO_MAX_LEVEL) {
      h.exp = Math.min(h.exp + exp, HERO_MAX_LEVEL * EXP_PER_LEVEL);
      return;
    }
    h.exp += exp;
    while (h.level < HERO_MAX_LEVEL && h.exp >= h.level * EXP_PER_LEVEL) {
      h.exp -= h.level * EXP_PER_LEVEL;
      h.level += 1;
      ups.push({ hero: heroById(h.id), level: h.level });
    }
  });
  return ups;
}

function heroPower(state) {
  let sum = 0;
  (state.player.heroes || []).forEach(function (h) { sum += (h.level || 1) * 4; });
  return sum;
}

module.exports = {
  EXP_PER_LEVEL,
  HERO_CAP_MAX,
  resolveHeroSites,
  offersAt,
  heroById,
  storyOf,
  heroCap,
  hireHero,
  heroBonus,
  bonusOf,
  dismissHero,
  gainHeroExp,
  heroPower,
};

  };

  /* js/core/war.js */
  __defs[15] = function (module, exports, __require) {
/**
 * 国战：势力之间的宣战、领主野战、俘虏与逃脱。
 *
 * 规则（按用户要的骑砍味）：
 *  - 两个势力宣战后，双方所有领主互为敌人，在大地图上撞上就开打；
 *  - 除了主线要点名的那几位，谁都不会被领主杀掉：败的一方溃逃或者被俘；
 *  - 俘虏押在城里，可以被人攻破城池救出，也可能自己跑掉；
 *  - 逃脱概率起初几乎为零，关一天涨一点。
 */

const { FACTIONS } = __require(5);
const { TROOPS } = __require(10);
const army = __require(9);

const ESCAPE_BASE = 0.008;   // 第一天：0.8% + 1.4% ≈ 2.2%
const ESCAPE_STEP = 0.014;
const ESCAPE_CAP = 0.62;
const MIN_WAR_DAYS = 25;

function key(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

// 开局已经撕破脸的那几对，都有出处
const SEED_WARS = [
  ['wei', 'yuan'],    // 官渡：曹操与袁绍
  ['wei', 'lv'],      // 兖州：曹操与吕布
  ['wei', 'shu'],     // 徐州：曹操与刘备
  ['wei', 'ma'],      // 关中：曹操与马腾
  ['wu', 'biao'],     // 江夏：孙坚死于黄祖箭下
  ['wu', 'wei'],      // 赤壁前的水路
  ['yuan', 'lv'],     // 袁绍与吕布，翻脸比结盟快
  ['yuan', 'xianbei'],// 北境
  ['ma', 'han'],      // 西凉内斗：马腾与韩遂
  ['zhang', 'shu'],   // 刘璋拒刘备入蜀
];

function pushLogSafe() {
  // 由 state 注入，避免循环 require
}

let logFn = pushLogSafe;

function bindLogger(fn) {
  logFn = fn || pushLogSafe;
}

function init(state) {
  if (!state.factionWars || typeof state.factionWars !== 'object') state.factionWars = {};
  const m = state.factionWars;
  if (!state.diplomacySeeded) {
    SEED_WARS.forEach(function (pair) {
      const k = key(pair[0], pair[1]);
      if (!m[k]) m[k] = { since: state.clock ? state.clock.day : 1, score: 0 };
    });
    state.diplomacySeeded = true;
  }
  if (!state.prisoners) state.prisoners = [];
  return m;
}

function atWar(state, a, b) {
  if (!a || !b || a === b) return false;
  if (a === 'bandit' || b === 'bandit') return true;
  if (!FACTIONS[a] || !FACTIONS[b]) return false;
  if (a === 'player' && state.wars && state.wars[b]) return true;
  if (b === 'player' && state.wars && state.wars[a]) return true;
  const m = state.factionWars || init(state);
  return !!m[key(a, b)];
}

function warPartners(state, f) {
  const m = state.factionWars || {};
  const out = [];
  Object.keys(m).forEach(function (k) {
    const parts = k.split('|');
    if (parts[0] === f) out.push(parts[1]);
    else if (parts[1] === f) out.push(parts[0]);
  });
  return out;
}

function declare(state, a, b, quiet) {
  if (!FACTIONS[a] || !FACTIONS[b] || a === b) return false;
  if (a === 'bandit' || b === 'bandit') return false;
  const m = state.factionWars || init(state);
  if (m[key(a, b)]) return false;
  m[key(a, b)] = { since: state.clock.day, score: 0 };
  if (!quiet) {
    logFn(state, FACTIONS[a].full + '与' + FACTIONS[b].full + '翻了脸，使者连夜出境，边关开始点烽火。', 'war');
    // 剧情序章走完以后，天下大事要让人看见；几息后自己散
    if (state.campaign && state.campaign.stage >= 1) {
      state.events.push({
        type: 'diplomacy', kind: 'war', a: a, b: b,
        title: '战云再起', lines: [
          FACTIONS[a].full + '与' + FACTIONS[b].full + '正式宣战。',
          '两家的使者连夜出境，边关烽火一处接一处点亮。',
          '天下这盘棋，又有人先掀了桌子。',
        ],
      });
    }
  }
  return true;
}

function makePeace(state, a, b, quiet) {
  // 斩了君主就是不死不休：这对玩家与那一家永远没有议和这一页
  const forever = state.noPeaceForever || {};
  if ((a === 'player' && forever[b]) || (b === 'player' && forever[a])) return false;
  const m = state.factionWars || {};
  const k = key(a, b);
  if (!m[k]) {
    // 旧档的玩家战争只记在 state.wars 里；这里补一条收兵通道
    if (a === 'player' && state.wars && state.wars[b]) {
      state.wars[b] = false;
      state.relations[b] = 0;
      return true;
    }
    if (b === 'player' && state.wars && state.wars[a]) {
      state.wars[a] = false;
      state.relations[a] = 0;
      return true;
    }
    return false;
  }
  // 阵前杀过人家的人：一个月内谈不成；满一个月才允许翻过这一页
  if (state.noPeace && (state.noPeace[a] || state.noPeace[b])) {
    const day = state.killRecords && state.killRecords[a] !== undefined
      ? state.killRecords[a] : (state.killRecords && state.killRecords[b]);
    if (day === undefined || state.clock.day - day < 30) return false;
  }
  delete m[k];
  // 与玩家议和：旧账一笔勾销，关系回到零（不论谁先提的）
  if (a === 'player' && FACTIONS[b]) {
    state.relations[b] = 0;
    if (state.wars) state.wars[b] = false;
  } else if (b === 'player' && FACTIONS[a]) {
    state.relations[a] = 0;
    if (state.wars) state.wars[a] = false;
  }
  if (!quiet) {
    logFn(state, FACTIONS[a].full + '与' + FACTIONS[b].full + '遣使议和，两家把刀收回鞘里，边界的鼓角停了一阵。', 'war');
    if (state.campaign && state.campaign.stage >= 1) {
      state.events.push({
        type: 'diplomacy', kind: 'peace', a: a, b: b,
        title: '两家议和', lines: [
          FACTIONS[a].full + '与' + FACTIONS[b].full + '暂时收兵。',
          '边关的鼓角停了一阵，商队又开始过境。',
          '至于这纸和约能压住多久，没人敢说。',
        ],
      });
    }
  }
  return true;
}

/** AI 能不能替这两家宣战：玩家所在的国不替玩家乱开战，玩家自己也不被 AI 拖下水 */
function aiCanDeclare(state, a, b) {
  if (!a || !b || a === b) return false;
  if (a === 'bandit' || b === 'bandit' || a === 'player' || b === 'player') return false;
  const pf = state && state.player ? state.player.faction : null;
  if (pf && pf !== 'player' && (a === pf || b === pf)) return false;
  return true;
}

/** 每日外交：随机宣战、随机议和。打的年头太久会自己收手。 */
function diplomacyTick(state) {
  const m = state.factionWars || init(state);
  const rng = state.rng;
  const ids = Object.keys(FACTIONS).filter(function (id) { return id !== 'bandit' && id !== 'player'; });

  // 新仇：天下不太平，隔三差五就有人翻脸
  if (rng.next() < 0.2) {
    const a = ids[rng.int(0, ids.length - 1)];
    const b = ids[rng.int(0, ids.length - 1)];
    if (a !== b && aiCanDeclare(state, a, b) && !atWar(state, a, b) && warPartners(state, a).length < 3) {
      declare(state, a, b, false);
    }
  }

  // 议和：打得久了，两边都缺粮
  const keys = Object.keys(m);
  keys.forEach(function (k) {
    const w = m[k];
    if (!w) return;
    const days = state.clock.day - (w.since || 1);
    if (days > MIN_WAR_DAYS && rng.next() < 0.03) {
      const parts = k.split('|');
      makePeace(state, parts[0], parts[1], false);
    }
  });
}

/** 敌国主动向玩家求和：开战满 30 天才可能发；杀过对方将领则要等 60 天。
 * 每天一次概率判定，同一势力两次求和至少隔 7 天。 */
const PEACE_OFFER_MIN_WAR = 30;
const PEACE_OFFER_MIN_KILL = 60;
const PEACE_OFFER_CHANCE = 0.08;
const PEACE_OFFER_GAP = 7;

function peaceOfferTick(state) {
  if (!state || state.peaceOfferPending) return false;
  const rng = state.rng;
  const now = state.clock.day;
  const ids = Object.keys(FACTIONS).filter(function (id) {
    return id !== 'bandit' && id !== 'player';
  });
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!atWar(state, 'player', id)) continue;
    if ((state.factionState[id] || {}).dead) continue;
    if (state.noPeaceForever && state.noPeaceForever[id]) continue;
    const w = (state.factionWars || {})[key('player', id)];
    const since = (w && w.since) ||
      (state.playerWarSince && state.playerWarSince[id]) || now;
    const warDays = now - since;
    if (warDays < PEACE_OFFER_MIN_WAR) continue;
    const killDay = state.killRecords && state.killRecords[id];
    if (killDay !== undefined && now - killDay < PEACE_OFFER_MIN_KILL) continue;
    const cool = state.peaceOfferCooldown && state.peaceOfferCooldown[id];
    if (cool && now < cool) continue;
    if (rng.next() >= PEACE_OFFER_CHANCE) continue;

    state.peaceOfferPending = id;
    state.peaceOfferCooldown = state.peaceOfferCooldown || {};
    state.peaceOfferCooldown[id] = now + PEACE_OFFER_GAP;
    state.events.push({
      type: 'peace-offer',
      factionId: id,
      title: '议和使者',
      lines: [
        FACTIONS[id].full + '的使者来到帐前，说两家再打下去只会让旁人捡便宜。',
        '他愿意把此前的旧账一笔勾销，只求你把围城的兵撤回去。',
        '接受议和，可得一支天机简；不接受，使者即刻就走。',
      ],
    });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------ 战斗 */

function weight(troops) {
  let sum = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    const w = t ? t.tier * 2 + t.atk / 3 + t.def / 3 : 4;
    sum += (troops[id] || 0) * w;
  });
  return sum;
}

function nearPlayer(state, unit, r) {
  const p = state.player;
  return Math.max(Math.abs(unit.x - p.x), Math.abs(unit.y - p.y)) <= (r || 12);
}

function moveAway(state, lord) {
  // 溃逃：往野地里退两格，别站在战场上等下一轮
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let i = 0; i < 8; i++) {
    const d = dirs[state.rng.int(0, 7)];
    const nx = lord.x + d[0] * 2;
    const ny = lord.y + d[1] * 2;
    if (isPassable && isPassable(state.world, nx, ny)) {
      lord.x = nx;
      lord.y = ny;
      return;
    }
  }
  lord.x = Math.max(1, lord.x - 2);
}

let isPassable = null;
function bindPassable(fn) { isPassable = fn; }

/** 俘虏这位领主，押在 captor 的老家 */
function capture(state, loser, captorFaction, captorName) {
  const homeSite = state.world.sites && state.world.sites.filter(function (s) {
    return captorFaction === 'player'
      ? s.playerOwned
      : (s.ownerFaction === captorFaction && s.type !== 'camp' && s.type !== 'village');
  })[0];
  const siteId = homeSite ? homeSite.id : loser.home;
  loser.alive = false;
  loser.chasing = false;
  loser.order = null;
  loser.defending = null;
  loser.prisoner = {
    by: captorFaction,
    byName: captorName || '',
    siteId: siteId,
    since: state.clock.day,
    days: 0,
  };
  loser.troops = {};
  if (!state.prisoners) state.prisoners = [];
  state.prisoners.push({ lordId: loser.id, by: captorFaction, byName: captorName || '', siteId: siteId, since: state.clock.day, days: 0 });
  const site = state.world.sites.filter(function (s) { return s.id === siteId; })[0];
  const place = site ? site.name : '城里';
  logFn(state,
    (captorName ? captorName + '的部曲' : '对方') + '把' + loser.name + '从马上拽下来捆了，押进' + place + '的牢里。',
    'war');
  return true;
}

function takeSome(base, n) {
  const out = {};
  let put = 0;
  Object.keys(base || {}).forEach(function (id) {
    if (put >= n) return;
    const take = Math.min(base[id], n - put);
    if (take > 0) { out[id] = take; put += take; }
  });
  return out;
}

function freeLord(state, lord, why) {
  const home = state.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  lord.alive = true;
  lord.prisoner = null;
  lord.order = null;
  lord.defending = null;
  lord.x = home ? home.x : lord.x;
  lord.y = home ? home.y : lord.y;
  const keep = Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.45));
  lord.troops = takeSome(lord.defTroops, keep);
  lord.respawnDay = 0;
  lord.scuffle = 8;
  if (why) logFn(state, why, 'war');
  return lord;
}

function clearEngagement(a, b) {
  if (a) a.engagedWith = null;
  if (b) b.engagedWith = null;
}

/**
 * 两位领主在路上撞上：不是碰一下就散，而是原地列阵打一场大的。
 * 每 3 小时结算一轮，双方都成片掉人；打崩之后败方大概率溃逃，
 * 小概率被俘。交战期间双方都停住不动。
 */
function clash(state, a, b) {
  const wa = weight(a.troops);
  const wb = weight(b.troops);
  if (wa <= 0 || wb <= 0) return null;
  const share = wa / (wa + wb);
  const totalA = army.troopCount(a.troops);
  const totalB = army.troopCount(b.troops);

  a.engagedWith = b.id;
  b.engagedWith = a.id;
  a.scuffle = 0;
  b.scuffle = 0;

  // 大规模交战：主力和主力正面压上，每轮掉 6%~24%。
  const lossA = Math.max(1, Math.round(totalA * (0.06 + (1 - share) * 0.16)));
  const lossB = Math.max(1, Math.round(totalB * (0.06 + share * 0.16)));
  army.distributeLosses(a.troops, lossA);
  army.distributeLosses(b.troops, lossB);

  const remainA = army.troopCount(a.troops);
  const remainB = army.troopCount(b.troops);
  const winner = share >= 0.5 ? a : b;
  const loser = share >= 0.5 ? b : a;
  const winnerRemain = share >= 0.5 ? remainA : remainB;
  const loserRemain = share >= 0.5 ? remainB : remainA;

  const near = nearPlayer(state, winner, 10);

  // 一边被打空了，或者阵线被打穿：被俘 / 溃逃
  const broken = loserRemain <= 0 || loserRemain < 6 ||
    (loserRemain / Math.max(1, winnerRemain)) < 0.28;
  if (!broken) {
    // 还在打：双方都不走，地图上显示交战。
    if (near) logFn(state, a.name + '与' + b.name + '在野地里列阵相攻，双方都不退，阵线上又倒下一片。', 'war');
    return { engaged: true };
  }

  clearEngagement(a, b);
  const rng = state.rng;
  // 乱世里保住人比保住脸重要：打散之后大概率还能跑，极少真被捆走。
  const flee = rng.next() < 0.82;
  if (flee) {
    loser.alive = true;
    loser.chasing = false;
    moveAway(state, loser);
    loser.scuffle = 10;
    if (near) logFn(state, loser.name + '的阵线先散，带着残兵往野地里跑了，' + winner.name + '也没有死追。', 'war');
    return { flee: true };
  }

  capture(state, loser, winner.faction, winner.name);
  if (near) logFn(state, loser.name + '被' + winner.name + '的部曲围住，当场捆了。', 'war');
  return { capture: true };
}

/** 每 NPC 步：所有毗邻的敌对领主互殴；已经缠上的就继续打，不重新找目标 */
function fieldTick(state) {
  if (!state.factionWars) init(state);
  const list = state.lords.filter(function (l) { return l.alive; });
  const seen = {};
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    // 和匪团缠在一起时由 state 的 fightNeighbors 接管，别在这里抢
    if (a.engagedWith && String(a.engagedWith).indexOf('party:') === 0) continue;
    if (a.engagedWith) {
      const b = list.filter(function (l) { return l.id === a.engagedWith; })[0];
      if (!b || !b.alive || Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1 ||
          a.faction === b.faction || !atWar(state, a.faction, b.faction)) {
        a.engagedWith = null;
        continue;
      }
      const pairKey = [a.id, b.id].sort().join('|');
      if (seen[pairKey]) continue;
      seen[pairKey] = true;
      clash(state, a, b);
      count += 1;
      if (count > 3) return count;
      continue;
    }
    if (a.scuffle && a.scuffle > 0) { a.scuffle -= 1; continue; }
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || !b.troops || b.engagedWith) continue;
      if (b.scuffle && b.scuffle > 0) continue;
      if (Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1) continue;
      if (a.faction === b.faction) continue;
      if (a.faction === 'bandit' && b.faction === 'bandit') continue;
      if (!atWar(state, a.faction, b.faction)) continue;
      const pairKey = [a.id, b.id].sort().join('|');
      if (seen[pairKey]) continue;
      seen[pairKey] = true;
      clash(state, a, b);
      count += 1;
      if (count > 3) return count;
    }
  }
  return count;
}

/* ------------------------------------------------------------ 俘虏 */

function listPrisoners(state) {
  return (state.prisoners || []).filter(function (p) { return p; });
}

function findByLord(state, lordId) {
  return (state.prisoners || []).filter(function (p) { return p.lordId === lordId; })[0];
}

/** 每日：关得越久，越容易自己跑掉 */
function prisonerTick(state) {
  if (!state.prisoners) state.prisoners = [];
  const rng = state.rng;
  state.prisoners.forEach(function (p) {
    p.days = (p.days || 0) + 1;
    const lord = state.lords.filter(function (l) { return l.id === p.lordId; })[0];
    if (!lord) return;
    const chance = Math.min(ESCAPE_CAP, ESCAPE_BASE + ESCAPE_STEP * p.days);
    if (rng.next() < chance) {
      p.escaped = true;
      freeLord(state, lord, lord.name + '在牢里关到第 ' + p.days + ' 天，趁换岗摸出城，回营聚残部去了。');
    }
  });
  state.prisoners = state.prisoners.filter(function (p) { return !p.escaped; });
}

/** 城破时：牢门大开，被这家关着的人都跑出来 */
function onSiteTaken(state, site, oldFaction) {
  if (!state.prisoners || !state.prisoners.length) return 0;
  const freed = state.prisoners.filter(function (p) {
    if (p.by === 'player') return false;
    if (p.siteId && p.siteId === site.id) return true;
    return oldFaction && p.by === oldFaction;
  });
  freed.forEach(function (p) {
    const lord = state.lords.filter(function (l) { return l.id === p.lordId; })[0];
    if (lord) {
      freeLord(state, lord, null);
      p.escaped = true;
    }
  });
  state.prisoners = state.prisoners.filter(function (p) { return !p.escaped; });
  if (freed.length) {
    const names = freed.map(function (p) {
      const l = state.lords.filter(function (x) { return x.id === p.lordId; })[0];
      return l ? l.name : '';
    }).filter(Boolean).slice(0, 3).join('、');
    logFn(state, site.name + '城破，牢门大开。' + names + (freed.length > 3 ? '等人' : '') + '趁乱脱身，各回各家。', 'war');
  }
  return freed.length;
}

/**
 * 玩家在野战里打赢一位领主。
 * 这里不掷“杀/俘/逃”的骰子：人已经被按在阵前，等玩家在战果页选放走还是押进牢里。
 * 真正的斩将只在牢房页发生。
 */
function playerDefeatsLord(state, lord) {
  const home = state.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  lord.alive = false;
  lord.chasing = false;
  lord.order = null;
  lord.defending = null;
  lord.troops = {};
  lord.prisoner = null;
  lord.inCity = null;
  lord.respawnDay = 0;
  if (home) {
    lord.x = home.x;
    lord.y = home.y;
  }
  state.postBattleLord = {
    lordId: lord.id,
    name: lord.name,
    faction: lord.faction,
    title: lord.title || '领主',
    arcEnemy: !!lord.arcEnemy,
    arcNoCapture: !!lord.arcNoCapture,
  };
  return { pending: true, lordId: lord.id };
}

/** 阵前杀将：这个势力从此跟你没得谈 */
function killLord(state, lord) {
  const fac = lord.faction;
  lord.alive = false;
  lord.chasing = false;
  lord.order = null;
  lord.defending = null;
  lord.dead = true;
  lord.retired = false;
  lord.troops = {};
  lord.prisoner = null;
  lord.inCity = null;
  lord.respawnDay = 0;
  state.noPeace = state.noPeace || {};
  state.killRecords = state.killRecords || {};
  if (fac && FACTIONS[fac]) {
    state.noPeace[fac] = true;
    state.killRecords[fac] = state.clock.day;
    state.relations[fac] = -100;
    if (FACTIONS[fac].lord === lord.name) {
      state.noPeaceForever = state.noPeaceForever || {};
      state.noPeaceForever[fac] = true;
    }
    declare(state, 'player', fac, true);
    // 他的旧部也要记这一笔
    state.lords.forEach(function (l) {
      if (l === lord || !l.alive || l.faction !== fac) return;
      l.fury = (l.fury || 0) + 1;
    });
  }
  if (state.prisoners) {
    state.prisoners = state.prisoners.filter(function (p) { return p.lordId !== lord.id; });
  }
  logFn(state, lord.name + '被你在阵前斩了。消息传出去，' +
    (FACTIONS[fac] ? FACTIONS[fac].full : '那家') + '的人把刀都磨了一遍——这笔账，没人会替你翻过去。', 'war');
  return { killed: true, name: lord.name, faction: fac };
}

/** 玩家眼下靠什么立身：有主 / 自立 / 连旗都没有 */
function playerStanding(state) {
  const p = state.player;
  const owned = state.world.sites.filter(function (s) { return s.playerOwned; }).length;
  if (p.faction && p.faction !== 'player' && FACTIONS[p.faction]) {
    return { mode: 'vassal', faction: p.faction, owned: owned };
  }
  if (owned > 0) return { mode: 'self', faction: 'player', owned: owned };
  return { mode: 'none', faction: null, owned: 0 };
}

/**
 * 招降一位领主的成功率。UI 和真正掷骰都走这一处，避免两套算法。
 * 无旗：直接 0；自立：城越多越像样；有主：看名声与旧主关系。
 */
function recruitChance(state, lord) {
  if (!lord) return { chance: 0, mode: 'none', reason: '查无此人' };
  if (lord.arcNoRecruit) {
    return { chance: 0, mode: 'arc', reason: '天下皆反时，除了从你队伍里出去的旧部，没有人会再听你的话。' };
  }
  const from = lord.faction;
  const isRuler = !!(FACTIONS[from] && FACTIONS[from].lord === lord.name);
  const factionDead = !!(state.factionState && state.factionState[from] && state.factionState[from].dead);
  // 国还没亡时君主不降；国亡了，他也只是一个没了旗的人，可以谈
  if (isRuler && !factionDead) {
    return { chance: 0, mode: 'ruler', reason: lord.name + '是一方之主，只要他的国还在，就不会替别人扛旗。' };
  }
  const standing = playerStanding(state);
  if (standing.mode === 'none') {
    return {
      chance: 0, mode: 'none', owned: 0,
      reason: '你连一面旗都没有，他凭什么把身家押在你身上？',
    };
  }
  const p = state.player;
  const rel = (state.relations[from] || 0) / 100;
  let chance;
  if (standing.mode === 'self') {
    // 自立：刚占一座城，人家基本不认；连下几城，才有郡国之主的模样
    chance = 0.08 + Math.min(0.55, standing.owned * 0.075) + Math.min(0.12, (p.renown || 0) / 5000);
    chance += rel * 0.10;
    if (state.noPeace && state.noPeace[from]) chance -= 0.15;
    if (isRuler) chance = Math.max(0.12, chance * 0.7);
    chance = Math.max(0.04, Math.min(0.76, chance));
  } else {
    // 有主：替主上收人，名声 + 两家关系
    chance = 0.2 + Math.min(0.35, (p.renown || 0) / 1600);
    chance += rel * 0.25;
    if (state.noPeace && state.noPeace[from]) chance -= 0.25;
    if (isRuler) chance = Math.max(0.12, chance * 0.7);
    chance = Math.max(0.08, Math.min(0.8, chance));
  }
  return {
    chance: chance,
    mode: standing.mode,
    owned: standing.owned,
    target: standing.faction,
    isRuler: isRuler,
    reason: isRuler ? '他曾经是一方之主，如今国没了。想让他低头，得拿出足够分量的旗。' : '',
  };
}

function percent(chance) {
  return Math.round(chance * 100) + '%';
}

/** 招降：有主就替主上收人，自立就收成自己的领主 */
function recruitLord(state, lordId) {
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '没这个人' };
  if (lord.dead) return { ok: false, msg: '人已经死了' };
  const p = state.player;
  const isPrisoner = !!(lord.prisoner && lord.prisoner.by === 'player') ||
    (state.prisoners || []).some(function (x) { return x.lordId === lordId && x.by === 'player'; });
  if (!isPrisoner && lord.alive && lord.faction === (p.faction || 'player')) {
    return { ok: false, msg: '他已经在你的旗下了' };
  }
  const from = lord.faction;
  const offer = recruitChance(state, lord);
  if (offer.mode === 'ruler') return { ok: false, msg: offer.reason };
  if (offer.mode === 'none') return { ok: false, msg: offer.reason };
  // 招降不是连点抽奖：第一次开口后，要等三天才能再谈
  const cool = lord.recruitCoolDay || 0;
  if (state.clock.day < cool) {
    return {
      ok: false,
      cooldown: true,
      waitDays: cool - state.clock.day,
      msg: lord.name + '把脸转开：“话你已经说过了。让我静几天。”',
    };
  }
  // 不论成不成，这次开口都进入冷却
  lord.recruitCoolDay = state.clock.day + 3;
  if (state.rng.next() > offer.chance) {
    if (offer.mode === 'self') {
      return {
        ok: false,
        msg: lord.name + '扫了一眼你的营盘：“' + offer.owned + '座城就想让我改换门庭？等你的旗能遮住半个州再说。”',
        chance: offer.chance,
      };
    }
    return {
      ok: false,
      msg: lord.name + '把脸转开：“我吃的是' + (FACTIONS[from] ? FACTIONS[from].full : '旧主') + '的粮。”',
      chance: offer.chance,
    };
  }

  // 有主：替自己的君主收人；自立：收成自己的领主
  const target = offer.target || (p.faction && FACTIONS[p.faction] ? p.faction : 'player');
  if (state.prisoners) {
    state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  }
  lord.prisoner = null;
  lord.dead = false;
  lord.alive = true;
  lord.faction = target;
  lord.chasing = false;
  lord.resting = false;
  lord.order = null;
  lord.ransom = 0;
  const home = state.world.sites.filter(function (s) {
    return target === 'player' ? s.playerOwned : (s.ownerFaction === target && s.type !== 'camp' && s.type !== 'village');
  })[0] || state.world.sites.filter(function (s) { return s.playerOwned; })[0];
  if (home) {
    lord.home = home.id;
    lord.x = home.x;
    lord.y = home.y;
  }
  lord.troops = takeSome(lord.defTroops, Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.5)));
  p.renown += 25;
  if (target === 'player') {
    declare(state, 'player', from, true);
  }
  logFn(state, lord.name + '拜了下去：“' + (target === 'player' ? '愿跟着你' : '愿为' + FACTIONS[target].full + '效命') + '。”', 'recruit');
  return {
    ok: true,
    msg: lord.name + '归降了（声望 +25）',
    lordId: lord.id,
    faction: target,
  };
}

/** 收赎金放人 */
function ransom(state, lordId, amount) {
  const p = (state.prisoners || []).filter(function (x) { return x.lordId === lordId; })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  const gold = amount || p.ransom || 120;
  state.player.gold += gold;
  p.escaped = true;
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  freeLord(state, lord, null);
  logFn(state, lord.name + '的家人凑了 ' + gold + ' 金钱把人赎走。你数钱的时候，他没有回头。', 'war');
  return { ok: true, msg: '收到赎金 ' + gold + ' 金钱，放走了' + lord.name, gold: gold };
}

/** 白放人：换人情 */
function release(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) { return x.lordId === lordId; })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  p.escaped = true;
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  freeLord(state, lord, null);
  state.player.renown += 12;
  if (lord.faction && FACTIONS[lord.faction]) {
    state.relations[lord.faction] = Math.min(100, (state.relations[lord.faction] || 0) + 14);
  }
  logFn(state, '你把' + lord.name + '放回马下，还给了他一把刀。他抱拳说了句"来日必报"，打马走了。', 'war');
  return { ok: true, msg: '放了' + lord.name + '，声望 +12，' + (FACTIONS[lord.faction] ? FACTIONS[lord.faction].name : '') + '对你和气了些' };
}

/* ------------------------------------------------------------ 领主国战 AI */

const RALLY_DAYS_MIN = 4;
const RALLY_DAYS_MAX = 12;
const SIEGE_MIN_DAYS = 3;
const SIEGE_EXTRA_DAYS = 4;
const SIEGE_COOLDOWN = 30;   // 攻下一城后，这一对国家一个月内不能再动兵
const HOLD_DAYS = 7;         // 攻下后留下守城
const FAIL_COOLDOWN = 30;   // 没打下来，这一对也得一个月后重整旗鼓

// 主线要用的城、玩家起家的城，不参与 AI 换旗：诸侯可以打，别把剧情打穿
const PROTECTED_SITES = {
  chenliu: true, xuchang: true, ye: true, jianye: true, chengdu: true,
  xiangyang: true, xiapi: true, luoyang: true, changan: true, guandu: true,
  hanzhong: true, jiangling: true, xiakou: true, chaisang: true, wujun: true,
  kuaiji: true, pingyuan: true, puyang: true, shouchun: true, chibi: true, yiling: true,
};

function siteById(state, id) {
  return state.world.sites.filter(function (s) { return s.id === id; })[0] || null;
}

function initAI(state) {
  if (!state.warCampaigns || typeof state.warCampaigns !== 'object') state.warCampaigns = {};
  if (!state.siegeCooldown || typeof state.siegeCooldown !== 'object') state.siegeCooldown = {};
}

function ownedSites(state, faction, townsOnly) {
  return state.world.sites.filter(function (s) {
    return s.ownerFaction === faction && !s.playerOwned && s.type !== 'camp' &&
      (!townsOnly || s.type === 'town' || s.type === 'castle');
  });
}

function factionLords(state, faction) {
  return state.lords.filter(function (l) {
    return l.alive && !l.dead && !l.prisoner && !l.hidden && l.faction === faction;
  });
}

function siteDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function nearestSiteOf(state, list, site) {
  let best = null;
  let bestD = Infinity;
  list.forEach(function (s) {
    const d = siteDistance(s, site);
    if (d < bestD) { bestD = d; best = s; }
  });
  return { site: best, distance: bestD };
}

function clearOrder(lord) {
  if (!lord) return;
  lord.order = null;
  lord.defending = null;
}

function giveOrder(lord, type, siteId, hold) {
  lord.order = { type: type, siteId: siteId, hold: !!hold, since: (lord.order && lord.order.since) || 0 };
  lord.chasing = false;
  lord.foeChasing = null;
  lord.banditChasing = null;
}

function pairBlocked(state, a, b, day) {
  return (state.siegeCooldown[key(a, b)] || 0) > day;
}

/** 一个国家一次只打一处：挑最近的敌城，在自己最靠前的城里集结 */
function planCampaign(state, faction, day) {
  const foes = warPartners(state, faction).filter(function (id) {
    return FACTIONS[id] && id !== 'player' && id !== 'bandit' && !(state.factionState[id] || {}).dead;
  });
  if (!foes.length) return null;
  const own = ownedSites(state, faction, true);
  if (own.length < 2) return null;

  const lords = factionLords(state, faction).filter(function (l) {
    return army.troopCount(l.troops || {}) >= 12 && !l.defending;
  });
  if (lords.length < 2) return null;

  let target = null;
  foes.forEach(function (enemy) {
    if (pairBlocked(state, faction, enemy, day)) return;
    ownedSites(state, enemy, true).forEach(function (s) {
      if (s.playerOwned || PROTECTED_SITES[s.id]) return;
      const near = nearestSiteOf(state, own, s);
      const score = near.distance * 0.6 + s.garrison * 0.35 + state.rng.int(0, 18);
      if (!target || score < target.score) target = { site: s, score: score, distance: near.distance };
    });
  });
  if (!target) return null;
  if (target.distance > 46) return null; // 隔着半个天下的远征先不打

  const nearestOwn = nearestSiteOf(state, own, target.site).site;
  // 集结地：既靠前线，也别把所有人从后方抽空
  let rally = nearestOwn;
  own.forEach(function (s) {
    if (s === nearestOwn) return;
    const toTarget = siteDistance(s, target.site);
    if (toTarget < siteDistance(rally, target.site) - 3 && s.garrison >= 55) rally = s;
  });

  const chosen = lords.slice().sort(function (a, b) {
    return siteDistance(a, rally) - siteDistance(b, rally);
  }).slice(0, Math.min(5, lords.length));
  if (chosen.length < 2) return null;

  const avgDist = chosen.reduce(function (sum, l) {
    return sum + siteDistance(l, rally);
  }, 0) / chosen.length;
  const rallyDays = Math.max(RALLY_DAYS_MIN, Math.min(RALLY_DAYS_MAX,
    RALLY_DAYS_MIN + state.rng.int(0, 3) + Math.round(avgDist / 7)));

  const cp = {
    faction: faction,
    enemy: target.site.ownerFaction,
    targetId: target.site.id,
    rallyId: rally.id,
    stage: 'rally',
    startDay: day,
    rallyUntil: day + rallyDays,
    marchStart: 0,
    siegeStart: 0,
    siegeUntil: 0,
    holdUntil: 0,
    attackerIds: chosen.map(function (l) { return l.id; }),
    defenderIds: [],
    arrivedIds: [],
    done: false,
  };
  chosen.forEach(function (l) {
    giveOrder(l, 'rally', rally.id, true);
    l.order.since = day;
    l.order.campaign = faction;
  });
  state.warCampaigns[faction] = cp;
  logFn(state,
    '【' + FACTIONS[faction].name + '】在' + rally.name + '集结 ' + chosen.length +
    ' 路人马，粮车向北，鼓声一路传到' + target.site.name + '。', 'muster');
  return cp;
}

function attackersOf(state, cp) {
  return cp.attackerIds.map(function (id) {
    return state.lords.filter(function (l) { return l.id === id; })[0];
  }).filter(function (l) { return l && l.alive && !l.prisoner; });
}

function startSiege(state, cp, site, day) {
  if (!site || site.ownerFaction !== cp.enemy) { cp.done = true; return false; }
  cp.stage = 'siege';
  cp.siegeStart = day;
  cp.siegeUntil = day + Math.max(SIEGE_MIN_DAYS, SIEGE_MIN_DAYS + state.rng.int(0, SIEGE_EXTRA_DAYS) +
    (site.garrison > 110 ? 1 : 0));
  const attackers = attackersOf(state, cp);
  attackers.forEach(function (l) { giveOrder(l, 'siege', site.id, true); });

  // 围城一起，守方的领主就收到烽火：能来的都往这座城赶
  const defenders = factionLords(state, site.ownerFaction)
    .filter(function (l) { return army.troopCount(l.troops || {}) >= 8; })
    .sort(function (a, b) { return siteDistance(a, site) - siteDistance(b, site); })
    .slice(0, 4);
  cp.defenderIds = defenders.map(function (l) { return l.id; });
  cp.arrivedIds = [];
  defenders.forEach(function (l) {
    giveOrder(l, 'defend', site.id, true);
    l.defending = site.id;
    l.order.campaign = cp.faction;
  });
  logFn(state,
    '【' + FACTIONS[cp.faction].name + '】的 ' + attackers.length + ' 路领主围住' + site.name +
    '，营寨一圈圈扎到城下。守军闭门，烽火向' + FACTIONS[site.ownerFaction].name + '各地求援。',
    'siege');
  return true;
}

function resolveSiege(state, cp, day) {
  const site = siteById(state, cp.targetId);
  if (!site) { cp.done = true; return; }
  if (site.ownerFaction !== cp.enemy) {
    // 城在围城期间被别人拿了：这趟作罢
    cp.done = true;
    attackersOf(state, cp).forEach(clearOrder);
    return;
  }
  const attackers = attackersOf(state, cp).filter(function (l) {
    return siteDistance(l, site) <= 2;
  });
  let attackPower = 0;
  attackers.forEach(function (l) { attackPower += weight(l.troops); });
  let defendPower = site.garrison * 6.2;
  cp.defenderIds.forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l || !l.alive || l.prisoner) return;
    if (siteDistance(l, site) <= 2) {
      defendPower += weight(l.troops);
      if (cp.arrivedIds.indexOf(id) < 0) cp.arrivedIds.push(id);
    }
  });
  attackPower *= 0.9 + state.rng.next() * 0.25;
  defendPower *= 0.9 + state.rng.next() * 0.25;

  if (attackPower > defendPower * 1.06) {
    const oldOwner = site.ownerFaction;
    const oldName = FACTIONS[oldOwner] ? FACTIONS[oldOwner].full : oldOwner;
    site.ownerFaction = cp.faction;
    site.faction = cp.faction;
    site.playerOwned = false;
    // 夺城后由攻方领兵者接管；没有在场领主就等本势力最近的人来接
    site.lordId = null;
    const newFiefLord = attackers.filter(function (l) { return l && l.alive && !l.prisoner; })[0]
      || state.lords.filter(function (l) { return l.alive && l.faction === cp.faction; })[0];
    if (newFiefLord) site.lordId = newFiefLord.id;
    site.garrison = Math.max(28, Math.round(site.garrisonBase * 0.45));
    site.garrisonBase = site.garrison;
    site.color = FACTIONS[cp.faction] ? FACTIONS[cp.faction].color : site.color;
    site.banner = FACTIONS[cp.faction] ? FACTIONS[cp.faction].banner : site.banner;
    onSiteTaken(state, site, oldOwner);
    state.siegeCooldown[key(cp.faction, oldOwner)] = day + SIEGE_COOLDOWN;
    cp.stage = 'hold';
    cp.holdUntil = day + HOLD_DAYS;
    cp.capturedSiteId = site.id;
    cp.holdSiteId = site.id;
    attackers.forEach(function (l) {
      giveOrder(l, 'hold', site.id, true);
      l.order.since = day;
    });
    // 丢了城的领主先收兵，回各自剩下的城
    cp.defenderIds.forEach(function (id) {
      const l = state.lords.filter(function (x) { return x.id === id; })[0];
      if (!l) return;
      clearOrder(l);
      const home = nearestSiteOf(state, ownedSites(state, l.faction, true), site).site;
      if (home) { l.home = home.id; }
    });
    logFn(state,
      site.name + '城头换了旗。' + FACTIONS[cp.faction].full + '从' + oldName +
      '手里夺下这座城，' + (oldName || '旧主') + '的残部退往野地。', 'siege');
    return;
  }

  // 没攻下来：攻方折一阵，退回集结地；守方也只算惨胜
  attackers.forEach(function (l) {
    army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.24)));
    clearOrder(l);
  });
  site.garrison = Math.max(18, site.garrison - Math.round(site.garrison * 0.22));
  cp.defenderIds.forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    clearOrder(l);
    if (l.troops) army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.12)));
  });
  state.siegeCooldown[key(cp.faction, cp.enemy)] = day + FAIL_COOLDOWN;
  cp.done = true;
  logFn(state,
    '围城到第 ' + Math.max(SIEGE_MIN_DAYS, day - cp.siegeStart) + ' 天，' + site.name +
    '城下还是没破。' + FACTIONS[cp.faction].name + '收兵回营，城头守军也折了一半。', 'siege');
}

/** 每天一次：给各国诸侯做战略决策 */
function strategyTick(state) {
  initAI(state);
  const day = state.clock.day;
  const playerFaction = state.player && state.player.faction;
  Object.keys(FACTIONS).forEach(function (faction) {
    if (faction === 'player' || faction === 'bandit') return;
    // 玩家效忠的国不再自作主张开拔、围城；要打由玩家自己下命
    if (playerFaction && playerFaction !== 'player' && faction === playerFaction) return;
    if ((state.factionState[faction] || {}).dead) {
      const cp = state.warCampaigns[faction];
      if (cp) {
        attackersOf(state, cp).forEach(clearOrder);
        delete state.warCampaigns[faction];
      }
      return;
    }
    const cp = state.warCampaigns[faction];
    if (!cp) {
      // 天下同时最多三场大战，其余势力仍在路上巡逻、互相寻仇
      const active = Object.keys(state.warCampaigns).filter(function (f) {
        return state.warCampaigns[f] && !state.warCampaigns[f].done;
      }).length;
      if (active < 3) planCampaign(state, faction, day);
      return;
    }
    if (cp.done) {
      attackersOf(state, cp).forEach(clearOrder);
      cp.defenderIds.forEach(function (id) {
        const l = state.lords.filter(function (x) { return x.id === id; })[0];
        if (l) clearOrder(l);
      });
      delete state.warCampaigns[faction];
      return;
    }
    const target = siteById(state, cp.targetId);
    if (!target) { cp.done = true; return; }
    const attackers = attackersOf(state, cp);
    if (attackers.length < 2 && cp.stage !== 'siege') { cp.done = true; return; }

    if (cp.stage === 'rally') {
      const ready = attackers.filter(function (l) {
        return siteDistance(l, siteById(state, cp.rallyId) || target) <= 2;
      }).length;
      if (day >= cp.rallyUntil) {
        if (ready < 2 && day < cp.rallyUntil + 4) return;
        if (ready < 2) {
          cp.done = true;
          logFn(state, '【' + FACTIONS[faction].name + '】的集结没凑齐人，队伍在半路散了。', 'siege');
          return;
        }
        cp.stage = 'march';
        cp.marchStart = day;
        attackers.forEach(function (l) { giveOrder(l, 'march', cp.targetId, false); });
        logFn(state, '【' + FACTIONS[faction].name + '】的 ' + attackers.length + ' 路人马从' +
          (siteById(state, cp.rallyId) || target).name + '开拔，兵锋指向' + target.name + '。', 'muster');
      }
      return;
    }

    if (cp.stage === 'march') {
      if (day - cp.marchStart > 26) {
        cp.done = true;
        logFn(state, '【' + FACTIONS[faction].name + '】去' + target.name + '的路太长，粮尽退兵。', 'siege');
        return;
      }
      const near = attackers.some(function (l) { return siteDistance(l, target) <= 1; });
      if (near) startSiege(state, cp, target, day);
      return;
    }

    if (cp.stage === 'siege') {
      // 围城每天都要死人：箭、疫病、夜袭，谁也跑不掉
      attackers.forEach(function (l) {
        if (l.troops) army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.035)));
      });
      target.garrison = Math.max(8, target.garrison - Math.round(target.garrison * 0.055));
      cp.defenderIds.forEach(function (id) {
        const l = state.lords.filter(function (x) { return x.id === id; })[0];
        if (!l || !l.alive || l.prisoner) return;
        if (siteDistance(l, target) <= 2 && cp.arrivedIds.indexOf(id) < 0) {
          cp.arrivedIds.push(id);
          logFn(state, '【' + FACTIONS[l.faction].name + '】的' + l.name + '赶到' + target.name +
            '城下，守军士气振了一下。', 'siege');
        }
      });
      if (day >= cp.siegeUntil) resolveSiege(state, cp, day);
      return;
    }

    if (cp.stage === 'hold') {
      if (day >= cp.holdUntil) {
        cp.done = true;
        attackersOf(state, cp).forEach(clearOrder);
        logFn(state, FACTIONS[faction].name + '在' + (siteById(state, cp.holdSiteId) || target).name +
          '留了一支守军，主力回营。', 'siege');
      }
    }
  });
}

/** 每个 NPC 步补一次：走到城下的队伍不必等第二天才围城 */
function siegeTick(state) {
  initAI(state);
  Object.keys(state.warCampaigns).forEach(function (faction) {
    const cp = state.warCampaigns[faction];
    if (!cp || cp.stage !== 'march') return;
    const target = siteById(state, cp.targetId);
    if (!target || target.ownerFaction !== cp.enemy) return;
    const near = attackersOf(state, cp).some(function (l) {
      return siteDistance(l, target) <= 1;
    });
    if (near) startSiege(state, cp, target, state.clock.day);
  });
}

/** 视野里最近的死敌领主（宣战势力） */
function nearestFoe(state, lord, range) {
  const r = range || 5;
  let best = null;
  let bestD = r + 1;
  state.lords.forEach(function (o) {
    if (o === lord || !o.alive || !o.troops) return;
    if (o.faction === lord.faction) return;
    if (o.faction === 'bandit' || lord.faction === 'bandit') return;
    if (!atWar(state, lord.faction, o.faction)) return;
    const d = Math.max(Math.abs(o.x - lord.x), Math.abs(o.y - lord.y));
    if (d < bestD) { bestD = d; best = o; }
  });
  return best;
}

function summaryLines(state) {
  const m = state.factionWars || {};
  const lines = [];
  Object.keys(m).forEach(function (k) {
    const parts = k.split('|');
    const days = state.clock.day - (m[k].since || 1);
    lines.push({ a: parts[0], b: parts[1], days: days });
  });
  return lines;
}

module.exports = {
  init, atWar, declare, makePeace, diplomacyTick, peaceOfferTick,
  aiCanDeclare,
  fieldTick, clash, capture, freeLord, prisonerTick, onSiteTaken, playerDefeatsLord,
  killLord, recruitLord, recruitChance, playerStanding,
  ransom, release, listPrisoners, summaryLines, warPartners, bindLogger, bindPassable, weight,
  nearestFoe,
  strategyTick, siegeTick,
  ESCAPE_BASE, ESCAPE_STEP,
};


  };

  /* js/core/battle.js */
  __defs[16] = function (module, exports, __require) {
/**
 * 战斗层：回合制战术结算 + 天机简
 * 玩家选战术，回合自动推进，双方同时结算，低阶兵先倒。
 * 天机简可在战中写一笔，改一次规则（风向 / 风止 / 名册）。
 */

const { TROOPS } = __require(10);
const { troopCount, strength, distributeLosses } = __require(9);

const TACTICS = {
  assault: {
    id: 'assault', name: '全军冲锋', atk: 1.28, def: 0.85,
    desc: '攻击 +28%，防御 -15%。骑兵越多越赚。',
  },
  hold: {
    id: 'hold', name: '结阵固守', atk: 0.9, def: 1.35,
    desc: '防御 +35%。枪盾多时能顶住骑兵。',
  },
  flank: {
    id: 'flank', name: '骑兵包抄', atk: 1.1, def: 1.0,
    desc: '骑兵超过 12% 时，攻击额外 +35%。',
  },
  skirmish: {
    id: 'skirmish', name: '弓弩先射', atk: 1.15, def: 0.95,
    desc: '远程超过 15% 时，开局多一轮齐射。',
  },
};

const TACTIC_LIST = ['assault', 'hold', 'flank', 'skirmish'];
/** 每 12 轮为一“阵”。一阵打完不分胜负就继续下一阵，直到一方兵力归零。 */
const MAX_ROUNDS = 12;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function moraleFactor(morale) {
  const m = clamp(typeof morale === 'number' ? morale : 60, 0, 100);
  const base = 0.75 + (m / 100) * 0.35;
  return m < 30 ? base * 0.8 : base;
}

function makeSide(unit) {
  const troops = {};
  Object.keys(unit.troops || {}).forEach(function (id) {
    const c = unit.troops[id] || 0;
    if (c > 0) troops[id] = c;
  });
  return {
    name: unit.name || '无名之师',
    faction: unit.faction || null,
    troops,
    morale: typeof unit.morale === 'number' ? unit.morale : 60,
    atkPct: unit.atkPct || 0,
    defPct: unit.defPct || 0,
    isPlayer: !!unit.isPlayer,
    initialTroops: JSON.parse(JSON.stringify(troops)),
    initialCount: troopCount(troops),
  };
}

function offenseOf(side, st, tactic) {
  let atk = st.atk * moraleFactor(side.morale) * tactic.atk * (1 + side.atkPct);
  if (tactic.id === 'flank') atk *= st.cavRatio > 0.12 ? 1.35 : 1.05;
  if (tactic.id === 'assault') atk *= 1 + st.cavRatio * 0.3;
  if (tactic.id === 'skirmish' && st.rangedRatio > 0.15) atk *= 1.12;
  if (st.fireRatio > 0.1) atk *= 1.08;
  return atk;
}

function defenseOf(side, st, tactic, enemySt) {
  let def = st.def * moraleFactor(side.morale) * tactic.def * (1 + side.defPct);
  if (st.spearRatio > 0.18 && enemySt.cavRatio > 0.15) def *= 1.3;
  return def;
}

/**
 * 每回合伤亡比例。
 * 防守权重给得高（3.2）：甲厚、结阵的一方几乎不掉人，输的一方才会被碾。
 * minLoss 传 0 时，弱势一方可能整轮无伤亡（仗就不会打成磨盘）。
 */
function lossOfAttacker(defenderAtk, attackerDef, attackerCount, rng, minLoss) {
  const ratio = defenderAtk / (defenderAtk + attackerDef * 3.2);
  const base = clamp(Math.pow(Math.min(1.2, ratio), 1.9) * 0.56, 0.02, 0.3);
  const jitter = 0.9 + rng.random() * 0.2;
  const n = Math.round(attackerCount * base * jitter);
  return Math.max(minLoss === undefined ? 1 : minLoss, n);
}

function lossText(troops, losses) {
  const parts = [];
  Object.keys(losses).forEach(function (id) {
    const t = TROOPS[id];
    parts.push((t ? t.name : id) + '-' + losses[id]);
  });
  return parts.length ? parts.join(' ') : '无伤亡';
}

class Battle {
  constructor(opts) {
    this.rng = opts.rng;
    this.a = makeSide(opts.attacker);
    this.b = makeSide(opts.defender);
    this.aTactic = opts.aTactic && TACTICS[opts.aTactic] ? opts.aTactic : 'assault';
    this.bTactic = opts.bTactic && TACTICS[opts.bTactic] ? opts.bTactic : 'assault';
    this.context = opts.context || {};
    this.round = 0;
    this.roundsInBatch = 0;
    this.batch = 1;
    this.batchDone = false;
    this.log = [];
    this.finished = false;
    this.result = null;
    this.lossesA = {};
    this.lossesB = {};
    this.retreated = false;
    this.fireGround = false;
    this.shiMark = null;
    this.shiRounds = 0;
    this.shiName = '';
  }

  tacticOf(side) {
    return TACTICS[side === 'a' ? this.aTactic : this.bTactic] || TACTICS.assault;
  }

  setTactic(id) {
    if (!TACTICS[id]) return false;
    this.aTactic = id;
    return true;
  }

  remainA() {
    return troopCount(this.a.troops);
  }

  remainB() {
    return troopCount(this.b.troops);
  }

  /** 写一笔天机简 */
  applyShiMark(id) {
    this.shiMark = id;
    this.shiName = id === 'wind' ? '南风起' : id === 'calm' ? '风止' : '名册';
    if (id === 'calm') this.shiRounds = 3;
    if (id === 'wind') this.fireGround = true;
  }

  /** 推进一个回合 */
  step() {
    if (this.finished || this.batchDone) return null;
    this.round += 1;
    this.roundsInBatch += 1;
    this.batch = Math.ceil(this.round / MAX_ROUNDS);

    const sa = strength(this.a.troops);
    const sb = strength(this.b.troops);

    if (sa.count <= 0 || sb.count <= 0) {
      this.finish(sa.count <= 0 && sb.count <= 0 ? 'draw' : sa.count > 0 ? 'win' : 'lose');
      return null;
    }

    const tacticA = this.tacticOf('a');
    const tacticB = this.tacticOf('b');
    let atkA = offenseOf(this.a, sa, tacticA);
    let defA = defenseOf(this.a, sa, tacticA, sb);
    let atkB = offenseOf(this.b, sb, tacticB);
    let defB = defenseOf(this.b, sb, tacticB, sa);

    // 弩破甲：忽略一部分敌方甲
    if (sa.pierceRatio > 0.12) defB *= 0.82;
    if (sb.pierceRatio > 0.12) defA *= 0.82;

    // 天机简效果：只利己，不反噬
    if (this.shiMark === 'wind') {
      atkA *= 1.90;
      if (this.fireGround) atkA *= 1.50;
    }
    if (this.shiMark === 'calm' && this.shiRounds > 0) {
      // 风止只压敌军：玩家在 a 时削 b，玩家在 b 时削 a。自己的攻势不受影响。
      if (this.a.isPlayer) atkB *= 0.30;
      else if (this.b.isPlayer) atkA *= 0.30;
      this.shiRounds -= 1;
    }

    // 火攻战：带火船/火计的兵种威力翻倍的一部分
    if (this.fireGround && sa.fireRatio > 0.05) atkA *= 1.15;

    // 弓弩首轮齐射
    let alphaStrike = 0;
    if (this.round === 1 && tacticA.id === 'skirmish' && sa.rangedRatio > 0.15) {
      alphaStrike = Math.round(sb.count * 0.06 + sa.ranged * 0.5);
    }

    // 主将亲自带的人更经打：玩家侧伤亡打六折，但每轮至少折 1 人。
    // 不能出现“敌方每轮必掉 1、我方可以永远 0”的磨盘，否则再弱的敌人也会被拖死。
    let lossA = lossOfAttacker(atkB, defA, sa.count, this.rng, 1);
    if (this.a.isPlayer) lossA = Math.max(1, Math.round(lossA * 0.45));
    const lossB = lossOfAttacker(atkA, defB, sb.count, this.rng, 1) + alphaStrike;

    const realA = distributeLosses(this.a.troops, lossA);
    const realB = distributeLosses(this.b.troops, Math.max(1, lossB));

    const self = this;
    Object.keys(realA).forEach(function (id) {
      self.lossesA[id] = (self.lossesA[id] || 0) + realA[id];
    });
    Object.keys(realB).forEach(function (id) {
      self.lossesB[id] = (self.lossesB[id] || 0) + realB[id];
    });

    const entry = {
      round: this.round,
      aLossText: lossText(this.a.troops, realA),
      bLossText: lossText(this.b.troops, realB),
      remainA: this.remainA(),
      remainB: this.remainB(),
      alphaStrike,
    };
    this.log.push(entry);

    // 不再因为“剩得少”就提前溃败：只有真正打光一方，才算这一仗结束。
    // 12 轮只是“一阵”，一阵结束双方还有人就继续下一阵；中途不结算、不判胜。
    if (this.remainA() <= 0 || this.remainB() <= 0) {
      if (this.remainA() <= 0 && this.remainB() <= 0) this.finish('draw');
      else if (this.remainB() <= 0) this.finish('win');
      else this.finish('lose');
    } else if (this.roundsInBatch >= MAX_ROUNDS) {
      this.batchDone = true;
    }

    return entry;
  }

  /** 一阵打完还活着双方：开下一阵 12 轮 */
  nextBatch() {
    if (this.finished) return false;
    if (!this.batchDone) return false;
    this.batchDone = false;
    this.roundsInBatch = 0;
    return true;
  }

  finish(result) {
    // 哪怕是碾压，也总有几个人倒在阵前：胜仗至少记一笔零星伤亡
    if (this.a.isPlayer && result === 'win') {
      const lost = this.a.initialCount - this.remainA();
      if (lost <= 0 && this.a.initialCount >= 6) {
        const real = distributeLosses(this.a.troops, 1);
        const self = this;
        Object.keys(real).forEach(function (id) {
          self.lossesA[id] = (self.lossesA[id] || 0) + real[id];
        });
        this.log.push({
          round: this.round,
          aLossText: lossText(this.a.troops, real),
          bLossText: '无伤亡',
          remainA: this.remainA(),
          remainB: this.remainB(),
          alphaStrike: 0,
        });
      }
    }
    this.finished = true;
    this.batchDone = false;
    this.result = result;
  }

  retreat() {
    if (this.finished) return this.result;
    // 殿后留一成，不再一刀砍掉四分之一
    const extra = Math.max(1, Math.round(this.remainA() * 0.1));
    const real = distributeLosses(this.a.troops, extra);
    const self = this;
    Object.keys(real).forEach(function (id) {
      self.lossesA[id] = (self.lossesA[id] || 0) + real[id];
    });
    this.retreated = true;
    this.finish('retreat');
    return 'retreat';
  }

  loot() {
    // 没打到一方归零，就没有“缴获”这回事；中途一阵结束绝不结算金额。
    if (!this.finished || this.result !== 'win') return 0;
    const ctx = this.context || {};
    // 打匪团来钱快（新手要靠这个滚雪球），攻城与战役另算
    const kindMul = ctx.kind === 'party' || ctx.kind === 'chase' ? 1.9
      : ctx.kind === 'lord' ? 2.1
      : ctx.kind === 'siege' ? 1.5
      : ctx.kind === 'campaign' ? 2.4 : 1.2;
    const tierMul = ctx.tier ? 1 + (ctx.tier - 1) * 0.35 : 1;
    let base = 0;
    const self = this;
    Object.keys(this.b.initialTroops).forEach(function (id) {
      const t = TROOPS[id];
      const unit = t && t.recruit ? t.recruit : t ? Math.max(16, t.tier * 12) : 16;
      base += unit * 0.7 * self.b.initialTroops[id];
    });
    return Math.max(120, Math.round(base * kindMul * tierMul * (0.75 + this.rng.random() * 0.4)));
  }

  summary() {
    return {
      result: this.result,
      finished: this.finished,
      round: this.round,
      rounds: this.round,
      batch: this.batch,
      remainA: this.remainA(),
      remainB: this.remainB(),
      initialA: this.a.initialCount,
      initialB: this.b.initialCount,
      lossesA: this.lossesA,
      lossesB: this.lossesB,
      loot: this.loot(),
      shiMark: this.shiMark,
      shiName: this.shiName,
    };
  }

  /** 一阵 12 轮结束、双方仍有兵：只报战况，不报缴获 */
  interimSummary() {
    return {
      result: null,
      finished: false,
      interim: true,
      round: this.round,
      rounds: this.round,
      batch: this.batch,
      remainA: this.remainA(),
      remainB: this.remainB(),
      initialA: this.a.initialCount,
      initialB: this.b.initialCount,
      lossesA: this.lossesA,
      lossesB: this.lossesB,
      loot: 0,
    };
  }
}

module.exports = { Battle, TACTICS, TACTIC_LIST, moraleFactor };


  };

  /* js/data/bios.js */
  __defs[17] = function (module, exports, __require) {
/**
 * 领主生平：按史实写，一人三四句，讲清来处、功业、下场。
 * 史书只留一行的人（吕旷、吕翔之类），就照实写"记载极少"，不硬编。
 */

const LORD_BIOS = {
  /* ------------------------------------------------------------ 魏 */
  caocao: '沛国谯县人，字孟德，父亲曹嵩是中常侍曹腾的养子。二十岁举孝廉，做洛阳北部尉时用五色棒打死蹇硕的叔父，从此有了名声。黄巾起事，他做骑都尉，随皇甫嵩、朱儁平乱，收青州降卒三十余万编为青州兵。建安元年迎汉献帝到许都，屯田积谷，官渡破袁绍，北征乌桓，赤壁却折在长江上。后来封魏公、魏王，终生没有称帝，建安二十五年死在洛阳。',

  xiahou: '沛国谯人，字元让，曹操的同族兄弟。曹操起兵，他常做先锋，讨董卓时被流矢射伤左目——后世演义把这写成"拔矢啖睛"，正史只记伤目。守兖州时曾被吕布部将擒住当人质，靠部将韩浩不肯投鼠忌器才捡回一条命。曹丕即位拜他为大将军，几个月后就病故。他为人俭省，有余财就散给部下，军中叫他"盲夏侯"，他听见了会不高兴。',

  zhangliao: '雁门马邑人，本姓聂，为避仇家改姓张。少年做郡吏，先后跟过丁原、何进、董卓、吕布，吕布败亡后归曹操。合肥一战，他带八百步卒冲孙权十万大军，一路杀到孙权麾盖之下，几乎把人捉住，江东从此拿他的名字吓小孩。黄初三年病死在江都。',

  caoren: '沛国谯人，字子孝，曹操的从弟。好弓马，从曹操起兵，常督骑军。赤壁之后守江陵，被周瑜围了一年多才退。关羽水淹七军威震华夏，他守樊城，水到城头仍不退，硬撑到徐晃援军到。曹丕时为大将军，黄初四年病故。',

  xiahouyuan: '沛国谯人，字妙才，夏侯惇的族弟。早年替曹操顶过一桩死罪，曹操把他捞了出来。长于奔袭，军中说他"三日五百，六日一千"，关右一带全靠他镇。建安二十四年守汉中，在定军山被黄忠居高临下一冲，战死阵中。',

  xuhuang: '河东杨县人，字公明。本为杨奉部将，后归曹操。治军令行禁止，营中不闻喧哗，扎营必先立标记，进退有法。官渡焚袁绍粮车，渭南破马超，襄樊解樊城之围，曹操亲迎七里，赞他"有周亚夫之风"。太和年间病故。',

  zhanghe: '河间鄚人，字儁乂。先从韩馥，再归袁绍，官渡时被郭图逼得降曹。曹操得他大喜，说"昔子胥不早寤，自使身危"，比作微子去殷、韩信归汉。街亭一战断水源破马谡，蜀军由此退。太和五年追击蜀军，中箭死于木门道。',

  xuchu: '沛国谯人，字仲康。少年聚乡党筑坞自守，曾一手拽牛尾倒行百余步，淮汝一带都怕他。归曹操后为宿卫，官渡时有人谋刺曹操，他守在帐外不离。曹操死时他哭到吐血。明帝时封牟乡侯，不久病故。',

  litong: '江夏平春人，字文达。汉末聚众于朗陵，不肯从袁绍，一心归曹操。官渡时守汝南，拒刘表、袁绍的招降，斩其使者。后从征荆州，死于途中，年四十二。曹操为他流涕，追赠官爵。',

  /* ------------------------------------------------------------ 蜀 */
  liubei: '涿郡涿县人，字玄德，汉景帝之子中山靖王刘胜的后代。少年丧父，与母亲贩鞋织席为生。黄巾起，与关羽、张飞结伙从军；此后投公孙瓒、陶谦、吕布、曹操、袁绍、刘表，半生寄人篱下。三顾茅庐请出诸葛亮，赤壁之后取荆南四郡，再入蜀取益州，建安二十四年自称汉中王，章武元年称帝。次年夷陵败于陆逊，退到白帝城，病死在永安宫。',

  guanyu: '河东解县人，字云长，本字长生。亡命到涿郡，遇上刘备，从此相随。白马之战于万众中刺颜良，封汉寿亭侯，曹操厚待仍归旧主。镇守荆州多年，水淹七军擒于禁、斩庞德，威震华夏；随后被吕蒙白衣渡江抄了后路，失荆州，败走麦城，被擒杀。首级送到洛阳，曹操以诸侯之礼葬了他。',

  zhangfei: '涿郡人，字益德，与刘备同乡。长坂坡率二十骑据水断桥，横矛大喝，曹军不敢近身。入蜀时义释严颜，巴西之战大破张郃。性情暴烈，常鞭打士卒，章武元年被部下张达、范强所杀，二人提着他的头投了吴。',

  zhaoyun: '常山真定人，字子龙。初从公孙瓒，后归刘备。长坂坡怀抱刘禅、护着甘夫人脱险，是他在乱军里最有名的一战。入蜀定益州，汉水以空营退曹军，营门大开而鼓角不鸣。诸葛亮第一次北伐，他与邓芝在箕谷做疑兵，失利后亲自断后，兵将不失。建兴七年病故。',

  huangzhong: '南阳人，字汉升。先事刘表为中郎将，守长沙；曹操取荆州后仍留任原职。刘备定荆南，他归了刘备，入蜀常为先锋，屡先登陷阵。定军山一役斩夏侯渊，迁征西将军。建安二十五年病故，年约七十余。',

  weiyan: '义阳人，字文长。以部曲随刘备入蜀，数有战功，迁牙门将军。刘备称汉中王，众人以为会派张飞守汉中，他却破格用了魏延。诸葛亮北伐，他几次请求带奇兵出子午谷直取长安，亮不许，他常以为恨。诸葛亮死后与杨仪争权，兵散，被马岱追上斩了，夷三族。',

  chendao: '汝南人，字叔至。自豫州起就跟着刘备，名位常在赵云之下，统领白毦兵——那是刘备帐下最精锐的亲军。夷陵败后留守永安，诸葛亮说他手下"白毦"是西方上兵。官至征西将军、永安都督。',

  liufeng: '长沙人，本为罗侯寇氏之子，刘备养为子。入蜀时战有功，与孟达共守上庸。关羽围樊城求援，他以上庸初定、山郡未附为由不肯出兵，关羽败死，刘备由此恨他。诸葛亮虑他刚猛难制，劝刘备及早除去，遂赐死。',

  mizhu: '东海朐人，字子仲，祖上世代经商，家资钜万。陶谦死后，他与陈登共迎刘备领徐州；刘备被吕布击败，他倾家财助军，还把妹妹嫁给刘备。入蜀后为安汉将军，班位在诸葛亮之上，却不掌兵权。后来弟弟糜芳降吴，他自缚请罪，刘备宽慰他，他仍惭愧发病而死。',

  /* ------------------------------------------------------------ 吴 */
  sunquan: '吴郡富春人，字仲谋，孙坚次子。十五岁做阳羡长，跟着兄长孙策征战。孙策遇刺，他十九岁接下江东，用周瑜、张昭，先稳内部再图外。赤壁联刘备破曹操，后来夺荆州、杀关羽，夷陵再败刘备。黄武元年称吴王，黄龙元年称帝。晚年太子之争，二宫构隙，朝臣分党，国势自此转衰。',

  zhouyu: '庐江舒人，字公瑾。与孙策同岁，自小结交，助他平定江东。孙策死后与张昭共辅孙权，赤壁一战用火攻烧了曹操的连环船，又取南郡。议取益州未及成行，建安十五年病死在巴丘，年三十六。他精于音律，宴上乐工有错，他总要回头看一眼，人说"曲有误，周郎顾"。',

  taishici: '东莱黄人，字子义。少为郡吏，为报郡守知遇，单骑突围把奏章送进洛阳。后投刘繇，神亭岭与孙策恶斗一场，两人互相佩服。刘繇败后归孙策，任建昌都尉，替江东挡刘表的兵。孙权时督南方诸军，建安十一年病故，年四十一。',

  ganning: '巴郡临江人，字兴霸。少年做"锦帆贼"，用锦缎系船，腰悬铜铃，人听铃声就知道他来了。后来读书投黄祖，三年不得重用，转投孙权。献计破黄祖，濡须口率百骑夜劫曹营，回来一兵不折。他性粗暴好杀，却也轻财敬士。夷陵之战前病卒。',

  lvmeng: '汝南富陂人，字子明。少年未读书，孙权劝他涉猎史书，后来鲁肃与他论事，惊叹"非复吴下阿蒙"。鲁肃死后代守陆口，装病示弱，白衣渡江袭取荆州，擒杀关羽，封孱陵侯。未及受封就病死了，年四十二。',

  luxun: '吴郡吴人，字伯言，本名议。孙权把侄女嫁给他。袭取荆州时与吕蒙配合，堵死关羽退路。夷陵之战，他先退让半年，等蜀军连营七百里、士气已疲，一把火烧了个干净。后任丞相，因太子之事屡谏孙权，被遣使责问，愤恚而死，年六十三。',

  chengpu: '右北平土垠人，字德谋。历事孙坚、孙策、孙权三世，讨黄巾、破董卓、征江夏，江表诸将里他最年长，人称"程公"。赤壁时与周瑜分任左右督，起初不服周瑜年轻，后来叹道"与周公瑾交，若饮醇醪，不觉自醉"。',

  handang: '辽西令支人，字义公。善弓马，膂力过人，从孙坚起就随军征伐。赤壁、夷陵都在军中，官至昭武将军。黄武二年病故，他这一辈子几乎打满了江东所有的仗。',

  /* ------------------------------------------------------------ 袁 */
  yuanshao: '汝南汝阳人，字本初，四世三公之家。少年为郎，有清名，喜欢养士，宾客满门。做渤海太守时起兵讨董卓，被推为盟主，却始终不肯真进兵。后来夺冀州、破公孙瓒，据四州之地，带甲十万。官渡不听田丰、沮授的话，乌巢粮草被烧，一败涂地。建安七年发病呕血而死，儿子们立刻互相攻杀，基业就此散尽。',

  yanliang: '袁绍麾下大将，与文丑并称"河北双雄"。官渡之前攻白马，连斩曹军数将，势头极盛。荀攸献声东击西之计，关羽于万众之中刺他下马，斩首而还，袁军一军夺气。',

  wenchou: '袁绍的骑将，与颜良齐名。延津之战率五六千骑追曹操的辎重队，曹操故意丢下物资，袁军争抢乱阵，被徐晃等回身一击而破。他死在乱军之中，具体死于谁手，史书也没写清。',

  chunyuqiong: '袁绍部将，灵帝时位列西园八校尉之一。官渡时守乌巢粮仓，性好酒，曹操夜袭时他醉卧帐中，醒来已成阶下囚。一说被割去鼻子以示辱，一说为乐进所杀，记载不一。',

  jiangyiqu: '袁绍军中校尉。官渡兵溃，袁绍一路北逃，是蒋义渠在黎阳收拢散卒，把袁绍接回河北。《三国志》里关于他只有这一笔，却也是袁绍能活着回去的关键。',

  guotu: '颍川人，袁绍的谋士。曾劝袁绍迎天子到邺城，袁绍不听；官渡前又力主急攻曹操。兵败之后，他把过错推给张郃，逼得张郃阵前降曹。后来与审配拥立袁谭，兄弟相攻，终于被曹操所杀。',

  lvkuang: '袁尚部将。袁氏兄弟相攻时，他与吕翔一起据守，后降曹操，随军征河北，兵败而走。史书只留下姓名与几次投降，事迹极少。',

  lvxiang: '袁尚部将，与吕旷同进同退，一起降曹，其后事迹不显。两人在史册里几乎只占一行，能确定的只有"袁氏旧将，后归曹操"。',

  /* ------------------------------------------------------------ 刘表 */
  liubiao: '山阳高平人，字景升，汉室宗亲，党锢之祸时名列"八俊"。单骑入荆州，靠蒯良、蒯越、蔡瑁平定江南宗贼，据荆州近二十年，带甲十余万。他好经术、兴学校，却坐观天下，不进不退。曹操北征时他按兵不动，刘备受託付也未能用。建安十三年病故，两个儿子随即被曹操各个击破。',

  caimao: '襄阳蔡氏子弟，刘表的内兄，掌荆州水军。刘表死后，他与张允共立刘琮，劝其降曹。曹操得荆州，任他为水军都督。演义说他在赤壁被蒋干中反间计而斩，那是小说家言；正史只记他降曹后为从事中郎，其后事迹不显。',

  huangzu: '江夏太守，刘表的大将。孙坚攻刘表时，黄祖在岘山设伏，一箭射死了孙坚，江东因此与他结死仇。此后他守江夏多年，屡与孙权水军交战。建安十三年被孙权攻破，城陷被杀。',

  wenpin: '南阳宛人，字仲业。原是刘表的大将，守荆北，曹操南下时他率众归降，曹操说"仲业，真忠臣也"。此后为曹魏守江夏、御关羽，官至后将军。他镇守江夏数十年，吴人不敢轻犯。',

  zhangyun: '刘表部将，掌水军，与蔡瑁共事。刘表死后与蔡瑁同拥刘琮降曹。正史里关于他的笔墨极少，主要是"荆州水军副将，随众归降"一行。',

  wangwei: '荆州牙门将，刘表旧部。刘琮降曹时他劝刘琮抵抗，说"曹操闻将军降，必懈驰"；刘琮不听。荆州既定，他不肯降，史称"威名不损"。事迹止于此，很干净的一位武人。',

  /* ------------------------------------------------------------ 刘璋 */
  liuzhang: '江夏竟陵人，字季玉，刘焉之子。父死后继任益州牧，性宽柔，无威略。与张鲁有杀母之仇，却始终没打过去，只守着剑阁。建安十六年迎刘备入川抵御张鲁，反被刘备回头来攻，围成都一年，出降。曹操把他迁到公安，后为于禁所害。',

  zhangren: '蜀郡人，刘璋的大将。刘备入川，他在涪城宴上劝刘璋杀刘备，刘璋不听。此后他守雒城，一箭射死庞统，硬挡了刘备一年。城破被擒，刘备要他降，他骂不绝口，遂被杀。刘备为他叹息。',

  wuyi: '陈留人，字子远，刘璋的姻亲，掌兵于益州。刘备围成都时他劝刘璋出降，又受刘备之命去说降。蜀汉建立后为关中都督，随诸葛亮北伐，官至车骑将军。他妹妹是刘备的穆皇后，行事却谨慎，不以外戚自居。',

  leitong: '益州旧将，刘璋部下。刘备取蜀时随众归降，后为蜀汉裨将。汉中之战与吴兰同出下辨，被曹洪、曹休击败，战死。史书对他只留下战败与死法。',

  lengbao: '刘璋的裨将，守雒城一带，与张任共抗刘备。正史记载极简，只在雒城之战里出现过名字，兵败后下落不明。',

  liugui: '刘璋部将，守雒城。刘备围雒城近一年，庞统中箭而亡，就是折在这一线。城破之后刘璝被杀，史书记作"璋将刘璝，城破见杀"。',

  /* ------------------------------------------------------------ 鲜卑 */
  kebineng: '鲜卑小种出身，勇健有计略。他先后兼并东部、中部诸部，控弦十万，却不筑城，来去如风。曹操北征乌桓后，他遣使通好；曹丕时封他为附义王。后来魏国边将屡次诱杀鲜卑大人，他遂与魏断交，屡犯边境。青龙三年被刺客所杀。',

  suli: '鲜卑东部大人，与轲比能同时代。东部诸部散在辽西、右北平之外，他一部人马不算多，却常在魏与鲜卑之间来回，时而朝贡，时而掠边。史书留下的印象是"反复无常，然不敢大举"。',

  mijia: '鲜卑部帅，属东部联盟。与素利、阙机等人共分草原，平日里交换马匹、皮货，魏国封他为"归义王"以示笼络。事迹见于《三国志·乌丸鲜卑东夷传》，只有寥寥数行。',

  queji: '鲜卑部帅之一，为轲比能所统诸部中的一支。他与素利、弥加常被并称，草原上的位置靠东，与魏国幽州接壤。史册所载多为朝贡、互市之事。',

  huaitou: '鲜卑小帅。这类小帅各领几百骑，随大人出入，冬天南下打草谷，夏天回漠北放马。史书连他的部众数目都没记，只留下一个名字。',

  pufulu: '代郡大人，鲜卑诸部中靠近代郡的一支首领。代郡地处魏国北边，他与汉人边将时战时和，互市、掠边两件事交替着来。曹操平定北方后，他遣子入质，表示归附。',

  /* ------------------------------------------------------------ 西凉 */
  mateng: '扶风茂陵人，字寿成，马援之后。少年家贫，常从山中伐木负到城里卖。汉末起兵于西凉，与韩遂结为异姓兄弟，后来又互相攻杀。建安十三年入朝为卫尉，家属迁到邺城。建安十七年其子马超起兵反曹，他因此在邺被杀，三族俱灭。',

  machao: '扶风茂陵人，字孟起，马腾之子。勇冠西凉，被羌胡称为"神威天将军"。潼关之战杀得曹操割须弃袍（那是演义夸饰，正史只记曹操"几为所困"）。后为夏侯渊所败，投张鲁，再归刘备，封斄乡侯、骠骑将军。章武二年病故，年四十七。',

  pangde: '南安狟道人，字令明。先从马腾、马超，马超投张鲁时他因病留汉中，随张鲁降曹。襄樊之战随于禁救樊城，汉水暴涨，七军皆没，他独力死战，箭尽被擒，关羽劝降，他骂不绝口而死。曹操为之流涕。',

  maxiu: '马腾之子，马超之弟。随父入朝，官奉车都尉。建安十七年马超起兵，马腾一族在邺被杀，马休同时遇害。',

  matie: '马腾之子，马超的弟弟，官骑都尉。与兄长一同被迁到邺城，马超反曹后被诛，年岁不大。史书对他的记载只有官职与死法。',

  chengyin: '西凉校尉，马腾、马超麾下的关中诸将之一。潼关之战时关中十部俱起，程银是其中一支。兵败后散归陇上，其后事迹不显。',

  /* ------------------------------------------------------------ 汉廷 */
  huangfusong: '安定朝那人，字义真，将门之后。黄巾起，他任左中郎将，与朱儁共破张角，长社一战用火攻大破波才，是平定黄巾的首功。他为人谨慎，不结党，董卓乱政时他手握重兵却不举事，只求自保。后为董卓所囚，几乎被杀。王允诛董卓后任征西将军，不久病故。',

  zhujun: '会稽上虞人，字公伟。黄巾时与皇甫嵩分道进兵，破宛城，封右中郎将。为人好施养士，家无余财。董卓当权，他被留在洛阳做太仆，郁郁不得志。李傕、郭汜乱时发病而死。',

  luzhi: '涿郡涿县人，字子干，刘备少年时的老师。博通古今，为北中郎将讨黄巾，围张角于广宗，因不肯贿赂宦官被诬下狱。后复起为尚书，与董卓力争废立之事，几乎被杀，弃官隐居上谷。袁绍请他做军师，不久病故。他一生清正，门生故吏遍天下。',

  dongcheng: '河间人，汉献帝的舅父，董贵人之父。兴平年间奉车骑将军印。建安四年受献帝衣带密诏，与刘备、种辑等谋诛曹操，事泄，被曹操杀于许都，夷三族，董贵人亦遇害。',

  yangfeng: '白波军旧部，曾与李傕、郭汜交战，护卫献帝东归洛阳。后与曹操争献帝，被曹操击败，投袁术；袁术败后又投吕布，为吕布部将，最终被刘备所杀。一生反复，却也真在乱军里护过天子一回。',

  zhongji: '汉廷越骑校尉，车骑将军董承的同谋。建安四年衣带诏事发，他与董承、吴硕等人一同被曹操处死，并夷三族。史书只留下"与承同谋，皆伏诛"一行。',

  /* ------------------------------------------------------------ 吕布 */
  lvbu: '五原九原人，字奉先。以骁勇闻名并州，初事丁原，被董卓用赤兔马与高官诱去，杀丁原而事董卓；后又与王允合谋诛董卓。此后投袁术、袁绍、张杨，皆不能久处，最终袭取徐州自立。他善骑射，曾在辕门射戟，一箭中戟枝，替刘备解了纪灵之兵。建安三年曹操围下邳，兵败被擒，求刘备说情，刘备一句"明公不见丁建阳、董太师乎"，曹操遂缢死他。',

  gaoshun: '吕布麾下中郎将。为人清白有威严，不饮酒，不受馈赠，所领七百余兵号为"陷阵营"，每攻必破。他屡劝吕布勿轻出、勿听陈宫，吕布都不能用。下邳城破，他与陈宫同被擒，不肯降，与吕布一同被杀。',

  chengong: '东郡武阳人，字公台。少有英名，与海内名士交游，初从曹操，因见曹操诛杀边让等人而离去，转投吕布，为其谋主。他劝吕布以徐州为持久之计，固守而不出战，吕布听妻言未用。下邳破后，曹操问他老母幼子怎么办，他说"请明公处之"，从容就刑。',

  houcheng: '吕布部将，随守下邳。建安三年曹操围城，水淹城郭，他与宋宪、魏续合谋捆了陈宫，开城出降，把旧主卖了干净。此后事迹不显，史册只留"侯成等叛，缚陈宫降"一句。',

  songxian: '吕布部将，西凉旧人。下邳被围，城中人心已散，他与侯成、魏续一同反水，缚陈宫出降。吕布在白门楼上见部下尽叛，才下楼就缚。',

  weixu: '吕布部将，与侯成、宋宪同谋降曹。三人绑了陈宫献城，算是给曹操递了投名状。史书对魏续的记载，几乎只有这一次背叛。',
};

module.exports = { LORD_BIOS };

  };

  /* js/core/state.js */
  __defs[7] = function (module, exports, __require) {
/**
 * 游戏状态层：行军、势力关系、领主 AI、战斗结算、战役链、天机简、存档
 * 渲染层只读 state，不写。
 */

const { RNG } = __require(4);
const {
  createWorld,
  findPath,
  siteById,
  siteAt,
  tileHours,
  addHours,
  gridDistance,
  isPassable,
  regionAt,
} = __require(8);
const army = __require(9);
const economy = __require(11);
const trade = __require(13);
const heroes = __require(14);
const war = __require(15);
const { Battle } = __require(16);
const {
  FACTIONS, FACTION_RULERS, SUCCESSION, RENOWN_TIERS, CAMPAIGN, ENDINGS, EQUIPMENT,
} = __require(5);
const { TROOPS } = __require(10);
const {
  BANDIT_TIERS, BANDIT_NAMES, BANDIT_UNLOCK_STAGE, LORD_TALK, LORD_EXTRA_BIO, FACTION_TALK, VILLAGE_FOOD,
} = __require(12);
const { LORD_BIOS } = __require(17);

const HOUR_SECONDS = 0.26; // 1 游戏小时 = 0.26 真实秒
const NPC_STEP_HOURS = 3;
const LORD_RESPAWN_DAYS = 12;
/** 山寨被清空后的冷却：几天后重新聚人，又可再打一次 */
const CAMP_RESPAWN_DAYS = 3;
const SAVE_VERSION = 5; // 天下放大到 128x154，旧档地图对不上，直接换新

/** 全图常驻匪团目标数量（玩家附近看得见，远处也算） */
const BANDIT_TARGET = 12;
const BANDIT_MAX = 16;

/** 三家与袁绍算大国，投靠要声望 200；其余割据势力算小国，100 即可 */
const MAJOR_FACTIONS = { wei: true, shu: true, wu: true, yuan: true };

function joinRenownReq(factionId) {
  return MAJOR_FACTIONS[factionId] ? 200 : 100;
}

/* ---------------------------------------------------------------- 自立国号 */

// 旗色的中文名，和立国页十二色一一对应；扎营等界面用它，不直接露十六进制
const FLAG_COLOR_NAMES = {
  '#d9a441': '鎏金', '#b4463c': '赤', '#3f6fa8': '靛', '#4f8f5a': '苍',
  '#8c6fae': '紫', '#b06a3c': '赭', '#6a8f8a': '青', '#8f8f86': '灰',
  '#c95a7a': '桃', '#5a7fa0': '蓝', '#7a6a4a': '褐', '#2f6f6a': '墨青',
};

function flagColorName(hex) {
  return FLAG_COLOR_NAMES[String(hex || '').toLowerCase()] || '';
}

/** 新开一局/读档前，把被继任表改过的国名与君主复位，避免上一个存档串味 */
function resetFactionRulers() {
  Object.keys(FACTION_RULERS).forEach(function (id) {
    if (!FACTIONS[id]) return;
    FACTIONS[id].lord = FACTION_RULERS[id].lord;
    FACTIONS[id].full = FACTION_RULERS[id].full;
    if (FACTION_RULERS[id].banner) FACTIONS[id].banner = FACTION_RULERS[id].banner;
  });
}

/** 读档后按存档里的继任者恢复国名；旧档没有这个字段就维持开局名 */
function reconcileFactionRulers(state) {
  if (!state || !state.factionState) return;
  Object.keys(FACTIONS).forEach(function (id) {
    const fs = state.factionState[id];
    if (!fs || !fs.rulerName) return;
    FACTIONS[id].lord = fs.rulerName;
    FACTIONS[id].full = fs.rulerName;
    if (fs.rulerName !== (FACTION_RULERS[id] || {}).lord) {
      FACTIONS[id].banner = fs.rulerName.charAt(0);
    }
  });
}

/** 玩家那面旗在数据里的默认样子：没立国时仍是“你的旗” */
function syncPlayerFaction(country) {
  const f = FACTIONS.player;
  if (!f) return;
  if (country && country.name) {
    f.name = country.name;
    f.full = country.name + '国';
    f.color = country.color || '#d9a441';
    f.banner = country.name;
  } else {
    f.name = '我';
    f.full = '你的旗';
    f.color = '#d9a441';
    f.banner = '我';
  }
}

/** 把国号/旗色铺到所有已占领城与麾下领主：地图、城头、旗块都跟着换 */
function applyPlayerCountry(state) {
  const p = state && state.player;
  if (!p) return;
  syncPlayerFaction(p.country);
  if (!p.country || !p.country.name) return;
  p.faction = 'player';
  state.world.sites.forEach(function (site) {
    if (!site.playerOwned) return;
    site.ownerFaction = 'player';
    site.faction = 'player';
    site.color = p.country.color;
    site.banner = p.country.name;
  });
  // 玩家封出去的家臣，不论当年挂的是谁的旗，自立后都改挂你的国号
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.title !== '你的家臣') return;
    lord.faction = 'player';
  });
}

/** 国号必须是且只能是一个汉字 */
function cleanCountryName(name) {
  const s = String(name === undefined || name === null ? '' : name).trim();
  return /^[\u4e00-\u9fa5]$/.test(s) ? s : null;
}

/** 立国 / 改国号：返回统一结果，UI 只负责选字和选色 */
function foundCountry(state, name, color) {
  const p = state && state.player;
  if (!p) return { ok: false, msg: '还没有自己的队伍' };
  const n = cleanCountryName(name);
  if (!n) return { ok: false, msg: '国号只能取一个汉字' };
  const c = /^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? color : '#d9a441';
  const old = p.country && p.country.name;
  if (!p.country) p.country = { foundedDay: state.clock.day };
  p.country.name = n;
  p.country.color = c;
  p.faction = 'player';
  applyPlayerCountry(state);
  pushLog(state, (old ? '改国号为「' + n + '」' : '你立国号为「' + n + '」') +
    '，旗色换了新的。所有城头与麾下领主都改挂这面旗。', 'throne');
  return {
    ok: true,
    msg: old
      ? '国号「' + n + '」已改，所有城与领主换旗'
      : '国号「' + n + '」已立，所有城与领主换旗',
    name: n,
    color: c,
  };
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function renownTitle(renown) {
  let title = RENOWN_TIERS[0].name;
  RENOWN_TIERS.forEach(function (t) {
    if (renown >= t.at) title = t.name;
  });
  return title;
}

/* ---------------------------------------------------------------- 史册 */

const IMPORTANT_KINDS = {
  war: true, battle: true, siege: true, campaign: true, faction: true,
  recruit: true, death: true, throne: true,
};

const IMPORTANT_WORDS = /城破|亡了|斩了|被俘|俘虏|围城|攻城|攻下|夺城|夺下|归降|称王|立国|建国|宣战|议和|大战|决一死战|战役|改旗|易主|即位|称帝|断粮|粮尽|兵变|哗变/;

/** 史册：全部写进去；太久远的只留重要事，鸡毛蒜皮不占地方 */
function pushLog(state, text, kind) {
  const k = kind || 'life';
  const important = !!IMPORTANT_KINDS[k] || IMPORTANT_WORDS.test(String(text || ''));
  state.log.push({
    day: state.clock.day,
    hour: Math.floor(state.clock.hour),
    text,
    kind: k,
    important: important,
  });
  // 上限 700 条；要挤位置时先丢最旧的琐事，重要的事一律留着
  while (state.log.length > 700) {
    let cut = -1;
    for (let i = 0; i < state.log.length; i += 1) {
      if (!state.log[i].important) { cut = i; break; }
    }
    state.log.splice(cut >= 0 ? cut : 0, 1);
  }
}

/* ---------------------------------------------------------------- 初始化 */

function createGame(opts) {
  resetFactionRulers();
  const seed = (opts && opts.seed) || (Date.now() % 2147483647);
  const rng = new RNG(seed);
  const world = createWorld(seed);

  world.sites.forEach(function (site) {
    let h = 0;
    for (let i = 0; i < site.id.length; i++) h = (h * 31 + site.id.charCodeAt(i)) % 9973;
    site.recruits = {};
    (site.recruitList || []).forEach(function (id) {
      site.recruits[id] = rng.int(1, site.recruitCap || 4);
    });
    // 村市口粮是“村里现有的那点东西”，不是无限货架：每样最多 1-5 份。
    // 用稳定散列，不额外消耗世界随机数，保证同一种子的开局与旧版一致。
    site.foodStock = {};
    if (site.type === 'village') {
      VILLAGE_FOOD.forEach(function (f, i) {
        const cap = f.stockMax || 3;
        site.foodStock[f.id] = 1 + ((h + i * 17) % cap);
      });
    }
    // 领主招兵走另一口锅：和玩家的招募池分开，互不抢人
    site.lordRecruits = {};
    if (site.type === 'town' || site.type === 'castle' || site.type === 'village') {
      const lcap = site.type === 'village' ? 2 : 4;
      (site.recruitList || []).forEach(function (id, i) {
        site.lordRecruits[id] = (h + i * 7) % (lcap + 1);
      });
    }
  });

  // 开局：洛阳东门外，只剩九名溃兵
  const luoyang = siteById(world, 'luoyang');
  const base = luoyang ? { x: luoyang.x + 3, y: luoyang.y + 1 } : { x: 34, y: 38 };
  const spawn = findFreeSpotNear(state0(world), base.x, base.y, 2) || base;

  const player = {
    name: (opts && opts.name) || '无名溃兵',
    flagName: '无旗',
    // 九个人、一点盘缠：够在陈留招到三十人，粮也够撑半个月
    gold: 460,
    food: 150,
    morale: 58,
    renown: 0,
    faction: null,
    // 自立后的国号与旗色：打下第一座城才会立，固定一字
    country: null,
    banner: false,
    foodWarnDay: 0,
    foodWarned: false,
    troops: { militia: 9 },
    equip: { blade: 0, armor: 0, horse: 0 },
    shi: 1,
    shiUsed: 0,
    adShiDay: 0,
    adShiCount: 0,
    goods: {},
    heroes: [],
    reviveCount: 0,
    x: spawn.x,
    y: spawn.y,
    prevX: spawn.x,
    prevY: spawn.y,
    route: [],
    stepFrom: null,
    stepTo: null,
    stepProgress: 0,
    atSiteId: null,
    facing: 1,
  };

  const relations = {};
  const wars = {};
  Object.keys(FACTIONS).forEach(function (id) {
    relations[id] = id === 'bandit' ? -100 : 0;
    wars[id] = id === 'bandit';
  });

  const state = {
    version: SAVE_VERSION,
    seed,
    clock: { day: 1, hour: 5 },
    world,
    player,
    relations,
    wars,
    lords: [],
    parties: [],
    quests: [],
    log: [],
    events: [],
    stats: { battlesWon: 0, battlesLost: 0, troopsLost: 0, goldEarned: 0, distance: 0, days: 0, sitesTaken: 0, villagesRaided: 0 },
    flags: { sworn: false, campaignDone: [] },
    campaign: { stage: 0, done: [] },
    factionState: {},
    knownHidden: {},
    gameOver: false,
    ending: null,
    timeScale: 1,
    npcClock: 0,
    rng,
    questSeq: 1,
    partySeq: 1,
    battle: null,
    playerSiege: null,
    foodWarning: null,
    postBattleLord: null,
    killRecords: {},
    noPeaceForever: {},
    peaceOfferCooldown: {},
    peaceOfferPending: null,
    playerWarSince: {},
    fiefTaxDay: 0,
    arc: null,
  };

  syncPlayerFaction(null);
  spawnLords(state);
  autoAssignFiefs(state);
  heroes.resolveHeroSites(state);
  spawnBanditParties(state, 8);
  spawnChaseParty(state, spawn);
  war.init(state);
  war.bindLogger(pushLog);
  war.bindPassable(isPassable);

  pushLog(state, '洛阳城破了。你只带出九个人，往东走，身后是西凉步卒。');
  pushLog(state, '别回头。跑到陈留，还能剩几个跟你。');
  state.events.push({ type: 'chapter', chapterId: __require(5).CAMPAIGN[0].id });
  return state;
}

/** 供 findFreeSpotNear 复用的临时外壳 */
function state0(world) {
  return { world, player: { x: -1, y: -1 }, rng: new RNG(1) };
}

/** 这一格是不是已经被另一支 NPC 队伍占着（进城的领主不画在地图上，不算） */
function unitOccupies(state, unit, x, y) {
  if (!state) return false;
  const parties = state.parties || [];
  for (let i = 0; i < parties.length; i++) {
    const q = parties[i];
    if (q !== unit && q.x === x && q.y === y) return true;
  }
  const lords = state.lords || [];
  for (let i = 0; i < lords.length; i++) {
    const l = lords[i];
    if (l === unit || !l.alive || l.inCity || l.prisoner) continue;
    if (l.x === x && l.y === y) return true;
  }
  return false;
}

function findFreeSpotNear(state, cx, cy, radius, unit) {
  const rng = state.rng || new RNG(1);
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = cx + rng.int(-radius, radius);
    const y = cy + rng.int(-radius, radius);
    if (!isPassable(state.world, x, y)) continue;
    if (siteAt(state.world, x, y)) continue;
    if (state.player && x === state.player.x && y === state.player.y) continue;
    if (unit && unitOccupies(state, unit, x, y)) continue;
    return { x, y };
  }
  return null;
}

/* ---------------------------------------------------------------- 封地 */
/**
 * 封地是据点上的一个人事标记：site.lordId 指向 state.lords 里的领主。
 * 城、关隘、村庄都能封；山寨不算领地。标记跟着 world 一起存档，
 * 不另起一套势力数据，旧档没有这个字段时按 null / 自动补封处理。
 */

function siteLord(state, site) {
  if (!state || !site || !site.lordId) return null;
  return (state.lords || []).filter(function (l) {
    return l.id === site.lordId && l.alive;
  })[0] || null;
}

/** 这块地是不是玩家自己直辖的封地（不派领主，税直接进玩家口袋） */
function siteSelfFief(state, site) {
  return !!(state && site && site.playerOwned && site.selfFief);
}

function lordFiefs(state, lord) {
  if (!state || !lord) return [];
  return (state.world.sites || []).filter(function (s) {
    return s.lordId === lord.id && s.type !== 'camp';
  });
}

/** 旧档/新开局：把无主的 AI 城村按驻地就近封给本势力领主 */
function autoAssignFiefs(state) {
  if (!state || !state.world) return;
  const lords = state.lords || [];
  const used = {};
  // 每位领主只领一处封地；先认已有封地，再给空城挑人
  lords.forEach(function (l) {
    const own = lords.length ? state.world.sites.filter(function (s) {
      return s.lordId === l.id && s.type !== 'camp' && !s.selfFief;
    }) : [];
    if (own.length) {
      used[l.id] = true;
      // 旧档里一个领主挂多处：只保留离驻地最近的一处
      own.slice(1).forEach(function (s) { s.lordId = null; });
    }
  });
  state.world.sites.forEach(function (site) {
    if (site.type === 'camp') {
      site.lordId = null;
      site.selfFief = false;
      return;
    }
    if (site.selfFief) site.lordId = null;
    const cur = lords.filter(function (l) { return l.id === site.lordId && l.alive; })[0];
    const okFaction = cur && (site.playerOwned ? cur.faction === 'player' : cur.faction === site.ownerFaction);
    if (cur && okFaction) {
      used[cur.id] = true;
      return;
    }
    if (site.lordId && !okFaction) site.lordId = null;

    if (site.playerOwned || !site.ownerFaction || site.ownerFaction === 'bandit') return;
    const pool = lords.filter(function (l) {
      return l.alive && !l.prisoner && !l.hidden && l.faction === site.ownerFaction && !used[l.id];
    });
    if (!pool.length) return;

    // 城优先给把这里当驻地的人；没有就按距离挑最近的一支
    let best = pool.filter(function (l) { return l.home === site.id; })[0];
    if (!best) {
      best = pool.slice().sort(function (a, b) {
        const da = Math.abs((a.x || 0) - site.x) + Math.abs((a.y || 0) - site.y);
        const db = Math.abs((b.x || 0) - site.x) + Math.abs((b.y || 0) - site.y);
        return da - db;
      })[0];
    }
    if (best) {
      site.lordId = best.id;
      used[best.id] = true;
    }
  });
}

/**
 * 把某个据点封给领主；lordId 传空就是收回。
 * 玩家只能封自己旗下的领主，AI 只能封本势力的领主。
 */
function assignFief(state, siteId, lordId) {
  const site = siteById(state.world, siteId);
  if (!site) return { ok: false, msg: '找不到这块地方' };
  if (site.type === 'camp') return { ok: false, msg: '山寨不是封地' };
  const lord = lordId
    ? (state.lords || []).filter(function (l) { return l.id === lordId && l.alive; })[0]
    : null;

  if (lordId && !lord) return { ok: false, msg: '这个人已经不在军中了' };
  if (lord) {
    if (site.playerOwned) {
      if (lord.faction !== 'player' && lord.faction !== state.player.faction) {
        return { ok: false, msg: '只能封给自己的臣下' };
      }
    } else if (site.ownerFaction && lord.faction !== site.ownerFaction) {
      return { ok: false, msg: '这块地不是他的势力打下来的' };
    }
  }

  if (!lord) {
    const old = siteLord(state, site);
    site.lordId = null;
    site.selfFief = false;
    return { ok: true, msg: old ? '收回了' + site.name + '的封地' : site.name + '本来就没有封主' };
  }

  const old = siteLord(state, site);
  if (old && old.id === lord.id && site.selfFief !== true) {
    return { ok: true, msg: site.name + '本来就封给了' + lord.name };
  }

  // 每位领主最多一处封地：改封就收回他原来那处，不让他一人挂两地
  const previous = lordFiefs(state, lord).filter(function (s) { return s.id !== site.id; });
  previous.forEach(function (s) { s.lordId = null; });

  site.lordId = lord.id;
  site.selfFief = false;
  // 没有主驻地的人，第一块封地就是他的驻地；已有驻地的不搬
  if (!lord.home || !siteById(state.world, lord.home)) lord.home = site.id;
  pushLog(state, (old || previous.length ? '改封' : '封地') + '：' + site.name + '归' + lord.name + '。', 'fief');
  return {
    ok: true,
    msg: (old || previous.length ? '改封' : '封地') + '：' + site.name + '归' + lord.name +
      (previous.length ? '（原封地已收回）' : ''),
    lordId: lord.id,
    siteId: site.id,
  };
}

/** 把一块城/村收归自己直辖：不派领主，按周把税送进你的帐里 */
function assignFiefSelf(state, siteId) {
  const site = siteById(state.world, siteId);
  if (!site) return { ok: false, msg: '找不到这块地方' };
  if (site.type === 'camp') return { ok: false, msg: '山寨不是封地' };
  if (!site.playerOwned) return { ok: false, msg: '这块地方还不是你的' };
  const old = siteLord(state, site);
  if (old) site.lordId = null;
  site.selfFief = true;
  pushLog(state, '封地：' + site.name + '收归自己直辖，每周结算一次税赋。', 'fief');
  return {
    ok: true,
    msg: old
      ? '已从' + old.name + '手中收回' + site.name + '，改由你自己直辖'
      : site.name + '由你自己直辖，每周收税',
    siteId: site.id,
  };
}

/** 每周直辖封地的税：城多于关隘，关隘多于村；不占每日城池收入 */
function fiefTaxFor(site) {
  if (!site) return 0;
  if (site.type === 'town') return 180;
  if (site.type === 'castle') return 100;
  if (site.type === 'village') return 45;
  return 0;
}

function fiefTaxTick(state) {
  if (!state || state.clock.day % 7 !== 0) return 0;
  if (state.fiefTaxDay === state.clock.day) return 0;
  state.fiefTaxDay = state.clock.day;
  const sites = state.world.sites.filter(function (s) {
    return s.playerOwned && s.selfFief && s.type !== 'camp';
  });
  if (!sites.length) return 0;
  const total = sites.reduce(function (sum, s) { return sum + fiefTaxFor(s); }, 0);
  state.player.gold += total;
  state.stats.goldEarned += total;
  const names = sites.slice(0, 3).map(function (s) { return s.name; }).join('、');
  pushLog(state, '第 ' + state.clock.day + ' 天，直辖封地送来本旬税赋 ' + total + ' 金钱（' +
    names + (sites.length > 3 ? ' 等 ' + sites.length + ' 处' : '') + '）。', 'fief');
  return total;
}

function lordFromDef(state, def) {
  const home = siteById(state.world, def.home);
  const spot = home
    ? findFreeSpotNear(state, home.x, home.y, 2) || { x: home.x, y: home.y }
    : { x: 20, y: 22 };
  return {
    id: def.id,
    name: def.name,
    title: def.title,
    faction: def.faction,
    home: def.home,
    level: lordLevelForRank(LORD_RANK[def.id] || 'general'),
    x: spot.x,
    y: spot.y,
    troops: deepCopy(def.soldiers),
    morale: def.morale,
    sight: def.sight,
    chasing: false,
    alive: true,
    respawnDay: 0,
    defTroops: deepCopy(def.soldiers),
    wander: null,
    dead: false,
    retired: false,
    prisoner: null,
    hidden: null,
    resting: false,
  };
}

function spawnLords(state) {
  const { LORDS } = __require(5);
  state.lords = LORDS.map(function (def) { return lordFromDef(state, def); });
}

/** 序章追兵：西凉步卒，披重甲、走得慢，逼你往东跑 */
function spawnChaseParty(state, pos) {
  const from = findFreeSpotNear(state, pos.x - 6, pos.y + 1, 1) || { x: Math.max(1, pos.x - 6), y: pos.y };
  state.parties.push({
    id: 'p_xiliang',
    name: '西凉步卒',
    faction: 'xiliang',
    scripted: true,
    slow: 2,
    tick: 0,
    troops: { spear: 30, tiefu: 30 },
    morale: 90,
    x: from.x,
    y: from.y,
    wander: null,
    chasing: true,
    sight: 12,
  });
}

/** 当前主线进度允许刷出的匪徒等级（青、蓝一开始就有；橙红要等主线过半） */
function allowedTiers(state) {
  const stage = (state.campaign && state.campaign.stage) || 0;
  const out = [];
  Object.keys(BANDIT_TIERS).forEach(function (id) {
    if (stage >= (BANDIT_UNLOCK_STAGE[id] || 0)) out.push(id);
  });
  if (!out.length) out.push('qing');
  return out;
}

/**
 * 按配额补：先补"离目标占比差得最多"的那一级，
 * 这样地图上的青色/蓝色/橙色/赤色比例稳定，不会越打越偏。
 */
function pickBanditTier(state) {
  const tiers = allowedTiers(state);
  const counts = {};
  let total = 0;
  (state.parties || []).forEach(function (p) {
    if (p.faction !== 'bandit') return;
    counts[p.banditTier] = (counts[p.banditTier] || 0) + 1;
    total++;
  });
  const base = Math.max(BANDIT_TARGET, total + 1);

  // 四分之一的情况随机挑，保留一点意外
  if (state.rng.random() < 0.25) {
    return tiers[state.rng.int(0, tiers.length - 1)];
  }

  let best = tiers[0];
  let bestGap = -Infinity;
  tiers.forEach(function (id) {
    const want = (BANDIT_TIERS[id].share || 0) * base;
    const gap = want - (counts[id] || 0);
    if (gap > bestGap) {
      bestGap = gap;
      best = id;
    }
  });
  return best;
}

function spawnBanditParties(state, count) {
  const rng = state.rng;
  const W = state.world.w;
  const H = state.world.h;
  const camps = state.world.sites.filter(function (s) {
    return s.type === 'camp' && !s.cleared;
  });
  for (let i = 0; i < count; i++) {
    const tier = pickBanditTier(state);
    const cfg = BANDIT_TIERS[tier];
    let spot = null;
    if (camps.length) {
      const camp = rng.pick(camps);
      spot = findFreeSpotNear(state, camp.x, camp.y, 7);
    }
    if (!spot) spot = findFreeSpotNear(state, rng.int(2, W - 3), rng.int(2, H - 3), 2);
    if (!spot) continue;

    const size = rng.int(cfg.minSize, cfg.maxSize);
    const troops = { bandit: size };
    Object.keys(cfg.extra || {}).forEach(function (id) {
      const range = cfg.extra[id];
      troops[id] = rng.int(range[0], range[1]);
    });

    state.parties.push({
      id: 'p' + state.partySeq++,
      name: rng.pick(BANDIT_NAMES[tier] || BANDIT_NAMES.qing),
      faction: 'bandit',
      banditTier: tier,
      color: cfg.color,
      troops,
      morale: rng.int(cfg.morale[0], cfg.morale[1]),
      x: spot.x,
      y: spot.y,
      wander: null,
      chasing: false,
      sight: cfg.sight,
      loot: cfg.loot,
      size0: size,
    });
  }
}

/** 山寨按主角声望挑等级：声望越高，匪团越像样 */
function campTierForRenown(state) {
  const tiers = allowedTiers(state);
  const renown = Math.max(0, (state.player && state.player.renown) || 0);
  const index = Math.min(tiers.length - 1, Math.floor(renown / 180));
  return tiers[index] || 'qing';
}

/** 被攻破的山寨三日后在地图任意空地重新聚人，不再回原址 */
function pickCampRespawnSpot(state) {
  const world = state.world;
  const rng = state.rng;
  const p = state.player;
  for (let attempt = 0; attempt < 220; attempt++) {
    const x = rng.int(2, world.w - 3);
    const y = rng.int(2, world.h - 3);
    const tile = world.tiles[y * world.w + x];
    if (tile === 'sea' || tile === 'river' || tile === 'mountain') continue;
    if (!isPassable(world, x, y)) continue;
    if (siteAt(world, x, y)) continue;
    if (p && Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) < 8) continue;
    return { x, y };
  }
  // 极端情况下全图都挑不出空地，退回老据点附近，至少不叠到别的据点上
  return findFreeSpotNear(state, world.w / 2, world.h / 2, 8);
}

function campRespawnTick(state) {
  state.world.sites.forEach(function (site) {
    if (!site || site.type !== 'camp' || !site.cleared) return;
    if (!site.respawnDay) {
      site.respawnDay = (site.lootedDay || state.clock.day) + CAMP_RESPAWN_DAYS;
    }
    if (state.clock.day < site.respawnDay) return;
    const spot = pickCampRespawnSpot(state);
    if (!spot) return;

    // 营地搬去新地方，旧坐标只剩荒地
    site.x = spot.x;
    site.y = spot.y;
    site.region = regionAt(state.world, spot.x, spot.y);
    site.cleared = false;
    site.looted = false;
    site.lootedDay = null;
    site.respawnDay = null;

    // 声望越高，寨子里的匪兵越多、匪团等级越高；保留原始基数，避免每轮翻倍
    site.campBase0 = site.campBase0 || site.garrisonBase || site.garrison || 36;
    site.banditTier = campTierForRenown(state);
    const tier = BANDIT_TIERS[site.banditTier] || BANDIT_TIERS.qing;
    const renown = Math.max(0, (state.player && state.player.renown) || 0);
    const factor = 1 + Math.min(1.8, renown / 500) + (tier.rank - 1) * 0.12;
    site.garrisonBase = Math.max(24, Math.round(site.campBase0 * factor));
    site.garrison = site.garrisonBase;
    site.garrisonGrowth = 0;
  });
}

/** 补充匪团到目标数量，避开玩家脚下 */
function refillBandits(state) {
  const alive = state.parties.filter(function (x) { return x.faction === 'bandit'; }).length;
  if (alive >= BANDIT_TARGET) return 0;
  const add = Math.min(BANDIT_TARGET - alive, 3);
  if (add <= 0) return 0;
  const before = state.parties.length;
  spawnBanditParties(state, add);
  return state.parties.length - before;
}

/* ---------------------------------------------------------------- 关系 */

function relationOf(state, factionId) {
  if (!factionId) return 0;
  return state.relations[factionId] || 0;
}

function isHostileFaction(state, factionId) {
  if (!factionId) return false;
  if (factionId === 'bandit') return true;
  if (factionId === 'xiliang') return true;
  if (state.wars[factionId]) return true;
  const rel = relationOf(state, factionId);
  if (rel <= -25) return true;
  const pf = state.player.faction;
  // 自立的人不等于见谁都打：只有宣战、结仇或主动敌对才算敌人。
  // 挂在一家诸侯名下时，才算“别家的人默认不对付”。
  if (pf && pf !== 'player' && factionId !== pf && rel < 20) return true;
  return false;
}

function changeRelation(state, factionId, delta) {
  if (!factionId || factionId === 'bandit' || factionId === 'xiliang') return;
  if (!FACTIONS[factionId]) return;
  const before = state.relations[factionId] || 0;
  let next = Math.max(-100, Math.min(100, before + delta));
  state.relations[factionId] = next;
  if (next <= -25 && !state.wars[factionId]) {
    state.wars[factionId] = true;
    state.playerWarSince = state.playerWarSince || {};
    state.playerWarSince[factionId] = state.clock.day;
    // 同时写进国战表，否则天下大势的“战”和议和流程会看不到这场仗
    if (war && war.declare) war.declare(state, 'player', factionId, true);
    pushLog(state, FACTIONS[factionId].name + '把你列为逆贼，其领主见到你就会动手。');
  }
  if (delta < 0 && before > -25 && next <= -25) {
    state.wars[factionId] = true;
    state.playerWarSince = state.playerWarSince || {};
    state.playerWarSince[factionId] = state.playerWarSince[factionId] || state.clock.day;
  }
}

function isHostileSite(state, site) {
  if (!site) return false;
  // 洗劫过的山寨不再是军事目标：只剩废墟，点进去看火烧过的空营
  if (site.type === 'camp') return !site.cleared;
  if (site.playerOwned) return false;
  // 无主城围攻失败后，城头只认刀：玩家不能再进城，只能重新围、再决战
  if (site.playerBlocked) return true;
  return isHostileFaction(state, site.ownerFaction);
}

function siteStatus(state, site) {
  if (site.playerOwned) return '你的领地';
  if (site.type === 'camp') return site.cleared ? '废墟 · 已洗劫' : '贼巢 · 可攻';
  if (!site.ownerFaction) return site.playerBlocked ? '敌对' : '无主';
  if (isHostileFaction(state, site.ownerFaction)) return '敌对';
  return '可进入';
}

/* ---------------------------------------------------------------- 查询 */

function playerSpeed(state) {
  const bonus = economy.equipmentBonus(state);
  const hb = heroes.heroBonus(state);
  const count = army.troopCount(state.player.troops);
  // 兵越多，辎重越长，行军越慢。用饱和曲线而不是分段截断：
  // 50/200/400/600 人会一路变慢，只有极大规模才落到 0.35 的下限。
  const n = Math.max(0, count);
  const sizePenalty = Math.min(0.75, 0.80 * (n / (n + 220)));
  return Math.max(0.35, 1 + bonus.speedPct + hb.speedPct - sizePenalty);
}

function capacity(state) {
  return army.troopCapacity(state.player.renown);
}

function currentPos(state) {
  return { x: state.player.x, y: state.player.y };
}

/** 玩家此刻在格子上真正画在哪：中途改道时用来接住已经走出的那一段 */
function playerVisualPos(state) {
  const p = state && state.player;
  if (!p) return { x: 0, y: 0 };
  if (!p.stepFrom || !p.stepTo || !(p.stepProgress > 0)) return { x: p.x, y: p.y };
  const t = Math.min(1, Math.max(0, p.stepProgress));
  return {
    x: p.stepFrom.x + (p.stepTo.x - p.stepFrom.x) * t,
    y: p.stepFrom.y + (p.stepTo.y - p.stepFrom.y) * t,
  };
}

/* ---------------------------------------------------------------- 行军 */

function goTo(state, x, y) {
  if (state.gameOver) return { ok: false, msg: '旅途已经结束' };
  if (!isPassable(state.world, x, y)) return { ok: false, msg: '这里过不去' };
  if (state.playerSiege) {
    const ps = siteById(state.world, state.playerSiege.siteId);
    if (!ps || Math.abs(x - ps.x) + Math.abs(y - ps.y) > 1) cancelPlayerSiege(state);
  }
  const from = currentPos(state);
  if (from.x === x && from.y === y) return { ok: false, msg: '已经在这里了' };
  const path = findPath(state.world, from, { x, y });
  if (!path || !path.length) return { ok: false, msg: '没有可达的路线' };

  const p = state.player;
  const oldStepTo = p.stepTo ? { x: p.stepTo.x, y: p.stepTo.y } : null;
  const oldStepFrom = p.stepFrom ? { x: p.stepFrom.x, y: p.stepFrom.y } : null;
  const oldProgress = p.stepProgress || 0;
  const visual = playerVisualPos(state);

  p.route = path;
  // 快速改道时不要把已经走出的半步抹掉。新路线若仍朝原来那格走，
  // 就保留原来的插值起点和进度；若新路线第一步换了方向，就从“当前画面位置”接出去。
  if (oldStepTo && oldStepFrom && oldProgress > 0 &&
      path[0].x === oldStepTo.x && path[0].y === oldStepTo.y) {
    p.stepFrom = oldStepFrom;
    p.stepTo = path[0];
    p.stepProgress = oldProgress;
  } else {
    p.stepFrom = visual;
    p.stepTo = path[0];
    p.stepProgress = 0;
  }
  p.atSiteId = null;
  // 一动身就不再是"城里歇着"了
  p.resting = null;
  return { ok: true, msg: '出发，全程 ' + path.length + ' 格', path };
}

function stopMoving(state) {
  state.player.route = [];
  state.player.stepTo = null;
  state.player.stepFrom = null;
  state.player.stepProgress = 0;
}

function camp(state) {
  if (state.player.route.length) stopMoving(state);
  advanceTime(state, 24);
  state.player.morale = Math.min(100, state.player.morale + 14);
  pushLog(state, '就地扎营一天，火头军煮了粥。', 'camp');
  return { ok: true, msg: '休整完毕' };
}

/** 扎营里"在这里待一会儿"：原地不动，让天下自己走几个时辰 */
function campWait(state, hours) {
  const h = Math.max(1, Math.min(72, Math.round(hours || 6)));
  const waited = h === 12 ? '半日' : h === 24 ? '一天' : h === 72 ? '三日' : h + '个时辰';
  if (state.player.route.length) stopMoving(state);
  state.player.atSiteId = null;
  advanceTime(state, h);
  // 扎营页自己不跑主循环：把刚欠下的时辰立刻交给 NPC 步进，
  // 否则日历翻了三天，诸侯还站在原地没动。剧情事件留在队列里，回地图再弹。
  update(state, 0, { ignoreEvents: true });
  state.player.morale = Math.min(100, state.player.morale + Math.max(1, Math.round(h * 0.55)));
  if (h >= 12) {
    pushLog(state, '你在野地里按兵不动，等了' + waited +
      '。火没灭，斥候也没回来。', 'camp');
  }
  return { ok: true, msg: '等了' + waited + '，士气 +' + Math.max(1, Math.round(h * 0.55)) };
}

/** 在城里歇下：人不出门，天下照常走 */
function startRest(state, site) {
  if (!site || site.type === 'camp') return { ok: false, msg: '这里歇不下脚' };
  if (isHostileSite(state, site)) return { ok: false, msg: '城里的人不会给你开门' };
  stopMoving(state);
  state.player.atSiteId = site.id;
  state.player.resting = site.id;
  if (site.type === 'village') {
    pushLog(state, '你在' + site.name + '的柴房里歇下。粮吃得慢一半，可村里藏不住人，追兵会摸进来。');
    return { ok: true, msg: '在' + site.name + '歇下：粮耗减半；村里藏不住人，追兵仍会摸进来' };
  }
  pushLog(state, '你在' + site.name + '的客栈里歇下了。城外的旗照旧在动，你的粮吃得慢了一半。');
  return { ok: true, msg: '在' + site.name + '歇下：粮耗减半，暂时没人来追你' };
}

function stopRest(state) {
  state.player.resting = null;
  return { ok: true, msg: '收拾行装，准备上路' };
}

function isResting(state) {
  return !!(state && state.player && state.player.resting);
}

/** 城里/关隘歇下才算躲开追兵；村庄藏不住人，粮耗照样减半，但追兵能摸进来 */
function isSafeResting(state) {
  const p = state && state.player;
  if (!p || !p.resting) return false;
  const site = siteById(state.world, p.resting);
  return !!site && site.type !== 'village';
}

/* ---------------------------------------------------------------- 粮草预警 */

/** 下一次发粮要多少：和 dailyTick 用同一套兵力、加成、休整折扣 */
function nextFoodNeed(state) {
  const p = state.player;
  if (!p) return 0;
  const hb = heroes.heroBonus(state);
  const restMul = isResting(state) ? 0.5 : 1;
  return Math.max(1, Math.round(army.foodPerDay(p.troops) * (1 - hb.foodPct) * restMul));
}

/** 粮草够不够撑到下一次发粮；不够就留下一条常驻告警，补够了自动消 */
function refreshFoodWarning(state) {
  const p = state && state.player;
  if (!p) return null;
  const need = nextFoodNeed(state);
  if (p.food >= need) {
    state.foodWarning = null;
    p.foodWarned = false;
    return null;
  }
  const prev = state.foodWarning;
  state.foodWarning = {
    need: need,
    food: p.food,
    day: state.clock.day,
    at: state.clock.hour,
  };
  if (prev && prev.need === need && prev.food === p.food) return state.foodWarning;
  return state.foodWarning;
}

/** 扣完这一顿之后，提前把“下一顿不够”喊出来；一个缺粮段只喊一次 */
function warnFoodShortage(state) {
  const w = refreshFoodWarning(state);
  const p = state.player;
  if (!w || p.foodWarned) return;
  p.foodWarned = true;
  p.foodWarnDay = state.clock.day;
  const text = '粮草不足以支撑两日（现存 ' + p.food + '，下次发粮需 ' + w.need +
    '）。请尽快补充，否则军队哗变。';
  pushLog(state, text, 'famine');
  state.events.push({ type: 'warning', title: '粮草告急', text: text });
}

/* ---------------------------------------------------------------- 时间 */

function advanceTime(state, hours) {
  const days = addHours(state.clock, hours);
  state.hoursPending = (state.hoursPending || 0) + hours;
  for (let i = 0; i < days; i++) {
    dailyTick(state);
    if (state.gameOver) return;
  }
}

function dailyTick(state) {
  state.stats.days += 1;
  const p = state.player;
  const hb = heroes.heroBonus(state);
  // 口粮两天结算一次：一天一扣太狠，粮草根本养不起队伍
  const isFoodDay = state.clock.day % 2 === 0;
  // 在城里歇着的时候，粮只吃一半
  const restMul = isResting(state) ? 0.5 : 1;
  const need = isFoodDay
    ? Math.max(1, Math.round(army.foodPerDay(p.troops) * (1 - hb.foodPct) * restMul))
    : 0;

  if (need > 0) {
    if (p.food >= need) {
      p.food -= need;
      if (p.food < need * 2) {
        p.morale = Math.max(0, p.morale - 3);
        pushLog(state, '粮草见底（剩 ' + p.food + '），队伍开始嘀咕。');
      }
    } else {
      // 上一轮预警过还补不上，就不是“饿肚子”，是真哗变
      const mutiny = !!state.foodWarning;
      const short = need - p.food;
      p.food = 0;
      p.morale = Math.max(0, p.morale - (mutiny ? 18 : 10));
      const count = army.troopCount(p.troops);
      const loss = Math.min(count, mutiny ? Math.max(short, Math.ceil(count * 0.12)) : short);
      if (loss > 0) {
        army.distributeLosses(p.troops, loss);
        state.stats.troopsLost += loss;
        pushLog(state, mutiny
          ? '断粮哗变！粮车空了，' + loss + ' 人连夜散去，营里差点压不住。'
          : '断粮！' + loss + ' 人夜里走了。');
      }
      if (army.troopCount(p.troops) <= 0) {
        reviveAfterDefeat(state, 'starve');
        return;
      }
    }
  }

  // 这一顿已经扣完：如果下一顿不够，立刻提前告警（一个缺粮段只弹一次）
  warnFoodShortage(state);

  if (p.morale < 65) p.morale = Math.min(65 + hb.morale, p.morale + 3 + hb.morale);
  const income = economy.dailyIncome(state);
  if (income > 0) {
    p.gold += income;
    state.stats.goldEarned += income;
  }
  // 直辖封地每七天一笔税；和每日城池收入分开结算
  fiefTaxTick(state);
  economy.dailyMarket(state, state.rng);
  trade.dailyGoods(state, state.rng);

  // 匪团补充：维持全图常驻数量（太少没得打，太多寸步难行）
  campRespawnTick(state);
  refillBandits(state);
  // 国战：谁跟谁翻了脸；牢里的人熬过一天
  war.diplomacyTick(state);
  war.peaceOfferTick(state);
  war.prisonerTick(state);
  // 国战 AI：各家的集结、开拔、围城与守城，一天只做一次决策
  if (war.strategyTick) war.strategyTick(state);
  // 领主重生（关在牢里的不算，等着被赎、被救或自己跑）
  state.lords.forEach(function (lord) {
    if (lord.alive || lord.prisoner) return;
    if (lord.dead || lord.retired || lord.hidden) return;
    if (state.clock.day >= lord.respawnDay) {
      lord.alive = true;
      const home = siteById(state.world, lord.home);
      if (home) {
        lord.x = home.x;
        lord.y = home.y;
      }
      lord.troops = deepCopy(lord.defTroops);
      pushLog(state, lord.name + '重新聚起了部曲。');
    }
  });

  // 领主在自己的城镇/村庄招兵：用独立的领主兵源池，和玩家招募互不冲突
  lordRestTick(state);
  lordRecruitTick(state);

  // 自立的人手下有领主：跟仇家自动开打，否则这些领主只会站着
  if (state.lords.some(function (l) { return l.faction === 'player' && l.alive; })) {
    Object.keys(FACTIONS).forEach(function (id) {
      if (id === 'player' || id === 'bandit') return;
      if ((state.factionState[id] || {}).dead) return;
      if ((state.relations[id] || 0) <= -25 && !war.atWar(state, 'player', id)) {
        war.declare(state, 'player', id, true);
      }
    });
  }

  // 灭国：城丢光、人也没了，七天倒计时
  factionTick(state);
  // 统一之后的长夜：三十天大旱 / 再统一
  arcTick(state);
}

/* ---------------------------------------------------------------- 主循环 */

function update(state, dtSeconds, opts) {
  if (state.gameOver) return;
  const ignoreEvents = !!(opts && opts.ignoreEvents);
  const dt = dtSeconds * (state.timeScale || 1);
  const p = state.player;
  settleUnitSteps(state);
  // 每帧顺手看看下一顿够不够；第一次不够就告警，别等到哗变才说
  warnFoodShortage(state);
  // 酒馆目标被乱军清剿后，任务与地图点位都要当场收掉
  checkQuestTargets(state);

  if (p.route.length && p.stepTo) {
    // 一步一步走：一帧最多交代一格，落格后立刻刷新插值起点，
    // 慢帧时宁可时间走慢一点也不跳格。
    let budget = dt / HOUR_SECONDS;
    let guard = 0;
    while (budget > 0 && p.stepTo && guard++ < 1) {
      const speed = playerSpeed(state);
      const needHours = tileHours(state.world, p.stepTo.x, p.stepTo.y) / speed;
      const remainHours = needHours * (1 - p.stepProgress);

      if (budget >= remainHours) {
        advanceTime(state, remainHours);
        budget -= remainHours;
        if (state.gameOver) return;

        p.prevX = p.x;
        p.prevY = p.y;
        p.x = p.stepTo.x;
        p.y = p.stepTo.y;
        p.facing = p.x >= p.prevX ? 1 : -1;
        p.stepProgress = 0;
        state.stats.distance += 1;

        p.route.shift();
        if (p.route.length) {
          p.stepFrom = { x: p.x, y: p.y };
          p.stepTo = p.route[0];
        } else {
          p.stepFrom = null;
          p.stepTo = null;
        }

        onArrive(state, p.x, p.y);
        if (state.gameOver) return;
        if (state.events.length) {
          stopMoving(state);
          return;
        }
      } else {
        p.stepProgress += budget / needHours;
        advanceTime(state, budget);
        budget = 0;
      }
    }

    checkPursuit(state);
  } else {
    // 跟骑砍一样：玩家站着不动，时间就停；进城修养、城下围营或在营里
    // 让时辰自己走的时候，外面照常走。
    if (isResting(state) || state.playerSiege || state.campFlow) {
      advanceTime(state, dt / HOUR_SECONDS);
    }
    checkPursuit(state);
  }

  // 天下在动：只有游戏时间真正流逝了，NPC 才动
  const elapsed = state.hoursPending || 0;
  state.hoursPending = 0;
  state.npcClock += elapsed;
  while (state.npcClock >= NPC_STEP_HOURS) {
    state.npcClock -= NPC_STEP_HOURS;
    moveParties(state);
    moveLords(state);
    war.fieldTick(state);
    if (war.siegeTick) war.siegeTick(state);
    checkPursuit(state);
    advanceCampaign(state);
    checkQuestTargets(state);
    checkPlayerSiegeReady(state);
    if (state.events.length && !ignoreEvents) return;
  }
  checkQuestTargets(state);
  checkPlayerSiegeReady(state);
}

function onArrive(state, x, y) {
  const site = siteAt(state.world, x, y);
  if (site) {
    state.player.atSiteId = site.id;
    site.visited = true;
    if (isHostileSite(state, site)) {
      if (canFight(state, site.id)) {
        // 城与关隘先围城，贼巢和村庄直接开打
        const kind = (site.type === 'town' || site.type === 'castle') ? 'player-siege' : 'siege';
        state.events.push({ type: kind, siteId: site.id });
      }
      advanceCampaign(state);
    } else {
      state.events.push({ type: 'enter-site', siteId: site.id });
    }
    advanceCampaign(state);
    return;
  }
  const enemy = adjacentEnemy(state, x, y);
  if (enemy) {
    enemy.cooldownH = gameHours(state) + 8;
    if (enemy.defTroops) {
      state.events.push({ type: 'chase', kind: 'lord', id: enemy.id });
    } else {
      state.events.push({ type: 'chase', kind: 'party', id: enemy.id });
    }
  } else {
    advanceCampaign(state);
  }
}

/** 只有真的踩到同一格才算撞上；贴着脸站不算 */
function adjacentEnemy(state, x, y) {
  if (isSafeResting(state)) return null;
  let best = null;
  const nowH = gameHours(state);
  const all = state.parties.concat(state.lords.filter(function (l) { return l.alive; }));
  all.forEach(function (unit) {
    if (!isHostileFaction(state, unit.faction)) return;
    if (!canFight(state, unit.id)) return;
    if (unit.cooldownH && nowH < unit.cooldownH) return;
    if (unit.x !== x || unit.y !== y) return;
    if (!best) best = unit;
  });
  return best;
}

/** 敌对单位走到你脚下才开打；贴上来一格不算 */
function checkPursuit(state) {
  const p = state.player;
  if (state.events.length) return;
  // 人在城里/关隘歇着，外面的人找不到你；在村庄躲着不算，追兵照样能摸进来
  if (isSafeResting(state)) return;
  const nowH = gameHours(state);
  const all = state.parties.concat(state.lords.filter(function (l) { return l.alive; }));
  for (let i = 0; i < all.length; i++) {
    const unit = all[i];
    if (!isHostileFaction(state, unit.faction)) continue;
    if (!canFight(state, unit.id)) continue;
    if (unit.cooldownH && nowH < unit.cooldownH) continue;
    if (unit.x !== p.x || unit.y !== p.y) continue;
    // 碰过一次先冷却几小时，免得回到地图立刻又被同一个人拦住
    unit.cooldownH = nowH + 8;
    stopMoving(state);
    // 打起来了就没有"自选撤离"：领主、贼寇都走同一个被追上页面
    if (unit.defTroops) {
      state.events.push({ type: 'chase', kind: 'lord', id: unit.id });
    } else {
      state.events.push({ type: 'chase', kind: 'party', id: unit.id });
    }
    return;
  }
}

/* ---------------------------------------------------------------- 被追上 */

/** 买路的价钱：人越多越贵，名将还要加价 */
function giveWayCost(state, unit) {
  const n = army.troopCount(unit.troops || {});
  const isLord = !!unit.defTroops;
  const fac = isLord && FACTIONS[unit.faction] ? FACTIONS[unit.faction] : null;
  const isRuler = !!(fac && fac.lord === unit.name);
  const rank = isLord ? (isRuler ? 1.5 : 1.1) : 0.8;
  return Math.max(40, Math.round((30 + n * 3.2) * rank));
}

/** 给钱脱身：一天之内不追你；关系太差的人不收钱 */
function giveWay(state, unitId, kind) {
  const p = state.player;
  const unit = kind === 'party'
    ? state.parties.filter(function (x) { return x.id === unitId; })[0]
    : state.lords.filter(function (x) { return x.id === unitId; })[0];
  if (!unit) return { ok: false, msg: '人已经不在了' };
  const isLord = kind !== 'party';
  if (isLord) {
    const rel = relationOf(state, unit.faction);
    if (rel < -50) {
      pushLog(state, '你把钱袋递过去，' + unit.name + '一脚踢开：“这时候了，还想拿钱买命？”', 'war');
      return { ok: false, refused: true, msg: unit.name + '不收你的钱：关系 ' + rel + '，低于 -50 的人只认刀。' };
    }
  }
  const cost = giveWayCost(state, unit);
  if (p.gold < cost) return { ok: false, msg: '他要 ' + cost + ' 金钱，你身上只有 ' + p.gold + '。' };
  p.gold -= cost;
  const now = gameHours(state);
  unit.cooldownH = now + 24;
  unit.payoffUntil = now + 24;
  unit.chasing = false;
  if (isLord) changeRelation(state, unit.faction, -2);
  p.renown = Math.max(0, p.renown - 2);
  pushLog(state, '你给了' + unit.name + ' ' + cost + ' 金钱买路。他收了钱，把刀收回鞘里，一天之内不会再来找你。', 'war');
  return { ok: true, cost: cost, msg: '付 ' + cost + ' 金钱脱身，一天之内他不会追上来。' };
}

/** 留人断后：折一部分兵，换他原地停几个时辰；西凉步卒只吃这一套，停八小时 */
function breakTail(state, unitId, kind) {
  const p = state.player;
  const unit = kind === 'party'
    ? state.parties.filter(function (x) { return x.id === unitId; })[0]
    : state.lords.filter(function (x) { return x.id === unitId; })[0];
  if (!unit) return { ok: false, msg: '人已经不在了' };
  const scripted = !!unit.scripted;
  const count = army.troopCount(p.troops);
  if (count <= 1) {
    stopMoving(state);
    if (scripted) {
      endGame(state, 'killed',
        '西凉步卒追上来时，你身边已经没人可以留下断后。\n重甲踏过冻土，刀落下去。\n你的名字没有写进任何一本史书。',
        '剧终');
      return { ok: true, ended: true, msg: '无人断后。你被西凉步卒追杀，死在路上。' };
    }
    return { ok: false, msg: '手下只剩你一个，留不下人断后。' };
  }
  const lose = scripted ? Math.max(1, Math.min(3, count - 1)) : Math.max(1, Math.round(count * 0.22));
  army.distributeLosses(p.troops, lose);
  state.stats.troopsLost += lose;
  p.morale = Math.max(0, p.morale - (scripted ? 8 : 6));
  const now = gameHours(state);
  const pause = scripted ? 8 : 3 + state.rng.int(0, 3);
  unit.pauseUntil = now + pause;
  unit.cooldownH = now + pause + 1;
  unit.chasing = false;
  if (scripted) {
    // 断后成功后步卒不再主动追；只有玩家再贴到一格以内才会重新咬上来
    unit.dormant = true;
    pushLog(state, '你留下 ' + lose + ' 人断后。西凉步卒停下来收拾这队人，会在这里停八个时辰。', 'war');
    return {
      ok: true, lose: lose, pause: pause,
      msg: '折了 ' + lose + ' 人。西凉步卒在原地停 8 小时；之后除非你再贴到它脸上，否则不会再追。',
    };
  }
  pushLog(state, '你留下 ' + lose + ' 人断后。' + unit.name + '在原地收拾这队人，你趁这半天跑出去。', 'war');
  return { ok: true, lose: lose, pause: pause, msg: '折了 ' + lose + ' 人，他会在原地停 ' + pause + ' 小时，然后接着追。' };
}

/** 附近最近的活领主（匪团用来判断该不该跑） */function nearestLord(state, unit, range) {
  let best = null;
  let bestD = 1e9;
  state.lords.forEach(function (l) {
    if (!l.alive || l.inCity || l.prisoner) return;
    const d = Math.max(Math.abs(l.x - unit.x), Math.abs(l.y - unit.y));
    if (d <= range && d < bestD) {
      bestD = d;
      best = l;
    }
  });
  return best;
}

/** 附近最近的匪团（领主顺手清乡） */
function nearestBandit(state, lord, range) {
  let best = null;
  let bestD = 1e9;
  state.parties.forEach(function (q) {
    if (q.faction !== 'bandit') return;
    if (army.troopCount(q.troops) <= 0) return;
    const d = Math.max(Math.abs(q.x - lord.x), Math.abs(q.y - lord.y));
    if (d <= range && d < bestD) {
      bestD = d;
      best = q;
    }
  });
  return best;
}

/* ------------------------------------------------------------ NPC 走路 */

/** NPC 当前该画在哪：按游戏时辰在两格之间插值，跟主角一样一步一步走 */
function unitAnimPos(unit, nowH) {
  if (!unit.stepFrom || !unit.stepTo) return { x: unit.x, y: unit.y };
  const dur = unit.stepHours || NPC_STEP_HOURS;
  if (dur <= 0) return { x: unit.x, y: unit.y };
  const t = (nowH - (unit.stepStartH || 0)) / dur;
  if (t >= 1) return { x: unit.x, y: unit.y };
  const k = Math.max(0, t);
  return {
    x: unit.stepFrom.x + (unit.stepTo.x - unit.stepFrom.x) * k,
    y: unit.stepFrom.y + (unit.stepTo.y - unit.stepFrom.y) * k,
  };
}

/** 迈一步：格子上立刻算到新位置，画面上用 stepHours 个时辰走过去 */
function stepUnitTo(state, unit, step, hours) {
  const nowH = gameHours(state);
  const from = unitAnimPos(unit, nowH);
  unit.stepFrom = from;
  unit.stepTo = { x: step.x, y: step.y };
  unit.stepStartH = nowH;
  unit.stepHours = Math.max(0.4, hours);
  unit.x = step.x;
  unit.y = step.y;
}

/** 结算走完的那一步，别让插值数据一直挂着 */
function settleUnitSteps(state) {
  const nowH = gameHours(state);
  state.parties.concat(state.lords).forEach(function (u) {
    if (!u.stepFrom || !u.stepTo) return;
    const dur = u.stepHours || NPC_STEP_HOURS;
    if (nowH - (u.stepStartH || 0) >= dur) {
      u.stepFrom = null;
      u.stepTo = null;
      u.stepStartH = null;
      u.stepHours = null;
    }
  });
}

function moveParties(state) {
  const p = state.player;
  const nowH = gameHours(state);
  state.parties.forEach(function (party) {
    // 已经和某支队伍缠上：模型停在原地显示交战，不再滑走。
    if (party.engagedWith) return;
    // 断后/买路约好的停战时辰，匪团也必须遵守，否则刚断完后脚又贴上来
    if (party.pauseUntil && nowH < party.pauseUntil) {
      party.chasing = false;
      return;
    }
    if (party.slow) {
      party.tick = (party.tick || 0) + 1;
      if (party.tick % party.slow !== 0) return;
    }
    // 西凉步卒：只咬玩家，不跟领主互殴；断后之后除非玩家贴到脸上，否则原地不动
    if (party.scripted) {
      const dist = gridDistance(party, p);
      if (party.dormant) {
        if (dist > 1) {
          party.chasing = false;
          return;
        }
        party.dormant = false;
      }
      party.chasing = true;
      const step = greedyStep(state, party, { x: p.x, y: p.y });
      if (step) stepUnitTo(state, party, step, NPC_STEP_HOURS * (party.slow || 1));
      return;
    }
    // 见着大兵就溜：匪团轻装，领主辎重多，追不上
    const lord = nearestLord(state, party, 3);
    if (lord && gridDistance(party, lord) <= 1) {
      // 已经贴上了就不跑了：停住，交给下面的大战结算。
      party.engagedWith = lord.id;
      party.scuffle = 0;
      lord.engagedWith = 'party:' + party.id;
      lord.scuffle = 0;
      party.chasing = false;
      return;
    }
    if (lord && retreatFrom(state, party, lord)) {
      party.chasing = false;
      party.engaged = false;
      return;
    }
    const dist = gridDistance(party, p);
    let target;
    if (!isSafeResting(state) && dist <= (party.sight || 5) && isHostileFaction(state, party.faction)) {
      target = { x: p.x, y: p.y };
      party.chasing = true;
    } else {
      if (!party.wander || gridDistance(party, party.wander) < 1) {
        party.wander = findFreeSpotNear(state, party.x, party.y, 5, party);
      }
      target = party.wander;
      party.chasing = false;
    }
    if (!target) return;
    const step = greedyStep(state, party, target);
    if (step) {
      stepUnitTo(state, party, step, NPC_STEP_HOURS * (party.slow || 1));
    } else if (target === party.wander) {
      party.wander = null;
    }
  });

  // 路上相逢：匪团与领主互殴
  fightNeighbors(state);
}

/** 按编制给领主补人：先补缺得最多的兵种；不超过等级带兵上限 */
function refillLord(lord, n) {
  const def = lord.defTroops || {};
  if (!lord.troops) lord.troops = {};
  const cap = lordTroopCap(lord);
  let left = Math.min(Math.max(0, Math.round(n)), Math.max(0, cap - army.troopCount(lord.troops)));
  while (left > 0) {
    let best = null;
    Object.keys(def).forEach(function (id) {
      const gap = def[id] - (lord.troops[id] || 0);
      if (gap > 0 && (!best || gap > best.gap)) best = { id: id, gap: gap };
    });
    if (!best) break;
    const put = Math.min(best.gap, left);
    lord.troops[best.id] = (lord.troops[best.id] || 0) + put;
    left -= put;
  }
  return lord.troops;
}

/** 领主在自己的城镇/村庄招兵：从领主专属兵源池里拿，不碰玩家的 site.recruits */
function recruitLordFromSite(state, lord, site, quota) {
  if (!lord || !site || !lord.defTroops) return 0;
  const pool = site.lordRecruits || {};
  const list = site.recruitList || [];
  let left = Math.max(0, Math.round(quota));
  const cap = lordTroopCap(lord);
  left = Math.min(left, Math.max(0, cap - army.troopCount(lord.troops || {})));
  let got = 0;
  while (left > 0) {
    let best = null;
    list.forEach(function (id) {
      if ((pool[id] || 0) <= 0) return;
      const gap = (lord.defTroops[id] || 0) - (lord.troops[id] || 0);
      if (gap <= 0) return;
      if (!best || gap > best.gap) best = { id: id, gap: gap };
    });
    if (!best) break;
    const put = Math.min(best.gap, left, pool[best.id]);
    if (put <= 0) break;
    lord.troops[best.id] = (lord.troops[best.id] || 0) + put;
    pool[best.id] -= put;
    left -= put;
    got += put;
  }
  return got;
}

/** 这个据点对某位领主算不算“自己人 / 友军”的地方 */
function siteFriendlyToLord(state, lord, site) {
  if (!site || !site.ownerFaction || !lord) return false;
  if (site.ownerFaction === lord.faction) return true;
  if (site.ownerFaction === 'bandit' || site.ownerFaction === 'player') return false;
  return !war.atWar(state, lord.faction, site.ownerFaction);
}

/** 离领主最近的、能进去歇脚的友好城镇 */
function nearestFriendlySite(state, lord, maxDist) {
  const sites = state.world.sites.filter(function (s) {
    return s.type !== 'camp' && siteFriendlyToLord(state, lord, s);
  });
  let best = null;
  let bestD = maxDist || 99;
  sites.forEach(function (s) {
    const d = gridDistance(lord, s);
    if (d <= bestD) { bestD = d; best = s; }
  });
  return best;
}

function enterLordCity(state, lord, site) {
  if (!lord || !site) return;
  lord.inCity = site.id;
  lord.resting = true;
  lord.chasing = false;
  lord.foeChasing = null;
  lord.banditChasing = null;
  lord.x = site.x;
  lord.y = site.y;
  pushLog(state, lord.name + '带人进了' + site.name + '，旗卷起来，歇在城里。');
}

function leaveLordCity(state, lord, reason) {
  const site = siteById(state.world, lord.inCity);
  if (!site) { lord.inCity = null; lord.resting = false; return; }
  lord.inCity = null;
  lord.resting = false;
  const spot = findFreeSpotNear(state, site.x, site.y, 3, lord);
  lord.x = spot ? spot.x : site.x;
  lord.y = spot ? spot.y : site.y;
  if (reason) pushLog(state, lord.name + '从' + site.name + '里出来，重新竖起旗。');
}

/** 每天让停在自家城镇/村庄的领主补一点兵；兵源与玩家分开 */
function lordRecruitTick(state) {
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.prisoner) return;
    const site = siteById(state.world, lord.inCity) || siteAt(state.world, lord.x, lord.y);
    if (!site || (site.type !== 'town' && site.type !== 'castle' && site.type !== 'village')) return;
    if (!siteFriendlyToLord(state, lord, site)) return;
    const full = Math.min(army.troopCount(lord.defTroops || {}), lordTroopCap(lord));
    const now = army.troopCount(lord.troops || {});
    if (full <= 0 || now >= full) return;
    const quota = Math.max(1, Math.min(lord.inCity ? 8 : 4, Math.round((full - now) * 0.12)));
    recruitLordFromSite(state, lord, site, quota);
  });
}

/** 每名领主分一处自己的城巡逻，尽量不和同国领主挤在同一城 */
function patrolSiteFor(state, lord) {
  if (!lord) return null;
  const sites = state.world.sites || [];
  const fief = sites.filter(function (s) { return s.lordId === lord.id; })[0];
  if (fief) return fief;
  const own = sites.filter(function (s) {
    if (s.type !== 'town' && s.type !== 'castle') return false;
    return lord.faction === 'player' ? !!s.playerOwned : s.ownerFaction === lord.faction;
  });
  if (!own.length) return siteById(state.world, lord.home);
  if (lord.patrolSiteId) {
    const cached = own.filter(function (s) { return s.id === lord.patrolSiteId; })[0];
    if (cached) return cached;
  }
  // 按领主 id 取一个固定起点，再避开别人已经占的巡逻城。
  const used = {};
  state.lords.forEach(function (l) {
    if (l !== lord && l.patrolSiteId) used[l.patrolSiteId] = true;
  });
  let h = 0;
  for (let i = 0; i < lord.id.length; i++) h = (h * 31 + lord.id.charCodeAt(i)) % 9973;
  for (let i = 0; i < own.length; i++) {
    const cand = own[(h + i) % own.length];
    if (!used[cand.id]) {
      lord.patrolSiteId = cand.id;
      return cand;
    }
  }
  // 城不够分的时候也只能共用，但路线仍旧各自随机。
  lord.patrolSiteId = own[h % own.length].id;
  return own[h % own.length];
}

/** 领主歇在城里：兵慢慢长；满员且没有军令，就出门巡自己的封地 */
function lordRestTick(state) {
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.prisoner || !lord.inCity) return;
    const site = siteById(state.world, lord.inCity);
    if (!site || !siteFriendlyToLord(state, lord, site)) {
      leaveLordCity(state, lord, '城头换了旗');
      return;
    }
    // 有军令（集结 / 围城 / 守城）就立刻出城
    if (lord.order && lord.order.siteId) {
      leaveLordCity(state, lord, '军令到了');
      return;
    }
    const full = Math.min(army.troopCount(lord.defTroops || {}), lordTroopCap(lord));
    const now = army.troopCount(lord.troops || {});
    if (full > 0 && now >= Math.max(1, Math.round(full * 0.85)) && state.rng.next() < 0.5) {
      leaveLordCity(state, lord);
      const patrol = patrolSiteFor(state, lord);
      const around = patrol || site;
      lord.wander = findFreeSpotNear(state, around.x, around.y, 4, lord);
    }
  });
}

/** 领主：敌对且玩家在视野内 → 追；否则回防驻地。兵多辎重多，走得比匪团慢一半 */
function moveLords(state) {
  const p = state.player;
  const nowH = gameHours(state);
  const playerSide = p.faction || 'player';
  state.lords.forEach(function (lord) {
    if (!lord.alive) return;
    // NPC 在野地里缠上之后，双方把兵停住，先打完再谈走路。
    if (lord.engagedWith) return;
    // 自己国家的领主不替你决定打谁：只在军令、守城和清匪时动兵
    const isOwnCountry = lord.faction === playerSide || lord.faction === 'player';
    // 收了钱 / 被人缠住：原地待着，不动也不追
    if (lord.pauseUntil && nowH < lord.pauseUntil) return;
    // 在城里歇脚：旗收起来，大地图上先不画他；有军令才出城
    if (lord.inCity) {
      const city = siteById(state.world, lord.inCity);
      if (!city || !siteFriendlyToLord(state, lord, city)) {
        leaveLordCity(state, lord);
      } else if (lord.order && lord.order.siteId) {
        leaveLordCity(state, lord, '军令到了');
      } else {
        return;
      }
    }
    const paidOff = !!(lord.payoffUntil && nowH < lord.payoffUntil);
    // 国战军令：集结 / 开拔 / 围城 / 回防。接了令就按军令走，不再自己乱追人
    if (lord.order && lord.order.siteId) {
      const orderSite = siteById(state.world, lord.order.siteId);
      if (orderSite) {
        const od = gridDistance(lord, orderSite);
        lord.chasing = false;
        lord.foeChasing = null;
        lord.banditChasing = null;
        lord.resting = false;
        if (lord.order.hold && od <= 1) return;
        lord.moveTick = (lord.moveTick || 0) + 1;
        if (lord.moveTick % 2 !== 0) return;
        const orderStep = greedyStep(state, lord, { x: orderSite.x, y: orderSite.y });
        if (orderStep) stepUnitTo(state, lord, orderStep, NPC_STEP_HOURS * 2);
        return;
      }
      lord.order = null;
    }
    let target;
    const home = siteById(state.world, lord.home);
    const dist = gridDistance(lord, p);
    const nowCount = army.troopCount(lord.troops || {});
    const fullCount = army.troopCount(lord.defTroops || {});
    // 打残了先回城补人：不然开局玩家能把名将一个个捡走
    const needRest = !!home && nowCount <= Math.max(6, Math.round(fullCount * 0.5));
    if (isHostileFaction(state, lord.faction) && !paidOff && !isSafeResting(state) && dist <= lord.sight && !needRest) {
      target = { x: p.x, y: p.y };
      lord.chasing = true;
      lord.resting = false;
    } else {
      lord.chasing = false;
      if (needRest) {
        // 兵力掉到一半以下：回自己的城，或就近进友军城休整、补兵
        const restingSite = (home && siteFriendlyToLord(state, lord, home))
          ? home : nearestFriendlySite(state, lord, 8);
        if (restingSite) {
          target = { x: restingSite.x, y: restingSite.y, siteId: restingSite.id };
        } else {
          target = { x: home.x, y: home.y };
        }
        lord.foeChasing = null;
        lord.banditChasing = null;
        lord.resting = true;
      } else {
        // 国战：看见死敌的旗，先扑过去打人，老家的事放一放
        const foe = isOwnCountry ? null : war.nearestFoe(state, lord, 5);
        if (foe && !(lord.scuffle > 0)) {
          target = { x: foe.x, y: foe.y };
          lord.foeChasing = foe.id;
          lord.banditChasing = null;
        } else {
          // 顺手清乡：看见近处的匪团就撵过去，撵不上也没关系
          const bandit = nearestBandit(state, lord, 4);
          if (bandit) {
            target = { x: bandit.x, y: bandit.y };
            lord.banditChasing = bandit.id;
            lord.foeChasing = null;
          } else if (home && gridDistance(lord, home) > 3) {
            lord.foeChasing = null;
            lord.banditChasing = null;
            target = { x: home.x, y: home.y };
          } else {
            lord.foeChasing = null;
            lord.banditChasing = null;
            // 没仗打的时候，在自家封地/驻地周围巡一圈，别傻站着。
            // 每处分一座城，路线每走到一格就重新抽，避免同国领主走成同一条线。
            const patrol = patrolSiteFor(state, lord);
            const patrolBase = patrol || fief || home || lord;
            if (!lord.wander || gridDistance(lord, lord.wander) < 1) {
              lord.wander = findFreeSpotNear(state, patrolBase.x, patrolBase.y, 4, lord);
            }
            target = lord.wander;
          }
        }
      }
    }
    // 辎重多，两拍才挪一格：土匪轻装跑得掉，领主追不上
    lord.moveTick = (lord.moveTick || 0) + 1;
    if (lord.moveTick % 2 !== 0) return;
    if (!target) return;
    const step = greedyStep(state, lord, target);
    if (step) {
      stepUnitTo(state, lord, step, NPC_STEP_HOURS * 2);
    } else if (target === lord.wander) {
      // 前面被别的队伍堵住或没有落脚点：下次重新抽巡逻点，别卡死在原地
      lord.wander = null;
    }
    // 走到自己/友军的城门口，就进城歇脚；伤兵在城里长得快
    if (target.siteId) {
      const targetSite = siteById(state.world, target.siteId);
      if (targetSite && gridDistance(lord, targetSite) <= 0) {
        enterLordCity(state, lord, targetSite);
      }
    }
  });
}

/** 一支部队的粗略战力（兵种档次 × 人数），只用于 NPC 之间的互殴 */
function troopWeight(troops) {
  let sum = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    const w = t ? t.tier * 2 + t.atk / 3 + t.def / 3 : 4;
    sum += (troops[id] || 0) * w;
  });
  return sum;
}

/** 让某支队伍往远离威胁的方向退一步 */
function retreatFrom(state, unit, threat) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  let best = null;
  let bestD = gridDistance(unit, threat);
  dirs.forEach(function (d) {
    const nx = unit.x + d[0];
    const ny = unit.y + d[1];
    if (!isPassable(state.world, nx, ny)) return;
    if (siteAt(state.world, nx, ny)) return;
    if (unitOccupies(state, unit, nx, ny)) return;
    const dist = Math.max(Math.abs(nx - threat.x), Math.abs(ny - threat.y));
    if (dist > bestD) {
      bestD = dist;
      best = { x: nx, y: ny };
    }
  });
  if (best) {
    stepUnitTo(state, unit, best, NPC_STEP_HOURS);
    return true;
  }
  return false;
}

/**
 * 匪团与领主在路上撞上：停下来打一场大的，不是咬一口就走。
 * 每 3 小时结算一轮，双方成建制地掉人；打崩之后败方大概率溃逃，
 * 小概率被当场捆住。交战期间双方都不再移动。
 */
function fightNeighbors(state) {
  const p = state.player;
  const rng = state.rng;

  function clear(party, lord) {
    if (party) party.engagedWith = null;
    if (lord && String(lord.engagedWith || '').indexOf('party:') === 0) lord.engagedWith = null;
  }

  state.parties.forEach(function (party) {
    if (party.faction !== 'bandit') return;
    if (army.troopCount(party.troops) <= 0) return;

    let lord = null;
    if (party.engagedWith) {
      lord = state.lords.filter(function (l) { return l.id === party.engagedWith; })[0];
      if (!lord || !lord.alive || lord.prisoner ||
          Math.abs(lord.x - party.x) > 1 || Math.abs(lord.y - party.y) > 1) {
        clear(party, lord);
        return;
      }
    } else {
      lord = state.lords.filter(function (l) {
        return l.alive && !l.prisoner && l.faction !== 'bandit' &&
          Math.abs(l.x - party.x) <= 1 && Math.abs(l.y - party.y) <= 1;
      })[0];
      if (!lord) return;
      // 双方停住，地图上挂“交战”牌，等这场打完再走。
      party.engagedWith = lord.id;
      party.scuffle = 0;
      lord.engagedWith = 'party:' + party.id;
      lord.scuffle = 0;
    }

    const countA = army.troopCount(party.troops);
    const countB = army.troopCount(lord.troops);
    if (countB <= 0) { clear(party, lord); return; }
    const share = countA / (countA + countB || 1);
    // 大规模交战：每轮不是一两个人，而是按阵线成片掉。
    const lossA = Math.max(1, Math.round(countA * (0.06 + (1 - share) * 0.16)));
    const lossB = Math.max(1, Math.round(countB * (0.05 + share * 0.15)));
    army.distributeLosses(party.troops, lossA);
    army.distributeLosses(lord.troops, lossB);

    const remainA = army.troopCount(party.troops);
    const remainB = army.troopCount(lord.troops);
    const brokenA = remainA <= 0 || remainA < Math.max(6, Math.round(countA * 0.24));
    const brokenB = remainB <= 0 || remainB < Math.max(6, Math.round(countB * 0.24));
    const near = Math.max(Math.abs(party.x - p.x), Math.abs(party.y - p.y)) <= 12;

    if (!brokenA && !brokenB) {
      if (near) pushLog(state, party.name + '和' + lord.name + '的主力在野地里撞上了，双方都不退，阵线上又倒下一片。', 'war');
      return;
    }

    if (brokenA && brokenB) {
      clear(party, lord);
      if (near) pushLog(state, party.name + '和' + lord.name + '打到两败俱伤，各自收拢残兵退开。', 'war');
      return;
    }

    if (brokenA) {
      clear(party, lord);
      if (rng.next() < 0.84) {
        retreatFrom(state, party, lord);
        party.scuffle = 4;
        if (near) pushLog(state, party.name + '的阵线先散，抢了条野路逃了；' + lord.name + '没有死追。', 'war');
      } else {
        state.parties = state.parties.filter(function (x) { return x.id !== party.id; });
        if (near) pushLog(state, party.name + '被' + lord.name + '的部曲围住，头目被捆了，剩下的散了。', 'war');
      }
      return;
    }

    // 领主败了：大概率带残兵逃回城，小概率被匪团抓住。
    clear(party, lord);
    if (rng.next() < 0.84) {
      retreatFrom(state, lord, party);
      lord.scuffle = 6;
      if (near) pushLog(state, lord.name + '的阵线被冲散，带着残兵往后退了。', 'war');
    } else {
      war.capture(state, lord, 'bandit', party.name);
      if (near) pushLog(state, lord.name + '在乱军里被' + party.name + '的人按住捆了。', 'war');
    }
  });
}

function greedyStep(state, unit, target) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  let best = null;
  let bestD = gridDistance(unit, target);
  for (let i = 0; i < dirs.length; i++) {
    const nx = unit.x + dirs[i][0];
    const ny = unit.y + dirs[i][1];
    if (!isPassable(state.world, nx, ny)) continue;
    const site = siteAt(state.world, nx, ny);
    if (site) {
      // 村庄不是保险箱：追兵可以踩进村里把玩家揪出来
      const p = state.player;
      const inVillage = p && p.atSiteId === site.id && site.type === 'village' &&
        target && target.x === p.x && target.y === p.y;
      if (!inVillage) continue;
    }
    // 模型占格：除非目标就是这一格上的敌军（那会由交战逻辑接管），否则绕开。
    if (unitOccupies(state, unit, nx, ny)) continue;
    const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y));
    if (d < bestD) {
      bestD = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

/* ---------------------------------------------------------------- 战斗 */

function playerSide(state) {
  const bonus = economy.equipmentBonus(state);
  const hb = heroes.heroBonus(state);
  return {
    name: state.player.country && state.player.country.name
      ? state.player.country.name + '军'
      : state.player.name + ' · ' + renownTitle(state.player.renown),
    faction: state.player.faction,
    troops: deepCopy(state.player.troops),
    morale: state.player.morale,
    atkPct: bonus.atkPct + hb.atkPct,
    defPct: bonus.defPct + hb.defPct,
    isPlayer: true,
  };
}

function startPartyBattle(state, party) {
  // 西凉步卒是剧情追兵，不能拉出来正常对战；只能在被追上页留人断后
  if (!party || party.scripted) return null;
  const battle = new Battle({
    rng: state.rng,
    attacker: playerSide(state),
    defender: {
      name: party.name,
      faction: party.faction,
      troops: deepCopy(party.troops),
      morale: party.morale,
      atkPct: 0,
      defPct: 0,
    },
    context: {
      kind: party.scripted ? 'chase' : 'party',
      partyId: party.id,
      partyName: party.name,
      tier: party.banditTier ? BANDIT_TIERS[party.banditTier].rank : 0,
    },
  });
  state.battle = battle;
  return battle;
}

function startLordBattle(state, lord) {
  const battle = new Battle({
    rng: state.rng,
    attacker: playerSide(state),
    defender: {
      name: lord.name + '军',
      faction: lord.faction,
      troops: deepCopy(lord.troops),
      morale: lord.morale,
      atkPct: 0.05,
      defPct: 0.05,
    },
    context: { kind: 'lord', lordId: lord.id, lordName: lord.name, lordFaction: lord.faction },
  });
  state.battle = battle;
  return battle;
}

function garrisonTroops(site) {
  const total = Math.max(8, site.garrison);
  const f = site.ownerFaction;
  const set = {
    wei: { militia: 0.35, spear: 0.35, crossbow: 0.2, guard: 0.1 },
    shu: { militia: 0.35, spear: 0.3, archer: 0.25, baier: 0.1 },
    wu: { militia: 0.35, archer: 0.35, boat: 0.2, huochuan: 0.1 },
    yuan: { militia: 0.4, spear: 0.35, cav: 0.2, heavy: 0.05 },
    lv: { militia: 0.3, spear: 0.4, cav: 0.25, tiefu: 0.05 },
    biao: { militia: 0.4, spear: 0.35, archer: 0.2, cav: 0.05 },
    zhang: { militia: 0.4, spear: 0.3, archer: 0.25, wudang: 0.05 },
    xianbei: { militia: 0.2, qishe: 0.4, xianbei: 0.3, tengri: 0.1 },
    ma: { militia: 0.25, spear: 0.35, qishe: 0.25, tiefu: 0.15 },
    han: { militia: 0.35, spear: 0.35, crossbow: 0.2, jinjun: 0.1 },
    bandit: { bandit: 0.6, raider: 0.3, raider_cav: 0.1 },
  };
  if (f === 'bandit') {
    const tier = BANDIT_TIERS[site.banditTier];
    const rank = tier ? tier.rank : 1;
    if (rank >= 4) set.bandit = { bandit: 0.35, raider: 0.35, raider_cav: 0.3 };
    else if (rank >= 3) set.bandit = { bandit: 0.45, raider: 0.35, raider_cav: 0.2 };
    else if (rank >= 2) set.bandit = { bandit: 0.55, raider: 0.35, raider_cav: 0.1 };
  }
  const map = set[f] || { militia: 0.4, spear: 0.3, archer: 0.2, cav: 0.1 };
  const troops = {};
  Object.keys(map).forEach(function (id) {
    const n = Math.round(total * map[id]);
    if (n > 0) troops[id] = n;
  });
  return troops;
}

/** 玩家围城：城/关隘先扎营等 1-2 天，贼巢和村庄仍然直接打 */
const PLAYER_SIEGE_DAYS = { town: 1, castle: 2 };

function siegeWaitHours(site) {
  return (PLAYER_SIEGE_DAYS[site && site.type] || 0) * 24;
}

function beginPlayerSiege(state, site) {
  if (!site) return { ok: false, msg: '这里没有可围的城' };
  if (site.type !== 'town' && site.type !== 'castle') {
    return { ok: false, immediate: true, msg: '这里没有城墙，直接打' };
  }
  if (site.playerOwned) return { ok: false, msg: '这是你自己的城' };
  if (state.playerSiege && state.playerSiege.siteId !== site.id) {
    const other = siteById(state.world, state.playerSiege.siteId);
    return { ok: false, msg: '你还在围' + (other ? other.name : '另一座城') + '，先撤围再说' };
  }
  const days = PLAYER_SIEGE_DAYS[site.type] || 1;
  if (!state.playerSiege) {
    if (!canFight(state, site.id)) return { ok: false, msg: '刚脱战，城头的弓手还盯着你' };
    const now = gameHours(state);
    state.playerSiege = {
      siteId: site.id,
      startHour: now,
      readyHour: now + days * 24,
      days: days,
      stage: 'camp',
      readyAnnounced: false,
      promptShown: false,
    };
    stopMoving(state);
    state.player.atSiteId = site.id;
    state.player.resting = null;
    pushLog(state, '你在' + site.name + '城外扎下围营。' + days +
      ' 天内只围不攻：断粮道、扎云梯，等守军先慌。', 'siege');
  }
  return {
    ok: true,
    msg: '围住' + site.name + '，需 ' + days + ' 天',
    days: days,
    leftHours: Math.max(0, state.playerSiege.readyHour - gameHours(state)),
  };
}

/** 围城推进：一次最多等一天，够时辰就挂上“可决战” */
function advancePlayerSiege(state, site, hours) {
  const ps = state.playerSiege;
  if (!ps || !site || ps.siteId !== site.id) {
    return { ok: false, msg: '你还没有围这座城' };
  }
  const total = Math.max(1, Math.round(hours || 24));
  const left = Math.max(0, ps.readyHour - gameHours(state));
  if (left <= 0) {
    ps.stage = ps.stage === 'storming' ? 'storming' : 'ready';
    return { ok: true, msg: '围城已成，可以决战', ready: true, leftHours: 0 };
  }
  const step = Math.min(total, left);
  advanceTime(state, step);
  if (state.gameOver) return { ok: false, msg: '军中已乱，围不下去了' };
  // 让诸侯在这段时间里照常走；剧情事件留到回地图再弹
  update(state, 0, { ignoreEvents: true });
  const leftNow = Math.max(0, ps.readyHour - gameHours(state));
  if (leftNow <= 0) {
    ps.stage = 'ready';
    ps.readyAnnounced = true;
    pushLog(state, site.name + '城头开始挂白旗。围城的壕沟已经推到城门下，可以决战了。', 'siege');
  }
  return {
    ok: true,
    ready: leftNow <= 0,
    leftHours: leftNow,
    msg: leftNow <= 0 ? '围城已成，可以决战'
      : (total >= 24 ? '又围了一日，城中还没开门' : '又围了' + total + '个时辰，城中还没开门'),
  };
}

/** 大地图上的围城计时：时辰在城外照常流，围满了就挂白旗并只喊一次 */
function checkPlayerSiegeReady(state) {
  const ps = state.playerSiege;
  if (!ps || ps.readyAnnounced) return false;
  if (gameHours(state) < ps.readyHour) return false;
  const site = siteById(state.world, ps.siteId);
  ps.stage = 'ready';
  ps.readyAnnounced = true;
  pushLog(state, (site ? site.name : '敌城') +
    '城头开始挂白旗。围城的壕沟已经推到城门下，可以决战了。', 'siege');
  // 不在这里弹轻提示：大地图检测到 stage==='ready' 后会暂停时辰，
  // 直接开“进攻城池 / 拔营离开”的选择框。
  return true;
}

/** 撤围：把营拔了，退回旁边的野地 */
function cancelPlayerSiege(state) {
  const ps = state.playerSiege;
  if (!ps) return { ok: true, msg: '现在没有围城' };
  const site = siteById(state.world, ps.siteId);
  state.playerSiege = null;
  if (site && state.player.atSiteId === site.id) {
    shoveOutOfSite(state, site);
    state.player.atSiteId = null;
  }
  pushLog(state, '你拔了' + (site ? site.name : '城下') + '的围营，退回野地。', 'siege');
  return { ok: true, msg: '已撤围' };
}

function startSiege(state, site) {
  // 洗劫过的空营不能反复开战，否则 0 守军也能无限刷缴获
  if (!site || (site.type === 'camp' && site.cleared)) return null;
  // 城与关隘必须先围够天数，没围完不给开打
  if (site.type === 'town' || site.type === 'castle') {
    const ps = state.playerSiege;
    if (!ps || ps.siteId !== site.id) return null;
    // 玩家可能在围城期间回大地图行军，时辰走够了也要算围成
    if (ps.stage !== 'ready') {
      if (gameHours(state) < ps.readyHour) return null;
      ps.stage = 'ready';
    }
    ps.stage = 'storming';
  }
  const battle = new Battle({
    rng: state.rng,
    attacker: playerSide(state),
    defender: {
      name: site.name + '守军',
      faction: site.ownerFaction,
      troops: garrisonTroops(site),
      morale: site.type === 'town' ? 68 : 62,
      atkPct: site.type === 'castle' ? 0.12 : 0.05,
      defPct: site.type === 'castle' ? 0.2 : 0.12,
    },
    context: { kind: 'siege', siteId: site.id, siteName: site.name },
  });
  state.battle = battle;
  return battle;
}

/** 战役专用战斗：预设敌军，带场景加成 */
function startCampaignBattle(state, id) {
  const configs = {
    puyang_raid: {
      name: '黄巾余部', faction: 'bandit', morale: 60,
      troops: { militia: 35, bandit: 12, spear: 8 },
      context: { kind: 'campaign', campaignId: 'act1b', siteName: '濮阳城外' },
      fire: false,
    },
    wuchao: {
      name: '乌巢粮营', faction: 'yuan', morale: 55,
      troops: { militia: 80, spear: 50, cav: 30, heavy: 10 },
      context: { kind: 'campaign', campaignId: 'act2', siteName: '乌巢' },
      fire: true,
    },
    chibi: {
      name: '曹操水寨', faction: 'wei', morale: 70,
      troops: { militia: 90, archer: 70, boat: 60, guard: 20 },
      context: { kind: 'campaign', campaignId: 'act4', siteName: '赤壁' },
      fire: true,
    },
    yiling: {
      name: '连营守军', faction: 'shu', morale: 65,
      troops: { militia: 100, spear: 60, archer: 50, baier: 12 },
      context: { kind: 'campaign', campaignId: 'act5', siteName: '夷陵' },
      fire: true,
    },
    final: {
      name: '无旗亲军', faction: null, morale: 100,
      troops: { jinjun: 70, guard: 50, heavy: 40, tiefu: 20 },
      context: { kind: 'campaign', campaignId: 'final', siteName: '定稿' },
      fire: false,
    },
  };
  const cfg = configs[id];
  if (!cfg) return null;
  const battle = new Battle({
    rng: state.rng,
    attacker: playerSide(state),
    defender: {
      name: cfg.name,
      faction: cfg.faction,
      troops: deepCopy(cfg.troops),
      morale: cfg.morale,
      atkPct: 0.05,
      defPct: 0.1,
    },
    context: cfg.context,
  });
  battle.fireGround = !!cfg.fire;
  state.battle = battle;
  return battle;
}

/* ---------------------------------------------------------------- 脱战与复活 */

function gameHours(state) {
  return state.clock.day * 24 + state.clock.hour;
}

/** 刚脱战的敌人一段时间内不会再贴上来（避免一撤退就被重新拖进战斗） */
function markFlee(state, id, hours) {
  if (!id) return;
  state.flee = state.flee || {};
  state.flee[id] = gameHours(state) + (hours || 12);
}

function canFight(state, id) {
  if (!id) return true;
  const t = (state.flee || {})[id];
  return !t || gameHours(state) >= t;
}

/** 把玩家从据点格上挪开，找一个相邻的可行空地 */
function shoveOutOfSite(state, site) {
  const p = state.player;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let i = 0; i < dirs.length; i++) {
    const nx = site.x + dirs[i][0];
    const ny = site.y + dirs[i][1];
    if (!isPassable(state.world, nx, ny)) continue;
    if (siteAt(state.world, nx, ny)) continue;
    p.x = nx;
    p.y = ny;
    p.prevX = nx;
    p.prevY = ny;
    p.atSiteId = null;
    stopMoving(state);
    return true;
  }
  stopMoving(state);
  return false;
}

/** 撤退后的收尾：退出据点格、标记脱战冷却 */
function afterRetreat(state, ctx) {
  const p = state.player;
  if (p.atSiteId) {
    const site = siteById(state.world, p.atSiteId);
    if (site) shoveOutOfSite(state, site);
    p.atSiteId = null;
  }
  stopMoving(state);
  if (ctx) {
    markFlee(state, ctx.partyId, 14);
    markFlee(state, ctx.lordId, 14);
    markFlee(state, ctx.siteId, 14);
  }
}

/** 全灭：回到一天前，重新拉起一支小队，记一次复活 */
function reviveAfterDefeat(state, reason) {
  const p = state.player;
  const n = (p.reviveCount || 0) + 1;
  p.reviveCount = n;

  // 时间倒回一天（只退时钟，天下不会真的倒退）
  state.clock.day = Math.max(1, state.clock.day - 1);
  state.npcClock = 0;
  state.flee = {};
  state.events.length = 0;
  state.battle = null;
  stopMoving(state);

  // 回到最近的己方/中立城，若没有就回开局点
  let home = state.world.sites.filter(function (s) {
    return s.playerOwned || (s.type === 'town' && !isHostileFaction(state, s.ownerFaction));
  })[0];
  if (!home) home = siteById(state.world, 'chenliu') || state.world.sites[0];
  const spot = findFreeSpotNear(state, home.x, home.y + 1, 2) || { x: home.x, y: home.y + 1 };
  p.x = spot.x;
  p.y = spot.y;
  p.prevX = spot.x;
  p.prevY = spot.y;
  p.atSiteId = null;
  p.facing = 1;

  // 队伍重编：不让你真的一无所有
  const keep = army.troopCount(p.troops);
  if (keep <= 0) {
    p.troops = { militia: 8 + Math.min(12, n * 2) };
  }
  p.gold = Math.max(30, Math.round(p.gold * 0.5));
  p.food = Math.max(20, Math.round(army.foodPerDay(p.troops) * 2));
  p.morale = 52;
  (p.heroes || []).forEach(function (h) { h.exp = Math.max(0, h.exp - 4); });

  state.flags.reviveText = reason || '';
  state.events.push({ type: 'revive', count: n });
  pushLog(state, '第 ' + n + ' 次：你在' + (home ? home.name : '野地') + '醒来，帐外的旗还在。');
  return n;
}

/** 把战果写回 state */
function resolveBattle(state, battle) {
  const summary = battle.summary();
  state.player.troops = deepCopy(battle.a.troops);
  const p = state.player;

  // 缴获：会搜战场的英雄能多刮一点
  const hbLoot = heroes.heroBonus(state).lootPct;
  if (hbLoot > 0 && summary.loot > 0) summary.loot = Math.round(summary.loot * (1 + hbLoot));

  // 天机简「名册」：阵亡者更多归队
  if (battle.shiMark === 'roll' && summary.result !== 'retreat') {
    const back = Math.max(0, Math.round(summary.initialA * 0.70));
    if (back > 0) {
      const t = battle.a.initialTroops;
      let put = 0;
      Object.keys(t).forEach(function (id) {
        if (put >= back) return;
        const n = Math.min(t[id] - (battle.a.troops[id] || 0), back - put);
        if (n > 0) {
          battle.a.troops[id] = (battle.a.troops[id] || 0) + n;
          put += n;
        }
      });
      p.troops = deepCopy(battle.a.troops);
      pushLog(state, '天机简「名册」生效：' + put + ' 个名字又从纸上站了起来。');
    }
  }

  if (summary.result === 'win') {
    p.morale = Math.min(100, p.morale + 8);
    state.stats.battlesWon += 1;
    const loot = summary.loot;
    p.gold += loot;
    state.stats.goldEarned += loot;
    const renownGain = Math.max(5, Math.round(summary.initialB * 0.8));
    p.renown += renownGain;

    // 英雄跟着打仗长本事
    const ups = heroes.gainHeroExp(state, 9);
    ups.forEach(function (u) {
      pushLog(state, u.hero.name + ' 在阵中升到了 ' + u.level + ' 级。');
    });

    const ctx = battle.context;
    if (ctx.kind === 'party' || ctx.kind === 'chase') {
      state.parties = state.parties.filter(function (x) { return x.id !== ctx.partyId; });
      // 玩家自己打散猎匪目标，算交差；被别的势力清剿才算失败
      completeQuests(state, 'hunt', ctx.partyId);
      pushLog(state, '击溃' + ctx.partyName + '：缴获 ' + loot + ' 金钱，声望 +' + renownGain + '。');
      if (ctx.kind === 'chase') {
        pushLog(state, '西凉步卒退了。你回头看了一眼洛阳的方向，没再回头。');
        advanceCampaign(state);
      }
    } else if (ctx.kind === 'lord') {
      const lord = state.lords.filter(function (x) { return x.id === ctx.lordId; })[0];
      if (lord) {
        // 正常打一仗不杀人：败将跪在阵前，是放是押，由玩家在战果页选
        const res = war.playerDefeatsLord(state, lord);
        changeRelation(state, lord.faction, -35);
        summary.duelNote = '击败 ' + lord.name + ' · 阵前跪着，等你处置';
        summary.postBattleLord = true;
        pushLog(state, '你击败了' + lord.name + '。他丢下刀，被你的部曲按在阵前。');
        if (lord.id === 'lvbu') {
          state.flags.lvbuBeaten = true;
          advanceCampaign(state);
        }
      }
    } else if (ctx.kind === 'siege') {
      const site = siteById(state.world, ctx.siteId);
      if (site) takeSite(state, site);
    } else if (ctx.kind === 'campaign') {
      pushLog(state, ctx.siteName + '一战而胜。');
      battle.campaignWin = true;
      applyCampaignEffect(state, ctx.campaignId);
      advanceCampaign(state);
    }
  } else if (summary.result === 'lose' || summary.result === 'draw') {
    p.morale = Math.max(0, p.morale - 16);
    state.stats.battlesLost += 1;
    // 关键战役打输了：隔一天再让玩家自己决定要不要再上
    if (battle.context && battle.context.kind === 'campaign') {
      state.flags.campaignCool = gameHours(state) + 24;
      pushLog(state, '这一仗没打下来。退回城里养两天伤，还可以再来。');
    }
    const lostGold = Math.round(p.gold * 0.28);
    const lostFood = Math.round(p.food * 0.28);
    p.gold -= lostGold;
    p.food -= lostFood;
    pushLog(state, '战败，被抢走 ' + lostGold + ' 金钱与 ' + lostFood + ' 粮。');
    heroes.gainHeroExp(state, 3);
    if (army.troopCount(p.troops) <= 0) {
      reviveAfterDefeat(state, 'battle');
    }
  } else if (summary.result === 'retreat') {
    p.morale = Math.max(0, p.morale - 8);
    pushLog(state, '你下令脱离战斗，退到野地里。');
    if (battle.context && battle.context.kind === 'campaign') {
      state.flags.campaignCool = gameHours(state) + 24;
    }
    afterRetreat(state, battle.context);
  }
  if (summary.result !== 'win' && battle.context && battle.context.kind === 'siege' &&
      state.playerSiege && state.playerSiege.siteId === battle.context.siteId) {
    const s = siteById(state.world, battle.context.siteId);
    state.playerSiege = null;
    // 无主城一战没打下，守军就认死了你：门不再开，只能重新围、再决战
    if (s && !s.playerOwned && !s.ownerFaction && !s.playerBlocked) {
      s.playerBlocked = true;
      pushLog(state, '攻' + s.name + '没成，城头把门关死了。从今往后你只能围城强攻，不能再进城。', 'siege');
    }
    pushLog(state, '攻城没成，' + (s ? s.name : '城下') + '的围营散了，只能退回野地。', 'siege');
  }

  // 攻城没打下：守军的损失留在城里，不会因为玩家退走就自动补满。
  // 下一次再来，面对的是被打残的守军；它只会按当前人数的自然速度慢慢长。
  if (battle.context && battle.context.kind === 'siege' && summary.result !== 'win') {
    const s = siteById(state.world, battle.context.siteId);
    if (s && !s.playerOwned) {
      s.garrison = Math.max(8, Math.round(summary.remainB || 0));
      s.garrisonGrowth = s.garrisonGrowth || 0;
    }
  }

  state.stats.troopsLost += Math.max(0, summary.initialA - summary.remainA);
  state.battle = null;
  return summary;
}

/** 第一座城到手：不管此前有没有投靠别人，都在这里立自己的旗 */
function beginSelfRule(state, site) {
  const p = state.player;
  if (p.country) return false;
  const oldFaction = p.faction;
  p.country = {
    name: '',
    color: '#d9a441',
    foundedDay: state.clock.day,
    oldFaction: oldFaction || null,
  };
  p.faction = 'player';
  p.banner = true;
  syncPlayerFaction(p.country);
  if (oldFaction && oldFaction !== 'player' && FACTIONS[oldFaction]) {
    pushLog(state, '你把' + FACTIONS[oldFaction].full + '的印绶留在案上，从' + site.name +
      '开始自立门户。');
  }
  pushLog(state, '打下' + site.name + '，部下推你竖自己的旗：先定一个字的国号。', 'throne');
  state.events.push({ type: 'founding', siteId: site.id });
  return true;
}

function takeSite(state, site) {
  const p = state.player;
  if (state.playerSiege && state.playerSiege.siteId === site.id) state.playerSiege = null;
  // 城头换了主人（玩家或 AI），旧日的“围城失败封锁”就作废
  site.playerBlocked = false;
  if (site.type === 'camp') {
    site.cleared = true;
    site.looted = true;
    site.lootedDay = state.clock.day;
    site.respawnDay = state.clock.day + CAMP_RESPAWN_DAYS;
    site.garrison = 0;
    completeQuests(state, 'scout', site.id);
    p.renown += 45;
    p.gold += 120;
    pushLog(state, '攻破' + site.name + '！贼巢被拔，声望 +45。过 ' + CAMP_RESPAWN_DAYS + ' 天再来，看还有没有人聚起来。');
  } else {
    const oldFaction = site.ownerFaction;
    // 第一座城：先自立，再落旗；国号未定时先用默认旗色，选完国号再统一刷新
    beginSelfRule(state, site);
    site.playerOwned = true;
    site.faction = p.faction || site.faction;
    site.ownerFaction = p.faction || null;
    // 打下来的地方先不自动封人，等玩家在政务页点将
    site.lordId = null;
    site.selfFief = false;
    site.garrison = Math.max(10, Math.round(site.garrisonBase * 0.35));
    site.garrisonBase = site.garrison;
    site.color = p.country && p.country.color ? p.country.color : '#d9a441';
    site.banner = p.country && p.country.name ? p.country.name : '旗';
    p.gold += 150;
    state.stats.sitesTaken += 1;
    if (oldFaction && oldFaction !== 'bandit') {
      changeRelation(state, oldFaction, -60);
    }
    war.onSiteTaken(state, site, oldFaction);
    applyPlayerCountry(state);
    pushLog(state, '你拿下了' + site.name + '。从今天起，这里归你。');
    checkVictory(state);
    advanceCampaign(state);
  }
}

/* ---------------------------------------------------------------- 任务 */

/** 酒馆任务的目标坐标：怪物队伍、贼巢或交粮城 */
function questTargetPos(state, quest) {
  if (!quest || quest.done || quest.failed) return null;
  if (quest.type === 'hunt') {
    const party = (state.parties || []).filter(function (p) { return p.id === quest.targetPartyId; })[0];
    if (!party || army.troopCount(party.troops || {}) <= 0) return null;
    return { x: party.x, y: party.y, name: party.name, kind: 'party', id: party.id };
  }
  const siteId = quest.type === 'scout' ? quest.targetSiteId : quest.siteId;
  const site = siteById(state.world, siteId);
  if (!site) return null;
  return {
    x: site.x,
    y: site.y,
    name: site.name,
    kind: quest.type === 'scout' ? 'camp' : 'site',
    id: site.id,
  };
}

function offerQuest(state, site) {
  if (!site || site.faction === 'bandit' || site.playerOwned) return null;
  if (site.type !== 'town' && site.type !== 'castle') return null;
  const rng = state.rng;
  const bandits = state.parties.filter(function (p) { return p.faction === 'bandit'; });
  const type = rng.pick(bandits.length ? ['hunt', 'grain', 'scout'] : ['grain', 'scout']);

  const quest = {
    id: 'q' + state.questSeq++,
    type,
    siteId: site.id,
    siteName: site.name,
    faction: site.ownerFaction,
    acceptedDay: state.clock.day,
    done: false,
    reward: { gold: 0, renown: 0 },
  };

  if (type === 'hunt') {
    const party = rng.pick(bandits);
    quest.targetPartyId = party.id;
    quest.title = '清剿' + party.name;
    quest.text = '“' + party.name + ' 在' + site.name + '附近劫道。打散他们，赏钱归你。”';
    quest.reward.gold = 180 + rng.int(0, 80);
    quest.reward.renown = 24;
  } else if (type === 'grain') {
    quest.title = '征缴粮草';
    quest.text = '“城里粮仓见底。送 40 单位粮过来，钱照付。”';
    quest.need = 40;
    quest.reward.gold = 150 + rng.int(0, 60);
    quest.reward.renown = 18;
  } else {
    const camps = state.world.sites.filter(function (s) { return s.type === 'camp' && !s.cleared; });
    if (!camps.length) return null;
    const camp = rng.pick(camps);
    quest.targetSiteId = camp.id;
    quest.title = '探查' + camp.name;
    quest.text = '“去' + camp.name + ' 门口看一眼，回来报数。”';
    quest.reward.gold = 130;
    quest.reward.renown = 14;
  }

  state.quests.push(quest);
  return quest;
}

function finishQuest(state, q) {
  state.player.gold += q.reward.gold;
  state.player.renown += q.reward.renown;
  state.stats.goldEarned += q.reward.gold;
  if (q.faction) changeRelation(state, q.faction, 12);
  pushLog(state, '交差：' + q.title + '，得 ' + q.reward.gold + ' 金钱、' + q.reward.renown + ' 声望。');
}

function completeQuests(state, type, targetId) {
  state.quests.forEach(function (q) {
    if (q.done || q.type !== type) return;
    if (type === 'hunt' && q.targetPartyId !== targetId) return;
    if (type === 'scout' && q.targetSiteId !== targetId) return;
    q.done = true;
    finishQuest(state, q);
  });
}

/** 目标已经没了，任务直接作废：不发赏钱、不留地图点位，只在酒馆里留一句交代 */
function failQuest(state, q, reason) {
  if (!q || q.done) return false;
  q.done = true;
  q.failed = true;
  q.failReason = reason || '目标已经被其他势力清剿';
  q.failedDay = state.clock.day;
  pushLog(state, '酒馆的差事黄了：' + (q.title || '那桩事') + '。' + q.failReason +
    '，赏钱也没了。', 'quest');
  state.events.push({
    type: 'quest-failed',
    title: '任务失败',
    text: q.failReason + '，任务自动失败，赏钱不再发放。',
    questId: q.id,
  });
  return true;
}

/** 目标不在=被其他势力清剿；只判定一次，已完成/已失败的不重复喊 */
function checkQuestTargets(state) {
  if (!state || !state.quests || !state.quests.length) return 0;
  let failed = 0;
  state.quests.forEach(function (q) {
    if (!q || q.done) return;
    if (q.type === 'hunt') {
      const party = (state.parties || []).filter(function (p) { return p.id === q.targetPartyId; })[0];
      if (!party || army.troopCount(party.troops || {}) <= 0) {
        if (failQuest(state, q, '目标已经被其他势力清剿')) failed++;
      }
      return;
    }
    if (q.type === 'scout') {
      const site = siteById(state.world, q.targetSiteId);
      if (!site || site.cleared) {
        if (failQuest(state, q, '目标已经被其他势力清剿')) failed++;
      }
      return;
    }
    if (q.type === 'grain') {
      const site = siteById(state.world, q.siteId);
      if (!site || (q.faction && site.ownerFaction !== q.faction)) {
        if (failQuest(state, q, '目标已经被其他势力清剿')) failed++;
      }
    }
  });
  return failed;
}

function deliverGrain(state, quest) {
  if (!quest || quest.type !== 'grain' || quest.done) return { ok: false, msg: '没有可交的任务' };
  if (state.player.food < quest.need) return { ok: false, msg: '粮不够，还差 ' + (quest.need - state.player.food) };
  const site = siteById(state.world, quest.siteId);
  const pos = currentPos(state);
  if (!site || Math.abs(pos.x - site.x) > 1 || Math.abs(pos.y - site.y) > 1) {
    return { ok: false, msg: '要亲自送到' + quest.siteName };
  }
  state.player.food -= quest.need;
  quest.done = true;
  finishQuest(state, quest);
  return { ok: true, msg: '粮草已交' };
}

function checkScoutQuest(state) {
  const pos = currentPos(state);
  state.quests.forEach(function (q) {
    if (q.done || q.type !== 'scout') return;
    const site = siteById(state.world, q.targetSiteId);
    if (!site) return;
    if (Math.abs(pos.x - site.x) <= 1 && Math.abs(pos.y - site.y) <= 1) {
      q.done = true;
      finishQuest(state, q);
    }
  });
}

/* ---------------------------------------------------------------- 内政 */

function joinFaction(state, site) {
  const p = state.player;
  if (p.country && p.country.name) {
    return { ok: false, msg: '你已经立了「' + p.country.name + '」的国号，不能再投别人' };
  }
  if (p.faction === 'player') return { ok: false, msg: '你已经自立，先把国号定下来' };
  if (p.faction) return { ok: false, msg: '你已经效忠' + FACTIONS[p.faction].full };
  if (!site.ownerFaction || site.ownerFaction === 'bandit') return { ok: false, msg: '这里没有可效忠的旗' };
  if (site.playerOwned) return { ok: false, msg: '这是你自己的地盘' };
  const f = site.ownerFaction;
  const req = joinRenownReq(f);
  if (p.renown < req) {
    return { ok: false, msg: '声望不足 ' + req + '，' + site.name + '的守将不见你' };
  }
  p.faction = f;
  state.flags.sworn = true;
  changeRelation(state, f, 80);
  Object.keys(state.relations).forEach(function (id) {
    if (id === f || id === 'bandit') return;
    changeRelation(state, id, -18);
  });
  p.morale = Math.min(100, p.morale + 12);
  pushLog(state, '你在' + site.name + '接下' + FACTIONS[f].name + '的印绶。从此你的敌人，也是别人的敌人。');
  return { ok: true, msg: '你现在是' + FACTIONS[f].full + '的人了' };
}

/* ---------------------------------------------------------------- 俘虏 */

function prisonersOf(state) {
  const list = war.listPrisoners(state).map(function (p) {
    const lord = state.lords.filter(function (l) { return l.id === p.lordId; })[0];
    const site = siteById(state.world, p.siteId);
    const recruit = lord && war.recruitChance ? war.recruitChance(state, lord) : null;
    return {
      lordId: p.lordId,
      name: lord ? lord.name : p.lordId,
      title: lord ? lord.title : '',
      faction: lord ? lord.faction : '',
      by: p.by,
      byName: p.byName || (p.by === 'player' ? '你' : ''),
      place: site ? site.name : '某处牢里',
      days: p.days || 0,
      ransom: p.ransom || (60 + Math.round(war.weight(lord ? lord.defTroops : {}) / 5)),
      chance: Math.min(1, war.ESCAPE_BASE + war.ESCAPE_STEP * (p.days || 0)),
      recruit: recruit,
      recruitCoolDay: lord ? (lord.recruitCoolDay || 0) : 0,
      recruitWaitDays: lord ? Math.max(0, (lord.recruitCoolDay || 0) - state.clock.day) : 0,
    };
  });
  return list;
}

function ransomPrisoner(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) { return x.lordId === lordId; })[0];
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (p && lord && !p.ransom) p.ransom = 60 + Math.round(war.weight(lord.defTroops) / 5);
  return war.ransom(state, lordId);
}

function releasePrisoner(state, lordId) {
  return war.release(state, lordId);
}

function factionWars(state) {
  return war.summaryLines(state);
}

/* ---------------------------------------------------------------- 玩家外交 */

/** 你和一个势力现在是不是在打 */
function atWarWith(state, faction) {
  return !!(state && faction && war.atWar(state, 'player', faction));
}

/**
 * 议和条款：关系越差赔得越多；阵前杀过对方的人，一个月内不谈，
 * 满一个月再谈，赔款翻倍。UI 与真正扣钱都走这一处。
 */
function peaceTerms(state, faction) {
  if (!state || !faction || !FACTIONS[faction]) return { ok: false, msg: '没有这个势力' };
  if ((state.factionState[faction] || {}).dead) return { ok: false, msg: '这个势力已经亡了，没人能签下这份文书' };
  if (!war.atWar(state, 'player', faction)) return { ok: false, msg: '你和他们没有开战' };
  if (state.noPeaceForever && state.noPeaceForever[faction]) {
    return {
      ok: false,
      forever: true,
      msg: '你斩了他们的君主，这一家的血债永世不消，任何议和文书都会被退回。',
    };
  }
  const rel = state.relations[faction] || 0;
  const killDay = state.killRecords ? state.killRecords[faction] : null;
  if (killDay) {
    const passed = state.clock.day - killDay;
    if (passed < 30) {
      return {
        ok: false,
        killed: true,
        waitDays: 30 - passed,
        msg: '你的人头还挂在对方的军旗下。杀将未满一个月，议和必被驳回，还要再等 ' + (30 - passed) + ' 天。',
      };
    }
  }
  let cost = Math.max(40, Math.round((100 - rel) * 2 + 40));
  if (rel > 40) cost = Math.round(cost * 0.6);
  const doubled = !!killDay;
  if (doubled) cost *= 2;
  return {
    ok: true,
    cost: cost,
    killed: doubled,
    rel: rel,
    msg: '议和赔款 ' + cost + ' 金钱' + (doubled ? '（杀将旧账，翻一倍）' : '') + '。',
  };
}

/** 主动向一个势力宣战：一纸战书，不需要对方同意 */
function declareWarFaction(state, faction) {
  if (!state || !faction || !FACTIONS[faction] || faction === 'player' || faction === 'bandit') {
    return { ok: false, msg: '不能向这个势力宣战' };
  }
  if ((state.factionState[faction] || {}).dead) return { ok: false, msg: '这个势力已经亡了' };
  if (war.atWar(state, 'player', faction)) return { ok: false, msg: '你已经在和他们打仗' };
  war.declare(state, 'player', faction, false);
  state.wars[faction] = true;
  state.playerWarSince = state.playerWarSince || {};
  state.playerWarSince[faction] = state.playerWarSince[faction] || state.clock.day;
  state.relations[faction] = Math.min(state.relations[faction] || 0, -35);
  pushLog(state, '你向' + FACTIONS[faction].full + '递了战书。使者出门时，两家的边关已经点起了烽火。', 'war');
  return { ok: true, msg: '已向' + FACTIONS[faction].full + '宣战' };
}

/** 花钱议和：关系、杀将冷却和赔款都在 peaceTerms 里算 */
function cancelSiegeAgainstPeace(state, faction) {
  const ps = state && state.playerSiege;
  if (!ps) return false;
  const site = siteById(state.world, ps.siteId);
  if (!site || site.ownerFaction !== faction) return false;
  const r = cancelPlayerSiege(state);
  return !!(r && r.ok);
}

function makePeaceWith(state, faction) {
  const terms = peaceTerms(state, faction);
  if (!terms.ok) return terms;
  if (state.player.gold < terms.cost) {
    return { ok: false, msg: '赔款要 ' + terms.cost + ' 金钱，你身上只有 ' + state.player.gold + '。' };
  }
  if (!war.makePeace(state, 'player', faction, false)) {
    return { ok: false, msg: '对方把文书退了回来：这笔血债，不是钱能了的。' };
  }
  state.player.gold -= terms.cost;
  cancelSiegeAgainstPeace(state, faction);
  state.relations[faction] = 0;
  pushLog(state, '你付出 ' + terms.cost + ' 金钱，与' + FACTIONS[faction].full + '议和。边关的鼓角停了一阵。', 'war');
  return { ok: true, msg: '已与' + FACTIONS[faction].full + '议和，赔付 ' + terms.cost + ' 金钱', cost: terms.cost };
}

/** 敌国主动求和：玩家接受得一支天机简，关系归零；拒绝不留任何惩罚。 */
function acceptPeaceOffer(state, faction) {
  if (!state || !state.peaceOfferPending || state.peaceOfferPending !== faction) {
    return { ok: false, msg: '这封求和书已经过期了。' };
  }
  if (state.noPeaceForever && state.noPeaceForever[faction]) {
    state.peaceOfferPending = null;
    return { ok: false, msg: '你斩了他们的君主，使者连营门都进不来。这一家与你永世不议和。' };
  }
  const hadWar = war.atWar(state, 'player', faction) || !!(state.wars && state.wars[faction]);
  if (!hadWar) return { ok: false, msg: '两家已经不在交战了。' };
  // 旧档可能只有 state.wars，没有 factionWars 里的记录：能收兵就直接收
  if (war.atWar(state, 'player', faction) && !war.makePeace(state, 'player', faction, true)) {
    return { ok: false, msg: '对方的使者已经走了。' };
  }
  if (state.wars) state.wars[faction] = false;
  cancelSiegeAgainstPeace(state, faction);
  state.peaceOfferPending = null;
  state.relations[faction] = 0;
  state.player.shi = (state.player.shi || 0) + 1;
  pushLog(state, '你接了' + FACTIONS[faction].full + '的求和书。两家罢兵，关系归零；使者留下一支天机简。', 'war');
  return { ok: true, msg: '已议和 · 天机简 +1 · 关系归零' };
}

/** 拒绝求和：不扣关系、不掉声望，只是这封文书作废。 */
function rejectPeaceOffer(state, faction) {
  if (!state || !state.peaceOfferPending || state.peaceOfferPending !== faction) {
    return { ok: false, msg: '这封求和书已经过期了。' };
  }
  state.peaceOfferPending = null;
  pushLog(state, '你把' + FACTIONS[faction].full + '的求和书退了回去。使者收拾行装，出了营门。', 'war');
  return { ok: true, msg: '已拒绝议和' };
}

function declareWar(state, site) {  const f = site.ownerFaction;
  if (!f || f === 'bandit') return { ok: false, msg: '这里没有可宣战的对象' };
  if (state.player.faction === f) return { ok: false, msg: '你不能对自己的国宣战' };
  state.wars[f] = true;
  state.playerWarSince = state.playerWarSince || {};
  state.playerWarSince[f] = state.playerWarSince[f] || state.clock.day;
  if (war && war.declare) war.declare(state, 'player', f, true);
  changeRelation(state, f, -45);
  pushLog(state, '你与' + FACTIONS[f].full + '撕破了脸。');
  return { ok: true, msg: '已与' + FACTIONS[f].full + '开战' };
}

/** 劫掠村庄：快钱，脏手 */
function raidVillage(state, site) {
  if (!site || site.type !== 'village') return { ok: false, msg: '这里没什么可抢的' };
  if (site.playerOwned) return { ok: false, msg: '抢自己的村子？' };
  if (site.ownerFaction && isHostileFaction(state, site.ownerFaction) && state.player.faction === site.ownerFaction) {
    return { ok: false, msg: '这是你自己人' };
  }
  const rng = state.rng;
  const gold = 90 + rng.int(0, 110);
  const food = 40 + rng.int(0, 45);
  const cap = army.foodCap(state.player.troops);
  state.player.gold += gold;
  state.player.food = Math.min(cap, state.player.food + food);
  state.stats.villagesRaided += 1;
  site.garrison = Math.max(0, site.garrison - 6);
  site.priceIndex = Math.min(1.5, (site.priceIndex || 1) * 1.2);
  site.burned = true;
  // 屠村只掉 5 点关系，但村里会记很久
  if (site.ownerFaction) changeRelation(state, site.ownerFaction, -5);
  state.player.renown = Math.max(0, state.player.renown - 4);
  pushLog(state, '你屠了' + site.name + '，得 ' + gold + ' 金钱、' + food + ' 粮。村口有人记住了你的旗。');
  return { ok: true, msg: '抢到 ' + gold + ' 金钱、' + food + ' 粮' };
}

/** 村庄：跟村长买口粮（牛、羊、鸡、谷） */
function buyVillageFood(state, site, itemId) {
  if (!site || site.type !== 'village') return { ok: false, msg: '这里没有村市' };
  let item = null;
  VILLAGE_FOOD.forEach(function (f) { if (f.id === itemId) item = f; });
  if (!item) return { ok: false, msg: '没有这样东西' };
  const stock = (site.foodStock || {})[item.id] || 0;
  if (stock <= 0) return { ok: false, msg: '村里的' + item.name + '已经卖完了，过两天再来' };
  const price = Math.round(item.price * (site.priceIndex || 1) * 0.85);
  if (state.player.gold < price) return { ok: false, msg: '钱不够，要 ' + price + ' 金钱' };
  if (state.player.food + item.food > army.foodCap(state.player.troops)) return { ok: false, msg: '粮车装不下了' };
  state.player.gold -= price;
  state.player.food += item.food;
  site.foodStock[item.id] = stock - 1;
  return { ok: true, msg: '买了' + item.name + '，得 ' + item.food + ' 口粮', cost: price };
}

/* ---------------------------------------------------------------- 领主交涉 */

/** 君主 / 一方领兵者 / 普通将领：送礼的兑换率不同 */
const LORD_RANK = {
  caocao: 'king', liubei: 'king', sunquan: 'king', yuanshao: 'king', lvbu: 'king',
  liubiao: 'king', liuzhang: 'king', kebineng: 'king', mateng: 'king', huangfusong: 'king',
  xiahou: 'lord', zhangliao: 'lord', guanyu: 'lord', zhangfei: 'lord', zhouyu: 'lord',
  taishici: 'lord', yanliang: 'lord', gaoshun: 'lord', caimao: 'lord', zhangren: 'lord', machao: 'lord',
};
const RANK_NAME = { king: '君主', lord: '领兵者', general: '将领' };
const RANK_RATE = { king: 5, lord: 3, general: 2 };
// 等级只决定带兵上限，不决定地位；君主 9 级、领兵者 7 级、普通将领 5 级。
const LORD_LEVEL_BY_RANK = { king: 9, lord: 7, general: 5 };

function lordRank(lord) {
  if (lord && lord.rank) return lord.rank;
  if (lord && FACTIONS[lord.faction] && FACTIONS[lord.faction].lord === lord.name) return 'king';
  return LORD_RANK[lord.id] || 'general';
}

function lordLevelForRank(rank) {
  return LORD_LEVEL_BY_RANK[rank] || LORD_LEVEL_BY_RANK.general;
}

function lordLevel(lord) {
  if (!lord) return 1;
  const explicit = Number(lord.level);
  if (explicit >= 1) return Math.max(1, Math.min(10, Math.round(explicit)));
  return lordLevelForRank(lordRank(lord));
}

/** 等级带兵上限：1 级 70，6 级 170，10 级 250；历史领主不低于原编制 */
function lordCapForLevel(level) {
  const lv = Math.max(1, Math.min(10, Math.round(Number(level) || 1)));
  return 50 + lv * 20;
}

function lordTroopCap(lord) {
  if (!lord) return 30;
  const defCount = army.troopCount(lord.defTroops || lord.troops || {});
  return Math.max(defCount, lordCapForLevel(lordLevel(lord)));
}

function lordLines(lord) {
  const base = LORD_TALK[lord.id] || {};
  const pool = FACTION_TALK[lord.faction] || { greet: [], idle: [] };
  const factionName = FACTIONS[lord.faction] ? FACTIONS[lord.faction].full + '麾下' : '游走于乱世';
  const bio = LORD_BIOS[lord.id] || base.bio || LORD_EXTRA_BIO[lord.id] || (lord.name + '，' + factionName + '。');
  const greet = base.greet || (pool.greet && pool.greet[0]) || '有什么事？';
  const idle = (base.idle || []).concat(pool.idle || []);
  return {
    greet: greet,
    bio: bio,
    idle: idle.length ? idle : ['在看着远处。'],
    warLine: base.warLine || '',
  };
}

/** 每次对话随机一句闲聊，结合当前战事。
 * 八小时内反复问“你在做什么”必须还是同一句，免得玩家以为他在不停改口。
 */
function lordIdle(state, lord) {
  const now = gameHours(state);
  if (lord.askCache && now >= lord.askCache.at && now - lord.askCache.at < 8) {
    return lord.askCache.line;
  }
  const t = lordLines(lord);
  const pool = (t.idle || []).slice();
  const war = state.wars || {};
  let atWar = false;
  Object.keys(war).forEach(function (id) { if (war[id] && id !== 'bandit') atWar = true; });
  if (atWar && t.warLine) pool.push(t.warLine);
  const pick = pool[Math.floor(state.rng.random() * pool.length)] || '在巡视营地。';
  lord.askCache = { at: now, line: pick };
  return pick;
}

function lordGreet(state, lord) {
  const t = lordLines(lord);
  const line = t.greet || '你来了。';
  const rel = relationOf(state, lord.faction);
  return line + '\n（关系 ' + rel + ' · ' + RANK_NAME[lordRank(lord)] + '）';
}

/** 送礼：100 金 = 君主 5 点、领兵者 3 点、将领 2 点 */
function giftLord(state, lord, gold) {
  const n = Math.max(20, Math.floor(gold));
  if (state.player.gold < n) return { ok: false, msg: '金钱不够，你只有 ' + state.player.gold };
  const rate = RANK_RATE[lordRank(lord)];
  const gain = Math.max(1, Math.round((n / 100) * rate));
  state.player.gold -= n;
  changeRelation(state, lord.faction, gain);
  const rel = relationOf(state, lord.faction);
  pushLog(state, '你给' + lord.name + '送了 ' + n + ' 金钱，关系 +' + gain + '（现在 ' + rel + '）。');
  return { ok: true, msg: '送 ' + n + ' 金钱，关系 +' + gain + '（现在 ' + rel + '）', gain, rel };
}

/** 开战：直接扣 25 关系 */
function provokeLord(state, lord) {
  changeRelation(state, lord.faction, -25);
  state.wars[lord.faction] = true;
  state.playerWarSince = state.playerWarSince || {};
  state.playerWarSince[lord.faction] = state.playerWarSince[lord.faction] || state.clock.day;
  if (war && war.declare) war.declare(state, 'player', lord.faction, true);
  const rel = relationOf(state, lord.faction);
  pushLog(state, '你和' + lord.name + '翻了脸，关系 ' + rel + '。');
  return { ok: true, msg: '关系 -25（现在 ' + rel + '）' };
}

/** 领主兵力概览 */
function lordTroopLine(lord) {
  const rows = [];
  Object.keys(lord.troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    if (t && lord.troops[id] > 0) rows.push(t.name + ' ' + lord.troops[id]);
  });
  return rows;
}

/* ---------------------------------------------------------------- 战役 */

function campaignState(state) {
  const stage = state.campaign.stage;
  return CAMPAIGN[Math.min(stage, CAMPAIGN.length - 1)];
}

/** 下一步该去哪——只指路，不剧透后面的事 */
const CAMPAIGN_HINT = {
  reach_chenliu: '往东走到陈留。路上别停，西凉步卒会追。',
  troops_30: '在陈留一带招兵，凑到 30 人；市集里也备点粮。',
  win_puyang: '带上 45 人以上去濮阳。黄巾余部就在城外截粮，到了就开打。',
  troops_60_food: '募到 60 人、粮草备足 80。人不够就往北走，去了乌巢也是送。',
  win_wuchao: '带 90 人以上回官渡。到了就会有一场硬仗。',
  take_xiapi: '南下打下邳。',
  win_chibi: '去赤壁或柴桑，水战自己会来。',
  win_yiling: '去夷陵。',
  troops_120: '白门楼后收拢降卒，把队伍补到 120 人。',
  reach_shouchun: '南下寿春，看看淮南的粮市。',
  reach_xiakou: '再往南到夏口，借船过江。',
  win_final: '带 250 人以上，打进任意一座都城（许昌 / 成都 / 建业 / 邺）。',
};

function campaignInfo(state) {
  if (!state || !state.campaign) return null;
  if (state.campaign.stage >= CAMPAIGN.length) {
    return { done: true, total: CAMPAIGN.length, index: CAMPAIGN.length };
  }
  const ch = CAMPAIGN[state.campaign.stage];
  if (!ch) return null;
  return {
    index: state.campaign.stage,
    total: CAMPAIGN.length,
    id: ch.id,
    title: ch.title,
    goal: ch.goal,
    hint: CAMPAIGN_HINT[ch.check] || ch.goal,
    check: ch.check,
  };
}

function advanceCampaign(state) {
  const c = state.campaign;
  if (c.stage >= CAMPAIGN.length) return;
  const ch = CAMPAIGN[c.stage];
  if (!ch) return;
  if (checkCampaign(state, ch.check)) {
    c.done.push(ch.id);
    state.flags.campaignDone.push(ch.id);
    if (ch.reward) {
      if (ch.reward.renown) state.player.renown += ch.reward.renown;
      if (ch.reward.gold) state.player.gold += ch.reward.gold;
      if (ch.reward.food) state.player.food += ch.reward.food;
      if (ch.reward.shi) state.player.shi += ch.reward.shi;
      if (ch.reward.banner) {
        state.player.banner = true;
        state.player.flagName = '旗 · ' + state.player.name;
      }
    }
    c.stage += 1;
    if (ch.id === 'prologue') {
      state.parties = state.parties.filter(function (p) { return !p.scripted; });
    }
    // 卡片是"下一章开场"：让人先看见接下来的故事，而不是回头讲上一章
    const next = CAMPAIGN[c.stage];
    state.events.push({ type: 'chapter', chapterId: next ? next.id : ch.id });
    pushLog(state, '【' + ch.title + '】' + (ch.after || ''));
    advanceCampaign(state);
  }
}

function checkCampaign(state, key) {
  const p = state.player;
  const count = army.troopCount(p.troops);
  if (key === 'reach_chenliu') {
    // 步卒会一路追到陈留；进了陈留城，序章追兵就撤了
    return p.atSiteId === 'chenliu';
  }
  if (key === 'troops_30') {
    if (count >= 30) return true;
    return false;
  }
  if (key === 'win_wuchao') return !!state.flags['win_act2'];
  if (key === 'win_puyang') return !!state.flags['win_act1b'];
  if (key === 'troops_60_food') return count >= 60 && p.food >= 80;
  if (key === 'take_xiapi') {
    const s = siteById(state.world, 'xiapi');
    return !!(s && s.playerOwned) || !!state.flags.lvbuBeaten || !!state.flags['win_act3'];
  }
  if (key === 'win_chibi') return !!state.flags['win_act4'];
  if (key === 'win_yiling') return !!state.flags['win_act5'];
  if (key === 'troops_120') return count >= 120;
  if (key === 'reach_shouchun') return p.atSiteId === 'shouchun';
  if (key === 'reach_xiakou') return p.atSiteId === 'xiakou';
  if (key === 'win_final') return !!state.flags['win_final'];
  return false;
}

/** 当前这一章，在哪个据点能打出关键一仗 */
function campaignObjective(state, site) {
  if (!site) return null;
  const ch = CAMPAIGN[state.campaign.stage];
  const id = ch && ch.id;
  if (id === 'act1b' && site.id === 'puyang') return { id: 'puyang_raid', name: '黄巾余部', needTroops: 45 };
  if (id === 'act2' && site.id === 'guandu') return { id: 'wuchao', name: '乌巢粮营', needTroops: 90 };
  if (id === 'act4' && (site.id === 'chibi' || site.id === 'chaisang')) return { id: 'chibi', name: '曹操水寨' };
  if (id === 'act5' && site.id === 'yiling') return { id: 'yiling', name: '连营守军' };
  if (id === 'final' && ['xuchang', 'chengdu', 'jianye', 'ye'].indexOf(site.id) >= 0) {
    return { id: 'final', name: '无旗亲军', needTroops: 250 };
  }
  return null;
}

/** 战役触发的特殊战斗：回到地图某处时开打 */
function tryCampaignBattle(state) {
  const p = state.player;
  if (!p.atSiteId) return null;
  const nowH = gameHours(state);
  // 刚被打退的话先喘口气，别在城门口反复送人头
  if (state.flags.campaignCool && nowH < state.flags.campaignCool) return null;
  const site = siteById(state.world, p.atSiteId);
  const obj = campaignObjective(state, site);
  if (!obj) return null;
  if (obj.needTroops && army.troopCount(p.troops) < obj.needTroops) return null;
  state.flags.campaignCool = nowH + 24;
  return startCampaignBattle(state, obj.id);
}

/** 战役好感/后果：乌巢一把火，袁军全线松动 */
function applyCampaignEffect(state, id) {
  if (id === 'act1b') {
    state.flags['win_act1b'] = true;
    pushLog(state, '濮阳城外的黄巾散了，粮车一辆不少地推进了城。');
  } else if (id === 'act2') {
    state.flags['win_act2'] = true;
    changeRelation(state, 'yuan', -70);
    state.world.sites.forEach(function (s) {
      if (s.ownerFaction === 'yuan') {
        s.garrison = Math.max(10, Math.round(s.garrison * 0.5));
        s.garrisonBase = Math.max(10, Math.round(s.garrisonBase * 0.5));
      }
    });
    pushLog(state, '袁军粮道断了。邺城以南的守军跑了一半。');
  } else if (id === 'act4') {
    state.flags['win_act4'] = true;
    changeRelation(state, 'wei', -50);
    changeRelation(state, 'wu', 30);
    pushLog(state, '曹操的水寨烧成一片焦土。江东的船，从此不怕北边。');
  } else if (id === 'act5') {
    state.flags['win_act5'] = true;
    changeRelation(state, 'shu', -70);
    pushLog(state, '七百里连营，一夜之间只剩灰。');
  } else if (id === 'final') {
    state.flags['win_final'] = true;
    state.flags.storyDone = true;
    // 主线走完不结算结局：把笔放下，让人继续在这张地图上走
    pushLog(state, '主线走完了。你没有再听见“回头”的声音。从此可以自由地在这片三国战场上攻城、守城、结交或背叛，直到有一天你把所有城都踩在脚下。');
    state.events.push({
      type: 'warning',
      text: '主线已走完。从现在起，没有下一页催你；你可以自由享受这场三国战场。',
    });
  }
}

/* ---------------------------------------------------------------- 封领主 */

/** 按等级给出目标编制：等级越高，能带的兵越多，兵种也更齐 */
function lordRosterForLevel(level, total) {
  const lv = Math.max(1, Math.min(10, Math.round(Number(level) || 1)));
  const size = Math.max(1, Math.round(Number(total) || 1));
  const cav = lv >= 7 ? Math.round(size * 0.18) : 0;
  const spear = lv >= 4 ? Math.round(size * 0.24) : 0;
  const out = { militia: Math.max(0, size - cav - spear) };
  if (spear > 0) out.spear = spear;
  if (cav > 0) out.cav = cav;
  return out;
}

/**
 * 把队里的英雄封成领主：必须先指定一块城/村作为封地，
 * 有了封地他才能离开主角的队伍，自己带兵出去。
 */
function promoteHero(state, heroId, siteId) {
  const p = state.player;
  const hero = (p.heroes || []).filter(function (h) { return h.id === heroId; })[0];
  if (!hero) return { ok: false, msg: '队伍里没有这个人' };
  const site = siteById(state.world, siteId);
  if (!site) return { ok: false, msg: '先给他选一块封地，他才能出镇' };
  if (site.type === 'camp') return { ok: false, msg: '山寨不能当封地' };
  if (!site.playerOwned) return { ok: false, msg: '这块地方不是你的' };
  const current = siteLord(state, site);
  if (current) return { ok: false, msg: site.name + '已经封给' + current.name + '了，先收回再封' };

  const lv = Math.max(1, Math.min(10, Math.round(hero.level || 1)));
  const heroDef = heroes.heroById(hero.id) || {};
  const heroName = heroDef.name || hero.name || hero.id;
  const id = 'hero_' + hero.id;
  if (state.lords.some(function (l) { return l.id === id; })) {
    return { ok: false, msg: '他已经在外头带兵了' };
  }

  // 目标编制按等级走，封地封多大就带多少；刚出镇只带一半，之后在封地补满
  const full = lordRosterForLevel(lv, lordCapForLevel(lv));
  const troops = {};
  Object.keys(full).forEach(function (tid) {
    const n = Math.max(0, Math.round(full[tid] * 0.55));
    if (n > 0) troops[tid] = n;
  });
  const lord = {
    id: id,
    name: heroName,
    title: '你的家臣',
    faction: p.faction && FACTIONS[p.faction] ? p.faction : 'player',
    home: site.id,
    level: lv,
    x: site.x,
    y: site.y,
    troops: deepCopy(troops),
    morale: 80,
    sight: 6,
    chasing: false,
    alive: true,
    respawnDay: 0,
    defTroops: deepCopy(full),
    wander: null,
    dead: false,
    retired: false,
    prisoner: null,
    hidden: null,
    resting: false,
    hero: true,
    independent: true,
  };
  site.lordId = lord.id;
  state.lords.push(lord);
  p.heroes = p.heroes.filter(function (h) { return h.id !== heroId; });
  p.renown += 40;
  const startCount = army.troopCount(troops);
  pushLog(state, '你把' + heroName + '封为' + site.name + '的领主，拨了' + startCount +
    ' 名乡勇。他跪下磕了个头，第二天就带着人出镇了。', 'fief');
  return {
    ok: true,
    msg: heroName + '封为' + site.name + '领主（Lv' + lv + ' · 上限 ' + lordTroopCap(lord) + ' 兵，声望 +40）',
    lordId: id,
    siteId: site.id,
  };
}

/* ---------------------------------------------------------------- 牢里的人 */

/** 招降牢里的人：有主替主上收，自立就收成自己的领主 */
function recruitPrisoner(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) {
    return x.lordId === lordId && x.by === 'player';
  })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  return war.recruitLord(state, lordId);
}

/** 杀了牢里的人：与那家从此结下血债；一个月内无法议和，之后赔款翻倍 */
function executePrisoner(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) {
    return x.lordId === lordId && x.by === 'player';
  })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  const fac = lord.faction;
  const wasRuler = isFactionRuler(state, lord);
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  // 斩将得赏金：对方越有分量，首级越值钱；但也会彻底得罪那一国
  const bounty = 120 + Math.round(war.weight(lord.defTroops || lord.troops || {}) / 2);
  state.player.gold += bounty;
  state.player.renown += 25;
  lord.prisoner = null;
  war.killLord(state, lord);
  if (wasRuler && fac && FACTIONS[fac]) {
    state.noPeaceForever = state.noPeaceForever || {};
    state.noPeaceForever[fac] = true;
    if (state.peaceOfferPending === fac) state.peaceOfferPending = null;
    successionAfterRulerKilled(state, lord);
  }
  state.killRecords = state.killRecords || {};
  if (fac) state.killRecords[fac] = state.clock.day;
  pushLog(state, '你把' + lord.name + '推出营门斩了，得赏金 ' + bounty + ' 金钱、声望 +25。' +
    (FACTIONS[fac] ? FACTIONS[fac].full : '那家') + (wasRuler
      ? '与你不死不休，永世不会议和。'
      : '与你结下血债，一个月内议和必被驳回。'));
  return {
    ok: true,
    bounty: bounty,
    msg: lord.name + '已斩，得 ' + bounty + ' 金钱。' + (FACTIONS[fac] ? FACTIONS[fac].full : '那家') +
      (wasRuler ? '与你永世不议和。' : '跟你结下血债：一个月内无法议和，之后赔款翻倍。'),
    killed: true,
    ruler: wasRuler,
  };
}

/** 战果页处置败将：放走（换人情）或押进牢里（之后可招降/斩） */
function resolveDefeatedLord(state, action) {
  const pending = state.postBattleLord;
  if (!pending) return { ok: false, msg: '阵前没有等着处置的人' };
  const lord = state.lords.filter(function (l) { return l.id === pending.lordId; })[0];
  if (!lord) { state.postBattleLord = null; return { ok: false, msg: '人已经不在了' }; }
  if (action === 'capture') {
    if (lord.arcNoCapture) {
      return { ok: false, msg: '天下皆反时，这些反贼不会让你生擒；只能放他回去。' };
    }
    war.capture(state, lord, 'player', '你');
    const gold = 60 + Math.round(war.weight(lord.defTroops || {}) / 5);
    lord.ransom = gold;
    const p = (state.prisoners || [])[(state.prisoners || []).length - 1];
    if (p) p.ransom = gold;
    state.postBattleLord = null;
    pushLog(state, '你把' + lord.name + '押进牢里，等着他家人拿 ' + gold + ' 金钱来赎。', 'war');
    return { ok: true, action: 'capture', lordId: lord.id, ransom: gold,
      msg: lord.name + '已押进牢里（赎金 ' + gold + ' 金钱）', note: '生擒 ' + lord.name + ' · 已押进牢里' };
  }
  if (action === 'release') {
    war.freeLord(state, lord, '你把' + lord.name + '放回马下。他抱拳，没有多说。');
    state.postBattleLord = null;
    state.player.renown += 5;
    return { ok: true, action: 'release', lordId: lord.id,
      msg: '放走了' + lord.name + '，声望 +5', note: lord.name + ' 被你放走' };
  }
  return { ok: false, msg: '只能放走或押入牢中' };
}

/* ---------------------------------------------------------------- 灭国 *//** 史实里的改换门庭：被灭的那家散了，这些人该跟谁走 */
const DEFECT_TO = {
  gaoshun: 'wei', houcheng: 'wei', songxian: 'wei', weixu: 'wei',
  wenpin: 'wei', zhangyun: 'wei', wangwei: 'wei',
  wuyi: 'shu', leitong: 'shu', lengbao: 'shu', liugui: 'shu',
  guotu: 'wei', lvkuang: 'wei', lvxiang: 'wei',
  pangde: 'wei', maxiu: 'shu', matie: 'shu', chengyin: 'wei',
  huangfusong: 'wei', zhujun: 'wei', luzhi: 'wei',
};

/** 宁死不降的：解甲归乡里，从此不在地图上 */
const LOYAL_GONE = {
  chengong: true, zhangren: true, dongcheng: true, guanyu: true,
};

/** 这个势力还算不算活着：只要还有一座城（或一支野外的队伍）就活着 */
function factionAlive(state, id) {
  if (!FACTIONS[id]) return false;
  const sites = state.world.sites.filter(function (s) { return s.ownerFaction === id && s.type !== 'camp'; });
  if (sites.length > 0) return true;
  const parties = state.parties.filter(function (p) { return p.faction === id; });
  return parties.length > 0;
}

function factionLord(state, id) {
  const fs = state.factionState && state.factionState[id];
  if (fs && fs.rulerId) {
    const byId = state.lords.filter(function (l) { return l.id === fs.rulerId; })[0];
    if (byId && byId.alive && !byId.dead && !byId.retired) return byId;
  }
  if (fs && fs.rulerName) {
    const byRuler = state.lords.filter(function (l) {
      return l.faction === id && l.name === fs.rulerName && l.alive && !l.dead && !l.retired;
    })[0];
    if (byRuler) return byRuler;
  }
  const name = (FACTIONS[id] || {}).lord;
  const byName = state.lords.filter(function (l) { return l.faction === id && l.name === name; })[0];
  if (byName) return byName;
  return state.lords.filter(function (l) { return l.faction === id && l.alive; })[0] || null;
}

function isFactionRuler(state, lord) {
  if (!state || !lord || !lord.faction) return false;
  if (lord.faction === 'player' || lord.faction === 'bandit') return false;
  return factionLord(state, lord.faction) === lord;
}

/** 给继任的新君凑一副班底：用老君主的编制折半，没有就按普通诸侯起家 */
function successorTroops(oldLord) {
  const out = {};
  const base = (oldLord && oldLord.defTroops) || {};
  Object.keys(base).forEach(function (id) {
    const n = Math.max(4, Math.round((base[id] || 0) * 0.45));
    if (n > 0) out[id] = n;
  });
  if (!Object.keys(out).length) {
    out.militia = 26;
    out.spear = 18;
    out.cav = 6;
  }
  return out;
}

function successorHome(state, fac, oldLord) {
  const oldHome = oldLord && siteById(state.world, oldLord.home);
  if (oldHome && (oldHome.ownerFaction === fac || oldHome.playerOwned && fac === 'player')) return oldHome;
  const owned = state.world.sites.filter(function (s) {
    return s.ownerFaction === fac && s.type !== 'camp';
  });
  if (!owned.length) return oldHome || null;
  const from = oldHome || oldLord || { x: state.world.w / 2, y: state.world.h / 2 };
  let best = owned[0];
  let bestD = Infinity;
  owned.forEach(function (s) {
    const d = Math.abs(s.x - from.x) + Math.abs(s.y - from.y);
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

function spawnSuccessor(state, fac, entry, oldLord) {
  const home = successorHome(state, fac, oldLord);
  const spot = home ? findFreeSpotNear(state, home.x, home.y, 2) : null;
  const def = {
    id: entry.id,
    name: entry.name,
    title: entry.title || '新君',
    faction: fac,
    home: home ? home.id : (oldLord && oldLord.home),
    soldiers: successorTroops(oldLord),
    morale: 80,
    sight: 7,
  };
  const lord = lordFromDef(state, def);
  lord.rank = 'king';
  lord.level = 9;
  if (!home && oldLord) {
    lord.x = oldLord.x;
    lord.y = oldLord.y;
  } else if (spot) {
    lord.x = spot.x;
    lord.y = spot.y;
  }
  state.lords.push(lord);
  return lord;
}

function installRuler(state, fac, lord, oldLord) {
  const home = successorHome(state, fac, oldLord);
  lord.alive = true;
  lord.dead = false;
  lord.retired = false;
  lord.hidden = null;
  lord.prisoner = null;
  lord.chasing = false;
  lord.order = null;
  lord.defending = null;
  lord.faction = fac;
  lord.rank = 'king';
  lord.level = Math.max(9, lord.level || 9);
  if (!lord.defTroops || !Object.keys(lord.defTroops).length) lord.defTroops = successorTroops(oldLord);
  if (!army.troopCount(lord.troops || {})) {
    lord.troops = takeSomeTroops(lord.defTroops, Math.max(12, Math.round(army.troopCount(lord.defTroops) * 0.55)));
  }
  if (home) {
    lord.home = home.id;
    lord.inCity = null;
    const spot = findFreeSpotNear(state, home.x, home.y, 2);
    if (spot) { lord.x = spot.x; lord.y = spot.y; }
    if (!home.lordId || (oldLord && home.lordId === oldLord.id)) home.lordId = lord.id;
  }
  lord.morale = Math.max(lord.morale || 70, 76);

  const fs = state.factionState[fac] || (state.factionState[fac] = {});
  fs.rulerId = lord.id;
  fs.rulerName = lord.name;
  fs.rulerSinceDay = state.clock.day;
  FACTIONS[fac].lord = lord.name;
  FACTIONS[fac].full = lord.name;
  if (oldLord && lord.name.charAt(0) !== oldLord.name.charAt(0)) {
    FACTIONS[fac].banner = lord.name.charAt(0);
  }

  state.events.push({
    type: 'succession',
    factionId: fac,
    title: (FACTIONS[fac].name || FACTIONS[fac].full) + '国换了新君',
    lines: [
      (oldLord ? oldLord.name : '旧主') + '的首级传回国内，宗亲与旧部在灵前拥立' + lord.name + '。',
      '「' + (FACTIONS[fac].full || lord.name) + '」的旗没有倒，王位先由' + lord.name + '接下。',
      '杀君之仇未消：这一家与你不死不休，任何议和文书都会被退回。',
    ],
  });
  pushLog(state, (oldLord ? oldLord.name : '旧主') + '被斩，' + (FACTIONS[fac].full || lord.name) +
    '由' + lord.name + '继位。丧钟未停，边境的烽火已经点起来了。', 'throne');
  return lord;
}

/** 表里的人都死光了：从本势力活着的领主里挑。优先本地，再看官职与带兵。 */
function fallbackSuccessor(state, fac, oldLord) {
  const candidates = state.lords.filter(function (l) {
    return l && l.faction === fac && l.alive && !l.dead && !l.retired && !l.prisoner && !l.hidden;
  });
  if (!candidates.length) return null;
  const oldHome = oldLord && siteById(state.world, oldLord.home);
  const dist = function (l) {
    if (!oldHome) return 0;
    const home = siteById(state.world, l.home) || l;
    return Math.abs(home.x - oldHome.x) + Math.abs(home.y - oldHome.y);
  };
  const rankScore = { king: 100, lord: 60, general: 20 };
  const sorted = candidates.slice().sort(function (a, b) {
    const rr = (rankScore[lordRank(b)] || 0) - (rankScore[lordRank(a)] || 0);
    if (rr) return rr;
    return dist(a) - dist(b);
  });
  // 官职大、地理近的排前面；最后在最优的三四人里掷一次，保留一点乱世偶然性。
  const pool = sorted.slice(0, Math.min(3, sorted.length));
  return pool[state.rng.int(0, pool.length - 1)];
}

/** 君主被斩：按继任表换君；表用完了就从本地、高官职的领主里选 */
function successionAfterRulerKilled(state, oldLord) {
  if (!state || !oldLord || !oldLord.faction) return null;
  const fac = oldLord.faction;
  if (!FACTIONS[fac] || fac === 'player' || fac === 'bandit') return null;
  if (!factionAlive(state, fac)) return null;
  const fs = state.factionState[fac] || (state.factionState[fac] = {});
  const table = (SUCCESSION[fac] || []).slice();
  let index = Math.max(0, Number(fs.successorIndex) || 0);
  let chosen = null;

  for (let i = index; i < table.length; i++) {
    const entry = table[i];
    if (!entry || !entry.id) continue;
    const existing = state.lords.filter(function (l) { return l.id === entry.id; })[0];
    if (existing) {
      if (existing.faction !== fac || existing.dead || existing.retired || existing.hidden || existing.prisoner) continue;
      if (!existing.alive) continue;
      chosen = existing;
      index = i + 1;
      break;
    }
    chosen = spawnSuccessor(state, fac, entry, oldLord);
    index = i + 1;
    break;
  }

  if (!chosen) {
    chosen = fallbackSuccessor(state, fac, oldLord);
    index = table.length;
  }
  fs.successorIndex = index;
  if (!chosen) return null;
  return installRuler(state, fac, chosen, oldLord);
}

function takeSomeTroops(base, n) {
  const out = {};
  let put = 0;
  Object.keys(base || {}).forEach(function (id) {
    if (put >= n) return;
    const take = Math.min(base[id], n - put);
    if (take > 0) { out[id] = take; put += take; }
  });
  return out;
}

/** 某势力离这里最近的城，拿不到城就返回 9999 */
function nearestFactionCity(state, id, from) {
  let best = 9999;
  state.world.sites.forEach(function (s) {
    if (s.ownerFaction !== id || s.type === 'camp') return;
    const d = Math.abs(s.x - from.x) + Math.abs(s.y - from.y);
    if (d < best) best = d;
  });
  return best;
}

/** 势力亡了：残部按眼下所处位置就近择主；玩家自立且有城，也算一家 */
function pickFactionFor(state, lord, from) {
  const here = (lord && (lord.x !== undefined ? { x: lord.x, y: lord.y } : null)) ||
    (lord && siteById(state.world, lord.home)) || { x: 0, y: 0 };
  const list = Object.keys(FACTIONS).filter(function (id) {
    if (id === 'bandit' || id === from || !FACTIONS[id]) return false;
    if ((state.factionState[id] || {}).dead) return false;
    if (id === 'player') {
      return state.player.faction === 'player' &&
        state.world.sites.some(function (s) { return s.playerOwned && s.type !== 'camp'; });
    }
    return true;
  });
  if (!list.length) return null;
  const withCity = list.filter(function (id) {
    return state.world.sites.some(function (s) { return s.ownerFaction === id && s.type !== 'camp'; });
  });
  const pool = withCity.length ? withCity : list;
  const scored = pool.map(function (id) {
    return { id: id, d: nearestFactionCity(state, id, here) };
  }).sort(function (a, b) { return a.d - b.d; });

  // 先看十格内：真有近邻就只在这些近邻里挑，别让隔了半张地图的曹刘来收人。
  const near = scored.filter(function (x) { return x.d <= 10; });
  const top = (near.length ? near : scored).slice(0, 3);
  return top[state.rng.int(0, top.length - 1)].id;
}

function moveLordToFaction(state, lord, target) {
  // 投过去也要落在离他最近的那座城，不要一脚跨到地图另一头
  const cities = state.world.sites.filter(function (s) {
    return s.ownerFaction === target && s.type !== 'camp';
  }).sort(function (a, b) {
    const da = Math.abs(a.x - lord.x) + Math.abs(a.y - lord.y);
    const db = Math.abs(b.x - lord.x) + Math.abs(b.y - lord.y);
    return da - db;
  });
  const city = cities[0];
  lord.faction = target;
  if (city) {
    lord.home = city.id;
    // 旧旗的封地收回；新投的城如果还没封主，就由他接
    state.world.sites.forEach(function (s) {
      if (s.lordId === lord.id && s.ownerFaction !== target) s.lordId = null;
    });
    if (!city.lordId) city.lordId = lord.id;
    const spot = findFreeSpotNear(state, city.x, city.y, 2) || city;
    lord.x = spot.x;
    lord.y = spot.y;
  }
  lord.alive = true;
  lord.chasing = false;
  lord.resting = false;
  lord.hidden = null;
  lord.troops = takeSomeTroops(lord.defTroops, Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.4)));
  lord.respawnDay = 0;
}

/** 一个势力连城带人都没了，满七天：亡国 */
function fallFaction(state, id) {
  const fs = state.factionState[id] || (state.factionState[id] = {});
  fs.dead = true;
  fs.deadDay = state.clock.day;
  const rng = state.rng;
  const lines = [];
  const ruler = factionLord(state, id);

  if (ruler && ruler.alive) {
    // 国亡了，君主不再“倔强”：他不肯立刻举旗投人，但会藏起来，等一个够分量的招降者
    const villages = state.world.sites.filter(function (s) { return s.type === 'village'; });
    const v = villages.length ? villages[rng.int(0, villages.length - 1)] : null;
    ruler.alive = false;
    ruler.chasing = false;
    ruler.troops = {};
    ruler.prisoner = null;
    ruler.inCity = null;
    ruler.hidden = { siteId: v ? v.id : null, since: state.clock.day, faction: id };
    fs.fate = 'hidden';
    fs.hiddenLordId = ruler.id;
    fs.hiddenSiteId = v ? v.id : null;
    lines.push('有人说' + ruler.name + '没死，一个人往' + (v ? v.name : '南边') + '去了。国没了，他那面旗也收了，但人还在。');
  } else if (ruler) {
    fs.fate = ruler.dead ? 'killed' : 'gone';
    lines.push('“' + ruler.name + '”这个名字，从今天的榜文上划掉了。');
  }

  // 剩下的领主：史实里该投谁就投谁，宁死不降的散归乡里
  const others = state.lords.filter(function (l) {
    return l.faction === id && l.alive && l !== ruler && !l.factionStateFixed;
  });
  const gone = [];
  others.forEach(function (l) {
    if (LOYAL_GONE[l.id]) {
      l.alive = false;
      l.retired = true;
      l.troops = {};
      gone.push(l.name);
      return;
    }
    const target = pickFactionFor(state, l, id);
    if (!target) {
      l.alive = false;
      l.retired = true;
      l.troops = {};
      return;
    }
    moveLordToFaction(state, l, target);
    lines.push(l.name + '带着残部投了' + (FACTIONS[target].full || target) + '。');
  });
  if (gone.length) {
    lines.push(gone.slice(0, 4).join('、') + '不肯降，解甲归乡里去了。');
  }

  // 这个势力的旗从此从地图上撤掉（跟你的旧关系留着：村里那个隐者还认这个）
  state.world.sites.forEach(function (s) {
    if (s.ownerFaction === id) s.ownerFaction = null;
  });
  pushLog(state, '【' + (FACTIONS[id].full || id) + '】亡了。');
  state.events.push({
    type: 'faction-fall',
    factionId: id,
    title: (FACTIONS[id].full || id) + ' 亡了',
    fate: fs.fate || 'killed',
    lines: lines,
  });
}

/** 每日：灭国倒计时（连着七天没城没人，才算亡） */
function factionTick(state) {
  if (!state.factionState) state.factionState = {};
  Object.keys(FACTIONS).forEach(function (id) {
    if (id === 'bandit' || id === 'player') return;
    const fs = state.factionState[id] || (state.factionState[id] = {});
    if (fs.dead) return;
    if (factionAlive(state, id)) {
      if (fs.doomDays) {
        pushLog(state, (FACTIONS[id].full || id) + '又重新站住了。');
      }
      fs.doomDays = 0;
      fs.doomDay = 0;
      return;
    }
    fs.doomDays = (fs.doomDays || 0) + 1;
    if (fs.doomDays === 1) {
      fs.doomDay = state.clock.day;
      pushLog(state, (FACTIONS[id].full || id) + '连一座城都没有了，旗下的人也不见踪影。七天之内还是这样，就算亡了。');
    }
    if (fs.doomDays >= 7) fallFaction(state, id);
  });
}

/** 酒馆打听：花钱问出隐居的旧主在哪个村 */
function tavernRumor(state) {
  if (!state.knownHidden) state.knownHidden = {};
  const cost = 40;
  const hidden = state.lords.filter(function (l) {
    return l.hidden && l.hidden.siteId && !state.knownHidden[l.id];
  });
  if (!hidden.length) return { ok: false, msg: '酒馆里的人摇头：没听说谁还在世上。' };
  if (state.player.gold < cost) return { ok: false, msg: '打听要 ' + cost + ' 金钱，你身上不够。' };
  state.player.gold -= cost;
  const target = hidden[state.rng.int(0, hidden.length - 1)];
  state.knownHidden[target.id] = target.hidden.siteId;
  const site = siteById(state.world, target.hidden.siteId);
  return {
    ok: true,
    msg: '酒馆里的人压低声音：' + target.name + '就在' + (site ? site.name : '某处小村') + '。',
    lordId: target.id,
    siteId: target.hidden.siteId,
  };
}

/** 村里隐居的人：只在你打听过、且这家跟你关系够的时候露面 */
function hiddenLordsAt(state, siteId) {
  return state.lords.filter(function (l) {
    return l.hidden && l.hidden.siteId === siteId;
  });
}

function hiddenLordVisible(state, lord) {
  if (!lord || !lord.hidden) return false;
  if (!state.knownHidden || state.knownHidden[lord.id] !== lord.hidden.siteId) return false;
  // 国亡了，旧主不再端着架子；只要你打听出来，就能上门谈
  if ((state.factionState[lord.hidden.faction] || {}).dead) return true;
  const rel = state.relations[lord.hidden.faction] || 0;
  return rel >= 60;
}

/** 请隐居的旧主出山：跟着你干 */
function recruitHiddenLord(state, siteId) {
  const lord = hiddenLordsAt(state, siteId)[0];
  if (!lord) return { ok: false, msg: '这里没有这样的人。' };
  if (!hiddenLordVisible(state, lord)) return { ok: false, msg: '村里人不肯多说这个人的事。' };
  if (lord.arcNoRecruit || lord.arcEnemy) {
    return { ok: false, msg: '天下皆反。这位旧主已经举起了反旗，不会再跟你走。' };
  }
  if (state.clock.day < (lord.recruitCoolDay || 0)) {
    return { ok: false, cooldown: true, waitDays: (lord.recruitCoolDay || 0) - state.clock.day,
      msg: lord.name + '把门掩上：“让我再想几天。”' };
  }
  lord.recruitCoolDay = state.clock.day + 3;
  const deadFaction = !!(state.factionState[lord.hidden.faction] || {}).dead;
  const rel = state.relations[lord.hidden.faction] || 0;
  const chance = deadFaction ? 0.55 + Math.max(0, rel) / 250 : 0.35 + rel / 200;
  if (state.rng.next() > chance) {
    return { ok: false, msg: lord.name + '摇了摇头：' + (FACTIONS[lord.hidden.faction] ? FACTIONS[lord.hidden.faction].full : '故国') + '的旗，他扛不动第二面了。' };
  }
  const target = state.player.faction || 'player';
  lord.hidden = null;
  lord.alive = true;
  lord.faction = target;
  lord.dead = false;
  lord.retired = false;
  const home = state.world.sites.filter(function (s) { return s.ownerFaction === target && s.type !== 'camp'; })[0]
    || state.world.sites.filter(function (s) { return s.playerOwned; })[0]
    || siteById(state.world, lord.home);
  if (home) {
    lord.home = home.id;
    lord.x = home.x;
    lord.y = home.y;
  }
  lord.troops = takeSomeTroops(lord.defTroops, Math.max(8, Math.round(army.troopCount(lord.defTroops) * 0.5)));
  state.player.renown += 60;
  pushLog(state, '你在' + (siteById(state.world, siteId) ? siteById(state.world, siteId).name : '村里') + '请出了' + lord.name + '。他只带了半副甲。');
  return { ok: true, msg: lord.name + '跟你走了（声望 +60）', lordId: lord.id };
}

/* ---------------------------------------------------------------- 天机简·广告 */

const AD_SHI_MAX = 5;      // 一天最多 5 次，每次 2 支，共 10 支
const AD_SHI_PER = 2;

function adShiInfo(state) {
  if (!state || !state.player) return { max: AD_SHI_MAX, used: 0, left: 0, shiPer: AD_SHI_PER };
  const p = state.player;
  if (p.adShiDay !== state.clock.day) {
    p.adShiDay = state.clock.day;
    p.adShiCount = 0;
  }
  return {
    day: state.clock.day,
    max: AD_SHI_MAX,
    used: p.adShiCount || 0,
    left: Math.max(0, AD_SHI_MAX - (p.adShiCount || 0)),
    shiPer: AD_SHI_PER,
  };
}

/** 看完一次激励视频后领取；真实广告 SDK 在 runtime.showRewardedAd 里 */
function claimAdShi(state) {
  const info = adShiInfo(state);
  if (info.left <= 0) {
    return { ok: false, msg: '今天的十支天机简已经领完了，明日再来。', info: info };
  }
  state.player.adShiCount = (state.player.adShiCount || 0) + 1;
  state.player.shi += AD_SHI_PER;
  pushLog(state, '你看完一段军情广告，从局内商店领走 ' + AD_SHI_PER + ' 支天机简。');
  return {
    ok: true,
    msg: '领到 ' + AD_SHI_PER + ' 支天机简（今日 ' + (state.player.adShiCount) + '/' + AD_SHI_MAX + ' 次）',
    info: adShiInfo(state),
  };
}

/* ---------------------------------------------------------------- 天机简 */

function useHistory(state, markId) {
  const p = state.player;
  if (!state.battle) return { ok: false, msg: '现在没有在打仗' };
  if (p.shi <= 0) return { ok: false, msg: '天机简用完了' };
  if (state.battle.finished) return { ok: false, msg: '仗已经打完了' };
  if (state.battle.shiMark) return { ok: false, msg: '这一战你已经落过一笔' };
  const marks = __require(5).HISTORY_MARKS;
  if (!marks[markId]) return { ok: false, msg: '写不出这一笔' };
  p.shi -= 1;
  p.shiUsed += 1;
  state.battle.applyShiMark(markId);
  // 天机简只帮忙，不留后患；用掉就算，不再扣天下关系
  pushLog(state, marks[markId].text + ' 天机简上的字化作一道光，没留下任何反噬。');
  return { ok: true, msg: marks[markId].name };
}

/* ---------------------------------------------------------------- 胜负 · 统一后的长夜 */

const MAJOR_SITE_TYPES = { town: true, castle: true };

function majorSites(state) {
  return state.world.sites.filter(function (s) { return MAJOR_SITE_TYPES[s.type]; });
}

/** 天下是不是已经全归玩家（自立）或玩家效忠的那一家（臣子） */
function allMajorSitesOwned(state) {
  const p = state.player;
  const major = majorSites(state);
  if (!major.length) return false;
  return major.every(function (s) {
    if (s.playerOwned) return true;
    return !!(p.faction && p.faction !== 'player' && s.ownerFaction === p.faction);
  });
}

/** 第一次统一：不结束游戏，先让人站在城头看三十天 */
function startUnification(state) {
  if (state.arc) return false;
  const p = state.player;
  const day = state.clock.day;
  state.arc = {
    phase: 'celebration',
    startDay: day,
    disasterDay: day + 30,
    exileSiteId: null,
    finaleDay: 0,
    loyalLords: [],
  };
  p.renown += 300;
  p.gold += 600;
  pushLog(state, '【天下归一】你站在都城的城楼上，看见四面城门都挂着自己的旗。三十天后，一场大旱会从西边来。');
  state.events.push({
    type: 'arc', phase: 'celebration',
    title: '天下归一',
    lines: [
      p.faction && p.faction !== 'player' && FACTIONS[p.faction]
        ? '你随着' + FACTIONS[p.faction].full + '的旗，走到了最后一座城。'
        : '你把自己的旗插上了最后一座城。',
      '各地使者排队递上降表，你在城楼上站了很久。',
      '从今天起，天下只有一个年号。只是西边的云，已经开始发黄。',
    ],
  });
  return true;
}

/** 找一块地图边缘、能走的空地，放下那座“这时才出现”的边陲小城 */
function makeExileSite(state) {
  if (state.arc && state.arc.exileSiteId) {
    return siteById(state.world, state.arc.exileSiteId);
  }
  const world = state.world;
  const spots = [];
  for (let y = 2; y < world.h - 2; y += 1) {
    for (let x = 2; x < world.w - 2; x += 1) {
      const edge = Math.min(x, y, world.w - 1 - x, world.h - 1 - y);
      if (edge > 5) continue;
      if (!isPassable(world, x, y)) continue;
      if (siteAt(world, x, y)) continue;
      const near = world.sites.some(function (s) {
        return Math.abs(s.x - x) + Math.abs(s.y - y) < 4;
      });
      if (near) continue;
      spots.push({ x: x, y: y, edge: edge });
    }
  }
  const pick = spots.sort(function (a, b) { return a.edge - b.edge; })[0];
  if (!pick) return null;
  const site = {
    id: 'exile_town',
    name: '边陲小城',
    type: 'town',
    x: pick.x,
    y: pick.y,
    region: regionAt(world, pick.x, pick.y),
    ownerFaction: 'player',
    playerOwned: true,
    lordId: null,
    selfFief: true,
    color: state.player.country && state.player.country.color ? state.player.country.color : '#d9a441',
    banner: state.player.country && state.player.country.name ? state.player.country.name : '旗',
    garrison: 24,
    garrisonBase: 24,
    recruitList: ['militia', 'spear'],
    recruitCap: 8,
    recruits: { militia: 6, spear: 3 },
    priceIndex: 1.15,
    blurb: '一座地图边缘的小城。城墙不高，却是你此刻唯一还能落脚的地方。',
    population: 900,
    foodStock: {},
    lordRecruits: { militia: 4, spear: 2 },
  };
  world.sites.push(site);
  world.factionGrid = null;
  if (state.arc) state.arc.exileSiteId = site.id;
  return site;
}

/** 第三十天：大旱、易子而食、天下皆反，玩家被赶出都城 */
function triggerDisaster(state) {
  if (!state.arc || state.arc.phase !== 'celebration') return;
  const p = state.player;
  const formerFaction = p.faction;
  const exile = makeExileSite(state);
  if (!exile) return;
  const day = state.clock.day;
  const oldSites = state.world.sites.filter(function (s) { return s.id !== exile.id; });

  oldSites.forEach(function (s) {
    if (s.playerOwned || s.ownerFaction === 'player' ||
        (formerFaction && formerFaction !== 'player' && s.ownerFaction === formerFaction)) {
      s.playerOwned = false;
      s.ownerFaction = 'bandit';
      s.lordId = null;
      s.selfFief = false;
      s.playerBlocked = true;
      s.garrison = Math.max(8, Math.round((s.garrisonBase || 20) * 0.6));
    }
    if (s.type !== 'camp') s.burned = true;
  });

  Object.keys(FACTIONS).forEach(function (id) {
    if (id === 'player') return;
    state.relations[id] = -100;
    state.wars[id] = true;
    if (id !== 'bandit') war.declare(state, 'player', id, true);
  });

  const loyal = [];
  state.lords.forEach(function (l) {
    // 从玩家队伍里出去的人，哪怕原先挂的是旧主的旗，也认你这个人
    const fromYourCamp = !!l.hero || l.faction === 'player' ||
      !!(formerFaction && l.faction === formerFaction && l.hero);
    if (fromYourCamp && l.alive) {
      l.arcEnemy = false;
      l.arcNoRecruit = false;
      l.arcNoCapture = false;
      l.faction = 'player';
      l.inCity = null;
      l.order = null;
      l.x = exile.x;
      l.y = exile.y;
      l.home = exile.id;
      loyal.push(l.id);
    } else {
      l.arcEnemy = true;
      l.arcNoRecruit = true;
      l.arcNoCapture = true;
    }
  });

  if (!p.country) p.country = { name: '汉', color: '#d9a441' };
  p.faction = 'player';
  p.gold = Math.max(0, Math.round(p.gold * 0.4));
  p.food = Math.min(army.foodCap(p.troops), 24);
  p.morale = Math.max(10, p.morale - 40);
  p.renown = Math.max(0, p.renown - 100);
  p.atSiteId = exile.id;
  p.x = exile.x;
  p.y = exile.y;
  p.route = [];
  p.stepFrom = null;
  p.stepTo = null;
  p.stepProgress = 0;
  if (state.playerSiege) state.playerSiege = null;
  state.arc.phase = 'reconquest';
  state.arc.disasterDay = day;
  state.arc.loyalLords = loyal;
  state.arc.famine = true;
  state.world.factionGrid = null;
  state.events.push({
    type: 'arc', phase: 'disaster',
    title: '大旱 · 天下皆反',
    lines: [
      '第三十天，西边的天一直黄着。井先干了，然后是河。',
      '粮价一天三涨，路边开始有人交换孩子。各地豪强把你的旗从城头扯下来，换上了自己的。',
      '你所在的城市被反贼围了。你带着还能走的旧部，从北门杀出去。',
      '天亮时，你在一座地图边缘的小城停下。城很小，但没有挂别人的旗。',
      '从今天起，全国都在捉拿你。只有从你队伍里出去的领主，还愿意站在你这边。',
    ],
  });
  pushLog(state, '【大旱 · 天下皆反】你失去所有城，退到边陲小城。天下皆敌，只有旧部还在。');
}

/** 再次统一：大赏四方，进入尾声选择 */
function triggerArcFinale(state) {
  if (!state.arc || state.arc.phase !== 'reconquest') return;
  state.arc.phase = 'finale';
  state.arc.finaleDay = state.clock.day;
  state.player.renown += 500;
  pushLog(state, '【重定天下】你带着旧部，从边陲小城一路打回都城。城门开时，城里的人跪了一地。');
  state.events.push({
    type: 'arc', phase: 'finale',
    title: '国泰民安',
    lines: [
      '你在大殿上摆下酒席，把从边陲一路跟来的旧部一个个叫到面前。',
      '封侯、赐地、赦天下。史官在殿下写：天下再定，百姓始安。',
      '你终于可以把刀放下。只是这片大陆的风，还没有停。',
    ],
  });
}

function checkVictory(state) {
  if (state.gameOver) return;
  if (state.arc) {
    if (state.arc.phase === 'reconquest' && allMajorSitesOwned(state)) triggerArcFinale(state);
    return;
  }
  if (allMajorSitesOwned(state)) startUnification(state);
}

/** 每天检查三十天灾变与再统一 */
function arcTick(state) {
  if (!state.arc) return;
  if (state.arc.phase === 'celebration' && state.clock.day >= state.arc.disasterDay) {
    triggerDisaster(state);
  } else if (state.arc.phase === 'reconquest' && allMajorSitesOwned(state)) {
    triggerArcFinale(state);
  }
}

function decideEnding(state) {
  const p = state.player;
  let type = 'self';
  if (p.faction === 'wei') type = 'ding';
  else if (p.faction === 'shu') type = 'xu';
  else if (p.faction === 'wu') type = 'fen';
  else type = 'self';

  const owned = state.world.sites.filter(function (s) { return s.playerOwned; }).length;
  let text = ENDINGS[type].text;
  if (type === 'ding') {
    text += '\n（你握有 ' + owned + ' 座城，用了 ' + p.shiUsed + ' 支天机简。）';
  } else if (type === 'xu') {
    text += '\n（名册上还剩 ' + army.troopCount(p.troops) + ' 个名字。）';
  } else if (type === 'fen') {
    text += '\n（你烧掉了 ' + p.shiUsed + ' 支天机简，地图上有 ' + owned + ' 座城没有主人。）';
  } else {
    text += '\n（你带 ' + army.troopCount(p.troops) + ' 人站在三方之外。）';
  }
  endGame(state, type, text, ENDINGS[type].title);
}

function endGame(state, ending, text, title) {
  state.gameOver = true;
  state.ending = { type: ending, text, title: title || '' };
  stopMoving(state);
  pushLog(state, '【' + (title || '终局') + '】' + text.split('\n')[0]);
}

/* ---------------------------------------------------------------- 存档 */

function serialize(state) {
  const copy = {
    version: SAVE_VERSION,
    seed: state.seed,
    clock: state.clock,
    world: state.world,
    player: state.player,
    relations: state.relations,
    wars: state.wars,
    factionWars: state.factionWars || {},
    diplomacySeeded: !!state.diplomacySeeded,
    prisoners: (state.prisoners || []).filter(function (p) { return !p.escaped; }),
    lords: state.lords,
    parties: state.parties,
    quests: state.quests,
    log: state.log,
    stats: state.stats,
    flags: state.flags,
    campaign: state.campaign,
    gameOver: state.gameOver,
    ending: state.ending,
    timeScale: state.timeScale,
    questSeq: state.questSeq,
    partySeq: state.partySeq,
    flee: state.flee || {},
    factionState: state.factionState || {},
    knownHidden: state.knownHidden || {},
    noPeace: state.noPeace || {},
    noPeaceForever: state.noPeaceForever || {},
    heroSites: state.heroSites || null,
    warCampaigns: state.warCampaigns || {},
    siegeCooldown: state.siegeCooldown || {},
    playerSiege: state.playerSiege || null,
    foodWarning: state.foodWarning || null,
    postBattleLord: state.postBattleLord || null,
    killRecords: state.killRecords || {},
    peaceOfferCooldown: state.peaceOfferCooldown || {},
    peaceOfferPending: state.peaceOfferPending || null,
    playerWarSince: state.playerWarSince || {},
    fiefTaxDay: state.fiefTaxDay || 0,
    arc: state.arc || null,
  };
  copy.player.route = [];
  copy.player.stepFrom = null;
  copy.player.stepTo = null;
  copy.player.stepProgress = 0;
  return JSON.stringify(copy);
}

function deserialize(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (e) {
    return null;
  }
  if (!data || !data.world || !data.player) return null;
  if (!data.relations) return null; // 旧档不兼容
  if ((data.version || 0) < SAVE_VERSION) return null; // 旧地图/旧领主表不兼容

  resetFactionRulers();
  const state = {
    version: data.version || SAVE_VERSION,
    seed: data.seed,
    clock: data.clock,
    world: data.world,
    player: data.player,
    relations: data.relations,
    wars: data.wars || {},
    factionWars: data.factionWars || {},
    diplomacySeeded: !!data.diplomacySeeded,
    prisoners: data.prisoners || [],
    lords: data.lords || [],
    parties: data.parties || [],
    quests: data.quests || [],
    log: data.log || [],
    events: [],
    stats: data.stats || { battlesWon: 0, battlesLost: 0, troopsLost: 0, goldEarned: 0, distance: 0, days: 0, sitesTaken: 0, villagesRaided: 0 },
    flags: data.flags || {},
    campaign: data.campaign || { stage: 0, done: [] },
    gameOver: !!data.gameOver,
    ending: data.ending || null,
    timeScale: data.timeScale || 1,
    npcClock: 0,
    rng: new RNG((data.seed || 1) + (data.clock ? data.clock.day : 1) * 7919),
    questSeq: data.questSeq || 1,
    partySeq: data.partySeq || 1,
    flee: data.flee || {},
    factionState: data.factionState || {},
    knownHidden: data.knownHidden || {},
    noPeace: data.noPeace || {},
    noPeaceForever: data.noPeaceForever || {},
    heroSites: data.heroSites || null,
    warCampaigns: data.warCampaigns || {},
    siegeCooldown: data.siegeCooldown || {},
    playerSiege: data.playerSiege || null,
    foodWarning: data.foodWarning || null,
    postBattleLord: data.postBattleLord || null,
    killRecords: data.killRecords || {},
    peaceOfferCooldown: data.peaceOfferCooldown || {},
    peaceOfferPending: null,
    playerWarSince: data.playerWarSince || {},
    fiefTaxDay: data.fiefTaxDay || 0,
    arc: data.arc || null,
    battle: null,
  };
  state.player.country = state.player.country || null;
  state.player.foodWarned = !!state.player.foodWarned;
  state.player.foodWarnDay = state.player.foodWarnDay || 0;
  state.player.adShiDay = state.player.adShiDay || 0;
  state.player.adShiCount = state.player.adShiCount || 0;
  state.player.route = [];
  state.player.stepFrom = null;
  state.player.stepTo = null;
  state.player.stepProgress = 0;

  // 同版本老档补上村市口粮与领主独立兵源池
  state.world.sites.forEach(function (site) {
    if (site.selfFief === undefined) site.selfFief = false;
    if (site.selfFief) site.lordId = null;
    if (!site.foodStock) {
      site.foodStock = {};
      if (site.type === 'village') {
        VILLAGE_FOOD.forEach(function (f) { site.foodStock[f.id] = Math.max(1, f.stockMax || 3); });
      }
    }
    if (!site.lordRecruits && site.type !== 'camp') {
      site.lordRecruits = {};
      (site.recruitList || []).forEach(function (id) { site.lordRecruits[id] = 1; });
    }
    // 旧档的村庄可能还是每次刷新 7 人 / 口粮没有上限，进档时统一压到新规则
    if (site.type === 'village') {
      site.recruitCap = 5;
      site.recruits = site.recruits || {};
      Object.keys(site.recruits).forEach(function (id) {
        site.recruits[id] = Math.min(5, site.recruits[id] || 0);
      });
      site.foodStock = site.foodStock || {};
      VILLAGE_FOOD.forEach(function (f) {
        const cap = f.stockMax || 3;
        const cur = site.foodStock[f.id];
        site.foodStock[f.id] = cur === undefined ? cap : Math.min(cap, cur);
      });
    }
  });

  // 老存档里没有后来补的领主：按 LORDS 定义补齐，已死过的保持死过
  const { LORDS } = __require(5);
  // 旧档里的领主可能缺后来加的字段
  state.lords.forEach(function (l) {
    if (l.dead === undefined) l.dead = false;
    if (l.retired === undefined) l.retired = false;
    if (l.hidden === undefined) l.hidden = null;
    if (l.resting === undefined) l.resting = false;
    if (l.prisoner === undefined) l.prisoner = null;
    if (l.recruitCoolDay === undefined) l.recruitCoolDay = 0;
    if (l.inCity === undefined) l.inCity = null;
    if (l.restSite === undefined) l.restSite = null;
    if (!l.level) l.level = lordLevelForRank(lordRank(l));
  });
  const known = {};
  state.lords.forEach(function (l) { known[l.id] = true; });
  LORDS.forEach(function (def) {
    if (known[def.id]) return;
    const lord = lordFromDef(state, def);
    const dead = (data.deadLords || {})[def.id];
    if (dead) {
      lord.alive = false;
      lord.troops = {};
      lord.respawnDay = dead;
    }
    state.lords.push(lord);
  });
  autoAssignFiefs(state);
  reconcileFactionRulers(state);
  war.init(state);
  war.bindLogger(pushLog);
  war.bindPassable(isPassable);
  syncPlayerFaction(state.player.country);
  if (state.player.country && state.player.country.name) applyPlayerCountry(state);
  return state;
}

module.exports = {
  HOUR_SECONDS,
  SAVE_VERSION,
  createGame,
  update,
  unitAnimPos,
  goTo,
  currentPos,
  playerVisualPos,
  stopMoving,
  camp,
  campWait,
  startRest,
  stopRest,
  isResting,
  isSafeResting,
  advanceTime,
  dailyTick,
  campRespawnTick,
  CAMP_RESPAWN_DAYS,
  lordRecruitTick,
  recruitLordFromSite,
  joinRenownReq,
  playerSpeed,
  capacity,
  relationOf,
  isHostileFaction,
  isHostileSite,
  siteStatus,
  changeRelation,
  startPartyBattle,
  startLordBattle,
  startSiege,
  beginPlayerSiege,
  advancePlayerSiege,
  checkPlayerSiegeReady,
  cancelPlayerSiege,
  PLAYER_SIEGE_DAYS,
  startCampaignBattle,
  resolveBattle,
  takeSite,
  offerQuest,
  questTargetPos,
  foundCountry,
  applyPlayerCountry,
  cleanCountryName,
  flagColorName,
  nextFoodNeed,
  refreshFoodWarning,
  deliverGrain,
  checkScoutQuest,
  completeQuests,
  checkQuestTargets,
  failQuest,
  joinFaction,
  declareWar,
  prisonersOf,
  ransomPrisoner,
  releasePrisoner,
  factionWars,
  atWarWith,
  peaceTerms,
  acceptPeaceOffer,
  rejectPeaceOffer,
  declareWarFaction,
  makePeaceWith,
  raidVillage,
  campaignState,
  campaignInfo,
  campaignObjective,
  advanceCampaign,
  tryCampaignBattle,
  applyCampaignEffect,
  factionTick,
  factionAlive,
  factionLord,
  isFactionRuler,
  successionAfterRulerKilled,
  resetFactionRulers,
  reconcileFactionRulers,
  campTierForRenown,
  fallFaction,
  pickFactionFor,
  moveLordToFaction,
  tavernRumor,
  hiddenLordsAt,
  hiddenLordVisible,
  recruitHiddenLord,
  giveWayCost,
  giveWay,
  breakTail,
  recruitPrisoner,
  executePrisoner,
  resolveDefeatedLord,
  promoteHero,
  siteLord,
  siteSelfFief,
  lordFiefs,
  autoAssignFiefs,
  assignFief,
  assignFiefSelf,
  fiefTaxFor,
  fiefTaxTick,
  lordLevel,
  lordCapForLevel,
  lordTroopCap,
  useHistory,
  adShiInfo,
  claimAdShi,
  AD_SHI_MAX,
  AD_SHI_PER,
  renownTitle,
  pushLog,
  serialize,
  deserialize,
  endGame,
  checkVictory,
  decideEnding,
  majorSites,
  allMajorSitesOwned,
  startUnification,
  triggerDisaster,
  triggerArcFinale,
  arcTick,
  spawnBanditParties,
  refillBandits,
  pickBanditTier,
  allowedTiers,
  garrisonTroops,
  findFreeSpotNear,
  giftLord,
  provokeLord,
  lordGreet,
  lordIdle,
  lordLines,
  lordRank,
  lordTroopLine,
  buyVillageFood,
  reviveAfterDefeat,
  afterRetreat,
  canFight,
  gameHours,
  LORD_RANK,
};

  };

  /* js/core/audio.js */
  __defs[18] = function (module, exports, __require) {
/**
 * 程序化音乐：没有音频文件，用 WebAudio 现场合成两首循环
 *  - field  大地图：五声音阶长笛，慢，带一点空旷感
 *  - battle 遭遇战：鼓点 + 低音，紧
 * 环境不支持 WebAudio 时静默，不影响游戏。
 */

const SCALE = [
  293.66, 329.63, 369.99, 440.0, 523.25,
  587.33, 659.26, 739.99, 880.0,
];

const S = {
  ctx: null,
  tried: false,
  mode: null,
  t: 0,
  nextNote: 0,
  beat: 0,
  enabled: true,
  master: null,
};

function storageGet(key) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) return wx.getStorageSync(key);
    if (typeof tt !== 'undefined' && tt.getStorageSync) return tt.getStorageSync(key);
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch (e) { /* ignore */ }
  return null;
}

function storageSet(key, val) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) return wx.setStorageSync(key, val);
    if (typeof tt !== 'undefined' && tt.setStorageSync) return tt.setStorageSync(key, val);
    if (typeof localStorage !== 'undefined') return localStorage.setItem(key, val);
  } catch (e) { /* ignore */ }
}

function createCtx() {
  if (S.tried) return S.ctx;
  S.tried = true;
  let Ctor = null;
  if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
    Ctor = window.AudioContext || window.webkitAudioContext;
    S.ctx = new Ctor();
  } else if (typeof wx !== 'undefined' && wx.createWebAudioContext) {
    S.ctx = wx.createWebAudioContext();
  } else if (typeof tt !== 'undefined' && tt.createWebAudioContext) {
    S.ctx = tt.createWebAudioContext();
  }
  if (S.ctx) {
    try {
      S.master = S.ctx.createGain();
      S.master.gain.value = 0.32;
      S.master.connect(S.ctx.destination);
    } catch (e) {
      S.master = null;
    }
  }
  const saved = storageGet('bw_audio');
  if (saved === 'off' || saved === '0' || saved === false) S.enabled = false;
  return S.ctx;
}

function resume() {
  const ctx = createCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
  } catch (e) { /* ignore */ }
}

function out() {
  return S.master || (S.ctx ? S.ctx.destination : null);
}

function tone(freq, dur, type, gain, delay) {
  const ctx = S.ctx;
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const now = ctx.currentTime + (delay || 0);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.05);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.2), now + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, now + dur);
    o.connect(g);
    const dst = out();
    if (dst) g.connect(dst);
    o.start(now);
    o.stop(now + dur + 0.02);
  } catch (e) { /* ignore */ }
}

function noiseHit(dur, gain) {
  const ctx = S.ctx;
  if (!ctx) return;
  try {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer ? ctx.createBuffer(1, len, ctx.sampleRate) : null;
    if (!buf) return;
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    const dst = out();
    if (dst) g.connect(dst);
    src.start();
  } catch (e) { /* ignore */ }
}

function play(mode) {
  if (!createCtx()) return;
  if (S.mode === mode) return;
  S.mode = mode;
  S.t = 0;
  S.beat = 0;
  S.nextNote = 0;
  if (S.ctx && S.ctx.state === 'suspended' && S.ctx.resume) {
    try { S.ctx.resume(); } catch (e) { /* ignore */ }
  }
}

function stop() {
  S.mode = null;
  S.t = 0;
}

function update(dt) {
  if (!S.ctx || !S.enabled || !S.mode) return;
  S.t += dt;

  if (S.mode === 'field') {
    // 每 0.85 秒一个音，旋律在五声音阶里绕
    if (S.t >= S.nextNote) {
      S.nextNote = S.t + 0.85;
      const idx = Math.floor(Math.random() * 5) + (Math.random() < 0.3 ? 4 : 0);
      const f = SCALE[Math.min(SCALE.length - 1, idx)];
      tone(f, 1.1, 'triangle', 0.10);
      if (Math.random() < 0.4) tone(f * 1.5, 0.9, 'sine', 0.05, 0.12);
    }
    return;
  }

  // battle：四拍一小节，拍点 0.42 秒
  const beatLen = 0.42;
  if (S.t >= S.nextNote) {
    S.nextNote = S.t + beatLen;
    S.beat = (S.beat + 1) % 4;
    tone(S.beat === 0 ? 82 : 98, 0.16, 'square', 0.16);
    if (S.beat === 2) noiseHit(0.08, 0.05);
    if (S.beat === 0) tone(174, 0.5, 'sawtooth', 0.05, 0.02);
  }
}

function setEnabled(on) {
  S.enabled = !!on;
  storageSet('bw_audio', S.enabled ? 'on' : 'off');
  if (!S.enabled) stop();
}

function isEnabled() {
  return S.enabled;
}

module.exports = {
  play,
  stop,
  update,
  resume,
  setEnabled,
  isEnabled,
};

  };

  /* js/scenes/title.js */
  __defs[19] = function (module, exports, __require) {
/**
 * 标题：风云三国 · 骑砍大师制作
 */

const { text, panel } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);

const SAVE_KEY = 'bw_save_v4';

function hasSave(app) {
  const raw = app.runtime.storage.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.player || !data.relations) return null;
    return data;
  } catch (e) {
    return null;
  }
}

const TitleScene = {
  enter(app) {
    app.saveMeta = hasSave(app);
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const t = (app.mapPhase = (app.mapPhase || 0) + 0.016);

    // 烈火背景：黑烟、赤焰、飞灰，标题从火里烧出来
    drawFireBackdrop(ctx, w, h, t);

    // 标题
    text(ctx, '风云三国', w / 2, h * 0.285, {
      size: 104, align: 'center', color: '#ffe0a0', shadow: true,
    });
    text(ctx, '骑 砍 大 师 制 作', w / 2, h * 0.285 + 112, {
      size: 25, align: 'center', color: '#d9a441',
    });
    text(ctx, '汉末风云 · 群雄逐鹿 · 一将功成万骨枯', w / 2, h * 0.285 + 158, {
      size: 17, align: 'center', color: '#9c8a70',
    });

    // 按钮：新的开始 / 最近存档 / 保存的存档 / 玩法 / 商店
    const by = h * 0.50;
    const bh = 70;
    const gapY = 78;
    const bw = w - 160;
    app.ui.button(ctx, 80, by, bw, bh, '新的开始 · 洛阳溃兵', {
      id: 'new', size: 28, fill: '#3a2c1e', onTap: function () {
        app.state = stateLib.createGame({});
        app.replace('map');
      },
    });

    const meta = app.saveMeta;
    app.ui.button(ctx, 80, by + gapY, bw, bh,
      meta ? '加载最近存档 · 第 ' + meta.clock.day + ' 天' : '加载最近存档（空）', {
        id: 'cont', size: 26, disabled: !meta, fill: '#241c14', onTap: function () {
          const raw = app.runtime.storage.get(SAVE_KEY);
          const st = stateLib.deserialize(raw);
          if (!st) {
            app.showToast('存档读不出来，只能重开。');
            return;
          }
          app.state = st;
          app.replace('map');
        },
      });

    app.ui.button(ctx, 80, by + gapY * 2, bw, bh, '加载保存存档 · 九个槽', {
      id: 'slots', size: 26, fill: '#241c14', onTap: function () {
        app.push('saves', { mode: 'load', from: 'title' });
      },
    });

    app.ui.button(ctx, 80, by + gapY * 3, bw, bh - 4, '玩法 · 战役 · 兵种', {
      id: 'help', size: 24, fill: '#201a14', onTap: function () {
        app.push('help');
      },
    });

    text(ctx, '点地图行军 · 城池经营 · 领主追杀 · 天机改命', w / 2, h - 40, {
      size: 15, align: 'center', color: '#6a6050',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

/** 烈火背景：不依赖外部图，纯 Canvas 烧出一片战场 */
function drawFireBackdrop(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#060403');
  sky.addColorStop(0.28, '#170a05');
  sky.addColorStop(0.55, '#421407');
  sky.addColorStop(0.78, '#1c0904');
  sky.addColorStop(1, '#050302');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 地平线上的大火光，把半个天都映红
  const glow = ctx.createRadialGradient(w / 2, h * 0.64, 20, w / 2, h * 0.64, h * 0.68);
  glow.addColorStop(0, 'rgba(255,150,52,0.62)');
  glow.addColorStop(0.35, 'rgba(210,62,14,0.32)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 远处烧黑的山脊，压低，不挡住火
  ctx.fillStyle = '#0c0705';
  for (let i = 0; i < 7; i += 1) {
    const bx = -40 + i * (w / 5);
    const bh = 70 + (i % 3) * 36;
    ctx.beginPath();
    ctx.moveTo(bx, h * 0.69);
    ctx.lineTo(bx + w / 10, h * 0.69 - bh);
    ctx.lineTo(bx + w / 4, h * 0.69);
    ctx.closePath();
    ctx.fill();
  }

  // 一层层火舌：底宽、顶窄，随风摆；颜色从暗红到亮黄
  const layers = [
    { col: 'rgba(126,22,6,0.88)', base: 0.83, amp: 140, speed: 1.2, seg: 24 },
    { col: 'rgba(210,54,9,0.86)', base: 0.88, amp: 112, speed: 1.8, seg: 30 },
    { col: 'rgba(255,108,18,0.78)', base: 0.92, amp: 86, speed: 2.4, seg: 36 },
    { col: 'rgba(255,184,56,0.52)', base: 0.95, amp: 54, speed: 3.1, seg: 42 },
  ];
  layers.forEach(function (l, li) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= l.seg; i += 1) {
      const x = (i / l.seg) * w;
      const baseY = h * l.base;
      const wave = Math.sin(i * 0.48 + t * l.speed + li * 2) * 16;
      const spike = Math.pow(Math.abs(Math.sin(i * 1.35 + t * l.speed * 0.6 + li)), 1.35) * l.amp;
      ctx.lineTo(x, baseY - spike - wave);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = l.col;
    ctx.fill();
  });

  // 烧塌的城楼剪影，压在火前面
  ctx.fillStyle = '#070403';
  const by = h * 0.735;
  const gateW = Math.min(170, w * 0.46);
  const gateX = w / 2 - gateW / 2;
  ctx.fillRect(gateX, by - 62, gateW, 62);
  ctx.fillRect(gateX + 18, by - 92, 34, 34);
  ctx.fillRect(gateX + gateW - 52, by - 84, 30, 30);
  for (let x = gateX; x < gateX + gateW; x += 28) {
    ctx.fillRect(x, by - 72, 14, 12);
  }
  // 门洞透出的火
  const door = ctx.createLinearGradient(0, by - 40, 0, by);
  door.addColorStop(0, 'rgba(255,170,60,0.7)');
  door.addColorStop(1, 'rgba(120,26,6,0.1)');
  ctx.fillStyle = door;
  ctx.fillRect(w / 2 - 18, by - 38, 36, 38);

  // 黑烟从城后卷上来
  ctx.fillStyle = 'rgba(10,7,5,0.32)';
  for (let i = 0; i < 5; i += 1) {
    const sx = w * (0.18 + i * 0.16);
    const sh = 120 + i * 34;
    ctx.save();
    ctx.translate(sx, h * 0.55 - sh * 0.4);
    ctx.scale(1, (sh * 0.4) / (34 + i * 8));
    ctx.beginPath();
    ctx.arc(0, 0, 34 + i * 8, 0, Math.PI * 2);
    ctx.restore();
    ctx.fill();
  }

  // 飞灰与火星
  for (let i = 0; i < 64; i += 1) {
    const seed = i * 37.7;
    const x = ((seed + t * (18 + (i % 5) * 8)) % (w + 40)) - 20;
    const y = h * 0.94 - ((seed * 3 + t * (26 + (i % 7) * 9)) % (h * 0.78));
    const a = 0.28 + (Math.sin(t * 2 + i) + 1) * 0.25;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255,224,150,' + a + ')' : 'rgba(255,104,30,' + a + ')';
    ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
  }

  // 底部烟尘，压暗按钮区
  const smoke = ctx.createLinearGradient(0, h * 0.78, 0, h);
  smoke.addColorStop(0, 'rgba(0,0,0,0)');
  smoke.addColorStop(1, 'rgba(0,0,0,0.74)');
  ctx.fillStyle = smoke;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
}

function pixelSilhouette(ctx, app, cx, cy, size, t) {
  // 光晕
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, size * 0.9);
  g.addColorStop(0, 'rgba(240,192,96,0.28)');
  g.addColorStop(1, 'rgba(240,192,96,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

  const w = size;
  const hh = size * 1.25;
  ctx.drawImage(app.assets.player, cx - w / 2, cy - hh * 0.55 + Math.sin(t) * 3, w, hh);
}

module.exports = TitleScene;
module.exports.SAVE_KEY = SAVE_KEY;

  };

  /* js/core/territory.js */
  __defs[21] = function (module, exports, __require) {
/**
 * 势力领土网格：天下大势与大地图共用。
 *
 * 每格归给最近的、权重最高的据点；城控制的范围比村镇大。
 * 只要据点坐标或归属变了（玩家攻占、AI 夺城、山寨换地方），
 * 签名就会变化并重算，不再让旧颜色留在图上。
 */

const SITE_WEIGHT = { town: 3.2, castle: 2.4, village: 1.2, camp: 0.9 };

function siteOwner(site) {
  if (!site) return '';
  if (site.playerOwned) return 'player';
  return site.ownerFaction || '';
}

function signature(world) {
  const sites = world && world.sites ? world.sites : [];
  return sites.map(function (s) {
    return s.id + ':' + siteOwner(s) + ':' + (s.x || 0) + ',' + (s.y || 0) +
      ':' + (s.type === 'camp' && s.cleared ? 'c' : '');
  }).join('|');
}

function buildFactionGrid(world) {
  if (!world || !world.sites || !world.w || !world.h) return [];
  const sig = signature(world);
  if (world.factionGrid && world.factionGridSig === sig) return world.factionGrid;

  const W = world.w;
  const H = world.h;
  const grid = new Array(W * H).fill('');
  // 洗劫后的空山寨不再向外投射势力色
  const sites = world.sites.filter(function (s) {
    return siteOwner(s) && !(s.type === 'camp' && s.cleared);
  });

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = world.tiles[y * W + x];
      if (t === 'sea') continue;
      let best = '';
      let bestScore = Infinity;
      for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        const dx = s.x - x;
        const dy = s.y - y;
        const score = (dx * dx + dy * dy) / (SITE_WEIGHT[s.type] || 1);
        if (score < bestScore) {
          bestScore = score;
          best = siteOwner(s);
        }
      }
      grid[y * W + x] = best;
    }
  }
  world.factionGrid = grid;
  world.factionGridSig = sig;
  return grid;
}

module.exports = {
  SITE_WEIGHT,
  buildFactionGrid,
  signature,
};

  };

  /* js/scenes/flows.js */
  __defs[22] = function (module, exports, __require) {
/**
 * 场景流转：把 state.events 翻成场景切换
 * map / town 都会调用，保证事件不丢。
 */

const stateLib = __require(7);
const { siteById } = __require(8);

function process(app) {
  const st = app.state;
  if (!st) return;
  let guard = 0;
  while (st.events.length && guard++ < 8) {
    const ev = st.events.shift();

    if (ev.type === 'enter-site') {
      app.push('town', { siteId: ev.siteId });
      return;
    }
    if (ev.type === 'player-siege') {
      const site = siteById(st.world, ev.siteId);
      if (!site) continue;
      const r = stateLib.beginPlayerSiege(st, site);
      if (r.ok) {
        // 围城不跳页：人留在城下，时辰在大地图上走，围满再点营寨决战
        app.showToast('城下扎营：需围 ' + r.days + ' 天，围成后才能决战。', 3);
        return;
      }
      app.showToast(r.msg || '现在围不了这座城。', 2);
      continue;
    }
    if (ev.type === 'siege') {
      const site = siteById(st.world, ev.siteId);
      if (!site) continue;
      const battle = stateLib.startSiege(st, site);
      if (!battle) {
        app.showToast('这座城现在打不下来。', 2);
        continue;
      }
      app.push('battle', { mode: 'siege' });
      return;
    }
    if (ev.type === 'warning') {
      app.showToast(ev.text || ev.title || '军中告急！', 4.5);
      continue;
    }
    if (ev.type === 'quest-failed') {
      app.showToast(ev.text || ev.title || '酒馆任务失败。', 4.5);
      continue;
    }
    if (ev.type === 'encounter') {
      const party = st.parties.filter(function (p) { return p.id === ev.partyId; })[0];
      if (!party) continue;
      // 先亮一张遭遇页：看清人数、看清强弱，再决定打不打
      app.push('contact', { partyId: ev.partyId });
      return;
    }
    if (ev.type === 'lord') {
      const lord = st.lords.filter(function (l) { return l.id === ev.lordId; })[0];
      if (!lord || !lord.alive) continue;
      // 先碰面说话：对话里再决定送礼、看兵、还是直接翻脸
      app.push('lord', { lordId: ev.lordId });
      return;
    }
    if (ev.type === 'revive') {
      app.push('revive', { count: ev.count });
      return;
    }
    if (ev.type === 'chapter') {
      app.push('chapter', { id: ev.chapterId });
      return;
    }
    if (ev.type === 'founding') {
      app.push('founding', { siteId: ev.siteId });
      return;
    }
    if (ev.type === 'faction-fall') {
      app.push('news', { title: ev.title, lines: ev.lines, factionId: ev.factionId });
      return;
    }
    if (ev.type === 'succession') {
      app.push('news', {
        title: ev.title || '新君继位',
        lines: ev.lines || [],
        factionId: ev.factionId,
        tag: '继位',
        auto: 6,
      });
      return;
    }
    if (ev.type === 'peace-offer') {
      app.push('news', {
        mode: 'peace-offer',
        factionId: ev.factionId,
        title: ev.title || '议和使者',
        lines: ev.lines || [],
        tag: '议和',
      });
      return;
    }
    if (ev.type === 'diplomacy') {
      // 宣战/议和停 7 秒，背景是战场或使团交书；点屏幕任意处直接跳过。
      const peace = ev.kind === 'peace';
      app.push('news', {
        title: ev.title || (peace ? '两家罢兵' : '战书已下'),
        lines: ev.lines || [],
        tag: peace ? '议和' : '宣战',
        auto: 7,
        art: peace ? 'peace' : 'war',
        skipAny: true,
      });
      return;
    }
    if (ev.type === 'arc') {
      app.push('arc', { phase: ev.phase });
      return;
    }
    if (ev.type === 'chase') {
      app.push('chase', { kind: ev.kind, id: ev.id });
      return;
    }
  }
}

/** 到达某据点后，是否该触发战役战 */
function tryCampaign(app) {
  const st = app.state;
  const battle = stateLib.tryCampaignBattle(st);
  if (battle) {
    app.push('battle', { mode: 'campaign', campaignId: battle.context.campaignId });
    return true;
  }
  return false;
}

module.exports = { process, tryCampaign };

  };

  /* js/scenes/map.js */
  __defs[20] = function (module, exports, __require) {
/**
 * 大地图场景：三国全图、区域风景、玩家骑马立绘、城池名牌、行军
 */

const { text, panel, bar, wrap } = __require(6);
const pixel = __require(3);
const { UI_COLORS } = pixel;
const stateLib = __require(7);
const army = __require(9);
const { regionAt, regionDef, siteById, siteAt, terrainAt } = __require(8);
const territory = __require(21);
const { FACTIONS, TERRAIN, CAMPAIGN, COAST, RIVER_HUANG, RIVER_YANG, RIVER_HUAI, MOUNTAINS, ROADS, BASE_W, CAPITAL_IDS } = __require(5);
const { lookFor } = __require(12);
const flows = __require(22);

const TILE = 64;
// 缩放后的格宽：TS = TILE × 缩放档位，render 时按当前档位刷新
let TS = TILE;
const TOP_H = 132;
const BOT_H = 176;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function mapBox(app) {
  const h = app.runtime.height - TOP_H - BOT_H;
  return { top: TOP_H, h: h > 200 ? h : 200 };
}

function viewSize(app) {
  const box = mapBox(app);
  return { w: app.runtime.width, h: box.h };
}

function ensureCam(app) {
  const st = app.state;
  const box = mapBox(app);
  if (!app.mapCam) {
    app.mapCam = {
      x: st.player.x * TS + TS / 2 - app.runtime.width / 2,
      y: st.player.y * TS + TS / 2 - box.h / 2,
    };
  }
  const maxX = st.world.w * TS - app.runtime.width;
  const maxY = st.world.h * TS - box.h;
  // 缩到整张天下比屏幕还小的时候，就把它摆在正中，别贴边
  if (maxX < 0) app.mapCam.x = maxX / 2;
  else app.mapCam.x = clamp(app.mapCam.x, 0, maxX);
  if (maxY < 0) app.mapCam.y = maxY / 2;
  else app.mapCam.y = clamp(app.mapCam.y, 0, maxY);
}

/** 缩放档位：拉远看天下 / 常规 / 贴脸看一队人；双指可以一直缩到整张天下 */
const ZOOM_MAX = 1.8;
const ZOOM_NAMES = ['远望', '常规', '近看'];

function fitZoom(app) {
  const st = app.state;
  if (!st || !st.world) return 0.6;
  const box = mapBox(app);
  return Math.min(app.runtime.width / (st.world.w * TILE), box.h / (st.world.h * TILE));
}

/** 最小缩放：刚好把整张天下装进屏幕（留一点边），再小就没意义了 */
function minZoom(app) {
  // 天下放大到 128x154 以后，整图缩放已经低于 0.1，不能再卡老下限
  return Math.max(0.03, fitZoom(app) * 0.98);
}

function zoomName(z) {
  if (z < 0.86) return ZOOM_NAMES[0];
  if (z < 1.22) return ZOOM_NAMES[1];
  return ZOOM_NAMES[2];
}

function setZoom(app) {
  if (app.mapZoom === undefined || app.mapZoom === null) app.mapZoom = 1;
  app.mapZoom = clamp(app.mapZoom, minZoom(app), ZOOM_MAX);
  TS = TILE * app.mapZoom;
}

function applyZoom(app, dir) {
  const cur = app.mapZoom || 1;
  const next = clamp(cur * (dir > 0 ? 1.25 : 1 / 1.25), minZoom(app), ZOOM_MAX);
  app.mapZoom = next;
  TS = TILE * next;
  // 换档后重新把玩家摆到正中，别让视野莫名跳到边角
  const box = mapBox(app);
  const p = app.state.player;
  app.mapCam = {
    x: p.x * TS + TS / 2 - app.runtime.width / 2,
    y: p.y * TS + TS / 2 - box.h / 2,
  };
  app.mapFree = false;
  ensureCam(app);
  app.showToast('地图：' + zoomName(next) + ' ×' + next.toFixed(1), 1.2);
}

function drawZoomButtons(ctx, app, box, w) {
  const bw = 54;
  const bh = 54;
  const x = w - bw - 12;
  const y0 = box.top + 74;
  app.ui.button(ctx, x, y0, bw, bh, '＋', {
    id: 'zoom_in', size: 26, fill: 'rgba(30,24,18,0.82)',
    onTap: function () { applyZoom(app, 1); },
  });
  app.ui.button(ctx, x, y0 + bh + 8, bw, bh, '－', {
    id: 'zoom_out', size: 26, fill: 'rgba(30,24,18,0.82)',
    onTap: function () { applyZoom(app, -1); },
  });
  text(ctx, zoomName(app.mapZoom) + ' ×' + (app.mapZoom || 1).toFixed(1),
    x + bw / 2, y0 + bh * 2 + 18, { size: 13, align: 'center', color: '#a2947a' });
}

/** 屏幕坐标 → 有没有点到某个人（领主优先，其次匪团） */
function unitAt(app, x, y, cam, box) {
  const st = app.state;
  const z = app.mapZoom || 1;
  for (let i = 0; i < st.lords.length; i++) {
    const l = st.lords[i];
    if (!l.alive) continue;
    const sx = l.x * TS - cam.x + TS / 2;
    const sy = box.top + l.y * TS - cam.y + TS / 2;
    // 棋子身子 + 底下名牌都算热区，点名字也能点中
    if (Math.abs(x - sx) <= 36 * z && y >= sy - 60 * z && y <= sy + 42 * z) {
      return { kind: 'lord', id: l.id, x: l.x, y: l.y };
    }
  }
  for (let i = 0; i < st.parties.length; i++) {
    const p = st.parties[i];
    if (army.troopCount(p.troops || {}) <= 0) continue;
    const sx = p.x * TS - cam.x + TS / 2;
    const sy = box.top + p.y * TS - cam.y + TS / 2;
    if (Math.abs(x - sx) <= 30 * z && y >= sy - 46 * z && y <= sy + 26 * z) {
      return { kind: 'party', id: p.id, x: p.x, y: p.y };
    }
  }
  return null;
}

function pushUnitPage(app, kind, id) {
  const top = app.top();
  const name = top ? top.name : '';
  if (name === 'lord' || name === 'contact' || name === 'battle' || name === 'town') return;
  if (kind === 'lord') { app.push('lord', { lordId: id }); return; }
  const party = app.state.parties.filter(function (x) { return x.id === id; })[0];
  if (party && party.scripted) {
    app.showToast('西凉步卒只在追上你时才会停下来，不能主动挑战。', 2.4);
    return;
  }
  app.push('contact', { partyId: id });
}

/**
 * 点名追人：点了领主/匪团，就一路跟上去，直到碰上、或者对方跑出视野。
 */
function onScreen(app, unit) {
  const box = mapBox(app);
  const cam = app.mapCam;
  if (!cam) return true;
  const z = app.mapZoom || 1;
  const sx = unit.x * TS - cam.x + TS / 2;
  const sy = box.top + unit.y * TS - cam.y + TS / 2;
  return sx > 20 && sx < app.runtime.width - 20 && sy > box.top + 20 && sy < box.top + box.h - 20;
}

function updateFollow(app) {
  const f = app.follow;
  if (!f) return false;
  const st = app.state;
  const p = st.player;
  const t = f.kind === 'lord'
    ? st.lords.filter(function (l) { return l.id === f.id; })[0]
    : st.parties.filter(function (q) { return q.id === f.id; })[0];

  if (!t || (f.kind === 'lord' && !t.alive) || army.troopCount(t.troops || {}) <= 0) {
    app.follow = null;
    return false;
  }

  const d = Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y));
  if (d === 0) {
    app.follow = null;
    stateLib.stopMoving(st);
    pushUnitPage(app, f.kind, f.id);
    return true;
  }

  // 对方跑出视野就收兵，别让人在地图上一路空追
  if (f.startH === undefined) {
    f.startH = stateLib.gameHours(st);
  } else if (!onScreen(app, t)) {
    app.follow = null;
    stateLib.stopMoving(st);
    app.showToast('他跑出你的视野了。', 2);
    return false;
  }

  // 只在对方挪得比较远、或者自己已经停下时才重算路线。
  // 每帧重算会把正在走的那一步作废，人就在原地打转。
  const shift = Math.abs(t.x - f.x) + Math.abs(t.y - f.y);
  if (shift >= 2 || !p.route || !p.route.length) {
    f.x = t.x;
    f.y = t.y;
    const r = stateLib.goTo(st, t.x, t.y);
    if (!r.ok) {
      app.follow = null;
      app.showToast('追不上，路被堵住了。');
      return false;
    }
  }
  return false;
}

const MapScene = {
  enter(app) {
    app.mapCam = null;
    app.mapPhase = 0;
    app.mapDrag = null;
    app.follow = null;
    app.mapFree = false;
    app.siegePrompt = null;
    ensureCam(app);
    flows.process(app);
    if (app.state && app.state.player.atSiteId) {
      flows.tryCampaign(app);
    }
  },

  /** 酒馆任务定位：把镜头直接落到目标格，并留一个金色标记 */
  focusOn(app, x, y, label) {
    setZoom(app);
    if ((app.mapZoom || 1) < 0.72) app.mapZoom = 0.9;
    setZoom(app);
    const box = mapBox(app);
    app.follow = null;
    app.mapFree = true;
    app.mapCam = {
      x: x * TS + TS / 2 - app.runtime.width / 2,
      y: y * TS + TS / 2 - box.h / 2,
    };
    ensureCam(app);
    app.mapFocusName = label || '';
  },

  update(app, dt) {
    const st = app.state;
    setZoom(app);
    app.mapPhase = (app.mapPhase || 0) + dt;
    // 城下选择框开着时，时辰、行军、NPC 全部停住；先做决定，世界再走
    if (app.siegePrompt) return;
    stateLib.update(st, dt);
    // 围城时辰一到，不等人点营寨：自动把“进攻 / 离开”摆到面前
    const ps = st.playerSiege;
    if (ps && !app.siegePrompt &&
        (ps.stage === 'ready' || stateLib.gameHours(st) >= ps.readyHour)) {
      ps.stage = 'ready';
      ps.promptShown = true;
      app.siegePrompt = { siteId: ps.siteId, mode: 'ready' };
      return;
    }
    ensureCam(app);

    // 相机跟随（跟插值后的位置，不再跟着格子跳）；手动拖过地图就不再强行拉回
    const box = mapBox(app);
    const pos = playerPixel(app);
    const targetX = pos.gx * TS + TS / 2 - app.runtime.width / 2;
    const targetY = pos.gy * TS + TS / 2 - box.h / 2;
    if (!app.mapDrag && !app.mapFree) {
      app.mapCam.x += (targetX - app.mapCam.x) * Math.min(1, dt * 9);
      app.mapCam.y += (targetY - app.mapCam.y) * Math.min(1, dt * 9);
    }

    if (updateFollow(app)) return;

    if (st.events.length) {
      flows.process(app);
      return;
    }
    if (st.player.atSiteId) {
      flows.tryCampaign(app);
    }
  },

  render(app) {
    const st = app.state;
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    setZoom(app);
    const box = mapBox(app);
    const cam = app.mapCam;
    ensureCam(app);

    drawTerrainView(ctx, app, cam, box, w);
    drawGeography(ctx, app, cam, box, w);
    drawAtmosphere(ctx, box, w);
    drawFactionTint(ctx, app, cam, box, w);
    drawSites(ctx, app, cam, box, w);
    drawUnits(ctx, app, cam, box, w);
    drawQuestMarkers(ctx, app, cam, box, w);
    drawRoute(ctx, app, cam, box);
    drawPlayerOnMap(ctx, app, cam, box);
    drawRegionTag(ctx, app, box, w);
    drawQuestCard(ctx, app, box, w);
    drawTop(ctx, app, w);
    drawBottom(ctx, app, w, box);
    drawZoomButtons(ctx, app, box, w);
    drawSiegeStatus(ctx, app, box, w);
    drawFreeHint(ctx, app, box, w);
    drawSiegePrompt(ctx, app, box, w);
  },

  onTouchStart(app, x, y) {
    app.mapDrag = { x, y, startX: x, startY: y, dragging: false, camX: app.mapCam.x, camY: app.mapCam.y };
  },

  onTouchMove(app, x, y) {
    const d = app.mapDrag;
    if (!d) return;
    const dx = x - d.startX;
    const dy = y - d.startY;
    if (!d.dragging && Math.abs(dx) + Math.abs(dy) > 22) {
      d.dragging = true;
      // 手一拖就是看地图，不追人了，也不再自动拉回自己身上
      app.follow = null;
      app.mapFree = true;
    }
    if (d.dragging) {
      app.mapCam.x = d.camX - dx;
      app.mapCam.y = d.camY - dy;
    }
  },

  onTouchEnd(app, x, y) {
    const d = app.mapDrag;
    app.mapDrag = null;
    if (!d) return;
    if (d.dragging) return;
    if (app.lastHit) return;
    // 围城去留弹窗开着时，只认弹窗里的两个按钮；点外面不误操作地图
    if (app.siegePrompt) return;
    const box = mapBox(app);
    if (y < TOP_H || y > TOP_H + box.h) return;

    const st = app.state;

    // 野地扎营：地图上时辰自己在走，点任意处按住，给出继续/拔营的选择。
    if (st.campFlow) {
      st.campFlow = false;
      app.push('camp', { pause: true, reason: '你在大地图上按住了时辰。' });
      return;
    }

    // 在城里歇着的时候出来看地图：点一下地图就回城
    if (app.restView) {
      app.follow = null;
      const siteId = app.restView;
      app.restView = null;
      app.push('town', { siteId: siteId });
      return;
    }

    // 只要不是拖地图，点哪儿都算"重新指路"：先松开正在跟的人，
    // 否则走到半路、路一空又会自己拐回去追他，直到撞上为止。
    const wasFollowing = !!app.follow;
    app.follow = null;

    const tx = Math.floor((x + app.mapCam.x) / TS);
    const ty = Math.floor((y - TOP_H + app.mapCam.y) / TS);
    if (tx < 0 || ty < 0 || tx >= st.world.w || ty >= st.world.h) return;

    // 先看脚下是不是城：自己和城在同一格时，优先点城（不然总说"已经在这里"）
    const site = siteAt(st.world, tx, ty);

    // 城下扎营时，点围着的城=看围营进度；点别处=先问一句继续围还是拔营
    const siegeSite = st.playerSiege ? siteById(st.world, st.playerSiege.siteId) : null;
    if (siegeSite) {
      if (site && site.id === siegeSite.id) {
        st.player.atSiteId = siegeSite.id;
        app.push('town', { siteId: siegeSite.id, view: 'siege' });
      } else {
        app.siegePrompt = {
          siteId: siegeSite.id,
          x: x,
          y: y,
          mode: (st.playerSiege.stage === 'ready' ||
            stateLib.gameHours(st) >= st.playerSiege.readyHour) ? 'ready' : 'leave',
        };
      }
      return;
    }

    if (site) {
      const onSite = st.player.x === site.x && st.player.y === site.y;
      if (onSite) {
        stateLib.stopMoving(st);
        if (st.playerSiege && st.playerSiege.siteId === site.id) {
          st.player.atSiteId = site.id;
          app.push('town', { siteId: site.id, view: 'siege' });
          return;
        }
        if (stateLib.isHostileSite(st, site)) {
          if (stateLib.canFight(st, site.id)) {
            // 城与关隘先围城；贼巢和村庄仍然直接打
            if (site.type === 'town' || site.type === 'castle') {
              const r = stateLib.beginPlayerSiege(st, site);
              if (r.ok) {
                // 扎营后不跳围城页：留在大地图看时辰流动，围满再点城下营寨
                app.showToast('城下扎营：需围 ' + r.days + ' 天，围成后才能决战。', 3);
              } else {
                app.showToast(r.msg, 2.4);
              }
              return;
            }
            const siege = stateLib.startSiege(st, site);
            if (!siege) {
              st.player.atSiteId = site.id;
              app.push('town', { siteId: site.id });
              return;
            }
            app.push('battle', { mode: 'siege' });
          } else {
            app.showToast('这座城现在打不下来。');
          }
        } else {
          st.player.atSiteId = site.id;
          app.push('town', { siteId: site.id });
        }
        return;
      }
    }

    // 再点人就只是追过去
    const unit = unitAt(app, x, y, app.mapCam, box);
    if (unit) {
      const p = st.player;
      const dist = Math.max(Math.abs(unit.x - p.x), Math.abs(unit.y - p.y));
      if (dist === 0) {
        stateLib.stopMoving(st);
        pushUnitPage(app, unit.kind, unit.id);
        return;
      }
      // 没碰上就只是跟过去，跟到对方离开视野为止
      app.follow = { kind: unit.kind, id: unit.id, x: unit.x, y: unit.y, startH: undefined };
      const r = stateLib.goTo(st, unit.x, unit.y);
      if (!r.ok) {
        app.follow = null;
        app.showToast(r.msg);
        return;
      }
      app.showToast(unit.kind === 'lord' ? '向他那边靠过去。' : '朝那伙人追过去。', 1.6);
      return;
    }

    const t = terrainAt(st.world, tx, ty);
    if (!t || !t.passable) {
      if (wasFollowing) stateLib.stopMoving(st);
      app.showToast(t && t.id === 'sea' ? '前面是海，绕路走。' : '山地翻不过去。');
      return;
    }
    const r = stateLib.goTo(st, tx, ty);
    if (!r.ok) {
      if (wasFollowing) stateLib.stopMoving(st);
      app.showToast(r.msg);
    }
  },

  onPinchStart(app, x, y) {
    // 两指一落下，就把单指的拖动/追人全放掉，专心缩放
    app.mapDrag = null;
    app.follow = null;
    app.mapFree = true;
    app.mapPinch = { zoom: app.mapZoom || 1 };
  },

  onPinch(app, scale, cx, cy) {
    if (!app.mapPinch || !app.mapCam) return;
    const box = mapBox(app);
    if (cy < box.top || cy > box.top + box.h) return;
    const oldTS = TS;
    const next = clamp(app.mapPinch.zoom * scale, minZoom(app), ZOOM_MAX);
    const nextTS = TILE * next;
    if (!isFinite(nextTS) || nextTS <= 0) return;

    // 按住的地方不跑：先算出指下是哪一格，再按新格宽摆回去
    const gx = (cx + app.mapCam.x) / oldTS;
    const gy = (cy - TOP_H + app.mapCam.y) / oldTS;
    app.mapZoom = next;
    TS = nextTS;
    app.mapCam.x = gx * nextTS - cx;
    app.mapCam.y = gy * nextTS - (cy - TOP_H);
    ensureCam(app);
  },

  onPinchEnd(app) {
    app.mapPinch = null;
    app.mapDrag = null;
    app.follow = null;
  },
};

/* ---------------------------------------------------------------- 绘制 */

/* ---------------------------------------------------------------- 折线层
 * 地形格只铺底色，真正的山川道路用折线画，避免一格一格的方块感
 */

function strokePolyline(ctx, pts, toX, toY) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const sx = toX(pts[i][0]);
    const sy = toY(pts[i][1]);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
}

function coastPoints() {
  const out = [];
  for (let i = 0; i < COAST.length; i++) out.push([COAST[i][1], COAST[i][0]]);
  return out;
}

function siteOf(world, id) {
  for (let i = 0; i < world.sites.length; i++) {
    if (world.sites[i].id === id) return world.sites[i];
  }
  return null;
}

function drawGeography(ctx, app, cam, box, w) {
  const world = app.state.world;
  // 设计稿坐标 → 实图坐标（地图放大后折线层跟着一起放大，否则和据点错位）
  const gs = world.w / BASE_W;
  const toX = function (gx) { return gx * TS - cam.x; };
  const toY = function (gy) { return box.top + gy * TS - cam.y; };
  const sc = function (pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) out.push([pts[i][0] * gs, pts[i][1] * gs]);
    return out;
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 海岸：沙滩带 + 浪线
  const coast = sc(coastPoints());
  ctx.strokeStyle = 'rgba(233,216,180,0.42)';
  ctx.lineWidth = 13;
  strokePolyline(ctx, coast, toX, toY);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  strokePolyline(ctx, coast, toX, toY);

  // 河流：暗岸 + 水体 + 高光
  [[sc(RIVER_HUANG), 0.72], [sc(RIVER_YANG), 0.85], [sc(RIVER_HUAI), 0.55]].forEach(function (r) {
    const width = TS * r[1];
    ctx.strokeStyle = 'rgba(30,58,84,0.38)';
    ctx.lineWidth = width + 4;
    strokePolyline(ctx, r[0], toX, toY);
    ctx.strokeStyle = '#3d6f97';
    ctx.lineWidth = width;
    strokePolyline(ctx, r[0], toX, toY);
    ctx.strokeStyle = 'rgba(160,204,228,0.5)';
    ctx.lineWidth = Math.max(2, width * 0.3);
    strokePolyline(ctx, r[0], toX, toY);
  });

  // 山脉：暗带 + 亮脊 + 峰尖
  MOUNTAINS.forEach(function (raw) {
    const line = sc(raw);
    ctx.strokeStyle = 'rgba(86,80,70,0.35)';
    ctx.lineWidth = TS * 1.3;
    strokePolyline(ctx, line, toX, toY);
    ctx.strokeStyle = 'rgba(152,145,132,0.58)';
    ctx.lineWidth = TS * 0.56;
    strokePolyline(ctx, line, toX, toY);

    for (let i = 0; i < line.length; i++) {
      const px0 = toX(line[i][0]);
      const py0 = toY(line[i][1]);
      if (px0 < -50 || px0 > w + 50 || py0 < box.top - 70 || py0 > box.top + box.h + 70) continue;
      ctx.fillStyle = 'rgba(212,206,192,0.75)';
      ctx.beginPath();
      ctx.moveTo(px0 - 12, py0 + 8);
      ctx.lineTo(px0, py0 - 17);
      ctx.lineTo(px0 + 12, py0 + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(104,97,86,0.45)';
      ctx.beginPath();
      ctx.moveTo(px0, py0 - 17);
      ctx.lineTo(px0 + 12, py0 + 8);
      ctx.lineTo(px0 + 2, py0 + 8);
      ctx.closePath();
      ctx.fill();
    }
  });

  // 道路：深色描边压暗地形，再上一道浅土黄
  function roadSeg(pair) {
    const a = siteOf(world, pair[0]);
    const b = siteOf(world, pair[1]);
    if (!a || !b) return;
    const ax = toX(a.x + 0.5);
    const ay = toY(a.y + 0.5);
    const bx = toX(b.x + 0.5);
    const by = toY(b.y + 0.5);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(58,46,32,0.45)';
  ctx.lineWidth = 8;
  ROADS.forEach(roadSeg);
  ctx.strokeStyle = '#b39a72';
  ctx.lineWidth = 5;
  ROADS.forEach(roadSeg);
  ctx.strokeStyle = 'rgba(214,196,158,0.5)';
  ctx.lineWidth = 1.6;
  ROADS.forEach(roadSeg);

  ctx.restore();
}

/** 氛围层：中心提亮、四角压暗，压掉格子拼接的硬边 */
function drawAtmosphere(ctx, box, w) {
  const cx = w / 2;
  const cy = box.top + box.h / 2;
  const r0 = Math.min(w, box.h) * 0.28;
  const r1 = Math.max(w, box.h) * 0.82;
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  g.addColorStop(0, 'rgba(255,238,204,0.10)');
  g.addColorStop(0.55, 'rgba(60,48,30,0.04)');
  g.addColorStop(1, 'rgba(18,14,9,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, box.top, w, box.h);
}

function drawTerrainView(ctx, app, cam, box, w) {
    const st = app.state;
    const world = st.world;
    const ctx2 = ctx;
    const assets = app.assets;

    const startX = Math.max(0, Math.floor(cam.x / TS));
    const startY = Math.max(0, Math.floor(cam.y / TS));
    const endX = Math.min(world.w - 1, Math.ceil((cam.x + w) / TS));
    const endY = Math.min(world.h - 1, Math.ceil((cam.y + box.h) / TS));

    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(0, box.top, w, box.h);
    ctx2.clip();

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const sx = x * TS - cam.x;
        const sy = box.top + y * TS - cam.y;
        const idx = y * world.w + x;
        const t = world.tiles[idx] || 'plain';
        const region = (world.regions && world.regions[idx]) || 'zhongyuan';
        const sprite = assets.terrainFor(region, t);
        ctx2.drawImage(sprite, sx, sy, TS, TS);
      }
    }
    ctx2.restore();
}

/**
 * 拉远到能看见整张天下时，铺一层势力领地色。
 * 缩放 0.2 左右正是看“三国乱战”的档位；城池一换旗，territory 的签名缓存就失效。
 */
function drawFactionTint(ctx, app, cam, box, w) {
  if ((app.mapZoom || 1) > 0.34) return;
  const st = app.state;
  const world = st.world;
  const grid = territory.buildFactionGrid(world);
  const startX = Math.max(0, Math.floor(cam.x / TS));
  const startY = Math.max(0, Math.floor(cam.y / TS));
  const endX = Math.min(world.w - 1, Math.ceil((cam.x + w) / TS));
  const endY = Math.min(world.h - 1, Math.ceil((cam.y + box.h) / TS));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();
  ctx.globalAlpha = 0.38;
  let lastColor = '';
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const fac = grid[y * world.w + x];
      const def = fac ? FACTIONS[fac] : null;
      if (!def) continue;
      if (def.color !== lastColor) {
        ctx.fillStyle = def.color;
        lastColor = def.color;
      }
      const sx = x * TS - cam.x;
      const sy = box.top + y * TS - cam.y;
      ctx.fillRect(sx, sy, Math.ceil(TS) + 1, Math.ceil(TS) + 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSites(ctx, app, cam, box, w) {
  const st = app.state;
  const assets = app.assets;
  const lowZoom = (app.mapZoom || 1) < 0.45;
  const lowZoomLabels = [];

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();

  st.world.sites.forEach(function (site) {
    const sx = site.x * TS - cam.x;
    const sy = box.top + site.y * TS - cam.y;
    if (sx < -TS * 2 || sx > w + TS || sy < box.top - TS || sy > box.top + box.h + TS) return;
    const npcSiege = st.warCampaigns && Object.keys(st.warCampaigns).some(function (k) {
      const cp = st.warCampaigns[k];
      return cp && cp.stage === 'siege' && cp.targetId === site.id;
    });
    const mySiege = !!(st.playerSiege && st.playerSiege.siteId === site.id);
    const siege = npcSiege || mySiege;
    const playerColor = FACTIONS.player ? FACTIONS.player.color : '#d9a441';
    const isCapital = CAPITAL_IDS.indexOf(site.id) >= 0;

    // 拉远看整张天下时，城池收成势力色小点；城与关隘的名字照样留在图上
    if (lowZoom) {
      const col = site.playerOwned ? playerColor
        : site.playerBlocked ? '#b4463c'
          : site.ownerFaction && FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].color : '#7a7266';
      const r = isCapital ? 4.6 : site.type === 'town' ? 4.2 : site.type === 'castle' ? 3.2 : 2.2;
      ctx.beginPath();
      ctx.arc(sx + TS / 2, sy + TS / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = isCapital ? 2.2 : siege ? 2 : 1;
      ctx.strokeStyle = isCapital ? '#ffe0a8'
        : mySiege ? '#ffe0a8'
          : siege ? '#e06a42'
            : site.playerOwned ? playerColor : 'rgba(10,8,6,0.65)';
      ctx.stroke();
      if (site.type === 'town' || site.type === 'castle') {
        lowZoomLabels.push({
          site: site,
          sx: sx + TS / 2,
          sy: sy + TS / 2,
          color: site.playerOwned ? playerColor : '#ffe9c4',
          cap: isCapital,
        });
      }
      return;
    }

    const sprite = assets.site[site.type] || assets.site.village;
    ctx.drawImage(sprite, sx + 4, sy + 4, TS - 8, TS - 8);

    // 势力旗：无主城围攻失败后，城头插一面“仇”字赤旗，和敌对城一个待遇
    if (site.playerBlocked && !site.ownerFaction) {
      ctx.fillStyle = '#b4463c';
      ctx.fillRect(sx + TS - 16, sy + 4, 12, 14);
      ctx.fillStyle = 'rgba(255,235,210,0.8)';
      ctx.fillRect(sx + TS - 16, sy + 4, 12, 2);
      text(ctx, '仇', sx + TS - 10, sy + 6, { size: 13, align: 'center', color: '#fff' });
    } else if (site.ownerFaction) {
      const col = FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].color : '#8f8f86';
      ctx.fillStyle = col;
      ctx.fillRect(sx + TS - 16, sy + 4, 12, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(sx + TS - 16, sy + 4, 12, 2);
      text(ctx, FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].banner : '?', sx + TS - 10, sy + 6, {
        size: 13, align: 'center', color: '#fff',
      });
    } else {
      ctx.fillStyle = '#6a655c';
      ctx.fillRect(sx + TS - 16, sy + 4, 12, 14);
    }

    // 围城标记：城下营寨连成圈，远远就看得见
    if (siege) {
      ctx.fillStyle = mySiege ? 'rgba(120,82,18,0.94)' : 'rgba(120,32,18,0.92)';
      ctx.fillRect(sx + 4, sy + 4, 30, 20);
      text(ctx, mySiege ? '我围' : '围城', sx + 19, sy + 6, { size: 13, align: 'center', color: '#ffe0a8' });
    }

    // 名牌
    const isTown = site.type === 'town';
    const isCastle = site.type === 'castle';
    const size = isCapital ? 27 : isTown ? 22 : isCastle ? 19 : 16;
    const label = site.name;
    ctx.font = 'bold ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    const tw = ctx.measureText(label).width;
    const bx = sx + TS / 2 - tw / 2 - 8;
    const by = sy + TS - 4;
    ctx.fillStyle = 'rgba(10,8,6,0.72)';
    ctx.fillRect(bx, by, tw + 16, size + 10);
    ctx.fillStyle = site.playerOwned ? playerColor : 'rgba(0,0,0,0)';
    if (site.playerOwned) ctx.fillRect(bx, by, tw + 16, 2);
    text(ctx, label, sx + TS / 2, by + 5, {
      size, align: 'center',
      color: site.playerOwned ? playerColor : site.playerBlocked ? '#e0a090'
        : isTown ? '#f2e7cd' : isCastle ? '#ded2b6' : '#b9ad92',
      shadow: true,
    });
  });

  // 极小缩放：城与关隘的名字都单独画在外圈。能避让就避让，避不开也至少保留名字，
  // 免得整张天下缩下去以后只剩一堆无名点。
  if (lowZoom && lowZoomLabels.length) {
    const placed = [];
    // 国都先排，再排一般城与关隘
    lowZoomLabels.sort(function (a, b) { return (b.cap ? 1 : 0) - (a.cap ? 1 : 0); });
    lowZoomLabels.forEach(function (l) {
      const name = l.site.name;
      // 缩到整张天下时，城名至少保留到能认出字的尺寸；宁可略挤，也不让名字变成黑点
      const fs = l.cap ? 20 : 15;
      ctx.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(name).width;
      const boxH = fs + 4;
      const candidates = [
        { x: l.sx - tw / 2, y: l.sy + 6 },
        { x: l.sx - tw / 2, y: l.sy - boxH - 6 },
        { x: l.sx + 6, y: l.sy - boxH / 2 },
        { x: l.sx - tw - 6, y: l.sy - boxH / 2 },
        { x: l.sx - tw / 2, y: l.sy + boxH + 8 },
        { x: l.sx - tw / 2, y: l.sy - boxH * 2 - 8 },
      ];
      let spot = null;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (!placed.some(function (r) {
          return c.x < r.x + r.w && c.x + tw + 6 > r.x && c.y < r.y + r.h && c.y + boxH > r.y;
        })) { spot = c; break; }
      }
      if (!spot) spot = candidates[0];
      placed.push({ x: spot.x, y: spot.y, w: tw + 6, h: boxH });
      ctx.fillStyle = 'rgba(8,6,4,0.86)';
      ctx.fillRect(spot.x, spot.y, tw + 6, boxH);
      ctx.fillStyle = l.cap ? '#ffe0a8' : l.color;
      ctx.fillRect(spot.x, spot.y, 2, boxH);
      text(ctx, name, spot.x + 4, spot.y + 1, {
        size: fs, color: l.cap ? '#ffe9c4' : l.color,
      });
    });
  }
  ctx.restore();
}

function drawUnits(ctx, app, cam, box, w) {
  const st = app.state;
  const assets = app.assets;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();

  // 匪团：一整队人（按档位换造型），人一眼能看出该不该惹
  const z = app.mapZoom || 1;
  const low = z < 0.40;
  const nowH = stateLib.gameHours(st);
  st.parties.forEach(function (p) {
    const up = stateLib.unitAnimPos(p, nowH);
    const sx = up.x * TS - cam.x + TS / 2;
    const sy = box.top + up.y * TS - cam.y + TS / 2;
    if (sx < -40 || sx > w + 40 || sy < box.top - 40 || sy > box.top + box.h + 40) return;
    // 整张天下：匪团收成一个小色点
    if (low) {
      ctx.beginPath();
      ctx.arc(sx, sy, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#7a3a2a';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(10,8,6,0.6)';
      ctx.stroke();
      return;
    }
    const icon = assets.banditPartyFor(p.banditTier || 'qing', p.color);
    const sz = (p.banditTier === 'hong' ? 70 : p.banditTier === 'cheng' ? 64 : 56) * z;
    ctx.drawImage(icon, sx - sz / 2, sy - sz * 0.78, sz, sz);

    // 兵力小字：先看人数再决定上不上（拉远时省掉，免得糊成一团）
    const n = army.troopCount(p.troops || {});
    if (n > 0 && z >= 0.9) {
      text(ctx, String(n), sx + 16 * z, sy - 6 * z, {
        size: Math.round(14 * z), color: p.color === '#4f8f6a' ? '#8fd0a8' : '#f0c9b0', shadow: true,
      });
    }
    if (p.chasing) {
      text(ctx, '!', sx, sy - 52 * z, { size: Math.round(20 * z), align: 'center', color: '#e05a42', shadow: true });
    }
    // 匪团的名号：跟领主一样挂在模型下面，一眼看清是谁
    if (z >= 0.9) {
      const nsz = Math.max(11, Math.round(14 * z));
      ctx.font = 'bold ' + nsz + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(p.name).width;
      ctx.fillStyle = 'rgba(10,8,6,0.78)';
      ctx.fillRect(sx - tw / 2 - 6, sy + 15 * z, tw + 12, nsz + 4);
      text(ctx, p.name, sx, sy + 16 * z, {
        size: nsz, align: 'center', color: '#f0c9b0',
      });
    }
    // 匪团的旗：一面"贼"字，跟领主的势力旗同样大小，全国地图上也认得出
    const fw = 20 * z;
    const fh = 22 * z;
    const fx = sx + 12 * z;
    const fy = sy - 34 * z;
    ctx.fillStyle = 'rgba(12,9,6,0.6)';
    ctx.fillRect(fx - 2 * z, fy - 2 * z, fw + 4 * z, fh + 4 * z);
    ctx.fillStyle = p.color || '#7a3a2a';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = 'rgba(255,240,210,0.45)';
    ctx.lineWidth = Math.max(1, 1 * z);
    ctx.strokeRect(fx, fy, fw, fh);
    text(ctx, '贼', fx + fw / 2, fy + 16 * z, {
      size: Math.max(12, Math.round(15 * z)), align: 'center', color: '#fff',
    });

    if (p.engagedWith || p.scuffle > 0) {
      ctx.fillStyle = 'rgba(220,80,50,0.85)';
      ctx.fillRect(sx - 22 * z, sy - 58 * z, 44 * z, 16 * z);
      text(ctx, '交战中', sx, sy - 57 * z, { size: Math.round(12 * z), align: 'center', color: '#fff' });
    }
    if (p.scripted) {
      ctx.fillStyle = 'rgba(200,60,40,0.9)';
      ctx.fillRect(sx - 22 * z, sy - 76 * z, 44 * z, 16 * z);
      text(ctx, '追兵', sx, sy - 75 * z, { size: Math.round(13 * z), align: 'center', color: '#fff' });
    }
  });

  // 领主
  st.lords.forEach(function (lord) {
    if (!lord.alive || lord.inCity) return;
    const up = stateLib.unitAnimPos(lord, nowH);
    const sx = up.x * TS - cam.x + TS / 2;
    const sy = box.top + up.y * TS - cam.y + TS / 2;
    if (sx < -50 || sx > w + 50 || sy < box.top - 50 || sy > box.top + box.h + 50) return;
    const hostile = stateLib.isHostileFaction(st, lord.faction);
    const col = FACTIONS[lord.faction] ? FACTIONS[lord.faction].color : '#999';

    // 整张天下：领主收成一个势力色方块，敌对的套红圈
    if (low) {
      ctx.fillStyle = col;
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = hostile ? '#d25a42' : 'rgba(10,8,6,0.7)';
      ctx.strokeRect(sx - 4, sy - 4, 8, 8);
      return;
    }

    if (hostile) {
      ctx.fillStyle = 'rgba(180,60,45,0.85)';
      ctx.beginPath();
      ctx.arc(sx, sy, 22 * z, 0, Math.PI * 2);
      ctx.fill();
    }
    // 领主：一整队人马（骑手 + 两卒 + 旗），按势力上色
    const look = lookFor(lord.id);
    const icon = assets.partyIconFor(col, look);
    const isz = (lord.id === 'lvbu' ? 82 : look.big ? 74 : 68) * z;
    ctx.drawImage(icon, sx - isz / 2, sy - isz * 0.76, isz, isz);

    // 势力简写：一面小旗，全国地图上也认得出是哪家的
    const banner = FACTIONS[lord.faction] ? FACTIONS[lord.faction].banner : '?';
    const bw = 20 * z;
    const bh = 22 * z;
    const bxx = sx + 12 * z;
    const byy = sy - 30 * z;
    ctx.fillStyle = 'rgba(12,9,6,0.6)';
    ctx.fillRect(bxx - 2 * z, byy - 2 * z, bw + 4 * z, bh + 4 * z);
    ctx.fillStyle = col;
    ctx.fillRect(bxx, byy, bw, bh);
    ctx.strokeStyle = 'rgba(255,240,210,0.55)';
    ctx.lineWidth = Math.max(1, 1 * z);
    ctx.strokeRect(bxx, byy, bw, bh);
    text(ctx, banner, bxx + bw / 2, byy + 16 * z, {
      size: Math.max(12, Math.round(15 * z)), align: 'center', color: '#fff',
    });

    const nsz = Math.max(11, Math.round(15 * z));
    if (z >= 0.4) {
      ctx.font = 'bold ' + nsz + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(lord.name).width;
      ctx.fillStyle = 'rgba(10,8,6,0.75)';
      ctx.fillRect(sx - tw / 2 - 6, sy + 18 * z, tw + 12, nsz + 5);
      text(ctx, lord.name, sx, sy + 19 * z, { size: nsz, align: 'center', color: hostile ? '#e58a7a' : '#e6dbc2' });
    }
    // 拉近了才写兵力，远望只认旗
    if (z >= 1.2) {
      text(ctx, String(army.troopCount(lord.troops || {})), sx + 18 * z, sy - 46 * z, {
        size: Math.max(11, Math.round(14 * z)), align: 'left', color: '#efe3c6', shadow: true,
      });
    }

    if (lord.engagedWith) {
      ctx.fillStyle = 'rgba(220,80,50,0.9)';
      ctx.fillRect(sx - 24 * z, sy - 58 * z, 48 * z, 16 * z);
      text(ctx, '交战中', sx, sy - 57 * z, {
        size: Math.round(12 * z), align: 'center', color: '#fff',
      });
    }
    if (lord.chasing) {
      text(ctx, '!', sx, sy - 44 * z, { size: Math.round(22 * z), align: 'center', color: '#e05a42' });
    }
  });
  ctx.restore();
}

function drawRoute(ctx, app, cam, box) {
  const st = app.state;
  const p = st.player;
  if (!p.route || !p.route.length) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, app.runtime.width, box.h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(240,192,96,0.55)';
  ctx.lineWidth = Math.max(1.2, 3 * (app.mapZoom || 1));
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  const sx0 = p.x * TS + TS / 2 - cam.x;
  const sy0 = box.top + p.y * TS + TS / 2 - cam.y;
  ctx.moveTo(sx0, sy0);
  p.route.forEach(function (n) {
    ctx.lineTo(n.x * TS + TS / 2 - cam.x, box.top + n.y * TS + TS / 2 - cam.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  const last = p.route[p.route.length - 1];
  const ex = last.x * TS + TS / 2 - cam.x;
  const ey = box.top + last.y * TS + TS / 2 - cam.y;
  ctx.strokeStyle = 'rgba(240,192,96,0.9)';
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(4, 10 * (app.mapZoom || 1)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 自由视野提示：人跑出画面时给个"跳回原处"；城里歇息时给条回城提示 */
function drawFreeHint(ctx, app, box, w) {
  const st = app.state;
  const p = st.player;
  const pos = playerPixel(app);
  const sx = pos.gx * TS + TS / 2 - app.mapCam.x;
  const sy = box.top + pos.gy * TS + TS / 2 - app.mapCam.y;
  const onScreen = sx > 36 && sx < w - 36 && sy > box.top + 36 && sy < box.top + box.h - 36;

  if (p.resting) {
    const site = siteById(st.world, p.resting);
    ctx.fillStyle = 'rgba(16,20,14,0.78)';
    ctx.fillRect(0, box.top, w, 30);
    text(ctx, '在' + (site ? site.name : '城里') + '歇息 · 粮耗减半 · 时辰照走 · 点一下地图就回城',
      w / 2, box.top + 6, { size: 15, align: 'center', color: '#9fc08a' });
  }

  if (!app.mapFree || onScreen) return;
  const bw = 132;
  const bh = 48;
  const bx = w - bw - 12;
  const by = p.resting ? box.top + 40 : box.top + box.h - 60;
  ctx.fillStyle = 'rgba(40,32,22,0.9)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#8a7448';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  text(ctx, '跳回原处', bx + bw / 2, by + 12, { size: 19, align: 'center', color: '#f0c060' });
  app.ui.rect('map_recenter', bx, by, bw, bh, function () {
    app.mapFree = false;
    app.follow = null;
    const pos2 = playerPixel(app);
    app.mapCam = {
      x: pos2.gx * TS + TS / 2 - app.runtime.width / 2,
      y: pos2.gy * TS + TS / 2 - box.h / 2,
    };
    ensureCam(app);
    app.showToast('回到自己所在的位置。', 1.4);
  });
}

function playerPixel(app) {
  const p = app.state.player;
  let gx = p.x;
  let gy = p.y;
  if (p.stepTo && p.stepFrom && p.stepProgress > 0) {
    const t = p.stepProgress > 1 ? 1 : p.stepProgress;
    gx = p.stepFrom.x + (p.stepTo.x - p.stepFrom.x) * t;
    gy = p.stepFrom.y + (p.stepTo.y - p.stepFrom.y) * t;
  }
  return { gx, gy };
}

function drawPlayerOnMap(ctx, app, cam, box) {
  // 人在城里歇着、只是拉远看天下：地图上不摆自己，回城界面才有他
  if (app.restView) return;
  const p = app.state.player;
  const pos = playerPixel(app);
  const walk = p.stepTo ? Math.abs(Math.sin(p.stepProgress * Math.PI)) : 0;
  const sx = pos.gx * TS + TS / 2 - cam.x;
  const sy = box.top + pos.gy * TS + TS / 2 - cam.y - walk * TS * 0.078;

  // 整张天下：自己收成一枚金点，位置一眼能找到
  if ((app.mapZoom || 1) < 0.45) {
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f0c060';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2a1c08';
    ctx.stroke();
    return;
  }

  pixel.drawPlayer(ctx, app.assets, sx, sy, TS, app.mapPhase || 0, p.facing || 1);

  // 头顶旗标（跟着缩放一起变大变小）：自立后直接写国号一字
  const country = p.country && p.country.name ? p.country : null;
  ctx.fillStyle = country ? country.color : '#d9a441';
  ctx.beginPath();
  ctx.moveTo(sx - TS * 0.19, sy - TS * 0.81);
  ctx.lineTo(sx + TS * 0.19, sy - TS * 0.81);
  ctx.lineTo(sx, sy - TS * 0.625);
  ctx.closePath();
  ctx.fill();
  text(ctx, country ? country.name : (p.banner ? '旗' : '我'), sx, sy - TS * 0.78, {
    size: Math.max(10, Math.round(TS * 0.2)), align: 'center', color: '#2a1c08',
  });
}

/** 酒馆任务目标：地图上留一圈金标，刚定位的那个再亮一点 */
function drawQuestMarkers(ctx, app, cam, box, w) {
  const st = app.state;
  if (!st || !st.quests || !st.quests.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();
  st.quests.forEach(function (q) {
    if (q.done) return;
    const t = stateLib.questTargetPos(st, q);
    if (!t) return;
    const sx = t.x * TS - cam.x + TS / 2;
    const sy = box.top + t.y * TS - cam.y + TS / 2;
    if (sx < -TS || sx > w + TS || sy < box.top - TS || sy > box.top + box.h + TS) return;
    const focus = app.mapQuestFocus === q.id;
    const z = app.mapZoom || 1;
    const pulse = focus ? 3 + Math.sin((app.mapPhase || 0) * 3) * 3 : 0;
    ctx.strokeStyle = focus ? '#ffd76a' : 'rgba(240,192,96,0.55)';
    ctx.lineWidth = focus ? 4 : 2;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(10, TS * (focus ? 0.46 : 0.32)) + pulse, 0, Math.PI * 2);
    ctx.stroke();
    if (focus) {
      ctx.strokeStyle = 'rgba(255,225,150,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(14, TS * 0.56) + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (focus || z >= 0.62) {
      const label = (focus ? '任务 · ' : '') + t.name;
      ctx.font = 'bold ' + (focus ? 15 : 12) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(label).width;
      const lx = sx - tw / 2 - 6;
      const ly = sy - Math.max(18, TS * 0.55) - (focus ? 22 : 14);
      ctx.fillStyle = focus ? 'rgba(52,34,10,0.94)' : 'rgba(10,8,6,0.70)';
      ctx.fillRect(lx, ly, tw + 12, focus ? 22 : 18);
      text(ctx, label, sx, ly + (focus ? 3 : 2), {
        size: focus ? 15 : 12, align: 'center', color: focus ? '#ffd76a' : '#d8bf82',
      });
    }
  });
  ctx.restore();
}

/** 左上角常驻任务卡：现在该干什么，点开能看详情 */
function drawQuestCard(ctx, app, box, w) {
  const st = app.state;
  const info = stateLib.campaignInfo(st);
  if (!info) return;

  const pw = Math.min(520, w - 20);
  const ph = info.done ? 78 : 116;
  const x = 10;
  const y = box.top + 10;

  ctx.fillStyle = 'rgba(10,8,6,0.80)';
  ctx.fillRect(x, y, pw, ph);
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(x, y, 4, ph);
  ctx.fillStyle = 'rgba(217,164,65,0.10)';
  ctx.fillRect(x + 4, y, pw - 4, 26);

  if (info.done) {
    text(ctx, '主线已走完', x + 16, y + 8, { size: 17, color: '#8fbf7a' });
    text(ctx, '剩下的是占地与写史', x + 16, y + 38, { size: 15, color: '#a2947a' });
    app.ui.rect('quest_card', x, y, pw, ph, function () { app.push('journal'); });
    return;
  }

  text(ctx, '主线 · 第 ' + (info.index + 1) + '/' + info.total + ' 章', x + 16, y + 4, {
    size: 16, color: '#a2947a',
  });
  const tl = wrap(ctx, info.title, pw - 130, 20, 'bold')[0] || '';
  text(ctx, tl, x + 16, y + 28, { size: 20, color: '#f0c060' });

  const hintLine = wrap(ctx, info.hint, pw - 44, 16).slice(0, 2);
  hintLine.forEach(function (ln, i) {
    text(ctx, ln, x + 16, y + 60 + i * 24, { size: 16, color: i === 0 ? '#efe3c6' : '#a2947a' });
  });

  text(ctx, '点开看任务', x + pw - 14, y + 6, { size: 14, align: 'right', color: '#8a8070' });
  app.ui.rect('quest_card', x, y, pw, ph, function () { app.push('journal'); });
}

function drawRegionTag(ctx, app, box, w) {
  const st = app.state;
  const reg = regionDef(regionAt(st.world, st.player.x, st.player.y));
  const label = reg.name;
  ctx.font = 'bold 20px "PingFang SC","Microsoft YaHei",sans-serif';
  const tw = ctx.measureText(label).width;
  const y = box.top + box.h - 46;
  ctx.fillStyle = 'rgba(10,8,6,0.62)';
  ctx.fillRect(10, y, tw + 96, 36);
  ctx.fillStyle = reg.palette.ground;
  ctx.fillRect(10, y, 4, 36);
  text(ctx, label, 22, y + 8, { size: 20, color: '#efe3c6' });
  text(ctx, '此地风物', 22 + tw + 12, y + 10, { size: 15, color: '#a2947a' });
}

function drawTop(ctx, app, w) {
  const st = app.state;
  const p = st.player;

  ctx.fillStyle = '#171310';
  ctx.fillRect(0, 0, w, TOP_H);
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(0, TOP_H - 3, w, 3);

  const hour = Math.floor(st.clock.hour);
  const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  let topLine = '第 ' + st.clock.day + ' 天 ' + pad(hour) + ' 时';
  let topColor = '#c9bda2';
  // 统一之后，左上角一直挂着那场还没来的大旱
  if (st.arc && st.arc.phase === 'celebration') {
    const leftDays = Math.max(0, (st.arc.disasterDay || st.clock.day) - st.clock.day);
    topLine += ' · 距大旱 ' + leftDays + ' 天';
    if (leftDays <= 5) topColor = '#e06a52';
  } else if (st.arc && st.arc.phase === 'reconquest') {
    const loyal = (st.arc.loyalLords || []).length;
    topLine += ' · 与天下为敌 · 旧部 ' + loyal;
    topColor = '#e06a52';
  }
  text(ctx, topLine, 16, 12, { size: st.arc ? 16 : 20, color: topColor });

  const fac = p.faction
    ? (p.faction === 'player'
      ? (p.country && p.country.name ? p.country.name + '国' : '你的旗')
      : (FACTIONS[p.faction] ? FACTIONS[p.faction].full : p.faction))
    : '无主';
  const title = stateLib.renownTitle(p.renown);
  // 声望到哪一档，左上角就换哪一档的称呼；“无名溃兵”只属于开局
  text(ctx, title, 16, 40, { size: 24, color: '#f0c060' });
  text(ctx, '· ' + p.name + ' · ' + fac, 180, 44, { size: 18, color: '#a2947a' });

  // 倍速
  const speeds = [1, 2, 3];
  speeds.forEach(function (s, i) {
    const bx = w - 150 + i * 46;
    const active = (st.timeScale || 1) === s;
    ctx.fillStyle = active ? '#d9a441' : '#2c2318';
    ctx.fillRect(bx, 12, 40, 32);
    text(ctx, s + 'x', bx + 20, 18, { size: 18, align: 'center', color: active ? '#201409' : '#9c907a' });
    app.ui.rect('speed' + s, bx, 12, 40, 32, function () {
      st.timeScale = s;
    });
  });

  // 资源条
  const foodNeed = stateLib.nextFoodNeed(st);
  const foodShort = p.food < foodNeed;
  const items = [
    { k: '金钱', v: p.gold, c: '#f0c060' },
    { k: '粮草', v: p.food, c: foodShort ? '#e06a52' : '#c8b478' },
    { k: '兵力', v: army.troopCount(p.troops) + '/' + stateLib.capacity(st), c: '#8fb0d8' },
    { k: '声望', v: p.renown, c: '#c98f6a' },
    { k: '天机简', v: p.shi, c: '#b98fd8' },
  ];
  const cw = (w - 32) / items.length;
  items.forEach(function (it, i) {
    const x = 16 + i * cw;
    text(ctx, it.k, x, 72, { size: 13, color: '#8a8070' });
    text(ctx, String(it.v), x, 92, { size: 17, color: it.c });
  });

  if (foodShort) {
    ctx.fillStyle = 'rgba(120,30,20,0.92)';
    ctx.fillRect(12, 106, w - 24, 24);
    text(ctx, '粮草告急 · 撑不过两日 · 下次发粮需 ' + foodNeed + '，速补！', 18, 109, {
      size: 15, color: '#ffd8b0',
    });
  }

  // 战役目标不放在顶栏了，改成地图上的任务卡（见 drawQuestCard）
}

/** 地图上的围营卡：不打开城页也能看到第几天、还差几个时辰 */
function drawSiegeStatus(ctx, app, box, w) {
  const st = app.state;
  const ps = st && st.playerSiege;
  if (!ps || app.siegePrompt) return;
  const site = siteById(st.world, ps.siteId);
  if (!site) return;
  const now = stateLib.gameHours(st);
  const left = Math.max(0, ps.readyHour - now);
  const ready = ps.stage === 'ready' || left <= 0;
  const day = Math.min(ps.days, Math.floor(Math.max(0, now - ps.startHour) / 24) + 1);
  const pw = Math.min(520, w - 20);
  const ph = 82;
  const x = 10;
  const y = box.top + 136;
  const ratio = Math.max(0, Math.min(1, 1 - left / (ps.days * 24)));

  ctx.fillStyle = 'rgba(10,8,6,0.88)';
  ctx.fillRect(x, y, pw, ph);
  ctx.fillStyle = ready ? '#8fbf7a' : '#d9a441';
  ctx.fillRect(x, y, 4, ph);
  text(ctx, '围城 · ' + site.name, x + 16, y + 6, { size: 20, color: '#f0c060' });
  text(ctx, ready ? '已围成 · 点这里决战' : '第 ' + day + ' / ' + ps.days + ' 天 · 还需 ' + Math.ceil(left) + ' 时辰',
    x + 16, y + 30, { size: 15, color: ready ? '#8fbf7a' : '#c9bda2' });
  text(ctx, '时辰在大地图上流动', x + pw - 12, y + 8, {
    size: 12, align: 'right', color: '#8a8070',
  });
  bar(ctx, x + 16, y + 54, pw - 32, 10, ratio, ready ? '#8fbf7a' : '#c97a42');
  app.ui.rect('siege_status', x, y, pw, ph, function () {
    st.player.atSiteId = site.id;
    app.push('town', { siteId: site.id, view: 'siege' });
  });
}

/** 围城选择框：围满时自动弹出，也可以点别处主动唤出。
 * 弹窗开着时 update() 不推进 state 时间，世界完全停住。 */
function drawSiegePrompt(ctx, app, box, w) {
  const sp = app.siegePrompt;
  if (!sp) return;
  const st = app.state;
  const site = siteById(st.world, sp.siteId);
  if (!site) { app.siegePrompt = null; return; }
  const ps = st.playerSiege;
  const ready = sp.mode === 'ready' || !!(ps && (ps.stage === 'ready' || stateLib.gameHours(st) >= ps.readyHour));

  ctx.fillStyle = 'rgba(6,4,3,0.78)';
  ctx.fillRect(0, 0, w, app.runtime.height);
  // 弹窗开着时，只让弹窗的两个按钮接点击；后面的地图按钮全部作废。
  // 注意不能每帧清 app.ui.pressed：真机手指按住按钮会跨好几帧，清掉后
  // touchend 找不到按下项，两个按钮就会像“卡死”一样没反应。
  app.ui.items.length = 0;
  const pw = Math.min(620, w - 36);
  const ph = 340;
  const x = (w - pw) / 2;
  const y = box.top + Math.max(48, (box.h - ph) / 2);
  panel(ctx, x, y, pw, ph, { fill: '#241c14', shadow: true });

  text(ctx, ready ? '城下 · 围城已成' : '还在围' + site.name,
    x + 26, y + 22, { size: 30, color: ready ? '#f0c060' : '#f0c060' });
  const lines = ready
    ? ['围城的时辰到了。城头的白旗已经挂出来，城门就在眼前。',
      '现在带人攻城，还是拔营离开，去围下一座？']
    : ['城下营寨已经扎好，围城时辰还在走。',
      '要留在这里继续围，还是拔营去别处？'];
  lines.forEach(function (ln, i) {
    text(ctx, ln, x + 26, y + 72 + i * 26, { size: 18, color: '#efe3c6' });
  });
  text(ctx, ready ? '攻城一旦开始，就没有回头路。' : '拔营后，之前围掉的时辰就白费了。',
    x + 26, y + 138, { size: 15, color: '#a2947a' });

  const bw = (pw - 52 - 14) / 2;
  if (ready) {
    app.ui.button(ctx, x + 26, y + 188, bw, 82, '进攻城池', {
      id: 'siege_prompt_attack', size: 25, fill: '#6a3a22', onTap: function () {
        const battle = stateLib.startSiege(st, site);
        if (!battle) {
          app.showToast('城头还没乱到能攻的地步。', 2.4);
          return;
        }
        app.siegePrompt = null;
        app.push('battle', { mode: 'siege' });
      },
    });
  } else {
    app.ui.button(ctx, x + 26, y + 188, bw, 82, '继续围城', {
      id: 'siege_prompt_keep', size: 24, fill: '#33271b', onTap: function () {
        app.siegePrompt = null;
      },
    });
  }
  app.ui.button(ctx, x + 26 + bw + 14, y + 188, bw, 82, '拔营离开', {
    id: 'siege_prompt_leave', size: 24, fill: '#4a241c', onTap: function () {
      const r = stateLib.cancelPlayerSiege(st);
      app.siegePrompt = null;
      app.showToast(r.msg || '已拔营离开。', 2.4);
    },
  });
  text(ctx, ready ? '选择期间，时辰暂停' : '围城计时只在大地图上流动',
    x + pw / 2, y + ph - 40, { size: 14, align: 'center', color: '#8a8070' });
}

function drawBottom(ctx, app, w, box) {
  const y0 = box.top + box.h;
  ctx.fillStyle = '#171310';
  ctx.fillRect(0, y0, w, BOT_H);
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(0, y0, w, 3);

  function leaveCampFlow() {
    if (app.state) app.state.campFlow = false;
  }
  const btns = [
    { id: 'army', label: '队伍', tap: function () { leaveCampFlow(); app.push('army'); } },
    { id: 'journal', label: '史册', tap: function () { leaveCampFlow(); app.push('journal'); } },
    // 扎营按钮不自己清 campFlow：CampScene 看到它还在，会直接弹出“继续/拔营”。
    { id: 'camp', label: '扎营', tap: function () { app.push('camp'); } },
    { id: 'shop', label: '商店', tap: function () { leaveCampFlow(); app.push('shop'); } },
    { id: 'menu', label: '菜单', tap: function () { leaveCampFlow(); app.push('menu'); } },
  ];
  const gap = 8;
  const bw = (w - 20 - gap * 4) / 5;
  btns.forEach(function (b, i) {
    app.ui.button(ctx, 10 + i * (bw + gap), y0 + 14, bw, 76, b.label, {
      id: b.id, size: 24, onTap: b.tap,
    });
  });

  const st = app.state;
  const p = st.player;
  const wars = stateLib.factionWars(st);
  const warTxt = wars.length ? ' · 天下 ' + wars.length + ' 处交兵' : ' · 四境暂无大战';
  const siegeNow = st.playerSiege ? siteById(st.world, st.playerSiege.siteId) : null;
  const hint = (siegeNow
    ? '围城中 · ' + siegeNow.name + ' · 点城下营寨看进度 · 点别处决定去留'
    : (p.route && p.route.length
      ? '行军第 ' + (st.player.route.length - (st.player.route.length - 1)) + ' 段 · 点地图可改道'
      : (st.player.atSiteId ? '在' + (siteById(st.world, st.player.atSiteId) || {}).name + ' · 点地图出发' : '点地图行军 · 双指缩放 · 拖动平移')))
    + warTxt;
  text(ctx, hint, w / 2, y0 + 104, { size: 16, align: 'center', color: '#8a8070' });
}

module.exports = MapScene;

  };

  /* js/scenes/atlas.js */
  __defs[23] = function (module, exports, __require) {
/**
 * 天下大势：可缩放的势力总图
 * 任何缩放级别都保留城与关隘的名字；放大时铺上各势力领土色、描州界。
 */

const { REGIONS, FACTIONS, CAPITAL_IDS } = __require(5);
const { text, panel } = __require(6);
const stateLib = __require(7);
const territory = __require(21);

const MAP_TOP = 112;
const MAP_LEFT = 10;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3.2;

/** 左边是天下主图，右边是一条全屏高的关系栏；底部势力色并入关系栏。 */
function atlasLayout(w, h) {
  const sidebarW = Math.min(230, Math.max(188, Math.round(w * 0.25)));
  const gap = 14;
  const mapW = w - sidebarW - gap;
  const viewH = h - MAP_TOP - 14;
  return { sidebarW: sidebarW, gap: gap, mapW: mapW, viewH: viewH };
}

function cellColor(t, region) {
  if (t === 'sea') return '#1e4166';
  if (t === 'river') return '#356a94';
  if (t === 'mountain') return '#6d6760';
  if (t === 'road') return '#8f7a58';
  const r = REGIONS[region] || REGIONS.zhongyuan;
  return r.palette.ground;
}

function hexToRgb(hex) {
  const s = hex.replace('#', '');
  return [
    parseInt(s.substring(0, 2), 16),
    parseInt(s.substring(2, 4), 16),
    parseInt(s.substring(4, 6), 16),
  ];
}

function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return 'rgb(' +
    Math.round(ca[0] + (cb[0] - ca[0]) * t) + ',' +
    Math.round(ca[1] + (cb[1] - ca[1]) * t) + ',' +
    Math.round(ca[2] + (cb[2] - ca[2]) * t) + ')';
}

/**
 * 势力归属网格：每格找"最近的、权重最大的据点"，城控制范围大于村镇。
 * 真正的缓存在 territory.js 里，按据点归属签名失效；城池易主后立刻换色。
 */
function buildFactionGrid(world) {
  return territory.buildFactionGrid(world);
}

/** 简单名称避让 */
function labelFits(placed, x, y, w, h) {
  for (let i = 0; i < placed.length; i++) {
    const r = placed[i];
    if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return false;
  }
  return true;
}

const AtlasScene = {
  enter(app) {
    app.atlasPulse = 0;
    app.atlasZoom = 1;
    if (!app.atlasCenter) app.atlasCenter = null;
  },

  update(app, dt) {
    app.atlasPulse = (app.atlasPulse || 0) + dt;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const world = st.world;

    ctx.fillStyle = '#0e0b08';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '天下大势', 16, 22, { size: 34, color: '#f0c060' });
    text(ctx, '魏 · 蜀 · 吴 · 群雄割据', 16, 66, { size: 17, color: '#a2947a' });

    app.ui.button(ctx, w - 146, 20, 130, 56, '返回', {
      id: 'atlas_back', size: 22, onTap: function () { app.pop(); },
    });

    const layout = atlasLayout(w, h);
    const mapW = layout.mapW;
    const zoom = app.atlasZoom || 1;
    const baseCell = Math.min((mapW - MAP_LEFT * 2) / world.w, layout.viewH / world.h);
    const cell = baseCell * zoom;
    const viewH = layout.viewH;
    const viewW = mapW;

    // 视野中心（格坐标）；未拖过就对准玩家
    if (!app.atlasCenter) {
      app.atlasCenter = { x: world.w / 2, y: world.h / 2 };
    }
    const c = app.atlasCenter;
    const halfW = viewW / cell / 2;
    const halfH = Math.min(viewH, cell * world.h) / cell / 2;
    c.x = Math.max(halfW, Math.min(world.w - halfW, c.x));
    c.y = Math.max(halfH, Math.min(world.h - halfH, c.y));

    const ox = mapW / 2 - c.x * cell;
    const oy = MAP_TOP + 6 + Math.min(viewH, cell * world.h) / 2 - c.y * cell;

    const grid = buildFactionGrid(world);
    // 势力颜色是所有缩放级别的底图，不再等到放大才出现
    const detailed = zoom > 1.35;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, MAP_TOP, mapW, Math.min(viewH, cell * world.h) + 12);
    ctx.clip();

    // 底图层
    const x0 = Math.max(0, Math.floor(-ox / cell) - 1);
    const x1 = Math.min(world.w - 1, Math.ceil((mapW - ox) / cell) + 1);
    const y0 = Math.max(0, Math.floor((MAP_TOP - oy) / cell) - 1);
    const y1 = Math.min(world.h - 1, Math.ceil((MAP_TOP + viewH - oy) / cell) + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * world.w + x;
        const t = world.tiles[i];
        const reg = world.regions[i] || 'zhongyuan';
        let col = cellColor(t, reg);
        if (t !== 'sea' && t !== 'river') {
          const f = FACTIONS[grid[i]];
          if (f) col = mix(col, f.color, 0.55);
        }
        ctx.fillStyle = col;
        ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.7, cell + 0.7);
      }
    }

    // 州界：格子左侧/上侧与邻居归属不同就描一条线（缩小也描，势力范围一眼可见）
    {
      ctx.strokeStyle = 'rgba(20,16,10,0.85)';
      ctx.lineWidth = Math.max(1.4, cell * 0.12);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * world.w + x;
          const f = grid[i];
          if (!f) continue;
          const sx = ox + x * cell;
          const sy = oy + y * cell;
          if (x > 0 && grid[i - 1] && grid[i - 1] !== f) {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx, sy + cell);
            ctx.stroke();
          }
          if (y > 0 && grid[i - world.w] && grid[i - world.w] !== f) {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + cell, sy);
            ctx.stroke();
          }
        }
      }
    }

    // 据点
    const placed = [];
    world.sites.forEach(function (s) {
      const sx = ox + (s.x + 0.5) * cell;
      const sy = oy + (s.y + 0.5) * cell;
      if (sx < -20 || sx > w + 20 || sy < MAP_TOP - 20 || sy > MAP_TOP + viewH + 20) return;
      const fac = s.ownerFaction ? FACTIONS[s.ownerFaction] : null;
      const col = fac ? fac.color : '#8a8276';

      if (s.type === 'village') {
        ctx.fillStyle = col;
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        if (zoom < 1.9 && labelFits(placed, sx - 16, sy + 3, 32, 13)) {
          placed.push({ x: sx - 16, y: sy + 3, w: 32, h: 13 });
          text(ctx, s.name, sx, sy + 4, { size: 10, align: 'center', color: 'rgba(224,214,190,0.62)' });
        }
        return;
      }
      if (s.type === 'camp') {
        ctx.fillStyle = '#a8503c';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
        return;
      }

      const big = s.type === 'town';
      const sz = big ? Math.max(8, cell * 0.5) : Math.max(6, cell * 0.38);
      const playerColor = FACTIONS.player ? FACTIONS.player.color : '#f0c060';
      ctx.fillStyle = '#0d0a07';
      ctx.fillRect(sx - sz / 2 - 1, sy - sz / 2 - 1, sz + 2, sz + 2);
      ctx.fillStyle = s.playerOwned ? playerColor : col;
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
      if (big) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, 1);
      }

      // 城与关隘的名字在天下大势的每个缩放级别都保留：能避让就避让，避不开也不隐藏
      const isCap = CAPITAL_IDS.indexOf(s.id) >= 0;
      const fs = detailed ? (isCap ? 20 : 18) : (isCap ? 16 : 14);
      ctx.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(s.name).width;
      const spots = [
        { x: sx - tw / 2 - 3, y: sy + sz / 2 + 1 },
        { x: sx - tw / 2 - 3, y: sy - sz / 2 - fs - 5 },
        { x: sx + sz / 2 + 4, y: sy - fs / 2 },
        { x: sx - sz / 2 - tw - 7, y: sy - fs / 2 },
        { x: sx - tw / 2 - 3, y: sy + sz / 2 + fs + 7 },
      ];
      let spot = null;
      for (let si = 0; si < spots.length; si++) {
        const c = spots[si];
        if (labelFits(placed, c.x, c.y, tw + 6, fs + 4)) { spot = c; break; }
      }
      if (!spot) spot = spots[0];
      placed.push({ x: spot.x, y: spot.y, w: tw + 6, h: fs + 4 });
      ctx.fillStyle = 'rgba(8,6,4,0.82)';
      ctx.fillRect(spot.x, spot.y, tw + 6, fs + 4);
      if (s.playerOwned) {
        ctx.fillStyle = playerColor;
        ctx.fillRect(spot.x, spot.y, tw + 6, 2);
      }
      text(ctx, s.name, spot.x + tw / 2 + 3, spot.y + 1, {
        size: fs, align: 'center', color: s.playerOwned ? playerColor : '#ece1c8',
      });
    });

    // 自己
    const ppx = ox + (st.player.x + 0.5) * cell;
    const ppy = oy + (st.player.y + 0.5) * cell;
    const pulse = 5 + Math.sin((app.atlasPulse || 0) * 3) * 2;
    ctx.strokeStyle = 'rgba(240,192,96,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ppx, ppy, pulse + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.moveTo(ppx, ppy - 8);
    ctx.lineTo(ppx + 6, ppy + 6);
    ctx.lineTo(ppx, ppy + 2);
    ctx.lineTo(ppx - 6, ppy + 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    this.drawRelations(app, ctx, w, h, st, layout);

    // 缩放按钮
    const bx0 = mapW - 84;
    const by0 = MAP_TOP + Math.min(viewH, cell * world.h) - 74;
    app.ui.button(ctx, bx0, by0, 66, 30, '＋', {
      id: 'atlas_zoom_in', size: 22, onTap: function () {
        app.atlasZoom = Math.min(ZOOM_MAX, (app.atlasZoom || 1) * 1.35);
      },
    });
    app.ui.button(ctx, bx0, by0 + 38, 66, 30, '－', {
      id: 'atlas_zoom_out', size: 22, onTap: function () {
        app.atlasZoom = Math.max(ZOOM_MIN, (app.atlasZoom || 1) / 1.35);
      },
    });

    // 左图下方只留一行操作提示，势力色图例挪进右侧关系栏
    const hintY = Math.min(h - 26, MAP_TOP + Math.min(viewH, cell * world.h) + 16);
    text(ctx, '双指缩放 · ×' + zoom.toFixed(1) + ' · 城名常显',
      MAP_LEFT, hintY, { size: 13, color: '#8a8070' });
  },

  drawRelations(app, ctx, w, h, st, layout) {
    const px = layout.mapW + layout.gap;
    const pw = w - px - 10;
    const py = MAP_TOP + 8;
    const ph = h - py - 14;
    panel(ctx, px, py, pw, ph, { fill: 'rgba(14,11,8,0.94)' });

    text(ctx, '列国 · 与你', px + 14, py + 14, { size: 19, color: '#f0c060' });
    const warCount = Object.keys(FACTIONS).filter(function (id) {
      return id !== 'player' && id !== 'bandit' && stateLib.atWarWith(st, id);
    }).length;
    text(ctx, warCount ? '交战中 ' + warCount + ' 国' : '四境暂安',
      px + 14, py + 38, { size: 13, color: warCount ? '#e08a70' : '#8a8070' });

    // 国战动态保留在右侧，不再占地图下方的位置
    const cps = st.warCampaigns || {};
    const sieges = Object.keys(cps).filter(function (k) {
      return cps[k] && cps[k].stage === 'siege';
    }).map(function (k) {
      const cp = cps[k];
      const site = (st.world.sites || []).filter(function (s) { return s.id === cp.targetId; })[0];
      return (FACTIONS[k] ? FACTIONS[k].name : k) + '围' + (site ? site.name : '敌城');
    });
    const marches = Object.keys(cps).filter(function (k) {
      return cps[k] && cps[k].stage === 'march';
    }).length;
    const warLine = sieges.length
      ? '围城中：' + sieges.slice(0, 1).join('') + (sieges.length > 1 ? ' 等 ' + sieges.length + ' 处' : '')
      : (marches ? marches + ' 路诸侯开拔' : '暂无围城');
    text(ctx, warLine, px + 14, py + 56, { size: 12, color: sieges.length ? '#e0a050' : '#8a8070' });

    const ids = Object.keys(FACTIONS).filter(function (id) {
      return id !== 'bandit' && id !== (st.player.faction || 'player');
    });
    // 让关系名单尽量铺满全屏栏，名字之间的间距随屏高变化
    const legendIds = Object.keys(FACTIONS);
    const legendRows = Math.ceil(legendIds.length / 2);
    const legendH = legendRows * 30;
    const rowH = Math.max(34, Math.min(46,
      Math.floor((ph - 86 - legendH - 50) / Math.max(1, ids.length))));
    const rowTop = py + 86;
    ids.forEach(function (id, i) {
      const y = rowTop + i * rowH;
      const fac = FACTIONS[id];
      const rel = stateLib.relationOf(st, id);
      const war = stateLib.atWarWith(st, id);
      const fs = st.factionState[id] || {};
      ctx.fillStyle = fac.color;
      ctx.fillRect(px + 14, y + 5, 5, 19);
      text(ctx, fac.name || fac.full, px + 26, y, { size: 17, color: fs.dead ? '#6a6050' : '#e6dbc2' });
      text(ctx, fs.dead ? '亡' : rel > 0 ? '+' + rel : String(rel),
        px + pw - 12, y, { size: 17, align: 'right', color: fs.dead ? '#6a6050' : rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#c9bda2' });
      if (war) {
        ctx.fillStyle = 'rgba(210,70,50,0.85)';
        ctx.fillRect(px + 14, y + 23, 5, 5);
        text(ctx, '战', px + 26, y + 19, { size: 11, color: '#e08070' });
      }
    });

    // 势力色图例：原本在地图下方，现在合并到右侧关系栏底部
    const legendTop = Math.max(rowTop + ids.length * rowH + 18, py + ph - legendH - 40);
    ctx.fillStyle = 'rgba(120,92,54,0.45)';
    ctx.fillRect(px + 14, legendTop - 14, pw - 28, 1);
    text(ctx, '势力旗色', px + 14, legendTop, { size: 13, color: '#a2947a' });
    legendIds.forEach(function (id, i) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const lx = px + 14 + col * (pw / 2 - 8);
      const ly = legendTop + 22 + row * 30;
      ctx.fillStyle = FACTIONS[id].color;
      ctx.fillRect(lx, ly + 3, 12, 12);
      text(ctx, FACTIONS[id].name || FACTIONS[id].full, lx + 18, ly + 1, {
        size: 13, color: '#c9bda2',
      });
    });
  },

  onTouchStart(app, x, y) {
    const layout = atlasLayout(app.runtime.width, app.runtime.height);
    if (x > layout.mapW + 8) { app.atlasDrag = null; return; }
    app.atlasDrag = { x, y, cx: (app.atlasCenter || {}).x, cy: (app.atlasCenter || {}).y };
  },

  onTouchMove(app, x, y) {
    const d = app.atlasDrag;
    if (!d || !app.atlasCenter) return;
    const zoom = app.atlasZoom || 1;
    const layout = atlasLayout(app.runtime.width, app.runtime.height);
    const baseCell = Math.min((layout.mapW - MAP_LEFT * 2) / app.state.world.w, layout.viewH / app.state.world.h);
    const cell = baseCell * zoom;
    if (Math.abs(x - d.x) + Math.abs(y - d.y) < 8) return;
    app.atlasCenter.x = (d.cx || app.atlasCenter.x) - (x - d.x) / cell;
    app.atlasCenter.y = (d.cy || app.atlasCenter.y) - (y - d.y) / cell;
    if (app.lastHit) app.lastHit = null;
  },

  onTouchEnd(app, x, y) {
    const d = app.atlasDrag;
    app.atlasDrag = null;
    if (!d) return;
    // 双击放大
    const now = Date.now();
    if (Math.abs(x - d.x) + Math.abs(y - d.y) < 8) {
      if (app.atlasLastTap && now - app.atlasLastTap < 320) {
        app.atlasZoom = Math.min(ZOOM_MAX, (app.atlasZoom || 1) * 1.35);
        app.atlasLastTap = 0;
      } else {
        app.atlasLastTap = now;
      }
    }
  },
  onPinchStart(app, x, y) {
    app.atlasDrag = null;
    app.atlasLastTap = 0;
    app.atlasPinch = { zoom: app.atlasZoom || 1 };
  },

  onPinch(app, scale, cx, cy) {
    if (!app.atlasPinch) return;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const world = app.state.world;
    const layout = atlasLayout(w, h);
    const mapW = layout.mapW;
    const baseCell = Math.min((mapW - MAP_LEFT * 2) / world.w, layout.viewH / world.h);
    const viewH = layout.viewH;
    const oldCell = baseCell * (app.atlasZoom || 1);
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, app.atlasPinch.zoom * scale));
    const newCell = baseCell * next;
    if (!app.atlasCenter) app.atlasCenter = { x: world.w / 2, y: world.h / 2 };
    const c = app.atlasCenter;

    // 指下那一点不动：按新旧格宽把视野中心挪回去
    const px = Math.max(0, Math.min(mapW, cx));
    const gx = c.x + (px - mapW / 2) / oldCell;
    const gy = c.y + (cy - (MAP_TOP + 6 + Math.min(viewH, oldCell * world.h) / 2)) / oldCell;
    app.atlasZoom = next;
    c.x = gx - (px - mapW / 2) / newCell;
    c.y = gy - (cy - (MAP_TOP + 6 + Math.min(viewH, newCell * world.h) / 2)) / newCell;
  },

  onPinchEnd(app) {
    app.atlasPinch = null;
    app.atlasDrag = null;
  },
};

module.exports = AtlasScene;

  };

  /* js/render/scenery.js */
  __defs[25] = function (module, exports, __require) {
/**
 * 场景背景：不引入外部图片，用 Canvas 画出“像照片一样”的场所剪影。
 * 城是街市、村是田埂、扎营是帐篷、比武是彩棚、牢房是铁栏。
 * 所有函数只画背景，UI 仍由各场景盖在上面。
 */

function seeded(seed, n) {
  const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function city(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1a120c');
  sky.addColorStop(0.42, '#3b2415');
  sky.addColorStop(0.72, '#120d09');
  sky.addColorStop(1, '#080605');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 远处城楼与屋脊
  ctx.fillStyle = '#0b0806';
  const base = h * 0.43;
  for (let i = 0; i < 9; i += 1) {
    const bw = w / 7 + seeded(seed, i) * 30;
    const bx = -20 + i * (w / 8);
    const bh = 38 + seeded(seed, i + 9) * 120;
    ctx.fillRect(bx, base - bh, bw, bh);
    // 飞檐
    ctx.beginPath();
    ctx.moveTo(bx - 14, base - bh);
    ctx.lineTo(bx + bw / 2, base - bh - 26 - seeded(seed, i + 30) * 20);
    ctx.lineTo(bx + bw + 14, base - bh);
    ctx.closePath();
    ctx.fill();
  }

  // 街面与两侧铺面
  ctx.fillStyle = '#1b110a';
  ctx.fillRect(0, h * 0.52, w, h * 0.48);
  ctx.fillStyle = '#2a1a10';
  for (let i = 0; i < 8; i += 1) {
    const bx = i * (w / 7) - 20;
    const by = h * 0.54 + seeded(seed, i + 50) * 80;
    ctx.fillRect(bx, by, w / 8, h * 0.24);
    // 铺面招牌
    ctx.fillStyle = 'rgba(210,140,50,0.18)';
    ctx.fillRect(bx + 10, by + 14, 34, 8);
    ctx.fillStyle = '#2a1a10';
  }

  // 灯笼
  for (let i = 0; i < 6; i += 1) {
    const lx = 40 + i * (w / 5.4);
    const ly = h * 0.55 + Math.sin(i) * 16;
    const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 72);
    g.addColorStop(0, 'rgba(255,150,60,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 72, ly - 72, 144, 144);
    ctx.fillStyle = '#c85a24';
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 街上的人影
  ctx.fillStyle = 'rgba(8,6,5,0.88)';
  for (let i = 0; i < 18; i += 1) {
    const px = seeded(seed, i + 80) * w;
    const py = h * 0.68 + seeded(seed, i + 100) * h * 0.2;
    const s = 10 + seeded(seed, i + 120) * 13;
    ctx.fillRect(px, py, s * 0.55, s * 1.7);
    ctx.beginPath();
    ctx.arc(px + s * 0.28, py - 3, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  // 街市下半段：灯笼、摊位与人影，让城页底部不是一块死黑
  const street = ctx.createLinearGradient(0, h * 0.66, 0, h);
  street.addColorStop(0, 'rgba(112,62,30,0.18)');
  street.addColorStop(1, 'rgba(24,14,9,0.46)');
  ctx.fillStyle = street;
  ctx.fillRect(0, h * 0.66, w, h * 0.34);

  for (let i = 0; i < 4; i += 1) {
    const lx = 46 + seeded(seed, i + 180) * (w - 92);
    const ly = h * 0.72 + i * h * 0.045;
    const g2 = ctx.createRadialGradient(lx, ly, 2, lx, ly, 54);
    g2.addColorStop(0, 'rgba(255,176,84,0.28)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(lx - 54, ly - 54, 108, 108);
    ctx.fillStyle = '#c76125';
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(6,4,3,0.9)';
  for (let i = 0; i < 14; i += 1) {
    const px = seeded(seed, i + 240) * w;
    const py = h * 0.76 + seeded(seed, i + 260) * h * 0.16;
    const sc = 12 + seeded(seed, i + 280) * 18;
    ctx.fillRect(px, py, sc * 0.5, sc * 1.6);
    ctx.beginPath();
    ctx.arc(px + sc * 0.25, py - 3, sc * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // 地气
  const fog = ctx.createLinearGradient(0, h * 0.58, 0, h);
  fog.addColorStop(0, 'rgba(90,58,30,0)');
  fog.addColorStop(1, 'rgba(20,12,8,0.55)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, h * 0.58, w, h * 0.42);
}

function village(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#142019');
  sky.addColorStop(0.45, '#28321c');
  sky.addColorStop(0.75, '#100e08');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 田埂
  ctx.strokeStyle = 'rgba(150,120,60,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-40, h * 0.48 + i * 24);
    ctx.lineTo(w + 40, h * 0.52 + i * 26);
    ctx.stroke();
  }

  // 茅屋
  ctx.fillStyle = '#15100a';
  for (let i = 0; i < 5; i += 1) {
    const bx = 20 + i * (w / 5.4);
    const by = h * 0.48 + seeded(seed, i + 5) * 38;
    ctx.fillRect(bx, by, 92, 78);
    ctx.beginPath();
    ctx.moveTo(bx - 16, by);
    ctx.lineTo(bx + 46, by - 48);
    ctx.lineTo(bx + 108, by);
    ctx.closePath();
    ctx.fill();
  }

  // 炊烟
  ctx.strokeStyle = 'rgba(180,170,150,0.14)';
  ctx.lineWidth = 7;
  for (let i = 0; i < 4; i += 1) {
    const sx = 60 + i * (w / 4.3);
    ctx.beginPath();
    for (let j = 0; j < 8; j += 1) {
      ctx.lineTo(sx + Math.sin(j * 0.9 + i) * 12, h * 0.42 - j * 22);
    }
    ctx.stroke();
  }

  // 篱笆与人
  ctx.fillStyle = 'rgba(8,6,4,0.85)';
  for (let i = 0; i < 8; i += 1) {
    const px = seeded(seed, i + 40) * w;
    const py = h * 0.62 + seeded(seed, i + 50) * h * 0.12;
    ctx.fillRect(px, py, 7, 22);
    ctx.beginPath();
    ctx.arc(px + 3, py - 3, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,14,8,0.55)';
  ctx.fillRect(0, h * 0.75, w, h * 0.25);
}

function camp(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b0907');
  sky.addColorStop(0.5, '#171008');
  sky.addColorStop(1, '#080504');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 层层帐篷
  for (let layer = 0; layer < 3; layer += 1) {
    const baseY = h * (0.44 + layer * 0.12);
    const alpha = 0.18 + layer * 0.13;
    ctx.fillStyle = 'rgba(52,42,30,' + alpha + ')';
    for (let i = 0; i < 6 + layer; i += 1) {
      const tx = -30 + i * (w / (5 + layer)) + seeded(seed, i + layer * 9) * 16;
      const tw = 90 + seeded(seed, i + layer * 5) * 30;
      const th = 60 + seeded(seed, i + layer * 7) * 30;
      ctx.beginPath();
      ctx.moveTo(tx, baseY);
      ctx.lineTo(tx + tw / 2, baseY - th);
      ctx.lineTo(tx + tw, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 中军大帐与旗
  ctx.fillStyle = 'rgba(30,22,14,0.95)';
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.64);
  ctx.lineTo(w * 0.5, h * 0.38);
  ctx.lineTo(w * 0.66, h * 0.64);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,192,96,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(w * 0.5 - 3, h * 0.26, 6, h * 0.4);
  ctx.fillStyle = 'rgba(190,70,45,0.5)';
  ctx.fillRect(w * 0.5 + 3, h * 0.27, 34, 18);

  // 营火
  for (let i = 0; i < 4; i += 1) {
    const fx = w * (0.12 + i * 0.24) + seeded(seed, i + 30) * 20;
    const fy = h * 0.73 + seeded(seed, i + 40) * 30;
    const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, 60);
    g.addColorStop(0, 'rgba(255,150,60,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - 60, fy - 60, 120, 120);
    ctx.fillStyle = '#e07824';
    ctx.beginPath();
    ctx.moveTo(fx - 8, fy + 6);
    ctx.lineTo(fx, fy - 20);
    ctx.lineTo(fx + 8, fy + 6);
    ctx.closePath();
    ctx.fill();
  }

  // 枪林
  ctx.strokeStyle = 'rgba(90,75,52,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 25; i += 1) {
    const px = seeded(seed, i + 80) * w;
    const py = h * 0.55 + seeded(seed, i + 90) * h * 0.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 8, py - 54 - seeded(seed, i + 100) * 30);
    ctx.stroke();
  }
}

function tourney(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1c120c');
  sky.addColorStop(0.55, '#3c2415');
  sky.addColorStop(1, '#0d0805');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 彩棚与看台
  ctx.fillStyle = '#251810';
  ctx.fillRect(0, h * 0.44, w, h * 0.18);
  for (let i = 0; i < 9; i += 1) {
    ctx.fillStyle = i % 2 ? 'rgba(150,55,35,0.28)' : 'rgba(190,150,60,0.22)';
    ctx.beginPath();
    ctx.moveTo(i * (w / 8), h * 0.44);
    ctx.lineTo(i * (w / 8) + w / 20, h * 0.38);
    ctx.lineTo(i * (w / 8) + w / 10, h * 0.44);
    ctx.closePath();
    ctx.fill();
  }

  // 台上的人影
  ctx.fillStyle = 'rgba(10,7,5,0.85)';
  for (let i = 0; i < 16; i += 1) {
    const px = 16 + i * (w / 16);
    const py = h * 0.47 + seeded(seed, i + 20) * 14;
    ctx.fillRect(px, py, 8, 18);
    ctx.beginPath();
    ctx.arc(px + 4, py - 3, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 场中两个持械的对手
  ctx.fillStyle = '#0a0705';
  const cy = h * 0.68;
  [[w * 0.40, -1], [w * 0.60, 1]].forEach(function (f, i) {
    const x = f[0];
    const dir = f[1];
    ctx.fillRect(x - 4, cy - 50, 8, 50);
    ctx.beginPath();
    ctx.arc(x, cy - 58, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a0705';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, cy - 38);
    ctx.lineTo(x + dir * 34, cy - 55);
    ctx.stroke();
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(x + dir * 30, cy - 66, 3, 40);
  });

  // 扬尘
  const g = ctx.createRadialGradient(w / 2, cy + 30, 20, w / 2, cy + 30, w * 0.6);
  g.addColorStop(0, 'rgba(180,130,70,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
}

function prison(ctx, w, h) {
  ctx.fillStyle = '#0d0a07';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.35, w * 0.8);
  g.addColorStop(0, 'rgba(100,72,30,0.20)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8,6,4,0.82)';
  for (let i = 0; i < 9; i += 1) {
    ctx.fillRect(24 + i * 58, 0, 11, h * 0.78);
  }
  ctx.fillStyle = 'rgba(160,120,60,0.16)';
  for (let i = 0; i < 9; i += 1) {
    ctx.fillRect(35 + i * 58, 0, 2, h * 0.78);
  }
  ctx.fillStyle = 'rgba(10,7,5,0.65)';
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
}

function hall(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#160f0b');
  sky.addColorStop(0.5, '#261910');
  sky.addColorStop(1, '#0c0806');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 立柱与横梁
  ctx.fillStyle = 'rgba(14,10,7,0.9)';
  for (let i = 0; i < 3; i += 1) {
    ctx.fillRect(40 + i * (w - 120), 0, 34, h);
  }
  ctx.fillRect(0, 0, w, 40);
  // 两盏宫灯
  for (let i = 0; i < 2; i += 1) {
    const lx = w * (0.28 + i * 0.44);
    const ly = h * 0.18;
    const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, 100);
    g.addColorStop(0, 'rgba(255,170,70,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 100, ly - 100, 200, 200);
    ctx.fillStyle = '#b55226';
    ctx.beginPath();
    ctx.arc(lx, ly, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  // 屏风
  ctx.fillStyle = 'rgba(40,28,18,0.5)';
  ctx.fillRect(w * 0.24, h * 0.3, w * 0.52, h * 0.24);
  ctx.strokeStyle = 'rgba(200,160,90,0.18)';
  ctx.strokeRect(w * 0.24, h * 0.3, w * 0.52, h * 0.24);
}

function battle(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#160d09');
  sky.addColorStop(0.4, '#3a1d10');
  sky.addColorStop(1, '#080504');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(20,14,9,0.7)';
  for (let i = 0; i < 6; i += 1) {
    const sx = seeded(seed, i) * w;
    ctx.beginPath();
    ctx.arc(sx, h * 0.38 + i * 10, 60 + i * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(80,60,40,0.32)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i += 1) {
    const px = seeded(seed, i + 20) * w;
    const py = h * 0.55 + seeded(seed, i + 30) * h * 0.3;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 10, py - 50);
    ctx.stroke();
  }
}

function drawBackdrop(ctx, kind, w, h, seed) {
  const s = seed || 7;
  if (kind === 'village') village(ctx, w, h, s);
  else if (kind === 'camp') camp(ctx, w, h, s);
  else if (kind === 'tourney') tourney(ctx, w, h, s);
  else if (kind === 'prison') prison(ctx, w, h);
  else if (kind === 'hall') hall(ctx, w, h);
  else if (kind === 'battle') battle(ctx, w, h, s);
  else city(ctx, w, h, s);
}

module.exports = { drawBackdrop };

  };

  /* js/core/tourney.js */
  __defs[26] = function (module, exports, __require) {
/**
 * 比武大会：押一注报名费，跟一位好手在彩棚底下比三招血。
 *
 * 玩法是"猜手"：每合一招，双方各出一手——
 *   左挡 / 右挡 / 左攻 / 右攻。
 * 结算：
 *   · 都攻 → 两败俱伤，各掉一滴血
 *   · 都挡 → 各自绕圈试探，这合白打
 *   · 一攻一挡，方向相同（挡住）→ 攻击方掉血，防守方不掉，还白赚一刀
 *   · 一攻一挡，方向不同（挡空）→ 防守方掉血
 * 三滴血，先见底的人输。报名 40 金，赢的人拿 200。
 *
 * 不杀人不损兵，纯个人武艺（骑砍竞技场的味道）。
 */

const { LORDS, FACTIONS } = __require(5);
const heroes = __require(14);

const HP = 3;
const FEE = 40;
const PRIZE = 200;

const MOVES = {
  blockL: { id: 'blockL', name: '左挡', dir: 'L', kind: 'block' },
  blockR: { id: 'blockR', name: '右挡', dir: 'R', kind: 'block' },
  attackL: { id: 'attackL', name: '左攻', dir: 'L', kind: 'attack' },
  attackR: { id: 'attackR', name: '右攻', dir: 'R', kind: 'attack' },
};
const MOVE_IDS = ['blockL', 'blockR', 'attackL', 'attackR'];

function fee() {
  return FEE;
}

function prize() {
  return PRIZE;
}

/** 挑一个本地的对手：从天下名将里抽一位，身板随声望涨一点 */
function pickFoe(state) {
  const rng = state.rng;
  const list = LORDS.filter(function (l) { return l && l.id && l.name; });
  const def = list[rng.int(0, list.length - 1)];
  const rep = Math.min(20, Math.floor((state.player.renown || 0) / 60));
  return {
    name: def.name,
    faction: def.faction,
    lordId: def.id,
    // 读招的本事：0.12 ~ 0.5，随你的声望往上加，别让人一开场就摸透
    skill: Math.max(0.12, Math.min(0.5, 0.16 + rep * 0.02)),
    tag: (FACTIONS[def.faction] || {}).full || '外地来的好手',
  };
}

function enter(state, site) {
  const cost = FEE;
  if (state.player.gold < cost) {
    return { ok: false, msg: '报名要 ' + cost + ' 金钱，你身上不够' };
  }
  state.player.gold -= cost;
  state.tourney = {
    siteId: site ? site.id : null,
    siteName: site ? site.name : '此地',
    hp: HP,
    foeHp: HP,
    foe: pickFoe(state),
    moves: [],
    log: [],
    done: false,
    champion: false,
    draw: false,
    fee: cost,
    pot: PRIZE,
    round: 0,
  };
  return { ok: true, msg: '交了 ' + cost + ' 金钱报名费，签了生死状（其实不杀人）。' };
}

/** 对手出招：多数时候乱来，偶尔读你上一手的习惯 */
function aiMove(state) {
  const t = state.tourney;
  if (!t) return 'attackL';
  const rng = state.rng;
  const last = t.moves.length ? t.moves[t.moves.length - 1] : null;
  if (last && rng.next() < (t.foe.skill || 0.2)) {
    if (last.pMove === 'attackL') return 'blockL';
    if (last.pMove === 'attackR') return 'blockR';
    if (last.pMove === 'blockL') return 'attackR';
    if (last.pMove === 'blockR') return 'attackL';
  }
  return MOVE_IDS[rng.int(0, MOVE_IDS.length - 1)];
}

function dirName(d) {
  return d === 'L' ? '左' : '右';
}

/**
 * 纯结算：给定双方这一合的招，算出各掉几滴血。
 * 规则只在这里写一遍，play 和测试都走它。
 */
function settle(pMoveId, fMoveId) {
  const pm = MOVES[pMoveId];
  const fm = MOVES[fMoveId];
  if (!pm || !fm) return null;
  let dmgPlayer = 0;
  let dmgFoe = 0;
  let line = '';

  if (pm.kind === 'attack' && fm.kind === 'attack') {
    dmgPlayer = 1;
    dmgFoe = 1;
    line = '两边同时抢攻，家伙都落了实，各挨一下。';
  } else if (pm.kind === 'block' && fm.kind === 'block') {
    line = '两边都在收着，绕着彩棚走了半圈，这一合谁也没摸着谁。';
  } else if (pm.kind === 'attack' && fm.kind === 'block') {
    if (pm.dir === fm.dir) {
      // 挡对了：进攻方白挨一刀，防守方不掉血
      dmgPlayer = 1;
      line = '你从' + dirName(pm.dir) + '边抢攻，对面正好在' + dirName(fm.dir) + '边架上盾，你虎口被震得发麻。';
    } else {
      // 挡空了：防守方掉血
      dmgFoe = 1;
      line = '你从' + dirName(pm.dir) + '边虚晃一招，人却从' + dirName(pm.dir === 'L' ? 'R' : 'L') + '边切进去，一刀劈在他护肩上。';
    }
  } else if (pm.dir === fm.dir) {
    // 你挡住他的攻：反手赚他一下
    dmgFoe = 1;
    line = '他攻你' + dirName(fm.dir) + '，你' + dirName(pm.dir) + '手盾迎上去，磕开刀锋还推了他一把。';
  } else {
    dmgPlayer = 1;
    line = '他攻你' + dirName(fm.dir) + '边，你挡在' + dirName(pm.dir) + '边——护不住，肋下吃了一记。';
  }

  return { dmgPlayer: dmgPlayer, dmgFoe: dmgFoe, line: line };
}

/**
 * 出一招，跟对手的招一起结算。
 * 返回 { ok, pMove, fMove, hp, foeHp, done, champion, draw, lines }
 */
function play(state, moveId) {
  const t = state.tourney;
  if (!t) return { ok: false, msg: '大会已经散了' };
  if (t.done) return { ok: false, msg: '这一场已经完了' };
  const pm = MOVES[moveId];
  if (!pm) return { ok: false, msg: '没有这么一手' };

  const fm = MOVES[aiMove(state)];
  const settled = settle(pm.id, fm.id);
  const dmgPlayer = settled.dmgPlayer;
  const dmgFoe = settled.dmgFoe;
  t.round += 1;
  const lines = ['第 ' + t.round + ' 合：', settled.line];

  t.hp -= dmgPlayer;
  t.foeHp -= dmgFoe;
  t.moves.push({ pMove: moveId, fMove: fm.id, dmgPlayer: dmgPlayer, dmgFoe: dmgFoe });
  lines.push('（你 ' + Math.max(0, t.hp) + ' 血 · ' + t.foe.name + ' ' + Math.max(0, t.foeHp) + ' 血）');

  let result = 'continue';
  if (t.hp <= 0 && t.foeHp <= 0) {
    t.done = true;
    t.draw = true;
    result = 'draw';
    state.player.gold += t.fee;
    state.player.renown += 6;
    lines.push('两个人一起倒下去，砸翻了彩棚的灯。主事的人把 ' + t.fee + ' 金钱报名费退了你，赏格对半分不成，只好作罢。');
  } else if (t.foeHp <= 0) {
    t.done = true;
    t.champion = true;
    result = 'win';
    state.player.gold += t.pot;
    state.player.renown += 40;
    state.player.morale = Math.min(100, state.player.morale + 8);
    heroes.gainHeroExp(state, 10);
    lines.push('他撑着刀跪在地上，认了。彩棚下把铜钱往场里洒，赏钱 ' + t.pot + ' 金钱，声望 +40。');
    if (t.foe.lordId) {
      const lid = t.foe.lordId;
      state.lords.forEach(function (l) {
        if (l.id === lid && l.alive) {
          state.relations[l.faction] = Math.min(100, (state.relations[l.faction] || 0) + 6);
        }
      });
    }
  } else if (t.hp <= 0) {
    t.done = true;
    result = 'lose';
    state.player.renown += 2;
    state.player.morale = Math.max(0, state.player.morale - 4);
    lines.push('你膝盖一软，坐在了土里。' + t.foe.name + '收了手，抱拳说：再练两年。报名费没了，台下还是有人叫好——敢上场的人不多。声望 +2。');
  }

  t.log.push(lines.join('\n'));
  return {
    ok: true,
    pMove: pm.id,
    fMove: fm.id,
    hp: Math.max(0, t.hp),
    foeHp: Math.max(0, t.foeHp),
    done: t.done,
    champion: !!t.champion,
    draw: !!t.draw,
    result: result,
    lines: lines,
  };
}

function close(state) {
  state.tourney = null;
}

module.exports = {
  HP, FEE, PRIZE, MOVES, MOVE_IDS,
  fee, prize, pickFoe, enter, aiMove, settle, play, close,
};

  };

  /* js/scenes/town.js */
  __defs[24] = function (module, exports, __require) {
/**
 * 城池 / 村庄 / 匪巢界面
 * 布局：顶部城名 → 自己状态条（金/粮/兵/望/简/士气）→ 大按钮菜单 → 子页
 * 子页：招兵 / 市场（粮草·军械）/ 酒馆 / 领主府
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const pixel = __require(3);
const scenery = __require(25);
const stateLib = __require(7);
const economy = __require(11);
const trade = __require(13);
const heroes = __require(14);
const army = __require(9);
const tourney = __require(26);
const { siteById, regionDef } = __require(8);
const { TROOPS } = __require(10);

/** 每个据点一个稳定的背景种子，同类型城镇也能有不同街景 */
function siteSeed(id) {
  let h = 0;
  const s = String(id || 'site');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h + 7;
}
const { FACTIONS, EQUIPMENT } = __require(5);
const { GOODS, VILLAGE_FOOD } = __require(12);
const flows = __require(22);

const PAD = 16;

function money(v) { return v + '金钱'; }

function header(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const fac = site.ownerFaction ? FACTIONS[site.ownerFaction] : null;

  ctx.fillStyle = '#171310';
  ctx.fillRect(0, 0, w, 148);
  ctx.fillStyle = fac ? fac.color : '#6a655c';
  ctx.fillRect(0, 0, 7, 148);

  text(ctx, site.name, PAD, 22, { size: 42, color: '#f0c060' });
  const typeName = site.type === 'town' ? '城' : site.type === 'castle' ? '关隘' : site.type === 'village' ? '村' : '贼巢';
  text(ctx, typeName + ' · ' + (fac ? fac.full : '无主') + ' · ' + (regionDef(site.region) || {}).name, PAD + 4, 78, {
    size: 19, color: '#a2947a',
  });
  const ownCountry = app.state.player.country;
  const flagSpot = site.type === 'village' ? '村口' : '城头';
  const blurb = site.playerOwned
    ? (ownCountry && ownCountry.name
      ? '你的' + typeName + '。' + flagSpot + '换上了「' + ownCountry.name + '」字旗。'
      : '你的' + typeName + '。旗还空着一个字，等你来定。')
    : (site.blurb || '');
  const lines = wrap(ctx, blurb, w - PAD * 2 - 8, 17, 'bold');
  text(ctx, lines[0] || '', PAD + 4, 106, { size: 17, color: '#c9bda2' });
}

/** 自己的状态条：这是城池界面最该看到的东西 */
function statusBar(app, y) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const p = app.state.player;
  const count = army.troopCount(p.troops);
  const cap = stateLib.capacity(app.state);
  const need = stateLib.nextFoodNeed(app.state);
  const foodShort = p.food < need;

  ctx.fillStyle = '#1d1711';
  ctx.fillRect(0, y, w, 96);

  const cells = [
    { k: '金钱', v: p.gold, c: '#f0c060' },
    { k: '粮草', v: p.food, c: foodShort ? '#e06a52' : p.food < need * 3 ? '#d06a4a' : '#c8b478' },
    { k: '兵力', v: count + ' / ' + cap, c: count >= cap ? '#d06a4a' : '#8fb0d8' },
    { k: '声望', v: p.renown, c: '#c98f6a' },
    { k: '天机简', v: p.shi, c: '#b98fd8' },
    { k: '士气', v: p.morale, c: p.morale < 40 ? '#d06a4a' : '#8fbf7a' },
  ];
  const cw = (w - PAD * 2) / cells.length;
  cells.forEach(function (it, i) {
    const x = PAD + i * cw;
    text(ctx, it.k, x, y + 10, { size: 13, color: '#8a8070' });
    text(ctx, String(it.v), x, y + 38, { size: 17, color: it.c });
  });

  // 士气细条
  bar(ctx, PAD, y + 68, w - PAD * 2, 8, p.morale / 100, p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);
  if (foodShort) {
    text(ctx, '粮草告急 · 撑不过两日 · 下次发粮需 ' + need + '，速补！', PAD, y + 80, {
      size: 15, color: '#e06a52',
    });
  }

  return y + 106;
}

function backButton(app, y) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  app.ui.button(ctx, PAD, y, 150, 64, '← 返回', {
    id: 'back', size: 22, onTap: function () { app.townView.view = 'menu'; },
  });
}

function menuButton(app, y, label, sub, onTap, opts) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = 104;
  const o = opts || {};
  app.ui.button(ctx, PAD, y, w - PAD * 2, h, '', {
    id: opts.id || label, disabled: !!o.disabled,
    fill: o.fill || '#33271b',
    onTap: onTap,
  });
  text(ctx, label, PAD + 26, y + 24, { size: 30, color: o.disabled ? '#6a6355' : '#efe3c6' });
  if (sub) text(ctx, sub, PAD + 26, y + 64, { size: 18, color: o.disabled ? '#5c5648' : '#a2947a' });
  if (o.right) text(ctx, o.right, w - PAD - 24, y + 36, { size: 24, align: 'right', color: o.disabled ? '#5c5648' : '#f0c060' });
  return y + h + 16;
}

/* ---------------------------------------------------------------- 菜单 */

/** 菜单项：列成一张表，整页可以上下拖，选项再多也放得下 */
function menuItems(app, site) {
  const p = app.state.player;
  const resting = !!p.resting;
  const isVillage = site.type === 'village';
  const list = [];
  const toggleRest = function () {
    if (resting) {
      stateLib.stopRest(app.state);
      app.restView = null;
      app.showToast('收拾行装，准备上路。', 2);
      app.pop();
    } else {
      const r = stateLib.startRest(app.state, site);
      app.showToast(r.msg, 2.4);
      if (r.ok) {
        // 跟骑砍一样：选"修养"就直接出门看大地图，时辰照走，点一下再回城
        app.restView = site.id;
        app.pop();
      }
    }
  };

  // 打下来的城与村都在这里点将；第一座城之后才需要，但入口从第一块地就开着
  if (site.playerOwned) {
    const owned = app.state.world.sites.filter(function (s) { return s.playerOwned && s.type !== 'camp'; });
    const assigned = owned.filter(function (s) { return !!stateLib.siteLord(app.state, s); }).length;
    const selfOwned = owned.filter(function (s) { return stateLib.siteSelfFief(app.state, s); }).length;
    list.push({
      id: 'm_govern', label: '处理政务',
      sub: '封地点将、与列国宣战议和，都在这张案上',
      fill: '#33291d', right: selfOwned + ' 处直辖 · ' + assigned + ' 处已封',
      onTap: function () { app.push('govern', { siteId: site.id }); },
    });
  }

  if (isVillage) {
    list.push({
      id: 'm_recruit', label: '招兵', sub: '村里的壮丁 · 只有最低一档，比城里便宜', right: '→',
      onTap: function () { app.townView.view = 'recruit'; },
    });
    list.push({
      id: 'm_village', label: '村市 · 找村长', sub: '牛、羊、鸡、谷，村里卖得比城里便宜',
      right: '粮 ' + Math.round(40 * (site.priceIndex || 1) * 0.85) + '金钱',
      onTap: function () { app.townView.view = 'village'; },
    });
    list.push({
      id: 'm_raid', label: '屠村', sub: '抢钱抢粮，村子会记很久（关系 -5）', fill: '#3a2018', right: '→',
      onTap: function () {
        const r = stateLib.raidVillage(app.state, site);
        app.showToast(r.msg, 2.6);
        if (r.ok) app.townView.view = 'menu';
      },
    });
    list.push({
      id: 'm_rest', label: resting ? '结束休整 · 上路' : '在村里歇下',
      sub: '粮耗减半；村里藏不住人，追兵会摸进来', fill: '#26372a',
      right: resting ? '休整中 · 粮耗减半' : '→', onTap: toggleRest,
    });
    const hermit = stateLib.hiddenLordsAt(app.state, site.id).filter(function (l) {
      return stateLib.hiddenLordVisible(app.state, l);
    })[0];
    if (hermit) {
      list.push({
        id: 'm_hermit', label: '村中隐者 · ' + hermit.name, sub: '前朝的旗倒了，人还活着。也许能请得动',
        fill: '#2c2a40', right: '见一面', onTap: function () { app.townView.view = 'hermit'; },
      });
    }
  } else {
    // 无主之城：门开着，但也可以直接翻脸围城。围下来就是你的第一块城砖。
    if (!site.ownerFaction && !site.playerOwned) {
      list.push({
        id: 'm_besiege', label: '围攻 · 无主之城',
        sub: '围足时辰再决战；打下来，这座城就挂你的旗',
        fill: '#4a241c', right: '→',
        onTap: function () {
          const r = stateLib.beginPlayerSiege(app.state, site);
          if (!r.ok) { app.showToast(r.msg, 2.4); return; }
          app.showToast('城下扎营：需围 ' + r.days + ' 天，回大地图等时辰，围成后才能决战。', 3);
          app.pop();
        },
      });
    }
    list.push({
      id: 'm_recruit', label: '招兵', sub: '花钱买人，价钱随城而变', right: '→',
      onTap: function () { app.townView.view = 'recruit'; },
    });
    list.push({
      id: 'm_market', label: '市场', sub: '粮草 · 货物 · 军械',
      right: '粮 ' + economy.foodPrice(site) + '金钱/单位',
      onTap: function () { app.townView.view = 'market'; app.townView.tab = 'food'; },
    });
    list.push({
      id: 'm_tavern', label: '酒馆', sub: '接活 · 打听消息 · 招募英雄', right: '→',
      onTap: function () { app.townView.view = 'tavern'; },
    });
    list.push({
      id: 'm_hall', label: '领主府', sub: '效忠 · 宣战 · 情报',
      right: site.ownerFaction ? FACTIONS[site.ownerFaction].full : '无主',
      onTap: function () { app.townView.view = 'hall'; },
    });
    list.push({
      id: 'm_tourney', label: '比武大会', sub: '四招赌手 · 三滴血，赢钱赢名声，不杀人', fill: '#3a2c1e',
      right: (app.state.tourney && !app.state.tourney.done) ? '进行中' : '报名 ' + tourney.fee(app.state) + '金钱',
      onTap: function () { app.push('tourney', { siteId: site.id }); },
    });
    const obj = stateLib.campaignObjective(app.state, site);
    if (obj) {
      const count = army.troopCount(p.troops);
      const ready = !obj.needTroops || count >= obj.needTroops;
      list.push({
        id: 'm_campaign', label: '发起进攻 · ' + obj.name,
        sub: ready ? '点下去就开打，输了可以退回来再来' : '至少要有 ' + obj.needTroops + ' 人才打得动（现 ' + count + '）',
        fill: '#4a241c', right: ready ? '→' : '兵不足', disabled: !ready,
        onTap: function () {
          const b = stateLib.startCampaignBattle(app.state, obj.id);
          if (!b) { app.showToast('现在还打不了。'); return; }
          app.state.flags.campaignCool = stateLib.gameHours(app.state) + 24;
          app.push('battle', { mode: 'campaign', campaignId: b.context.campaignId });
        },
      });
    }
    list.push({
      id: 'm_rest', label: resting ? '结束休整 · 上路' : '进城休整',
      sub: resting ? '再点一下就收拾行装，回大地图' : '选了就出城看天下：时辰照走，粮耗减半，没人追你',
      fill: '#26372a',
      right: resting ? '休整中 · 粮耗减半' : '→', onTap: toggleRest,
    });
  }
  return list;
}

function renderMenu(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  const p = app.state.player;
  let y = 280;

  if (site.type === 'camp') {
    if (site.cleared) {
      text(ctx, '到处是火。', PAD, y - 44, { size: 30, color: '#e08a50' });
      text(ctx, '寨门烧塌了，营帐只剩黑桩，地上散着断刀和空粮袋。', PAD, y + 12, {
        size: 19, color: '#c9bda2',
      });
      text(ctx, '财物已经被劫掠一空，连一把能用的弓都没留下。', PAD, y + 54, {
        size: 21, color: '#f0c060',
      });
      text(ctx, '过几天再来看看。', PAD, y + 98, { size: 24, color: '#8fbf7a' });
      if (site.respawnDay) {
        text(ctx, '约第 ' + site.respawnDay + ' 天，也许会再聚起一伙人。', PAD, y + 140, {
          size: 16, color: '#8a8070',
        });
      }
      app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '离开这里', {
        id: 'camp_leave_looted', size: 26, fill: '#241c14', onTap: function () {
          app.state.player.atSiteId = null;
          app.pop();
        },
      });
      return;
    }
    text(ctx, '这里是一处贼巢。攻破它，你的名字会传出去。', PAD, y - 40, { size: 19, color: '#c9bda2' });
    app.ui.button(ctx, PAD, y, w - PAD * 2, 96, '进攻贼巢', {
      id: 'attack', size: 30, fill: '#4a241c', onTap: function () {
        stateLib.startSiege(app.state, site);
        app.push('battle', { mode: 'siege' });
      },
    });
    app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '离开这里', {
      id: 'camp_leave', size: 26, fill: '#241c14', onTap: function () {
        app.state.player.atSiteId = null;
        app.pop();
      },
    });
    return;
  }

  const items = menuItems(app, site);
  const rowH = 104;
  const gap = 14;
  const contentH = items.length * (rowH + gap);
  // 下面留出"离城"的固定按钮 + 回城提示，菜单只在这条线以上滚
  const footTop = H - 170;
  const viewH = Math.max(120, footTop - y - 8);
  const maxScroll = Math.max(0, contentH - viewH);
  if (app.townView.scroll === undefined) app.townView.scroll = 0;
  app.townView.scroll = Math.max(0, Math.min(maxScroll, app.townView.scroll));
  app.townView.maxScroll = maxScroll;
  app.townView.viewH = viewH;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y - 4, w, viewH + 8);
  ctx.clip();
  items.forEach(function (it, i) {
    const ry = y + i * (rowH + gap) - app.townView.scroll;
    // 只画完整的一行：半截露在"离城"上方很难看
    if (ry < y || ry + rowH > y + viewH) return;
    app.ui.button(ctx, PAD, ry, w - PAD * 2, rowH, '', {
      id: it.id || it.label, disabled: !!it.disabled,
      fill: it.fill || '#33271b',
      onTap: it.onTap,
    });
    text(ctx, it.label, PAD + 26, ry + 24, { size: 30, color: it.disabled ? '#6a6355' : '#efe3c6' });
    if (it.sub) {
      // 一行放不下就截断，别让说明文字压到底下的"离城"
      const subMax = w - PAD * 2 - 60;
      const subLines = wrap(ctx, it.sub, subMax, 18);
      let sub = subLines[0] || '';
      if (subLines.length > 1) sub = sub.replace(/[，、。·]$/, '') + '…';
      text(ctx, sub, PAD + 26, ry + 64, { size: 18, color: it.disabled ? '#5c5648' : '#a2947a' });
    }
    if (it.right) text(ctx, it.right, w - PAD - 24, ry + 36, {
      size: 24, align: 'right', color: it.disabled ? '#5c5648' : '#f0c060',
    });
  });
  ctx.restore();

  // 滚动条：看得出还有几项在下面
  if (maxScroll > 0) {
    const trackY = y;
    const trackH = viewH;
    ctx.fillStyle = 'rgba(80,66,46,0.35)';
    ctx.fillRect(w - 8, trackY, 4, trackH);
    const thumbH = Math.max(36, trackH * (viewH / contentH));
    const thumbY = trackY + (trackH - thumbH) * (app.townView.scroll / maxScroll);
    ctx.fillStyle = '#8a7448';
    ctx.fillRect(w - 8, thumbY, 4, thumbH);
  }

  // 离城：固定在最下面，随时能出门
  app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '离城', {
    id: 'leave', size: 28, fill: '#241c14', onTap: function () {
      if (app.state.player.resting) stateLib.stopRest(app.state);
      app.state.player.atSiteId = null;
      app.pop();
    },
  });
  text(ctx, maxScroll > 0
    ? '上下拖动看更多 · 还有 ' + (maxScroll > 0 ? Math.max(1, Math.ceil((maxScroll - app.townView.scroll) / (rowH + gap))) : 0) + ' 项在下头'
    : (p.atSiteId ? '离城后回到大地图，再点这座城还能进来' : ''), w / 2, H - 138, {
    size: 14, align: 'center', color: maxScroll > 0 ? '#c0a46a' : '#6a6050',
  });
}

/* ---------------------------------------------------------------- 招兵 */

function renderRecruit(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;
  const p = st.player;

  text(ctx, '可招募', PAD, 300, { size: 26, color: '#f0c060' });
  text(ctx, '队伍 ' + army.troopCount(p.troops) + ' / ' + stateLib.capacity(st), w - PAD, 306, {
    size: 18, align: 'right', color: '#a2947a',
  });

  let list = site.recruitList || [];
  // 村庄只出最低一档的壮丁；池子空了就是空了，村里的壮丁就这些
  if (site.type === 'village') {
    list = ['militia'];
  }
  let y = 340;

  if (!list.length) {
    text(ctx, '这里不卖人。', PAD, y + 20, { size: 22, color: '#a2947a' });
  }

  list.forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    const stock = site.recruits[id] || 0;
    const price = economy.recruitPrice(site, id);
    const locked = t.renownReq && p.renown < t.renownReq;

    panel(ctx, PAD, y, w - PAD * 2, 104, { fill: '#241c14' });
    text(ctx, t.name, PAD + 18, y + 14, { size: 26, color: locked ? '#7a7160' : '#efe3c6' });
    text(ctx, '攻 ' + t.atk + ' / 防 ' + t.def + ' / 粮 ' + t.food, PAD + 150, y + 20, { size: 16, color: '#a2947a' });
    text(ctx, locked ? '需声望 ' + t.renownReq : '余 ' + stock + ' 人', PAD + 18, y + 58, {
      size: 17, color: locked ? '#b4463c' : stock > 0 ? '#8fbf7a' : '#7a7160',
    });
    text(ctx, price + '金钱/人', PAD + 150, y + 58, { size: 18, color: '#f0c060' });

    if (!locked && stock > 0) {
      app.ui.button(ctx, w - PAD - 190, y + 22, 86, 58, '招 1', {
        id: 'r1_' + id, size: 22, onTap: function () {
          const r = economy.recruit(st, site, id, 1);
          app.showToast(r.msg, 2.2);
        },
      });
      app.ui.button(ctx, w - PAD - 96, y + 22, 86, 58, '招 5', {
        id: 'r5_' + id, size: 22, disabled: stock < 5, onTap: function () {
          const r = economy.recruit(st, site, id, 5);
          app.showToast(r.msg, 2.2);
        },
      });
    }
    y += 116;
  });

  backButton(app, y + 4);
}

/* ---------------------------------------------------------------- 市场 */

/* ---------------------------------------------------------------- 货物 */

/** 货物总览：十种货，两列五行，点开看单品 */
function renderGoods(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const p = app.state.player;
  const carried = trade.goodsCount(p);

  text(ctx, '驮队 ' + carried + ' / ' + trade.GOODS_CAP + ' 件', PAD, 388, { size: 21, color: '#efe3c6' });
  text(ctx, '这里只是货，不顶口粮：低价买进、别城卖出，赚的是转手的差价。', PAD, 362, {
    size: 15, color: '#c9a05a',
  });

  const top = 428;
  const cw = (w - PAD * 2 - 10) / 2;
  const rh = 96;

  GOODS.forEach(function (gd, i) {
    const cx = PAD + (i % 2) * (cw + 10);
    const cy = top + Math.floor(i / 2) * rh;
    const buy = trade.buyPrice(site, gd.id);
    const sell = trade.sellPrice(site, gd.id);
    const have = (p.goods || {})[gd.id] || 0;

    panel(ctx, cx, cy, cw, rh - 8, { fill: '#241c14' });
    text(ctx, gd.name, cx + 14, cy + 8, { size: 20, color: '#efe3c6' });
    text(ctx, '买 ' + buy + ' / 卖 ' + sell, cx + 14, cy + 36, { size: 16, color: '#f0c060' });
    text(ctx, '持有 ' + have, cx + 14, cy + 60, {
      size: 15, color: have > 0 ? '#8fbf7a' : '#6a6050',
    });
    text(ctx, '→', cx + cw - 22, cy + 30, { size: 22, color: '#8a8070' });

    app.ui.rect('good_' + gd.id, cx, cy, cw, rh - 8, function () {
      app.townView.goodId = gd.id;
      app.townView.estimate = null;
    });
  });

  backButton(app, h - 84);
}

/** 单品交易：买/卖几件，顺便估个价 */
function renderGoodOne(app, site, goodId) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;
  const p = st.player;
  const gd = trade.goodById(goodId);
  if (!gd) {
    app.townView.goodId = null;
    return;
  }
  const buy = trade.buyPrice(site, goodId);
  const sell = trade.sellPrice(site, goodId);
  const have = (p.goods || {})[goodId] || 0;

  text(ctx, gd.name, PAD, 358, { size: 30, color: '#f0c060' });
  text(ctx, '基准 ' + gd.base + '金钱 / ' + gd.unit, w - PAD, 364, { size: 16, align: 'right', color: '#8a8070' });
  wrap(ctx, gd.desc, w - PAD * 2, 16).slice(0, 2).forEach(function (ln, i) {
    text(ctx, ln, PAD, 400 + i * 24, { size: 16, color: '#a2947a' });
  });

  text(ctx, '本地买 ' + buy + '金钱', PAD, 460, { size: 22, color: '#f0c060' });
  text(ctx, '本地卖 ' + sell + '金钱', PAD + 220, 460, { size: 22, color: '#8fb0d8' });
  text(ctx, '持有 ' + have + ' · 驮队 ' + trade.goodsCount(p) + '/' + trade.GOODS_CAP, PAD, 498, {
    size: 18, color: '#efe3c6',
  });

  const bw = (w - PAD * 2 - 20) / 3;
  [1, 5, 10].forEach(function (n, i) {
    app.ui.button(ctx, PAD + i * (bw + 10), 540, bw, 68, '买 ' + n, {
      id: 'gb' + n, size: 22, onTap: function () {
        const r = trade.buyGoods(st, site, goodId, n);
        app.showToast(r.msg, 2.2);
      },
    });
    app.ui.button(ctx, PAD + i * (bw + 10), 618, bw, 68, '卖 ' + n, {
      id: 'gs' + n, size: 22, fill: '#241c14', disabled: have <= 0, onTap: function () {
        const r = trade.sellGoods(st, site, goodId, n);
        app.showToast(r.msg, 2.2);
      },
    });
  });

  app.ui.button(ctx, PAD, 700, w - PAD * 2, 68, '估价 · 哪里卖得贵', {
    id: 'g_est', size: 24, fill: '#3a2c1e', onTap: function () {
      app.townView.estimate = trade.estimate(st, site, goodId);
    },
  });

  // 估价结果
  const est = app.townView.estimate;
  if (est && est.ok) {
    let y = 786;
    if (!est.rows || !est.rows.length) {
      text(ctx, est.msg, PAD, y, { size: 17, color: '#a2947a' });
    } else {
      text(ctx, '本城 ' + est.here + '金钱 · 往这些城去：', PAD, y, { size: 17, color: '#a2947a' });
      y += 30;
      est.rows.forEach(function (row) {
        if (y > h - 150) return;
        text(ctx, row.site.name, PAD, y, { size: 19, color: '#efe3c6' });
        text(ctx, row.price + '金钱', PAD + 150, y, { size: 19, color: '#f0c060' });
        text(ctx, '每件多赚 ' + row.profit, PAD + 260, y, { size: 17, color: '#8fbf7a' });
        text(ctx, row.dist + ' 格', w - PAD, y, { size: 15, align: 'right', color: '#8a8070' });
        y += 34;
      });
    }
  }

  app.ui.button(ctx, PAD, h - 84, 150, 64, '← 货物', {
    id: 'g_back', size: 22, onTap: function () {
      app.townView.goodId = null;
      app.townView.estimate = null;
    },
  });
}

/* ---------------------------------------------------------------- 村市 */

/** 村长：牛、羊、鸡、谷，村里比城里便宜 */
function renderVillage(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;
  const p = st.player;

  text(ctx, '村市 · 村长', PAD, 296, { size: 26, color: '#f0c060' });
  text(ctx, '“牛不卖，除非你出得起。”', PAD, 332, { size: 17, color: '#a2947a' });
  const foodCap = army.foodCap(p.troops);
  const foodRoom = Math.max(0, foodCap - p.food);
  text(ctx, '粮草 ' + p.food + ' / 上限 ' + foodCap + ' · 还可购 ' + foodRoom,
    w - PAD, 336, { size: 16, align: 'right', color: p.food >= foodCap ? '#d06a4a' : '#8fbf7a' });

  let y = 380;
  VILLAGE_FOOD.forEach(function (f) {
    const price = Math.round(f.price * (site.priceIndex || 1) * 0.85);
    const stock = (site.foodStock || {})[f.id] || 0;
    panel(ctx, PAD, y, w - PAD * 2, 96, { fill: '#241c14' });
    text(ctx, f.name, PAD + 18, y + 10, { size: 24, color: stock > 0 ? '#efe3c6' : '#7a7160' });
    text(ctx, '+' + f.food + ' 口粮', PAD + 150, y + 16, { size: 18, color: '#a2947a' });
    const dl = wrap(ctx, f.desc, w - PAD * 2 - 460, 15)[0] || '';
    text(ctx, dl, PAD + 18, y + 50, { size: 15, color: '#8a8070' });
    text(ctx, stock > 0 ? '村里还有 ' + stock + ' 份' : '卖完了', PAD + 320, y + 54, {
      size: 16, color: stock > 0 ? '#8fbf7a' : '#d06a4a',
    });
    text(ctx, price + '金钱', w - PAD - 142, y + 44, { size: 22, align: 'right', color: '#f0c060' });
    app.ui.button(ctx, w - PAD - 130, y + 22, 112, 54, '买', {
      id: 'vf_' + f.id, size: 22, disabled: p.gold < price || stock <= 0, onTap: function () {
        const r = stateLib.buyVillageFood(st, site, f.id);
        app.showToast(r.msg, 2.2);
      },
    });
    y += 108;
  });

  backButton(app, h - 84);
}

function equipEffectText(tier) {
  if (!tier) return '无';
  const parts = [];
  if (tier.atkPct) parts.push('攻击 +' + Math.round(tier.atkPct * 100) + '%');
  if (tier.defPct) parts.push('防御 +' + Math.round(tier.defPct * 100) + '%');
  if (tier.speedPct) parts.push('行军 +' + Math.round(tier.speedPct * 100) + '%');
  return parts.length ? parts.join(' · ') : '无加成';
}

function renderMarket(app, site, tab) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;

  const tabs = [
    { id: 'food', label: '粮草' },
    { id: 'goods', label: '货物' },
    { id: 'arms', label: '军械' },
  ];
  const tw = (w - PAD * 2) / 3;
  tabs.forEach(function (t, i) {
    const active = tab === t.id;
    const x = PAD + i * tw;
    ctx.fillStyle = active ? '#3a2c1e' : '#241c14';
    ctx.fillRect(x, 292, tw - 4, 56);
    ctx.fillStyle = active ? '#d9a441' : '#4a3826';
    ctx.fillRect(x, 292, tw - 4, 3);
    text(ctx, t.label, x + tw / 2 - 2, 306, { size: 24, align: 'center', color: active ? '#f0c060' : '#a2947a' });
    app.ui.rect('tab_' + t.id, x, 292, tw - 4, 56, function () {
      app.townView.tab = t.id;
      app.townView.goodId = null;
    });
  });

  if (tab === 'goods') {
    if (app.townView.goodId) renderGoodOne(app, site, app.townView.goodId);
    else renderGoods(app, site);
    return;
  }

  if (tab === 'food') {
    const price = economy.foodPrice(site);
    const sell = economy.foodSellPrice(site);
    const foodCap = army.foodCap(st.player.troops);
    const foodRoom = Math.max(0, foodCap - st.player.food);
    text(ctx, '粮价 ' + price + '金钱 · 卖出 ' + sell + '金钱', PAD, 372, { size: 24, color: '#efe3c6' });
    text(ctx, '你的粮草：' + st.player.food + ' / 上限 ' + foodCap + ' · 还可购 ' + foodRoom + ' 单位',
      PAD, 410, { size: 19, color: st.player.food >= foodCap ? '#d06a4a' : st.player.food < 40 ? '#d06a4a' : '#8fbf7a' });
    text(ctx, '每两天吃掉 ' + Math.max(1, Math.round(army.foodPerDay(st.player.troops) * 2)) + ' 单位', PAD, 442, { size: 17, color: '#a2947a' });

    const amounts = [10, 50];
    amounts.forEach(function (n, i) {
      app.ui.button(ctx, PAD, 486 + i * 92, 220, 72, '买 ' + n + ' 粮', {
        id: 'buy' + n, size: 24, disabled: foodRoom < n, onTap: function () {
          const r = economy.buyFood(st, site, n);
          app.showToast(r.msg, 2.2);
        },
      });
      app.ui.button(ctx, PAD + 236, 486 + i * 92, 220, 72, '卖 ' + n + ' 粮', {
        id: 'sell' + n, size: 24, fill: '#241c14', onTap: function () {
          const r = economy.sellFood(st, site, n);
          app.showToast(r.msg, 2.2);
        },
      });
    });
    text(ctx, '满载上限 ' + foodCap + ' 单位 · 还可购 ' + foodRoom + '（兵力 ' + army.troopCount(st.player.troops) + '）。长途行军前多带一点。', PAD, 690, { size: 16, color: foodRoom <= 0 ? '#d06a4a' : '#8a8070' });
    backButton(app, 740);
    return;
  }

  // 军械
  const slots = ['blade', 'armor', 'horse'];
  let y = 372;
  slots.forEach(function (slot) {
    const eq = EQUIPMENT[slot];
    const cur = economy.equipmentTier(st, slot);
    const next = economy.nextEquipment(st, slot);
    const level = st.player.equip[slot] || 0;
    panel(ctx, PAD, y, w - PAD * 2, 104, { fill: '#241c14' });
    text(ctx, eq.name, PAD + 18, y + 12, { size: 20, color: '#a2947a' });
    text(ctx, cur.name, PAD + 96, y + 10, { size: 26, color: '#efe3c6' });
    text(ctx, '第 ' + (level + 1) + ' / ' + eq.tiers.length + ' 档 · ' +
      (next ? '下一档：' + next.name + ' · ' + next.price + '金钱' : '已是顶配'), PAD + 18, y + 56, {
      size: 17, color: next ? '#f0c060' : '#8a8070',
    });
    text(ctx, '本级 ' + equipEffectText(cur) + ' ／ 下阶 ' + (next ? equipEffectText(next) : '已顶配'),
      PAD + 18, y + 82, { size: 14, color: '#a2947a' });
    if (next) {
      app.ui.button(ctx, w - PAD - 150, y + 24, 132, 56, '换装', {
        id: 'up_' + slot, size: 22, disabled: st.player.gold < next.price, onTap: function () {
          const r = economy.upgradeEquipment(st, slot);
          app.showToast(r.msg, 2.2);
        },
      });
    }
    y += 116;
  });
  text(ctx, '装备加成作用于整支队伍，不只是一场。', PAD, y + 10, { size: 16, color: '#8a8070' });
  backButton(app, y + 52);
}

/* ---------------------------------------------------------------- 酒馆 */

/** 把任务目标标到大地图上，并让镜头直接落到那一格 */
function locateQuest(app, q) {
  const st = app.state;
  const pos = stateLib.questTargetPos(st, q);
  if (!pos) {
    app.showToast(q && q.failed ? (q.failReason || '目标已经被其他势力清剿') + '，任务已失败。'
      : '这个目标已经不在了。', 2.6);
    return;
  }
  app.mapQuestFocus = q.id;
  const top = app.top();
  if (top && top.name === 'town') app.pop();
  else if (!top || top.name !== 'map') app.replace('map');
  const mapEntry = app.top();
  if (mapEntry && mapEntry.scene && mapEntry.scene.focusOn) {
    mapEntry.scene.focusOn(app, pos.x, pos.y, pos.name);
  }
  app.showToast('已在大世界标出：' + pos.name, 2.6);
}

function renderTavern(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;

  text(ctx, '酒馆', PAD, 296, { size: 26, color: '#f0c060' });
  const mine = st.quests.filter(function (q) { return !q.done; });
  text(ctx, '手上 ' + mine.length + ' 件事', w - PAD, 302, { size: 18, align: 'right', color: '#a2947a' });

  let y = 340;
  if (!mine.length) {
    text(ctx, '柜台后的人抬头看了你一眼：“没活。过几天再来。”', PAD, y + 10, { size: 19, color: '#a2947a' });
    app.ui.button(ctx, PAD, y + 60, w - PAD * 2, 80, '打听一桩事', {
      id: 'ask', size: 26, onTap: function () {
        const q = stateLib.offerQuest(st, site);
        app.showToast(q ? '接下来的事：' + q.title : '今天没人找你办事。', 2.4);
      },
    });
  } else {
    mine.forEach(function (q) {
      panel(ctx, PAD, y, w - PAD * 2, 126, { fill: '#241c14' });
      text(ctx, q.title, PAD + 18, y + 12, { size: 24, color: '#efe3c6' });
      const lines = wrap(ctx, q.text, w - PAD * 2 - 190, 16, 'bold');
      text(ctx, lines[0] || '', PAD + 18, y + 48, { size: 16, color: '#a2947a' });
      text(ctx, '赏 ' + q.reward.gold + '金钱 · ' + q.reward.renown + ' 声望', PAD + 18, y + 84, {
        size: 17, color: '#f0c060',
      });
      if (q.type === 'grain') {
        app.ui.button(ctx, w - PAD - 150, y + 8, 132, 44, '查看位置', {
          id: 'loc_' + q.id, size: 19, fill: '#2c2418', onTap: function () { locateQuest(app, q); },
        });
        app.ui.button(ctx, w - PAD - 150, y + 70, 132, 44, '交粮', {
          id: 'dg_' + q.id, size: 20, onTap: function () {
            const r = stateLib.deliverGrain(st, q);
            app.showToast(r.msg, 2.2);
          },
        });
      } else {
        app.ui.button(ctx, w - PAD - 150, y + 40, 132, 48, '查看位置', {
          id: 'loc_' + q.id, size: 20, fill: '#2c2418', onTap: function () { locateQuest(app, q); },
        });
      }
      y += 138;
    });
    app.ui.button(ctx, PAD, y, w - PAD * 2, 76, '再接一桩', {
      id: 'ask2', size: 24, onTap: function () {
        const q = stateLib.offerQuest(st, site);
        app.showToast(q ? '接下来的事：' + q.title : '今天没活了。', 2.4);
      },
    });
    y += 90;
  }

  // 英雄：在酒馆里坐着的不起眼的人
  const offers = heroes.offersAt(st, site);
  if (offers.length) {
    text(ctx, '角落里坐着的人', PAD, y + 6, { size: 20, color: '#a2947a' });
    const cap = heroes.heroCap(st);
    text(ctx, '随行 ' + st.player.heroes.length + ' / ' + cap, w - PAD, y + 8, {
      size: 15, align: 'right', color: st.player.heroes.length >= cap ? '#d06a4a' : '#8a8070',
    });
    y += 40;
    offers.slice(0, 2).forEach(function (h) {
      panel(ctx, PAD, y, w - PAD * 2, 150, { fill: '#201a14' });
      text(ctx, h.name, PAD + 18, y + 12, { size: 26, color: '#efe3c6' });
      text(ctx, '1-10 级 · 随队不死 · 打仗涨级', PAD + 150, y + 20, { size: 15, color: '#8a8070' });
      wrap(ctx, heroes.storyOf(h.id) || h.bio, w - PAD * 2 - 200, 15).slice(0, 2).forEach(function (ln, i) {
        text(ctx, ln, PAD + 18, y + 52 + i * 22, { size: 15, color: '#a2947a' });
      });
      const b = heroes.bonusOf(h.id, 1);
      text(ctx, '带的加成：' + (b.label || '无'), PAD + 18, y + 102, { size: 13, color: '#8fb0d8' });
      text(ctx, h.cost + '金钱', w - PAD - 150, y + 62, { size: 22, color: '#f0c060' });
      app.ui.button(ctx, w - PAD - 120, y + 88, 104, 52, '招募', {
        id: 'hero_' + h.id, size: 20, disabled: st.player.gold < h.cost, onTap: function () {
          const r = heroes.hireHero(st, site, h.id);
          app.showToast(r.msg, 2.4);
        },
      });
      y += 164;
    });
  }

  // 传闻
  const reg = regionDef(site.region);
  text(ctx, '“' + (reg ? reg.flavor : '') + '”', PAD, y + 40, { size: 17, color: '#8a8070' });

  // 打听前朝旧主的下落：一次 40金钱，问出一个人藏在哪个村
  const unknown = st.lords.filter(function (l) {
    return l.hidden && l.hidden.siteId && (!st.knownHidden || !st.knownHidden[l.id]);
  });
  if (unknown.length) {
    app.ui.button(ctx, PAD, y + 76, w - PAD * 2, 76, '打听前朝旧主的下落 · 40金钱', {
      id: 'rumor', size: 22, fill: '#241c14', disabled: st.player.gold < 40, onTap: function () {
        const r = stateLib.tavernRumor(st);
        app.showToast(r.msg, 3);
      },
    });
    backButton(app, y + 168);
    return;
  }

  backButton(app, y + 90);
}

/* ---------------------------------------------------------------- 村中隐者 */

function renderHermit(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;
  const lord = stateLib.hiddenLordsAt(st, site.id)[0];

  text(ctx, '村中隐者', PAD, 296, { size: 26, color: '#f0c060' });

  if (!lord) {
    text(ctx, '人已经走了。', PAD, 360, { size: 20, color: '#a2947a' });
    backButton(app, h - 84);
    return;
  }

  const f = FACTIONS[lord.hidden.faction];
  const rel = st.relations[lord.hidden.faction] || 0;

  panel(ctx, PAD, 350, w - PAD * 2, 168, { fill: '#241c14' });
  text(ctx, lord.name, PAD + 18, 362, { size: 30, color: '#efe3c6' });
  text(ctx, (f ? f.full : '故国') + ' · ' + (lord.title || '旧将'), PAD + 18, 404, { size: 17, color: '#a2947a' });
  text(ctx, '“' + (f ? f.full : '故国') + '都亡了，我还提刀做什么。”', PAD + 18, 440, { size: 18, color: '#c9bda2' });
  text(ctx, '村里人对你的态度 ' + rel + '（要 60 才肯替你说话）', PAD + 18, 476, { size: 15, color: rel >= 60 ? '#8fbf7a' : '#d06a4a' });

  app.ui.button(ctx, PAD, 546, w - PAD * 2, 86, '请他出山 · 跟我走', {
    id: 'hermit_hire', size: 26, fill: '#2c2a40', onTap: function () {
      const r = stateLib.recruitHiddenLord(st, site.id);
      app.showToast(r.msg, 3);
      if (r.ok) app.townView.view = 'menu';
    },
  });
  app.ui.button(ctx, PAD, 646, w - PAD * 2, 74, '算了 · 不打扰', {
    id: 'hermit_no', size: 24, fill: '#241c14', onTap: function () {
      app.townView.view = 'menu';
    },
  });

  text(ctx, '成了他会带半副甲跟你走；不成，他也不想再扛旗了。', PAD, 736, { size: 15, color: '#8a8070' });
}

/* ---------------------------------------------------------------- 领主府 */

function renderHall(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;
  const p = st.player;
  const f = site.ownerFaction;

  text(ctx, '领主府', PAD, 296, { size: 26, color: '#f0c060' });

  if (!f) {
    text(ctx, '这里没有旗，也没有官。', PAD, 350, { size: 21, color: '#a2947a' });
    backButton(app, 420);
    return;
  }

  const fac = FACTIONS[f];
  const rel = stateLib.relationOf(st, f);
  const hostile = stateLib.isHostileFaction(st, f);

  const facTitle = f === 'player' ? fac.full : (fac.full + ' · ' + fac.name);
  text(ctx, facTitle, PAD, 342, { size: 30, color: fac.color });
  text(ctx, fac.desc, PAD, 386, { size: 17, color: '#a2947a' });
  text(ctx, '关系 ' + rel, PAD, 424, { size: 20, color: rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#c9bda2' });
  bar(ctx, PAD, 456, w - PAD * 2, 10, (rel + 100) / 200, rel < -25 ? UI_COLORS.danger : rel > 25 ? UI_COLORS.good : UI_COLORS.accent);

  let y = 490;

  const fiefLord = stateLib.siteLord(st, site);
  if (fiefLord) {
    text(ctx, '封地领主：' + fiefLord.name + ' · Lv' + stateLib.lordLevel(fiefLord) +
      ' · 兵 ' + army.troopCount(fiefLord.troops) + ' / ' + stateLib.lordTroopCap(fiefLord), PAD, y - 8, {
        size: 17, color: '#e6d7b6',
      });
    y += 34;
  }

  if (!p.faction && !hostile) {
    const req = stateLib.joinRenownReq(f);
    const small = req === 100;
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88,
      p.renown < req ? '效忠（需声望 ' + req + '）' : '效忠' + fac.full, {
        id: 'join', size: 26, disabled: p.renown < req, onTap: function () {
          const r = stateLib.joinFaction(st, site);
          app.showToast(r.msg, 2.4);
        },
      });
    text(ctx, small ? '小国求贤：声望 100 即可投靠。' : '大国门槛：声望 200 才见得到守将。', PAD, y + 94, {
      size: 15, color: small ? '#8fbf7a' : '#c9a05a',
    });
    y += 120;
  }

  if (p.faction && p.faction !== f) {
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88, '向' + fac.full + '宣战', {
      id: 'war', size: 26, fill: '#3a2018', onTap: function () {
        const r = stateLib.declareWar(st, site);
        app.showToast(r.msg, 2.4);
      },
    });
    y += 100;
  }

  if (hostile) {
    text(ctx, '你和他们已经在打仗。走近城门就会被攻击。', PAD, y, { size: 18, color: '#d06a4a' });
    y += 40;
    const ps = st.playerSiege;
    const sieging = ps && ps.siteId === site.id;
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88, sieging ? '继续围城' : '围城', {
      id: 'siege', size: 26, fill: '#4a241c', onTap: function () {
        if (sieging) { app.townView.view = 'siege'; return; }
        const r = stateLib.beginPlayerSiege(st, site);
        if (!r.ok) { app.showToast(r.msg, 2.4); return; }
        app.showToast('城下扎营：回大地图等时辰，围成后才能决战。', 3);
        app.pop();
      },
    });
    text(ctx, sieging ? '围城营已扎下，继续等时辰' : '城有城墙：先围 1-2 天，围成后才能决战', PAD, y + 94, {
      size: 15, color: '#c9a05a',
    });
    y += 126;
  }

  // 情报：该势力的领主
  const resting = st.lords.filter(function (l) {
    return l.alive && l.inCity === site.id;
  });
  if (resting.length) {
    text(ctx, '府中歇脚 · ' + resting.length + ' 位领主', PAD, y + 6, { size: 20, color: '#d9a441' });
    y += 34;
    resting.slice(0, 3).forEach(function (l) {
      const n = army.troopCount(l.troops);
      text(ctx, '· ' + l.name + '（' + (l.title || '领主') + '）', PAD + 4, y, { size: 17, color: '#c9bda2' });
      text(ctx, '养兵中 · ' + n + ' 兵', w - PAD, y, { size: 16, align: 'right', color: '#8fbf7a' });
      y += 30;
    });
    text(ctx, '他们在大地图上收了旗，正在城里补兵。', PAD + 4, y, { size: 15, color: '#8a8070' });
    y += 30;
  }
  const lords = st.lords.filter(function (l) {
    return l.faction === f && l.alive && !l.inCity;
  });
  text(ctx, '麾下领主', PAD, y + 6, { size: 20, color: '#a2947a' });
  y += 40;
  lords.slice(0, 3).forEach(function (l) {
    const n = army.troopCount(l.troops);
    text(ctx, '· ' + l.name + '（' + l.title + '）', PAD + 4, y, { size: 18, color: '#e6d7b6' });
    text(ctx, n + ' 兵', w - PAD, y, { size: 18, align: 'right', color: n > 150 ? '#d06a4a' : '#a2947a' });
    y += 34;
  });
  if (!lords.length) text(ctx, '（暂时没有成军的领主）', PAD + 4, y, { size: 17, color: '#8a8070' });
  if (lords.length > 3) {
    app.ui.button(ctx, PAD, y + 4, w - PAD * 2, 54, '查看全部 · ' + lords.length + ' 位领主', {
      id: 'hall_all_lords', size: 20, fill: '#2b2419',
      onTap: function () { app.townView.view = 'lords'; app.townView.lordScroll = 0; },
    });
    y += 66;
  }

  backButton(app, y + 34);
}

/* ---------------------------------------------------------------- 麾下领主名册 */

function lordStatus(st, lord, site) {
  if (lord.inCity === site.id) return '府中养兵';
  if (lord.inCity) {
    const inCity = siteById(st.world, lord.inCity);
    return inCity ? '驻' + inCity.name : '驻外城';
  }
  if (lord.order && lord.order.siteId) {
    const target = siteById(st.world, lord.order.siteId);
    const type = lord.order.type === 'siege' ? '围' : '往';
    return type + (target ? target.name : '军令');
  }
  if (lord.chasing) return '追击中';
  return '在外';
}

function renderLordList(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  const st = app.state;
  const f = site.ownerFaction;
  const lords = st.lords.filter(function (l) {
    return l.faction === f && l.alive && !l.dead && !l.retired;
  });
  const rows = lords.slice().sort(function (a, b) {
    const ra = { king: 0, lord: 1, general: 2 }[stateLib.lordRank(a)] || 3;
    const rb = { king: 0, lord: 1, general: 2 }[stateLib.lordRank(b)] || 3;
    return ra - rb || army.troopCount(b.troops) - army.troopCount(a.troops);
  });
  const title = f ? (FACTIONS[f].full + ' · 麾下领主') : '无主之地的领主';
  text(ctx, title, PAD, 296, { size: 27, color: '#f0c060' });
  text(ctx, '共 ' + rows.length + ' 位 · 上下拖动或滚轮查看全部', w - PAD, 302, {
    size: 15, align: 'right', color: '#a2947a',
  });

  const rowH = 66;
  const gap = 8;
  const y = 344;
  const foot = H - 100;
  const viewH = Math.max(120, foot - y - 10);
  const contentH = rows.length * (rowH + gap);
  const maxScroll = Math.max(0, contentH - viewH);
  if (app.townView.lordScroll === undefined) app.townView.lordScroll = 0;
  app.townView.lordScroll = Math.max(0, Math.min(maxScroll, app.townView.lordScroll));
  app.townView.lordMaxScroll = maxScroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, w, viewH);
  ctx.clip();
  rows.forEach(function (l, i) {
    const ry = y + i * (rowH + gap) - app.townView.lordScroll;
    if (ry < y - rowH || ry > y + viewH + rowH) return;
    ctx.fillStyle = i % 2 ? '#211b15' : '#261f17';
    ctx.fillRect(PAD, ry, w - PAD * 2, rowH);
    const rank = stateLib.lordRank(l);
    ctx.fillStyle = rank === 'king' ? '#d9a441' : rank === 'lord' ? '#8fa6c8' : '#8a8070';
    ctx.fillRect(PAD, ry, 4, rowH);
    text(ctx, l.name, PAD + 18, ry + 10, { size: 23, color: l.alive ? '#efe3c6' : '#6a6050' });
    text(ctx, (l.title || '领主') + (rank === 'king' ? ' · 君主' : rank === 'lord' ? ' · 领兵者' : ''),
      PAD + 18, ry + 41, { size: 15, color: '#a2947a' });
    const n = army.troopCount(l.troops);
    text(ctx, n + ' 兵', w - PAD - 102, ry + 12, { size: 20, align: 'right', color: n > 150 ? '#d06a4a' : '#c9bda2' });
    text(ctx, lordStatus(st, l, site), w - PAD - 14, ry + 41, { size: 15, align: 'right', color: '#8fbf7a' });
  });
  ctx.restore();

  if (!rows.length) text(ctx, '（这一家暂时没有成军的领主）', PAD + 4, y + 8, { size: 18, color: '#8a8070' });
  if (maxScroll > 0) {
    const trackH = viewH;
    ctx.fillStyle = 'rgba(80,66,46,0.35)';
    ctx.fillRect(w - 8, y, 4, trackH);
    const thumbH = Math.max(34, trackH * (viewH / contentH));
    const thumbY = y + (trackH - thumbH) * (app.townView.lordScroll / maxScroll);
    ctx.fillStyle = '#8a7448';
    ctx.fillRect(w - 8, thumbY, 4, thumbH);
  }

  app.ui.button(ctx, PAD, H - 84, 170, 58, '← 返回领主府', {
    id: 'lords_back', size: 20, fill: '#241c14',
    onTap: function () { app.townView.view = 'hall'; },
  });
}

/* ---------------------------------------------------------------- 城池详情 */

/** 底部信息卡：守军 / 粮价 / 关系 / 兵源 / 风物，填满下半屏 */
function siteInfo(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  if (H < 1160) return;

  const st = app.state;
  const reg = regionDef(site.region) || {};
  const fac = site.ownerFaction ? FACTIONS[site.ownerFaction] : null;
  const y = H - 286;
  const bw = w - PAD * 2;

  panel(ctx, PAD, y, bw, 262, { fill: '#191410' });
  ctx.fillStyle = 'rgba(240,192,96,0.35)';
  ctx.fillRect(PAD + 20, y + 16, bw - 40, 1);

  text(ctx, '守军', PAD + 22, y + 28, { size: 17, color: '#8a8070' });
  text(ctx, String(site.garrison || 0), PAD + 22, y + 54, { size: 30, color: '#d8c8a6' });

  text(ctx, '粮价', PAD + 180, y + 28, { size: 17, color: '#8a8070' });
  text(ctx, economy.foodPrice(site) + '金钱', PAD + 180, y + 54, { size: 30, color: '#d8c8a6' });

  if (fac) {
    const rel = (st.relations && st.relations[site.ownerFaction]) || 0;
    text(ctx, fac.full + ' 关系', PAD + 340, y + 28, { size: 17, color: '#8a8070' });
    text(ctx, (rel > 0 ? '+' : '') + rel, PAD + 340, y + 54, {
      size: 30, color: rel >= 0 ? '#8fbf7a' : '#d06a4a',
    });
  } else {
    text(ctx, '归属', PAD + 340, y + 28, { size: 17, color: '#8a8070' });
    text(ctx, '无主之地', PAD + 340, y + 54, { size: 22, color: '#a2947a' });
  }

  const names = (site.recruitList || []).map(function (id) { return TROOPS[id] ? TROOPS[id].name : id; });
  text(ctx, '此地兵源', PAD + 22, y + 104, { size: 17, color: '#8a8070' });
  text(ctx, names.join(' · ') || '无可招募', PAD + 22, y + 132, { size: 20, color: '#c9bda2' });

  ctx.fillStyle = 'rgba(240,192,96,0.25)';
  ctx.fillRect(PAD + 20, y + 170, bw - 40, 1);
  const lines = wrap(ctx, (reg.name ? '【' + reg.name + '】' : '') + (reg.flavor || ''), bw - 44, 17, 'normal');
  lines.slice(0, 2).forEach(function (l, i) {
    text(ctx, l, PAD + 22, y + 186 + i * 26, { size: 17, color: '#8f8571' });
  });
}

/* ---------------------------------------------------------------- 围城 */

function renderSiege(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  const st = app.state;
  const ps = st.playerSiege;
  const active = !!ps && ps.siteId === site.id;

  text(ctx, '围城', PAD, 296, { size: 30, color: '#f0c060' });
  text(ctx, site.name + ' · 守军 ' + (site.garrison || 0) + ' 人', w - PAD, 304, {
    size: 18, align: 'right', color: '#a2947a',
  });

  if (!active) {
    text(ctx, '城下还没有你的营寨。要攻这座城，先围起来。', PAD, 354, { size: 20, color: '#c9bda2' });
    app.ui.button(ctx, PAD, 420, w - PAD * 2, 88, '开始围城', {
      id: 'siege_begin', size: 26, fill: '#4a241c', onTap: function () {
        const r = stateLib.beginPlayerSiege(st, site);
        if (!r.ok) { app.showToast(r.msg, 2.4); return; }
        app.showToast('城下扎营：回大地图等时辰，围成后才能决战。', 3);
        app.pop();
      },
    });
    app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '回大地图', {
      id: 'siege_back2', size: 26, fill: '#241c14', onTap: function () { app.pop(); },
    });
    return;
  }

  const now = stateLib.gameHours(st);
  const left = Math.max(0, ps.readyHour - now);
  const ready = ps.stage === 'ready' || left <= 0;
  const day = Math.min(ps.days, Math.floor(Math.max(0, now - ps.startHour) / 24) + 1);
  const ring = Math.max(0, 1 - left / (ps.days * 24));

  panel(ctx, PAD, 350, w - PAD * 2, 230, { fill: '#241c14' });
  text(ctx, '围城第 ' + day + ' / ' + ps.days + ' 天', PAD + 18, 366, { size: 30, color: '#efe3c6' });
  bar(ctx, PAD + 18, 408, w - PAD * 2 - 36, 12, ring, '#c97a42');
  text(ctx, ready ? '壕沟已推到城门下，守军开始挂白旗。' : '四面扎营，断粮道、填壕沟；城中还没开门。',
    PAD + 18, 432, { size: 17, color: ready ? '#8fbf7a' : '#a2947a' });
  text(ctx, ready ? '可以决战了。' : '还需 ' + Math.ceil(left) + ' 个时辰（约 ' + Math.ceil(left / 24) + ' 天）',
    PAD + 18, 470, { size: 20, color: ready ? '#8fbf7a' : '#f0c060' });
  text(ctx, '围城期间粮草照常消耗；撤围或攻城失败，营寨就散了。', PAD + 18, 508, {
    size: 15, color: '#8a8070',
  });

  app.ui.button(ctx, PAD, 610, w - PAD * 2, 88,
    ready ? '回大地图 · 围城已成' : '回大地图 · 时辰照走', {
      id: 'siege_wait', size: 24, fill: '#33271b',
      onTap: function () {
        app.showToast(ready ? '围城已成：回地图点城下营寨，即可决战。' : '回大地图看时辰流动；围满再回来决战。', 2.4);
        app.pop();
      },
    });

  app.ui.button(ctx, PAD, 718, w - PAD * 2, 96, ready ? '决战 · 攻城' : '决战（先把城围成）', {
    id: 'siege_storm', size: 28, fill: '#4a241c', disabled: !ready, onTap: function () {
      const battle = stateLib.startSiege(st, site);
      if (!battle) { app.showToast('还不到决战的时候。', 2); return; }
      app.push('battle', { mode: 'siege' });
    },
  });

  app.ui.button(ctx, PAD, 836, w - PAD * 2, 78, '撤围 · 退回野地', {
    id: 'siege_cancel', size: 24, fill: '#241c14', onTap: function () {
      const r = stateLib.cancelPlayerSiege(st);
      app.showToast(r.msg, 2);
      app.pop();
    },
  });

  text(ctx, '围城计时只在大地图上走：时辰每流一点，壕沟就往城门推进一点。', w / 2, 936, {
    size: 15, align: 'center', color: '#8a8070',
  });
  app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '回大地图', {
    id: 'siege_back', size: 26, fill: '#241c14', onTap: function () { app.pop(); },
  });
}

/* ---------------------------------------------------------------- 场景 */

const TownScene = {
  enter(app, params) {
    app.restView = null;
    const st = app.state;
    const autoSiege = st && st.playerSiege && st.playerSiege.siteId === params.siteId;
    app.townView = {
      siteId: params.siteId,
      view: params.view || (autoSiege ? 'siege' : 'menu'),
      tab: 'food',
      goodId: null,
      estimate: null,
      scroll: 0,
      maxScroll: 0,
      lordScroll: 0,
      lordMaxScroll: 0,
    };
  },

  update(app) {
    if (app.state.events.length) flows.process(app);
  },

  render(app) {
    const site = siteById(app.state.world, app.townView.siteId);
    if (!site) {
      app.pop();
      return;
    }
    // 玩家已离开该据点（比如战斗后），直接退出
    if (app.state.player.atSiteId !== site.id && app.state.events.length === 0) {
      // 允许停留，只要没移动
    }

    scenery.drawBackdrop(app.runtime.ctx, site.type === 'village' ? 'village' : 'city',
      app.runtime.width, app.runtime.height, siteSeed(site.id));
    header(app, site);
    const y = statusBar(app, 148);

    const v = app.townView.view;
    if (v === 'recruit') renderRecruit(app, site);
    else if (v === 'market') renderMarket(app, site, app.townView.tab || 'goods');
    else if (v === 'village') renderVillage(app, site);
    else if (v === 'tavern') renderTavern(app, site);
    else if (v === 'hall') renderHall(app, site);
    else if (v === 'lords') renderLordList(app, site);
    else if (v === 'siege') renderSiege(app, site);
    else if (v === 'hermit') renderHermit(app, site);
    else {
      renderMenu(app, site);
    }
  },

  onTouchStart(app, x, y) {
    const v = app.townView.view;
    app.townView.drag = {
      y: y,
      view: v,
      scroll: v === 'lords' ? (app.townView.lordScroll || 0) : (app.townView.scroll || 0),
      moved: 0,
    };
  },

  onTouchMove(app, x, y) {
    const d = app.townView.drag;
    if (!d) return;
    if (app.townView.view !== 'menu' && app.townView.view !== 'lords') return;
    const dy = y - d.y;
    if (Math.abs(dy) > 6) d.moved = Math.abs(dy);
    if (d.moved > 6) {
      if (app.townView.view === 'lords') {
        const max = app.townView.lordMaxScroll || 0;
        app.townView.lordScroll = Math.max(0, Math.min(max, d.scroll - dy));
      } else {
        const max = app.townView.maxScroll || 0;
        app.townView.scroll = Math.max(0, Math.min(max, d.scroll - dy));
      }
    }
  },

  onTouchEnd(app) {
    if (app.townView) app.townView.drag = null;
  },

  onWheel(app, dy) {
    if (!app.townView) return;
    if (app.townView.view === 'lords') {
      const max = app.townView.lordMaxScroll || 0;
      app.townView.lordScroll = Math.max(0, Math.min(max, (app.townView.lordScroll || 0) + dy));
    } else if (app.townView.view === 'menu') {
      const max = app.townView.maxScroll || 0;
      app.townView.scroll = Math.max(0, Math.min(max, (app.townView.scroll || 0) + dy));
    }
  },
};

module.exports = TownScene;



  };

  /* js/scenes/founding.js */
  __defs[27] = function (module, exports, __require) {
/**
 * 立国页：打下第一座城后选一个字的国号，再选旗色。
 * 扎营里的“国号与旗色”也复用这一页，只改两个字。
 */

const { text, panel, wrap } = __require(6);
const stateLib = __require(7);

const PAD = 20;
const GAP = 8;

// 两页各三十个字，都是能当国号的一个汉字；不用键盘，拇指点得中。
const NAME_PAGES = [
  ['赵', '燕', '秦', '齐', '楚', '周', '夏', '商', '梁', '晋',
    '唐', '宋', '郑', '卫', '陈', '鲁', '韩', '徐', '幽', '并',
    '青', '兖', '豫', '荆', '扬', '益', '雍', '司', '朔', '代'],
  ['汉', '魏', '吴', '蜀', '曹', '刘', '孙', '袁', '董', '马',
    '李', '王', '张', '黄', '高', '杨', '冯', '庞', '陆', '顾',
    '桓', '谢', '陶', '温', '杜', '钟', '严', '华', '霍', '窦'],
];

const FLAG_COLORS = [
  { c: '#d9a441', n: '鎏金' },
  { c: '#b4463c', n: '赤' },
  { c: '#3f6fa8', n: '靛' },
  { c: '#4f8f5a', n: '苍' },
  { c: '#8c6fae', n: '紫' },
  { c: '#b06a3c', n: '赭' },
  { c: '#6a8f8a', n: '青' },
  { c: '#8f8f86', n: '灰' },
  { c: '#c95a7a', n: '桃' },
  { c: '#5a7fa0', n: '蓝' },
  { c: '#7a6a4a', n: '褐' },
  { c: '#2f6f6a', n: '墨青' },
];

function selectedColorName(hex) {
  const named = stateLib.flagColorName(hex);
  if (named) return named;
  for (let i = 0; i < FLAG_COLORS.length; i++) {
    if (FLAG_COLORS[i].c.toLowerCase() === String(hex || '').toLowerCase()) return FLAG_COLORS[i].n;
  }
  return hex;
}

/** 从输入里取第一个汉字；国号只能一个字，拼音、空格、标点都不算 */
function pickCountryChar(value) {
  const chars = Array.from(String(value === undefined || value === null ? '' : value));
  for (let i = 0; i < chars.length; i++) {
    if (/^[\u4e00-\u9fa5]$/.test(chars[i])) return chars[i];
  }
  return null;
}

const FoundingScene = {
  enter(app, params) {
    this.closeCustomInput();
    const c = app.state.player.country;
    this.editing = !!(params && params.edit);
    this.step = 0;
    this.page = 0;
    this.name = c && c.name ? c.name : '';
    this.color = c && c.color ? c.color : '#d9a441';
  },

  update() {},

  /** 调出系统键盘输入一个汉字：输入能力交给 platform，小游戏和浏览器共用一套入口 */
  openCustomInput(app) {
    const self = this;
    if (this._textHandle) {
      this._textHandle.focus();
      return;
    }
    if (!app.runtime.askText) {
      app.showToast('当前设备不方便调键盘，点字表里的字也能定国号。', 2.4);
      return;
    }
    const handle = app.runtime.askText({
      value: self.name || '',
      maxLength: 4,
      placeholder: '输入一个汉字',
      onInput: function (value) {
        const ch = pickCountryChar(value);
        if (!ch) return;
        self.name = ch;
        if (self._textHandle) self._textHandle.setValue(ch);
        app.showToast('国号已输入：' + ch, 1.6);
      },
      onDone: function (value) {
        const ch = pickCountryChar(value);
        if (ch) self.name = ch;
        self.closeCustomInput();
      },
    });
    if (!handle) {
      app.showToast('当前设备不方便调键盘，点字表里的字也能定国号。', 2.4);
      return;
    }
    self._textHandle = handle;
    app.showToast('请用键盘输入一个汉字国号。', 2.2);
  },

  closeCustomInput() {
    if (this._textHandle) {
      const h = this._textHandle;
      this._textHandle = null;
      try { h.close(); } catch (e) { /* ignore */ }
    }
  },

  leave() {
    this.closeCustomInput();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const self = this;

    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w / 2, h * 0.36, 30, w / 2, h * 0.36, h * 0.8);
    glow.addColorStop(0, 'rgba(150,104,36,0.22)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    text(ctx, this.editing ? '改国号 · 换旗色' : '立国', PAD, 46, {
      size: 44, color: '#f0c060',
    });
    text(ctx, '第 ' + (this.step + 1) + ' / 2 步', w - PAD, 56, {
      size: 18, align: 'right', color: '#a2947a',
    });

    if (this.step === 0) this.renderName(app, ctx, w, h);
    else this.renderColor(app, ctx, w, h);

    // 顶部始终把选中的国号亮出来
    if (this.name) {
      text(ctx, '国号：' + this.name, w - PAD, 96, {
        size: 20, align: 'right', color: '#ffe0a8',
      });
    }

    app.ui.button(ctx, PAD, h - 82, 170, 58, this.editing ? '取消' : '稍后再定', {
      id: 'found_back', size: 20, fill: '#241c14', onTap: function () { app.pop(); },
    });
    text(ctx, this.editing ? '改完立刻换所有城头与领主旗' : '定下来后，占领的城和麾下领主都挂这面旗',
      PAD, h - 132, { size: 15, color: '#8a8070' });
  },

  renderName(app, ctx, w, h) {
    const self = this;
    text(ctx, '国号 · 只取一个字', PAD, 150, { size: 26, color: '#efe3c6' });
    const lines = wrap(ctx, this.editing
      ? '国号写在城头，也写进天下人的嘴里。改一个字，所有旗都跟着换。'
      : '城已经打下来了。部下把笔递到你手上：写一个字，作为你和这座城的旗。',
      w - PAD * 2, 16);
    lines.slice(0, 2).forEach(function (l, i) {
      text(ctx, l, PAD, 190 + i * 24, { size: 15, color: '#a2947a' });
    });

    const cols = 6;
    const cw = (w - PAD * 2 - GAP * (cols - 1)) / cols;
    const ch = 82;
    const set = NAME_PAGES[this.page];
    let y0 = 260;
    set.forEach(function (chName, i) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAD + col * (cw + GAP);
      const y = y0 + row * (ch + GAP);
      const active = self.name === chName;
      app.ui.button(ctx, x, y, cw, ch, chName, {
        id: 'name_' + chName,
        size: 34,
        fill: active ? '#4a3a20' : '#241c14',
        border: active ? '#ffd76a' : '#5a4a32',
        color: active ? '#ffe0a8' : '#efe3c6',
        onTap: function () { self.name = chName; },
      });
    });

    const gy = y0 + 5 * (ch + GAP) + 8;
    app.ui.button(ctx, PAD, gy, 210, 68, this.page ? '上一组字' : '换一组字', {
      id: 'name_page', size: 22, fill: '#2c2418', onTap: function () { self.page = self.page ? 0 : 1; },
    });
    app.ui.button(ctx, PAD + 230, gy, 150, 68, '自定义', {
      id: 'name_custom', size: 20, fill: '#2c2418', onTap: function () { self.openCustomInput(app); },
    });
    app.ui.button(ctx, w - PAD - 330, gy, 330, 68,
      this.name ? '国号「' + this.name + '」 · 下一步' : '先选一个字', {
        id: 'name_next', size: 23, fill: '#4a3a20',
        disabled: !this.name,
        onTap: function () { self.step = 1; },
      });

    text(ctx, '不想用字表里的字，可以自己输入一个汉字。', PAD, gy + 82, {
      size: 15, color: '#8a8070',
    });
    // 如果读的是旧档国号，正好不在这两页里：也让它能继续改色
    if (this.name && NAME_PAGES[0].indexOf(this.name) < 0 && NAME_PAGES[1].indexOf(this.name) < 0) {
      text(ctx, '当前国号「' + this.name + '」不在字表里，仍可直接下一步换色。', PAD, gy + 108, {
        size: 15, color: '#a2947a',
      });
    }
  },

  renderColor(app, ctx, w, h) {
    const self = this;
    text(ctx, '旗色 · 选一面', PAD, 150, { size: 26, color: '#efe3c6' });
    const lines = wrap(ctx, '旗色会出现在你的城头、地图上的旗块，以及所有挂了你的国号的领主旗下。',
      w - PAD * 2, 16);
    lines.slice(0, 2).forEach(function (l, i) {
      text(ctx, l, PAD, 190 + i * 24, { size: 15, color: '#a2947a' });
    });

    const cols = 6;
    const cw = (w - PAD * 2 - GAP * (cols - 1)) / cols;
    const ch = 70;
    let y0 = 250;
    FLAG_COLORS.forEach(function (fc, i) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAD + col * (cw + GAP);
      const y = y0 + row * (ch + GAP);
      const active = String(self.color).toLowerCase() === fc.c.toLowerCase();
      app.ui.button(ctx, x, y, cw, ch, fc.n, {
        id: 'color_' + fc.n, size: 17, fill: fc.c,
        border: active ? '#ffe0a8' : '#4a4030',
        color: '#171310', onTap: function () { self.color = fc.c; },
      });
    });

    // 预览：一面小旗，加上国号
    const py = 430;
    panel(ctx, PAD, py, w - PAD * 2, 170, { fill: '#241c14' });
    const fx = PAD + 36;
    const fy = py + 28;
    ctx.fillStyle = self.color;
    ctx.fillRect(fx, fy, 62, 78);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(fx, fy, 62, 3);
    text(ctx, self.name || '？', fx + 31, fy + 14, {
      size: 40, align: 'center', color: '#171310',
    });
    text(ctx, '国号「' + (self.name || '未定') + '」', PAD + 128, py + 34, {
      size: 28, color: '#efe3c6',
    });
    text(ctx, '旗色：' + selectedColorName(self.color), PAD + 128, py + 82, {
      size: 21, color: '#c9bda2',
    });
    text(ctx, '所有占领城与麾下领主都会挂这面旗。', PAD + 128, py + 120, {
      size: 16, color: '#8a8070',
    });

    app.ui.button(ctx, PAD, py + 196, 220, 76, '上一步 · 国号', {
      id: 'color_back', size: 22, fill: '#241c14', onTap: function () { self.step = 0; },
    });
    app.ui.button(ctx, w - PAD - 390, py + 196, 390, 76,
      this.editing ? '换旗 · 改国号' : '立国 · 竖旗', {
        id: 'color_confirm', size: 26, fill: '#4a3a20', disabled: !self.name,
        onTap: function () {
          const r = stateLib.foundCountry(app.state, self.name, self.color);
          if (!r.ok) { app.showToast(r.msg, 2.4); return; }
          app.showToast(r.msg, 3);
          app.pop();
        },
      });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = FoundingScene;

  };

  /* js/scenes/fief.js */
  __defs[28] = function (module, exports, __require) {
/**
 * 封地页：把打下来的城、关隘、村庄封给任意领主。
 *
 * 三种进入方式：
 * 1. 城池/村庄菜单“封地 · 点将” → 列出所有玩家领地，点一块进去点将
 * 2. 英雄页“封地出镇” → 先给这名英雄选一块空封地，再封他做独立领主
 * 3. 点将页里也可以把队中英雄直接封出去
 */

const { text, wrap } = __require(6);
const stateLib = __require(7);
const scenery = __require(25);
const army = __require(9);
const heroes = __require(14);
const { siteById, regionDef } = __require(8);
const { FACTIONS } = __require(5);

const PAD = 24;
const LIST_BOTTOM_GAP = 160;
const SITE_ROW_H = 122;
const SITE_GAP = 12;
const LORD_ROW_H = 112;
const LORD_GAP = 10;

function siteKind(site) {
  return site.type === 'town' ? '城' : site.type === 'castle' ? '关隘' : site.type === 'village' ? '村' : '地';
}

function siteLine(site) {
  const fac = site.ownerFaction ? FACTIONS[site.ownerFaction] : null;
  const region = (regionDef(site.region) || {}).name || '';
  return siteKind(site) + ' · ' + (fac ? fac.full : '你的旗') + (region ? ' · ' + region : '');
}

function lordLine(st, lord) {
  const n = army.troopCount(lord.troops);
  const cap = stateLib.lordTroopCap(lord);
  return 'Lv' + stateLib.lordLevel(lord) + ' · 兵 ' + n + ' / ' + cap;
}

function fiefNames(st, lord) {
  const list = stateLib.lordFiefs(st, lord);
  if (!list.length) return '尚无封地';
  return list.map(function (s) { return s.name; }).slice(0, 3).join('、') +
    (list.length > 3 ? ' 等 ' + list.length + ' 处' : '');
}

const FiefScene = {
  enter(app, params) {
    const p = params || {};
    this.siteId = p.siteId || null;
    this.heroId = p.heroId || null;
    this.mode = this.heroId ? 'pickHero' : (this.siteId ? 'list' : 'list');
    this.page = 0;
    this.sitePage = 0;
    this.scrolls = { list: 0, pickHero: 0, lords: 0 };
    this.scrollMax = 0;
    this.drag = null;
    this.dragMoved = 0;
    this.msg = '';
  },

  update() {},

  ownedSites(app) {
    const list = (app.state.world.sites || []).filter(function (s) {
      return s.playerOwned && s.type !== 'camp';
    });
    const focus = this.siteId;
    return list.slice().sort(function (a, b) {
      if (focus && a.id === focus) return -1;
      if (focus && b.id === focus) return 1;
      const rank = { town: 0, castle: 1, village: 2 };
      const ra = rank[a.type] === undefined ? 3 : rank[a.type];
      const rb = rank[b.type] === undefined ? 3 : rank[b.type];
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });
  },

  playerLords(app) {
    return (app.state.lords || []).filter(function (l) {
      return l.alive && !l.prisoner && !l.hidden && l.faction === 'player';
    }).sort(function (a, b) {
      return stateLib.lordLevel(b) - stateLib.lordLevel(a);
    });
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;

    ctx.fillStyle = '#12100c';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'hall', w, h, 41);

    if (this.mode === 'lords') return this.renderLordPick(app, ctx, w, h);
    if (this.mode === 'pickHero') return this.renderHeroSites(app, ctx, w, h);
    return this.renderSiteList(app, ctx, w, h);
  },

  header(ctx, w, title, sub) {
    text(ctx, title, PAD, 34, { size: 40, color: '#f0c060' });
    if (sub) text(ctx, sub, PAD, 92, { size: 17, color: '#a2947a' });
  },

  footerButton(app, ctx, w, h, label, id, onTap, fill) {
    app.ui.button(ctx, PAD, h - 108, w - PAD * 2, 78, label, {
      id: id, size: 24, fill: fill || '#241c14', onTap: onTap,
    });
  },

  scrollKey() {
    return this.mode === 'lords' ? 'lords' : (this.mode === 'pickHero' ? 'pickHero' : 'list');
  },

  scrollValue() {
    return this.scrolls[this.scrollKey()] || 0;
  },

  setScroll(v) {
    this.scrolls[this.scrollKey()] = Math.max(0, Math.min(this.scrollMax || 0, v || 0));
  },

  scrollView(h, y0) {
    const bottom = h - LIST_BOTTOM_GAP;
    return { y0: y0, bottom: bottom, height: Math.max(120, bottom - y0) };
  },

  setupScroll(contentH, viewH) {
    this.scrollMax = Math.max(0, contentH - viewH);
    const key = this.scrollKey();
    this.scrolls[key] = Math.max(0, Math.min(this.scrollMax, this.scrolls[key] || 0));
    return this.scrolls[key];
  },

  scrollBar(ctx, w, view, scroll, contentH) {
    if (this.scrollMax <= 0) return;
    const trackH = view.height;
    ctx.fillStyle = 'rgba(80,66,46,0.35)';
    ctx.fillRect(w - 8, view.y0, 4, trackH);
    const thumbH = Math.max(34, trackH * (view.height / contentH));
    const thumbY = view.y0 + (trackH - thumbH) * (scroll / this.scrollMax);
    ctx.fillStyle = '#8a7448';
    ctx.fillRect(w - 8, thumbY, 4, thumbH);
    text(ctx, '滚轮 / 上下拖动查看全部', PAD, view.bottom + 8, {
      size: 14, color: '#8a8070',
    });
  },

  renderSiteList(app, ctx, w, h) {
    const st = app.state;
    const all = this.ownedSites(app);
    const p = st.player;
    this.header(ctx, w, '封地 · 点将',
      all.length
        ? '你有 ' + all.length + ' 处城与村。点一块地，决定由谁驻守。'
        : '还没有可封的城与村。打下第一座城后，这里就能点将。');

    if (!all.length) {
      text(ctx, '先打下一座城或村庄。', PAD, 180, { size: 22, color: '#c9bda2' });
      this.footerButton(app, ctx, w, h, '返回', 'fief_back', function () { app.pop(); }, '#241c14');
      return;
    }

    const y0 = 168;
    const view = this.scrollView(h, y0);
    const contentH = all.length * (SITE_ROW_H + SITE_GAP);
    const scroll = this.setupScroll(contentH, view.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, view.y0, w, view.height);
    ctx.clip();
    all.forEach(function (site, i) {
      const y = y0 + i * (SITE_ROW_H + SITE_GAP) - scroll;
      if (y < view.y0 - SITE_ROW_H || y > view.bottom + SITE_ROW_H) return;
      const lord = stateLib.siteLord(st, site);
      const isSelf = stateLib.siteSelfFief(st, site);
      app.ui.button(ctx, PAD, y, w - PAD * 2, SITE_ROW_H, '', {
        id: 'fief_site_' + site.id, fill: site.id === app.state.player.atSiteId ? '#2f291f' : '#241c14',
        onTap: function () {
          app.top().scene.siteId = site.id;
          app.top().scene.mode = 'lords';
          app.top().scene.scrolls.lords = 0;
        },
      });
      text(ctx, site.name, PAD + 22, y + 16, { size: 30, color: '#efe3c6' });
      text(ctx, siteLine(site), PAD + 22, y + 56, { size: 16, color: '#a2947a' });
      text(ctx, isSelf ? '封主：你自己 · 每周进税' : lord ? '封主：' + lord.name + ' · ' + lordLine(st, lord) : '未封 · 可点将',
        PAD + 22, y + 86, { size: 16, color: isSelf ? '#f0c060' : lord ? '#d8c79e' : '#8fbf7a' });
      text(ctx, '点将 →', w - PAD - 20, y + 42, { size: 20, align: 'right', color: '#f0c060' });
    });
    ctx.restore();

    this.scrollBar(ctx, w, view, scroll, contentH);
    text(ctx, '封地不占编制。一位领主最多管一处城村；自己可以直辖多处，按周收税。',
      PAD, view.bottom + 30, { size: 15, color: '#8a8070' });
    this.footerButton(app, ctx, w, h, '返回城池', 'fief_back', function () { app.pop(); }, '#241c14');
  },

  renderHeroSites(app, ctx, w, h) {
    const st = app.state;
    const hero = (st.player.heroes || []).filter(function (x) { return x.id === app.top().scene.heroId; })[0];
    if (!hero) {
      app.pop();
      return;
    }
    const def = heroes.heroById(hero.id) || {};
    const name = def.name || hero.name || hero.id;
    const free = this.ownedSites(app).filter(function (s) { return !stateLib.siteLord(st, s) && !stateLib.siteSelfFief(st, s); });
    this.header(ctx, w, '为 ' + name + ' 选封地',
      'Lv' + (hero.level || 1) + ' · 选定一块空城/村后，他才会离开队伍，成为独立领主。');

    if (!free.length) {
      text(ctx, '名下没有空的封地。', PAD, 180, { size: 24, color: '#d06a4a' });
      text(ctx, '先到城里的“封地 · 点将”收回一处，再回来封他。', PAD, 226, { size: 18, color: '#a2947a' });
      this.footerButton(app, ctx, w, h, '返回', 'fief_hero_back', function () { app.pop(); }, '#241c14');
      return;
    }

    const y0 = 158;
    const view = this.scrollView(h, y0);
    const contentH = free.length * (SITE_ROW_H + SITE_GAP);
    const scroll = this.setupScroll(contentH, view.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, view.y0, w, view.height);
    ctx.clip();
    free.forEach(function (site, i) {
      const y = y0 + i * (SITE_ROW_H + SITE_GAP) - scroll;
      if (y < view.y0 - SITE_ROW_H || y > view.bottom + SITE_ROW_H) return;
      app.ui.button(ctx, PAD, y, w - PAD * 2, SITE_ROW_H, '', {
        id: 'fief_hero_site_' + site.id, fill: '#241c14',
        onTap: function () {
          const r = stateLib.promoteHero(st, hero.id, site.id);
          app.showToast(r.msg, 3.4);
          if (r.ok) app.pop();
        },
      });
      text(ctx, site.name, PAD + 22, y + 16, { size: 30, color: '#efe3c6' });
      text(ctx, siteLine(site), PAD + 22, y + 56, { size: 16, color: '#a2947a' });
      text(ctx, '封给他 · 独立带兵', PAD + 22, y + 86, { size: 16, color: '#8fbf7a' });
      text(ctx, '选此地 →', w - PAD - 20, y + 42, { size: 20, align: 'right', color: '#f0c060' });
    });
    ctx.restore();

    this.scrollBar(ctx, w, view, scroll, contentH);
    text(ctx, '封地后英雄从队伍中移出，带一半编制出镇，之后在封地补满。', PAD,
      view.bottom + 30, { size: 15, color: '#8a8070' });
    this.footerButton(app, ctx, w, h, '取消', 'fief_hero_back', function () { app.pop(); }, '#241c14');
  },

  renderLordPick(app, ctx, w, h) {
    const st = app.state;
    const site = siteById(st.world, this.siteId);
    if (!site) {
      app.pop();
      return;
    }
    const current = stateLib.siteLord(st, site);
    const selfCurrent = stateLib.siteSelfFief(st, site);
    this.header(ctx, w, '点将 · ' + site.name,
      siteLine(site) + ' · ' + (selfCurrent ? '现由你自己直辖' : current ? '现封主：' + current.name : '尚无封主'));
    text(ctx, '一位领主最多一处封地；改封会自动收回他原来的那处。自己直辖的城每周进税。',
      PAD, 132, { size: 15, color: '#8a8070' });

    const lords = this.playerLords(app);
    const heroesInParty = (st.player.heroes || []).slice();
    const rows = [{
      kind: 'self', id: 'self', name: '你自己（主公直辖）',
      sub: '不派领主 · 每周结算税赋 · 可持有多处',
    }];
    lords.forEach(function (l) {
      rows.push({
        kind: 'lord', id: l.id, name: l.name,
        sub: (l.independent ? '独立领主 · ' : '家臣 · ') + lordLine(st, l) + ' · ' + fiefNames(st, l),
        lord: l,
      });
    });
    heroesInParty.forEach(function (hh) {
      const def = heroes.heroById(hh.id) || {};
      const name = def.name || hh.name || hh.id;
      const cap = stateLib.lordCapForLevel(hh.level || 1);
      rows.push({
        kind: 'hero', id: hh.id, name: name,
        sub: '队中英雄 Lv' + (hh.level || 1) + ' · 出镇上限 ' + cap + ' 兵', hero: hh,
      });
    });

    if (!rows.length) {
      text(ctx, '手下还没有可派的人。', PAD, 180, { size: 24, color: '#d06a4a' });
      text(ctx, '去酒馆招英雄，或在英雄页把人留住。', PAD, 226, { size: 18, color: '#a2947a' });
    }

    const y0 = 158;
    const view = this.scrollView(h, y0);
    if (current || selfCurrent) view.bottom = h - 254;
    view.height = Math.max(120, view.bottom - view.y0);
    const contentH = rows.length * (LORD_ROW_H + LORD_GAP);
    const scroll = this.setupScroll(contentH, view.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, view.y0, w, view.height);
    ctx.clip();
    rows.forEach(function (row, i) {
      const y = y0 + i * (LORD_ROW_H + LORD_GAP) - scroll;
      if (y < view.y0 - LORD_ROW_H || y > view.bottom + LORD_ROW_H) return;
      const isCurrent = (row.kind === 'self' && selfCurrent) ||
        (row.kind === 'lord' && current && current.id === row.id);
      app.ui.button(ctx, PAD, y, w - PAD * 2, LORD_ROW_H, '', {
        id: 'fief_lord_' + row.kind + '_' + row.id,
        fill: isCurrent ? '#33291d' : '#241c14',
        onTap: function () {
          let r;
          if (row.kind === 'self') {
            r = stateLib.assignFiefSelf(st, site.id);
          } else if (row.kind === 'hero') {
            r = stateLib.promoteHero(st, row.id, site.id);
          } else {
            r = stateLib.assignFief(st, site.id, row.id);
          }
          app.showToast(r.msg, 3);
          if (r.ok) {
            app.top().scene.mode = 'list';
            app.top().scene.scrolls.list = 0;
          }
        },
      });
      text(ctx, row.name, PAD + 22, y + 14, { size: 28, color: '#efe3c6' });
      text(ctx, row.sub, PAD + 22, y + 52, { size: 16, color: '#a2947a' });
      text(ctx, isCurrent ? '当前封主' : (row.kind === 'self' ? '收归自己 →' : row.kind === 'hero' ? '封地出镇 →' : '封给他 →'),
        w - PAD - 20, y + 38, { size: 18, align: 'right', color: isCurrent ? '#8fbf7a' : '#f0c060' });
    });
    ctx.restore();

    this.scrollBar(ctx, w, view, scroll, contentH);

    if (current || selfCurrent) {
      app.ui.button(ctx, PAD, h - 190, w - PAD * 2, 64,
        current ? '收回 ' + current.name + ' 的这块封地' : '收回自己直辖（改封他人）', {
        id: 'fief_clear', size: 19, fill: '#3a2418',
        onTap: function () {
          const r = stateLib.assignFief(st, site.id, null);
          app.showToast(r.msg, 3);
          if (r.ok) app.top().scene.mode = 'list';
        },
      });
    }

    this.footerButton(app, ctx, w, h, '返回封地列表', 'fief_lords_back', function () {
      app.top().scene.mode = 'list';
      app.top().scene.scrolls.list = 0;
    }, '#241c14');
  },
  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.scrollValue(), moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (!this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 5) {
      this.drag.moved = Math.abs(dy);
      // 拖动时取消按钮的按下态，松手不会误点进封地。
      app.ui.pressed = null;
      this.setScroll(this.drag.scroll - dy);
    }
  },

  onTouchEnd() {
    this.drag = null;
  },

  onWheel(app, dy) {
    this.setScroll(this.scrollValue() + dy);
  },
};

module.exports = FiefScene;

  };

  /* js/scenes/govern.js */
  __defs[29] = function (module, exports, __require) {
/**
 * 处理政务：一张案上同时管封地、外交。
 * 从自己的城/村菜单进来；封地分配复用原 fief 页，外交在这里谈。
 */

const { text, panel, bar } = __require(6);
const stateLib = __require(7);
const scenery = __require(25);
const { FACTIONS } = __require(5);
const { siteById } = __require(8);

const PAD = 20;
const DIPLO_ROW_H = 112;
const DIPLO_GAP = 10;

function facName(id) {
  return (FACTIONS[id] || {}).full || id;
}

const GovernScene = {
  enter(app, params) {
    this.siteId = params && params.siteId;
    this.view = 'main';
    this.page = 0;
    this.scroll = 0;
    this.choice = null;
    this.msg = '';
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }
    const site = this.siteId ? siteById(st.world, this.siteId) : null;
    if (!site || !site.playerOwned) {
      app.pop();
      return;
    }

    ctx.fillStyle = '#12100c';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'hall', w, h, 53);
    // 案上的灯与摊开的竹简
    ctx.fillStyle = 'rgba(58,42,24,0.22)';
    ctx.fillRect(0, 0, w, 172);
    ctx.strokeStyle = 'rgba(240,192,96,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      ctx.beginPath();
      ctx.moveTo(PAD + i * 12, h * 0.45);
      ctx.lineTo(PAD + i * 12, h * 0.85);
      ctx.stroke();
    }

    if (this.view === 'diplo') return this.renderDiplomacy(app, ctx, w, h, site, st);
    if (this.view === 'choice') return this.renderChoice(app, ctx, w, h, site, st);

    text(ctx, '处理政务', PAD, 26, { size: 42, color: '#f0c060' });
    text(ctx, site.name + ' · 你的治所', PAD, 82, { size: 19, color: '#a2947a' });
    text(ctx, '封地、外交、赏罚，都从这张案上出去。', PAD, 116, { size: 16, color: '#8a8070' });

    const owned = st.world.sites.filter(function (s) { return s.playerOwned && s.type !== 'camp'; });
    const selfOwned = owned.filter(function (s) { return stateLib.siteSelfFief(st, s); });
    const taxed = selfOwned.reduce(function (sum, s) { return sum + stateLib.fiefTaxFor(s); }, 0);
    panel(ctx, PAD, 170, w - PAD * 2, 104, { fill: '#201a14' });
    text(ctx, '直辖 ' + selfOwned.length + ' 处 · 每周税赋 ' + taxed + ' 金钱', PAD + 18, 190, {
      size: 22, color: taxed > 0 ? '#f0c060' : '#8a8070',
    });
    text(ctx, '封臣 ' + owned.filter(function (s) { return !!stateLib.siteLord(st, s); }).length +
      ' 处；一位领主最多一处封地。', PAD + 18, 228, { size: 16, color: '#a2947a' });

    let y = 310;
    app.ui.button(ctx, PAD, y, w - PAD * 2, 112, '', {
      id: 'gov_fief', fill: '#33291d', onTap: function () {
        app.push('fief', { siteId: site.id });
      },
    });
    text(ctx, '封地分配', PAD + 26, y + 22, { size: 30, color: '#efe3c6' });
    text(ctx, '把城与村封给领主，或收归自己直辖；每位领主最多一处。', PAD + 26, y + 68, {
      size: 17, color: '#a2947a',
    });
    text(ctx, '点将 →', w - PAD - 24, y + 38, { size: 18, align: 'right', color: '#f0c060' });
    y += 132;

    app.ui.button(ctx, PAD, y, w - PAD * 2, 112, '', {
      id: 'gov_diplo', fill: '#2f2920', onTap: function () {
        app.top().scene.view = 'diplo';
        app.top().scene.page = 0;
      },
    });
    text(ctx, '外交 · 战与和', PAD + 26, y + 22, { size: 30, color: '#efe3c6' });
    text(ctx, '向列国递战书，或花金钱把仗停下来。杀过对方将领，议和会更难。', PAD + 26, y + 68, {
      size: 17, color: '#a2947a',
    });
    text(ctx, '列国 →', w - PAD - 24, y + 38, { size: 18, align: 'right', color: '#f0c060' });
    y += 132;

    text(ctx, '政务不需要等候，点下去就生效；封地税每七天结算一次。', PAD, y + 6, {
      size: 15, color: '#8a8070',
    });

    app.ui.button(ctx, PAD, h - 96, w - PAD * 2, 68, '返回城池', {
      id: 'gov_back', size: 23, fill: '#241c14', onTap: function () { app.pop(); },
    });
  },

  renderDiplomacy(app, ctx, w, h, site, st) {
    text(ctx, '外交 · 战与和', PAD, 26, { size: 42, color: '#f0c060' });
    text(ctx, '宣战只需一纸战书；议和要赔款。杀过对方的人，一个月内谈不成，之后赔款翻倍。',
      PAD, 82, { size: 16, color: '#8a8070' });

    const ids = Object.keys(FACTIONS).filter(function (id) {
      return id !== 'bandit' && id !== (st.player.faction || 'player');
    });
    const y0 = 140;
    const viewTop = y0;
    const viewBottom = h - 152;
    const viewH = Math.max(120, viewBottom - viewTop);
    const contentH = ids.length * (DIPLO_ROW_H + DIPLO_GAP);
    const maxScroll = Math.max(0, contentH - viewH);
    this.scrollMax = maxScroll;
    this.scroll = Math.max(0, Math.min(maxScroll, this.scroll || 0));

    if (!ids.length) {
      text(ctx, '天下已经没有可以谈的人了。', PAD, 180, { size: 20, color: '#a2947a' });
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, viewTop, w, viewH);
    ctx.clip();
    ids.forEach(function (id, i) {
      const y = y0 + i * (DIPLO_ROW_H + DIPLO_GAP) - (app.top().scene.scroll || 0);
      if (y < viewTop - DIPLO_ROW_H || y > viewBottom + DIPLO_ROW_H) return;
      const fac = FACTIONS[id];
      const fs = st.factionState[id] || {};
      const rel = stateLib.relationOf(st, id);
      const atWar = stateLib.atWarWith(st, id);
      app.ui.button(ctx, PAD, y, w - PAD * 2, DIPLO_ROW_H, '', {
        id: 'gov_fac_' + id, fill: atWar ? '#3a2418' : '#241c14',
        onTap: function () {
          app.top().scene.choice = id;
          app.top().scene.view = 'choice';
        },
      });
      ctx.fillStyle = fac.color;
      ctx.fillRect(PAD, y, 6, DIPLO_ROW_H);
      text(ctx, fac.full, PAD + 20, y + 14, { size: 26, color: '#efe3c6' });
      text(ctx, fac.name + ' · 关系 ' + rel + (fs.dead ? ' · 已亡' : ''),
        PAD + 20, y + 52, { size: 16, color: fs.dead ? '#6a6050' : '#a2947a' });
      text(ctx, atWar ? '交战中' : fs.dead ? '已亡' : '和平',
        w - PAD - 20, y + 22, { size: 18, align: 'right', color: atWar ? '#d06a4a' : fs.dead ? '#6a6050' : '#8fbf7a' });
      const terms = atWar ? stateLib.peaceTerms(st, id) : null;
      text(ctx, terms && terms.ok ? '议和 ' + terms.cost + ' 金钱'
        : terms && terms.waitDays ? '血债未消 · 等 ' + terms.waitDays + ' 天'
          : '点开 →', PAD + 20, y + 84, { size: 15, color: '#8a8070' });
    });
    ctx.restore();

    if (maxScroll > 0) {
      const trackH = viewH;
      ctx.fillStyle = 'rgba(80,66,46,0.35)';
      ctx.fillRect(w - 8, y0, 4, trackH);
      const thumbH = Math.max(34, trackH * (viewH / contentH));
      const thumbY = y0 + (trackH - thumbH) * (this.scroll / maxScroll);
      ctx.fillStyle = '#8a7448';
      ctx.fillRect(w - 8, thumbY, 4, thumbH);
      text(ctx, '滚轮 / 上下拖动查看全部列国', PAD, h - 148, {
        size: 14, color: '#8a8070',
      });
    } else {
      text(ctx, '两国交兵，先看清关系与血债，再递战书或谈和。', PAD, h - 148, {
        size: 14, color: '#8a8070',
      });
    }

    app.ui.button(ctx, PAD, h - 96, w - PAD * 2, 68, '返回政务', {
      id: 'gov_diplo_back', size: 23, fill: '#241c14', onTap: function () {
        app.top().scene.view = 'main';
      },
    });
  },

  renderChoice(app, ctx, w, h, site, st) {
    const id = this.choice;
    const fac = FACTIONS[id];
    if (!fac) {
      app.top().scene.view = 'diplo';
      return;
    }
    const fs = st.factionState[id] || {};
    const rel = stateLib.relationOf(st, id);
    const atWar = stateLib.atWarWith(st, id);
    const terms = atWar ? stateLib.peaceTerms(st, id) : null;
    const killDay = st.killRecords ? st.killRecords[id] : null;

    text(ctx, fac.full, PAD, 26, { size: 42, color: fac.color });
    text(ctx, fac.name + (fs.dead ? ' · 已亡' : ''), PAD, 82, { size: 19, color: '#a2947a' });
    text(ctx, '关系 ' + rel, PAD, 132, { size: 24, color: rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#c9bda2' });
    bar(ctx, PAD, 172, w - PAD * 2, 10, (rel + 100) / 200, rel < -25 ? '#d06a4a' : '#8fbf7a');

    panel(ctx, PAD, 214, w - PAD * 2, 160, { fill: '#201a14' });
    text(ctx, atWar ? '你们正在交战。' : fs.dead ? '这个势力已经灭了。' : '你们暂时相安无事。', PAD + 18, 234, {
      size: 20, color: atWar ? '#d06a4a' : '#c9bda2',
    });
    if (terms && terms.forever) {
      text(ctx, '你斩了他们的君主：这一家与你永世不议和，文书递进去也会被烧掉。',
        PAD + 18, 278, { size: 17, color: '#d06a4a' });
    } else if (killDay) {
      const passed = st.clock.day - killDay;
      text(ctx, passed < 30
        ? '你杀过对方的将领，血债未满一个月：议和会被驳回（还剩 ' + (30 - passed) + ' 天）。'
        : '血债已过一个月。对方愿意谈，但赔款要按双倍算。',
        PAD + 18, 278, { size: 17, color: '#c9a05a' });
    } else {
      text(ctx, '没有杀将旧账；议和只按关系和赔款谈。', PAD + 18, 278, {
        size: 17, color: '#8a8070',
      });
    }
    if (terms && terms.ok) {
      text(ctx, '议和赔款：' + terms.cost + ' 金钱（现有 ' + st.player.gold + '）', PAD + 18, 322, {
        size: 18, color: st.player.gold >= terms.cost ? '#f0c060' : '#d06a4a',
      });
    } else if (terms && terms.waitDays) {
      text(ctx, '议和驳回：还需等 ' + terms.waitDays + ' 天。', PAD + 18, 322, {
        size: 18, color: '#d06a4a',
      });
    }

    let y = 414;
    if (atWar) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, 92,
        terms && terms.ok ? '议和 · 支付 ' + terms.cost + ' 金钱' : '议和（暂不可）', {
          id: 'gov_peace', size: 25, fill: '#26372a',
          disabled: !(terms && terms.ok) || st.player.gold < terms.cost,
          onTap: function () {
            const r = stateLib.makePeaceWith(st, id);
            app.showToast(r.msg, 3.4);
            if (r.ok) {
              app.top().scene.view = 'diplo';
              app.top().scene.page = 0;
            }
          },
        });
      y += 112;
      text(ctx, terms && terms.ok ? '赔款一交，边关的鼓角就停。' : '对方还没有消气。',
        PAD, y, { size: 15, color: '#8a8070' });
    } else if (!fs.dead) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, 92, '向' + fac.full + '宣战', {
        id: 'gov_war', size: 26, fill: '#3a2018',
        onTap: function () {
          const r = stateLib.declareWarFaction(st, id);
          app.showToast(r.msg, 3.4);
          if (r.ok) {
            app.top().scene.view = 'diplo';
            app.top().scene.page = 0;
          }
        },
      });
      y += 112;
      text(ctx, '战书递出去就生效；对方会立刻把你当敌人。', PAD, y, { size: 15, color: '#8a8070' });
    } else {
      text(ctx, '亡国的旗已经收了，没有可谈的人。', PAD, y, { size: 19, color: '#6a6050' });
    }

    app.ui.button(ctx, PAD, h - 96, w - PAD * 2, 68, '返回列国', {
      id: 'gov_choice_back', size: 23, fill: '#241c14', onTap: function () {
        app.top().scene.view = 'diplo';
      },
    });
  },

  onTouchStart(app, x, y) {
    if (this.view !== 'diplo') return;
    this.drag = { y: y, scroll: this.scroll || 0, moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (this.view !== 'diplo' || !this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 5) this.drag.moved = Math.abs(dy);
    if (this.drag.moved > 5) {
      app.ui.pressed = null;
      this.scroll = Math.max(0, Math.min(this.scrollMax || 0, this.drag.scroll - dy));
    }
  },

  onTouchEnd() {
    this.drag = null;
  },

  onWheel(app, dy) {
    if (this.view !== 'diplo') return;
    this.scroll = Math.max(0, Math.min(this.scrollMax || 0, (this.scroll || 0) + dy));
  },
};

module.exports = GovernScene;

  };

  /* js/scenes/shop.js */
  __defs[30] = function (module, exports, __require) {
/**
 * 局内商店：看一段军情广告，领两支天机简。
 * 每日上限 5 次（共 10 支），由 state.adShiInfo 记录，跨天自动重置。
 * 广告 SDK 尚未接入：runtime.showRewardedAd 已留好接口，浏览器里模拟观看。
 */

const { text, panel, wrap } = __require(6);
const stateLib = __require(7);

const PAD = 20;

const ShopScene = {
  enter(app) {
    this.busy = false;
    this.msg = '军情广告 · 看一段，领两支天机简。';
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#160f0a');
    grad.addColorStop(0.55, '#241812');
    grad.addColorStop(1, '#0d0907');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 摊子上的一盏灯
    const glow = ctx.createRadialGradient(w / 2, 250, 20, w / 2, 250, 340);
    glow.addColorStop(0, 'rgba(240,160,60,0.28)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    text(ctx, '商店', PAD, 30, { size: 44, color: '#f0c060' });
    text(ctx, '军情广告换天机 · 只记在当前存档 · 每天最多 5 次', PAD, 90, { size: 18, color: '#a2947a' });

    panel(ctx, PAD, 140, w - PAD * 2, 250, { fill: 'rgba(36,26,18,0.94)' });
    text(ctx, '天机简', PAD + 24, 162, { size: 28, color: '#d9a441' });
    const p = st ? st.player : null;
    text(ctx, p ? '军帐中现有 ' + p.shi + ' 支' : '还没有军帐：先开一局，天机简才记在你名下。',
      PAD + 24, 208, { size: 18, color: p ? '#e6dbc2' : '#8a8070' });
    const intro = '每一支能在战局里写下一句话：南风起、风止、名册。'
      + '风止只压敌军的攻势，不会反过来削自己的兵。';
    const ls = wrap(ctx, intro, w - PAD * 2 - 48, 17);
    ls.slice(0, 3).forEach(function (l, i) {
      text(ctx, l, PAD + 24, 244 + i * 26, { size: 16, color: '#a2947a' });
    });
    text(ctx, '广告 SDK 尚未接入；浏览器里会模拟一次观看，先走通流程。', PAD + 24, 330, {
      size: 14, color: '#6a6050',
    });

    const info = st ? stateLib.adShiInfo(st) : { max: 5, used: 0, left: 0, shiPer: 2 };
    text(ctx, '今日可领 ' + info.left + ' / ' + info.max + ' 次 · 每次 ' + info.shiPer + ' 支',
      PAD, 420, { size: 20, color: info.left > 0 ? '#8fbf7a' : '#d06a4a' });
    text(ctx, '当前存档已领 ' + (info.used * info.shiPer) + ' 支；明日重新计数。', PAD, 456, {
      size: 16, color: '#8a8070',
    });
    text(ctx, '换一个存档，这份次数从零开始。', PAD, 482, { size: 14, color: '#6a6050' });

    const can = !!st && info.left > 0 && !this.busy;
    app.ui.button(ctx, PAD, 520, w - PAD * 2, 108,
      this.busy ? '正在拉取军情…' : (info.left > 0 ? '看军情 · 领 2 支天机简' : '今日已领完'), {
        id: 'shop_ad', size: 27, fill: '#3a2c1e', disabled: !can, onTap: function () {
          if (app.state !== st || !st) return;
          app.top().scene.busy = true;
          app.showToast('正在拉取军情广告…', 1.6);
          app.runtime.showRewardedAd(function (ok, err) {
            const scene = app.top() && app.top().scene;
            if (scene) scene.busy = false;
            if (!ok) {
              app.showToast(err === 'web-sim' ? '广告没看完，天机简没领到。'
                : ('广告暂时不可用：' + (err || '平台未配置广告位')), 3);
              return;
            }
            const r = stateLib.claimAdShi(app.state);
            app.showToast(r.msg, 3);
          });
        },
      });
    text(ctx, this.msg, PAD, 642, { size: 15, color: '#8a8070' });

    app.ui.button(ctx, PAD, h - 96, w - PAD * 2, 68, '返回', {
      id: 'shop_back', size: 24, fill: '#241c14', onTap: function () {
        if (app.top() && app.top().name === 'shop') app.pop();
      },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ShopScene;

  };

  /* js/scenes/battle.js */
  __defs[31] = function (module, exports, __require) {
/**
 * 战斗场景：战前选战术 → 回合自动推进 → 结算
 * 战中可落一笔天机简（南风起 / 风止 / 名册）
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { TROOPS } = __require(10);
const { TACTICS, TACTIC_LIST } = __require(16);
const { HISTORY_MARKS, CAMPAIGN, FACTIONS } = __require(5);
const { drawBackdrop } = __require(25);

/** 打完/撤出后一路退回地图，不在城门口再被弹一次 */
function backToMap(app) {
  let guard = 0;
  while (app.stack.length > 1 && guard++ < 4) {
    const t = app.top();
    if (!t) break;
    if (t.name === 'map') break;
    if (t.name === 'town' || t.name === 'lord' || t.name === 'battle' || t.name === 'chapter' ||
        t.name === 'contact') {
      app.pop();
      continue;
    }
    break;
  }
}

function boxTitle(app) {
  const bv = app.battleView;
  const b = app.state.battle;
  if (!b) return '战斗';
  const ctx = b.context || {};
  if (ctx.kind === 'campaign') {
    if (ctx.campaignId === 'act2') return '乌巢夜袭';
    if (ctx.campaignId === 'act4') return '赤壁 · 火烧连环船';
    if (ctx.campaignId === 'act5') return '夷陵 · 破连营';
    if (ctx.campaignId === 'final') return '终幕 · 定稿之战';
    return '战役';
  }
  if (ctx.kind === 'siege') return '攻城 · ' + ctx.siteName;
  if (ctx.kind === 'lord') return '遭遇 · ' + ctx.lordName;
  if (ctx.kind === 'chase') return '逃 · 过桥';
  return '遭遇战';
}

function subTitle(app) {
  const b = app.state.battle;
  if (!b) return '';
  const ctx = b.context || {};
  if (ctx.kind === 'campaign') {
    const ch = CAMPAIGN.filter(function (c) { return c.id === ctx.campaignId; })[0];
    return ch ? ch.goal : '';
  }
  if (ctx.kind === 'siege') return '城头守军已经上墙。';
  if (ctx.kind === 'lord') return '对面是成名的将领，别当他是山贼。';
  if (ctx.kind === 'chase') return '目标不是赢，是带人跑过去。';
  return '刀已经出鞘。';
}

const BattleScene = {
  enter(app, params) {
    // 上一场没处置的败将不跨战斗残留
    if (!params || !params.keepPostBattle) app.state.postBattleLord = null;
    app.battleView = {
      phase: 'prep',
      timer: 0,
      tactic: 'assault',
      shiOpen: false,
      summary: null,
      mode: (params || {}).mode || 'party',
    };
  },

  update(app, dt) {
    const bv = app.battleView;
    const b = app.state.battle;
    if (!b) {
      // 结算页要留着，别一闪而过
      if (bv && bv.summary) return;
      app.pop();
      return;
    }
    if (bv.phase === 'fight') {
      // 天机简面板一开，决斗就按住不动，等玩家落笔或取消。
      if (bv.shiOpen) return;
      bv.timer += dt;
      if (bv.timer >= 0.6) {
        bv.timer = 0;
        if (!b.finished && !b.batchDone) b.step();
      }
      if (b.finished) {
        bv.summary = stateLib.resolveBattle(app.state, b);
        bv.phase = 'result';
      } else if (b.batchDone) {
        bv.summary = b.interimSummary();
        bv.phase = 'interim';
      }
    }
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const bv = app.battleView;
    const b = app.state.battle;
    if (!b) {
      // 仗打完了（state.battle 已清），照样把结果画出来
      if (bv && bv.summary) {
        ctx.fillStyle = '#14100c';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1c1712';
        ctx.fillRect(0, 0, w, 120);
        ctx.fillStyle = '#3a2c1e';
        ctx.fillRect(0, 118, w, 3);
        text(ctx, '战果', w / 2, 26, { size: 36, align: 'center', color: '#f0c060' });
        text(ctx, '认这一战，或者退回开打之前', w / 2, 76, {
          size: 17, align: 'center', color: '#a2947a',
        });
        renderResult(app, bv.summary, w, h, h * 0.30);
      }
      return;
    }

    // 战场背景：烟尘、残旗与枪林，再压一层暗色保证字看得清
    drawBackdrop(ctx, 'battle', w, h, (b.context && b.context.siteId ? b.context.siteId.length : 0) + 9);
    ctx.fillStyle = 'rgba(12,9,7,0.72)';
    ctx.fillRect(0, 0, w, h);

    // 矮屏（桌面窗口）与大屏（手机竖屏）两套排法，按钮永远在屏幕里
    const compact = h < 720;
    const fire = b.fireGround;
    const headH = compact ? 104 : 160;
    ctx.fillStyle = fire ? '#2e1810' : '#1c1712';
    ctx.fillRect(0, 0, w, headH);
    ctx.fillStyle = fire ? '#d0662a' : '#3a2c1e';
    ctx.fillRect(0, headH - 2, w, 4);
    text(ctx, boxTitle(app), w / 2, compact ? 16 : 34, {
      size: compact ? 30 : 40, align: 'center', color: fire ? '#ffb066' : '#f0c060',
    });
    const sub = subTitle(app);
    if (sub) text(ctx, sub, w / 2, compact ? 56 : 92, {
      size: compact ? 15 : 18, align: 'center', color: '#a2947a',
    });
    if (fire) text(ctx, '火攻', w - 20, 10, { size: 16, align: 'right', color: '#ff8f4a' });
    if (b.shiName) text(ctx, '天机简 · ' + b.shiName, 20, 10, { size: 16, color: '#c9a0e0' });

    const a = b.a;
    const bb = b.b;
    const y1 = compact ? 112 : 190;
    const y2 = compact ? 190 : 300;
    drawSide(ctx, w, y1, a, '我方', '#6f9fd8', true);
    drawSide(ctx, w, y2, bb, '敌方', '#d07060', false);

    if (!compact) {
      drawTroopRow(ctx, w, 430, a.troops, a.initialTroops, '#5a8fd0', 1);
      drawTroopRow(ctx, w, 520, bb.troops, bb.initialTroops, '#c05a4a', -1);
      text(ctx, 'VS', w / 2, 470, { size: 30, align: 'center', color: '#6a6050' });
    }

    const logY = compact ? y2 + 92 : 590;
    if (bv.phase === 'fight') {
      text(ctx, '战报', 16, logY, { size: compact ? 17 : 20, color: '#a2947a' });
      const recent = b.log.slice(compact ? -2 : -4);
      recent.forEach(function (e, i) {
        const y = logY + (compact ? 26 : 34) + i * (compact ? 28 : 34);
        text(ctx, '第' + e.round + '轮', 16, y, { size: 15, color: '#8a8070' });
        text(ctx, '我 ' + e.aLossText, 90, y, { size: compact ? 15 : 18, color: '#9fb8d8' });
        text(ctx, '敌 ' + e.bLossText, 380, y, { size: compact ? 15 : 18, color: '#d8a09f' });
      });
    }

    // 底部
    const bottom = compact ? Math.max(y2 + 96, h - 232) : Math.max(778, h - 486);
    if (bv.phase === 'prep') {
      if (compact) {
        text(ctx, '选一个打法', 16, bottom - 30, { size: 18, color: '#a2947a' });
        // 矮屏：四个打法排一行，不占两行高
        const bw4 = (w - 32 - 24) / 4;
        TACTIC_LIST.forEach(function (id, i) {
          const t = TACTICS[id];
          const active = bv.tactic === id;
          app.ui.button(ctx, 16 + i * (bw4 + 8), bottom, bw4, 54, t.name, {
            id: 'tac_' + id, size: 20,
            fill: active ? '#4a3620' : '#241c14',
            border: active ? UI_COLORS.accent : UI_COLORS.border,
            onTap: function () { bv.tactic = id; },
          });
        });
        const dline = wrap(ctx, TACTICS[bv.tactic].desc, w - 32, 15)[0] || '';
        text(ctx, dline, 16, bottom + 62, { size: 15, color: '#a2947a' });
      } else {
        // 桌面/高屏：2×2 打法在上，撤离 / 天机简 / 开战贴底，互不压字。
        const actionY = h - 90;
        const tacH = 54;
        const row2 = actionY - 12 - tacH;
        const row1 = row2 - (tacH + 6);
        text(ctx, '选一个打法', 16, row1 - 66, { size: 18, color: '#a2947a' });
        const dline = wrap(ctx, TACTICS[bv.tactic].desc, w - 32, 15).slice(0, 1)[0] || '';
        text(ctx, dline, 16, row1 - 24, { size: 15, color: '#a2947a' });
        TACTIC_LIST.forEach(function (id, i) {
          const t = TACTICS[id];
          const bx = 16 + (i % 2) * (w / 2 - 8);
          const by = row1 + Math.floor(i / 2) * (tacH + 6);
          const active = bv.tactic === id;
          app.ui.button(ctx, bx, by, w / 2 - 24, tacH, t.name, {
            id: 'tac_' + id, size: 22,
            fill: active ? '#4a3620' : '#241c14',
            border: active ? UI_COLORS.accent : UI_COLORS.border,
            onTap: function () { bv.tactic = id; },
          });
        });
      }

      // 战前也能走：撤离不算撤退伤亡，退开之后对方一时短时间贴不上来
      if (compact) {
        text(ctx, '不想打就撤离：不损一兵，退开后对方短时间贴不上来。', 16, h - 128, {
          size: 14, color: '#8fbf7a',
        });
      }
      if (compact) {
        const bw3 = (w - 32 - 16) / 3;
        app.ui.button(ctx, 16, h - 92, bw3, 74, '撤离', {
          id: 'leave', size: 22, fill: '#241c14', onTap: function () {
            stateLib.afterRetreat(app.state, b.context);
            app.state.battle = null;
            backToMap(app);
            app.showToast('你退离了战场。', 2);
          },
        });
        app.ui.button(ctx, 16 + bw3 + 8, h - 92, bw3, 74,
          '天机简 ×' + app.state.player.shi, {
          id: 'pre_shi', size: 16, fill: '#3a2438',
          disabled: app.state.player.shi <= 0 || !!b.shiMark,
          onTap: function () { bv.shiOpen = true; },
        });
        app.ui.button(ctx, 16 + (bw3 + 8) * 2, h - 92, bw3, 74, '开战', {
          id: 'go', size: 24, fill: '#4a2a1a', onTap: function () {
            b.setTactic(bv.tactic);
            bv.phase = 'fight';
            bv.timer = 0;
          },
        });
      } else {
        app.ui.button(ctx, 16, h - 90, 100, 78, '撤离', {
          id: 'leave', size: 24, fill: '#241c14', onTap: function () {
            stateLib.afterRetreat(app.state, b.context);
            app.state.battle = null;
            backToMap(app);
            app.showToast('你退离了战场。', 2);
          },
        });
        app.ui.button(ctx, 124, h - 90, 112, 78,
          '天机简 ×' + app.state.player.shi, {
          id: 'pre_shi', size: 16, fill: '#3a2438',
          disabled: app.state.player.shi <= 0 || !!b.shiMark,
          onTap: function () { bv.shiOpen = true; },
        });
        app.ui.button(ctx, 244, h - 90, w - 260, 78, '开战', {
          id: 'go', size: 28, fill: '#4a2a1a', onTap: function () {
            b.setTactic(bv.tactic);
            bv.phase = 'fight';
            bv.timer = 0;
          },
        });
      }
    } else if (bv.phase === 'fight') {
      // 打起来了也能走：撤离不损兵，撤退要留人殿后
      const byy = compact ? h - 150 : h - 190;
      const bh = compact ? 66 : 74;
      const bw = (w - 32 - 24) / 3;
      app.ui.button(ctx, 16, byy, bw, bh, '撤离', {
        id: 'b_flee', size: compact ? 22 : 26, fill: '#2a3320', onTap: function () {
          stateLib.afterRetreat(app.state, b.context);
          app.state.battle = null;
          backToMap(app);
          app.showToast('你带人从阵后撤出，不损一兵。', 2);
        },
      });
      app.ui.button(ctx, 16 + bw + 12, byy, bw, bh, '天机简 ×' + app.state.player.shi, {
        id: 'shi', size: compact ? 19 : 22, fill: '#3a2438', disabled: app.state.player.shi <= 0 || !!b.shiMark, onTap: function () {
          bv.shiOpen = true;
        },
      });
      app.ui.button(ctx, 16 + (bw + 12) * 2, byy, bw, bh, '撤退', {
        id: 'retreat', size: compact ? 22 : 26, fill: '#241c14', onTap: function () {
          b.retreat();
          bv.summary = stateLib.resolveBattle(app.state, b);
          bv.phase = 'result';
        },
      });
      text(ctx, '撤离不损兵 · 撤退要留一成殿后', 16, byy + bh + 8, { size: 15, color: '#8fbf7a' });
      text(ctx, b.shiMark ? '本战已落笔：' + b.shiName : '每 12 轮为一战 · 未分胜负可再战', 16, byy + bh + 32, {
        size: 15, color: b.shiMark ? '#c9a0e0' : '#8a8070',
      });
    } else if (bv.phase === 'interim') {
      renderInterim(app, bv.summary, w, h, b);
    } else {
      renderResult(app, bv.summary, w, h);
    }

    if (bv.shiOpen) renderShi(app, w, h, b);
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

function drawSide(ctx, w, y, side, label, color, isPlayer) {
  const ratio = side.initialCount ? army.troopCount(side.troops) / side.initialCount : 0;
  text(ctx, label, 16, y, { size: 17, color: '#8a8070' });
  text(ctx, side.name, 16, y + 22, { size: 26, color: color });
  const n = army.troopCount(side.troops);
  text(ctx, n + ' / ' + side.initialCount + ' 人', w - 16, y + 24, { size: 22, align: 'right', color: '#efe3c6' });
  bar(ctx, 16, y + 60, w - 32, 12, ratio, isPlayer ? UI_COLORS.blue : UI_COLORS.danger);
  // 兵种构成
  const str = Object.keys(side.initialTroops).map(function (id) {
    return (TROOPS[id] ? TROOPS[id].name : id) + ' ' + side.initialTroops[id];
  }).join(' · ');
  text(ctx, str, 16, y + 76, { size: 15, color: '#8a8070' });
}

function drawTroopRow(ctx, w, y, troops, initial, color, dir) {
  const count = army.troopCount(troops);
  const total = army.troopCount(initial) || 1;
  const shown = Math.max(0, Math.min(12, Math.round(count / Math.max(1, total) * 12)));
  const gap = (w - 120) / 12;
  for (let i = 0; i < shown; i++) {
    const x = 60 + i * gap + (dir > 0 ? 0 : 0);
    // 简单小人：头 + 身 + 枪
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 10, 16);
    ctx.fillRect(x + 2, y - 8, 6, 6);
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(x + 4, y + 16, 2, 8);
    ctx.fillRect(x + 8, y + 16, 2, 8);
    ctx.fillStyle = '#cfd3da';
    ctx.fillRect(x + 12, y - 12, 2, 26);
  }
  if (shown === 0) {
    text(ctx, '无人', w / 2, y, { size: 18, align: 'center', color: '#6a6050' });
  }
}

function renderInterim(app, sum, w, h, b) {
  const ctx = app.runtime.ctx;
  if (!sum || !b) return;
  text(ctx, '未分胜负', 16, h - 238, { size: 40, color: '#e0b060' });
  text(ctx, '第 ' + sum.round + ' 轮 · 第 ' + sum.batch + ' 阵结束', 16, h - 192, {
    size: 18, color: '#a2947a',
  });
  text(ctx, '我方 ' + sum.remainA + ' / ' + sum.initialA + '　敌方 ' + sum.remainB + ' / ' + sum.initialB,
    16, h - 160, { size: 20, color: '#d8c8a6' });
  text(ctx, '还有兵，这仗就没完。再打 12 轮，直到一方兵力归零才结算缴获。', 16, h - 126, {
    size: 16, color: '#8fbf7a',
  });

  const gap = 12;
  const leftW = Math.round((w - 32 - gap) * 0.62);
  const rightW = w - 32 - gap - leftW;
  app.ui.button(ctx, 16, h - 96, leftW, 76, '再战 12 轮', {
    id: 'b_next', size: 26, fill: '#4a2a1a', onTap: function () {
      if (!b.nextBatch()) return;
      app.battleView.summary = null;
      app.battleView.phase = 'fight';
      app.battleView.timer = 0;
    },
  });
  app.ui.button(ctx, 16 + leftW + gap, h - 96, rightW, 76, '撤退', {
    id: 'b_retreat', size: 24, fill: '#241c14', onTap: function () {
      b.retreat();
      app.battleView.summary = stateLib.resolveBattle(app.state, b);
      app.battleView.phase = 'result';
    },
  });
}

function renderResult(app, sum, w, h, y0Top) {
  const ctx = app.runtime.ctx;
  const y0 = y0Top || (h * 0.30);
  if (!sum) return;
  const pending = app.state.postBattleLord;

  const win = sum.result === 'win';
  const retreat = sum.result === 'retreat';
  const color = win ? '#8fbf7a' : retreat ? '#c9bda2' : '#d07060';
  const label = win ? '胜' : retreat ? '撤退' : '败';

  text(ctx, label, 16, y0, { size: 46, color });
  text(ctx, '共 ' + sum.round + ' 轮 · ' + sum.batch + ' 阵打完', 120, y0 + 12, { size: 18, color: '#a2947a' });
  text(ctx, '我方 ' + sum.remainA + ' / ' + sum.initialA, 16, y0 + 58, { size: 20, color: '#9fb8d8' });
  text(ctx, '敌方 ' + sum.remainB + ' / ' + sum.initialB, 16, y0 + 88, { size: 20, color: '#d8a09f' });
  if (win) text(ctx, '缴获 ' + sum.loot + ' 金钱', 16, y0 + 122, { size: 22, color: '#f0c060' });
  if (sum.duelNote) text(ctx, sum.duelNote, 16, y0 + (win ? 150 : 122), {
    size: 18, color: String(sum.duelNote).indexOf('斩') >= 0 ? '#d07060' : '#c9bda2',
  });
  if (sum.shiMark) text(ctx, '天机简「' + sum.shiName + '」已生效', 16, y0 + 178, { size: 17, color: '#c9a0e0' });

  if (pending) {
    panel(ctx, 16, h - 300, w - 32, 190, { fill: 'rgba(42,30,20,0.94)' });
    text(ctx, '阵前跪着 ' + pending.name, 36, h - 280, { size: 26, color: '#f0c060' });
    text(ctx, pending.arcNoCapture
      ? '天下皆反。他是反贼，不能招降，也不能生擒；只能放他回去。'
      : '野战不杀人。你可以放他回去，也可以押进牢里，之后再招降或斩。', 36, h - 242, {
      size: 16, color: '#c9bda2',
    });
    const gap = 12;
    const bw = pending.arcNoCapture ? (w - 32) : (w - 32 - 24 - gap) / 2;
    const by = h - 186;
    app.ui.button(ctx, 16, by, bw, 68, '放他回去', {
      id: 'lord_release', size: 24, fill: '#2a3320', onTap: function () {
        const r = stateLib.resolveDefeatedLord(app.state, 'release');
        app.showToast(r.msg, 3);
        if (r.ok) {
          sum.duelNote = r.note;
          sum.postBattleLord = false;
        }
      },
    });
    if (!pending.arcNoCapture) app.ui.button(ctx, 16 + bw + gap, by, bw, 68, '押进牢里', {
      id: 'lord_capture', size: 24, fill: '#3a2418', onTap: function () {
        const r = stateLib.resolveDefeatedLord(app.state, 'capture');
        app.showToast(r.msg, 3);
        if (r.ok) {
          sum.duelNote = r.note;
          sum.postBattleLord = false;
        }
      },
    });
  }

  // 打完可以认账，也可以退到开打前那份快照
  const preKey = 'bw_pre_v4';
  const hasPre = !!app.runtime.storage.get(preKey);
  const gap = 12;
  const leftW = Math.round((w - 32 - gap) * 0.58);
  const rightW = w - 32 - gap - leftW;

  app.ui.button(ctx, 16, h - 96, leftW, 76, pending ? '先处置败将' : '继续', {
    id: 'cont', size: 27, fill: '#33271b', disabled: !!pending, onTap: function () {
      if (pending) {
        app.showToast('先决定阵前跪着的人怎么处置。', 2);
        return;
      }
      if (app.state.gameOver) {
        app.replace('ending');
      } else {
        backToMap(app);
      }
    },
  });
  app.ui.button(ctx, 16 + leftW + gap, h - 96, rightW, 76, hasPre ? '退回战前' : '退回战前（空）', {
    id: 'rollback', size: 22, fill: '#3a2418', disabled: !hasPre, onTap: function () {
      const loaded = stateLib.deserialize(app.runtime.storage.get(preKey));
      if (!loaded) {
        app.showToast('战前快照读不出来。', 2);
        return;
      }
      app.state = loaded;
      app.replace('map');
      app.showToast('回到开战之前。', 2);
    },
  });
}

function renderShi(app, w, h, b) {
  const ctx = app.runtime.ctx;
  ctx.fillStyle = 'rgba(8,6,4,0.94)';
  ctx.fillRect(0, 0, w, h);
  text(ctx, '落一笔天机简', w / 2, 150, { size: 34, align: 'center', color: '#d9a441' });
  text(ctx, '这一笔会留在纸上，天下人也会记住。剩余 ' + app.state.player.shi + ' 支', w / 2, 200, {
    size: 17, align: 'center', color: '#a2947a',
  });

  let y = 250;
  Object.keys(HISTORY_MARKS).forEach(function (id) {
    const m = HISTORY_MARKS[id];
    panel(ctx, 24, y, w - 48, 150, { fill: '#241c14' });
    text(ctx, m.name, 48, y + 18, { size: 30, color: '#d9a441' });
    text(ctx, m.desc, 48, y + 62, { size: 17, color: '#c9bda2' });
    text(ctx, '“' + m.text + '”', 48, y + 96, { size: 15, color: '#8a8070' });
    app.ui.button(ctx, w - 176, y + 70, 132, 60, '落笔', {
      id: 'shi_' + id, size: 22, onTap: function () {
        const r = stateLib.useHistory(app.state, id);
        app.showToast(r.msg, 2);
        app.battleView.shiOpen = false;
      },
    });
    y += 162;
  });

  app.ui.button(ctx, 24, y + 10, w - 48, 70, '收起笔', {
    id: 'shi_close', size: 24, fill: '#241c14', onTap: function () {
      app.battleView.shiOpen = false;
    },
  });
}

module.exports = BattleScene;

  };

  /* js/scenes/contact.js */
  __defs[32] = function (module, exports, __require) {
/**
 * 遭遇页：撞上匪团先看清对面是谁，再决定打还是走。
 * 不再一点碰上就推进战斗画面。
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { TROOPS } = __require(10);
const { BANDIT_TIERS } = __require(12);

function partyOf(app) {
  const d = app.contact;
  if (!d) return null;
  return app.state.parties.filter(function (p) { return p.id === d.partyId; })[0] || null;
}

function compText(troops) {
  return Object.keys(troops || {}).map(function (id) {
    return (TROOPS[id] ? TROOPS[id].name : id) + ' ' + (troops[id] || 0);
  }).join(' · ');
}

const ContactScene = {
  enter(app, params) {
    app.contact = { partyId: (params || {}).partyId };
    // 同一伙人排队的事件一次清掉，免得撤离/开战回来又被弹一遍
    const st = app.state;
    const id = app.contact.partyId;
    if (st && st.events) {
      for (let i = st.events.length - 1; i >= 0; i--) {
        const ev = st.events[i];
        if (ev.type === 'encounter' && ev.partyId === id) st.events.splice(i, 1);
      }
    }
  },

  update(app) {
    const p = partyOf(app);
    if (!p || army.troopCount(p.troops) <= 0) app.pop();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const party = partyOf(app);
    if (!party) return;

    const tier = BANDIT_TIERS[party.banditTier] || BANDIT_TIERS.qing;
    const col = party.color || tier.color;
    const n = army.troopCount(party.troops);
    const mine = army.troopCount(st.player.troops);
    const pPower = army.strength(st.player.troops).power;
    const ePower = army.strength(party.troops).power;

    ctx.fillStyle = '#0d0a07';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(0, 0, w, 190);
    ctx.globalAlpha = 1;

    text(ctx, '遇上', w / 2, 24, { size: 20, align: 'center', color: '#a2947a' });
    text(ctx, party.name || '一伙人', w / 2, 54, { size: 44, align: 'center', color: '#f5e9cf', shadow: true });
    text(ctx, tier.name + ' · ' + tier.rank + ' 级 · ' + n + ' 人', w / 2, 112, {
      size: 20, align: 'center', color: col,
    });
    const desc = wrap(ctx, tier.desc, w - 80, 16);
    desc.slice(0, 2).forEach(function (ln, i) {
      text(ctx, ln, w / 2, 142 + i * 22, { size: 16, align: 'center', color: '#8a8070' });
    });

    // 双方对比
    const y0 = 210;
    const ph = Math.max(200, Math.min(244, h - y0 - 232));
    panel(ctx, 20, y0, w - 40, ph, { fill: '#1b1611' });
    text(ctx, '我方', 36, y0 + 14, { size: 18, color: '#8fb0d8' });
    text(ctx, mine + ' 人', w - 52, y0 + 12, { size: 24, align: 'right', color: '#efe3c6' });
    text(ctx, compText(st.player.troops) || '孤身一人', 36, y0 + 48, { size: 15, color: '#8a8070' });

    text(ctx, '对方', 36, y0 + 84, { size: 18, color: '#d07060' });
    text(ctx, n + ' 人', w - 52, y0 + 82, { size: 24, align: 'right', color: '#efe3c6' });
    text(ctx, compText(party.troops), 36, y0 + 116, { size: 15, color: '#8a8070' });

    // 强弱条
    const total = pPower + ePower || 1;
    bar(ctx, 36, y0 + 150, w - 72, 18, pPower / total, UI_COLORS.blue);
    const verdict = pPower / total;
    text(ctx, verdict > 0.62 ? '这一伙打不过你。' : verdict > 0.48 ? '势均力敌，会死人。' : '对面比你硬，硬打要折人。',
      36, y0 + 178, { size: 18, color: verdict > 0.62 ? '#8fbf7a' : verdict > 0.48 ? '#d9a441' : '#d07060' });
    text(ctx, '打输了会被赶回最近的城，还要倒回一天。', 36, y0 + 206, { size: 15, color: '#8a8070' });

    // 底部按钮
    const by = y0 + ph + 32;
    text(ctx, '撤离不损一兵，退开后他短时间内贴不上来。', 20, by - 34, { size: 16, color: '#8fbf7a' });
    app.ui.button(ctx, 20, by, (w - 52) / 2, 84, '开战', {
      id: 'contact_fight', size: 30, fill: '#4a2a1a', onTap: function () {
        stateLib.startPartyBattle(st, party);
        app.push('battle', { mode: 'party' });
      },
    });
    app.ui.button(ctx, 20 + (w - 52) / 2 + 12, by, (w - 52) / 2, 84, '撤离', {
      id: 'contact_leave', size: 30, fill: '#241c14', onTap: function () {
        stateLib.afterRetreat(st, { partyId: party.id });
        app.pop();
        app.showToast('你带人退开，他们没有追。', 2);
      },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ContactScene;

  };

  /* js/scenes/army.js */
  __defs[33] = function (module, exports, __require) {
/**
 * 队伍页：兵力构成、遣返士兵、随行英雄（点进去能说话）
 * 内容是长列表，可上下拖
 */

const { text, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const armyLib = __require(9);
const heroesLib = __require(14);
const { HERO_MAX_LEVEL } = __require(12);
const { TROOPS } = __require(10);
const { EQUIPMENT } = __require(5);

const TOP = 248;
const BOT = 104;

const ArmyScene = {
  enter(app) {
    app.armyScroll = 0;
    this.scroll = 0;
    this.maxScroll = 0;
    this.contentH = 0;
    this.rows = [];
    this.drag = null;
    this.savedScroll = 0;
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) {
      app.pop();
      return;
    }
    const p = st.player;
    const count = armyLib.troopCount(p.troops);
    const cap = stateLib.capacity(st);
    const hb = heroesLib.heroBonus(st);
    const heroLimit = heroesLib.heroCap(st);

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    // 顶部固定
    text(ctx, '队伍', 20, 24, { size: 36, color: '#f0c060' });
    text(ctx, stateLib.renownTitle(p.renown), w - 20, 34, { size: 18, align: 'right', color: '#a2947a' });

    ctx.fillStyle = '#241c14';
    ctx.fillRect(16, 74, w - 32, 148);
    text(ctx, count + ' / ' + cap, 36, 86, { size: 40, color: '#efe3c6' });
    text(ctx, '人', 200, 106, { size: 18, color: '#8a8070' });
    text(ctx, '两日耗粮 ' + Math.max(1, Math.round(armyLib.foodPerDay(p.troops) * 2 * (1 - hb.foodPct))) +
      ' · 存粮 ' + p.food, 36, 136, {
      size: 17, color: p.food < armyLib.foodPerDay(p.troops) * 6 ? '#d06a4a' : '#a2947a',
    });
    bar(ctx, 16, 162, w - 32, 10, p.morale / 100, p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);
    text(ctx, '士气 ' + p.morale + (hb.morale ? '（英雄 +' + hb.morale + '/日）' : ''), 20, 208, { size: 16, color: '#8a8070' });
    text(ctx, '英雄 ' + (p.heroes || []).length + ' / ' + heroLimit + '（声望 ' + p.renown + '）', w - 20, 208, {
      size: 16, align: 'right', color: (p.heroes || []).length >= heroLimit ? '#d06a4a' : '#8a8070',
    });

    // ---- 滚动区 ----
    this.rows = [];
    const viewH = h - TOP - BOT;
    let y = 0; // 相对坐标
    const rowRects = [];

    y += 6;
    rowRects.push({ kind: 'head', y: y, text: '编制（可遣返）' });
    y += 28;

    const ids = Object.keys(p.troops).filter(function (id) { return p.troops[id] > 0; });
    if (!ids.length) {
      rowRects.push({ kind: 'empty', y: y, text: '（队伍空了，去城里再招些人）' });
      y += 34;
    }
    ids.sort(function (a, b) {
      return (TROOPS[b] ? TROOPS[b].tier : 0) - (TROOPS[a] ? TROOPS[a].tier : 0);
    }).forEach(function (id) {
      const t = TROOPS[id] || { name: id, tier: 1 };
      rowRects.push({ kind: 'troop', y: y, id: id, name: t.name, n: p.troops[id], troop: t });
      y += 62;
    });

    y += 10;
    rowRects.push({ kind: 'head', y: y, text: '随行英雄（点名字说话）' });
    y += 28;
    const list = p.heroes || [];
    if (!list.length) {
      rowRects.push({ kind: 'empty', y: y, text: '（还没有人跟你走）' });
      y += 34;
    }
    list.forEach(function (hh, i) {
      const def = heroesLib.heroById(hh.id) || { name: hh.id };
      const b = heroesLib.bonusOf(hh.id, hh.level);
      rowRects.push({ kind: 'hero', y: y, index: i, name: def.name, level: hh.level, exp: hh.exp, bonus: b });
      y += 66;
    });

    y += 10;
    rowRects.push({ kind: 'head', y: y, text: '队伍加成' });
    y += 28;
    rowRects.push({
      kind: 'bonus', y: y,
      lines: [
        '攻击 +' + (hb.atkPct * 100).toFixed(0) + '%　防御 +' + (hb.defPct * 100).toFixed(0) + '%',
        '行军 +' + (hb.speedPct * 100).toFixed(0) + '%　日耗 -' + (hb.foodPct * 100).toFixed(0) + '%',
        '缴获 +' + (hb.lootPct * 100).toFixed(0) + '%　士气 +' + hb.morale + '/日',
      ],
    });
    y += 76;

    y += 6;
    rowRects.push({ kind: 'head', y: y, text: '装备' });
    y += 28;
    ['blade', 'armor', 'horse'].forEach(function (slot) {
      const eq = EQUIPMENT[slot];
      const tier = eq.tiers[Math.min(p.equip[slot] || 0, eq.tiers.length - 1)];
      rowRects.push({ kind: 'equip', y: y, label: eq.name, value: tier.name });
      y += 34;
    });

    y += 6;
    rowRects.push({ kind: 'shijian', y: y, shi: p.shi, used: p.shiUsed });
    y += 44;

    this.contentH = y + 12;
    this.maxScroll = Math.max(0, this.contentH - viewH);
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll;
    if (this.scroll < 0) this.scroll = 0;
    app.armyScroll = this.scroll;

    // 侧栏滚动条
    if (this.maxScroll > 0) {
      const trackX = w - 8;
      ctx.fillStyle = 'rgba(60,50,38,0.5)';
      ctx.fillRect(trackX, TOP, 4, viewH);
      const bh = Math.max(40, viewH * (viewH / this.contentH));
      const by = TOP + (viewH - bh) * (this.scroll / this.maxScroll);
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(trackX, by, 4, bh);
    }

    const scroll = this.scroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, w, viewH);
    ctx.clip();
    ctx.translate(0, TOP - scroll);

    rowRects.forEach(function (r) {
      const ry = r.y;
      if (ry > scroll + viewH + 40 || ry + 80 < scroll - 20) return;
      if (r.kind === 'head') {
        text(ctx, r.text, 20, ry, { size: 20, color: '#a2947a' });
      } else if (r.kind === 'empty') {
        text(ctx, r.text, 20, ry, { size: 18, color: '#8a8070' });
      } else if (r.kind === 'troop') {
        ctx.fillStyle = 'rgba(36,28,20,0.6)';
        ctx.fillRect(16, ry, w - 32, 54);
        const icon = app.assets.unitIconFor ? app.assets.unitIconFor(r.id, '#8a7a5a') : null;
        if (icon) ctx.drawImage(icon, 30, ry + 13, 30, 30);
        text(ctx, r.name, 68, ry + 8, { size: 22, color: '#efe3c6' });
        text(ctx, '× ' + r.n, w - 160, ry + 10, { size: 22, align: 'right', color: '#f0c060' });
        text(ctx, '攻 ' + (r.troop.atk || 0) + ' 防 ' + (r.troop.def || 0) + ' 粮 ' + (r.troop.food || 1) + ' · T' + (r.troop.tier || 1), 68, ry + 36, {
          size: 15, color: '#8a8070',
        });
        // 遣返按钮
        drawBtn(ctx, w - 126, ry + 12, 48, 32, '遣1', '#5a4a2a');
        drawBtn(ctx, w - 72, ry + 12, 48, 32, '遣5', '#4a3a24');
      } else if (r.kind === 'hero') {
        ctx.fillStyle = 'rgba(36,28,20,0.55)';
        ctx.fillRect(16, ry, w - 32, 58);
        text(ctx, r.name, 32, ry + 9, { size: 21, color: '#efe3c6' });
        text(ctx, 'Lv ' + r.level, w - 24, ry + 10, { size: 19, align: 'right', color: '#f0c060' });
        text(ctx, r.bonus.text || '无加成', 32, ry + 34, { size: 14, color: '#8a8070' });
        const expNeed = r.level >= HERO_MAX_LEVEL ? '满级' : '经验 ' + (r.exp || 0) + '/' + (r.level * heroesLib.EXP_PER_LEVEL);
        text(ctx, expNeed, w - 24, ry + 35, { size: 13, align: 'right', color: '#6a6355' });
      } else if (r.kind === 'bonus') {
        ctx.fillStyle = 'rgba(36,28,20,0.5)';
        ctx.fillRect(16, ry, w - 32, 64);
        r.lines.forEach(function (line, i) {
          text(ctx, line, 32, ry + 10 + i * 20, { size: 16, color: '#c9c0a8' });
        });
      } else if (r.kind === 'equip') {
        text(ctx, r.label, 20, ry, { size: 17, color: '#8a8070' });
        text(ctx, r.value, 110, ry - 2, { size: 19, color: '#efe3c6' });
      } else if (r.kind === 'shijian') {
        text(ctx, '天机简 × ' + r.shi + '（已用 ' + r.used + '）', 20, ry + 6, { size: 19, color: '#c9a0e0' });
      }
    });

    ctx.restore();

    // 顶部/底部渐隐
    const grad1 = ctx.createLinearGradient(0, TOP, 0, TOP + 24);
    grad1.addColorStop(0, 'rgba(20,16,12,0.95)');
    grad1.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, TOP, w, 24);
    const grad2 = ctx.createLinearGradient(0, h - BOT - 24, 0, h - BOT);
    grad2.addColorStop(0, 'rgba(20,16,12,0)');
    grad2.addColorStop(1, 'rgba(20,16,12,0.95)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, h - BOT - 24, w, 24);

    app.ui.button(ctx, 20, h - 92, w - 40, 72, '返回', {
      id: 'a_back', size: 26, onTap: function () { app.pop(); },
    });

    const jail = stateLib.prisonersOf(st).filter(function (x) { return x.by === 'player'; }).length;
    if (jail > 0) {
      app.ui.button(ctx, 20, h - 164, w - 40, 60, '营后牢里 ' + jail + ' 位领主 · 收赎金 / 放人', {
        id: 'a_prison', size: 22, fill: '#3a2c1e', onTap: function () { app.push('prison'); },
      });
    }

    // 记录命中区（屏幕坐标）
    this.hitRows = rowRects;
  },

  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.scroll, moved: 0, x: x };
  },

  onTouchMove(app, x, y) {
    if (!this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 6) this.drag.moved = Math.abs(dy);
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.drag.scroll - dy));
  },

  onTouchEnd(app, x, y) {
    const d = this.drag || { moved: 0 };
    this.drag = null;
    if (d.moved > 8) return; // 拖动过就不算点击

    const w = app.runtime.width;
    const list = this.hitRows || [];
    for (let i = 0; i < list.length; i += 1) {
      const r = list[i];
      const sy = TOP - this.scroll + r.y;
      if (r.kind === 'troop') {
        if (y < sy + 6 || y > sy + 50) continue;
        if (x >= w - 126 && x <= w - 78) {
          this.dismissTroops(app, r.id, 1);
          return;
        }
        if (x >= w - 72 && x <= w - 24) {
          this.dismissTroops(app, r.id, 5);
          return;
        }
      } else if (r.kind === 'hero') {
        if (y >= sy && y <= sy + 58 && x >= 16 && x <= w - 16) {
          app.push('hero', { index: r.index });
          return;
        }
      }
    }
  },

  dismissTroops(app, troopId, n) {
    const p = app.state.player;
    const have = p.troops[troopId] || 0;
    if (have <= 0) return;
    const cut = Math.min(n, have);
    p.troops[troopId] = have - cut;
    if (p.troops[troopId] <= 0) delete p.troops[troopId];
    stateLib.pushLog(app.state, '在营地遣散了 ' + cut + ' 名' + ((TROOPS[troopId] || {}).name || troopId) + '，发了路费。');
  },
};

function drawBtn(ctx, x, y, w, h, label, color) {
  ctx.fillStyle = color || '#4a3a24';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8a7448';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  text(ctx, label, x + w / 2, y + 7, { size: 17, align: 'center', color: '#e8dcc0' });
}

module.exports = ArmyScene;

  };

  /* js/scenes/hero.js */
  __defs[34] = function (module, exports, __require) {
/**
 * 英雄对话页：从队伍页点名字进来，能聊两句，也能请他离开。
 */

const { text, panel, bar, wrap } = __require(6);
const stateLib = __require(7);
const heroesLib = __require(14);
const { siteById } = __require(8);
const { HERO_MAX_LEVEL, HERO_BONUS } = __require(12);

const COMMON = [
  '……营里的火还没灭，坐会儿？',
  '今天走了三十里，马都出汗了。',
  '你信这天下还能太平吗？我不太信。',
  '我这样的人，在城里只配替人看仓门。',
  '跟着你，至少每日有口热饭。',
  '别总自己冲在前头，队里没第二个你。',
  '听说北边又打起来了。这仗没个头。',
  '我不识字。名字是别人替我写上去的。',
  '夜里巡营，看见远处有火。不知道是谁的。',
  '打了这些年，能记住的脸越来越少了。',
];

const BY_KIND = {
  atk: ['刀要常磨。磨刀的时候心也静。', '冲阵的事交给我。你在后头看着就行。', '上一仗我砍倒了三个，忘了数第四个。'],
  def: ['营垒的土得夯三层，少一层半夜就塌。', '守着不动，比冲出去难。', '我这条命，是从城墙上捡回来的。'],
  speed: ['我走惯了山路，你跟着别掉队。', '这条道我走过七回。前面有条河。', '慢一步，吃的就被人抢了。'],
  food: ['粮袋我数过，够七天。第八天得想办法。', '路上看见桑椹，也能顶一顿。', '别把干粮都给马，人先吃饱。'],
  loot: ['打完仗别急着走，死人身上有东西。', '甲可以补，刀可以磨，别扔。', '上一回我捡到一枚印，换了三十金钱。'],
  morale: ['兄弟们累了，让他们歇半日。', '骂几句不顶事。饭热了，人就稳了。', '有人夜里想家。我陪他坐到天亮。'],
};

const HeroScene = {
  enter(app, params) {
    this.index = (params || {}).index || 0;
    this.confirm = false;
    this.line = '';
    this.talks = 0;
    this.history = [];
    this.say(app);
  },

  heroOf(app) {
    const p = app.state && app.state.player;
    const list = (p && p.heroes) || [];
    return list[this.index] || null;
  },

  say(app) {
    const hh = this.heroOf(app);
    if (!hh) return;
    const b = HERO_BONUS[hh.id] || {};
    const kind = Object.keys(BY_KIND).filter(function (k) { return b[k]; })[0];
    const pool = (kind ? BY_KIND[kind] : []).concat(COMMON);
    const pick = pool[Math.floor(app.state.rng.random() * pool.length)];
    this.line = this.talks === 0 ? (kind ? BY_KIND[kind][0] : COMMON[0]) : pick;
    this.talks += 1;
    this.history.push(this.line);
    if (this.history.length > 8) this.history.shift();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const hh = this.heroOf(app);
    if (!st || !hh) {
      app.pop();
      return;
    }
    const def = heroesLib.heroById(hh.id) || { name: hh.id, bio: '', site: '' };
    const b = heroesLib.bonusOf(hh.id, hh.level);
    const lv = hh.level || 1;

    ctx.fillStyle = '#12100c';
    ctx.fillRect(0, 0, w, h);

    // 头部
    ctx.fillStyle = '#1b1611';
    ctx.fillRect(0, 0, w, 268);
    text(ctx, def.name, w - 24, 24, { size: 40, align: 'right', color: '#f0c060' });
    text(ctx, b.label || '随行英雄', w - 24, 76, { size: 16, align: 'right', color: '#a2947a' });

    // 头像：一个粗画的人影（左侧）
    const ax = 92;
    const ay = 128;
    ctx.fillStyle = '#2a231b';
    ctx.beginPath();
    ctx.arc(ax, ay, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8c8a8';
    ctx.beginPath();
    ctx.arc(ax, ay - 12, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a4a34';
    ctx.beginPath();
    ctx.moveTo(ax - 32, ay + 48);
    ctx.lineTo(ax - 24, ay + 14);
    ctx.lineTo(ax + 24, ay + 14);
    ctx.lineTo(ax + 32, ay + 48);
    ctx.closePath();
    ctx.fill();

    text(ctx, 'Lv ' + lv + ' / ' + HERO_MAX_LEVEL, 176, 106, { size: 22, color: '#efe3c6' });
    bar(ctx, 176, 136, w - 200, 10, lv >= HERO_MAX_LEVEL ? 1 : (hh.exp || 0) / (lv * heroesLib.EXP_PER_LEVEL), '#7fae6a');
    text(ctx, lv >= HERO_MAX_LEVEL ? '这一身本事，练到头了。' : '经验 ' + (hh.exp || 0) + ' / ' + (lv * heroesLib.EXP_PER_LEVEL), 176, 152, {
      size: 14, color: '#6a6355',
    });
    text(ctx, '队伍加成：' + (b.text || '无'), 176, 176, { size: 17, color: '#8fb0d8' });
    const ownCountry = st.player.country && st.player.country.name
      ? st.player.country.name + '国' : '你的旗';
    text(ctx, '现属：' + ownCountry + '麾下 · 随你行军', 176, 204, { size: 14, color: '#8a8070' });

    // 生平：只写他自己的经历；当前归属上面已单独标明。
    let y = 288;
    panel(ctx, 16, y, w - 32, 186, { fill: '#1b1611' });
    text(ctx, '生平', 32, y + 12, { size: 15, color: '#8a8070' });
    const bio = wrap(ctx, heroesLib.storyOf(hh.id) || '来历不明。', w - 64, 16);
    bio.slice(0, 6).forEach(function (ln, i) {
      text(ctx, ln, 32, y + 40 + i * 24, { size: 16, color: '#c9c0a8' });
    });
    y += 202;

    // 对话气泡
    const boxH = Math.max(240, h - y - 130);
    panel(ctx, 16, y, w - 32, boxH, { fill: this.confirm ? '#2a1815' : '#1d2420' });
    text(ctx, this.confirm ? '最后一句' : '他说', 32, y + 12, { size: 15, color: '#8a8070' });
    const lineColor = this.confirm ? '#e0a090' : '#efe3c6';
    if (this.confirm) {
      const line = wrap(ctx, '……你这么说，我也没什么好留的。刀我带走，甲留给你。', w - 64, 18);
      line.slice(0, 5).forEach(function (ln, i) {
        text(ctx, ln, 32, y + 44 + i * 28, { size: 19, color: lineColor });
      });
      text(ctx, '走了以后，他会在旧地待着，改天还能请你喝酒。', 32, y + boxH - 40, { size: 14, color: '#8a8070' });
    } else {
      let ty = y + 44;
      const shown = this.history.slice(-4);
      shown.forEach(function (t, idx) {
        const lines = wrap(ctx, t, w - 64, 18);
        lines.slice(0, 2).forEach(function (ln) {
          if (ty > y + boxH - 34) return;
          text(ctx, ln, 32, ty, { size: 19, color: idx === shown.length - 1 ? lineColor : '#9a9080' });
          ty += 28;
        });
        ty += 6;
      });
    }

    // 按钮
    const by = h - 96;
    if (this.confirm) {
      const bw = (w - 52) / 2;
      app.ui.button(ctx, 20, by, bw, 76, '后会有期', {
        id: 'hero_confirm_leave', size: 24, fill: '#5a2418', onTap: function () {
          const r = heroesLib.dismissHero(st, hh.id);
          if (r.ok) {
            stateLib.pushLog(st, def.name + '走了。' + (def.site ? '他说回旧地还能有口饭吃。' : ''));
            app.pop();
            app.showToast(r.msg, 2);
          }
        },
      });
      app.ui.button(ctx, 20 + bw + 12, by, bw, 76, '再留一阵', {
        id: 'hero_stay', size: 24, fill: '#241c14', onTap: function () {
          this.confirm = false;
          this.history.push('……那就再跟一段。');
        }.bind(this),
      });
    } else {
    const third = (w - 88) / 4;
    app.ui.button(ctx, 20, by, third, 76, '拉家常', {
      id: 'hero_talk', size: 20, onTap: function () { this.say(app); }.bind(this),
    });
    app.ui.button(ctx, 20 + (third + 12), by, third, 76, '封地出镇', {
      id: 'hero_promote', size: 20, fill: '#33291d', onTap: function () {
        const free = st.world.sites.filter(function (s) {
          return s.playerOwned && s.type !== 'camp' && !stateLib.siteLord(st, s);
        });
        if (!free.length) {
          app.showToast('名下没有空的封地。先去城里的“封地 · 点将”收回一处。', 3);
          return;
        }
        app.push('fief', { heroId: hh.id });
      },
    });
    app.ui.button(ctx, 20 + (third + 12) * 2, by, third, 76, '让他走', {
      id: 'hero_leave', size: 20, fill: '#3a2418', onTap: function () { this.confirm = true; }.bind(this),
    });
    app.ui.button(ctx, 20 + (third + 12) * 3, by, third, 76, '返回', {
      id: 'hero_back', size: 20, fill: '#241c14', onTap: function () { app.pop(); },
    });
    }
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = HeroScene;

  };

  /* js/scenes/prison.js */
  __defs[35] = function (module, exports, __require) {
/**
 * 牢房：营后捆着的领主，收赎金或者白放换人情。
 * 也列出天下各处牢里关着的人（只读）。
 */

const { text, wrap } = __require(6);
const stateLib = __require(7);
const scenery = __require(25);
const { FACTIONS } = __require(5);
const { lookFor } = __require(12);

const TOP = 96;
const BOT = 96;
const ROW_H = 134;

const PrisonScene = {
  enter() {
    this.scroll = 0;
    this.maxScroll = 0;
    this.drag = null;
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    const list = stateLib.prisonersOf(st);
    const mine = list.filter(function (p) { return p.by === 'player'; });
    const others = list.filter(function (p) { return p.by !== 'player'; });

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'prison', w, h, 31);

    text(ctx, '牢房', 20, 24, { size: 36, color: '#f0c060' });
    text(ctx, '捆着 ' + mine.length + ' 人', w - 20, 34, { size: 18, align: 'right', color: '#a2947a' });
    text(ctx, '关得越久越容易自己跑；赎金由家人来出，放人换个名声。', 20, 66, {
      size: 15, color: '#8a8070',
    });

    // ---- 滚动区 ----
    this.rows = [];
    this.hitRows = [];
    const viewH = h - TOP - BOT;
    let y = 0;
    const rects = [];

    const pushRow = function (r) {
      r.y = y;
      r.h = r.kind === 'mine' ? 192 : (r.kind === 'head' ? 44 : ROW_H);
      this.rows.push(r);
      rects.push(r);
      y += r.h + 10;
    }.bind(this);

    if (!list.length) {
      pushRow({ kind: 'empty' });
    }

    mine.forEach(function (p) {
      pushRow({ kind: 'mine', data: p });
    });

    if (others.length) {
      pushRow({ kind: 'head', label: '别处的牢里（你插不上手）' });
      others.forEach(function (p) {
        pushRow({ kind: 'other', data: p });
      });
    }

    this.contentH = y;
    this.maxScroll = Math.max(0, this.contentH - viewH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP - 8, w, viewH + 16);
    ctx.clip();
    ctx.translate(0, TOP - this.scroll);

    this.rows.forEach(function (r) {
      const ry = r.y;
      if (ry > viewH + this.scroll + 220 || ry + r.h < this.scroll - 220) return;
      if (r.kind === 'empty') {
        text(ctx, '牢里空着。打赢一位领主，才有资格往这儿捆人。', 24, ry + 16, { size: 19, color: '#8a8070' });
        return;
      }
      if (r.kind === 'head') {
        text(ctx, r.label, 20, ry + 12, { size: 17, color: '#6a6050' });
        return;
      }
      const p = r.data;
      const mineRow = r.kind === 'mine';
      ctx.fillStyle = mineRow ? 'rgba(40,30,22,0.85)' : 'rgba(30,26,20,0.55)';
      ctx.fillRect(16, ry, w - 32, r.h);
      ctx.strokeStyle = mineRow ? '#5a4a2a' : '#33291e';
      ctx.strokeRect(16.5, ry + 0.5, w - 33, r.h - 1);

      const color = (FACTIONS[p.faction] || {}).color || '#8a8070';
      const portrait = app.assets.portraitFor
        ? app.assets.portraitFor(color, lookFor(p.lordId))
        : null;
      if (portrait) ctx.drawImage(portrait, 26, ry + 14, 54, 52);

      text(ctx, p.name, 92, ry + 10, { size: 24, color: '#efe3c6' });
      text(ctx, p.title || '领主', w - 26, ry + 14, { size: 15, align: 'right', color: '#8a8070' });
      text(ctx, (p.faction ? '(' + p.faction + ') ' : '') + '关在' + p.place + ' · 第 ' + p.days + ' 天', 92, ry + 38, {
        size: 16, color: '#a2947a',
      });
      const recruit = p.recruit || null;
      const wait = p.recruitWaitDays || 0;
      const recruitTxt = recruit
        ? (recruit.mode === 'none' ? '招降必被拒（你还没有旗）'
          : recruit.mode === 'ruler' ? '君主不可招（除非他的国亡了）'
            : '招降 ' + Math.round(recruit.chance * 100) + '%' +
              (wait > 0 ? ' · 还需等 ' + wait + ' 天' : ''))
        : '';
      text(ctx, mineRow ? '自己逃的概率 ' + Math.round(p.chance * 100) + '%/日 · ' + recruitTxt
        : '他家的人会来赎；城破了就放', 92, ry + 62, {
        size: 14, color: mineRow ? '#c9bda2' : '#6a6050',
      });

      if (mineRow) {
        drawBtn(ctx, w - 236, ry + 78, 100, 40, '收赎金 ' + p.ransom, '#5a4a2a');
        drawBtn(ctx, w - 126, ry + 78, 100, 40, '放了', '#3a4a2a');
        drawBtn(ctx, w - 236, ry + 124, 100, 40, wait > 0 ? '等 ' + wait + ' 天' : '招降', wait > 0 ? '#2c2a24' : '#3a3a5a');
        const askKill = this.confirmKill === p.lordId;
        drawBtn(ctx, w - 126, ry + 124, 100, 40, askKill ? '真的斩了？' : '斩了', askKill ? '#8a2a1a' : '#4a241c');
        drawBtn(ctx, 92, ry + 132, 96, 40, '问话', '#2c2a24');
      }
    }, this);

    ctx.restore();

    app.ui.button(ctx, 20, h - 78, w - 40, 62, '返回', {
      id: 'pr_back', size: 24, onTap: function () { app.pop(); },
    });

    this.hitRows = rects.map(function (r) {
      return { y: r.y, kind: r.kind, data: r.data };
    });
  },

  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.scroll, moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (!this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 6) this.drag.moved = Math.abs(dy);
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.drag.scroll - dy));
  },

  onTouchEnd(app, x, y) {
    const d = this.drag || { moved: 0 };
    this.drag = null;
    if (d.moved > 8) return;
    const w = app.runtime.width;
    const list = this.hitRows || [];
    for (let i = 0; i < list.length; i += 1) {
      const r = list[i];
      if (r.kind !== 'mine') continue;
      const sy = TOP - this.scroll + r.y;
      // 第一排：赎金 / 放了
      if (y >= sy + 78 && y <= sy + 118) {
        if (x >= w - 236 && x <= w - 136) {
          const res = stateLib.ransomPrisoner(app.state, r.data.lordId);
          app.showToast(res.msg, 2.4);
          return;
        }
        if (x >= w - 126 && x <= w - 26) {
          const res = stateLib.releasePrisoner(app.state, r.data.lordId);
          app.showToast(res.msg, 2.4);
          return;
        }
      }
      // 第二排：招降 / 斩了 / 问话
      if (y >= sy + 124 && y <= sy + 164) {
        if (x >= w - 236 && x <= w - 136) {
          const res = stateLib.recruitPrisoner(app.state, r.data.lordId);
          app.showToast(res.msg, 3);
          this.confirmKill = null;
          return;
        }
        if (x >= w - 126 && x <= w - 26) {
          if (this.confirmKill !== r.data.lordId) {
            this.confirmKill = r.data.lordId;
            app.showToast('再点一下，就把' + r.data.name + '斩了。杀了他，' +
              ((FACTIONS[r.data.faction] || {}).full || '那家') + '跟你结下血债：一个月内议和必被驳回，之后赔款翻倍。', 3.6);
            return;
          }
          this.confirmKill = null;
          const res = stateLib.executePrisoner(app.state, r.data.lordId);
          app.showToast(res.msg, 3);
          return;
        }
        if (x >= 92 && x <= 188) {
          const lord = app.state.lords.filter(function (l) { return l.id === r.data.lordId; })[0];
          const line = lord ? stateLib.lordIdle(app.state, lord) : '他闭着眼，不说话。';
          app.showToast(r.data.name + '：“' + line + '”', 3.4);
          return;
        }
      }
    }
  },
};

function drawBtn(ctx, x, y, w, h, label, color) {
  ctx.fillStyle = color || '#4a3a24';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8a7448';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  text(ctx, label, x + w / 2, y + 10, { size: 15, align: 'center', color: '#e8dcc0' });
}

module.exports = PrisonScene;

  };

  /* js/scenes/tourney.js */
  __defs[36] = function (module, exports, __require) {
/**
 * 比武大会：彩棚底下的"猜手"赌局。
 * 左挡 / 右挡 / 左攻 / 右攻，各三滴血，先见底的人输。
 * 报名 40 金钱，赢的人拿 200。
 */

const { text, wrap, panel } = __require(6);
const tourney = __require(26);
const { siteById } = __require(8);
const scenery = __require(25);
const { lookFor } = __require(12);
const { FACTIONS } = __require(5);

const FILL_BLOCK = '#26372e';
const FILL_ATTACK = '#452a1c';

function drawPips(ctx, x, y, n, total, color) {
  for (let i = 0; i < total; i++) {
    const alive = i < n;
    ctx.fillStyle = alive ? color : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + i * 46, y, 38, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + i * 46, y, 38, 14);
  }
}

const TourneyScene = {
  enter(app, params) {
    this.siteId = params && params.siteId;
    // 旧档里的赛会是"三场连打"结构，跟现在的三血对决不兼容，直接作废
    const t = app.state.tourney;
    if (t && (typeof t.hp !== 'number' || !t.foe)) app.state.tourney = null;
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    const site = this.siteId ? siteById(st.world, this.siteId) : null;
    const name = site ? site.name : '此地';
    const t = st.tourney;

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'tourney', w, h, 23);

    text(ctx, name + ' 比武大会', 20, 24, { size: 34, color: '#f0c060' });
    text(ctx, '报名 ' + tourney.FEE + ' 金钱 · 夺冠赏 ' + tourney.PRIZE + ' 金钱 · 三滴血定胜负', 20, 70, {
      size: 16, color: '#a2947a',
    });

    if (!t) {
      panel(ctx, 20, 104, w - 40, 240, { fill: '#201a14' });
      const intro = '彩棚底下画了个圈，两人各持木刀，护住左右两肩。'
        + '每合一招：要么护住一边，要么从那一边切进去。'
        + '同时抢攻各挨一下，挡对了白赚一刀，挡空了就吃一记。'
        + '三滴血，先倒下的认输。报名 40 金钱，赢的人捧走 200。';
      wrap(ctx, intro, w - 96, 18).forEach(function (line, i) {
        text(ctx, line, 44, 126 + i * 28, { size: 18, color: '#c9bda2' });
      });
      app.ui.button(ctx, 40, 372, w - 80, 88, '交 ' + tourney.FEE + ' 金钱 · 报名下场', {
        id: 't_enter', size: 26, fill: '#432c18', onTap: function () {
          const r = tourney.enter(st, site);
          app.showToast(r.msg, 2.2);
        },
      });
    } else {
      /* -------------------------------------------------- 对手 */
      const foe = t.foe;
      const col = (FACTIONS[foe.faction] || {}).color || '#8a7448';
      panel(ctx, 20, 100, w - 40, 176, { fill: '#1c1710' });
      const portrait = app.assets.portraitFor ? app.assets.portraitFor(col, lookFor(foe.lordId)) : null;
      if (portrait) {
        ctx.drawImage(portrait, 36, 112, 104, 104);
      } else {
        ctx.fillStyle = col;
        ctx.fillRect(36, 112, 104, 104);
      }
      text(ctx, foe.name, 156, 138, { size: 28, color: t.foeHp > 0 ? '#efe3c6' : '#7a7060' });
      text(ctx, foe.tag, 156, 166, { size: 15, color: '#8a8070' });
      text(ctx, '对方', w - 40, 132, { size: 15, align: 'right', color: '#8a8070' });
      drawPips(ctx, 156, 184, t.foeHp, tourney.HP, '#c9553f');
      text(ctx, t.foeHp + ' / ' + tourney.HP, 156 + 3 * 46 + 10, 184, { size: 15, color: '#c9553f' });

      /* -------------------------------------------------- 自己 */
      panel(ctx, 20, 288, w - 40, 112, { fill: '#201a14' });
      text(ctx, '你', 40, 316, { size: 24, color: '#efe3c6' });
      drawPips(ctx, 100, 306, t.hp, tourney.HP, '#6fa86a');
      text(ctx, t.hp + ' / ' + tourney.HP, 100 + 3 * 46 + 10, 306, { size: 16, color: '#6fa86a' });
      text(ctx, '金钱 ' + st.player.gold + ' · 声望 ' + st.player.renown, 40, 358, { size: 16, color: '#a2947a' });
      text(ctx, '第 ' + (t.round || 0) + ' 合', w - 40, 358, { size: 16, align: 'right', color: '#a2947a' });

      if (!t.done) {
        text(ctx, '护住一边就挡，从一边切进去就攻。方向对了才挡得住。', 20, 412, { size: 15, color: '#8a8070' });
        const bw = (w - 40 - 14) / 2;
        const bh = 104;
        const moves = [
          { id: 'blockL', label: '左挡', fill: FILL_BLOCK },
          { id: 'blockR', label: '右挡', fill: FILL_BLOCK },
          { id: 'attackL', label: '左攻', fill: FILL_ATTACK },
          { id: 'attackR', label: '右攻', fill: FILL_ATTACK },
        ];
        moves.forEach(function (m, i) {
          const bx = 20 + (i % 2) * (bw + 14);
          const by = 436 + Math.floor(i / 2) * (bh + 14);
          app.ui.button(ctx, bx, by, bw, bh, m.label, {
            id: 't_m_' + m.id, size: 32, fill: m.fill, onTap: function () {
              const r = tourney.play(st, m.id);
              if (!r.ok) { app.showToast(r.msg); return; }
              if (r.result === 'win') app.showToast('赢了 · 赏钱 ' + tourney.PRIZE + ' 金钱', 2.4);
              else if (r.result === 'lose') app.showToast('输了 · 报名费没了', 2.2);
              else if (r.result === 'draw') app.showToast('同时倒地 · 报名费退你', 2.2);
            },
          });
        });
      } else {
        const champion = t.champion;
        const drawn = t.draw;
        const line = champion ? '你站到了最后 · 赏钱 ' + t.pot + ' 金钱' : (drawn ? '同时倒地 · 报名费已退' : '你倒下了 · 认输退场');
        text(ctx, line, 20, 448, { size: 28, color: champion ? '#f0c060' : '#c9bda2' });
        app.ui.button(ctx, 40, 494, w - 80, 92, champion ? '领了赏钱 · 回城' : '收起木刀 · 回城', {
          id: 't_leave', size: 26, fill: '#33271b', onTap: function () {
            tourney.close(st);
            app.pop();
          },
        });
      }

      /* -------------------------------------------------- 战报 */
      const logTop = t.done ? 610 : 664;
      const logH = Math.max(150, h - logTop - 96);
      panel(ctx, 20, logTop, w - 40, logH, { fill: '#181410' });
      text(ctx, '场上', 40, logTop + 26, { size: 16, color: '#8a8070' });
      const shown = (t.log || []).slice(-2).join('\n');
      const lines = wrap(ctx, shown || '鼓声一起，看台上的人把酒洒了一地。', w - 96, 17);
      lines.slice(0, Math.floor((logH - 46) / 24)).forEach(function (ln, i) {
        text(ctx, ln, 40, logTop + 52 + i * 24, { size: 17, color: '#e8dcc0' });
      });
    }

    app.ui.button(ctx, 20, h - 88, w - 40, 66, '回城', {
      id: 't_back', size: 24, onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = TourneyScene;

  };

  /* js/scenes/journal.js */
  __defs[37] = function (module, exports, __require) {
/**
 * 史册：主线进度 + 全部记事 + 统计。
 * 近十二天的事一条不落；再往前，只留改旗、围城、斩将这类大事。
 * 大事按类别着色，往下拖就能翻到几个月前。
 */

const { text, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { CAMPAIGN } = __require(5);

const TOP = 330;
const BOT = 104;
const RECENT_DAYS = 12;

const KIND_COLORS = {
  war: '#c86a5a',
  battle: '#e0a050',
  siege: '#d98a3a',
  muster: '#7aa6a0',
  campaign: '#e8c060',
  faction: '#8fb0d8',
  recruit: '#8fbf7a',
  death: '#c05a5a',
  throne: '#b98fd8',
  camp: '#8a8070',
  trade: '#a2947a',
  life: '#9a9080',
};

const KIND_LABELS = {
  war: '战事', battle: '战斗', siege: '围城', muster: '集结', campaign: '战役',
  faction: '天下', recruit: '归降', death: '死讯', throne: '大位', camp: '扎营',
};

function kindColor(entry) {
  if (entry.important && (entry.kind === 'camp' || entry.kind === 'life' || entry.kind === 'trade')) {
    return '#e0a050';
  }
  return KIND_COLORS[entry.kind] || (entry.important ? '#e8c060' : '#9a9080');
}

const JournalScene = {
  enter() {
    this.scroll = 0;
    this.maxScroll = 0;
    this.drag = null;
    this.rows = [];
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '史册', 20, 22, { size: 36, color: '#f0c060' });
    text(ctx, stateLib.renownTitle(st.player.renown), w - 20, 34, {
      size: 18, align: 'right', color: '#a2947a',
    });
    text(ctx, '近 ' + RECENT_DAYS + ' 日一条不落，再往前只留大事 · 按住往下拖可翻旧账',
      20, 64, { size: 14, color: '#8a8070' });

    // 当前章
    const stage = CAMPAIGN[Math.min(st.campaign.stage, CAMPAIGN.length - 1)];
    ctx.fillStyle = '#241c14';
    ctx.fillRect(16, 88, w - 32, 118);
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(16, 88, 5, 118);
    if (st.campaign.stage >= CAMPAIGN.length) {
      text(ctx, '主线已走完', 34, 100, { size: 23, color: '#8fbf7a' });
      text(ctx, '剩下的，是你在图上留下多少座城。', 34, 138, { size: 15, color: '#a2947a' });
    } else if (stage) {
      text(ctx, stage.title, 34, 98, { size: 23, color: '#f0c060' });
      text(ctx, '目标 · ' + stage.goal, 34, 134, { size: 15, color: '#c9bda2' });
      text(ctx, '进度 ' + st.campaign.stage + ' / ' + CAMPAIGN.length, w - 30, 100, {
        size: 15, align: 'right', color: '#8a8070',
      });
    }

    // 统计
    const sy = 220;
    const stats = [
      ['天数', st.clock.day],
      ['胜仗', st.stats.battlesWon],
      ['败仗', st.stats.battlesLost],
      ['城', st.stats.sitesTaken],
      ['里程', st.stats.distance],
      ['天机简', st.player.shiUsed],
    ];
    const cw = (w - 32) / stats.length;
    stats.forEach(function (s, i) {
      const x = 16 + i * cw;
      text(ctx, s[0], x, sy, { size: 14, color: '#8a8070' });
      text(ctx, String(s[1]), x, sy + 22, { size: 23, color: '#efe3c6' });
    });

    // 图例
    const legendY = 276;
    text(ctx, '记事', 20, 286, { size: 20, color: '#a2947a' });
    let lx = 92;
    [['siege', '围城'], ['muster', '集结'], ['battle', '战事'], ['faction', '天下'], ['recruit', '归降']].forEach(function (it) {
      ctx.fillStyle = KIND_COLORS[it[0]];
      ctx.fillRect(lx, legendY + 2, 8, 8);
      text(ctx, it[1], lx + 13, legendY - 3, { size: 13, color: '#8a8070' });
      lx += 68;
    });
    const oldCount = st.log.filter(function (e) {
      return e.important && (st.clock.day - e.day) > RECENT_DAYS;
    }).length;
    text(ctx, '旧事 ' + oldCount + ' 条', w - 20, legendY - 3, {
      size: 13, align: 'right', color: '#6a6050',
    });
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(20, 314, w - 40, 2);

    // 近的照单全收，旧的只留重要
    const list = st.log.slice().reverse().filter(function (e) {
      return !e.day || (st.clock.day - e.day) <= RECENT_DAYS || e.important;
    });

    // 先排版，再裁剪绘制
    this.rows = [];
    let cy = 0;
    list.forEach(function (entry) {
      const head = '第' + (entry.day || 1) + '天 · ' + String(entry.hour || 0).padStart(2, '0') + '时';
      const color = kindColor(entry);
      const lines = wrap(ctx, entry.text || '', w - 78, 16, 'bold').slice(0, 3);
      const rh = Math.max(42, 24 + lines.length * 23);
      this.rows.push({ entry: entry, y: cy, h: rh, head: head, color: color, lines: lines });
      cy += rh + 6;
    }, this);
    const contentH = cy;
    const viewH = h - TOP - BOT;
    this.maxScroll = Math.max(0, contentH - viewH);
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, w, viewH);
    ctx.clip();
    ctx.translate(0, TOP - this.scroll);

    if (!this.rows.length) {
      text(ctx, '史册还是白的。走出陈留，打第一仗，这里就会开始写字。', 24, 18, {
        size: 18, color: '#8a8070',
      });
    }

    this.rows.forEach(function (r) {
      if (r.y > this.scroll + viewH + 120 || r.y + r.h < this.scroll - 120) return;
      const imp = !!r.entry.important;
      ctx.fillStyle = imp ? 'rgba(42,33,23,0.72)' : 'rgba(25,22,17,0.55)';
      ctx.fillRect(16, r.y, w - 32, r.h);
      ctx.fillStyle = r.color;
      ctx.fillRect(16, r.y, 4, r.h);
      if (imp) {
        text(ctx, '◆', 26, r.y + 9, { size: 13, color: r.color });
      }
      text(ctx, r.head, imp ? 42 : 30, r.y + 8, { size: 13, color: imp ? r.color : '#6a6050' });
      const kindName = KIND_LABELS[r.entry.kind];
      if (kindName && imp) {
        text(ctx, kindName, w - 26, r.y + 8, { size: 12, align: 'right', color: r.color });
      }
      r.lines.forEach(function (line, i) {
        text(ctx, line, 30, r.y + 26 + i * 23, {
          size: 16, color: imp ? '#e2d4b6' : '#a69a84',
        });
      });
    }, this);
    ctx.restore();

    // 滚动条
    if (this.maxScroll > 0) {
      const trackH = viewH - 12;
      const thumbH = Math.max(54, trackH * (viewH / (viewH + this.maxScroll)));
      const thumbY = TOP + 6 + (trackH - thumbH) * (this.scroll / this.maxScroll);
      ctx.fillStyle = '#2a2118';
      ctx.fillRect(w - 7, TOP + 6, 3, trackH);
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(w - 7, thumbY, 3, thumbH);
    }

    app.ui.button(ctx, 20, h - 84, w - 40, 62, '返回', {
      id: 'j_back', size: 24, onTap: function () { app.pop(); },
    });
  },

  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.scroll, moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (!this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 6) this.drag.moved = Math.abs(dy);
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.drag.scroll - dy));
  },

  onTouchEnd() {
    this.drag = null;
  },
};

module.exports = JournalScene;

  };

  /* js/scenes/camp.js */
  __defs[38] = function (module, exports, __require) {
/**
 * 扎营：军令与天下事都在这里。
 * 天下大势、玩法说明从底栏收进来；另添"在这里待一会儿"和"招降俘虏"。
 */

const { text, panel, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const scenery = __require(25);
const { siteById } = __require(8);
const army = __require(9);
const { FACTIONS } = __require(5);
const flows = __require(22);

const PAD = 16;

function factionLabel(st, id) {
  if (id === 'player') {
    return (st.player.country && st.player.country.name)
      ? st.player.country.name + '国' : '你的旗';
  }
  return (FACTIONS[id] || {}).full || id;
}

function gameClockText(st) {
  const hour = Math.floor(st.clock.hour);
  const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return '第 ' + st.clock.day + ' 天 ' + pad(hour) + ' 时';
}

const CampScene = {
  enter(app, params) {
    const p = params || {};
    this.lastLine = '';
    this.flowStartH = 0;
    this.foreignScroll = 0;
    this.drag = null;
    this.dragMoved = 0;
    // 从大地图点回来（或营中再点扎营）时，直接停在“继续/拔营”这一页。
    if (p.pause || (app.state && app.state.campFlow)) {
      this.view = 'pause';
      this.pauseLine = p.reason || '你把时辰按住了。';
      if (app.state) app.state.campFlow = false;
      return;
    }
    this.view = 'menu';
    if (app.state) {
      app.state.campFlow = false;
      if (app.state.player && app.state.player.route && app.state.player.route.length) {
        stateLib.stopMoving(app.state);
      }
    }
  },
  update(app, dt) {
    const st = app.state;
    if (!st) return;
    if (this.view !== 'flowing') {
      st.campFlow = false;
      return;
    }
    st.campFlow = true;
    if (!this.flowStartH) this.flowStartH = stateLib.gameHours(st);
    stateLib.update(st, dt, { ignoreEvents: true });
    if (st.gameOver) {
      this.pause(app, '旅途已经结束。');
      return;
    }
    // 天下出了事，先把时辰停住，让玩家看完再决定继续还是拔营。
    if (st.events.length) {
      this.pause(app, '营外来了军情，时辰先停。');
      flows.process(app);
    }
  },

  pause(app, reason) {
    this.view = 'pause';
    this.pauseLine = reason || '你把时辰按住了。';
    if (app.state) app.state.campFlow = false;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'camp', w, h, 17);

    // 营火的光，照亮半张幕布
    const glow = ctx.createRadialGradient(w / 2, h * 0.62, 30, w / 2, h * 0.62, h * 0.75);
    glow.addColorStop(0, 'rgba(116,66,24,0.24)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const site = st.player.atSiteId ? siteById(st.world, st.player.atSiteId) : null;
    const place = site ? site.name + '城外' : '野地';

    text(ctx, '扎营', PAD + 4, 24, { size: 36, color: '#f0c060' });
    text(ctx, place, w - PAD, 34, { size: 17, align: 'right', color: '#a2947a' });

    // 状态条
    panel(ctx, PAD, 78, w - PAD * 2, 88, { fill: 'rgba(36,28,20,0.88)' });
    const p = st.player;
    const foodNeed = stateLib.nextFoodNeed(st);
    const foodShort = p.food < foodNeed;
    const items = [
      ['第', st.clock.day + ' 天'],
      ['士气', p.morale],
      ['金钱', p.gold],
      ['粮草', p.food, foodShort ? '#e06a52' : '#efe3c6'],
      ['兵力', army.troopCount(p.troops)],
    ];
    const cw = (w - PAD * 2 - 20) / items.length;
    items.forEach(function (it, i) {
      const x = PAD + 10 + i * cw;
      text(ctx, it[0], x, 94, { size: 13, color: '#8a8070' });
      text(ctx, String(it[1]), x, 116, { size: 18, color: it[2] || '#efe3c6' });
    });
    if (foodShort) {
      text(ctx, '粮草不足以支撑两日 · 下次发粮需 ' + foodNeed + '，速补！',
        PAD + 10, 142, { size: 14, color: '#e06a52' });
    }

    if (this.view === 'flowing') {
      this.renderFlowing(app, ctx, w, h);
      return;
    }
    if (this.view === 'pause') {
      this.renderPause(app, ctx, w, h);
      return;
    }
    if (this.view === 'foreign') {
      this.renderForeign(app, ctx, w, h);
      return;
    }
    this.renderMenu(app, ctx, w, h);

    app.ui.button(ctx, PAD, h - 78, w - PAD * 2, 58, '拔营', {
      id: 'camp_back', size: 24, onTap: function () {
        if (app.state) app.state.campFlow = false;
        app.pop();
      },
    });
  },

  renderMenu(app, ctx, w, h) {
    const st = app.state;
    const mine = stateLib.prisonersOf(st).filter(function (p) { return p.by === 'player'; });
    const wars = stateLib.factionWars(st);
    const sieges = st.warCampaigns ? Object.keys(st.warCampaigns).filter(function (k) {
      return st.warCampaigns[k] && st.warCampaigns[k].stage === 'siege';
    }).length : 0;
    const sub = wars.length
      ? (sieges ? sieges + ' 处围城，' : '') + wars.length + ' 处交兵'
      : '四境暂无大战';
    const country = st.player.country;

    const rows = [
      {
        label: '天下大势', sub: sub, hint: '诸国宣战 · 围城 · 俘虏',
        onTap: function () { app.push('atlas'); },
      },
      {
        label: '在这里扎住 · 让时辰走',
        sub: '不选几个时辰，天下自己慢慢走', hint: '点屏幕任意处停下',
        onTap: function () {
          // 和进城休息一个道理：收了营帐回大地图，让时辰在外面流。
          app.pop();
          if (app.state) app.state.campFlow = true;
        },
      },
      {
        label: '外国战事', sub: wars.length ? wars.length + ' 处交兵' : '四境暂时太平',
        hint: '看哪两家正在打',
        onTap: function () { this.foreignScroll = 0; this.view = 'foreign'; }.bind(this),
      },
      {
        label: '招降俘虏', sub: mine.length ? '牢里捆着 ' + mine.length + ' 位领主' : '牢里暂时空着',
        hint: mine.length ? '无旗必拒 · 城多则服' : '打赢一位领主，才有人可招',
        disabled: !mine.length,
        onTap: function () { app.push('prison'); },
      },
      {
        label: '国号与旗色',
        sub: country
          ? (country.name
            ? '国号「' + country.name + '」 · 旗色 ' + (stateLib.flagColorName(country.color) || country.color)
            : '旗已立，国号还没定')
          : '打下第一座城后自立',
        hint: country ? '改一字国号 · 换旗色' : '还没有自己的旗',
        disabled: !country,
        onTap: function () { app.push('founding', { edit: true }); },
      },
      {
        label: '玩法说明', sub: '行军 · 粮草 · 国战 · 攻城',
        hint: '不懂哪一条，点开看',
        onTap: function () { app.push('help'); },
      },
    ];

    const rowGap = 6;
    const buttonY = h - 78;
    const rowH = Math.max(58, Math.min(78,
      Math.floor((buttonY - 194 - 28 - rowGap * (rows.length - 1)) / rows.length)));
    let y = 194;
    rows.forEach(function (r, i) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, rowH, '', {
        id: 'camp_' + i, disabled: r.disabled, fill: 'rgba(38,29,20,0.9)', onTap: r.onTap,
      });
      text(ctx, r.label, PAD + 20, y + 8, {
        size: rowH >= 72 ? 23 : 20, color: r.disabled ? '#6a6050' : '#f0c060',
      });
      text(ctx, r.sub, PAD + 20, y + 33, { size: 14, color: '#c9bda2' });
      text(ctx, r.hint, w - PAD - 20, y + 53, {
        size: 12, align: 'right', color: '#8a8070',
      });
      y += rowH + rowGap;
    });

    const line = '火堆不灭，斥候放出。营里的人都在等你一句话。';
    let ly = y + 10;
    wrap(ctx, line, w - PAD * 2, 15).slice(0, 1).forEach(function (l) {
      if (ly < buttonY - 4) text(ctx, l, PAD, ly, { size: 14, color: '#8a8070' });
    });
  },

  renderFlowing(app, ctx, w, h) {
    const st = app.state;
    const nowH = stateLib.gameHours(st);
    const elapsed = Math.max(0, nowH - (this.flowStartH || nowH));
    const days = Math.floor(elapsed / 24);
    const hours = Math.floor(elapsed % 24);
    const elapsedText = (days > 0 ? days + ' 天 ' : '') + hours + ' 个时辰';

    text(ctx, '时辰在走', PAD + 4, 190, { size: 34, color: '#f0c060' });
    text(ctx, '营火不灭，天下照常流转；不用再选等几个时辰。', PAD + 4, 238, {
      size: 16, color: '#a2947a',
    });

    panel(ctx, PAD, 292, w - PAD * 2, 204, { fill: 'rgba(30,23,16,0.92)' });
    text(ctx, gameClockText(st), PAD + 22, 316, { size: 30, color: '#efe3c6' });
    text(ctx, '这一回已经过去 ' + elapsedText, PAD + 22, 366, { size: 18, color: '#c9bda2' });
    text(ctx, '斥候在外，粮车在侧；你可以一直看着，也可以随时按住。', PAD + 22, 402, {
      size: 15, color: '#8a8070',
    });
    text(ctx, '世界时间：' + (st.timeScale || 1) + 'x', PAD + 22, 434, {
      size: 15, color: '#8a8070',
    });

    const pulse = 0.55 + 0.45 * Math.abs(Math.sin((app.runtime.now ? app.runtime.now() : Date.now()) / 900));
    ctx.fillStyle = 'rgba(240,192,96,' + pulse.toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(w / 2, h - 144, 5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, '点屏幕任意处 · 停下时辰', w / 2, h - 130, {
      size: 18, align: 'center', color: '#a2947a',
    });
    text(ctx, '停下后可以选择继续，或拔营离开。', w / 2, h - 102, {
      size: 14, align: 'center', color: '#6a6050',
    });
  },

  renderPause(app, ctx, w, h) {
    const st = app.state;
    text(ctx, '时辰停住了', PAD + 4, 190, { size: 34, color: '#f0c060' });
    text(ctx, this.pauseLine || '你把时辰按住了。', PAD + 4, 238, { size: 16, color: '#a2947a' });

    panel(ctx, PAD, 292, w - PAD * 2, 146, { fill: 'rgba(30,23,16,0.92)' });
    text(ctx, gameClockText(st), PAD + 22, 314, { size: 28, color: '#efe3c6' });
    text(ctx, '继续让时辰走，或者收拾营帐离开。', PAD + 22, 362, {
      size: 16, color: '#c9bda2',
    });

    app.ui.button(ctx, PAD, h - 226, w - PAD * 2, 78, '继续让时辰走', {
      id: 'camp_flow_continue', size: 26, fill: '#3a2c1e', onTap: function () {
        app.pop();
        if (app.state) app.state.campFlow = true;
      },
    });
    app.ui.button(ctx, PAD, h - 136, w - PAD * 2, 78, '拔营离开', {
      id: 'camp_flow_leave', size: 26, fill: '#4a241c', onTap: function () {
        if (app.state) app.state.campFlow = false;
        app.pop();
      },
    });
  },

  renderForeign(app, ctx, w, h) {
    const st = app.state;
    const wars = stateLib.factionWars(st);
    text(ctx, '外国战事', PAD + 4, 190, { size: 32, color: '#f0c060' });
    text(ctx, '只看别家交兵，不替你决定和谁开战。', PAD + 4, 234, { size: 15, color: '#a2947a' });

    const y0 = 278;
    const rowH = 64;
    const gap = 8;
    const viewBottom = h - 154;
    const viewH = Math.max(120, viewBottom - y0);
    this.foreignMax = Math.max(0, wars.length * (rowH + gap) - viewH);
    this.foreignScroll = Math.max(0, Math.min(this.foreignMax, this.foreignScroll || 0));

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, w, viewH);
    ctx.clip();
    wars.forEach(function (war, i) {
      const ry = y0 + i * (rowH + gap) - (app.top().scene.foreignScroll || 0);
      if (ry < y0 - rowH || ry > y0 + viewH + rowH) return;
      ctx.fillStyle = i % 2 ? '#201a14' : '#261f17';
      ctx.fillRect(PAD, ry, w - PAD * 2, rowH);
      const a = factionLabel(st, war.a);
      const b = factionLabel(st, war.b);
      const isMine = war.a === 'player' || war.b === 'player';
      text(ctx, a + ' 与 ' + b, PAD + 16, ry + 10, { size: 20, color: '#efe3c6' });
      text(ctx, '交兵 ' + Math.max(0, war.days) + ' 天' + (isMine ? ' · 其中有你' : ''),
        PAD + 16, ry + 38, { size: 14, color: isMine ? '#f0c060' : '#8a8070' });
    });
    ctx.restore();

    if (!wars.length) {
      text(ctx, '四境暂时没有两家交兵。', PAD + 8, y0 + 8, { size: 20, color: '#8a8070' });
    }
    if (this.foreignMax > 0) {
      const thumbH = Math.max(30, viewH * (viewH / (wars.length * (rowH + gap))));
      const thumbY = y0 + (viewH - thumbH) * (this.foreignScroll / this.foreignMax);
      ctx.fillStyle = 'rgba(80,66,46,0.4)';
      ctx.fillRect(w - 8, y0, 4, viewH);
      ctx.fillStyle = '#8a7448';
      ctx.fillRect(w - 8, thumbY, 4, thumbH);
    }

    text(ctx, '滚轮 / 上下拖动可看全部。', PAD, h - 150, {
      size: 14, color: '#8a8070',
    });
    app.ui.button(ctx, PAD, h - 78, w - PAD * 2, 58, '返回营帐', {
      id: 'camp_foreign_back', size: 24, fill: '#241c14', onTap: function () {
        this.view = 'menu';
      }.bind(this),
    });
  },

  renderWait(app, ctx, w, h) {
    const st = app.state;
    const self = this;
    text(ctx, '在这里待一会儿', PAD, 190, { size: 28, color: '#f0c060' });
    wrap(ctx, '队伍原地扎住，不拔营、不打仗。你等多久，天下就走多久；邻近的旗会不会靠过来，谁也说不准。',
      w - PAD * 2, 16).forEach(function (l, i) {
      text(ctx, l, PAD, 236 + i * 24, { size: 15, color: '#a2947a' });
    });

    const waits = [
      { h: 2, label: '2 个时辰', sub: '埋锅造饭，喘口气' },
      { h: 12, label: '半日', sub: '喂马、修甲、放斥候' },
      { h: 24, label: '一日', sub: '睡一整夜，天下照走' },
      { h: 72, label: '三日', sub: '等消息，也等援军' },
    ];
    let y = 318;
    waits.forEach(function (wt, i) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, 78, '', {
        id: 'wait_' + i, fill: 'rgba(38,29,20,0.9)', onTap: function () {
          const r = stateLib.campWait(st, wt.h);
          app.showToast(r.msg, 2.4);
          self.view = 'menu';
        },
      });
      text(ctx, wt.label, PAD + 20, y + 10, { size: 22, color: '#efe3c6' });
      text(ctx, wt.sub, PAD + 20, y + 42, { size: 14, color: '#8a8070' });
      y += 88;
    });

    app.ui.button(ctx, PAD, y + 8, w - PAD * 2, 58, '回营帐', {
      id: 'wait_back', size: 22, onTap: function () { self.view = 'menu'; },
    });
  },

  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.foreignScroll || 0, moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (this.view !== 'foreign' || !this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 5) this.drag.moved = Math.abs(dy);
    if (this.drag.moved > 5) {
      app.ui.pressed = null;
      this.foreignScroll = Math.max(0, Math.min(this.foreignMax || 0, this.drag.scroll - dy));
    }
  },

  onTouchEnd(app, x, y) {
    this.drag = null;
    if (this.view === 'flowing' && !app.lastHit) {
      this.pause(app, '你把时辰按住了。');
    }
  },

  onWheel(app, dy) {
    if (this.view !== 'foreign') return;
    this.foreignScroll = Math.max(0, Math.min(this.foreignMax || 0,
      (this.foreignScroll || 0) + dy));
  },

  leave(app) {
    if (app.state) app.state.campFlow = false;
  },
};

module.exports = CampScene;

  };

  /* js/scenes/help.js */
  __defs[39] = function (module, exports, __require) {
/**
 * 玩法：分类页（基础 / 战役 / 势力 / 兵种 / 结局）
 * 内容超出屏幕时可上下拖动。
 */

const { text, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { FACTIONS, CAMPAIGN, ENDINGS } = __require(5);
const { TROOPS } = __require(10);

const TABS = [
  { id: 'basic', label: '基础' },
  { id: 'guide', label: '攻略' },
  { id: 'campaign', label: '战役' },
  { id: 'troops', label: '兵种' },
  { id: 'factions', label: '势力' },
];

const TAB_H = 116;
const CONTENT_TOP = TAB_H + 10;

/** 每章的"该做什么"——只指路，不剧透后面发生什么 */
const HINTS = {
  reach_chenliu: '往东走到陈留。路上别停。',
  troops_30: '在陈留募兵，凑到 30 人，粮草按"两日口粮 × 3"备。',
  win_wuchao: '回官渡，到了会有一场硬仗。',
  take_xiapi: '南下打下邳。',
  win_chibi: '去赤壁或柴桑，水战自己会来。',
  win_yiling: '去夷陵。',
  win_final: '带 250 人以上，打进任意一座都城。',
};

/** 内容块：h1/p/gap/faction/troop/chapter/ending/sep */
function buildOps(app, tab) {
  const st = app.state;
  const ops = [];

  if (tab === 'basic') {
    ops.push({ t: 'h1', s: '基本循环' });
    ops.push({ t: 'p', s: '你从洛阳溃兵开始：30 个民兵、80 金钱、45 粮，还有一支天机简。' });
    ops.push({ t: 'p', s: '点地图行军，一格一格走。地形决定耗时：道路 1.3 小时一格，农田 1.9，林地 2.9，沼泽 4.3，渡河 4.6，山地走不了。' });
    ops.push({ t: 'p', s: '每过一天，全队按人头吃粮。断粮会跑兵、掉士气。长途前先在村子里把粮备足。' });
    ops.push({ t: 'h1', s: '城池与村庄' });
    ops.push({ t: 'p', s: '城里四件事：招兵、市场（货物 / 粮草 / 军械）、酒馆（接活、招英雄）、领主府（效忠、宣战、看情报）。' });
    ops.push({ t: 'p', s: '市场军械分十档：兵刃、甲胄、坐骑各十级，越往后价钱近乎翻倍，加成也跟着涨。别指望一进城就满级。' });
    ops.push({ t: 'p', s: '村里三件事：找壮丁（只有民兵，比城里便宜）、找村长买牛羊肉粮、屠村（抢钱抢粮，关系 -5，村子会记很久）。' });
    ops.push({ t: 'h1', s: '战斗' });
    ops.push({ t: 'p', s: '战前选战术：冲锋 / 结阵 / 包抄 / 弓弩先射。回合自动推进，双方同时结算，低阶兵先倒。' });
    ops.push({ t: 'p', s: '减员到三成半以下就溃。打不过可以撤——战前能"撤出"（不算败），战中"撤退"额外损失 25%。' });
    ops.push({ t: 'p', s: '撤退后有一段时间对方不会再贴上来，趁机走远。' });
    ops.push({ t: 'h1', s: '天机简' });
    ops.push({ t: 'p', s: '战斗中能落一笔：南风起（我方攻击大增）、风止（双方攻击减半，救下很多人）、名册（阵亡者部分回来）。' });
    ops.push({ t: 'p', s: '每落一笔，所有势力对你的好感 -6。用得越多，越没人信你写的东西。' });
    ops.push({ t: 'h1', s: '史册：翻旧账' });
    ops.push({ t: 'p', s: '底栏「史册」记天下事：近十二天一条不落，再往前只留城破、围城、斩将、归降这类大事；往下拖能翻旧账。' });
    ops.push({ t: 'p', s: '条目按类别着色：围城橙、集结青、战事金、天下蓝、归降绿；真正的大事前面加一枚 ◆。' });
    ops.push({ t: 'h1', s: '势力、领主与关系' });
    ops.push({ t: 'p', s: '曹操、刘备、孙权、袁绍、吕布、刘表、刘璋、轲比能、马腾、汉廷，共十家。' });
    ops.push({ t: 'p', s: '你抢他们的村、打他们的城、击败他们的领主，关系就会掉。低于 -25 即开战。' });
    ops.push({ t: 'p', s: '开战后，他们的领主在视野内会一路追着你打。跑得掉就跑，跑不掉就结阵、或者落一笔天机简。' });
    ops.push({ t: 'p', s: '在路上碰上领主，会先说话：了解生平、查看兵力、送礼、开战、问他忙什么、或者走开。' });
    ops.push({ t: 'p', s: '送礼：君主 100 金钱换 5 点关系，领兵者 3 点，普通将领 2 点。想结交真正说得上话的人，得舍得钱。' });
    ops.push({ t: 'p', s: '当场开战一次扣 25 点关系。关系低于 -25，他见到你就会动刀。' });
    ops.push({ t: 'h1', s: '声望' });
    ops.push({ t: 'p', s: '声望到 60 可在城里效忠。声望越高队伍上限越大：20 + 声望×0.35。' });
    ops.push({ t: 'p', s: '你的名字会随声望改：溃兵之首 → 一方游侠 → 小有威名 → 郡国校尉 → 一方诸侯 → 天下名将。' });
    ops.push({ t: 'h1', s: '地图缩放' });
    ops.push({ t: 'p', s: '地图右上角有 ＋ / － 两档：远望、常规、近看。拉远能看全境的路与旗，近看能看清每一队人的兵力数字。视野始终跟着你和你的队伍。' });
    ops.push({ t: 'p', s: '地图上的每一支队伍都是一幅小画：领主是骑手带两名步卒和一面旗，匪团按档位不同（青巾是破衣步卒，黄巾四人一队，乱军有骑，叛军两骑三卒）。' });
    ops.push({ t: 'h1', s: '扎营与等待' });
    ops.push({ t: 'p', s: '地图底栏收成四项：队伍 / 史册 / 扎营 / 菜单。天下大势、玩法说明都收进扎营，不再占底栏。' });
    ops.push({ t: 'p', s: '「在这里待一会儿」可等 2 时辰、半日、一日、三日；你不拔营，天下照走——诸侯会行军、集结、围城。' });
    ops.push({ t: 'p', s: '「招降俘虏」把牢里的领主收进旗下：没有旗必被拒；自立后城越多、声望越高，答应的机会越大；一方之主不会降。' });
    ops.push({ t: 'h1', s: '国战：谁跟谁翻脸' });
    ops.push({ t: 'p', s: '十家势力之间本来就有仇：曹操与袁绍（官渡）、曹操与吕布（兖州）、孙权与刘表（孙坚之死）、马腾与韩遂（西凉内斗）、刘璋与刘备（益州）。' });
    ops.push({ t: 'p', s: '宣战之后，双方所有领主互为敌人。大地图上他们撞见就厮杀，看见对方的旗会主动扑过去。' });
    ops.push({ t: 'p', s: '天下同时最多三场大战：各国会挑一座敌城，先在国内集结四到十二天，再开拔围城；守方领主收到烽火，最多四人驰援。' });
    ops.push({ t: 'p', s: '围城至少三天，最长八天。攻下后胜方留兵守七日；同一对国家三十天内不能再动兵。' });
    ops.push({ t: 'p', s: '除主线要点名的那几位，领主之间不会互相杀死：败的一方溃逃、退回老家，或者被人生擒。' });
    ops.push({ t: 'p', s: '被擒的领主押在城里。关一天，自己逃的概率涨一点（第一天约 2%，十天约 14%，一个月接近一半）；城被攻破时，牢里被这家关着的人会趁乱跑出来。' });
    ops.push({ t: 'h1', s: '俘虏与赎金' });
    ops.push({ t: 'p', s: '你亲手打赢一位领主，他是溃逃还是被你捆走，看运气。捆回来的关在营后，队伍页底部有入口。' });
    ops.push({ t: 'p', s: '牢里可以"收赎金"（按他的家底开价）或"放了"（声望 +12，他那一国对你和气些）。' });
    ops.push({ t: 'h1', s: '比武大会' });
    ops.push({ t: 'p', s: '每座城的菜单里有"比武大会"：交报名费，连打三场，前两场是本地好手，第三场从天下名将里抽。' });
    ops.push({ t: 'p', s: '不损兵、不死人，输了只是丢报名费。三场全胜拿赏钱（随声望涨）和 45 点声望，随行英雄也跟着长本事。' });
    ops.push({ t: 'p', s: '你的胜算看身板：军械、声望、随行英雄的加成都会算进去。打之前每一场都标了把握百分比。' });
    ops.push({ t: 'h1', s: '存档：最近一份 + 九个槽' });
    ops.push({ t: 'p', s: '标题页四项：新的开始 / 加载最近存档 / 加载保存存档（九个槽）/ 玩法。' });
    ops.push({ t: 'p', s: '游戏里每 45 秒自动存一份"最近"，另留一份上一份可回退；营帐菜单能手动存到九个槽里，也能删、能覆盖。' });
    return ops;
  }

  if (tab === 'guide') {
    ops.push({ t: 'h1', s: '前几天怎么活' });
    ops.push({ t: 'p', s: '1. 先往东走，别停。序章那支西凉步卒比你强得多，硬打会散伙。' });
    ops.push({ t: 'p', s: '2. 到陈留进村/进城，找壮丁。民兵便宜得几乎白给，先堆人数。' });
    ops.push({ t: 'p', s: '3. 粮草按"两日口粮 × 3"备。地图比过去大了一倍，路程一长就容易断粮。' });
    ops.push({ t: 'h1', s: '怎么赚钱（新手最缺的）' });
    ops.push({ t: 'p', s: '· 打青巾匪团：地图上到处是绿衣小队伍，人数 6-12，打散一队能拿 150-250 金钱。这是前期最稳的钱。' });
    ops.push({ t: 'p', s: '· 做酒馆的活：清剿、送粮、侦察，一桩 130-250 金钱，还涨声望和关系。' });
    ops.push({ t: 'p', s: '· 跑商：市场"货物"页买低价的粟米/盐/铁，用"估价"看哪座城收得贵，走一趟赚差价。驮队上限 80 件。' });
    ops.push({ t: 'p', s: '· 屠村：一次 90-200 金钱 + 40-85 粮，但关系 -5，声望也掉。缺钱时能用，别指望它长久。' });
    ops.push({ t: 'p', s: '· 打下贼巢：+120 金钱、+45 声望。' });
    ops.push({ t: 'h1', s: '匪团有等级' });
    ops.push({ t: 'p', s: '地图上的匪团按衣服颜色分级：青（最多，好打）、蓝（有弓有骑）、橙（成建制的山贼）、赤（只比领主差一线）。' });
    ops.push({ t: 'p', s: '青六成、蓝三成、橙 8%、赤 2%。主线没过半之前不会出橙和赤——前期地图上是安全的。' });
    ops.push({ t: 'p', s: '匪团也会和领主的部曲撞上，双方都掉人。你只在自己附近看得见这种混战。' });
    ops.push({ t: 'h1', s: '兵怎么买' });
    ops.push({ t: 'p', s: '低阶兵便宜得像消耗品，高阶兵一件就是一笔钱。民兵几个金钱，枪盾二十上下，亲卫一百多，禁军两百多。' });
    ops.push({ t: 'p', s: '村庄的壮丁最便宜，但只有民兵；城里的兵种多，价钱也高。前期靠民兵堆量，中期再换枪盾和弓。' });
    ops.push({ t: 'h1', s: '英雄' });
    ops.push({ t: 'p', s: '酒馆角落里坐着一些不起眼的人：廖化、周仓、马岱、凌统、丁奉、李典、乐进、于禁……' });
    ops.push({ t: 'p', s: '花一笔钱能请进队伍，随队不死，打仗攒经验，1 到 10 级。' });
    ops.push({ t: 'p', s: '每人的长处不一样：有人添攻击，有人添防御，有人让队伍跑得快、吃得少、缴获多，还有老将每天给队伍提士气。' });
    ops.push({ t: 'p', s: '随行名额看声望：开局 3 位，声望每 30 点加一位，最多 15 位。队伍页里点英雄的名字能和他说话，也能让他走（后会有期，回旧地还能再遇见）。' });
    ops.push({ t: 'p', s: '队伍页里每个兵种行右边有"遣1 / 遣5"，把兵遣散省口粮；遣散不退钱。' });
    ops.push({ t: 'h1', s: '打不过怎么办' });
    ops.push({ t: 'p', s: '战前"撤出"、战中"撤退"都行。撤出后再走一格，对方短时间追不上。' });
    ops.push({ t: 'p', s: '真被打光了，天会往回退一天——醒来时人在最近的城里，队伍会重新拉起来。' });
    return ops;
  }

  if (tab === 'campaign') {
    const stage = st ? st.campaign.stage : 0;
    ops.push({ t: 'h1', s: '主线战役' });
    ops.push({ t: 'p', s: '一共七章，标题在这里；每一章具体发生什么，走到那一步就知道了。' });
    CAMPAIGN.forEach(function (ch, i) {
      const done = i < stage;
      const active = i === stage;
      ops.push({
        t: 'chapter', ch, done, active, hint: HINTS[ch.check] || ch.goal,
      });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'p', s: '提示：战役战的敌人是预设的，比你强。先把兵练起来，再来打。' });
    return ops;
  }

  if (tab === 'factions') {
    ops.push({ t: 'h1', s: '十路势力' });
    ops.push({ t: 'p', s: '关系 -25 以下即开战。开战后领主会主动追杀，城池也不能进。' });
    Object.keys(FACTIONS).forEach(function (id) {
      if (id === 'bandit' || id === 'player') return;
      const f = FACTIONS[id];
      const rel = st ? stateLib.relationOf(st, id) : 0;
      ops.push({ t: 'faction', f, rel, sworn: st && st.player.faction === id });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'h1', s: '黄巾与山贼' });
    ops.push({ t: 'p', s: '六处贼巢，全部敌对。攻破一处声望 +45、金钱 +120，且不再刷匪团。' });
    return ops;
  }

  if (tab === 'troops') {
    ops.push({ t: 'h1', s: '兵种' });
    ops.push({ t: 'p', s: '攻/防/耐久决定硬碰硬的结果；粮是每人每天的口粮；价是招募底价，随城池浮动。' });
    const sorted = Object.keys(TROOPS).sort(function (a, b) { return TROOPS[a].tier - TROOPS[b].tier; });
    sorted.forEach(function (id) {
      ops.push({ t: 'troop', t2: TROOPS[id] });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'p', s: '特殊：弩手破甲、火船手点火、白毦兵与禁军不溃、无当飞军山地不减速、枪盾结阵克骑。' });
    return ops;
  }

  ops.push({ t: 'p', s: '走到最后，站在谁后面、用了几支天机简，会决定这一页怎么收尾——具体怎么写，留到最后自己看。' });
  return ops;
}

/** 粗略估算每块高度 */
function opHeight(op, ctx, w) {
  if (op.t === 'h1') return 54;
  if (op.t === 'p') {
    const lines = wrap(ctx, op.s, w - 48, 18, 'bold');
    return lines.length * 30 + 12;
  }
  if (op.t === 'gap') return 24;
  if (op.t === 'chapter') return 124;
  if (op.t === 'faction') return 96;
  if (op.t === 'troop') return 76;
  if (op.t === 'ending') return 148;
  return 30;
}

function renderOps(app, ops, scroll, w, h, ctx) {
  let y = CONTENT_TOP - scroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, CONTENT_TOP, w, h - CONTENT_TOP);
  ctx.clip();

  ops.forEach(function (op) {
    const hh = opHeight(op, ctx, w);

    if (op.t === 'h1') {
      ctx.fillStyle = UI_COLORS.accent;
      ctx.fillRect(24, y + 12, 5, 26);
      text(ctx, op.s, 40, y + 10, { size: 28, color: '#f0c060' });
      y += hh;
      return;
    }
    if (op.t === 'p') {
      const lines = wrap(ctx, op.s, w - 48, 18, 'bold');
      lines.forEach(function (line, i) {
        text(ctx, line, 24, y + 4 + i * 30, { size: 18, color: '#c9bda2' });
      });
      y += hh;
      return;
    }
    if (op.t === 'gap') {
      y += hh;
      return;
    }
    if (op.t === 'chapter') {
      const ch = op.ch;
      ctx.fillStyle = op.done ? 'rgba(30,40,28,0.6)' : op.active ? 'rgba(60,44,24,0.75)' : 'rgba(24,20,16,0.5)';
      ctx.fillRect(20, y, w - 40, hh - 12);
      ctx.fillStyle = op.active ? UI_COLORS.accent : op.done ? UI_COLORS.good : '#4a3826';
      ctx.fillRect(20, y, 6, hh - 12);
      text(ctx, (op.done ? '✓ ' : op.active ? '▶ ' : '· ') + ch.title, 40, y + 10, {
        size: 22, color: op.done ? '#8fbf7a' : op.active ? '#f0c060' : '#9c907a',
      });
      text(ctx, '目标：' + ch.goal, 40, y + 44, { size: 16, color: '#c9bda2' });
      if (op.hint) {
        const lines = wrap(ctx, '怎么走：' + op.hint, w - 96, 15, 'bold');
        lines.slice(0, 2).forEach(function (line, i) {
          text(ctx, line, 40, y + 70 + i * 24, { size: 15, color: '#8a8070' });
        });
      }
      y += hh;
      return;
    }
    if (op.t === 'faction') {
      const f = op.f;
      ctx.fillStyle = f.color;
      ctx.fillRect(24, y + 4, 8, 44);
      text(ctx, f.name + ' · ' + f.full, 44, y, { size: 24, color: f.color });
      const rel = op.rel;
      text(ctx, '关系 ' + rel + (op.sworn ? ' · 已效忠' : ''), w - 24, y + 4, {
        size: 18, align: 'right', color: rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#a2947a',
      });
      text(ctx, f.desc, 44, y + 34, { size: 15, color: '#8a8070' });
      y += hh;
      return;
    }
    if (op.t === 'troop') {
      const t = op.t2;
      ctx.fillStyle = 'rgba(24,20,16,0.55)';
      ctx.fillRect(20, y, w - 40, hh - 8);
      text(ctx, t.name, 32, y + 8, { size: 21, color: '#efe3c6' });
      text(ctx, 'T' + t.tier, w - 30, y + 10, { size: 14, align: 'right', color: '#8a8070' });
      text(ctx, '攻 ' + t.atk + '  防 ' + t.def + '  耐久 ' + t.hp + '  粮 ' + t.food, 32, y + 36, {
        size: 15, color: '#a2947a',
      });
      text(ctx, t.recruit ? t.recruit + ' 金钱' : '不卖', w - 30, y + 36, {
        size: 16, align: 'right', color: '#f0c060',
      });
      y += hh;
      return;
    }
    if (op.t === 'ending') {
      text(ctx, op.title, 24, y, { size: 26, color: '#f0c060' });
      text(ctx, op.cond, w - 24, y + 4, { size: 15, align: 'right', color: '#8a8070' });
      const lines = wrap(ctx, op.text, w - 48, 16, 'bold');
      lines.slice(0, 3).forEach(function (line, i) {
        text(ctx, line, 24, y + 36 + i * 26, { size: 16, color: '#c9bda2' });
      });
      y += hh;
      return;
    }
  });

  ctx.restore();
}

const HelpScene = {
  enter(app) {
    app.helpView = { tab: 'basic', scroll: 0, dragging: false, startY: 0, startScroll: 0 };
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const hv = app.helpView;

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    // 标题
    text(ctx, '玩法', 20, 26, { size: 36, color: '#f0c060' });
    text(ctx, '骑砍大师 · 三国', w - 20, 38, { size: 17, align: 'right', color: '#8a8070' });

    // 分类 tab
    const tabW = (w - 40) / TABS.length;
    TABS.forEach(function (t, i) {
      const x = 20 + i * tabW;
      const active = hv.tab === t.id;
      ctx.fillStyle = active ? '#3a2c1e' : '#201a14';
      ctx.fillRect(x, 74, tabW - 6, 48);
      ctx.fillStyle = active ? UI_COLORS.accent : '#3a2c1e';
      ctx.fillRect(x, 74, tabW - 6, 3);
      text(ctx, t.label, x + (tabW - 6) / 2, 86, {
        size: 21, align: 'center', color: active ? '#f0c060' : '#a2947a',
      });
      app.ui.rect('tab_' + t.id, x, 74, tabW - 6, 48, function () {
        hv.tab = t.id;
        hv.scroll = 0;
      });
    });

    const ops = buildOps(app, hv.tab);
    let total = 12;
    ops.forEach(function (op) { total += opHeight(op, ctx, w); });

    const maxScroll = Math.max(0, total - (h - CONTENT_TOP) + 20);
    hv.scroll = Math.min(maxScroll, Math.max(0, hv.scroll));
    hv.maxScroll = maxScroll;

    renderOps(app, ops, hv.scroll, w, h, ctx);

    // 返回
    app.ui.button(ctx, 20, h - 92, w - 40, 72, '返回', {
      id: 'help_back', size: 26, onTap: function () { app.pop(); },
    });
    if (maxScroll > 0) {
      text(ctx, '↑↓ 可拖动', w - 20, h - 128, { size: 15, align: 'right', color: '#6a6050' });
    }
  },

  onTouchStart(app, x, y) {
    const hv = app.helpView;
    hv.dragging = false;
    hv.startY = y;
    hv.startScroll = hv.scroll;
  },

  onTouchMove(app, x, y) {
    const hv = app.helpView;
    const dy = y - hv.startY;
    if (!hv.dragging && Math.abs(dy) > 14) hv.dragging = true;
    if (hv.dragging) hv.scroll = hv.startScroll - dy;
  },

  onTouchEnd(app) {
    const hv = app.helpView;
    if (hv.maxScroll !== undefined) {
      hv.scroll = Math.min(hv.maxScroll, Math.max(0, hv.scroll));
    }
  },
};

module.exports = HelpScene;

  };

  /* js/scenes/chapter.js */
  __defs[40] = function (module, exports, __require) {
/**
 * 章节提示：浮在地图中央的一张卡片，让玩家看见"现在该干什么"
 * 3.6 秒后自动收起，也可以点一下直接收
 */

const { text, wrap, panel } = __require(6);
const { UI_COLORS } = __require(3);
const { CAMPAIGN } = __require(5);
const stateLib = __require(7);

const HOLD = 3.6;

const ChapterScene = {
  enter(app, params) {
    const ch = CAMPAIGN.filter(function (c) { return c.id === params.id; })[0] || CAMPAIGN[0];
    const info = app.state ? stateLib.campaignInfo(app.state) : null;
    app.chapterView = {
      ch,
      hint: info && info.id === ch.id ? info.hint : ch.goal,
      t: 0,
      fade: 0,
    };
  },

  update(app, dt) {
    const v = app.chapterView;
    if (!v) return;
    v.t += dt;
    v.fade = Math.min(1, v.t / 0.25);
    if (v.t > HOLD) app.pop();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const v = app.chapterView;
    if (!v) return;
    const ch = v.ch;
    const a = v.fade;

    // 底下的地图先照常画一遍，弹的是"浮在地图上"的卡
    const below = app.stack.length > 1 ? app.stack[app.stack.length - 2] : null;
    if (below && below.scene && below.scene.render) {
      below.scene.render(app);
      // 下层注册的按钮不作数，避免穿透点击
      app.ui.items.length = 0;
    }

    ctx.fillStyle = 'rgba(6,5,4,' + (0.66 * a) + ')';
    ctx.fillRect(0, 0, w, h);

    const cw = Math.min(w - 64, 620);
    const chHeight = Math.min(h - 150, 300);
    const cx = (w - cw) / 2;
    const cy = (h - chHeight) / 2;
    const up = (HOLD - v.t) / HOLD;

    panel(ctx, cx, cy, cw, chHeight, { fill: '#1d1710' });

    text(ctx, '第 ' + (CAMPAIGN.indexOf(ch) + 1) + ' 章 · 开启', cx + cw / 2, cy + 16, {
      size: 17, align: 'center', color: '#8a8070',
    });
    text(ctx, ch.title, cx + cw / 2, cy + 40, { size: 30, align: 'center', color: '#f0c060' });

    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(cx + cw / 2 - 60, cy + 84, 120, 3);

    // 目标 + 怎么走：两段分开算高度，避免叠字
    let y = cy + 100;
    const goalLines = wrap(ctx, ch.goal, cw - 116, 20, 'bold').slice(0, 2);
    text(ctx, '目标', cx + 32, y + 2, { size: 16, color: '#8a8070' });
    goalLines.forEach(function (l, i) {
      text(ctx, l, cx + 92, y + i * 28, { size: 20, color: '#efe3c6' });
    });
    y += Math.max(1, goalLines.length) * 28 + 12;

    const hintLines = wrap(ctx, v.hint || '', cw - 116, 19, 'bold').slice(0, 3);
    text(ctx, '怎么走', cx + 32, y + 2, { size: 16, color: '#8a8070' });
    hintLines.forEach(function (l, i) {
      text(ctx, l, cx + 92, y + i * 26, { size: 19, color: '#c9bda2' });
    });
    y += Math.max(1, hintLines.length) * 26 + 14;

    if (ch.reward) {
      const parts = [];
      if (ch.reward.gold) parts.push(ch.reward.gold + ' 金钱');
      if (ch.reward.renown) parts.push(ch.reward.renown + ' 声望');
      if (ch.reward.shi) parts.push(ch.reward.shi + ' 支天机简');
      if (ch.reward.banner) parts.push('一面自己的旗');
      if (parts.length) {
        text(ctx, '得：' + parts.join(' · '), cx + 32, y, { size: 16, color: '#f0c060' });
      }
    }

    // 自动收起的进度条
    const barY = cy + chHeight - 18;
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(cx + 40, barY, cw - 80, 3);
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(cx + 40, barY, (cw - 80) * Math.max(0, up), 3);

    text(ctx, '点一下收起来 · 左上角随时能看', cx + cw / 2, cy + chHeight + 12, {
      size: 15, align: 'center', color: '#8a8070',
    });

    app.ui.rect('chapter_tap', 0, 0, w, h, function () { app.pop(); });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ChapterScene;

  };

  /* js/scenes/news.js */
  __defs[41] = function (module, exports, __require) {
/**
 * 天下通报：国亡、君主下落、两国宣战/议和这类大事，全屏弹一张榜文。
 * 国亡等大事要点"知道了"；宣战议和这类军情只停几息，自己散。
 */

const { text, wrap, panel } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);

/** 宣战背景：两军在山前列阵，中间已经撞在一起 */
function drawWarArt(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#161b24');
  sky.addColorStop(0.45, '#4a2b24');
  sky.addColorStop(1, '#160d0a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 远处的火线与烟
  ctx.fillStyle = 'rgba(210,96,54,0.22)';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.44, w * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(60,42,34,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.48);
  ctx.quadraticCurveTo(w * 0.26, h * 0.34, w * 0.5, h * 0.46);
  ctx.quadraticCurveTo(w * 0.78, h * 0.3, w, h * 0.46);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 山脊
  ctx.fillStyle = '#241a16';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.52);
  ctx.lineTo(w * 0.18, h * 0.38);
  ctx.lineTo(w * 0.32, h * 0.5);
  ctx.lineTo(w * 0.5, h * 0.34);
  ctx.lineTo(w * 0.68, h * 0.5);
  ctx.lineTo(w * 0.84, h * 0.39);
  ctx.lineTo(w, h * 0.5);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 两边的军阵：左赤、右青，长矛一层层压上去
  function army(cx, dir, color, trim) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const x = cx + dir * (col * 17 + (row % 2) * 7) - 8;
        const y = h * 0.20 + row * 20;
        ctx.fillStyle = 'rgba(10,8,6,0.55)';
        ctx.fillRect(x + 2, y + 4, 12, 22);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 11, 18);
        ctx.fillStyle = trim;
        ctx.fillRect(x + 2, y - 5, 7, 6);
        ctx.fillStyle = '#d8c79e';
        ctx.fillRect(x + 9, y + 3, 6, 2); // 枪尖的方向
        ctx.fillStyle = '#6e5738';
        ctx.fillRect(x + 6, y - 26, 2, 26);
      }
    }
  }
  army(w * 0.3, -1, '#6e2c22', '#c9824e');
  army(w * 0.7, 1, '#203b48', '#6fa4a8');

  // 军旗
  ctx.fillStyle = '#3a241c';
  ctx.fillRect(w * 0.18, h * 0.08, 4, h * 0.18);
  ctx.fillStyle = '#9e3d2c';
  ctx.fillRect(w * 0.19, h * 0.08, 42, 30);
  ctx.fillStyle = '#250f0b';
  text(ctx, '战', w * 0.19 + 21, h * 0.08 + 5, { size: 24, align: 'center', color: '#f0d9a8' });
  ctx.fillStyle = '#1e2c33';
  ctx.fillRect(w * 0.79, h * 0.08, 4, h * 0.18);
  ctx.fillStyle = '#2e5a66';
  ctx.fillRect(w * 0.79, h * 0.08, 46, 30);
  text(ctx, '兵', w * 0.79 + 23, h * 0.08 + 5, { size: 24, align: 'center', color: '#d8ece8' });

  // 交锋处火星
  const pulse = 0.45 + 0.4 * Math.abs(Math.sin(t * 2.1));
  ctx.fillStyle = 'rgba(245,183,80,' + pulse.toFixed(2) + ')';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.27, 28 + Math.sin(t * 3) * 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,210,160,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = -0.9 + i * 0.25;
    const len = 44 + (i % 3) * 10;
    ctx.moveTo(w * 0.5, h * 0.27);
    ctx.lineTo(w * 0.5 + Math.cos(a) * len, h * 0.27 + Math.sin(a) * len);
  }
  ctx.stroke();

  // 地面
  ctx.fillStyle = '#140f0c';
  ctx.fillRect(0, h * 0.34, w, h * 0.66);
  ctx.fillStyle = 'rgba(160,110,70,0.18)';
  ctx.fillRect(0, h * 0.34, w, 2);
}

/** 停战背景：城门外的使团，两家各执一卷文书 */
function drawPeaceArt(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#26313a');
  sky.addColorStop(0.45, '#6f6150');
  sky.addColorStop(0.8, '#c49a6c');
  sky.addColorStop(1, '#33251b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 晨光
  const sun = ctx.createRadialGradient(w * 0.5, h * 0.34, 10, w * 0.5, h * 0.34, w * 0.42);
  sun.addColorStop(0, 'rgba(255,222,160,0.55)');
  sun.addColorStop(1, 'rgba(255,222,160,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // 远处城郭
  ctx.fillStyle = '#2d241c';
  ctx.fillRect(w * 0.18, h * 0.10, w * 0.64, 5);
  ctx.fillRect(w * 0.2, h * 0.10, 8, h * 0.10);
  ctx.fillRect(w * 0.78, h * 0.10, 8, h * 0.10);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(w * 0.24 + i * w * 0.13, h * 0.10, 24, 18); // 城垛
  }

  // 桌子与两卷文书
  ctx.fillStyle = '#3a291c';
  ctx.fillRect(w * 0.28, h * 0.24, w * 0.44, 8);
  ctx.fillRect(w * 0.32, h * 0.25, 6, 16);
  ctx.fillRect(w * 0.68, h * 0.25, 6, 16);

  // 两位使者：一赤一青，各伸手交卷
  function envoy(x, dir, robe, trim) {
    ctx.fillStyle = 'rgba(10,8,6,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + dir * 10, h * 0.39, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(x - 22, h * 0.37);
    ctx.lineTo(x - 12, h * 0.18);
    ctx.lineTo(x + 12, h * 0.18);
    ctx.lineTo(x + 24, h * 0.37);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(x - 13, h * 0.17, 26, 8);
    ctx.fillStyle = '#d9b07e';
    ctx.beginPath();
    ctx.arc(x, h * 0.14, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2119';
    ctx.fillRect(x - 11, h * 0.12, 22, 6);
    // 袖与手
    ctx.fillStyle = robe;
    ctx.fillRect(x + dir * 8, h * 0.22, dir * 26, 9);
    ctx.fillStyle = '#d9b07e';
    ctx.fillRect(x + dir * 33, h * 0.23, 7, 7);
  }
  envoy(w * 0.33, 1, '#6d2c24', '#b77a4c');
  envoy(w * 0.67, -1, '#25404a', '#7ea4a8');

  // 中间文书：一点点递过去
  const lift = Math.sin(t * 0.9) * 2;
  ctx.fillStyle = '#e4d3ac';
  ctx.fillRect(w * 0.44, h * 0.23 + lift, w * 0.12, 7);
  ctx.fillStyle = '#b08b58';
  ctx.fillRect(w * 0.44, h * 0.23 + lift, 4, 7);
  ctx.fillRect(w * 0.44 + w * 0.12 - 4, h * 0.23 + lift, 4, 7);

  // 两侧旗帜
  ctx.fillStyle = '#4a3223';
  ctx.fillRect(w * 0.18, h * 0.08, 3, h * 0.16);
  ctx.fillStyle = '#8e3528';
  ctx.fillRect(w * 0.18, h * 0.08, 38, 26);
  text(ctx, '使', w * 0.18 + 19, h * 0.08 + 2, { size: 22, align: 'center', color: '#f0d9a8' });
  ctx.fillStyle = '#4a3223';
  ctx.fillRect(w * 0.8, h * 0.08, 3, h * 0.16);
  ctx.fillStyle = '#2f5661';
  ctx.fillRect(w * 0.77, h * 0.08, 38, 26);
  text(ctx, '和', w * 0.77 + 20, h * 0.08 + 2, { size: 22, align: 'center', color: '#d8ece8' });

  ctx.fillStyle = '#1a130d';
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  ctx.fillStyle = 'rgba(220,185,130,0.16)';
  ctx.fillRect(0, h * 0.82, w, 2);
}

const NewsScene = {
  enter(app, params) {
    const ev = params || {};
    app.newsView = {
      title: ev.title || '榜文',
      lines: Array.isArray(ev.lines) ? ev.lines.slice(0, 6) : [],
      tag: ev.tag || (ev.factionId ? '天下' : '军情'),
      mode: ev.mode || 'notice',
      factionId: ev.factionId || null,
      auto: ev.auto || 0,
      art: ev.art || null,
      skipAny: !!ev.skipAny,
      t: 0,
    };
  },

  update(app, dt) {
    const v = app.newsView;
    if (!v) return;
    v.t += dt;
    if (v.mode !== 'peace-offer' && v.auto > 0 && v.t >= v.auto) {
      app.newsView = null;
      app.pop();
    }
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const v = app.newsView;
    if (!v) return;

    // 全屏榜文：底下的地图不重画，免得和别的弹窗互相套娃
    if (v.art === 'war') drawWarArt(ctx, w, h, v.t);
    else if (v.art === 'peace') drawPeaceArt(ctx, w, h, v.t);
    else {
      ctx.fillStyle = '#0b0906';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.fillStyle = v.art ? 'rgba(6,5,4,0.10)' : 'rgba(6,5,4,0.55)';
    ctx.fillRect(0, 0, w, h);

    const lines = v.lines.length ? v.lines : ['天下无事。'];
    const cw = Math.min(w - 56, 640);
    const bodyTop = 126;
    const lineGap = 30;
    let bodyH = 0;
    const wrapped = lines.map(function (l) {
      const ls = wrap(ctx, l, cw - 72, 19).slice(0, 3);
      bodyH += ls.length * lineGap;
      return ls;
    });
    const chHeight = Math.min(h - 120, bodyTop + bodyH + 96);
    const cx = (w - cw) / 2;
    const cy = v.art ? Math.max(120, h - chHeight - 24) : (h - chHeight) / 2;

    panel(ctx, cx, cy, cw, chHeight, { fill: v.art ? 'rgba(22,16,12,0.72)' : '#1a1410' });

    text(ctx, '— ' + v.tag + ' —', cx + cw / 2, cy + 16, {
      size: 15, align: 'center', color: '#8a8070',
    });
    text(ctx, v.title, cx + cw / 2, cy + 42, { size: 30, align: 'center', color: '#d05040' });

    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(cx + cw / 2 - 56, cy + 86, 112, 3);

    let y = cy + bodyTop;
    wrapped.forEach(function (ls) {
      ls.forEach(function (l) {
        text(ctx, l, cx + 36, y, { size: 19, color: '#e6d8ba' });
        y += lineGap;
      });
      y += 6;
    });

    if (v.mode === 'peace-offer') {
      text(ctx, '接受：两家罢兵，关系归零，天机简 +1。  拒绝：不留任何影响。',
        cx + cw / 2, cy + chHeight - 78, {
          size: 15, align: 'center', color: '#a2947a',
        });
      const bw = (cw - 120 - 14) / 2;
      const by = cy + chHeight - 58;
      app.ui.button(ctx, cx + 60, by, bw, 46, '接受议和 · +1 天机简', {
        id: 'peace_offer_accept', size: 19, fill: '#3a4a2e', onTap: function () {
          const r = stateLib.acceptPeaceOffer(app.state, v.factionId);
          if (!r.ok) { app.showToast(r.msg, 2.4); return; }
          app.newsView = null;
          app.pop();
          app.showToast(r.msg, 3);
        },
      });
      app.ui.button(ctx, cx + 60 + bw + 14, by, bw, 46, '拒绝', {
        id: 'peace_offer_reject', size: 19, fill: '#4a241c', onTap: function () {
          const r = stateLib.rejectPeaceOffer(app.state, v.factionId);
          app.newsView = null;
          app.pop();
          if (r.ok) app.showToast(r.msg, 2.4);
        },
      });
    } else {
      text(ctx, v.skipAny
        ? '点屏幕任意处跳过 · ' + Math.max(0, Math.ceil(v.auto - v.t)) + ' 息后自散'
        : (v.auto > 0 ? '军情传得很快，几息后自己散。' : '榜文贴在各城门口，来往的人都在看。'),
        cx + cw / 2, cy + chHeight - 74, {
          size: 15, align: 'center', color: '#8a8070',
        });

      const bx = cx + 60;
      const by = cy + chHeight - 58;
      const bw = cw - 120;
      ctx.fillStyle = '#3a2c1e';
      ctx.fillRect(bx, by, bw, 46);
      ctx.fillStyle = '#6b5540';
      ctx.fillRect(bx, by, bw, 2);
      text(ctx, v.skipAny
        ? '跳过（' + Math.max(0, Math.ceil(v.auto - v.t)) + '）'
        : (v.auto > 0 ? '知道了（' + Math.max(0, Math.ceil(v.auto - v.t)) + '）' : '知道了'),
        cx + cw / 2, by + 12, { size: 22, align: 'center', color: '#f0c060' });
      app.ui.rect('news_ok', bx, by, bw, 46, function () {
        app.newsView = null;
        app.pop();
      });
    }
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd(app) {
    const v = app.newsView;
    if (v && v.skipAny) {
      app.newsView = null;
      app.pop();
    }
  },
};

module.exports = NewsScene;

  };

  /* js/scenes/arc.js */
  __defs[42] = function (module, exports, __require) {
/**
 * 长夜篇：第一次统一后的庆祝、三十天大旱、流亡边陲、再统一与尾声。
 * 这一页只负责把大事讲清楚；真正的倒计时和天下局势在大地图左上角。
 */

const { text, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const { drawBackdrop } = __require(25);

const ArcScene = {
  enter(app, params) {
    this.phase = (params && params.phase) || (app.state && app.state.arc && app.state.arc.phase) || 'celebration';
    this.t = 0;
  },
  update(app, dt) { this.t += dt || 0; },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.replace('title'); return; }
    const arc = st.arc || {};
    const phase = this.phase === 'finale' ? 'finale' : this.phase;
    const data = phase === 'celebration'
      ? {
        title: '天下归一',
        sub: '距大旱还有 ' + Math.max(0, (arc.disasterDay || st.clock.day) - st.clock.day) + ' 天',
        lines: [
          st.player.faction && st.player.faction !== 'player' && st.player.country
            ? '你随着' + st.player.country.name + '的旗，走到了最后一座城。'
            : '你把自己的旗插上了最后一座城。',
          '各地使者排队递上降表。你在城楼上站了很久，风从西边来，带着一点土味。',
          '从今天起，天下只有一个年号。只是西边的云，已经开始发黄。',
        ],
        btn: '继续守这三十天',
      }
      : phase === 'disaster'
        ? {
          title: '大旱 · 天下皆反',
          sub: '第三十天',
          lines: [
            '西边的天一直黄着。井先干了，然后是河。',
            '粮价一天三涨。路边开始有人交换孩子；史官只写了四个字：易子而食。',
            '各地豪强把你的旗从城头扯下来，换上了自己的。你所在的城市被反贼围了。',
            '你带着还能走的旧部，从北门杀出去。天亮时，在一座地图边缘的小城停下。',
            '从今天起，全国都在捉拿你。只有从你队伍里出去的领主，还愿意站在你这边。',
          ],
          btn: '在边陲小城落脚',
        }
        : phase === 'finale'
          ? {
            title: '国泰民安',
            sub: '重定天下 · 第 ' + (arc.finaleDay || st.clock.day) + ' 天',
            lines: [
              '你带着旧部从边陲小城一路打回都城。城门开时，城里的人跪了一地。',
              '你在大殿上摆下酒席，把一路跟来的旧部一个个叫到面前。',
              '封侯、赐地、赦天下。史官在殿下写：天下再定，百姓始安。',
              '你终于可以把刀放下。只是这片大陆的风，还没有停。',
            ],
            btn: null,
          }
          : {
            title: '边陲小城',
            sub: '与天下为敌',
            lines: [
              '这座小城在地图上原本没有名字。你逃到这里的那天，它才出现。',
              '城墙不高，粮也不多。但城门上还没有挂别人的旗。',
              '旧部在城外点起几堆火。你们要从这里，再把天下走一遍。',
            ],
            btn: '重走统一路',
          };

    drawBackdrop(ctx, phase === 'finale' || phase === 'celebration' ? 'hall' : 'battle', w, h, 77);
    ctx.fillStyle = 'rgba(8,6,4,0.58)';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(240,192,96,0.12)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    text(ctx, data.title, w / 2, h * 0.16, { size: 52, align: 'center', color: '#f0c060' });
    text(ctx, data.sub, w / 2, h * 0.16 + 56, { size: 16, align: 'center', color: '#a2947a' });
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(w / 2 - 60, h * 0.16 + 84, 120, 2);

    let y = h * 0.16 + 118;
    data.lines.forEach(function (line) {
      wrap(ctx, line, w - 64, 22, 'bold').forEach(function (l) {
        text(ctx, l, w / 2, y, { size: 21, align: 'center', color: '#e6d7b6' });
        y += 34;
      });
      y += 8;
    });

    if (phase === 'finale') {
      const stats = '第 ' + st.clock.day + ' 天 · 胜 ' + st.stats.battlesWon + ' · 城 ' + st.stats.sitesTaken
        + ' · 兵 ' + __require(9).troopCount(st.player.troops);
      text(ctx, stats, w / 2, h - 188, { size: 15, align: 'center', color: '#8a8070' });
      app.ui.button(ctx, 40, h - 164, w - 80, 66, '留在这片大陆', {
        id: 'arc_stay', size: 24, fill: '#3a2b1b', onTap: function () {
          st.arc.phase = 'sandbox';
          st.events.push({ type: 'warning', text: '你留在了这片大陆。天下已定，但烽火还可以再点。' });
          app.replace('map');
        },
      });
      app.ui.button(ctx, 40, h - 88, w - 80, 58, '离开 · 回到标题', {
        id: 'arc_leave', size: 22, fill: '#201a14', onTap: function () {
          st.arc.phase = 'done';
          st.ending = {
            type: 'arc',
            title: '谢君一游',
            text: '你放下了刀，走出了这座城。\n\n天下很大，故事到这里。\n\n感谢你游玩《风云三国》。\n本游戏由骑砍大师制作，献给每一个还愿意在乱世里走一遭的人。',
          };
          st.gameOver = true;
          app.replace('ending');
        },
      });
      return;
    }

    app.ui.button(ctx, 44, h - 128, w - 88, 70, data.btn, {
      id: 'arc_go', size: 25, fill: '#3a2b1b', onTap: function () {
        app.replace('map');
      },
    });
    text(ctx, '这一段不跳时间；点下去，继续走。', w / 2, h - 42, { size: 14, align: 'center', color: '#8a8070' });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ArcScene;

  };

  /* js/scenes/chase.js */
  __defs[43] = function (module, exports, __require) {
/**
 * 被追上：处于战争状态的人贴到你身上，就没有"自选撤离"了。
 * 三条路：给钱买路（一天内不追）/ 坦然开战 / 留人断后（折兵换他停几个时辰）。
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { FACTIONS } = __require(5);
const { TROOPS } = __require(10);
const { lookFor } = __require(12);

function unitOf(app) {
  const d = app.chase;
  if (!d) return null;
  if (d.kind === 'party') {
    return app.state.parties.filter(function (p) { return p.id === d.id; })[0] || null;
  }
  return app.state.lords.filter(function (l) { return l.id === d.id; })[0] || null;
}

function compText(troops) {
  return Object.keys(troops || {}).map(function (id) {
    return (TROOPS[id] ? TROOPS[id].name : id) + ' ' + (troops[id] || 0);
  }).join(' · ');
}

/** 最近几条战事，给被追上的页面垫一点前情 */
function recentWarLines(st, n) {
  const out = [];
  for (let i = st.log.length - 1; i >= 0 && out.length < n; i--) {
    out.push((st.log[i].text || '').slice(0, 26));
  }
  return out;
}

/** 西凉步卒专用：不买路、不对战，只给“留人断后”一条路 */
function renderIronChase(app, ctx, w, h, st, unit) {
  const mine = army.troopCount(st.player.troops);
  const foe = army.troopCount(unit.troops || {});
  ctx.fillStyle = '#0d0a07';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7a2118';
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, 0, w, 230);
  ctx.globalAlpha = 1;

  text(ctx, '西 凉 步 卒', w / 2, 22, { size: 20, align: 'center', color: '#e08a70' });
  text(ctx, '步卒追上来了', w / 2, 60, { size: 44, align: 'center', color: '#f5e9cf', shadow: true });
  text(ctx, '他们不列阵，也不收买路钱。', w / 2, 120, { size: 18, align: 'center', color: '#c9bda2' });
  text(ctx, '步卒只咬住你的后队，你只能留人断后。', w / 2, 150, { size: 18, align: 'center', color: '#c9bda2' });

  panel(ctx, 20, 198, w - 40, 184, { fill: '#1b1611' });
  text(ctx, '我方 ' + mine + ' 人', 36, 214, { size: 22, color: '#8fb0d8' });
  text(ctx, '西凉步卒 ' + foe + ' 人', 36, 254, { size: 22, color: '#d07060' });
  text(ctx, '他们不会和你摆开阵势打。', 36, 296, { size: 16, color: '#8a8070' });
  text(ctx, '每次被咬住，都要折几个人换八个时辰。', 36, 326, {
    size: 17, color: mine > 1 ? '#d9a441' : '#d06a4a',
  });
  if (mine <= 1) text(ctx, '你身边已经没人可留了。', 36, 354, { size: 18, color: '#d06a4a' });

  app.ui.button(ctx, 20, h - 178, w - 40, 96, '让士兵断后', {
    id: 'iron_tail', size: 30, fill: '#4a241c', onTap: function () {
      const r = stateLib.breakTail(st, unit.id, 'party');
      app.showToast(r.msg, 3);
      if (r.ended) {
        app.replace('ending');
        return;
      }
      if (r.ok) app.pop();
    },
  });
  text(ctx, mine > 1 ? '折几个人，步卒会在原地停 8 小时，之后不再主动追你。' : '没有人断后，步卒会直接踏过去。',
    w / 2, h - 64, { size: 15, align: 'center', color: '#8a8070' });
}

const ChaseScene = {
  enter(app, params) {
    const d = params || {};
    app.chase = { kind: d.kind || 'lord', id: d.id, note: '' };
    const st = app.state;
    if (!st) return;
    // 同一件事的事件只留一份
    for (let i = st.events.length - 1; i >= 0; i--) {
      const ev = st.events[i];
      if (ev.type === 'chase' && ev.id === d.id) st.events.splice(i, 1);
    }
  },

  leave(app) {
    app.chase = null;
  },

  update(app) {
    const unit = unitOf(app);
    if (!unit || army.troopCount(unit.troops || {}) <= 0) app.pop();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const unit = unitOf(app);
    if (!unit) return;
    const d = app.chase;
    if (unit.scripted) {
      renderIronChase(app, ctx, w, h, st, unit);
      return;
    }
    const isLord = d.kind !== 'party';
    const fac = isLord && FACTIONS[unit.faction] ? FACTIONS[unit.faction] : null;
    const col = fac ? fac.color : (unit.color || '#8b3a3a');
    const n = army.troopCount(unit.troops || {});
    const mine = army.troopCount(st.player.troops);
    const pPower = army.strength(st.player.troops).power;
    const ePower = army.strength(unit.troops || {}).power;
    const rel = isLord ? stateLib.relationOf(st, unit.faction) : -100;
    const cost = stateLib.giveWayCost(st, unit);
    const portrait = isLord && app.assets.portraitFor
      ? app.assets.portraitFor(col, lookFor(unit.id))
      : null;
    const small = h < 1060;

    ctx.fillStyle = '#0d0a07';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(0, 0, w, 216);
    ctx.globalAlpha = 1;

    text(ctx, '被 追 上', w / 2, 14, { size: 17, align: 'center', color: '#d07060' });

    const px = portrait ? 168 : 0;
    if (portrait) {
      panel(ctx, 22, 44, 132, 132, { fill: '#14100c' });
      ctx.drawImage(portrait, 26, 48, 124, 124);
    }
    text(ctx, unit.name || '一队人马', portrait ? px : w / 2, 44, {
      size: small ? 40 : 46, align: portrait ? 'left' : 'center', color: '#f5e9cf', shadow: true,
    });
    text(ctx, (fac ? fac.full + ' · ' : '') + n + ' 人' + (isLord ? '' : ' · 山贼'),
      portrait ? px : w / 2, 100, { size: 19, align: portrait ? 'left' : 'center', color: col });
    if (isLord) {
      text(ctx, '关系 ' + rel + (rel < -50 ? ' · 已经不肯收钱了' : rel < -20 ? ' · 不好说话' : ' · 还能谈谈'),
        portrait ? px : w / 2, 130, {
          size: 18, align: portrait ? 'left' : 'center',
          color: rel < -50 ? '#d07060' : rel < -20 ? '#d9a441' : '#9fc08a',
        });
    }

    const line = isLord && rel < -50
      ? '他认得你的旗，也知道你杀过他的人。钱袋递过去，只会被踢回来。'
      : '他横在路中间，刀没出鞘，意思很清楚。';
    wrap(ctx, line, w - 48, 17).slice(0, 2).forEach(function (ln, i) {
      text(ctx, ln, 24, 184 + i * 22, { size: 17, color: '#8a8070' });
    });

    /* 实力对比 */
    const y0 = 226;
    panel(ctx, 20, y0, w - 40, 216, { fill: '#1b1611' });
    text(ctx, '我方 ' + mine + ' 人', 36, y0 + 10, { size: 20, color: '#8fb0d8' });
    text(ctx, compText(st.player.troops) || '孤身一人', 36, y0 + 38, { size: 14, color: '#8a8070' });
    text(ctx, '对方 ' + n + ' 人', 36, y0 + 66, { size: 20, color: '#d07060' });
    text(ctx, compText(unit.troops || {}), 36, y0 + 94, { size: 14, color: '#8a8070' });
    const total = pPower + ePower || 1;
    bar(ctx, 36, y0 + 122, w - 72, 18, pPower / total, UI_COLORS.blue);
    const verdict = pPower / total;
    text(ctx, verdict > 0.62 ? '硬打能赢，但会死人。' : verdict > 0.48 ? '势均力敌，一仗下来两边都疼。' : '对面比你硬，坦然开战是下策。',
      36, y0 + 150, { size: 17, color: verdict > 0.62 ? '#8fbf7a' : '#d9a441' });
    text(ctx, '买路钱随他手下的人数涨：' + cost + ' 金钱。', 36, y0 + 180, { size: 15, color: '#a2947a' });

    /* 三条路 */
    const payY = y0 + 216 + 24;
    const bh = 92;
    app.ui.button(ctx, 20, payY, w - 40, bh, '给钱脱身 · ' + cost + ' 金钱', {
      id: 'chase_pay', size: 28, fill: '#3a3020', onTap: function () {
        const r = stateLib.giveWay(st, unit.id, d.kind);
        app.showToast(r.msg, 3);
        if (r.ok) app.pop();
      },
    });
    text(ctx, isLord && rel < -50 ? '（关系低于 -50，他多半不收，会驳回）' : '付了钱，一天之内他不会追上来。',
      24, payY + bh + 6, { size: 14, color: isLord && rel < -50 ? '#d07060' : '#8a8070' });

    const rowY = payY + bh + 34;
    app.ui.button(ctx, 20, rowY, (w - 52) / 2, bh, '坦然开战', {
      id: 'chase_fight', size: 28, fill: '#4a2a1a', onTap: function () {
        app.pop();
        if (d.kind === 'party') {
          stateLib.startPartyBattle(st, unit);
          app.push('battle', { mode: 'party' });
        } else {
          stateLib.startLordBattle(st, unit);
          app.push('battle', { mode: 'lord' });
        }
      },
    });
    app.ui.button(ctx, 20 + (w - 52) / 2 + 12, rowY, (w - 52) / 2, bh, '留人断后', {
      id: 'chase_tail', size: 28, fill: '#2a2a34', onTap: function () {
        const r = stateLib.breakTail(st, unit.id, d.kind);
        app.showToast(r.msg, 3);
        if (r.ok) app.pop();
      },
    });
    text(ctx, '断后要折人手，但能让他原地停几个时辰，够你跑出视野或进城。', 22, rowY + bh + 8, {
      size: 14, color: '#8a8070',
    });

    /* 底下补一点"现在什么情形"：士气、粮草、最近战事 */
    const by = rowY + bh + 42;
    const avail = h - by - 20;
    const panelH = Math.min(avail, 340);
    if (panelH >= 150) {
      const panelY = by + Math.max(0, (avail - panelH) / 2);
      panel(ctx, 20, panelY, w - 40, panelH, { fill: '#16120d' });
      const p = st.player;
      const gap = Math.min(50, Math.max(30, (panelH - 90) / 6.2));
      let y = panelY + 14;
      text(ctx, '眼下的情形', 36, y, { size: 19, color: '#f0c060' });
      y += gap;
      text(ctx, '士气 ' + Math.round(p.morale) + ' · 粮草 ' + Math.round(p.food) + ' · 声望 ' + Math.round(p.renown),
        36, y, { size: 17, color: '#c9bda2' });
      y += gap;
      text(ctx, '他' + (isLord ? '正咬着你不放' : '是这一带有名的匪伙') + '，身边还有 ' + n + ' 人。',
        36, y, { size: 17, color: '#a2947a' });
      y += gap;
      text(ctx, isLord ? '想脱身：他停下的这几个时辰，够你进城或钻进山里。' : '想脱身：往城边或山道上跑，他们追不远。',
        36, y, { size: 16, color: '#8fbf7a' });
      y += gap + 6;
      text(ctx, '最近的账', 36, y, { size: 18, color: '#f0c060' });
      y += gap;
      recentWarLines(st, 3).forEach(function (ln) {
        wrap(ctx, ln, w - 72, 15).slice(0, 1).forEach(function (t1) {
          text(ctx, t1, 36, y, { size: 15, color: '#8a8070' });
        });
        y += Math.min(gap, 40);
      });
    }
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ChaseScene;

  };

  /* js/scenes/ending.js */
  __defs[44] = function (module, exports, __require) {
/**
 * 结局页
 */

const { text, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const armyLib = __require(9);
const { ENDINGS } = __require(5);

const EndingScene = {
  enter(app) {},
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const ending = (st && st.ending) || { type: 'self', text: '故事到这里。', title: '终局' };

    ctx.fillStyle = '#0e0b08';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(240,192,96,0.10)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    text(ctx, ending.title || (ENDINGS[ending.type] ? ENDINGS[ending.type].title : '终局'), w / 2, h * 0.18, {
      size: 72, align: 'center', color: '#f0c060',
    });
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(w / 2 - 70, h * 0.18 + 92, 140, 3);

    let y = h * 0.18 + 130;
    ending.text.split('\n').forEach(function (line) {
      wrap(ctx, line, w - 100, 22, 'bold').forEach(function (l) {
        text(ctx, l, w / 2, y, { size: 22, align: 'center', color: '#e6d7b6' });
        y += 38;
      });
      y += 10;
    });

    if (st) {
      y += 30;
      const lines = [
        '第 ' + st.clock.day + ' 天',
        '胜 ' + st.stats.battlesWon + ' · 败 ' + st.stats.battlesLost,
        '城 ' + st.stats.sitesTaken + ' · 村 ' + st.stats.villagesRaided,
        '兵 ' + armyLib.troopCount(st.player.troops),
        '天机简 ' + st.player.shiUsed,
      ];
      text(ctx, lines.join('　'), w / 2, y, { size: 16, align: 'center', color: '#8a8070' });
    }

    if (ending.type !== 'arc') {
      app.ui.button(ctx, 40, h - 200, w - 80, 82, '再走一遍', {
        id: 'again', size: 28, fill: '#33271b', onTap: function () {
          app.runtime.storage.remove('bw_save_v3');
          app.state = stateLib.createGame({});
          app.replace('map');
        },
      });
    }
    app.ui.button(ctx, 40, h - 104, w - 80, 70, '回到标题', {
      id: 'to_title', size: 26, fill: '#201a14', onTap: function () {
        app.saveMeta = null;
        app.replace('title');
      },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = EndingScene;

  };

  /* js/scenes/lord.js */
  __defs[45] = function (module, exports, __require) {
/**
 * 领主对话：碰面先说话，再决定结交、送礼还是拔刀
 * 六件事：了解生平 / 查看兵力 / 送礼 / 开战 / 你在做什么 / 离开
 */

const { text, panel, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { FACTIONS } = __require(5);
const { lookFor } = __require(12);

const RANK_LABEL = { king: '君主', lord: '领兵者', general: '将领' };

function lordOf(app) {
  const d = app.lordTalk;
  if (!d) return null;
  return app.state.lords.filter(function (l) { return l.id === d.lordId; })[0] || null;
}

const OPTIONS = [
  { id: 'bio', label: '了解生平' },
  { id: 'troops', label: '查看兵力' },
  { id: 'gift', label: '送礼结交' },
  { id: 'war', label: '当场开战' },
  { id: 'idle', label: '你在做什么' },
  { id: 'leave', label: '离开' },
];

const LordScene = {
  enter(app, params) {
    const lord = app.state.lords.filter(function (l) { return l.id === params.lordId; })[0];
    const hostile = lord ? stateLib.isHostileFaction(app.state, lord.faction) : false;
    // 排队的同一位领主事件清掉，避免说完了又被弹一次
    const evs = app.state.events;
    if (evs) {
      for (let i = evs.length - 1; i >= 0; i--) {
        if (evs[i].type === 'lord' && evs[i].lordId === params.lordId) evs.splice(i, 1);
      }
    }
    app.lordTalk = {
      lordId: params.lordId,
      // 敌对撞上先给“迎战/撤开”，不把人直接推进战斗
      page: hostile ? 'confront' : 'menu',
      line: !lord ? '……' : hostile
        ? '“站住。”\n他把马横在路当中，手按在刀柄上，眼睛在你队伍上扫了一遍。'
        : stateLib.lordGreet(app.state, lord) + '\n' + stateLib.lordIdle(app.state, lord),
    };
  },

  update(app) {
    const lord = lordOf(app);
    if (!lord || !lord.alive) {
      app.pop();
    }
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const d = app.lordTalk;
    const lord = lordOf(app);
    if (!lord) return;

    const fac = FACTIONS[lord.faction];
    const col = fac ? fac.color : '#8f8f86';

    ctx.fillStyle = '#0d0a07';
    ctx.fillRect(0, 0, w, h);

    // 背景条：势力色
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, 0, w, 300);
    ctx.globalAlpha = 1;

    // 立绘：一整队人马放大（骑手 + 两卒 + 旗），按势力上色
    const look = lookFor(lord.id);
    const sprite = (app.assets.portraitFor ? app.assets.portraitFor(col, look) : null) || app.assets.lord;
    const sw0 = sprite.width || 42;
    const sh0 = sprite.height || 40;
    let spW = Math.min(310, w * 0.74);
    let spH = spW * (sh0 / sw0);
    const maxH = Math.max(170, h * 0.235);
    if (spH > maxH) {
      spH = maxH;
      spW = spH * (sw0 / sh0);
    }
    ctx.drawImage(sprite, w / 2 - spW / 2, 88, spW, spH);

    // 名字与身份
    text(ctx, lord.name, w / 2, 26, { size: 42, align: 'center', color: '#f5e9cf', shadow: true });
    text(ctx, (lord.title || '') + ' · ' + (fac ? fac.full : '无主'), w / 2, 76, {
      size: 18, align: 'center', color: '#c9bda2', shadow: true,
    });

    // 话框
    const boxY = Math.max(h * 0.315, 240);
    const isBio = d.page === 'bio';
    const boxH = isBio ? (h - boxY - 116) : Math.min(260, h - boxY - 250);
    panel(ctx, 20, boxY, w - 40, boxH, { fill: '#201a14' });
    text(ctx, '关系 ' + stateLib.relationOf(st, lord.faction) + ' · ' +
      (RANK_LABEL[stateLib.lordRank(lord)] || '将领'),
      w - 36, boxY + 10, { size: 16, align: 'right', color: '#a2947a' });
    if (isBio) text(ctx, '生平', 40, boxY + 10, { size: 16, color: '#c9bda2' });
    const size = isBio ? 18 : 21;
    const lineH = isBio ? 28 : 32;
    const top = isBio ? 46 : 26;
    const lines = wrap(ctx, d.line, w - 96, size, 'bold');
    const maxLines = Math.floor((boxH - top - 14) / lineH);
    lines.slice(0, maxLines).forEach(function (ln, i) {
      text(ctx, ln, 48, boxY + top + i * lineH, { size, color: '#efe3c6' });
    });

    const bottomY = boxY + boxH + 16;

    if (d.page === 'menu') {
      OPTIONS.forEach(function (op, i) {
        const bw = (w - 60) / 3;
        const bx = 20 + (i % 3) * (bw + 10);
        const by = bottomY + Math.floor(i / 3) * 78;
        app.ui.button(ctx, bx, by, bw, 68, op.label, {
          id: 'ld_' + op.id,
          size: 22,
          fill: op.id === 'war' ? '#43201a' : '#33271b',
          onTap: function () { act(app, op.id); },
        });
      });
    } else if (d.page === 'gift') {
      text(ctx, '送礼：君主 100 金钱换 5 点，领兵者 3 点，将领 2 点。', 24, bottomY, {
        size: 18, color: '#a2947a',
      });
      [100, 300, 500].forEach(function (g, i) {
        const bw = (w - 60) / 3;
        app.ui.button(ctx, 20 + i * (bw + 10), bottomY + 34, bw, 70, g + ' 金钱', {
          id: 'gift_' + g, size: 24, fill: '#3a2a12', onTap: function () {
            const r = stateLib.giftLord(st, lord, g);
            app.showToast(r.msg, 2);
            d.line = r.ok ? lord.name + '收下了这份礼。\n（' + r.msg + '）' : r.msg;
            d.page = 'menu';
          },
        });
      });
      app.ui.button(ctx, 20, bottomY + 116, w - 40, 62, '算了', {
        id: 'gift_back', size: 22, fill: '#241c14', onTap: function () { d.page = 'menu'; },
      });
    } else if (d.page === 'confront') {
      // 被拦住：可以迎战，也可以撤开——不是只能打
      text(ctx, '迎战：当场打一场。', 24, bottomY, { size: 17, color: '#c9bda2' });
      text(ctx, '撤开：不损一兵，双方拉开，短时间不会再撞上。', 24, bottomY + 26, {
        size: 17, color: '#8fbf7a',
      });
      app.ui.button(ctx, 20, bottomY + 62, w / 2 - 30, 74, '迎战', {
        id: 'cf_war', size: 26, fill: '#43201a', onTap: function () { act(app, 'war'); },
      });
      app.ui.button(ctx, w / 2 + 10, bottomY + 62, w / 2 - 30, 74, '撤开', {
        id: 'cf_flee', size: 26, fill: '#241c14', onTap: function () {
          stateLib.afterRetreat(st, { lordId: lord.id });
          app.pop();
          app.showToast('你退开一段路，他没有追上来。', 2.2);
        },
      });
    } else {
      app.ui.button(ctx, 20, bottomY, w - 40, 68, '回到话头', {
        id: 'ld_back', size: 24, fill: '#241c14', onTap: function () { d.page = 'menu'; },
      });
    }
  },
};

function act(app, id) {
  const st = app.state;
  const d = app.lordTalk;
  const lord = lordOf(app);
  if (!lord) return;

  if (id === 'bio') {
    const t = stateLib.lordLines(lord);
    d.line = t.bio || ('关于' + lord.name + '，你能知道的只有他现在的样子。');
    d.page = 'bio';
    return;
  }
  if (id === 'troops') {
    const rows = stateLib.lordTroopLine(lord);
    d.line = '“我的家底？”\n' + (rows.length ? rows.join(' · ') : '人已经打光了') +
      '\n合计 ' + army.troopCount(lord.troops) + ' 人，士气 ' + Math.round(lord.morale) +
      (stateLib.isHostileFaction(st, lord.faction) ? '。他手按着刀柄。' : '。');
    d.page = 'troops';
    return;
  }
  if (id === 'gift') {
    d.page = 'gift';
    return;
  }
  if (id === 'idle') {
    d.line = '“' + stateLib.lordIdle(st, lord) + '”\n（他把手里的东西放下，看了你一眼。）';
    d.page = 'idle';
    return;
  }
  if (id === 'war') {
    const r = stateLib.provokeLord(st, lord);
    app.showToast(r.msg + '，他拔了刀。', 2);
    stateLib.startLordBattle(st, lord);
    app.push('battle', { mode: 'lord' });
    return;
  }
  if (id === 'leave') {
    if (stateLib.isHostileFaction(st, lord.faction)) {
      d.page = 'confront';
      d.line = '“既然来了，就别想着走了。”\n他勒转马头，手已经按在刀柄上。';
      return;
    }
    app.pop();
  }
}

module.exports = LordScene;

  };

  /* js/scenes/revive.js */
  __defs[46] = function (module, exports, __require) {
/**
 * 复活提示：全灭之后回到一天前，用一段文字说明这是第几次
 * （次数只在这个界面上出现，别处不提示）
 */

const { text, panel, wrap } = __require(6);

const OPENERS = [
  '名册上的墨还没干透，你又站了起来。',
  '有人在纸上划掉了你的名字，过了一会儿，又写了回去。',
  '火堆还剩一点余温。你从灰里坐起来，先摸了摸自己的刀。',
  '这一次醒得比上一回快。帐外的马打了个响鼻，像是早知道你会回来。',
  '你睁开眼，看见自己的旗插在原来的地方，旗角卷着风。',
  '血迹被夜里的雨冲干净了，只有靴底还粘着泥。',
  '有人在数人头，数到你的时候停了一下，然后接着往下数。',
  '你听见远处有人喊你的名字，声音很熟，想不起是谁。',
];

const BODY = [
  '身边的人还在，只是都老了一岁——其实是你的记忆往回退了一天。',
  '帐里的粮还剩半袋，地图上的墨迹被水汽晕开了一角。',
  '你记得自己倒下的地方，但走过去只有一片被踩平的草。',
  '队里的老兵什么都没问，把一碗热粥推到你面前。',
  '你翻了个身，发现自己躺在一天前的那张草席上。',
  '马夫说昨天夜里你一直在说梦话，说的是别人的名字。',
  '刀鞘上的缺口还在，说明那一战真的打过。',
  '风把营门口的旗吹得笔直，像什么都没发生过。',
];

const ReviveScene = {
  enter(app, params) {
    const n = (params && params.count) || 1;
    app.reviveView = {
      count: n,
      opener: OPENERS[(n - 1) % OPENERS.length],
      body: BODY[(n - 1) % BODY.length],
      t: 0,
    };
  },

  update(app, dt) {
    if (app.reviveView) app.reviveView.t += dt;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const v = app.reviveView;
    if (!v) return;

    const fade = Math.min(1, v.t / 0.6);

    ctx.fillStyle = '#070605';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(160,40,30,' + (0.10 * fade) + ')';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '第 ' + v.count + ' 次', w / 2, h * 0.18, {
      size: 56, align: 'center', color: '#c05040',
    });

    const lines1 = wrap(ctx, v.opener, w - 120, 24, 'bold');
    lines1.forEach(function (ln, i) {
      text(ctx, ln, w / 2, h * 0.34 + i * 38, { size: 24, align: 'center', color: '#efe3c6' });
    });

    const lines2 = wrap(ctx, v.body, w - 160, 19);
    lines2.forEach(function (ln, i) {
      text(ctx, ln, w / 2, h * 0.34 + lines1.length * 38 + 26 + i * 30, {
        size: 19, align: 'center', color: '#a2947a',
      });
    });

    app.ui.button(ctx, w / 2 - 130, h - 140, 260, 74, '起身', {
      id: 'revive_ok', size: 28, fill: '#33271b', onTap: function () {
        app.pop();
      },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ReviveScene;

  };

  /* js/scenes/saves.js */
  __defs[48] = function (module, exports, __require) {
/**
 * 存档槽：九个位置
 * mode = 'load' 读档 / 'save' 存到某个槽
 */

const { text, panel } = __require(6);
const stateLib = __require(7);
const { formatClock } = __require(8);

const SLOT_COUNT = 9;

function slotKey(i) {
  return 'bw_slot_' + i;
}

function readSlot(app, i) {
  const raw = app.runtime.storage.get(slotKey(i));
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.player) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function describe(data) {
  if (!data) return '';
  const p = data.player || {};
  const troops = Object.keys(p.troops || {}).reduce(function (s, k) { return s + (p.troops[k] || 0); }, 0);
  return '第 ' + (data.clock ? data.clock.day : '?') + ' 天 · ' + troops + ' 兵 · ' + (p.gold || 0) + ' 金钱';
}

const SavesScene = {
  enter(app, params) {
    const p = params || {};
    app.savesView = {
      mode: p.mode || 'load',
      from: p.from || 'menu',
      sel: null,
      note: '',
      slots: [],
    };
    for (let i = 1; i <= SLOT_COUNT; i += 1) app.savesView.slots.push(readSlot(app, i));
  },

  update() {},

  load(app, i) {
    const raw = app.runtime.storage.get(slotKey(i));
    const loaded = stateLib.deserialize(raw);
    if (!loaded) {
      app.showToast('这个槽读不出来。', 2);
      return;
    }
    app.state = loaded;
    app.replace('map');
    app.showToast('已读取槽位 ' + i + '：第 ' + loaded.clock.day + ' 天', 2);
  },

  save(app, i) {
    if (!app.state) return;
    app.runtime.storage.set(slotKey(i), stateLib.serialize(app.state));
    app.savesView.slots[i - 1] = readSlot(app, i);
    app.showToast('已存到槽位 ' + i + '：第 ' + app.state.clock.day + ' 天', 2);
  },

  remove(app, i) {
    app.runtime.storage.remove(slotKey(i));
    app.savesView.slots[i - 1] = null;
    app.savesView.sel = null;
    app.showToast('槽位 ' + i + ' 已清空', 1.6);
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const sv = app.savesView || { mode: 'load', slots: [], sel: null };

    ctx.fillStyle = '#12100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, sv.mode === 'save' ? '保存到槽位' : '读取存档', w / 2, 26, { size: 32, align: 'center', color: '#f0c060' });
    text(ctx, sv.mode === 'save' ? '点一个空槽就存进去；已有内容需要再点一次底部按钮覆盖。'
      : '点一个槽就读到那一天。九个槽互不影响。', w / 2, 68, { size: 16, align: 'center', color: '#8a8070' });

    const cols = 3;
    const gap = 14;
    const gw = (w - 40 - gap * (cols - 1)) / cols;
    const gh = 178;
    const y0 = 132;

    for (let i = 1; i <= SLOT_COUNT; i += 1) {
      const col = (i - 1) % cols;
      const row = Math.floor((i - 1) / cols);
      const x = 20 + col * (gw + gap);
      const y = y0 + row * (gh + gap);
      const data = sv.slots[i - 1];
      const selected = sv.sel === i;

      panel(ctx, x, y, gw, gh, {
        fill: selected ? '#3a2c1e' : data ? '#201a14' : '#191510',
      });
      text(ctx, '槽 ' + i, x + 12, y + 8, { size: 18, color: selected ? '#f0c060' : '#a2947a' });
      if (data) {
        text(ctx, '第 ' + (data.clock ? data.clock.day : '?') + ' 天', x + 12, y + 38, { size: 22, color: '#efe3c6' });
        const p = data.player || {};
        const troopN = Object.keys(p.troops || {}).reduce(function (s, k) { return s + (p.troops[k] || 0); }, 0);
        text(ctx, troopN + ' 兵 · ' + (p.gold || 0) + ' 金钱', x + 12, y + 68, { size: 15, color: '#a2947a' });
        text(ctx, (p.country && p.country.name) ? p.country.name + '国' : ((p.name || '无名溃兵') + ' · ' + (p.renown || 0) + '声望'), x + 12, y + 92, { size: 14, color: '#8a8070' });
        text(ctx, data.clock ? formatClock(data.clock) : '', x + 12, y + 116, { size: 13, color: '#6a6050' });
      } else {
        text(ctx, '（空）', x + 12, y + 52, { size: 20, color: '#5a5245' });
        text(ctx, '点此存入', x + 12, y + 86, { size: 14, color: '#4a4238' });
      }

      if (data) {
        app.ui.button(ctx, x + gw - 66, y + gh - 44, 56, 34, '删除', {
          id: 'slot_del_' + i, size: 15, fill: '#43201a', onTap: function () {
            SavesScene.remove(app, i);
          },
        });
      }
    }

    const bottomY = y0 + 3 * (gh + gap) + 10;
    if (sv.mode === 'save' && sv.sel) {
      app.ui.button(ctx, 20, bottomY, w - 40, 66,
        sv.slots[sv.sel - 1] ? '覆盖槽 ' + sv.sel + ' 保存' : '存入槽 ' + sv.sel, {
          id: 'save_confirm', size: 24, fill: '#3a2c1e', onTap: function () {
            SavesScene.save(app, sv.sel);
            sv.sel = null;
          },
        });
    }
    app.ui.button(ctx, 20, h - 86, w - 40, 66, '返回', {
      id: 'saves_back', size: 24, fill: '#241c14', onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd(app, x, y) {
    const sv = app.savesView;
    if (!sv) return;
    const w = app.runtime.width;
    const cols = 3;
    const gap = 14;
    const gw = (w - 40 - gap * (cols - 1)) / cols;
    const gh = 178;
    const y0 = 132;
    for (let i = 1; i <= SLOT_COUNT; i += 1) {
      const col = (i - 1) % cols;
      const row = Math.floor((i - 1) / cols);
      const cx = 20 + col * (gw + gap);
      const cy = y0 + row * (gh + gap);
      if (x < cx || x > cx + gw || y < cy || y > cy + gh) continue;
      // 删除按钮由 ui 处理，这里只管整格
      if (x > cx + gw - 66 && y > cy + gh - 44) return;
      if (sv.mode === 'load') {
        if (sv.slots[i - 1]) SavesScene.load(app, i);
        else app.showToast('这个槽是空的。', 1.6);
      } else {
        if (!sv.slots[i - 1]) SavesScene.save(app, i);
        else sv.sel = i;
      }
      return;
    }
  },
};

module.exports = SavesScene;
module.exports.SLOT_COUNT = SLOT_COUNT;
module.exports.slotKey = slotKey;

  };

  /* js/scenes/menu.js */
  __defs[47] = function (module, exports, __require) {
/**
 * 系统菜单：九个存档槽 / 最近存档 / 退回战前 / 回标题
 */

const { text, panel } = __require(6);
const stateLib = __require(7);
const audio = __require(18);
const { formatClock } = __require(8);
const savesLib = __require(48);

const AUTO_KEY = 'bw_save_v4';
const AUTO_1 = 'bw_save_v4_a1';
const AUTO_2 = 'bw_save_v4_a2';
const PRE_KEY = 'bw_pre_v4';

function readMeta(app, key) {
  const raw = app.runtime.storage.get(key);
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.player) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function describe(data) {
  if (!data) return '';
  const p = data.player || {};
  const troops = Object.keys(p.troops || {}).reduce(function (s, k) { return s + (p.troops[k] || 0); }, 0);
  return '第 ' + (data.clock ? data.clock.day : '?') + ' 天 · ' + troops + ' 兵 · ' + (p.gold || 0) + ' 金钱';
}

function load(app, key, failMsg) {
  const raw = app.runtime.storage.get(key);
  const loaded = stateLib.deserialize(raw);
  if (!loaded) {
    app.showToast(failMsg, 2);
    return;
  }
  app.state = loaded;
  app.replace('map');
}

const MenuScene = {
  enter(app) {
    let used = 0;
    for (let i = 1; i <= savesLib.SLOT_COUNT; i += 1) {
      if (app.runtime.storage.get(savesLib.slotKey(i))) used += 1;
    }
    app.menuView = {
      auto: readMeta(app, AUTO_KEY),
      auto1: readMeta(app, AUTO_1),
      pre: readMeta(app, PRE_KEY),
      used: used,
      total: savesLib.SLOT_COUNT,
    };
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const st = app.state;
    const mv = app.menuView || {};

    ctx.fillStyle = 'rgba(8,6,4,0.96)';
    ctx.fillRect(0, 0, w, app.runtime.height);

    text(ctx, '营帐', w / 2, 26, { size: 36, align: 'center', color: '#f0c060' });
    text(ctx, st ? formatClock(st.clock) : '', w / 2, 72, { size: 18, align: 'center', color: '#a2947a' });

    // 存档信息
    const infoY = 98;
    panel(ctx, 20, infoY, w - 40, 92, { fill: '#201a14' });
    text(ctx, '最近存档', 40, infoY + 10, { size: 18, color: '#c9bda2' });
    text(ctx, mv.auto ? describe(mv.auto) : '暂无', 40, infoY + 42, {
      size: 16, color: mv.auto ? '#efe3c6' : '#8a8070',
    });
    text(ctx, '保存槽 ' + (mv.used || 0) + ' / ' + (mv.total || 9), w - 40, infoY + 10, {
      size: 18, align: 'right', color: '#c9bda2',
    });
    text(ctx, '开打前快照 ' + (mv.pre ? '第' + mv.pre.clock.day + '天' : '空'), w - 40, infoY + 42, {
      size: 15, align: 'right', color: mv.pre ? '#a2947a' : '#6a6050',
    });

    const BH = 58;
    const GAP = 66;
    let y = infoY + 104;

    app.ui.button(ctx, 20, y, w / 2 - 30, BH, '保存到槽位', {
      id: 'menu_saves_save', size: 22, fill: '#3a2c1e', onTap: function () {
        app.push('saves', { mode: 'save', from: 'menu' });
      },
    });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH, '读取最近存档', {
      id: 'menu_auto', size: 22, fill: '#241c14', disabled: !mv.auto, onTap: function () {
        load(app, AUTO_KEY, '最近存档读不出来。');
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w - 40, BH,
      '读取保存存档 · ' + (mv.used || 0) + '/' + (mv.total || 9) + ' 个槽有档', {
        id: 'menu_saves_load', size: 24, fill: '#241c14', onTap: function () {
          app.push('saves', { mode: 'load', from: 'menu' });
        },
      });
    y += GAP;

    // 退回：开打前的快照 / 上一份自动存档
    app.ui.button(ctx, 20, y, w / 2 - 30, BH,
      mv.pre ? '退回战前 · 第' + mv.pre.clock.day + '天' : '退回战前（空）', {
        id: 'menu_pre', size: 19, fill: '#3a2418', disabled: !mv.pre, onTap: function () {
          load(app, PRE_KEY, '战前快照读不出来。');
        },
      });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH,
      mv.auto1 ? '退回上一份 · 第' + mv.auto1.clock.day + '天' : '退回上一份（空）', {
        id: 'menu_auto1', size: 19, fill: '#241c14', disabled: !mv.auto1, onTap: function () {
          load(app, AUTO_1, '上一份自动存档读不出来。');
        },
      });
    y += GAP;

    app.ui.button(ctx, 20, y, w / 2 - 30, BH, '回到标题', {
      id: 'menu_title', size: 22, fill: '#43201a', onTap: function () {
        app.replace('title');
      },
    });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH, audio.isEnabled() ? '音乐：开' : '音乐：关', {
      id: 'menu_audio', size: 22, fill: '#241c14', onTap: function () {
        const on = !audio.isEnabled();
        audio.setEnabled(on);
        if (on) audio.play(app.top() && app.top().name === 'battle' ? 'battle' : 'field');
        app.showToast(on ? '音乐已打开' : '音乐已关闭', 1.6);
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w - 40, BH, '继续游戏', {
      id: 'menu_close', size: 24, fill: '#33271b', onTap: function () { app.pop(); },
    });

    text(ctx, '最近存档每 45 秒一份，另留一份上一份可回退；保存槽九格，手动存。', w / 2, y + BH + 26, {
      size: 13, align: 'center', color: '#6a6050',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = MenuScene;
module.exports.AUTO_KEY = AUTO_KEY;
module.exports.PRE_KEY = PRE_KEY;

  };

  /* js/main.js */
  __defs[1] = function (module, exports, __require) {
/**
 * 游戏主循环与场景栈
 */

const { createRuntime } = __require(2);
const pixel = __require(3);
const { UI, text, wrap, panel } = __require(6);
const stateLib = __require(7);
const audio = __require(18);

// 存档槽：最新 / 上一份 / 上上一份，外加开打前的快照
const AUTO_KEY = 'bw_save_v4';
const AUTO_1 = 'bw_save_v4_a1';
const AUTO_2 = 'bw_save_v4_a2';
const PRE_KEY = 'bw_pre_v4';

class App {
  constructor(runtime) {
    this.runtime = runtime;
    this.assets = pixel.buildAssets(runtime);
    this.ui = new UI();
    this.stack = [];
    this.state = null;
    this.scenes = {
      title: __require(19),
      map: __require(20),
      atlas: __require(23),
      town: __require(24),
      founding: __require(27),
      fief: __require(28),
      govern: __require(29),
      shop: __require(30),
      battle: __require(31),
      contact: __require(32),
      army: __require(33),
      hero: __require(34),
      prison: __require(35),
      tourney: __require(36),
      journal: __require(37),
      camp: __require(38),
      help: __require(39),
      nested: null,
      chapter: __require(40),
      news: __require(41),
      arc: __require(42),
      chase: __require(43),
      ending: __require(44),
      lord: __require(45),
      revive: __require(46),
      menu: __require(47),
      saves: __require(48),
    };
    delete this.scenes.nested;
    this.saveTimer = 10;
    this.last = runtime.now();
    this.toast = null;
    this.lastHit = null;

    // 试手感用的帧率叠加层：地址栏加 ?fps=1 打开
    this.debugHud = false;
    try {
      if (typeof location !== 'undefined' && location.search && /fps=1/.test(location.search)) {
        this.debugHud = true;
      }
    } catch (e) {
      this.debugHud = false;
    }
    this._fps = 60;
    this._frameMs = 0;

    const self = this;
    runtime.onTouch({
      start: function (x, y) {
        self.onStart(x, y);
      },
      move: function (x, y) {
        self.onMove(x, y);
      },
      end: function (x, y) {
        self.onEnd(x, y);
      },
      wheel: function (dy, x, y) {
        self.onWheel(dy, x, y);
      },
      pinchStart: function (x, y) {
        self.onPinchStart(x, y);
      },
      pinch: function (scale, x, y) {
        self.onPinch(scale, x, y);
      },
      pinchEnd: function () {
        self.onPinchEnd();
      },
    });
  }

  top() {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  push(name, params) {
    const scene = this.scenes[name];
    if (!scene) {
      return;
    }
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
    const entry = { name, scene, params: params || {} };
    this.stack.push(entry);
    if (scene.enter) scene.enter(this, entry.params);
    this.applyMusic(name);
    // 开打之前留一份快照：打输了、想反悔，都能退回来
    if (name === 'battle' && this.state && !this.state.gameOver) {
      try {
        this.runtime.storage.set(PRE_KEY, stateLib.serialize(this.state));
      } catch (e) { /* ignore */ }
    }
  }

  applyMusic(name) {
    if (name === 'battle') audio.play('battle');
    else if (name === 'map' || name === 'title') audio.play('field');
  }

  pop() {
    if (this.stack.length <= 1) return;
    const leaving = this.stack.pop();
    if (leaving.scene.leave) leaving.scene.leave(this);
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
    const nowTop = this.top();
    if (nowTop) this.applyMusic(nowTop.name);
  }

  replace(name, params) {
    while (this.stack.length) {
      const leaving = this.stack.pop();
      if (leaving.scene.leave) leaving.scene.leave(this);
    }
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
    this.push(name, params);
  }

  showToast(message, seconds) {
    this.toast = {
      text: message,
      time: seconds || 2.2,
    };
  }

  onPinchStart(x, y) {
    this.ui.pressed = null;
    const top = this.top();
    if (top && top.scene.onPinchStart) top.scene.onPinchStart(this, x, y);
  }

  onPinch(scale, x, y) {
    const top = this.top();
    if (top && top.scene.onPinch) top.scene.onPinch(this, scale, x, y);
  }

  onPinchEnd() {
    const top = this.top();
    if (top && top.scene.onPinchEnd) top.scene.onPinchEnd(this);
  }

  onStart(x, y) {
    audio.resume();
    this.ui.press(x, y);
    const top = this.top();
    if (top && top.scene.onTouchStart) top.scene.onTouchStart(this, x, y);
  }

  onMove(x, y) {
    const top = this.top();
    if (top && top.scene.onTouchMove) top.scene.onTouchMove(this, x, y);
  }

  onEnd(x, y) {
    const top = this.top();
    this.lastHit = this.ui.release(x, y);
    if (top && top.scene.onTouchEnd) top.scene.onTouchEnd(this, x, y);
  }

  onWheel(dy, x, y) {
    const top = this.top();
    if (top && top.scene.onWheel) top.scene.onWheel(this, dy, x, y);
  }

  start() {
    const self = this;
    this.push('title');
    const loop = function () {
      self.tick();
      self.runtime.raf(loop);
    };
    loop();
  }

  tick() {
    const now = this.runtime.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    const rawDt = dt;
    if (dt > 0.06) dt = 0.06;

    if (this.debugHud && rawDt > 0) {
      const inst = 1 / rawDt;
      this._fps = this._fps * 0.85 + Math.min(inst, 120) * 0.15;
    }

    const r = this.runtime;
    // 先按物理像素铺满整块画布：顶部让开胶囊的那条区域不能被上一帧残留
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.ctx.fillStyle = '#0f0c09';
    r.ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);
    r.ctx.setTransform(r.dpr * r.scale, 0, 0, r.dpr * r.scale, 0, (r.topInsetPx || 0) * r.dpr);
    audio.update(dt);

    const top = this.top();
    if (top && top.scene.update) top.scene.update(this, dt);

    this.ui.begin();
    r.ctx.fillStyle = '#0f0c09';
    r.ctx.fillRect(0, 0, r.width, r.height);

    const current = this.top();
    if (current && current.scene.render) current.scene.render(this);

    if (this.toast) {
      this.toast.time -= dt;
      if (this.toast.time <= 0) this.toast = null;
      else this.drawToast();
    }

    // 自动存档：别在战斗里存，也别在结局后存
    if (this.state && !this.state.gameOver && !this.state.battle) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = 45;
        const store = this.runtime.storage;
        const prev1 = store.get(AUTO_1);
        if (prev1) store.set(AUTO_2, prev1);
        const prev0 = store.get(AUTO_KEY);
        if (prev0) store.set(AUTO_1, prev0);
        store.set(AUTO_KEY, stateLib.serialize(this.state));
      }
    }

    if (this.debugHud) {
      const t1 = this.runtime.now();
      const ms = t1 - now;
      this._frameMs = this._frameMs ? this._frameMs * 0.85 + ms * 0.15 : ms;
      this.drawHud();
    }
  }

  drawHud() {
    const ctx = this.runtime.ctx;
    const hud = 'FPS ' + Math.round(this._fps) + '  帧 ' + this._frameMs.toFixed(1) + 'ms';
    ctx.save();
    ctx.font = 'bold 20px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 240, 30);
    ctx.fillStyle = this._fps >= 50 ? '#8fe08f' : this._fps >= 30 ? '#e0c060' : '#e06060';
    ctx.fillText(hud, 8, 22);
    ctx.restore();
  }

  drawToast() {
    const ctx = this.runtime.ctx;
    const w = this.runtime.width;
    const msg = this.toast.text;
    const size = 24;
    const lines = wrap(ctx, msg, w - 160, size, 'bold');
    const boxW = Math.min(w - 60, Math.max(320, Math.max.apply(null, lines.map(function (l) {
      ctx.save();
      ctx.font = 'bold ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(l).width;
      ctx.restore();
      return tw;
    })) + 56));
    const boxH = lines.length * 36 + 32;
    const x = (w - boxW) / 2;
    const y = this.runtime.height * 0.58;
    panel(ctx, x, y, boxW, boxH, { shadow: true, fill: '#33271b' });
    lines.forEach(function (line, i) {
      text(ctx, line, w / 2, y + 18 + i * 36, { size, align: 'center' });
    });
  }

  /** 场景切换辅助：只清空 UI 热区，不动栈 */
  clearUI() {
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
  }
}

function boot() {
  const runtime = createRuntime();
  const app = new App(runtime);
  if (typeof GameGlobal !== 'undefined') GameGlobal.__BORDER_WARBAND__ = app;
  if (typeof window !== 'undefined') window.__BORDER_WARBAND__ = app;
  app.start();
  return app;
}

module.exports = { App, boot };

  };

  /* game.js */
  __defs[0] = function (module, exports, __require) {
/**
 * 小游戏入口（微信 / 抖音）
 */

const { boot } = __require(1);

boot();

  };

  __require(0);
})();
