/**
 * 世界层：三国大地图生成、区域风景、通行判定、寻路、时间换算
 */

const { RNG } = require('../rng.js');
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
  RIVER_WEI,
  RIVER_HAN,
  MOUNTAINS,
  SITE_ROWS,
  RECRUIT_SETS,
  ROADS,
  FACTIONS,
} = require('../data/china.js');

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

/** 据点定义 -> 实际 site 对象；兼容新开局与旧档补新城。 */
function siteFromRow(world, row) {
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
  return site;
}

function isRoadTile(t) {
  return t === 'road' || t === 'bridge' || t === 'pass';
}

/** 给桥梁记号去重；同一格被多条道路穿过时只画一次 */
function addBridgeMark(world, x, y, dir) {
  world.bridges = world.bridges || [];
  for (let i = 0; i < world.bridges.length; i++) {
    const b = world.bridges[i];
    if (b.x === x && b.y === y) {
      if (dir === 'h' || dir === 'v') b.dir = dir;
      return;
    }
  }
  world.bridges.push({ x, y, dir: dir === 'v' ? 'v' : 'h' });
}

/** 山口/峡谷记号：同一格只记一次，方向由道路穿过的方向决定。
 *  h/v 是正横/正竖，d1/d2 是两条斜向谷道（下右 / 上右）。 */
function addCanyonMark(world, x, y, dir) {
  world.canyons = world.canyons || [];
  const valid = dir === 'h' || dir === 'v' || dir === 'd1' || dir === 'd2';
  for (let i = 0; i < world.canyons.length; i++) {
    const c = world.canyons[i];
    if (c.x === x && c.y === y) {
      // 载入旧档时 ensureWorldFeatures 会用 h/v 再补一遍方向，
      // 不能把人工排好的斜向峡谷覆盖回正方向。
      if (valid && !(c.dir === 'd1' || c.dir === 'd2')) c.dir = dir;
      return;
    }
  }
  world.canyons.push({ x: x, y: y, dir: valid ? dir : 'h' });
}

/** 河流夹在道路中间时，这一格就是桥；兼容旧档没有 bridge 格的情况 */
function bridgeDirAt(world, x, y) {
  const L = isRoadTile(world.tiles[idx(x - 1, y)]);
  const R = isRoadTile(world.tiles[idx(x + 1, y)]);
  const U = isRoadTile(world.tiles[idx(x, y - 1)]);
  const D = isRoadTile(world.tiles[idx(x, y + 1)]);
  if (L && R && !U && !D) return 'h';
  if (U && D && !L && !R) return 'v';
  if (L && R) return 'h';
  if (U && D) return 'v';
  return null;
}

/**
 * 桥格脚下必须真的有水：横向桥看上下，竖向桥看左右。
 * 只靠“道路两侧都有别的路”会把沿河岸铺的公路误判成桥，
 * 于是河滩、平地甚至山口上都会冒出一座木桥。
 */
function bridgeHasWater(world, x, y, dir) {
  const wet = function (tx, ty) {
    if (!inBounds(tx, ty)) return false;
    const t = world.tiles[idx(tx, ty)];
    return t === 'river' || t === 'bridge';
  };
  const horizontal = function () { return wet(x, y - 1) || wet(x, y + 1); };
  const vertical = function () { return wet(x - 1, y) || wet(x + 1, y); };
  if (dir === 'v') return vertical();
  if (dir === 'h') return horizontal();
  // 斜穿河道的桥没有严格横竖，四邻只要有一格水面就算跨水。
  return horizontal() || vertical();
}

/** 桥格四邻里必须至少有一格真正的河水；只看 bridge 格会把整片假桥连成的路也算成水。 */
function bridgeHasRiver(world, x, y) {
  const river = function (tx, ty) {
    if (!inBounds(tx, ty)) return false;
    return world.tiles[idx(tx, ty)] === 'river';
  };
  return river(x - 1, y) || river(x + 1, y) || river(x, y - 1) || river(x, y + 1);
}


/**
 * 补齐桥梁标记：
 * - 新地图：layRoads 已经把过河的格子改成 bridge；
 * - 旧存档：河流两侧都有道路的 river 格，现场补成 bridge，避免旧档看不到桥。
 */
