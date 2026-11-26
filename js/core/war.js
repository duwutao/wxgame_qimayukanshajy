/**
 * 国战：势力之间的宣战、领主野战、俘虏与逃脱。
 *
 * 规则（按用户要的骑砍味）：
 *  - 两个势力宣战后，双方所有领主互为敌人，在大地图上撞上就开打；
 *  - 除了主线要点名的那几位，谁都不会被领主杀掉：败的一方溃逃或者被俘；
 *  - 俘虏押在城里，可以被人攻破城池救出，也可能自己跑掉；
 *  - 逃脱概率起初几乎为零，关一天涨一点。
 */

const { FACTIONS, FACTION_COMBAT, ROADS, STRATEGIC_SITES, FREE_CITY_IDS } = require('../data/china.js');
const { TROOPS } = require('../data/troops.js');
const army = require('./army.js');
const { Battle } = require('./battle.js');

const ESCAPE_BASE = 0.008;   // 第一天：0.8% + 1.4% ≈ 2.2%
const ESCAPE_STEP = 0.014;
const ESCAPE_CAP = 0.62;
const MIN_WAR_DAYS = 25;
const DUEL_FLEE_RATIO = 1.65;
const DUEL_FLEE_GAP = 10;
const MAX_WAR_PARTNERS = 99;
// 刘备入川不是随机外交：天下开始动过几天，必然让刘璋与刘备翻脸。
const LIUBEI_YI_WAR_DAY = 8;
// 韩遂灭凉：马超归蜀这条线固定之后，由韩遂在凉州动手，不再等随机国战。
const HANSUI_MIE_MA_DAY = 12;
// 不再给开局设“曹袁三十天不能打”的停战罩；各国从第一天起就可以互相吞并。
const OPENING_FORBIDDEN = {};
const OPENING_DAYS = 0;
let destroyPartyFn = null;
let captureHook = null;

function key(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

/* ------------------------------------------------------------ 道路与邻国 */
// 道路是静态数据，第一次用时建一张无向邻接表：判断邻国、判断攻城方向都靠它。
let ROAD_EDGES = null;
function roadEdges() {
  if (ROAD_EDGES) return ROAD_EDGES;
  ROAD_EDGES = {};
  (ROADS || []).forEach(function (pair) {
    if (!pair || !pair[0] || !pair[1]) return;
    (ROAD_EDGES[pair[0]] = ROAD_EDGES[pair[0]] || []).push(pair[1]);
    (ROAD_EDGES[pair[1]] = ROAD_EDGES[pair[1]] || []).push(pair[0]);
  });
  return ROAD_EDGES;
}

function isCitySite(site) {
  return !!site && (site.type === 'town' || site.type === 'castle');
}

/** 某势力实际控制的城/关；玩家的网络按 playerOwned 算，不按临时效忠国算。 */
function ownedCities(state, faction) {
  if (!state || !state.world) return [];
  return (state.world.sites || []).filter(function (s) {
    if (!isCitySite(s)) return false;
    if (faction === 'player') return !!s.playerOwned || s.ownerFaction === 'player';
    return s.ownerFaction === faction && !s.playerOwned;
  });
}

function roadAdjacent(a, b) {
  const e = roadEdges();
  return !!(a && b && e[a] && e[a].indexOf(b) >= 0);
}

/** 据点之间的城道相邻：小国只打和本土直接连一道路的城，不向远处延伸。 */
let SITE_EDGES = null;
function siteRoadEdges() {
  if (SITE_EDGES) return SITE_EDGES;
  SITE_EDGES = {};
  (ROADS || []).forEach(function (pair) {
    if (!pair || !pair[0] || !pair[1]) return;
    (SITE_EDGES[pair[0]] = SITE_EDGES[pair[0]] || []).push(pair[1]);
    (SITE_EDGES[pair[1]] = SITE_EDGES[pair[1]] || []).push(pair[0]);
  });
  return SITE_EDGES;
}
function siteRoadAdjacent(a, b) {
  const e = siteRoadEdges();
  return !!(a && b && e[a] && e[a].indexOf(b) >= 0);
}

/** 两国有道路直接接壤，才算邻国；宣战只认这一条。 */
function factionsAdjacent(state, a, b) {
  if (!a || !b || a === b) return false;
  const aa = ownedCities(state, a);
  const bb = ownedCities(state, b);
  if (!aa.length || !bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    for (let j = 0; j < bb.length; j++) {
      if (roadAdjacent(aa[i].id, bb[j].id)) return true;
    }
  }
  return false;
}

/**
 * 攻城只允许打与本势力城网道路直接相接的敌城。
 * 玩家还没有第一座城时放开：第一座城随意打，打下来以后就必须连线上扩张。
 * 中立的无主城也按同一条线走；已开战的有主城才算“敌对城”。
 */
function canSiegeSiteFromFaction(state, faction, site) {
  if (!site) return { ok: false, msg: '这里没有可攻的城' };
  if (site.playerOwned && faction === 'player') return { ok: false, msg: '这是你自己的城' };
  const own = ownedCities(state, faction);
  // 第一座城优先：不管有没有宣战、隔多远，先允许到城下扎营。
  if (!own.length) return { ok: true, msg: '第一座城，可以随意攻打', firstCity: true };
  const targetFaction = site.ownerFaction || (site.playerOwned ? 'player' : null);
  if (targetFaction && targetFaction === faction) return { ok: false, msg: '这是自己势力的城' };
  if (targetFaction && targetFaction !== 'bandit' && !atWar(state, faction, targetFaction)) {
    return { ok: false, msg: '还没有和' + (FACTIONS[targetFaction] ? FACTIONS[targetFaction].full : targetFaction) + '开战' };
  }
  // 敌方只剩村庄时不能再卡“道路必须接壤”：残部躲在边村，不打掉这最后一块
  // 地盘，剧情阶段就永远判不了灭国。允许攻方摸到残村收尾。
  if (targetFaction && targetFaction !== 'bandit' && site.type === 'village' &&
      !ownedCities(state, targetFaction).length) {
    return { ok: true, msg: '', linked: false, mopUp: true };
  }
  const linked = own.some(function (o) { return roadAdjacent(o.id, site.id); });
  if (!linked) {
    // 巴西是村，不算“城”，但刘备入川的成都路线正是剑阁—巴西—成都。
    // 只对蜀军打成都放这一格：占住巴西村后，成都就不再被城网判定卡在门外。
    const baxi = siteById(state, 'baxi');
    const viaBaxi = faction === 'shu' && site.id === 'chengdu' &&
      baxi && baxi.ownerFaction === 'shu' && !baxi.playerOwned &&
      roadAdjacent(baxi.id, site.id);
    if (!viaBaxi) {
      return { ok: false, msg: '只能攻打与本势力道路直接相连的敌城；先把中间那座城打下来' };
    }
  }
  return { ok: true, msg: '', linked: true };
}

/** 剧情模式：玩家只能加入当前天下大势正在打的目标，不能凭空另开一桌。 */
function storyWarTargetsPlayer(state, faction) {
  const st = state && state.story;
  if (!st || !st.mode) return true;
  if (st.emperor && st.emperor.coalitionTarget === faction) return true;
  const lists = st.targets || {};
  return Object.keys(lists).some(function (f) {
    return (lists[f] || []).indexOf(faction) >= 0;
  });
}

function storyPlayerWarRestriction(state, faction) {
  if (!state || !state.story || !state.story.mode) return null;
  if (storyWarTargetsPlayer(state, faction)) return null;
  return {
    ok: false,
    msg: '剧情模式只能顺着天下大势开战：当前没有哪一路战书指向' +
      (FACTIONS[faction] ? FACTIONS[faction].full : faction) + '。',
  };
}

/** 玩家现在能不能对某个势力递战书：必须是邻国；第一座城之前只能到城下宣战。 */
function canPlayerDeclareFaction(state, faction) {
  if (!state || !faction || !FACTIONS[faction] || faction === 'player' || faction === 'bandit') {
    return { ok: false, msg: '不能向这个势力宣战' };
  }
  if ((state.factionState[faction] || {}).dead) return { ok: false, msg: '这个势力已经亡了' };
  if (atWar(state, 'player', faction)) return { ok: false, msg: '你已经在和他们打仗' };
  const own = ownedCities(state, 'player');
  if (!own.length) {
    return { ok: false, msg: '你还没有自己的城。先到城下打下一座，才有邻国可宣。' };
  }
  if (!factionsAdjacent(state, 'player', faction)) {
    return { ok: false, msg: '只能向道路接壤的邻国宣战，不能隔着别国递战书。' };
  }
  const storyRestriction = storyPlayerWarRestriction(state, faction);
  if (storyRestriction) return storyRestriction;
  if (!canOpenWar(state, 'player', faction)) {
    return { ok: false, msg: '你已经同时在打太多家了，先停一边再宣。' };
  }
  return { ok: true, msg: '' };
}

/** 在城下宣战：第一座城可以随意，之后仍要求对方是邻国。 */
function canPlayerDeclareSite(state, site) {
  if (!site || !site.ownerFaction) return { ok: false, msg: '这里没有可宣战的对象' };
  const faction = site.ownerFaction;
  if (faction === 'bandit') return { ok: false, msg: '这里没有可宣战的对象' };
  if (atWar(state, 'player', faction)) return { ok: false, msg: '你已经在和他们打仗' };
  const own = ownedCities(state, 'player');
  if (!own.length) return { ok: true, msg: '第一座城，可以打' };
  if (!factionsAdjacent(state, 'player', faction)) {
    return { ok: false, msg: '只能向道路接壤的邻国宣战' };
  }
  const storyRestriction = storyPlayerWarRestriction(state, faction);
  if (storyRestriction) return storyRestriction;
  return { ok: true, msg: '' };
}

/** 关隘/要地的防御系数：只有占据该要地的势力，才在它的八格内享受 1.5 倍。 */
function strategicDefenseAt(state, faction, x, y) {
  if (!state || !state.world || !state.world.sites) return 1;
  let best = 1;
  Object.keys(STRATEGIC_SITES).forEach(function (id) {
    const cfg = STRATEGIC_SITES[id];
    const site = (state.world.sites || []).filter(function (s) { return s.id === id; })[0];
    if (!site) return;
    const held = (site.playerOwned && (faction === 'player' || (state.player && state.player.faction === faction)))
      || site.ownerFaction === faction;
    if (!held) return;
    const d = Math.max(Math.abs(x - site.x), Math.abs(y - site.y));
    if (d <= (cfg.radius || 8)) best = Math.max(best, cfg.defense || 1.5);
  });
  return best;
}

/** 城下防御：城本身是要地且仍由守方控制时，守军吃 1.5 倍。 */
function strategicDefenseForSite(state, site) {
  if (!site || !STRATEGIC_SITES[site.id]) return 1;
  if (!site.ownerFaction && !site.playerOwned) return 1;
  return STRATEGIC_SITES[site.id].defense || 1.5;
}

function strategicEdgeForInfo(state, info) {
  if (!info || !info.pos) return 1;
  return strategicDefenseAt(state, info.isPlayer ? 'player' : info.faction,
    info.pos.x, info.pos.y);
}

// 开局已经撕破脸的那几对，都有出处
const SEED_WARS = [
  ['wei', 'lv'],      // 兖州：曹操与吕布
  ['wei', 'shu'],     // 徐州：曹操与刘备
  ['wei', 'ma'],      // 关中：曹操与马腾
  ['wu', 'biao'],     // 江夏：孙坚死于黄祖箭下
  ['wu', 'wei'],      // 赤壁前的水路
  ['yuan', 'lv'],     // 袁绍与吕布，翻脸比结盟快
  ['lv', 'yuanshu'],  // 徐州与淮南的粮道
  ['yuan', 'xianbei'],// 北境
  ['ma', 'han'],      // 西凉内斗：马腾与韩遂
  ['zhang', 'shu'],   // 刘璋拒刘备入蜀
];

function pushLogSafe() {
  // 由 state 注入，避免循环 require
}

let logFn = pushLogSafe;

function bindLogger(fn) {
  logFn = fn || pushLogSafe;
}

function bindPartyDestroyer(fn) {
  destroyPartyFn = fn || null;
}

function init(state) {
  if (!state.factionWars || typeof state.factionWars !== 'object') state.factionWars = {};
  const m = state.factionWars;
  // 开局全天下按兵不动。旧档里已经有战争记录的，视为天下已经动过，原样保留。
  if (!state.diplomacyStarted && Object.keys(m).length) state.diplomacyStarted = true;
  if (!state.diplomacySeeded) state.diplomacySeeded = true;
  if (!state.prisoners) state.prisoners = [];
  return m;
}

/** 战和消息是否要弹到玩家眼前（扎营里可以关掉） */
function alertsEnabled(state) {
  return !state || !state.settings || state.settings.diplomacyAlerts !== false;
}

/** 陈留歇满一天后，天下开始动：第一批战书一次放出，只合成一条军情。 */
function startDiplomacy(state) {
  if (!state || state.openingWarsDeclared) return 0;
  state.openingWarsDeclared = true;
  state.diplomacyStarted = true;
  // 剧情模式的开局战书由 story.init 按阶段递出；这里不再撒通用随机战火。
  if (state.story && state.story.mode) return 0;
  const pairs = [
    ['wei', 'lv'],
    ['wu', 'biao'],
    ['yuan', 'xianbei'],
    ['ma', 'han'],
  ];
  let started = 0;
  pairs.forEach(function (pair) {
    if (started >= 3) return;
    if (declare(state, pair[0], pair[1], true, true)) started += 1;
  });
  // 曹操和吕布不是只在地图上挂一个“交战”的名分：宣战当天就让两军先锋撞上，
  // 否则玩家在陈留看到的只是一行战报，地图上仍旧风平浪静。
  if (state.factionWars && state.factionWars[key('wei', 'lv')] && !state.openingClashDone) {
    state.openingClashDone = true;
    startOpeningClash(state, 'wei', 'lv');
  }
  return started;
}

/** 开局第一场曹吕遭遇：取两军离得最近的一对领主，直接在前线拉出一场合战。 */
function startOpeningClash(state, factionA, factionB) {
  const aLords = (state.lords || []).filter(function (l) {
    return l && l.faction === factionA && l.alive && !l.dead && !l.retired &&
      !l.inCity && !l.prisoner && !l.fieldBattleId && army.troopCount(l.troops || {}) > 0;
  });
  const bLords = (state.lords || []).filter(function (l) {
    return l && l.faction === factionB && l.alive && !l.dead && !l.retired &&
      !l.inCity && !l.prisoner && !l.fieldBattleId && army.troopCount(l.troops || {}) > 0;
  });
  if (!aLords.length || !bLords.length) return null;
  let a = null;
  let b = null;
  let best = Infinity;
  aLords.forEach(function (x) {
    bLords.forEach(function (y) {
      const d = Math.max(Math.abs(x.x - y.x), Math.abs(x.y - y.y));
      if (d < best) { best = d; a = x; b = y; }
    });
  });
  if (!a || !b) return null;
  const bf = createFieldBattle(state,
    { kind: 'lord', id: a.id }, { kind: 'lord', id: b.id }, {
      preAggregate: false,
      context: { kind: 'field', cause: 'opening' },
    });
  if (!bf) return null;
  const place = nearestOpeningPlace(state, bf.center);
  logFn(state, '曹操军的' + a.name + '与吕布军的' + b.name + '在' + place +
    '附近撞上，两边连阵都没列完就动了手。', 'war');
  return bf;
}

/** 给开局遭遇战找一个附近的地名，日志不至于只写“野地”。 */
function nearestOpeningPlace(state, center) {
  let best = null;
  let bestD = Infinity;
  ((state.world && state.world.sites) || []).forEach(function (s) {
    if (!s || (s.type !== 'town' && s.type !== 'castle' && s.type !== 'village')) return;
    const d = Math.max(Math.abs(s.x - center.x), Math.abs(s.y - center.y));
    if (d < bestD) { bestD = d; best = s; }
  });
  return best ? best.name : '陈留以东';
}

function atWar(state, a, b) {
  if (!a || !b || a === b) return false;
  if (a === 'bandit' || b === 'bandit') return true;
  if (!FACTIONS[a] || !FACTIONS[b]) return false;
  if (a === 'player' && state.wars && state.wars[b]) return true;
  if (b === 'player' && state.wars && state.wars[a]) return true;
  const m = state.factionWars || init(state);
  return !!m[key(a, b)];
}

function warPartners(state, f) {
  const m = state.factionWars || {};
  const out = [];
  Object.keys(m).forEach(function (k) {
    const parts = k.split('|');
    if (parts[0] === f) out.push(parts[1]);
    else if (parts[1] === f) out.push(parts[0]);
  });
  return out;
}

/** 这两家现在能不能开战：最多三国同时开战，开局曹袁/曹术不互打 */
function canOpenWar(state, a, b, ignoreNeighbor) {
  if (!a || !b || a === b) return false;
  if (a === 'bandit' || b === 'bandit') return false;
  if (!FACTIONS[a] || !FACTIONS[b]) return false;
  if (a === 'player' && b === 'player') return false;
  // 只有道路接壤的邻国才能宣战。开局的历史战事由调用方强制放行。
  if (!ignoreNeighbor && !factionsAdjacent(state, a, b)) return false;
  const day = state && state.clock ? state.clock.day : 1;
  if (day <= OPENING_DAYS) {
    const k = key(a, b);
    if (OPENING_FORBIDDEN[k]) return false;
  }
  if (warPartners(state, a).length >= MAX_WAR_PARTNERS) return false;
  if (warPartners(state, b).length >= MAX_WAR_PARTNERS) return false;
  return true;
}

function declare(state, a, b, quiet, ignoreNeighbor) {
  if (!FACTIONS[a] || !FACTIONS[b] || a === b) return false;
  if (a === 'bandit' || b === 'bandit') return false;
  const m = state.factionWars || init(state);
  if (m[key(a, b)]) return false;
  if (!canOpenWar(state, a, b, ignoreNeighbor)) return false;
  m[key(a, b)] = { since: state.clock.day, score: 0 };
  if (!quiet) {
    logFn(state, FACTIONS[a].full + '与' + FACTIONS[b].full + '翻了脸，使者连夜出境，边关开始点烽火。', 'war');
    // 剧情序章走完以后，天下大事要让人看见；几息后自己散
    if (alertsEnabled(state) && state.campaign && state.campaign.stage >= 1) {
      state.events.push({
        type: 'diplomacy', kind: 'war', a: a, b: b,
        title: '战云再起', lines: [
          FACTIONS[a].full + '与' + FACTIONS[b].full + '正式宣战。',
          '两家的使者连夜出境，边关烽火一处接一处点亮。',
          '天下这盘棋，又有人先掀了桌子。',
        ],
      });
    }
  }
  return true;
}

function makePeace(state, a, b, quiet) {
  // 斩了君主就是不死不休：这对玩家与那一家永远没有议和这一页
  const forever = state.noPeaceForever || {};
  if ((a === 'player' && forever[b]) || (b === 'player' && forever[a])) return false;
  if (state.story && state.story.noPeace && state.story.noPeace[key(a, b)]) return false;
  const m = state.factionWars || {};
  const k = key(a, b);
  if (!m[k]) {
    // 旧档的玩家战争只记在 state.wars 里；这里补一条收兵通道
    if (a === 'player' && state.wars && state.wars[b]) {
      state.wars[b] = false;
      state.relations[b] = 0;
      return true;
    }
    if (b === 'player' && state.wars && state.wars[a]) {
      state.wars[a] = false;
      state.relations[a] = 0;
      return true;
    }
    return false;
  }
  // 阵前杀过人家的人：一个月内谈不成；满一个月才允许翻过这一页
  if (state.noPeace && (state.noPeace[a] || state.noPeace[b])) {
    const day = state.killRecords && state.killRecords[a] !== undefined
      ? state.killRecords[a] : (state.killRecords && state.killRecords[b]);
    if (day === undefined || state.clock.day - day < 30) return false;
  }
  delete m[k];
  // 与玩家议和：旧账一笔勾销，关系回到零（不论谁先提的）
  if (a === 'player' && FACTIONS[b]) {
    state.relations[b] = 0;
    if (state.wars) state.wars[b] = false;
  } else if (b === 'player' && FACTIONS[a]) {
    state.relations[a] = 0;
    if (state.wars) state.wars[a] = false;
  }
  if (!quiet) {
    logFn(state, FACTIONS[a].full + '与' + FACTIONS[b].full + '遣使议和，两家把刀收回鞘里，边界的鼓角停了一阵。', 'war');
    if (alertsEnabled(state) && state.campaign && state.campaign.stage >= 1) {
      state.events.push({
        type: 'diplomacy', kind: 'peace', a: a, b: b,
        title: '两家议和', lines: [
          FACTIONS[a].full + '与' + FACTIONS[b].full + '暂时收兵。',
          '边关的鼓角停了一阵，商队又开始过境。',
          '至于这纸和约能压住多久，没人敢说。',
        ],
      });
    }
  }
  return true;
}

/** AI 能不能替这两家宣战：不再把玩家效忠的国摘出去，天下该打就打。 */
function aiCanDeclare(state, a, b) {
  if (!a || !b || a === b) return false;
  if (a === 'bandit' || b === 'bandit' || a === 'player' || b === 'player') return false;
  return true;
}

/** 一天的战和合成一条军情，别再一条一条往外弹 */
function announceDiplomacyBatch(state, warPairs, peacePairs) {
  if (!alertsEnabled(state)) return;
  if (!warPairs.length && !peacePairs.length) return;
  const lines = [];
  warPairs.slice(0, 3).forEach(function (p) {
    lines.push(FACTIONS[p[0]].full + '与' + FACTIONS[p[1]].full + '正式宣战。');
  });
  if (warPairs.length > 3) lines.push('另外还有 ' + (warPairs.length - 3) + ' 路诸侯也在调兵。');
  peacePairs.slice(0, 2).forEach(function (p) {
    lines.push(FACTIONS[p[0]].full + '与' + FACTIONS[p[1]].full + '遣使议和，暂时收兵。');
  });
  if (peacePairs.length > 2) lines.push('另有 ' + (peacePairs.length - 2) + ' 对诸侯停了刀兵。');
  if (lines.length < 2) lines.push('驿道上的信使跑了一夜，边关的烽火跟着换了方向。');
  state.events.push({
    type: 'diplomacy',
    kind: warPairs.length ? 'war' : 'peace',
    title: warPairs.length ? '天下军情' : '两家罢兵',
    lines: lines.slice(0, 5),
  });
}

/** 每日外交：随机宣战、随机议和。打的年头太久会自己收手。 */
function diplomacyTick(state) {
  const m = state.factionWars || init(state);
  if (!state.diplomacyStarted && Object.keys(m).length) state.diplomacyStarted = true;
  if (!state.diplomacyStarted) return;
  // 剧情模式：战和只按战略阶段走，不再随机宣战/议和。
  if (state.story && state.story.mode) {
    state.lastDiplomacyDay = state.clock.day;
    return;
  }
  // 一天最多合成一条军情，降低连续弹窗
  if (state.lastDiplomacyDay === state.clock.day) return;
  const rng = state.rng;
  const ids = Object.keys(FACTIONS).filter(function (id) { return id !== 'bandit' && id !== 'player'; });
  const warPairs = [];
  const peacePairs = [];

  // 新仇：天下不太平，隔三差五才有人翻脸
  if (rng.next() < 0.11) {
    const a = ids[rng.int(0, ids.length - 1)];
    const b = ids[rng.int(0, ids.length - 1)];
    if (a !== b && aiCanDeclare(state, a, b) && !atWar(state, a, b) && canOpenWar(state, a, b)) {
      if (declare(state, a, b, true)) warPairs.push([a, b]);
    }
  }

  // 议和：玩家仍可主动谈；AI 不再随机收兵，否则天下永远打不到统一。
  if (!warPairs.length) {
    const keys = Object.keys(m);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const w = m[k];
      if (!w) continue;
      const days = state.clock.day - (w.since || 1);
      if (days > MIN_WAR_DAYS && rng.next() < 0.0) {
        const parts = k.split('|');
        if (makePeace(state, parts[0], parts[1], true)) {
          peacePairs.push(parts);
          break;
        }
      }
    }
  }

  if (warPairs.length || peacePairs.length) {
    state.lastDiplomacyDay = state.clock.day;
    announceDiplomacyBatch(state, warPairs, peacePairs);
  }
}

