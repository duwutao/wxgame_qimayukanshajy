/**
 * 城池 / 村庄 / 匪巢界面
 * 布局：顶部城名 → 自己状态条（金/粮/兵/望/简/士气）→ 大按钮菜单 → 子页
 * 子页：招兵 / 市场（粮草·军械）/ 酒馆 / 领主府
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const pixel = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const economy = require('../core/economy.js');
const trade = require('../core/trade.js');
const heroes = require('../core/heroes.js');
const army = require('../core/army.js');
const tourney = require('../core/tourney.js');
const { siteById, regionDef } = require('../core/world.js');
const { TROOPS } = require('../data/troops.js');
const { FACTIONS, EQUIPMENT } = require('../data/china.js');
const { GOODS, VILLAGE_FOOD } = require('../data/extra.js');
const flows = require('./flows.js');

const PAD = 16;

function money(v) { return v + ' 金'; }

function header(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const fac = site.ownerFaction ? FACTIONS[site.ownerFaction] : null;

  ctx.fillStyle = '#171310';
  ctx.fillRect(0, 0, w, 148);
  ctx.fillStyle = fac ? fac.color : '#6a655c';
  ctx.fillRect(0, 0, 7, 148);

  text(ctx, site.name, PAD, 22, { size: 42, color: '#f0c060' });
  const typeName = site.type === 'town' ? '城' : site.type === 'castle' ? '关隘' : site.type === 'village' ? '村' : '贼巢';
  text(ctx, typeName + ' · ' + (fac ? fac.full : '无主') + ' · ' + (regionDef(site.region) || {}).name, PAD + 4, 78, {
    size: 19, color: '#a2947a',
  });
  const lines = wrap(ctx, site.blurb || '', w - PAD * 2 - 8, 17, 'bold');
  text(ctx, lines[0] || '', PAD + 4, 106, { size: 17, color: '#c9bda2' });
}

/** 自己的状态条：这是城池界面最该看到的东西 */
function statusBar(app, y) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const p = app.state.player;
  const count = army.troopCount(p.troops);
  const cap = stateLib.capacity(app.state);
  const need = Math.max(1, Math.round(army.foodPerDay(p.troops) * 2));
  const foodCap = army.foodCap(p.troops);

  ctx.fillStyle = '#1d1711';
  ctx.fillRect(0, y, w, 96);

  const cells = [
    { k: '金', v: p.gold, c: '#f0c060' },
    { k: '粮', v: p.food + ' / ' + foodCap, c: p.food < need * 3 ? '#d06a4a' : '#c8b478' },
    { k: '兵', v: count + ' / ' + cap, c: count >= cap ? '#d06a4a' : '#8fb0d8' },
    { k: '望', v: p.renown, c: '#c98f6a' },
    { k: '简', v: p.shi, c: '#b98fd8' },
    { k: '气', v: p.morale, c: p.morale < 40 ? '#d06a4a' : '#8fbf7a' },
  ];
  const cw = (w - PAD * 2) / cells.length;
  cells.forEach(function (it, i) {
    const x = PAD + i * cw;
    text(ctx, it.k, x, y + 12, { size: 16, color: '#8a8070' });
    text(ctx, String(it.v), x, y + 38, { size: 20, color: it.c });
  });

  // 士气细条
  bar(ctx, PAD, y + 68, w - PAD * 2, 8, p.morale / 100, p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);

  return y + 106;
}

function backButton(app, y) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  app.ui.button(ctx, PAD, y, 150, 64, '← 返回', {
    id: 'back', size: 22, onTap: function () { app.townView.view = 'menu'; },
  });
}

function menuButton(app, y, label, sub, onTap, opts) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = 104;
  const o = opts || {};
  app.ui.button(ctx, PAD, y, w - PAD * 2, h, '', {
    id: opts.id || label, disabled: !!o.disabled,
    fill: o.fill || '#33271b',
    onTap: onTap,
  });
  text(ctx, label, PAD + 26, y + 24, { size: 30, color: o.disabled ? '#6a6355' : '#efe3c6' });
  if (sub) text(ctx, sub, PAD + 26, y + 64, { size: 18, color: o.disabled ? '#5c5648' : '#a2947a' });
  if (o.right) text(ctx, o.right, w - PAD - 24, y + 36, { size: 24, align: 'right', color: o.disabled ? '#5c5648' : '#f0c060' });
  return y + h + 16;
}

/* ---------------------------------------------------------------- 菜单 */

