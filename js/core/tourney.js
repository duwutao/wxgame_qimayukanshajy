/**
 * 军机棋盘：城池里的六局军情博弈。
 *
 * 六局都只押一注：报名 40 金钱，胜者得 200 金钱；每七天只摆十局，满十局要等下一轮。
 * 规则全部由本文件计算，场景层只负责把选择画成棋盘。
 *   单挑斩将：劈克刺，刺克闪，闪克劈（三分之一的胜面）
 *   校场夺魁：左挡 / 右挡 / 左攻 / 右攻，对手四滴血、挡对可反手重击
 *   断粮道：三处粮道，AI 拦两处，只剩一条空档
 *   狙杀敌哨：两处明哨一处暗哨 × 换防/不换
 *   火攻时机：顺风放火 / 等风停 / 严阵以待 × 防备/不备
 *   烽火传令：三选一避开伏兵，再在剩下两条道中二选一
 * 六局摊下来，赢面都在四成以下，棋盘是消遣，不是提款机。
 */

const heroes = require('./heroes.js');
const { LORDS, FACTIONS } = require('../data/china.js');

const FEE = 40;
const PRIZE = 200;

const DUEL_MOVES = [
  { id: 'pi', name: '劈', beats: 'ci', desc: '大刀当头劈下，克刺。' },
  { id: 'ci', name: '刺', beats: 'shan', desc: '枪尖直取咽喉，克闪。' },
  { id: 'shan', name: '闪', beats: 'pi', desc: '侧身让过刀锋，克劈。' },
];
const DUEL_BY_ID = {};
DUEL_MOVES.forEach(function (m) { DUEL_BY_ID[m.id] = m; });

// 校场夺魁：老比武大会那套“猜手”，左挡 / 右挡 / 左攻 / 右攻，各三滴血。
const ARENA_MOVES = [
  { id: 'blockL', name: '左挡', dir: 'L', kind: 'block', desc: '护住左肩' },
  { id: 'blockR', name: '右挡', dir: 'R', kind: 'block', desc: '护住右肩' },
  { id: 'attackL', name: '左攻', dir: 'L', kind: 'attack', desc: '从左边切进去' },
  { id: 'attackR', name: '右攻', dir: 'R', kind: 'attack', desc: '从右边切进去' },
];
const ARENA_BY_ID = {};
ARENA_MOVES.forEach(function (m) { ARENA_BY_ID[m.id] = m; });
const ARENA_HP = 3;
// 校场对手是常年下场的老手：多一件护心镜，多撑一刀；你挡对方向能反手重击。
const ARENA_FOE_HP = 4;
const SUPPLY_BLOCK_COUNT = 2;
const WEEK_LIMIT = 10;
const WEEK_DAYS = 7;

const SUPPLY_NODES = [
  { id: 'east', name: '东粮道', short: '东', desc: '靠河，车辙最深。' },
  { id: 'center', name: '中粮道', short: '中', desc: '直通大营，守备最密。' },
  { id: 'west', name: '西粮道', short: '西', desc: '绕山，路窄而隐蔽。' },
];
const SUPPLY_BY_ID = {};
SUPPLY_NODES.forEach(function (n) { SUPPLY_BY_ID[n.id] = n; });

const SENTRY_TARGETS = [
  { id: 'brightA', name: '前门明哨', desc: '火把底下站着，换防要从火前走过。' },
  { id: 'brightB', name: '侧门明哨', desc: '侧门那盏灯下，换防只是转身，箭贴不着。' },
  { id: 'hidden', name: '帐后暗哨', desc: '营帐阴影里的一双眼睛，不动才露头。' },
];
const SENTRY_AIS = [
  { id: 'change', name: '换防', desc: '哨兵互换位置。' },
  { id: 'stay', name: '不换', desc: '原位盯到天亮。' },
];
const FIRE_MOVES = [
  { id: 'burn', name: '顺风放火', desc: '趁风势把火船送过去。' },
  { id: 'wait', name: '等风停', desc: '先按住火船，等风向定。' },
  { id: 'hold', name: '不再放火', desc: '严阵以待，今夜只守不攻。' },
];
const FIRE_AIS = [
  { id: 'ready', name: '防备', desc: '沿江布下拒火船。' },
  { id: 'unready', name: '不备', desc: '只当是寻常夜雾。' },
];
const RELAY_LANES = [
  { id: 'east', name: '东驿道', short: '东', desc: '沿河快马，路最宽。' },
  { id: 'center', name: '中驿道', short: '中', desc: '穿过两道土岗。' },
  { id: 'west', name: '西驿道', short: '西', desc: '绕山，近而险。' },
];
const RELAY_BY_ID = {};
RELAY_LANES.forEach(function (n) { RELAY_BY_ID[n.id] = n; });

