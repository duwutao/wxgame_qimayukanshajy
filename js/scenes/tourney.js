/**
 * 军机棋盘：城池里的六局军情博弈。
 * 每局报名 40 金钱，胜者 200；每七天只摆十局。
 * 校场夺魁沿用旧比武大会的界面：对手画像、血条、四手木刀、场上记事。
 */

const { text, wrap, panel } = require('../render/ui.js');
const board = require('../core/tourney.js');
const { siteById } = require('../core/world.js');
const { lookFor } = require('../data/extra.js');
const { FACTIONS } = require('../data/china.js');
const scenery = require('../render/scenery.js');

const CARD_GAP = 12;
// 整个场景按 390 宽的设计稿排；渲染时整体缩放到真实画布，热区同步放大。
const DESIGN_W = 390;
let KS = 1;
let DW = DESIGN_W;
let DH = 845;

function btn(app, ctx, x, y, w, h, label, o) {
  const opt = o || {};
  const pressed = app.ui.pressed && app.ui.pressed.id === opt.id;
  const dy = pressed ? 2 : 0;
  const fill = opt.disabled ? '#1e1a15' : (opt.fill || '#3a2c1e');
  const border = opt.disabled ? '#4a3f32' : '#8a6a42';
  const color = opt.disabled ? '#6a6355' : (opt.color || '#f2e3c4');
  ctx.save();
  if (!opt.disabled) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 3, y + 5, w, h);
  }
  ctx.fillStyle = fill;
  ctx.fillRect(x, y + dy, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y + dy, w, 2);
  ctx.fillRect(x, y + dy + h - 2, w, 2);
  ctx.fillRect(x, y + dy, 2, h);
  ctx.fillRect(x + w - 2, y + dy, 2, h);
  if (!opt.disabled) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 2, y + dy + 2, w - 4, Math.floor(h / 3));
  }
  ctx.restore();
  text(ctx, label, x + w / 2, y + dy + h / 2, {
    size: opt.size || 26, align: 'center', baseline: 'middle', color: color,
  });
  if (!opt.disabled) {
    app.ui.rect(opt.id || label, x * KS, y * KS, w * KS, h * KS, opt.onTap);
  }
}
const FILL_BLOCK = '#26372e';
const FILL_ATTACK = '#452a1c';

/* ------------------------------------------------------------ 通用小件 */

function drawPips(ctx, x, y, n, total, color, w) {
  const pw = w || 34;
  const gap = 6;
  for (let i = 0; i < total; i++) {
    const alive = i < n;
    ctx.fillStyle = alive ? color : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + i * (pw + gap), y, pw, 12);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + i * (pw + gap) + 0.5, y + 0.5, pw, 12);
  }
}

/** 铺满一行的格子：十天十局，用掉几格亮几格。 */
function drawWeekBar(ctx, x, y, w, used, total) {
  const gap = 5;
  const pw = (w - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < used ? '#d9b978' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(x + i * (pw + gap), y, pw, 10);
  }
}

function ground(ctx, x, y, w, color) {
  ctx.fillStyle = color || 'rgba(240,192,96,0.10)';
  ctx.fillRect(x, y, w, 2);
}

