/**
 * 大地图场景：三国全图、区域风景、玩家骑马立绘、城池名牌、行军
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const pixel = require('../render/pixel.js');
const { UI_COLORS } = pixel;
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { regionAt, regionDef, siteById, siteAt, terrainAt, bridgeHasWater } = require('../core/world.js');
const territory = require('../core/territory.js');
const { FACTIONS, TERRAIN, CAMPAIGN, COAST, RIVER_HUANG, RIVER_YANG, RIVER_HUAI, RIVER_WEI, RIVER_HAN, MOUNTAINS, ROADS, BASE_W, CAPITAL_IDS, STRATEGIC_SITES } = require('../data/china.js');
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

/** 当前势力君主：兼容开局静态君主表、动态继任与君主 rank 三种来源 */
function isKingLord(st, lord) {
  if (!st || !lord || !lord.faction) return false;
  if (lord.faction === 'player' || lord.faction === 'bandit') return false;
  if (lord.rank === 'king') return true;
  const fs = st.factionState && st.factionState[lord.faction];
  if (fs) {
    if (fs.rulerId) return fs.rulerId === lord.id;
    if (fs.rulerName) return fs.rulerName === lord.name;
  }
  const def = FACTIONS[lord.faction];
  if (def && (def.lord === lord.name || def.full === lord.name)) return true;
  return stateLib.lordRank(lord) === 'king';
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
    app.mapIdleRest = false;
    if (app.questTrackCollapsed === undefined) {
      app.questTrackCollapsed = !!(app.state && app.state.settings && app.state.settings.questTrackCollapsed);
    }
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
    // 左下角“暂停休整”按下去以后，整张天下的时辰都冻住。
    if (app.mapTimePaused) {
      ensureCam(app);
      return;
    }
    stateLib.update(st, dt, { idleTime: !!app.mapIdleRest });
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
    drawEdgeFog(ctx, app, cam, box, w);
    drawQuestMarkers(ctx, app, cam, box, w);
    drawRoute(ctx, app, cam, box);
    drawEdgeGuide(ctx, app, cam, box, w);
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
    // 左下角暂停着时，地图只给看，不给走；必须先点“继续时辰”。
    if (app.mapTimePaused) {
      app.showToast('时辰已暂停，点左下角“继续时辰”再行军。', 2);
      return;
    }
    const box = mapBox(app);
    if (y < TOP_H || y > TOP_H + box.h) return;

    const st = app.state;

    // 野地扎营：地图上时辰自己在走，点任意处按住，给出继续/拔营的选择。
    if (st.campFlow) {
      st.campFlow = false;
      app.push('camp', { pause: true, reason: '你在大地图上按住了时辰。' });
      return;
    }

    // 在城里歇着的时候出来看地图：点一下地图就自动收拾行装离开，不再回城点“离城”。
    // 和骑砍一样，休息完第一下点地图=离城，后面的点才是重新指路。
    if (app.restView) {
      app.follow = null;
      app.restView = null;
      if (app.state.player.resting) stateLib.stopRest(app.state);
      app.state.player.atSiteId = null;
      app.showToast('收拾行装，上路。', 2);
      // 不 return：这一下点击继续当作大地图目标，直接开始行军。
    }

    // 只要不是拖地图，点哪儿都算"重新指路"：先松开正在跟的人，
    // 否则走到半路、路一空又会自己拐回去追他，直到撞上为止。
    const wasFollowing = !!app.follow;
    app.follow = null;

    const tx = Math.floor((x + app.mapCam.x) / TS);
    const ty = Math.floor((y - TOP_H + app.mapCam.y) / TS);
    if (tx < 0 || ty < 0 || tx >= st.world.w || ty >= st.world.h) return;
    // 继续时辰后的“城外扎营”到此结束：只要真正点了地图（行军或入城），
    // 就回到原来的规则——人不动，时辰也停。
    app.mapIdleRest = false;

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
              app.push(site.specialEdge ? 'border' : 'town', { siteId: site.id });
              return;
            }
            app.push('battle', { mode: 'siege' });
          } else {
            app.showToast('这座城现在打不下来。');
          }
        } else {
          st.player.atSiteId = site.id;
          app.push(site.specialEdge ? 'border' : 'town', { siteId: site.id });
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

/** 桥：按同一处河道合并成一座宽桥，桥面从河心一直搭到两岸地面 */
function drawBridges(ctx, world, toX, toY, w, box, app) {
  // 只画真正落在水上的桥。旧档里有些桥记号是沿河道路被误判出来的，
  // 地形已经改成 bridge，画在草地上会像一块悬空木板；这里再按“脚下有水”筛一遍。
  const marks = (world.bridges || []).filter(function (m) {
    if (!m) return false;
    if (world.tiles[m.y * world.w + m.x] !== 'bridge') return false;
    // 用实际河岸判断桥的朝向，再查这座桥脚下是否真有水；
    // 单格河道的桥，记号方向可能和河道横竖相反，不能只看 m.dir。
    const dir = bridgeRenderDir(world, m.x, m.y, m.dir);
    return bridgeHasWater(world, m.x, m.y, dir);
  });
  if (!marks.length) return;
  const z = app.mapZoom || 1;
  const byKey = {};
  marks.forEach(function (m) { byKey[m.x + ',' + m.y] = m; });
  const used = {};
  for (let i = 0; i < marks.length; i++) {
    const b = marks[i];
    const bk = b.x + ',' + b.y;
    if (used[bk]) continue;
    // 同一处河道附近的桥格并成一座桥：只合并真正相邻的桥格。
    // 不按 dir 分组——同一条斜穿河道可能一格记 h、一格记 v，
    // 以前会拆成两座桥叠在一起，看起来像一块超宽木板。
    const cluster = [];
    const queue = [b];
    used[bk] = true;
    while (queue.length) {
      const cur = queue.shift();
      cluster.push(cur);
      for (let m = 0; m < marks.length; m++) {
        const q = marks[m];
        const qk = q.x + ',' + q.y;
        if (used[qk]) continue;
        if (Math.abs(q.x - cur.x) > 1 || Math.abs(q.y - cur.y) > 1) continue;
        used[qk] = true;
        queue.push(q);
      }
    }
    let minX = b.x, maxX = b.x, minY = b.y, maxY = b.y;
    cluster.forEach(function (q) {
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // 桥面横跨河道：找出这一簇真正跨过的水面宽度。
    // 朝向按桥簇本身的长轴决定。同一条斜穿河道的相邻桥格可能一格标 h、
    // 一格标 v，旧逻辑会拆成横竖两座桥叠在一起；合簇后按长轴只画一座。
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const drawDir = spanX > spanY ? 'h' : (spanY > spanX ? 'v' :
      bridgeRenderDir(world, Math.round(cx), Math.round(cy), b.dir));
    const crossX = drawDir === 'h' ? 1 : 0;
    const crossY = drawDir === 'h' ? 0 : 1;
    let wetMin = 0;
    let wetMax = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let n = 1; n <= 8; n++) {
        const tx = Math.round(cx) + crossX * n * side;
        const ty = Math.round(cy) + crossY * n * side;
        if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) break;
        const t = world.tiles[ty * world.w + tx];
        if (t === 'river' || t === 'bridge') {
          if (side < 0 && -n < wetMin) wetMin = -n;
          if (side > 0 && n > wetMax) wetMax = n;
        } else {
          break;
        }
      }
    }
    // 桥头不能算到“水面为止”：斜向河道常常一边宽一边窄，
    // 桥心按水面中点重新落位，桥头再额外压过半个桥宽，保证桥面边角也落到岸上。
    const perpExtent = drawDir === 'h' ? spanY : spanX;
    // 普通桥约 0.68 格宽；并排两道桥面也只到 1.0 格，不再出现 1.7 格的巨桥。
    const halfW = Math.max(TS * 0.32, Math.min(TS * 0.50, TS * 0.32 + perpExtent * TS * 0.11));
    const pad = 0.62 + halfW / TS;
    const startOff = wetMin - pad;
    const endOff = wetMax + pad;
    const midOff = (startOff + endOff) / 2;
    const len = Math.max(TS * 1.0, (endOff - startOff) * TS * 0.5);
    const rail = Math.max(2, TS * 0.022);
    const plankLine = Math.max(1, TS * 0.01);
    const sx = toX(cx + 0.5 + (drawDir === 'h' ? midOff : 0));
    const sy = toY(cy + 0.5 + (drawDir === 'v' ? midOff : 0));
    if (sx < -TS * 4 || sx > w + TS * 4 || sy < box.top - TS * 4 || sy > box.top + box.h + TS * 4) continue;

    ctx.save();
    ctx.translate(sx, sy);
    if (drawDir === 'v') ctx.rotate(Math.PI / 2);

    // 桥下阴影与两岸石基：先落地，再接桥面
    ctx.fillStyle = 'rgba(12,10,8,0.38)';
    ctx.fillRect(-len - 6, halfW - 2, len * 2 + 12, Math.max(7, TS * 0.12));
    ctx.fillStyle = 'rgba(106,96,80,0.95)';
    ctx.fillRect(-len - TS * 0.12, -halfW - rail * 2, Math.max(5, TS * 0.12), halfW * 2 + rail * 4);
    ctx.fillRect(len, -halfW - rail * 2, Math.max(5, TS * 0.12), halfW * 2 + rail * 4);

    // 桥面：加宽后不再像一条细木板
    ctx.fillStyle = '#987144';
    ctx.fillRect(-len, -halfW, len * 2, halfW * 2);
    const grad = ctx.createLinearGradient(0, -halfW, 0, halfW);
    grad.addColorStop(0, 'rgba(207,166,104,0.46)');
    grad.addColorStop(0.5, 'rgba(154,116,72,0.10)');
    grad.addColorStop(1, 'rgba(86,62,38,0.34)');
    ctx.fillStyle = grad;
    ctx.fillRect(-len, -halfW, len * 2, halfW * 2);
    ctx.fillStyle = '#d0a568';
    ctx.fillRect(-len, -halfW, len * 2, Math.max(2, TS * 0.035));
    ctx.fillStyle = '#5d432a';
    ctx.fillRect(-len, halfW - Math.max(2, TS * 0.035), len * 2, Math.max(2, TS * 0.035));

    // 木板缝：远景省略，近景才画，避免全图密密麻麻。
    if (z >= 0.5) {
      const planks = Math.max(5, Math.round(len / Math.max(7, TS * 0.16)));
      for (let p = 1; p < planks; p++) {
        const x = -len + (len * 2 * p) / planks;
        ctx.fillStyle = 'rgba(70,49,30,0.52)';
        ctx.fillRect(x, -halfW, plankLine, halfW * 2);
      }
    }
    // 栏杆与桥柱
    ctx.fillStyle = '#543b24';
    ctx.fillRect(-len, -halfW - rail * 1.8, len * 2, rail);
    ctx.fillRect(-len, halfW + rail * 0.7, len * 2, rail);
    if (z >= 0.42) {
      const posts = Math.max(4, Math.round(len / (TS * 0.42)));
      for (let p = 0; p <= posts; p++) {
        const x = -len + (len * 2 * p) / posts;
        ctx.fillRect(x, -halfW - rail * 2.3, Math.max(1.5, rail * 1.2), halfW + rail * 3);
      }
    }
    // 桥头石阶：明确落到岸上
    ctx.fillStyle = 'rgba(140,126,102,0.90)';
    ctx.fillRect(-len - TS * 0.16, -halfW * 0.82, TS * 0.16, halfW * 1.64);
    ctx.fillRect(len, -halfW * 0.82, TS * 0.16, halfW * 1.64);
    ctx.restore();
  }
}

