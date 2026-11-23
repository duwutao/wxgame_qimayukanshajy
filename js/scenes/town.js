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
const army = require('../core/army.js');
const { siteById, regionDef } = require('../core/world.js');
const { TROOPS } = require('../data/troops.js');
const { FACTIONS, EQUIPMENT } = require('../data/china.js');
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
  const need = army.foodPerDay(p.troops);

  ctx.fillStyle = '#1d1711';
  ctx.fillRect(0, y, w, 96);

  const cells = [
    { k: '金', v: p.gold, c: '#f0c060' },
    { k: '粮', v: p.food + ' / 日耗' + need, c: p.food < need * 3 ? '#d06a4a' : '#c8b478' },
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

function renderMenu(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
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

  const isVillage = site.type === 'village';

  y = menuButton(app, y, '招兵', isVillage ? '村里的壮丁，价钱便宜' : '花钱买人，价钱随城而变', function () {
    app.townView.view = 'recruit';
  }, { id: 'm_recruit', right: '→' });

  y = menuButton(app, y, '市场', isVillage ? '粮价低 · 无军械' : '粮草 · 军械', function () {
    app.townView.view = 'market';
    app.townView.tab = 'food';
  }, { id: 'm_market', right: '粮 ' + economy.foodPrice(site) + ' 金/单位' });

  if (!isVillage) {
    y = menuButton(app, y, '酒馆', '接活 · 打听消息', function () {
      app.townView.view = 'tavern';
    }, { id: 'm_tavern', right: '→' });

    y = menuButton(app, y, '领主府', '效忠 · 宣战 · 情报', function () {
      app.townView.view = 'hall';
    }, { id: 'm_hall', right: site.ownerFaction ? FACTIONS[site.ownerFaction].full : '无主' });
  } else {
    y = menuButton(app, y, '劫掠村庄', '抢粮抢钱，掉声望，得罪其主', function () {
      const r = stateLib.raidVillage(app.state, site);
      app.showToast(r.ok ? r.msg : r.msg, 2.6);
      if (r.ok) app.townView.view = 'menu';
    }, { id: 'm_raid', fill: '#3a2018', right: '→' });
  }

  app.ui.button(ctx, PAD, y + 10, w - PAD * 2, 84, '离开', {
    id: 'leave', size: 28, fill: '#241c14', onTap: function () {
      app.state.player.atSiteId = null;
      app.pop();
    },
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

  const list = site.recruitList || [];
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

function renderMarket(app, site, tab) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const st = app.state;

  const tabs = [
    { id: 'food', label: '粮草' },
    { id: 'arms', label: '军械' },
  ];
  const tw = (w - PAD * 2) / 2;
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
    });
  });

  if (tab === 'food') {
    const price = economy.foodPrice(site);
    const sell = economy.foodSellPrice(site);
    text(ctx, '粮价 ' + price + ' 金 · 卖出 ' + sell + ' 金', PAD, 372, { size: 24, color: '#efe3c6' });
    text(ctx, '你的粮草：' + st.player.food + ' 单位', PAD, 410, { size: 20, color: st.player.food < 40 ? '#d06a4a' : '#8fbf7a' });
    text(ctx, '每天吃掉 ' + army.foodPerDay(st.player.troops) + ' 单位', PAD, 442, { size: 17, color: '#a2947a' });

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
    text(ctx, '满载上限 400 单位。长途行军前多带一点。', PAD, 690, { size: 16, color: '#8a8070' });
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

  // 传闻
  const reg = regionDef(site.region);
  text(ctx, '“' + (reg ? reg.flavor : '') + '”', PAD, y + 40, { size: 17, color: '#8a8070' });
  backButton(app, y + 90);
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
    app.townView = {
      siteId: params.siteId,
      view: params.view || 'menu',
      tab: 'food',
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
    else if (v === 'market') renderMarket(app, site, app.townView.tab || 'food');
    else if (v === 'tavern') renderTavern(app, site);
    else if (v === 'hall') renderHall(app, site);
    else {
      renderMenu(app, site);
      siteInfo(app, site);
    }
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = TownScene;
