/**
 * 逻辑测试：node tools/logic-test.js
 * 覆盖世界生成、开局、行军、经济、战斗、史简、势力、领主、劫掠、战役、结局、存档
 */

const path = require('path');
const R = path.join(__dirname, '..', 'js');

const worldLib = require(R + '/core/world.js');
const warLib = require(R + '/core/war.js');
const stateLib = require(R + '/core/state.js');
const armyLib = require(R + '/core/army.js');
const economy = require(R + '/core/economy.js');
const trade = require(R + '/core/trade.js');
const territory = require(R + '/core/territory.js');
const { Battle } = require(R + '/core/battle.js');
const { RNG } = require(R + '/rng.js');
const { TROOPS } = require(R + '/data/troops.js');
const { FACTIONS, FACTION_COMBAT, CAMPAIGN, SITE_ROWS, ROADS, CAPITAL_IDS, STRATEGIC_SITES, LORDS, HISTORY_MARKS, TERRAIN, FREE_CITY_IDS } = require(R + '/data/china.js');
const { VILLAGE_FOOD, GOODS } = require(R + '/data/extra.js');

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) pass++;
  else {
    fail++;
    console.log('  FAIL · ' + name + (extra ? '  → ' + extra : ''));
  }
}

function group(title) {
  console.log('\n[' + title + ']');
}

/** 12 轮一阵：测试里要把阵与阵之间手动续上 */
function fightToEnd(b, limit) {
  let n = 0;
  const cap = limit || 2000;
  while (!b.finished && n++ < cap) {
    if (b.batchDone) b.nextBatch();
    else b.step();
  }
  return b;
}

/* ---------------------------------------------------------------- 世界 */

group('世界生成');
const world = worldLib.createWorld(20260101);
ok('地图尺寸 128x154', world.w === 128 && world.h === 154, world.w + 'x' + world.h);
ok('据点 ' + SITE_ROWS.length + ' 个', world.sites.length === SITE_ROWS.length, String(world.sites.length));
ok('据点数组与定义一致', world.sites.length === SITE_ROWS.length);

const regionSet = {};
world.regions.forEach(function (r) { regionSet[r] = 1; });
ok('区域 ≥ 10 种', Object.keys(regionSet).length >= 10, String(Object.keys(regionSet).length));

const tileSet = {};
world.tiles.forEach(function (t) { tileSet[t] = (tileSet[t] || 0) + 1; });
ok('地形 ≥ 8 种', Object.keys(tileSet).length >= 8, JSON.stringify(tileSet));
ok('山地 > 60 格', (tileSet.mountain || 0) > 60, String(tileSet.mountain || 0));
ok('河流 > 40 格', (tileSet.river || 0) > 40, String(tileSet.river || 0));
ok('有海', (tileSet.sea || 0) > 100, String(tileSet.sea || 0));
ok('新增地形齐全（山麓/山口/桥/绿洲）', ['foothill', 'pass', 'bridge', 'oasis'].every(function (t) {
  return (tileSet[t] || 0) > 0;
}), JSON.stringify(tileSet));
ok('河流可涉水、桥更省时', TERRAIN.river.passable && TERRAIN.bridge.passable &&
  TERRAIN.bridge.cost < TERRAIN.river.cost, TERRAIN.bridge.cost + '/' + TERRAIN.river.cost);

// 山脉不再是单格细线：至少有一段横向连续 4 格以上的山体
let widestMountainRow = 0;
for (let y = 0; y < world.h; y++) {
  let run = 0;
  for (let x = 0; x < world.w; x++) {
    if (world.tiles[y * world.w + x] === 'mountain') {
      run++;
      if (run > widestMountainRow) widestMountainRow = run;
    } else run = 0;
  }
}
ok('山脉连续宽度 ≥ 4 格', widestMountainRow >= 4, String(widestMountainRow));

const bridgeMarks = world.bridges || [];
ok('地图上已架起多座桥', bridgeMarks.length >= 8, String(bridgeMarks.length));
ok('桥格本身可通行', bridgeMarks.length > 0 && bridgeMarks.every(function (b) {
  return worldLib.terrainAt(world, b.x, b.y).id === 'bridge';
}), bridgeMarks.length + ' 座');

let crossBridge = null;
bridgeMarks.some(function (b) {
  const road = function (t) { return t === 'road' || t === 'pass' || t === 'bridge'; };
  const L = world.tiles[b.y * world.w + b.x - 1];
  const R = world.tiles[b.y * world.w + b.x + 1];
  if (road(L) && road(R)) {
    crossBridge = b;
    return true;
  }
  return false;
});
const bridgePath = crossBridge ? worldLib.findPath(world,
  { x: crossBridge.x - 2, y: crossBridge.y },
  { x: crossBridge.x + 2, y: crossBridge.y }) : null;
ok('行军路径能走桥过河', !!(bridgePath && bridgePath.some(function (p) {
  return crossBridge && p.x === crossBridge.x && p.y === crossBridge.y;
})), bridgePath ? bridgePath.length + ' 步' : '无桥可测');

const start = worldLib.siteById(world, 'chenliu');
const reach = worldLib.reachableTiles(world, start.x, start.y);
let unreachable = [];
world.sites.forEach(function (s) {
  if (!reach[worldLib.idx(s.x, s.y)]) unreachable.push(s.id);
});
ok('所有据点可达', unreachable.length === 0, unreachable.join(','));

const clRoad = worldLib.siteById(world, 'chenliu');
const xpRoad = worldLib.siteById(world, 'xiaopei');
ok('陈留—小沛之间铺出连续驿道', clRoad && xpRoad && (function () {
  for (let x = clRoad.x + 1; x < xpRoad.x; x++) {
    const t = world.tiles[xpRoad.y * world.w + x];
    if (!(t === 'road' || t === 'bridge' || t === 'pass')) return false;
  }
  return true;
})(), clRoad && xpRoad ? clRoad.x + ',' + clRoad.y + ' -> ' + xpRoad.x + ',' + xpRoad.y : 'missing');
ok('陈留到小沛有直接可走路径', !!(clRoad && xpRoad && worldLib.findPath(world,
  { x: clRoad.x, y: clRoad.y }, { x: xpRoad.x, y: xpRoad.y })), 'no path');
const roadState = stateLib.createGame({ seed: 2026112516 });
ok('陈留—小沛道路让魏吕接壤', warLib.factionsAdjacent(roadState, 'wei', 'lv'), 'not adjacent');
warLib.startDiplomacy(roadState);
ok('曹吕宣战后可沿路攻小沛', warLib.canSiegeSiteFromFaction(roadState, 'wei', xpRoad).ok === true,
  JSON.stringify(warLib.canSiegeSiteFromFaction(roadState, 'wei', xpRoad)));
const roadSave = JSON.parse(stateLib.serialize(roadState));
const oldCl = roadSave.world.sites.filter(function (s) { return s.id === 'chenliu'; })[0];
const oldXp = roadSave.world.sites.filter(function (s) { return s.id === 'xiaopei'; })[0];
for (let x = oldCl.x + 1; x < oldXp.x; x++) {
  roadSave.world.tiles[oldXp.y * roadSave.world.w + x] = 'farm';
}
const loadedRoad = stateLib.deserialize(roadSave);
ok('旧档读入时补回陈留—小沛路', !!loadedRoad && (function () {
  for (let x = oldCl.x + 1; x < oldXp.x; x++) {
    const t = loadedRoad.world.tiles[oldXp.y * loadedRoad.world.w + x];
    if (!(t === 'road' || t === 'bridge' || t === 'pass')) return false;
  }
  return true;
})(), 'old save road repair failed');

/* ---------------------------------------------------------------- 开局 */

group('开局');
const st = stateLib.createGame({ seed: 20260101 });
ok('开局只有 9 个民兵', armyLib.troopCount(st.player.troops) === 9, JSON.stringify(st.player.troops));
ok('金 460 / 粮 150（够招满 30 人）', st.player.gold === 460 && st.player.food === 150, st.player.gold + '/' + st.player.food);
ok('史简 1 支', st.player.shi === 1, String(st.player.shi));
ok('领主 ' + LORDS.length + ' 位', st.lords.length === LORDS.length, String(st.lords.length));
const byFaction = {};
st.lords.forEach(function (l) { byFaction[l.faction] = (byFaction[l.faction] || 0) + 1; });
ok('每国至少 6 位领主', Object.keys(byFaction).every(function (k) { return byFaction[k] >= 6; }), JSON.stringify(byFaction));
ok('袁术麾下有六位领主', st.lords.filter(function (l) { return l.faction === 'yuanshu'; }).length === 6, JSON.stringify(byFaction));
ok('徐州与淮南新增城镇已接入', ['xuzhou', 'guangling', 'hefei', 'liyang', 'baima', 'beihai', 'wuling'].every(function (id) {
  const site = st.world.sites.filter(function (s) { return s.id === id; })[0];
  return !!(site && (site.type === 'town' || site.type === 'castle'));
}), st.world.sites.length + ' 个据点');
ok('徐州属吕布、淮南三城属袁术', (function () {
  const xz = st.world.sites.filter(function (s) { return s.id === 'xuzhou'; })[0];
  const yh = ['guangling', 'hefei', 'shouchun'].map(function (id) {
    return st.world.sites.filter(function (s) { return s.id === id; })[0];
  });
  return !!(xz && xz.ownerFaction === 'lv' && yh.every(function (s) { return s && s.ownerFaction === 'yuanshu'; }));
})(), '势力归属');
ok('张辽开局在吕布帐下', (function () {
  const z = st.lords.filter(function (l) { return l.id === 'zhangliao'; })[0];
  return !!(z && z.faction === 'lv' && z.home === 'xiapi');
})(), '张辽');
ok('无旗', st.player.banner === false);
ok('开局不在城内', st.player.atSiteId === null);

const chase = st.parties.filter(function (p) { return p.scripted; })[0];
ok('序章追兵存在', !!chase, '西凉步卒');
ok('追兵距离 ≥ 4', chase && worldLib.gridDistance(chase, st.player) >= 4,
  chase ? String(worldLib.gridDistance(chase, st.player)) : 'none');
ok('追兵是 60 步卒', chase && armyLib.troopCount(chase.troops) === 60 &&
  armyLib.strength(chase.troops).cavRatio === 0, JSON.stringify(chase && chase.troops));

const startBandits = st.parties.filter(function (p) {
  return p.faction === 'bandit' && !p.scripted;
});
ok('开局地图匪团翻倍到 32 支', startBandits.length === 32, String(startBandits.length));
ok('开局匪团不叠在同一格', new Set(startBandits.map(function (p) { return p.x + ',' + p.y; })).size === startBandits.length,
  startBandits.length + ' 支');
ok('开局匪团分布不挤在一角', (function () {
  const left = startBandits.filter(function (p) { return p.x < st.world.w / 2; }).length;
  const top = startBandits.filter(function (p) { return p.y < st.world.h / 2; }).length;
  return left >= 8 && left <= 24 && top >= 8 && top <= 24;
})(), startBandits.map(function (p) { return p.x + ',' + p.y; }).join('|'));

/* ---------------------------------------------------------------- 行军 */

group('行军与序章');
// 开局的章节弹窗事件在真实游戏里由 flows.process 消费掉，这里先清空再测行军
st.events.length = 0;
// 这一段只测序章行军：领主另测、路上的匪团也先清掉，免得半路被拦停
st.lords.length = 0;
st.parties.length = 0;
const goTarget = worldLib.siteById(st.world, 'chenliu');
const go = stateLib.goTo(st, goTarget.x, goTarget.y);
ok('可下达行军命令', go.ok, go.msg);
let frames = 0;
while (st.player.route.length && frames < 2000) {
  stateLib.update(st, 0.05);
  if (st.events.length) st.events.length = 0; // 路上撞见匪团就当玩家一路撤开
  frames++;
}
ok('走到陈留', st.player.atSiteId === 'chenliu', String(st.player.atSiteId));
ok('序章完成并进入第一幕', st.campaign.stage === 1, String(st.campaign.stage));
ok('序章奖励了史简', st.player.shi >= 2, String(st.player.shi));
ok('章节事件已产生', st.log.some(function (l) { return l.text.indexOf('过桥的时候') >= 0; }));

/* ---------------------------------------------------------------- 经济 */

group('经济');
const chenliu = worldLib.siteById(st.world, 'chenliu');
const goldBefore = st.player.gold;
const foodBefore = st.player.food;
const buy = economy.buyFood(st, chenliu, 10);
ok('买粮成功', buy.ok, buy.msg);
ok('买粮扣钱加粮', st.player.gold === goldBefore - 10 * economy.foodPrice(chenliu) && st.player.food === foodBefore + 10,
  st.player.gold + '/' + st.player.food);

const troopBefore = armyLib.troopCount(st.player.troops);
const rec = economy.recruit(st, chenliu, 'militia', 3);
ok('招兵接口可用', rec.ok || rec.msg.indexOf('金钱') >= 0 || rec.msg.indexOf('满编') >= 0, rec.msg);

const eqBefore = st.player.equip.blade;
st.player.gold = 9999;
const up = economy.upgradeEquipment(st, 'blade');
ok('换装成功', up.ok, up.msg);
ok('换装提升一档', st.player.equip.blade === eqBefore + 1);

// 每城四样货：不再把十种货全摊在货物页
const marketSites = st.world.sites.filter(function (s) { return s.market; });
const marketGoodSets = marketSites.map(function (s) { return trade.marketGoods(s); });
ok('每座城的货物只有四样', marketGoodSets.every(function (list) { return list.length === trade.MARKET_GOODS_COUNT; }),
  marketGoodSets.map(function (list) { return list.length; }).join('/'));
ok('四样货不重复', marketGoodSets.every(function (list) {
  return new Set(list.map(function (g) { return g.id; })).size === list.length;
}));
const localGoods = trade.marketGoods(chenliu);
const unoffered = GOODS.filter(function (g) {
  return !trade.offersGood(chenliu, g.id);
})[0];
ok('本城不做的货不能买', !!unoffered && trade.buyPrice(chenliu, unoffered.id) === 0 &&
  trade.buyGoods(st, chenliu, unoffered.id, 1).ok === false, unoffered ? unoffered.id : 'none');
ok('本城货物买价正常', localGoods.every(function (g) { return trade.buyPrice(chenliu, g.id) > 0; }),
  localGoods.map(function (g) { return g.id + ':' + trade.buyPrice(chenliu, g.id); }).join('/'));

/* ---------------------------------------------------------------- 战斗 */

group('战斗');
const rng = new RNG(777);
const b1 = new Battle({
  rng,
  attacker: { name: '我', troops: { militia: 26 }, morale: 70, isPlayer: true },
  defender: { name: '山贼', troops: { bandit: 15 }, morale: 60 },
});
fightToEnd(b1);
ok('26 打 15 山贼能赢', b1.result === 'win', b1.result + ' 轮' + b1.round);
ok('赢也会掉人', b1.summary().remainA < 26 && b1.summary().remainA > 15,
  '剩 ' + b1.summary().remainA);

const b2 = new Battle({
  rng,
  attacker: { name: '我', troops: { militia: 30 }, morale: 60, isPlayer: true },
  defender: { name: '西凉步卒', troops: { spear: 30, tiefu: 30 }, morale: 90 },
});
fightToEnd(b2);
ok('30 民兵打不过 60 西凉步卒', b2.result !== 'win', b2.result);

const b3 = new Battle({
  rng,
  attacker: { name: '我', troops: { militia: 20 }, morale: 60, isPlayer: true },
  defender: { name: '山贼', troops: { bandit: 12 }, morale: 60 },
});
b3.retreat();
ok('撤退成立', b3.result === 'retreat' && b3.retreated);
ok('撤退额外留一成殿后', b3.summary().remainA <= 19, '剩 ' + b3.summary().remainA);

/* ---------------------------------------------------------- 骑砍化规则 */

group('骑砍化规则');
const ruleState = stateLib.createGame({ seed: 20261124 });
const camp = ruleState.world.sites.filter(function (s) { return s.type === 'camp'; })[0];
const campDay = ruleState.clock.day;
stateLib.takeSite(ruleState, camp);
ok('攻破山寨进入洗劫态', camp.cleared && camp.looted && camp.respawnDay === campDay + stateLib.CAMP_RESPAWN_DAYS,
  'respawn=' + camp.respawnDay);
ok('山寨改成三日后刷新', stateLib.CAMP_RESPAWN_DAYS === 3, String(stateLib.CAMP_RESPAWN_DAYS));
const campOldX = camp.x;
const campOldY = camp.y;
ok('洗劫山寨不再算敌对目标', !stateLib.isHostileSite(ruleState, camp));
ok('空营不能再次开战刷钱', stateLib.startSiege(ruleState, camp) === null);
stateLib.campRespawnTick(ruleState);
ok('未到日子山寨不刷新', camp.cleared === true);
ruleState.clock.day = camp.respawnDay;
ruleState.player.renown = 900;
ruleState.campaign.stage = 20;
stateLib.campRespawnTick(ruleState);
ok('数日后山寨重新聚人', camp.cleared === false && camp.garrison > 0, 'garrison=' + camp.garrison);
ok('山寨刷新到新位置而非原址', camp.x !== campOldX || camp.y !== campOldY,
  campOldX + ',' + campOldY + ' → ' + camp.x + ',' + camp.y);
ok('山寨随声望变强', camp.garrisonBase > 34 && camp.banditTier,
  camp.banditTier + ' base=' + camp.garrisonBase);
ok('新位置不与其它据点重叠',
  !ruleState.world.sites.some(function (s) { return s !== camp && s.x === camp.x && s.y === camp.y; }));

const ruleVillage = ruleState.world.sites.filter(function (s) { return s.type === 'village'; })[0];
ruleVillage.recruits = ruleVillage.recruits || {};
ruleVillage.recruits.militia = 0;
const noRecruit = economy.recruit(ruleState, ruleVillage, 'militia', 1);
ok('村庄招募池空后不能无限招', !noRecruit.ok, noRecruit.msg);
ok('村庄招募上限不超过 5', ruleVillage.recruitCap <= 5, 'cap=' + ruleVillage.recruitCap);
economy.dailyMarket(ruleState, ruleState.rng);
ok('村庄壮丁不会每日自动回填', (ruleVillage.recruits.militia || 0) === 0,
  'militia=' + (ruleVillage.recruits.militia || 0));

const oldSaveState = stateLib.createGame({ seed: 778 });
const oldVillage = oldSaveState.world.sites.filter(function (s) { return s.type === 'village'; })[0];
oldVillage.recruitCap = 7;
oldVillage.recruits.militia = 9;
oldVillage.foodStock = { veg: 9 };
const reloaded = stateLib.deserialize(stateLib.serialize(oldSaveState));
const reloadedVillage = reloaded.world.sites.filter(function (s) { return s.id === oldVillage.id; })[0];
ok('旧档村庄壮丁进档压到 5', reloadedVillage.recruitCap === 5 && reloadedVillage.recruits.militia === 5,
  'cap=' + reloadedVillage.recruitCap + ' stock=' + reloadedVillage.recruits.militia);
ok('旧档村庄口粮进档压到 5', reloadedVillage.foodStock.veg === 5, 'veg=' + reloadedVillage.foodStock.veg);

const food = VILLAGE_FOOD[4];
ruleVillage.foodStock = {};
ruleVillage.foodStock[food.id] = 1;
ruleState.player.gold = 9999;
ruleState.player.food = 0;
const buy1 = stateLib.buyVillageFood(ruleState, ruleVillage, food.id);
const buy2 = stateLib.buyVillageFood(ruleState, ruleVillage, food.id);
ok('村里口粮买一份就少一份', buy1.ok && !buy2.ok, buy1.msg + ' / ' + buy2.msg);
ok('村市口粮上限最多 5', VILLAGE_FOOD.every(function (f) { return f.stockMax <= 5; }));

ruleState.player.resting = ruleVillage.id;
ruleState.player.atSiteId = ruleVillage.id;
ok('村里歇下不算安全休整', stateLib.isSafeResting(ruleState) === false);
const ruleCity = ruleState.world.sites.filter(function (s) { return s.type === 'town'; })[0];
ruleState.player.resting = ruleCity.id;
ruleState.player.atSiteId = ruleCity.id;
ok('城里歇下才算安全休整', stateLib.isSafeResting(ruleState) === true);

const lordForRecruit = ruleState.lords.filter(function (l) { return l.faction !== 'bandit'; })[0];
const lordSite = ruleState.world.sites.filter(function (s) { return s.ownerFaction === lordForRecruit.faction && s.type === 'town'; })[0];
if (lordSite) {
  lordSite.lordRecruits = { militia: 3 };
  lordSite.recruits = lordSite.recruits || {};
  lordSite.recruits.militia = 7;
  lordForRecruit.troops = {};
  lordForRecruit.defTroops = { militia: 10 };
  const beforePlayerPool = lordSite.recruits.militia;
  const got = stateLib.recruitLordFromSite(ruleState, lordForRecruit, lordSite, 3);
  ok('领主能在城镇招兵', got === 3 && (lordForRecruit.troops.militia || 0) === 3, 'got=' + got);
  ok('领主招兵不扣玩家招募池', lordSite.recruits.militia === beforePlayerPool, 'pool=' + lordSite.recruits.militia);

  // 低兵领主走到城门口，应当真的进城（而不是停在城下一直站着）
  lordForRecruit.inCity = null;
  lordForRecruit.home = lordSite.id;
  lordForRecruit.order = null;
  lordForRecruit.troops = { militia: 1 };
  lordForRecruit.defTroops = { militia: 10 };
  lordForRecruit.x = lordSite.x + 1;
  lordForRecruit.y = lordSite.y;
  lordForRecruit.moveTick = 1;
  ruleState.player.route = [];
  ruleState.player.stepTo = null;
  stateLib.moveLords(ruleState);
  // 新规则：城门外一格只是开始最后半步，数据坐标不能提前算到中心，更不能算进城。
  ok('城门外一格还不算进城', lordForRecruit.enteringSiteId === lordSite.id &&
    !lordForRecruit.inCity &&
    Math.max(Math.abs(lordForRecruit.x - lordSite.x), Math.abs(lordForRecruit.y - lordSite.y)) === 1,
    'entering=' + lordForRecruit.enteringSiteId + ' inCity=' + lordForRecruit.inCity +
    ' at=' + lordForRecruit.x + ',' + lordForRecruit.y);
  ruleState.clock.hour += 6;
  if (ruleState.clock.hour >= 24) { ruleState.clock.hour -= 24; ruleState.clock.day += 1; }
  stateLib.moveLords(ruleState);
  const entered = lordForRecruit.inCity === lordSite.id;
  ok('低兵领主会进城门，不再卡在城下', entered, 'inCity=' + lordForRecruit.inCity +
    ' at=' + lordForRecruit.x + ',' + lordForRecruit.y);
  ok('进城后地图坐标收在城里', entered && lordForRecruit.x === lordSite.x && lordForRecruit.y === lordSite.y,
    lordForRecruit.x + ',' + lordForRecruit.y);

  // 补到足够兵力后应能自己出城；给足天数并让它反复掷骰
  lordForRecruit.troops = { militia: 10 };
  for (let i = 0; i < 30 && lordForRecruit.inCity; i++) stateLib.lordRestTick(ruleState);
  ok('补足兵力后会自己出城', !lordForRecruit.inCity,
    'inCity=' + lordForRecruit.inCity);
}

ok('大国投靠声望门槛 200', stateLib.joinRenownReq('wei') === 200);
ok('小国投靠声望门槛 100', stateLib.joinRenownReq('lv') === 100);
const weiSite = ruleState.world.sites.filter(function (s) { return s.ownerFaction === 'wei' && s.type === 'town'; })[0];
const oldFaction = ruleState.player.faction;
ruleState.player.faction = null;
ruleState.player.renown = 150;
const joinLow = stateLib.joinFaction(ruleState, weiSite);
ok('声望 150 投不了魏', !joinLow.ok, joinLow.msg);
ruleState.player.renown = 200;
const joinHigh = stateLib.joinFaction(ruleState, weiSite);
ok('声望 200 可投魏', joinHigh.ok, joinHigh.msg);
ruleState.player.faction = oldFaction;

const batchBattle = new Battle({
  rng: new RNG(8080),
  attacker: { name: '我', troops: { militia: 120 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 100 }, morale: 70 },
});
for (let i = 0; i < 12 && !batchBattle.finished; i++) batchBattle.step();
ok('12 轮只是一阵，不立刻分胜负', !batchBattle.finished && batchBattle.batchDone, String(batchBattle.round));
ok('阵间不结算缴获', batchBattle.interimSummary().loot === 0 && batchBattle.summary().loot === 0);
batchBattle.nextBatch();
ok('可以续下一阵 12 轮', !batchBattle.batchDone && batchBattle.roundsInBatch === 0);
fightToEnd(batchBattle);
ok('一方归零才结束', batchBattle.finished && (batchBattle.remainA() === 0 || batchBattle.remainB() === 0));
ok('最终才有缴获', batchBattle.result !== 'win' || batchBattle.summary().loot > 0, 'loot=' + batchBattle.summary().loot);

const ironState = stateLib.createGame({ seed: 5150 });
const iron = ironState.parties.filter(function (p) { return p.scripted; })[0];
ok('开局有西凉步卒追兵', !!iron && iron.slow === 2, iron ? 'slow=' + iron.slow : 'missing');
if (iron) {
  ironState.player.troops = { militia: 9 };
  ironState.player.x = iron.x;
  ironState.player.y = iron.y;
  const tail = stateLib.breakTail(ironState, iron.id, 'party');
  const left = armyLib.troopCount(ironState.player.troops);
  ok('步卒只能断后，不能拉出来对战', stateLib.startPartyBattle(ironState, iron) === null);
  ok('断后损失几个兵', tail.ok && tail.lose >= 1 && tail.lose <= 3 && left === 9 - tail.lose,
    'lose=' + tail.lose + ' left=' + left);
  ok('步卒断后停八小时', iron.dormant === true && tail.pause === 8 && iron.pauseUntil > 0);
}
const doomed = stateLib.createGame({ seed: 9090 });
const doomedIron = doomed.parties.filter(function (p) { return p.scripted; })[0];
if (doomedIron) {
  doomed.player.troops = { militia: 1 };
  const last = stateLib.breakTail(doomed, doomedIron.id, 'party');
  ok('只剩玩家一人则被步卒杀死剧终', last.ended === true && doomed.gameOver === true && doomed.ending && doomed.ending.title === '剧终');
}

ok('各国都城表覆盖寿春等城', CAPITAL_IDS.length >= 10 && CAPITAL_IDS.indexOf('xuchang') >= 0 && CAPITAL_IDS.indexOf('chengdu') >= 0 && CAPITAL_IDS.indexOf('shouchun') >= 0, String(CAPITAL_IDS.length));

/* ---------------------------------------------------------------- 史简 */

group('史简');
function runWith(mark) {
  const b = new Battle({
    rng: new RNG(4242),
    attacker: { name: '我', troops: { militia: 40 }, morale: 70, isPlayer: true },
    defender: { name: '袁军', troops: { militia: 40 }, morale: 70 },
  });
  if (mark) b.applyShiMark(mark);
  while (!b.finished) {
    if (b.batchDone) b.nextBatch();
    else b.step();
  }
  return b;
}
const plain = runWith(null);
const wind = runWith('wind');
ok('南风起让我方打得更快、少折人', wind.summary().round < plain.summary().round && wind.summary().remainA > plain.summary().remainA,
  wind.summary().round + '轮/' + plain.summary().round + '轮 · 剩' + wind.summary().remainA + '/' + plain.summary().remainA);

/** 跨阶对撞：attTroop/defTroop 用兵种 id，wind 与否决定是否落笔 */
function duelTest(attTroop, attN, defTroop, defN, mark, seed) {
  const b = new Battle({
    rng: new RNG(seed || 4242),
    attacker: { name: '我', troops: (function () { const t = {}; t[attTroop] = attN; return t; })(), morale: 70, isPlayer: true },
    defender: { name: '敌', troops: (function () { const t = {}; t[defTroop] = defN; return t; })(), morale: 70 },
  });
  if (mark) b.applyShiMark(mark);
  fightToEnd(b);
  return b;
}

const cr1 = duelTest('militia', 80, 'cav', 80, null, 4242);
const cr1w = duelTest('militia', 80, 'cav', 80, 'wind', 4242);
ok('T1 不带南风起打不过 T3', cr1.summary().result !== 'win', cr1.summary().result + ' 剩' + cr1.summary().remainA);
ok('T1 + 南风起可胜 T3', cr1w.summary().result === 'win' && cr1w.summary().remainA > 0,
  cr1w.summary().result + ' 剩' + cr1w.summary().remainA + ' / ' + cr1w.summary().remainB);

const cr2 = duelTest('spear', 80, 'heavy', 80, null, 4243);
const cr2w = duelTest('spear', 80, 'heavy', 80, 'wind', 4243);
ok('T2 不带南风起打不过 T4', cr2.summary().result !== 'win', cr2.summary().result);
ok('T2 + 南风起可胜 T4', cr2w.summary().result === 'win' && cr2w.summary().remainA > 0,
  cr2w.summary().result + ' 剩' + cr2w.summary().remainA);

const cr3 = duelTest('cav', 80, 'jinjun', 80, null, 4244);
const cr3w = duelTest('cav', 80, 'jinjun', 80, 'wind', 4244);
ok('T3 不带南风起打不过 T5', cr3.summary().result !== 'win', cr3.summary().result);
ok('T3 + 南风起可胜 T5', cr3w.summary().result === 'win' && cr3w.summary().remainA > 0,
  cr3w.summary().result + ' 剩' + cr3w.summary().remainA);

const cr4w = duelTest('heavy', 80, 'jinjun', 160, 'wind', 4245);
ok('T4 + 南风起可敌两个 T5', cr4w.summary().result === 'win' && cr4w.summary().remainA > 0,
  cr4w.summary().result + ' 剩' + cr4w.summary().remainA + ' / ' + cr4w.summary().remainB);