/** 菜单项：列成一张表，整页可以上下拖，选项再多也放得下 */
function menuItems(app, site) {
  const p = app.state.player;
  const resting = !!p.resting;
  const isVillage = site.type === 'village';
  const list = [];
  const toggleRest = function () {
    if (resting) {
      stateLib.stopRest(app.state);
      app.restView = null;
      app.showToast('收拾行装，准备上路。', 2);
      app.pop();
    } else {
      const r = stateLib.startRest(app.state, site);
      app.showToast(r.msg, 2.4);
      if (r.ok) {
        // 跟骑砍一样：选"修养"就直接出门看大地图，时辰照走，点一下再回城
        app.restView = site.id;
        app.pop();
      }
    }
  };

  if (isVillage) {
    list.push({
      id: 'm_recruit', label: '招兵', sub: '村里的壮丁 · 只有最低一档，比城里便宜', right: '→',
      onTap: function () { app.townView.view = 'recruit'; },
    });
    list.push({
      id: 'm_village', label: '村市 · 找村长', sub: '牛、羊、鸡、谷，村里卖得比城里便宜',
      right: '粮 ' + Math.round(40 * (site.priceIndex || 1) * 0.85) + ' 金',
      onTap: function () { app.townView.view = 'village'; },
    });
    list.push({
      id: 'm_raid', label: '屠村', sub: '抢钱抢粮，村子会记很久（关系 -5）', fill: '#3a2018', right: '→',
      onTap: function () {
        const r = stateLib.raidVillage(app.state, site);
        app.showToast(r.msg, 2.6);
        if (r.ok) app.townView.view = 'menu';
      },
    });
    list.push({
      id: 'm_rest', label: resting ? '结束休整 · 上路' : '在村里歇下',
      sub: '外面的日子照常过，你的粮吃得慢一半，也没人来追', fill: '#26372a',
      right: resting ? '休整中 · 粮耗减半' : '→', onTap: toggleRest,
    });
    const hermit = stateLib.hiddenLordsAt(app.state, site.id).filter(function (l) {
      return stateLib.hiddenLordVisible(app.state, l);
    })[0];
    if (hermit) {
      list.push({
        id: 'm_hermit', label: '村中隐者 · ' + hermit.name, sub: '前朝的旗倒了，人还活着。也许能请得动',
        fill: '#2c2a40', right: '见一面', onTap: function () { app.townView.view = 'hermit'; },
      });
    }
  } else {
    list.push({
      id: 'm_recruit', label: '招兵', sub: '花钱买人，价钱随城而变', right: '→',
      onTap: function () { app.townView.view = 'recruit'; },
    });
    list.push({
      id: 'm_market', label: '市场', sub: '粮草 · 货物 · 军械',
      right: '粮 ' + economy.foodPrice(site) + ' 金/单位',
      onTap: function () { app.townView.view = 'market'; app.townView.tab = 'food'; },
    });
    list.push({
      id: 'm_tavern', label: '酒馆', sub: '接活 · 打听消息 · 招募英雄', right: '→',
      onTap: function () { app.townView.view = 'tavern'; },
    });
    list.push({
      id: 'm_hall', label: '领主府', sub: '效忠 · 宣战 · 情报',
      right: site.ownerFaction ? FACTIONS[site.ownerFaction].full : '无主',
      onTap: function () { app.townView.view = 'hall'; },
    });
    list.push({
      id: 'm_tourney', label: '比武大会', sub: '四招赌手 · 三滴血，赢钱赢名声，不杀人', fill: '#3a2c1e',
      right: (app.state.tourney && !app.state.tourney.done) ? '进行中' : '报名 ' + tourney.fee(app.state) + ' 金',
      onTap: function () { app.push('tourney', { siteId: site.id }); },
    });
    const obj = stateLib.campaignObjective(app.state, site);
    if (obj) {
      const count = army.troopCount(p.troops);
      const ready = !obj.needTroops || count >= obj.needTroops;
      list.push({
        id: 'm_campaign', label: '发起进攻 · ' + obj.name,
        sub: ready ? '点下去就开打，输了可以退回来再来' : '至少要有 ' + obj.needTroops + ' 人才打得动（现 ' + count + '）',
        fill: '#4a241c', right: ready ? '→' : '兵不足', disabled: !ready,
        onTap: function () {
          const b = stateLib.startCampaignBattle(app.state, obj.id);
          if (!b) { app.showToast('现在还打不了。'); return; }
          app.state.flags.campaignCool = stateLib.gameHours(app.state) + 24;
          app.push('battle', { mode: 'campaign', campaignId: b.context.campaignId });
        },
      });
    }
    list.push({
      id: 'm_rest', label: resting ? '结束休整 · 上路' : '进城休整',
      sub: resting ? '再点一下就收拾行装，回大地图' : '选了就出城看天下：时辰照走，粮耗减半，没人追你',
      fill: '#26372a',
      right: resting ? '休整中 · 粮耗减半' : '→', onTap: toggleRest,
    });
  }
  return list;
}

