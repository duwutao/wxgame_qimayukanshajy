/**
 * 比武大会：彩棚底下的"猜手"赌局。
 * 左挡 / 右挡 / 左攻 / 右攻，各三滴血，先见底的人输。
 * 报名 40 金钱，赢的人拿 200。
 */

const { text, wrap, panel } = require('../render/ui.js');
const tourney = require('../core/tourney.js');
const { siteById } = require('../core/world.js');
const scenery = require('../render/scenery.js');
const { lookFor } = require('../data/extra.js');
const { FACTIONS } = require('../data/china.js');

const FILL_BLOCK = '#26372e';
const FILL_ATTACK = '#452a1c';

function drawPips(ctx, x, y, n, total, color) {
  for (let i = 0; i < total; i++) {
    const alive = i < n;
    ctx.fillStyle = alive ? color : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + i * 46, y, 38, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + i * 46, y, 38, 14);
  }
}

const TourneyScene = {
  enter(app, params) {
    this.siteId = params && params.siteId;
    // 旧档里的赛会是"三场连打"结构，跟现在的三血对决不兼容，直接作废
    const t = app.state.tourney;
    if (t && (typeof t.hp !== 'number' || !t.foe)) app.state.tourney = null;
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    const site = this.siteId ? siteById(st.world, this.siteId) : null;
    const name = site ? site.name : '此地';
    const t = st.tourney;

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'tourney', w, h, 23);

    text(ctx, name + ' 比武大会', 20, 24, { size: 34, color: '#f0c060' });
    text(ctx, '报名 ' + tourney.FEE + ' 金钱 · 夺冠赏 ' + tourney.PRIZE + ' 金钱 · 三滴血定胜负', 20, 70, {
      size: 16, color: '#a2947a',
    });

    if (!t) {
      panel(ctx, 20, 104, w - 40, 240, { fill: '#201a14' });
      const intro = '彩棚底下画了个圈，两人各持木刀，护住左右两肩。'
        + '每合一招：要么护住一边，要么从那一边切进去。'
        + '同时抢攻各挨一下，挡对了白赚一刀，挡空了就吃一记。'
        + '三滴血，先倒下的认输。报名 40 金钱，赢的人捧走 200。';
      wrap(ctx, intro, w - 96, 18).forEach(function (line, i) {
        text(ctx, line, 44, 126 + i * 28, { size: 18, color: '#c9bda2' });
      });
      app.ui.button(ctx, 40, 372, w - 80, 88, '交 ' + tourney.FEE + ' 金钱 · 报名下场', {
        id: 't_enter', size: 26, fill: '#432c18', onTap: function () {
          const r = tourney.enter(st, site);
          app.showToast(r.msg, 2.2);
        },
      });
    } else {
      /* -------------------------------------------------- 对手 */
      const foe = t.foe;
      const col = (FACTIONS[foe.faction] || {}).color || '#8a7448';
      panel(ctx, 20, 100, w - 40, 176, { fill: '#1c1710' });
      const portrait = app.assets.portraitFor ? app.assets.portraitFor(col, lookFor(foe.lordId)) : null;
      if (portrait) {
        ctx.drawImage(portrait, 36, 112, 104, 104);
      } else {
        ctx.fillStyle = col;
        ctx.fillRect(36, 112, 104, 104);
      }
      text(ctx, foe.name, 156, 138, { size: 28, color: t.foeHp > 0 ? '#efe3c6' : '#7a7060' });
      text(ctx, foe.tag, 156, 166, { size: 15, color: '#8a8070' });
      text(ctx, '对方', w - 40, 132, { size: 15, align: 'right', color: '#8a8070' });
      drawPips(ctx, 156, 184, t.foeHp, tourney.HP, '#c9553f');
      text(ctx, t.foeHp + ' / ' + tourney.HP, 156 + 3 * 46 + 10, 184, { size: 15, color: '#c9553f' });

      /* -------------------------------------------------- 自己 */
      panel(ctx, 20, 288, w - 40, 112, { fill: '#201a14' });
      text(ctx, '你', 40, 316, { size: 24, color: '#efe3c6' });
      drawPips(ctx, 100, 306, t.hp, tourney.HP, '#6fa86a');
      text(ctx, t.hp + ' / ' + tourney.HP, 100 + 3 * 46 + 10, 306, { size: 16, color: '#6fa86a' });
      text(ctx, '金钱 ' + st.player.gold + ' · 声望 ' + st.player.renown, 40, 358, { size: 16, color: '#a2947a' });
      text(ctx, '第 ' + (t.round || 0) + ' 合', w - 40, 358, { size: 16, align: 'right', color: '#a2947a' });

      if (!t.done) {
        text(ctx, '护住一边就挡，从一边切进去就攻。方向对了才挡得住。', 20, 412, { size: 15, color: '#8a8070' });
        const bw = (w - 40 - 14) / 2;
        const bh = 104;
        const moves = [
          { id: 'blockL', label: '左挡', fill: FILL_BLOCK },
          { id: 'blockR', label: '右挡', fill: FILL_BLOCK },
          { id: 'attackL', label: '左攻', fill: FILL_ATTACK },
          { id: 'attackR', label: '右攻', fill: FILL_ATTACK },
        ];
        moves.forEach(function (m, i) {
          const bx = 20 + (i % 2) * (bw + 14);
          const by = 436 + Math.floor(i / 2) * (bh + 14);
          app.ui.button(ctx, bx, by, bw, bh, m.label, {
            id: 't_m_' + m.id, size: 32, fill: m.fill, onTap: function () {
              const r = tourney.play(st, m.id);
              if (!r.ok) { app.showToast(r.msg); return; }
              if (r.result === 'win') app.showToast('赢了 · 赏钱 ' + tourney.PRIZE + ' 金钱', 2.4);
              else if (r.result === 'lose') app.showToast('输了 · 报名费没了', 2.2);
              else if (r.result === 'draw') app.showToast('同时倒地 · 报名费退你', 2.2);
            },
          });
        });
      } else {
        const champion = t.champion;
        const drawn = t.draw;
        const line = champion ? '你站到了最后 · 赏钱 ' + t.pot + ' 金钱' : (drawn ? '同时倒地 · 报名费已退' : '你倒下了 · 认输退场');
        text(ctx, line, 20, 448, { size: 28, color: champion ? '#f0c060' : '#c9bda2' });
        app.ui.button(ctx, 40, 494, w - 80, 92, champion ? '领了赏钱 · 回城' : '收起木刀 · 回城', {
          id: 't_leave', size: 26, fill: '#33271b', onTap: function () {
            tourney.close(st);
            app.pop();
          },
        });
      }

      /* -------------------------------------------------- 战报 */
      const logTop = t.done ? 610 : 664;
      const logH = Math.max(150, h - logTop - 96);
      panel(ctx, 20, logTop, w - 40, logH, { fill: '#181410' });
      text(ctx, '场上', 40, logTop + 26, { size: 16, color: '#8a8070' });
      const shown = (t.log || []).slice(-2).join('\n');
      const lines = wrap(ctx, shown || '鼓声一起，看台上的人把酒洒了一地。', w - 96, 17);
      lines.slice(0, Math.floor((logH - 46) / 24)).forEach(function (ln, i) {
        text(ctx, ln, 40, logTop + 52 + i * 24, { size: 17, color: '#e8dcc0' });
      });
    }

    app.ui.button(ctx, 20, h - 88, w - 40, 66, '回城', {
      id: 't_back', size: 24, onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = TourneyScene;