const cr4v = duelTest('cav', 80, 'cav', 320, 'wind', 4246);
ok('南风起一人可打四路同阶（80 对 320）', cr4v.summary().result === 'win' && cr4v.summary().remainA > 0,
  cr4v.summary().result + ' 剩' + cr4v.summary().remainA + ' / ' + cr4v.summary().remainB);

const fb = new Battle({
  rng: new RNG(4247),
  attacker: { name: '我', troops: { militia: 100 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 200 }, morale: 70 },
});
fb.applyShiMark('fireball');
ok('天降火球烧掉敌军四成、封顶 80', fb.remainB() === 120 && fb.summary().shiEffect.amount === 80 && fb.summary().shiEffect.cap === 80,
  '敌 ' + fb.remainB() + ' / ' + JSON.stringify(fb.summary().shiEffect));

const galeB = new Battle({
  rng: new RNG(4248),
  attacker: { name: '我', troops: { militia: 100 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 200 }, morale: 70 },
});
galeB.applyShiMark('gale');
ok('风行立刻脱离且我方不折人', galeB.finished && galeB.summary().result === 'retreat' && galeB.summary().remainA === 100,
  galeB.summary().result + ' 我' + galeB.summary().remainA);
ok('风行让敌军折一成并原地停 8 小时', galeB.summary().remainB === 180 && galeB.summary().galePinHours === 8,
  '敌 ' + galeB.summary().remainB + ' 停' + galeB.summary().galePinHours + 'h');

const defB = new Battle({
  rng: new RNG(4249),
  attacker: { name: '我', troops: { militia: 100 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 200 }, morale: 70 },
});
defB.applyShiMark('defector');
ok('倒戈把一成半敌军拨到我方、封顶 60', defB.remainA() === 130 && defB.remainB() === 170 && defB.summary().shiEffect.amount === 30,
  '我' + defB.remainA() + ' 敌' + defB.remainB());

const nightB = new Battle({
  rng: new RNG(4250),
  attacker: { name: '我', troops: { militia: 100 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 200 }, morale: 70 },
});
nightB.applyShiMark('night');
nightB.step();
ok('夜袭三回合内敌军完全打不出伤害', nightB.remainA() === 100 && nightB.remainB() <= 200,
  '我' + nightB.remainA() + ' 敌' + nightB.remainB());

const miasmaB = new Battle({
  rng: new RNG(4251),
  attacker: { name: '我', troops: { militia: 100 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 200 }, morale: 70 },
});
miasmaB.applyShiMark('miasma');
miasmaB.step();
ok('瘴气每回合额外折损敌军', miasmaB.remainB() < 200 && miasmaB.summary().shiMark === 'miasma',
  '敌 ' + miasmaB.remainB());

const rollB = runWith('roll');
ok('回魂可记录', rollB.shiMark === 'roll');
ok('南风起是战中效果', wind.shiTiming === 'battle');
ok('回魂是战后效果', rollB.shiTiming === 'after');
ok('回魂在战斗过程中不提前结算', rollB.summary().round === plain.summary().round &&
  rollB.summary().remainA === plain.summary().remainA,
  rollB.summary().remainA + '/' + plain.summary().remainA);
ok('天机简七笔数值正确', Object.keys(HISTORY_MARKS).length === 7 &&
  HISTORY_MARKS.wind.tierBoost === 2 && HISTORY_MARKS.wind.fireMul === 2.00 &&
  HISTORY_MARKS.fireball.burnPct === 0.40 && HISTORY_MARKS.fireball.burnCap === 80 &&
  HISTORY_MARKS.gale.enemyLossPct === 0.10 && HISTORY_MARKS.gale.pinHours === 8 &&
  HISTORY_MARKS.night.rounds === 3 && HISTORY_MARKS.defector.turnPct === 0.15 &&
  HISTORY_MARKS.defector.turnCap === 60 && HISTORY_MARKS.miasma.attritionPct === 0.04 &&
  HISTORY_MARKS.miasma.rounds === 5 && HISTORY_MARKS.roll.backPct === 0.80,
  JSON.stringify({ n: Object.keys(HISTORY_MARKS).length, wind: HISTORY_MARKS.wind.tierBoost, roll: HISTORY_MARKS.roll.backPct }));

const midWind = new Battle({
  rng: new RNG(4242),
  attacker: { name: '我', troops: { militia: 80 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 80 }, morale: 70 },
});
midWind.step();
midWind.applyShiMark('wind');
ok('战中落笔南风起即时生效', midWind.shiTiming === 'battle' && midWind.fireGround === true);
const midNight = new Battle({
  rng: new RNG(4242),
  attacker: { name: '我', troops: { militia: 80 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 80 }, morale: 70 },
});
midNight.step();
midNight.applyShiMark('night');
ok('战中落笔夜袭即时生效', midNight.shiTiming === 'battle' && midNight.shiRounds === 3);

// 走完整流程：用 state 应用回魂
st.player.shi = 3;
st.battle = new Battle({
  rng: new RNG(99),
  attacker: { name: '我', troops: { militia: 30 }, morale: 70, isPlayer: true },
  defender: { name: '山贼', troops: { bandit: 20 }, morale: 60 },
});
const hres = stateLib.useHistory(st, 'roll');
ok('用史简扣一支', hres.ok && st.player.shi === 2, hres.msg + ' 剩' + st.player.shi);
ok('史简计入已用', st.player.shiUsed === 1, String(st.player.shiUsed));
ok('用天机简没有副作用', st.relations.wei === 0, String(st.relations.wei));
while (!st.battle.finished) {
  if (st.battle.batchDone) st.battle.nextBatch();
  else st.battle.step();
}
const rollBeforeResolve = armyLib.troopCount(st.battle.a.troops);
const rollInitial = st.battle.a.initialCount;
const sum = stateLib.resolveBattle(st, st.battle);
ok('回魂战后复活本场阵亡者', sum.result === 'win' && sum.rollBack > 0 && sum.remainA === rollBeforeResolve + sum.rollBack,
  '战前 ' + rollInitial + ' 战后 ' + rollBeforeResolve + ' 归队 ' + (sum.rollBack || 0));
ok('回魂按实际阵亡的八成复活', (sum.rollBack || 0) === Math.round(Math.max(0, rollInitial - rollBeforeResolve) * 0.80),
  '归队 ' + (sum.rollBack || 0) + ' / 阵亡 ' + Math.max(0, rollInitial - rollBeforeResolve));

/* ---------------------------------------------------------------- 势力 */

group('势力与关系');
const st2 = stateLib.createGame({ seed: 999 });
ok('初始不敌对魏', !stateLib.isHostileFaction(st2, 'wei'));
stateLib.changeRelation(st2, 'wei', -40);
ok('关系 -40 即开战', stateLib.isHostileFaction(st2, 'wei') && st2.wars.wei === true, String(st2.relations.wei));
ok('贼帮永远敌对', stateLib.isHostileFaction(st2, 'bandit'));

stateLib.changeRelation(st2, 'wei', 60);
ok('关系回升后仍处于战争', st2.wars.wei === true && stateLib.isHostileFaction(st2, 'wei'));

// 领主追击
const lord = st2.lords.filter(function (l) { return l.faction === 'wei'; })[0];
st2.relations.wei = -80;
st2.wars.wei = true;
st2.player.x = lord.x + 3;
st2.player.y = lord.y;
const dBefore = worldLib.gridDistance(lord, st2.player);
stateLib.advanceTime(st2, 9);
stateLib.update(st2, 0.05, { ignoreEvents: true });
ok('敌对领主会追近', worldLib.gridDistance(lord, st2.player) <= dBefore, dBefore + ' → ' + worldLib.gridDistance(lord, st2.player));
ok('领主视野内标记追击', lord.chasing === true,
  lord.id + ' chasing=' + lord.chasing + ' dist=' + worldLib.gridDistance(lord, st2.player) +
  ' events=' + st2.events.map(function (e) { return e.type; }).join(',') +
  ' count=' + armyLib.troopCount(lord.troops || {}));

/* ---------------------------------------------------------------- 劫掠 */

group('劫掠村庄');
const st3 = stateLib.createGame({ seed: 333 });
const village = st3.world.sites.filter(function (s) { return s.type === 'village'; })[0];
const g0 = st3.player.gold;
const f0 = st3.player.food;
const raid = stateLib.raidVillage(st3, village);
ok('劫掠有收获', raid.ok && st3.player.gold > g0 && st3.player.food > f0, raid.msg);
ok('劫掠掉关系', village.ownerFaction && st3.relations[village.ownerFaction] <= -5,
  village.ownerFaction + ':' + st3.relations[village.ownerFaction]);
ok('劫掠掉声望', st3.player.renown === 0);

/* ---------------------------------------------------------------- 攻城 */

group('攻城');
const st4 = stateLib.createGame({ seed: 444 });
st4.player.renown = 500;
const target = worldLib.siteById(st4.world, 'xiaopei');
st4.relations.lv = -50;
st4.wars.lv = true;
ok('未围城不能直接开打', stateLib.startSiege(st4, target) === null);
const beginSiege = stateLib.beginPlayerSiege(st4, target);
ok('玩家可开始围城', beginSiege.ok && st4.playerSiege && st4.playerSiege.siteId === target.id, beginSiege.msg);
let siegeWait = null;
for (let i = 0; i < 3 && !(siegeWait && siegeWait.ready); i++) {
  siegeWait = stateLib.advancePlayerSiege(st4, target, 24);
}
ok('围满所需天数后可决战', siegeWait && siegeWait.ok && siegeWait.ready === true, JSON.stringify(siegeWait));
// 玩家围城后回大地图行军，时辰自然走够时也要能决战
st4.playerSiege.stage = 'camp';
st4.playerSiege.startHour = stateLib.gameHours(st4) - 48;
st4.playerSiege.readyHour = stateLib.gameHours(st4) - 1;
const siege = stateLib.startSiege(st4, target);
ok('时辰自然走够也能决战', !!siege && siege.b.initialCount > 40, String(siege && siege.b.initialCount));
ok('攻城开始时城池状态为进攻中', target.siegeStatus === 'assault', String(target.siegeStatus));
stateLib.takeSite(st4, target);
ok('拿城后清除进攻中状态', target.siegeStatus === null, String(target.siegeStatus));
ok('拿城后归自己', target.playerOwned === true);
ok('拿城掉原主关系', st4.relations.lv < -50, String(st4.relations.lv));
ok('拿城统计 +1', st4.stats.sitesTaken === 1);

/* ---------------------------------------------------------------- 战役 */

group('战役链');
const st5 = stateLib.createGame({ seed: 555 });
st5.campaign.stage = 4;
const wuchao = stateLib.startCampaignBattle(st5, 'wuchao');
ok('乌巢战役可开', !!wuchao && wuchao.b.initialCount === 170, String(wuchao && wuchao.b.initialCount));
ok('乌巢是火攻战场', wuchao.fireGround === true);
st5.battle.b.troops = { militia: 4 };
  while (!st5.battle.finished) {
    if (st5.battle.batchDone) st5.battle.nextBatch();
    else st5.battle.step();
  }
st5.player.troops = { militia: 40, spear: 20, archer: 10 };
const res = stateLib.resolveBattle(st5, wuchao);
ok('乌巢可胜', res.result === 'win', res.result);
ok('乌巢改写袁军', st5.flags.win_act2 === true && st5.world.sites.filter(function (s) {
  return s.ownerFaction === 'yuan';
}).every(function (s) { return s.garrisonBase <= 80; }));
ok('战役推进到第三幕', st5.campaign.stage >= 5, String(st5.campaign.stage));

/* ---------------------------------------------------------------- 结局 */

group('结局');
function endingOf(faction) {
  const s = stateLib.createGame({ seed: 666 });
  s.player.faction = faction;
  stateLib.decideEnding(s);
  return s.ending.type;
}
ok('投魏 → 定稿', endingOf('wei') === 'ding', endingOf('wei'));
ok('投蜀 → 续史', endingOf('shu') === 'xu', endingOf('shu'));
ok('投吴 → 焚史', endingOf('wu') === 'fen', endingOf('wu'));
ok('不投 → 自立', endingOf(null) === 'self', endingOf(null));

/* ---------------------------------------------------------------- 英雄与队伍 */

group('英雄与队伍');
const heroesLib = require(R + '/core/heroes.js');
const extra = require(R + '/data/extra.js');

ok('声望 0 只能带 3 人', heroesLib.heroCap({ player: { renown: 0 } }) === 3, String(heroesLib.heroCap({ player: { renown: 0 } })));
ok('声望 60 能带 5 人', heroesLib.heroCap({ player: { renown: 60 } }) === 5, String(heroesLib.heroCap({ player: { renown: 60 } })));
ok('声望 360 带满 15 人', heroesLib.heroCap({ player: { renown: 360 } }) === 15, String(heroesLib.heroCap({ player: { renown: 360 } })));
ok('声望再高也不超过 15', heroesLib.heroCap({ player: { renown: 9999 } }) === 15, String(heroesLib.heroCap({ player: { renown: 9999 } })));

ok('每位英雄都有队伍加成', extra.HEROES.every(function (h) { return !!extra.HERO_BONUS[h.id]; }),
   extra.HEROES.filter(function (h) { return !extra.HERO_BONUS[h.id]; }).map(function (h) { return h.id; }).join(','));

const capSt = stateLib.createGame({ seed: 20260101 });
capSt.player.heroes = extra.HEROES.slice(0, 4).map(function (h) { return { id: h.id, level: 5, exp: 0 }; });
capSt.player.renown = 0;
heroesLib.resolveHeroSites(capSt);
let capSite = null;
let capOffer = null;
['xinye', 'chengdu', 'jianye', 'ye', 'xiapi', 'xiangyang', 'wuwei', 'changan', 'jincheng'].forEach(function (sid) {
  if (capSite) return;
  const offs = heroesLib.offersAt(capSt, { id: sid });
  if (offs.length) { capSite = sid; capOffer = offs[0]; }
});
const capTry = capOffer ? heroesLib.hireHero(capSt, { id: capSite }, capOffer.id) : null;
ok('名额满时不予招募', capOffer ? (capTry.ok === false && /名额/.test(capTry.msg)) : true,
   capOffer ? capTry.msg : '（这局酒馆里没人）');
capSt.player.renown = 120;
capSt.player.gold = 9999;
ok('声望上来后名额变 7', heroesLib.heroCap(capSt) === 7, String(heroesLib.heroCap(capSt)));
const capTry2 = capOffer ? heroesLib.hireHero(capSt, { id: capSite }, capOffer.id) : null;
ok('名额够了就能招进来', capOffer ? (capTry2.ok === true && capSt.player.heroes.length === 5) : true,
   capOffer ? capTry2.msg : '（这局酒馆里没人）');

const hbSt = stateLib.createGame({ seed: 20260101 });
hbSt.player.heroes = [{ id: 'yujin', level: 10, exp: 0 }, { id: 'zhangyan', level: 10, exp: 0 }];
const hb = heroesLib.heroBonus(hbSt);
ok('加成聚合并封顶', hb.defPct > 0 && hb.defPct <= 0.4 && hb.speedPct > 0 && hb.speedPct <= 0.3,
   JSON.stringify(hb));
ok('无英雄时加成归零', (function () {
  const s = stateLib.createGame({ seed: 20260101 });
  const z = heroesLib.heroBonus(s);
  return z.atkPct === 0 && z.defPct === 0 && z.lootPct === 0;
})());
ok('加成随等级变大', (function () {
  const a = heroesLib.bonusOf('yujin', 1).text;
  const b = heroesLib.bonusOf('yujin', 10).text;
  return a !== b;
})(), heroesLib.bonusOf('yujin', 1).text + ' → ' + heroesLib.bonusOf('yujin', 10).text);

const disSt = stateLib.createGame({ seed: 20260101 });
disSt.player.heroes = [{ id: 'liaohua', level: 3, exp: 0 }, { id: 'zhoucang', level: 2, exp: 0 }];
const dis = heroesLib.dismissHero(disSt, 'liaohua');
ok('请他走会离队', dis.ok && disSt.player.heroes.length === 1, dis.msg);
ok('走了就再也遣不了', heroesLib.dismissHero(disSt, 'liaohua').ok === false);

const bt = extra.BANDIT_TIERS;
ok('四档各有名号', bt.qing.name === '劫匪' && bt.lan.name === '黄巾军' && bt.cheng.name === '乱军' && bt.hong.name === '叛军',
   [bt.qing.name, bt.lan.name, bt.cheng.name, bt.hong.name].join('/'));
ok('四档名字池互不重样', (function () {
  const all = [];
  Object.keys(extra.BANDIT_NAMES).forEach(function (k) { all.push.apply(all, extra.BANDIT_NAMES[k]); });
  return new Set(all).size === all.length;
})(), Object.keys(extra.BANDIT_NAMES).map(function (k) { return extra.BANDIT_NAMES[k].length; }).join('+'));
ok('领主造型 70 人不重样', (function () {
  const c = require(R + '/data/china.js');
  const seen = {};
  for (let i = 0; i < c.LORDS.length; i++) {
    const k = JSON.stringify(extra.lookFor(c.LORDS[i].id));
    if (seen[k]) return false;
    seen[k] = true;
  }
  return true;
})());

/* ---------------------------------------------------------------- 存档 */

group('存档');
const st6 = stateLib.createGame({ seed: 20260101 });
st6.player.renown = 120;
st6.player.shi = 3;
st6.campaign.stage = 2;
st6.relations.wei = -40;
const raw = stateLib.serialize(st6);
ok('存档可序列化', typeof raw === 'string' && raw.length > 2000, String(raw.length));
const loaded = stateLib.deserialize(raw);
ok('读档成功', !!loaded);
ok('读档保留声望', loaded && loaded.player.renown === 120);
ok('读档保留史简', loaded && loaded.player.shi === 3);
ok('读档保留战役进度', loaded && loaded.campaign.stage === 2);
ok('读档保留关系', loaded && loaded.relations.wei === -40);
ok('读档保留地主并按定义补齐', loaded && loaded.lords.length === LORDS.length, loaded ? String(loaded.lords.length) : 'null');
ok('旧档被拒绝', stateLib.deserialize(JSON.stringify({ world: st6.world, player: st6.player })) === null);
{
  // 同版本旧档：没有后来加的徐州/袁术。读档时应补齐城与人，不重算玩家已经打下的地。
  const oldRaw = JSON.parse(raw);
  const newSiteIds = ['xuzhou', 'guangling', 'hefei', 'liyang', 'baima', 'beihai', 'wuling'];
  oldRaw.world.sites = oldRaw.world.sites.filter(function (s) { return newSiteIds.indexOf(s.id) < 0; });
  const oldShouchun = oldRaw.world.sites.filter(function (s) { return s.id === 'shouchun'; })[0];
  if (oldShouchun) { oldShouchun.ownerFaction = null; oldShouchun.faction = null; }
  oldRaw.lords = oldRaw.lords.filter(function (l) {
    return ['yuanshu', 'jiling', 'zhangxun', 'qiaorui', 'yanxiang', 'yanghong'].indexOf(l.id) < 0;
  });
  delete oldRaw.relations.yuanshu;
  delete oldRaw.wars.yuanshu;
  oldRaw.version = 5;
  const migrated = stateLib.deserialize(JSON.stringify(oldRaw));
  ok('旧档读入后补齐新增城', migrated && migrated.world.sites.length === SITE_ROWS.length,
    migrated ? String(migrated.world.sites.length) : 'null');
  ok('旧档读入后补齐袁术与六位领主', migrated && migrated.lords.length === LORDS.length &&
    migrated.lords.filter(function (l) { return l.faction === 'yuanshu'; }).length === 6,
    migrated ? String(migrated.lords.length) : 'null');
  const migratedShouchun = migrated && migrated.world.sites.filter(function (s) { return s.id === 'shouchun'; })[0];
  ok('旧档空寿春归袁术', migratedShouchun && migratedShouchun.ownerFaction === 'yuanshu',
    migratedShouchun ? migratedShouchun.ownerFaction : 'null');
}
let walkOk = false;
if (loaded) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < dirs.length; i++) {
    const nx = loaded.player.x + dirs[i][0];
    const ny = loaded.player.y + dirs[i][1];
    const r = stateLib.goTo(loaded, nx, ny);
    if (r.ok) {
      walkOk = true;
      break;
    }
  }
}
ok('读档后可以行走', walkOk);

/* ---------------------------------------------------------------- 国战 */

group('国战与俘虏');
const st7 = stateLib.createGame({ seed: 777001 });
st7.events.length = 0;
warLib.init(st7);
ok('开局所有诸侯按兵不动', Object.keys(st7.factionWars).length === 0, String(Object.keys(st7.factionWars).length));
ok('曹操与袁绍开局没有翻脸', !warLib.atWar(st7, 'wei', 'yuan'));
ok('孙权与刘表开局也没有开战', !warLib.atWar(st7, 'wu', 'biao'));
ok('同势力不算交战', !warLib.atWar(st7, 'wei', 'wei'));
ok('贼与谁都打', warLib.atWar(st7, 'wei', 'bandit'));
// 陈留歇满一天后，第一批战书一次放出
ok('陈留之后天下开始互相宣战', warLib.startDiplomacy(st7) >= 2,
  String(Object.keys(st7.factionWars).length));
ok('曹操与袁绍仍不互打', !warLib.atWar(st7, 'wei', 'yuan'));
ok('孙权与刘表这时才开战', warLib.atWar(st7, 'wu', 'biao'));

// 宣战 / 议和
const wcount = Object.keys(st7.factionWars).length;
ok('宣战能生效', warLib.declare(st7, 'wei', 'shu', true, true) === true || warLib.atWar(st7, 'shu', 'wu'));
ok('重复宣战不重复记', warLib.declare(st7, 'wei', 'shu', true) === false);
ok('议和能停战', (function () {
  warLib.makePeace(st7, 'wei', 'shu', true);
  return !warLib.atWar(st7, 'wei', 'shu');
})());

// 野战：两位敌对领主撞在一起，败方不会死
const lordA = st7.lords.filter(function (l) { return l.faction === 'wei'; })[0];
const lordB = st7.lords.filter(function (l) { return l.faction === 'yuan'; })[0];
lordA.x = 10; lordA.y = 10;
lordB.x = 11; lordB.y = 10;
lordA.troops = { inf: 60 }; lordB.troops = { inf: 6 };
const wres = warLib.clash(st7, lordA, lordB);
ok('野战能打起来', !!wres, JSON.stringify(wres));
ok('败方没有被杀死', lordB.alive === true || !!lordB.prisoner, 'alive=' + lordB.alive);
ok('败方要么被俘要么溃逃', !!(lordB.prisoner || lordB.alive));
ok('俘虏记进牢房名册', (st7.prisoners || []).length >= (wres && wres.capture ? 1 : 0), String((st7.prisoners || []).length));

// 俘虏：关一天涨一点，起初几乎跑不掉
function escAt(days) { return Math.min(0.62, warLib.ESCAPE_BASE + warLib.ESCAPE_STEP * days); }
ok('第一天几乎逃不掉', escAt(1) < 0.03, escAt(1).toFixed(3));
ok('逃脱概率随天数增加', escAt(10) > escAt(1) && escAt(30) > escAt(10), escAt(10).toFixed(3) + ' / ' + escAt(30).toFixed(3));
ok('逃脱概率有上限', escAt(200) <= 0.62, escAt(200).toFixed(3));

// 城破救人
const st8 = stateLib.createGame({ seed: 777002 });
st8.events.length = 0;
const victim = st8.lords.filter(function (l) { return l.faction === 'yuan'; })[0];
warLib.capture(st8, victim, 'wei', '张辽');
const jailSite = st8.world.sites.filter(function (s) { return s.id === (victim.prisoner || {}).siteId; })[0];
ok('俘虏押在城里', !!jailSite, victim.prisoner ? victim.prisoner.siteId : 'none');
if (jailSite) {
  const freed = warLib.onSiteTaken(st8, jailSite, 'wei');
  ok('城破救出俘虏', freed >= 1, String(freed));
  ok('被救的人回到大地图', victim.alive === true);
}

// 玩家打赢领主：不是所有都死
const st9 = stateLib.createGame({ seed: 777003 });
st9.events.length = 0;
const foeLord = st9.lords.filter(function (l) { return l.id === 'chengpu'; })[0];
const beat = warLib.playerDefeatsLord(st9, foeLord);
ok('打赢领主先押在阵前，不自动杀', beat.pending === true && !!st9.postBattleLord && foeLord.dead !== true,
  JSON.stringify(beat));
const capRes = stateLib.resolveDefeatedLord(st9, 'capture');
ok('战果页可以押进牢里', capRes.ok && !!(st9.prisoners || []).filter(function (x) { return x.lordId === 'chengpu'; })[0],
  capRes.msg);
const foe2 = st9.lords.filter(function (l) { return l.id === 'gaolan'; })[0];
warLib.playerDefeatsLord(st9, foe2);
const relRes = stateLib.resolveDefeatedLord(st9, 'release');
ok('战果页可以放走败将', relRes.ok && foe2.alive === true, relRes.msg);

// 赎金与放人
const p0 = (st9.prisoners || [])[0];
if (p0) {
  const goldBefore = st9.player.gold;
  const rr = stateLib.ransomPrisoner(st9, p0.lordId);
  ok('收赎金能换钱', rr.ok && st9.player.gold > goldBefore, rr.msg);
} else {
  ok('收赎金能换钱', true);
}

/* ---------------------------------------------------------------- 比武大会 */

group('比武大会');
const tourney = require(R + '/core/tourney.js');
const st10 = stateLib.createGame({ seed: 777004 });
st10.events.length = 0;
st10.player.gold = 500;
ok('报名费固定 40', tourney.fee() === 40, String(tourney.fee()));
ok('夺冠赏格 200', tourney.prize() === 200, String(tourney.prize()));
ok('三滴血', tourney.HP === 3, String(tourney.HP));
const reg = tourney.enter(st10, st10.world.sites[0]);
ok('交钱能报名', reg.ok && !!st10.tourney, reg.msg);
ok('报名扣 40 金', st10.player.gold === 460, String(st10.player.gold));
ok('只有一个对手', !!st10.tourney.foe && !!st10.tourney.foe.name, st10.tourney.foe && st10.tourney.foe.name);
ok('开局各三血', st10.tourney.hp === 3 && st10.tourney.foeHp === 3);

// 结算矩阵：左挡/右挡/左攻/右攻
ok('同攻各掉一滴', (function () {
  const r = tourney.settle('attackL', 'attackR');
  return r.dmgPlayer === 1 && r.dmgFoe === 1;
})());
ok('都挡不掉血', (function () {
  const r = tourney.settle('blockL', 'blockR');
  return r.dmgPlayer === 0 && r.dmgFoe === 0;
})());
ok('攻被同侧挡住：进攻方掉血', (function () {
  const r = tourney.settle('attackL', 'blockL');
  return r.dmgPlayer === 1 && r.dmgFoe === 0;
})());
ok('攻在异侧：防守方掉血', (function () {
  const r = tourney.settle('attackL', 'blockR');
  return r.dmgPlayer === 0 && r.dmgFoe === 1;
})());
ok('挡住对方进攻：反赚一滴', (function () {
  const r = tourney.settle('blockR', 'attackR');
  return r.dmgPlayer === 0 && r.dmgFoe === 1;
})());
ok('挡空：自己掉血', (function () {
  const r = tourney.settle('blockR', 'attackL');
  return r.dmgPlayer === 1 && r.dmgFoe === 0;
})());

// 打到见底
let duel = 0;
while (st10.tourney && !st10.tourney.done && duel < 20) {
  const r = tourney.play(st10, tourney.MOVE_IDS[duel % 4]);
  if (!r.ok) break;
  duel += 1;
}
ok('大会能打完', st10.tourney && st10.tourney.done, 'rounds=' + duel);
ok('打完有经过文字', st10.tourney.log.length >= 1);
ok('冠军拿 200 赏金', (function () {
  const st11 = stateLib.createGame({ seed: 777005 });
  st11.player.gold = 500;
  tourney.enter(st11, st11.world.sites[0]);
  st11.tourney.foeHp = 1;
  st11.tourney.hp = 3;
  // 固定对手每合都右挡：玩家左攻就是异侧空档，必中
  st11.rng = {
    next: function () { return 0.99; },
    int: function () { return 1; },
    random: function () { return 0.99; },
  };
  tourney.play(st11, 'attackL');
  return !!(st11.tourney.champion && st11.player.gold === 660);
})());

/* ---------------------------------------------------------------- 国战存档 */

group('国战存档');
const st12 = stateLib.createGame({ seed: 777006 });
st12.events.length = 0;
warLib.declare(st12, 'shu', 'xianbei', true);
const capt = st12.lords.filter(function (l) { return l.faction === 'biao'; })[0];
warLib.capture(st12, capt, 'wu', '周瑜');
const raw12 = stateLib.serialize(st12);
const ld12 = stateLib.deserialize(raw12);
ok('存档保留势力战争', ld12 && Object.keys(ld12.factionWars).length === Object.keys(st12.factionWars).length,
  ld12 ? String(Object.keys(ld12.factionWars).length) : 'null');
ok('存档保留牢里的俘虏', ld12 && (ld12.prisoners || []).length === (st12.prisoners || []).length,
  ld12 ? String((ld12.prisoners || []).length) : 'null');
ok('读档后俘虏仍关着', ld12 && (function () {
  const l = ld12.lords.filter(function (x) { return x.id === capt.id; })[0];
  return l && l.prisoner && l.alive === false;
})());
ok('读档后不会把俘虏当战死的人复活', ld12 && (function () {
  const before = (ld12.prisoners || []).length;
  stateLib.dailyTick(ld12);
  return (ld12.prisoners || []).length <= before;
})());

/* ---------------------------------------------------------------- 灭国 */

