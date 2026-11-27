/**
 * 边陲小镇：全国背叛后的最后一块落脚地。
 *
 * 这里不套用村庄的柴房/村市，也不走普通城池的“市场—议和”流程：
 *  - 每周只开一次义军招募，固定 1000 人，T1~T5 各 200；
 *  - 粮草按 5 金 / 单位无限买，不设货架上限；
 *  - 旧部被打散后回镇上的驿站，免费重新入队；
 *  - 叛军未起时，镇民只认熟人，玩家进门就被赶出去。
 */

const army = require('./army.js');
const { siteById } = require('./world.js');
const { TROOPS } = require('../data/troops.js');

const EDGE_ID = 'edge_town';
const GOLD_MONTH = 1000;
const FOOD_MONTH = 400;
const FOOD_PRICE = 5;
const WEEK_DAYS = 7;
const BORDER_TROOP_CAP = 1000;

/** 五个档次各 200，一周刚好 1000；刷新时整池重置，不累积。 */
const RECRUIT_TIERS = [
  { tier: 1, troop: 'militia', count: 200 },
  { tier: 2, troop: 'spear', count: 200 },
  { tier: 3, troop: 'cav', count: 200 },
  { tier: 4, troop: 'heavy', count: 200 },
  { tier: 5, troop: 'jinjun', count: 200 },
];

/** 每人一句，尽量不重样；真撞了也会按姓名补成独有的一句。 */
const COMPLAINTS = [
  '那帮叛军把我的旗烧了，连我家祠堂都没放过。',
  '我在城外看见他们押着粮车走，车上插的还是我旧部的旗。',
  '他们说清君侧，清到最后，连我这样的老骨头也要杀。',
  '我打了一辈子仗，没想到有一天要防着背后射来的箭。',
  '叛军里有个校尉，前些天还在我帐下喝酒。',
  '我的城没丢在敌人手里，丢在了自己人手里。',
  '他们把我的名字从军籍上划了，说我是“旧党”。',
  '我在驿站等了七天，就等你回来点一次头。',
  '叛军占了城，却连城门都不会修，城外全是逃难的人。',
  '我这条命是你从乱军里捡回来的，再跟你走一趟。',
  '他们把我的马牵走了，那匹马跟我打了八年仗。',
  '我不怕死，我怕死了以后，史书上写我反的是你。',
  '叛军说只要交出兵符就饶我一命；我把兵符烧了。',
  '我在镇口看见他们的探子，一天来三回。',
  '他们连边陲小镇都不放过，迟早要打到这儿来。',
  '我手下的弟兄散了，可只要旗还在，我还能再聚起来。',
  '那帮人抢完粮，还把锅砸了；这不是打仗，是绝户。',
  '我老了，本来想种地；可他们把地也分了。',
  '叛军里有人劝我降，我说我先回来问问你。',
  '我这一路装成货郎才走到镇上，鞋底都磨穿了。',
  '他们占了我的城，却没人肯守城门，夜里全是火。',
  '我在驿站里听见他们说你已经死了；我说放屁。',
  '你要是还打，我就还跟；你要是不打，我就在这儿种地。',
  '叛军把我的印绶挂在了马脖子上，我咽不下这口气。',
  '我从乱军里爬出来的时候，身上只剩一把断刀。',
  '他们说要清君侧，可君在哪？侧又在哪？',
  '我认得他们的旗，也认得他们旗底下那些逃兵。',
  '这镇上的人嘴严，心也热；我在这儿躲了几天。',
  '我的旧部还有几十个在山里，只要你一句话。',
  '我不求封侯，只求再打一仗，把旗插回去。',
];

function edgeSite(state) {
  if (!state || !state.world) return null;
  return siteById(state.world, (state.world.edgeTown && state.world.edgeTown.id) || EDGE_ID);
}

function hasArc(state) {
  return !!(state && state.arc);
}

/** 只有真正落脚小镇、进入复国阶段后，镇上的功能才开。 */
function unlocked(state) {
  if (!hasArc(state)) return false;
  const phase = state.arc.phase;
  return phase === 'reconquest' || phase === 'finale' || phase === 'sandbox' || phase === 'done';
}

function emptyPool() {
  const out = {};
  RECRUIT_TIERS.forEach(function (row) { out[row.troop] = row.count; });
  return out;
}

function totalOf(pool) {
  let n = 0;
  RECRUIT_TIERS.forEach(function (row) { n += (pool && pool[row.troop]) || 0; });
  return n;
}

function getBorder(state) {
  if (!hasArc(state)) return null;
  const arc = state.arc;
  if (!arc.border || typeof arc.border !== 'object') {
    arc.border = {
      version: 1,
      day0: arc.arrivalDay || arc.startDay || (state.clock && state.clock.day) || 1,
      week: -1,
      pool: emptyPool(),
      station: [],
      complaints: {},
    };
  }
  const b = arc.border;
  if (!b.day0) b.day0 = arc.arrivalDay || arc.startDay || (state.clock && state.clock.day) || 1;
  if (!Array.isArray(b.station)) b.station = [];
  if (!b.complaints || typeof b.complaints !== 'object') b.complaints = {};
  if (!b.pool || typeof b.pool !== 'object') b.pool = emptyPool();
  b.version = 1;
  return b;
}

