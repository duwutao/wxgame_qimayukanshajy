/**
 * 被追上：处于战争状态的人贴到你身上，就没有"自选撤离"了。
 * 三条路：给钱买路（一天内不追）/ 坦然开战 / 留人断后（折兵换他停几个时辰）。
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { FACTIONS } = require('../data/china.js');
const { TROOPS } = require('../data/troops.js');
const { lookFor } = require('../data/extra.js');

function unitOf(app) {
  const d = app.chase;
  if (!d) return null;
  if (d.kind === 'party') {
    return app.state.parties.filter(function (p) { return p.id === d.id; })[0] || null;
  }
  return app.state.lords.filter(function (l) { return l.id === d.id; })[0] || null;
}

function compText(troops) {
  return Object.keys(troops || {}).map(function (id) {
    return (TROOPS[id] ? TROOPS[id].name : id) + ' ' + (troops[id] || 0);
  }).join(' · ');
}

/** 最近几条战事，给被追上的页面垫一点前情 */
function recentWarLines(st, n) {
  const out = [];
  for (let i = st.log.length - 1; i >= 0 && out.length < n; i--) {
    out.push((st.log[i].text || '').slice(0, 26));
  }
  return out;
}

const ChaseScene = {
  enter(app, params) {
    const d = params || {};
    app.chase = { kind: d.kind || 'lord', id: d.id, note: '' };
    const st = app.state;
    if (!st) return;
    // 同一件事的事件只留一份
    for (let i = st.events.length - 1; i >= 0; i--) {
      const ev = st.events[i];
      if (ev.type === 'chase' && ev.id === d.id) st.events.splice(i, 1);
    }
  },

  leave(app) {
    app.chase = null;
  },

  update(app) {
    const unit = unitOf(app);
    if (!unit || army.troopCount(unit.troops || {}) <= 0) app.pop();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const unit = unitOf(app);
    if (!unit) return;
    const d = app.chase;
    const isLord = d.kind !== 'party';
    const fac = isLord && FACTIONS[unit.faction] ? FACTIONS[unit.faction] : null;
    const col = fac ? fac.color : (unit.color || '#8b3a3a');
    const n = army.troopCount(unit.troops || {});
    const mine = army.troopCount(st.player.troops);
    const pPower = army.strength(st.player.troops).power;
    const ePower = army.strength(unit.troops || {}).power;
    const rel = isLord ? stateLib.relationOf(st, unit.faction) : -100;
    const cost = stateLib.giveWayCost(st, unit);
    const portrait = isLord && app.assets.portraitFor
      ? app.assets.portraitFor(col, lookFor(unit.id))
      : null;
    const small = h < 1060;

    ctx.fillStyle = '#0d0a07';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(0, 0, w, 216);
    ctx.globalAlpha = 1;

    text(ctx, '被 追 上', w / 2, 14, { size: 17, align: 'center', color: '#d07060' });

    const px = portrait ? 168 : 0;
    if (portrait) {
      panel(ctx, 22, 44, 132, 132, { fill: '#14100c' });
      ctx.drawImage(portrait, 26, 48, 124, 124);
    }
    text(ctx, unit.name || '一队人马', portrait ? px : w / 2, 44, {
      size: small ? 40 : 46, align: portrait ? 'left' : 'center', color: '#f5e9cf', shadow: true,
    });
    text(ctx, (fac ? fac.full + ' · ' : '') + n + ' 人' + (isLord ? '' : ' · 山贼'),
      portrait ? px : w / 2, 100, { size: 19, align: portrait ? 'left' : 'center', color: col });
    if (isLord) {
      text(ctx, '关系 ' + rel + (rel < -50 ? ' · 已经不肯收钱了' : rel < -20 ? ' · 不好说话' : ' · 还能谈谈'),
        portrait ? px : w / 2, 130, {
          size: 18, align: portrait ? 'left' : 'center',
          color: rel < -50 ? '#d07060' : rel < -20 ? '#d9a441' : '#9fc08a',
        });
    }

    const line = isLord && rel < -50
      ? '他认得你的旗，也知道你杀过他的人。钱袋递过去，只会被踢回来。'
      : '他横在路中间，刀没出鞘，意思很清楚。';
    wrap(ctx, line, w - 48, 17).slice(0, 2).forEach(function (ln, i) {
      text(ctx, ln, 24, 184 + i * 22, { size: 17, color: '#8a8070' });
    });

    /* 实力对比 */
    const y0 = 226;
    panel(ctx, 20, y0, w - 40, 216, { fill: '#1b1611' });
    text(ctx, '我方 ' + mine + ' 人', 36, y0 + 10, { size: 20, color: '#8fb0d8' });
    text(ctx, compText(st.player.troops) || '孤身一人', 36, y0 + 38, { size: 14, color: '#8a8070' });
    text(ctx, '对方 ' + n + ' 人', 36, y0 + 66, { size: 20, color: '#d07060' });
    text(ctx, compText(unit.troops || {}), 36, y0 + 94, { size: 14, color: '#8a8070' });
    const total = pPower + ePower || 1;
    bar(ctx, 36, y0 + 122, w - 72, 18, pPower / total, UI_COLORS.blue);
    const verdict = pPower / total;
    text(ctx, verdict > 0.62 ? '硬打能赢，但会死人。' : verdict > 0.48 ? '势均力敌，一仗下来两边都疼。' : '对面比你硬，坦然开战是下策。',
      36, y0 + 150, { size: 17, color: verdict > 0.62 ? '#8fbf7a' : '#d9a441' });
    text(ctx, '买路钱随他手下的人数涨：' + cost + ' 金。', 36, y0 + 180, { size: 15, color: '#a2947a' });

    /* 三条路 */
    const payY = y0 + 216 + 24;
    const bh = 92;
    app.ui.button(ctx, 20, payY, w - 40, bh, '给钱脱身 · ' + cost + ' 金', {
      id: 'chase_pay', size: 28, fill: '#3a3020', onTap: function () {
        const r = stateLib.giveWay(st, unit.id, d.kind);
        app.showToast(r.msg, 3);
        if (r.ok) app.pop();
      },
    });
    text(ctx, isLord && rel < -50 ? '（关系低于 -50，他多半不收，会驳回）' : '付了钱，一天之内他不会追上来。',
      24, payY + bh + 6, { size: 14, color: isLord && rel < -50 ? '#d07060' : '#8a8070' });

    const rowY = payY + bh + 34;
    app.ui.button(ctx, 20, rowY, (w - 52) / 2, bh, '坦然开战', {
      id: 'chase_fight', size: 28, fill: '#4a2a1a', onTap: function () {
        app.pop();
        if (d.kind === 'party') {
          stateLib.startPartyBattle(st, unit);
          app.push('battle', { mode: 'party' });
        } else {
          stateLib.startLordBattle(st, unit);
          app.push('battle', { mode: 'lord' });
        }
      },
    });
    app.ui.button(ctx, 20 + (w - 52) / 2 + 12, rowY, (w - 52) / 2, bh, '留人断后', {
      id: 'chase_tail', size: 28, fill: '#2a2a34', onTap: function () {
        const r = stateLib.breakTail(st, unit.id, d.kind);
        app.showToast(r.msg, 3);
        if (r.ok) app.pop();
      },
    });
    text(ctx, '断后要折人手，但能让他原地停几个时辰，够你跑出视野或进城。', 22, rowY + bh + 8, {
      size: 14, color: '#8a8070',
    });

    /* 底下补一点"现在什么情形"：士气、粮草、最近战事 */
    const by = rowY + bh + 42;
    const avail = h - by - 20;
    const panelH = Math.min(avail, 340);
    if (panelH >= 150) {
      const panelY = by + Math.max(0, (avail - panelH) / 2);
      panel(ctx, 20, panelY, w - 40, panelH, { fill: '#16120d' });
      const p = st.player;
      const gap = Math.min(50, Math.max(30, (panelH - 90) / 6.2));
      let y = panelY + 14;
      text(ctx, '眼下的情形', 36, y, { size: 19, color: '#f0c060' });
      y += gap;
      text(ctx, '士气 ' + Math.round(p.morale) + ' · 粮草 ' + Math.round(p.food) + ' · 声望 ' + Math.round(p.renown),
        36, y, { size: 17, color: '#c9bda2' });
      y += gap;
      text(ctx, '他' + (isLord ? '正咬着你不放' : '是这一带有名的匪伙') + '，身边还有 ' + n + ' 人。',
        36, y, { size: 17, color: '#a2947a' });
      y += gap;
      text(ctx, isLord ? '想脱身：他停下的这几个时辰，够你进城或钻进山里。' : '想脱身：往城边或山道上跑，他们追不远。',
        36, y, { size: 16, color: '#8fbf7a' });
      y += gap + 6;
      text(ctx, '最近的账', 36, y, { size: 18, color: '#f0c060' });
      y += gap;
      recentWarLines(st, 3).forEach(function (ln) {
        wrap(ctx, ln, w - 72, 15).slice(0, 1).forEach(function (t1) {
          text(ctx, t1, 36, y, { size: 15, color: '#8a8070' });
        });
        y += Math.min(gap, 40);
      });
    }
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ChaseScene;