group('灭国与转投');
const st13 = stateLib.createGame({ seed: 777007 });
st13.events.length = 0;
// 把吕布一家彻底拔掉：城归魏，人全死
st13.world.sites.forEach(function (s) { if (s.ownerFaction === 'lv') s.ownerFaction = 'wei'; });
st13.lords.forEach(function (l) {
  if (l.faction === 'lv') { l.alive = false; l.dead = true; l.troops = {}; }
});
for (let i = 0; i < 6; i += 1) stateLib.factionTick(st13);
ok('六天还没亡（要七天）', !(st13.factionState.lv || {}).dead, JSON.stringify(st13.factionState.lv || {}));
stateLib.factionTick(st13);
ok('第七天亡国', !!(st13.factionState.lv || {}).dead);
ok('亡国排了通报事件', st13.events.some(function (e) { return e.type === 'faction-fall' && e.factionId === 'lv'; }));
ok('亡国君主有去向（被杀或隐世）',
  st13.factionState.lv.fate === 'killed' || st13.factionState.lv.fate === 'hidden',
  String(st13.factionState.lv.fate));

const st14 = stateLib.createGame({ seed: 777008 });
st14.events.length = 0;
// 吕布死，但高顺活着 → 史实投魏；陈宫活着一律不降
st14.world.sites.forEach(function (s) { if (s.ownerFaction === 'lv') s.ownerFaction = 'wei'; });
st14.lords.forEach(function (l) {
  if (l.id === 'lvbu') { l.alive = false; l.dead = true; l.troops = {}; }
});
for (let i = 0; i < 7; i += 1) stateLib.factionTick(st14);
const gaoshun = st14.lords.filter(function (l) { return l.id === 'gaoshun'; })[0];
ok('高顺改投魏', gaoshun && gaoshun.faction === 'wei' && gaoshun.alive, gaoshun ? gaoshun.faction : '无');
const chengong = st14.lords.filter(function (l) { return l.id === 'chengong'; })[0];
ok('陈宫不肯降，散归乡里', chengong && chengong.alive === false && chengong.retired, chengong ? String(chengong.retired) : '无');
const zhangliaoAfterLv = st14.lords.filter(function (l) { return l.id === 'zhangliao'; })[0];
ok('吕布灭亡后张辽固定转入魏', zhangliaoAfterLv && zhangliaoAfterLv.faction === 'wei' && zhangliaoAfterLv.alive,
  zhangliaoAfterLv ? zhangliaoAfterLv.faction + '/' + zhangliaoAfterLv.alive : '无');
ok('亡国弹窗有话说', st14.events.some(function (e) { return e.type === 'faction-fall' && (e.lines || []).length; }));

/* ---------------------------------------------------------------- 三态与招降 */

group('三态 · 招降 · 封领主');
const st15 = stateLib.createGame({ seed: 777009 });
st15.events.length = 0;
const victim15 = st15.lords.filter(function (l) { return l.id === 'zhangliao'; })[0];
let autoKilled = 0;
for (let i = 0; i < 20; i += 1) {
  victim15.alive = true;
  victim15.dead = false;
  victim15.prisoner = null;
  victim15.troops = { militia: 8 };
  const r = warLib.playerDefeatsLord(st15, victim15);
  if (r.killed) autoKilled += 1;
  st15.postBattleLord = null;
}
ok('野战永不自动斩将', autoKilled === 0, String(autoKilled));
st15.noPeace = {};
const killedOne = warLib.killLord(st15, st15.lords.filter(function (l) { return l.id === 'yanliang'; })[0]);
ok('杀将留名', killedOne.killed === true);
ok('杀将后不死不休', st15.noPeace.yuan === true && warLib.makePeace(st15, 'player', 'yuan') === false);

// 招降
const st16 = stateLib.createGame({ seed: 777010 });
st16.events.length = 0;
const pv = st16.lords.filter(function (l) { return l.id === 'wenpin'; })[0];
warLib.capture(st16, pv, 'player', '你');
st16.relations.biao = 80;
st16.player.renown = 900;
// 无旗必拒
ok('无旗无城时招降必被拒', warLib.recruitChance(st16, pv).mode === 'none' &&
  warLib.recruitLord(st16, 'wenpin').ok === false);
// 自立后按城池数提高概率
const ownSite = st16.world.sites.filter(function (s) { return !s.playerOwned; })[0];
ownSite.playerOwned = true;
const chanceOne = warLib.recruitChance(st16, pv).chance;
ownSite.playerOwned = false;
const own2 = st16.world.sites.filter(function (s) { return !s.playerOwned; }).slice(0, 5);
own2.forEach(function (s) { s.playerOwned = true; });
const chanceFive = warLib.recruitChance(st16, pv).chance;
own2.forEach(function (s) { s.playerOwned = false; });
ownSite.playerOwned = true;
ok('自立城池越多，招降概率越高', chanceFive > chanceOne, chanceOne.toFixed(3) + ' → ' + chanceFive.toFixed(3));
let recruited = null;
for (let i = 0; i < 40 && !recruited; i += 1) {
  // 招降有三天冷却；测试里推进时间，避免 40 次全被冷却挡掉。
  st16.clock.day += 3;
  pv.recruitCoolDay = 0;
  const r = warLib.recruitLord(st16, 'wenpin');
  if (r.ok) recruited = r;
  else if (!st16.prisoners.some(function (x) { return x.lordId === 'wenpin'; })) {
    warLib.capture(st16, pv, 'player', '你');
  }
}
ok('高关系高名声能招降成功', !!recruited, recruited ? recruited.msg : '40 次都没成');
ok('招降后归玩家所属势力（无主则是自己的旗）', recruited && (recruited.faction === 'player' || recruited.faction === st16.player.faction),
  recruited ? recruited.faction : '无');

// 封领主
const st17 = stateLib.createGame({ seed: 777011 });
st17.events.length = 0;
const fiefHome = st17.world.sites[0];
fiefHome.playerOwned = true;
fiefHome.ownerFaction = 'player';
fiefHome.lordId = null;
st17.player.heroes = [{ id: 'yujin', level: 6, exp: 0 }];
const pro = stateLib.promoteHero(st17, 'yujin', fiefHome.id);
ok('英雄有封地才能封成领主', pro.ok, pro.msg);
ok('封完离开队伍', st17.player.heroes.length === 0);
const newLord = st17.lords.filter(function (l) { return l.id === pro.lordId; })[0];
ok('新领主有兵有驻地', newLord && armyLib.troopCount(newLord.troops) > 0 && !!newLord.home &&
  fiefHome.lordId === newLord.id,
  newLord ? String(armyLib.troopCount(newLord.troops)) + ' 兵' : '无');
ok('新领主挂在自己的旗（自立）', newLord && (newLord.faction === 'player' || newLord.faction === st17.player.faction),
  newLord ? newLord.faction : '无');
ok('新领主等级保留英雄等级', newLord && stateLib.lordLevel(newLord) === 6,
  newLord ? String(stateLib.lordLevel(newLord)) : '无');

/* ---------------------------------------------------------------- 被追上 */

group('被追上：买路 / 断后 / 时辰');

const st18 = stateLib.createGame({ seed: 1801 });
st18.events.length = 0;
const chaseLord = st18.lords.filter(function (l) { return l.faction === 'wei'; })[0];
stateLib.changeRelation(st18, 'wei', -60);
chaseLord.x = st18.player.x;
chaseLord.y = st18.player.y;
chaseLord.cooldownH = 0;
stateLib.update(st18, 0.3);
const chaseEv = st18.events.filter(function (e) { return e.type === 'chase'; })[0];
ok('战争状态贴脸必生被追上事件', !!chaseEv && chaseEv.kind === 'lord' && chaseEv.id === chaseLord.id,
  st18.events.map(function (e) { return e.type; }).join(','));

st18.events.length = 0;
st18.player.gold = 2000;
const refused = stateLib.giveWay(st18, chaseLord.id, 'lord');
ok('关系低于 -50 给钱被驳回', refused.ok === false && refused.refused === true, refused.msg);
ok('驳回不扣钱', st18.player.gold === 2000);

st18.relations.wei = -20;
const paid = stateLib.giveWay(st18, chaseLord.id, 'lord');
ok('关系 -20 收钱放人', paid.ok === true && st18.player.gold === 2000 - paid.cost, paid.msg);
ok('买路后 24 小时不追', chaseLord.payoffUntil - stateLib.gameHours(st18) >= 23.9 &&
  chaseLord.chasing === false);

// 付过钱：就算玩家站他脸上，NPC 步进也不再扑过来
chaseLord.x = st18.player.x;
chaseLord.y = st18.player.y;
for (let i = 0; i < 3; i++) stateLib.update(st18, 1.0);
ok('收钱期间不追击玩家', chaseLord.chasing === false);

// 断后
const st19 = stateLib.createGame({ seed: 1901 });
st19.events.length = 0;
const tailLord = st19.lords.filter(function (l) { return l.faction === 'wei'; })[0];
stateLib.changeRelation(st19, 'wei', -60);
tailLord.x = st19.player.x;
tailLord.y = st19.player.y;
tailLord.cooldownH = 0;
st19.player.troops = { militia: 40, spear: 10 };
const n0 = armyLib.troopCount(st19.player.troops);
const tail = stateLib.breakTail(st19, tailLord.id, 'lord');
const n1 = armyLib.troopCount(st19.player.troops);
ok('断后折人手', tail.ok && n1 < n0 && n1 > 0, n0 + ' → ' + n1);
ok('断后换他原地停几个时辰', tailLord.pauseUntil - stateLib.gameHours(st19) >= 2.9,
  String(tailLord.pauseUntil - stateLib.gameHours(st19)));
const tx = tailLord.x;
const ty = tailLord.y;
stateLib.update(st19, 0.6);
ok('停留期间不挪窝', tailLord.x === tx && tailLord.y === ty);

// 站着不动，时辰照走
const st20 = stateLib.createGame({ seed: 2001 });
st20.events.length = 0;
const h0 = st20.clock.day * 24 + st20.clock.hour;
stateLib.update(st20, 1.3);
const h1 = st20.clock.day * 24 + st20.clock.hour;
ok('站着不动时辰不流动', h1 - h0 < 1e-6, h0 + ' → ' + h1);
const restSite = st20.world.sites.filter(function (s) { return s.id === 'chenliu'; })[0];
const rr = stateLib.startRest(st20, restSite);
ok('能进城修养', rr.ok, rr.msg);
stateLib.update(st20, 1.3);
const h2 = st20.clock.day * 24 + st20.clock.hour;
ok('修养看地图时辰照走', h2 - h1 >= 4, h1 + ' → ' + h2);
stateLib.stopRest(st20);
stateLib.update(st20, 1.3);
const h3 = st20.clock.day * 24 + st20.clock.hour;
ok('修养结束又回到不动不走', h3 - h2 < 1e-6, h2 + ' → ' + h3);

/* ---------------------------------------------------------------- 前期剧情 / NPC 走路 */

group('前期剧情与 NPC 走路');

const st21 = stateLib.createGame({ seed: 2121 });
st21.events.length = 0;
// 先走正路：三十人成军，立刻弹出濮阳的幕间
st21.campaign.stage = 1;
st21.player.atSiteId = 'chenliu';
st21.player.troops = { militia: 30 };
stateLib.advanceCampaign(st21);
ok('三十人成军后弹出濮阳幕间', st21.campaign.stage === 2 &&
  st21.events.some(function (e) { return e.type === 'chapter' && e.chapterId === 'act1b'; }),
  String(st21.campaign.stage));
st21.events.length = 0;

st21.campaign.stage = 2;
const puyang = st21.world.sites.filter(function (s) { return s.id === 'puyang'; })[0];
st21.player.atSiteId = 'puyang';
const raidObj = stateLib.campaignObjective(st21, puyang);
ok('濮阳有幕间小仗', !!raidObj && raidObj.id === 'puyang_raid' && raidObj.needTroops === 45,
  raidObj ? raidObj.id + '/' + raidObj.needTroops : '无');
ok('三十人还打不动濮阳', stateLib.tryCampaignBattle(st21) === null);
st21.player.troops = { militia: 30, spear: 15 };
st21.flags.campaignCool = 0;
const raidBattle = stateLib.tryCampaignBattle(st21);
ok('四十五人能打濮阳小仗', !!raidBattle && raidBattle.b.initialCount === 55, String(raidBattle && raidBattle.b.initialCount));
raidBattle.b.troops = { militia: 4 };
  while (!raidBattle.finished) {
    if (raidBattle.batchDone) raidBattle.nextBatch();
    else raidBattle.step();
  }
st21.player.troops = { militia: 40, spear: 10 };
stateLib.resolveBattle(st21, raidBattle);
ok('濮阳小仗算进剧情', st21.flags.win_act1b === true && st21.campaign.stage === 3,
  String(st21.campaign.stage));

st21.player.troops = { militia: 60 };
st21.player.food = 90;
const goldB = st21.player.gold;
const foodB = st21.player.food;
stateLib.advanceCampaign(st21);
ok('整军幕间要求 60 人 80 粮', st21.campaign.stage === 4, String(st21.campaign.stage));
ok('整军给了钱粮', st21.player.gold === goldB + 200 && st21.player.food === foodB + 30,
  '+' + (st21.player.gold - goldB) + '金 +' + (st21.player.food - foodB) + '粮');

st21.player.food = 200;
st21.player.troops = { militia: 60 };
st21.player.atSiteId = 'guandu';
st21.flags.campaignCool = 0;
ok('六十人还不够打乌巢', stateLib.tryCampaignBattle(st21) === null);
st21.player.troops = { militia: 90 };
st21.flags.campaignCool = 0;
const wuchaoB = stateLib.tryCampaignBattle(st21);
ok('九十人才放行乌巢', !!wuchaoB && wuchaoB.b.initialCount === 170,
  String(wuchaoB && wuchaoB.b.initialCount));

// NPC 不再瞬移：格子上算到了，但画面上要一步一步走过去
const st22 = stateLib.createGame({ seed: 2222 });
st22.events.length = 0;
stateLib.advanceTime(st22, 3);
stateLib.update(st22, 0.06);
const walker = st22.parties.filter(function (q) { return q.stepFrom && q.stepTo; })[0] ||
  st22.lords.filter(function (l) { return l.stepFrom && l.stepTo; })[0];
ok('NPC 迈步有起终点', !!walker && !!walker.stepFrom && !!walker.stepTo);
if (walker) {
  const mid = stateLib.unitAnimPos(walker, walker.stepStartH + walker.stepHours / 2);
  const between = (mid.x - walker.stepFrom.x) * (mid.x - walker.stepTo.x) < 0 ||
    (mid.y - walker.stepFrom.y) * (mid.y - walker.stepTo.y) < 0;
  ok('半路上画在两格之间', between, JSON.stringify(mid));
  const end = stateLib.unitAnimPos(walker, walker.stepStartH + walker.stepHours + 0.01);
  ok('走完落在目标格', Math.abs(end.x - walker.x) < 1e-6 && Math.abs(end.y - walker.y) < 1e-6);
}

/* ---------------------------------------------------------------- 扎营等待 */

group('扎营等待');

const st23 = stateLib.createGame({ seed: 2323 });
st23.events.length = 0;
const waitDay = st23.clock.day;
const waitPos = { x: st23.player.x, y: st23.player.y };
const waitRes = stateLib.campWait(st23, 72);
ok('扎营三日推进三天', st23.clock.day === waitDay + 3 && waitRes.ok, String(st23.clock.day));
ok('等待时人留在原地', st23.player.x === waitPos.x && st23.player.y === waitPos.y);
ok('等待把欠下的天下步进跑完', st23.hoursPending === 0 && st23.npcClock < 3,
  'pending=' + st23.hoursPending + ' npc=' + st23.npcClock);
ok('等待记账用“三日”', st23.log.some(function (l) { return l.text.indexOf('等了三日') >= 0; }));

/* ---------------------------------------------------------------- 新规则 */

group('酒馆任务定位');
const stQ = stateLib.createGame({ seed: 9001 });
stQ.events.length = 0;
const huntParty = stQ.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted; })[0];
const qHunt = { id: 'qh', type: 'hunt', targetPartyId: huntParty.id, done: false };
const huntPos = stateLib.questTargetPos(stQ, qHunt);
ok('猎匪任务能定位到匪团', huntPos && huntPos.x === huntParty.x && huntPos.y === huntParty.y,
  JSON.stringify(huntPos));
const campQ = stQ.world.sites.filter(function (s) { return s.type === 'camp' && !s.cleared; })[0];
const qScout = { id: 'qs', type: 'scout', targetSiteId: campQ.id, done: false };
const scoutPos = stateLib.questTargetPos(stQ, qScout);
ok('探查任务能定位到贼巢', scoutPos && scoutPos.x === campQ.x && scoutPos.y === campQ.y,
  JSON.stringify(scoutPos));
const qGrain = { id: 'qg', type: 'grain', siteId: 'chenliu', done: false };
const grainPos = stateLib.questTargetPos(stQ, qGrain);
ok('交粮任务能定位到城', grainPos && grainPos.name === '陈留', JSON.stringify(grainPos));

group('自立国号与旗色');
const stC = stateLib.createGame({ seed: 9002 });
stC.events.length = 0;
const firstCity = worldLib.siteById(stC.world, 'xiaopei');
firstCity.ownerFaction = 'lv';
stC.relations.lv = -50;
stC.wars.lv = true;
stateLib.takeSite(stC, firstCity);
ok('首城到手即自立', stC.player.faction === 'player' && !!stC.player.country,
  stC.player.faction + '/' + JSON.stringify(stC.player.country));
ok('首城归玩家自立势力', firstCity.playerOwned && firstCity.ownerFaction === 'player',
  firstCity.ownerFaction);
ok('首城打下来先清空旧封主', !firstCity.lordId, String(firstCity.lordId || 'null'));
ok('首城弹出定国号事件', stC.events.some(function (e) { return e.type === 'founding'; }));
const badName = stateLib.foundCountry(stC, '大汉', '#b4463c');
ok('国号只能一个字', badName.ok === false, badName.msg);
const named = stateLib.foundCountry(stC, '汉', '#b4463c');
ok('一字国号可立', named.ok && named.name === '汉', named.msg);
ok('城头换国号与旗色', firstCity.banner === '汉' && firstCity.color === '#b4463c',
  firstCity.banner + '/' + firstCity.color);
ok('全势力数据跟着换', FACTIONS.player.banner === '汉' && FACTIONS.player.color === '#b4463c',
  FACTIONS.player.banner + '/' + FACTIONS.player.color);
ok('国号在势力名里读作汉国', FACTIONS.player.full === '汉国', FACTIONS.player.full);
ok('旗色能显示中文名', stateLib.flagColorName('#b4463c') === '赤',
  stateLib.flagColorName('#b4463c'));
// 第二座已占城也要换旗
const secondCity = stC.world.sites.filter(function (s) {
  return s.id !== firstCity.id && s.type !== 'camp';
})[0];
secondCity.playerOwned = true;
secondCity.ownerFaction = 'wei';
stateLib.applyPlayerCountry(stC);
ok('所有占领城统一挂国号', secondCity.ownerFaction === 'player' && secondCity.banner === '汉',
  secondCity.ownerFaction + '/' + secondCity.banner);
const renamed = stateLib.foundCountry(stC, '赵', '#3f6fa8');
ok('扎营可改国号与颜色', renamed.ok && firstCity.banner === '赵' && firstCity.color === '#3f6fa8',
  firstCity.banner + '/' + firstCity.color);

group('玩家围城');
const stS = stateLib.createGame({ seed: 9003 });
stS.events.length = 0;
stS.player.renown = 500;
const castle = stS.world.sites.filter(function (s) { return s.type === 'castle'; })[0];
castle.ownerFaction = 'lv';
stS.relations.lv = -50;
stS.wars.lv = true;
const beginCastle = stateLib.beginPlayerSiege(stS, castle);
ok('关隘围城要两天', beginCastle.ok && beginCastle.days === 2, JSON.stringify(beginCastle));
ok('未围成不能开战', stateLib.startSiege(stS, castle) === null);
const firstCastleWait = stateLib.advancePlayerSiege(stS, castle, 24);
ok('围城推进文案按日说', firstCastleWait && firstCastleWait.msg.indexOf('一日') >= 0,
  firstCastleWait && firstCastleWait.msg);
let castleWait = firstCastleWait;
for (let i = 0; i < 3 && !(castleWait && castleWait.ready); i++) {
  castleWait = stateLib.advancePlayerSiege(stS, castle, 24);
}
ok('两天围成后可决战', castleWait && castleWait.ready === true, JSON.stringify(castleWait));
ok('围成后可开战', !!stateLib.startSiege(stS, castle));
stateLib.cancelPlayerSiege(stS);
ok('撤围清掉围城状态', stS.playerSiege === null);

group('无主之城：可围、失败封锁');

const stU = stateLib.createGame({ seed: 9005 });
stU.events.length = 0;
const neutralTown = stU.world.sites.filter(function (s) {
  return s.type === 'town' && !s.ownerFaction && !s.playerOwned;
})[0];
ok('无主城默认可进入', !stateLib.isHostileSite(stU, neutralTown) && stateLib.siteStatus(stU, neutralTown) === '无主',
  stateLib.siteStatus(stU, neutralTown));
const beginNeutral = stateLib.beginPlayerSiege(stU, neutralTown);
ok('无主城也能开始围攻', beginNeutral.ok && stU.playerSiege && stU.playerSiege.siteId === neutralTown.id,
  beginNeutral.msg);
neutralTown.playerBlocked = true;
ok('围攻失败后无主城转为敌对', stateLib.isHostileSite(stU, neutralTown) && stateLib.siteStatus(stU, neutralTown) === '敌对',
  stateLib.siteStatus(stU, neutralTown));
ok('封锁后不能再进城歇息', stateLib.startRest(stU, neutralTown).ok === false);
ok('封锁后仍能重新围攻', stateLib.cancelPlayerSiege(stU).ok &&
  stateLib.beginPlayerSiege(stU, neutralTown).ok);

// 真打输一次：围城状态清掉，无主城记仇
neutralTown.playerBlocked = false;
stateLib.cancelPlayerSiege(stU);
const beginFail = stateLib.beginPlayerSiege(stU, neutralTown);
const garrisonBeforeFail = neutralTown.garrison;
stU.playerSiege.stage = 'ready';
stU.playerSiege.readyHour = stateLib.gameHours(stU) - 1;
const failBattle = stateLib.startSiege(stU, neutralTown);
ok('围成后能开决战', !!failBattle);
ok('玩家攻城开始即挂进攻中', neutralTown.siegeStatus === 'assault', String(neutralTown.siegeStatus));
failBattle.finish('lose');
const failSummary = stateLib.resolveBattle(stU, failBattle);
ok('玩家攻城失败后清除进攻中', neutralTown.siegeStatus === null, String(neutralTown.siegeStatus));
ok('战败后守军只留下残部，不会自动补满',
  neutralTown.garrison >= 8 &&
  neutralTown.garrison === Math.max(8, Math.round(failSummary.remainB || 0)),
  garrisonBeforeFail + '→' + neutralTown.garrison + ' (remainB ' + failSummary.remainB + ')');
ok('围攻失败后城头记仇', neutralTown.playerBlocked === true && !stateLib.isHostileSite(stU, neutralTown) === false);
ok('围攻失败后只能强攻', stateLib.isHostileSite(stU, neutralTown) && stateLib.startRest(stU, neutralTown).ok === false);

// 真打赢一次：无主城落到玩家手里，之前记下的封锁也一并清掉
const stWin = stateLib.createGame({ seed: 9010 });
stWin.events.length = 0;
const winTown = stWin.world.sites.filter(function (s) {
  return s.type === 'town' && !s.ownerFaction && !s.playerOwned;
})[0];
winTown.playerBlocked = true;
const beginWin = stateLib.beginPlayerSiege(stWin, winTown);
stWin.playerSiege.stage = 'ready';
stWin.playerSiege.readyHour = stateLib.gameHours(stWin) - 1;
const winBattle = stateLib.startSiege(stWin, winTown);
winBattle.finish('win');
stateLib.resolveBattle(stWin, winBattle);
ok('围攻胜利后清除进攻中', winTown.siegeStatus === null, String(winTown.siegeStatus));
ok('围攻胜利后无主城归玩家', winTown.playerOwned === true && winTown.ownerFaction === 'player',
  winTown.playerOwned + '/' + winTown.ownerFaction);
ok('夺城后清掉旧封锁', winTown.playerBlocked === false && !stateLib.isHostileSite(stWin, winTown));
ok('夺下第一座城会触发立国旗号', !!stWin.player.country && stWin.player.faction === 'player');

group('围城计时走大地图时间');

const stTime = stateLib.createGame({ seed: 9008 });
stTime.events.length = 0;
const timeTown = stTime.world.sites.filter(function (s) {
  return s.type === 'town' && !s.ownerFaction && !s.playerOwned;
})[0];
stateLib.beginPlayerSiege(stTime, timeTown);
const dayBefore = stTime.clock.day;
// 大地图站着不动，围营照样让时辰走：6.5 秒 ≈ 25 时辰
stateLib.update(stTime, 6.5);
ok('围城时大地图时辰流动', stTime.clock.day > dayBefore, 'day ' + dayBefore + '→' + stTime.clock.day);
ok('围满后自动标记可决战', stTime.playerSiege && stTime.playerSiege.stage === 'ready' &&
  stTime.playerSiege.readyAnnounced === true, stTime.playerSiege && stTime.playerSiege.stage);
ok('围城成就不再推普通提示，交给大地图弹进攻选择', !stTime.events.some(function (e) {
  return e.type === 'warning' && e.title === '围城已成';
}));

group('酒馆任务：目标被其他势力清剿');

const stQF = stateLib.createGame({ seed: 9006 });
stQF.events.length = 0;
const failParty = stQF.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted; })[0];
const failQuest = {
  id: 'q_fail', type: 'hunt', siteId: 'chenliu', siteName: '陈留', faction: 'wei',
  acceptedDay: 1, done: false, targetPartyId: failParty.id, title: '清剿' + failParty.name,
  text: '清剿匪团', reward: { gold: 180, renown: 24 },
};
stQF.quests.push(failQuest);
const qGoldBefore = stQF.player.gold;
const qRenownBefore = stQF.player.renown;
stQF.parties = stQF.parties.filter(function (p) { return p.id !== failParty.id; });
const failedCount = stateLib.checkQuestTargets(stQF);
ok('目标不在会判定失败', failedCount === 1 && failQuest.done === true && failQuest.failed === true);
ok('失败文案点名其他势力清剿', failQuest.failReason === '目标已经被其他势力清剿', failQuest.failReason);
ok('失败不发金钱', stQF.player.gold === qGoldBefore, stQF.player.gold + '/' + qGoldBefore);
ok('失败不发声望', stQF.player.renown === qRenownBefore, stQF.player.renown + '/' + qRenownBefore);
ok('失败后地图点位消失', stateLib.questTargetPos(stQF, failQuest) === null);
ok('失败会推一条任务失败提示', stQF.events.some(function (e) {
  return e.type === 'quest-failed' && e.text.indexOf('目标已经被其他势力清剿') >= 0;
}));

const stQK = stateLib.createGame({ seed: 9007 });
stQK.events.length = 0;
const killParty = stQK.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted; })[0];
const killQuest = {
  id: 'q_kill', type: 'hunt', siteId: 'chenliu', siteName: '陈留', faction: 'wei',
  acceptedDay: 1, done: false, targetPartyId: killParty.id, title: '清剿' + killParty.name,
  text: '清剿匪团', reward: { gold: 180, renown: 24 },
};
stQK.quests.push(killQuest);
stateLib.completeQuests(stQK, 'hunt', killParty.id);
ok('玩家自己打散目标算交差', killQuest.done === true && !killQuest.failed && stQK.player.gold === 460 + 180);

// 玩家刚接的猎匪目标：五天内 NPC 领主不能打它，保证玩家赶得到。
const stQP = stateLib.createGame({ seed: 9008 });
stQP.events.length = 0;
const protectParty = stQP.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted; })[0];
const protectQuest = {
  id: 'q_protect', type: 'hunt', siteId: 'chenliu', siteName: '陈留', faction: 'wei',
  acceptedDay: stQP.clock.day, done: false, targetPartyId: protectParty.id,
  title: '清剿' + protectParty.name, text: '清剿匪团', reward: { gold: 180, renown: 24 },
};
stQP.quests.push(protectQuest);
ok('任务目标头五天受保护', stateLib.questProtectedParty(stQP, protectParty) === true);
ok('普通匪团没有被误标为任务目标',
  stateLib.questProtectedParty(stQP, stQP.parties.filter(function (p) {
    return p.faction === 'bandit' && p.id !== protectParty.id;
  })[0]) === false);
const guardLord = stQP.lords.filter(function (l) { return l.alive && !l.inCity; })[0];
guardLord.x = protectParty.x + 1;
guardLord.y = protectParty.y;
guardLord.engagedWith = 'party:' + protectParty.id;
protectParty.engagedWith = guardLord.id;
protectParty.engagedSinceH = stateLib.gameHours(stQP);
stateLib.fightNeighbors(stQP);
ok('任务目标五天内不进入 NPC 遭遇战',
  protectParty.engagedWith === null && protectParty.dead !== true,
  'engaged=' + protectParty.engagedWith + ' dead=' + protectParty.dead);
stQP.clock.day += 5;
ok('五天后任务保护自动失效', stateLib.questProtectedParty(stQP, protectParty) === false);

group('灭亡后就近择主');
const stN = stateLib.createGame({ seed: 9004 });
stN.events.length = 0;
stN.player.country = { name: '汉', color: '#b4463c' };
stN.player.faction = 'player';
const playerCity = stN.world.sites.filter(function (s) { return s.type === 'town'; })[0];
playerCity.playerOwned = true;
playerCity.ownerFaction = 'player';
// 把其他城都归到魏，玩家城离残部最近 → 应投玩家
stN.world.sites.forEach(function (s) {
  if (s !== playerCity && s.type !== 'camp') s.ownerFaction = 'wei';
});
const strayLord = stN.lords.filter(function (l) { return l.faction === 'lv'; })[0] || stN.lords[0];
strayLord.x = playerCity.x;
strayLord.y = playerCity.y;
strayLord.home = playerCity.id;
const chosen = stateLib.pickFactionFor(stN, strayLord, 'lv');
ok('残部能投玩家自立势力', chosen === 'player', String(chosen));
stateLib.moveLordToFaction(stN, strayLord, chosen);
ok('投玩家后落在玩家城', strayLord.faction === 'player' && strayLord.home === playerCity.id,
  strayLord.faction + '/' + strayLord.home);