function ensureWorldFeatures(world) {
  if (!world || !world.tiles) return world;
  world.bridges = Array.isArray(world.bridges) ? world.bridges : [];
  world.canyons = Array.isArray(world.canyons) ? world.canyons : [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const t = world.tiles[idx(x, y)];
      if (t === 'bridge') {
        addBridgeMark(world, x, y, bridgeDirAt(world, x, y));
      } else if (t === 'river') {
        const dir = bridgeDirAt(world, x, y);
        // 旧档补桥也要确认脚下是水：没有水面横在道路两侧的河格，
        // 很可能是沿河岸的道路，不能硬改成桥。
        if (dir && bridgeHasWater(world, x, y, dir)) {
          world.tiles[idx(x, y)] = 'bridge';
          addBridgeMark(world, x, y, dir);
        }
      } else if (t === 'pass') {
        // 旧档没有峡谷标记：按道路/山口连成的走廊补方向。
        // 孤立山口默认为横向，但真正穿山时 layRoads 会写入准确方向。
        addCanyonMark(world, x, y, bridgeDirAt(world, x, y) || 'h');
      }
    }
  }
  // 汉中北面两处谷口是人工排布的地标，旧档也要保持斜向。
  shapeHanzhongCanyons(world);
  return world;
}

/** 汉中左上、右上的斜向峡谷：
 *  左上沿用天水和汉中之间的老谷口，右上沿山脊再切一条斜谷。
 *  只改地形和峡谷标记，不改变城市的归属与道路连接。 */
function shapeHanzhongCanyons(world) {
  function carve(x, y, dir) {
    if (!inBounds(x, y)) return;
    if (siteAt(world, x, y)) return;
    const t = world.tiles[idx(x, y)];
    if (t === 'sea' || t === 'river' || t === 'bridge') return;
    world.tiles[idx(x, y)] = 'pass';
    addCanyonMark(world, x, y, dir);
  }
  // 左上：44,84 / 44,85 两格老谷口，改成从西北斜向东南的谷道
  carve(44, 84, 'd1');
  carve(44, 85, 'd1');
  // 右上：把斜谷放进山脊内部（59,85 / 60,86），
  // 避免只在山脚切半格、远看像一块横在山前的木桥。
  carve(59, 85, 'd1');
  carve(60, 86, 'd1');
  // 旧测试档里曾把右上谷口切到 58,85 / 59,84，会压到农田边缘；
  // 这两格恢复为原来的山脚，再把峡谷标记移走。
  [[58, 85, 'mountain'], [59, 84, 'foothill']].forEach(function (row) {
    const x = row[0], y = row[1];
    if (inBounds(x, y) && world.tiles[idx(x, y)] === 'pass' && !siteAt(world, x, y)) {
      world.tiles[idx(x, y)] = row[2];
      world.canyons = (world.canyons || []).filter(function (c) { return c.x !== x || c.y !== y; });
    }
  });
}

