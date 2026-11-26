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
// 天下再放大一倍：城与城之间至少拉开两倍路程，领主再多也有地方跑
const MAP_W = 128;
const MAP_H = 154;

/** 地形：cost 影响寻路，hours 为越过一格的游戏小时 */
const TERRAIN = {
  plain: { id: 'plain', name: '原野', cost: 1.0, passable: true, hours: 2.0 },
  farm: { id: 'farm', name: '农田', cost: 0.95, passable: true, hours: 1.9 },
  road: { id: 'road', name: '道路', cost: 0.6, passable: true, hours: 1.3 },
  forest: { id: 'forest', name: '林地', cost: 1.5, passable: true, hours: 2.9 },
  marsh: { id: 'marsh', name: '沼泽', cost: 2.2, passable: true, hours: 4.3 },
  hills: { id: 'hills', name: '丘陵', cost: 1.8, passable: true, hours: 3.4 },
  foothill: { id: 'foothill', name: '山麓', cost: 1.7, passable: true, hours: 3.2 },
  mountain: { id: 'mountain', name: '山地', cost: 99, passable: false, hours: 99 },
  pass: { id: 'pass', name: '山口', cost: 1.9, passable: true, hours: 3.5 },
  river: { id: 'river', name: '涉水', cost: 2.4, passable: true, hours: 4.6 },
  bridge: { id: 'bridge', name: '桥梁', cost: 0.55, passable: true, hours: 1.1 },
  desert: { id: 'desert', name: '戈壁', cost: 1.55, passable: true, hours: 3.1 },
  oasis: { id: 'oasis', name: '绿洲', cost: 1.0, passable: true, hours: 1.8 },
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

/** 渭水：关中 -> 黄河 */
const RIVER_WEI = [
  [10, 20], [12, 20], [14, 20], [16, 21], [18, 21], [20, 22], [22, 22],
];

/** 汉水：汉中 -> 江汉 */
const RIVER_HAN = [
  [13, 31], [15, 32], [17, 33], [19, 34], [22, 35], [25, 36], [27, 36], [29, 37],
];

/** 山脉折线，每段会按宽度刷出连绵山体 */
const MOUNTAINS = [
  // 阴山（塞北）
  [[2, 4], [6, 3], [10, 4], [14, 3], [18, 4]],
  // 贺兰山
  [[5, 8], [6, 11], [7, 15]],
  // 祁连山
  [[2, 12], [4, 15], [6, 18], [8, 19]],
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
  // 衡山
  [[24, 39], [26, 41], [28, 40]],
  // 武夷
  [[31, 39], [32, 41], [31, 44]],
  // 会稽山
  [[31, 36], [33, 38], [35, 39]],
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
  ['juyan', '居延', 'town', 'ma', 5, 9, 1.08, 95, 'ma', '居延塞。弱水从城下绕过，往北是草原，往南是河西。马腾在这里放牧养马，与汉廷、韩遂都不接壤。'],
  ['ji', '蓟', 'town', 'gongsun', 26, 4, 1.05, 110, 'gongsun', '幽州治所。公孙瓒的白马义从在城外列阵，旌旗一色皆白。'],
  ['xiangping', '襄平', 'town', 'gongsun', 34, 4, 1.02, 90, 'gongsun', '辽东郡治，离中原很远，离塞外很近。公孙氏据城自守，城门上挂着白旗。'],
  ['beiping', '北平', 'castle', 'gongsun', 31, 7, 1.1, 85, 'gongsun', '右北平的边堡。公孙家的白马常从这里出塞。'],
  ['zhuo', '涿', 'village', 'gongsun', 27, 8, 0.74, 14, 'village', '桃园结义的地方。现在归了公孙瓒，村口插着一面白旗。'],
  ['fanyang', '范阳', 'town', 'gongsun', 27, 10, 1.05, 95, 'gongsun', '涿郡与邺城之间的驿城，北来粮车在这里换马，南来驿使在这里过夜。'],
  // ---- 并州 / 冀州 ----
  ['jinyang', '晋阳', 'town', 'yuan', 19, 11, 1.06, 115, 'yuan', '并州治所，铁器与良马都从这里过。'],
  ['yanmen', '雁门', 'castle', 'yuan', 16, 8, 1.12, 90, 'yuan', '雁门关。北出塞外，南护太原，山口的烽燧昼夜不熄。'],
  ['shangdang', '上党', 'castle', 'yuan', 23, 13, 1.14, 95, 'yuan', '太行山上的壶关，一夫当关。'],
  ['ye', '邺', 'town', 'yuan', 28, 13, 1.08, 160, 'yuan', '袁本初的都城。铜雀台还没修，粮仓先满了。'],
  ['changshan', '常山村', 'village', 'yuan', 26, 12, 0.74, 14, 'village', '邺城西北的小村，村口一条土路通官道，常山赵家的旧宅就在坡上。'],
  ['nanpi', '南皮', 'castle', 'yuan', 31, 11, 1.12, 90, 'yuan', '渤海郡的壁垒，袁家的后院。'],
  ['pingyuan', '平原', 'town', 'yuan', 31, 17, 1.04, 95, 'yuan', '青州北界的粮城，麦子堆到城墙那么高。'],
  ['beihai', '北海', 'town', 'yuan', 34, 16, 1.06, 100, 'yuan', '青州的海盐与鱼货在这里上岸，袁谭的旗插在城头。'],
  ['liyang', '黎阳', 'town', 'yuan', 27, 15, 1.05, 105, 'yuan', '黄河渡口。袁绍的粮车从这里过河，河边常年有马嘶。'],
  ['puyang', '濮阳', 'town', 'wei', 26, 19, 1.06, 105, 'cao', '兖州的旧治，曹操在这里打赢过吕布。'],
  // ---- 关中 ----
  ['changan', '长安', 'town', 'han', 15, 20, 1.1, 140, 'han', '旧都。宫室烧了一半，百官还在。'],
  ['tongguan', '潼关', 'castle', 'han', 17, 20, 1.18, 110, 'han', '关中东门，谁拿到它谁就能关起门来。'],
  ['luoyang', '洛阳', 'town', 'wei', 20, 22, 1.12, 130, 'cao', '董卓烧过一次，如今又有人回来重新点灯。'],
  ['hulao', '虎牢关', 'castle', 'wei', 21, 20, 1.15, 90, 'cao', '洛阳东面的关口。三英战吕布，就在这下面。'],
  // ---- 凉州 ----
  ['anding', '安定', 'town', 'han', 11, 18, 1.08, 95, 'han', '汉家西面的门户，卡在武威通往长安的驿道上，城头还挂着汉廷赤旗。'],
  ['wuwei', '武威', 'town', 'ma', 6, 17, 1.04, 100, 'ma', '凉州治所，马市开在城外，一天能换三百匹。'],
  ['xiping', '西平', 'town', 'hansui', 3, 17, 1.06, 90, 'hansui', '湟水谷地的粮城。韩遂的旗插在城头，羌汉商队都在这里歇脚。'],
  ['fuhan', '枹罕', 'castle', 'hansui', 2, 20, 1.14, 85, 'hansui', '河州旧垒。城墙夯了又夯，挡住过无数次羌骑。'],
  ['jincheng', '金城', 'town', 'hansui', 4, 22, 1.06, 85, 'hansui', '黄河边上的渡口城。韩遂与马腾在这里喝过酒，也在这里翻过脸。'],
  ['tianshui', '天水', 'castle', 'hansui', 10, 22, 1.1, 95, 'hansui', '陇右的要冲，姜维的老家。如今城门上插着韩字旗，与长安只隔一条驿道。'],
  ['longxi', '陇西村', 'village', 'ma', 8, 24, 0.72, 12, 'village', '黄土坡上的村子，家家有马，家家缺粮。'],
  ['wudu', '武都', 'castle', 'zhanglu', 12, 27, 1.14, 75, 'zhanglu', '陇南的氐羌山城。往北是天水，往南是汉中，山道窄得只容一队人。张鲁的教众在此把守。'],
  // ---- 中原 ----
  ['chenliu', '陈留', 'town', 'wei', 25, 23, 1.03, 90, 'cao', '曹操起兵的地方。城外全是募兵的木牌。'],
  ['guandu', '官渡', 'castle', 'wei', 23, 21, 1.2, 100, 'cao', '黄河渡口。两军对峙的时候，这里连水都贵。'],
  ['baima', '白马', 'castle', 'yuan', 25, 18, 1.14, 85, 'yuan', '白马津的旧渡口，袁军的游骑常在河堤上点火。'],
  ['xuchang', '许昌', 'town', 'wei', 25, 27, 1.08, 170, 'cao', '曹操把天子接来以后，这里就是朝廷。'],
  ['qiao', '谯', 'village', 'wei', 27, 25, 0.75, 16, 'village', '曹氏与夏侯氏的祖宅所在，村口有棵老槐树。'],
  ['runan', '汝南', 'village', 'wei', 23, 30, 0.76, 14, 'village', '袁氏的故里，如今只剩族谱和荒田。'],
  // ---- 徐州 / 淮南 ----
  ['xiapi', '下邳', 'town', 'lv', 31, 24, 1.1, 150, 'lv', '吕布守着这座城。泗水绕着城墙流，水能灌进来。'],
  ['xiaopei', '小沛', 'castle', 'lv', 29, 23, 1.12, 80, 'lv', '刘备借住过的地方，现在插着吕字旗。'],
  ['pengcheng', '彭城', 'village', 'lv', 30, 21, 0.78, 15, 'village', '徐州旧治的残垣，集市还开在墙根下。'],
  ['taishanguan', '泰山关', 'castle', 'lv', 29, 18, 1.16, 80, 'lv', '青徐之间的山口关城。北接平原，南压彭城，谁占住这里，谁就卡住两州的粮道。'],
  ['xuzhou', '徐州', 'town', 'lv', 33, 21, 1.07, 120, 'lv', '泗水与沂水在这里交汇，城头插着吕字旗，商队仍从城门下过。'],
  ['guangling', '广陵', 'town', 'yuanshu', 32, 26, 1.06, 95, 'yuanshu', '淮南的盐粮码头，袁术的船队从这里北上。'],
  ['hefei', '合肥', 'castle', 'yuanshu', 31, 29, 1.12, 85, 'yuanshu', '合肥新城压在江淮之间，谁占住这里，谁就能卡住寿春的北门。'],
  ['shouchun', '寿春', 'town', 'yuanshu', 29, 28, 1.05, 130, 'yuanshu', '淮南的粮仓。袁术把这里当作自己的都城，城外的粮车排到河岸。'],
  ['lujiang', '庐江', 'town', 'yuanshu', 27, 31, 1.06, 90, 'yuanshu', '庐江郡治。南临大江，北接淮南，袁术的粮船从这里下水。'],
  ['liyang2', '历阳', 'castle', 'yuanshu', 29, 32, 1.14, 80, 'yuanshu', '历阳渡口。江对岸就是建业，谁在这里扎营，谁就能卡住江东的咽喉。'],
  ['ruxu', '濡须坞', 'castle', 'wu', 32, 30, 1.16, 95, 'wu', '濡须口的水寨。夹水筑坞，孙权把江东的门闩钉在这里。'],
  // ---- 荆州 ----
  ['wan', '宛', 'town', 'biao', 22, 30, 1.05, 105, 'biao', '南阳郡治，铁官与作坊都在这。'],
  ['xinye', '新野', 'castle', 'shu', 22, 33, 1.08, 85, 'shu', '刘备屯兵的小城。城不大，人心很齐。'],
  ['shangyong', '上庸', 'castle', 'shu', 18, 34, 1.1, 75, 'shu', '汉水上游的山城。刘备入川后，这里成了蜀军东出的另一扇门。'],
  ['xiangyang', '襄阳', 'town', 'biao', 23, 35, 1.09, 150, 'biao', '刘表的治所。城墙临汉水，商船排到江心。'],
  ['jiangling', '江陵', 'town', 'biao', 23, 39, 1.06, 110, 'biao', '荆州的粮仓与船坞，南郡的命门。'],
  ['xiakou', '夏口', 'castle', 'wu', 27, 36, 1.14, 90, 'wu', '汉水入江处。谁在这里扎营，谁就卡住了荆州。'],
  ['chaisang', '柴桑', 'town', 'wu', 28, 38, 1.06, 95, 'wu', '江东的水军基地，船比房子多。'],
  ['yushan', '玉山', 'town', 'wu', 32, 39, 1.04, 85, 'wu', '柴桑与会稽之间的山城，浙赣山道从城下过，往西还能转进夷陵。'],
  ['chibi', '赤壁', 'castle', 'biao', 26, 38, 1.16, 70, 'biao', '江边的石壁。风从东南来，火能烧到对岸。'],
  ['yiling', '夷陵', 'castle', 'biao', 24, 41, 1.12, 75, 'biao', '三峡的出口。连营七百里，说的就是这一线。'],
  // ---- 益州 ----
  ['hanzhong', '汉中', 'town', 'zhanglu', 16, 29, 1.04, 105, 'zhanglu', '秦岭与巴山之间的粮仓，五斗米道的地盘。'],
  ['shangluo', '上洛', 'castle', 'zhanglu', 18, 26, 1.16, 80, 'zhanglu', '商洛山中的关城。汉中往洛阳的驿道从这里穿过，山谷里常年有雾。张鲁的旗插在关楼上。'],
  ['jiange', '剑阁', 'castle', 'zhang', 16, 32, 1.18, 100, 'zhang', '一夫当关，万夫莫开。说的不是城，是那条路。'],
  ['chengdu', '成都', 'town', 'zhang', 11, 35, 1.07, 160, 'zhang', '益州治所。锦官城的织机声，隔一条街都听得见。'],
  ['jiangzhou', '江州', 'town', 'zhang', 14, 38, 1.05, 90, 'zhang', '巴郡的水码头，盐船从这里下行。'],
  ['zhuti', '朱提', 'castle', 'nanman', 12, 39, 1.12, 75, 'nanman', '南中的银矿与粮道。孟获的哨骑常在山口上点烟。'],
  ['jianning', '建宁', 'town', 'nanman', 14, 41, 1.08, 105, 'nanman', '南蛮王城。铜鼓一响，各部洞主就带着藤甲兵下山。'],
  ['zangke', '牂牁', 'castle', 'nanman', 20, 44, 1.14, 80, 'nanman', '牂牁江边的山城。顺流而下可到交州，逆流而上就是巴郡。'],
  ['yunnan', '云南', 'town', 'nanman', 10, 43, 1.06, 95, 'nanman', '彩云之南的坝子。稻田、盐井与象队都从这里出。'],
  ['yongchang', '永昌', 'castle', 'nanman', 8, 45, 1.16, 70, 'nanman', '西南极边的郡城。再往西就是身毒，商队带着琉璃与象牙回来。'],
  ['baxi', '巴西村', 'village', 'zhang', 13, 34, 0.73, 13, 'village', '山坳里的村子，出产賨人和好弓。'],
  // ---- 江东 ----
  ['jianye', '建业', 'town', 'wu', 33, 32, 1.08, 160, 'wu', '孙权的新都。钟山脚下，江面宽得看不到对岸。'],
  ['wujun', '吴', 'town', 'wu', 34, 36, 1.06, 120, 'wu', '吴郡。世家大族在这，船坞也在这。'],
  ['kuaiji', '会稽', 'town', 'wu', 34, 40, 1.05, 110, 'wu', '东南的海盐与稻米，一半从这会稽出去。'],
  ['danyang', '丹阳村', 'village', 'wu', 31, 33, 0.76, 15, 'village', '出精兵的地方。山越与汉人混着住。'],
  // ---- 交州 ----
  ['jiaozhi', '交趾', 'town', 'shanyue', 24, 46, 1.02, 70, 'shanyue', '最南边的郡城。中原的官来了先病三个月。'],
  ['shanyue', '南越', 'town', 'shanyue', 21, 47, 1.02, 90, 'shanyue', '交趾西南的南越王城。铜鼓藏在洞里，山路比城墙更难走。'],
  ['longbian', '龙编', 'town', 'shanyue', 25, 47, 1.0, 72, 'shanyue', '红河口的南越城。码头连着交趾，铜鼓与盐船都在这里靠岸。'],
  ['changsha', '长沙', 'town', 'biao', 23, 42, 1.0, 88, 'biao', '湘水与浏水交汇的荆州城。谁握住长沙，谁就能把荆南的粮船扣在港里。'],
  ['wuling', '武陵', 'town', 'biao', 22, 44, 1.04, 80, 'biao', '荆南的山城，沅水从城下绕过，粮船南下都要在这里歇一夜。'],
  ['guiyang', '桂阳村', 'village', 'biao', 26, 44, 0.72, 11, 'village', '五岭以南的小村，出锡，也出土话。'],
  ['edge_town', '边陲小镇', 'village', null, 2, 40, 0.7, 10, 'village', '地图西缘的一座无名小镇。一年四季被浓雾裹着，没人说得清镇里还住着谁。'],
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
  shanyue: ['militia', 'spear', 'archer', 'danyang'],
  cao: ['militia', 'spear', 'crossbow', 'guard'],
  cao2: ['militia', 'crossbow', 'cav', 'heavy'],
  shu: ['militia', 'spear', 'archer', 'baier'],
  shu2: ['militia', 'archer', 'wudang', 'cav'],
  wu: ['militia', 'archer', 'boat', 'huochuan'],
  wu2: ['militia', 'cav', 'qishe', 'danyang'],
  yuan: ['militia', 'spear', 'cav', 'heavy'],
  lv: ['militia', 'spear', 'cav', 'tiefu'],
  yuanshu: ['militia', 'spear', 'cav', 'guard'],
  biao: ['militia', 'spear', 'archer', 'cav'],
  zhang: ['militia', 'spear', 'archer', 'wudang'],
  zhanglu: ['militia', 'spear', 'archer', 'wudang'],
  xianbei: ['militia', 'qishe', 'xianbei', 'tengri'],
  ma: ['militia', 'spear', 'qishe', 'tiefu'],
  hansui: ['militia', 'spear', 'cav', 'qishe'],
  gongsun: ['militia', 'spear', 'cav', 'qishe'],
  nanman: ['militia', 'spear', 'archer', 'wudang'],
  han: ['militia', 'spear', 'crossbow', 'jinjun'],
  none: ['militia', 'spear'],
  village: ['militia'],
  bandit: [],
};

/** 道路连线 */
const ROADS = [
  ['longcheng', 'tanhanshan'], ['juyan', 'wuwei'],
  ['tanhanshan', 'ji'], ['ji', 'zhuo'], ['zhuo', 'beiping'],
  ['beiping', 'xiangping'], ['nanpi', 'beiping'], ['nanpi', 'ye'], ['ye', 'shangdang'],
  ['zhuo', 'fanyang'], ['fanyang', 'ye'], ['ye', 'changshan'],
  ['shangdang', 'jinyang'], ['jinyang', 'yanmen'], ['yanmen', 'tanhanshan'], ['jinyang', 'puyang'],
  ['ye', 'pingyuan'], ['pingyuan', 'puyang'],
  ['puyang', 'chenliu'], ['chenliu', 'guandu'], ['guandu', 'hulao'], ['hulao', 'luoyang'],
  ['baima', 'guandu'], ['baima', 'hulao'], ['liyang', 'ye'], ['liyang', 'baima'],
  ['luoyang', 'tongguan'], ['tongguan', 'changan'], ['changan', 'tianshui'], ['tianshui', 'longxi'],
  ['longxi', 'jincheng'], ['jincheng', 'wuwei'], ['jincheng', 'tianshui'], ['wuwei', 'xiping'], ['fuhan', 'jincheng'],
  ['wuwei', 'anding'], ['anding', 'changan'],
  ['wuwei', 'tianshui'], ['tianshui', 'wudu'], ['wudu', 'hanzhong'],
  ['hanzhong', 'jiange'],
  ['jiange', 'baxi'], ['baxi', 'chengdu'], ['chengdu', 'jiangzhou'], ['jiangzhou', 'yiling'],
  ['jiangzhou', 'zhuti'], ['zhuti', 'jianning'], ['jianning', 'yunnan'], ['yunnan', 'yongchang'],
  ['jianning', 'zangke'], ['zangke', 'jiaozhi'],
  // 建宁—南中夷寨：南中部落与建宁互通，不再只靠南中—交趾一条远路。
  ['jianning', 'nanzhong'],
  ['chenliu', 'xuchang'], ['xuchang', 'qiao'], ['xuchang', 'runan'], ['runan', 'wan'],
  // 陈留—小沛驿道：曹吕前线不能只隔着一片农田对望，有路才走得过去、攻得起来。
  ['chenliu', 'xiaopei'],
  ['wan', 'xinye'], ['xinye', 'xiangyang'], ['xinye', 'shangyong'], ['shangyong', 'xiangyang'], ['shangyong', 'jiange'], ['shangyong', 'jiangzhou'], ['xiangyang', 'jiangling'], ['jiangling', 'yiling'],
  ['yiling', 'chibi'], ['chibi', 'chaisang'], ['chaisang', 'xiakou'], ['xiakou', 'jiangling'],
  // 荆襄—赤壁—夏口：襄阳南下赤壁，再沿江到夏口，荆州水陆连成一条。
  ['xiangyang', 'chibi'], ['chibi', 'xiakou'],
  ['xuchang', 'shouchun'], ['shouchun', 'xiaopei'], ['shouchun', 'hefei'],
  ['shouchun', 'lujiang'], ['lujiang', 'liyang2'], ['lujiang', 'wan'], ['lujiang', 'xiakou'], ['liyang2', 'ruxu'], ['ruxu', 'jianye'],
  ['hefei', 'ruxu'], ['ruxu', 'danyang'],
  ['hefei', 'guangling'], ['guangling', 'xiapi'], ['guangling', 'xuzhou'],
  ['xiaopei', 'xiapi'], ['xiaopei', 'pengcheng'], ['xiapi', 'pengcheng'], ['xiapi', 'xuzhou'],
  ['pengcheng', 'xuzhou'],
  ['pengcheng', 'taishanguan'], ['taishanguan', 'taishan'], ['xiapi', 'danyang'], ['danyang', 'jianye'], ['jianye', 'wujun'],
  ['wujun', 'kuaiji'], ['jianye', 'chaisang'], ['chaisang', 'poyang'], ['poyang', 'changsha'],
  ['chaisang', 'yushan'], ['yushan', 'kuaiji'], ['yushan', 'yiling'],
  ['changsha', 'guiyang'], ['guiyang', 'jiaozhi'], ['changsha', 'yiling'], ['hanzhong', 'shangluo'], ['shangluo', 'luoyang'],
  ['shanyue', 'wuling'],
  ['heishan', 'ye'], ['baibo', 'luoyang'], ['mizei', 'hanzhong'], ['nanzhong', 'jiaozhi'], ['jiaozhi', 'shanyue'],
  ['taishanguan', 'pingyuan'], ['beihai', 'pingyuan'], ['beihai', 'xuzhou'],
  ['wuling', 'changsha'], ['wuling', 'guiyang'],
  // 牂牁—武陵：南中与荆南之间的一条山道，南蛮与刘表因此接壤。
  ['zangke', 'wuling'],
  // 南蛮—南越：两家从开局便沿山路互攻，永不停战。
  ['zangke', 'shanyue'],
  ['shanyue', 'longbian'], ['longbian', 'jiaozhi'],
  // 蜀道与关隘枢纽：让关键关口四面可走，也给刘备一条从新野入川的路。
  ['jiange', 'xinye'], ['jiange', 'xiangyang'],
  ['hulao', 'shangdang'], ['hulao', 'xuchang'],
  ['tongguan', 'shangdang'], ['tongguan', 'wan'],
  // 新野—许昌不直连：刘备北上走汝南或绕宛城；官渡仍是黄河渡口。
  ['runan', 'xinye'], ['wan', 'xiangyang'],
  ['hefei', 'jianye'], ['hefei', 'xuchang'],
  ['chaisang', 'jiangling'], ['chibi', 'jiangling'],
];

/**
 * 匪团禁入区：成都西侧这块空地没有城村可抢，也没有巡逻意义，
 * 只作为益州腹地的缓冲地形。坐标用设计稿 40×48，世界生成时按比例放大。
 */
const BANDIT_EXCLUDE_ZONES = [
  [5, 31, 10, 40],
];

/**
 * 战略要地：占据者在本关八格内的自军获得 1.5 倍对碰防御加成。
 * 这里是“一个兵顶一个半”的关隘系数，和国别、兵种倍率相乘。
 */
const STRATEGIC_SITES = {
  hulao:     { id: 'hulao',     name: '虎牢关', radius: 8, defense: 1.5 },
  tongguan:  { id: 'tongguan',  name: '潼关',   radius: 8, defense: 1.5 },
  shangdang: { id: 'shangdang', name: '上党',   radius: 8, defense: 1.5 },
  jiange:    { id: 'jiange',    name: '剑阁',   radius: 8, defense: 1.5 },
  guandu:    { id: 'guandu',    name: '官渡',   radius: 8, defense: 1.5 },
  taishanguan: { id: 'taishanguan', name: '泰山关', radius: 8, defense: 1.5 },
  hanzhong:  { id: 'hanzhong',  name: '汉中',   radius: 8, defense: 1.5 },
  xiangyang: { id: 'xiangyang', name: '襄阳',   radius: 8, defense: 1.5 },
  hefei:     { id: 'hefei',     name: '合肥',   radius: 8, defense: 1.5 },
  chaisang:  { id: 'chaisang',  name: '柴桑',   radius: 8, defense: 1.5 },
  changsha:  { id: 'changsha',  name: '长沙',   radius: 8, defense: 1.5 },
  chibi:     { id: 'chibi',     name: '赤壁',   radius: 8, defense: 1.5 },
  yiling:    { id: 'yiling',    name: '夷陵',   radius: 8, defense: 1.5 },
};

/** 各国都城与旧都：地图与天下大势无论缩到多小都要留名字 */
const CAPITAL_IDS = [
  'xuchang', 'chengdu', 'jianye', 'ye', 'xiapi', 'xiangyang', 'longcheng', 'wuwei', 'changan', 'luoyang',
  'shouchun', 'ji', 'jincheng', 'jianning', 'shanyue',
];

/** 战略地图上不再保留无主要地：武都、上洛归张鲁，长沙归刘表。 */
const FREE_CITY_IDS = [];

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
    id: 'wu', name: '吴', full: '孙权', color: '#2e8b8b', banner: '孙',
    lord: '孙权', desc: '据长江之险，水军天下第一。守成有余，进取不足。',
  },
  yuan: {
    id: 'yuan', name: '袁', full: '袁绍', color: '#8c6fae', banner: '袁',
    lord: '袁绍', desc: '四世三公，兵多粮足。只是号令出自三门，谁也不服谁。',
  },
  lv: {
    id: 'lv', name: '吕', full: '吕布', color: '#e0503c', banner: '吕',
    lord: '吕布', desc: '人中吕布，马中赤兔。骁勇无谋，反复无常。',
  },
  yuanshu: {
    id: 'yuanshu', name: '术', full: '袁术', color: '#b5894f', banner: '术',
    lord: '袁术', desc: '汝南袁氏，据淮南寿春。兵多粮足，却总想再往上坐一级。',
  },
  biao: {
    id: 'biao', name: '刘', full: '刘表', color: '#6a8f8a', banner: '表',
    lord: '刘表', desc: '守荆州二十年，不动如山。老了，也不想动了。',
  },
  zhang: {
    id: 'zhang', name: '璋', full: '刘璋', color: '#8a8a52', banner: '璋',
    lord: '刘璋', desc: '益州天府，闭门自守。兵不少，将不多。',
  },
  zhanglu: {
    id: 'zhanglu', name: '鲁', full: '张鲁', color: '#b08a5a', banner: '鲁',
    lord: '张鲁', desc: '五斗米道据汉中，北守秦岭，南望巴蜀。政教合一，山险为城。',
  },
  rebel: {
    id: 'rebel', name: '叛', full: '叛军', color: '#6d2f2a', banner: '叛',
    lord: '叛将', desc: '统一之后突然翻脸的全国旧臣。旗号杂乱，人数众多。',
  },
  xianbei: {
    id: 'xianbei', name: '鲜卑', full: '轲比能', color: '#7a6a4a', banner: '鲜',
    lord: '轲比能', desc: '控弦十万，来去如风。不筑城，只抢城。',
  },
  ma: {
    id: 'ma', name: '凉', full: '马腾', color: '#a5824a', banner: '马',
    lord: '马腾', desc: '西凉重步，天下精锐。粮少，人心散。',
  },
  hansui: {
    id: 'hansui', name: '韩', full: '韩遂', color: '#5d6f8f', banner: '韩',
    lord: '韩遂', desc: '金城起家，联结羌胡。与马腾同饮过酒，也同动过刀。',
  },
  gongsun: {
    id: 'gongsun', name: '公孙', full: '公孙瓒', color: '#93a6b0', banner: '公',
    lord: '公孙瓒', desc: '白马义从，公孙之主。赵云也曾在白马旗下听令。',
  },
  nanman: {
    id: 'nanman', name: '蛮', full: '孟获', color: '#a8673d', banner: '蛮',
    lord: '孟获', desc: '南中诸部，藤甲铜鼓。山高林密，外人进来先迷路。',
  },
  shanyue: {
    id: 'shanyue', name: '南越', full: '南越诸部', color: '#4f6f5f', banner: '越',
    lord: '潘临', desc: '交州南部的越人诸洞。不守平川，只守山口，弩箭从林子里射出来。',
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
 * 国别战力：只在 NPC 对 NPC 的野战、攻城结算里生效。
 * power 是“对普通势力的等效兵力倍率”，neutral 里的三国互相不享受倍率，
 * 避免魏蜀吴一见面就互相碾压。曹操按用户要求：2 兵可当 3 兵用（1.5 倍），
 * 但只对蜀、吴之外的国家有效；蜀、吴各自比普通势力强，互打仍按原兵数。
 */
const FACTION_COMBAT = {
  yuan: { power: 1, note: '袁绍军：官渡昏君状态下会被压到 0.33，一兵不如曹操三兵' },
  wei: { power: 1.5, neutral: ['shu', 'wu'], note: '曹操军：对外 2 兵抵 3 兵，对蜀吴 1:1' },
  shu: { power: 1.5, neutral: ['wei', 'wu'], note: '刘备军：对外 2 兵抵 3 兵，对魏吴 1:1' },
  wu: { power: 1.5, neutral: ['wei', 'shu'], note: '孙权军：对外 2 兵抵 3 兵，对魏蜀 1:1' },
  gongsun: { power: 0.5, note: '公孙瓒军：白马义从已老，两兵只当一兵用，给袁绍第一阶段让路' },
  zhanglu: { power: 1.0, note: '张鲁军：汉中教众守山，不主动扩张' },
};

/**
 * 君位继任表：君主被斩后按这张表往下传。
 * 表里有些人开局不在名册上，轮到他们时再生成；表用完了，
 * 就从本势力还活着的领主里挑一位本地、官职大的。
 */
const SUCCESSION = {
  wei: [
    { id: 'caopi', name: '曹丕', title: '魏太子' },
    { id: 'caozhang', name: '曹彰', title: '任城王' },
    { id: 'caozhi', name: '曹植', title: '陈王' },
    { id: 'caoren', name: '曹仁', title: '征南将军' },
    { id: 'caohong', name: '曹洪', title: '都护将军' },
  ],
  shu: [
    { id: 'liushan', name: '刘禅', title: '汉中王世子' },
    { id: 'liufeng', name: '刘封', title: '副军中郎将' },
    { id: 'weiyan', name: '魏延', title: '牙门将军' },
  ],
  wu: [
    { id: 'sunliang', name: '孙亮', title: '会稽王' },
    { id: 'sunxiu', name: '孙休', title: '琅琊王' },
    { id: 'zhouyu', name: '周瑜', title: '水军都督' },
    { id: 'lvmeng', name: '吕蒙', title: '横野中郎将' },
    { id: 'luxun', name: '陆逊', title: '镇西将军' },
  ],
  yuan: [
    { id: 'yuantan', name: '袁谭', title: '青州刺史' },
    { id: 'yuanshang', name: '袁尚', title: '邺侯' },
    { id: 'yanliang', name: '颜良', title: '骑都尉' },
    { id: 'wenchou', name: '文丑', title: '骑将' },
    { id: 'chunyuqiong', name: '淳于琼', title: '督军' },
  ],
  lv: [
    { id: 'chengong', name: '陈宫', title: '军师' },
    { id: 'gaoshun', name: '高顺', title: '中郎将' },
    { id: 'houcheng', name: '侯成', title: '骑都尉' },
  ],
  yuanshu: [
    { id: 'yuanyin', name: '袁胤', title: '扬州刺史' },
    { id: 'yuanyao', name: '袁耀', title: '袁氏宗亲' },
    { id: 'zhangxun', name: '张勋', title: '大将' },
    { id: 'qiaorui', name: '桥蕤', title: '将军' },
  ],
  biao: [
    { id: 'liuqi', name: '刘琦', title: '江夏太守' },
    { id: 'liucong', name: '刘琮', title: '襄阳侯' },
    { id: 'caimao', name: '蔡瑁', title: '水军统领' },
    { id: 'wenpin', name: '文聘', title: '大将' },
  ],
  zhang: [
    { id: 'liuxun', name: '刘循', title: '雒城守将' },
    { id: 'wuyi', name: '吴懿', title: '中郎将' },
    { id: 'zhangren', name: '张任', title: '从事' },
    { id: 'liugui', name: '刘璝', title: '中郎将' },
    { id: 'yanghuai', name: '杨怀', title: '白水军督' },
    { id: 'gaopei', name: '高沛', title: '白水关守将' },
  ],
  zhanglu: [
    { id: 'zhangfu', name: '张富', title: '汉中督' },
    { id: 'yangren', name: '杨任', title: '大将' },
    { id: 'yang`ang', name: '杨昂', title: '部将' },
    { id: 'yanpu', name: '阎圃', title: '谋主' },
  ],





  xianbei: [
    { id: 'suli', name: '素利', title: '东部大人' },
    { id: 'mijia', name: '弥加', title: '部帅' },
    { id: 'queji', name: '阙机', title: '部帅' },
    { id: 'huaitou', name: '槐头', title: '小帅' },
  ],
  ma: [
    { id: 'machao', name: '马超', title: '偏将军' },
    { id: 'maxiu', name: '马休', title: '奉车都尉' },
    { id: 'matie', name: '马铁', title: '骑都尉' },
    { id: 'pangde', name: '庞德', title: '校尉' },
    { id: 'chengyin', name: '程银', title: '校尉' },
  ],
  hansui: [
    { id: 'yanxing', name: '阎行', title: '部将' },
    { id: 'chenggongying', name: '成公英', title: '军师' },
    { id: 'liangxing', name: '梁兴', title: '校尉' },
    { id: 'houxuan', name: '侯选', title: '校尉' },
  ],
  gongsun: [
    { id: 'gongsunxu', name: '公孙续', title: '世子' },
    { id: 'yangang', name: '严纲', title: '冀州刺史' },
    { id: 'tiankai', name: '田楷', title: '青州刺史' },
    { id: 'danjing', name: '单经', title: '兖州刺史' },
    { id: 'guanjing', name: '关靖', title: '长史' },
  ],
  nanman: [
    { id: 'zhurong', name: '祝融夫人', title: '洞主' },
    { id: 'mengyou', name: '孟优', title: '洞主' },
    { id: 'duosi', name: '朵思大王', title: '秃龙洞主' },
    { id: 'wutugu', name: '兀突骨', title: '藤甲洞主' },
    { id: 'mulu', name: '木鹿大王', title: '八纳洞主' },
  ],
  shanyue: [
    { id: 'youtu', name: '尤突', title: '越帅' },
    { id: 'feizhan', name: '费栈', title: '丹阳越帅' },
    { id: 'pengqi', name: '彭绮', title: '鄱阳越帅' },
    { id: 'pengshi', name: '彭式', title: '南越渠帅' },
    { id: 'huangluan', name: '黄乱', title: '越中渠帅' },
  ],
  han: [
    { id: 'liuxie', name: '刘协', title: '天子' },
    { id: 'huangfusong', name: '皇甫嵩', title: '车骑将军' },
    { id: 'zhujun', name: '朱儁', title: '右中郎将' },
    { id: 'luzhi', name: '卢植', title: '北中郎将' },
  ],
  player: [],
  bandit: [],
};

/** 开局时的君主名，用来在重开/读档时把被继任表改过的全局数据复位 */
const FACTION_RULERS = Object.keys(FACTIONS).reduce(function (out, id) {
  out[id] = { lord: FACTIONS[id].lord, full: FACTIONS[id].full, banner: FACTIONS[id].banner };
  return out;
}, {});

/**
 * 领主 NPC
 * soldiers 为初始兵力模板，home 为驻地
 */
const LORDS = [
  { id: 'caocao', name: '曹操', faction: 'wei', home: 'xuchang', soldiers: { militia: 60, spear: 70, crossbow: 40, cav: 30, guard: 12 }, morale: 92, sight: 7, title: '魏公' },
  { id: 'xiahou', name: '夏侯惇', faction: 'wei', home: 'luoyang', soldiers: { militia: 40, spear: 50, crossbow: 25, cav: 20 }, morale: 86, sight: 7, title: '建武将军' },
  { id: 'zhangliao', name: '张辽', faction: 'lv', home: 'xiapi', soldiers: { militia: 30, spear: 40, cav: 35, guard: 8 }, morale: 88, sight: 8, title: '骑都尉' },
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
  { id: 'zhanglu', name: '张鲁', faction: 'zhanglu', home: 'hanzhong', soldiers: { militia: 55, spear: 45, archer: 30, wudang: 8 }, morale: 82, sight: 6, title: '师君' },
  { id: 'yangren', name: '杨任', faction: 'zhanglu', home: 'wudu', soldiers: { militia: 35, spear: 40, archer: 20 }, morale: 80, sight: 6, title: '大将' },
  { id: 'yang`ang', name: '杨昂', faction: 'zhanglu', home: 'shangluo', soldiers: { militia: 30, spear: 35, archer: 20 }, morale: 78, sight: 6, title: '部将' },
  { id: 'yanpu', name: '阎圃', faction: 'zhanglu', home: 'hanzhong', soldiers: { militia: 25, spear: 20, archer: 15 }, morale: 74, sight: 5, title: '谋主' },
  { id: 'zhangwei', name: '张卫', faction: 'zhanglu', home: 'hanzhong', soldiers: { militia: 35, spear: 30, archer: 20 }, morale: 78, sight: 6, title: '都尉' },
  { id: 'yangbo', name: '杨柏', faction: 'zhanglu', home: 'wudu', soldiers: { militia: 28, spear: 28, archer: 18 }, morale: 76, sight: 5, title: '校尉' },
  { id: 'kebineng', name: '轲比能', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 80, qishe: 40, xianbei: 30, tengri: 12 }, morale: 86, sight: 9, title: '鲜卑单于' },
  { id: 'mateng', name: '马腾', faction: 'ma', home: 'wuwei', soldiers: { militia: 30, spear: 50, qishe: 30, tiefu: 15 }, morale: 82, sight: 8, title: '征西将军' },
  { id: 'machao', name: '马超', faction: 'ma', home: 'wuwei', soldiers: { cav: 45, tiefu: 25, qishe: 20 }, morale: 90, sight: 9, title: '偏将军' },
  { id: 'huangfusong', name: '皇甫嵩', faction: 'han', home: 'changan', soldiers: { militia: 40, spear: 40, crossbow: 25, jinjun: 6 }, morale: 74, sight: 6, title: '车骑将军' },
  // ---- 魏：宗亲与五子 ----
  { id: 'caoren', name: '曹仁', faction: 'wei', home: 'puyang', soldiers: { spear: 45, crossbow: 25, cav: 20, guard: 8 }, morale: 86, sight: 7, title: '征南将军' },
  { id: 'xiahouyuan', name: '夏侯渊', faction: 'wei', home: 'tongguan', soldiers: { cav: 35, spear: 30, crossbow: 20 }, morale: 88, sight: 8, title: '征西将军' },
  { id: 'xuhuang', name: '徐晃', faction: 'wei', home: 'shangdang', soldiers: { spear: 50, crossbow: 25, militia: 20 }, morale: 87, sight: 7, title: '平寇将军' },
  { id: 'zhanghe', name: '张郃', faction: 'wei', home: 'jinyang', soldiers: { cav: 30, spear: 40, crossbow: 20 }, morale: 84, sight: 8, title: '荡寇将军' },
  { id: 'xuchu', name: '许褚', faction: 'wei', home: 'chenliu', soldiers: { militia: 30, spear: 30, guard: 20 }, morale: 90, sight: 6, title: '虎卫' },
  { id: 'litong', name: '李通', faction: 'wei', home: 'runan', soldiers: { militia: 35, spear: 25, cav: 15 }, morale: 78, sight: 6, title: '裨将军' },
  // ---- 蜀：荆益之间 ----
  { id: 'huangzhong', name: '黄忠', faction: 'shu', home: 'jiangling', soldiers: { archer: 40, spear: 30, militia: 20 }, morale: 90, sight: 7, title: '中郎将' },
  { id: 'weiyan', name: '魏延', faction: 'shu', home: 'shangyong', soldiers: { spear: 40, militia: 30, cav: 15 }, morale: 86, sight: 7, title: '牙门将军' },
  { id: 'chendao', name: '陈到', faction: 'shu', home: 'jiangzhou', soldiers: { spear: 35, baier: 15, militia: 20 }, morale: 88, sight: 6, title: '白毦统领' },
  { id: 'liufeng', name: '刘封', faction: 'shu', home: 'shangyong', soldiers: { militia: 35, spear: 25, cav: 12 }, morale: 80, sight: 6, title: '副军中郎将' },
  { id: 'mengda', name: '孟达', faction: 'shu', home: 'shangyong', soldiers: { militia: 30, spear: 25, archer: 15 }, morale: 74, sight: 6, title: '宜都太守' },
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
  // ---- 袁术：淮南集团 ----
  { id: 'yuanshu', name: '袁术', faction: 'yuanshu', home: 'shouchun', soldiers: { militia: 80, spear: 55, cav: 30, guard: 12 }, morale: 78, sight: 7, title: '仲家公' },
  { id: 'jiling', name: '纪灵', faction: 'yuanshu', home: 'shouchun', soldiers: { militia: 45, spear: 55, cav: 25 }, morale: 86, sight: 7, title: '大将' },
  { id: 'zhangxun', name: '张勋', faction: 'yuanshu', home: 'hefei', soldiers: { militia: 40, spear: 45, cav: 20 }, morale: 78, sight: 6, title: '大将' },
  { id: 'qiaorui', name: '桥蕤', faction: 'yuanshu', home: 'guangling', soldiers: { militia: 35, spear: 40, cav: 20 }, morale: 76, sight: 6, title: '将军' },
  { id: 'yanxiang', name: '阎象', faction: 'yuanshu', home: 'shouchun', soldiers: { militia: 30, spear: 25, crossbow: 15 }, morale: 70, sight: 5, title: '主簿' },
  { id: 'yanghong', name: '杨弘', faction: 'yuanshu', home: 'shouchun', soldiers: { militia: 35, spear: 25, archer: 15 }, morale: 72, sight: 6, title: '长史' },
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
  { id: 'yanghuai', name: '杨怀', faction: 'zhang', home: 'baxi', soldiers: { militia: 30, spear: 25, archer: 10 }, morale: 72, sight: 6, title: '白水军督' },
  { id: 'gaopei', name: '高沛', faction: 'zhang', home: 'jiange', soldiers: { militia: 28, spear: 30, crossbow: 12 }, morale: 72, sight: 6, title: '白水关守将' },
  // ---- 公孙瓒：幽燕白马 ----
  { id: 'gongsunzan', name: '公孙瓒', faction: 'gongsun', home: 'ji', soldiers: { militia: 45, spear: 35, cav: 45, qishe: 18 }, morale: 88, sight: 8, title: '前将军' },
  { id: 'zhaoyun', name: '赵云', faction: 'gongsun', home: 'ji', soldiers: { cav: 35, spear: 30, archer: 20 }, morale: 92, sight: 8, title: '牙门将军' },
  { id: 'yangang', name: '严纲', faction: 'gongsun', home: 'ji', soldiers: { cav: 35, spear: 30, militia: 20 }, morale: 84, sight: 7, title: '冀州刺史' },
  { id: 'tiankai', name: '田楷', faction: 'gongsun', home: 'beiping', soldiers: { militia: 35, spear: 30, cav: 18 }, morale: 78, sight: 7, title: '青州刺史' },
  { id: 'danjing', name: '单经', faction: 'gongsun', home: 'zhuo', soldiers: { militia: 30, spear: 25, cav: 14 }, morale: 74, sight: 6, title: '兖州刺史' },
  { id: 'gongsunyue', name: '公孙越', faction: 'gongsun', home: 'zhuo', soldiers: { cav: 28, spear: 22, militia: 18 }, morale: 76, sight: 7, title: '骑都尉' },
  { id: 'guanjing', name: '关靖', faction: 'gongsun', home: 'ji', soldiers: { militia: 28, spear: 20, crossbow: 12 }, morale: 72, sight: 6, title: '长史' },
  { id: 'zoudan', name: '邹丹', faction: 'gongsun', home: 'beiping', soldiers: { militia: 25, cav: 18, spear: 18 }, morale: 72, sight: 6, title: '校尉' },
  // ---- 鲜卑：塞外诸部 ----
  { id: 'suli', name: '素利', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 40, qishe: 20, xianbei: 10 }, morale: 80, sight: 8, title: '东部大人' },
  { id: 'mijia', name: '弥加', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 35, qishe: 20 }, morale: 78, sight: 8, title: '部帅' },
  { id: 'queji', name: '阙机', faction: 'xianbei', home: 'longcheng', soldiers: { cav: 30, qishe: 25 }, morale: 76, sight: 7, title: '部帅' },
  { id: 'huaitou', name: '槐头', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 30, qishe: 15, xianbei: 8 }, morale: 78, sight: 7, title: '小帅' },
  { id: 'pufulu', name: '普富卢', faction: 'xianbei', home: 'tanhanshan', soldiers: { cav: 35, qishe: 20, xianbei: 6 }, morale: 76, sight: 7, title: '代郡大人' },
  // ---- 西凉：马家的兵 ----
  { id: 'pangde', name: '庞德', faction: 'ma', home: 'wuwei', soldiers: { cav: 30, tiefu: 18, spear: 25 }, morale: 90, sight: 8, title: '校尉' },
  { id: 'maxiu', name: '马休', faction: 'ma', home: 'wuwei', soldiers: { cav: 25, spear: 25, militia: 20 }, morale: 78, sight: 7, title: '奉车都尉' },
  { id: 'matie', name: '马铁', faction: 'ma', home: 'longxi', soldiers: { cav: 25, spear: 20, militia: 20 }, morale: 78, sight: 7, title: '骑都尉' },
  { id: 'chengyin', name: '程银', faction: 'ma', home: 'wuwei', soldiers: { cav: 25, spear: 20, qishe: 10 }, morale: 74, sight: 7, title: '校尉' },
  // ---- 韩遂：金城与湟中的联军 ----
  { id: 'hansui', name: '韩遂', faction: 'hansui', home: 'jincheng', soldiers: { militia: 35, spear: 45, cav: 30, qishe: 18 }, morale: 84, sight: 8, title: '征西将军' },
  { id: 'yanxing', name: '阎行', faction: 'hansui', home: 'xiping', soldiers: { cav: 35, spear: 28, militia: 18 }, morale: 86, sight: 8, title: '部将' },
  { id: 'chenggongying', name: '成公英', faction: 'hansui', home: 'fuhan', soldiers: { militia: 30, spear: 25, archer: 15 }, morale: 78, sight: 7, title: '军师' },
  { id: 'liangxing', name: '梁兴', faction: 'hansui', home: 'jincheng', soldiers: { cav: 25, spear: 20, militia: 18 }, morale: 74, sight: 7, title: '校尉' },
  { id: 'houxuan', name: '侯选', faction: 'hansui', home: 'xiping', soldiers: { militia: 28, cav: 18, spear: 16 }, morale: 72, sight: 6, title: '校尉' },
  { id: 'songjian', name: '宋建', faction: 'hansui', home: 'fuhan', soldiers: { militia: 30, spear: 20, cav: 12 }, morale: 70, sight: 6, title: '河首平汉王' },
  // ---- 南蛮：南中诸洞 ----
  { id: 'menghuo', name: '孟获', faction: 'nanman', home: 'jianning', soldiers: { militia: 45, spear: 35, archer: 20, wudang: 10 }, morale: 84, sight: 8, title: '南蛮王' },
  { id: 'zhurong', name: '祝融夫人', faction: 'nanman', home: 'yunnan', soldiers: { militia: 25, archer: 30, spear: 25 }, morale: 88, sight: 8, title: '洞主' },
  { id: 'mengyou', name: '孟优', faction: 'nanman', home: 'jianning', soldiers: { militia: 35, spear: 25, archer: 15 }, morale: 76, sight: 7, title: '洞主' },
  { id: 'duosi', name: '朵思大王', faction: 'nanman', home: 'yongchang', soldiers: { militia: 30, spear: 25, archer: 18 }, morale: 78, sight: 7, title: '秃龙洞主' },
  { id: 'wutugu', name: '兀突骨', faction: 'nanman', home: 'zangke', soldiers: { spear: 40, militia: 35, wudang: 8 }, morale: 86, sight: 7, title: '藤甲洞主' },
  { id: 'mulu', name: '木鹿大王', faction: 'nanman', home: 'zangke', soldiers: { militia: 35, spear: 25, archer: 15 }, morale: 78, sight: 7, title: '八纳洞主' },
  { id: 'dailai', name: '带来洞主', faction: 'nanman', home: 'yunnan', soldiers: { militia: 25, spear: 20, archer: 12 }, morale: 72, sight: 6, title: '洞主' },
  // ---- 汉：关中残军 ----
  { id: 'zhujun', name: '朱儁', faction: 'han', home: 'changan', soldiers: { militia: 35, spear: 30, crossbow: 15, jinjun: 5 }, morale: 78, sight: 6, title: '右中郎将' },
  { id: 'luzhi', name: '卢植', faction: 'han', home: 'changan', soldiers: { militia: 30, spear: 30, crossbow: 20 }, morale: 80, sight: 6, title: '北中郎将' },
  { id: 'dongcheng', name: '董承', faction: 'han', home: 'changan', soldiers: { militia: 25, spear: 20, guard: 10 }, morale: 72, sight: 5, title: '车骑将军' },
  { id: 'yangfeng', name: '杨奉', faction: 'han', home: 'tongguan', soldiers: { militia: 30, cav: 15, spear: 15 }, morale: 70, sight: 6, title: '兴义将军' },
  { id: 'zhongji', name: '种辑', faction: 'han', home: 'changan', soldiers: { militia: 25, spear: 20, guard: 8 }, morale: 68, sight: 5, title: '越骑校尉' },
  // ---- 山越：交州诸洞 ----
  { id: 'panlin', name: '潘临', faction: 'shanyue', home: 'shanyue', soldiers: { militia: 40, spear: 25, archer: 25, danyang: 8 }, morale: 82, sight: 7, title: '南越帅' },
  { id: 'youtu', name: '尤突', faction: 'shanyue', home: 'shanyue', soldiers: { militia: 35, spear: 20, archer: 25 }, morale: 80, sight: 7, title: '越帅' },
  { id: 'feizhan', name: '费栈', faction: 'shanyue', home: 'shanyue', soldiers: { militia: 30, spear: 25, archer: 20, danyang: 6 }, morale: 78, sight: 6, title: '丹阳越帅' },
  { id: 'pengqi', name: '彭绮', faction: 'shanyue', home: 'shanyue', soldiers: { militia: 35, spear: 20, archer: 18 }, morale: 76, sight: 7, title: '鄱阳越帅' },
  { id: 'pengshi', name: '彭式', faction: 'shanyue', home: 'shanyue', soldiers: { militia: 30, spear: 25, archer: 15 }, morale: 74, sight: 6, title: '南越渠帅' },
  { id: 'huangluan', name: '黄乱', faction: 'shanyue', home: 'shanyue', soldiers: { militia: 30, spear: 20, archer: 15, danyang: 5 }, morale: 72, sight: 6, title: '越中渠帅' },

  // ---- 放大天下以后补的领主：魏蜀吴袁刘各添一队人 ----
  // 魏：宗亲、五子、宿卫
  { id: 'caohong', name: '曹洪', faction: 'wei', home: 'chenliu', soldiers: { militia: 45, spear: 35, cav: 18 }, morale: 82, sight: 7, title: '都护将军' },
  { id: 'yuejin', name: '乐进', faction: 'wei', home: 'puyang', soldiers: { spear: 40, militia: 30, crossbow: 15 }, morale: 85, sight: 7, title: '折冲将军' },
  { id: 'yujin', name: '于禁', faction: 'wei', home: 'runan', soldiers: { spear: 45, crossbow: 20, guard: 8 }, morale: 84, sight: 7, title: '虎威将军' },
  { id: 'dianwei', name: '典韦', faction: 'wei', home: 'xuchang', soldiers: { spear: 35, guard: 28, militia: 20 }, morale: 93, sight: 6, title: '都尉' },
  { id: 'lidian', name: '李典', faction: 'wei', home: 'qiao', soldiers: { militia: 35, spear: 30, archer: 15 }, morale: 78, sight: 6, title: '破虏将军' },
  // 蜀：荆州旧部与汉中守将
  { id: 'madai', name: '马岱', faction: 'shu', home: 'shangyong', soldiers: { cav: 32, spear: 30, militia: 18 }, morale: 88, sight: 8, title: '平北将军' },
  { id: 'guanping', name: '关平', faction: 'shu', home: 'xinye', soldiers: { spear: 35, militia: 28, cav: 15 }, morale: 90, sight: 7, title: '军前都督' },
  { id: 'liaohua', name: '廖化', faction: 'shu', home: 'xinye', soldiers: { militia: 35, spear: 25, archer: 12 }, morale: 82, sight: 6, title: '主簿' },
  { id: 'yanyan', name: '严颜', faction: 'shu', home: 'jiangzhou', soldiers: { spear: 38, militia: 25, archer: 16 }, morale: 86, sight: 7, title: '巴郡太守' },
  { id: 'zhoucang', name: '周仓', faction: 'shu', home: 'xinye', soldiers: { militia: 30, spear: 30, baier: 10 }, morale: 88, sight: 6, title: '部曲督' },
  // 吴：江东十二虎臣
  { id: 'zhoutai', name: '周泰', faction: 'wu', home: 'jianye', soldiers: { militia: 32, spear: 30, danyang: 16 }, morale: 90, sight: 7, title: '奋威将军' },
  { id: 'lingtong', name: '凌统', faction: 'wu', home: 'wujun', soldiers: { militia: 30, archer: 28, cav: 18 }, morale: 88, sight: 7, title: '荡寇中郎将' },
  { id: 'xusheng', name: '徐盛', faction: 'wu', home: 'kuaiji', soldiers: { archer: 35, spear: 25, boat: 12 }, morale: 84, sight: 7, title: '建武将军' },
  { id: 'dingfeng', name: '丁奉', faction: 'wu', home: 'chaisang', soldiers: { militia: 30, archer: 25, danyang: 14 }, morale: 85, sight: 7, title: '偏将军' },
  { id: 'zhugejin', name: '诸葛瑾', faction: 'wu', home: 'jianye', soldiers: { militia: 30, spear: 25, archer: 15 }, morale: 76, sight: 6, title: '长史' },
  // 袁：河北旧部
  { id: 'gaolan', name: '高览', faction: 'yuan', home: 'ye', soldiers: { spear: 35, cav: 28, militia: 20 }, morale: 82, sight: 7, title: '中郎将' },
  { id: 'shenpei', name: '审配', faction: 'yuan', home: 'ye', soldiers: { militia: 40, spear: 30, crossbow: 18 }, morale: 78, sight: 6, title: '治中' },
  { id: 'yuantan', name: '袁谭', faction: 'yuan', home: 'pingyuan', soldiers: { militia: 45, spear: 30, cav: 15 }, morale: 76, sight: 6, title: '青州刺史' },
  { id: 'yuanshang', name: '袁尚', faction: 'yuan', home: 'ye', soldiers: { cav: 35, spear: 28, guard: 10 }, morale: 80, sight: 7, title: '冀州牧' },
  { id: 'hanmeng', name: '韩猛', faction: 'yuan', home: 'zhuo', soldiers: { spear: 30, cav: 25, militia: 22 }, morale: 74, sight: 6, title: '骑都尉' },
  // 刘表：荆襄守江的人
  { id: 'liupan', name: '刘磐', faction: 'biao', home: 'xiangyang', soldiers: { militia: 35, spear: 28, archer: 18 }, morale: 78, sight: 6, title: '江夏从事' },
  { id: 'sufei', name: '苏飞', faction: 'biao', home: 'xiakou', soldiers: { militia: 28, archer: 24, boat: 18 }, morale: 74, sight: 6, title: '江夏都督' },
  { id: 'kuaiyue', name: '蒯越', faction: 'biao', home: 'xiangyang', soldiers: { militia: 30, spear: 25, crossbow: 15 }, morale: 76, sight: 6, title: '章陵太守' },
  { id: 'huangshe', name: '黄射', faction: 'biao', home: 'xiakou', soldiers: { archer: 30, boat: 20, militia: 20 }, morale: 72, sight: 6, title: '水军校尉' },
  // ---- 三国鼎立补强：魏蜀吴各添一队人，其他势力不再加 ----
  // 魏：谋主、宗亲骑军
  { id: 'simayi', name: '司马懿', faction: 'wei', home: 'luoyang', soldiers: { militia: 35, spear: 30, crossbow: 25, cav: 15 }, morale: 90, sight: 8, title: '军司马' },
  { id: 'xunyu', name: '荀彧', faction: 'wei', home: 'xuchang', soldiers: { militia: 20, spear: 15, crossbow: 15, guard: 6 }, morale: 72, sight: 6, title: '侍中' },
  { id: 'guojia', name: '郭嘉', faction: 'wei', home: 'xuchang', soldiers: { militia: 18, spear: 12, crossbow: 12, cav: 8 }, morale: 84, sight: 7, title: '军师祭酒' },
  { id: 'caochun', name: '曹纯', faction: 'wei', home: 'puyang', soldiers: { militia: 20, spear: 20, cav: 35, guard: 10 }, morale: 88, sight: 7, title: '虎豹骑督' },
  { id: 'jiaxu', name: '贾诩', faction: 'wei', home: 'xuchang', soldiers: { militia: 25, spear: 20, crossbow: 20 }, morale: 82, sight: 7, title: '执金吾' },
  // 蜀：卧龙、凤雏与益州旧人
  { id: 'zhugeliang', name: '诸葛亮', faction: 'shu', home: 'xinye', soldiers: { militia: 30, spear: 20, crossbow: 25, guard: 8 }, morale: 92, sight: 8, title: '军师中郎将' },
  { id: 'pangtong', name: '庞统', faction: 'shu', home: 'xiangyang', soldiers: { militia: 20, spear: 20, crossbow: 15, guard: 5 }, morale: 86, sight: 7, title: '军师' },
  { id: 'fazheng', name: '法正', faction: 'shu', home: 'chengdu', soldiers: { militia: 25, spear: 20, crossbow: 15 }, morale: 82, sight: 7, title: '蜀郡太守' },
  { id: 'maliang', name: '马良', faction: 'shu', home: 'xiangyang', soldiers: { militia: 20, spear: 15, archer: 15 }, morale: 78, sight: 6, title: '从事' },
  { id: 'guanxing', name: '关兴', faction: 'shu', home: 'baxi', soldiers: { militia: 20, spear: 25, cav: 15 }, morale: 84, sight: 7, title: '侍中' },
  // 吴：江东后来的都督与守将
  { id: 'lusu', name: '鲁肃', faction: 'wu', home: 'chaisang', soldiers: { militia: 30, archer: 25, boat: 25 }, morale: 86, sight: 7, title: '赞军校尉' },
  { id: 'zhuhuan', name: '朱桓', faction: 'wu', home: 'kuaiji', soldiers: { militia: 30, spear: 30, cav: 15 }, morale: 82, sight: 6, title: '奋武将军' },
  { id: 'quancong', name: '全琮', faction: 'wu', home: 'jianye', soldiers: { militia: 30, spear: 25, boat: 15 }, morale: 76, sight: 6, title: '绥南将军' },
  { id: 'panzhang', name: '潘璋', faction: 'wu', home: 'danyang', soldiers: { militia: 25, archer: 20, boat: 10 }, morale: 80, sight: 7, title: '偏将军' },
  { id: 'jiangqin', name: '蒋钦', faction: 'wu', home: 'chaisang', soldiers: { militia: 28, archer: 22, boat: 18 }, morale: 82, sight: 7, title: '讨越中郎将' },

  // ---- 名将榜补录：原先名单里没有、按榜单补进来的领主 ----
  { id: 'sunce', name: '孙策', faction: 'wu', home: 'wujun', soldiers: { cav: 35, spear: 30, danyang: 22, boat: 15 }, morale: 95, sight: 8, title: '讨逆将军' },
  { id: 'zhangxiu', name: '张绣', faction: 'biao', home: 'wan', soldiers: { cav: 35, spear: 30, crossbow: 12, militia: 18 }, morale: 86, sight: 7, title: '建忠将军' },
  { id: 'wenyang', name: '文鸯', faction: 'wei', home: 'qiao', soldiers: { cav: 40, spear: 28, militia: 15 }, morale: 92, sight: 8, title: '牙门将' },
  { id: 'dengai', name: '邓艾', faction: 'wei', home: 'runan', soldiers: { spear: 35, crossbow: 28, cav: 22, militia: 15 }, morale: 88, sight: 9, title: '征西将军' },
  { id: 'jiangwei', name: '姜维', faction: 'shu', home: 'shangyong', soldiers: { spear: 35, crossbow: 22, cav: 22, militia: 15 }, morale: 90, sight: 8, title: '奉义将军' },
  { id: 'wangshuang', name: '王双', faction: 'wei', home: 'chenliu', soldiers: { cav: 35, spear: 30, militia: 18 }, morale: 84, sight: 7, title: '虎威将军' },
  { id: 'caozhang', name: '曹彰', faction: 'wei', home: 'puyang', soldiers: { cav: 40, spear: 25, militia: 20 }, morale: 90, sight: 8, title: '任城王' },
  { id: 'huaxiong', name: '华雄', faction: 'han', home: 'tongguan', soldiers: { cav: 35, spear: 38, militia: 20 }, morale: 86, sight: 7, title: '都督' },
  { id: 'guanhai', name: '管亥', faction: 'yuan', home: 'beihai', soldiers: { militia: 40, spear: 30, huangjin: 10 }, morale: 82, sight: 6, title: '黄巾渠帅' },
  { id: 'ehuang', name: '鄂焕', faction: 'nanman', home: 'jianning', soldiers: { spear: 35, militia: 25, wudang: 10 }, morale: 82, sight: 7, title: '越嶲夷帅' },
  { id: 'liyan', name: '李严', faction: 'zhang', home: 'jiangzhou', soldiers: { spear: 35, crossbow: 25, militia: 20 }, morale: 84, sight: 7, title: '兴业将军' },
  { id: 'wulan', name: '吴兰', faction: 'zhang', home: 'baxi', soldiers: { militia: 35, spear: 22, cav: 12 }, morale: 78, sight: 6, title: '裨将' },
  { id: 'wuangou', name: '武安国', faction: 'yuan', home: 'beihai', soldiers: { spear: 35, militia: 25, guard: 8 }, morale: 80, sight: 6, title: '校尉' },
  { id: 'xingdaorong', name: '邢道荣', faction: 'biao', home: 'wuling', soldiers: { spear: 30, militia: 28, cav: 10 }, morale: 76, sight: 6, title: '零陵上将' },
  { id: 'zhangbao', name: '张苞', faction: 'shu', home: 'xinye', soldiers: { spear: 35, militia: 20, cav: 15 }, morale: 86, sight: 7, title: '牙门将' },
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

