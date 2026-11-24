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
  if (a === 'player' && state.wars && state.wars[b]) return true;
  if (b === 'player' && state.wars && state.wars[a]) return true;
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
    // 剧情序章走完以后，天下大事要让人看见；几息后自己散
    if (state.campaign && state.campaign.stage >= 1) {
      state.events.push({
        type: 'diplomacy', kind: 'war', a: a, b: b,
        title: '战云再起', lines: [
          FACTIONS[a].full + '与' + FACTIONS[b].full + '正式宣战。',
          '两家的使者连夜出境，边关烽火一处接一处点亮。',
          '天下这盘棋，又有人先掀了桌子。',
        ],
      });
    }
  }
  return true;
}

function makePeace(state, a, b, quiet) {
  // 斩了君主就是不死不休：这对玩家与那一家永远没有议和这一页
  const forever = state.noPeaceForever || {};
  if ((a === 'player' && forever[b]) || (b === 'player' && forever[a])) return false;
  const m = state.factionWars || {};
  const k = key(a, b);
  if (!m[k]) {
    // 旧档的玩家战争只记在 state.wars 里；这里补一条收兵通道
    if (a === 'player' && state.wars && state.wars[b]) {
      state.wars[b] = false;
      state.relations[b] = 0;
      return true;
    }
    if (b === 'player' && state.wars && state.wars[a]) {
      state.wars[a] = false;
      state.relations[a] = 0;
      return true;
    }
    return false;
  }
  // 阵前杀过人家的人：一个月内谈不成；满一个月才允许翻过这一页
  if (state.noPeace && (state.noPeace[a] || state.noPeace[b])) {
    const day = state.killRecords && state.killRecords[a] !== undefined
      ? state.killRecords[a] : (state.killRecords && state.killRecords[b]);
    if (day === undefined || state.clock.day - day < 30) return false;
  }
  delete m[k];
  // 与玩家议和：旧账一笔勾销，关系回到零（不论谁先提的）
  if (a === 'player' && FACTIONS[b]) {
    state.relations[b] = 0;
    if (state.wars) state.wars[b] = false;
  } else if (b === 'player' && FACTIONS[a]) {
    state.relations[a] = 0;
    if (state.wars) state.wars[a] = false;
  }
  if (!quiet) {
    logFn(state, FACTIONS[a].full + '与' + FACTIONS[b].full + '遣使议和，两家把刀收回鞘里，边界的鼓角停了一阵。', 'war');
    if (state.campaign && state.campaign.stage >= 1) {
      state.events.push({
        type: 'diplomacy', kind: 'peace', a: a, b: b,
        title: '两家议和', lines: [
          FACTIONS[a].full + '与' + FACTIONS[b].full + '暂时收兵。',
          '边关的鼓角停了一阵，商队又开始过境。',
          '至于这纸和约能压住多久，没人敢说。',
        ],
      });
    }
  }
  return true;
}

/** AI 能不能替这两家宣战：玩家所在的国不替玩家乱开战，玩家自己也不被 AI 拖下水 */
function aiCanDeclare(state, a, b) {
  if (!a || !b || a === b) return false;
  if (a === 'bandit' || b === 'bandit' || a === 'player' || b === 'player') return false;
  const pf = state && state.player ? state.player.faction : null;
  if (pf && pf !== 'player' && (a === pf || b === pf)) return false;
  return true;
}

