/**
 * 游戏状态层：行军、势力关系、领主 AI、战斗结算、战役链、天机简、存档
 * 渲染层只读 state，不写。
 */

const { RNG } = require('../rng.js');
const {
  createWorld,
  siteFromRow,
  layRoads,
  clearRoads,
  ensureWorldFeatures,
  findPath,
  siteById,
  siteAt,
  tileHours,
  addHours,
  gridDistance,
  isPassable,
  edgeTownDistance,
  edgeTownBlocked,
  regionAt,
  inBanditExclusion,
} = require('./world.js');
const army = require('./army.js');
const economy = require('./economy.js');
const trade = require('./trade.js');
const heroes = require('./heroes.js');
const war = require('./war.js');
const story = require('./story.js');
const border = require('./border.js');
const { Battle } = require('./battle.js');
const {
  FACTIONS, FACTION_RULERS, SUCCESSION, RENOWN_TIERS, CAMPAIGN, ENDINGS, EQUIPMENT,
  SITE_ROWS, ROADS, HISTORY_MARKS, REGIONS, RECRUIT_SETS,
  CAPITAL_IDS, STRATEGIC_SITES, FREE_CITY_IDS, FACTION_ROSTER_MUL,
} = require('../data/china.js');
const { TROOPS } = require('../data/troops.js');
const {
  FACTION_TROOPS,
  FACTION_RECRUIT_SETS,
  FACTION_SLOTS,
  factionTroopIds,
  factionT5Id,
  factionLabel,
  t5UnlockedForPlayer,
  troopAccess,
  RECRUIT_SOURCE_COOLDOWN_DAYS,
  stockCapFor,
  effectiveSiteFaction,
  syncSiteRecruitList,
  convertRosterToFaction,
} = require('../data/troops.js');
const {
  BANDIT_TIERS, BANDIT_NAMES, BANDIT_UNLOCK_STAGE, LORD_TALK, LORD_EXTRA_BIO, FACTION_TALK, VILLAGE_FOOD,
} = require('../data/extra.js');
const { LORD_BIOS } = require('../data/bios.js');
const { LORD_POWER_BY_ID, MARSHAL_BY_ID, DEFAULT_MONARCH_RECRUIT_MUL, roleInfoFor, commandCapFor } = require('../data/lord-rank.js');

const HOUR_SECONDS = 0.26; // 1 游戏小时 = 0.26 真实秒
const NPC_STEP_HOURS = 3;
/** 马超固定归蜀：天下动起来后第 12 天，只要人还在凉州，就带本部南下投刘备。 */
const MA_CHAO_TO_SHU_DAY = 12;
/** 领主基础行军：6 时辰一格；领主不再享受任何额外提速。 */
const LORD_STEP_HOURS = 6;
// 同一格连续两个行军步（12 时辰）还走不动，就判定为卡点，换一个可达目的地。
const LORD_STUCK_HOURS = 12;
/** 逃遁只比基础速度多 20%：6 / 1.2 = 5 时辰一格。 */
const LORD_FLEE_STEP_HOURS = 5;
/** 进城同样按基础 6 时辰一格，逃遁也不能在城下提速。 */
const LORD_ENTER_CITY_HOURS = 6;
const NPC_SLOT_COUNT = 3; // NPC 按 3 个时辰槽错开走，避免整点所有队伍一起重算
const LORD_PURSUIT_RATIO = 1.65;
const LORD_PURSUIT_GAP = 10;
/** 国战领主主动寻敌：战线上的敌军不必等走到脸前才看见。 */
const LORD_FOE_SIGHT = 10;
/** 势均力敌也要敢接战；只在明显吃亏时才把目标让给逃遁判断。 */
const LORD_FOE_ENGAGE_RATIO = 0.9;
const LORD_FOE_ENGAGE_GAP = 0;
const LORD_BANDIT_HUNT_RATIO = 1.25;
const LORD_BANDIT_HUNT_GAP = 4;
/** 领主只在身边三格内主动清匪；更远的匪团不追，避免全图领主排着队追一支匪。 */
const LORD_BANDIT_HUNT_RANGE = 3;
/** 兵力低于满编三分之二就认为需要回城；募到三分之二以上才允许再出城。 */
const LORD_RECOVERY_RATIO = 2 / 3;
/** 领主在十五格内优先找恢复最快的城，而不是机械地回最近的本城。 */
const LORD_RECOVERY_SEARCH_RANGE = 15;
/** 行军/巡逻途中路过据点只按两成速度补兵；驻城或驻在村口才算完整恢复。 */
const LORD_PATROL_RECRUIT_RATIO = 0.2;
/** 匪团与领主交战至少撑满六个时辰，不能被一刀秒掉。 */
const BANDIT_MIN_BATTLE_HOURS = 6;
const LORD_FLEE_OWN_MAX = 30;
const LORD_RESPAWN_DAYS = 12;
/** 山寨被清空后的冷却：几天后重新聚人，又可再打一次 */
const CAMP_RESPAWN_DAYS = 3;
const SAVE_VERSION = 5; // 天下放大到 128x154，旧档地图对不上，直接换新

/** 全图常驻匪团目标数量（玩家附近看得见，远处也算）——再次翻倍 */
const BANDIT_TARGET = 48;
const BANDIT_MAX = 60;
const BANDIT_REFILL_PER_DAY = 12;
const BANDIT_START_COUNT = 32;
/** 匪团只在州内活动，不贴地图边缘，也不跑到离城太远的荒山。 */
const BANDIT_EDGE_MARGIN = 10;
const BANDIT_CITY_RANGE = 22;
/** 匪团轻装但脚程不比领主快：普通领主 6 时辰一格，匪团 6.5 时辰一格。
 *  这样领主追杀时能逐步缩短距离，追上就进入交战，不会永远吊在后面。 */
const BANDIT_STEP_HOURS = 6.5;
const BANDIT_FLEE_RATIO = 1.6;
const BANDIT_FLEE_GAP = 10;
const BANDIT_RESP_DAYS = 3;
const BANDIT_ROAM_MIN = 7;
const BANDIT_ROAM_MAX = 26;

/** 三家与袁绍算大国，投靠要声望 200；其余割据势力算小国，100 即可 */
const MAJOR_FACTIONS = { wei: true, shu: true, wu: true, yuan: true, yuanshu: true };

function joinRenownReq(factionId) {
  return MAJOR_FACTIONS[factionId] ? 200 : 100;
}

/* ---------------------------------------------------------------- 自立国号 */

// 旗色的中文名，和立国页十二色一一对应；扎营等界面用它，不直接露十六进制
const FLAG_COLOR_NAMES = {
  '#d9a441': '鎏金', '#b4463c': '赤', '#3f6fa8': '靛', '#4f8f5a': '苍',
  '#8c6fae': '紫', '#b06a3c': '赭', '#6a8f8a': '青', '#8f8f86': '灰',
  '#c95a7a': '桃', '#5a7fa0': '蓝', '#7a6a4a': '褐', '#2f6f6a': '墨青',
  '#2e8b8b': '碧青', '#b5894f': '土黄',
};

function flagColorName(hex) {
  return FLAG_COLOR_NAMES[String(hex || '').toLowerCase()] || '';
}

/** 新开一局/读档前，把被继任表改过的国名与君主复位，避免上一个存档串味 */
function resetFactionRulers() {
  Object.keys(FACTION_RULERS).forEach(function (id) {
    if (!FACTIONS[id]) return;
    FACTIONS[id].lord = FACTION_RULERS[id].lord;
    FACTIONS[id].full = FACTION_RULERS[id].full;
    if (FACTION_RULERS[id].banner) FACTIONS[id].banner = FACTION_RULERS[id].banner;
  });
}

/** 读档后按存档里的继任者恢复国名；旧档没有这个字段就维持开局名 */
function reconcileFactionRulers(state) {
  if (!state || !state.factionState) return;
  Object.keys(FACTIONS).forEach(function (id) {
    const fs = state.factionState[id];
    if (!fs || !fs.rulerName) return;
    FACTIONS[id].lord = fs.rulerName;
    FACTIONS[id].full = fs.rulerName;
    if (fs.rulerName !== (FACTION_RULERS[id] || {}).lord) {
      FACTIONS[id].banner = fs.rulerName.charAt(0);
    }
  });
  if (Array.isArray(state.lords)) applyLordRoles(state);
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

/** 按“谁在管这块地”重铺兵源：玩家城看玩家所属/本地文化，NPC 城看当前旗。 */
function refreshSiteRosters(state, playerOnly, force) {
  if (!state || !state.world) return;
  state.world.sites.forEach(function (site) {
    if (playerOnly && !site.playerOwned) return;
    const f = effectiveSiteFaction(state, site);
    // 同一面旗下不重复重建，避免每日刷新把玩家/测试刚改过的兵源牌冲掉。
    // 灭国解锁 T5 这类“同旗但要加新兵源”的场景，调用方显式传 force。
    if (!force && site.recruitFaction === (f || null) &&
        Array.isArray(site.recruitList) && site.recruitList.length) return;
    syncSiteRecruitList(site, f, state);
  });
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
    syncSiteRecruitList(site, effectiveSiteFaction(state, site), state);
  });
  // 玩家封出去的家臣，不论当年挂的是谁的旗，自立后都改挂你的国号
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.title !== '你的家臣') return;
    lord.faction = 'player';
    // 从主角队伍里出去的家臣，永远不列入叛军名册。
    lord.exPlayer = true;
  });
}

/** 自立后兵源状态：当前选择、冷却剩余天数；未选时显示本地兵源。 */
function recruitSourceInfo(state) {
  const p = state && state.player;
  const enabled = !!(p && p.faction === 'player' && p.country);
  const current = enabled && p.recruitFaction && FACTION_TROOPS[p.recruitFaction]
    ? p.recruitFaction
    : null;
  const lastDay = Number(p && p.recruitFactionDay) || 0;
  const elapsed = state && state.clock ? state.clock.day - lastDay : 0;
  const remain = current && lastDay > 0
    ? Math.max(0, RECRUIT_SOURCE_COOLDOWN_DAYS - Math.max(0, elapsed))
    : 0;
  return {
    enabled,
    current,
    lastDay,
    remain,
    canChange: !current || remain <= 0,
  };
}

/** 自立后换兵源国：全局生效，所有自己的城一起换；换一次锁 30 天。 */
function setPlayerRecruitSource(state, faction) {
  const p = state && state.player;
  if (!p) return { ok: false, msg: '还没有自己的队伍' };
  if (p.faction !== 'player' || !p.country) {
    return { ok: false, msg: '自立后才能自选兵源国' };
  }
  if (!FACTION_TROOPS[faction]) return { ok: false, msg: '没有这个国家的兵源' };
  if (p.recruitFaction === faction) {
    return { ok: false, msg: '当前已经是' + factionLabel(faction) + '兵源' };
  }
  const info = recruitSourceInfo(state);
  if (info.remain > 0) {
    return {
      ok: false,
      code: 'cooldown',
      remain: info.remain,
      msg: '刚换过兵源，还需 ' + info.remain + ' 天才能再换',
    };
  }
  p.recruitFaction = faction;
  p.recruitFactionDay = state.clock.day;
  // 所有玩家城一起换牌；旧库存留着不删，切回来时还能接上。
  refreshSiteRosters(state, true, true);
  pushLog(state, '你把招兵旗号换成' + factionLabel(faction) +
    '，各城兵源随之更换；' + RECRUIT_SOURCE_COOLDOWN_DAYS + ' 天内不能再换。', 'war');
  return {
    ok: true,
    faction,
    msg: '兵源已换成' + factionLabel(faction) + '，' + RECRUIT_SOURCE_COOLDOWN_DAYS + ' 天内不能更换',
  };
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
    // 先挤掉最旧的琐事；不要刚写进来的新事（哪怕它不重要）倒被自己挤掉。
    let cut = -1;
    for (let i = 0; i < state.log.length - 1; i += 1) {
      if (!state.log[i].important) { cut = i; break; }
    }
    state.log.splice(cut >= 0 ? cut : 0, 1);
  }
}

/* ---------------------------------------------------------------- 初始化 */