const MODES = [
  {
    id: 'duel', name: '单挑斩将', icon: 'duel', color: '#4a241c',
    short: '劈 · 刺 · 闪',
    intro: '两军阵前，你与敌将各出一招。劈克刺，刺克闪，闪克劈；同招相抵，可再出一手。',
    rule: '一局定胜负。胜者斩将夺旗，得 200 金钱。',
    choiceTitle: '你出哪一招？',
    choices: DUEL_MOVES.map(function (m) {
      return { id: m.id, name: m.name, desc: '克 ' + DUEL_BY_ID[m.beats].name };
    }),
  },
  {
    id: 'arena', name: '校场夺魁', icon: 'arena', color: '#3a2c1e',
    short: '挡与攻 · 四手',
    intro: '校场画了个圈，你与好手各持木刀，护住左右两肩。每合一招：要么护住一边，要么从那一边切进去。',
    rule: '你三滴血，对手四滴血；挡对方向可反手重击。同招相抵白打一合；两败俱伤退报名费。',
    choiceTitle: '这一合怎么走？',
    choices: ARENA_MOVES.map(function (m) {
      return { id: m.id, name: m.name, desc: m.desc, kind: m.kind };
    }),
  },
  {
    id: 'supply', name: '断粮道', icon: 'supply', color: '#3b3020',
    short: '三条粮道 · 留一条',
    intro: '敌营粮道分东、中、西三处。你先选一处偷袭，AI 同时把两处卡死；只剩一条道是空的。',
    rule: '三条道里 AI 拦两条，撞上任何一处伏兵即输。烧掉敌粮得 200 金钱。',
    choiceTitle: '偷袭哪一处粮道？',
    choices: SUPPLY_NODES.map(function (n) {
      return { id: n.id, name: n.name, desc: n.desc };
    }),
  },
  {
    id: 'sentry', name: '狙杀敌哨', icon: 'sentry', color: '#26372e',
    short: '两明一暗 · 换防',
    intro: '敌营外三处哨位：前门明哨、侧门明哨、帐后暗哨。你挑一处放箭，AI 决定换防或不换。',
    rule: '只有前门明哨换防时会走过火把，帐后暗哨不换才露头；侧门转身、明哨站定都空。',
    choiceTitle: '先狙哪一个？',
    choices: SENTRY_TARGETS.map(function (n) {
      return { id: n.id, name: n.name, desc: n.desc };
    }),
  },
  {
    id: 'fire', name: '火攻时机', icon: 'fire', color: '#4a2a18',
    short: '顺风 / 等风 / 严阵',
    intro: '风向不定。你选顺风放火、等风停，或者干脆不再放火；AI 选防备或不备。',
    rule: '顺风遇不备、等风遇防备才得手；严阵以待只是收兵，退你报名费。',
    choiceTitle: '何时点火？',
    choices: FIRE_MOVES.map(function (n) {
      return { id: n.id, name: n.name, desc: n.desc };
    }),
  },
  {
    id: 'relay', name: '烽火传令', icon: 'relay', color: '#2c2a40',
    short: '三选一 · 再二选一',
    intro: '你是传令兵，要把军信送到前线。第一关三条驿道，AI 在其中一条设卡；避开后，第二关只剩两条道，AI 再补一道卡。',
    rule: '两关都避开伏兵，军信送到，得 200 金钱；任一次撞上即输。',
    choiceTitle: '第一关走哪条道？',
    choices: RELAY_LANES.map(function (n) {
      return { id: n.id, name: n.name, desc: n.desc };
    }),
  },
];
const MODE_BY_ID = {};
MODES.forEach(function (m) { MODE_BY_ID[m.id] = m; });

