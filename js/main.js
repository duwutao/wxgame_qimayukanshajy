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
      border: require('./scenes/border.js'),
      founding: require('./scenes/founding.js'),
      fief: require('./scenes/fief.js'),
      govern: require('./scenes/govern.js'),
      shop: require('./scenes/shop.js'),
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
      arc: require('./scenes/arc.js'),
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
    this.skipNextDt = false;
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
      wheel: function (dy, x, y) {
        self.onWheel(dy, x, y);
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
    // 切场景后的第一帧不继承上一帧的 dt：进城/出城不能让时间和镜头“补跳”一下。
    this.last = this.runtime.now();
    this.skipNextDt = true;
    // 开打之前留一份快照：打输了、想反悔，都能退回来
    if (name === 'battle' && this.state && !this.state.gameOver) {
      try {
        this.runtime.storage.set(PRE_KEY, stateLib.serialize(this.state));
      } catch (e) { /* ignore */ }
    }
  }

  applyMusic(name) {
    const mode = {
      title: 'title',
      menu: 'title',
      saves: 'title',
      map: 'field',
      camp: 'field',
      journal: 'field',
      help: 'field',
      atlas: 'field',
      town: 'town',
      border: 'town',
      fief: 'town',
      govern: 'town',
      shop: 'town',
      army: 'town',
      hero: 'town',
      battle: 'battle',
      chase: 'battle',
      chapter: 'tense',
      news: 'tense',
      arc: 'tense',
      founding: 'tense',
      tourney: 'tense',
      contact: 'tense',
      lord: 'tense',
      prison: 'sorrow',
      revive: 'sorrow',
      ending: 'sorrow',
    }[name];
    if (mode) audio.play(mode);
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
    this.last = this.runtime.now();
    this.skipNextDt = true;
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

  onWheel(dy, x, y) {
    const top = this.top();
    if (top && top.scene.onWheel) top.scene.onWheel(this, dy, x, y);
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
    // 主循环绝不能因为某一帧的场景/音频异常而停掉：requestAnimationFrame
    // 的下一帧由外层 loop 负责，这里只要把异常吞掉并画出可恢复提示。
    try {
      this._tick();
    } catch (e) {
      this.onTickError(e);
    }
  }

  onTickError(e) {
    this.lastError = {
      message: (e && e.message) ? String(e.message) : '未知错误',
      time: Date.now(),
    };
    this.errorCount = (this.errorCount || 0) + 1;
    try {
      this.runtime.storage.set('bw_last_error', JSON.stringify({
        message: this.lastError.message,
        scene: this.top() ? this.top().name : '',
        day: this.state && this.state.clock ? this.state.clock.day : 0,
        hour: this.state && this.state.clock ? this.state.clock.hour : 0,
        time: this.lastError.time,
      }));
    } catch (_) { /* ignore */ }
    if (typeof console !== 'undefined' && console.error) {
      console.error('[征战汉末] 帧循环异常：', e);
    }
    // 连续在非地图页面报错时，退一层，避免永远卡在坏页面上。
    if (this.errorCount >= 4 && this.stack.length > 1) {
      const top = this.top();
      if (top && top.name !== 'map' && top.name !== 'title') {
        this.errorCount = 0;
        this.pop();
      }
    }
    // 地图/标题也连续报错：最后兜底回标题，自动存档不会被覆盖。
    if (this.errorCount >= 8) {
      this.errorCount = 0;
      this.lastError = null;
      try {
        this.replace('title');
        this.showToast('画面连续出错，已返回标题；自动存档还在。', 4);
      } catch (_) { /* ignore */ }
      return;
    }
    this.drawErrorFrame();
  }

  drawErrorFrame() {
    try {
      const r = this.runtime;
      const ctx = r.ctx;
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0f0c09';
      ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);
      ctx.setTransform(r.dpr * r.scale, 0, 0, r.dpr * r.scale, 0, (r.topInsetPx || 0) * r.dpr);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f0c060';
      ctx.font = 'bold 28px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText('这一帧出了点问题', r.width / 2, r.height * 0.42);
      ctx.fillStyle = '#c9bda2';
      ctx.font = '16px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText((this.lastError && this.lastError.message || '未知错误').slice(0, 80),
        r.width / 2, r.height * 0.42 + 38);
      ctx.fillStyle = '#8a8070';
      ctx.fillText('正在尝试恢复；连续出错会自动回到标题', r.width / 2, r.height * 0.42 + 74);
      ctx.textAlign = 'left';
    } catch (_) { /* 连错误提示都画不出来时，至少保住主循环 */ }
  }

  _tick() {
    const now = this.runtime.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    // 刚切过场景：这一帧只画，不推进任何时间/插值，避免进城或回地图时补跳一大步。
    if (this.skipNextDt) {
      this.skipNextDt = false;
      dt = 0;
    }
    if (!isFinite(dt) || dt < 0) dt = 0;
    const rawDt = dt;
    if (dt > 0.06) dt = 0.06;

    if (this.debugHud && rawDt > 0) {
      const inst = 1 / rawDt;
      this._fps = this._fps * 0.85 + Math.min(inst, 120) * 0.15;
    }

    const r = this.runtime;
    const ctx = r.ctx;
    // 先回到默认画布状态再清屏：上一场景若留下 clip / globalAlpha / 变换，
    // 只 fillRect 会清不干净，画面边缘就会偶尔残留一层旧图。
    if (ctx && typeof ctx.reset === 'function') {
      ctx.reset();
    } else if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if ('filter' in ctx) ctx.filter = 'none';
      if (ctx.setLineDash) ctx.setLineDash([]);
    }
    // 按物理像素铺满整块画布：顶部让开胶囊的那条区域不能被上一帧残留
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);
    ctx.setTransform(r.dpr * r.scale, 0, 0, r.dpr * r.scale, 0, (r.topInsetPx || 0) * r.dpr);
    // 音乐是锦上添花：音频实现出问题不能把整帧拖垮。
    try {
      audio.update(dt);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[征战汉末] 音频异常：', e);
    }

    const top = this.top();
    if (top && top.scene.update) top.scene.update(this, dt);

    this.ui.begin();
    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, r.width, r.height);

    const current = this.top();
    if (current && current.scene.render) current.scene.render(this);

    if (this.toast) {
      this.toast.time -= dt;
      if (this.toast.time <= 0) this.toast = null;
      else this.drawToast();
    }

    // 自动存档：别在战斗里存，也别在结局后存。
    // 存档失败只记日志，绝不能让一局好游戏因为 JSON 序列化异常停掉；
    // 上一个自动存档槽保持原样，玩家最多损失最近 45 秒。
    if (this.state && !this.state.gameOver && !this.state.battle) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = 45;
        try {
          const store = this.runtime.storage;
          const prev1 = store.get(AUTO_1);
          if (prev1) store.set(AUTO_2, prev1);
          const prev0 = store.get(AUTO_KEY);
          if (prev0) store.set(AUTO_1, prev0);
          store.set(AUTO_KEY, stateLib.serialize(this.state));
          this.saveError = null;
        } catch (e) {
          this.saveError = (e && e.message) ? String(e.message) : '自动存档失败';
          try {
            this.runtime.storage.set('bw_save_error', JSON.stringify({
              message: this.saveError,
              day: this.state && this.state.clock ? this.state.clock.day : 0,
              hour: this.state && this.state.clock ? this.state.clock.hour : 0,
              time: Date.now(),
            }));
          } catch (_) { /* ignore */ }
          if (typeof console !== 'undefined' && console.error) {
            console.error('[征战汉末] 自动存档失败：', e);
          }
        }
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