/** 每七天整池刷新；不到七天不动，招掉的兵不会自己长回来。 */
function refresh(state) {
  const b = getBorder(state);
  if (!b) return null;
  const day = (state.clock && state.clock.day) || b.day0;
  const week = Math.max(0, Math.floor((day - b.day0) / WEEK_DAYS));
  if (b.week !== week) {
    b.week = week;
    b.pool = emptyPool();
  }
  b.nextRefreshDay = b.day0 + (week + 1) * WEEK_DAYS;
  b.total = totalOf(b.pool);
  return b;
}

function poolInfo(state) {
  const b = refresh(state);
  if (!b) return { pool: emptyPool(), total: 0, nextRefreshDay: 0, week: 0 };
  return {
    pool: b.pool,
    total: b.total,
    nextRefreshDay: b.nextRefreshDay,
    week: b.week,
  };
}

function troopCap(state) {
  if (!state || !state.player) return 0;
  const base = army.troopCapacity(state.player.renown);
  // 复国阶段额外给 1000 个“义军编制”，不占玩家原本的声望带兵上限。
  return unlocked(state) ? base + BORDER_TROOP_CAP : base;
}

function priceFor(state, troopId) {
  const t = TROOPS[troopId];
  if (!t) return 0;
  // 边陲不按名城物价，统一按兵种基准的六成；高阶级也买得到。
  return Math.max(4, Math.round((t.recruit || 10) * 0.6));
}

function recruit(state, troopId, count) {
  if (!unlocked(state)) return { ok: false, msg: '镇民还没让你进门。' };
  const row = RECRUIT_TIERS.filter(function (r) { return r.troop === troopId; })[0];
  if (!row || !TROOPS[troopId]) return { ok: false, msg: '这里不招这种兵。' };
  const b = refresh(state);
  const stock = b.pool[troopId] || 0;
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (stock <= 0) return { ok: false, msg: '这一档本周已经招完了，等七天再来。' };
  const price = priceFor(state, troopId);
  const p = state.player;
  const room = troopCap(state) - army.troopCount(p.troops || {});
  if (room <= 0) return { ok: false, msg: '队伍满编（边陲额外编制 ' + BORDER_TROOP_CAP + ' 人已用尽）。' };
  const finalN = Math.min(n, stock, Math.floor(p.gold / price), room);
  if (finalN <= 0) {
    return { ok: false, msg: p.gold < price ? '金钱不足，单价 ' + price + ' 金钱。' : '队伍装不下了。' };
  }
  p.gold -= price * finalN;
  p.troops[troopId] = (p.troops[troopId] || 0) + finalN;
  b.pool[troopId] = stock - finalN;
  b.total = totalOf(b.pool);
  return {
    ok: true,
    count: finalN,
    cost: price * finalN,
    msg: '招募 ' + TROOPS[troopId].name + ' × ' + finalN + '，花费 ' + price * finalN + ' 金钱',
  };
}

/** 边陲粮草：5 金一个单位，不设货架上限，也不拿普通粮车上限卡人。 */
function buyFood(state, count) {
  if (!unlocked(state)) return { ok: false, msg: '镇民还没让你进门。' };
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const cost = n * FOOD_PRICE;
  const p = state.player;
  if (p.gold < cost) {
    return { ok: false, msg: '金钱不够：' + n + ' 单位粮草要 ' + cost + ' 金钱。' };
  }
  p.gold -= cost;
  p.food += n;
  return { ok: true, count: n, cost: cost, msg: '买入 ' + n + ' 单位粮草，花费 ' + cost + ' 金钱' };
}

function monthlyGrant(state) {
  if (!state || !state.player) return { gold: 0, food: 0 };
  state.player.gold += GOLD_MONTH;
  state.player.food += FOOD_MONTH;
  return { gold: GOLD_MONTH, food: FOOD_MONTH };
}

function isLoyalLord(state, lord) {
  if (!lord) return false;
  if (lord.exPlayer || lord.hero || lord.arcLoyal) return true;
  if (state.arc && Array.isArray(state.arc.loyalLords) && state.arc.loyalLords.indexOf(lord.id) >= 0) return true;
  return false;
}

function isStationed(lord) {
  return !!(lord && lord.borderStation);
}

function complaintFor(state, lord, b) {
  if (!lord) return '';
  const box = b || getBorder(state);
  if (box && box.complaints[lord.id]) return box.complaints[lord.id];
  const used = {};
  if (box) {
    Object.keys(box.complaints).forEach(function (id) { used[box.complaints[id]] = true; });
  }
  let sum = 0;
  const s = String(lord.id || lord.name || '');
  for (let i = 0; i < s.length; i++) sum = (sum * 31 + s.charCodeAt(i)) % 100000;
  let line = '';
  for (let i = 0; i < COMPLAINTS.length; i++) {
    const cand = COMPLAINTS[(sum + i) % COMPLAINTS.length];
    if (!used[cand]) { line = cand; break; }
  }
  if (!line) line = COMPLAINTS[sum % COMPLAINTS.length] + '（' + (lord.name || '旧部') + '）';
  if (box) box.complaints[lord.id] = line;
  return line;
}

