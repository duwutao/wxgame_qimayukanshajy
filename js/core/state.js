/**
 * 游戏状态层：行军、势力关系、领主 AI、战斗结算、战役链、史简、存档
 * 渲染层只读 state，不写。
 */

const { RNG } = require('../rng.js');
const {
  createWorld,
  findPath,
  siteById,
  siteAt,
  tileHours,
  addHours,
  gridDistance,
  isPassable,
  regionAt,
} = require('./world.js');
const army = require('./army.js');
const economy = require('./economy.js');
const trade = require('./trade.js');
const heroes = require('./heroes.js');
const war = require('./war.js');
const { Battle } = require('./battle.js');
const {
  FACTIONS, RENOWN_TIERS, CAMPAIGN, ENDINGS, EQUIPMENT,
} = require('../data/china.js');
const { TROOPS } = require('../data/troops.js');
const {
  BANDIT_TIERS, BANDIT_NAMES, BANDIT_UNLOCK_STAGE, LORD_TALK, LORD_EXTRA_BIO, FACTION_TALK, VILLAGE_FOOD,
} = require('../data/extra.js');
const { LORD_BIOS } = require('../data/bios.js');

const HOUR_SECONDS = 0.26; // 1 游戏小时 = 0.26 真实秒
const NPC_STEP_HOURS = 3;
const LORD_RESPAWN_DAYS = 12;
const SAVE_VERSION = 4;

/** 全图常驻匪团目标数量（玩家附近看得见，远处也算） */
const BANDIT_TARGET = 12;
const BANDIT_MAX = 16;

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function renownTitle(renown) {
  let title = RENOWN_TIERS[0].name;
  RENOWN_TIERS.forEach(function (t) {
    if (renown >= t.at) title = t.name;
  });
  return title;
}

function pushLog(state, text) {
  state.log.push({ day: state.clock.day, hour: Math.floor(state.clock.hour), text });
  if (state.log.length > 120) state.log.shift();
}

/* ---------------------------------------------------------------- 初始化 */

function createGame(opts) {
  const seed = (opts && opts.seed) || (Date.now() % 2147483647);
  const rng = new RNG(seed);
  const world = createWorld(seed);

  world.sites.forEach(function (site) {
    site.recruits = {};
    (site.recruitList || []).forEach(function (id) {
      site.recruits[id] = rng.int(1, site.recruitCap || 4);
    });
  });

  // 开局：洛阳东门外，只剩九名溃兵
  const luoyang = siteById(world, 'luoyang');
  const base = luoyang ? { x: luoyang.x + 3, y: luoyang.y + 1 } : { x: 34, y: 38 };
  const spawn = findFreeSpotNear(state0(world), base.x, base.y, 2) || base;

  const player = {
    name: (opts && opts.name) || '无名溃兵',
    flagName: '无旗',
    // 九个人、一点盘缠：够在陈留招到三十人，粮也够撑半个月
    gold: 460,
    food: 150,
    morale: 58,
    renown: 0,
    faction: null,
    banner: false,
    troops: { militia: 9 },
    equip: { blade: 0, armor: 0, horse: 0 },
    shi: 1,
    shiUsed: 0,
    goods: {},
    heroes: [],
    reviveCount: 0,
    x: spawn.x,
    y: spawn.y,
    prevX: spawn.x,
    prevY: spawn.y,
    route: [],
    stepFrom: null,
    stepTo: null,
    stepProgress: 0,
    atSiteId: null,
    facing: 1,
  };

  const relations = {};
  const wars = {};
  Object.keys(FACTIONS).forEach(function (id) {
    relations[id] = id === 'bandit' ? -100 : 0;
    wars[id] = id === 'bandit';
  });

  const state = {
    version: SAVE_VERSION,
    seed,
    clock: { day: 1, hour: 5 },
    world,
    player,
    relations,
    wars,
    lords: [],
    parties: [],
    quests: [],
    log: [],
    events: [],
    stats: { battlesWon: 0, battlesLost: 0, troopsLost: 0, goldEarned: 0, distance: 0, days: 0, sitesTaken: 0, villagesRaided: 0 },
    flags: { sworn: false, campaignDone: [] },
    campaign: { stage: 0, done: [] },
    gameOver: false,
    ending: null,
    timeScale: 1,
    npcClock: 0,
    rng,
    questSeq: 1,
    partySeq: 1,
    battle: null,
  };

  spawnLords(state);
  heroes.resolveHeroSites(state);
  spawnBanditParties(state, 8);
  spawnChaseParty(state, spawn);
  war.init(state);
  war.bindLogger(pushLog);
  war.bindPassable(isPassable);

  pushLog(state, '洛阳城破了。你只带出九个人，往东走，身后是西凉铁骑。');
  pushLog(state, '别回头。跑到陈留，还能剩几个跟你。');
  state.events.push({ type: 'chapter', chapterId: require('../data/china.js').CAMPAIGN[0].id });
  return state;
}

/** 供 findFreeSpotNear 复用的临时外壳 */
function state0(world) {
  return { world, player: { x: -1, y: -1 }, rng: new RNG(1) };
}

function findFreeSpotNear(state, cx, cy, radius) {
  const rng = state.rng || new RNG(1);
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = cx + rng.int(-radius, radius);
    const y = cy + rng.int(-radius, radius);
    if (!isPassable(state.world, x, y)) continue;
    if (siteAt(state.world, x, y)) continue;
    if (state.player && x === state.player.x && y === state.player.y) continue;
    return { x, y };
  }
  return null;
}

function lordFromDef(state, def) {
  const home = siteById(state.world, def.home);
  const spot = home
    ? findFreeSpotNear(state, home.x, home.y, 2) || { x: home.x, y: home.y }
    : { x: 20, y: 22 };
  return {
    id: def.id,
    name: def.name,
    title: def.title,
    faction: def.faction,
    home: def.home,
    x: spot.x,
    y: spot.y,
    troops: deepCopy(def.soldiers),
    morale: def.morale,
    sight: def.sight,
    chasing: false,
    alive: true,
    respawnDay: 0,
    defTroops: deepCopy(def.soldiers),
    wander: null,
  };
}

function spawnLords(state) {
  const { LORDS } = require('../data/china.js');
  state.lords = LORDS.map(function (def) { return lordFromDef(state, def); });
}

/** 序章追兵：西凉铁骑，慢一步，逼你往东跑 */
function spawnChaseParty(state, pos) {
  const from = findFreeSpotNear(state, pos.x - 6, pos.y + 1, 1) || { x: Math.max(1, pos.x - 6), y: pos.y };
  state.parties.push({
    id: 'p_xiliang',
    name: '西凉铁骑',
    faction: 'xiliang',
    scripted: true,
    slow: 2,
    tick: 0,
    troops: { cav: 40, tiefu: 20 },
    morale: 90,
    x: from.x,
    y: from.y,
    wander: null,
    chasing: true,
    sight: 12,
  });
}

/** 当前主线进度允许刷出的匪徒等级（青、蓝一开始就有；橙红要等主线过半） */
function allowedTiers(state) {
  const stage = (state.campaign && state.campaign.stage) || 0;
  const out = [];
  Object.keys(BANDIT_TIERS).forEach(function (id) {
    if (stage >= (BANDIT_UNLOCK_STAGE[id] || 0)) out.push(id);
  });
  if (!out.length) out.push('qing');
  return out;
}

/**
 * 按配额补：先补"离目标占比差得最多"的那一级，
 * 这样地图上的青色/蓝色/橙色/赤色比例稳定，不会越打越偏。
 */
function pickBanditTier(state) {
  const tiers = allowedTiers(state);
  const counts = {};
  let total = 0;
  (state.parties || []).forEach(function (p) {
    if (p.faction !== 'bandit') return;
    counts[p.banditTier] = (counts[p.banditTier] || 0) + 1;
    total++;
  });
  const base = Math.max(BANDIT_TARGET, total + 1);

  // 四分之一的情况随机挑，保留一点意外
  if (state.rng.random() < 0.25) {
    return tiers[state.rng.int(0, tiers.length - 1)];
  }

  let best = tiers[0];
  let bestGap = -Infinity;
  tiers.forEach(function (id) {
    const want = (BANDIT_TIERS[id].share || 0) * base;
    const gap = want - (counts[id] || 0);
    if (gap > bestGap) {
      bestGap = gap;
      best = id;
    }
  });
  return best;
}

