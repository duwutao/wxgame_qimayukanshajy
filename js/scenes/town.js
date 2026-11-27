/**
 * 城池 / 村庄 / 匪巢界面
 * 布局：顶部城名 → 自己状态条（金/粮/兵/望/简/士气）→ 大按钮菜单 → 子页
 * 子页：招兵 / 市场（粮草·军械）/ 酒馆 / 领主府
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const pixel = require('../render/pixel.js');
const scenery = require('../render/scenery.js');
const stateLib = require('../core/state.js');
const economy = require('../core/economy.js');
const trade = require('../core/trade.js');
const heroes = require('../core/heroes.js');
const army = require('../core/army.js');
const tourney = require('../core/tourney.js');
const { siteById, regionDef } = require('../core/world.js');
const {
  TROOPS, FACTION_TROOPS, factionLabel, effectiveSiteFaction, troopAccess,
} = require('../data/troops.js');

/** 每个据点一个稳定的背景种子，同类型城镇也能有不同街景 */
function siteSeed(id) {
  let h = 0;
  const s = String(id || 'site');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h + 7;
}
const { FACTIONS, EQUIPMENT, STRATEGIC_SITES } = require('../data/china.js');
const { VILLAGE_FOOD } = require('../data/extra.js');
const flows = require('./flows.js');

const PAD = 16;

function money(v) { return v + '金钱'; }

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
  const ownCountry = app.state.player.country;
  const flagSpot = site.type === 'village' ? '村口' : '城头';
  const blurb = site.playerOwned
    ? (ownCountry && ownCountry.name
      ? '你的' + typeName + '。' + flagSpot + '换上了「' + ownCountry.name + '」字旗。'
      : '你的' + typeName + '。旗还空着一个字，等你来定。')
    : (site.blurb || '');
  const lines = wrap(ctx, blurb, w - PAD * 2 - 8, 17, 'bold');
  text(ctx, lines[0] || '', PAD + 4, 106, { size: 17, color: '#c9bda2' });

  // 战略要地：城头直接写清楚八格光环，别让玩家打完才知道有加成。
  const strategic = STRATEGIC_SITES[site.id];
  if (strategic) {
    text(ctx, '要地 · 占据方在八格内对碰防御 ×' + (strategic.defense || 1.5) +
      '（1 兵当 1.5 兵用）', PAD + 4, 128, {
        size: 14, color: '#e8c060',
      });
  }
}

/** 自己的状态条：这是城池界面最该看到的东西 */
function statusBar(app, y) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const p = app.state.player;
  const count = army.troopCount(p.troops);
  const cap = stateLib.capacity(app.state);
  const need = stateLib.nextFoodNeed(app.state);
  const foodShort = p.food < need;

  ctx.fillStyle = '#1d1711';
  ctx.fillRect(0, y, w, 96);

  const cells = [
    { k: '金钱', v: p.gold, c: '#f0c060' },
    { k: '粮草', v: p.food, c: foodShort ? '#e06a52' : p.food < need * 3 ? '#d06a4a' : '#c8b478' },
    { k: '兵力', v: count + ' / ' + cap, c: count >= cap ? '#d06a4a' : '#8fb0d8' },
    { k: '声望', v: p.renown, c: '#c98f6a' },
    { k: '天机简', v: p.shi, c: '#b98fd8' },
    { k: '士气', v: p.morale, c: p.morale < 40 ? '#d06a4a' : '#8fbf7a' },
  ];
  const cw = (w - PAD * 2) / cells.length;
  cells.forEach(function (it, i) {
    const x = PAD + i * cw;
    text(ctx, it.k, x, y + 10, { size: 13, color: '#8a8070' });
    text(ctx, String(it.v), x, y + 38, { size: 17, color: it.c });
  });

  // 士气细条
  bar(ctx, PAD, y + 68, w - PAD * 2, 8, p.morale / 100, p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);
  if (foodShort) {
    text(ctx, '粮草告急 · 撑不过两日 · 下次发粮需 ' + need + '，速补！', PAD, y + 80, {
      size: 15, color: '#e06a52',
    });
  }

  return y + 106;
}