function renderMenu(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  const p = app.state.player;
  let y = 280;

  if (site.type === 'camp') {
    text(ctx, '这里是一处贼巢。攻破它，你的名字会传出去。', PAD, y - 40, { size: 19, color: '#c9bda2' });
    app.ui.button(ctx, PAD, y, w - PAD * 2, 96, '进攻贼巢', {
      id: 'attack', size: 30, fill: '#4a241c', onTap: function () {
        stateLib.startSiege(app.state, site);
        app.push('battle', { mode: 'siege' });
      },
    });
    return;
  }

  const items = menuItems(app, site);
  const rowH = 104;
  const gap = 14;
  const contentH = items.length * (rowH + gap);
  // 下面留出"离城"的固定按钮 + 回城提示，菜单只在这条线以上滚
  const footTop = H - 170;
  const viewH = Math.max(120, footTop - y - 8);
  const maxScroll = Math.max(0, contentH - viewH);
  if (app.townView.scroll === undefined) app.townView.scroll = 0;
  app.townView.scroll = Math.max(0, Math.min(maxScroll, app.townView.scroll));
  app.townView.maxScroll = maxScroll;
  app.townView.viewH = viewH;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y - 4, w, viewH + 8);
  ctx.clip();
  items.forEach(function (it, i) {
    const ry = y + i * (rowH + gap) - app.townView.scroll;
    // 只画完整的一行：半截露在"离城"上方很难看
    if (ry < y || ry + rowH > y + viewH) return;
    app.ui.button(ctx, PAD, ry, w - PAD * 2, rowH, '', {
      id: it.id || it.label, disabled: !!it.disabled,
      fill: it.fill || '#33271b',
      onTap: it.onTap,
    });
    text(ctx, it.label, PAD + 26, ry + 24, { size: 30, color: it.disabled ? '#6a6355' : '#efe3c6' });
    if (it.sub) {
      // 一行放不下就截断，别让说明文字压到底下的"离城"
      const subMax = w - PAD * 2 - 60;
      const subLines = wrap(ctx, it.sub, subMax, 18);
      let sub = subLines[0] || '';
      if (subLines.length > 1) sub = sub.replace(/[，、。·]$/, '') + '…';
      text(ctx, sub, PAD + 26, ry + 64, { size: 18, color: it.disabled ? '#5c5648' : '#a2947a' });
    }
    if (it.right) text(ctx, it.right, w - PAD - 24, ry + 36, {
      size: 24, align: 'right', color: it.disabled ? '#5c5648' : '#f0c060',
    });
  });
  ctx.restore();

  // 滚动条：看得出还有几项在下面
  if (maxScroll > 0) {
    const trackY = y;
    const trackH = viewH;
    ctx.fillStyle = 'rgba(80,66,46,0.35)';
    ctx.fillRect(w - 8, trackY, 4, trackH);
    const thumbH = Math.max(36, trackH * (viewH / contentH));
    const thumbY = trackY + (trackH - thumbH) * (app.townView.scroll / maxScroll);
    ctx.fillStyle = '#8a7448';
    ctx.fillRect(w - 8, thumbY, 4, thumbH);
  }

  // 离城：固定在最下面，随时能出门
  app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '离城', {
    id: 'leave', size: 28, fill: '#241c14', onTap: function () {
      if (app.state.player.resting) stateLib.stopRest(app.state);
      app.state.player.atSiteId = null;
      app.pop();
    },
  });
  text(ctx, maxScroll > 0
    ? '上下拖动看更多 · 还有 ' + (maxScroll > 0 ? Math.max(1, Math.ceil((maxScroll - app.townView.scroll) / (rowH + gap))) : 0) + ' 项在下头'
    : (p.atSiteId ? '离城后回到大地图，再点这座城还能进来' : ''), w / 2, H - 138, {
    size: 14, align: 'center', color: maxScroll > 0 ? '#c0a46a' : '#6a6050',
  });
}

/* ---------------------------------------------------------------- 招兵 */

function renderRecruit(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;
  const p = st.player;

  text(ctx, '可招募', PAD, 300, { size: 26, color: '#f0c060' });
  text(ctx, '队伍 ' + army.troopCount(p.troops) + ' / ' + stateLib.capacity(st), w - PAD, 306, {
    size: 18, align: 'right', color: '#a2947a',
  });

  let list = site.recruitList || [];
  // 村庄只出最低一档的壮丁
  if (site.type === 'village') {
    list = ['militia'];
    if (!site.recruits.militia || site.recruits.militia <= 0) site.recruits.militia = 3;
  }
  let y = 340;

  if (!list.length) {
    text(ctx, '这里不卖人。', PAD, y + 20, { size: 22, color: '#a2947a' });
  }

  list.forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    const stock = site.recruits[id] || 0;
    const price = economy.recruitPrice(site, id);
    const locked = t.renownReq && p.renown < t.renownReq;

    panel(ctx, PAD, y, w - PAD * 2, 104, { fill: '#241c14' });
    text(ctx, t.name, PAD + 18, y + 14, { size: 26, color: locked ? '#7a7160' : '#efe3c6' });
    text(ctx, '攻 ' + t.atk + ' / 防 ' + t.def + ' / 粮 ' + t.food, PAD + 150, y + 20, { size: 16, color: '#a2947a' });
    text(ctx, locked ? '需声望 ' + t.renownReq : '余 ' + stock + ' 人', PAD + 18, y + 58, {
      size: 17, color: locked ? '#b4463c' : stock > 0 ? '#8fbf7a' : '#7a7160',
    });
    text(ctx, price + ' 金/人', PAD + 150, y + 58, { size: 18, color: '#f0c060' });

    if (!locked && stock > 0) {
      app.ui.button(ctx, w - PAD - 190, y + 22, 86, 58, '招 1', {
        id: 'r1_' + id, size: 22, onTap: function () {
          const r = economy.recruit(st, site, id, 1);
          app.showToast(r.msg, 2.2);
        },
      });
      app.ui.button(ctx, w - PAD - 96, y + 22, 86, 58, '招 5', {
        id: 'r5_' + id, size: 22, disabled: stock < 5, onTap: function () {
          const r = economy.recruit(st, site, id, 5);
          app.showToast(r.msg, 2.2);
        },
      });
    }
    y += 116;
  });

  backButton(app, y + 4);
}

