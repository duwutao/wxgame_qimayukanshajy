/**
 * 天下通报：国亡、君主下落这类大事，全屏弹一张榜文
 * 点"知道了"收起，不自动消失（这种消息得让人看完）
 */

const { text, wrap, panel } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');

const NewsScene = {
  enter(app, params) {
    const ev = params || {};
    app.newsView = {
      title: ev.title || '榜文',
      lines: Array.isArray(ev.lines) ? ev.lines.slice(0, 6) : [],
      tag: ev.factionId ? '天下' : '军情',
      t: 0,
    };
  },

  update(app, dt) {
    const v = app.newsView;
    if (!v) return;
    v.t += dt;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const v = app.newsView;
    if (!v) return;

    // 全屏榜文：底下的地图不重画，免得和别的弹窗互相套娃
    ctx.fillStyle = '#0b0906';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(6,5,4,0.55)';
    ctx.fillRect(0, 0, w, h);

    const lines = v.lines.length ? v.lines : ['天下无事。'];
    const cw = Math.min(w - 56, 640);
    const bodyTop = 126;
    const lineGap = 30;
    let bodyH = 0;
    const wrapped = lines.map(function (l) {
      const ls = wrap(ctx, l, cw - 72, 19).slice(0, 3);
      bodyH += ls.length * lineGap;
      return ls;
    });
    const chHeight = Math.min(h - 120, bodyTop + bodyH + 96);
    const cx = (w - cw) / 2;
    const cy = (h - chHeight) / 2;

    panel(ctx, cx, cy, cw, chHeight, { fill: '#1a1410' });

    text(ctx, '— ' + v.tag + ' —', cx + cw / 2, cy + 16, {
      size: 15, align: 'center', color: '#8a8070',
    });
    text(ctx, v.title, cx + cw / 2, cy + 42, { size: 30, align: 'center', color: '#d05040' });

    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(cx + cw / 2 - 56, cy + 86, 112, 3);

    let y = cy + bodyTop;
    wrapped.forEach(function (ls) {
      ls.forEach(function (l) {
        text(ctx, l, cx + 36, y, { size: 19, color: '#e6d8ba' });
        y += lineGap;
      });
      y += 6;
    });

    text(ctx, '榜文贴在各城门口，来往的人都在看。', cx + cw / 2, cy + chHeight - 74, {
      size: 15, align: 'center', color: '#8a8070',
    });

    const bx = cx + 60;
    const by = cy + chHeight - 58;
    const bw = cw - 120;
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(bx, by, bw, 46);
    ctx.fillStyle = '#6b5540';
    ctx.fillRect(bx, by, bw, 2);
    text(ctx, '知道了', cx + cw / 2, by + 12, { size: 22, align: 'center', color: '#f0c060' });
    app.ui.rect('news_ok', bx, by, bw, 46, function () {
      app.newsView = null;
      app.pop();
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = NewsScene;