function createGame(opts) {
  story.resetCombat();
  resetFactionRulers();
  const seed = (opts && opts.seed) || (Date.now() % 2147483647);
  const rng = new RNG(seed);
  const world = createWorld(seed);
  // 两个游戏背景：乱世三国是旧版群雄混战，三国演义保留史实开局人事，
  // 但不再强制推进主线阶段；是否启用剧情状态机由显式 storyMode 决定。
  const background = (opts && opts.background) ||
    ((opts && opts.storyMode) ? 'romance' : 'chaos');
  const storyMode = (opts && typeof opts.storyMode === 'boolean')
    ? opts.storyMode
    : background === 'romance';
  const historicalRoster = background === 'romance';
  // 三国演义改成史实沙盘后不再跑十二章主线；乱世三国仍保留旧战役链。
  const campaignDisabled = historicalRoster && !storyMode;
  // 史实沙盘：玩家没有主线章节，但天下仍按史实阶段递战书。
  const historicalSandbox = historicalRoster && !storyMode;

  world.sites.forEach(function (site) {
    let h = 0;
    for (let i = 0; i < site.id.length; i++) h = (h * 31 + site.id.charCodeAt(i)) % 9973;
    site.recruits = {};
    (site.recruitList || []).forEach(function (id) {
      site.recruits[id] = rng.int(1, stockCapFor(site, id));
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
      const lcap = economy.LORD_RECRUIT_CAP[site.type] || 0;
      (site.recruitList || []).forEach(function (id, i) {
        const cap = stockCapFor(site, id);
        site.lordRecruits[id] = Math.min(cap, (h + i * 7) % (lcap + 1));
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
    // n59：亲手灭掉的魏蜀吴，T5 会记在这里；加入该国时则直接看 faction。
    t5Unlocked: {},
    // 自立后的国号与旗色：打下第一座城才会立，固定一字
    country: null,
    // 自立后自选的兵源国；换一次后 30 天内不能换。
    recruitFaction: null,
    recruitFactionDay: 0,
    banner: false,
    foodWarnDay: 0,
    foodWarned: false,
    troops: { militia: 9 },
    equip: { blade: 0, armor: 0, horse: 0 },
    shi: 1,
    shiUsed: 0,
    adShiDay: 0,
    adShiCount: 0,
    adRewardDay: '',
    adRewardUsed: { gold: 0, food: 0, shi: 0 },
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
    background,
    historicalRoster,
    campaignDisabled,
    historicalSandbox,
    storyMode,
    story: null,
    clock: { day: 1, hour: 5 },
    world,
    player,
    relations,
    wars,
    lords: [],
    parties: [],
    banditRespawning: [],
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
    npcTick: 0,
    rng,
    questSeq: 1,
    partySeq: 1,
    fieldBattleSeq: 1,
    battle: null,
    playerSiege: null,
    foodWarning: null,
    postBattleLord: null,
    killRecords: {},
    strategistUsed: {},
    noPeaceForever: {},
    peaceOfferCooldown: {},
    peaceOfferPending: null,
    playerWarSince: {},
    fiefTaxDay: 0,
    arc: null,
    // 开局所有诸侯先按兵不动；玩家在陈留歇满一天，天下才开始互相宣战。
    diplomacyStarted: false,
    openingWarsDeclared: false,
    chenliuArrivalH: null,
    lastDiplomacyDay: 0,
    settings: {
      diplomacyAlerts: true,
      questTrackCollapsed: false,
    },
  };

  state.storyHooks = { stageGuandu: stageGuandu, stageChibi: stageChibi, fallFaction: fallFaction };
  syncPlayerFaction(null);
  spawnLords(state);
  autoAssignFiefs(state);
  heroes.resolveHeroSites(state);
  spawnBanditParties(state, BANDIT_START_COUNT);
  // 史实沙盘没有主线章节，追兵也就不该跟来：开局直接往东走。
  if (!historicalSandbox) spawnChaseParty(state, spawn);
  state.parties.forEach(function (u, i) { u.npcSlot = i % NPC_SLOT_COUNT; });
  state.lords.forEach(function (u, i) { u.npcSlot = i % NPC_SLOT_COUNT; });
  war.init(state);
  war.bindLogger(pushLog);
  war.bindCaptureHook(story.recordCapture);
  story.resume(state, pushLog);
  war.bindPassable(isPassable);
  war.bindFleeGuard(lordMayFlee);
  war.bindMovement(stepUnitTo, unitOccupies, siteAt);
  warmPatrolFields(state);

  if (historicalSandbox) {
    pushLog(state, '洛阳城破了。你只带出九个人，往东走。');
    pushLog(state, '这一局没有写好的下一章；到陈留落脚，第三天起天下自己往前演。');
  } else {
    pushLog(state, '洛阳城破了。你只带出九个人，往东走，身后是西凉步卒。');
    if (state.campaignDisabled) {
      pushLog(state, '这一局没有写好的下一章；到陈留落脚，天下会自己往前演。');
    } else {
      pushLog(state, '别回头。跑到陈留，还能剩几个跟你。');
    }
  }
  if (!state.campaignDisabled) {
    state.events.push({ type: 'chapter', chapterId: require('../data/china.js').CAMPAIGN[0].id });
  }
  // 剧情模式：各国按历史阶段递战书；普通模式保持原来的随机天下。
  // 史实沙盘不再启动剧情状态机，只保留上面的史实人事。
  story.bindLogger(pushLog);
  war.bindCaptureHook(story.recordCapture);
  story.init(state, pushLog);
  return state;
}

/** 供 findFreeSpotNear 复用的临时外壳 */
function state0(world) {
  return { world, player: { x: -1, y: -1 }, rng: new RNG(1) };
}

/** 这一格是不是已经被另一支 NPC 队伍占着（进城的领主不画在地图上，不算） */
function unitOccupies(state, unit, x, y) {
  if (!state) return false;
  const parties = state.parties || [];
  for (let i = 0; i < parties.length; i++) {
    const q = parties[i];
    if (q !== unit && q.x === x && q.y === y) return true;
  }
  const lords = state.lords || [];
  for (let i = 0; i < lords.length; i++) {
    const l = lords[i];
    if (l === unit || !l.alive || l.inCity || l.prisoner) continue;
    if (l.x === x && l.y === y) return true;
  }
  return false;
}

function findFreeSpotNear(state, cx, cy, radius, unit) {
  const rng = state.rng || new RNG(1);
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = cx + rng.int(-radius, radius);
    const y = cy + rng.int(-radius, radius);
    if (!isPassable(state.world, x, y)) continue;
    if (siteAt(state.world, x, y)) continue;
    if (state.player && x === state.player.x && y === state.player.y) continue;
    if (unit && unitOccupies(state, unit, x, y)) continue;
    return { x, y };
  }
  return null;
}

/* ---------------------------------------------------------------- 封地 */
/**
 * 封地是据点上的一个人事标记：site.lordId 指向 state.lords 里的领主。
 * 城、关隘、村庄都能封；山寨不算领地。标记跟着 world 一起存档，
 * 不另起一套势力数据，旧档没有这个字段时按 null / 自动补封处理。
 */

function siteLord(state, site) {
  if (!state || !site || !site.lordId) return null;
  return (state.lords || []).filter(function (l) {
    return l.id === site.lordId && l.alive;
  })[0] || null;
}

/** 这块地是不是玩家自己直辖的封地（不派领主，税直接进玩家口袋） */
function siteSelfFief(state, site) {
  return !!(state && site && site.playerOwned && site.selfFief);
}

function lordFiefs(state, lord) {
  if (!state || !lord) return [];
  return (state.world.sites || []).filter(function (s) {
    return s.lordId === lord.id && s.type !== 'camp';
  });
}

/** 旧档/新开局：把无主的 AI 城村按驻地就近封给本势力领主 */
function autoAssignFiefs(state) {
  if (!state || !state.world) return;
  const lords = state.lords || [];
  const used = {};
  // 每位领主只领一处封地；先认已有封地，再给空城挑人
  lords.forEach(function (l) {
    const own = lords.length ? state.world.sites.filter(function (s) {
      return s.lordId === l.id && s.type !== 'camp' && !s.selfFief;
    }) : [];
    if (own.length) {
      used[l.id] = true;
      // 旧档里一个领主挂多处：只保留离驻地最近的一处
      own.slice(1).forEach(function (s) { s.lordId = null; });
    }
  });
  state.world.sites.forEach(function (site) {
    if (site.type === 'camp') {
      site.lordId = null;
      site.selfFief = false;
      return;
    }
    if (site.selfFief) site.lordId = null;
    const cur = lords.filter(function (l) { return l.id === site.lordId && l.alive; })[0];
    const okFaction = cur && (site.playerOwned ? cur.faction === 'player' : cur.faction === site.ownerFaction);
    if (cur && okFaction) {
      used[cur.id] = true;
      return;
    }
    if (site.lordId && !okFaction) site.lordId = null;

    if (site.playerOwned || !site.ownerFaction || site.ownerFaction === 'bandit') return;
    const pool = lords.filter(function (l) {
      return l.alive && !l.prisoner && !l.hidden && l.faction === site.ownerFaction && !used[l.id];
    });
    if (!pool.length) return;

    // 城优先给把这里当驻地的人；没有就按距离挑最近的一支
    let best = pool.filter(function (l) { return l.home === site.id; })[0];
    if (!best) {
      best = pool.slice().sort(function (a, b) {
        const da = Math.abs((a.x || 0) - site.x) + Math.abs((a.y || 0) - site.y);
        const db = Math.abs((b.x || 0) - site.x) + Math.abs((b.y || 0) - site.y);
        return da - db;
      })[0];
    }
    if (best) {
      site.lordId = best.id;
      used[best.id] = true;
    }
  });
}

/**
 * 把某个据点封给领主；lordId 传空就是收回。
 * 玩家只能封自己旗下的领主，AI 只能封本势力的领主。
 */
function assignFief(state, siteId, lordId) {
  const site = siteById(state.world, siteId);
  if (!site) return { ok: false, msg: '找不到这块地方' };
  if (site.type === 'camp') return { ok: false, msg: '山寨不是封地' };
  const lord = lordId
    ? (state.lords || []).filter(function (l) { return l.id === lordId && l.alive; })[0]
    : null;

  if (lordId && !lord) return { ok: false, msg: '这个人已经不在军中了' };
  if (lord) {
    if (site.playerOwned) {
      if (lord.faction !== 'player' && lord.faction !== state.player.faction) {
        return { ok: false, msg: '只能封给自己的臣下' };
      }
    } else if (site.ownerFaction && lord.faction !== site.ownerFaction) {
      return { ok: false, msg: '这块地不是他的势力打下来的' };
    }
  }

  if (!lord) {
    const old = siteLord(state, site);
    site.lordId = null;
    site.selfFief = false;
    return { ok: true, msg: old ? '收回了' + site.name + '的封地' : site.name + '本来就没有封主' };
  }

  const old = siteLord(state, site);
  if (old && old.id === lord.id && site.selfFief !== true) {
    return { ok: true, msg: site.name + '本来就封给了' + lord.name };
  }

  // 每位领主最多一处封地：改封就收回他原来那处，不让他一人挂两地
  const previous = lordFiefs(state, lord).filter(function (s) { return s.id !== site.id; });
  previous.forEach(function (s) { s.lordId = null; });

  site.lordId = lord.id;
  site.selfFief = false;
  // 没有主驻地的人，第一块封地就是他的驻地；已有驻地的不搬
  if (!lord.home || !siteById(state.world, lord.home)) lord.home = site.id;
  pushLog(state, (old || previous.length ? '改封' : '封地') + '：' + site.name + '归' + lord.name + '。', 'fief');
  return {
    ok: true,
    msg: (old || previous.length ? '改封' : '封地') + '：' + site.name + '归' + lord.name +
      (previous.length ? '（原封地已收回）' : ''),
    lordId: lord.id,
    siteId: site.id,
  };
}

/** 把一块城/村收归自己直辖：不派领主，按周把税送进你的帐里 */
function assignFiefSelf(state, siteId) {
  const site = siteById(state.world, siteId);
  if (!site) return { ok: false, msg: '找不到这块地方' };
  if (site.type === 'camp') return { ok: false, msg: '山寨不是封地' };
  if (!site.playerOwned) return { ok: false, msg: '这块地方还不是你的' };
  const old = siteLord(state, site);
  if (old) site.lordId = null;
  site.selfFief = true;
  pushLog(state, '封地：' + site.name + '收归自己直辖，每周结算一次税赋。', 'fief');
  return {
    ok: true,
    msg: old
      ? '已从' + old.name + '手中收回' + site.name + '，改由你自己直辖'
      : site.name + '由你自己直辖，每周收税',
    siteId: site.id,
  };
}

/** 每周直辖封地的税：城多于关隘，关隘多于村；不占每日城池收入 */
function fiefTaxFor(site) {
  if (!site) return 0;
  if (site.type === 'town') return 180;
  if (site.type === 'castle') return 100;
  if (site.type === 'village') return 45;
  return 0;
}

function fiefTaxTick(state) {
  if (!state || state.clock.day % 7 !== 0) return 0;
  if (state.fiefTaxDay === state.clock.day) return 0;
  state.fiefTaxDay = state.clock.day;
  const sites = state.world.sites.filter(function (s) {
    return s.playerOwned && s.selfFief && s.type !== 'camp' && !s.specialEdge;
  });
  if (!sites.length) return 0;
  const total = sites.reduce(function (sum, s) { return sum + fiefTaxFor(s); }, 0);
  state.player.gold += total;
  state.stats.goldEarned += total;
  const names = sites.slice(0, 3).map(function (s) { return s.name; }).join('、');
  pushLog(state, '第 ' + state.clock.day + ' 天，直辖封地送来本旬税赋 ' + total + ' 金钱（' +
    names + (sites.length > 3 ? ' 等 ' + sites.length + ' 处' : '') + '）。', 'fief');
  return total;
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
    level: lordLevelForRank(LORD_RANK[def.id] || 'general'),
    x: spot.x,
    y: spot.y,
    troops: convertRosterToFaction(deepCopy(def.soldiers), def.faction),
    morale: def.morale,
    baseMorale: def.morale,
    sight: def.sight,
    chasing: false,
    alive: true,
    respawnDay: 0,
    defTroops: convertRosterToFaction(deepCopy(def.soldiers), def.faction),
    strategistOnly: !!def.strategistOnly,
    wander: null,
    dead: false,
    retired: false,
    prisoner: null,
    hidden: null,
    resting: false,
    scattered: false,
    scatterUntilH: 0,
    scatterHomeId: null,
    scatterCityId: null,
    scatterRecovering: false,
    scatterHidden: false,
    exPlayer: false,
    arcLoyal: false,
    borderStation: false,
  };
}


/** 官渡补兵：先把活着的领主补到个人满编；若此前折了领主，再按该国全部领主的满编总和补足差额。 */
function fillGuanduFaction(state, faction) {
  const all = (state.lords || []).filter(function (l) { return l && l.faction === faction; });
  const active = all.filter(function (l) {
    return l.alive && !l.dead && !l.retired && !l.prisoner && !l.hidden;
  });
  if (!active.length) return 0;
  // 先把每个活着的领主补到自己的 defTroops 满编。
  active.forEach(function (lord) {
    lord.troops = deepCopy(lord.defTroops || lord.troops || {});
  });
  // 官渡是国运决战：此前战死的领主留下的编制，折成援军补进活着的队伍。
  // 目标取全势力领主的满编总和；援军按原兵种比例补入，避免只剩一名袁将时
  // 把两千里全变成 T1 纸兵，看起来补满了、打起来还是一触即溃。
  const target = all.reduce(function (sum, lord) {
    return sum + army.troopCount(lord.defTroops || lord.troops || {});
  }, 0);
  const current = active.reduce(function (sum, lord) {
    return sum + army.troopCount(lord.troops || {});
  }, 0);
  const missing = target - current;
  if (missing > 0) {
    const missingRoster = {};
    all.forEach(function (lord) {
      if (active.indexOf(lord) >= 0) return;
      const roster = lord.defTroops || lord.troops || {};
      Object.keys(roster).forEach(function (id) {
        if (roster[id] > 0) missingRoster[id] = (missingRoster[id] || 0) + roster[id];
      });
    });
    const weights = active.map(function (lord) {
      return Math.max(1, army.troopCount(lord.defTroops || lord.troops || {}));
    });
    const weightSum = weights.reduce(function (a, b) { return a + b; }, 0);
    let left = missing;
    active.forEach(function (lord, i) {
      const add = i === active.length - 1 ? left : Math.floor(missing * weights[i] / weightSum);
      left -= add;
      if (add <= 0) return;
      const addRoster = war.scaleTroopsTo(missingRoster, add);
      Object.keys(addRoster).forEach(function (id) {
        lord.troops[id] = (lord.troops[id] || 0) + addRoster[id];
      });
    });
  }
  return target;
}

/** 官渡开局：曹袁两军补满，分别在官渡南北列阵。 */
function stageGuandu(state) {
  // 官渡只布阵一次；袁绍后进入阶段时不能把已经开打的战场重新洗牌。
  if (state.story && state.story.guanduBattleStaged) return true;
  const guandu = siteById(state.world, 'guandu');
  if (!guandu) return false;
  ['wei', 'yuan'].forEach(function (faction, sideIndex) {
    const lords = state.lords.filter(function (l) {
      return l && l.faction === faction && l.alive && !l.dead && !l.retired && !l.prisoner && !l.hidden;
    });
    // 先把整个势力的兵力补到满编总和，再逐个布阵。
    fillGuanduFaction(state, faction);
    lords.forEach(function (lord, i) {
      // 官渡不再削袁绍士气：袁军按初始正常士气列阵，曹军仍以逸待劳。
      lord.morale = faction === 'yuan'
        ? (Number(lord.baseMorale) || Number(lord.defMorale) || 78)
        : 92;
      lord.inCity = null;
      lord.resting = false;
      lord.defending = null;
      lord.order = null;
      lord.chasing = false;
      lord.engagedWith = null;
      lord.engagedSinceH = null;
      lord.enteringSiteId = null;
      lord.cityEnterAtH = null;
      lord.routePath = null;
      lord.routePathFor = null;
      lord.orderPath = null;
      lord.patrolPath = null;
      lord.wander = null;
      lord.stepFrom = null;
      lord.stepTo = null;
      lord.stepStartH = null;
      lord.stepHours = null;
      lord.nextMoveH = 0;
      const side = faction === 'yuan' ? -1 : 1;
      const anchor = {
        x: guandu.x + ((i % 5) - 2) * 2,
        y: guandu.y + side * (6 + Math.floor(i / 5) * 2),
      };
      const spot = findFreeSpotNear(state, anchor.x, anchor.y, 6, lord) ||
        findFreeSpotNear(state, guandu.x, guandu.y, 12, lord);
      if (spot) {
        lord.x = spot.x;
        lord.y = spot.y;
        lord.prevX = spot.x;
        lord.prevY = spot.y;
      }
    });
  });

  // 直接在官渡拉一场曹袁合战：两军已经补满并在南北列阵，五格内的队伍会陆续入阵。
  if (state.fieldBattles && state.fieldBattles.some(function (bf) {
    return bf && bf.context && bf.context.cause === 'guandu' && bf.battle && !bf.battle.finished;
  })) {
    if (state.story) state.story.guanduBattleStaged = true;
    return true;
  }
  const caocao = state.lords.filter(function (l) { return l.id === 'caocao' && l.alive && !l.dead; })[0];
  const yuanshao = state.lords.filter(function (l) { return l.id === 'yuanshao' && l.alive && !l.dead; })[0];
  if (caocao && yuanshao && war.createFieldBattle) {
    war.createFieldBattle(state,
      { kind: 'lord', id: caocao.id },
      { kind: 'lord', id: yuanshao.id },
      { preAggregate: true, radius: 14, context: { kind: 'field', cause: 'guandu' } });
  }
  if (state.story) state.story.guanduBattleStaged = true;
  return true;
}

/**
 * 赤壁开局：孙曹刘三家的军队全部向赤壁集结。
 * 只挪位置、清军令，不补兵也不额外扣兵；火攻损失由剧情层按现有兵力结算。
 * 玩家本人不强行传送，留在原地决定是否参战。
 */
function stageChibi(state) {
  if (!state || !state.story) return false;
  if (state.story.chibiBattleStaged) return true;
  const chibi = siteById(state.world, 'chibi');
  if (!chibi) return false;
  ['wei', 'shu', 'wu'].forEach(function (faction, sideIndex) {
    let index = 0;
    (state.lords || []).forEach(function (lord) {
      if (!lord || lord.faction !== faction || !lord.alive || lord.dead || lord.retired || lord.prisoner) return;
      if (lord.isPlayer || !army.troopCount(lord.troops || {})) return;
      const around = Math.PI * 2 * (index % 16) / 16;
      const ring = 5 + Math.floor(index / 16) * 2;
      const side = faction === 'wei' ? -1 : 1;
      const ax = Math.round(chibi.x + Math.cos(around) * ring);
      const ay = Math.round(chibi.y + side * (5 + Math.abs(Math.sin(around)) * 3) + Math.floor(index / 16));
      const spot = findFreeSpotNear(state, ax, ay, 8, lord) ||
        findFreeSpotNear(state, chibi.x, chibi.y, 18, lord);
      lord.inCity = null;
      lord.resting = false;
      lord.defending = null;
      lord.order = null;
      lord.chasing = false;
      lord.hunting = false;
      lord.fleeing = false;
      lord.engagedWith = null;
      lord.engagedSinceH = null;
      lord.enteringSiteId = null;
      lord.cityEnterAtH = null;
      lord.routePath = null;
      lord.routePathFor = null;
      lord.orderPath = null;
      lord.patrolPath = null;
      lord.patrolLoop = null;
      lord.wander = null;
      lord.stepFrom = null;
      lord.stepTo = null;
      lord.stepStartH = null;
      lord.stepHours = null;
      lord.nextMoveH = 0;
      if (spot) {
        lord.x = spot.x;
        lord.y = spot.y;
        lord.prevX = spot.x;
        lord.prevY = spot.y;
      }
      index += 1;
    });
  });
  state.story.chibiBattleStaged = true;
  return true;
}

function spawnLords(state) {
  const { LORDS } = require('../data/china.js');
  const { STORY } = require('../data/story.js');
  let defs = LORDS;
  if (state.storyMode || state.historicalRoster) {
    // 三国演义专属人事：吕布、刘表、刘璋削减领主；魏蜀吴补入新人。
    // 无主线模式也保留这套史实人事，只是不再启动战略阶段。
    const cuts = STORY.lordCuts || {};
    defs = defs.filter(function (def) {
      const drop = cuts[def.faction] || [];
      return drop.indexOf(def.id) < 0;
    });
    defs = defs.concat(STORY.lordAdds || []);
  }
  state.lords = defs.map(function (def) { return lordFromDef(state, def); });
  applyLordRoles(state);
  applyLordTier4Rule(state);
  applyLordPowerRoster(state);
  applyLordT5Rule(state);
  applyFactionRosterCap(state);
  if (state.flags) {
    state.flags.lordTier4V1 = true;
    state.flags.lordWeiCapV1 = true;
    state.flags.lordRolesV1 = true;
  }
  // 生成后再把真正叠格的领主挪开；不改变原开局落位顺序和随机数消耗。
  unstackLords(state);
}

/**
 * 旧档清洗：n11 及更早的存档里可能留着已经作废的“集结/扎营/围城”军令。
 * 这些军令会让领主在城边一直等到下一轮战略结算，甚至永久站住。
 * 进档时只保留仍属于进行中战役的军令；hold 一律转回巡逻。
 */
function sanitizeLordOrders(state) {
  if (!state || !Array.isArray(state.lords)) return;
  const active = {};
  Object.keys(state.warCampaigns || {}).forEach(function (faction) {
    const cp = state.warCampaigns[faction];
    if (!cp || cp.done) return;
    (cp.attackerIds || []).concat(cp.defenderIds || []).forEach(function (id) {
      active[id] = true;
    });
  });
  state.lords.forEach(function (lord) {
    if (!lord || !lord.order) return;
    const keep = !!active[lord.id] && lord.order.type !== 'hold';
    if (keep) return;
    lord.order = null;
    lord.defending = null;
    lord.wander = null;
    lord.routePath = null;
    lord.routePathFor = null;
    lord.patrolPath = null;
    lord.orderPath = null;
    lord.orderPathFor = null;
    lord.nextMoveH = 0;
  });
}

/**
 * 老档/新开局兜底：同一格上只留一支队伍，其余挪到最近的可走空格。
 * 只动真正重叠的领主，不重排正常站位；挪动只有一两格，不瞬移。
 */
function unstackLords(state) {
  if (!state || !state.world || !Array.isArray(state.lords)) return;
  const taken = {};
  state.lords.forEach(function (lord) {
    if (!lord || !lord.alive || lord.inCity || lord.prisoner || lord.hidden) return;
    const key = lord.x + ',' + lord.y;
    if (!taken[key]) {
      taken[key] = lord.id;
      return;
    }
    let spot = null;
    for (let radius = 1; radius <= 4 && !spot; radius++) {
      for (let dy = -radius; dy <= radius && !spot; dy++) {
        for (let dx = -radius; dx <= radius && !spot; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const nx = lord.x + dx;
          const ny = lord.y + dy;
          if (nx < 0 || ny < 0 || nx >= state.world.w || ny >= state.world.h) continue;
          if (!isPassable(state.world, nx, ny) || siteAt(state.world, nx, ny)) continue;
          if (state.player && nx === state.player.x && ny === state.player.y) continue;
          if (taken[nx + ',' + ny]) continue;
          if ((state.parties || []).some(function (q) { return q.x === nx && q.y === ny; })) continue;
          spot = { x: nx, y: ny };
        }
      }
    }
    if (!spot) return;
    taken[spot.x + ',' + spot.y] = lord.id;
    lord.stepFrom = null;
    lord.stepTo = null;
    lord.stepStartH = null;
    lord.stepHours = null;
    lord.x = spot.x;
    lord.y = spot.y;
    lord.routePath = null;
    lord.routePathFor = null;
    lord.patrolPath = null;
    lord.wander = null;
  });
}

/** 序章追兵：西凉步卒，披重甲、走得慢，逼你往东跑 */
function spawnChaseParty(state, pos) {
  const from = findFreeSpotNear(state, pos.x - 6, pos.y + 1, 1) || { x: Math.max(1, pos.x - 6), y: pos.y };
  state.parties.push({
    id: 'p_xiliang',
    name: '西凉步卒',
    faction: 'xiliang',
    scripted: true,
    slow: 2,
    tick: 0,
    troops: { spear: 30, tiefu: 30 },
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
    // “赤色叛军”在全国背叛前不落地；否则史册和地图会提前出现叛军名号。
    if (id === 'hong' && !(state.arc && state.arc.phase !== 'retreat')) return;
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

/** 匪团的归属州：老档没有 roamRegion 时按脚下州补上。 */
function banditHomeRegion(state, party) {
  if (!party || !state || !state.world) return 'zhongyuan';
  if (!party.roamRegion) party.roamRegion = regionAt(state.world, party.x, party.y);
  return party.roamRegion;
}

/** 到最近城镇/关隘的距离（村寨不算，避免匪团钻进村口）。 */
function banditTownDistance(world, x, y) {
  let best = 999;
  (world.sites || []).forEach(function (s) {
    if (s.type !== 'town' && s.type !== 'castle') return;
    const d = Math.max(Math.abs(x - s.x), Math.abs(y - s.y));
    if (d < best) best = d;
  });
  return best;
}

/** 匪团的合法落脚点：不贴地图边、不压据点、只在本州、离城不能太远。 */
function banditSpotAllowed(state, x, y, region, unit) {
  if (!state || !state.world) return false;
  const world = state.world;
  if (x < BANDIT_EDGE_MARGIN || y < BANDIT_EDGE_MARGIN ||
      x > world.w - 1 - BANDIT_EDGE_MARGIN || y > world.h - 1 - BANDIT_EDGE_MARGIN) return false;
  if (inBanditExclusion(x, y)) return false;
  if (!isPassable(world, x, y)) return false;
  if (siteAt(world, x, y)) return false;
  if (state.player && Math.max(Math.abs(x - state.player.x), Math.abs(y - state.player.y)) < 6) return false;
  if (unit && unitOccupies(state, unit, x, y)) return false;
  const rid = regionAt(world, x, y);
  if (region && rid !== region) return false;
  if (banditTownDistance(world, x, y) > BANDIT_CITY_RANGE) return false;
  return true;
}

/** 州内找一处可落脚的空地；优先城镇附近，保证匪团不会跑到荒山边角。 */
function banditRegionSpot(state, region, unit) {
  const world = state.world;
  const towns = (world.sites || []).filter(function (s) {
    return (s.type === 'town' || s.type === 'castle') && regionAt(world, s.x, s.y) === region;
  });
  const rng = state.rng;
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = rng.int(BANDIT_EDGE_MARGIN, world.w - 1 - BANDIT_EDGE_MARGIN);
    const y = rng.int(BANDIT_EDGE_MARGIN, world.h - 1 - BANDIT_EDGE_MARGIN);
    if (banditSpotAllowed(state, x, y, region, unit)) return { x: x, y: y };
    if (!towns.length) continue;
    const town = towns[attempt % towns.length];
    const spot = findFreeSpotNear(state, town.x, town.y, 7, unit);
    if (spot && banditSpotAllowed(state, spot.x, spot.y, region, unit)) return spot;
  }
  // 最后只贴着本州城镇找；实在没有就留给调用方跳过这一支。
  for (let i = 0; i < towns.length; i++) {
    const town = towns[i];
    for (let radius = 2; radius <= 8; radius += 2) {
      const spot = findFreeSpotNear(state, town.x, town.y, radius, unit);
      if (spot && banditSpotAllowed(state, spot.x, spot.y, region, unit)) return spot;
    }
  }
  return null;
}

/**
 * 匪团落点：先按州均匀分，再在全图抽样，
 * 尽量远离已有的匪团，避免全挤在几座匪巢门口。
 */
function balancedBanditSpot(state) {
  const rng = state.rng;
  const world = state.world;
  const p = state.player;
  const counts = {};
  Object.keys(REGIONS).forEach(function (id) { counts[id] = 0; });
  (state.parties || []).forEach(function (q) {
    if (q.faction !== 'bandit') return;
    const rid = q.region || regionAt(world, q.x, q.y);
    if (counts[rid] !== undefined) counts[rid] += 1;
  });

  // 先挑人最少的州；同数时随机，避免每轮都从西北开始。
  let targetRegion = null;
  let least = Infinity;
  Object.keys(REGIONS).forEach(function (id) {
    const n = counts[id] || 0;
    if (n < least || (n === least && rng.chance(0.35))) {
      least = n;
      targetRegion = id;
    }
  });

  let best = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 260; attempt++) {
    const x = rng.int(BANDIT_EDGE_MARGIN, world.w - 1 - BANDIT_EDGE_MARGIN);
    const y = rng.int(BANDIT_EDGE_MARGIN, world.h - 1 - BANDIT_EDGE_MARGIN);
    if (!banditSpotAllowed(state, x, y, targetRegion, null)) continue;

    let nearestBandit = 999;
    state.parties.forEach(function (q) {
      if (q.faction !== 'bandit') return;
      const d = Math.max(Math.abs(x - q.x), Math.abs(y - q.y));
      if (d < nearestBandit) nearestBandit = d;
    });

    let nearestSite = 999;
    world.sites.forEach(function (s) {
      if (s.type === 'camp') return;
      const d = Math.max(Math.abs(x - s.x), Math.abs(y - s.y));
      if (d < nearestSite) nearestSite = d;
    });

    // 离其他匪团越远越好；离城村太近要扣分，避免堵门；本州加分。
    const score = Math.min(30, nearestBandit) * 1.35 + rng.random() * 5 +
      (nearestSite < 4 ? -7 : 0) + (targetRegion ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { x: x, y: y, region: targetRegion };
    }
  }
  if (best) return best;

  // 抽样没中：退回本州城镇附近，绝不落在地图边或别州。
  Object.keys(REGIONS).forEach(function (id) {
    if (best) return;
    const spot = banditRegionSpot(state, id, null);
    if (spot) best = { x: spot.x, y: spot.y, region: id };
  });
  return best;
}

/** 造一支匪团（新刷、三日重生共用，保证字段一致） */
function makeBanditParty(state, tier, spot, name) {
  const rng = state.rng;
  const cfg = BANDIT_TIERS[tier] || BANDIT_TIERS.qing;
  const size = rng.int(cfg.minSize, cfg.maxSize);
  const troops = { bandit: size };
  Object.keys(cfg.extra || {}).forEach(function (id) {
    const range = cfg.extra[id];
    troops[id] = rng.int(range[0], range[1]);
  });
  return {
    id: 'p' + state.partySeq++,
    name: name || rng.pick(BANDIT_NAMES[tier] || BANDIT_NAMES.qing),
    faction: 'bandit',
    banditTier: tier,
    region: regionAt(state.world, spot.x, spot.y),
    roamRegion: regionAt(state.world, spot.x, spot.y),
    color: cfg.color,
    troops,
    morale: rng.int(cfg.morale[0], cfg.morale[1]),
    x: spot.x,
    y: spot.y,
    wander: null,
    roamTarget: null,
    roamPath: null,
    roamPathFor: null,
    chasing: false,
    sight: cfg.sight,
    loot: cfg.loot,
    size0: size,
  };
}

function spawnBanditParties(state, count) {
  const rng = state.rng;
  const alive = state.parties.filter(function (x) { return x.faction === 'bandit'; }).length;
  const want = Math.max(0, Math.min(count, BANDIT_MAX - alive));
  const camps = state.world.sites.filter(function (s) {
    return s.type === 'camp' && !s.cleared;
  });
  for (let i = 0; i < want; i++) {
    const tier = pickBanditTier(state);
    let spot = balancedBanditSpot(state);
    if (!spot && camps.length) {
      const camp = rng.pick(camps);
      const campSpot = findFreeSpotNear(state, camp.x, camp.y, 7);
      if (campSpot && banditSpotAllowed(state, campSpot.x, campSpot.y, regionAt(state.world, campSpot.x, campSpot.y), null)) {
        spot = campSpot;
      }
    }
    if (!spot) continue;
    state.parties.push(makeBanditParty(state, tier, spot));
  }
}

/** 匪团被打散/打死：不进牢房，三日后再在别处聚起一队。 */
function destroyBanditParty(state, party, reason) {
  if (!party || party.scripted || party.dead) return false;
  // 玩家接到猎匪任务的五天内，NPC 的任何清剿都不能把目标抹掉；玩家自己打赢仍然算数。
  if (reason !== 'player' && questProtectedParty(state, party)) return false;
  party.dead = true;
  const day = state.clock.day;
  (state.lords || []).forEach(function (lord) {
    if (String(lord.engagedWith || '') === 'party:' + party.id) {
      lord.engagedWith = null;
      lord.engagedSinceH = null;
      lord.scuffle = Math.max(lord.scuffle || 0, 3);
    }
    if (lord.banditChasing === party.id) {
      lord.hunting = false;
      lord.banditChasing = null;
      lord.foeChasing = null;
      lord.chasing = false;
    }
  });
  party.engagedWith = null;
  party.engagedSinceH = null;
  state.banditRespawning = state.banditRespawning || [];
  if (!state.banditRespawning.some(function (q) { return q.partyId === party.id; })) {
    state.banditRespawning.push({
      partyId: party.id,
      tier: party.banditTier || 'qing',
      name: party.name,
      from: reason || 'npc',
      respawnDay: day + BANDIT_RESP_DAYS,
    });
  }
  state.parties = state.parties.filter(function (q) { return q.id !== party.id; });
  return true;
}

/** 每天检查三日前被打散的匪团：在另一个空地上重新聚人 */
function banditRespawnTick(state) {
  if (!state.banditRespawning) state.banditRespawning = [];
  const due = state.banditRespawning.filter(function (q) {
    return state.clock.day >= (q.respawnDay || 0);
  });
  if (!due.length) return 0;
  let spawned = 0;
  due.forEach(function (entry) {
    const alive = state.parties.filter(function (q) { return q.faction === 'bandit'; }).length;
    if (alive >= BANDIT_MAX) return; // 满编就先留在队里，明天再试
    const spot = balancedBanditSpot(state);
    if (!spot) return;
    const tier = BANDIT_TIERS[entry.tier] ? entry.tier : pickBanditTier(state);
    state.parties.push(makeBanditParty(state, tier, spot, entry.name));
    entry.done = true;
    spawned += 1;
  });
  state.banditRespawning = state.banditRespawning.filter(function (q) { return !q.done; });
  if (spawned && state.player) {
    pushLog(state, '三日期满，又有一伙残匪在别处聚了起来。');
  }
  return spawned;
}

/** 山寨按主角声望挑等级：声望越高，匪团越像样 */
function campTierForRenown(state) {
  const tiers = allowedTiers(state);
  const renown = Math.max(0, (state.player && state.player.renown) || 0);
  const index = Math.min(tiers.length - 1, Math.floor(renown / 180));
  return tiers[index] || 'qing';
}

/** 被攻破的山寨三日后在地图任意空地重新聚人，不再回原址 */
function pickCampRespawnSpot(state, camp) {
  const world = state.world;
  const rng = state.rng;
  const p = state.player;
  const homeRegion = camp && camp.region ? camp.region : null;
  // 山寨重新聚人也要守匪团的规矩：只在本州、离城不远、不贴地图边。
  for (let attempt = 0; attempt < 240; attempt++) {
    const x = rng.int(BANDIT_EDGE_MARGIN, world.w - 1 - BANDIT_EDGE_MARGIN);
    const y = rng.int(BANDIT_EDGE_MARGIN, world.h - 1 - BANDIT_EDGE_MARGIN);
    if (!banditSpotAllowed(state, x, y, homeRegion, null)) continue;
    return { x, y };
  }
  const spot = banditRegionSpot(state, homeRegion || regionAt(world, world.w / 2, world.h / 2), null);
  return spot || null;
}

function campRespawnTick(state) {
  state.world.sites.forEach(function (site) {
    if (!site || site.type !== 'camp' || !site.cleared) return;
    if (!site.respawnDay) {
      site.respawnDay = (site.lootedDay || state.clock.day) + CAMP_RESPAWN_DAYS;
    }
    if (state.clock.day < site.respawnDay) return;
    const spot = pickCampRespawnSpot(state, site);
    if (!spot) return;

    // 营地搬去新地方，旧坐标只剩荒地
    site.x = spot.x;
    site.y = spot.y;
    site.region = regionAt(state.world, spot.x, spot.y);
    site.cleared = false;
    site.looted = false;
    site.lootedDay = null;
    site.respawnDay = null;

    // 声望越高，寨子里的匪兵越多、匪团等级越高；保留原始基数，避免每轮翻倍
    site.campBase0 = site.campBase0 || site.garrisonBase || site.garrison || 36;
    site.banditTier = campTierForRenown(state);
    const tier = BANDIT_TIERS[site.banditTier] || BANDIT_TIERS.qing;
    const renown = Math.max(0, (state.player && state.player.renown) || 0);
    const factor = 1 + Math.min(1.8, renown / 500) + (tier.rank - 1) * 0.12;
    site.garrisonBase = Math.max(24, Math.round(site.campBase0 * factor));
    site.garrison = site.garrisonBase;
    site.garrisonGrowth = 0;
  });
}

/** 补充匪团到目标数量，避开玩家脚下；整体数量只在目标上下浮动 */
function refillBandits(state) {
  const alive = state.parties.filter(function (x) { return x.faction === 'bandit'; }).length;
  const queued = (state.banditRespawning || []).length;
  // 三日重生队也算“名额”，否则匪团刚被打散，日常补员又会在第二天立刻刷回来。
  if (alive + queued >= BANDIT_TARGET) return 0;
  const add = Math.min(BANDIT_TARGET - alive - queued, BANDIT_REFILL_PER_DAY);
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
    state.playerWarSince = state.playerWarSince || {};
    state.playerWarSince[factionId] = state.clock.day;
    // 同时写进国战表，否则天下大势的“战”和议和流程会看不到这场仗
    if (war && war.declare) war.declare(state, 'player', factionId, true);
    pushLog(state, FACTIONS[factionId].name + '把你列为逆贼，其领主见到你就会动手。');
  }
  if (delta < 0 && before > -25 && next <= -25) {
    state.wars[factionId] = true;
    state.playerWarSince = state.playerWarSince || {};
    state.playerWarSince[factionId] = state.playerWarSince[factionId] || state.clock.day;
  }
}

function isHostileSite(state, site) {
  if (!site) return false;
  // 洗劫过的山寨不再是军事目标：只剩废墟，点进去看火烧过的空营
  if (site.type === 'camp') return !site.cleared;
  if (site.playerOwned) return false;
  // 无主城围攻失败后，城头只认刀：玩家不能再进城，只能重新围、再决战
  if (site.playerBlocked) return true;
  return isHostileFaction(state, site.ownerFaction);
}

function siteStatus(state, site) {
  if (site.playerOwned) return '你的领地';
  if (site.type === 'camp') return site.cleared ? '废墟 · 已洗劫' : '贼巢 · 可攻';
  if (!site.ownerFaction) return site.playerBlocked ? '敌对' : '无主';
  if (isHostileFaction(state, site.ownerFaction)) return '敌对';
  return '可进入';
}

/* ---------------------------------------------------------------- 查询 */

function playerSpeed(state) {
  const bonus = economy.equipmentBonus(state);
  const hb = heroes.heroBonus(state);
  const count = army.troopCount(state.player.troops);
  // 兵越多，辎重越长，行军越慢。用饱和曲线而不是分段截断：
  // 50/200/400/600 人会一路变慢，只有极大规模才落到 0.35 的下限。
  const n = Math.max(0, count);
  const sizePenalty = Math.min(0.75, 0.80 * (n / (n + 220)));
  return Math.max(0.35, 1 + bonus.speedPct + hb.speedPct - sizePenalty);
}

function capacity(state) {
  // 边陲小镇复国阶段要给旧部与义军留出 1000 人的落脚空间；平时仍按声望。
  return border.troopCap(state);
}

function currentPos(state) {
  return { x: state.player.x, y: state.player.y };
}

/** 玩家此刻在格子上真正画在哪：中途改道时用来接住已经走出的那一段 */
function playerVisualPos(state) {
  const p = state && state.player;
  if (!p) return { x: 0, y: 0 };
  if (!p.stepFrom || !p.stepTo || !(p.stepProgress > 0)) return { x: p.x, y: p.y };
  const t = Math.min(1, Math.max(0, p.stepProgress));
  return {
    x: p.stepFrom.x + (p.stepTo.x - p.stepFrom.x) * t,
    y: p.stepFrom.y + (p.stepTo.y - p.stepFrom.y) * t,
  };
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

  const p = state.player;
  const oldStepTo = p.stepTo ? { x: p.stepTo.x, y: p.stepTo.y } : null;
  const oldStepFrom = p.stepFrom ? { x: p.stepFrom.x, y: p.stepFrom.y } : null;
  const oldProgress = p.stepProgress || 0;
  const visual = playerVisualPos(state);

  p.route = path;
  // 快速改道时不要把已经走出的半步抹掉。新路线若仍朝原来那格走，
  // 就保留原来的插值起点和进度；若新路线第一步换了方向，就从“当前画面位置”接出去。
  if (oldStepTo && oldStepFrom && oldProgress > 0 &&
      path[0].x === oldStepTo.x && path[0].y === oldStepTo.y) {
    p.stepFrom = oldStepFrom;
    p.stepTo = path[0];
    p.stepProgress = oldProgress;
  } else {
    p.stepFrom = visual;
    p.stepTo = path[0];
    p.stepProgress = 0;
  }
  p.atSiteId = null;
  // 一动身就不再是"城里歇着"了
  p.resting = null;
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
  if (site.specialEdge) {
    pushLog(state, '你在' + site.name + '的客栈里歇下。镇口的猎户替你望风，粮吃得慢一半。');
    return { ok: true, msg: '在' + site.name + '歇下：粮耗减半，镇民替你望风' };
  }
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

/**
 * 大地图左下角的“暂停休整”：停止客栈休整、把人物放到城外一格，
 * 并由地图层把时辰冻住。这里只负责人物状态，不负责画面暂停。
 */
function leaveRestForMap(state) {
  const p = state && state.player;
  if (!p) return { ok: false, msg: '没有可出城的人' };
  const site = siteById(state.world, p.resting || p.atSiteId);
  const wasResting = !!p.resting;
  stopMoving(state);
  if (p.resting) stopRest(state);
  p.atSiteId = null;
  p.stepFrom = null;
  p.stepTo = null;
  p.stepProgress = 0;
  // 人物原来站在城中心：挪到城外最近的合法空地，避免模型被城池图标盖住。
  if (site && p.x === site.x && p.y === site.y) {
    const spot = findFreeSpotNear(state, site.x, site.y, 2, p);
    if (spot) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.x = spot.x;
      p.y = spot.y;
    }
  }
  return {
    ok: true,
    msg: wasResting ? '已出城扎营，时辰暂停。' : '已出城，时辰暂停。',
    siteId: site ? site.id : null,
    x: p.x,
    y: p.y,
  };
}

function isResting(state) {
  return !!(state && state.player && state.player.resting);
}

/** 城里/关隘歇下才算躲开追兵；村庄藏不住人，粮耗照样减半，但追兵能摸进来 */
function isSafeResting(state) {
  const p = state && state.player;
  if (!p || !p.resting) return false;
  const site = siteById(state.world, p.resting);
  return !!site && (site.type !== 'village' || !!site.specialEdge);
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

function diplomacyAlertsEnabled(state) {
  return !state || !state.settings || state.settings.diplomacyAlerts !== false;
}

/**
 * 诸侯开局不动兵。玩家进陈留、在城里歇满一天，才让天下开始互相宣战；
 * 只在这一刻放一批战书，并合成一条军情，避免一开局连续弹窗。
 */
function maybeStartDiplomacy(state) {
  if (!state || state.diplomacyStarted || !state.player) return false;
  if (state.player.atSiteId !== 'chenliu') {
    state.chenliuArrivalH = null;
    return false;
  }
  const nowH = gameHours(state);
  if (!state.chenliuArrivalH) state.chenliuArrivalH = nowH;
  if (nowH - state.chenliuArrivalH < 24) return false;
  state.diplomacyStarted = true;
  const started = war.startDiplomacy ? war.startDiplomacy(state) : 0;
  if (started) {
    pushLog(state, '陈留歇了一日，东面的驿道忽然忙起来：诸侯的战书一封接一封出了城。', 'war');
    if (diplomacyAlertsEnabled(state)) {
      state.events.push({
        type: 'diplomacy',
        kind: 'war',
        title: '天下开始动了',
        lines: [
          '你在陈留歇了一日。再抬头时，东面的驿道上全是背插令旗的信使。',
          started + ' 路诸侯互相下了战书，边关的烽火从早烧到晚。',
          '从今天起，天下这盘棋不再等你一个人落子。',
        ],
      });
    }
  }
  return true;
}

/**
 * 马超固定归蜀：到第 12 天，若他还在马腾旗下、没有被困在牢里或战场上，
 * 就带本部投刘备。凉州剩下的人由韩遂去收拾，这条线不再靠随机灭国。
 */
function ensureMaChaoToShu(state) {
  if (!state || !state.flags) return false;
  if (state.flags.machaoToShuDone) return false;
  if (state.clock.day < MA_CHAO_TO_SHU_DAY) return false;
  const mc = (state.lords || []).filter(function (l) { return l.id === 'machao'; })[0];
  if (!mc || mc.dead || !mc.alive) {
    state.flags.machaoToShuDone = true;
    return false;
  }
  if (mc.faction === 'shu') {
    state.flags.machaoToShuDone = true;
    return false;
  }
  if (mc.faction !== 'ma') return false;
  if (mc.prisoner || mc.fieldBattleId) return false;
  if ((state.factionState.shu || {}).dead || (state.factionState.ma || {}).dead) return false;
  moveLordToFaction(state, mc, 'shu');
  // 马超已经不在凉军里，旧战役名单里的人要撤掉，免得他继续替马家攻城。
  if (state.warCampaigns && state.warCampaigns.ma) war.abortCampaign(state, 'ma');
  state.flags.machaoToShuDone = true;
  pushLog(state, '马超带着西凉铁骑离开武威，南下而去；凉州军心从此散了一半。', 'war');
  return true;
}

/**
 * 武威破后三天：只让陇西献城，居延仍留马家旗。
 * 马腾韩遂不互相灭国：最后一座城沿用现有的保城判定，不额外加新机制。
 */
function resolveMaSurrender(state) {
  if (!state || !state.flags || !state.flags.maSurrenderDay) return false;
  if (state.clock.day < state.flags.maSurrenderDay) return false;
  if ((state.factionState.ma || {}).dead) {
    state.flags.maSurrenderDone = true;
    state.flags.maSurrenderDay = 0;
    return false;
  }
  if ((state.factionState.hansui || {}).dead) return false;
  const fac = FACTIONS.hansui;
  const sites = (state.world.sites || []).filter(function (s) {
    return s.ownerFaction === 'ma' && !s.playerOwned;
  });
  if (!sites.length) {
    fallFaction(state, 'ma');
    state.flags.maSurrenderDone = true;
    state.flags.maSurrenderDay = 0;
    return true;
  }
  // 优先留一座城（居延），村庄可以献；如果只剩村庄，就留最后一座。
  let keep = sites.filter(function (s) { return s.type === 'town' || s.type === 'castle'; })[0] ||
    sites[sites.length - 1];
  sites.forEach(function (s) {
    if (s === keep) return;
    s.ownerFaction = 'hansui';
    s.faction = 'hansui';
    s.color = fac.color;
    s.banner = fac.banner;
    s.lordId = null;
    s.selfFief = false;
    syncSiteRecruitList(s, 'hansui', state);
  });
  const yielded = sites.filter(function (s) { return s !== keep; })
    .map(function (s) { return s.name; }).join('、');
  state.flags.maSurrenderDone = true;
  state.flags.maSurrenderDay = 0;
  return true;
}

function dailyTick(state) {
  state.stats.days += 1;
  // 剧情/国战换旗后每天校正一次兵源牌，防止旧旗的招募池留在城头。
  refreshSiteRosters(state, false);
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
  // 直辖封地每七天一笔税；和每日城池收入分开结算
  fiefTaxTick(state);
  economy.dailyMarket(state, state.rng);
  trade.dailyGoods(state, state.rng);

  // 匪团补充：维持全图常驻数量（太少没得打，太多寸步难行）
  campRespawnTick(state);
  banditRespawnTick(state);
  refillBandits(state);
  // 剧情战略：阶段目标、宣战/议和文书、袁术称帝与三国循环
  story.tick(state);
  // 国战：谁跟谁翻了脸；牢里的人熬过一天
  war.diplomacyTick(state);
  war.peaceOfferTick(state);
  war.prisonerTick(state);
  // 马超归蜀这条线先走：他走了以后韩遂再动凉州，才是“马家被灭”的顺序。
  ensureMaChaoToShu(state);
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
  // 0 兵打散的领主：三天期满后悄悄到募兵最快的城，从零开始招募
  scatteredLordTick(state);

  // 领主在自己的城镇/村庄招兵：用独立的领主兵源池，和玩家招募互不冲突
  lordRestTick(state);
  lordRecruitTick(state);

  // 自立的人手下有领主：跟仇家自动开打，否则这些领主只会站着
  if (state.lords.some(function (l) { return l.faction === 'player' && l.alive; })) {
    Object.keys(FACTIONS).forEach(function (id) {
      if (id === 'player' || id === 'bandit') return;
      if (id === 'rebel' && !state.arc) return;
      if ((state.factionState[id] || {}).dead) return;
      if ((state.relations[id] || 0) <= -25 && !war.atWar(state, 'player', id)) {
        war.declare(state, 'player', id, true);
      }
    });
  }

  // 灭国：城丢光、人也没了，七天倒计时
  resolveMaSurrender(state);
  factionTick(state);
  // 玩家效忠的势力（包括 NPC 主公）打完全部要点，也要在这里触发统一背叛。
  if (!state.arc) checkVictory(state);
  // 统一之后的长夜：三十天大旱 / 再统一
  edgeFogTick(state);
  arcTick(state);
  // 玩家在陈留歇满一天，诸侯才开始互相宣战
  maybeStartDiplomacy(state);
}

/* ---------------------------------------------------------------- 主循环 */

function update(state, dtSeconds, opts) {
  if (state.gameOver) return;
  const ignoreEvents = !!(opts && opts.ignoreEvents);
  const idleTime = !!(opts && opts.idleTime);
  const dt = dtSeconds * (state.timeScale || 1);
  const p = state.player;
  settleUnitSteps(state);
  // 每帧顺手看看下一顿够不够；第一次不够就告警，别等到哗变才说
  warnFoodShortage(state);
  // 酒馆目标被乱军清剿后，任务与地图点位都要当场收掉
  checkQuestTargets(state);

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
    // 跟骑砍一样：玩家站着不动，时间就停；进城修养、城下围营或在营里
    // 让时辰自己走的时候，外面照常走。暂停出城后点了“继续时辰”，
    // 人也算在城外扎着营，时辰要接着走，否则按钮看着恢复、世界却仍是死的。
    if (isResting(state) || state.playerSiege || state.campFlow || idleTime) {
      advanceTime(state, dt / HOUR_SECONDS);
    }
    checkPursuit(state);
  }

  // 天下在动：只有游戏时间真正流逝了，NPC 才动
  const elapsed = state.hoursPending || 0;
  state.hoursPending = 0;
  state.npcClock += elapsed;
  // 每个时辰只推进一组 NPC 槽；领主改用自己的 nextMoveH 精确计时，
  // 这样普通 6 时辰/格、逃遁 5 时辰/格不必被 3 个时辰的槽切碎。
  while (state.npcClock >= 1) {
    state.npcClock -= 1;
    state.npcTick = (state.npcTick || 0) + 1;
    const slot = state.npcTick % NPC_SLOT_COUNT;
    moveParties(state, slot);
    moveLords(state);
    checkPursuit(state);
    // 国战、战役与任务检查仍按 3 个时辰一轮结算，避免改变战局节奏
    if (state.npcTick % NPC_SLOT_COUNT === 0) {
      war.fieldTick(state);
      if (war.siegeTick) war.siegeTick(state);
      advanceCampaign(state);
      checkQuestTargets(state);
      checkPlayerSiegeReady(state);
    }
    if (state.events.length && !ignoreEvents) return;
  }
  checkQuestTargets(state);
  checkPlayerSiegeReady(state);
  maybeStartDiplomacy(state);
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
  const all = state.parties.concat(state.lords.filter(function (l) {
    return l.alive && !l.scattered && !l.scatterHidden;
  }));
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
  const all = state.parties.concat(state.lords.filter(function (l) {
    return l.alive && !l.scattered && !l.scatterHidden;
  }));
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

/** 留人断后：折一部分兵，换他原地停几个时辰；西凉步卒只吃这一套，停八小时 */
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
        '西凉步卒追上来时，你身边已经没人可以留下断后。\n重甲踏过冻土，刀落下去。\n你的名字没有写进任何一本史书。',
        '剧终');
      return { ok: true, ended: true, msg: '无人断后。你被西凉步卒追杀，死在路上。' };
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
    // 断后成功后步卒不再主动追；只有玩家再贴到一格以内才会重新咬上来
    unit.dormant = true;
    pushLog(state, '你留下 ' + lose + ' 人断后。西凉步卒停下来收拾这队人，会在这里停八个时辰。', 'war');
    return {
      ok: true, lose: lose, pause: pause,
      msg: '折了 ' + lose + ' 人。西凉步卒在原地停 8 小时；之后除非你再贴到它脸上，否则不会再追。',
    };
  }
  pushLog(state, '你留下 ' + lose + ' 人断后。' + unit.name + '在原地收拾这队人，你趁这半天跑出去。', 'war');
  return { ok: true, lose: lose, pause: pause, msg: '折了 ' + lose + ' 人，他会在原地停 ' + pause + ' 小时，然后接着追。' };
}

/** 附近最近的活领主（匪团用来判断该不该跑） */function nearestLord(state, unit, range) {
  let best = null;
  let bestD = 1e9;
  state.lords.forEach(function (l) {
    if (!l.alive || l.inCity || l.prisoner || l.scattered || l.scatterHidden) return;
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
    if (questProtectedParty(state, q)) return;
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

/** NPC 的错峰槽位：同一支队伍仍然每 3 个时辰走一格，但全图不再同一帧一起算 */
function npcSlotFor(unit) {
  if (unit && unit.npcSlot !== undefined && unit.npcSlot !== null) return unit.npcSlot;
  const key = String((unit && (unit.id || unit.name)) || '0');
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  const slot = sum % NPC_SLOT_COUNT;
  if (unit) unit.npcSlot = slot;
  return slot;
}

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
function stepUnitTo(state, unit, step, hours, fromOverride) {
  const nowH = gameHours(state);
  const from = fromOverride || unitAnimPos(unit, nowH);
  const dist = Math.max(Math.abs(step.x - from.x), Math.abs(step.y - from.y));
  // 一格六时辰；若路径缓存/剧情落位仍递来两格以上的目标，
  // 动画时间至少按格数放大，避免“一格六时辰”却跨两格闪过去。
  const animHours = Math.max(hours || 0.4, dist > 1 ? dist * LORD_STEP_HOURS : 0);
  unit.stepFrom = from;
  unit.stepTo = { x: step.x, y: step.y };
  unit.stepStartH = nowH;
  unit.stepHours = Math.max(0.4, animHours);
  unit.x = step.x;
  unit.y = step.y;
  // 匪团每走一步就把所在州刷新，补员/统计才不会按出生州算旧账。
  if (unit.faction === 'bandit') {
    unit.region = regionAt(state.world, step.x, step.y);
  }
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

/** 附近兵力明显更强的领主：匪团和弱领主都要先躲 */
function strongerLordNear(state, unit, range) {
  let best = null;
  let bestScore = -Infinity;
  (state.lords || []).forEach(function (lord) {
    if (!lord.alive || lord.inCity || lord.prisoner || lord.dead) return;
    if (lord.id === unit.id) return;
    const d = Math.max(Math.abs(lord.x - unit.x), Math.abs(lord.y - unit.y));
    if (d > range) return;
    const a = Math.max(1, army.troopCount(unit.troops || {}));
    const b = Math.max(1, army.troopCount(lord.troops || {}));
    if (b < a * BANDIT_FLEE_RATIO || b - a < BANDIT_FLEE_GAP) return;
    const score = b - d * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = lord;
    }
  });
  return best;
}

/**
 * 匪团的州内巡游目标：不再围着脚下 5 格打转，
 * 而是在同一个州里挑一个 7~26 格外的空地，到了再换下一个。
 */
function chooseBanditTarget(state, party, opts) {
  const rng = state.rng;
  const world = state.world;
  const p = state.player;
  const o = opts || {};
  const homeRegion = banditHomeRegion(state, party);
  const threat = o.threat || null;
  let best = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 160; attempt++) {
    const x = rng.int(BANDIT_EDGE_MARGIN, world.w - 1 - BANDIT_EDGE_MARGIN);
    const y = rng.int(BANDIT_EDGE_MARGIN, world.h - 1 - BANDIT_EDGE_MARGIN);
    if (!banditSpotAllowed(state, x, y, homeRegion, party)) continue;
    const rid = regionAt(world, x, y);
    if (rid !== homeRegion) continue;
    const d = Math.max(Math.abs(x - party.x), Math.abs(y - party.y));
    if (d < BANDIT_ROAM_MIN) continue;
    if (d > (o.differentRegion ? 34 : BANDIT_ROAM_MAX)) continue;

    let nearestBandit = 999;
    state.parties.forEach(function (q) {
      if (q.faction !== 'bandit' || q === party) return;
      const bd = Math.max(Math.abs(x - q.x), Math.abs(y - q.y));
      if (bd < nearestBandit) nearestBandit = bd;
    });

    let score = (nearestBandit > 6 ? 7 : -5) + rng.random() * 4;
    if (o.differentRegion) {
      // 被领主追时，在同一个州里尽量往远处躲；不跨州。
      const td = threat ? Math.max(Math.abs(x - threat.x), Math.abs(y - threat.y)) : d;
      score += td * 0.45 - Math.abs(d - 15) * 0.35;
    } else {
      score -= Math.abs(d - 15) * 0.18;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { x: x, y: y, region: rid };
    }
  }
  if (best) return best;
  // 本州实在挑不到远点：往本州城镇附近挪，绝不出州或贴地图边。
  const spot = banditRegionSpot(state, homeRegion, party);
  return spot ? { x: spot.x, y: spot.y, region: homeRegion } : null;
}

/** 沿缓存路径走一步；没有路径就贪心一步，至少不会原地打转 */
function banditPathStep(state, party, target) {
  const sig = target.x + ',' + target.y;
  if (!party.roamPath || party.roamPathFor !== sig) {
    party.roamPath = findPath(state.world, { x: party.x, y: party.y }, target, { avoidSites: true });
    party.roamPathFor = sig;
    if (!party.roamPath) party.roamPath = [];
  }
  while (party.roamPath.length) {
    const next = party.roamPath[0];
    if (!next || !isPassable(state.world, next.x, next.y) ||
        siteAt(state.world, next.x, next.y) ||
        inBanditExclusion(next.x, next.y) ||
        unitOccupies(state, party, next.x, next.y) ||
        (party.roamRegion && regionAt(state.world, next.x, next.y) !== party.roamRegion)) {
      party.roamPath = null;
      party.roamPathFor = null;
      break;
    }
    party.roamPath.shift();
    return next;
  }
  return greedyStep(state, party, target);
}

/** 清掉旧档/多队互抢留下的“交战中”死锁：不互指、离太远、超时都解开 */
function releaseStuckBanditEngagements(state) {
  const nowH = gameHours(state);
  state.parties.forEach(function (party) {
    if (!party.engagedWith) return;
    const lord = (state.lords || []).filter(function (l) { return l.id === party.engagedWith; })[0];
    const since = party.engagedSinceH || (lord && lord.engagedSinceH) || nowH;
    const bad = !lord || !lord.alive || lord.prisoner || lord.inCity ||
      String(lord.engagedWith || '') !== 'party:' + party.id ||
      Math.max(Math.abs(lord.x - party.x), Math.abs(lord.y - party.y)) > 1 ||
      nowH - since > 18 || army.troopCount(party.troops || {}) <= 0;
    if (bad) {
      party.engagedWith = null;
      party.engagedSinceH = null;
      party.scuffle = Math.max(party.scuffle || 0, 3);
      party.pauseUntil = Math.max(party.pauseUntil || 0, nowH + 3);
      if (lord) clearLordEngagement(state, lord, 3);
    }
  });
  state.lords.forEach(function (lord) {
    if (String(lord.engagedWith || '').indexOf('party:') !== 0) return;
    const party = (state.parties || []).filter(function (q) { return q.id === String(lord.engagedWith).slice(6); })[0];
    const since = lord.engagedSinceH || nowH;
    // 指向一支不存在的队伍（旧档/临时标记）时先保留到超时，
    // 不要在下一次整点立刻把“已和别人交战”的领主解锁，否则会诱发抢交战对象。
    const ghost = !party;
    if ((ghost && nowH - since > 18) || (!ghost && (party.dead || !party.engagedWith)) ||
        nowH - since > 18) {
      clearLordEngagement(state, lord, 3);
    }
  });
}

function moveParties(state, slot) {
  const p = state.player;
  const nowH = gameHours(state);
  releaseStuckBanditEngagements(state);
  state.parties.forEach(function (party) {
    if (party.fieldBattleId) return;
    const isBandit = party.faction === 'bandit' && !party.scripted;
    // 匪团按 6.5 时辰一格走，比普通领主（6 时辰一格）慢，
    // 领主追杀时能逐步逼近；它们不受三槽错峰限制，靠 nextBanditMoveH 控制节奏。
    if (isBandit) {
      if (party.nextBanditMoveH && nowH < party.nextBanditMoveH) return;
      party.nextBanditMoveH = nowH + BANDIT_STEP_HOURS;
    } else if (slot !== undefined && npcSlotFor(party) !== slot) {
      return;
    }
    // 已经和某支队伍缠上：模型停在原地显示交战，不再滑走。
    // 注意：不能因为“领主明显更强”就自动解开交战，
    // 否则大军一贴身就被判定逃跑，永远打不起来。
    if (party.engagedWith) {
      const foe = state.lords.filter(function (l) { return l.id === party.engagedWith; })[0];
      if (!foe || !foe.alive || foe.prisoner || foe.inCity ||
          Math.max(Math.abs(foe.x - party.x), Math.abs(foe.y - party.y)) > 1 ||
          (party.engagedSinceH && nowH - party.engagedSinceH > 18)) {
        party.engagedWith = null;
        party.engagedSinceH = null;
        party.scuffle = Math.max(party.scuffle || 0, 3);
        party.pauseUntil = Math.max(party.pauseUntil || 0, nowH + 3);
        if (foe) clearLordEngagement(state, foe, 3);
      } else {
        return;
      }
    }
    // 断后/买路约好的停战时辰，匪团也必须遵守，否则刚断完后脚又贴上来
    if (party.pauseUntil && nowH < party.pauseUntil) {
      party.chasing = false;
      return;
    }
    // 缠斗结束后的余惊只是冷却，不是“还在交战”：逐槽清掉，避免地图上永远挂着交战中
    if (party.scuffle > 0) party.scuffle -= 1;
    if (party.slow) {
      party.tick = (party.tick || 0) + 1;
      if (party.tick % party.slow !== 0) return;
    }
    // 西凉步卒：只咬玩家，不跟领主互殴；断后之后除非玩家贴到脸上，否则原地不动
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

    // 匪团归属州：只在州内巡游，不跨州逃到地图边。
    const homeRegion = banditHomeRegion(state, party);
    const nowRegion = regionAt(state.world, party.x, party.y);
    if (isBandit && party.banditFleeRegion && party.banditFleeRegion !== homeRegion) {
      party.banditFleeRegion = homeRegion;
      party.banditFleeTarget = null;
    }
    if (isBandit && party.banditFleeRegion && nowRegion === party.banditFleeRegion) {
      party.banditFleeFrom = null;
      party.banditFleeRegion = null;
      party.banditFleeTarget = null;
      party.roamTarget = null;
      party.roamPath = null;
      party.roamPathFor = null;
    }

    // 被领主追上了：贴身就是开战，不再先掉头逃。
    // 这一步必须放在“附近有强领主就跑”之前：以前匪团一看到强领主就设 fleeTarget 跑路，
    // 领主永远追在身后一格，地图上看起来像在互相遛圈。
    if (isBandit) {
      const closeLord = nearestLord(state, party, 1);
      if (closeLord) {
        if (closeLord.engagedWith && closeLord.engagedWith !== 'party:' + party.id) {
          retreatFrom(state, party, closeLord);
          party.chasing = false;
          return;
        }
        if (party.engagedWith !== closeLord.id) {
          party.engagedSinceH = nowH;
          closeLord.engagedSinceH = nowH;
        }
        party.engagedWith = closeLord.id;
        party.engagedSinceH = party.engagedSinceH || nowH;
        party.pauseUntil = 0;
        party.scuffle = 0;
        party.banditFleeFrom = null;
        party.banditFleeTarget = null;
        party.banditFleeRegion = null;
        closeLord.engagedWith = 'party:' + party.id;
        closeLord.engagedSinceH = closeLord.engagedSinceH || nowH;
        closeLord.scuffle = 0;
        party.chasing = false;
        return;
      }
    }

    const threatLord = isBandit ? strongerLordNear(state, party, party.sight || 5) : null;
    if (isBandit && threatLord) {
      party.chasing = false;
      party.banditFleeFrom = threatLord.id;
      if (!party.banditFleeRegion || nowRegion === party.banditFleeRegion) {
        const fleeTarget = chooseBanditTarget(state, party, {
          differentRegion: true,
          threat: threatLord,
        });
        if (fleeTarget) {
          party.banditFleeRegion = fleeTarget.region;
          party.banditFleeTarget = fleeTarget;
          party.roamTarget = fleeTarget;
          party.roamPath = null;
          party.roamPathFor = null;
        }
      }
    }
    // 被领主吓到邻州：先沿路径往新州跑，到了再继续州内活动。
    if (isBandit && party.banditFleeFrom) {
      if (!party.banditFleeTarget || gridDistance(party, party.banditFleeTarget) <= 1) {
        const fleeTarget = chooseBanditTarget(state, party, {
          differentRegion: true,
          threat: threatLord || null,
        });
        if (fleeTarget) {
          party.banditFleeRegion = fleeTarget.region;
          party.banditFleeTarget = fleeTarget;
          party.roamTarget = fleeTarget;
          party.roamPath = null;
          party.roamPathFor = null;
        }
      }
      if (party.banditFleeTarget) {
        const step = banditPathStep(state, party, party.banditFleeTarget);
        if (step) {
          // 逃往邻州也不能踩地图边；宁可丢目标重新选。
          if (step.x < BANDIT_EDGE_MARGIN || step.y < BANDIT_EDGE_MARGIN ||
              step.x > state.world.w - 1 - BANDIT_EDGE_MARGIN ||
              step.y > state.world.h - 1 - BANDIT_EDGE_MARGIN) {
            party.banditFleeTarget = null;
            party.roamTarget = null;
            party.roamPath = null;
            party.roamPathFor = null;
            return;
          }
          stepUnitTo(state, party, step, BANDIT_STEP_HOURS);
        }
        return;
      }
      if (threatLord && retreatFrom(state, party, threatLord)) {
        party.chasing = false;
        return;
      }
    }

    // 已经贴上了：只有兵力明显更弱的匪团才跑，否则停住交给大战结算。
    const lord = nearestLord(state, party, 4);
    const hunter = !!(lord && lord.hunting && lord.banditChasing === party.id);
    if (lord && gridDistance(party, lord) <= 1) {
      const lordCount = army.troopCount(lord.troops || {});
      const partyCount = army.troopCount(party.troops || {});
      if (isBandit && lordCount >= partyCount * BANDIT_FLEE_RATIO && lordCount - partyCount >= BANDIT_FLEE_GAP) {
        party.banditFleeFrom = lord.id;
        party.banditFleeTarget = null;
        party.banditFleeRegion = null;
        retreatFrom(state, party, lord);
        party.chasing = false;
        return;
      }
      // 这位领主已经和别的匪团缠上了：不抢别人的交战对象，先退开，避免三支队伍互相覆盖 engagedWith。
      if (lord.engagedWith && lord.engagedWith !== 'party:' + party.id) {
        retreatFrom(state, party, lord);
        party.chasing = false;
        return;
      }
      // 已经贴上了就不跑了：停住，交给下面的大战结算。
      if (party.engagedWith !== lord.id) {
        party.engagedSinceH = nowH;
        lord.engagedSinceH = nowH;
      }
      party.engagedWith = lord.id;
      party.scuffle = 0;
      lord.engagedWith = 'party:' + party.id;
      lord.scuffle = 0;
      party.chasing = false;
      return;
    }
    if (isBandit && threatLord && retreatFrom(state, party, threatLord)) {
      party.chasing = false;
      party.engaged = false;
      return;
    }
    if (lord && !hunter && isBandit && retreatFrom(state, party, lord)) {
      party.chasing = false;
      party.engaged = false;
      return;
    }
    if (hunter) {
      party.chasing = false;
      return;
    }

    let target = null;
    let targetIsPlayer = false;
    if (isBandit) {
      const dist = gridDistance(party, p);
      const playerRegion = regionAt(state.world, p.x, p.y);
      const playerNearCity = banditTownDistance(state.world, p.x, p.y) <= BANDIT_CITY_RANGE;
      if (!isSafeResting(state) && !p.atSiteId && dist <= (party.sight || 5) &&
          playerRegion === homeRegion && playerNearCity &&
          isHostileFaction(state, party.faction)) {
        target = { x: p.x, y: p.y };
        targetIsPlayer = true;
        party.chasing = true;
      } else {
        if (!party.roamTarget || gridDistance(party, party.roamTarget) <= 1) {
          party.roamTarget = chooseBanditTarget(state, party, {
            region: homeRegion,
          });
          party.roamPath = null;
          party.roamPathFor = null;
        }
        target = party.roamTarget;
        party.chasing = false;
      }
    } else {
      // 兼容旧档里没有标记 scripted 的普通追兵
      const dist = gridDistance(party, p);
      if (!isSafeResting(state) && dist <= (party.sight || 5) && isHostileFaction(state, party.faction)) {
        target = { x: p.x, y: p.y };
        party.chasing = true;
      } else {
        if (!party.wander || gridDistance(party, party.wander) < 1) {
          party.wander = findFreeSpotNear(state, party.x, party.y, 5, party);
        }
        target = party.wander;
        party.chasing = false;
      }
    }
    if (!target) return;
    let step;
    if (isBandit && !targetIsPlayer) {
      step = banditPathStep(state, party, target);
    } else {
      step = greedyStep(state, party, target);
    }
    // 匪团不允许踩地图边缘，也不许从本州迈到别州：宁可停下重选州内目标。
    if (step && isBandit) {
      const edgeBad = step.x < BANDIT_EDGE_MARGIN || step.y < BANDIT_EDGE_MARGIN ||
        step.x > state.world.w - 1 - BANDIT_EDGE_MARGIN ||
        step.y > state.world.h - 1 - BANDIT_EDGE_MARGIN;
      const homeNow = regionAt(state.world, party.x, party.y) === homeRegion;
      const leavesHome = regionAt(state.world, step.x, step.y) !== homeRegion;
      if (edgeBad || (homeNow && leavesHome)) {
        party.roamTarget = null;
        party.roamPath = null;
        party.roamPathFor = null;
        return;
      }
    }
    if (step) {
      stepUnitTo(state, party, step, isBandit ? BANDIT_STEP_HOURS : NPC_STEP_HOURS * (party.slow || 1));
    } else if (isBandit && !targetIsPlayer) {
      // 目标被堵住/无路：换一处，别在一格上原地撞墙
      party.roamTarget = null;
      party.roamPath = null;
      party.roamPathFor = null;
    } else if (target === party.wander) {
      party.wander = null;
    }
  });

  // 路上相逢：匪团与领主互殴。等到三个槽都走完再统一结算，
  // 避免刚走完一组就提前把还没动的另一组判成“贴上了”。
  if (slot === undefined || slot === NPC_SLOT_COUNT - 1) {
    releaseStuckBanditEngagements(state);
    fightNeighbors(state);
  }
}

/** 按编制给领主补人：先补缺得最多的兵种；不超过等级带兵上限 */
function refillLord(lord, n) {
  const def = lord.defTroops || {};
  if (!lord.troops) lord.troops = {};
  const cap = lordTroopCap(lord);
  let left = Math.min(Math.max(0, Math.round(n)), Math.max(0, cap - army.troopCount(lord.troops)));
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
  // 客将在友军城里休整时，城里挂的是友军兵源牌；领主仍按本国编制补兵，
  // 不能因为“城里没有我国兵”就永远补不满。玩家招募不受影响。
  const list = (site.recruitList || []).slice();
  factionTroopIds(lord.faction).forEach(function (id) {
    if (list.indexOf(id) < 0) list.push(id);
    // 客城没有本国兵源库存时，至少给 1 个名额，别让客将永远补不满。
    if (!pool[id] && (lord.defTroops[id] || 0) > (lord.troops[id] || 0)) pool[id] = 1;
  });
  let left = Math.max(0, Math.round(quota));
  const cap = lordTroopCap(lord);
  left = Math.min(left, Math.max(0, cap - army.troopCount(lord.troops || {})));
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

/** 这个据点对某位领主算不算“自己人 / 友军”的地方 */
function siteFriendlyToLord(state, lord, site) {
  if (!site || !lord) return false;
  if (lord.faction === 'player' && site.playerOwned) return true;
  if (!site.ownerFaction) return false;
  if (site.ownerFaction === lord.faction) return true;
  if (site.ownerFaction === 'bandit' || site.ownerFaction === 'player') return false;
  return !war.atWar(state, lord.faction, site.ownerFaction);
}

/**
 * 据点募兵倍率：都城 2 倍、要地 1.5 倍、普通城 1 倍、村庄 0.5 倍。
 * 都城优先于要地：襄阳这种“既是都城又是要地”的城按 2 倍算。
 */
function siteRecoveryMultiplier(site) {
  if (!site) return 0;
  if (CAPITAL_IDS.indexOf(site.id) >= 0) return 2;
  if (STRATEGIC_SITES[site.id]) return 1.5;
  if (site.type === 'town' || site.type === 'castle') return 1;
  if (site.type === 'village') return 0.5;
  return 0;
}

/** 领主在某个据点每天补兵的实际比例；行军/巡逻途中只按两成。 */
function lordRecoveryRate(state, lord, site, stationary) {
  const mult = siteRecoveryMultiplier(site);
  if (!mult) return 0;
  const base = story.recruitRate(state, lord && lord.faction);
  return base * mult * lordRecruitMul(lord) * (stationary ? 1 : LORD_PATROL_RECRUIT_RATIO);
}

/**
 * 十五格内恢复最快的本方/友军城。先比恢复倍率，再比距离；
 * 正在被敌军围攻的城不作为首选，避免领主一头撞进围城战场。
 */
function bestRecoveryCity(state, lord, maxDist) {
  const range = maxDist || LORD_RECOVERY_SEARCH_RANGE;
  let best = null;
  (state.world.sites || []).forEach(function (site) {
    if (site.type !== 'town' && site.type !== 'castle') return;
    if (!siteFriendlyToLord(state, lord, site)) return;
    const d = gridDistance(lord, site);
    if (d > range) return;
    const besieged = !!(site.siegeStatus && site.siegeFaction &&
      war.atWar(state, lord.faction, site.siegeFaction));
    if (besieged && best && !best.besieged) return;
    const mult = siteRecoveryMultiplier(site);
    if (!best || mult > best.mult || (mult === best.mult && d < best.d) ||
        (mult === best.mult && d === best.d && !besieged && best.besieged)) {
      best = { site: site, d: d, mult: mult, besieged: besieged };
    }
  });
  return best;
}

/** 打散后落脚的城：全图募兵最快的本方/友军城，不限十五格。 */
function fastestRecoveryCity(state, lord) {
  const all = (state.world.sites || []).filter(function (s) {
    return (s.type === 'town' || s.type === 'castle') && siteFriendlyToLord(state, lord, s);
  });
  let best = null;
  all.forEach(function (site) {
    const mult = siteRecoveryMultiplier(site);
    const d = gridDistance(lord, site);
    const besieged = !!(site.siegeStatus && site.siegeFaction &&
      war.atWar(state, lord.faction, site.siegeFaction));
    if (!best || mult > best.mult || (mult === best.mult && d < best.d) ||
        (mult === best.mult && d === best.d && !besieged && best.besieged)) {
      best = { site: site, d: d, mult: mult, besieged: besieged };
    }
  });
  return best;
}

/** 城是否正被敌军/玩家围攻：用于打散领主“哪怕没招满也可以出城”的唯一例外。 */
function siteUnderAttack(state, lord, site) {
  if (!site) return false;
  if (state.playerSiege && state.playerSiege.siteId === site.id) return true;
  if (site.siegeStatus && site.siegeFaction &&
      war.atWar(state, lord.faction, site.siegeFaction)) return true;
  return Object.keys(state.warCampaigns || {}).some(function (faction) {
    const cp = state.warCampaigns[faction];
    return cp && cp.targetId === site.id && (cp.stage === 'siege' || cp.stage === 'assault') &&
      war.atWar(state, lord.faction, faction);
  });
}

/** 打散后的本土落点：优先原封地/家乡，丢了就找本势力最近的城，再退到村。 */
function scatteredHomeSite(state, lord) {
  if (!state || !lord) return null;
  const sites = state.world && state.world.sites ? state.world.sites : [];
  function own(site) {
    if (!site) return false;
    if (lord.faction === 'player') return !!site.playerOwned;
    return site.ownerFaction === lord.faction;
  }
  const want = siteById(state.world, lord.scatterHomeId || lord.home);
  if (own(want)) return want;
  let best = null;
  let bestD = 999;
  sites.forEach(function (s) {
    if (!own(s) || (s.type !== 'town' && s.type !== 'castle')) return;
    const d = gridDistance(lord, s);
    if (d < bestD) { bestD = d; best = s; }
  });
  if (best) return best;
  sites.forEach(function (s) {
    if (!own(s) || s.type !== 'village') return;
    const d = gridDistance(lord, s);
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

/** 离领主最近的、能进去歇脚的友好城镇。优先城/关，府里能看到人。 */
function nearestFriendlySite(state, lord, maxDist) {
  const sites = state.world.sites.filter(function (s) {
    return (s.type === 'town' || s.type === 'castle') && siteFriendlyToLord(state, lord, s);
  });
  let best = null;
  let bestD = maxDist || 99;
  sites.forEach(function (s) {
    const d = gridDistance(lord, s);
    if (d <= bestD) { bestD = d; best = s; }
  });
  // 八格内没有城也继续找：城主府比村口更适合养兵，别让人卡在村外。
  if (!best) {
    sites.forEach(function (s) {
      const d = gridDistance(lord, s);
      if (!best || d < bestD) { bestD = d; best = s; }
    });
  }
  return best;
}

function enterLordCity(state, lord, site) {
  if (!lord || !site) return false;
  // 只有城/关才有领主府；村子和贼巢只作路过，不把人收进去。
  if (site.type !== 'town' && site.type !== 'castle') return false;
  // 必须走到城池中心那一格才收旗进城，城门外一格不算进门。
  if (lord.x !== site.x || lord.y !== site.y) return false;
  lord.stepFrom = null;
  lord.stepTo = null;
  lord.stepStartH = null;
  lord.stepHours = null;
  lord.inCity = site.id;
  lord.resting = true;
  lord.chasing = false;
  lord.hunting = false;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleeFrom = null;
  lord.foeChasing = null;
  lord.banditChasing = null;
  lord.wander = null;
  lord.patrolPath = null;
  lord.fleePath = null;
  lord.fleePathFor = null;
  lord.enteringSiteId = null;
  lord.cityEnterAtH = null;
  lord.orderDetourTarget = null;
  // 进城不清补兵目标：到了目标城就守住这个选择，别一进门又嫌别处更快，
  // 再次出城，形成 A—B—A 的来回跑。
  pushLog(state, lord.name + '带人进了' + site.name + '，旗卷起来，歇在城里。');
  return true;
}

/**
 * 领主在城门外一格开始最后半步：先把动画走向城中心，
 * 等满 LORD_ENTER_CITY_HOURS 才把数据坐标落到中心并收旗。
 * 靠近城门一格不等于进城，只有中心格才写 inCity。
 */
function beginLordCityEntry(state, lord, site, hours) {
  if (!lord || !site) return false;
  if (lord.x === site.x && lord.y === site.y) return enterLordCity(state, lord, site);
  if (Math.max(Math.abs(lord.x - site.x), Math.abs(lord.y - site.y)) !== 1) return false;
  const nowH = gameHours(state);
  const from = unitAnimPos(lord, nowH);
  lord.enteringSiteId = site.id;
  lord.cityEnterAtH = nowH + hours;
  lord.stepFrom = { x: from.x, y: from.y };
  lord.stepTo = { x: site.x, y: site.y };
  lord.stepStartH = nowH;
  lord.stepHours = hours;
  // 数据坐标仍停在城门外，等走完最后半步再落中心。
  lord.nextMoveH = nowH + hours;
  return true;
}

function leaveLordCity(state, lord, reason) {
  const site = siteById(state.world, lord.inCity);
  const wasHidden = !!lord.scatterHidden;
  if (!site) {
    lord.inCity = null;
    lord.resting = false;
    lord.scatterRecovering = false;
    lord.scatterHidden = false;
    return;
  }
  lord.inCity = null;
  lord.resting = false;
  lord.scatterRecovering = false;
  lord.scatterHidden = false;
  lord.chasing = false;
  lord.hunting = false;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleeFrom = null;
  lord.wander = null;
  lord.patrolPath = null;
  lord.fleePath = null;
  lord.fleePathFor = null;
  lord.enteringSiteId = null;
  lord.cityEnterAtH = null;
  lord.orderDetourTarget = null;
  lord.routePath = null;
  lord.routePathFor = null;
  lord.patrolPath = null;
  lord.recoveryTargetId = null;
  // 出城只挪到城边一格，并按一步 6 时辰做插值；
  // 不做“从城中心直接闪到三格外的空地”。
  // 同城几位领主一起出城时，贴身一圈可能全被友军占住；这时往两格、三格外找，
  // 绝不能退回城中心——否则下一拍又被判成“踩在城中心”，当场收旗进城，形成出出进进。
  const spot = findFreeSpotNear(state, site.x, site.y, 1, lord) ||
    findFreeSpotNear(state, site.x, site.y, 2, lord) ||
    findFreeSpotNear(state, site.x, site.y, 3, lord);
  if (!spot) {
    // 三圈都满了：这次先留在城里，等有空位再出，不要假装出城又立刻回城。
    lord.inCity = site.id;
    lord.resting = true;
    lord.nextMoveH = gameHours(state) + 1;
    return;
  }
  const nowH = gameHours(state);
  stepUnitTo(state, lord, spot, LORD_STEP_HOURS, { x: site.x, y: site.y });
  lord.nextMoveH = nowH + LORD_STEP_HOURS;
  if (reason && !wasHidden) pushLog(state, lord.name + '从' + site.name + '里出来，重新竖起旗。');
}

/** 每天检查打散的队伍：三天期满后悄悄送到募兵最快的城，从零开始收兵。 */
function scatteredLordTick(state) {
  const day = state.clock.day;
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.prisoner || !lord.scattered) return;
    // 玩家旧部不在叛军城里复活，也不等三天：打散后直接回边陲小镇驿站。
    if (state.arc && state.arc.phase !== 'done' && border.isLoyalLord(state, lord)) {
      border.sendToStation(state, lord);
      return;
    }
    if (day < (lord.respawnDay || 999999)) return;
    const target = fastestRecoveryCity(state, lord);
    if (!target || !target.site) return; // 本方已经没有可募兵的城，等换旗/灭国逻辑处理
    const site = target.site;
    lord.scattered = false;
    lord.scatterUntilH = 0;
    lord.respawnDay = 0;
    lord.scatterCityId = site.id;
    lord.x = site.x;
    lord.y = site.y;
    lord.inCity = site.id;
    lord.scatterRecovering = true;
    // 三天招兵期间对玩家完全不可见：不画地图模型，不进城池领主列表，也不发战报。
    lord.scatterHidden = true;
    lord.troops = {};
    lord.resting = true;
    lord.nextMoveH = gameHours(state);
    lord.fleeing = false;
    lord.chasing = false;
    lord.hunting = false;
    lord.order = null;
    lord.defending = null;
  });
}

/** 每天让停在城里、城下等候或村口歇脚的领主补一点兵；兵源与玩家分开 */
function lordRecruitTick(state) {
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.prisoner) return;
    // 驿站旧部在等玩家来领，不算“驻城募兵”。
    if (lord.borderStation) return;
    // 打散的队伍由 scatteredLordTick 统一送回最快的城，三天后从零招募；
    // 在别处等待期间不能靠“就近友城”提前补兵。逃窜（≥1 兵）不在此列。
    if (lord.scattered) return;
    let site = lord.inCity ? siteById(state.world, lord.inCity) : null;
    if (!site) {
      // 城外等候、村口歇脚也能招兵：只要模型贴着自家/友军的据点。
      site = (state.world.sites || []).filter(function (s) {
        if (s.type !== 'town' && s.type !== 'castle' && s.type !== 'village') return false;
        if (Math.max(Math.abs(s.x - lord.x), Math.abs(s.y - lord.y)) > 1) return false;
        return siteFriendlyToLord(state, lord, s);
      })[0] || null;
    }
    if (!site) return;
    if (lord.inCity && (site.type !== 'town' && site.type !== 'castle')) return;
    if (!siteFriendlyToLord(state, lord, site)) return;
    // 榜单领主按榜单 cap 满编；刘备作为入川主帅也按等级上限保持满编，
    // 其余普通领主仍以自身编制为满员目标，不能因等级上限高于编制而卡在城里招不满。
    const full = (lordPowerInfo(lord) || lord.id === 'liubei')
      ? lordTroopCap(lord)
      : Math.min(army.troopCount(lord.defTroops || {}), lordTroopCap(lord));
    const now = army.troopCount(lord.troops || {});
    if (full <= 0 || now >= full) return;
    // 驻城/驻在村口按据点倍率补兵；行军巡逻路过只按两成。
    const stationary = !!lord.inCity ||
      (!!lord.resting && Math.max(Math.abs(site.x - lord.x), Math.abs(site.y - lord.y)) <= 1);
    const rate = lordRecoveryRate(state, lord, site, stationary);
    const quota = Math.max(1, Math.round((full - now) * rate));
    recruitLordFromSite(state, lord, site, quota);
  });
}

/** 复国阶段的叛军巡逻：自己城优先，其次无人巡逻，再其次人最少，满五进首都。 */
function rebelPatrolSite(state, lord) {
  const sites = (state.world.sites || []).filter(function (s) {
    return (s.type === 'town' || s.type === 'castle') && s.ownerFaction === 'rebel';
  });
  if (!sites.length) return null;
  const counts = {};
  (state.lords || []).forEach(function (l) {
    if (!l || l === lord || !l.alive || l.dead || l.faction !== 'rebel') return;
    if (l.patrolSiteId) counts[l.patrolSiteId] = (counts[l.patrolSiteId] || 0) + 1;
  });
  const home = siteById(state.world, lord.home);
  if (home && home.ownerFaction === 'rebel' && (counts[home.id] || 0) < 5) {
    lord.patrolSiteId = home.id;
    return home;
  }
  const empty = sites.filter(function (s) { return !counts[s.id]; });
  if (empty.length) {
    empty.sort(function (a, b) { return (b.garrisonBase || 0) - (a.garrisonBase || 0); });
    lord.patrolSiteId = empty[0].id;
    return empty[0];
  }
  const least = sites.slice().sort(function (a, b) {
    return (counts[a.id] || 0) - (counts[b.id] || 0) || (b.garrisonBase || 0) - (a.garrisonBase || 0);
  })[0];
  if (least && (counts[least.id] || 0) < 5) {
    lord.patrolSiteId = least.id;
    return least;
  }
  // 全国每座城都已满五名领主：进首都。
  const capital = siteById(state.world, 'luoyang') || siteById(state.world, 'ye') || sites[0];
  if (capital) lord.patrolSiteId = capital.id;
  return capital;
}

/** 每名领主先选一处主城当巡逻锚点，再按 id 排独立的三城路线 */
function patrolSiteFor(state, lord) {
  if (!lord) return null;
  if (lord.faction === 'rebel' && state.arc && state.arc.phase === 'reconquest') {
    return rebelPatrolSite(state, lord);
  }
  const sites = state.world.sites || [];
  const fief = sites.filter(function (s) { return s.lordId === lord.id; })[0];
  if (fief) return fief;
  const own = sites.filter(function (s) {
    if (s.type !== 'town' && s.type !== 'castle') return false;
    return lord.faction === 'player' ? !!s.playerOwned : s.ownerFaction === lord.faction;
  });
  if (!own.length) return siteById(state.world, lord.home);
  if (lord.patrolSiteId) {
    const cached = own.filter(function (s) { return s.id === lord.patrolSiteId; })[0];
    if (cached) return cached;
  }
  // 按领主 id 取一个固定起点，再避开别人已经占的巡逻城。
  const used = {};
  state.lords.forEach(function (l) {
    if (l !== lord && l.patrolSiteId) used[l.patrolSiteId] = true;
  });
  let h = 0;
  for (let i = 0; i < lord.id.length; i++) h = (h * 31 + lord.id.charCodeAt(i)) % 9973;
  for (let i = 0; i < own.length; i++) {
    const cand = own[(h + i) % own.length];
    if (!used[cand.id]) {
      lord.patrolSiteId = cand.id;
      return cand;
    }
  }
  // 城不够分的时候也只能共用，但路线仍旧各自错开。
  lord.patrolSiteId = own[h % own.length].id;
  return own[h % own.length];
}

/** 领主 id 的稳定散列，保证同一名领主每次重算路线都得到同一条。 */
function lordHash(lord, salt) {
  let h = 17;
  const text = String((lord && lord.id) || 'lord') + '|' + salt;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100003;
  return h;
}

/** 每一名领主有一条自己的巡逻路线：主城 + 另外两座本城，循环走，不在原地抽点。 */
function patrolRouteFor(state, lord) {
  if (!lord) return [];
  const anchor = patrolSiteFor(state, lord);
  if (!anchor) return [];
  // 巡逻锚点换了城，旧的三城路线就作废，否则会一直绕回老城。
  if (Array.isArray(lord.patrolRouteIds) && lord.patrolRouteIds.length &&
      lord.patrolRouteIds[0] !== anchor.id) {
    lord.patrolRouteIds = null;
    lord.patrolIdx = null;
  }

  const cities = (state.world.sites || []).filter(function (s) {
    if (s.type !== 'town' && s.type !== 'castle') return false;
    return lord.faction === 'player' ? !!s.playerOwned : s.ownerFaction === lord.faction;
  });

  // 旧档里的路线可能因城头换旗失效，先筛一遍。
  if (Array.isArray(lord.patrolRouteIds) && lord.patrolRouteIds.length) {
    const keep = [];
    lord.patrolRouteIds.forEach(function (id) {
      const s = siteById(state.world, id);
      if (s && (s.type === 'town' || s.type === 'castle')) keep.push(s);
    });
    if (keep.length >= 2) {
      if (lord.patrolIdx === undefined || lord.patrolIdx === null || lord.patrolIdx >= keep.length) {
        lord.patrolIdx = lordHash(lord, 'start') % keep.length;
      }
      return keep;
    }
  }

  const route = [anchor];
  const pool = cities.filter(function (s) { return s.id !== anchor.id; });
  if (pool.length) {
    const offset = lordHash(lord, 'route') % pool.length;
    const step = 1 + (lordHash(lord, 'step') % Math.max(1, pool.length - 1));
    for (let i = 0; i < pool.length && route.length < 3; i++) {
      const cand = pool[(offset + i * step) % pool.length];
      if (!cand || route.some(function (s) { return s.id === cand.id; })) continue;
      route.push(cand);
    }
  }
  lord.patrolRouteIds = route.map(function (s) { return s.id; });
  lord.patrolIdx = lordHash(lord, 'start') % route.length;
  return route;
}

/** 一座城池的巡逻路线条数：普通城 5 条，大城 9 条。
 *  这里的“路线”指绕城巡逻的一串短路径点，不是领主跨城的主路线。 */
function patrolRouteCount(site) {
  if (!site) return 5;
  // 叛军每城固定五条巡视路线，大城也不再各自拉到九条。
  if (site.ownerFaction === 'rebel') return 5;
  // 新野是刘备唯一的新城，城不大但四面都要巡；给十条远近相交的路线，
  // 让守将既能贴着城根绕，也能走到外围的远点，不被固定一条线。
  if (site.id === 'xinye') return 10;
  return (site.garrisonBase || 0) >= 130 ? 9 : 5;
}

/** 城郊可站的巡逻点：按同心圈取，尽量围着城转，而不是全挤在一条直线上。 */
function patrolWaypointRing(state, site) {
  const world = state.world;
  const out = [];
  // 新野要给十条远近相交的路线，外圈放宽到六格；普通城仍保持 2~4 格。
  const maxR = site && site.id === 'xinye' ? 6 : 4;
  for (let r = 2; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = site.x + dx;
        const y = site.y + dy;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const tile = world.tiles[y * world.w + x];
        if (tile === 'river' || tile === 'sea') continue;
        if (!isPassable(world, x, y)) continue;
        if (siteAt(world, x, y)) continue;
        out.push({ x: x, y: y });
      }
    }
  }
  return out;
}

