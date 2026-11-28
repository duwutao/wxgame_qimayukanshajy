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
  ok('荆州按三镇易主次数封顶十次', STORY.jingzhouMaxTakeovers === 10);
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
  ok('占尽三镇全国募兵 +50%', STORY.jingzhouStrongRecruitMul === 1.5);
  ok('不再保留第十轮霸主额外杀敌', STORY.jingzhouKillMul === undefined);
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
  ok('官渡袁军杀敌系数为 0.8、对碰不削', FACTION_COMBAT.yuan.power === 1 &&
    FACTION_COMBAT.yuan.killBase === 0.8 && st.story.yuanWeak === true);
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
  const sumTroops = function (f) {
    return st.lords.filter(function (l) { return l.faction === f && l.alive && !l.dead; })
      .reduce(function (n, l) {
        return n + Object.keys(l.troops || {}).reduce(function (m, k) { return m + (l.troops[k] || 0); }, 0);
      }, 0);
  };
  const sumDef = function (f) {
    return st.lords.filter(function (l) { return l.faction === f && l.alive && !l.dead; })
      .reduce(function (n, l) {
        return n + Object.keys(l.defTroops || {}).reduce(function (m, k) { return m + (l.defTroops[k] || 0); }, 0);
      }, 0);
  };
  ok('官渡开战前曹袁两军拉满', sumTroops('wei') === sumDef('wei') && sumTroops('yuan') === sumDef('yuan'),
    sumTroops('wei') + '/' + sumDef('wei') + '，' + sumTroops('yuan') + '/' + sumDef('yuan'));
  ok('官渡战前不额外扣兵', sumTroops('wei') > 0 && sumTroops('yuan') > 0);
  ok('曹袁官渡后不能议和', warLib.makePeace(st, 'wei', 'yuan', true) === false);
  ok('官渡阶段没有两年逾期出口', story._private.phaseCfg('wei', 'wei_north').noTimeout === true &&
    story._private.phaseCfg('yuan', 'yuan_guandu').noTimeout === true);
}

group('n70 官渡、赤壁打满七日');
{
  ok('官渡配置为七日', STORY.guandu && STORY.guandu.battleDays === 7 && STORY.guandu.stepHours === 12);
  ok('官渡两个阶段都有七日保护', story._private.phaseCfg('wei', 'wei_north').minBattleDays === 7 &&
    story._private.phaseCfg('yuan', 'yuan_guandu').minBattleDays === 7);
  const st = game(2026112755);
  st.story.phases.wei = { id: 'wei_north', status: 'waiting', startedDay: 1,
    restUntil: 0, nextId: 'wei_sworn', completed: 2, success: false, timedOut: false };
  st.story.phases.yuan = { id: 'yuan_guandu', status: 'waiting', startedDay: 1,
    restUntil: 0, nextId: 'end', completed: 3, success: false, timedOut: false };
  story.startPhase(st, 'wei', { skipWait: true });
  story.startPhase(st, 'yuan', { skipWait: true });
  const bf = (st.fieldBattles || []).filter(function (b) {
    return b.context && b.context.cause === 'guandu';
  })[0];
  ok('官渡合战十二时辰一轮', !!bf && bf.stepEveryH === 12);
  ok('官渡合战七日封顶', !!bf && bf.finishByH - bf.startedH === 7 * 24);
  ok('官渡后续零星援军不再拖长战局', !!bf && bf.noReinforce === true);
  const startDay = st.clock.day;
  st.clock.day = startDay + 2;
  story.refreshHeadline(st);
  ok('官渡标题显示第 3/7 日', st.story.headline.indexOf('官渡：决战第 3/7 日') >= 0,
    st.story.headline);
  st.clock.day = startDay;
  let guard = 0;
  while (st.clock.day < startDay + 6 && guard++ < 50000) {
    stateLib.update(st, 0.5, { ignoreEvents: true, idleTime: true });
  }
  ok('第六个游戏日官渡仍在打', (st.fieldBattles || []).some(function (b) {
    return b.context && b.context.cause === 'guandu';
  }), 'day=' + st.clock.day);
  while (st.clock.day < startDay + 9 && guard++ < 80000) {
    stateLib.update(st, 0.5, { ignoreEvents: true, idleTime: true });
  }
  ok('九日内官渡战场收场', !(st.fieldBattles || []).some(function (b) {
    return b.context && b.context.cause === 'guandu';
  }), 'day=' + st.clock.day);
}

