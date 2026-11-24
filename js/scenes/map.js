/**
 * 大地图场景：三国全图、区域风景、玩家骑马立绘、城池名牌、行军
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const pixel = require('../render/pixel.js');
const { UI_COLORS } = pixel;
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { regionAt, regionDef, siteById, siteAt, terrainAt } = require('../core/world.js');
const { FACTIONS, TERRAIN, CAMPAIGN, COAST, RIVER_HUANG, RIVER_YANG, RIVER_HUAI, MOUNTAINS, ROADS, BASE_W, CAPITAL_IDS } = require('../data/china.js');
const { lookFor } = require('../data/extra.js');
const flows = require('./flows.js');

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
    app.showToast('西凉铁骑只在追上你时才会停下来，不能主动挑战。', 2.4);
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
    stateLib.update(st, dt);
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
    drawFreeHint(ctx, app, box, w);
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
    const box = mapBox(app);
    if (y < TOP_H || y > TOP_H + box.h) return;

    const st = app.state;

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
                app.push('town', { siteId: site.id, view: 'siege' });
                app.showToast('城下扎营：需围 ' + r.days + ' 天，围成后才能决战。', 2.6);
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

function drawSites(ctx, app, cam, box, w) {
  const st = app.state;
  const assets = app.assets;
  const lowZoom = (app.mapZoom || 1) < 0.45;
  const capitalLabels = [];

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

    // 拉远看整张天下时，城池收成势力色小点；国都仍要留名字，不许缩成无名点
    if (lowZoom) {
      const col = site.ownerFaction && FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].color : '#7a7266';
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
      if (isCapital) {
        capitalLabels.push({ site: site, sx: sx + TS / 2, sy: sy + TS / 2, color: col });
      }
      return;
    }

    const sprite = assets.site[site.type] || assets.site.village;
    ctx.drawImage(sprite, sx + 4, sy + 4, TS - 8, TS - 8);

    // 势力旗
    if (site.ownerFaction) {
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
    const size = isTown ? 22 : isCastle ? 19 : 16;
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
      color: site.playerOwned ? playerColor : isTown ? '#f2e7cd' : isCastle ? '#ded2b6' : '#b9ad92',
      shadow: true,
    });
  });

  // 极小缩放：国都名牌单独画在外圈，保证十座都城在任何缩放下都认得出
  if (lowZoom && capitalLabels.length) {
    const placed = [];
    capitalLabels.forEach(function (l) {
      const name = l.site.name;
      ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(name).width;
      const candidates = [
        { x: l.sx - tw / 2, y: l.sy + 7 },
        { x: l.sx - tw / 2, y: l.sy - 19 },
        { x: l.sx + 6, y: l.sy - 6 },
        { x: l.sx - tw - 6, y: l.sy - 6 },
        { x: l.sx - tw / 2, y: l.sy + 23 },
      ];
      let spot = null;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (!placed.some(function (r) {
          return c.x < r.x + r.w && c.x + tw + 6 > r.x && c.y < r.y + r.h && c.y + 15 > r.y;
        })) { spot = c; break; }
      }
      if (!spot) spot = candidates[0];
      placed.push({ x: spot.x, y: spot.y, w: tw + 6, h: 15 });
      ctx.fillStyle = 'rgba(8,6,4,0.88)';
      ctx.fillRect(spot.x, spot.y, tw + 6, 15);
      ctx.fillStyle = l.color;
      ctx.fillRect(spot.x, spot.y, 2, 15);
      text(ctx, name, spot.x + 5, spot.y + 2, { size: 11, color: '#ffe9c4' });
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
  const low = z < 0.45;
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

    if (p.scuffle > 0) {
      ctx.fillStyle = 'rgba(220,80,50,0.85)';
      ctx.fillRect(sx - 22 * z, sy - 58 * z, 44 * z, 16 * z);
      text(ctx, '交战', sx, sy - 57 * z, { size: Math.round(12 * z), align: 'center', color: '#fff' });
    }
    if (p.scripted) {
      ctx.fillStyle = 'rgba(200,60,40,0.9)';
      ctx.fillRect(sx - 22 * z, sy - 76 * z, 44 * z, 16 * z);
      text(ctx, '追兵', sx, sy - 75 * z, { size: Math.round(13 * z), align: 'center', color: '#fff' });
    }
  });

  // 领主
  st.lords.forEach(function (lord) {
    if (!lord.alive) return;
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
    if (z >= 0.9) {
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
  text(ctx, '第 ' + st.clock.day + ' 天 ' + pad(hour) + ' 时', 16, 12, { size: 20, color: '#c9bda2' });

  const fac = p.faction
    ? (p.faction === 'player'
      ? (p.country && p.country.name ? p.country.name + '国' : '你的旗')
      : (FACTIONS[p.faction] ? FACTIONS[p.faction].full : p.faction))
    : '无主';
  const title = stateLib.renownTitle(p.renown);
  // 没有旗的时候，左上角挂的就是声望换来的称号：一仗一仗往上走
  text(ctx, p.flagName === '无旗' ? title : p.flagName, 16, 40, { size: 24, color: '#f0c060' });
  text(ctx, '· ' + (p.flagName === '无旗' ? p.name : title) + ' · ' + fac, 180, 44, { size: 18, color: '#a2947a' });

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
    { k: '史简', v: p.shi, c: '#b98fd8' },
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

function drawBottom(ctx, app, w, box) {
  const y0 = box.top + box.h;
  ctx.fillStyle = '#171310';
  ctx.fillRect(0, y0, w, BOT_H);
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(0, y0, w, 3);

  const btns = [
    { id: 'army', label: '队伍', tap: function () { app.push('army'); } },
    { id: 'journal', label: '史册', tap: function () { app.push('journal'); } },
    { id: 'camp', label: '扎营', tap: function () { app.push('camp'); } },
    { id: 'menu', label: '菜单', tap: function () { app.push('menu'); } },
  ];
  const gap = 10;
  const bw = (w - 20 - gap * 3) / 4;
  btns.forEach(function (b, i) {
    app.ui.button(ctx, 10 + i * (bw + gap), y0 + 14, bw, 76, b.label, {
      id: b.id, size: 24, onTap: b.tap,
    });
  });

  const st = app.state;
  const p = st.player;
  const wars = stateLib.factionWars(st);
  const warTxt = wars.length ? ' · 天下 ' + wars.length + ' 处交兵' : ' · 四境暂无大战';
  const hint = (p.route && p.route.length
    ? '行军第 ' + (st.player.route.length - (st.player.route.length - 1)) + ' 段 · 点地图可改道'
    : (st.player.atSiteId ? '在' + (siteById(st.world, st.player.atSiteId) || {}).name + ' · 点地图出发' : '点地图行军 · 双指缩放 · 拖动平移'))
    + warTxt;
  text(ctx, hint, w / 2, y0 + 104, { size: 16, align: 'center', color: '#8a8070' });
}

module.exports = MapScene;
