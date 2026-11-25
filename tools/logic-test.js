/**
 * 逻辑测试：node tools/logic-test.js
 * 覆盖世界生成、开局、行军、经济、战斗、史简、势力、领主、劫掠、战役、结局、存档
 */

const path = require('path');
const R = path.join(__dirname, '..', 'js');

const worldLib = require(R + '/core/world.js');
const stateLib = require(R + '/core/state.js');
const armyLib = require(R + '/core/army.js');
const economy = require(R + '/core/economy.js');
const trade = require(R + '/core/trade.js');
const territory = require(R + '/core/territory.js');
const { Battle } = require(R + '/core/battle.js');
const { RNG } = require(R + '/rng.js');
const { TROOPS } = require(R + '/data/troops.js');
const { FACTIONS, CAMPAIGN, SITE_ROWS, CAPITAL_IDS, LORDS, HISTORY_MARKS, TERRAIN } = require(R + '/data/china.js');
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
  // 新规则：先走到城池中心，再等这一步走完才收旗
  ok('到城下会先迈最后半步进城中心', lordForRecruit.enteringSiteId === lordSite.id &&
    lordForRecruit.x === lordSite.x && lordForRecruit.y === lordSite.y,
    'entering=' + lordForRecruit.enteringSiteId + ' at=' + lordForRecruit.x + ',' + lordForRecruit.y);
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

const calm = runWith('calm');
function firstRoundRemain(mark) {
  const b = new Battle({
    rng: new RNG(4242),
    attacker: { name: '我', troops: { militia: 120 }, morale: 70, isPlayer: true },
    defender: { name: '袁军', troops: { militia: 120 }, morale: 70 },
  });
  if (mark) b.applyShiMark(mark);
  b.step();
  return { a: b.remainA(), b: b.remainB() };
}
const p1 = firstRoundRemain(null);
const c1 = firstRoundRemain('calm');
ok('风止不削我方攻势，只压敌军', c1.a >= p1.a && c1.b <= p1.b,
  '我' + c1.a + '/' + p1.a + ' 敌' + c1.b + '/' + p1.b);

const rollB = runWith('roll');
ok('名册可记录', rollB.shiMark === 'roll');
ok('南风起是战中效果', wind.shiTiming === 'battle');
ok('风止是战中效果', calm.shiTiming === 'battle');
ok('名册是战后效果', rollB.shiTiming === 'after');
ok('名册在战斗过程中不提前结算', rollB.summary().round === plain.summary().round &&
  rollB.summary().remainA === plain.summary().remainA,
  rollB.summary().remainA + '/' + plain.summary().remainA);
ok('天机简效果已整体翻倍', HISTORY_MARKS.wind.atkMul === 2.80 && HISTORY_MARKS.wind.fireMul === 2.00 &&
  HISTORY_MARKS.calm.enemyMul === 0.10 && HISTORY_MARKS.roll.backPct === 1.00,
  JSON.stringify({ wind: HISTORY_MARKS.wind.atkMul, calm: HISTORY_MARKS.calm.enemyMul, roll: HISTORY_MARKS.roll.backPct }));

const midWind = new Battle({
  rng: new RNG(4242),
  attacker: { name: '我', troops: { militia: 80 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 80 }, morale: 70 },
});
midWind.step();
midWind.applyShiMark('wind');
ok('战中落笔南风起即时生效', midWind.shiTiming === 'battle' && midWind.fireGround === true);
const midCalm = new Battle({
  rng: new RNG(4242),
  attacker: { name: '我', troops: { militia: 80 }, morale: 70, isPlayer: true },
  defender: { name: '袁军', troops: { militia: 80 }, morale: 70 },
});
midCalm.step();
midCalm.applyShiMark('calm');
ok('战中落笔风止从下一回合起算三回合', midCalm.shiTiming === 'battle' && midCalm.shiRounds === 3);

// 走完整流程：用 state 应用名册
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
const sum = stateLib.resolveBattle(st, st.battle);
ok('名册战后回归士兵', sum.remainA > 0 && armyLib.troopCount(st.player.troops) > sum.remainA - 1,
  '剩' + sum.remainA);