group('n63 官渡残部按全国满编补兵');
{
  const st = game(2026112763);
  const yuanLords = st.lords.filter(function (l) { return l.faction === 'yuan'; });
  const yuanFull = yuanLords.reduce(function (n, l) {
    return n + Object.keys(l.defTroops || {}).reduce(function (m, k) { return m + (l.defTroops[k] || 0); }, 0);
  }, 0);
  // 模拟袁绍在前期被打残：只剩袁绍本人，手里只有一百人。
  yuanLords.forEach(function (l, i) {
    if (i === 0) return;
    l.alive = false;
    l.dead = true;
    l.troops = {};
  });
  if (yuanLords[0]) yuanLords[0].troops = { yuan_t1: 100 };
  st.story.phases.wei = { id: 'wei_north', status: 'waiting', startedDay: 1,
    restUntil: 0, nextId: 'wei_sworn', completed: 2, success: false, timedOut: false };
  st.story.phases.yuan = { id: 'yuan_guandu', status: 'waiting', startedDay: 1,
    restUntil: 0, nextId: 'end', completed: 3, success: false, timedOut: false };
  story.startPhase(st, 'wei', { skipWait: true });
  story.startPhase(st, 'yuan', { skipWait: true });
  const total = function (f) {
    return st.lords.filter(function (l) { return l.faction === f && l.alive && !l.dead; })
      .reduce(function (n, l) {
        return n + Object.keys(l.troops || {}).reduce(function (m, k) { return m + (l.troops[k] || 0); }, 0);
      }, 0);
  };
  const cao = total('wei');
  const yuan = total('yuan');
  ok('官渡袁绍残部补到河北满编，而不是百人', yuan === yuanFull, yuan + '/' + yuanFull);
  ok('官渡不再是两千打一百', cao > 0 && yuan >= Math.round(cao * 0.5), cao + ' vs ' + yuan);
  const yuanShao = st.lords.filter(function (l) { return l.id === 'yuanshao'; })[0];
  ok('援军保留河北兵种，不是全 T1 纸兵', !!yuanShao &&
    Object.keys(yuanShao.troops || {}).some(function (id) { return id !== 'yuan_t1'; }),
    yuanShao ? Object.keys(yuanShao.troops).join(',') : '无袁绍');
}

group('n61 停战期不能宣战');
{
  const st = game(2026112709);
  st.clock.day = 40;
  st.story.truce['shu|wei'] = 70;
  ok('停战期内魏蜀不能宣战', warLib.canOpenWar(st, 'wei', 'shu', true) === false);
  st.clock.day = 71;
  ok('停战到期后恢复宣战判断', warLib.canOpenWar(st, 'wei', 'shu', true) === true);
}

