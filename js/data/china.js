/**
 * 三国大地图数据：地形、区域风景、城池、势力、领主、战役链
 * 地图 40 x 48 格，坐标原点左上角，东侧是海。
 * 区域(region)决定地形基色，同一张图从塞北草原到江南水乡各不相同。
 */

/**
 * 原始设计稿是 40x48。所有折线、区域框、据点坐标都按这个尺寸写。
 * 放大 1.6 倍后：地图 64x77，城与城之间拉开距离，TILE 不变，视野仍是 ~11 格。
 */
const BASE_W = 40;
const BASE_H = 48;
const MAP_W = 64;
const MAP_H = 77;

/** 地形：cost 影响寻路，hours 为越过一格的游戏小时 */
const TERRAIN = {
  plain: { id: 'plain', name: '原野', cost: 1.0, passable: true, hours: 2.0 },
  farm: { id: 'farm', name: '农田', cost: 0.95, passable: true, hours: 1.9 },
  road: { id: 'road', name: '道路', cost: 0.6, passable: true, hours: 1.3 },
  forest: { id: 'forest', name: '林地', cost: 1.5, passable: true, hours: 2.9 },
  marsh: { id: 'marsh', name: '沼泽', cost: 2.2, passable: true, hours: 4.3 },
  hills: { id: 'hills', name: '丘陵', cost: 1.8, passable: true, hours: 3.4 },
  mountain: { id: 'mountain', name: '山地', cost: 99, passable: false, hours: 99 },
  river: { id: 'river', name: '涉水', cost: 2.4, passable: true, hours: 4.6 },
  desert: { id: 'desert', name: '戈壁', cost: 1.55, passable: true, hours: 3.1 },
  sea: { id: 'sea', name: '海', cost: 99, passable: false, hours: 99 },
};

/**
 * 区域：决定基础地形、杂生地形与配色
 * palette.ground 地面主色 / dark 暗部 / light 亮部 / deco 装饰色
 */
const REGIONS = {
  ssb: {
    name: '塞北草原', base: 'plain', accent: 'hills', density: 0.12,
    palette: { ground: '#7d7a46', dark: '#635f36', light: '#96935a', deco: '#b3ad78' },
    tint: '#8a854f',
    flavor: '风吹草低，牧马成群。这里没有城墙，只有地平线。',
  },
  youyan: {
    name: '幽燕', base: 'forest', accent: 'hills', density: 0.16,
    palette: { ground: '#4a6340', dark: '#37492f', light: '#5e7a50', deco: '#7d9a62' },
    tint: '#40573a',
    flavor: '燕山以北，松林连着松林，冬天来得比信使早。',
  },
  bingzhou: {
    name: '并州山地', base: 'hills', accent: 'forest', density: 0.22,
    palette: { ground: '#6f6142', dark: '#584c31', light: '#877955', deco: '#9c8c66' },
    tint: '#736447',
    flavor: '太行与吕梁夹着一条走廊，谁占了山口谁就掐住河北的脖子。',
  },
  jizhou: {
    name: '冀州平原', base: 'farm', accent: 'forest', density: 0.1,
    palette: { ground: '#7c8244', dark: '#636a34', light: '#969c56', deco: '#b6b86e' },
    tint: '#7d8447',
    flavor: '一望无际的麦田。袁本初的粮，八成从这片地里长出来。',
  },
  liangzhou: {
    name: '凉州戈壁', base: 'desert', accent: 'hills', density: 0.18,
    palette: { ground: '#ad9360', dark: '#8e774b', light: '#c9b078', deco: '#dcc794' },
    tint: '#b09865',
    flavor: '砾石、风沙、还有最好的马。出了玉门关，就没有汉家的县令了。',
  },
  guanzhong: {
    name: '关中', base: 'farm', accent: 'hills', density: 0.15,
    palette: { ground: '#80804a', dark: '#676839', light: '#999a60', deco: '#b7b57c' },
    tint: '#83834d',
    flavor: '八百里秦川，四塞之地。守住函谷与潼关，就守住了半个天下。',
  },
  zhongyuan: {
    name: '中原', base: 'farm', accent: 'forest', density: 0.08,
    palette: { ground: '#8a8443', dark: '#6f6b32', light: '#a49d55', deco: '#c0b56c' },
    tint: '#8b8545',
    flavor: '四通八达，也四战之地。谁都想拿，谁都不好守。',
  },
  xuzhou: {
    name: '徐州', base: 'farm', accent: 'marsh', density: 0.14,
    palette: { ground: '#6f8449', dark: '#586b38', light: '#879e5f', deco: '#a2b876' },
    tint: '#718650',
    flavor: '泗水与沂水在这里打了个结，富庶，也最容易被两路夹击。',
  },
  yizhou: {
    name: '益州', base: 'forest', accent: 'hills', density: 0.26,
    palette: { ground: '#4a6b45', dark: '#384f36', light: '#5d8054', deco: '#7fa06a' },
    tint: '#41663f',
    flavor: '蜀道难。山把这块盆地锁起来，锁住的是粮，也是野心。',
  },
  jingzhou: {
    name: '荆州', base: 'plain', accent: 'marsh', density: 0.26,
    palette: { ground: '#5c7a52', dark: '#476343', light: '#6f9064', deco: '#8aa87a' },
    tint: '#506f4b',
    flavor: '江河湖泊把这片地切成很多块，水军比骑兵管用。',
  },
  jiangdong: {
    name: '江东', base: 'farm', accent: 'marsh', density: 0.18,
    palette: { ground: '#5f7f52', dark: '#496640', light: '#75996a', deco: '#8fae74' },
    tint: '#55784c',
    flavor: '水田、河港、还有一支能逆流而上的船队。',
  },
  jiaozhou: {
    name: '交州', base: 'forest', accent: 'marsh', density: 0.2,
    palette: { ground: '#3f6640', dark: '#2f4d2f', light: '#4f7a4c', deco: '#6a9a5a' },
    tint: '#355e33',
    flavor: '瘴气与密林，中原的兵到了这里，先输给天气。',
  },
};

