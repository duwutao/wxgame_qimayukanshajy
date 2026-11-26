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
const { siteById } = require('./world.js');
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

/** 袁绍官渡昏君状态：全局对拼系数压到 0.33，直到袁氏灭亡才恢复。 */
function applyYuanCombat(state, weak) {
  if (!state || !state.story) return;
  if (!FACTION_COMBAT.yuan) FACTION_COMBAT.yuan = { power: 1 };
  const on = !!weak && factionAlive(state, 'yuan');
  FACTION_COMBAT.yuan.power = on ? (STORY.yuanWeakPower || 0.33) : 1;
  state.story.yuanWeak = on;
  if (on) {
    state.lords.forEach(function (l) {
      if (l.faction === 'yuan' && l.alive && !l.dead) {
        l.morale = Math.min(typeof l.morale === 'number' ? l.morale : 60, 35);
        l.storyMoraleCap = 35;
      }
    });
  }
}

function yuanMoraleTick(state) {
  const st = state.story;
  if (!st || !st.yuanWeak || !factionAlive(state, 'yuan')) return;
  state.lords.forEach(function (l) {
    if (l.faction !== 'yuan' || !l.alive || l.dead) return;
    l.morale = Math.min(typeof l.morale === 'number' ? l.morale : 60, 35);
  });
}

function resetYuanCombat() {
  if (FACTION_COMBAT.yuan) FACTION_COMBAT.yuan.power = 1;
}
const resetCombat = resetYuanCombat;

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
    jingzhou: null,
    jingzhouDone: false,
    endgame: null,
    headline: '',
    openingDeclared: false,
    openingEventDay: STORY.openingEventDay || 3,
    openingEventShown: false,
    yuanWeak: false,
    yuanBattleLost: false,
    edgeWarsDeclared: false,
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

function maybeJingzhou(state) {
  const st = state.story;
  if (!st || st.endgame || st.jingzhouDone) return false;
  if (!STORY.kingdoms || !STORY.kingdoms.every(function (f) { return factionAlive(state, f); })) return false;
  if (!STORY.kingdoms.every(function (f) { return st.stage3Done && st.stage3Done[f]; })) return false;
  const last = Math.max.apply(null, STORY.kingdoms.map(function (f) { return st.stage3Done[f] || 0; }));
  if (state.clock.day < last + (STORY.jingzhouUnlockRestDays || 30)) return false;
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
  pushStoryEvent(state, STORY.jingzhou.finalTitle, STORY.jingzhou.finalLines, { tag: '会战', art: 'war', auto: 9 });
  logFn(state, '第十轮荆州争霸：不再停战，霸主与联盟不死不休。', 'war');
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

  // 官渡之后：袁绍丢城即触发“大军溃散”的士气文书，0.33 倍率一直保留到袁氏灭亡。
  if (st.yuanWeak && factionAlive(state, 'yuan') && oldFaction === 'yuan' &&
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
  maybeEmperor, maybeJingzhou, endJingzhou,
  _private: { phaseDone, currentCfg, phaseCfg, phaseList, citiesOf, powerOf, eventLines, displayLabel },
};
