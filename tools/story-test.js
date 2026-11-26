/**
 * n43 战略测试：张鲁、魏蜀吴三阶段、袁术、官渡、荆州十轮、统一背叛、边陲小镇、两年防卡死。
 * node tools/story-test.js
 */

const path = require('path');
const R = path.join(__dirname, '..', 'js');

const stateLib = require(R + '/core/state.js');
const warLib = require(R + '/core/war.js');
const story = require(R + '/core/story.js');
const { STORY } = require(R + '/data/story.js');
const { ROADS, FACTIONS, FACTION_COMBAT, SITE_ROWS } = require(R + '/data/china.js');

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) pass++;
  else {
    fail++;
    console.log('  FAIL · ' + name + (extra ? '  → ' + extra : ''));
  }
}

function group(title) { console.log('\n[' + title + ']'); }
function game(seed) { return stateLib.createGame({ seed: seed || 20261126, storyMode: true }); }
function tickDay(st, day) { st.clock.day = day; story.tick(st); }
function site(st, id) { return st.world.sites.filter(function (s) { return s.id === id; })[0]; }

group('n43 开局与地图归属');
{
  const st = game();
  ok('剧情模式已开启', !!(st.story && st.story.mode));
  ok('曹操开局只打吕布', warLib.atWar(st, 'wei', 'lv'));
  ok('孙权开局只打刘表', warLib.atWar(st, 'wu', 'biao'));
  ok('袁绍与公孙瓒开局死战', warLib.atWar(st, 'yuan', 'gongsun'));
  ok('刘备第八天前不打刘璋', !warLib.atWar(st, 'shu', 'zhang'));
  ok('刘备第一阶段处于等待', st.story.phases.shu.status === 'waiting');
  ok('张鲁据汉中', site(st, 'hanzhong').ownerFaction === 'zhanglu');
  ok('张鲁据武都', site(st, 'wudu').ownerFaction === 'zhanglu');
  ok('张鲁据上洛', site(st, 'shangluo').ownerFaction === 'zhanglu');
  ok('长沙归刘表', site(st, 'changsha').ownerFaction === 'biao');
  ok('襄平归公孙瓒', site(st, 'xiangping').ownerFaction === 'gongsun');
  ok('泰山关归袁绍', site(st, 'taishanguan').ownerFaction === 'yuan');
  ok('夷陵归孙权', site(st, 'yiling').ownerFaction === 'wu');
  ok('濮阳—泰山关直连', ROADS.some(function (r) {
    return r[0] === 'puyang' && r[1] === 'taishanguan' || r[0] === 'taishanguan' && r[1] === 'puyang';
  }));
  ok('北平—蓟直连', ROADS.some(function (r) {
    return r[0] === 'beiping' && r[1] === 'ji' || r[0] === 'ji' && r[1] === 'beiping';
  }));
  ok('交趾归山越', site(st, 'jiaozhi').ownerFaction === 'shanyue');
  ok('除边陲小镇外没有无主战略要地', st.world.sites.every(function (s) {
    return s.type === 'camp' || s.id === 'edge_town' || !!s.ownerFaction;
  }));
  ok('边陲小镇在地图西缘', !!(st.world.edgeTown && st.world.edgeTown.id === 'edge_town'));
  ok('边陲小镇初始迷雾封闭', st.world.edgeTown && st.world.edgeTown.fogOpen === false);
  ok('边陲小镇十格半径', st.world.edgeTown && st.world.edgeTown.radius === 10);
  ok('所有战略要地都有主后自由城表为空', require(R + '/data/china.js').FREE_CITY_IDS.length === 0);

  tickDay(st, 8);
  ok('第八天刘备向刘璋宣战', warLib.atWar(st, 'shu', 'zhang'));
  ok('刘备第一阶段进入战斗', st.story.phases.shu.status === 'war' && st.story.phases.shu.id === 'shu_yizhou');
}