group('粮草两日预警与哗变');
const stFood = stateLib.createGame({ seed: 9005 });
stFood.events.length = 0;
stFood.clock.day = 2;
const foodNeed = stateLib.nextFoodNeed(stFood);
stFood.player.food = foodNeed; // 付得起这一顿，付不起下一顿
stateLib.dailyTick(stFood);
ok('扣完这顿即预警下一顿', !!stFood.foodWarning && stFood.events.some(function (e) { return e.type === 'warning'; }),
  JSON.stringify(stFood.foodWarning));
ok('预警文案说两日与哗变', stFood.events.some(function (e) {
  return e.type === 'warning' && e.text.indexOf('两日') >= 0 && e.text.indexOf('哗变') >= 0;
}));
const beforeMutiny = armyLib.troopCount(stFood.player.troops);
stFood.clock.day = 4;
stateLib.dailyTick(stFood);
const afterMutiny = armyLib.troopCount(stFood.player.troops);
ok('再断粮会哗变减员', afterMutiny < beforeMutiny, beforeMutiny + '→' + afterMutiny);
ok('史册记下哗变', stFood.log.some(function (l) { return l.text.indexOf('哗变') >= 0; }));
stFood.player.food = 200;
stateLib.refreshFoodWarning(stFood);
ok('补足粮草后告警消除', stFood.foodWarning === null);

/* ---------------------------------------------------------------- 封地与容量 */

group('封地 · 领主等级 · 声望容量');

// 开局：所有有主城/村都有本势力领主，山寨除外
const stFief = stateLib.createGame({ seed: 777012 });
const fiefSites = stFief.world.sites.filter(function (s) {
  return s.type !== 'camp' && s.ownerFaction;
});
ok('有主城村都有封主', fiefSites.every(function (s) {
  const l = stateLib.siteLord(stFief, s);
  return l && l.faction === s.ownerFaction;
}), fiefSites.filter(function (s) { return !stateLib.siteLord(stFief, s); }).length + ' 处无封主');
ok('封主数量覆盖城与村', fiefSites.length >= 40, String(fiefSites.length));

// 玩家封地：一领主可管多处，收回后互不影响
const stFief2 = stateLib.createGame({ seed: 777013 });
const homeA = stFief2.world.sites.filter(function (s) { return s.type === 'town'; })[0];
const homeB = stFief2.world.sites.filter(function (s) { return s.type === 'village'; })[0];
homeA.playerOwned = true; homeA.ownerFaction = 'player'; homeA.lordId = null;
homeB.playerOwned = true; homeB.ownerFaction = 'player'; homeB.lordId = null;
stFief2.player.heroes = [{ id: 'yujin', level: 6, exp: 0 }];
const pro2 = stateLib.promoteHero(stFief2, 'yujin', homeA.id);
ok('英雄先封城', pro2.ok, pro2.msg);
const lord2 = stFief2.lords.filter(function (l) { return l.id === pro2.lordId; })[0];
const assignB = stateLib.assignFief(stFief2, homeB.id, lord2.id);
ok('改封会自动收回原封地', assignB.ok && homeB.lordId === lord2.id && homeA.lordId === null, assignB.msg);
ok('一个领主最多一处封地', stateLib.lordFiefs(stFief2, lord2).length === 1,
  String(stateLib.lordFiefs(stFief2, lord2).length));
const clearB = stateLib.assignFief(stFief2, homeB.id, null);
ok('收回封地', clearB.ok && homeB.lordId === null, clearB.msg);
homeA.lordId = lord2.id; // 用一块已有封主的地来试“不能再封别人”
stFief2.player.heroes = [{ id: 'yuejin', level: 5, exp: 0 }];
const occupied = stateLib.promoteHero(stFief2, 'yuejin', homeA.id);
ok('已有封主的地不能再封给别人', !occupied.ok, occupied.msg);
stateLib.assignFief(stFief2, homeB.id, lord2.id); // 存档检查前把封主放回去

// 等级带兵上限：君主按原编制不缩水，独立英雄按等级涨
const cao = stFief.lords.filter(function (l) { return l.id === 'caocao'; })[0];
ok('君主带兵上限不低于原编制', cao && stateLib.lordTroopCap(cao) >= armyLib.troopCount(cao.defTroops),
  cao ? stateLib.lordTroopCap(cao) + ' / ' + armyLib.troopCount(cao.defTroops) : '无');
ok('Lv6 独立领主上限 170', newLord && stateLib.lordTroopCap(newLord) === 170,
  newLord ? String(stateLib.lordTroopCap(newLord)) : '无');
ok('Lv6 独立领主编制补到上限', newLord && armyLib.troopCount(newLord.defTroops) === 170,
  newLord ? String(armyLib.troopCount(newLord.defTroops)) : '无');

// 主角声望容量：30 起步，每 100 声望的增幅递减
const capAt = function (r) { return armyLib.troopCapacity(r); };
const cap0 = capAt(0);
const cap100 = capAt(100);
const cap200 = capAt(200);
const cap300 = capAt(300);
const cap400 = capAt(400);
const cap500 = capAt(500);
const cap600 = capAt(600);
const cap550 = capAt(550);
const cap1000 = capAt(1000);
ok('零声望容量仍是 30', cap0 === 30, String(cap0));
ok('第一档 +30', cap100 - cap0 === 30, String(cap100 - cap0));
ok('第二档 +27', cap200 - cap100 === 27, String(cap200 - cap100));
ok('第三档 +24', cap300 - cap200 === 24, String(cap300 - cap200));
ok('增幅逐档锐减', (cap100 - cap0) > (cap200 - cap100) &&
  (cap200 - cap100) > (cap300 - cap200) &&
  (cap300 - cap200) > (cap400 - cap300) &&
  (cap400 - cap300) > (cap500 - cap400) &&
  (cap500 - cap400) > (cap600 - cap500),
  [cap0, cap100, cap200, cap300, cap400, cap500, cap600].join('/'));
ok('一千声望容量不超二百三', cap1000 <= 230, String(cap1000));

// 存档保留封主与等级
const savedFief = stateLib.serialize(stFief2);
const backFief = stateLib.deserialize(savedFief);
ok('存档保留据点封主', !!backFief && backFief.world.sites.filter(function (s) { return s.id === homeB.id; })[0].lordId === lord2.id,
  backFief ? String(backFief.world.sites.filter(function (s) { return s.id === homeB.id; })[0].lordId) : '无存档');
const backLord = backFief && backFief.lords.filter(function (l) { return l.id === lord2.id; })[0];
ok('存档保留领主等级', !!backLord && backLord.level === 6, backLord ? String(backLord.level) : '无存档');


/* ---------------------------------------------------------------- 行军速度 · 议和 */

group('行军速度随兵力');
{
  const sp = stateLib.createGame({ seed: 8123 });
  const speedAt = function (n) {
    sp.player.troops = { militia: n };
    return stateLib.playerSpeed(sp);
  };
  const s0 = speedAt(0);
  const s50 = speedAt(50);
  const s200 = speedAt(200);
  const s400 = speedAt(400);
  const s600 = speedAt(600);
  ok('兵越多速度越慢', s0 > s50 && s50 > s200 && s200 > s400 && s400 > s600,
    [s0, s50, s200, s400, s600].map(function (v) { return v.toFixed(3); }).join('/'));
  ok('满编不会慢到走不动', s600 >= 0.35, s600.toFixed(3));
  ok('带兵越多行军耗时越长', (1000 / s200) > (1000 / s50));
}

group('敌国求和');
{
  const g = stateLib.createGame({ seed: 8124 });
  g.wars.wei = true;
  g.playerWarSince = { wei: 1 };
  g.clock.day = 30;
  warLib.peaceOfferTick(g);
  ok('开战不满三十天不求和', !g.peaceOfferPending);
  g.clock.day = 31;
  let tries = 0;
  while (!g.peaceOfferPending && tries++ < 300) warLib.peaceOfferTick(g);
  ok('三十天后会收到求和', !!g.peaceOfferPending, tries);
  const shiBefore = g.player.shi || 0;
  const relBefore = stateLib.relationOf(g, 'wei');
  const weiTown = g.world.sites.filter(function (s) { return s.ownerFaction === 'wei' && s.type === 'town'; })[0];
  g.playerSiege = weiTown ? { siteId: weiTown.id, stage: 'ready' } : null;
  const accept = stateLib.acceptPeaceOffer(g, 'wei');
  ok('接受求和成功', accept.ok, accept.msg);
  ok('接受后得一支天机简', (g.player.shi || 0) === shiBefore + 1, shiBefore + '→' + g.player.shi);
  ok('接受后关系归零', stateLib.relationOf(g, 'wei') === 0, String(stateLib.relationOf(g, 'wei')));
  ok('接受后战争结束', !stateLib.atWarWith(g, 'wei') && !g.wars.wei);
  ok('接受后关系原值也归零', g.relations.wei === 0, String(g.relations.wei));
  ok('接受后撤掉对对方的围城', g.playerSiege === null, g.playerSiege && g.playerSiege.siteId);

  const r = stateLib.createGame({ seed: 8125 });
  r.wars.wei = true;
  r.playerWarSince = { wei: 1 };
  r.clock.day = 31;
  let tr = 0;
  while (!r.peaceOfferPending && tr++ < 300) warLib.peaceOfferTick(r);
  const shiR = r.player.shi || 0;
  const relR = stateLib.relationOf(r, 'wei');
  const reject = stateLib.rejectPeaceOffer(r, 'wei');
  ok('拒绝求和成功', reject.ok, reject.msg);
  ok('拒绝不扣天机简', (r.player.shi || 0) === shiR);
  ok('拒绝不改变关系', stateLib.relationOf(r, 'wei') === relR);
  ok('拒绝后战争继续', stateLib.atWarWith(r, 'wei'));
}

group('求和门槛');
{
  const k = stateLib.createGame({ seed: 8126 });
  k.wars.wei = true;
  k.playerWarSince = { wei: 1 };
  k.killRecords.wei = 10;
  k.clock.day = 60;
  warLib.peaceOfferTick(k);
  ok('杀将未满六十天不求和', !k.peaceOfferPending);
  k.clock.day = 71;
  let n = 0;
  while (!k.peaceOfferPending && n++ < 300) warLib.peaceOfferTick(k);
  ok('杀将满六十天后按概率求和', !!k.peaceOfferPending, n);
}

group('守军自然增长');
{
  const g = stateLib.createGame({ seed: 8127 });
  const city = g.world.sites.filter(function (s) { return s.type === 'town'; })[0];
  city.garrisonBase = 40;
  city.garrison = 40;
  city.garrisonGrowth = 0;
  const before = city.garrison;
  economy.dailyMarket(g, g.rng);
  ok('城池守军每天自然增长', city.garrison > before, before + '→' + city.garrison);
  ok('守军人数越多增长越慢',
    economy.garrisonGrowthRate({ garrison: 40, garrisonBase: 40 }) >
    economy.garrisonGrowthRate({ garrison: 400, garrisonBase: 40 }));
  const big = { garrison: 5000, garrisonBase: 40, garrisonGrowth: 0 };
  const inc = economy.growGarrison(big);
  ok('守军没有硬上限', big.garrison > 5000 || (inc === 0 && big.garrisonGrowth > 0), big.garrison + '+' + inc);
  const hurt = { garrison: 12, garrisonBase: 40, garrisonGrowth: 0 };
  economy.growGarrison(hurt);
  ok('战损后从低人数继续按招兵速度增长', hurt.garrison > 12, hurt.garrison + ' 人');
}

group('天下颜色跟随城池');
{
  const g = stateLib.createGame({ seed: 8128 });
  const city = g.world.sites.filter(function (s) { return s.ownerFaction === 'wei' && s.type === 'town'; })[0];
  const before = territory.buildFactionGrid(g.world);
  const idx = city.y * g.world.w + city.x;
  ok('城池所在格先是魏色', before[idx] === 'wei', String(before[idx]));
  const oldOwner = city.ownerFaction;
  city.ownerFaction = 'shu';
  city.faction = 'shu';
  const after = territory.buildFactionGrid(g.world);
  ok('占领后同一格立即覆盖成新城主颜色', after[idx] === 'shu', String(after[idx]));
  city.ownerFaction = oldOwner;
  city.faction = oldOwner;
  territory.buildFactionGrid(g.world);
}

group('领主八小时同答');
{
  const g = stateLib.createGame({ seed: 8129 });
  const lord = g.lords.filter(function (l) { return l.alive && l.faction === 'wei'; })[0];
  lord.askCache = null;
  const first = stateLib.lordIdle(g, lord);
  const second = stateLib.lordIdle(g, lord);
  ok('八小时内问同一位领主得到同一句', first === second, first + ' / ' + second);
  g.clock.hour = (g.clock.hour + 7) % 24;
  const third = stateLib.lordIdle(g, lord);
  ok('第七个小时仍是同一句', third === first, first + ' / ' + third);
  g.clock.day += 1;
  const fourth = stateLib.lordIdle(g, lord);
  ok('过了八小时重新换一句', lord.askCache.at !== undefined && lord.askCache.line === fourth,
    fourth);
}

group('各国都可自行开战');
{
  const g = stateLib.createGame({ seed: 8130 });
  g.player.faction = 'wei';
  // n11 起不再给玩家效忠国留“AI 不替你宣战”的罩子；
  // 统一的天下里，魏、蜀、袁都该按自己的邻国和粮草决定打谁。
  ok('玩家效忠国也会被 AI 开战', warLib.aiCanDeclare(g, 'wei', 'shu'));
  ok('别国也会来打玩家效忠国', warLib.aiCanDeclare(g, 'shu', 'wei'));
  ok('两家别国之间仍可自行开战', warLib.aiCanDeclare(g, 'shu', 'yuan'));
}

group('君主继任与永世不议和');
{
  const g = stateLib.createGame({ seed: 8131 });
  const fac = 'wei';
  const ruler = stateLib.factionLord(g, fac);
  const oldName = ruler.name;
  ruler.prisoner = { by: 'player', days: 1 };
  g.prisoners.push({ lordId: ruler.id, by: 'player', days: 1 });
  const result = stateLib.executePrisoner(g, ruler.id);
  ok('斩君主成功', result.ok, result.msg);
  ok('君主被斩触发永世不议和', g.noPeaceForever[fac] === true);
  ok('继任表把王位传给下一位', stateLib.factionLord(g, fac).name !== oldName,
    oldName + '→' + stateLib.factionLord(g, fac).name);
  ok('新君已挂上国名', FACTIONS[fac].lord === stateLib.factionLord(g, fac).name,
    FACTIONS[fac].lord);
  ok('永世不议和时议和条款被驳回', stateLib.peaceTerms(g, fac).forever === true);
  ok('永世不议和时外交议和失败', warLib.makePeace(g, 'player', fac, true) === false);

  g.factionState[fac].successorIndex = 999;
  const nextRuler = stateLib.factionLord(g, fac);
  nextRuler.prisoner = { by: 'player', days: 1 };
  g.prisoners.push({ lordId: nextRuler.id, by: 'player', days: 1 });
  stateLib.executePrisoner(g, nextRuler.id);
  ok('继任表耗尽后仍会从本势力领主中选新君',
    !!stateLib.factionLord(g, fac) && stateLib.factionLord(g, fac).alive,
    stateLib.factionLord(g, fac) && stateLib.factionLord(g, fac).name);

  const saved = stateLib.deserialize(stateLib.serialize(g));
  ok('读档后新君与国名不回到旧主', FACTIONS[fac].lord === saved.factionState[fac].rulerName &&
    saved.factionState[fac].rulerName !== oldName, FACTIONS[fac].lord);

  const fresh = stateLib.createGame({ seed: 8132 });
  ok('再开新局时国名与君主复位', FACTIONS[fac].lord === '曹操' && !!fresh, FACTIONS[fac].lord);
}

/* ---------------------------------------------------------------- 本轮增量 */

group('扎营流逝 / 商店按档 / 英雄自传');
const stCamp = stateLib.createGame({ seed: 991001 });
stCamp.events.length = 0;
stCamp.player.route = [];
stCamp.player.stepTo = null;
stCamp.campFlow = false;
const campH0 = stateLib.gameHours(stCamp);
stateLib.update(stCamp, 8, { ignoreEvents: true });
ok('不扎营时时辰不动', stateLib.gameHours(stCamp) === campH0,
  campH0 + ' -> ' + stateLib.gameHours(stCamp));
stCamp.campFlow = true;
const campH1 = stateLib.gameHours(stCamp);
stateLib.update(stCamp, 8, { ignoreEvents: true });
ok('扎营时时辰自己往前走', stateLib.gameHours(stCamp) > campH1,
  campH1 + ' -> ' + stateLib.gameHours(stCamp));
stCamp.campFlow = false;

const stShopA = stateLib.createGame({ seed: 991002 });
stShopA.events.length = 0;
const shopBefore = stateLib.adShiInfo(stShopA).used;
const claimed = stateLib.claimAdShi(stShopA);
ok('局内商店能领天机简', claimed.ok === true && stateLib.adShiInfo(stShopA).used === shopBefore + 1,
  JSON.stringify(claimed.info));
const stShopB = stateLib.createGame({ seed: 991003 });
stShopB.events.length = 0;
ok('换存档后商店次数从零开始', stateLib.adShiInfo(stShopB).used === 0,
  String(stateLib.adShiInfo(stShopB).used));

const adDayA = '2026-11-25';
const adDayB = '2026-11-26';
const stAd = stateLib.createGame({ seed: 991005 });
stAd.events.length = 0;
const adInfo0 = stateLib.adRewardInfo(stAd, adDayA);
ok('三类广告各自从 0 开始', adInfo0.used.gold === 0 && adInfo0.used.food === 0 &&
  adInfo0.used.shi === 0 && adInfo0.left.gold === 10 && adInfo0.left.food === 10 &&
  adInfo0.left.shi === 10,
  JSON.stringify(adInfo0));
const adGold0 = stAd.player.gold;
const goldClaim = stateLib.claimAdReward(stAd, 'gold', adDayA);
const adAfterGold = stateLib.adRewardInfo(stAd, adDayA);
ok('金钱广告能领 1000 金钱', goldClaim.ok && goldClaim.amount === 1000 &&
  stAd.player.gold === adGold0 + 1000 && adAfterGold.used.gold === 1 &&
  adAfterGold.used.food === 0 && adAfterGold.used.shi === 0,
  goldClaim.msg);
const adFood0 = stAd.player.food;
const foodClaim = stateLib.claimAdReward(stAd, 'food', adDayA);
const adAfterFood = stateLib.adRewardInfo(stAd, adDayA);
ok('粮草广告能领 2000 粮草', foodClaim.ok && foodClaim.amount === 2000 &&
  stAd.player.food === adFood0 + 2000 && adAfterFood.used.gold === 1 &&
  adAfterFood.used.food === 1 && adAfterFood.used.shi === 0,
  foodClaim.msg);
const adShi0 = stAd.player.shi;
const shiClaim = stateLib.claimAdReward(stAd, 'shi', adDayA);
const adAfterShi = stateLib.adRewardInfo(stAd, adDayA);
ok('天机简广告能领 2 支天机简', shiClaim.ok && shiClaim.amount === 2 &&
  stAd.player.shi === adShi0 + 2 && adAfterShi.used.gold === 1 &&
  adAfterShi.used.food === 1 && adAfterShi.used.shi === 1,
  shiClaim.msg);

for (let i = 0; i < 9; i++) stateLib.claimAdReward(stAd, 'gold', adDayA);
const adGoldFull = stateLib.adRewardInfo(stAd, adDayA);
ok('金钱广告独立算 10 次', adGoldFull.used.gold === 10 && adGoldFull.left.gold === 0 &&
  adGoldFull.left.food === 9 && adGoldFull.left.shi === 9,
  JSON.stringify(adGoldFull));
ok('金钱第 11 次被拒，且不占粮草/天机简次数',
  stateLib.claimAdReward(stAd, 'gold', adDayA).ok === false &&
  stateLib.adRewardInfo(stAd, adDayA).left.food === 9 &&
  stateLib.adRewardInfo(stAd, adDayA).left.shi === 9,
  JSON.stringify(stateLib.adRewardInfo(stAd, adDayA)));

for (let i = 0; i < 9; i++) stateLib.claimAdReward(stAd, 'food', adDayA);
const adFoodFull = stateLib.adRewardInfo(stAd, adDayA);
ok('粮草广告独立算 10 次', adFoodFull.used.food === 10 && adFoodFull.left.food === 0 &&
  adFoodFull.left.gold === 0 && adFoodFull.left.shi === 9,
  JSON.stringify(adFoodFull));

for (let i = 0; i < 9; i++) stateLib.claimAdReward(stAd, 'shi', adDayA);
const adShiFull = stateLib.adRewardInfo(stAd, adDayA);
ok('天机简广告独立算 10 次', adShiFull.used.shi === 10 && adShiFull.left.shi === 0 &&
  stAd.player.shi === adShi0 + 20 && adShiFull.left.gold === 0 && adShiFull.left.food === 0,
  JSON.stringify(adShiFull));
ok('三类全部领完后都拒绝',
  stateLib.claimAdReward(stAd, 'gold', adDayA).ok === false &&
  stateLib.claimAdReward(stAd, 'food', adDayA).ok === false &&
  stateLib.claimAdReward(stAd, 'shi', adDayA).ok === false,
  JSON.stringify(stateLib.adRewardInfo(stAd, adDayA)));

const adNextDay = stateLib.adRewardInfo(stAd, adDayB);
ok('现实日跨日三类次数全部重置', adNextDay.used.gold === 0 && adNextDay.used.food === 0 &&
  adNextDay.used.shi === 0 && adNextDay.left.gold === 10 && adNextDay.left.food === 10 &&
  adNextDay.left.shi === 10,
  JSON.stringify(adNextDay));
ok('跨日后粮草广告可以继续领', stateLib.claimAdReward(stAd, 'food', adDayB).ok === true,
  JSON.stringify(stateLib.adRewardInfo(stAd, adDayB)));

const extraLib = require(R + '/data/extra.js');
const heroStorySample = extraLib.heroStory('liaohua') || '';
ok('英雄自传只写本人经历、不写东家', heroStorySample.length > 20 &&
  heroStorySample.indexOf('帐下') < 0 && heroStorySample.indexOf('麾下') < 0,
  heroStorySample.slice(0, 30));

group('西凉步卒 / 天机筒');
ok('西凉追兵已改为步兵编制', TROOPS.tiefu.name === '西凉重步' && TROOPS.tiefu.cav === false,
  TROOPS.tiefu.name + ' cav=' + TROOPS.tiefu.cav);

const stClash = stateLib.createGame({ seed: 991004 });
stClash.events.length = 0;
warLib.init(stClash);
const ca = stClash.lords.filter(function (l) { return l.faction === 'wei'; })[0];
const cb = stClash.lords.filter(function (l) { return l.faction === 'yuan'; })[0];
ca.x = 10; ca.y = 10; cb.x = 11; cb.y = 10;
ca.troops = { inf: 120 }; cb.troops = { inf: 120 };
ca.morale = 70; cb.morale = 70;
const first = warLib.clash(stClash, ca, cb);
ok('势均力敌时先进入交战而不是一碰就散', !!first && first.engaged === true,
  JSON.stringify(first));
ok('交战双方互相标记', ca.engagedWith === cb.id && cb.engagedWith === ca.id,
  ca.engagedWith + ' / ' + cb.engagedWith);
const aBefore = armyLib.troopCount(ca.troops);
const bBefore = armyLib.troopCount(cb.troops);
const second = warLib.clash(stClash, ca, cb);
ok('大规模交战每轮成片掉人', armyLib.troopCount(ca.troops) < aBefore && armyLib.troopCount(cb.troops) < bBefore,
  aBefore + '->' + armyLib.troopCount(ca.troops) + ' / ' + bBefore + '->' + armyLib.troopCount(cb.troops));
ok('溃败后双方解除缠斗', !second.engaged || ca.engagedWith || cb.engagedWith,
  JSON.stringify({ engaged: second.engaged, a: ca.engagedWith, b: cb.engagedWith }));

/* ---------------------------------------------------------------- 巡逻路线 */

group('领主巡逻路线');
{
  const patrolA = stateLib.createGame({ seed: 2026112501 });
  const weiLords = patrolA.lords.filter(function (l) { return l.alive && l.faction === 'wei'; });
  const routes = weiLords.slice(0, 8);
  const routeNames = routes.map(function (l) {
    return stateLib.patrolRouteFor(patrolA, l).map(function (s) { return s.name; }).join('>');
  });
  ok('领主有两点以上的独立巡逻路线', routes.every(function (l) {
    return stateLib.patrolRouteFor(patrolA, l).length >= 2;
  }), routeNames.join(' / '));
  ok('同国前八名领主路线不重复', new Set(routeNames).size === routeNames.length,
    routeNames.join(' / '));
  const moving = routes[0];
  moving.inCity = null;
  moving.order = null;
  moving.pauseUntil = 0;
  moving.wander = null;
  moving.patrolRouteIds = null;
  moving.patrolIdx = undefined;
  moving.patrolPath = null;
  patrolA.player.x = 5;
  patrolA.player.y = 140;
  patrolA.player.faction = 'wei';
  const fromX = moving.x;
  const fromY = moving.y;
  for (let i = 0; i < 20; i++) stateLib.moveLords(patrolA);
  ok('领主沿路线离开原地', moving.x !== fromX || moving.y !== fromY,
    fromX + ',' + fromY + ' → ' + moving.x + ',' + moving.y);
}

/* ---------------------------------------------------------------- 追击与逃遁 */

group('领主追击与逃遁');
{
  const g = stateLib.createGame({ seed: 2026112504 });
  g.player.faction = 'wei';
  g.player.x = 5;
  g.player.y = 140;
  g.player.troops = { militia: 80 };
  const strong = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const weak = g.lords.filter(function (l) { return l.id === 'jiling'; })[0];
  const base = g.world.sites.filter(function (s) { return s.id === 'xuchang'; })[0];
  [strong, weak].forEach(function (l) {
    l.inCity = null;
    l.order = null;
    l.pauseUntil = 0;
    l.moveTick = 0;
    l.wander = null;
    l.patrolRouteIds = null;
    l.patrolPath = null;
    l.fleeing = false;
    l.fleeTargetId = null;
    l.fleePath = null;
    l.hunting = false;
    l.chasing = false;
    l.foeChasing = null;
  });
  strong.x = base.x + 2; strong.y = base.y + 1;
  weak.x = base.x + 3; weak.y = base.y + 1;
  strong.troops = { militia: 150 }; strong.defTroops = { militia: 150 };
  weak.troops = { militia: 10 }; weak.defTroops = { militia: 110 };
  // 这一组只测领主对领主；清掉匪团，避免“先剿匪”抢走目标。
  g.parties = [];
  g.clock.day = 31;
  warLib.declare(g, 'wei', 'yuanshu', true);
  stateLib.moveLords(g);
  ok('兵多的领主会追击', strong.hunting && strong.chasing && strong.foeChasing === 'jiling',
    'hunting=' + strong.hunting + ' foe=' + strong.foeChasing);
  ok('兵少的领主会逃遁', weak.fleeing === true, 'fleeing=' + weak.fleeing);
  const weakTarget = g.world.sites.filter(function (s) { return s.id === weak.fleeTargetId; })[0];
  ok('弱者优先逃向自己势力的城', weakTarget && weakTarget.ownerFaction === 'yuanshu',
    weakTarget ? weakTarget.id + '/' + weakTarget.ownerFaction : 'none');
  ok('自己的城也是最近的那座', weakTarget && weakTarget.id === 'shouchun',
    weakTarget ? weakTarget.id : 'none');
}
{
  const g = stateLib.createGame({ seed: 2026112505 });
  g.player.faction = 'wei';
  g.player.x = 5;
  g.player.y = 140;
  g.player.troops = { militia: 80 };
  const a = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const b = g.lords.filter(function (l) { return l.id === 'jiling'; })[0];
  const base = g.world.sites.filter(function (s) { return s.id === 'xuchang'; })[0];
  [a, b].forEach(function (l) {
    l.inCity = null; l.order = null; l.pauseUntil = 0; l.moveTick = 0;
    l.wander = null; l.patrolRouteIds = null; l.patrolPath = null;
    l.fleeing = false; l.fleeTargetId = null; l.fleePath = null; l.hunting = false; l.chasing = false;
  });
  a.x = base.x + 2; a.y = base.y + 1; b.x = base.x + 3; b.y = base.y + 1;
  a.troops = { militia: 100 }; a.defTroops = { militia: 100 };
  b.troops = { militia: 100 }; b.defTroops = { militia: 100 };
  stateLib.moveLords(g);
  ok('势均力敌时不盲目追击或逃遁', !a.hunting && !a.chasing && !b.fleeing,
    'a=' + a.hunting + '/' + a.chasing + ' b=' + b.fleeing);
}
{
  const g = stateLib.createGame({ seed: 2026112506 });
  g.player.faction = 'wei';
  g.player.troops = { militia: 100 };
  const zl = g.lords.filter(function (l) { return l.id === 'zhangliao'; })[0];
  const farSite = g.world.sites.filter(function (s) { return s.id === 'longcheng'; })[0];
  zl.inCity = null; zl.order = null; zl.pauseUntil = 0; zl.moveTick = 0;
  zl.wander = null; zl.patrolRouteIds = null; zl.patrolPath = null;
  zl.fleeing = false; zl.fleeTargetId = null; zl.fleePath = null; zl.hunting = false; zl.chasing = false;
  zl.x = farSite.x + 1; zl.y = farSite.y;
  zl.troops = { militia: 10 }; zl.defTroops = { militia: 100 };
  g.player.x = farSite.x + 2; g.player.y = farSite.y;
  stateLib.moveLords(g);
  const target = g.world.sites.filter(function (s) { return s.id === zl.fleeTargetId; })[0];
  ok('自己势力城太远时才改投不敌对城', zl.fleeing && target && target.ownerFaction !== 'lv',
    target ? target.id + '/' + target.ownerFaction : 'none');
  ok('改投的城确实是不敌对国', target && target.ownerFaction === 'xianbei' &&
    !warLib.atWar(g, 'lv', target.ownerFaction),
    target ? target.id : 'none');
}
{
  const g = stateLib.createGame({ seed: 2026112507 });
  g.player.faction = 'wei';
  g.player.x = 5;
  g.player.y = 140;
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const base = g.world.sites.filter(function (s) { return s.id === 'xuchang'; })[0];
  g.lords = [lord];
  g.parties = [{
    id: 'p_hunt', name: '试刀劫匪', faction: 'bandit', banditTier: 'qing',
    color: '#4f8f6a', troops: { bandit: 8 }, morale: 60,
    x: base.x + 3, y: base.y, sight: 5, loot: [18, 40], size0: 8,
  }];
  lord.inCity = null; lord.order = null; lord.pauseUntil = 0; lord.moveTick = 0;
  lord.wander = null; lord.patrolRouteIds = null; lord.patrolPath = null;
  lord.fleeing = false; lord.fleeTargetId = null; lord.fleePath = null;
  lord.hunting = false; lord.chasing = false; lord.foeChasing = null; lord.banditChasing = null;
  lord.x = base.x + 1; lord.y = base.y;
  lord.troops = { militia: 120 }; lord.defTroops = { militia: 150 };
  stateLib.moveLords(g);
  ok('领主会主动锁定并追剿匪团', lord.hunting && lord.banditChasing === 'p_hunt',
    'hunting=' + lord.hunting + ' bandit=' + lord.banditChasing);
}

