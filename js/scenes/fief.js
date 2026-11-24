/**
 * 封地页：把打下来的城、关隘、村庄封给任意领主。
 *
 * 三种进入方式：
 * 1. 城池/村庄菜单“封地 · 点将” → 列出所有玩家领地，点一块进去点将
 * 2. 英雄页“封地出镇” → 先给这名英雄选一块空封地，再封他做独立领主
 * 3. 点将页里也可以把队中英雄直接封出去
 */

const { text, wrap } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const scenery = require('../render/scenery.js');
const army = require('../core/army.js');
const heroes = require('../core/heroes.js');
const { siteById, regionDef } = require('../core/world.js');
const { FACTIONS } = require('../data/china.js');

const PAD = 24;
const LIST_BOTTOM_GAP = 160;
const SITE_ROW_H = 122;
const SITE_GAP = 12;
const LORD_ROW_H = 112;
const LORD_GAP = 10;

function siteKind(site) {
  return site.type === 'town' ? '城' : site.type === 'castle' ? '关隘' : site.type === 'village' ? '村' : '地';
}

function siteLine(site) {
  const fac = site.ownerFaction ? FACTIONS[site.ownerFaction] : null;
  const region = (regionDef(site.region) || {}).name || '';
  return siteKind(site) + ' · ' + (fac ? fac.full : '你的旗') + (region ? ' · ' + region : '');
}

function lordLine(st, lord) {
  const n = army.troopCount(lord.troops);
  const cap = stateLib.lordTroopCap(lord);
  return 'Lv' + stateLib.lordLevel(lord) + ' · 兵 ' + n + ' / ' + cap;
}

function fiefNames(st, lord) {
  const list = stateLib.lordFiefs(st, lord);
  if (!list.length) return '尚无封地';
  return list.map(function (s) { return s.name; }).slice(0, 3).join('、') +
    (list.length > 3 ? ' 等 ' + list.length + ' 处' : '');
}

