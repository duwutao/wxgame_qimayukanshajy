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
    if (info.safeArea && info.safeArea.top) {
      topInset = Math.max(0, info.safeArea.top - (info.statusBarHeight || 0));
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

  const scale = screenW / DESIGN_WIDTH;
  const vw = DESIGN_WIDTH;
  let vh = screenH / scale;
  if (!isFinite(vh) || vh <= 0) vh = 1334;

  canvas.width = Math.floor(screenW * dpr);
  canvas.height = Math.floor(screenH * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
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
      const toDesign = function (pxRaw) {
        return pxRaw * (DESIGN_WIDTH / screenW);
      };

      const fire = function (name, x, y) {
        const fn = handlers[name];
        if (fn) fn(toDesign(x), toDesign(y));
      };

      if (api) {
        api.onTouchStart(function (res) {
          const t = (res.touches && res.touches[0]) || (res.changedTouches && res.changedTouches[0]);
          if (t) fire('start', t.clientX, t.clientY);
        });
        api.onTouchMove(function (res) {
          const t = (res.touches && res.touches[0]) || (res.changedTouches && res.changedTouches[0]);
          if (t) fire('move', t.clientX, t.clientY);
        });
        api.onTouchEnd(function (res) {
          const t = (res.changedTouches && res.changedTouches[0]) || (res.touches && res.touches[0]);
          if (t) fire('end', t.clientX, t.clientY);
          else fire('end', -999, -999);
        });
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
        const p = rectPoint(e.touches[0]);
        fire('start', p[0], p[1]);
      }, { passive: false });
      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        const p = rectPoint(e.touches[0]);
        fire('move', p[0], p[1]);
      }, { passive: false });
      canvas.addEventListener('touchend', function (e) {
        e.preventDefault();
        const t = e.changedTouches[0];
        const p = rectPoint(t);
        fire('end', p[0], p[1]);
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
    // 浏览器里首帧可能还没完成布局，50ms 后再校正一次画布尺寸
    setTimeout(function () {
      const hostEl = document.getElementById('stage') || document.body;
      const sw = hostEl.clientWidth || window.innerWidth || 0;
      const sh = hostEl.clientHeight || window.innerHeight || 0;
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
    }, 50);
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
const MAP_W = 64;
const MAP_H = 77;

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
    lord: '马腾', desc: '西凉铁骑，天下精锐。粮少，人心散。',
  },
  han: {
    id: 'han', name: '汉', full: '汉廷', color: '#8f8f86', banner: '汉',
    lord: '刘协', desc: '名义上的天下共主。诏书还在，兵没了。',
  },
  bandit: {
    id: 'bandit', name: '贼', full: '黄巾余部', color: '#8b3a3a', banner: '贼',
    lord: '无', desc: '黄巾散了，人还在山里。所有人的敌人。',
  },
};

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

/** 装备：沿用三档，改三国名目 */
const EQUIPMENT = {
  blade: {
    slot: 'blade', name: '兵刃',
    tiers: [
      { id: 'blade0', name: '环首刀', price: 0, atkPct: 0, desc: '洛阳溃兵身上仅剩的制式刀。' },
      { id: 'blade1', name: '百炼钢刀', price: 260, atkPct: 0.09, desc: '战团攻击 +9%。' },
      { id: 'blade2', name: '青龙长刀', price: 640, atkPct: 0.18, desc: '战团攻击 +18%。' },
    ],
  },
  armor: {
    slot: 'armor', name: '甲胄',
    tiers: [
      { id: 'armor0', name: '皮甲', price: 0, defPct: 0, desc: '挡不住弩，但比布衣强。' },
      { id: 'armor1', name: '玄铁札甲', price: 320, defPct: 0.11, desc: '战团防御 +11%。' },
      { id: 'armor2', name: '明光铠', price: 780, defPct: 0.2, desc: '战团防御 +20%，行军略慢。' },
    ],
  },
  horse: {
    slot: 'horse', name: '坐骑',
    tiers: [
      { id: 'horse0', name: '驮马', price: 0, speedPct: 0, desc: '能驮粮，不能冲阵。' },
      { id: 'horse1', name: '西凉马', price: 380, speedPct: 0.15, desc: '行军速度 +15%。' },
      { id: 'horse2', name: '赤兔', price: 900, speedPct: 0.3, desc: '行军速度 +30%，包抄更致命。' },
    ],
  },
};

/** 史简：能改一次战局的一句话 */
const HISTORY_MARKS = {
  wind: {
    id: 'wind', name: '南风起', text: '你写下“南风起”，风真的转了向。',
    desc: '本场我方攻击 +45%，火攻类战斗额外 +25%。',
  },
  calm: {
    id: 'calm', name: '风止', text: '你写下“风止”，风停了，火也停了。',
    desc: '双方攻击 -35%，持续 3 回合。少死很多人。',
  },
  roll: {
    id: 'roll', name: '名册', text: '你写下阵亡者的名字，他们又站了起来。',
    desc: '战后本场阵亡的我方士兵回归 35%。',
  },
};

/**
 * 战役链：章节按顺序推进
 * check 为状态键，由 core/campaign.js 判定
 */
