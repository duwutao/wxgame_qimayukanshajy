/**
 * 军机棋盘：城池里的五种军情博弈。
 * 报名 40 金钱，胜者得 200；一局只走一次结算。
 */

const { text, wrap, panel } = require('../render/ui.js');
const board = require('../core/tourney.js');
const { siteById } = require('../core/world.js');
const scenery = require('../render/scenery.js');

const CARD_GAP = 12;

function drawIcon(ctx, type, x, y, size, color) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, Math.round(size / 22));

  if (type === 'duel') {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.18, y + size * 0.20);
    ctx.lineTo(x + size * 0.82, y + size * 0.80);
    ctx.moveTo(x + size * 0.82, y + size * 0.20);
    ctx.lineTo(x + size * 0.18, y + size * 0.80);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.18, y + size * 0.20, size * 0.06, 0, Math.PI * 2);
    ctx.arc(x + size * 0.82, y + size * 0.80, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'supply') {
    ctx.strokeRect(x + size * 0.24, y + size * 0.34, size * 0.46, size * 0.24);
    ctx.beginPath();
    ctx.arc(x + size * 0.31, y + size * 0.70, size * 0.10, 0, Math.PI * 2);
    ctx.arc(x + size * 0.63, y + size * 0.70, size * 0.10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.24, y + size * 0.34);
    ctx.lineTo(x + size * 0.10, y + size * 0.28);
    ctx.moveTo(x + size * 0.70, y + size * 0.34);
    ctx.lineTo(x + size * 0.84, y + size * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.24, y + size * 0.24, size * 0.08, 0, Math.PI * 2);
    ctx.arc(x + size * 0.52, y + size * 0.20, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'sentry') {
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.32, size * 0.17, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.32, cy);
    ctx.lineTo(x + size * 0.12, y + size * 0.16);
    ctx.moveTo(cx + size * 0.32, cy);
    ctx.lineTo(x + size * 0.88, y + size * 0.16);
    ctx.stroke();
  } else if (type === 'fire') {
    ctx.beginPath();
    ctx.moveTo(cx, y + size * 0.10);
    ctx.bezierCurveTo(x + size * 0.74, y + size * 0.38, x + size * 0.76, y + size * 0.66, cx, y + size * 0.84);
    ctx.bezierCurveTo(x + size * 0.24, y + size * 0.66, x + size * 0.26, y + size * 0.38, cx, y + size * 0.10);
    ctx.fill();
    ctx.fillStyle = '#f0c060';
    ctx.beginPath();
    ctx.moveTo(cx, y + size * 0.34);
    ctx.bezierCurveTo(x + size * 0.58, y + size * 0.50, x + size * 0.58, y + size * 0.62, cx, y + size * 0.70);
    ctx.bezierCurveTo(x + size * 0.42, y + size * 0.62, x + size * 0.42, y + size * 0.50, cx, y + size * 0.34);
    ctx.fill();
  } else if (type === 'relay') {
    ctx.strokeRect(x + size * 0.34, y + size * 0.38, size * 0.32, size * 0.42);
    ctx.beginPath();
    ctx.moveTo(x + size * 0.34, y + size * 0.38);
    ctx.lineTo(x + size * 0.26, y + size * 0.28);
    ctx.lineTo(x + size * 0.74, y + size * 0.28);
    ctx.lineTo(x + size * 0.66, y + size * 0.38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.66, y + size * 0.16);
    ctx.lineTo(x + size * 0.90, y + size * 0.24);
    ctx.lineTo(x + size * 0.66, y + size * 0.32);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + size * 0.24, y + size * 0.18, size * 0.05, 0, Math.PI * 2);
    ctx.arc(x + size * 0.16, y + size * 0.12, size * 0.04, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawModeSelect(app, site, w, h) {
  const ctx = app.runtime.ctx;
  const st = app.state;
  const siteName = site ? site.name : '此地';
  const modes = board.modeList();

  text(ctx, siteName + ' · 军机棋盘', 20, 24, {
    size: 34, color: '#f0c060',
  });
  text(ctx, '五局军情，各押一注；胜负只在落子之间', 20, 70, {
    size: 16, color: '#a2947a',
  });

  panel(ctx, 20, 104, w - 40, 94, { fill: '#1d1711' });
  text(ctx, '五局军机 · 各押一注', 40, 120, { size: 24, color: '#f0c060' });
  text(ctx, '每局报名 ' + board.FEE + ' 金钱，胜者得 ' + board.PRIZE + ' 金钱。棋局只论军情，不损兵。', 40, 154, {
    size: 15, color: '#c9bda2',
  });
  text(ctx, '金钱 ' + st.player.gold + ' · 声望 ' + st.player.renown, w - 40, 126, {
    size: 15, align: 'right', color: '#a2947a',
  });

  const top = 220;
  const gap = CARD_GAP;
  const cardH = 142;
  const cardW = (w - 40 - gap) / 2;
  modes.forEach(function (mode, i) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const wide = i === modes.length - 1;
    const x = wide ? 20 : 20 + col * (cardW + gap);
    const y = top + row * (cardH + 16);
    const cw = wide ? w - 40 : cardW;

    panel(ctx, x, y, cw, cardH, { fill: '#201810' });
    ctx.fillStyle = mode.color;
    ctx.fillRect(x, y, 5, cardH);
    drawIcon(ctx, mode.icon, x + 18, y + 16, 58, '#f0c060');
    text(ctx, mode.name, x + 92, y + 18, { size: 26, color: '#f2e3c4' });
    text(ctx, mode.short, x + 92, y + 54, { size: 14, color: '#b9a688' });
    text(ctx, '报名 ' + board.FEE + ' · 胜 ' + board.PRIZE, x + 92, y + 82, {
      size: 14, color: '#9c8d74',
    });
    if (wide) {
      text(ctx, mode.rule, x + 92, y + 108, { size: 14, color: '#c9bda2' });
      text(ctx, '→', x + cw - 30, y + 48, { size: 30, align: 'right', color: '#f0c060' });
    } else {
      text(ctx, '→', x + cw - 24, y + 58, { size: 28, align: 'right', color: '#f0c060' });
    }
    app.ui.rect('wb_mode_' + mode.id, x, y, cw, cardH, function () {
      const r = board.enter(st, site, mode.id);
      app.showToast(r.msg, 2.4);
    });
  });

  const footTop = top + Math.ceil(modes.length / 2) * (cardH + 16) + 8;
  const footH = Math.max(76, h - footTop - 106);
  if (footH > 60) {
    panel(ctx, 20, footTop, w - 40, footH, { fill: '#15110d' });
    ctx.save();
    ctx.strokeStyle = 'rgba(240,192,96,0.10)';
    ctx.lineWidth = 1;
    for (let gx = 36; gx < w - 30; gx += 38) {
      ctx.beginPath();
      ctx.moveTo(gx, footTop + 10);
      ctx.lineTo(gx, footTop + footH - 10);
      ctx.stroke();
    }
    for (let gy = footTop + 30; gy < footTop + footH - 10; gy += 38) {
      ctx.beginPath();
      ctx.moveTo(30, gy);
      ctx.lineTo(w - 30, gy);
      ctx.stroke();
    }
    ctx.restore();
    text(ctx, '军机不可泄 · 落子无悔', w / 2, footTop + footH / 2 - 14, {
      size: 26, align: 'center', color: '#d9b978',
    });
    text(ctx, '单挑 · 断粮 · 狙哨 · 火攻 · 传令', w / 2, footTop + footH / 2 + 22, {
      size: 14, align: 'center', color: '#8f806a',
    });
  }

  app.ui.button(ctx, 20, h - 82, w - 40, 62, '回城', {
    id: 'wb_back', size: 24, fill: '#241c14', onTap: function () { app.pop(); },
  });
}

