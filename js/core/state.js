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
/** 山寨被清空后的冷却：几天后重新聚人，又可再打一次 */
const CAMP_RESPAWN_DAYS = 5;
const SAVE_VERSION = 5; // 天下放大到 128x154，旧档地图对不上，直接换新

/** 全图常驻匪团目标数量（玩家附近看得见，远处也算） */
const BANDIT_TARGET = 12;
const BANDIT_MAX = 16;

/** 三家与袁绍算大国，投靠要声望 200；其余割据势力算小国，100 即可 */
const MAJOR_FACTIONS = { wei: true, shu: true, wu: true, yuan: true };

function joinRenownReq(factionId) {
  return MAJOR_FACTIONS[factionId] ? 200 : 100;
}

/* ---------------------------------------------------------------- 自立国号 */

// 旗色的中文名，和立国页十二色一一对应；扎营等界面用它，不直接露十六进制
const FLAG_COLOR_NAMES = {
  '#d9a441': '鎏金', '#b4463c': '赤', '#3f6fa8': '靛', '#4f8f5a': '苍',
  '#8c6fae': '紫', '#b06a3c': '赭', '#6a8f8a': '青', '#8f8f86': '灰',
  '#c95a7a': '桃', '#5a7fa0': '蓝', '#7a6a4a': '褐', '#2f6f6a': '墨青',
};

function flagColorName(hex) {
  return FLAG_COLOR_NAMES[String(hex || '').toLowerCase()] || '';
}

/** 玩家那面旗在数据里的默认样子：没立国时仍是“你的旗” */
function syncPlayerFaction(country) {
  const f = FACTIONS.player;
  if (!f) return;
  if (country && country.name) {
    f.name = country.name;
    f.full = country.name + '国';
    f.color = country.color || '#d9a441';
    f.banner = country.name;
  } else {
    f.name = '我';
    f.full = '你的旗';
    f.color = '#d9a441';
    f.banner = '我';
  }
}

/** 把国号/旗色铺到所有已占领城与麾下领主：地图、城头、旗块都跟着换 */
function applyPlayerCountry(state) {
  const p = state && state.player;
  if (!p) return;
  syncPlayerFaction(p.country);
  if (!p.country || !p.country.name) return;
  p.faction = 'player';
  state.world.sites.forEach(function (site) {
    if (!site.playerOwned) return;
    site.ownerFaction = 'player';
    site.faction = 'player';
    site.color = p.country.color;
    site.banner = p.country.name;
  });
  // 玩家封出去的家臣，不论当年挂的是谁的旗，自立后都改挂你的国号
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.title !== '你的家臣') return;
    lord.faction = 'player';
  });
}

/** 国号必须是且只能是一个汉字 */
function cleanCountryName(name) {
  const s = String(name === undefined || name === null ? '' : name).trim();
  return /^[\u4e00-\u9fa5]$/.test(s) ? s : null;
}

/** 立国 / 改国号：返回统一结果，UI 只负责选字和选色 */
function foundCountry(state, name, color) {
  const p = state && state.player;
  if (!p) return { ok: false, msg: '还没有自己的队伍' };
  const n = cleanCountryName(name);
  if (!n) return { ok: false, msg: '国号只能取一个汉字' };
  const c = /^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? color : '#d9a441';
  const old = p.country && p.country.name;
  if (!p.country) p.country = { foundedDay: state.clock.day };
  p.country.name = n;
  p.country.color = c;
  p.faction = 'player';
  applyPlayerCountry(state);
  pushLog(state, (old ? '改国号为「' + n + '」' : '你立国号为「' + n + '」') +
    '，旗色换了新的。所有城头与麾下领主都改挂这面旗。', 'throne');
  return {
    ok: true,
    msg: old
      ? '国号「' + n + '」已改，所有城与领主换旗'
      : '国号「' + n + '」已立，所有城与领主换旗',
    name: n,
    color: c,
  };
}

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

/* ---------------------------------------------------------------- 史册 */

const IMPORTANT_KINDS = {
  war: true, battle: true, siege: true, campaign: true, faction: true,
  recruit: true, death: true, throne: true,
};

const IMPORTANT_WORDS = /城破|亡了|斩了|被俘|俘虏|围城|攻城|攻下|夺城|夺下|归降|称王|立国|建国|宣战|议和|大战|决一死战|战役|改旗|易主|即位|称帝|断粮|粮尽|兵变|哗变/;

/** 史册：全部写进去；太久远的只留重要事，鸡毛蒜皮不占地方 */
function pushLog(state, text, kind) {
  const k = kind || 'life';
  const important = !!IMPORTANT_KINDS[k] || IMPORTANT_WORDS.test(String(text || ''));
  state.log.push({
    day: state.clock.day,
    hour: Math.floor(state.clock.hour),
    text,
    kind: k,
    important: important,
  });
  // 上限 700 条；要挤位置时先丢最旧的琐事，重要的事一律留着
  while (state.log.length > 700) {
    let cut = -1;
    for (let i = 0; i < state.log.length; i += 1) {
      if (!state.log[i].important) { cut = i; break; }
    }
    state.log.splice(cut >= 0 ? cut : 0, 1);
  }
}

/* ---------------------------------------------------------------- 初始化 */

