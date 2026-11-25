/**
 * 大地图场景：三国全图、区域风景、玩家骑马立绘、城池名牌、行军
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const pixel = require('../render/pixel.js');
const { UI_COLORS } = pixel;
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { regionAt, regionDef, siteById, siteAt, terrainAt } = require('../core/world.js');
const territory = require('../core/territory.js');
const { FACTIONS, TERRAIN, CAMPAIGN, COAST, RIVER_HUANG, RIVER_YANG, RIVER_HUAI, RIVER_WEI, RIVER_HAN, MOUNTAINS, ROADS, BASE_W, CAPITAL_IDS } = require('../data/china.js');
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

/** 缩放档位：拉远看天下 / 常规 / 贴脸看一队人 / 贴地看城门；双指可以一直缩到整张天下 */
const ZOOM_MAX = 2.4;
const ZOOM_NAMES = ['远望', '常规', '近看', '贴地'];

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
  if (z < 2.18) return ZOOM_NAMES[2];
  return ZOOM_NAMES[3];
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
    app.showToast('西凉步卒只在追上你时才会停下来，不能主动挑战。', 2.4);
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
    app.siegePrompt = null;
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
    // 城下选择框开着时，时辰、行军、NPC 全部停住；先做决定，世界再走
    if (app.siegePrompt) return;
    stateLib.update(st, dt);
    // 围城时辰一到，不等人点营寨：自动把“进攻 / 离开”摆到面前
    const ps = st.playerSiege;
    if (ps && !app.siegePrompt &&
        (ps.stage === 'ready' || stateLib.gameHours(st) >= ps.readyHour)) {
      ps.stage = 'ready';
      ps.promptShown = true;
      app.siegePrompt = { siteId: ps.siteId, mode: 'ready' };
      return;
    }
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
    drawFactionTint(ctx, app, cam, box, w);
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
    drawSiegeStatus(ctx, app, box, w);
    drawFreeHint(ctx, app, box, w);
    drawSiegePrompt(ctx, app, box, w);
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
    // 围城去留弹窗开着时，只认弹窗里的两个按钮；点外面不误操作地图
    if (app.siegePrompt) return;
    const box = mapBox(app);
    if (y < TOP_H || y > TOP_H + box.h) return;

    const st = app.state;

    // 野地扎营：地图上时辰自己在走，点任意处按住，给出继续/拔营的选择。
    if (st.campFlow) {
      st.campFlow = false;
      app.push('camp', { pause: true, reason: '你在大地图上按住了时辰。' });
      return;
    }

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

    // 城下扎营时，点围着的城=看围营进度；点别处=先问一句继续围还是拔营
    const siegeSite = st.playerSiege ? siteById(st.world, st.playerSiege.siteId) : null;
    if (siegeSite) {
      if (site && site.id === siegeSite.id) {
        st.player.atSiteId = siegeSite.id;
        app.push('town', { siteId: siegeSite.id, view: 'siege' });
      } else {
        app.siegePrompt = {
          siteId: siegeSite.id,
          x: x,
          y: y,
          mode: (st.playerSiege.stage === 'ready' ||
            stateLib.gameHours(st) >= st.playerSiege.readyHour) ? 'ready' : 'leave',
        };
      }
      return;
    }

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
                // 扎营后不跳围城页：留在大地图看时辰流动，围满再点城下营寨
                app.showToast('城下扎营：需围 ' + r.days + ' 天，围成后才能决战。', 3);
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

