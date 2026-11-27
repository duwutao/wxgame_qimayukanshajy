/**
 * 名将榜：决定历史领主的带兵上限与招兵速度。
 *
 * 名次越靠前，带兵上限越高；招兵倍率按名次分段：
 * 1-3 = 2.0，4-9 = 1.8，10-19 = 1.6，20-29 = 1.4，30-39 = 1.2，40-50 = 1.1。
 * 君主默认 1.5；榜单速率高于 1.5 时取榜单值，低于 1.5 时仍按 1.5。
 */

const LORD_POWER_LIST = [
  { rank: 1, id: 'lvbu', name: '吕布', score: 100 },
  { rank: 2, id: 'zhaoyun', name: '赵云', score: 98 },
  { rank: 3, id: 'dianwei', name: '典韦', score: 97 },
  { rank: 4, id: 'guanyu', name: '关羽', score: 96 },
  { rank: 5, id: 'machao', name: '马超', score: 96 },
  { rank: 6, id: 'zhangfei', name: '张飞', score: 95 },
  { rank: 7, id: 'huangzhong', name: '黄忠', score: 94 },
  { rank: 8, id: 'xuchu', name: '许褚', score: 94 },
  { rank: 9, id: 'sunce', name: '孙策', score: 92 },
  { rank: 10, id: 'taishici', name: '太史慈', score: 92 },
  { rank: 11, id: 'xiahou', name: '夏侯惇', score: 90 },
  { rank: 12, id: 'xiahouyuan', name: '夏侯渊', score: 89 },
  { rank: 13, id: 'zhangliao', name: '张辽', score: 89 },
  { rank: 14, id: 'zhanghe', name: '张郃', score: 88 },
  { rank: 15, id: 'xuhuang', name: '徐晃', score: 88 },
  { rank: 16, id: 'pangde', name: '庞德', score: 88 },
  { rank: 17, id: 'ganning', name: '甘宁', score: 87 },
  { rank: 18, id: 'weiyan', name: '魏延', score: 87 },
  { rank: 19, id: 'zhoutai', name: '周泰', score: 85 },
  { rank: 20, id: 'zhangxiu', name: '张绣', score: 85 },
  { rank: 21, id: 'yanliang', name: '颜良', score: 85 },
  { rank: 22, id: 'wenchou', name: '文丑', score: 84 },
  { rank: 23, id: 'wenyang', name: '文鸯', score: 93 },
  { rank: 24, id: 'dengai', name: '邓艾', score: 83 },
  { rank: 25, id: 'jiangwei', name: '姜维', score: 83 },
  { rank: 26, id: 'wangshuang', name: '王双', score: 83 },
  { rank: 27, id: 'gaolan', name: '高览', score: 82 },
  { rank: 28, id: 'caozhang', name: '曹彰', score: 82 },
  { rank: 29, id: 'zhangren', name: '张任', score: 81 },
  { rank: 30, id: 'jiling', name: '纪灵', score: 80 },
  { rank: 31, id: 'huaxiong', name: '华雄', score: 80 },
  { rank: 32, id: 'guanhai', name: '管亥', score: 79 },
  { rank: 33, id: 'caohong', name: '曹洪', score: 79 },
  { rank: 34, id: 'yuejin', name: '乐进', score: 78 },
  { rank: 35, id: 'lingtong', name: '凌统', score: 78 },
  { rank: 36, id: 'yanyan', name: '严颜', score: 77 },
  { rank: 37, id: 'madai', name: '马岱', score: 76 },
  { rank: 38, id: 'ehuang', name: '鄂焕', score: 76 },
  { rank: 39, id: 'handang', name: '韩当', score: 75 },
  { rank: 40, id: 'panzhang', name: '潘璋', score: 74 },
  { rank: 41, id: 'xusheng', name: '徐盛', score: 73 },
  { rank: 42, id: 'dingfeng', name: '丁奉', score: 73 },
  { rank: 43, id: 'liyan', name: '李严', score: 81 },
  { rank: 44, id: 'lengbao', name: '冷苞', score: 77 },
  { rank: 45, id: 'wulan', name: '吴兰', score: 75 },
  { rank: 46, id: 'leitong', name: '雷铜', score: 74 },
  { rank: 47, id: 'wuangou', name: '武安国', score: 73 },
  { rank: 48, id: 'gongsunzan', name: '公孙瓒', score: 72 },
  { rank: 49, id: 'xingdaorong', name: '邢道荣', score: 71 },
  { rank: 50, id: 'zhangbao', name: '张苞', score: 71 },
];

function capForRank(rank) {
  const r = Math.max(1, Math.min(50, Math.round(Number(rank) || 50)));
  return 270 - Math.round((r - 1) * 2.2);
}