function fee() {
  return FEE;
}

function prize() {
  return PRIZE;
}

function modeById(id) {
  return MODE_BY_ID[id] || null;
}

function modeList() {
  return MODES.slice();
}

function choiceList(modeId, relayState) {
  const mode = modeById(modeId);
  if (!mode) return [];
  if (modeId === 'relay' && relayState && relayState.stage === 2) {
    return RELAY_LANES.filter(function (n) {
      return (relayState.remaining || []).indexOf(n.id) >= 0;
    });
  }
  return mode.choices.slice();
}

function labelFor(modeId, choiceId) {
  const mode = modeById(modeId);
  if (!mode) return choiceId;
  if (modeId === 'relay') {
    return (RELAY_BY_ID[choiceId] && RELAY_BY_ID[choiceId].name) || choiceId;
  }
  if (modeId === 'arena') {
    return (ARENA_BY_ID[choiceId] && ARENA_BY_ID[choiceId].name) || choiceId;
  }
  const list = mode.choices || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === choiceId) return list[i].name;
  }
  return choiceId;
}

function aiLabelFor(modeId, aiId) {
  if (modeId === 'supply') return (SUPPLY_BY_ID[aiId] && SUPPLY_BY_ID[aiId].name) || aiId;
  if (modeId === 'sentry') {
    return (SENTRY_AIS.filter(function (n) { return n.id === aiId; })[0] || {}).name || aiId;
  }
  if (modeId === 'fire') {
    return (FIRE_AIS.filter(function (n) { return n.id === aiId; })[0] || {}).name || aiId;
  }
  if (modeId === 'relay') return (RELAY_BY_ID[aiId] && RELAY_BY_ID[aiId].name) || aiId;
  if (modeId === 'duel') return (DUEL_BY_ID[aiId] && DUEL_BY_ID[aiId].name) || aiId;
  if (modeId === 'arena') return (ARENA_BY_ID[aiId] && ARENA_BY_ID[aiId].name) || aiId;
  return aiId;
}

/** 单挑：返回 win / lose / tie。 */
function resolveDuel(playerMove, aiMove) {
  const p = DUEL_BY_ID[playerMove];
  if (!p || !DUEL_BY_ID[aiMove]) return null;
  if (playerMove === aiMove) return 'tie';
  return p.beats === aiMove ? 'win' : 'lose';
}

/** 断粮道：三条道 AI 拦两条，只剩一条空档。 */
function resolveSupply(playerNode, blocks) {
  if (!SUPPLY_BY_ID[playerNode]) return null;
  const list = Array.isArray(blocks) ? blocks : [blocks];
  if (!list.length || list.some(function (id) { return !SUPPLY_BY_ID[id]; })) return null;
  return list.indexOf(playerNode) >= 0 ? 'lose' : 'win';
}

/** 狙杀敌哨：只有前门明哨换防时会走过火把，暗哨不换才露头。 */
function resolveSentry(target, aiMove) {
  if (!SENTRY_TARGETS.some(function (n) { return n.id === target; })) return null;
  const ok = (target === 'hidden' && aiMove === 'stay') ||
    (target === 'brightA' && aiMove === 'change');
  return ok ? 'win' : 'lose';
}

/** 火攻时机：严阵以待是收兵，退报名费。 */
function resolveFire(move, aiMove) {
  if (move === 'hold') return 'draw';
  const ok = (move === 'burn' && aiMove === 'unready') ||
    (move === 'wait' && aiMove === 'ready');
  return ok ? 'win' : 'lose';
}