/** 山峰高度用坐标散列，逐帧绘制也不会闪 */
function peakHash(a, b, c) {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * 桥面朝向：看河道往哪边流，桥就该横着跨过去。
 * 河左右是水 -> 桥竖着；河上下是水 -> 桥横着。
 */
function bridgeRenderDir(world, x, y, fallback) {
  function wet(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return false;
    const t = world.tiles[ty * world.w + tx];
    return t === 'river' || t === 'bridge';
  }
  const L = wet(x - 1, y);
  const R = wet(x + 1, y);
  const U = wet(x, y - 1);
  const D = wet(x, y + 1);
  if (L && R && !U && !D) return 'v';
  if (U && D && !L && !R) return 'h';
  if (L && R) return 'v';
  if (U && D) return 'h';
  return fallback || 'h';
}

/**
 * 连绵山脉：一条折线刷成有厚度的山带，再沿脊线补一排错落的峰尖。
 * 远看是一条山系，近看能看见背光面、亮脊和北线的雪帽。
 */
function drawMountainRange(ctx, line, raw, toX, toY, w, box, index, snow, app) {
  const baseW = Math.max(TS * 2.35, 20);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 极淡的山麓底带：只负责把山脚和草地过渡开，不再用一条实心灰带盖住地表
  ctx.strokeStyle = 'rgba(62,57,47,0.08)';
  ctx.lineWidth = baseW * 1.30;
  strokePolyline(ctx, line, toX, toY);

  ctx.strokeStyle = 'rgba(99,91,75,0.14)';
  ctx.lineWidth = baseW * 1.02;
  strokePolyline(ctx, line, toX, toY);

  ctx.strokeStyle = 'rgba(85,79,66,0.20)';
  ctx.lineWidth = baseW * 0.70;
  strokePolyline(ctx, line, toX, toY);

  // 背光面：往下错开一点，做出厚度
  ctx.save();
  ctx.translate(0, TS * 0.22);
  ctx.strokeStyle = 'rgba(47,42,35,0.18)';
  ctx.lineWidth = baseW * 0.52;
  strokePolyline(ctx, line, toX, toY);
  ctx.restore();

  // 亮脊：往上错开一点，和背光面形成坡面
  ctx.save();
  ctx.translate(0, -TS * 0.16);
  ctx.strokeStyle = 'rgba(151,141,121,0.22)';
  ctx.lineWidth = baseW * 0.13;
  strokePolyline(ctx, line, toX, toY);
  ctx.restore();

  // 大山块：沿山带错落铺开，撑出参差不齐的山体轮廓，而不是一条均匀的带子
  for (let i = 0; i < line.length - 1; i++) {
    const ax = toX(line[i][0]);
    const ay = toY(line[i][1]);
    const bx = toX(line[i + 1][0]);
    const by = toY(line[i + 1][1]);
    const dx = bx - ax;
    const dy = by - ay;
    const segPx = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / segPx;
    const ny = dx / segPx;
    const step = Math.max(18, TS * 0.95);
    const count = Math.max(1, Math.floor(segPx / step));
    for (let k = 0; k <= count; k++) {
      const t = count ? k / count : 0.5;
      const px0 = ax + dx * t;
      const py0 = ay + dy * t;
      for (let lane = -1; lane <= 1; lane++) {
        const h1 = peakHash(i + 31, k + lane * 7, index + lane);
        const h2 = peakHash(k, i + lane * 11, index + 9);
        const side = lane * TS * (0.56 + h1 * 0.16);
        const bx0 = px0 + nx * side + (h1 - 0.5) * TS * 0.32;
        const by0 = py0 + ny * side + TS * 0.30;
        const hw = TS * (0.34 + h1 * 0.22);
        const hh = TS * (0.56 + h2 * 0.58);
        // 暗面山体
        ctx.fillStyle = 'rgba(53,48,40,0.64)';
        ctx.beginPath();
        ctx.moveTo(bx0 - hw, by0);
        ctx.lineTo(bx0 - hw * 0.22, by0 - hh);
        ctx.lineTo(bx0 + hw * 0.35, by0);
        ctx.closePath();
        ctx.fill();
        // 受光坡面
        ctx.fillStyle = 'rgba(125,116,98,0.62)';
        ctx.beginPath();
        ctx.moveTo(bx0 - hw * 0.22, by0 - hh);
        ctx.lineTo(bx0 + hw, by0);
        ctx.lineTo(bx0 + hw * 0.35, by0);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // 锯齿岭线：沿折线插值出一排高低错落的脊点，远看也有连绵的轮廓
  function ridgePath(yOff, amp, seed) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < line.length - 1; i++) {
      const ax = toX(line[i][0]);
      const ay = toY(line[i][1]);
      const bx = toX(line[i + 1][0]);
      const by = toY(line[i + 1][1]);
      const segPx = Math.max(1, Math.hypot(bx - ax, by - ay));
      const count = Math.max(2, Math.min(34, Math.floor(segPx / Math.max(8, TS * 0.38))));
      for (let k = 0; k <= count; k++) {
        const t = k / count;
        const px0 = ax + (bx - ax) * t;
        const py0 = ay + (by - ay) * t + yOff;
        const h = peakHash(i + seed, k, seed + 3);
        const yy = py0 - (k === 0 || k === count ? amp * 0.55 : amp * (0.32 + h * 0.9));
        if (!started) {
          ctx.moveTo(px0, yy);
          started = true;
        } else {
          ctx.lineTo(px0, yy);
        }
      }
    }
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(2, TS * 0.13);
  ctx.strokeStyle = 'rgba(42,37,31,0.64)';
  ridgePath(-TS * 0.18, TS * 0.62, index);
  ctx.lineWidth = Math.max(1, TS * 0.055);
  ctx.strokeStyle = 'rgba(173,162,140,0.52)';
  ridgePath(-TS * 0.24, TS * 0.56, index + 11);

  // 沿山脊撒峰尖：中心脊线 + 左右两条副脊，让山带内部也有层层叠叠的峰
  for (let i = 0; i < line.length - 1; i++) {
    const ax = toX(line[i][0]);
    const ay = toY(line[i][1]);
    const bx = toX(line[i + 1][0]);
    const by = toY(line[i + 1][1]);
    const dx = bx - ax;
    const dy = by - ay;
    const segPx = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / segPx;
    const ny = dx / segPx;
    const count = Math.max(2, Math.min(12, Math.floor(segPx / Math.max(9, TS * 0.68))));
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const px0 = ax + dx * t;
      const py0 = ay + dy * t;
      if (px0 < -TS * 3 || px0 > w + TS * 3 || py0 < box.top - TS * 3 || py0 > box.top + box.h + TS * 3) continue;
      for (let lane = -1; lane <= 1; lane++) {
        const h1 = peakHash(i + lane * 3, k, index);
        const h2 = peakHash(k, index, i + 7 + lane * 5);
        const side = lane * TS * (0.38 + h1 * 0.12);
        const hw = TS * (0.13 + h1 * 0.11);
        const hh = TS * (0.36 + h2 * 0.58) * (lane === 0 ? 1.15 : 0.9);
        const bx0 = px0 + nx * side + (h1 - 0.5) * TS * 0.16;
        const by0 = py0 + ny * side + TS * 0.20;
        // 暗面
        ctx.fillStyle = 'rgba(68,62,51,0.84)';
        ctx.beginPath();
        ctx.moveTo(bx0 - hw, by0);
        ctx.lineTo(bx0, by0 - hh);
        ctx.lineTo(bx0 + hw, by0);
        ctx.closePath();
        ctx.fill();
        // 亮面
        ctx.fillStyle = 'rgba(139,128,108,0.76)';
        ctx.beginPath();
        ctx.moveTo(bx0, by0 - hh);
        ctx.lineTo(bx0 + hw, by0);
        ctx.lineTo(bx0 + hw * 0.18, by0);
        ctx.closePath();
        ctx.fill();
        // 北线雪帽
        if (snow && hh > TS * 0.52) {
          ctx.fillStyle = 'rgba(229,225,213,0.72)';
          ctx.beginPath();
          ctx.moveTo(bx0 - hw * 0.34, by0 - hh + TS * 0.12);
          ctx.lineTo(bx0, by0 - hh);
          ctx.lineTo(bx0 + hw * 0.34, by0 - hh + TS * 0.12);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
}

/** 桥：木面、石墩、栏杆；横跨河道，和道路走向对齐 */
function drawBridges(ctx, world, toX, toY, w, box, app) {
  const marks = world.bridges || [];
  const z = app.mapZoom || 1;
  for (let i = 0; i < marks.length; i++) {
    const b = marks[i];
    const stepX = b.dir === 'h' ? 1 : 0;
    const stepY = b.dir === 'h' ? 0 : 1;
    function markAt(wx, wy) {
      for (let m = 0; m < marks.length; m++) {
        if (marks[m].x === wx && marks[m].y === wy) return marks[m];
      }
      return null;
    }
    // 连续桥格只画一座桥，避免一格一块木板叠成一大片
    if (markAt(b.x - stepX, b.y - stepY)) continue;
    let runLen = 1;
    while (runLen < 7) {
      const nx = b.x + stepX * runLen;
      const ny = b.y + stepY * runLen;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) break;
      if (world.tiles[ny * world.w + nx] !== 'bridge') break;
      if (!markAt(nx, ny)) break;
      runLen++;
    }
    const cx = b.x + stepX * (runLen - 1) * 0.5;
    const cy = b.y + stepY * (runLen - 1) * 0.5;
    const sx = toX(cx + 0.5);
    const sy = toY(cy + 0.5);
    if (sx < -TS * 3 || sx > w + TS * 3 || sy < box.top - TS * 3 || sy > box.top + box.h + TS * 3) continue;
    // 桥面要横跨河道，不能顺着河道铺成一条长木板
    const drawDir = bridgeRenderDir(world, Math.round(cx), Math.round(cy), b.dir);
    const crossX = drawDir === 'h' ? 1 : 0;
    const crossY = drawDir === 'h' ? 0 : 1;
    let span = 1;
    for (let side = -1; side <= 1; side += 2) {
      for (let n = 1; n <= 8; n++) {
        const tx = Math.round(cx) + crossX * n * side;
        const ty = Math.round(cy) + crossY * n * side;
        if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) break;
        const t = world.tiles[ty * world.w + tx];
        if (t === 'river' || t === 'bridge') span++;
        else break;
      }
    }
    span = Math.min(span, 8);
    const len = Math.max(TS * 0.92, span * TS * 0.5 + TS * 0.18);
    const halfW = Math.max(3, TS * 0.22);
    const rail = Math.max(2, TS * 0.018);
    ctx.save();
    ctx.translate(sx, sy);
    if (drawDir === 'v') ctx.rotate(Math.PI / 2);
    // 桥下阴影
    ctx.fillStyle = 'rgba(12,10,8,0.34)';
    ctx.fillRect(-len - 4, halfW - 2, len * 2 + 8, Math.max(6, TS * 0.10));
    // 桥面
    ctx.fillStyle = '#9a7448';
    ctx.fillRect(-len, -halfW, len * 2, halfW * 2);
    ctx.fillStyle = '#c49a63';
    ctx.fillRect(-len, -halfW, len * 2, Math.max(2, TS * 0.025));
    ctx.fillStyle = '#644a2e';
    ctx.fillRect(-len, halfW - Math.max(2, TS * 0.025), len * 2, Math.max(2, TS * 0.025));
    // 木板
    const planks = Math.max(4, Math.round(len / Math.max(5, TS * 0.13)));
    for (let p = 1; p < planks; p++) {
      const x = -len + (len * 2 * p) / planks;
      ctx.fillStyle = 'rgba(72,51,32,0.55)';
      ctx.fillRect(x, -halfW, Math.max(1, TS * 0.008), halfW * 2);
    }
    // 栏杆
    ctx.fillStyle = '#5b4329';
    ctx.fillRect(-len, -halfW - rail * 1.6, len * 2, rail);
    ctx.fillRect(-len, halfW + rail * 0.6, len * 2, rail);
    for (let p = 0; p <= 4; p++) {
      const x = -len + (len * 2 * p) / 4;
      ctx.fillRect(x, -halfW - rail * 2, Math.max(1.5, rail), halfW + rail * 2.5);
    }
    // 两岸石墩
    ctx.fillStyle = 'rgba(118,108,92,0.92)';
    ctx.fillRect(-len - 5, -halfW - rail * 2, Math.max(4, TS * 0.06), halfW * 2 + rail * 4);
    ctx.fillRect(len + 1, -halfW - rail * 2, Math.max(4, TS * 0.06), halfW * 2 + rail * 4);
    ctx.restore();
  }
}

/** 山口：在宽山带上开一道浅色缺口，并立一座石门，让人一眼看出能走 */
function drawPassMarks(ctx, world, cam, box, w, toX, toY, app) {
  const z = app.mapZoom || 1;
  if (z < 0.32) return;
  const startX = Math.max(0, Math.floor(cam.x / TS));
  const startY = Math.max(0, Math.floor(cam.y / TS));
  const endX = Math.min(world.w - 1, Math.ceil((cam.x + w) / TS));
  const endY = Math.min(world.h - 1, Math.ceil((cam.y + box.h) / TS));
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (world.tiles[y * world.w + x] !== 'pass') continue;
      const sx = toX(x + 0.5);
      const sy = toY(y + 0.5);
      const rw = TS * 0.34;
      const rh = TS * 0.52;
      // 缺口：用偏暖的土色把山带压掉，形成垭口
      ctx.fillStyle = 'rgba(181,169,145,0.70)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, rw * 1.25, rh * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(109,90,66,0.78)';
      ctx.fillRect(sx - rw * 0.85, sy - rh * 0.2, rw * 0.28, rh * 1.6);
      ctx.fillRect(sx + rw * 0.58, sy - rh * 0.2, rw * 0.28, rh * 1.6);
      ctx.fillRect(sx - rw * 0.95, sy - rh * 0.48, rw * 1.9, rh * 0.16);
    }
  }
}

function drawGeography(ctx, app, cam, box, w) {
  const world = app.state.world;
  const phase = app.mapPhase || 0;
  const z = app.mapZoom || 1;
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
  ctx.lineWidth = Math.max(7, TS * 0.18);
  strokePolyline(ctx, coast, toX, toY);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(2, TS * 0.045);
  strokePolyline(ctx, coast, toX, toY);

  // 山脉先铺厚，再让河流从山里切出谷地
  MOUNTAINS.forEach(function (raw, index) {
    const line = sc(raw);
    const snow = raw[0][1] < 12 || raw[raw.length - 1][1] < 12;
    drawMountainRange(ctx, line, raw, toX, toY, w, box, index, snow, app);
  });

  // 山口压在山上，给道路留出可读的通道
  drawPassMarks(ctx, world, cam, box, w, toX, toY, app);

  // 河流：暗岸 + 水体 + 高光 + 流动的水纹
  [[sc(RIVER_HUANG), 0.72], [sc(RIVER_YANG), 0.85], [sc(RIVER_HUAI), 0.55],
    [sc(RIVER_WEI), 0.46], [sc(RIVER_HAN), 0.52]].forEach(function (r) {
    const width = TS * r[1];
    ctx.strokeStyle = 'rgba(30,58,84,0.38)';
    ctx.lineWidth = width + Math.max(3, TS * 0.06);
    strokePolyline(ctx, r[0], toX, toY);
    ctx.strokeStyle = '#3d6f97';
    ctx.lineWidth = width;
    strokePolyline(ctx, r[0], toX, toY);
    // 缓慢往东流的水纹：虚线偏移动画
    ctx.save();
    ctx.setLineDash([Math.max(3, width * 0.22), Math.max(6, width * 0.48)]);
    ctx.lineDashOffset = -phase * Math.max(4, width * 0.28);
    ctx.strokeStyle = 'rgba(168,211,235,0.44)';
    ctx.lineWidth = Math.max(1.6, width * 0.10);
    strokePolyline(ctx, r[0], toX, toY);
    ctx.restore();
    ctx.strokeStyle = 'rgba(190,226,244,0.38)';
    ctx.lineWidth = Math.max(1.5, width * 0.12);
    strokePolyline(ctx, r[0], toX, toY);
  });

  // 桥架在河上，随后道路从桥面穿过去
  drawBridges(ctx, world, toX, toY, w, box, app);

  // 道路：深色描边压暗地形，再上一道浅土黄；近景时跟着缩放加宽
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
  ctx.lineWidth = Math.max(7, 8 * Math.min(2, z));
  ROADS.forEach(roadSeg);
  ctx.strokeStyle = '#b39a72';
  ctx.lineWidth = Math.max(4, 5 * Math.min(2, z));
  ROADS.forEach(roadSeg);
  ctx.strokeStyle = 'rgba(214,196,158,0.5)';
  ctx.lineWidth = Math.max(1.6, 1.6 * Math.min(2, z));
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

/**
 * 拉远到能看见整张天下时，铺一层势力领地色。
 * 缩放 0.2 左右正是看“三国乱战”的档位；城池一换旗，territory 的签名缓存就失效。
 */
function drawFactionTint(ctx, app, cam, box, w) {
  if ((app.mapZoom || 1) > 0.27) return;
  const st = app.state;
  const world = st.world;
  const grid = territory.buildFactionGrid(world);
  const startX = Math.max(0, Math.floor(cam.x / TS));
  const startY = Math.max(0, Math.floor(cam.y / TS));
  const endX = Math.min(world.w - 1, Math.ceil((cam.x + w) / TS));
  const endY = Math.min(world.h - 1, Math.ceil((cam.y + box.h) / TS));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();
  ctx.globalAlpha = 0.38;
  let lastColor = '';
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const fac = grid[y * world.w + x];
      const def = fac ? FACTIONS[fac] : null;
      if (!def) continue;
      if (def.color !== lastColor) {
        ctx.fillStyle = def.color;
        lastColor = def.color;
      }
      const sx = x * TS - cam.x;
      const sy = box.top + y * TS - cam.y;
      ctx.fillRect(sx, sy, Math.ceil(TS) + 1, Math.ceil(TS) + 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSites(ctx, app, cam, box, w) {
  const st = app.state;
  const assets = app.assets;
  const z = app.mapZoom || 1;
  const uiScale = Math.min(2.2, Math.max(1, z));
  const lowZoom = z < 0.45;
  const lowZoomLabels = [];

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

    // 拉远看整张天下时，城池收成势力色小点；城与关隘的名字照样留在图上
    if (lowZoom) {
      const col = site.playerOwned ? playerColor
        : site.playerBlocked ? '#b4463c'
          : site.ownerFaction && FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].color : '#7a7266';
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
      if (site.type === 'town' || site.type === 'castle') {
        lowZoomLabels.push({
          site: site,
          sx: sx + TS / 2,
          sy: sy + TS / 2,
          color: site.playerOwned ? playerColor : '#ffe9c4',
          cap: isCapital,
        });
      }
      return;
    }

    const sprite = assets.site[site.type] || assets.site.village;
    ctx.drawImage(sprite, sx + 4, sy + 4, TS - 8, TS - 8);

    const fw = 12 * uiScale;
    const fh = 14 * uiScale;
    const fx = sx + TS - fw - 4;
    const fy = sy + 4;
    // 势力旗：无主城围攻失败后，城头插一面“仇”字赤旗，和敌对城一个待遇
    if (site.playerBlocked && !site.ownerFaction) {
      ctx.fillStyle = '#b4463c';
      ctx.fillRect(fx, fy, fw, fh);
      ctx.fillStyle = 'rgba(255,235,210,0.8)';
      ctx.fillRect(fx, fy, fw, 2);
      text(ctx, '仇', fx + fw / 2, fy + 2, { size: Math.round(13 * uiScale), align: 'center', color: '#fff' });
    } else if (site.ownerFaction) {
      const col = FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].color : '#8f8f86';
      ctx.fillStyle = col;
      ctx.fillRect(fx, fy, fw, fh);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(fx, fy, fw, 2);
      text(ctx, FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].banner : '?', fx + fw / 2, fy + 2, {
        size: Math.round(13 * uiScale), align: 'center', color: '#fff',
      });
    } else {
      ctx.fillStyle = '#6a655c';
      ctx.fillRect(fx, fy, fw, fh);
    }

    // 围城标记：城下营寨连成圈，远远就看得见
    if (siege) {
      ctx.fillStyle = mySiege ? 'rgba(120,82,18,0.94)' : 'rgba(120,32,18,0.92)';
      ctx.fillRect(sx + 4, sy + 4, 30 * uiScale, 20 * uiScale);
      text(ctx, mySiege ? '我围' : '围城', sx + 19 * uiScale, sy + 6, { size: Math.round(13 * uiScale), align: 'center', color: '#ffe0a8' });
    }

    // 名牌
    const isTown = site.type === 'town';
    const isCastle = site.type === 'castle';
    const size = (isCapital ? 27 : isTown ? 22 : isCastle ? 19 : 16) * Math.min(1.85, uiScale);
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
      color: site.playerOwned ? playerColor : site.playerBlocked ? '#e0a090'
        : isTown ? '#f2e7cd' : isCastle ? '#ded2b6' : '#b9ad92',
      shadow: true,
    });
  });

  // 极小缩放：城与关隘的名字都单独画在外圈。能避让就避让，避不开也至少保留名字，
  // 免得整张天下缩下去以后只剩一堆无名点。
  if (lowZoom && lowZoomLabels.length) {
    const placed = [];
    // 国都先排，再排一般城与关隘
    lowZoomLabels.sort(function (a, b) { return (b.cap ? 1 : 0) - (a.cap ? 1 : 0); });
    lowZoomLabels.forEach(function (l) {
      const name = l.site.name;
      // 缩到整张天下时，城名至少保留到能认出字的尺寸；宁可略挤，也不让名字变成黑点
      const fs = l.cap ? 20 : 15;
      ctx.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(name).width;
      const boxH = fs + 4;
      const candidates = [
        { x: l.sx - tw / 2, y: l.sy + 6 },
        { x: l.sx - tw / 2, y: l.sy - boxH - 6 },
        { x: l.sx + 6, y: l.sy - boxH / 2 },
        { x: l.sx - tw - 6, y: l.sy - boxH / 2 },
        { x: l.sx - tw / 2, y: l.sy + boxH + 8 },
        { x: l.sx - tw / 2, y: l.sy - boxH * 2 - 8 },
      ];
      let spot = null;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (!placed.some(function (r) {
          return c.x < r.x + r.w && c.x + tw + 6 > r.x && c.y < r.y + r.h && c.y + boxH > r.y;
        })) { spot = c; break; }
      }
      if (!spot) spot = candidates[0];
      placed.push({ x: spot.x, y: spot.y, w: tw + 6, h: boxH });
      ctx.fillStyle = 'rgba(8,6,4,0.86)';
      ctx.fillRect(spot.x, spot.y, tw + 6, boxH);
      ctx.fillStyle = l.cap ? '#ffe0a8' : l.color;
      ctx.fillRect(spot.x, spot.y, 2, boxH);
      text(ctx, name, spot.x + 4, spot.y + 1, {
        size: fs, color: l.cap ? '#ffe9c4' : l.color,
      });
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
  const low = z < 0.40;
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

    if (p.engagedWith || p.scuffle > 0) {
      ctx.fillStyle = 'rgba(220,80,50,0.85)';
      ctx.fillRect(sx - 22 * z, sy - 58 * z, 44 * z, 16 * z);
      text(ctx, '交战中', sx, sy - 57 * z, { size: Math.round(12 * z), align: 'center', color: '#fff' });
    }
    if (p.scripted) {
      ctx.fillStyle = 'rgba(200,60,40,0.9)';
      ctx.fillRect(sx - 22 * z, sy - 76 * z, 44 * z, 16 * z);
      text(ctx, '追兵', sx, sy - 75 * z, { size: Math.round(13 * z), align: 'center', color: '#fff' });
    }
  });

  // 领主
  st.lords.forEach(function (lord) {
    if (!lord.alive || lord.inCity) return;
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
    if (z >= 0.4) {
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

    if (lord.engagedWith) {
      ctx.fillStyle = 'rgba(220,80,50,0.9)';
      ctx.fillRect(sx - 24 * z, sy - 58 * z, 48 * z, 16 * z);
      text(ctx, '交战中', sx, sy - 57 * z, {
        size: Math.round(12 * z), align: 'center', color: '#fff',
      });
    }
    if (lord.fleeing) {
      ctx.fillStyle = 'rgba(60,42,18,0.88)';
      ctx.fillRect(sx - 20 * z, sy - 57 * z, 40 * z, 16 * z);
      text(ctx, '逃遁', sx, sy - 56 * z, {
        size: Math.round(12 * z), align: 'center', color: '#ffd18a',
      });
    } else if (lord.chasing) {
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
  let topLine = '第 ' + st.clock.day + ' 天 ' + pad(hour) + ' 时';
  let topColor = '#c9bda2';
  // 统一之后，左上角一直挂着那场还没来的大旱
  if (st.arc && st.arc.phase === 'celebration') {
    const leftDays = Math.max(0, (st.arc.disasterDay || st.clock.day) - st.clock.day);
    topLine += ' · 距大旱 ' + leftDays + ' 天';
    if (leftDays <= 5) topColor = '#e06a52';
  } else if (st.arc && st.arc.phase === 'reconquest') {
    const loyal = (st.arc.loyalLords || []).length;
    topLine += ' · 与天下为敌 · 旧部 ' + loyal;
    topColor = '#e06a52';
  }
  text(ctx, topLine, 16, 12, { size: st.arc ? 16 : 20, color: topColor });

  const fac = p.faction
    ? (p.faction === 'player'
      ? (p.country && p.country.name ? p.country.name + '国' : '你的旗')
      : (FACTIONS[p.faction] ? FACTIONS[p.faction].full : p.faction))
    : '无主';
  const title = stateLib.renownTitle(p.renown);
  // 声望到哪一档，左上角就换哪一档的称呼；“无名溃兵”只属于开局
  text(ctx, title, 16, 40, { size: 24, color: '#f0c060' });
  text(ctx, '· ' + p.name + ' · ' + fac, 180, 44, { size: 18, color: '#a2947a' });

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
    { k: '天机简', v: p.shi, c: '#b98fd8' },
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

/** 地图上的围营卡：不打开城页也能看到第几天、还差几个时辰 */
function drawSiegeStatus(ctx, app, box, w) {
  const st = app.state;
  const ps = st && st.playerSiege;
  if (!ps || app.siegePrompt) return;
  const site = siteById(st.world, ps.siteId);
  if (!site) return;
  const now = stateLib.gameHours(st);
  const left = Math.max(0, ps.readyHour - now);
  const ready = ps.stage === 'ready' || left <= 0;
  const day = Math.min(ps.days, Math.floor(Math.max(0, now - ps.startHour) / 24) + 1);
  const pw = Math.min(520, w - 20);
  const ph = 82;
  const x = 10;
  const y = box.top + 136;
  const ratio = Math.max(0, Math.min(1, 1 - left / (ps.days * 24)));

  ctx.fillStyle = 'rgba(10,8,6,0.88)';
  ctx.fillRect(x, y, pw, ph);
  ctx.fillStyle = ready ? '#8fbf7a' : '#d9a441';
  ctx.fillRect(x, y, 4, ph);
  text(ctx, '围城 · ' + site.name, x + 16, y + 6, { size: 20, color: '#f0c060' });
  text(ctx, ready ? '已围成 · 点这里决战' : '第 ' + day + ' / ' + ps.days + ' 天 · 还需 ' + Math.ceil(left) + ' 时辰',
    x + 16, y + 30, { size: 15, color: ready ? '#8fbf7a' : '#c9bda2' });
  text(ctx, '时辰在大地图上流动', x + pw - 12, y + 8, {
    size: 12, align: 'right', color: '#8a8070',
  });
  bar(ctx, x + 16, y + 54, pw - 32, 10, ratio, ready ? '#8fbf7a' : '#c97a42');
  app.ui.rect('siege_status', x, y, pw, ph, function () {
    st.player.atSiteId = site.id;
    app.push('town', { siteId: site.id, view: 'siege' });
  });
}

/** 围城选择框：围满时自动弹出，也可以点别处主动唤出。
 * 弹窗开着时 update() 不推进 state 时间，世界完全停住。 */
function drawSiegePrompt(ctx, app, box, w) {
  const sp = app.siegePrompt;
  if (!sp) return;
  const st = app.state;
  const site = siteById(st.world, sp.siteId);
  if (!site) { app.siegePrompt = null; return; }
  const ps = st.playerSiege;
  const ready = sp.mode === 'ready' || !!(ps && (ps.stage === 'ready' || stateLib.gameHours(st) >= ps.readyHour));

  ctx.fillStyle = 'rgba(6,4,3,0.78)';
  ctx.fillRect(0, 0, w, app.runtime.height);
  // 弹窗开着时，只让弹窗的两个按钮接点击；后面的地图按钮全部作废。
  // 注意不能每帧清 app.ui.pressed：真机手指按住按钮会跨好几帧，清掉后
  // touchend 找不到按下项，两个按钮就会像“卡死”一样没反应。
  app.ui.items.length = 0;
  const pw = Math.min(620, w - 36);
  const ph = 340;
  const x = (w - pw) / 2;
  const y = box.top + Math.max(48, (box.h - ph) / 2);
  panel(ctx, x, y, pw, ph, { fill: '#241c14', shadow: true });

  text(ctx, ready ? '城下 · 围城已成' : '还在围' + site.name,
    x + 26, y + 22, { size: 30, color: ready ? '#f0c060' : '#f0c060' });
  const lines = ready
    ? ['围城的时辰到了。城头的白旗已经挂出来，城门就在眼前。',
      '现在带人攻城，还是拔营离开，去围下一座？']
    : ['城下营寨已经扎好，围城时辰还在走。',
      '要留在这里继续围，还是拔营去别处？'];
  lines.forEach(function (ln, i) {
    text(ctx, ln, x + 26, y + 72 + i * 26, { size: 18, color: '#efe3c6' });
  });
  text(ctx, ready ? '攻城一旦开始，就没有回头路。' : '拔营后，之前围掉的时辰就白费了。',
    x + 26, y + 138, { size: 15, color: '#a2947a' });

  const bw = (pw - 52 - 14) / 2;
  if (ready) {
    app.ui.button(ctx, x + 26, y + 188, bw, 82, '进攻城池', {
      id: 'siege_prompt_attack', size: 25, fill: '#6a3a22', onTap: function () {
        const battle = stateLib.startSiege(st, site);
        if (!battle) {
          app.showToast('城头还没乱到能攻的地步。', 2.4);
          return;
        }
        app.siegePrompt = null;
        app.push('battle', { mode: 'siege' });
      },
    });
  } else {
    app.ui.button(ctx, x + 26, y + 188, bw, 82, '继续围城', {
      id: 'siege_prompt_keep', size: 24, fill: '#33271b', onTap: function () {
        app.siegePrompt = null;
      },
    });
  }
  app.ui.button(ctx, x + 26 + bw + 14, y + 188, bw, 82, '拔营离开', {
    id: 'siege_prompt_leave', size: 24, fill: '#4a241c', onTap: function () {
      const r = stateLib.cancelPlayerSiege(st);
      app.siegePrompt = null;
      app.showToast(r.msg || '已拔营离开。', 2.4);
    },
  });
  text(ctx, ready ? '选择期间，时辰暂停' : '围城计时只在大地图上流动',
    x + pw / 2, y + ph - 40, { size: 14, align: 'center', color: '#8a8070' });
}

function drawBottom(ctx, app, w, box) {
  const y0 = box.top + box.h;
  ctx.fillStyle = '#171310';
  ctx.fillRect(0, y0, w, BOT_H);
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(0, y0, w, 3);

  function leaveCampFlow() {
    if (app.state) app.state.campFlow = false;
  }
  const btns = [
    { id: 'army', label: '队伍', tap: function () { leaveCampFlow(); app.push('army'); } },
    { id: 'journal', label: '史册', tap: function () { leaveCampFlow(); app.push('journal'); } },
    // 扎营按钮不自己清 campFlow：CampScene 看到它还在，会直接弹出“继续/拔营”。
    { id: 'camp', label: '扎营', tap: function () { app.push('camp'); } },
    { id: 'shop', label: '商店', tap: function () { leaveCampFlow(); app.push('shop'); } },
    { id: 'menu', label: '菜单', tap: function () { leaveCampFlow(); app.push('menu'); } },
  ];
  const gap = 8;
  const bw = (w - 20 - gap * 4) / 5;
  btns.forEach(function (b, i) {
    app.ui.button(ctx, 10 + i * (bw + gap), y0 + 14, bw, 76, b.label, {
      id: b.id, size: 24, onTap: b.tap,
    });
  });

  const st = app.state;
  const p = st.player;
  const wars = stateLib.factionWars(st);
  const warTxt = wars.length ? ' · 天下 ' + wars.length + ' 处交兵' : ' · 四境暂无大战';
  const siegeNow = st.playerSiege ? siteById(st.world, st.playerSiege.siteId) : null;
  const hint = (siegeNow
    ? '围城中 · ' + siegeNow.name + ' · 点城下营寨看进度 · 点别处决定去留'
    : (p.route && p.route.length
      ? '行军第 ' + (st.player.route.length - (st.player.route.length - 1)) + ' 段 · 点地图可改道'
      : (st.player.atSiteId ? '在' + (siteById(st.world, st.player.atSiteId) || {}).name + ' · 点地图出发' : '点地图行军 · 双指缩放 · 拖动平移')))
    + warTxt;
  text(ctx, hint, w / 2, y0 + 104, { size: 16, align: 'center', color: '#8a8070' });
}

module.exports = MapScene;