function drawBoardArt(ctx, mode, w, t) {
  const x = 20;
  const y = 146;
  const bw = w - 40;
  const bh = 192;
  panel(ctx, x, y, bw, bh, { fill: '#1b160f' });
  drawIcon(ctx, mode.icon, x + 20, y + 18, 78, '#e8b861');
  text(ctx, mode.name, x + 114, y + 18, { size: 30, color: '#f2e3c4' });
  text(ctx, mode.short + ' · 一局定输赢', x + 114, y + 56, { size: 15, color: '#a2947a' });

  const lines = wrap(ctx, mode.intro, bw - 144, 16).slice(0, 3);
  lines.forEach(function (line, i) {
    text(ctx, line, x + 114, y + 84 + i * 22, { size: 15, color: '#c9bda2' });
  });
  text(ctx, mode.rule, x + 24, y + bh - 26, { size: 15, color: '#e0c98d' });

  // 棋盘装饰：不同局用不同的点线标记，给玩家一点战场感。
  const sx = x + bw - 96;
  const sy = y + 42;
  ctx.save();
  ctx.strokeStyle = 'rgba(240,192,96,0.35)';
  ctx.fillStyle = 'rgba(240,192,96,0.45)';
  ctx.lineWidth = 2;
  if (mode.id === 'supply' || mode.id === 'relay') {
    ctx.beginPath();
    ctx.arc(sx, sy + 46, 5, 0, Math.PI * 2);
    ctx.arc(sx + 34, sy + 10, 5, 0, Math.PI * 2);
    ctx.arc(sx + 58, sy + 64, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx, sy + 46);
    ctx.lineTo(sx + 34, sy + 10);
    ctx.lineTo(sx + 58, sy + 64);
    ctx.stroke();
  } else if (mode.id === 'duel') {
    ctx.beginPath();
    ctx.arc(sx, sy + 20, 8, 0, Math.PI * 2);
    ctx.arc(sx + 44, sy + 54, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + 8, sy + 50);
    ctx.lineTo(sx + 40, sy + 24);
    ctx.stroke();
  } else if (mode.id === 'sentry') {
    ctx.beginPath();
    ctx.arc(sx + 12, sy + 24, 7, 0, Math.PI * 2);
    ctx.arc(sx + 54, sy + 58, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + 12, sy + 34);
    ctx.lineTo(sx + 54, sy + 48);
    ctx.stroke();
  } else if (mode.id === 'fire') {
    ctx.beginPath();
    ctx.moveTo(sx, sy + 60);
    ctx.quadraticCurveTo(sx + 18, sy + 20, sx + 38, sy + 54);
    ctx.quadraticCurveTo(sx + 52, sy + 30, sx + 66, sy + 58);
    ctx.stroke();
  }
  ctx.restore();
}