/** 烽火传令：每一关都只是“选中的道是否撞上设卡道”。 */
function resolveRelayStage(playerLane, blockLane) {
  if (!RELAY_BY_ID[playerLane] || !RELAY_BY_ID[blockLane]) return null;
  return playerLane !== blockLane ? 'win' : 'lose';
}

/** 校场夺魁：一合的结算，只看双方各自出的手。 */
function resolveArena(pMoveId, fMoveId) {
  const pm = ARENA_BY_ID[pMoveId];
  const fm = ARENA_BY_ID[fMoveId];
  if (!pm || !fm) return null;
  let dmgPlayer = 0;
  let dmgFoe = 0;
  let line = '';
  const pDir = pm.dir === 'L' ? '左' : '右';
  const fDir = fm.dir === 'L' ? '左' : '右';

  if (pm.kind === 'attack' && fm.kind === 'attack') {
    dmgPlayer = 1;
    dmgFoe = 1;
    line = '两边同时抢攻，木刀都落了实，各挨一下。';
  } else if (pm.kind === 'block' && fm.kind === 'block') {
    line = '两人都在收着，绕着圈子走了半圈，这一合谁也没碰上谁。';
  } else if (pm.kind === 'attack' && fm.kind === 'block') {
    if (pm.dir === fm.dir) {
      dmgPlayer = 1;
      line = '你从' + pDir + '边抢攻，对手正好在' + fDir + '边架上木刀，你虎口被震得发麻。';
    } else {
      dmgFoe = 1;
      line = '你从' + pDir + '边虚晃一招，人却从另一边切进去，一刀拍在他护肩上。';
    }
  } else if (pm.dir === fm.dir) {
    // 挡对了顺势反手一记重刀，比寻常一刀更沉
    dmgFoe = 2;
    line = '他攻你' + fDir + '边，你' + pDir + '手木刀迎上去，磕开刀锋，反手一记重刀抽在他背上。';
  } else {
    dmgPlayer = 1;
    line = '他攻你' + fDir + '边，你挡在' + pDir + '边——护不住，肋下吃了一记。';
  }
  return { dmgPlayer: dmgPlayer, dmgFoe: dmgFoe, line: line };
}

/** 校场上的对手：从天下名将里抽一位，声望越高，读招越准。 */
function pickArenaFoe(state) {
  const list = (LORDS || []).filter(function (l) { return l && l.id && l.name; });
  if (!list.length) return { name: '外乡好手', tag: '校场常客', skill: 0.16 };
  const def = list[state.rng.int(0, list.length - 1)];
  const rep = Math.min(20, Math.floor((state.player.renown || 0) / 60));
  return {
    name: def.name,
    faction: def.faction,
    lordId: def.id,
    skill: Math.max(0.12, Math.min(0.5, 0.16 + rep * 0.02)),
    tag: (FACTIONS[def.faction] || {}).full || '外地来的好手',
  };
}

/** 对手出招：多数时候乱来，偶尔读你上一手的习惯。 */
function pickArenaAI(state, arena) {
  const last = arena && arena.moves && arena.moves.length
    ? arena.moves[arena.moves.length - 1] : null;
  if (last && state.rng.next() < (arena.foe.skill || 0.2)) {
    if (last.pMove === 'attackL') return 'blockL';
    if (last.pMove === 'attackR') return 'blockR';
    if (last.pMove === 'blockL') return 'attackR';
    if (last.pMove === 'blockR') return 'attackL';
  }
  return ARENA_MOVES[state.rng.int(0, ARENA_MOVES.length - 1)].id;
}

function safeFlags(state) {
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  return state.flags;
}

function pickFrom(state, list) {
  if (!list || !list.length) return null;
  return list[state.rng.int(0, list.length - 1)];
}

function pickDuelAI(state) {
  return pickFrom(state, DUEL_MOVES).id;
}

