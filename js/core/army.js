/**
 * 队伍层：兵力统计、口粮、战力估算、伤亡分配
 */

const { TROOPS } = require('../data/troops.js');

function troopCount(troops) {
  let n = 0;
  Object.keys(troops || {}).forEach(function (id) {
    n += troops[id] || 0;
  });
  return n;
}

function addTroops(troops, id, n) {
  if (!troops[id]) troops[id] = 0;
  troops[id] += n;
  if (troops[id] <= 0) delete troops[id];
  return troops;
}

function removeTroops(troops, id, n) {
  if (!troops[id]) return 0;
  const removed = Math.min(n, troops[id]);
  troops[id] -= removed;
  if (troops[id] <= 0) delete troops[id];
  return removed;
}

/** 每日口粮消耗 */
function foodPerDay(troops) {
  let points = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    points += (troops[id] || 0) * t.food;
  });
  return Math.max(1, Math.round(points * 0.3));
}

/**
 * 粮草上限：人多辎重多，能带的粮也多；人少也给一份保底。
 * 9 个人 174，30 人 300，100 人 720。
 */
const FOOD_BASE_CAP = 120;
const FOOD_CAP_PER_TROOP = 6;

function foodCap(troops) {
  return FOOD_BASE_CAP + troopCount(troops) * FOOD_CAP_PER_TROOP;
}

function avgTier(troops) {
  let sum = 0;
  let n = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    sum += (troops[id] || 0) * t.tier;
    n += troops[id] || 0;
  });
  return n ? sum / n : 0;
}

/** 战力估算，用于大地图上显示强弱对比 */
function strength(troops) {
  let atk = 0;
  let def = 0;
  let hp = 0;
  let cav = 0;
  let ranged = 0;
  let spear = 0;
  let pierce = 0;
  let fire = 0;
  let lock = 0;
  let n = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    const c = troops[id] || 0;
    atk += t.atk * c;
    def += t.def * c;
    hp += t.hp * c;
    if (t.cav) cav += c;
    if (t.ranged) ranged += c;
    if (t.spear) spear += c;
    if (t.pierce) pierce += c;
    if (t.fire) fire += c;
    if (t.lock) lock += c;
    n += c;
  });
  return {
    count: n,
    atk,
    def,
    hp,
    cav,
    ranged,
    power: Math.round((atk + def * 0.8 + hp * 0.25) * 1),
    cavRatio: n ? cav / n : 0,
    rangedRatio: n ? ranged / n : 0,
    spearRatio: n ? spear / n : 0,
    pierceRatio: n ? pierce / n : 0,
    fireRatio: n ? fire / n : 0,
    lockRatio: n ? lock / n : 0,
  };
}

/**
 * 按 tier 从低到高扣减伤亡（低阶兵先倒下）
 * 返回实际伤亡明细
 */
function distributeLosses(troops, totalLoss) {
  const losses = {};
  let remain = Math.round(totalLoss);
  if (remain <= 0) return losses;

  const order = Object.keys(troops || {})
    .map(function (id) {
      return { id, tier: TROOPS[id] ? TROOPS[id].tier : 1, count: troops[id] };
    })
    .sort(function (a, b) {
      return a.tier - b.tier;
    });

  for (let i = 0; i < order.length && remain > 0; i++) {
    const item = order[i];
    const take = Math.min(item.count, remain);
    if (take <= 0) continue;
    losses[item.id] = (losses[item.id] || 0) + take;
    remain -= take;
  }

  // 若低阶兵不够扣，剩余损失平均摊到各兵种
  if (remain > 0) {
    const ids = Object.keys(troops || {});
    for (let i = 0; i < ids.length && remain > 0; i++) {
      const id = ids[i];
      if (losses[id] >= troops[id]) continue;
      losses[id] = (losses[id] || 0) + 1;
      remain -= 1;
    }
  }

  Object.keys(losses).forEach(function (id) {
    removeTroops(troops, id, losses[id]);
  });
  return losses;
}

/**
 * 部队总人数上限，靠声望提升；开局溃兵允许超编到 30。
 *
 * 每 100 声望算一档，第一档 +30 人，之后每档的增幅只剩上一档的 0.9
 * （锐减度）。前 100 声望 +30，第二个 100 只 +27，再往后 +24.3……
 * 名声越大，能多带的人越少；上限渐进到 330，不会无限膨胀。
 */
const CAPACITY_BASE = 30;
const CAPACITY_FIRST_STEP = 30;
const CAPACITY_DECAY = 0.9;

function troopCapacity(renown) {
  const r = Math.max(0, Number(renown) || 0);
  const blocks = r / 100;
  const cap = CAPACITY_BASE
    + CAPACITY_FIRST_STEP * (1 - Math.pow(CAPACITY_DECAY, blocks)) / (1 - CAPACITY_DECAY);
  return Math.max(CAPACITY_BASE, Math.floor(cap));
}

module.exports = {
  troopCount,
  addTroops,
  removeTroops,
  foodPerDay,
  foodCap,
  avgTier,
  strength,
  distributeLosses,
  troopCapacity,
};
