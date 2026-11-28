/**
 * 汉末战略状态机。
 *
 * 它不直接改地图，只做四件事：
 *  1. 按阶段给各国递战书、停战书，并留下剧情文书；
 *  2. 给国战 AI 标注“这一阶段该打谁/不该打谁”；
 *  3. 记录最后一座城是谁打下的，亡国时让灭国者优先收人；
 *  4. 推动袁术称帝、荆州会战与三国循环。
 */

const { STORY } = require('../data/story.js');
const { FACTIONS, ROADS, FACTION_COMBAT } = require('../data/china.js');
const { LORD_POWER_BY_ID, MARSHAL_BY_ID, STRATEGIST_BY_ID } = require('../data/lord-rank.js');
const { siteById } = require('./world.js');
const army = require('./army.js');
const war = require('./war.js');
const { syncSiteRecruitList } = require('../data/troops.js');

let logFn = function () {};

function bindLogger(fn) {
  logFn = fn || function () {};
}

function key(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

/** 公告里不显示“第一/第二战略”这类阶段序号，只留战略名。 */
function displayLabel(cfg) {
  if (!cfg) return '';
  return String(cfg.label || cfg.short || cfg.title || '').replace(/^第[一二三四五六七八九十百]+战略\s*·\s*/, '');
}

/** 袁绍官渡状态：只压“杀敌系数”，不改防御与对碰；n61 起按用户要求为 0.8。 */
function applyYuanCombat(state, weak) {
  if (!state || !state.story) return;
  if (!FACTION_COMBAT.yuan) FACTION_COMBAT.yuan = { power: 1 };
  const penaltyPower = Number(STORY.yuanWeakPower);
  const penaltyEnabled = isFinite(penaltyPower) && penaltyPower > 0 && penaltyPower < 0.999;
  const on = penaltyEnabled && !!weak && factionAlive(state, 'yuan');
  // 对碰与防御保持正常，只有袁军给敌军造成的损失按 0.8 结算。
  FACTION_COMBAT.yuan.power = 1;
  FACTION_COMBAT.yuan.killBase = on ? penaltyPower : 1;
  state.story.yuanWeak = on;
  // n51：昏君不再把袁军士气钉死在 35。
  // 旧档若还留着 storyMoraleCap=35，在这里恢复成战前士气，避免读档后仍然半残。
  (state.lords || []).forEach(function (l) {
    if (l.faction !== 'yuan' || !l.alive || l.dead) return;
    if (l.storyMoraleCap) {
      l.morale = Math.max(typeof l.morale === 'number' ? l.morale : 0, l.preStoryMorale || 70);
      l.storyMoraleCap = null;
    }
  });
}

function yuanMoraleTick(state) {
  // 0.8 版只压杀敌系数，不再每日把袁军士气往下按。
  const st = state.story;
  if (!st || !st.yuanWeak || !factionAlive(state, 'yuan')) return;
}

function resetCombat() {
  if (FACTION_COMBAT.yuan) {
    FACTION_COMBAT.yuan.power = 1;
    FACTION_COMBAT.yuan.killBase = 1;
  }
  Object.keys(FACTION_COMBAT).forEach(function (f) {
    if (FACTION_COMBAT[f]) FACTION_COMBAT[f].killMul = 1;
  });
}
const resetYuanCombat = resetCombat;

/* ------------------------------------------------------------ 基础查询 */

function hasStory(state) {
  return !!(state && state.story && state.story.mode);
}

function isPassive(state, faction) {
  return !!(state && state.story && state.story.passive && state.story.passive[faction]);
}

function isMajor(faction) {
  return STORY.majors.indexOf(faction) >= 0;
}

function isDuel(faction) {
  return STORY.duelFactions.indexOf(faction) >= 0;
}

/** 边缘小国领主每天补兵的比例；大国是它的两倍。整体比旧版快一倍。 */
function recruitRate(state, faction) {
  const base = isPassive(state, faction) ? 0.12 : 0.24;
  // 荆州增益不是“上一轮霸主”的遗泽，只看此刻是否同时占着襄阳、新野、江陵。
  if (faction && holderOfJingzhou(state) === faction) {
    return base * (STORY.jingzhouStrongRecruitMul || 1.5);
  }
  return base;
}

function citiesOf(state, faction) {
  return (state.world.sites || []).filter(function (s) {
    return s.type !== 'camp' && s.ownerFaction === faction;
  });
}

function factionDead(state, id) {
  return !!(state.factionState && state.factionState[id] && state.factionState[id].dead);
}

function factionAlive(state, id) {
  if (!id || !FACTIONS[id] || factionDead(state, id)) return false;
  if (citiesOf(state, id).length) return true;
  return (state.parties || []).some(function (p) { return p && p.faction === id; });
}

function factionName(id) {
  return (FACTIONS[id] && (FACTIONS[id].full || FACTIONS[id].name)) || id || '诸侯';
}

function siteOwnerIs(state, siteId, faction) {
  const s = siteById(state.world, siteId);
  return !!(s && s.ownerFaction === faction);
}

function allSitesOwned(state, faction, ids) {
  return (ids || []).every(function (id) { return siteOwnerIs(state, id, faction); });
}

function countTroops(state, faction) {
  let n = 0;
  (state.lords || []).forEach(function (l) {
    if (!l || l.faction !== faction || !l.alive || l.dead || l.retired || l.prisoner) return;
    Object.keys(l.troops || {}).forEach(function (k) { n += l.troops[k] || 0; });
  });
  return n;
}

function powerOf(state, faction) {
  return citiesOf(state, faction).length * 100 + countTroops(state, faction);
}

/* ------------------------------------------------------------ 城道相邻 */

let SITE_EDGES = null;

function siteEdges() {
  if (SITE_EDGES) return SITE_EDGES;
  SITE_EDGES = {};
  (ROADS || []).forEach(function (p) {
    if (!p || !p[0] || !p[1]) return;
    (SITE_EDGES[p[0]] = SITE_EDGES[p[0]] || []).push(p[1]);
    (SITE_EDGES[p[1]] = SITE_EDGES[p[1]] || []).push(p[0]);
  });
  return SITE_EDGES;
}

function siteAdjacent(a, b) {
  const e = siteEdges();
  return !!(a && b && e[a] && e[a].indexOf(b) >= 0);
}

/* ------------------------------------------------------------ 文书 */

function eventLines(lines) {
  return (lines || []).filter(Boolean).slice(0, 5);
}

function pushStoryEvent(state, title, lines, opts) {
  const o = opts || {};
  if (!state || !state.events) return;
  state.events.push({
    type: 'story',
    title: title,
    lines: eventLines(lines),
    tag: o.tag || '大势',
    art: o.art || null,
    auto: o.auto || 7,
    skipAny: true,
  });
}

function pushWarEvent(state, title, lines) {
  if (!state || !state.events) return;
  state.events.push({
    type: 'diplomacy',
    kind: 'war',
    title: title,
    lines: eventLines(lines),
    skipAny: true,
  });
}

function pushPeaceEvent(state, title, lines) {
  if (!state || !state.events) return;
  state.events.push({
    type: 'diplomacy',
    kind: 'peace',
    title: title || '两家罢兵',
    lines: eventLines(lines),
    skipAny: true,
  });
}

/** 开局军情不抢在第一天弹出：到第三天再一次性说明天下棋局。 */
function announceOpening(state) {
  const st = state && state.story;
  if (!st || st.openingEventShown) return;
  st.openingEventShown = true;
  pushWarEvent(state, '天下棋局', [
    '曹操以“兖州旧怨”向吕布宣战，徐州、兖州边关同时点起烽火。',
    '孙权以“为父报仇”向刘表宣战，江东水军直指夏口、江陵。',
    '袁绍与公孙瓒撕破脸，幽冀两家开局便不死不休，谁也不接议和书。',
    '刘备按兵新野，先派庞统入蜀，以“共讨张鲁”为名联络刘璋。',
    '马腾割据西凉，汉中张鲁闭关自守，两家暂不与中原诸侯交锋。',
  ]);
  logFn(state, '天下棋局已开：曹操讨吕布，孙权攻刘表，袁绍与公孙瓒不死不休；刘备派庞统入蜀，西凉马腾、汉中张鲁各守本土。', 'war');
}

function maybeOpeningEvent(state) {
  const st = state && state.story;
  if (!st || st.openingEventShown) return;
  const due = st.openingEventDay || STORY.openingEventDay || 3;
  if (state.clock.day < due) return;
  announceOpening(state);
}

/* ------------------------------------------------------------ 初始化 */

function freshPhase(firstId) {
  return {
    id: firstId,
    status: 'waiting',
    startedDay: 0,
    restUntil: 0,
    nextId: null,
    completed: 0,
    success: false,
    timedOut: false,
  };
}

/** 牵制战：南蛮只骚扰刘璋、南越只打长沙以南；两家开局就递战书。 */
function declareProxyWars(state) {
  const proxy = STORY.proxyWars || {};
  Object.keys(proxy).forEach(function (attacker) {
    const cfg = proxy[attacker];
    if (!cfg || !cfg.target) return;
    if (!factionAlive(state, attacker) || !factionAlive(state, cfg.target)) return;
    war.declare(state, attacker, cfg.target, true, true);
  });
}

function init(state, logger) {
  if (logger) bindLogger(logger);
  // 史实沙盘没有玩家主线，但天下仍要按史实阶段走：照样起状态机，只是不推章节。
  const sandbox = !!(state && !state.storyMode && state.historicalSandbox);
  if (!state || (!state.storyMode && !sandbox)) return null;
  if (state.story && state.story.mode) return state.story;

  resetCombat();
  const st = {
    mode: true,
    startedDay: state.clock.day,
    day: state.clock.day,
    phases: {},
    targets: {},
    priority: {},
    passive: {},
    originCities: {},
    retake: {},
    noPeace: {},
    emperor: { declared: false, day: 0, coalition: [] },
    duel: { startDay: state.clock.day, ended: false, winner: null },
    chibi: null,
    chibiDone: false,
    chibiBattleStaged: false,
    truce: {},
    xiliangDone: false,
    jingzhou: null,
    jingzhouDone: false,
    jingzhouKillBonus: null,
    endgame: null,
    headline: '',
    openingDeclared: false,
    openingEventDay: STORY.openingEventDay || 3,
    openingEventShown: false,
    yuanWeak: false,
    yuanBattleLost: false,
    edgeWarsDeclared: false,
    blockerTargets: {},
    blockerWars: {},
    waitEvents: {},
    proxyWars: STORY.proxyWars || {},
    proxyWarsDeclared: false,
    stage3Done: {},
    sandbox,
    openingPending: !!sandbox,
    guanduStarted: false,
    guanduStoryShown: false,
    guanduBattleStaged: false,
    kingdomsAllAtWar: false,
    unifiedFaction: null,
    targetRegion: {},
  };
  state.story = st;

  STORY.passiveFactions.forEach(function (f) { st.passive[f] = true; });
  STORY.noPeacePairs.forEach(function (pair) {
    st.noPeace[key(pair[0], pair[1])] = true;
  });
  // 南蛮与南越从开局就在山道上互攻，任何议和书都不收。
  if (factionAlive(state, 'nanman') && factionAlive(state, 'shanyue')) {
    war.declare(state, 'nanman', 'shanyue', true, true);
  }
  // 马腾、韩遂、汉廷三方开局即互相开战；三家都只在本土一城范围内争夺。
  const triple = (STORY.tripleWar || []).filter(function (f) { return factionAlive(state, f); });
  triple.forEach(function (a, i) {
    triple.slice(i + 1).forEach(function (b) {
      war.declare(state, a, b, true, true);
    });
  });
  declareProxyWars(state);
  st.proxyWarsDeclared = true;
  applyYuanCombat(state, false);

  Object.keys(FACTIONS).forEach(function (f) {
    st.originCities[f] = citiesOf(state, f).map(function (s) { return s.id; });
    st.retake[f] = [];
  });

  Object.keys(STORY.phases).forEach(function (f) {
    const list = STORY.phases[f];
    if (!list || !list.length) return;
    st.phases[f] = freshPhase(list[0].id);
    st.targets[f] = [];
  });

  // 开局四场：曹操讨吕布、孙权报父仇、刘备取西川、袁绍与公孙瓒不死不休。
  // 史实沙盘里玩家没有章节可依，这四场战书改在第三天统一递出（见 tick）。
  if (sandbox) {
    // 阶段已经建好，但都按兵不动：等第三天统一递战书，别让 tickPhase 提前动手。
    Object.keys(st.phases).forEach(function (f) {
      const p = st.phases[f];
      if (!p) return;
      p.waitingForWar = true;
      p.waitUntil = st.openingEventDay || STORY.openingEventDay || 3;
    });
    st.openingPending = true;
  } else {
    beginOpeningWars(state);
  }
  refreshHeadline(state);
  return st;
}

/** 开局四场战书：主线和史实沙盘共用，沙盘等到第三天再叫一次。 */
function beginOpeningWars(state) {
  const st = state.story;
  if (!st) return;
  ['wei', 'wu', 'shu', 'yuan', 'gongsun'].forEach(function (f) {
    if (st.phases[f]) startPhase(state, f, { silent: true, opening: true });
  });
  st.openingDeclared = true;
  st.openingPending = false;
  state.openingWarsDeclared = true;
  refreshHeadline(state);
}

/** 读档后恢复：状态都在存档里，只需要把上次的局面接上 */
function resume(state, logger) {
  if (logger) bindLogger(logger);
  if (!state || (!state.storyMode && !state.historicalSandbox)) return null;
  if (!state.story || !state.story.mode) return null;
  state.story.day = state.clock.day;
  if (!state.story.targets) state.story.targets = {};
  if (!state.story.priority) state.story.priority = {};
  if (!state.story.retake) state.story.retake = {};
  if (!state.story.originCities) state.story.originCities = {};
  if (!state.story.phases) state.story.phases = {};
  if (!state.story.emperor) state.story.emperor = { declared: false, day: 0, coalition: [] };
  if (!state.story.duel) state.story.duel = { startDay: 1, ended: false, winner: null };
  if (!state.story.waitEvents) state.story.waitEvents = {};
  if (state.story.chibi === undefined) state.story.chibi = null;
  // 旧档赤壁火攻只有三天：读档时补到七日，别让已开的战局继续三天收场。
  if (state.story.chibi && state.story.chibi.phase === 'battle' && !state.story.chibi.done) {
    const cDays = Math.max(1, Number((STORY.chibi || {}).battleDays) || 7);
    state.story.chibi.battleDays = cDays;
    const since = Number(state.story.chibi.since) || state.clock.day;
    state.story.chibi.until = Math.max(Number(state.story.chibi.until) || 0, since + cDays);
  }
  if (state.story.chibiBattleStaged === undefined) {
    state.story.chibiBattleStaged = !!(state.story.chibi && state.story.chibi.phase !== 'rest');
  }
  if (!state.story.truce || typeof state.story.truce !== 'object') state.story.truce = {};
  if (state.story.chibiDone === undefined) state.story.chibiDone = !!(state.story.chibi && state.story.chibi.done);
  if (state.story.xiliangDone === undefined) {
    // 旧档已经走完赤壁的，视为西凉已扫平；还在赤壁之前的，留给新阶段。
    state.story.xiliangDone = !!state.story.chibiDone;
  }
  const weiPhase = state.story.phases && state.story.phases.wei;
  if (weiPhase && weiPhase.id === 'wei_sworn' && weiPhase.nextId === 'wei_jingzhou') {
    weiPhase.nextId = 'wei_xiliang';
  }
  if (state.story.jingzhouKillBonus === undefined) state.story.jingzhouKillBonus = null;
  if (!state.story.blockerTargets) state.story.blockerTargets = {};
  if (!state.story.blockerWars) state.story.blockerWars = {};
  if (state.story.yuanWeak === undefined) state.story.yuanWeak = false;
  if (state.story.edgeWarsDeclared === undefined) state.story.edgeWarsDeclared = false;
  if (state.story.proxyWarsDeclared === undefined) {
    declareProxyWars(state);
    state.story.proxyWarsDeclared = true;
  }
  if (!state.story.proxyWars) state.story.proxyWars = STORY.proxyWars || {};
  if (state.story.openingEventDay === undefined) {
    state.story.openingEventDay = STORY.openingEventDay || 3;
  }
  if (state.story.openingEventShown === undefined) {
    state.story.openingEventShown = state.clock.day >= state.story.openingEventDay;
  }
  if (!state.story.stage3Done) state.story.stage3Done = {};
  if (state.story.jingzhou) {
    const jz = state.story.jingzhou;
    if (jz.started === undefined) jz.started = !!state.story.endgame;
    if (jz.active === undefined) jz.active = !!(state.story.endgame && state.story.endgame.active &&
      state.story.endgame.phase === 'battle');
    if (jz.takeoverCount === undefined) jz.takeoverCount = 0;
    if (jz.lastCountedHolder === undefined) jz.lastCountedHolder = null;
    if (jz.countingFromDay === undefined) jz.countingFromDay = 0;
    if (jz.roundStartHolder === undefined) jz.roundStartHolder = null;
    if (jz.lastSeenHolder === undefined) jz.lastSeenHolder = jz.roundStartHolder || null;
    if (jz.final === undefined) jz.final = !!(state.story.endgame && state.story.endgame.final);
    if (!jz.eligible) jz.eligible = {};
  }
  if (state.story.endgame) {
    const eg = state.story.endgame;
    if (eg.takeoverCount === undefined) eg.takeoverCount = 0;
    if (eg.final === undefined) eg.final = false;
  }
  if (state.story.guanduStarted === undefined) state.story.guanduStarted = false;
  if (state.story.guanduStoryShown === undefined) {
    state.story.guanduStoryShown = !!state.story.guanduStarted;
  }
  if (state.story.guanduBattleStaged === undefined) {
    state.story.guanduBattleStaged = !!state.story.guanduStarted ||
      !!(state.fieldBattles || []).some(function (bf) {
        return bf && bf.context && bf.context.cause === 'guandu' && bf.battle && !bf.battle.finished;
      });
  }
  // 旧档里已经打起来的官渡战场：补上七日节奏与最短结算时间，不重新布阵。
  if (!state.story.guanduBattle) {
    const guanduBf = (state.fieldBattles || []).filter(function (bf) {
      return bf && bf.context && bf.context.cause === 'guandu' && bf.battle && !bf.battle.finished;
    })[0];
    if (guanduBf) {
      const gCfg = STORY.guandu || {};
      const gDays = Math.max(1, Number(gCfg.battleDays) || 7);
      const nowH = state.clock.day * 24 + state.clock.hour;
      guanduBf.stepEveryH = Math.max(1, Number(gCfg.stepHours) || 12);
      guanduBf.lastStepH = nowH;
      guanduBf.noReinforce = true;
      guanduBf.minFinishH = Math.max(nowH, (guanduBf.startedH || nowH) + gDays * 24);
      guanduBf.finishByH = guanduBf.minFinishH;
      state.story.guanduBattle = {
        startedH: guanduBf.startedH || nowH,
        untilH: guanduBf.minFinishH,
        days: gDays,
        battleId: guanduBf.id,
        done: false,
      };
    }
  }
  if (state.story.kingdomsAllAtWar === undefined) state.story.kingdomsAllAtWar = false;
  if (!state.story.targetRegion) state.story.targetRegion = {};
  applyYuanCombat(state, !!state.story.yuanWeak);
  refreshHeadline(state);
  return state.story;
}

/* ------------------------------------------------------------ 阶段 */

function phaseList(faction) {
  return STORY.phases[faction] || [];
}

function phaseCfg(faction, id) {
  return phaseList(faction).filter(function (p) { return p.id === id; })[0] || null;
}

function currentCfg(state, faction) {
  const p = state.story.phases[faction];
  return p ? phaseCfg(faction, p.id) : null;
}

function phaseTargets(state, faction, cfg) {
  let list = (cfg && cfg.targets ? cfg.targets.slice() : []);
  if (cfg && cfg.parallel && factionAlive(state, cfg.parallel) && list.indexOf(cfg.parallel) < 0) {
    list.push(cfg.parallel);
  }
  return list.filter(function (id) {
    return id && !factionDead(state, id);
  });
}

/* ------------------------------------------------------------ 反卡位宣战 */

let ROAD_EDGE_CACHE = null;
function roadEdgeMap() {
  if (ROAD_EDGE_CACHE) return ROAD_EDGE_CACHE;
  const edges = {};
  (ROADS || []).forEach(function (pair) {
    if (!pair || !pair[0] || !pair[1]) return;
    (edges[pair[0]] = edges[pair[0]] || []).push(pair[1]);
    (edges[pair[1]] = edges[pair[1]] || []).push(pair[0]);
  });
  ROAD_EDGE_CACHE = edges;
  return edges;
}

function siteOwnerKey(site) {
  if (!site) return null;
  if (site.playerOwned) return 'player';
  return site.ownerFaction || null;
}

function isCitySite(site) {
  return !!site && (site.type === 'town' || site.type === 'castle');
}

/** 当前阶段真正要拿下的城：capture 直接取目标城，destroy 取目标势力现存城。 */
function phaseGoalSites(state, faction, cfg) {
  const out = [];
  const seen = {};
  function add(id) {
    if (!id || seen[id]) return;
    const site = siteById(state.world, id);
    if (!isCitySite(site)) return;
    seen[id] = true;
    out.push(site);
  }
  const obj = cfg && cfg.objective;
  if (obj && (obj.type === 'capture' || obj.type === 'captureOrDestroy')) {
    (obj.sites || []).forEach(add);
  }
  const goalFactions = [];
  if (obj && obj.type === 'destroy') {
    (obj.factions || []).forEach(function (f) { goalFactions.push(f); });
  } else {
    (cfg && cfg.targets || []).forEach(function (f) { goalFactions.push(f); });
  }
  goalFactions.forEach(function (f) {
    if (f === faction || factionDead(state, f)) return;
    citiesOf(state, f).forEach(function (s) { if (isCitySite(s)) add(s.id); });
  });
  return out;
}

function shortestRoadPath(state, fromIds, targetId, allowSite) {
  const edges = roadEdgeMap();
  const queue = [];
  const parent = {};
  const visited = {};
  fromIds.forEach(function (id) {
    if (!id || visited[id]) return;
    visited[id] = true;
    parent[id] = null;
    queue.push(id);
  });
  while (queue.length) {
    const cur = queue.shift();
    if (cur === targetId) {
      const path = [];
      let step = cur;
      while (step) {
        path.unshift(step);
        step = parent[step];
      }
      return path;
    }
    (edges[cur] || []).forEach(function (next) {
      if (visited[next]) return;
      const site = siteById(state.world, next);
      if (!site) return;
      if (allowSite && !allowSite(site)) return;
      visited[next] = true;
      parent[next] = cur;
      queue.push(next);
    });
  }
  return null;
}

function blockerFromPath(state, faction, path, allowedOwner) {
  if (!path || path.length < 2) return null;
  for (let i = 1; i < path.length; i++) {
    const site = siteById(state.world, path[i]);
    const owner = siteOwnerKey(site);
    if (!owner || allowedOwner(owner)) continue;
    if (owner === 'player' || owner === 'bandit' || owner === 'rebel') return null;
    if (factionDead(state, owner)) return null;
    return owner;
  }
  return null;
}

/**
 * 目标城被第三国占着，或者唯一可走的城道必须穿过第三国城池：
 * 这国就是“卡位者”，向它宣战，避免它靠中立身份堵住战略目标。
 */
function findBlockingFactions(state, faction, cfg) {
  const targets = phaseGoalSites(state, faction, cfg);
  if (!targets.length) return [];
  const targetFactions = [];
  ((cfg && cfg.objective && cfg.objective.factions) || (cfg && cfg.targets) || []).forEach(function (f) {
    if (targetFactions.indexOf(f) < 0) targetFactions.push(f);
  });
  const own = citiesOf(state, faction).filter(isCitySite).map(function (s) { return s.id; });
  if (!own.length) return [];
  const allowedOwner = function (owner) {
    return !owner || owner === faction || targetFactions.indexOf(owner) >= 0;
  };
  const blockers = [];
  targets.forEach(function (goal) {
    const owner = siteOwnerKey(goal);
    if (owner && owner !== faction && !allowedOwner(owner)) {
      if (owner !== 'player' && owner !== 'bandit' && owner !== 'rebel' && !factionDead(state, owner) &&
          blockers.indexOf(owner) < 0) blockers.push(owner);
      return;
    }
    if (owner === faction) return;
    // 有一条完全不碰第三国城池的路线，就不算被卡位。
    if (shortestRoadPath(state, own, goal.id, function (site) {
      return allowedOwner(siteOwnerKey(site));
    })) return;
    // 没有安全路线：按最短城道找第一个挡路的第三国。
    const shortest = shortestRoadPath(state, own, goal.id, null);
    const blocker = blockerFromPath(state, faction, shortest, allowedOwner);
    if (blocker && blockers.indexOf(blocker) < 0) blockers.push(blocker);
  });
  return blockers;
}

function syncPhaseBlockers(state, faction) {
  const st = state.story;
  const p = st && st.phases && st.phases[faction];
  if (!p || p.status !== 'war') return;
  const cfg = currentCfg(state, faction);
  if (!cfg) return;
  const base = phaseTargets(state, faction, cfg);
  const blockers = findBlockingFactions(state, faction, cfg);
  const prev = st.blockerWars[faction] || [];
  const oldBlockers = st.blockerTargets[faction] || [];
  const fresh = blockers.filter(function (b) { return prev.indexOf(b) < 0; });
  const current = (st.targets[faction] || []).filter(function (f) { return oldBlockers.indexOf(f) < 0; });
  const preserved = current.length ? current : base;
  st.blockerTargets[faction] = blockers.slice();
  st.targets[faction] = preserved.filter(function (f, i, arr) { return arr.indexOf(f) === i; })
    .concat(blockers.filter(function (f) { return preserved.indexOf(f) < 0; }));
  blockers.forEach(function (b) {
    if (b === faction || factionDead(state, b)) return;
    if (!war.atWar(state, faction, b)) war.declare(state, faction, b, true, true);
  });
  st.blockerWars[faction] = blockers.slice();
  if (fresh.length && p.status === 'war') {
    pushStoryEvent(state, '战略卡位', [
      factionName(faction) + '的战略目标被' + fresh.map(factionName).join('、') + '挡在城道上。',
      '对方既不归顺，也不让路；' + factionName(faction) + '不再忍让，直接递出战书。',
      '挡路的城池必须先拔掉，否则灭国、取城的目标永远差最后一程。',
    ], { tag: '大势', art: 'war', auto: 8 });
    logFn(state, '【' + factionName(faction) + '】战略目标被' + fresh.map(factionName).join('、') +
      '卡住，自动宣战打通城道。', 'war');
    refreshHeadline(state);
  }
}

function enforceStrategicBlockers(state) {
  const st = state.story;
  if (!st || st.endgame || (st.chibi && !st.chibi.done)) return;
  (STORY.blockerMajors || []).forEach(function (f) {
    if (!factionAlive(state, f)) return;
    syncPhaseBlockers(state, f);
  });
}

function canBeginPhase(state, cfg) {
  if (!cfg) return false;
  const st = state.story || {};
  const day = state.clock.day;
  if (cfg.notBeforeDay && day < cfg.notBeforeDay) return false;
  if (cfg.waitEmperor && !(st.emperor && st.emperor.declared)) {
    // 袁术如果已经被别人先灭，称帝事件不会再发生，孙权直接进入下一阶段。
    if (factionAlive(state, 'yuanshu')) return false;
  }
  if (cfg.waitGuandu && !st.guanduStarted) return false;
  if (cfg.waitJingzhou && !(st.jingzhou && st.jingzhou.active)) return false;
  if (cfg.waitChibi) {
    // 赤壁必须先打完；三家若有一家先亡，赤壁不会发生，不再无限等下去。
    if (!st.chibiDone) {
      const alive = (STORY.kingdoms || []).filter(function (f) { return factionAlive(state, f); });
      if (alive.length >= (STORY.kingdoms || []).length) return false;
    }
  }
  if (cfg.waitAllMajorsStage3) {
    const alive = (STORY.kingdoms || []).filter(function (f) { return factionAlive(state, f); });
    if (!alive.length || !alive.every(function (f) { return st.stage3Done && st.stage3Done[f]; })) return false;
  }
  if (cfg.waitBleed) {
    if (!state.story.duel.ended) {
      const bleedAt = (state.story.duel.startDay || 1) + STORY.bleedDays;
      if (day < bleedAt) return false;
    }
  }
  if (cfg.waitFactionDead) {
    if (!factionDead(state, cfg.waitFactionDead)) return false;
    const fs = state.factionState && state.factionState[cfg.waitFactionDead];
    const deadDay = (fs && (fs.deadDay || fs.lastLossDay)) || 0;
    if (deadDay && day < deadDay + (cfg.waitAfterDays || 0)) return false;
  }
  return true;
}

function startPhase(state, faction, opts) {
  const st = state.story;
  const p = st.phases[faction];
  if (!p) return false;
  const cfg = phaseCfg(faction, p.id);
  if (!cfg) return false;
  const silent = !!(opts && opts.silent);
  const opening = !!(opts && opts.opening);
  const guanduStage = isGuanduStage(cfg);
  const firstGuanduEvent = guanduStage && !st.guanduStoryShown;

  const skipWait = !!(opts && opts.skipWait);
  // 开局第几天才递战书：到点前保持“等待”，不要提前把仗打起来。
  if (cfg.notBeforeDay && state.clock.day < cfg.notBeforeDay) {
    p.status = 'waiting';
    p.startedDay = state.clock.day;
    p.waitingForWar = false;
    p.waitUntil = cfg.notBeforeDay;
    p.stage = cfg.stage || 0;
    st.targets[faction] = [];
    refreshHeadline(state);
    return true;
  }
  if (cfg.waitDays && !skipWait) {
    p.status = 'waiting';
    p.waitingForWar = true;
    p.waitUntil = state.clock.day + cfg.waitDays;
    p.startedDay = state.clock.day;
    p.restUntil = 0;
    p.success = false;
    p.timedOut = false;
    p.nextId = cfg.next || null;
    p.stage = cfg.stage || 0;
    st.targets[faction] = [];
    if (!state.story.waitEvents[faction + ':' + cfg.id]) {
      state.story.waitEvents[faction + ':' + cfg.id] = true;
      pushStoryEvent(state, cfg.title || displayLabel(cfg), [
        '大军已经点齐，但还不到出兵的时辰。',
        '等上' + cfg.waitDays + '天，等粮草到齐、探马回报，再动手。',
      ], { tag: '战略', art: 'peace', auto: 8 });
    }
    refreshHeadline(state);
    return true;
  }
  p.waitingForWar = false;
  const targets = phaseTargets(state, faction, cfg);
  p.status = 'war';
  p.stage = cfg.stage || 0;
  p.startedDay = state.clock.day;
  p.restUntil = 0;
  p.success = false;
  p.timedOut = false;
  p.nextId = cfg.next || null;
  st.targets[faction] = targets;
  if (opts && opts.priority) st.priority[faction] = opts.priority;
  // 刘备入川的旧逻辑靠这个标记锁剑阁首攻，也让主公亲自挂帅。
  if (faction === 'shu' && cfg.id === 'shu_yizhou' && state.flags) {
    state.flags.liubeiYiWar = true;
  }
  if (guanduStage) st.guanduStarted = true;

  war.abortCampaign(state, faction);
  if (cfg.yuanPenalty) applyYuanCombat(state, true);
  const declared = [];
  targets.forEach(function (to) {
    if (!factionAlive(state, to)) return;
    if (war.atWar(state, faction, to)) {
      declared.push(to);
      return;
    }
    if (war.declare(state, faction, to, true, true)) declared.push(to);
  });

  // 官渡是同一场史实：只由先进入阶段的一方发一次榜文，另一方不再重复弹窗。
  if (!silent && declared.length && (!guanduStage || firstGuanduEvent)) {
    const lines = (cfg.warLines || [cfg.casusBelli]).slice();
    const names = declared.map(factionName).join('、');
    lines.push('战书已下：' + factionName(faction) + '向' + names + '正式宣战。');
    pushWarEvent(state, cfg.title || displayLabel(cfg), lines);
    logFn(state, '【' + factionName(faction) + '】' + displayLabel(cfg) + '：' + (cfg.casusBelli || ''), 'war');
  } else if (opening && declared.length) {
    logFn(state, '【' + factionName(faction) + '】' + displayLabel(cfg) + '，向' + declared.map(factionName).join('、') + '宣战。', 'war');
  }
  // 官渡开局：战书落下后再把曹袁两军补满、调到官渡列阵，并直接开一场合战。
  // stageGuandu 自身有一次性护栏，袁绍后进入阶段时不会把两军重新洗一遍。
  if (guanduStage && state.storyHooks && state.storyHooks.stageGuandu) {
    state.storyHooks.stageGuandu(state);
  }
  if (firstGuanduEvent) st.guanduStoryShown = true;
  // 战书落下就立刻点兵：不要等第二天的 strategyTick 才让第一阶段动起来。
  if (declared.length && faction !== 'player' && faction !== 'bandit') {
    if (!state.warCampaigns || typeof state.warCampaigns !== 'object') state.warCampaigns = {};
    if (!state.siegeCooldown || typeof state.siegeCooldown !== 'object') state.siegeCooldown = {};
    if (!state.warCampaigns[faction]) war.planCampaign(state, faction, state.clock.day);
  }
  refreshHeadline(state);
  return true;
}

function phaseDone(state, faction, cfg) {
  const obj = cfg && cfg.objective;
  if (!obj) return false;
  if (obj.type === 'destroy') {
    return (obj.factions || []).every(function (id) { return factionDead(state, id); });
  }
  if (obj.type === 'capture') {
    return allSitesOwned(state, faction, obj.sites || []);
  }
  if (obj.type === 'captureOrDestroy') {
    if (allSitesOwned(state, faction, obj.sites || [])) return true;
    return (obj.factions || []).every(function (id) { return factionDead(state, id); });
  }
  return false;
}

function targetNames(state, cfg) {
  return (cfg && cfg.targets ? cfg.targets : []).filter(function (id) { return FACTIONS[id]; })
    .map(factionName).join('、');
}

function phasePeace(state, faction, cfg) {
  const st = state.story;
  if (!st) return [];
  const partners = war.warPartners(state, faction);
  const done = [];
  partners.forEach(function (other) {
    if (!other || other === 'bandit') return;
    if (factionDead(state, other)) return;
    const k = key(faction, other);
    if (st.noPeace[k]) return;
    if (st.emperor && st.emperor.coalitionTarget &&
        st.emperor.coalitionTarget === other &&
        (st.emperor.coalition || []).indexOf(faction) >= 0) {
      return;
    }
    if (st.endgame && st.endgame.active) return;
    if (war.makePeace(state, faction, other, true)) done.push(other);
  });
  return done;
}

/** 官渡是曹袁的生死局：不设两年逾期，也不会在阶段结束时议和。 */
function isGuanduStage(cfg) {
  return !!(cfg && cfg.stageFlag === 'guandu');
}

function finishPhase(state, faction, ok) {
  const st = state.story;
  const p = st.phases[faction];
  if (!p) return;
  const cfg = currentCfg(state, faction);
  if (!cfg) { p.status = 'done'; return; }

  // 防卡死：目标未达成时，等满两年就自动进入下一阶段；玩家故意阻挠也不能把天下锁死。
  // 官渡例外：曹袁必须打到一方灭亡，不能靠逾期收兵把剧情提前结束。
  if (!ok && isGuanduStage(cfg)) return;
  // 官渡/赤壁这类史实决战，即便目标提前达成，也要让战局在台上留满规定天数。
  const minBattleDays = Math.max(0, Number(cfg.minBattleDays) || 0);
  if (minBattleDays) {
    const startedDay = Number(p.startedDay) || 0;
    if (state.clock.day - startedDay < minBattleDays) return;
  }
  if (!ok) {
    const deadline = STORY.phaseDeadlineDays || 720;
    if (state.clock.day - (p.startedDay || state.clock.day) < deadline) return;
    const peaceTo = phasePeace(state, faction, cfg);
    p.status = 'rest';
    p.success = false;
    p.timedOut = true;
    p.completed += 1;
    if (cfg.stage === 3 && st.stage3Done) st.stage3Done[faction] = state.clock.day;
    if (cfg.id === 'wei_xiliang') st.xiliangDone = true;
    p.nextId = cfg.timeoutNext || cfg.next || 'end';
    p.restUntil = state.clock.day + (cfg.timeoutRestDays || 0);
    if (cfg.id === 'yuan_duel' || cfg.id === 'gongsun_duel') {
      st.duel.ended = true;
      st.duel.winner = null;
    }
    st.targets[faction] = [];
    delete st.priority[faction];
    war.abortCampaign(state, faction);
    const lines = (cfg.timeoutLines || [
      '两年过去，' + displayLabel(cfg) + '仍未达成。',
      '再拖下去只会把国力耗空，只能暂且收兵，把这一页翻过去。',
    ]).slice();
    if (peaceTo.length) lines.push('与' + peaceTo.map(factionName).join('、') + '遣使议和，两家收兵。');
    pushStoryEvent(state, displayLabel(cfg) + ' · 逾期', lines, { tag: '战略', art: 'peace', auto: 8 });
    logFn(state, '【' + factionName(faction) + '】' + displayLabel(cfg) + '两年未成，自动进入下一阶段。', 'throne');
    refreshHeadline(state);
    return;
  }
  // 第一阶段（completed===0）是开局灭国战：不递停战书，也不预告下一步；
  // 否则“与刚被灭的吕布遣使议和”会暴露曹操接下来要往关中/荆州用兵。
  const opening = (p.completed || 0) === 0;
  const peaceTo = opening ? [] : phasePeace(state, faction, cfg);
  p.status = 'rest';
  p.success = true;
  p.timedOut = false;
  p.completed += 1;
  if (isGuanduStage(cfg) && st.guanduBattle) st.guanduBattle.done = true;
  if (cfg.stage === 3 && st.stage3Done) st.stage3Done[faction] = state.clock.day;
  if (cfg.id === 'wei_xiliang') st.xiliangDone = true;
  p.nextId = cfg.successNext || cfg.next || 'end';
  p.restUntil = state.clock.day + (cfg.restDays || STORY.restDays);
  st.targets[faction] = [];
  delete st.priority[faction];
  war.abortCampaign(state, faction);

  let lines = (cfg.successLines || []).slice();
  if (opening) {
    // 开局阶段只留战果，不把“下一阶段：……”写进公告。
    lines = lines.filter(function (line) {
      return !/^(下一阶段|下一战略|下一步)/.test(String(line).trim());
    });
  }
  if (peaceTo.length) {
    lines.push('与' + peaceTo.map(factionName).join('、') + '遣使议和，两家收兵，边关鼓角暂歇。');
  }
  const markTitle = displayLabel(cfg) + ' · 达成';
  if (opening) {
    // 第一阶段只发战略结果，不弹“议和”页，也不展示下一阶段目标。
    pushStoryEvent(state, markTitle, lines, {
      tag: '战略',
      auto: 8,
    });
  } else if (peaceTo.length) {
    // 真正递了停战书的阶段，走议和文书：大字是战略结果，小字写清为何收兵。
    pushPeaceEvent(state, markTitle, lines);
  } else {
    pushStoryEvent(state, markTitle, lines, {
      tag: '战略',
      art: 'peace',
      auto: 8,
    });
  }
  logFn(state, '【' + factionName(faction) + '】' + displayLabel(cfg) + '达成。', 'throne');

  if (cfg.id === 'yuan_duel' || cfg.id === 'gongsun_duel') {
    st.duel.ended = true;
    st.duel.winner = ok ? faction : null;
  }
  refreshHeadline(state);
}

function advancePhase(state, faction) {
  const st = state.story;
  const p = st.phases[faction];
  if (!p) return;
  const nextId = p.nextId;
  if (!nextId || nextId === 'end') {
    p.status = 'done';
    p.id = 'done';
    p.nextId = null;
    st.targets[faction] = [];
    delete st.priority[faction];
    war.abortCampaign(state, faction);
    refreshHeadline(state);
    return;
  }
  const cfg = phaseCfg(faction, nextId);
  if (!cfg) {
    p.status = 'done';
    return;
  }
  const oldCompleted = p.completed;
  st.phases[faction] = freshPhase(nextId);
  st.phases[faction].completed = oldCompleted;
  st.targets[faction] = [];
  refreshHeadline(state);
  if (!canBeginPhase(state, cfg)) {
    // 等待型阶段（如“等袁术灭亡后一个月”）保持 waiting，不递战书、不进战斗。
    if (cfg.waitFactionDead) enterWaitPhase(state, faction, cfg);
    return;
  }
  // 等待条件已经满足：直接跨过等待阶段，进入真正的下一战。
  if (cfg.waitFactionDead) {
    p.nextId = cfg.next || 'end';
    p.status = 'rest';
    p.restUntil = state.clock.day;
    advancePhase(state, faction);
    return;
  }
  startPhase(state, faction, {});
}

/** 进入“坐观成败”型等待阶段：只发一条大势文书，不向任何势力宣战。 */
function enterWaitPhase(state, faction, cfg) {
  const p = state.story.phases[faction];
  if (!p) return;
  p.status = 'waiting';
  p.startedDay = state.clock.day;
  p.nextId = cfg.next || null;
  state.story.targets[faction] = [];
  delete state.story.priority[faction];
  if (!state.story.waitEvents) state.story.waitEvents = {};
  if (state.story.waitEvents[faction + ':' + cfg.id]) return;
  state.story.waitEvents[faction + ':' + cfg.id] = true;
  pushStoryEvent(state, cfg.waitTitle || displayLabel(cfg), cfg.waitLines || [cfg.casusBelli], {
    tag: '大势', art: 'peace', auto: 8,
  });
  logFn(state, '【' + factionName(faction) + '】' + displayLabel(cfg) + '，按兵不动。', 'throne');
}

function tickPhase(state, faction) {
  const st = state.story;
  const p = st.phases[faction];
  if (!p || p.status === 'done') return;
  if (factionDead(state, faction) || !factionAlive(state, faction)) {
    p.status = 'done';
    st.targets[faction] = [];
    return;
  }
  const cfg = currentCfg(state, faction);

  if (p.status === 'waiting') {
    if (!cfg) { p.status = 'done'; return; }
    if (p.waitingForWar) {
      if (state.clock.day < (p.waitUntil || 0)) return;
      p.waitingForWar = false;
      startPhase(state, faction, { skipWait: true });
      return;
    }
    if (!canBeginPhase(state, cfg)) return;
    if (cfg.waitFactionDead) {
      p.status = 'rest';
      p.nextId = cfg.next || 'end';
      p.restUntil = state.clock.day;
      advancePhase(state, faction);
      return;
    }
    // 赤壁没打成（三家缺一）时，曹操直接从“坐等赤壁”转去扫西凉，不能卡在空阶段。
    if (cfg.waitChibi && faction === 'wei' && !st.chibiDone) {
      beginWeiXiliang(state);
      return;
    }
    startPhase(state, faction, {});
    return;
  }

  if (p.status === 'war') {
    if (!cfg) { p.status = 'done'; return; }
    if (phaseDone(state, faction, cfg)) {
      finishPhase(state, faction, true);
      return;
    }
    // 两年防卡死：官渡不适用，其余阶段照旧。
    if (!isGuanduStage(cfg) &&
        state.clock.day - (p.startedDay || state.clock.day) >= (STORY.phaseDeadlineDays || 720)) {
      finishPhase(state, faction, false);
    }
    return;
  }

  if (p.status === 'rest') {
    if (state.clock.day >= p.restUntil) advancePhase(state, faction);
    return;
  }
}

/* ------------------------------------------------------------ 袁术称帝 */

function maybeEmperor(state) {
  const st = state.story;
  if (!st || !st.emperor || st.emperor.declared) return;
  if (!factionAlive(state, 'yuanshu')) return;
  const attackers = (STORY.emperorAttackers || ['wei', 'wu']).filter(function (f) {
    return factionAlive(state, f);
  });
  if (!attackers.length) return;
  // 曹、孙各自完成第一阶段之后，再等三天，才由袁术称帝。
  const ready = attackers.every(function (f) {
    const p = st.phases[f];
    return p && (p.completed || 0) >= 1;
  });
  if (!ready) return;
  if (!st.emperor.pendingDay) {
    st.emperor.pendingDay = state.clock.day + (STORY.emperorDelayDays || 3);
    st.emperor.coalition = attackers.slice();
    st.emperor.coalitionTarget = 'yuanshu';
    return;
  }
  if (state.clock.day < st.emperor.pendingDay) return;
  st.emperor.declared = true;
  st.emperor.day = state.clock.day;

  attackers.forEach(function (f) {
    if (!war.atWar(state, f, 'yuanshu')) war.declare(state, f, 'yuanshu', true, true);
    // 不抢走当前阶段的主目标：袁术只是额外加入可打清单，让一部分兵力分出去。
    const cur = st.targets[f] || [];
    if (cur.indexOf('yuanshu') < 0) cur.push('yuanshu');
    st.targets[f] = cur;
    war.abortCampaign(state, f);
  });
  const lines = STORY.emperor.lines.slice();
  lines[1] = attackers.map(factionName).join('、') + '同时传檄，尽起两国兵马讨伐仲家。';
  pushWarEvent(state, STORY.emperor.title, lines);
  logFn(state, '袁术在寿春称帝，' + attackers.map(factionName).join('、') + '同时宣战；两国分兵攻袁术。', 'war');
  refreshHeadline(state);
}

/* ------------------------------------------------------------ 荆州解封 */

/* ------------------------------------------------------------ 赤壁史诗 */

function storySite(state, id) {
  return siteById(state.world, id);
}

/** 剧情直接换旗：保留城池建筑与基础守军，不经过围城结算。 */
function setStorySiteOwner(state, site, faction) {
  if (!site || !faction) return null;
  const old = site.ownerFaction || (site.playerOwned ? 'player' : null);
  if (old === faction && !site.playerOwned) return old;
  site.ownerFaction = faction;
  site.faction = faction;
  site.playerOwned = false;
  site.lordId = null;
  if (FACTIONS[faction]) {
    site.color = FACTIONS[faction].color;
    site.banner = FACTIONS[faction].banner;
  }
  const base = Number(site.garrisonBase) || Number(site.garrison) || 40;
  site.garrison = Math.max(28, Math.round(base * 0.45));
  site.garrisonBase = site.garrison;
  syncSiteRecruitList(site, faction, state);
  recordCapture(state, site, old, faction);
  return old;
}

function assignStorySites(state, faction, ids) {
  const taken = [];
  (ids || []).forEach(function (id) {
    const site = storySite(state, id);
    if (!site) return;
    const old = setStorySiteOwner(state, site, faction);
    taken.push({ id: id, name: site.name, old: old });
  });
  return taken;
}

function chibiPlayerParticipated(state, site) {
  const p = state && state.player;
  if (!p || !site || p.faction !== 'wei') return false;
  const x = Number(p.x);
  const y = Number(p.y);
  if (!isFinite(x) || !isFinite(y)) return false;
  return Math.max(Math.abs(x - site.x), Math.abs(y - site.y)) <= 16;
}

/** 曹操南取荆州：三镇直接换曹旗，进入一个月休战。 */
/** 设定两家或三家在指定日期前不得开战；剧情停战也走这套，免得 AI 当天翻脸。 */
function setTruce(state, factions, until) {
  const st = state && state.story;
  if (!st) return;
  if (!st.truce || typeof st.truce !== 'object') st.truce = {};
  const list = (factions || []).slice();
  list.forEach(function (a, i) {
    list.slice(i + 1).forEach(function (b) {
      const k = key(a, b);
      st.truce[k] = Math.max(Number(st.truce[k]) || 0, Number(until) || 0);
    });
  });
}

function clearTruce(state, factions) {
  const st = state && state.story;
  if (!st || !st.truce) return;
  const list = (factions || []).slice();
  list.forEach(function (a, i) {
    list.slice(i + 1).forEach(function (b) {
      delete st.truce[key(a, b)];
    });
  });
}

function truceUntil(state, a, b) {
  const st = state && state.story;
  if (!st || !st.truce) return 0;
  return Number(st.truce[key(a, b)]) || 0;
}

/** 完成第三阶段且还活着的魏蜀吴；未完成的国家不能入场争夺荆州。 */
function eligibleKingdoms(state) {
  const st = state && state.story;
  if (!st || !st.stage3Done) return [];
  return STORY.kingdoms.filter(function (f) {
    return !!st.stage3Done[f] && factionAlive(state, f);
  });
}

function allStage3Done(state) {
  const st = state && state.story;
  if (!st || !st.stage3Done) return false;
  return STORY.kingdoms.every(function (f) { return !!st.stage3Done[f]; });
}

/** 当前同时占着襄阳、新野、江陵的国家；没有则为 null。 */
function holderOfJingzhou(state) {
  const sites = STORY.jingzhouSites || [];
  if (!state || !sites.length) return null;
  return STORY.kingdoms.filter(function (f) {
    return allSitesOwned(state, f, sites);
  })[0] || null;
}

/** 曹操首次同时占尽荆州三镇：孙刘停战结盟，三家一起停火一个月。 */
function startChibiPrelude(state) {
  const st = state && state.story;
  if (!st || st.chibi || st.chibiDone) return false;
  if (!st.stage3Done || !st.stage3Done.wei) return false;
  if (holderOfJingzhou(state) !== 'wei') return false;
  if (!factionAlive(state, 'shu') || !factionAlive(state, 'wu')) return false;
  const day = state.clock.day;
  const cf = STORY.chibi || {};
  const until = day + (cf.caoRestDays || 30);
  stopMajorWars(state);
  STORY.kingdoms.forEach(function (f) { st.targets[f] = []; });
  setTruce(state, STORY.kingdoms, until);
  const taken = assignStorySites(state, 'wei', STORY.jingzhouSites);
  const c = {
    active: true,
    phase: 'rest',
    since: day,
    until: until,
    site: 'chibi',
    taken: taken,
    caoBefore: countTroops(state, 'wei'),
    caoAfterFire: 0,
    caoAfterBattle: 0,
    caoLordTarget: 0,
    caoLordsBefore: 0,
    caoLordsAfter: 0,
    deadLords: [],
    split: null,
    playerParticipated: false,
    gathered: false,
  };
  st.chibi = c;
  st.chibiDone = false;
  st.targets.wei = [];
  // 暂停荆州争霸，但保留已记的易主次数；赤壁后从孙刘分荆州重新开打。
  if (st.endgame) {
    st.endgame.active = false;
    st.endgame.phase = 'chibi';
    st.endgame.until = until;
  }
  if (st.jingzhou) {
    st.jingzhou.active = false;
    st.jingzhou.suspended = true;
    st.jingzhou.until = until;
  }
  const lines = (STORY.chibi && STORY.chibi.southLines || []).slice();
  lines.push('襄阳、新野、江陵三镇已归曹操；这是荆州战后的史实停战，孙刘两家停战结盟，与曹军约定一个月内不动兵。');
  pushStoryEvent(state, (STORY.chibi && STORY.chibi.southTitle) || '曹操南下', lines, {
    tag: '史实停战', art: 'war', auto: 10,
  });
  logFn(state, '曹操首次占尽荆州三镇：孙刘停战结盟，孙曹刘三家停火一个月，一个月后赤壁决战。', 'war');
  refreshHeadline(state);
  return true;
}

/** 赤壁火攻：开局先烧掉曹军八成，再留七日让孙刘联军围剿残部。 */
function beginChibiBattle(state) {
  const st = state.story;
  const c = st && st.chibi;
  if (!c || c.phase !== 'rest') return false;
  const cf = STORY.chibi || {};
  const battleDays = Math.max(1, Number(cf.battleDays) || 7);
  const day = state.clock.day;
  clearTruce(state, STORY.kingdoms);
  stopMajorWars(state);
  war.makePeace(state, 'shu', 'wu', true);
  war.declare(state, 'wei', 'shu', true, true);
  war.declare(state, 'wei', 'wu', true, true);
  st.targets.wei = ['shu', 'wu'];
  st.targets.shu = ['wei'];
  st.targets.wu = ['wei'];
  st.kingdomsAllAtWar = true;
  c.phase = 'battle';
  c.since = day;
  c.battleDays = battleDays;
  c.until = day + battleDays;
  c.caoBefore = countTroops(state, 'wei');
  const site = storySite(state, 'chibi');
  c.playerParticipated = chibiPlayerParticipated(state, site);
  // 所有孙曹刘军队向赤壁集结；只挪位置，不补兵，火攻损失按现有兵力算。
  if (state.storyHooks && state.storyHooks.stageChibi) {
    c.gathered = !!state.storyHooks.stageChibi(state);
  }
  let lost = 0;
  (state.lords || []).forEach(function (l) {
    if (!l || l.faction !== 'wei' || !l.alive || l.dead || l.prisoner) return;
    const n = army.troopCount(l.troops);
    if (n <= 0) return;
    const cut = Math.max(0, Math.round(n * (cf.fireLossPct || 0.8)));
    army.distributeLosses(l.troops, cut);
    lost += cut;
  });
  c.fireLoss = lost;
  c.caoAfterFire = countTroops(state, 'wei');
  const lines = (STORY.chibi && STORY.chibi.battleLines || []).slice();
  lines.push('火攻前曹军约 ' + c.caoBefore + ' 人，火后只剩约 ' + c.caoAfterFire + ' 人。');
  lines.push('孙刘联军合计约 ' + (countTroops(state, 'shu') + countTroops(state, 'wu')) +
    ' 人，沿江列阵，准备围剿曹军残部。');
  pushStoryEvent(state, (STORY.chibi && STORY.chibi.battleTitle) || '赤壁火起', lines, {
    tag: '史诗', art: 'war', auto: 10,
  });
  logFn(state, '赤壁火攻：曹军由 ' + c.caoBefore + ' 人折到 ' + c.caoAfterFire + ' 人；孙刘联军沿江围剿。', 'war');
  refreshHeadline(state);
  return true;
}

function aliveLordCount(state, faction) {
  return (state.lords || []).filter(function (l) {
    return l && l.faction === faction && l.alive && !l.dead && !l.retired && !l.prisoner;
  }).length;
}

/** 将帅值、武力值、军师档位三值之一，或任一排行榜上有名，都不能在赤壁写死。 */
function lordHasThreeValue(state, lord) {
  if (!lord) return false;
  if (lord.commandValue !== null && lord.commandValue !== undefined) return true;
  if (lord.forceValue !== null && lord.forceValue !== undefined) return true;
  if (lord.strategistGrade) return true;
  if (lord.generalRank !== null && lord.generalRank !== undefined) return true;
  if (lord.marshalRank !== null && lord.marshalRank !== undefined) return true;
  return !!(LORD_POWER_BY_ID[lord.id] || MARSHAL_BY_ID[lord.id] || STRATEGIST_BY_ID[lord.id]);
}

function caoDeathCandidates(state, protectedIds) {
  return (state.lords || []).filter(function (l) {
    if (!l || l.faction !== 'wei' || !l.alive || l.dead || l.retired || l.prisoner) return false;
    if (l.isPlayer || l.id === 'caocao' || l.rank === 'king') return false;
    if (protectedIds && protectedIds[l.id]) return false;
    // 三值之一、排行榜前列、君主都不进死亡名单。
    if (lordHasThreeValue(state, l)) return false;
    return true;
  }).sort(function (a, b) {
    const la = Number(a.level) || 5;
    const lb = Number(b.level) || 5;
    return la - lb || String(a.id).localeCompare(String(b.id));
  });
}

/** 战后把曹营领主裁到孙刘两家之和的一半；优先死低级，三值/上榜/君主豁免。 */
function killCaoLordsAtChibi(state) {
  const c = state.story.chibi;
  const target = Math.max(1, Math.round((aliveLordCount(state, 'shu') + aliveLordCount(state, 'wu')) / 2));
  const caoNow = aliveLordCount(state, 'wei');
  const want = Math.max(0, caoNow - target);
  const candidates = caoDeathCandidates(state, {});
  const killed = [];
  for (let i = 0; i < want && i < candidates.length; i++) {
    const l = candidates[i];
    l.dead = true;
    l.alive = false;
    l.retired = false;
    l.hidden = null;
    l.troops = {};
    l.prisoner = null;
    l.inCity = null;
    l.order = null;
    l.defending = null;
    l.chasing = false;
    l.hunting = false;
    l.fleeing = false;
    l.scattered = false;
    l.scatterUntilH = 0;
    l.engagedWith = null;
    l.engagedSinceH = null;
    l.patrolPath = null;
    l.patrolLoop = null;
    l.killedAt = 'chibi';
    l.deathDay = state.clock.day;
    (state.world.sites || []).forEach(function (s) {
      if (s.lordId === l.id) s.lordId = null;
    });
    killed.push(l.name || l.id);
  }
  c.deadLords = killed;
  c.caoLordTarget = target;
  c.caoLordsBefore = caoNow;
  c.caoLordsAfter = aliveLordCount(state, 'wei');
  if (killed.length < want) {
    logFn(state, '赤壁战后曹营可裁的低阶领主不足：需裁 ' + want + ' 人，实际只裁 ' + killed.length +
      ' 人；三值、排行榜与君主均已豁免。', 'war');
  }
  return killed;
}

function retreatCaoLords(state) {
  const fallback = storySite(state, 'xuchang') || storySite(state, 'luoyang');
  (state.lords || []).forEach(function (l) {
    if (!l || l.faction !== 'wei' || !l.alive || l.dead || l.prisoner || l.isPlayer) return;
    l.order = null;
    l.defending = null;
    l.chasing = false;
    l.hunting = false;
    l.fleeing = false;
    l.wander = null;
    l.patrolPath = null;
    l.patrolLoop = null;
    const home = storySite(state, l.home);
    const safe = home && (home.ownerFaction === 'wei' || (home.playerOwned && state.player.faction === 'wei'))
      ? home : fallback;
    if (safe) {
      l.inCity = safe.id;
      l.x = safe.x;
      l.y = safe.y;
    }
  });
}

/** 曹军退到一成，按孙刘领主数裁曹营领主；孙刘分荆州，进入半个月休战。 */
function resolveChibiBattle(state) {
  const st = state.story;
  const c = st && st.chibi;
  if (!c || c.phase !== 'battle') return false;
  const cf = STORY.chibi || {};
  const day = state.clock.day;
  const remainTarget = Math.max(0, Math.round((c.caoBefore || 0) * (cf.caoRemainPct || 0.1)));
  const current = countTroops(state, 'wei');
  if (current > remainTarget) {
    let left = current - remainTarget;
    const total = current;
    (state.lords || []).forEach(function (l) {
      if (left <= 0) return;
      if (!l || l.faction !== 'wei' || !l.alive || l.dead || l.prisoner) return;
      const n = army.troopCount(l.troops);
      if (n <= 0) return;
      const cut = Math.min(left, n, Math.max(0, Math.round((current - remainTarget) * n / total)));
      army.distributeLosses(l.troops, cut);
      left -= cut;
    });
  }
  c.caoAfterBattle = countTroops(state, 'wei');
  const killed = killCaoLordsAtChibi(state);
  retreatCaoLords(state);
  const shuAlive = factionAlive(state, 'shu');
  const wuAlive = factionAlive(state, 'wu');
  let split = { shu: [], wu: [] };
  if (shuAlive && wuAlive) {
    split.shu = ['xiangyang', 'xinye'];
    split.wu = ['jiangling'];
  } else if (shuAlive) {
    split.shu = STORY.jingzhouSites.slice();
  } else if (wuAlive) {
    split.wu = STORY.jingzhouSites.slice();
  }
  if (split.shu.length) assignStorySites(state, 'shu', split.shu);
  if (split.wu.length) assignStorySites(state, 'wu', split.wu);
  c.split = split;
  stopMajorWars(state);
  STORY.kingdoms.forEach(function (f) { st.targets[f] = []; });
  setTruce(state, STORY.kingdoms, day + (cf.aftermathRestDays || 15));
  c.phase = 'aftermath';
  c.since = day;
  c.until = day + (cf.aftermathRestDays || 15);
  const lines = (STORY.chibi && STORY.chibi.aftermathLines || []).slice();
  lines.push('曹营领主：战前 ' + c.caoLordsBefore + ' 人，战后 ' + c.caoLordsAfter +
    ' 人；目标为孙刘两家之和的一半（' + c.caoLordTarget + ' 人）。');
  if (killed.length) lines.push('战死曹将：' + killed.join('、') + '。');
  else lines.push('此战没有可裁的低阶曹将；三值、排行榜与君主均未写死。');
  if (c.playerParticipated) lines.push('你随曹军参加赤壁，乱军中杀出重围，没有被写死。');
  lines.push('曹操残部北撤，孙刘分荆州；半个月内不再开战。');
  pushStoryEvent(state, (STORY.chibi && STORY.chibi.aftermathTitle) || '曹操败走', lines, {
    tag: '史诗', art: 'war', auto: 10,
  });
  logFn(state, '赤壁决战：曹军余 ' + c.caoAfterBattle + ' 人，曹操北逃；曹营领主 ' +
    c.caoLordsBefore + '→' + c.caoLordsAfter + '（目标 ' + c.caoLordTarget + '），战死 ' +
    killed.length + ' 人；孙刘分荆州，休战半个月。', 'war');
  refreshHeadline(state);
  return true;
}

/** 赤壁善后结束：立刻把荆州争霸重新打开，不等曹操扫西凉。 */
function resumeJingzhouAfterChibi(state) {
  const st = state.story;
  if (!st || !st.chibiDone) return false;
  const eligible = eligibleKingdoms(state);
  if (!eligible.length) return false;
  const day = state.clock.day;
  const p = st.phases.wei;
  if (p && (p.id === 'wei_sworn' || p.id === 'wei_xiliang')) {
    st.phases.wei = freshPhase('wei_jingzhou');
    st.phases.wei.completed = p.completed || 0;
    st.phases.wei.status = 'waiting';
    st.phases.wei.nextId = 'end';
  }
  // 赤壁之后主线直接进入荆州三家争夺；西凉支线不再卡住流程。
  st.xiliangDone = true;
  const jz = st.jingzhou || {};
  jz.started = true;
  jz.active = true;
  jz.suspended = false;
  jz.final = false;
  jz.phase = 'battle';
  jz.since = day;
  jz.until = day + 120;
  jz.winner = null;
  jz.strong = null;
  jz.roundStartHolder = holderOfJingzhou(state);
  jz.lastSeenHolder = jz.roundStartHolder;
  if (!jz.eligible) jz.eligible = {};
  if (jz.takeoverCount === undefined) jz.takeoverCount = 0;
  if (jz.lastCountedHolder === undefined) jz.lastCountedHolder = holderOfJingzhou(state);
  if (jz.countingFromDay === undefined) jz.countingFromDay = 0;
  st.jingzhou = jz;
  st.endgame = {
    active: true,
    phase: 'battle',
    cycle: (st.endgame && st.endgame.cycle) || 1,
    since: day,
    until: jz.until,
    strongest: holderOfJingzhou(state),
    allies: [],
    initialCities: {},
    final: false,
    takeoverCount: jz.takeoverCount || 0,
  };
  st.jingzhouFocus = STORY.jingzhouSites.slice();
  st.kingdomsAllAtWar = true;
  // 赤壁善后的半个月停战到期，荆州争霸重新开打。
  clearTruce(state, STORY.kingdoms);
  syncJingzhouParticipants(state);
  logFn(state, '赤壁余烬：孙刘分荆州，半个月后三家重新争夺襄阳、新野、江陵。', 'war');
  refreshHeadline(state);
  return true;
}

/** 曹操首次占尽荆州三镇才触发赤壁；不是三家都完成第三阶段才触发。 */
function maybeChibi(state) {
  const st = state.story;
  if (!st || st.chibiDone || (st.jingzhou && st.jingzhou.final)) return false;
  if (st.chibi) {
    if (st.chibi.active) tickChibi(state);
    return true;
  }
  if (!st.stage3Done || !st.stage3Done.wei) return false;
  if (holderOfJingzhou(state) !== 'wei') return false;
  if (!factionAlive(state, 'shu') || !factionAlive(state, 'wu')) return false;
  return startChibiPrelude(state);
}

function tickChibi(state) {
  const st = state.story;
  const c = st && st.chibi;
  if (!c || c.done) return false;
  if (c.phase === 'rest' && state.clock.day >= (c.until || 0)) {
    beginChibiBattle(state);
    return true;
  }
  if (c.phase === 'battle') {
    // 玩家中途从别处赶到赤壁，也算参战；否则七日战局等于白开。
    if (!c.playerParticipated) {
      const site = storySite(state, 'chibi');
      if (chibiPlayerParticipated(state, site)) {
        c.playerParticipated = true;
        logFn(state, '你赶到赤壁江岸，与曹军残部会合；赤壁决战还没结束。', 'war');
        refreshHeadline(state);
      }
    }
    if (state.clock.day >= (c.until || 0)) {
      resolveChibiBattle(state);
      return true;
    }
  }
  if (c.phase === 'aftermath' && state.clock.day >= (c.until || 0)) {
    c.phase = 'done';
    c.done = true;
    c.active = false;
    st.chibiDone = true;
    pushStoryEvent(state, (STORY.chibi && STORY.chibi.finalTitle) || '赤壁余烬',
      (STORY.chibi && STORY.chibi.finalLines) || [
        '赤壁火灭，曹操北归，孙刘分荆州。',
        '半个月后，荆州三镇再次成为三家必争之地。',
      ], { tag: '史诗', art: 'peace', auto: 9 });
    const resumed = resumeJingzhouAfterChibi(state);
    if (!resumed) beginWeiXiliang(state);
    refreshHeadline(state);
    return true;
  }
  return false;
}

/** 赤壁之后、荆州争霸未开时的兜底：曹操回头扫西凉；一旦荆州开打就让位。 */
function beginWeiXiliang(state) {
  const st = state.story;
  if (!st || st.endgame || (st.jingzhou && st.jingzhou.started) || st.xiliangDone) return false;
  if (st.chibi && st.chibi.active) return false;
  if (!factionAlive(state, 'wei')) return false;
  const targets = ['ma', 'hansui'].filter(function (f) { return factionAlive(state, f); });
  const p = st.phases.wei;
  if (!targets.length) {
    st.xiliangDone = true;
    if (p && p.id === 'wei_sworn') {
      st.phases.wei = freshPhase('wei_jingzhou');
      st.phases.wei.completed = p.completed || 0;
      st.targets.wei = [];
    }
    return false;
  }
  if (!p || p.id === 'wei_xiliang' || p.id === 'wei_jingzhou') return false;
  const completed = p.completed || 0;
  st.phases.wei = freshPhase('wei_xiliang');
  st.phases.wei.completed = completed;
  st.targets.wei = [];
  startPhase(state, 'wei', {});
  return true;
}

/**
 * 荆州入场：先完成第三阶段的国家先入场，未完成的国家不能争夺。
 * 三家都完成后只影响“易主计数”，不影响先入场。
 */
function maybeJingzhou(state) {
  const st = state.story;
  if (!st || st.jingzhouDone) return false;
  if (st.chibi && st.chibi.active) return false;
  if (st.endgame && st.endgame.final) return false;
  const eligible = eligibleKingdoms(state);
  if (!eligible.length) return false;
  if (st.jingzhou && st.jingzhou.started) {
    syncJingzhouParticipants(state);
    return false;
  }
  const unlock = STORY.jingzhouUnlockRestDays || 30;
  const ready = eligible.some(function (f) {
    return state.clock.day >= (Number(st.stage3Done[f]) || 0) + unlock;
  });
  if (!ready) return false;
  return startJingzhou(state);
}

/* ------------------------------------------------------------ 边缘诸部 */

/** 大国第一阶段都打完后，边缘诸部才开始互相攻伐；只打与本土道路相邻的城。 */
function maybeEdgeWars(state) {
  const st = state.story;
  if (!st || st.edgeWarsDeclared) return;
  const firstDone = STORY.majors.every(function (f) {
    const p = st.phases[f];
    return p && (p.completed || 0) >= 1;
  });
  if (!firstDone || state.clock.day < (STORY.edgeWarDay || 0)) return;
  const edge = (STORY.edgeFactions || []).filter(function (f) { return factionAlive(state, f); });
  if (edge.length < 2) return;
  st.edgeWarsDeclared = true;
  const declared = [];
  for (let i = 0; i < edge.length; i++) {
    for (let j = i + 1; j < edge.length; j++) {
      const a = edge[i];
      const b = edge[j];
      if (a === 'nanman' && b === 'shanyue') continue;
      if (!war.atWar(state, a, b)) {
        if (war.declare(state, a, b, true, true)) declared.push([a, b]);
      }
    }
  }
  // 边缘诸部仍按既有逻辑互相攻伐，但不再向玩家弹“边地烽烟”，
  // 史实榜文只写魏、蜀、吴与袁绍这些主线势力。
  refreshHeadline(state);
}

/* ------------------------------------------------------------ 荆州争霸：三城易主循环 */

function kingdomAlive(state, f) { return factionAlive(state, f); }

function strongestKingdom(state, except) {
  const list = STORY.kingdoms.filter(function (f) {
    return factionAlive(state, f) && (!except || except.indexOf(f) < 0);
  });
  list.sort(function (a, b) { return powerOf(state, b) - powerOf(state, a); });
  return list[0] || null;
}

function jingzhouAllies(state, strong) {
  const eligible = eligibleKingdoms(state);
  return eligible.filter(function (f) { return f !== strong && factionAlive(state, f); });
}

function stopMajorWars(state) {
  STORY.kingdoms.forEach(function (a) {
    STORY.kingdoms.forEach(function (b) {
      if (a < b) war.makePeace(state, a, b, true);
    });
    war.abortCampaign(state, a);
  });
}

/** 荆州入场后，只有完成第三阶段的国家能主动争城；未完成国只能守自己的城。 */
function jingzhouSiteOwners(state) {
  const owners = {};
  (STORY.jingzhouSites || []).forEach(function (id) {
    const site = storySite(state, id);
    if (!site) return;
    const owner = site.ownerFaction;
    if (!owner || owner === 'bandit' || owner === 'player' || owner === 'rebel') return;
    if (!factionAlive(state, owner)) return;
    owners[owner] = true;
  });
  return Object.keys(owners);
}

/**
 * 曹操的荆州南下大营：宛城若还在刘表手里，入场时交给曹操。
 * 许昌—汝南—宛之间只有汝南是村，城网判定会把宛隔在门外；
 * 没有这座城，曹操的荆州战役根本起不来，只会转去打淮南或关中。
 * 只交一次，之后宛城丢了也不再凭空补旗。
 */
function ensureCaoJingzhouBase(state) {
  const st = state && state.story;
  const jz = st && st.jingzhou;
  if (!jz || !jz.started || !jz.active || jz.final || jz.weiBaseGiven) return false;
  if (!jz.eligible || !jz.eligible.wei) return false;
  const baseId = STORY.jingzhouCaoBase || 'wan';
  const base = storySite(state, baseId);
  if (!base || base.playerOwned || base.ownerFaction === 'wei') {
    jz.weiBaseGiven = true;
    return false;
  }
  // 只从刘表手里接宛城；若已被蜀吴先占，不能凭空改旗。
  if (base.ownerFaction !== 'biao') return false;
  assignStorySites(state, 'wei', [baseId]);
  jz.weiBaseGiven = true;
  logFn(state, '曹操以宛城为南下大营，曹军从南阳直压襄阳、新野。', 'war');
  return true;
}

/**
 * 把当前有资格的国家和荆州三镇的实际归属同步到外交层：
 *  - 已完成第三阶段的国家互相开战；
 *  - 三镇若在未完成国手里，入场国也要向它开战才能夺城；
 *  - 未完成国不写入荆州争夺目标，避免它们主动来抢。
 */
function syncJingzhouParticipants(state) {
  const st = state.story;
  const jz = st && st.jingzhou;
  if (!jz || !jz.started || !jz.active || jz.final) return;
  if (st.chibi && st.chibi.active) return;
  const eligible = eligibleKingdoms(state);
  const next = {};
  eligible.forEach(function (f) { next[f] = true; });
  jz.eligible = next;
  ensureCaoJingzhouBase(state);
  const owners = jingzhouSiteOwners(state);
  eligible.forEach(function (f) {
    const foes = {};
    eligible.forEach(function (g) { if (g !== f) foes[g] = true; });
    owners.forEach(function (g) { if (g !== f) foes[g] = true; });
    const list = Object.keys(foes).filter(function (g) {
      return factionAlive(state, g) && g !== 'bandit' && g !== 'player' && g !== 'rebel';
    });
    st.targets[f] = list;
    list.forEach(function (g) {
      if (!war.atWar(state, f, g)) war.declare(state, f, g, true, true);
    });
  });
  const holder = holderOfJingzhou(state);
  jz.holder = holder;
  st.endgame.strongest = holder || st.endgame.strongest || null;
  st.endgame.allies = holder ? eligible.filter(function (f) { return f !== holder; }) : [];
  if (allStage3Done(state)) {
    if (!jz.countingFromDay) {
      jz.countingFromDay = state.clock.day;
      // 三家完成第三阶段时已经在位的霸主算基线，不算一次易主。
      jz.lastCountedHolder = holder;
    }
  }
  const known = jz.knownEligible || null;
  const newlyJoined = known ? eligible.filter(function (f) { return !known[f]; }) : [];
  if (newlyJoined.length) {
    pushStoryEvent(state, '荆州入场：' + newlyJoined.map(factionName).join('、'), [
      newlyJoined.map(factionName).join('、') + '完成第三阶段，休整已毕，正式加入荆州三镇争夺。',
      '未完成第三阶段的国家仍不能主动争夺三镇。',
    ], { tag: '会战', art: 'war', auto: 8 });
    logFn(state, '荆州入场：' + newlyJoined.map(factionName).join('、') + '完成第三阶段。', 'war');
  }
  jz.knownEligible = next;
  st.endgame.takeoverCount = jz.takeoverCount || 0;
  if (newlyJoined.length) refreshHeadline(state);
}

/** 只有“同时占尽三镇”的新主人，才算一次三城易主。 */
function noteJingzhouHolder(state, holder) {
  const jz = state.story && state.story.jingzhou;
  if (!jz) return;
  if (!allStage3Done(state)) {
    if (holder) jz.lastCountedHolder = holder;
    return;
  }
  if (!jz.countingFromDay) {
    jz.countingFromDay = state.clock.day;
    jz.lastCountedHolder = holder;
    return;
  }
  const prev = jz.lastCountedHolder;
  if (holder && prev && holder !== prev) {
    jz.takeoverCount = (Number(jz.takeoverCount) || 0) + 1;
    if (state.story.endgame) state.story.endgame.takeoverCount = jz.takeoverCount;
    logFn(state, '荆州三镇第 ' + jz.takeoverCount + ' 次易主：' + factionName(holder) + '同时占尽襄阳、新野、江陵。', 'war');
  }
  if (holder) jz.lastCountedHolder = holder;
}

function startJingzhou(state) {
  const st = state.story;
  if (!st || st.jingzhouDone) return false;
  if (st.endgame && st.endgame.active && st.endgame.phase === 'battle') return false;
  const eligible = eligibleKingdoms(state);
  if (!eligible.length) return false;
  const day = state.clock.day;
  const holder = holderOfJingzhou(state);
  const jz = st.jingzhou && st.jingzhou.started ? st.jingzhou : {};
  jz.started = true;
  jz.sites = STORY.jingzhouSites.slice();
  jz.active = true;
  jz.suspended = false;
  jz.final = false;
  jz.phase = 'battle';
  jz.since = day;
  jz.until = day + 120;
  jz.cycle = jz.started && jz.cycle ? jz.cycle : 1;
  jz.winner = null;
  jz.strong = null;
  jz.roundStartHolder = holder;
  jz.lastSeenHolder = holder;
  if (jz.takeoverCount === undefined) jz.takeoverCount = 0;
  if (jz.lastCountedHolder === undefined) jz.lastCountedHolder = holder;
  if (jz.countingFromDay === undefined) jz.countingFromDay = 0;
  if (!jz.eligible) jz.eligible = {};
  st.jingzhou = jz;
  st.endgame = {
    active: true,
    phase: 'battle',
    cycle: 1,
    since: day,
    until: jz.until,
    strongest: holder,
    allies: holder ? eligible.filter(function (f) { return f !== holder; }) : [],
    initialCities: {},
    final: false,
    takeoverCount: jz.takeoverCount || 0,
  };
  st.jingzhouFocus = STORY.jingzhouSites.slice();
  st.kingdomsAllAtWar = true;
  if (!st.targetRegion) st.targetRegion = {};
  eligible.forEach(function (f) { st.targetRegion[f] = null; war.abortCampaign(state, f); });
  // 先结束旧的三国互战，再按“完成第三阶段”的名单重新宣战。
  stopMajorWars(state);
  STORY.kingdoms.forEach(function (f) { st.targets[f] = []; });
  syncJingzhouParticipants(state);
  const names = eligible.map(factionName).join('、');
  const lines = (STORY.jingzhou && STORY.jingzhou.lines || []).slice();
  lines[0] = names + '已完成第三阶段，先入场争夺荆州；未完成的国家不能主动争夺三镇。';
  pushStoryEvent(state, STORY.jingzhou.title, lines, { tag: '会战', art: 'war', auto: 9 });
  logFn(state, '荆州开战：' + names + '入场；襄阳、新野、江陵三镇开始争夺。', 'war');
  refreshHeadline(state);
  return true;
}

function beginJingzhouCycle(state) {
  const st = state.story;
  const eg = st && st.endgame;
  const jz = st && st.jingzhou;
  if (!eg || !jz) return false;
  if (jz.final || jz.takeoverCount > (STORY.jingzhouMaxTakeovers || 10)) {
    beginFinalJingzhou(state);
    return true;
  }
  eg.cycle = (eg.cycle || 1) + 1;
  eg.phase = 'battle';
  eg.since = state.clock.day;
  eg.until = state.clock.day + 120;
  jz.active = true;
  jz.cycle = eg.cycle;
  jz.since = eg.since;
  jz.until = eg.until;
  jz.winner = null;
  jz.roundStartHolder = holderOfJingzhou(state);
  jz.lastSeenHolder = jz.roundStartHolder;
  // 上一轮停战已到期；结盟关系和攻击目标重新按当前三镇归属铺开。
  clearTruce(state, STORY.kingdoms);
  syncJingzhouParticipants(state);
  const king = holderOfJingzhou(state);
  const allies = eligibleKingdoms(state).filter(function (f) { return f !== king; });
  const lines = (STORY.jingzhou && STORY.jingzhou.cycleLines || []).slice();
  lines[0] = '第' + eg.cycle + '轮荆州争霸开始；三镇已易主 ' + (jz.takeoverCount || 0) + ' 次。';
  if (king) lines[1] = factionName(king) + '占着荆州三镇，' + allies.map(factionName).join('、') + '结盟来攻。';
  else lines[1] = '荆州三镇暂无霸主，三家继续混战。';
  pushStoryEvent(state, STORY.jingzhou.cycleTitle, lines, { tag: '会战', art: 'war', auto: 9 });
  logFn(state, '荆州第' + eg.cycle + '轮：' + (king ? allies.map(factionName).join('、') + '合攻' + factionName(king) : '三家混战') +
    '；三镇易主 ' + (jz.takeoverCount || 0) + ' 次。', 'war');
  refreshHeadline(state);
  return true;
}

function beginFinalJingzhou(state) {
  const st = state.story;
  const eg = st && st.endgame;
  const jz = st && st.jingzhou;
  if (!eg || !jz || jz.final) return false;
  const day = state.clock.day;
  eg.phase = 'final';
  eg.final = true;
  eg.since = day;
  eg.until = 0;
  jz.active = false;
  jz.final = true;
  jz.phase = 'final';
  st.jingzhouDone = true;
  st.endgame.takeoverCount = jz.takeoverCount || 0;
  eg.strongest = holderOfJingzhou(state) || eg.strongest || null;
  eg.allies = [];
  // 三家都完成第三阶段后，三镇易主已超过十次：停战作废，全部 eligible 互相开战。
  clearTruce(state, STORY.kingdoms);
  const eligible = eligibleKingdoms(state);
  eligible.forEach(function (a) {
    st.targets[a] = eligible.filter(function (b) { return b !== a; });
    eligible.forEach(function (b) {
      if (a < b && !war.atWar(state, a, b)) war.declare(state, a, b, true, true);
    });
  });
  // 荆州增益仍按“同时占着三镇”实时生效；但不再给任何国家额外的 +50% 杀敌。
  STORY.kingdoms.forEach(function (f) {
    if (FACTION_COMBAT[f]) FACTION_COMBAT[f].killMul = 1;
  });
  st.jingzhouKillBonus = null;
  const lines = (STORY.jingzhou && STORY.jingzhou.finalLines || []).slice();
  lines.unshift('三镇易主 ' + (jz.takeoverCount || 0) + ' 次（从魏蜀吴都完成第三阶段后开始计数）。');
  pushStoryEvent(state, STORY.jingzhou.finalTitle, lines, { tag: '会战', art: 'war', auto: 9 });
  logFn(state, '荆州三镇易主超过十次：停战作废，三家不死不休。', 'war');
  refreshHeadline(state);
  return true;
}

/** 小国最后一块城多挨着谁，就并给谁；没有相邻大国时归当前最强的一家。 */
function nearestKingdomFor(state, faction) {
  const mine = citiesOf(state, faction).map(function (s) { return s.id; });
  let best = null;
  let bestScore = 0;
  STORY.kingdoms.forEach(function (k) {
    if (!factionAlive(state, k)) return;
    const theirs = citiesOf(state, k);
    let score = 0;
    mine.forEach(function (a) {
      theirs.forEach(function (b) {
        if (siteAdjacent(a, b.id)) score += 1;
      });
    });
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  });
  return best || strongestKingdom(state);
}

/**
 * 三国乱战的停战期：还挂着旧旗的小国由邻近的魏蜀吴吞并，
 * 君主退隐、残部并入胜方，避免荆州打到一半还有第三方在边上捡城。
 */
function sweepMinorFactions(state) {
  const st = state.story;
  if (!st || !st.endgame) return [];
  const minor = Object.keys(FACTIONS).filter(function (id) {
    if (id === 'bandit' || id === 'player' || id === 'rebel') return false;
    if (STORY.kingdoms.indexOf(id) >= 0) return false;
    return factionAlive(state, id);
  });
  const swept = [];
  minor.forEach(function (id) {
    const to = nearestKingdomFor(state, id);
    if (!to) return;
    const sites = citiesOf(state, id);
    sites.forEach(function (site) { setStorySiteOwner(state, site, to); });
    Object.keys(FACTIONS).forEach(function (other) {
      if (other !== id && other !== 'bandit') war.makePeace(state, id, other, true);
    });
    war.abortCampaign(state, id);
    if (state.storyHooks && state.storyHooks.fallFaction) {
      state.storyHooks.fallFaction(state, id, { silent: true });
    } else {
      const fs = state.factionState[id] || (state.factionState[id] = {});
      fs.dead = true;
      fs.deadDay = state.clock.day;
    }
    swept.push({ id: id, name: factionName(id), to: to, sites: sites.length });
  });
  if (!swept.length) return swept;
  const detail = swept.slice(0, 4).map(function (x) {
    return x.name + '并入' + factionName(x.to);
  }).join('；');
  pushStoryEvent(state, '三国定鼎', [
    '荆州休战，魏、蜀、吴三家回头把地图上还挂着旧旗的小国一并收了。',
    detail + (swept.length > 4 ? '；其余小国也望风归降。' : '。'),
    '从此天下只剩三家，荆州三镇便是最后的战场。',
  ], { tag: '大势', art: 'peace', auto: 9 });
  logFn(state, '荆州停战：' + detail + '，天下只剩魏蜀吴三家。', 'throne');
  refreshHeadline(state);
  return swept;
}

function endJingzhouRound(state, winner, captured) {
  const st = state.story;
  const eg = st && st.endgame;
  const jz = st && st.jingzhou;
  if (!eg || !jz || eg.phase !== 'battle') return;
  const holder = winner || holderOfJingzhou(state);
  noteJingzhouHolder(state, holder);
  // 曹操首次占尽三镇不是普通荆州停战，而是赤壁前的一个月休整。
  if (holder === 'wei' && maybeChibi(state)) return;
  // 超过十次易主：这一次占城不再换停战，直接进入三家不死不休。
  if ((jz.takeoverCount || 0) > (STORY.jingzhouMaxTakeovers || 10)) {
    beginFinalJingzhou(state);
    return;
  }
  const strong = holder || eg.strongest || strongestKingdom(state);
  eg.strongest = strong;
  eg.allies = eligibleKingdoms(state).filter(function (f) { return f !== strong; });
  eg.phase = 'rest';
  eg.since = state.clock.day;
  eg.until = state.clock.day + (STORY.jingzhouCycleRestDays || 30);
  jz.active = false;
  jz.winner = holder;
  jz.strong = strong;
  jz.until = eg.until;
  jz.roundStartHolder = holder;
  stopMajorWars(state);
  STORY.kingdoms.forEach(function (f) { st.targets[f] = []; });
  setTruce(state, STORY.kingdoms, eg.until);
  // 停战期先把还活着的小国收掉，再发本轮荆州文书。
  sweepMinorFactions(state);
  const isCapture = captured !== false;
  const lines = holder ? (isCapture ? [
    factionName(holder) + '占尽襄阳、新野、江陵，三镇尽落其手。',
    '魏、蜀、吴三家依例遣使立约：停战一个月，各守现有疆界；胜者全国募兵效率 +50%。',
    '这就是荆州战后的史实停战；一个月后，另外两家会从汉中、夷陵、合肥再来争荆州。',
  ] : [
    factionName(holder) + '仍据襄阳、新野、江陵，这一轮没有新的霸主。',
    '三家就地收兵，停战一个月；胜者全国募兵效率 +50%。',
    '一个月后重开荆州；三镇仍是最先要争的地方。',
  ]) : [
    '这一轮谁也没能独吞荆州三镇。',
    strongestKingdom(state) ? (factionName(strong) + '兵势最盛，被另外两家视为霸主。') : '三家各自收兵。',
    '休整一个月，再战荆州。',
  ];
  const eventTitle = holder
    ? (isCapture ? '史实停战：' + factionName(holder) : '荆州休战：' + factionName(holder))
    : '荆州休战';
  pushStoryEvent(state, eventTitle, lines, {
    tag: isCapture ? '史实停战' : '会战', art: 'peace', auto: 9,
  });
  logFn(state, holder
    ? (isCapture ? '史实停战：' + factionName(holder) + '占尽荆州三镇，停战一个月。' : '荆州休战：' + factionName(holder) + '仍据三镇。')
    : '荆州休战一个月。', 'war');
  refreshHeadline(state);
}

function tickJingzhou(state) {
  const st = state.story;
  const jz = st && st.jingzhou;
  if (!jz || !jz.active) return;
  // 记录 tick 前的三镇主人：同一国丢掉一城后再占尽，也要重新发一次史实停战。
  const prevHolder = jz.lastSeenHolder !== undefined ? jz.lastSeenHolder : (jz.roundStartHolder || null);
  syncJingzhouParticipants(state);
  const holder = holderOfJingzhou(state);
  jz.lastSeenHolder = holder;
  noteJingzhouHolder(state, holder);
  if (holder && holder !== prevHolder) {
    endJingzhouRound(state, holder, true);
    return;
  }
  if (state.clock.day >= (jz.until || 0)) endJingzhouRound(state, holder || null, false);
}

/** 最终阶段（三镇易主超过十次后）也会被玩家拖住；满两年强制推举共主。 */
function forceEndgameUnification(state) {
  const eg = state.story.endgame;
  if (!eg || eg.forced) return false;
  const alive = STORY.kingdoms.filter(function (f) { return factionAlive(state, f); });
  const winner = (eg.strongest && alive.indexOf(eg.strongest) >= 0 ? eg.strongest : null)
    || strongestKingdom(state) || alive[0];
  if (!winner) return false;
  (state.world.sites || []).forEach(function (s) {
    if (s.id === 'edge_town') return;
    if (s.type !== 'town' && s.type !== 'castle') return;
    s.ownerFaction = winner;
    s.faction = winner;
    s.playerOwned = false;
    syncSiteRecruitList(s, winner, state);
  });
  eg.forced = true;
  eg.forcedWinner = winner;
  eg.forcedDay = state.clock.day;
  const playerInWinner = winner === 'player' || state.player.faction === winner;
  pushStoryEvent(state, STORY.unification ? STORY.unification.forceTitle || '天下易主' : '天下易主', [
    '荆州三镇打了两年，最后一座城仍悬而未决。',
    '各地军头不愿再耗，合推' + factionName(winner) + '为共主，望风归降。',
    playerInWinner
      ? '旧旗一夜之间换了颜色；接下来，天下还不会太平。'
      : '旧旗一夜之间换了颜色；这一面旗里没有你的位置，你只能另寻出路。',
  ], { tag: '终局', art: 'war', auto: 9 });
  logFn(state, '两年僵持结束：' + factionName(winner) + '被推为共主，天下归旗。', 'war');
  refreshHeadline(state);
  return true;
}

function tickEndgame(state) {
  const st = state.story;
  const eg = st.endgame;
  if (!eg || !eg.active) return;
  if (eg.phase === 'battle') {
    if (STORY.kingdoms.filter(function (f) { return factionAlive(state, f); }).length <= 1) return;
    tickJingzhou(state);
    return;
  }
  if (eg.phase === 'rest') {
    if (state.clock.day >= (eg.until || 0)) beginJingzhouCycle(state);
    return;
  }
  if (eg.phase === 'final') {
    if (!eg.forced && state.clock.day - (eg.since || state.clock.day) >= (STORY.phaseDeadlineDays || 720)) {
      forceEndgameUnification(state);
      return;
    }
    const alive = STORY.kingdoms.filter(function (f) { return factionAlive(state, f); });
    if (alive.length <= 1) return;
    // 不死不休：所有还活着的国家互相开战，不再有霸主—联盟的停战结构。
    alive.forEach(function (a) {
      st.targets[a] = alive.filter(function (b) { return b !== a; });
      alive.forEach(function (b) {
        if (a < b && !war.atWar(state, a, b)) war.declare(state, a, b, true, true);
      });
    });
    return;
  }
}

/** 兼容旧导出：旧“乱国循环”的入口等价于新的荆州争霸。 */
function startEndgame(state) {
  return startJingzhou(state);
}

function beginGang(state) { return startJingzhou(state); }
function beginTwoStrong(state) { return beginJingzhouCycle(state); }
function beginTripleRest(state) { return beginFinalJingzhou(state); }
function endJingzhou(state, winner) { return endJingzhouRound(state, winner); }

/* ------------------------------------------------------------ 灭国归属 *//* ------------------------------------------------------------ 灭国归属 */

function recordCapture(state, site, oldFaction, byFaction) {
  const st = state.story;
  if (!st || !site || !oldFaction || oldFaction === byFaction) return;
  if (st.passive[oldFaction]) {
    if (!st.retake[oldFaction]) st.retake[oldFaction] = [];
    if (st.retake[oldFaction].indexOf(site.id) < 0) st.retake[oldFaction].push(site.id);
  }
  if (st.retake[byFaction]) {
    const i = st.retake[byFaction].indexOf(site.id);
    if (i >= 0) st.retake[byFaction].splice(i, 1);
  }
  const fs = state.factionState && state.factionState[oldFaction];
  if (fs) {
    const left = citiesOf(state, oldFaction).length;
    if (!left) {
      fs.lastConqueror = byFaction || null;
      fs.lastCityId = site.id;
      fs.lastLossDay = state.clock.day;
    }
  }
  const fsBy = state.factionState && state.factionState[byFaction];
  if (fsBy && citiesOf(state, byFaction).length > 0) fsBy.lastConqueror = null;

  // 官渡之后：只有配置仍压低袁军时，才触发“大军溃散”的战况文书。
  const yuanPenaltyPower = Number(STORY.yuanWeakPower);
  if (st.yuanWeak && isFinite(yuanPenaltyPower) && yuanPenaltyPower < 0.999 &&
      factionAlive(state, 'yuan') && oldFaction === 'yuan' &&
      byFaction === 'wei' && !st.yuanBattleLost) {
    st.yuanBattleLost = true;
    state.lords.forEach(function (l) {
      if (l.faction === 'yuan' && l.alive && !l.dead) l.morale = Math.min(l.morale || 70, 70);
    });
    pushStoryEvent(state, '官渡败讯', [
      '官渡前线溃散，袁绍的河北大军丢下粮车与旌旗，退回黄河北岸。',
      '袁绍不听田丰、沮授之言，斩将换令，军中人人自危。',
      '从此袁军士气低迷，对碰只剩八成；这支部队要一直撑到曹操把袁氏灭亡。',
    ], { tag: '大势', art: 'war', auto: 8 });
    logFn(state, '官渡败讯：袁绍军心涣散，对碰系数保持 0.8，直到袁氏灭亡。', 'war');
    refreshHeadline(state);
  }
}

/* ------------------------------------------------------------ 主循环 */

function refreshHeadline(state) {
  const st = state.story;
  if (!st) return;
  const parts = [];
  // 荆州开打后，三国主线阶段已全部让位；不再显示“扫平西凉/坐等赤壁”这类旧标签。
  if (!(st.jingzhou && st.jingzhou.active)) {
    STORY.majors.forEach(function (f) {
      const p = st.phases[f];
      if (!p) return;
      if (p.status === 'done') return;
      const cfg = currentCfg(state, f);
      if (p.status === 'rest') {
        parts.push(FACTIONS[f].name + '：休整');
      } else if (cfg) {
        parts.push(FACTIONS[f].name + '：' + (cfg.short || cfg.label));
      }
    });
  }
  if (!st.duel.ended && factionAlive(state, 'yuan') && factionAlive(state, 'gongsun')) {
    parts.push('袁绍·公孙瓒：不死不休');
  }
  if (st.emperor && st.emperor.declared && factionAlive(state, 'yuanshu')) {
    parts.push('袁术：仲家称帝');
  }
  if (st.yuanWeak && factionAlive(state, 'yuan')) parts.push('袁绍：官渡昏君·八成战力');
  // 官渡与赤壁都给出“第几日/共几日”，让玩家在高倍速测试档下也能看出决战还没完。
  if (st.guanduBattle && !st.guanduBattle.done) {
    const gb = st.guanduBattle;
    const totalDays = Math.max(1, Number(gb.days) || (STORY.guandu && STORY.guandu.battleDays) || 7);
    const nowH = state.clock.day * 24 + state.clock.hour;
    const elapsedH = Math.max(0, nowH - (Number(gb.startedH) || 0));
    const dayNo = Math.min(totalDays, Math.floor(elapsedH / 24) + 1);
    parts.push('官渡：决战第 ' + dayNo + '/' + totalDays + ' 日');
  }
  if (st.chibi && !st.chibi.done) {
    const c = st.chibi;
    if (c.phase === 'battle') {
      const totalDays = Math.max(1, Number(c.battleDays) || STORY.chibi.battleDays || 7);
      const elapsed = Math.max(0, state.clock.day - (Number(c.since) || state.clock.day));
      const dayNo = Math.min(totalDays, Math.floor(elapsed) + 1);
      parts.push('赤壁：火攻决战 · 第 ' + dayNo + '/' + totalDays + ' 日');
    } else {
      parts.push('赤壁：曹操南下');
    }
  }
  if (st.jingzhou && st.jingzhou.active) parts.push('荆州：三家会战');
  if (st.endgame && st.endgame.active) parts.push('乱国：三国循环');
  st.headline = parts.join(' · ');
}

function tick(state) {
  const st = state.story;
  if (!state || !st || !st.mode) return;
  st.day = state.clock.day;
  applyYuanCombat(state, !!st.yuanWeak);
  yuanMoraleTick(state);
  if (state.gameOver) return;
  if (st.sandbox && st.openingPending) {
    const due = st.openingEventDay || STORY.openingEventDay || 3;
    if (state.clock.day >= due) beginOpeningWars(state);
  }
  maybeOpeningEvent(state);

  maybeEmperor(state);
  maybeEdgeWars(state);
  // 赤壁可能在任何时候由“曹操首次占尽三镇”触发，所以要先于荆州循环检查。
  maybeChibi(state);
  if (st.chibi && st.chibi.active) {
    refreshHeadline(state);
    return;
  }
  if (st.endgame && st.endgame.active) {
    tickEndgame(state);
    // 荆州已经开打时，未完成第三阶段的国家仍要继续推进自己的战略，
    // 否则它们永远无法入场；已完成的国家只会在 waited 阶段停住。
    Object.keys(st.phases).forEach(function (f) { tickPhase(state, f); });
    // 阶段推进可能把 targets 重置成别的战略目标；荆州在打时以三镇目标为准。
    syncJingzhouParticipants(state);
    refreshHeadline(state);
    return;
  }
  if (st.chibiDone && (!st.jingzhou || !st.jingzhou.started)) beginWeiXiliang(state);
  enforceStrategicBlockers(state);
  maybeJingzhou(state);
  if (st.endgame && st.endgame.active) {
    tickEndgame(state);
    Object.keys(st.phases).forEach(function (f) { tickPhase(state, f); });
    syncJingzhouParticipants(state);
    refreshHeadline(state);
    return;
  }
  Object.keys(st.phases).forEach(function (f) {
    tickPhase(state, f);
  });
  refreshHeadline(state);
}

module.exports = {
  init, resume, tick, refreshHeadline, recordCapture, bindLogger, resetCombat,
  isPassive, hasStory, siteAdjacent, factionAlive, factionDead, recruitRate,
  startEndgame, startPhase, beginGang, beginTwoStrong, beginTripleRest,
  maybeEmperor, maybeChibi, maybeJingzhou, endJingzhou,
  _private: {
    phaseDone, currentCfg, phaseCfg, phaseList, citiesOf, powerOf, eventLines, displayLabel,
    findBlockingFactions, startChibiPrelude, beginChibiBattle, resolveChibiBattle,
    startJingzhou, beginFinalJingzhou, sweepMinorFactions, beginWeiXiliang,
  },
};