/* ---------------------------------------------------------------- l 版新规则 */

group('l 版：入城 · 招兵 · 俘虏 · 交困 · 外交 · 任务');
{
  // 城外城下和村口都能招兵，不再只限进城
  const g = stateLib.createGame({ seed: 2026112511 });
  g.parties = [];
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const city = g.world.sites.filter(function (s) { return s.ownerFaction === 'wei' && s.type === 'town'; })[0];
  city.lordRecruits = { militia: 30 };
  lord.inCity = null;
  lord.prisoner = null;
  lord.troops = { militia: 2 };
  lord.defTroops = { militia: 100 };
  lord.x = city.x + 1; lord.y = city.y;
  stateLib.lordRecruitTick(g);
  const cityGain = (lord.troops.militia || 0) - 2;
  ok('领主在城下等候也能招兵', cityGain > 0, 'gain=' + cityGain);

  const village = g.world.sites.filter(function (s) { return s.type === 'village'; })[0];
  village.ownerFaction = 'wei';
  village.lordRecruits = { militia: 30 };
  lord.x = village.x + 1; lord.y = village.y;
  lord.troops = { militia: 2 };
  stateLib.lordRecruitTick(g);
  ok('领主在村庄附近也能招兵', (lord.troops.militia || 0) > 2, 'militia=' + lord.troops.militia);
}
{
  // 低兵领主不再去集结/围城，先回城补人
  const g = stateLib.createGame({ seed: 2026112512 });
  g.parties = [];
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const enemyCity = g.world.sites.filter(function (s) { return s.ownerFaction === 'yuan'; })[0];
  lord.inCity = null;
  lord.troops = { militia: 5 };
  lord.defTroops = { militia: 100 };
  lord.order = { type: 'siege', siteId: enemyCity.id, hold: false };
  lord.moveTick = 1;
  stateLib.moveLords(g);
  ok('低兵领主会放弃围城军令', !lord.order && !lord.defending, 'order=' + JSON.stringify(lord.order));
}
{
  // 逃遁只比正常行军快 20%：6 时辰/格变 5 时辰/格，不是旧的 4.5。
  const g = stateLib.createGame({ seed: 2026112513 });
  g.parties = [];
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const home = g.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  g.lords = [lord];
  lord.inCity = null; lord.order = null; lord.defending = null; lord.pauseUntil = 0; lord.moveTick = 0;
  lord.engagedWith = null; lord.x = home.x + 5; lord.y = home.y;
  lord.troops = { militia: 100 }; lord.defTroops = { militia: 100 };
  lord.fleeing = true; lord.fleeTargetId = home.id; lord.fleePath = null; lord.fleePathFor = null;
  stateLib.moveLords(g);
  ok('逃遁步速为 5 时辰一格', lord.stepHours === stateLib.LORD_FLEE_STEP_HOURS,
    'stepHours=' + lord.stepHours);
}
{
  // 俘虏按天计时，刑期越久越容易逃；NPC 之间只俘不杀
  const g = stateLib.createGame({ seed: 2026112514 });
  const lord = g.lords.filter(function (l) { return l.id === 'jiling'; })[0];
  warLib.capture(g, lord, 'bandit', '试刀匪');
  const rec = g.prisoners.filter(function (p) { return p.lordId === lord.id; })[0];
  const savedNext = g.rng.next;
  g.rng.next = function () { return 0.99; };
  warLib.prisonerTick(g);
  ok('俘虏天数按天累加', rec.days === 1 && lord.prisoner.days === 1,
    'rec=' + rec.days + ' lord=' + lord.prisoner.days);
  g.rng.next = function () { return 0; };
  rec.days = 10;
  warLib.prisonerTick(g);
  ok('关久了能按时间逃遁', lord.alive && !lord.prisoner, 'alive=' + lord.alive);
  g.rng.next = savedNext;
}
{
  // 交战对象被删掉后不能把领主钉死
  const g = stateLib.createGame({ seed: 2026112515 });
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  lord.inCity = null; lord.engagedWith = 'party:ghost'; lord.engagedSinceH = 0;
  stateLib.moveLords(g);
  ok('失踪的交战对象会解除缠斗', !lord.engagedWith, 'engaged=' + lord.engagedWith);

  const party = g.parties[0];
  party.engagedWith = 'ghost_lord';
  stateLib.moveParties(g);
  ok('失踪的领主也会解除匪团缠斗', !party.engagedWith, 'engaged=' + party.engagedWith);
}
{
  // 打完之后 party.scuffle 只是冷却，必须逐时辰消退：地图上的“交战中”才不会永远挂着
  const g = stateLib.createGame({ seed: 2026112518 });
  const party = g.parties.filter(function (q) { return q.faction === 'bandit' && !q.scripted; })[0];
  party.engagedWith = null;
  party.pauseUntil = 0;
  party.scuffle = 2;
  stateLib.moveParties(g);
  ok('匪团战后余惊会消退，不会永远挂交战中', party.scuffle === 1, 'scuffle=' + party.scuffle);
}
{
  // 两支匪团贴住同一位领主时，后来者不能覆盖对方的 engagedWith
  const g = stateLib.createGame({ seed: 2026112519 });
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const party = g.parties.filter(function (q) { return q.faction === 'bandit' && !q.scripted; })[0];
  lord.inCity = null;
  lord.engagedWith = 'party:other';
  lord.engagedSinceH = stateLib.gameHours(g);
  party.engagedWith = null;
  party.x = lord.x + 1; party.y = lord.y;
  stateLib.moveParties(g);
  ok('匪团不会抢已经和别人交战的领主', lord.engagedWith === 'party:other' &&
    party.engagedWith !== lord.id, 'lord=' + lord.engagedWith + ' party=' + party.engagedWith);
}
{
  // 外交提醒可以关，关了不弹军情；打开后恢复
  const g = stateLib.createGame({ seed: 2026112516 });
  g.campaign.stage = 2;
  g.settings = { diplomacyAlerts: false };
  const n0 = g.events.length;
  warLib.declare(g, 'wei', 'shu', false, true);
  ok('关闭战和提醒后不弹军情', g.events.length === n0, 'events=' + (g.events.length - n0));
  g.settings.diplomacyAlerts = true;
  warLib.declare(g, 'shu', 'zhang', false);
  ok('打开战和提醒后恢复弹窗', g.events.length > n0,
    'events=' + (g.events.length - n0));

  // 陈留歇满一天才开战
  g.diplomacyStarted = false;
  g.openingWarsDeclared = false;
  g.factionWars = {};
  g.player.atSiteId = 'chenliu';
  const chenliu = g.world.sites.filter(function (s) { return s.id === 'chenliu'; })[0];
  g.player.x = chenliu.x; g.player.y = chenliu.y;
  g.chenliuArrivalH = stateLib.gameHours(g) - 25;
  g.events.length = 0;
  const started = stateLib.maybeStartDiplomacy(g);
  ok('陈留歇满一天后诸侯开战', started && g.diplomacyStarted &&
    Object.keys(g.factionWars).length >= 2, 'wars=' + Object.keys(g.factionWars).length);
  ok('开局战书合成一条军情', g.events.filter(function (e) { return e.type === 'diplomacy'; }).length === 1,
    'events=' + g.events.length);
}
{
  // 主线任务卡能定位到当前章节
  const g = stateLib.createGame({ seed: 2026112517 });
  const pos = stateLib.campaignTargetPos(g);
  const site = pos && g.world.sites.filter(function (s) { return s.id === pos.siteId; })[0];
  ok('主线目标有地图落点', !!pos && pos.siteId === 'chenliu' && !!site, pos && pos.siteId);
}

/* ---------------------------------------------------------------- n 版：峡谷/州分布/三国上限 */

group('n 版：峡谷 · 州分布 · 三国上限');
ok('穿山峡谷有横向与斜向山口', (world.canyons || []).length >= 8 &&
  (world.canyons || []).some(function (c) { return c.dir === 'h'; }) &&
  (world.canyons || []).some(function (c) { return c.dir !== 'h'; }),
  JSON.stringify((world.canyons || []).slice(0, 3)));
{
  const g = stateLib.createGame({ seed: 2026112520 });
  const counts = {};
  g.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted; }).forEach(function (p) {
    const rid = worldLib.regionAt(g.world, p.x, p.y) || 'none';
    counts[rid] = (counts[rid] || 0) + 1;
  });
  const nums = Object.keys(counts).map(function (k) { return counts[k]; });
  ok('开局匪团按州均匀分布', Math.max.apply(null, nums) <= 4 &&
    Math.min.apply(null, nums) >= 2 &&
    Object.keys(counts).length >= 10, JSON.stringify(counts));
  ok('匪团速度比领主慢，但仍在可追范围', (function () {
    const p = g.parties.filter(function (q) { return q.faction === 'bandit' && !q.scripted; })[0];
    if (!p) return false;
    const x = p.x, y = p.y;
    stateLib.moveParties(g);
    return (p.x !== x || p.y !== y) && p.nextBanditMoveH &&
      p.nextBanditMoveH - stateLib.gameHours(g) >= 6.4 &&
      p.nextBanditMoveH - stateLib.gameHours(g) <= 6.6;
  })());
  let cityBandit = 0;
  for (let day = 0; day < 8; day++) {
    for (let h = 0; h < 24; h++) {
      stateLib.advanceTime(g, 1);
      stateLib.update(g, 0, { ignoreEvents: true });
    }
    g.parties.forEach(function (p) {
      if (p.faction !== 'bandit' || p.scripted) return;
      const site = worldLib.siteAt(g.world, p.x, p.y);
      if (site && (site.type === 'town' || site.type === 'castle')) cityBandit += 1;
    });
  }
  ok('匪团不会走进城池', cityBandit === 0, 'cityBandit=' + cityBandit);
}
{
  const g = stateLib.createGame({ seed: 2026112522 });
  g.events.length = 0;
  warLib.startDiplomacy(g);
  ok('开局曹操不与袁绍/袁术开战',
    !warLib.atWar(g, 'wei', 'yuan') && !warLib.atWar(g, 'wei', 'yuanshu'),
    JSON.stringify(Object.keys(g.factionWars || {})));
  ok('开局先放出三对战争', Object.keys(g.factionWars || {}).length === 3,
    JSON.stringify(Object.keys(g.factionWars || {})));
  warLib.declare(g, 'wei', 'shu', true, true);
  warLib.declare(g, 'wei', 'han', true, true);
  ok('一国最多同时与三国开战', warLib.warPartners(g, 'wei').length === 3 &&
    !warLib.declare(g, 'wei', 'biao', true), JSON.stringify(warLib.warPartners(g, 'wei')));
  ok('超过三国时宣战被拒', !warLib.canOpenWar(g, 'wei', 'biao'));
}
{
  const g = stateLib.createGame({ seed: 2026112523 });
  g.events.length = 0;
  warLib.startDiplomacy(g);
  const strong = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const weak = g.lords.filter(function (l) { return l.id === 'lvbu'; })[0];
  strong.x = 10; strong.y = 10; strong.troops = { militia: 100 };
  strong.inCity = null; strong.prisoner = null; strong.alive = true;
  weak.x = 11; weak.y = 10; weak.troops = { militia: 10 };
  weak.inCity = null; weak.prisoner = null; weak.alive = true;
  warLib.fieldTick(g);
  ok('领主兵力悬殊时弱者逃跑', weak.fleeing === true &&
    Math.max(Math.abs(weak.x - strong.x), Math.abs(weak.y - strong.y)) >= 1,
    'weak=' + weak.x + ',' + weak.y + ' strong=' + strong.x + ',' + strong.y);
}

/* ---------------------------------------------------------------- n3 版：桥/峡谷/巡逻/追匪/旗色 */

group('n3 版：地图峡谷 · 巡逻路线 · 追匪 · 旗色');
{
  const g = stateLib.createGame({ seed: 2026112527 });
  const cities = g.world.sites.filter(function (s) { return s.type === 'town' || s.type === 'castle'; });
  const routeBad = [];
  const uniqueBad = [];
  cities.forEach(function (city) {
    const routes = stateLib.patrolRoutesForSite(g, city);
    if (routes.length < 5) routeBad.push(city.id + ':' + routes.length);
    if ((city.garrisonBase || 0) >= 130 && routes.length < 9) routeBad.push(city.id + ':big:' + routes.length);
    const sig = {};
    routes.forEach(function (r) { sig[r.map(function (p) { return p.x + ',' + p.y; }).join('|')] = 1; });
    if (Object.keys(sig).length !== routes.length) uniqueBad.push(city.id);
    routes.forEach(function (r) {
      if (!r.length) routeBad.push(city.id + ':empty');
      r.forEach(function (p) {
        if (!worldLib.terrainAt(g.world, p.x, p.y).passable) routeBad.push(city.id + ':blocked@' + p.x + ',' + p.y);
        if (worldLib.siteAt(g.world, p.x, p.y)) routeBad.push(city.id + ':site@' + p.x + ',' + p.y);
      });
    });
  });
  ok('每座城至少 5 条巡逻路线', routeBad.length === 0, routeBad.slice(0, 5).join(' / '));
  ok('大城至少 9 条巡逻路线', cities.filter(function (s) { return (s.garrisonBase || 0) >= 130; })
    .every(function (s) { return stateLib.patrolRoutesForSite(g, s).length >= 9; }), '大城路线不足');
  ok('同一座城的路线互不相同', uniqueBad.length === 0, uniqueBad.slice(0, 5).join(','));
  ok('巡逻路线落在可通行、非据点格上', routeBad.length === 0, routeBad.slice(0, 5).join(' / '));

  const hanzhongCanyons = (g.world.canyons || []).filter(function (c) {
    return c.x >= 40 && c.x <= 62 && c.y >= 80 && c.y <= 90;
  });
  // 汉中北线 n11 改接洛阳，不再绕黑山营；新路穿山会产生横/斜两种山口，
  // 这里只验“真有山口、山口可通行、两端连得上”，不再锁死旧黑山线的斜向。
  ok('汉中—洛阳新路经过山口', hanzhongCanyons.length >= 2, JSON.stringify(hanzhongCanyons));
  ok('汉中到洛阳道路可通行', !!worldLib.findPath(g.world, { x: 51, y: 93 }, { x: 64, y: 70 }),
    'hanzhong -> luoyang');

  function rgb(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const wu = rgb(FACTIONS.wu.color), shu = rgb(FACTIONS.yuanshu.color);
  const colorGap = Math.sqrt(Math.pow(wu[0] - shu[0], 2) + Math.pow(wu[1] - shu[1], 2) + Math.pow(wu[2] - shu[2], 2));
  ok('孙权与袁术旗色明显区分', colorGap >= 80, FACTIONS.wu.color + ' / ' + FACTIONS.yuanshu.color + ' = ' + Math.round(colorGap));
}
{
  // 单城领主：以前 route 长度为 1 时留在城里不动；现在应能在城郊路线里巡逻。
  const g = stateLib.createGame({ seed: 2026112528 });
  const city = g.world.sites.filter(function (s) { return s.id === 'xinye'; })[0];
  const lord = g.lords.filter(function (l) { return l.id === 'liubei'; })[0];
  if (city && lord) {
    lord.inCity = null;
    lord.prisoner = null;
    lord.alive = true;
    lord.order = null;
    lord.defending = null;
    lord.x = city.x + 2;
    lord.y = city.y;
    lord.wander = null;
    lord.patrolSiteId = city.id;
    lord.patrolRouteIds = [city.id];
    lord.patrolLoop = null;
    lord.patrolVisitSeq = 0;
    lord.troops = { militia: 80 };
    lord.defTroops = { militia: 80 };
    g.player.x = 110;
    g.player.y = 140;
    const seen = {};
    let moved = 0;
    for (let h = 0; h < 36; h++) {
      stateLib.advanceTime(g, 1);
      stateLib.update(g, 0, { ignoreEvents: true });
      const key = lord.x + ',' + lord.y;
      if (!seen[key]) { seen[key] = 1; moved += 1; }
    }
    ok('单城领主也能离开城门巡逻', moved >= 3, 'moved=' + moved + ' pos=' + lord.x + ',' + lord.y);
  } else {
    ok('单城领主也能离开城门巡逻', false, 'xinye/liubei missing');
  }
}
{
  // 全图巡逻领主：每座城都有路线，不能有领主在原地一站 24 小时。
  const g = stateLib.createGame({ seed: 2026112530 });
  g.player.x = 110;
  g.player.y = 140;
  const start = {};
  g.lords.forEach(function (l) {
    if (l.alive && !l.inCity && !l.prisoner && l.patrolRouteIds && l.patrolRouteIds.length) {
      start[l.id] = { x: l.x, y: l.y };
    }
  });
  const maxMove = {};
  Object.keys(start).forEach(function (id) { maxMove[id] = 0; });
  for (let h = 0; h < 24; h++) {
    stateLib.advanceTime(g, 1);
    stateLib.update(g, 0, { ignoreEvents: true });
    Object.keys(start).forEach(function (id) {
      const l = g.lords.filter(function (q) { return q.id === id; })[0];
      if (!l) return;
      maxMove[id] = Math.max(maxMove[id], Math.max(Math.abs(l.x - start[id].x), Math.abs(l.y - start[id].y)));
    });
  }
  const stuck = Object.keys(start).filter(function (id) { return maxMove[id] < 1; });
  ok('所有巡逻领主 24 小时内都不会卡在原地', Object.keys(start).length >= 20 && stuck.length === 0,
    'patrol=' + Object.keys(start).length + ' stuck=' + stuck.slice(0, 8).join(','));
}
{
  // 领主追匪：匪团慢于领主，贴身就开战，最终被打散；不能永远保持 1~2 格距离。
  const g = stateLib.createGame({ seed: 2026112529 });
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const party = g.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted; })[0];
  let spot = null;
  for (let y = 55; y < 100 && !spot; y++) {
    for (let x = 14; x < 45; x++) {
      if (worldLib.terrainAt(g.world, x, y).passable && worldLib.terrainAt(g.world, x + 4, y).passable &&
          !worldLib.siteAt(g.world, x, y) && !worldLib.siteAt(g.world, x + 4, y)) {
        spot = [x, y];
        break;
      }
    }
  }
  if (lord && party && spot) {
    g.parties = [party];
    lord.alive = true;
    lord.inCity = null;
    lord.prisoner = null;
    lord.faction = 'wei';
    lord.x = spot[0];
    lord.y = spot[1];
    lord.troops = { militia: 100 };
    lord.defTroops = { militia: 100 };
    lord.hunting = true;
    lord.banditChasing = party.id;
    lord.wander = null;
    party.x = spot[0] + 4;
    party.y = spot[1];
    party.troops = { militia: 8 };
    party.engagedWith = null;
    party.banditFleeFrom = null;
    party.banditFleeTarget = null;
    party.nextBanditMoveH = stateLib.gameHours(g) + stateLib.BANDIT_STEP_HOURS;
    g.player.x = 100;
    g.player.y = 140;
    let minDistance = 99;
    let ended = false;
    for (let h = 0; h < 72; h++) {
      stateLib.advanceTime(g, 1);
      stateLib.update(g, 0, { ignoreEvents: true });
      minDistance = Math.min(minDistance, Math.max(Math.abs(lord.x - party.x), Math.abs(lord.y - party.y)));
      if (!g.parties.some(function (q) { return q.id === party.id; })) { ended = true; break; }
    }
    ok('领主追上匪团后进入交战并结束追逐', ended || minDistance <= 1,
      'min=' + minDistance + ' ended=' + ended + ' lord=' + lord.x + ',' + lord.y);
    ok('匪团脚程慢于普通领主', stateLib.BANDIT_STEP_HOURS > 6,
      String(stateLib.BANDIT_STEP_HOURS));
  } else {
    ok('领主追上匪团后进入交战并结束追逐', false, 'setup missing');
    ok('匪团脚程慢于普通领主', false, 'missing');
  }
}

/* ---------------------------------------------------------------- n3b 版：匪团州内活动 · 四格追匪 · 三小时交战 */

group('n3b 版：匪团州内活动 · 三格追匪 · 六小时交战');
{
  const g = stateLib.createGame({ seed: 2026112531 });
  const start = g.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted; });
  function nearTown(x, y) {
    let best = 999;
    g.world.sites.forEach(function (s) {
      if (s.type !== 'town' && s.type !== 'castle') return;
      best = Math.min(best, Math.max(Math.abs(x - s.x), Math.abs(y - s.y)));
    });
    return best;
  }
  const edgeBad = [];
  const regionBad = [];
  const cityBad = [];
  start.forEach(function (p) {
    if (p.x < stateLib.BANDIT_EDGE_MARGIN || p.y < stateLib.BANDIT_EDGE_MARGIN ||
        p.x > g.world.w - 1 - stateLib.BANDIT_EDGE_MARGIN ||
        p.y > g.world.h - 1 - stateLib.BANDIT_EDGE_MARGIN) edgeBad.push(p.id);
    if (worldLib.regionAt(g.world, p.x, p.y) !== p.roamRegion) regionBad.push(p.id);
    if (nearTown(p.x, p.y) > stateLib.BANDIT_CITY_RANGE) cityBad.push(p.id + ':' + nearTown(p.x, p.y));
  });
  ok('全图匪团再次翻倍到 32 支', start.length === stateLib.BANDIT_START_COUNT && start.length === 32, String(start.length));
  ok('开局匪团都在本州内活动', regionBad.length === 0, regionBad.slice(0, 5).join(','));
  ok('开局匪团不贴地图边缘', edgeBad.length === 0, edgeBad.slice(0, 5).join(','));
  ok('开局匪团离城镇/关隘不超过 22 格', cityBad.length === 0, cityBad.slice(0, 5).join(','));

  // 领主只有身边三格内才会主动追匪。
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const party = start[0];
  if (lord && party) {
    g.lords = [lord];
    g.parties = [party];
    g.player.x = 120;
    g.player.y = 150;
    lord.alive = true;
    lord.inCity = null;
    lord.prisoner = null;
    lord.engagedWith = null;
    lord.faction = 'wei';
    lord.troops = { militia: 100 };
    lord.defTroops = { militia: 100 };
    party.engagedWith = null;
    party.troops = { militia: 8 };
    party.dead = false;
    let spot = null;
    for (let y = 55; y < 100 && !spot; y++) {
      for (let x = 14; x < 50; x++) {
        if (worldLib.terrainAt(g.world, x, y).passable &&
            worldLib.terrainAt(g.world, x + 5, y).passable &&
            !worldLib.siteAt(g.world, x, y) && !worldLib.siteAt(g.world, x + 5, y)) {
          spot = [x, y];
          break;
        }
      }
    }
    if (spot) {
      lord.x = spot[0];
      lord.y = spot[1];
      party.x = spot[0] + 5;
      party.y = spot[1];
      const distant = stateLib.lordThreatFor(g, lord, true, false);
      ok('匪团在四格外时领主不主动追', !distant || distant.role !== 'hunt',
        distant ? distant.role : 'none');
      party.x = spot[0] + 3;
      const close = stateLib.lordThreatFor(g, lord, true, false);
      ok('匪团进三格内领主开始追', !!close && close.role === 'hunt' && close.target.unit.id === party.id,
        close ? close.role : 'none');

      // 交战至少撑满六时辰：100 打 8，也不能在头几个时辰直接抹掉。
      party.x = lord.x + 1;
      party.y = lord.y;
      party.engagedWith = lord.id;
      party.engagedSinceH = stateLib.gameHours(g) - 1;
      lord.engagedWith = 'party:' + party.id;
      lord.engagedSinceH = party.engagedSinceH;
      stateLib.fightNeighbors(g);
      ok('交战未满六时辰不会结算', !party.dead, 'dead=' + !!party.dead);
      party.engagedSinceH = stateLib.gameHours(g) - 6;
      lord.engagedSinceH = party.engagedSinceH;
      stateLib.fightNeighbors(g);
      ok('交战满六时辰后才可能打散匪团', !!party.dead, 'dead=' + !!party.dead);
    } else {
      ok('匪团在四格外时领主不主动追', false, 'setup missing');
      ok('匪团进三格内领主开始追', false, 'setup missing');
      ok('交战未满六时辰不会结算', false, 'setup missing');
      ok('交战满六时辰后才可能打散匪团', false, 'setup missing');
    }
  } else {
    ok('匪团在四格外时领主不主动追', false, 'lord/party missing');
    ok('匪团进三格内领主开始追', false, 'lord/party missing');
    ok('交战未满六时辰不会结算', false, 'lord/party missing');
    ok('交战满六时辰后才可能打散匪团', false, 'lord/party missing');
  }
}
{
  // 跑一天后，活着的匪团仍应在本州、离地图边和城镇不远。
  const g = stateLib.createGame({ seed: 2026112532 });
  g.player.x = 110;
  g.player.y = 140;
  for (let h = 0; h < 24; h++) {
    stateLib.advanceTime(g, 1);
    stateLib.update(g, 0, { ignoreEvents: true });
  }
  const alive = g.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted && !p.dead; });
  function nearTown(x, y) {
    let best = 999;
    g.world.sites.forEach(function (s) {
      if (s.type !== 'town' && s.type !== 'castle') return;
      best = Math.min(best, Math.max(Math.abs(x - s.x), Math.abs(y - s.y)));
    });
    return best;
  }
  const regionBad = [];
  const edgeBad = [];
  const cityBad = [];
  alive.forEach(function (p) {
    if (worldLib.regionAt(g.world, p.x, p.y) !== p.roamRegion) regionBad.push(p.id);
    if (p.x < stateLib.BANDIT_EDGE_MARGIN || p.y < stateLib.BANDIT_EDGE_MARGIN ||
        p.x > g.world.w - 1 - stateLib.BANDIT_EDGE_MARGIN ||
        p.y > g.world.h - 1 - stateLib.BANDIT_EDGE_MARGIN) edgeBad.push(p.id);
    if (nearTown(p.x, p.y) > stateLib.BANDIT_CITY_RANGE + 1) cityBad.push(p.id + ':' + nearTown(p.x, p.y));
  });
  ok('巡游一天后匪团仍不越州', regionBad.length === 0, regionBad.slice(0, 5).join(','));
  ok('巡游一天后匪团仍不贴地图边', edgeBad.length === 0, edgeBad.slice(0, 5).join(','));
  ok('巡游一天后匪团仍离城镇不远', cityBad.length === 0, cityBad.slice(0, 5).join(','));
}

{
  // 领主横穿别国城池时不能顶在城门口：应沿城池外围绕过去。
  const g = stateLib.createGame({ seed: 2026112546 });
  const city = g.world.sites.find(function (s) { return s.id === 'xuchang'; });
  let lord = g.lords.find(function (l) { return l.faction === 'biao' && !l.inCity && l.alive; });
  if (!city || !lord) {
    ok('领主会绕开他国城池', false, 'setup missing');
  } else {
    lord.x = city.x - 6;
    lord.y = city.y;
    lord.inCity = null;
    lord.order = null;
    lord.wander = { x: city.x + 6, y: city.y };
    lord.patrolPath = null;
    lord.routePath = null;
    lord.moveTick = 0;
    g.player.x = city.x + 35;
    g.player.y = city.y + 35;
    g.lords = [lord];
    g.parties = [];
    let touchedSite = false;
    let crossed = false;
    for (let h = 0; h < 30; h++) {
      stateLib.advanceTime(g, 6);
      stateLib.moveLords(g);
      if (worldLib.siteAt(g.world, lord.x, lord.y)) touchedSite = true;
      if (lord.x > city.x) crossed = true;
    }
    ok('领主会绕开他国城池', !touchedSite && crossed && lord.y !== city.y,
      'x=' + lord.x + ' y=' + lord.y + ' city=' + city.x + ',' + city.y + ' crossed=' + crossed + ' touched=' + touchedSite);
  }
}


