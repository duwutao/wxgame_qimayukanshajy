/**
 * 牢房：营后捆着的领主，收赎金或者白放换人情。
 * 也列出天下各处牢里关着的人（只读）。
 */

const { text, wrap } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const { FACTIONS } = require('../data/china.js');
const { lookFor } = require('../data/extra.js');

const TOP = 96;
const BOT = 96;
const ROW_H = 134;

const PrisonScene = {
  enter() {
    this.scroll = 0;
    this.maxScroll = 0;
    this.drag = null;
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    const list = stateLib.prisonersOf(st);
    const mine = list.filter(function (p) { return p.by === 'player'; });
    const others = list.filter(function (p) { return p.by !== 'player'; });

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '牢房', 20, 24, { size: 36, color: '#f0c060' });
    text(ctx, '捆着 ' + mine.length + ' 人', w - 20, 34, { size: 18, align: 'right', color: '#a2947a' });
    text(ctx, '关得越久越容易自己跑；赎金由家人来出，放人换个名声。', 20, 66, {
      size: 15, color: '#8a8070',
    });

    // ---- 滚动区 ----
    this.rows = [];
    this.hitRows = [];
    const viewH = h - TOP - BOT;
    let y = 0;
    const rects = [];

    const pushRow = function (r) {
      r.y = y;
      this.rows.push(r);
      rects.push(r);
      y += ROW_H + 10;
    }.bind(this);

    if (!list.length) {
      pushRow({ kind: 'empty' });
    }

    mine.forEach(function (p) {
      pushRow({ kind: 'mine', data: p });
    });

    if (others.length) {
      pushRow({ kind: 'head', label: '别处的牢里（你插不上手）' });
      others.forEach(function (p) {
        pushRow({ kind: 'other', data: p });
      });
    }

    this.contentH = y;
    this.maxScroll = Math.max(0, this.contentH - viewH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP - 8, w, viewH + 16);
    ctx.clip();
    ctx.translate(0, TOP - this.scroll);

    this.rows.forEach(function (r) {
      const ry = r.y;
      if (ry > viewH + this.scroll + 160 || ry + ROW_H < this.scroll - 160) return;
      if (r.kind === 'empty') {
        text(ctx, '牢里空着。打赢一位领主，才有资格往这儿捆人。', 24, ry + 16, { size: 19, color: '#8a8070' });
        return;
      }
      if (r.kind === 'head') {
        text(ctx, r.label, 20, ry + 12, { size: 17, color: '#6a6050' });
        return;
      }
      const p = r.data;
      const mineRow = r.kind === 'mine';
      ctx.fillStyle = mineRow ? 'rgba(40,30,22,0.85)' : 'rgba(30,26,20,0.55)';
      ctx.fillRect(16, ry, w - 32, ROW_H);
      ctx.strokeStyle = mineRow ? '#5a4a2a' : '#33291e';
      ctx.strokeRect(16.5, ry + 0.5, w - 33, ROW_H - 1);

      const color = (FACTIONS[p.faction] || {}).color || '#8a8070';
      const portrait = app.assets.portraitFor
        ? app.assets.portraitFor(color, lookFor(p.lordId))
        : null;
      if (portrait) ctx.drawImage(portrait, 26, ry + 14, 54, 52);

      text(ctx, p.name, 92, ry + 10, { size: 24, color: '#efe3c6' });
      text(ctx, p.title || '领主', w - 26, ry + 14, { size: 15, align: 'right', color: '#8a8070' });
      text(ctx, (p.faction ? '(' + p.faction + ') ' : '') + '关在' + p.place + ' · 第 ' + p.days + ' 天', 92, ry + 38, {
        size: 16, color: '#a2947a',
      });
      text(ctx, mineRow ? '自己逃的概率 ' + Math.round(p.chance * 100) + '%/日 · 赎金 ' + p.ransom + ' 金'
        : '他家的人会来赎；城破了就放', 92, ry + 62, {
        size: 14, color: mineRow ? '#c9bda2' : '#6a6050',
      });

      if (mineRow) {
        drawBtn(ctx, w - 236, ry + 82, 100, 42, '收赎金 ' + p.ransom, '#5a4a2a');
        drawBtn(ctx, w - 126, ry + 82, 100, 42, '放了', '#3a4a2a');
      }
    }, this);

    ctx.restore();

    app.ui.button(ctx, 20, h - 78, w - 40, 62, '返回', {
      id: 'pr_back', size: 24, onTap: function () { app.pop(); },
    });

    this.hitRows = rects.map(function (r) {
      return { y: r.y, kind: r.kind, data: r.data };
    });
  },

  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.scroll, moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (!this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 6) this.drag.moved = Math.abs(dy);
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.drag.scroll - dy));
  },

  onTouchEnd(app, x, y) {
    const d = this.drag || { moved: 0 };
    this.drag = null;
    if (d.moved > 8) return;
    const w = app.runtime.width;
    const list = this.hitRows || [];
    for (let i = 0; i < list.length; i += 1) {
      const r = list[i];
      if (r.kind !== 'mine') continue;
      const sy = TOP - this.scroll + r.y;
      if (y < sy + 76 || y > sy + 128) continue;
      if (x >= w - 236 && x <= w - 136) {
        const res = stateLib.ransomPrisoner(app.state, r.data.lordId);
        app.showToast(res.msg, 2.4);
        return;
      }
      if (x >= w - 126 && x <= w - 26) {
        const res = stateLib.releasePrisoner(app.state, r.data.lordId);
        app.showToast(res.msg, 2.4);
        return;
      }
    }
  },
};

function drawBtn(ctx, x, y, w, h, label, color) {
  ctx.fillStyle = color || '#4a3a24';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8a7448';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  text(ctx, label, x + w / 2, y + 10, { size: 15, align: 'center', color: '#e8dcc0' });
}

module.exports = PrisonScene;
