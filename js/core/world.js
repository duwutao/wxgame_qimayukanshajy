/**
 * 世界层：三国大地图生成、区域风景、通行判定、寻路、时间换算
 */

const { RNG } = require('../rng.js');
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
} = require('../data/china.js');

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
