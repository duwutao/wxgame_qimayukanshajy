/**
 * 游戏主循环与场景栈
 */

const { createRuntime } = require('./render/platform.js');
const pixel = require('./render/pixel.js');
const { UI, text, wrap, panel } = require('./render/ui.js');
const stateLib = require('./core/state.js');
const audio = require('./core/audio.js');

// 存档槽：最新 / 上一份 / 上上一份，外加开打前的快照
const AUTO_KEY = 'bw_save_v4';
const AUTO_1 = 'bw_save_v4_a1';
const AUTO_2 = 'bw_save_v4_a2';
const PRE_KEY = 'bw_pre_v4';

class App {
  constructor(runtime) {
    this.runtime = runtime;
    this.assets = pixel.buildAssets(runtime);
    this.ui = new UI();
    this.stack = [];
    this.state = null;
    this.scenes = {
      title: require('./scenes/title.js'),
      map: require('./scenes/map.js'),
      atlas: require('./scenes/atlas.js'),
      town: require('./scenes/town.js'),
      founding: require('./scenes/founding.js'),
      battle: require('./scenes/battle.js'),
      contact: require('./scenes/contact.js'),
      army: require('./scenes/army.js'),
      hero: require('./scenes/hero.js'),
      prison: require('./scenes/prison.js'),
      tourney: require('./scenes/tourney.js'),
      journal: require('./scenes/journal.js'),
      camp: require('./scenes/camp.js'),
      help: require('./scenes/help.js'),
      nested: null,
      chapter: require('./scenes/chapter.js'),
      news: require('./scenes/news.js'),
      chase: require('./scenes/chase.js'),
      ending: require('./scenes/ending.js'),
      lord: require('./scenes/lord.js'),
      revive: require('./scenes/revive.js'),
      menu: require('./scenes/menu.js'),
      saves: require('./scenes/saves.js'),
    };
    delete this.scenes.nested;
    this.saveTimer = 10;
    this.last = runtime.now();
    this.toast = null;
    this.lastHit = null;

    // 试手感用的帧率叠加层：地址栏加 ?fps=1 打开
    this.debugHud = false;
    try {
      if (typeof location !== 'undefined' && location.search && /fps=1/.test(location.search)) {
        this.debugHud = true;
      }
    } catch (e) {
      this.debugHud = false;
    }
    this._fps = 60;
    this._frameMs = 0;

    const self = this;
    runtime.onTouch({
      start: function (x, y) {
        self.onStart(x, y);
      },
      move: function (x, y) {
        self.onMove(x, y);
      },
      end: function (x, y) {
        self.onEnd(x, y);
      },
      pinchStart: function (x, y) {
        self.onPinchStart(x, y);
      },
      pinch: function (scale, x, y) {
        self.onPinch(scale, x, y);
      },
      pinchEnd: function () {
        self.onPinchEnd();
      },
    });
  }

