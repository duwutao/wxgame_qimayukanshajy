/**
 * 国战：势力之间的宣战、领主野战、俘虏与逃脱。
 *
 * 规则（按用户要的骑砍味）：
 *  - 两个势力宣战后，双方所有领主互为敌人，在大地图上撞上就开打；
 *  - 除了主线要点名的那几位，谁都不会被领主杀掉：败的一方溃逃或者被俘；
 *  - 俘虏押在城里，可以被人攻破城池救出，也可能自己跑掉；
 *  - 逃脱概率起初几乎为零，关一天涨一点。
 */

const { FACTIONS } = require('../data/china.js');
const { TROOPS } = require('../data/troops.js');
const army = require('./army.js');

const ESCAPE_BASE = 0.008;   // 第一天：0.8% + 1.4% ≈ 2.2%
const ESCAPE_STEP = 0.014;
const ESCAPE_CAP = 0.62;
const MIN_WAR_DAYS = 25;

function key(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

// 开局已经撕破脸的那几对，都有出处
const SEED_WARS = [
  ['wei', 'yuan'],    // 官渡：曹操与袁绍
  ['wei', 'lv'],      // 兖州：曹操与吕布
  ['wei', 'shu'],     // 徐州：曹操与刘备
  ['wei', 'ma'],      // 关中：曹操与马腾
  ['wu', 'biao'],     // 江夏：孙坚死于黄祖箭下
  ['wu', 'wei'],      // 赤壁前的水路
  ['yuan', 'lv'],     // 袁绍与吕布，翻脸比结盟快
  ['yuan', 'xianbei'],// 北境
  ['ma', 'han'],      // 西凉内斗：马腾与韩遂
  ['zhang', 'shu'],   // 刘璋拒刘备入蜀
];

function pushLogSafe() {
  // 由 state 注入，避免循环 require
}

let logFn = pushLogSafe;

function bindLogger(fn) {
  logFn = fn || pushLogSafe;
}

function init(state) {
  if (!state.factionWars || typeof state.factionWars !== 'object') state.factionWars = {};
  const m = state.factionWars;
  if (!state.diplomacySeeded) {
    SEED_WARS.forEach(function (pair) {
      const k = key(pair[0], pair[1]);
      if (!m[k]) m[k] = { since: state.clock ? state.clock.day : 1, score: 0 };
    });
    state.diplomacySeeded = true;
  }
  if (!state.prisoners) state.prisoners = [];
  return m;
}

function atWar(state, a, b) {
  if (!a || !b || a === b) return false;
  if (a === 'bandit' || b === 'bandit') return true;
  if (!FACTIONS[a] || !FACTIONS[b]) return false;
  const m = state.factionWars || init(state);
  return !!m[key(a, b)];
}

function warPartners(state, f) {
  const m = state.factionWars || {};
  const out = [];
  Object.keys(m).forEach(function (k) {
    const parts = k.split('|');
    if (parts[0] === f) out.push(parts[1]);
    else if (parts[1] === f) out.push(parts[0]);
  });
  return out;
}

function declare(state, a, b, quiet) {
  if (!FACTIONS[a] || !FACTIONS[b] || a === b) return false;
  if (a === 'bandit' || b === 'bandit') return false;
  const m = state.factionWars || init(state);
  if (m[key(a, b)]) return false;
  m[key(a, b)] = { since: state.clock.day, score: 0 };
  if (!quiet) {
    logFn(state, FACTIONS[a].full + '与' + FACTIONS[b].full + '翻了脸，使者连夜出境，边关开始点烽火。', 'war');
  }
  return true;
}

function makePeace(state, a, b, quiet) {
  const m = state.factionWars || {};
  const k = key(a, b);
  if (!m[k]) return false;
  delete m[k];
  if (!quiet) {
    logFn(state, FACTIONS[a].full + '与' + FACTIONS[b].full + '遣使议和，两家把刀收回鞘里，边界的鼓角停了一阵。', 'war');
  }
  return true;
}

/** 每日外交：随机宣战、随机议和。打的年头太久会自己收手。 */
function diplomacyTick(state) {
  const m = state.factionWars || init(state);
  const rng = state.rng;
  const ids = Object.keys(FACTIONS).filter(function (id) { return id !== 'bandit'; });

  // 新仇：天下不太平，隔三差五就有人翻脸
  if (rng.next() < 0.2) {
    const a = ids[rng.int(0, ids.length - 1)];
    const b = ids[rng.int(0, ids.length - 1)];
    if (a !== b && !atWar(state, a, b) && warPartners(state, a).length < 3) {
      declare(state, a, b, false);
    }
  }

  // 议和：打得久了，两边都缺粮
  const keys = Object.keys(m);
  keys.forEach(function (k) {
    const w = m[k];
    if (!w) return;
    const days = state.clock.day - (w.since || 1);
    if (days > MIN_WAR_DAYS && rng.next() < 0.03) {
      const parts = k.split('|');
      makePeace(state, parts[0], parts[1], false);
    }
  });
}

/* ------------------------------------------------------------ 战斗 */

function weight(troops) {
  let sum = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    const w = t ? t.tier * 2 + t.atk / 3 + t.def / 3 : 4;
    sum += (troops[id] || 0) * w;
  });
  return sum;
}

