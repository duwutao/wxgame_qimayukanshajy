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
const { ROADS, FACTIONS, FACTION_COMBAT } = require(R + '/data/china.js');

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

function killFaction(st, faction, by) {
  st.factionState[faction] = Object.assign({}, st.factionState[faction] || {}, {
    dead: true, deadDay: st.clock.day, lastConqueror: by,
  });
  takeAll(st, faction, by);
  stateLib.fallFaction(st, faction);
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
  ok('没有旧的随机战事', wars.indexOf('ma|wei') < 0 &&
    wars.indexOf('lv|yuanshu') < 0 && wars.indexOf('wei|shu') < 0, wars.join(','));
  ok('马腾韩遂汉廷三方开局互战', warLib.atWar(st, 'ma', 'hansui') &&
    warLib.atWar(st, 'ma', 'han') && warLib.atWar(st, 'hansui', 'han'));
  ok('三方都不接议和书', warLib.makePeace(st, 'ma', 'hansui', true) === false &&
    warLib.makePeace(st, 'hansui', 'han', true) === false);
  ok('吕布刘表刘璋领主已削减', st.lords.filter(function (l) { return l.faction === 'lv'; }).length === 4 &&
    st.lords.filter(function (l) { return l.faction === 'biao'; }).length === 6 &&
    st.lords.filter(function (l) { return l.faction === 'zhang'; }).length === 5);
  ok('魏蜀吴各补三名新领主', ['caozhen', 'caoxiu', 'xunyou'].every(function (id) {
    return st.lords.some(function (l) { return l.id === id && l.faction === 'wei'; });
  }) && ['wuban', 'huojun', 'masu'].every(function (id) {
    return st.lords.some(function (l) { return l.id === id && l.faction === 'shu'; });
  }) && ['huanggai', 'zhuran', 'sunshao'].every(function (id) {
    return st.lords.some(function (l) { return l.id === id && l.faction === 'wu'; });
  }));
  ok('袁绍补入麴义、田丰、沮授', ['quyi', 'tianfeng', 'jushou'].every(function (id) {
    return st.lords.some(function (l) { return l.id === id && l.faction === 'yuan'; });
  }) && st.lords.filter(function (l) { return l.faction === 'yuan'; }).length >= 15);
  ok('公孙瓒国别战力降到半兵', FACTION_COMBAT.gongsun && FACTION_COMBAT.gongsun.power === 0.5,
    String(FACTION_COMBAT.gongsun && FACTION_COMBAT.gongsun.power));
  const weiCp = st.warCampaigns && st.warCampaigns.wei;
  ok('第一阶段战书落下即点兵', !!weiCp && weiCp.enemy === 'lv' && weiCp.attackerIds.length >= 6,
    JSON.stringify(weiCp && { target: weiCp.targetId, attackers: weiCp.attackerIds.length }));
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
  ok('小国募兵只有大国一半（整体加快两倍）', story.recruitRate(st, 'biao') === 0.12 &&
    story.recruitRate(st, 'wei') === 0.24);

  // 随机外交在剧情模式下完全停掉
  const before = Object.keys(st.factionWars).sort().join(',');
  for (let i = 0; i < 40; i++) warLib.diplomacyTick(st);
  ok('剧情模式没有随机宣战/议和', Object.keys(st.factionWars).sort().join(',') === before);
}