const DEFAULT_MONARCH_RECRUIT_MUL = 1.5;

function recruitMulForRank(rank) {
  const r = Math.max(1, Math.min(50, Math.round(Number(rank) || 50)));
  if (r <= 3) return 2.0;
  if (r <= 9) return 1.8;
  if (r <= 19) return 1.6;
  if (r <= 29) return 1.4;
  if (r <= 39) return 1.2;
  return 1.1;
}

const LORD_POWER_BY_ID = LORD_POWER_LIST.reduce(function (out, item) {
  out[item.id] = {
    rank: item.rank,
    id: item.id,
    name: item.name,
    score: item.score,
    cap: capForRank(item.rank),
    recruitMul: recruitMulForRank(item.rank),
  };
  return out;
}, {});

/* ------------------------------------------------------- 将帅 / 武力 / 军师 */

/**
 * 带兵指数的标幺值。150 人作为 1.0 基准：
 *  - 基准取 150，是为了让君主 1.5 在魏国 0.7 系数下仍落在 n52 的 158 人左右；
 *  - 武将 1.4 = 210 人，军师 / 君主 1.5 = 225 人，帅才按档位 225～255 人。
 */
const COMMAND_BASE = 150;

/** 帅才 20 人：第 1 名一档，2-5、6-10、11-15、16-20 各一档。 */
const MARSHAL_TOP20 = [
  { rank: 1, id: 'caocao', name: '曹操' },
  { rank: 2, id: 'simayi', name: '司马懿' },
  { rank: 3, id: 'zhouyu', name: '周瑜' },
  { rank: 4, id: 'luxun', name: '陆逊' },
  { rank: 5, id: 'dengai', name: '邓艾' },
  { rank: 6, id: 'guanyu', name: '关羽' },
  { rank: 7, id: 'zhangliao', name: '张辽' },
  { rank: 8, id: 'lvmeng', name: '吕蒙' },
  { rank: 9, id: 'zhugeliang', name: '诸葛亮' },
  { rank: 10, id: 'zhangfei', name: '张飞' },
  { rank: 11, id: 'zhanghe', name: '张郃' },
  { rank: 12, id: 'xuhuang', name: '徐晃' },
  { rank: 13, id: 'caoren', name: '曹仁' },
  { rank: 14, id: 'ganning', name: '甘宁' },
  { rank: 15, id: 'weiyan', name: '魏延' },
  { rank: 16, id: 'huangzhong', name: '黄忠' },
  { rank: 17, id: 'machao', name: '马超' },
  { rank: 18, id: 'jiangwei', name: '姜维' },
  { rank: 19, id: 'lvbu', name: '吕布' },
  { rank: 20, id: 'taishici', name: '太史慈' },
];

/** 帅才档位：档数沿用旧榜的五档结构，但每档人数按 1 / 4 / 5 / 5 / 5 重排。 */
const MARSHAL_COMMAND_TIERS = [
  { tier: 1, from: 1, to: 1, command: 1.70 },
  { tier: 2, from: 2, to: 5, command: 1.65 },
  { tier: 3, from: 6, to: 10, command: 1.60 },
  { tier: 4, from: 11, to: 15, command: 1.55 },
  { tier: 5, from: 16, to: 20, command: 1.50 },
];

/** 武力榜前 50 的新战力值：按旧名次分七档，不再沿用旧的线性 cap。 */
const GENERAL_FORCE_TIERS = [
  { tier: 1, from: 1, to: 1, force: 4.0 },
  { tier: 2, from: 2, to: 3, force: 3.5 },
  { tier: 3, from: 4, to: 9, force: 3.0 },
  { tier: 4, from: 10, to: 19, force: 2.6 },
  { tier: 5, from: 20, to: 29, force: 2.5 },
  { tier: 6, from: 30, to: 39, force: 1.8 },
  { tier: 7, from: 40, to: 50, force: 1.5 },
];

/** 历史军师名录：S+ / S / A / B。开局天雷按档位杀敌，单次封顶 100。 */
const STRATEGIST_GRADES = [
  { grade: 'S+', pct: 0.50, cap: 100, ids: ['zhugeliang'] },
  { grade: 'S', pct: 0.40, cap: 100, ids: ['simayi', 'guojia', 'zhouyu'] },
  { grade: 'A', pct: 0.30, cap: 100, ids: ['jiaxu', 'pangtong', 'luxun', 'xunyu', 'xushu', 'dengai', 'zhonghui'] },
  { grade: 'B', pct: 0.20, cap: 100, ids: ['chengyu', 'xunyou', 'fazheng', 'tianfeng', 'jushou', 'chengong', 'liru', 'zhangzhao', 'zhanghong'] },
];

