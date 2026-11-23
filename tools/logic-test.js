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
const { Battle } = require(R + '/core/battle.js');
const { RNG } = require(R + '/rng.js');
const { TROOPS } = require(R + '/data/troops.js');
const { FACTIONS, CAMPAIGN, SITE_ROWS } = require(R + '/data/china.js');

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

/* ---------------------------------------------------------------- 世界 */

group('世界生成');
const world = worldLib.createWorld(20260101);
ok('地图尺寸 64x77', world.w === 64 && world.h === 77, world.w + 'x' + world.h);
ok('据点 55 个', world.sites.length === 55, String(world.sites.length));
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
ok('玩家 30 民兵', armyLib.troopCount(st.player.troops) === 30, JSON.stringify(st.player.troops));
ok('金 80 / 粮 45', st.player.gold === 80 && st.player.food === 45, st.player.gold + '/' + st.player.food);
ok('史简 1 支', st.player.shi === 1, String(st.player.shi));
ok('领主 21 位', st.lords.length === 21, String(st.lords.length));
ok('无旗', st.player.banner === false);
ok('开局不在城内', st.player.atSiteId === null);

const chase = st.parties.filter(function (p) { return p.scripted; })[0];
ok('序章追兵存在', !!chase, '西凉铁骑');
ok('追兵距离 ≥ 4', chase && worldLib.gridDistance(chase, st.player) >= 4,
  chase ? String(worldLib.gridDistance(chase, st.player)) : 'none');
ok('追兵是 60 骑', chase && armyLib.strength(chase.troops).cavRatio === 1);

/* ---------------------------------------------------------------- 行军 */

