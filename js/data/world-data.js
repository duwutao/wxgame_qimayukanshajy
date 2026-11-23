/**
 * 世界静态数据：地形、据点、势力、装备、任务模板
 * 地图为 20 x 26 格，坐标原点在左上角。
 */

const MAP_W = 20;
const MAP_H = 26;

const TERRAIN = {
  grass: { id: 'grass', name: '草原', cost: 1.0, passable: true, hours: 2.0 },
  road: { id: 'road', name: '道路', cost: 0.62, passable: true, hours: 1.3 },
  forest: { id: 'forest', name: '森林', cost: 1.45, passable: true, hours: 2.8 },
  hills: { id: 'hills', name: '丘陵', cost: 1.8, passable: true, hours: 3.4 },
  mountain: { id: 'mountain', name: '山地', cost: 99, passable: false, hours: 99 },
  river: { id: 'river', name: '涉水', cost: 2.5, passable: true, hours: 4.5 },
};

const FACTIONS = {
  north: {
    id: 'north',
    name: '北境王国',
    color: '#5a7fb5',
    lord: '哈罗德伯爵',
    desc: '骑士与重甲长矛的国度，守规矩，也守旧。',
  },
  south: {
    id: 'south',
    name: '南境汗国',
    color: '#b5713c',
    lord: '札兀兀台汗',
    desc: '草原上的骑兵汗国，来去如风，最恨在开阔地和你遭遇。',
  },
  free: {
    id: 'free',
    name: '自由城邦',
    color: '#4f8f74',
    lord: '潮汐议会',
    desc: '靠钱和雇佣兵活着的商港联盟，谁给钱就雇谁。',
  },
  bandit: {
    id: 'bandit',
    name: '匪帮',
    color: '#8b3a3a',
    lord: '无',
    desc: '散落的马匪与流寇，所有人的敌人。',
  },
};

/**
 * 据点定义（手工布点）
 * type: town 城镇 / castle 城堡 / village 村庄 / camp 匪巢
 * market: 是否开放市场，priceBase 为粮价系数
 */
const SITE_DEFS = [
  {
    id: 'ironhold', name: '铁堡', type: 'town', faction: 'north', x: 4, y: 4,
    market: true, priceBase: 1.05, garrison: 90,
    recruit: ['militia', 'spear', 'guard'], recruitCap: 14,
    blurb: '北境王国的边贸镇，城墙厚，粮价贵。',
  },
  {
    id: 'grimwatch', name: '灰望堡', type: 'castle', faction: 'north', x: 9, y: 2,
    market: true, priceBase: 1.18, garrison: 130,
    recruit: ['guard', 'spear'], recruitCap: 8,
    blurb: '扼守北岭的石头堡垒，只卖军需，不卖人情。',
  },
  {
    id: 'brookmill', name: '溪磨村', type: 'village', faction: 'north', x: 6, y: 1,
    market: true, priceBase: 0.68, garrison: 12,
    recruit: ['militia', 'spear'], recruitCap: 6,
    blurb: '磨坊与麦田，粮价全图最低，也最容易被匪帮骚扰。',
  },
  {
    id: 'ashford', name: '灰津村', type: 'village', faction: 'north', x: 3, y: 10,
    market: true, priceBase: 0.72, garrison: 10,
    recruit: ['militia'], recruitCap: 5,
    blurb: '河湾浅滩边的村子，日子清苦但安稳。',
  },
  {
    id: 'vellin', name: '维林城', type: 'town', faction: 'south', x: 15, y: 7,
    market: true, priceBase: 1.1, garrison: 100,
    recruit: ['militia', 'archer', 'cav'], recruitCap: 12,
    blurb: '汗国的集贸城，马匹便宜，骑兵好招。',
  },
  {
    id: 'sundermark', name: '裂石堡', type: 'castle', faction: 'south', x: 17, y: 15,
    market: true, priceBase: 1.2, garrison: 120,
    recruit: ['cav', 'guard'], recruitCap: 7,
    blurb: '汗国南境的据点，要塞里常年缺粮。',
  },
  {
    id: 'tarnwick', name: '湖湾村', type: 'village', faction: 'south', x: 12, y: 9,
    market: true, priceBase: 0.7, garrison: 9,
    recruit: ['militia', 'archer'], recruitCap: 4,
    blurb: '湖畔渔村，弓箭手在这里长大。',
  },
  {
    id: 'portway', name: '潮汐港', type: 'town', faction: 'free', x: 7, y: 18,
    market: true, priceBase: 1.15, garrison: 95,
    recruit: ['militia', 'archer', 'cav'], recruitCap: 13,
    blurb: '自由城邦的商港，什么都卖，什么都贵。',
  },
  {
    id: 'sandreach', name: '沙洲村', type: 'village', faction: 'free', x: 15, y: 20,
    market: true, priceBase: 0.74, garrison: 8,
    recruit: ['militia', 'spear'], recruitCap: 4,
    blurb: '沙地上种枣椰的村子，缺人手，不缺风沙。',
  },
  {
    id: 'pinehollow', name: '松谷村', type: 'village', faction: 'free', x: 11, y: 23,
    market: true, priceBase: 0.8, garrison: 11,
    recruit: ['militia', 'archer'], recruitCap: 5,
    blurb: '林间的樵夫村，消息灵通，粮不多。',
  },
  {
    id: 'blackpine', name: '黑松营', type: 'camp', faction: 'bandit', x: 18, y: 3,
    market: false, priceBase: 0, garrison: 34,
    recruit: [], recruitCap: 0,
    blurb: '黑松林里的匪巢，头目带着三十多号亡命徒。',
  },
  {
    id: 'chapel', name: '废礼拜堂', type: 'camp', faction: 'bandit', x: 2, y: 22,
    market: false, priceBase: 0, garrison: 28,
    recruit: [], recruitCap: 0,
    blurb: '废弃的石头礼拜堂，如今是马匪的落脚处。',
  },
];

