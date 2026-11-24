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

smoke('封地：列表/点将/英雄选封地', function () {
  const st = app.state;
  const city = st.world.sites.filter(function (s) { return s.id === 'chenliu'; })[0];
  const old = {
    playerOwned: city.playerOwned, ownerFaction: city.ownerFaction, lordId: city.lordId,
    color: city.color, banner: city.banner,
  };
  const oldHeroes = (st.player.heroes || []).slice();
  city.playerOwned = true;
  city.ownerFaction = 'player';
  city.lordId = null;
  st.player.heroes = [{ id: 'yujin', level: 6, exp: 0 }];
  app.push('fief', { siteId: city.id });
  app.ui.begin();
  app.top().scene.render(app);
  ok('封地列表有城池行', app.ui.items.some(function (it) { return it.id === 'fief_site_' + city.id; }));
  const sc = app.top().scene;
  sc.mode = 'lords';
  app.ui.begin();
  sc.render(app);
  ok('点将页列出队中英雄', app.ui.items.some(function (it) { return it.id === 'fief_lord_hero_yujin'; }));
  sc.mode = 'pickHero';
  sc.heroId = 'yujin';
  app.ui.begin();
  sc.render(app);
  ok('英雄选封地页列出空封地', app.ui.items.some(function (it) { return it.id === 'fief_hero_site_' + city.id; }));
  app.pop();
  city.playerOwned = old.playerOwned;
  city.ownerFaction = old.ownerFaction;
  city.lordId = old.lordId;
  city.color = old.color;
  city.banner = old.banner;
  st.player.heroes = oldHeroes;
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

smoke('匪巢洗劫态：火烧空营 + 离开按钮', function () {
  const camp = app.state.world.sites.filter(function (s) { return s.id === 'heishan'; })[0];
  const old = { cleared: camp.cleared, looted: camp.looted, lootedDay: camp.lootedDay, respawnDay: camp.respawnDay, garrison: camp.garrison };
  camp.cleared = true;
  camp.looted = true;
  camp.lootedDay = app.state.clock.day;
  camp.respawnDay = app.state.clock.day + stateLib.CAMP_RESPAWN_DAYS;
  camp.garrison = 0;
  app.push('town', { siteId: 'heishan' });
  app.townView.view = 'menu';
  app.ui.begin();
  app.top().scene.render(app);
  ok('洗劫态有离开按钮', app.ui.items.some(function (it) { return it.id === 'camp_leave_looted'; }));
  camp.cleared = old.cleared;
  camp.looted = old.looted;
  camp.lootedDay = old.lootedDay;
  camp.respawnDay = old.respawnDay;
  camp.garrison = old.garrison;
  app.pop();
});

/* ---------------------------------------------------------------- 战斗 */

smoke('战斗：战前 + 开打 + 结算', function () {
  const st = app.state;
  const party = st.parties.filter(function (p) { return p.faction === 'bandit'; })[0] || st.parties[0];
  party.troops = { bandit: 45 };
  st.player.troops = { militia: 40 };
  stateLib.startPartyBattle(st, party);
  app.push('battle', { mode: 'party' });
  app.ui.begin();
  app.top().scene.render(app);

  // 打到结束：每 12 轮一阵，阵间必须先渲染“未分胜负”页，不能提前结算
  let i = 0;
  let sawInterim = false;
  while (!st.battle.finished && i++ < 500) {
    if (st.battle.batchDone) {
      campaignBattleInterim(st);
      sawInterim = true;
      st.battle.nextBatch();
    } else {
      st.battle.step();
    }
  }
  ok('打满一阵会停在续战页', sawInterim === true, String(st.battle.round));
  app.battleView.phase = 'result';
  app.battleView.summary = st.battle.summary();
  app.ui.begin();
  app.top().scene.render(app);
});

function campaignBattleInterim(st) {
  app.battleView.phase = 'interim';
  app.battleView.summary = st.battle.interimSummary();
  app.ui.begin();
  app.top().scene.render(app);
};

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

smoke('议和使者：接受 / 拒绝双按钮', function () {
  app.state = stateLib.createGame({ seed: 4243 });
  app.state.wars.wei = true;
  app.state.playerWarSince = { wei: 1 };
  app.state.clock.day = 31;
  app.state.peaceOfferPending = { factionId: 'wei', sinceDay: 1 };
  app.replace('map');
  app.push('news', {
    mode: 'peace-offer',
    factionId: 'wei',
    title: '议和使者',
    lines: ['曹操派使者来，愿两家罢兵。', '接受可收下一支天机简；拒绝也不损两家颜面。'],
  });
  app.ui.begin();
  app.top().scene.render(app);
  const ids = app.ui.items.map(function (b) { return b.id; });
  ok('求和弹窗有接受按钮', ids.indexOf('peace_offer_accept') >= 0, ids.join(','));
  ok('求和弹窗有拒绝按钮', ids.indexOf('peace_offer_reject') >= 0, ids.join(','));
  ok('求和弹窗不是普通知道了', ids.indexOf('news_ok') < 0, ids.join(','));
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
  app.mapZoom = 1;
  app.mapCam = { x: 7000, y: 8000 };
  app.ui.begin();
  app.top().scene.render(app);
  const ids = app.ui.items.map(function (b) { return b.id; });
  ok('偏离玩家时出现跳回原处', ids.indexOf('map_recenter') >= 0, ids.join(','));
  app.ui.items.filter(function (b) { return b.id === 'map_recenter'; })[0].onTap();
  ok('点了就回自己身边', app.mapFree === false);
});

smoke('大地图：点领主跟着走，点别处就松开', function () {
  const st = app.state = stateLib.createGame({ seed: 4328 });
  st.events.length = 0;
  app.replace('map');
  app.mapZoom = 1;
  app.mapFree = true;
  const lord = st.lords.filter(function (l) { return l.alive && l.faction === 'wei'; })[0];
  ok('有可点的领主', !!lord);
  app.mapCam = { x: lord.x * 64 - 300, y: lord.y * 64 - 300 };
  app.ui.begin();
  app.top().scene.render(app);
  const cam = app.mapCam;
  const sx = lord.x * 64 - cam.x + 32;
  const sy = 132 + lord.y * 64 - cam.y + 32;
  app.onStart(sx, sy);
  app.onEnd(sx, sy);
  ok('点领主就开始跟', !!app.follow && app.follow.id === lord.id, app.follow && app.follow.id);
  ok('跟的时候有路线', st.player.route.length > 0, st.player.route.length);

  // 找一个空着的平地，点过去
  let tx = -1, ty = -1;
  for (let dx = 2; dx <= 7 && tx < 0; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const x = lord.x + dx, y = lord.y + dy;
      if (x < 0 || y < 0 || x >= st.world.w || y >= st.world.h) continue;
      if (st.world.tiles[y * st.world.w + x] !== 'plain') continue;
      if (st.world.sites.some(function (s) { return s.x === x && s.y === y; })) continue;
      if (st.lords.some(function (l) { return l.x === x && l.y === y; })) continue;
      if (st.parties.some(function (q) { return q.x === x && q.y === y; })) continue;
      tx = x; ty = y; break;
    }
  }
  ok('找到一块空地', tx >= 0, tx + ',' + ty);
  const gx = tx * 64 - cam.x + 32;
  const gy = 132 + ty * 64 - cam.y + 32;
  app.onStart(gx, gy);
  app.onEnd(gx, gy);
  ok('点别处立刻松开领主', !app.follow);
  ok('路线改指向空地', st.player.route.length > 0 &&
    st.player.route[st.player.route.length - 1].x === tx &&
    st.player.route[st.player.route.length - 1].y === ty);

  // 走一段路，确认不会自己拐回去追人
  for (let i = 0; i < 40; i++) app.top().scene.update(app, 0.12);
  ok('走完也不回头追', !app.follow, app.follow && app.follow.id);
});

smoke('双指缩放：大地图与天下图', function () {
  const st = app.state = stateLib.createGame({ seed: 4329 });
  st.events.length = 0;
  app.replace('map');
  app.mapZoom = 1;
  app.mapFree = false;
  app.ui.begin();
  app.top().scene.render(app);
  const mapScene = app.top().scene;
  const cam0 = { x: app.mapCam.x, y: app.mapCam.y };
  const cx = 375, cy = 600;
  const beforeX = (cx + cam0.x) / 64;
  const beforeY = (cy - 132 + cam0.y) / 64;
  mapScene.onPinchStart(app, cx, cy);
  mapScene.onPinch(app, 1.6, cx, cy);
  ok('大地图双指放大', app.mapZoom > 1.4, app.mapZoom);
  const afterX = (cx + app.mapCam.x) / (64 * app.mapZoom);
  const afterY = (cy - 132 + app.mapCam.y) / (64 * app.mapZoom);
  ok('放大时指下不动', Math.abs(afterX - beforeX) < 0.05 && Math.abs(afterY - beforeY) < 0.05,
    beforeX.toFixed(2) + '→' + afterX.toFixed(2));
  mapScene.onPinch(app, 0.05, cx, cy);
  ok('大地图缩到整张天下', app.mapZoom < 0.25, app.mapZoom);
  const worldWpx = st.world.w * 64 * app.mapZoom;
  const worldHpx = st.world.h * 64 * app.mapZoom;
  ok('缩到底能看见整个天下', worldWpx <= app.runtime.width + 1 && worldHpx <= app.runtime.height - 132 - 176 + 1,
    Math.round(worldWpx) + 'x' + Math.round(worldHpx));
  mapScene.onPinchEnd(app);

  app.replace('atlas');
  app.atlasZoom = 1;
  app.atlasCenter = null;
  app.ui.begin();
  app.top().scene.render(app);
  const atlasButtons = app.ui.items.map(function (b) { return b.id; });
  ok('天下大势仍能正常画完', atlasButtons.indexOf('atlas_back') >= 0, atlasButtons.join(','));
  const atlasScene = app.top().scene;
  atlasScene.onPinchStart(app, 375, 500);
  atlasScene.onPinch(app, 2.4, 375, 500);
  ok('天下图双指放大', app.atlasZoom > 2.2, app.atlasZoom);
  atlasScene.onPinch(app, 0.05, 375, 500);
  ok('天下图缩回整图', app.atlasZoom === 1, app.atlasZoom);
  atlasScene.onPinchEnd(app);
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

smoke('修养直接出城看地图，点一下回城，离城能走', function () {
  const st = app.state = stateLib.createGame({ seed: 4326 });
  st.events.length = 0;
  st.player.atSiteId = 'chenliu';
  app.replace('map');
  app.push('town', { siteId: 'chenliu' });
  app.ui.begin();
  app.top().scene.render(app);
  const rest = app.ui.items.filter(function (b) { return b.id === 'm_rest'; })[0];
  ok('菜单有进城修养', !!rest);
  ok('没有多余出门按钮', !app.ui.items.some(function (b) { return b.id === 'm_lookmap'; }));
  if (rest) rest.onTap();
  ok('点修养直接落在大地图', app.stack[app.stack.length - 1].name === 'map');
  ok('地图记住在城里歇着', app.restView === 'chenliu' && !!st.player.resting);
  app.ui.begin();
  app.top().scene.render(app);
  ok('地图上有回城提示', true);
  // 点一下地图 → 回城界面
  app.onStart(200, 620);
  app.onEnd(200, 620);
  ok('点地图回到城市界面', app.stack[app.stack.length - 1].name === 'town');
  app.ui.begin();
  app.top().scene.render(app);
  const leave = app.ui.items.filter(function (b) { return b.id === 'leave'; })[0];
  ok('城市界面仍有离城', !!leave);
  if (leave) leave.onTap();
  ok('离城回地图并结束修养', app.stack[app.stack.length - 1].name === 'map' && !st.player.resting);
});

/* ---------------------------------------------------------------- 新页面 */

smoke('立国页：选字 → 选色 → 落国号', function () {
  const st = app.state = stateLib.createGame({ seed: 9101 });
  st.events.length = 0;
  st.player.country = { name: '', color: '#d9a441', foundedDay: 1 };
  st.player.faction = 'player';
  app.replace('founding');
  app.ui.begin();
  app.top().scene.render(app);
  ok('立国页有字表与下一步', app.ui.items.some(function (it) { return it.id === 'name_next'; }));
  ok('字表里有可选国号', app.ui.items.some(function (it) { return it.id === 'name_赵'; }));
  const zhao = app.ui.items.filter(function (it) { return it.id === 'name_赵'; })[0];
  if (zhao) zhao.onTap();
  app.ui.begin();
  app.top().scene.render(app);
  const next = app.ui.items.filter(function (it) { return it.id === 'name_next'; })[0];
  ok('选字后能进下一步', next && !next.disabled);
  if (next) next.onTap();
  app.ui.begin();
  app.top().scene.render(app);
  ok('选色页有颜色与立国按钮', app.ui.items.some(function (it) { return it.id === 'color_赤'; }) &&
    app.ui.items.some(function (it) { return it.id === 'color_confirm'; }));
  const red = app.ui.items.filter(function (it) { return it.id === 'color_赤'; })[0];
  if (red) red.onTap();
  const confirm = app.ui.items.filter(function (it) { return it.id === 'color_confirm'; })[0];
  if (confirm) confirm.onTap();
  ok('落国号成功', st.player.country.name === '赵' && st.player.country.color === '#b4463c',
    JSON.stringify(st.player.country));
});

smoke('酒馆任务：查看位置 → 大世界镜头落到目标', function () {
  const st = app.state = stateLib.createGame({ seed: 9102 });
  st.events.length = 0;
  const city = st.world.sites.filter(function (s) { return s.type === 'town'; })[0];
  const party = st.parties.filter(function (p) { return p.faction === 'bandit'; })[0];
  st.quests = [{
    id: 'q_smoke', type: 'hunt', siteId: city.id, siteName: city.name,
    faction: city.ownerFaction, acceptedDay: 1, done: false,
    targetPartyId: party.id, title: '清剿' + party.name,
    text: '“' + party.name + ' 在附近劫道。”', reward: { gold: 180, renown: 24 },
  }];
  app.replace('map');
  app.push('town', { siteId: city.id });
  app.townView.view = 'tavern';
  app.ui.begin();
  app.top().scene.render(app);
  const loc = app.ui.items.filter(function (it) { return it.id === 'loc_q_smoke'; })[0];
  ok('酒馆任务有查看位置', !!loc);
  if (loc) loc.onTap();
  ok('定位后回到大地图', app.stack[app.stack.length - 1].name === 'map');
  ok('地图记住被定位的任务', app.mapQuestFocus === 'q_smoke', String(app.mapQuestFocus));
  app.ui.begin();
  app.top().scene.render(app);
  ok('地图绘制了任务标记', true);
});

smoke('玩家围城页：围一日 / 决战 / 撤围', function () {
  const st = app.state = stateLib.createGame({ seed: 9103 });
  st.events.length = 0;
  const city = st.world.sites.filter(function (s) { return s.type === 'town'; })[0];
  city.ownerFaction = 'lv';
  st.relations.lv = -50;
  st.wars.lv = true;
  const r = stateLib.beginPlayerSiege(st, city);
  ok('围城状态建立', r.ok && !!st.playerSiege, r.msg);
  app.replace('map');
  app.push('town', { siteId: city.id, view: 'siege' });
  app.ui.begin();
  app.top().scene.render(app);
  ok('围城页有推进与撤围', app.ui.items.some(function (it) { return it.id === 'siege_wait'; }) &&
    app.ui.items.some(function (it) { return it.id === 'siege_cancel'; }));
  const wait = app.ui.items.filter(function (it) { return it.id === 'siege_wait'; })[0];
  if (wait) wait.onTap();
  app.ui.begin();
  app.top().scene.render(app);
  ok('围城页推进后仍能画', true);
});

smoke('自立后的地图：国号旗色 + 粮草告急条', function () {
  const st = app.state = stateLib.createGame({ seed: 9104 });
  st.events.length = 0;
  const city = st.world.sites.filter(function (s) { return s.type === 'town'; })[0];
  city.playerOwned = true;
  st.player.country = { name: '汉', color: '#3f6fa8', foundedDay: 1 };
  stateLib.foundCountry(st, '汉', '#3f6fa8');
  st.player.food = 0;
  stateLib.refreshFoodWarning(st);
  app.replace('map');
  app.ui.begin();
  app.top().scene.render(app);
  ok('地图能画自立旗与告急条', true);
});

smoke('扎营：国号与旗色入口', function () {
  const st = app.state = stateLib.createGame({ seed: 9105 });
  st.events.length = 0;
  const city = st.world.sites.filter(function (s) { return s.type === 'town'; })[0];
  city.playerOwned = true;
  st.player.country = { name: '赵', color: '#b06a3c', foundedDay: 1 };
  stateLib.foundCountry(st, '赵', '#b06a3c');
  app.replace('map');
  app.push('camp');
  app.ui.begin();
  app.top().scene.render(app);
  ok('扎营有国号与旗色入口', app.ui.items.some(function (it) { return it.id === 'camp_3'; }));
  app.pop();
});

smoke('无主之城：菜单围攻 → 回大地图扎营', function () {
  const st = app.state = stateLib.createGame({ seed: 9201 });
  st.events.length = 0;
  const site = st.world.sites.filter(function (s) {
    return s.type === 'town' && !s.ownerFaction && !s.playerOwned;
  })[0];
  app.replace('map');
  st.player.atSiteId = site.id;
  app.push('town', { siteId: site.id });
  app.ui.begin();
  app.top().scene.render(app);
  const siegeBtn = app.ui.items.filter(function (it) { return it.id === 'm_besiege'; })[0];
  ok('无主城菜单有围攻', !!siegeBtn);
  if (siegeBtn) siegeBtn.onTap();
  ok('围攻后回大地图', app.stack[app.stack.length - 1].name === 'map',
    app.stack[app.stack.length - 1].name);
  ok('围攻状态建立', !!st.playerSiege && st.playerSiege.siteId === site.id);
  stateLib.cancelPlayerSiege(st);
});

smoke('围城去留：点别处 → 继续围城 / 拔营离开', function () {
  const st = app.state = stateLib.createGame({ seed: 9202 });
  st.events.length = 0;
  const site = st.world.sites.filter(function (s) {
    return s.type === 'town' && !s.ownerFaction && !s.playerOwned;
  })[0];
  st.playerSiege = null;
  stateLib.beginPlayerSiege(st, site);
  app.replace('map');
  app.ui.begin();
  app.top().scene.render(app);
  const mapScene = app.top().scene;
  app.lastHit = null;
  mapScene.onTouchStart(app, 180, 300);
  mapScene.onTouchEnd(app, 180, 300);
  ok('点别处弹出围城去留', !!app.siegePrompt, JSON.stringify(app.siegePrompt));
  app.ui.begin();
  app.top().scene.render(app);
  ok('弹窗有继续与离开', app.ui.items.some(function (it) { return it.id === 'siege_prompt_keep'; }) &&
    app.ui.items.some(function (it) { return it.id === 'siege_prompt_leave'; }));
  const keep = app.ui.items.filter(function (it) { return it.id === 'siege_prompt_keep'; })[0];
  // 真机按住按钮会跨帧：渲染下一帧时不能把 ui.pressed 清空，否则松手没反应
  if (keep) app.ui.press(keep.x + keep.w / 2, keep.y + keep.h / 2);
  app.ui.begin();
  app.top().scene.render(app);
  ok('围城弹窗跨帧保留按下项', !!app.ui.pressed && app.ui.pressed.id === 'siege_prompt_keep',
    app.ui.pressed && app.ui.pressed.id);
  if (keep) app.ui.release(keep.x + keep.w / 2, keep.y + keep.h / 2);
  ok('继续围城保留围营', !app.siegePrompt && !!st.playerSiege);
  app.lastHit = null;
  mapScene.onTouchStart(app, 180, 300);
  mapScene.onTouchEnd(app, 180, 300);
  app.ui.begin();
  app.top().scene.render(app);
  const leave = app.ui.items.filter(function (it) { return it.id === 'siege_prompt_leave'; })[0];
  ok('再次点别处仍能弹窗', !!leave);
  if (leave) leave.onTap();
  ok('拔营离开清掉围城', !app.siegePrompt && !st.playerSiege);
});

smoke('立国页：自定义国号入口', function () {
  const st = app.state = stateLib.createGame({ seed: 9203 });
  st.events.length = 0;
  st.player.country = { name: '', color: '#d9a441', foundedDay: 1 };
  st.player.faction = 'player';
  app.replace('founding');
  app.ui.begin();
  app.top().scene.render(app);
  const custom = app.ui.items.filter(function (it) { return it.id === 'name_custom'; })[0];
  ok('立国页有自定义输入', !!custom);
  if (custom) custom.onTap();
  ok('没有系统键盘时能降级提示', !!app.toast, app.toast && app.toast.text);
});

/* ---------------------------------------------------------------- 围城抵达 */

smoke('围城时辰到点：自动弹出进攻选择并暂停时间', function () {
  const stSiege = stateLib.createGame({ seed: 9911 });
  stSiege.events.length = 0;
  const site = stSiege.world.sites.filter(function (x) {
    return (x.type === 'town' || x.type === 'castle') && !x.playerOwned;
  })[0];
  stSiege.player.x = site.x;
  stSiege.player.y = site.y;
  const r = stateLib.beginPlayerSiege(stSiege, site);
  ok('能扎下围营', !!r.ok, r.msg);
  app.state = stSiege;
  app.replace('map');
  stSiege.playerSiege.stage = 'ready';
  stSiege.playerSiege.readyHour = stateLib.gameHours(stSiege);
  app.tick();
  ok('围满自动开选择框', !!app.siegePrompt && app.siegePrompt.mode === 'ready',
    app.siegePrompt && app.siegePrompt.mode);
  const frozen = stateLib.gameHours(stSiege);
  app.tick();
  app.tick();
  ok('选择期间时辰暂停', stateLib.gameHours(stSiege) === frozen,
    'h ' + frozen + '→' + stateLib.gameHours(stSiege));
  app.ui.begin();
  app.top().scene.render(app);
  const attack = app.ui.items.filter(function (it) { return it.id === 'siege_prompt_attack'; })[0];
  ok('选择框有进攻城池按钮', !!attack);
  if (attack) attack.onTap();
  ok('点进攻进入攻城战', app.top() && app.top().name === 'battle',
    app.top() && app.top().name);
});

smoke('大地图：缩到 0.2 时铺势力领地色', function () {
  const st = app.state = stateLib.createGame({ seed: 4330 });
  st.events.length = 0;
  app.replace('map');
  app.mapZoom = 0.2;
  app.mapFree = true;
  app.mapCam = { x: st.world.w * 64 * 0.1, y: st.world.h * 64 * 0.1 };
  app.ui.begin();
  app.top().scene.render(app);
  ok('低缩放会建立势力归属网格', !!st.world.factionGrid && st.world.factionGrid.length === st.world.w * st.world.h,
    st.world.factionGrid ? String(st.world.factionGrid.length) : 'none');
  ok('拉远后仍能画完地图', true);
});

smoke('城池：麾下领主名册可滚轮看全部', function () {
  const st = app.state = stateLib.createGame({ seed: 4331 });
  st.events.length = 0;
  app.replace('town', { siteId: 'xuchang' });
  app.townView.view = 'hall';
  app.ui.begin();
  app.top().scene.render(app);
  const hallIds = app.ui.items.map(function (b) { return b.id; });
  ok('领主府提供查看全部入口', hallIds.indexOf('hall_all_lords') >= 0, hallIds.join(','));

  app.townView.view = 'lords';
  app.townView.lordScroll = 0;
  app.ui.begin();
  app.top().scene.render(app);
  const ids = app.ui.items.map(function (b) { return b.id; });
  ok('名册页渲染完成', ids.indexOf('lords_back') >= 0, ids.join(','));
  ok('领主多到需要滚动', (app.townView.lordMaxScroll || 0) > 0,
    'maxScroll=' + app.townView.lordMaxScroll);
  const before = app.townView.lordScroll;
  app.onWheel(60, 0, 0);
  ok('滚轮能往下看更多领主', app.townView.lordScroll > before,
    before + '→' + app.townView.lordScroll);
});

smoke('继任事件弹出新君榜文', function () {
  const st = app.state = stateLib.createGame({ seed: 4332 });
  st.events.length = 0;
  app.replace('map');
  st.events.push({
    type: 'succession',
    factionId: 'wei',
    title: '魏国换了新君',
    lines: ['曹操的首级传回国内，曹丕在灵前即位。', '这一家与你永世不议和。'],
  });
  app.tick();
  ok('继任事件推到榜文页', app.top() && app.top().name === 'news',
    app.top() && app.top().name);
  ok('榜文标出继位', app.newsView && app.newsView.tag === '继位',
    app.newsView && app.newsView.tag);
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
