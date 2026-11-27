/**
 * 经济层：市场粮价、招募、装备升级、每日据点刷新
 */

const { TROOPS } = require('../data/troops.js');
const { VILLAGE_FOOD } = require('../data/extra.js');
const { EQUIPMENT } = require('../data/china.js');
const { troopCount, troopCapacity, foodCap } = require('./army.js');

const FOOD_BASE = 5; // 基准粮价（金币 / 单位）

/**
 * 兵价按档次重排：民兵近乎白给，往上每一档都明显更贵。
 * 低阶兵是消耗品，高阶兵是资产。
 */
/**
 * 兵价按档次重排：民兵是个位数，往上每一档明显更贵。
 * 开局 200 金能拉起一支满编民兵，打输了也不至于破产。
 */
const TIER_PRICE_MUL = { 1: 0.34, 2: 0.7, 3: 0.9, 4: 1.0, 5: 1.15 };

function foodPrice(site) {
  if (!site || !site.market) return 0;
  return Math.max(2, Math.round(FOOD_BASE * site.priceBase * (site.priceIndex || 1)));
}

function foodSellPrice(site) {
  if (!site || !site.market) return 0;
  return Math.max(1, Math.round(foodPrice(site) * 0.55));
}

function recruitPrice(site, troopId) {
  const t = TROOPS[troopId];
  if (!t || !site) return 0;
  const typeMul = site.type === 'castle' ? 1.2 : site.type === 'village' ? 0.68 : 1.0;
  const tierMul = TIER_PRICE_MUL[t.tier] || 1;
  return Math.max(4, Math.round(t.recruit * tierMul * typeMul * (site.priceIndex || 1)));
}

function canRecruit(state, site, troopId) {
  const t = TROOPS[troopId];
  if (!t) return { ok: false, msg: '没有这种兵' };
  if (site.faction === 'bandit') return { ok: false, msg: '匪巢不卖人' };
  const pool = site.recruits[troopId] || 0;
  if (pool <= 0) return { ok: false, msg: '这一批已经招完了，等几天再来' };
  if (t.renownReq && state.player.renown < t.renownReq) {
    return { ok: false, msg: '声望不足' + t.renownReq + '，招不到' + t.name };
  }
  return { ok: true };
}

function buyFood(state, site, amount) {
  if (!site.market) return { ok: false, msg: '这里没有市场' };
  const n = Math.max(1, Math.floor(amount));
  const cost = foodPrice(site) * n;
  const cap = foodCap(state.player.troops);
  if (state.player.gold < cost) return { ok: false, msg: '金钱不够，需要 ' + cost };
  if (state.player.food + n > cap) {
    return { ok: false, msg: '粮车装不下了（兵力 ' + troopCount(state.player.troops) + '，上限 ' + cap + '）' };
  }
  state.player.gold -= cost;
  state.player.food += n;
  return { ok: true, msg: '买入 ' + n + ' 单位粮草，花费 ' + cost + ' 金钱', cost };
}

function sellFood(state, site, amount) {
  if (!site.market) return { ok: false, msg: '这里没有市场' };
  const n = Math.min(state.player.food, Math.max(1, Math.floor(amount)));
  if (n <= 0) return { ok: false, msg: '没有粮可卖' };
  const gain = foodSellPrice(site) * n;
  state.player.food -= n;
  state.player.gold += gain;
  return { ok: true, msg: '卖出 ' + n + ' 单位粮草，得到 ' + gain + ' 金钱' };
}

function recruit(state, site, troopId, count) {
  const check = canRecruit(state, site, troopId);
  if (!check.ok) return check;
  const n = Math.max(1, Math.floor(count));
  const price = recruitPrice(site, troopId);
  const affordable = Math.min(n, site.recruits[troopId] || 0, Math.floor(state.player.gold / price));
  if (affordable <= 0) return { ok: false, msg: '金钱不足，单价 ' + price + ' 金钱' };

  const cap = troopCapacity(state.player.renown);
  const room = cap - troopCount(state.player.troops);
  if (room <= 0) return { ok: false, msg: '队伍满编（上限 ' + cap + '），先提升声望' };
  const finalN = Math.min(affordable, room);

  state.player.gold -= price * finalN;
  state.player.troops[troopId] = (state.player.troops[troopId] || 0) + finalN;
  site.recruits[troopId] -= finalN;
  return {
    ok: true,
    msg: '招募 ' + TROOPS[troopId].name + ' × ' + finalN + '，花费 ' + price * finalN + ' 金钱',
    count: finalN,
  };
}

function equipmentTier(state, slot) {
  const equip = EQUIPMENT[slot];
  if (!equip) return null;
  const level = state.player.equip[slot] || 0;
  return equip.tiers[Math.min(level, equip.tiers.length - 1)];
}

function nextEquipment(state, slot) {
  const equip = EQUIPMENT[slot];
  if (!equip) return null;
  const level = (state.player.equip[slot] || 0) + 1;
  return equip.tiers[level] || null;
}

function upgradeEquipment(state, slot) {
  const equip = EQUIPMENT[slot];
  if (!equip) return { ok: false, msg: '没有这个装备位' };
  const next = nextEquipment(state, slot);
  if (!next) return { ok: false, msg: '已经是顶配了' };
  if (state.player.gold < next.price) {
    return { ok: false, msg: '金钱不够，需要 ' + next.price };
  }
  state.player.gold -= next.price;
  state.player.equip[slot] = (state.player.equip[slot] || 0) + 1;
  return { ok: true, msg: '换装：' + next.name };
}