/** 海岸线：y -> 海起始 x（左闭） */
const COAST = [
  [0, 38], [5, 37], [10, 36], [15, 35], [20, 34], [25, 33],
  [30, 34], [35, 35], [38, 36], [42, 34], [44, 32], [47, 30],
];

/** 黄河：西北 -> 东北入海 */
const RIVER_HUANG = [
  [12, 15], [14, 16], [16, 15], [18, 16], [20, 17], [21, 19], [22, 21],
  [23, 22], [25, 21], [27, 20], [29, 19], [31, 18], [33, 16], [35, 14], [36, 13],
];

/** 长江：西南 -> 东入海 */
const RIVER_YANG = [
  [11, 35], [13, 36], [15, 37], [17, 37], [19, 38], [21, 38],
  [23, 39], [25, 39], [26, 38], [27, 38], [29, 37], [31, 36], [33, 35], [35, 34],
];

/** 淮河：中原 -> 东 */
const RIVER_HUAI = [
  [24, 28], [26, 28], [28, 27], [30, 27], [32, 26], [34, 26], [35, 26],
];

/** 山脉折线，每段会加粗 1 格 */
const MOUNTAINS = [
  // 阴山（塞北）
  [[2, 4], [6, 3], [10, 4], [14, 3], [18, 4]],
  // 太行
  [[23, 9], [24, 12], [25, 15], [24, 18], [23, 21]],
  // 吕梁
  [[17, 10], [18, 13], [17, 16], [16, 19]],
  // 秦岭
  [[10, 26], [13, 27], [16, 26], [19, 27], [22, 26]],
  // 大巴
  [[13, 30], [15, 31], [17, 31], [18, 32]],
  // 巫山
  [[18, 33], [19, 35], [19, 37]],
  // 南岭
  [[20, 43], [23, 42], [26, 43], [29, 42]],
  // 武夷
  [[31, 39], [32, 41], [31, 44]],
  // 燕山
  [[26, 6], [30, 5], [34, 6]],
];

/**
 * 据点：紧凑数组 -> 对象
 * [id, 名称, 类型, 势力, x, y, 粮价系数, 守军, 兵种组, 简介]
 */
