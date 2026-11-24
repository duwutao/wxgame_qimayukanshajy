/**
 * 比武大会：交报名费，连打三场，赢了拿钱、拿声望、英雄也跟着长本事。
 * 不打兵、不死人，纯粹的个人武艺（骑砍的竞技场味）。
 */

const { LORDS, FACTIONS } = require('../data/china.js');
const heroes = require('./heroes.js');
const economy = require('./economy.js');

const ROUNDS = 3;

const FOE_TITLES = [
  { name: '游侠', power: 34, tag: '不知名的游侠' },
  { name: '军中教头', power: 46, tag: '某营的教头' },
  { name: '带甲校尉', power: 58, tag: '带甲的校尉' },
];

function fee(state) {
  return 30 + Math.min(60, Math.floor((state.player.renown || 0) / 40) * 10);
}

function prize(state) {
  return 180 + Math.min(240, Math.floor((state.player.renown || 0) / 30) * 20);
}

/** 你自己的身板：装备 + 声望 + 随行英雄指点 */
function playerPower(state) {
  const st = state;
  const equip = economy.equipmentBonus(st);
  const hb = heroes.heroBonus(st);
  return 34 + (equip.atkPct + equip.defPct) * 45 + Math.min(60, (st.player.renown || 0) * 0.22)
    + (hb.atkPct + hb.defPct) * 40;
}

function pickFoes(state) {
  const rng = state.rng;
  const list = [];
  // 前两场是本地好手，第三场从天下名将里挑一个
  FOE_TITLES.slice(0, 2).forEach(function (t, i) {
    list.push({
      name: t.name + '·' + ['甲', '乙', '丙'][i],
      power: t.power + rng.int(-4, 6),
      tag: t.tag,
      famous: false,
    });
  });
  const idx = rng.int(0, LORDS.length - 1);
  const def = LORDS[idx];
  list.push({
    name: def.name,
    power: 56 + Math.round((def.morale || 60) * 0.26) + rng.int(-6, 8),
    tag: (FACTIONS[def.faction] || {}).full || '',
    famous: true,
    lordId: def.id,
  });
  return list;
}

function enter(state, site) {
  const cost = fee(state);
  if (state.player.gold < cost) {
    return { ok: false, msg: '报名要 ' + cost + ' 金，你身上不够' };
  }
  state.player.gold -= cost;
  state.tourney = {
    siteId: site ? site.id : null,
    siteName: site ? site.name : '此地',
    round: 0,
    foes: pickFoes(state),
    pot: prize(state),
    won: 0,
    done: false,
    log: [],
    fee: cost,
  };
  return { ok: true, msg: '交了 ' + cost + ' 金报名费，签了生死状（其实不杀人）。' };
}

function currentFoe(state) {
  const t = state.tourney;
  if (!t || t.done) return null;
  return t.foes[t.round] || null;
}

function winChance(state, foe) {
  const mine = playerPower(state);
  const d = (mine - foe.power) / 11;
  return Math.max(0.12, Math.min(0.9, 1 / (1 + Math.exp(-d))));
}

/** 打一场：返回这一场的经过 */
function fightRound(state) {
  const t = state.tourney;
  if (!t || t.done) return { ok: false, msg: '大会已经散了' };
  const foe = t.foes[t.round];
  if (!foe) return { ok: false, msg: '没有对手了' };
  const rng = state.rng;
  const chance = winChance(state, foe);
  const win = rng.next() < chance;
  const roundNo = t.round + 1;

  if (win) {
    t.won += 1;
    t.round += 1;
    const lines = [
      '第 ' + roundNo + ' 场：你与' + foe.name + '对了三十合，一枪挑开他的护腕。围观的兵丁喊成一片。',
    ];
    if (t.round >= ROUNDS) {
      t.done = true;
      t.champion = true;
      const gold = t.pot;
      state.player.gold += gold;
      state.player.renown += 45;
      state.player.morale = Math.min(100, state.player.morale + 10);
      heroes.gainHeroExp(state, 12);
      lines.push('三场全胜。' + t.siteName + '的校场把彩绸抛下来，赏钱 ' + gold + ' 金，声望 +45。');
      if (t.foes[2] && t.foes[2].lordId) {
        const lordId = t.foes[2].lordId;
        state.lords.forEach(function (l) {
          if (l.id === lordId && l.alive) {
            state.relations[l.faction] = Math.min(100, (state.relations[l.faction] || 0) + 6);
          }
        });
        lines.push(t.foes[2].name + '把刀收了，抱拳说：这条命记下了名字。');
      }
    } else {
      state.player.gold += 25;
      state.player.renown += 8;
      lines.push('过了这一场，台下掷上来 ' + 25 + ' 金。下一场等着的是' + (t.foes[t.round] ? t.foes[t.round].name : '——') + '。');
    }
    t.log.push(lines.join('\n'));
    return { ok: true, win: true, lines: lines, done: t.done, champion: !!t.champion };
  }

  t.done = true;
  t.champion = false;
  state.player.morale = Math.max(0, state.player.morale - 4);
  state.player.renown += 2;
  const lines = [
    '第 ' + roundNo + ' 场：' + foe.name + '一个假动作骗开你的枪，木刀敲在你肩上。你退了三步，认输。',
    '报名费没了，不过台下还是有人叫好——敢上场的人不多。声望 +2。',
  ];
  t.log.push(lines.join('\n'));
  return { ok: true, win: false, lines: lines, done: true, champion: false };
}

function close(state) {
  state.tourney = null;
}

module.exports = {
  ROUNDS, fee, prize, playerPower, pickFoes, enter, currentFoe, winChance, fightRound, close,
};