/** 穿山峡谷：两侧是不规则的岩壁，中间只有一条踩出来的土路。
 *  这里刻意不画桥面、桥柱和成对的桥头石墩；谷口用碎石坡收边，
 *  横穿、竖穿和斜穿都按峡谷轴旋转绘制。 */
function drawCanyons(ctx, world, cam, box, w, toX, toY, app) {
  const z = app.mapZoom || 1;
  if (z < 0.24) return;
  let marks = world.canyons || [];
  if (!marks.length) {
    marks = [];
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        if (world.tiles[y * world.w + x] === 'pass') marks.push({ x: x, y: y, dir: 'h' });
      }
    }
  }
  if (!marks.length) return;
  const used = {};
  for (let i = 0; i < marks.length; i++) {
    const b = marks[i];
    const bk = b.x + ',' + b.y;
    if (used[bk]) continue;
    const cluster = [];
    const queue = [b];
    used[bk] = true;
    while (queue.length) {
      const cur = queue.shift();
      cluster.push(cur);
      for (let m = 0; m < marks.length; m++) {
        const q = marks[m];
        const qk = q.x + ',' + q.y;
        if (used[qk]) continue;
        // 只合并真正相连的谷道格，不再把两格外的两处山口拼成长桥。
        if (Math.abs(q.x - cur.x) > 1 || Math.abs(q.y - cur.y) > 1) continue;
        used[qk] = true;
        queue.push(q);
      }
    }
    let minX = b.x, maxX = b.x, minY = b.y, maxY = b.y;
    let diag = null;
    cluster.forEach(function (q) {
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
      if (q.dir === 'd1' || q.dir === 'd2') diag = q.dir;
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const sx = toX(cx + 0.5);
    const sy = toY(cy + 0.5);
    if (sx < -TS * 5 || sx > w + TS * 5 || sy < box.top - TS * 5 || sy > box.top + box.h + TS * 5) continue;

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const drawDir = diag || (spanY > spanX ? 'v' : 'h');
    const isDiag = drawDir === 'd1' || drawDir === 'd2';
    const alongExtent = isDiag ? Math.max(spanX, spanY) :
      (drawDir === 'h' ? spanX : spanY);
    const perpExtent = isDiag ? 0 : (drawDir === 'h' ? spanY : spanX);
    const runTiles = Math.max(1, alongExtent + 1 + (isDiag ? 0.30 : 0.2));
    const halfLen = Math.max(isDiag ? TS * 1.15 : TS * 0.95, (runTiles + 0.45) * TS * 0.5);
    // 峡谷不是桥：谷底只留一条窄土路，两侧岩壁做厚、做高，
    // 横看是山体被硬生生劈开的一道缝，而不是架在河上的木板。
    const floorW = TS * 0.23;
    const wallW = Math.max(TS * 0.56, TS * 0.74 - perpExtent * TS * 0.04);
    const outerHalf = floorW * 0.5 + wallW;
    const segs = Math.max(11, Math.round((halfLen * 2) / (TS * 0.22)));

    ctx.save();
    ctx.translate(sx, sy);
    if (drawDir === 'v') ctx.rotate(Math.PI / 2);
    else if (drawDir === 'd1') ctx.rotate(Math.PI / 4);
    else if (drawDir === 'd2') ctx.rotate(-Math.PI / 4);

    const topEdge = [];
    const bottomEdge = [];
    const floorTop = [];
    const floorBottom = [];
    for (let s = 0; s <= segs; s++) {
      const px = -halfLen + (halfLen * 2 * s) / segs;
      // 两端岩壁收薄，谷口向外散开；中间最厚，形成“两山夹一路”。
      const mouth = Math.min(1, Math.min(s, segs - s) / Math.max(2.4, segs * 0.16));
      const wallHere = wallW * (0.42 + 0.58 * mouth);
      const widen = 0.82 + peakHash(s, i, 61) * 0.26;
      const j1 = (peakHash(s, s + 3, 11) - 0.5) * TS * 0.34;
      const j2 = (peakHash(s + 5, s, 17) - 0.5) * TS * 0.34;
      topEdge.push({ x: px, y: -floorW * 0.5 - wallHere + j1 });
      bottomEdge.push({ x: px, y: floorW * 0.5 + wallHere + j2 });
      floorTop.push({ x: px, y: -floorW * 0.5 * widen + (peakHash(s + 9, s, 23) - 0.5) * TS * 0.075 });
      floorBottom.push({ x: px, y: floorW * 0.5 * widen + (peakHash(s, s + 9, 29) - 0.5) * TS * 0.075 });
    }
    function trace(points, reverse) {
      ctx.beginPath();
      if (!reverse) {
        points.forEach(function (pt, k) { if (k) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y); });
      } else {
        for (let k = points.length - 1; k >= 0; k--) ctx.lineTo(points[k].x, points[k].y);
      }
    }

    // 山体缺口：外缘不是平直矩形，而是一圈被山石咬开的暗色轮廓。
    ctx.beginPath();
    trace(topEdge, false);
    for (let k = bottomEdge.length - 1; k >= 0; k--) ctx.lineTo(bottomEdge[k].x, bottomEdge[k].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(37,34,29,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(23,20,16,0.32)';
    ctx.lineWidth = Math.max(3, TS * 0.09);
    ctx.stroke();

    // 两侧岩壁：灰褐岩层，不用木桥的暖棕色。
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      const outer = side < 0 ? topEdge : bottomEdge;
      const inner = side < 0 ? floorTop : floorBottom;
      if (side < 0) {
        trace(outer, false);
        for (let k = inner.length - 1; k >= 0; k--) ctx.lineTo(inner[k].x, inner[k].y);
      } else {
        trace(inner, false);
        for (let k = outer.length - 1; k >= 0; k--) ctx.lineTo(outer[k].x, outer[k].y);
      }
      ctx.closePath();
      ctx.fillStyle = side < 0 ? '#6b6355' : '#575145';
      ctx.fill();

      // 岩层亮边与背光面：贴着谷底一侧亮、外侧压暗。
      ctx.strokeStyle = side < 0 ? 'rgba(188,180,163,0.36)' : 'rgba(155,147,132,0.28)';
      ctx.lineWidth = Math.max(1, TS * 0.024);
      trace(outer, false);
      ctx.stroke();

      // 崖壁上的竖向裂纹与凸岩，避免像一条规整的木板边。
      for (let k = 2; k < segs - 1; k += 2) {
        const px = -halfLen + (halfLen * 2 * k) / segs;
        const outerY = side < 0 ? topEdge[k].y : bottomEdge[k].y;
        const innerY = side < 0 ? floorTop[k].y : floorBottom[k].y;
        const hh = Math.abs(innerY - outerY) * (0.45 + peakHash(k, i, side) * 0.38);
        const bx = px + (peakHash(k + 6, i, side) - 0.5) * TS * 0.12;
        ctx.fillStyle = side < 0 ? 'rgba(201,193,176,0.20)' : 'rgba(24,21,17,0.34)';
        ctx.beginPath();
        ctx.moveTo(bx, outerY + (side < 0 ? hh * 0.10 : -hh * 0.10));
        ctx.lineTo(bx + TS * 0.055, innerY);
        ctx.lineTo(bx - TS * 0.040, innerY - (side < 0 ? -1 : 1) * TS * 0.04);
        ctx.closePath();
        ctx.fill();
        if (k % 4 === 0) {
          ctx.fillStyle = 'rgba(32,25,18,0.28)';
          ctx.beginPath();
          ctx.moveTo(bx - TS * 0.16, outerY + (side < 0 ? -TS * 0.02 : TS * 0.02));
          ctx.lineTo(bx - TS * 0.03, outerY + (side < 0 ? -TS * 0.12 : TS * 0.12));
          ctx.lineTo(bx + TS * 0.10, outerY + (side < 0 ? TS * 0.02 : -TS * 0.02));
          ctx.closePath();
          ctx.fill();
        }
      }
    });

    // 大块山肩与崖垛：每隔一小段向外/向内探出岩体，
    // 把“长条木板”的直线轮廓彻底打碎。颜色压暗，远看是山，不是桥。
    [-1, 1].forEach(function (side) {
      const edge = side < 0 ? topEdge : bottomEdge;
      for (let k = 0; k < 4; k++) {
        const at = Math.min(segs - 1, Math.max(1, Math.round((k + 0.55) / 4 * segs)));
        const base = edge[at];
        const reach = TS * (0.20 + peakHash(k, i, side + 71) * 0.26);
        const wide = TS * (0.22 + peakHash(k + 3, i, side + 73) * 0.18);
        const yy = base.y + side * reach;
        ctx.fillStyle = k % 2 ? '#4e493e' : '#625b4d';
        ctx.beginPath();
        ctx.moveTo(base.x - wide, base.y + side * TS * 0.03);
        ctx.lineTo(base.x - wide * 0.32, yy);
        ctx.lineTo(base.x + wide * 0.38, yy - side * TS * 0.05);
        ctx.lineTo(base.x + wide, base.y - side * TS * 0.04);
        ctx.lineTo(base.x + wide * 0.42, base.y - side * TS * 0.14);
        ctx.lineTo(base.x - wide * 0.55, base.y - side * TS * 0.09);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(28,24,19,0.42)';
        ctx.lineWidth = Math.max(1, TS * 0.020);
        ctx.stroke();
      }
    });

    // 谷底土路：深褐色的碎石土，不是桥面的暖黄木板。
    const floorGrad = ctx.createLinearGradient(0, -floorW * 0.5, 0, floorW * 0.5);
    floorGrad.addColorStop(0, '#241f17');
    floorGrad.addColorStop(0.12, '#4c3f2d');
    floorGrad.addColorStop(0.40, '#665238');
    floorGrad.addColorStop(0.62, '#5b4932');
    floorGrad.addColorStop(0.88, '#3a2f22');
    floorGrad.addColorStop(1, '#1f1a14');
    ctx.beginPath();
    floorTop.forEach(function (pt, k) { if (k) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y); });
    for (let k = floorBottom.length - 1; k >= 0; k--) ctx.lineTo(floorBottom[k].x, floorBottom[k].y);
    ctx.closePath();
    ctx.fillStyle = floorGrad;
    ctx.fill();

    // 崖脚压进路面的阴影：让路“陷”在两壁之间，而不是浮在一条桥板上。
    [-1, 1].forEach(function (side) {
      const grad = ctx.createLinearGradient(0, side * floorW * 0.5, 0, side * floorW * 0.04);
      grad.addColorStop(0, 'rgba(10,9,7,0.52)');
      grad.addColorStop(1, 'rgba(10,9,7,0)');
      ctx.save();
      ctx.beginPath();
      ctx.rect(-halfLen, side < 0 ? -floorW * 0.5 : 0, halfLen * 2, floorW * 0.5);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(-halfLen, -floorW * 0.5, halfLen * 2, floorW);
      ctx.restore();
    });

    // 两道被车轮压出来的浅辙；不画横贯谷底的整条横线，避免像桥板接缝。
    ctx.strokeStyle = 'rgba(34,25,16,0.58)';
    ctx.lineWidth = Math.max(1, TS * 0.024);
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const px = -halfLen + (halfLen * 2 * s) / segs;
        const py = (k ? 1 : -1) * TS * 0.045 + (peakHash(s, k, 31) - 0.5) * TS * 0.030;
        if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }

    // 横在谷底的岩牙：每隔一段从两壁探出半块岩体，
    // 中间只留一条能过人的缝；这是桥面绝不会有的形态。
    [0.30, 0.66].forEach(function (at, rib) {
      const px = -halfLen + halfLen * 2 * at + (rib ? TS * 0.12 : 0);
      [-1, 1].forEach(function (side) {
        const edgeY = side * floorW * 0.5;
        const reach = floorW * (0.36 + peakHash(rib, i, side + 81) * 0.16);
        ctx.fillStyle = side < 0 ? '#514b40' : '#413c32';
        ctx.beginPath();
        ctx.moveTo(px - TS * 0.16, edgeY);
        ctx.lineTo(px - TS * 0.03, edgeY - side * reach);
        ctx.lineTo(px + TS * 0.13, edgeY - side * reach * 0.55);
        ctx.lineTo(px + TS * 0.20, edgeY);
        ctx.closePath();
        ctx.fill();
      });
    });

    // 谷底碎石
    for (let k = 0; k < Math.max(5, Math.round(segs * 0.55)); k++) {
      const px = -halfLen + TS * 0.18 + (halfLen * 2 - TS * 0.36) * peakHash(k, i, 41);
      const py = (peakHash(k + 4, i, 43) - 0.5) * floorW * 0.68;
      const rw = TS * (0.032 + peakHash(k + 7, i, 47) * 0.040);
      ctx.fillStyle = 'rgba(54,45,34,0.62)';
      ctx.beginPath();
      ctx.moveTo(px - rw, py + rw * 0.5);
      ctx.lineTo(px, py - rw * 0.7);
      ctx.lineTo(px + rw, py + rw * 0.4);
      ctx.lineTo(px, py + rw * 0.8);
      ctx.closePath();
      ctx.fill();
    }

    // 贴边碎岩：从两壁塌到路上，压住过于平直的谷底边线。
    [-1, 1].forEach(function (side) {
      for (let k = 0; k < 5; k++) {
        const px = -halfLen + TS * 0.30 + (halfLen * 2 - TS * 0.60) * peakHash(k + 2, i, side + 53);
        const py = side * (floorW * 0.50 + TS * 0.015);
        const rw = TS * (0.055 + peakHash(k + 5, i, side + 57) * 0.070);
        const rh = rw * (0.65 + peakHash(k + 8, i, side + 59) * 0.5);
        ctx.fillStyle = k % 2 ? 'rgba(92,84,71,0.86)' : 'rgba(66,60,51,0.90)';
        ctx.beginPath();
        ctx.moveTo(px - rw, py);
        ctx.lineTo(px - rw * 0.2, py - side * rh);
        ctx.lineTo(px + rw * 0.8, py - side * rh * 0.35);
        ctx.lineTo(px + rw, py + side * rh * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    });

    // 谷口碎石坡：两端各撒几堆大小不一的塌方岩，和桥头石墩完全不同。
    [-1, 1].forEach(function (end) {
      const edge = end < 0 ? -1 : 1;
      const bx = edge * (halfLen - TS * 0.06);
      for (let k = 0; k < 6; k++) {
        const px = bx - edge * TS * (0.02 + peakHash(k, i, end + 7) * 0.42);
        const py = (k % 2 ? 1 : -1) * (floorW * 0.5 + TS * 0.04) +
          (peakHash(k + 2, i, end + 13) - 0.5) * TS * 0.16;
        const rw = TS * (0.07 + peakHash(k + 5, i, end + 19) * 0.12);
        const rh = rw * (0.55 + peakHash(k + 8, i, end + 23) * 0.55);
        ctx.fillStyle = k % 3 === 0 ? 'rgba(94,76,55,0.92)' : 'rgba(61,48,35,0.92)';
        ctx.beginPath();
        ctx.moveTo(px - rw, py + rh * 0.4);
        ctx.lineTo(px - rw * 0.25, py - rh);
        ctx.lineTo(px + rw * 0.55, py - rh * 0.6);
        ctx.lineTo(px + rw, py + rh * 0.45);
        ctx.closePath();
        ctx.fill();
      }
    });

    // 谷底近景补几粒浅色碎石与灰尘，保证 1x 下能看出是“路”，不是桥面。
    if (z >= 0.5) {
      for (let k = 0; k < Math.max(8, Math.round(segs * 0.7)); k++) {
        const px = -halfLen + TS * 0.12 + (halfLen * 2 - TS * 0.24) * peakHash(k + 11, i, 63);
        const py = (peakHash(k + 17, i, 65) - 0.5) * floorW * 0.56;
        ctx.fillStyle = k % 3 ? 'rgba(160,142,110,0.32)' : 'rgba(190,170,132,0.22)';
        ctx.fillRect(px, py, TS * 0.018, TS * 0.012);
      }
    }
    ctx.restore();
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

  // 峡谷压在山脉上：横穿/竖穿的谷口用不同方向的石壁切面表现
  drawCanyons(ctx, world, cam, box, w, toX, toY, app);

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
      return cp && (cp.stage === 'siege' || cp.stage === 'assault') && cp.targetId === site.id;
    });
    const mySiege = !!(st.playerSiege && st.playerSiege.siteId === site.id);
    const myAssault = !!(mySiege && (st.playerSiege.stage === 'storming' ||
      site.siegeStatus === 'assault'));
    const npcAssault = !!(npcSiege && site.siegeStatus === 'assault');
    const siege = npcSiege || mySiege;
    const playerColor = FACTIONS.player ? FACTIONS.player.color : '#d9a441';
    const isCapital = CAPITAL_IDS.indexOf(site.id) >= 0;
    const strategic = STRATEGIC_SITES[site.id];

    // 要地标记：金色八角框 + “要地”签。八格防御范围不画满屏，避免整图被大圆盖住。
    if (strategic) {
      const cx = sx + TS / 2;
      const cy = sy + TS / 2;
      const r = lowZoom ? 7 : TS * 0.62;
      ctx.save();
      ctx.strokeStyle = lowZoom ? '#e8c060' : 'rgba(232,192,96,0.9)';
      ctx.lineWidth = lowZoom ? 1.4 : 2.2;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = Math.PI / 8 + i * Math.PI / 4;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      if (!lowZoom) {
        ctx.fillStyle = 'rgba(58,38,16,0.9)';
        ctx.fillRect(cx - 20, cy - TS * 0.96, 40, 16);
        text(ctx, '要地', cx, cy - TS * 0.98 + 1, {
          size: 12, align: 'center', color: '#ffe0a8',
        });
      }
      ctx.restore();
    }

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

    // 边陲小镇虽然沿用村庄的格子尺寸，但用城镇图标，进镇也不再走村庄页。
    const sprite = site.specialEdge ? assets.site.town : (assets.site[site.type] || assets.site.village);
    ctx.drawImage(sprite, sx + 4, sy + 4, TS - 8, TS - 8);

    const fw = 19 * uiScale;
    const fh = 22 * uiScale;
    const fx = sx + TS - fw - 4;
    const fy = sy + 4;
    // 势力旗：无主城围攻失败后，城头插一面“仇”字赤旗，和敌对城一个待遇
    if (site.playerBlocked && !site.ownerFaction) {
      ctx.fillStyle = '#b4463c';
      ctx.fillRect(fx, fy, fw, fh);
      ctx.fillStyle = 'rgba(255,235,210,0.8)';
      ctx.fillRect(fx, fy, fw, 2);
      text(ctx, '仇', fx + fw / 2, fy + 2, { size: Math.round(16 * uiScale), align: 'center', color: '#fff' });
    } else if (site.ownerFaction) {
      const col = FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].color : '#8f8f86';
      ctx.fillStyle = col;
      ctx.fillRect(fx, fy, fw, fh);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(fx, fy, fw, 2);
      text(ctx, FACTIONS[site.ownerFaction] ? FACTIONS[site.ownerFaction].banner : '?', fx + fw / 2, fy + 2, {
        size: Math.round(16 * uiScale), align: 'center', color: '#fff',
      });
    } else {
      ctx.fillStyle = '#6a655c';
      ctx.fillRect(fx, fy, fw, fh);
    }

    // 围城/攻城标记：城下营寨连成圈，远远就看得见
    if (siege) {
      const bw = 52 * uiScale;
      const bh = 30 * uiScale;
      const assault = myAssault || npcAssault;
      ctx.fillStyle = myAssault ? 'rgba(132,58,20,0.95)'
        : assault ? 'rgba(132,34,18,0.94)'
          : mySiege ? 'rgba(120,82,18,0.94)' : 'rgba(120,32,18,0.92)';
      ctx.fillRect(sx + 5 * uiScale, sy + 5 * uiScale, bw, bh);
      ctx.strokeStyle = assault ? '#e8a050' : '#f0c060';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 5 * uiScale, sy + 5 * uiScale, bw, bh);
      text(ctx, myAssault ? '我攻' : assault ? '进攻中' : mySiege ? '我围' : '围城',
        sx + 5 * uiScale + bw / 2, sy + 7 * uiScale, {
          size: Math.round(20 * uiScale), align: 'center', color: '#ffe0a8',
        });
    }

    // 名牌
    const isTown = site.type === 'town' || !!site.specialEdge;
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

