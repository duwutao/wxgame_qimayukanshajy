/**
 * 史册：主线进度 + 全部记事 + 统计。
 * 近十二天的事一条不落；再往前，只留改旗、围城、斩将这类大事。
 * 大事按类别着色，往下拖就能翻到几个月前。
 */

const { text, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { CAMPAIGN } = require('../data/china.js');

const TOP = 330;
const BOT = 104;
const RECENT_DAYS = 12;

/** 山贼/匪团的战报不再进史册：史册只记天下事，不记剿匪流水账。 */
function isBanditFight(entry) {
  const kind = entry && entry.kind;
  if (kind !== 'war' && kind !== 'battle') return false;
  return /匪|山贼|贼寇|匪首|匪团/.test(String((entry && entry.text) || ''));
}

const KIND_COLORS = {
  war: '#c86a5a',
  battle: '#e0a050',
  siege: '#d98a3a',
  muster: '#7aa6a0',
  campaign: '#e8c060',
  faction: '#8fb0d8',
  recruit: '#8fbf7a',
  death: '#c05a5a',
  throne: '#b98fd8',
  camp: '#8a8070',
  trade: '#a2947a',
  life: '#9a9080',
};

const KIND_LABELS = {
  war: '战事', battle: '战斗', siege: '围城', muster: '集结', campaign: '战役',
  faction: '天下', recruit: '归降', death: '死讯', throne: '大位', camp: '扎营',
};

function kindColor(entry) {
  if (entry.important && (entry.kind === 'camp' || entry.kind === 'life' || entry.kind === 'trade')) {
    return '#e0a050';
  }
  return KIND_COLORS[entry.kind] || (entry.important ? '#e8c060' : '#9a9080');
}

const JournalScene = {
  enter() {
    this.scroll = 0;
    this.maxScroll = 0;
    this.drag = null;
    this.rows = [];
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '史册', 20, 22, { size: 36, color: '#f0c060' });
    text(ctx, stateLib.renownTitle(st.player.renown), w - 20, 34, {
      size: 18, align: 'right', color: '#a2947a',
    });
    text(ctx, '近 ' + RECENT_DAYS + ' 日一条不落，再往前只留大事 · 按住往下拖可翻旧账',
      20, 64, { size: 14, color: '#8a8070' });

    // 当前章
    const stage = CAMPAIGN[Math.min(st.campaign.stage, CAMPAIGN.length - 1)];
    ctx.fillStyle = '#241c14';
    ctx.fillRect(16, 88, w - 32, 118);
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(16, 88, 5, 118);
    if (st.campaign.stage >= CAMPAIGN.length) {
      text(ctx, '主线已走完', 34, 100, { size: 23, color: '#8fbf7a' });
      text(ctx, '剩下的，是你在图上留下多少座城。', 34, 138, { size: 15, color: '#a2947a' });
    } else if (stage) {
      text(ctx, stage.title, 34, 98, { size: 23, color: '#f0c060' });
      text(ctx, '目标 · ' + stage.goal, 34, 134, { size: 15, color: '#c9bda2' });
      text(ctx, '进度 ' + st.campaign.stage + ' / ' + CAMPAIGN.length, w - 30, 100, {
        size: 15, align: 'right', color: '#8a8070',
      });
    }

    // 统计
    const sy = 220;
    const stats = [
      ['天数', st.clock.day],
      ['胜仗', st.stats.battlesWon],
      ['败仗', st.stats.battlesLost],
      ['城', st.stats.sitesTaken],
      ['里程', st.stats.distance],
      ['天机简', st.player.shiUsed],
    ];
    const cw = (w - 32) / stats.length;
    stats.forEach(function (s, i) {
      const x = 16 + i * cw;
      text(ctx, s[0], x, sy, { size: 14, color: '#8a8070' });
      text(ctx, String(s[1]), x, sy + 22, { size: 23, color: '#efe3c6' });
    });

    // 图例
    const legendY = 276;
    text(ctx, '记事', 20, 286, { size: 20, color: '#a2947a' });
    let lx = 92;
    [['siege', '围城'], ['muster', '集结'], ['battle', '战事'], ['faction', '天下'], ['recruit', '归降']].forEach(function (it) {
      ctx.fillStyle = KIND_COLORS[it[0]];
      ctx.fillRect(lx, legendY + 2, 8, 8);
      text(ctx, it[1], lx + 13, legendY - 3, { size: 13, color: '#8a8070' });
      lx += 68;
    });
    const visibleLog = st.log.filter(function (e) { return !isBanditFight(e); });
    const oldCount = visibleLog.filter(function (e) {
      return e.important && (st.clock.day - e.day) > RECENT_DAYS;
    }).length;
    text(ctx, '旧事 ' + oldCount + ' 条', w - 20, legendY - 3, {
      size: 13, align: 'right', color: '#6a6050',
    });
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(20, 314, w - 40, 2);

    // 近的照单全收，旧的只留重要
    const list = visibleLog.slice().reverse().filter(function (e) {
      return !e.day || (st.clock.day - e.day) <= RECENT_DAYS || e.important;
    });

    // 先排版，再裁剪绘制
    this.rows = [];
    let cy = 0;
    list.forEach(function (entry) {
      const head = '第' + (entry.day || 1) + '天 · ' + String(entry.hour || 0).padStart(2, '0') + '时';
      const color = kindColor(entry);
      const lines = wrap(ctx, entry.text || '', w - 78, 16, 'bold').slice(0, 3);
      const rh = Math.max(42, 24 + lines.length * 23);
      this.rows.push({ entry: entry, y: cy, h: rh, head: head, color: color, lines: lines });
      cy += rh + 6;
    }, this);
    const contentH = cy;
    const viewH = h - TOP - BOT;
    this.maxScroll = Math.max(0, contentH - viewH);
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, w, viewH);
    ctx.clip();
    ctx.translate(0, TOP - this.scroll);

    if (!this.rows.length) {
      text(ctx, '史册还是白的。走出陈留，打第一仗，这里就会开始写字。', 24, 18, {
        size: 18, color: '#8a8070',
      });
    }

    this.rows.forEach(function (r) {
      if (r.y > this.scroll + viewH + 120 || r.y + r.h < this.scroll - 120) return;
      const imp = !!r.entry.important;
      ctx.fillStyle = imp ? 'rgba(42,33,23,0.72)' : 'rgba(25,22,17,0.55)';
      ctx.fillRect(16, r.y, w - 32, r.h);
      ctx.fillStyle = r.color;
      ctx.fillRect(16, r.y, 4, r.h);
      if (imp) {
        text(ctx, '◆', 26, r.y + 9, { size: 13, color: r.color });
      }
      text(ctx, r.head, imp ? 42 : 30, r.y + 8, { size: 13, color: imp ? r.color : '#6a6050' });
      const kindName = KIND_LABELS[r.entry.kind];
      if (kindName && imp) {
        text(ctx, kindName, w - 26, r.y + 8, { size: 12, align: 'right', color: r.color });
      }
      r.lines.forEach(function (line, i) {
        text(ctx, line, 30, r.y + 26 + i * 23, {
          size: 16, color: imp ? '#e2d4b6' : '#a69a84',
        });
      });
    }, this);
    ctx.restore();

    // 滚动条
    if (this.maxScroll > 0) {
      const trackH = viewH - 12;
      const thumbH = Math.max(54, trackH * (viewH / (viewH + this.maxScroll)));
      const thumbY = TOP + 6 + (trackH - thumbH) * (this.scroll / this.maxScroll);
      ctx.fillStyle = '#2a2118';
      ctx.fillRect(w - 7, TOP + 6, 3, trackH);
      ctx.fillStyle = '#8a6a3a';
      ctx.fillRect(w - 7, thumbY, 3, thumbH);
    }

    app.ui.button(ctx, 20, h - 84, w - 40, 62, '返回', {
      id: 'j_back', size: 24, onTap: function () { app.pop(); },
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

  onTouchEnd() {
    this.drag = null;
  },
};

// 供逻辑测试/调试复用：史册里“和匪徒打了一仗”的流水账统一走这条判定。
JournalScene.isBanditFight = isBanditFight;

module.exports = JournalScene;