function nearPlayer(state, unit, r) {
  const p = state.player;
  return Math.max(Math.abs(unit.x - p.x), Math.abs(unit.y - p.y)) <= (r || 12);
}

function moveAway(state, lord) {
  // 溃逃：往野地里退两格，别站在战场上等下一轮
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let i = 0; i < 8; i++) {
    const d = dirs[state.rng.int(0, 7)];
    const nx = lord.x + d[0] * 2;
    const ny = lord.y + d[1] * 2;
    if (isPassable && isPassable(state.world, nx, ny)) {
      lord.x = nx;
      lord.y = ny;
      return;
    }
  }
  lord.x = Math.max(1, lord.x - 2);
}

let isPassable = null;
function bindPassable(fn) { isPassable = fn; }

/** 俘虏这位领主，押在 captor 的老家 */
function capture(state, loser, captorFaction, captorName) {
  const homeSite = state.world.sites && state.world.sites.filter(function (s) {
    return captorFaction === 'player'
      ? s.playerOwned
      : (s.ownerFaction === captorFaction && s.type !== 'camp' && s.type !== 'village');
  })[0];
  const siteId = homeSite ? homeSite.id : loser.home;
  loser.alive = false;
  loser.chasing = false;
  loser.prisoner = {
    by: captorFaction,
    byName: captorName || '',
    siteId: siteId,
    since: state.clock.day,
    days: 0,
  };
  loser.troops = {};
  if (!state.prisoners) state.prisoners = [];
  state.prisoners.push({ lordId: loser.id, by: captorFaction, byName: captorName || '', siteId: siteId, since: state.clock.day, days: 0 });
  const site = state.world.sites.filter(function (s) { return s.id === siteId; })[0];
  const place = site ? site.name : '城里';
  logFn(state,
    (captorName ? captorName + '的部曲' : '对方') + '把' + loser.name + '从马上拽下来捆了，押进' + place + '的牢里。',
    'war');
  return true;
}

function takeSome(base, n) {
  const out = {};
  let put = 0;
  Object.keys(base || {}).forEach(function (id) {
    if (put >= n) return;
    const take = Math.min(base[id], n - put);
    if (take > 0) { out[id] = take; put += take; }
  });
  return out;
}

function freeLord(state, lord, why) {
  const home = state.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  lord.alive = true;
  lord.prisoner = null;
  lord.x = home ? home.x : lord.x;
  lord.y = home ? home.y : lord.y;
  const keep = Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.45));
  lord.troops = takeSome(lord.defTroops, keep);
  lord.respawnDay = 0;
  lord.scuffle = 8;
  if (why) logFn(state, why, 'war');
  return lord;
}

/**
 * 两位领主在路上撞上：打一场小规模的。
 * 败方不会死——溃逃，或者被俘。
 */