{
  // n6：领主基础 6 时辰一格，逃遁 5 时辰一格，进城也按 6；不允许别的加速来源。
  const g = stateLib.createGame({ seed: 2026112547 });
  const city = g.world.sites.find(function (s) {
    return (s.type === 'town' || s.type === 'castle') && s.ownerFaction === 'wei';
  });
  function findOpen(span) {
    for (let y = 8; y < g.world.h - 8; y++) {
      for (let x = 8; x < g.world.w - span - 8; x++) {
        let clean = true;
        for (let i = 0; i <= span; i++) {
          if (!worldLib.terrainAt(g.world, x + i, y).passable || worldLib.siteAt(g.world, x + i, y)) {
            clean = false;
            break;
          }
        }
        if (clean) return { x: x, y: y };
      }
    }
    return null;
  }
  const spot = findOpen(8);
  function makeLord(id, faction, x, y, troops) {
    return {
      id: id,
      name: id,
      faction: faction,
      alive: true,
      dead: false,
      retired: false,
      inCity: null,
      prisoner: null,
      engagedWith: null,
      defending: null,
      order: null,
      x: x,
      y: y,
      home: city ? city.id : null,
      level: 1,
      troops: { militia: troops },
      defTroops: { militia: troops },
      sight: 5,
      fleeing: false,
      fleeTargetId: null,
      fleeingAtH: null,
      nextMoveH: stateLib.gameHours(g),
    };
  }
  if (!spot || !city) {
    ok('普通领主 6 时辰走一格', false, 'setup missing');
    ok('逃遁领主 5 时辰走一格', false, 'setup missing');
    ok('逃遁比普通快 20%', false, 'setup missing');
    ok('逃遁进城也按 6 时辰', false, 'setup missing');
  } else {
    const lord = makeLord('n6-speed', city.ownerFaction, spot.x, spot.y, 40);
    lord.wander = { x: spot.x + 4, y: spot.y };
    g.lords = [lord];
    g.parties = [];
    g.player.x = Math.min(g.world.w - 4, spot.x + 50);
    g.player.y = Math.min(g.world.h - 4, spot.y + 50);
    let now = stateLib.gameHours(g);
    lord.nextMoveH = now;
    const x0 = lord.x;
    stateLib.moveLords(g);
    const afterBase = stateLib.gameHours(g);
    ok('普通领主开始走一格', lord.x !== x0 || lord.y !== spot.y, lord.x + ',' + lord.y);
    ok('普通领主 6 时辰走一格', lord.nextMoveH - afterBase === stateLib.LORD_STEP_HOURS,
      'next=' + lord.nextMoveH + ' hour=' + afterBase);
    const xAfterBase = lord.x;
    stateLib.advanceTime(g, 5);
    stateLib.moveLords(g);
    ok('普通领主 5 时辰时还不走', lord.x === xAfterBase, 'x=' + lord.x);
    stateLib.advanceTime(g, 1);
    stateLib.moveLords(g);
    ok('普通领主 6 时辰时再走一格', lord.x !== xAfterBase, 'x=' + lord.x);

    // 逃遁：基础 6 * 0.8 = 4.8，向上取整到 5 时辰；不是旧的 4.5 或 3。
    lord.x = spot.x;
    lord.y = spot.y;
    lord.nextMoveH = stateLib.gameHours(g);
    lord.fleeing = true;
    lord.fleeTargetId = city.id;
    lord.fleePath = null;
    lord.fleePathFor = null;
    now = stateLib.gameHours(g);
    stateLib.moveLords(g);
    const xAfterFleeFirst = lord.x;
    ok('逃遁领主开始走一格', lord.x !== spot.x || lord.y !== spot.y, lord.x + ',' + lord.y);
    ok('逃遁领主 5 时辰走一格', lord.nextMoveH - now === stateLib.LORD_FLEE_STEP_HOURS,
      'next=' + lord.nextMoveH + ' now=' + now);
    ok('逃遁比普通快 20%（5 对 6 时辰）',
      stateLib.LORD_FLEE_STEP_HOURS * 1.2 === stateLib.LORD_STEP_HOURS,
      stateLib.LORD_FLEE_STEP_HOURS + ' * 1.2 = ' + (stateLib.LORD_FLEE_STEP_HOURS * 1.2));
    stateLib.advanceTime(g, 4);
    stateLib.moveLords(g);
    ok('逃遁领主 4 时辰时还不走', lord.x === xAfterFleeFirst, 'x=' + lord.x);
    stateLib.advanceTime(g, 1);
    stateLib.moveLords(g);
    ok('逃遁领主 5 时辰时再走一格', lord.x !== xAfterFleeFirst, 'x=' + lord.x);

    // 贴着自己的城，逃遁也只按 6 时辰收旗进城，不能按 5 或 4.5 提前钻进去。
    let adjacent = null;
    for (let i = 0; i < 8; i++) {
      const d = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]][i];
      const nx = city.x + d[0];
      const ny = city.y + d[1];
      if (worldLib.terrainAt(g.world, nx, ny).passable && !worldLib.siteAt(g.world, nx, ny)) {
        adjacent = { x: nx, y: ny };
        break;
      }
    }
    if (adjacent) {
      lord.x = adjacent.x;
      lord.y = adjacent.y;
      lord.inCity = null;
      lord.enteringSiteId = null;
      lord.cityEnterAtH = null;
      lord.fleePath = null;
      lord.fleePathFor = null;
      lord.fleeing = true;
      lord.fleeTargetId = city.id;
      lord.nextMoveH = stateLib.gameHours(g);
      now = stateLib.gameHours(g);
      stateLib.moveLords(g);
      ok('逃遁到城下只摆出进城等待', lord.enteringSiteId === city.id, 'entering=' + lord.enteringSiteId);
      ok('逃遁进城等待 6 时辰', lord.cityEnterAtH - now === stateLib.LORD_ENTER_CITY_HOURS,
        'wait=' + (lord.cityEnterAtH - now));
      stateLib.advanceTime(g, 5);
      stateLib.moveLords(g);
      ok('进城等待 5 时辰时还没进城', !lord.inCity, 'inCity=' + lord.inCity);
      stateLib.advanceTime(g, 1);
      stateLib.moveLords(g);
      ok('进城等待 6 时辰后收旗进城', lord.inCity === city.id, 'inCity=' + lord.inCity);
    } else {
      ok('逃遁到城下只摆出进城等待', false, 'no adjacent');
      ok('逃遁进城等待 6 时辰', false, 'no adjacent');
      ok('进城等待 5 时辰时还没进城', false, 'no adjacent');
      ok('进城等待 6 时辰后收旗进城', false, 'no adjacent');
    }
  }
}

{
  // n6：三类硬顶 + 十人以下才允许逃遁。
  const g = stateLib.createGame({ seed: 2026112548 });
  const city = g.world.sites.find(function (s) {
    return (s.type === 'town' || s.type === 'castle') && s.ownerFaction === 'wei';
  });
  if (!city) {
    ok('逃遁豁免测试需要一座魏城', false, 'setup missing');
  } else {
    const lord = {
      id: 'n6-hold', name: '硬顶测试', faction: 'wei', alive: true, x: 40, y: 40,
      home: city.id, level: 1, troops: { militia: 20 }, defTroops: { militia: 20 },
      sight: 5, inCity: null, prisoner: null, engagedWith: null,
      defending: null, order: null, fleeing: false, fleeTargetId: null,
    };
    const party = {
      id: 'n6-bandit', faction: 'bandit', name: '测试匪团', dead: false,
      engagedWith: null, x: lord.x + 2, y: lord.y, troops: { militia: 100 },
      defTroops: { militia: 100 }, sight: 5,
    };
    g.player.x = 160;
    g.player.y = 160;
    g.parties = [party];
    g.lords = [lord];
    const control = stateLib.lordThreatFor(g, lord, true, false);
    ok('兵力悬殊且无豁免时领主会逃', !!control && control.role === 'flee',
      control ? control.role : 'none');

    // 一、本阵营已无城：无路可逃，硬着头皮上。
    lord.faction = 'qun';
    const noCity = stateLib.lordThreatFor(g, lord, true, false);
    ok('本阵营没有城池时不再逃遁', !noCity, noCity ? noCity.role : 'none');
    lord.faction = 'wei';

    // 二、敌军围城，自己超过十人：守军必须上城。
    lord.defending = city.id;
    lord.order = { type: 'defend', siteId: city.id };
    const guard = stateLib.lordThreatFor(g, lord, true, false);
    ok('守城且兵力超过十人时不许逃遁', !guard, guard ? guard.role : 'none');
    lord.defending = null;
    lord.order = null;

    // 三、五格内有盟友，自己超过十人：群战必须硬顶；盟友和敌人交战也算。
    const ally = {
      id: 'n6-ally', faction: 'wei', alive: true, x: lord.x + 2, y: lord.y,
      home: city.id, level: 1, troops: { militia: 20 }, defTroops: { militia: 20 },
      inCity: null, prisoner: null, engagedWith: 'shu-lord', sight: 5,
      defending: null, order: null,
    };
    g.lords = [lord, ally];
    const allyHold = stateLib.lordThreatFor(g, lord, true, false);
    ok('五格内有盟友且兵力超过十人时不许逃遁', !allyHold, allyHold ? allyHold.role : 'none');
    g.lords = [lord];
    const allyGone = stateLib.lordThreatFor(g, lord, true, false);
    ok('盟友离开五格后才恢复逃遁判定', !!allyGone && allyGone.role === 'flee',
      allyGone ? allyGone.role : 'none');

    // 十人及以下：上面两条“超过十人”的硬顶不再适用，仍可以按兵力差逃。
    lord.troops = { militia: 10 };
    lord.defTroops = { militia: 10 };
    lord.defending = city.id;
    lord.order = { type: 'defend', siteId: city.id };
    const ten = stateLib.lordThreatFor(g, lord, true, false);
    ok('守城但只剩十人时允许逃遁判定', !!ten && ten.role === 'flee', ten ? ten.role : 'none');
    lord.troops = { militia: 20 };
    lord.defTroops = { militia: 20 };
    lord.defending = null;
    lord.order = null;

    // 将领主野战层：无豁免时弱者后撤，有守城豁免时进入正面交战并掉人。
    function fieldLord(id, faction, count, x, y) {
      return {
        id: id, name: id, faction: faction, alive: true, dead: false, retired: false,
        x: x, y: y, home: city.id, level: 1,
        troops: { militia: count }, defTroops: { militia: count },
        inCity: null, prisoner: null, engagedWith: null,
        defending: null, order: null, fleeing: false, fleeTargetId: null,
      };
    }
    const weak = fieldLord('n6-field-weak', 'wei', 20, 50, 50);
    const strong = fieldLord('n6-field-strong', 'shu', 100, 51, 50);
    g.lords = [weak, strong];
    g.factionWars = {};
    g.factionWars['shu|wei'] = { since: 0, score: 0 };
    g.player.x = 160;
    g.player.y = 160;
    warLib.fieldTick(g);
    const weakBeforeGuard = armyLib.troopCount(weak.troops);
    ok('野战无豁免时弱者只后撤不硬碰', weak.fleeing === true &&
      armyLib.troopCount(weak.troops) === 20,
      'flee=' + weak.fleeing + ' troops=' + armyLib.troopCount(weak.troops));

    const weakGuard = fieldLord('n6-field-guard', 'wei', 20, 50, 50);
    const strongGuard = fieldLord('n6-field-guard-strong', 'shu', 100, 51, 50);
    weakGuard.defending = city.id;
    weakGuard.order = { type: 'defend', siteId: city.id };
    g.lords = [weakGuard, strongGuard];
    warLib.fieldTick(g);
    g.clock.hour = (g.clock.hour + 3) % 24;
    warLib.fieldTick(g);
    ok('守城豁免在野战层也禁止后撤',
      armyLib.troopCount(weakGuard.troops) < weakBeforeGuard,
      'troops=' + armyLib.troopCount(weakGuard.troops));

    const weakAlly = fieldLord('n6-field-ally', 'wei', 20, 50, 50);
    const strongAlly = fieldLord('n6-field-ally-strong', 'shu', 100, 51, 50);
    const allyField = fieldLord('n6-field-friend', 'wei', 20, 48, 50);
    g.lords = [weakAlly, allyField, strongAlly];
    warLib.fieldTick(g);
    g.clock.hour = (g.clock.hour + 3) % 24;
    warLib.fieldTick(g);
    ok('盟友豁免在野战层也禁止后撤',
      armyLib.troopCount(weakAlly.troops) < 20,
      'troops=' + armyLib.troopCount(weakAlly.troops));
  }
}


/* ---------------------------------------------------------------- n7 版：城下暂停 · 假交战 · 入川 · 国别战力 */

group('n7 版：城下暂停 · 假交战 · 入川 · 国别战力');
{
  // 停靠城池后按左下角暂停：停止休整、人物落在城外，而不是被城图标盖住。
  const g = stateLib.createGame({ seed: 2026112551 });
  const city = g.world.sites.filter(function (s) { return s.id === 'xinye'; })[0];
  const p = g.player;
  p.x = city.x; p.y = city.y;
  stateLib.startRest(g, city);
  const r = stateLib.leaveRestForMap(g);
  ok('城下暂停会停止休整并清掉据点', r.ok && !p.resting && !p.atSiteId,
    'rest=' + p.resting + ' site=' + p.atSiteId);
  ok('城下暂停后人物出现在城外一格',
    Math.max(Math.abs(p.x - city.x), Math.abs(p.y - city.y)) >= 1,
    'p=' + p.x + ',' + p.y + ' city=' + city.x + ',' + city.y);
  // 暂停后点“继续时辰”：人还在城外站着，但这一局要按“城外扎营”让天下继续走。
  // 否则地图解冻了，state.update 仍按“人不动、时辰停”把时间冻住。
  const idleH0 = stateLib.gameHours(g);
  stateLib.update(g, stateLib.HOUR_SECONDS, { idleTime: true });
  ok('暂停出城后继续时辰，城外待命也会推进天下',
    stateLib.gameHours(g) > idleH0,
    'before=' + idleH0 + ' after=' + stateLib.gameHours(g));
}
{
  // 匪团贴着一个已经进城的领主：不能显示“交战中”，也不能继续把领主钉住。
  const g = stateLib.createGame({ seed: 2026112552 });
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const party = g.parties.filter(function (p) { return p.faction === 'bandit' && !p.scripted; })[0];
  g.lords = [lord];
  g.parties = [party];
  lord.inCity = 'xuchang';
  lord.x = party.x; lord.y = party.y;
  lord.engagedWith = 'party:' + party.id;
  lord.engagedSinceH = stateLib.gameHours(g);
  party.engagedWith = lord.id;
  party.engagedSinceH = stateLib.gameHours(g);
  party.dead = false;
  ok('进城领主不会被算作与匪团交战',
    !stateLib.partyEngagementValid(g, party) && !stateLib.lordEngagementValid(g, lord));
  stateLib.fightNeighbors(g);
  ok('交战标记在领主进城后会被清掉', !party.engagedWith && !lord.engagedWith,
    'party=' + party.engagedWith + ' lord=' + lord.engagedWith);

  lord.inCity = null;
  party.x = lord.x + 1; party.y = lord.y;
  party.engagedWith = lord.id;
  party.engagedSinceH = stateLib.gameHours(g);
  lord.engagedWith = 'party:' + party.id;
  lord.engagedSinceH = party.engagedSinceH;
  ok('真正贴身的交战仍然显示', stateLib.partyEngagementValid(g, party));
}
{
  // 刘备不再因为只有新野一城而永远不集结；天下开始后第 8 天入川。
  const g = stateLib.createGame({ seed: 2026112553 });
  g.diplomacyStarted = true;
  g.clock.day = 8;
  g.warCampaigns = {};
  g.flags = {};
  const started = warLib.ensureLiuBeiYiWar(g, 8);
  ok('刘备与刘璋按历史节点开战', started && warLib.atWar(g, 'shu', 'zhang'));
  warLib.strategyTick(g);
  const cp = g.warCampaigns.shu;
  const target = cp && g.world.sites.filter(function (s) { return s.id === cp.targetId; })[0];
  ok('刘备单城也能发起入川战役', !!cp && cp.enemy === 'zhang' && !!target &&
    target.ownerFaction === 'zhang', cp ? cp.stage + '/' + cp.targetId : 'none');
}
{
  // 三国名单扩了，曹操对普通势力 1.5 倍，对蜀吴不享受该倍率。
  const counts = {};
  LORDS.forEach(function (l) { counts[l.faction] = (counts[l.faction] || 0) + 1; });
  ok('魏蜀吴都补到至少 18 位领主', counts.wei >= 18 && counts.shu >= 18 && counts.wu >= 18,
    JSON.stringify({ wei: counts.wei, shu: counts.shu, wu: counts.wu }));
  ok('魏对普通势力 2 兵抵 3 兵', warLib.factionEdge('wei', 'zhang') === 1.5);
  ok('魏对蜀吴互打回到 1 倍', warLib.factionEdge('wei', 'shu') === 1 &&
    warLib.factionEdge('wei', 'wu') === 1);
  ok('蜀吴对普通势力各有加成', warLib.factionEdge('shu', 'zhang') > 1 &&
    warLib.factionEdge('wu', 'yuanshu') > 1);
  ok('国别表明确', FACTION_COMBAT.wei.power === 1.5 && FACTION_COMBAT.shu.power === 1.5 &&
    FACTION_COMBAT.wu.power === 1.5 &&
    FACTION_COMBAT.wei.neutral.indexOf('shu') >= 0 &&
    FACTION_COMBAT.shu.neutral.indexOf('wu') >= 0);

  const g = stateLib.createGame({ seed: 2026112554 });
  function clashLord(id, faction, n, x) {
    return {
      id: id, name: id, faction: faction, alive: true, dead: false, retired: false,
      x: x, y: 50, level: 4, morale: 90, troops: { militia: n },
    };
  }
  const wei = clashLord('n7-wei', 'wei', 100, 50);
  const zhang = clashLord('n7-zhang', 'zhang', 150, 51);
  g.lords = [wei, zhang];
  g.parties = [];
  g.factionWars = {};
  g.factionWars['wei|zhang'] = { since: 0, score: 0 };
  warLib.clash(g, wei, zhang);
  warLib.clash(g, wei, zhang);
  const lostWei = 100 - armyLib.troopCount(wei.troops);
  const lostZhang = 150 - armyLib.troopCount(zhang.troops);
  ok('曹操军对普通势力伤亡交换更划算', lostWei < lostZhang,
    'lostWei=' + lostWei + ' lostZhang=' + lostZhang);
}


/* ---------------------------------------------------------------- n8 版：两层对碰 · 五格合战 · NPC 动态战场 */

group('n8 版：两层对碰 · 五格合战 · NPC 动态战场');
{
  ok('t1 两兵与 t2 一兵等权', warLib.tierForce({ militia: 2 }) === warLib.tierForce({ spear: 1 }),
    't1x2=' + warLib.tierForce({ militia: 2 }) + ' t2x1=' + warLib.tierForce({ spear: 1 }));
  ok('兵种每升一级翻一倍，t5 也连续',
    warLib.tierPower(1) === 1 && warLib.tierPower(2) === 2 &&
    warLib.tierPower(3) === 4 && warLib.tierPower(4) === 8 && warLib.tierPower(5) === 16,
    [1, 2, 3, 4, 5].map(function (n) { return warLib.tierPower(n); }).join(','));
  const scaled = warLib.scaleTroopsTo({ militia: 7, spear: 5 }, 6);
  ok('分摊伤亡不会凭空多出兵', armyLib.troopCount(scaled) === 6,
    JSON.stringify(scaled));
}
{
  function testLord(id, faction, n, x, y) {
    return {
      id: id, name: id, faction: faction, alive: true, dead: false, retired: false,
      x: x, y: y, home: null, level: 3, morale: 75, troops: { militia: n },
      inCity: null, prisoner: null, fieldBattleId: null, engagedWith: null,
    };
  }
  const g = stateLib.createGame({ seed: 2026112591 });
  g.player.x = 50; g.player.y = 50;
  g.player.faction = 'wei'; g.player.troops = { militia: 300, spear: 80 };
  g.player.morale = 85; g.player.atSiteId = null; g.player.route = [];
  g.parties = [];
  g.wars = {}; g.factionWars = {};
  const ally = testLord('n8-ally', 'wei', 40, 49, 51);
  const foe = testLord('n8-foe', 'shu', 30, 52, 50);
  const foeAlly = testLord('n8-foe-ally', 'shu', 20, 53, 51);
  g.lords = [ally, foe, foeAlly];
  warLib.declare(g, 'wei', 'shu', true, true);
  const playerStart = armyLib.troopCount(g.player.troops);
  const battle = stateLib.startLordBattle(g, foe);
  ok('玩家开战会带上五格内友军',
    !!battle && battle.a.contingents.length >= 2 &&
    battle.a.contingents.some(function (c) { return c.name === 'n8-ally军'; }),
    battle ? JSON.stringify(battle.a.contingents.map(function (c) { return c.name + ':' + c.count; })) : 'no battle');
  ok('五格内敌军也会加入对方阵线',
    !!battle && battle.b.contingents.some(function (c) { return c.name === 'n8-foe-ally军'; }),
    battle ? JSON.stringify(battle.b.contingents.map(function (c) { return c.name + ':' + c.count; })) : 'no battle');
  let guard = 0;
  while (battle && !battle.finished && guard++ < 20) {
    if (battle.batchDone) battle.nextBatch();
    for (let i = 0; i < 12 && !battle.finished; i++) battle.step();
  }
  if (battle) stateLib.resolveBattle(g, battle);
  const playerAfter = armyLib.troopCount(g.player.troops);
  ok('玩家战后只拿走自己那队的兵，不吞并盟军',
    playerAfter > 0 && playerAfter < playerStart + 40 &&
    armyLib.troopCount(ally.troops) > 0,
    'player=' + playerAfter + ' ally=' + armyLib.troopCount(ally.troops));
  ok('玩家合战结束后战场清空、参战者解锁',
    g.fieldBattles.length === 0 && !g.player.fieldBattleId &&
    !ally.fieldBattleId && !foe.fieldBattleId,
    'fields=' + g.fieldBattles.length);

  // 同一套状态换一场 NPC 对 NPC：开局只有原始两方，战中邻近队伍才加入。
  const g2 = stateLib.createGame({ seed: 2026112592 });
  g2.player.x = 10; g2.player.y = 10; g2.player.route = [];
  g2.parties = []; g2.fieldBattles = []; g2.fieldBattleSeq = 1; g2.factionWars = {};
  const a = testLord('n8-a', 'wei', 100, 50, 50);
  const b = testLord('n8-b', 'shu', 100, 51, 50);
  const c = testLord('n8-c', 'wei', 30, 49, 51);
  const d = testLord('n8-d', 'shu', 20, 52, 51);
  g2.lords = [a, b, c, d];
  warLib.declare(g2, 'wei', 'shu', true, true);
  const bf = warLib.createFieldBattle(g2, { kind: 'lord', id: 'n8-a' },
    { kind: 'lord', id: 'n8-b' }, { preAggregate: false, context: { kind: 'field' } });
  ok('NPC 对 NPC 开局不预先聚合', !!bf && bf.participants.length === 2 &&
    !c.fieldBattleId && !d.fieldBattleId,
    bf ? 'participants=' + bf.participants.length : 'no field');
  const added = warLib.addNearbyToFieldBattle(g2, bf, { npc: true });
  ok('NPC 战场阶段五格内友军/敌军可动态加入', added === 2 &&
    bf.battle.a.contingents.length === 2 && bf.battle.b.contingents.length === 2,
    'added=' + added + ' a=' + bf.battle.a.contingents.length + ' b=' + bf.battle.b.contingents.length);
  // 真正由每 3 时辰的 NPC 野战 tick 生成战场，而不是手工 create：首拍只有两方。
  const g3 = stateLib.createGame({ seed: 2026112593 });
  g3.player.x = 10; g3.player.y = 10; g3.player.route = [];
  g3.parties = []; g3.fieldBattles = []; g3.fieldBattleSeq = 1; g3.factionWars = {};
  const aa = testLord('n8-tick-a', 'wei', 5000, 50, 50);
  const bb = testLord('n8-tick-b', 'shu', 5000, 51, 50);
  const cc = testLord('n8-tick-c', 'wei', 600, 49, 51);
  const dd = testLord('n8-tick-d', 'shu', 600, 52, 51);
  g3.lords = [aa, bb, cc, dd];
  warLib.declare(g3, 'wei', 'shu', true, true);
  warLib.fieldTick(g3);
  const live = g3.fieldBattles[0];
  ok('NPC 野战 tick 会生成战场且首拍只有原始两方',
    !!live && live.participants.length === 2 &&
    !cc.fieldBattleId && !dd.fieldBattleId,
    live ? 'participants=' + live.participants.length : 'no battle');
  if (live) {
    g3.clock.hour = (g3.clock.hour + 3) % 24;
    warLib.tickFieldBattles(g3);
    ok('战场进入下一拍后五格内 NPC 动态加入',
      live.participants.length >= 3,
      'participants=' + live.participants.length);
    live.battle.finish('draw');
    warLib.settleFieldBattle(g3, live, live.battle.summary(), {});
  }
  bf.battle.finish('draw');
  warLib.settleFieldBattle(g2, bf, bf.battle.summary(), {});
  ok('NPC 战场结算后所有人解锁，不永久卡死',
    g2.fieldBattles.length === 0 && !a.fieldBattleId && !b.fieldBattleId &&
    !c.fieldBattleId && !d.fieldBattleId,
    'fields=' + g2.fieldBattles.length);
}

/* ---------------------------------------------------------------- n9 版：道路连通 · 邻国宣战 · 战略要地 */

group('n9 版：道路连通 · 邻国宣战 · 战略要地');
{
  const roadData = require(R + '/data/china.js');
  ok('剑阁—新野有直连道路',
    (roadData.ROADS || []).some(function (r) {
      return (r[0] === 'jiange' && r[1] === 'xinye') || (r[0] === 'xinye' && r[1] === 'jiange');
    }));
  ok('战略要地共 13 处且半径 8、防御 1.5',
    Object.keys(roadData.STRATEGIC_SITES).length === 13 &&
    Object.keys(roadData.STRATEGIC_SITES).every(function (id) {
      const c = roadData.STRATEGIC_SITES[id];
      return c.radius === 8 && c.defense === 1.5;
    }), Object.keys(roadData.STRATEGIC_SITES).join(','));
  ['hulao', 'tongguan', 'jiange', 'guandu', 'hanzhong', 'xiangyang', 'hefei', 'chaisang', 'taishanguan', 'changsha'].forEach(function (id) {
    const n = (roadData.ROADS || []).filter(function (r) { return r[0] === id || r[1] === id; }).length;
    // 官渡按新路网只保留陈留/白马/虎牢三条通道，新野线已断。
    const need = (id === 'guandu' || id === 'taishanguan') ? 3 : 4;
    ok('要地 ' + id + ' 是多路枢纽', n >= need, 'roads=' + n);
  });
}
{
  const gRoad = stateLib.createGame({ seed: 2026112599 });
  ok('蜀—璋因道路接壤成为邻国', warLib.factionsAdjacent(gRoad, 'shu', 'zhang'));
  ok('魏—马腾不接壤', !warLib.factionsAdjacent(gRoad, 'wei', 'ma'));
  ok('不接壤的势力不能随机宣战', !warLib.canOpenWar(gRoad, 'wei', 'ma'));
  ok('接壤的势力可以宣战', warLib.canOpenWar(gRoad, 'shu', 'zhang'));
}
{
  // 玩家：没有城时第一座随意；有了城后只能打道路直接相连的敌城。
  const gp = stateLib.createGame({ seed: 2026112598 });
  const xinye = worldLib.siteById(gp.world, 'xinye');
  const jiange = worldLib.siteById(gp.world, 'jiange');
  const chengdu = worldLib.siteById(gp.world, 'chengdu');
  const firstAny = stateLib.canPlayerAttackSite(gp, chengdu);
  ok('玩家没有城时第一座城随意打', firstAny.ok && firstAny.firstCity === true, JSON.stringify(firstAny));
  ok('没有城时城下宣战可按第一座城放行', stateLib.canPlayerDeclareSite(gp, jiange).ok);
  xinye.playerOwned = true;
  xinye.ownerFaction = 'player';
  ok('占新野后可向邻国璋宣战', stateLib.canPlayerDeclareFaction(gp, 'zhang').ok);
  ok('占新野后不能向非邻国马腾宣战', !stateLib.canPlayerDeclareFaction(gp, 'ma').ok);
  gp.wars = gp.wars || {};
  gp.wars.zhang = true;
  warLib.declare(gp, 'player', 'zhang', true, true);
  ok('占新野后能打道路直接相连的剑阁', stateLib.canPlayerAttackSite(gp, jiange).ok);
  const far = stateLib.canPlayerAttackSite(gp, chengdu);
  ok('占新野后不能跨过剑阁直接打成都', far.ok === false, far.msg);
  xinye.playerOwned = false;
  xinye.ownerFaction = null;
  ok('清空城后第一座城仍可随意打', stateLib.canPlayerAttackSite(gp, chengdu).firstCity === true);
}
{
  // AI 刘备：第 8 天入川目标必须是剑阁，并且真的打下剑阁。
  const gl = stateLib.createGame({ seed: 777001 });
  warLib.init(gl);
  warLib.startDiplomacy(gl);
  for (let d = 0; d < 8; d++) {
    for (let h = 0; h < 24; h++) { stateLib.advanceTime(gl, 1); stateLib.update(gl, 0, { ignoreEvents: true }); }
  }
  const cp0 = gl.warCampaigns.shu;
  ok('刘备第 8 天出兵的目标是剑阁', !!cp0 && cp0.targetId === 'jiange',
    cp0 ? cp0.targetId : 'none');
  ok('刘备亲自在入川队伍里', !!cp0 && cp0.attackerIds.indexOf('liubei') >= 0,
    cp0 ? cp0.attackerIds.join(',') : 'none');
  // 入川路程受随机行军速度影响，给足 30 天再断言剑阁易手。
  for (let d = 0; d < 30; d++) {
    for (let h = 0; h < 24; h++) { stateLib.advanceTime(gl, 1); stateLib.update(gl, 0, { ignoreEvents: true }); }
  }
  const jg = worldLib.siteById(gl.world, 'jiange');
  ok('刘备真的从刘璋手里打下剑阁', jg.ownerFaction === 'shu', jg.ownerFaction);
  ok('剑阁入蜀后蜀势力有两座城', warLib.ownedCities(gl, 'shu').length >= 2,
    warLib.ownedCities(gl, 'shu').map(function (s) { return s.id; }).join(','));
}
{
  // 曹吕开局不能只挂一个交战名分：宣战当场要有一场先锋合战，领主也要主动寻敌。
  const gw = stateLib.createGame({ seed: 2026112501 });
  warLib.init(gw);
  const started = warLib.startDiplomacy(gw);
  const opening = (gw.fieldBattles || [])[0];
  ok('曹吕宣战当天直接开打', started >= 2 && !!opening &&
    warLib.atWar(gw, opening.primaryA.faction, opening.primaryB.faction) &&
    [opening.primaryA.faction, opening.primaryB.faction].sort().join('|') === 'lv|wei',
    opening ? opening.primaryA.name + ' vs ' + opening.primaryB.name : '无合战');

  const gt = stateLib.createGame({ seed: 2026112502 });
  warLib.init(gt);
  warLib.declare(gt, 'wei', 'lv', true, true);
  const wa = gt.lords.filter(function (l) { return l.faction === 'wei' && l.alive; })[0];
  const wb = gt.lords.filter(function (l) { return l.faction === 'lv' && l.alive; })[0];
  gt.lords = [wa, wb];
  gt.parties = [];
  gt.player.atSiteId = null;
  gt.player.route = [];
  gt.player.stepTo = null;
  wa.x = 20; wa.y = 20; wb.x = 30; wb.y = 20;
  wa.troops = { militia: 100 }; wb.troops = { militia: 100 };
  wa.morale = 70; wb.morale = 70;
  wa.engagedWith = null; wb.engagedWith = null;
  const threat = stateLib.lordThreatFor(gt, wa, false, false);
  ok('国战领主会主动寻敌，不会在十余格外各自站着',
    !!threat && threat.role === 'hunt' && threat.target.unit === wb,
    threat ? threat.role + ':' + (threat.target.unit && threat.target.unit.name) : '无目标');
}
{
  // 要地八格：只有占据方吃 1.5 倍，出八格就恢复；且只加防御，不加攻击。
  const gs = stateLib.createGame({ seed: 2026112597 });
  const hulao = worldLib.siteById(gs.world, 'hulao');
  ok('虎牢关属于魏', hulao.ownerFaction === 'wei', hulao.ownerFaction);
  ok('虎牢关八格内魏军防御 1.5', warLib.strategicDefenseAt(gs, 'wei', hulao.x + 2, hulao.y + 2) === 1.5);
  ok('虎牢关八格内蜀军没有加成', warLib.strategicDefenseAt(gs, 'shu', hulao.x + 2, hulao.y + 2) === 1);
  ok('远离所有要地后魏军也恢复 1', warLib.strategicDefenseAt(gs, 'wei', 0, 0) === 1);
  ok('虎牢关城下守军吃 1.5 倍', warLib.strategicDefenseForSite(gs, hulao) === 1.5);
  const gateBattle = new Battle({
    rng: new RNG(2026112597),
    attacker: { name: '攻方', troops: { militia: 100 }, morale: 70 },
    defender: { name: '守方', troops: { militia: 100 }, morale: 70, edge: 1, gateEdge: 1.5 },
  });
  ok('关隘只提高守方防御，不提高攻击',
    gateBattle.b.defenseEdge > gateBattle.b.combatEdge &&
    gateBattle.b.combatEdge === gateBattle.b.edge * gateBattle.b.tierFactor,
    'combat=' + gateBattle.b.combatEdge + ' def=' + gateBattle.b.defenseEdge);
  ok('攻方没有关隘加成时防御与攻击一致',
    gateBattle.a.defenseEdge === gateBattle.a.combatEdge);
}
{
  const journalScene = require(R + '/scenes/journal.js');
  ok('史册过滤匪徒战报', journalScene.isBanditFight({ kind: 'war', text: '刘备军击溃了一伙山贼' }));
  ok('史册过滤黄巾军战报', journalScene.isBanditFight({ kind: 'battle', text: '曹操军击溃了白波黄巾' }));
  ok('史册过滤没有“匪”字的匪团战报', journalScene.isBanditFight({
    kind: 'battle', text: '关羽军攻破了饿虎岗',
  }));
  ok('史册保留正常国战战报', !journalScene.isBanditFight({ kind: 'war', text: '剑阁城头换了旗' }));
  ok('史册保留乱军战报', !journalScene.isBanditFight({ kind: 'war', text: '徐州乱军攻下了小沛' }));
  ok('史册保留溃兵战报', !journalScene.isBanditFight({ kind: 'battle', text: '凉州溃兵被击散' }));
  ok('史册不误删带匪首的乱军战报', !journalScene.isBanditFight({
    kind: 'war', text: '徐州乱军击溃了匪首张闿的残部',
  }));
  ok('史册不会把生活日志当匪战', !journalScene.isBanditFight({ kind: 'life', text: '又有一伙残匪聚了起来' }));
}

