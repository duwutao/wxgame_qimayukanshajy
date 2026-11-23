/**
 * 史册：主线进度 + 日志 + 统计
 */

const { text, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { CAMPAIGN } = require('../data/china.js');

const JournalScene = {
  enter(app) {
    app.journalScroll = 0;
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) {
      app.pop();
      return;
    }

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '史册', 20, 24, { size: 36, color: '#f0c060' });
    text(ctx, st.player.flagName === '无旗' ? st.player.name : st.player.flagName, w - 20, 36, {
      size: 18, align: 'right', color: '#a2947a',
    });

    // 当前章
    const stage = CAMPAIGN[Math.min(st.campaign.stage, CAMPAIGN.length - 1)];
    ctx.fillStyle = '#241c14';
    ctx.fillRect(16, 82, w - 32, 140);
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(16, 82, 5, 140);
    if (st.campaign.stage >= CAMPAIGN.length) {
      text(ctx, '主线已走完', 34, 96, { size: 24, color: '#8fbf7a' });
      text(ctx, '剩下的，是你在图上留下多少座城。', 34, 136, { size: 16, color: '#a2947a' });
    } else if (stage) {
      text(ctx, stage.title, 34, 94, { size: 24, color: '#f0c060' });
      text(ctx, '目标 · ' + stage.goal, 34, 132, { size: 16, color: '#c9bda2' });
      text(ctx, '进度 ' + st.campaign.stage + ' / ' + CAMPAIGN.length, w - 30, 96, {
        size: 16, align: 'right', color: '#8a8070',
      });
    }

    // 统计
    const sy = 246;
    const stats = [
      ['天数', st.clock.day],
      ['胜仗', st.stats.battlesWon],
      ['败仗', st.stats.battlesLost],
      ['城', st.stats.sitesTaken],
      ['里程', st.stats.distance],
      ['史简', st.player.shiUsed],
    ];
    const cw = (w - 32) / stats.length;
    stats.forEach(function (s, i) {
      const x = 16 + i * cw;
      text(ctx, s[0], x, sy, { size: 15, color: '#8a8070' });
      text(ctx, String(s[1]), x, sy + 24, { size: 24, color: '#efe3c6' });
    });

    // 日志
    text(ctx, '记事', 20, sy + 74, { size: 20, color: '#a2947a' });
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(20, sy + 104, w - 40, 2);

    let y = sy + 120;
    const list = st.log.slice().reverse().slice(0, 16);
    list.forEach(function (entry) {
      if (y > h - 150) return;
      const line = '第' + entry.day + '天 · ' + entry.text;
      wrap(ctx, line, w - 44, 16, 'bold').slice(0, 2).forEach(function (l, i) {
        text(ctx, l, 20, y + i * 24, { size: 16, color: i === 0 ? '#c9bda2' : '#8a8070' });
      });
      y += 46;
    });

    app.ui.button(ctx, 20, h - 92, w - 40, 72, '返回', {
      id: 'j_back', size: 26, onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = JournalScene;