function clash(state, a, b) {
  const wa = weight(a.troops);
  const wb = weight(b.troops);
  if (wa <= 0 || wb <= 0) return null;
  const share = wa / (wa + wb);
  const totalA = army.troopCount(a.troops);
  const totalB = army.troopCount(b.troops);
  const lossA = Math.max(1, Math.round(totalA * (0.16 + (1 - share) * 0.34)));
  const lossB = Math.max(1, Math.round(totalB * (0.16 + share * 0.34)));
  army.distributeLosses(a.troops, lossA);
  army.distributeLosses(b.troops, lossB);
  a.scuffle = 5;
  b.scuffle = 5;

  const remainA = army.troopCount(a.troops);
  const remainB = army.troopCount(b.troops);
  const winner = share >= 0.5 ? a : b;
  const loser = share >= 0.5 ? b : a;
  const winnerRemain = share >= 0.5 ? remainA : remainB;
  const loserRemain = share >= 0.5 ? remainB : remainA;

  const near = nearPlayer(state, winner, 10);

  // 一边被打空了，或者被打崩了：被俘 / 溃逃
  const broken = loserRemain <= 0 || loserRemain < 6 || (loserRemain / winnerRemain) < 0.28;
  if (!broken) {
    if (near) logFn(state, a.name + '与' + b.name + '在野地里撞上，各折了 ' + lossA + '、' + lossB + ' 骑。天黑之后各自收兵。', 'war');
    return { draw: true };
  }

  const rng = state.rng;
  // 溃逃的概率高一些：乱世里保住人比保住脸重要
  const flee = rng.next() < 0.6 || winner.faction === 'bandit';
  if (flee) {
    loser.alive = true;
    loser.chasing = false;
    moveAway(state, loser);
    loser.scuffle = 12;
    if (near) logFn(state, loser.name + '的阵线先散，带着残兵往野地里跑了，' + winner.name + '也没有死追。', 'war');
    return { flee: true };
  }

  capture(state, loser, winner.faction, winner.name);
  return { capture: true };
}

/** 每 NPC 步：所有毗邻的敌对领主互殴 */
function fieldTick(state) {
  if (!state.factionWars) init(state);
  const list = state.lords.filter(function (l) { return l.alive; });
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    if (a.scuffle && a.scuffle > 0) { a.scuffle -= 1; continue; }
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || !b.troops) continue;
      if (b.scuffle && b.scuffle > 0) continue;
      if (Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1) continue;
      if (a.faction === b.faction) continue;
      if (a.faction === 'bandit' && b.faction === 'bandit') continue;
      if (!atWar(state, a.faction, b.faction)) continue;
      clash(state, a, b);
      count += 1;
      if (count > 6) return;
    }
  }
  return count;
}

/* ------------------------------------------------------------ 俘虏 */

function listPrisoners(state) {
  return (state.prisoners || []).filter(function (p) { return p; });
}

function findByLord(state, lordId) {
  return (state.prisoners || []).filter(function (p) { return p.lordId === lordId; })[0];
}

/** 每日：关得越久，越容易自己跑掉 */
function prisonerTick(state) {
  if (!state.prisoners) state.prisoners = [];
  const rng = state.rng;
  state.prisoners.forEach(function (p) {
    p.days = (p.days || 0) + 1;
    const lord = state.lords.filter(function (l) { return l.id === p.lordId; })[0];
    if (!lord) return;
    const chance = Math.min(ESCAPE_CAP, ESCAPE_BASE + ESCAPE_STEP * p.days);
    if (rng.next() < chance) {
      p.escaped = true;
      freeLord(state, lord, lord.name + '在牢里关到第 ' + p.days + ' 天，趁换岗摸出城，回营聚残部去了。');
    }
  });
  state.prisoners = state.prisoners.filter(function (p) { return !p.escaped; });
}

/** 城破时：牢门大开，被这家关着的人都跑出来 */
function onSiteTaken(state, site, oldFaction) {
  if (!state.prisoners || !state.prisoners.length) return 0;
  const freed = state.prisoners.filter(function (p) {
    if (p.by === 'player') return false;
    if (p.siteId && p.siteId === site.id) return true;
    return oldFaction && p.by === oldFaction;
  });
  freed.forEach(function (p) {
    const lord = state.lords.filter(function (l) { return l.id === p.lordId; })[0];
    if (lord) {
      freeLord(state, lord, null);
      p.escaped = true;
    }
  });
  state.prisoners = state.prisoners.filter(function (p) { return !p.escaped; });
  if (freed.length) {
    const names = freed.map(function (p) {
      const l = state.lords.filter(function (x) { return x.id === p.lordId; })[0];
      return l ? l.name : '';
    }).filter(Boolean).slice(0, 3).join('、');
    logFn(state, site.name + '城破，牢门大开。' + names + (freed.length > 3 ? '等人' : '') + '趁乱脱身，各回各家。', 'war');
  }
  return freed.length;
}

