/**
 * 标题：风云三国 · 骑砍大师制作
 */

const { text, panel } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');

const SAVE_KEY = 'bw_save_v4';

function hasSave(app) {
  const raw = app.runtime.storage.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.player || !data.relations) return null;
    return data;
  } catch (e) {
    return null;
  }
}

const TitleScene = {
  enter(app) {
    app.saveMeta = hasSave(app);
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const t = (app.mapPhase = (app.mapPhase || 0) + 0.016);

    // 烈火背景：黑烟、赤焰、飞灰，标题从火里烧出来
    drawFireBackdrop(ctx, w, h, t);

    // 标题
    text(ctx, '风云三国', w / 2, h * 0.285, {
      size: 104, align: 'center', color: '#ffe0a0', shadow: true,
    });
    text(ctx, '骑 砍 大 师 制 作', w / 2, h * 0.285 + 112, {
      size: 25, align: 'center', color: '#d9a441',
    });
    text(ctx, '汉末风云 · 群雄逐鹿 · 一将功成万骨枯', w / 2, h * 0.285 + 158, {
      size: 17, align: 'center', color: '#9c8a70',
    });

    // 按钮：新的开始 / 最近存档 / 保存的存档 / 玩法 / 商店
    const by = h * 0.50;
    const bh = 70;
    const gapY = 78;
    const bw = w - 160;
    app.ui.button(ctx, 80, by, bw, bh, '新的开始 · 洛阳溃兵', {
      id: 'new', size: 28, fill: '#3a2c1e', onTap: function () {
        app.state = stateLib.createGame({});
        app.replace('map');
      },
    });

    const meta = app.saveMeta;
    app.ui.button(ctx, 80, by + gapY, bw, bh,
      meta ? '加载最近存档 · 第 ' + meta.clock.day + ' 天' : '加载最近存档（空）', {
        id: 'cont', size: 26, disabled: !meta, fill: '#241c14', onTap: function () {
          const raw = app.runtime.storage.get(SAVE_KEY);
          const st = stateLib.deserialize(raw);
          if (!st) {
            app.showToast('存档读不出来，只能重开。');
            return;
          }
          app.state = st;
          app.replace('map');
        },
      });

    app.ui.button(ctx, 80, by + gapY * 2, bw, bh, '加载保存存档 · 九个槽', {
      id: 'slots', size: 26, fill: '#241c14', onTap: function () {
        app.push('saves', { mode: 'load', from: 'title' });
      },
    });

    app.ui.button(ctx, 80, by + gapY * 3, bw, bh - 4, '玩法 · 战役 · 兵种', {
      id: 'help', size: 24, fill: '#201a14', onTap: function () {
        app.push('help');
      },
    });

    text(ctx, '点地图行军 · 城池经营 · 领主追杀 · 天机改命', w / 2, h - 40, {
      size: 15, align: 'center', color: '#6a6050',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

/** 烈火背景：不依赖外部图，纯 Canvas 烧出一片战场 */
function drawFireBackdrop(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#060403');
  sky.addColorStop(0.28, '#170a05');
  sky.addColorStop(0.55, '#421407');
  sky.addColorStop(0.78, '#1c0904');
  sky.addColorStop(1, '#050302');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 地平线上的大火光，把半个天都映红
  const glow = ctx.createRadialGradient(w / 2, h * 0.64, 20, w / 2, h * 0.64, h * 0.68);
  glow.addColorStop(0, 'rgba(255,150,52,0.62)');
  glow.addColorStop(0.35, 'rgba(210,62,14,0.32)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 远处烧黑的山脊，压低，不挡住火
  ctx.fillStyle = '#0c0705';
  for (let i = 0; i < 7; i += 1) {
    const bx = -40 + i * (w / 5);
    const bh = 70 + (i % 3) * 36;
    ctx.beginPath();
    ctx.moveTo(bx, h * 0.69);
    ctx.lineTo(bx + w / 10, h * 0.69 - bh);
    ctx.lineTo(bx + w / 4, h * 0.69);
    ctx.closePath();
    ctx.fill();
  }

  // 一层层火舌：底宽、顶窄，随风摆；颜色从暗红到亮黄
  const layers = [
    { col: 'rgba(126,22,6,0.88)', base: 0.83, amp: 140, speed: 1.2, seg: 24 },
    { col: 'rgba(210,54,9,0.86)', base: 0.88, amp: 112, speed: 1.8, seg: 30 },
    { col: 'rgba(255,108,18,0.78)', base: 0.92, amp: 86, speed: 2.4, seg: 36 },
    { col: 'rgba(255,184,56,0.52)', base: 0.95, amp: 54, speed: 3.1, seg: 42 },
  ];
  layers.forEach(function (l, li) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= l.seg; i += 1) {
      const x = (i / l.seg) * w;
      const baseY = h * l.base;
      const wave = Math.sin(i * 0.48 + t * l.speed + li * 2) * 16;
      const spike = Math.pow(Math.abs(Math.sin(i * 1.35 + t * l.speed * 0.6 + li)), 1.35) * l.amp;
      ctx.lineTo(x, baseY - spike - wave);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = l.col;
    ctx.fill();
  });

  // 烧塌的城楼剪影，压在火前面
  ctx.fillStyle = '#070403';
  const by = h * 0.735;
  const gateW = Math.min(170, w * 0.46);
  const gateX = w / 2 - gateW / 2;
  ctx.fillRect(gateX, by - 62, gateW, 62);
  ctx.fillRect(gateX + 18, by - 92, 34, 34);
  ctx.fillRect(gateX + gateW - 52, by - 84, 30, 30);
  for (let x = gateX; x < gateX + gateW; x += 28) {
    ctx.fillRect(x, by - 72, 14, 12);
  }
  // 门洞透出的火
  const door = ctx.createLinearGradient(0, by - 40, 0, by);
  door.addColorStop(0, 'rgba(255,170,60,0.7)');
  door.addColorStop(1, 'rgba(120,26,6,0.1)');
  ctx.fillStyle = door;
  ctx.fillRect(w / 2 - 18, by - 38, 36, 38);

  // 黑烟从城后卷上来
  ctx.fillStyle = 'rgba(10,7,5,0.32)';
  for (let i = 0; i < 5; i += 1) {
    const sx = w * (0.18 + i * 0.16);
    const sh = 120 + i * 34;
    ctx.save();
    ctx.translate(sx, h * 0.55 - sh * 0.4);
    ctx.scale(1, (sh * 0.4) / (34 + i * 8));
    ctx.beginPath();
    ctx.arc(0, 0, 34 + i * 8, 0, Math.PI * 2);
    ctx.restore();
    ctx.fill();
  }

  // 飞灰与火星
  for (let i = 0; i < 64; i += 1) {
    const seed = i * 37.7;
    const x = ((seed + t * (18 + (i % 5) * 8)) % (w + 40)) - 20;
    const y = h * 0.94 - ((seed * 3 + t * (26 + (i % 7) * 9)) % (h * 0.78));
    const a = 0.28 + (Math.sin(t * 2 + i) + 1) * 0.25;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255,224,150,' + a + ')' : 'rgba(255,104,30,' + a + ')';
    ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
  }

  // 底部烟尘，压暗按钮区
  const smoke = ctx.createLinearGradient(0, h * 0.78, 0, h);
  smoke.addColorStop(0, 'rgba(0,0,0,0)');
  smoke.addColorStop(1, 'rgba(0,0,0,0.74)');
  ctx.fillStyle = smoke;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
}

function pixelSilhouette(ctx, app, cx, cy, size, t) {
  // 光晕
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, size * 0.9);
  g.addColorStop(0, 'rgba(240,192,96,0.28)');
  g.addColorStop(1, 'rgba(240,192,96,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

  const w = size;
  const hh = size * 1.25;
  ctx.drawImage(app.assets.player, cx - w / 2, cy - hh * 0.55 + Math.sin(t) * 3, w, hh);
}

module.exports = TitleScene;
module.exports.SAVE_KEY = SAVE_KEY;
