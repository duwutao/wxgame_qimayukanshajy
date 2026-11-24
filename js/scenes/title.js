/**
 * 标题：骑砍大师 · 三国
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

    // 背景
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1a1510');
    grad.addColorStop(0.55, '#241a12');
    grad.addColorStop(1, '#0f0c09');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 远山
    ctx.fillStyle = '#2b2218';
    for (let i = 0; i < 5; i++) {
      const bx = -40 + i * (w / 4) + 20;
      const bh = 180 + (i % 3) * 40;
      ctx.beginPath();
      ctx.moveTo(bx, h * 0.62);
      ctx.lineTo(bx + w / 8, h * 0.62 - bh);
      ctx.lineTo(bx + w / 4, h * 0.62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#3a2c1e';
    for (let i = 0; i < 4; i++) {
      const bx = -20 + i * (w / 3);
      ctx.beginPath();
      ctx.moveTo(bx, h * 0.66);
      ctx.lineTo(bx + w / 6, h * 0.66 - 80);
      ctx.lineTo(bx + w / 3, h * 0.66);
      ctx.closePath();
      ctx.fill();
    }

    // 主角剪影
    const size = 190;
    pixelSilhouette(ctx, app, w / 2, h * 0.52, size, t);

    // 标题
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.fillRect(0, h * 0.49, w, 140);
    text(ctx, '骑砍大师', w / 2, h * 0.505, { size: 86, align: 'center', color: '#f0c060', shadow: true });
    text(ctx, '三 国 · 群 雄 割 据', w / 2, h * 0.505 + 92, {
      size: 24, align: 'center', color: '#c9bda2',
    });

    // 按钮：新的开始 / 最近存档 / 保存的存档 / 玩法
    const by = h * 0.615;
    const bh = 84;
    const gapY = 94;
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

    text(ctx, '点地图行军 · 城池经营 · 领主追杀 · 史简改命', w / 2, h - 40, {
      size: 15, align: 'center', color: '#6a6050',
    });

    text(ctx, '点地图行军 · 城池经营 · 领主追杀 · 史简改命', w / 2, h - 46, {
      size: 15, align: 'center', color: '#6a6050',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

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