/** 名录展示用；不在当前名册的军师也要能在帮助页看到。 */
const STRATEGIST_NAMES = {
  zhugeliang: '诸葛亮',
  simayi: '司马懿',
  guojia: '郭嘉',
  zhouyu: '周瑜',
  jiaxu: '贾诩',
  pangtong: '庞统',
  luxun: '陆逊',
  xunyu: '荀彧',
  xushu: '徐庶',
  dengai: '邓艾',
  zhonghui: '钟会',
  chengyu: '程昱',
  xunyou: '荀攸',
  fazheng: '法正',
  tianfeng: '田丰',
  jushou: '沮授',
  chengong: '陈宫',
  liru: '李儒',
  zhangzhao: '张昭',
  zhanghong: '张纮',
};

const MARSHAL_BY_ID = MARSHAL_TOP20.reduce(function (out, item) {
  const tier = MARSHAL_COMMAND_TIERS.filter(function (t) {
    return item.rank >= t.from && item.rank <= t.to;
  })[0] || MARSHAL_COMMAND_TIERS[MARSHAL_COMMAND_TIERS.length - 1];
  out[item.id] = {
    rank: item.rank,
    id: item.id,
    name: item.name,
    tier: tier.tier,
    command: tier.command,
    force: 1.4,
  };
  return out;
}, {});

const STRATEGIST_BY_ID = STRATEGIST_GRADES.reduce(function (out, group) {
  group.ids.forEach(function (id) {
    out[id] = {
      grade: group.grade,
      pct: group.pct,
      cap: group.cap,
    };
  });
  return out;
}, {});

function generalForceForRank(rank) {
  const r = Math.max(1, Math.min(50, Math.round(Number(rank) || 50)));
  const tier = GENERAL_FORCE_TIERS.filter(function (t) {
    return r >= t.from && r <= t.to;
  })[0];
  return tier ? tier.force : 1.5;
}

function marshalFor(id) {
  return MARSHAL_BY_ID[id] || null;
}

function strategistFor(id) {
  return STRATEGIST_BY_ID[id] || null;
}

/**
 * 单个领主的三种身份可以同时存在，但每一类只取最高值：
 *  - command：带兵指数（君主 1.5、军师 1.5、武将 1.4、帅才按档位 1.5～1.7）
 *  - force：杀敌指数（军师 0.9、帅才 1.4、武将按七档 1.5～4.0）
 *  - strategist：开局雷击档位，独立叠加，不参与 command/force 取最大。
 */
function roleInfoFor(lord, opts) {
  const id = lord && lord.id;
  if (!id) return { command: null, force: null, strategist: null };
  const isRuler = !!(opts && opts.isRuler);
  const commands = [];
  const forces = [];
  if (isRuler) {
    commands.push(1.5);
    forces.push(1.5);
  }
  const general = LORD_POWER_BY_ID[id];
  if (general) {
    commands.push(1.4);
    forces.push(generalForceForRank(general.rank));
  }
  const marshal = MARSHAL_BY_ID[id];
  if (marshal) {
    commands.push(marshal.command);
    forces.push(marshal.force);
  }
  const strategist = STRATEGIST_BY_ID[id];
  if (strategist) {
    commands.push(1.5);
    forces.push(0.9);
  }
  return {
    command: commands.length ? Math.max.apply(null, commands) : null,
    force: forces.length ? Math.max.apply(null, forces) : null,
    strategist: strategist || null,
    general: general || null,
    marshal: marshal || null,
    isRuler: isRuler,
  };
}

function commandCapFor(command, factionMul) {
  if (command === null || command === undefined) return null;
  const mul = Number(factionMul) > 0 ? Number(factionMul) : 1;
  return Math.max(40, Math.round(COMMAND_BASE * command * mul));
}

/**
 * 武力值上战场不是直接乘 4 倍，而是压成 (force / 1.5)^0.6：
 * 吕布 4.0 约 1.78 倍杀敌，榜尾 1.5 正好 1.0；避免单将无双把团战打穿。
 */
function forceCombatMul(force) {
  const n = Number(force);
  if (!isFinite(n) || n <= 0) return 1;
  return Math.pow(n / 1.5, 0.6);
}

module.exports = {
  DEFAULT_MONARCH_RECRUIT_MUL,
  LORD_POWER_LIST,
  LORD_POWER_BY_ID,
  capForRank,
  recruitMulForRank,
  COMMAND_BASE,
  MARSHAL_TOP20,
  MARSHAL_COMMAND_TIERS,
  MARSHAL_BY_ID,
  GENERAL_FORCE_TIERS,
  STRATEGIST_GRADES,
  STRATEGIST_NAMES,
  STRATEGIST_BY_ID,
  generalForceForRank,
  marshalFor,
  strategistFor,
  roleInfoFor,
  commandCapFor,
  forceCombatMul,
};
