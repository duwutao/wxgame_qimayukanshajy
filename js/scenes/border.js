/**
 * 边陲小镇专用界面。
 *
 * 这不是村庄页的复用：叛军未起时只给一段“镇民警惕、屠夫磨刀”的赶人文案；
 * 叛军起来后才是复国落脚地——每周 1000 义军、5 金/单位粮草、驿站旧部。
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const { drawBackdrop } = require('../render/scenery.js');
const stateLib = require('../core/state.js');
const border = require('../core/border.js');
const army = require('../core/army.js');
const { siteById } = require('../core/world.js');
const { TROOPS } = require('../data/troops.js');

const PAD = 16;

function siteOf(app) {
  const st = app.state;
  const id = (app.top() && app.top().params && app.top().params.siteId) || border.EDGE_ID;
  return siteById(st.world, id) || border.edgeSite(st);
}

function header(app, title, sub, hint) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  ctx.fillStyle = '#171310';
  ctx.fillRect(0, 0, w, 148);
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(0, 0, 7, 148);
  text(ctx, title || '边陲小镇', PAD, 20, { size: 42, color: '#f0c060' });
  text(ctx, sub || '', PAD + 4, 78, { size: 18, color: '#a2947a' });
  if (hint) text(ctx, hint, PAD + 4, 108, { size: 15, color: '#8a8070' });
}

function statusBar(app, y) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;
  const p = st.player;
  const info = border.poolInfo(st);
  const count = army.troopCount(p.troops || {});
  const cap = stateLib.capacity(st);
  const cells = [
    { k: '金钱', v: p.gold, c: '#f0c060' },
    { k: '粮草', v: p.food, c: '#c8b478' },
    { k: '兵力', v: count + ' / ' + cap, c: count >= cap ? '#d06a4a' : '#8fb0d8' },
    { k: '本周义军', v: info.total + ' / 1000', c: '#c98f6a' },
    { k: '旧部驿站', v: border.stationLords(st).length + ' 人', c: '#b98fd8' },
    { k: '士气', v: p.morale, c: p.morale < 40 ? '#d06a4a' : '#8fbf7a' },
  ];
  ctx.fillStyle = '#1d1711';
  ctx.fillRect(0, y, w, 96);
  const cw = (w - PAD * 2) / cells.length;
  cells.forEach(function (it, i) {
    const x = PAD + i * cw;
    text(ctx, it.k, x, y + 10, { size: 13, color: '#8a8070' });
    text(ctx, String(it.v), x, y + 38, { size: 16, color: it.c });
  });
  bar(ctx, PAD, y + 74, w - PAD * 2, 8, p.morale / 100,
    p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);
  return y + 106;
}

function menuItem(app, y, label, sub, right, onTap, opts) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const o = opts || {};
  const h = o.h || 104;
  app.ui.button(ctx, PAD, y, w - PAD * 2, h, '', {
    id: o.id || label,
    fill: o.fill || '#33271b',
    disabled: !!o.disabled,
    onTap: onTap,
  });
  text(ctx, label, PAD + 24, y + 20, {
    size: 28, color: o.disabled ? '#6a6355' : '#efe3c6',
  });
  if (sub) text(ctx, sub, PAD + 24, y + 60, {
    size: 17, color: o.disabled ? '#5c5648' : '#a2947a',
  });
  if (right) text(ctx, right, w - PAD - 22, y + 32, {
    size: 20, align: 'right', color: o.disabled ? '#5c5648' : '#f0c060',
  });
  return y + h + 14;
}

const BorderScene = {
  enter(app, params) {
    this.view = (params && params.view) || 'menu';
    this.page = 0;
  },

  renderLocked(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    drawBackdrop(ctx, 'city', w, h, 31);
    ctx.fillStyle = 'rgba(9,8,7,0.66)';
    ctx.fillRect(0, 0, w, h);

    const bx = 34;
    const by = Math.max(80, h * 0.22);
    const bw = w - bx * 2;
    const bh = Math.min(560, h - by - 80);
    panel(ctx, bx, by, bw, bh, { fill: '#171310' });
    text(ctx, '边陲小镇', bx + 24, by + 24, { size: 40, color: '#f0c060' });
    text(ctx, '镇口 · 雾未散', bx + 26, by + 78, { size: 17, color: '#8a8070' });

    const lines = [
      '你刚走进镇口，街边的说话声就停了。',
      '周围的人非常警惕地看着你，手都按在刀柄上；',
      '肉铺的屠夫把刀在磨石上来回蹭了两下，眼睛没离开你的脖子。',
      '「这里不欢迎外人。」有人低声说。你被赶了出去。',
    ];
    let y = by + 122;
    lines.forEach(function (line) {
      const ls = wrap(ctx, line, bw - 52, 20, 'bold');
      ls.forEach(function (s) {
        text(ctx, s, bx + 26, y, { size: 20, color: '#c9bda2' });
        y += 31;
      });
      y += 6;
    });

    const btnY = by + bh - 86;
    app.ui.button(ctx, bx + 28, btnY, bw - 56, 64, '离开这里', {
      id: 'border_leave_locked', size: 26, fill: '#3a2418',
      onTap: function () {
        app.state.player.atSiteId = null;
        app.showToast('你被镇民赶出了小镇。', 2.4);
        app.pop();
      },
    });
  },

  renderMenu(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const p = st.player;
    const site = siteOf(app);
    const info = border.poolInfo(st);
    const station = border.stationLords(st);
    drawBackdrop(ctx, 'city', w, h, 17);
    ctx.fillStyle = 'rgba(10,8,6,0.58)';
    ctx.fillRect(0, 0, w, h);
    header(app, '边陲小镇', '复国落脚地 · 每月 1000 金 / 400 粮 · 其他城池另算', '镇口的猎户认得你的旗。');
    let y = statusBar(app, 148);

    y = menuItem(app, y, '招募义军',
      'T1 到 T5 · 每周 1000 人，七天整池刷新',
      info.total + ' / 1000', function () { app.top().scene.view = 'recruit'; },
      { id: 'border_recruit' });
    y = menuItem(app, y, '购买粮草',
      '固定 5 金 / 单位 · 不设货架上架，不卡普通粮车上限',
      '现有 ' + p.food, function () { app.top().scene.view = 'food'; },
      { id: 'border_food' });
    y = menuItem(app, y, '驿站 · 旧部',
      station.length ? '打散的旧部在这里等领 · 免费归队' : '还没有旧部回来',
      station.length + ' 人', function () { app.top().scene.view = 'station'; },
      { id: 'border_station', disabled: !station.length });
    y = menuItem(app, y, p.resting === site.id ? '结束歇息' : '在镇中歇息',
      p.resting === site.id ? '收拾行装，准备出镇' : '粮耗减半 · 镇民替你望风',
      p.resting === site.id ? '歇息中' : '免费', function () {
        if (p.resting === site.id) {
          stateLib.stopRest(st);
          app.restView = null;
          app.showToast('收拾行装，准备出镇。', 2);
          return;
        }
        const r = stateLib.startRest(st, site);
        app.showToast(r.msg, 2.6);
        if (r.ok) {
          app.restView = site.id;
          app.pop();
        }
      }, { id: 'border_rest' });
    y = menuItem(app, y, '离开小镇',
      '回到大地图；镇外的叛军还在等你',
      '→', function () { app.pop(); }, { id: 'border_leave', fill: '#2b2018' });

    const footY = Math.min(h - 40, y + 2);
    text(ctx, '边陲小镇没有议和桌；叛军只认刀兵。', PAD, footY, {
      size: 15, color: '#8a8070',
    });
  },

  renderRecruit(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const info = border.poolInfo(st);
    drawBackdrop(ctx, 'city', w, h, 19);
    ctx.fillStyle = 'rgba(10,8,6,0.64)';
    ctx.fillRect(0, 0, w, h);
    header(app, '招募义军', '本周池 ' + info.total + ' / 1000 · 第 ' + info.nextRefreshDay + ' 天刷新');
    text(ctx, '队伍 ' + army.troopCount(st.player.troops || {}) + ' / ' + stateLib.capacity(st) +
      ' · T5 边陲也招，不问声望', PAD, 112, { size: 15, color: '#8a8070' });

    const startY = 164;
    const rowH = 102;
    border.RECRUIT_TIERS.forEach(function (row, i) {
      const y = startY + i * (rowH + 8);
      const t = TROOPS[row.troop] || {};
      const stock = (info.pool && info.pool[row.troop]) || 0;
      const price = border.priceFor(st, row.troop);
      panel(ctx, PAD, y, w - PAD * 2, rowH, { fill: i % 2 ? '#211a13' : '#251d15' });
      text(ctx, 'T' + row.tier + ' · ' + (t.name || row.troop), PAD + 18, y + 14, {
        size: 22, color: '#efe3c6',
      });
      text(ctx, '本周剩 ' + stock + ' · ' + price + ' 金 / 人', PAD + 18, y + 48, {
        size: 16, color: stock ? '#a2947a' : '#6a6050',
      });
      text(ctx, '编制 ' + row.count + ' 人', PAD + 18, y + 73, {
        size: 14, color: '#6f6552',
      });
      const bx = w - PAD - 232;
      [10, 50, 100].forEach(function (n, k) {
        const bw = 68;
        const x = bx + k * 76;
        app.ui.button(ctx, x, y + 22, bw, 58, '招' + n, {
          id: 'border_rec_' + row.troop + '_' + n,
          size: 18,
          fill: stock > 0 ? '#3a2b1b' : '#24201a',
          disabled: stock <= 0,
          onTap: function () {
            const r = border.recruit(st, row.troop, n);
            app.showToast(r.msg, 2.2);
          },
        });
      });
    });

    app.ui.button(ctx, PAD, h - 84, 150, 60, '← 返回', {
      id: 'border_rec_back', size: 22, fill: '#241c14',
      onTap: function () { app.top().scene.view = 'menu'; },
    });
  },

  renderFood(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const p = st.player;
    drawBackdrop(ctx, 'city', w, h, 23);
    ctx.fillStyle = 'rgba(10,8,6,0.64)';
    ctx.fillRect(0, 0, w, h);
    header(app, '粮草 · 5 金 / 单位', '不设货架上限 · 买多少给多少');
    panel(ctx, PAD, 164, w - PAD * 2, 220, { fill: '#201a14' });
    text(ctx, '现有粮草', PAD + 22, 184, { size: 17, color: '#8a8070' });
    text(ctx, String(p.food), PAD + 22, 214, { size: 40, color: '#c8b478' });
    text(ctx, '现有金钱', PAD + 22, 278, { size: 17, color: '#8a8070' });
    text(ctx, String(p.gold), PAD + 22, 308, { size: 30, color: '#f0c060' });
    text(ctx, '边陲粮车不按普通粮车上限截断；' + border.FOOD_PRICE + ' 金一个单位。',
      PAD + 22, 354, { size: 15, color: '#a2947a' });

    const amounts = [10, 100, 1000, Math.max(1, Math.floor(p.gold / border.FOOD_PRICE))];
    const labels = ['买 10', '买 100', '买 1000', '买光金钱'];
    const bw = (w - PAD * 2 - 24) / 4;
    amounts.forEach(function (n, i) {
      const x = PAD + i * (bw + 8);
      app.ui.button(ctx, x, 448, bw, 72, labels[i], {
        id: 'border_food_' + i,
        size: 17,
        fill: p.gold >= n * border.FOOD_PRICE ? '#3a2b1b' : '#241f18',
        disabled: p.gold < n * border.FOOD_PRICE,
        onTap: function () {
          const r = border.buyFood(st, n);
          app.showToast(r.msg, 2.2);
        },
      });
      text(ctx, '−' + n * border.FOOD_PRICE + ' 金', x, 530, {
        size: 14, color: '#8a8070',
      });
    });

    text(ctx, '每月补给 1000 金 / 400 粮；攻占的其他城池按普通税赋另算。',
      PAD, 610, { size: 16, color: '#a2947a' });
    app.ui.button(ctx, PAD, h - 84, 150, 60, '← 返回', {
      id: 'border_food_back', size: 22, fill: '#241c14',
      onTap: function () { app.top().scene.view = 'menu'; },
    });
  },

  renderStation(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    drawBackdrop(ctx, 'city', w, h, 27);
    ctx.fillStyle = 'rgba(10,8,6,0.66)';
    ctx.fillRect(0, 0, w, h);
    const list = border.stationLords(st);
    header(app, '驿站 · 旧部', '打散的旧部会自己回镇 · 免费重新入队');
    text(ctx, '在驿站的旧部：' + list.length + ' 人', PAD, 112, {
      size: 17, color: '#a2947a',
    });

    if (!list.length) {
      panel(ctx, PAD, 174, w - PAD * 2, 170, { fill: '#201a14' });
      text(ctx, '驿站里没有旧部。', PAD + 22, 202, { size: 24, color: '#efe3c6' });
      text(ctx, '从你队伍里出去的领主不会变成叛军；他们被打散后会回到这里。',
        PAD + 22, 248, { size: 17, color: '#a2947a' });
    } else {
      const pageSize = 4;
      const maxPage = Math.max(0, Math.ceil(list.length / pageSize) - 1);
      this.page = Math.max(0, Math.min(maxPage, this.page || 0));
      const page = list.slice(this.page * pageSize, this.page * pageSize + pageSize);
      page.forEach(function (item, i) {
        const y = 164 + i * 174;
        panel(ctx, PAD, y, w - PAD * 2, 160, { fill: i % 2 ? '#211a13' : '#251d15' });
        text(ctx, item.name, PAD + 20, y + 14, { size: 24, color: '#efe3c6' });
        text(ctx, item.title + ' · 免费归队', PAD + 20, y + 48, {
          size: 15, color: '#c9a05a',
        });
        const lines = wrap(ctx, '“' + item.complaint + '”', w - PAD * 2 - 196, 16, 'bold');
        lines.slice(0, 2).forEach(function (line, k) {
          text(ctx, line, PAD + 20, y + 76 + k * 24, { size: 16, color: '#a2947a' });
        });
        app.ui.button(ctx, w - PAD - 164, y + 52, 136, 56, '免费招募', {
          id: 'border_station_recruit_' + item.lord.id,
          size: 18,
          fill: '#3a2b1b',
          onTap: function () {
            const r = border.recruitStationLord(st, item.lord.id);
            app.showToast(r.msg, 3.6);
          },
        });
      });
      if (list.length > pageSize) {
        app.ui.button(ctx, PAD, h - 84, 120, 58, '上一页', {
          id: 'border_station_prev', size: 18, fill: '#241c14',
          disabled: this.page <= 0,
          onTap: function () { const s = app.top().scene; s.page = Math.max(0, s.page - 1); },
        });
        app.ui.button(ctx, PAD + 132, h - 84, 120, 58, '下一页', {
          id: 'border_station_next', size: 18, fill: '#241c14',
          disabled: this.page >= maxPage,
          onTap: function () { const s = app.top().scene; s.page = Math.min(maxPage, s.page + 1); },
        });
      }
    }

    app.ui.button(ctx, w - PAD - 150, h - 84, 150, 60, '← 返回', {
      id: 'border_station_back', size: 22, fill: '#241c14',
      onTap: function () { app.top().scene.view = 'menu'; },
    });
  },

  render(app) {
    const st = app.state;
    if (!st) { app.replace('title'); return; }
    if (!border.unlocked(st)) return this.renderLocked(app);
    if (this.view === 'recruit') return this.renderRecruit(app);
    if (this.view === 'food') return this.renderFood(app);
    if (this.view === 'station') return this.renderStation(app);
    return this.renderMenu(app);
  },
};

module.exports = BorderScene;
