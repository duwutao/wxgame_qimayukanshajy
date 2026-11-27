/**
 * 战斗层：回合制战术结算 + 天机简
 * 玩家选战术，回合自动推进，双方同时结算，低阶兵先倒。
 * 天机简可改一次规则（南风起 / 天降火球 / 风行 / 夜袭 / 倒戈 / 瘴气 / 回魂）。
 */

const { TROOPS } = require('../data/troops.js');
const { HISTORY_MARKS } = require('../data/china.js');
const { forceCombatMul } = require('../data/lord-rank.js');
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

function lossSum(losses) {
  let n = 0;
  Object.keys(losses || {}).forEach(function (id) { n += losses[id] || 0; });
  return n;
}

function moraleFactor(morale) {
  const m = clamp(typeof morale === 'number' ? morale : 60, 0, 100);
  const base = 0.75 + (m / 100) * 0.35;
  return m < 30 ? base * 0.8 : base;
}

function tierPower(tier) {
  const t = Math.max(1, Math.min(5, Math.round(tier || 1)));
  return Math.pow(2, t - 1);
}

/** 兵种层级：t1=1、t2=2、t3=4、t4=8、t5=16；同级 1:1，每升一级 2:1 */
function tierFactor(troops) {
  let power = 0;
  let count = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    const c = troops[id] || 0;
    if (c <= 0) return;
    power += tierPower(t ? t.tier : 1) * c;
    count += c;
  });
  return count > 0 ? power / count : 1;
}