/* ---------------------------------------------------------------- 地图改动 */
group('地图：公孙、南越、长沙、新野、荆州三点');
{
  const st = game(1012);
  const sites = st.world.sites;
  ok('公孙势力名与旗号为公', FACTIONS.gongsun.name === '公孙' && FACTIONS.gongsun.banner === '公');
  ok('南越改名且新增龙编', FACTIONS.shanyue.name === '南越' &&
    sites.some(function (s) { return s.id === 'longbian' && s.ownerFaction === 'shanyue'; }) &&
    sites.filter(function (s) { return s.ownerFaction === 'shanyue' && (s.type === 'town' || s.type === 'castle'); }).length >= 2);
  ok('长沙由村升城且是要地', (function () {
    const s = sites.filter(function (x) { return x.id === 'changsha'; })[0];
    return s && s.type === 'town' && !!(require(R + '/data/china.js').STRATEGIC_SITES.changsha);
  })());
  ok('新野断许昌、连汝南', !roadAdjacent('xuchang', 'xinye') && roadAdjacent('runan', 'xinye'));
  ok('牂牁—武陵连成山道', roadAdjacent('zangke', 'wuling'));
  ok('南越沿新开的武陵道能打到刘表南线', roadAdjacent('shanyue', 'wuling') &&
    warLib.canSiegeSiteFromFaction(st, 'shanyue', sites.filter(function (s) { return s.id === 'wuling'; })[0]).ok);
  ok('居延归马腾，且不与汉廷、韩遂直接接壤',
    sites.filter(function (s) { return s.id === 'juyan'; })[0].ownerFaction === 'ma' &&
    sites.filter(function (s) { return s.ownerFaction === 'han' || s.ownerFaction === 'hansui'; })
      .every(function (s) { return !roadAdjacent('juyan', s.id); }));
  ok('天水归韩遂，汉廷与韩遂直接相邻',
    sites.filter(function (s) { return s.id === 'tianshui'; })[0].ownerFaction === 'hansui' &&
    warLib.factionsAdjacent(st, 'han', 'hansui') && !warLib.factionsAdjacent(st, 'ma', 'han'));
  const nanCp = warLib.planCampaign(st, 'nanman', st.clock.day);
  ok('南蛮先打刘璋，只野战不围城', !!nanCp && nanCp.enemy === 'zhang' && nanCp.harass === true,
    JSON.stringify(nanCp && { enemy: nanCp.enemy, target: nanCp.targetId, harass: nanCp.harass }));
  const yueCp = warLib.planCampaign(st, 'shanyue', st.clock.day);
  ok('南越先打刘表，只取长沙以南', !!yueCp && yueCp.enemy === 'biao' &&
    ['wuling', 'changsha', 'guiyang'].indexOf(yueCp.targetId) >= 0,
    JSON.stringify(yueCp && { enemy: yueCp.enemy, target: yueCp.targetId }));
  ok('荆州三镇按襄阳—新野—江陵排序',
    JSON.stringify(STORY.jingzhouSites) === JSON.stringify(['xiangyang', 'xinye', 'jiangling']));
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
  const shuMark = st.events.filter(function (e) {
    return e.title && e.title.indexOf('收取西川') >= 0 && e.title.indexOf('达成') >= 0;
  }).pop();
  ok('收取西川达成文书存在', !!shuMark);
  ok('收取西川达成不是议和弹窗', !!shuMark && shuMark.type === 'story' && !shuMark.kind);
  ok('收取西川达成不预告下一阶段', !!shuMark && shuMark.lines.join('').indexOf('下一阶段') < 0 &&
    shuMark.lines.join('').indexOf('荆州') < 0);
  ok('收取西川达成没有议和字样', !!shuMark && shuMark.lines.join('').indexOf('议和') < 0);

  // 休整结束后开荆州
  tickDay(st, 12 + 121);
  ok('休整后转入第二战略', st.story.phases.shu.id === 'shu_jingzhou' &&
    st.story.phases.shu.status === 'war');
  ok('第二战略向刘表开战', warLib.atWar(st, 'shu', 'biao'));
  ok('荆州战书写着问鼎', st.events.some(function (e) {
    return e.title === '荆州问鼎' && e.lines.join('').indexOf('问鼎中原') >= 0;
  }));
}

/* ---------------------------------------------------------------- 第一阶段达成 */

group('第一阶段灭国：不递议和书、不预告下一步');
{
  const st = game(1010);
  tickDay(st, 3);
  st.factionState.lv = Object.assign({}, st.factionState.lv || {}, { lastConqueror: 'wei' });
  takeAll(st, 'lv', 'wei');
  stateLib.fallFaction(st, 'lv');
  tickDay(st, 4);
  const weiMark = st.events.filter(function (e) {
    return e.title && e.title.indexOf('灭吕布') >= 0 && e.title.indexOf('达成') >= 0;
  }).pop();
  ok('灭吕布达成文书存在', !!weiMark);
  ok('灭吕布达成不是议和弹窗', !!weiMark && weiMark.type === 'story' && !weiMark.kind);
  ok('不再写与吕布遣使议和', !!weiMark && weiMark.lines.join('').indexOf('议和') < 0 &&
    weiMark.lines.join('').indexOf('吕布遣使') < 0);
  ok('不预告曹操下一步西入关中', !!weiMark && weiMark.lines.join('').indexOf('下一阶段') < 0 &&
    weiMark.lines.join('').indexOf('西入关中') < 0);
}

/* ---------------------------------------------------------------- 阶段超时 */

