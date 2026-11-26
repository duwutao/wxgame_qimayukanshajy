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
const { LORD_POWER_BY_ID } = require('../data/lord-rank.js');
const { siteById } = require('./world.js');
const army = require('./army.js');
const war = require('./war.js');

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

/** 袁绍官渡状态：只有在配置明确压低战力时才启用；n46 起恢复为正常值。 */
function applyYuanCombat(state, weak) {
  if (!state || !state.story) return;
  if (!FACTION_COMBAT.yuan) FACTION_COMBAT.yuan = { power: 1 };
  const penaltyPower = Number(STORY.yuanWeakPower);
  const penaltyEnabled = isFinite(penaltyPower) && penaltyPower < 0.999;
  if (!penaltyEnabled) {
    FACTION_COMBAT.yuan.power = 1;
    state.story.yuanWeak = false;
    (state.lords || []).forEach(function (l) {
      if (l.faction !== 'yuan' || !l.alive || l.dead) return;
      if (l.storyMoraleCap) {
        l.morale = Math.max(typeof l.morale === 'number' ? l.morale : 0, l.preStoryMorale || 70);
        l.storyMoraleCap = null;
      }
    });
    return;
  }
  const on = !!weak && factionAlive(state, 'yuan');
  FACTION_COMBAT.yuan.power = on ? penaltyPower : 1;
  state.story.yuanWeak = on;
  if (on) {
    state.lords.forEach(function (l) {
      if (l.faction === 'yuan' && l.alive && !l.dead) {
        if (l.storyMoraleCap === undefined || l.storyMoraleCap === null) {
          l.preStoryMorale = typeof l.morale === 'number' ? l.morale : 60;
        }
        l.morale = Math.min(typeof l.morale === 'number' ? l.morale : 60, 35);
        l.storyMoraleCap = 35;
      }
    });
  }
}

function yuanMoraleTick(state) {
  const st = state.story;
  if (!st || !st.yuanWeak || !factionAlive(state, 'yuan')) return;
  const penaltyPower = Number(STORY.yuanWeakPower);
  if (!isFinite(penaltyPower) || penaltyPower >= 0.999) return;
  state.lords.forEach(function (l) {
    if (l.faction !== 'yuan' || !l.alive || l.dead) return;
    l.morale = Math.min(typeof l.morale === 'number' ? l.morale : 60, 35);
  });
}

function resetCombat() {
  if (FACTION_COMBAT.yuan) FACTION_COMBAT.yuan.power = 1;
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
  const st = state && state.story;
  if (st && st.endgame && st.endgame.active && st.endgame.strongest === faction) {
    return base * (STORY.jingzhouStrongRecruitMul || 1.2);
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
    '刘备按兵新野，只等第八日向刘璋递出“收取西川”的战书。',
    '南蛮与南越沿牂牁、交趾的山道开战，两边都不接议和书。',
    '南蛮自朱提下山，只掠刘璋的野战军，不围城池；南越沿新开的武陵道北上，只取长沙以南。',
    '马腾另据居延，新领地不与汉廷、韩遂接壤；汉廷与韩遂则在天水一线直接相邻，两家开战。',
  ]);
  logFn(state, '天下棋局已开：曹操讨吕布，孙权攻刘表，袁绍与公孙瓒不死不休；南蛮牵制刘璋、南越南下，马腾据居延，汉廷与韩遂相邻开战。', 'war');
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
  if (!state || !state.storyMode) return null;
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
    guanduStarted: false,
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
  ['wei', 'wu', 'shu', 'yuan', 'gongsun'].forEach(function (f) {
    if (st.phases[f]) startPhase(state, f, { silent: true, opening: true });
  });
  st.openingDeclared = true;
  if (state) state.openingWarsDeclared = true;
  refreshHeadline(state);
  return st;
}

