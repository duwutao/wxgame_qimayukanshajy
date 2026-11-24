/**
 * 局内商店：看一段军情广告，领两支天机简。
 * 每日上限 5 次（共 10 支），由 state.adShiInfo 记录，跨天自动重置。
 * 广告 SDK 尚未接入：runtime.showRewardedAd 已留好接口，浏览器里模拟观看。
 */

const { text, panel, wrap } = require('../render/ui.js');
const stateLib = require('../core/state.js');

const PAD = 20;

const ShopScene = {
  enter(app) {
    this.busy = false;
    this.msg = '军情广告 · 看一段，领两支天机简。';
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#160f0a');
    grad.addColorStop(0.55, '#241812');
    grad.addColorStop(1, '#0d0907');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 摊子上的一盏灯
    const glow = ctx.createRadialGradient(w / 2, 250, 20, w / 2, 250, 340);
    glow.addColorStop(0, 'rgba(240,160,60,0.28)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    text(ctx, '商店', PAD, 30, { size: 44, color: '#f0c060' });
    text(ctx, '军情广告换天机 · 只记在当前存档 · 每天最多 5 次', PAD, 90, { size: 18, color: '#a2947a' });

    panel(ctx, PAD, 140, w - PAD * 2, 250, { fill: 'rgba(36,26,18,0.94)' });
    text(ctx, '天机简', PAD + 24, 162, { size: 28, color: '#d9a441' });
    const p = st ? st.player : null;
    text(ctx, p ? '军帐中现有 ' + p.shi + ' 支' : '还没有军帐：先开一局，天机简才记在你名下。',
      PAD + 24, 208, { size: 18, color: p ? '#e6dbc2' : '#8a8070' });
    const intro = '每一支能在战局里写下一句话：南风起、风止、名册。'
      + '风止只压敌军的攻势，不会反过来削自己的兵。';
    const ls = wrap(ctx, intro, w - PAD * 2 - 48, 17);
    ls.slice(0, 3).forEach(function (l, i) {
      text(ctx, l, PAD + 24, 244 + i * 26, { size: 16, color: '#a2947a' });
    });
    text(ctx, '广告 SDK 尚未接入；浏览器里会模拟一次观看，先走通流程。', PAD + 24, 330, {
      size: 14, color: '#6a6050',
    });

    const info = st ? stateLib.adShiInfo(st) : { max: 5, used: 0, left: 0, shiPer: 2 };
    text(ctx, '今日可领 ' + info.left + ' / ' + info.max + ' 次 · 每次 ' + info.shiPer + ' 支',
      PAD, 420, { size: 20, color: info.left > 0 ? '#8fbf7a' : '#d06a4a' });
    text(ctx, '当前存档已领 ' + (info.used * info.shiPer) + ' 支；明日重新计数。', PAD, 456, {
      size: 16, color: '#8a8070',
    });
    text(ctx, '换一个存档，这份次数从零开始。', PAD, 482, { size: 14, color: '#6a6050' });

    const can = !!st && info.left > 0 && !this.busy;
    app.ui.button(ctx, PAD, 520, w - PAD * 2, 108,
      this.busy ? '正在拉取军情…' : (info.left > 0 ? '看军情 · 领 2 支天机简' : '今日已领完'), {
        id: 'shop_ad', size: 27, fill: '#3a2c1e', disabled: !can, onTap: function () {
          if (app.state !== st || !st) return;
          app.top().scene.busy = true;
          app.showToast('正在拉取军情广告…', 1.6);
          app.runtime.showRewardedAd(function (ok, err) {
            const scene = app.top() && app.top().scene;
            if (scene) scene.busy = false;
            if (!ok) {
              app.showToast(err === 'web-sim' ? '广告没看完，天机简没领到。'
                : ('广告暂时不可用：' + (err || '平台未配置广告位')), 3);
              return;
            }
            const r = stateLib.claimAdShi(app.state);
            app.showToast(r.msg, 3);
          });
        },
      });
    text(ctx, this.msg, PAD, 642, { size: 15, color: '#8a8070' });

    app.ui.button(ctx, PAD, h - 96, w - PAD * 2, 68, '返回', {
      id: 'shop_back', size: 24, fill: '#241c14', onTap: function () {
        if (app.top() && app.top().name === 'shop') app.pop();
      },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ShopScene;
