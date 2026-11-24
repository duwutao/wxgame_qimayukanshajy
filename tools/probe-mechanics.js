/**
 * 机制探针：不开浏览器，直接推时间看数值走势。
 * 关注三件事：
 *   1) 开局 9 人，在陈留天天招兵，多久能到 30（钱够不够）
 *   2) 领主与匪团互殴 12 天之后，匪团还剩几支（会不会被清光）
 *   3) 口粮是不是两天才扣一次
 *
 * 用法：node tools/probe-mechanics.js
 */

const stateLib = require('../js/core/state.js');
const economy = require('../js/core/economy.js');
const armyLib = require('../js/core/army.js');
const worldLib = require('../js/core/world.js');

const st = stateLib.createGame({ seed: 20261124 });
const cl = worldLib.siteById(st.world, 'chenliu');
st.player.x = cl.x;
st.player.y = cl.y;

console.log('=== 开局 ===');
console.log('兵 ' + armyLib.troopCount(st.player.troops)
  + ' · 金 ' + st.player.gold
  + ' · 粮 ' + st.player.food
  + ' · 声望 ' + st.player.renown);
console.log('陈留招募池 ' + JSON.stringify(cl.recruits) + ' · 每种上限 ' + cl.recruitCap);
console.log('匪团 ' + st.parties.length + ' 支 · 领主 ' + (st.lords || []).filter(function (l) { return l.alive; }).length + ' 人');

const rows = [];
for (let d = 1; d <= 12; d += 1) {
  cl.recruitList.forEach(function (id) {
    while ((cl.recruits[id] || 0) > 0 && armyLib.troopCount(st.player.troops) < 30) {
      const r = economy.recruit(st, cl, id, 1);
      if (!r.ok) break;
    }
  });
  // 一天 24 小时切成 8 个 NPC 步（每步 3 小时），跟游戏里 update 的节奏一致
  for (let h = 0; h < 8; h += 1) {
    stateLib.advanceTime(st, 3);
    stateLib.update(st, 0.05);
  }
  const parties = st.parties || [];
  rows.push({
    天: d,
    兵: armyLib.troopCount(st.player.troops),
    金: st.player.gold,
    粮: st.player.food,
    匪团: parties.length,
    匪兵: parties.reduce(function (s, q) { return s + armyLib.troopCount(q.troops); }, 0),
    交战: parties.filter(function (q) { return q.scuffle > 0; }).length,
    战报: st.log.filter(function (e) { return /咬住|拖垮|吃掉|溜了|前哨战|缠上/.test(e.text); }).length,
    领主兵: (st.lords || []).filter(function (l) { return l.alive; })
      .reduce(function (s, l) { return s + armyLib.troopCount(l.troops); }, 0),
  });
}
console.table(rows);

const foodDrops = [];
for (let i = 1; i < rows.length; i += 1) {
  if (rows[i].粮 !== rows[i - 1].粮) foodDrops.push(rows[i].天);
}
console.log('粮草变化发生在第 ' + foodDrops.join(' / ') + ' 天（应隔一天一次）');
console.log('12 天后：兵 ' + armyLib.troopCount(st.player.troops)
  + ' · 到 30 人目标 ' + (armyLib.troopCount(st.player.troops) >= 30 ? '已达成' : '还差 ' + (30 - armyLib.troopCount(st.player.troops))));