function createGame(opts) {
  const seed = (opts && opts.seed) || (Date.now() % 2147483647);
  const rng = new RNG(seed);
  const world = createWorld(seed);

  world.sites.forEach(function (site) {
    let h = 0;
    for (let i = 0; i < site.id.length; i++) h = (h * 31 + site.id.charCodeAt(i)) % 9973;
    site.recruits = {};
    (site.recruitList || []).forEach(function (id) {
      site.recruits[id] = rng.int(1, site.recruitCap || 4);
    });
    // 村市口粮是“村里现有的那点东西”，不是无限货架：每样最多 1-5 份。
    // 用稳定散列，不额外消耗世界随机数，保证同一种子的开局与旧版一致。
    site.foodStock = {};
    if (site.type === 'village') {
      VILLAGE_FOOD.forEach(function (f, i) {
        const cap = f.stockMax || 3;
        site.foodStock[f.id] = 1 + ((h + i * 17) % cap);
      });
    }
    // 领主招兵走另一口锅：和玩家的招募池分开，互不抢人
    site.lordRecruits = {};
    if (site.type === 'town' || site.type === 'castle' || site.type === 'village') {
      const lcap = site.type === 'village' ? 2 : 4;
      (site.recruitList || []).forEach(function (id, i) {
        site.lordRecruits[id] = (h + i * 7) % (lcap + 1);
      });
    }
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
    // 自立后的国号与旗色：打下第一座城才会立，固定一字
    country: null,
    banner: false,
    foodWarnDay: 0,
    foodWarned: false,
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
    factionState: {},
    knownHidden: {},
    gameOver: false,
    ending: null,
    timeScale: 1,
    npcClock: 0,
    rng,
    questSeq: 1,
    partySeq: 1,
    battle: null,
    playerSiege: null,
    foodWarning: null,
  };

  syncPlayerFaction(null);
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
    dead: false,
    retired: false,
    prisoner: null,
    hidden: null,
    resting: false,
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

/** 山寨刷新：被清空后过几天重新聚人；洗劫态期间只剩火烧过的空营 */
function campRespawnTick(state) {
  state.world.sites.forEach(function (site) {
    if (!site || site.type !== 'camp' || !site.cleared) return;
    if (!site.respawnDay) {
      site.respawnDay = (site.lootedDay || state.clock.day) + CAMP_RESPAWN_DAYS;
    }
    if (state.clock.day < site.respawnDay) return;
    site.cleared = false;
    site.looted = false;
    site.lootedDay = null;
    site.respawnDay = null;
    site.garrison = site.garrisonBase || site.garrison || 40;
  });
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
  // 自立的人不等于见谁都打：只有宣战、结仇或主动敌对才算敌人。
  // 挂在一家诸侯名下时，才算“别家的人默认不对付”。
  if (pf && pf !== 'player' && factionId !== pf && rel < 20) return true;
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
  // 洗劫过的山寨不再是军事目标：只剩废墟，点进去看火烧过的空营
  if (site.type === 'camp') return !site.cleared;
  if (site.playerOwned) return false;
  return isHostileFaction(state, site.ownerFaction);
}

function siteStatus(state, site) {
  if (site.playerOwned) return '你的领地';
  if (site.type === 'camp') return site.cleared ? '废墟 · 已洗劫' : '贼巢 · 可攻';
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
  if (state.playerSiege) {
    const ps = siteById(state.world, state.playerSiege.siteId);
    if (!ps || Math.abs(x - ps.x) + Math.abs(y - ps.y) > 1) cancelPlayerSiege(state);
  }
  const from = currentPos(state);
  if (from.x === x && from.y === y) return { ok: false, msg: '已经在这里了' };
  const path = findPath(state.world, from, { x, y });
  if (!path || !path.length) return { ok: false, msg: '没有可达的路线' };

  state.player.route = path;
  state.player.stepFrom = { x: from.x, y: from.y };
  state.player.stepTo = path[0];
  state.player.stepProgress = 0;
  state.player.atSiteId = null;
  // 一动身就不再是"城里歇着"了
  state.player.resting = null;
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
  pushLog(state, '就地扎营一天，火头军煮了粥。', 'camp');
  return { ok: true, msg: '休整完毕' };
}

/** 扎营里"在这里待一会儿"：原地不动，让天下自己走几个时辰 */
function campWait(state, hours) {
  const h = Math.max(1, Math.min(72, Math.round(hours || 6)));
  const waited = h === 12 ? '半日' : h === 24 ? '一天' : h === 72 ? '三日' : h + '个时辰';
  if (state.player.route.length) stopMoving(state);
  state.player.atSiteId = null;
  advanceTime(state, h);
  // 扎营页自己不跑主循环：把刚欠下的时辰立刻交给 NPC 步进，
  // 否则日历翻了三天，诸侯还站在原地没动。剧情事件留在队列里，回地图再弹。
  update(state, 0, { ignoreEvents: true });
  state.player.morale = Math.min(100, state.player.morale + Math.max(1, Math.round(h * 0.55)));
  if (h >= 12) {
    pushLog(state, '你在野地里按兵不动，等了' + waited +
      '。火没灭，斥候也没回来。', 'camp');
  }
  return { ok: true, msg: '等了' + waited + '，士气 +' + Math.max(1, Math.round(h * 0.55)) };
}

/** 在城里歇下：人不出门，天下照常走 */
function startRest(state, site) {
  if (!site || site.type === 'camp') return { ok: false, msg: '这里歇不下脚' };
  if (isHostileSite(state, site)) return { ok: false, msg: '城里的人不会给你开门' };
  stopMoving(state);
  state.player.atSiteId = site.id;
  state.player.resting = site.id;
  if (site.type === 'village') {
    pushLog(state, '你在' + site.name + '的柴房里歇下。粮吃得慢一半，可村里藏不住人，追兵会摸进来。');
    return { ok: true, msg: '在' + site.name + '歇下：粮耗减半；村里藏不住人，追兵仍会摸进来' };
  }
  pushLog(state, '你在' + site.name + '的客栈里歇下了。城外的旗照旧在动，你的粮吃得慢了一半。');
  return { ok: true, msg: '在' + site.name + '歇下：粮耗减半，暂时没人来追你' };
}

function stopRest(state) {
  state.player.resting = null;
  return { ok: true, msg: '收拾行装，准备上路' };
}

function isResting(state) {
  return !!(state && state.player && state.player.resting);
}

/** 城里/关隘歇下才算躲开追兵；村庄藏不住人，粮耗照样减半，但追兵能摸进来 */
function isSafeResting(state) {
  const p = state && state.player;
  if (!p || !p.resting) return false;
  const site = siteById(state.world, p.resting);
  return !!site && site.type !== 'village';
}

/* ---------------------------------------------------------------- 粮草预警 */

/** 下一次发粮要多少：和 dailyTick 用同一套兵力、加成、休整折扣 */
function nextFoodNeed(state) {
  const p = state.player;
  if (!p) return 0;
  const hb = heroes.heroBonus(state);
  const restMul = isResting(state) ? 0.5 : 1;
  return Math.max(1, Math.round(army.foodPerDay(p.troops) * (1 - hb.foodPct) * restMul));
}

/** 粮草够不够撑到下一次发粮；不够就留下一条常驻告警，补够了自动消 */
function refreshFoodWarning(state) {
  const p = state && state.player;
  if (!p) return null;
  const need = nextFoodNeed(state);
  if (p.food >= need) {
    state.foodWarning = null;
    p.foodWarned = false;
    return null;
  }
  const prev = state.foodWarning;
  state.foodWarning = {
    need: need,
    food: p.food,
    day: state.clock.day,
    at: state.clock.hour,
  };
  if (prev && prev.need === need && prev.food === p.food) return state.foodWarning;
  return state.foodWarning;
}

/** 扣完这一顿之后，提前把“下一顿不够”喊出来；一个缺粮段只喊一次 */
function warnFoodShortage(state) {
  const w = refreshFoodWarning(state);
  const p = state.player;
  if (!w || p.foodWarned) return;
  p.foodWarned = true;
  p.foodWarnDay = state.clock.day;
  const text = '粮草不足以支撑两日（现存 ' + p.food + '，下次发粮需 ' + w.need +
    '）。请尽快补充，否则军队哗变。';
  pushLog(state, text, 'famine');
  state.events.push({ type: 'warning', title: '粮草告急', text: text });
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
  // 在城里歇着的时候，粮只吃一半
  const restMul = isResting(state) ? 0.5 : 1;
  const need = isFoodDay
    ? Math.max(1, Math.round(army.foodPerDay(p.troops) * (1 - hb.foodPct) * restMul))
    : 0;

  if (need > 0) {
    if (p.food >= need) {
      p.food -= need;
      if (p.food < need * 2) {
        p.morale = Math.max(0, p.morale - 3);
        pushLog(state, '粮草见底（剩 ' + p.food + '），队伍开始嘀咕。');
      }
    } else {
      // 上一轮预警过还补不上，就不是“饿肚子”，是真哗变
      const mutiny = !!state.foodWarning;
      const short = need - p.food;
      p.food = 0;
      p.morale = Math.max(0, p.morale - (mutiny ? 18 : 10));
      const count = army.troopCount(p.troops);
      const loss = Math.min(count, mutiny ? Math.max(short, Math.ceil(count * 0.12)) : short);
      if (loss > 0) {
        army.distributeLosses(p.troops, loss);
        state.stats.troopsLost += loss;
        pushLog(state, mutiny
          ? '断粮哗变！粮车空了，' + loss + ' 人连夜散去，营里差点压不住。'
          : '断粮！' + loss + ' 人夜里走了。');
      }
      if (army.troopCount(p.troops) <= 0) {
        reviveAfterDefeat(state, 'starve');
        return;
      }
    }
  }

  // 这一顿已经扣完：如果下一顿不够，立刻提前告警（一个缺粮段只弹一次）
  warnFoodShortage(state);

  if (p.morale < 65) p.morale = Math.min(65 + hb.morale, p.morale + 3 + hb.morale);
  const income = economy.dailyIncome(state);
  if (income > 0) {
    p.gold += income;
    state.stats.goldEarned += income;
  }
  economy.dailyMarket(state, state.rng);
  trade.dailyGoods(state, state.rng);

  // 匪团补充：维持全图常驻数量（太少没得打，太多寸步难行）
  campRespawnTick(state);
  refillBandits(state);
  // 国战：谁跟谁翻了脸；牢里的人熬过一天
  war.diplomacyTick(state);
  war.prisonerTick(state);
  // 国战 AI：各家的集结、开拔、围城与守城，一天只做一次决策
  if (war.strategyTick) war.strategyTick(state);
  // 领主重生（关在牢里的不算，等着被赎、被救或自己跑）
  state.lords.forEach(function (lord) {
    if (lord.alive || lord.prisoner) return;
    if (lord.dead || lord.retired || lord.hidden) return;
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

  // 领主在自己的城镇/村庄招兵：用独立的领主兵源池，和玩家招募互不冲突
  lordRecruitTick(state);

  // 自立的人手下有领主：跟仇家自动开打，否则这些领主只会站着
  if (state.lords.some(function (l) { return l.faction === 'player' && l.alive; })) {
    Object.keys(FACTIONS).forEach(function (id) {
      if (id === 'player' || id === 'bandit') return;
      if ((state.factionState[id] || {}).dead) return;
      if ((state.relations[id] || 0) <= -25 && !war.atWar(state, 'player', id)) {
        war.declare(state, 'player', id, true);
      }
    });
  }

  // 灭国：城丢光、人也没了，七天倒计时
  factionTick(state);
}

/* ---------------------------------------------------------------- 主循环 */

function update(state, dtSeconds, opts) {
  if (state.gameOver) return;
  const ignoreEvents = !!(opts && opts.ignoreEvents);
  const dt = dtSeconds * (state.timeScale || 1);
  const p = state.player;
  settleUnitSteps(state);
  // 每帧顺手看看下一顿够不够；第一次不够就告警，别等到哗变才说
  warnFoodShortage(state);

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
  } else {
    // 跟骑砍一样：玩家站着不动，时间就停；只有进城修养、在大地图上看天下时，外面才照常走
    if (isResting(state)) advanceTime(state, dt / HOUR_SECONDS);
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
    if (war.siegeTick) war.siegeTick(state);
    checkPursuit(state);
    advanceCampaign(state);
    if (state.events.length && !ignoreEvents) return;
  }
}

function onArrive(state, x, y) {
  const site = siteAt(state.world, x, y);
  if (site) {
    state.player.atSiteId = site.id;
    site.visited = true;
    if (isHostileSite(state, site)) {
      if (canFight(state, site.id)) {
        // 城与关隘先围城，贼巢和村庄直接开打
        const kind = (site.type === 'town' || site.type === 'castle') ? 'player-siege' : 'siege';
        state.events.push({ type: kind, siteId: site.id });
      }
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
    if (enemy.defTroops) {
      state.events.push({ type: 'chase', kind: 'lord', id: enemy.id });
    } else {
      state.events.push({ type: 'chase', kind: 'party', id: enemy.id });
    }
  } else {
    advanceCampaign(state);
  }
}

/** 只有真的踩到同一格才算撞上；贴着脸站不算 */
function adjacentEnemy(state, x, y) {
  if (isSafeResting(state)) return null;
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
  // 人在城里/关隘歇着，外面的人找不到你；在村庄躲着不算，追兵照样能摸进来
  if (isSafeResting(state)) return;
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
    // 打起来了就没有"自选撤离"：领主、贼寇都走同一个被追上页面
    if (unit.defTroops) {
      state.events.push({ type: 'chase', kind: 'lord', id: unit.id });
    } else {
      state.events.push({ type: 'chase', kind: 'party', id: unit.id });
    }
    return;
  }
}

/* ---------------------------------------------------------------- 被追上 */

/** 买路的价钱：人越多越贵，名将还要加价 */
function giveWayCost(state, unit) {
  const n = army.troopCount(unit.troops || {});
  const isLord = !!unit.defTroops;
  const fac = isLord && FACTIONS[unit.faction] ? FACTIONS[unit.faction] : null;
  const isRuler = !!(fac && fac.lord === unit.name);
  const rank = isLord ? (isRuler ? 1.5 : 1.1) : 0.8;
  return Math.max(40, Math.round((30 + n * 3.2) * rank));
}

/** 给钱脱身：一天之内不追你；关系太差的人不收钱 */
function giveWay(state, unitId, kind) {
  const p = state.player;
  const unit = kind === 'party'
    ? state.parties.filter(function (x) { return x.id === unitId; })[0]
    : state.lords.filter(function (x) { return x.id === unitId; })[0];
  if (!unit) return { ok: false, msg: '人已经不在了' };
  const isLord = kind !== 'party';
  if (isLord) {
    const rel = relationOf(state, unit.faction);
    if (rel < -50) {
      pushLog(state, '你把钱袋递过去，' + unit.name + '一脚踢开：“这时候了，还想拿钱买命？”', 'war');
      return { ok: false, refused: true, msg: unit.name + '不收你的钱：关系 ' + rel + '，低于 -50 的人只认刀。' };
    }
  }
  const cost = giveWayCost(state, unit);
  if (p.gold < cost) return { ok: false, msg: '他要 ' + cost + ' 金钱，你身上只有 ' + p.gold + '。' };
  p.gold -= cost;
  const now = gameHours(state);
  unit.cooldownH = now + 24;
  unit.payoffUntil = now + 24;
  unit.chasing = false;
  if (isLord) changeRelation(state, unit.faction, -2);
  p.renown = Math.max(0, p.renown - 2);
  pushLog(state, '你给了' + unit.name + ' ' + cost + ' 金钱买路。他收了钱，把刀收回鞘里，一天之内不会再来找你。', 'war');
  return { ok: true, cost: cost, msg: '付 ' + cost + ' 金钱脱身，一天之内他不会追上来。' };
}

/** 留人断后：折一部分兵，换他原地停几个时辰；西凉铁骑只吃这一套，停八小时 */
function breakTail(state, unitId, kind) {
  const p = state.player;
  const unit = kind === 'party'
    ? state.parties.filter(function (x) { return x.id === unitId; })[0]
    : state.lords.filter(function (x) { return x.id === unitId; })[0];
  if (!unit) return { ok: false, msg: '人已经不在了' };
  const scripted = !!unit.scripted;
  const count = army.troopCount(p.troops);
  if (count <= 1) {
    stopMoving(state);
    if (scripted) {
      endGame(state, 'killed',
        '西凉铁骑追上来时，你身边已经没人可以留下断后。\n马踏过冻土，刀落下去。\n你的名字没有写进任何一本史书。',
        '剧终');
      return { ok: true, ended: true, msg: '无人断后。你被西凉铁骑追杀，死在路上。' };
    }
    return { ok: false, msg: '手下只剩你一个，留不下人断后。' };
  }
  const lose = scripted ? Math.max(1, Math.min(3, count - 1)) : Math.max(1, Math.round(count * 0.22));
  army.distributeLosses(p.troops, lose);
  state.stats.troopsLost += lose;
  p.morale = Math.max(0, p.morale - (scripted ? 8 : 6));
  const now = gameHours(state);
  const pause = scripted ? 8 : 3 + state.rng.int(0, 3);
  unit.pauseUntil = now + pause;
  unit.cooldownH = now + pause + 1;
  unit.chasing = false;
  if (scripted) {
    // 断后成功后铁骑不再主动追；只有玩家再贴到一格以内才会重新咬上来
    unit.dormant = true;
    pushLog(state, '你留下 ' + lose + ' 人断后。西凉铁骑停下来收拾这队人，会在这里停八个时辰。', 'war');
    return {
      ok: true, lose: lose, pause: pause,
      msg: '折了 ' + lose + ' 人。西凉铁骑在原地停 8 小时；之后除非你再贴到它脸上，否则不会再追。',
    };
  }
  pushLog(state, '你留下 ' + lose + ' 人断后。' + unit.name + '在原地收拾这队人，你趁这半天跑出去。', 'war');
  return { ok: true, lose: lose, pause: pause, msg: '折了 ' + lose + ' 人，他会在原地停 ' + pause + ' 小时，然后接着追。' };
}

/** 附近最近的活领主（匪团用来判断该不该跑） */function nearestLord(state, unit, range) {
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

/* ------------------------------------------------------------ NPC 走路 */

/** NPC 当前该画在哪：按游戏时辰在两格之间插值，跟主角一样一步一步走 */
function unitAnimPos(unit, nowH) {
  if (!unit.stepFrom || !unit.stepTo) return { x: unit.x, y: unit.y };
  const dur = unit.stepHours || NPC_STEP_HOURS;
  if (dur <= 0) return { x: unit.x, y: unit.y };
  const t = (nowH - (unit.stepStartH || 0)) / dur;
  if (t >= 1) return { x: unit.x, y: unit.y };
  const k = Math.max(0, t);
  return {
    x: unit.stepFrom.x + (unit.stepTo.x - unit.stepFrom.x) * k,
    y: unit.stepFrom.y + (unit.stepTo.y - unit.stepFrom.y) * k,
  };
}

/** 迈一步：格子上立刻算到新位置，画面上用 stepHours 个时辰走过去 */
function stepUnitTo(state, unit, step, hours) {
  const nowH = gameHours(state);
  const from = unitAnimPos(unit, nowH);
  unit.stepFrom = from;
  unit.stepTo = { x: step.x, y: step.y };
  unit.stepStartH = nowH;
  unit.stepHours = Math.max(0.4, hours);
  unit.x = step.x;
  unit.y = step.y;
}

/** 结算走完的那一步，别让插值数据一直挂着 */
function settleUnitSteps(state) {
  const nowH = gameHours(state);
  state.parties.concat(state.lords).forEach(function (u) {
    if (!u.stepFrom || !u.stepTo) return;
    const dur = u.stepHours || NPC_STEP_HOURS;
    if (nowH - (u.stepStartH || 0) >= dur) {
      u.stepFrom = null;
      u.stepTo = null;
      u.stepStartH = null;
      u.stepHours = null;
    }
  });
}

function moveParties(state) {
  const p = state.player;
  const nowH = gameHours(state);
  state.parties.forEach(function (party) {
    // 断后/买路约好的停战时辰，匪团也必须遵守，否则刚断完后脚又贴上来
    if (party.pauseUntil && nowH < party.pauseUntil) {
      party.chasing = false;
      return;
    }
    if (party.slow) {
      party.tick = (party.tick || 0) + 1;
      if (party.tick % party.slow !== 0) return;
    }
    // 西凉铁骑：只咬玩家，不跟领主互殴；断后之后除非玩家贴到脸上，否则原地不动
    if (party.scripted) {
      const dist = gridDistance(party, p);
      if (party.dormant) {
        if (dist > 1) {
          party.chasing = false;
          return;
        }
        party.dormant = false;
      }
      party.chasing = true;
      const step = greedyStep(state, party, { x: p.x, y: p.y });
      if (step) stepUnitTo(state, party, step, NPC_STEP_HOURS * (party.slow || 1));
      return;
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
    if (!isSafeResting(state) && dist <= (party.sight || 5) && isHostileFaction(state, party.faction)) {
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
      stepUnitTo(state, party, step, NPC_STEP_HOURS * (party.slow || 1));
    }
  });

  // 路上相逢：匪团与领主互殴
  fightNeighbors(state);
}

/** 按编制给领主补人：先补缺得最多的兵种 */
function refillLord(lord, n) {
  const def = lord.defTroops || {};
  if (!lord.troops) lord.troops = {};
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    let best = null;
    Object.keys(def).forEach(function (id) {
      const gap = def[id] - (lord.troops[id] || 0);
      if (gap > 0 && (!best || gap > best.gap)) best = { id: id, gap: gap };
    });
    if (!best) break;
    const put = Math.min(best.gap, left);
    lord.troops[best.id] = (lord.troops[best.id] || 0) + put;
    left -= put;
  }
  return lord.troops;
}

/** 领主在自己的城镇/村庄招兵：从领主专属兵源池里拿，不碰玩家的 site.recruits */
function recruitLordFromSite(state, lord, site, quota) {
  if (!lord || !site || !lord.defTroops) return 0;
  const pool = site.lordRecruits || {};
  const list = site.recruitList || [];
  let left = Math.max(0, Math.round(quota));
  let got = 0;
  while (left > 0) {
    let best = null;
    list.forEach(function (id) {
      if ((pool[id] || 0) <= 0) return;
      const gap = (lord.defTroops[id] || 0) - (lord.troops[id] || 0);
      if (gap <= 0) return;
      if (!best || gap > best.gap) best = { id: id, gap: gap };
    });
    if (!best) break;
    const put = Math.min(best.gap, left, pool[best.id]);
    if (put <= 0) break;
    lord.troops[best.id] = (lord.troops[best.id] || 0) + put;
    pool[best.id] -= put;
    left -= put;
    got += put;
  }
  return got;
}

/** 每天让停在自家城镇/村庄的领主补一点兵；兵源与玩家分开 */
function lordRecruitTick(state) {
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.prisoner) return;
    const site = siteAt(state.world, lord.x, lord.y);
    if (!site || (site.type !== 'town' && site.type !== 'castle' && site.type !== 'village')) return;
    if (site.ownerFaction !== lord.faction) return;
    const full = army.troopCount(lord.defTroops || {});
    const now = army.troopCount(lord.troops || {});
    if (full <= 0 || now >= full) return;
    const quota = Math.max(1, Math.min(4, Math.round((full - now) * 0.12)));
    recruitLordFromSite(state, lord, site, quota);
  });
}

/** 领主：敌对且玩家在视野内 → 追；否则回防驻地。兵多辎重多，走得比匪团慢一半 */
function moveLords(state) {
  const p = state.player;
  const nowH = gameHours(state);
  state.lords.forEach(function (lord) {
    if (!lord.alive) return;
    // 收了钱 / 被人缠住：原地待着，不动也不追
    if (lord.pauseUntil && nowH < lord.pauseUntil) return;
    const paidOff = !!(lord.payoffUntil && nowH < lord.payoffUntil);
    // 国战军令：集结 / 开拔 / 围城 / 回防。接了令就按军令走，不再自己乱追人
    if (lord.order && lord.order.siteId) {
      const orderSite = siteById(state.world, lord.order.siteId);
      if (orderSite) {
        const od = gridDistance(lord, orderSite);
        lord.chasing = false;
        lord.foeChasing = null;
        lord.banditChasing = null;
        lord.resting = false;
        if (lord.order.hold && od <= 1) return;
        lord.moveTick = (lord.moveTick || 0) + 1;
        if (lord.moveTick % 2 !== 0) return;
        const orderStep = greedyStep(state, lord, { x: orderSite.x, y: orderSite.y });
        if (orderStep) stepUnitTo(state, lord, orderStep, NPC_STEP_HOURS * 2);
        return;
      }
      lord.order = null;
    }
    let target;
    const home = siteById(state.world, lord.home);
    const dist = gridDistance(lord, p);
    const nowCount = army.troopCount(lord.troops || {});
    const fullCount = army.troopCount(lord.defTroops || {});
    // 打残了先回城补人：不然开局玩家能把名将一个个捡走
    const needRest = !!home && nowCount <= Math.max(6, Math.round(fullCount * 0.4));
    if (isHostileFaction(state, lord.faction) && !paidOff && !isSafeResting(state) && dist <= lord.sight && !needRest) {
      target = { x: p.x, y: p.y };
      lord.chasing = true;
      lord.resting = false;
    } else {
      lord.chasing = false;
      if (needRest) {
        target = { x: home.x, y: home.y };
        lord.foeChasing = null;
        lord.banditChasing = null;
        lord.resting = true;
      } else {
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
    }
    // 辎重多，两拍才挪一格：土匪轻装跑得掉，领主追不上
    lord.moveTick = (lord.moveTick || 0) + 1;
    if (lord.moveTick % 2 !== 0) return;
    if (!target) return;
    const step = greedyStep(state, lord, target);
    if (step) {
      stepUnitTo(state, lord, step, NPC_STEP_HOURS * 2);
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
    stepUnitTo(state, unit, best, NPC_STEP_HOURS);
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
    const site = siteAt(state.world, nx, ny);
    if (site) {
      // 村庄不是保险箱：追兵可以踩进村里把玩家揪出来
      const p = state.player;
      const inVillage = p && p.atSiteId === site.id && site.type === 'village' &&
        target && target.x === p.x && target.y === p.y;
      if (!inVillage) continue;
    }
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
  // 西凉铁骑是剧情追兵，不能拉出来正常对战；只能在被追上页留人断后
  if (!party || party.scripted) return null;
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

/** 玩家围城：城/关隘先扎营等 1-2 天，贼巢和村庄仍然直接打 */
const PLAYER_SIEGE_DAYS = { town: 1, castle: 2 };

function siegeWaitHours(site) {
  return (PLAYER_SIEGE_DAYS[site && site.type] || 0) * 24;
}

function beginPlayerSiege(state, site) {
  if (!site) return { ok: false, msg: '这里没有可围的城' };
  if (site.type !== 'town' && site.type !== 'castle') {
    return { ok: false, immediate: true, msg: '这里没有城墙，直接打' };
  }
  if (site.playerOwned) return { ok: false, msg: '这是你自己的城' };
  if (state.playerSiege && state.playerSiege.siteId !== site.id) {
    const other = siteById(state.world, state.playerSiege.siteId);
    return { ok: false, msg: '你还在围' + (other ? other.name : '另一座城') + '，先撤围再说' };
  }
  const days = PLAYER_SIEGE_DAYS[site.type] || 1;
  if (!state.playerSiege) {
    if (!canFight(state, site.id)) return { ok: false, msg: '刚脱战，城头的弓手还盯着你' };
    const now = gameHours(state);
    state.playerSiege = {
      siteId: site.id,
      startHour: now,
      readyHour: now + days * 24,
      days: days,
      stage: 'camp',
    };
    stopMoving(state);
    state.player.atSiteId = site.id;
    state.player.resting = null;
    pushLog(state, '你在' + site.name + '城外扎下围营。' + days +
      ' 天内只围不攻：断粮道、扎云梯，等守军先慌。', 'siege');
  }
  return {
    ok: true,
    msg: '围住' + site.name + '，需 ' + days + ' 天',
    days: days,
    leftHours: Math.max(0, state.playerSiege.readyHour - gameHours(state)),
  };
}

/** 围城推进：一次最多等一天，够时辰就挂上“可决战” */
function advancePlayerSiege(state, site, hours) {
  const ps = state.playerSiege;
  if (!ps || !site || ps.siteId !== site.id) {
    return { ok: false, msg: '你还没有围这座城' };
  }
  const total = Math.max(1, Math.round(hours || 24));
  const left = Math.max(0, ps.readyHour - gameHours(state));
  if (left <= 0) {
    ps.stage = ps.stage === 'storming' ? 'storming' : 'ready';
    return { ok: true, msg: '围城已成，可以决战', ready: true, leftHours: 0 };
  }
  const step = Math.min(total, left);
  advanceTime(state, step);
  if (state.gameOver) return { ok: false, msg: '军中已乱，围不下去了' };
  // 让诸侯在这段时间里照常走；剧情事件留到回地图再弹
  update(state, 0, { ignoreEvents: true });
  const leftNow = Math.max(0, ps.readyHour - gameHours(state));
  if (leftNow <= 0) {
    ps.stage = 'ready';
    pushLog(state, site.name + '城头开始挂白旗。围城的壕沟已经推到城门下，可以决战了。', 'siege');
  }
  return {
    ok: true,
    ready: leftNow <= 0,
    leftHours: leftNow,
    msg: leftNow <= 0 ? '围城已成，可以决战'
      : (total >= 24 ? '又围了一日，城中还没开门' : '又围了' + total + '个时辰，城中还没开门'),
  };
}

/** 撤围：把营拔了，退回旁边的野地 */
function cancelPlayerSiege(state) {
  const ps = state.playerSiege;
  if (!ps) return { ok: true, msg: '现在没有围城' };
  const site = siteById(state.world, ps.siteId);
  state.playerSiege = null;
  if (site && state.player.atSiteId === site.id) {
    shoveOutOfSite(state, site);
    state.player.atSiteId = null;
  }
  pushLog(state, '你拔了' + (site ? site.name : '城下') + '的围营，退回野地。', 'siege');
  return { ok: true, msg: '已撤围' };
}

function startSiege(state, site) {
  // 洗劫过的空营不能反复开战，否则 0 守军也能无限刷缴获
  if (!site || (site.type === 'camp' && site.cleared)) return null;
  // 城与关隘必须先围够天数，没围完不给开打
  if (site.type === 'town' || site.type === 'castle') {
    const ps = state.playerSiege;
    if (!ps || ps.siteId !== site.id) return null;
    // 玩家可能在围城期间回大地图行军，时辰走够了也要算围成
    if (ps.stage !== 'ready') {
      if (gameHours(state) < ps.readyHour) return null;
      ps.stage = 'ready';
    }
    ps.stage = 'storming';
  }
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
    puyang_raid: {
      name: '黄巾余部', faction: 'bandit', morale: 60,
      troops: { militia: 35, bandit: 12, spear: 8 },
      context: { kind: 'campaign', campaignId: 'act1b', siteName: '濮阳城外' },
      fire: false,
    },
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
      pushLog(state, '击溃' + ctx.partyName + '：缴获 ' + loot + ' 金钱，声望 +' + renownGain + '。');
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
          pushLog(state, '你生擒了' + lord.name + '，捆在营后。牢里等着家人拿 ' + res.ransom + ' 金钱来赎。');
          summary.duelNote = '生擒 ' + lord.name + ' · 已押进牢里';
        } else if (res.killed) {
          pushLog(state, '阵前斩了' + lord.name + '。这消息传出去，' +
            (FACTIONS[lord.faction] ? FACTIONS[lord.faction].full : '那家') + '的人从此见你只拔刀，不开口。');
          summary.duelNote = '阵前斩了 ' + lord.name + ' · 从此不死不休';
        } else {
          pushLog(state, '你击败了' + lord.name + '！他带残部往野地里跑了。' + (FACTIONS[lord.faction] ? FACTIONS[lord.faction].name : '') + '与你结下死仇。');
          summary.duelNote = lord.name + ' 带残部跑了';
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
    // 关键战役打输了：隔一天再让玩家自己决定要不要再上
    if (battle.context && battle.context.kind === 'campaign') {
      state.flags.campaignCool = gameHours(state) + 24;
      pushLog(state, '这一仗没打下来。退回城里养两天伤，还可以再来。');
    }
    const lostGold = Math.round(p.gold * 0.28);
    const lostFood = Math.round(p.food * 0.28);
    p.gold -= lostGold;
    p.food -= lostFood;
    pushLog(state, '战败，被抢走 ' + lostGold + ' 金钱与 ' + lostFood + ' 粮。');
    heroes.gainHeroExp(state, 3);
    if (army.troopCount(p.troops) <= 0) {
      reviveAfterDefeat(state, 'battle');
    }
  } else if (summary.result === 'retreat') {
    p.morale = Math.max(0, p.morale - 8);
    pushLog(state, '你下令脱离战斗，退到野地里。');
    if (battle.context && battle.context.kind === 'campaign') {
      state.flags.campaignCool = gameHours(state) + 24;
    }
    afterRetreat(state, battle.context);
  }
  if (summary.result !== 'win' && battle.context && battle.context.kind === 'siege' &&
      state.playerSiege && state.playerSiege.siteId === battle.context.siteId) {
    const s = siteById(state.world, battle.context.siteId);
    state.playerSiege = null;
    pushLog(state, '攻城没成，' + (s ? s.name : '城下') + '的围营散了，只能退回野地。', 'siege');
  }

  state.stats.troopsLost += Math.max(0, summary.initialA - summary.remainA);
  state.battle = null;
  return summary;
}

/** 第一座城到手：不管此前有没有投靠别人，都在这里立自己的旗 */
function beginSelfRule(state, site) {
  const p = state.player;
  if (p.country) return false;
  const oldFaction = p.faction;
  p.country = {
    name: '',
    color: '#d9a441',
    foundedDay: state.clock.day,
    oldFaction: oldFaction || null,
  };
  p.faction = 'player';
  p.banner = true;
  syncPlayerFaction(p.country);
  if (oldFaction && oldFaction !== 'player' && FACTIONS[oldFaction]) {
    pushLog(state, '你把' + FACTIONS[oldFaction].full + '的印绶留在案上，从' + site.name +
      '开始自立门户。');
  }
  pushLog(state, '打下' + site.name + '，部下推你竖自己的旗：先定一个字的国号。', 'throne');
  state.events.push({ type: 'founding', siteId: site.id });
  return true;
}

function takeSite(state, site) {
  const p = state.player;
  if (state.playerSiege && state.playerSiege.siteId === site.id) state.playerSiege = null;
  if (site.type === 'camp') {
    site.cleared = true;
    site.looted = true;
    site.lootedDay = state.clock.day;
    site.respawnDay = state.clock.day + CAMP_RESPAWN_DAYS;
    site.garrison = 0;
    p.renown += 45;
    p.gold += 120;
    pushLog(state, '攻破' + site.name + '！贼巢被拔，声望 +45。过 ' + CAMP_RESPAWN_DAYS + ' 天再来，看还有没有人聚起来。');
  } else {
    const oldFaction = site.ownerFaction;
    // 第一座城：先自立，再落旗；国号未定时先用默认旗色，选完国号再统一刷新
    beginSelfRule(state, site);
    site.playerOwned = true;
    site.faction = p.faction || site.faction;
    site.ownerFaction = p.faction || null;
    site.garrison = Math.max(10, Math.round(site.garrisonBase * 0.35));
    site.garrisonBase = site.garrison;
    site.color = p.country && p.country.color ? p.country.color : '#d9a441';
    site.banner = p.country && p.country.name ? p.country.name : '旗';
    p.gold += 150;
    state.stats.sitesTaken += 1;
    if (oldFaction && oldFaction !== 'bandit') {
      changeRelation(state, oldFaction, -60);
    }
    war.onSiteTaken(state, site, oldFaction);
    applyPlayerCountry(state);
    pushLog(state, '你拿下了' + site.name + '。从今天起，这里归你。');
    checkVictory(state);
    advanceCampaign(state);
  }
}

/* ---------------------------------------------------------------- 任务 */

/** 酒馆任务的目标坐标：怪物队伍、贼巢或交粮城 */
function questTargetPos(state, quest) {
  if (!quest || quest.done) return null;
  if (quest.type === 'hunt') {
    const party = (state.parties || []).filter(function (p) { return p.id === quest.targetPartyId; })[0];
    if (!party || army.troopCount(party.troops || {}) <= 0) return null;
    return { x: party.x, y: party.y, name: party.name, kind: 'party', id: party.id };
  }
  const siteId = quest.type === 'scout' ? quest.targetSiteId : quest.siteId;
  const site = siteById(state.world, siteId);
  if (!site) return null;
  return {
    x: site.x,
    y: site.y,
    name: site.name,
    kind: quest.type === 'scout' ? 'camp' : 'site',
    id: site.id,
  };
}

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
  pushLog(state, '交差：' + q.title + '，得 ' + q.reward.gold + ' 金钱、' + q.reward.renown + ' 声望。');
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
  if (p.country && p.country.name) {
    return { ok: false, msg: '你已经立了「' + p.country.name + '」的国号，不能再投别人' };
  }
  if (p.faction === 'player') return { ok: false, msg: '你已经自立，先把国号定下来' };
  if (p.faction) return { ok: false, msg: '你已经效忠' + FACTIONS[p.faction].full };
  if (!site.ownerFaction || site.ownerFaction === 'bandit') return { ok: false, msg: '这里没有可效忠的旗' };
  if (site.playerOwned) return { ok: false, msg: '这是你自己的地盘' };
  const f = site.ownerFaction;
  const req = joinRenownReq(f);
  if (p.renown < req) {
    return { ok: false, msg: '声望不足 ' + req + '，' + site.name + '的守将不见你' };
  }
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
    const recruit = lord && war.recruitChance ? war.recruitChance(state, lord) : null;
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
      recruit: recruit,
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
  const cap = army.foodCap(state.player.troops);
  state.player.gold += gold;
  state.player.food = Math.min(cap, state.player.food + food);
  state.stats.villagesRaided += 1;
  site.garrison = Math.max(0, site.garrison - 6);
  site.priceIndex = Math.min(1.5, (site.priceIndex || 1) * 1.2);
  site.burned = true;
  // 屠村只掉 5 点关系，但村里会记很久
  if (site.ownerFaction) changeRelation(state, site.ownerFaction, -5);
  state.player.renown = Math.max(0, state.player.renown - 4);
  pushLog(state, '你屠了' + site.name + '，得 ' + gold + ' 金钱、' + food + ' 粮。村口有人记住了你的旗。');
  return { ok: true, msg: '抢到 ' + gold + ' 金钱、' + food + ' 粮' };
}

/** 村庄：跟村长买口粮（牛、羊、鸡、谷） */
function buyVillageFood(state, site, itemId) {
  if (!site || site.type !== 'village') return { ok: false, msg: '这里没有村市' };
  let item = null;
  VILLAGE_FOOD.forEach(function (f) { if (f.id === itemId) item = f; });
  if (!item) return { ok: false, msg: '没有这样东西' };
  const stock = (site.foodStock || {})[item.id] || 0;
  if (stock <= 0) return { ok: false, msg: '村里的' + item.name + '已经卖完了，过两天再来' };
  const price = Math.round(item.price * (site.priceIndex || 1) * 0.85);
  if (state.player.gold < price) return { ok: false, msg: '钱不够，要 ' + price + ' 金钱' };
  if (state.player.food + item.food > army.foodCap(state.player.troops)) return { ok: false, msg: '粮车装不下了' };
  state.player.gold -= price;
  state.player.food += item.food;
  site.foodStock[item.id] = stock - 1;
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
  if (state.player.gold < n) return { ok: false, msg: '金钱不够，你只有 ' + state.player.gold };
  const rate = RANK_RATE[lordRank(lord)];
  const gain = Math.max(1, Math.round((n / 100) * rate));
  state.player.gold -= n;
  changeRelation(state, lord.faction, gain);
  const rel = relationOf(state, lord.faction);
  pushLog(state, '你给' + lord.name + '送了 ' + n + ' 金钱，关系 +' + gain + '（现在 ' + rel + '）。');
  return { ok: true, msg: '送 ' + n + ' 金钱，关系 +' + gain + '（现在 ' + rel + '）', gain, rel };
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
  win_puyang: '带上 45 人以上去濮阳。黄巾余部就在城外截粮，到了就开打。',
  troops_60_food: '募到 60 人、粮草备足 80。人不够就往北走，去了乌巢也是送。',
  win_wuchao: '带 90 人以上回官渡。到了就会有一场硬仗。',
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
      if (ch.reward.food) state.player.food += ch.reward.food;
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
    // 卡片是"下一章开场"：让人先看见接下来的故事，而不是回头讲上一章
    const next = CAMPAIGN[c.stage];
    state.events.push({ type: 'chapter', chapterId: next ? next.id : ch.id });
    pushLog(state, '【' + ch.title + '】' + (ch.after || ''));
    advanceCampaign(state);
  }
}

function checkCampaign(state, key) {
  const p = state.player;
  const count = army.troopCount(p.troops);
  if (key === 'reach_chenliu') {
    // 铁骑会一路追到陈留；进了陈留城，序章追兵就撤了
    return p.atSiteId === 'chenliu';
  }
  if (key === 'troops_30') {
    if (count >= 30) return true;
    return false;
  }
  if (key === 'win_wuchao') return !!state.flags['win_act2'];
  if (key === 'win_puyang') return !!state.flags['win_act1b'];
  if (key === 'troops_60_food') return count >= 60 && p.food >= 80;
  if (key === 'take_xiapi') {
    const s = siteById(state.world, 'xiapi');
    return !!(s && s.playerOwned) || !!state.flags.lvbuBeaten || !!state.flags['win_act3'];
  }
  if (key === 'win_chibi') return !!state.flags['win_act4'];
  if (key === 'win_yiling') return !!state.flags['win_act5'];
  if (key === 'win_final') return !!state.flags['win_final'];
  return false;
}

/** 当前这一章，在哪个据点能打出关键一仗 */
function campaignObjective(state, site) {
  if (!site) return null;
  const stage = state.campaign.stage;
  if (stage === 2 && site.id === 'puyang') return { id: 'puyang_raid', name: '黄巾余部', needTroops: 45 };
  if (stage === 4 && site.id === 'guandu') return { id: 'wuchao', name: '乌巢粮营', needTroops: 90 };
  if (stage === 6 && (site.id === 'chibi' || site.id === 'chaisang')) return { id: 'chibi', name: '曹操水寨' };
  if (stage === 7 && site.id === 'yiling') return { id: 'yiling', name: '连营守军' };
  if (stage === 8 && ['xuchang', 'chengdu', 'jianye', 'ye'].indexOf(site.id) >= 0) {
    return { id: 'final', name: '无旗亲军', needTroops: 250 };
  }
  return null;
}

/** 战役触发的特殊战斗：回到地图某处时开打 */
function tryCampaignBattle(state) {
  const p = state.player;
  if (!p.atSiteId) return null;
  const nowH = gameHours(state);
  // 刚被打退的话先喘口气，别在城门口反复送人头
  if (state.flags.campaignCool && nowH < state.flags.campaignCool) return null;
  const site = siteById(state.world, p.atSiteId);
  const obj = campaignObjective(state, site);
  if (!obj) return null;
  if (obj.needTroops && army.troopCount(p.troops) < obj.needTroops) return null;
  state.flags.campaignCool = nowH + 24;
  return startCampaignBattle(state, obj.id);
}

/** 战役好感/后果：乌巢一把火，袁军全线松动 */
function applyCampaignEffect(state, id) {
  if (id === 'act1b') {
    state.flags['win_act1b'] = true;
    pushLog(state, '濮阳城外的黄巾散了，粮车一辆不少地推进了城。');
  } else if (id === 'act2') {
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

/* ---------------------------------------------------------------- 封领主 */

/** 把队里的英雄封成领主：他自己带一队人马出去单干 */
function promoteHero(state, heroId) {
  const p = state.player;
  const hero = (p.heroes || []).filter(function (h) { return h.id === heroId; })[0];
  if (!hero) return { ok: false, msg: '队伍里没有这个人' };
  const owned = state.world.sites.filter(function (s) { return s.playerOwned; });
  if (!owned.length) return { ok: false, msg: '名下得先有一座城，才有地方让他驻' };
  const home = owned[0];
  const lv = hero.level || 1;
  const heroDef = heroes.heroById(hero.id) || {};
  const heroName = heroDef.name || hero.name || hero.id;
  const troops = { militia: 18 + lv * 4 };
  if (lv >= 4) troops.spear = Math.round(lv * 2.5);
  if (lv >= 7) troops.cav = Math.round(lv * 1.5);
  const id = 'hero_' + hero.id;
  if (state.lords.some(function (l) { return l.id === id; })) {
    return { ok: false, msg: '他已经在外头带兵了' };
  }
  const lord = {
    id: id,
    name: heroName,
    title: '你的家臣',
    faction: p.faction && FACTIONS[p.faction] ? p.faction : 'player',
    home: home.id,
    x: home.x,
    y: home.y,
    troops: deepCopy(troops),
    morale: 80,
    sight: 6,
    chasing: false,
    alive: true,
    respawnDay: 0,
    defTroops: deepCopy(troops),
    wander: null,
    dead: false,
    retired: false,
    prisoner: null,
    hidden: null,
    resting: false,
    hero: true,
  };
  state.lords.push(lord);
  p.heroes = p.heroes.filter(function (h) { return h.id !== heroId; });
  p.renown += 40;
  pushLog(state, '你把' + heroName + '封为领主，拨了' + (18 + lv * 4) + ' 名乡勇。他跪下磕了个头，第二天就带着人出城了。');
  return {
    ok: true,
    msg: heroName + '封为领主，驻' + home.name + '（声望 +40）',
    lordId: id,
  };
}

/* ---------------------------------------------------------------- 牢里的人 */

/** 招降牢里的人：有主替主上收，自立就收成自己的领主 */
function recruitPrisoner(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) {
    return x.lordId === lordId && x.by === 'player';
  })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  return war.recruitLord(state, lordId);
}

/** 杀了牢里的人：与那家从此不死不休 */
function executePrisoner(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) {
    return x.lordId === lordId && x.by === 'player';
  })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  const fac = lord.faction;
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  lord.prisoner = null;
  war.killLord(state, lord);
  pushLog(state, '你把' + lord.name + '推出营门斩了。' +
    (FACTIONS[fac] ? FACTIONS[fac].full : '那家') + '与你，不死不休。');
  return {
    ok: true,
    msg: lord.name + '已斩。' + (FACTIONS[fac] ? FACTIONS[fac].full : '那家') + '跟你，再没有议和的一天。',
    killed: true,
  };
}

/* ---------------------------------------------------------------- 灭国 *//** 史实里的改换门庭：被灭的那家散了，这些人该跟谁走 */
const DEFECT_TO = {
  gaoshun: 'wei', houcheng: 'wei', songxian: 'wei', weixu: 'wei',
  wenpin: 'wei', zhangyun: 'wei', wangwei: 'wei',
  wuyi: 'shu', leitong: 'shu', lengbao: 'shu', liugui: 'shu',
  guotu: 'wei', lvkuang: 'wei', lvxiang: 'wei',
  pangde: 'wei', maxiu: 'shu', matie: 'shu', chengyin: 'wei',
  huangfusong: 'wei', zhujun: 'wei', luzhi: 'wei',
};

/** 宁死不降的：解甲归乡里，从此不在地图上 */
const LOYAL_GONE = {
  chengong: true, zhangren: true, dongcheng: true, guanyu: true,
};

/** 这个势力还算不算活着：只要还有一座城（或一支野外的队伍）就活着 */
function factionAlive(state, id) {
  if (!FACTIONS[id]) return false;
  const sites = state.world.sites.filter(function (s) { return s.ownerFaction === id && s.type !== 'camp'; });
  if (sites.length > 0) return true;
  const parties = state.parties.filter(function (p) { return p.faction === id; });
  return parties.length > 0;
}

function factionLord(state, id) {
  const name = (FACTIONS[id] || {}).lord;
  const byName = state.lords.filter(function (l) { return l.faction === id && l.name === name; })[0];
  if (byName) return byName;
  return state.lords.filter(function (l) { return l.faction === id; })[0] || null;
}

function takeSomeTroops(base, n) {
  const out = {};
  let put = 0;
  Object.keys(base || {}).forEach(function (id) {
    if (put >= n) return;
    const take = Math.min(base[id], n - put);
    if (take > 0) { out[id] = take; put += take; }
  });
  return out;
}

/** 某势力离这里最近的城，拿不到城就返回 9999 */
function nearestFactionCity(state, id, from) {
  let best = 9999;
  state.world.sites.forEach(function (s) {
    if (s.ownerFaction !== id || s.type === 'camp') return;
    const d = Math.abs(s.x - from.x) + Math.abs(s.y - from.y);
    if (d < best) best = d;
  });
  return best;
}

/** 势力亡了：残部按眼下所处位置就近择主；玩家自立且有城，也算一家 */
function pickFactionFor(state, lord, from) {
  const here = (lord && (lord.x !== undefined ? { x: lord.x, y: lord.y } : null)) ||
    (lord && siteById(state.world, lord.home)) || { x: 0, y: 0 };
  const list = Object.keys(FACTIONS).filter(function (id) {
    if (id === 'bandit' || id === from || !FACTIONS[id]) return false;
    if ((state.factionState[id] || {}).dead) return false;
    if (id === 'player') {
      return state.player.faction === 'player' &&
        state.world.sites.some(function (s) { return s.playerOwned && s.type !== 'camp'; });
    }
    return true;
  });
  if (!list.length) return null;
  const withCity = list.filter(function (id) {
    return state.world.sites.some(function (s) { return s.ownerFaction === id && s.type !== 'camp'; });
  });
  const pool = withCity.length ? withCity : list;
  const scored = pool.map(function (id) {
    return { id: id, d: nearestFactionCity(state, id, here) };
  }).sort(function (a, b) { return a.d - b.d; });

  // 先看十格内：真有近邻就只在这些近邻里挑，别让隔了半张地图的曹刘来收人。
  const near = scored.filter(function (x) { return x.d <= 10; });
  const top = (near.length ? near : scored).slice(0, 3);
  return top[state.rng.int(0, top.length - 1)].id;
}

function moveLordToFaction(state, lord, target) {
  // 投过去也要落在离他最近的那座城，不要一脚跨到地图另一头
  const cities = state.world.sites.filter(function (s) {
    return s.ownerFaction === target && s.type !== 'camp';
  }).sort(function (a, b) {
    const da = Math.abs(a.x - lord.x) + Math.abs(a.y - lord.y);
    const db = Math.abs(b.x - lord.x) + Math.abs(b.y - lord.y);
    return da - db;
  });
  const city = cities[0];
  lord.faction = target;
  if (city) {
    lord.home = city.id;
    const spot = findFreeSpotNear(state, city.x, city.y, 2) || city;
    lord.x = spot.x;
    lord.y = spot.y;
  }
  lord.alive = true;
  lord.chasing = false;
  lord.resting = false;
  lord.hidden = null;
  lord.troops = takeSomeTroops(lord.defTroops, Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.4)));
  lord.respawnDay = 0;
}

