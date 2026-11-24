/**
 * 处理政务：一张案上同时管封地、外交。
 * 从自己的城/村菜单进来；封地分配复用原 fief 页，外交在这里谈。
 */

const { text, panel, bar } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const scenery = require('../render/scenery.js');
const { FACTIONS } = require('../data/china.js');
const { siteById } = require('../core/world.js');

const PAD = 20;
const DIPLO_ROW_H = 112;
const DIPLO_GAP = 10;

function facName(id) {
  return (FACTIONS[id] || {}).full || id;
}

const GovernScene = {
  enter(app, params) {
    this.siteId = params && params.siteId;
    this.view = 'main';
    this.page = 0;
    this.scroll = 0;
    this.choice = null;
    this.msg = '';
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.pop(); return; }
    const site = this.siteId ? siteById(st.world, this.siteId) : null;
    if (!site || !site.playerOwned) {
      app.pop();
      return;
    }

    ctx.fillStyle = '#12100c';
    ctx.fillRect(0, 0, w, h);
    scenery.drawBackdrop(ctx, 'hall', w, h, 53);
    // 案上的灯与摊开的竹简
    ctx.fillStyle = 'rgba(58,42,24,0.22)';
    ctx.fillRect(0, 0, w, 172);
    ctx.strokeStyle = 'rgba(240,192,96,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      ctx.beginPath();
      ctx.moveTo(PAD + i * 12, h * 0.45);
      ctx.lineTo(PAD + i * 12, h * 0.85);
      ctx.stroke();
    }

    if (this.view === 'diplo') return this.renderDiplomacy(app, ctx, w, h, site, st);
    if (this.view === 'choice') return this.renderChoice(app, ctx, w, h, site, st);

    text(ctx, '处理政务', PAD, 26, { size: 42, color: '#f0c060' });
    text(ctx, site.name + ' · 你的治所', PAD, 82, { size: 19, color: '#a2947a' });
    text(ctx, '封地、外交、赏罚，都从这张案上出去。', PAD, 116, { size: 16, color: '#8a8070' });

    const owned = st.world.sites.filter(function (s) { return s.playerOwned && s.type !== 'camp'; });
    const selfOwned = owned.filter(function (s) { return stateLib.siteSelfFief(st, s); });
    const taxed = selfOwned.reduce(function (sum, s) { return sum + stateLib.fiefTaxFor(s); }, 0);
    panel(ctx, PAD, 170, w - PAD * 2, 104, { fill: '#201a14' });
    text(ctx, '直辖 ' + selfOwned.length + ' 处 · 每周税赋 ' + taxed + ' 金钱', PAD + 18, 190, {
      size: 22, color: taxed > 0 ? '#f0c060' : '#8a8070',
    });
    text(ctx, '封臣 ' + owned.filter(function (s) { return !!stateLib.siteLord(st, s); }).length +
      ' 处；一位领主最多一处封地。', PAD + 18, 228, { size: 16, color: '#a2947a' });

    let y = 310;
    app.ui.button(ctx, PAD, y, w - PAD * 2, 112, '', {
      id: 'gov_fief', fill: '#33291d', onTap: function () {
        app.push('fief', { siteId: site.id });
      },
    });
    text(ctx, '封地分配', PAD + 26, y + 22, { size: 30, color: '#efe3c6' });
    text(ctx, '把城与村封给领主，或收归自己直辖；每位领主最多一处。', PAD + 26, y + 68, {
      size: 17, color: '#a2947a',
    });
    text(ctx, '点将 →', w - PAD - 24, y + 38, { size: 18, align: 'right', color: '#f0c060' });
    y += 132;

    app.ui.button(ctx, PAD, y, w - PAD * 2, 112, '', {
      id: 'gov_diplo', fill: '#2f2920', onTap: function () {
        app.top().scene.view = 'diplo';
        app.top().scene.page = 0;
      },
    });
    text(ctx, '外交 · 战与和', PAD + 26, y + 22, { size: 30, color: '#efe3c6' });
    text(ctx, '向列国递战书，或花金钱把仗停下来。杀过对方将领，议和会更难。', PAD + 26, y + 68, {
      size: 17, color: '#a2947a',
    });
    text(ctx, '列国 →', w - PAD - 24, y + 38, { size: 18, align: 'right', color: '#f0c060' });
    y += 132;

    text(ctx, '政务不需要等候，点下去就生效；封地税每七天结算一次。', PAD, y + 6, {
      size: 15, color: '#8a8070',
    });

    app.ui.button(ctx, PAD, h - 96, w - PAD * 2, 68, '返回城池', {
      id: 'gov_back', size: 23, fill: '#241c14', onTap: function () { app.pop(); },
    });
  },

  renderDiplomacy(app, ctx, w, h, site, st) {
    text(ctx, '外交 · 战与和', PAD, 26, { size: 42, color: '#f0c060' });
    text(ctx, '宣战只需一纸战书；议和要赔款。杀过对方的人，一个月内谈不成，之后赔款翻倍。',
      PAD, 82, { size: 16, color: '#8a8070' });

    const ids = Object.keys(FACTIONS).filter(function (id) {
      return id !== 'bandit' && id !== (st.player.faction || 'player');
    });
    const y0 = 140;
    const viewTop = y0;
    const viewBottom = h - 152;
    const viewH = Math.max(120, viewBottom - viewTop);
    const contentH = ids.length * (DIPLO_ROW_H + DIPLO_GAP);
    const maxScroll = Math.max(0, contentH - viewH);
    this.scrollMax = maxScroll;
    this.scroll = Math.max(0, Math.min(maxScroll, this.scroll || 0));

    if (!ids.length) {
      text(ctx, '天下已经没有可以谈的人了。', PAD, 180, { size: 20, color: '#a2947a' });
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, viewTop, w, viewH);
    ctx.clip();
    ids.forEach(function (id, i) {
      const y = y0 + i * (DIPLO_ROW_H + DIPLO_GAP) - (app.top().scene.scroll || 0);
      if (y < viewTop - DIPLO_ROW_H || y > viewBottom + DIPLO_ROW_H) return;
      const fac = FACTIONS[id];
      const fs = st.factionState[id] || {};
      const rel = stateLib.relationOf(st, id);
      const atWar = stateLib.atWarWith(st, id);
      app.ui.button(ctx, PAD, y, w - PAD * 2, DIPLO_ROW_H, '', {
        id: 'gov_fac_' + id, fill: atWar ? '#3a2418' : '#241c14',
        onTap: function () {
          app.top().scene.choice = id;
          app.top().scene.view = 'choice';
        },
      });
      ctx.fillStyle = fac.color;
      ctx.fillRect(PAD, y, 6, DIPLO_ROW_H);
      text(ctx, fac.full, PAD + 20, y + 14, { size: 26, color: '#efe3c6' });
      text(ctx, fac.name + ' · 关系 ' + rel + (fs.dead ? ' · 已亡' : ''),
        PAD + 20, y + 52, { size: 16, color: fs.dead ? '#6a6050' : '#a2947a' });
      text(ctx, atWar ? '交战中' : fs.dead ? '已亡' : '和平',
        w - PAD - 20, y + 22, { size: 18, align: 'right', color: atWar ? '#d06a4a' : fs.dead ? '#6a6050' : '#8fbf7a' });
      const terms = atWar ? stateLib.peaceTerms(st, id) : null;
      text(ctx, terms && terms.ok ? '议和 ' + terms.cost + ' 金钱'
        : terms && terms.waitDays ? '血债未消 · 等 ' + terms.waitDays + ' 天'
          : '点开 →', PAD + 20, y + 84, { size: 15, color: '#8a8070' });
    });
    ctx.restore();

    if (maxScroll > 0) {
      const trackH = viewH;
      ctx.fillStyle = 'rgba(80,66,46,0.35)';
      ctx.fillRect(w - 8, y0, 4, trackH);
      const thumbH = Math.max(34, trackH * (viewH / contentH));
      const thumbY = y0 + (trackH - thumbH) * (this.scroll / maxScroll);
      ctx.fillStyle = '#8a7448';
      ctx.fillRect(w - 8, thumbY, 4, thumbH);
      text(ctx, '滚轮 / 上下拖动查看全部列国', PAD, h - 148, {
        size: 14, color: '#8a8070',
      });
    } else {
      text(ctx, '两国交兵，先看清关系与血债，再递战书或谈和。', PAD, h - 148, {
        size: 14, color: '#8a8070',
      });
    }

    app.ui.button(ctx, PAD, h - 96, w - PAD * 2, 68, '返回政务', {
      id: 'gov_diplo_back', size: 23, fill: '#241c14', onTap: function () {
        app.top().scene.view = 'main';
      },
    });
  },

  renderChoice(app, ctx, w, h, site, st) {
    const id = this.choice;
    const fac = FACTIONS[id];
    if (!fac) {
      app.top().scene.view = 'diplo';
      return;
    }
    const fs = st.factionState[id] || {};
    const rel = stateLib.relationOf(st, id);
    const atWar = stateLib.atWarWith(st, id);
    const terms = atWar ? stateLib.peaceTerms(st, id) : null;
    const killDay = st.killRecords ? st.killRecords[id] : null;

    text(ctx, fac.full, PAD, 26, { size: 42, color: fac.color });
    text(ctx, fac.name + (fs.dead ? ' · 已亡' : ''), PAD, 82, { size: 19, color: '#a2947a' });
    text(ctx, '关系 ' + rel, PAD, 132, { size: 24, color: rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#c9bda2' });
    bar(ctx, PAD, 172, w - PAD * 2, 10, (rel + 100) / 200, rel < -25 ? '#d06a4a' : '#8fbf7a');

    panel(ctx, PAD, 214, w - PAD * 2, 160, { fill: '#201a14' });
    text(ctx, atWar ? '你们正在交战。' : fs.dead ? '这个势力已经灭了。' : '你们暂时相安无事。', PAD + 18, 234, {
      size: 20, color: atWar ? '#d06a4a' : '#c9bda2',
    });
    if (terms && terms.forever) {
      text(ctx, '你斩了他们的君主：这一家与你永世不议和，文书递进去也会被烧掉。',
        PAD + 18, 278, { size: 17, color: '#d06a4a' });
    } else if (killDay) {
      const passed = st.clock.day - killDay;
      text(ctx, passed < 30
        ? '你杀过对方的将领，血债未满一个月：议和会被驳回（还剩 ' + (30 - passed) + ' 天）。'
        : '血债已过一个月。对方愿意谈，但赔款要按双倍算。',
        PAD + 18, 278, { size: 17, color: '#c9a05a' });
    } else {
      text(ctx, '没有杀将旧账；议和只按关系和赔款谈。', PAD + 18, 278, {
        size: 17, color: '#8a8070',
      });
    }
    if (terms && terms.ok) {
      text(ctx, '议和赔款：' + terms.cost + ' 金钱（现有 ' + st.player.gold + '）', PAD + 18, 322, {
        size: 18, color: st.player.gold >= terms.cost ? '#f0c060' : '#d06a4a',
      });
    } else if (terms && terms.waitDays) {
      text(ctx, '议和驳回：还需等 ' + terms.waitDays + ' 天。', PAD + 18, 322, {
        size: 18, color: '#d06a4a',
      });
    }

    let y = 414;
    if (atWar) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, 92,
        terms && terms.ok ? '议和 · 支付 ' + terms.cost + ' 金钱' : '议和（暂不可）', {
          id: 'gov_peace', size: 25, fill: '#26372a',
          disabled: !(terms && terms.ok) || st.player.gold < terms.cost,
          onTap: function () {
            const r = stateLib.makePeaceWith(st, id);
            app.showToast(r.msg, 3.4);
            if (r.ok) {
              app.top().scene.view = 'diplo';
              app.top().scene.page = 0;
            }
          },
        });
      y += 112;
      text(ctx, terms && terms.ok ? '赔款一交，边关的鼓角就停。' : '对方还没有消气。',
        PAD, y, { size: 15, color: '#8a8070' });
    } else if (!fs.dead) {
      app.ui.button(ctx, PAD, y, w - PAD * 2, 92, '向' + fac.full + '宣战', {
        id: 'gov_war', size: 26, fill: '#3a2018',
        onTap: function () {
          const r = stateLib.declareWarFaction(st, id);
          app.showToast(r.msg, 3.4);
          if (r.ok) {
            app.top().scene.view = 'diplo';
            app.top().scene.page = 0;
          }
        },
      });
      y += 112;
      text(ctx, '战书递出去就生效；对方会立刻把你当敌人。', PAD, y, { size: 15, color: '#8a8070' });
    } else {
      text(ctx, '亡国的旗已经收了，没有可谈的人。', PAD, y, { size: 19, color: '#6a6050' });
    }

    app.ui.button(ctx, PAD, h - 96, w - PAD * 2, 68, '返回列国', {
      id: 'gov_choice_back', size: 23, fill: '#241c14', onTap: function () {
        app.top().scene.view = 'diplo';
      },
    });
  },

  onTouchStart(app, x, y) {
    if (this.view !== 'diplo') return;
    this.drag = { y: y, scroll: this.scroll || 0, moved: 0 };
  },

  onTouchMove(app, x, y) {
    if (this.view !== 'diplo' || !this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 5) this.drag.moved = Math.abs(dy);
    if (this.drag.moved > 5) {
      app.ui.pressed = null;
      this.scroll = Math.max(0, Math.min(this.scrollMax || 0, this.drag.scroll - dy));
    }
  },

  onTouchEnd() {
    this.drag = null;
  },

  onWheel(app, dy) {
    if (this.view !== 'diplo') return;
    this.scroll = Math.max(0, Math.min(this.scrollMax || 0, (this.scroll || 0) + dy));
  },
};

module.exports = GovernScene;