/** 一个侧身的小兵：正面朝 +x。pose = idle / wind / strike / hit / down */
function fighter(ctx, cx, baseY, s, face, pose, coat, skin) {
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(face, 1);
  if (pose === 'down') {
    ctx.rotate(-0.35);
    ctx.translate(0, 6 * s);
  }
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 26 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // 腿
  ctx.strokeStyle = '#2b241c';
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.moveTo(-2 * s, -26 * s);
  ctx.lineTo(-10 * s, 0);
  ctx.moveTo(4 * s, -26 * s);
  ctx.lineTo(12 * s, 0);
  ctx.stroke();
  // 身子
  ctx.fillStyle = coat || '#6a4a34';
  ctx.fillRect(-10 * s, -62 * s, 20 * s, 38 * s);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(-10 * s, -40 * s, 20 * s, 6 * s);
  // 头
  ctx.fillStyle = skin || '#d8b48c';
  ctx.beginPath();
  ctx.arc(0, -72 * s, 9 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a3027';
  ctx.fillRect(-9 * s, -80 * s, 18 * s, 5 * s);
  // 手臂与兵器
  const sh = { x: 7 * s, y: -56 * s };
  let tip = { x: 30 * s, y: -34 * s };
  if (pose === 'wind') tip = { x: -12 * s, y: -96 * s };
  else if (pose === 'strike') tip = { x: 50 * s, y: -60 * s };
  else if (pose === 'hit') tip = { x: 20 * s, y: -20 * s };
  ctx.strokeStyle = '#d8b48c';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(sh.x, sh.y);
  ctx.lineTo((sh.x + tip.x) / 2, (sh.y + tip.y) / 2 - 4 * s);
  ctx.stroke();
  ctx.strokeStyle = '#c9c2b4';
  ctx.lineWidth = 3.5 * s;
  ctx.beginPath();
  ctx.moveTo((sh.x + tip.x) / 2, (sh.y + tip.y) / 2 - 4 * s);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 2.6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 一匹马加骑手，跑起来四蹄交替。phase 0..1 */
function rider(ctx, cx, baseY, s, phase, coat) {
  const swing = Math.sin(phase * Math.PI * 2) * 5 * s;
  const C = coat || '#4a3a2a';
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 28 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // 四蹄
  ctx.strokeStyle = '#2b241c';
  ctx.lineWidth = 3.4 * s;
  ctx.beginPath();
  ctx.moveTo(-15 * s, -20 * s); ctx.lineTo(-19 * s + swing, -1 * s);
  ctx.moveTo(-9 * s, -20 * s); ctx.lineTo(-5 * s - swing, -1 * s);
  ctx.moveTo(9 * s, -20 * s); ctx.lineTo(5 * s + swing, -1 * s);
  ctx.moveTo(15 * s, -20 * s); ctx.lineTo(19 * s - swing, -1 * s);
  ctx.stroke();
  // 马身、颈、头、尾
  ctx.fillStyle = C;
  ctx.fillRect(-22 * s, -37 * s, 44 * s, 18 * s);
  ctx.fillRect(14 * s, -50 * s, 10 * s, 16 * s);
  ctx.fillRect(20 * s, -54 * s, 13 * s, 8 * s);
  ctx.fillRect(-27 * s, -38 * s, 6 * s, 16 * s);
  // 骑手腿
  ctx.fillStyle = '#3a3027';
  ctx.fillRect(1 * s, -30 * s, 6 * s, 13 * s);
  // 骑手身、头、盔
  ctx.fillStyle = '#6a4a34';
  ctx.fillRect(-6 * s, -60 * s, 13 * s, 24 * s);
  ctx.strokeStyle = '#6a4a34';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(6 * s, -55 * s);
  ctx.lineTo(19 * s, -47 * s);
  ctx.stroke();
  ctx.fillStyle = '#d8b48c';
  ctx.beginPath();
  ctx.arc(0, -66 * s, 6.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a3027';
  ctx.fillRect(-7 * s, -73 * s, 14 * s, 5 * s);
  // 背上令旗
  ctx.strokeStyle = '#3a2c1e';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(-8 * s, -60 * s);
  ctx.lineTo(-12 * s, -86 * s);
  ctx.stroke();
  ctx.fillStyle = '#b8452f';
  ctx.beginPath();
  ctx.moveTo(-12 * s, -86 * s);
  ctx.lineTo(-2 * s, -82 * s);
  ctx.lineTo(-12 * s, -76 * s);
  ctx.fill();
  ctx.restore();
}

/** 火把 */
function torch(ctx, x, y, s, lit) {
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(x - 1.5 * s, y, 3 * s, 18 * s);
  if (!lit) return;
  const fl = 1 + Math.sin(Date.now() / 120) * 0.12;
  ctx.fillStyle = '#e08a3a';
  ctx.beginPath();
  ctx.moveTo(x, y - 12 * s * fl);
  ctx.quadraticCurveTo(x + 6 * s, y - 2 * s, x, y + 1); 
  ctx.quadraticCurveTo(x - 6 * s, y - 2 * s, x, y - 12 * s * fl);
  ctx.fill();
  ctx.fillStyle = '#f2cc78';
  ctx.beginPath();
  ctx.moveTo(x, y - 7 * s * fl);
  ctx.quadraticCurveTo(x + 3 * s, y - 1 * s, x, y);
  ctx.quadraticCurveTo(x - 3 * s, y - 1 * s, x, y - 7 * s * fl);
  ctx.fill();
}

function strikeFlash(ctx, x, y, p, color) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p);
  ctx.strokeStyle = color || '#f0c060';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 10 + p * 26;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------ 模式图标 */

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
    // 三条粮道：三根岔开的车辙
    ctx.lineWidth = Math.max(2, Math.round(size / 26));
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * size * 0.26;
      ctx.beginPath();
      ctx.moveTo(cx + dx * 0.3, y + size * 0.86);
      ctx.lineTo(cx + dx, y + size * 0.16);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.fillRect(cx - size * 0.30, y + size * 0.40, size * 0.60, size * 0.10);
    ctx.beginPath();
    ctx.arc(cx - size * 0.18, y + size * 0.62, size * 0.06, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.18, y + size * 0.62, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'sentry') {
    // 弓
    ctx.beginPath();
    ctx.arc(cx + size * 0.10, cy, size * 0.34, Math.PI * 0.62, Math.PI * 1.38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.12, cy - size * 0.30);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.24, cy);
    ctx.lineTo(cx + size * 0.44, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.44, cy);
    ctx.lineTo(cx + size * 0.32, cy - size * 0.08);
    ctx.lineTo(cx + size * 0.32, cy + size * 0.08);
    ctx.closePath();
    ctx.fill();
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
  } else if (type === 'arena') {
    // 校场：一圈围栏，两口木刀交叉
    ctx.beginPath();
    ctx.ellipse(cx, y + size * 0.76, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.28, y + size * 0.22);
    ctx.lineTo(x + size * 0.70, y + size * 0.62);
    ctx.moveTo(x + size * 0.70, y + size * 0.22);
    ctx.lineTo(x + size * 0.28, y + size * 0.62);
    ctx.stroke();
  } else if (type === 'relay') {
    // 骑马传令：三道驿道收到脚下，骑手持令而出
    ctx.lineWidth = Math.max(2, Math.round(size / 26));
    const hubX = cx - size * 0.08;
    const hubY = y + size * 0.78;
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * size * 0.28;
      ctx.beginPath();
      ctx.moveTo(cx + dx, y + size * 0.96);
      ctx.lineTo(hubX, hubY);
      ctx.stroke();
    }
    rider(ctx, hubX, hubY + size * 0.02, size / 105, 0.25, '#5a4630');
    ctx.fillStyle = color;
    ctx.fillRect(hubX + size * 0.24, y + size * 0.02, size * 0.045, size * 0.22);
    ctx.beginPath();
    ctx.moveTo(hubX + size * 0.285, y + size * 0.03);
    ctx.lineTo(hubX + size * 0.46, y + size * 0.08);
    ctx.lineTo(hubX + size * 0.285, y + size * 0.14);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------ 局内舞台 */

function stageRect(app, h) {
  const w = DW;
  return { x: 20, y: 146, w: w - 40, h: h < 700 ? 186 : 206 };
}

/** 校场：旧比武大会式样——对手画像、四血条、你、第几合 */
function drawArenaStage(app, ctx, t, r, fx) {
  const a = t.arena;
  if (!a) return;
  const foe = a.foe;
  const col = (FACTIONS[foe.faction] || {}).color || '#8a7448';
  const portrait = app.assets && app.assets.portraitFor
    ? app.assets.portraitFor(col, lookFor(foe.lordId)) : null;
  if (portrait) ctx.drawImage(portrait, r.x + 12, r.y + 10, 68, 68);
  else { ctx.fillStyle = col; ctx.fillRect(r.x + 12, r.y + 10, 68, 68); }

  text(ctx, foe.name, r.x + 90, r.y + 12, { size: 22, color: a.foeHp > 0 ? '#efe3c6' : '#7a7060' });
  text(ctx, (foe.tag && foe.tag !== foe.name) ? foe.tag : '校场老手', r.x + 90, r.y + 40, { size: 12, color: '#8a8070' });
  text(ctx, '对方 · 护心镜', r.x + r.w - 14, r.y + 12, { size: 12, align: 'right', color: '#8a8070' });
  drawPips(ctx, r.x + 90, r.y + 60, a.foeHp, board.ARENA_FOE_HP, '#c9553f', 22);
  text(ctx, a.foeHp + ' / ' + board.ARENA_FOE_HP, r.x + r.w - 14, r.y + 58, {
    size: 13, align: 'right', color: '#c9553f',
  });

  // 中间一小段交手：两口木刀撞在一起的动效
  const midY = r.y + 118;
  const cx = r.x + r.w / 2;
  ground(ctx, r.x + 16, midY + 34, r.w - 32);
  const p = fx && fx.mode === 'arena' ? Math.min(1, fx.t / fx.dur) : 0;
  const swinging = p > 0.15 && p < 0.75;
  const lunge = swinging ? Math.sin((p - 0.15) / 0.6 * Math.PI) * 14 : 0;
  fighter(ctx, cx - 46 - lunge, midY + 34, 0.64, 1, swinging ? 'strike' : 'idle', '#4a5a46', '#d8b48c');
  fighter(ctx, cx + 46 + lunge, midY + 34, 0.64, -1, swinging ? 'strike' : 'idle', '#5a3a34', '#e0bc94');
  if (p > 0.5 && p < 0.95) strikeFlash(ctx, cx, midY + 4, (p - 0.5) / 0.45, '#f0c060');

  // 你自己
  text(ctx, '你', r.x + 14, r.y + r.h - 38, { size: 19, color: '#efe3c6' });
  drawPips(ctx, r.x + 46, r.y + r.h - 34, a.hp, board.ARENA_HP, '#6fa86a', 26);
  text(ctx, a.hp + ' / ' + board.ARENA_HP, r.x + 46 + board.ARENA_HP * 32 + 6, r.y + r.h - 35, {
    size: 13, color: '#6fa86a',
  });
  text(ctx, '第 ' + (t.round || 0) + ' 合', r.x + r.w - 14, r.y + r.h - 34, {
    size: 14, align: 'right', color: '#a2947a',
  });
}

/** 单挑：两将拍马对冲，劈 / 刺 / 闪各有一个动作 */
function drawDuelStage(app, ctx, t, r, fx) {
  const midY = r.y + r.h - 52;
  ground(ctx, r.x + 20, midY, r.w - 40);
  const p = fx && fx.mode === 'duel' ? Math.min(1, fx.t / fx.dur) : 0;
  const lunge = p > 0 && p < 0.8 ? Math.sin(p / 0.8 * Math.PI) * 24 : 0;
  const pMove = fx && fx.move;
  const aMove = fx && fx.ai;
  let pPose = 'idle';
  if (fx) {
    if (pMove === 'pi') pPose = p < 0.45 ? 'wind' : 'strike';
    else if (pMove === 'ci') pPose = 'strike';
    else pPose = 'hit';
  }
  if (fx && fx.kind === 'lose' && p > 0.6) pPose = 'hit';
  if (fx && fx.kind === 'win' && p > 0.7) pPose = 'strike';
  fighter(ctx, r.x + 84, midY, 0.95, 1, pPose, '#4a5a46', '#d8b48c');

  let fPose = 'idle';
  if (fx) {
    if (aMove === 'pi') fPose = p < 0.45 ? 'wind' : 'strike';
    else if (aMove === 'ci') fPose = 'strike';
    else fPose = 'hit';
    if (fx.kind === 'win' && p > 0.7) fPose = 'hit';
  }
  fighter(ctx, r.x + r.w - 84, midY, 0.95, -1, fPose, '#5a3a34', '#e0bc94');

  if (fx && p > 0.45 && p < 0.9) {
    strikeFlash(ctx, r.x + r.w / 2, midY - 44, (p - 0.45) / 0.45, fx.kind === 'win' ? '#f0c060' : '#d46a50');
  }
  text(ctx, '阵前', r.x + 16, r.y + 10, { size: 13, color: '#8f806a' });
  text(ctx, '劈 · 刺 · 闪', r.x + r.w - 16, r.y + 10, { size: 13, align: 'right', color: '#8f806a' });
  const line = fx && fx.ai
    ? '他这一手：' + board.aiLabelFor('duel', fx.ai)
    : '刀在手里，先看他肩头往哪边沉。';
  text(ctx, line, r.x + r.w / 2, r.y + r.h - 26, { size: 13, align: 'center', color: '#a2947a' });
}

/** 断粮道：三条道，AI 拦两条，只留一条空档 */
function drawSupplyStage(app, ctx, t, r, fx) {
  const lanes = board.SUPPLY_NODES;
  const baseY = r.y + r.h - 30;
  const topY = r.y + 24;
  // 敌营粮仓
  const barnX = r.x + r.w / 2;
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(barnX - 46, r.y + 22, 92, 26);
  ctx.beginPath();
  ctx.moveTo(barnX - 54, r.y + 22);
  ctx.lineTo(barnX, r.y + 6);
  ctx.lineTo(barnX + 54, r.y + 22);
  ctx.fill();
  text(ctx, '敌营粮仓', barnX, r.y + 28, { size: 12, align: 'center', color: '#9c8d74' });
  const blocks = (fx && fx.data && fx.data.blocks) || [];
  const chosen = fx && fx.move;
  const p = fx ? Math.min(1, fx.t / fx.dur) : 0;

  lanes.forEach(function (n, i) {
    const lx = r.x + r.w * (0.2 + i * 0.3);
    ctx.strokeStyle = 'rgba(217,164,65,0.30)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(lx, baseY);
    ctx.lineTo(lx + (i - 1) * 8, topY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,200,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, baseY);
    ctx.lineTo(lx + (i - 1) * 8, topY);
    ctx.stroke();
    text(ctx, n.short, lx, baseY + 4, { size: 14, align: 'center', color: '#b9a688' });
    if (blocks.indexOf(n.id) >= 0 && p > 0.12) {
      torch(ctx, lx, r.y + r.h * 0.42, 1.0, true);
      ctx.save();
      ctx.strokeStyle = '#c9553f';
      ctx.lineWidth = 3;
      const by = r.y + r.h * 0.50;
      ctx.beginPath();
      ctx.moveTo(lx - 18, by); ctx.lineTo(lx + 18, by);
      ctx.moveTo(lx - 14, by + 7); ctx.lineTo(lx + 14, by + 7);
      ctx.stroke();
      ctx.restore();
      text(ctx, '伏', lx, by - 20, { size: 13, align: 'center', color: '#d46a50' });
    }
  });

  if (chosen) {
    const idx = lanes.map(function (n) { return n.id; }).indexOf(chosen);
    const lx = r.x + r.w * (0.2 + idx * 0.3);
    const ly = baseY - (baseY - topY) * Math.min(0.86, p);
    ctx.fillStyle = '#d9c39a';
    ctx.fillRect(lx - 11, ly - 8, 22, 13);
    ctx.fillStyle = '#8a6a42';
    ctx.beginPath();
    ctx.arc(lx - 7, ly + 7, 5, 0, Math.PI * 2);
    ctx.arc(lx + 7, ly + 7, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e08a3a';
    ctx.beginPath();
    ctx.moveTo(lx, ly - 14);
    ctx.quadraticCurveTo(lx + 6, ly - 6, lx, ly - 2);
    ctx.quadraticCurveTo(lx - 6, ly - 6, lx, ly - 14);
    ctx.fill();
    if (fx.kind === 'lose' && p > 0.55) strikeFlash(ctx, lx, ly, (p - 0.55) / 0.45, '#d46a50');
  }
}

/** 狙杀敌哨：两明一暗，弓开箭出 */
function drawSentryStage(app, ctx, t, r, fx) {
  const baseY = r.y + r.h - 34;
  // 敌营帐
  const tentX = r.x + r.w * 0.60;
  ctx.fillStyle = '#241d16';
  ctx.beginPath();
  ctx.moveTo(tentX - 52, baseY - 64);
  ctx.lineTo(tentX, baseY - 96);
  ctx.lineTo(tentX + 52, baseY - 64);
  ctx.lineTo(tentX + 52, baseY - 24);
  ctx.lineTo(tentX - 52, baseY - 24);
  ctx.closePath();
  ctx.fill();
  text(ctx, '敌营', tentX, baseY - 62, { size: 12, align: 'center', color: '#8f806a' });

  const spots = [
    { id: 'brightA', x: r.x + r.w * 0.16, bright: true, name: '前门明哨' },
    { id: 'hidden', x: tentX - 34, bright: false, name: '帐后暗哨' },
    { id: 'brightB', x: r.x + r.w * 0.86, bright: true, name: '侧门明哨' },
  ];
  const p = fx ? Math.min(1, fx.t / fx.dur) : 0;
  const ai = fx && fx.ai;
  const swap = ai === 'change' && p > 0.08 && p < 0.5;
  spots.forEach(function (sp) {
    let x = sp.x;
    if (sp.bright && swap) x = sp.id === 'brightA' ? sp.x + 22 : sp.x - 22;
    ctx.fillStyle = '#3a2f22';
    ctx.fillRect(x - 9, baseY - 40, 18, 40);
    ctx.fillStyle = sp.bright ? '#d8b48c' : '#5c5040';
    ctx.beginPath();
    ctx.arc(x, baseY - 47, 6.5, 0, Math.PI * 2);
    ctx.fill();
    if (sp.bright) torch(ctx, x + 13, baseY - 36, 0.62, true);
    else {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 13, baseY - 42, 26, 42);
    }
    text(ctx, sp.name, x, baseY + 4, { size: 11, align: 'center', color: '#8f806a' });
  });

  // 你的弓：站在左下角，箭往上打
  const bx = r.x + r.w * 0.30;
  const by = r.y + r.h - 44;
  const pull = fx && p < 0.35 ? 1 - p / 0.35 : 0;
  ctx.strokeStyle = '#d9b978';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bx, by, 20, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240,220,180,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx - 12, by - 14);
  ctx.lineTo(bx - 12 + pull * 10, by + 2);
  ctx.lineTo(bx - 12, by + 18);
  ctx.stroke();
  text(ctx, '你', bx, by + 24, { size: 12, align: 'center', color: '#8f806a' });

  if (fx && fx.move && p > 0.28 && p < 0.95) {
    const sp = spots.filter(function (s) { return s.id === fx.move; })[0];
    if (sp) {
      const q = (p - 0.28) / 0.62;
      const ax = bx + (sp.x - bx) * q;
      const ay = (by - 4) + ((baseY - 51) - (by - 4)) * q;
      ctx.strokeStyle = '#e8dcc0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax - 11, ay + 4);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      if (q > 0.85) strikeFlash(ctx, sp.x, baseY - 47, (q - 0.85) / 0.15, fx.kind === 'win' ? '#f0c060' : '#d46a50');
    }
  }
}