function spawnBanditParties(state, count) {
  const rng = state.rng;
  const W = state.world.w;
  const H = state.world.h;
  const camps = state.world.sites.filter(function (s) {
    return s.type === 'camp' && !s.cleared;
  });
  for (let i = 0; i < count; i++) {
    const tier = pickBanditTier(state);
    const cfg = BANDIT_TIERS[tier];
    let spot = null;
    if (camps.length) {
      const camp = rng.pick(camps);
      spot = findFreeSpotNear(state, camp.x, camp.y, 7);
    }
    if (!spot) spot = findFreeSpotNear(state, rng.int(2, W - 3), rng.int(2, H - 3), 2);
    if (!spot) continue;

    const size = rng.int(cfg.minSize, cfg.maxSize);
    const troops = { bandit: size };
    Object.keys(cfg.extra || {}).forEach(function (id) {
      const range = cfg.extra[id];
      troops[id] = rng.int(range[0], range[1]);
    });

    state.parties.push({
      id: 'p' + state.partySeq++,
      name: rng.pick(BANDIT_NAMES[tier] || BANDIT_NAMES.qing),
      faction: 'bandit',
      banditTier: tier,
      color: cfg.color,
      troops,
      morale: rng.int(cfg.morale[0], cfg.morale[1]),
      x: spot.x,
      y: spot.y,
      wander: null,
      chasing: false,
      sight: cfg.sight,
      loot: cfg.loot,
      size0: size,
    });
  }
}

/** 补充匪团到目标数量，避开玩家脚下 */
function refillBandits(state) {
  const alive = state.parties.filter(function (x) { return x.faction === 'bandit'; }).length;
  if (alive >= BANDIT_TARGET) return 0;
  const add = Math.min(BANDIT_TARGET - alive, 3);
  if (add <= 0) return 0;
  const before = state.parties.length;
  spawnBanditParties(state, add);
  return state.parties.length - before;
}

/* ---------------------------------------------------------------- 关系 */

function relationOf(state, factionId) {
  if (!factionId) return 0;
  return state.relations[factionId] || 0;
}

function isHostileFaction(state, factionId) {
  if (!factionId) return false;
  if (factionId === 'bandit') return true;
  if (factionId === 'xiliang') return true;
  if (state.wars[factionId]) return true;
  const rel = relationOf(state, factionId);
  if (rel <= -25) return true;
  const pf = state.player.faction;
  if (pf && factionId !== pf && rel < 20) return true;
  return false;
}

function changeRelation(state, factionId, delta) {
  if (!factionId || factionId === 'bandit' || factionId === 'xiliang') return;
  if (!FACTIONS[factionId]) return;
  const before = state.relations[factionId] || 0;
  let next = Math.max(-100, Math.min(100, before + delta));
  state.relations[factionId] = next;
  if (next <= -25 && !state.wars[factionId]) {
    state.wars[factionId] = true;
    pushLog(state, FACTIONS[factionId].name + '把你列为逆贼，其领主见到你就会动手。');
  }
  if (delta < 0 && before > -25 && next <= -25) {
    state.wars[factionId] = true;
  }
}

function isHostileSite(state, site) {
  if (!site) return false;
  if (site.type === 'camp' && !site.cleared) return true;
  if (site.playerOwned) return false;
  return isHostileFaction(state, site.ownerFaction);
}

function siteStatus(state, site) {
  if (site.playerOwned) return '你的领地';
  if (site.type === 'camp' && !site.cleared) return '贼巢 · 可攻';
  if (!site.ownerFaction) return '无主';
  if (isHostileFaction(state, site.ownerFaction)) return '敌对';
  return '可进入';
}

/* ---------------------------------------------------------------- 查询 */

function playerSpeed(state) {
  const bonus = economy.equipmentBonus(state);
  const hb = heroes.heroBonus(state);
  const count = army.troopCount(state.player.troops);
  const sizePenalty = Math.min(0.45, count / 240);
  return Math.max(0.55, 1 + bonus.speedPct + hb.speedPct - sizePenalty);
}

function capacity(state) {
  return army.troopCapacity(state.player.renown);
}

function currentPos(state) {
  return { x: state.player.x, y: state.player.y };
}

/* ---------------------------------------------------------------- 行军 */

function goTo(state, x, y) {
  if (state.gameOver) return { ok: false, msg: '旅途已经结束' };
  if (!isPassable(state.world, x, y)) return { ok: false, msg: '这里过不去' };
  const from = currentPos(state);
  if (from.x === x && from.y === y) return { ok: false, msg: '已经在这里了' };

  const path = findPath(state.world, from, { x, y });
  if (!path || !path.length) return { ok: false, msg: '没有可达的路线' };

  state.player.route = path;
  state.player.stepFrom = { x: from.x, y: from.y };
  state.player.stepTo = path[0];
  state.player.stepProgress = 0;
  state.player.atSiteId = null;
  return { ok: true, msg: '出发，全程 ' + path.length + ' 格', path };
}

function stopMoving(state) {
  state.player.route = [];
  state.player.stepTo = null;
  state.player.stepFrom = null;
  state.player.stepProgress = 0;
}

function camp(state) {
  if (state.player.route.length) stopMoving(state);
  advanceTime(state, 24);
  state.player.morale = Math.min(100, state.player.morale + 14);
  pushLog(state, '就地扎营一天，火头军煮了粥。');
  return { ok: true, msg: '休整完毕' };
}

/* ---------------------------------------------------------------- 时间 */

function advanceTime(state, hours) {
  const days = addHours(state.clock, hours);
  state.hoursPending = (state.hoursPending || 0) + hours;
  for (let i = 0; i < days; i++) {
    dailyTick(state);
    if (state.gameOver) return;
  }
}

function dailyTick(state) {
  state.stats.days += 1;
  const p = state.player;
  const hb = heroes.heroBonus(state);
  // 口粮两天结算一次：一天一扣太狠，粮草根本养不起队伍
  const isFoodDay = state.clock.day % 2 === 0;
  const need = isFoodDay ? Math.max(1, Math.round(army.foodPerDay(p.troops) * (1 - hb.foodPct))) : 0;

  if (need > 0) {
    if (p.food >= need) {
      p.food -= need;
      if (p.food < need * 2) {
        p.morale = Math.max(0, p.morale - 3);
        pushLog(state, '粮草见底（剩 ' + p.food + '），队伍开始嘀咕。');
      }
    } else {
      const short = need - p.food;
      p.food = 0;
      p.morale = Math.max(0, p.morale - 10);
      const starved = Math.min(short, army.troopCount(p.troops));
      if (starved > 0) {
        army.distributeLosses(p.troops, starved);
        state.stats.troopsLost += starved;
        pushLog(state, '断粮！' + short + ' 人夜里走了。');
      }
      if (army.troopCount(p.troops) <= 0) {
        reviveAfterDefeat(state, 'starve');
        return;
      }
    }
  }

  if (p.morale < 65) p.morale = Math.min(65 + hb.morale, p.morale + 3 + hb.morale);
  const income = economy.dailyIncome(state);
  if (income > 0) {
    p.gold += income;
    state.stats.goldEarned += income;
  }
  economy.dailyMarket(state, state.rng);
  trade.dailyGoods(state, state.rng);

  // 匪团补充：维持全图常驻数量（太少没得打，太多寸步难行）
  refillBandits(state);
  // 国战：谁跟谁翻了脸；牢里的人熬过一天
  war.diplomacyTick(state);
  war.prisonerTick(state);
  // 领主重生（关在牢里的不算，等着被赎、被救或自己跑）
  state.lords.forEach(function (lord) {
    if (lord.alive || lord.prisoner) return;
    if (state.clock.day >= lord.respawnDay) {
      lord.alive = true;
      const home = siteById(state.world, lord.home);
      if (home) {
        lord.x = home.x;
        lord.y = home.y;
      }
      lord.troops = deepCopy(lord.defTroops);
      pushLog(state, lord.name + '重新聚起了部曲。');
    }
  });
}

/* ---------------------------------------------------------------- 主循环 */