function clearLordMotion(lord, edge) {
  lord.x = edge.x;
  lord.y = edge.y;
  lord.inCity = edge.id;
  lord.home = edge.id;
  lord.resting = true;
  lord.chasing = false;
  lord.hunting = false;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleeFrom = null;
  lord.fleePath = null;
  lord.order = null;
  lord.defending = null;
  lord.wander = null;
  lord.patrolPath = null;
  lord.routePath = null;
  lord.orderPath = null;
  lord.engagedWith = null;
  lord.engagedSinceH = null;
  lord.stepFrom = null;
  lord.stepTo = null;
  lord.stepProgress = 0;
  lord.enteringSiteId = null;
  lord.cityEnterAtH = null;
}

/** 打散的旧部：立刻从大地图消失，进镇上的驿站等玩家来领。 */
function sendToStation(state, lord) {
  const b = getBorder(state);
  const edge = edgeSite(state);
  if (!b || !edge || !lord) return false;
  lord.faction = 'player';
  lord.arcLoyal = true;
  lord.exPlayer = true;
  lord.alive = true;
  lord.dead = false;
  lord.retired = false;
  lord.prisoner = null;
  lord.scattered = false;
  lord.scatterUntilH = 0;
  lord.respawnDay = 0;
  lord.scatterHidden = true;
  lord.scatterRecovering = false;
  lord.scatterCityId = edge.id;
  lord.borderStation = true;
  lord.arcNoRecruit = false;
  lord.arcNoCapture = false;
  lord.arcEnemy = false;
  lord.troops = {};
  clearLordMotion(lord, edge);
  if (b.station.indexOf(lord.id) < 0) b.station.push(lord.id);
  complaintFor(state, lord, b);
  return true;
}

function stationLords(state) {
  const b = getBorder(state);
  if (!b) return [];
  const out = [];
  b.station.slice().forEach(function (id) {
    const lord = (state.lords || []).filter(function (l) { return l.id === id; })[0];
    if (!lord || !lord.borderStation) return;
    out.push({
      lord: lord,
      name: lord.name,
      title: lord.title || '旧部',
      complaint: complaintFor(state, lord, b),
    });
  });
  return out;
}

function starterTroops(lord) {
  const base = lord.defTroops || {};
  const want = Math.max(12, Math.round(army.troopCount(base) * 0.35));
  const out = {};
  let left = want;
  Object.keys(base).forEach(function (id) {
    if (left <= 0) return;
    const n = Math.min(base[id] || 0, left);
    if (n > 0) { out[id] = n; left -= n; }
  });
  if (!Object.keys(out).length) out.militia = 12;
  return out;
}

/** 免费把驿站旧部重新收进队伍：人归你，带一份刚聚起的乡勇。 */
function recruitStationLord(state, lordId) {
  if (!unlocked(state)) return { ok: false, msg: '镇民还没让你进门。' };
  const b = getBorder(state);
  const edge = edgeSite(state);
  if (!b || !edge) return { ok: false, msg: '驿站还没开。' };
  const lord = (state.lords || []).filter(function (l) { return l.id === lordId; })[0];
  if (!lord || !lord.borderStation) return { ok: false, msg: '驿站里没有这个人。' };
  b.station = b.station.filter(function (id) { return id !== lordId; });
  lord.borderStation = false;
  lord.scatterHidden = false;
  lord.scatterRecovering = false;
  lord.scattered = false;
  lord.respawnDay = 0;
  lord.inCity = null;
  lord.resting = false;
  lord.faction = 'player';
  lord.exPlayer = true;
  lord.arcLoyal = true;
  lord.alive = true;
  lord.dead = false;
  lord.troops = starterTroops(lord);
  lord.home = edge.id;
  lord.x = edge.x;
  lord.y = edge.y;
  lord.morale = Math.max(lord.morale || 60, 70);
  clearLordMotion(lord, { id: edge.id, x: edge.x, y: edge.y });
  lord.inCity = null;
  lord.resting = false;
  lord.patrolPath = null;
  const line = complaintFor(state, lord, b);
  return {
    ok: true,
    lordId: lord.id,
    complaint: line,
    msg: lord.name + '回到队中（免费）。他说：“' + line + '”',
  };
}

module.exports = {
  EDGE_ID,
  GOLD_MONTH,
  FOOD_MONTH,
  FOOD_PRICE,
  WEEK_DAYS,
  BORDER_TROOP_CAP,
  RECRUIT_TIERS,
  unlocked,
  edgeSite,
  getBorder,
  refresh,
  poolInfo,
  troopCap,
  priceFor,
  recruit,
  buyFood,
  monthlyGrant,
  isLoyalLord,
  isStationed,
  sendToStation,
  stationLords,
  recruitStationLord,
  complaintFor,
};