/** 每日外交：随机宣战、随机议和。打的年头太久会自己收手。 */
function diplomacyTick(state) {
  const m = state.factionWars || init(state);
  const rng = state.rng;
  const ids = Object.keys(FACTIONS).filter(function (id) { return id !== 'bandit' && id !== 'player'; });

  // 新仇：天下不太平，隔三差五就有人翻脸
  if (rng.next() < 0.2) {
    const a = ids[rng.int(0, ids.length - 1)];
    const b = ids[rng.int(0, ids.length - 1)];
    if (a !== b && aiCanDeclare(state, a, b) && !atWar(state, a, b) && warPartners(state, a).length < 3) {
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

/** 敌国主动向玩家求和：开战满 30 天才可能发；杀过对方将领则要等 60 天。
 * 每天一次概率判定，同一势力两次求和至少隔 7 天。 */
const PEACE_OFFER_MIN_WAR = 30;
const PEACE_OFFER_MIN_KILL = 60;
const PEACE_OFFER_CHANCE = 0.08;
const PEACE_OFFER_GAP = 7;

function peaceOfferTick(state) {
  if (!state || state.peaceOfferPending) return false;
  const rng = state.rng;
  const now = state.clock.day;
  const ids = Object.keys(FACTIONS).filter(function (id) {
    return id !== 'bandit' && id !== 'player';
  });
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!atWar(state, 'player', id)) continue;
    if ((state.factionState[id] || {}).dead) continue;
    if (state.noPeaceForever && state.noPeaceForever[id]) continue;
    const w = (state.factionWars || {})[key('player', id)];
    const since = (w && w.since) ||
      (state.playerWarSince && state.playerWarSince[id]) || now;
    const warDays = now - since;
    if (warDays < PEACE_OFFER_MIN_WAR) continue;
    const killDay = state.killRecords && state.killRecords[id];
    if (killDay !== undefined && now - killDay < PEACE_OFFER_MIN_KILL) continue;
    const cool = state.peaceOfferCooldown && state.peaceOfferCooldown[id];
    if (cool && now < cool) continue;
    if (rng.next() >= PEACE_OFFER_CHANCE) continue;

    state.peaceOfferPending = id;
    state.peaceOfferCooldown = state.peaceOfferCooldown || {};
    state.peaceOfferCooldown[id] = now + PEACE_OFFER_GAP;
    state.events.push({
      type: 'peace-offer',
      factionId: id,
      title: '议和使者',
      lines: [
        FACTIONS[id].full + '的使者来到帐前，说两家再打下去只会让旁人捡便宜。',
        '他愿意把此前的旧账一笔勾销，只求你把围城的兵撤回去。',
        '接受议和，可得一支天机简；不接受，使者即刻就走。',
      ],
    });
    return true;
  }
  return false;
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
  loser.order = null;
  loser.defending = null;
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
  lord.order = null;
  lord.defending = null;
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
  // 碰到一次只打一场前哨战，不是一仗定生死：双方各掉 5%~17%
  const lossA = Math.max(1, Math.round(totalA * (0.05 + (1 - share) * 0.12)));
  const lossB = Math.max(1, Math.round(totalB * (0.05 + share * 0.12)));
  army.distributeLosses(a.troops, lossA);
  army.distributeLosses(b.troops, lossB);
  a.scuffle = 2;
  b.scuffle = 2;

  const remainA = army.troopCount(a.troops);
  const remainB = army.troopCount(b.troops);
  const winner = share >= 0.5 ? a : b;
  const loser = share >= 0.5 ? b : a;
  const winnerRemain = share >= 0.5 ? remainA : remainB;
  const loserRemain = share >= 0.5 ? remainB : remainA;

  const near = nearPlayer(state, winner, 10);

  // 一边被打空了，或者被打崩了：被俘 / 溃逃
  const broken = loserRemain <= 0 || loserRemain < 6 || (loserRemain / Math.max(1, winnerRemain)) < 0.28;
  if (!broken) {
    // 势均力敌时打累了各自收兵，弱势的一方更容易先撤
    const tired = state.rng.next() < 0.35 + (1 - share) * 0.25;
    if (tired) {
      moveAway(state, loser);
      loser.chasing = false;
      loser.scuffle = 6;
      if (near) logFn(state, a.name + '与' + b.name + '的前哨战打到天黑，' + loser.name + '先收兵退了，各折了 ' + lossA + '、' + lossB + ' 骑。', 'war');
      return { draw: true, withdraw: true };
    }
    if (near) logFn(state, a.name + '与' + b.name + '在野地里缠上了，各折了 ' + lossA + '、' + lossB + ' 骑，还没分出胜负。', 'war');
    return { draw: true };
  }

  const rng = state.rng;
  // 乱世里保住人比保住脸重要：领主之间只是打散，极少真被捆走
  const flee = rng.next() < 0.85 || winner.faction === 'bandit';
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

/**
 * 玩家在野战里打赢一位领主。
 * 这里不掷“杀/俘/逃”的骰子：人已经被按在阵前，等玩家在战果页选放走还是押进牢里。
 * 真正的斩将只在牢房页发生。
 */
function playerDefeatsLord(state, lord) {
  const home = state.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  lord.alive = false;
  lord.chasing = false;
  lord.order = null;
  lord.defending = null;
  lord.troops = {};
  lord.prisoner = null;
  lord.inCity = null;
  lord.respawnDay = 0;
  if (home) {
    lord.x = home.x;
    lord.y = home.y;
  }
  state.postBattleLord = {
    lordId: lord.id,
    name: lord.name,
    faction: lord.faction,
    title: lord.title || '领主',
    arcEnemy: !!lord.arcEnemy,
    arcNoCapture: !!lord.arcNoCapture,
  };
  return { pending: true, lordId: lord.id };
}

/** 阵前杀将：这个势力从此跟你没得谈 */
function killLord(state, lord) {
  const fac = lord.faction;
  lord.alive = false;
  lord.chasing = false;
  lord.order = null;
  lord.defending = null;
  lord.dead = true;
  lord.retired = false;
  lord.troops = {};
  lord.prisoner = null;
  lord.inCity = null;
  lord.respawnDay = 0;
  state.noPeace = state.noPeace || {};
  state.killRecords = state.killRecords || {};
  if (fac && FACTIONS[fac]) {
    state.noPeace[fac] = true;
    state.killRecords[fac] = state.clock.day;
    state.relations[fac] = -100;
    if (FACTIONS[fac].lord === lord.name) {
      state.noPeaceForever = state.noPeaceForever || {};
      state.noPeaceForever[fac] = true;
    }
    declare(state, 'player', fac, true);
    // 他的旧部也要记这一笔
    state.lords.forEach(function (l) {
      if (l === lord || !l.alive || l.faction !== fac) return;
      l.fury = (l.fury || 0) + 1;
    });
  }
  if (state.prisoners) {
    state.prisoners = state.prisoners.filter(function (p) { return p.lordId !== lord.id; });
  }
  logFn(state, lord.name + '被你在阵前斩了。消息传出去，' +
    (FACTIONS[fac] ? FACTIONS[fac].full : '那家') + '的人把刀都磨了一遍——这笔账，没人会替你翻过去。', 'war');
  return { killed: true, name: lord.name, faction: fac };
}

/** 玩家眼下靠什么立身：有主 / 自立 / 连旗都没有 */
function playerStanding(state) {
  const p = state.player;
  const owned = state.world.sites.filter(function (s) { return s.playerOwned; }).length;
  if (p.faction && p.faction !== 'player' && FACTIONS[p.faction]) {
    return { mode: 'vassal', faction: p.faction, owned: owned };
  }
  if (owned > 0) return { mode: 'self', faction: 'player', owned: owned };
  return { mode: 'none', faction: null, owned: 0 };
}

/**
 * 招降一位领主的成功率。UI 和真正掷骰都走这一处，避免两套算法。
 * 无旗：直接 0；自立：城越多越像样；有主：看名声与旧主关系。
 */
function recruitChance(state, lord) {
  if (!lord) return { chance: 0, mode: 'none', reason: '查无此人' };
  if (lord.arcNoRecruit) {
    return { chance: 0, mode: 'arc', reason: '天下皆反时，除了从你队伍里出去的旧部，没有人会再听你的话。' };
  }
  const from = lord.faction;
  const isRuler = !!(FACTIONS[from] && FACTIONS[from].lord === lord.name);
  const factionDead = !!(state.factionState && state.factionState[from] && state.factionState[from].dead);
  // 国还没亡时君主不降；国亡了，他也只是一个没了旗的人，可以谈
  if (isRuler && !factionDead) {
    return { chance: 0, mode: 'ruler', reason: lord.name + '是一方之主，只要他的国还在，就不会替别人扛旗。' };
  }
  const standing = playerStanding(state);
  if (standing.mode === 'none') {
    return {
      chance: 0, mode: 'none', owned: 0,
      reason: '你连一面旗都没有，他凭什么把身家押在你身上？',
    };
  }
  const p = state.player;
  const rel = (state.relations[from] || 0) / 100;
  let chance;
  if (standing.mode === 'self') {
    // 自立：刚占一座城，人家基本不认；连下几城，才有郡国之主的模样
    chance = 0.08 + Math.min(0.55, standing.owned * 0.075) + Math.min(0.12, (p.renown || 0) / 5000);
    chance += rel * 0.10;
    if (state.noPeace && state.noPeace[from]) chance -= 0.15;
    if (isRuler) chance = Math.max(0.12, chance * 0.7);
    chance = Math.max(0.04, Math.min(0.76, chance));
  } else {
    // 有主：替主上收人，名声 + 两家关系
    chance = 0.2 + Math.min(0.35, (p.renown || 0) / 1600);
    chance += rel * 0.25;
    if (state.noPeace && state.noPeace[from]) chance -= 0.25;
    if (isRuler) chance = Math.max(0.12, chance * 0.7);
    chance = Math.max(0.08, Math.min(0.8, chance));
  }
  return {
    chance: chance,
    mode: standing.mode,
    owned: standing.owned,
    target: standing.faction,
    isRuler: isRuler,
    reason: isRuler ? '他曾经是一方之主，如今国没了。想让他低头，得拿出足够分量的旗。' : '',
  };
}

function percent(chance) {
  return Math.round(chance * 100) + '%';
}

/** 招降：有主就替主上收人，自立就收成自己的领主 */
function recruitLord(state, lordId) {
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '没这个人' };
  if (lord.dead) return { ok: false, msg: '人已经死了' };
  const p = state.player;
  const isPrisoner = !!(lord.prisoner && lord.prisoner.by === 'player') ||
    (state.prisoners || []).some(function (x) { return x.lordId === lordId && x.by === 'player'; });
  if (!isPrisoner && lord.alive && lord.faction === (p.faction || 'player')) {
    return { ok: false, msg: '他已经在你的旗下了' };
  }
  const from = lord.faction;
  const offer = recruitChance(state, lord);
  if (offer.mode === 'ruler') return { ok: false, msg: offer.reason };
  if (offer.mode === 'none') return { ok: false, msg: offer.reason };
  // 招降不是连点抽奖：第一次开口后，要等三天才能再谈
  const cool = lord.recruitCoolDay || 0;
  if (state.clock.day < cool) {
    return {
      ok: false,
      cooldown: true,
      waitDays: cool - state.clock.day,
      msg: lord.name + '把脸转开：“话你已经说过了。让我静几天。”',
    };
  }
  // 不论成不成，这次开口都进入冷却
  lord.recruitCoolDay = state.clock.day + 3;
  if (state.rng.next() > offer.chance) {
    if (offer.mode === 'self') {
      return {
        ok: false,
        msg: lord.name + '扫了一眼你的营盘：“' + offer.owned + '座城就想让我改换门庭？等你的旗能遮住半个州再说。”',
        chance: offer.chance,
      };
    }
    return {
      ok: false,
      msg: lord.name + '把脸转开：“我吃的是' + (FACTIONS[from] ? FACTIONS[from].full : '旧主') + '的粮。”',
      chance: offer.chance,
    };
  }

  // 有主：替自己的君主收人；自立：收成自己的领主
  const target = offer.target || (p.faction && FACTIONS[p.faction] ? p.faction : 'player');
  if (state.prisoners) {
    state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  }
  lord.prisoner = null;
  lord.dead = false;
  lord.alive = true;
  lord.faction = target;
  lord.chasing = false;
  lord.resting = false;
  lord.order = null;
  lord.ransom = 0;
  const home = state.world.sites.filter(function (s) {
    return target === 'player' ? s.playerOwned : (s.ownerFaction === target && s.type !== 'camp' && s.type !== 'village');
  })[0] || state.world.sites.filter(function (s) { return s.playerOwned; })[0];
  if (home) {
    lord.home = home.id;
    lord.x = home.x;
    lord.y = home.y;
  }
  lord.troops = takeSome(lord.defTroops, Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.5)));
  p.renown += 25;
  if (target === 'player') {
    declare(state, 'player', from, true);
  }
  logFn(state, lord.name + '拜了下去：“' + (target === 'player' ? '愿跟着你' : '愿为' + FACTIONS[target].full + '效命') + '。”', 'recruit');
  return {
    ok: true,
    msg: lord.name + '归降了（声望 +25）',
    lordId: lord.id,
    faction: target,
  };
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
  logFn(state, lord.name + '的家人凑了 ' + gold + ' 金钱把人赎走。你数钱的时候，他没有回头。', 'war');
  return { ok: true, msg: '收到赎金 ' + gold + ' 金钱，放走了' + lord.name, gold: gold };
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