/* ---------------------------------------------------------------- 市场 */

/* ---------------------------------------------------------------- 货物 */

/** 货物总览：十种货，两列五行，点开看单品 */
function renderGoods(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const p = app.state.player;
  const carried = trade.goodsCount(p);

  text(ctx, '驮队 ' + carried + ' / ' + trade.GOODS_CAP + ' 件', PAD, 388, { size: 21, color: '#efe3c6' });
  text(ctx, '这里只是货，不顶口粮：低价买进、别城卖出，赚的是转手的差价。', PAD, 362, {
    size: 15, color: '#c9a05a',
  });

  const top = 428;
  const cw = (w - PAD * 2 - 10) / 2;
  const rh = 96;

  GOODS.forEach(function (gd, i) {
    const cx = PAD + (i % 2) * (cw + 10);
    const cy = top + Math.floor(i / 2) * rh;
    const buy = trade.buyPrice(site, gd.id);
    const sell = trade.sellPrice(site, gd.id);
    const have = (p.goods || {})[gd.id] || 0;

    panel(ctx, cx, cy, cw, rh - 8, { fill: '#241c14' });
    text(ctx, gd.name, cx + 14, cy + 8, { size: 20, color: '#efe3c6' });
    text(ctx, '买 ' + buy + ' / 卖 ' + sell, cx + 14, cy + 36, { size: 16, color: '#f0c060' });
    text(ctx, '持有 ' + have, cx + 14, cy + 60, {
      size: 15, color: have > 0 ? '#8fbf7a' : '#6a6050',
    });
    text(ctx, '→', cx + cw - 22, cy + 30, { size: 22, color: '#8a8070' });

    app.ui.rect('good_' + gd.id, cx, cy, cw, rh - 8, function () {
      app.townView.goodId = gd.id;
      app.townView.estimate = null;
    });
  });

  backButton(app, h - 84);
}

/** 单品交易：买/卖几件，顺便估个价 */
function renderGoodOne(app, site, goodId) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;
  const p = st.player;
  const gd = trade.goodById(goodId);
  if (!gd) {
    app.townView.goodId = null;
    return;
  }
  const buy = trade.buyPrice(site, goodId);
  const sell = trade.sellPrice(site, goodId);
  const have = (p.goods || {})[goodId] || 0;

  text(ctx, gd.name, PAD, 358, { size: 30, color: '#f0c060' });
  text(ctx, '基准 ' + gd.base + ' 金 / ' + gd.unit, w - PAD, 364, { size: 16, align: 'right', color: '#8a8070' });
  wrap(ctx, gd.desc, w - PAD * 2, 16).slice(0, 2).forEach(function (ln, i) {
    text(ctx, ln, PAD, 400 + i * 24, { size: 16, color: '#a2947a' });
  });

  text(ctx, '本地买 ' + buy + ' 金', PAD, 460, { size: 22, color: '#f0c060' });
  text(ctx, '本地卖 ' + sell + ' 金', PAD + 220, 460, { size: 22, color: '#8fb0d8' });
  text(ctx, '持有 ' + have + ' · 驮队 ' + trade.goodsCount(p) + '/' + trade.GOODS_CAP, PAD, 498, {
    size: 18, color: '#efe3c6',
  });

  const bw = (w - PAD * 2 - 20) / 3;
  [1, 5, 10].forEach(function (n, i) {
    app.ui.button(ctx, PAD + i * (bw + 10), 540, bw, 68, '买 ' + n, {
      id: 'gb' + n, size: 22, onTap: function () {
        const r = trade.buyGoods(st, site, goodId, n);
        app.showToast(r.msg, 2.2);
      },
    });
    app.ui.button(ctx, PAD + i * (bw + 10), 618, bw, 68, '卖 ' + n, {
      id: 'gs' + n, size: 22, fill: '#241c14', disabled: have <= 0, onTap: function () {
        const r = trade.sellGoods(st, site, goodId, n);
        app.showToast(r.msg, 2.2);
      },
    });
  });

  app.ui.button(ctx, PAD, 700, w - PAD * 2, 68, '估价 · 哪里卖得贵', {
    id: 'g_est', size: 24, fill: '#3a2c1e', onTap: function () {
      app.townView.estimate = trade.estimate(st, site, goodId);
    },
  });

  // 估价结果
  const est = app.townView.estimate;
  if (est && est.ok) {
    let y = 786;
    if (!est.rows || !est.rows.length) {
      text(ctx, est.msg, PAD, y, { size: 17, color: '#a2947a' });
    } else {
      text(ctx, '本城 ' + est.here + ' 金 · 往这些城去：', PAD, y, { size: 17, color: '#a2947a' });
      y += 30;
      est.rows.forEach(function (row) {
        if (y > h - 150) return;
        text(ctx, row.site.name, PAD, y, { size: 19, color: '#efe3c6' });
        text(ctx, row.price + ' 金', PAD + 150, y, { size: 19, color: '#f0c060' });
        text(ctx, '每件多赚 ' + row.profit, PAD + 260, y, { size: 17, color: '#8fbf7a' });
        text(ctx, row.dist + ' 格', w - PAD, y, { size: 15, align: 'right', color: '#8a8070' });
        y += 34;
      });
    }
  }

  app.ui.button(ctx, PAD, h - 84, 150, 64, '← 货物', {
    id: 'g_back', size: 22, onTap: function () {
      app.townView.goodId = null;
      app.townView.estimate = null;
    },
  });
}

