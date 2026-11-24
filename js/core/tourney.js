/**
 * 比武大会：押一注报名费，跟一位好手在彩棚底下比三招血。
 *
 * 玩法是"猜手"：每合一招，双方各出一手——
 *   左挡 / 右挡 / 左攻 / 右攻。
 * 结算：
 *   · 都攻 → 两败俱伤，各掉一滴血
 *   · 都挡 → 各自绕圈试探，这合白打
 *   · 一攻一挡，方向相同（挡住）→ 攻击方掉血，防守方不掉，还白赚一刀
 *   · 一攻一挡，方向不同（挡空）→ 防守方掉血
 * 三滴血，先见底的人输。报名 40 金，赢的人拿 200。
 *
 * 不杀人不损兵，纯个人武艺（骑砍竞技场的味道）。
 */

const { LORDS, FACTIONS } = require('../data/china.js');
const heroes = require('./heroes.js');

const HP = 3;
const FEE = 40;
const PRIZE = 200;

const MOVES = {
  blockL: { id: 'blockL', name: '左挡', dir: 'L', kind: 'block' },
  blockR: { id: 'blockR', name: '右挡', dir: 'R', kind: 'block' },
  attackL: { id: 'attackL', name: '左攻', dir: 'L', kind: 'attack' },
  attackR: { id: 'attackR', name: '右攻', dir: 'R', kind: 'attack' },
};
const MOVE_IDS = ['blockL', 'blockR', 'attackL', 'attackR'];

function fee() {
  return FEE;
}

function prize() {
  return PRIZE;
}

/** 挑一个本地的对手：从天下名将里抽一位，身板随声望涨一点 */
function pickFoe(state) {
  const rng = state.rng;
  const list = LORDS.filter(function (l) { return l && l.id && l.name; });
  const def = list[rng.int(0, list.length - 1)];
  const rep = Math.min(20, Math.floor((state.player.renown || 0) / 60));
  return {
    name: def.name,
    faction: def.faction,
    lordId: def.id,
    // 读招的本事：0.12 ~ 0.5，随你的声望往上加，别让人一开场就摸透
    skill: Math.max(0.12, Math.min(0.5, 0.16 + rep * 0.02)),
    tag: (FACTIONS[def.faction] || {}).full || '外地来的好手',
  };
}

function enter(state, site) {
  const cost = FEE;
  if (state.player.gold < cost) {
    return { ok: false, msg: '报名要 ' + cost + ' 金，你身上不够' };
  }
  state.player.gold -= cost;
  state.tourney = {
    siteId: site ? site.id : null,
    siteName: site ? site.name : '此地',
    hp: HP,
    foeHp: HP,
    foe: pickFoe(state),
    moves: [],
    log: [],
    done: false,
    champion: false,
    draw: false,
    fee: cost,
    pot: PRIZE,
    round: 0,
  };
  return { ok: true, msg: '交了 ' + cost + ' 金报名费，签了生死状（其实不杀人）。' };
}

/** 对手出招：多数时候乱来，偶尔读你上一手的习惯 */
function aiMove(state) {
  const t = state.tourney;
  if (!t) return 'attackL';
  const rng = state.rng;
  const last = t.moves.length ? t.moves[t.moves.length - 1] : null;
  if (last && rng.next() < (t.foe.skill || 0.2)) {
    if (last.pMove === 'attackL') return 'blockL';
    if (last.pMove === 'attackR') return 'blockR';
    if (last.pMove === 'blockL') return 'attackR';
    if (last.pMove === 'blockR') return 'attackL';
  }
  return MOVE_IDS[rng.int(0, MOVE_IDS.length - 1)];
}

function dirName(d) {
  return d === 'L' ? '左' : '右';
}

/**
 * 纯结算：给定双方这一合的招，算出各掉几滴血。
 * 规则只在这里写一遍，play 和测试都走它。
 */
