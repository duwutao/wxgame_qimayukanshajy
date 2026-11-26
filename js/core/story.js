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
const { FACTIONS, ROADS } = require('../data/china.js');
const { siteById } = require('./world.js');
const war = require('./war.js');

let logFn = function () {};

function bindLogger(fn) {
  logFn = fn || function () {};
}

function key(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

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

/** 边缘小国领主每天补兵的比例；大国是它的两倍。 */
function recruitRate(state, faction) {
  return isPassive(state, faction) ? 0.06 : 0.12;
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
  };
  state.story = st;

  STORY.passiveFactions.forEach(function (f) { st.passive[f] = true; });
  STORY.noPeacePairs.forEach(function (pair) {
    st.noPeace[key(pair[0], pair[1])] = true;
  });

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

  // 开局四场：曹操讨吕布、孙权报父仇、袁绍与公孙瓒不死不休。
  // 刘备只在新野按兵，等到第八天才向刘璋递战书。
  ['wei', 'wu', 'yuan', 'gongsun'].forEach(function (f) {
    if (st.phases[f]) startPhase(state, f, { silent: true, opening: true });
  });
  st.openingDeclared = true;
  if (state) state.openingWarsDeclared = true;
  pushWarEvent(state, '天下棋局', [
    '曹操以“兖州旧怨”向吕布宣战，徐州、兖州边关同时点起烽火。',
    '孙权以“为父报仇”向刘表宣战，江东水军直指夏口、江陵。',
    '袁绍与公孙瓒撕破脸，幽冀两家开局便不死不休，谁也不接议和书。',
    '刘备按兵新野，只等第八日向刘璋递出“收取西川”的战书。',
  ]);
  logFn(state, '天下棋局已开：曹操讨吕布，孙权攻刘表，袁绍与公孙瓒不死不休；刘备暂守新野。', 'war');
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
  const day = state.clock.day;
  if (cfg.notBeforeDay && day < cfg.notBeforeDay) return false;
  if (cfg.waitBleed) {
    if (!state.story.duel.ended) {
      const bleedAt = (state.story.duel.startDay || 1) + STORY.bleedDays;
      if (day < bleedAt) return false;
    }
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

  const targets = phaseTargets(state, faction, cfg);
  p.status = 'war';
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

  war.abortCampaign(state, faction);
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
    pushWarEvent(state, cfg.title || cfg.label, lines);
    logFn(state, '【' + factionName(faction) + '】' + cfg.label + '：' + (cfg.casusBelli || ''), 'war');
  } else if (opening && declared.length) {
    logFn(state, '【' + factionName(faction) + '】' + cfg.label + '，向' + declared.map(factionName).join('、') + '宣战。', 'war');
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

  const peaceTo = phasePeace(state, faction, cfg);
  p.status = 'rest';
  p.success = !!ok;
  p.timedOut = !ok;
  p.completed += ok ? 1 : 0;
  p.nextId = (ok ? cfg.successNext : cfg.timeoutNext) || cfg.next || 'end';
  p.restUntil = state.clock.day + (cfg.restDays || STORY.restDays);
  st.targets[faction] = [];
  delete st.priority[faction];
  war.abortCampaign(state, faction);

  const baseLines = ok ? (cfg.successLines || []) : (cfg.timeoutLines || []);
  const lines = baseLines.slice();
  if (peaceTo.length) {
    lines.push('与' + peaceTo.map(factionName).join('、') + '遣使议和，两家收兵，边关鼓角暂歇。');
  }
  if (!ok) lines.push('一年之期已到，' + (cfg.short || cfg.label) + '未能达成，改走下一阶段。');
  const markTitle = (cfg.label || cfg.short) + (ok ? ' · 达成' : ' · 受挫');
  if (peaceTo.length) {
    // 真正递了停战书的阶段，走议和文书：大字是战略结果，小字写清为何收兵。
    pushPeaceEvent(state, markTitle, lines);
  } else {
    pushStoryEvent(state, markTitle, lines, {
      tag: ok ? '战略' : '受挫',
      art: 'peace',
      auto: 8,
    });
  }
  logFn(state, '【' + factionName(faction) + '】' + cfg.label + (ok ? '达成。' : '受挫，收兵休整。'), 'throne');

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
  if (canBeginPhase(state, cfg)) startPhase(state, faction, {});
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
    if (!canBeginPhase(state, cfg)) return;
    startPhase(state, faction, {});
    return;
  }

  if (p.status === 'war') {
    if (!cfg) { p.status = 'done'; return; }
    if (phaseDone(state, faction, cfg)) {
      finishPhase(state, faction, true);
      return;
    }
    if (!cfg.noTimeout && cfg.timeout) {
      if (state.clock.day - p.startedDay >= cfg.timeout) finishPhase(state, faction, false);
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
  if (!st || st.emperor.declared) return;
  if (state.clock.day < STORY.emperorDay) return;
  st.emperor.declared = true;
  st.emperor.day = state.clock.day;
  if (!factionAlive(state, 'yuanshu')) {
    refreshHeadline(state);
    return;
  }
  const around = ['wei', 'wu', 'biao', 'lv'].filter(function (f) { return factionAlive(state, f); });
  const coalition = ['wei', 'wu'].filter(function (f) { return factionAlive(state, f); });
  st.emperor.coalition = coalition;
  st.emperor.coalitionTarget = 'yuanshu';
  coalition.forEach(function (f) { st.priority[f] = 'yuanshu'; });

  around.forEach(function (f) {
    if (f === 'wei' || f === 'wu' || f === 'biao' || f === 'lv') {
      war.declare(state, f, 'yuanshu', true, true);
    }
  });
  const lines = STORY.emperor.lines.slice();
  if (around.length) {
    lines[1] = around.map(factionName).join('、') + '同时传檄，集体向袁术宣战。';
  }
  pushWarEvent(state, STORY.emperor.title, lines);
  logFn(state, '袁术在寿春称帝，' + around.map(factionName).join('、') + '集体宣战；魏吴合兵剿灭仲家。', 'war');
  refreshHeadline(state);
}

/* ------------------------------------------------------------ 荆州会战 */

function maybeJingzhou(state) {
  const st = state.story;
  if (!st || st.jingzhou || st.jingzhouDone || st.endgame) return;
  if (state.clock.day < STORY.jingzhouDay) return;
  if (!STORY.majors.every(function (f) { return factionAlive(state, f); })) return;
  const pWei = st.phases.wei;
  const pShu = st.phases.shu;
  const pWu = st.phases.wu;
  if (!pWei || !pShu || !pWu) return;
  if ((pWei.completed || 0) < 2 || (pShu.completed || 0) < 1 || (pWu.completed || 0) < 1) return;

  st.jingzhou = {
    active: true,
    since: state.clock.day,
    until: state.clock.day + STORY.jingzhouDays,
  };
  st.priority = {};
  st.targetRegion = {};
  STORY.majors.forEach(function (f) {
    st.targets[f] = STORY.majors.filter(function (x) { return x !== f; });
    st.targetRegion[f] = 'jingzhou';
    war.abortCampaign(state, f);
  });
  STORY.majors.forEach(function (a) {
    STORY.majors.forEach(function (b) {
      if (a < b) war.declare(state, a, b, true, true);
    });
  });
  // 荆州之外暂时收刀，把兵锋留给襄阳、江陵。
  Object.keys(st.phases).forEach(function (f) {
    if (isMajor(f)) return;
    war.warPartners(state, f).forEach(function (other) {
      if (isMajor(other)) war.makePeace(state, f, other, true);
    });
  });
  pushStoryEvent(state, STORY.jingzhou.title, STORY.jingzhou.lines, { tag: '会战', art: 'war', auto: 8 });
  logFn(state, '荆州会战开始：魏、蜀、吴三家在襄阳、江陵、夏口一线同时用兵，为期一年。', 'war');
  refreshHeadline(state);
}

function endJingzhou(state) {
  const st = state.story;
  if (!st || !st.jingzhou) return;
  STORY.majors.forEach(function (a) {
    STORY.majors.forEach(function (b) {
      if (a < b) war.makePeace(state, a, b, true);
    });
    war.abortCampaign(state, a);
  });
  const days = STORY.jingzhouDays;
  STORY.majors.forEach(function (f) {
    const p = st.phases[f];
    if (p && p.status === 'war') p.startedDay += days;
  });
  st.jingzhou.active = false;
  st.jingzhouDone = true;
  st.targetRegion = null;
  st.targets = {};
  // 一年会战结束，各自回到当前阶段的目标；已经灭国的目标会自动从清单里去掉。
  STORY.majors.forEach(function (f) {
    st.targets[f] = [];
    const p = st.phases[f];
    if (!p || p.status !== 'war') return;
    const cfg = currentCfg(state, f);
    if (!cfg) return;
    const targets = phaseTargets(state, f, cfg);
    st.targets[f] = targets;
    targets.forEach(function (to) {
      if (factionAlive(state, to) && !war.atWar(state, f, to)) {
        war.declare(state, f, to, true, true);
      }
    });
  });
  pushStoryEvent(state, '荆州会战结束', [
    '一年战罢，襄阳、江陵城下尸横遍野，三家谁也没能独吞荆州。',
    '魏、蜀、吴各自收兵，重新回到自己的战略上。',
    '下一阶段：各自去完成尚未完成的目标。',
  ], { tag: '会战', art: 'peace', auto: 8 });
  logFn(state, '荆州会战结束，三家收兵；各自回到本国战略。', 'war');
  refreshHeadline(state);
}

function tickJingzhou(state) {
  const st = state.story;
  if (!st || !st.jingzhou || !st.jingzhou.active) return;
  if (state.clock.day >= st.jingzhou.until) endJingzhou(state);
}

/* ------------------------------------------------------------ 三国循环 */

function beginGang(state) {
  const st = state.story;
  if (!st || !st.endgame) return;
  if (!STORY.majors.every(function (f) { return factionAlive(state, f); })) return;
  const scores = STORY.majors.map(function (f) { return { f: f, v: powerOf(state, f) }; });
  scores.sort(function (a, b) { return b.v - a.v; });
  const top = scores[0].f;
  const allies = [scores[1].f, scores[2].f];
  st.endgame.phase = 'gang';
  st.endgame.since = state.clock.day;
  st.endgame.strongest = top;
  st.endgame.allies = allies;
  st.endgame.initialCities = {};
  STORY.majors.forEach(function (f) { st.endgame.initialCities[f] = citiesOf(state, f).length; });

  // 另外两家先罢兵，合纵攻最强的一家。
  war.makePeace(state, allies[0], allies[1], true);
  [top].concat(allies).forEach(function (f) { war.abortCampaign(state, f); });
  allies.forEach(function (a) {
    if (!war.atWar(state, a, top)) war.declare(state, a, top, true, true);
  });
  st.targets = {};
  st.targets[top] = allies.slice();
  allies.forEach(function (a) { st.targets[a] = [top]; });
  st.priority = {};
  pushStoryEvent(state, '合纵攻强', [
    '魏蜀吴三足鼎立，' + factionName(top) + '最强，' + allies.map(factionName).join('、') + '两家合纵攻之。',
    '两家使者往来不绝，约定先把最强的这一家打下去。',
    '天下没有永远的盟友，只有下一轮的强弱。',
  ], { tag: '乱国', art: 'war', auto: 8 });
  logFn(state, '三国循环：' + allies.map(factionName).join('、') + '合纵攻' + factionName(top) + '。', 'war');
  refreshHeadline(state);
}

function endgameWeak(state, faction) {
  const st = state.story;
  const eg = st.endgame;
  if (!eg) return false;
  const cities = citiesOf(state, faction).length;
  const initial = (eg.initialCities && eg.initialCities[faction]) || (STORY.majors.length ? 1 : 1);
  const floor = Math.max(STORY.weakCityFloor, Math.round(initial * STORY.weakCityRatio));
  if (cities <= floor) return true;
  const power = powerOf(state, faction);
  const maxPower = Math.max.apply(null, STORY.majors.map(function (f) { return powerOf(state, f); }));
  return maxPower > 0 && power / maxPower < 0.52;
}

function beginTwoStrong(state) {
  const st = state.story;
  const eg = st.endgame;
  const top = eg.strongest;
  const allies = eg.allies.slice();
  if (!allies.length) return;
  // 强国与两家同时停战，退到后面休养。
  allies.forEach(function (a) { war.makePeace(state, top, a, true); });
  [top].concat(allies).forEach(function (f) { war.abortCampaign(state, f); });

  // 两个先前联手的一方开始互攻。
  war.makePeace(state, allies[0], allies[1], true);
  war.declare(state, allies[0], allies[1], true, true);
  eg.phase = 'twoStrong';
  eg.since = state.clock.day;
  st.targets = {};
  st.targets[top] = [];
  allies.forEach(function (a, i) { st.targets[a] = [allies[1 - i]]; });
  st.priority = {};
  pushStoryEvent(state, '强国请和，两家反目', [
    factionName(top) + '被两家打到极弱，只得同时向两家递上停战书。',
    '停战一成，' + allies.map(factionName).join('、') + '两家立刻翻脸，开始争夺谁才是下一个最强。',
    factionName(top) + '退到后方休养生息，等着下一轮。',
  ], { tag: '乱国', art: 'peace', auto: 8 });
  logFn(state, '三国循环：' + factionName(top) + '请和，' + allies.map(factionName).join('、') + '两家互攻。', 'war');
  refreshHeadline(state);
}

function beginTripleRest(state) {
  const st = state.story;
  const eg = st.endgame;
  if (!eg) return;
  STORY.majors.forEach(function (a) {
    STORY.majors.forEach(function (b) {
      if (a < b) war.makePeace(state, a, b, true);
    });
    war.abortCampaign(state, a);
  });
  eg.phase = 'rest';
  eg.since = state.clock.day;
  eg.until = state.clock.day + STORY.endgameRestDays;
  st.targets = {};
  STORY.majors.forEach(function (f) { st.targets[f] = []; });
  st.priority = {};
  pushStoryEvent(state, '三家休兵', [
    '两家打到两败俱伤，终于同时收兵。',
    '魏、蜀、吴三家各自回城，清点伤亡，休养生息。',
    '等哪一家再次最强，另外两家又会合兵攻来。',
  ], { tag: '乱国', art: 'peace', auto: 8 });
  logFn(state, '三国循环：两家停战，三家休养生息。', 'war');
  refreshHeadline(state);
}

function startEndgame(state) {
  const st = state.story;
  if (!st || st.endgame) return false;
  if (!STORY.majors.every(function (f) { return factionAlive(state, f); })) return false;
  st.endgame = {
    active: true,
    phase: 'gang',
    since: state.clock.day,
    until: 0,
    strongest: null,
    allies: [],
    initialCities: {},
  };
  pushStoryEvent(state, STORY.endgame.title, STORY.endgame.lines, { tag: '乱国', art: 'war', auto: 9 });
  logFn(state, '魏蜀吴三足鼎立，乱国叙事开启；NPC 之间不会互相灭国。', 'throne');
  beginGang(state);
  return true;
}

function tickEndgame(state) {
  const st = state.story;
  const eg = st.endgame;
  if (!eg || !eg.active) return;
  if (!STORY.majors.every(function (f) { return factionAlive(state, f); })) {
    eg.active = false;
    return;
  }
  if (eg.phase === 'gang') {
    if (!eg.strongest || !factionAlive(state, eg.strongest)) {
      beginGang(state);
      return;
    }
    if (endgameWeak(state, eg.strongest)) {
      beginTwoStrong(state);
      return;
    }
    // 打太久仍没打弱，也要给一个停战窗口，免得循环卡死。
    if (state.clock.day - eg.since > 360) beginTwoStrong(state);
    return;
  }
  if (eg.phase === 'twoStrong') {
    const allies = eg.allies || [];
    if (allies.length < 2) { beginTripleRest(state); return; }
    const weak = allies.filter(function (f) { return endgameWeak(state, f); }).length;
    if (weak >= 1 || state.clock.day - eg.since >= STORY.twoStrongDays) {
      beginTripleRest(state);
    }
    return;
  }
  if (eg.phase === 'rest') {
    if (state.clock.day >= (eg.until || 0)) beginGang(state);
  }
}

/* ------------------------------------------------------------ 灭国归属 */

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
  if (st.jingzhou && st.jingzhou.active) parts.push('荆州：三家会战');
  if (st.endgame && st.endgame.active) parts.push('乱国：三国循环');
  st.headline = parts.join(' · ');
}

function tick(state) {
  const st = state.story;
  if (!state || !st || !st.mode) return;
  st.day = state.clock.day;
  if (state.gameOver) return;

  maybeEmperor(state);
  // 袁术一旦覆灭，魏吴的联合剿灭优先级立刻撤掉。
  if (st.emperor && st.emperor.coalitionTarget && factionDead(state, st.emperor.coalitionTarget)) {
    (st.emperor.coalition || []).forEach(function (f) { delete st.priority[f]; });
    st.emperor.coalitionTarget = null;
  }
  if (st.endgame && st.endgame.active) {
    tickEndgame(state);
    refreshHeadline(state);
    return;
  }
  maybeJingzhou(state);
  if (st.jingzhou && st.jingzhou.active) {
    tickJingzhou(state);
    refreshHeadline(state);
    return;
  }
  Object.keys(st.phases).forEach(function (f) {
    tickPhase(state, f);
  });
  if (st.jingzhouDone || Object.keys(st.phases).every(function (f) {
    const p = st.phases[f];
    return p && p.status === 'done';
  })) {
    // 阶段全走完，或荆州会战已结束：进入三国循环。
    if (st.jingzhouDone && state.clock.day >= ((st.jingzhou && st.jingzhou.until) || 0) + 120) {
      if (startEndgame(state)) return;
    }
  }
  refreshHeadline(state);
}

module.exports = {
  init, resume, tick, refreshHeadline, recordCapture, bindLogger,
  isPassive, hasStory, siteAdjacent, factionAlive, factionDead, recruitRate,
  startEndgame, startPhase, beginGang, beginTwoStrong, beginTripleRest,
  maybeEmperor, maybeJingzhou, endJingzhou,
  _private: { phaseDone, currentCfg, phaseCfg, phaseList, citiesOf, powerOf, endgameWeak, eventLines },
};