/** 玩家亲手打赢一位领主：俘虏或溃逃，不死 */
function onPlayerBeatLord(state, lord) {
  const home = state.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  const special = lord.id === 'lvbu' || lord.id === 'caocao' || lord.id === 'liubei' ||
    lord.id === 'sunquan' || lord.id === 'yuanshao' || lord.id === 'liubiao' ||
    lord.id === 'liuzhang' || lord.id === 'mateng' || lord.id === 'kebineng' || lord.id === 'liuxie';
  const rng = state.rng;
  if (!special && rng.next() < 0.45) {
    capture(state, lord, 'player', '你');
    const gold = 60 + Math.round(weight(lord.defTroops) / 5);
    lord.ransom = gold;
    const p = (state.prisoners || [])[state.prisoners.length - 1];
    if (p) p.ransom = gold;
    return { captured: true, ransom: gold };
  }
  lord.alive = false;
  lord.chasing = false;
  lord.troops = {};
  lord.prisoner = null;
  lord.respawnDay = state.clock.day + (special ? 12 : 5);
  if (home) {
    lord.x = home.x;
    lord.y = home.y;
  }
  return { fled: true };
}

/** 收赎金放人 */
function ransom(state, lordId, amount) {
  const p = (state.prisoners || []).filter(function (x) { return x.lordId === lordId; })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  const gold = amount || p.ransom || 120;
  state.player.gold += gold;
  p.escaped = true;
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  freeLord(state, lord, null);
  logFn(state, lord.name + '的家人凑了 ' + gold + ' 金把人赎走。你数钱的时候，他没有回头。', 'war');
  return { ok: true, msg: '收到赎金 ' + gold + ' 金，放走了' + lord.name, gold: gold };
}

/** 白放人：换人情 */
function release(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) { return x.lordId === lordId; })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  p.escaped = true;
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  freeLord(state, lord, null);
  state.player.renown += 12;
  if (lord.faction && FACTIONS[lord.faction]) {
    state.relations[lord.faction] = Math.min(100, (state.relations[lord.faction] || 0) + 14);
  }
  logFn(state, '你把' + lord.name + '放回马下，还给了他一把刀。他抱拳说了句"来日必报"，打马走了。', 'war');
  return { ok: true, msg: '放了' + lord.name + '，声望 +12，' + (FACTIONS[lord.faction] ? FACTIONS[lord.faction].name : '') + '对你和气了些' };
}

/** 视野里最近的死敌领主（宣战势力） */
function nearestFoe(state, lord, range) {
  const r = range || 5;
  let best = null;
  let bestD = r + 1;
  state.lords.forEach(function (o) {
    if (o === lord || !o.alive || !o.troops) return;
    if (o.faction === lord.faction) return;
    if (o.faction === 'bandit' || lord.faction === 'bandit') return;
    if (!atWar(state, lord.faction, o.faction)) return;
    const d = Math.max(Math.abs(o.x - lord.x), Math.abs(o.y - lord.y));
    if (d < bestD) { bestD = d; best = o; }
  });
  return best;
}

function summaryLines(state) {
  const m = state.factionWars || {};
  const lines = [];
  Object.keys(m).forEach(function (k) {
    const parts = k.split('|');
    const days = state.clock.day - (m[k].since || 1);
    lines.push({ a: parts[0], b: parts[1], days: days });
  });
  return lines;
}

module.exports = {
  init, atWar, declare, makePeace, diplomacyTick,
  fieldTick, clash, capture, freeLord, prisonerTick, onSiteTaken, onPlayerBeatLord,
  ransom, release, listPrisoners, summaryLines, warPartners, bindLogger, bindPassable, weight,
  nearestFoe,
  ESCAPE_BASE, ESCAPE_STEP,
};