/** 火攻：火船过江，或者收兵严阵以待 */
function drawFireStage(app, ctx, t, r, fx) {
  const waterY = r.y + 96;
  ctx.fillStyle = 'rgba(46,74,88,0.55)';
  ctx.fillRect(r.x + 8, waterY, r.w - 16, 52);
  for (let i = 0; i < 5; i++) {
    const wx = r.x + 24 + i * (r.w - 48) / 4;
    ctx.strokeStyle = 'rgba(160,200,210,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx - 12, waterY + 12 + (i % 2) * 14);
    ctx.lineTo(wx + 12, waterY + 12 + (i % 2) * 14);
    ctx.stroke();
  }
  // 水寨外连成一排的敌船
  for (let i = 0; i < 3; i++) {
    const bx = r.x + r.w * 0.52 + i * 38;
    const by = waterY + 22;
    ctx.fillStyle = '#332619';
    ctx.beginPath();
    ctx.moveTo(bx - 17, by);
    ctx.lineTo(bx + 17, by);
    ctx.lineTo(bx + 11, by + 9);
    ctx.lineTo(bx - 11, by + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(bx - 1, by - 20, 2, 20);
    ctx.fillStyle = 'rgba(200,120,70,0.55)';
    ctx.fillRect(bx + 1, by - 20, 8, 5);
    ctx.fillStyle = '#332619';
  }
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(r.x + 16, r.y + 34, r.w * 0.5, 40);
  ctx.beginPath();
  ctx.moveTo(r.x + 16, r.y + 34);
  ctx.lineTo(r.x + 16 + r.w * 0.25, r.y + 16);
  ctx.lineTo(r.x + 16 + r.w * 0.5, r.y + 34);
  ctx.fill();
  text(ctx, '敌水寨', r.x + 16 + r.w * 0.25, r.y + 44, { size: 12, align: 'center', color: '#9c8d74' });
  text(ctx, '江面', r.x + r.w - 16, waterY + 6, { size: 11, align: 'right', color: '#7d8f96' });

  const p = fx ? Math.min(1, fx.t / fx.dur) : 0;
  if (fx && fx.move === 'hold') {
    for (let i = 0; i < 6; i++) {
      const sx = r.x + 28 + i * (r.w - 56) / 5;
      ctx.fillStyle = '#3a4a3a';
      ctx.fillRect(sx - 10, waterY + 56, 20, 26);
      ctx.strokeStyle = '#d9b978';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 10, waterY + 56, 20, 26);
    }
    text(ctx, '严阵以待 · 今夜不点火', r.x + r.w / 2, r.y + r.h - 22, { size: 13, align: 'center', color: '#a2947a' });
    return;
  }
  const boatX = r.x + 44 + (r.w - 140) * Math.min(1, p * 1.1);
  const boatY = waterY + 26;
  ctx.fillStyle = '#6a4a34';
  ctx.beginPath();
  ctx.moveTo(boatX - 24, boatY);
  ctx.lineTo(boatX + 24, boatY);
  ctx.lineTo(boatX + 16, boatY + 15);
  ctx.lineTo(boatX - 16, boatY + 15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a2c1e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(boatX, boatY); ctx.lineTo(boatX, boatY - 16);
  ctx.stroke();
  if (fx && p > 0.35) {
    ctx.fillStyle = '#e08a3a';
    ctx.beginPath();
    ctx.moveTo(boatX, boatY - 34 - Math.sin(p * 9) * 4);
    ctx.quadraticCurveTo(boatX + 16, boatY - 10, boatX, boatY - 2);
    ctx.quadraticCurveTo(boatX - 16, boatY - 10, boatX, boatY - 34);
    ctx.fill();
    ctx.fillStyle = '#f2cc78';
    ctx.beginPath();
    ctx.moveTo(boatX, boatY - 22 - Math.sin(p * 9) * 3);
    ctx.quadraticCurveTo(boatX + 8, boatY - 8, boatX, boatY - 2);
    ctx.quadraticCurveTo(boatX - 8, boatY - 8, boatX, boatY - 22);
    ctx.fill();
  }
  if (fx && fx.ai === 'ready') {
    ctx.strokeStyle = '#c9553f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.62, waterY - 4);
    ctx.lineTo(r.x + r.w * 0.62, waterY + 44);
    ctx.stroke();
    text(ctx, '拒火船', r.x + r.w * 0.62, waterY + 48, { size: 11, align: 'center', color: '#c9553f' });
  }
  if (fx && p > 0.8) strikeFlash(ctx, boatX + 18, boatY + 2, (p - 0.8) / 0.2, fx.kind === 'win' ? '#f0c060' : '#d46a50');
  text(ctx, '顺风 · 等风 · 严阵', r.x + r.w - 14, r.y + 8, { size: 12, align: 'right', color: '#8f806a' });
}

/** 烽火传令：三选一，再过二选一，一路骑着马送信 */
function drawRelayStage(app, ctx, t, r, fx) {
  const baseY = r.y + r.h - 26;
  const gateY = r.y + r.h * 0.46;
  const lanes = board.RELAY_LANES;
  const relay = t.relay || {};
  const blocked = [relay.block1, relay.block2];
  const chosen = fx ? fx.move : relay.firstLane;
  const stage = fx && fx.stage ? fx.stage : (relay.stage || 1);
  const p = fx ? Math.min(1, fx.t / fx.dur) : 0;

  lanes.forEach(function (n, i) {
    const lx = r.x + r.w * (0.2 + i * 0.3);
    ctx.strokeStyle = 'rgba(217,164,65,0.30)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(lx, baseY);
    ctx.lineTo(lx + (i - 1) * 10, r.y + 24);
    ctx.stroke();
    text(ctx, n.short, lx, baseY + 4, { size: 14, align: 'center', color: '#b9a688' });
    if (blocked.indexOf(n.id) >= 0) {
      ctx.fillStyle = '#c9553f';
      ctx.fillRect(lx - 20, gateY, 40, 4);
      ctx.fillRect(lx - 15, gateY + 7, 30, 4);
      torch(ctx, lx - 24, gateY + 14, 0.7, true);
    }
  });

  ctx.strokeStyle = 'rgba(240,192,96,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(r.x + 14, gateY); ctx.lineTo(r.x + r.w - 14, gateY);
  ctx.stroke();
  text(ctx, stage >= 2 ? '第二关 · 只剩两条道' : '第一关 · 三条驿道', r.x + 14, r.y + 8, { size: 12, color: '#8f806a' });
  text(ctx, '前线', r.x + r.w - 14, r.y + 8, { size: 12, align: 'right', color: '#8f806a' });

  let idx = lanes.map(function (n) { return n.id; }).indexOf(chosen);
  if (idx < 0) idx = 1;
  const lx = r.x + r.w * (0.2 + idx * 0.3);
  const rideY = baseY - (baseY - (r.y + 40)) * Math.min(1, p * 1.05);
  rider(ctx, lx, rideY, 0.95, fx ? p * 3 : 0.2, '#4a3a2a');
  if (fx && fx.kind === 'lose' && p > 0.6) strikeFlash(ctx, lx, gateY, (p - 0.6) / 0.4, '#d46a50');
}

/* ------------------------------------------------------------ 选局页 */

function drawModeSelect(app, site, w, h) {
  const ctx = app.runtime.ctx;
  const st = app.state;
  const siteName = site ? site.name : '此地';
  const modes = board.modeList();
  const week = board.weekInfo(st);

  text(ctx, siteName + ' · 军机棋盘', 20, 22, { size: 31, color: '#f0c060' });
  text(ctx, '六局军情，各押一注；七天只摆十局', 20, 66, { size: 15, color: '#a2947a' });

  panel(ctx, 20, 96, w - 40, 104, { fill: '#1d1711' });
  text(ctx, '本周还剩 ' + week.remaining + ' 局', 40, 112, { size: 24, color: '#f0c060' });
  text(ctx, '金钱 ' + st.player.gold + ' · 声望 ' + st.player.renown, w - 40, 122, {
    size: 13, align: 'right', color: '#a2947a',
  });
  text(ctx, '报名 ' + board.FEE + ' 金钱 · 胜者 ' + board.PRIZE + ' 金钱', 40, 148, {
    size: 12.5, color: '#c9bda2',
  });
  text(ctx, '七天十局，下满等下一轮。', 40, 170, { size: 12.5, color: '#c9bda2' });

  const top = 216;
  const gap = CARD_GAP;
  const cardH = 116;
  const cardW = (w - 40 - gap) / 2;
  modes.forEach(function (mode, i) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = 20 + col * (cardW + gap);
    const y = top + row * (cardH + 12);
    panel(ctx, x, y, cardW, cardH, { fill: '#201810' });
    ctx.fillStyle = mode.color;
    ctx.fillRect(x, y, 4, cardH);
    drawIcon(ctx, mode.icon, x + 12, y + 12, 40, '#f0c060');
    text(ctx, mode.name, x + 60, y + 14, { size: 22, color: '#f2e3c4' });
    wrap(ctx, mode.short, cardW - 72, 11.5).slice(0, 2).forEach(function (line, li) {
      text(ctx, line, x + 60, y + 46 + li * 15, { size: 11.5, color: '#b9a688' });
    });
    text(ctx, '报名 ' + board.FEE + ' · 胜 ' + board.PRIZE, x + 14, y + cardH - 22, {
      size: 11, color: '#9c8d74',
    });
    text(ctx, '→', x + cardW - 14, y + cardH - 24, { size: 20, align: 'right', color: '#f0c060' });
    app.ui.rect('wb_mode_' + mode.id, x * KS, y * KS, cardW * KS, cardH * KS, function () {
      const r = board.enter(st, site, mode.id);
      if (!r.ok) { app.showToast(r.msg, 2.6); return; }
      if (TourneyScene) TourneyScene.fx = null;
    });
  });

  const footTop = top + Math.ceil(modes.length / 2) * (cardH + 12) + 10;
  text(ctx, '本周 ' + week.used + ' / ' + board.WEEK_LIMIT + ' 局', 20, footTop, {
    size: 13, color: '#d9b978',
  });
  text(ctx, '七天一刷', w - 20, footTop, { size: 12, align: 'right', color: '#8f806a' });
  drawWeekBar(app.runtime.ctx, 20, footTop + 26, w - 40, week.used, board.WEEK_LIMIT);
  text(ctx, '六局赢面都不到四成，掂量着下注。', 20, footTop + 46, { size: 12, color: '#8f806a' });

  btn(app, ctx, 20, h - 82, w - 40, 62, '回城', {
    id: 'wb_back', size: 24, fill: '#241c14', onTap: function () { app.pop(); },
  });
}

