/**
 * 战斗层：回合制战术结算 + 天机简
 * 玩家选战术，回合自动推进，双方同时结算，低阶兵先倒。
 * 天机简可在战中写一笔，改一次规则（风向 / 风止 / 名册）。
 */

const { TROOPS } = require('../data/troops.js');
const { HISTORY_MARKS } = require('../data/china.js');
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
/** 每 12 轮为一“阵”。一阵打完不分胜负就继续下一阵，直到一方兵力归零。 */
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

/**
 * 每回合伤亡比例。
 * 防守权重给得高（3.2）：甲厚、结阵的一方几乎不掉人，输的一方才会被碾。
 * minLoss 传 0 时，弱势一方可能整轮无伤亡（仗就不会打成磨盘）。
 */
function lossOfAttacker(defenderAtk, attackerDef, attackerCount, rng, minLoss) {
  const ratio = defenderAtk / (defenderAtk + attackerDef * 3.2);
  const base = clamp(Math.pow(Math.min(1.2, ratio), 1.9) * 0.56, 0.02, 0.3);
  const jitter = 0.9 + rng.random() * 0.2;
  const n = Math.round(attackerCount * base * jitter);
  return Math.max(minLoss === undefined ? 1 : minLoss, n);
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
    this.roundsInBatch = 0;
    this.batch = 1;
    this.batchDone = false;
    this.log = [];
    this.finished = false;
    this.result = null;
    this.lossesA = {};
    this.lossesB = {};
    this.retreated = false;
    this.fireGround = false;
    this.shiMark = null;
    this.shiTiming = '';
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

  /** 写一笔天机简 */
  applyShiMark(id) {
    const mark = HISTORY_MARKS[id];
    this.shiMark = id;
    this.shiName = mark ? mark.name : (id === 'wind' ? '南风起' : id === 'calm' ? '风止' : '名册');
    // 南风起 / 风止是战中效果；名册只在战后结算阵亡者。
    this.shiTiming = mark ? mark.timing : (id === 'roll' ? 'after' : 'battle');
    if (id === 'calm') this.shiRounds = (mark && mark.rounds) || 3;
    if (id === 'wind') this.fireGround = true;
  }

  /** 推进一个回合 */
  step() {
    if (this.finished || this.batchDone) return null;
    this.round += 1;
    this.roundsInBatch += 1;
    this.batch = Math.ceil(this.round / MAX_ROUNDS);

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

    // 天机简效果：只利己，不反噬
    const shi = this.shiMark ? HISTORY_MARKS[this.shiMark] : null;
    if (shi && this.shiMark === 'wind') {
      atkA *= shi.atkMul;
      if (this.fireGround) atkA *= shi.fireMul;
    }
    if (shi && this.shiMark === 'calm' && this.shiRounds > 0) {
      // 风止只压敌军：玩家在 a 时削 b，玩家在 b 时削 a。自己的攻势不受影响。
      if (this.a.isPlayer) atkB *= shi.enemyMul;
      else if (this.b.isPlayer) atkA *= shi.enemyMul;
      this.shiRounds -= 1;
    }

    // 火攻战：带火船/火计的兵种威力翻倍的一部分
    if (this.fireGround && sa.fireRatio > 0.05) atkA *= 1.15;

    // 弓弩首轮齐射
    let alphaStrike = 0;
    if (this.round === 1 && tacticA.id === 'skirmish' && sa.rangedRatio > 0.15) {
      alphaStrike = Math.round(sb.count * 0.06 + sa.ranged * 0.5);
    }

    // 主将亲自带的人更经打：玩家侧伤亡打六折，但每轮至少折 1 人。
    // 不能出现“敌方每轮必掉 1、我方可以永远 0”的磨盘，否则再弱的敌人也会被拖死。
    let lossA = lossOfAttacker(atkB, defA, sa.count, this.rng, 1);
    if (this.a.isPlayer) lossA = Math.max(1, Math.round(lossA * 0.45));
    const lossB = lossOfAttacker(atkA, defB, sb.count, this.rng, 1) + alphaStrike;

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

    // 不再因为“剩得少”就提前溃败：只有真正打光一方，才算这一仗结束。
    // 12 轮只是“一阵”，一阵结束双方还有人就继续下一阵；中途不结算、不判胜。
    if (this.remainA() <= 0 || this.remainB() <= 0) {
      if (this.remainA() <= 0 && this.remainB() <= 0) this.finish('draw');
      else if (this.remainB() <= 0) this.finish('win');
      else this.finish('lose');
    } else if (this.roundsInBatch >= MAX_ROUNDS) {
      this.batchDone = true;
    }

    return entry;
  }

  /** 一阵打完还活着双方：开下一阵 12 轮 */
  nextBatch() {
    if (this.finished) return false;
    if (!this.batchDone) return false;
    this.batchDone = false;
    this.roundsInBatch = 0;
    return true;
  }

  finish(result) {
    // 哪怕是碾压，也总有几个人倒在阵前：胜仗至少记一笔零星伤亡
    if (this.a.isPlayer && result === 'win') {
      const lost = this.a.initialCount - this.remainA();
      if (lost <= 0 && this.a.initialCount >= 6) {
        const real = distributeLosses(this.a.troops, 1);
        const self = this;
        Object.keys(real).forEach(function (id) {
          self.lossesA[id] = (self.lossesA[id] || 0) + real[id];
        });
        this.log.push({
          round: this.round,
          aLossText: lossText(this.a.troops, real),
          bLossText: '无伤亡',
          remainA: this.remainA(),
          remainB: this.remainB(),
          alphaStrike: 0,
        });
      }
    }
    this.finished = true;
    this.batchDone = false;
    this.result = result;
  }

  retreat() {
    if (this.finished) return this.result;
    // 殿后留一成，不再一刀砍掉四分之一
    const extra = Math.max(1, Math.round(this.remainA() * 0.1));
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
    // 没打到一方归零，就没有“缴获”这回事；中途一阵结束绝不结算金额。
    if (!this.finished || this.result !== 'win') return 0;
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
      base += unit * 0.7 * self.b.initialTroops[id];
    });
    return Math.max(120, Math.round(base * kindMul * tierMul * (0.75 + this.rng.random() * 0.4)));
  }

  summary() {
    return {
      result: this.result,
      finished: this.finished,
      round: this.round,
      rounds: this.round,
      batch: this.batch,
      remainA: this.remainA(),
      remainB: this.remainB(),
      initialA: this.a.initialCount,
      initialB: this.b.initialCount,
      lossesA: this.lossesA,
      lossesB: this.lossesB,
      loot: this.loot(),
      shiMark: this.shiMark,
      shiName: this.shiName,
      shiTiming: this.shiTiming,
    };
  }

  /** 一阵 12 轮结束、双方仍有兵：只报战况，不报缴获 */
  interimSummary() {
    return {
      result: null,
      finished: false,
      interim: true,
      round: this.round,
      rounds: this.round,
      batch: this.batch,
      remainA: this.remainA(),
      remainB: this.remainB(),
      initialA: this.a.initialCount,
      initialB: this.b.initialCount,
      lossesA: this.lossesA,
      lossesB: this.lossesB,
      loot: 0,
    };
  }
}

module.exports = { Battle, TACTICS, TACTIC_LIST, moraleFactor };