function makeSide(unit) {
  const troops = {};
  Object.keys(unit.troops || {}).forEach(function (id) {
    const c = unit.troops[id] || 0;
    if (c > 0) troops[id] = c;
  });
  const factionEdge = typeof unit.edge === 'number' ? unit.edge : 1;
  const gateEdge = typeof unit.gateEdge === 'number' ? unit.gateEdge : 1;
  return {
    name: unit.name || '无名之师',
    faction: unit.faction || null,
    troops,
    morale: typeof unit.morale === 'number' ? unit.morale : 60,
    atkPct: unit.atkPct || 0,
    defPct: unit.defPct || 0,
    isPlayer: !!unit.isPlayer,
    edge: factionEdge,
    killMul: typeof unit.killMul === 'number' && unit.killMul > 0 ? unit.killMul : 1,
    // 武力值：杀敌指数的标幺值；战场曲线压平，避免单将 4 倍杀敌直接打穿团战。
    forceValue: typeof unit.forceValue === 'number' ? unit.forceValue : null,
    forceMul: forceCombatMul(unit.forceValue),
    commandValue: typeof unit.commandValue === 'number' ? unit.commandValue : null,
    strategists: Array.isArray(unit.strategists) ? unit.strategists.slice() : [],
    gateEdge: gateEdge,
    tierFactor: tierFactor(troops),
    combatEdge: factionEdge * tierFactor(troops),
    defenseEdge: factionEdge * tierFactor(troops) * gateEdge,
    contingents: Array.isArray(unit.contingents) ? unit.contingents : [],
    coalitionNames: unit.coalitionNames || '',
    initialTroops: JSON.parse(JSON.stringify(troops)),
    initialCount: troopCount(troops),
    lastCount: troopCount(troops),
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
    this.state = opts.state || null;
    this.battleKey = opts.battleKey || this.context.battleKey || null;
    // 攻城战不把一方打光才收场：兵力降到初始的四分之一，弱的一边就溃退。
    // 普通野战保持 0，仍然打到分出胜负为止。
    this.routAt = typeof opts.routAt === 'number' ? opts.routAt : 0;
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
    this.shiEffect = null;
    this.galeEscape = false;
    this.galePinHours = 0;
    this.strategistReports = [];
    this.openingLog = '';
    this.applyStrategistOpening();
  }

  /**
   * 历史军师开局天雷：按 S+ 50% / S 40% / A 30% / B 20% 杀敌，单人封顶 100。
   * 同一场战斗不同军师可叠加；同一军师只触发一次；同一战场反复进出不再触发。
   */
  applyStrategistOpening() {
    const state = this.state;
    const key = this.battleKey || '';
    const used = state ? (state.strategistUsed = state.strategistUsed || {}) : {};
    const seen = {};
    const lines = [];
    const self = this;
    ['a', 'b'].forEach(function (sideKey) {
      const side = self[sideKey];
      const foeKey = sideKey === 'a' ? 'b' : 'a';
      const foe = self[foeKey];
      (side.strategists || []).forEach(function (s) {
        if (!s || !s.id || seen[s.id]) return;
        seen[s.id] = true;
        const mark = key + ':' + s.id;
        if (key && used[mark]) {
          self.strategistReports.push({
            side: sideKey, id: s.id, name: s.name || s.id, grade: s.grade || 'B',
            pct: s.pct || 0, cap: s.cap || 100, killed: 0, skipped: true,
          });
          return;
        }
        const base = foe.initialCount || troopCount(foe.troops);
        const want = Math.max(0, Math.min(s.cap || 100, Math.round(base * (s.pct || 0))));
        const real = self.directLosses(foeKey, Math.min(want, troopCount(foe.troops)));
        const killed = lossSum(real);
        if (killed > 0 && key) used[mark] = true;
        const report = {
          side: sideKey, id: s.id, name: s.name || s.id, grade: s.grade || 'B',
          pct: s.pct || 0, cap: s.cap || 100, killed: killed, skipped: false,
        };
        self.strategistReports.push(report);
        if (killed > 0) {
          lines.push((s.name || s.id) + '·' + (s.grade || 'B') + ' 天雷杀 ' + killed);
        }
      });
    });
    this.openingLog = lines.join('　');
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

  sideOf(key) {
    return key === 'b' ? this.b : this.a;
  }

  playerSideKey() {
    if (this.a.isPlayer) return 'a';
    if (this.b.isPlayer) return 'b';
    return 'a';
  }

  foeSideKey() {
    return this.playerSideKey() === 'a' ? 'b' : 'a';
  }

  sideRemain(key) {
    return troopCount(this.sideOf(key).troops);
  }

  /** 把一次直接伤亡记进本方战损，供战果页统计 */
  recordLosses(sideKey, losses) {
    if (!losses || !Object.keys(losses).length) return;
    const target = sideKey === 'a' ? this.lossesA : this.lossesB;
    Object.keys(losses).forEach(function (id) {
      target[id] = (target[id] || 0) + (losses[id] || 0);
    });
  }

  /** 绕过回合结算，立刻从某一方扣人；返回实际伤亡明细 */
  directLosses(sideKey, total) {
    const side = this.sideOf(sideKey);
    const n = Math.max(0, Math.round(total || 0));
    if (!side || n <= 0) return {};
    const real = distributeLosses(side.troops, n);
    this.recordLosses(sideKey, real);
    return real;
  }

  /** 倒戈：按低阶先走，把敌军一部分人直接拨到我方，并同步合战编队 */
  transferFromFoe(pct, cap) {
    const foeKey = this.foeSideKey();
    const playerKey = this.playerSideKey();
    const foe = this.sideOf(foeKey);
    const player = this.sideOf(playerKey);
    const total = troopCount(foe.troops);
    if (total <= 0) return { count: 0, troops: {} };
    const want = Math.max(0, Math.round(total * (pct || 0)));
    const take = Math.min(cap || want || total, want);
    if (take <= 0) return { count: 0, troops: {} };
    const moved = {};
    let left = take;
    Object.keys(foe.troops || {})
      .map(function (id) { return { id: id, tier: TROOPS[id] ? TROOPS[id].tier : 1, count: foe.troops[id] || 0 }; })
      .sort(function (a, b) { return a.tier - b.tier; })
      .forEach(function (item) {
        if (left <= 0 || item.count <= 0) return;
        const n = Math.min(item.count, left);
        foe.troops[item.id] -= n;
        if (foe.troops[item.id] <= 0) delete foe.troops[item.id];
        moved[item.id] = (moved[item.id] || 0) + n;
        left -= n;
      });
    const count = lossSum(moved);
    if (count <= 0) return { count: 0, troops: {} };
    Object.keys(moved).forEach(function (id) {
      player.troops[id] = (player.troops[id] || 0) + moved[id];
      player.initialTroops[id] = (player.initialTroops[id] || 0) + moved[id];
    });
    player.initialCount += count;
    player.lastCount = troopCount(player.troops);
    this.recordLosses(foeKey, moved);
    const pc = (player.contingents || []).filter(function (c) { return c.isPlayer; })[0];
    if (pc) {
      pc.count = (pc.count || 0) + count;
      pc.initialCount = (pc.initialCount || 0) + count;
      Object.keys(moved).forEach(function (id) {
        pc.snapshot[id] = (pc.snapshot[id] || 0) + moved[id];
      });
    }
    return { count: count, troops: moved };
  }

  /** 直接伤害把敌军打空时按玩家胜负收场，避免玩家在 b 侧时把胜负判反 */
  finishForPlayer(playerWin) {
    const aWin = this.a.isPlayer ? !!playerWin : !playerWin;
    this.finish(aWin ? 'win' : 'lose');
  }

  /** 写一笔天机简 */
  applyShiMark(id) {
    const mark = HISTORY_MARKS[id];
    this.shiMark = id;
    this.shiName = mark ? mark.name : (id === 'wind' ? '南风起' : id === 'fireball' ? '天降火球' : id === 'gale' ? '风行' : '回魂');
    this.shiTiming = mark ? mark.timing : (id === 'roll' ? 'after' : 'battle');
    this.shiRounds = (mark && mark.rounds) || 0;
    if (id === 'wind' || id === 'fireball') this.fireGround = true;

    if (id === 'fireball') {
      const foeKey = this.foeSideKey();
      const before = this.sideRemain(foeKey);
      const burn = Math.max(0, Math.min(mark.burnCap || 0, Math.round(before * (mark.burnPct || 0))));
      const real = this.directLosses(foeKey, burn);
      const amount = lossSum(real);
      this.shiEffect = { kind: 'burn', amount: amount, cap: mark.burnCap || 0 };
      if (amount > 0 && this.sideRemain(foeKey) <= 0) this.finishForPlayer(true);
    } else if (id === 'gale') {
      const foeKey = this.foeSideKey();
      const before = this.sideRemain(foeKey);
      const cut = Math.max(1, Math.round(before * (mark.enemyLossPct || 0)));
      const real = this.directLosses(foeKey, cut);
      const amount = lossSum(real);
      this.galeEscape = true;
      this.galePinHours = mark.pinHours || 8;
      this.retreated = true;
      this.shiEffect = { kind: 'gale', amount: amount, pinHours: this.galePinHours };
      this.finish('retreat');
    } else if (id === 'defector') {
      const moved = this.transferFromFoe(mark.turnPct, mark.turnCap);
      this.shiEffect = { kind: 'defect', amount: moved.count };
    }
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
    // 国别 2:3 与兵种每级 2:1 两层相乘，同时放大攻防。
    atkA *= this.a.combatEdge || 1;
    defA *= this.a.defenseEdge || this.a.combatEdge || 1;
    atkB *= this.b.combatEdge || 1;
    defB *= this.b.defenseEdge || this.b.combatEdge || 1;
    // 武力值：只放大本方每轮杀敌，不改变自身防御；无武力值的旧测试双方都按 1.0。
    atkA *= this.a.forceMul || 1;
    atkB *= this.b.forceMul || 1;

    // 弩破甲：忽略一部分敌方甲
    if (sa.pierceRatio > 0.12) defB *= 0.82;
    if (sb.pierceRatio > 0.12) defA *= 0.82;

    // 天机简效果：只利己，不反噬
    const shi = this.shiMark ? HISTORY_MARKS[this.shiMark] : null;
    const playerKey = this.playerSideKey();
    const foeKey = this.foeSideKey();
    let nightFree = false;
    if (shi && this.shiMark === 'wind') {
      // 南风起不是单纯加攻击：攻防一起按“高两阶”算，才能 T1 打 T3、T4 敌双 T5。
      const boost = Math.pow(2, shi.tierBoost || 0);
      if (playerKey === 'a') {
        atkA *= boost;
        defA *= boost;
        if (this.fireGround) atkA *= shi.fireMul;
      } else {
        atkB *= boost;
        defB *= boost;
        if (this.fireGround) atkB *= shi.fireMul;
      }
    }
    if (shi && this.shiMark === 'night' && this.shiRounds > 0) {
      // 夜袭：敌军三回合完全打不出伤害，不是削一成那种看不出来的效果。
      if (playerKey === 'a') atkB *= shi.enemyAtkMul;
      else atkA *= shi.enemyAtkMul;
      nightFree = true;
      this.shiRounds -= 1;
    }

    // 火攻战：带火船/火计的兵种威力翻倍的一部分
    if (this.fireGround && playerKey === 'a' && sa.fireRatio > 0.05) atkA *= 1.15;
    if (this.fireGround && playerKey === 'b' && sb.fireRatio > 0.05) atkB *= 1.15;

    // 弓弩首轮齐射
    let alphaStrike = 0;
    if (this.round === 1 && tacticA.id === 'skirmish' && sa.rangedRatio > 0.15) {
      alphaStrike = Math.round(sb.count * 0.06 + sa.ranged * 0.5);
    }

    // 主将亲自带的人更经打：玩家侧伤亡打六折，但每轮至少折 1 人。
    // 不能出现“敌方每轮必掉 1、我方可以永远 0”的磨盘，否则再弱的敌人也会被拖死。
    let lossA = lossOfAttacker(atkB, defA, sa.count, this.rng, 1);
    if (this.a.isPlayer) lossA = Math.max(1, Math.round(lossA * 0.45));
    let lossB = lossOfAttacker(atkA, defB, sb.count, this.rng, 1) + alphaStrike;
    // 杀敌增益：只放大对敌军的每轮杀伤；自己的伤亡仍由对方系数决定。
    lossA = Math.max(1, Math.round(lossA * this.b.killMul));
    lossB = Math.max(1, Math.round(lossB * this.a.killMul));
    // 夜袭三回合：被压制的一侧真的一点伤害都打不出，不再按“每轮至少 1 人”保底。
    if (nightFree && playerKey === 'a') lossA = 0;
    if (nightFree && playerKey === 'b') lossB = 0;

    const realA = distributeLosses(this.a.troops, lossA);
    const realB = distributeLosses(this.b.troops, Math.max(1, lossB));

    this.recordLosses('a', realA);
    this.recordLosses('b', realB);

    // 瘴气：每回合额外折损敌军当前兵力的一小块，连折数回合。
    let miasmaReal = null;
    if (shi && this.shiMark === 'miasma' && this.shiRounds > 0) {
      const before = this.sideRemain(foeKey);
      if (before > 0) {
        const n = Math.max(1, Math.round(before * shi.attritionPct));
        miasmaReal = this.directLosses(foeKey, n);
        this.shiRounds -= 1;
      }
    }
    const miasmaText = miasmaReal ? ' · 瘴气 ' + lossText({}, miasmaReal) : '';

    const entry = {
      round: this.round,
      aLossText: lossText(this.a.troops, realA) + (foeKey === 'a' ? miasmaText : ''),
      bLossText: lossText(this.b.troops, realB) + (foeKey === 'b' ? miasmaText : ''),
      remainA: this.remainA(),
      remainB: this.remainB(),
      alphaStrike,
    };
    this.log.push(entry);

    // 攻城战：一方只剩初始兵力的四分之一，就判它溃退；不再打到最后一人。
    // 普通战斗 routAt 为 0，仍按“打光一方”收场。
    if (this.routAt > 0) {
      const aLine = Math.max(1, Math.floor(this.a.initialCount * this.routAt));
      const bLine = Math.max(1, Math.floor(this.b.initialCount * this.routAt));
      const aRout = this.remainA() <= aLine;
      const bRout = this.remainB() <= bLine;
      if (aRout || bRout) {
        // 攻方先溃则撤离；守方先溃则攻城得手。双方同到线时按攻方撤退处理。
        this.retreated = aRout;
        this.finish(aRout ? 'retreat' : 'win');
        return entry;
      }
    }

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

  /** 战场中增援：把新队伍并进一侧，用于五格内后续赶到的友军/敌军 */
  reinforce(sideKey, payload) {
    const side = sideKey === 'b' ? this.b : this.a;
    if (!side || !payload || !payload.troops) return false;
    const add = {};
    let count = 0;
    Object.keys(payload.troops).forEach(function (id) {
      const n = Math.max(0, Math.round(payload.troops[id] || 0));
      if (n > 0) { add[id] = n; count += n; }
    });
    if (count <= 0) return false;
    Object.keys(add).forEach(function (id) {
      side.troops[id] = (side.troops[id] || 0) + add[id];
      side.initialTroops[id] = (side.initialTroops[id] || 0) + add[id];
    });
    side.initialCount += count;
    side.lastCount = (side.lastCount == null ? side.initialCount - count : side.lastCount) + count;
    side.contingents.push({
      key: payload.key || '',
      kind: payload.kind || '',
      id: payload.id || '',
      name: payload.name || '援军',
      faction: payload.faction || null,
      count: count,
      initialCount: count,
      snapshot: JSON.parse(JSON.stringify(add)),
      isPlayer: !!payload.isPlayer,
    });
    side.coalitionNames = (side.coalitionNames ? side.coalitionNames + '、' : '') + (payload.name || '援军');
    return true;
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

  shiNoteText() {
    const e = this.shiEffect;
    if (!e) return '';
    if (e.kind === 'burn') return '天降火球烧掉 ' + e.amount + ' 人';
    if (e.kind === 'gale') return '风行脱战，敌军 -' + e.amount + ' 人，原地停 ' + e.pinHours + ' 小时';
    if (e.kind === 'defect') return '倒戈 ' + e.amount + ' 人，敌军调转枪头';
    return '';
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
      shiEffect: this.shiEffect,
      shiNote: this.shiNoteText(),
      strategistReports: this.strategistReports || [],
      openingLog: this.openingLog || '',
      galeEscape: !!this.galeEscape,
      galePinHours: this.galePinHours,
      contingentsA: this.a.contingents || [],
      contingentsB: this.b.contingents || [],
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
      strategistReports: this.strategistReports || [],
      openingLog: this.openingLog || '',
    };
  }
}

module.exports = { Battle, TACTICS, TACTIC_LIST, moraleFactor, tierPower, tierFactor };