const SITE_ROWS = [
  // ---- 塞北 / 幽燕 ----
  ['longcheng', '龙城', 'town', 'xianbei', 7, 3, 1.12, 120, 'xianbei', '鲜卑王庭。帐篷连成城，马比人多。'],
  ['tanhanshan', '弹汗山', 'castle', 'xianbei', 13, 5, 1.16, 100, 'xianbei', '轲比能的老营，山后有整片的马场。'],
  ['ji', '蓟', 'town', 'han', 26, 4, 1.05, 110, 'han', '幽州治所，汉家的北门锁钥。'],
  ['xiangping', '襄平', 'town', 'han', 34, 4, 1.02, 90, 'han', '辽东郡治，离中原很远，离塞外很近。'],
  ['beiping', '北平', 'castle', 'xianbei', 31, 7, 1.1, 85, 'xianbei', '长城边上的小堡，鲜卑的骑兵常来借粮。'],
  ['zhuo', '涿', 'village', 'han', 27, 8, 0.74, 14, 'village', '桃园结义的地方。现在只剩几间草屋和一口井。'],
  // ---- 并州 / 冀州 ----
  ['jinyang', '晋阳', 'town', 'yuan', 19, 11, 1.06, 115, 'yuan', '并州治所，铁器与良马都从这里过。'],
  ['shangdang', '上党', 'castle', 'yuan', 23, 13, 1.14, 95, 'yuan', '太行山上的壶关，一夫当关。'],
  ['ye', '邺', 'town', 'yuan', 28, 13, 1.08, 160, 'yuan', '袁本初的都城。铜雀台还没修，粮仓先满了。'],
  ['nanpi', '南皮', 'castle', 'yuan', 31, 11, 1.12, 90, 'yuan', '渤海郡的壁垒，袁家的后院。'],
  ['pingyuan', '平原', 'town', 'yuan', 31, 17, 1.04, 95, 'yuan', '青州北界的粮城，麦子堆到城墙那么高。'],
  ['puyang', '濮阳', 'town', 'wei', 26, 19, 1.06, 105, 'cao', '兖州的旧治，曹操在这里打赢过吕布。'],
  // ---- 关中 ----
  ['changan', '长安', 'town', 'han', 15, 20, 1.1, 140, 'han', '旧都。宫室烧了一半，百官还在。'],
  ['tongguan', '潼关', 'castle', 'han', 17, 20, 1.18, 110, 'han', '关中东门，谁拿到它谁就能关起门来。'],
  ['luoyang', '洛阳', 'town', 'wei', 20, 22, 1.12, 130, 'cao', '董卓烧过一次，如今又有人回来重新点灯。'],
  ['hulao', '虎牢关', 'castle', 'wei', 21, 20, 1.15, 90, 'cao', '洛阳东面的关口。三英战吕布，就在这下面。'],
  // ---- 凉州 ----
  ['wuwei', '武威', 'town', 'ma', 6, 17, 1.04, 100, 'ma', '凉州治所，马市开在城外，一天能换三百匹。'],
  ['jincheng', '金城', 'town', 'ma', 4, 22, 1.06, 85, 'ma', '黄河边上的渡口城，羊皮筏子昼夜不停。'],
  ['tianshui', '天水', 'castle', 'ma', 10, 22, 1.1, 95, 'ma', '陇右的要冲，姜维的老家。'],
  ['longxi', '陇西村', 'village', 'ma', 8, 24, 0.72, 12, 'village', '黄土坡上的村子，家家有马，家家缺粮。'],
  // ---- 中原 ----
  ['chenliu', '陈留', 'town', 'wei', 25, 23, 1.03, 90, 'cao', '曹操起兵的地方。城外全是募兵的木牌。'],
  ['guandu', '官渡', 'castle', 'wei', 22, 24, 1.2, 100, 'cao', '黄河渡口。两军对峙的时候，这里连水都贵。'],
  ['xuchang', '许昌', 'town', 'wei', 25, 27, 1.08, 170, 'cao', '曹操把天子接来以后，这里就是朝廷。'],
  ['qiao', '谯', 'village', 'wei', 27, 25, 0.75, 16, 'village', '曹氏与夏侯氏的祖宅所在，村口有棵老槐树。'],
  ['runan', '汝南', 'village', 'wei', 23, 30, 0.76, 14, 'village', '袁氏的故里，如今只剩族谱和荒田。'],
  // ---- 徐州 / 淮南 ----
  ['xiapi', '下邳', 'town', 'lv', 31, 24, 1.1, 150, 'lv', '吕布守着这座城。泗水绕着城墙流，水能灌进来。'],
  ['xiaopei', '小沛', 'castle', 'lv', 29, 23, 1.12, 80, 'lv', '刘备借住过的地方，现在插着吕字旗。'],
  ['pengcheng', '彭城', 'village', 'lv', 30, 21, 0.78, 15, 'village', '徐州旧治的残垣，集市还开在墙根下。'],
  ['shouchun', '寿春', 'town', null, 29, 28, 1.05, 80, 'none', '淮南的粮仓，眼下没有主人，谁先到谁拿。'],
  // ---- 荆州 ----
  ['wan', '宛', 'town', 'biao', 22, 30, 1.05, 105, 'biao', '南阳郡治，铁官与作坊都在这。'],
  ['xinye', '新野', 'castle', 'shu', 22, 33, 1.08, 85, 'shu', '刘备屯兵的小城。城不大，人心很齐。'],
  ['xiangyang', '襄阳', 'town', 'biao', 23, 35, 1.09, 150, 'biao', '刘表的治所。城墙临汉水，商船排到江心。'],
  ['jiangling', '江陵', 'town', 'biao', 23, 39, 1.06, 110, 'biao', '荆州的粮仓与船坞，南郡的命门。'],
  ['xiakou', '夏口', 'castle', 'wu', 27, 36, 1.14, 90, 'wu', '汉水入江处。谁在这里扎营，谁就卡住了荆州。'],
  ['chaisang', '柴桑', 'town', 'wu', 28, 38, 1.06, 95, 'wu', '江东的水军基地，船比房子多。'],
  ['chibi', '赤壁', 'castle', null, 26, 38, 1.16, 70, 'none', '江边的石壁。风从东南来，火能烧到对岸。'],
  ['yiling', '夷陵', 'castle', null, 24, 41, 1.12, 75, 'none', '三峡的出口。连营七百里，说的就是这一线。'],
  // ---- 益州 ----
  ['hanzhong', '汉中', 'town', 'zhang', 16, 29, 1.04, 105, 'zhang', '秦岭与巴山之间的粮仓，五斗米道的地盘。'],
  ['jiange', '剑阁', 'castle', 'zhang', 16, 32, 1.18, 100, 'zhang', '一夫当关，万夫莫开。说的不是城，是那条路。'],
  ['chengdu', '成都', 'town', 'zhang', 11, 35, 1.07, 160, 'zhang', '益州治所。锦官城的织机声，隔一条街都听得见。'],
  ['jiangzhou', '江州', 'town', 'zhang', 14, 38, 1.05, 90, 'zhang', '巴郡的水码头，盐船从这里下行。'],
  ['baxi', '巴西村', 'village', 'zhang', 13, 34, 0.73, 13, 'village', '山坳里的村子，出产賨人和好弓。'],
  // ---- 江东 ----
  ['jianye', '建业', 'town', 'wu', 33, 32, 1.08, 160, 'wu', '孙权的新都。钟山脚下，江面宽得看不到对岸。'],
  ['wujun', '吴', 'town', 'wu', 34, 36, 1.06, 120, 'wu', '吴郡。世家大族在这，船坞也在这。'],
  ['kuaiji', '会稽', 'town', 'wu', 34, 40, 1.05, 110, 'wu', '东南的海盐与稻米，一半从这会稽出去。'],
  ['danyang', '丹阳村', 'village', 'wu', 31, 33, 0.76, 15, 'village', '出精兵的地方。山越与汉人混着住。'],
  // ---- 交州 ----
  ['jiaozhi', '交趾', 'town', null, 24, 46, 1.02, 70, 'none', '最南边的郡城。中原的官来了先病三个月。'],
  ['changsha', '长沙村', 'village', null, 23, 42, 0.74, 12, 'village', '湘水边的稻村，孙刘两家都来征过粮。'],
  ['guiyang', '桂阳村', 'village', null, 26, 44, 0.72, 11, 'village', '五岭以南的小村，出锡，也出土话。'],
  // ---- 匪巢 ----
  ['heishan', '黑山营', 'camp', 'bandit', 24, 16, 0, 45, 'bandit', '太行山里的黄巾余部，张燕带着几万人钻山沟。'],
  ['taishan', '泰山寇', 'camp', 'bandit', 32, 19, 0, 38, 'bandit', '泰山周边的山贼，专抢青徐之间的粮队。'],
  ['baibo', '白波谷', 'camp', 'bandit', 18, 17, 0, 40, 'bandit', '白波黄巾的老巢，谷口只容两人并行。'],
  ['mizei', '米贼寨', 'camp', 'bandit', 14, 30, 0, 35, 'bandit', '汉中山里的五斗米道分坛，也收过路钱。'],
  ['poyang', '鄱阳贼', 'camp', 'bandit', 30, 41, 0, 36, 'bandit', '鄱阳湖上的水贼，抢船不抢村。'],
  ['nanzhong', '南中夷寨', 'camp', 'bandit', 16, 42, 0, 42, 'bandit', '南中的部落武装，孟获的远亲在这。'],
];