/* ------------------------------------------------------------ 对局页 */

function drawBoardArt(ctx, mode) {
  drawIcon(ctx, mode.icon, 20, 92, 46, '#e8b861');
  text(ctx, mode.name, 76, 94, { size: 25, color: '#f2e3c4' });
  text(ctx, mode.short, 76, 126, { size: 12, color: '#a2947a' });
}

function drawChoiceButtons(app, st, t, mode, x, y, w, locked) {
  const ctx = app.runtime.ctx;
  const list = board.choiceList(t.mode, t.relay);
  const n = list.length;
  const gap = 10;
  const cols = n === 4 ? 2 : (n >= 3 ? 3 : n);
  const bw = (w - 40 - gap * (cols - 1)) / cols;
  const bh = n === 4 ? 76 : 82;
  list.forEach(function (item, i) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const bx = 20 + col * (bw + gap);
    const by = y + row * (bh + 26);
    const isBlock = item.kind === 'block';
    btn(app, ctx, bx, by, bw, bh, item.name, {
      id: 'wb_choice_' + item.id,
      size: n > 3 ? 24 : (n === 3 ? 20 : 28),
      fill: t.mode === 'arena' ? (isBlock ? FILL_BLOCK : FILL_ATTACK) : mode.color,
      disabled: !!locked,
      onTap: function () {
        if (TourneyScene.fx) return;
        const r = board.choose(st, item.id);
        if (!r.ok) { app.showToast(r.msg, 2.2); return; }
        TourneyScene.fx = {
          mode: t.mode,
          move: item.id,
          ai: r.aiChoice,
          kind: r.result,
          data: r,
          stage: r.stage || (t.relay ? t.relay.stage : 1),
          t: 0,
          dur: r.result === 'continue' ? 0.7 : 0.95,
        };
        if (r.result === 'tie') app.showToast('同招相抵 · 再出一手', 2.2);
      },
    });
    if (item.desc && cols <= 2) {
      text(ctx, item.desc, bx + bw / 2, by + bh + 5, {
        size: 11, align: 'center', color: '#8f806a',
      });
    }
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
  const fx = TourneyScene.fx;
  const week = board.weekInfo(st);

  text(ctx, (site ? site.name : t.siteName) + ' · 军机棋盘', 20, 22, { size: 31, color: '#f0c060' });
  text(ctx, mode.name + ' · 报名 ' + board.FEE + ' · 胜者 ' + board.PRIZE, 20, 66, {
    size: 15, color: '#a2947a',
  });
  text(ctx, '金钱 ' + st.player.gold + ' · 余 ' + week.remaining + ' 局', w - 20, 68, {
    size: 13, align: 'right', color: '#a2947a',
  });

  drawBoardArt(ctx, mode);
  const r = stageRect(app, h);
  panel(ctx, r.x, r.y, r.w, r.h, { fill: '#1b160f' });

  if (t.mode === 'arena') drawArenaStage(app, ctx, t, r, fx);
  else if (t.mode === 'duel') drawDuelStage(app, ctx, t, r, fx);
  else if (t.mode === 'supply') drawSupplyStage(app, ctx, t, r, fx);
  else if (t.mode === 'sentry') drawSentryStage(app, ctx, t, r, fx);
  else if (t.mode === 'fire') drawFireStage(app, ctx, t, r, fx);
  else if (t.mode === 'relay') drawRelayStage(app, ctx, t, r, fx);

  const promptY = r.y + r.h + 8;
  let prompt = t.choiceTitle || mode.choiceTitle;
  if (t.mode === 'relay') {
    prompt = t.relay && t.relay.stage === 2 ? '第二关 · 剩下两条驿道，选一条冲出去' : '第一关 · 三条驿道，选一条送信';
  } else if (t.mode === 'supply') {
    prompt = '三条粮道，敌营拦两条 · 你走哪条？';
  } else if (t.mode === 'sentry') {
    prompt = '三个哨位 · 先狙哪一个？';
  } else if (t.mode === 'fire') {
    prompt = '点火，还是按兵不动？';
  } else if (t.mode === 'arena' && t.arena) {
    prompt = '第 ' + (t.round + 1) + ' 合 · 你 ' + t.arena.hp + ' 血 / ' + t.arena.foe.name + ' ' + t.arena.foeHp + ' 血';
  }
  text(ctx, prompt, 20, promptY, { size: 15, color: '#e0c98d' });

  const choiceTop = promptY + 24;
  const list = board.choiceList(t.mode, t.relay);
  const cols = list.length === 4 ? 2 : (list.length >= 3 ? 3 : list.length);
  const rows = Math.ceil(list.length / cols);
  const bh = list.length === 4 ? 76 : 82;
  const choiceBottom = choiceTop + rows * (bh + 26);

  if (!t.done) {
    drawChoiceButtons(app, st, t, mode, 20, choiceTop, w, !!fx);
  } else {
    const resTop = choiceTop;
    panel(ctx, 20, resTop, w - 40, 136, {
      fill: t.win ? '#1e2a1c' : (t.result === 'draw' ? '#22201a' : '#2a1b16'),
    });
    text(ctx, t.result === 'draw' ? '平' : (t.win ? '胜' : '负'), 40, resTop + 8, {
      size: 38, color: t.result === 'draw' ? '#c9bda2' : (t.win ? '#8fbf7a' : '#d46a50'),
    });
    text(ctx, t.win ? '军机得手 · 赏钱 ' + board.PRIZE + ' 金钱'
      : (t.result === 'draw' ? '不战而收 · 报名费已退回' : '这一局失手 · 报名费不退'),
      40, resTop + 58, { size: 21, color: t.win ? '#f0c060' : '#c9bda2' });
    text(ctx, t.win ? '声望 +12 · 士气 +4' : (t.result === 'draw' ? '声望 +1' : '声望 +2 · 士气 -2'), 40, resTop + 96, {
      size: 13, color: '#a2947a',
    });
    text(ctx, '本周还剩 ' + week.remaining + ' 局', w - 40, resTop + 96, {
      size: 13, align: 'right', color: '#8f806a',
    });
  }

  const logTop = t.done ? choiceTop + 148 : choiceBottom + 10;
  const room = h - 96 - logTop;
  if (room > 56) {
    const shown = (t.log || []).slice(-3).join('\n');
    const lines = wrap(ctx, shown || '鼓声未起，棋盘上的灯已经点亮。', w - 76, 14).slice(0, 4);
    const tips = wrap(ctx, mode.rule, w - 76, 13).slice(0, 3);
    const bodyH = 30 + lines.length * 20;
    const tipsH = tips.length ? 30 + tips.length * 19 : 0;
    const logH = Math.min(room, Math.max(74, bodyH + tipsH + 44));
    panel(ctx, 20, logTop, w - 40, logH, { fill: '#15110d' });
    text(ctx, '棋盘记事', 38, logTop + 10, { size: 13, color: '#8f806a' });
    lines.forEach(function (line, i) {
      text(ctx, line, 38, logTop + 30 + i * 20, { size: 14, color: '#e4d6b9' });
    });
    let cursor = logTop + 30 + lines.length * 20;
    if (tipsH && cursor + tipsH <= logTop + logH - 8) {
      ctx.strokeStyle = 'rgba(240,192,96,0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(38, cursor + 5);
      ctx.lineTo(w - 38, cursor + 5);
      ctx.stroke();
      text(ctx, '军机提要', 38, cursor + 14, { size: 13, color: '#8f806a' });
      tips.forEach(function (line, i) {
        text(ctx, line, 38, cursor + 36 + i * 19, { size: 13, color: '#a2947a' });
      });
      cursor += tipsH;
    }
    const barTop = logTop + logH - 34;
    if (barTop > cursor + 8) {
      const bw = w - 76;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(38, barTop, bw, 8);
      ctx.fillStyle = '#d9b978';
      ctx.fillRect(38, barTop, bw * Math.min(1, week.used / board.WEEK_LIMIT), 8);
      text(ctx, '本周 ' + week.used + ' / ' + board.WEEK_LIMIT + ' 局', 38, barTop + 12, {
        size: 11, color: '#7d7263',
      });
      text(ctx, '七天一刷', w - 38, barTop + 12, { size: 11, align: 'right', color: '#7d7263' });
    }
  }

  if (t.done) {
    const bw = (w - 40 - 12) / 2;
    btn(app, ctx, 20, h - 82, bw, 62, '再摆一局', {
      id: 'wb_again', size: 22, fill: '#3a2c1e', onTap: function () {
        board.close(st);
        TourneyScene.fx = null;
      },
    });
    btn(app, ctx, 20 + bw + 12, h - 82, bw, 62, '领赏回城', {
      id: 'wb_back', size: 22, fill: '#241c14', onTap: function () {
        board.close(st);
        TourneyScene.fx = null;
        app.pop();
      },
    });
  } else {
    btn(app, ctx, 20, h - 82, w - 40, 62,
      t.mode === 'relay' ? '暂离棋盘 · 可回来接着送信' : '暂离棋盘 · 报名费不退', {
        id: 'wb_leave', size: 20, fill: '#241c14', onTap: function () { app.pop(); },
      });
  }
}

/* ------------------------------------------------------------ 场景 */

const TourneyScene = {
  enter(app, params) {
    this.siteId = params && params.siteId;
    this.fx = null;
    const t = app.state.tourney;
    if (t && (!t.mode || !board.modeById(t.mode))) app.state.tourney = null;
  },

  update(app, dt) {
    const fx = this.fx;
    if (!fx) return;
    fx.t += dt;
    if (fx.t >= fx.dur) this.fx = null;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const W = app.runtime.width;
    const H = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }

    const site = this.siteId ? siteById(st.world, this.siteId) : null;
    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, W, H);
    scenery.drawBackdrop(ctx, 'tourney', W, H, 23);

    KS = W / DESIGN_W;
    DW = DESIGN_W;
    DH = H / KS;
    ctx.save();
    ctx.scale(KS, KS);
    if (!st.tourney) drawModeSelect(app, site, DW, DH);
    else drawGame(app, site, DW, DH);
    ctx.restore();
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = TourneyScene;