/** 道路连线：生成时沿直线铺出，穿山也不阻断 */
const ROADS = [
  ['brookmill', 'ironhold'],
  ['ironhold', 'grimwatch'],
  ['ironhold', 'ashford'],
  ['ashford', 'tarnwick'],
  ['tarnwick', 'vellin'],
  ['grimwatch', 'vellin'],
  ['vellin', 'sundermark'],
  ['sundermark', 'sandreach'],
  ['ironhold', 'portway'],
  ['portway', 'sandreach'],
  ['portway', 'pinehollow'],
  ['pinehollow', 'sandreach'],
];

/** 装备（个人战技加成），每档只能升一级 */
const EQUIPMENT = {
  blade: {
    slot: 'blade',
    name: '武器',
    tiers: [
      { id: 'blade0', name: '生锈短剑', price: 0, atkPct: 0, desc: '继承来的旧剑。' },
      { id: 'blade1', name: '制式弯刀', price: 160, atkPct: 0.08, desc: '出手更快，战团攻击 +8%。' },
      { id: 'blade2', name: '双手重剑', price: 420, atkPct: 0.16, desc: '破甲利器，战团攻击 +16%。' },
    ],
  },
  armor: {
    slot: 'armor',
    name: '护甲',
    tiers: [
      { id: 'armor0', name: '皮背心', price: 0, defPct: 0, desc: '挡不住刀，但聊胜于无。' },
      { id: 'armor1', name: '锁子甲', price: 200, defPct: 0.1, desc: '战团防御 +10%。' },
      { id: 'armor2', name: '板甲', price: 520, defPct: 0.2, desc: '战团防御 +20%，行军稍慢。' },
    ],
  },
  horse: {
    slot: 'horse',
    name: '坐骑',
    tiers: [
      { id: 'horse0', name: '老驮马', price: 0, speedPct: 0, desc: '能驮货，不能冲锋。' },
      { id: 'horse1', name: '草原马', price: 240, speedPct: 0.15, desc: '行军速度 +15%。' },
      { id: 'horse2', name: '战马', price: 600, speedPct: 0.3, desc: '行军速度 +30%，包抄更致命。' },
    ],
  },
};

/** 任务模板 */
const QUEST_TEMPLATES = {
  hunt: {
    type: 'hunt',
    title: '清剿匪团',
    text: '“边境上又有一伙马匪在劫掠商队。带他们的人头回来，赏金不会少。”',
    reward: { gold: 180, renown: 22 },
  },
  grain: {
    type: 'grain',
    title: '征缴粮草',
    text: '“城里粮仓见底。送 40 单位粮草过来，钱照付。”',
    need: 40,
    reward: { gold: 150, renown: 16 },
  },
  scout: {
    type: 'scout',
    title: '探查匪巢',
    text: '“去把那处匪巢的位置摸清楚，走到它门口再回来报信。”',
    target: 'camp',
    reward: { gold: 110, renown: 12 },
  },
};

/** 声望等级 */
const RENOWN_TIERS = [
  { at: 0, name: '无名佣兵' },
  { at: 60, name: '小有名气' },
  { at: 150, name: '边地队长' },
  { at: 300, name: '边境领主' },
];

module.exports = {
  MAP_W,
  MAP_H,
  TERRAIN,
  FACTIONS,
  SITE_DEFS,
  ROADS,
  EQUIPMENT,
  QUEST_TEMPLATES,
  RENOWN_TIERS,
};