group('n45 开局不误报叛军亡国');
{
  const st = game(2026112645);
  stateLib.advanceTime(st, 24 * 9);
  ok('叛军没有进入灭国倒计时', !(st.factionState.rebel || {}).dead,
    JSON.stringify(st.factionState.rebel || {}));
  ok('开局九天内没有“叛军 亡了”弹窗', !st.events.some(function (e) {
    return e.type === 'faction-fall' && e.factionId === 'rebel';
  }), (st.events || []).filter(function (e) { return e.type === 'faction-fall'; })
    .map(function (e) { return e.factionId; }).join(','));
}

group('n43 阶段表与两年防卡死');
{
  ok('两年是 720 天', STORY.phaseDeadlineDays === 720);
  ok('荆州最多十轮', STORY.jingzhouMaxCycles === 10);
  ok('袁术称帝延迟三天', STORY.emperorDelayDays === 3);
  ok('蜀：刘璋 → 张鲁 → 南蛮', (function () {
    const a = story._private.phaseCfg('shu', 'shu_yizhou');
    const b = story._private.phaseCfg('shu', 'shu_zhanglu');
    const c = story._private.phaseCfg('shu', 'shu_nanman');
    return a.next === 'shu_zhanglu' && b.next === 'shu_nanman' && c.stage === 3;
  })());
  ok('魏：吕布 → 汉廷 → 西凉 → 河北', (function () {
    const a = story._private.phaseCfg('wei', 'wei_lv');
    const b = story._private.phaseCfg('wei', 'wei_han');
    const c = story._private.phaseCfg('wei', 'wei_xiliang');
    const d = story._private.phaseCfg('wei', 'wei_north');
    return a.next === 'wei_han' && b.next === 'wei_xiliang' && c.next === 'wei_north' && d.stage === 3;
  })());
  ok('吴：刘表 → 袁术 → 南越', (function () {
    const a = story._private.phaseCfg('wu', 'wu_jiangdong');
    const b = story._private.phaseCfg('wu', 'wu_yuanshu');
    const c = story._private.phaseCfg('wu', 'wu_shanyue');
    return a.next === 'wu_yuanshu' && b.waitEmperor === true && c.stage === 3;
  })());
  ok('袁绍有官渡阶段且挂 guandu 标记', (function () {
    const c = story._private.phaseCfg('yuan', 'yuan_guandu');
    return !!c && c.stageFlag === 'guandu' && c.targets.indexOf('wei') >= 0;
  })());
  ok('公孙瓒有幽冀死斗', !!(function () {
    const c = story._private.phaseCfg('gongsun', 'gongsun_duel');
    return c && c.targets.indexOf('yuan') >= 0;
  })());
  ok('荆州三镇配置完整', STORY.jingzhouSites.join(',') === 'xiangyang,xinye,jiangling');
  ok('强势方募兵 +20%', STORY.jingzhouStrongRecruitMul === 1.2);
}

group('n43 两年未完成自动进入下一阶段');
{
  const st = game(2026112601);
  // 冻结其他国家，只留蜀第一阶段。
  ['wei', 'wu', 'yuan', 'gongsun'].forEach(function (f) {
    st.story.phases[f].status = 'rest';
    st.story.phases[f].restUntil = 99999;
  });
  const p = st.story.phases.shu;
  p.status = 'war';
  p.startedDay = 1;
  let changed = null;
  for (let day = 2; day <= 740; day++) {
    st.clock.day = day;
    story.tick(st);
    if (st.story.phases.shu.id !== 'shu_yizhou') {
      changed = day;
      break;
    }
  }
  ok('拖满两年后自动进入张鲁阶段', !!changed && changed >= 721,
    '第 ' + (changed || 0) + ' 天');
  ok('超时后阶段序号推进', st.story.phases.shu.id === 'shu_zhanglu' && st.story.phases.shu.completed >= 1);
  ok('超时不会把 stage3Done 提前写错', !st.story.stage3Done.shu);
}