/** AI 一次拦两道：三条道只给你留一条空档。 */
function pickSupplyBlocks(state) {
  const pool = SUPPLY_NODES.map(function (n) { return n.id; });
  const first = pickFrom(state, SUPPLY_NODES).id;
  const rest = pool.filter(function (id) { return id !== first; });
  const j = Math.max(0, Math.min(rest.length - 1, state.rng.int(0, rest.length - 1)));
  const second = rest[j];
  const out = [first, second];
  safeFlags(state).warboardSupplyLastBlocks = out.slice();
  return out;
}

/* ---------------------------------------------------------- 七天十局 */

/** 每七天摆十局；跨过七天自动重开一轮。 */
function weekState(state) {
  if (!state.tourneyWeek || typeof state.tourneyWeek.startDay !== 'number') {
    state.tourneyWeek = { startDay: state.clock ? state.clock.day : 1, used: 0 };
  }
  const w = state.tourneyWeek;
  const day = state.clock ? state.clock.day : w.startDay;
  if (day - w.startDay >= WEEK_DAYS || day < w.startDay) {
    w.startDay = day;
    w.used = 0;
  }
  return w;
}

function remaining(state) {
  const w = weekState(state);
  return Math.max(0, WEEK_LIMIT - w.used);
}

function weekInfo(state) {
  const w = weekState(state);
  return {
    used: w.used,
    limit: WEEK_LIMIT,
    remaining: Math.max(0, WEEK_LIMIT - w.used),
    startDay: w.startDay,
    resetIn: Math.max(0, WEEK_DAYS - ((state.clock ? state.clock.day : w.startDay) - w.startDay)),
  };
}

function pickSentryAI(state) {
  return pickFrom(state, SENTRY_AIS).id;
}

function pickFireAI(state) {
  return pickFrom(state, FIRE_AIS).id;
}

function pickRelayBlock(state, lanes) {
  return pickFrom(state, lanes).id;
}

/** 报名：交 40，初始化当前这一局。 */
function enter(state, site, modeId) {
  if (!state || !state.player) return { ok: false, msg: '还没有开局。' };
  const mode = modeById(modeId || 'duel');
  if (!mode) return { ok: false, msg: '棋盘上没有这一局。' };
  if (state.tourney && !state.tourney.done) {
    return { ok: false, msg: '上一局还没下完。' };
  }
  const gold = Number(state.player.gold || 0);
  if (gold < FEE) return { ok: false, msg: '报名要 ' + FEE + ' 金钱，你身上不够。' };
  const week = weekState(state);
  if (week.used >= WEEK_LIMIT) {
    return { ok: false, msg: '这七天的十局已经下满，' + Math.max(1, WEEK_DAYS - ((state.clock ? state.clock.day : week.startDay) - week.startDay)) + ' 天后再开张。' };
  }

  state.player.gold = gold - FEE;
  week.used += 1;
  const t = {
    mode: mode.id,
    modeName: mode.name,
    siteId: site ? site.id : null,
    siteName: site ? site.name : '此地',
    fee: FEE,
    pot: PRIZE,
    round: 0,
    done: false,
    champion: false,
    win: false,
    result: null,
    draw: false,
    log: [],
    choiceTitle: mode.choiceTitle,
  };
  if (mode.id === 'arena') {
    t.arena = {
      hp: ARENA_HP,
      foeHp: ARENA_FOE_HP,
      foe: pickArenaFoe(state),
      moves: [],
    };
    t.choiceTitle = '这一合怎么走？';
  }
  if (mode.id === 'relay') {
    t.relay = {
      stage: 1,
      firstLane: null,
      block1: null,
      remaining: RELAY_LANES.map(function (n) { return n.id; }),
      block2: null,
    };
  }
  state.tourney = t;
  return {
    ok: true,
    msg: '交 ' + FEE + ' 金钱，军机棋盘摆开：' + mode.name + '（本周还剩 ' + remaining(state) + ' 局）。',
    mode: mode.id,
  };
}

function addLog(t, lines) {
  if (!lines || !lines.length) return;
  t.log.push(lines.filter(Boolean).join('\n'));
  if (t.log.length > 12) t.log.shift();
}