/** 敌国主动向玩家求和：开战满 30 天才可能发；杀过对方将领则要等 60 天。
 * 每天一次概率判定，同一势力两次求和至少隔 7 天。 */
const PEACE_OFFER_MIN_WAR = 30;
const PEACE_OFFER_MIN_KILL = 60;
const PEACE_OFFER_CHANCE = 0.08;
const PEACE_OFFER_GAP = 7;

function peaceOfferTick(state) {
  if (!state || state.peaceOfferPending) return false;
  // 扎营里关了战和提醒：不再用求和使者把玩家从地图上拽下来
  if (!alertsEnabled(state)) return false;
  const rng = state.rng;
  const now = state.clock.day;
  const ids = Object.keys(FACTIONS).filter(function (id) {
    return id !== 'bandit' && id !== 'player';
  });
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!atWar(state, 'player', id)) continue;
    if ((state.factionState[id] || {}).dead) continue;
    if (state.noPeaceForever && state.noPeaceForever[id]) continue;
    const w = (state.factionWars || {})[key('player', id)];
    const since = (w && w.since) ||
      (state.playerWarSince && state.playerWarSince[id]) || now;
    const warDays = now - since;
    if (warDays < PEACE_OFFER_MIN_WAR) continue;
    const killDay = state.killRecords && state.killRecords[id];
    if (killDay !== undefined && now - killDay < PEACE_OFFER_MIN_KILL) continue;
    const cool = state.peaceOfferCooldown && state.peaceOfferCooldown[id];
    if (cool && now < cool) continue;
    if (rng.next() >= PEACE_OFFER_CHANCE) continue;

    state.peaceOfferPending = id;
    state.peaceOfferCooldown = state.peaceOfferCooldown || {};
    state.peaceOfferCooldown[id] = now + PEACE_OFFER_GAP;
    state.events.push({
      type: 'peace-offer',
      factionId: id,
      title: '议和使者',
      lines: [
        FACTIONS[id].full + '的使者来到帐前，说两家再打下去只会让旁人捡便宜。',
        '他愿意把此前的旧账一笔勾销，只求你把围城的兵撤回去。',
        '接受议和，可得一支天机简；不接受，使者即刻就走。',
      ],
    });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------ 战斗 */

/** 兵种层级基准：t1=1、t2=2、t3=4、t4=8、t5=16 */
function tierPower(tier) {
  const t = Math.max(1, Math.min(5, Math.round(tier || 1)));
  return Math.pow(2, t - 1);
}

/** 单兵层级战力，不含国别倍率；1 个 t2 等于 2 个 t1 */
function tierForce(troops) {
  let sum = 0;
  Object.keys(troops || {}).forEach(function (id) {
    const t = TROOPS[id];
    sum += (troops[id] || 0) * tierPower(t ? t.tier : 1);
  });
  return sum;
}

/** 野战/攻城权重：保留原来 t1≈6 的量级，方便守军常数继续用 */
function weight(troops) {
  return tierForce(troops) * 6;
}

/**
 * 国别对拼倍率：a 打 b 时 a 的等效战力。
 * 魏蜀吴彼此（neutral）按 1 倍，对普通势力按 FACTION_COMBAT.power。
 * 例如曹操军对刘璋：2 兵等效 3 兵，消耗结算里也按这个倍率减伤。
 */
function factionEdge(a, b) {
  if (!a || !b || a === b) return 1;
  const cfg = FACTION_COMBAT[a];
  if (!cfg) return 1;
  if (cfg.neutral && cfg.neutral.indexOf(b) >= 0) return 1;
  return cfg.power || 1;
}

function combatTroops(unit, foeFaction) {
  return weight(unit && unit.troops) * factionEdge(unit && unit.faction, foeFaction);
}

function nearPlayer(state, unit, r) {
  const p = state.player;
  return Math.max(Math.abs(unit.x - p.x), Math.abs(unit.y - p.y)) <= (r || 12);
}

/** 溃逃只走正常步速的一步，不能直接改坐标；更不能落进任何城池格。 */
function moveAway(state, lord) {
  if (!lord) return false;
  const nowH = state.clock.day * 24 + state.clock.hour;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const start = state.rng.int(0, dirs.length - 1);
  let spot = null;
  // 溃逃也一次只走一格：选两格会让数据坐标一下跨两格，
  // 虽然后面有插值，画面上仍像“闪”过去。绕路交给下一拍重算。
  for (let dist = 1; dist >= 1 && !spot; dist--) {
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[(start + i) % dirs.length];
      const nx = lord.x + d[0] * dist;
      const ny = lord.y + d[1] * dist;
      if (nx < 1 || ny < 1 || nx >= state.world.w - 1 || ny >= state.world.h - 1) continue;
      if (isPassable && !isPassable(state.world, nx, ny)) continue;
      if (siteAtFn && siteAtFn(state.world, nx, ny)) continue;
      if (unitOccupiesFn && unitOccupiesFn(state, lord, nx, ny)) continue;
      spot = { x: nx, y: ny };
      break;
    }
  }
  if (!spot) {
    // 被围死也不原地瞬移；先停一拍，等下一轮再找路。
    lord.nextMoveH = Math.max(lord.nextMoveH || 0, nowH + 5);
    return false;
  }
  // 溃逃与逃遁同速：5 时辰一格，带插值，不再“闪”过去。
  lord.routePath = null;
  lord.routePathFor = null;
  lord.patrolPath = null;
  const hours = 5;
  if (unitStepFn) unitStepFn(state, lord, spot, hours);
  else {
    const from = { x: lord.x, y: lord.y };
    lord.stepFrom = from;
    lord.stepTo = spot;
    lord.stepStartH = nowH;
    lord.stepHours = hours;
    lord.x = spot.x;
    lord.y = spot.y;
  }
  lord.nextMoveH = nowH + hours;
  // 退却时取消“马上进城”的待办，避免溃逃落点又触发瞬间收旗。
  lord.enteringSiteId = null;
  lord.cityEnterAtH = null;
  return true;
}

let isPassable = null;
let fleeGuard = null;
let unitStepFn = null;
let unitOccupiesFn = null;
let siteAtFn = null;
function bindPassable(fn) { isPassable = fn; }
function bindFleeGuard(fn) { fleeGuard = fn; }
function bindMovement(stepFn, occupyFn, siteFn) {
  unitStepFn = stepFn || null;
  unitOccupiesFn = occupyFn || null;
  siteAtFn = siteFn || null;
}

/**
 * 野战/合战结算时也要走同一套“什么时候绝不许逃”的判断。
 * 守城、五格内有友军、本阵营无城、敌国已把本城定为目标，超过十人时
 * 一律不许溃逃；这里返回 false 时改成被俘/留在原地，不能再 moveAway。
 */
function lordMayLeaveField(state, unit, winner) {
  if (!fleeGuard || !unit || !unit.id) return true;
  if (unit.faction === 'bandit' || unit.kind === 'party' || !unit.troops) return true;
  return !!fleeGuard(state, unit, winner);
}

/** 战败脱身/归降时回本城，也要一格一格走，不能直接改坐标闪回城。 */
function placeLordAtSiteAnimated(state, lord, site, why) {
  if (!lord || !site || !lord.alive) return;
  lord.routePath = null;
  lord.routePathFor = null;
  lord.patrolPath = null;
  const dist = Math.max(1, Math.max(Math.abs(lord.x - site.x), Math.abs(lord.y - site.y)));
  const hours = Math.max(6, 6 * dist);
  if (unitStepFn) unitStepFn(state, lord, { x: site.x, y: site.y }, hours);
  else {
    lord.x = site.x;
    lord.y = site.y;
  }
  const nowH = state.clock.day * 24 + state.clock.hour;
  lord.nextMoveH = Math.max(lord.nextMoveH || 0, nowH + hours);
  if (why) logFn(state, why, 'war');
  return lord;
}

/** 俘虏这位领主，押在 captor 的老家 */
function capture(state, loser, captorFaction, captorName) {
  const homeSite = state.world.sites && state.world.sites.filter(function (s) {
    return captorFaction === 'player'
      ? s.playerOwned
      : (s.ownerFaction === captorFaction && s.type !== 'camp' && s.type !== 'village');
  })[0];
  const siteId = homeSite ? homeSite.id : loser.home;
  loser.alive = false;
  loser.chasing = false;
  loser.hunting = false;
  loser.fleeing = false;
  loser.scattered = false;
  loser.scatterUntilH = 0;
  loser.scatterHomeId = null;
  loser.respawnDay = 0;
  loser.fleeTargetId = null;
  loser.fleePath = null;
  loser.order = null;
  loser.defending = null;
  loser.inCity = null;
  loser.engagedWith = null;
  loser.engagedSinceH = null;
  loser.scuffle = 0;
  loser.prisoner = {
    by: captorFaction,
    byName: captorName || '',
    siteId: siteId,
    since: state.clock.day,
    days: 0,
  };
  loser.troops = {};
  if (!state.prisoners) state.prisoners = [];
  state.prisoners.push({ lordId: loser.id, by: captorFaction, byName: captorName || '', siteId: siteId, since: state.clock.day, days: 0 });
  const site = state.world.sites.filter(function (s) { return s.id === siteId; })[0];
  const place = site ? site.name : '城里';
  logFn(state,
    (captorName ? captorName + '的部曲' : '对方') + '把' + loser.name + '从马上拽下来捆了，押进' + place + '的牢里。',
    'war');
  return true;
}

function takeSome(base, n) {
  const out = {};
  let put = 0;
  Object.keys(base || {}).forEach(function (id) {
    if (put >= n) return;
    const take = Math.min(base[id], n - put);
    if (take > 0) { out[id] = take; put += take; }
  });
  return out;
}

function freeLord(state, lord, why) {
  const home = state.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  lord.alive = true;
  lord.prisoner = null;
  lord.scattered = false;
  lord.scatterUntilH = 0;
  lord.scatterHomeId = null;
  lord.scatterCityId = null;
  lord.scatterRecovering = false;
  lord.scatterHidden = false;
  lord.order = null;
  lord.defending = null;
  lord.chasing = false;
  lord.hunting = false;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleePath = null;
  lord.fleePathFor = null;
  lord.engagedWith = null;
  lord.engagedSinceH = null;
  lord.scuffle = 0;
  lord.enteringSiteId = null;
  lord.cityEnterAtH = null;
  if (home) placeLordAtSiteAnimated(state, lord, home);
  else { lord.x = lord.x; lord.y = lord.y; }
  const keep = Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.45));
  lord.troops = takeSome(lord.defTroops, keep);
  lord.respawnDay = 0;
  lord.scuffle = 8;
  if (why) logFn(state, why, 'war');
  return lord;
}

function clearEngagement(a, b) {
  if (a) { a.engagedWith = null; a.engagedSinceH = null; }
  if (b) { b.engagedWith = null; b.engagedSinceH = null; }
}

/**
 * 兵被打光的领主：不是俘虏，也不是“还剩残兵的逃窜”，而是队伍被打散。
 * 打散后从大地图上立即消失，三天内不显示、不移动、不招募；
 * 三天后由 scatteredLordTick 悄悄送到募兵最快的城，从零开始重新招兵。
 * 这里只写状态，不改地图坐标。
 */
function markLordScattered(state, lord, source) {
  if (!lord) return null;
  const nowH = state.clock.day * 24 + state.clock.hour;
  lord.alive = true;
  lord.prisoner = null;
  lord.scattered = true;
  lord.scatterUntilH = Math.max(lord.scatterUntilH || 0, nowH + 72);
  // 记下本土城只作档案/旧档兼容；真正的复活点由 scatteredLordTick 选募兵最快的城。
  lord.scatterHomeId = lord.scatterHomeId || lord.home;
  lord.respawnDay = Math.max(lord.respawnDay || 0, state.clock.day + 3);
  lord.scatterFrom = source || 'battle';
  lord.scatterCityId = null;
  lord.scatterRecovering = false;
  // 全程不可见：地图模型、城池领主列表、战报都不再出现。
  lord.scatterHidden = true;
  lord.inCity = null;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleePath = null;
  lord.fleePathFor = null;
  lord.chasing = false;
  lord.hunting = false;
  lord.banditChasing = null;
  lord.foeChasing = null;
  lord.order = null;
  lord.defending = null;
  lord.engagedWith = null;
  lord.engagedSinceH = null;
  lord.scuffle = Math.max(lord.scuffle || 0, 8);
  lord.routePath = null;
  lord.routePathFor = null;
  lord.orderPath = null;
  lord.orderDetourTarget = null;
  lord.patrolPath = null;
  lord.stuckEscape = null;
  lord.nextMoveH = nowH;
  lord.resting = true;
  return lord;
}