/** 一个势力连城带人都没了，满七天：亡国 */
function fallFaction(state, id) {
  const fs = state.factionState[id] || (state.factionState[id] = {});
  fs.dead = true;
  fs.deadDay = state.clock.day;
  const rng = state.rng;
  const lines = [];
  const ruler = factionLord(state, id);

  if (ruler && ruler.alive) {
    const hidden = rng.next() < 0.55;
    ruler.alive = false;
    ruler.chasing = false;
    ruler.troops = {};
    ruler.prisoner = null;
    if (hidden) {
      const villages = state.world.sites.filter(function (s) { return s.type === 'village'; });
      const v = villages.length ? villages[rng.int(0, villages.length - 1)] : null;
      ruler.hidden = { siteId: v ? v.id : null, since: state.clock.day, faction: id };
      fs.fate = 'hidden';
      fs.hiddenLordId = ruler.id;
      fs.hiddenSiteId = v ? v.id : null;
      lines.push('有人说' + ruler.name + '没死，一个人往' + (v ? v.name : '南边') + '去了。');
    } else {
      ruler.dead = true;
      ruler.hidden = null;
      fs.fate = 'killed';
      fs.rulerDead = ruler.id;
      lines.push('乱军里传出消息：' + ruler.name + '死了。尸首没找到，头也没挂出来。');
    }
  } else if (ruler) {
    fs.fate = ruler.dead ? 'killed' : 'gone';
    lines.push('“' + ruler.name + '”这个名字，从今天的榜文上划掉了。');
  }

  // 剩下的领主：史实里该投谁就投谁，宁死不降的散归乡里
  const others = state.lords.filter(function (l) {
    return l.faction === id && l.alive && l !== ruler && !l.factionStateFixed;
  });
  const gone = [];
  others.forEach(function (l) {
    if (LOYAL_GONE[l.id]) {
      l.alive = false;
      l.retired = true;
      l.troops = {};
      gone.push(l.name);
      return;
    }
    const target = pickFactionFor(state, l, id);
    if (!target) {
      l.alive = false;
      l.retired = true;
      l.troops = {};
      return;
    }
    moveLordToFaction(state, l, target);
    lines.push(l.name + '带着残部投了' + (FACTIONS[target].full || target) + '。');
  });
  if (gone.length) {
    lines.push(gone.slice(0, 4).join('、') + '不肯降，解甲归乡里去了。');
  }

  // 这个势力的旗从此从地图上撤掉（跟你的旧关系留着：村里那个隐者还认这个）
  state.world.sites.forEach(function (s) {
    if (s.ownerFaction === id) s.ownerFaction = null;
  });
  pushLog(state, '【' + (FACTIONS[id].full || id) + '】亡了。');
  state.events.push({
    type: 'faction-fall',
    factionId: id,
    title: (FACTIONS[id].full || id) + ' 亡了',
    fate: fs.fate || 'killed',
    lines: lines,
  });
}