function update(state, dtSeconds) {
  if (state.gameOver) return;
  const dt = dtSeconds * (state.timeScale || 1);
  const p = state.player;

  if (p.route.length && p.stepTo) {
    // 一步一步走：一帧最多交代一格，落格后立刻刷新插值起点，
    // 慢帧时宁可时间走慢一点也不跳格。
    let budget = dt / HOUR_SECONDS;
    let guard = 0;
    while (budget > 0 && p.stepTo && guard++ < 1) {
      const speed = playerSpeed(state);
      const needHours = tileHours(state.world, p.stepTo.x, p.stepTo.y) / speed;
      const remainHours = needHours * (1 - p.stepProgress);

      if (budget >= remainHours) {
        advanceTime(state, remainHours);
        budget -= remainHours;
        if (state.gameOver) return;

        p.prevX = p.x;
        p.prevY = p.y;
        p.x = p.stepTo.x;
        p.y = p.stepTo.y;
        p.facing = p.x >= p.prevX ? 1 : -1;
        p.stepProgress = 0;
        state.stats.distance += 1;

        p.route.shift();
        if (p.route.length) {
          p.stepFrom = { x: p.x, y: p.y };
          p.stepTo = p.route[0];
        } else {
          p.stepFrom = null;
          p.stepTo = null;
        }

        onArrive(state, p.x, p.y);
        if (state.gameOver) return;
        if (state.events.length) {
          stopMoving(state);
          return;
        }
      } else {
        p.stepProgress += budget / needHours;
        advanceTime(state, budget);
        budget = 0;
      }
    }

    checkPursuit(state);
  }

  // 天下在动：只有游戏时间真正流逝了，NPC 才动
  const elapsed = state.hoursPending || 0;
  state.hoursPending = 0;
  state.npcClock += elapsed;
  while (state.npcClock >= NPC_STEP_HOURS) {
    state.npcClock -= NPC_STEP_HOURS;
    moveParties(state);
    moveLords(state);
    war.fieldTick(state);
    checkPursuit(state);
    advanceCampaign(state);
    if (state.events.length) return;
  }
}

function onArrive(state, x, y) {
  const site = siteAt(state.world, x, y);
  if (site) {
    state.player.atSiteId = site.id;
    site.visited = true;
    if (isHostileSite(state, site)) {
      if (canFight(state, site.id)) state.events.push({ type: 'siege', siteId: site.id });
      advanceCampaign(state);
    } else {
      state.events.push({ type: 'enter-site', siteId: site.id });
    }
    advanceCampaign(state);
    return;
  }
  const enemy = adjacentEnemy(state, x, y);
  if (enemy) {
    enemy.cooldownH = gameHours(state) + 8;
    if (enemy.id && enemy.id.indexOf('l_') === 0) {
      state.events.push({ type: 'lord', lordId: enemy.id });
    } else {
      state.events.push({ type: 'encounter', partyId: enemy.id });
    }
  } else {
    advanceCampaign(state);
  }
}

/** 只有真的踩到同一格才算撞上；贴着脸站不算 */
function adjacentEnemy(state, x, y) {
  let best = null;
  const nowH = gameHours(state);
  const all = state.parties.concat(state.lords.filter(function (l) { return l.alive; }));
  all.forEach(function (unit) {
    if (!isHostileFaction(state, unit.faction)) return;
    if (!canFight(state, unit.id)) return;
    if (unit.cooldownH && nowH < unit.cooldownH) return;
    if (unit.x !== x || unit.y !== y) return;
    if (!best) best = unit;
  });
  return best;
}

/** 敌对单位走到你脚下才开打；贴上来一格不算 */
function checkPursuit(state) {
  const p = state.player;
  if (state.events.length) return;
  const nowH = gameHours(state);
  const all = state.parties.concat(state.lords.filter(function (l) { return l.alive; }));
  for (let i = 0; i < all.length; i++) {
    const unit = all[i];
    if (!isHostileFaction(state, unit.faction)) continue;
    if (!canFight(state, unit.id)) continue;
    if (unit.cooldownH && nowH < unit.cooldownH) continue;
    if (unit.x !== p.x || unit.y !== p.y) continue;
    // 碰过一次先冷却几小时，免得回到地图立刻又被同一个人拦住
    unit.cooldownH = nowH + 8;
    stopMoving(state);
    if (unit.id && unit.id.indexOf('l_') === 0) {
      state.events.push({ type: 'lord', lordId: unit.id });
    } else {
      state.events.push({ type: 'encounter', partyId: unit.id });
    }
    return;
  }
}

/** 附近最近的活领主（匪团用来判断该不该跑） */
function nearestLord(state, unit, range) {
  let best = null;
  let bestD = 1e9;
  state.lords.forEach(function (l) {
    if (!l.alive) return;
    const d = Math.max(Math.abs(l.x - unit.x), Math.abs(l.y - unit.y));
    if (d <= range && d < bestD) {
      bestD = d;
      best = l;
    }
  });
  return best;
}

/** 附近最近的匪团（领主顺手清乡） */
function nearestBandit(state, lord, range) {
  let best = null;
  let bestD = 1e9;
  state.parties.forEach(function (q) {
    if (q.faction !== 'bandit') return;
    if (army.troopCount(q.troops) <= 0) return;
    const d = Math.max(Math.abs(q.x - lord.x), Math.abs(q.y - lord.y));
    if (d <= range && d < bestD) {
      bestD = d;
      best = q;
    }
  });
  return best;
}

function moveParties(state) {
  const p = state.player;
  state.parties.forEach(function (party) {
    if (party.slow) {
      party.tick = (party.tick || 0) + 1;
      if (party.tick % party.slow !== 0) return;
    }
    // 见着大兵就溜：匪团轻装，领主辎重多，追不上
    const lord = nearestLord(state, party, 3);
    if (lord && retreatFrom(state, party, lord)) {
      party.chasing = false;
      party.engaged = false;
      return;
    }
    const dist = gridDistance(party, p);
    let target;
    if (dist <= (party.sight || 5) && isHostileFaction(state, party.faction)) {
      target = { x: p.x, y: p.y };
      party.chasing = true;
    } else {
      if (!party.wander || gridDistance(party, party.wander) < 1) {
        party.wander = findFreeSpotNear(state, party.x, party.y, 5);
      }
      target = party.wander;
      party.chasing = false;
    }
    if (!target) return;
    const step = greedyStep(state, party, target);
    if (step) {
      party.x = step.x;
      party.y = step.y;
    }
  });

  // 路上相逢：匪团与领主互殴
  fightNeighbors(state);
}

/** 领主：敌对且玩家在视野内 → 追；否则回防驻地。兵多辎重多，走得比匪团慢一半 */
function moveLords(state) {
  const p = state.player;
  state.lords.forEach(function (lord) {
    if (!lord.alive) return;
    let target;
    const home = siteById(state.world, lord.home);
    const dist = gridDistance(lord, p);
    if (isHostileFaction(state, lord.faction) && dist <= lord.sight) {
      target = { x: p.x, y: p.y };
      lord.chasing = true;
    } else {
      lord.chasing = false;
      // 国战：看见死敌的旗，先扑过去打人，老家的事放一放
      const foe = war.nearestFoe(state, lord, 5);
      if (foe && !(lord.scuffle > 0)) {
        target = { x: foe.x, y: foe.y };
        lord.foeChasing = foe.id;
        lord.banditChasing = null;
      } else {
        // 顺手清乡：看见近处的匪团就撵过去，撵不上也没关系
        const bandit = nearestBandit(state, lord, 4);
        if (bandit) {
          target = { x: bandit.x, y: bandit.y };
          lord.banditChasing = bandit.id;
          lord.foeChasing = null;
        } else if (home && gridDistance(lord, home) > 3) {
          lord.foeChasing = null;
          lord.banditChasing = null;
          target = { x: home.x, y: home.y };
        } else {
          lord.foeChasing = null;
          lord.banditChasing = null;
          if (!lord.wander || gridDistance(lord, lord.wander) < 1) {
            lord.wander = findFreeSpotNear(state, lord.x, lord.y, 3);
          }
          target = lord.wander;
        }
      }
    }
    // 辎重多，两拍才挪一格：土匪轻装跑得掉，领主追不上
    lord.moveTick = (lord.moveTick || 0) + 1;
    if (lord.moveTick % 2 !== 0) return;
    if (!target) return;
    const step = greedyStep(state, lord, target);
    if (step) {
      lord.x = step.x;
      lord.y = step.y;
    }
  });
}

/** 一支部队的粗略战力（兵种档次 × 人数），只用于 NPC 之间的互殴 */
function troopWeight(troops) {
  let sum = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    const w = t ? t.tier * 2 + t.atk / 3 + t.def / 3 : 4;
    sum += (troops[id] || 0) * w;
  });
  return sum;
}

