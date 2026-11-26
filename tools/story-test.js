/**
 * 汉末战略（juqing）逻辑测试：
 * node tools/story-test.js
 *
 * 只测剧情分支；原有 n19 逻辑测试仍跑 createGame({})，两套互不干扰。
 */

const path = require('path');
const R = path.join(__dirname, '..', 'js');

const stateLib = require(R + '/core/state.js');
const warLib = require(R + '/core/war.js');
const story = require(R + '/core/story.js');
const { STORY } = require(R + '/data/story.js');
const { ROADS, FACTIONS } = require(R + '/data/china.js');

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

function game(seed) {
  return stateLib.createGame({ seed: seed || 20261126, storyMode: true });
}

function tickDay(st, day) {
  st.clock.day = day;
  story.tick(st);
}

function takeAll(st, from, to) {
  st.world.sites.forEach(function (s) {
    if (s.ownerFaction === from) s.ownerFaction = to;
  });
}

/** 据点之间是否有城道（测试自己的邻接表，不依赖内部实现） */
function roadAdjacent(a, b) {
  return ROADS.some(function (p) {
    return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
  });
}

/* ---------------------------------------------------------------- 开局 */

group('开局战略');
{
  const st = game();
  ok('剧情模式已开启', !!(st.story && st.story.mode));
  ok('普通模式仍是旧天下', stateLib.createGame({ seed: 1 }).storyMode !== true);

  const wars = Object.keys(st.factionWars || {});
  ok('曹操开局只打吕布', warLib.atWar(st, 'wei', 'lv'));
  ok('孙权开局只打刘表', warLib.atWar(st, 'wu', 'biao'));
  ok('袁绍与公孙瓒开局死战', warLib.atWar(st, 'yuan', 'gongsun'));
  ok('刘备开局尚未攻刘璋', !warLib.atWar(st, 'shu', 'zhang'));
  ok('没有旧的随机战事', wars.indexOf('ma|wei') < 0 && wars.indexOf('han|ma') < 0 &&
    wars.indexOf('lv|yuanshu') < 0 && wars.indexOf('wei|shu') < 0, wars.join(','));
  ok('开局军情写明了四家战略', st.events.some(function (e) {
    return e.title === '天下棋局' && e.lines.join('').indexOf('收取西川') >= 0;
  }));
  ok('天下大势条显示四家战略', st.story.headline.indexOf('收取西川') >= 0 &&
    st.story.headline.indexOf('为父报仇') >= 0 && st.story.headline.indexOf('不死不休') >= 0,
    st.story.headline);

  const passive = STORY.passiveFactions;
  ok('十家边缘/守成势力被标为小国', passive.length === 10 && passive.every(function (f) {
    return story.isPassive(st, f);
  }), passive.join(','));
  ok('魏蜀吴袁绍公孙瓒不是小国', ['wei', 'shu', 'wu', 'yuan', 'gongsun'].every(function (f) {
    return !story.isPassive(st, f);
  }));
  ok('小国募兵只有大国一半', story.recruitRate(st, 'biao') === 0.06 &&
    story.recruitRate(st, 'wei') === 0.12);

  // 随机外交在剧情模式下完全停掉
  const before = Object.keys(st.factionWars).sort().join(',');
  for (let i = 0; i < 40; i++) warLib.diplomacyTick(st);
  ok('剧情模式没有随机宣战/议和', Object.keys(st.factionWars).sort().join(',') === before);
}

/* ---------------------------------------------------------------- 玩家宣战 */

group('剧情模式：玩家不能随意开战');
{
  const st = game(1009);
  const xinye = st.world.sites.filter(function (s) { return s.id === 'xinye'; })[0];
  const jiange = st.world.sites.filter(function (s) { return s.id === 'jiange'; })[0];
  xinye.playerOwned = true;
  ok('第一天不能抢在刘备之前攻刘璋', !warLib.canPlayerDeclareFaction(st, 'zhang').ok);
  ok('第一天不能对不在大势里的马腾开战', !warLib.canPlayerDeclareFaction(st, 'ma').ok);
  ok('第一天不能在剑阁城下另开一桌', !warLib.canPlayerDeclareSite(st, jiange).ok);
  tickDay(st, 8);
  ok('第八天可以顺势加入攻刘璋', warLib.canPlayerDeclareFaction(st, 'zhang').ok &&
    warLib.canPlayerDeclareSite(st, jiange).ok);
  ok('第八天仍不能打不在大势里的马腾', !warLib.canPlayerDeclareFaction(st, 'ma').ok);
}

/* ---------------------------------------------------------------- 刘备入川 */