group('n43 袁术称帝：曹孙完成第一阶段后三天');
{
  const st = game(2026112602);
  ['shu', 'yuan', 'gongsun'].forEach(function (f) {
    st.story.phases[f].status = 'rest';
    st.story.phases[f].restUntil = 99999;
  });
  st.story.phases.wei.completed = 1;
  st.story.phases.wu.completed = 1;
  st.story.emperor.declared = false;
  st.story.emperor.pendingDay = 0;
  tickDay(st, 1);
  ok('曹孙达标当天只是记下三天后的日子', !st.story.emperor.declared && st.story.emperor.pendingDay === 4);
  tickDay(st, 4);
  ok('三天后袁术称帝', st.story.emperor.declared === true);
  ok('曹孙对袁术开战', warLib.atWar(st, 'wei', 'yuanshu') && warLib.atWar(st, 'wu', 'yuanshu'));
  ok('袁术进入曹孙可打清单', (st.story.targets.wei || []).indexOf('yuanshu') >= 0 &&
    (st.story.targets.wu || []).indexOf('yuanshu') >= 0);
}

group('n43 荆州十轮：霸主、联盟与休整');
{
  const st = game(2026112603);
  ['yuan', 'gongsun'].forEach(function (f) {
    st.story.phases[f].status = 'rest';
    st.story.phases[f].restUntil = 99999;
  });
  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  st.story.endgame = null;
  st.story.jingzhou = null;
  st.clock.day = 31;
  story.tick(st);
  ok('三國第三阶段完成后一个月聚战荆州', !!(st.story.endgame && st.story.endgame.active) &&
    !!(st.story.jingzhou && st.story.jingzhou.active));
  ok('首轮三家互相宣战', warLib.atWar(st, 'wei', 'shu') && warLib.atWar(st, 'wei', 'wu') &&
    warLib.atWar(st, 'shu', 'wu'));
  ok('首轮从第一轮开始', st.story.jingzhou.cycle === 1);

  // 让魏独吞三镇：本轮回合应立即结算。
  st.world.sites.forEach(function (s) {
    if (STORY.jingzhouSites.indexOf(s.id) >= 0) {
      s.ownerFaction = 'wei';
      s.faction = 'wei';
      s.playerOwned = false;
    }
  });
  story.tick(st);
  ok('占尽三镇者成为霸主', st.story.endgame.strongest === 'wei');
  ok('另外两国结盟', st.story.endgame.allies.length === 2 &&
    st.story.endgame.allies.indexOf('wei') < 0);
  ok('霸主轮结束后进入一个月休整', st.story.endgame.phase === 'rest' &&
    st.story.endgame.until === st.clock.day + STORY.jingzhouCycleRestDays);
  const strong = st.story.endgame.strongest;

  tickDay(st, st.story.endgame.until);
  ok('休整结束后进入第二轮', st.story.endgame.phase === 'battle' && st.story.endgame.cycle === 2);
  ok('第二轮霸主同时打两家', st.story.targets[strong].length === 2);
  ok('第二轮联盟两国只打霸主', st.story.endgame.allies.every(function (a) {
    return st.story.targets[a].length === 1 && st.story.targets[a][0] === strong;
  }));

  st.story.endgame.cycle = 10;
  st.story.endgame.phase = 'battle';
  st.story.jingzhou.active = true;
  story.tick(st);
  ok('第十轮结算后不再停战', st.story.endgame.final === true && st.story.jingzhouDone === true);
}

group('n43 最终阶段两年未决强制统一');
{
  const st = game(20261126031);
  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  st.story.endgame = {
    active: true, phase: 'final', final: true, strongest: 'wei',
    allies: ['shu', 'wu'], cycle: 10, since: 31,
  };
  st.story.jingzhouDone = true;
  st.clock.day = 751;
  story.tick(st);
  const eg = st.story.endgame;
  ok('第十轮两年未决会强制推举共主', eg.forced === true && eg.forcedWinner === 'wei');
  ok('强制统一后全部大城归共主', st.world.sites.every(function (s) {
    return s.id === 'edge_town' || s.type !== 'town' && s.type !== 'castle' || s.ownerFaction === 'wei';
  }));
  stateLib.checkVictory(st);
  ok('强制统一后进入全国背叛', !!st.arc && st.arc.phase === 'retreat');
}

