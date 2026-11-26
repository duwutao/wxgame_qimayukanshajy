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

module.exports = {
  DEFAULT_MONARCH_RECRUIT_MUL,
  LORD_POWER_LIST,
  LORD_POWER_BY_ID,
  capForRank,
  recruitMulForRank,
};