/* ---------------------------------------------------------------- 村市 */

/** 村长：牛、羊、鸡、谷，村里比城里便宜 */
function renderVillage(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;
  const p = st.player;

  text(ctx, '村市 · 村长', PAD, 296, { size: 26, color: '#f0c060' });
  text(ctx, '“牛不卖，除非你出得起。”', PAD, 332, { size: 17, color: '#a2947a' });
  text(ctx, '你的粮草 ' + p.food + ' 单位', w - PAD, 336, { size: 18, align: 'right', color: '#8fbf7a' });

  let y = 380;
  VILLAGE_FOOD.forEach(function (f) {
    const price = Math.round(f.price * (site.priceIndex || 1) * 0.85);
    panel(ctx, PAD, y, w - PAD * 2, 96, { fill: '#241c14' });
    text(ctx, f.name, PAD + 18, y + 10, { size: 24, color: '#efe3c6' });
    text(ctx, '+' + f.food + ' 口粮', PAD + 150, y + 16, { size: 18, color: '#a2947a' });
    const dl = wrap(ctx, f.desc, w - PAD * 2 - 200, 15)[0] || '';
    text(ctx, dl, PAD + 18, y + 50, { size: 15, color: '#8a8070' });
    text(ctx, price + ' 金', w - PAD - 142, y + 44, { size: 22, align: 'right', color: '#f0c060' });
    app.ui.button(ctx, w - PAD - 130, y + 22, 112, 54, '买', {
      id: 'vf_' + f.id, size: 22, disabled: p.gold < price, onTap: function () {
        const r = stateLib.buyVillageFood(st, site, f.id);
        app.showToast(r.msg, 2.2);
      },
    });
    y += 108;
  });

  backButton(app, h - 84);
}

function renderMarket(app, site, tab) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;

  const tabs = [
    { id: 'food', label: '粮草' },
    { id: 'goods', label: '货物' },
    { id: 'arms', label: '军械' },
  ];
  const tw = (w - PAD * 2) / 3;
  tabs.forEach(function (t, i) {
    const active = tab === t.id;
    const x = PAD + i * tw;
    ctx.fillStyle = active ? '#3a2c1e' : '#241c14';
    ctx.fillRect(x, 292, tw - 4, 56);
    ctx.fillStyle = active ? '#d9a441' : '#4a3826';
    ctx.fillRect(x, 292, tw - 4, 3);
    text(ctx, t.label, x + tw / 2 - 2, 306, { size: 24, align: 'center', color: active ? '#f0c060' : '#a2947a' });
    app.ui.rect('tab_' + t.id, x, 292, tw - 4, 56, function () {
      app.townView.tab = t.id;
      app.townView.goodId = null;
    });
  });

  if (tab === 'goods') {
    if (app.townView.goodId) renderGoodOne(app, site, app.townView.goodId);
    else renderGoods(app, site);
    return;
  }

  if (tab === 'food') {
    const price = economy.foodPrice(site);
    const sell = economy.foodSellPrice(site);
    text(ctx, '粮价 ' + price + ' 金 · 卖出 ' + sell + ' 金', PAD, 372, { size: 24, color: '#efe3c6' });
    text(ctx, '你的粮草：' + st.player.food + ' 单位', PAD, 410, { size: 20, color: st.player.food < 40 ? '#d06a4a' : '#8fbf7a' });
    text(ctx, '每两天吃掉 ' + Math.max(1, Math.round(army.foodPerDay(st.player.troops) * 2)) + ' 单位', PAD, 442, { size: 17, color: '#a2947a' });

    const amounts = [10, 50];
    amounts.forEach(function (n, i) {
      app.ui.button(ctx, PAD, 486 + i * 92, 220, 72, '买 ' + n + ' 粮', {
        id: 'buy' + n, size: 24, onTap: function () {
          const r = economy.buyFood(st, site, n);
          app.showToast(r.msg, 2.2);
        },
      });
      app.ui.button(ctx, PAD + 236, 486 + i * 92, 220, 72, '卖 ' + n + ' 粮', {
        id: 'sell' + n, size: 24, fill: '#241c14', onTap: function () {
          const r = economy.sellFood(st, site, n);
          app.showToast(r.msg, 2.2);
        },
      });
    });
    text(ctx, '满载上限 ' + army.foodCap(st.player.troops) + ' 单位（兵力 ' + army.troopCount(st.player.troops) + '）。长途行军前多带一点。', PAD, 690, { size: 16, color: '#8a8070' });
    backButton(app, 740);
    return;
  }

  // 军械
  const slots = ['blade', 'armor', 'horse'];
  let y = 372;
  slots.forEach(function (slot) {
    const eq = EQUIPMENT[slot];
    const cur = economy.equipmentTier(st, slot);
    const next = economy.nextEquipment(st, slot);
    panel(ctx, PAD, y, w - PAD * 2, 104, { fill: '#241c14' });
    text(ctx, eq.name, PAD + 18, y + 12, { size: 20, color: '#a2947a' });
    text(ctx, cur.name, PAD + 96, y + 10, { size: 26, color: '#efe3c6' });
    text(ctx, next ? '下一档：' + next.name + ' · ' + next.price + ' 金' : '已是顶配', PAD + 18, y + 58, {
      size: 17, color: next ? '#f0c060' : '#8a8070',
    });
    if (next) {
      app.ui.button(ctx, w - PAD - 150, y + 24, 132, 56, '换装', {
        id: 'up_' + slot, size: 22, disabled: st.player.gold < next.price, onTap: function () {
          const r = economy.upgradeEquipment(st, slot);
          app.showToast(r.msg, 2.2);
        },
      });
    }
    y += 116;
  });
  text(ctx, '装备加成作用于整支队伍，不只是一场。', PAD, y + 10, { size: 16, color: '#8a8070' });
  backButton(app, y + 52);
}

