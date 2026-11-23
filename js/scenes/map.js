/**
 * 大地图场景：三国全图、区域风景、玩家骑马立绘、城池名牌、行军
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const pixel = require('../render/pixel.js');
const { UI_COLORS } = pixel;
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { regionAt, regionDef, siteById, terrainAt } = require('../core/world.js');
const { FACTIONS, TERRAIN, CAMPAIGN, COAST, RIVER_HUANG, RIVER_YANG, RIVER_HUAI, MOUNTAINS, ROADS } = require('../data/china.js');
const flows = require('./flows.js');

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
