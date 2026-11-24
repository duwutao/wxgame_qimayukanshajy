/**
 * 天下通报：国亡、君主下落、两国宣战/议和这类大事，全屏弹一张榜文。
 * 国亡等大事要点"知道了"；宣战议和这类军情只停几息，自己散。
 */

const { text, wrap, panel } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');

/** 宣战背景：两军在山前列阵，中间已经撞在一起 */
function drawWarArt(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#161b24');
  sky.addColorStop(0.45, '#4a2b24');
  sky.addColorStop(1, '#160d0a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 远处的火线与烟
  ctx.fillStyle = 'rgba(210,96,54,0.22)';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.44, w * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(60,42,34,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.48);
  ctx.quadraticCurveTo(w * 0.26, h * 0.34, w * 0.5, h * 0.46);
  ctx.quadraticCurveTo(w * 0.78, h * 0.3, w, h * 0.46);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 山脊
  ctx.fillStyle = '#241a16';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.52);
  ctx.lineTo(w * 0.18, h * 0.38);
  ctx.lineTo(w * 0.32, h * 0.5);
  ctx.lineTo(w * 0.5, h * 0.34);
  ctx.lineTo(w * 0.68, h * 0.5);
  ctx.lineTo(w * 0.84, h * 0.39);
  ctx.lineTo(w, h * 0.5);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 两边的军阵：左赤、右青，长矛一层层压上去
  function army(cx, dir, color, trim) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const x = cx + dir * (col * 17 + (row % 2) * 7) - 8;
        const y = h * 0.20 + row * 20;
        ctx.fillStyle = 'rgba(10,8,6,0.55)';
        ctx.fillRect(x + 2, y + 4, 12, 22);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 11, 18);
        ctx.fillStyle = trim;
        ctx.fillRect(x + 2, y - 5, 7, 6);
        ctx.fillStyle = '#d8c79e';
        ctx.fillRect(x + 9, y + 3, 6, 2); // 枪尖的方向
        ctx.fillStyle = '#6e5738';
        ctx.fillRect(x + 6, y - 26, 2, 26);
      }
    }
  }
  army(w * 0.3, -1, '#6e2c22', '#c9824e');
  army(w * 0.7, 1, '#203b48', '#6fa4a8');

  // 军旗
  ctx.fillStyle = '#3a241c';
  ctx.fillRect(w * 0.18, h * 0.08, 4, h * 0.18);
  ctx.fillStyle = '#9e3d2c';
  ctx.fillRect(w * 0.19, h * 0.08, 42, 30);
  ctx.fillStyle = '#250f0b';
  text(ctx, '战', w * 0.19 + 21, h * 0.08 + 5, { size: 24, align: 'center', color: '#f0d9a8' });
  ctx.fillStyle = '#1e2c33';
  ctx.fillRect(w * 0.79, h * 0.08, 4, h * 0.18);
  ctx.fillStyle = '#2e5a66';
  ctx.fillRect(w * 0.79, h * 0.08, 46, 30);
  text(ctx, '兵', w * 0.79 + 23, h * 0.08 + 5, { size: 24, align: 'center', color: '#d8ece8' });

  // 交锋处火星
  const pulse = 0.45 + 0.4 * Math.abs(Math.sin(t * 2.1));
  ctx.fillStyle = 'rgba(245,183,80,' + pulse.toFixed(2) + ')';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.27, 28 + Math.sin(t * 3) * 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,210,160,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = -0.9 + i * 0.25;
    const len = 44 + (i % 3) * 10;
    ctx.moveTo(w * 0.5, h * 0.27);
    ctx.lineTo(w * 0.5 + Math.cos(a) * len, h * 0.27 + Math.sin(a) * len);
  }
  ctx.stroke();

  // 地面
  ctx.fillStyle = '#140f0c';
  ctx.fillRect(0, h * 0.34, w, h * 0.66);
  ctx.fillStyle = 'rgba(160,110,70,0.18)';
  ctx.fillRect(0, h * 0.34, w, 2);
}