/**
 * 两位领主在路上撞上：不是碰一下就散，而是原地列阵打一场大的。
 * 每 3 小时结算一轮，双方都成片掉人；打崩之后败方大概率溃逃，
 * 小概率被俘。交战期间双方都停住不动。
 */
function clash(state, a, b) {
  const edgeA = factionEdge(a.faction, b.faction);
  const edgeB = factionEdge(b.faction, a.faction);
  const wa = weight(a.troops) * edgeA;
  const wb = weight(b.troops) * edgeB;
  if (wa <= 0 || wb <= 0) {
    // 已经有一方是空架子：不要再返回 null 让幽灵部队挂在原地。
    // 还有兵的一方算胜者；零兵一方一律按“打散”处理，不进入逃逸/俘虏判定。
    const empty = wa <= 0 ? a : b;
    const other = wa <= 0 ? b : a;
    if (empty && !empty.prisoner && empty.faction !== 'bandit') {
      const emptyHasTroops = army.troopCount(empty.troops || {}) > 0;
      if (!emptyHasTroops) {
        // 0 兵一律算打散，不看能不能离场；三天后回本土城收拢旧部。
        markLordScattered(state, empty, other ? other.name : 'battle');
      }
    }
    clearEngagement(a, b);
    return { scattered: true };
  }
  const share = wa / (wa + wb);
  const totalA = army.troopCount(a.troops);
  const totalB = army.troopCount(b.troops);

  if (a.engagedWith !== b.id || b.engagedWith !== a.id) {
    const nowH = state.clock.day * 24 + state.clock.hour;
    a.engagedSinceH = nowH;
    b.engagedSinceH = nowH;
  }
  a.engagedWith = b.id;
  b.engagedWith = a.id;
  a.scuffle = 0;
  b.scuffle = 0;

  // 大规模交战：主力和主力正面压上，每轮掉 6%~24%。
  // 精锐国（魏蜀吴）按对拼倍率少掉人：曹操 2 兵能跟普通势力 3 兵对耗。
  const lossA = Math.max(1, Math.round(totalA * (0.06 + (1 - share) * 0.16) / Math.max(1, edgeA)));
  const lossB = Math.max(1, Math.round(totalB * (0.06 + share * 0.16) / Math.max(1, edgeB)));
  army.distributeLosses(a.troops, lossA);
  army.distributeLosses(b.troops, lossB);

  const remainA = army.troopCount(a.troops);
  const remainB = army.troopCount(b.troops);
  const winner = share >= 0.5 ? a : b;
  const loser = share >= 0.5 ? b : a;
  const winnerRemain = share >= 0.5 ? remainA : remainB;
  const loserRemain = share >= 0.5 ? remainB : remainA;

  const near = nearPlayer(state, winner, 10);

  // 一边被打空了，或者阵线被打穿：被俘 / 溃逃
  const broken = loserRemain <= 0 || loserRemain < 6 ||
    (loserRemain / Math.max(1, winnerRemain)) < 0.28;
  if (!broken) {
    // 还在打：双方都不走，地图上显示交战。
    if (near) logFn(state, a.name + '与' + b.name + '在野地里列阵相攻，双方都不退，阵线上又倒下一片。', 'war');
    return { engaged: true };
  }

  clearEngagement(a, b);
  const rng = state.rng;
  // 乱世里保住人比保住脸重要：打散之后大概率还能跑，极少真被捆走。
  // 但守城、结阵、无城可退时这套豁免优先：不许逃，直接按被俘处理。
  const mayLeave = lordMayLeaveField(state, loser, winner);
  // 0 兵 = 自动打散，不是逃逸，也不是俘虏；三天后在本土城复活。
  // 只有还剩 1 名以上士兵，才进入下面的“带残兵逃逸/被俘”判定。
  if (loserRemain <= 0) {
    markLordScattered(state, loser, winner ? winner.name : 'battle');
    // 打散全程对玩家不可见：不写战报，也不在附近提示“三天后重立”。
    return { scattered: true };
  }
  const fleeRoll = rng.next() < 0.82;
  if (fleeRoll && mayLeave) {
    loser.alive = true;
    loser.chasing = false;
    loser.hunting = false;
    loser.fleeing = true;
    loser.fleeTargetId = null;
    loser.fleeFrom = winner ? winner.id : null;
    loser.fleePath = null;
    moveAway(state, loser);
    loser.scuffle = 10;
    if (near) logFn(state, loser.name + '的阵线先散，带着残兵往野地里跑了，' + winner.name + '也没有死追。', 'war');
    return { flee: true };
  }

  capture(state, loser, winner.faction, winner.name);
  if (near) logFn(state, loser.name + '被' + winner.name + '的部曲围住，当场捆了。', 'war');
  return { capture: true };
}


/* ------------------------------------------------------- 五格合战 / 动态战场 */

const FIELD_BATTLE_RADIUS = 5;
const FIELD_BATTLE_LIMIT = 8;

function copyTroops(troops) {
  return JSON.parse(JSON.stringify(troops || {}));
}

function fieldRefKey(ref) {
  if (!ref) return '';
  if (ref.kind === 'player') return 'player';
  return (ref.kind || '') + ':' + (ref.id || '');
}

function fieldUnitOfRef(state, ref) {
  if (!ref) return null;
  if (ref.kind === 'player') return state.player;
  if (ref.kind === 'lord') {
    return (state.lords || []).filter(function (l) { return l.id === ref.id; })[0] || null;
  }
  if (ref.kind === 'party') {
    return (state.parties || []).filter(function (p) { return p.id === ref.id; })[0] || null;
  }
  return null;
}

function fieldUnitInfo(state, ref, override) {
  if (override) {
    const copy = Object.assign({}, override);
    copy.key = copy.key || fieldRefKey(ref);
    copy.kind = copy.kind || (ref && ref.kind) || '';
    copy.id = copy.id || (ref && ref.id) || '';
    copy.relationFaction = copy.relationFaction !== undefined ? copy.relationFaction : (copy.faction || null);
    copy.pos = copy.pos || (ref && fieldUnitOfRef(state, ref)) || null;
    copy.troops = copyTroops(copy.troops);
    copy.count = army.troopCount(copy.troops);
    copy.initialCount = copy.count;
    return copy;
  }
  if (!ref) return null;
  if (ref.kind === 'player') {
    const p = state.player;
    return {
      key: 'player', kind: 'player', id: 'player', name: p.name,
      faction: p.faction || null, relationFaction: p.faction || 'player',
      troops: copyTroops(p.troops), morale: p.morale, atkPct: 0, defPct: 0,
      isPlayer: true, pos: p, count: army.troopCount(p.troops),
    };
  }
  const unit = fieldUnitOfRef(state, ref);
  if (!unit) return null;
  if (ref.kind === 'lord') {
    return {
      key: 'lord:' + unit.id, kind: 'lord', id: unit.id, name: unit.name + '军',
      faction: unit.faction || null, relationFaction: unit.faction || null,
      troops: copyTroops(unit.troops), morale: unit.morale,
      atkPct: 0.05, defPct: 0.05, isPlayer: false, pos: unit,
      count: army.troopCount(unit.troops),
    };
  }
  return {
    key: 'party:' + unit.id, kind: 'party', id: unit.id, name: unit.name,
    faction: unit.faction || 'bandit', relationFaction: unit.faction || 'bandit',
    troops: copyTroops(unit.troops), morale: unit.morale,
    atkPct: 0, defPct: 0, isPlayer: false, pos: unit,
    count: army.troopCount(unit.troops),
  };
}

function fieldUnitEligible(info) {
  if (!info || !info.pos) return false;
  if (info.kind === 'player') {
    return !!info.pos && !info.pos.gameOver && !info.pos.atSiteId;
  }
  if (info.kind === 'lord') {
    const l = info.pos;
    return !!l && l.alive && !l.dead && !l.retired && !l.prisoner && !l.inCity &&
      !l.fieldBattleId && army.troopCount(l.troops || {}) > 0;
  }
  if (info.kind === 'party') {
    const q = info.pos;
    return !!q && !q.dead && !q.scripted && !q.fieldBattleId &&
      army.troopCount(q.troops || {}) > 0;
  }
  return false;
}

/** 五格内所有可参战单位（玩家、领主、匪团） */
function collectNearbyFieldUnits(state, center, radius) {
  const r = typeof radius === 'number' ? radius : FIELD_BATTLE_RADIUS;
  const out = [];
  const refs = [{ kind: 'player', id: 'player' }];
  (state.lords || []).forEach(function (l) { refs.push({ kind: 'lord', id: l.id }); });
  (state.parties || []).forEach(function (p) { refs.push({ kind: 'party', id: p.id }); });
  refs.forEach(function (ref) {
    const info = fieldUnitInfo(state, ref);
    if (!info || !fieldUnitEligible(info)) return;
    const pos = info.pos;
    if (!pos) return;
    const d = Math.max(Math.abs(pos.x - center.x), Math.abs(pos.y - center.y));
    if (d > r) return;
    out.push(info);
  });
  return out;
}

function fieldFactionOf(info) {
  if (!info) return null;
  return info.relationFaction !== undefined ? info.relationFaction : (info.faction || null);
}

/** 严格按“对对方敌对、但不对自己敌对”的阵营规则归边 */
function fieldSideFor(state, info, fa, fb) {
  const f = fieldFactionOf(info);
  if (!f) return null;
  if (f === fa) return 'a';
  if (f === fb) return 'b';
  const atA = atWar(state, f, fa);
  const atB = atWar(state, f, fb);
  if (atB && !atA) return 'a';
  if (atA && !atB) return 'b';
  return null;
}

function scaleTroopsTo(troops, target) {
  const source = copyTroops(troops);
  const total = army.troopCount(source);
  const want = Math.max(0, Math.round(target));
  if (want <= 0) return {};
  if (want >= total) return source;
  const out = {};
  let assigned = 0;
  const ids = Object.keys(source);
  const fractions = [];
  ids.forEach(function (id) {
    const exact = source[id] * want / total;
    const n = Math.floor(exact);
    if (n > 0) { out[id] = n; assigned += n; }
    fractions.push({ id: id, frac: exact - n, count: source[id] });
  });
  let remain = want - assigned;
  fractions.sort(function (a, b) { return b.frac - a.frac; });
  for (let i = 0; i < fractions.length && remain > 0; i++) {
    const f = fractions[i];
    if ((out[f.id] || 0) < f.count) { out[f.id] = (out[f.id] || 0) + 1; remain -= 1; }
  }
  return out;
}

function contingentTroops(contingent) {
  if (!contingent) return {};
  return scaleTroopsTo(contingent.snapshot, contingent.count);
}

function buildCoalitionSide(state, infos, foeFaction, opts) {
  const sideTroops = {};
  const contingents = [];
  let countTotal = 0;
  let moraleWeight = 0;
  let atkWeight = 0;
  let defWeight = 0;
  let forceTotal = 0;
  let edgeWeight = 0;
  let gateWeight = 0;
  const primary = infos[0];
  infos.forEach(function (info) {
    const group = copyTroops(info.troops);
    const n = army.troopCount(group);
    if (n <= 0) return;
    Object.keys(group).forEach(function (id) {
      sideTroops[id] = (sideTroops[id] || 0) + group[id];
    });
    countTotal += n;
    moraleWeight += (typeof info.morale === 'number' ? info.morale : 60) * n;
    atkWeight += (info.atkPct || 0) * n;
    defWeight += (info.defPct || 0) * n;
    const force = tierForce(group);
    const gate = strategicEdgeForInfo(state, info);
    forceTotal += force;
    edgeWeight += force * factionEdge(info.faction, foeFaction);
    gateWeight += force * gate;
    contingents.push({
      key: info.key || fieldRefKey({ kind: info.kind, id: info.id }),
      kind: info.kind, id: info.id, name: info.name,
      faction: info.faction || null,
      gateFaction: info.isPlayer ? 'player' : (info.faction || null),
      x: info.pos ? info.pos.x : null,
      y: info.pos ? info.pos.y : null,
      count: n, initialCount: n, snapshot: group,
      isPlayer: !!info.isPlayer,
    });
  });
  const baseName = (opts && opts.name) || (primary && primary.name) || '无名之师';
  const sideName = contingents.length > 1
    ? baseName.replace(/军$/, '') + '联军'
    : baseName;
  const names = contingents.map(function (c) { return c.name; }).join('、');
  return {
    name: sideName,
    faction: primary ? (primary.faction || null) : null,
    troops: sideTroops,
    morale: countTotal ? moraleWeight / countTotal : 60,
    atkPct: countTotal ? atkWeight / countTotal : 0,
    defPct: countTotal ? defWeight / countTotal : 0,
    isPlayer: !!(opts && opts.isPlayer) || contingents.some(function (c) { return c.isPlayer; }),
    edge: forceTotal ? edgeWeight / forceTotal : 1,
    gateEdge: forceTotal ? gateWeight / forceTotal : 1,
    coalitionNames: names,
    contingents: contingents,
    force: forceTotal,
  };
}

function playerContingentOf(battle) {
  const side = battle && battle.a;
  if (!side || !side.contingents) return null;
  return side.contingents.filter(function (c) { return c.isPlayer; })[0] || null;
}

function fieldBattleById(state, id) {
  return (state.fieldBattles || []).filter(function (b) { return b && b.id === id; })[0] || null;
}

function markFieldParticipants(state, battlefield, infos, side) {
  infos.forEach(function (info) {
    const unit = info.pos;
    if (!unit) return;
    unit.fieldBattleId = battlefield.id;
    battlefield.participants.push({
      key: info.key || fieldRefKey({ kind: info.kind, id: info.id }),
      side: side, kind: info.kind, id: info.id, name: info.name, faction: info.faction,
    });
  });
}

/** 创建一场野战。preAggregate=false 时先只让最初两方入阵，其他单位战中再进。 */
function createFieldBattle(state, aRef, bRef, opts) {
  const options = opts || {};
  if (!state.fieldBattles) state.fieldBattles = [];
  if (state.fieldBattles.length >= FIELD_BATTLE_LIMIT) return null;
  const aInfo = fieldUnitInfo(state, aRef, options.aInfo);
  const bInfo = fieldUnitInfo(state, bRef, options.bInfo);
  if (!aInfo || !bInfo) return null;
  if (!options.playerInvolved && (!fieldUnitEligible(aInfo) || !fieldUnitEligible(bInfo))) return null;
  const fa = fieldFactionOf(aInfo);
  const fb = fieldFactionOf(bInfo);
  if (!atWar(state, fa, fb)) return null;
  const center = {
    x: Math.round(((aInfo.pos ? aInfo.pos.x : 0) + (bInfo.pos ? bInfo.pos.x : 0)) / 2),
    y: Math.round(((aInfo.pos ? aInfo.pos.y : 0) + (bInfo.pos ? bInfo.pos.y : 0)) / 2),
  };
  const playerInvolved = !!options.playerInvolved || !!aInfo.isPlayer || !!bInfo.isPlayer;
  const seq = (state.fieldBattleSeq || 1);
  state.fieldBattleSeq = seq + 1;
  const id = 'fb' + seq;

  const aInfos = [aInfo];
  const bInfos = [bInfo];
  if (options.preAggregate !== false) {
    const existing = [aInfo.key, bInfo.key];
    collectNearbyFieldUnits(state, center, options.radius || FIELD_BATTLE_RADIUS).forEach(function (info) {
      if (existing.indexOf(info.key) >= 0) return;
      if (playerInvolved && info.isPlayer) return;
      const side = fieldSideFor(state, info, fa, fb);
      if (side === 'a') aInfos.push(info);
      else if (side === 'b') bInfos.push(info);
    });
  }

  const aSide = buildCoalitionSide(state, aInfos, fb, {
    name: aInfo.name, isPlayer: playerInvolved && options.playerSide !== 'b',
  });
  const bSide = buildCoalitionSide(state, bInfos, fa, {
    name: bInfo.name, isPlayer: playerInvolved && options.playerSide === 'b',
  });
  const context = Object.assign({ kind: 'field' }, options.context || {});
  context.fieldBattleId = id;
  const battle = new Battle({
    rng: state.rng,
    attacker: aSide,
    defender: bSide,
    context: context,
  });
  battle.fieldBattleId = id;
  battle.joinLog = [];
  const battlefield = {
    id: id,
    center: center,
    radius: options.radius || FIELD_BATTLE_RADIUS,
    primaryA: { key: aInfo.key, faction: fa, name: aInfo.name },
    primaryB: { key: bInfo.key, faction: fb, name: bInfo.name },
    aSide: aSide,
    bSide: bSide,
    battle: battle,
    participants: [],
    startedH: state.clock.day * 24 + state.clock.hour,
    lastTickH: 0,
    joinLog: [],
    playerInvolved: playerInvolved,
    playerSide: options.playerSide || (aInfo.isPlayer ? 'a' : bInfo.isPlayer ? 'b' : null),
    context: context,
  };
  markFieldParticipants(state, battlefield, aInfos, 'a');
  markFieldParticipants(state, battlefield, bInfos, 'b');
  state.fieldBattles.push(battlefield);
  if (playerInvolved) state.battle = battle;
  return battlefield;
}