/** 让某支队伍往远离威胁的方向退一步 */
function retreatFrom(state, unit, threat) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  let best = null;
  let bestD = gridDistance(unit, threat);
  dirs.forEach(function (d) {
    const nx = unit.x + d[0];
    const ny = unit.y + d[1];
    if (!isPassable(state.world, nx, ny)) return;
    if (siteAt(state.world, nx, ny)) return;
    const dist = Math.max(Math.abs(nx - threat.x), Math.abs(ny - threat.y));
    if (dist > bestD) {
      bestD = dist;
      best = { x: nx, y: ny };
    }
  });
  if (best) {
    unit.x = best.x;
    unit.y = best.y;
    return true;
  }
  return false;
}

/**
 * 匪团与领主在路上撞上：不是一仗打完，是拉锯。
 * 每 6 小时咬一口，双方各掉几个人；劫匪轻装，随时可能甩开追兵跑掉。
 */
function fightNeighbors(state) {
  const p = state.player;
  const rng = state.rng;
  state.parties.forEach(function (party) {
    if (party.faction !== 'bandit') return;
    if (army.troopCount(party.troops) <= 0) return;
    if (party.scuffle && party.scuffle > 0) {
      party.scuffle -= 1;
      return;
    }
    const lord = state.lords.filter(function (l) {
      return l.alive && Math.abs(l.x - party.x) <= 1 && Math.abs(l.y - party.y) <= 1;
    })[0];
    if (!lord) return;
    if (lord.faction === 'bandit') return;

    const countA = army.troopCount(party.troops);
    const countB = army.troopCount(lord.troops);
    if (countB <= 0) return;
    // 零敲碎打：匪团掉一两个人，领主这边按匪团的规模折损（小股匪徒咬不动大军）
    const lossA = Math.max(1, Math.round(countA * 0.06));
    const lossB = Math.min(5, Math.max(1, Math.round(countA * 0.1)));
    army.distributeLosses(party.troops, lossA);
    army.distributeLosses(lord.troops, lossB);
    party.scuffle = 1;
    party.engaged = true;

    const near = Math.max(Math.abs(party.x - p.x), Math.abs(party.y - p.y)) <= 12;

    if (army.troopCount(lord.troops) <= 0) {
      lord.alive = false;
      lord.troops = {};
      lord.respawnDay = state.clock.day + LORD_RESPAWN_DAYS;
      if (near) pushLog(state, lord.name + '的部曲被' + party.name + '拖垮了，他一个人往城里退。', 'war');
      return;
    }
    if (army.troopCount(party.troops) <= 0) {
      state.parties = state.parties.filter(function (x) { return x.id !== party.id; });
      if (near) pushLog(state, party.name + '被' + lord.name + '的部曲吃掉了。地上留了一地断刀。', 'war');
      return;
    }

    // 脱身：领主兵越多辎重越重，匪团越容易甩开
    const lordShare = countB / (countA + countB || 1);
    const escape = Math.min(0.8, 0.3 + Math.max(0, lordShare - 0.5) * 0.7 + rng.next() * 0.2);
    if (rng.next() < escape) {
      const ok = retreatFrom(state, party, lord);
      party.engaged = false;
      party.scuffle = 3;
      if (ok && near) {
        pushLog(state, party.name + '扔下几具尸首，从' + lord.name + '的包围里溜了。', 'war');
      }
      return;
    }

    if (near) {
      pushLog(state, party.name + '被' + lord.name + '咬住了，双方又折了 ' + lossA + '、' + lossB + ' 人。', 'war');
    }
  });
}

function greedyStep(state, unit, target) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  let best = null;
  let bestD = gridDistance(unit, target);
  for (let i = 0; i < dirs.length; i++) {
    const nx = unit.x + dirs[i][0];
    const ny = unit.y + dirs[i][1];
    if (!isPassable(state.world, nx, ny)) continue;
    if (siteAt(state.world, nx, ny)) continue;
    const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y));
    if (d < bestD) {
      bestD = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

/* ---------------------------------------------------------------- 战斗 */

function playerSide(state) {
  const bonus = economy.equipmentBonus(state);
  const hb = heroes.heroBonus(state);
  return {
    name: state.player.flagName === '无旗' ? state.player.name : state.player.flagName,
    faction: state.player.faction,
    troops: deepCopy(state.player.troops),
    morale: state.player.morale,
    atkPct: bonus.atkPct + hb.atkPct,
    defPct: bonus.defPct + hb.defPct,
    isPlayer: true,
  };
}

function startPartyBattle(state, party) {
  const battle = new Battle({
    rng: state.rng,
    attacker: playerSide(state),
    defender: {
      name: party.name,
      faction: party.faction,
      troops: deepCopy(party.troops),
      morale: party.morale,
      atkPct: 0,
      defPct: 0,
    },
    context: {
      kind: party.scripted ? 'chase' : 'party',
      partyId: party.id,
      partyName: party.name,
      tier: party.banditTier ? BANDIT_TIERS[party.banditTier].rank : 0,
    },
  });
  state.battle = battle;
  return battle;
}

function startLordBattle(state, lord) {
  const battle = new Battle({
    rng: state.rng,
    attacker: playerSide(state),
    defender: {
      name: lord.name + '军',
      faction: lord.faction,
      troops: deepCopy(lord.troops),
      morale: lord.morale,
      atkPct: 0.05,
      defPct: 0.05,
    },
    context: { kind: 'lord', lordId: lord.id, lordName: lord.name, lordFaction: lord.faction },
  });
  state.battle = battle;
  return battle;
}

function garrisonTroops(site) {
  const total = Math.max(8, site.garrison);
  const f = site.ownerFaction;
  const set = {
    wei: { militia: 0.35, spear: 0.35, crossbow: 0.2, guard: 0.1 },
    shu: { militia: 0.35, spear: 0.3, archer: 0.25, baier: 0.1 },
    wu: { militia: 0.35, archer: 0.35, boat: 0.2, huochuan: 0.1 },
    yuan: { militia: 0.4, spear: 0.35, cav: 0.2, heavy: 0.05 },
    lv: { militia: 0.3, spear: 0.4, cav: 0.25, tiefu: 0.05 },
    biao: { militia: 0.4, spear: 0.35, archer: 0.2, cav: 0.05 },
    zhang: { militia: 0.4, spear: 0.3, archer: 0.25, wudang: 0.05 },
    xianbei: { militia: 0.2, qishe: 0.4, xianbei: 0.3, tengri: 0.1 },
    ma: { militia: 0.25, spear: 0.35, qishe: 0.25, tiefu: 0.15 },
    han: { militia: 0.35, spear: 0.35, crossbow: 0.2, jinjun: 0.1 },
    bandit: { bandit: 0.6, raider: 0.3, raider_cav: 0.1 },
  };
  const map = set[f] || { militia: 0.4, spear: 0.3, archer: 0.2, cav: 0.1 };
  const troops = {};
  Object.keys(map).forEach(function (id) {
    const n = Math.round(total * map[id]);
    if (n > 0) troops[id] = n;
  });
  return troops;
}

function startSiege(state, site) {
  const battle = new Battle({
    rng: state.rng,
    attacker: playerSide(state),
    defender: {
      name: site.name + '守军',
      faction: site.ownerFaction,
      troops: garrisonTroops(site),
      morale: site.type === 'town' ? 68 : 62,
      atkPct: site.type === 'castle' ? 0.12 : 0.05,
      defPct: site.type === 'castle' ? 0.2 : 0.12,
    },
    context: { kind: 'siege', siteId: site.id, siteName: site.name },
  });
  state.battle = battle;
  return battle;
}

/** 战役专用战斗：预设敌军，带场景加成 */
function startCampaignBattle(state, id) {
  const configs = {
    wuchao: {
      name: '乌巢粮营', faction: 'yuan', morale: 55,
      troops: { militia: 80, spear: 50, cav: 30, heavy: 10 },
      context: { kind: 'campaign', campaignId: 'act2', siteName: '乌巢' },
      fire: true,
    },
    chibi: {
      name: '曹操水寨', faction: 'wei', morale: 70,
      troops: { militia: 90, archer: 70, boat: 60, guard: 20 },
      context: { kind: 'campaign', campaignId: 'act4', siteName: '赤壁' },
      fire: true,
    },
    yiling: {
      name: '连营守军', faction: 'shu', morale: 65,
      troops: { militia: 100, spear: 60, archer: 50, baier: 12 },
      context: { kind: 'campaign', campaignId: 'act5', siteName: '夷陵' },
      fire: true,
    },
    final: {
      name: '无旗亲军', faction: null, morale: 100,
      troops: { jinjun: 70, guard: 50, heavy: 40, tiefu: 20 },
      context: { kind: 'campaign', campaignId: 'final', siteName: '定稿' },
      fire: false,
    },
  };
  const cfg = configs[id];
  if (!cfg) return null;
  const battle = new Battle({
    rng: state.rng,
    attacker: playerSide(state),
    defender: {
      name: cfg.name,
      faction: cfg.faction,
      troops: deepCopy(cfg.troops),
      morale: cfg.morale,
      atkPct: 0.05,
      defPct: 0.1,
    },
    context: cfg.context,
  });
  battle.fireGround = !!cfg.fire;
  state.battle = battle;
  return battle;
}

/* ---------------------------------------------------------------- 脱战与复活 */

function gameHours(state) {
  return state.clock.day * 24 + state.clock.hour;
}

/** 刚脱战的敌人一段时间内不会再贴上来（避免一撤退就被重新拖进战斗） */
function markFlee(state, id, hours) {
  if (!id) return;
  state.flee = state.flee || {};
  state.flee[id] = gameHours(state) + (hours || 12);
}

function canFight(state, id) {
  if (!id) return true;
  const t = (state.flee || {})[id];
  return !t || gameHours(state) >= t;
}

/** 把玩家从据点格上挪开，找一个相邻的可行空地 */
function shoveOutOfSite(state, site) {
  const p = state.player;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let i = 0; i < dirs.length; i++) {
    const nx = site.x + dirs[i][0];
    const ny = site.y + dirs[i][1];
    if (!isPassable(state.world, nx, ny)) continue;
    if (siteAt(state.world, nx, ny)) continue;
    p.x = nx;
    p.y = ny;
    p.prevX = nx;
    p.prevY = ny;
    p.atSiteId = null;
    stopMoving(state);
    return true;
  }
  stopMoving(state);
  return false;
}

