/**
 * 像素美术层：所有贴图由代码生成，零图片资源。
 * 地形按「区域 × 地形」懒生成，所以塞北草原、中原麦田、江南水乡看起来不一样。
 */

const { RNG } = require('../rng.js');
const { REGIONS } = require('../data/china.js');

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
  const mounted = !naval && /cav|qishe|tiefu|tengri|xianbei|jinjun/.test(kind);
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
