/**
 * 队伍页：兵力构成、遣返士兵、随行英雄（点进去能说话）
 * 内容是长列表，可上下拖
 */

const { text, bar, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const armyLib = require('../core/army.js');
const heroesLib = require('../core/heroes.js');
const { HERO_MAX_LEVEL } = require('../data/extra.js');
const { TROOPS } = require('../data/troops.js');
const { EQUIPMENT } = require('../data/china.js');

const TOP = 248;
const BOT = 104;

const ArmyScene = {
  enter(app) {
    app.armyScroll = 0;
    this.scroll = 0;
    this.maxScroll = 0;
    this.contentH = 0;
    this.rows = [];
    this.drag = null;
    this.savedScroll = 0;
  },
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) {
      app.pop();
      return;
    }
    const p = st.player;
    const count = armyLib.troopCount(p.troops);
    const cap = stateLib.capacity(st);
    const hb = heroesLib.heroBonus(st);
    const heroLimit = heroesLib.heroCap(st);

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    // 顶部固定
    text(ctx, '队伍', 20, 24, { size: 36, color: '#f0c060' });
    text(ctx, stateLib.renownTitle(p.renown), w - 20, 34, { size: 18, align: 'right', color: '#a2947a' });

    ctx.fillStyle = '#241c14';
    ctx.fillRect(16, 74, w - 32, 148);
    text(ctx, count + ' / ' + cap, 36, 86, { size: 40, color: '#efe3c6' });
    text(ctx, '人', 200, 106, { size: 18, color: '#8a8070' });
    text(ctx, '两日耗粮 ' + Math.max(1, Math.round(armyLib.foodPerDay(p.troops) * 2 * (1 - hb.foodPct))) +
      ' · 存粮 ' + p.food, 36, 136, {
      size: 17, color: p.food < armyLib.foodPerDay(p.troops) * 6 ? '#d06a4a' : '#a2947a',
    });
    bar(ctx, 16, 162, w - 32, 10, p.morale / 100, p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);
    text(ctx, '士气 ' + p.morale + (hb.morale ? '（英雄 +' + hb.morale + '/日）' : ''), 20, 208, { size: 16, color: '#8a8070' });
    text(ctx, '英雄 ' + (p.heroes || []).length + ' / ' + heroLimit + '（声望 ' + p.renown + '）', w - 20, 208, {
      size: 16, align: 'right', color: (p.heroes || []).length >= heroLimit ? '#d06a4a' : '#8a8070',
    });

    // ---- 滚动区 ----
    this.rows = [];
    const viewH = h - TOP - BOT;
    let y = 0; // 相对坐标
    const rowRects = [];

    y += 6;
    rowRects.push({ kind: 'head', y: y, text: '编制（可遣返）' });
    y += 28;

    const ids = Object.keys(p.troops).filter(function (id) { return p.troops[id] > 0; });
    if (!ids.length) {
      rowRects.push({ kind: 'empty', y: y, text: '（队伍空了，去城里再招些人）' });
      y += 34;
    }
    ids.sort(function (a, b) {
      return (TROOPS[b] ? TROOPS[b].tier : 0) - (TROOPS[a] ? TROOPS[a].tier : 0);
    }).forEach(function (id) {
      const t = TROOPS[id] || { name: id, tier: 1 };
      rowRects.push({ kind: 'troop', y: y, id: id, name: t.name, n: p.troops[id], troop: t });
      y += 62;
    });

    y += 10;
    rowRects.push({ kind: 'head', y: y, text: '随行英雄（点名字说话）' });
    y += 28;
    const list = p.heroes || [];
    if (!list.length) {
      rowRects.push({ kind: 'empty', y: y, text: '（还没有人跟你走）' });
      y += 34;
    }
    list.forEach(function (hh, i) {
      const def = heroesLib.heroById(hh.id) || { name: hh.id };
      const b = heroesLib.bonusOf(hh.id, hh.level);
      rowRects.push({ kind: 'hero', y: y, index: i, name: def.name, level: hh.level, exp: hh.exp, bonus: b });
      y += 66;
    });

    y += 10;
    rowRects.push({ kind: 'head', y: y, text: '队伍加成' });
    y += 28;
    rowRects.push({
      kind: 'bonus', y: y,
      lines: [
        '攻击 +' + (hb.atkPct * 100).toFixed(0) + '%　防御 +' + (hb.defPct * 100).toFixed(0) + '%',
        '行军 +' + (hb.speedPct * 100).toFixed(0) + '%　日耗 -' + (hb.foodPct * 100).toFixed(0) + '%',
        '缴获 +' + (hb.lootPct * 100).toFixed(0) + '%　士气 +' + hb.morale + '/日',
      ],
    });
    y += 76;

    y += 6;
    rowRects.push({ kind: 'head', y: y, text: '装备' });
    y += 28;
    ['blade', 'armor', 'horse'].forEach(function (slot) {
      const eq = EQUIPMENT[slot];
      const tier = eq.tiers[Math.min(p.equip[slot] || 0, eq.tiers.length - 1)];
      rowRects.push({ kind: 'equip', y: y, label: eq.name, value: tier.name });
      y += 34;
    });

    y += 6;
    rowRects.push({ kind: 'shijian', y: y, shi: p.shi, used: p.shiUsed });
    y += 44;

    this.contentH = y + 12;
    this.maxScroll = Math.max(0, this.contentH - viewH);
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll;
    if (this.scroll < 0) this.scroll = 0;
    app.armyScroll = this.scroll;

    // 侧栏滚动条
    if (this.maxScroll > 0) {
      const trackX = w - 8;
      ctx.fillStyle = 'rgba(60,50,38,0.5)';
      ctx.fillRect(trackX, TOP, 4, viewH);
      const bh = Math.max(40, viewH * (viewH / this.contentH));
      const by = TOP + (viewH - bh) * (this.scroll / this.maxScroll);
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(trackX, by, 4, bh);
    }

    const scroll = this.scroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, w, viewH);
    ctx.clip();
    ctx.translate(0, TOP - scroll);

    rowRects.forEach(function (r) {
      const ry = r.y;
      if (ry > scroll + viewH + 40 || ry + 80 < scroll - 20) return;
      if (r.kind === 'head') {
        text(ctx, r.text, 20, ry, { size: 20, color: '#a2947a' });
      } else if (r.kind === 'empty') {
        text(ctx, r.text, 20, ry, { size: 18, color: '#8a8070' });
      } else if (r.kind === 'troop') {
        ctx.fillStyle = 'rgba(36,28,20,0.6)';
        ctx.fillRect(16, ry, w - 32, 54);
        const icon = app.assets.unitIconFor ? app.assets.unitIconFor(r.id, '#8a7a5a') : null;
        if (icon) ctx.drawImage(icon, 30, ry + 13, 30, 30);
        text(ctx, r.name, 68, ry + 8, { size: 22, color: '#efe3c6' });
        text(ctx, '× ' + r.n, w - 160, ry + 10, { size: 22, align: 'right', color: '#f0c060' });
        text(ctx, '攻 ' + (r.troop.atk || 0) + ' 防 ' + (r.troop.def || 0) + ' 粮 ' + (r.troop.food || 1) + ' · T' + (r.troop.tier || 1), 68, ry + 36, {
          size: 15, color: '#8a8070',
        });
        // 遣返按钮
        drawBtn(ctx, w - 126, ry + 12, 48, 32, '遣1', '#5a4a2a');
        drawBtn(ctx, w - 72, ry + 12, 48, 32, '遣5', '#4a3a24');
      } else if (r.kind === 'hero') {
        ctx.fillStyle = 'rgba(36,28,20,0.55)';
        ctx.fillRect(16, ry, w - 32, 58);
        text(ctx, r.name, 32, ry + 9, { size: 21, color: '#efe3c6' });
        text(ctx, 'Lv ' + r.level, w - 24, ry + 10, { size: 19, align: 'right', color: '#f0c060' });
        text(ctx, r.bonus.text || '无加成', 32, ry + 34, { size: 14, color: '#8a8070' });
        const expNeed = r.level >= HERO_MAX_LEVEL ? '满级' : '经验 ' + (r.exp || 0) + '/' + (r.level * heroesLib.EXP_PER_LEVEL);
        text(ctx, expNeed, w - 24, ry + 35, { size: 13, align: 'right', color: '#6a6355' });
      } else if (r.kind === 'bonus') {
        ctx.fillStyle = 'rgba(36,28,20,0.5)';
        ctx.fillRect(16, ry, w - 32, 64);
        r.lines.forEach(function (line, i) {
          text(ctx, line, 32, ry + 10 + i * 20, { size: 16, color: '#c9c0a8' });
        });
      } else if (r.kind === 'equip') {
        text(ctx, r.label, 20, ry, { size: 17, color: '#8a8070' });
        text(ctx, r.value, 110, ry - 2, { size: 19, color: '#efe3c6' });
      } else if (r.kind === 'shijian') {
        text(ctx, '天机简 × ' + r.shi + '（已用 ' + r.used + '）', 20, ry + 6, { size: 19, color: '#c9a0e0' });
      }
    });

    ctx.restore();

    // 顶部/底部渐隐
    const grad1 = ctx.createLinearGradient(0, TOP, 0, TOP + 24);
    grad1.addColorStop(0, 'rgba(20,16,12,0.95)');
    grad1.addColorStop(1, 'rgba(20,16,12,0)');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, TOP, w, 24);
    const grad2 = ctx.createLinearGradient(0, h - BOT - 24, 0, h - BOT);
    grad2.addColorStop(0, 'rgba(20,16,12,0)');
    grad2.addColorStop(1, 'rgba(20,16,12,0.95)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, h - BOT - 24, w, 24);

    app.ui.button(ctx, 20, h - 92, w - 40, 72, '返回', {
      id: 'a_back', size: 26, onTap: function () { app.pop(); },
    });

    const jail = stateLib.prisonersOf(st).filter(function (x) { return x.by === 'player'; }).length;
    if (jail > 0) {
      app.ui.button(ctx, 20, h - 164, w - 40, 60, '营后牢里 ' + jail + ' 位领主 · 收赎金 / 放人', {
        id: 'a_prison', size: 22, fill: '#3a2c1e', onTap: function () { app.push('prison'); },
      });
    }

    // 记录命中区（屏幕坐标）
    this.hitRows = rowRects;
  },

  onTouchStart(app, x, y) {
    this.drag = { y: y, scroll: this.scroll, moved: 0, x: x };
  },

  onTouchMove(app, x, y) {
    if (!this.drag) return;
    const dy = y - this.drag.y;
    if (Math.abs(dy) > 6) this.drag.moved = Math.abs(dy);
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.drag.scroll - dy));
  },

  onTouchEnd(app, x, y) {
    const d = this.drag || { moved: 0 };
    this.drag = null;
    if (d.moved > 8) return; // 拖动过就不算点击

    const w = app.runtime.width;
    const list = this.hitRows || [];
    for (let i = 0; i < list.length; i += 1) {
      const r = list[i];
      const sy = TOP - this.scroll + r.y;
      if (r.kind === 'troop') {
        if (y < sy + 6 || y > sy + 50) continue;
        if (x >= w - 126 && x <= w - 78) {
          this.dismissTroops(app, r.id, 1);
          return;
        }
        if (x >= w - 72 && x <= w - 24) {
          this.dismissTroops(app, r.id, 5);
          return;
        }
      } else if (r.kind === 'hero') {
        if (y >= sy && y <= sy + 58 && x >= 16 && x <= w - 16) {
          app.push('hero', { index: r.index });
          return;
        }
      }
    }
  },

  dismissTroops(app, troopId, n) {
    const p = app.state.player;
    const have = p.troops[troopId] || 0;
    if (have <= 0) return;
    const cut = Math.min(n, have);
    p.troops[troopId] = have - cut;
    if (p.troops[troopId] <= 0) delete p.troops[troopId];
    stateLib.pushLog(app.state, '在营地遣散了 ' + cut + ' 名' + ((TROOPS[troopId] || {}).name || troopId) + '，发了路费。');
  },
};

function drawBtn(ctx, x, y, w, h, label, color) {
  ctx.fillStyle = color || '#4a3a24';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8a7448';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  text(ctx, label, x + w / 2, y + 7, { size: 17, align: 'center', color: '#e8dcc0' });
}

module.exports = ArmyScene;