/** 把某一侧总兵力变化按各队现有人数摊回各队；Battle 只认总兵力，队伍身份保留在这里 */
function syncFieldBattle(state, battlefield, options) {
  const bf = typeof battlefield === 'string' ? fieldBattleById(state, battlefield) : battlefield;
  if (!bf || !bf.battle) return;
  ['a', 'b'].forEach(function (sk) {
    const side = bf.battle[sk];
    if (!side || !side.contingents) return;
    const current = army.troopCount(side.troops);
    const last = typeof side.lastCount === 'number' ? side.lastCount : side.initialCount;
    let loss = Math.max(0, last - current);
    if (loss > 0) {
      const totalBefore = side.contingents.reduce(function (s, c) { return s + Math.max(0, c.count || 0); }, 0);
      let left = loss;
      side.contingents.forEach(function (c, i) {
        if (left <= 0) return;
        const before = Math.max(0, c.count || 0);
        const take = i === side.contingents.length - 1
          ? Math.min(left, before)
          : Math.min(left, Math.floor(loss * before / Math.max(1, totalBefore)));
        c.count = Math.max(0, before - take);
        left -= take;
      });
      // 舍入误差再扣一遍，保证不会出现“队里有人、总数已归零”
      if (left > 0) {
        side.contingents.forEach(function (c) {
          if (left <= 0) return;
          const take = Math.min(left, Math.max(0, c.count || 0));
          c.count -= take;
          left -= take;
        });
      }
    }
    side.lastCount = current;
    const foeFaction = sk === 'a' ? bf.primaryB.faction : bf.primaryA.faction;
    let force = 0;
    let edge = 0;
    let gate = 0;
    side.contingents.forEach(function (c) {
      const f = tierForce(c.snapshot);
      force += f;
      edge += f * factionEdge(c.faction, foeFaction);
      gate += f * strategicDefenseAt(state, c.gateFaction || c.faction, c.x, c.y);
    });
    side.edge = force > 0 ? edge / force : 1;
    side.gateEdge = force > 0 ? gate / force : 1;
    side.force = force;
    const currentCount = army.troopCount(side.troops);
    side.tierFactor = currentCount > 0 ? tierForce(side.troops) / currentCount : 1;
    side.combatEdge = side.edge * side.tierFactor;
    side.defenseEdge = side.combatEdge * side.gateEdge;
  });
  // 合战进行中也要把本阵伤亡摊回每位领主，地图上的带兵数才会逐阵下降；
  // 结算时再写一次同样的最终值，不会二次扣兵。
  if (options && options.writeBack) {
    bf.participants.forEach(function (p) {
      const unit = unitForParticipant(state, p);
      if (!unit || p.kind === 'player') return;
      const c = ['a', 'b'].reduce(function (found, sk) {
        return found || (bf.battle[sk].contingents || []).filter(function (q) { return q.key === p.key; })[0];
      }, null);
      if (c) unit.troops = contingentTroops(c);
    });
  }
}

function addNearbyToFieldBattle(state, bf, options) {
  if (!bf || !bf.battle || bf.battle.finished) return 0;
  const battle = bf.battle;
  const fa = bf.primaryA.faction;
  const fb = bf.primaryB.faction;
  const candidates = collectNearbyFieldUnits(state, bf.center, bf.radius);
  let added = 0;
  const existing = {};
  bf.participants.forEach(function (p) { existing[p.key] = true; });
  candidates.forEach(function (info) {
    if (!info || existing[info.key]) return;
    if (!bf.playerInvolved && info.isPlayer) return;
    const side = fieldSideFor(state, info, fa, fb);
    if (!side) return;
    if (army.troopCount(info.troops) <= 0) return;
    battle.reinforce(side, info);
    const text = info.name + '率军赶到，加入' + (side === 'a' ? '友军' : '敌军') + '阵线。';
    battle.joinLog.push({ round: battle.round, text: text, side: side });
    bf.joinLog.push({ h: state.clock.day * 24 + state.clock.hour, text: text, side: side });
    markFieldParticipants(state, bf, [info], side);
    existing[info.key] = true;
    added += 1;
    if (nearPlayer(state, info.pos, 12)) logFn(state, text, 'war');
  });
  if (added) syncFieldBattle(state, bf);
  return added;
}

function releaseFieldBattleUnit(unit) {
  if (!unit) return;
  if (unit.fieldBattleId) unit.fieldBattleId = null;
  if (String(unit.engagedWith || '').indexOf('field:') === 0) {
    unit.engagedWith = null;
    unit.engagedSinceH = null;
  }
}

function unitForParticipant(state, p) {
  if (!p) return null;
  if (p.kind === 'player') return state.player;
  if (p.kind === 'lord') return (state.lords || []).filter(function (l) { return l.id === p.id; })[0] || null;
  if (p.kind === 'party') return (state.parties || []).filter(function (q) { return q.id === p.id; })[0] || null;
  return null;
}

/**
 * 结算合战：把每队剩余人数写回；NPC 败方溃逃/被俘，匪团被打散。
 * 玩家主战由 state.resolveBattle 处理玩家本人与主敌，这里只收束盟军和其他参战者。
 */
function settleFieldBattle(state, battlefield, summary, options) {
  const bf = typeof battlefield === 'string' ? fieldBattleById(state, battlefield) : battlefield;
  if (!bf || !bf.battle) return null;
  const opts = options || {};
  syncFieldBattle(state, bf);
  const battle = bf.battle;
  const result = summary && summary.result ? summary.result : battle.result;
  if (!result) return null;
  const playerBattle = !!bf.playerInvolved || !!opts.playerBattle;
  const pending = state.postBattleLord;
  const winnerSide = result === 'win' ? 'a' : result === 'lose' ? 'b' : null;
  const partyDestroyed = [];
  const contingentsByKey = {};
  ['a', 'b'].forEach(function (sk) {
    (battle[sk].contingents || []).forEach(function (c) { contingentsByKey[c.key] = c; });
  });

  bf.participants.forEach(function (p) {
    const unit = unitForParticipant(state, p);
    if (!unit) return;
    const c = contingentsByKey[p.key];
    const isPrimaryB = bf.primaryB.key === p.key;
    const skipPlayer = p.kind === 'player' && playerBattle;
    const skipBeatenLord = playerBattle && result === 'win' && isPrimaryB &&
      pending && pending.lordId === p.id;
    const skipDestroyedParty = playerBattle && result === 'win' && isPrimaryB && p.kind === 'party';
    if (c && !skipPlayer && !skipBeatenLord && !skipDestroyedParty) {
      unit.troops = contingentTroops(c);
    }
    releaseFieldBattleUnit(unit);
    if (p.kind === 'party' && army.troopCount(unit.troops || {}) <= 0) {
      partyDestroyed.push(unit);
    }
  });

  // 风行：玩家借风脱阵，敌军被甩在原地八小时，地图上不许立刻追上来。
  if (battle.galeEscape) {
    const nowH = state.clock.day * 24 + state.clock.hour;
    const playerSide = bf.playerSide || (battle.a.isPlayer ? 'a' : 'b');
    const pinH = battle.galePinHours || 8;
    bf.participants.forEach(function (p) {
      if (p.side === playerSide) return;
      const unit = unitForParticipant(state, p);
      if (!unit) return;
      unit.pauseUntil = Math.max(unit.pauseUntil || 0, nowH + pinH);
      unit.fleeing = false;
      unit.fleeTargetId = null;
      unit.scuffle = Math.max(unit.scuffle || 0, pinH);
    });
  }

  // 玩家不在场：按胜负让败方溃逃或被俘；两败俱伤则各自收兵。
  if (!playerBattle) {
    const loserSide = winnerSide === null ? null : winnerSide === 'a' ? 'b' : 'a';
    const winnerUnit = winnerSide === 'a' ? bf.primaryA : winnerSide === 'b' ? bf.primaryB : null;
    bf.participants.forEach(function (p) {
      if (p.kind === 'player') return;
      const unit = unitForParticipant(state, p);
      if (!unit) return;
      const lost = winnerSide !== null && p.side === loserSide;
      const draw = winnerSide === null;
      if (!lost && !draw) return;
      if (p.kind === 'party') {
        if (draw || army.troopCount(unit.troops || {}) <= 0) {
          unit.dead = true;
          unit.troops = {};
        }
        return;
      }
      if (!unit.alive || unit.prisoner || unit.inCity) return;
      const mayLeave = lordMayLeaveField(state, unit, winnerUnit);
      // 合战把兵打到 0：和野战一样自动打散，三天后回本土城复活；不是俘虏。
      if (army.troopCount(unit.troops || {}) <= 0) {
        markLordScattered(state, unit, winnerUnit ? winnerUnit.name : 'field');
        return;
      }
      // 合战结算也必须服从“守城/结阵/无城可退不逃”的硬顶规则，
      // 不能因为战场打崩了就在城下集体 moveAway。
      if (p.key === bf.primaryB.key || p.key === bf.primaryA.key) {
        if (draw) {
          if (mayLeave) {
            unit.fleeing = true;
            unit.fleeFrom = null;
            moveAway(state, unit);
            unit.scuffle = Math.max(unit.scuffle || 0, 8);
          } else {
            unit.fleeing = false;
            unit.fleeTargetId = null;
          }
        } else if (state.rng.next() < 0.82 && mayLeave) {
          unit.fleeing = true;
          unit.fleeFrom = null;
          moveAway(state, unit);
          unit.scuffle = Math.max(unit.scuffle || 0, 8);
        } else {
          capture(state, unit, p.side === 'b' ? bf.primaryA.faction : bf.primaryB.faction,
            p.side === 'b' ? bf.primaryA.name : bf.primaryB.name);
        }
      } else {
        unit.fleeing = false;
        unit.fleeTargetId = null;
        if (mayLeave) {
          unit.fleeing = true;
          unit.fleeFrom = null;
          if (army.troopCount(unit.troops || {}) > 0) moveAway(state, unit);
          unit.scuffle = Math.max(unit.scuffle || 0, 5);
        }
      }
    });
  }

  // 战场纪录移除；匪团尸体从地图上清掉，交给 state 的重生队列处理
  state.fieldBattles = (state.fieldBattles || []).filter(function (x) { return x.id !== bf.id; });
  if (partyDestroyed.length) {
    partyDestroyed.forEach(function (q) {
      // 玩家亲自参与的合战要按玩家战果处理，不能套用“任务目标五天内免死”的 NPC 保护。
      if (destroyPartyFn) destroyPartyFn(state, q, playerBattle ? 'player' : 'field');
      else q.dead = true;
    });
    state.parties = (state.parties || []).filter(function (q) { return partyDestroyed.indexOf(q) < 0; });
  }
  if (result && (result === 'win' || result === 'lose') && !playerBattle) {
    const winner = winnerSide === 'a' ? bf.primaryA : bf.primaryB;
    const loser = winnerSide === 'a' ? bf.primaryB : bf.primaryA;
    const near = Math.max(Math.abs(state.player.x - bf.center.x), Math.abs(state.player.y - bf.center.y)) <= 14;
    if (near) logFn(state, loser.name + '与' + winner.name + '在战场上分出胜负，败军退出五格战场。', 'war');
  }
  return {
    battlefieldId: bf.id,
    result: result,
    playerBattle: playerBattle,
    deadParties: partyDestroyed.map(function (q) { return q.id; }),
  };
}

function abandonFieldBattle(state, battlefield, reason) {
  const bf = typeof battlefield === 'string' ? fieldBattleById(state, battlefield) : battlefield;
  if (!bf) return false;
  const battle = bf.battle;
  const summary = battle ? battle.summary() : { result: 'retreat' };
  summary.result = summary.result || 'retreat';
  settleFieldBattle(state, bf, summary, { playerBattle: bf.playerInvolved, keepPlayer: true });
  return true;
}

/** NPC 战场：每 3 时辰推进一阵；其他队伍在战中进入五格就加入 */
/**
 * NPC 合战：每 3 时辰推进一轮，和玩家战斗里每 0.6 秒推进一轮的节奏接近。
 * 这样五格内援军有时间加入，各领主也按现有人数逐步、均衡分摊伤亡，
 * 一直打到一方归零才结算；不再一口气跑完 24 轮，也不再按 72 时辰平局收场。
 */
function tickFieldBattles(state) {
  if (!state.fieldBattles || !state.fieldBattles.length) return 0;
  const nowH = state.clock.day * 24 + state.clock.hour;
  let processed = 0;
  state.fieldBattles.slice().forEach(function (bf) {
    if (!bf || !bf.battle || bf.playerInvolved) return;
    // 开战这一拍先只有最初两方入阵；下一轮（3 时辰后）起，五格内
    // 已经站着的队伍再按阵营动态加入，保证“不预先聚合”。
    if (nowH > bf.startedH) addNearbyToFieldBattle(state, bf, { npc: true });
    const battle = bf.battle;
    if (battle.batchDone && !battle.finished) battle.nextBatch();
    if (!battle.finished) battle.step();
    syncFieldBattle(state, bf, { writeBack: true });
    if (battle.finished) {
      settleFieldBattle(state, bf, battle.summary(), {});
      processed += 1;
    }
  });
  return processed;
}

/**
 * 领主对领主：兵力差到 1.65 倍且差 10 人以上时，弱者不硬碰，
 * 直接后撤两格并进入逃遁，避免小部队被大军一口吃掉。
 */
function fleeDisparity(state, a, b) {
  if (!a || !b || a.faction === 'bandit' || b.faction === 'bandit') return false;
  if (a.faction === b.faction || !atWar(state, a.faction, b.faction)) return false;
  const ca = army.troopCount(a.troops || {});
  const cb = army.troopCount(b.troops || {});
  const hi = Math.max(ca, cb);
  const lo = Math.min(ca, cb);
  if (lo <= 0 || hi < lo * DUEL_FLEE_RATIO || hi - lo < DUEL_FLEE_GAP) return false;
  const strong = ca >= cb ? a : b;
  const weak = ca >= cb ? b : a;
  // 守城、结阵、无城可退时不许后撤，直接进入下面的正面交战。
  if (fleeGuard && !fleeGuard(state, weak, strong)) return false;
  clearEngagement(a, b);
  weak.fleeing = true;
  weak.fleeFrom = strong.id || strong.name;
  weak.fleeTargetId = null;
  weak.fleePath = null;
  weak.fleePathFor = null;
  weak.scuffle = Math.max(weak.scuffle || 0, 10);
  weak.chasing = false;
  weak.hunting = false;
  moveAway(state, weak);
  if (nearPlayer(state, weak, 10)) {
    logFn(state, weak.name + '看见' + strong.name + '的旗，兵差得太远，先带着人往后撤。', 'war');
  }
  return true;
}

/** 每 NPC 步：所有毗邻的敌对领主互殴；已经缠上的就继续打，不重新找目标 */
function fieldTick(state) {
  if (!state.factionWars) init(state);
  if (!state.fieldBattles) state.fieldBattles = [];
  // 先推进上一拍就已经存在的战场：让五格内的援军有机会在这一拍加入；
  // 这一拍新开的战场则留到下一拍再打，避免“刚进战场就打完”。
  const processed = tickFieldBattles(state);
  const list = state.lords.filter(function (l) {
    return l.alive && !l.inCity && !l.prisoner && !l.fieldBattleId && !l.scattered;
  });
  const seen = {};
  let created = 0;
  const nowH = state.clock.day * 24 + state.clock.hour;
  for (let i = 0; i < list.length && created < 4; i++) {
    const a = list[i];
    if (!a.alive || a.fieldBattleId) continue;
    if (a.engagedWith && String(a.engagedWith).indexOf('party:') === 0) continue;
    let b = null;
    if (a.engagedWith) {
      b = list.filter(function (l) { return l.id === a.engagedWith; })[0];
      if (!b || !b.alive || Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1 ||
          a.faction === b.faction || !atWar(state, a.faction, b.faction) ||
          (a.engagedSinceH && nowH - a.engagedSinceH > 72)) {
        clearEngagement(a, b);
        continue;
      }
    } else {
      if (a.scuffle && a.scuffle > 0) { a.scuffle -= 1; continue; }
      for (let j = i + 1; j < list.length; j++) {
        const cand = list[j];
        if (!cand.alive || !cand.troops || cand.engagedWith || cand.fieldBattleId) continue;
        if (cand.scuffle && cand.scuffle > 0) continue;
        if (Math.abs(a.x - cand.x) > 1 || Math.abs(a.y - cand.y) > 1) continue;
        if (a.faction === cand.faction) continue;
        if (a.faction === 'bandit' || cand.faction === 'bandit') continue;
        if (!atWar(state, a.faction, cand.faction)) continue;
        b = cand;
        break;
      }
      if (!b) continue;
    }
    if (!b || b.fieldBattleId) continue;
    const pairKey = [a.id, b.id].sort().join('|');
    if (seen[pairKey]) continue;
    seen[pairKey] = true;
    if (fleeDisparity(state, a, b)) continue;
    const bf = createFieldBattle(state,
      { kind: 'lord', id: a.id }, { kind: 'lord', id: b.id }, {
        preAggregate: false,
        context: { kind: 'field', cause: 'npc' },
      });
    if (bf) created += 1;
  }
  return created + processed;
}

/* ------------------------------------------------------------ 俘虏 */

function listPrisoners(state) {
  return (state.prisoners || []).filter(function (p) { return p; });
}

function findByLord(state, lordId) {
  return (state.prisoners || []).filter(function (p) { return p.lordId === lordId; })[0];
}

/** 每日：关得越久，越容易自己跑掉 */
function prisonerTick(state) {
  if (!state.prisoners) state.prisoners = [];
  const rng = state.rng;
  state.prisoners.forEach(function (p) {
    if (p.escaped) return;
    p.days = (p.days || 0) + 1;
    const lord = state.lords.filter(function (l) { return l.id === p.lordId; })[0];
    if (!lord) return;
    if (lord.prisoner) lord.prisoner.days = p.days;
    const chance = Math.min(ESCAPE_CAP, ESCAPE_BASE + ESCAPE_STEP * p.days);
    if (rng.next() < chance) {
      p.escaped = true;
      freeLord(state, lord, lord.name + '在牢里关到第 ' + p.days + ' 天，趁换岗摸出城，回营聚残部去了。');
    }
  });
  state.prisoners = state.prisoners.filter(function (p) { return !p.escaped; });
}