/* ---------------------------------------------------------------- 酒馆 */

function renderTavern(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;

  text(ctx, '酒馆', PAD, 296, { size: 26, color: '#f0c060' });
  const mine = st.quests.filter(function (q) { return !q.done; });
  text(ctx, '手上 ' + mine.length + ' 件事', w - PAD, 302, { size: 18, align: 'right', color: '#a2947a' });

  let y = 340;
  if (!mine.length) {
    text(ctx, '柜台后的人抬头看了你一眼：“没活。过几天再来。”', PAD, y + 10, { size: 19, color: '#a2947a' });
    app.ui.button(ctx, PAD, y + 60, w - PAD * 2, 80, '打听一桩事', {
      id: 'ask', size: 26, onTap: function () {
        const q = stateLib.offerQuest(st, site);
        app.showToast(q ? '接下来的事：' + q.title : '今天没人找你办事。', 2.4);
      },
    });
  } else {
    mine.forEach(function (q) {
      panel(ctx, PAD, y, w - PAD * 2, 126, { fill: '#241c14' });
      text(ctx, q.title, PAD + 18, y + 12, { size: 24, color: '#efe3c6' });
      const lines = wrap(ctx, q.text, w - PAD * 2 - 36, 16, 'bold');
      text(ctx, lines[0] || '', PAD + 18, y + 48, { size: 16, color: '#a2947a' });
      text(ctx, '赏 ' + q.reward.gold + ' 金 · ' + q.reward.renown + ' 望', PAD + 18, y + 84, {
        size: 17, color: '#f0c060',
      });
      if (q.type === 'grain') {
        app.ui.button(ctx, w - PAD - 150, y + 34, 132, 56, '交粮', {
          id: 'dg_' + q.id, size: 20, onTap: function () {
            const r = stateLib.deliverGrain(st, q);
            app.showToast(r.msg, 2.2);
          },
        });
      }
      y += 138;
    });
    app.ui.button(ctx, PAD, y, w - PAD * 2, 76, '再接一桩', {
      id: 'ask2', size: 24, onTap: function () {
        const q = stateLib.offerQuest(st, site);
        app.showToast(q ? '接下来的事：' + q.title : '今天没活了。', 2.4);
      },
    });
    y += 90;
  }

  // 英雄：在酒馆里坐着的不起眼的人
  const offers = heroes.offersAt(st, site);
  if (offers.length) {
    text(ctx, '角落里坐着的人', PAD, y + 6, { size: 20, color: '#a2947a' });
    const cap = heroes.heroCap(st);
    text(ctx, '随行 ' + st.player.heroes.length + ' / ' + cap, w - PAD, y + 8, {
      size: 15, align: 'right', color: st.player.heroes.length >= cap ? '#d06a4a' : '#8a8070',
    });
    y += 40;
    offers.slice(0, 2).forEach(function (h) {
      panel(ctx, PAD, y, w - PAD * 2, 150, { fill: '#201a14' });
      text(ctx, h.name, PAD + 18, y + 12, { size: 26, color: '#efe3c6' });
      text(ctx, '1-10 级 · 随队不死 · 打仗涨级', PAD + 150, y + 20, { size: 15, color: '#8a8070' });
      wrap(ctx, h.bio, w - PAD * 2 - 200, 15).slice(0, 2).forEach(function (ln, i) {
        text(ctx, ln, PAD + 18, y + 52 + i * 22, { size: 15, color: '#a2947a' });
      });
      const b = heroes.bonusOf(h.id, 1);
      text(ctx, '带的加成：' + (b.label || '无'), PAD + 18, y + 102, { size: 13, color: '#8fb0d8' });
      text(ctx, h.cost + ' 金', w - PAD - 150, y + 62, { size: 22, color: '#f0c060' });
      app.ui.button(ctx, w - PAD - 120, y + 88, 104, 52, '招募', {
        id: 'hero_' + h.id, size: 20, disabled: st.player.gold < h.cost, onTap: function () {
          const r = heroes.hireHero(st, site, h.id);
          app.showToast(r.msg, 2.4);
        },
      });
      y += 164;
    });
  }

  // 传闻
  const reg = regionDef(site.region);
  text(ctx, '“' + (reg ? reg.flavor : '') + '”', PAD, y + 40, { size: 17, color: '#8a8070' });

  // 打听前朝旧主的下落：一次 40 金，问出一个人藏在哪个村
  const unknown = st.lords.filter(function (l) {
    return l.hidden && l.hidden.siteId && (!st.knownHidden || !st.knownHidden[l.id]);
  });
  if (unknown.length) {
    app.ui.button(ctx, PAD, y + 76, w - PAD * 2, 76, '打听前朝旧主的下落 · 40 金', {
      id: 'rumor', size: 22, fill: '#241c14', disabled: st.player.gold < 40, onTap: function () {
        const r = stateLib.tavernRumor(st);
        app.showToast(r.msg, 3);
      },
    });
    backButton(app, y + 168);
    return;
  }

  backButton(app, y + 90);
}