  top() {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  push(name, params) {
    const scene = this.scenes[name];
    if (!scene) {
      return;
    }
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
    const entry = { name, scene, params: params || {} };
    this.stack.push(entry);
    if (scene.enter) scene.enter(this, entry.params);
    this.applyMusic(name);
    // 开打之前留一份快照：打输了、想反悔，都能退回来
    if (name === 'battle' && this.state && !this.state.gameOver) {
      try {
        this.runtime.storage.set(PRE_KEY, stateLib.serialize(this.state));
      } catch (e) { /* ignore */ }
    }
  }

  applyMusic(name) {
    if (name === 'battle') audio.play('battle');
    else if (name === 'map' || name === 'title') audio.play('field');
  }

  pop() {
    if (this.stack.length <= 1) return;
    const leaving = this.stack.pop();
    if (leaving.scene.leave) leaving.scene.leave(this);
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
    const nowTop = this.top();
    if (nowTop) this.applyMusic(nowTop.name);
  }

  replace(name, params) {
    while (this.stack.length) {
      const leaving = this.stack.pop();
      if (leaving.scene.leave) leaving.scene.leave(this);
    }
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
    this.push(name, params);
  }

  showToast(message, seconds) {
    this.toast = {
      text: message,
      time: seconds || 2.2,
    };
  }

  onPinchStart(x, y) {
    this.ui.pressed = null;
    const top = this.top();
    if (top && top.scene.onPinchStart) top.scene.onPinchStart(this, x, y);
  }

  onPinch(scale, x, y) {
    const top = this.top();
    if (top && top.scene.onPinch) top.scene.onPinch(this, scale, x, y);
  }

  onPinchEnd() {
    const top = this.top();
    if (top && top.scene.onPinchEnd) top.scene.onPinchEnd(this);
  }

  onStart(x, y) {
    audio.resume();
    this.ui.press(x, y);
    const top = this.top();
    if (top && top.scene.onTouchStart) top.scene.onTouchStart(this, x, y);
  }

  onMove(x, y) {
    const top = this.top();
    if (top && top.scene.onTouchMove) top.scene.onTouchMove(this, x, y);
  }

  onEnd(x, y) {
    const top = this.top();
    this.lastHit = this.ui.release(x, y);
    if (top && top.scene.onTouchEnd) top.scene.onTouchEnd(this, x, y);
  }

  start() {
    const self = this;
    this.push('title');
    const loop = function () {
      self.tick();
      self.runtime.raf(loop);
    };
    loop();
  }

  tick() {
    const now = this.runtime.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    const rawDt = dt;
    if (dt > 0.06) dt = 0.06;

    if (this.debugHud && rawDt > 0) {
      const inst = 1 / rawDt;
      this._fps = this._fps * 0.85 + Math.min(inst, 120) * 0.15;
    }

    const r = this.runtime;
    // 先按物理像素铺满整块画布：顶部让开胶囊的那条区域不能被上一帧残留
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.ctx.fillStyle = '#0f0c09';
    r.ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);
    r.ctx.setTransform(r.dpr * r.scale, 0, 0, r.dpr * r.scale, 0, (r.topInsetPx || 0) * r.dpr);
    audio.update(dt);

    const top = this.top();
    if (top && top.scene.update) top.scene.update(this, dt);

    this.ui.begin();
    r.ctx.fillStyle = '#0f0c09';
    r.ctx.fillRect(0, 0, r.width, r.height);

    const current = this.top();
    if (current && current.scene.render) current.scene.render(this);

    if (this.toast) {
      this.toast.time -= dt;
      if (this.toast.time <= 0) this.toast = null;
      else this.drawToast();
    }

    // 自动存档：别在战斗里存，也别在结局后存
    if (this.state && !this.state.gameOver && !this.state.battle) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = 45;
        const store = this.runtime.storage;
        const prev1 = store.get(AUTO_1);
        if (prev1) store.set(AUTO_2, prev1);
        const prev0 = store.get(AUTO_KEY);
        if (prev0) store.set(AUTO_1, prev0);
        store.set(AUTO_KEY, stateLib.serialize(this.state));
      }
    }

    if (this.debugHud) {
      const t1 = this.runtime.now();
      const ms = t1 - now;
      this._frameMs = this._frameMs ? this._frameMs * 0.85 + ms * 0.15 : ms;
      this.drawHud();
    }
  }

  drawHud() {
    const ctx = this.runtime.ctx;
    const hud = 'FPS ' + Math.round(this._fps) + '  帧 ' + this._frameMs.toFixed(1) + 'ms';
    ctx.save();
    ctx.font = 'bold 20px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 240, 30);
    ctx.fillStyle = this._fps >= 50 ? '#8fe08f' : this._fps >= 30 ? '#e0c060' : '#e06060';
    ctx.fillText(hud, 8, 22);
    ctx.restore();
  }

  drawToast() {
    const ctx = this.runtime.ctx;
    const w = this.runtime.width;
    const msg = this.toast.text;
    const size = 24;
    const lines = wrap(ctx, msg, w - 160, size, 'bold');
    const boxW = Math.min(w - 60, Math.max(320, Math.max.apply(null, lines.map(function (l) {
      ctx.save();
      ctx.font = 'bold ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(l).width;
      ctx.restore();
      return tw;
    })) + 56));
    const boxH = lines.length * 36 + 32;
    const x = (w - boxW) / 2;
    const y = this.runtime.height * 0.58;
    panel(ctx, x, y, boxW, boxH, { shadow: true, fill: '#33271b' });
    lines.forEach(function (line, i) {
      text(ctx, line, w / 2, y + 18 + i * 36, { size, align: 'center' });
    });
  }

  /** 场景切换辅助：只清空 UI 热区，不动栈 */
  clearUI() {
    this.ui.items.length = 0;
    this.ui.pressed = null;
    this.lastHit = null;
  }
}

function boot() {
  const runtime = createRuntime();
  const app = new App(runtime);
  if (typeof GameGlobal !== 'undefined') GameGlobal.__BORDER_WARBAND__ = app;
  if (typeof window !== 'undefined') window.__BORDER_WARBAND__ = app;
  app.start();
  return app;
}

module.exports = { App, boot };