/** 每日：灭国倒计时（连着七天没城没人，才算亡） */
function factionTick(state) {
  if (!state.factionState) state.factionState = {};
  Object.keys(FACTIONS).forEach(function (id) {
    if (id === 'bandit' || id === 'player') return;
    const fs = state.factionState[id] || (state.factionState[id] = {});
    if (fs.dead) return;
    if (factionAlive(state, id)) {
      if (fs.doomDays) {
        pushLog(state, (FACTIONS[id].full || id) + '又重新站住了。');
      }
      fs.doomDays = 0;
      fs.doomDay = 0;
      return;
    }
    fs.doomDays = (fs.doomDays || 0) + 1;
    if (fs.doomDays === 1) {
      fs.doomDay = state.clock.day;
      pushLog(state, (FACTIONS[id].full || id) + '连一座城都没有了，旗下的人也不见踪影。七天之内还是这样，就算亡了。');
    }
    if (fs.doomDays >= 7) fallFaction(state, id);
  });
}

/** 酒馆打听：花钱问出隐居的旧主在哪个村 */
function tavernRumor(state) {
  if (!state.knownHidden) state.knownHidden = {};
  const cost = 40;
  const hidden = state.lords.filter(function (l) {
    return l.hidden && l.hidden.siteId && !state.knownHidden[l.id];
  });
  if (!hidden.length) return { ok: false, msg: '酒馆里的人摇头：没听说谁还在世上。' };
  if (state.player.gold < cost) return { ok: false, msg: '打听要 ' + cost + ' 金钱，你身上不够。' };
  state.player.gold -= cost;
  const target = hidden[state.rng.int(0, hidden.length - 1)];
  state.knownHidden[target.id] = target.hidden.siteId;
  const site = siteById(state.world, target.hidden.siteId);
  return {
    ok: true,
    msg: '酒馆里的人压低声音：' + target.name + '就在' + (site ? site.name : '某处小村') + '。',
    lordId: target.id,
    siteId: target.hidden.siteId,
  };
}