group('行军与序章');
// 开局的章节弹窗事件在真实游戏里由 flows.process 消费掉，这里先清空再测行军
st.events.length = 0;
const goTarget = worldLib.siteById(st.world, 'chenliu');
const go = stateLib.goTo(st, goTarget.x, goTarget.y);
ok('可下达行军命令', go.ok, go.msg);
let frames = 0;
while (st.player.route.length && frames < 2000 && !st.events.length) {
  stateLib.update(st, 0.05);
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
ok('招兵接口可用', rec.ok || rec.msg.indexOf('金币') >= 0 || rec.msg.indexOf('满编') >= 0, rec.msg);

const eqBefore = st.player.equip.blade;
st.player.gold = 9999;
const up = economy.upgradeEquipment(st, 'blade');
ok('换装成功', up.ok, up.msg);
ok('换装提升一档', st.player.equip.blade === eqBefore + 1);

/* ---------------------------------------------------------------- 战斗 */

group('战斗');
const rng = new RNG(777);
const b1 = new Battle({
  rng,
  attacker: { name: '我', troops: { militia: 26 }, morale: 70, isPlayer: true },
  defender: { name: '山贼', troops: { bandit: 15 }, morale: 60 },
});
let rounds = 0;
while (!b1.finished && rounds < 20) { b1.step(); rounds++; }
ok('26 打 15 山贼能赢', b1.result === 'win', b1.result + ' 轮' + b1.round);
ok('赢也会掉人', b1.summary().remainA < 26 && b1.summary().remainA > 15,
  '剩 ' + b1.summary().remainA);

const b2 = new Battle({
  rng,
  attacker: { name: '我', troops: { militia: 30 }, morale: 60, isPlayer: true },
  defender: { name: '西凉铁骑', troops: { cav: 40, tiefu: 20 }, morale: 90 },
});
while (!b2.finished) { b2.step(); }
ok('30 民兵打不过 60 西凉铁骑', b2.result !== 'win', b2.result);

const b3 = new Battle({
  rng,
  attacker: { name: '我', troops: { militia: 20 }, morale: 60, isPlayer: true },
  defender: { name: '山贼', troops: { bandit: 12 }, morale: 60 },
});
b3.retreat();
ok('撤退成立', b3.result === 'retreat' && b3.retreated);
ok('撤退额外掉 25%', b3.summary().remainA <= 16, '剩 ' + b3.summary().remainA);

/* ---------------------------------------------------------------- 史简 */

group('史简');
function runWith(mark) {
  const b = new Battle({
    rng: new RNG(4242),
    attacker: { name: '我', troops: { militia: 40 }, morale: 70, isPlayer: true },
    defender: { name: '袁军', troops: { militia: 40 }, morale: 70 },
  });
  if (mark) b.applyShiMark(mark);
  while (!b.finished) b.step();
  return b;
}
const plain = runWith(null);
const wind = runWith('wind');
ok('南风起让我方输出更高', wind.summary().remainB < plain.summary().remainB,
  wind.summary().remainB + ' vs ' + plain.summary().remainB);

const calm = runWith('calm');
function firstRoundRemain(mark) {
  const b = new Battle({
    rng: new RNG(4242),
    attacker: { name: '我', troops: { militia: 40 }, morale: 70, isPlayer: true },
    defender: { name: '袁军', troops: { militia: 40 }, morale: 70 },
  });
  if (mark) b.applyShiMark(mark);
  b.step();
  return { a: b.remainA(), b: b.remainB() };
}
const p1 = firstRoundRemain(null);
const c1 = firstRoundRemain('calm');
ok('风止单轮双方都少死人', c1.a > p1.a && c1.b > p1.b,
  '我' + c1.a + '/' + p1.a + ' 敌' + c1.b + '/' + p1.b);

const rollB = runWith('roll');
ok('名册可记录', rollB.shiMark === 'roll');

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
ok('用史简会得罪所有人', st.relations.wei < 0, String(st.relations.wei));
while (!st.battle.finished) st.battle.step();
const sum = stateLib.resolveBattle(st, st.battle);
ok('名册战后回归士兵', sum.remainA > 0 && armyLib.troopCount(st.player.troops) > sum.remainA - 1,
  '剩' + sum.remainA);

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
stateLib.update(st2, 0.05);
ok('敌对领主会追近', worldLib.gridDistance(lord, st2.player) <= dBefore, dBefore + ' → ' + worldLib.gridDistance(lord, st2.player));
ok('领主视野内标记追击', lord.chasing === true);

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
const siege = stateLib.startSiege(st4, target);
ok('攻城战可开', !!siege && siege.b.initialCount > 40, String(siege && siege.b.initialCount));
stateLib.takeSite(st4, target);
ok('拿城后归自己', target.playerOwned === true);
ok('拿城掉原主关系', st4.relations.lv < -50, String(st4.relations.lv));
ok('拿城统计 +1', st4.stats.sitesTaken === 1);

/* ---------------------------------------------------------------- 战役 */

group('战役链');
const st5 = stateLib.createGame({ seed: 555 });
st5.campaign.stage = 2;
const wuchao = stateLib.startCampaignBattle(st5, 'wuchao');
ok('乌巢战役可开', !!wuchao && wuchao.b.initialCount === 170, String(wuchao && wuchao.b.initialCount));
ok('乌巢是火攻战场', wuchao.fireGround === true);
st5.battle.b.troops = { militia: 4 };
while (!st5.battle.finished) st5.battle.step();
st5.player.troops = { militia: 40, spear: 20, archer: 10 };
const res = stateLib.resolveBattle(st5, wuchao);
ok('乌巢可胜', res.result === 'win', res.result);
ok('乌巢改写袁军', st5.flags.win_act2 === true && st5.world.sites.filter(function (s) {
  return s.ownerFaction === 'yuan';
}).every(function (s) { return s.garrisonBase <= 80; }));
ok('战役推进到第三幕', st5.campaign.stage >= 3, String(st5.campaign.stage));

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
ok('读档保留地主', loaded && loaded.lords.length === 21);
ok('旧档被拒绝', stateLib.deserialize(JSON.stringify({ world: st6.world, player: st6.player })) === null);
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

/* ---------------------------------------------------------------- 收尾 */

console.log('\n' + '='.repeat(44));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('='.repeat(44));
process.exit(fail ? 1 : 0);