/**
 * 新野专用巡逻路线：十条按角度铺出去，长短圈交替。
 * 偶数条偏外圈（3~5 格的远点），奇数条偏内圈（2 格左右的近点）；
 * 每条再取三个相隔 120° 的方向，路线之间会自然交叉，不会十个人挤一条线。
 */
function xinyePatrolRoutes(state, site, usable) {
  const routes = [];
  if (!usable.length) return routes;
  const TAU = Math.PI * 2;
  const used = {};

  function pick(points, angle, radius) {
    let best = null;
    let bestScore = Infinity;
    usable.forEach(function (p) {
      if (points.some(function (q) { return q.x === p.x && q.y === p.y; })) return;
      const dx = p.x - site.x;
      const dy = p.y - site.y;
      const r = Math.max(Math.abs(dx), Math.abs(dy));
      let da = Math.abs(Math.atan2(dy, dx) - angle);
      if (da > Math.PI) da = TAU - da;
      const radial = Math.abs(r - radius);
      // 角度优先；同一点被前面路线用得多，就轻微降权，十条不会挤成同一条。
      const key = p.x + ',' + p.y;
      const repeat = used[key] || 0;
      const score = da * 2.2 + radial * 0.7 + repeat * 0.11;
      if (score < bestScore) { bestScore = score; best = p; }
    });
    return best;
  }

  for (let i = 0; i < 10; i++) {
    const base = i * TAU / 10 + (i % 2 ? 0.12 : 0);
    const farFirst = i % 2 === 0;
    const radii = farFirst ? [3.8, 2.0, 3.8] : [2.0, 3.8, 2.0];
    const points = [];
    for (let k = 0; k < 3; k++) {
      const p = pick(points, base + TAU * k / 3, radii[k]);
      if (p) points.push({ x: p.x, y: p.y });
    }
    if (!points.length) points.push({ x: usable[i % usable.length].x, y: usable[i % usable.length].y });
    points.forEach(function (p) {
      const key = p.x + ',' + p.y;
      used[key] = (used[key] || 0) + 1;
    });
    routes.push(points);
  }

  // 极端窄城（可用落脚点只有五六格）仍可能撞出同一条；用未重复的三点组合补开。
  const seen = {};
  for (let i = 0; i < routes.length; i++) {
    let sig = routes[i].map(function (p) { return p.x + ',' + p.y; }).join('|');
    if (!seen[sig]) { seen[sig] = true; continue; }
    let alt = null;
    for (let a = 0; a < usable.length && !alt; a++) {
      for (let b = a + 1; b < usable.length && !alt; b++) {
        for (let c = b + 1; c < usable.length && !alt; c++) {
          const cand = [usable[a], usable[b], usable[c]];
          const csig = cand.map(function (p) { return p.x + ',' + p.y; }).join('|');
          if (!seen[csig]) {
            alt = cand.map(function (p) { return { x: p.x, y: p.y }; });
            seen[csig] = true;
          }
        }
      }
    }
    if (alt) routes[i] = alt;
  }
  return routes;
}

/** 每座城生成 5/9 条互不相同的短巡逻路线（每条 3 个谷口/城外落脚点）。
 *  同一座城的不同路线会轮换，领主不会每次都绕同一圈。 */
function patrolRoutesForSite(state, site) {
  // 城头换旗会改变路线条数（叛军城固定 5 条），缓存键必须带上旗色。
  const key = (site.id || (site.x + ',' + site.y)) + ':' + (site.ownerFaction || '') + ':' + (site.garrisonBase || 0);
  state._patrolRoutes = state._patrolRoutes || {};
  const cached = state._patrolRoutes[key];
  if (cached && cached.w === state.world.w && cached.h === state.world.h) return cached.routes;

  const ring = patrolWaypointRing(state, site);
  const field = pathFieldFor(state, { x: site.x, y: site.y, siteId: site.id });
  let usable = ring.filter(function (p) {
    return field.dist[p.y * state.world.w + p.x] !== 0xffff;
  });
  if (usable.length < 5) {
    // 城被山水夹住时，补上贴身的一圈；至少保证同一座城能排出几条不同走法。
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = site.x + dx;
          const y = site.y + dy;
          if (x < 0 || y < 0 || x >= state.world.w || y >= state.world.h) continue;
          const tile = state.world.tiles[y * state.world.w + x];
          if (tile === 'river' || tile === 'sea') continue;
          if (!isPassable(state.world, x, y) || siteAt(state.world, x, y)) continue;
          if (field.dist[y * state.world.w + x] === 0xffff) continue;
          usable.push({ x: x, y: y });
        }
      }
    }
  }
  // 去重，顺序按绕城角度排，路线更自然。
  const seen = {};
  usable = usable.filter(function (p) {
    const k = p.x + ',' + p.y;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }).sort(function (a, b) {
    return Math.atan2(a.y - site.y, a.x - site.x) - Math.atan2(b.y - site.y, b.x - site.x);
  });
  if (usable.length < 2) {
    // 极端孤城：至少给一个贴城落脚点，领主仍会沿路线出门，不会卡死在城门。
    const fallback = findFreeSpotNear(state, site.x, site.y, 2, { x: site.x, y: site.y });
    usable = fallback ? [fallback] : [{ x: site.x + 1, y: site.y }];
  }

  const count = patrolRouteCount(site);
  if (site.id === 'xinye' && site.ownerFaction !== 'rebel') {
    const routes = xinyePatrolRoutes(state, site, usable);
    state._patrolRoutes[key] = { w: state.world.w, h: state.world.h, routes: routes };
    return routes;
  }
  const routes = [];
  for (let i = 0; i < count; i++) {
    const points = [];
    if (usable.length >= 3) {
      const gap = Math.max(1, Math.floor(usable.length / 3));
      const start = (i * Math.max(1, Math.min(3, usable.length - 2))) % usable.length;
      for (let k = 0; k < 3; k++) {
        const p = usable[(start + k * gap) % usable.length];
        if (!points.some(function (q) { return q.x === p.x && q.y === p.y; })) {
          points.push({ x: p.x, y: p.y });
        }
      }
      if (!points.length) points.push({ x: usable[start].x, y: usable[start].y });
    } else {
      points.push({ x: usable[i % usable.length].x, y: usable[i % usable.length].y });
    }
    routes.push(points);
  }
  state._patrolRoutes[key] = { w: state.world.w, h: state.world.h, routes: routes };
  return routes;
}

/** 领主进入某城巡逻圈后，按访问序号换一条本城路线。 */
function patrolLoopFor(state, lord, site) {
  const routes = patrolRoutesForSite(state, site);
  if (!routes.length) return [];
  const variant = ((lord.patrolVisitSeq || 0) + lordHash(lord, 'walk') + (lord.patrolLoopVariant || 0)) % routes.length;
  lord.patrolLoopSite = site.id || (site.x + ',' + site.y);
  lord.patrolLoopVariant = variant;
  lord.patrolLoopIdx = 0;
  lord.patrolLoop = routes[variant].map(function (p) { return { x: p.x, y: p.y }; });
  return lord.patrolLoop;
}