const FiefScene = {
  enter(app, params) {
    const p = params || {};
    this.siteId = p.siteId || null;
    this.heroId = p.heroId || null;
    this.mode = this.heroId ? 'pickHero' : (this.siteId ? 'list' : 'list');
    this.page = 0;
    this.sitePage = 0;
    this.scrolls = { list: 0, pickHero: 0, lords: 0 };
    this.scrollMax = 0;
    this.drag = null;
    this.dragMoved = 0;
    this.msg = '';
  },

  update() {},

  ownedSites(app) {
    const list = (app.state.world.sites || []).filter(function (s) {
      return s.playerOwned && s.type !== 'camp';
    });
    const focus = this.siteId;
    return list.slice().sort(function (a, b) {
      if (focus && a.id === focus) return -1;
      if (focus && b.id === focus) return 1;
      const rank = { town: 0, castle: 1, village: 2 };
      const ra = rank[a.type] === undefined ? 3 : rank[a.type];
      const rb = rank[b.type] === undefined ? 3 : rank[b.type];
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });
  },

  playerLords(app) {
    return (app.state.lords || []).filter(function (l) {
      return l.alive && !l.prisoner && !l.hidden && l.faction === 'player';
    }).sort(function (a, b) {
      return stateLib.lordLevel(b) - stateLib.lordLevel(a);
    });
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;

    ctx.fillStyle = '#12100c';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'hall', w, h, 41);

    if (this.mode === 'lords') return this.renderLordPick(app, ctx, w, h);
    if (this.mode === 'pickHero') return this.renderHeroSites(app, ctx, w, h);
    return this.renderSiteList(app, ctx, w, h);
  },

  header(ctx, w, title, sub) {
    text(ctx, title, PAD, 34, { size: 40, color: '#f0c060' });
    if (sub) text(ctx, sub, PAD, 92, { size: 17, color: '#a2947a' });
  },

  footerButton(app, ctx, w, h, label, id, onTap, fill) {
    app.ui.button(ctx, PAD, h - 108, w - PAD * 2, 78, label, {
      id: id, size: 24, fill: fill || '#241c14', onTap: onTap,
    });
  },

  scrollKey() {
    return this.mode === 'lords' ? 'lords' : (this.mode === 'pickHero' ? 'pickHero' : 'list');
  },

  scrollValue() {
    return this.scrolls[this.scrollKey()] || 0;
  },

  setScroll(v) {
    this.scrolls[this.scrollKey()] = Math.max(0, Math.min(this.scrollMax || 0, v || 0));
  },

  scrollView(h, y0) {
    const bottom = h - LIST_BOTTOM_GAP;
    return { y0: y0, bottom: bottom, height: Math.max(120, bottom - y0) };
  },

  setupScroll(contentH, viewH) {
    this.scrollMax = Math.max(0, contentH - viewH);
    const key = this.scrollKey();
    this.scrolls[key] = Math.max(0, Math.min(this.scrollMax, this.scrolls[key] || 0));
    return this.scrolls[key];
  },

  scrollBar(ctx, w, view, scroll, contentH) {
    if (this.scrollMax <= 0) return;
    const trackH = view.height;
    ctx.fillStyle = 'rgba(80,66,46,0.35)';
    ctx.fillRect(w - 8, view.y0, 4, trackH);
    const thumbH = Math.max(34, trackH * (view.height / contentH));
    const thumbY = view.y0 + (trackH - thumbH) * (scroll / this.scrollMax);
    ctx.fillStyle = '#8a7448';
    ctx.fillRect(w - 8, thumbY, 4, thumbH);
    text(ctx, '滚轮 / 上下拖动查看全部', PAD, view.bottom + 8, {
      size: 14, color: '#8a8070',
    });
  },

  renderSiteList(app, ctx, w, h) {
    const st = app.state;
    const all = this.ownedSites(app);
    const p = st.player;
    this.header(ctx, w, '封地 · 点将',
      all.length
        ? '你有 ' + all.length + ' 处城与村。点一块地，决定由谁驻守。'
        : '还没有可封的城与村。打下第一座城后，这里就能点将。');

    if (!all.length) {
      text(ctx, '先打下一座城或村庄。', PAD, 180, { size: 22, color: '#c9bda2' });
      this.footerButton(app, ctx, w, h, '返回', 'fief_back', function () { app.pop(); }, '#241c14');
      return;
    }

    const y0 = 168;
    const view = this.scrollView(h, y0);
    const contentH = all.length * (SITE_ROW_H + SITE_GAP);
    const scroll = this.setupScroll(contentH, view.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, view.y0, w, view.height);
    ctx.clip();
    all.forEach(function (site, i) {
      const y = y0 + i * (SITE_ROW_H + SITE_GAP) - scroll;
      if (y < view.y0 - SITE_ROW_H || y > view.bottom + SITE_ROW_H) return;
      const lord = stateLib.siteLord(st, site);
      const isSelf = stateLib.siteSelfFief(st, site);
      app.ui.button(ctx, PAD, y, w - PAD * 2, SITE_ROW_H, '', {
        id: 'fief_site_' + site.id, fill: site.id === app.state.player.atSiteId ? '#2f291f' : '#241c14',
        onTap: function () {
          app.top().scene.siteId = site.id;
          app.top().scene.mode = 'lords';
          app.top().scene.scrolls.lords = 0;
        },
      });
      text(ctx, site.name, PAD + 22, y + 16, { size: 30, color: '#efe3c6' });
      text(ctx, siteLine(site), PAD + 22, y + 56, { size: 16, color: '#a2947a' });
      text(ctx, isSelf ? '封主：你自己 · 每周进税' : lord ? '封主：' + lord.name + ' · ' + lordLine(st, lord) : '未封 · 可点将',
        PAD + 22, y + 86, { size: 16, color: isSelf ? '#f0c060' : lord ? '#d8c79e' : '#8fbf7a' });
      text(ctx, '点将 →', w - PAD - 20, y + 42, { size: 20, align: 'right', color: '#f0c060' });
    });
    ctx.restore();

    this.scrollBar(ctx, w, view, scroll, contentH);
    text(ctx, '封地不占编制。一位领主最多管一处城村；自己可以直辖多处，按周收税。',
      PAD, view.bottom + 30, { size: 15, color: '#8a8070' });
    this.footerButton(app, ctx, w, h, '返回城池', 'fief_back', function () { app.pop(); }, '#241c14');
  },

  renderHeroSites(app, ctx, w, h) {
    const st = app.state;
    const hero = (st.player.heroes || []).filter(function (x) { return x.id === app.top().scene.heroId; })[0];
    if (!hero) {
      app.pop();
      return;
    }
    const def = heroes.heroById(hero.id) || {};
    const name = def.name || hero.name || hero.id;
    const free = this.ownedSites(app).filter(function (s) { return !stateLib.siteLord(st, s) && !stateLib.siteSelfFief(st, s); });
    this.header(ctx, w, '为 ' + name + ' 选封地',
      'Lv' + (hero.level || 1) + ' · 选定一块空城/村后，他才会离开队伍，成为独立领主。');

    if (!free.length) {
      text(ctx, '名下没有空的封地。', PAD, 180, { size: 24, color: '#d06a4a' });
      text(ctx, '先到城里的“封地 · 点将”收回一处，再回来封他。', PAD, 226, { size: 18, color: '#a2947a' });
      this.footerButton(app, ctx, w, h, '返回', 'fief_hero_back', function () { app.pop(); }, '#241c14');
      return;
    }

    const y0 = 158;
    const view = this.scrollView(h, y0);
    const contentH = free.length * (SITE_ROW_H + SITE_GAP);
    const scroll = this.setupScroll(contentH, view.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, view.y0, w, view.height);
    ctx.clip();
    free.forEach(function (site, i) {
      const y = y0 + i * (SITE_ROW_H + SITE_GAP) - scroll;
      if (y < view.y0 - SITE_ROW_H || y > view.bottom + SITE_ROW_H) return;
      app.ui.button(ctx, PAD, y, w - PAD * 2, SITE_ROW_H, '', {
        id: 'fief_hero_site_' + site.id, fill: '#241c14',
        onTap: function () {
          const r = stateLib.promoteHero(st, hero.id, site.id);
          app.showToast(r.msg, 3.4);
          if (r.ok) app.pop();
        },
      });
      text(ctx, site.name, PAD + 22, y + 16, { size: 30, color: '#efe3c6' });
      text(ctx, siteLine(site), PAD + 22, y + 56, { size: 16, color: '#a2947a' });
      text(ctx, '封给他 · 独立带兵', PAD + 22, y + 86, { size: 16, color: '#8fbf7a' });
      text(ctx, '选此地 →', w - PAD - 20, y + 42, { size: 20, align: 'right', color: '#f0c060' });
    });
    ctx.restore();

    this.scrollBar(ctx, w, view, scroll, contentH);
    text(ctx, '封地后英雄从队伍中移出，带一半编制出镇，之后在封地补满。', PAD,
      view.bottom + 30, { size: 15, color: '#8a8070' });
    this.footerButton(app, ctx, w, h, '取消', 'fief_hero_back', function () { app.pop(); }, '#241c14');
  },

  renderLordPick(app, ctx, w, h) {
    const st = app.state;
    const site = siteById(st.world, this.siteId);
    if (!site) {
      app.pop();
      return;
    }
    const current = stateLib.siteLord(st, site);
    const selfCurrent = stateLib.siteSelfFief(st, site);
    this.header(ctx, w, '点将 · ' + site.name,
      siteLine(site) + ' · ' + (selfCurrent ? '现由你自己直辖' : current ? '现封主：' + current.name : '尚无封主'));
    text(ctx, '一位领主最多一处封地；改封会自动收回他原来的那处。自己直辖的城每周进税。',
      PAD, 132, { size: 15, color: '#8a8070' });

    const lords = this.playerLords(app);
    const heroesInParty = (st.player.heroes || []).slice();
    const rows = [{
      kind: 'self', id: 'self', name: '你自己（主公直辖）',
      sub: '不派领主 · 每周结算税赋 · 可持有多处',
    }];
    lords.forEach(function (l) {
      rows.push({
        kind: 'lord', id: l.id, name: l.name,
        sub: (l.independent ? '独立领主 · ' : '家臣 · ') + lordLine(st, l) + ' · ' + fiefNames(st, l),
        lord: l,
      });
    });
    heroesInParty.forEach(function (hh) {
      const def = heroes.heroById(hh.id) || {};
      const name = def.name || hh.name || hh.id;
      const cap = stateLib.lordCapForLevel(hh.level || 1);
      rows.push({
        kind: 'hero', id: hh.id, name: name,
        sub: '队中英雄 Lv' + (hh.level || 1) + ' · 出镇上限 ' + cap + ' 兵', hero: hh,
      });
    });

    if (!rows.length) {
      text(ctx, '手下还没有可派的人。', PAD, 180, { size: 24, color: '#d06a4a' });
      text(ctx, '去酒馆招英雄，或在英雄页把人留住。', PAD, 226, { size: 18, color: '#a2947a' });
    }

    const y0 = 158;
    const view = this.scrollView(h, y0);
    if (current || selfCurrent) view.bottom = h - 254;
    view.height = Math.max(120, view.bottom - view.y0);
    const contentH = rows.length * (LORD_ROW_H + LORD_GAP);
    const scroll = this.setupScroll(contentH, view.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, view.y0, w, view.height);
    ctx.clip();
    rows.forEach(function (row, i) {
      const y = y0 + i * (LORD_ROW_H + LORD_GAP) - scroll;
      if (y < view.y0 - LORD_ROW_H || y > view.bottom + LORD_ROW_H) return;
      const isCurrent = (row.kind === 'self' && selfCurrent) ||
        (row.kind === 'lord' && current && current.id === row.id);
      app.ui.button(ctx, PAD, y, w - PAD * 2, LORD_ROW_H, '', {
        id: 'fief_lord_' + row.kind + '_' + row.id,
        fill: isCurrent ? '#33291d' : '#241c14',
        onTap: function () {
          let r;
          if (row.kind === 'self') {
            r = stateLib.assignFiefSelf(st, site.id);
          } else if (row.kind === 'hero') {
            r = stateLib.promoteHero(st, row.id, site.id);
          } else {
            r = stateLib.assignFief(st, site.id, row.id);
          }
          app.showToast(r.msg, 3);
          if (r.ok) {
            app.top().scene.mode = 'list';
            app.top().scene.scrolls.list = 0;
          }
        },
      });
      text(ctx, row.name, PAD + 22, y + 14, { size: 28, color: '#efe3c6' });
      text(ctx, row.sub, PAD + 22, y + 52, { size: 16, color: '#a2947a' });
      text(ctx, isCurrent ? '当前封主' : (row.kind === 'self' ? '收归自己 →' : row.kind === 'hero' ? '封地出镇 →' : '封给他 →'),
        w - PAD - 20, y + 38, { size: 18, align: 'right', color: isCurrent ? '#8fbf7a' : '#f0c060' });
    });
    ctx.restore();

    this.scrollBar(ctx, w, view, scroll, contentH);

    if (current || selfCurrent) {
      app.ui.button(ctx, PAD, h - 190, w - PAD * 2, 64,
        current ? '收回 ' + current.name + ' 的这块封地' : '收回自己直辖（改封他人）', {
        id: 'fief_clear', size: 19, fill: '#3a2418',
        onTap: function () {
          const r = stateLib.assignFief(st, site.id, null);
          app.showToast(r.msg, 3);
          if (r.ok) app.top().scene.mode = 'list';
        },
      });
    }

    this.footerButton(app, ctx, w, h, '返回封地列表', 'fief_lords_back', function () {
      app.top().scene.mode = 'list';
      app.top().scene.scrolls.list = 0;
    }, '#241c14');
  },
  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.scrollValue(), moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (!this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 5) {
      this.drag.moved = Math.abs(dy);
      // 拖动时取消按钮的按下态，松手不会误点进封地。
      app.ui.pressed = null;
      this.setScroll(this.drag.scroll - dy);
    }
  },

  onTouchEnd() {
    this.drag = null;
  },

  onWheel(app, dy) {
    this.setScroll(this.scrollValue() + dy);
  },
};

module.exports = FiefScene;