/** 兵种组 */
const RECRUIT_SETS = {
  cao: ['militia', 'spear', 'crossbow', 'guard'],
  cao2: ['militia', 'crossbow', 'cav', 'heavy'],
  shu: ['militia', 'spear', 'archer', 'baier'],
  shu2: ['militia', 'archer', 'wudang', 'cav'],
  wu: ['militia', 'archer', 'boat', 'huochuan'],
  wu2: ['militia', 'cav', 'qishe', 'danyang'],
  yuan: ['militia', 'spear', 'cav', 'heavy'],
  lv: ['militia', 'spear', 'cav', 'tiefu'],
  biao: ['militia', 'spear', 'archer', 'cav'],
  zhang: ['militia', 'spear', 'archer', 'wudang'],
  xianbei: ['militia', 'qishe', 'xianbei', 'tengri'],
  ma: ['militia', 'spear', 'qishe', 'tiefu'],
  han: ['militia', 'spear', 'crossbow', 'jinjun'],
  none: ['militia', 'spear'],
  village: ['militia'],
  bandit: [],
};

/** 道路连线 */
const ROADS = [
  ['longcheng', 'tanhanshan'], ['tanhanshan', 'ji'], ['ji', 'zhuo'], ['zhuo', 'beiping'],
  ['beiping', 'xiangping'], ['ji', 'nanpi'], ['nanpi', 'ye'], ['ye', 'shangdang'],
  ['shangdang', 'jinyang'], ['jinyang', 'puyang'], ['ye', 'pingyuan'], ['pingyuan', 'puyang'],
  ['puyang', 'chenliu'], ['chenliu', 'guandu'], ['guandu', 'hulao'], ['hulao', 'luoyang'],
  ['luoyang', 'tongguan'], ['tongguan', 'changan'], ['changan', 'tianshui'], ['tianshui', 'longxi'],
  ['longxi', 'jincheng'], ['jincheng', 'wuwei'], ['tianshui', 'hanzhong'], ['hanzhong', 'jiange'],
  ['jiange', 'baxi'], ['baxi', 'chengdu'], ['chengdu', 'jiangzhou'], ['jiangzhou', 'yiling'],
  ['chenliu', 'xuchang'], ['xuchang', 'qiao'], ['xuchang', 'runan'], ['runan', 'wan'],
  ['wan', 'xinye'], ['xinye', 'xiangyang'], ['xiangyang', 'jiangling'], ['jiangling', 'yiling'],
  ['yiling', 'chibi'], ['chibi', 'chaisang'], ['chaisang', 'xiakou'], ['xiakou', 'jiangling'],
  ['xuchang', 'shouchun'], ['shouchun', 'xiaopei'], ['xiaopei', 'xiapi'], ['xiapi', 'pengcheng'],
  ['pengcheng', 'taishan'], ['xiapi', 'danyang'], ['danyang', 'jianye'], ['jianye', 'wujun'],
  ['wujun', 'kuaiji'], ['jianye', 'chaisang'], ['chaisang', 'poyang'], ['poyang', 'changsha'],
  ['changsha', 'guiyang'], ['guiyang', 'jiaozhi'], ['changsha', 'yiling'], ['hanzhong', 'heishan'],
  ['heishan', 'ye'], ['baibo', 'luoyang'], ['mizei', 'hanzhong'], ['nanzhong', 'jiaozhi'],
  ['taishan', 'pingyuan'],
];

/** 势力 */
const FACTIONS = {
  wei: {
    id: 'wei', name: '魏', full: '曹操', color: '#3f6fa8', banner: '曹',
    lord: '曹操', desc: '奉天子以令不臣。屯田、募兵、用法度，最强的那个。',
  },
  shu: {
    id: 'shu', name: '蜀', full: '刘备', color: '#4f8f5a', banner: '刘',
    lord: '刘备', desc: '半生寄人篱下，靠一个“义”字聚人。兵少，但肯跟你走。',
  },
  wu: {
    id: 'wu', name: '吴', full: '孙权', color: '#b06a3c', banner: '孙',
    lord: '孙权', desc: '据长江之险，水军天下第一。守成有余，进取不足。',
  },
  yuan: {
    id: 'yuan', name: '袁', full: '袁绍', color: '#8c6fae', banner: '袁',
    lord: '袁绍', desc: '四世三公，兵多粮足。只是号令出自三门，谁也不服谁。',
  },
  lv: {
    id: 'lv', name: '吕', full: '吕布', color: '#a8433a', banner: '吕',
    lord: '吕布', desc: '人中吕布，马中赤兔。骁勇无谋，反复无常。',
  },
  biao: {
    id: 'biao', name: '刘', full: '刘表', color: '#6a8f8a', banner: '表',
    lord: '刘表', desc: '守荆州二十年，不动如山。老了，也不想动了。',
  },
  zhang: {
    id: 'zhang', name: '璋', full: '刘璋', color: '#8a8a52', banner: '璋',
    lord: '刘璋', desc: '益州天府，闭门自守。兵不少，将不多。',
  },
  xianbei: {
    id: 'xianbei', name: '鲜卑', full: '轲比能', color: '#7a6a4a', banner: '鲜',
    lord: '轲比能', desc: '控弦十万，来去如风。不筑城，只抢城。',
  },
  ma: {
    id: 'ma', name: '凉', full: '马腾', color: '#a5824a', banner: '马',
    lord: '马腾', desc: '西凉铁骑，天下精锐。粮少，人心散。',
  },
  han: {
    id: 'han', name: '汉', full: '汉廷', color: '#8f8f86', banner: '汉',
    lord: '刘协', desc: '名义上的天下共主。诏书还在，兵没了。',
  },
  bandit: {
    id: 'bandit', name: '贼', full: '黄巾余部', color: '#8b3a3a', banner: '贼',
    lord: '无', desc: '黄巾散了，人还在山里。所有人的敌人。',
  },
  // 自立之后：你自己的那面旗，只在玩家手下有领主时才用到
  player: {
    id: 'player', name: '我', full: '你的旗', color: '#d9a441', banner: '我',
    lord: '你', desc: '没站在任何人后面。旗是旧的，字是新写的。',
  },
};