/* ---------------------------------------------------------------- 村中隐者 */

function renderHermit(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;
  const lord = stateLib.hiddenLordsAt(st, site.id)[0];

  text(ctx, '村中隐者', PAD, 296, { size: 26, color: '#f0c060' });

  if (!lord) {
    text(ctx, '人已经走了。', PAD, 360, { size: 20, color: '#a2947a' });
    backButton(app, h - 84);
    return;
  }

  const f = FACTIONS[lord.hidden.faction];
  const rel = st.relations[lord.hidden.faction] || 0;

  panel(ctx, PAD, 350, w - PAD * 2, 168, { fill: '#241c14' });
  text(ctx, lord.name, PAD + 18, 362, { size: 30, color: '#efe3c6' });
  text(ctx, (f ? f.full : '故国') + ' · ' + (lord.title || '旧将'), PAD + 18, 404, { size: 17, color: '#a2947a' });
  text(ctx, '“' + (f ? f.full : '故国') + '都亡了，我还提刀做什么。”', PAD + 18, 440, { size: 18, color: '#c9bda2' });
  text(ctx, '村里人对你的态度 ' + rel + '（要 60 才肯替你说话）', PAD + 18, 476, { size: 15, color: rel >= 60 ? '#8fbf7a' : '#d06a4a' });

  app.ui.button(ctx, PAD, 546, w - PAD * 2, 86, '请他出山 · 跟我走', {
    id: 'hermit_hire', size: 26, fill: '#2c2a40', onTap: function () {
      const r = stateLib.recruitHiddenLord(st, site.id);
      app.showToast(r.msg, 3);
      if (r.ok) app.townView.view = 'menu';
    },
  });
  app.ui.button(ctx, PAD, 646, w - PAD * 2, 74, '算了 · 不打扰', {
    id: 'hermit_no', size: 24, fill: '#241c14', onTap: function () {
      app.townView.view = 'menu';
    },
  });

  text(ctx, '成了他会带半副甲跟你走；不成，他也不想再扛旗了。', PAD, 736, { size: 15, color: '#8a8070' });
}

/* ---------------------------------------------------------------- 领主府 */

function renderHall(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;
  const p = st.player;
  const f = site.ownerFaction;

  text(ctx, '领主府', PAD, 296, { size: 26, color: '#f0c060' });

  if (!f) {
    text(ctx, '这里没有旗，也没有官。', PAD, 350, { size: 21, color: '#a2947a' });
    backButton(app, 420);
    return;
  }

  const fac = FACTIONS[f];
  const rel = stateLib.relationOf(st, f);
  const hostile = stateLib.isHostileFaction(st, f);

  text(ctx, fac.full + ' · ' + fac.name, PAD, 342, { size: 30, color: fac.color });
  text(ctx, fac.desc, PAD, 386, { size: 17, color: '#a2947a' });
  text(ctx, '关系 ' + rel, PAD, 424, { size: 20, color: rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#c9bda2' });
  bar(ctx, PAD, 456, w - PAD * 2, 10, (rel + 100) / 200, rel < -25 ? UI_COLORS.danger : rel > 25 ? UI_COLORS.good : UI_COLORS.accent);

  let y = 490;

  if (!p.faction && !hostile) {
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88, p.renown < 60 ? '效忠（需声望 60）' : '效忠' + fac.full, {
      id: 'join', size: 26, disabled: p.renown < 60, onTap: function () {
        const r = stateLib.joinFaction(st, site);
        app.showToast(r.msg, 2.4);
      },
    });
    y += 100;
  }

  if (p.faction && p.faction !== f) {
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88, '向' + fac.full + '宣战', {
      id: 'war', size: 26, fill: '#3a2018', onTap: function () {
        const r = stateLib.declareWar(st, site);
        app.showToast(r.msg, 2.4);
      },
    });
    y += 100;
  }

  if (hostile) {
    text(ctx, '你和他们已经在打仗。走近城门就会被攻击。', PAD, y, { size: 18, color: '#d06a4a' });
    y += 40;
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88, '攻城', {
      id: 'siege', size: 26, fill: '#4a241c', onTap: function () {
        stateLib.startSiege(st, site);
        app.push('battle', { mode: 'siege' });
      },
    });
    y += 100;
  }

  // 情报：该势力的领主
  const lords = st.lords.filter(function (l) { return l.faction === f && l.alive; });
  text(ctx, '麾下领主', PAD, y + 6, { size: 20, color: '#a2947a' });
  y += 40;
  lords.slice(0, 3).forEach(function (l) {
    const n = army.troopCount(l.troops);
    text(ctx, '· ' + l.name + '（' + l.title + '）', PAD + 4, y, { size: 18, color: '#e6d7b6' });
    text(ctx, n + ' 兵', w - PAD, y, { size: 18, align: 'right', color: n > 150 ? '#d06a4a' : '#a2947a' });
    y += 34;
  });
  if (!lords.length) text(ctx, '（暂时没有成军的领主）', PAD + 4, y, { size: 17, color: '#8a8070' });

  backButton(app, y + 34);
}

