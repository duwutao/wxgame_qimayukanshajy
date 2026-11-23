/**
 * 战斗层：回合制战术结算 + 史简
 * 玩家选战术，回合自动推进，双方同时结算，低阶兵先倒。
 * 史简可在战中写一笔，改一次规则（风向 / 风止 / 名册）。
 */

const { TROOPS } = require('../data/troops.js');
const { troopCount, strength, distributeLosses } = require('./army.js');

const TACTICS = {
  assault: {
    id: 'assault', name: '全军冲锋', atk: 1.28, def: 0.85,
    desc: '攻击 +28%，防御 -15%。骑兵越多越赚。',
  },
  hold: {
    id: 'hold', name: '结阵固守', atk: 0.9, def: 1.35,
    desc: '防御 +35%。枪盾多时能顶住骑兵。',
  },
  flank: {
    id: 'flank', name: '骑兵包抄', atk: 1.1, def: 1.0,
    desc: '骑兵超过 12% 时，攻击额外 +35%。',
  },
  skirmish: {
    id: 'skirmish', name: '弓弩先射', atk: 1.15, def: 0.95,
    desc: '远程超过 15% 时，开局多一轮齐射。',
  },
};

const TACTIC_LIST = ['assault', 'hold', 'flank', 'skirmish'];
const MAX_ROUNDS = 12;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function moraleFactor(morale) {
  const m = clamp(typeof morale === 'number' ? morale : 60, 0, 100);
  const base = 0.75 + (m / 100) * 0.35;
  return m < 30 ? base * 0.8 : base;
}

function makeSide(unit) {
  const troops = {};
  Object.keys(unit.troops || {}).forEach(function (id) {
    const c = unit.troops[id] || 0;
    if (c > 0) troops[id] = c;
  });
  return {
    name: unit.name || '无名之师',
    faction: unit.faction || null,
    troops,
    morale: typeof unit.morale === 'number' ? unit.morale : 60,
    atkPct: unit.atkPct || 0,
    defPct: unit.defPct || 0,
    isPlayer: !!unit.isPlayer,
    initialTroops: JSON.parse(JSON.stringify(troops)),
    initialCount: troopCount(troops),
  };
}

function offenseOf(side, st, tactic) {
  let atk = st.atk * moraleFactor(side.morale) * tactic.atk * (1 + side.atkPct);
  if (tactic.id === 'flank') atk *= st.cavRatio > 0.12 ? 1.35 : 1.05;
  if (tactic.id === 'assault') atk *= 1 + st.cavRatio * 0.3;
  if (tactic.id === 'skirmish' && st.rangedRatio > 0.15) atk *= 1.12;
  if (st.fireRatio > 0.1) atk *= 1.08;
  return atk;
}

function defenseOf(side, st, tactic, enemySt) {
  let def = st.def * moraleFactor(side.morale) * tactic.def * (1 + side.defPct);
  if (st.spearRatio > 0.18 && enemySt.cavRatio > 0.15) def *= 1.3;
  return def;
}

function lossOfAttacker(defenderAtk, attackerDef, attackerCount, rng) {
  const ratio = defenderAtk / (defenderAtk + attackerDef * 2.2);
  const base = clamp(Math.pow(Math.min(1.2, ratio), 1.8) * 0.5, 0.04, 0.3);
  const jitter = 0.92 + rng.random() * 0.16;
  return Math.max(1, Math.round(attackerCount * base * jitter));
}

function lossText(troops, losses) {
  const parts = [];
  Object.keys(losses).forEach(function (id) {
    const t = TROOPS[id];
    parts.push((t ? t.name : id) + '-' + losses[id]);
  });
  return parts.length ? parts.join(' ') : '无伤亡';
}

class Battle {
  constructor(opts) {
    this.rng = opts.rng;
    this.a = makeSide(opts.attacker);
    this.b = makeSide(opts.defender);
    this.aTactic = opts.aTactic && TACTICS[opts.aTactic] ? opts.aTactic : 'assault';
    this.bTactic = opts.bTactic && TACTICS[opts.bTactic] ? opts.bTactic : 'assault';
    this.context = opts.context || {};
    this.round = 0;
    this.log = [];
    this.finished = false;
    this.result = null;
    this.lossesA = {};
    this.lossesB = {};
    this.retreated = false;
    this.fireGround = false;
    this.shiMark = null;
    this.shiRounds = 0;
    this.shiName = '';
  }

  tacticOf(side) {
    return TACTICS[side === 'a' ? this.aTactic : this.bTactic] || TACTICS.assault;
  }

  setTactic(id) {
    if (!TACTICS[id]) return false;
    this.aTactic = id;
    return true;
  }

  remainA() {
    return troopCount(this.a.troops);
  }

  remainB() {
    return troopCount(this.b.troops);
  }

  /** 写一笔史简 */
  applyShiMark(id) {
    this.shiMark = id;
    this.shiName = id === 'wind' ? '南风起' : id === 'calm' ? '风止' : '名册';
    if (id === 'calm') this.shiRounds = 3;
    if (id === 'wind') this.fireGround = true;
  }

