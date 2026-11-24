/**
 * 渲染冒烟：用 Proxy 模拟 canvas context，把每个场景每一页都画一遍
 * node tools/render-smoke.js
 */

const path = require('path');
const R = path.join(__dirname, '..', 'js');

const stateLib = require(R + '/core/state.js');
const { TILE } = { TILE: 64 };

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) pass++;
  else {
    fail++;
    console.log('  FAIL · ' + name + (extra ? '  → ' + extra : ''));
  }
}

function makeCtx() {
  const store = {};
  const gradient = { addColorStop: function () {} };
  const fn = function () {};
  return new Proxy(store, {
    get: function (t, k) {
      if (k === 'canvas') return { width: 750, height: 1334 };
      if (k === 'measureText') {
        return function (s) { return { width: (String(s).length || 1) * 13 }; };
      }
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        return function () { return gradient; };
      }
      if (k in t) return t[k];
      return fn;
    },
    set: function (t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

function makeRuntime() {
  const canvasStore = {};
  let t = 1000;
  const ctx = makeCtx();
  return {
    host: 'mock',
    api: null,
    canvas: { width: 750, height: 1334 },
    ctx,
    width: 750,
    height: 1334,
    screenW: 750,
    screenH: 1334,
    dpr: 1,
    scale: 1,
    topInset: 0,
    createCanvas: function () {
      const c = {
        width: 0,
        height: 0,
        getContext: function () { return makeCtx(); },
      };
      canvasStore.push = c;
      return c;
    },
    now: function () {
      t += 16;
      return t;
    },
    raf: function () {},
    onTouch: function () {},
    storage: {
      _m: {},
      get: function (k) { return this._m[k] || null; },
      set: function (k, v) { this._m[k] = v; return true; },
      remove: function (k) { delete this._m[k]; return true; },
    },
  };
}

const { App } = require(R + '/main.js');

function smoke(name, fn) {
  try {
    fn();
    pass++;
    return true;
  } catch (e) {
    fail++;
    console.log('  FAIL · ' + name + '  → ' + e.message);
    const line = (e.stack || '').split('\n')[1] || '';
    console.log('         ' + line.trim());
    return false;
  }
}

/* ---------------------------------------------------------------- 构造 */

const rt = makeRuntime();
let app = null;
smoke('App 构造 + 资源生成', function () {
  app = new App(rt);
  ok('assets 有玩家贴图', !!app.assets.player && app.assets.player.width === 32);
  ok('地形贴图懒生成', !!app.assets.terrainFor('zhongyuan', 'farm'));
});

/* ---------------------------------------------------------------- 标题 */

smoke('标题页', function () {
  app.ui.begin();
  app.push('title');
  app.top().scene.render(app);
});

/* ---------------------------------------------------------------- 新游戏 */

smoke('新游戏 + 大地图', function () {
  app.state = stateLib.createGame({ seed: 20260101 });
  app.replace('map');
  app.tick();
  ok('地图渲染帧完成', true);
});

smoke('地图：行军路径渲染', function () {
  stateLib.goTo(app.state, 27, 24);
  app.tick();
});

/* ---------------------------------------------------------------- 城池 */

smoke('城池：菜单页', function () {
  app.push('town', { siteId: 'chenliu' });
  app.tick();
});

smoke('城池：招兵页', function () {
  app.townView.view = 'recruit';
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('城池：市场-粮草', function () {
  app.townView.view = 'market';
  app.townView.tab = 'food';
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('城池：市场-军械', function () {
  app.townView.tab = 'arms';
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('城池：酒馆', function () {
  app.townView.view = 'tavern';
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('城池：领主府', function () {
  app.townView.view = 'hall';
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('村庄页（招兵/市场/劫掠）', function () {
  app.push('town', { siteId: 'longxi' });
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('匪巢页', function () {
  app.push('town', { siteId: 'heishan' });
  app.ui.begin();
  app.top().scene.render(app);
});

/* ---------------------------------------------------------------- 战斗 */

smoke('战斗：战前 + 开打 + 结算', function () {
  const st = app.state;
  const party = st.parties.filter(function (p) { return p.faction === 'bandit'; })[0] || st.parties[0];
  party.troops = { bandit: 12 };
  stateLib.startPartyBattle(st, party);
  app.push('battle', { mode: 'party' });
  app.ui.begin();
  app.top().scene.render(app);

  // 打到结束
  let i = 0;
  while (!st.battle.finished && i++ < 40) st.battle.step();
  app.battleView.phase = 'result';
  app.battleView.summary = st.battle.summary();
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('战斗：史简面板', function () {
  const st = app.state;
  st.player.shi = 3;
  st.battle = new (require(R + '/core/battle.js').Battle)({
    rng: st.rng,
    attacker: { name: '我', troops: { militia: 40 }, morale: 70, isPlayer: true },
    defender: { name: '袁军', troops: { militia: 50 }, morale: 70 },
  });
  app.push('battle', { mode: 'party' });
  app.battleView.phase = 'fight';
  app.battleView.shiOpen = true;
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('战斗：战役火攻战', function () {
  const st = app.state;
  st.campaign.stage = 2;
  stateLib.startCampaignBattle(st, 'wuchao');
  app.push('battle', { mode: 'campaign' });
  app.ui.begin();
  app.top().scene.render(app);
});

/* ---------------------------------------------------------------- 其他页 */

smoke('队伍页', function () {
  app.push('army');
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('队伍页：带英雄、滚动到中段', function () {
  app.state.player.heroes = [
    { id: 'yujin', level: 7, exp: 40 },
    { id: 'zhangyan', level: 3, exp: 10 },
    { id: 'haozhao', level: 1, exp: 0 },
  ];
  app.push('army');
  app.ui.begin();
  app.top().scene.render(app);
  const sc = app.top().scene;
  sc.render(app);
  if (sc.maxScroll > 0) {
    sc.scroll = sc.maxScroll;
    app.ui.begin();
    sc.render(app);
    ok('滚到底不越界', sc.scroll === sc.maxScroll);
  } else {
    ok('长屏内容放得下（矮屏才会滚）', sc.contentH > 0, 'h ' + sc.contentH);
  }
  sc.scroll = 0;
});

smoke('英雄对话页', function () {
  app.state.player.heroes = [{ id: 'yujin', level: 7, exp: 40 }];
  app.push('hero', { index: 0 });
  app.ui.begin();
  app.top().scene.render(app);
  const heroScene = app.top().scene;
  ok('第一次进来有话说', !!heroScene.line, heroScene.line);
  heroScene.say(app);
  ok('拉家常会换一句', !!heroScene.line);
  heroScene.confirm = true;
  app.ui.begin();
  heroScene.render(app);
  ok('确认离开时有第二套按钮', heroScene.confirm === true);
});

smoke('牢房页（俘虏能收赎金/放人）', function () {
  const st = app.state;
  const war = require(R + '/core/war.js');
  const victim = st.lords.filter(function (l) { return l.faction !== 'wei' && l.alive; })[0];
  war.capture(st, victim, 'player', '你');
  st.prisoners[st.prisoners.length - 1].ransom = 180;
  app.push('prison');
  app.ui.begin();
  app.top().scene.render(app);
  const sc = app.top().scene;
  ok('牢房列出俘虏', (sc.rows || []).length >= 1, '行数 ' + (sc.rows || []).length);
  app.pop();
});

smoke('比武大会页（报名 / 三血对决 / 打完）', function () {
  const st = app.state;
  st.player.gold = 800;
  st.tourney = null;
  app.push('tourney', { siteId: 'chenliu' });
  app.ui.begin();
  app.top().scene.render(app);
  const sc = app.top().scene;
  const tourney = require(R + '/core/tourney.js');
  const r = tourney.enter(st, st.world.sites[0]);
  ok('能报名', r.ok, r.msg);
  app.ui.begin();
  sc.render(app);
  ok('有对手', !!st.tourney.foe && !!st.tourney.foe.name);
  ok('开局各三血', st.tourney.hp === 3 && st.tourney.foeHp === 3);
  let guard = 0;
  while (st.tourney && !st.tourney.done && guard++ < 20) tourney.play(st, tourney.MOVE_IDS[guard % 4]);
  app.ui.begin();
  sc.render(app);
  ok('打完能出结果', st.tourney && st.tourney.done);
  tourney.close(st);
  app.pop();
});

smoke('史册页', function () {
  app.push('journal');
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('章节日', function () {
  app.push('chapter', { id: 'prologue' });
  app.ui.begin();
  app.top().scene.render(app);
});

smoke('结局页', function () {
  app.state.player.faction = 'wei';
  stateLib.decideEnding(app.state);
  app.push('ending');
  app.ui.begin();
  app.top().scene.render(app);
  app.state.gameOver = false;
});

smoke('玩法：五个分类', function () {
  app.push('help');
  ['basic', 'campaign', 'factions', 'troops', 'endings'].forEach(function (tab) {
    app.helpView.tab = tab;
    app.ui.begin();
    app.top().scene.render(app);
  });
});

smoke('天下通报页（国亡弹窗）', function () {
  app.state = stateLib.createGame({ seed: 4242 });
  app.replace('map');
  app.push('news', {
    title: '袁绍 亡了',
    factionId: 'yuan',
    lines: ['乱军里传出消息：袁绍死了。尸首没找到，头也没挂出来。', '张郃带着残部投了曹操。', '陈宫不肯降，解甲归乡里去了。'],
  });
  app.ui.begin();
  app.top().scene.render(app);
  ok('通报页画完不炸', true);
  app.pop();
});

smoke('村庄：村中隐者入口与页面', function () {
  const st = app.state;
  const village = st.world.sites.filter(function (s) { return s.type === 'village'; })[0];
  ok('有村庄可用', !!village);
  // 造一个隐居的旧主，并且已经打听过、关系够
  const lord = st.lords.filter(function (l) { return l.id === 'yuanshao'; })[0];
  lord.alive = false;
  lord.troops = {};
  lord.hidden = { siteId: village.id, since: 3, faction: 'yuan' };
  st.knownHidden = {};
  st.knownHidden[lord.id] = village.id;
  st.relations.yuan = 65;
  st.player.atSiteId = village.id;
  app.push('town', { siteId: village.id });
  app.ui.begin();
  app.top().scene.render(app);
  ok('菜单里出现隐者入口', app.ui.items.some(function (it) { return it.id === 'm_hermit'; }));
  app.townView.view = 'hermit';
  app.ui.begin();
  app.top().scene.render(app);
  ok('隐者页有请他出山的按钮', app.ui.items.some(function (it) { return it.id === 'hermit_hire'; }));
  app.pop();
});

smoke('酒馆：打听旧主下落', function () {
  const st = app.state;
  const city = st.world.sites.filter(function (s) { return s.type === 'town'; })[0];
  st.player.gold = 500;
  // 还有一位没被打听过的旧主
  const another = st.lords.filter(function (l) { return l.id === 'lvbu'; })[0];
  const villageB = st.world.sites.filter(function (s) { return s.type === 'village'; })[1];
  another.alive = false;
  another.troops = {};
  another.hidden = { siteId: villageB.id, since: 4, faction: 'lv' };
  st.knownHidden = {};
  app.push('town', { siteId: city.id });
  app.townView.view = 'tavern';
  app.ui.begin();
  app.top().scene.render(app);
  ok('酒馆里有打听按钮', app.ui.items.some(function (it) { return it.id === 'rumor'; }));
  const r = stateLib.tavernRumor(st);
  ok('打听给出下落', r.ok === true, r.msg);
  app.pop();
});

smoke('牢房：招降 / 斩了 / 问话三件套', function () {
  const st = app.state;
  st.prisoners = [];
  const war = require(R + '/core/war.js');
  war.bindLogger(stateLib.pushLog);
  const victim = st.lords.filter(function (l) {
    return l.faction === 'zhang' && l.id !== 'liuzhang' && !l.dead;
  })[0];
  war.capture(st, victim, 'player', '你');
  st.prisoners[st.prisoners.length - 1].ransom = 180;
  app.push('prison');
  app.ui.begin();
  app.top().scene.render(app);
  const sc = app.top().scene;
  const mine = (sc.rows || []).filter(function (r) { return r.kind === 'mine'; });
  ok('俘虏行给了更高的一行（192）', mine.length && mine[0].h === 192, mine.length ? String(mine[0].h) : '无行');
  const res = stateLib.recruitPrisoner(st, victim.id);
  ok('招降有明确结果（成/不成）', typeof res.ok === 'boolean', res.msg);
  app.pop();
});

/* ---------------------------------------------------------------- 被追上 / 城池滚动 / 大地图自由视野 */

smoke('被追上页（领主三选项）', function () {
  app.state = stateLib.createGame({ seed: 4321 });
  app.state.events.length = 0;
  const lord = app.state.lords.filter(function (l) { return l.faction === 'wei'; })[0];
  stateLib.changeRelation(app.state, 'wei', -55);
  lord.x = app.state.player.x;
  lord.y = app.state.player.y;
  app.replace('map');
  app.push('chase', { kind: 'lord', id: lord.id });
  app.ui.begin();
  app.top().scene.render(app);
  const ids = app.ui.items.map(function (b) { return b.id; });
  ok('三个选项都在', ids.indexOf('chase_pay') >= 0 && ids.indexOf('chase_fight') >= 0 &&
    ids.indexOf('chase_tail') >= 0, ids.join(','));
  ok('被追上页记下了对象', !!app.chase && app.chase.id === lord.id);
  app.pop();
  ok('退出后清空对象', !app.chase);
});

smoke('城池菜单：选项挤不下时出现滚动 + 固定离城', function () {
  const st = app.state = stateLib.createGame({ seed: 4322 });
  st.events.length = 0;
  st.player.atSiteId = 'chenliu';
  app.townView = { view: 'menu', scroll: 0, maxScroll: 0 };
  const realH = app.runtime.height;
  app.runtime.height = 1000;
  app.replace('town', { siteId: 'chenliu' });
  app.ui.begin();
  app.top().scene.render(app);
  app.runtime.height = realH;
  const ids = app.ui.items.map(function (b) { return b.id; });
  ok('菜单项可滚动', app.townView.maxScroll > 0, 'maxScroll=' + app.townView.maxScroll);
  ok('离城按钮一直有', ids.indexOf('leave') >= 0, ids.join(','));
});

smoke('大地图：自由视野 + 跳回原处', function () {
  app.state = stateLib.createGame({ seed: 4323 });
  app.state.events.length = 0;
  app.replace('map');
  app.mapFree = true;
  app.mapCam = { x: 4000, y: 4000 };
  app.ui.begin();
  app.top().scene.render(app);
  const ids = app.ui.items.map(function (b) { return b.id; });
  ok('偏离玩家时出现跳回原处', ids.indexOf('map_recenter') >= 0, ids.join(','));
  app.ui.items.filter(function (b) { return b.id === 'map_recenter'; })[0].onTap();
  ok('点了就回自己身边', app.mapFree === false);
});

smoke('市场默认先看粮草，货物有转卖备注', function () {
  app.state = stateLib.createGame({ seed: 4324 });
  app.state.events.length = 0;
  app.state.player.atSiteId = 'chenliu';
  app.replace('town', { siteId: 'chenliu' });
  app.ui.begin();
  app.top().scene.render(app);
  const market = app.ui.items.filter(function (b) { return b.id === 'm_market'; })[0];
  ok('菜单里有市场', !!market);
  if (market) market.onTap();
  ok('进市场先落在粮草页', app.townView.tab === 'food', app.townView.tab);
  app.ui.begin();
  app.top().scene.render(app);
  const idf = app.ui.items.filter(function (b) { return b.id === 'tab_food'; })[0];
  const idg = app.ui.items.filter(function (b) { return b.id === 'tab_goods'; })[0];
  ok('粮草标签排在货物前面', !!idf && !!idg && idf.x < idg.x);
  app.townView.tab = 'goods';
  app.ui.begin();
  app.top().scene.render(app);
  ok('货物页画得出来', true);
});

smoke('新增幕间章节卡', function () {
  app.state = stateLib.createGame({ seed: 4325 });
  app.state.events.length = 0;
  app.replace('map');
  app.push('chapter', { id: 'act1b' });
  app.ui.begin();
  app.top().scene.render(app);
  ok('濮阳幕间卡有正文', !!app.chapterView && !!app.chapterView.ch && app.chapterView.ch.id === 'act1b');
  app.pop();
});

/* ---------------------------------------------------------------- 长跑 */

smoke('长跑 4000 帧（地图推进 + 场景切换）', function () {
  app.state = stateLib.createGame({ seed: 777 });
  app.replace('map');
  let guard = 0;
  for (let i = 0; i < 4000; i++) {
    app.tick();
    guard++;
    // 防止 UI 无限注册
    if (i % 60 === 0) app.ui.begin();
  }
  ok('长跑后仍有场景栈', app.stack.length >= 1, '栈深 ' + app.stack.length);
  ok('长跑后 state 还在', !!app.state);
});

/* ---------------------------------------------------------------- 存档 */

smoke('存档写入与读取', function () {
  const st = stateLib.createGame({ seed: 888 });
  st.player.renown = 88;
  rt.storage.set('bw_save_v3', stateLib.serialize(st));
  const raw = rt.storage.get('bw_save_v3');
  const loaded = stateLib.deserialize(raw);
  ok('存档 round-trip', loaded && loaded.player.renown === 88, String(raw.length) + ' 字节');
});

console.log('\n' + '='.repeat(44));
console.log('渲染冒烟：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('='.repeat(44));
process.exit(fail ? 1 : 0);