/** 城破时：牢门大开，被这家关着的人都跑出来 */
function onSiteTaken(state, site, oldFaction) {
  if (!state.prisoners || !state.prisoners.length) return 0;
  const freed = state.prisoners.filter(function (p) {
    if (p.by === 'player') return false;
    if (p.siteId && p.siteId === site.id) return true;
    return oldFaction && p.by === oldFaction;
  });
  freed.forEach(function (p) {
    const lord = state.lords.filter(function (l) { return l.id === p.lordId; })[0];
    if (lord) {
      freeLord(state, lord, null);
      p.escaped = true;
    }
  });
  state.prisoners = state.prisoners.filter(function (p) { return !p.escaped; });
  if (freed.length) {
    const names = freed.map(function (p) {
      const l = state.lords.filter(function (x) { return x.id === p.lordId; })[0];
      return l ? l.name : '';
    }).filter(Boolean).slice(0, 3).join('、');
    logFn(state, site.name + '城破，牢门大开。' + names + (freed.length > 3 ? '等人' : '') + '趁乱脱身，各回各家。', 'war');
  }
  return freed.length;
}

/**
 * 玩家在野战里打赢一位领主。
 * 这里不掷“杀/俘/逃”的骰子：人已经被按在阵前，等玩家在战果页选放走还是押进牢里。
 * 真正的斩将只在牢房页发生。
 */
function playerDefeatsLord(state, lord) {
  const home = state.world.sites.filter(function (s) { return s.id === lord.home; })[0];
  lord.alive = false;
  lord.chasing = false;
  lord.order = null;
  lord.defending = null;
  lord.troops = {};
  lord.prisoner = null;
  lord.inCity = null;
  lord.respawnDay = 0;
  lord.scattered = false;
  lord.scatterUntilH = 0;
  lord.scatterHomeId = null;
  if (home) {
    lord.x = home.x;
    lord.y = home.y;
  }
  state.postBattleLord = {
    lordId: lord.id,
    name: lord.name,
    faction: lord.faction,
    title: lord.title || '领主',
    arcEnemy: !!lord.arcEnemy,
    arcNoCapture: !!lord.arcNoCapture,
  };
  return { pending: true, lordId: lord.id };
}

/** 阵前杀将：这个势力从此跟你没得谈 */
function killLord(state, lord) {
  const fac = lord.faction;
  lord.alive = false;
  lord.chasing = false;
  lord.order = null;
  lord.defending = null;
  lord.dead = true;
  lord.retired = false;
  lord.troops = {};
  lord.prisoner = null;
  lord.inCity = null;
  lord.respawnDay = 0;
  lord.scattered = false;
  lord.scatterUntilH = 0;
  lord.scatterHomeId = null;
  state.noPeace = state.noPeace || {};
  state.killRecords = state.killRecords || {};
  if (fac && FACTIONS[fac]) {
    state.noPeace[fac] = true;
    state.killRecords[fac] = state.clock.day;
    state.relations[fac] = -100;
    if (FACTIONS[fac].lord === lord.name) {
      state.noPeaceForever = state.noPeaceForever || {};
      state.noPeaceForever[fac] = true;
    }
    // 杀的是对方的人，不管两国是否接壤，这笔仗都必须立刻成立。
    state.wars = state.wars || {};
    state.wars[fac] = true;
    state.playerWarSince = state.playerWarSince || {};
    state.playerWarSince[fac] = state.playerWarSince[fac] || state.clock.day;
    declare(state, 'player', fac, true, true);
    // 他的旧部也要记这一笔
    state.lords.forEach(function (l) {
      if (l === lord || !l.alive || l.faction !== fac) return;
      l.fury = (l.fury || 0) + 1;
    });
  }
  if (state.prisoners) {
    state.prisoners = state.prisoners.filter(function (p) { return p.lordId !== lord.id; });
  }
  logFn(state, lord.name + '被你在阵前斩了。消息传出去，' +
    (FACTIONS[fac] ? FACTIONS[fac].full : '那家') + '的人把刀都磨了一遍——这笔账，没人会替你翻过去。', 'war');
  return { killed: true, name: lord.name, faction: fac };
}

/** 玩家眼下靠什么立身：有主 / 自立 / 连旗都没有 */
function playerStanding(state) {
  const p = state.player;
  const owned = state.world.sites.filter(function (s) { return s.playerOwned; }).length;
  if (p.faction && p.faction !== 'player' && FACTIONS[p.faction]) {
    return { mode: 'vassal', faction: p.faction, owned: owned };
  }
  if (owned > 0) return { mode: 'self', faction: 'player', owned: owned };
  return { mode: 'none', faction: null, owned: 0 };
}

/**
 * 招降一位领主的成功率。UI 和真正掷骰都走这一处，避免两套算法。
 * 无旗：直接 0；自立：城越多越像样；有主：看名声与旧主关系。
 */
function recruitChance(state, lord) {
  if (!lord) return { chance: 0, mode: 'none', reason: '查无此人' };
  if (lord.arcNoRecruit) {
    return { chance: 0, mode: 'arc', reason: '天下皆反时，除了从你队伍里出去的旧部，没有人会再听你的话。' };
  }
  const from = lord.faction;
  const isRuler = !!(FACTIONS[from] && FACTIONS[from].lord === lord.name);
  const factionDead = !!(state.factionState && state.factionState[from] && state.factionState[from].dead);
  // 国还没亡时君主不降；国亡了，他也只是一个没了旗的人，可以谈
  if (isRuler && !factionDead) {
    return { chance: 0, mode: 'ruler', reason: lord.name + '是一方之主，只要他的国还在，就不会替别人扛旗。' };
  }
  const standing = playerStanding(state);
  if (standing.mode === 'none') {
    return {
      chance: 0, mode: 'none', owned: 0,
      reason: '你连一面旗都没有，他凭什么把身家押在你身上？',
    };
  }
  const p = state.player;
  const rel = (state.relations[from] || 0) / 100;
  let chance;
  if (standing.mode === 'self') {
    // 自立：刚占一座城，人家基本不认；连下几城，才有郡国之主的模样
    chance = 0.08 + Math.min(0.55, standing.owned * 0.075) + Math.min(0.12, (p.renown || 0) / 5000);
    chance += rel * 0.10;
    if (state.noPeace && state.noPeace[from]) chance -= 0.15;
    if (isRuler) chance = Math.max(0.12, chance * 0.7);
    chance = Math.max(0.04, Math.min(0.76, chance));
  } else {
    // 有主：替主上收人，名声 + 两家关系
    chance = 0.2 + Math.min(0.35, (p.renown || 0) / 1600);
    chance += rel * 0.25;
    if (state.noPeace && state.noPeace[from]) chance -= 0.25;
    if (isRuler) chance = Math.max(0.12, chance * 0.7);
    chance = Math.max(0.08, Math.min(0.8, chance));
  }
  return {
    chance: chance,
    mode: standing.mode,
    owned: standing.owned,
    target: standing.faction,
    isRuler: isRuler,
    reason: isRuler ? '他曾经是一方之主，如今国没了。想让他低头，得拿出足够分量的旗。' : '',
  };
}

function percent(chance) {
  return Math.round(chance * 100) + '%';
}

/** 招降：有主就替主上收人，自立就收成自己的领主 */
function recruitLord(state, lordId) {
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '没这个人' };
  if (lord.dead) return { ok: false, msg: '人已经死了' };
  const p = state.player;
  const isPrisoner = !!(lord.prisoner && lord.prisoner.by === 'player') ||
    (state.prisoners || []).some(function (x) { return x.lordId === lordId && x.by === 'player'; });
  if (!isPrisoner && lord.alive && lord.faction === (p.faction || 'player')) {
    return { ok: false, msg: '他已经在你的旗下了' };
  }
  const from = lord.faction;
  const offer = recruitChance(state, lord);
  if (offer.mode === 'ruler') return { ok: false, msg: offer.reason };
  if (offer.mode === 'none') return { ok: false, msg: offer.reason };
  // 招降不是连点抽奖：第一次开口后，要等三天才能再谈
  const cool = lord.recruitCoolDay || 0;
  if (state.clock.day < cool) {
    return {
      ok: false,
      cooldown: true,
      waitDays: cool - state.clock.day,
      msg: lord.name + '把脸转开：“话你已经说过了。让我静几天。”',
    };
  }
  // 不论成不成，这次开口都进入冷却
  lord.recruitCoolDay = state.clock.day + 3;
  if (state.rng.next() > offer.chance) {
    if (offer.mode === 'self') {
      return {
        ok: false,
        msg: lord.name + '扫了一眼你的营盘：“' + offer.owned + '座城就想让我改换门庭？等你的旗能遮住半个州再说。”',
        chance: offer.chance,
      };
    }
    return {
      ok: false,
      msg: lord.name + '把脸转开：“我吃的是' + (FACTIONS[from] ? FACTIONS[from].full : '旧主') + '的粮。”',
      chance: offer.chance,
    };
  }

  // 有主：替自己的君主收人；自立：收成自己的领主
  const target = offer.target || (p.faction && FACTIONS[p.faction] ? p.faction : 'player');
  if (state.prisoners) {
    state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  }
  lord.prisoner = null;
  lord.dead = false;
  lord.alive = true;
  lord.faction = target;
  lord.chasing = false;
  lord.resting = false;
  lord.order = null;
  lord.ransom = 0;
  const home = state.world.sites.filter(function (s) {
    return target === 'player' ? s.playerOwned : (s.ownerFaction === target && s.type !== 'camp' && s.type !== 'village');
  })[0] || state.world.sites.filter(function (s) { return s.playerOwned; })[0];
  if (home) {
    lord.home = home.id;
    placeLordAtSiteAnimated(state, lord, home);
  }
  lord.troops = takeSome(lord.defTroops, Math.max(6, Math.round(army.troopCount(lord.defTroops) * 0.5)));
  p.renown += 25;
  if (target === 'player') {
    declare(state, 'player', from, true);
  }
  logFn(state, lord.name + '拜了下去：“' + (target === 'player' ? '愿跟着你' : '愿为' + FACTIONS[target].full + '效命') + '。”', 'recruit');
  return {
    ok: true,
    msg: lord.name + '归降了（声望 +25）',
    lordId: lord.id,
    faction: target,
  };
}

/** 收赎金放人 */
function ransom(state, lordId, amount) {
  const p = (state.prisoners || []).filter(function (x) { return x.lordId === lordId; })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  const gold = amount || p.ransom || 120;
  state.player.gold += gold;
  p.escaped = true;
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  freeLord(state, lord, null);
  logFn(state, lord.name + '的家人凑了 ' + gold + ' 金钱把人赎走。你数钱的时候，他没有回头。', 'war');
  return { ok: true, msg: '收到赎金 ' + gold + ' 金钱，放走了' + lord.name, gold: gold };
}

/** 白放人：换人情 */
function release(state, lordId) {
  const p = (state.prisoners || []).filter(function (x) { return x.lordId === lordId; })[0];
  if (!p) return { ok: false, msg: '牢里没有这个人' };
  const lord = state.lords.filter(function (l) { return l.id === lordId; })[0];
  if (!lord) return { ok: false, msg: '查无此人' };
  p.escaped = true;
  state.prisoners = state.prisoners.filter(function (x) { return x.lordId !== lordId; });
  freeLord(state, lord, null);
  state.player.renown += 12;
  if (lord.faction && FACTIONS[lord.faction]) {
    state.relations[lord.faction] = Math.min(100, (state.relations[lord.faction] || 0) + 14);
  }
  logFn(state, '你把' + lord.name + '放回马下，还给了他一把刀。他抱拳说了句"来日必报"，打马走了。', 'war');
  return { ok: true, msg: '放了' + lord.name + '，声望 +12，' + (FACTIONS[lord.faction] ? FACTIONS[lord.faction].name : '') + '对你和气了些' };
}

/* ------------------------------------------------------------ 领主国战 AI */

const RALLY_DAYS_MIN = 2;
const RALLY_DAYS_MAX = 6;
const SIEGE_MIN_DAYS = 3;
const SIEGE_EXTRA_DAYS = 4;
const SIEGE_COOLDOWN = 7;    // 攻下一城后，这一对国家短暂整补，随后继续推进
const HOLD_DAYS = 3;         // 攻下后只留新封领主短暂守城，其余转巡逻
const FAIL_COOLDOWN = 10;    // 没打下来，这一对重整旗鼓再上

// 各国以统一为目标：不再把主线都城/玩家起家城列为“AI 不能碰”的保护点。

function siteById(state, id) {
  return state.world.sites.filter(function (s) { return s.id === id; })[0] || null;
}

function initAI(state) {
  if (!state.warCampaigns || typeof state.warCampaigns !== 'object') state.warCampaigns = {};
  if (!state.siegeCooldown || typeof state.siegeCooldown !== 'object') state.siegeCooldown = {};
}

function ownedSites(state, faction, townsOnly) {
  return state.world.sites.filter(function (s) {
    return s.ownerFaction === faction && !s.playerOwned && s.type !== 'camp' &&
      (!townsOnly || s.type === 'town' || s.type === 'castle');
  });
}

function factionLords(state, faction) {
  return state.lords.filter(function (l) {
    return l.alive && !l.dead && !l.prisoner && !l.hidden && !l.scatterHidden &&
      l.faction === faction;
  });
}

function siteDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function nearestSiteOf(state, list, site) {
  let best = null;
  let bestD = Infinity;
  list.forEach(function (s) {
    const d = siteDistance(s, site);
    if (d < bestD) { bestD = d; best = s; }
  });
  return { site: best, distance: bestD };
}

function clearOrder(lord) {
  if (!lord) return;
  lord.order = null;
  lord.defending = null;
}

function giveOrder(lord, type, siteId, hold) {
  lord.order = { type: type, siteId: siteId, hold: !!hold, since: (lord.order && lord.order.since) || 0 };
  lord.chasing = false;
  lord.hunting = false;
  lord.fleeing = false;
  lord.fleeTargetId = null;
  lord.fleePath = null;
  lord.foeChasing = null;
  lord.banditChasing = null;
}

function pairBlocked(state, a, b, day) {
  return (state.siegeCooldown[key(a, b)] || 0) > day;
}

/**
 * 刘备入川的用兵主轴：剑阁 → 巴西 → 成都。
 * 成都是“重心城市”，不先绕去汉中、江州；巴西只是成都城下的踏板。
 * 只有当前一站还挂在刘璋旗下、且道路能接上时才返回它，否则交回普通选城。
 */
function liubeiYiFocusSite(state, own) {
  if (!state || !state.flags || !state.flags.liubeiYiWar) return null;
  if (!state.factionState || (state.factionState.shu || {}).dead) return null;
  if (!atWar(state, 'shu', 'zhang')) return null;
  const chain = ['jiange', 'baxi', 'chengdu'];
  for (let i = 0; i < chain.length; i += 1) {
    const site = siteById(state, chain[i]);
    if (!site || site.playerOwned || site.ownerFaction !== 'zhang') continue;
    if (!canSiegeSiteFromFaction(state, 'shu', site).ok) continue;
    return site;
  }
  return null;
}

/**
 * 刘备入川：天下开始后第 8 天，若双方都没灭国，强制补上“璋|蜀”这条战事。
 * 旧档已经有这场的只打标记；被随机议和过也不会每天重宣。
 */
function ensureLiuBeiYiWar(state, day) {
  if (!state || !state.diplomacyStarted || !state.flags) return false;
  if (state.flags.liubeiYiWar) return false;
  if (day < LIUBEI_YI_WAR_DAY) return false;
  const fstate = state.factionState || {};
  if ((fstate.shu || {}).dead || (fstate.zhang || {}).dead) return false;
  if (atWar(state, 'shu', 'zhang')) {
    state.flags.liubeiYiWar = true;
    // 如果开战是此前冲突自动触发的，旧战役里可能没有刘备本人。
    // 入川旗号一立，就重排一次蜀国战役，保证主公亲自挂帅。
    const cp = state.warCampaigns && state.warCampaigns.shu;
    if (cp && (cp.attackerIds || []).indexOf('liubei') < 0) {
      (cp.attackerIds || []).forEach(function (id) {
        const lord = (state.lords || []).filter(function (l) { return l.id === id; })[0];
        if (lord) clearOrder(lord);
      });
      delete state.warCampaigns.shu;
      planCampaign(state, 'shu', day);
    }
    return false;
  }
  if (!canOpenWar(state, 'shu', 'zhang')) return false;
  if (!declare(state, 'shu', 'zhang', false)) return false;
  state.flags.liubeiYiWar = true;
  // 刘璋“开关迎客”后就该守剑阁，不该同时从上庸/江州方向反攻。
  // 这里撤掉璋方在宣战前的旧战役，避免新路一开就把蜀军后路咬住。
  const oldZhangCp = state.warCampaigns && state.warCampaigns.zhang;
  if (oldZhangCp) {
    (oldZhangCp.attackerIds || []).forEach(function (id) {
      const lord = (state.lords || []).filter(function (l) { return l.id === id; })[0];
      if (lord) clearOrder(lord);
    });
    delete state.warCampaigns.zhang;
  }
  // 入川旗号一立，刘备就不再沿旧路线去啃淮南/荆州：撤掉此前非张鲁方向的战役，
  // 让下一拍战略重新把兵锋指向剑阁。否则会保留旧目标，入川名号成了空话。
  const oldShuCp = state.warCampaigns && state.warCampaigns.shu;
  if (oldShuCp && oldShuCp.enemy !== 'zhang') {
    (oldShuCp.attackerIds || []).forEach(function (id) {
      const lord = (state.lords || []).filter(function (l) { return l.id === id; })[0];
      if (lord) clearOrder(lord);
    });
    delete state.warCampaigns.shu;
  }
  logFn(state, '刘备以“助刘璋拒张鲁”为名自新野入川，刘璋开关迎客；蜀军沿江而上，兵锋指向剑阁、江州。', 'war');
  return true;
}

/**
 * 韩遂灭凉的用兵主轴：金城出兵 → 武威 → 居延 → 陇西村。
 * 龙城与居延的城道已经断开，居延只能从武威方向进；这条链保证韩遂不会
 * 因为居延变成飞地就卡在半路。
 */