/* ------------------------------------------------------------ 领主国战 AI */

const RALLY_DAYS_MIN = 4;
const RALLY_DAYS_MAX = 12;
const SIEGE_MIN_DAYS = 3;
const SIEGE_EXTRA_DAYS = 4;
const SIEGE_COOLDOWN = 30;   // 攻下一城后，这一对国家一个月内不能再动兵
const HOLD_DAYS = 7;         // 攻下后留下守城
const FAIL_COOLDOWN = 30;   // 没打下来，这一对也得一个月后重整旗鼓

// 主线要用的城、玩家起家的城，不参与 AI 换旗：诸侯可以打，别把剧情打穿
const PROTECTED_SITES = {
  chenliu: true, xuchang: true, ye: true, jianye: true, chengdu: true,
  xiangyang: true, xiapi: true, luoyang: true, changan: true, guandu: true,
  hanzhong: true, jiangling: true, xiakou: true, chaisang: true, wujun: true,
  kuaiji: true, pingyuan: true, puyang: true, shouchun: true, chibi: true, yiling: true,
};

function siteById(state, id) {
  return state.world.sites.filter(function (s) { return s.id === id; })[0] || null;
}

function initAI(state) {
  if (!state.warCampaigns || typeof state.warCampaigns !== 'object') state.warCampaigns = {};
  if (!state.siegeCooldown || typeof state.siegeCooldown !== 'object') state.siegeCooldown = {};
}