group('蜀：第一战略 · 收取西川');
{
  const st = game(1001);
  tickDay(st, 7);
  ok('第七天刘备仍未宣战', !warLib.atWar(st, 'shu', 'zhang'));
  tickDay(st, 8);
  ok('第八天刘备向刘璋宣战', warLib.atWar(st, 'shu', 'zhang'));
  ok('刘备只开这一条战线', warLib.warPartners(st, 'shu').length === 1 &&
    warLib.warPartners(st, 'shu')[0] === 'zhang', warLib.warPartners(st, 'shu').join(','));
  ok('宣战书写着收取西川', st.events.some(function (e) {
    return e.title === '收取西川' && e.lines.join('').indexOf('问鼎天下') >= 0;
  }));
  ok('入川首攻仍锁剑阁', !!(st.flags && st.flags.liubeiYiWar));

  // 刘璋灭国
  takeAll(st, 'zhang', 'shu');
  st.factionState.zhang = Object.assign({}, st.factionState.zhang, { dead: true, deadDay: st.clock.day });
  tickDay(st, 12);
  ok('西川平定后进入休整', st.story.phases.shu.status === 'rest' && st.story.phases.shu.success);
  ok('第一战略记完成', st.story.phases.shu.completed >= 1);
  ok('战略达成文书存在', st.events.some(function (e) {
    return e.title && e.title.indexOf('第一战略') >= 0 && e.title.indexOf('达成') >= 0;
  }));

  // 休整结束后开荆州
  tickDay(st, 12 + 121);
  ok('休整后转入第二战略', st.story.phases.shu.id === 'shu_jingzhou' &&
    st.story.phases.shu.status === 'war');
  ok('第二战略向刘表开战', warLib.atWar(st, 'shu', 'biao'));
  ok('荆州战书写着问鼎', st.events.some(function (e) {
    return e.title === '荆州问鼎' && e.lines.join('').indexOf('问鼎中原') >= 0;
  }));
}

/* ---------------------------------------------------------------- 阶段超时 */

group('一年未下荆州：转南蛮');
{
  const st = game(1002);
  tickDay(st, 8);
  // 跳过入川，直接让蜀进入第二战略并打满一年
  st.story.phases.shu = {
    id: 'shu_jingzhou', status: 'war', startedDay: 100, restUntil: 0,
    nextId: 'shu_nanman', completed: 1, success: false, timedOut: false,
  };
  st.story.targets.shu = ['biao'];
  warLib.declare(st, 'shu', 'biao', true, true);
  st.clock.day = 100 + 360;
  story.tick(st);
  ok('一年未下荆州判定受挫', st.story.phases.shu.status === 'rest' &&
    st.story.phases.shu.timedOut === true);
  ok('受挫后转南蛮', st.story.phases.shu.nextId === 'shu_nanman');
  ok('受挫文书说明收兵', st.events.some(function (e) {
    return e.title && e.title.indexOf('受挫') >= 0 && e.lines.join('').indexOf('一年') >= 0;
  }));
  tickDay(st, 100 + 360 + 121);
  ok('休整后开南蛮', st.story.phases.shu.id === 'shu_nanman' &&
    warLib.atWar(st, 'shu', 'nanman'));
}

/* ---------------------------------------------------------------- 袁术称帝 */

group('袁术：一年后称帝');
{
  const st = game(1003);
  tickDay(st, 359);
  ok('第一年未到，袁术还没称帝', st.story.emperor.declared === false);
  tickDay(st, 360);
  ok('满一年袁术称帝', st.story.emperor.declared === true);
  ok('魏吴联合剿灭', st.story.emperor.coalition.indexOf('wei') >= 0 &&
    st.story.emperor.coalition.indexOf('wu') >= 0);
  ok('周围诸侯集体宣战', ['wei', 'wu', 'biao', 'lv'].every(function (f) {
    return !FACTIONS[f] || !story.factionAlive(st, f) || warLib.atWar(st, f, 'yuanshu');
  }));
  ok('魏吴优先打寿春', st.story.priority.wei === 'yuanshu' && st.story.priority.wu === 'yuanshu');
  ok('称帝文书列出宣战国', st.events.some(function (e) {
    return e.title === '袁术称帝' && e.lines.join('').indexOf('集体向袁术宣战') >= 0;
  }));
}

/* ---------------------------------------------------------------- 死战 */

group('袁绍与公孙瓒：不死不休');
{
  const st = game(1004);
  ok('两家开局就是死战', warLib.atWar(st, 'yuan', 'gongsun'));
  ok('议和书被退回', warLib.makePeace(st, 'yuan', 'gongsun', true) === false);
  ok('之后仍在死战', warLib.atWar(st, 'yuan', 'gongsun'));
  ok('阶段无超时', !!(st.story.phases.yuan && st.story.phases.yuan.status === 'war'));

  // 公孙瓒灭亡，赵云固定投刘备
  st.factionState.gongsun = Object.assign({}, st.factionState.gongsun, { lastConqueror: 'yuan' });
  takeAll(st, 'gongsun', 'yuan');
  stateLib.fallFaction(st, 'gongsun');
  ok('公孙瓒灭亡后赵云归蜀', st.lords.filter(function (l) { return l.id === 'zhaoyun'; })
    .every(function (l) { return l.faction === 'shu'; }));
}