/** 到了一条巡逻路线的落脚点之后：先绕完本城，再换下一座城和另一条路线。 */
function advancePatrolLeg(state, lord) {
  const route = patrolRouteFor(state, lord);
  const targetSite = route.length ? route[Math.min(lord.patrolIdx || 0, route.length - 1)] : null;
  if (!targetSite) return false;
  if (!Array.isArray(lord.patrolLoop) || !lord.patrolLoop.length ||
      lord.patrolLoopSite !== (targetSite.id || (targetSite.x + ',' + targetSite.y))) {
    patrolLoopFor(state, lord, targetSite);
  }
  if (lord.patrolLoopIdx + 1 < (lord.patrolLoop ? lord.patrolLoop.length : 0)) {
    lord.patrolLoopIdx += 1;
    return true;
  }
  // 本城这一圈走完：换下一个城，并让下一城换一条不同路线。
  if (route.length > 1) lord.patrolIdx = ((lord.patrolIdx || 0) + 1) % route.length;
  else lord.patrolIdx = 0;
  lord.patrolVisitSeq = (lord.patrolVisitSeq || 0) + 1;
  lord.patrolLoop = null;
  lord.patrolLoopSite = null;
  lord.patrolLoopIdx = 0;
  return true;
}

/** 当前要去的巡逻点：优先使用本城路线中的郊外落脚点，不再直接杵在城门口。 */
function patrolTargetFor(state, lord) {
  const route = patrolRouteFor(state, lord);
  if (!route.length) return null;
  if (lord.patrolIdx === undefined || lord.patrolIdx === null) {
    lord.patrolIdx = lordHash(lord, 'start') % route.length;
  }
  if (lord.patrolIdx >= route.length) lord.patrolIdx = 0;
  const site = route[lord.patrolIdx];
  if (!site) return null;
  if (!Array.isArray(lord.patrolLoop) || !lord.patrolLoop.length ||
      lord.patrolLoopSite !== (site.id || (site.x + ',' + site.y))) {
    patrolLoopFor(state, lord, site);
  }
  const loop = lord.patrolLoop || [];
  if (!loop.length) return null;
  const point = loop[(lord.patrolLoopIdx || 0) % loop.length];
  return { x: point.x, y: point.y, patrolSite: site.id, patrolWaypoint: true };
}

/** 领主歇在城里：兵慢慢长；满员且没有军令，就出门巡自己的封地 */
function lordRestTick(state) {
  state.lords.forEach(function (lord) {
    if (!lord.alive || lord.prisoner || !lord.inCity) return;
    const site = siteById(state.world, lord.inCity);
    if (!site || !siteFriendlyToLord(state, lord, site)) {
      leaveLordCity(state, lord, '城头换了旗');
      return;
    }
    // 有军令（集结 / 围城 / 守城）就出城；但兵太少时先留在城里招兵，不跟着去送。
    // 榜单领主按榜单 cap 满编；普通领主仍按原编制判定低兵。
    const full = (lordPowerInfo(lord) || lord.id === 'liubei')
      ? lordTroopCap(lord)
      : Math.min(army.troopCount(lord.defTroops || {}), lordTroopCap(lord));
    const now = army.troopCount(lord.troops || {});
    const low = now < Math.max(6, Math.ceil(full * LORD_RECOVERY_RATIO));
    if (lord.order && lord.order.siteId) {
      if (low) {
        // 兵还没补到三分之二：不管军令是集结还是去守别城，都先留在城里补人。
        // 以前守城令会让他带四十人出城，下一拍又被“门口这座城”吸回来，
        // 于是整座城的领主一起出出进进。
        if (lord.order.type !== 'defend') {
          lord.order = null;
          lord.defending = null;
        }
        return;
      }
      if (lord.order.hold && lord.order.siteId === lord.inCity) {
        // 守城令就在本城：留在城里补兵，不算抗令
        return;
      }
      leaveLordCity(state, lord, '军令到了');
      return;
    }
    // 兵少时优先招兵，不出去巡逻
    if (low) return;
    if (full > 0 && now >= Math.max(1, Math.ceil(full * LORD_RECOVERY_RATIO)) &&
        state.rng.next() < 0.5) {
      leaveLordCity(state, lord);
      // 出城后从自己的巡逻路线接上；同一座城每次换一条郊外路线，
      // 只有一座城的领主也能沿本城路线走动，不会没有 wander 卡在城里。
      lord.wander = null;
      const route = patrolRouteFor(state, lord);
      if (route.length) {
        if (route.length > 1) lord.patrolIdx = ((lord.patrolIdx || 0) + 1) % route.length;
        else lord.patrolIdx = 0;
        lord.patrolVisitSeq = (lord.patrolVisitSeq || 0) + 1;
        lord.patrolLoop = null;
        lord.patrolLoopSite = null;
        lord.patrolLoopIdx = 0;
        lord.wander = patrolTargetFor(state, lord);
        lord.patrolPath = null;
      }
    }
  });
}

/**
 * 巡逻/逃遁用的短路径：绕过河流、山脊和城池。
 * 地形是静态的，所以按目标城缓存一张距离场：同城所有领主只算一次，
 * 后面每时辰只是沿着距离场下坡，不再反复 BFS 全图。
 */
const PATH_DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function pathBlockedMask(state) {
  const w = state.world.w;
  const h = state.world.h;
  let rec = state._pathBlocked;
  if (rec && rec.w === w && rec.h === h) return rec;
  const size = w * h;
  const mask = new Uint8Array(size);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isPassable(state.world, x, y) || siteAt(state.world, x, y)) {
        mask[y * w + x] = 1;
      }
    }
  }
  rec = { w: w, h: h, mask: mask };
  state._pathBlocked = rec;
  return rec;
}

function pathFieldFor(state, target) {
  const w = state.world.w;
  const h = state.world.h;
  const key = target.patrolWaypoint ? 'w:' + target.x + ',' + target.y :
    (target.patrolSite || target.siteId || (target.x + ',' + target.y));
  state._pathFields = state._pathFields || {};
  const old = state._pathFields[key];
  if (old && old.w === w && old.h === h) return old;

  const size = w * h;
  const blocked = pathBlockedMask(state).mask;
  // Uint16 够装 20k 格以内，65535 表示还没访问
  const dist = new Uint16Array(size);
  dist.fill(0xffff);
  const queue = new Int32Array(size);
  let qh = 0;
  let qt = 0;
  // 目标城本身不可走，从它周围八个可走格出发做距离场
  for (let d = 0; d < 8; d++) {
    const nx = target.x + PATH_DIRS[d][0];
    const ny = target.y + PATH_DIRS[d][1];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const idx = ny * w + nx;
    if (blocked[idx] || dist[idx] !== 0xffff) continue;
    dist[idx] = 0;
    queue[qt++] = idx;
  }
  while (qh < qt) {
    const cur = queue[qh++];
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const nd = dist[cur] + 1;
    for (let d = 0; d < 8; d++) {
      const nx = cx + PATH_DIRS[d][0];
      const ny = cy + PATH_DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nidx = ny * w + nx;
      if (blocked[nidx] || dist[nidx] !== 0xffff) continue;
      dist[nidx] = nd;
      queue[qt++] = nidx;
    }
  }
  const rec = { w: w, h: h, dist: dist };
  state._pathFields[key] = rec;
  const keys = Object.keys(state._pathFields);
  if (keys.length > 64) delete state._pathFields[keys[0]];
  return rec;
}

function patrolPathTo(state, lord, target) {
  const w = state.world.w;
  if (!target) return null;
  if (Math.max(Math.abs(lord.x - target.x), Math.abs(lord.y - target.y)) <= 1) return [];
  const field = pathFieldFor(state, target);
  const start = lord.y * w + lord.x;
  const d0 = field.dist[start];
  if (d0 === 0xffff) return null;
  // 从当前位置沿距离场下坡走，天然得到一条绕开河流/山脊/城池的路
  const path = [];
  let cur = start;
  let guard = 0;
  const maxSteps = w * state.world.h;
  while (field.dist[cur] > 0 && guard++ < maxSteps) {
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    let best = -1;
    let bestD = field.dist[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + PATH_DIRS[d][0];
      const ny = cy + PATH_DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= state.world.h) continue;
      const nidx = ny * w + nx;
      const nd = field.dist[nidx];
      if (nd !== 0xffff && nd < bestD) { best = nidx; bestD = nd; }
    }
    if (best < 0) break;
    cur = best;
    path.push({ x: cur % w, y: Math.floor(cur / w) });
  }
  return path;
}

/** 开局/读档后先把当前巡逻城的距离场铺好，避免前三个时辰集中解冻 */
function warmPatrolFields(state) {
  (state.lords || []).forEach(function (lord) {
    if (!lord.alive || lord.prisoner) return;
    if (!lord.wander) lord.wander = patrolTargetFor(state, lord);
    if (lord.wander && lord.wander.patrolSite) pathFieldFor(state, lord.wander);
  });
}

/** 最近的本势力城；领主逃命时先保这里。 */
function nearestOwnCity(state, lord) {
  let best = null;
  let bestD = 99999;
  (state.world.sites || []).forEach(function (s) {
    if (s.type !== 'town' && s.type !== 'castle') return;
    const own = lord.faction === 'player' ? !!s.playerOwned : s.ownerFaction === lord.faction;
    if (!own) return;
    const d = gridDistance(lord, s);
    if (d < bestD) { bestD = d; best = { site: s, d: d }; }
  });
  return best;
}

/** 不敌对国家的城；本方城太远时才用。 */
function nearestFriendlyCity(state, lord) {
  let best = null;
  let bestD = 99999;
  (state.world.sites || []).forEach(function (s) {
    if (s.type !== 'town' && s.type !== 'castle') return;
    if (lord.faction === 'player' ? !!s.playerOwned : s.ownerFaction === lord.faction) return;
    if (!siteFriendlyToLord(state, lord, s)) return;
    const d = gridDistance(lord, s);
    if (d < bestD) { bestD = d; best = { site: s, d: d }; }
  });
  return best;
}

/**
 * 逃遁落点：自家城优先；自家城超过 30 格，才改投不敌对国家的城。
 * 若友军城并不比自家城近，还是回自家城，别为了“友好”多跑冤枉路。
 */
function fleeSiteFor(state, lord) {
  const own = nearestOwnCity(state, lord);
  const friendly = nearestFriendlyCity(state, lord);
  if (!own) return friendly;
  if (!friendly || own.d <= LORD_FLEE_OWN_MAX) return own;
  if (friendly.d < own.d) return friendly;
  return own;
}

function threatName(unit, kind) {
  if (kind === 'player') return '你';
  return (unit && unit.name) || '敌军';
}

function threatCount(unit) {
  return Math.max(1, army.troopCount((unit && unit.troops) || {}));
}

/** 本阵营还有没有城/关；全丢光了就无路可逃。 */
function factionHasCity(state, faction) {
  if (!state || !state.world || !state.world.sites || !faction) return false;
  return state.world.sites.some(function (site) {
    return (site.type === 'town' || site.type === 'castle') && site.ownerFaction === faction;
  });
}

/** 五格内有没有不敌对自己的领主；不要求对方和敌人也停战。 */
function lordHasBattleAllyNear(state, lord, range) {
  const r = range || 5;
  return (state.lords || []).some(function (other) {
    if (!other || other === lord || !other.alive || other.dead || other.retired) return false;
    if (other.inCity || other.prisoner) return false;
    if (!other.faction || other.faction === 'bandit') return false;
    // 不能和自己是敌对关系；和共同的敌人是否交战不影响结阵。
    if (other.faction !== lord.faction && war.atWar(state, lord.faction, other.faction)) return false;
    return gridDistance(lord, other) <= r;
  });
}

/** 敌军已经围到城下，且自己还有十人以上：守军必须上城，不许先逃。 */
function lordGuardsBesiegedCity(state, lord) {
  const siteId = lord.defending || (lord.order && lord.order.type === 'defend' && lord.order.siteId);
  if (!siteId) return false;
  const site = siteById(state.world, siteId);
  if (!site || site.ownerFaction !== lord.faction) return false;
  // 只要守城令还在、城还是自己的，就按守军处理；老档没有 campaign 记录也不能放跑。
  return true;
}

/**
 * 敌军已经把这支领主的本城/封地写成进攻目标，哪怕还没围到城下，
 * 守军超过十人也要先按守土处理，不能看见兵力差就弃城先跑。
 * 只看离城十格内的敌军军令或敌国战役目标，避免远端战役把所有领主钉死在城里。
 */
function lordHomeCityUnderThreat(state, lord) {
  if (!state || !lord || !lord.faction) return false;
  const cities = (state.world.sites || []).filter(function (s) {
    return (s.type === 'town' || s.type === 'castle') && s.ownerFaction === lord.faction;
  });
  if (!cities.length) return false;
  const campaigns = state.warCampaigns || {};
  return cities.some(function (site) {
    const mine = lord.home === site.id || site.lordId === lord.id || lord.defending === site.id;
    if (!mine) return false;
    const enemyOrderNear = (state.lords || []).some(function (other) {
      if (!other || other === lord || !other.alive || other.dead || other.retired) return false;
      if (other.inCity || other.prisoner || !other.faction || other.faction === 'bandit') return false;
      if (!war.atWar(state, lord.faction, other.faction)) return false;
      if (!other.order || other.order.siteId !== site.id) return false;
      if (other.order.type !== 'march' && other.order.type !== 'siege') return false;
      return gridDistance(other, site) <= 10;
    });
    if (enemyOrderNear) return true;
    return Object.keys(campaigns).some(function (faction) {
      const cp = campaigns[faction];
      if (!cp || cp.done || cp.targetId !== site.id) return false;
      if (!war.atWar(state, lord.faction, faction)) return false;
      if (cp.stage !== 'rally' && cp.stage !== 'march' && cp.stage !== 'siege') return false;
      return true;
    });
  });
}

/**
 * 逃遁豁免：
 * - 本阵营城全丢光，无路可逃；
 * - 敌军围城且自己超过十人，守军必须硬顶；
 * - 五格内有友军且自己超过十人，群战必须硬顶；
 * - 敌军已把本城/封地定为进攻目标且逼近到十格内，守军超过十人也不许弃城。
 * 十人以下才重新允许按兵力差判断是否逃。
 */
function lordMustHold(state, lord) {
  if (!factionHasCity(state, lord.faction)) return true;
  const own = threatCount(lord);
  const defOwn = army.troopCount(lord.defTroops || {});
  // 守城令按满编兵力算“够不够守”，不能因为这一阵掉到十人以下就弃城；
  // 但本来就只有十人的守军仍允许按兵力差撤退。
  const holdPower = lord.defending ? Math.max(own, defOwn) : own;
  if (lord.defending && holdPower > 10) return true;
  if (own <= 10) return false;
  if (lordGuardsBesiegedCity(state, lord)) return true;
  if (lordHasBattleAllyNear(state, lord, 5)) return true;
  if (lordHomeCityUnderThreat(state, lord)) return true;
  return false;
}

/** war.js 在开打前调用：返回 false 时把“兵力悬殊就后撤”改成正面接战。 */
function lordMayFlee(state, lord) {
  return !lordMustHold(state, lord);
}

/**
 * 找视野里值得动手/需要躲开的对象。
 * 先算“谁明显比我多”，优先逃；再算“谁明显比我少”，追。
 * 只有兵力差到 1.65 倍且至少差 10 人，才启动追击或逃遁。
 */
function lordThreatFor(state, lord, isOwnCountry, paidOff) {
  const p = state.player;
  const sight = Math.max(3, lord.sight || 5);
  const arcReconquest = !!(state.arc && state.arc.phase === 'reconquest');
  const arcEdge = state.world && state.world.edgeTown && state.world.edgeTown.id;
  // 复国阶段：全国叛军都盯着主角，主角在边陲小镇十格内时才回去巡逻。
  if (arcReconquest && lord.faction === 'rebel' && p.atSiteId !== arcEdge) {
    return {
      role: 'hunt',
      target: { kind: 'player', unit: p, count: threatCount(p), d: gridDistance(lord, p), name: p.name || '你' },
    };
  }
  // 敌军领主另算视野：复国阶段的叛军会跨州追着主角封的领主打。
  const foeSight = arcReconquest && lord.faction === 'rebel' ? 9999 : Math.max(sight, LORD_FOE_SIGHT);
  const own = threatCount(lord);
  const candidates = [];

  if (!isOwnCountry && !paidOff && !isSafeResting(state) &&
      isHostileFaction(state, lord.faction)) {
    const d = gridDistance(lord, p);
    if (d <= sight) {
      candidates.push({ kind: 'player', unit: p, count: threatCount(p), d: d, name: p.name || '你' });
    }
  }

  (state.lords || []).forEach(function (other) {
    if (!other || other === lord || !other.alive || other.dead || other.retired) return;
    if (other.inCity || other.prisoner || other.engagedWith) return;
    if (!other.faction || other.faction === lord.faction) return;
    if (other.faction === 'player' && !arcReconquest) return;
    if (!war.atWar(state, lord.faction, other.faction)) return;
    const d = gridDistance(lord, other);
    if (d > foeSight) return;
    candidates.push({ kind: 'lord', unit: other, count: threatCount(other), d: d, name: other.name });
  });

  (state.parties || []).forEach(function (party) {
    if (!party || party.dead || party.engagedWith) return;
    if (party.faction === 'bandit' && questProtectedParty(state, party)) return;
    if (party.faction !== 'bandit' && !war.atWar(state, lord.faction, party.faction)) return;
    const d = gridDistance(lord, party);
    // 匪团只有进了身边三格才被主动追；更远就当没看见。
    if (d > LORD_BANDIT_HUNT_RANGE) return;
    candidates.push({ kind: 'party', unit: party, count: threatCount(party), d: d, name: party.name || '匪团' });
  });

  let flee = null;
  let huntParty = null;
  let huntOther = null;
  candidates.forEach(function (c) {
    if (c.count >= own * LORD_PURSUIT_RATIO && c.count - own >= LORD_PURSUIT_GAP) {
      if (!flee || c.d < flee.d) flee = c;
    }
    // 剿匪门槛低一些：领主愿意主动清乡，不必等匪团只剩零头才动手。
    // 国战领主之间则按战线判断：兵力相当或只是略处下风，也要上去碰一碰。
    const ratio = c.kind === 'party'
      ? LORD_BANDIT_HUNT_RATIO
      : c.kind === 'lord' ? LORD_FOE_ENGAGE_RATIO : LORD_PURSUIT_RATIO;
    const gap = c.kind === 'party'
      ? LORD_BANDIT_HUNT_GAP
      : c.kind === 'lord' ? LORD_FOE_ENGAGE_GAP : LORD_PURSUIT_GAP;
    if (own >= c.count * ratio && own - c.count >= gap) {
      if (c.kind === 'party') {
        if (!huntParty || c.d < huntParty.d) huntParty = c;
      } else if (!huntOther || c.d < huntOther.d) {
        huntOther = c;
      }
    }
  });
  if (flee && !lordMustHold(state, lord)) return { role: 'flee', target: flee };
  if (huntParty) return { role: 'hunt', target: huntParty };
  if (huntOther) return { role: 'hunt', target: huntOther };
  return null;
}

function stopLordFlee(lord) {
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleeFrom = null;
  lord.fleePath = null;
  lord.fleePathFor = null;
}

/** 外部改过坐标/路径起点的领主要清掉缓存，否则下一次会沿旧路径跨格。 */
function clearLordMoveCaches(lord) {
  if (!lord) return;
  lord.routePath = null;
  lord.routePathFor = null;
  lord.patrolPath = null;
  lord.fleePath = null;
  lord.fleePathFor = null;
}

/** 给卡住的领主挑一个可达、且第一步不会继续撞墙的空地。 */
function chooseLordEscapeTarget(state, lord, towards) {
  if (!state || !lord) return null;
  const world = state.world;
  const curKey = lord.x + ',' + lord.y;
  const orderSig = lord.wander ? lord.wander.x + ',' + lord.wander.y : null;
  const candidates = [];
  const curTowardDist = towards ? gridDistance(lord, towards) : 0;
  // 有战略目标时优先选“比现在更靠近目标”的空地，不把军令带偏；否则先看巡逻下一腿。
  if (!towards) {
    let patrol = patrolTargetFor(state, lord);
    if (patrol && patrol.x + ',' + patrol.y === orderSig) {
      advancePatrolLeg(state, lord);
      patrol = patrolTargetFor(state, lord);
    }
    if (patrol && patrol.x + ',' + patrol.y !== curKey) candidates.push(patrol);
  }
  // 再在周围 2~12 格找空位：只接受有路、第一步可站人的目标。
  for (let r = 2; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = lord.x + dx;
        const y = lord.y + dy;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        if (x === lord.x && y === lord.y) continue;
        if (!isPassable(world, x, y) || siteAt(world, x, y)) continue;
        if (state.player && x === state.player.x && y === state.player.y) continue;
        if (unitOccupies(state, lord, x, y)) continue;
        candidates.push({ x: x, y: y });
      }
    }
  }
  const tried = {};
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const key = cand.x + ',' + cand.y;
    if (tried[key] || key === curKey) continue;
    tried[key] = true;
    if (Math.max(Math.abs(cand.x - lord.x), Math.abs(cand.y - lord.y)) < 2) continue;
    if (towards && gridDistance(cand, towards) >= curTowardDist) continue;
    const path = patrolPathTo(state, lord, cand);
    if (!path) continue;
    if (path.length) {
      const first = path[0];
      if (!isPassable(world, first.x, first.y)) continue;
      if (siteAt(world, first.x, first.y)) continue;
      if (unitOccupies(state, lord, first.x, first.y)) continue;
    }
    return cand;
  }
  return null;
}

/** 当前所有缓存路线里最短的剩余步数；只要路线在变短，就说明领主在沿路推进。 */
function lordPathRemaining(lord) {
  let best = Infinity;
  [lord.orderPath, lord.fleePath, lord.patrolPath, lord.routePath].forEach(function (path) {
    if (path && path.length && path.length < best) best = path.length;
  });
  return best;
}

/** 卡住超过两个行军步：清掉原军令，换一个不会立刻再撞墙的目的地。 */
function maybeUnstickLord(state, lord, nowH) {
  if (!lord) return false;
  // 主动进城等待、主动驻守（hold）不算卡死；其余位置连续不动才处理。
  if (lord.enteringSiteId || lord.inCity) {
    lord.stuckSinceH = nowH;
    lord.stuckPos = null;
    lord.stuckAnchorX = null;
    lord.stuckAnchorY = null;
    lord.stuckPathRemaining = null;
    return false;
  }
  if (lord.order && lord.order.hold) {
    const holdSite = lord.order.siteId ? siteById(state.world, lord.order.siteId) : null;
    // 只有已经站到军令目标旁边，hold 才算“按令驻守”；离目标很远还站着就是卡住。
    if (holdSite && gridDistance(lord, holdSite) <= 1) {
      lord.stuckSinceH = nowH;
      lord.stuckPos = null;
      lord.stuckAnchorX = null;
      lord.stuckAnchorY = null;
      lord.stuckPathRemaining = null;
      return false;
    }
  }
  const pos = lord.x + ',' + lord.y;
  // 以“锚点 + 三格内”判定卡点：只在三四格之间来回挪也算卡住，
  // 真正走出三格以上（或在沿路推进）才重置计时，避免路口来回试探被误判成已脱困。
  if (typeof lord.stuckAnchorX !== 'number' || typeof lord.stuckAnchorY !== 'number') {
    lord.stuckAnchorX = lord.x;
    lord.stuckAnchorY = lord.y;
    lord.stuckPathRemaining = lordPathRemaining(lord);
    if (!lord.stuckSinceH) lord.stuckSinceH = nowH;
    lord.stuckPos = pos;
    return false;
  }
  const drift = Math.max(Math.abs(lord.x - lord.stuckAnchorX), Math.abs(lord.y - lord.stuckAnchorY));
  const pathRemaining = lordPathRemaining(lord);
  // 路线剩余步数在减少，说明不是卡死，而是在绕路/行军，重置锚点和计时。
  if (pathRemaining < (lord.stuckPathRemaining === undefined ? Infinity : lord.stuckPathRemaining) ||
      drift > 3) {
    lord.stuckAnchorX = lord.x;
    lord.stuckAnchorY = lord.y;
    lord.stuckPos = pos;
    lord.stuckSinceH = nowH;
    lord.stuckPathRemaining = pathRemaining;
    return false;
  }
  if (lord.stuckPathRemaining === undefined) lord.stuckPathRemaining = pathRemaining;
  if (lord.stuckPos !== pos) lord.stuckPos = pos;
  if (nowH - (lord.stuckSinceH || nowH) < LORD_STUCK_HOURS) return false;

  // 有明确军令时不要弃令乱走：在周围找一个“更靠近原目标、且有路”的落脚点，
  // 先脱离当前卡点，抵达后军令路线会自动接回目标。
  const orderSite = lord.order && lord.order.siteId
    ? siteById(state.world, lord.order.siteId)
    : null;
  if (orderSite) {
    let dest = chooseLordEscapeTarget(state, lord, orderSite);
    if (!dest) dest = chooseLordEscapeTarget(state, lord, null);
    if (dest) {
      lord.orderDetourTarget = { x: dest.x, y: dest.y };
      lord.orderPath = null;
      lord.orderPathFor = null;
      clearLordMoveCaches(lord);
      lord.nextMoveH = nowH;
    }
    lord.stuckPos = pos;
    lord.stuckAnchorX = lord.x;
    lord.stuckAnchorY = lord.y;
    lord.stuckPathRemaining = lordPathRemaining(lord);
    lord.stuckSinceH = nowH;
    return !!dest;
  }

  const dest = chooseLordEscapeTarget(state, lord, null);
  lord.order = null;
  lord.defending = null;
  lord.orderPath = null;
  lord.orderPathFor = null;
  stopLordFlee(lord);
  clearLordChase(lord);
  clearLordMoveCaches(lord);
  lord.stuckEscape = dest ? { x: dest.x, y: dest.y } : null;
  lord.wander = dest;
  lord.nextMoveH = nowH;
  lord.stuckPos = pos;
  lord.stuckAnchorX = lord.x;
  lord.stuckAnchorY = lord.y;
  lord.stuckPathRemaining = lordPathRemaining(lord);
  lord.stuckSinceH = nowH;
  return !!dest;
}

function isAdjacentStep(from, to) {
  return !!from && !!to && Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= 1;
}

function markLordFlee(state, lord, site, threat) {
  const targetId = site ? site.id : null;
  const changed = !lord.fleeing || lord.fleeTargetId !== targetId;
  lord.fleeing = true;
  lord.hunting = false;
  lord.chasing = false;
  lord.foeChasing = null;
  lord.banditChasing = null;
  lord.fleeTargetId = targetId;
  lord.fleeFrom = threat ? threat.kind + ':' + ((threat.unit && threat.unit.id) || threat.name) : null;
  if (changed) {
    lord.fleePath = null;
    lord.fleePathFor = null;
    pushLog(state, lord.name + '见' + (threat ? threat.name : '敌军') + '兵多，带人往' +
      (site ? site.name : '自家方向') + '撤。', 'war');
  }
}

function markLordHunt(state, lord, threat) {
  const id = (threat.unit && threat.unit.id) || null;
  const changed = !lord.hunting || lord.foeChasing !== id || lord.banditChasing !== (threat.kind === 'party' ? id : null);
  lord.hunting = true;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleePath = null;
  lord.fleePathFor = null;
  lord.chasing = true;
  lord.foeChasing = threat.kind === 'lord' ? id : null;
  lord.banditChasing = threat.kind === 'party' ? id : null;
  if (changed) {
    pushLog(state, lord.name + (threat.kind === 'lord' ? '在战线上盯上了' : '盯上了') +
      threat.name + '的旗，追过去。', 'war');
  }
}

function clearLordChase(lord) {
  lord.chasing = false;
  lord.hunting = false;
  lord.foeChasing = null;
  lord.banditChasing = null;
}

function clearLordEngagement(state, lord, pauseHours) {
  if (!lord) return;
  const wasParty = String(lord.engagedWith || '').indexOf('party:') === 0;
  if (wasParty) {
    const partyId = String(lord.engagedWith).slice(6);
    const party = (state.parties || []).filter(function (q) { return q.id === partyId; })[0];
    if (party && String(party.engagedWith || '') === lord.id) party.engagedWith = null;
    if (party) party.scuffle = Math.max(party.scuffle || 0, 3);
  }
  lord.engagedWith = null;
  lord.engagedSinceH = null;
  lord.scuffle = Math.max(lord.scuffle || 0, 3);
  if (pauseHours) lord.pauseUntil = Math.max(lord.pauseUntil || 0, gameHours(state) + pauseHours);
}

/** 缠斗对象还在不在、贴不贴身；旧档里被删掉的匪团最容易留下死锁 */
function lordEngagementValid(state, lord) {
  if (!lord || !lord.engagedWith || lord.inCity) return false;
  const nowH = gameHours(state);
  const id = String(lord.engagedWith);
  if (id.indexOf('party:') === 0) {
    const partyId = id.slice(6);
    const party = (state.parties || []).filter(function (q) { return q.id === partyId; })[0];
    if (!party || party.dead || army.troopCount(party.troops || {}) <= 0) return false;
    if (String(party.engagedWith || '') !== lord.id) return false;
    if (lord.engagedSinceH && nowH - lord.engagedSinceH > 18) return false;
    return Math.max(Math.abs(party.x - lord.x), Math.abs(party.y - lord.y)) <= 1;
  }
  const other = (state.lords || []).filter(function (l) { return l.id === id; })[0];
  if (!other || !other.alive || other.prisoner || other.inCity) return false;
  if (String(other.engagedWith || '') !== lord.id) return false;
  return Math.max(Math.abs(other.x - lord.x), Math.abs(other.y - lord.y)) <= 1;
}

/** 大地图标签用：匪团这一侧的“交战中”必须真的互指、贴身、对象活着且没进城 */
function partyEngagementValid(state, party) {
  if (!party || !party.engagedWith) return false;
  const id = String(party.engagedWith);
  if (id.indexOf('party:') === 0) return false;
  const lord = (state.lords || []).filter(function (l) { return l.id === id; })[0];
  if (!lord || !lord.alive || lord.prisoner || lord.inCity) return false;
  if (String(lord.engagedWith || '') !== 'party:' + party.id) return false;
  if (army.troopCount(party.troops || {}) <= 0) return false;
  if (party.engagedSinceH && gameHours(state) - party.engagedSinceH > 18) return false;
  return Math.max(Math.abs(lord.x - party.x), Math.abs(lord.y - party.y)) <= 1;
}

function releaseLordCityApproach(lord) {
  lord.enteringSiteId = null;
  lord.cityEnterAtH = null;
}