ok('名册翻倍后全部阵亡者归队', sum.remainA === sum.initialA && sum.rollBack > 0,
  '归队 ' + (sum.rollBack || 0) + ' / 初始 ' + sum.initialA);

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
stateLib.takeSite(st4, target);
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
const warLib = require(R + '/core/war.js');
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
ok('宣战能生效', warLib.declare(st7, 'shu', 'wu', true) === true || warLib.atWar(st7, 'shu', 'wu'));
ok('重复宣战不重复记', warLib.declare(st7, 'shu', 'wu', true) === false);
ok('议和能停战', (function () {
  warLib.makePeace(st7, 'shu', 'wu', true);
  return !warLib.atWar(st7, 'shu', 'wu');
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
failBattle.finish('lose');
const failSummary = stateLib.resolveBattle(stU, failBattle);
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

group('自己国家的领主不乱开战');
{
  const g = stateLib.createGame({ seed: 8130 });
  g.player.faction = 'wei';
  ok('自己国家不会被 AI 拉着宣战', !warLib.aiCanDeclare(g, 'wei', 'shu'));
  ok('别国也不会被 AI 拉来打自己国家', !warLib.aiCanDeclare(g, 'shu', 'wei'));
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
  // 逃遁比正常行军快，但只快约一半：4.5 时辰/格，而不是 3 时辰/格
  const g = stateLib.createGame({ seed: 2026112513 });
  g.parties = [];
  const lord = g.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const home = g.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  lord.inCity = null; lord.order = null; lord.pauseUntil = 0; lord.moveTick = 0;
  lord.engagedWith = null; lord.x = home.x + 5; lord.y = home.y;
  lord.troops = { militia: 100 }; lord.defTroops = { militia: 100 };
  lord.fleeing = true; lord.fleeTargetId = home.id; lord.fleePath = null;
  stateLib.moveLords(g);
  ok('逃遁步速略快于正常行军', lord.stepHours > 3 && lord.stepHours < 6, 'stepHours=' + lord.stepHours);
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
  warLib.declare(g, 'wei', 'shu', false);
  ok('关闭战和提醒后不弹军情', g.events.length === n0, 'events=' + (g.events.length - n0));
  g.settings.diplomacyAlerts = true;
  warLib.declare(g, 'wu', 'shu', false);
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
ok('穿山峡谷有横竖两种方向', (world.canyons || []).length >= 8 &&
  (world.canyons || []).some(function (c) { return c.dir === 'h'; }) &&
  (world.canyons || []).some(function (c) { return c.dir === 'v'; }),
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
  warLib.declare(g, 'wei', 'shu', true);
  warLib.declare(g, 'wei', 'ma', true);
  ok('一国最多同时与三国开战', warLib.warPartners(g, 'wei').length === 3 &&
    !warLib.declare(g, 'wei', 'han', true), JSON.stringify(warLib.warPartners(g, 'wei')));
  ok('超过三国时宣战被拒', !warLib.canOpenWar(g, 'wei', 'han'));
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
    Math.max(Math.abs(weak.x - strong.x), Math.abs(weak.y - strong.y)) >= 2,
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
  ok('汉中左上/右上峡谷为斜向', hanzhongCanyons.length >= 4 &&
    hanzhongCanyons.every(function (c) { return c.dir === 'd1' || c.dir === 'd2'; }) &&
    hanzhongCanyons.some(function (c) { return c.x < 51; }) &&
    hanzhongCanyons.some(function (c) { return c.x > 51; }), JSON.stringify(hanzhongCanyons));
  ok('斜峡谷的两格山口可通行', worldLib.terrainAt(g.world, 59, 85).id === 'pass' &&
    worldLib.terrainAt(g.world, 60, 86).id === 'pass', '59,85 / 60,86');

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

group('n3b 版：匪团州内活动 · 四格追匪 · 三小时交战');
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

  // 领主只有身边四格内才会主动追匪。
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
      ok('匪团在五格外时领主不主动追', !distant || distant.role !== 'hunt',
        distant ? distant.role : 'none');
      party.x = spot[0] + 4;
      const close = stateLib.lordThreatFor(g, lord, true, false);
      ok('匪团进四格内领主开始追', !!close && close.role === 'hunt' && close.target.unit.id === party.id,
        close ? close.role : 'none');

      // 交战至少撑满三时辰：100 打 8，也不能在头一两个时辰直接抹掉。
      party.x = lord.x + 1;
      party.y = lord.y;
      party.engagedWith = lord.id;
      party.engagedSinceH = stateLib.gameHours(g) - 1;
      lord.engagedWith = 'party:' + party.id;
      lord.engagedSinceH = party.engagedSinceH;
      stateLib.fightNeighbors(g);
      ok('交战未满三时辰不会结算', !party.dead, 'dead=' + !!party.dead);
      party.engagedSinceH = stateLib.gameHours(g) - 3;
      lord.engagedSinceH = party.engagedSinceH;
      stateLib.fightNeighbors(g);
      ok('交战满三时辰后才可能打散匪团', !!party.dead, 'dead=' + !!party.dead);
    } else {
      ok('匪团在五格外时领主不主动追', false, 'setup missing');
      ok('匪团进四格内领主开始追', false, 'setup missing');
      ok('交战未满三时辰不会结算', false, 'setup missing');
      ok('交战满三时辰后才可能打散匪团', false, 'setup missing');
    }
  } else {
    ok('匪团在五格外时领主不主动追', false, 'lord/party missing');
    ok('匪团进四格内领主开始追', false, 'lord/party missing');
    ok('交战未满三时辰不会结算', false, 'lord/party missing');
    ok('交战满三时辰后才可能打散匪团', false, 'lord/party missing');
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

/* ---------------------------------------------------------------- 收尾 */

console.log('\n' + '='.repeat(44));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('='.repeat(44));
process.exit(fail ? 1 : 0);



