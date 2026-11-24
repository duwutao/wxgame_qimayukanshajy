/**
 * 扎营：军令与天下事都在这里。
 * 天下大势、玩法说明从底栏收进来；另添"在这里待一会儿"和"招降俘虏"。
 */

const { text, panel, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const { siteById } = require('../core/world.js');
const army = require('../core/army.js');
const { FACTIONS } = require('../data/china.js');

const PAD = 16;

const CampScene = {
  enter(app) {
    this.view = 'menu';
    this.lastLine = '';
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, w, h);

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
    const items = [
      ['第', st.clock.day + ' 天'],
      ['士气', p.morale],
      ['金', p.gold],
      ['粮', p.food],
      ['兵', army.troopCount(p.troops)],
    ];
    const cw = (w - PAD * 2 - 20) / items.length;
    items.forEach(function (it, i) {
      const x = PAD + 10 + i * cw;
      text(ctx, it[0], x, 94, { size: 13, color: '#8a8070' });
      text(ctx, String(it[1]), x, 116, { size: 22, color: '#efe3c6' });
    });

    if (this.view === 'wait') this.renderWait(app, ctx, w, h);
    else this.renderMenu(app, ctx, w, h);

    app.ui.button(ctx, PAD, h - 78, w - PAD * 2, 58, '拔营', {
      id: 'camp_back', size: 24, onTap: function () { app.pop(); },
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

    const rows = [
      {
        label: '天下大势', sub: sub, hint: '诸国宣战 · 围城 · 俘虏',
        onTap: function () { app.push('atlas'); },
      },
      {
        label: '在这里待一会儿', sub: '原地等 2 时辰到 3 日', hint: '不赶路，让天下自己动',
        onTap: function () { this.view = 'wait'; }.bind(this),
      },
      {
        label: '招降俘虏', sub: mine.length ? '牢里捆着 ' + mine.length + ' 位领主' : '牢里暂时空着',
        hint: mine.length ? '无旗必拒 · 城多则服' : '打赢一位领主，才有人可招',
        disabled: !mine.length,
        onTap: function () { app.push('prison'); },
      },
      {
        label: '玩法说明', sub: '行军 · 粮草 · 国战 · 攻城',
        hint: '不懂哪一条，点开看',
        onTap: function () { app.push('help'); },
      },
    ];

    let y = 194;
    rows.forEach(function (r, i) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, 104, '', {
        id: 'camp_' + i, disabled: r.disabled, fill: 'rgba(38,29,20,0.9)', onTap: r.onTap,
      });
      text(ctx, r.label, PAD + 20, y + 16, {
        size: 26, color: r.disabled ? '#6a6050' : '#f0c060',
      });
      text(ctx, r.sub, PAD + 20, y + 52, { size: 16, color: '#c9bda2' });
      text(ctx, r.hint, w - PAD - 20, y + 72, { size: 13, align: 'right', color: '#8a8070' });
      y += 116;
    });

    const line = '火堆不灭，斥候放出。营里的人都在等你一句话。';
    let ly = y + 12;
    wrap(ctx, line, w - PAD * 2, 15).slice(0, 2).forEach(function (l) {
      text(ctx, l, PAD, ly, { size: 15, color: '#8a8070' });
      ly += 22;
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

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = CampScene;