/** 撤退后的收尾：退出据点格、标记脱战冷却 */
function afterRetreat(state, ctx) {
  const p = state.player;
  if (p.atSiteId) {
    const site = siteById(state.world, p.atSiteId);
    if (site) shoveOutOfSite(state, site);
    p.atSiteId = null;
  }
  stopMoving(state);
  if (ctx) {
    markFlee(state, ctx.partyId, 14);
    markFlee(state, ctx.lordId, 14);
    markFlee(state, ctx.siteId, 14);
  }
}

/** 全灭：回到一天前，重新拉起一支小队，记一次复活 */
function reviveAfterDefeat(state, reason) {
  const p = state.player;
  const n = (p.reviveCount || 0) + 1;
  p.reviveCount = n;

  // 时间倒回一天（只退时钟，天下不会真的倒退）
  state.clock.day = Math.max(1, state.clock.day - 1);
  state.npcClock = 0;
  state.flee = {};
  state.events.length = 0;
  state.battle = null;
  stopMoving(state);

  // 回到最近的己方/中立城，若没有就回开局点
  let home = state.world.sites.filter(function (s) {
    return s.playerOwned || (s.type === 'town' && !isHostileFaction(state, s.ownerFaction));
  })[0];
  if (!home) home = siteById(state.world, 'chenliu') || state.world.sites[0];
  const spot = findFreeSpotNear(state, home.x, home.y + 1, 2) || { x: home.x, y: home.y + 1 };
  p.x = spot.x;
  p.y = spot.y;
  p.prevX = spot.x;
  p.prevY = spot.y;
  p.atSiteId = null;
  p.facing = 1;

  // 队伍重编：不让你真的一无所有
  const keep = army.troopCount(p.troops);
  if (keep <= 0) {
    p.troops = { militia: 8 + Math.min(12, n * 2) };
  }
  p.gold = Math.max(30, Math.round(p.gold * 0.5));
  p.food = Math.max(20, Math.round(army.foodPerDay(p.troops) * 2));
  p.morale = 52;
  (p.heroes || []).forEach(function (h) { h.exp = Math.max(0, h.exp - 4); });

  state.flags.reviveText = reason || '';
  state.events.push({ type: 'revive', count: n });
  pushLog(state, '第 ' + n + ' 次：你在' + (home ? home.name : '野地') + '醒来，帐外的旗还在。');
  return n;
}

/** 把战果写回 state */
function resolveBattle(state, battle) {
  const summary = battle.summary();
  state.player.troops = deepCopy(battle.a.troops);
  const p = state.player;

  // 缴获：会搜战场的英雄能多刮一点
  const hbLoot = heroes.heroBonus(state).lootPct;
  if (hbLoot > 0 && summary.loot > 0) summary.loot = Math.round(summary.loot * (1 + hbLoot));

  // 史简「名册」：阵亡者部分回归
  if (battle.shiMark === 'roll' && summary.result !== 'retreat') {
    const back = Math.max(0, Math.round(summary.initialA * 0.35));
    if (back > 0) {
      const t = battle.a.initialTroops;
      let put = 0;
      Object.keys(t).forEach(function (id) {
        if (put >= back) return;
        const n = Math.min(t[id] - (battle.a.troops[id] || 0), back - put);
        if (n > 0) {
          battle.a.troops[id] = (battle.a.troops[id] || 0) + n;
          put += n;
        }
      });
      p.troops = deepCopy(battle.a.troops);
      pushLog(state, '史简「名册」生效：' + put + ' 个名字又从纸上站了起来。');
    }
  }

  if (summary.result === 'win') {
    p.morale = Math.min(100, p.morale + 8);
    state.stats.battlesWon += 1;
    const loot = summary.loot;
    p.gold += loot;
    state.stats.goldEarned += loot;
    const renownGain = Math.max(5, Math.round(summary.initialB * 0.8));
    p.renown += renownGain;

    // 英雄跟着打仗长本事
    const ups = heroes.gainHeroExp(state, 9);
    ups.forEach(function (u) {
      pushLog(state, u.hero.name + ' 在阵中升到了 ' + u.level + ' 级。');
    });

    const ctx = battle.context;
    if (ctx.kind === 'party' || ctx.kind === 'chase') {
      state.parties = state.parties.filter(function (x) { return x.id !== ctx.partyId; });
      pushLog(state, '击溃' + ctx.partyName + '：缴获 ' + loot + ' 金，声望 +' + renownGain + '。');
      if (ctx.kind === 'chase') {
        pushLog(state, '西凉铁骑退了。你回头看了一眼洛阳的方向，没再回头。');
        advanceCampaign(state);
      }
    } else if (ctx.kind === 'lord') {
      const lord = state.lords.filter(function (x) { return x.id === ctx.lordId; })[0];
      if (lord) {
        const res = war.onPlayerBeatLord(state, lord);
        changeRelation(state, lord.faction, -35);
        if (res.captured) {
          pushLog(state, '你生擒了' + lord.name + '，捆在营后。牢里等着家人拿 ' + res.ransom + ' 金来赎。');
        } else {
          pushLog(state, '你击败了' + lord.name + '！他带残部往野地里跑了。' + (FACTIONS[lord.faction] ? FACTIONS[lord.faction].name : '') + '与你结下死仇。');
        }
        if (lord.id === 'lvbu') {
          state.flags.lvbuBeaten = true;
          advanceCampaign(state);
        }
      }
    } else if (ctx.kind === 'siege') {
      const site = siteById(state.world, ctx.siteId);
      if (site) takeSite(state, site);
    } else if (ctx.kind === 'campaign') {
      pushLog(state, ctx.siteName + '一战而胜。');
      battle.campaignWin = true;
      applyCampaignEffect(state, ctx.campaignId);
      advanceCampaign(state);
    }
  } else if (summary.result === 'lose' || summary.result === 'draw') {
    p.morale = Math.max(0, p.morale - 16);
    state.stats.battlesLost += 1;
    const lostGold = Math.round(p.gold * 0.28);
    const lostFood = Math.round(p.food * 0.28);
    p.gold -= lostGold;
    p.food -= lostFood;
    pushLog(state, '战败，被抢走 ' + lostGold + ' 金与 ' + lostFood + ' 粮。');
    heroes.gainHeroExp(state, 3);
    if (army.troopCount(p.troops) <= 0) {
      reviveAfterDefeat(state, 'battle');
    }
  } else if (summary.result === 'retreat') {
    p.morale = Math.max(0, p.morale - 8);
    pushLog(state, '你下令脱离战斗，退到野地里。');
    afterRetreat(state, battle.context);
  }

  state.stats.troopsLost += Math.max(0, summary.initialA - summary.remainA);
  state.battle = null;
  return summary;
}