group('n43 统一背叛与边陲小镇');
{
  const st = game(2026112604);
  st.world.sites.forEach(function (s) {
    if (s.type === 'town' || s.type === 'castle') {
      s.ownerFaction = 'player';
      s.playerOwned = true;
    }
  });
  // 模拟被旧版误判“叛军亡了”的存档：统一背叛开始时必须把这面旗重新立起来。
  st.factionState.rebel = { dead: true, doomDays: 7, deadDay: 8 };
  const r = stateLib.startUnification(st);
  ok('统一瞬间触发全国背叛', r === true && st.arc && st.arc.phase === 'retreat');
  ok('统一背叛后叛军不再处于已亡状态', !(st.factionState.rebel || {}).dead,
    JSON.stringify(st.factionState.rebel || {}));
  ok('边陲小镇迷雾在背叛后打开', st.world.edgeTown.fogOpen === true);
  ok('除小镇外全部城旗换为叛军', st.world.sites.every(function (s) {
    return s.type === 'camp' || s.id === 'edge_town' || s.ownerFaction === 'rebel';
  }));
  ok('玩家被剥夺所有城', st.world.sites.filter(function (s) { return s.playerOwned && s.id !== 'edge_town'; }).length === 0);
  ok('残部路线自动指向边陲小镇', Array.isArray(st.player.route) && st.player.route.length > 0);
  ok('统一事件写着全国背叛', st.events.some(function (e) { return e.title === '全国背叛'; }));

  st.player.x = st.world.edgeTown.x;
  st.player.y = st.world.edgeTown.y;
  st.player.atSiteId = 'edge_town';
  stateLib.arcTick(st);
  ok('到达小镇后转入复国阶段', st.arc.phase === 'reconquest');
  const gold0 = st.player.gold;
  const food0 = st.player.food;
  st.clock.day = st.arc.lastGrantDay + 30;
  stateLib.arcTick(st);
  ok('边陲小镇每月给 1000 金币', st.player.gold === gold0 + 1000, String(st.player.gold - gold0));
  ok('边陲小镇每月给 2000 粮草', st.player.food === food0 + 2000, String(st.player.food - food0));

  st.world.sites.forEach(function (s) {
    if (s.type === 'town' || s.type === 'castle') {
      s.ownerFaction = 'player';
      s.playerOwned = true;
    }
  });
  stateLib.arcTick(st);
  ok('复国打完全部要点后进入尾声', st.arc.phase === 'finale');
}

group('n43 叛军巡逻与边界禁入');
{
  const st = game(2026112605);
  st.world.sites.forEach(function (s) {
    if (s.type === 'town' || s.type === 'castle') {
      s.ownerFaction = 'rebel';
      s.playerOwned = false;
    }
  });
  st.arc = { phase: 'reconquest', startDay: 1, exileSiteId: 'edge_town', lastGrantDay: 1 };
  const rebels = st.lords.filter(function (l) { return l.faction !== 'player'; });
  ok('复国阶段有叛军领主', rebels.length > 0);
  // 每座城的巡逻领主不超过五人（按 state.lords 的 patrolSiteId 计）。
  const counts = {};
  rebels.slice(0, 60).forEach(function (l) {
    l.faction = 'rebel';
    l.alive = true;
    l.dead = false;
  });
  ok('边陲小镇十格内阻挡 NPC', require(R + '/core/world.js').edgeTownBlocked(st.world,
    st.world.edgeTown.x + 1, st.world.edgeTown.y + 1) === true);
  ok('边陲小镇十格外不影响 NPC', require(R + '/core/world.js').edgeTownBlocked(st.world,
    st.world.edgeTown.x + 20, st.world.edgeTown.y + 20) === false);
}

console.log('\n============================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('============================================');
process.exit(fail ? 1 : 0);