/**
 * 领主 NPC
 * soldiers 为初始兵力模板，home 为驻地
 */
const LORDS = [
  { id: 'caocao', name: '曹操', faction: 'wei', home: 'xuchang', soldiers: { militia: 60, spear: 70, crossbow: 40, cav: 30, guard: 12 }, morale: 92, sight: 7, title: '魏公' },
  { id: 'xiahou', name: '夏侯惇', faction: 'wei', home: 'luoyang', soldiers: { militia: 40, spear: 50, crossbow: 25, cav: 20 }, morale: 86, sight: 7, title: '建武将军' },
  { id: 'zhangliao', name: '张辽', faction: 'wei', home: 'guandu', soldiers: { militia: 30, spear: 40, cav: 35, guard: 8 }, morale: 88, sight: 8, title: '中郎将' },
  { id: 'liubei', name: '刘备', faction: 'shu', home: 'xinye', soldiers: { militia: 45, spear: 35, archer: 25, baier: 8 }, morale: 95, sight: 7, title: '左将军' },
  { id: 'guanyu', name: '关羽', faction: 'shu', home: 'xinye', soldiers: { militia: 20, spear: 40, cav: 25, baier: 10 }, morale: 95, sight: 8, title: '偏将军' },
  { id: 'zhangfei', name: '张飞', faction: 'shu', home: 'xinye', soldiers: { militia: 25, spear: 45, cav: 20 }, morale: 94, sight: 6, title: '别部司马' },
  { id: 'sunquan', name: '孙权', faction: 'wu', home: 'jianye', soldiers: { militia: 70, archer: 50, boat: 40, huochuan: 10 }, morale: 90, sight: 7, title: '讨虏将军' },
  { id: 'zhouyu', name: '周瑜', faction: 'wu', home: 'chaisang', soldiers: { militia: 30, archer: 45, boat: 35, huochuan: 15 }, morale: 92, sight: 8, title: '水军都督' },
  { id: 'taishici', name: '太史慈', faction: 'wu', home: 'wujun', soldiers: { militia: 25, archer: 30, cav: 25, danyang: 10 }, morale: 88, sight: 7, title: '建昌都尉' },
  { id: 'yuanshao', name: '袁绍', faction: 'yuan', home: 'ye', soldiers: { militia: 100, spear: 90, cav: 50, heavy: 10 }, morale: 80, sight: 7, title: '大将军' },
  { id: 'yanliang', name: '颜良', faction: 'yuan', home: 'pingyuan', soldiers: { militia: 40, spear: 50, cav: 35 }, morale: 82, sight: 7, title: '骑都尉' },
  { id: 'lvbu', name: '吕布', faction: 'lv', home: 'xiapi', soldiers: { spear: 40, cav: 45, tiefu: 25, guard: 10 }, morale: 90, sight: 8, title: '徐州牧' },
  { id: 'gaoshun', name: '高顺', faction: 'lv', home: 'xiaopei', soldiers: { spear: 60, guard: 15 }, morale: 88, sight: 6, title: '中郎将' },
  { id: 'liubiao', name: '刘表', faction: 'biao', home: 'xiangyang', soldiers: { militia: 70, spear: 55, archer: 30 }, morale: 76, sight: 6, title: '荆州牧' },
  { id: 'caimao', name: '蔡瑁', faction: 'biao', home: 'jiangling', soldiers: { militia: 40, archer: 30, boat: 20 }, morale: 72, sight: 6, title: '水军统领' },
  { id: 'liuzhang', name: '刘璋', faction: 'zhang', home: 'chengdu', soldiers: { militia: 80, spear: 60, archer: 35 }, morale: 74, sight: 6, title: '益州牧' },
  { id: 'zhangren', name: '张任', faction: 'zhang', home: 'jiange', soldiers: { militia: 40, spear: 45, archer: 25 }, morale: 84, sight: 7, title: '从事' },
  { id: 'kebineng', name: '轲比能', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 80, qishe: 40, xianbei: 30, tengri: 12 }, morale: 86, sight: 9, title: '鲜卑单于' },
  { id: 'mateng', name: '马腾', faction: 'ma', home: 'wuwei', soldiers: { militia: 30, spear: 50, qishe: 30, tiefu: 15 }, morale: 82, sight: 8, title: '征西将军' },
  { id: 'machao', name: '马超', faction: 'ma', home: 'tianshui', soldiers: { cav: 45, tiefu: 25, qishe: 20 }, morale: 90, sight: 9, title: '偏将军' },
  { id: 'huangfusong', name: '皇甫嵩', faction: 'han', home: 'changan', soldiers: { militia: 40, spear: 40, crossbow: 25, jinjun: 6 }, morale: 74, sight: 6, title: '车骑将军' },
  // ---- 魏：宗亲与五子 ----
  { id: 'caoren', name: '曹仁', faction: 'wei', home: 'puyang', soldiers: { spear: 45, crossbow: 25, cav: 20, guard: 8 }, morale: 86, sight: 7, title: '征南将军' },
  { id: 'xiahouyuan', name: '夏侯渊', faction: 'wei', home: 'tongguan', soldiers: { cav: 35, spear: 30, crossbow: 20 }, morale: 88, sight: 8, title: '征西将军' },
  { id: 'xuhuang', name: '徐晃', faction: 'wei', home: 'shangdang', soldiers: { spear: 50, crossbow: 25, militia: 20 }, morale: 87, sight: 7, title: '平寇将军' },
  { id: 'zhanghe', name: '张郃', faction: 'wei', home: 'jinyang', soldiers: { cav: 30, spear: 40, crossbow: 20 }, morale: 84, sight: 8, title: '荡寇将军' },
  { id: 'xuchu', name: '许褚', faction: 'wei', home: 'chenliu', soldiers: { militia: 30, spear: 30, guard: 20 }, morale: 90, sight: 6, title: '虎卫' },
  { id: 'litong', name: '李通', faction: 'wei', home: 'runan', soldiers: { militia: 35, spear: 25, cav: 15 }, morale: 78, sight: 6, title: '裨将军' },
  // ---- 蜀：荆益之间 ----
  { id: 'zhaoyun', name: '赵云', faction: 'shu', home: 'hanzhong', soldiers: { cav: 30, spear: 35, baier: 12 }, morale: 92, sight: 8, title: '牙门将军' },
  { id: 'huangzhong', name: '黄忠', faction: 'shu', home: 'jiangling', soldiers: { archer: 40, spear: 30, militia: 20 }, morale: 90, sight: 7, title: '中郎将' },
  { id: 'weiyan', name: '魏延', faction: 'shu', home: 'hanzhong', soldiers: { spear: 40, militia: 30, cav: 15 }, morale: 86, sight: 7, title: '牙门将军' },
  { id: 'chendao', name: '陈到', faction: 'shu', home: 'jiangzhou', soldiers: { spear: 35, baier: 15, militia: 20 }, morale: 88, sight: 6, title: '白毦统领' },
  { id: 'liufeng', name: '刘封', faction: 'shu', home: 'baxi', soldiers: { militia: 35, spear: 25, cav: 12 }, morale: 80, sight: 6, title: '副军中郎将' },
  { id: 'mizhu', name: '糜竺', faction: 'shu', home: 'chengdu', soldiers: { militia: 30, spear: 20, archer: 15 }, morale: 72, sight: 5, title: '别从事' },
  // ---- 吴：四都督与老将 ----
  { id: 'ganning', name: '甘宁', faction: 'wu', home: 'xiakou', soldiers: { militia: 25, archer: 30, boat: 25, danyang: 12 }, morale: 90, sight: 8, title: '折冲将军' },
  { id: 'lvmeng', name: '吕蒙', faction: 'wu', home: 'chaisang', soldiers: { militia: 30, archer: 35, boat: 25 }, morale: 88, sight: 7, title: '横野中郎将' },
  { id: 'luxun', name: '陆逊', faction: 'wu', home: 'wujun', soldiers: { militia: 35, spear: 30, archer: 20 }, morale: 85, sight: 7, title: '镇西将军' },
  { id: 'chengpu', name: '程普', faction: 'wu', home: 'kuaiji', soldiers: { militia: 30, archer: 25, boat: 25 }, morale: 84, sight: 6, title: '荡寇中郎将' },
  { id: 'handang', name: '韩当', faction: 'wu', home: 'jianye', soldiers: { archer: 30, cav: 20, boat: 20 }, morale: 83, sight: 7, title: '偏将军' },
  // ---- 袁：河北诸将 ----
  { id: 'wenchou', name: '文丑', faction: 'yuan', home: 'pingyuan', soldiers: { cav: 35, spear: 35, militia: 20 }, morale: 82, sight: 7, title: '骑将' },
  { id: 'chunyuqiong', name: '淳于琼', faction: 'yuan', home: 'zhuo', soldiers: { militia: 40, spear: 25, archer: 15 }, morale: 70, sight: 5, title: '督军' },
  { id: 'jiangyiqu', name: '蒋义渠', faction: 'yuan', home: 'beiping', soldiers: { militia: 35, spear: 30, cav: 10 }, morale: 72, sight: 6, title: '校尉' },
  { id: 'guotu', name: '郭图', faction: 'yuan', home: 'ye', soldiers: { militia: 30, spear: 20, archer: 15 }, morale: 68, sight: 5, title: '谋士' },
  { id: 'lvkuang', name: '吕旷', faction: 'yuan', home: 'ji', soldiers: { spear: 30, cav: 15, militia: 20 }, morale: 70, sight: 6, title: '校尉' },
  { id: 'lvxiang', name: '吕翔', faction: 'yuan', home: 'nanpi', soldiers: { spear: 25, cav: 15, militia: 20 }, morale: 70, sight: 6, title: '校尉' },
  // ---- 吕：徐州旧部 ----
  { id: 'chengong', name: '陈宫', faction: 'lv', home: 'xiapi', soldiers: { militia: 35, spear: 25, crossbow: 15 }, morale: 74, sight: 6, title: '军师' },
  { id: 'houcheng', name: '侯成', faction: 'lv', home: 'xiaopei', soldiers: { militia: 25, cav: 20, spear: 15 }, morale: 70, sight: 6, title: '骑都尉' },
  { id: 'songxian', name: '宋宪', faction: 'lv', home: 'pengcheng', soldiers: { militia: 25, spear: 20, cav: 12 }, morale: 68, sight: 6, title: '校尉' },
  { id: 'weixu', name: '魏续', faction: 'lv', home: 'pengcheng', soldiers: { militia: 25, spear: 20, cav: 10 }, morale: 68, sight: 6, title: '校尉' },
  // ---- 荆：守江的人 ----
  { id: 'huangzu', name: '黄祖', faction: 'biao', home: 'xiakou', soldiers: { militia: 35, archer: 25, boat: 20 }, morale: 70, sight: 6, title: '江夏太守' },
  { id: 'wenpin', name: '文聘', faction: 'biao', home: 'xiangyang', soldiers: { militia: 30, spear: 30, archer: 15 }, morale: 78, sight: 6, title: '大将' },
  { id: 'zhangyun', name: '张允', faction: 'biao', home: 'jiangling', soldiers: { militia: 25, archer: 20, boat: 25 }, morale: 68, sight: 5, title: '水军副将' },
  { id: 'wangwei', name: '王威', faction: 'biao', home: 'wan', soldiers: { militia: 25, spear: 25, archer: 10 }, morale: 72, sight: 6, title: '牙门将' },
  // ---- 益：蜀中诸将 ----
  { id: 'wuyi', name: '吴懿', faction: 'zhang', home: 'baxi', soldiers: { spear: 30, militia: 30, archer: 10 }, morale: 76, sight: 6, title: '中郎将' },
  { id: 'leitong', name: '雷铜', faction: 'zhang', home: 'jiangzhou', soldiers: { militia: 30, spear: 25, archer: 10 }, morale: 74, sight: 6, title: '裨将' },
  { id: 'lengbao', name: '冷苞', faction: 'zhang', home: 'jiange', soldiers: { spear: 25, militia: 25, crossbow: 10 }, morale: 72, sight: 6, title: '裨将' },
  { id: 'liugui', name: '刘璝', faction: 'zhang', home: 'chengdu', soldiers: { militia: 30, spear: 25, archer: 15 }, morale: 74, sight: 6, title: '中郎将' },
  // ---- 鲜卑：塞外诸部 ----
  { id: 'suli', name: '素利', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 40, qishe: 20, xianbei: 10 }, morale: 80, sight: 8, title: '东部大人' },
  { id: 'mijia', name: '弥加', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 35, qishe: 20 }, morale: 78, sight: 8, title: '部帅' },
  { id: 'queji', name: '阙机', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 30, qishe: 25 }, morale: 76, sight: 7, title: '部帅' },
  { id: 'huaitou', name: '槐头', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 30, qishe: 15, xianbei: 8 }, morale: 78, sight: 7, title: '小帅' },
  { id: 'pufulu', name: '普富卢', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 35, qishe: 20, xianbei: 6 }, morale: 76, sight: 7, title: '代郡大人' },
  // ---- 西凉：马家的兵 ----
  { id: 'pangde', name: '庞德', faction: 'ma', home: 'jincheng', soldiers: { cav: 30, tiefu: 18, spear: 25 }, morale: 90, sight: 8, title: '校尉' },
  { id: 'maxiu', name: '马休', faction: 'ma', home: 'wuwei', soldiers: { cav: 25, spear: 25, militia: 20 }, morale: 78, sight: 7, title: '奉车都尉' },
  { id: 'matie', name: '马铁', faction: 'ma', home: 'longxi', soldiers: { cav: 25, spear: 20, militia: 20 }, morale: 78, sight: 7, title: '骑都尉' },
  { id: 'chengyin', name: '程银', faction: 'ma', home: 'jincheng', soldiers: { cav: 25, spear: 20, qishe: 10 }, morale: 74, sight: 7, title: '校尉' },
  // ---- 汉：关中残军 ----
  { id: 'zhujun', name: '朱儁', faction: 'han', home: 'luoyang', soldiers: { militia: 35, spear: 30, crossbow: 15, jinjun: 5 }, morale: 78, sight: 6, title: '右中郎将' },
  { id: 'luzhi', name: '卢植', faction: 'han', home: 'zhuo', soldiers: { militia: 30, spear: 30, crossbow: 20 }, morale: 80, sight: 6, title: '北中郎将' },
  { id: 'dongcheng', name: '董承', faction: 'han', home: 'changan', soldiers: { militia: 25, spear: 20, guard: 10 }, morale: 72, sight: 5, title: '车骑将军' },
  { id: 'yangfeng', name: '杨奉', faction: 'han', home: 'hulao', soldiers: { militia: 30, cav: 15, spear: 15 }, morale: 70, sight: 6, title: '兴义将军' },
  { id: 'zhongji', name: '种辑', faction: 'han', home: 'changan', soldiers: { militia: 25, spear: 20, guard: 8 }, morale: 68, sight: 5, title: '越骑校尉' },
];