  /** 推进一个回合 */
  step() {
    if (this.finished) return null;
    this.round += 1;

    const sa = strength(this.a.troops);
    const sb = strength(this.b.troops);

    if (sa.count <= 0 || sb.count <= 0) {
      this.finish(sa.count <= 0 && sb.count <= 0 ? 'draw' : sa.count > 0 ? 'win' : 'lose');
      return null;
    }

    const tacticA = this.tacticOf('a');
    const tacticB = this.tacticOf('b');
    let atkA = offenseOf(this.a, sa, tacticA);
    let defA = defenseOf(this.a, sa, tacticA, sb);
    let atkB = offenseOf(this.b, sb, tacticB);
    let defB = defenseOf(this.b, sb, tacticB, sa);

    // 弩破甲：忽略一部分敌方甲
    if (sa.pierceRatio > 0.12) defB *= 0.82;
    if (sb.pierceRatio > 0.12) defA *= 0.82;

    // 史简效果
    if (this.shiMark === 'wind') {
      atkA *= 1.45;
      if (this.fireGround) atkA *= 1.25;
    }
    if (this.shiMark === 'calm' && this.shiRounds > 0) {
      atkA *= 0.65;
      atkB *= 0.65;
      this.shiRounds -= 1;
    }

    // 火攻战：带火船/火计的兵种威力翻倍的一部分
    if (this.fireGround && sa.fireRatio > 0.05) atkA *= 1.15;

    // 弓弩首轮齐射
    let alphaStrike = 0;
    if (this.round === 1 && tacticA.id === 'skirmish' && sa.rangedRatio > 0.15) {
      alphaStrike = Math.round(sb.count * 0.06 + sa.ranged * 0.5);
    }

    const lossA = lossOfAttacker(atkB, defA, sa.count, this.rng);
    const lossB = lossOfAttacker(atkA, defB, sb.count, this.rng) + alphaStrike;

    const realA = distributeLosses(this.a.troops, lossA);
    const realB = distributeLosses(this.b.troops, Math.max(1, lossB));

    const self = this;
    Object.keys(realA).forEach(function (id) {
      self.lossesA[id] = (self.lossesA[id] || 0) + realA[id];
    });
    Object.keys(realB).forEach(function (id) {
      self.lossesB[id] = (self.lossesB[id] || 0) + realB[id];
    });

    const entry = {
      round: this.round,
      aLossText: lossText(this.a.troops, realA),
      bLossText: lossText(this.b.troops, realB),
      remainA: this.remainA(),
      remainB: this.remainB(),
      alphaStrike,
    };
    this.log.push(entry);

    // 溃败判定：lock（白毦/禁军一类）不轻易溃
    const ratioA = this.remainA() / (this.a.initialCount || 1);
    const ratioB = this.remainB() / (this.b.initialCount || 1);
    const lockA = strength(this.a.initialTroops).lockRatio > 0.25;
    const lockB = strength(this.b.initialTroops).lockRatio > 0.25;
    const breakA = ratioA < 0.35 && !lockA;
    const breakB = ratioB < 0.35 && !lockB;

    if (this.remainA() <= 0 || breakA || this.remainB() <= 0 || breakB) {
      if (this.remainA() <= 0 && this.remainB() <= 0) this.finish('draw');
      else if (this.remainB() <= 0 || breakB) this.finish('win');
      else this.finish('lose');
    } else if (this.round >= MAX_ROUNDS) {
      this.finish(Math.abs(ratioA - ratioB) < 0.05 ? 'draw' : ratioA > ratioB ? 'win' : 'lose');
    }

    return entry;
  }

  finish(result) {
    this.finished = true;
    this.result = result;
  }

  retreat() {
    if (this.finished) return this.result;
    const extra = Math.max(1, Math.round(this.remainA() * 0.25));
    const real = distributeLosses(this.a.troops, extra);
    const self = this;
    Object.keys(real).forEach(function (id) {
      self.lossesA[id] = (self.lossesA[id] || 0) + real[id];
    });
    this.retreated = true;
    this.finish('retreat');
    return 'retreat';
  }

  loot() {
    if (this.result !== 'win') return 0;
    const ctx = this.context || {};
    // 打匪团来钱快（新手要靠这个滚雪球），攻城与战役另算
    const kindMul = ctx.kind === 'party' || ctx.kind === 'chase' ? 1.9
      : ctx.kind === 'lord' ? 2.1
      : ctx.kind === 'siege' ? 1.5
      : ctx.kind === 'campaign' ? 2.4 : 1.2;
    const tierMul = ctx.tier ? 1 + (ctx.tier - 1) * 0.35 : 1;
    let base = 0;
    const self = this;
    Object.keys(this.b.initialTroops).forEach(function (id) {
      const t = TROOPS[id];
      const unit = t && t.recruit ? t.recruit : t ? Math.max(16, t.tier * 12) : 16;
      base += unit * 0.55 * self.b.initialTroops[id];
    });
    return Math.max(90, Math.round(base * kindMul * tierMul * (0.75 + this.rng.random() * 0.4)));
  }

  summary() {
    return {
      result: this.result,
      round: this.round,
      rounds: this.round,
      remainA: this.remainA(),
      remainB: this.remainB(),
      initialA: this.a.initialCount,
      initialB: this.b.initialCount,
      lossesA: this.lossesA,
      lossesB: this.lossesB,
      loot: this.loot(),
      shiMark: this.shiMark,
      shiName: this.shiName,
    };
  }
}

module.exports = { Battle, TACTICS, TACTIC_LIST, moraleFactor };
