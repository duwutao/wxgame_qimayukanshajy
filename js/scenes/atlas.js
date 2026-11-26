/**
 * 天下大势：可缩放的势力总图
 * 任何缩放级别都保留城与关隘的名字；放大时铺上各势力领土色、描州界。
 */

const { REGIONS, FACTIONS, CAPITAL_IDS } = require('../data/china.js');
const { text, panel } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const territory = require('../core/territory.js');

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
    if (st.story && st.story.mode && st.story.headline) {
      text(ctx, st.story.headline, 16, 88, { size: 13, color: '#c8b48a' });
    }

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
    // 旗色不再单列成图例：每行名字前的色条就是这家势力的旗色。
    // 名单因此可以铺满侧栏，不用给底部图例留位置。
    const rowH = Math.max(38, Math.min(58,
      Math.floor((ph - 86 - 50) / Math.max(1, ids.length))));
    const rowTop = py + 86;
    ids.forEach(function (id, i) {
      const y = rowTop + i * rowH;
      const fac = FACTIONS[id];
      const rel = stateLib.relationOf(st, id);
      const war = stateLib.atWarWith(st, id);
      const fs = st.factionState[id] || {};
      // 旗色直接铺进这一行：左侧色条 + 极淡底色，不再另设独立图例。
      ctx.save();
      ctx.globalAlpha = 0.075;
      ctx.fillStyle = fac.color;
      ctx.fillRect(px + 10, y - 4, pw - 18, rowH - 7);
      ctx.restore();
      ctx.fillStyle = fac.color;
      ctx.fillRect(px + 14, y + 3, 7, 24);
      text(ctx, fac.name || fac.full, px + 29, y, { size: 17, color: fs.dead ? '#6a6050' : '#e6dbc2' });
      text(ctx, fs.dead ? '亡' : rel > 0 ? '+' + rel : String(rel),
        px + pw - 12, y, { size: 17, align: 'right', color: fs.dead ? '#6a6050' : rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#c9bda2' });
      if (war) {
        ctx.fillStyle = 'rgba(210,70,50,0.85)';
        ctx.fillRect(px + 14, y + 29, 7, 5);
        text(ctx, '战', px + 29, y + 20, { size: 11, color: '#e08070' });
      }
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
