/**
 * 扎营：军令与天下事都在这里。
 * 天下大势、玩法说明从底栏收进来；另添"在这里待一会儿"和"招降俘虏"。
 */

const { text, panel, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const scenery = require('../render/scenery.js');
const { siteById } = require('../core/world.js');
const army = require('../core/army.js');
const { FACTIONS } = require('../data/china.js');
const flows = require('./flows.js');

const PAD = 16;

function factionLabel(st, id) {
  if (id === 'player') {
    return (st.player.country && st.player.country.name)
      ? st.player.country.name + '国' : '你的旗';
  }
  return (FACTIONS[id] || {}).full || id;
}

function gameClockText(st) {
  const hour = Math.floor(st.clock.hour);
  const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return '第 ' + st.clock.day + ' 天 ' + pad(hour) + ' 时';
}

const CampScene = {
  enter(app, params) {
    const p = params || {};
    this.lastLine = '';
    this.flowStartH = 0;
    this.foreignScroll = 0;
    this.drag = null;
    this.dragMoved = 0;
    // 从大地图点回来（或营中再点扎营）时，直接停在“继续/拔营”这一页。
    if (p.pause || (app.state && app.state.campFlow)) {
      this.view = 'pause';
      this.pauseLine = p.reason || '你把时辰按住了。';
      if (app.state) app.state.campFlow = false;
      return;
    }
    this.view = 'menu';
    if (app.state) {
      app.state.campFlow = false;
      if (app.state.player && app.state.player.route && app.state.player.route.length) {
        stateLib.stopMoving(app.state);
      }
    }
  },
  update(app, dt) {
    const st = app.state;
    if (!st) return;
    if (this.view !== 'flowing') {
      st.campFlow = false;
      return;
    }
    st.campFlow = true;
    if (!this.flowStartH) this.flowStartH = stateLib.gameHours(st);
    stateLib.update(st, dt, { ignoreEvents: true });
    if (st.gameOver) {
      this.pause(app, '旅途已经结束。');
      return;
    }
    // 天下出了事，先把时辰停住，让玩家看完再决定继续还是拔营。
    if (st.events.length) {
      this.pause(app, '营外来了军情，时辰先停。');
      flows.process(app);
    }
  },

  pause(app, reason) {
    this.view = 'pause';
    this.pauseLine = reason || '你把时辰按住了。';
    if (app.state) app.state.campFlow = false;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'camp', w, h, 17);

    // 营火的光，照亮半张幕布
    const glow = ctx.createRadialGradient(w / 2, h * 0.62, 30, w / 2, h * 0.62, h * 0.75);
    glow.addColorStop(0, 'rgba(116,66,24,0.24)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const site = st.player.atSiteId ? siteById(st.world, st.player.atSiteId) : null;
    const place = site ? site.name + '城外' : '野地';

    text(ctx, '扎营', PAD + 4, 24, { size: 36, color: '#f0c060' });
    text(ctx, place, w - PAD, 34, { size: 17, align: 'right', color: '#a2947a' });

    // 状态条
    panel(ctx, PAD, 78, w - PAD * 2, 88, { fill: 'rgba(36,28,20,0.88)' });
    const p = st.player;
    const foodNeed = stateLib.nextFoodNeed(st);
    const foodShort = p.food < foodNeed;
    const items = [
      ['第', st.clock.day + ' 天'],
      ['士气', p.morale],
      ['金钱', p.gold],
      ['粮草', p.food, foodShort ? '#e06a52' : '#efe3c6'],
      ['兵力', army.troopCount(p.troops)],
    ];
    const cw = (w - PAD * 2 - 20) / items.length;
    items.forEach(function (it, i) {
      const x = PAD + 10 + i * cw;
      text(ctx, it[0], x, 94, { size: 13, color: '#8a8070' });
      text(ctx, String(it[1]), x, 116, { size: 18, color: it[2] || '#efe3c6' });
    });
    if (foodShort) {
      text(ctx, '粮草不足以支撑两日 · 下次发粮需 ' + foodNeed + '，速补！',
        PAD + 10, 142, { size: 14, color: '#e06a52' });
    }

    if (this.view === 'flowing') {
      this.renderFlowing(app, ctx, w, h);
      return;
    }
    if (this.view === 'pause') {
      this.renderPause(app, ctx, w, h);
      return;
    }
    if (this.view === 'foreign') {
      this.renderForeign(app, ctx, w, h);
      return;
    }
    this.renderMenu(app, ctx, w, h);

    app.ui.button(ctx, PAD, h - 78, w - PAD * 2, 58, '拔营', {
      id: 'camp_back', size: 24, onTap: function () {
        if (app.state) app.state.campFlow = false;
        app.pop();
      },
    });
  },

  renderMenu(app, ctx, w, h) {
    const st = app.state;
    const mine = stateLib.prisonersOf(st).filter(function (p) { return p.by === 'player'; });
    const wars = stateLib.factionWars(st);
    const sieges = st.warCampaigns ? Object.keys(st.warCampaigns).filter(function (k) {
      return st.warCampaigns[k] && st.warCampaigns[k].stage === 'siege';
    }).length : 0;
    const sub = wars.length
      ? (sieges ? sieges + ' 处围城，' : '') + wars.length + ' 处交兵'
      : '四境暂无大战';
    const country = st.player.country;

    const rows = [
      {
        label: '天下大势', sub: sub, hint: '诸国宣战 · 围城 · 俘虏',
        onTap: function () { app.push('atlas'); },
      },
      {
        label: '在这里扎住 · 让时辰走',
        sub: '不选几个时辰，天下自己慢慢走', hint: '点屏幕任意处停下',
        onTap: function () {
          // 和进城休息一个道理：收了营帐回大地图，让时辰在外面流。
          app.pop();
          if (app.state) app.state.campFlow = true;
        },
      },
      {
        label: '外国战事', sub: wars.length ? wars.length + ' 处交兵' : '四境暂时太平',
        hint: '看哪两家正在打',
        onTap: function () { this.foreignScroll = 0; this.view = 'foreign'; }.bind(this),
      },
      {
        label: '招降俘虏', sub: mine.length ? '牢里捆着 ' + mine.length + ' 位领主' : '牢里暂时空着',
        hint: mine.length ? '无旗必拒 · 城多则服' : '打赢一位领主，才有人可招',
        disabled: !mine.length,
        onTap: function () { app.push('prison'); },
      },
      {
        label: '国号与旗色',
        sub: country
          ? (country.name
            ? '国号「' + country.name + '」 · 旗色 ' + (stateLib.flagColorName(country.color) || country.color)
            : '旗已立，国号还没定')
          : '打下第一座城后自立',
        hint: country ? '改一字国号 · 换旗色' : '还没有自己的旗',
        disabled: !country,
        onTap: function () { app.push('founding', { edit: true }); },
      },
      {
        label: '玩法说明', sub: '行军 · 粮草 · 国战 · 攻城',
        hint: '不懂哪一条，点开看',
        onTap: function () { app.push('help'); },
      },
    ];

    const rowGap = 6;
    const buttonY = h - 78;
    const rowH = Math.max(58, Math.min(78,
      Math.floor((buttonY - 194 - 28 - rowGap * (rows.length - 1)) / rows.length)));
    let y = 194;
    rows.forEach(function (r, i) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, rowH, '', {
        id: 'camp_' + i, disabled: r.disabled, fill: 'rgba(38,29,20,0.9)', onTap: r.onTap,
      });
      text(ctx, r.label, PAD + 20, y + 8, {
        size: rowH >= 72 ? 23 : 20, color: r.disabled ? '#6a6050' : '#f0c060',
      });
      text(ctx, r.sub, PAD + 20, y + 33, { size: 14, color: '#c9bda2' });
      text(ctx, r.hint, w - PAD - 20, y + 53, {
        size: 12, align: 'right', color: '#8a8070',
      });
      y += rowH + rowGap;
    });

    const line = '火堆不灭，斥候放出。营里的人都在等你一句话。';
    let ly = y + 10;
    wrap(ctx, line, w - PAD * 2, 15).slice(0, 1).forEach(function (l) {
      if (ly < buttonY - 4) text(ctx, l, PAD, ly, { size: 14, color: '#8a8070' });
    });
  },

  renderFlowing(app, ctx, w, h) {
    const st = app.state;
    const nowH = stateLib.gameHours(st);
    const elapsed = Math.max(0, nowH - (this.flowStartH || nowH));
    const days = Math.floor(elapsed / 24);
    const hours = Math.floor(elapsed % 24);
    const elapsedText = (days > 0 ? days + ' 天 ' : '') + hours + ' 个时辰';

    text(ctx, '时辰在走', PAD + 4, 190, { size: 34, color: '#f0c060' });
    text(ctx, '营火不灭，天下照常流转；不用再选等几个时辰。', PAD + 4, 238, {
      size: 16, color: '#a2947a',
    });

    panel(ctx, PAD, 292, w - PAD * 2, 204, { fill: 'rgba(30,23,16,0.92)' });
    text(ctx, gameClockText(st), PAD + 22, 316, { size: 30, color: '#efe3c6' });
    text(ctx, '这一回已经过去 ' + elapsedText, PAD + 22, 366, { size: 18, color: '#c9bda2' });
    text(ctx, '斥候在外，粮车在侧；你可以一直看着，也可以随时按住。', PAD + 22, 402, {
      size: 15, color: '#8a8070',
    });
    text(ctx, '世界时间：' + (st.timeScale || 1) + 'x', PAD + 22, 434, {
      size: 15, color: '#8a8070',
    });

    const pulse = 0.55 + 0.45 * Math.abs(Math.sin((app.runtime.now ? app.runtime.now() : Date.now()) / 900));
    ctx.fillStyle = 'rgba(240,192,96,' + pulse.toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(w / 2, h - 144, 5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, '点屏幕任意处 · 停下时辰', w / 2, h - 130, {
      size: 18, align: 'center', color: '#a2947a',
    });
    text(ctx, '停下后可以选择继续，或拔营离开。', w / 2, h - 102, {
      size: 14, align: 'center', color: '#6a6050',
    });
  },

  renderPause(app, ctx, w, h) {
    const st = app.state;
    text(ctx, '时辰停住了', PAD + 4, 190, { size: 34, color: '#f0c060' });
    text(ctx, this.pauseLine || '你把时辰按住了。', PAD + 4, 238, { size: 16, color: '#a2947a' });

    panel(ctx, PAD, 292, w - PAD * 2, 146, { fill: 'rgba(30,23,16,0.92)' });
    text(ctx, gameClockText(st), PAD + 22, 314, { size: 28, color: '#efe3c6' });
    text(ctx, '继续让时辰走，或者收拾营帐离开。', PAD + 22, 362, {
      size: 16, color: '#c9bda2',
    });

    app.ui.button(ctx, PAD, h - 226, w - PAD * 2, 78, '继续让时辰走', {
      id: 'camp_flow_continue', size: 26, fill: '#3a2c1e', onTap: function () {
        app.pop();
        if (app.state) app.state.campFlow = true;
      },
    });
    app.ui.button(ctx, PAD, h - 136, w - PAD * 2, 78, '拔营离开', {
      id: 'camp_flow_leave', size: 26, fill: '#4a241c', onTap: function () {
        if (app.state) app.state.campFlow = false;
        app.pop();
      },
    });
  },

  renderForeign(app, ctx, w, h) {
    const st = app.state;
    const wars = stateLib.factionWars(st);
    text(ctx, '外国战事', PAD + 4, 190, { size: 32, color: '#f0c060' });
    text(ctx, '只看别家交兵，不替你决定和谁开战。', PAD + 4, 234, { size: 15, color: '#a2947a' });

    const y0 = 278;
    const rowH = 64;
    const gap = 8;
    const viewBottom = h - 154;
    const viewH = Math.max(120, viewBottom - y0);
    this.foreignMax = Math.max(0, wars.length * (rowH + gap) - viewH);
    this.foreignScroll = Math.max(0, Math.min(this.foreignMax, this.foreignScroll || 0));

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, w, viewH);
    ctx.clip();
    wars.forEach(function (war, i) {
      const ry = y0 + i * (rowH + gap) - (app.top().scene.foreignScroll || 0);
      if (ry < y0 - rowH || ry > y0 + viewH + rowH) return;
      ctx.fillStyle = i % 2 ? '#201a14' : '#261f17';
      ctx.fillRect(PAD, ry, w - PAD * 2, rowH);
      const a = factionLabel(st, war.a);
      const b = factionLabel(st, war.b);
      const isMine = war.a === 'player' || war.b === 'player';
      text(ctx, a + ' 与 ' + b, PAD + 16, ry + 10, { size: 20, color: '#efe3c6' });
      text(ctx, '交兵 ' + Math.max(0, war.days) + ' 天' + (isMine ? ' · 其中有你' : ''),
        PAD + 16, ry + 38, { size: 14, color: isMine ? '#f0c060' : '#8a8070' });
    });
    ctx.restore();

    if (!wars.length) {
      text(ctx, '四境暂时没有两家交兵。', PAD + 8, y0 + 8, { size: 20, color: '#8a8070' });
    }
    if (this.foreignMax > 0) {
      const thumbH = Math.max(30, viewH * (viewH / (wars.length * (rowH + gap))));
      const thumbY = y0 + (viewH - thumbH) * (this.foreignScroll / this.foreignMax);
      ctx.fillStyle = 'rgba(80,66,46,0.4)';
      ctx.fillRect(w - 8, y0, 4, viewH);
      ctx.fillStyle = '#8a7448';
      ctx.fillRect(w - 8, thumbY, 4, thumbH);
    }

    text(ctx, '滚轮 / 上下拖动可看全部。', PAD, h - 150, {
      size: 14, color: '#8a8070',
    });
    app.ui.button(ctx, PAD, h - 78, w - PAD * 2, 58, '返回营帐', {
      id: 'camp_foreign_back', size: 24, fill: '#241c14', onTap: function () {
        this.view = 'menu';
      }.bind(this),
    });
  },

  renderWait(app, ctx, w, h) {
    const st = app.state;
    const self = this;
    text(ctx, '在这里待一会儿', PAD, 190, { size: 28, color: '#f0c060' });
    wrap(ctx, '队伍原地扎住，不拔营、不打仗。你等多久，天下就走多久；邻近的旗会不会靠过来，谁也说不准。',
      w - PAD * 2, 16).forEach(function (l, i) {
      text(ctx, l, PAD, 236 + i * 24, { size: 15, color: '#a2947a' });
    });

    const waits = [
      { h: 2, label: '2 个时辰', sub: '埋锅造饭，喘口气' },
      { h: 12, label: '半日', sub: '喂马、修甲、放斥候' },
      { h: 24, label: '一日', sub: '睡一整夜，天下照走' },
      { h: 72, label: '三日', sub: '等消息，也等援军' },
    ];
    let y = 318;
    waits.forEach(function (wt, i) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, 78, '', {
        id: 'wait_' + i, fill: 'rgba(38,29,20,0.9)', onTap: function () {
          const r = stateLib.campWait(st, wt.h);
          app.showToast(r.msg, 2.4);
          self.view = 'menu';
        },
      });
      text(ctx, wt.label, PAD + 20, y + 10, { size: 22, color: '#efe3c6' });
      text(ctx, wt.sub, PAD + 20, y + 42, { size: 14, color: '#8a8070' });
      y += 88;
    });

    app.ui.button(ctx, PAD, y + 8, w - PAD * 2, 58, '回营帐', {
      id: 'wait_back', size: 22, onTap: function () { self.view = 'menu'; },
    });
  },

  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.foreignScroll || 0, moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (this.view !== 'foreign' || !this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 5) this.drag.moved = Math.abs(dy);
    if (this.drag.moved > 5) {
      app.ui.pressed = null;
      this.foreignScroll = Math.max(0, Math.min(this.foreignMax || 0, this.drag.scroll - dy));
    }
  },

  onTouchEnd(app, x, y) {
    this.drag = null;
    if (this.view === 'flowing' && !app.lastHit) {
      this.pause(app, '你把时辰按住了。');
    }
  },

  onWheel(app, dy) {
    if (this.view !== 'foreign') return;
    this.foreignScroll = Math.max(0, Math.min(this.foreignMax || 0,
      (this.foreignScroll || 0) + dy));
  },

  leave(app) {
    if (app.state) app.state.campFlow = false;
  },
};

module.exports = CampScene;
