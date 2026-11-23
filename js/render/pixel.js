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