/** 村里隐居的人：只在你打听过、且这家跟你关系够的时候露面 */
function hiddenLordsAt(state, siteId) {
  return state.lords.filter(function (l) {
    return l.hidden && l.hidden.siteId === siteId;
  });
}

function hiddenLordVisible(state, lord) {
  if (!lord || !lord.hidden) return false;
  if (!state.knownHidden || state.knownHidden[lord.id] !== lord.hidden.siteId) return false;
  const rel = state.relations[lord.hidden.faction] || 0;
  return rel >= 60;
}

/** 请隐居的旧主出山：跟着你干 */
function recruitHiddenLord(state, siteId) {
  const lord = hiddenLordsAt(state, siteId)[0];
  if (!lord) return { ok: false, msg: '这里没有这样的人。' };
  if (!hiddenLordVisible(state, lord)) return { ok: false, msg: '村里人不肯多说这个人的事。' };
  const rel = state.relations[lord.hidden.faction] || 0;
  if (state.rng.next() > 0.35 + rel / 200) {
    return { ok: false, msg: lord.name + '摇了摇头：' + (FACTIONS[lord.hidden.faction] ? FACTIONS[lord.hidden.faction].full : '故国') + '的旗，他扛不动第二面了。' };
  }
  const target = state.player.faction || 'player';
  lord.hidden = null;
  lord.alive = true;
  lord.faction = target;
  lord.dead = false;
  lord.retired = false;
  const home = state.world.sites.filter(function (s) { return s.ownerFaction === target && s.type !== 'camp'; })[0]
    || state.world.sites.filter(function (s) { return s.playerOwned; })[0]
    || siteById(state.world, lord.home);
  if (home) {
    lord.home = home.id;
    lord.x = home.x;
    lord.y = home.y;
  }
  lord.troops = takeSomeTroops(lord.defTroops, Math.max(8, Math.round(army.troopCount(lord.defTroops) * 0.5)));
  state.player.renown += 60;
  pushLog(state, '你在' + (siteById(state.world, siteId) ? siteById(state.world, siteId).name : '村里') + '请出了' + lord.name + '。他只带了半副甲。');
  return { ok: true, msg: lord.name + '跟你走了（声望 +60）', lordId: lord.id };
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
    factionState: state.factionState || {},
    knownHidden: state.knownHidden || {},
    noPeace: state.noPeace || {},
    heroSites: state.heroSites || null,
    warCampaigns: state.warCampaigns || {},
    siegeCooldown: state.siegeCooldown || {},
    playerSiege: state.playerSiege || null,
    foodWarning: state.foodWarning || null,
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
  if ((data.version || 0) < SAVE_VERSION) return null; // 旧地图/旧领主表不兼容

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
    factionState: data.factionState || {},
    knownHidden: data.knownHidden || {},
    noPeace: data.noPeace || {},
    heroSites: data.heroSites || null,
    warCampaigns: data.warCampaigns || {},
    siegeCooldown: data.siegeCooldown || {},
    playerSiege: data.playerSiege || null,
    foodWarning: data.foodWarning || null,
    battle: null,
  };
  state.player.country = state.player.country || null;
  state.player.foodWarned = !!state.player.foodWarned;
  state.player.foodWarnDay = state.player.foodWarnDay || 0;
  state.player.route = [];
  state.player.stepFrom = null;
  state.player.stepTo = null;
  state.player.stepProgress = 0;

  // 同版本老档补上村市口粮与领主独立兵源池
  state.world.sites.forEach(function (site) {
    if (!site.foodStock) {
      site.foodStock = {};
      if (site.type === 'village') {
        VILLAGE_FOOD.forEach(function (f) { site.foodStock[f.id] = Math.max(1, f.stockMax || 3); });
      }
    }
    if (!site.lordRecruits && site.type !== 'camp') {
      site.lordRecruits = {};
      (site.recruitList || []).forEach(function (id) { site.lordRecruits[id] = 1; });
    }
    // 旧档的村庄可能还是每次刷新 7 人 / 口粮没有上限，进档时统一压到新规则
    if (site.type === 'village') {
      site.recruitCap = 5;
      site.recruits = site.recruits || {};
      Object.keys(site.recruits).forEach(function (id) {
        site.recruits[id] = Math.min(5, site.recruits[id] || 0);
      });
      site.foodStock = site.foodStock || {};
      VILLAGE_FOOD.forEach(function (f) {
        const cap = f.stockMax || 3;
        const cur = site.foodStock[f.id];
        site.foodStock[f.id] = cur === undefined ? cap : Math.min(cap, cur);
      });
    }
  });

  // 老存档里没有后来补的领主：按 LORDS 定义补齐，已死过的保持死过
  const { LORDS } = require('../data/china.js');
  // 旧档里的领主可能缺后来加的字段
  state.lords.forEach(function (l) {
    if (l.dead === undefined) l.dead = false;
    if (l.retired === undefined) l.retired = false;
    if (l.hidden === undefined) l.hidden = null;
    if (l.resting === undefined) l.resting = false;
    if (l.prisoner === undefined) l.prisoner = null;
  });
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
  syncPlayerFaction(state.player.country);
  if (state.player.country && state.player.country.name) applyPlayerCountry(state);
  return state;
}

