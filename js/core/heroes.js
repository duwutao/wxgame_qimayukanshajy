/**
 * 英雄层：不起眼的将领可招募，随队不死，靠打仗升级（1-10）
 */

const { HEROES, HERO_MAX_LEVEL } = require('../data/extra.js');
const { siteById, gridDistance } = require('./world.js');

const EXP_PER_LEVEL = 16;

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

function hireHero(state, site, heroId) {
  resolveHeroSites(state);
  const def = heroById(heroId);
  if (!def) return { ok: false, msg: '没有这个人' };
  if (state.heroSites[heroId] !== site.id) return { ok: false, msg: '他不在这个城' };
  state.player.heroes = state.player.heroes || [];
  if (state.player.heroes.length >= 4) return { ok: false, msg: '随行的英雄已经有四位，队伍塞不下了' };
  if (state.player.heroes.some(function (x) { return x.id === heroId; })) {
    return { ok: false, msg: '他已经在你队里了' };
  }
  if (state.player.gold < def.cost) return { ok: false, msg: '金币不够，他要 ' + def.cost };
  state.player.gold -= def.cost;
  state.player.heroes.push({ id: heroId, level: 1, exp: 0, kills: 0 });
  return { ok: true, msg: def.name + ' 加入了你的队伍' };
}

/** 队伍战力加成：每人每级 +1.1% 攻击、+0.8% 防御 */
function heroBonus(state) {
  const list = (state.player.heroes) || [];
  let atk = 0;
  let def = 0;
  list.forEach(function (h) {
    const lv = h.level || 1;
    atk += 0.011 * lv;
    def += 0.008 * lv;
  });
  return { atkPct: Math.min(0.45, atk), defPct: Math.min(0.4, def), count: list.length };
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
  resolveHeroSites,
  offersAt,
  heroById,
  hireHero,
  heroBonus,
  gainHeroExp,
  heroPower,
};