group('n46 赤壁史诗：曹操首次占尽三镇、火攻、裁领主与荆州再战');
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
  STORY.jingzhouSites.forEach(function (id) {
    const s = site(st, id);
    s.ownerFaction = 'wei';
    s.faction = 'wei';
    s.playerOwned = false;
  });
  st.clock.day = 31;
  story.tick(st);
  const c = st.story.chibi;
  ok('曹操首次占尽三镇才进入赤壁前置', !!c && c.phase === 'rest' && !st.story.jingzhou);
  ok('赤壁前置让孙刘停战结盟', !warLib.atWar(st, 'shu', 'wu') &&
    !warLib.atWar(st, 'wei', 'shu') && !warLib.atWar(st, 'wei', 'wu'));
  ok('赤壁前置休战一个月', c.until === 31 + STORY.chibi.caoRestDays);
  ok('三镇仍在曹操手里', STORY.jingzhouSites.every(function (id) {
    return site(st, id).ownerFaction === 'wei';
  }));

  // 额外塞四名没有三值、没有排行榜的曹营低级领主，用来验证“裁到孙刘之和的一半”。
  const shuN = st.lords.filter(function (l) { return l.faction === 'shu' && l.alive && !l.dead; }).length;
  const wuN = st.lords.filter(function (l) { return l.faction === 'wu' && l.alive && !l.dead; }).length;
  for (let i = 0; i < 4; i++) {
    st.lords.push({
      id: 'chibi_extra_' + i, name: '赤壁厢军' + i, faction: 'wei', alive: true, dead: false,
      level: 1, x: 1, y: 1, troops: { militia: 20 }, defTroops: { militia: 20 },
      morale: 80, baseMorale: 80, commandValue: null, forceValue: null,
      strategistGrade: null, generalRank: null, marshalRank: null,
    });
  }
  const caoN = st.lords.filter(function (l) { return l.faction === 'wei' && l.alive && !l.dead; }).length;
  const target = Math.max(1, Math.round((shuN + wuN) / 2));
  tickDay(st, c.until);
  ok('休战结束进入赤壁决战', c.phase === 'battle');
  ok('赤壁火攻持续七日', c.until - c.since === 7 && c.battleDays === 7);
  ok('火攻烧掉曹军八成', c.caoAfterFire <= c.caoBefore * 0.22 &&
    c.caoAfterFire >= c.caoBefore * 0.17, c.caoBefore + '→' + c.caoAfterFire);
  ok('孙刘联军对曹宣战', warLib.atWar(st, 'wei', 'shu') && warLib.atWar(st, 'wei', 'wu'));
  ok('三家军队向赤壁集结', c.gathered === true && st.lords.filter(function (l) {
    return l.faction === 'wei' && l.alive && Math.max(Math.abs(l.x - site(st, 'chibi').x),
      Math.abs(l.y - site(st, 'chibi').y)) <= 22;
  }).length > 0);
  st.clock.day = c.since + 3;
  story.tick(st);
  ok('赤壁标题显示第 4/7 日', st.story.headline.indexOf('赤壁：火攻决战 · 第 4/7 日') >= 0,
    st.story.headline);

  tickDay(st, c.until + STORY.chibi.battleDays);
  ok('赤壁决战进入败逃结算', c.phase === 'aftermath');
  ok('曹军只余约一成', c.caoAfterBattle <= c.caoBefore * 0.11,
    c.caoBefore + '→' + c.caoAfterBattle);
  ok('曹营领主裁到孙刘之和的一半', c.caoLordTarget === target && c.caoLordsAfter === target,
    '曹 ' + c.caoLordsBefore + '→' + c.caoLordsAfter + '，目标 ' + target);
  ok('赤壁确实死伤多名曹营领主', c.deadLords.length >= 3, c.deadLords.join('、'));
  ok('战死领主没有三值与排行榜保护', c.deadLords.every(function (name) {
    const lord = st.lords.filter(function (l) { return l.name === name; })[0];
    return lord && lord.commandValue === null && lord.forceValue === null &&
      !lord.strategistGrade && lord.generalRank === null && lord.marshalRank === null;
  }));
  ok('曹操仍在', !!(st.lords.filter(function (l) { return l.id === 'caocao' && l.alive; })[0]));
  ok('孙刘分荆州', site(st, 'xiangyang').ownerFaction === 'shu' &&
    site(st, 'xinye').ownerFaction === 'shu' &&
    site(st, 'jiangling').ownerFaction === 'wu');

  tickDay(st, c.until + STORY.chibi.battleDays + STORY.chibi.aftermathRestDays);
  ok('赤壁后直接开启荆州争霸，不再先扫西凉', st.story.chibiDone &&
    st.story.jingzhou && st.story.jingzhou.started && st.story.phases.wei.id === 'wei_jingzhou');
  ok('赤壁后不再保留旧的西凉前置', st.story.xiliangDone === true);
  ok('赤壁后孙刘重新开战', warLib.atWar(st, 'shu', 'wu'));
}

