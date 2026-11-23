/**
 * 经济层：市场粮价、招募、装备升级、每日据点刷新
 */

const { TROOPS } = require('../data/troops.js');
const { EQUIPMENT } = require('../data/china.js');
const { troopCount, troopCapacity } = require('./army.js');

const FOOD_BASE = 5; // 基准粮价（金币 / 单位）

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
  const typeMul = site.type === 'castle' ? 1.2 : site.type === 'village' ? 0.9 : 1.0;
  return Math.round(t.recruit * typeMul * (site.priceIndex || 1));
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
  if (state.player.gold < cost) return { ok: false, msg: '金币不够，需要 ' + cost };
  if (state.player.food + n > 400) return { ok: false, msg: '粮车装不下了（上限 400）' };
  state.player.gold -= cost;
  state.player.food += n;
  return { ok: true, msg: '买入 ' + n + ' 单位粮草，花费 ' + cost + ' 金', cost };
}

function sellFood(state, site, amount) {
  if (!site.market) return { ok: false, msg: '这里没有市场' };
  const n = Math.min(state.player.food, Math.max(1, Math.floor(amount)));
  if (n <= 0) return { ok: false, msg: '没有粮可卖' };
  const gain = foodSellPrice(site) * n;
  state.player.food -= n;
  state.player.gold += gain;
  return { ok: true, msg: '卖出 ' + n + ' 单位粮草，得到 ' + gain + ' 金' };
}

function recruit(state, site, troopId, count) {
  const check = canRecruit(state, site, troopId);
  if (!check.ok) return check;
  const n = Math.max(1, Math.floor(count));
  const price = recruitPrice(site, troopId);
  const affordable = Math.min(n, site.recruits[troopId] || 0, Math.floor(state.player.gold / price));
  if (affordable <= 0) return { ok: false, msg: '金币不足，单价 ' + price + ' 金' };

  const cap = troopCapacity(state.player.renown);
  const room = cap - troopCount(state.player.troops);
  if (room <= 0) return { ok: false, msg: '队伍满编（上限 ' + cap + '），先提升声望' };
  const finalN = Math.min(affordable, room);

  state.player.gold -= price * finalN;
  state.player.troops[troopId] = (state.player.troops[troopId] || 0) + finalN;
  site.recruits[troopId] -= finalN;
  return {
    ok: true,
    msg: '招募 ' + TROOPS[troopId].name + ' × ' + finalN + '，花费 ' + price * finalN + ' 金',
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
    return { ok: false, msg: '金币不够，需要 ' + next.price };
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

/** 每日：价格波动 + 招募池刷新 + 守军恢复 */
function dailyMarket(state, rng) {
  state.world.sites.forEach(function (site) {
    const drift = 0.9 + rng.random() * 0.28;
    site.priceIndex = Math.max(0.85, Math.min(1.25, drift));
    if (site.faction === 'bandit') return;

    Object.keys(site.recruits).forEach(function (id) {
      if (site.recruits[id] < (site.recruitCap || 0)) {
        site.recruits[id] += rng.int(0, 2);
      }
    });
    // 补满招募池上限
    (site.recruitList || []).forEach(function (id) {
      if (!site.recruits[id]) site.recruits[id] = rng.int(0, 2);
      const cap = site.recruitCap || 4;
      if (site.recruits[id] > cap) site.recruits[id] = cap;
    });

    if (site.playerOwned) {
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
  dailyMarket,
  dailyIncome,
};