/* ---------------------------------------------------------------- 城池详情 */

/** 底部信息卡：守军 / 粮价 / 关系 / 兵源 / 风物，填满下半屏 */
function siteInfo(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  if (H < 1160) return;

  const st = app.state;
  const reg = regionDef(site.region) || {};
  const fac = site.ownerFaction ? FACTIONS[site.ownerFaction] : null;
  const y = H - 286;
  const bw = w - PAD * 2;

  panel(ctx, PAD, y, bw, 262, { fill: '#191410' });
  ctx.fillStyle = 'rgba(240,192,96,0.35)';
  ctx.fillRect(PAD + 20, y + 16, bw - 40, 1);

  text(ctx, '守军', PAD + 22, y + 28, { size: 17, color: '#8a8070' });
  text(ctx, String(site.garrison || 0), PAD + 22, y + 54, { size: 30, color: '#d8c8a6' });

  text(ctx, '粮价', PAD + 180, y + 28, { size: 17, color: '#8a8070' });
  text(ctx, economy.foodPrice(site) + ' 金', PAD + 180, y + 54, { size: 30, color: '#d8c8a6' });

  if (fac) {
    const rel = (st.relations && st.relations[site.ownerFaction]) || 0;
    text(ctx, fac.full + ' 关系', PAD + 340, y + 28, { size: 17, color: '#8a8070' });
    text(ctx, (rel > 0 ? '+' : '') + rel, PAD + 340, y + 54, {
      size: 30, color: rel >= 0 ? '#8fbf7a' : '#d06a4a',
    });
  } else {
    text(ctx, '归属', PAD + 340, y + 28, { size: 17, color: '#8a8070' });
    text(ctx, '无主之地', PAD + 340, y + 54, { size: 22, color: '#a2947a' });
  }

  const names = (site.recruitList || []).map(function (id) { return TROOPS[id] ? TROOPS[id].name : id; });
  text(ctx, '此地兵源', PAD + 22, y + 104, { size: 17, color: '#8a8070' });
  text(ctx, names.join(' · ') || '无可招募', PAD + 22, y + 132, { size: 20, color: '#c9bda2' });

  ctx.fillStyle = 'rgba(240,192,96,0.25)';
  ctx.fillRect(PAD + 20, y + 170, bw - 40, 1);
  const lines = wrap(ctx, (reg.name ? '【' + reg.name + '】' : '') + (reg.flavor || ''), bw - 44, 17, 'normal');
  lines.slice(0, 2).forEach(function (l, i) {
    text(ctx, l, PAD + 22, y + 186 + i * 26, { size: 17, color: '#8f8571' });
  });
}

/* ---------------------------------------------------------------- 场景 */

const TownScene = {
  enter(app, params) {
    app.restView = null;
    app.townView = {
      siteId: params.siteId,
      view: params.view || 'menu',
      tab: 'food',
      goodId: null,
      estimate: null,
      scroll: 0,
      maxScroll: 0,
    };
  },

  update(app) {
    if (app.state.events.length) flows.process(app);
  },

  render(app) {
    const site = siteById(app.state.world, app.townView.siteId);
    if (!site) {
      app.pop();
      return;
    }
    // 玩家已离开该据点（比如战斗后），直接退出
    if (app.state.player.atSiteId !== site.id && app.state.events.length === 0) {
      // 允许停留，只要没移动
    }

    header(app, site);
    const y = statusBar(app, 148);

    const v = app.townView.view;
    if (v === 'recruit') renderRecruit(app, site);
    else if (v === 'market') renderMarket(app, site, app.townView.tab || 'goods');
    else if (v === 'village') renderVillage(app, site);
    else if (v === 'tavern') renderTavern(app, site);
    else if (v === 'hall') renderHall(app, site);
    else if (v === 'hermit') renderHermit(app, site);
    else {
      renderMenu(app, site);
    }
  },

  onTouchStart(app, x, y) {
    app.townView.drag = { y: y, scroll: app.townView.scroll || 0, moved: 0 };
  },

  onTouchMove(app, x, y) {
    const d = app.townView.drag;
    if (!d) return;
    if (app.townView.view !== 'menu') return;
    const dy = y - d.y;
    if (Math.abs(dy) > 6) d.moved = Math.abs(dy);
    if (d.moved > 6) {
      const max = app.townView.maxScroll || 0;
      app.townView.scroll = Math.max(0, Math.min(max, d.scroll - dy));
    }
  },

  onTouchEnd(app) {
    if (app.townView) app.townView.drag = null;
  },
};

module.exports = TownScene;


