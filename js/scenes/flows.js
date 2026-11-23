/**
 * 场景流转：把 state.events 翻成场景切换
 * map / town 都会调用，保证事件不丢。
 */

const stateLib = require('../core/state.js');
const { siteById } = require('../core/world.js');

function process(app) {
  const st = app.state;
  if (!st) return;
  let guard = 0;
  while (st.events.length && guard++ < 8) {
    const ev = st.events.shift();

    if (ev.type === 'enter-site') {
      app.push('town', { siteId: ev.siteId });
      return;
    }
    if (ev.type === 'siege') {
      const site = siteById(st.world, ev.siteId);
      if (!site) continue;
      stateLib.startSiege(st, site);
      app.push('battle', { mode: 'siege' });
      return;
    }
    if (ev.type === 'encounter') {
      const party = st.parties.filter(function (p) { return p.id === ev.partyId; })[0];
      if (!party) continue;
      stateLib.startPartyBattle(st, party);
      app.push('battle', { mode: 'party' });
      return;
    }
    if (ev.type === 'lord') {
      const lord = st.lords.filter(function (l) { return l.id === ev.lordId; })[0];
      if (!lord || !lord.alive) continue;
      // 先碰面说话：对话里再决定送礼、看兵、还是直接翻脸
      app.push('lord', { lordId: ev.lordId });
      return;
    }
    if (ev.type === 'revive') {
      app.push('revive', { count: ev.count });
      return;
    }
    if (ev.type === 'chapter') {
      app.push('chapter', { id: ev.chapterId });
      return;
    }
  }
}

/** 到达某据点后，是否该触发战役战 */
function tryCampaign(app) {
  const st = app.state;
  const battle = stateLib.tryCampaignBattle(st);
  if (battle) {
    app.push('battle', { mode: 'campaign', campaignId: battle.context.campaignId });
    return true;
  }
  return false;
}

module.exports = { process, tryCampaign };