group('n46 荆州增益与易主计数');
{
  const st = game(20261126032);
  ['yuan', 'gongsun'].forEach(function (f) {
    st.story.phases[f].status = 'rest';
    st.story.phases[f].restUntil = 99999;
  });
  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  st.story.chibi = { done: true };
  st.story.chibiDone = true;
  st.story.xiliangDone = true;
  st.clock.day = 31;
  story.tick(st);
  const jz = st.story.jingzhou;
  ok('三家完成第三阶段后开启荆州', !!jz && jz.active && jz.cycle === 1);
  ok('首轮三家互相宣战', warLib.atWar(st, 'wei', 'shu') && warLib.atWar(st, 'wei', 'wu') &&
    warLib.atWar(st, 'shu', 'wu'));
  STORY.jingzhouSites.forEach(function (id) {
    const s = site(st, id); s.ownerFaction = 'wei'; s.faction = 'wei'; s.playerOwned = false;
  });
  ok('同时占三城全国募兵 +50%', Math.abs(story.recruitRate(st, 'wei') - 0.36) < 1e-9 &&
    Math.abs(story.recruitRate(st, 'shu') - 0.24) < 1e-9);
  story.tick(st);
  ok('占尽三镇进入一个月停战', st.story.endgame.phase === 'rest' &&
    st.story.endgame.strongest === 'wei');
  ok('三镇易主从三家完成第三阶段后开始计数', st.story.jingzhou.countingFromDay === 31);

  let count = st.story.jingzhou.takeoverCount;
  for (let i = 0; i < 12 && !st.story.jingzhou.final; i++) {
    st.clock.day = st.story.endgame.until;
    story.tick(st);
    const next = i % 2 === 0 ? 'shu' : 'wei';
    STORY.jingzhouSites.forEach(function (id) {
      const s = site(st, id); s.ownerFaction = next; s.faction = next; s.playerOwned = false;
    });
    st.clock.day += 1;
    story.tick(st);
    count = st.story.jingzhou.takeoverCount;
  }
  ok('三城易主超过十次后取消停战', st.story.jingzhou.final === true &&
    st.story.jingzhouDone === true && count > 10);
  ok('最终阶段三家继续互战', st.story.endgame.final === true && st.story.endgame.phase === 'final');
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

group('n61 荆州入场：先完成第三阶段者先入场');
{
  const st = game(2026112603);
  ['yuan', 'gongsun'].forEach(function (f) {
    st.story.phases[f].status = 'rest';
    st.story.phases[f].restUntil = 99999;
  });
  st.story.stage3Done = { wei: 1 };
  st.story.endgame = null;
  st.story.jingzhou = null;
  st.story.chibi = { done: true };
  st.story.chibiDone = true;
  st.story.xiliangDone = true;
  st.clock.day = 31;
  story.tick(st);
  ok('只有魏国完成第三阶段也能先入场', !!st.story.jingzhou &&
    st.story.jingzhou.active && st.story.jingzhou.eligible.wei === true);
  ok('未完成第三阶段的蜀吴不能主动争夺荆州', !st.story.jingzhou.eligible.shu &&
    !st.story.jingzhou.eligible.wu);
  ok('先入场国只把三镇当前占有者列为目标', (st.story.targets.wei || []).length > 0);

  st.story.stage3Done = { wei: 1, shu: 1 };
  story.tick(st);
  ok('蜀国完成第三阶段后加入争夺', st.story.jingzhou.eligible.shu === true);
  ok('三家没齐时不计三镇易主', st.story.jingzhou.countingFromDay === 0);

  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  story.tick(st);
  ok('魏蜀吴都完成后才开始计易主', st.story.jingzhou.countingFromDay > 0);
  const before = st.story.jingzhou.takeoverCount;
  STORY.jingzhouSites.forEach(function (id) {
    const s = site(st, id); s.ownerFaction = 'shu'; s.faction = 'shu'; s.playerOwned = false;
  });
  story.tick(st);
  ok('换主后停战一个月', st.story.endgame.phase === 'rest' &&
    st.story.endgame.until === st.clock.day + STORY.jingzhouCycleRestDays);
  ok('第一次占尽三镇作为计数基线，不计易主', st.story.jingzhou.takeoverCount === before);
}


group('n65 荆州争霸：曹操的进攻重心');
{
  const st = game(2026112665);
  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  st.clock.day = 100;
  site(st, 'wan').ownerFaction = 'biao';
  site(st, 'wan').faction = 'biao';
  site(st, 'xiangyang').ownerFaction = 'biao';
  site(st, 'xiangyang').faction = 'biao';
  site(st, 'xinye').ownerFaction = 'shu';
  site(st, 'xinye').faction = 'shu';
  site(st, 'jiangling').ownerFaction = 'wu';
  site(st, 'jiangling').faction = 'wu';
  story._private.startJingzhou(st);
  ok('曹操以宛城为南下大营', site(st, 'wan').ownerFaction === 'wei');
  const cp = warLib.planCampaign(st, 'wei', 100);
  ok('曹操荆州首攻襄阳', !!cp && cp.targetId === 'xiangyang', cp ? cp.targetId : 'null');
  ok('曹操荆州目标只在三镇内', !cp || STORY.jingzhouSites.indexOf(cp.targetId) >= 0,
    cp ? cp.targetId : 'null');
  site(st, 'xiangyang').ownerFaction = 'wei';
  site(st, 'xiangyang').faction = 'wei';
  const cp2 = warLib.planCampaign(st, 'wei', 101);
  ok('襄阳入手后转攻新野', !!cp2 && cp2.targetId === 'xinye', cp2 ? cp2.targetId : 'null');
  if (cp2) {
    cp2.targetId = 'hefei';
    cp2.enemy = 'wu';
    cp2.stage = 'march';
    warLib.strategyTick(st);
    ok('曹操旧的非荆州战役会被撤掉', !st.warCampaigns.wei);
  }
}


group('n66 荆州：每次占尽三镇都发史实停战');
{
  const st = game(2026112666);
  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  st.story.chibiDone = true;
  st.story.chibi = { done: true };
  st.clock.day = 100;
  STORY.jingzhouSites.forEach(function (id) {
    const s = site(st, id); s.ownerFaction = 'shu'; s.faction = 'shu'; s.playerOwned = false;
  });
  story._private.startJingzhou(st);
  STORY.jingzhouSites.forEach(function (id) {
    const s = site(st, id); s.ownerFaction = 'wei'; s.faction = 'wei';
  });
  story.tick(st);
  let truces = st.events.filter(function (e) { return e.title === '史实停战：曹操'; });
  ok('占尽三镇弹出史实停战', truces.length === 1, truces.length + ' 次');
  ok('史实停战有独立标签', !!(truces[0] && truces[0].tag === '史实停战'));
  ok('史实停战一个月', st.story.endgame.phase === 'rest' &&
    st.story.endgame.until === st.clock.day + 30, st.story.endgame.until + ' / ' + st.clock.day);
  ok('史实停战写明三家立约', !!(truces[0] && truces[0].lines.join('').indexOf('停战一个月') >= 0));

  // 同一国丢掉一城后再占尽，也要再发一次，不因 roundStartHolder 相同而漏掉。
  st.story.endgame.phase = 'battle';
  st.story.endgame.active = true;
  st.story.endgame.until = 999;
  st.story.jingzhou.active = true;
  st.story.jingzhou.until = 999;
  st.story.jingzhou.roundStartHolder = 'wei';
  st.story.jingzhou.lastSeenHolder = 'wei';
  site(st, 'xiangyang').ownerFaction = 'shu';
  site(st, 'xiangyang').faction = 'shu';
  st.clock.day = 101;
  story.tick(st);
  ok('丢掉一城后不算占尽', st.story.jingzhou.active === true);
  STORY.jingzhouSites.forEach(function (id) {
    const s = site(st, id); s.ownerFaction = 'wei'; s.faction = 'wei';
  });
  st.clock.day = 102;
  story.tick(st);
  truces = st.events.filter(function (e) { return e.title === '史实停战：曹操'; });
  ok('同一国重新占尽也再发史实停战', truces.length === 2, truces.length + ' 次');
}

group('n67 赤壁：曹操首次占尽三镇后休整一个月');
{
  const st = game(2026112667);
  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  st.story.chibi = null;
  st.story.chibiDone = false;
  st.clock.day = 100;
  STORY.jingzhouSites.forEach(function (id) {
    const s = site(st, id); s.ownerFaction = 'shu'; s.faction = 'shu'; s.playerOwned = false;
  });
  story._private.startJingzhou(st);
  ['xiangyang', 'xinye'].forEach(function (id) {
    const s = site(st, id); s.ownerFaction = 'wei'; s.faction = 'wei';
  });
  st.clock.day = 101;
  story.tick(st);
  ok('只占两镇不触发赤壁', !st.story.chibi);
  site(st, 'jiangling').ownerFaction = 'wei';
  site(st, 'jiangling').faction = 'wei';
  st.clock.day = 102;
  story.tick(st);
  const c = st.story.chibi;
  ok('曹操首次占尽三镇触发赤壁前置', !!c && c.phase === 'rest');
  ok('赤壁前置先停战一个月', !!c && c.until === 102 + STORY.chibi.caoRestDays,
    c ? c.until : 'null');
  ok('赤壁前置暂停荆州争霸', st.story.jingzhou.active === false && st.story.jingzhou.suspended === true);
  ok('赤壁前不先弹普通荆州停战', !st.events.some(function (e) {
    return String(e.title || '').indexOf('史实停战') === 0;
  }), st.events.map(function (e) { return e.title; }).join(' / '));
  const south = st.events.filter(function (e) {
    return String(e.title || '').indexOf('曹操南下') >= 0;
  })[0];
  ok('曹操首次占尽三镇也发史实停战', !!(south && south.tag === '史实停战' &&
    south.title.indexOf('史实停战') >= 0 && south.lines.join('').indexOf('史实停战') >= 0));
  ok('赤壁文案写明一个月后决战', !!(south && south.lines.join('').indexOf('一个月后') >= 0));
}

group('n68 曹操：护君入关');
{
  const cfg = story._private.phaseCfg('wei', 'wei_han');
  ok('汉廷阶段改称护君入关', cfg.label === '护君入关' && cfg.short === '护君' &&
    cfg.title === '护君入关');
  ok('宣战理由用护君名义', cfg.casusBelli.indexOf('护君') >= 0 &&
    cfg.casusBelli.indexOf('灭亡汉廷') < 0, cfg.casusBelli);
  ok('战争文案不再写汉室失道', cfg.warLines.join('').indexOf('汉室失道') < 0);
  ok('胜利文案不再写汉室覆灭', cfg.successLines.join('').indexOf('汉室覆灭') < 0);
  ok('官渡阶段承接汉廷名存实亡', story._private.phaseCfg('wei', 'wei_north')
    .casusBelli.indexOf('汉廷名存实亡') >= 0);
}

group('n69 三国：荆州优先、边境其次');
{
  const st = game(2026112669);
  st.story.stage3Done = { wei: 1, shu: 1, wu: 1 };
  st.story.chibiDone = true;
  st.story.chibi = { done: true };
  st.clock.day = 100;
  const base = { wan: 'biao', xiangyang: 'biao', xinye: 'shu', jiangling: 'wu' };
  Object.keys(base).forEach(function (id) {
    const s = site(st, id); s.ownerFaction = base[id]; s.faction = base[id]; s.playerOwned = false;
  });
  story._private.startJingzhou(st);
  ['wei', 'shu', 'wu'].forEach(function (f) {
    const cp = warLib.planCampaign(st, f, 100);
    ok(f + '优先打荆州三镇', !!cp && STORY.jingzhouSites.indexOf(cp.targetId) >= 0,
      cp ? cp.targetId : 'null');
  });
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
  ok('统一事件写着长夜', st.events.some(function (e) { return e.title === '长夜'; }));

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
