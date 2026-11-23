/**
 * 遭遇页：撞上匪团先看清对面是谁，再决定打还是走。
 * 不再一点碰上就推进战斗画面。
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { TROOPS } = require('../data/troops.js');
const { BANDIT_TIERS } = require('../data/extra.js');

function partyOf(app) {
  const d = app.contact;
  if (!d) return null;
  return app.state.parties.filter(function (p) { return p.id === d.partyId; })[0] || null;
}

function compText(troops) {
  return Object.keys(troops || {}).map(function (id) {
    return (TROOPS[id] ? TROOPS[id].name : id) + ' ' + (troops[id] || 0);
  }).join(' · ');
}

const ContactScene = {
  enter(app, params) {
    app.contact = { partyId: (params || {}).partyId };
    // 同一伙人排队的事件一次清掉，免得撤离/开战回来又被弹一遍
    const st = app.state;
    const id = app.contact.partyId;
    if (st && st.events) {
      for (let i = st.events.length - 1; i >= 0; i--) {
        const ev = st.events[i];
        if (ev.type === 'encounter' && ev.partyId === id) st.events.splice(i, 1);
      }
    }
  },

  update(app) {
    const p = partyOf(app);
    if (!p || army.troopCount(p.troops) <= 0) app.pop();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const party = partyOf(app);
    if (!party) return;

    const tier = BANDIT_TIERS[party.banditTier] || BANDIT_TIERS.qing;
    const col = party.color || tier.color;
    const n = army.troopCount(party.troops);
    const mine = army.troopCount(st.player.troops);
    const pPower = army.strength(st.player.troops).power;
    const ePower = army.strength(party.troops).power;

    ctx.fillStyle = '#0d0a07';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(0, 0, w, 190);
    ctx.globalAlpha = 1;

    text(ctx, '遇上', w / 2, 24, { size: 20, align: 'center', color: '#a2947a' });
    text(ctx, party.name || '一伙人', w / 2, 54, { size: 44, align: 'center', color: '#f5e9cf', shadow: true });
    text(ctx, tier.name + ' · ' + tier.rank + ' 级 · ' + n + ' 人', w / 2, 112, {
      size: 20, align: 'center', color: col,
    });
    const desc = wrap(ctx, tier.desc, w - 80, 16);
    desc.slice(0, 2).forEach(function (ln, i) {
      text(ctx, ln, w / 2, 142 + i * 22, { size: 16, align: 'center', color: '#8a8070' });
    });

    // 双方对比
    const y0 = 210;
    const ph = Math.max(200, Math.min(244, h - y0 - 232));
    panel(ctx, 20, y0, w - 40, ph, { fill: '#1b1611' });
    text(ctx, '我方', 36, y0 + 14, { size: 18, color: '#8fb0d8' });
    text(ctx, mine + ' 人', w - 52, y0 + 12, { size: 24, align: 'right', color: '#efe3c6' });
    text(ctx, compText(st.player.troops) || '孤身一人', 36, y0 + 48, { size: 15, color: '#8a8070' });

    text(ctx, '对方', 36, y0 + 84, { size: 18, color: '#d07060' });
    text(ctx, n + ' 人', w - 52, y0 + 82, { size: 24, align: 'right', color: '#efe3c6' });
    text(ctx, compText(party.troops), 36, y0 + 116, { size: 15, color: '#8a8070' });

    // 强弱条
    const total = pPower + ePower || 1;
    bar(ctx, 36, y0 + 150, w - 72, 18, pPower / total, UI_COLORS.blue);
    const verdict = pPower / total;
    text(ctx, verdict > 0.62 ? '这一伙打不过你。' : verdict > 0.48 ? '势均力敌，会死人。' : '对面比你硬，硬打要折人。',
      36, y0 + 178, { size: 18, color: verdict > 0.62 ? '#8fbf7a' : verdict > 0.48 ? '#d9a441' : '#d07060' });
    text(ctx, '打输了会被赶回最近的城，还要倒回一天。', 36, y0 + 206, { size: 15, color: '#8a8070' });

    // 底部按钮
    const by = y0 + ph + 32;
    text(ctx, '撤离不损一兵，退开后他短时间内贴不上来。', 20, by - 34, { size: 16, color: '#8fbf7a' });
    app.ui.button(ctx, 20, by, (w - 52) / 2, 84, '开战', {
      id: 'contact_fight', size: 30, fill: '#4a2a1a', onTap: function () {
        stateLib.startPartyBattle(st, party);
        app.push('battle', { mode: 'party' });
      },
    });
    app.ui.button(ctx, 20 + (w - 52) / 2 + 12, by, (w - 52) / 2, 84, '撤离', {
      id: 'contact_leave', size: 30, fill: '#241c14', onTap: function () {
        stateLib.afterRetreat(st, { partyId: party.id });
        app.pop();
        app.showToast('你带人退开，他们没有追。', 2);
      },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ContactScene;