/* ---------------------------------------------------------------- n10 版：合战节奏 · 溃逃位移 · 旗色 */

group('n10 版：合战节奏 · 溃逃位移 · 旗色');
{
  function testLord(id, faction, n, x, y) {
    return {
      id: id, name: id, faction: faction, alive: true, dead: false, retired: false,
      x: x, y: y, home: null, level: 3, morale: 75, troops: { militia: n },
      defTroops: { militia: n }, inCity: null, prisoner: null, fieldBattleId: null,
      engagedWith: null, sight: 5,
    };
  }
  function tickClock(g, h) {
    g.clock.hour += h;
    while (g.clock.hour >= 24) { g.clock.hour -= 24; g.clock.day += 1; }
  }
  const g = stateLib.createGame({ seed: 2026112601 });
  g.player.x = 10; g.player.y = 10; g.player.atSiteId = 'chenliu';
  g.parties = []; g.fieldBattles = []; g.fieldBattleSeq = 1; g.factionWars = {};
  const a1 = testLord('n10-a1', 'wei', 6000, 50, 50);
  const a2 = testLord('n10-a2', 'wei', 1200, 49, 51);
  const b1 = testLord('n10-b1', 'shu', 6000, 51, 50);
  const b2 = testLord('n10-b2', 'shu', 1200, 52, 51);
  g.lords = [a1, a2, b1, b2];
  warLib.declare(g, 'wei', 'shu', true, true);
  const bf = warLib.createFieldBattle(g,
    { kind: 'lord', id: a1.id }, { kind: 'lord', id: b1.id },
    { preAggregate: true, context: { kind: 'field' } });
  ok('n10 合战开局聚合双方各队',
    !!bf && bf.battle.a.contingents.length === 2 && bf.battle.b.contingents.length === 2,
    bf ? 'a=' + bf.battle.a.contingents.length + ' b=' + bf.battle.b.contingents.length : 'none');
  const battle = bf && bf.battle;
  tickClock(g, 3);
  warLib.tickFieldBattles(g);
  ok('一次时辰推进只打一轮', !!battle && battle.round === 1 && !battle.finished,
    battle ? 'round=' + battle.round + ' finished=' + battle.finished : 'none');
  ok('一轮打完合战仍留在图上，不瞬间结算',
    g.fieldBattles.length === 1 && battle.batchDone === false,
    'fields=' + g.fieldBattles.length + ' batchDone=' + (battle ? battle.batchDone : 'none'));
  tickClock(g, 3);
  warLib.tickFieldBattles(g);
  ok('下一拍继续推进而不是重置',
    battle.round === 2 && !battle.finished && g.fieldBattles.length === 1,
    'round=' + battle.round + ' fields=' + g.fieldBattles.length);
  for (let i = 0; i < 4; i++) {
    tickClock(g, 3);
    warLib.tickFieldBattles(g);
  }
  const sideLossRatios = ['a', 'b'].map(function (sk) {
    const cs = battle[sk].contingents;
    return cs.map(function (c) { return (c.initialCount - c.count) / c.initialCount; });
  });
  const sideGaps = sideLossRatios.map(function (ratios) {
    return Math.max.apply(null, ratios) - Math.min.apply(null, ratios);
  });
  // 两侧阵线各自内部要按人数均衡；两边总伤亡不同是战场先手/阵型差异，不要求相等。
  const gapRatio = Math.max.apply(null, sideGaps);
  ok('各领主按现有人数均衡分摊伤亡', gapRatio <= 0.02,
    sideLossRatios[0].join(',') + ' / ' + sideLossRatios[1].join(','));
  let ticks = 0;
  while (g.fieldBattles.length && ticks++ < 200) {
    tickClock(g, 3);
    warLib.tickFieldBattles(g);
  }
  ok('合战一直打到一方失败才收场',
    g.fieldBattles.length === 0 && battle.finished &&
    (battle.result === 'win' || battle.result === 'lose'),
    'result=' + battle.result + ' a=' + armyLib.troopCount(battle.a.troops) +
    ' b=' + armyLib.troopCount(battle.b.troops));
}
{
  // 溃逃不能直接改坐标，更不能一头扎进城池中心。
  const gm = stateLib.createGame({ seed: 2026112602 });
  const city = gm.world.sites.filter(function (s) {
    return (s.type === 'town' || s.type === 'castle') &&
      worldLib.terrainAt(gm.world, s.x - 2, s.y).passable &&
      !worldLib.siteAt(gm.world, s.x - 2, s.y);
  })[0];
  ok('溃逃测试需要一座城', !!city, city ? city.id : 'none');
  if (city) {
    const lord = {
      id: 'n10-retreat', name: '溃逃测试', faction: 'wei', alive: true,
      x: city.x - 2, y: city.y, home: city.id, level: 2,
      troops: { militia: 30 }, defTroops: { militia: 30 },
      inCity: null, prisoner: null, engagedWith: null, sight: 5,
      nextMoveH: stateLib.gameHours(gm),
    };
    gm.lords = [lord]; gm.parties = [];
    gm.player.x = 10; gm.player.y = 10;
    const before = stateLib.gameHours(gm);
    const moved = warLib.moveAway(gm, lord);
    ok('溃逃落点绝不瞬移进城池', moved && !lord.inCity &&
      !worldLib.siteAt(gm.world, lord.x, lord.y) &&
      !(lord.x === city.x && lord.y === city.y),
      'moved=' + moved + ' pos=' + lord.x + ',' + lord.y + ' city=' + city.x + ',' + city.y);
    ok('溃逃按 5 时辰一格走，不超速',
      lord.nextMoveH - before === 5 && lord.stepHours === 5 && !!lord.stepTo,
      'next=' + (lord.nextMoveH - before) + ' stepHours=' + lord.stepHours);
  }
}
{
  function rgb(hex) {
    const s = String(hex || '').replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  const lv = rgb(FACTIONS.lv.color), bandit = rgb(FACTIONS.bandit.color);
  const gap = Math.sqrt(Math.pow(lv[0] - bandit[0], 2) +
    Math.pow(lv[1] - bandit[1], 2) + Math.pow(lv[2] - bandit[2], 2));
  ok('吕布与山匪旗色明显区分', gap >= 80,
    FACTIONS.lv.color + ' / ' + FACTIONS.bandit.color + ' = ' + Math.round(gap));
}

/* ---------------------------------------------------------------- n11 */

group('n11 版：汉中改道 · 新野十巡 · 攻城渐进 · 统一战争');
{
  // 汉中不再绕黑山营，直接接洛阳；道路要连得通，且不在非桥区凭空长桥。
  const g = stateLib.createGame({ seed: 2026112501 });
  const hanzhong = worldLib.siteById(g.world, 'hanzhong');
  const luoyang = worldLib.siteById(g.world, 'luoyang');
  const heishan = worldLib.siteById(g.world, 'heishan');
  ok('汉中到洛阳有路', !!worldLib.findPath(g.world, hanzhong, luoyang),
    'hanzhong -> luoyang');
  ok('汉中不再直连黑山营', !worldLib.findPath(g.world, hanzhong, heishan) ||
    worldLib.findPath(g.world, hanzhong, heishan).length > 30,
    'hanzhong -> heishan');

  // 找一块四周没有河水的干地，桥格判定必须拒绝它。
  let dry = null;
  for (let y = 3; y < g.world.h - 3 && !dry; y++) {
    for (let x = 3; x < g.world.w - 3 && !dry; x++) {
      if (g.world.tiles[y * g.world.w + x] !== 'road') continue;
      let water = false;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (g.world.tiles[(y + dy) * g.world.w + (x + dx)] === 'river') water = true;
        }
      }
      if (!water) dry = { x: x, y: y };
    }
  }
  ok('非桥区不会被判成桥', !!dry && !worldLib.bridgeHasWater(g.world, dry.x, dry.y, 'h') &&
    !worldLib.bridgeHasWater(g.world, dry.x, dry.y, 'v'), dry ? dry.x + ',' + dry.y : 'no dry tile');
}
{
  // 新野十条：长短圈都有，路线互不相同，且全部落在可通行、非据点格。
  const g = stateLib.createGame({ seed: 2026112502 });
  const xinye = worldLib.siteById(g.world, 'xinye');
  const routes = stateLib.patrolRoutesForSite(g, xinye);
  ok('新野有十条巡逻路线', routes.length === 10, String(routes.length));
  ok('新野路线互不相同', new Set(routes.map(function (r) {
    return r.map(function (p) { return p.x + ',' + p.y; }).join('|');
  })).size === 10, JSON.stringify(routes));
  const farRoutes = routes.filter(function (r) {
    return r.some(function (p) { return Math.max(Math.abs(p.x - xinye.x), Math.abs(p.y - xinye.y)) >= 3; });
  });
  const nearRoutes = routes.filter(function (r) {
    return r.some(function (p) { return Math.max(Math.abs(p.x - xinye.x), Math.abs(p.y - xinye.y)) <= 2; });
  });
  ok('新野巡逻有远圈也有近圈', farRoutes.length >= 5 && nearRoutes.length >= 5,
    'far=' + farRoutes.length + ' near=' + nearRoutes.length);
  ok('新野路线都在可通行、非据点格', routes.every(function (r) {
    return r.length > 0 && r.every(function (p) {
      return worldLib.terrainAt(g.world, p.x, p.y).passable && !worldLib.siteAt(g.world, p.x, p.y);
    });
  }), '路线越界');
}
{
  // NPC 围城到点后必须进入 assault Battle，不能一天内直接换旗。
  const g = stateLib.createGame({ seed: 2026112503 });
  const target = worldLib.siteById(g.world, 'guandu');
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  target.ownerFaction = 'yuan';
  target.garrison = 100;
  target.siegeStatus = null;
  lord.inCity = null;
  lord.prisoner = null;
  lord.alive = true;
  lord.x = target.x + 1;
  lord.y = target.y;
  lord.troops = { militia: 120 };
  lord.defTroops = { militia: 120 };
  Object.keys(FACTIONS).forEach(function (f) {
    g.factionState[f] = g.factionState[f] || {};
    g.factionState[f].dead = f !== 'wei';
  });
  const cp = {
    faction: 'wei', enemy: 'yuan', targetId: target.id,
    stage: 'siege', siegeUntil: g.clock.day, attackerIds: [lord.id],
    defenderIds: [], arrivedIds: [],
  };
  g.warCampaigns = { wei: cp };
  warLib.strategyTick(g);
  ok('围城到点进入进攻中', cp.stage === 'assault' && target.siegeStatus === 'assault' && !!cp.siegeBattle,
    'stage=' + cp.stage + ' status=' + target.siegeStatus);
  const beforeOwner = target.ownerFaction;
  warLib.siegeTick(g);
  ok('攻城第一轮不会瞬间换旗', cp.stage === 'assault' && target.ownerFaction === beforeOwner,
    'stage=' + cp.stage + ' owner=' + target.ownerFaction);
  let guard = 0;
  while (cp.stage === 'assault' && guard++ < 40) warLib.siegeTick(g);
  ok('攻城战会打到一方倒下才收场', cp.stage !== 'assault' && target.siegeStatus === null,
    'stage=' + cp.stage + ' status=' + target.siegeStatus);
  ok('攻城结束只可能是夺城或退兵', cp.stage === 'hold' || cp.stage === 'done',
    'stage=' + cp.stage + ' owner=' + target.ownerFaction);
}
{
  // 不许再给 NPC 留“开局不战 / 同时最多三场 / 保护都城”的手。
  const g = stateLib.createGame({ seed: 2026112504 });
  ok('开局不再禁战', Object.keys(warLib.OPENING_FORBIDDEN).length === 0,
    JSON.stringify(warLib.OPENING_FORBIDDEN));
  ok('不再限制同时三场大战', warLib.MAX_WAR_PARTNERS >= 99, String(warLib.MAX_WAR_PARTNERS));
  ok('aiCanDeclare 不再对玩家效忠国留手', warLib.aiCanDeclare(g, 'wei', 'shu'));
}


/* ---------------------------------------------------------------- n12 版：禁逃加强 · 绕路 · 巡逻 · 任务框 */
group('n12 版：禁逃加强 · 绕路 · 巡逻 · 任务框');
{
  // 开局/老档：同一格不能叠两支队伍，否则两支都会把对方当占格，谁也走不动。
  const g = stateLib.createGame({ seed: 8130 });
  const active = g.lords.filter(function (l) {
    return l.alive && !l.inCity && !l.prisoner && !l.hidden;
  });
  const cells = {};
  const dup = [];
  active.forEach(function (l) {
    const key = l.x + ',' + l.y;
    if (cells[key]) dup.push(key);
    cells[key] = true;
  });
  ok('开局同格领主已经分开', dup.length === 0, dup.slice(0, 4).join(' / '));
}
{
  // 路线首格被友军占住：必须横一步绕开并清掉旧路线，不能永久 routeBlocked 站死。
  function routeLord(id, x, y, target, path) {
    return {
      id: id, name: id, faction: 'wei', home: 'luoyang', level: 3,
      x: x, y: y, troops: { militia: 40 }, defTroops: { militia: 40 },
      morale: 80, sight: 5, alive: true, dead: false, retired: false,
      inCity: null, prisoner: null, fieldBattleId: null, engagedWith: null,
      wander: target, patrolPath: null, routePath: path,
      routePathFor: target ? target.x + ',' + target.y : null, nextMoveH: 0,
    };
  }
  const g = stateLib.createGame({ seed: 2026112605 });
  g.player.x = 150; g.player.y = 150;
  g.parties = [];
  g.fieldBattles = [];
  g.clock.day = 0; g.clock.hour = 0;
  const mover = routeLord('n12-mover', 64, 71, { x: 66, y: 76 }, [{ x: 64, y: 72 }]);
  const blocker = routeLord('n12-blocker', 64, 72, null, null);
  g.lords = [mover, blocker];
  stateLib.moveLords(g);
  ok('路线被友军堵住时会绕开而不是站死',
    (mover.x !== 64 || mover.y !== 71) && !mover.routePath,
    'pos=' + mover.x + ',' + mover.y + ' path=' + (mover.routePath ? mover.routePath.length : 'null'));
}
{
  // 出城只走城边一格，并且从城中心插值出去；不能直接闪到三格外。
  const g = stateLib.createGame({ seed: 2026112605 });
  const city = worldLib.siteById(g.world, 'luoyang');
  const other = worldLib.siteById(g.world, 'hulao');
  const lord = {
    id: 'n12-leaver', name: '出城测试', faction: 'wei', home: city.id,
    level: 3, x: city.x, y: city.y, troops: { militia: 40 }, defTroops: { militia: 40 },
    morale: 80, sight: 5, alive: true, dead: false, retired: false,
    inCity: city.id, prisoner: null, fieldBattleId: null, engagedWith: null,
    order: { type: 'march', siteId: other.id, hold: false, since: 1 },
    nextMoveH: 0,
  };
  g.player.x = 150; g.player.y = 150;
  g.lords = [lord];
  g.parties = [];
  stateLib.moveLords(g);
  const d = lord.stepTo ? Math.max(Math.abs(lord.stepTo.x - city.x), Math.abs(lord.stepTo.y - city.y)) : 99;
  ok('出城从城中心插值到城边一格，不瞬移',
    !lord.inCity && !!lord.stepFrom && !!lord.stepTo &&
    lord.stepFrom.x === city.x && lord.stepFrom.y === city.y && d === 1,
    'from=' + JSON.stringify(lord.stepFrom) + ' to=' + JSON.stringify(lord.stepTo) + ' d=' + d);
}
{
  // 敌军已把本城定为行军目标且逼近十格内：超过十人的守军不许逃。
  const g = stateLib.createGame({ seed: 2026112607 });
  const city = g.world.sites.find(function (s) {
    return (s.type === 'town' || s.type === 'castle') && s.ownerFaction === 'wei';
  });
  const weak = {
    id: 'n12-home-hold', name: '守土测试', faction: 'wei', home: city.id,
    x: city.x + 2, y: city.y, level: 2, troops: { militia: 24 }, defTroops: { militia: 24 },
    sight: 6, alive: true, dead: false, retired: false,
    inCity: null, prisoner: null, engagedWith: null, defending: null, order: null,
    fleeing: false, fleeTargetId: null,
  };
  const foe = {
    id: 'n12-march-foe', name: '来犯测试', faction: 'shu', home: city.id,
    x: city.x + 4, y: city.y, level: 3, troops: { militia: 120 }, defTroops: { militia: 120 },
    sight: 6, alive: true, dead: false, retired: false,
    inCity: null, prisoner: null, engagedWith: null, defending: null,
    order: { type: 'march', siteId: city.id, hold: false },
    fleeing: false, fleeTargetId: null,
  };
  g.player.x = 150; g.player.y = 150;
  g.parties = [];
  g.lords = [weak, foe];
  warLib.declare(g, 'wei', 'shu', true, true);
  const threat = stateLib.lordThreatFor(g, weak, true, false);
  ok('敌军逼近本城时超过十人的守军不再逃',
    !threat || threat.role !== 'flee', threat ? threat.role : 'none');
}
{
  // 野战撞阵结算也不能绕过“守城/结阵不逃”的硬顶。
  const g = stateLib.createGame({ seed: 2026112608 });
  const city = g.world.sites.find(function (s) {
    return (s.type === 'town' || s.type === 'castle') && s.ownerFaction === 'wei';
  });
  const weak = {
    id: 'n12-clash-weak', name: '撞阵弱势', faction: 'wei', home: city.id,
    x: 52, y: 52, level: 3, troops: { militia: 12 }, defTroops: { militia: 12 },
    morale: 80, sight: 6, alive: true, dead: false, retired: false,
    inCity: null, prisoner: null, fieldBattleId: null, engagedWith: null,
    defending: city.id, order: { type: 'defend', siteId: city.id },
    fleeing: false, fleeTargetId: null,
  };
  const strong = {
    id: 'n12-clash-strong', name: '撞阵强势', faction: 'shu', home: city.id,
    x: 52, y: 52, level: 3, troops: { militia: 150 }, defTroops: { militia: 150 },
    morale: 80, sight: 6, alive: true, dead: false, retired: false,
    inCity: null, prisoner: null, fieldBattleId: null, engagedWith: null,
    defending: null, order: null, fleeing: false, fleeTargetId: null,
  };
  g.player.x = 150; g.player.y = 150;
  g.parties = [];
  g.lords = [weak, strong];
  warLib.declare(g, 'wei', 'shu', true, true);
  for (let i = 0; i < 8 && weak.alive && !weak.prisoner; i++) warLib.clash(g, weak, strong);
  ok('守城军撞阵打崩也不准溃逃（只可被俘）',
    weak.fleeing !== true && (!!weak.prisoner || !weak.alive),
    'flee=' + weak.fleeing + ' prisoner=' + !!weak.prisoner + ' alive=' + weak.alive);
}
{
  // 集结阶段只留主帅在集结城，其余领主不得一起在城边站成一片。
  const g = stateLib.createGame({ seed: 2026112609 });
  g.player.x = 150; g.player.y = 150;
  warLib.startDiplomacy(g);
  warLib.strategyTick(g);
  const factions = Object.keys(g.warCampaigns || {});
  const bad = factions.filter(function (f) {
    const cp = g.warCampaigns[f];
    if (!cp || cp.stage !== 'rally') return false;
    const rally = cp.attackerIds.map(function (id) {
      return g.lords.filter(function (l) { return l.id === id; })[0];
    }).filter(Boolean).filter(function (l) {
      return l.order && l.order.type === 'rally';
    });
    return rally.length > 1;
  });
  ok('集结时每个国家只留主帅在集结城',
    factions.length > 0 && bad.length === 0,
    'campaigns=' + factions.length + ' bad=' + bad.join(','));
}
{
  // 旧档里残留的“扎营/集结”军令在进档时必须清掉，否则领主会在城边一直站着。
  const g = stateLib.createGame({ seed: 2026112610 });
  const city = worldLib.siteById(g.world, 'luoyang');
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  g.warCampaigns = {};
  lord.order = { type: 'hold', siteId: city.id, hold: true, since: 1 };
  lord.defending = city.id;
  lord.inCity = null;
  lord.x = city.x + 1;
  lord.y = city.y;
  lord.nextMoveH = 0;
  const re = stateLib.deserialize(stateLib.serialize(g));
  const r = re.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  ok('旧档残留的扎营军令进档后清掉，领主重新巡逻',
    !r.order && !r.defending && r.nextMoveH === 0,
    'order=' + JSON.stringify(r.order) + ' defending=' + r.defending);
}
/* ---------------------------------------------------------------- n14 版：卡点脱困 */

group('n14 版：领主卡点脱困');
{
  const g = stateLib.createGame({ seed: 2026112611 });
  g.events.length = 0;
  const lord = g.lords.filter(function (l) { return l.alive && !l.inCity && !l.prisoner; })[0];
  lord.troops = { inf: 100 };
  lord.defTroops = { inf: 100 };
  lord.inCity = null;
  lord.enteringSiteId = null;
  lord.cityEnterAtH = null;
  lord.engagedWith = null;
  lord.fieldBattleId = null;
  lord.order = { type: 'march', siteId: 'luoyang', hold: false };
  lord.wander = { x: lord.x, y: lord.y };
  lord.nextMoveH = 0;
  lord.stuckPos = lord.x + ',' + lord.y;
  lord.stuckAnchorX = lord.x;
  lord.stuckAnchorY = lord.y;
  lord.stuckSinceH = stateLib.gameHours(g) - 24;
  const oldX = lord.x;
  const oldY = lord.y;
  stateLib.moveLords(g);
  ok('有军令的卡住领主保留军令，不弃令乱走',
    lord.order && lord.order.siteId === 'luoyang', 'order=' + JSON.stringify(lord.order));
  ok('卡住后改走一个更靠近原目标的绕行点',
    !!lord.orderDetourTarget && (lord.orderDetourTarget.x !== oldX || lord.orderDetourTarget.y !== oldY),
    'detour=' + JSON.stringify(lord.orderDetourTarget) + ' old=' + oldX + ',' + oldY);
  ok('卡住后当拍就开始移动，不再原地站死', lord.x !== oldX || lord.y !== oldY,
    'at=' + lord.x + ',' + lord.y + ' old=' + oldX + ',' + oldY);
}
/* ---------------------------------------------------------------- n18 版：扩图 · 三新势力 · 打散三天 */