/** 声望等级 */
const RENOWN_TIERS = [
  { at: 0, name: '溃兵之首' },
  { at: 40, name: '一方游侠' },
  { at: 100, name: '小有威名' },
  { at: 200, name: '郡国校尉' },
  { at: 350, name: '一方诸侯' },
  { at: 550, name: '天下名将' },
];

/** 装备：沿用三档，改三国名目 */
const EQUIPMENT = {
  blade: {
    slot: 'blade', name: '兵刃',
    tiers: [
      { id: 'blade0', name: '环首刀', price: 0, atkPct: 0, desc: '洛阳溃兵身上仅剩的制式刀。' },
      { id: 'blade1', name: '百炼钢刀', price: 260, atkPct: 0.09, desc: '战团攻击 +9%。' },
      { id: 'blade2', name: '青龙长刀', price: 640, atkPct: 0.18, desc: '战团攻击 +18%。' },
    ],
  },
  armor: {
    slot: 'armor', name: '甲胄',
    tiers: [
      { id: 'armor0', name: '皮甲', price: 0, defPct: 0, desc: '挡不住弩，但比布衣强。' },
      { id: 'armor1', name: '玄铁札甲', price: 320, defPct: 0.11, desc: '战团防御 +11%。' },
      { id: 'armor2', name: '明光铠', price: 780, defPct: 0.2, desc: '战团防御 +20%，行军略慢。' },
    ],
  },
  horse: {
    slot: 'horse', name: '坐骑',
    tiers: [
      { id: 'horse0', name: '驮马', price: 0, speedPct: 0, desc: '能驮粮，不能冲阵。' },
      { id: 'horse1', name: '西凉马', price: 380, speedPct: 0.15, desc: '行军速度 +15%。' },
      { id: 'horse2', name: '赤兔', price: 900, speedPct: 0.3, desc: '行军速度 +30%，包抄更致命。' },
    ],
  },
};