/** 装备：十档，越往后价钱翻着涨，别想一进城就把一身换满 */
const EQUIPMENT = {
  blade: {
    slot: 'blade', name: '兵刃',
    tiers: [
      { id: 'blade0', name: '环首刀', price: 0, atkPct: 0, desc: '洛阳溃兵身上仅剩的制式刀。' },
      { id: 'blade1', name: '百炼钢刀', price: 260, atkPct: 0.06, desc: '战团攻击 +6%。' },
      { id: 'blade2', name: '宿铁刀', price: 620, atkPct: 0.12, desc: '战团攻击 +12%。' },
      { id: 'blade3', name: '古锭刀', price: 1400, atkPct: 0.18, desc: '战团攻击 +18%。' },
      { id: 'blade4', name: '青釭剑', price: 3100, atkPct: 0.24, desc: '战团攻击 +24%。' },
      { id: 'blade5', name: '倚天剑', price: 6800, atkPct: 0.30, desc: '战团攻击 +30%。' },
      { id: 'blade6', name: '龙胆亮银枪', price: 15000, atkPct: 0.36, desc: '战团攻击 +36%。' },
      { id: 'blade7', name: '丈八蛇矛', price: 33000, atkPct: 0.42, desc: '战团攻击 +42%。' },
      { id: 'blade8', name: '青龙偃月刀', price: 72000, atkPct: 0.48, desc: '战团攻击 +48%。' },
      { id: 'blade9', name: '方天画戟', price: 160000, atkPct: 0.56, desc: '战团攻击 +56%，阵前一站，三军侧目。' },
    ],
  },
  armor: {
    slot: 'armor', name: '甲胄',
    tiers: [
      { id: 'armor0', name: '皮甲', price: 0, defPct: 0, desc: '挡不住弩，但比布衣强。' },
      { id: 'armor1', name: '玄铁札甲', price: 300, defPct: 0.07, desc: '战团防御 +7%。' },
      { id: 'armor2', name: '鱼鳞甲', price: 720, defPct: 0.13, desc: '战团防御 +13%。' },
      { id: 'armor3', name: '两当铠', price: 1600, defPct: 0.19, desc: '战团防御 +19%。' },
      { id: 'armor4', name: '锁子甲', price: 3500, defPct: 0.25, desc: '战团防御 +25%。' },
      { id: 'armor5', name: '明光铠', price: 7700, defPct: 0.31, desc: '战团防御 +31%，日光下晃眼。' },
      { id: 'armor6', name: '山文甲', price: 17000, defPct: 0.37, desc: '战团防御 +37%。' },
      { id: 'armor7', name: '玄甲', price: 37000, defPct: 0.43, desc: '战团防御 +43%，玄甲铁骑的底子。' },
      { id: 'armor8', name: '黄金甲', price: 81000, defPct: 0.49, desc: '战团防御 +49%。' },
      { id: 'armor9', name: '兽面吞头连环铠', price: 180000, defPct: 0.56, desc: '战团防御 +56%，刀箭难入。' },
    ],
  },
  horse: {
    slot: 'horse', name: '坐骑',
    tiers: [
      { id: 'horse0', name: '驮马', price: 0, speedPct: 0, desc: '能驮粮，不能冲阵。' },
      { id: 'horse1', name: '并州马', price: 340, speedPct: 0.10, desc: '行军速度 +10%。' },
      { id: 'horse2', name: '西凉马', price: 800, speedPct: 0.19, desc: '行军速度 +19%。' },
      { id: 'horse3', name: '辽东马', price: 1800, speedPct: 0.27, desc: '行军速度 +27%。' },
      { id: 'horse4', name: '大宛马', price: 3900, speedPct: 0.34, desc: '行军速度 +34%。' },
      { id: 'horse5', name: '绝影', price: 8500, speedPct: 0.40, desc: '行军速度 +40%，箭追不上。' },
      { id: 'horse6', name: '的卢', price: 18500, speedPct: 0.46, desc: '行军速度 +46%。' },
      { id: 'horse7', name: '爪黄飞电', price: 40000, speedPct: 0.51, desc: '行军速度 +51%。' },
      { id: 'horse8', name: '照夜玉狮子', price: 86000, speedPct: 0.56, desc: '行军速度 +56%。' },
      { id: 'horse9', name: '赤兔', price: 190000, speedPct: 0.62, desc: '行军速度 +62%，人中吕布，马中赤兔。' },
    ],
  },
};