function drawEdgeFog(ctx, app, cam, box, w) {
  const st = app.state;
  const edge = st && st.world && st.world.edgeTown;
  if (!edge) return;
  if (edge.fogOpen) return;
  if (st.story && st.story.edgeTownOpen) return;
  if (st.arc && (st.arc.phase === 'disaster' || st.arc.phase === 'reconquest' || st.arc.phase === 'finale')) return;
  const cx = edge.x * TS + TS / 2 - cam.x;
  const cy = box.top + edge.y * TS + TS / 2 - cam.y;
  const radius = (edge.radius || 10) * TS;
  if (cx + radius < 0 || cx - radius > w || cy + radius < box.top || cy - radius > box.top + box.h) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();

  // 十格浓雾：中心几乎看不见城，外缘逐渐化开。
  const g = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius);
  g.addColorStop(0, 'rgba(176,178,170,0.92)');
  g.addColorStop(0.45, 'rgba(162,166,160,0.9)');
  g.addColorStop(0.78, 'rgba(136,142,138,0.82)');
  g.addColorStop(0.94, 'rgba(120,126,124,0.45)');
  g.addColorStop(1, 'rgba(120,126,124,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // 缓慢漂移的雾团，让边缘不是一刀切的圆。
  for (let i = 0; i < 7; i += 1) {
    const a = i * 2.1 + 0.7;
    const rr = radius * (0.28 + (i % 3) * 0.19);
    const ox = Math.cos(a) * radius * 0.35;
    const oy = Math.sin(a) * radius * 0.28;
    ctx.fillStyle = 'rgba(226,228,220,' + (0.08 + (i % 3) * 0.025) + ')';
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  const p = st.player;
  const pd = Math.max(Math.abs(p.x - edge.x), Math.abs(p.y - edge.y));
  if (pd <= (edge.radius || 10) + 2) {
    const ty = cy - radius * 0.42;
    ctx.fillStyle = 'rgba(20,18,14,0.78)';
    ctx.fillRect(cx - 118, ty - 18, 236, 54);
    text(ctx, '迷雾迷人眼', cx, ty, { size: 24, align: 'center', color: '#f0e6cf', shadow: true });
    text(ctx, '无法深入探索，否则可能迷失其中，永远无法出来', cx, ty + 24, {
      size: 12, align: 'center', color: '#c9c0aa',
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
    const sz = (p.banditTier === 'hong' ? 90 : p.banditTier === 'cheng' ? 82 : 72) * z;
    ctx.drawImage(icon, sx - sz / 2, sy - sz * 0.78, sz, sz);

    // 兵力小字：先看人数再决定上不上（拉远时省掉，免得糊成一团）
    const n = army.troopCount(p.troops || {});
    if (n > 0 && z >= 0.8) {
      text(ctx, String(n), sx + 20 * z, sy - 8 * z, {
        size: Math.round(19 * z), color: p.color === '#4f8f6a' ? '#8fd0a8' : '#f0c9b0', shadow: true,
      });
    }
    if (p.chasing) {
      text(ctx, '!', sx, sy - 62 * z, { size: Math.round(24 * z), align: 'center', color: '#e05a42', shadow: true });
    }
    // 匪团的名号：跟领主一样挂在模型下面，一眼看清是谁
    if (z >= 0.8) {
      const nsz = Math.max(12, Math.round(17 * z));
      ctx.font = 'bold ' + nsz + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(p.name).width;
      ctx.fillStyle = 'rgba(10,8,6,0.78)';
      ctx.fillRect(sx - tw / 2 - 7, sy + 18 * z, tw + 14, nsz + 5);
      text(ctx, p.name, sx, sy + 19 * z, {
        size: nsz, align: 'center', color: '#f0c9b0',
      });
    }
    // 匪团的旗：一面"贼"字，跟领主的势力旗同样大小，全国地图上也认得出
    const fw = 27 * z;
    const fh = 30 * z;
    const fx = sx + 16 * z;
    const fy = sy - 44 * z;
    ctx.fillStyle = 'rgba(12,9,6,0.6)';
    ctx.fillRect(fx - 2 * z, fy - 2 * z, fw + 4 * z, fh + 4 * z);
    ctx.fillStyle = p.color || '#7a3a2a';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = 'rgba(255,240,210,0.45)';
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.strokeRect(fx, fy, fw, fh);
    text(ctx, '贼', fx + fw / 2, fy + 3 * z, {
      size: Math.max(13, Math.round(19 * z)), align: 'center', color: '#fff',
    });

    // 只有真的互指、贴身、对方还活着且没进城，才显示“交战中”。
    // 旧档/刚结束战斗时残留的 engagedWith 不能让匪团在地图上挂一块假牌子。
    if (stateLib.partyEngagementValid(st, p)) {
      ctx.fillStyle = 'rgba(220,80,50,0.9)';
      ctx.fillRect(sx - 42 * z, sy - 78 * z, 84 * z, 28 * z);
      text(ctx, '交战中', sx, sy - 76 * z, { size: Math.round(19 * z), align: 'center', color: '#fff' });
    }
    if (p.scripted) {
      ctx.fillStyle = 'rgba(200,60,40,0.9)';
      ctx.fillRect(sx - 32 * z, sy - 94 * z, 64 * z, 24 * z);
      text(ctx, '追兵', sx, sy - 92 * z, { size: Math.round(17 * z), align: 'center', color: '#fff' });
    }
  });

  // 领主：君主最后画，避免被周围骑队和名牌压住
  const drawLords = st.lords.slice().sort(function (a, b) {
    return (isKingLord(st, a) ? 1 : 0) - (isKingLord(st, b) ? 1 : 0);
  });
  drawLords.forEach(function (lord) {
    if (!lord.alive || lord.inCity || lord.scatterHidden || lord.scattered) return;
    const up = stateLib.unitAnimPos(lord, nowH);
    const sx = up.x * TS - cam.x + TS / 2;
    const sy = box.top + up.y * TS - cam.y + TS / 2;
    if (sx < -50 || sx > w + 50 || sy < box.top - 50 || sy > box.top + box.h + 50) return;
    const hostile = stateLib.isHostileFaction(st, lord.faction);
    const neutral = !!lord.neutral;
    const col = FACTIONS[lord.faction] ? FACTIONS[lord.faction].color : (neutral ? '#9b8d76' : '#999');

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
      ctx.arc(sx, sy, 28 * z, 0, Math.PI * 2);
      ctx.fill();
    }
    // 君主：单人 Q 版无双步将，不再骑马、不再带两卒；普通领主仍是骑马队伍
    const look = lookFor(lord.id);
    const isKing = isKingLord(st, lord);
    const bw = isKing ? 24 * z : 28 * z;
    const bh = isKing ? 26 * z : 30 * z;
    let bxx = sx + 16 * z;
    let byy = sy - 42 * z;
    if (isKing) {
      // 金环踩在脚边，远看也能从一片骑队里认出君主
      ctx.fillStyle = 'rgba(240,196,92,0.22)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 19 * z, 31 * z, 9 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,120,0.7)';
      ctx.lineWidth = Math.max(1, 2 * z);
      ctx.beginPath();
      ctx.ellipse(sx, sy + 19 * z, 26 * z, 7 * z, 0, 0, Math.PI * 2);
      ctx.stroke();

      const icon = assets.monarchIconFor(col, look);
      const iw = 84 * z;
      const ih = iw * 80 / 64;
      const bottom = sy + 20 * z;
      ctx.drawImage(icon, sx - iw / 2, bottom - ih, iw, ih);
      bxx = sx - bw / 2;
      byy = bottom - ih - bh - 5 * z;
    } else {
      // 普通领主：一整队人马（骑手 + 两卒 + 旗），按势力上色
      const icon = assets.partyIconFor(col, look);
      const isz = (lord.id === 'lvbu' ? 122 : look.big ? 112 : 100) * z;
      ctx.drawImage(icon, sx - isz / 2, sy - isz * 0.76, isz, isz);
    }

    // 势力简写：一面小旗，全国地图上也认得出是哪家的；在野的人挂“野”字旗
    const banner = FACTIONS[lord.faction] ? FACTIONS[lord.faction].banner : (neutral ? '野' : '?');
    ctx.fillStyle = 'rgba(12,9,6,0.6)';
    ctx.fillRect(bxx - 2 * z, byy - 2 * z, bw + 4 * z, bh + 4 * z);
    ctx.fillStyle = col;
    ctx.fillRect(bxx, byy, bw, bh);
    ctx.strokeStyle = 'rgba(255,240,210,0.55)';
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.strokeRect(bxx, byy, bw, bh);
    text(ctx, banner, bxx + bw / 2, byy + 3 * z, {
      size: Math.max(13, Math.round(19 * z)), align: 'center', color: '#fff',
    });

    const nsz = Math.max(12, Math.round(18 * z));
    const nameY = isKing ? sy + 30 * z : sy + 21 * z;
    if (z >= 0.4) {
      ctx.font = 'bold ' + nsz + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(lord.name).width;
      ctx.fillStyle = 'rgba(10,8,6,0.75)';
      ctx.fillRect(sx - tw / 2 - 7, nameY - 1, tw + 14, nsz + 6);
      text(ctx, lord.name, sx, nameY, { size: nsz, align: 'center', color: hostile ? '#e58a7a' : '#e6dbc2' });
    }
    // 拉近到半图视野就写兵力，远望只认旗
    if (z >= 0.5) {
      text(ctx, String(army.troopCount(lord.troops || {})), isKing ? sx + 43 * z : sx + 24 * z,
        isKing ? sy - 62 * z : sy - 58 * z, {
          size: Math.max(15, Math.round(20 * z)), align: 'left', color: '#efe3c6', shadow: true,
        });
    }

    if (stateLib.lordEngagementValid(st, lord)) {
      ctx.fillStyle = 'rgba(220,80,50,0.9)';
      ctx.fillRect(sx - 42 * z, sy - 78 * z, 84 * z, 28 * z);
      text(ctx, '交战中', sx, sy - 76 * z, {
        size: Math.round(19 * z), align: 'center', color: '#fff',
      });
    }
    if (lord.fleeing) {
      ctx.fillStyle = 'rgba(60,42,18,0.9)';
      ctx.fillRect(sx - 32 * z, sy - 78 * z, 64 * z, 26 * z);
      text(ctx, '逃遁', sx, sy - 76 * z, {
        size: Math.round(18 * z), align: 'center', color: '#ffd18a',
      });
    } else if (lord.chasing) {
      text(ctx, '!', sx, sy - 54 * z, { size: Math.round(26 * z), align: 'center', color: '#e05a42' });
    }
  });

  // NPC 的合战战场：不是把几支队伍叠成一个点，而是在两军中间立一块“合战”牌，
  // 让玩家看得见这里正在打、双方各剩多少人。
  (st.fieldBattles || []).forEach(function (bf) {
    if (!bf || bf.playerInvolved || !bf.battle) return;
    const sx = bf.center.x * TS - cam.x + TS / 2;
    const sy = box.top + bf.center.y * TS - cam.y + TS / 2;
    if (sx < -80 || sx > w + 80 || sy < box.top - 100 || sy > box.top + box.h + 100) return;
    const ca = army.troopCount(bf.battle.a.troops);
    const cb = army.troopCount(bf.battle.b.troops);
    const bw = 96 * z;
    const bh = 30 * z;
    ctx.fillStyle = 'rgba(36,18,12,0.92)';
    ctx.fillRect(sx - bw / 2, sy - 78 * z, bw, bh);
    ctx.strokeStyle = 'rgba(220,90,60,0.85)';
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.strokeRect(sx - bw / 2, sy - 78 * z, bw, bh);
    text(ctx, '合战', sx, sy - 76 * z, {
      size: Math.max(14, Math.round(19 * z)), align: 'center', color: '#ffd0a0',
    });
    if (z >= 0.45) {
      text(ctx, ca + ' : ' + cb, sx, sy - 50 * z, {
        size: Math.max(11, Math.round(14 * z)), align: 'center', color: '#efe3c6',
      });
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

/** 自由视野提示：人跑出画面时给个"跳回原处"；城里歇息时给条离城提示 */
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
    text(ctx, '在' + (site ? site.name : '城里') + '歇息 · 粮耗减半 · 时辰照走 · 点一下地图就上路',
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

function drawEdgeGuide(ctx, app, cam, box, w) {
  const st = app.state;
  const arc = st && st.arc;
  if (!arc || arc.phase !== 'retreat') return;
  const edge = st.world && st.world.edgeTown;
  if (!edge) return;
  const p = st.player;
  const px = (p.x + 0.5) * TS - cam.x;
  const py = box.top + (p.y + 0.5) * TS - cam.y;
  const ex = (edge.x + 0.5) * TS - cam.x;
  const ey = box.top + (edge.y + 0.5) * TS - cam.y;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, box.top, w, box.h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(240,198,96,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(30,24,14,0.8)';
  ctx.fillRect(ex - 52, ey - 44, 104, 24);
  text(ctx, '边陲小镇', ex, ey - 32, { size: 18, align: 'center', color: '#f0d090', shadow: true });
  ctx.restore();
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

  // 头顶旗标：模型放大后要吊在盔顶之上，别压在脸和胸甲上
  const country = p.country && p.country.name ? p.country : null;
  ctx.fillStyle = country ? country.color : '#d9a441';
  ctx.beginPath();
  ctx.moveTo(sx - TS * 0.19, sy - TS * 1.64);
  ctx.lineTo(sx + TS * 0.19, sy - TS * 1.64);
  ctx.lineTo(sx, sy - TS * 1.44);
  ctx.closePath();
  ctx.fill();
  text(ctx, country ? country.name : (p.banner ? '旗' : '我'), sx, sy - TS * 1.6, {
    size: Math.max(10, Math.round(TS * 0.18)), align: 'center', color: '#2a1c08',
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

/** 任务卡点一下：把镜头直接送到目标格 */
function focusTaskTarget(app, target, label) {
  if (!target) {
    app.showToast('这个目标暂时不在图上。', 2.2);
    return;
  }
  MapScene.focusOn(app, target.x, target.y, target.name || label || '');
  app.showToast('已在地图上标出：' + (target.name || label || '任务目标'), 2.4);
}

/** 左上角常驻任务卡：只留一条主线 + 一条酒馆支线，可收起 */
function drawQuestCard(ctx, app, box, w) {
  const st = app.state;
  const info = stateLib.campaignInfo(st);
  const activeSide = (st.quests || []).filter(function (q) { return q && !q.done && !q.failed; });
  // 史实沙盘没有主线时，只留酒馆支线；一条支线也没有就不占地图。
  if (!info && !activeSide.length) return;
  const sideOnly = !info;
  const side = activeSide[0] || null;
  const collapsed = !!app.questTrackCollapsed;

  const pw = Math.min(340, w - 20);
  const x = 10;
  const y = box.top + 10;

  if (collapsed) {
    const cw = Math.min(170, pw);
    const ch = 34;
    ctx.fillStyle = 'rgba(10,8,6,0.84)';
    ctx.fillRect(x, y, cw, ch);
    ctx.fillStyle = '#d9a441';
    ctx.fillRect(x, y, 4, ch);
    text(ctx, '任务追踪', x + 14, y + 6, { size: 15, color: '#f0c060' });
    text(ctx, '▸', x + cw - 20, y + 5, { size: 17, color: '#a2947a' });
    app.ui.rect('quest_toggle', x, y, cw, ch, function () {
      app.questTrackCollapsed = false;
      if (st.settings) st.settings.questTrackCollapsed = false;
    });
    return;
  }

  const headerH = 30;
  const mainH = 64;
  const sideH = side ? 56 : 36;
  const ph = headerH + (sideOnly ? 0 : mainH) + sideH + 8;

  ctx.fillStyle = 'rgba(10,8,6,0.84)';
  ctx.fillRect(x, y, pw, ph);
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(x, y, 4, ph);
  ctx.fillStyle = 'rgba(217,164,65,0.12)';
  ctx.fillRect(x + 4, y, pw - 4, headerH);

  text(ctx, '任务追踪', x + 14, y + 5, { size: 15, color: '#f0c060' });
  text(ctx, '▾ 收起', x + pw - 12, y + 6, { size: 13, align: 'right', color: '#a2947a' });
  app.ui.rect('quest_toggle', x, y, pw, headerH, function () {
    app.questTrackCollapsed = true;
    if (st.settings) st.settings.questTrackCollapsed = true;
  });

  let ry = y + headerH + 4;
  if (!sideOnly) {
    // 主线：只显示当前这一章，不再把整条主线摊开
    const mainTitle = info.done ? '主线已走完' : '第 ' + (info.index + 1) + '/' + info.total + ' 章 · ' + info.title;
    const mainHint = info.done ? '剩下的是占地与写史' : String(info.hint || info.goal || '');
    ctx.fillStyle = 'rgba(38,29,18,0.72)';
    ctx.fillRect(x + 8, ry, pw - 16, mainH - 4);
    ctx.fillStyle = '#d9a441';
    ctx.fillRect(x + 8, ry, 3, mainH - 4);
    text(ctx, '主线', x + 18, ry + 4, { size: 12, color: '#8a8070' });
    const mainTitleLine = wrap(ctx, mainTitle, pw - 52, 18)[0] || mainTitle;
    text(ctx, mainTitleLine, x + 18, ry + 17, { size: 18, color: '#f0c060' });
    const mainLines = wrap(ctx, mainHint, pw - 52, 13).slice(0, 1);
    mainLines.forEach(function (ln, i) {
      text(ctx, ln, x + 18, ry + 40 + i * 16, { size: 13, color: '#c9bda2' });
    });
    text(ctx, '定位 ▸', x + pw - 18, ry + 5, { size: 11, align: 'right', color: '#8a8070' });
    app.ui.rect('quest_main', x + 8, ry, pw - 16, mainH - 4, function () {
      const target = stateLib.campaignTargetPos(st);
      if (target) focusTaskTarget(app, target, '主线目标');
      else app.push('journal');
    });

    ry += mainH;
  }
  // 支线：只收一条酒馆差事，点一下把镜头送到目标
  const sideHint = side
    ? (side.type === 'hunt' ? '去地图上找到目标队伍并打散' :
      side.type === 'scout' ? '去目标贼巢门口探查' : '把粮草送到' + (side.siteName || '目标城'))
    : '';
  ctx.fillStyle = 'rgba(26,23,17,0.72)';
  ctx.fillRect(x + 8, ry, pw - 16, sideH - 4);
  ctx.fillStyle = '#7fa4c8';
  ctx.fillRect(x + 8, ry, 3, sideH - 4);
  text(ctx, '支线 · 酒馆', x + 18, ry + 3, { size: 12, color: '#8a8070' });
  if (side) {
    text(ctx, side.title, x + 18, ry + 16, { size: 16, color: '#efe3c6' });
    text(ctx, sideHint, x + 18, ry + 35, { size: 12, color: '#a2947a' });
  } else {
    text(ctx, '暂无差事 · 去陈留酒馆接一桩', x + 18, ry + 16, {
      size: 14, color: '#8a8070',
    });
  }
  if (activeSide.length > 1) {
    text(ctx, '另有 ' + (activeSide.length - 1) + ' 件', x + pw - 18, ry + 3, {
      size: 11, align: 'right', color: '#8a8070',
    });
  }
  app.ui.rect('quest_side', x + 8, ry, pw - 16, sideH - 4, function () {
    if (!side) {
      app.showToast('去酒馆打听一桩事，支线才会挂在这里。', 2.4);
      return;
    }
    const target = stateLib.questTargetPos(st, side);
    if (target) {
      app.mapQuestFocus = side.id;
      focusTaskTarget(app, target, side.title);
    } else {
      app.showToast(side.failed ? (side.failReason || '目标已被清剿') : '这个目标暂时不在图上。', 2.4);
    }
  });
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

  // 倍速：额外保留 8x 与 60x 测试档；60x 只用于快速验剧情
  const speeds = [1, 2, 3, 8, 60];
  const speedW = 40;
  const speedGap = 6;
  const speedStart = w - 18 - (speeds.length * speedW + (speeds.length - 1) * speedGap);
  speeds.forEach(function (s, i) {
    const bx = speedStart + i * (speedW + speedGap);
    const active = (st.timeScale || 1) === s;
    ctx.fillStyle = active ? '#d9a441' : '#2c2318';
    ctx.fillRect(bx, 12, speedW, 32);
    text(ctx, s + 'x', bx + speedW / 2, 18, { size: 18, align: 'center', color: active ? '#201409' : '#9c907a' });
    app.ui.rect('speed' + s, bx, 12, speedW, 32, function () {
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
    text(ctx, String(it.v), x, 92, { size: 20, color: it.c });
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
  const liveFields = (st.fieldBattles || []).filter(function (bf) { return bf && !bf.playerInvolved; }).length;
  const warTxt = (wars.length ? ' · 天下 ' + wars.length + ' 处交兵' : ' · 四境暂无大战') +
    (liveFields ? ' · 合战 ' + liveFields + ' 处' : '');
  const siegeNow = st.playerSiege ? siteById(st.world, st.playerSiege.siteId) : null;
  if (mapClockFrozen(app)) {
    drawPauseTag(ctx, w, y0);
  } else {
    const hint = (siegeNow
      ? '围城中 · ' + siegeNow.name + ' · 点城下营寨看进度 · 点别处决定去留'
      : (p.route && p.route.length
        ? '行军第 ' + (st.player.route.length - (st.player.route.length - 1)) + ' 段 · 点地图可改道'
        : (st.player.atSiteId ? '在' + (siteById(st.world, st.player.atSiteId) || {}).name + ' · 点地图出发' : '点地图行军 · 双指缩放 · 拖动平移')))
      + warTxt;
    text(ctx, hint, w / 2, y0 + 104, { size: 16, align: 'center', color: '#8a8070' });
  }
  drawRestPause(ctx, app, w, box);
}

/** 大地图这一帧到底有没有在走时辰：手动暂停、城下选择框、待处理军情都会冻住。 */
function mapClockFrozen(app) {
  const st = app && app.state;
  if (!st) return false;
  return !!app.mapTimePaused || !!app.siegePrompt || !!(st.events && st.events.length);
}

/** 底部中央的暂停状态条：只在不走时辰时出现，恢复流动即隐藏 */
function drawPauseTag(ctx, w, y0) {
  const bw = 148;
  const bh = 38;
  const x = (w - bw) / 2;
  const y = y0 + 92;
  ctx.save();
  ctx.fillStyle = 'rgba(28,22,16,0.94)';
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = '#b8a25e';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
  ctx.fillStyle = '#f0c060';
  ctx.fillRect(x + 18, y + 12, 5, 14);
  ctx.fillRect(x + 27, y + 12, 5, 14);
  text(ctx, '已暂停', x + 46, y + 10, { size: 18, color: '#f0d28a' });
  ctx.restore();
}

function drawRestPause(ctx, app, w, box) {
  const st = app.state;
  const p = st && st.player;
  if (!p) return;
  const docked = !!p.atSiteId;
  const paused = !!app.mapTimePaused;
  if ((!docked && !paused) || app.siegePrompt) return;

  const x = 12;
  const y = box.top + box.h - 76;
  const bw = 132;
  const bh = 62;
  const label = paused ? '继续时辰' : (p.resting ? '暂停休整' : '暂停停靠');
  app.ui.button(ctx, x, y, bw, bh, '', {
    id: 'map_rest_pause',
    fill: paused ? 'rgba(38,48,30,0.94)' : 'rgba(38,29,20,0.94)',
    border: paused ? '#b8a25e' : '#8a7448',
    onTap: function () {
      if (app.mapTimePaused) {
        app.mapTimePaused = false;
        app.mapIdleRest = true;
        app.showToast('时辰继续。', 1.8);
        return;
      }
      const r = stateLib.leaveRestForMap(st);
      if (!r.ok) return;
      app.restView = null;
      app.follow = null;
      if (st.campFlow) st.campFlow = false;
      app.mapTimePaused = true;
      app.mapIdleRest = true;
      ensureCam(app);
      app.showToast('已出城扎营，时辰暂停。', 2.2);
    },
  });

  // 图标：暂停是两根竖条，继续是一个三角；避免用 emoji，保持像素风。
  ctx.save();
  ctx.fillStyle = paused ? '#f0c060' : '#e6dbc2';
  if (paused) {
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 20);
    ctx.lineTo(x + 42, y + 31);
    ctx.lineTo(x + 22, y + 42);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(x + 20, y + 19, 6, 24);
    ctx.fillRect(x + 32, y + 19, 6, 24);
  }
  text(ctx, label, x + 52, y + 18, {
    size: 19, color: paused ? '#f0d28a' : '#e6dbc2',
  });
  text(ctx, paused ? '天下静止' : '出城扎营', x + 52, y + 40, {
    size: 12, color: '#8a8070',
  });
  ctx.restore();
}

module.exports = MapScene;