function ownedSites(state, faction, townsOnly) {
  return state.world.sites.filter(function (s) {
    return s.ownerFaction === faction && !s.playerOwned && s.type !== 'camp' &&
      (!townsOnly || s.type === 'town' || s.type === 'castle');
  });
}

function factionLords(state, faction) {
  return state.lords.filter(function (l) {
    return l.alive && !l.dead && !l.prisoner && !l.hidden && l.faction === faction;
  });
}

function siteDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function nearestSiteOf(state, list, site) {
  let best = null;
  let bestD = Infinity;
  list.forEach(function (s) {
    const d = siteDistance(s, site);
    if (d < bestD) { bestD = d; best = s; }
  });
  return { site: best, distance: bestD };
}

function clearOrder(lord) {
  if (!lord) return;
  lord.order = null;
  lord.defending = null;
}

function giveOrder(lord, type, siteId, hold) {
  lord.order = { type: type, siteId: siteId, hold: !!hold, since: (lord.order && lord.order.since) || 0 };
  lord.chasing = false;
  lord.foeChasing = null;
  lord.banditChasing = null;
}

function pairBlocked(state, a, b, day) {
  return (state.siegeCooldown[key(a, b)] || 0) > day;
}

/** 一个国家一次只打一处：挑最近的敌城，在自己最靠前的城里集结 */
function planCampaign(state, faction, day) {
  const foes = warPartners(state, faction).filter(function (id) {
    return FACTIONS[id] && id !== 'player' && id !== 'bandit' && !(state.factionState[id] || {}).dead;
  });
  if (!foes.length) return null;
  const own = ownedSites(state, faction, true);
  if (own.length < 2) return null;

  const lords = factionLords(state, faction).filter(function (l) {
    return army.troopCount(l.troops || {}) >= 12 && !l.defending;
  });
  if (lords.length < 2) return null;

  let target = null;
  foes.forEach(function (enemy) {
    if (pairBlocked(state, faction, enemy, day)) return;
    ownedSites(state, enemy, true).forEach(function (s) {
      if (s.playerOwned || PROTECTED_SITES[s.id]) return;
      const near = nearestSiteOf(state, own, s);
      const score = near.distance * 0.6 + s.garrison * 0.35 + state.rng.int(0, 18);
      if (!target || score < target.score) target = { site: s, score: score, distance: near.distance };
    });
  });
  if (!target) return null;
  if (target.distance > 46) return null; // 隔着半个天下的远征先不打

  const nearestOwn = nearestSiteOf(state, own, target.site).site;
  // 集结地：既靠前线，也别把所有人从后方抽空
  let rally = nearestOwn;
  own.forEach(function (s) {
    if (s === nearestOwn) return;
    const toTarget = siteDistance(s, target.site);
    if (toTarget < siteDistance(rally, target.site) - 3 && s.garrison >= 55) rally = s;
  });

  const chosen = lords.slice().sort(function (a, b) {
    return siteDistance(a, rally) - siteDistance(b, rally);
  }).slice(0, Math.min(5, lords.length));
  if (chosen.length < 2) return null;

  const avgDist = chosen.reduce(function (sum, l) {
    return sum + siteDistance(l, rally);
  }, 0) / chosen.length;
  const rallyDays = Math.max(RALLY_DAYS_MIN, Math.min(RALLY_DAYS_MAX,
    RALLY_DAYS_MIN + state.rng.int(0, 3) + Math.round(avgDist / 7)));

  const cp = {
    faction: faction,
    enemy: target.site.ownerFaction,
    targetId: target.site.id,
    rallyId: rally.id,
    stage: 'rally',
    startDay: day,
    rallyUntil: day + rallyDays,
    marchStart: 0,
    siegeStart: 0,
    siegeUntil: 0,
    holdUntil: 0,
    attackerIds: chosen.map(function (l) { return l.id; }),
    defenderIds: [],
    arrivedIds: [],
    done: false,
  };
  chosen.forEach(function (l) {
    giveOrder(l, 'rally', rally.id, true);
    l.order.since = day;
    l.order.campaign = faction;
  });
  state.warCampaigns[faction] = cp;
  logFn(state,
    '【' + FACTIONS[faction].name + '】在' + rally.name + '集结 ' + chosen.length +
    ' 路人马，粮车向北，鼓声一路传到' + target.site.name + '。', 'muster');
  return cp;
}