function takeSite(state, site) {
  const p = state.player;
  if (site.type === 'camp') {
    site.cleared = true;
    site.garrison = 0;
    p.renown += 45;
    p.gold += 120;
    pushLog(state, '攻破' + site.name + '！贼巢被拔，声望 +45。');
  } else {
    const oldFaction = site.ownerFaction;
    site.playerOwned = true;
    site.ownerFaction = p.faction || null;
    site.garrison = Math.max(10, Math.round(site.garrisonBase * 0.35));
    site.garrisonBase = site.garrison;
    site.color = '#d9a441';
    site.banner = '旗';
    p.gold += 150;
    state.stats.sitesTaken += 1;
    if (oldFaction && oldFaction !== 'bandit') {
      changeRelation(state, oldFaction, -60);
    }
    war.onSiteTaken(state, site, oldFaction);
    pushLog(state, '你拿下了' + site.name + '。从今天起，这里归你。');
    checkVictory(state);
    advanceCampaign(state);
  }
}

/* ---------------------------------------------------------------- 任务 */

function offerQuest(state, site) {
  if (!site || site.faction === 'bandit' || site.playerOwned) return null;
  if (site.type !== 'town' && site.type !== 'castle') return null;
  const rng = state.rng;
  const bandits = state.parties.filter(function (p) { return p.faction === 'bandit'; });
  const type = rng.pick(bandits.length ? ['hunt', 'grain', 'scout'] : ['grain', 'scout']);

  const quest = {
    id: 'q' + state.questSeq++,
    type,
    siteId: site.id,
    siteName: site.name,
    faction: site.ownerFaction,
    acceptedDay: state.clock.day,
    done: false,
    reward: { gold: 0, renown: 0 },
  };

  if (type === 'hunt') {
    const party = rng.pick(bandits);
    quest.targetPartyId = party.id;
    quest.title = '清剿' + party.name;
    quest.text = '“' + party.name + ' 在' + site.name + '附近劫道。打散他们，赏钱归你。”';
    quest.reward.gold = 180 + rng.int(0, 80);
    quest.reward.renown = 24;
  } else if (type === 'grain') {
    quest.title = '征缴粮草';
    quest.text = '“城里粮仓见底。送 40 单位粮过来，钱照付。”';
    quest.need = 40;
    quest.reward.gold = 150 + rng.int(0, 60);
    quest.reward.renown = 18;
  } else {
    const camps = state.world.sites.filter(function (s) { return s.type === 'camp' && !s.cleared; });
    if (!camps.length) return null;
    const camp = rng.pick(camps);
    quest.targetSiteId = camp.id;
    quest.title = '探查' + camp.name;
    quest.text = '“去' + camp.name + ' 门口看一眼，回来报数。”';
    quest.reward.gold = 130;
    quest.reward.renown = 14;
  }

  state.quests.push(quest);
  return quest;
}

function finishQuest(state, q) {
  state.player.gold += q.reward.gold;
  state.player.renown += q.reward.renown;
  state.stats.goldEarned += q.reward.gold;
  if (q.faction) changeRelation(state, q.faction, 12);
  pushLog(state, '交差：' + q.title + '，得 ' + q.reward.gold + ' 金、' + q.reward.renown + ' 声望。');
}

function completeQuests(state, type, targetId) {
  state.quests.forEach(function (q) {
    if (q.done || q.type !== type) return;
    if (type === 'hunt' && q.targetPartyId !== targetId) return;
    q.done = true;
    finishQuest(state, q);
  });
}

function deliverGrain(state, quest) {
  if (!quest || quest.type !== 'grain' || quest.done) return { ok: false, msg: '没有可交的任务' };
  if (state.player.food < quest.need) return { ok: false, msg: '粮不够，还差 ' + (quest.need - state.player.food) };
  const site = siteById(state.world, quest.siteId);
  const pos = currentPos(state);
  if (!site || Math.abs(pos.x - site.x) > 1 || Math.abs(pos.y - site.y) > 1) {
    return { ok: false, msg: '要亲自送到' + quest.siteName };
  }
  state.player.food -= quest.need;
  quest.done = true;
  finishQuest(state, quest);
  return { ok: true, msg: '粮草已交' };
}

function checkScoutQuest(state) {
  const pos = currentPos(state);
  state.quests.forEach(function (q) {
    if (q.done || q.type !== 'scout') return;
    const site = siteById(state.world, q.targetSiteId);
    if (!site) return;
    if (Math.abs(pos.x - site.x) <= 1 && Math.abs(pos.y - site.y) <= 1) {
      q.done = true;
      finishQuest(state, q);
    }
  });
}

/* ---------------------------------------------------------------- 内政 */

function joinFaction(state, site) {
  const p = state.player;
  if (p.faction) return { ok: false, msg: '你已经效忠' + FACTIONS[p.faction].full };
  if (!site.ownerFaction || site.ownerFaction === 'bandit') return { ok: false, msg: '这里没有可效忠的旗' };
  if (site.playerOwned) return { ok: false, msg: '这是你自己的地盘' };
  if (p.renown < 60) return { ok: false, msg: '声望不足 60，' + site.name + '的守将不见你' };
  const f = site.ownerFaction;
  p.faction = f;
  state.flags.sworn = true;
  changeRelation(state, f, 80);
  Object.keys(state.relations).forEach(function (id) {
    if (id === f || id === 'bandit') return;
    changeRelation(state, id, -18);
  });
  p.morale = Math.min(100, p.morale + 12);
  pushLog(state, '你在' + site.name + '接下' + FACTIONS[f].name + '的印绶。从此你的敌人，也是别人的敌人。');
  return { ok: true, msg: '你现在是' + FACTIONS[f].full + '的人了' };
}

/* ---------------------------------------------------------------- 俘虏 */

function prisonersOf(state) {
  const list = war.listPrisoners(state).map(function (p) {
    const lord = state.lords.filter(function (l) { return l.id === p.lordId; })[0];
    const site = siteById(state.world, p.siteId);
    return {
      lordId: p.lordId,
      name: lord ? lord.name : p.lordId,
      title: lord ? lord.title : '',
      faction: lord ? lord.faction : '',
      by: p.by,
      byName: p.byName || (p.by === 'player' ? '你' : ''),
      place: site ? site.name : '某处牢里',
      days: p.days || 0,
      ransom: p.ransom || (60 + Math.round(war.weight(lord ? lord.defTroops : {}) / 5)),
      chance: Math.min(1, war.ESCAPE_BASE + war.ESCAPE_STEP * (p.days || 0)),
    };
  });
  return list;
}

function ransomPrisoner(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) { return x.lordId === lordId; })[0];
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (p && lord && !p.ransom) p.ransom = 60 + Math.round(war.weight(lord.defTroops) / 5);
  return war.ransom(state, lordId);
}

function releasePrisoner(state, lordId) {
  return war.release(state, lordId);
}

function factionWars(state) {
  return war.summaryLines(state);
}

function declareWar(state, site) {  const f = site.ownerFaction;
  if (!f || f === 'bandit') return { ok: false, msg: '这里没有可宣战的对象' };
  if (state.player.faction === f) return { ok: false, msg: '你不能对自己的国宣战' };
  state.wars[f] = true;
  changeRelation(state, f, -45);
  pushLog(state, '你与' + FACTIONS[f].full + '撕破了脸。');
  return { ok: true, msg: '已与' + FACTIONS[f].full + '开战' };
}

/** 劫掠村庄：快钱，脏手 */
function raidVillage(state, site) {
  if (!site || site.type !== 'village') return { ok: false, msg: '这里没什么可抢的' };
  if (site.playerOwned) return { ok: false, msg: '抢自己的村子？' };
  if (site.ownerFaction && isHostileFaction(state, site.ownerFaction) && state.player.faction === site.ownerFaction) {
    return { ok: false, msg: '这是你自己人' };
  }
  const rng = state.rng;
  const gold = 90 + rng.int(0, 110);
  const food = 40 + rng.int(0, 45);
  state.player.gold += gold;
  state.player.food += food;
  state.stats.villagesRaided += 1;
  site.garrison = Math.max(0, site.garrison - 6);
  site.priceIndex = Math.min(1.5, (site.priceIndex || 1) * 1.2);
  site.burned = true;
  // 屠村只掉 5 点关系，但村里会记很久
  if (site.ownerFaction) changeRelation(state, site.ownerFaction, -5);
  state.player.renown = Math.max(0, state.player.renown - 4);
  pushLog(state, '你屠了' + site.name + '，得 ' + gold + ' 金、' + food + ' 粮。村口有人记住了你的旗。');
  return { ok: true, msg: '抢到 ' + gold + ' 金、' + food + ' 粮' };
}