/** 领主：兵多追、兵少逃；其余情况按军令、休整和巡逻路线走。 */
function moveLords(state, slot) {
  const p = state.player;
  const nowH = gameHours(state);
  const playerSide = p.faction || 'player';
  state.lords.forEach(function (lord) {
    if (!lord.alive) return;
    if (lord.fieldBattleId) return;
    // 驿站旧部在边陲小镇等玩家来领，不参与大地图巡逻/募兵/追击。
    if (lord.borderStation) {
      const edge = border.edgeSite(state);
      if (edge) {
        lord.inCity = edge.id;
        lord.x = edge.x;
        lord.y = edge.y;
      }
      return;
    }
    // 兼容旧调用：显式传槽时仍只处理该槽；正常 update 不再传槽。
    if (slot !== undefined && npcSlotFor(lord) !== slot) return;
    // 非玩家单位误入边陲小镇十格：不让他继续走，直接送回本城。
    if (lord.faction !== 'player' && !lord.inCity && edgeTownBlocked(state.world, lord.x, lord.y)) {
      const home = siteById(state.world, lord.home);
      if (home && home.ownerFaction === lord.faction) {
        lord.inCity = home.id;
        lord.x = home.x;
        lord.y = home.y;
        lord.stepFrom = null;
        lord.stepTo = null;
        lord.routePath = null;
        lord.order = null;
      }
      return;
    }

    // 已经走到城中心、这一步也走完了：现在才收旗进城。
    if (lord.enteringSiteId && lord.cityEnterAtH && nowH >= lord.cityEnterAtH) {
      const city = siteById(state.world, lord.enteringSiteId);
      if (city && siteFriendlyToLord(state, lord, city)) {
        // 动画这一步已经走完，进城这一刻才把坐标落到城中心。
        lord.x = city.x;
        lord.y = city.y;
        if (enterLordCity(state, lord, city)) return;
      }
      releaseLordCityApproach(lord);
      lord.nextMoveH = nowH + 1;
    }
    // 还差最后半步到城中心：等这一步走完，不能再提前收进城。
    if (lord.enteringSiteId) return;
    // 只要真的踩在城/关中心格，哪怕是被旧逻辑挪进来的，也按中心格收编。
    if (!lord.inCity) {
      const centerSite = siteAt(state.world, lord.x, lord.y);
      if (centerSite && (centerSite.type === 'town' || centerSite.type === 'castle') &&
          siteFriendlyToLord(state, lord, centerSite)) {
        enterLordCity(state, lord, centerSite);
        return;
      }
    }
    // 精确到时辰的下一步时间：普通 6、逃遁 5，不再用 3 时辰槽粗切。
    if (nowH < (lord.nextMoveH || 0)) {
      // 被剧情落位/战场收尾设了很远的 nextMoveH，且已经没有步行动画时，
      // 也要检查是不是在旧位置站了太久；正在走的长动画不打断。
      if (!lord.stepFrom && !lord.inCity && !lord.engagedWith && !lord.fieldBattleId &&
          !(lord.pauseUntil && nowH < lord.pauseUntil) &&
          (nowH - (lord.stuckSinceH || nowH) >= LORD_STUCK_HOURS)) {
        if (maybeUnstickLord(state, lord, nowH)) {
          // 脱困后立即进入下面的选路，不再等旧 nextMoveH。
        } else {
          return;
        }
      } else {
        return;
      }
    }

    // 旧档/中途被删掉的匪团会留下 engagedWith 死锁，先验证再决定停不停。
    if (lord.engagedWith) {
      const partyEngaged = String(lord.engagedWith).indexOf('party:') === 0;
      const since = lord.engagedSinceH || nowH;
      if (!lordEngagementValid(state, lord) || nowH - since > (partyEngaged ? 18 : 72)) {
        clearLordEngagement(state, lord, 3);
      } else {
        return;
      }
    }
    // 自己国家的领主不替你决定打谁：只在军令、守城和清匪时动兵
    const isOwnCountry = lord.faction === playerSide || lord.faction === 'player';
    // 收了钱 / 被人缠住：原地待着，不动也不追
    if (lord.pauseUntil && nowH < lord.pauseUntil) return;
    // 刘备入川的剑阁军令不因减员半途散伙：这五路人要一起走到城下。
    const yiRush = !!(state.flags && state.flags.liubeiYiWar &&
      lord.order && lord.order.siteId === 'jiange' &&
      state.warCampaigns && state.warCampaigns.shu &&
      state.warCampaigns.shu.targetId === 'jiange');
    // 打散的队伍从大地图上彻底消失，不接军令、不赶路，等三天期满由
    // scatteredLordTick 悄悄送到募兵最快的城重新开始。
    if (lord.scattered) {
      lord.order = null;
      lord.defending = null;
      lord.fleeing = false;
      lord.chasing = false;
      lord.hunting = false;
      lord.scatterHidden = true;
      return;
    }
    // 在城里歇脚：旗收起来，大地图上先不画他；有军令才出城
    if (lord.inCity) {
      const city = siteById(state.world, lord.inCity);
      if (!city || !siteFriendlyToLord(state, lord, city)) {
        leaveLordCity(state, lord);
        return;
      }
      // 打散后从零募兵：招到 2/3 以前不出城，城池被围攻才提前出城追击。
      if (lord.scatterRecovering) {
        if (siteUnderAttack(state, lord, city)) {
          lord.scatterRecovering = false;
          lord.scatterHidden = false;
          leaveLordCity(state, lord, '本城遇袭');
        }
        return;
      }
      const full = army.troopCount(lord.defTroops || {});
      const now = army.troopCount(lord.troops || {});
      const low = now < Math.max(6, Math.ceil(full * LORD_RECOVERY_RATIO));
      // 已经在城里但城不是十五格内恢复最快的：趁低兵转往更快的城。
      if (low && full > 0 && !siteUnderAttack(state, lord, city) &&
          lord.recoveryTargetId !== city.id) {
        const best = bestRecoveryCity(state, lord, LORD_RECOVERY_SEARCH_RANGE);
        if (best && best.site.id !== city.id) {
          leaveLordCity(state, lord, '转往' + best.site.name + '补兵');
          // 记住这次转城目标：否则刚出城门又被“门口这座城”吸回去，
          // 领主会在城门口反复出城/进城，正是玩家看到的怪循环。
          lord.recoveryTargetId = best.site.id;
          return;
        }
      }
      if (!low) lord.recoveryTargetId = null;
      if (lord.order && lord.order.siteId && !lord.order.hold &&
          (yiRush || now >= Math.max(6, Math.ceil(full * LORD_RECOVERY_RATIO)))) {
        leaveLordCity(state, lord, '军令到了');
        return;
      }
      // 复国阶段：叛军不能一直缩在城里，要出城按“自己城/无人城/最少人/首都”巡。
      if (lord.faction === 'rebel' && state.arc && state.arc.phase === 'reconquest') {
        leaveLordCity(state, lord, '出城巡视');
        return;
      }
      return;
    }
    const paidOff = !!(lord.payoffUntil && nowH < lord.payoffUntil);
    const home = siteById(state.world, lord.home);
    const nowCount = army.troopCount(lord.troops || {});
    const fullCount = army.troopCount(lord.defTroops || {});
    // 掉到满编三分之二以下先回城补人：不然开局玩家能把名将一个个捡走
    const needRest = nowCount < Math.max(6, Math.ceil(fullCount * LORD_RECOVERY_RATIO));
    // 兵太少就不再执行集结/围城军令；守城令可以留着，但到城后先补兵。
    if (needRest && lord.order && lord.order.type !== 'defend' && !yiRush) {
      lord.order = null;
      lord.defending = null;
      lord.orderDetourTarget = null;
    }
    // 卡住两个行军步以上：先清掉失效军令并换目的地，再进入正常选路。
    maybeUnstickLord(state, lord, nowH);
    // 国战军令：集结 / 开拔 / 围城 / 回防。接了令就按军令走，不再自己乱追人
    if (lord.order && lord.order.siteId && !needRest) {
      const orderSite = siteById(state.world, lord.order.siteId);
      if (orderSite) {
        const od = gridDistance(lord, orderSite);
        lord.chasing = false;
        lord.hunting = false;
        lord.fleeing = false;
        lord.fleeTargetId = null;
        lord.fleeFrom = null;
        lord.foeChasing = null;
        lord.banditChasing = null;
        lord.resting = false;
        if (lord.order.hold && od <= 1) return;
        let orderTarget = { x: orderSite.x, y: orderSite.y, siteId: orderSite.id };
        if (lord.orderDetourTarget) {
          if (gridDistance(lord, lord.orderDetourTarget) <= 1) {
            lord.orderDetourTarget = null;
          } else {
            orderTarget = { x: lord.orderDetourTarget.x, y: lord.orderDetourTarget.y };
          }
        }
        const orderSig = orderTarget.x + ',' + orderTarget.y;
        if (lord.orderPathFor !== orderSig || !lord.orderPath) {
          lord.orderPath = patrolPathTo(state, lord, orderTarget);
          lord.orderPathFor = orderSig;
        }
        let orderStep = null;
        if (lord.orderPath && lord.orderPath.length) {
          const next = lord.orderPath[0];
          if (!siteAt(state.world, next.x, next.y) &&
              !unitOccupies(state, lord, next.x, next.y) &&
              isPassable(state.world, next.x, next.y)) {
            orderStep = lord.orderPath.shift();
          } else {
            lord.orderPath = null;
            lord.orderPathFor = null;
          }
        }
        // 绕不过去时再退回贪心；贪心本身也不会踩进任意据点格。
        // 军令路线被友军堵住时允许先横一步绕开，不能原地站着等。
        if (!orderStep) orderStep = greedyStep(state, lord, orderTarget, { detour: true });
        if (orderStep && !isAdjacentStep({ x: lord.x, y: lord.y }, orderStep)) {
          clearLordMoveCaches(lord);
          orderStep = greedyStep(state, lord, orderTarget, { detour: true });
        }
        if (orderStep) {
          stepUnitTo(state, lord, orderStep, LORD_STEP_HOURS);
          lord.nextMoveH = nowH + LORD_STEP_HOURS;
        } else {
          // 四面都被占满时短等一拍再试，不要永久停在原地。
          lord.nextMoveH = nowH + 1;
        }
        return;
      }
      lord.order = null;
    }
    let target;
    const threat = lordThreatFor(state, lord, isOwnCountry, paidOff);
    // 已经在撤的领主，一旦进入守城/结阵/无城可退状态，也要立刻停止逃遁。
    if (lord.fleeing && lordMustHold(state, lord)) stopLordFlee(lord);

    if (threat && threat.role === 'flee') {
      // 兵少：向最近的本方城撤；本方城太远才投不敌对国家的城。
      const flee = fleeSiteFor(state, lord);
      const fleeSite = flee && flee.site;
      if (fleeSite) {
        target = { x: fleeSite.x, y: fleeSite.y, siteId: fleeSite.id };
        markLordFlee(state, lord, fleeSite, threat.target);
      } else if (home) {
        target = { x: home.x, y: home.y, siteId: home.id };
        markLordFlee(state, lord, null, threat.target);
      } else {
        target = null;
        lord.fleeing = true;
        lord.fleeTargetId = null;
      }
      lord.resting = true;
    } else if (needRest) {
      // 兵力不到三分之二：已经在城门口就先进城，不再为了“更快的城”绕路；
      // 离城较远时，在十五格内找恢复最快的本方/友军城，找不到再退回最近的本城。
      // 但如果刚从某城出来、正转往更好的补兵城，就不能被门口的原城重新吸回去。
      let recoverySite = siteById(state.world, lord.recoveryTargetId);
      if (recoverySite && (!siteFriendlyToLord(state, lord, recoverySite) ||
          siteUnderAttack(state, lord, recoverySite))) {
        lord.recoveryTargetId = null;
        recoverySite = null;
      }
      const gate = recoverySite ? null : (state.world.sites || []).filter(function (s) {
        if (s.type !== 'town' && s.type !== 'castle') return false;
        if (Math.max(Math.abs(s.x - lord.x), Math.abs(s.y - lord.y)) > 1) return false;
        return siteFriendlyToLord(state, lord, s);
      })[0];
      const best = recoverySite ? { site: recoverySite } :
        (gate ? { site: gate } : bestRecoveryCity(state, lord, LORD_RECOVERY_SEARCH_RANGE));
      const rest = best || fleeSiteFor(state, lord);
      const restingSite = rest && rest.site;
      if (restingSite) {
        target = { x: restingSite.x, y: restingSite.y, siteId: restingSite.id };
      } else if (home) {
        target = { x: home.x, y: home.y, siteId: home.id };
      }
      lord.fleeing = false;
      lord.fleeTargetId = null;
      lord.fleePath = null;
      lord.fleePathFor = null;
      clearLordChase(lord);
      lord.resting = true;
    } else if (threat && threat.role === 'hunt') {
      // 兵多：追视野里最弱的一支，追到就由 fieldTick 结算。
      target = { x: threat.target.unit.x, y: threat.target.unit.y };
      markLordHunt(state, lord, threat.target);
      lord.resting = false;
    } else if (lord.fleeing) {
      // 已经开撤：哪怕追兵暂时不在视野里，也先把人带进最近的友城。
      const fleeSite = siteById(state.world, lord.fleeTargetId);
      if (fleeSite && siteFriendlyToLord(state, lord, fleeSite)) {
        target = { x: fleeSite.x, y: fleeSite.y, siteId: fleeSite.id };
        lord.chasing = false;
        lord.hunting = false;
        lord.resting = true;
      } else {
        const flee = fleeSiteFor(state, lord);
        if (flee && flee.site) {
          target = { x: flee.site.x, y: flee.site.y, siteId: flee.site.id };
          markLordFlee(state, lord, flee.site, null);
          lord.resting = true;
        } else {
          lord.fleeing = false;
          lord.fleeTargetId = null;
          lord.fleePath = null;
          clearLordChase(lord);
        }
      }
    } else {
      clearLordChase(lord);
      lord.fleeing = false;
      lord.fleeTargetId = null;
      lord.fleePath = null;
      // 没仗打的时候，沿自己的巡逻路线走：先绕当前城郊的落脚点，
      // 再换下一座城；每座城有 5/9 条路线，按访问序号轮换。
      if (!lord.wander) {
        lord.wander = patrolTargetFor(state, lord);
        lord.patrolPath = null;
      } else if (gridDistance(lord, lord.wander) <= 1) {
        advancePatrolLeg(state, lord);
        lord.wander = patrolTargetFor(state, lord);
        lord.patrolPath = null;
      }
      target = lord.wander;
    }
    // 卡点脱困的目标优先于巡逻/休整/追人，避免刚换的目标又被原来的逻辑覆盖。
    if (lord.stuckEscape) {
      target = { x: lord.stuckEscape.x, y: lord.stuckEscape.y };
      lord.stuckEscape = null;
    }
    // 基础 6 时辰一格；逃遁只给 20% 加成，即 5 时辰一格。追匪、军令、进城都不另提速。
    const fleeing = !!lord.fleeing;
    const travelHours = fleeing ? LORD_FLEE_STEP_HOURS : LORD_STEP_HOURS;
    if (!target) return;
    let step = null;
    let routeBlocked = false;
    // 逃遁也走 BFS，避免沿河岸或城角一步贪心来回打转。
    if (lord.fleeing && target && target.siteId) {
      const sig = target.siteId + ':' + target.x + ',' + target.y;
      if (lord.fleePathFor !== sig || !lord.fleePath) {
        lord.fleePath = patrolPathTo(state, lord, target);
        lord.fleePathFor = sig;
      }
      if (lord.fleePath && lord.fleePath.length) {
        const next = lord.fleePath[0];
        if (!siteAt(state.world, next.x, next.y) &&
            !unitOccupies(state, lord, next.x, next.y) &&
            isPassable(state.world, next.x, next.y)) {
          step = lord.fleePath.shift();
        } else {
          lord.fleePath = null;
          lord.fleePathFor = null;
        }
      }
    }
    // 巡逻目标走一次 BFS 把绕行路径缓存下来，避免在河岸/城角一步贪心来回打转。
    if (!step && target === lord.wander && lord.wander.patrolSite) {
      if (!lord.patrolPath) lord.patrolPath = patrolPathTo(state, lord, target);
      if (lord.patrolPath && lord.patrolPath.length) {
        const next = lord.patrolPath[0];
        if (!siteAt(state.world, next.x, next.y) &&
            !unitOccupies(state, lord, next.x, next.y) &&
            isPassable(state.world, next.x, next.y)) {
          step = lord.patrolPath.shift();
        } else {
          lord.patrolPath = null;
        }
      }
    }
    // 追人、回城、逃遁等所有目标都先走一次绕据点距离场：
    // 城池/关隘/村庄一律不可穿，队伍会从城外绕过去，不再顶在城门口。
    if (!step && target) {
      const routeSig = target.x + ',' + target.y;
      if (lord.routePathFor !== routeSig || !lord.routePath) {
        lord.routePath = patrolPathTo(state, lord, target);
        lord.routePathFor = routeSig;
      }
      if (lord.routePath && lord.routePath.length) {
        const next = lord.routePath[0];
        if (!siteAt(state.world, next.x, next.y) &&
            isPassable(state.world, next.x, next.y)) {
          if (!unitOccupies(state, lord, next.x, next.y)) {
            step = lord.routePath.shift();
          } else {
            // 前面被别的队伍堵住：保留路线原地等一拍，别反复重算/绕小圈。
            routeBlocked = true;
          }
        } else {
          lord.routePath = null;
          lord.routePathFor = null;
        }
      }
    }
    // 路线被堵时不能原地死等：清掉旧路线，允许先横一步绕开，
    // 下一拍从新位置重新铺距离场，避免两支友军互相顶死。
    if (!step && routeBlocked) {
      lord.routePath = null;
      lord.routePathFor = null;
      step = greedyStep(state, lord, target, { detour: true });
    }
    if (!step && !routeBlocked) step = greedyStep(state, lord, target);
    // 路径缓存可能在领主被 moveAway/剧情落位/老档挪格后过期，
    // 首格离当前位置超过一格就作废重算，绝不跨格滑过去。
    if (step && !isAdjacentStep({ x: lord.x, y: lord.y }, step)) {
      clearLordMoveCaches(lord);
      step = greedyStep(state, lord, target, { detour: true });
    }
    if (step) {
      stepUnitTo(state, lord, step, travelHours);
      lord.nextMoveH = nowH + travelHours;
    } else if (target === lord.wander) {
      // 前面被别的队伍堵住：跳过这个巡逻落脚点，别在一格上反复撞。
      advancePatrolLeg(state, lord);
      lord.wander = patrolTargetFor(state, lord);
      lord.patrolPath = null;
      lord.nextMoveH = nowH + 1;
    } else {
      // 非巡逻目标（逃遁/回城/追人）被四面堵住时短等一拍再找路。
      lord.nextMoveH = nowH + 1;
    }
    // 走到自己/友军的城下：最后半步必须踩进城池中心，走完才收旗进城。
    if (target.siteId) {
      const targetSite = siteById(state.world, target.siteId);
      if (targetSite && siteFriendlyToLord(state, lord, targetSite)) {
        const d = gridDistance(lord, targetSite);
        if (d === 0) {
          enterLordCity(state, lord, targetSite);
        } else if (d === 1) {
          // 城门外一格只算“开始最后半步”，数据坐标不进中心、更不算进城。
          beginLordCityEntry(state, lord, targetSite, LORD_ENTER_CITY_HOURS);
        }
      }
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
  let fallback = null;
  dirs.forEach(function (d) {
    const nx = unit.x + d[0];
    const ny = unit.y + d[1];
    if (!isPassable(state.world, nx, ny)) return;
    if (siteAt(state.world, nx, ny)) return;
    if (unitOccupies(state, unit, nx, ny)) return;
    // 匪团退开也不能踩地图边、不能溜到别的州。
    if (unit.faction === 'bandit') {
      if (nx < BANDIT_EDGE_MARGIN || ny < BANDIT_EDGE_MARGIN ||
          nx > state.world.w - 1 - BANDIT_EDGE_MARGIN ||
          ny > state.world.h - 1 - BANDIT_EDGE_MARGIN) return;
      if (unit.roamRegion && regionAt(state.world, nx, ny) !== unit.roamRegion) return;
    }
    const dist = Math.max(Math.abs(nx - threat.x), Math.abs(ny - threat.y));
    if (!fallback) fallback = { x: nx, y: ny };
    if (dist > bestD) {
      bestD = dist;
      best = { x: nx, y: ny };
    }
  });
  // 被围死也不能原地不动：先找一格能站的地方退开，避免下一轮又贴上来。
  if (!best) best = fallback;
  if (best) {
    // 匪团现在脚程慢于领主，后退也慢；领主仍按原来的 3 时辰退一步。
    const hours = unit && unit.faction === 'bandit' ? BANDIT_STEP_HOURS : NPC_STEP_HOURS;
    clearLordMoveCaches(unit);
    stepUnitTo(state, unit, best, hours);
    return true;
  }
  return false;
}

/**
 * 匪团与领主在路上撞上：停下来打一场大的，不是咬一口就走。
 * 每 3 小时结算一轮，双方成建制地掉人；打崩之后败方大概率溃逃，
 * 小概率被当场捆住。交战期间双方都不再移动。
 */
function fightNeighbors(state) {
  const p = state.player;
  const rng = state.rng;
  const nowH = gameHours(state);

  function clear(party, lord, pause) {
    if (party) {
      party.engagedWith = null;
      party.engagedSinceH = null;
      party.scuffle = Math.max(party.scuffle || 0, 3);
      if (pause) party.pauseUntil = Math.max(party.pauseUntil || 0, nowH + 3);
    }
    if (lord && String(lord.engagedWith || '').indexOf('party:') === 0) {
      clearLordEngagement(state, lord, pause ? 3 : 0);
    }
  }

  state.parties.forEach(function (party) {
    if (party.faction !== 'bandit') return;
    if (army.troopCount(party.troops) <= 0) return;
    // 刚解除幽灵缠斗/撤退余惊还没过：这一拍不能再立刻贴上去。
    if (party.pauseUntil && nowH < party.pauseUntil) return;
    if (party.scuffle && party.scuffle > 0) return;
    // 玩家刚接的猎匪任务：五天内 NPC 领主不能把这支目标打散，玩家能赶到。
    if (questProtectedParty(state, party)) {
      if (party.engagedWith) {
        const engagedLord = state.lords.filter(function (l) { return l.id === party.engagedWith; })[0];
        clear(party, engagedLord, true);
      }
      return;
    }

    let lord = null;
    if (party.engagedWith) {
      lord = state.lords.filter(function (l) { return l.id === party.engagedWith; })[0];
      if (!lord || !lord.alive || lord.prisoner || lord.inCity || lord.scattered ||
          Math.abs(lord.x - party.x) > 1 || Math.abs(lord.y - party.y) > 1) {
        clear(party, lord, true);
        return;
      }
      // 缠斗超过 18 时辰还没见分晓：强行收兵，免得两支部队在地图上站成一尊像。
      if (party.engagedSinceH && nowH - party.engagedSinceH > 18) {
        clear(party, lord, true);
        const partyOut = retreatFrom(state, party, lord);
        const lordOut = retreatFrom(state, lord, party);
        if (!partyOut) {
          destroyBanditParty(state, party, 'timeout');
        } else if (!lordOut) {
          // 领主被围得退不开，这场就不再拖：按俘虏处理，等日子到了再逃
          war.capture(state, lord, 'bandit', party.name);
        }
        if (Math.max(Math.abs(party.x - p.x), Math.abs(party.y - p.y)) <= 12) {
          pushLog(state, party.name + '和' + lord.name + '缠斗太久，各自收兵退开，谁也没再追。', 'war');
        }
        return;
      }
    } else {
      lord = state.lords.filter(function (l) {
        return l.alive && !l.prisoner && !l.inCity && !l.scattered && !l.engagedWith && l.faction !== 'bandit' &&
          Math.abs(l.x - party.x) <= 1 && Math.abs(l.y - party.y) <= 1;
      })[0];
      if (!lord) return;
      // 已经贴身了，就算领主兵多也不再让匪团先跑：
      // 缠上以后交给下面的战损结算，弱势匪团会被直接打散。
      party.engagedWith = lord.id;
      party.engagedSinceH = nowH;
      party.scuffle = 0;
      lord.engagedWith = 'party:' + party.id;
      lord.engagedSinceH = nowH;
      lord.scuffle = 0;
    }

    // 刚贴上时不要立刻结算：至少打满三个时辰，再按战损/碾压判定。
    if (!party.engagedSinceH) party.engagedSinceH = nowH;
    if (nowH - party.engagedSinceH < BANDIT_MIN_BATTLE_HOURS) return;

    const countA = army.troopCount(party.troops);
    const countB = army.troopCount(lord.troops);
    if (countB <= 0) {
      clear(party, lord, true);
      // 0 兵自动打散，哪怕挂着守城令也不当俘虏；三天后回本土城复活。
      if (!lord.scattered && !lord.prisoner) {
        war.markLordScattered(state, lord, party.name);
      }
      return;
    }
    // 国别对拼倍率：曹操军 2 兵可当普通势力 3 兵；蜀吴也对普通势力略强。
    const edgeA = war.factionEdge ? war.factionEdge(party.faction, lord.faction) : 1;
    const edgeB = war.factionEdge ? war.factionEdge(lord.faction, party.faction) : 1;
    // 绝对碾压：领主当场把这伙匪徒打散，不拖 18 个时辰。
    if (countB >= countA * 3 && countB - countA >= 20) {
      clear(party, lord, true);
      destroyBanditParty(state, party, 'crushed');
      if (Math.max(Math.abs(party.x - p.x), Math.abs(party.y - p.y)) <= 14) {
        pushLog(state, lord.name + '以绝对优势把这伙' + party.name + '当场打散，匪首也没能跑掉。', 'war');
      }
      return;
    }
    const share = (countA * edgeA) / ((countA * edgeA) + (countB * edgeB) || 1);
    // 大规模交战：每轮不是一两个人，而是按阵线成片掉。
    const lossA = Math.max(1, Math.round(countA * (0.06 + (1 - share) * 0.16) / Math.max(1, edgeA)));
    const lossB = Math.max(1, Math.round(countB * (0.05 + share * 0.15) / Math.max(1, edgeB)));
    army.distributeLosses(party.troops, lossA);
    army.distributeLosses(lord.troops, lossB);

    const remainA = army.troopCount(party.troops);
    const remainB = army.troopCount(lord.troops);
    const brokenA = remainA <= 0 || remainA < Math.max(6, Math.round(countA * 0.24));
    const brokenB = remainB <= 0 || remainB < Math.max(6, Math.round(countB * 0.24));
    const near = Math.max(Math.abs(party.x - p.x), Math.abs(party.y - p.y)) <= 12;

    if (!brokenA && !brokenB) {
      if (near) pushLog(state, party.name + '和' + lord.name + '的主力在野地里撞上了，双方都不退，阵线上又倒下一片。', 'war');
      return;
    }

    if (brokenA && brokenB) {
      clear(party, lord, true);
      const partyOut = retreatFrom(state, party, lord);
      retreatFrom(state, lord, party);
      // 0 兵一律打散，守城令也不再转成俘虏。
      if (remainB <= 0 && !lord.prisoner) {
        war.markLordScattered(state, lord, party.name);
      }
      if (!partyOut) destroyBanditParty(state, party, 'mutual');
      // 领主被打空时不再写“两败俱伤”的战报，避免暴露隐藏状态。
      if (near && remainB > 0) pushLog(state, party.name + '和' + lord.name + '打到两败俱伤，各自收拢残兵退开。', 'war');
      return;
    }

    if (brokenA) {
      clear(party, lord, true);
      // 兵力差越大，逃掉的机会越小；NPC 也可以直接把这伙匪徒消灭。
      const escapeChance = countB >= countA * 2 ? 0.35 : 0.58;
      if (rng.next() < escapeChance && retreatFrom(state, party, lord)) {
        party.scuffle = 4;
        party.banditFleeFrom = lord.id;
        if (near) pushLog(state, party.name + '的阵线先散，抢了条野路逃了；' + lord.name + '没有死追。', 'war');
      } else {
        // 退无可退就当场散了，绝不能留在原地继续挂“交战中”
        destroyBanditParty(state, party, 'lord');
        if (near) pushLog(state, party.name + '被' + lord.name + '当场打散，匪首也没能跑掉。', 'war');
      }
      return;
    }

    // 领主败了：0 兵先按打散处理；还有至少 1 兵才进入撤退/被俘判定。
    clear(party, lord, true);
    if (remainB <= 0) {
      if (!lord.prisoner) war.markLordScattered(state, lord, party.name);
      // 打散不写战报，玩家不会看到“三天后重立”的提示。
      return;
    }
    if (rng.next() < 0.84 && retreatFrom(state, lord, party)) {
      lord.scuffle = 6;
      if (near) pushLog(state, lord.name + '的阵线被冲散，带着残兵往后退了。', 'war');
    } else {
      war.capture(state, lord, 'bandit', party.name);
      if (near) pushLog(state, lord.name + '在乱军里被' + party.name + '的人按住捆了。', 'war');
    }
  });
}

function greedyStep(state, unit, target, opts) {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const detour = !!(opts && opts.detour);
  const startD = gridDistance(unit, target);
  const maxD = detour ? startD + 1 : startD - 1;
  const cameFrom = detour && unit.stepFrom ? unit.stepFrom : null;
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < dirs.length; i++) {
    const nx = unit.x + dirs[i][0];
    const ny = unit.y + dirs[i][1];
    if (!isPassable(state.world, nx, ny)) continue;
    // 边陲小镇十格内是禁区：NPC 不能进去，只有玩家与玩家兄弟可以。
    if (unit.faction && unit.faction !== 'player' && edgeTownBlocked(state.world, nx, ny)) continue;
    const site = siteAt(state.world, nx, ny);
    if (site) {
      // 村庄不是保险箱：追兵可以踩进村里把玩家揪出来
      const p = state.player;
      const inVillage = p && p.atSiteId === site.id && site.type === 'village' &&
        target && target.x === p.x && target.y === p.y;
      if (!inVillage) continue;
    }
    // 模型占格：除非目标就是这一格上的敌军（那会由交战逻辑接管），否则绕开。
    if (unitOccupies(state, unit, nx, ny)) continue;
    // 匪团的州界是硬边界：寻路缓存可能跨州，最后一步也不能越过去。
    if (unit.faction === 'bandit' && unit.roamRegion &&
        regionAt(state.world, nx, ny) !== unit.roamRegion) continue;
    // 成都西侧空地是死地：匪团不进去，免得在无城可抢的山坳里打转。
    if (unit.faction === 'bandit' && inBanditExclusion(nx, ny)) continue;
    const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y));
    if (d > maxD) continue;
    // 绕路时允许先横着走一格，但尽量不原路退回，避免两支部队互相顶住时来回横跳。
    const score = d + (cameFrom && nx === cameFrom.x && ny === cameFrom.y ? 1.5 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

/* ---------------------------------------------------------------- 战斗 */

function playerRuleBattleFaction(faction) {
  return !!(faction && faction !== 'bandit' && faction !== 'player' && FACTIONS[faction]);
}

function playerSide(state) {
  const bonus = economy.equipmentBonus(state);
  const hb = heroes.heroBonus(state);
  return {
    name: state.player.country && state.player.country.name
      ? state.player.country.name + '军'
      : state.player.name + ' · ' + renownTitle(state.player.renown),
    faction: state.player.faction || null,
    relationFaction: state.player.faction || 'player',
    troops: deepCopy(state.player.troops),
    morale: state.player.morale,
    atkPct: bonus.atkPct + hb.atkPct,
    defPct: bonus.defPct + hb.defPct,
    isPlayer: true,
    t5Eligible: true,
  };
}

function startPartyBattle(state, party) {
  // 西凉步卒是剧情追兵，不能拉出来正常对战；只能在被追上页留人断后
  if (!party || party.scripted) return null;
  const player = playerSide(state);
  const bf = war.createFieldBattle(state, { kind: 'player', id: 'player' },
    { kind: 'party', id: party.id }, {
      playerInvolved: true,
      playerSide: 'a',
      preAggregate: true,
      aInfo: player,
      context: {
        kind: 'party',
        partyId: party.id,
        partyName: party.name,
        tier: party.banditTier ? BANDIT_TIERS[party.banditTier].rank : 0,
      },
    });
  if (bf) return bf.battle;
  // 兜底：万一合战条件不成立（例如阵营关系数据异常），仍然给一场单挑
  player.edge = war.factionEdge(player.faction, party.faction);
  player.gateEdge = war.strategicDefenseAt(state, 'player', state.player.x, state.player.y);
  const battle = new Battle({
    rng: state.rng,
    playerRules: playerRuleBattleFaction(party.faction),
    attacker: player,
    defender: {
      name: party.name,
      faction: party.faction,
      troops: deepCopy(party.troops),
      morale: party.morale,
      atkPct: 0,
      defPct: 0,
      edge: war.factionEdge(party.faction, player.faction),
    },
    context: {
      kind: 'party', partyId: party.id, partyName: party.name,
      tier: party.banditTier ? BANDIT_TIERS[party.banditTier].rank : 0,
    },
  });
  state.battle = battle;
  return battle;
}

function startLordBattle(state, lord) {
  const player = playerSide(state);
  const bf = war.createFieldBattle(state, { kind: 'player', id: 'player' },
    { kind: 'lord', id: lord.id }, {
      playerInvolved: true,
      playerSide: 'a',
      preAggregate: true,
      aInfo: player,
      context: {
        kind: 'lord', lordId: lord.id, lordName: lord.name, lordFaction: lord.faction,
      },
    });
  if (bf) return bf.battle;
  // 兜底：单挑，保持旧行为
  player.edge = war.factionEdge(player.faction, lord.faction);
  player.gateEdge = war.strategicDefenseAt(state, 'player', state.player.x, state.player.y);
  const lordRuler = !!(state.factionState && state.factionState[lord.faction] &&
    state.factionState[lord.faction].rulerId === lord.id) ||
    !!(FACTIONS[lord.faction] && FACTIONS[lord.faction].lord === lord.name);
  const battle = new Battle({
    rng: state.rng,
    state: state,
    playerRules: playerRuleBattleFaction(lord.faction),
    // 同一场遭遇战反复进出不重复触发；隔一个时辰再撞上才算新战场。
    battleKey: 'lord:' + lord.id + ':' + state.clock.day + ':' + Math.floor(state.clock.hour),
    attacker: player,
    defender: {
      name: lord.name + '军',
      faction: lord.faction,
      troops: deepCopy(lord.troops),
      morale: lord.morale,
      atkPct: 0.05,
      defPct: 0.05,
      edge: war.factionEdge(lord.faction, player.faction),
      forceValue: lord.forceValue,
      commandValue: lord.commandValue,
      isRuler: lordRuler,
      generalRank: lord.generalRank,
      t5Eligible: lordRuler || typeof lord.generalRank !== 'number' || lord.generalRank <= 20,
      strategists: lord.strategistGrade ? [{
        id: lord.id, name: lord.name, grade: lord.strategistGrade,
        pct: lord.strategistPct || 0, cap: lord.strategistCap || 100,
      }] : [],
    },
    context: { kind: 'lord', lordId: lord.id, lordName: lord.name, lordFaction: lord.faction },
  });
  state.battle = battle;
  return battle;
}

function garrisonTroops(site) {
  const total = Math.max(8, site.garrison);
  const f = site.ownerFaction;
  if (f === 'bandit') {
    let mix = { bandit: 0.55, raider: 0.35, raider_cav: 0.1 };
    const tier = BANDIT_TIERS[site.banditTier];
    const rank = tier ? tier.rank : 1;
    if (rank >= 4) mix = { bandit: 0.35, raider: 0.35, raider_cav: 0.3 };
    else if (rank >= 3) mix = { bandit: 0.45, raider: 0.35, raider_cav: 0.2 };
    const troops = {};
    Object.keys(mix).forEach(function (id) {
      const n = Math.round(total * mix[id]);
      if (n > 0) troops[id] = n;
    });
    return troops;
  }
  const slots = FACTION_SLOTS[f];
  if (slots) {
    // 各国守军按同一套编制比例：T1 35%、T2 30%、T3 25%、T4 10%。
    // 没有某一档（例如刘表没有 T3 步战档）就把权重均摊给现有档位。
    const weights = { t1: 0.35, t2: 0.3, t3a: 0.2, t3b: 0.1, t4: 0.05 };
    let sum = 0;
    Object.keys(weights).forEach(function (slot) { if (slots[slot]) sum += weights[slot]; });
    const troops = {};
    Object.keys(weights).forEach(function (slot) {
      if (!slots[slot] || sum <= 0) return;
      const n = Math.round(total * (weights[slot] / sum));
      if (n > 0) troops[slots[slot]] = n;
    });
    // 四舍五入可能少一两个人，补到 T1，避免守军总数比 garrison 少太多。
    let got = 0;
    Object.keys(troops).forEach(function (id) { got += troops[id]; });
    if (got < total && slots.t1) troops[slots.t1] = (troops[slots.t1] || 0) + (total - got);
    return troops;
  }
  // 无旗、玩家自立、叛军等没有本国兵种表：沿用旧的通用守军。
  const map = f === 'player'
    ? { militia: 0.35, spear: 0.3, archer: 0.2, cav: 0.15 }
    : { militia: 0.4, spear: 0.3, archer: 0.2, cav: 0.1 };
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
  const reach = war.canSiegeSiteFromFaction(state, 'player', site);
  if (!reach.ok) return { ok: false, msg: reach.msg };
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
      readyAnnounced: false,
      promptShown: false,
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
    ps.readyAnnounced = true;
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

/** 大地图上的围城计时：时辰在城外照常流，围满了就挂白旗并只喊一次 */
function checkPlayerSiegeReady(state) {
  const ps = state.playerSiege;
  if (!ps || ps.readyAnnounced) return false;
  if (gameHours(state) < ps.readyHour) return false;
  const site = siteById(state.world, ps.siteId);
  ps.stage = 'ready';
  ps.readyAnnounced = true;
  pushLog(state, (site ? site.name : '敌城') +
    '城头开始挂白旗。围城的壕沟已经推到城门下，可以决战了。', 'siege');
  // 不在这里弹轻提示：大地图检测到 stage==='ready' 后会暂停时辰，
  // 直接开“进攻城池 / 拔营离开”的选择框。
  return true;
}

/** 撤围：把营拔了，退回旁边的野地 */
function cancelPlayerSiege(state) {
  const ps = state.playerSiege;
  if (!ps) return { ok: true, msg: '现在没有围城' };
  const site = siteById(state.world, ps.siteId);
  if (site) {
    site.siegeStatus = null;
    site.siegeFaction = null;
    site.siegeSinceH = null;
  }
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
    // 围城完成、攻城真正开始：城头状态从“围城”转成“进攻中”，
    // 大地图和城池页都按这个标记显示；战斗结束后再统一清掉。
    site.siegeStatus = 'assault';
    site.siegeFaction = 'player';
    site.siegeSinceH = gameHours(state);
  }
  const player = playerSide(state);
  player.edge = war.factionEdge(player.faction, site.ownerFaction);
  const gateEdge = war.strategicDefenseForSite(state, site);
  const battle = new Battle({
    rng: state.rng,
    playerRules: playerRuleBattleFaction(site.ownerFaction),
    attacker: player,
    defender: {
      name: site.name + '守军',
      faction: site.ownerFaction,
      troops: garrisonTroops(site),
      morale: site.type === 'town' ? 68 : 62,
      atkPct: site.type === 'castle' ? 0.12 : 0.05,
      defPct: site.type === 'castle' ? 0.2 : 0.12,
      edge: war.factionEdge(site.ownerFaction, player.faction),
      gateEdge: gateEdge,
    },
    context: { kind: 'siege', siteId: site.id, siteName: site.name },
    routAt: 0.25,
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
  const player = playerSide(state);
  player.edge = war.factionEdge(player.faction, cfg.faction);
  const battle = new Battle({
    rng: state.rng,
    playerRules: playerRuleBattleFaction(cfg.faction),
    attacker: player,
    defender: {
      name: cfg.name,
      faction: cfg.faction,
      troops: deepCopy(cfg.troops),
      morale: cfg.morale,
      atkPct: 0.05,
      defPct: 0.1,
      edge: war.factionEdge(cfg.faction, player.faction),
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
  state.npcTick = 0;
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
  const p = state.player;
  const fieldBattle = battle.fieldBattleId ? war.fieldBattleById(state, battle.fieldBattleId) : null;
  if (fieldBattle) war.syncFieldBattle(state, fieldBattle);
  const playerContingent = fieldBattle ? war.playerContingentOf(battle) : null;
  function syncPlayerTroopsFromField() {
    if (playerContingent) {
      p.troops = deepCopy(war.contingentTroops(playerContingent));
      summary.playerInitial = playerContingent.initialCount;
      summary.playerRemain = playerContingent.count;
    } else {
      p.troops = deepCopy(battle.a.troops);
    }
  }
  syncPlayerTroopsFromField();

  // 缴获：会搜战场的英雄能多刮一点
  const hbLoot = heroes.heroBonus(state).lootPct;
  if (hbLoot > 0 && summary.loot > 0) summary.loot = Math.round(summary.loot * (1 + hbLoot));

  // 天机简「回魂」：阵亡者八成归队，按本场实际阵亡人数算，不再按初始兵力算。
  if (battle.shiMark === 'roll' && summary.result !== 'retreat') {
    const rollPct = (HISTORY_MARKS.roll && HISTORY_MARKS.roll.backPct) || 0.80;
    const dead = Math.max(0, summary.initialA - summary.remainA);
    const back = Math.max(0, Math.round(dead * rollPct));
    if (back > 0) {
      const t = battle.a.initialTroops;
      let put = 0;
      const putByType = {};
      Object.keys(t).forEach(function (id) {
        if (put >= back) return;
        const n = Math.min(t[id] - (battle.a.troops[id] || 0), back - put);
        if (n > 0) {
          battle.a.troops[id] = (battle.a.troops[id] || 0) + n;
          putByType[id] = (putByType[id] || 0) + n;
          put += n;
        }
      });
      if (playerContingent && put > 0) {
        playerContingent.count = (playerContingent.count || 0) + put;
        Object.keys(putByType).forEach(function (id) {
          playerContingent.snapshot[id] = (playerContingent.snapshot[id] || 0) + putByType[id];
        });
      }
      syncPlayerTroopsFromField();
      summary.remainA = battle.remainA();
      summary.rollBack = put;
      summary.shiNote = '回魂：' + put + ' 名阵亡者归队（本场阵亡 ' + dead + ' 人，复活八成）';
      pushLog(state, '天机简「回魂」生效：' + put + ' 个名字又从纸上站了起来。');
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
      const beaten = state.parties.filter(function (x) { return x.id === ctx.partyId; })[0];
      if (beaten) {
        if (ctx.kind === 'party') {
          // 玩家打散的匪团也按三日期满重生，和 NPC 清剿一样，不会当天原地再冒出来。
          destroyBanditParty(state, beaten, 'player');
        } else {
          state.parties = state.parties.filter(function (x) { return x.id !== ctx.partyId; });
        }
      }
      // 玩家自己打散猎匪目标，算交差；被别的势力清剿才算失败
      completeQuests(state, 'hunt', ctx.partyId);
      pushLog(state, '击溃' + ctx.partyName + '：缴获 ' + loot + ' 金钱，声望 +' + renownGain + '。');
      if (ctx.kind === 'chase') {
        pushLog(state, '西凉步卒退了。你回头看了一眼洛阳的方向，没再回头。');
        advanceCampaign(state);
      }
    } else if (ctx.kind === 'lord') {
      const lord = state.lords.filter(function (x) { return x.id === ctx.lordId; })[0];
      if (lord) {
        // 正常打一仗不杀人：败将跪在阵前，是放是押，由玩家在战果页选
        const res = war.playerDefeatsLord(state, lord);
        changeRelation(state, lord.faction, -35);
        summary.duelNote = '击败 ' + lord.name + ' · 阵前跪着，等你处置';
        summary.postBattleLord = true;
        pushLog(state, '你击败了' + lord.name + '。他丢下刀，被你的部曲按在阵前。');
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
    if (s) {
      s.siegeStatus = null;
      s.siegeFaction = null;
      s.siegeSinceH = null;
    }
    // 无主城一战没打下，守军就认死了你：门不再开，只能重新围、再决战
    if (s && !s.playerOwned && !s.ownerFaction && !s.playerBlocked) {
      s.playerBlocked = true;
      pushLog(state, '攻' + s.name + '没成，城头把门关死了。从今往后你只能围城强攻，不能再进城。', 'siege');
    }
    pushLog(state, '攻城没成，' + (s ? s.name : '城下') + '的围营散了，只能退回野地。', 'siege');
  }

  // 攻城没打下：守军的损失留在城里，不会因为玩家退走就自动补满。
  // 下一次再来，面对的是被打残的守军；它只会按当前人数的自然速度慢慢长。
  if (battle.context && battle.context.kind === 'siege' && summary.result !== 'win') {
    const s = siteById(state.world, battle.context.siteId);
    if (s && !s.playerOwned) {
      s.garrison = Math.max(8, Math.round(summary.remainB || 0));
      s.garrisonGrowth = s.garrisonGrowth || 0;
    }
  }

  const playerInitial = typeof summary.playerInitial === 'number' ? summary.playerInitial : summary.initialA;
  const playerRemain = typeof summary.playerRemain === 'number' ? summary.playerRemain : summary.remainA;
  state.stats.troopsLost += Math.max(0, playerInitial - playerRemain);
  if (fieldBattle) war.settleFieldBattle(state, fieldBattle, summary, { playerBattle: true });
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
  // 延续旧旗的兵源；没有旧旗就先用各城本地文化，等玩家自己选。
  p.recruitFaction = oldFaction && FACTION_TROOPS[oldFaction] ? oldFaction : null;
  p.recruitFactionDay = 0;
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
  // 城头换了主人：围城/攻城的旗标一起收掉，避免地图上还挂着“进攻中”。
  site.siegeStatus = null;
  site.siegeFaction = null;
  site.siegeSinceH = null;
  // 城头换了主人（玩家或 AI），旧日的“围城失败封锁”就作废
  site.playerBlocked = false;
  if (site.type === 'camp') {
    site.cleared = true;
    site.looted = true;
    site.lootedDay = state.clock.day;
    site.respawnDay = state.clock.day + CAMP_RESPAWN_DAYS;
    site.garrison = 0;
    completeQuests(state, 'scout', site.id);
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
    // 打下来的地方先不自动封人，等玩家在政务页点将
    site.lordId = null;
    site.selfFief = false;
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
    war.notifyCapture(state, site, oldFaction, 'player');
    applyPlayerCountry(state);
    syncSiteRecruitList(site, effectiveSiteFaction(state, site), state);
    pushLog(state, '你拿下了' + site.name + '。从今天起，这里归你。');
    checkVictory(state);
    advanceCampaign(state);
  }
}

/* ---------------------------------------------------------------- 任务 */

/** 酒馆猎匪任务的目标队伍：接下任务后的头五天不参与 NPC 领主的遭遇战，保证玩家有时间赶到。 */
const QUEST_PROTECT_DAYS = 5;
function questProtectedParty(state, party) {
  if (!state || !party || party.faction !== 'bandit') return false;
  const day = (state.clock && state.clock.day) || 0;
  return (state.quests || []).some(function (q) {
    return q && !q.done && !q.failed && q.type === 'hunt' &&
      q.targetPartyId === party.id &&
      day - (q.acceptedDay || 0) < QUEST_PROTECT_DAYS;
  });
}

/** 酒馆任务的目标坐标：怪物队伍、贼巢或交粮城 */
function questTargetPos(state, quest) {
  if (!quest || quest.done || quest.failed) return null;
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
    if (type === 'scout' && q.targetSiteId !== targetId) return;
    q.done = true;
    finishQuest(state, q);
  });
}

/** 目标已经没了，任务直接作废：不发赏钱、不留地图点位，只在酒馆里留一句交代 */
function failQuest(state, q, reason) {
  if (!q || q.done) return false;
  q.done = true;
  q.failed = true;
  q.failReason = reason || '目标已经被其他势力清剿';
  q.failedDay = state.clock.day;
  pushLog(state, '酒馆的差事黄了：' + (q.title || '那桩事') + '。' + q.failReason +
    '，赏钱也没了。', 'quest');
  state.events.push({
    type: 'quest-failed',
    title: '任务失败',
    text: q.failReason + '，任务自动失败，赏钱不再发放。',
    questId: q.id,
  });
  return true;
}

/** 目标不在=被其他势力清剿；只判定一次，已完成/已失败的不重复喊 */
function checkQuestTargets(state) {
  if (!state || !state.quests || !state.quests.length) return 0;
  let failed = 0;
  state.quests.forEach(function (q) {
    if (!q || q.done) return;
    if (q.type === 'hunt') {
      const party = (state.parties || []).filter(function (p) { return p.id === q.targetPartyId; })[0];
      if (!party || army.troopCount(party.troops || {}) <= 0) {
        if (failQuest(state, q, '目标已经被其他势力清剿')) failed++;
      }
      return;
    }
    if (q.type === 'scout') {
      const site = siteById(state.world, q.targetSiteId);
      if (!site || site.cleared) {
        if (failQuest(state, q, '目标已经被其他势力清剿')) failed++;
      }
      return;
    }
    if (q.type === 'grain') {
      const site = siteById(state.world, q.siteId);
      if (!site || (q.faction && site.ownerFaction !== q.faction)) {
        if (failQuest(state, q, '目标已经被其他势力清剿')) failed++;
      }
    }
  });
  return failed;
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
  p.troops = convertRosterToFaction(p.troops || {}, f, { preserveT5: true });
  state.flags.sworn = true;
  changeRelation(state, f, 80);
  Object.keys(state.relations).forEach(function (id) {
    if (id === f || id === 'bandit') return;
    changeRelation(state, id, -18);
  });
  p.morale = Math.min(100, p.morale + 12);
  refreshSiteRosters(state, true);
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
      recruitCoolDay: lord ? (lord.recruitCoolDay || 0) : 0,
      recruitWaitDays: lord ? Math.max(0, (lord.recruitCoolDay || 0) - state.clock.day) : 0,
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

/* ---------------------------------------------------------------- 玩家外交 */

/** 你和一个势力现在是不是在打 */
function atWarWith(state, faction) {
  return !!(state && faction && war.atWar(state, 'player', faction));
}

/**
 * 议和条款：关系越差赔得越多；阵前杀过对方的人，一个月内不谈，
 * 满一个月再谈，赔款翻倍。UI 与真正扣钱都走这一处。
 */
function peaceTerms(state, faction) {
  if (!state || !faction || !FACTIONS[faction]) return { ok: false, msg: '没有这个势力' };
  if ((state.factionState[faction] || {}).dead) return { ok: false, msg: '这个势力已经亡了，没人能签下这份文书' };
  if (!war.atWar(state, 'player', faction)) return { ok: false, msg: '你和他们没有开战' };
  if (faction === 'rebel') {
    return {
      ok: false,
      forever: true,
      rebel: true,
      msg: '叛军没有议和桌：他们连使者都不见，只能打到一方彻底倒下。',
    };
  }
  if (state.noPeaceForever && state.noPeaceForever[faction]) {
    return {
      ok: false,
      forever: true,
      msg: '你斩了他们的君主，这一家的血债永世不消，任何议和文书都会被退回。',
    };
  }
  const rel = state.relations[faction] || 0;
  const killDay = state.killRecords ? state.killRecords[faction] : null;
  if (killDay) {
    const passed = state.clock.day - killDay;
    if (passed < 30) {
      return {
        ok: false,
        killed: true,
        waitDays: 30 - passed,
        msg: '你的人头还挂在对方的军旗下。杀将未满一个月，议和必被驳回，还要再等 ' + (30 - passed) + ' 天。',
      };
    }
  }
  let cost = Math.max(40, Math.round((100 - rel) * 2 + 40));
  if (rel > 40) cost = Math.round(cost * 0.6);
  const doubled = !!killDay;
  if (doubled) cost *= 2;
  return {
    ok: true,
    cost: cost,
    killed: doubled,
    rel: rel,
    msg: '议和赔款 ' + cost + ' 金钱' + (doubled ? '（杀将旧账，翻一倍）' : '') + '。',
  };
}

/** 主动向一个势力宣战：一纸战书，不需要对方同意 */
/** 给界面用：玩家攻城前先问一句能不能打、为什么不能。 */
function canPlayerAttackSite(state, site) {
  return war.canSiegeSiteFromFaction(state, 'player', site);
}

/** 给界面用：玩家能不能向这个势力宣战，以及拒绝原因。 */
function canPlayerDeclareFaction(state, faction) {
  return war.canPlayerDeclareFaction(state, faction);
}

function canPlayerDeclareSite(state, site) {
  return war.canPlayerDeclareSite(state, site);
}

function declareWarFaction(state, faction) {
  if (!state || !faction || !FACTIONS[faction] || faction === 'player' || faction === 'bandit') {
    return { ok: false, msg: '不能向这个势力宣战' };
  }
  if ((state.factionState[faction] || {}).dead) return { ok: false, msg: '这个势力已经亡了' };
  if (war.atWar(state, 'player', faction)) return { ok: false, msg: '你已经在和他们打仗' };
  const check = war.canPlayerDeclareFaction(state, faction);
  if (!check.ok) return check;
  if (!war.declare(state, 'player', faction, false)) {
    return { ok: false, msg: '战书没能递出去：先看看邻国和交战数量。' };
  }
  state.wars[faction] = true;
  state.playerWarSince = state.playerWarSince || {};
  state.playerWarSince[faction] = state.playerWarSince[faction] || state.clock.day;
  state.relations[faction] = Math.min(state.relations[faction] || 0, -35);
  pushLog(state, '你向' + FACTIONS[faction].full + '递了战书。使者出门时，两家的边关已经点起了烽火。', 'war');
  return { ok: true, msg: '已向' + FACTIONS[faction].full + '宣战' };
}

/** 花钱议和：关系、杀将冷却和赔款都在 peaceTerms 里算 */
function cancelSiegeAgainstPeace(state, faction) {
  const ps = state && state.playerSiege;
  if (!ps) return false;
  const site = siteById(state.world, ps.siteId);
  if (!site || site.ownerFaction !== faction) return false;
  const r = cancelPlayerSiege(state);
  return !!(r && r.ok);
}

function makePeaceWith(state, faction) {
  const terms = peaceTerms(state, faction);
  if (!terms.ok) return terms;
  if (state.player.gold < terms.cost) {
    return { ok: false, msg: '赔款要 ' + terms.cost + ' 金钱，你身上只有 ' + state.player.gold + '。' };
  }
  if (!war.makePeace(state, 'player', faction, false)) {
    return { ok: false, msg: '对方把文书退了回来：这笔血债，不是钱能了的。' };
  }
  state.player.gold -= terms.cost;
  cancelSiegeAgainstPeace(state, faction);
  state.relations[faction] = 0;
  pushLog(state, '你付出 ' + terms.cost + ' 金钱，与' + FACTIONS[faction].full + '议和。边关的鼓角停了一阵。', 'war');
  return { ok: true, msg: '已与' + FACTIONS[faction].full + '议和，赔付 ' + terms.cost + ' 金钱', cost: terms.cost };
}

/** 敌国主动求和：玩家接受得一支天机简，关系归零；拒绝不留任何惩罚。 */
function acceptPeaceOffer(state, faction) {
  if (!state || !state.peaceOfferPending || state.peaceOfferPending !== faction) {
    return { ok: false, msg: '这封求和书已经过期了。' };
  }
  if (state.noPeaceForever && state.noPeaceForever[faction]) {
    state.peaceOfferPending = null;
    return { ok: false, msg: '你斩了他们的君主，使者连营门都进不来。这一家与你永世不议和。' };
  }
  const hadWar = war.atWar(state, 'player', faction) || !!(state.wars && state.wars[faction]);
  if (!hadWar) return { ok: false, msg: '两家已经不在交战了。' };
  // 旧档可能只有 state.wars，没有 factionWars 里的记录：能收兵就直接收
  if (war.atWar(state, 'player', faction) && !war.makePeace(state, 'player', faction, true)) {
    return { ok: false, msg: '对方的使者已经走了。' };
  }
  if (state.wars) state.wars[faction] = false;
  cancelSiegeAgainstPeace(state, faction);
  state.peaceOfferPending = null;
  state.relations[faction] = 0;
  state.player.shi = (state.player.shi || 0) + 1;
  pushLog(state, '你接了' + FACTIONS[faction].full + '的求和书。两家罢兵，关系归零；使者留下一支天机简。', 'war');
  return { ok: true, msg: '已议和 · 天机简 +1 · 关系归零' };
}

/** 拒绝求和：不扣关系、不掉声望，只是这封文书作废。 */
function rejectPeaceOffer(state, faction) {
  if (!state || !state.peaceOfferPending || state.peaceOfferPending !== faction) {
    return { ok: false, msg: '这封求和书已经过期了。' };
  }
  state.peaceOfferPending = null;
  pushLog(state, '你把' + FACTIONS[faction].full + '的求和书退了回去。使者收拾行装，出了营门。', 'war');
  return { ok: true, msg: '已拒绝议和' };
}

function declareWar(state, site) {  const f = site.ownerFaction;
  if (!f || f === 'bandit') return { ok: false, msg: '这里没有可宣战的对象' };
  if (state.player.faction === f) return { ok: false, msg: '你不能对自己的国宣战' };
  const check = war.canPlayerDeclareSite(state, site);
  if (!check.ok) return check;
  state.wars[f] = true;
  state.playerWarSince = state.playerWarSince || {};
  state.playerWarSince[f] = state.playerWarSince[f] || state.clock.day;
  if (war && war.declare) war.declare(state, 'player', f, true);
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
  sunce: 'lord', zhangxiu: 'lord', wenyang: 'lord', dengai: 'lord', jiangwei: 'lord',
  caozhang: 'lord', huaxiong: 'lord', liyan: 'lord',
};
const RANK_NAME = { king: '君主', lord: '领兵者', general: '将领' };
const RANK_RATE = { king: 5, lord: 3, general: 2 };
// 等级只决定带兵上限，不决定地位；君主 9 级、领兵者 7 级、普通将领 5 级。
const LORD_LEVEL_BY_RANK = { king: 9, lord: 7, general: 5 };

function lordRank(lord) {
  if (lord && lord.rank) return lord.rank;
  if (lord && FACTIONS[lord.faction] && FACTIONS[lord.faction].lord === lord.name) return 'king';
  return LORD_RANK[lord.id] || 'general';
}

function lordLevelForRank(rank) {
  return LORD_LEVEL_BY_RANK[rank] || LORD_LEVEL_BY_RANK.general;
}

function lordLevel(lord) {
  if (!lord) return 1;
  const explicit = Number(lord.level);
  if (explicit >= 1) return Math.max(1, Math.min(10, Math.round(explicit)));
  return lordLevelForRank(lordRank(lord));
}

/** 等级带兵上限：1 级 70，6 级 170，10 级 250；历史领主不低于原编制 */
function lordCapForLevel(level) {
  const lv = Math.max(1, Math.min(10, Math.round(Number(level) || 1)));
  return 50 + lv * 20;
}

function lordPowerInfo(lord) {
  return LORD_POWER_BY_ID[lord && lord.id] || null;
}

/** 名将榜上限 × 国别系数；魏国名将多，单体上限下调，避免堆出双倍兵力。 */
function lordBaseCap(lord) {
  if (!lord) return 30;
  const mul = Number(FACTION_ROSTER_MUL[lord.faction]) || 1;
  // 将帅值：带兵指数的标幺值，1.0 = 150 人；三类身份在 applyLordRoles 里取最高。
  if (lord.commandValue !== null && lord.commandValue !== undefined) {
    return commandCapFor(lord.commandValue, mul);
  }
  const power = lordPowerInfo(lord);
  const base = power ? power.cap : lordCapForLevel(lordLevel(lord));
  return Math.max(40, Math.round(base * mul));
}

function lordPowerCap(lord) {
  if (!lord) return 0;
  if (lord.commandValue !== null && lord.commandValue !== undefined) return lordBaseCap(lord);
  const power = lordPowerInfo(lord);
  if (!power) return 0;
  return lordBaseCap(lord);
}

function lordTroopCap(lord) {
  if (!lord) return 30;
  if (lord.commandValue !== null && lord.commandValue !== undefined) return lordBaseCap(lord);
  if (lordPowerInfo(lord)) return lordPowerCap(lord);
  // 有国别系数的势力（目前是魏）连国君与榜外领主也按系数收口；其余势力仍保底原编制。
  if (FACTION_ROSTER_MUL[lord.faction]) return lordBaseCap(lord);
  const defCount = army.troopCount(lord.defTroops || lord.troops || {});
  return Math.max(defCount, lordCapForLevel(lordLevel(lord)));
}

function lordRecruitMul(lord) {
  const power = lordPowerInfo(lord);
  // 君主默认 1.5；榜单速率高于 1.5 时取榜单值，低于 1.5 时仍按 1.5。
  const base = lordRank(lord) === 'king' ? DEFAULT_MONARCH_RECRUIT_MUL : 1;
  return power ? Math.max(base, power.recruitMul) : base;
}

/* ------------------------------------------------------------ 四阶精锐 */

/** 各势力四阶兵的“门面兵种”：名将榜领主与君主至少带一队。 */
const LORD_T4_BY_FACTION = {
  wei: 'wei_t4', shu: 'shu_t4', wu: 'wu_t4', yuan: 'yuan_t4',
  lv: 'lv_t4', ma: 'ma_t4', xianbei: 'xianbei_t4',
  zhang: 'zhang_t4', zhanglu: 'zhanglu_t4', nanman: 'nanman_t4',
  shanyue: 'shanyue_t4', yuanshu: 'yuanshu_t4', biao: 'biao_t4',
  gongsun: 'gongsun_t4', hansui: 'hansui_t4', han: 'han_t4',
  player: 'guard', rebel: 'guard',
};
const LORD_T4_FALLBACK = 'guard';
const LORD_T4_RATIO = 0.05;
const LORD_T4_MIN = 4;
const LORD_T4_MAX = 8;
const LORD_T5_RATIO = 0.02;
const LORD_T5_MIN = 1;
const LORD_T5_MAX = 6;

function lordTier4Unit(faction) {
  return LORD_T4_BY_FACTION[faction] || LORD_T4_FALLBACK;
}

function rosterHasTier4(roster) {
  return Object.keys(roster || {}).some(function (id) {
    return TROOPS[id] && Number(TROOPS[id].tier) === 4;
  });
}

/** 名将榜前 50、帅才 Top20 或国君：只有这批人配带四阶精锐。 */
function lordKeepsTier4(lord) {
  if (!lord) return false;
  if (LORD_POWER_BY_ID[lord.id]) return true;
  if (MARSHAL_BY_ID[lord.id]) return true;
  if (lord.rank === 'king') return true;
  const f = FACTIONS[lord.faction];
  return !!(f && f.lord && f.lord === lord.name);
}

function stripTier4(roster) {
  if (!roster) return false;
  let changed = false;
  Object.keys(roster).forEach(function (id) {
    if (TROOPS[id] && Number(TROOPS[id].tier) === 4) {
      delete roster[id];
      changed = true;
    }
  });
  return changed;
}

/** 给没有四阶兵的资格领主补一小队：从人数最多的一阶兵里换，不凭空加总兵力。 */
function injectTier4(roster, unit) {
  if (!roster || rosterHasTier4(roster)) return false;
  const total = army.troopCount(roster);
  if (total <= 0) return false;
  const add = Math.max(LORD_T4_MIN, Math.min(LORD_T4_MAX, Math.round(total * LORD_T4_RATIO)));
  let donor = null;
  Object.keys(roster).forEach(function (id) {
    if (TROOPS[id] && Number(TROOPS[id].tier) >= 4) return;
    if (!donor || (roster[id] || 0) > (roster[donor] || 0)) donor = id;
  });
  let put = add;
  if (donor) {
    const take = Math.min(put, Math.max(0, (roster[donor] || 0) - 1));
    roster[donor] -= take;
    if (roster[donor] <= 0) delete roster[donor];
    put = take;
  }
  if (put > 0) roster[unit] = (roster[unit] || 0) + put;
  return put > 0;
}

/**
 * 单个领主的四阶兵归一：够资格的保留数量、换成当前势力的门面兵；
 * 不够资格的全部剥掉。换旗（张辽归魏、张郃降曹）时也要走一遍。
 */
function normalizeLordTier4(lord) {
  if (!lord || !lord.faction) return;
  const unit = lordTier4Unit(lord.faction);
  const keep = lordKeepsTier4(lord);
  [lord.defTroops, lord.troops].forEach(function (roster) {
    if (!roster) return;
    if (!keep) { stripTier4(roster); return; }
    let count = 0;
    Object.keys(roster).forEach(function (id) {
      if (TROOPS[id] && Number(TROOPS[id].tier) === 4) {
        count += roster[id] || 0;
        delete roster[id];
      }
    });
    if (count > 0) roster[unit] = (roster[unit] || 0) + count;
    else injectTier4(roster, unit);
  });
}

/**
 * 四阶兵资格：名将榜前 50、君主保留；榜外且不是国君的领主一律剥掉四阶兵。
 * 旧档里既成事实的四阶兵也会被清掉，保证“精兵只跟名将”的规则一致。
 */
function applyLordTier4Rule(state) {
  if (!state || !Array.isArray(state.lords)) return;
  state.lords.forEach(function (lord) {
    if (!lord || lord.dead) return;
    normalizeLordTier4(lord);
  });
}

/* ------------------------------------------------------------ T5 超级兵 */

/** 只有魏蜀吴有 T5；君主与武力榜前 20 的将领才配带。 */
function lordT5Unit(faction) {
  return factionT5Id(faction);
}

function lordKeepsT5(state, lord) {
  if (!lord || !lord.faction) return false;
  if (!lordT5Unit(lord.faction)) return false;
  if (lordIsRuler(state, lord)) return true;
  const rank = Number(lord.generalRank);
  return rank > 0 && rank <= 20;
}

function stripT5(roster) {
  if (!roster) return 0;
  let count = 0;
  Object.keys(roster).forEach(function (id) {
    const t = TROOPS[id];
    if (t && t.t5) {
      count += roster[id] || 0;
      delete roster[id];
    }
  });
  return count;
}

/** 不够格的 T5 不凭空蒸发，折回本国 T4，保证总兵力不变。 */
function foldT5IntoT4(roster, faction, count) {
  if (!roster || count <= 0) return;
  const t4 = lordTier4Unit(faction);
  if (!t4 || !TROOPS[t4]) return;
  roster[t4] = (roster[t4] || 0) + count;
}

function injectT5(roster, unit) {
  if (!roster || !unit) return false;
  if (Object.keys(roster).some(function (id) { return id === unit; })) return false;
  const total = army.troopCount(roster);
  if (total <= 0) return false;
  const add = Math.max(LORD_T5_MIN, Math.min(LORD_T5_MAX, Math.round(total * LORD_T5_RATIO)));
  let donor = null;
  Object.keys(roster).forEach(function (id) {
    const t = TROOPS[id];
    if (t && (t.t5 || Number(t.tier) >= 4)) return;
    if (!donor || (roster[id] || 0) > (roster[donor] || 0)) donor = id;
  });
  let put = add;
  if (donor) {
    const take = Math.min(put, Math.max(0, (roster[donor] || 0) - 1));
    roster[donor] -= take;
    if (roster[donor] <= 0) delete roster[donor];
    put = take;
  }
  if (put > 0) roster[unit] = (roster[unit] || 0) + put;
  return put > 0;
}

/** 单个领主的 T5 归一：T5 只留在魏蜀吴的君主/武力榜前 20 手里。 */
function normalizeLordT5(state, lord) {
  if (!lord || !lord.faction) return;
  const unit = lordT5Unit(lord.faction);
  const keep = lordKeepsT5(state, lord);
  [lord.defTroops, lord.troops].forEach(function (roster) {
    if (!roster) return;
    const count = stripT5(roster);
    if (count > 0) {
      if (keep && unit) {
        const keepCount = Math.min(LORD_T5_MAX, count);
        roster[unit] = (roster[unit] || 0) + keepCount;
        foldT5IntoT4(roster, lord.faction, count - keepCount);
      } else {
        foldT5IntoT4(roster, lord.faction, count);
      }
    }
    if (keep && unit) injectT5(roster, unit);
  });
}

function applyLordT5Rule(state) {
  if (!state || !Array.isArray(state.lords)) return;
  state.lords.forEach(function (lord) {
    if (!lord || lord.dead) return;
    normalizeLordT5(state, lord);
  });
}

/**
 * 读旧档 / 换旗后把领主编制换成当前国家兵种。
 * 已在目标国编制内的兵原样保留；异国兵按角色折成同档。
 */
function migrateLordFactionTroops(state) {
  if (!state || !Array.isArray(state.lords)) return;
  state.lords.forEach(function (lord) {
    if (!lord || !lord.faction) return;
    if (lord.defTroops) {
      lord.defTroops = convertRosterToFaction(lord.defTroops, lord.faction);
    }
    if (lord.troops) {
      lord.troops = convertRosterToFaction(lord.troops, lord.faction, { preserveT5: true });
    }
  });
}

/** 读档/开局统一入口：旧档先折兵种，再按身份校正 T5。 */
function migrateFactionTroops(state) {
  if (!state) return;
  migrateLordFactionTroops(state);
  const p = state.player;
  if (p && p.faction && p.faction !== 'player' && FACTION_TROOPS[p.faction]) {
    p.troops = convertRosterToFaction(p.troops || {}, p.faction, { preserveT5: true });
  }
  applyLordT5Rule(state);
  if (!state.player) return;
  state.player.t5Unlocked = state.player.t5Unlocked || {};
  // 旧档里已经亡国的魏蜀吴，如果最后一座城是玩家打下的，补记 T5 解锁。
  Object.keys(state.factionState || {}).forEach(function (id) {
    const fs = state.factionState[id];
    if (fs && fs.dead && fs.lastConqueror === 'player') state.player.t5Unlocked[id] = true;
  });
  // 旧档据点没有 originFaction：先补文化来源，再按当前管辖势力重铺兵源。
  if (state.world && Array.isArray(state.world.sites)) {
    state.world.sites.forEach(function (site) {
      if (!site.originFaction) site.originFaction = site.faction || site.ownerFaction || null;
      syncSiteRecruitList(site, effectiveSiteFaction(state, site), state);
    });
  }
}

/** 把领主的满编编制按名将榜上限放大；初始 troops 不动，后续靠招兵补满。 */
function lordRosterToCap(base, cap) {
  const src = base && Object.keys(base).length ? base : { militia: 1 };
  const total = army.troopCount(src);
  const target = Math.max(1, Math.round(Number(cap) || 0));
  if (target <= total) return deepCopy(src);
  const ids = Object.keys(src);
  const out = {};
  let assigned = 0;
  ids.forEach(function (id, i) {
    if (i === ids.length - 1) {
      out[id] = Math.max(1, target - assigned);
    } else {
      out[id] = Math.max(1, Math.round(target * (src[id] || 0) / total));
    }
    assigned += out[id];
  });
  return out;
}

/** 按比例把编制整体缩放（可缩可扩），用于魏国名将上限下调后的旧档收口。 */
function lordRosterScale(base, cap) {
  const src = base && Object.keys(base).length ? base : { militia: 1 };
  const total = army.troopCount(src);
  const target = Math.max(1, Math.round(Number(cap) || 0));
  if (!total || Math.abs(target - total) <= 1) return deepCopy(src);
  const ids = Object.keys(src);
  const out = {};
  let assigned = 0;
  ids.forEach(function (id, i) {
    if (i === ids.length - 1) {
      out[id] = Math.max(1, target - assigned);
    } else {
      out[id] = Math.max(1, Math.round(target * (src[id] || 0) / total));
    }
    assigned += out[id];
  });
  return out;
}

/** 判断君主：优先看势力状态里的 rulerId，旧档再看 FACTIONS.lord 名字。 */
function lordIsRuler(state, lord) {
  if (!state || !lord || !lord.faction) return false;
  const fs = state.factionState && state.factionState[lord.faction];
  if (fs && fs.rulerId) return fs.rulerId === lord.id;
  const f = FACTIONS[lord.faction];
  return !!(f && f.lord && f.lord === lord.name);
}

/**
 * 三类身份落到领主身上：将帅值、武力值、军师档位。
 * 同一类只取最高值；三类之间互不覆盖，可以同时存在。
 */
function applyLordRoles(state) {
  if (!state || !Array.isArray(state.lords)) return;
  state.lords.forEach(function (lord) {
    if (!lord) return;
    const info = roleInfoFor(lord, { isRuler: lordIsRuler(state, lord) });
    lord.commandValue = info.command;
    lord.forceValue = info.force;
    lord.strategistGrade = info.strategist ? info.strategist.grade : null;
    lord.strategistPct = info.strategist ? info.strategist.pct : 0;
    lord.strategistCap = info.strategist ? info.strategist.cap : 0;
    lord.marshalRank = info.marshal ? info.marshal.rank : null;
    lord.generalRank = info.general ? info.general.rank : null;
  });
}

/** 新开局与旧档迁移共用：给有将帅值的领主补足满编编制，并写入名次/倍率。 */
function applyLordPowerRoster(state) {
  if (!state || !Array.isArray(state.lords)) return;
  state.lords.forEach(function (lord) {
    const power = lordPowerInfo(lord);
    if (power) {
      lord.powerRank = power.rank;
      lord.powerScore = power.score;
    }
    lord.recruitMul = lordRecruitMul(lord);
    if (lord.commandValue === null || lord.commandValue === undefined) return;
    // 随军谋士只保留少量亲兵，不按将帅值补成满编军团，避免凭空多出大军。
    if (lord.strategistOnly) return;
    const cap = lordTroopCap(lord);
    const defCount = army.troopCount(lord.defTroops || {});
    if (defCount < cap) lord.defTroops = lordRosterToCap(lord.defTroops, cap);
    else if (defCount > cap) lord.defTroops = lordRosterScale(lord.defTroops, cap);
    // 现兵也夹到新上限：改档后不能留着超过新上限的部队。
    const nowCount = army.troopCount(lord.troops || {});
    if (nowCount > cap) lord.troops = lordRosterScale(lord.troops, cap);
  });
}

/** 有国别系数的势力把满编与现存兵力都夹到新上限；只缩不扩。 */
function applyFactionRosterCap(state) {
  if (!state || !Array.isArray(state.lords)) return;
  state.lords.forEach(function (lord) {
    if (!lord || !FACTION_ROSTER_MUL[lord.faction]) return;
    const cap = lordTroopCap(lord);
    [lord.defTroops, lord.troops].forEach(function (roster, i) {
      if (!roster) return;
      if (army.troopCount(roster) > cap) {
        const scaled = lordRosterScale(roster, cap);
        if (i === 0) lord.defTroops = scaled;
        else lord.troops = scaled;
      }
    });
  });
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

/** 每次对话随机一句闲聊，结合当前战事。
 * 八小时内反复问“你在做什么”必须还是同一句，免得玩家以为他在不停改口。
 */
function lordIdle(state, lord) {
  const now = gameHours(state);
  if (lord.askCache && now >= lord.askCache.at && now - lord.askCache.at < 8) {
    return lord.askCache.line;
  }
  const t = lordLines(lord);
  const pool = (t.idle || []).slice();
  const war = state.wars || {};
  let atWar = false;
  Object.keys(war).forEach(function (id) { if (war[id] && id !== 'bandit') atWar = true; });
  if (atWar && t.warLine) pool.push(t.warLine);
  const pick = pool[Math.floor(state.rng.random() * pool.length)] || '在巡视营地。';
  lord.askCache = { at: now, line: pick };
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
  state.playerWarSince = state.playerWarSince || {};
  state.playerWarSince[lord.faction] = state.playerWarSince[lord.faction] || state.clock.day;
  if (war && war.declare) war.declare(state, 'player', lord.faction, true);
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
  if (!state || !state.campaign) return null;
  if (state.campaignDisabled) return null;
  const stage = state.campaign.stage;
  return CAMPAIGN[Math.min(stage, CAMPAIGN.length - 1)];
}

/** 下一步该去哪——只指路，不剧透后面的事 */
const CAMPAIGN_HINT = {
  reach_chenliu: '往东走到陈留。路上别停，西凉步卒会追。',
  troops_30: '在陈留一带招兵，凑到 30 人；市集里也备点粮。',
  win_puyang: '带上 45 人以上去濮阳。黄巾余部就在城外截粮，到了就开打。',
  troops_60_food: '募到 60 人、粮草备足 80。人不够就往北走，去了乌巢也是送。',
  win_wuchao: '带 90 人以上回官渡。到了就会有一场硬仗。',
  take_xiapi: '南下打下邳。',
  win_chibi: '去赤壁或柴桑，水战自己会来。',
  win_yiling: '去夷陵。',
  troops_120: '白门楼后收拢降卒，把队伍补到 120 人。',
  reach_shouchun: '南下寿春，看看淮南的粮市。',
  reach_xiakou: '再往南到夏口，借船过江。',
  win_final: '带 250 人以上，打进任意一座都城（许昌 / 成都 / 建业 / 邺）。',
};

/** 当前主线在地图上的落点：点任务卡时把镜头送过去 */
const CAMPAIGN_TARGET_SITE = {
  prologue: 'chenliu', act1: 'chenliu', act1b: 'puyang', act1c: 'chenliu',
  act2: 'guandu', act3: 'xiapi', act3b: 'xiapi', act3c: 'shouchun',
  act3d: 'xiakou', act4: 'chibi', act5: 'yiling', final: 'xuchang',
};

function campaignTargetPos(state) {
  if (!state || !state.campaign || state.campaignDisabled) return null;
  const ch = CAMPAIGN[state.campaign.stage];
  if (!ch) return null;
  const site = siteById(state.world, CAMPAIGN_TARGET_SITE[ch.id]);
  if (!site) return null;
  return { x: site.x, y: site.y, name: site.name, siteId: site.id, kind: 'campaign' };
}

function campaignInfo(state) {
  if (!state || !state.campaign || state.campaignDisabled) return null;
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

function advanceCampaign(state, depth) {
  if (state && state.campaignDisabled) return;
  if (!state || !state.campaign) return;
  const d = depth || 0;
  // 一章完成会立刻检查下一章；正常最多十几层。这里留一个硬上限，
  // 防止旧档字段异常时递归打穿调用栈，表现成整局卡死。
  if (d > 24) return;
  const c = state.campaign;
  if (!c || typeof c !== 'object') return;
  if (!Array.isArray(c.done)) c.done = [];
  if (!state.flags) state.flags = {};
  if (!Array.isArray(state.flags.campaignDone)) state.flags.campaignDone = [];
  if (typeof c.stage !== 'number' || !isFinite(c.stage)) c.stage = 0;
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
    advanceCampaign(state, d + 1);
  }
}

function checkCampaign(state, key) {
  const p = state.player;
  const count = army.troopCount(p.troops);
  if (key === 'reach_chenliu') {
    // 步卒会一路追到陈留；进了陈留城，序章追兵就撤了
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
  if (key === 'troops_120') return count >= 120;
  if (key === 'reach_shouchun') return p.atSiteId === 'shouchun';
  if (key === 'reach_xiakou') return p.atSiteId === 'xiakou';
  if (key === 'win_final') return !!state.flags['win_final'];
  return false;
}

/** 当前这一章，在哪个据点能打出关键一仗 */
function campaignObjective(state, site) {
  if (!site || !state || !state.campaign || state.campaignDisabled) return null;
  const ch = CAMPAIGN[state.campaign.stage];
  const id = ch && ch.id;
  if (id === 'act1b' && site.id === 'puyang') return { id: 'puyang_raid', name: '黄巾余部', needTroops: 45 };
  if (id === 'act2' && site.id === 'guandu') return { id: 'wuchao', name: '乌巢粮营', needTroops: 90 };
  if (id === 'act4' && (site.id === 'chibi' || site.id === 'chaisang')) return { id: 'chibi', name: '曹操水寨' };
  if (id === 'act5' && site.id === 'yiling') return { id: 'yiling', name: '连营守军' };
  if (id === 'final' && ['xuchang', 'chengdu', 'jianye', 'ye'].indexOf(site.id) >= 0) {
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
    state.flags.storyDone = true;
    // 主线走完不结算结局：把笔放下，让人继续在这张地图上走
    pushLog(state, '主线走完了。你没有再听见“回头”的声音。从此可以自由地在这片三国战场上攻城、守城、结交或背叛，直到有一天你把所有城都踩在脚下。');
    state.events.push({
      type: 'warning',
      text: '主线已走完。从现在起，没有下一页催你；你可以自由享受这场三国战场。',
    });
  }
}

/* ---------------------------------------------------------------- 封领主 */

/** 按等级给出目标编制：等级越高，能带的兵越多，兵种也更齐 */
function lordRosterForLevel(level, total) {
  const lv = Math.max(1, Math.min(10, Math.round(Number(level) || 1)));
  const size = Math.max(1, Math.round(Number(total) || 1));
  const cav = lv >= 7 ? Math.round(size * 0.18) : 0;
  const spear = lv >= 4 ? Math.round(size * 0.24) : 0;
  const out = { militia: Math.max(0, size - cav - spear) };
  if (spear > 0) out.spear = spear;
  if (cav > 0) out.cav = cav;
  return out;
}

/**
 * 把队里的英雄封成领主：必须先指定一块城/村作为封地，
 * 有了封地他才能离开主角的队伍，自己带兵出去。
 */
function promoteHero(state, heroId, siteId) {
  const p = state.player;
  const hero = (p.heroes || []).filter(function (h) { return h.id === heroId; })[0];
  if (!hero) return { ok: false, msg: '队伍里没有这个人' };
  const site = siteById(state.world, siteId);
  if (!site) return { ok: false, msg: '先给他选一块封地，他才能出镇' };
  if (site.type === 'camp') return { ok: false, msg: '山寨不能当封地' };
  if (!site.playerOwned) return { ok: false, msg: '这块地方不是你的' };
  const current = siteLord(state, site);
  if (current) return { ok: false, msg: site.name + '已经封给' + current.name + '了，先收回再封' };

  const lv = Math.max(1, Math.min(10, Math.round(hero.level || 1)));
  const heroDef = heroes.heroById(hero.id) || {};
  const heroName = heroDef.name || hero.name || hero.id;
  const id = 'hero_' + hero.id;
  if (state.lords.some(function (l) { return l.id === id; })) {
    return { ok: false, msg: '他已经在外头带兵了' };
  }

  // 目标编制按等级走，封地封多大就带多少；刚出镇只带一半，之后在封地补满
  const lordFaction = p.faction && FACTIONS[p.faction] ? p.faction : 'player';
  const full = convertRosterToFaction(lordRosterForLevel(lv, lordCapForLevel(lv)), lordFaction);
  const troops = {};
  Object.keys(full).forEach(function (tid) {
    const n = Math.max(0, Math.round(full[tid] * 0.55));
    if (n > 0) troops[tid] = n;
  });
  const lord = {
    id: id,
    name: heroName,
    title: '你的家臣',
    faction: lordFaction,
    home: site.id,
    level: lv,
    x: site.x,
    y: site.y,
    troops: deepCopy(troops),
    morale: 80,
    sight: 6,
    chasing: false,
    alive: true,
    respawnDay: 0,
    defTroops: deepCopy(full),
    wander: null,
    dead: false,
    retired: false,
    prisoner: null,
    hidden: null,
    resting: false,
    hero: true,
    independent: true,
    exPlayer: true,
  };
  site.lordId = lord.id;
  state.lords.push(lord);
  p.heroes = p.heroes.filter(function (h) { return h.id !== heroId; });
  p.renown += 40;
  const startCount = army.troopCount(troops);
  pushLog(state, '你把' + heroName + '封为' + site.name + '的领主，拨了' + startCount +
    ' 名乡勇。他跪下磕了个头，第二天就带着人出镇了。', 'fief');
  return {
    ok: true,
    msg: heroName + '封为' + site.name + '领主（Lv' + lv + ' · 上限 ' + lordTroopCap(lord) + ' 兵，声望 +40）',
    lordId: id,
    siteId: site.id,
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

/** 杀了牢里的人：与那家从此结下血债；一个月内无法议和，之后赔款翻倍 */
function executePrisoner(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) {
    return x.lordId === lordId && x.by === 'player';
  })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  const fac = lord.faction;
  const wasRuler = isFactionRuler(state, lord);
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  // 斩将得赏金：对方越有分量，首级越值钱；但也会彻底得罪那一国
  const bounty = 120 + Math.round(war.weight(lord.defTroops || lord.troops || {}) / 2);
  state.player.gold += bounty;
  state.player.renown += 25;
  lord.prisoner = null;
  war.killLord(state, lord);
  if (wasRuler && fac && FACTIONS[fac]) {
    state.noPeaceForever = state.noPeaceForever || {};
    state.noPeaceForever[fac] = true;
    if (state.peaceOfferPending === fac) state.peaceOfferPending = null;
    successionAfterRulerKilled(state, lord);
  }
  state.killRecords = state.killRecords || {};
  if (fac) state.killRecords[fac] = state.clock.day;
  pushLog(state, '你把' + lord.name + '推出营门斩了，得赏金 ' + bounty + ' 金钱、声望 +25。' +
    (FACTIONS[fac] ? FACTIONS[fac].full : '那家') + (wasRuler
      ? '与你不死不休，永世不会议和。'
      : '与你结下血债，一个月内议和必被驳回。'));
  return {
    ok: true,
    bounty: bounty,
    msg: lord.name + '已斩，得 ' + bounty + ' 金钱。' + (FACTIONS[fac] ? FACTIONS[fac].full : '那家') +
      (wasRuler ? '与你永世不议和。' : '跟你结下血债：一个月内无法议和，之后赔款翻倍。'),
    killed: true,
    ruler: wasRuler,
  };
}

/** 战果页处置败将：放走（换人情）或押进牢里（之后可招降/斩） */
function resolveDefeatedLord(state, action) {
  const pending = state.postBattleLord;
  if (!pending) return { ok: false, msg: '阵前没有等着处置的人' };
  const lord = state.lords.filter(function (l) { return l.id === pending.lordId; })[0];
  if (!lord) { state.postBattleLord = null; return { ok: false, msg: '人已经不在了' }; }
  if (action === 'capture') {
    if (lord.arcNoCapture) {
      return { ok: false, msg: '天下皆反时，这些反贼不会让你生擒；只能放他回去。' };
    }
    war.capture(state, lord, 'player', '你');
    const gold = 60 + Math.round(war.weight(lord.defTroops || {}) / 5);
    lord.ransom = gold;
    const p = (state.prisoners || [])[(state.prisoners || []).length - 1];
    if (p) p.ransom = gold;
    state.postBattleLord = null;
    pushLog(state, '你把' + lord.name + '押进牢里，等着他家人拿 ' + gold + ' 金钱来赎。', 'war');
    return { ok: true, action: 'capture', lordId: lord.id, ransom: gold,
      msg: lord.name + '已押进牢里（赎金 ' + gold + ' 金钱）', note: '生擒 ' + lord.name + ' · 已押进牢里' };
  }
  if (action === 'release') {
    war.freeLord(state, lord, '你把' + lord.name + '放回马下。他抱拳，没有多说。');
    state.postBattleLord = null;
    state.player.renown += 5;
    return { ok: true, action: 'release', lordId: lord.id,
      msg: '放走了' + lord.name + '，声望 +5', note: lord.name + ' 被你放走' };
  }
  return { ok: false, msg: '只能放走或押入牢中' };
}

/* ---------------------------------------------------------------- 灭国 *//** 史实里的改换门庭：被灭的那家散了，这些人该跟谁走 */
const DEFECT_TO = {
  gaoshun: 'wei', houcheng: 'wei', songxian: 'wei', weixu: 'wei',
  zhangliao: 'wei',
  wenpin: 'wei', zhangyun: 'wei', wangwei: 'wei',
  wuyi: 'shu', leitong: 'shu', lengbao: 'shu', liugui: 'shu',
  guotu: 'wei', lvkuang: 'wei', lvxiang: 'wei',
  pangde: 'wei', maxiu: 'shu', matie: 'shu', chengyin: 'wei',
  zhangxiu: 'wei', liyan: 'shu', wulan: 'shu', xingdaorong: 'shu', ehuang: 'shu',
  guanhai: 'wei', wuangou: 'wei', huaxiong: 'wei',
  // 马超无论凉州最后由谁打下来，都固定归蜀，不留在西凉当降将。
  machao: 'shu',
  // 公孙瓒灭亡后，赵云固定流向刘备；无论河北最后由谁拿下都适用。
  zhaoyun: 'shu',
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
  const fs = state.factionState && state.factionState[id];
  if (fs && fs.rulerId) {
    const byId = state.lords.filter(function (l) { return l.id === fs.rulerId; })[0];
    if (byId && byId.alive && !byId.dead && !byId.retired) return byId;
  }
  if (fs && fs.rulerName) {
    const byRuler = state.lords.filter(function (l) {
      return l.faction === id && l.name === fs.rulerName && l.alive && !l.dead && !l.retired;
    })[0];
    if (byRuler) return byRuler;
  }
  const name = (FACTIONS[id] || {}).lord;
  const byName = state.lords.filter(function (l) { return l.faction === id && l.name === name; })[0];
  if (byName) return byName;
  return state.lords.filter(function (l) { return l.faction === id && l.alive; })[0] || null;
}

function isFactionRuler(state, lord) {
  if (!state || !lord || !lord.faction) return false;
  if (lord.faction === 'player' || lord.faction === 'bandit') return false;
  return factionLord(state, lord.faction) === lord;
}

/** 给继任的新君凑一副班底：用老君主的编制折半，没有就按普通诸侯起家 */
function successorTroops(oldLord) {
  const out = {};
  const base = (oldLord && oldLord.defTroops) || {};
  Object.keys(base).forEach(function (id) {
    const n = Math.max(4, Math.round((base[id] || 0) * 0.45));
    if (n > 0) out[id] = n;
  });
  if (!Object.keys(out).length) {
    out.militia = 26;
    out.spear = 18;
    out.cav = 6;
  }
  return out;
}

function successorHome(state, fac, oldLord) {
  const oldHome = oldLord && siteById(state.world, oldLord.home);
  if (oldHome && (oldHome.ownerFaction === fac || oldHome.playerOwned && fac === 'player')) return oldHome;
  const owned = state.world.sites.filter(function (s) {
    return s.ownerFaction === fac && s.type !== 'camp';
  });
  if (!owned.length) return oldHome || null;
  const from = oldHome || oldLord || { x: state.world.w / 2, y: state.world.h / 2 };
  let best = owned[0];
  let bestD = Infinity;
  owned.forEach(function (s) {
    const d = Math.abs(s.x - from.x) + Math.abs(s.y - from.y);
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

function spawnSuccessor(state, fac, entry, oldLord) {
  const home = successorHome(state, fac, oldLord);
  const spot = home ? findFreeSpotNear(state, home.x, home.y, 2) : null;
  const def = {
    id: entry.id,
    name: entry.name,
    title: entry.title || '新君',
    faction: fac,
    home: home ? home.id : (oldLord && oldLord.home),
    soldiers: successorTroops(oldLord),
    morale: 80,
    sight: 7,
  };
  const lord = lordFromDef(state, def);
  lord.rank = 'king';
  lord.level = 9;
  if (!home && oldLord) {
    lord.x = oldLord.x;
    lord.y = oldLord.y;
  } else if (spot) {
    lord.x = spot.x;
    lord.y = spot.y;
  }
  state.lords.push(lord);
  return lord;
}

function installRuler(state, fac, lord, oldLord) {
  const home = successorHome(state, fac, oldLord);
  lord.alive = true;
  lord.dead = false;
  lord.retired = false;
  lord.hidden = null;
  lord.prisoner = null;
  lord.chasing = false;
  lord.hunting = false;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleePath = null;
  lord.order = null;
  lord.defending = null;
  lord.faction = fac;
  lord.rank = 'king';
  lord.level = Math.max(9, lord.level || 9);
  if (!lord.defTroops || !Object.keys(lord.defTroops).length) lord.defTroops = successorTroops(oldLord);
  if (!army.troopCount(lord.troops || {})) {
    lord.troops = takeSomeTroops(lord.defTroops, Math.max(12, Math.round(army.troopCount(lord.defTroops) * 0.55)));
  }
  if (home) {
    lord.home = home.id;
    lord.inCity = null;
    const spot = findFreeSpotNear(state, home.x, home.y, 2);
    if (spot) { lord.x = spot.x; lord.y = spot.y; }
    if (!home.lordId || (oldLord && home.lordId === oldLord.id)) home.lordId = lord.id;
  }
  lord.morale = Math.max(lord.morale || 70, 76);

  const fs = state.factionState[fac] || (state.factionState[fac] = {});
  fs.rulerId = lord.id;
  fs.rulerName = lord.name;
  fs.rulerSinceDay = state.clock.day;
  FACTIONS[fac].lord = lord.name;
  FACTIONS[fac].full = lord.name;
  if (oldLord && lord.name.charAt(0) !== oldLord.name.charAt(0)) {
    FACTIONS[fac].banner = lord.name.charAt(0);
  }

  state.events.push({
    type: 'succession',
    factionId: fac,
    title: (FACTIONS[fac].name || FACTIONS[fac].full) + '国换了新君',
    lines: [
      (oldLord ? oldLord.name : '旧主') + '的首级传回国内，宗亲与旧部在灵前拥立' + lord.name + '。',
      '「' + (FACTIONS[fac].full || lord.name) + '」的旗没有倒，王位先由' + lord.name + '接下。',
      '杀君之仇未消：这一家与你不死不休，任何议和文书都会被退回。',
    ],
  });
  pushLog(state, (oldLord ? oldLord.name : '旧主') + '被斩，' + (FACTIONS[fac].full || lord.name) +
    '由' + lord.name + '继位。丧钟未停，边境的烽火已经点起来了。', 'throne');
  return lord;
}

/** 表里的人都死光了：从本势力活着的领主里挑。优先本地，再看官职与带兵。 */
function fallbackSuccessor(state, fac, oldLord) {
  const candidates = state.lords.filter(function (l) {
    return l && l.faction === fac && l.alive && !l.dead && !l.retired && !l.prisoner && !l.hidden;
  });
  if (!candidates.length) return null;
  const oldHome = oldLord && siteById(state.world, oldLord.home);
  const dist = function (l) {
    if (!oldHome) return 0;
    const home = siteById(state.world, l.home) || l;
    return Math.abs(home.x - oldHome.x) + Math.abs(home.y - oldHome.y);
  };
  const rankScore = { king: 100, lord: 60, general: 20 };
  const sorted = candidates.slice().sort(function (a, b) {
    const rr = (rankScore[lordRank(b)] || 0) - (rankScore[lordRank(a)] || 0);
    if (rr) return rr;
    return dist(a) - dist(b);
  });
  // 官职大、地理近的排前面；最后在最优的三四人里掷一次，保留一点乱世偶然性。
  const pool = sorted.slice(0, Math.min(3, sorted.length));
  return pool[state.rng.int(0, pool.length - 1)];
}

/** 君主被斩：按继任表换君；表用完了就从本地、高官职的领主里选 */
function successionAfterRulerKilled(state, oldLord) {
  if (!state || !oldLord || !oldLord.faction) return null;
  const fac = oldLord.faction;
  if (!FACTIONS[fac] || fac === 'player' || fac === 'bandit') return null;
  if (!factionAlive(state, fac)) return null;
  const fs = state.factionState[fac] || (state.factionState[fac] = {});
  const table = (SUCCESSION[fac] || []).slice();
  let index = Math.max(0, Number(fs.successorIndex) || 0);
  let chosen = null;

  for (let i = index; i < table.length; i++) {
    const entry = table[i];
    if (!entry || !entry.id) continue;
    const existing = state.lords.filter(function (l) { return l.id === entry.id; })[0];
    if (existing) {
      if (existing.faction !== fac || existing.dead || existing.retired || existing.hidden || existing.prisoner) continue;
      if (!existing.alive) continue;
      chosen = existing;
      index = i + 1;
      break;
    }
    chosen = spawnSuccessor(state, fac, entry, oldLord);
    index = i + 1;
    break;
  }

  if (!chosen) {
    chosen = fallbackSuccessor(state, fac, oldLord);
    index = table.length;
  }
  fs.successorIndex = index;
  if (!chosen) return null;
  return installRuler(state, fac, chosen, oldLord);
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
    if (id === 'rebel' && !state.arc) return false;
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
  // 只要在主角队伍里待过，哪怕后来投了别家，全国背叛时也不列叛军。
  const wasPlayer = lord.faction === 'player' || !!lord.exPlayer;
  lord.faction = target;
  if (target === 'player' || wasPlayer) lord.exPlayer = true;
  if (city) {
    lord.home = city.id;
    // 旧旗的封地收回；新投的城如果还没封主，就由他接
    state.world.sites.forEach(function (s) {
      if (s.lordId === lord.id && s.ownerFaction !== target) s.lordId = null;
    });
    if (!city.lordId) city.lordId = lord.id;
    const spot = findFreeSpotNear(state, city.x, city.y, 2) || city;
    lord.x = spot.x;
    lord.y = spot.y;
  }
  lord.alive = true;
  lord.chasing = false;
  lord.hunting = false;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleeFrom = null;
  lord.fleePath = null;
  lord.resting = false;
  lord.hidden = null;
  // 亡国残部投靠时，手里还剩多少兵就带多少兵走；只有原本就打空了的，
  // 才按旧编制补一小队，别让“剩余的兵力”在换旗时凭空消失。
  const left = army.troopCount(lord.troops || {});
  lord.troops = left > 0
    ? takeSomeTroops(lord.troops, left)
    : takeSomeTroops(lord.defTroops, Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.4)));
  lord.respawnDay = 0;
  // 换旗后整套编制换成本国兵：旧国骑兵/弩兵按角色折成新国同档。
  lord.defTroops = convertRosterToFaction(lord.defTroops || {}, target);
  lord.troops = convertRosterToFaction(lord.troops || {}, target, { preserveT5: true });
  // 换旗后四阶精锐也要换门面：张辽、张郃归魏后带亲卫，榜外降将不再保留旧国精锐。
  normalizeLordTier4(lord);
  normalizeLordT5(state, lord);
}

/** 一个势力连城带人都没了，满七天：亡国；opts.silent 用于停战期批量清扫，不发单国文书。 */
function fallFaction(state, id, opts) {
  const silent = !!(opts && opts.silent);
  // 叛军只在统一背叛后才是真正的势力；开局没有城时不能被判亡国。
  if (id === 'rebel' && !state.arc) return false;
  const fs = state.factionState[id] || (state.factionState[id] = {});
  fs.dead = true;
  fs.deadDay = state.clock.day;
  const rng = state.rng;
  const lines = [];
  const ruler = factionLord(state, id);

  if (ruler && ruler.alive) {
    // 国亡了，君主不再“倔强”：他不肯立刻举旗投人，但会藏起来，等一个够分量的招降者
    const villages = state.world.sites.filter(function (s) { return s.type === 'village'; });
    const v = villages.length ? villages[rng.int(0, villages.length - 1)] : null;
    ruler.alive = false;
    ruler.chasing = false;
    ruler.troops = {};
    ruler.prisoner = null;
    ruler.inCity = null;
    // 亡国后旧主不再挂旧国旗：他只剩“隐居的旧主”这层身份，等玩家去请。
    // 旧国名留在 hidden.faction 里，只用来判断关系与出山概率。
    ruler.faction = null;
    ruler.retired = true;
    ruler.hidden = { siteId: v ? v.id : null, since: state.clock.day, faction: id };
    fs.fate = 'hidden';
    fs.hiddenLordId = ruler.id;
    fs.hiddenSiteId = v ? v.id : null;
    lines.push('有人说' + ruler.name + '没死，一个人往' + (v ? v.name : '南边') + '去了。国没了，他那面旗也收了，但人还在。');
  } else if (ruler) {
    fs.fate = ruler.dead ? 'killed' : 'gone';
    lines.push('“' + ruler.name + '”这个名字，从今天的榜文上划掉了。');
  }

  // 剩下的领主：灭国者优先收大部分；小部分逃往邻国，由邻国吸纳。
  // 最后一座城是谁打下的，谁就是灭国者；这条在夺城钩子里记进 fs.lastConqueror。
  const others = state.lords.filter(function (l) {
    return l.faction === id && l.alive && l !== ruler && !l.factionStateFixed;
  });
  const conqueror = fs.lastConqueror;
  // 玩家亲手打掉最后一城：永久解锁该国 T5；此后自己的城可以招这国降卒。
  if (conqueror === 'player') {
    state.player.t5Unlocked = state.player.t5Unlocked || {};
    state.player.t5Unlocked[id] = true;
    fs.t5ConqueredByPlayer = true;
  }
  const conquerorAlive = !!(conqueror && (conqueror === 'player'
    ? state.player.faction === 'player' && state.world.sites.some(function (s) { return s.playerOwned; })
    : factionAlive(state, conqueror)));
  // 灭国分三档：史实固定的去向（DEFECT_TO）先走；剩下的六成半归攻破最后城池的人；
  // 其余没有固定去向的，全部由邻国就近吸纳。只有宁死不降的（LOYAL_GONE）才隐居。
  // 不能再让带兵的旧部留在原地打旧旗号。
  const flexible = others.filter(function (l) { return !LOYAL_GONE[l.id] && !DEFECT_TO[l.id]; });
  const shareQuota = conquerorAlive ? Math.ceil(flexible.length * 0.65) : 0;
  let givenToConqueror = 0;
  const gone = [];
  const retired = [];
  others.forEach(function (l) {
    if (LOYAL_GONE[l.id]) {
      l.alive = false;
      l.retired = true;
      l.troops = {};
      gone.push(l.name);
      return;
    }
    // 史实里已经写好的去向优先：张辽从吕布旗下转入魏，赵云从公孙瓒旗下转入蜀。
    const fixedTo = DEFECT_TO[l.id];
    let target = fixedTo && factionAlive(state, fixedTo) ? fixedTo : null;
    if (!target && conquerorAlive && givenToConqueror < shareQuota) {
      target = conqueror;
    }
    if (!target) target = pickFactionFor(state, l, id);
    if (!target) {
      l.alive = false;
      l.retired = true;
      l.troops = {};
      retired.push(l.name);
      return;
    }
    if (target === conqueror) givenToConqueror += 1;
    moveLordToFaction(state, l, target);
    lines.push(l.name + '带着残部投了' + (FACTIONS[target].full || target) + '。');
  });
  if (conquerorAlive && givenToConqueror > 0) {
    lines.unshift('最后一座城是' + (conqueror === 'player' ? '你的旗' : (FACTIONS[conqueror].full || conqueror)) +
      '打下的，' + givenToConqueror + ' 名领主归入其帐下。');
  }
  if (id === 'ma') {
    lines.unshift('马腾兵败，马超率西凉铁骑投了刘备。');
  }
  if (gone.length) {
    lines.push(gone.slice(0, 4).join('、') + '不肯降，解甲归乡里去了。');
  }
  if (retired.length) {
    lines.push(retired.slice(0, 4).join('、') + '见大势已去，散部归田。');
  }

  // 这个势力的旗从此从地图上撤掉（跟你的旧关系留着：村里那个隐者还认这个）
  state.world.sites.forEach(function (s) {
    if (s.ownerFaction === id) s.ownerFaction = null;
  });
  // 灭国解锁 T5 后要强制重铺玩家城兵源，不能因为“旗没变”被跳过。
  refreshSiteRosters(state, true, true);
  war.dropFactionWars(state, id);
  if (silent) return true;
  pushLog(state, '【' + (FACTIONS[id].full || id) + '】亡了。');
  state.events.push({
    type: 'faction-fall',
    factionId: id,
    title: (FACTIONS[id].full || id) + ' 亡了',
    fate: fs.fate || 'killed',
    lines: lines,
  });
  return true;
}

/** 每日：灭国倒计时（连着七天没城没人，才算亡） */
function factionTick(state) {
  if (!state.factionState) state.factionState = {};
  Object.keys(FACTIONS).forEach(function (id) {
    if (id === 'bandit' || id === 'player') return;
    // 叛军不是开局的正常诸侯：它在“全国背叛”前没有城也没有人，
    // 不能按普通势力跑七天灭国倒计时，否则开局就会误弹“叛军 亡了”。
    // 统一背叛后 state.arc 存在，叛军才真正接管全国，重新参与存亡判定。
    if (id === 'rebel' && !state.arc) return;
    const fs = state.factionState[id] || (state.factionState[id] = {});
    if (fs.dead) return;
    if (factionAlive(state, id)) {
      if (fs.doomDays) {
        pushLog(state, (FACTIONS[id].full || id) + '又重新站住了。');
      }
      fs.doomDays = 0;
      fs.doomDay = 0;
      // 又夺回城了：最后一座城的记录作废，下一次亡国重新计算。
      // 只剩野外残部不算复国，不能把灭国者记录冲掉。
      const hasCity = state.world.sites.some(function (s) {
        return s.type !== 'camp' && s.ownerFaction === id;
      });
      if (hasCity && fs.lastConqueror) {
        fs.lastConqueror = null;
        fs.lastCityId = null;
        fs.lastLossDay = 0;
      }
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
  // 国亡了，旧主不再端着架子；只要你打听出来，就能上门谈
  if ((state.factionState[lord.hidden.faction] || {}).dead) return true;
  const rel = state.relations[lord.hidden.faction] || 0;
  return rel >= 60;
}

/** 请隐居的旧主出山：跟着你干 */
function recruitHiddenLord(state, siteId) {
  const lord = hiddenLordsAt(state, siteId)[0];
  if (!lord) return { ok: false, msg: '这里没有这样的人。' };
  if (!hiddenLordVisible(state, lord)) return { ok: false, msg: '村里人不肯多说这个人的事。' };
  if (lord.arcNoRecruit || lord.arcEnemy) {
    return { ok: false, msg: '天下皆反。这位旧主已经举起了反旗，不会再跟你走。' };
  }
  if (state.clock.day < (lord.recruitCoolDay || 0)) {
    return { ok: false, cooldown: true, waitDays: (lord.recruitCoolDay || 0) - state.clock.day,
      msg: lord.name + '把门掩上：“让我再想几天。”' };
  }
  lord.recruitCoolDay = state.clock.day + 3;
  const deadFaction = !!(state.factionState[lord.hidden.faction] || {}).dead;
  const rel = state.relations[lord.hidden.faction] || 0;
  const chance = deadFaction ? 0.55 + Math.max(0, rel) / 250 : 0.35 + rel / 200;
  if (state.rng.next() > chance) {
    return { ok: false, msg: lord.name + '摇了摇头：' + (FACTIONS[lord.hidden.faction] ? FACTIONS[lord.hidden.faction].full : '故国') + '的旗，他扛不动第二面了。' };
  }
  const target = state.player.faction || 'player';
  lord.hidden = null;
  lord.alive = true;
  lord.faction = target;
  if (target === 'player') lord.exPlayer = true;
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

/* ---------------------------------------------------------------- 天机简·广告 */

const AD_SHI_MAX = 5;      // 一天最多 5 次，每次 2 支，共 10 支
const AD_SHI_PER = 2;

function adShiInfo(state) {
  if (!state || !state.player) return { max: AD_SHI_MAX, used: 0, left: 0, shiPer: AD_SHI_PER };
  const p = state.player;
  if (p.adShiDay !== state.clock.day) {
    p.adShiDay = state.clock.day;
    p.adShiCount = 0;
  }
  return {
    day: state.clock.day,
    max: AD_SHI_MAX,
    used: p.adShiCount || 0,
    left: Math.max(0, AD_SHI_MAX - (p.adShiCount || 0)),
    shiPer: AD_SHI_PER,
  };
}

/** 看完一次激励视频后领取；真实广告 SDK 在 runtime.showRewardedAd 里 */
function claimAdShi(state) {
  const info = adShiInfo(state);
  if (info.left <= 0) {
    return { ok: false, msg: '今天的十支天机简已经领完了，明日再来。', info: info };
  }
  state.player.adShiCount = (state.player.adShiCount || 0) + 1;
  state.player.shi += AD_SHI_PER;
  pushLog(state, '你看完一段军情广告，从局内商店领走 ' + AD_SHI_PER + ' 支天机简。');
  return {
    ok: true,
    msg: '领到 ' + AD_SHI_PER + ' 支天机简（今日 ' + (state.player.adShiCount) + '/' + AD_SHI_MAX + ' 次）',
    info: adShiInfo(state),
  };
}

/* ------------------------------------------------------- 商店·现实日广告奖励 */

const AD_REWARD_MAX = 10;
const AD_REWARD_GOLD = 1000;
// 调试期把粮草广告奖励临时拉高，方便观察各国第一阶段怎么打。
const AD_REWARD_FOOD = 2000;
const AD_REWARD_SHI = 2;
const AD_REWARD_KINDS = ['gold', 'food', 'shi'];
const AD_REWARD_NAMES = { gold: '金钱', food: '粮草', shi: '天机简' };

/** 现实自然日 key：按设备本地时区算，过零点刷新，和游戏内天数无关。 */
function realDayKey(date) {
  const d = date instanceof Date ? date : new Date();
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

function blankAdRewardUsed() {
  return { gold: 0, food: 0, shi: 0 };
}

/** 老档或半截存档可能没有 adRewardUsed，补齐三类计数。 */
function normalizeAdRewardUsed(state) {
  if (!state || !state.player) return blankAdRewardUsed();
  const p = state.player;
  if (!p.adRewardUsed || typeof p.adRewardUsed !== 'object') {
    p.adRewardUsed = blankAdRewardUsed();
  }
  AD_REWARD_KINDS.forEach(function (kind) {
    const n = Number(p.adRewardUsed[kind]);
    p.adRewardUsed[kind] = isFinite(n) && n > 0 ? Math.floor(n) : 0;
  });
  return p.adRewardUsed;
}

/** 今日广告奖励次数；三类奖励各自计数，遇到新的现实日全部清零。 */
function adRewardInfo(state, dayKey) {
  const key = dayKey || realDayKey();
  if (!state || !state.player) {
    return {
      dayKey: key, max: AD_REWARD_MAX,
      gold: AD_REWARD_GOLD, food: AD_REWARD_FOOD, shi: AD_REWARD_SHI,
      used: blankAdRewardUsed(),
      left: { gold: 0, food: 0, shi: 0 },
    };
  }
  const p = state.player;
  if (p.adRewardDay !== key) {
    p.adRewardDay = key;
    p.adRewardUsed = blankAdRewardUsed();
  }
  const used = normalizeAdRewardUsed(state);
  const left = {
    gold: Math.max(0, AD_REWARD_MAX - used.gold),
    food: Math.max(0, AD_REWARD_MAX - used.food),
    shi: Math.max(0, AD_REWARD_MAX - used.shi),
  };
  return {
    dayKey: key,
    max: AD_REWARD_MAX,
    gold: AD_REWARD_GOLD,
    food: AD_REWARD_FOOD,
    shi: AD_REWARD_SHI,
    used: { gold: used.gold, food: used.food, shi: used.shi },
    left: left,
  };
}

/**
 * 看完一次激励视频后领取：
 *   kind = 'gold' 领 1000 金钱，'food' 领 2000 粮草，'shi' 领 2 支天机简。
 * 三类奖励各自每天 10 次，互不占用；过现实日零点自动重置。
 */
function claimAdReward(state, kind, dayKey) {
  const info = adRewardInfo(state, dayKey);
  if (AD_REWARD_KINDS.indexOf(kind) < 0) {
    return { ok: false, msg: '没有这种广告奖励。', info: info };
  }
  const name = AD_REWARD_NAMES[kind];
  if (info.left[kind] <= 0) {
    return { ok: false, msg: '今天的' + name + '广告次数已经领完了，明天再来。', info: info };
  }
  const p = state.player;
  let actual = 0;
  if (kind === 'gold') {
    actual = AD_REWARD_GOLD;
    p.gold += actual;
  } else if (kind === 'food') {
    // 广告奖励按需求临时给足 2000 粮草；这是额外军粮，不按平时购粮的车上限截断。
    actual = AD_REWARD_FOOD;
    p.food = (p.food || 0) + actual;
  } else {
    actual = AD_REWARD_SHI;
    p.shi = (p.shi || 0) + actual;
  }
  p.adRewardUsed[kind] = (p.adRewardUsed[kind] || 0) + 1;
  const amountText = kind === 'shi' ? actual + ' 支' : actual + ' ';
  pushLog(state, '你看完一段军情广告，从局内商店领走 ' + amountText + name + '。');
  return {
    ok: true,
    amount: actual,
    kind: kind,
    msg: '领到 ' + amountText + name + '（今日 ' + p.adRewardUsed[kind] + '/' + AD_REWARD_MAX + ' 次）',
    info: adRewardInfo(state, dayKey),
  };
}

/* ---------------------------------------------------------------- 天机简 */

function useHistory(state, markId) {
  const p = state.player;
  if (!state.battle) return { ok: false, msg: '现在没有在打仗' };
  if (p.shi <= 0) return { ok: false, msg: '天机简用完了' };
  if (state.battle.finished) return { ok: false, msg: '仗已经打完了' };
  if (state.battle.shiMark) return { ok: false, msg: '这一战你已经落过一笔' };
  const marks = require('../data/china.js').HISTORY_MARKS;
  if (!marks[markId]) return { ok: false, msg: '写不出这一笔' };
  p.shi -= 1;
  p.shiUsed += 1;
  state.battle.applyShiMark(markId);
  // 天机简只帮忙，不留后患；用掉就算，不再扣天下关系
  const when = marks[markId].timing === 'after'
    ? '这一笔留到战后结算。'
    : '这一笔已经在战中生效。';
  pushLog(state, marks[markId].text + ' ' + when + '天机简上的字没留下任何反噬。');
  return { ok: true, msg: marks[markId].name };
}

/* ---------------------------------------------------------------- 胜负 · 统一后的长夜 */

const MAJOR_SITE_TYPES = { town: true, castle: true };

function majorSites(state) {
  return state.world.sites.filter(function (s) { return MAJOR_SITE_TYPES[s.type]; });
}

/** 天下是不是已经全归玩家（自立）或玩家效忠的那一家（臣子） */
function allMajorSitesOwned(state) {
  const p = state.player;
  const major = majorSites(state);
  if (!major.length) return false;
  return major.every(function (s) {
    if (s.playerOwned) return true;
    return !!(p.faction && p.faction !== 'player' && s.ownerFaction === p.faction);
  });
}

/** 全国只剩下哪一面旗；还没统一或旗色不唯一时返回 null。 */
function unifiedOwnerFaction(state) {
  const major = majorSites(state);
  if (!major.length) return null;
  let owner = null;
  for (let i = 0; i < major.length; i++) {
    const f = major[i].playerOwned ? 'player' : (major[i].ownerFaction || null);
    if (!f) return null;
    if (owner === null) owner = f;
    else if (owner !== f) return null;
  }
  return owner;
}

/** 统一的那面旗里有没有玩家：自立算自己，臣子看 p.faction 是否同一家。 */
function unificationIncludesPlayer(state, faction) {
  const p = state.player;
  if (!p || !faction) return false;
  if (faction === 'player') return true;
  return p.faction === faction;
}

/** 第一次统一：不结束游戏，先让人站在城头看三十天 */
function edgeTownSite(state) {
  return siteById(state.world, (state.world.edgeTown && state.world.edgeTown.id) || 'edge_town');
}

function setEdgeFog(state, open) {
  const edge = edgeTownSite(state);
  if (!edge) return null;
  if (!state.world.edgeTown) {
    state.world.edgeTown = { id: edge.id, x: edge.x, y: edge.y, radius: 10, fogOpen: !!open };
  }
  state.world.edgeTown.fogOpen = !!open;
  edge.fogSealed = !open;
  if (state.story) state.story.edgeTownOpen = !!open;
  return edge;
}

function shavePlayerTroops(state, ratio) {
  const p = state.player;
  const total = army.troopCount(p.troops || {});
  let lose = Math.max(0, Math.floor(total * ratio));
  const keepRatio = Math.max(0, 1 - ratio);
  Object.keys(p.troops || {}).forEach(function (id) {
    const n = p.troops[id] || 0;
    const keep = Math.floor(n * keepRatio);
    lose -= n - keep;
    p.troops[id] = keep;
  });
  // 四舍五入后仍多出来的零头，从数量最多的兵种里扣。
  Object.keys(p.troops || {}).forEach(function (id) {
    if (lose <= 0) return;
    const cut = Math.min(lose, p.troops[id] || 0);
    p.troops[id] = (p.troops[id] || 0) - cut;
    lose -= cut;
  });
  return total - army.troopCount(p.troops || {});
}

function nearestRebelCity(state, from) {
  let best = null;
  let bestD = Infinity;
  (state.world.sites || []).forEach(function (s) {
    if (s.type === 'camp' || s.id === 'edge_town') return;
    const d = Math.max(Math.abs(s.x - from.x), Math.abs(s.y - from.y));
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

/** 统一瞬间：全国背叛，兄弟断后，玩家带残部逃往边陲小镇 */
function startUnification(state) {
  if (state.arc) return false;
  // 底层入口也认“全国统一且这面旗里有玩家”，避免任何旧入口绕过正常校验。
  const unified = unifiedOwnerFaction(state);
  if (!unified || !unificationIncludesPlayer(state, unified)) return false;
  const p = state.player;
  const day = state.clock.day;
  const formerFaction = p.faction;
  const edge = setEdgeFog(state, true);
  if (!edge) return false;
  const ex = edge.x;
  const ey = edge.y;
  state.arc = {
    phase: 'retreat',
    startDay: day,
    exileSiteId: edge.id,
    disasterDay: day,
    finaleDay: 0,
    loyalLords: [],
    lostBrothers: [],
    lastGrantDay: day,
    arrivalDay: 0,
  };
  state.arc.rescueRoute = true;
  // 开局阶段叛军没有城，factionTick 不把它当普通势力倒计时；旧档若已经
  // 误判过“叛军亡了”，在统一背叛真正开始时要把这面旗重新立起来。
  const rebelFs = state.factionState.rebel || (state.factionState.rebel = {});
  rebelFs.dead = false;
  rebelFs.deadDay = 0;
  rebelFs.doomDays = 0;
  rebelFs.doomDay = 0;
  p.renown += 300;
  p.gold += 600;

  // 全国城头一夜换旗：除了边陲小镇，全部归叛军。
  (state.world.sites || []).forEach(function (s) {
    if (s.id === edge.id) return;
    if (s.type === 'camp') {
      s.ownerFaction = 'bandit';
      return;
    }
    s.ownerFaction = 'rebel';
    s.playerOwned = false;
    s.selfFief = false;
    s.lordId = null;
    s.playerBlocked = false;
    s.burned = false;
    s.garrison = Math.max(10, Math.round((s.garrisonBase || 30) * 0.6));
    s.color = FACTIONS.rebel.color;
    s.banner = FACTIONS.rebel.banner;
  });
  edge.ownerFaction = 'player';
  edge.playerOwned = true;
  // 边陲小镇只走“每月 1000 金 + 400 粮”，不再叠加每日商税与封地旬税。
  edge.selfFief = false;
  edge.specialEdge = true;
  edge.garrison = Math.max(24, edge.garrison || 24);
  edge.banner = p.country && p.country.name ? p.country.name : '旗';
  edge.color = p.country && p.country.color ? p.country.color : '#d9a441';
  refreshSiteRosters(state, false);
  state.world.factionGrid = null;

  state.noPeaceForever = state.noPeaceForever || {};
  // 叛军不是诸侯：没有议和桌，只能打到一方彻底倒下。
  state.noPeaceForever.rebel = true;

  Object.keys(FACTIONS).forEach(function (id) {
    if (id === 'rebel' || id === 'player') return;
    state.relations[id] = -100;
    state.wars[id] = false;
    war.makePeace(state, 'player', id, true);
  });
  state.relations.rebel = -100;
  state.wars.rebel = true;
  war.declare(state, 'player', 'rebel', true, true);

  const loyal = [];
  const rebels = [];
  state.lords.forEach(function (l) {
    if (!l || !l.alive || l.dead || l.retired) return;
    // 从主角队伍里出去的人，不论现在挂在哪家旗下面，统一时都不会变成叛军。
    const fromYourCamp = !!(l.hero || l.exPlayer || l.faction === 'player' || l.title === '你的家臣');
    if (fromYourCamp) {
      l.faction = 'player';
      l.exPlayer = true;
      l.arcLoyal = true;
      l.borderStation = false;
      l.arcEnemy = false;
      l.arcNoRecruit = false;
      l.arcNoCapture = false;
      l.inCity = null;
      l.order = null;
      l.defending = null;
      l.chasing = false;
      l.home = edge.id;
      l.x = p.x;
      l.y = p.y;
      l.stepFrom = null;
      l.stepTo = null;
      l.routePath = null;
      l.patrolPath = null;
      loyal.push(l);
    } else {
      l.faction = 'rebel';
      l.arcLoyal = false;
      l.arcEnemy = true;
      l.arcNoRecruit = true;
      l.arcNoCapture = true;
      l.order = null;
      l.defending = null;
      l.chasing = false;
      const h = siteById(state.world, l.home);
      const home = h && h.ownerFaction === 'rebel' ? h : nearestRebelCity(state, l);
      l.home = home ? home.id : 'luoyang';
      l.inCity = home ? home.id : null;
      if (home) {
        l.x = home.x;
        l.y = home.y;
      }
      rebels.push(l);
    }
  });

  // 兄弟里每三个人留下一个断后。
  const casualties = loyal.length >= 3 ? Math.floor(loyal.length / 3) : 0;
  for (let i = 0; i < casualties; i += 1) {
    const l = loyal[i];
    l.alive = false;
    l.dead = true;
    l.arcEnemy = false;
    state.arc.lostBrothers.push(l.name);
  }
  state.arc.loyalLords = loyal.filter(function (l) { return l.alive; }).map(function (l) { return l.id; });
  border.getBorder(state);
  const troopLoss = shavePlayerTroops(state, 1 / 3);

  // 玩家从旧都城（或当前位置）出发，路线自动指向边陲小镇。
  p.faction = 'player';
  p.atSiteId = null;
  p.route = [];
  p.stepFrom = null;
  p.stepTo = null;
  p.stepProgress = 0;
  const route = findPath(state.world, { x: p.x, y: p.y }, { x: ex, y: ey });
  if (route && route.length) p.route = route;
  p.morale = Math.max(12, p.morale - 35);
  p.renown = Math.max(0, p.renown - 80);
  if (!p.country) p.country = { name: '汉', color: '#d9a441' };
  p.flagName = p.country.name || '汉';
  state.flags.edgeRetreat = true;

  state.events.push({
    type: 'arc', phase: 'betrayal',
    title: '长夜',
    lines: [
      '最后一座城归旗的当天，各地兵马同时动了，旗号一夜之间全换了。',
      '除了从你帐下出去的兄弟，所有人都翻脸了；' +
        (state.arc.lostBrothers.length ? ('断后的' + state.arc.lostBrothers.join('、') + '再也没跟上来。') : '你在乱军里丢了三分之一的弟兄。'),
      '追兵就在身后，不能停留。路上遇到拦路的 NPC，只能留下部分兵力断后，自己继续往西走。',
      '边陲小镇的雾已经散开一线；跟着地图上的线条走，不要回头。',
    ],
  });
  pushLog(state, '【长夜】你失去所有城，只剩兄弟旧部，沿地图指引退往边陲小镇。');
  state.arc.troopLoss = troopLoss;
  state.arc.rebelCount = rebels.length;
  if (state.story) state.story.unifiedFaction = formerFaction || 'player';
  return true;
}

/** 兼容旧流程：灾变入口现在直接触发统一背叛。 */
function triggerDisaster(state) {
  if (state.arc) return false;
  const unified = unifiedOwnerFaction(state);
  if (unified && !unificationIncludesPlayer(state, unified)) return false;
  return startUnification(state);
}

/** 找一块地图边缘、能走的空地，放下那座“这时才出现”的边陲小城（旧档兜底） */
function makeExileSite(state) {
  const edge = edgeTownSite(state);
  if (edge) return edge;
  return null;
}

/** 再次统一：大赏四方，进入尾声选择 */
function triggerArcFinale(state) {
  if (!state.arc || state.arc.phase !== 'reconquest') return;
  state.arc.phase = 'finale';
  state.arc.finaleDay = state.clock.day;
  state.player.renown += 500;
  pushLog(state, '【重定天下】你带着旧部，从边陲小城一路打回都城。城门开时，城里的人跪了一地。');
  state.events.push({
    type: 'arc', phase: 'finale',
    title: '国泰民安',
    lines: [
      '你在大殿上摆下酒席，把从边陲一路跟来的旧部一个个叫到面前。',
      '封侯、赐地、赦天下。史官在殿下写：天下再定，百姓始安。',
      '你终于可以把刀放下。只是这片大陆的风，还没有停。',
    ],
  });
}

function checkVictory(state) {
  if (state.gameOver) return;
  if (state.arc) {
    if (state.arc.phase === 'reconquest' && allMajorSitesOwned(state)) triggerArcFinale(state);
    return;
  }
  // 荆州最终阶段拖满两年：共主已被强制推举，只有共主旗里包含玩家才进入全国背叛。
  if (state.story && state.story.endgame && state.story.endgame.forcedWinner) {
    // 若玩家后来又把最后几座城打回来，以真实城头旗色为准，不被旧的“强制共主”卡死。
    const winner = unifiedOwnerFaction(state) || state.story.endgame.forcedWinner;
    if (unificationIncludesPlayer(state, winner)) startUnification(state);
    return;
  }
  const winner = unifiedOwnerFaction(state);
  if (winner && unificationIncludesPlayer(state, winner)) startUnification(state);
}

/** 每天检查：撤退到边陲小镇、每月补给、复国后再统一 */
/** 边陲小镇十格迷雾：玩家靠近时只给提示，不让他继续深入。 */
function edgeFogTick(state) {
  const edge = edgeTownSite(state);
  if (!edge) return;
  if (state.world.edgeTown && state.world.edgeTown.fogOpen) return;
  if (state.flags.edgeFogPrompt) return;
  const p = state.player;
  const d = Math.max(Math.abs(p.x - edge.x), Math.abs(p.y - edge.y));
  if (d > (state.world.edgeTown ? state.world.edgeTown.radius || 10 : 10) + 2) return;
  state.flags.edgeFogPrompt = true;
  pushLog(state, '【迷雾】迷雾迷人眼，无法深入探索，否则可能迷失其中，永远无法出来。');
  state.events.push({
    type: 'edge-fog',
    title: '迷雾迷人眼',
    lines: [
      '雾从西边压过来，十步外的树影都看不清了。',
      '迷雾迷人眼，无法深入探索；再往里走，可能会迷失其中，永远无法出来。',
      '你退了两步，雾才慢慢散开。',
    ],
  });
}

function arcTick(state) {
  if (!state.arc) return;
  const arc = state.arc;
  const p = state.player;
  const edge = edgeTownSite(state);
  if (!edge) return;

  if (arc.phase === 'retreat') {
    // 路上遇到拦路 NPC：只能留下一部分兵力断后，自己继续走。
    const nearFoe = (state.lords || []).filter(function (l) {
      return l && l.alive && !l.dead && l.faction === 'rebel' && !l.inCity &&
        Math.max(Math.abs(l.x - p.x), Math.abs(l.y - p.y)) <= 2;
    })[0];
    if (nearFoe && !arc.blockerDone) {
      arc.blockerDone = true;
      state.flags.edgeBlockers = (state.flags.edgeBlockers || 0) + 1;
      pushLog(state, '【断后】' + nearFoe.name + '追上来了。你留下部分兵力断后，自己继续往边陲小镇走。');
      state.events.push({
        type: 'arc', phase: 'retreat-block',
        title: '留兵断后',
        lines: [
          nearFoe.name + '的旗号从侧面压上来，队伍不能停。',
          '你点出一部分弟兄留下断后，自己带着剩下的兄弟继续往西。',
          '追兵不会等，边陲小镇也不会等。',
        ],
      });
      // 断后损耗：每次损失两成兵力；不进入战斗，不拖时间。
      shavePlayerTroops(state, 0.2);
    }
    const d = Math.max(Math.abs(p.x - edge.x), Math.abs(p.y - edge.y));
    if (p.atSiteId === edge.id || d <= 1) {
      p.atSiteId = edge.id;
      p.x = edge.x;
      p.y = edge.y;
      p.route = [];
      arc.phase = 'reconquest';
      arc.arrivalDay = state.clock.day;
      arc.lastGrantDay = state.clock.day;
      const bb = border.getBorder(state);
      if (bb) {
        // 七天招募从真正落脚小镇这天算，不在撤退路上提前走表。
        bb.day0 = state.clock.day;
        bb.week = -1;
        bb.pool = null;
        border.refresh(state);
      }
      state.flags.edgeRetreat = false;
      state.flags.edgeArrived = true;
      pushLog(state, '【边陲小镇】你在雾散开的小镇里落脚。每月 1000 金币、400 粮草，从今天开始算。');
      state.events.push({
        type: 'arc', phase: 'edge',
        title: '边陲小镇',
        lines: [
          '雾散开一线，小镇的灯火在雾里亮着。',
          '这里每月送来 1000 金币、400 粮草；其余诸侯的人马不敢靠近小镇十格。',
          '镇上的义军每周能凑出 1000 人，粮草 5 金一单位，驿站里还留着你的旧部。',
          '从今天起，你带着剩下的兄弟，从这座小镇重新反攻九州。',
        ],
      });
    }
    return;
  }

  if (arc.phase === 'reconquest') {
    border.refresh(state);
    // 每月补给：固定 1000 金币、400 粮草；其余攻占城市按普通税赋另算。
    if (state.clock.day - (arc.lastGrantDay || arc.arrivalDay || state.clock.day) >= 30) {
      arc.lastGrantDay = state.clock.day;
      const grant = border.monthlyGrant(state);
      pushLog(state, '【边陲小镇】本月补给 ' + grant.gold + ' 金币、' + grant.food + ' 粮草已到。');
    }
    if (allMajorSitesOwned(state)) triggerArcFinale(state);
    return;
  }

  if (arc.phase === 'finale') return;
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
    text += '\n（你握有 ' + owned + ' 座城，用了 ' + p.shiUsed + ' 支天机简。）';
  } else if (type === 'xu') {
    text += '\n（名册上还剩 ' + army.troopCount(p.troops) + ' 个名字。）';
  } else if (type === 'fen') {
    text += '\n（你烧掉了 ' + p.shiUsed + ' 支天机简，地图上有 ' + owned + ' 座城没有主人。）';
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
    background: state.background || (state.storyMode ? 'romance' : 'chaos'),
    historicalRoster: !!(state.historicalRoster || state.background === 'romance'),
    campaignDisabled: !!state.campaignDisabled,
    historicalSandbox: !!state.historicalSandbox,
    storyMode: !!state.storyMode,
    story: state.story || null,
    clock: state.clock,
    world: state.world,
    player: state.player,
    relations: state.relations,
    wars: state.wars,
    factionWars: state.factionWars || {},
    diplomacySeeded: !!state.diplomacySeeded,
    diplomacyStarted: !!state.diplomacyStarted,
    openingWarsDeclared: !!state.openingWarsDeclared,
    chenliuArrivalH: state.chenliuArrivalH || null,
    lastDiplomacyDay: state.lastDiplomacyDay || 0,
    settings: state.settings || {},
    prisoners: (state.prisoners || []).filter(function (p) { return !p.escaped; }),
    // 巡逻路径是运行时缓存，不写进存档；路线本身（patrolRouteIds）保留。
    lords: state.lords.map(function (l) {
      const copy = Object.assign({}, l);
      delete copy.patrolPath;
      delete copy.fleePath;
      delete copy.fleePathFor;
      copy.fieldBattleId = null;
      return copy;
    }),
    parties: (state.parties || []).map(function (q) {
      const copy = Object.assign({}, q);
      copy.fieldBattleId = null;
      return copy;
    }),
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
    fieldBattleSeq: state.fieldBattleSeq || 1,
    flee: state.flee || {},
    factionState: state.factionState || {},
    knownHidden: state.knownHidden || {},
    noPeace: state.noPeace || {},
    noPeaceForever: state.noPeaceForever || {},
    heroSites: state.heroSites || null,
    // 国战战役里的 siegeBattle 是运行时 Battle 对象，Battle.state 指回整局
    // state，直接 JSON.stringify 会抛 “Converting circular structure”。
    // 存档只保留战役的外壳字段；读档后 tickSiegeAssault 会按当前兵力重建攻城战。
    warCampaigns: (function () {
      const out = {};
      Object.keys(state.warCampaigns || {}).forEach(function (fid) {
        const cp = state.warCampaigns[fid];
        if (!cp || typeof cp !== 'object') return;
        const copy = Object.assign({}, cp);
        delete copy.siegeBattle;
        delete copy.battle;
        out[fid] = copy;
      });
      return out;
    })(),
    siegeCooldown: state.siegeCooldown || {},
    playerSiege: state.playerSiege || null,
    foodWarning: state.foodWarning || null,
    postBattleLord: state.postBattleLord || null,
    killRecords: state.killRecords || {},
    strategistUsed: state.strategistUsed || {},
    peaceOfferCooldown: state.peaceOfferCooldown || {},
    peaceOfferPending: state.peaceOfferPending || null,
    playerWarSince: state.playerWarSince || {},
    fiefTaxDay: state.fiefTaxDay || 0,
    arc: state.arc || null,
    tourneyWeek: state.tourneyWeek || null,
  };
  copy.player.route = [];
  copy.player.fieldBattleId = null;
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

  // 先清掉上一局可能残留的袁绍旧昏君系数；剧情档随后由 story.resume 按存档恢复。
  story.resetCombat();
  resetFactionRulers();
  const state = {
    version: data.version || SAVE_VERSION,
    seed: data.seed,
    background: data.background || (data.storyMode ? 'romance' : 'chaos'),
    historicalRoster: !!(data.historicalRoster ||
      (data.background || (data.storyMode ? 'romance' : 'chaos')) === 'romance'),
    campaignDisabled: data.campaignDisabled != null
      ? !!data.campaignDisabled
      : ((data.background || (data.storyMode ? 'romance' : 'chaos')) === 'romance' && !data.storyMode),
    historicalSandbox: data.historicalSandbox != null
      ? !!data.historicalSandbox
      : (!!data.historicalRoster && !data.storyMode),
    storyMode: !!data.storyMode,
    story: data.story || null,
    clock: data.clock,
    world: data.world,
    player: data.player,
    relations: data.relations,
    wars: data.wars || {},
    factionWars: data.factionWars || {},
    diplomacySeeded: !!data.diplomacySeeded,
    diplomacyStarted: !!data.diplomacyStarted,
    openingWarsDeclared: !!data.openingWarsDeclared,
    chenliuArrivalH: data.chenliuArrivalH || null,
    lastDiplomacyDay: data.lastDiplomacyDay || 0,
    settings: data.settings || { diplomacyAlerts: true, questTrackCollapsed: false },
    prisoners: data.prisoners || [],
    lords: (data.lords || []).map(function (l) {
      const copy = Object.assign({}, l);
      copy.patrolPath = null;
      copy.fleePath = null;
      copy.fleePathFor = null;
      copy.fieldBattleId = null;
      return copy;
    }),
    parties: (data.parties || []).map(function (q) {
      const copy = Object.assign({}, q);
      copy.fieldBattleId = null;
      return copy;
    }),
    banditRespawning: data.banditRespawning || [],
    quests: data.quests || [],
    log: data.log || [],
    events: [],
    stats: data.stats || { battlesWon: 0, battlesLost: 0, troopsLost: 0, goldEarned: 0, distance: 0, days: 0, sitesTaken: 0, villagesRaided: 0 },
    flags: data.flags || {},
    tourneyWeek: data.tourneyWeek || null,
    campaign: data.campaign || { stage: 0, done: [] },
    gameOver: !!data.gameOver,
    ending: data.ending || null,
    timeScale: data.timeScale || 1,
    npcClock: 0,
    npcTick: 0,
    rng: new RNG((data.seed || 1) + (data.clock ? data.clock.day : 1) * 7919),
    questSeq: data.questSeq || 1,
    partySeq: data.partySeq || 1,
    fieldBattleSeq: data.fieldBattleSeq || 1,
    flee: data.flee || {},
    factionState: data.factionState || {},
    knownHidden: data.knownHidden || {},
    noPeace: data.noPeace || {},
    noPeaceForever: data.noPeaceForever || {},
    heroSites: data.heroSites || null,
    warCampaigns: data.warCampaigns || {},
    siegeCooldown: data.siegeCooldown || {},
    playerSiege: data.playerSiege || null,
    foodWarning: data.foodWarning || null,
    postBattleLord: data.postBattleLord || null,
    killRecords: data.killRecords || {},
    strategistUsed: data.strategistUsed || {},
    peaceOfferCooldown: data.peaceOfferCooldown || {},
    peaceOfferPending: null,
    playerWarSince: data.playerWarSince || {},
    fiefTaxDay: data.fiefTaxDay || 0,
    arc: data.arc || null,
    battle: null,
  };
  // n16 旧档补路：陈留到小沛以前没有道路，曹吕两军只能隔着农田对望。
  // 新开局由 ROADS 铺好；旧档在这里补一次，重复铺也不会改坏已有桥/山口。
  layRoads(state.world, [['chenliu', 'xiaopei']]);
  state.world.factionGrid = null;
  // 旧档可能已经刷出了“赤色叛军”匪团；全国背叛没开始前，它们不能出现在地图/史册。
  if (!state.arc) {
    state.parties = (state.parties || []).filter(function (q) { return q.banditTier !== 'hong'; });
  }
  state.player.country = state.player.country || null;
  state.player.recruitFaction = state.player.recruitFaction || null;
  state.player.recruitFactionDay = Number(state.player.recruitFactionDay) || 0;
  state.player.foodWarned = !!state.player.foodWarned;
  state.player.foodWarnDay = state.player.foodWarnDay || 0;
  state.player.adShiDay = state.player.adShiDay || 0;
  state.player.adShiCount = state.player.adShiCount || 0;
  state.player.adRewardDay = state.player.adRewardDay || '';
  if (!state.player.adRewardUsed || typeof state.player.adRewardUsed !== 'object') {
    state.player.adRewardUsed = { gold: 0, food: 0, shi: 0 };
  }
  AD_REWARD_KINDS.forEach(function (kind) {
    const n = Number(state.player.adRewardUsed[kind]);
    state.player.adRewardUsed[kind] = isFinite(n) && n > 0 ? Math.floor(n) : 0;
  });
  state.player.route = [];
  state.player.stepFrom = null;
  state.player.stepTo = null;
  state.player.stepProgress = 0;

  // 旧档兼容：主线字段是后加的，早期同版本存档可能只有 stage，没有
  // campaign.done / flags.campaignDone。缺数组会在章节完成那一帧抛异常，
  // 主循环没有兜底时就会永久停在当前画面。
  if (!state.campaign || typeof state.campaign !== 'object') {
    state.campaign = { stage: 0, done: [] };
  }
  if (!Array.isArray(state.campaign.done)) state.campaign.done = [];
  if (typeof state.campaign.stage !== 'number' || !isFinite(state.campaign.stage)) {
    state.campaign.stage = 0;
  }
  if (!Array.isArray(state.flags.campaignDone)) state.flags.campaignDone = [];

  // 同版本老档补上后来新增的城与势力：
  // 新开局由 createWorld 全量生成；读旧档时只补缺失据点，不重算玩家已经打下的城。
  Object.keys(FACTIONS).forEach(function (id) {
    if (state.relations[id] === undefined) state.relations[id] = id === 'bandit' ? -100 : 0;
    if (state.wars[id] === undefined) state.wars[id] = id === 'bandit';
  });
  const knownSites = {};
  state.world.sites.forEach(function (s) { knownSites[s.id] = true; });
  let addedSites = 0;
  SITE_ROWS.forEach(function (row) {
    if (knownSites[row[0]]) return;
    const site = siteFromRow(state.world, row);
    site.recruits = {};
    (site.recruitList || []).forEach(function (id, i) {
      site.recruits[id] = 1 + ((row[0].charCodeAt(0) + i * 3) % 3);
    });
    site.lordRecruits = {};
    (site.recruitList || []).forEach(function (id, i) {
      site.lordRecruits[id] = (row[0].charCodeAt(0) + i * 5) % 4;
    });
    site.foodStock = {};
    if (site.type === 'village') {
      (VILLAGE_FOOD || []).forEach(function (f) {
        site.foodStock[f.id] = Math.max(1, f.stockMax || 3);
      });
    }
    state.world.sites.push(site);
    addedSites += 1;
  });
  // 旧档的寿春原本是无主城；只在这座城还空着时归袁术，已玩家占领/易主的不动。
  const oldShouchun = siteById(state.world, 'shouchun');
  if (oldShouchun && !oldShouchun.playerOwned && !oldShouchun.ownerFaction) {
    oldShouchun.ownerFaction = 'yuanshu';
    oldShouchun.faction = 'yuanshu';
    oldShouchun.banner = FACTIONS.yuanshu.banner;
    oldShouchun.color = FACTIONS.yuanshu.color;
    syncSiteRecruitList(oldShouchun, 'yuanshu', state);
  }

  // n41：汉中北面的武都、上洛改为自由城。只迁移一次，避免刘璋日后
  // 重新占回时又被读档逻辑抹成无主；玩家已经打下的城绝不覆盖。
  state.flags = state.flags || {};
  if (!state.flags.wuduShangluoFree) {
    FREE_CITY_IDS.forEach(function (id) {
      const site = siteById(state.world, id);
      if (!site || site.playerOwned) return;
      if (site.ownerFaction && site.ownerFaction !== 'zhang') return;
      site.ownerFaction = null;
      site.faction = null;
      site.lordId = null;
      site.banner = '';
      site.color = '#8f8f86';
    });
    state.flags.wuduShangluoFree = true;
  }
  // n41：已经由刘备拿下成都的旧档，补上“以成都为大本营”的治所迁移。
  const chengduSite = siteById(state.world, 'chengdu');
  if (chengduSite && chengduSite.ownerFaction === 'shu' && !chengduSite.playerOwned) {
    war.markShuChengduBase(state, chengduSite, 'shu');
  }

  // n18 老档换旗：只在城池仍是旧主且没有被玩家占下时迁移，避免覆盖玩家的战果。
  const LEGACY_OWNER_MOVES = [
    { id: 'ji', from: ['han'], to: 'gongsun' },
    { id: 'zhuo', from: ['han'], to: 'gongsun' },
    { id: 'beiping', from: ['han', 'xianbei'], to: 'gongsun' },
    { id: 'jincheng', from: ['ma'], to: 'hansui' },
  ];
  LEGACY_OWNER_MOVES.forEach(function (move) {
    const site = siteById(state.world, move.id);
    if (!site || site.playerOwned || site.ownerFaction === move.to) return;
    if (move.from.indexOf(site.ownerFaction) < 0) return;
    const faction = FACTIONS[move.to];
    if (!faction) return;
    site.ownerFaction = move.to;
    site.faction = move.to;
    site.banner = faction.banner;
    site.color = faction.color;
    syncSiteRecruitList(site, move.to, state);
  });

  // n43 老档：襄平归公孙瓒；官渡/白马换位；汉廷诸将收回长安—潼关一线。
  const N43_OWNER_MOVES = [
    { id: 'xiangping', from: ['han', null], to: 'gongsun' },
    { id: 'hanzhong', from: ['zhang'], to: 'zhanglu' },
    { id: 'wudu', from: [null, 'zhang'], to: 'zhanglu' },
    { id: 'shangluo', from: [null, 'zhang'], to: 'zhanglu' },
    { id: 'taishanguan', from: [null], to: 'lv' },
  ];
  N43_OWNER_MOVES.forEach(function (move) {
    const site = siteById(state.world, move.id);
    if (!site || site.playerOwned || site.ownerFaction === move.to) return;
    if (move.from.indexOf(site.ownerFaction) < 0) return;
    const faction = FACTIONS[move.to];
    if (!faction) return;
    site.ownerFaction = move.to;
    site.faction = move.to;
    site.banner = faction.banner;
    site.color = faction.color;
    site.lordId = null;
    syncSiteRecruitList(site, move.to, state);
  });
  // n44 老档：泰山关由吕布改归袁绍，夷陵由刘表改归孙权；只迁移旧主，保留玩家战果。
  const N44_OWNER_MOVES = [
    { id: 'taishanguan', from: ['lv', null], to: 'yuan' },
    { id: 'yiling', from: ['biao'], to: 'wu' },
  ];
  N44_OWNER_MOVES.forEach(function (move) {
    const site = siteById(state.world, move.id);
    if (!site || site.playerOwned || site.ownerFaction === move.to) return;
    if (move.from.indexOf(site.ownerFaction) < 0) return;
    const faction = FACTIONS[move.to];
    if (!faction) return;
    site.ownerFaction = move.to;
    site.faction = move.to;
    site.banner = faction.banner;
    site.color = faction.color;
    site.lordId = null;
    syncSiteRecruitList(site, move.to, state);
  });
  // n45：开局叛军没有城，不能被七天灭国逻辑误判；旧档如果已经弹出过
  // “叛军 亡了”，在读档时把这面旗恢复，统一背叛后才有叛军可打。
  const legacyRebel = state.factionState.rebel;
  if (legacyRebel && legacyRebel.dead &&
      (!state.arc || state.arc.phase === 'retreat')) {
    legacyRebel.dead = false;
    legacyRebel.deadDay = 0;
    legacyRebel.doomDays = 0;
    legacyRebel.doomDay = 0;
  }
  // n45：北平—蓟直连。蓟原先只靠涿（村）接路，而村庄不计入城网，
  // 袁绍拿下北平、涿、范阳后仍无法把蓟算作“道路相接”的敌城。
  const N45_ROADS = [
    ['beiping', 'ji'],
  ];
  layRoads(state.world, N45_ROADS);
  // 边陲小镇：老档没有这张图，补城并挂上雾圈元数据。
  const edgeSite = siteById(state.world, 'edge_town');
  if (edgeSite && !state.world.edgeTown) {
    state.world.edgeTown = { id: edgeSite.id, x: edgeSite.x, y: edgeSite.y, radius: 10, fogOpen: false };
    edgeSite.fogSealed = true;
    edgeSite.specialEdge = true;
  }

  SITE_ROWS.forEach(function (row) {
    if (row[0] !== 'guandu' && row[0] !== 'baima') return;
    const site = siteById(state.world, row[0]);
    if (!site) return;
    const scale = state.world.w / 40;
    site.x = Math.round(row[4] * scale);
    site.y = Math.round(row[5] * scale);
  });
  const HAN_HOME_MOVES = [
    { id: 'zhujun', home: 'changan' },
    { id: 'luzhi', home: 'changan' },
    { id: 'yangfeng', home: 'tongguan' },
  ];
  HAN_HOME_MOVES.forEach(function (move) {
    const lord = (state.lords || []).filter(function (l) { return l.id === move.id; })[0];
    if (!lord || lord.faction !== 'han' || lord.dead || lord.retired || lord.prisoner) return;
    const site = siteById(state.world, move.home);
    if (!site) return;
    lord.home = move.home;
    lord.inCity = move.home;
    lord.x = site.x;
    lord.y = site.y;
    lord.stepFrom = null;
    lord.stepTo = null;
    lord.routePath = null;
    lord.order = null;
  });

  // 颜色在旧档里是 copy 到据点上的，换色后要把同势力旧据点一起刷新。
  state.world.sites.forEach(function (site) {
    if (site.ownerFaction === 'hansui') {
      const f = FACTIONS.hansui;
      if (f) { site.color = f.color; site.banner = f.banner; }
    }
  });

  // 赵云从蜀营转入公孙瓒帐下；已经阵亡/退隐的旧档不复活。
  const legacyZhaoyun = (state.lords || []).filter(function (l) { return l.id === 'zhaoyun'; })[0];
  if (legacyZhaoyun && legacyZhaoyun.faction !== 'gongsun' && !legacyZhaoyun.dead && !legacyZhaoyun.retired) {
    legacyZhaoyun.faction = 'gongsun';
    legacyZhaoyun.home = 'ji';
    legacyZhaoyun.inCity = 'ji';
    const jiSite = siteById(state.world, 'ji');
    if (jiSite) {
      legacyZhaoyun.x = jiSite.x;
      legacyZhaoyun.y = jiSite.y;
    }
    legacyZhaoyun.stepFrom = null;
    legacyZhaoyun.stepTo = null;
    legacyZhaoyun.stepProgress = 0;
    legacyZhaoyun.routePath = null;
    legacyZhaoyun.order = null;
  }

  if (addedSites) {
    layRoads(state.world, ROADS.filter(function (pair) {
      return !knownSites[pair[0]] || !knownSites[pair[1]];
    }));
    state.world.factionGrid = null;
  }
  // n19 有若干“两端都是旧城”的新连线；旧档不补城，也必须补这些路。
  const N19_ROADS = [
    ['wuwei', 'tianshui'],
    ['shangyong', 'jiange'], ['shangyong', 'jiangzhou'],
    ['lujiang', 'wan'], ['lujiang', 'xiakou'],
    ['nanpi', 'beiping'],
    ['zhuo', 'fanyang'], ['fanyang', 'ye'], ['ye', 'changshan'],
    ['chaisang', 'yushan'], ['yushan', 'kuaiji'], ['yushan', 'yiling'],
    ['jiaozhi', 'shanyue'],
  ];
  layRoads(state.world, N19_ROADS);
  // n20 也有“两端都是旧城”的连线；旧档不补城，也必须补这些路。
  // 官渡—新野的旧路不再在 ROADS 里声明，但旧档已铺下的路面不做破坏性擦除。
  const N20_ROADS = [
    ['xuchang', 'xinye'],
    ['xiaopei', 'pengcheng'],
    ['pengcheng', 'xuzhou'],
  ];
  layRoads(state.world, N20_ROADS);
  // n21 新增荆襄—赤壁—夏口与建宁—南中道路；旧档两端都是旧城，也要补路面。
  const N21_ROADS = [
    ['xiangyang', 'chibi'],
    ['chibi', 'xiakou'],
    ['jianning', 'nanzhong'],
  ];
  layRoads(state.world, N21_ROADS);
  // n32 西北路网：金城—天水接上，安定接武威与长安；旧档两端都是旧城时也要补。
  const N32_ROADS = [
    ['jincheng', 'tianshui'],
    ['wuwei', 'anding'],
    ['anding', 'changan'],
  ];
  layRoads(state.world, N32_ROADS);
  // n33 断开枹罕—西平：新开局已不铺这条线，旧档也要把旧路面、旧桥和旧山口还原。
  clearRoads(state.world, [['xiping', 'fuhan']]);
  // 牂牁从 (18,40) 下移到 (20,44)，贴着交趾；旧档同步搬城，不能让道路悬空。
  const zangkeRow = SITE_ROWS.filter(function (row) { return row[0] === 'zangke'; })[0];
  const zangkeSite = siteById(state.world, 'zangke');
  if (zangkeRow && zangkeSite) {
    const scale = state.world.w / 40;
    zangkeSite.x = Math.round(zangkeRow[4] * scale);
    zangkeSite.y = Math.round(zangkeRow[5] * scale);
  }
  // 旧档补齐打散隐藏字段，避免读档后把旧状态当可见领主绘制。
  (state.lords || []).forEach(function (lord) {
    if (lord.scatterCityId === undefined) lord.scatterCityId = null;
    if (lord.scatterRecovering === undefined) lord.scatterRecovering = false;
    if (lord.scatterHidden === undefined) lord.scatterHidden = false;
    // 旧档里仍处于三天打散的领主，一律按新规则隐藏，等 scatteredLordTick 安排募兵城。
    if (lord.scattered) lord.scatterHidden = true;
  });
  state.world.factionGrid = null;

  // 同版本老档补上村市口粮与领主独立兵源池
  state.world.sites.forEach(function (site) {
    if (site.selfFief === undefined) site.selfFief = false;
    if (site.selfFief) site.lordId = null;
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
    if (l.recruitCoolDay === undefined) l.recruitCoolDay = 0;
    if (l.inCity === undefined) l.inCity = null;
    if (l.restSite === undefined) l.restSite = null;
    if (l.scattered === undefined) l.scattered = false;
    if (l.scatterUntilH === undefined) l.scatterUntilH = 0;
    if (l.scatterHomeId === undefined) l.scatterHomeId = null;
    if (l.exPlayer === undefined) l.exPlayer = !!(l.hero || l.title === '你的家臣');
    if (l.arcLoyal === undefined) l.arcLoyal = false;
    if (l.borderStation === undefined) l.borderStation = false;
    if (l.scattered && !l.respawnDay) l.respawnDay = state.clock.day + 3;
    if (!l.level) l.level = lordLevelForRank(lordRank(l));
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
  // n53 三类身份：先按存档里的国君标记算一遍，等 reconcileFactionRulers 后再校正一次。
  applyLordRoles(state);
  state.flags.lordRolesV1 = true;
  // n59：旧档里的旧兵种统一折成当前国家兵种；T5 再按君主/武力榜资格校正。
  migrateFactionTroops(state);
  // n51 四阶精锐规则：旧档只跑一次；榜外领主的四阶兵当场清掉，名将与国君补齐门面兵。
  if (!state.flags.lordTier4V1) {
    applyLordTier4Rule(state);
    state.flags.lordTier4V1 = true;
  }
  // 旧档里魏国领主还没按国别系数收口：满编与现存兵力一起夹到新上限。
  if (!state.flags.lordWeiCapV1) {
    applyFactionRosterCap(state);
    state.flags.lordWeiCapV1 = true;
  }
  ensureWorldFeatures(state.world);
  refreshSiteRosters(state, false);
  state.world.factionGrid = null;
  // 旧的集结/扎营军令先清掉，避免老档一进去就有领主在城边永久站住。
  sanitizeLordOrders(state);
  // 老档里若有两支队伍叠在同一格，进档时先挪开，避免一开局就互相堵死。
  unstackLords(state);
  autoAssignFiefs(state);
  reconcileFactionRulers(state);
  // 国君可能已经换代：按最终 rulerId 再算一次三类身份，并把新帅才的满编编制补到上限。
  applyLordRoles(state);
  applyLordPowerRoster(state);
  applyLordT5Rule(state);
  applyFactionRosterCap(state);
  state.storyHooks = { stageGuandu: stageGuandu, stageChibi: stageChibi, fallFaction: fallFaction };
  war.init(state);
  war.bindLogger(pushLog);
  war.bindCaptureHook(story.recordCapture);
  story.resume(state, pushLog);
  war.bindPassable(isPassable);
  war.bindFleeGuard(lordMayFlee);
  war.bindMovement(stepUnitTo, unitOccupies, siteAt);
  syncPlayerFaction(state.player.country);
  if (state.player.country && state.player.country.name) applyPlayerCountry(state);
  warmPatrolFields(state);
  return state;
}

war.bindPartyDestroyer(destroyBanditParty);

module.exports = {
  HOUR_SECONDS,
  SAVE_VERSION,
  BANDIT_STEP_HOURS,
  BANDIT_TARGET,
  BANDIT_MAX,
  BANDIT_START_COUNT,
  BANDIT_EDGE_MARGIN,
  BANDIT_CITY_RANGE,
  LORD_BANDIT_HUNT_RANGE,
  BANDIT_MIN_BATTLE_HOURS,
  LORD_STEP_HOURS,
  LORD_FLEE_STEP_HOURS,
  LORD_ENTER_CITY_HOURS,
  createGame,
  update,
  unitAnimPos,
  goTo,
  currentPos,
  playerVisualPos,
  stopMoving,
  camp,
  campWait,
  startRest,
  stopRest,
  isResting,
  isSafeResting,
  leaveRestForMap,
  lordEngagementValid,
  partyEngagementValid,
  advanceTime,
  dailyTick,
  diplomacyAlertsEnabled,
  maybeStartDiplomacy,
  campRespawnTick,
  CAMP_RESPAWN_DAYS,
  lordRecruitTick,
  lordRestTick,
  patrolRouteFor,
  patrolRoutesForSite,
  patrolRouteCount,
  patrolTargetFor,
  lordThreatFor,
  moveLords,
  moveParties,
  fightNeighbors,
  questProtectedParty,
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
  canPlayerAttackSite,
  canPlayerDeclareFaction,
  canPlayerDeclareSite,
  beginPlayerSiege,
  advancePlayerSiege,
  checkPlayerSiegeReady,
  cancelPlayerSiege,
  PLAYER_SIEGE_DAYS,
  startCampaignBattle,
  resolveBattle,
  takeSite,
  offerQuest,
  questTargetPos,
  foundCountry,
  applyPlayerCountry,
  recruitSourceInfo,
  setPlayerRecruitSource,
  cleanCountryName,
  flagColorName,
  nextFoodNeed,
  refreshFoodWarning,
  deliverGrain,
  checkScoutQuest,
  completeQuests,
  checkQuestTargets,
  failQuest,
  joinFaction,
  declareWar,
  prisonersOf,
  ransomPrisoner,
  releasePrisoner,
  factionWars,
  atWarWith,
  peaceTerms,
  acceptPeaceOffer,
  rejectPeaceOffer,
  declareWarFaction,
  makePeaceWith,
  raidVillage,
  campaignState,
  campaignInfo,
  campaignTargetPos,
  campaignObjective,
  advanceCampaign,
  tryCampaignBattle,
  applyCampaignEffect,
  factionTick,
  factionAlive,
  factionLord,
  isFactionRuler,
  successionAfterRulerKilled,
  resetFactionRulers,
  reconcileFactionRulers,
  campTierForRenown,
  fallFaction,
  pickFactionFor,
  moveLordToFaction,
  ensureMaChaoToShu,
  MA_CHAO_TO_SHU_DAY,
  resolveMaSurrender,
  tavernRumor,
  hiddenLordsAt,
  hiddenLordVisible,
  recruitHiddenLord,
  giveWayCost,
  giveWay,
  breakTail,
  recruitPrisoner,
  executePrisoner,
  resolveDefeatedLord,
  promoteHero,
  siteLord,
  siteSelfFief,
  lordFiefs,
  autoAssignFiefs,
  assignFief,
  assignFiefSelf,
  fiefTaxFor,
  fiefTaxTick,
  lordLevel,
  lordCapForLevel,
  lordTroopCap,
  lordPowerCap,
  lordRecruitMul,
  lordPowerInfo,
  lordKeepsTier4,
  lordIsRuler,
  applyLordRoles,
  applyLordTier4Rule,
  applyLordT5Rule,
  normalizeLordT5,
  migrateFactionTroops,
  refreshSiteRosters,
  applyLordPowerRoster,
  useHistory,
  adShiInfo,
  claimAdShi,
  AD_SHI_MAX,
  AD_SHI_PER,
  realDayKey,
  adRewardInfo,
  claimAdReward,
  AD_REWARD_MAX,
  AD_REWARD_GOLD,
  AD_REWARD_FOOD,
  AD_REWARD_SHI,
  renownTitle,
  pushLog,
  serialize,
  deserialize,
  endGame,
  checkVictory,
  decideEnding,
  majorSites,
  allMajorSitesOwned,
  unifiedOwnerFaction,
  unificationIncludesPlayer,
  startUnification,
  triggerDisaster,
  triggerArcFinale,
  arcTick,
  spawnBanditParties,
  refillBandits,
  banditSpotAllowed,
  banditPathStep,
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
  LORD_RECOVERY_RATIO,
  LORD_RECOVERY_SEARCH_RANGE,
  LORD_PATROL_RECRUIT_RATIO,
  siteRecoveryMultiplier,
  lordRecoveryRate,
  bestRecoveryCity,
  fastestRecoveryCity,
  siteUnderAttack,
};