function attackersOf(state, cp) {
  return cp.attackerIds.map(function (id) {
    return state.lords.filter(function (l) { return l.id === id; })[0];
  }).filter(function (l) { return l && l.alive && !l.prisoner; });
}

function startSiege(state, cp, site, day) {
  if (!site || site.ownerFaction !== cp.enemy) { cp.done = true; return false; }
  cp.stage = 'siege';
  cp.siegeStart = day;
  cp.siegeUntil = day + Math.max(SIEGE_MIN_DAYS, SIEGE_MIN_DAYS + state.rng.int(0, SIEGE_EXTRA_DAYS) +
    (site.garrison > 110 ? 1 : 0));
  const attackers = attackersOf(state, cp);
  attackers.forEach(function (l) { giveOrder(l, 'siege', site.id, true); });

  // 围城一起，守方的领主就收到烽火：能来的都往这座城赶
  const defenders = factionLords(state, site.ownerFaction)
    .filter(function (l) { return army.troopCount(l.troops || {}) >= 8; })
    .sort(function (a, b) { return siteDistance(a, site) - siteDistance(b, site); })
    .slice(0, 4);
  cp.defenderIds = defenders.map(function (l) { return l.id; });
  cp.arrivedIds = [];
  defenders.forEach(function (l) {
    giveOrder(l, 'defend', site.id, true);
    l.defending = site.id;
    l.order.campaign = cp.faction;
  });
  logFn(state,
    '【' + FACTIONS[cp.faction].name + '】的 ' + attackers.length + ' 路领主围住' + site.name +
    '，营寨一圈圈扎到城下。守军闭门，烽火向' + FACTIONS[site.ownerFaction].name + '各地求援。',
    'siege');
  return true;
}