function hansuiMieMaFocusSite(state, own) {
  if (!state || !state.flags || !state.flags.hanSuiMieMa) return null;
  if (!state.factionState || (state.factionState.hansui || {}).dead) return null;
  if ((state.factionState.ma || {}).dead) return null;
  if (!atWar(state, 'hansui', 'ma')) return null;
  const chain = ['wuwei', 'juyan', 'longxi'];
  for (let i = 0; i < chain.length; i += 1) {
    const site = siteById(state, chain[i]);
    if (!site || site.playerOwned || site.ownerFaction !== 'ma') continue;
    if (!canSiegeSiteFromFaction(state, 'hansui', site).ok) continue;
    return site;
  }
  return null;
}

/**
 * 韩遂灭凉前的一次总动员：马超带走本部后，韩遂把金城、西平、天水的部曲
 * 重新点齐，并把武威、居延两城的守备按“马家军心已散”削掉一截。
 * 这是剧情战，不让它因为前面和汉廷的零星消耗打成一百天。
 */
function mobilizeHanSuiMieMa(state) {
  if (!state || !state.flags) return;
  if (state.flags.hanSuiMieMaMobilized) return;
  factionLords(state, 'hansui').forEach(function (l) {
    if (!l || !l.alive || l.dead || l.prisoner) return;
    const base = l.defTroops || {};
    const cur = l.troops || {};
    const full = {};
    Object.keys(base).forEach(function (id) {
      full[id] = Math.max(base[id] || 0, cur[id] || 0);
    });
    // 剧情总动员：金城、西平、天水的部曲全部点齐，再按一点五倍备足攻城粮道。
    Object.keys(full).forEach(function (id) {
      full[id] = Math.round(full[id] * 1.5);
    });
    l.troops = full;
    l.morale = Math.max(l.morale || 0, 88);
    l.pauseUntil = 0;
    l.chasing = false;
    l.hunting = false;
    l.fleeing = false;
    l.fleeTargetId = null;
  });
  ['wuwei', 'juyan'].forEach(function (id) {
    const s = siteById(state, id);
    if (!s || s.ownerFaction !== 'ma') return;
    s.garrison = Math.max(58, Math.round((s.garrison || s.garrisonBase || 60) * 0.68));
    s.garrisonBase = s.garrison;
  });
  // 马超一走，马家诸将各自守城，不再分兵反攻韩遂；这二十天只挨打不主动出击。
  const nowH = state.clock.day * 24 + state.clock.hour;
  factionLords(state, 'ma').forEach(function (l) {
    if (!l || !l.alive || l.dead || l.prisoner) return;
    l.pauseUntil = Math.max(l.pauseUntil || 0, nowH + 20 * 24);
    l.chasing = false;
    l.hunting = false;
    l.order = null;
    l.defending = null;
  });
  if (state.warCampaigns && state.warCampaigns.ma) abortCampaign(state, 'ma');
  state.flags.maPassiveDuringMie = true;
  state.flags.hanSuiMieMaMobilized = true;
}

/**
 * 韩遂灭凉：天下开始后第 12 天，若韩遂与马腾都还在，必然由韩遂点兵吞凉。
 * 这条线只做一件事——把“谁去灭马家”钉死，不再让随机国战分兵。
 */
function ensureHanSuiMieMaWar(state, day) {
  if (!state || !state.diplomacyStarted || !state.flags) return false;
  if (state.flags.hanSuiMieMaDone) return false;
  if (day < HANSUI_MIE_MA_DAY) return false;
  const fstate = state.factionState || {};
  if ((fstate.hansui || {}).dead || (fstate.ma || {}).dead) {
    state.flags.hanSuiMieMaDone = true;
    return false;
  }
  if (state.flags.hanSuiMieMa) return false;
  if (atWar(state, 'hansui', 'ma')) {
    state.flags.hanSuiMieMa = true;
  } else if (canOpenWar(state, 'hansui', 'ma') && declare(state, 'hansui', 'ma', false)) {
    state.flags.hanSuiMieMa = true;
  } else {
    return false;
  }
  // 旧的韩遂战役（可能指向汉廷/西平）先撤掉，下一拍战略会改走灭凉主轴。
  const old = state.warCampaigns && state.warCampaigns.hansui;
  if (old) abortCampaign(state, 'hansui');
  mobilizeHanSuiMieMa(state);
  const mc = state.lords.find(function (l) { return l.id === 'machao'; });
  const chaoGone = !mc || mc.dead || mc.faction !== 'ma';
  logFn(state, '韩遂在金城点兵，借口“马腾老病、凉州无主”，要把武威、居延一并吞下。' +
    (chaoGone ? '马超已经投了蜀，西凉再无铁骑回援。' : '马超若还在西凉，这一仗就是他和马家的最后一战。'), 'war');
  return true;
}

/** 一个国家一次只打一处：挑最近的敌城，在自己最靠前的城里集结 */
function planCampaign(state, faction, day) {
  const story = state.story;
  const passive = !!(story && story.mode && story.passive && story.passive[faction]);
  // 牵制战配置：南蛮只野战不围城；南越只取长沙以南。
  const proxy = story && story.mode && story.proxyWars ? story.proxyWars[faction] : null;
  // 官渡合战进行时，曹袁两军都被这场战役占住，不再另开围城战役。
  const guanduField = (state.fieldBattles || []).some(function (bf) {
    return bf && bf.context && bf.context.cause === 'guandu' && bf.battle && !bf.battle.finished;
  });
  if (guanduField && (faction === 'wei' || faction === 'yuan')) return null;
  // 马超走后，马家在二十天内只守不攻；韩遂灭凉这段不再被马家反包围打断。
  if (faction === 'ma' && state.flags && state.flags.maPassiveDuringMie) return null;
  // 剧情阶段先赶战略：已进入交战阶段的国家多带一路、少在集结城磨蹭，
  // 让魏蜀吴的第一阶段能尽快打出结果，方便观察天下演绎。
  const phaseWar = !!(story && story.mode && story.phases && story.phases[faction] &&
    story.phases[faction].status === 'war');
  let foes = warPartners(state, faction).filter(function (id) {
    return FACTIONS[id] && id !== 'player' && id !== 'bandit' && !(state.factionState[id] || {}).dead;
  });
  // 剧情阶段只打该打的敌人；休整阶段 targets 为空，就一门不出。
  if (!passive && story && story.targets && story.targets[faction]) {
    const allowed = story.targets[faction];
    if (!allowed.length) return null;
    foes = foes.filter(function (id) { return allowed.indexOf(id) >= 0; });
  }
  // 袁术称帝后的联合剿灭：魏吴优先打寿春，不许分兵去别处。
  if (story && story.priority && story.priority[faction] &&
      foes.indexOf(story.priority[faction]) >= 0) {
    foes = [story.priority[faction]];
  }
  // 牵制战先咬指定的那一家：南蛮先打刘璋，南越先打刘表，别被旁边的世仇吸走。
  if (proxy && proxy.target && foes.indexOf(proxy.target) >= 0) {
    foes = [proxy.target];
  }
  // 统一战争不再要求“至少两座城”：哪怕只剩一座城、一路兵，也要继续往外打。
  const own = ownedSites(state, faction, true);
  if (!own.length) return null;
  // 刘备入川期间，刘璋先守剑阁；等剑阁换旗后再恢复正常的扩张战役。
  if (faction === 'zhang' && state.flags && state.flags.liubeiYiWar) {
    const jiange = siteById(state, 'jiange');
    if (jiange && jiange.ownerFaction === 'zhang') return null;
  }
  // 刘备入川后优先打益州，不把兵力浪费在北边的鲜卑或中原乱战上。
  if (faction === 'shu' && state.flags && state.flags.liubeiYiWar &&
      foes.indexOf('zhang') >= 0) {
    foes = ['zhang'];
  }
  // 韩遂灭凉：这路兵只认马家，不跟汉廷、西平方向分兵。
  if (faction === 'hansui' && state.flags && state.flags.hanSuiMieMa) {
    foes = foes.filter(function (id) { return id === 'ma'; });
  }

  const lords = factionLords(state, faction).filter(function (l) {
    return army.troopCount(l.troops || {}) >= 1 && !l.defending;
  });
  if (!lords.length) return null;

  let target = null;
  // 入川主轴：剑阁首攻之后不绕汉中、江州，沿剑阁—巴西—成都一路压到成都城下。
  if (faction === 'shu' && foes.indexOf('zhang') >= 0 &&
      !pairBlocked(state, 'shu', 'zhang', day)) {
    const focus = liubeiYiFocusSite(state, own);
    if (focus) {
      const near = nearestSiteOf(state, own, focus);
      target = { site: focus, score: -1, distance: near.distance };
    }
  }
  // 灭凉主轴：武威 → 居延 → 陇西村，按城道顺序推，不抢旁边的汉廷城。
  if (faction === 'hansui' && foes.indexOf('ma') >= 0 &&
      !pairBlocked(state, 'hansui', 'ma', day)) {
    const focus = hansuiMieMaFocusSite(state, own);
    if (focus) {
      const near = nearestSiteOf(state, own, focus);
      target = { site: focus, score: -1, distance: near.distance };
    }
  }
  if (!target) foes.forEach(function (enemy) {
    if (pairBlocked(state, faction, enemy, day)) return;
    // 村庄也能被攻占：不再只列敌国的城/关，村口同样是可打的目标。
    // 计分给村庄加一笔“优先打城”的惩罚，避免 AI 有城不打、专挑空地村庄。
    const enemyTargets = ownedSites(state, enemy, false);
    const edgeTown = state.world && state.world.edgeTown;
    enemyTargets.forEach(function (s) {
      // 任何有主目标都能打：不再给主线都城、玩家起家城套“不能换旗”的罩子。
      if (!s.ownerFaction) return;
      // NPC 不能进入边陲小镇十格，更不能把它当围城目标。
      if (edgeTown && Math.max(Math.abs(s.x - edgeTown.x), Math.abs(s.y - edgeTown.y)) <= (edgeTown.radius || 10)) return;
      // 复国阶段：叛军只追人，不主动攻主角已经打下的城。
      if (faction === 'rebel' && state.arc && state.arc.phase === 'reconquest' && s.playerOwned) return;
      // 南越只取长沙以南，不碰襄阳、江陵、夏口；其他敌人仍按正常规则。
      if (proxy && proxy.target === enemy && proxy.siegeSites &&
          proxy.siegeSites.indexOf(s.id) < 0) return;
      // 只打与本势力城网道路直接相连的敌城；第一座城由 canSiegeSiteFromFaction 放行。
      if (!canSiegeSiteFromFaction(state, faction, s).ok) return;
      // 边缘小国与袁术只骚扰与本土直接相邻的城，不向远处延伸。
      if (passive && story) {
        const retake = story.retake && story.retake[faction] ? story.retake[faction] : [];
        const origins = (story.originCities && story.originCities[faction]) || [];
        const anchors = origins.filter(function (id) {
          const o = siteById(state, id);
          return o && o.ownerFaction === faction;
        });
        const adjacent = anchors.some(function (id) { return siteRoadAdjacent(id, s.id); });
        const proxyAllowed = proxy && proxy.target === enemy && proxy.siegeSites &&
          proxy.siegeSites.indexOf(s.id) >= 0;
        if (retake.indexOf(s.id) < 0 && !adjacent && !proxyAllowed) return;
      }
      // 荆州会战期间，三国只打荆州境内的城。
      if (story && story.targetRegion && story.targetRegion[faction] &&
          s.region !== story.targetRegion[faction]) return;
      const near = nearestSiteOf(state, own, s);
      const villagePenalty = s.type === 'village' ? 45 : 0;
      let score = near.distance * 0.6 + s.garrison * 0.35 + villagePenalty + state.rng.int(0, 18);
      // 荆州会战：襄阳第一、新野第二、江陵第三；三镇之外先缓一缓。
      if (story && story.jingzhou && story.jingzhou.active && story.jingzhouFocus) {
        const focus = story.jingzhouFocus;
        const rank = focus.indexOf(s.id);
        if (rank >= 0) score -= (focus.length - rank) * 120;
        else score += 90;
      }
      if (!target || score < target.score) target = { site: s, score: score, distance: near.distance };
    });
  });
  // 汉中北面两座自由城：没有敌国战役时，任何能接上城道的势力都可以来争。
  // 刘璋开局先盯刘备与南中，不抢这两座空城；过了开局窗口才按普通势力算。
  // 韩遂在灭凉期间不捡自由城，免得把兵锋从武威、居延挪到汉中北面。
  if (!target && faction === 'hansui' && state.flags && state.flags.hanSuiMieMa) return null;
  if (!target && FREE_CITY_IDS.length) {
    FREE_CITY_IDS.forEach(function (id) {
      // 刘备入川期间刘璋只守剑阁，不去捡汉中北面的空城；否则一旦剑阁换旗，
      // 刘璋主力会被自由城吸走，刘备反而卡在巴西城下。
      if (faction === 'zhang' &&
          (day <= 30 || (state.flags && state.flags.liubeiYiWar))) return;
      const s = siteById(state, id);
      if (!s || s.playerOwned || s.ownerFaction) return;
      if (!canSiegeSiteFromFaction(state, faction, s).ok) return;
      const near = nearestSiteOf(state, own, s);
      const score = near.distance * 0.6 + s.garrison * 0.35 + 18;
      if (!target || score < target.score) target = { site: s, score: score, distance: near.distance };
    });
  }
  if (!target) return null;

  const nearestOwn = nearestSiteOf(state, own, target.site).site;
  // 集结地：既靠前线，也别把所有人从后方抽空
  let rally = nearestOwn;
  own.forEach(function (s) {
    if (s === nearestOwn) return;
    const toTarget = siteDistance(s, target.site);
    if (toTarget < siteDistance(rally, target.site) - 3 && s.garrison >= 55) rally = s;
  });
  // 巴西是村，不在 ownedCities 里。刘备占了巴西后要直下成都，
  // 集结地就放在巴西，别让主力再退回剑阁白走半个月。
  if (faction === 'shu' && state.flags && state.flags.liubeiYiWar &&
      target.site.id === 'chengdu') {
    const baxi = siteById(state, 'baxi');
    if (baxi && baxi.ownerFaction === 'shu' && !baxi.playerOwned &&
        siteRoadAdjacent('baxi', 'chengdu')) {
      rally = baxi;
    }
  }

  let chosen = lords.slice().sort(function (a, b) {
    return siteDistance(a, rally) - siteDistance(b, rally);
  });
  // 第一阶段要尽快打出结果：优先挑满编/接近满编的领主人马，别让 5 个
  // 刚补完一半的残兵去撞敌方都城；有余力时最多压上八路。
  if (phaseWar) {
    const ready = lords.filter(function (l) {
      const full = army.troopCount(l.defTroops || {});
      const now = army.troopCount(l.troops || {});
      return full <= 0 || now >= Math.max(6, Math.ceil(full * 2 / 3));
    });
    if (ready.length) {
      chosen = ready.slice().sort(function (a, b) {
        return siteDistance(a, rally) - siteDistance(b, rally);
      });
    }
  }
  chosen = chosen.slice(0, Math.min(phaseWar ? 8 : 5, chosen.length));
  // 刘备入川：主公必须亲自走这一趟，带的是本势力最硬的四路人马，不是按离城最近的凑数。
  if (faction === 'shu' && state.flags && state.flags.liubeiYiWar) {
    const leader = state.lords.filter(function (l) { return l.id === 'liubei' && l.alive && !l.prisoner; })[0];
    const rest = lords.filter(function (l) { return l.id !== 'liubei'; })
      .slice().sort(function (a, b) {
        return army.troopCount(b.troops || {}) - army.troopCount(a.troops || {});
      }).slice(0, 4);
    if (leader) chosen = [leader].concat(rest);
  }
  // 韩遂灭凉：韩遂本人挂帅，不把这件“灭马家”的事交给别的小领主。
  if (faction === 'hansui' && state.flags && state.flags.hanSuiMieMa) {
    const leader = state.lords.filter(function (l) { return l.id === 'hansui' && l.alive && !l.prisoner; })[0];
    const rest = lords.filter(function (l) { return l.id !== 'hansui'; })
      .slice().sort(function (a, b) {
        return army.troopCount(b.troops || {}) - army.troopCount(a.troops || {});
      }).slice(0, 4);
    if (leader) chosen = [leader].concat(rest);
  }
  if (chosen.length < 1) return null;

  const avgDist = chosen.reduce(function (sum, l) {
    return sum + siteDistance(l, rally);
  }, 0) / chosen.length;
  const rallyDays = Math.max(RALLY_DAYS_MIN, Math.min(phaseWar ? 4 : RALLY_DAYS_MAX,
    RALLY_DAYS_MIN + state.rng.int(0, 2) + Math.round(avgDist / 12)));

  const cp = {
    faction: faction,
    enemy: target.site.ownerFaction,
    targetId: target.site.id,
    rallyId: rally.id,
    stage: 'rally',
    startDay: day,
    rallyUntil: day + rallyDays,
    marchStart: 0,
    siegeStart: 0,
    siegeUntil: 0,
    holdUntil: 0,
    attackerIds: chosen.map(function (l) { return l.id; }),
    defenderIds: [],
    arrivedIds: [],
    harass: !!(proxy && proxy.siege === false),
    done: false,
  };
  // 只有主帅先去集结城会合；其余人马留在各自封地继续巡逻，
  // 等开拔令下来再一起向目标城走，避免整国军队在城边杵成一片。
  // 入川五路先在剑阁（或当前集结城）会合，再一起开拔。新增的姜维、马超
  // 等领主封地可能在上庸、汉中方向，若只让主帅先走，他们会从山道另一侧
  // 直接找巴西而卡在断开的路上。
  const yiGather = !!(faction === 'shu' && state.flags && state.flags.liubeiYiWar);
  chosen.forEach(function (l, i) {
    if (i === 0 || yiGather) {
      giveOrder(l, 'rally', rally.id, true);
      l.order.since = day;
      l.order.campaign = faction;
    } else {
      clearOrder(l);
      l.wander = null;
      l.patrolPath = null;
      l.routePath = null;
      l.routePathFor = null;
    }
  });
  state.warCampaigns[faction] = cp;
  logFn(state,
    '【' + FACTIONS[faction].name + '】点起 ' + chosen.length +
    ' 路人马，主帅先往' + rally.name + '会合，余部在封地巡行，听令即向' +
    target.site.name + '开拔。', 'muster');
  return cp;
}