function settle(pMoveId, fMoveId) {
  const pm = MOVES[pMoveId];
  const fm = MOVES[fMoveId];
  if (!pm || !fm) return null;
  let dmgPlayer = 0;
  let dmgFoe = 0;
  let line = '';

  if (pm.kind === 'attack' && fm.kind === 'attack') {
    dmgPlayer = 1;
    dmgFoe = 1;
    line = '两边同时抢攻，家伙都落了实，各挨一下。';
  } else if (pm.kind === 'block' && fm.kind === 'block') {
    line = '两边都在收着，绕着彩棚走了半圈，这一合谁也没摸着谁。';
  } else if (pm.kind === 'attack' && fm.kind === 'block') {
    if (pm.dir === fm.dir) {
      // 挡对了：进攻方白挨一刀，防守方不掉血
      dmgPlayer = 1;
      line = '你从' + dirName(pm.dir) + '边抢攻，对面正好在' + dirName(fm.dir) + '边架上盾，你虎口被震得发麻。';
    } else {
      // 挡空了：防守方掉血
      dmgFoe = 1;
      line = '你从' + dirName(pm.dir) + '边虚晃一招，人却从' + dirName(pm.dir === 'L' ? 'R' : 'L') + '边切进去，一刀劈在他护肩上。';
    }
  } else if (pm.dir === fm.dir) {
    // 你挡住他的攻：反手赚他一下
    dmgFoe = 1;
    line = '他攻你' + dirName(fm.dir) + '，你' + dirName(pm.dir) + '手盾迎上去，磕开刀锋还推了他一把。';
  } else {
    dmgPlayer = 1;
    line = '他攻你' + dirName(fm.dir) + '边，你挡在' + dirName(pm.dir) + '边——护不住，肋下吃了一记。';
  }

  return { dmgPlayer: dmgPlayer, dmgFoe: dmgFoe, line: line };
}

/**
 * 出一招，跟对手的招一起结算。
 * 返回 { ok, pMove, fMove, hp, foeHp, done, champion, draw, lines }
 */
function play(state, moveId) {
  const t = state.tourney;
  if (!t) return { ok: false, msg: '大会已经散了' };
  if (t.done) return { ok: false, msg: '这一场已经完了' };
  const pm = MOVES[moveId];
  if (!pm) return { ok: false, msg: '没有这么一手' };

  const fm = MOVES[aiMove(state)];
  const settled = settle(pm.id, fm.id);
  const dmgPlayer = settled.dmgPlayer;
  const dmgFoe = settled.dmgFoe;
  t.round += 1;
  const lines = ['第 ' + t.round + ' 合：', settled.line];

  t.hp -= dmgPlayer;
  t.foeHp -= dmgFoe;
  t.moves.push({ pMove: moveId, fMove: fm.id, dmgPlayer: dmgPlayer, dmgFoe: dmgFoe });
  lines.push('（你 ' + Math.max(0, t.hp) + ' 血 · ' + t.foe.name + ' ' + Math.max(0, t.foeHp) + ' 血）');

  let result = 'continue';
  if (t.hp <= 0 && t.foeHp <= 0) {
    t.done = true;
    t.draw = true;
    result = 'draw';
    state.player.gold += t.fee;
    state.player.renown += 6;
    lines.push('两个人一起倒下去，砸翻了彩棚的灯。主事的人把 ' + t.fee + ' 金报名费退了你，赏格对半分不成，只好作罢。');
  } else if (t.foeHp <= 0) {
    t.done = true;
    t.champion = true;
    result = 'win';
    state.player.gold += t.pot;
    state.player.renown += 40;
    state.player.morale = Math.min(100, state.player.morale + 8);
    heroes.gainHeroExp(state, 10);
    lines.push('他撑着刀跪在地上，认了。彩棚下把铜钱往场里洒，赏钱 ' + t.pot + ' 金，声望 +40。');
    if (t.foe.lordId) {
      const lid = t.foe.lordId;
      state.lords.forEach(function (l) {
        if (l.id === lid && l.alive) {
          state.relations[l.faction] = Math.min(100, (state.relations[l.faction] || 0) + 6);
        }
      });
    }
  } else if (t.hp <= 0) {
    t.done = true;
    result = 'lose';
    state.player.renown += 2;
    state.player.morale = Math.max(0, state.player.morale - 4);
    lines.push('你膝盖一软，坐在了土里。' + t.foe.name + '收了手，抱拳说：再练两年。报名费没了，台下还是有人叫好——敢上场的人不多。声望 +2。');
  }

  t.log.push(lines.join('\n'));
  return {
    ok: true,
    pMove: pm.id,
    fMove: fm.id,
    hp: Math.max(0, t.hp),
    foeHp: Math.max(0, t.foeHp),
    done: t.done,
    champion: !!t.champion,
    draw: !!t.draw,
    result: result,
    lines: lines,
  };
}

function close(state) {
  state.tourney = null;
}

module.exports = {
  HP, FEE, PRIZE, MOVES, MOVE_IDS,
  fee, prize, pickFoe, enter, aiMove, settle, play, close,
};
