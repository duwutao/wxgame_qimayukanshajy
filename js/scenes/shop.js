/**
 * 局内商店：看一段军情广告，领取金钱、粮草或天机简。
 * 每个现实自然日刷新，三种奖励各自 10 次，互不占用；过本地零点自动重置。
 * 浏览器里由 runtime.showRewardedAd 模拟观看，小游戏端配置广告位后走真实激励视频。
 */

const { text, panel, wrap } = require('../render/ui.js');
const stateLib = require('../core/state.js');

const PAD = 20;

const ShopScene = {
  enter(app) {
    this.busy = false;
    this.busyKind = null;
    this.msg = '军情广告 · 每个现实日刷新 · 三种奖励各 10 次。';
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

    text(ctx, '商店', PAD, 28, { size: 42, color: '#f0c060' });
    text(ctx, '军情广告 · 每个现实日刷新 · 三种奖励各 10 次', PAD, 80, {
      size: 17, color: '#a2947a',
    });

    panel(ctx, PAD, 118, w - PAD * 2, 264, { fill: 'rgba(36,26,18,0.94)' });
    text(ctx, '今日军情', PAD + 24, 138, { size: 27, color: '#d9a441' });

    const p = st ? st.player : null;
    const info = st
      ? stateLib.adRewardInfo(st)
      : {
        max: 10, used: { gold: 0, food: 0, shi: 0 },
        left: { gold: 0, food: 0, shi: 0 }, gold: 1000, food: 200, shi: 2,
      };

    text(ctx, p ? '军帐：金钱 ' + p.gold + ' · 粮草 ' + p.food + ' · 天机简 ' + p.shi : '还没有军帐：先开一局再来。',
      PAD + 24, 174, { size: 17, color: p ? '#e6dbc2' : '#8a8070' });

    const rows = [
      { label: '金钱广告', used: info.used.gold, left: info.left.gold, color: info.left.gold > 0 ? '#8fbf7a' : '#d06a4a' },
      { label: '粮草广告', used: info.used.food, left: info.left.food, color: info.left.food > 0 ? '#8fbf7a' : '#d06a4a' },
      { label: '天机简广告', used: info.used.shi, left: info.left.shi, color: info.left.shi > 0 ? '#8fbf7a' : '#d06a4a' },
    ];
    rows.forEach(function (row, i) {
      text(ctx, row.label + '：今日 ' + row.used + ' / ' + info.max + ' · 还剩 ' + row.left + ' 次',
        PAD + 24, 204 + i * 24, { size: 16, color: row.color });
    });

    const tip = '现实日按手机本地日期算，过零点自动重置；三类奖励分别计数，互不占用。';
    const ls = wrap(ctx, tip, w - PAD * 2 - 48, 15);
    ls.slice(0, 2).forEach(function (l, i) {
      text(ctx, l, PAD + 24, 286 + i * 21, { size: 14, color: '#8a8070' });
    });

    text(ctx, '浏览器里会模拟观看；小游戏端配置激励视频广告位后拉起真实广告。', PAD, 396, {
      size: 14, color: '#6a6050',
    });

    const can = !!st && !this.busy;

    const watch = function (kind) {
      if (app.state !== st || !st) return;
      const scene = app.top() && app.top().scene;
      if (scene) {
        scene.busy = true;
        scene.busyKind = kind;
      }
      app.showToast('正在拉取军情广告…', 1.6);
      app.runtime.showRewardedAd(function (ok, err) {
        const now = app.top() && app.top().scene;
        if (now) {
          now.busy = false;
          now.busyKind = null;
        }
        if (!ok) {
          app.showToast(err === 'web-sim' ? '广告没看完，奖励没领到。'
            : ('广告暂时不可用：' + (err || '平台未配置广告位')), 3);
          return;
        }
        const r = stateLib.claimAdReward(app.state, kind);
        app.showToast(r.msg, 3);
        if (now) now.msg = r.msg;
      });
    };

    app.ui.button(ctx, PAD, 426, w - PAD * 2, 70,
      this.busy && this.busyKind === 'gold' ? '正在拉取军情…' : '看广告 · 领 1000 金钱', {
        id: 'shop_ad_gold', size: 24, fill: '#4a351d',
        disabled: !can || info.left.gold <= 0, onTap: function () {
          watch('gold');
        },
      });

    app.ui.button(ctx, PAD, 508, w - PAD * 2, 70,
      this.busy && this.busyKind === 'food' ? '正在拉取军情…' : '看广告 · 领 200 粮草', {
        id: 'shop_ad_food', size: 24, fill: '#3a2c1e',
        disabled: !can || info.left.food <= 0, onTap: function () {
          watch('food');
        },
      });

    app.ui.button(ctx, PAD, 590, w - PAD * 2, 70,
      this.busy && this.busyKind === 'shi' ? '正在拉取军情…' : '看广告 · 领 2 支天机简', {
        id: 'shop_ad_shi', size: 24, fill: '#2f2a1e',
        disabled: !can || info.left.shi <= 0, onTap: function () {
          watch('shi');
        },
      });

    const allDone = info.left.gold <= 0 && info.left.food <= 0 && info.left.shi <= 0;
    text(ctx, allDone ? '今日三类广告都已领完，明日零点后再来。' : this.msg, PAD, 684, {
      size: 15, color: allDone ? '#d06a4a' : '#8a8070',
    });

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