function finish(state, t, win, resultLines) {
  if (!t || t.done) return;
  t.done = true;
  t.win = !!win;
  t.champion = !!win;
  t.draw = false;
  t.result = win ? 'win' : 'lose';
  addLog(t, resultLines || []);
  if (win) {
    state.player.gold = Number(state.player.gold || 0) + PRIZE;
    state.player.renown = Number(state.player.renown || 0) + 12;
    state.player.morale = Math.min(100, Number(state.player.morale || 0) + 4);
    if (state.stats) state.stats.goldEarned = Number(state.stats.goldEarned || 0) + PRIZE;
    heroes.gainHeroExp(state, 4);
    addLog(t, ['棋盘收官，你赢了。赏钱 ' + PRIZE + ' 金钱，声望 +12。']);
  } else {
    state.player.renown = Number(state.player.renown || 0) + 2;
    state.player.morale = Math.max(0, Number(state.player.morale || 0) - 2);
    addLog(t, ['这一局输了。报名费不退，声望 +2。']);
  }
}

/**
 * 下一步。选完之后由场景层展示结果。
 * @param {object} state
 * @param {string} choice
 */
function choose(state, choice) {
  const t = state && state.tourney;
  if (!t) return { ok: false, msg: '棋盘已经收了。' };
  if (t.done) return { ok: false, msg: '这一局已经下完。' };
  const mode = modeById(t.mode);
  if (!mode) return { ok: false, msg: '这局棋盘已经作废。' };
  t.round += 1;

  if (t.mode === 'duel') {
    if (!DUEL_BY_ID[choice]) return { ok: false, msg: '没有这一招。' };
    const ai = pickDuelAI(state);
    const result = resolveDuel(choice, ai);
    if (result === 'tie') {
      t.draw = true;
      addLog(t, ['你出「' + labelFor('duel', choice) + '」，敌将也出「' + labelFor('duel', ai) + '」。', '同招相抵，各自收招；不另收报名费，可再出一手。']);
      return {
        ok: true, mode: t.mode, result: 'tie', done: false,
        playerChoice: choice, aiChoice: ai,
        playerLabel: labelFor('duel', choice), aiLabel: labelFor('duel', ai),
        lines: ['同招相抵，重新起手。'],
      };
    }
    t.draw = false;
    const win = result === 'win';
    addLog(t, ['你出「' + labelFor('duel', choice) + '」，敌将出「' + labelFor('duel', ai) + '」。', win ? '刀锋先到，敌将落马。' : '敌将先变招，你的刀势落空。']);
    finish(state, t, win, [win ? '阵前斩将，夺旗而还。' : '你被亲兵抢回阵中，这局输了。']);
  } else if (t.mode === 'arena') {
    const a = t.arena;
    if (!a) return { ok: false, msg: '这一场已经散了。' };
    const pm = ARENA_BY_ID[choice];
    if (!pm) return { ok: false, msg: '校场上只有左挡、右挡、左攻、右攻。' };
    const ai = pickArenaAI(state, a);
    const settled = resolveArena(choice, ai);
    a.hp -= settled.dmgPlayer;
    a.foeHp -= settled.dmgFoe;
    a.moves.push({ pMove: choice, fMove: ai, dmgPlayer: settled.dmgPlayer, dmgFoe: settled.dmgFoe });
    const lines = ['第 ' + t.round + ' 合：' + settled.line,
      '（你 ' + Math.max(0, a.hp) + ' 血 · ' + a.foe.name + ' ' + Math.max(0, a.foeHp) + ' 血）'];
    addLog(t, lines);
    if (a.hp <= 0 && a.foeHp <= 0) {
      // 两败俱伤：报名费退回，赏格作废
      t.done = true;
      t.draw = true;
      t.win = false;
      t.champion = false;
      t.result = 'draw';
      state.player.gold = Number(state.player.gold || 0) + FEE;
      state.player.renown = Number(state.player.renown || 0) + 2;
      addLog(t, ['两个人一起倒下去，砸翻了校场的灯。主事的人把 ' + FEE + ' 金钱报名费退了你。']);
      return {
        ok: true, mode: t.mode, result: 'draw', done: true,
        playerChoice: choice, aiChoice: ai,
        playerLabel: labelFor('arena', choice), aiLabel: labelFor('arena', ai),
        hp: 0, foeHp: 0, lines: lines,
      };
    }
    if (a.foeHp <= 0) {
      addLog(t, ['他撑着木刀跪在地上，认了。', '校场四周把铜钱往场里洒。']);
      finish(state, t, true, ['校场夺魁，赏钱 ' + PRIZE + ' 金钱。']);
    } else if (a.hp <= 0) {
      addLog(t, ['你膝盖一软，坐在了土里。' + a.foe.name + '收了手，抱拳说：再练两年。']);
      finish(state, t, false, ['报名费没了，台下还是有人叫好。']);
    } else {
      return {
        ok: true, mode: t.mode, result: 'continue', done: false,
        playerChoice: choice, aiChoice: ai,
        playerLabel: labelFor('arena', choice), aiLabel: labelFor('arena', ai),
        hp: a.hp, foeHp: a.foeHp, lines: lines,
      };
    }
  } else if (t.mode === 'supply') {
    if (!SUPPLY_BY_ID[choice]) return { ok: false, msg: '没有这处粮道。' };
    const blocks = pickSupplyBlocks(state);
    const result = resolveSupply(choice, blocks);
    const win = result === 'win';
    const blockText = blocks.map(function (id) { return labelFor('supply', id); }).join('、');
    addLog(t, ['你偷袭「' + labelFor('supply', choice) + '」，伏兵卡住「' + blockText + '」两处。',
      win ? '剩下那条空道没人守，粮车一把火烧了。' : '这条道正撞在伏兵枪口上，火把从两侧亮起。']);
    finish(state, t, win, [win ? '断粮成功，敌营军心大乱。' : '偷袭失败，你带伤退回。']);
    t.lastBlocks = blocks.slice();
  } else if (t.mode === 'sentry') {
    if (!SENTRY_TARGETS.some(function (n) { return n.id === choice; })) {
      return { ok: false, msg: '哨位只有两处明哨和一处暗哨。' };
    }
    const ai = pickSentryAI(state);
    const result = resolveSentry(choice, ai);
    const win = result === 'win';
    addLog(t, ['你瞄准「' + labelFor('sentry', choice) + '」，敌营今夜「' + aiLabelFor('sentry', ai) + '」。',
      win ? '弩箭擦着火光过去，哨兵无声倒下。' : '箭钉在木桩上，哨兵一缩身，营门立刻警觉。']);
    finish(state, t, win, [win ? '敌哨已除，营门开了一条暗路。' : '一箭落空，你只能退入夜色。']);
  } else if (t.mode === 'fire') {
    if (!FIRE_MOVES.some(function (n) { return n.id === choice; })) {
      return { ok: false, msg: '火攻只有两种时机。' };
    }
    const ai = pickFireAI(state);
    const result = resolveFire(choice, ai);
    if (result === 'draw') {
      t.done = true;
      t.draw = true;
      t.win = false;
      t.champion = false;
      t.result = 'draw';
      state.player.gold = Number(state.player.gold || 0) + FEE;
      state.player.renown = Number(state.player.renown || 0) + 1;
      addLog(t, ['你传令收兵，火船拖回港内，沿江列阵守到天亮。',
        '敌营「' + aiLabelFor('fire', ai) + '」也没等到你点火。报名费 ' + FEE + ' 退回，赏格作废。']);
      return {
        ok: true, mode: t.mode, result: 'draw', done: true,
        playerChoice: choice, aiChoice: ai,
        playerLabel: labelFor('fire', choice), aiLabel: aiLabelFor('fire', ai),
        lines: ['严阵以待，今夜不战。'],
      };
    }
    const win = result === 'win';
    addLog(t, ['你选「' + labelFor('fire', choice) + '」，敌营选择「' + aiLabelFor('fire', ai) + '」。', win ? '火船顺风撞入水寨，江面烧成一条火龙。' : '风向不对，火船还未靠近就被拒火船拦住。']);
    finish(state, t, win, [win ? '火攻得手，敌营水寨尽毁。' : '火攻失手，你折了火船退回。']);
  } else if (t.mode === 'relay') {
    const relay = t.relay || (t.relay = {
      stage: 1, firstLane: null, block1: null,
      remaining: RELAY_LANES.map(function (n) { return n.id; }), block2: null,
    });
    const lane = RELAY_BY_ID[choice];
    if (!lane) return { ok: false, msg: '没有这条驿道。' };
    if (relay.stage === 1) {
      const block = pickRelayBlock(state, RELAY_LANES);
      relay.firstLane = choice;
      relay.block1 = block;
      relay.remaining = RELAY_LANES.filter(function (n) { return n.id !== block; }).map(function (n) { return n.id; });
      const result = resolveRelayStage(choice, block);
      if (result === 'lose') {
        addLog(t, ['第一关你走「' + lane.name + '」，AI 在「' + (RELAY_BY_ID[block] || {}).name + '」设卡。', '关卡火把亮起，军信没能出营。']);
        finish(state, t, false, ['第一关就被截住，传令失败。']);
      } else {
        relay.stage = 2;
        addLog(t, ['第一关你走「' + lane.name + '」，AI 的关卡设在「' + (RELAY_BY_ID[block] || {}).name + '」。', '你绕过关卡，前方只剩第二条驿道。']);
        return {
          ok: true, mode: t.mode, result: 'continue', done: false,
          stage: 2, playerChoice: choice, aiChoice: block,
          playerLabel: lane.name, aiLabel: (RELAY_BY_ID[block] || {}).name,
          remaining: relay.remaining.slice(),
          lines: ['第一关已过，进入第二关。'],
        };
      }
    } else {
      if (relay.remaining.indexOf(choice) < 0) return { ok: false, msg: '这条道已经被关卡封了。' };
      const block = pickRelayBlock(state, relay.remaining.map(function (id) { return RELAY_BY_ID[id]; }));
      relay.block2 = block;
      const result = resolveRelayStage(choice, block);
      const win = result === 'win';
      addLog(t, ['第二关你走「' + lane.name + '」，AI 在「' + (RELAY_BY_ID[block] || {}).name + '」补卡。', win ? '你从山道尽头冲出去，军信送到了。' : '第二条关卡封住山道，军信落在泥里。']);
      finish(state, t, win, [win ? '烽火传到前线，大军按军信而动。' : '传令失败，前线没能等到这封信。']);
    }
  } else {
    return { ok: false, msg: '这局棋盘已经作废。' };
  }

  return {
    ok: true,
    mode: t.mode,
    result: t.result,
    done: !!t.done,
    winner: t.win ? 'player' : 'ai',
    champion: !!t.champion,
    playerChoice: choice,
    playerLabel: labelFor(t.mode, choice),
    aiChoice: t.mode === 'supply' ? null : undefined,
    blocks: t.mode === 'supply' ? (t.lastBlocks || []).slice() : undefined,
    lines: t.log.length ? t.log[t.log.length - 1].split('\n') : [],
  };
}

function close(state) {
  if (state) state.tourney = null;
}

module.exports = {
  FEE, PRIZE, MODES, DUEL_MOVES, SUPPLY_NODES, SENTRY_TARGETS,
  SENTRY_AIS, FIRE_MOVES, FIRE_AIS, RELAY_LANES, ARENA_MOVES, ARENA_HP,
  ARENA_FOE_HP, SUPPLY_BLOCK_COUNT, WEEK_LIMIT, WEEK_DAYS,
  fee, prize, modeById, modeList, choiceList, labelFor, aiLabelFor,
  resolveDuel, resolveSupply, resolveSentry, resolveFire, resolveRelayStage, resolveArena,
  pickDuelAI, pickSupplyBlocks, pickSentryAI, pickFireAI, pickArenaAI, pickArenaFoe,
  weekState, weekInfo, remaining,
  enter, choose, close,
};
