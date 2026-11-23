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