/** 铺设道路；过河落桥，穿山落山口。旧档补新城时也可以只铺新增的连线。 */
function layRoads(world, pairs) {
  world.bridges = world.bridges || [];
  (pairs || []).forEach(function (pair) {
    const a = siteById(world, pair[0]);
    const b = siteById(world, pair[1]);
    if (!a || !b) return;
    let lastX = a.x;
    let lastY = a.y;
    bresenham(a.x, a.y, b.x, b.y, function (x, y) {
      if (!inBounds(x, y)) return;
      if (siteAt(world, x, y)) return;
      const t = world.tiles[idx(x, y)];
      const stepX = x - lastX;
      const stepY = y - lastY;
      let dir = Math.abs(stepX) >= Math.abs(stepY) ? 'h' : 'v';
      if (stepX && stepY && Math.abs(stepX) === Math.abs(stepY)) {
        dir = stepX * stepY > 0 ? 'd1' : 'd2';
      }
      if (t === 'sea') {
        lastX = x;
        lastY = y;
        return;
      }
      if (t === 'river' || t === 'bridge') {
        world.tiles[idx(x, y)] = 'bridge';
        // 只给真正跨水的格子留桥记号；沿河岸铺路时不要凭空长出一座桥。
        if (bridgeHasWater(world, x, y, dir)) addBridgeMark(world, x, y, dir);
      } else if (t === 'mountain') {
        world.tiles[idx(x, y)] = 'pass';
        // 穿山口要留下方向：横着穿山和竖着穿山，画出来的峡谷不是同一条。
        addCanyonMark(world, x, y, dir);
      } else {
        world.tiles[idx(x, y)] = 'road';
      }
      lastX = x;
      lastY = y;
    });
  });
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

  // 3. 山脉：沿折线刷出有宽度的山体；外缘铺山麓，不再是细细一条线
  MOUNTAINS.forEach(function (line, lineIndex) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = [S(line[i][0]), SV(line[i][1], MAP_H - 1)];
      const b = [S(line[i + 1][0]), SV(line[i + 1][1], MAP_H - 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const nx = -dy / len;
      const ny = dx / len;
      bresenham(a[0], a[1], b[0], b[1], function (x, y) {
        if (!inBounds(x, y)) return;
        if (world.tiles[idx(x, y)] === 'sea') return;
        // 山体宽 3～5 格，边缘随机落山麓；每段有一点起伏，避免复制粘贴感
        const half = 1 + (rng.chance(0.42) ? 1 : 0);
        for (let o = -half; o <= half; o++) {
          if (o === 0 && rng.chance(0.18)) continue;
          const ox = Math.round(x + nx * o);
          const oy = Math.round(y + ny * o);
          if (!inBounds(ox, oy)) continue;
          if (world.tiles[idx(ox, oy)] === 'sea') continue;
          if (Math.abs(o) === half) {
            if (rng.chance(0.62)) world.tiles[idx(ox, oy)] = 'foothill';
          } else {
            world.tiles[idx(ox, oy)] = 'mountain';
          }
        }
        // 山脊线上偶尔再垫一格，拉出连绵的肩部
        if (rng.chance(0.34)) setTile(world, x, y + (rng.chance(0.5) ? 1 : -1), 'foothill');
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
        if (wide && rng.chance(0.55)) setTile(world, x, y + 1, 'river');
        // 河岸：靠水的一圈偶尔落成湿地，视觉过渡更软
        if (rng.chance(0.18)) {
          const ex = x + (rng.chance(0.5) ? 1 : -1);
          if (inBounds(ex, y) && world.tiles[idx(ex, y)] !== 'river' && world.tiles[idx(ex, y)] !== 'sea') {
            world.tiles[idx(ex, y)] = 'marsh';
          }
        }
      });
    }
  }
  drawRiver(RIVER_HUANG, true);
  drawRiver(RIVER_YANG, true);
  drawRiver(RIVER_HUAI, false);
  drawRiver(RIVER_WEI, false);
  drawRiver(RIVER_HAN, false);

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
  for (let i = 0; i < 22; i++) blob(rng.int(1, MAP_W - 2), rng.int(2, MAP_H - 2), rng.int(2, 4), 'forest', 0.6);
  for (let i = 0; i < 15; i++) blob(rng.int(1, MAP_W - 2), rng.int(2, MAP_H - 2), rng.int(1, 3), 'hills', 0.55);
  for (let i = 0; i < 11; i++) blob(rng.int(20, MAP_W - 4), rng.int(26, MAP_H - 3), rng.int(1, 3), 'marsh', 0.5);
  for (let i = 0; i < 7; i++) blob(rng.int(1, 12), rng.int(10, 26), rng.int(1, 3), 'desert', 0.55);
  // 凉州绿洲：小水面加棕榈，走过戈壁时能一眼认出来
  for (let i = 0; i < 6; i++) {
    blob(S(rng.int(3, 11)), SV(rng.int(11, 25), MAP_H - 2), rng.int(1, 2), 'oasis', 0.52);
  }

  // 6. 据点
  SITE_ROWS.forEach(function (row) {
    world.sites.push(siteFromRow(world, row));
  });

  // 7. 道路
  layRoads(world, ROADS);

  // 8. 连通性兜底：从陈留铺路。山搭山口、水搭桥，别让据点被地形锁死
  const start = siteById(world, 'chenliu') || world.sites[0];
  const reach = reachableTiles(world, start.x, start.y);
  world.sites.forEach(function (s) {
    if (reach[idx(s.x, s.y)]) return;
    bresenham(start.x, start.y, s.x, s.y, function (x, y) {
      if (!inBounds(x, y)) return;
      if (siteAt(world, x, y)) return;
      const t = world.tiles[idx(x, y)];
      if (t === 'sea') return;
      if (t === 'river') world.tiles[idx(x, y)] = 'bridge';
      else if (t === 'mountain') world.tiles[idx(x, y)] = 'pass';
      else world.tiles[idx(x, y)] = 'road';
    });
  });

  ensureWorldFeatures(world);
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
function findPath(world, from, to, opts) {
  if (!inBounds(from.x, from.y) || !inBounds(to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  if (!isPassable(world, to.x, to.y)) return null;
  const avoidSites = !!(opts && opts.avoidSites);

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
      // 匪团/流寇不进城的路径：据点格绕开，避免从城门正中间穿过去。
      if (avoidSites && !(nx === to.x && ny === to.y) && siteAt(world, nx, ny)) continue;
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
  siteFromRow,
  layRoads,
  ensureWorldFeatures,
  bridgeHasWater,
  findPath,
  tileHours,
  addHours,
  formatClock,
  gridDistance,
  reachableTiles,
};