/** 村庄：跟村长买口粮（牛、羊、鸡、谷） */
function buyVillageFood(state, site, itemId) {
  if (!site || site.type !== 'village') return { ok: false, msg: '这里没有村市' };
  let item = null;
  VILLAGE_FOOD.forEach(function (f) { if (f.id === itemId) item = f; });
  if (!item) return { ok: false, msg: '没有这样东西' };
  const price = Math.round(item.price * (site.priceIndex || 1) * 0.85);
  if (state.player.gold < price) return { ok: false, msg: '钱不够，要 ' + price };
  if (state.player.food + item.food > 400) return { ok: false, msg: '粮车装不下了' };
  state.player.gold -= price;
  state.player.food += item.food;
  return { ok: true, msg: '买了' + item.name + '，得 ' + item.food + ' 口粮', cost: price };
}

/* ---------------------------------------------------------------- 领主交涉 */

/** 君主 / 一方领兵者 / 普通将领：送礼的兑换率不同 */
const LORD_RANK = {
  caocao: 'king', liubei: 'king', sunquan: 'king', yuanshao: 'king', lvbu: 'king',
  liubiao: 'king', liuzhang: 'king', kebineng: 'king', mateng: 'king', huangfusong: 'king',
  xiahou: 'lord', zhangliao: 'lord', guanyu: 'lord', zhangfei: 'lord', zhouyu: 'lord',
  taishici: 'lord', yanliang: 'lord', gaoshun: 'lord', caimao: 'lord', zhangren: 'lord', machao: 'lord',
};
const RANK_NAME = { king: '君主', lord: '领兵者', general: '将领' };
const RANK_RATE = { king: 5, lord: 3, general: 2 };

function lordRank(lord) {
  return LORD_RANK[lord.id] || 'general';
}

function lordLines(lord) {
  const base = LORD_TALK[lord.id] || {};
  const pool = FACTION_TALK[lord.faction] || { greet: [], idle: [] };
  const factionName = FACTIONS[lord.faction] ? FACTIONS[lord.faction].full + '麾下' : '游走于乱世';
  const bio = LORD_BIOS[lord.id] || base.bio || LORD_EXTRA_BIO[lord.id] || (lord.name + '，' + factionName + '。');
  const greet = base.greet || (pool.greet && pool.greet[0]) || '有什么事？';
  const idle = (base.idle || []).concat(pool.idle || []);
  return {
    greet: greet,
    bio: bio,
    idle: idle.length ? idle : ['在看着远处。'],
    warLine: base.warLine || '',
  };
}

/** 每次对话随机一句闲聊，结合当前战事 */
function lordIdle(state, lord) {
  const t = lordLines(lord);
  const pool = (t.idle || []).slice();
  const war = state.wars || {};
  let atWar = false;
  Object.keys(war).forEach(function (id) { if (war[id] && id !== 'bandit') atWar = true; });
  if (atWar && t.warLine) pool.push(t.warLine);
  const pick = pool[Math.floor(state.rng.random() * pool.length)] || '在巡视营地。';
  return pick;
}

function lordGreet(state, lord) {
  const t = lordLines(lord);
  const line = t.greet || '你来了。';
  const rel = relationOf(state, lord.faction);
  return line + '\n（关系 ' + rel + ' · ' + RANK_NAME[lordRank(lord)] + '）';
}

/** 送礼：100 金 = 君主 5 点、领兵者 3 点、将领 2 点 */
function giftLord(state, lord, gold) {
  const n = Math.max(20, Math.floor(gold));
  if (state.player.gold < n) return { ok: false, msg: '金币不够，你只有 ' + state.player.gold };
  const rate = RANK_RATE[lordRank(lord)];
  const gain = Math.max(1, Math.round((n / 100) * rate));
  state.player.gold -= n;
  changeRelation(state, lord.faction, gain);
  const rel = relationOf(state, lord.faction);
  pushLog(state, '你给' + lord.name + '送了 ' + n + ' 金，关系 +' + gain + '（现在 ' + rel + '）。');
  return { ok: true, msg: '送 ' + n + ' 金，关系 +' + gain + '（现在 ' + rel + '）', gain, rel };
}

/** 开战：直接扣 25 关系 */
function provokeLord(state, lord) {
  changeRelation(state, lord.faction, -25);
  state.wars[lord.faction] = true;
  const rel = relationOf(state, lord.faction);
  pushLog(state, '你和' + lord.name + '翻了脸，关系 ' + rel + '。');
  return { ok: true, msg: '关系 -25（现在 ' + rel + '）' };
}

/** 领主兵力概览 */
function lordTroopLine(lord) {
  const rows = [];
  Object.keys(lord.troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    if (t && lord.troops[id] > 0) rows.push(t.name + ' ' + lord.troops[id]);
  });
  return rows;
}

/* ---------------------------------------------------------------- 战役 */

function campaignState(state) {
  const stage = state.campaign.stage;
  return CAMPAIGN[Math.min(stage, CAMPAIGN.length - 1)];
}

/** 下一步该去哪——只指路，不剧透后面的事 */
const CAMPAIGN_HINT = {
  reach_chenliu: '往东走到陈留。路上别停，西凉铁骑会追。',
  troops_30: '在陈留一带招兵，凑到 30 人；市集里也备点粮。',
  win_wuchao: '回官渡。到了就会有一场硬仗。',
  take_xiapi: '南下打下邳。',
  win_chibi: '去赤壁或柴桑，水战自己会来。',
  win_yiling: '去夷陵。',
  win_final: '带 250 人以上，打进任意一座都城（许昌 / 成都 / 建业 / 邺）。',
};

function campaignInfo(state) {
  if (!state || !state.campaign) return null;
  if (state.campaign.stage >= CAMPAIGN.length) {
    return { done: true, total: CAMPAIGN.length, index: CAMPAIGN.length };
  }
  const ch = CAMPAIGN[state.campaign.stage];
  if (!ch) return null;
  return {
    index: state.campaign.stage,
    total: CAMPAIGN.length,
    id: ch.id,
    title: ch.title,
    goal: ch.goal,
    hint: CAMPAIGN_HINT[ch.check] || ch.goal,
    check: ch.check,
  };
}

function advanceCampaign(state) {
  const c = state.campaign;
  if (c.stage >= CAMPAIGN.length) return;
  const ch = CAMPAIGN[c.stage];
  if (!ch) return;
  if (checkCampaign(state, ch.check)) {
    c.done.push(ch.id);
    state.flags.campaignDone.push(ch.id);
    if (ch.reward) {
      if (ch.reward.renown) state.player.renown += ch.reward.renown;
      if (ch.reward.gold) state.player.gold += ch.reward.gold;
      if (ch.reward.shi) state.player.shi += ch.reward.shi;
      if (ch.reward.banner) {
        state.player.banner = true;
        state.player.flagName = '旗 · ' + state.player.name;
      }
    }
    c.stage += 1;
    if (ch.id === 'prologue') {
      state.parties = state.parties.filter(function (p) { return !p.scripted; });
    }
    state.events.push({ type: 'chapter', chapterId: ch.id });
    pushLog(state, '【' + ch.title + '】' + (ch.after || ''));
    advanceCampaign(state);
  }
}

function checkCampaign(state, key) {
  const p = state.player;
  const count = army.troopCount(p.troops);
  if (key === 'reach_chenliu') {
    if (p.atSiteId === 'chenliu') return true;
    if (state.clock.day > 8) return true;
    return false;
  }
  if (key === 'troops_30') {
    if (count >= 30) return true;
    return false;
  }
  if (key === 'win_wuchao') return !!state.flags['win_act2'];
  if (key === 'take_xiapi') {
    const s = siteById(state.world, 'xiapi');
    return !!(s && s.playerOwned) || !!state.flags.lvbuBeaten || !!state.flags['win_act3'];
  }
  if (key === 'win_chibi') return !!state.flags['win_act4'];
  if (key === 'win_yiling') return !!state.flags['win_act5'];
  if (key === 'win_final') return !!state.flags['win_final'];
  return false;
}

/** 战役触发的特殊战斗：回到地图某处时开打 */
function tryCampaignBattle(state) {
  const p = state.player;
  const stage = state.campaign.stage;
  if (stage === 2 && p.atSiteId === 'guandu') {
    return startCampaignBattle(state, 'wuchao');
  }
  if (stage === 4 && (p.atSiteId === 'chibi' || p.atSiteId === 'chaisang')) {
    return startCampaignBattle(state, 'chibi');
  }
  if (stage === 5 && p.atSiteId === 'yiling') {
    return startCampaignBattle(state, 'yiling');
  }
  if (stage === 6) {
    const capitals = ['xuchang', 'chengdu', 'jianye', 'ye'];
    if (capitals.indexOf(p.atSiteId) >= 0 && army.troopCount(p.troops) >= 250) {
      return startCampaignBattle(state, 'final');
    }
  }
  return null;
}

