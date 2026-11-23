/**
 * 章节提示：浮在地图中央的一张卡片，让玩家看见"现在该干什么"
 * 3.6 秒后自动收起，也可以点一下直接收
 */

const { text, wrap, panel } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const { CAMPAIGN } = require('../data/china.js');
const stateLib = require('../core/state.js');

const HOLD = 3.6;

const ChapterScene = {
  enter(app, params) {
    const ch = CAMPAIGN.filter(function (c) { return c.id === params.id; })[0] || CAMPAIGN[0];
    const info = app.state ? stateLib.campaignInfo(app.state) : null;
    app.chapterView = {
      ch,
      hint: info && info.id === ch.id ? info.hint : ch.goal,
      t: 0,
      fade: 0,
    };
  },

  update(app, dt) {
    const v = app.chapterView;
    if (!v) return;
    v.t += dt;
    v.fade = Math.min(1, v.t / 0.25);
    if (v.t > HOLD) app.pop();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const v = app.chapterView;
    if (!v) return;
    const ch = v.ch;
    const a = v.fade;

    // 底下的地图先照常画一遍，弹的是"浮在地图上"的卡
    const below = app.stack.length > 1 ? app.stack[app.stack.length - 2] : null;
    if (below && below.scene && below.scene.render) {
      below.scene.render(app);
      // 下层注册的按钮不作数，避免穿透点击
      app.ui.items.length = 0;
    }

    ctx.fillStyle = 'rgba(6,5,4,' + (0.66 * a) + ')';
    ctx.fillRect(0, 0, w, h);

    const cw = Math.min(w - 64, 620);
    const chHeight = Math.min(h - 150, 300);
    const cx = (w - cw) / 2;
    const cy = (h - chHeight) / 2;
    const up = (HOLD - v.t) / HOLD;

    panel(ctx, cx, cy, cw, chHeight, { fill: '#1d1710' });

    text(ctx, '第 ' + (CAMPAIGN.indexOf(ch) + 1) + ' 章 · 开启', cx + cw / 2, cy + 16, {
      size: 17, align: 'center', color: '#8a8070',
    });
    text(ctx, ch.title, cx + cw / 2, cy + 40, { size: 30, align: 'center', color: '#f0c060' });

    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(cx + cw / 2 - 60, cy + 84, 120, 3);

    // 目标 + 怎么走：两段分开算高度，避免叠字
    let y = cy + 100;
    const goalLines = wrap(ctx, ch.goal, cw - 116, 20, 'bold').slice(0, 2);
    text(ctx, '目标', cx + 32, y + 2, { size: 16, color: '#8a8070' });
    goalLines.forEach(function (l, i) {
      text(ctx, l, cx + 92, y + i * 28, { size: 20, color: '#efe3c6' });
    });
    y += Math.max(1, goalLines.length) * 28 + 12;

    const hintLines = wrap(ctx, v.hint || '', cw - 116, 19, 'bold').slice(0, 3);
    text(ctx, '怎么走', cx + 32, y + 2, { size: 16, color: '#8a8070' });
    hintLines.forEach(function (l, i) {
      text(ctx, l, cx + 92, y + i * 26, { size: 19, color: '#c9bda2' });
    });
    y += Math.max(1, hintLines.length) * 26 + 14;

    if (ch.reward) {
      const parts = [];
      if (ch.reward.gold) parts.push(ch.reward.gold + ' 金');
      if (ch.reward.renown) parts.push(ch.reward.renown + ' 声望');
      if (ch.reward.shi) parts.push(ch.reward.shi + ' 支史简');
      if (ch.reward.banner) parts.push('一面自己的旗');
      if (parts.length) {
        text(ctx, '得：' + parts.join(' · '), cx + 32, y, { size: 16, color: '#f0c060' });
      }
    }

    // 自动收起的进度条
    const barY = cy + chHeight - 18;
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(cx + 40, barY, cw - 80, 3);
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(cx + 40, barY, (cw - 80) * Math.max(0, up), 3);

    text(ctx, '点一下收起来 · 左上角随时能看', cx + cw / 2, cy + chHeight + 12, {
      size: 15, align: 'center', color: '#8a8070',
    });

    app.ui.rect('chapter_tap', 0, 0, w, h, function () { app.pop(); });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ChapterScene;