/** 停战背景：城门外的使团，两家各执一卷文书 */
function drawPeaceArt(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#26313a');
  sky.addColorStop(0.45, '#6f6150');
  sky.addColorStop(0.8, '#c49a6c');
  sky.addColorStop(1, '#33251b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 晨光
  const sun = ctx.createRadialGradient(w * 0.5, h * 0.34, 10, w * 0.5, h * 0.34, w * 0.42);
  sun.addColorStop(0, 'rgba(255,222,160,0.55)');
  sun.addColorStop(1, 'rgba(255,222,160,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // 远处城郭
  ctx.fillStyle = '#2d241c';
  ctx.fillRect(w * 0.18, h * 0.10, w * 0.64, 5);
  ctx.fillRect(w * 0.2, h * 0.10, 8, h * 0.10);
  ctx.fillRect(w * 0.78, h * 0.10, 8, h * 0.10);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(w * 0.24 + i * w * 0.13, h * 0.10, 24, 18); // 城垛
  }

  // 桌子与两卷文书
  ctx.fillStyle = '#3a291c';
  ctx.fillRect(w * 0.28, h * 0.24, w * 0.44, 8);
  ctx.fillRect(w * 0.32, h * 0.25, 6, 16);
  ctx.fillRect(w * 0.68, h * 0.25, 6, 16);

  // 两位使者：一赤一青，各伸手交卷
  function envoy(x, dir, robe, trim) {
    ctx.fillStyle = 'rgba(10,8,6,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + dir * 10, h * 0.39, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(x - 22, h * 0.37);
    ctx.lineTo(x - 12, h * 0.18);
    ctx.lineTo(x + 12, h * 0.18);
    ctx.lineTo(x + 24, h * 0.37);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(x - 13, h * 0.17, 26, 8);
    ctx.fillStyle = '#d9b07e';
    ctx.beginPath();
    ctx.arc(x, h * 0.14, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2119';
    ctx.fillRect(x - 11, h * 0.12, 22, 6);
    // 袖与手
    ctx.fillStyle = robe;
    ctx.fillRect(x + dir * 8, h * 0.22, dir * 26, 9);
    ctx.fillStyle = '#d9b07e';
    ctx.fillRect(x + dir * 33, h * 0.23, 7, 7);
  }
  envoy(w * 0.33, 1, '#6d2c24', '#b77a4c');
  envoy(w * 0.67, -1, '#25404a', '#7ea4a8');

  // 中间文书：一点点递过去
  const lift = Math.sin(t * 0.9) * 2;
  ctx.fillStyle = '#e4d3ac';
  ctx.fillRect(w * 0.44, h * 0.23 + lift, w * 0.12, 7);
  ctx.fillStyle = '#b08b58';
  ctx.fillRect(w * 0.44, h * 0.23 + lift, 4, 7);
  ctx.fillRect(w * 0.44 + w * 0.12 - 4, h * 0.23 + lift, 4, 7);

  // 两侧旗帜
  ctx.fillStyle = '#4a3223';
  ctx.fillRect(w * 0.18, h * 0.08, 3, h * 0.16);
  ctx.fillStyle = '#8e3528';
  ctx.fillRect(w * 0.18, h * 0.08, 38, 26);
  text(ctx, '使', w * 0.18 + 19, h * 0.08 + 2, { size: 22, align: 'center', color: '#f0d9a8' });
  ctx.fillStyle = '#4a3223';
  ctx.fillRect(w * 0.8, h * 0.08, 3, h * 0.16);
  ctx.fillStyle = '#2f5661';
  ctx.fillRect(w * 0.77, h * 0.08, 38, 26);
  text(ctx, '和', w * 0.77 + 20, h * 0.08 + 2, { size: 22, align: 'center', color: '#d8ece8' });

  ctx.fillStyle = '#1a130d';
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  ctx.fillStyle = 'rgba(220,185,130,0.16)';
  ctx.fillRect(0, h * 0.82, w, 2);
}

const NewsScene = {
  enter(app, params) {
    const ev = params || {};
    app.newsView = {
      title: ev.title || '榜文',
      lines: Array.isArray(ev.lines) ? ev.lines.slice(0, 6) : [],
      tag: ev.tag || (ev.factionId ? '天下' : '军情'),
      mode: ev.mode || 'notice',
      factionId: ev.factionId || null,
      auto: ev.auto || 0,
      art: ev.art || null,
      skipAny: !!ev.skipAny,
      t: 0,
    };
  },

  update(app, dt) {
    const v = app.newsView;
    if (!v) return;
    v.t += dt;
    if (v.mode !== 'peace-offer' && v.auto > 0 && v.t >= v.auto) {
      app.newsView = null;
      app.pop();
    }
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const v = app.newsView;
    if (!v) return;

    // 全屏榜文：底下的地图不重画，免得和别的弹窗互相套娃
    if (v.art === 'war') drawWarArt(ctx, w, h, v.t);
    else if (v.art === 'peace') drawPeaceArt(ctx, w, h, v.t);
    else {
      ctx.fillStyle = '#0b0906';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.fillStyle = v.art ? 'rgba(6,5,4,0.10)' : 'rgba(6,5,4,0.55)';
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
    const cy = v.art ? Math.max(120, h - chHeight - 24) : (h - chHeight) / 2;

    panel(ctx, cx, cy, cw, chHeight, { fill: v.art ? 'rgba(22,16,12,0.72)' : '#1a1410' });

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

    if (v.mode === 'peace-offer') {
      text(ctx, '接受：两家罢兵，关系归零，天机简 +1。  拒绝：不留任何影响。',
        cx + cw / 2, cy + chHeight - 78, {
          size: 15, align: 'center', color: '#a2947a',
        });
      const bw = (cw - 120 - 14) / 2;
      const by = cy + chHeight - 58;
      app.ui.button(ctx, cx + 60, by, bw, 46, '接受议和 · +1 天机简', {
        id: 'peace_offer_accept', size: 19, fill: '#3a4a2e', onTap: function () {
          const r = stateLib.acceptPeaceOffer(app.state, v.factionId);
          if (!r.ok) { app.showToast(r.msg, 2.4); return; }
          app.newsView = null;
          app.pop();
          app.showToast(r.msg, 3);
        },
      });
      app.ui.button(ctx, cx + 60 + bw + 14, by, bw, 46, '拒绝', {
        id: 'peace_offer_reject', size: 19, fill: '#4a241c', onTap: function () {
          const r = stateLib.rejectPeaceOffer(app.state, v.factionId);
          app.newsView = null;
          app.pop();
          if (r.ok) app.showToast(r.msg, 2.4);
        },
      });
    } else {
      text(ctx, v.skipAny
        ? '点屏幕任意处跳过 · ' + Math.max(0, Math.ceil(v.auto - v.t)) + ' 息后自散'
        : (v.auto > 0 ? '军情传得很快，几息后自己散。' : '榜文贴在各城门口，来往的人都在看。'),
        cx + cw / 2, cy + chHeight - 74, {
          size: 15, align: 'center', color: '#8a8070',
        });

      const bx = cx + 60;
      const by = cy + chHeight - 58;
      const bw = cw - 120;
      ctx.fillStyle = '#3a2c1e';
      ctx.fillRect(bx, by, bw, 46);
      ctx.fillStyle = '#6b5540';
      ctx.fillRect(bx, by, bw, 2);
      text(ctx, v.skipAny
        ? '跳过（' + Math.max(0, Math.ceil(v.auto - v.t)) + '）'
        : (v.auto > 0 ? '知道了（' + Math.max(0, Math.ceil(v.auto - v.t)) + '）' : '知道了'),
        cx + cw / 2, by + 12, { size: 22, align: 'center', color: '#f0c060' });
      app.ui.rect('news_ok', bx, by, bw, 46, function () {
        app.newsView = null;
        app.pop();
      });
    }
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd(app) {
    const v = app.newsView;
    if (v && v.skipAny) {
      app.newsView = null;
      app.pop();
    }
  },
};

module.exports = NewsScene;