function backButton(app, y, target) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  app.ui.button(ctx, PAD, y, 150, 64, '← 返回', {
    id: 'back', size: 22, onTap: function () { app.townView.view = target || 'menu'; },
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

  // 打下来的城与村都在这里点将；第一座城之后才需要，但入口从第一块地就开着
  if (site.playerOwned) {
    const owned = app.state.world.sites.filter(function (s) { return s.playerOwned && s.type !== 'camp'; });
    const assigned = owned.filter(function (s) { return !!stateLib.siteLord(app.state, s); }).length;
    const selfOwned = owned.filter(function (s) { return stateLib.siteSelfFief(app.state, s); }).length;
    list.push({
      id: 'm_govern', label: '处理政务',
      sub: '封地点将、与列国宣战议和，都在这张案上',
      fill: '#33291d', right: selfOwned + ' 处直辖 · ' + assigned + ' 处已封',
      onTap: function () { app.push('govern', { siteId: site.id }); },
    });
  }

  if (isVillage) {
    list.push({
      id: 'm_recruit', label: '招兵', sub: '村里的壮丁 · 只有最低一档，比城里便宜', right: '→',
      onTap: function () { app.townView.view = 'recruit'; },
    });
    list.push({
      id: 'm_village', label: '村市 · 找村长', sub: '牛、羊、鸡、谷，村里卖得比城里便宜',
      right: '粮 ' + Math.round(40 * (site.priceIndex || 1) * 0.85) + '金钱',
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
      sub: '粮耗减半；村里藏不住人，追兵会摸进来', fill: '#26372a',
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
    // 无主之城：门开着，但也可以直接翻脸围城。围下来就是你的第一块城砖。
    if (!site.ownerFaction && !site.playerOwned) {
      list.push({
        id: 'm_besiege', label: '围攻 · 无主之城',
        sub: '围足时辰再决战；打下来，这座城就挂你的旗',
        fill: '#4a241c', right: '→',
        onTap: function () {
          const r = stateLib.beginPlayerSiege(app.state, site);
          if (!r.ok) { app.showToast(r.msg, 2.4); return; }
          app.showToast('城下扎营：需围 ' + r.days + ' 天，回大地图等时辰，围成后才能决战。', 3);
          app.pop();
        },
      });
    }
    list.push({
      id: 'm_recruit', label: '招兵', sub: '花钱买人，价钱随城而变', right: '→',
      onTap: function () { app.townView.view = 'recruit'; },
    });
    list.push({
      id: 'm_market', label: '市场', sub: '粮草 · 货物 · 军械',
      right: '粮 ' + economy.foodPrice(site) + '金钱/单位',
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
      id: 'm_tourney', label: '军机棋盘', sub: '单挑 · 校场 · 断粮 · 狙哨 · 火攻 · 传令，一局定胜负', fill: '#3a2c1e',
      right: (app.state.tourney && !app.state.tourney.done) ? '推演中' : '报名 ' + tourney.fee() + '金钱',
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
    if (site.cleared) {
      text(ctx, '到处是火。', PAD, y - 44, { size: 30, color: '#e08a50' });
      text(ctx, '寨门烧塌了，营帐只剩黑桩，地上散着断刀和空粮袋。', PAD, y + 12, {
        size: 19, color: '#c9bda2',
      });
      text(ctx, '财物已经被劫掠一空，连一把能用的弓都没留下。', PAD, y + 54, {
        size: 21, color: '#f0c060',
      });
      text(ctx, '过几天再来看看。', PAD, y + 98, { size: 24, color: '#8fbf7a' });
      if (site.respawnDay) {
        text(ctx, '约第 ' + site.respawnDay + ' 天，也许会再聚起一伙人。', PAD, y + 140, {
          size: 16, color: '#8a8070',
        });
      }
      app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '离开这里', {
        id: 'camp_leave_looted', size: 26, fill: '#241c14', onTap: function () {
          app.state.player.atSiteId = null;
          app.pop();
        },
      });
      return;
    }
    text(ctx, '这里是一处贼巢。攻破它，你的名字会传出去。', PAD, y - 40, { size: 19, color: '#c9bda2' });
    app.ui.button(ctx, PAD, y, w - PAD * 2, 96, '进攻贼巢', {
      id: 'attack', size: 30, fill: '#4a241c', onTap: function () {
        stateLib.startSiege(app.state, site);
        app.push('battle', { mode: 'siege' });
      },
    });
    app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '离开这里', {
      id: 'camp_leave', size: 26, fill: '#241c14', onTap: function () {
        app.state.player.atSiteId = null;
        app.pop();
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

  // 招兵页只讲兵阶，不再把攻/防/粮摊给玩家；高阶兵的门槛写在最上面。
  text(ctx, '兵阶：T2 能打两个 T1，T3 又压 T2 一头，T4 是国中精锐，T5 为镇国兵。', PAD, 258, {
    size: 15, color: '#c9bda2',
  });
  text(ctx, 'T3 声望 200 即可；T4 需投国/自立且声望 500；T5 只限特定国家。', PAD, 278, {
    size: 15, color: '#a2947a',
  });
  text(ctx, '可招募', PAD, 300, { size: 26, color: '#f0c060' });
  text(ctx, '队伍 ' + army.troopCount(p.troops) + ' / ' + stateLib.capacity(st), w - PAD, 306, {
    size: 18, align: 'right', color: '#a2947a',
  });

  // 自立后在自己的城招兵，可以在顶部切换兵源国；换一次锁 30 天。
  const sourceInfo = stateLib.recruitSourceInfo(st);
  const selfSource = sourceInfo.enabled && !!site.playerOwned;
  let listTop = 340;
  if (selfSource) {
    const localFaction = effectiveSiteFaction(st, site);
    const sourceName = sourceInfo.current
      ? factionLabel(sourceInfo.current)
      : (localFaction ? factionLabel(localFaction) + '（本地）' : '本地');
    panel(ctx, PAD, 318, w - PAD * 2, 48, { fill: '#1d1711' });
    text(ctx,
      '兵源：' + sourceName + (sourceInfo.remain > 0 ? ' · 还剩 ' + sourceInfo.remain + ' 天' : ''),
      PAD + 12, 334, {
        size: 17,
        color: sourceInfo.remain > 0 ? '#d08a5a' : '#c9bda2',
      });
    app.ui.button(ctx, w - PAD - 154, 324, 142, 36, sourceInfo.remain > 0 ? '查看兵源' : '更换兵源', {
      id: 'recruit_source', size: 17, onTap: function () {
        app.townView.view = 'recruitSource';
      },
    });
    listTop = 376;
  }

  let list = site.recruitList || [];
  // 村庄只出本地最低一档；城/关按当前管辖势力出完整兵源牌。
  if (site.type === 'village') {
    list = list.filter(function (id) { return TROOPS[id] && Number(TROOPS[id].tier) === 1; });
  }
  // 六人以内用原来的大行；七个以上（含灭国降卒 T5）压成紧凑行，保证返回键不越屏。
  const compact = list.length >= 6;
  const rowH = compact ? 88 : 104;
  const step = compact ? 96 : 116;
  let y = listTop;

  if (!list.length) {
    text(ctx, '这里不卖人。', PAD, y + 20, { size: 22, color: '#a2947a' });
  }

  list.forEach(function (id) {
    const t = TROOPS[id];
    if (!t) return;
    const stock = site.recruits[id] || 0;
    const price = economy.recruitPrice(site, id);
    const gate = troopAccess(st, site, id);
    const locked = !gate.ok;

    panel(ctx, PAD, y, w - PAD * 2, rowH, { fill: '#241c14' });
    text(ctx, t.name, PAD + 18, y + (compact ? 10 : 14), {
      size: compact ? 24 : 26, color: locked ? '#7a7160' : '#efe3c6',
    });
    text(ctx, 'T' + (t.tier || 1), PAD + 214, y + (compact ? 13 : 20), {
      size: 18, color: locked ? '#7a7160' : '#c9a05a',
    });
    // 锁着的兵把价钱放第一行右侧，第二行整行留给门槛说明；能招的兵价钱照旧跟“余量”一排。
    if (locked) {
      text(ctx, price + '金钱/人', w - PAD - 18, y + (compact ? 10 : 14), {
        size: 18, align: 'right', color: '#f0c060',
      });
    }
    text(ctx, locked ? gate.msg : '余 ' + stock + ' 人', PAD + 18, y + (compact ? 48 : 58), {
      size: locked ? 16 : 17,
      color: locked ? '#b4463c' : stock > 0 ? '#8fbf7a' : '#7a7160',
    });
    if (!locked) {
      text(ctx, price + '金钱/人', PAD + 214, y + (compact ? 48 : 58), { size: 18, color: '#f0c060' });
    }

    if (!locked && stock > 0) {
      app.ui.button(ctx, w - PAD - 190, y + (compact ? 14 : 22), 86, compact ? 52 : 58, '招 1', {
        id: 'r1_' + id, size: 22, onTap: function () {
          const r = economy.recruit(st, site, id, 1);
          app.showToast(r.msg, 2.2);
        },
      });
      app.ui.button(ctx, w - PAD - 96, y + (compact ? 14 : 22), 86, compact ? 52 : 58, '招 5', {
        id: 'r5_' + id, size: 22, disabled: stock < 5, onTap: function () {
          const r = economy.recruit(st, site, id, 5);
          app.showToast(r.msg, 2.2);
        },
      });
    }
    y += step;
  });

  backButton(app, y + 4);
}

/* ---------------------------------------------------------------- 兵源国 */

function renderRecruitSource(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  const st = app.state;
  const info = stateLib.recruitSourceInfo(st);
  if (!info.enabled) {
    app.townView.view = 'recruit';
    return;
  }

  text(ctx, '选择兵源国', PAD, 270, { size: 28, color: '#f0c060' });
  const localFaction = effectiveSiteFaction(st, site);
  text(ctx, info.current
    ? '当前：' + factionLabel(info.current)
    : '当前：本地兵源（' + (localFaction ? factionLabel(localFaction) : '各城原文化') + '）',
    PAD, 306, { size: 18, color: '#c9bda2' });
  text(ctx, info.remain > 0
    ? '已换过兵源，' + info.remain + ' 天后才能再换。'
    : '自立后可任选一国兵源；换过后 30 天内不能更换。',
    PAD, 330, { size: 15, color: info.remain > 0 ? '#d08a5a' : '#a2947a' });

  const factions = Object.keys(FACTION_TROOPS);
  const cols = 2;
  const gap = 10;
  const cw = (w - PAD * 2 - gap) / cols;
  const ch = 56;
  const top = 360;
  const rowStep = ch + 10;
  const locked = info.remain > 0;
  factions.forEach(function (f, i) {
    const x = PAD + (i % cols) * (cw + gap);
    const y = top + Math.floor(i / cols) * rowStep;
    const label = (info.current === f ? '当前 · ' : '') + factionLabel(f);
    app.ui.button(ctx, x, y, cw, ch, label, {
      id: 'src_' + f, size: 20, disabled: locked,
      fill: info.current === f ? '#4a3520' : '#2c2117',
      border: info.current === f ? '#c9a05a' : undefined,
      onTap: function () {
        const r = stateLib.setPlayerRecruitSource(st, f);
        app.showToast(r.msg, 2.2);
        if (r.ok) app.townView.view = 'recruit';
      },
    });
  });

  // 最后一行按钮下留出完整一行的高度，提示文字不能压到按钮边框上。
  const noteY = top + Math.ceil(factions.length / cols) * rowStep + 28;
  ctx.fillStyle = 'rgba(20,15,10,0.78)';
  ctx.fillRect(PAD, noteY - 20, w - PAD * 2, 30);
  text(ctx, 'T5 仍按原规则：需加入该国，或亲手灭其国。', PAD, noteY, {
    size: 14, color: '#c9bda2',
  });
  backButton(app, H - 100, 'recruit');
}

/* ---------------------------------------------------------------- 市场 */

/* ---------------------------------------------------------------- 货物 */

/** 货物总览：本城只做四样货，两列两行，点开看单品 */
function renderGoods(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const p = app.state.player;
  const carried = trade.goodsCount(p);
  const goods = trade.marketGoods(site);

  text(ctx, '本城货物 · 四样', PAD, 362, { size: 21, color: '#efe3c6' });
  text(ctx, '驮队 ' + carried + ' / ' + trade.GOODS_CAP + ' 件', PAD, 392, { size: 18, color: '#c9a05a' });
  text(ctx, '每城只做四样货：低价买进、别城卖出，赚的是转手的差价。', PAD, 416, {
    size: 15, color: '#a2947a',
  });

  const top = 448;
  const gap = 12;
  const cw = (w - PAD * 2 - gap) / 2;
  const rh = 124;

  goods.forEach(function (gd, i) {
    const cx = PAD + (i % 2) * (cw + gap);
    const cy = top + Math.floor(i / 2) * (rh + 10);
    const buy = trade.buyPrice(site, gd.id);
    const sell = trade.sellPrice(site, gd.id);
    const have = (p.goods || {})[gd.id] || 0;

    panel(ctx, cx, cy, cw, rh, { fill: '#241c14' });
    text(ctx, gd.name, cx + 14, cy + 10, { size: 22, color: '#efe3c6' });
    text(ctx, '买 ' + buy + ' / 卖 ' + sell, cx + 14, cy + 46, { size: 17, color: '#f0c060' });
    text(ctx, '持有 ' + have, cx + 14, cy + 76, {
      size: 16, color: have > 0 ? '#8fbf7a' : '#6a6050',
    });
    text(ctx, '→', cx + cw - 24, cy + 38, { size: 24, color: '#8a8070' });

    app.ui.rect('good_' + gd.id, cx, cy, cw, rh, function () {
      app.townView.goodId = gd.id;
      app.townView.estimate = null;
    });
  });

  backButton(app, app.runtime.height - 84);
}

/** 单品交易：买/卖几件，顺便估个价 */
function renderGoodOne(app, site, goodId) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const h = app.runtime.height;
  const st = app.state;
  const p = st.player;
  const gd = trade.goodById(goodId);
  if (!gd || !trade.offersGood(site, goodId)) {
    app.townView.goodId = null;
    return;
  }
  const buy = trade.buyPrice(site, goodId);
  const sell = trade.sellPrice(site, goodId);
  const have = (p.goods || {})[goodId] || 0;

  text(ctx, gd.name, PAD, 358, { size: 30, color: '#f0c060' });
  text(ctx, '基准 ' + gd.base + '金钱 / ' + gd.unit, w - PAD, 364, { size: 16, align: 'right', color: '#8a8070' });
  wrap(ctx, gd.desc, w - PAD * 2, 16).slice(0, 2).forEach(function (ln, i) {
    text(ctx, ln, PAD, 400 + i * 24, { size: 16, color: '#a2947a' });
  });

  text(ctx, '本地买 ' + buy + '金钱', PAD, 460, { size: 22, color: '#f0c060' });
  text(ctx, '本地卖 ' + sell + '金钱', PAD + 220, 460, { size: 22, color: '#8fb0d8' });
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
      text(ctx, '本城 ' + est.here + '金钱 · 往这些城去：', PAD, y, { size: 17, color: '#a2947a' });
      y += 30;
      est.rows.forEach(function (row) {
        if (y > h - 150) return;
        text(ctx, row.site.name, PAD, y, { size: 19, color: '#efe3c6' });
        text(ctx, row.price + '金钱', PAD + 150, y, { size: 19, color: '#f0c060' });
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
  const foodCap = army.foodCap(p.troops);
  const foodRoom = Math.max(0, foodCap - p.food);
  text(ctx, '粮草 ' + p.food + ' / 上限 ' + foodCap + ' · 还可购 ' + foodRoom,
    w - PAD, 336, { size: 16, align: 'right', color: p.food >= foodCap ? '#d06a4a' : '#8fbf7a' });

  let y = 380;
  VILLAGE_FOOD.forEach(function (f) {
    const price = Math.round(f.price * (site.priceIndex || 1) * 0.85);
    const stock = (site.foodStock || {})[f.id] || 0;
    panel(ctx, PAD, y, w - PAD * 2, 96, { fill: '#241c14' });
    text(ctx, f.name, PAD + 18, y + 10, { size: 24, color: stock > 0 ? '#efe3c6' : '#7a7160' });
    text(ctx, '+' + f.food + ' 口粮', PAD + 150, y + 16, { size: 18, color: '#a2947a' });
    const dl = wrap(ctx, f.desc, w - PAD * 2 - 460, 15)[0] || '';
    text(ctx, dl, PAD + 18, y + 50, { size: 15, color: '#8a8070' });
    text(ctx, stock > 0 ? '村里还有 ' + stock + ' 份' : '卖完了', PAD + 320, y + 54, {
      size: 16, color: stock > 0 ? '#8fbf7a' : '#d06a4a',
    });
    text(ctx, price + '金钱', w - PAD - 142, y + 44, { size: 22, align: 'right', color: '#f0c060' });
    app.ui.button(ctx, w - PAD - 130, y + 22, 112, 54, '买', {
      id: 'vf_' + f.id, size: 22, disabled: p.gold < price || stock <= 0, onTap: function () {
        const r = stateLib.buyVillageFood(st, site, f.id);
        app.showToast(r.msg, 2.2);
      },
    });
    y += 108;
  });

  backButton(app, h - 84);
}

function equipEffectText(tier) {
  if (!tier) return '无';
  const parts = [];
  if (tier.atkPct) parts.push('攻击 +' + Math.round(tier.atkPct * 100) + '%');
  if (tier.defPct) parts.push('防御 +' + Math.round(tier.defPct * 100) + '%');
  if (tier.speedPct) parts.push('行军 +' + Math.round(tier.speedPct * 100) + '%');
  return parts.length ? parts.join(' · ') : '无加成';
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
    const foodCap = army.foodCap(st.player.troops);
    const foodRoom = Math.max(0, foodCap - st.player.food);
    text(ctx, '粮价 ' + price + '金钱 · 卖出 ' + sell + '金钱', PAD, 372, { size: 24, color: '#efe3c6' });
    text(ctx, '你的粮草：' + st.player.food + ' / 上限 ' + foodCap + ' · 还可购 ' + foodRoom + ' 单位',
      PAD, 410, { size: 19, color: st.player.food >= foodCap ? '#d06a4a' : st.player.food < 40 ? '#d06a4a' : '#8fbf7a' });
    text(ctx, '每两天吃掉 ' + Math.max(1, Math.round(army.foodPerDay(st.player.troops) * 2)) + ' 单位', PAD, 442, { size: 17, color: '#a2947a' });

    const amounts = [10, 50];
    amounts.forEach(function (n, i) {
      app.ui.button(ctx, PAD, 486 + i * 92, 220, 72, '买 ' + n + ' 粮', {
        id: 'buy' + n, size: 24, disabled: foodRoom < n, onTap: function () {
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
    text(ctx, '满载上限 ' + foodCap + ' 单位 · 还可购 ' + foodRoom + '（兵力 ' + army.troopCount(st.player.troops) + '）。长途行军前多带一点。', PAD, 690, { size: 16, color: foodRoom <= 0 ? '#d06a4a' : '#8a8070' });
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
    const level = st.player.equip[slot] || 0;
    panel(ctx, PAD, y, w - PAD * 2, 104, { fill: '#241c14' });
    text(ctx, eq.name, PAD + 18, y + 12, { size: 20, color: '#a2947a' });
    text(ctx, cur.name, PAD + 96, y + 10, { size: 26, color: '#efe3c6' });
    text(ctx, '第 ' + (level + 1) + ' / ' + eq.tiers.length + ' 档 · ' +
      (next ? '下一档：' + next.name + ' · ' + next.price + '金钱' : '已是顶配'), PAD + 18, y + 56, {
      size: 17, color: next ? '#f0c060' : '#8a8070',
    });
    text(ctx, '本级 ' + equipEffectText(cur) + ' ／ 下阶 ' + (next ? equipEffectText(next) : '已顶配'),
      PAD + 18, y + 82, { size: 14, color: '#a2947a' });
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

/** 把任务目标标到大地图上，并让镜头直接落到那一格 */
function locateQuest(app, q) {
  const st = app.state;
  const pos = stateLib.questTargetPos(st, q);
  if (!pos) {
    app.showToast(q && q.failed ? (q.failReason || '目标已经被其他势力清剿') + '，任务已失败。'
      : '这个目标已经不在了。', 2.6);
    return;
  }
  app.mapQuestFocus = q.id;
  const top = app.top();
  if (top && top.name === 'town') app.pop();
  else if (!top || top.name !== 'map') app.replace('map');
  const mapEntry = app.top();
  if (mapEntry && mapEntry.scene && mapEntry.scene.focusOn) {
    mapEntry.scene.focusOn(app, pos.x, pos.y, pos.name);
  }
  app.showToast('已在大世界标出：' + pos.name, 2.6);
}

function renderTavern(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  const st = app.state;

  function pauseOutOfTown() {
    // 和大地图左下角的“暂停停靠”同一条出口：先正常离城，把人放到城郊，
    // 再冻住天下时辰。不是把镜头直接跳到酒馆任务目标，也不是原地挂机。
    const r = stateLib.leaveRestForMap(st);
    if (!r.ok) { app.showToast(r.msg, 2); return; }
    app.restView = null;
    app.follow = null;
    if (st.campFlow) st.campFlow = false;
    app.mapTimePaused = true;
    app.mapIdleRest = true;
    if (app.top() && app.top().name === 'town') app.pop();
    else app.replace('map');
    app.showToast('已出城扎营，时辰暂停。', 2.4);
  }

  function pauseButton(y) {
    app.ui.button(ctx, PAD, y, w - PAD * 2, 64, '暂停时辰 · 出城扎营', {
      id: 'tavern_pause', size: 22, fill: '#26372a', onTap: pauseOutOfTown,
    });
  }

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
    y += 160;
  } else {
    mine.forEach(function (q) {
      panel(ctx, PAD, y, w - PAD * 2, 126, { fill: '#241c14' });
      text(ctx, q.title, PAD + 18, y + 12, { size: 24, color: '#efe3c6' });
      const lines = wrap(ctx, q.text, w - PAD * 2 - 190, 16, 'bold');
      text(ctx, lines[0] || '', PAD + 18, y + 48, { size: 16, color: '#a2947a' });
      text(ctx, '赏 ' + q.reward.gold + '金钱 · ' + q.reward.renown + ' 声望', PAD + 18, y + 84, {
        size: 17, color: '#f0c060',
      });
      if (q.type === 'grain') {
        app.ui.button(ctx, w - PAD - 150, y + 8, 132, 44, '查看位置', {
          id: 'loc_' + q.id, size: 19, fill: '#2c2418', onTap: function () { locateQuest(app, q); },
        });
        app.ui.button(ctx, w - PAD - 150, y + 70, 132, 44, '交粮', {
          id: 'dg_' + q.id, size: 20, onTap: function () {
            const r = stateLib.deliverGrain(st, q);
            app.showToast(r.msg, 2.2);
          },
        });
      } else {
        app.ui.button(ctx, w - PAD - 150, y + 40, 132, 48, '查看位置', {
          id: 'loc_' + q.id, size: 20, fill: '#2c2418', onTap: function () { locateQuest(app, q); },
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
      wrap(ctx, heroes.storyOf(h.id) || h.bio, w - PAD * 2 - 200, 15).slice(0, 2).forEach(function (ln, i) {
        text(ctx, ln, PAD + 18, y + 52 + i * 22, { size: 15, color: '#a2947a' });
      });
      const b = heroes.bonusOf(h.id, 1);
      text(ctx, '带的加成：' + (b.label || '无'), PAD + 18, y + 102, { size: 13, color: '#8fb0d8' });
      text(ctx, h.cost + '金钱', w - PAD - 150, y + 62, { size: 22, color: '#f0c060' });
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

  // 打听前朝旧主的下落：一次 40金钱，问出一个人藏在哪个村
  const unknown = st.lords.filter(function (l) {
    return l.hidden && l.hidden.siteId && (!st.knownHidden || !st.knownHidden[l.id]);
  });
  if (unknown.length) {
    app.ui.button(ctx, PAD, y + 76, w - PAD * 2, 76, '打听前朝旧主的下落 · 40金钱', {
      id: 'rumor', size: 22, fill: '#241c14', disabled: st.player.gold < 40, onTap: function () {
        const r = stateLib.tavernRumor(st);
        app.showToast(r.msg, 3);
      },
    });
    pauseButton(H - 174);
    backButton(app, H - 92);
    return;
  }

  pauseButton(H - 174);
  backButton(app, H - 92);
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

  const facTitle = f === 'player' ? fac.full : (fac.full + ' · ' + fac.name);
  text(ctx, facTitle, PAD, 342, { size: 30, color: fac.color });
  text(ctx, fac.desc, PAD, 386, { size: 17, color: '#a2947a' });
  text(ctx, '关系 ' + rel, PAD, 424, { size: 20, color: rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#c9bda2' });
  bar(ctx, PAD, 456, w - PAD * 2, 10, (rel + 100) / 200, rel < -25 ? UI_COLORS.danger : rel > 25 ? UI_COLORS.good : UI_COLORS.accent);

  let y = 490;

  const fiefLord = stateLib.siteLord(st, site);
  if (fiefLord) {
    text(ctx, '封地领主：' + fiefLord.name + ' · Lv' + stateLib.lordLevel(fiefLord) +
      ' · 兵 ' + army.troopCount(fiefLord.troops) + ' / ' + stateLib.lordTroopCap(fiefLord), PAD, y - 8, {
        size: 17, color: '#e6d7b6',
      });
    y += 34;
  }

  if (!p.faction && !hostile) {
    const req = stateLib.joinRenownReq(f);
    const small = req === 100;
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88,
      p.renown < req ? '效忠（需声望 ' + req + '）' : '效忠' + fac.full, {
        id: 'join', size: 26, disabled: p.renown < req, onTap: function () {
          const r = stateLib.joinFaction(st, site);
          app.showToast(r.msg, 2.4);
        },
      });
    text(ctx, small ? '小国求贤：声望 100 即可投靠。' : '大国门槛：声望 200 才见得到守将。', PAD, y + 94, {
      size: 15, color: small ? '#8fbf7a' : '#c9a05a',
    });
    y += 120;
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
    const ps = st.playerSiege;
    const sieging = ps && ps.siteId === site.id;
    app.ui.button(ctx, PAD, y, w - PAD * 2, 88, sieging ? '继续围城' : '围城', {
      id: 'siege', size: 26, fill: '#4a241c', onTap: function () {
        if (sieging) { app.townView.view = 'siege'; return; }
        const r = stateLib.beginPlayerSiege(st, site);
        if (!r.ok) { app.showToast(r.msg, 2.4); return; }
        app.showToast('城下扎营：回大地图等时辰，围成后才能决战。', 3);
        app.pop();
      },
    });
    const reach = stateLib.canPlayerAttackSite(st, site);
    text(ctx, sieging ? '围城营已扎下，继续等时辰'
      : reach.ok ? '城有城墙：先围 1-2 天，围成后才能决战'
        : reach.msg, PAD, y + 94, {
      size: 15, color: reach.ok ? '#c9a05a' : '#d06a4a',
    });
    y += 126;
  }

  // 情报：该势力的领主
  const resting = st.lords.filter(function (l) {
    return l.faction === f && l.alive && !l.dead && !l.retired && !l.prisoner &&
      l.inCity === site.id && !l.scatterHidden;
  });
  if (resting.length) {
    text(ctx, '府中歇脚 · ' + resting.length + ' 位领主', PAD, y + 6, { size: 20, color: '#d9a441' });
    y += 34;
    resting.slice(0, 3).forEach(function (l) {
      const n = army.troopCount(l.troops);
      text(ctx, '· ' + l.name + '（' + (l.title || '领主') + '）', PAD + 4, y, { size: 17, color: '#c9bda2' });
      text(ctx, '养兵中 · ' + n + ' 兵', w - PAD, y, { size: 16, align: 'right', color: '#8fbf7a' });
      y += 30;
    });
    text(ctx, '他们在大地图上收了旗，正在城里补兵。', PAD + 4, y, { size: 15, color: '#8a8070' });
    y += 30;
    if (resting.length > 3) {
      app.ui.button(ctx, PAD, y + 2, w - PAD * 2, 54, '查看全部 · ' + resting.length + ' 位府中领主', {
        id: 'hall_all_resting', size: 20, fill: '#2b2419',
        onTap: function () {
          app.townView.lordMode = 'resting';
          app.townView.view = 'lords';
          app.townView.lordScroll = 0;
        },
      });
      y += 66;
    }
  }
  const lords = st.lords.filter(function (l) {
    return l.faction === f && l.alive && !l.dead && !l.retired && !l.prisoner &&
      !l.inCity && !l.scatterHidden;
  });
  text(ctx, '麾下领主 · ' + lords.length + ' 位', PAD, y + 6, { size: 20, color: '#a2947a' });
  y += 40;
  lords.slice(0, 3).forEach(function (l) {
    const n = army.troopCount(l.troops);
    text(ctx, '· ' + l.name + '（' + l.title + '）', PAD + 4, y, { size: 18, color: '#e6d7b6' });
    text(ctx, n + ' 兵', w - PAD, y, { size: 18, align: 'right', color: n > 150 ? '#d06a4a' : '#a2947a' });
    y += 34;
  });
  if (!lords.length) text(ctx, '（暂时没有成军的领主）', PAD + 4, y, { size: 17, color: '#8a8070' });
  if (lords.length > 3) {
    app.ui.button(ctx, PAD, y + 4, w - PAD * 2, 54, '查看全部 · ' + lords.length + ' 位领主', {
      id: 'hall_all_lords', size: 20, fill: '#2b2419',
      onTap: function () {
        app.townView.lordMode = 'field';
        app.townView.view = 'lords';
        app.townView.lordScroll = 0;
      },
    });
    y += 66;
  }

  backButton(app, y + 34);
}

/* ---------------------------------------------------------------- 麾下领主名册 */

function lordStatus(st, lord, site) {
  if (lord.inCity === site.id) return '府中养兵';
  if (lord.inCity) {
    const inCity = siteById(st.world, lord.inCity);
    return inCity ? '驻' + inCity.name : '驻外城';
  }
  if (lord.fleeing) return '逃遁中';
  if (lord.order && lord.order.siteId) {
    const target = siteById(st.world, lord.order.siteId);
    const type = lord.order.type === 'siege' ? '围' : '往';
    return type + (target ? target.name : '军令');
  }
  if (lord.hunting || lord.chasing) return '追击中';
  return '在外';
}

function renderLordList(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  const st = app.state;
  const f = site.ownerFaction;
  const mode = app.townView.lordMode || 'all';
  const lords = st.lords.filter(function (l) {
    if (l.faction !== f || !l.alive || l.dead || l.retired || l.prisoner || l.scatterHidden) return false;
    // 名册页和领主府入口共用同一个过滤口径：
    // 府中入口只看在城领主，麾下入口只看在外领主，默认显示全部。
    if (mode === 'resting') return l.inCity === site.id;
    if (mode === 'field') return !l.inCity;
    return true;
  });
  const rows = lords.slice().sort(function (a, b) {
    const ra = { king: 0, lord: 1, general: 2 }[stateLib.lordRank(a)] || 3;
    const rb = { king: 0, lord: 1, general: 2 }[stateLib.lordRank(b)] || 3;
    return ra - rb || army.troopCount(b.troops) - army.troopCount(a.troops);
  });
  const tail = mode === 'resting' ? '府中领主' : '麾下领主';
  const title = f && FACTIONS[f] ? (FACTIONS[f].full + ' · ' + tail) : ('无主之地 · ' + tail);
  text(ctx, title, PAD, 296, { size: 27, color: '#f0c060' });
  text(ctx, '共 ' + rows.length + ' 位 · 上下拖动或滚轮查看全部', w - PAD, 302, {
    size: 15, align: 'right', color: '#a2947a',
  });

  const rowH = 66;
  const gap = 8;
  const y = 344;
  const foot = H - 100;
  const viewH = Math.max(120, foot - y - 10);
  const contentH = rows.length * (rowH + gap);
  const maxScroll = Math.max(0, contentH - viewH);
  if (app.townView.lordScroll === undefined) app.townView.lordScroll = 0;
  app.townView.lordScroll = Math.max(0, Math.min(maxScroll, app.townView.lordScroll));
  app.townView.lordMaxScroll = maxScroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, w, viewH);
  ctx.clip();
  rows.forEach(function (l, i) {
    const ry = y + i * (rowH + gap) - app.townView.lordScroll;
    if (ry < y - rowH || ry > y + viewH + rowH) return;
    ctx.fillStyle = i % 2 ? '#211b15' : '#261f17';
    ctx.fillRect(PAD, ry, w - PAD * 2, rowH);
    const rank = stateLib.lordRank(l);
    ctx.fillStyle = rank === 'king' ? '#d9a441' : rank === 'lord' ? '#8fa6c8' : '#8a8070';
    ctx.fillRect(PAD, ry, 4, rowH);
    text(ctx, l.name, PAD + 18, ry + 10, { size: 23, color: l.alive ? '#efe3c6' : '#6a6050' });
    text(ctx, (l.title || '领主') + (rank === 'king' ? ' · 君主' : rank === 'lord' ? ' · 领兵者' : ''),
      PAD + 18, ry + 41, { size: 15, color: '#a2947a' });
    const n = army.troopCount(l.troops);
    text(ctx, n + ' 兵', w - PAD - 102, ry + 12, { size: 20, align: 'right', color: n > 150 ? '#d06a4a' : '#c9bda2' });
    text(ctx, lordStatus(st, l, site), w - PAD - 14, ry + 41, { size: 15, align: 'right', color: '#8fbf7a' });
  });
  ctx.restore();

  if (!rows.length) text(ctx, '（这一家暂时没有成军的领主）', PAD + 4, y + 8, { size: 18, color: '#8a8070' });
  if (maxScroll > 0) {
    const trackH = viewH;
    ctx.fillStyle = 'rgba(80,66,46,0.35)';
    ctx.fillRect(w - 8, y, 4, trackH);
    const thumbH = Math.max(34, trackH * (viewH / contentH));
    const thumbY = y + (trackH - thumbH) * (app.townView.lordScroll / maxScroll);
    ctx.fillStyle = '#8a7448';
    ctx.fillRect(w - 8, thumbY, 4, thumbH);
  }

  app.ui.button(ctx, PAD, H - 84, 170, 58, '← 返回领主府', {
    id: 'lords_back', size: 20, fill: '#241c14',
    onTap: function () { app.townView.view = 'hall'; },
  });
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
  text(ctx, economy.foodPrice(site) + '金钱', PAD + 180, y + 54, { size: 30, color: '#d8c8a6' });

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
  const sourceLine = names.length > 2
    ? names.slice(0, 2).join(' · ') + ' 等 ' + names.length + ' 种'
    : (names.join(' · ') || '无可招募');
  text(ctx, '此地兵源', PAD + 22, y + 104, { size: 17, color: '#8a8070' });
  text(ctx, sourceLine, PAD + 22, y + 132, { size: 20, color: '#c9bda2' });

  ctx.fillStyle = 'rgba(240,192,96,0.25)';
  ctx.fillRect(PAD + 20, y + 170, bw - 40, 1);
  const lines = wrap(ctx, (reg.name ? '【' + reg.name + '】' : '') + (reg.flavor || ''), bw - 44, 17, 'normal');
  lines.slice(0, 2).forEach(function (l, i) {
    text(ctx, l, PAD + 22, y + 186 + i * 26, { size: 17, color: '#8f8571' });
  });
}

/* ---------------------------------------------------------------- 围城 */

function renderSiege(app, site) {
  const ctx = app.runtime.ctx;
  const w = app.runtime.width;
  const H = app.runtime.height;
  const st = app.state;
  const ps = st.playerSiege;
  const active = !!ps && ps.siteId === site.id;
  const storming = !!(active && ps.stage === 'storming');

  text(ctx, storming ? '进攻中' : '围城', PAD, 296, {
    size: 30, color: storming ? '#e08a50' : '#f0c060',
  });
  text(ctx, site.name + ' · 守军 ' + (site.garrison || 0) + ' 人', w - PAD, 304, {
    size: 18, align: 'right', color: '#a2947a',
  });

  if (!active) {
    text(ctx, '城下还没有你的营寨。要攻这座城，先围起来。', PAD, 354, { size: 20, color: '#c9bda2' });
    app.ui.button(ctx, PAD, 420, w - PAD * 2, 88, '开始围城', {
      id: 'siege_begin', size: 26, fill: '#4a241c', onTap: function () {
        const r = stateLib.beginPlayerSiege(st, site);
        if (!r.ok) { app.showToast(r.msg, 2.4); return; }
        app.showToast('城下扎营：回大地图等时辰，围成后才能决战。', 3);
        app.pop();
      },
    });
    app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '回大地图', {
      id: 'siege_back2', size: 26, fill: '#241c14', onTap: function () { app.pop(); },
    });
    return;
  }

  const now = stateLib.gameHours(st);
  const left = Math.max(0, ps.readyHour - now);
  const ready = ps.stage === 'ready' || left <= 0;
  const day = Math.min(ps.days, Math.floor(Math.max(0, now - ps.startHour) / 24) + 1);
  const ring = Math.max(0, 1 - left / (ps.days * 24));

  panel(ctx, PAD, 350, w - PAD * 2, 230, { fill: '#241c14' });
  text(ctx, '围城第 ' + day + ' / ' + ps.days + ' 天', PAD + 18, 366, { size: 30, color: '#efe3c6' });
  bar(ctx, PAD + 18, 408, w - PAD * 2 - 36, 12, ring, '#c97a42');
  text(ctx, storming ? '云梯已经架上城头，攻城正在进行；这一仗要一回合一阵打到一方倒下。'
    : (ready ? '壕沟已推到城门下，守军开始挂白旗。' : '四面扎营，断粮道、填壕沟；城中还没开门。'),
    PAD + 18, 432, { size: 17, color: storming ? '#e08a50' : (ready ? '#8fbf7a' : '#a2947a') });
  text(ctx, storming ? '攻城中' : (ready ? '可以决战了。' : '还需 ' + Math.ceil(left) + ' 个时辰（约 ' + Math.ceil(left / 24) + ' 天）'),
    PAD + 18, 470, { size: 20, color: storming ? '#e08a50' : (ready ? '#8fbf7a' : '#f0c060') });
  text(ctx, '围城期间粮草照常消耗；撤围或攻城失败，营寨就散了。', PAD + 18, 508, {
    size: 15, color: '#8a8070',
  });

  app.ui.button(ctx, PAD, 610, w - PAD * 2, 88,
    ready ? '回大地图 · 围城已成' : '回大地图 · 时辰照走', {
      id: 'siege_wait', size: 24, fill: '#33271b',
      onTap: function () {
        app.showToast(ready ? '围城已成：回地图点城下营寨，即可决战。' : '回大地图看时辰流动；围满再回来决战。', 2.4);
        app.pop();
      },
    });

  app.ui.button(ctx, PAD, 718, w - PAD * 2, 96, ready ? '决战 · 攻城' : '决战（先把城围成）', {
    id: 'siege_storm', size: 28, fill: '#4a241c', disabled: !ready, onTap: function () {
      const battle = stateLib.startSiege(st, site);
      if (!battle) { app.showToast('还不到决战的时候。', 2); return; }
      app.push('battle', { mode: 'siege' });
    },
  });

  app.ui.button(ctx, PAD, 836, w - PAD * 2, 78, '撤围 · 退回野地', {
    id: 'siege_cancel', size: 24, fill: '#241c14', onTap: function () {
      const r = stateLib.cancelPlayerSiege(st);
      app.showToast(r.msg, 2);
      app.pop();
    },
  });

  text(ctx, '围城计时只在大地图上走：时辰每流一点，壕沟就往城门推进一点。', w / 2, 936, {
    size: 15, align: 'center', color: '#8a8070',
  });
  app.ui.button(ctx, PAD, H - 100, w - PAD * 2, 84, '回大地图', {
    id: 'siege_back', size: 26, fill: '#241c14', onTap: function () { app.pop(); },
  });
}

/* ---------------------------------------------------------------- 场景 */

const TownScene = {
  enter(app, params) {
    app.restView = null;
    const st = app.state;
    // 进城先收脚：把地图上的行军插值、跟随和围城提示一起清掉，
    // 不把“还差半步”的进度带进城，也不让出城后沿着旧路线继续滑。
    if (st) {
      stateLib.stopMoving(st);
      if (params && params.siteId) {
        st.player.atSiteId = params.siteId;
        const site = siteById(st.world, params.siteId);
        if (site) site.visited = true;
      }
    }
    app.mapDrag = null;
    app.follow = null;
    app.siegePrompt = null;
    app.mapIdleRest = false;
    const autoSiege = st && st.playerSiege && st.playerSiege.siteId === params.siteId;
    app.townView = {
      siteId: params.siteId,
      view: params.view || (autoSiege ? 'siege' : 'menu'),
      tab: 'food',
      goodId: null,
      estimate: null,
      scroll: 0,
      maxScroll: 0,
      lordScroll: 0,
      lordMaxScroll: 0,
      lordMode: 'all',
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

    scenery.drawBackdrop(app.runtime.ctx, site.type === 'village' ? 'village' : 'city',
      app.runtime.width, app.runtime.height, siteSeed(site.id));
    header(app, site);
    const y = statusBar(app, 148);

    const v = app.townView.view;
    if (v === 'recruit') renderRecruit(app, site);
    else if (v === 'recruitSource') renderRecruitSource(app, site);
    else if (v === 'market') renderMarket(app, site, app.townView.tab || 'goods');
    else if (v === 'village') renderVillage(app, site);
    else if (v === 'tavern') renderTavern(app, site);
    else if (v === 'hall') renderHall(app, site);
    else if (v === 'lords') renderLordList(app, site);
    else if (v === 'siege') renderSiege(app, site);
    else if (v === 'hermit') renderHermit(app, site);
    else {
      renderMenu(app, site);
    }
  },

  onTouchStart(app, x, y) {
    const v = app.townView.view;
    app.townView.drag = {
      y: y,
      view: v,
      scroll: v === 'lords' ? (app.townView.lordScroll || 0) : (app.townView.scroll || 0),
      moved: 0,
    };
  },

  onTouchMove(app, x, y) {
    const d = app.townView.drag;
    if (!d) return;
    if (app.townView.view !== 'menu' && app.townView.view !== 'lords') return;
    const dy = y - d.y;
    if (Math.abs(dy) > 6) d.moved = Math.abs(dy);
    if (d.moved > 6) {
      if (app.townView.view === 'lords') {
        const max = app.townView.lordMaxScroll || 0;
        app.townView.lordScroll = Math.max(0, Math.min(max, d.scroll - dy));
      } else {
        const max = app.townView.maxScroll || 0;
        app.townView.scroll = Math.max(0, Math.min(max, d.scroll - dy));
      }
    }
  },

  onTouchEnd(app) {
    if (app.townView) app.townView.drag = null;
  },

  onWheel(app, dy) {
    if (!app.townView) return;
    if (app.townView.view === 'lords') {
      const max = app.townView.lordMaxScroll || 0;
      app.townView.lordScroll = Math.max(0, Math.min(max, (app.townView.lordScroll || 0) + dy));
    } else if (app.townView.view === 'menu') {
      const max = app.townView.maxScroll || 0;
      app.townView.scroll = Math.max(0, Math.min(max, (app.townView.scroll || 0) + dy));
    }
  },
};

module.exports = TownScene;


