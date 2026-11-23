/**
 * 章节页：一章打完，把话说清楚
 */

const { text, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const { CAMPAIGN } = require('../data/china.js');

const ChapterScene = {
  enter(app, params) {
    app.chapterView = {
      ch: CAMPAIGN.filter(function (c) { return c.id === params.id; })[0] || CAMPAIGN[0],
    };
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const ch = app.chapterView.ch;

    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(240,192,96,0.06)';
    ctx.fillRect(0, 0, w, h * 0.42);

    text(ctx, '第 ' + (CAMPAIGN.indexOf(ch) + 1) + ' 章', w / 2, 90, { size: 18, align: 'center', color: '#8a8070' });
    text(ctx, ch.title, w / 2, 122, { size: 40, align: 'center', color: '#f0c060' });

    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(w / 2 - 60, 186, 120, 3);

    // 故事
    let y = 226;
    ch.story.split('\n').forEach(function (line) {
      wrap(ctx, line, w - 96, 19, 'bold').forEach(function (l) {
        text(ctx, l, 48, y, { size: 19, color: '#c9bda2' });
        y += 32;
      });
      y += 8;
    });

    // 目标
    y += 10;
    text(ctx, '目标 · ' + ch.goal, 48, y, { size: 17, color: '#8a8070' });
    y += 40;

    // 完成文案
    if (ch.after) {
      ctx.fillStyle = 'rgba(60,44,24,0.5)';
      ctx.fillRect(28, y - 4, w - 56, 130);
      ctx.fillStyle = UI_COLORS.accent;
      ctx.fillRect(28, y - 4, 4, 130);
      wrap(ctx, ch.after, w - 100, 20, 'bold').slice(0, 3).forEach(function (line, i) {
        text(ctx, line, 46, y + 16 + i * 34, { size: 20, color: '#efe3c6' });
      });
      y += 150;
    }

    // 奖励
    if (ch.reward) {
      const parts = [];
      if (ch.reward.gold) parts.push(ch.reward.gold + ' 金');
      if (ch.reward.renown) parts.push(ch.reward.renown + ' 声望');
      if (ch.reward.shi) parts.push(ch.reward.shi + ' 支史简');
      if (ch.reward.banner) parts.push('一面自己的旗');
      if (parts.length) text(ctx, '得：' + parts.join(' · '), 48, y, { size: 17, color: '#f0c060' });
    }

    app.ui.button(ctx, 40, h - 120, w - 80, 78, '记下这一页', {
      id: 'ch_ok', size: 28, fill: '#3a2c1e', onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ChapterScene;