/** 史简：能改一次战局的一句话 */
const HISTORY_MARKS = {
  wind: {
    id: 'wind', name: '南风起', text: '你写下“南风起”，风真的转了向。',
    desc: '本场我方攻击 +45%，火攻类战斗额外 +25%。',
  },
  calm: {
    id: 'calm', name: '风止', text: '你写下“风止”，风停了，火也停了。',
    desc: '双方攻击 -35%，持续 3 回合。少死很多人。',
  },
  roll: {
    id: 'roll', name: '名册', text: '你写下阵亡者的名字，他们又站了起来。',
    desc: '战后本场阵亡的我方士兵回归 35%。',
  },
};

/**
 * 战役链：章节按顺序推进
 * check 为状态键，由 core/campaign.js 判定
 */
const CAMPAIGN = [
  {
    id: 'prologue', title: '序章 · 洛阳溃兵',
    goal: '带上剩下的几名弟兄，活着抵达陈留',
    story: '洛阳城破那夜，你只带出九个人，往东跑。身后是西凉铁骑，脚下是结冰的护城河。\n你不是要赢，你只是要过桥。',
    check: 'reach_chenliu',
    reward: { renown: 20, shi: 1 },
    after: '过桥的时候还剩八个。你数了两遍，怕漏了谁。',
  },
  {
    id: 'act1', title: '第一幕 · 陈留募兵',
    goal: '在陈留把队伍扩到 30 人',
    story: '陈留城外插满了募兵的木牌。曹操在招人，刘备在招人，孙策的使者也在。\n谁给粮，你跟谁走。',
    check: 'troops_30',
    reward: { renown: 30, shi: 1, banner: true },
    after: '你有了第一面自己的旗。旗是旧的，字是新写的。',
  },
  {
    id: 'act1b', title: '幕间 · 濮阳城外的粮车',
    goal: '带 45 人去濮阳，打退抢粮的黄巾余部',
    story: '濮阳的粮车被黄巾余部截在城外。守军不敢出城，只肯在城头上看着。\n你手下三十来号人，多是新募的农夫。这一仗不大，但够他们见血。',
    check: 'win_puyang',
    reward: { renown: 35, gold: 160, food: 40 },
    after: '粮车推进了城。守军分你一半，剩下的他们留下过冬。',
  },
  {
    id: 'act1c', title: '幕间 · 陈留整军',
    goal: '把队伍扩到 60 人，粮草备足 80',
    story: '连着两仗，队伍里多了几张生面孔。陈留的校场上，你按十人一队重新编伍。\n乌巢在北边，路上尽是袁军的游骑。人不够、粮不够，去了就是送。',
    check: 'troops_60_food',
    reward: { renown: 40, gold: 200, food: 30 },
    after: '六十人站成六行。你把旗插在校场中央，第一次觉得这面旗有分量。',
  },
  {
    id: 'act2', title: '第二幕 · 官渡 · 乌巢夜袭',
    goal: '带 90 人以上抵近官渡，烧掉袁军的粮囤',
    story: '淳于琼嗜酒。今夜他帐里的灯亮到三更。\n粮囤十二座，堆在最西边的那座是主仓。你的马都上了嚼子，不许出声。',
    check: 'win_wuchao',
    reward: { renown: 60, shi: 1, gold: 300 },
    after: '火顺着风烧了半夜。第二天，袁军的营里没有炊烟。',
  },
  {
    id: 'act3', title: '第三幕 · 下邳 · 白门楼',
    goal: '攻下下邳，处理吕布',
    story: '泗水被断了，城墙泡在水里。云梯队已经搭上城头。\n城门开了，吕布带五十骑冲出来。',
    check: 'take_xiapi',
    reward: { renown: 80, shi: 1 },
    after: '白门楼上风很大。你做了那个决定，后来很多年都有人提起。',
  },
  {
    id: 'act4', title: '第四幕 · 赤壁',
    goal: '抵近赤壁，火烧连环船',
    story: '八艘火船靠上去。风向不对，火会往自己这边烧。\n江面上全是铁链连起来的船，像一条不会动的城。',
    check: 'win_chibi',
    reward: { renown: 100, shi: 1 },
    after: '火烧到天亮。江面漂着一层焦木，和一层没烧完的旗。',
  },
  {
    id: 'act5', title: '第五幕 · 夷陵 · 连营七百里',
    goal: '抵近夷陵，破连营',
    story: '四十座营寨一线排开，从江边排到山脚。\n你先点的火。火顺着风一路烧过去，把四十座营连成一条。',
    check: 'win_yiling',
    reward: { renown: 120, shi: 1 },
    after: '火是从东边烧起来的。烧到第七座营的时候，你看见了熟人的旗。',
  },
  {
    id: 'final', title: '终幕 · 定稿之战',
    goal: '兵过 250，在任一都城与无旗亲军决战',
    story: '三方残余都到了。还有一支没有旗号的亲军，全员重甲，不溃不退。\n史书最后由谁来写，看这一仗。',
    check: 'win_final',
    reward: { renown: 200 },
    after: '你放下了笔。纸上只有一行字，墨还没干。',
  },
];