/** 读档后恢复：状态都在存档里，只需要把上次的局面接上 */
function resume(state, logger) {
  if (logger) bindLogger(logger);
  if (!state || !state.storyMode || !state.story || !state.story.mode) return null;
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
  if (state.story.chibiDone === undefined) state.story.chibiDone = false;
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
  if (state.story.guanduStarted === undefined) state.story.guanduStarted = false;
  if (state.story.kingdomsAllAtWar === undefined) state.story.kingdomsAllAtWar = false;
  if (!state.story.targetRegion) state.story.targetRegion = {};
  applyYuanCombat(state, !!state.story.yuanWeak);
  if (state.story.jingzhouKillBonus && state.story.jingzhouKillBonus !== 'wei') {
    if (!FACTION_COMBAT[state.story.jingzhouKillBonus]) FACTION_COMBAT[state.story.jingzhouKillBonus] = { power: 1 };
    FACTION_COMBAT[state.story.jingzhouKillBonus].killMul = STORY.jingzhouKillMul || 1.5;
  }
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
  if (cfg.waitAllMajorsStage3) {
    if (!STORY.kingdoms || !STORY.kingdoms.every(function (f) { return st.stage3Done && st.stage3Done[f]; })) return false;
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
  if (cfg.id === 'wei_north' || cfg.id === 'yuan_guandu') st.guanduStarted = true;

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

  if (!silent && declared.length) {
    const lines = (cfg.warLines || [cfg.casusBelli]).slice();
    const names = declared.map(factionName).join('、');
    lines.push('战书已下：' + factionName(faction) + '向' + names + '正式宣战。');
    pushWarEvent(state, cfg.title || displayLabel(cfg), lines);
    logFn(state, '【' + factionName(faction) + '】' + displayLabel(cfg) + '：' + (cfg.casusBelli || ''), 'war');
  } else if (opening && declared.length) {
    logFn(state, '【' + factionName(faction) + '】' + displayLabel(cfg) + '，向' + declared.map(factionName).join('、') + '宣战。', 'war');
  }
  // 官渡开局：战书落下后再把曹袁两军补满、调到官渡列阵，并直接开一场合战。
  if ((cfg.stage === 'guandu' || cfg.stageFlag === 'guandu') && state.storyHooks && state.storyHooks.stageGuandu) {
    state.storyHooks.stageGuandu(state);
  }
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

function finishPhase(state, faction, ok) {
  const st = state.story;
  const p = st.phases[faction];
  if (!p) return;
  const cfg = currentCfg(state, faction);
  if (!cfg) { p.status = 'done'; return; }

  // 防卡死：目标未达成时，等满两年就自动进入下一阶段；玩家故意阻挠也不能把天下锁死。
  if (!ok) {
    const deadline = STORY.phaseDeadlineDays || 720;
    if (state.clock.day - (p.startedDay || state.clock.day) < deadline) return;
    const peaceTo = phasePeace(state, faction, cfg);
    p.status = 'rest';
    p.success = false;
    p.timedOut = true;
    p.completed += 1;
    if (cfg.stage === 3 && st.stage3Done) st.stage3Done[faction] = state.clock.day;
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
  if (cfg.stage === 3 && st.stage3Done) st.stage3Done[faction] = state.clock.day;
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
    startPhase(state, faction, {});
    return;
  }

  if (p.status === 'war') {
    if (!cfg) { p.status = 'done'; return; }
    if (phaseDone(state, faction, cfg)) {
      finishPhase(state, faction, true);
      return;
    }
    // 两年防卡死：无论是否 noTimeout，只要玩家把阶段拖满两年，就自动跳过。
    if (state.clock.day - (p.startedDay || state.clock.day) >= (STORY.phaseDeadlineDays || 720)) {
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
function startChibiPrelude(state) {
  const st = state.story;
  if (!st || st.chibi || st.jingzhou || st.endgame) return false;
  if (!stage3Done(state)) return false;
  const day = state.clock.day;
  const cf = STORY.chibi || {};
  stopMajorWars(state);
  STORY.kingdoms.forEach(function (f) { st.targets[f] = []; });
  const taken = assignStorySites(state, 'wei', STORY.jingzhouSites);
  const site = storySite(state, 'chibi');
  const c = {
    active: true,
    phase: 'rest',
    since: day,
    until: day + (cf.caoRestDays || 30),
    site: 'chibi',
    taken: taken,
    caoBefore: countTroops(state, 'wei'),
    caoAfterFire: 0,
    caoAfterBattle: 0,
    deadLords: [],
    split: null,
    playerParticipated: false,
  };
  st.chibi = c;
  st.chibiDone = false;
  st.targets.wei = [];
  const lines = (STORY.chibi && STORY.chibi.southLines || []).slice();
  lines.push('襄阳、新野、江陵三镇已归曹操；孙刘两家退保长江以南，暂避曹军锋芒。');
  pushStoryEvent(state, (STORY.chibi && STORY.chibi.southTitle) || '曹操南下', lines, {
    tag: '史诗', art: 'war', auto: 10,
  });
  logFn(state, '曹操沿荆州南下，取襄阳、新野、江陵；三国休战一个月，准备赤壁决战。', 'war');
  refreshHeadline(state);
  return true;
}

/** 赤壁火攻：先烧掉曹军八成，再留三天让孙刘联军与残军对决。 */
function beginChibiBattle(state) {
  const st = state.story;
  const c = st && st.chibi;
  if (!c || c.phase !== 'rest') return false;
  const cf = STORY.chibi || {};
  const day = state.clock.day;
  stopMajorWars(state);
  war.makePeace(state, 'shu', 'wu', true);
  war.declare(state, 'wei', 'shu', true, true);
  war.declare(state, 'wei', 'wu', true, true);
  st.targets.wei = ['shu', 'wu'];
  st.targets.shu = ['wei'];
  st.targets.wu = ['wei'];
  c.phase = 'battle';
  c.since = day;
  c.until = day + (cf.battleDays || 3);
  c.caoBefore = countTroops(state, 'wei');
  const site = storySite(state, 'chibi');
  c.playerParticipated = chibiPlayerParticipated(state, site);
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
    ' 人，沿江列阵，准备与曹军残部决战。');
  pushStoryEvent(state, (STORY.chibi && STORY.chibi.battleTitle) || '赤壁火起', lines, {
    tag: '史诗', art: 'war', auto: 10,
  });
  logFn(state, '赤壁火攻：曹军由 ' + c.caoBefore + ' 人折到 ' + c.caoAfterFire + ' 人；孙刘联军列阵决战。', 'war');
  refreshHeadline(state);
  return true;
}

function aliveLordCount(state, faction) {
  return (state.lords || []).filter(function (l) {
    return l && l.faction === faction && l.alive && !l.dead && !l.prisoner;
  }).length;
}

function caoDeathCandidates(state, protectedIds) {
  const rankLevel = { king: 9, lord: 7, general: 5 };
  return (state.lords || []).filter(function (l) {
    if (!l || l.faction !== 'wei' || !l.alive || l.dead || l.prisoner) return false;
    if (l.isPlayer || protectedIds[l.id]) return false;
    if (LORD_POWER_BY_ID[l.id]) return false; // 名将榜前 50 不上死亡名单
    const level = Number(l.level) || rankLevel[l.rank] || 5;
    return level <= 5;
  }).sort(function (a, b) {
    return (Number(a.level) || 5) - (Number(b.level) || 5) ||
      String(a.id).localeCompare(String(b.id));
  });
}

function killCaoLordsAtChibi(state) {
  const c = state.story.chibi;
  const target = Math.round((aliveLordCount(state, 'shu') + aliveLordCount(state, 'wu')) / 2);
  const caoNow = aliveLordCount(state, 'wei');
  const minDead = (STORY.chibi && STORY.chibi.minCaoLordsDead) || 4;
  const candidates = caoDeathCandidates(state, {});
  const want = Math.min(candidates.length, Math.max(0, caoNow - target, minDead));
  const killed = [];
  for (let i = 0; i < want && i < candidates.length; i++) {
    const l = candidates[i];
    l.dead = true;
    l.alive = false;
    l.troops = {};
    l.prisoner = false;
    l.inCity = null;
    l.order = null;
    l.defending = null;
    l.chasing = false;
    l.patrolPath = null;
    l.killedAt = 'chibi';
    l.deathDay = state.clock.day;
    (state.world.sites || []).forEach(function (s) {
      if (s.lordId === l.id) s.lordId = null;
    });
    killed.push(l.name || l.id);
  }
  c.deadLords = killed;
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

/** 曹军退到一成，低阶曹将战死；孙刘分荆州，进入两个月休战。 */
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
  c.phase = 'aftermath';
  c.since = day;
  c.until = day + (cf.aftermathRestDays || 60);
  const lines = (STORY.chibi && STORY.chibi.aftermathLines || []).slice();
  if (killed.length) lines.push('战死曹将：' + killed.join('、') + '。');
  else lines.push('这一战没有低阶曹将战死，曹军残部退回北方。');
  if (c.playerParticipated) lines.push('你随曹军参加赤壁，乱军中杀出重围，没有被写死。');
  lines.push('曹操残部北撤，孙刘分荆州；两个月内不再开战。');
  pushStoryEvent(state, (STORY.chibi && STORY.chibi.aftermathTitle) || '曹操败走', lines, {
    tag: '史诗', art: 'war', auto: 10,
  });
  logFn(state, '赤壁决战：曹军余 ' + c.caoAfterBattle + ' 人，曹操北逃；低阶曹将战死 ' +
    killed.length + ' 人；孙刘分荆州，休战两个月。', 'war');
  refreshHeadline(state);
  return true;
}

function maybeChibi(state) {
  const st = state.story;
  if (!st || st.chibiDone || st.jingzhou || st.endgame) return false;
  if (st.chibi) {
    tickChibi(state);
    return true;
  }
  if (!stage3Done(state)) return false;
  if (!STORY.kingdoms.every(function (f) { return factionAlive(state, f); })) return false;
  const last = Math.max.apply(null, STORY.kingdoms.map(function (f) { return st.stage3Done[f] || 0; }));
  if (state.clock.day < last + (STORY.jingzhouUnlockRestDays || 30)) return false;
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
  if (c.phase === 'battle' && state.clock.day >= (c.until || 0)) {
    resolveChibiBattle(state);
    return true;
  }
  if (c.phase === 'aftermath' && state.clock.day >= (c.until || 0)) {
    c.phase = 'done';
    c.done = true;
    c.active = false;
    st.chibiDone = true;
    pushStoryEvent(state, (STORY.chibi && STORY.chibi.finalTitle) || '赤壁余烬',
      (STORY.chibi && STORY.chibi.finalLines) || [
        '赤壁火灭，曹操北归，孙刘分荆州。',
        '两个月后，荆州三镇再次成为三家必争之地。',
      ], { tag: '史诗', art: 'peace', auto: 9 });
    logFn(state, '赤壁余烬：孙刘分荆州，休战两个月后开启荆州十轮争霸。', 'war');
    refreshHeadline(state);
    return true;
  }
  return false;
}

function maybeJingzhou(state) {
  const st = state.story;
  if (!st || st.endgame || st.jingzhouDone || st.jingzhou) return false;
  // 赤壁史诗必须先走完；旧档已经进入荆州循环的，不会被新层覆盖。
  if (!st.chibi || !st.chibi.done) return false;
  if (!STORY.kingdoms || !STORY.kingdoms.every(function (f) { return factionAlive(state, f); })) return false;
  if (!STORY.kingdoms.every(function (f) { return st.stage3Done && st.stage3Done[f]; })) return false;
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
  pushStoryEvent(state, '边地烽烟', [
    '魏、蜀、吴的第一阶段已告一段落，中原暂时收刀，边缘诸部却开始互相吞并。',
    '鲜卑、西凉、韩遂、南蛮、南越各自只打与本土道路直接相邻的城池，不肯远征。',
    '南蛮与南越仍在牂牁、交趾一线死战，谁递议和书都不接。',
  ], { tag: '大势', art: 'war', auto: 8 });
  logFn(state, '边缘诸部开始互相攻伐；南蛮与南越永不停战。', 'war');
  refreshHeadline(state);
}

/* ------------------------------------------------------------ 荆州争霸：十轮循环 */

function kingdomAlive(state, f) { return factionAlive(state, f); }

function stage3Done(state) {
  const st = state.story;
  if (!st || !STORY.kingdoms) return false;
  return STORY.kingdoms.every(function (f) {
    return !!(st.stage3Done && st.stage3Done[f]);
  });
}

function holderOfJingzhou(state) {
  const sites = (state.story.jingzhou && state.story.jingzhou.sites) || STORY.jingzhouSites || [];
  return STORY.kingdoms.filter(function (f) {
    return sites.length && allSitesOwned(state, f, sites);
  })[0] || null;
}

function strongestKingdom(state, except) {
  const list = STORY.kingdoms.filter(function (f) {
    return factionAlive(state, f) && (!except || except.indexOf(f) < 0);
  });
  list.sort(function (a, b) { return powerOf(state, b) - powerOf(state, a); });
  return list[0] || null;
}

function jingzhouAllies(state, strong) {
  return STORY.kingdoms.filter(function (f) {
    return f !== strong && factionAlive(state, f);
  });
}

function stopMajorWars(state) {
  STORY.kingdoms.forEach(function (a) {
    STORY.kingdoms.forEach(function (b) {
      if (a < b) war.makePeace(state, a, b, true);
    });
    war.abortCampaign(state, a);
  });
}

function startJingzhou(state) {
  const st = state.story;
  if (!st || st.endgame) return false;
  if (!STORY.kingdoms.every(function (f) { return factionAlive(state, f); })) return false;
  st.jingzhou = {
    active: true,
    sites: STORY.jingzhouSites.slice(),
    cycle: 1,
    since: state.clock.day,
    until: state.clock.day + 120,
    winner: null,
    strong: null,
  };
  st.jingzhouFocus = STORY.jingzhouSites.slice();
  st.endgame = {
    active: true,
    phase: 'battle',
    cycle: 1,
    since: state.clock.day,
    until: st.jingzhou.until,
    strongest: null,
    allies: [],
    initialCities: {},
    final: false,
  };
  st.kingdomsAllAtWar = true;
  if (!st.targetRegion) st.targetRegion = {};
  // 第一轮：三家互相开战，谁先占尽三镇谁就是霸主。
  STORY.kingdoms.forEach(function (a) {
    STORY.kingdoms.forEach(function (b) {
      if (a < b) war.declare(state, a, b, true, true);
    });
    st.targets[a] = STORY.kingdoms.filter(function (x) { return x !== a; });
    st.targetRegion[a] = null;
    war.abortCampaign(state, a);
  });
  pushStoryEvent(state, STORY.jingzhou.title, STORY.jingzhou.lines, { tag: '会战', art: 'war', auto: 9 });
  logFn(state, '三家会盟荆州：襄阳、新野、江陵三镇开战。', 'war');
  refreshHeadline(state);
  return true;
}

function beginJingzhouCycle(state) {
  const st = state.story;
  const eg = st.endgame;
  const king = eg.strongest;
  const allies = eg.allies && eg.allies.length ? eg.allies.slice() : jingzhouAllies(state, king);
  const round = eg.cycle || 1;
  if (round >= (STORY.jingzhouMaxCycles || 10)) {
    beginFinalJingzhou(state);
    return;
  }
  eg.cycle = round + 1;
  eg.phase = 'battle';
  eg.since = state.clock.day;
  eg.until = state.clock.day + 120;
  st.jingzhou.active = true;
  st.jingzhou.cycle = eg.cycle;
  st.jingzhou.until = eg.until;
  st.jingzhou.winner = null;
  // 结盟者彼此停战，只合力打霸主；霸主则同时打两家。
  if (allies.length >= 2) war.makePeace(state, allies[0], allies[1], true);
  [king].concat(allies).forEach(function (f) { war.abortCampaign(state, f); });
  if (king) {
    st.targets[king] = allies.slice();
    allies.forEach(function (a) {
      if (!war.atWar(state, a, king)) war.declare(state, a, king, true, true);
      st.targets[a] = [king];
    });
  } else {
    STORY.kingdoms.forEach(function (a) {
      st.targets[a] = STORY.kingdoms.filter(function (b) { return b !== a; });
      STORY.kingdoms.forEach(function (b) {
        if (a < b) war.declare(state, a, b, true, true);
      });
    });
  }
  pushStoryEvent(state, STORY.jingzhou.cycleTitle, [
    '第' + eg.cycle + '轮荆州争霸开始。',
    king ? (factionName(king) + '占着荆州三镇，' + allies.map(factionName).join('、') + '结盟来攻。') : '荆州三镇暂无霸主，三家继续混战。',
    king ? '曹刘在汉中到长安、洛阳一线开战；刘孙在夷陵、江陵、长沙、武陵开战；曹孙在合肥、庐江、寿春开战。' : '三军混战，谁先占尽三镇，谁就是新的霸主。',
  ], { tag: '会战', art: 'war', auto: 9 });
  logFn(state, '荆州第' + eg.cycle + '轮：' + (king ? allies.map(factionName).join('、') + '合攻' + factionName(king) : '三家混战'), 'war');
  refreshHeadline(state);
}

function beginFinalJingzhou(state) {
  const st = state.story;
  const eg = st.endgame;
  eg.phase = 'final';
  eg.final = true;
  eg.since = state.clock.day;
  eg.until = 0;
  st.jingzhou.active = false;
  st.jingzhou.final = true;
  st.jingzhouDone = true;
  stopMajorWars(state);
  const strong = eg.strongest;
  const allies = eg.allies || [];
  // 第十轮霸主：基础 +20% 募兵已在 endgame.strongest 上生效；
  // 额外 +50% 杀敌只给蜀、吴，曹操夺冠不享受这项红利。
  if (strong && strong !== 'wei') {
    if (!FACTION_COMBAT[strong]) FACTION_COMBAT[strong] = { power: 1 };
    FACTION_COMBAT[strong].killMul = STORY.jingzhouKillMul || 1.5;
    st.jingzhouKillBonus = strong;
  } else {
    st.jingzhouKillBonus = null;
  }
  // 第 10 轮不再停战：霸主与联盟不死不休。
  if (strong) {
    [strong].concat(allies).forEach(function (f) { war.abortCampaign(state, f); });
    st.targets[strong] = allies.slice();
    allies.forEach(function (a) {
      if (!war.atWar(state, a, strong)) war.declare(state, a, strong, true, true);
      st.targets[a] = [strong];
    });
    if (allies.length >= 2) war.makePeace(state, allies[0], allies[1], true);
  } else {
    STORY.kingdoms.forEach(function (a) {
      st.targets[a] = STORY.kingdoms.filter(function (b) { return b !== a; });
      STORY.kingdoms.forEach(function (b) {
        if (a < b) war.declare(state, a, b, true, true);
      });
    });
  }
  const finalLines = (STORY.jingzhou && STORY.jingzhou.finalLines || []).slice();
  if (strong && strong !== 'wei') {
    finalLines.push(factionName(strong) + '夺得第十轮荆州，杀敌效率额外 +50%。');
  } else if (strong) {
    finalLines.push(factionName(strong) + '夺得第十轮荆州；曹操不享受额外 +50% 杀敌。');
  }
  pushStoryEvent(state, STORY.jingzhou.finalTitle, finalLines, { tag: '会战', art: 'war', auto: 9 });
  logFn(state, '第十轮荆州争霸：不再停战，霸主与联盟不死不休。', 'war');
  if (strong && strong !== 'wei') logFn(state, factionName(strong) + '获得第十轮荆州额外杀敌 +50%。', 'war');
  refreshHeadline(state);
}

function endJingzhouRound(state, winner) {
  const st = state.story;
  const eg = st.endgame;
  if (!eg || eg.phase !== 'battle') return;
  const holder = winner || holderOfJingzhou(state);
  const strong = holder || eg.strongest || strongestKingdom(state);
  eg.strongest = strong;
  eg.allies = jingzhouAllies(state, strong);
  eg.phase = 'rest';
  eg.since = state.clock.day;
  eg.until = state.clock.day + (STORY.jingzhouCycleRestDays || 30);
  st.jingzhou.active = false;
  st.jingzhou.winner = holder;
  st.jingzhou.strong = strong;
  st.jingzhou.until = eg.until;
  stopMajorWars(state);
  STORY.kingdoms.forEach(function (f) { st.targets[f] = []; });
  if (!eg.cycle) eg.cycle = 1;
  if (eg.cycle >= (STORY.jingzhouMaxCycles || 10)) {
    beginFinalJingzhou(state);
    return;
  }
  const lines = holder ? [
    factionName(holder) + '占尽襄阳、新野、江陵，成为新一轮霸主。',
    '全国募兵效率 +20%；另外两国立刻结盟，停战一个月。',
    '一个月后，两家联盟会从汉中、夷陵、合肥三个方向同时来攻。',
  ] : [
    '这一轮谁也没能独吞荆州三镇。',
    strongestKingdom(state) ? (factionName(strong) + '兵势最盛，被另外两家视为霸主。') : '三家各自收兵。',
    '休整一个月，再战荆州。',
  ];
  pushStoryEvent(state, holder ? '荆州霸主：' + factionName(holder) : '荆州休战', lines, { tag: '会战', art: 'peace', auto: 9 });
  logFn(state, holder ? '荆州霸主：' + factionName(holder) + '，全国募兵 +20%。' : '荆州休战一个月。', 'war');
  refreshHeadline(state);
}

function tickJingzhou(state) {
  const st = state.story;
  if (!st || !st.jingzhou || !st.jingzhou.active) return;
  const holder = holderOfJingzhou(state);
  if (holder) { endJingzhouRound(state, holder); return; }
  if (state.clock.day >= (st.jingzhou.until || 0)) endJingzhouRound(state, null);
}

/** 最终阶段（第十轮后不死不休）也会被玩家拖住；满两年强制推举共主，进入统一背叛。 */
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
  });
  eg.forced = true;
  eg.forcedWinner = winner;
  eg.forcedDay = state.clock.day;
  pushStoryEvent(state, STORY.unification ? STORY.unification.forceTitle || '天下易主' : '天下易主', [
    '荆州十轮打了两年，最后一座城仍悬而未决。',
    '各地军头不愿再耗，合推' + factionName(winner) + '为共主，望风归降。',
    '旧旗一夜之间换了颜色；接下来，就该轮到那场全国背叛了。',
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
    // 只用还活着的国家判断；若只剩一家，交给统一流程。
    if (STORY.kingdoms.filter(function (f) { return factionAlive(state, f); }).length <= 1) return;
    tickJingzhou(state);
    return;
  }
  if (eg.phase === 'rest') {
    if (state.clock.day >= (eg.until || 0)) beginJingzhouCycle(state);
    return;
  }
  if (eg.phase === 'final') {
    // 第十轮后没有下一阶段，玩家若靠守城拖住，两年后强制推举共主。
    if (!eg.forced && state.clock.day - (eg.since || state.clock.day) >= (STORY.phaseDeadlineDays || 720)) {
      forceEndgameUnification(state);
      return;
    }
    const alive = STORY.kingdoms.filter(function (f) { return factionAlive(state, f); });
    if (alive.length <= 1) return;
    const strong = eg.strongest && factionAlive(state, eg.strongest) ? eg.strongest : null;
    if (!strong) {
      // 霸主已灭：联盟因分赃不均立刻反目，直到只剩最后一国。
      eg.allies = alive.slice();
      STORY.kingdoms.forEach(function (a) {
        if (!factionAlive(state, a)) return;
        st.targets[a] = alive.filter(function (b) { return b !== a; });
        alive.forEach(function (b) {
          if (a < b && !war.atWar(state, a, b)) war.declare(state, a, b, true, true);
        });
      });
    }
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

  // 官渡之后：只有配置仍压低袁军时，才触发“大军溃散”的士气文书。
  const yuanPenaltyPower = Number(STORY.yuanWeakPower);
  if (st.yuanWeak && isFinite(yuanPenaltyPower) && yuanPenaltyPower < 0.999 &&
      factionAlive(state, 'yuan') && oldFaction === 'yuan' &&
      byFaction === 'wei' && !st.yuanBattleLost) {
    st.yuanBattleLost = true;
    state.lords.forEach(function (l) {
      if (l.faction === 'yuan' && l.alive && !l.dead) l.morale = Math.min(l.morale || 35, 20);
    });
    pushStoryEvent(state, '官渡败讯', [
      '官渡前线溃散，袁绍的河北大军丢下粮车与旌旗，退回黄河北岸。',
      '袁绍不听田丰、沮授之言，斩将换令，军中人人自危。',
      '从此袁军士气低迷，士兵力气只剩三成；这支部队要一直撑到曹操把袁氏灭亡。',
    ], { tag: '大势', art: 'war', auto: 8 });
    logFn(state, '官渡败讯：袁绍军心涣散，战力保持 0.33，直到袁氏灭亡。', 'war');
    refreshHeadline(state);
  }
}

/* ------------------------------------------------------------ 主循环 */

function refreshHeadline(state) {
  const st = state.story;
  if (!st) return;
  const parts = [];
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
  if (!st.duel.ended && factionAlive(state, 'yuan') && factionAlive(state, 'gongsun')) {
    parts.push('袁绍·公孙瓒：不死不休');
  }
  if (st.emperor && st.emperor.declared && factionAlive(state, 'yuanshu')) {
    parts.push('袁术：仲家称帝');
  }
  const tripleAlive = (STORY.tripleWar || []).filter(function (f) { return factionAlive(state, f); });
  if (tripleAlive.length >= 2) parts.push('凉州：马腾·韩遂·汉廷');
  if (st.yuanWeak && factionAlive(state, 'yuan')) parts.push('袁绍：官渡昏君·三成战力');
  if (st.chibi && !st.chibi.done) {
    parts.push(st.chibi.phase === 'battle' ? '赤壁：火攻决战' : '赤壁：曹操南下');
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
  maybeOpeningEvent(state);

  maybeEmperor(state);
  maybeEdgeWars(state);
  if (st.endgame && st.endgame.active) {
    tickEndgame(state);
    refreshHeadline(state);
    return;
  }
  maybeChibi(state);
  enforceStrategicBlockers(state);
  maybeJingzhou(state);
  if (st.endgame && st.endgame.active) {
    tickEndgame(state);
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
    startJingzhou, beginFinalJingzhou,
  },
};