function equipmentBonus(state) {
  const blade = equipmentTier(state, 'blade');
  const armor = equipmentTier(state, 'armor');
  const horse = equipmentTier(state, 'horse');
  return {
    atkPct: blade ? blade.atkPct : 0,
    defPct: armor ? armor.defPct : 0,
    speedPct: horse ? horse.speedPct : 0,
  };
}

/** 守军自然增长：人数越多，招兵越慢；不设硬上限，但到临界点后近乎停滞。
 * 只按“当前守军”算，所以战损之后会从低人数的速度重新长，不会立刻补满。
 */
function garrisonGrowthRate(site) {
  const g = Math.max(0, site.garrison || 0);
  const soft = Math.max(24, site.garrisonBase || 40);
  // 基准 40 人时约 1.7 人/天；100 人时约 1.2；400 人时约 0.5；1000 人时约 0.2。
  return 3.4 / (1 + Math.pow(g / soft, 1.18));
}

function growGarrison(site) {
  if (!site) return 0;
  const rate = garrisonGrowthRate(site);
  site.garrisonGrowth = (site.garrisonGrowth || 0) + rate;
  const inc = Math.floor(site.garrisonGrowth);
  if (inc > 0) {
    site.garrison = Math.max(0, (site.garrison || 0) + inc);
    site.garrisonGrowth -= inc;
  }
  return inc;
}

/** 领主招兵池：城镇/关隘容量与每日回填；比旧版更快，避免大战后全图停摆。 */
const LORD_RECRUIT_CAP = { town: 12, castle: 12, village: 6 };
const LORD_RECRUIT_REFILL = 3;

/** 每日：价格波动 + 招募池刷新 + 守军恢复 */
function dailyMarket(state, rng) {
  state.world.sites.forEach(function (site) {
    const drift = 0.9 + rng.random() * 0.28;
    site.priceIndex = Math.max(0.85, Math.min(1.25, drift));
    if (site.faction === 'bandit') return;

    // 村庄壮丁是有限的一池人：招空就没了，不按天自动回填；城镇/关隘才持续募兵
    if (site.type !== 'village') {
      Object.keys(site.recruits).forEach(function (id) {
        if (site.recruits[id] < (site.recruitCap || 0)) {
          site.recruits[id] += rng.int(1, 3);
        }
      });
      // 补满招募池上限：募兵木牌天天有人来
      (site.recruitList || []).forEach(function (id) {
        if (!site.recruits[id]) site.recruits[id] = rng.int(1, 3);
        const cap = site.recruitCap || 4;
        if (site.recruits[id] > cap) site.recruits[id] = cap;
      });
    }

    // 村市口粮：两天补一次，每样不超过村里能拿出来的那几份
    if (site.type === 'village' && state.clock.day % 2 === 0) {
      site.foodStock = site.foodStock || {};
      VILLAGE_FOOD.forEach(function (f) {
        const cap = f.stockMax || 3;
        if ((site.foodStock[f.id] || 0) < cap) {
          site.foodStock[f.id] = Math.min(cap, (site.foodStock[f.id] || 0) + 1);
        }
      });
    }

    // 领主招兵池：按城/村错开日子补一点，跟玩家招募池分开，也不额外消耗事件随机数
    if (site.type === 'town' || site.type === 'castle' || site.type === 'village') {
      site.lordRecruits = site.lordRecruits || {};
      const lcap = LORD_RECRUIT_CAP[site.type] || 0;
      // 领主兵源每日回填；比旧版三日一回、一次一人快得多。
      (site.recruitList || []).forEach(function (id) {
        const have = site.lordRecruits[id] || 0;
        if (have < lcap) site.lordRecruits[id] = Math.min(lcap, have + LORD_RECRUIT_REFILL);
      });
    }

    // 城池守军按当前人数自然增长：越多越慢，战损后从低处重新长。
    // 村庄的乡勇仍按旧规则补到基准，避免全村都变成兵营。
    if (site.type === 'town' || site.type === 'castle') {
      if (site.ownerFaction !== 'bandit') growGarrison(site);
    } else if (site.playerOwned) {
      site.garrison = Math.min(site.garrisonBase, site.garrison + rng.int(0, 2));
    } else if (site.ownerFaction !== 'bandit') {
      site.garrison = Math.min(site.garrisonBase, site.garrison + rng.int(1, 3));
    }
  });
}

/** 据点每日税收（玩家拥有时） */
function dailyIncome(state) {
  let income = 0;
  state.world.sites.forEach(function (site) {
    if (!site.playerOwned) return;
    // 边陲小镇只按“每月 1000 金 + 400 粮”结算，不再叠每日商税。
    if (site.specialEdge) return;
    if (site.type === 'town') income += 26;
    else if (site.type === 'castle') income += 16;
    else income += 9;
  });
  return income;
}

module.exports = {
  FOOD_BASE,
  foodPrice,
  foodSellPrice,
  recruitPrice,
  canRecruit,
  buyFood,
  sellFood,
  recruit,
  equipmentTier,
  nextEquipment,
  upgradeEquipment,
  equipmentBonus,
  garrisonGrowthRate,
  growGarrison,
  dailyMarket,
  dailyIncome,
  LORD_RECRUIT_CAP,
  LORD_RECRUIT_REFILL,
};
