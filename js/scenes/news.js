/**
 * 天下通报：国亡、君主下落、两国宣战/议和这类大事，全屏弹一张榜文。
 * 宣战/议和现在用内置战场、使团图片做底，文案整体居中。
 */

const { text, wrap, panel } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const NEWS_ART = require('../data/news_art.js');

const ART_CACHE = {};

/** 取内置背景图；浏览器/微信/抖音都通过平台 createImage 加载 data URL。 */
function artImage(app, id) {
  if (!id || !NEWS_ART[id] || !app || !app.runtime || !app.runtime.createImage) return null;
  let img = ART_CACHE[id];
  if (!img) {
    img = app.runtime.createImage();
    if (!img) return null;
    img.onload = function () { img.__ready = true; };
    try { img.src = NEWS_ART[id]; } catch (e) { return null; }
    ART_CACHE[id] = img;
  }
  return img.width > 0 && (img.complete || img.__ready) ? img : null;
}

/** 等比铺满屏幕，保留中间的军阵 / 使团，不被拉扁。 */
function drawCover(ctx, img, w, h) {
  const iw = img.width || 1;
  const ih = img.height || 1;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** 未加载完时的兜底：只留暗底，不再画旧的程序图。 */
function drawFallback(ctx, w, h, kind) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#15100d');
  sky.addColorStop(0.55, kind === 'peace' ? '#3b3429' : '#38231d');
  sky.addColorStop(1, '#0d0907');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
}

function drawArt(app, ctx, w, h, id, t) {
  const img = artImage(app, id);
  if (img) drawCover(ctx, img, w, h);
  else drawFallback(ctx, w, h, id);

  // 压暗四周，让中间的榜文压住画面，同时保留上下两端的场景。
  const vignette = ctx.createLinearGradient(0, 0, 0, h);
  vignette.addColorStop(0, 'rgba(4,3,2,0.62)');
  vignette.addColorStop(0.25, 'rgba(4,3,2,0.22)');
  vignette.addColorStop(0.75, 'rgba(4,3,2,0.25)');
  vignette.addColorStop(1, 'rgba(4,3,2,0.68)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
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
    // 进入场景就预载，图片从内置 data URL 解码。
    if (app.newsView.art) artImage(app, app.newsView.art);
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

    const art = v.art;
    if (art) drawArt(app, ctx, w, h, art, v.t);
    else {
      ctx.fillStyle = '#0b0906';
      ctx.fillRect(0, 0, w, h);
    }

    const lines = v.lines.length ? v.lines : ['天下无事。'];
    const cw = Math.min(w - 40, art ? 620 : 640);
    const lineGap = 28;
    const bodyTop = 112;
    const wrapped = lines.map(function (l) {
      return wrap(ctx, l, cw - 72, 19).slice(0, 3);
    });
    let bodyH = 0;
    wrapped.forEach(function (ls) { bodyH += ls.length * lineGap; });
    bodyH += Math.max(0, lines.length - 1) * 6;
    const actionH = v.mode === 'peace-offer' ? 112 : 82;
    const chHeight = Math.min(h - 64, bodyTop + bodyH + actionH);
    const cx = (w - cw) / 2;
    const cy = (h - chHeight) / 2;

    // 榜文在画面正中；不是贴在底部的长条。
    panel(ctx, cx, cy, cw, chHeight, {
      fill: art ? 'rgba(16,12,9,0.80)' : '#1a1410',
      border: art ? 'rgba(217,164,65,0.62)' : undefined,
    });

    text(ctx, '— ' + v.tag + ' —', cx + cw / 2, cy + 18, {
      size: 14, align: 'center', color: '#b7a58a',
    });
    text(ctx, v.title, cx + cw / 2, cy + 46, { size: 36, align: 'center', color: art === 'peace' ? '#e3cf9a' : '#d05040' });

    ctx.fillStyle = art === 'peace' ? '#c8a660' : UI_COLORS.accent;
    ctx.fillRect(cx + cw / 2 - 62, cy + 92, 124, 3);

    let y = cy + bodyTop;
    wrapped.forEach(function (ls) {
      ls.forEach(function (l) {
        text(ctx, l, cx + cw / 2, y, { size: 19, align: 'center', color: '#eadcbc' });
        y += lineGap;
      });
      y += 6;
    });

    if (v.mode === 'peace-offer') {
      text(ctx, '接受：两家罢兵，关系归零，天机简 +1。  拒绝：不留任何影响。',
        cx + cw / 2, cy + chHeight - 82, { size: 14, align: 'center', color: '#baa98c' });
      const bw = (cw - 96 - 14) / 2;
      const by = cy + chHeight - 60;
      app.ui.button(ctx, cx + 48, by, bw, 46, '接受议和 · +1 天机简', {
        id: 'peace_offer_accept', size: 18, fill: '#3a4a2e', onTap: function () {
          const r = stateLib.acceptPeaceOffer(app.state, v.factionId);
          if (!r.ok) { app.showToast(r.msg, 2.4); return; }
          app.newsView = null;
          app.pop();
          app.showToast(r.msg, 3);
        },
      });
      app.ui.button(ctx, cx + 48 + bw + 14, by, bw, 46, '拒绝', {
        id: 'peace_offer_reject', size: 18, fill: '#4a241c', onTap: function () {
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
        cx + cw / 2, cy + chHeight - 78, {
          size: 14, align: 'center', color: '#b7a58a',
        });

      const bx = cx + 48;
      const by = cy + chHeight - 54;
      const bw = cw - 96;
      ctx.fillStyle = '#3a2c1e';
      ctx.fillRect(bx, by, bw, 40);
      ctx.fillStyle = '#6b5540';
      ctx.fillRect(bx, by, bw, 2);
      text(ctx, v.skipAny
        ? '跳过（' + Math.max(0, Math.ceil(v.auto - v.t)) + '）'
        : (v.auto > 0 ? '知道了（' + Math.max(0, Math.ceil(v.auto - v.t)) + '）' : '知道了'),
        cx + cw / 2, by + 9, { size: 20, align: 'center', color: '#f0c060' });
      app.ui.rect('news_ok', bx, by, bw, 40, function () {
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
