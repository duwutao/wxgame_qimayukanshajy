/**
 * 英雄层：不起眼的将领可招募，随队不死，靠打仗升级（1-10）
 */

const { HEROES, HERO_MAX_LEVEL, HERO_BONUS, heroStory } = require('../data/extra.js');
const { siteById, gridDistance } = require('./world.js');

const EXP_PER_LEVEL = 16;
const HERO_CAP_MAX = 15;

/** 随行名额：声望越高带得越多，最多 15 位 */
function heroCap(state) {
  const renown = (state.player && state.player.renown) || 0;
  return Math.min(HERO_CAP_MAX, 3 + Math.floor(renown / 30));
}

/** 英雄驻地校正：数据里写的城若不存在，就就近挂到一座大城 */
function resolveHeroSites(state) {
  const towns = state.world.sites.filter(function (s) {
    return s.type === 'town' || s.type === 'castle';
  });
  if (state.heroSites) return;
  state.heroSites = {};
  HEROES.forEach(function (h) {
    let home = siteById(state.world, h.site);
    if (!home) {
      home = towns[0];
      let best = 1e9;
      towns.forEach(function (t) {
        const s = `${h.id}|${t.id}`;
        let hash = 0;
        for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 9973;
        if (hash < best) {
          best = hash;
          home = t;
        }
      });
    }
    state.heroSites[h.id] = home.id;
  });
}

/** 该城酒馆里今天有谁 */
function offersAt(state, site) {
  resolveHeroSites(state);
  const hired = (state.player.heroes || []).map(function (x) { return x.id; });
  return HEROES.filter(function (h) {
    return state.heroSites[h.id] === site.id && hired.indexOf(h.id) < 0;
  });
}

function heroById(id) {
  for (let i = 0; i < HEROES.length; i++) if (HEROES[i].id === id) return HEROES[i];
  return null;
}

/** 酒馆自传：本人的经历，而不是“谁帐下”的旧履历 */
function storyOf(id) {
  return heroStory(id) || (heroById(id) || {}).bio || '';
}

function hireHero(state, site, heroId) {
  resolveHeroSites(state);
  const def = heroById(heroId);
  if (!def) return { ok: false, msg: '没有这个人' };
  if (state.heroSites[heroId] !== site.id) return { ok: false, msg: '他不在这个城' };
  state.player.heroes = state.player.heroes || [];
  if (state.player.heroes.length >= heroCap(state)) {
    return { ok: false, msg: '随行名额满了（' + heroCap(state) + ' 位），声望再高点才能多带人' };
  }
  if (state.player.heroes.some(function (x) { return x.id === heroId; })) {
    return { ok: false, msg: '他已经在你队里了' };
  }
  if (state.player.gold < def.cost) return { ok: false, msg: '金钱不够，他要 ' + def.cost };
  state.player.gold -= def.cost;
  state.player.heroes.push({ id: heroId, level: 1, exp: 0, kills: 0 });
  return { ok: true, msg: def.name + ' 加入了你的队伍' };
}

/**
 * 队伍加成：每人一样长处，随等级放大（1 级 ×0.68，10 级 ×1.4）
 * 返回的百分比直接喂给战斗、行军、口粮、缴获
 */
function heroBonus(state) {
  const list = state.player.heroes || [];
  const out = {
    atkPct: 0, defPct: 0, speedPct: 0, foodPct: 0, lootPct: 0, morale: 0, count: list.length,
  };
  list.forEach(function (h) {
    const b = HERO_BONUS[h.id];
    if (!b) return;
    const k = 0.6 + (h.level || 1) * 0.08;
    if (b.atk) out.atkPct += b.atk * k;
    if (b.def) out.defPct += b.def * k;
    if (b.speed) out.speedPct += b.speed * k;
    if (b.food) out.foodPct += b.food * k;
    if (b.loot) out.lootPct += b.loot * k;
    if (b.morale) out.morale += b.morale * (0.5 + (h.level || 1) * 0.05);
  });
  out.atkPct = Math.min(0.45, out.atkPct);
  out.defPct = Math.min(0.4, out.defPct);
  out.speedPct = Math.min(0.3, out.speedPct);
  out.foodPct = Math.min(0.35, out.foodPct);
  out.lootPct = Math.min(0.5, out.lootPct);
  out.morale = Math.min(8, Math.round(out.morale));
  return out;
}

/** 这位英雄现在给的是什么加成（给队伍页和对话页演示） */
function bonusOf(heroId, level) {
  const b = HERO_BONUS[heroId];
  if (!b) return { text: '没什么特别的', label: '' };
  const k = 0.6 + (level || 1) * 0.08;
  const parts = [];
  if (b.atk) parts.push('攻击 +' + (b.atk * k * 100).toFixed(1) + '%');
  if (b.def) parts.push('防御 +' + (b.def * k * 100).toFixed(1) + '%');
  if (b.speed) parts.push('行军 +' + (b.speed * k * 100).toFixed(0) + '%');
  if (b.food) parts.push('日耗 -' + (b.food * k * 100).toFixed(0) + '%');
  if (b.loot) parts.push('缴获 +' + (b.loot * k * 100).toFixed(0) + '%');
  if (b.morale) parts.push('士气 +' + Math.round(b.morale * (0.5 + (level || 1) * 0.05)) + '/日');
  return { text: parts.join(' · '), label: b.label || '' };
}

/** 请他走：回原来的城，日后还能在酒馆碰见 */
function dismissHero(state, heroId) {
  const list = state.player.heroes || [];
  const idx = list.map(function (x) { return x.id; }).indexOf(heroId);
  if (idx < 0) return { ok: false, msg: '他不在队里' };
  const def = heroById(heroId) || {};
  list.splice(idx, 1);
  return { ok: true, msg: def.name + ' 抱了抱拳，往' + (def.site ? '旧地' : '北边') + '去了。' };
}

function gainHeroExp(state, exp) {
  const list = state.player.heroes || [];
  if (!list.length) return [];
  const ups = [];
  list.forEach(function (h) {
    if (h.level >= HERO_MAX_LEVEL) {
      h.exp = Math.min(h.exp + exp, HERO_MAX_LEVEL * EXP_PER_LEVEL);
      return;
    }
    h.exp += exp;
    while (h.level < HERO_MAX_LEVEL && h.exp >= h.level * EXP_PER_LEVEL) {
      h.exp -= h.level * EXP_PER_LEVEL;
      h.level += 1;
      ups.push({ hero: heroById(h.id), level: h.level });
    }
  });
  return ups;
}

function heroPower(state) {
  let sum = 0;
  (state.player.heroes || []).forEach(function (h) { sum += (h.level || 1) * 4; });
  return sum;
}

module.exports = {
  EXP_PER_LEVEL,
  HERO_CAP_MAX,
  resolveHeroSites,
  offersAt,
  heroById,
  storyOf,
  heroCap,
  hireHero,
  heroBonus,
  bonusOf,
  dismissHero,
  gainHeroExp,
  heroPower,
};