const CAMPAIGN = [
  {
    id: 'prologue', title: '序章 · 洛阳溃兵',
    goal: '带至少 20 人活着抵达陈留',
    story: '洛阳城破那夜，你带着三十名溃兵往东跑。身后是西凉铁骑，脚下是结冰的护城河。\n你不是要赢，你只是要过桥。',
    check: 'reach_chenliu',
    reward: { renown: 20, shi: 1 },
    after: '过桥的时候还剩十九个。你数了三遍，怕漏了谁。',
  },
  {
    id: 'act1', title: '第一幕 · 陈留募兵',
    goal: '在陈留把队伍扩到 60 人',
    story: '陈留城外插满了募兵的木牌。曹操在招人，刘备在招人，孙策的使者也在。\n谁给粮，你跟谁走。',
    check: 'troops_60',
    reward: { renown: 30, shi: 1, banner: true },
    after: '你有了第一面自己的旗。旗是旧的，字是新写的。',
  },
  {
    id: 'act2', title: '第二幕 · 官渡 · 乌巢夜袭',
    goal: '抵近官渡，烧掉袁军的粮囤',
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
    reward: { renown: 80, shi: 1 },
    after: '白门楼上风很大。你做了那个决定，后来很多年都有人提起。',
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
    title: '焚史', text: '你烧掉了所有史简。\n从此谁也定不了谁，地图永远乱，你的兵永远不缺。',
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
  RECRUIT_SETS,
  ROADS,
  FACTIONS,
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
 * color 为势力色，variant 为 'lvbu' 时加双翎与方天戟（一眼能认出来）
 */
function makeLordSprite(runtime, color, variant) {
  const size = 20;
  const c = newCanvas(runtime, size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const main = color || '#e6e2d6';

  // 马
  px(g, 3, 12, '#2a2320', 12, 5);
  px(g, 3, 12, '#443a33', 12, 1);
  px(g, 14, 9, '#2a2320', 3, 4);
  px(g, 4, 16, '#2a2320', 2, 3);
  px(g, 12, 16, '#2a2320', 2, 3);
  px(g, 3, 13, '#5a4a3c', 2, 1);

  // 骑手
  px(g, 7, 6, main, 6, 6);
  px(g, 7, 6, 'rgba(0,0,0,0.25)', 6, 1);
  px(g, 8, 3, '#d8cdb6', 4, 3);
  px(g, 8, 2, '#3a3a44', 4, 1);

  if (variant === 'lvbu') {
    // 双翎
    px(g, 7, 0, '#c03830', 1, 4);
    px(g, 12, 0, '#c03830', 1, 4);
    // 方天戟
    px(g, 17, 2, '#8a8f99', 1, 14);
    px(g, 16, 2, '#d8dde6', 3, 2);
    px(g, 16, 5, '#d8dde6', 2, 1);
  } else {
    // 刀
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
    /** 按势力色生成领主棋子（带缓存） */
    lordIconFor: function (color, variant) {
      const key = (color || 'x') + '|' + (variant || 'n');
      if (!this.lordCache) this.lordCache = {};
      if (!this.lordCache[key]) this.lordCache[key] = makeLordSprite(runtime, color, variant);
      return this.lordCache[key];
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
      recruitCap: def.type === 'town' ? 12 : def.type === 'castle' ? 8 : def.type === 'village' ? 5 : 0,
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
    id: 'militia', name: '民兵', tier: 1, atk: 6, def: 6, hp: 24, food: 1, recruit: 24,
    desc: '临时征来的农人，给根木棍就上阵。便宜，也容易死。',
  },
  spear: {
    id: 'spear', name: '枪盾兵', tier: 2, atk: 9, def: 11, hp: 26, food: 1, recruit: 42, spear: true,
    desc: '结阵顶住骑兵的中坚。长矛如林，马不敢冲。',
  },
  archer: {
    id: 'archer', name: '弓手', tier: 2, atk: 12, def: 5, hp: 20, food: 1, recruit: 46, ranged: true,
    desc: '开战先射三轮。近战很脆，别让人贴脸。',
  },
  crossbow: {
    id: 'crossbow', name: '弩手', tier: 3, atk: 14, def: 4, hp: 20, food: 1, recruit: 62, ranged: true, pierce: true,
    desc: '上弦慢，但能破甲。对付重骑与亲卫特别好用。',
  },
  cav: {
    id: 'cav', name: '轻骑', tier: 3, atk: 15, def: 8, hp: 30, food: 3, recruit: 88, cav: true,
    desc: '冲锋与包抄的核心。人吃马嚼，口粮三倍。',
  },
  qishe: {
    id: 'qishe', name: '骑射', tier: 3, atk: 13, def: 7, hp: 28, food: 3, recruit: 96, cav: true, ranged: true,
    desc: '边地打法：不贴身，绕着射。打不死你，也追不上他。',
  },
  heavy: {
    id: 'heavy', name: '重骑', tier: 4, atk: 18, def: 13, hp: 36, food: 3, recruit: 165, cav: true,
    desc: '人马皆披甲。正面撞阵，步兵阵线会裂。',
  },
  guard: {
    id: 'guard', name: '亲卫', tier: 4, atk: 17, def: 15, hp: 38, food: 1, recruit: 180, renownReq: 100,
    desc: '主公身边的死士。需声望 100 才招得到。',
  },
  baier: {
    id: 'baier', name: '白毦兵', tier: 4, atk: 16, def: 14, hp: 40, food: 1, recruit: 190, renownReq: 150, lock: true,
    desc: '白毦为饰，士气锁死，不溃不散。刘备手下最后一张牌。',
  },
  wudang: {
    id: 'wudang', name: '无当飞军', tier: 4, atk: 15, def: 12, hp: 34, food: 1, recruit: 185, renownReq: 150, hill: true, ranged: true,
    desc: '南中劲卒，山地如平地。翻山越岭不减速。',
  },
  danyang: {
    id: 'danyang', name: '丹阳兵', tier: 4, atk: 16, def: 13, hp: 36, food: 1, recruit: 200, renownReq: 160,
    desc: '天下精兵出丹阳。江东的底子，靠他们撑。',
  },
  boat: {
    id: 'boat', name: '轻舟兵', tier: 2, atk: 10, def: 8, hp: 24, food: 2, recruit: 74,
    desc: '水上的兵。上岸打不如在水上打。',
  },
  huochuan: {
    id: 'huochuan', name: '火船手', tier: 3, atk: 13, def: 8, hp: 26, food: 2, recruit: 120, fire: true, renownReq: 120,
    desc: '驾火船冲阵，点火不伤己。赤壁那一夜就是他们。',
  },
  xianbei: {
    id: 'xianbei', name: '鲜卑游骑', tier: 3, atk: 16, def: 7, hp: 28, food: 3, recruit: 105, cav: true, ranged: true,
    desc: '塞外的骑射手。来去如风，抢完就走。',
  },
  tengri: {
    id: 'tengri', name: '腾格里卫', tier: 4, atk: 19, def: 12, hp: 34, food: 3, recruit: 240, cav: true, renownReq: 200,
    desc: '鲜卑单于的亲骑。马力最盛，冲阵最狠。',
  },
  tiefu: {
    id: 'tiefu', name: '西凉铁骑', tier: 4, atk: 20, def: 14, hp: 36, food: 3, recruit: 250, cav: true, renownReq: 180,
    desc: '凉州精骑，人马俱甲。中原步兵见了会退半步。',
  },
  jinjun: {
    id: 'jinjun', name: '禁军', tier: 5, atk: 22, def: 18, hp: 44, food: 2, recruit: 340, renownReq: 300,
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

/** 部队总人数上限，靠声望提升；开局溃兵允许超编到 30 */
function troopCapacity(renown) {
  return Math.max(30, 20 + Math.floor((renown || 0) * 0.35));
}

module.exports = {
  troopCount,
  addTroops,
  removeTroops,
  foodPerDay,
  avgTier,
  strength,
  distributeLosses,
  troopCapacity,
};

  };

  /* js/core/economy.js */
  __defs[11] = function (module, exports, __require) {
/**
 * 经济层：市场粮价、招募、装备升级、每日据点刷新
 */

const { TROOPS } = __require(10);
const { EQUIPMENT } = __require(5);
const { troopCount, troopCapacity } = __require(9);

const FOOD_BASE = 5; // 基准粮价（金币 / 单位）

/**
 * 兵价按档次重排：民兵近乎白给，往上每一档都明显更贵。
 * 低阶兵是消耗品，高阶兵是资产。
 */
const TIER_PRICE_MUL = { 1: 0.42, 2: 0.85, 3: 1.05, 4: 1.18, 5: 1.35 };

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
  if (state.player.gold < cost) return { ok: false, msg: '金币不够，需要 ' + cost };
  if (state.player.food + n > 400) return { ok: false, msg: '粮车装不下了（上限 400）' };
  state.player.gold -= cost;
  state.player.food += n;
  return { ok: true, msg: '买入 ' + n + ' 单位粮草，花费 ' + cost + ' 金', cost };
}

function sellFood(state, site, amount) {
  if (!site.market) return { ok: false, msg: '这里没有市场' };
  const n = Math.min(state.player.food, Math.max(1, Math.floor(amount)));
  if (n <= 0) return { ok: false, msg: '没有粮可卖' };
  const gain = foodSellPrice(site) * n;
  state.player.food -= n;
  state.player.gold += gain;
  return { ok: true, msg: '卖出 ' + n + ' 单位粮草，得到 ' + gain + ' 金' };
}

function recruit(state, site, troopId, count) {
  const check = canRecruit(state, site, troopId);
  if (!check.ok) return check;
  const n = Math.max(1, Math.floor(count));
  const price = recruitPrice(site, troopId);
  const affordable = Math.min(n, site.recruits[troopId] || 0, Math.floor(state.player.gold / price));
  if (affordable <= 0) return { ok: false, msg: '金币不足，单价 ' + price + ' 金' };

  const cap = troopCapacity(state.player.renown);
  const room = cap - troopCount(state.player.troops);
  if (room <= 0) return { ok: false, msg: '队伍满编（上限 ' + cap + '），先提升声望' };
  const finalN = Math.min(affordable, room);

  state.player.gold -= price * finalN;
  state.player.troops[troopId] = (state.player.troops[troopId] || 0) + finalN;
  site.recruits[troopId] -= finalN;
  return {
    ok: true,
    msg: '招募 ' + TROOPS[troopId].name + ' × ' + finalN + '，花费 ' + price * finalN + ' 金',
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
    return { ok: false, msg: '金币不够，需要 ' + next.price };
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

/** 每日：价格波动 + 招募池刷新 + 守军恢复 */
function dailyMarket(state, rng) {
  state.world.sites.forEach(function (site) {
    const drift = 0.9 + rng.random() * 0.28;
    site.priceIndex = Math.max(0.85, Math.min(1.25, drift));
    if (site.faction === 'bandit') return;

    Object.keys(site.recruits).forEach(function (id) {
      if (site.recruits[id] < (site.recruitCap || 0)) {
        site.recruits[id] += rng.int(0, 2);
      }
    });
    // 补满招募池上限
    (site.recruitList || []).forEach(function (id) {
      if (!site.recruits[id]) site.recruits[id] = rng.int(0, 2);
      const cap = site.recruitCap || 4;
      if (site.recruits[id] > cap) site.recruits[id] = cap;
    });

    if (site.playerOwned) {
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
  dailyMarket,
  dailyIncome,
};

  };

  /* js/data/extra.js */
  __defs[13] = function (module, exports, __require) {
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
    id: 'qing', name: '青巾', color: '#4f8f6a', rank: 1, share: 0.60,
    minSize: 6, maxSize: 12, extra: {},
    loot: [18, 40], morale: [50, 66], sight: 5,
    desc: '黄巾余烬，拿着锄头就上路。打赢了他们，够吃三天。',
  },
  lan: {
    id: 'lan', name: '蓝幡', color: '#4a7fb0', rank: 2, share: 0.30,
    minSize: 12, maxSize: 22, extra: { raider: [2, 4] },
    loot: [45, 90], morale: [58, 72], sight: 6,
    desc: '有刀有弓的小股流寇，敢打落单的商队。',
  },
  cheng: {
    id: 'cheng', name: '橙旗', color: '#c07a3c', rank: 3, share: 0.08,
    minSize: 24, maxSize: 38, extra: { raider: [4, 8], raider_cav: [2, 4] },
    loot: [110, 190], morale: [66, 80], sight: 7,
    desc: '成建制的山贼，有骑有弓。剿他们才叫剿。',
  },
  hong: {
    id: 'hong', name: '赤号', color: '#a8403a', rank: 4, share: 0.02,
    minSize: 45, maxSize: 70, extra: { raider: [8, 14], raider_cav: [5, 10] },
    loot: [240, 420], morale: [78, 92], sight: 8,
    desc: '只比领主差一线。碰上他们，要么跑，要么准备好史简。',
  },
};

const BANDIT_NAMES = {
  qing: ['黑山残部', '白波散卒', '汝南流民', '太行饥民'],
  lan: ['泰山刀客', '江夏水贼', '淮南劫队', '颍川游侠'],
  cheng: ['青州铁山贼', '南阳黄巾', '汉中米贼', '辽东马贼'],
  hong: ['黑山飞燕', '白波大帅', '泰山群盗', '西凉叛骑'],
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
];

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
  { id: 'ox', name: '耕牛', price: 180, food: 60, desc: '一头牛换六十口粮。村里人舍不得，但给钱就卖。' },
  { id: 'sheep', name: '羊', price: 70, food: 22, desc: '两只羊够一队人吃两天。' },
  { id: 'chicken', name: '鸡鸭', price: 26, food: 8, desc: '零碎换的，胜在便宜。' },
  { id: 'grain', name: '谷子', price: 40, food: 30, desc: '村里自己的存粮，价比城里低。' },
  { id: 'veg', name: '菜蔬', price: 18, food: 6, desc: '地里刚拔的，撑不了几天。' },
];

module.exports = {
  GOODS,
  BANDIT_TIERS,
  BANDIT_NAMES,
  BANDIT_UNLOCK_STAGE,
  HEROES,
  HERO_MAX_LEVEL,
  LORD_TALK,
  VILLAGE_FOOD,
};

  };

  /* js/core/trade.js */
  __defs[12] = function (module, exports, __require) {
/**
 * 贸易层：跑商商品、各城物价、估价、买卖
 * 每座城对每种货有固定的偏好（便宜的产地、贵的销地），再叠每天的行情波动。
 */

const { GOODS } = __require(13);

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
  if (state.player.gold < cost) return { ok: false, msg: '金币不够，要 ' + cost };
  if (goodsCount(state.player) + n > GOODS_CAP) {
    return { ok: false, msg: '驮队装不下了（上限 ' + GOODS_CAP + ' 件）' };
  }
  state.player.gold -= cost;
  state.player.goods = state.player.goods || {};
  state.player.goods[goodId] = (state.player.goods[goodId] || 0) + n;
  return { ok: true, msg: '买入 ' + good.name + ' ×' + n + '，花费 ' + cost + ' 金', cost };
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
  return { ok: true, msg: '卖出 ' + goodById(goodId).name + ' ×' + n + '，得 ' + gain + ' 金', gain };
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

const { HEROES, HERO_MAX_LEVEL } = __require(13);
const { siteById, gridDistance } = __require(8);

const EXP_PER_LEVEL = 16;

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

function hireHero(state, site, heroId) {
  resolveHeroSites(state);
  const def = heroById(heroId);
  if (!def) return { ok: false, msg: '没有这个人' };
  if (state.heroSites[heroId] !== site.id) return { ok: false, msg: '他不在这个城' };
  state.player.heroes = state.player.heroes || [];
  if (state.player.heroes.length >= 4) return { ok: false, msg: '随行的英雄已经有四位，队伍塞不下了' };
  if (state.player.heroes.some(function (x) { return x.id === heroId; })) {
    return { ok: false, msg: '他已经在你队里了' };
  }
  if (state.player.gold < def.cost) return { ok: false, msg: '金币不够，他要 ' + def.cost };
  state.player.gold -= def.cost;
  state.player.heroes.push({ id: heroId, level: 1, exp: 0, kills: 0 });
  return { ok: true, msg: def.name + ' 加入了你的队伍' };
}

/** 队伍战力加成：每人每级 +1.1% 攻击、+0.8% 防御 */
function heroBonus(state) {
  const list = (state.player.heroes) || [];
  let atk = 0;
  let def = 0;
  list.forEach(function (h) {
    const lv = h.level || 1;
    atk += 0.011 * lv;
    def += 0.008 * lv;
  });
  return { atkPct: Math.min(0.45, atk), defPct: Math.min(0.4, def), count: list.length };
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
  resolveHeroSites,
  offersAt,
  heroById,
  hireHero,
  heroBonus,
  gainHeroExp,
  heroPower,
};

  };

  /* js/core/battle.js */
  __defs[15] = function (module, exports, __require) {
/**
 * 战斗层：回合制战术结算 + 史简
 * 玩家选战术，回合自动推进，双方同时结算，低阶兵先倒。
 * 史简可在战中写一笔，改一次规则（风向 / 风止 / 名册）。
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

function lossOfAttacker(defenderAtk, attackerDef, attackerCount, rng) {
  const ratio = defenderAtk / (defenderAtk + attackerDef * 2.2);
  const base = clamp(Math.pow(Math.min(1.2, ratio), 1.8) * 0.5, 0.04, 0.3);
  const jitter = 0.92 + rng.random() * 0.16;
  return Math.max(1, Math.round(attackerCount * base * jitter));
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

  /** 写一笔史简 */
  applyShiMark(id) {
    this.shiMark = id;
    this.shiName = id === 'wind' ? '南风起' : id === 'calm' ? '风止' : '名册';
    if (id === 'calm') this.shiRounds = 3;
    if (id === 'wind') this.fireGround = true;
  }

  /** 推进一个回合 */
  step() {
    if (this.finished) return null;
    this.round += 1;

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

    // 史简效果
    if (this.shiMark === 'wind') {
      atkA *= 1.45;
      if (this.fireGround) atkA *= 1.25;
    }
    if (this.shiMark === 'calm' && this.shiRounds > 0) {
      atkA *= 0.65;
      atkB *= 0.65;
      this.shiRounds -= 1;
    }

    // 火攻战：带火船/火计的兵种威力翻倍的一部分
    if (this.fireGround && sa.fireRatio > 0.05) atkA *= 1.15;

    // 弓弩首轮齐射
    let alphaStrike = 0;
    if (this.round === 1 && tacticA.id === 'skirmish' && sa.rangedRatio > 0.15) {
      alphaStrike = Math.round(sb.count * 0.06 + sa.ranged * 0.5);
    }

    const lossA = lossOfAttacker(atkB, defA, sa.count, this.rng);
    const lossB = lossOfAttacker(atkA, defB, sb.count, this.rng) + alphaStrike;

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

    // 溃败判定：lock（白毦/禁军一类）不轻易溃
    const ratioA = this.remainA() / (this.a.initialCount || 1);
    const ratioB = this.remainB() / (this.b.initialCount || 1);
    const lockA = strength(this.a.initialTroops).lockRatio > 0.25;
    const lockB = strength(this.b.initialTroops).lockRatio > 0.25;
    const breakA = ratioA < 0.35 && !lockA;
    const breakB = ratioB < 0.35 && !lockB;

    if (this.remainA() <= 0 || breakA || this.remainB() <= 0 || breakB) {
      if (this.remainA() <= 0 && this.remainB() <= 0) this.finish('draw');
      else if (this.remainB() <= 0 || breakB) this.finish('win');
      else this.finish('lose');
    } else if (this.round >= MAX_ROUNDS) {
      this.finish(Math.abs(ratioA - ratioB) < 0.05 ? 'draw' : ratioA > ratioB ? 'win' : 'lose');
    }

    return entry;
  }

  finish(result) {
    this.finished = true;
    this.result = result;
  }

  retreat() {
    if (this.finished) return this.result;
    const extra = Math.max(1, Math.round(this.remainA() * 0.25));
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
    if (this.result !== 'win') return 0;
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
      round: this.round,
      rounds: this.round,
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
}

module.exports = { Battle, TACTICS, TACTIC_LIST, moraleFactor };

  };

  /* js/core/state.js */
  __defs[7] = function (module, exports, __require) {
/**
 * 游戏状态层：行军、势力关系、领主 AI、战斗结算、战役链、史简、存档
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
const trade = __require(12);
const heroes = __require(14);
const { Battle } = __require(15);
const {
  FACTIONS, RENOWN_TIERS, CAMPAIGN, ENDINGS, EQUIPMENT,
} = __require(5);
const { TROOPS } = __require(10);
const {
  BANDIT_TIERS, BANDIT_NAMES, BANDIT_UNLOCK_STAGE, LORD_TALK, VILLAGE_FOOD,
} = __require(13);

const HOUR_SECONDS = 0.26; // 1 游戏小时 = 0.26 真实秒
const NPC_STEP_HOURS = 3;
const LORD_RESPAWN_DAYS = 12;
const SAVE_VERSION = 4;

/** 全图常驻匪团目标数量（玩家附近看得见，远处也算） */
const BANDIT_TARGET = 12;
const BANDIT_MAX = 16;

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

function pushLog(state, text) {
  state.log.push({ day: state.clock.day, hour: Math.floor(state.clock.hour), text });
  if (state.log.length > 120) state.log.shift();
}

/* ---------------------------------------------------------------- 初始化 */

function createGame(opts) {
  const seed = (opts && opts.seed) || (Date.now() % 2147483647);
  const rng = new RNG(seed);
  const world = createWorld(seed);

  world.sites.forEach(function (site) {
    site.recruits = {};
    (site.recruitList || []).forEach(function (id) {
      site.recruits[id] = rng.int(1, site.recruitCap || 4);
    });
  });

  // 开局：洛阳东门外，三十名溃兵
  const luoyang = siteById(world, 'luoyang');
  const base = luoyang ? { x: luoyang.x + 3, y: luoyang.y + 1 } : { x: 34, y: 38 };
  const spawn = findFreeSpotNear(state0(world), base.x, base.y, 2) || base;

  const player = {
    name: (opts && opts.name) || '无名溃兵',
    flagName: '无旗',
    gold: 80,
    food: 45,
    morale: 58,
    renown: 0,
    faction: null,
    banner: false,
    troops: { militia: 30 },
    equip: { blade: 0, armor: 0, horse: 0 },
    shi: 1,
    shiUsed: 0,
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
    gameOver: false,
    ending: null,
    timeScale: 1,
    npcClock: 0,
    rng,
    questSeq: 1,
    partySeq: 1,
    battle: null,
  };

  spawnLords(state);
  heroes.resolveHeroSites(state);
  spawnBanditParties(state, 8);
  spawnChaseParty(state, spawn);

  pushLog(state, '洛阳城破了。你带着三十名溃兵往东走，身后是西凉铁骑。');
  pushLog(state, '别回头。跑到陈留，就还有二十个人跟你。');
  state.events.push({ type: 'chapter', chapterId: __require(5).CAMPAIGN[0].id });
  return state;
}

/** 供 findFreeSpotNear 复用的临时外壳 */
function state0(world) {
  return { world, player: { x: -1, y: -1 }, rng: new RNG(1) };
}

function findFreeSpotNear(state, cx, cy, radius) {
  const rng = state.rng || new RNG(1);
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = cx + rng.int(-radius, radius);
    const y = cy + rng.int(-radius, radius);
    if (!isPassable(state.world, x, y)) continue;
    if (siteAt(state.world, x, y)) continue;
    if (state.player && x === state.player.x && y === state.player.y) continue;
    return { x, y };
  }
  return null;
}

function spawnLords(state) {
  const { LORDS } = __require(5);
  state.lords = LORDS.map(function (def) {
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
    };
  });
}

/** 序章追兵：西凉铁骑，慢一步，逼你往东跑 */
function spawnChaseParty(state, pos) {
  const from = findFreeSpotNear(state, pos.x - 6, pos.y + 1, 1) || { x: Math.max(1, pos.x - 6), y: pos.y };
  state.parties.push({
    id: 'p_xiliang',
    name: '西凉铁骑',
    faction: 'xiliang',
    scripted: true,
    slow: 2,
    tick: 0,
    troops: { cav: 40, tiefu: 20 },
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
  if (pf && factionId !== pf && rel < 20) return true;
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
    pushLog(state, FACTIONS[factionId].name + '把你列为逆贼，其领主见到你就会动手。');
  }
  if (delta < 0 && before > -25 && next <= -25) {
    state.wars[factionId] = true;
  }
}

function isHostileSite(state, site) {
  if (!site) return false;
  if (site.type === 'camp' && !site.cleared) return true;
  if (site.playerOwned) return false;
  return isHostileFaction(state, site.ownerFaction);
}

function siteStatus(state, site) {
  if (site.playerOwned) return '你的领地';
  if (site.type === 'camp' && !site.cleared) return '贼巢 · 可攻';
  if (!site.ownerFaction) return '无主';
  if (isHostileFaction(state, site.ownerFaction)) return '敌对';
  return '可进入';
}

/* ---------------------------------------------------------------- 查询 */

function playerSpeed(state) {
  const bonus = economy.equipmentBonus(state);
  const count = army.troopCount(state.player.troops);
  const sizePenalty = Math.min(0.45, count / 240);
  return Math.max(0.55, 1 + bonus.speedPct - sizePenalty);
}

function capacity(state) {
  return army.troopCapacity(state.player.renown);
}

function currentPos(state) {
  return { x: state.player.x, y: state.player.y };
}

/* ---------------------------------------------------------------- 行军 */

function goTo(state, x, y) {
  if (state.gameOver) return { ok: false, msg: '旅途已经结束' };
  if (!isPassable(state.world, x, y)) return { ok: false, msg: '这里过不去' };
  const from = currentPos(state);
  if (from.x === x && from.y === y) return { ok: false, msg: '已经在这里了' };

  const path = findPath(state.world, from, { x, y });
  if (!path || !path.length) return { ok: false, msg: '没有可达的路线' };

  state.player.route = path;
  state.player.stepFrom = { x: from.x, y: from.y };
  state.player.stepTo = path[0];
  state.player.stepProgress = 0;
  state.player.atSiteId = null;
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
  pushLog(state, '就地扎营一天，火头军煮了粥。');
  return { ok: true, msg: '休整完毕' };
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
  const need = army.foodPerDay(p.troops);

  if (p.food >= need) {
    p.food -= need;
    if (p.food < need * 2) {
      p.morale = Math.max(0, p.morale - 3);
      pushLog(state, '粮草见底（剩 ' + p.food + '），队伍开始嘀咕。');
    }
  } else {
    const short = need - p.food;
    p.food = 0;
    p.morale = Math.max(0, p.morale - 10);
    const starved = Math.min(short, army.troopCount(p.troops));
    if (starved > 0) {
      army.distributeLosses(p.troops, starved);
      state.stats.troopsLost += starved;
      pushLog(state, '断粮！' + short + ' 人夜里走了。');
    }
    if (army.troopCount(p.troops) <= 0) {
      reviveAfterDefeat(state, 'starve');
      return;
    }
  }

  if (p.morale < 65) p.morale = Math.min(65, p.morale + 3);
  const income = economy.dailyIncome(state);
  if (income > 0) {
    p.gold += income;
    state.stats.goldEarned += income;
  }
  economy.dailyMarket(state, state.rng);
  trade.dailyGoods(state, state.rng);

  // 匪团补充：维持全图常驻数量（太少没得打，太多寸步难行）
  refillBandits(state);
  // 领主重生
  state.lords.forEach(function (lord) {
    if (!lord.alive && state.clock.day >= lord.respawnDay) {
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
}

/* ---------------------------------------------------------------- 主循环 */

function update(state, dtSeconds) {
  if (state.gameOver) return;
  const dt = dtSeconds * (state.timeScale || 1);
  const p = state.player;

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
  }

  // 天下在动：只有游戏时间真正流逝了，NPC 才动
  const elapsed = state.hoursPending || 0;
  state.hoursPending = 0;
  state.npcClock += elapsed;
  while (state.npcClock >= NPC_STEP_HOURS) {
    state.npcClock -= NPC_STEP_HOURS;
    moveParties(state);
    moveLords(state);
    checkPursuit(state);
    advanceCampaign(state);
    if (state.events.length) return;
  }
}

function onArrive(state, x, y) {
  const site = siteAt(state.world, x, y);
  if (site) {
    state.player.atSiteId = site.id;
    site.visited = true;
    if (isHostileSite(state, site)) {
      if (canFight(state, site.id)) state.events.push({ type: 'siege', siteId: site.id });
      advanceCampaign(state);
    } else {
      state.events.push({ type: 'enter-site', siteId: site.id });
    }
    advanceCampaign(state);
    return;
  }
  const enemy = adjacentEnemy(state, x, y);
  if (enemy) {
    state.events.push({ type: 'encounter', partyId: enemy.id });
  } else {
    advanceCampaign(state);
  }
}

function adjacentEnemy(state, x, y) {
  let best = null;
  let bestD = 99;
  const all = state.parties.concat(state.lords.filter(function (l) { return l.alive; }));
  all.forEach(function (unit) {
    if (!isHostileFaction(state, unit.faction)) return;
    if (!canFight(state, unit.id)) return;
    const d = Math.max(Math.abs(unit.x - x), Math.abs(unit.y - y));
    if (d <= 1 && d < bestD) {
      bestD = d;
      best = unit;
    }
  });
  return best;
}

/** 敌对单位贴上来就开打；领主要先在视野内追 */
function checkPursuit(state) {
  const p = state.player;
  if (state.events.length) return;
  const all = state.parties.concat(state.lords.filter(function (l) { return l.alive; }));
  for (let i = 0; i < all.length; i++) {
    const unit = all[i];
    if (!isHostileFaction(state, unit.faction)) continue;
    if (!canFight(state, unit.id)) continue;
    if (Math.abs(unit.x - p.x) <= 1 && Math.abs(unit.y - p.y) <= 1) {
      stopMoving(state);
      if (unit.id && unit.id.indexOf('l_') === 0) {
        state.events.push({ type: 'lord', lordId: unit.id });
      } else {
        state.events.push({ type: 'encounter', partyId: unit.id });
      }
      return;
    }
  }
}

function moveParties(state) {
  const p = state.player;
  state.parties.forEach(function (party) {
    if (party.slow) {
      party.tick = (party.tick || 0) + 1;
      if (party.tick % party.slow !== 0) return;
    }
    const dist = gridDistance(party, p);
    let target;
    if (dist <= (party.sight || 5) && isHostileFaction(state, party.faction)) {
      target = { x: p.x, y: p.y };
      party.chasing = true;
    } else {
      if (!party.wander || gridDistance(party, party.wander) < 1) {
        party.wander = findFreeSpotNear(state, party.x, party.y, 5);
      }
      target = party.wander;
      party.chasing = false;
    }
    if (!target) return;
    const step = greedyStep(state, party, target);
    if (step) {
      party.x = step.x;
      party.y = step.y;
    }
  });

  // 路上相逢：匪团与领主互殴
  fightNeighbors(state);
}

/** 领主：敌对且玩家在视野内 → 追；否则回防驻地 */
function moveLords(state) {
  const p = state.player;
  state.lords.forEach(function (lord) {
    if (!lord.alive) return;
    let target;
    const dist = gridDistance(lord, p);
    if (isHostileFaction(state, lord.faction) && dist <= lord.sight) {
      target = { x: p.x, y: p.y };
      lord.chasing = true;
    } else {
      lord.chasing = false;
      const home = siteById(state.world, lord.home);
      if (home && gridDistance(lord, home) > 3) {
        target = { x: home.x, y: home.y };
      } else {
        if (!lord.wander || gridDistance(lord, lord.wander) < 1) {
          lord.wander = findFreeSpotNear(state, lord.x, lord.y, 3);
        }
        target = lord.wander;
      }
    }
    if (!target) return;
    const step = greedyStep(state, lord, target);
    if (step) {
      lord.x = step.x;
      lord.y = step.y;
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

/**
 * 匪团与领主在路上撞上：双方互扣兵力。
 * 只在玩家附近（12 格内）写进史册，远处打完也无声。
 */
function fightNeighbors(state) {
  const p = state.player;
  state.parties.forEach(function (party) {
    if (party.scuffle) party.scuffle -= 1;
    if (party.faction !== 'bandit') return;
    if (!party.troops || army.troopCount(party.troops) <= 0) return;
    const lord = state.lords.filter(function (l) {
      return l.alive && Math.abs(l.x - party.x) <= 1 && Math.abs(l.y - party.y) <= 1;
    })[0];
    if (!lord) return;
    if (lord.faction === 'bandit') return;

    const wa = troopWeight(party.troops);
    const wb = troopWeight(lord.troops);
    const share = wa / (wa + wb || 1);
    const lossA = Math.max(1, Math.round(army.troopCount(party.troops) * (0.22 + share * 0.3)));
    const lossB = Math.max(1, Math.round(army.troopCount(lord.troops) * (0.22 + (1 - share) * 0.3)));
    army.distributeLosses(party.troops, lossA);
    army.distributeLosses(lord.troops, lossB);
    party.scuffle = 6;

    const near = Math.max(Math.abs(party.x - p.x), Math.abs(party.y - p.y)) <= 12;
    if (army.troopCount(party.troops) <= 0) {
      state.parties = state.parties.filter(function (x) { return x.id !== party.id; });
      if (near) pushLog(state, lord.name + '的部曲把' + party.name + '吃掉了。地上留了一地断刀。');
    } else if (army.troopCount(lord.troops) <= 0) {
      lord.alive = false;
      lord.respawnDay = state.clock.day + LORD_RESPAWN_DAYS;
      lord.troops = {};
      if (near) pushLog(state, lord.name + '被' + party.name + '打散了队伍，一个人往城里退。');
    } else if (near) {
      pushLog(state, party.name + '和' + lord.name + '在路上打了一场，双方各折了 ' + lossA + '、' + lossB + ' 人。');
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
    if (siteAt(state.world, nx, ny)) continue;
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
    name: state.player.flagName === '无旗' ? state.player.name : state.player.flagName,
    faction: state.player.faction,
    troops: deepCopy(state.player.troops),
    morale: state.player.morale,
    atkPct: bonus.atkPct + hb.atkPct,
    defPct: bonus.defPct + hb.defPct,
    isPlayer: true,
  };
}

function startPartyBattle(state, party) {
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
  const map = set[f] || { militia: 0.4, spear: 0.3, archer: 0.2, cav: 0.1 };
  const troops = {};
  Object.keys(map).forEach(function (id) {
    const n = Math.round(total * map[id]);
    if (n > 0) troops[id] = n;
  });
  return troops;
}

function startSiege(state, site) {
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

  // 史简「名册」：阵亡者部分回归
  if (battle.shiMark === 'roll' && summary.result !== 'retreat') {
    const back = Math.max(0, Math.round(summary.initialA * 0.35));
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
      pushLog(state, '史简「名册」生效：' + put + ' 个名字又从纸上站了起来。');
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
      pushLog(state, '击溃' + ctx.partyName + '：缴获 ' + loot + ' 金，声望 +' + renownGain + '。');
      if (ctx.kind === 'chase') {
        pushLog(state, '西凉铁骑退了。你回头看了一眼洛阳的方向，没再回头。');
        advanceCampaign(state);
      }
    } else if (ctx.kind === 'lord') {
      const lord = state.lords.filter(function (x) { return x.id === ctx.lordId; })[0];
      if (lord) {
        lord.alive = false;
        lord.respawnDay = state.clock.day + LORD_RESPAWN_DAYS;
        lord.troops = {};
        changeRelation(state, lord.faction, -35);
        pushLog(state, '你击败了' + lord.name + '！' + (FACTIONS[lord.faction] ? FACTIONS[lord.faction].name : '') + '与你结下死仇。');
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
    const lostGold = Math.round(p.gold * 0.28);
    const lostFood = Math.round(p.food * 0.28);
    p.gold -= lostGold;
    p.food -= lostFood;
    pushLog(state, '战败，被抢走 ' + lostGold + ' 金与 ' + lostFood + ' 粮。');
    heroes.gainHeroExp(state, 3);
    if (army.troopCount(p.troops) <= 0) {
      reviveAfterDefeat(state, 'battle');
    }
  } else if (summary.result === 'retreat') {
    p.morale = Math.max(0, p.morale - 8);
    pushLog(state, '你下令脱离战斗，退到野地里。');
    afterRetreat(state, battle.context);
  }

  state.stats.troopsLost += Math.max(0, summary.initialA - summary.remainA);
  state.battle = null;
  return summary;
}

function takeSite(state, site) {
  const p = state.player;
  if (site.type === 'camp') {
    site.cleared = true;
    site.garrison = 0;
    p.renown += 45;
    p.gold += 120;
    pushLog(state, '攻破' + site.name + '！贼巢被拔，声望 +45。');
  } else {
    const oldFaction = site.ownerFaction;
    site.playerOwned = true;
    site.ownerFaction = p.faction || null;
    site.garrison = Math.max(10, Math.round(site.garrisonBase * 0.35));
    site.garrisonBase = site.garrison;
    site.color = '#d9a441';
    site.banner = '旗';
    p.gold += 150;
    state.stats.sitesTaken += 1;
    if (oldFaction && oldFaction !== 'bandit') {
      changeRelation(state, oldFaction, -60);
    }
    pushLog(state, '你拿下了' + site.name + '。从今天起，这里归你。');
    checkVictory(state);
    advanceCampaign(state);
  }
}

/* ---------------------------------------------------------------- 任务 */

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
  pushLog(state, '交差：' + q.title + '，得 ' + q.reward.gold + ' 金、' + q.reward.renown + ' 声望。');
}

function completeQuests(state, type, targetId) {
  state.quests.forEach(function (q) {
    if (q.done || q.type !== type) return;
    if (type === 'hunt' && q.targetPartyId !== targetId) return;
    q.done = true;
    finishQuest(state, q);
  });
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
  if (p.faction) return { ok: false, msg: '你已经效忠' + FACTIONS[p.faction].full };
  if (!site.ownerFaction || site.ownerFaction === 'bandit') return { ok: false, msg: '这里没有可效忠的旗' };
  if (site.playerOwned) return { ok: false, msg: '这是你自己的地盘' };
  if (p.renown < 60) return { ok: false, msg: '声望不足 60，' + site.name + '的守将不见你' };
  const f = site.ownerFaction;
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

function declareWar(state, site) {
  const f = site.ownerFaction;
  if (!f || f === 'bandit') return { ok: false, msg: '这里没有可宣战的对象' };
  if (state.player.faction === f) return { ok: false, msg: '你不能对自己的国宣战' };
  state.wars[f] = true;
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
  state.player.gold += gold;
  state.player.food += food;
  state.stats.villagesRaided += 1;
  site.garrison = Math.max(0, site.garrison - 6);
  site.priceIndex = Math.min(1.5, (site.priceIndex || 1) * 1.2);
  site.burned = true;
  // 屠村只掉 5 点关系，但村里会记很久
  if (site.ownerFaction) changeRelation(state, site.ownerFaction, -5);
  state.player.renown = Math.max(0, state.player.renown - 4);
  pushLog(state, '你屠了' + site.name + '，得 ' + gold + ' 金、' + food + ' 粮。村口有人记住了你的旗。');
  return { ok: true, msg: '抢到 ' + gold + ' 金、' + food + ' 粮' };
}

/** 村庄：跟村长买口粮（牛、羊、鸡、谷） */
function buyVillageFood(state, site, itemId) {
  if (!site || site.type !== 'village') return { ok: false, msg: '这里没有村市' };
  let item = null;
  VILLAGE_FOOD.forEach(function (f) { if (f.id === itemId) item = f; });
  if (!item) return { ok: false, msg: '没有这样东西' };
  const price = Math.round(item.price * (site.priceIndex || 1) * 0.85);
  if (state.player.gold < price) return { ok: false, msg: '钱不够，要 ' + price };
  if (state.player.food + item.food > 400) return { ok: false, msg: '粮车装不下了' };
  state.player.gold -= price;
  state.player.food += item.food;
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

function lordRank(lord) {
  return LORD_RANK[lord.id] || 'general';
}

function lordLines(lord) {
  const t = LORD_TALK[lord.id];
  if (!t) {
    return {
      greet: '有什么事？',
      bio: lord.name + '，' + (FACTIONS[lord.faction] ? FACTIONS[lord.faction].full + '麾下' : '游走于乱世') + '。',
      idle: ['在看着远处。'],
      warLine: '在看着远处。',
    };
  }
  return t;
}

/** 每次对话随机一句闲聊，结合当前战事 */
function lordIdle(state, lord) {
  const t = lordLines(lord);
  const pool = (t.idle || []).slice();
  const war = state.wars || {};
  let atWar = false;
  Object.keys(war).forEach(function (id) { if (war[id] && id !== 'bandit') atWar = true; });
  if (atWar && t.warLine) pool.push(t.warLine);
  const pick = pool[Math.floor(state.rng.random() * pool.length)] || '在巡视营地。';
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
  if (state.player.gold < n) return { ok: false, msg: '金币不够，你只有 ' + state.player.gold };
  const rate = RANK_RATE[lordRank(lord)];
  const gain = Math.max(1, Math.round((n / 100) * rate));
  state.player.gold -= n;
  changeRelation(state, lord.faction, gain);
  const rel = relationOf(state, lord.faction);
  pushLog(state, '你给' + lord.name + '送了 ' + n + ' 金，关系 +' + gain + '（现在 ' + rel + '）。');
  return { ok: true, msg: '送 ' + n + ' 金，关系 +' + gain + '（现在 ' + rel + '）', gain, rel };
}

/** 开战：直接扣 25 关系 */
function provokeLord(state, lord) {
  changeRelation(state, lord.faction, -25);
  state.wars[lord.faction] = true;
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
  reach_chenliu: '往东走到陈留。路上别停，西凉铁骑会追。',
  troops_60: '在陈留一带招兵，凑到 60 人；市集里也备点粮。',
  win_wuchao: '回官渡。到了就会有一场硬仗。',
  take_xiapi: '南下打下邳。',
  win_chibi: '去赤壁或柴桑，水战自己会来。',
  win_yiling: '去夷陵。',
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
    state.events.push({ type: 'chapter', chapterId: ch.id });
    pushLog(state, '【' + ch.title + '】' + (ch.after || ''));
    advanceCampaign(state);
  }
}

function checkCampaign(state, key) {
  const p = state.player;
  const count = army.troopCount(p.troops);
  if (key === 'reach_chenliu') {
    if (p.atSiteId === 'chenliu') return true;
    if (state.clock.day > 8) return true;
    return false;
  }
  if (key === 'troops_60') {
    if (count >= 60) return true;
    return false;
  }
  if (key === 'win_wuchao') return !!state.flags['win_act2'];
  if (key === 'take_xiapi') {
    const s = siteById(state.world, 'xiapi');
    return !!(s && s.playerOwned) || !!state.flags.lvbuBeaten || !!state.flags['win_act3'];
  }
  if (key === 'win_chibi') return !!state.flags['win_act4'];
  if (key === 'win_yiling') return !!state.flags['win_act5'];
  if (key === 'win_final') return !!state.flags['win_final'];
  return false;
}

/** 战役触发的特殊战斗：回到地图某处时开打 */
function tryCampaignBattle(state) {
  const p = state.player;
  const stage = state.campaign.stage;
  if (stage === 2 && p.atSiteId === 'guandu') {
    return startCampaignBattle(state, 'wuchao');
  }
  if (stage === 4 && (p.atSiteId === 'chibi' || p.atSiteId === 'chaisang')) {
    return startCampaignBattle(state, 'chibi');
  }
  if (stage === 5 && p.atSiteId === 'yiling') {
    return startCampaignBattle(state, 'yiling');
  }
  if (stage === 6) {
    const capitals = ['xuchang', 'chengdu', 'jianye', 'ye'];
    if (capitals.indexOf(p.atSiteId) >= 0 && army.troopCount(p.troops) >= 250) {
      return startCampaignBattle(state, 'final');
    }
  }
  return null;
}

/** 战役好感/后果：乌巢一把火，袁军全线松动 */
function applyCampaignEffect(state, id) {
  if (id === 'act2') {
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
    decideEnding(state);
  }
}

/* ---------------------------------------------------------------- 史简 */

function useHistory(state, markId) {
  const p = state.player;
  if (!state.battle) return { ok: false, msg: '现在没有在打仗' };
  if (p.shi <= 0) return { ok: false, msg: '史简用完了' };
  if (state.battle.finished) return { ok: false, msg: '仗已经打完了' };
  if (state.battle.shiMark) return { ok: false, msg: '这一战你已经落过一笔' };
  const marks = __require(5).HISTORY_MARKS;
  if (!marks[markId]) return { ok: false, msg: '写不出这一笔' };
  p.shi -= 1;
  p.shiUsed += 1;
  state.battle.applyShiMark(markId);
  Object.keys(state.relations).forEach(function (id) {
    if (id === 'bandit') return;
    changeRelation(state, id, -6);
  });
  pushLog(state, marks[markId].text + '天下人会记住这一笔。');
  return { ok: true, msg: marks[markId].name };
}

/* ---------------------------------------------------------------- 胜负 */

function checkVictory(state) {
  const owned = state.world.sites.filter(function (s) { return s.playerOwned; }).length;
  if (owned >= 8 && !state.gameOver) {
    decideEnding(state);
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
    text += '\n（你握有 ' + owned + ' 座城，用了 ' + p.shiUsed + ' 支史简。）';
  } else if (type === 'xu') {
    text += '\n（名册上还剩 ' + army.troopCount(p.troops) + ' 个名字。）';
  } else if (type === 'fen') {
    text += '\n（你烧掉了 ' + p.shiUsed + ' 支史简，地图上有 ' + owned + ' 座城没有主人。）';
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
    heroSites: state.heroSites || null,
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

  const state = {
    version: data.version || SAVE_VERSION,
    seed: data.seed,
    clock: data.clock,
    world: data.world,
    player: data.player,
    relations: data.relations,
    wars: data.wars || {},
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
    heroSites: data.heroSites || null,
    battle: null,
  };
  state.player.route = [];
  state.player.stepFrom = null;
  state.player.stepTo = null;
  state.player.stepProgress = 0;
  return state;
}

module.exports = {
  HOUR_SECONDS,
  SAVE_VERSION,
  createGame,
  update,
  goTo,
  currentPos,
  stopMoving,
  camp,
  advanceTime,
  dailyTick,
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
  startCampaignBattle,
  resolveBattle,
  takeSite,
  offerQuest,
  deliverGrain,
  checkScoutQuest,
  completeQuests,
  joinFaction,
  declareWar,
  raidVillage,
  campaignState,
  campaignInfo,
  advanceCampaign,
  tryCampaignBattle,
  applyCampaignEffect,
  useHistory,
  renownTitle,
  pushLog,
  serialize,
  deserialize,
  endGame,
  checkVictory,
  decideEnding,
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
  __defs[16] = function (module, exports, __require) {
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
  __defs[17] = function (module, exports, __require) {
/**
 * 标题：骑砍大师 · 三国
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

    // 背景
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1a1510');
    grad.addColorStop(0.55, '#241a12');
    grad.addColorStop(1, '#0f0c09');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 远山
    ctx.fillStyle = '#2b2218';
    for (let i = 0; i < 5; i++) {
      const bx = -40 + i * (w / 4) + 20;
      const bh = 180 + (i % 3) * 40;
      ctx.beginPath();
      ctx.moveTo(bx, h * 0.62);
      ctx.lineTo(bx + w / 8, h * 0.62 - bh);
      ctx.lineTo(bx + w / 4, h * 0.62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#3a2c1e';
    for (let i = 0; i < 4; i++) {
      const bx = -20 + i * (w / 3);
      ctx.beginPath();
      ctx.moveTo(bx, h * 0.66);
      ctx.lineTo(bx + w / 6, h * 0.66 - 80);
      ctx.lineTo(bx + w / 3, h * 0.66);
      ctx.closePath();
      ctx.fill();
    }

    // 主角剪影
    const size = 190;
    pixelSilhouette(ctx, app, w / 2, h * 0.52, size, t);

    // 标题
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.fillRect(0, h * 0.58, w, 150);
    text(ctx, '骑砍大师', w / 2, h * 0.60, { size: 86, align: 'center', color: '#f0c060', shadow: true });
    text(ctx, '三 国 · 群 雄 割 据', w / 2, h * 0.60 + 96, {
      size: 24, align: 'center', color: '#c9bda2',
    });

    // 按钮
    const by = h * 0.76;
    const bw = w - 160;
    app.ui.button(ctx, 80, by, bw, 96, '新的开始 · 洛阳溃兵', {
      id: 'new', size: 30, fill: '#3a2c1e', onTap: function () {
        app.state = stateLib.createGame({});
        app.replace('map');
      },
    });

    const meta = app.saveMeta;
    app.ui.button(ctx, 80, by + 116, bw, 96, meta ? '继续 · 第 ' + meta.clock.day + ' 天 ' + (meta.player.flagName === '无旗' ? meta.player.name : meta.player.flagName) : '继续（暂无存档）', {
      id: 'cont', size: 28, disabled: !meta, fill: '#241c14', onTap: function () {
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

    app.ui.button(ctx, 80, by + 232, bw, 88, '玩法 · 战役 · 兵种', {
      id: 'help', size: 26, fill: '#201a14', onTap: function () {
        app.push('help');
      },
    });

    text(ctx, '点地图行军 · 城池经营 · 领主追杀 · 史简改命', w / 2, h - 46, {
      size: 15, align: 'center', color: '#6a6050',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

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

  /* js/scenes/flows.js */
  __defs[19] = function (module, exports, __require) {
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
    if (ev.type === 'siege') {
      const site = siteById(st.world, ev.siteId);
      if (!site) continue;
      stateLib.startSiege(st, site);
      app.push('battle', { mode: 'siege' });
      return;
    }
    if (ev.type === 'encounter') {
      const party = st.parties.filter(function (p) { return p.id === ev.partyId; })[0];
      if (!party) continue;
      stateLib.startPartyBattle(st, party);
      app.push('battle', { mode: 'party' });
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
  __defs[18] = function (module, exports, __require) {
/**
 * 大地图场景：三国全图、区域风景、玩家骑马立绘、城池名牌、行军
 */

const { text, panel, bar, wrap } = __require(6);
const pixel = __require(3);
const { UI_COLORS } = pixel;
const stateLib = __require(7);
const army = __require(9);
const { regionAt, regionDef, siteById, terrainAt } = __require(8);
const { FACTIONS, TERRAIN, CAMPAIGN, COAST, RIVER_HUANG, RIVER_YANG, RIVER_HUAI, MOUNTAINS, ROADS, BASE_W } = __require(5);
const flows = __require(19);

const TILE = 64;
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
      x: st.player.x * TILE + TILE / 2 - app.runtime.width / 2,
      y: st.player.y * TILE + TILE / 2 - box.h / 2,
    };
  }
  const maxX = st.world.w * TILE - app.runtime.width;
  const maxY = st.world.h * TILE - box.h;
  app.mapCam.x = clamp(app.mapCam.x, Math.min(0, maxX), Math.max(0, maxX));
  app.mapCam.y = clamp(app.mapCam.y, Math.min(0, maxY), Math.max(0, maxY));
}

const MapScene = {
  enter(app) {
    app.mapCam = null;
    app.mapPhase = 0;
    app.mapDrag = null;
    ensureCam(app);
    flows.process(app);
    if (app.state && app.state.player.atSiteId) {
      flows.tryCampaign(app);
    }
  },

  update(app, dt) {
    const st = app.state;
    app.mapPhase = (app.mapPhase || 0) + dt;
    stateLib.update(st, dt);
    ensureCam(app);

    // 相机跟随（跟插值后的位置，不再跟着格子跳）
    const box = mapBox(app);
    const pos = playerPixel(app);
    const targetX = pos.gx * TILE + TILE / 2 - app.runtime.width / 2;
    const targetY = pos.gy * TILE + TILE / 2 - box.h / 2;
    if (!app.mapDrag) {
      app.mapCam.x += (targetX - app.mapCam.x) * Math.min(1, dt * 9);
      app.mapCam.y += (targetY - app.mapCam.y) * Math.min(1, dt * 9);
    }

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
    const box = mapBox(app);
    const cam = app.mapCam;
    ensureCam(app);

    drawTerrainView(ctx, app, cam, box, w);
    drawGeography(ctx, app, cam, box, w);
    drawAtmosphere(ctx, box, w);
    drawSites(ctx, app, cam, box, w);
    drawUnits(ctx, app, cam, box, w);
    drawRoute(ctx, app, cam, box);
    drawPlayerOnMap(ctx, app, cam, box);
    drawRegionTag(ctx, app, box, w);
    drawQuestCard(ctx, app, box, w);
    drawTop(ctx, app, w);
    drawBottom(ctx, app, w, box);
  },

  onTouchStart(app, x, y) {
    app.mapDrag = { x, y, startX: x, startY: y, dragging: false, camX: app.mapCam.x, camY: app.mapCam.y };
  },

  onTouchMove(app, x, y) {
    const d = app.mapDrag;
    if (!d) return;
    const dx = x - d.startX;
    const dy = y - d.startY;
    if (!d.dragging && Math.abs(dx) + Math.abs(dy) > 22) d.dragging = true;
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
    if (y < TOP_H || y > TOP_H + mapBox(app).h) return;

    const st = app.state;
    const tx = Math.floor((x + app.mapCam.x) / TILE);
    const ty = Math.floor((y - TOP_H + app.mapCam.y) / TILE);
    if (tx < 0 || ty < 0 || tx >= st.world.w || ty >= st.world.h) return;

    const t = terrainAt(st.world, tx, ty);
    if (!t || !t.passable) {
      app.showToast(t && t.id === 'sea' ? '前面是海，绕路走。' : '山地翻不过去。');
      return;
    }
    const r = stateLib.goTo(st, tx, ty);
    if (!r.ok) app.showToast(r.msg);
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
  const toX = function (gx) { return gx * TILE - cam.x; };
  const toY = function (gy) { return box.top + gy * TILE - cam.y; };
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
    const width = TILE * r[1];
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
    ctx.lineWidth = TILE * 1.3;
    strokePolyline(ctx, line, toX, toY);
    ctx.strokeStyle = 'rgba(152,145,132,0.58)';
    ctx.lineWidth = TILE * 0.56;
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

    const startX = Math.max(0, Math.floor(cam.x / TILE));
    const startY = Math.max(0, Math.floor(cam.y / TILE));
    const endX = Math.min(world.w - 1, Math.ceil((cam.x + w) / TILE));
    const endY = Math.min(world.h - 1, Math.ceil((cam.y + box.h) / TILE));

    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(0, box.top, w, box.h);
    ctx2.clip();

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const sx = x * TILE - cam.x;
        const sy = box.top + y * TILE - cam.y;
        const idx = y * world.w + x;
        const t = world.tiles[idx] || 'plain';
        const region = (world.regions && world.regions[idx]) || 'zhongyuan';
        const sprite = assets.terrainFor(region, t);
        ctx2.drawImage(sprite, sx, sy, TILE, TILE);
      }
    }
    ctx2.restore();
}

function drawSites(ctx, app, cam, box, w) {
  const st = app.state;
  const assets = app.assets;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();

  st.world.sites.forEach(function (site) {
    const sx = site.x * TILE - cam.x;
    const sy = box.top + site.y * TILE - cam.y;
    if (sx < -TILE * 2 || sx > w + TILE || sy < box.top - TILE || sy > box.top + box.h + TILE) return;

    const sprite = assets.site[site.type] || assets.site.village;
    ctx.drawImage(sprite, sx + 4, sy + 4, TILE - 8, TILE - 8);

    // 势力旗
    if (site.ownerFaction) {
      const col = FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].color : '#8f8f86';
      ctx.fillStyle = col;
      ctx.fillRect(sx + TILE - 16, sy + 4, 12, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(sx + TILE - 16, sy + 4, 12, 2);
      text(ctx, FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].banner : '?', sx + TILE - 10, sy + 6, {
        size: 13, align: 'center', color: '#fff',
      });
    } else {
      ctx.fillStyle = '#6a655c';
      ctx.fillRect(sx + TILE - 16, sy + 4, 12, 14);
    }

    // 名牌
    const isTown = site.type === 'town';
    const isCastle = site.type === 'castle';
    const size = isTown ? 22 : isCastle ? 19 : 16;
    const label = site.name;
    ctx.font = 'bold ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    const tw = ctx.measureText(label).width;
    const bx = sx + TILE / 2 - tw / 2 - 8;
    const by = sy + TILE - 4;
    ctx.fillStyle = 'rgba(10,8,6,0.72)';
    ctx.fillRect(bx, by, tw + 16, size + 10);
    ctx.fillStyle = site.playerOwned ? '#d9a441' : 'rgba(0,0,0,0)';
    if (site.playerOwned) ctx.fillRect(bx, by, tw + 16, 2);
    text(ctx, label, sx + TILE / 2, by + 5, {
      size, align: 'center',
      color: site.playerOwned ? '#f0c060' : isTown ? '#f2e7cd' : isCastle ? '#ded2b6' : '#b9ad92',
      shadow: true,
    });
  });
  ctx.restore();
}

function drawUnits(ctx, app, cam, box, w) {
  const st = app.state;
  const assets = app.assets;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();

  // 匪团：颜色分等级，人能看出该不该惹
  st.parties.forEach(function (p) {
    const sx = p.x * TILE - cam.x + TILE / 2;
    const sy = box.top + p.y * TILE - cam.y + TILE / 2;
    if (sx < -40 || sx > w + 40 || sy < box.top - 40 || sy > box.top + box.h + 40) return;
    const icon = assets.banditIconFor(p.color || '#7d2f28');
    const sz = p.banditTier === 'hong' ? 34 : p.banditTier === 'cheng' ? 31 : 28;
    ctx.drawImage(icon, sx - sz / 2, sy - sz / 2, sz, sz);

    // 兵力小字：先看人数再决定上不上
    const n = army.troopCount(p.troops || {});
    if (n > 0) {
      text(ctx, String(n), sx + 14, sy + 8, { size: 13, color: p.color === '#4f8f6a' ? '#8fd0a8' : '#f0c9b0', shadow: true });
    }
    if (p.chasing) {
      text(ctx, '!', sx, sy - 34, { size: 20, align: 'center', color: '#e05a42', shadow: true });
    }
    if (p.scuffle > 0) {
      ctx.fillStyle = 'rgba(220,80,50,0.85)';
      ctx.fillRect(sx - 22, sy - 40, 44, 16);
      text(ctx, '交战', sx, sy - 39, { size: 12, align: 'center', color: '#fff' });
    }
    if (p.scripted) {
      ctx.fillStyle = 'rgba(200,60,40,0.9)';
      ctx.fillRect(sx - 22, sy - 56, 44, 16);
      text(ctx, '追兵', sx, sy - 55, { size: 13, align: 'center', color: '#fff' });
    }
  });

  // 领主
  st.lords.forEach(function (lord) {
    if (!lord.alive) return;
    const sx = lord.x * TILE - cam.x + TILE / 2;
    const sy = box.top + lord.y * TILE - cam.y + TILE / 2;
    if (sx < -50 || sx > w + 50 || sy < box.top - 50 || sy > box.top + box.h + 50) return;
    const hostile = stateLib.isHostileFaction(st, lord.faction);
    const col = FACTIONS[lord.faction] ? FACTIONS[lord.faction].color : '#999';

    if (hostile) {
      ctx.fillStyle = 'rgba(180,60,45,0.85)';
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    // 领主棋子：按势力上色；吕布自带双翎方天戟
    const icon = assets.lordIconFor(col, lord.id === 'lvbu' ? 'lvbu' : 'normal');
    const isz = lord.id === 'lvbu' ? 50 : 40;
    ctx.drawImage(icon, sx - isz / 2, sy - isz * 0.62, isz, isz);

    ctx.fillStyle = col;
    ctx.fillRect(sx + 14, sy - 22, 10, 12);
    text(ctx, FACTIONS[lord.faction] ? FACTIONS[lord.faction].banner : '?', sx + 19, sy - 21, {
      size: 11, align: 'center', color: '#fff',
    });

    ctx.font = 'bold 15px "PingFang SC","Microsoft YaHei",sans-serif';
    const tw = ctx.measureText(lord.name).width;
    ctx.fillStyle = 'rgba(10,8,6,0.75)';
    ctx.fillRect(sx - tw / 2 - 6, sy + 18, tw + 12, 20);
    text(ctx, lord.name, sx, sy + 19, { size: 15, align: 'center', color: hostile ? '#e58a7a' : '#e6dbc2' });

    if (lord.chasing) {
      text(ctx, '!', sx, sy - 44, { size: 22, align: 'center', color: '#e05a42' });
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
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  const sx0 = p.x * TILE + TILE / 2 - cam.x;
  const sy0 = box.top + p.y * TILE + TILE / 2 - cam.y;
  ctx.moveTo(sx0, sy0);
  p.route.forEach(function (n) {
    ctx.lineTo(n.x * TILE + TILE / 2 - cam.x, box.top + n.y * TILE + TILE / 2 - cam.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  const last = p.route[p.route.length - 1];
  const ex = last.x * TILE + TILE / 2 - cam.x;
  const ey = box.top + last.y * TILE + TILE / 2 - cam.y;
  ctx.strokeStyle = 'rgba(240,192,96,0.9)';
  ctx.beginPath();
  ctx.arc(ex, ey, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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
  const p = app.state.player;
  const pos = playerPixel(app);
  const walk = p.stepTo ? Math.abs(Math.sin(p.stepProgress * Math.PI)) : 0;
  const sx = pos.gx * TILE + TILE / 2 - cam.x;
  const sy = box.top + pos.gy * TILE + TILE / 2 - cam.y - walk * 5;
  pixel.drawPlayer(ctx, app.assets, sx, sy, TILE, app.mapPhase || 0, p.facing || 1);

  // 头顶旗标
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.moveTo(sx - 12, sy - 52);
  ctx.lineTo(sx + 12, sy - 52);
  ctx.lineTo(sx, sy - 40);
  ctx.closePath();
  ctx.fill();
  text(ctx, p.banner ? '旗' : '我', sx, sy - 50, { size: 13, align: 'center', color: '#2a1c08' });
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
  text(ctx, '第 ' + st.clock.day + ' 天 ' + pad(hour) + ' 时', 16, 12, { size: 20, color: '#c9bda2' });

  const fac = p.faction ? FACTIONS[p.faction].full : '无主';
  text(ctx, p.flagName === '无旗' ? p.name : p.flagName, 16, 40, { size: 24, color: '#f0c060' });
  text(ctx, '· ' + stateLib.renownTitle(p.renown) + ' · ' + fac, 180, 44, { size: 18, color: '#a2947a' });

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
  const items = [
    { k: '金', v: p.gold, c: '#f0c060' },
    { k: '粮', v: p.food, c: '#c8b478' },
    { k: '兵', v: army.troopCount(p.troops) + '/' + stateLib.capacity(st), c: '#8fb0d8' },
    { k: '望', v: p.renown, c: '#c98f6a' },
    { k: '简', v: p.shi, c: '#b98fd8' },
  ];
  const cw = (w - 32) / items.length;
  items.forEach(function (it, i) {
    const x = 16 + i * cw;
    text(ctx, it.k, x, 78, { size: 17, color: '#8a8070' });
    text(ctx, String(it.v), x + 26, 74, { size: 22, color: it.c });
  });

  // 战役目标不放在顶栏了，改成地图上的任务卡（见 drawQuestCard）
}

function drawBottom(ctx, app, w, box) {
  const y0 = box.top + box.h;
  ctx.fillStyle = '#171310';
  ctx.fillRect(0, y0, w, BOT_H);
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(0, y0, w, 3);

  const btns = [
    { id: 'army', label: '队伍', tap: function () { app.push('army'); } },
    { id: 'atlas', label: '天下', tap: function () { app.push('atlas'); } },
    { id: 'journal', label: '史册', tap: function () { app.push('journal'); } },
    { id: 'help', label: '玩法', tap: function () { app.push('help'); } },
    { id: 'camp', label: '扎营', tap: function () {
      const r = stateLib.camp(app.state);
      app.showToast(r.msg);
    } },
    { id: 'menu', label: '菜单', tap: function () { app.push('menu'); } },
  ];
  const gap = 10;
  const bw = (w - 20 - gap * 5) / 6;
  btns.forEach(function (b, i) {
    app.ui.button(ctx, 10 + i * (bw + gap), y0 + 14, bw, 76, b.label, {
      id: b.id, size: 22, onTap: b.tap,
    });
  });

  const st = app.state;
  const p = st.player;
  const hint = p.route && p.route.length
    ? '行军第 ' + (st.player.route.length - (st.player.route.length - 1)) + ' 段 · 点地图可改道'
    : (st.player.atSiteId ? '在' + (siteById(st.world, st.player.atSiteId) || {}).name + ' · 点地图出发' : '点地图行军 · 拖动平移 · 长按无');
  text(ctx, hint, w / 2, y0 + 104, { size: 17, align: 'center', color: '#8a8070' });
}

module.exports = MapScene;

  };

  /* js/scenes/atlas.js */
  __defs[20] = function (module, exports, __require) {
/**
 * 天下大势：可缩放的势力总图
 * 缩小（zoom=1）整图适配，标出所有城池名；
 * 放大（zoom>1）铺上各势力领土色、描州界，只留都城与重镇名。
 */

const { REGIONS, FACTIONS } = __require(5);
const { text } = __require(6);

const MAP_TOP = 112;
const MAP_LEFT = 10;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3.2;

/** 各势力都城：放大时只标这些 */
const CAPITALS = {
  wei: 'xuchang',
  shu: 'chengdu',
  wu: 'jianye',
  yuan: 'ye',
  lv: 'xiapi',
  biao: 'xiangyang',
  zhang: 'chengdu',
  xianbei: 'longcheng',
  ma: 'wuwei',
  han: 'changan',
  bandit: '',
};
const CAPITAL_IDS = ['xuchang', 'chengdu', 'jianye', 'ye', 'xiapi', 'xiangyang', 'longcheng', 'wuwei', 'changan', 'luoyang'];

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
 * 结果缓存在 world.factionGrid。
 */
const SITE_WEIGHT = { town: 3.2, castle: 2.4, village: 1.2, camp: 0.9 };

function buildFactionGrid(world) {
  if (world.factionGrid) return world.factionGrid;
  const W = world.w;
  const H = world.h;
  const grid = new Array(W * H).fill('');
  const sites = world.sites.filter(function (s) { return s.ownerFaction; });
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
          best = s.ownerFaction;
        }
      }
      grid[y * W + x] = best;
    }
  }
  world.factionGrid = grid;
  return grid;
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

    const zoom = app.atlasZoom || 1;
    const baseCell = Math.min((w - MAP_LEFT * 2) / world.w, (h - MAP_TOP - 150) / world.h);
    const cell = baseCell * zoom;
    const viewH = h - MAP_TOP - 150;
    const viewW = w;

    // 视野中心（格坐标）；未拖过就对准玩家
    if (!app.atlasCenter) {
      app.atlasCenter = { x: world.w / 2, y: world.h / 2 };
    }
    const c = app.atlasCenter;
    const halfW = viewW / cell / 2;
    const halfH = Math.min(viewH, cell * world.h) / cell / 2;
    c.x = Math.max(halfW, Math.min(world.w - halfW, c.x));
    c.y = Math.max(halfH, Math.min(world.h - halfH, c.y));

    const ox = w / 2 - c.x * cell;
    const oy = MAP_TOP + 6 + Math.min(viewH, cell * world.h) / 2 - c.y * cell;

    const grid = buildFactionGrid(world);
    const showTerritory = zoom > 1.35;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, MAP_TOP, w, Math.min(viewH, cell * world.h) + 12);
    ctx.clip();

    // 底图层
    const x0 = Math.max(0, Math.floor(-ox / cell) - 1);
    const x1 = Math.min(world.w - 1, Math.ceil((w - ox) / cell) + 1);
    const y0 = Math.max(0, Math.floor((MAP_TOP - oy) / cell) - 1);
    const y1 = Math.min(world.h - 1, Math.ceil((MAP_TOP + viewH - oy) / cell) + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * world.w + x;
        const t = world.tiles[i];
        const reg = world.regions[i] || 'zhongyuan';
        let col = cellColor(t, reg);
        if (showTerritory && t !== 'sea' && t !== 'river') {
          const f = FACTIONS[grid[i]];
          if (f) col = mix(col, f.color, 0.55);
        }
        ctx.fillStyle = col;
        ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.7, cell + 0.7);
      }
    }

    // 州界：格子左侧/上侧与邻居归属不同就描一条线
    if (showTerritory) {
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
      ctx.fillStyle = '#0d0a07';
      ctx.fillRect(sx - sz / 2 - 1, sy - sz / 2 - 1, sz + 2, sz + 2);
      ctx.fillStyle = s.playerOwned ? '#f0c060' : col;
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
      if (big) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, 1);
      }

      // 名字显示规则：放大时只留都城重镇，缩小时全部写上（有避让）
      const isCap = CAPITAL_IDS.indexOf(s.id) >= 0;
      if (showTerritory && !isCap) return;
      if (!showTerritory && !big && zoom > 1.2) return;

      const fs = showTerritory ? 13 : 11;
      ctx.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(s.name).width;
      const bx = sx - tw / 2 - 3;
      const by = sy + sz / 2 + 1;
      if (!labelFits(placed, bx, by, tw + 6, fs + 5)) return;
      placed.push({ x: bx, y: by, w: tw + 6, h: fs + 5 });
      ctx.fillStyle = 'rgba(8,6,4,0.78)';
      ctx.fillRect(bx, by, tw + 6, fs + 4);
      text(ctx, s.name, sx, by + 2, {
        size: fs, align: 'center', color: s.playerOwned ? '#f0c060' : '#ece1c8',
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

    // 缩放按钮
    const bx0 = w - 84;
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

    // 图例
    const legendY = MAP_TOP + Math.min(viewH, cell * world.h) + 12;
    const ids = Object.keys(FACTIONS);
    const cols = 6;
    const cw = (w - MAP_LEFT * 2) / cols;
    ids.forEach(function (id, i) {
      const lx = MAP_LEFT + (i % cols) * cw;
      const ly = legendY + Math.floor(i / cols) * 26;
      ctx.fillStyle = FACTIONS[id].color;
      ctx.fillRect(lx, ly + 3, 12, 12);
      text(ctx, FACTIONS[id].name || FACTIONS[id].full, lx + 18, ly + 1, { size: 13, color: '#c9bda2' });
    });

    text(ctx, '当前 ×' + zoom.toFixed(1) + (showTerritory ? ' · 放大看州界与都城' : ' · 缩小看全部城名'), MAP_LEFT, legendY + 56, {
      size: 13, color: '#8a8070',
    });
  },

  onTouchStart(app, x, y) {
    app.atlasDrag = { x, y, cx: (app.atlasCenter || {}).x, cy: (app.atlasCenter || {}).y };
  },

  onTouchMove(app, x, y) {
    const d = app.atlasDrag;
    if (!d || !app.atlasCenter) return;
    const zoom = app.atlasZoom || 1;
    const baseCell = Math.min((app.runtime.width - MAP_LEFT * 2) / app.state.world.w, (app.runtime.height - MAP_TOP - 150) / app.state.world.h);
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
};

module.exports = AtlasScene;

  };

  /* js/scenes/town.js */
  __defs[21] = function (module, exports, __require) {
/**
 * 城池 / 村庄 / 匪巢界面
 * 布局：顶部城名 → 自己状态条（金/粮/兵/望/简/士气）→ 大按钮菜单 → 子页
 * 子页：招兵 / 市场（粮草·军械）/ 酒馆 / 领主府
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const pixel = __require(3);
const stateLib = __require(7);
const economy = __require(11);
const trade = __require(12);
const heroes = __require(14);
const army = __require(9);
const { siteById, regionDef } = __require(8);
const { TROOPS } = __require(10);
const { FACTIONS, EQUIPMENT } = __require(5);
const { GOODS, VILLAGE_FOOD } = __require(13);
const flows = __require(19);

const PAD = 16;

function money(v) { return v + ' 金'; }

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
  const lines = wrap(ctx, site.blurb || '', w - PAD * 2 - 8, 17, 'bold');
  text(ctx, lines[0] || '', PAD + 4, 106, { size: 17, color: '#c9bda2' });
}

/** 自己的状态条：这是城池界面最该看到的东西 */
function statusBar(app, y) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const p = app.state.player;
  const count = army.troopCount(p.troops);
  const cap = stateLib.capacity(app.state);
  const need = army.foodPerDay(p.troops);

  ctx.fillStyle = '#1d1711';
  ctx.fillRect(0, y, w, 96);

  const cells = [
    { k: '金', v: p.gold, c: '#f0c060' },
    { k: '粮', v: p.food + ' / 日耗' + need, c: p.food < need * 3 ? '#d06a4a' : '#c8b478' },
    { k: '兵', v: count + ' / ' + cap, c: count >= cap ? '#d06a4a' : '#8fb0d8' },
    { k: '望', v: p.renown, c: '#c98f6a' },
    { k: '简', v: p.shi, c: '#b98fd8' },
    { k: '气', v: p.morale, c: p.morale < 40 ? '#d06a4a' : '#8fbf7a' },
  ];
  const cw = (w - PAD * 2) / cells.length;
  cells.forEach(function (it, i) {
    const x = PAD + i * cw;
    text(ctx, it.k, x, y + 12, { size: 16, color: '#8a8070' });
    text(ctx, String(it.v), x, y + 38, { size: 20, color: it.c });
  });

  // 士气细条
  bar(ctx, PAD, y + 68, w - PAD * 2, 8, p.morale / 100, p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);

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

function renderMenu(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const p = app.state.player;
  let y = 280;

  if (site.type === 'camp') {
    text(ctx, '这里是一处贼巢。攻破它，你的名字会传出去。', PAD, y - 40, { size: 19, color: '#c9bda2' });
    app.ui.button(ctx, PAD, y, w - PAD * 2, 96, '进攻贼巢', {
      id: 'attack', size: 30, fill: '#4a241c', onTap: function () {
        stateLib.startSiege(app.state, site);
        app.push('battle', { mode: 'siege' });
      },
    });
    return;
  }

  const isVillage = site.type === 'village';

  if (isVillage) {
    y = menuButton(app, y, '招兵', '村里的壮丁 · 只有最低一档，比城里便宜', function () {
      app.townView.view = 'recruit';
    }, { id: 'm_recruit', right: '→' });

    y = menuButton(app, y, '村市 · 找村长', '牛、羊、鸡、谷，村里卖得比城里便宜', function () {
      app.townView.view = 'village';
    }, { id: 'm_village', right: '粮 ' + Math.round(40 * (site.priceIndex || 1) * 0.85) + ' 金' });

    y = menuButton(app, y, '屠村', '抢钱抢粮，村子会记很久（关系 -5）', function () {
      const r = stateLib.raidVillage(app.state, site);
      app.showToast(r.msg, 2.6);
      if (r.ok) app.townView.view = 'menu';
    }, { id: 'm_raid', fill: '#3a2018', right: '→' });
  } else {
    y = menuButton(app, y, '招兵', '花钱买人，价钱随城而变', function () {
      app.townView.view = 'recruit';
    }, { id: 'm_recruit', right: '→' });

    y = menuButton(app, y, '市场', '粮草 · 货物 · 军械', function () {
      app.townView.view = 'market';
      app.townView.tab = 'goods';
    }, { id: 'm_market', right: '粮 ' + economy.foodPrice(site) + ' 金/单位' });

    y = menuButton(app, y, '酒馆', '接活 · 打听消息 · 招募英雄', function () {
      app.townView.view = 'tavern';
    }, { id: 'm_tavern', right: '→' });

    y = menuButton(app, y, '领主府', '效忠 · 宣战 · 情报', function () {
      app.townView.view = 'hall';
    }, { id: 'm_hall', right: site.ownerFaction ? FACTIONS[site.ownerFaction].full : '无主' });
  }

  app.ui.button(ctx, PAD, y + 10, w - PAD * 2, 84, '离开', {
    id: 'leave', size: 28, fill: '#241c14', onTap: function () {
      app.state.player.atSiteId = null;
      app.pop();
    },
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
  // 村庄只出最低一档的壮丁
  if (site.type === 'village') {
    list = ['militia'];
    if (!site.recruits.militia || site.recruits.militia <= 0) site.recruits.militia = 3;
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
    text(ctx, price + ' 金/人', PAD + 150, y + 58, { size: 18, color: '#f0c060' });

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

  text(ctx, '驮队 ' + carried + ' / ' + trade.GOODS_CAP + ' 件', PAD, 360, { size: 21, color: '#efe3c6' });
  text(ctx, '买低卖高，异地差价就是利润', w - PAD, 366, {
    size: 15, align: 'right', color: '#8a8070',
  });

  const top = 396;
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
  text(ctx, '基准 ' + gd.base + ' 金 / ' + gd.unit, w - PAD, 364, { size: 16, align: 'right', color: '#8a8070' });
  wrap(ctx, gd.desc, w - PAD * 2, 16).slice(0, 2).forEach(function (ln, i) {
    text(ctx, ln, PAD, 400 + i * 24, { size: 16, color: '#a2947a' });
  });

  text(ctx, '本地买 ' + buy + ' 金', PAD, 460, { size: 22, color: '#f0c060' });
  text(ctx, '本地卖 ' + sell + ' 金', PAD + 220, 460, { size: 22, color: '#8fb0d8' });
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
      text(ctx, '本城 ' + est.here + ' 金 · 往这些城去：', PAD, y, { size: 17, color: '#a2947a' });
      y += 30;
      est.rows.forEach(function (row) {
        if (y > h - 150) return;
        text(ctx, row.site.name, PAD, y, { size: 19, color: '#efe3c6' });
        text(ctx, row.price + ' 金', PAD + 150, y, { size: 19, color: '#f0c060' });
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
  text(ctx, '你的粮草 ' + p.food + ' 单位', w - PAD, 336, { size: 18, align: 'right', color: '#8fbf7a' });

  let y = 380;
  VILLAGE_FOOD.forEach(function (f) {
    const price = Math.round(f.price * (site.priceIndex || 1) * 0.85);
    panel(ctx, PAD, y, w - PAD * 2, 96, { fill: '#241c14' });
    text(ctx, f.name, PAD + 18, y + 10, { size: 24, color: '#efe3c6' });
    text(ctx, '+' + f.food + ' 口粮', PAD + 150, y + 16, { size: 18, color: '#a2947a' });
    const dl = wrap(ctx, f.desc, w - PAD * 2 - 200, 15)[0] || '';
    text(ctx, dl, PAD + 18, y + 50, { size: 15, color: '#8a8070' });
    text(ctx, price + ' 金', w - PAD - 142, y + 44, { size: 22, align: 'right', color: '#f0c060' });
    app.ui.button(ctx, w - PAD - 130, y + 22, 112, 54, '买', {
      id: 'vf_' + f.id, size: 22, disabled: p.gold < price, onTap: function () {
        const r = stateLib.buyVillageFood(st, site, f.id);
        app.showToast(r.msg, 2.2);
      },
    });
    y += 108;
  });

  backButton(app, h - 84);
}

function renderMarket(app, site, tab) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;

  const tabs = [
    { id: 'goods', label: '货物' },
    { id: 'food', label: '粮草' },
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
    text(ctx, '粮价 ' + price + ' 金 · 卖出 ' + sell + ' 金', PAD, 372, { size: 24, color: '#efe3c6' });
    text(ctx, '你的粮草：' + st.player.food + ' 单位', PAD, 410, { size: 20, color: st.player.food < 40 ? '#d06a4a' : '#8fbf7a' });
    text(ctx, '每天吃掉 ' + army.foodPerDay(st.player.troops) + ' 单位', PAD, 442, { size: 17, color: '#a2947a' });

    const amounts = [10, 50];
    amounts.forEach(function (n, i) {
      app.ui.button(ctx, PAD, 486 + i * 92, 220, 72, '买 ' + n + ' 粮', {
        id: 'buy' + n, size: 24, onTap: function () {
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
    text(ctx, '满载上限 400 单位。长途行军前多带一点。', PAD, 690, { size: 16, color: '#8a8070' });
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
    panel(ctx, PAD, y, w - PAD * 2, 104, { fill: '#241c14' });
    text(ctx, eq.name, PAD + 18, y + 12, { size: 20, color: '#a2947a' });
    text(ctx, cur.name, PAD + 96, y + 10, { size: 26, color: '#efe3c6' });
    text(ctx, next ? '下一档：' + next.name + ' · ' + next.price + ' 金' : '已是顶配', PAD + 18, y + 58, {
      size: 17, color: next ? '#f0c060' : '#8a8070',
    });
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
      const lines = wrap(ctx, q.text, w - PAD * 2 - 36, 16, 'bold');
      text(ctx, lines[0] || '', PAD + 18, y + 48, { size: 16, color: '#a2947a' });
      text(ctx, '赏 ' + q.reward.gold + ' 金 · ' + q.reward.renown + ' 望', PAD + 18, y + 84, {
        size: 17, color: '#f0c060',
      });
      if (q.type === 'grain') {
        app.ui.button(ctx, w - PAD - 150, y + 34, 132, 56, '交粮', {
          id: 'dg_' + q.id, size: 20, onTap: function () {
            const r = stateLib.deliverGrain(st, q);
            app.showToast(r.msg, 2.2);
          },
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
    y += 40;
    offers.slice(0, 2).forEach(function (h) {
      panel(ctx, PAD, y, w - PAD * 2, 150, { fill: '#201a14' });
      text(ctx, h.name, PAD + 18, y + 12, { size: 26, color: '#efe3c6' });
      text(ctx, '1-10 级 · 随队不死 · 打仗涨级', PAD + 150, y + 20, { size: 15, color: '#8a8070' });
      wrap(ctx, h.bio, w - PAD * 2 - 200, 15).slice(0, 2).forEach(function (ln, i) {
        text(ctx, ln, PAD + 18, y + 56 + i * 22, { size: 15, color: '#a2947a' });
      });
      text(ctx, h.cost + ' 金', w - PAD - 150, y + 62, { size: 22, color: '#f0c060' });
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
  backButton(app, y + 90);
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

  text(ctx, fac.full + ' · ' + fac.name, PAD, 342, { size: 30, color: fac.color });
  text(ctx, fac.desc, PAD, 386, { size: 17, color: '#a2947a' });
  text(ctx, '关系 ' + rel, PAD, 424, { size: 20, color: rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#c9bda2' });
  bar(ctx, PAD, 456, w - PAD * 2, 10, (rel + 100) / 200, rel < -25 ? UI_COLORS.danger : rel > 25 ? UI_COLORS.good : UI_COLORS.accent);

  let y = 490;

  if (!p.faction && !hostile) {
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88, p.renown < 60 ? '效忠（需声望 60）' : '效忠' + fac.full, {
      id: 'join', size: 26, disabled: p.renown < 60, onTap: function () {
        const r = stateLib.joinFaction(st, site);
        app.showToast(r.msg, 2.4);
      },
    });
    y += 100;
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
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88, '攻城', {
      id: 'siege', size: 26, fill: '#4a241c', onTap: function () {
        stateLib.startSiege(st, site);
        app.push('battle', { mode: 'siege' });
      },
    });
    y += 100;
  }

  // 情报：该势力的领主
  const lords = st.lords.filter(function (l) { return l.faction === f && l.alive; });
  text(ctx, '麾下领主', PAD, y + 6, { size: 20, color: '#a2947a' });
  y += 40;
  lords.slice(0, 3).forEach(function (l) {
    const n = army.troopCount(l.troops);
    text(ctx, '· ' + l.name + '（' + l.title + '）', PAD + 4, y, { size: 18, color: '#e6d7b6' });
    text(ctx, n + ' 兵', w - PAD, y, { size: 18, align: 'right', color: n > 150 ? '#d06a4a' : '#a2947a' });
    y += 34;
  });
  if (!lords.length) text(ctx, '（暂时没有成军的领主）', PAD + 4, y, { size: 17, color: '#8a8070' });

  backButton(app, y + 34);
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
  text(ctx, economy.foodPrice(site) + ' 金', PAD + 180, y + 54, { size: 30, color: '#d8c8a6' });

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

/* ---------------------------------------------------------------- 场景 */

const TownScene = {
  enter(app, params) {
    app.townView = {
      siteId: params.siteId,
      view: params.view || 'menu',
      tab: 'goods',
      goodId: null,
      estimate: null,
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

    header(app, site);
    const y = statusBar(app, 148);

    const v = app.townView.view;
    if (v === 'recruit') renderRecruit(app, site);
    else if (v === 'market') renderMarket(app, site, app.townView.tab || 'goods');
    else if (v === 'village') renderVillage(app, site);
    else if (v === 'tavern') renderTavern(app, site);
    else if (v === 'hall') renderHall(app, site);
    else {
      renderMenu(app, site);
      siteInfo(app, site);
    }
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = TownScene;

  };

  /* js/scenes/battle.js */
  __defs[22] = function (module, exports, __require) {
/**
 * 战斗场景：战前选战术 → 回合自动推进 → 结算
 * 战中可落一笔史简（南风起 / 风止 / 名册）
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { TROOPS } = __require(10);
const { TACTICS, TACTIC_LIST } = __require(15);
const { HISTORY_MARKS, CAMPAIGN, FACTIONS } = __require(5);

/** 打完/撤出后一路退回地图，不在城门口再被弹一次 */
function backToMap(app) {
  let guard = 0;
  while (app.stack.length > 1 && guard++ < 4) {
    const t = app.top();
    if (!t) break;
    if (t.name === 'map') break;
    if (t.name === 'town' || t.name === 'lord' || t.name === 'battle' || t.name === 'chapter') {
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
      app.pop();
      return;
    }
    if (bv.phase === 'fight') {
      bv.timer += dt;
      if (bv.timer >= 0.6) {
        bv.timer = 0;
        if (!b.finished) b.step();
      }
      if (b.finished) {
        bv.summary = stateLib.resolveBattle(app.state, b);
        bv.phase = 'result';
      }
    }
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const bv = app.battleView;
    const b = app.state.battle;
    if (!b) return;

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    // 标题
    const fire = b.fireGround;
    ctx.fillStyle = fire ? '#2e1810' : '#1c1712';
    ctx.fillRect(0, 0, w, 160);
    ctx.fillStyle = fire ? '#d0662a' : '#3a2c1e';
    ctx.fillRect(0, 158, w, 4);
    text(ctx, boxTitle(app), w / 2, 34, { size: 40, align: 'center', color: fire ? '#ffb066' : '#f0c060' });
    const sub = subTitle(app);
    if (sub) text(ctx, sub, w / 2, 92, { size: 18, align: 'center', color: '#a2947a' });
    if (fire) text(ctx, '火攻', w - 20, 20, { size: 18, align: 'right', color: '#ff8f4a' });
    if (b.shiName) text(ctx, '史简 · ' + b.shiName, 20, 20, { size: 18, color: '#c9a0e0' });

    const a = b.a;
    const bb = b.b;
    // 双方卡片
    drawSide(ctx, w, 190, a, '我方', '#6f9fd8', true);
    drawSide(ctx, w, 300, bb, '敌方', '#d07060', false);

    // 对峙画面
    drawTroopRow(ctx, w, 430, a.troops, a.initialTroops, '#5a8fd0', 1);
    drawTroopRow(ctx, w, 520, bb.troops, bb.initialTroops, '#c05a4a', -1);
    text(ctx, 'VS', w / 2, 470, { size: 30, align: 'center', color: '#6a6050' });

    // 战报
    const logY = 590;
    text(ctx, '战报', 16, logY, { size: 20, color: '#a2947a' });
    const recent = b.log.slice(-4);
    recent.forEach(function (e, i) {
      const y = logY + 34 + i * 34;
      text(ctx, '第' + e.round + '轮', 16, y, { size: 16, color: '#8a8070' });
      text(ctx, '我 ' + e.aLossText, 90, y, { size: 18, color: '#9fb8d8' });
      text(ctx, '敌 ' + e.bLossText, 380, y, { size: 18, color: '#d8a09f' });
    });

    // 底部
    const bottom = h - 268;
    if (bv.phase === 'prep') {
      text(ctx, '选一个打法', 16, bottom - 40, { size: 20, color: '#a2947a' });
      TACTIC_LIST.forEach(function (id, i) {
        const t = TACTICS[id];
        const bx = 16 + (i % 2) * (w / 2 - 8);
        const by = bottom + Math.floor(i / 2) * 70 - 10;
        const active = bv.tactic === id;
        app.ui.button(ctx, bx, by, w / 2 - 24, 60, t.name, {
          id: 'tac_' + id, size: 24,
          fill: active ? '#4a3620' : '#241c14',
          border: active ? UI_COLORS.accent : UI_COLORS.border,
          onTap: function () { bv.tactic = id; },
        });
      });
      const ty = bottom + 128;
      text(ctx, TACTICS[bv.tactic].desc, 16, ty, { size: 16, color: '#a2947a' });

      // 战前也能走：撤出不会算撤退伤亡，但要退出城下
      app.ui.button(ctx, 16, h - 100, 200, 78, '撤出', {
        id: 'leave', size: 26, fill: '#241c14', onTap: function () {
          stateLib.afterRetreat(app.state, b.context);
          app.state.battle = null;
          backToMap(app);
        },
      });
      app.ui.button(ctx, 232, h - 100, w - 248, 78, '开战', {
        id: 'go', size: 30, fill: '#4a2a1a', onTap: function () {
          b.setTactic(bv.tactic);
          bv.phase = 'fight';
          bv.timer = 0;
        },
      });
    } else if (bv.phase === 'fight') {
      app.ui.button(ctx, 16, h - 190, 220, 74, '史简 ×' + app.state.player.shi, {
        id: 'shi', size: 24, fill: '#3a2438', disabled: app.state.player.shi <= 0 || !!b.shiMark, onTap: function () {
          bv.shiOpen = true;
        },
      });
      app.ui.button(ctx, 252, h - 190, 220, 74, '撤退', {
        id: 'retreat', size: 24, fill: '#241c14', onTap: function () {
          b.retreat();
          bv.summary = stateLib.resolveBattle(app.state, b);
          bv.phase = 'result';
        },
      });
      text(ctx, '回合自动推进 · 每 0.6 秒一轮', 16, h - 100, { size: 16, color: '#8a8070' });
      if (b.shiMark) text(ctx, '本战已落笔：' + b.shiName, 16, h - 74, { size: 16, color: '#c9a0e0' });
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

function renderResult(app, sum, w, h) {
  const ctx = app.runtime.ctx;
  const y0 = h - 220;
  if (!sum) return;

  const win = sum.result === 'win';
  const retreat = sum.result === 'retreat';
  const color = win ? '#8fbf7a' : retreat ? '#c9bda2' : '#d07060';
  const label = win ? '胜' : retreat ? '撤退' : '败';

  text(ctx, label, 16, y0, { size: 46, color });
  text(ctx, '第 ' + sum.round + ' 轮结束', 120, y0 + 12, { size: 18, color: '#a2947a' });
  text(ctx, '我方 ' + sum.remainA + ' / ' + sum.initialA, 16, y0 + 58, { size: 20, color: '#9fb8d8' });
  text(ctx, '敌方 ' + sum.remainB + ' / ' + sum.initialB, 16, y0 + 88, { size: 20, color: '#d8a09f' });
  if (win) text(ctx, '缴获 ' + sum.loot + ' 金', 16, y0 + 122, { size: 22, color: '#f0c060' });
  if (sum.shiMark) text(ctx, '史简「' + sum.shiName + '」已生效', 16, y0 + 152, { size: 17, color: '#c9a0e0' });

  app.ui.button(ctx, 16, h - 96, w - 32, 76, '继续', {
    id: 'cont', size: 28, fill: '#33271b', onTap: function () {
      if (app.state.gameOver) {
        app.replace('ending');
      } else {
        backToMap(app);
      }
    },
  });
}

function renderShi(app, w, h, b) {
  const ctx = app.runtime.ctx;
  ctx.fillStyle = 'rgba(8,6,4,0.94)';
  ctx.fillRect(0, 0, w, h);
  text(ctx, '落一笔史简', w / 2, 150, { size: 34, align: 'center', color: '#d9a441' });
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

  /* js/scenes/army.js */
  __defs[23] = function (module, exports, __require) {
/**
 * 队伍页：兵力构成、士气、装备、史简
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const armyLib = __require(9);
const heroesLib = __require(14);
const { HERO_MAX_LEVEL } = __require(13);
const { TROOPS } = __require(10);
const { EQUIPMENT } = __require(5);

const ArmyScene = {
  enter(app) {
    app.armyScroll = 0;
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

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '队伍', 20, 24, { size: 36, color: '#f0c060' });
    text(ctx, stateLib.renownTitle(p.renown), w - 20, 36, { size: 18, align: 'right', color: '#a2947a' });

    // 总兵力
    ctx.fillStyle = '#241c14';
    ctx.fillRect(16, 84, w - 32, 116);
    text(ctx, count + ' / ' + cap, 36, 100, { size: 40, color: '#efe3c6' });
    text(ctx, '人', 200, 118, { size: 18, color: '#8a8070' });
    text(ctx, '日耗粮 ' + armyLib.foodPerDay(p.troops) + ' · 存粮 ' + p.food, 36, 156, {
      size: 17, color: p.food < armyLib.foodPerDay(p.troops) * 3 ? '#d06a4a' : '#a2947a',
    });
    bar(ctx, 16, 196, w - 32, 10, p.morale / 100, p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);
    text(ctx, '士气 ' + p.morale, 20, 212, { size: 16, color: '#8a8070' });

    // 兵种
    let y = 252;
    text(ctx, '编制', 20, y - 28, { size: 20, color: '#a2947a' });
    const ids = Object.keys(p.troops).filter(function (id) { return p.troops[id] > 0; });
    if (!ids.length) {
      text(ctx, '（空）', 20, y, { size: 18, color: '#8a8070' });
    }
    ids.sort(function (a, b) {
      return (TROOPS[b] ? TROOPS[b].tier : 0) - (TROOPS[a] ? TROOPS[a].tier : 0);
    }).forEach(function (id) {
      const t = TROOPS[id] || { name: id, tier: 1 };
      ctx.fillStyle = 'rgba(36,28,20,0.6)';
      ctx.fillRect(16, y, w - 32, 62);
      text(ctx, t.name, 32, y + 10, { size: 22, color: '#efe3c6' });
      text(ctx, '× ' + p.troops[id], w - 32, y + 12, { size: 22, align: 'right', color: '#f0c060' });
      text(ctx, '攻 ' + (t.atk || 0) + ' 防 ' + (t.def || 0) + ' 粮 ' + (t.food || 1) + ' 级 ' + (t.tier || 1), 32, y + 40, {
        size: 15, color: '#8a8070',
      });
      y += 70;
    });

    // 随行英雄
    if ((p.heroes || []).length) {
      y += 6;
      text(ctx, '随行英雄', 20, y, { size: 20, color: '#a2947a' });
      text(ctx, '满级 ' + HERO_MAX_LEVEL, w - 20, y + 4, { size: 15, align: 'right', color: '#8a8070' });
      y += 30;
      p.heroes.forEach(function (h) {
        const def = heroesLib.heroById(h.id) || { name: h.id };
        ctx.fillStyle = 'rgba(36,28,20,0.55)';
        ctx.fillRect(16, y, w - 32, 54);
        text(ctx, def.name, 32, y + 8, { size: 21, color: '#efe3c6' });
        text(ctx, 'Lv ' + h.level, w - 130, y + 10, { size: 19, align: 'right', color: '#f0c060' });
        bar(ctx, w - 120, y + 16, 92, 8, h.level >= HERO_MAX_LEVEL ? 1 : h.exp / (h.level * heroesLib.EXP_PER_LEVEL), '#7fae6a');
        text(ctx, '+攻 ' + Math.round((h.level || 1) * 1.1) + '% · +防 ' + Math.round((h.level || 1) * 0.8) + '%', 32, y + 32, {
          size: 14, color: '#8a8070',
        });
        y += 62;
      });
    }

    // 装备
    y += 8;
    text(ctx, '装备', 20, y, { size: 20, color: '#a2947a' });
    y += 28;
    ['blade', 'armor', 'horse'].forEach(function (slot) {
      const eq = EQUIPMENT[slot];
      const tier = eq.tiers[Math.min(p.equip[slot] || 0, eq.tiers.length - 1)];
      text(ctx, eq.name, 20, y, { size: 17, color: '#8a8070' });
      text(ctx, tier.name, 110, y - 2, { size: 19, color: '#efe3c6' });
      y += 34;
    });

    // 史简
    text(ctx, '史简 × ' + p.shi + '（已用 ' + p.shiUsed + '）', 20, y + 8, { size: 19, color: '#c9a0e0' });
    y += 56;

    // 战绩：把下半屏填满，也让人看清这一路走得怎样
    if (y + 120 < h - 110) {
      text(ctx, '战绩', 20, y, { size: 20, color: '#a2947a' });
      y += 30;
      const stt = st.stats || {};
      const cells = [
        ['胜', stt.battlesWon || 0],
        ['负', stt.battlesLost || 0],
        ['折兵', stt.troopsLost || 0],
        ['得金', stt.goldEarned || 0],
        ['行军', (stt.distance || 0) + ' 格'],
        ['攻城', stt.sitesTaken || 0],
      ];
      const cw = (w - 32) / 3;
      cells.forEach(function (c, i) {
        const cx = 16 + (i % 3) * cw;
        const cy = y + Math.floor(i / 3) * 60;
        ctx.fillStyle = 'rgba(36,28,20,0.55)';
        ctx.fillRect(cx + 2, cy, cw - 6, 52);
        text(ctx, c[0], cx + 14, cy + 8, { size: 15, color: '#8a8070' });
        text(ctx, String(c[1]), cx + 14, cy + 26, { size: 24, color: '#efe3c6' });
      });
      y += 126;
    }

    // 记事
    if (y < h - 180) {
      text(ctx, '记事', 20, y, { size: 20, color: '#a2947a' });
      y += 26;
      const logs = (st.log || []).slice(-3).reverse();
      if (!logs.length) text(ctx, '还没有可记的事。', 20, y, { size: 16, color: '#8a8070' });
      logs.forEach(function (l) {
        if (y > h - 150) return;
        const wrapped = wrap(ctx, '第' + l.day + '天 · ' + l.text, w - 48, 15, 'normal');
        wrapped.slice(0, 2).forEach(function (line) {
          text(ctx, line, 20, y, { size: 15, color: '#a2947a' });
          y += 20;
        });
        y += 4;
      });
    }

    app.ui.button(ctx, 20, h - 92, w - 40, 72, '返回', {
      id: 'a_back', size: 26, onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ArmyScene;

  };

  /* js/scenes/journal.js */
  __defs[24] = function (module, exports, __require) {
/**
 * 史册：主线进度 + 日志 + 统计
 */

const { text, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { CAMPAIGN } = __require(5);

const JournalScene = {
  enter(app) {
    app.journalScroll = 0;
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

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '史册', 20, 24, { size: 36, color: '#f0c060' });
    text(ctx, st.player.flagName === '无旗' ? st.player.name : st.player.flagName, w - 20, 36, {
      size: 18, align: 'right', color: '#a2947a',
    });

    // 当前章
    const stage = CAMPAIGN[Math.min(st.campaign.stage, CAMPAIGN.length - 1)];
    ctx.fillStyle = '#241c14';
    ctx.fillRect(16, 82, w - 32, 140);
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(16, 82, 5, 140);
    if (st.campaign.stage >= CAMPAIGN.length) {
      text(ctx, '主线已走完', 34, 96, { size: 24, color: '#8fbf7a' });
      text(ctx, '剩下的，是你在图上留下多少座城。', 34, 136, { size: 16, color: '#a2947a' });
    } else if (stage) {
      text(ctx, stage.title, 34, 94, { size: 24, color: '#f0c060' });
      text(ctx, '目标 · ' + stage.goal, 34, 132, { size: 16, color: '#c9bda2' });
      text(ctx, '进度 ' + st.campaign.stage + ' / ' + CAMPAIGN.length, w - 30, 96, {
        size: 16, align: 'right', color: '#8a8070',
      });
    }

    // 统计
    const sy = 246;
    const stats = [
      ['天数', st.clock.day],
      ['胜仗', st.stats.battlesWon],
      ['败仗', st.stats.battlesLost],
      ['城', st.stats.sitesTaken],
      ['里程', st.stats.distance],
      ['史简', st.player.shiUsed],
    ];
    const cw = (w - 32) / stats.length;
    stats.forEach(function (s, i) {
      const x = 16 + i * cw;
      text(ctx, s[0], x, sy, { size: 15, color: '#8a8070' });
      text(ctx, String(s[1]), x, sy + 24, { size: 24, color: '#efe3c6' });
    });

    // 日志
    text(ctx, '记事', 20, sy + 74, { size: 20, color: '#a2947a' });
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(20, sy + 104, w - 40, 2);

    let y = sy + 120;
    const list = st.log.slice().reverse().slice(0, 16);
    list.forEach(function (entry) {
      if (y > h - 150) return;
      const line = '第' + entry.day + '天 · ' + entry.text;
      wrap(ctx, line, w - 44, 16, 'bold').slice(0, 2).forEach(function (l, i) {
        text(ctx, l, 20, y + i * 24, { size: 16, color: i === 0 ? '#c9bda2' : '#8a8070' });
      });
      y += 46;
    });

    app.ui.button(ctx, 20, h - 92, w - 40, 72, '返回', {
      id: 'j_back', size: 26, onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = JournalScene;

  };

  /* js/scenes/help.js */
  __defs[25] = function (module, exports, __require) {
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
  troops_60: '招兵凑到 60 人，粮草备到日耗的 3 倍。',
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
    ops.push({ t: 'p', s: '你从洛阳溃兵开始：30 个民兵、80 金、45 粮，还有一支史简。' });
    ops.push({ t: 'p', s: '点地图行军，一格一格走。地形决定耗时：道路 1.3 小时一格，农田 1.9，林地 2.9，沼泽 4.3，渡河 4.6，山地走不了。' });
    ops.push({ t: 'p', s: '每过一天，全队按人头吃粮。断粮会跑兵、掉士气。长途前先在村子里把粮备足。' });
    ops.push({ t: 'h1', s: '城池与村庄' });
    ops.push({ t: 'p', s: '城里四件事：招兵、市场（货物 / 粮草 / 军械）、酒馆（接活、招英雄）、领主府（效忠、宣战、看情报）。' });
    ops.push({ t: 'p', s: '村里三件事：找壮丁（只有民兵，比城里便宜）、找村长买牛羊肉粮、屠村（抢钱抢粮，关系 -5，村子会记很久）。' });
    ops.push({ t: 'h1', s: '战斗' });
    ops.push({ t: 'p', s: '战前选战术：冲锋 / 结阵 / 包抄 / 弓弩先射。回合自动推进，双方同时结算，低阶兵先倒。' });
    ops.push({ t: 'p', s: '减员到三成半以下就溃。打不过可以撤——战前能"撤出"（不算败），战中"撤退"额外损失 25%。' });
    ops.push({ t: 'p', s: '撤退后有一段时间对方不会再贴上来，趁机走远。' });
    ops.push({ t: 'h1', s: '史简' });
    ops.push({ t: 'p', s: '战斗中能落一笔：南风起（我方攻击大增）、风止（双方攻击减半，救下很多人）、名册（阵亡者部分回来）。' });
    ops.push({ t: 'p', s: '每落一笔，所有势力对你的好感 -6。用得越多，越没人信你写的东西。' });
    ops.push({ t: 'h1', s: '势力、领主与关系' });
    ops.push({ t: 'p', s: '曹操、刘备、孙权、袁绍、吕布、刘表、刘璋、轲比能、马腾、汉廷，共十家。' });
    ops.push({ t: 'p', s: '你抢他们的村、打他们的城、击败他们的领主，关系就会掉。低于 -25 即开战。' });
    ops.push({ t: 'p', s: '开战后，他们的领主在视野内会一路追着你打。跑得掉就跑，跑不掉就结阵、或者落一笔史简。' });
    ops.push({ t: 'p', s: '在路上碰上领主，会先说话：了解生平、查看兵力、送礼、开战、问他忙什么、或者走开。' });
    ops.push({ t: 'p', s: '送礼：君主 100 金换 5 点关系，领兵者 3 点，普通将领 2 点。想结交真正说得上话的人，得舍得钱。' });
    ops.push({ t: 'p', s: '当场开战一次扣 25 点关系。关系低于 -25，他见到你就会动刀。' });
    ops.push({ t: 'h1', s: '声望' });
    ops.push({ t: 'p', s: '声望到 60 可在城里效忠。声望越高队伍上限越大：20 + 声望×0.35。' });
    ops.push({ t: 'p', s: '你的名字会随声望改：溃兵之首 → 一方游侠 → 小有威名 → 郡国校尉 → 一方诸侯 → 天下名将。' });
    return ops;
  }

  if (tab === 'guide') {
    ops.push({ t: 'h1', s: '前几天怎么活' });
    ops.push({ t: 'p', s: '1. 先往东走，别停。序章那支西凉铁骑比你强得多，硬打会散伙。' });
    ops.push({ t: 'p', s: '2. 到陈留进村/进城，找壮丁。民兵便宜得几乎白给，先堆人数。' });
    ops.push({ t: 'p', s: '3. 粮草按"日耗 × 3"备。地图比过去大了一倍，路程一长就容易断粮。' });
    ops.push({ t: 'h1', s: '怎么赚钱（新手最缺的）' });
    ops.push({ t: 'p', s: '· 打青巾匪团：地图上到处是绿衣小队伍，人数 6-12，打散一队能拿 150-250 金。这是前期最稳的钱。' });
    ops.push({ t: 'p', s: '· 做酒馆的活：清剿、送粮、侦察，一桩 130-250 金，还涨声望和关系。' });
    ops.push({ t: 'p', s: '· 跑商：市场"货物"页买低价的粟米/盐/铁，用"估价"看哪座城收得贵，走一趟赚差价。驮队上限 80 件。' });
    ops.push({ t: 'p', s: '· 屠村：一次 90-200 金 + 40-85 粮，但关系 -5，声望也掉。缺钱时能用，别指望它长久。' });
    ops.push({ t: 'p', s: '· 打下贼巢：+120 金、+45 声望。' });
    ops.push({ t: 'h1', s: '匪团有等级' });
    ops.push({ t: 'p', s: '地图上的匪团按衣服颜色分级：青（最多，好打）、蓝（有弓有骑）、橙（成建制的山贼）、赤（只比领主差一线）。' });
    ops.push({ t: 'p', s: '青六成、蓝三成、橙 8%、赤 2%。主线没过半之前不会出橙和赤——前期地图上是安全的。' });
    ops.push({ t: 'p', s: '匪团也会和领主的部曲撞上，双方都掉人。你只在自己附近看得见这种混战。' });
    ops.push({ t: 'h1', s: '兵怎么买' });
    ops.push({ t: 'p', s: '低阶兵便宜得像消耗品，高阶兵一件就是一笔钱。民兵 10 金上下，禁军要四百多。' });
    ops.push({ t: 'p', s: '村庄的壮丁最便宜，但只有民兵；城里的兵种多，价钱也高。前期靠民兵堆量，中期再换枪盾和弓。' });
    ops.push({ t: 'h1', s: '英雄' });
    ops.push({ t: 'p', s: '酒馆角落里坐着一些不起眼的人：廖化、周仓、马岱、凌统、丁奉、李典、乐进、于禁……' });
    ops.push({ t: 'p', s: '花一笔钱能请进队伍，随队不死，打仗攒经验，1 到 10 级。每级给全队 +1.1% 攻击、+0.8% 防御。' });
    ops.push({ t: 'p', s: '队伍最多带四位英雄，等级靠打胜仗涨，不打就一直是一级。' });
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
      if (id === 'bandit') return;
      const f = FACTIONS[id];
      const rel = st ? stateLib.relationOf(st, id) : 0;
      ops.push({ t: 'faction', f, rel, sworn: st && st.player.faction === id });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'h1', s: '黄巾与山贼' });
    ops.push({ t: 'p', s: '六处贼巢，全部敌对。攻破一处声望 +45、金 +120，且不再刷匪团。' });
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

  ops.push({ t: 'p', s: '走到最后，站在谁后面、用了几支史简，会决定这一页怎么收尾——具体怎么写，留到最后自己看。' });
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
      text(ctx, t.recruit ? t.recruit + ' 金' : '不卖', w - 30, y + 36, {
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
  __defs[26] = function (module, exports, __require) {
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
      if (ch.reward.gold) parts.push(ch.reward.gold + ' 金');
      if (ch.reward.renown) parts.push(ch.reward.renown + ' 声望');
      if (ch.reward.shi) parts.push(ch.reward.shi + ' 支史简');
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

  /* js/scenes/ending.js */
  __defs[27] = function (module, exports, __require) {
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
        '史简 ' + st.player.shiUsed,
      ];
      text(ctx, lines.join('　'), w / 2, y, { size: 16, align: 'center', color: '#8a8070' });
    }

    app.ui.button(ctx, 40, h - 200, w - 80, 82, '再走一遍', {
      id: 'again', size: 28, fill: '#33271b', onTap: function () {
        app.runtime.storage.remove('bw_save_v3');
        app.state = stateLib.createGame({});
        app.replace('map');
      },
    });
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
  __defs[28] = function (module, exports, __require) {
/**
 * 领主对话：碰面先说话，再决定结交、送礼还是拔刀
 * 六件事：了解生平 / 查看兵力 / 送礼 / 开战 / 你在做什么 / 离开
 */

const { text, panel, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { FACTIONS } = __require(5);

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
    app.lordTalk = {
      lordId: params.lordId,
      page: 'menu',
      line: lord ? stateLib.lordGreet(app.state, lord) + '\n' + stateLib.lordIdle(app.state, lord) : '……',
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

    // 立绘：按原始比例放大，吕布用自己的双翎造型
    const variant = lord.id === 'lvbu' ? 'lvbu' : 'normal';
    const sprite = (app.assets.lordIconFor ? app.assets.lordIconFor(col, variant) : null) || app.assets.lord;
    const sw0 = sprite.width || 20;
    const sh0 = sprite.height || 20;
    let spW = Math.min(300, w * 0.72);
    let spH = spW * (sh0 / sw0);
    const maxH = h * 0.28;
    if (spH > maxH) {
      spH = maxH;
      spW = spH * (sw0 / sh0);
    }
    ctx.drawImage(sprite, w / 2 - spW / 2, 56, spW, spH);

    // 名字与身份
    text(ctx, lord.name, w / 2, 40, { size: 42, align: 'center', color: '#f5e9cf', shadow: true });
    text(ctx, (lord.title || '') + ' · ' + (fac ? fac.full : '无主'), w / 2, 94, {
      size: 18, align: 'center', color: '#c9bda2', shadow: true,
    });

    // 话框
    const boxY = Math.max(h * 0.30, 200);
    const boxH = Math.min(260, h - boxY - 250);
    panel(ctx, 20, boxY, w - 40, boxH, { fill: '#201a14' });
    text(ctx, '关系 ' + stateLib.relationOf(st, lord.faction) + ' · ' + stateLib.lordRank(lord),
      w - 36, boxY + 10, { size: 16, align: 'right', color: '#a2947a' });
    const size = 21;
    const lines = wrap(ctx, d.line, w - 96, size, 'bold');
    lines.slice(0, 8).forEach(function (ln, i) {
      text(ctx, ln, 48, boxY + 24 + i * 32, { size, color: '#efe3c6' });
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
      text(ctx, '送礼：君主 100 金换 5 点，领兵者 3 点，将领 2 点。', 24, bottomY, {
        size: 18, color: '#a2947a',
      });
      [100, 300, 500].forEach(function (g, i) {
        const bw = (w - 60) / 3;
        app.ui.button(ctx, 20 + i * (bw + 10), bottomY + 34, bw, 70, g + ' 金', {
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
      app.showToast('他不打算让你走。', 2);
      stateLib.startLordBattle(st, lord);
      app.push('battle', { mode: 'lord' });
      return;
    }
    app.pop();
  }
}

module.exports = LordScene;

  };

  /* js/scenes/revive.js */
  __defs[29] = function (module, exports, __require) {
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

  /* js/scenes/menu.js */
  __defs[30] = function (module, exports, __require) {
/**
 * 系统菜单：存档、读档、回标题（退出）
 */

const { text, panel, wrap } = __require(6);
const stateLib = __require(7);
const audio = __require(16);
const { formatClock } = __require(8);

const AUTO_KEY = 'bw_save_v4';
const MANUAL_KEY = 'bw_manual_v4';

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

const MenuScene = {
  enter(app) {
    app.menuView = { auto: readMeta(app, AUTO_KEY), manual: readMeta(app, MANUAL_KEY) };
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const mv = app.menuView || {};

    ctx.fillStyle = 'rgba(8,6,4,0.94)';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '营帐', w / 2, 44, { size: 40, align: 'center', color: '#f0c060' });
    text(ctx, st ? formatClock(st.clock) : '', w / 2, 96, { size: 20, align: 'center', color: '#a2947a' });

    // 手动存档信息
    const infoY = 130;
    panel(ctx, 20, infoY, w - 40, 106, { fill: '#201a14' });
    text(ctx, '手动存档', 44, infoY + 14, { size: 20, color: '#c9bda2' });
    text(ctx, mv.manual
      ? '第 ' + mv.manual.clock.day + ' 天 · ' + (mv.manual.player.flagName === '无旗' ? mv.manual.player.name : mv.manual.player.flagName) + ' · ' + (mv.manual.player.gold || 0) + ' 金'
      : '还没有手动存过档', 44, infoY + 50, { size: 18, color: '#8a8070' });

    const BH = 64;
    const GAP = 70;
    let y = infoY + 118;
    app.ui.button(ctx, 20, y, w - 40, BH, '保存到现在', {
      id: 'menu_save', size: 26, fill: '#3a2c1e', onTap: function () {
        if (!app.state) return;
        app.runtime.storage.set(MANUAL_KEY, stateLib.serialize(app.state));
        app.menuView.manual = readMeta(app, MANUAL_KEY);
        app.showToast('已存档：第 ' + app.state.clock.day + ' 天', 2);
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w - 40, BH, mv.manual ? '读取手动存档' : '读取手动存档（空）', {
      id: 'menu_load', size: 26, fill: '#241c14', disabled: !mv.manual, onTap: function () {
        const raw = app.runtime.storage.get(MANUAL_KEY);
        const loaded = stateLib.deserialize(raw);
        if (!loaded) {
          app.showToast('存档读不出来。', 2);
          return;
        }
        app.state = loaded;
        app.replace('map');
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w / 2 - 30, BH, '读取自动存档', {
      id: 'menu_auto', size: 22, fill: '#241c14', disabled: !mv.auto, onTap: function () {
        const raw = app.runtime.storage.get(AUTO_KEY);
        const loaded = stateLib.deserialize(raw);
        if (!loaded) {
          app.showToast('自动存档读不出来。', 2);
          return;
        }
        app.state = loaded;
        app.replace('map');
      },
    });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH, '回到标题', {
      id: 'menu_title', size: 22, fill: '#43201a', onTap: function () {
        app.replace('title');
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w / 2 - 30, BH, '继续游戏', {
      id: 'menu_close', size: 26, fill: '#33271b', onTap: function () { app.pop(); },
    });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH, audio.isEnabled() ? '音乐：开' : '音乐：关', {
      id: 'menu_audio', size: 24, fill: '#241c14', onTap: function () {
        const on = !audio.isEnabled();
        audio.setEnabled(on);
        if (on) audio.play(app.top() && app.top().name === 'battle' ? 'battle' : 'field');
        app.showToast(on ? '音乐已打开' : '音乐已关闭', 1.6);
      },
    });

    text(ctx, '自动存档每 12 秒一次，只在地图上。回标题等于退出这一局。', w / 2, h - 40, {
      size: 15, align: 'center', color: '#6a6050',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = MenuScene;
module.exports.AUTO_KEY = AUTO_KEY;
module.exports.MANUAL_KEY = MANUAL_KEY;

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
const audio = __require(16);

class App {
  constructor(runtime) {
    this.runtime = runtime;
    this.assets = pixel.buildAssets(runtime);
    this.ui = new UI();
    this.stack = [];
    this.state = null;
    this.scenes = {
      title: __require(17),
      map: __require(18),
      atlas: __require(20),
      town: __require(21),
      battle: __require(22),
      army: __require(23),
      journal: __require(24),
      help: __require(25),
      nested: null,
      chapter: __require(26),
      ending: __require(27),
      lord: __require(28),
      revive: __require(29),
      menu: __require(30),
    };
    delete this.scenes.nested;
    this.saveTimer = 10;
    this.last = runtime.now();
    this.toast = null;
    this.lastHit = null;

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
    if (dt > 0.06) dt = 0.06;

    const r = this.runtime;
    r.ctx.setTransform(r.dpr * r.scale, 0, 0, r.dpr * r.scale, 0, 0);
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
        this.saveTimer = 12;
        this.runtime.storage.set('bw_save_v4', stateLib.serialize(this.state));
      }
    }
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
