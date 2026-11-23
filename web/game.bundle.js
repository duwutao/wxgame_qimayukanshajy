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

const MAP_W = 40;
const MAP_H = 48;

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

/** 领主棋子：小骑马剪影，颜色由势力决定，运行时着色 */
function makeLordSprite(runtime) {
  const size = 18;
  const c = newCanvas(runtime, size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  // 马
  px(g, 4, 11, '#2a2320', 10, 5);
  px(g, 4, 11, '#3f3530', 10, 1);
  px(g, 13, 8, '#2a2320', 3, 4);
  px(g, 5, 15, '#2a2320', 2, 3);
  px(g, 11, 15, '#2a2320', 2, 3);
  // 骑手
  px(g, 7, 5, '#e6e2d6', 5, 6);
  px(g, 8, 2, '#cfc9ba', 3, 3);
  // 旗
  px(g, 15, 0, '#6a5a3a', 1, 10);
  px(g, 15, 0, '#e0e0e0', 3, 3);
  return c;
}

/** 匪团棋子 */
function makeBanditSprite(runtime) {
  const size = 14;
  const c = newCanvas(runtime, size, size);
  const g = c.getContext('2d');
  const body = '#7d2f28';
  const dark = '#54201b';
  px(g, 4, 6, body, 5, 6);
  px(g, 4, 6, dark, 1, 6);
  px(g, 5, 3, '#8a6a44', 3, 3);
  px(g, 4, 2, '#4a2018', 5, 2);
  px(g, 9, 5, '#c9c9d2', 1, 6);
  px(g, 5, 12, dark, 1, 2);
  px(g, 8, 12, dark, 1, 2);
  return c;
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
    lord: makeLordSprite(runtime),
    bandit: makeBanditSprite(runtime),
    flag: { player: makeFlagSprite(runtime, '#d9a441') },
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

/** 海岸线插值 */
function coastX(y) {
  for (let i = 0; i < COAST.length - 1; i++) {
    const a = COAST[i];
    const b = COAST[i + 1];
    if (y >= a[0] && y <= b[0]) {
      const t = (y - a[0]) / (b[0] - a[0] || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return COAST[COAST.length - 1][1];
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
  const boxes = {
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

  // 3. 山脉（折线加粗）
  MOUNTAINS.forEach(function (line) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      bresenham(a[0], a[1], b[0], b[1], function (x, y) {
        if (!inBounds(x, y)) return;
        if (world.tiles[idx(x, y)] === 'sea') return;
        world.tiles[idx(x, y)] = 'mountain';
        if (rng.chance(0.45)) setTile(world, x + 1, y, 'mountain');
        if (rng.chance(0.3)) setTile(world, x, y + 1, 'mountain');
      });
    }
  });

  // 4. 河流
  function drawRiver(points, wide) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      bresenham(a[0], a[1], b[0], b[1], function (x, y) {
        if (!inBounds(x, y)) return;
        if (world.tiles[idx(x, y)] === 'sea') return;
        world.tiles[idx(x, y)] = 'river';
        if (wide && rng.chance(0.35)) setTile(world, x, y + 1, 'river');
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
      id: row[0], name: row[1], type: row[2], faction: row[3], x: row[4], y: row[5],
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
    const clearR = def.type === 'town' || def.type === 'castle' ? 1 : 0;
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
  const open = [startI];
  dist[startI] = 0;

  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
  ];

  while (open.length) {
    let bestK = 0;
    let bestScore = Infinity;
    for (let k = 0; k < open.length; k++) {
      const n = open[k];
      const nx = n % MAP_W;
      const ny = Math.floor(n / MAP_W);
      const h = Math.abs(nx - to.x) + Math.abs(ny - to.y);
      const score = dist[n] + h;
      if (score < bestScore) {
        bestScore = score;
        bestK = k;
      }
    }
    const cur = open.splice(bestK, 1)[0];
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
        open.push(ni);
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
  const typeMul = site.type === 'castle' ? 1.2 : site.type === 'village' ? 0.9 : 1.0;
  return Math.round(t.recruit * typeMul * (site.priceIndex || 1));
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

  /* js/core/battle.js */
  __defs[12] = function (module, exports, __require) {
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
    let base = 0;
    const self = this;
    Object.keys(this.b.initialTroops).forEach(function (id) {
      const t = TROOPS[id];
      if (!t) return;
      base += (t.recruit || 12) * 0.55 * self.b.initialTroops[id];
    });
    return Math.max(70, Math.round(base * (0.7 + this.rng.random() * 0.4)));
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
const { Battle } = __require(12);
const {
  FACTIONS, RENOWN_TIERS, CAMPAIGN, ENDINGS, EQUIPMENT,
} = __require(5);
const { TROOPS } = __require(10);

const HOUR_SECONDS = 0.32; // 1 游戏小时 = 0.32 真实秒
const NPC_STEP_HOURS = 3;
const LORD_RESPAWN_DAYS = 12;
const SAVE_VERSION = 3;

const BANDIT_NAMES = ['黑山游骑', '泰山刀客', '白波流寇', '汝南劫队', '江夏水贼'];

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
  const spawn = findFreeSpotNear(state0(world), 21, 23, 2) || { x: 21, y: 23 };

  const player = {
    name: (opts && opts.name) || '无名溃兵',
    flagName: '无旗',
    gold: 60,
    food: 40,
    morale: 58,
    renown: 0,
    faction: null,
    banner: false,
    troops: { militia: 30 },
    equip: { blade: 0, armor: 0, horse: 0 },
    shi: 1,
    shiUsed: 0,
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
  spawnBanditParties(state, 6);
  spawnChaseParty(state, spawn);

  pushLog(state, '洛阳城破了。你带着三十名溃兵往东走，身后是西凉铁骑。');
  pushLog(state, '别回头。跑到陈留，就还有二十个人跟你。');
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

function spawnBanditParties(state, count) {
  const camps = state.world.sites.filter(function (s) {
    return s.type === 'camp' && !s.cleared;
  });
  for (let i = 0; i < count; i++) {
    const camp = camps.length ? state.rng.pick(camps) : null;
    const spot = findFreeSpotNear(state, camp ? camp.x : state.rng.int(2, 38), camp ? camp.y : state.rng.int(2, 46), 4);
    if (!spot) continue;
    const size = state.rng.int(9, 16);
    const troops = { bandit: size };
    if (state.rng.chance(0.5)) troops.raider = state.rng.int(1, 3);
    if (state.rng.chance(0.35)) troops.raider_cav = state.rng.int(1, 3);
    state.parties.push({
      id: 'p' + state.partySeq++,
      name: state.rng.pick(BANDIT_NAMES),
      faction: 'bandit',
      troops,
      morale: state.rng.int(55, 75),
      x: spot.x,
      y: spot.y,
      wander: null,
      chasing: false,
      sight: 5,
    });
  }
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
      endGame(state, 'defeat', '队伍因断粮散尽，你一个人走出了地图。');
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

  // 匪团补充
  if (state.parties.filter(function (x) { return x.faction === 'bandit'; }).length < 5 && state.rng.chance(0.4)) {
    spawnBanditParties(state, 1);
  }
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
    let budget = dt / HOUR_SECONDS;
    let guard = 0;
    while (budget > 0 && p.stepTo && guard++ < 14) {
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
      state.events.push({ type: 'siege', siteId: site.id });
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
  return {
    name: state.player.flagName === '无旗' ? state.player.name : state.player.flagName,
    faction: state.player.faction,
    troops: deepCopy(state.player.troops),
    morale: state.player.morale,
    atkPct: bonus.atkPct,
    defPct: bonus.defPct,
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
    context: { kind: party.scripted ? 'chase' : 'party', partyId: party.id, partyName: party.name },
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
    if (army.troopCount(p.troops) <= 0) {
      endGame(state, 'defeat', '你倒在乱军里，战团就此散伙。');
    }
  } else if (summary.result === 'retreat') {
    p.morale = Math.max(0, p.morale - 8);
    pushLog(state, '你下令脱离战斗，退到野地里。');
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
  const rng = state.rng;
  const gold = 80 + rng.int(0, 90);
  const food = 30 + rng.int(0, 40);
  state.player.gold += gold;
  state.player.food += food;
  state.stats.villagesRaided += 1;
  site.garrison = Math.max(0, site.garrison - 6);
  site.priceIndex = Math.min(1.5, (site.priceIndex || 1) * 1.2);
  site.burned = true;
  if (site.ownerFaction) changeRelation(state, site.ownerFaction, -40);
  state.player.renown = Math.max(0, state.player.renown - 6);
  pushLog(state, '你洗了' + site.name + '，得 ' + gold + ' 金、' + food + ' 粮。村口有人记住了你的旗。');
  return { ok: true, msg: '抢到 ' + gold + ' 金、' + food + ' 粮' };
}

/* ---------------------------------------------------------------- 战役 */

function campaignState(state) {
  const stage = state.campaign.stage;
  return CAMPAIGN[Math.min(stage, CAMPAIGN.length - 1)];
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
  garrisonTroops,
  findFreeSpotNear,
};

  };

  /* js/scenes/title.js */
  __defs[13] = function (module, exports, __require) {
/**
 * 标题：骑砍大师 · 三国
 */

const { text, panel } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);

const SAVE_KEY = 'bw_save_v3';

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
  __defs[15] = function (module, exports, __require) {
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
      stateLib.startLordBattle(st, lord);
      app.push('battle', { mode: 'lord' });
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
  __defs[14] = function (module, exports, __require) {
/**
 * 大地图场景：三国全图、区域风景、玩家骑马立绘、城池名牌、行军
 */

const { text, panel, bar, wrap } = __require(6);
const pixel = __require(3);
const { UI_COLORS } = pixel;
const stateLib = __require(7);
const army = __require(9);
const { regionAt, regionDef, siteById, terrainAt } = __require(8);
const { FACTIONS, TERRAIN, CAMPAIGN, COAST, RIVER_HUANG, RIVER_YANG, RIVER_HUAI, MOUNTAINS, ROADS } = __require(5);
const flows = __require(15);

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

    // 相机跟随
    const box = mapBox(app);
    const targetX = st.player.x * TILE + TILE / 2 - app.runtime.width / 2;
    const targetY = st.player.y * TILE + TILE / 2 - box.h / 2;
    if (!app.mapDrag) {
      app.mapCam.x += (targetX - app.mapCam.x) * Math.min(1, dt * 4.5);
      app.mapCam.y += (targetY - app.mapCam.y) * Math.min(1, dt * 4.5);
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
  const toX = function (gx) { return gx * TILE - cam.x; };
  const toY = function (gy) { return box.top + gy * TILE - cam.y; };

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 海岸：沙滩带 + 浪线
  const coast = coastPoints();
  ctx.strokeStyle = 'rgba(233,216,180,0.42)';
  ctx.lineWidth = 13;
  strokePolyline(ctx, coast, toX, toY);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  strokePolyline(ctx, coast, toX, toY);

  // 河流：暗岸 + 水体 + 高光
  [[RIVER_HUANG, 0.72], [RIVER_YANG, 0.85], [RIVER_HUAI, 0.55]].forEach(function (r) {
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
  MOUNTAINS.forEach(function (line) {
    ctx.strokeStyle = 'rgba(86,80,70,0.35)';
    ctx.lineWidth = TILE * 1.15;
    strokePolyline(ctx, line, toX, toY);
    ctx.strokeStyle = 'rgba(152,145,132,0.58)';
    ctx.lineWidth = TILE * 0.5;
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

  // 匪团
  st.parties.forEach(function (p) {
    const sx = p.x * TILE - cam.x + TILE / 2;
    const sy = box.top + p.y * TILE - cam.y + TILE / 2;
    if (sx < -40 || sx > w + 40 || sy < box.top - 40 || sy > box.top + box.h + 40) return;
    ctx.drawImage(assets.bandit, sx - 14, sy - 14, 28, 28);
    if (p.scripted) {
      // 追兵：红色警示
      ctx.fillStyle = 'rgba(200,60,40,0.9)';
      ctx.fillRect(sx - 22, sy - 40, 44, 16);
      text(ctx, '追兵', sx, sy - 39, { size: 13, align: 'center', color: '#fff' });
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
    ctx.drawImage(assets.lord, sx - 18, sy - 20, 36, 36);

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

function drawPlayerOnMap(ctx, app, cam, box) {
  const p = app.state.player;
  const sx = p.x * TILE + TILE / 2 - cam.x;
  const sy = box.top + p.y * TILE + TILE / 2 - cam.y;
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

  // 战役目标
  const stage = CAMPAIGN[Math.min(st.campaign.stage, CAMPAIGN.length - 1)];
  if (stage) {
    text(ctx, '战役 · ' + stage.title, 16, 104, { size: 15, color: '#a2947a' });
    text(ctx, stage.goal, 150, 104, { size: 15, color: '#e6d7b6' });
  }
}

function drawBottom(ctx, app, w, box) {
  const y0 = box.top + box.h;
  ctx.fillStyle = '#171310';
  ctx.fillRect(0, y0, w, BOT_H);
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(0, y0, w, 3);

  const btns = [
    { id: 'army', label: '队伍', tap: function () { app.push('army'); } },
    { id: 'journal', label: '史册', tap: function () { app.push('journal'); } },
    { id: 'atlas', label: '天下', tap: function () { app.push('atlas'); } },
    { id: 'help', label: '玩法', tap: function () { app.push('help'); } },
    { id: 'camp', label: '扎营', tap: function () {
      const r = stateLib.camp(app.state);
      app.showToast(r.msg);
    } },
  ];
  const gap = 10;
  const bw = (w - 20 - gap * 4) / 5;
  btns.forEach(function (b, i) {
    app.ui.button(ctx, 10 + i * (bw + gap), y0 + 14, bw, 76, b.label, {
      id: b.id, size: 26, onTap: b.tap,
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
  __defs[16] = function (module, exports, __require) {
/**
 * 天下大势：整张中国地图一屏看完，标大城关隘、势力、自己的位置
 */

const { REGIONS, FACTIONS } = __require(5);
const { text } = __require(6);

const MAP_TOP = 112;
const MAP_LEFT = 10;

/** 只给这些要地标名字，其余城池只点方块，免得满屏小字 */
const KEY_SITES = [
  'luoyang', 'changan', 'xuchang', 'ye', 'chengdu', 'jianye', 'xiangyang',
  'jiangling', 'shouchun', 'xiapi', 'beiping', 'jinyang', 'tianshui', 'hanzhong',
  'changsha', 'wujun', 'chenliu', 'guandu',
];

function cellColor(t, region) {
  if (t === 'sea') return '#1e4166';
  if (t === 'river') return '#356a94';
  if (t === 'mountain') return '#6d6760';
  if (t === 'road') return '#8f7a58';
  const r = REGIONS[region] || REGIONS.zhongyuan;
  return r.palette.ground;
}

const AtlasScene = {
  enter(app) {
    app.atlasPulse = 0;
  },

  update(app, dt) {
    app.atlasPulse = (app.atlasPulse || 0) + dt;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;

    ctx.fillStyle = '#0e0b08';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '天下大势', 16, 22, { size: 34, color: '#f0c060' });
    text(ctx, '魏 · 蜀 · 吴 · 群雄割据', 16, 66, { size: 17, color: '#a2947a' });

    app.ui.button(ctx, w - 146, 20, 130, 56, '返回', {
      id: 'atlas_back', size: 22, onTap: function () { app.pop(); },
    });

    const world = st.world;
    const cell = Math.min((w - MAP_LEFT * 2) / world.w, (h - MAP_TOP - 150) / world.h);
    const ox = (w - cell * world.w) / 2;
    const oy = MAP_TOP + 6;
    const mw = cell * world.w;
    const mh = cell * world.h;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, MAP_TOP, w, mh + 12);
    ctx.clip();

    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const t = world.tiles[y * world.w + x];
        const reg = (world.regions && world.regions[y * world.w + x]) || 'zhongyuan';
        ctx.fillStyle = cellColor(t, reg);
        ctx.fillRect(ox + x * cell, oy + y * cell, Math.ceil(cell) + 1, Math.ceil(cell) + 1);
      }
    }

    // 据点：城与关标名牌，村庄只点一个点
    world.sites.forEach(function (s) {
      const sx = ox + (s.x + 0.5) * cell;
      const sy = oy + (s.y + 0.5) * cell;
      if (sx < -20 || sx > w + 20 || sy < MAP_TOP - 20 || sy > MAP_TOP + mh + 20) return;
      const fac = s.ownerFaction ? FACTIONS[s.ownerFaction] : null;
      const col = fac ? fac.color : '#8a8276';

      if (s.type === 'village') {
        ctx.fillStyle = col;
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        return;
      }
      if (s.type === 'camp') {
        ctx.fillStyle = '#a8503c';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
        return;
      }

      const big = s.type === 'town';
      const sz = big ? 8 : 6;
      ctx.fillStyle = '#0d0a07';
      ctx.fillRect(sx - sz / 2 - 1, sy - sz / 2 - 1, sz + 2, sz + 2);
      ctx.fillStyle = s.playerOwned ? '#f0c060' : col;
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
      if (big) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, 1);
      }

      if (KEY_SITES.indexOf(s.id) < 0) return;
      ctx.font = 'bold 12px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(s.name).width;
      ctx.fillStyle = 'rgba(8,6,4,0.78)';
      ctx.fillRect(sx - tw / 2 - 3, sy + sz / 2 + 1, tw + 6, 16);
      text(ctx, s.name, sx, sy + sz / 2 + 3, {
        size: 12, align: 'center', color: s.playerOwned ? '#f0c060' : '#ece1c8',
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

    // 边框
    ctx.strokeStyle = 'rgba(240,192,96,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, mw, mh);

    // 势力图例
    const legendY = oy + mh + 16;
    const ids = Object.keys(FACTIONS);
    const cols = 5;
    const cw = (w - MAP_LEFT * 2) / cols;
    ids.forEach(function (id, i) {
      const cx = MAP_LEFT + (i % cols) * cw;
      const cy = legendY + Math.floor(i / cols) * 32;
      ctx.fillStyle = FACTIONS[id].color;
      ctx.fillRect(cx, cy + 3, 14, 14);
      text(ctx, FACTIONS[id].name || FACTIONS[id].full, cx + 22, cy + 2, { size: 15, color: '#c9bda2' });
    });

    text(ctx, '金圈是你所在的位置 · 城与关标名牌 · 灰块是山、蓝带是水', MAP_LEFT, legendY + 76, {
      size: 14, color: '#8a8070',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = AtlasScene;

  };

  /* js/scenes/town.js */
  __defs[17] = function (module, exports, __require) {
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
const army = __require(9);
const { siteById, regionDef } = __require(8);
const { TROOPS } = __require(10);
const { FACTIONS, EQUIPMENT } = __require(5);
const flows = __require(15);

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

  y = menuButton(app, y, '招兵', isVillage ? '村里的壮丁，价钱便宜' : '花钱买人，价钱随城而变', function () {
    app.townView.view = 'recruit';
  }, { id: 'm_recruit', right: '→' });

  y = menuButton(app, y, '市场', isVillage ? '粮价低 · 无军械' : '粮草 · 军械', function () {
    app.townView.view = 'market';
    app.townView.tab = 'food';
  }, { id: 'm_market', right: '粮 ' + economy.foodPrice(site) + ' 金/单位' });

  if (!isVillage) {
    y = menuButton(app, y, '酒馆', '接活 · 打听消息', function () {
      app.townView.view = 'tavern';
    }, { id: 'm_tavern', right: '→' });

    y = menuButton(app, y, '领主府', '效忠 · 宣战 · 情报', function () {
      app.townView.view = 'hall';
    }, { id: 'm_hall', right: site.ownerFaction ? FACTIONS[site.ownerFaction].full : '无主' });
  } else {
    y = menuButton(app, y, '劫掠村庄', '抢粮抢钱，掉声望，得罪其主', function () {
      const r = stateLib.raidVillage(app.state, site);
      app.showToast(r.ok ? r.msg : r.msg, 2.6);
      if (r.ok) app.townView.view = 'menu';
    }, { id: 'm_raid', fill: '#3a2018', right: '→' });
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

  const list = site.recruitList || [];
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

function renderMarket(app, site, tab) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;

  const tabs = [
    { id: 'food', label: '粮草' },
    { id: 'arms', label: '军械' },
  ];
  const tw = (w - PAD * 2) / 2;
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
    });
  });

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
      tab: 'food',
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
    else if (v === 'market') renderMarket(app, site, app.townView.tab || 'food');
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
  __defs[18] = function (module, exports, __require) {
/**
 * 战斗场景：战前选战术 → 回合自动推进 → 结算
 * 战中可落一笔史简（南风起 / 风止 / 名册）
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const army = __require(9);
const { TROOPS } = __require(10);
const { TACTICS, TACTIC_LIST } = __require(12);
const { HISTORY_MARKS, CAMPAIGN, FACTIONS } = __require(5);

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
    const bottom = h - 220;
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
      const ty = bottom + 140;
      text(ctx, TACTICS[bv.tactic].desc, 16, ty, { size: 16, color: '#a2947a' });

      app.ui.button(ctx, 16, h - 100, w - 32, 78, '开战', {
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
        app.pop();
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
  __defs[19] = function (module, exports, __require) {
/**
 * 队伍页：兵力构成、士气、装备、史简
 */

const { text, panel, bar, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const stateLib = __require(7);
const armyLib = __require(9);
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
  __defs[20] = function (module, exports, __require) {
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
  __defs[21] = function (module, exports, __require) {
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
  { id: 'campaign', label: '战役' },
  { id: 'factions', label: '势力' },
  { id: 'troops', label: '兵种' },
  { id: 'endings', label: '结局' },
];

const TAB_H = 116;
const CONTENT_TOP = TAB_H + 10;

/** 内容块：h1/p/gap/faction/troop/chapter/ending/sep */
function buildOps(app, tab) {
  const st = app.state;
  const ops = [];

  if (tab === 'basic') {
    ops.push({ t: 'h1', s: '基本循环' });
    ops.push({ t: 'p', s: '你从洛阳溃兵开始：30 个民兵、60 金、40 粮，还有一支史简。' });
    ops.push({ t: 'p', s: '点地图行军。地形决定耗时：道路 1.3 小时一格，农田 1.9，林地 2.9，沼泽 4.3，渡河 4.6，山地走不了。' });
    ops.push({ t: 'p', s: '每过一天，全队按人头吃粮。断粮会跑兵、掉士气。长途前先在村子里把粮备足。' });
    ops.push({ t: 'p', s: '走进城池：招兵、市场（粮草/军械）、酒馆接活、领主府效忠或宣战。村庄只能招兵、买粮、劫掠。' });
    ops.push({ t: 'h1', s: '战斗' });
    ops.push({ t: 'p', s: '战前选战术：冲锋 / 结阵 / 包抄 / 弓弩先射。回合自动推进，双方同时结算，低阶兵先倒。' });
    ops.push({ t: 'p', s: '减员到三成半以下就溃。打不过可以撤，撤退额外损失 25%。' });
    ops.push({ t: 'h1', s: '史简' });
    ops.push({ t: 'p', s: '战斗中能落一笔：南风起（我方攻击大增）、风止（双方攻击减半，救下很多人）、名册（阵亡者部分回来）。' });
    ops.push({ t: 'p', s: '每落一笔，所有势力对你的好感 -6。用得越多，越没人信你写的东西。' });
    ops.push({ t: 'h1', s: '势力与领主' });
    ops.push({ t: 'p', s: '曹操、刘备、孙权、袁绍、吕布、刘表、刘璋、轲比能、马腾、汉廷，共十家。' });
    ops.push({ t: 'p', s: '你抢他们的村、打他们的城、击败他们的领主，关系就会掉。低于 -25 即开战。' });
    ops.push({ t: 'p', s: '开战后，他们的领主在视野 7 格内会一路追着你打。跑得掉就跑，跑不掉就结阵、或者落一笔史简。' });
    ops.push({ t: 'h1', s: '声望' });
    ops.push({ t: 'p', s: '声望到 60 可在城里效忠。声望越高队伍上限越大：20 + 声望×0.35。' });
    ops.push({ t: 'p', s: '你的名字会随声望改：溃兵之首 → 一方游侠 → 小有威名 → 郡国校尉 → 一方诸侯 → 天下名将。' });
    return ops;
  }

  if (tab === 'campaign') {
    const stage = st ? st.campaign.stage : 0;
    ops.push({ t: 'h1', s: '主线战役' });
    ops.push({ t: 'p', s: '七章。目标是活的，不是通关的。每一章都会改写后面所有人的态度。' });
    CAMPAIGN.forEach(function (ch, i) {
      const done = i < stage;
      const active = i === stage;
      ops.push({
        t: 'chapter', ch, done, active,
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

  ops.push({ t: 'h1', s: '四种结局' });
  ops.push({ t: 'p', s: '结局不看对话选项，看你站在谁后面、以及你用了几支史简。' });
  [
    { k: 'ding', cond: '投魏，并在终幕清掉其他两家' },
    { k: 'xu', cond: '投蜀，并保住名册上的人' },
    { k: 'fen', cond: '投吴，并烧掉全部史简' },
    { k: 'self', cond: '谁都不投，兵过 250，赢下终幕' },
  ].forEach(function (e) {
    const d = ENDINGS[e.k];
    ops.push({ t: 'ending', title: d.title, text: d.text, cond: e.cond });
  });
  ops.push({ t: 'gap' });
  ops.push({ t: 'p', s: '另外：全军覆没或断粮瓦解，会直接终局，不给结局。' });
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
  if (op.t === 'chapter') return 172;
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
      const lines = wrap(ctx, ch.story, w - 96, 15, 'bold');
      lines.slice(0, 3).forEach(function (line, i) {
        text(ctx, line, 40, y + 70 + i * 24, { size: 15, color: '#8a8070' });
      });
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
  __defs[22] = function (module, exports, __require) {
/**
 * 章节页：一章打完，把话说清楚
 */

const { text, wrap } = __require(6);
const { UI_COLORS } = __require(3);
const { CAMPAIGN } = __require(5);

const ChapterScene = {
  enter(app, params) {
    app.chapterView = {
      ch: CAMPAIGN.filter(function (c) { return c.id === params.id; })[0] || CAMPAIGN[0],
    };
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const ch = app.chapterView.ch;

    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(240,192,96,0.06)';
    ctx.fillRect(0, 0, w, h * 0.42);

    text(ctx, '第 ' + (CAMPAIGN.indexOf(ch) + 1) + ' 章', w / 2, 90, { size: 18, align: 'center', color: '#8a8070' });
    text(ctx, ch.title, w / 2, 122, { size: 40, align: 'center', color: '#f0c060' });

    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(w / 2 - 60, 186, 120, 3);

    // 故事
    let y = 226;
    ch.story.split('\n').forEach(function (line) {
      wrap(ctx, line, w - 96, 19, 'bold').forEach(function (l) {
        text(ctx, l, 48, y, { size: 19, color: '#c9bda2' });
        y += 32;
      });
      y += 8;
    });

    // 目标
    y += 10;
    text(ctx, '目标 · ' + ch.goal, 48, y, { size: 17, color: '#8a8070' });
    y += 40;

    // 完成文案
    if (ch.after) {
      ctx.fillStyle = 'rgba(60,44,24,0.5)';
      ctx.fillRect(28, y - 4, w - 56, 130);
      ctx.fillStyle = UI_COLORS.accent;
      ctx.fillRect(28, y - 4, 4, 130);
      wrap(ctx, ch.after, w - 100, 20, 'bold').slice(0, 3).forEach(function (line, i) {
        text(ctx, line, 46, y + 16 + i * 34, { size: 20, color: '#efe3c6' });
      });
      y += 150;
    }

    // 奖励
    if (ch.reward) {
      const parts = [];
      if (ch.reward.gold) parts.push(ch.reward.gold + ' 金');
      if (ch.reward.renown) parts.push(ch.reward.renown + ' 声望');
      if (ch.reward.shi) parts.push(ch.reward.shi + ' 支史简');
      if (ch.reward.banner) parts.push('一面自己的旗');
      if (parts.length) text(ctx, '得：' + parts.join(' · '), 48, y, { size: 17, color: '#f0c060' });
    }

    app.ui.button(ctx, 40, h - 120, w - 80, 78, '记下这一页', {
      id: 'ch_ok', size: 28, fill: '#3a2c1e', onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ChapterScene;

  };

  /* js/scenes/ending.js */
  __defs[23] = function (module, exports, __require) {
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

  /* js/main.js */
  __defs[1] = function (module, exports, __require) {
/**
 * 游戏主循环与场景栈
 */

const { createRuntime } = __require(2);
const pixel = __require(3);
const { UI, text, wrap, panel } = __require(6);
const stateLib = __require(7);

class App {
  constructor(runtime) {
    this.runtime = runtime;
    this.assets = pixel.buildAssets(runtime);
    this.ui = new UI();
    this.stack = [];
    this.state = null;
    this.scenes = {
      title: __require(13),
      map: __require(14),
      atlas: __require(16),
      town: __require(17),
      battle: __require(18),
      army: __require(19),
      journal: __require(20),
      help: __require(21),
      nested: null,
      chapter: __require(22),
      ending: __require(23),
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
  }

  pop() {
    if (this.stack.length <= 1) return;
    const leaving = this.stack.pop();
    if (leaving.scene.leave) leaving.scene.leave(this);
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
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
        this.runtime.storage.set('bw_save_v3', stateLib.serialize(this.state));
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
