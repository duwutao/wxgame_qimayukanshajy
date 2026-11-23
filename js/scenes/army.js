/**
 * 队伍页：兵力构成、士气、装备、史简
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const armyLib = require('../core/army.js');
const heroesLib = require('../core/heroes.js');
const { HERO_MAX_LEVEL } = require('../data/extra.js');
const { TROOPS } = require('../data/troops.js');
const { EQUIPMENT } = require('../data/china.js');

const ArmyScene = {
  enter(app) {
    app.armyScroll = 0;
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

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '队伍', 20, 24, { size: 36, color: '#f0c060' });
    text(ctx, stateLib.renownTitle(p.renown), w - 20, 36, { size: 18, align: 'right', color: '#a2947a' });

    // 总兵力
    ctx.fillStyle = '#241c14';
    ctx.fillRect(16, 84, w - 32, 116);
    text(ctx, count + ' / ' + cap, 36, 100, { size: 40, color: '#efe3c6' });
    text(ctx, '人', 200, 118, { size: 18, color: '#8a8070' });
    text(ctx, '日耗粮 ' + armyLib.foodPerDay(p.troops) + ' · 存粮 ' + p.food, 36, 156, {
      size: 17, color: p.food < armyLib.foodPerDay(p.troops) * 3 ? '#d06a4a' : '#a2947a',
    });
    bar(ctx, 16, 196, w - 32, 10, p.morale / 100, p.morale < 40 ? UI_COLORS.danger : UI_COLORS.good);
    text(ctx, '士气 ' + p.morale, 20, 212, { size: 16, color: '#8a8070' });

    // 兵种
    let y = 252;
    text(ctx, '编制', 20, y - 28, { size: 20, color: '#a2947a' });
    const ids = Object.keys(p.troops).filter(function (id) { return p.troops[id] > 0; });
    if (!ids.length) {
      text(ctx, '（空）', 20, y, { size: 18, color: '#8a8070' });
    }
    ids.sort(function (a, b) {
      return (TROOPS[b] ? TROOPS[b].tier : 0) - (TROOPS[a] ? TROOPS[a].tier : 0);
    }).forEach(function (id) {
      const t = TROOPS[id] || { name: id, tier: 1 };
      ctx.fillStyle = 'rgba(36,28,20,0.6)';
      ctx.fillRect(16, y, w - 32, 62);
      text(ctx, t.name, 32, y + 10, { size: 22, color: '#efe3c6' });
      text(ctx, '× ' + p.troops[id], w - 32, y + 12, { size: 22, align: 'right', color: '#f0c060' });
      text(ctx, '攻 ' + (t.atk || 0) + ' 防 ' + (t.def || 0) + ' 粮 ' + (t.food || 1) + ' 级 ' + (t.tier || 1), 32, y + 40, {
        size: 15, color: '#8a8070',
      });
      y += 70;
    });

    // 随行英雄
    if ((p.heroes || []).length) {
      y += 6;
      text(ctx, '随行英雄', 20, y, { size: 20, color: '#a2947a' });
      text(ctx, '满级 ' + HERO_MAX_LEVEL, w - 20, y + 4, { size: 15, align: 'right', color: '#8a8070' });
      y += 30;
      p.heroes.forEach(function (h) {
        const def = heroesLib.heroById(h.id) || { name: h.id };
        ctx.fillStyle = 'rgba(36,28,20,0.55)';
        ctx.fillRect(16, y, w - 32, 54);
        text(ctx, def.name, 32, y + 8, { size: 21, color: '#efe3c6' });
        text(ctx, 'Lv ' + h.level, w - 130, y + 10, { size: 19, align: 'right', color: '#f0c060' });
        bar(ctx, w - 120, y + 16, 92, 8, h.level >= HERO_MAX_LEVEL ? 1 : h.exp / (h.level * heroesLib.EXP_PER_LEVEL), '#7fae6a');
        text(ctx, '+攻 ' + Math.round((h.level || 1) * 1.1) + '% · +防 ' + Math.round((h.level || 1) * 0.8) + '%', 32, y + 32, {
          size: 14, color: '#8a8070',
        });
        y += 62;
      });
    }

    // 装备
    y += 8;
    text(ctx, '装备', 20, y, { size: 20, color: '#a2947a' });
    y += 28;
    ['blade', 'armor', 'horse'].forEach(function (slot) {
      const eq = EQUIPMENT[slot];
      const tier = eq.tiers[Math.min(p.equip[slot] || 0, eq.tiers.length - 1)];
      text(ctx, eq.name, 20, y, { size: 17, color: '#8a8070' });
      text(ctx, tier.name, 110, y - 2, { size: 19, color: '#efe3c6' });
      y += 34;
    });

    // 史简
    text(ctx, '史简 × ' + p.shi + '（已用 ' + p.shiUsed + '）', 20, y + 8, { size: 19, color: '#c9a0e0' });
    y += 56;

    // 战绩：把下半屏填满，也让人看清这一路走得怎样
    if (y + 120 < h - 110) {
      text(ctx, '战绩', 20, y, { size: 20, color: '#a2947a' });
      y += 30;
      const stt = st.stats || {};
      const cells = [
        ['胜', stt.battlesWon || 0],
        ['负', stt.battlesLost || 0],
        ['折兵', stt.troopsLost || 0],
        ['得金', stt.goldEarned || 0],
        ['行军', (stt.distance || 0) + ' 格'],
        ['攻城', stt.sitesTaken || 0],
      ];
      const cw = (w - 32) / 3;
      cells.forEach(function (c, i) {
        const cx = 16 + (i % 3) * cw;
        const cy = y + Math.floor(i / 3) * 60;
        ctx.fillStyle = 'rgba(36,28,20,0.55)';
        ctx.fillRect(cx + 2, cy, cw - 6, 52);
        text(ctx, c[0], cx + 14, cy + 8, { size: 15, color: '#8a8070' });
        text(ctx, String(c[1]), cx + 14, cy + 26, { size: 24, color: '#efe3c6' });
      });
      y += 126;
    }

    // 记事
    if (y < h - 180) {
      text(ctx, '记事', 20, y, { size: 20, color: '#a2947a' });
      y += 26;
      const logs = (st.log || []).slice(-3).reverse();
      if (!logs.length) text(ctx, '还没有可记的事。', 20, y, { size: 16, color: '#8a8070' });
      logs.forEach(function (l) {
        if (y > h - 150) return;
        const wrapped = wrap(ctx, '第' + l.day + '天 · ' + l.text, w - 48, 15, 'normal');
        wrapped.slice(0, 2).forEach(function (line) {
          text(ctx, line, 20, y, { size: 15, color: '#a2947a' });
          y += 20;
        });
        y += 4;
      });
    }

    app.ui.button(ctx, 20, h - 92, w - 40, 72, '返回', {
      id: 'a_back', size: 26, onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ArmyScene;