function drawChoiceButtons(app, st, t, mode, x, y, w) {
  const ctx = app.runtime.ctx;
  const list = board.choiceList(t.mode, t.relay);
  const n = list.length;
  const gap = 12;
  const bw = (w - 40 - gap * (n - 1)) / n;
  list.forEach(function (item, i) {
    const bx = 20 + i * (bw + gap);
    app.ui.button(ctx, bx, y, bw, 82, item.name, {
      id: 'wb_choice_' + item.id,
      size: n === 3 ? 26 : 29,
      fill: mode.color,
      onTap: function () {
        const r = board.choose(st, item.id);
        if (!r.ok) { app.showToast(r.msg, 2.2); return; }
        if (r.result === 'win') app.showToast('胜 · 赏钱 ' + board.PRIZE + ' 金钱', 2.4);
        else if (r.result === 'lose') app.showToast('负 · 报名费不退', 2.2);
        else if (r.result === 'tie') app.showToast('同招相抵 · 可再出一手，不再收费', 2.2);
        else if (r.result === 'continue') app.showToast('第一关已过 · 进入第二关', 2.2);
      },
    });
    text(ctx, item.desc, bx + bw / 2, y + 91, {
      size: 13, align: 'center', color: '#8f806a',
    });
  });
}

function drawGame(app, site, w, h) {
  const ctx = app.runtime.ctx;
  const st = app.state;
  const t = st.tourney;
  const mode = board.modeById(t.mode);
  if (!mode) {
    st.tourney = null;
    drawModeSelect(app, site, w, h);
    return;
  }

  text(ctx, (site ? site.name : t.siteName) + ' · 军机棋盘', 20, 24, {
    size: 34, color: '#f0c060',
  });
  text(ctx, mode.name + ' · 报名 ' + board.FEE + ' · 胜者 ' + board.PRIZE, 20, 70, {
    size: 16, color: '#a2947a',
  });
  text(ctx, '金钱 ' + st.player.gold + ' · 声望 ' + st.player.renown, w - 20, 46, {
    size: 15, align: 'right', color: '#a2947a',
  });

  drawBoardArt(ctx, mode, w, t);

  if (!t.done) {
    let prompt = '落子 · ' + (t.choiceTitle || mode.choiceTitle);
    if (t.mode === 'relay') {
      prompt = t.relay && t.relay.stage === 2
        ? '第二关 · 剩下两条驿道，选一条冲出去'
        : '第一关 · 三条驿道，选一条送信';
    }
    text(ctx, prompt, 20, 356, {
      size: 16, color: '#e0c98d',
    });
    if (t.mode === 'relay' && t.relay && t.relay.stage === 2) {
      text(ctx, '避开第一关的卡子后，只剩两条道；AI 再补一道卡。', 20, 378, {
        size: 14, color: '#9c8d74',
      });
    }
    if (t.draw) {
      text(ctx, '同招相抵，重新起手；这一手不再收报名费。', 20, 400, {
        size: 15, color: '#e0c98d',
      });
    }
    drawChoiceButtons(app, st, t, mode, 20, t.draw ? 424 : 390, w);
  } else {
    panel(ctx, 20, 376, w - 40, 178, { fill: t.win ? '#1e2a1c' : '#2a1b16' });
    text(ctx, t.win ? '胜' : '负', 44, 394, {
      size: 44, color: t.win ? '#8fbf7a' : '#d46a50',
    });
    text(ctx, t.win ? '军机得手 · 赏钱 ' + board.PRIZE + ' 金钱' : '这一局失手 · 报名费不退',
      44, 452, { size: 24, color: t.win ? '#f0c060' : '#c9bda2' });
    text(ctx, t.win ? '声望 +12 · 士气 +4' : '声望 +2 · 士气 -2', 44, 492, {
      size: 15, color: '#a2947a',
    });
    text(ctx, t.win ? '棋盘上还有四局，随时可以再押。' : '换一局军情，或者回城整军再来。', w - 44, 492, {
      size: 14, align: 'right', color: '#8f806a',
    });
  }

  const logTop = t.done ? 574 : 584;
  const logH = Math.max(150, h - logTop - 98);
  panel(ctx, 20, logTop, w - 40, logH, { fill: '#15110d' });
  ctx.save();
  ctx.strokeStyle = 'rgba(240,192,96,0.045)';
  ctx.lineWidth = 1;
  for (let gx = 38; gx < w - 30; gx += 38) {
    ctx.beginPath();
    ctx.moveTo(gx, logTop + 8);
    ctx.lineTo(gx, logTop + logH - 8);
    ctx.stroke();
  }
  for (let gy = logTop + 34; gy < logTop + logH - 8; gy += 38) {
    ctx.beginPath();
    ctx.moveTo(30, gy);
    ctx.lineTo(w - 30, gy);
    ctx.stroke();
  }
  ctx.restore();
  text(ctx, '棋盘记事', 40, logTop + 24, { size: 16, color: '#8f806a' });
  const shown = (t.log || []).slice(-3).join('\n');
  const lines = wrap(ctx, shown || '鼓声未起，棋盘上的灯已经点亮。', w - 80, 16);
  const maxLines = Math.max(2, Math.floor((logH - 44) / 23));
  lines.slice(0, maxLines).forEach(function (line, i) {
    text(ctx, line, 40, logTop + 50 + i * 23, { size: 15, color: '#e4d6b9' });
  });

  // 一局只有几行记事，下面的空白用棋盘提要压住，避免整页像一张空黑纸。
  const hintTop = logTop + 58 + Math.min(lines.length, maxLines) * 23;
  if (hintTop + 80 < h - 98) {
    ctx.strokeStyle = 'rgba(240,192,96,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, hintTop);
    ctx.lineTo(w - 40, hintTop);
    ctx.stroke();
    text(ctx, '军机提要', 40, hintTop + 20, { size: 16, color: '#8f806a' });
    const hint = mode.short + ' · 报名 ' + board.FEE + ' · 胜者 ' + board.PRIZE +
      ' · 不损兵，只论这一手。';
    wrap(ctx, hint, w - 80, 15).slice(0, 2).forEach(function (line, i) {
      text(ctx, line, 40, hintTop + 46 + i * 22, { size: 15, color: '#a2947a' });
    });
  }

  if (t.done) {
    const bw = (w - 40 - 12) / 2;
    app.ui.button(ctx, 20, h - 82, bw, 62, '再摆一局', {
      id: 'wb_again', size: 22, fill: '#3a2c1e', onTap: function () {
        board.close(st);
      },
    });
    app.ui.button(ctx, 20 + bw + 12, h - 82, bw, 62, '领赏回城', {
      id: 'wb_back', size: 22, fill: '#241c14', onTap: function () {
        board.close(st);
        app.pop();
      },
    });
  } else {
    app.ui.button(ctx, 20, h - 82, w - 40, 62,
      t.mode === 'relay' ? '暂离棋盘 · 可回来继续' : '暂离棋盘 · 报名费不退', {
        id: 'wb_leave', size: 21, fill: '#241c14', onTap: function () { app.pop(); },
      });
  }
}

const TourneyScene = {
  enter(app, params) {
    this.siteId = params && params.siteId;
    const t = app.state.tourney;
    if (t && (!t.mode || !board.modeById(t.mode))) app.state.tourney = null;
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    const site = this.siteId ? siteById(st.world, this.siteId) : null;
    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'tourney', w, h, 23);

    if (!st.tourney) drawModeSelect(app, site, w, h);
    else drawGame(app, site, w, h);
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = TourneyScene;