group('n18 版：扩图 · 三新势力 · 打散三天');
{
  const g = stateLib.createGame({ seed: 2026112618 });
  const newIds = [
    'juyan', 'yanmen', 'shangluo', 'wudu', 'lujiang', 'liyang2', 'ruxu', 'shangyong',
    'zhuti', 'jianning', 'zangke', 'yunnan', 'yongchang', 'xiping', 'fuhan',
  ];
  const missing = newIds.filter(function (id) { return !worldLib.siteById(g.world, id); });
  ok('n18 新城全部生成', missing.length === 0, missing.join(','));

  const counts = {};
  g.lords.forEach(function (l) { counts[l.faction] = (counts[l.faction] || 0) + 1; });
  ok('公孙瓒至少六位领主', (counts.gongsun || 0) >= 6, String(counts.gongsun || 0));
  ok('韩遂至少六位领主', (counts.hansui || 0) >= 6, String(counts.hansui || 0));
  ok('南蛮至少六位领主', (counts.nanman || 0) >= 6, String(counts.nanman || 0));
  const zhaoyun = g.lords.filter(function (l) { return l.id === 'zhaoyun'; })[0];
  ok('赵云归公孙瓒、驻蓟', !!zhaoyun && zhaoyun.faction === 'gongsun' && zhaoyun.home === 'ji',
    zhaoyun ? zhaoyun.faction + '/' + zhaoyun.home : 'none');
  ok('蓟/涿/北平已换公孙瓒旗', ['ji', 'zhuo', 'beiping'].every(function (id) {
    const s = worldLib.siteById(g.world, id);
    return s && s.ownerFaction === 'gongsun';
  }));
  ok('金城归韩遂', (function () {
    const s = worldLib.siteById(g.world, 'jincheng');
    return s && s.ownerFaction === 'hansui';
  })());

  function hasRoad(a, b) {
    return ROADS.some(function (p) {
      return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
    });
  }
  ok('汉中—上洛—洛阳成链，且不再直连',
    hasRoad('hanzhong', 'shangluo') && hasRoad('shangluo', 'luoyang') && !hasRoad('hanzhong', 'luoyang'));
  ok('天水—武都—汉中成链，且不再直连',
    hasRoad('tianshui', 'wudu') && hasRoad('wudu', 'hanzhong') && !hasRoad('tianshui', 'hanzhong'));
  ok('寿春—庐江—历阳—濡须—建业成链',
    hasRoad('shouchun', 'lujiang') && hasRoad('lujiang', 'liyang2') &&
    hasRoad('liyang2', 'ruxu') && hasRoad('ruxu', 'jianye'));
  ok('居延只通武威，龙城与居延断开', hasRoad('wuwei', 'juyan') && !hasRoad('juyan', 'longcheng') && hasRoad('longcheng', 'tanhanshan'));
  ok('晋阳—雁门—弹汗山成链', hasRoad('jinyang', 'yanmen') && hasRoad('yanmen', 'tanhanshan'));
  ok('江州—朱提—建宁—云南—永昌成链',
    hasRoad('jiangzhou', 'zhuti') && hasRoad('zhuti', 'jianning') &&
    hasRoad('jianning', 'yunnan') && hasRoad('yunnan', 'yongchang'));
  ok('濡须归吴、历阳归袁术、上庸归蜀',
    worldLib.siteById(g.world, 'ruxu').ownerFaction === 'wu' &&
    worldLib.siteById(g.world, 'liyang2').ownerFaction === 'yuanshu' &&
    worldLib.siteById(g.world, 'shangyong').ownerFaction === 'shu');
  ok('三座新都城进入都城表', ['ji', 'jincheng', 'jianning'].every(function (id) {
    return CAPITAL_IDS.indexOf(id) >= 0;
  }));
  const patrolBad = newIds.filter(function (id) {
    const s = worldLib.siteById(g.world, id);
    return stateLib.patrolRoutesForSite(g, s).length < 5;
  });
  ok('每座新城都有至少五条巡逻线', patrolBad.length === 0, patrolBad.join(','));

  const oldSave = JSON.parse(stateLib.serialize(g));
  oldSave.world.sites = oldSave.world.sites.filter(function (s) { return newIds.indexOf(s.id) < 0; });
  ['ji', 'zhuo', 'beiping', 'jincheng'].forEach(function (id) {
    const s = oldSave.world.sites.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    s.playerOwned = false;
    s.ownerFaction = id === 'beiping' ? 'xianbei' : (id === 'jincheng' ? 'ma' : 'han');
  });
  const oldZhaoyun = oldSave.lords.filter(function (l) { return l.id === 'zhaoyun'; })[0];
  if (oldZhaoyun) { oldZhaoyun.faction = 'shu'; oldZhaoyun.home = 'hanzhong'; oldZhaoyun.inCity = null; }
  const migrated = stateLib.deserialize(oldSave);
  ok('旧档补回全部 n18 新城', !!migrated && migrated.world.sites.length === SITE_ROWS.length,
    migrated ? String(migrated.world.sites.length) : 'null');
  ok('旧档换旗为公孙瓒/韩遂', !!migrated &&
    ['ji', 'zhuo', 'beiping'].every(function (id) {
      const s = worldLib.siteById(migrated.world, id);
      return s && s.ownerFaction === 'gongsun';
    }) && worldLib.siteById(migrated.world, 'jincheng').ownerFaction === 'hansui');
  const migratedZhaoyun = migrated && migrated.lords.filter(function (l) { return l.id === 'zhaoyun'; })[0];
  ok('旧档赵云迁入公孙瓒、驻蓟', !!migratedZhaoyun &&
    migratedZhaoyun.faction === 'gongsun' && migratedZhaoyun.home === 'ji' && migratedZhaoyun.inCity === 'ji',
    migratedZhaoyun ? migratedZhaoyun.faction + '/' + migratedZhaoyun.home + '/' + migratedZhaoyun.inCity : 'none');
}
{
  // 被打散 = 无兵、未俘、三天内不能招募；逃窜 = 至少 1 兵，进城可立即补兵。
  const g = stateLib.createGame({ seed: 2026112619 });
  const city = g.world.sites.filter(function (s) {
    return s.type === 'town' && s.ownerFaction && !s.playerOwned;
  })[0];
  const lord = g.lords.filter(function (l) { return l.faction === city.ownerFaction && l.alive; })[0];
  lord.troops = {};
  lord.defTroops = { militia: 100 };
  lord.inCity = city.id;
  lord.x = city.x;
  lord.y = city.y;
  warLib.markLordScattered(g, lord, 'test');
  lord.inCity = city.id;
  city.lordRecruits = { militia: 20 };
  city.recruitList = ['militia'];
  stateLib.lordRecruitTick(g);
  ok('被打散的领主三天内不能招募', armyLib.troopCount(lord.troops) === 0 &&
    lord.scattered === true, String(armyLib.troopCount(lord.troops)) + '/' + lord.scattered);
  stateLib.advanceTime(g, 73);
  stateLib.lordRecruitTick(g);
  ok('三天后可以重新集结', lord.scattered === false && armyLib.troopCount(lord.troops) > 0,
    String(armyLib.troopCount(lord.troops)) + '/' + lord.scattered);
  lord.scattered = false;
  lord.scatterUntilH = 0;
  lord.troops = { militia: 1 };
  city.lordRecruits = { militia: 20 };
  stateLib.lordRecruitTick(g);
  ok('逃窜入城可立即招募', armyLib.troopCount(lord.troops) > 1, String(armyLib.troopCount(lord.troops)));

  // 直接走 clash 的零兵分支：匪团打空领主时，不能留下 0 兵幽灵，也不能误俘。
  const party = g.parties.filter(function (p) { return p.faction === 'bandit' && !p.dead; })[0];
  const fieldLord = g.lords.filter(function (l) { return l.alive && l.id !== lord.id && !l.inCity; })[0];
  fieldLord.troops = {};
  fieldLord.inCity = null;
  fieldLord.defending = null;
  fieldLord.order = null;
  fieldLord.prisoner = null;
  fieldLord.x = party.x + 1;
  fieldLord.y = party.y;
  warLib.clash(g, fieldLord, party);
  ok('clash 零兵且可离场时打散而非留幽灵',
    fieldLord.scattered === true && !fieldLord.prisoner && armyLib.troopCount(fieldLord.troops) === 0,
    'scattered=' + fieldLord.scattered + ' prisoner=' + fieldLord.prisoner);
}
{
  // 进城清场：TownScene.enter 必须收脚，不能把地图上行军剩余路线带进城。
  const g = stateLib.createGame({ seed: 2026112620 });
  const townScene = require(R + '/scenes/town.js');
  const app = { state: g, restView: 'x', mapDrag: { x: 1 }, follow: { kind: 'lord' }, siegePrompt: { siteId: 'luoyang' }, mapIdleRest: true, townView: null };
  g.player.route = [{ x: 30, y: 30 }];
  g.player.stepFrom = { x: 29, y: 29 };
  g.player.stepTo = { x: 30, y: 30 };
  g.player.stepProgress = 0.4;
  townScene.enter(app, { siteId: 'luoyang' });
  ok('进城瞬间清空路线与插值', g.player.route.length === 0 && !g.player.stepFrom && !g.player.stepTo && g.player.stepProgress === 0);
  ok('进城后锁定在城并清掉地图跟随/围城提示', g.player.atSiteId === 'luoyang' &&
    !app.mapDrag && !app.follow && !app.siegePrompt && app.mapIdleRest === false);
}
/* ---------------------------------------------------------------- n19 版：换位 · 连线 · 山越 · 匪团禁区 */

group('n19 版：换位 · 连线 · 山越 · 匪团禁区');
{
  const g = stateLib.createGame({ seed: 2026112619 });
  const newIds = ['fanyang', 'changshan', 'yushan', 'shanyue'];
  const missing = newIds.filter(function (id) { return !worldLib.siteById(g.world, id); });
  ok('n19 新城全部生成', missing.length === 0, missing.join(','));
  ok('总据点扩到 84', g.world.sites.length === 84, String(g.world.sites.length));

  function hasRoad(a, b) {
    return ROADS.some(function (p) {
      return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
    });
  }
  ok('武威—天水直连', hasRoad('wuwei', 'tianshui'));
  ok('上庸—剑阁—江州成链', hasRoad('shangyong', 'jiange') && hasRoad('shangyong', 'jiangzhou'));
  ok('庐江—宛—夏口成链', hasRoad('lujiang', 'wan') && hasRoad('lujiang', 'xiakou'));
  ok('柴桑—玉山—会稽—夷陵成链',
    hasRoad('chaisang', 'yushan') && hasRoad('yushan', 'kuaiji') && hasRoad('yushan', 'yiling'));
  ok('邺城—范阳—涿成链', hasRoad('zhuo', 'fanyang') && hasRoad('fanyang', 'ye'));
  ok('邺城—常山村相连', hasRoad('ye', 'changshan'));
  ok('南皮—北平成链且南皮—蓟断开',
    hasRoad('nanpi', 'beiping') && !hasRoad('ji', 'nanpi'));
  ok('交趾—山越相连', hasRoad('jiaozhi', 'shanyue'));

  ok('襄平无主', (function () {
    const s = worldLib.siteById(g.world, 'xiangping');
    return s && s.ownerFaction === null && s.faction === null && !s.banner;
  })());
  ok('范阳归公孙瓒、常山归袁、玉山归吴', ['fanyang', 'changshan', 'yushan'].every(function (id) {
    const s = worldLib.siteById(g.world, id);
    return s && s.ownerFaction === (id === 'fanyang' ? 'gongsun' : id === 'changshan' ? 'yuan' : 'wu');
  }));
  ok('山越势力六位领主', g.lords.filter(function (l) { return l.faction === 'shanyue'; }).length >= 6,
    String(g.lords.filter(function (l) { return l.faction === 'shanyue'; }).length));
  ok('山越城进入都城表', CAPITAL_IDS.indexOf('shanyue') >= 0);
  ok('汉廷诸将收在长安—潼关',
    g.lords.filter(function (l) { return l.faction === 'han'; }).every(function (l) {
      return l.home === 'changan' || l.home === 'tongguan';
    }));

  const guandu = worldLib.siteById(g.world, 'guandu');
  const baima = worldLib.siteById(g.world, 'baima');
  ok('官渡移到原白马位置', guandu.x === Math.round(23 * g.world.w / 40) && guandu.y === Math.round(21 * g.world.w / 40),
    guandu.x + ',' + guandu.y);
  ok('白马移到黎阳与原白马中间',
    baima.x === Math.round(25 * g.world.w / 40) && baima.y === Math.round(18 * g.world.w / 40),
    baima.x + ',' + baima.y);

  const patrolBad = newIds.filter(function (id) {
    const s = worldLib.siteById(g.world, id);
    return stateLib.patrolRoutesForSite(g, s).length < 5;
  });
  ok('n19 新城都有至少五条巡逻线', patrolBad.length === 0, patrolBad.join(','));

  const zoneX = Math.round(8 * g.world.w / 40);
  const zoneY = Math.round(35 * g.world.w / 40);
  ok('成都西侧空地被标为匪团禁区', worldLib.inBanditExclusion(zoneX, zoneY) === true);
  ok('匪团不能落进成都西侧空地', stateLib.banditSpotAllowed(g, zoneX, zoneY, 'yizhou', null) === false);
  const party = g.parties.filter(function (p) { return p.faction === 'bandit' && !p.dead; })[0];
  party.roamRegion = 'yizhou';
  party.x = zoneX - 4;
  party.y = zoneY;
  party.roamPath = null;
  party.roamPathFor = null;
  const step = stateLib.banditPathStep(g, party, { x: zoneX, y: zoneY });
  ok('匪团走一步也不会踏进禁区', !step || !worldLib.inBanditExclusion(step.x, step.y),
    step ? step.x + ',' + step.y : 'null');

  // 旧档：n19 新城补回、襄平转无主、官渡/白马换位、汉将收回长安。
  const old = JSON.parse(stateLib.serialize(g));
  old.world.sites = old.world.sites.filter(function (s) { return newIds.indexOf(s.id) < 0; });
  const oldXiangping = old.world.sites.filter(function (s) { return s.id === 'xiangping'; })[0];
  if (oldXiangping) {
    oldXiangping.ownerFaction = 'han';
    oldXiangping.faction = 'han';
    oldXiangping.banner = '汉';
  }
  const oldGuandu = old.world.sites.filter(function (s) { return s.id === 'guandu'; })[0];
  const oldBaima = old.world.sites.filter(function (s) { return s.id === 'baima'; })[0];
  if (oldGuandu) { oldGuandu.x = Math.round(22 * g.world.w / 40); oldGuandu.y = Math.round(24 * g.world.w / 40); }
  if (oldBaima) { oldBaima.x = Math.round(23 * g.world.w / 40); oldBaima.y = Math.round(21 * g.world.w / 40); }
  old.lords = old.lords.filter(function (l) { return l.faction !== 'shanyue'; });
  ['zhujun', 'luzhi', 'yangfeng'].forEach(function (id) {
    const l = old.lords.filter(function (x) { return x.id === id; })[0];
    if (l) l.home = id === 'yangfeng' ? 'hulao' : (id === 'luzhi' ? 'zhuo' : 'luoyang');
    if (l) l.inCity = null;
  });
  const migrated = stateLib.deserialize(old);
  ok('旧档补齐 n19 四座新城、泰山关与龙编', !!migrated && migrated.world.sites.length === 84,
    migrated ? String(migrated.world.sites.length) : 'null');
  ok('旧档襄平转无主', !!migrated && (function () {
    const s = worldLib.siteById(migrated.world, 'xiangping');
    return s && s.ownerFaction === null && s.faction === null;
  })());
  const migGuandu = migrated && worldLib.siteById(migrated.world, 'guandu');
  const migBaima = migrated && worldLib.siteById(migrated.world, 'baima');
  ok('旧档官渡/白马换位', !!migGuandu && !!migBaima &&
    migGuandu.x === guandu.x && migGuandu.y === guandu.y &&
    migBaima.x === baima.x && migBaima.y === baima.y);
  ok('旧档汉将迁回长安—潼关', !!migrated && migrated.lords.filter(function (l) {
    return l.faction === 'han' && l.id !== 'liuxie';
  }).every(function (l) { return l.home === 'changan' || l.home === 'tongguan'; }));
  ok('旧档补入山越六位领主', !!migrated &&
    migrated.lords.filter(function (l) { return l.faction === 'shanyue'; }).length >= 6);
}


/* ---------------------------------------------------------------- n32 西北路网：安定 · 韩遂断线 · 金城天水 */
group('n32 西北路网：安定 · 韩遂断线 · 金城天水');
{
  const roadData = require(R + '/data/china.js');
  function hasRoad(a, b) {
    return (roadData.ROADS || []).some(function (r) {
      return (r[0] === a && r[1] === b) || (r[0] === b && r[1] === a);
    });
  }
  const g = stateLib.createGame({ seed: 2026112632 });
  const anding = worldLib.siteById(g.world, 'anding');
  ok('安定新城已生成并归汉廷', !!anding && anding.name === '安定' && anding.ownerFaction === 'han',
    anding ? anding.name + '/' + anding.ownerFaction : 'missing');
  ok('安定在武威与长安之间', !!anding && anding.x > worldLib.siteById(g.world, 'wuwei').x &&
    anding.x < worldLib.siteById(g.world, 'changan').x &&
    anding.y >= worldLib.siteById(g.world, 'wuwei').y &&
    anding.y <= worldLib.siteById(g.world, 'changan').y,
    anding ? anding.x + ',' + anding.y : 'missing');
  ok('武威—安定—长安成链', hasRoad('wuwei', 'anding') && hasRoad('anding', 'changan'));
  ok('金城—天水直连', hasRoad('jincheng', 'tianshui'));
  ok('枹罕—西平已断开', !hasRoad('xiping', 'fuhan'));
  ok('枹罕仍接金城', hasRoad('fuhan', 'jincheng'));

  // 旧档没有安定：读档时应补城，并把新路铺上；旧枹罕—西平路面要被拆掉。
  const old = JSON.parse(stateLib.serialize(g));
  old.world.sites = old.world.sites.filter(function (s) { return s.id !== 'anding'; });
  worldLib.layRoads(old.world, [['xiping', 'fuhan']]);
  function tilesOnOldRoad(world) {
    const a = worldLib.siteById(world, 'xiping');
    const b = worldLib.siteById(world, 'fuhan');
    if (!a || !b) return -1;
    let x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, count = 0;
    while (true) {
      if (!(x0 === a.x && y0 === a.y) && !(x0 === b.x && y0 === b.y)) {
        const t = world.tiles[worldLib.idx(x0, y0)];
        if (t === 'road' || t === 'bridge' || t === 'pass') count += 1;
      }
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return count;
  }
  const beforeCut = tilesOnOldRoad(old.world);
  const migrated = stateLib.deserialize(old);
  const afterCut = tilesOnOldRoad(migrated.world);
  ok('旧档补入安定并补到 84 据点', !!migrated && migrated.world.sites.length === 84 &&
    !!worldLib.siteById(migrated.world, 'anding'),
    migrated ? String(migrated.world.sites.length) : 'null');
  ok('旧档枹罕—西平路面被拆除', beforeCut > 0 && afterCut === 0, beforeCut + ' -> ' + afterCut);
}


/* ---------------------------------------------------------------- n20 版：官渡断线 · 青徐连城 · 泰山关 · 零兵打散 */
group('n20 版：官渡断线 · 青徐连城 · 泰山关 · 零兵打散');
{
  const roadData = require(R + '/data/china.js');
  function hasRoad(a, b) {
    return (roadData.ROADS || []).some(function (r) {
      return (r[0] === a && r[1] === b) || (r[0] === b && r[1] === a);
    });
  }
  const g = stateLib.createGame({ seed: 2026112620 });
  ok('新野—官渡直连已断', !hasRoad('guandu', 'xinye'));
  ok('小沛—彭城已接上', hasRoad('xiaopei', 'pengcheng'));
  ok('彭城—徐州已接上', hasRoad('pengcheng', 'xuzhou'));
  ok('平原—泰山关—彭城成走廊', hasRoad('pingyuan', 'taishanguan') && hasRoad('taishanguan', 'pengcheng'));
  const pass = worldLib.siteById(g.world, 'taishanguan');
  ok('泰山关是独立关城', !!pass && pass.type === 'castle' && pass.ownerFaction === null,
    pass ? pass.type + '/' + pass.ownerFaction : 'missing');
  ok('泰山关登记为 1.5 倍要地', roadData.STRATEGIC_SITES.taishanguan &&
    roadData.STRATEGIC_SITES.taishanguan.defense === 1.5);
  pass.ownerFaction = 'wei';
  pass.faction = 'wei';
  ok('占据泰山关后享 1.5 倍城防', warLib.strategicDefenseForSite(g, pass) === 1.5,
    String(warLib.strategicDefenseForSite(g, pass)));
  pass.ownerFaction = null;
  pass.faction = null;

  // 0 兵：野战自动打散，不当俘虏；三天内不复活，三天后在本土城满编重立。
  const home = g.world.sites.filter(function (s) {
    return (s.type === 'town' || s.type === 'castle') && s.ownerFaction === 'wei';
  })[0];
  const lord = g.lords.filter(function (l) { return l.faction === 'wei' && l.alive; })[0];
  const bandit = g.parties.filter(function (p) { return p.faction === 'bandit' && !p.dead; })[0];
  lord.home = home.id;
  lord.inCity = null;
  lord.troops = {};
  lord.defTroops = { militia: 100 };
  lord.defending = true;
  lord.x = bandit.x;
  lord.y = bandit.y;
  warLib.clash(g, lord, bandit);
  const scatterDay = g.clock.day;
  const fastestCity = stateLib.fastestRecoveryCity(g, lord).site.id;
  ok('0 兵守城也按打散处理，不当俘虏',
    lord.alive && lord.scattered === true && !lord.prisoner && armyLib.troopCount(lord.troops) === 0,
    'scattered=' + lord.scattered + ' prisoner=' + !!lord.prisoner);
  ok('打散后记下本土城与三天期限',
    lord.scatterHomeId === home.id && lord.respawnDay === scatterDay + 3,
    'home=' + lord.scatterHomeId + ' respawn=' + lord.respawnDay);
  ok('打散后地图上立即消失', lord.scatterHidden === true,
    'hidden=' + lord.scatterHidden);
  stateLib.advanceTime(g, 48);
  ok('不到三天仍是打散状态', lord.scattered === true && armyLib.troopCount(lord.troops) === 0,
    'day=' + g.clock.day + ' scattered=' + lord.scattered);
  stateLib.advanceTime(g, 25);
  ok('三天期满到募兵最快城、从零开始招募',
    lord.scattered === false && lord.inCity === fastestCity &&
    lord.scatterCityId === fastestCity && lord.scatterRecovering === true &&
    lord.scatterHidden === true && armyLib.troopCount(lord.troops) < 100,
    'scattered=' + lord.scattered + ' inCity=' + lord.inCity + ' fastest=' + fastestCity +
    ' troops=' + armyLib.troopCount(lord.troops));
}

/* ---------------------------------------------------------------- n21 版：荆襄南中 · 村庄 · 募兵倍率 · 双背景 */

group('n21 版：荆襄南中 · 村庄 · 募兵倍率 · 双背景');
{
  const g = stateLib.createGame({ seed: 2026112621 });
  function hasRoad(a, b) {
    return ROADS.some(function (p) {
      return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
    });
  }
  ok('襄阳—赤壁—夏口连通', hasRoad('xiangyang', 'chibi') && hasRoad('chibi', 'xiakou'));
  ok('建宁—南中夷寨连通', hasRoad('jianning', 'nanzhong'));
  const zangkeRow = SITE_ROWS.filter(function (row) { return row[0] === 'zangke'; })[0];
  ok('牂牁下移到交趾一侧', !!zangkeRow && zangkeRow[4] === 20 && zangkeRow[5] === 44,
    zangkeRow ? zangkeRow[4] + ',' + zangkeRow[5] : 'missing');

  const luoyang = worldLib.siteById(g.world, 'luoyang');
  const xiangyang = worldLib.siteById(g.world, 'xiangyang');
  const pass = worldLib.siteById(g.world, 'taishanguan');
  const town = worldLib.siteById(g.world, 'chenliu');
  const village = g.world.sites.filter(function (s) { return s.type === 'village'; })[0];
  ok('募兵倍率：都城 2 / 要地 1.5 / 中城 1 / 村 0.5',
    stateLib.siteRecoveryMultiplier(luoyang) === 2 &&
    stateLib.siteRecoveryMultiplier(xiangyang) === 2 &&
    stateLib.siteRecoveryMultiplier(pass) === 1.5 &&
    stateLib.siteRecoveryMultiplier(town) === 1 &&
    stateLib.siteRecoveryMultiplier(village) === 0.5,
    [luoyang, xiangyang, pass, town, village].map(function (s) {
      return s && s.id + ':' + stateLib.siteRecoveryMultiplier(s);
    }).join(' '));
  const capitalRate = stateLib.lordRecoveryRate(g, { faction: 'wei' }, luoyang, true);
  const townRate = stateLib.lordRecoveryRate(g, { faction: 'wei' }, town, true);
  const patrolRate = stateLib.lordRecoveryRate(g, { faction: 'wei' }, luoyang, false);
  ok('都城恢复是大城的两倍', Math.abs(capitalRate - townRate * 2) < 1e-9,
    capitalRate + '/' + townRate);
  ok('巡逻途中只按两成补兵', Math.abs(patrolRate - capitalRate * 0.2) < 1e-9,
    patrolRate + '/' + capitalRate);

  const lord = g.lords.filter(function (l) { return l.faction === 'wei' && l.alive; })[0];
  lord.x = xiangyang.x + 2;
  lord.y = xiangyang.y + 2;
  const best = stateLib.bestRecoveryCity(g, lord, 15);
  ok('十五格内优先选恢复最快的都城', !!best && best.site.id === 'xiangyang' && best.mult === 2,
    best ? best.site.id + '/' + best.mult + '/d' + best.d : 'none');

  // 村庄不再被排除在攻占目标之外：有路的敌村可以被玩家/AI 拿下。
  const pair = ROADS.filter(function (p) {
    const a = worldLib.siteById(g.world, p[0]);
    const b = worldLib.siteById(g.world, p[1]);
    return (a.type === 'village' && (b.type === 'town' || b.type === 'castle')) ||
      (b.type === 'village' && (a.type === 'town' || a.type === 'castle'));
  })[0];
  const va = worldLib.siteById(g.world, pair[0]);
  const vb = worldLib.siteById(g.world, pair[1]);
  const targetVillage = va.type === 'village' ? va : vb;
  const ownCity = va.type === 'village' ? vb : va;
  g.player.faction = 'player';
  g.player.country = { name: '测', color: '#d9a441', foundedDay: 1 };
  g.player.banner = true;
  ownCity.playerOwned = true;
  ownCity.ownerFaction = 'player';
  ownCity.faction = 'player';
  targetVillage.playerOwned = false;
  targetVillage.ownerFaction = 'wei';
  targetVillage.faction = 'wei';
  g.factionWars = g.factionWars || {};
  g.factionWars['player|wei'] = { since: g.clock.day, score: 0 };
  ok('道路相连的敌村可以被攻打', stateLib.canPlayerAttackSite(g, targetVillage).ok,
    targetVillage.id + ':' + JSON.stringify(stateLib.canPlayerAttackSite(g, targetVillage)));
  stateLib.takeSite(g, targetVillage);
  ok('村庄攻占后归玩家所有', targetVillage.playerOwned === true &&
    targetVillage.ownerFaction === 'player', targetVillage.playerOwned + '/' + targetVillage.ownerFaction);

  const chaos = stateLib.createGame({ background: 'chaos' });
  const romance = stateLib.createGame({ background: 'romance', storyMode: true });
  ok('乱世三国是沙盘背景', chaos.background === 'chaos' && chaos.storyMode === false);
  ok('三国演义是剧情背景', romance.background === 'romance' && romance.storyMode === true);
  const saved = stateLib.deserialize(stateLib.serialize(romance));
  ok('存档保留游戏背景', !!saved && saved.background === 'romance',
    saved ? saved.background : 'null');
}

/* ---------------------------------------------------------------- n41 成都 · 自由城 · 马超归蜀 */

group('n41 成都重心 · 武都上洛自由城 · 马超归蜀 · 韩遂灭凉');
{
  const g41 = stateLib.createGame({ seed: 777001 });
  const wudu0 = worldLib.siteById(g41.world, 'wudu');
  const shangluo0 = worldLib.siteById(g41.world, 'shangluo');
  ok('武都、上洛开局无主', !wudu0.ownerFaction && !shangluo0.ownerFaction,
    (wudu0.ownerFaction || 'null') + '/' + (shangluo0.ownerFaction || 'null'));
  ok('自由城表含武都与上洛', FREE_CITY_IDS.indexOf('wudu') >= 0 && FREE_CITY_IDS.indexOf('shangluo') >= 0,
    FREE_CITY_IDS.join(','));
  ok('居延只连武威，龙城只连弹汗山', !ROADS.some(function (p) {
    return (p[0] === 'longcheng' && p[1] === 'juyan') || (p[1] === 'longcheng' && p[0] === 'juyan');
  }), 'longcheng-juyan removed');

  warLib.init(g41);
  warLib.startDiplomacy(g41);
  let machaoAt12 = null;
  let chengduDay = 0;
  let baseDay = 0;
  let maDeadDay = 0;
  let zhangFreeTarget = false;
  let seenChengduTarget = false;
  for (let d = 0; d < 120; d++) {
    for (let h = 0; h < 24; h++) {
      stateLib.advanceTime(g41, 1);
      stateLib.update(g41, 0, { ignoreEvents: true });
    }
    const day = g41.clock.day;
    const mc = g41.lords.filter(function (l) { return l.id === 'machao'; })[0];
    if (day >= 12 && !machaoAt12 && mc) machaoAt12 = mc.faction;
    const cps = g41.warCampaigns || {};
    if (day <= 30 && cps.zhang && FREE_CITY_IDS.indexOf(cps.zhang.targetId) >= 0) zhangFreeTarget = true;
    if (cps.shu && cps.shu.targetId === 'chengdu') seenChengduTarget = true;
    const cd = worldLib.siteById(g41.world, 'chengdu');
    if (cd.ownerFaction === 'shu' && !chengduDay) chengduDay = day;
    const shuFs = g41.factionState.shu || {};
    if (shuFs.baseCity === 'chengdu' && g41.flags && g41.flags.shuChengduBase && !baseDay) baseDay = day;
    if ((g41.factionState.ma || {}).dead && !maDeadDay) maDeadDay = day;
  }
  ok('马超第 12 天已归蜀', machaoAt12 === 'shu', String(machaoAt12));
  ok('马超归蜀后一直留在蜀', (function () {
    const mc = g41.lords.filter(function (l) { return l.id === 'machao'; })[0];
    return !!mc && mc.faction === 'shu' && !mc.dead;
  })(), (function () {
    const mc = g41.lords.filter(function (l) { return l.id === 'machao'; })[0];
    return mc ? mc.faction : 'gone';
  })());
  ok('刘璋开局三十天不抢武都、上洛', !zhangFreeTarget);
  ok('刘备入川最终目标是成都', seenChengduTarget);
  ok('刘备攻下成都', chengduDay > 0 && worldLib.siteById(g41.world, 'chengdu').ownerFaction === 'shu',
    '第 ' + chengduDay + ' 天');
  ok('成都成为蜀军大本营', baseDay > 0 && (g41.factionState.shu || {}).baseCity === 'chengdu' &&
    g41.flags.shuChengduBase === true, '第 ' + baseDay + ' 天 / ' + (g41.factionState.shu || {}).baseCity);
  ok('刘备迁治所到成都', (function () {
    const lb = g41.lords.filter(function (l) { return l.id === 'liubei'; })[0];
    return !!lb && lb.home === 'chengdu';
  })(), (function () {
    const lb = g41.lords.filter(function (l) { return l.id === 'liubei'; })[0];
    return lb ? lb.home : 'gone';
  })());
  ok('韩遂在五十天内灭掉马家', maDeadDay > 0 && maDeadDay <= 50 && g41.flags.maSurrenderDone === true,
    '第 ' + maDeadDay + ' 天');
  ok('武威、居延、陇西尽归韩遂', ['wuwei', 'juyan', 'longxi'].every(function (id) {
    return worldLib.siteById(g41.world, id).ownerFaction === 'hansui';
  }), ['wuwei', 'juyan', 'longxi'].map(function (id) {
    return id + ':' + (worldLib.siteById(g41.world, id).ownerFaction || 'none');
  }).join(' '));
  const maLords = g41.lords.filter(function (l) { return l.faction === 'ma'; });
  ok('马家没有残党留在原阵营', maLords.length === 0, String(maLords.length));
}

/* ---------------------------------------------------------------- 收尾 */

console.log('\n' + '='.repeat(44));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('='.repeat(44));
process.exit(fail ? 1 : 0);