/* ---------------------------------------------------------------- 小国 */

group('边缘小国：只骚扰相邻城市');
{
  const st = game(1005);
  // 魏主动攻马腾，但两家没有直接城道：马腾不应组织远征
  warLib.declare(st, 'wei', 'ma', true, true);
  warLib.strategyTick(st);
  ok('没有相邻城道的小国不远征', !st.warCampaigns.ma);
  ok('马腾仍被视为小国', story.isPassive(st, 'ma'));

  // 吕布与曹操接壤，吕布可以反击相邻的陈留/小沛，但不会去打远处的城
  const lvCp = st.warCampaigns.lv;
  ok('接壤小国会反击', !!lvCp);
  if (lvCp) {
    const origins = st.story.originCities.lv;
    const target = lvCp.targetId;
    ok('吕布只打本土直接相邻的城', origins.some(function (id) { return roadAdjacent(id, target); }),
      target + ' / ' + origins.join(','));
  }

  // 小国募兵速率减半（通过公开的速率函数核对）
  ok('刘表募兵减半', story.recruitRate(st, 'biao') === 0.06);
  ok('袁术也算小国', story.isPassive(st, 'yuanshu'));
}

/* ---------------------------------------------------------------- 灭国归属 */

group('灭国：最后一座城的主人优先收人');
{
  const st = game(1006);
  const before = st.lords.filter(function (l) { return l.faction === 'lv'; }).map(function (l) { return l.id; });
  // 吕布最后一座城由曹操打下
  st.factionState.lv = Object.assign({}, st.factionState.lv || {}, { lastConqueror: 'wei' });
  takeAll(st, 'lv', 'wei');
  story.tick(st);
  stateLib.fallFaction(st, 'lv');
  const moved = before.filter(function (id) {
    const l = st.lords.filter(function (x) { return x.id === id; })[0];
    return l && l.faction === 'wei';
  });
  const nonLoyal = before.filter(function (id) {
    const l = st.lords.filter(function (x) { return x.id === id; })[0];
    return l && l.alive;
  });
  ok('最后城攻取者优先收大部分领主', moved.length >= Math.ceil(nonLoyal.length * 0.6),
    moved.length + '/' + nonLoyal.length);
  ok('亡国文书说明归属', st.events.some(function (e) {
    return e.type === 'faction-fall' && e.lines.join('').indexOf('最后一座城') >= 0;
  }));
}

/* ---------------------------------------------------------------- 三国循环 */

group('乱国叙事：三国循环');
{
  const st = game(1007);
  ok('可以开启三国循环', story.startEndgame(st) === true);
  const eg = st.story.endgame;
  ok('选出最强的一家', eg && eg.strongest && eg.allies.length === 2);
  ok('另两家合纵攻最强', warLib.atWar(st, eg.allies[0], eg.strongest) &&
    warLib.atWar(st, eg.allies[1], eg.strongest));
  ok('两家盟友之间停战', !warLib.atWar(st, eg.allies[0], eg.allies[1]));
  ok('三国循环文书存在', st.events.some(function (e) {
    return e.title === '合纵攻强' && e.lines.join('').indexOf('合纵攻') >= 0;
  }));

  // 强国被打弱：与两家停战，两家反目
  story.beginTwoStrong(st);
  ok('强国请和后进入两家互攻', eg.phase === 'twoStrong');
  ok('强国与两家停战', !warLib.atWar(st, eg.strongest, eg.allies[0]) &&
    !warLib.atWar(st, eg.strongest, eg.allies[1]));
  ok('两家盟友反目', warLib.atWar(st, eg.allies[0], eg.allies[1]));

  story.beginTripleRest(st);
  ok('两败俱伤后三家休兵', eg.phase === 'rest');
  ok('三家之间没有战事', !warLib.atWar(st, 'wei', 'shu') &&
    !warLib.atWar(st, 'wei', 'wu') && !warLib.atWar(st, 'shu', 'wu'));
}

/* ---------------------------------------------------------------- 存档 */

group('剧情存档');
{
  const st = game(1008);
  tickDay(st, 8);
  const json = stateLib.serialize(st);
  const loaded = stateLib.deserialize(json);
  ok('剧情模式随存档保留', !!loaded && loaded.storyMode === true && !!loaded.story);
  ok('战略阶段随存档保留', !!loaded && loaded.story.phases.shu.id === 'shu_yizhou' &&
    loaded.story.phases.shu.status === 'war');
  ok('天下大势条随存档保留', !!loaded && loaded.story.headline.indexOf('收取西川') >= 0);
  ok('读档后战事还在', !!loaded && warLib.atWar(loaded, 'shu', 'zhang'));
}

/* ---------------------------------------------------------------- 收尾 */

console.log('\n' + '='.repeat(44));
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('='.repeat(44));
process.exit(fail ? 1 : 0);