/** 结局判定文案 */
const ENDINGS = {
  ding: {
    title: '定稿', text: '天下归一。你封了侯，食邑三千户。\n但你的名字，不进任何一块碑。',
  },
  xu: {
    title: '续史', text: '没有正统，也没有太平。\n可你护住的那本名册，一个名字都没少。',
  },
  fen: {
    title: '焚史', text: '你烧掉了所有史简。\n从此谁也定不了谁，地图永远乱，你的兵永远不缺。',
  },
  self: {
    title: '自立', text: '你没站在任何人后面。\n这一页是你自己写的，写得好不好，也没人改了。',
  },
};

/** 战斗战场地名（用于战报文案） */
const BATTLE_SITES = ['河滩', '断桥', '麦田', '山道', '城门', '江岸', '营地', '林口'];

module.exports = {
  BASE_W,
  BASE_H,
  MAP_W,
  MAP_H,
  TERRAIN,
  REGIONS,
  COAST,
  RIVER_HUANG,
  RIVER_YANG,
  RIVER_HUAI,
  MOUNTAINS,
  SITE_ROWS,
  RECRUIT_SETS,
  ROADS,
  FACTIONS,
  LORDS,
  RENOWN_TIERS,
  EQUIPMENT,
  HISTORY_MARKS,
  CAMPAIGN,
  ENDINGS,
  BATTLE_SITES,
};