function attackersOf(state, cp) {
  return cp.attackerIds.map(function (id) {
    return state.lords.filter(function (l) { return l.id === id; })[0];
  }).filter(function (l) {
    if (!l || !l.alive || l.dead || l.prisoner) return false;
    // 不再因为“兵只剩六成五”就把整路人马抽回城：国家要打到统一，
    // 围城军就算残了也得留在城下，伤亡由 Battle 逐回合决定。
    return army.troopCount(l.troops || {}) > 0;
  });
}


/** 剧情换阶段/停战时，把旧战役的攻城令与行军令一起撤掉，免得军队继续往友军城下走。 */
function abortCampaign(state, faction) {
  if (!state || !state.warCampaigns) return false;
  const cp = state.warCampaigns[faction];
  if (!cp) return false;
  attackersOf(state, cp).forEach(clearOrder);
  (cp.defenderIds || []).forEach(function (id) {
    const l = (state.lords || []).filter(function (x) { return x.id === id; })[0];
    if (l) clearOrder(l);
  });
  const target = siteById(state, cp.targetId);
  if (target && target.siegeFaction === faction) {
    target.siegeStatus = null;
    target.siegeFaction = null;
    target.siegeSinceH = null;
  }
  cp.siegeBattle = null;
  cp.done = true;
  cp.stage = 'done';
  delete state.warCampaigns[faction];
  return true;
}

/** 三足鼎立后，AI 不能打下任何一家的最后一座城；玩家仍可亲手完成统一。 */
function keepsMajorLastCity(state, site, attacker) {
  if (!state || !site) return false;
  if (attacker === 'player') return false;
  // 第 10 轮荆州争霸进入 final：不再给三国套“最后一座城不灭”的罩子。
  if (state.story && state.story.endgame && state.story.endgame.final) return false;
  const owner = site.ownerFaction;
  // 马腾、韩遂之间只分高下，不互相灭国：最后一座城沿用既有的“保城”判定。
  const maHanPair = (owner === 'ma' && attacker === 'hansui') ||
    (owner === 'hansui' && attacker === 'ma');
  const majorLast = !!(state.story && state.story.mode &&
    ['wei', 'shu', 'wu'].indexOf(owner) >= 0);
  if (!maHanPair && !majorLast) return false;
  const left = (state.world.sites || []).filter(function (s) {
    return s.type !== 'camp' && s.ownerFaction === owner;
  }).length;
  return left <= 1;
}

/** 给 state 挂一个夺城记录钩子：谁打下最后一座城，谁就是灭国者。 */
function bindCaptureHook(fn) {
  captureHook = fn || null;
}

function notifyCapture(state, site, oldFaction, byFaction) {
  if (captureHook) captureHook(state, site, oldFaction, byFaction);
}

/** 南蛮式牵制：到了城下只掠野、不围城，过几天就退回去。 */
function beginRaid(state, cp, site, day) {
  cp.stage = 'raid';
  cp.raidUntil = day + 8 + state.rng.int(0, 4);
  attackersOf(state, cp).forEach(clearOrder);
  logFn(state, '【' + FACTIONS[cp.faction].name + '】的兵马压到' + site.name + '城下，只掠野不围城，城头守军不敢出。', 'war');
  return true;
}

function startSiege(state, cp, site, day) {
  if (!site || site.ownerFaction !== cp.enemy) { cp.done = true; return false; }
  if (cp.harass) return beginRaid(state, cp, site, day);
  if (!canSiegeSiteFromFaction(state, cp.faction, site).ok) {
    cp.done = true;
    logFn(state, '【' + FACTIONS[cp.faction].name + '】与' + site.name + '之间没有连上的城道，围城军停在半路。', 'siege');
    return false;
  }
  cp.stage = 'siege';
  cp.siegeStart = day;
  // 刘备入川第一仗：刘璋“开关迎客”，五路兵马按剧情一起压到剑阁城下，三日定城。
  // 之后的城仍按正常围城天数走，不能把整张图都变成速攻。
  const historyRush = cp.faction === 'shu' && state.flags && state.flags.liubeiYiWar &&
    (site.id === 'jiange' || site.id === 'baxi');
  // 成都打了七十多天，守军按都城恢复涨到两百多；入川主线到城下时按刘璋军心已散，
  // 把城内守备压到一百以内，让刘备的五路人马能真正打下这座大本营。
  const chengduRush = cp.faction === 'shu' && state.flags && state.flags.liubeiYiWar && site.id === 'chengdu';
  if (chengduRush && site.garrison > 100) {
    site.garrison = 100;
    site.garrisonBase = Math.min(site.garrisonBase || 100, 100);
  }
  const maRush = cp.faction === 'hansui' && state.flags && state.flags.hanSuiMieMa &&
    (site.id === 'wuwei' || site.id === 'juyan' || site.id === 'longxi');
  cp.siegeUntil = maRush ? day + 2 : (historyRush || chengduRush) ? day + 3 : day + Math.max(SIEGE_MIN_DAYS,
    SIEGE_MIN_DAYS + state.rng.int(0, SIEGE_EXTRA_DAYS) +
    (site.garrison > 110 ? 1 : 0));
  const attackers = attackersOf(state, cp);
  // 入川剧情也不再直接把五路人马“放”到剑阁城下：他们按普通行军走到城下，
  // 到了才围城。这样不会在玩家眼前突然瞬移，剧情城仍按三日围城天数走。
  attackers.forEach(function (l) { giveOrder(l, 'siege', site.id, true); });

  // 围城一起，守方的领主就收到烽火：能来的都往这座城赶
  // 但正在执行本国战役（尤其刘备入川）的攻方领主不能被另一场守城令抽走。
  const ownCampaign = state.warCampaigns[site.ownerFaction];
  const busyAttackers = ownCampaign && ownCampaign.attackerIds ? ownCampaign.attackerIds : [];
  const defenders = factionLords(state, site.ownerFaction)
    .filter(function (l) {
      return army.troopCount(l.troops || {}) >= 8 &&
        busyAttackers.indexOf(l.id) < 0 && !l.defending;
    })
    .sort(function (a, b) { return siteDistance(a, site) - siteDistance(b, site); })
    .slice(0, 4);
  cp.defenderIds = defenders.map(function (l) { return l.id; });
  cp.arrivedIds = [];
  defenders.forEach(function (l) {
    giveOrder(l, 'defend', site.id, true);
    l.defending = site.id;
    l.order.campaign = cp.faction;
  });
  const ownerFaction = site.ownerFaction;
  const siegeLine = ownerFaction
    ? '，营寨一圈圈扎到城下。守军闭门，烽火向' + ((FACTIONS[ownerFaction] || {}).name || ownerFaction) + '各地求援。'
    : '，营寨一圈圈扎到城下。这是一座无主城，四周没有援旗。';
  logFn(state,
    '【' + FACTIONS[cp.faction].name + '】的 ' + attackers.length + ' 路领主围住' + site.name + siegeLine,
    'siege');
  return true;
}

function resolveSiege(state, cp, day) {
  const site = siteById(state, cp.targetId);
  if (!site) { cp.done = true; return; }
  if (site.ownerFaction !== cp.enemy) {
    // 城在围城期间被别人拿了：这趟作罢
    cp.done = true;
    attackersOf(state, cp).forEach(clearOrder);
    return;
  }
  // 刘备入川第一仗：主线军队按剧情一起压到剑阁城下，避免“两骑先到、主力还在半路”被守军各个击破。
  // 之后各城仍按正常行军速度走。
  let attackers = attackersOf(state, cp);
  // 围城期间主线军队就算减员也不散伙：这是剧情城，不能按普通“兵少六成五就回城”处理。
  // 剧情入川也不再直接落位；只把已经走到城下的队伍算进这一轮战力。
  attackers = attackers.filter(function (l) { return siteDistance(l, site) <= 2; });
  const attackEdge = factionEdge(cp.faction, site.ownerFaction);
  const defendEdge = factionEdge(site.ownerFaction, cp.faction);
  // 关隘/要地：城仍由守方控制时，城内守军和来援的守方领主吃 1.5 倍。
  const gateEdge = strategicDefenseForSite(state, site);
  let attackPower = 0;
  attackers.forEach(function (l) { attackPower += weight(l.troops) * attackEdge; });
  let defendPower = site.garrison * 6.2 * defendEdge * gateEdge;
  cp.defenderIds.forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l || !l.alive || l.prisoner) return;
    if (siteDistance(l, site) <= 2) {
      defendPower += weight(l.troops) * defendEdge * gateEdge;
      if (cp.arrivedIds.indexOf(id) < 0) cp.arrivedIds.push(id);
    }
  });
  attackPower *= 0.9 + state.rng.next() * 0.25;
  defendPower *= 0.9 + state.rng.next() * 0.25;

  if (attackPower > defendPower * 1.06) {
    const oldOwner = site.ownerFaction;
    site.ownerFaction = cp.faction;
    site.faction = cp.faction;
    site.playerOwned = false;
    // 夺城后由攻方领兵者接管；没有在场领主就等本势力最近的人来接
    site.lordId = null;
    const newFiefLord = attackers.filter(function (l) { return l && l.alive && !l.prisoner; })[0]
      || state.lords.filter(function (l) { return l.alive && l.faction === cp.faction; })[0];
    if (newFiefLord) site.lordId = newFiefLord.id;
    site.garrison = Math.max(28, Math.round(site.garrisonBase * 0.45));
    site.garrisonBase = site.garrison;
    site.color = FACTIONS[cp.faction] ? FACTIONS[cp.faction].color : site.color;
    site.banner = FACTIONS[cp.faction] ? FACTIONS[cp.faction].banner : site.banner;
    onSiteTaken(state, site, oldOwner);
    state.siegeCooldown[key(cp.faction, oldOwner)] = day + SIEGE_COOLDOWN;
    cp.stage = 'hold';
    cp.holdUntil = day + HOLD_DAYS;
    cp.capturedSiteId = site.id;
    cp.holdSiteId = site.id;
    // 同样只留新封领主短守，其余军队解除围城令回巡逻。
    attackers.forEach(function (l) {
      if (l === newFiefLord) return;
      clearOrder(l);
      l.wander = null;
      l.patrolPath = null;
      l.routePath = null;
      l.routePathFor = null;
    });
    if (newFiefLord) {
      giveOrder(newFiefLord, 'hold', site.id, true);
      newFiefLord.order.since = day;
    }
    // 丢了城的领主先收兵，回各自剩下的城
    cp.defenderIds.forEach(function (id) {
      const l = state.lords.filter(function (x) { return x.id === id; })[0];
      if (!l) return;
      clearOrder(l);
      const home = nearestSiteOf(state, ownedSites(state, l.faction, true), site).site;
      if (home) { l.home = home.id; }
    });
    logFn(state, captureLogText(site, oldOwner, cp.faction), 'siege');
    markShuChengduBase(state, site, cp.faction);
    markMaSurrenderClock(state, site, cp.faction, day);
    return;
  }

  // 没攻下来：攻方折一阵，退回集结地；守方也只算惨胜
  attackers.forEach(function (l) {
    army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.24)));
    clearOrder(l);
  });
  site.garrison = Math.max(18, site.garrison - Math.round(site.garrison * 0.22));
  cp.defenderIds.forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    clearOrder(l);
    if (l.troops) army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.12)));
  });
  state.siegeCooldown[key(cp.faction, cp.enemy)] = day + FAIL_COOLDOWN;
  cp.done = true;
  logFn(state,
    '围城到第 ' + Math.max(SIEGE_MIN_DAYS, day - cp.siegeStart) + ' 天，' + site.name +
    '城下还是没破。' + FACTIONS[cp.faction].name + '收兵回营，城头守军也折了一半。', 'siege');
}

/**
 * 攻城的守军按势力给一套兵种配比：守军人数不再只当一个大数字，
 * 而是像玩家攻城那样进入 Battle，逐个回合消耗。
 */
function siegeGarrisonTroops(site) {
  const total = Math.max(0, Math.round(site && site.garrison || 0));
  if (total <= 0) return {};
  let mix = { militia: 0.4, spear: 0.35, archer: 0.15, cav: 0.1 };
  if (site.ownerFaction === 'bandit') mix = { bandit: 0.55, raider: 0.3, raider_cav: 0.15 };
  else if (site.ownerFaction === 'wei') mix = { militia: 0.35, spear: 0.35, crossbow: 0.2, guard: 0.1 };
  else if (site.ownerFaction === 'shu') mix = { militia: 0.35, spear: 0.3, archer: 0.25, baier: 0.1 };
  else if (site.ownerFaction === 'wu') mix = { militia: 0.35, archer: 0.35, boat: 0.2, huochuan: 0.1 };
  const out = {};
  Object.keys(mix).forEach(function (id) {
    const n = Math.round(total * mix[id]);
    if (n > 0) out[id] = n;
  });
  if (!Object.keys(out).length) out.militia = total;
  return out;
}

function siegeSiteInfo(site) {
  return {
    key: 'site:' + site.id,
    kind: 'site',
    id: site.id,
    name: site.name + '守军',
    faction: site.ownerFaction,
    relationFaction: site.ownerFaction,
    troops: siegeGarrisonTroops(site),
    morale: site.type === 'castle' ? 62 : 68,
    atkPct: site.type === 'castle' ? 0.12 : 0.05,
    defPct: site.type === 'castle' ? 0.2 : 0.12,
    isPlayer: false,
    pos: site,
  };
}

function siegeContingentKey(kind, id) {
  return (kind || '') + ':' + (id || '');
}

/**
 * 围城到点后进入“进攻中”：把攻方领主与守军组成一场真正的 Battle。
 * 不再是 resolveSiege 里的加减法一次性换旗，而是每 3 时辰推一回合，
 * 直到一方在战场上归零。
 */
function beginSiegeAssault(state, cp, site, day) {
  if (!site || site.ownerFaction !== cp.enemy) { cp.done = true; return false; }
  // 刘备入川的剑阁首攻是剧情战：五路人马已经奉令围城，哪怕有人被山道/守军
  // 挤在城郊外几格，也一起算进这次攻城，避免“一支先到、四支被堵在半路”。
  const historyRush = cp.faction === 'shu' && state.flags && state.flags.liubeiYiWar &&
    (site.id === 'jiange' || site.id === 'baxi' || site.id === 'chengdu');
  const attackers = attackersOf(state, cp).filter(function (l) {
    return (historyRush || siteDistance(l, site) <= 2) && army.troopCount(l.troops || {}) > 0;
  });
  if (!attackers.length) {
    cp.done = true;
    logFn(state, '【' + FACTIONS[cp.faction].name + '】的围城军已经散尽，' + site.name + '城下只留下空营。', 'siege');
    return false;
  }
  const attackerInfos = attackers.map(function (l) {
    const info = fieldUnitInfo(state, { kind: 'lord', id: l.id });
    if (info) info.name = l.name + '军';
    return info;
  }).filter(Boolean);
  if (!attackerInfos.length) { cp.done = true; return false; }

  const defenders = cp.defenderIds.map(function (id) {
    return state.lords.filter(function (l) { return l.id === id; })[0];
  }).filter(function (l) {
    return !!l && l.alive && !l.dead && !l.prisoner && siteDistance(l, site) <= 2 &&
      army.troopCount(l.troops || {}) > 0;
  });
  const defenderInfos = [];
  const siteInfo = siegeSiteInfo(site);
  if (army.troopCount(siteInfo.troops) > 0) defenderInfos.push(siteInfo);
  defenders.forEach(function (l) {
    const info = fieldUnitInfo(state, { kind: 'lord', id: l.id });
    if (info) defenderInfos.push(info);
  });

  const aSide = buildCoalitionSide(state, attackerInfos, site.ownerFaction, {
    name: (FACTIONS[cp.faction] ? FACTIONS[cp.faction].full : cp.faction) + '攻城军',
  });
  const bSide = buildCoalitionSide(state, defenderInfos, cp.faction, {
    name: site.name + '守军',
  });
  const battle = new Battle({
    rng: state.rng,
    attacker: aSide,
    defender: bSide,
    context: { kind: 'siege', siteId: site.id, siteName: site.name, npc: true },
  });
  cp.stage = 'assault';
  cp.assaultStartDay = day;
  cp.assaultStartH = state.clock.day * 24 + state.clock.hour;
  cp.siegeBattle = battle;
  cp.siegeSiteKey = siteInfo.key;
  cp.siegeAttackerIds = attackers.map(function (l) { return l.id; });
  cp.siegeDefenderIds = defenders.map(function (l) { return l.id; });
  cp.assaultParticipants = [];
  attackerInfos.forEach(function (info) {
    cp.assaultParticipants.push({ key: info.key, side: 'a', kind: 'lord', id: info.id });
  });
  if (army.troopCount(siteInfo.troops) > 0) {
    cp.assaultParticipants.push({ key: siteInfo.key, side: 'b', kind: 'site', id: site.id });
  }
  defenderInfos.forEach(function (info) {
    if (info.kind !== 'lord') return;
    cp.assaultParticipants.push({ key: info.key, side: 'b', kind: 'lord', id: info.id });
  });
  site.siegeStatus = 'assault';
  site.siegeFaction = cp.faction;
  site.siegeSinceH = cp.assaultStartH;
  logFn(state,
    '【' + FACTIONS[cp.faction].name + '】围城已成，云梯架上' + site.name +
    '城头。攻城开始：' + attackers.length + ' 路攻方对 ' +
    (defenders.length ? defenders.length + ' 路守将和 ' : '') + '城内守军，一回合一阵。', 'siege');
  return true;
}

/** 把攻城 Battle 的伤亡按各队现有人数摊回领主与城内守军。 */
function syncSiegeAssault(state, cp, site) {
  const battle = cp.siegeBattle;
  if (!battle) return;
  const pseudo = {
    battle: battle,
    primaryA: { key: 'campaign:' + cp.faction, faction: cp.faction, name: cp.faction },
    primaryB: { key: cp.siegeSiteKey, faction: site.ownerFaction, name: site.name },
    participants: cp.assaultParticipants || [],
  };
  syncFieldBattle(state, pseudo, { writeBack: true });
  const siteContingent = (battle.b.contingents || []).filter(function (c) {
    return c.key === cp.siegeSiteKey;
  })[0];
  if (siteContingent) site.garrison = Math.max(0, siteContingent.count);
}

