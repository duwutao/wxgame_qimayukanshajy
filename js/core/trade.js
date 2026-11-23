/**
 * 贸易层：跑商商品、各城物价、估价、买卖
 * 每座城对每种货有固定的偏好（便宜的产地、贵的销地），再叠每天的行情波动。
 */

const { GOODS } = require('../data/extra.js');

const GOODS_CAP = 80; // 货物总件数上限

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function goodById(id) {
  for (let i = 0; i < GOODS.length; i++) if (GOODS[i].id === id) return GOODS[i];
  return null;
}

/** 该城对该货的固定偏好：0.62 ~ 1.5 */
function cityFactor(site, good) {
  const h = hashStr(site.id + '|' + good.id);
  return 1 + (h - 0.5) * 2 * good.spread;
}

/** 买价：基准 × 城市偏好 × 当日行情 */
function buyPrice(site, goodId) {
  const good = goodById(goodId);
  if (!good || !site || !site.market) return 0;
  const raw = good.base * cityFactor(site, good) * (site.priceIndex || 1);
  return Math.max(2, Math.round(raw));
}

/** 卖给本城：买价的 72%，跑商的利润来自异地差价 */
function sellPrice(site, goodId) {
  const buy = buyPrice(site, goodId);
  if (!buy) return 0;
  return Math.max(1, Math.round(buy * 0.72));
}

function goodsCount(p) {
  const g = p.goods || {};
  let n = 0;
  Object.keys(g).forEach(function (k) { n += g[k] || 0; });
  return n;
}

function buyGoods(state, site, goodId, amount) {
  if (!site || !site.market) return { ok: false, msg: '这里没有市场' };
  const good = goodById(goodId);
  if (!good) return { ok: false, msg: '没有这种货' };
  const n = Math.max(1, Math.floor(amount));
  const cost = buyPrice(site, goodId) * n;
  if (state.player.gold < cost) return { ok: false, msg: '金币不够，要 ' + cost };
  if (goodsCount(state.player) + n > GOODS_CAP) {
    return { ok: false, msg: '驮队装不下了（上限 ' + GOODS_CAP + ' 件）' };
  }
  state.player.gold -= cost;
  state.player.goods = state.player.goods || {};
  state.player.goods[goodId] = (state.player.goods[goodId] || 0) + n;
  return { ok: true, msg: '买入 ' + good.name + ' ×' + n + '，花费 ' + cost + ' 金', cost };
}

function sellGoods(state, site, goodId, amount) {
  if (!site || !site.market) return { ok: false, msg: '这里没有市场' };
  const have = (state.player.goods || {})[goodId] || 0;
  const n = Math.min(have, Math.max(1, Math.floor(amount)));
  if (have <= 0) return { ok: false, msg: '你没有这种货' };
  const gain = sellPrice(site, goodId) * n;
  state.player.goods[goodId] -= n;
  state.player.gold += gain;
  state.stats.goldEarned = (state.stats.goldEarned || 0) + gain;
  return { ok: true, msg: '卖出 ' + goodById(goodId).name + ' ×' + n + '，得 ' + gain + ' 金', gain };
}

/**
 * 估价：从当前城出发，这货到哪里卖得最贵。
 * 只报有市场的城，取前三；顺带给个"差价 / 路程"的粗估。
 */
function estimate(state, fromSite, goodId) {
  if (!fromSite || !fromSite.market) return { ok: false, msg: '这里的市集不做这种事' };
  const good = goodById(goodId);
  if (!good) return { ok: false, msg: '没有这种货' };
  const here = buyPrice(fromSite, goodId);
  const rows = [];
  state.world.sites.forEach(function (s) {
    if (!s.market || s.id === fromSite.id) return;
    const price = buyPrice(s, goodId);
    const dist = Math.max(Math.abs(s.x - fromSite.x), Math.abs(s.y - fromSite.y));
    const profit = price - here;
    if (profit <= 0) return;
    rows.push({ site: s, price: price, profit: profit, dist: dist, ratio: profit / Math.max(1, dist) });
  });
  if (!rows.length) {
    return { ok: true, msg: good.name + ' 在本城已经是最低价，别处更贱。', rows: [] };
  }
  rows.sort(function (a, b) { return b.profit - a.profit; });
  return { ok: true, here: here, good: good, rows: rows.slice(0, 3), msg: '估价单' };
}

/** 今日行情：所有城按日微调（已被 dailyMarket 统一调 priceIndex，这里只做商品级的轻微漂移） */
function dailyGoods(state, rng) {
  state.world.sites.forEach(function (site) {
    if (!site.market) return;
    site.goodsTick = (site.goodsTick || 0) + 1;
    if (rng.chance(0.35)) {
      site.priceIndex = Math.max(0.85, Math.min(1.3, (site.priceIndex || 1) * (0.97 + rng.random() * 0.07)));
    }
  });
}

module.exports = {
  GOODS_CAP,
  goodById,
  buyPrice,
  sellPrice,
  goodsCount,
  buyGoods,
  sellGoods,
  estimate,
  dailyGoods,
};
