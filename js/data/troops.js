/**
 * 兵种表（三国）
 * atk/def/hp 用于战斗模拟；food 为每人每日口粮；tier 决定伤亡顺序（低阶先倒）。
 * 特殊标记：
 *   cav 骑兵 / ranged 远程 / spear 长矛（克骑）
 *   pierce 破甲（弩） / fire 火攻 / lock 士气锁死（不溃） / hill 山地不减速
 */

const TROOPS = {
  militia: {
    id: 'militia', name: '民兵', tier: 1, atk: 6, def: 6, hp: 24, food: 1, recruit: 12,
    desc: '临时征来的农人，给根木棍就上阵。便宜，也容易死。',
  },
  spear: {
    id: 'spear', name: '枪盾兵', tier: 2, atk: 9, def: 11, hp: 26, food: 1, recruit: 30, spear: true,
    desc: '结阵顶住骑兵的中坚。长矛如林，马不敢冲。',
  },
  archer: {
    id: 'archer', name: '弓手', tier: 2, atk: 12, def: 5, hp: 20, food: 1, recruit: 34, ranged: true,
    desc: '开战先射三轮。近战很脆，别让人贴脸。',
  },
  crossbow: {
    id: 'crossbow', name: '弩手', tier: 3, atk: 14, def: 4, hp: 20, food: 1, recruit: 46, ranged: true, pierce: true,
    desc: '上弦慢，但能破甲。对付重骑与亲卫特别好用。',
  },
  cav: {
    id: 'cav', name: '轻骑', tier: 3, atk: 15, def: 8, hp: 30, food: 3, recruit: 64, cav: true,
    desc: '冲锋与包抄的核心。人吃马嚼，口粮三倍。',
  },
  qishe: {
    id: 'qishe', name: '骑射', tier: 3, atk: 13, def: 7, hp: 28, food: 3, recruit: 70, cav: true, ranged: true,
    desc: '边地打法：不贴身，绕着射。打不死你，也追不上他。',
  },
  heavy: {
    id: 'heavy', name: '重骑', tier: 4, atk: 18, def: 13, hp: 36, food: 3, recruit: 118, cav: true,
    desc: '人马皆披甲。正面撞阵，步兵阵线会裂。',
  },
  guard: {
    id: 'guard', name: '亲卫', tier: 4, atk: 17, def: 15, hp: 38, food: 1, recruit: 128, renownReq: 100,
    desc: '主公身边的死士。需声望 100 才招得到。',
  },
  baier: {
    id: 'baier', name: '白毦兵', tier: 4, atk: 16, def: 14, hp: 40, food: 1, recruit: 136, renownReq: 150, lock: true,
    desc: '白毦为饰，士气锁死，不溃不散。刘备手下最后一张牌。',
  },
  wudang: {
    id: 'wudang', name: '无当飞军', tier: 4, atk: 15, def: 12, hp: 34, food: 1, recruit: 132, renownReq: 150, hill: true, ranged: true,
    desc: '南中劲卒，山地如平地。翻山越岭不减速。',
  },
  danyang: {
    id: 'danyang', name: '丹阳兵', tier: 4, atk: 16, def: 13, hp: 36, food: 1, recruit: 142, renownReq: 160,
    desc: '天下精兵出丹阳。江东的底子，靠他们撑。',
  },
  boat: {
    id: 'boat', name: '轻舟兵', tier: 2, atk: 10, def: 8, hp: 24, food: 2, recruit: 54,
    desc: '水上的兵。上岸打不如在水上打。',
  },
  huochuan: {
    id: 'huochuan', name: '火船手', tier: 3, atk: 13, def: 8, hp: 26, food: 2, recruit: 86, fire: true, renownReq: 120,
    desc: '驾火船冲阵，点火不伤己。赤壁那一夜就是他们。',
  },
  xianbei: {
    id: 'xianbei', name: '鲜卑游骑', tier: 3, atk: 16, def: 7, hp: 28, food: 3, recruit: 76, cav: true, ranged: true,
    desc: '塞外的骑射手。来去如风，抢完就走。',
  },
  tengri: {
    id: 'tengri', name: '腾格里卫', tier: 4, atk: 19, def: 12, hp: 34, food: 3, recruit: 168, cav: true, renownReq: 200,
    desc: '鲜卑单于的亲骑。马力最盛，冲阵最狠。',
  },
  tiefu: {
    id: 'tiefu', name: '西凉铁骑', tier: 4, atk: 20, def: 14, hp: 36, food: 3, recruit: 176, cav: true, renownReq: 180,
    desc: '凉州精骑，人马俱甲。中原步兵见了会退半步。',
  },
  jinjun: {
    id: 'jinjun', name: '禁军', tier: 5, atk: 22, def: 18, hp: 44, food: 2, recruit: 240, renownReq: 300,
    desc: '汉家禁军，最后一支还听诏书的兵。',
  },
  huangjin: {
    id: 'huangjin', name: '黄巾', tier: 1, atk: 7, def: 5, hp: 22, food: 1, recruit: 0,
    desc: '头裹黄巾的流民军。人多，甲少。',
  },
  bandit: {
    id: 'bandit', name: '山贼', tier: 1, atk: 8, def: 6, hp: 24, food: 1, recruit: 0,
    desc: '山里的散兵。人少打不过，人多很麻烦。',
  },
  raider: {
    id: 'raider', name: '贼首', tier: 3, atk: 13, def: 10, hp: 32, food: 1, recruit: 0,
    desc: '寨里的头目，身上有抢来的好甲。',
  },
  raider_cav: {
    id: 'raider_cav', name: '马贼', tier: 3, atk: 14, def: 8, hp: 28, food: 1, recruit: 0, cav: true,
    desc: '骑马的匪。跑得比追兵快。',
  },
};

const TROOP_IDS = Object.keys(TROOPS);

/** 可招募的兵（不含匪类） */
const RECRUITABLE = [
  'militia', 'spear', 'archer', 'crossbow', 'cav', 'qishe', 'heavy',
  'guard', 'baier', 'wudang', 'danyang', 'boat', 'huochuan', 'xianbei',
  'tengri', 'tiefu', 'jinjun',
];

function troopOf(id) {
  return TROOPS[id] || null;
}

module.exports = { TROOPS, TROOP_IDS, RECRUITABLE, troopOf };

