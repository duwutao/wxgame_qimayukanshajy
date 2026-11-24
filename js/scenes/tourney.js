/**
 * 比武大会：报名、连打三场、领赏。
 */

const { text, wrap, panel } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const tourney = require('../core/tourney.js');
const { siteById } = require('../core/world.js');
const { lookFor } = require('../data/extra.js');
const { FACTIONS } = require('../data/china.js');

const TourneyScene = {
  enter(app, params) {
    this.siteId = params && params.siteId;
    this.last = null;
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
    const power = Math.round(tourney.playerPower(st));

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, name + ' 比武大会', 20, 24, { size: 34, color: '#f0c060' });
    text(ctx, '你的身板 ' + power + ' · 报名 ' + tourney.fee(st) + ' 金 · 赏格 ' + tourney.prize(st) + ' 金', 20, 74, {
      size: 16, color: '#a2947a',
    });

    if (!t) {
      panel(ctx, 20, 108, w - 40, 210, { fill: '#201a14' });
      const intro = '校场上架起彩棚，四处来的好手报名。三场见高低，点到为止，不杀人。赢了有钱有名声，输了丢点脸。';
      wrap(ctx, intro, w - 80, 18).forEach(function (line, i) {
        text(ctx, line, 40, 128 + i * 28, { size: 18, color: '#c9bda2' });
      });
      app.ui.button(ctx, 40, 336, w - 80, 74, '交报名费 · 报名参赛', {
        id: 't_enter', size: 24, fill: '#3a2c1e', onTap: function () {
          const r = tourney.enter(st, site);
          app.showToast(r.msg, 2.2);
        },
      });
    } else {
      // 对手名单
      panel(ctx, 20, 108, w - 40, 300, { fill: '#1c1710' });
      text(ctx, '第 ' + Math.min(t.round + 1, tourney.ROUNDS) + ' / ' + tourney.ROUNDS + ' 场 · 已胜 ' + t.won, 36, 120, {
        size: 20, color: '#c9bda2',
      });
      t.foes.forEach(function (foe, i) {
        const y = 154 + i * 84;
        const passed = i < t.round;
        const now = i === t.round && !t.done;
        ctx.fillStyle = passed ? 'rgba(40,34,26,0.5)' : (now ? 'rgba(60,46,28,0.9)' : 'rgba(30,26,20,0.6)');
        ctx.fillRect(36, y, w - 72, 76);
        const color = foe.famous ? ((FACTIONS[(site && site.ownerFaction) || 'wei'] || {}).color || '#8a7448') : '#6a6050';
        const lookId = foe.lordId || ('foe' + i);
        const portrait = app.assets.portraitFor ? app.assets.portraitFor(color, lookFor(lookId)) : null;
        if (portrait) ctx.drawImage(portrait, 44, y + 8, 52, 50);
        text(ctx, foe.name, 108, y + 8, { size: 22, color: passed ? '#6a6050' : '#efe3c6' });
        text(ctx, foe.tag + ' · 身板 ' + Math.round(foe.power), 108, y + 38, {
          size: 15, color: '#8a8070',
        });
        text(ctx, passed ? '已胜' : (t.done ? '未打' : '把握 ' + Math.round(tourney.winChance(st, foe) * 100) + '%'), w - 52, y + 26, {
          size: 18, align: 'right', color: passed ? '#6a9a5a' : (now ? '#f0c060' : '#8a8070'),
        });
      });

      if (!t.done) {
        app.ui.button(ctx, 40, 424, w - 80, 74, '上场 · 打第 ' + (t.round + 1) + ' 场', {
          id: 't_fight', size: 26, fill: '#4a2c1e', onTap: function () {
            const r = tourney.fightRound(st);
            if (r.ok) this.last = r.lines.join('\n');
            if (r.ok) app.showToast(r.win ? '这一场赢了' : '这一场输了', 1.6);
          },
        });
      } else {
        app.ui.button(ctx, 40, 424, w - 80, 74, (t.champion ? '领了赏钱 · 回城' : '认输退场 · 回城'), {
          id: 't_leave', size: 26, fill: '#33271b', onTap: function () {
            tourney.close(st);
            app.pop();
          },
        });
      }

      // 经过
      const lastLine = (t.log && t.log.length) ? t.log[t.log.length - 1] : '彩棚下鼓声一起，看台上的人把酒洒了一地。';
      const lines = wrap(ctx, lastLine, w - 80, 17);
      panel(ctx, 20, 516, w - 40, Math.max(120, 16 + lines.length * 26), { fill: '#201a14' });
      lines.forEach(function (line, i) {
        text(ctx, line, 40, 532 + i * 26, { size: 17, color: '#e8dcc0' });
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