/** 攻城战里赶到的守将与后续攻方，按距离逐批加入，不凭空合兵。 */
function reinforceSiegeBattle(state, cp, site) {
  const battle = cp.siegeBattle;
  if (!battle || battle.finished) return;
  const keys = {};
  (cp.assaultParticipants || []).forEach(function (p) { keys[p.key] = true; });
  (cp.siegeAttackerIds || []).concat(cp.attackerIds || []).forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l || !l.alive || l.dead || l.prisoner || l.inCity) return;
    if (siteDistance(l, site) > 2 || army.troopCount(l.troops || {}) <= 0) return;
    const key = siegeContingentKey('lord', l.id);
    if (keys[key]) return;
    const info = fieldUnitInfo(state, { kind: 'lord', id: l.id });
    if (!info) return;
    info.name = l.name + '军';
    battle.reinforce('a', info);
    cp.assaultParticipants.push({ key: key, side: 'a', kind: 'lord', id: l.id });
    keys[key] = true;
  });
  (cp.siegeDefenderIds || []).concat(cp.defenderIds || []).forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l || !l.alive || l.dead || l.prisoner || l.inCity) return;
    if (siteDistance(l, site) > 2 || army.troopCount(l.troops || {}) <= 0) return;
    const key = siegeContingentKey('lord', l.id);
    if (keys[key]) return;
    const info = fieldUnitInfo(state, { kind: 'lord', id: l.id });
    if (!info) return;
    battle.reinforce('b', info);
    cp.assaultParticipants.push({ key: key, side: 'b', kind: 'lord', id: l.id });
    keys[key] = true;
  });
}

/** 一场攻城战打赢：只在这里换旗，和野战结算一样有明确的胜负瞬间。 */
/** 城头换旗的战报：无主城不写“从 null 手里”，也不硬编一个旧主。 */
function captureLogText(site, oldOwner, faction) {
  const byName = (FACTIONS[faction] || {}).full || faction;
  if (!oldOwner) {
    return site.name + '城头换旗，' + byName + '把这座无主城纳入旗下，守军残部退回山里。';
  }
  const oldName = (FACTIONS[oldOwner] || {}).full || oldOwner;
  return site.name + '城头换了旗。' + byName + '从' + oldName + '手里夺下这座城，' +
    oldName + '的残部退往野地。';
}

/** 武威一破，给马家最后三天的献城倒计时；居延、陇西随后一起换旗。 */
function markMaSurrenderClock(state, site, byFaction, day) {
  if (!state || !site || site.id !== 'wuwei') return false;
  if ((byFaction || site.ownerFaction) !== 'hansui') return false;
  if (!state.flags || !state.flags.hanSuiMieMa || state.flags.maSurrenderDay) return false;
  state.flags.maSurrenderDay = day + 3;
  logFn(state, '武威既破，马家在西凉再没有第二座能发号施令的城。居延、陇西的守将已经在暗里递降书。', 'war');
  return true;
}

/**
 * 成都既下：刘备把治所迁到成都，成都成为蜀军大本营。
 * 这里只改君主的驻地与势力标记，不瞬移城外的军队；下次回城、补员、
 * 继任时都会以成都为根。
 */
function markShuChengduBase(state, site, byFaction) {
  if (!state || !site || site.id !== 'chengdu') return false;
  if ((byFaction || site.ownerFaction) !== 'shu') return false;
  if (site.playerOwned) return false;
  const fs = state.factionState.shu = state.factionState.shu || {};
  const first = fs.baseCity !== 'chengdu';
  fs.baseCity = 'chengdu';
  state.flags = state.flags || {};
  state.flags.shuChengduBase = true;
  const lords = state.lords || [];
  const ruler = (fs.rulerId && lords.filter(function (l) { return l.id === fs.rulerId; })[0])
    || lords.filter(function (l) { return l.id === 'liubei'; })[0];
  if (ruler && ruler.alive && !ruler.dead && !ruler.prisoner) ruler.home = 'chengdu';
  if (first) {
    logFn(state, '成都既下，刘备把治所迁到成都，以成都为蜀军大本营。', 'story');
  }
  return true;
}

function captureSiegeSite(state, cp, site, day, battle) {
  const oldOwner = site.ownerFaction;
  // 三国循环里 NPC 不能互相灭国：最后一座城由剧本保下来。
  if (keepsMajorLastCity(state, site, cp.faction)) {
    cp.done = true;
    cp.stage = 'done';
    cp.siegeBattle = null;
    site.siegeStatus = null;
    site.siegeFaction = null;
    site.siegeSinceH = null;
    state.siegeCooldown[key(cp.faction, oldOwner)] = day + 45;
    const maHanPair = (oldOwner === 'ma' && cp.faction === 'hansui') ||
      (oldOwner === 'hansui' && cp.faction === 'ma');
    logFn(state, site.name + '城破在即，' + FACTIONS[cp.faction].full +
      '却忽然收兵：' + (maHanPair ? '马腾韩遂只争城池，不灭其国。' : '三足未定，谁也不肯让一家就此灭国。'), 'siege');
    return false;
  }
  site.ownerFaction = cp.faction;
  site.faction = cp.faction;
  site.playerOwned = false;
  site.lordId = null;
  const newFiefLord = (cp.siegeAttackerIds || []).map(function (id) {
    return state.lords.filter(function (l) { return l.id === id; })[0];
  }).filter(function (l) { return l && l.alive && !l.prisoner; })[0]
    || state.lords.filter(function (l) { return l.alive && l.faction === cp.faction; })[0];
  if (newFiefLord) site.lordId = newFiefLord.id;
  site.garrison = Math.max(28, Math.round((site.garrisonBase || 40) * 0.45));
  site.garrisonBase = site.garrison;
  site.color = FACTIONS[cp.faction] ? FACTIONS[cp.faction].color : site.color;
  site.banner = FACTIONS[cp.faction] ? FACTIONS[cp.faction].banner : site.banner;
  site.siegeStatus = null;
  site.siegeFaction = null;
  site.siegeSinceH = null;
  onSiteTaken(state, site, oldOwner);
  notifyCapture(state, site, oldOwner, cp.faction);
  state.siegeCooldown[key(cp.faction, oldOwner)] = day + SIEGE_COOLDOWN;
  cp.stage = 'hold';
  cp.holdUntil = day + HOLD_DAYS;
  cp.capturedSiteId = site.id;
  cp.holdSiteId = site.id;
  cp.siegeBattle = null;
  // 攻下城后只留新封领主短守；其余参战军立刻解除围城令，
  // 下一拍回到自己的巡逻路线，不再全体在城边 hold 七天。
  const allAttackers = attackersOf(state, cp);
  allAttackers.forEach(function (l) {
    if (l !== newFiefLord) {
      clearOrder(l);
      l.wander = null;
      l.patrolPath = null;
      l.routePath = null;
      l.routePathFor = null;
    }
  });
  if (newFiefLord) {
    giveOrder(newFiefLord, 'hold', site.id, true);
    newFiefLord.order.since = day;
  }
  cp.defenderIds.forEach(function (id) {
    const l = state.lords.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    clearOrder(l);
    const home = nearestSiteOf(state, ownedSites(state, l.faction, true), site).site;
    if (home) l.home = home.id;
  });
  logFn(state, captureLogText(site, oldOwner, cp.faction), 'siege');
  markShuChengduBase(state, site, cp.faction);
  markMaSurrenderClock(state, site, cp.faction, day);
}

/** 攻城战打崩：攻方溃退，守军惨胜；伤亡已经逐回合写回，不再追加一刀。 */
function repulseSiege(state, cp, site, day, battle) {
  site.siegeStatus = null;
  site.siegeFaction = null;
  site.siegeSinceH = null;
  site.garrison = Math.max(8, Math.round(site.garrison || 0));
  (battle ? battle.a.contingents : []).forEach(function (c) {
    if (c.kind !== 'lord') return;
    const l = state.lords.filter(function (x) { return x.id === c.id; })[0];
    if (l) clearOrder(l);
  });
  state.siegeCooldown[key(cp.faction, cp.enemy)] = day + FAIL_COOLDOWN;
  cp.done = true;
  cp.stage = 'done';
  cp.siegeBattle = null;
  logFn(state,
    '攻城打到第 ' + Math.max(1, day - cp.assaultStartDay) + ' 天，' + site.name +
    '城下还是没破。' + FACTIONS[cp.faction].name + '收兵回营，城头守军也折了大半。', 'siege');
}

/** 每个 3 时辰推一回合攻城战；和 NPC 野战同样节奏，不再一口气算完。 */
function tickSiegeAssault(state, cp, site) {
  if (cp.done) return;
  if (!cp.siegeBattle) {
    if (!beginSiegeAssault(state, cp, site, state.clock.day)) return;
  }
  const battle = cp.siegeBattle;
  if (!battle) return;
  reinforceSiegeBattle(state, cp, site);
  if (battle.batchDone && !battle.finished) battle.nextBatch();
  if (!battle.finished) battle.step();
  syncSiegeAssault(state, cp, site);
  if (!battle.finished) return;
  if (battle.result === 'win' || battle.remainB() <= 0) {
    captureSiegeSite(state, cp, site, state.clock.day, battle);
  } else {
    repulseSiege(state, cp, site, state.clock.day, battle);
  }
}


function strategyTick(state) {
  initAI(state);
  const day = state.clock.day;
  ensureLiuBeiYiWar(state, day);
  ensureHanSuiMieMaWar(state, day);
  Object.keys(FACTIONS).forEach(function (faction) {
    if (faction === 'player' || faction === 'bandit') return;
    if ((state.factionState[faction] || {}).dead) {
      const cp = state.warCampaigns[faction];
      if (cp) {
        attackersOf(state, cp).forEach(clearOrder);
        delete state.warCampaigns[faction];
      }
      return;
    }
    const cp = state.warCampaigns[faction];
    if (!cp) {
      // 不再给天下设“同时只能三场大战”的上限：每个还活着的势力都该往邻国压。
      planCampaign(state, faction, day);
      return;
    }
    if (cp.done) {
      attackersOf(state, cp).forEach(clearOrder);
      cp.defenderIds.forEach(function (id) {
        const l = state.lords.filter(function (x) { return x.id === id; })[0];
        if (l) clearOrder(l);
      });
      delete state.warCampaigns[faction];
      return;
    }
    const target = siteById(state, cp.targetId);
    if (!target) { cp.done = true; return; }
    if (target.ownerFaction !== cp.enemy) {
      // 城在围城期间被别人拿了：这趟作罢，别让旧攻城军继续挂在城头。
      cp.done = true;
      cp.stage = 'done';
      cp.siegeBattle = null;
      if (target.siegeStatus === 'assault' && target.siegeFaction === cp.faction) {
        target.siegeStatus = null;
        target.siegeFaction = null;
      }
      return;
    }
    const attackers = attackersOf(state, cp);
    if (attackers.length < 1 && cp.stage !== 'siege' && cp.stage !== 'assault') { cp.done = true; return; }

    if (cp.stage === 'rally') {
      const ready = attackers.filter(function (l) {
        return siteDistance(l, siteById(state, cp.rallyId) || target) <= 2;
      }).length;
      if (day >= cp.rallyUntil) {
        if (ready < 1 && day < cp.rallyUntil + 4) return;
        if (ready < 1) {
          cp.done = true;
          logFn(state, '【' + FACTIONS[faction].name + '】的集结没凑齐人，队伍在半路散了。', 'siege');
          return;
        }
        cp.stage = 'march';
        cp.marchStart = day;
        attackers.forEach(function (l) { giveOrder(l, 'march', cp.targetId, false); });
        logFn(state, '【' + FACTIONS[faction].name + '】的 ' + attackers.length + ' 路人马从' +
          (siteById(state, cp.rallyId) || target).name + '开拔，兵锋指向' + target.name + '。', 'muster');
      }
      return;
    }

    if (cp.stage === 'march') {
      // 低兵领主会在 moveLords 里先回城补兵，军令被清掉；这里每天重新
      // 把开拔令发回去，补到 2/3 就继续走，避免整路大军在集结城站到
      // 26 天 march 超时。
      attackers.forEach(function (l) {
        if (!l.order || l.order.type !== 'march' || l.order.siteId !== cp.targetId) {
          giveOrder(l, 'march', cp.targetId, false);
          l.order.campaign = faction;
        }
      });
      if (day - cp.marchStart > 26) {
        cp.done = true;
        logFn(state, '【' + FACTIONS[faction].name + '】去' + target.name + '的路太长，粮尽退兵。', 'siege');
        return;
      }
      const near = attackers.some(function (l) { return siteDistance(l, target) <= 1; });
      if (near) startSiege(state, cp, target, day);
      return;
    }

    if (cp.stage === 'raid') {
      if (day >= cp.raidUntil) {
        cp.done = true;
        attackersOf(state, cp).forEach(clearOrder);
        logFn(state, '【' + FACTIONS[faction].name + '】掠完野，收兵回山。', 'war');
      }
      return;
    }

    if (cp.stage === 'siege') {
      // 围城每天都要死人：箭、疫病、夜袭，谁也跑不掉
      attackers.forEach(function (l) {
        if (l.troops) army.distributeLosses(l.troops, Math.max(1, Math.round(army.troopCount(l.troops) * 0.035)));
      });
      target.garrison = Math.max(8, target.garrison - Math.round(target.garrison * 0.055));
      cp.defenderIds.forEach(function (id) {
        const l = state.lords.filter(function (x) { return x.id === id; })[0];
        if (!l || !l.alive || l.prisoner) return;
        if (siteDistance(l, target) <= 2 && cp.arrivedIds.indexOf(id) < 0) {
          cp.arrivedIds.push(id);
          logFn(state, '【' + FACTIONS[l.faction].name + '】的' + l.name + '赶到' + target.name +
            '城下，守军士气振了一下。', 'siege');
        }
      });
      if (day >= cp.siegeUntil) beginSiegeAssault(state, cp, target, day);
      return;
    }

    if (cp.stage === 'assault') {
      // 攻城由 siegeTick 每 3 时辰推进一回合；每日这里只守住城头状态，
      // 不在同一天再额外结算一次，避免一天掉两轮人。
      if (!target.siegeStatus) {
        target.siegeStatus = 'assault';
        target.siegeFaction = cp.faction;
      }
      return;
    }

    if (cp.stage === 'hold') {
      if (day >= cp.holdUntil) {
        cp.done = true;
        attackersOf(state, cp).forEach(clearOrder);
        logFn(state, FACTIONS[faction].name + '在' + (siteById(state, cp.holdSiteId) || target).name +
          '留了一支守军，主力回营。', 'siege');
      }
    }
  });
}

/** 每个 NPC 步补一次：走到城下的队伍不必等第二天才围城 */
function siegeTick(state) {
  initAI(state);
  Object.keys(state.warCampaigns).forEach(function (faction) {
    const cp = state.warCampaigns[faction];
    if (!cp || cp.done) return;
    const target = siteById(state, cp.targetId);
    if (!target || target.ownerFaction !== cp.enemy) {
      cp.done = true;
      cp.stage = 'done';
      cp.siegeBattle = null;
      return;
    }
    if (cp.stage === 'march') {
      const near = attackersOf(state, cp).some(function (l) {
        return siteDistance(l, target) <= 1;
      });
      if (near) startSiege(state, cp, target, state.clock.day);
      return;
    }
    // 围城完成后进入真正一回合一阵的攻城战，每 3 时辰推一轮。
    if (cp.stage === 'assault') tickSiegeAssault(state, cp, target);
  });
}

/** 视野里最近的死敌领主（宣战势力） */
function nearestFoe(state, lord, range) {
  const r = range || 5;
  let best = null;
  let bestD = r + 1;
  state.lords.forEach(function (o) {
    if (o === lord || !o.alive || !o.troops || o.inCity || o.scattered) return;
    if (o.faction === lord.faction) return;
    if (o.faction === 'bandit' || lord.faction === 'bandit') return;
    if (!atWar(state, lord.faction, o.faction)) return;
    const d = Math.max(Math.abs(o.x - lord.x), Math.abs(o.y - lord.y));
    if (d < bestD) { bestD = d; best = o; }
  });
  return best;
}

function summaryLines(state) {
  const m = state.factionWars || {};
  const lines = [];
  Object.keys(m).forEach(function (k) {
    const parts = k.split('|');
    const days = state.clock.day - (m[k].since || 1);
    lines.push({ a: parts[0], b: parts[1], days: days });
  });
  return lines;
}

module.exports = {
  init, atWar, declare, makePeace, diplomacyTick, peaceOfferTick, startDiplomacy, alertsEnabled,
  aiCanDeclare, canOpenWar, MAX_WAR_PARTNERS, OPENING_FORBIDDEN,
  fieldTick, clash, capture, freeLord, prisonerTick, onSiteTaken, playerDefeatsLord,
  markLordScattered,
  killLord, recruitLord, recruitChance, playerStanding,
  ransom, release, listPrisoners, summaryLines, warPartners, bindLogger, bindPassable, weight,
  factionEdge, combatTroops,
  ownedCities, factionsAdjacent, canSiegeSiteFromFaction,
  canPlayerDeclareFaction, canPlayerDeclareSite,
  strategicDefenseAt, strategicDefenseForSite,
  nearestFoe,
  strategyTick, siegeTick, abortCampaign, bindCaptureHook, notifyCapture,
  markShuChengduBase,
  planCampaign,
  ensureLiuBeiYiWar, LIUBEI_YI_WAR_DAY,
  ensureHanSuiMieMaWar, HANSUI_MIE_MA_DAY,
  bindFleeGuard, bindPartyDestroyer, bindMovement,
  ESCAPE_BASE, ESCAPE_STEP,
  tierPower, tierForce, FIELD_BATTLE_RADIUS, FIELD_BATTLE_LIMIT,
  createFieldBattle, addNearbyToFieldBattle, syncFieldBattle, settleFieldBattle,
  abandonFieldBattle, tickFieldBattles, fieldBattleById, playerContingentOf,
  contingentTroops, scaleTroopsTo, fieldUnitInfo, fieldSideFor, collectNearbyFieldUnits,
  moveAway,
};