/** 天机简：能改一次战局的一句话；只有增益，没有反噬 */
const HISTORY_MARKS = {
  wind: {
    id: 'wind', name: '南风起', text: '你写下“南风起”，整片战场忽然换了风向。',
    timing: 'battle', timingLabel: '战中生效',
    tierBoost: 2, fireMul: 2.00,
    desc: '本场我方攻防按高两阶结算：T1 打 T3、T2 打 T4、T3 打 T5、T4 可敌两个 T5；一人足以打四路同阶。火攻战再 +100%。',
  },
  fireball: {
    id: 'fireball', name: '天降火球', text: '你写下“天降火球”，天上坠下一团火。',
    timing: 'battle', timingLabel: '战中生效',
    burnPct: 0.40, burnCap: 80,
    desc: '立刻烧掉敌军四成兵力，单次最多 80 人；守城、野战、合战都能落。',
  },
  gale: {
    id: 'gale', name: '风行', text: '你写下“风行”，全军化作一阵风散出战场。',
    timing: 'battle', timingLabel: '战中生效',
    escape: true, enemyLossPct: 0.10, pinHours: 8,
    desc: '立刻脱离战场，我军不再折人；敌军当场损失一成兵力，并在原地停 8 小时。',
  },
  night: {
    id: 'night', name: '夜袭', text: '你写下“夜袭”，敌营的火把一盏盏灭了。',
    timing: 'battle', timingLabel: '战中生效',
    enemyAtkMul: 0, rounds: 3,
    desc: '敌军接下来 3 回合完全打不出伤害，我军可以白打三回合。',
  },
  defector: {
    id: 'defector', name: '倒戈', text: '你写下“倒戈”，敌军阵中有人调转了枪头。',
    timing: 'battle', timingLabel: '战中生效',
    turnPct: 0.15, turnCap: 60,
    desc: '敌军一成半的士兵当场倒向我军，单次最多 60 人；倒戈的人立刻参战。',
  },
  miasma: {
    id: 'miasma', name: '瘴气', text: '你写下“瘴气”，林间的雾忽然浓得化不开。',
    timing: 'battle', timingLabel: '战中生效',
    attritionPct: 0.04, rounds: 5,
    desc: '敌军每回合额外折损当前兵力的 4%，连折 5 回合，越拖越虚。',
  },
  roll: {
    id: 'roll', name: '回魂', text: '你写下“回魂”，阵亡者的名字从纸上走回队列。',
    timing: 'after', timingLabel: '战后生效',
    backPct: 0.80,
    desc: '战后本场阵亡的我方士兵复活八成；战中落笔也留到这场打完再结算。',
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
    story: '洛阳城破那夜，你只带出九个人，往东跑。身后是西凉重步，脚下是结冰的护城河。\n你不是要赢，你只是要过桥。',
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
    reward: { renown: 80 },
    after: '白门楼上风很大。你做了那个决定，后来很多年都有人提起。',
  },
  {
    id: 'act3b', title: '幕间 · 白门楼的降卒',
    goal: '把队伍扩到 120 人，收拢吕布留下的旧部',
    story: '白门楼的血还没干，城外的降卒已经排成了长队。有人认得你腰上的刀，也有人只认得粮。\n你把名册摊在膝上，一页一页地看：这些人昨天还替吕布守城，今天愿意替谁守？',
    check: 'troops_120',
    reward: { renown: 55, gold: 220 },
    after: '一百二十人站满了校场。你把吕布的旧旗折起来，压在箱底。',
  },
  {
    id: 'act3c', title: '幕间 · 寿春的粮市',
    goal: '到寿春，看看淮南的粮价',
    story: '寿春的城门前排着长队，粮袋却一天比一天轻。卖粮的老头说，西边已经三个月没下透雨。\n你买了两车粮，又听见有人在背后说：这天，怕是要变。',
    check: 'reach_shouchun',
    reward: { renown: 45, food: 55 },
    after: '粮车出了寿春。你回头看了一眼城头，旗还在，人心已经散了。',
  },
  {
    id: 'act3d', title: '幕间 · 夏口借船',
    goal: '到夏口，借一支能过江的船',
    story: '夏口的江面全是桅杆。黄祖的水军不让你靠岸，只肯卖你几条旧船。\n船板上有刀痕。船工说，上一任船主死在赤壁。',
    check: 'reach_xiakou',
    reward: { renown: 60, gold: 150 },
    after: '你站在船头，看见江对岸的烽火。南边的事，终于要来了。',
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
    title: '焚史', text: '你烧掉了所有天机简。\n从此谁也定不了谁，地图永远乱，你的兵永远不缺。',
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
  RIVER_WEI,
  RIVER_HAN,
  MOUNTAINS,
  SITE_ROWS,
  CAPITAL_IDS,
  FREE_CITY_IDS,
  RECRUIT_SETS,
  ROADS,
  BANDIT_EXCLUDE_ZONES,
  STRATEGIC_SITES,
  FACTIONS,
  FACTION_COMBAT,
  FACTION_RULERS,
  SUCCESSION,
  LORDS,
  RENOWN_TIERS,
  EQUIPMENT,
  HISTORY_MARKS,
  CAMPAIGN,
  ENDINGS,
  BATTLE_SITES,
};