group('荆州未下：不再超时跳关');
{
  const st = game(1002);
  tickDay(st, 8);
  // 跳过入川，直接把蜀推到第二战略，打满一年也不许跳关。
  st.story.phases.shu = {
    id: 'shu_jingzhou', status: 'war', startedDay: 100, restUntil: 0,
    nextId: 'shu_nanman', completed: 1, success: false, timedOut: false,
  };
  st.story.targets.shu = ['biao'];
  warLib.declare(st, 'shu', 'biao', true, true);
  st.clock.day = 100 + 360;
  story.tick(st);
  ok('一年未下荆州仍留在本阶段', st.story.phases.shu.status === 'war' &&
    st.story.phases.shu.id === 'shu_jingzhou' && st.story.phases.shu.timedOut === false);
  ok('不出现受挫收兵文书', !st.events.some(function (e) {
    return e.title && e.title.indexOf('受挫') >= 0 && e.lines.join('').indexOf('一年') >= 0;
  }));
  ok('下一阶段仍是原定南蛮', st.story.phases.shu.nextId === 'shu_nanman');

  // 把刘表势力清零，才允许进入下一阶段。
  takeAll(st, 'biao', 'shu');
  st.factionState.biao = Object.assign({}, st.factionState.biao || {}, {
    dead: true, deadDay: st.clock.day, lastConqueror: 'shu',
  });
  st.clock.day = 100 + 361;
  story.tick(st);
  ok('灭刘表后荆州阶段达成', st.story.phases.shu.status === 'rest' &&
    st.story.phases.shu.success === true);
  ok('荆州达成后接匡扶汉室', st.story.phases.shu.nextId === 'shu_han');

  tickDay(st, st.story.phases.shu.restUntil);
  ok('休整后进入匡扶汉室', st.story.phases.shu.id === 'shu_han' &&
    st.story.phases.shu.status === 'war');
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

group('袁绍：兴盛、官渡、衰亡');
{
  const st = game(1004);
  ok('两家开局就是死战', warLib.atWar(st, 'yuan', 'gongsun'));
  ok('议和书被退回', warLib.makePeace(st, 'yuan', 'gongsun', true) === false);
  ok('之后仍在死战', warLib.atWar(st, 'yuan', 'gongsun'));
  ok('第一阶段无超时', !!(st.story.phases.yuan && st.story.phases.yuan.status === 'war'));

  // 第一阶段：灭公孙瓒，邺城大摆宴席，赵云固定投刘备。
  st.factionState.gongsun = Object.assign({}, st.factionState.gongsun, { lastConqueror: 'yuan' });
  takeAll(st, 'gongsun', 'yuan');
  stateLib.fallFaction(st, 'gongsun');
  story.tick(st);
  ok('公孙瓒灭亡后赵云归蜀', st.lords.filter(function (l) { return l.id === 'zhaoyun'; })
    .every(function (l) { return l.faction === 'shu'; }));
  ok('灭公孙后进入十五日休整', st.story.phases.yuan.status === 'rest' &&
    st.story.phases.yuan.success === true);
  ok('宴席文书说明兵强马壮', st.events.some(function (e) {
    return e.title === '幽冀不死不休 · 达成' &&
      e.lines.join('').indexOf('大摆宴席') >= 0 &&
      e.lines.join('').indexOf('田丰') >= 0;
  }));
  ok('宴席文书不预告下一步打谁', st.events.some(function (e) {
    return e.title === '幽冀不死不休 · 达成' &&
      e.lines.join('').indexOf('东取吕布') < 0 &&
      e.lines.join('').indexOf('北扫鲜卑') < 0;
  }));

  // 第二阶段：东取吕布、北扫鲜卑。
  tickDay(st, st.story.phases.yuan.restUntil);
  ok('休整后东取吕布、北扫鲜卑', st.story.phases.yuan.id === 'yuan_expand' &&
    st.story.phases.yuan.status === 'war' &&
    warLib.atWar(st, 'yuan', 'lv') && warLib.atWar(st, 'yuan', 'xianbei'));
  killFaction(st, 'lv', 'yuan');
  killFaction(st, 'xianbei', 'yuan');
  tickDay(st, st.clock.day + 1);
  ok('灭吕布与鲜卑后再次休整', st.story.phases.yuan.status === 'rest' &&
    st.story.phases.yuan.success === true &&
    st.story.phases.yuan.nextId === 'yuan_wait_yuanshu');

  // 第三阶段：按兵等曹操、孙权灭袁术。
  tickDay(st, st.story.phases.yuan.restUntil);
  ok('进入坐观袁术阶段', st.story.phases.yuan.id === 'yuan_wait_yuanshu' &&
    st.story.phases.yuan.status === 'waiting');
  ok('袁绍此时不打曹操', !warLib.atWar(st, 'yuan', 'wei'));
  killFaction(st, 'yuanshu', 'wei');
  const deathDay = st.clock.day;
  tickDay(st, deathDay + 1);
  ok('袁术刚死，袁绍仍按兵一月', st.story.phases.yuan.id === 'yuan_wait_yuanshu' &&
    st.story.phases.yuan.status === 'waiting');

  // 第四阶段：袁术灭亡一月后，曹袁汇聚官渡。
  tickDay(st, deathDay + 31);
  ok('袁术灭亡一月后进入官渡', st.story.phases.yuan.id === 'yuan_guandu' &&
    st.story.phases.yuan.status === 'war' &&
    warLib.atWar(st, 'yuan', 'wei'));
  ok('袁绍进入昏君衰弱', st.story.yuanWeak === true &&
    FACTION_COMBAT.yuan.power === 0.33);
  ok('袁军士气被压到 35 以下', st.lords.filter(function (l) { return l.faction === 'yuan'; })
    .every(function (l) { return l.morale <= 35; }));
  ok('官渡合战已经摆开', st.fieldBattles.some(function (bf) {
    return bf.context && bf.context.cause === 'guandu' &&
      bf.battle && !bf.battle.finished;
  }));
  const caocao = st.lords.filter(function (l) { return l.id === 'caocao'; })[0];
  const yuanshao = st.lords.filter(function (l) { return l.id === 'yuanshao'; })[0];
  ok('曹操与袁绍补满本部', !!caocao && !!yuanshao &&
    JSON.stringify(caocao.troops) === JSON.stringify(caocao.defTroops) &&
    JSON.stringify(yuanshao.troops) === JSON.stringify(yuanshao.defTroops));
}

/* ---------------------------------------------------------------- 小国 */

group('边缘小国：只骚扰相邻城市');
{
  const st = game(1005);
  // 马腾现在与韩遂、汉廷互战；即使魏再宣战，马腾也只能打与本土直接相邻的城。
  warLib.declare(st, 'wei', 'ma', true, true);
  warLib.strategyTick(st);
  const maCp = st.warCampaigns.ma;
  const maOrigins = st.story.originCities.ma;
  ok('没有相邻城道就不远征魏', !maCp || maCp.enemy !== 'wei');
  ok('马腾仍被视为小国', story.isPassive(st, 'ma'));
  ok('马腾只攻本土一邻城', !maCp || maOrigins.some(function (id) {
    return roadAdjacent(id, maCp.targetId);
  }), maCp ? maCp.targetId + ' / ' + maOrigins.join(',') : 'none');
  ['hansui', 'han'].forEach(function (f) {
    const cp = st.warCampaigns[f];
    const origins = st.story.originCities[f];
    ok(f + ' 只攻本土一邻城', !cp || origins.some(function (id) {
      return roadAdjacent(id, cp.targetId);
    }), cp ? cp.targetId + ' / ' + origins.join(',') : 'none');
  });

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
  ok('刘表募兵仍是大国一半', story.recruitRate(st, 'biao') === 0.12);
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
  const aliveOld = before.filter(function (id) {
    const l = st.lords.filter(function (x) { return x.id === id; })[0];
    return l && l.alive && l.faction === 'lv';
  });
  ok('灭国后没有仍打旧旗号的活领主', aliveOld.length === 0, aliveOld.join(','));
  const defected = before.filter(function (id) {
    const l = st.lords.filter(function (x) { return x.id === id; })[0];
    return l && l.alive && l.faction !== 'lv' && l.faction !== 'bandit';
  });
  ok('投靠者都带兵进了新势力', defected.every(function (id) {
    const l = st.lords.filter(function (x) { return x.id === id; })[0];
    return Object.keys(l.troops || {}).some(function (k) { return (l.troops[k] || 0) > 0; });
  }), defected.join(','));
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

/* ---------------------------------------------------------------- 出城循环 */

group('城主不再在城门口反复出进');
{
  const st = game(424242);
  const watch = ['yanghuai', 'songjian', 'chunyuqiong', 'yanxing'];
  const inCity = {};
  const flips = {};
  watch.forEach(function (id) {
    const l = st.lords.filter(function (x) { return x.id === id; })[0];
    if (l) inCity[id] = l.inCity || null;
  });
  for (let i = 0; i < 120 * 8; i++) {
    stateLib.update(st, 0.78, { ignoreEvents: true, idleTime: true });
    watch.forEach(function (id) {
      const l = st.lords.filter(function (x) { return x.id === id; })[0];
      if (!l || !l.alive) return;
      const now = l.inCity || null;
      if (inCity[id] !== now) {
        flips[id] = (flips[id] || 0) + 1;
        inCity[id] = now;
      }
    });
  }
  // 旧逻辑里上洛的杨怀 120 天出进 47 次；修好后只该有正常的出征/回城。
  ok('杨怀不再每三小时出城进城', (flips.yanghuai || 0) <= 8, String(flips.yanghuai || 0));
  ok('宋建不再高频出进', (flips.songjian || 0) <= 10, String(flips.songjian || 0));
  ok('淳于琼不再高频出进', (flips.chunyuqiong || 0) <= 10, String(flips.chunyuqiong || 0));
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