module.exports = {
  HOUR_SECONDS,
  SAVE_VERSION,
  createGame,
  update,
  unitAnimPos,
  goTo,
  currentPos,
  stopMoving,
  camp,
  campWait,
  startRest,
  stopRest,
  isResting,
  isSafeResting,
  advanceTime,
  dailyTick,
  campRespawnTick,
  CAMP_RESPAWN_DAYS,
  lordRecruitTick,
  recruitLordFromSite,
  joinRenownReq,
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
  beginPlayerSiege,
  advancePlayerSiege,
  cancelPlayerSiege,
  PLAYER_SIEGE_DAYS,
  startCampaignBattle,
  resolveBattle,
  takeSite,
  offerQuest,
  questTargetPos,
  foundCountry,
  applyPlayerCountry,
  cleanCountryName,
  flagColorName,
  nextFoodNeed,
  refreshFoodWarning,
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
  campaignObjective,
  advanceCampaign,
  tryCampaignBattle,
  applyCampaignEffect,
  factionTick,
  factionAlive,
  factionLord,
  fallFaction,
  pickFactionFor,
  moveLordToFaction,
  tavernRumor,
  hiddenLordsAt,
  hiddenLordVisible,
  recruitHiddenLord,
  giveWayCost,
  giveWay,
  breakTail,
  recruitPrisoner,
  executePrisoner,
  promoteHero,
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