function resolveSiege(state, cp, day) {
  const site = siteById(state, cp.targetId);
  if (!site) { cp.done = true; return; }
  if (site.ownerFaction !== cp.enemy) {
    // 城在围城期间被别人拿了：这趟作罢
    cp.done = true;
    attackersOf(state, cp).forEach(clearOrder);
    return;
  }
  const attackers = attackersOf(state, cp).filter(function (l) {
    return siteDistance(l, site) <= 2;
  });
  let attackPower = 0;
  attackers.forEach(function (l) { attackPower += weight(l.troops); });
  let defendPower = site.garrison * 6.2;
  cp.defenderIds.forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l || !l.alive || l.prisoner) return;
    if (siteDistance(l, site) <= 2) {
      defendPower += weight(l.troops);
      if (cp.arrivedIds.indexOf(id) < 0) cp.arrivedIds.push(id);
    }
  });
  attackPower *= 0.9 + state.rng.next() * 0.25;
  defendPower *= 0.9 + state.rng.next() * 0.25;

  if (attackPower > defendPower * 1.06) {
    const oldOwner = site.ownerFaction;
    const oldName = FACTIONS[oldOwner] ? FACTIONS[oldOwner].full : oldOwner;
    site.ownerFaction = cp.faction;
    site.faction = cp.faction;
    site.playerOwned = false;
    // 夺城后由攻方领兵者接管；没有在场领主就等本势力最近的人来接
    site.lordId = null;
    const newFiefLord = attackers.filter(function (l) { return l && l.alive && !l.prisoner; })[0]
      || state.lords.filter(function (l) { return l.alive && l.faction === cp.faction; })[0];
    if (newFiefLord) site.lordId = newFiefLord.id;
    site.garrison = Math.max(28, Math.round(site.garrisonBase * 0.45));
    site.garrisonBase = site.garrison;
    site.color = FACTIONS[cp.faction] ? FACTIONS[cp.faction].color : site.color;
    site.banner = FACTIONS[cp.faction] ? FACTIONS[cp.faction].banner : site.banner;
    onSiteTaken(state, site, oldOwner);
    state.siegeCooldown[key(cp.faction, oldOwner)] = day + SIEGE_COOLDOWN;
    cp.stage = 'hold';
    cp.holdUntil = day + HOLD_DAYS;
    cp.capturedSiteId = site.id;
    cp.holdSiteId = site.id;
    attackers.forEach(function (l) {
      giveOrder(l, 'hold', site.id, true);
      l.order.since = day;
    });
    // 丢了城的领主先收兵，回各自剩下的城
    cp.defenderIds.forEach(function (id) {
      const l = state.lords.filter(function (x) { return x.id === id; })[0];
      if (!l) return;
      clearOrder(l);
      const home = nearestSiteOf(state, ownedSites(state, l.faction, true), site).site;
      if (home) { l.home = home.id; }
    });
    logFn(state,
      site.name + '城头换了旗。' + FACTIONS[cp.faction].full + '从' + oldName +
      '手里夺下这座城，' + (oldName || '旧主') + '的残部退往野地。', 'siege');
    return;
  }

  // 没攻下来：攻方折一阵，退回集结地；守方也只算惨胜
  attackers.forEach(function (l) {
    army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.24)));
    clearOrder(l);
  });
  site.garrison = Math.max(18, site.garrison - Math.round(site.garrison * 0.22));
  cp.defenderIds.forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    clearOrder(l);
    if (l.troops) army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.12)));
  });
  state.siegeCooldown[key(cp.faction, cp.enemy)] = day + FAIL_COOLDOWN;
  cp.done = true;
  logFn(state,
    '围城到第 ' + Math.max(SIEGE_MIN_DAYS, day - cp.siegeStart) + ' 天，' + site.name +
    '城下还是没破。' + FACTIONS[cp.faction].name + '收兵回营，城头守军也折了一半。', 'siege');
}