/** 战役好感/后果：乌巢一把火，袁军全线松动 */
function applyCampaignEffect(state, id) {
  if (id === 'act2') {
    state.flags['win_act2'] = true;
    changeRelation(state, 'yuan', -70);
    state.world.sites.forEach(function (s) {
      if (s.ownerFaction === 'yuan') {
        s.garrison = Math.max(10, Math.round(s.garrison * 0.5));
        s.garrisonBase = Math.max(10, Math.round(s.garrisonBase * 0.5));
      }
    });
    pushLog(state, '袁军粮道断了。邺城以南的守军跑了一半。');
  } else if (id === 'act4') {
    state.flags['win_act4'] = true;
    changeRelation(state, 'wei', -50);
    changeRelation(state, 'wu', 30);
    pushLog(state, '曹操的水寨烧成一片焦土。江东的船，从此不怕北边。');
  } else if (id === 'act5') {
    state.flags['win_act5'] = true;
    changeRelation(state, 'shu', -70);
    pushLog(state, '七百里连营，一夜之间只剩灰。');
  } else if (id === 'final') {
    state.flags['win_final'] = true;
    decideEnding(state);
  }
}

/* ---------------------------------------------------------------- 史简 */

function useHistory(state, markId) {
  const p = state.player;
  if (!state.battle) return { ok: false, msg: '现在没有在打仗' };
  if (p.shi <= 0) return { ok: false, msg: '史简用完了' };
  if (state.battle.finished) return { ok: false, msg: '仗已经打完了' };
  if (state.battle.shiMark) return { ok: false, msg: '这一战你已经落过一笔' };
  const marks = require('../data/china.js').HISTORY_MARKS;
  if (!marks[markId]) return { ok: false, msg: '写不出这一笔' };
  p.shi -= 1;
  p.shiUsed += 1;
  state.battle.applyShiMark(markId);
  Object.keys(state.relations).forEach(function (id) {
    if (id === 'bandit') return;
    changeRelation(state, id, -6);
  });
  pushLog(state, marks[markId].text + '天下人会记住这一笔。');
  return { ok: true, msg: marks[markId].name };
}

/* ---------------------------------------------------------------- 胜负 */

function checkVictory(state) {
  const owned = state.world.sites.filter(function (s) { return s.playerOwned; }).length;
  if (owned >= 8 && !state.gameOver) {
    decideEnding(state);
  }
}

function decideEnding(state) {
  const p = state.player;
  let type = 'self';
  if (p.faction === 'wei') type = 'ding';
  else if (p.faction === 'shu') type = 'xu';
  else if (p.faction === 'wu') type = 'fen';
  else type = 'self';

  const owned = state.world.sites.filter(function (s) { return s.playerOwned; }).length;
  let text = ENDINGS[type].text;
  if (type === 'ding') {
    text += '\n（你握有 ' + owned + ' 座城，用了 ' + p.shiUsed + ' 支史简。）';
  } else if (type === 'xu') {
    text += '\n（名册上还剩 ' + army.troopCount(p.troops) + ' 个名字。）';
  } else if (type === 'fen') {
    text += '\n（你烧掉了 ' + p.shiUsed + ' 支史简，地图上有 ' + owned + ' 座城没有主人。）';
  } else {
    text += '\n（你带 ' + army.troopCount(p.troops) + ' 人站在三方之外。）';
  }
  endGame(state, type, text, ENDINGS[type].title);
}

function endGame(state, ending, text, title) {
  state.gameOver = true;
  state.ending = { type: ending, text, title: title || '' };
  stopMoving(state);
  pushLog(state, '【' + (title || '终局') + '】' + text.split('\n')[0]);
}

/* ---------------------------------------------------------------- 存档 */

function serialize(state) {
  const copy = {
    version: SAVE_VERSION,
    seed: state.seed,
    clock: state.clock,
    world: state.world,
    player: state.player,
    relations: state.relations,
    wars: state.wars,
    factionWars: state.factionWars || {},
    diplomacySeeded: !!state.diplomacySeeded,
    prisoners: (state.prisoners || []).filter(function (p) { return !p.escaped; }),
    lords: state.lords,
    parties: state.parties,
    quests: state.quests,
    log: state.log,
    stats: state.stats,
    flags: state.flags,
    campaign: state.campaign,
    gameOver: state.gameOver,
    ending: state.ending,
    timeScale: state.timeScale,
    questSeq: state.questSeq,
    partySeq: state.partySeq,
    flee: state.flee || {},
    heroSites: state.heroSites || null,
  };
  copy.player.route = [];
  copy.player.stepFrom = null;
  copy.player.stepTo = null;
  copy.player.stepProgress = 0;
  return JSON.stringify(copy);
}

function deserialize(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (e) {
    return null;
  }
  if (!data || !data.world || !data.player) return null;
  if (!data.relations) return null; // 旧档不兼容

  const state = {
    version: data.version || SAVE_VERSION,
    seed: data.seed,
    clock: data.clock,
    world: data.world,
    player: data.player,
    relations: data.relations,
    wars: data.wars || {},
    factionWars: data.factionWars || {},
    diplomacySeeded: !!data.diplomacySeeded,
    prisoners: data.prisoners || [],
    lords: data.lords || [],
    parties: data.parties || [],
    quests: data.quests || [],
    log: data.log || [],
    events: [],
    stats: data.stats || { battlesWon: 0, battlesLost: 0, troopsLost: 0, goldEarned: 0, distance: 0, days: 0, sitesTaken: 0, villagesRaided: 0 },
    flags: data.flags || {},
    campaign: data.campaign || { stage: 0, done: [] },
    gameOver: !!data.gameOver,
    ending: data.ending || null,
    timeScale: data.timeScale || 1,
    npcClock: 0,
    rng: new RNG((data.seed || 1) + (data.clock ? data.clock.day : 1) * 7919),
    questSeq: data.questSeq || 1,
    partySeq: data.partySeq || 1,
    flee: data.flee || {},
    heroSites: data.heroSites || null,
    battle: null,
  };
  state.player.route = [];
  state.player.stepFrom = null;
  state.player.stepTo = null;
  state.player.stepProgress = 0;

  // 老存档里没有后来补的领主：按 LORDS 定义补齐，已死过的保持死过
  const { LORDS } = require('../data/china.js');
  const known = {};
  state.lords.forEach(function (l) { known[l.id] = true; });
  LORDS.forEach(function (def) {
    if (known[def.id]) return;
    const lord = lordFromDef(state, def);
    const dead = (data.deadLords || {})[def.id];
    if (dead) {
      lord.alive = false;
      lord.troops = {};
      lord.respawnDay = dead;
    }
    state.lords.push(lord);
  });
  war.init(state);
  war.bindLogger(pushLog);
  war.bindPassable(isPassable);
  return state;
}

module.exports = {
  HOUR_SECONDS,
  SAVE_VERSION,
  createGame,
  update,
  goTo,
  currentPos,
  stopMoving,
  camp,
  advanceTime,
  dailyTick,
  playerSpeed,
  capacity,
  relationOf,
  isHostileFaction,
  isHostileSite,
  siteStatus,
  changeRelation,
  startPartyBattle,
  startLordBattle,
  startSiege,
  startCampaignBattle,
  resolveBattle,
  takeSite,
  offerQuest,
  deliverGrain,
  checkScoutQuest,
  completeQuests,
  joinFaction,
  declareWar,
  prisonersOf,
  ransomPrisoner,
  releasePrisoner,
  factionWars,
  raidVillage,
  campaignState,
  campaignInfo,
  advanceCampaign,
  tryCampaignBattle,
  applyCampaignEffect,
  useHistory,
  renownTitle,
  pushLog,
  serialize,
  deserialize,
  endGame,
  checkVictory,
  decideEnding,
  spawnBanditParties,
  refillBandits,
  pickBanditTier,
  allowedTiers,
  garrisonTroops,
  findFreeSpotNear,
  giftLord,
  provokeLord,
  lordGreet,
  lordIdle,
  lordLines,
  lordRank,
  lordTroopLine,
  buyVillageFood,
  reviveAfterDefeat,
  afterRetreat,
  canFight,
  gameHours,
  LORD_RANK,
};
