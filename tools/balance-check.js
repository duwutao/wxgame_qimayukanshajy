/**
 * 平衡体检：跑几天，看匪团数量/等级、兵价、打劫匪的实际收益
 * 用法：node tools/balance-check.js
 */

const stateLib = require('../js/core/state.js');
const economy = require('../js/core/economy.js');
const worldLib = require('../js/core/world.js');
const { TROOPS } = require('../js/data/troops.js');

const st = stateLib.createGame({ seed: 20261124 });

console.log('\n[匪团 10 天]');
const seenScuffle = [];
st.player.food = 9999;
for (let d = 0; d < 10; d++) {
  for (let hh = 0; hh < 24; hh++) {
    stateLib.advanceTime(st, 1);
    for (let i = 0; i < 8; i++) {
      stateLib.update(st, 0.12);
      st.events.length = 0;
      st.battle = null;
      st.parties.forEach(function (p) {
        if (p.scuffle > 0 && seenScuffle.indexOf(p.id) < 0) seenScuffle.push(p.id);
      });
    }
    st.player.food = 9999;
  }
  const t = { qing: 0, lan: 0, cheng: 0, hong: 0 };
  st.parties.forEach(function (p) { t[p.banditTier] = (t[p.banditTier] || 0) + 1; });
  console.log('  第 ' + st.clock.day + ' 天  匪团 ' + st.parties.length +
    '  青 ' + t.qing + ' 蓝 ' + t.lan + ' 橙 ' + t.cheng + ' 赤 ' + t.hong +
    '  领主阵亡 ' + st.lords.filter(function (l) { return !l.alive; }).length);
}
console.log('  期间发生过交战的匪团：' + seenScuffle.length);

console.log('\n[兵价]');
const city = worldLib.siteById(st.world, 'luoyang');
const village = st.world.sites.filter(function (s) { return s.type === 'village'; })[0];
['militia', 'spear', 'archer', 'cav', 'guard'].forEach(function (id) {
  if (!TROOPS[id]) return;
  console.log('  ' + TROOPS[id].name + ' (T' + TROOPS[id].tier + ')  城 ' +
    economy.recruitPrice(city, id) + ' 金 · 村 ' + economy.recruitPrice(village, id) + ' 金');
});

console.log('\n[打劫匪的实际收益]');
st.player.troops = { militia: 30 };
for (let k = 0; k < 4; k++) {
  const party = st.parties.filter(function (p) { return p.banditTier === 'qing'; })[0] ||
    st.parties.filter(function (p) { return p.banditTier === 'lan'; })[0];
  if (!party) break;
  const goldBefore = st.player.gold;
  stateLib.startPartyBattle(st, party);
  let guard = 0;
  while (st.battle && !st.battle.finished && guard++ < 40) st.battle.step();
  if (!st.battle) break;
  const sum = stateLib.resolveBattle(st, st.battle);
  console.log('  打 ' + (party.banditTier || '?') + ' 匪（' + (party.size0 || '?') + ' 人）：' +
    '我方剩 ' + (sum ? sum.remainA : '?') + ' 人，得 ' + (st.player.gold - goldBefore) + ' 金');
  st.player.troops = { militia: 30 };
}

console.log('');