/** 每天一次：给各国诸侯做战略决策 */
function strategyTick(state) {
  initAI(state);
  const day = state.clock.day;
  const playerFaction = state.player && state.player.faction;
  Object.keys(FACTIONS).forEach(function (faction) {
    if (faction === 'player' || faction === 'bandit') return;
    // 玩家效忠的国不再自作主张开拔、围城；要打由玩家自己下命
    if (playerFaction && playerFaction !== 'player' && faction === playerFaction) return;
    if ((state.factionState[faction] || {}).dead) {
      const cp = state.warCampaigns[faction];
      if (cp) {
        attackersOf(state, cp).forEach(clearOrder);
        delete state.warCampaigns[faction];
      }
      return;
    }
    const cp = state.warCampaigns[faction];
    if (!cp) {
      // 天下同时最多三场大战，其余势力仍在路上巡逻、互相寻仇
      const active = Object.keys(state.warCampaigns).filter(function (f) {
        return state.warCampaigns[f] && !state.warCampaigns[f].done;
      }).length;
      if (active < 3) planCampaign(state, faction, day);
      return;
    }
    if (cp.done) {
      attackersOf(state, cp).forEach(clearOrder);
      cp.defenderIds.forEach(function (id) {
        const l = state.lords.filter(function (x) { return x.id === id; })[0];
        if (l) clearOrder(l);
      });
      delete state.warCampaigns[faction];
      return;
    }
    const target = siteById(state, cp.targetId);
    if (!target) { cp.done = true; return; }
    const attackers = attackersOf(state, cp);
    if (attackers.length < 2 && cp.stage !== 'siege') { cp.done = true; return; }

    if (cp.stage === 'rally') {
      const ready = attackers.filter(function (l) {
        return siteDistance(l, siteById(state, cp.rallyId) || target) <= 2;
      }).length;
      if (day >= cp.rallyUntil) {
        if (ready < 2 && day < cp.rallyUntil + 4) return;
        if (ready < 2) {
          cp.done = true;
          logFn(state, '【' + FACTIONS[faction].name + '】的集结没凑齐人，队伍在半路散了。', 'siege');
          return;
        }
        cp.stage = 'march';
        cp.marchStart = day;
        attackers.forEach(function (l) { giveOrder(l, 'march', cp.targetId, false); });
        logFn(state, '【' + FACTIONS[faction].name + '】的 ' + attackers.length + ' 路人马从' +
          (siteById(state, cp.rallyId) || target).name + '开拔，兵锋指向' + target.name + '。', 'muster');
      }
      return;
    }

    if (cp.stage === 'march') {
      if (day - cp.marchStart > 26) {
        cp.done = true;
        logFn(state, '【' + FACTIONS[faction].name + '】去' + target.name + '的路太长，粮尽退兵。', 'siege');
        return;
      }
      const near = attackers.some(function (l) { return siteDistance(l, target) <= 1; });
      if (near) startSiege(state, cp, target, day);
      return;
    }

    if (cp.stage === 'siege') {
      // 围城每天都要死人：箭、疫病、夜袭，谁也跑不掉
      attackers.forEach(function (l) {
        if (l.troops) army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.035)));
      });
      target.garrison = Math.max(8, target.garrison - Math.round(target.garrison * 0.055));
      cp.defenderIds.forEach(function (id) {
        const l = state.lords.filter(function (x) { return x.id === id; })[0];
        if (!l || !l.alive || l.prisoner) return;
        if (siteDistance(l, target) <= 2 && cp.arrivedIds.indexOf(id) < 0) {
          cp.arrivedIds.push(id);
          logFn(state, '【' + FACTIONS[l.faction].name + '】的' + l.name + '赶到' + target.name +
            '城下，守军士气振了一下。', 'siege');
        }
      });
      if (day >= cp.siegeUntil) resolveSiege(state, cp, day);
      return;
    }

    if (cp.stage === 'hold') {
      if (day >= cp.holdUntil) {
        cp.done = true;
        attackersOf(state, cp).forEach(clearOrder);
        logFn(state, FACTIONS[faction].name + '在' + (siteById(state, cp.holdSiteId) || target).name +
          '留了一支守军，主力回营。', 'siege');
      }
    }
  });
}

/** 每个 NPC 步补一次：走到城下的队伍不必等第二天才围城 */
function siegeTick(state) {
  initAI(state);
  Object.keys(state.warCampaigns).forEach(function (faction) {
    const cp = state.warCampaigns[faction];
    if (!cp || cp.stage !== 'march') return;
    const target = siteById(state, cp.targetId);
    if (!target || target.ownerFaction !== cp.enemy) return;
    const near = attackersOf(state, cp).some(function (l) {
      return siteDistance(l, target) <= 1;
    });
    if (near) startSiege(state, cp, target, state.clock.day);
  });
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
  init, atWar, declare, makePeace, diplomacyTick, peaceOfferTick,
  aiCanDeclare,
  fieldTick, clash, capture, freeLord, prisonerTick, onSiteTaken, playerDefeatsLord,
  killLord, recruitLord, recruitChance, playerStanding,
  ransom, release, listPrisoners, summaryLines, warPartners, bindLogger, bindPassable, weight,
  nearestFoe,
  strategyTick, siegeTick,
  ESCAPE_BASE, ESCAPE_STEP,
};

