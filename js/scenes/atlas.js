/**
 * 天下大势：可缩放的势力总图
 * 缩小（zoom=1）整图适配，标出所有城池名；
 * 放大（zoom>1）铺上各势力领土色、描州界，只留都城与重镇名。
 */

const { REGIONS, FACTIONS } = require('../data/china.js');
const { text } = require('../render/ui.js');

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
