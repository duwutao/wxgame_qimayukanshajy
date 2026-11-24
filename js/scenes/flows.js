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
    if (ev.type === 'player-siege') {
      const site = siteById(st.world, ev.siteId);
      if (!site) continue;
      const r = stateLib.beginPlayerSiege(st, site);
      if (r.ok) {
        // 围城不跳页：人留在城下，时辰在大地图上走，围满再点营寨决战
        app.showToast('城下扎营：需围 ' + r.days + ' 天，围成后才能决战。', 3);
        return;
      }
      app.showToast(r.msg || '现在围不了这座城。', 2);
      continue;
    }
    if (ev.type === 'siege') {
      const site = siteById(st.world, ev.siteId);
      if (!site) continue;
      const battle = stateLib.startSiege(st, site);
      if (!battle) {
        app.showToast('这座城现在打不下来。', 2);
        continue;
      }
      app.push('battle', { mode: 'siege' });
      return;
    }
    if (ev.type === 'warning') {
      app.showToast(ev.text || ev.title || '军中告急！', 4.5);
      continue;
    }
    if (ev.type === 'quest-failed') {
      app.showToast(ev.text || ev.title || '酒馆任务失败。', 4.5);
      continue;
    }
    if (ev.type === 'encounter') {
      const party = st.parties.filter(function (p) { return p.id === ev.partyId; })[0];
      if (!party) continue;
      // 先亮一张遭遇页：看清人数、看清强弱，再决定打不打
      app.push('contact', { partyId: ev.partyId });
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
    if (ev.type === 'founding') {
      app.push('founding', { siteId: ev.siteId });
      return;
    }
    if (ev.type === 'faction-fall') {
      app.push('news', { title: ev.title, lines: ev.lines, factionId: ev.factionId });
      return;
    }
    if (ev.type === 'succession') {
      app.push('news', {
        title: ev.title || '新君继位',
        lines: ev.lines || [],
        factionId: ev.factionId,
        tag: '继位',
        auto: 6,
      });
      return;
    }
    if (ev.type === 'peace-offer') {
      app.push('news', {
        mode: 'peace-offer',
        factionId: ev.factionId,
        title: ev.title || '议和使者',
        lines: ev.lines || [],
        tag: '议和',
      });
      return;
    }
    if (ev.type === 'diplomacy') {
      // 宣战/议和不打断操作，只弹几息；点一下也能提前收起
      app.push('news', {
        title: ev.title || '天下军情',
        lines: ev.lines || [],
        tag: ev.kind === 'peace' ? '议和' : '宣战',
        auto: 5.2,
      });
      return;
    }
    if (ev.type === 'arc') {
      app.push('arc', { phase: ev.phase });
      return;
    }
    if (ev.type === 'chase') {
      app.push('chase', { kind: ev.kind, id: ev.id });
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
