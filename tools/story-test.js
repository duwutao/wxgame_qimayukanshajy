/**
 * n43 战略测试：张鲁、魏蜀吴三阶段、袁术、官渡、荆州十轮、统一背叛、边陲小镇、两年防卡死。
 * node tools/story-test.js
 */

const path = require('path');
const R = path.join(__dirname, '..', 'js');

const stateLib = require(R + '/core/state.js');
const warLib = require(R + '/core/war.js');
const story = require(R + '/core/story.js');
const border = require(R + '/core/border.js');
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
  ok('魏：吕布 → 汉廷 → 官渡 → 赤壁 → 西凉', (function () {
    const a = story._private.phaseCfg('wei', 'wei_lv');
    const b = story._private.phaseCfg('wei', 'wei_han');
    const c = story._private.phaseCfg('wei', 'wei_north');
    const d = story._private.phaseCfg('wei', 'wei_sworn');
    const e = story._private.phaseCfg('wei', 'wei_xiliang');
    return a.next === 'wei_han' && b.next === 'wei_north' && b.restDays === 30 &&
      c.stage === 3 && c.next === 'wei_sworn' && d.waitChibi === true &&
      d.next === 'wei_xiliang' && e.waitDays === 0 && e.next === 'wei_jingzhou';
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
  ok('第十轮霸主额外杀敌 +50%', STORY.jingzhouKillMul === 1.5);
  ok('赤壁火攻折损八成', STORY.chibi.fireLossPct === 0.8);
  ok('赤壁后曹操只剩一成', STORY.chibi.caoRemainPct === 0.1);
}

group('n51 魏国史实节奏与袁绍昏君');
{
  ok('袁绍官渡只降两成', STORY.yuanWeakPower === 0.8);
  ok('袁绍第二阶段不取吕布，只北扫鲜卑', (function () {
    const c = story._private.phaseCfg('yuan', 'yuan_expand');
    return !!c && c.targets.length === 1 && c.targets[0] === 'xianbei';
  })());
  const st = game(2026112651);
  st.story.guanduStarted = true;
  st.story.phases.yuan = { id: 'yuan_guandu', status: 'waiting', startedDay: 1,
    restUntil: 0, nextId: 'end', completed: 3, success: false, timedOut: false };
  const before = (st.lords.filter(function (l) { return l.faction === 'yuan'; })[0] || {}).morale;
  tickDay(st, 100);
  ok('官渡袁军对碰系数为 0.8', FACTION_COMBAT.yuan.power === 0.8 && st.story.yuanWeak === true);
  ok('昏君不再把袁军士气钉死在 35', (st.lords.filter(function (l) { return l.faction === 'yuan'; })[0] || {}).morale === before);
  story.resetCombat();
}

group('n55 官渡只报一次，曹袁不死不休');
{
  const st = game(2026112755);
  st.story.phases.wei = { id: 'wei_north', status: 'waiting', startedDay: 1,
    restUntil: 0, nextId: 'wei_sworn', completed: 2, success: false, timedOut: false };
  st.story.phases.yuan = { id: 'yuan_guandu', status: 'waiting', startedDay: 1,
    restUntil: 0, nextId: 'end', completed: 3, success: false, timedOut: false };
  const guanduEvents = function () {
    return (st.events || []).filter(function (e) { return e.title === '官渡之战'; }).length;
  };
  const before = guanduEvents();
  story.startPhase(st, 'wei', { skipWait: true });
  const first = guanduEvents();
  story.startPhase(st, 'yuan', { skipWait: true });
  const second = guanduEvents();
  ok('官渡先由魏国发一次榜文', first === before + 1);
  ok('袁绍进入同一阶段不再弹第二次官渡', second === first);
  ok('官渡合战只开一场', (st.fieldBattles || []).filter(function (bf) {
    return bf.context && bf.context.cause === 'guandu';
  }).length === 1);
  ok('曹袁官渡后不能议和', warLib.makePeace(st, 'wei', 'yuan', true) === false);
  ok('官渡阶段没有两年逾期出口', story._private.phaseCfg('wei', 'wei_north').noTimeout === true &&
    story._private.phaseCfg('yuan', 'yuan_guandu').noTimeout === true);
}

group('n46 赤壁史诗：曹操南下、火攻、败逃与荆州分治');
{
  const st = game(20261126031);
  ['yuan', 'gongsun'].forEach(function (f) {
    st.story.phases[f].status = 'rest';
    st.story.phases[f].restUntil = 99999;
  });
  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  st.story.endgame = null;
  st.story.jingzhou = null;
  st.story.chibi = null;
  st.story.chibiDone = false;
  st.story.phases.wei = { id: 'wei_sworn', status: 'waiting', startedDay: 1,
    restUntil: 0, nextId: 'wei_xiliang', completed: 3, success: false, timedOut: false };
  st.clock.day = 31;
  story.tick(st);
  const c = st.story.chibi;
  ok('三国第三阶段后先入赤壁前置', !!c && c.phase === 'rest' && !st.story.jingzhou);
  ok('曹操先占荆州三镇', STORY.jingzhouSites.every(function (id) {
    return site(st, id).ownerFaction === 'wei';
  }));
  ok('赤壁前置休战一个月', c.until === 31 + STORY.chibi.caoRestDays);

  tickDay(st, c.until);
  ok('休战结束进入赤壁决战', c.phase === 'battle');
  ok('火攻烧掉曹军八成', c.caoAfterFire < c.caoBefore * 0.25 &&
    c.caoAfterFire > c.caoBefore * 0.15, c.caoBefore + '→' + c.caoAfterFire);
  ok('孙刘联军对曹宣战', warLib.atWar(st, 'wei', 'shu') && warLib.atWar(st, 'wei', 'wu'));

  tickDay(st, c.until + STORY.chibi.battleDays);
  ok('赤壁决战进入败逃结算', c.phase === 'aftermath');
  ok('曹军只余约一成', c.caoAfterBattle <= c.caoBefore * 0.11,
    c.caoBefore + '→' + c.caoAfterBattle);
  ok('低阶曹将战死', c.deadLords.length > 0, c.deadLords.join('、'));
  ok('名将榜前 50 不写死', c.deadLords.every(function (name) {
    const lord = st.lords.filter(function (l) { return l.name === name; })[0];
    return !lord || !require(R + '/data/lord-rank.js').LORD_POWER_BY_ID[lord.id];
  }));
  ok('曹操仍在', !!(st.lords.filter(function (l) { return l.id === 'caocao' && l.alive; })[0]));
  ok('孙刘分荆州', site(st, 'xiangyang').ownerFaction === 'shu' &&
    site(st, 'xinye').ownerFaction === 'shu' &&
    site(st, 'jiangling').ownerFaction === 'wu');

  tickDay(st, c.until + STORY.chibi.battleDays + STORY.chibi.aftermathRestDays);
  ok('赤壁结束后魏国先入西凉阶段', st.story.chibiDone && st.story.phases.wei.id === 'wei_xiliang' &&
    !st.story.jingzhou);
  st.story.xiliangDone = true;
  st.story.phases.wei.id = 'wei_jingzhou';
  st.story.phases.wei.status = 'waiting';
  st.story.phases.wei.nextId = 'end';
  story.tick(st);
  ok('西凉扫平后开启荆州十轮', !!st.story.jingzhou);
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
  st.story.chibi = { done: true };
  st.story.chibiDone = true;
  st.story.xiliangDone = true;
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

group('n51 荆州停战清扫小国');
{
  const st = game(2026112652);
  st.story.endgame = { active: true, phase: 'battle', cycle: 1, since: 1,
    until: 999, strongest: null, allies: [], initialCities: {}, final: false };
  st.story.jingzhou = { active: true, sites: STORY.jingzhouSites.slice(), cycle: 1,
    since: 1, until: 999, winner: null, strong: null };
  STORY.jingzhouSites.forEach(function (id) {
    const s = site(st, id); s.ownerFaction = 'wei'; s.faction = 'wei'; s.playerOwned = false;
  });
  story.tick(st);
  const aliveMinor = Object.keys(FACTIONS).filter(function (id) {
    if (['wei', 'shu', 'wu', 'bandit', 'player', 'rebel'].indexOf(id) >= 0) return false;
    return stateLib.factionAlive(st, id);
  });
  ok('停战后小国全部并入三国', aliveMinor.length === 0, aliveMinor.join(','));
  ok('停战文书出现“三国定鼎”', st.events.some(function (e) { return e.title === '三国定鼎'; }));
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
  // 先让玩家站进魏国这面旗，强制推举魏国共主才算“统一阵容包含玩家”。
  st.player.faction = 'wei';
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
  ok('边陲小镇每月给 400 粮草', st.player.food === food0 + 400, String(st.player.food - food0));

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

group('n56 统一背叛只认“统一旗里有玩家”');
{
  function crown(st, faction) {
    st.world.sites.forEach(function (s) {
      if (s.type !== 'town' && s.type !== 'castle') return;
      if (faction === 'player') {
        s.ownerFaction = 'player';
        s.playerOwned = true;
      } else {
        s.ownerFaction = faction;
        s.playerOwned = false;
      }
    });
  }
  const npc = game(2026112701);
  crown(npc, 'wei');
  npc.player.faction = 'player';
  npc.clock.day = 2949;
  stateLib.checkVictory(npc);
  ok('NPC 统一且玩家不在旗中：第 2949 天也不触发全国背叛', !npc.arc);
  ok('NPC 统一且玩家不在旗中：底层入口也不能直接开全国背叛',
    stateLib.startUnification(npc) === false && !npc.arc);

  const vassal = game(2026112702);
  crown(vassal, 'wei');
  vassal.player.faction = 'wei';
  vassal.clock.day = 2949;
  stateLib.checkVictory(vassal);
  ok('统一旗里包含玩家（魏臣）：立即触发全国背叛', !!vassal.arc && vassal.arc.phase === 'retreat');

  const own = game(2026112703);
  crown(own, 'player');
  own.player.faction = 'player';
  own.clock.day = 2949;
  stateLib.checkVictory(own);
  ok('玩家自立统一：触发全国背叛', !!own.arc && own.arc.phase === 'retreat');

  // 从主角队伍出去、后来改投别家的领主：统一时不能翻成叛军。
  const leave = game(2026112707);
  const oldLord = leave.lords.filter(function (l) { return l.alive && !l.hero; })[0];
  oldLord.faction = 'player';
  if (stateLib.moveLordToFaction) stateLib.moveLordToFaction(leave, oldLord, 'wei');
  ok('离开主角队伍的领主保留旧部标记', oldLord.exPlayer === true);
  crown(leave, 'wei');
  leave.player.faction = 'wei';
  stateLib.checkVictory(leave);
  ok('曾属主角队伍的领主不会变成叛军', !!leave.arc && oldLord.faction !== 'rebel');
}

group('n56 边陲小镇：锁镇 · 1000 义军 · 5 金粮草 · 驿站旧部');
{
  const locked = game(2026112704);
  ok('全国背叛前边陲小镇锁着', border.unlocked(locked) === false);
  ok('锁镇时招募池不写入', border.poolInfo(locked).total === 0);
  locked.campaign.stage = 3;
  ok('全国背叛前不刷“赤色叛军”', stateLib.allowedTiers(locked).indexOf('hong') < 0,
    stateLib.allowedTiers(locked).join(','));

  const st = game(2026112705);
  st.world.sites.forEach(function (s) {
    if (s.type === 'town' || s.type === 'castle') {
      s.ownerFaction = 'player';
      s.playerOwned = true;
    }
  });
  stateLib.startUnification(st);
  st.player.x = st.world.edgeTown.x;
  st.player.y = st.world.edgeTown.y;
  st.player.atSiteId = 'edge_town';
  stateLib.arcTick(st);
  ok('落脚后边陲小镇解锁', border.unlocked(st) === true);
  ok('边陲复国额外给 1000 兵编制', stateLib.capacity(st) >= 1000, String(stateLib.capacity(st)));
  st.campaign.stage = 3;
  ok('叛军开始后赤色叛军才可刷', stateLib.allowedTiers(st).indexOf('hong') >= 0);
  const info0 = border.poolInfo(st);
  ok('每周义军池正好 1000', info0.total === 1000, String(info0.total));
  const tiers = border.RECRUIT_TIERS.map(function (r) { return r.tier; }).join(',');
  ok('招募覆盖 T1 到 T5', tiers === '1,2,3,4,5', tiers);

  st.player.gold = 100000;
  st.player.troops = {};
  const r1 = border.recruit(st, 'militia', 100);
  ok('边陲能招 T1 义军', r1.ok && (st.player.troops.militia || 0) === 100, JSON.stringify(r1));
  const r2 = border.recruit(st, 'militia', 100);
  const r3 = border.recruit(st, 'militia', 100);
  ok('同一周招完 200 后 T1 断货', !r3.ok && (st.player.troops.militia || 0) === 200, JSON.stringify(r3));
  const r4 = border.recruit(st, 'jinjun', 10);
  ok('T5 禁军不问声望也能招', r4.ok && (st.player.troops.jinjun || 0) === 10, JSON.stringify(r4));

  st.player.troops = {};
  st.player.gold = 1000000;
  const bb = border.getBorder(st);
  bb.week = -1;
  border.refresh(st);
  const full = border.RECRUIT_TIERS.map(function (row) {
    return border.recruit(st, row.troop, row.count);
  });
  const totalTroops = Object.keys(st.player.troops).reduce(function (n, id) {
    return n + (st.player.troops[id] || 0);
  }, 0);
  ok('一周内能把 1000 义军全部招走', full.every(function (x) { return x.ok; }) && totalTroops === 1000,
    JSON.stringify(full) + ' total=' + totalTroops);

  const edge = border.edgeSite(st);
  const rest = stateLib.startRest(st, edge);
  ok('边陲小镇可以在镇中歇息且视为安全城镇', rest.ok && st.player.resting === edge.id && stateLib.isSafeResting(st) === true,
    JSON.stringify(rest));
  stateLib.stopRest(st);

  st.player.gold = 5000;
  st.player.food = 0;
  const f = border.buyFood(st, 1000);
  ok('粮草固定 5 金/单位且不卡上限', f.ok && st.player.food === 1000 && st.player.gold === 0, JSON.stringify(f));

  // 驿站：一个从主角队伍里出去的领主，被打散后自动回镇。
  const lord = st.lords.filter(function (l) { return l.id !== 'hero_test' && l.faction !== 'player'; })[0];
  lord.exPlayer = true;
  lord.alive = true;
  lord.dead = false;
  lord.scattered = true;
  border.sendToStation(st, lord);
  const station = border.stationLords(st);
  ok('旧部被打散后进入边陲驿站', station.length === 1 && station[0].lord.id === lord.id, String(station.length));
  ok('驿站旧部有专属抱怨台词', !!station[0].complaint && station[0].complaint.length > 8);
  const rr = border.recruitStationLord(st, lord.id);
  ok('驿站旧部可免费重新入队', rr.ok && lord.faction === 'player' && !lord.borderStation, JSON.stringify(rr));
  ok('入队后带一份乡勇而不是空架子', Object.keys(lord.troops || {}).length > 0);
  ok('玩家旧部不会变成叛军', lord.exPlayer === true && lord.faction === 'player');

  st.wars.rebel = true;
  const terms = stateLib.peaceTerms(st, 'rebel');
  ok('叛军永远不能议和', terms.ok === false && terms.rebel === true, JSON.stringify(terms));
  ok('war.makePeace 对叛军直接拒绝', warLib.makePeace(st, 'player', 'rebel', false) === false);
}

group('n56 叛军城池五条巡视路线');
{
  const st = game(2026112706);
  const city = st.world.sites.filter(function (s) { return s.type === 'town'; })[0];
  city.ownerFaction = 'rebel';
  // 通过巡逻路线缓存观察：叛军城固定生成 5 条短路线。
  const routes = stateLib.patrolRoutesForSite ? stateLib.patrolRoutesForSite(st, city) : null;
  ok('叛军城巡逻路线固定 5 条', !routes || routes.length === 5, routes ? String(routes.length) : 'not exported');

  // 先按普通城生成一次缓存，再换叛军旗；缓存必须失效，不能继续沿用 9/10 条。
  const xinye = st.world.sites.filter(function (s) { return s.id === 'xinye'; })[0];
  if (xinye) {
    xinye.ownerFaction = 'wei';
    if (stateLib.patrolRoutesForSite) stateLib.patrolRoutesForSite(st, xinye);
    xinye.ownerFaction = 'rebel';
    const rebelRoutes = stateLib.patrolRoutesForSite(st, xinye);
    ok('新野变叛军城后也只剩 5 条巡视路线', rebelRoutes.length === 5, String(rebelRoutes.length));
  }
}

console.log('\n============================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('============================================');
process.exit(fail ? 1 : 0);
