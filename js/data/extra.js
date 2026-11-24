/**
 * 扩展数据：商品、匪徒等级、英雄、领主台词、村庄货物
 * 与 china.js 分开，改平衡只动这个文件
 */

/* ---------------------------------------------------------------- 商品 */
/** base 基准价；spread 各地浮动幅度；unit 计量单位 */
const GOODS = [
  { id: 'grain', name: '粟米袋', base: 34, spread: 0.55, unit: '袋', desc: '关中最贱，河北最贵。灾年能翻一倍。' },
  { id: 'salt', name: '青盐', base: 96, spread: 0.75, unit: '担', desc: '海边晒的，山里缺的。走得越远越值钱。' },
  { id: 'iron', name: '铁锭', base: 178, spread: 0.6, unit: '块', desc: '并州、益州产铁。铸兵器的都要。' },
  { id: 'hide', name: '生皮', base: 72, spread: 0.5, unit: '张', desc: '鲜卑人拿它换盐，中原人拿它做甲。' },
  { id: 'cloth', name: '绢布', base: 132, spread: 0.6, unit: '匹', desc: '蜀锦最贵，荆襄最贱。' },
  { id: 'wine', name: '酒坛', base: 158, spread: 0.7, unit: '坛', desc: '官渡前夜，淳于琼帐里的灯亮到三更。' },
  { id: 'tea', name: '茶砖', base: 124, spread: 0.65, unit: '砖', desc: '南边压成砖，北边换马。' },
  { id: 'herb', name: '药材', base: 146, spread: 0.8, unit: '包', desc: '军中缺药，价钱就由药商说了算。' },
  { id: 'pot', name: '陶器', base: 58, spread: 0.45, unit: '件', desc: '沉，易碎，利润薄但稳。' },
  { id: 'horse', name: '马匹', base: 560, spread: 0.9, unit: '匹', desc: '凉州出好马。一匹顶百口粮。' },
];

/* ---------------------------------------------------------------- 匪徒 */
/**
 * 匪徒分四级：青（多、好打）、蓝（难一点）、橙（主线中段后才出）、红（接近领主）
 * share 为生成权重；pct 用于说明
 */
const BANDIT_TIERS = {
  qing: {
    id: 'qing', name: '劫匪', color: '#4f8f6a', rank: 1, share: 0.60,
    minSize: 6, maxSize: 12, extra: {},
    loot: [18, 40], morale: [50, 66], sight: 5,
    desc: '拦路要过路钱的散匪。人少，刀旧，打赢了够吃三天。',
  },
  lan: {
    id: 'lan', name: '黄巾军', color: '#4a7fb0', rank: 2, share: 0.30,
    minSize: 12, maxSize: 22, extra: { raider: [2, 4] },
    loot: [45, 90], morale: [58, 72], sight: 6,
    desc: '头裹黄巾的流民军。有刀有弓，也有一点信。',
  },
  cheng: {
    id: 'cheng', name: '乱军', color: '#c07a3c', rank: 3, share: 0.08,
    minSize: 24, maxSize: 38, extra: { raider: [4, 8], raider_cav: [2, 4] },
    loot: [110, 190], morale: [66, 80], sight: 7,
    desc: '溃下来的官军，旗号撕了，甲还在。有骑有弓，成建制地抢。',
  },
  hong: {
    id: 'hong', name: '叛军', color: '#a8403a', rank: 4, share: 0.02,
    minSize: 45, maxSize: 70, extra: { raider: [8, 14], raider_cav: [5, 10] },
    loot: [240, 420], morale: [78, 92], sight: 8,
    desc: '已经打出名号的叛部。只比领主差一线，碰上要么跑，要么备好天机简。',
  },
};

const BANDIT_NAMES = {
  qing: ['剪径劫匪', '断道劫匪', '饿虎岗劫匪', '黑店劫匪'],
  lan: ['白波黄巾', '黑山黄巾', '汝南黄巾', '太行黄巾'],
  cheng: ['凉州溃兵', '徐州乱军', '淮南乱军', '颍川乱军'],
  hong: ['西凉叛骑', '黑山飞燕', '泰山群盗', '汉中米贼'],
};

/** 主线推进到第几章开始出高阶匪徒 */
const BANDIT_UNLOCK_STAGE = { qing: 0, lan: 0, cheng: 2, hong: 3 };

/* ---------------------------------------------------------------- 英雄 */
/**
 * 不起眼的将领：能招募，随队不死，靠打仗升级（1-10）
 * power = atk/def 对队伍战力的加成系数来源
 */
const HEROES = [
  { id: 'liaohua', name: '廖化', site: 'xinye', cost: 220, atk: 5, def: 4, hp: 22, bio: '蜀中老将。早年做过山贼，后来跟着关羽，一直活到蜀汉灭亡那年。' },
  { id: 'zhoucang', name: '周仓', site: 'puyang', cost: 200, atk: 6, def: 4, hp: 24, bio: '给关羽扛刀的。据说跑得比马快，水里也能追。' },
  { id: 'madai', name: '马岱', site: 'tianshui', cost: 280, atk: 7, def: 5, hp: 26, bio: '马超的族弟。西凉败了以后，他一个人往南走，走到了蜀。' },
  { id: 'guanping', name: '关平', site: 'jiangling', cost: 260, atk: 6, def: 6, hp: 26, bio: '关羽的长子。跟着父亲守荆州，最后一夜没能突围。' },
  { id: 'lingtong', name: '凌统', site: 'wujun', cost: 260, atk: 7, def: 5, hp: 25, bio: '东吴的少年将。父亲死在甘宁箭下，后来两人却成了同袍。' },
  { id: 'xusheng', name: '徐盛', site: 'jianye', cost: 240, atk: 6, def: 6, hp: 27, bio: '江东守将。曹丕南征时，他在江上摆了一片假城。' },
  { id: 'dingfeng', name: '丁奉', site: 'chaisang', cost: 230, atk: 7, def: 5, hp: 25, bio: '东吴四朝老将。东兴一战，天寒雪大，他脱了甲往上冲。' },
  { id: 'huanggai', name: '黄盖', site: 'jiangling', cost: 250, atk: 6, def: 7, hp: 28, bio: '赤壁那晚，他挨了五十杖，然后带着火船过去了。' },
  { id: 'yanyan', name: '严颜', site: 'jiange', cost: 210, atk: 6, def: 6, hp: 27, bio: '巴郡太守。被张飞捉住时只说了一句：这里只有断头将军。' },
  { id: 'wangping', name: '王平', site: 'hanzhong', cost: 230, atk: 7, def: 6, hp: 28, bio: '不识几个字，却守得住街亭之后的那条路。' },
  { id: 'zhangyi', name: '张翼', site: 'chengdu', cost: 200, atk: 5, def: 7, hp: 27, bio: '益州旧将。跟着刘璋，后来又跟着刘备，一直守到剑阁。' },
  { id: 'lidian', name: '李典', site: 'ye', cost: 250, atk: 6, def: 7, hp: 28, bio: '曹操的旧部。逍遥津那一夜，他和张辽、乐进三个人守住了合肥。' },
  { id: 'yuejin', name: '乐进', site: 'guandu', cost: 240, atk: 7, def: 5, hp: 26, bio: '先登陷阵的常客。每回攻城，第一个上云梯的多半是他。' },
  { id: 'yujin', name: '于禁', site: 'puyang', cost: 220, atk: 6, def: 8, hp: 30, bio: '治军最严的一个。樊城被水淹了，他降了，后半生没抬起头。' },
  { id: 'caohong', name: '曹洪', site: 'luoyang', cost: 230, atk: 6, def: 6, hp: 27, bio: '荥阳那一战，他把自己的马让给了曹操，说天下可以没有曹洪。' },
  { id: 'zangba', name: '臧霸', site: 'xiapi', cost: 210, atk: 7, def: 5, hp: 25, bio: '泰山群盗出身，后来做了青徐的守将，海上的事他管得最清。' },
  // ---- 第二批：各地还能拉上船的 ----
  { id: 'haozhao', name: '郝昭', site: 'jiange', cost: 300, atk: 6, def: 8, hp: 30, bio: '守陈仓的那个。诸葛亮几万人攻了二十多天，城还在。' },
  { id: 'zhuran', name: '朱然', site: 'chaisang', cost: 270, atk: 7, def: 6, hp: 28, bio: '江东的守将。江陵被围，他在城里撑了半年。' },
  { id: 'huojun', name: '霍峻', site: 'jiangzhou', cost: 250, atk: 6, def: 8, hp: 29, bio: '几百人守葭萌关，一年多没丢。刘备入蜀，他在后头看着门。' },
  { id: 'zhangni', name: '张嶷', site: 'chengdu', cost: 240, atk: 7, def: 6, hp: 27, bio: '蜀中的戍将。南中那些年，路是他一寸一寸拓出来的。' },
  { id: 'lvdai', name: '吕岱', site: 'jiaozhi', cost: 230, atk: 6, def: 6, hp: 27, bio: '九十岁还在南方带兵。交州是他替东吴拿下来的。' },
  { id: 'sunhuan', name: '孙桓', site: 'wujun', cost: 220, atk: 6, def: 6, hp: 26, bio: '孙家的年轻人。夷陵那一仗，他守住了要道。' },
  { id: 'niujin', name: '牛金', site: 'hulao', cost: 210, atk: 7, def: 5, hp: 26, bio: '曹军的先锋。江陵城下，几百人冲过吴军的阵。' },
  { id: 'tianyu', name: '田豫', site: 'beiping', cost: 240, atk: 6, def: 7, hp: 28, bio: '守北边的人。乌桓、鲜卑都从他这一段绕过去。' },
  { id: 'qianzhao', name: '牵招', site: 'ji', cost: 230, atk: 6, def: 7, hp: 28, bio: '看着塞外那条线。风一起，他就知道谁要南下。' },
  { id: 'zhangyan', name: '张燕', site: 'heishan', cost: 250, atk: 8, def: 5, hp: 27, bio: '黑山里的头一号。几万人钻山沟，官军拿他没办法。' },
];

/**
 * 酒馆英雄自传：只写这个人自己走过的路，不写他曾经站在谁帐下。
 * 当前归属由英雄页按玩家国号动态补一行“现属……麾下”。
 */
const HERO_STORIES = {
  liaohua: '荆州山野出身，早年聚众自保。后来沿江转战，夷陵败后收拢残兵，护着老母一路西行。蜀亡那年仍在军中，是最后一批放下刀的人。',
  zhoucang: '河东人，脚力极好，能在水里追船。早年替人押镖，后来专扛长刀随军陷阵。荆州失守后，他守在麦城门外，没有退。',
  madai: '西凉人，少年时在马背上长大。潼关败后穿过陇山，一路南行入蜀。后来多次北伐，擅长带小队翻山截粮。',
  guanping: '荆州军中长大，弓马熟。襄樊之战随军北上，水淹七军时率舟师断后。麦城突围那夜，他留下守门。',
  lingtong: '吴郡人，十五岁就上了战船。父亲战死后，他每次冲阵都抢在最前。后来与旧仇同营，仍以军务为先。',
  xusheng: '琅琊人，早年带着乡勇南渡。曹丕南征时，他在江边连夜筑假城，把对岸看退。一生守在江东的潮线上。',
  dingfeng: '庐江人，历经四朝。东兴大雪夜，他脱甲持短刀先登，夺下城头。晚年仍能披甲巡江。',
  huanggai: '零陵人，早年走江湖。赤壁前夜挨了五十杖，诈降带火船冲入连环。火起时，他自己在船尾断后。',
  yanyan: '巴郡人，守城到粮尽。被擒后只留一句断头将军，不肯低头。后来仍带本部守山道。',
  wangping: '巴西人，识字不多。街亭之后收拢散兵，沿山道设旗，把追兵拖住。此后专守险隘，治军极严。',
  zhangyi: '益州人，先守成都，后守剑阁。每战先算粮道，再定进退。蜀亡时随军降，仍护着百姓出城。',
  lidian: '山阳人，喜读书，不好争功。逍遥津夜战，他与友军分守两门，把孙权的大军挡在城外。',
  yuejin: '阳平人，身材短小，先登第一。每回攻城，他扛着梯子走在最前。合肥城下，他的旗始终插在缺口。',
  yujin: '泰山人，治军最严。樊城大水，他带残兵登高，最终放下刀。后半生被人指着脊梁，仍每日整甲。',
  caohong: '沛国人，荥阳一战把马让给主公，自己步战断后。后来管粮，前线缺什么，他从后方押来。',
  zangba: '泰山人，少年聚众自保。后来守青徐，熟悉海路与盐场。谁走海路，都绕不开他的旗。',
  haozhao: '太原人，守陈仓。几万大军攻了二十多天，他带伤巡城，箭尽用石。城始终没破。',
  zhuran: '丹阳人，守江陵。围城半年，城中疫病，他把自己的口粮分给伤兵。援军到时，城头旗还在。',
  huojun: '南郡人，带几百人守葭萌。一年多的攻防，他把每一段城墙都修补了三次。',
  zhangni: '巴郡人，久在南中。开路、修桥、安抚部族，他带兵修出一条能走粮车的山道。',
  lvdai: '广陵人，九十岁仍南征。交州初定，他一边设郡，一边开盐场，把海边的路走熟。',
  sunhuan: '吴郡人，宗室子弟。夷陵之战守要道，被围后仍每日登城。',
  niujin: '南阳人，先锋出身。江陵城下带几百人冲阵，替后军打开缺口。',
  tianyu: '渔阳人，守北边数十年。乌桓、鲜卑南下，他先断粮道，再以小骑扰后。',
  qianzhao: '安平人，长在塞外。风起时能辨马蹄方向，多次在边境设伏。',
  zhangyan: '常山人，黑山头号。几万人钻山沟，官军围不住；他带人时总留一条退路。',
};

function heroStory(id) {
  if (HERO_STORIES[id]) return HERO_STORIES[id];
  const def = HEROES.filter(function (h) { return h.id === id; })[0];
  return def ? def.bio : '';
}

/** 每位英雄给队伍带来一样长处，随等级放大 */
const HERO_BONUS = {
  liaohua: { atk: 0.015, label: '老练：战团攻击微增' },
  zhoucang: { speed: 0.05, label: '跑得快：行军提速' },
  madai: { atk: 0.02, label: '西凉刀法：攻击 +2%' },
  guanping: { def: 0.025, label: '守阵：防御 +2.5%' },
  lingtong: { atk: 0.025, label: '锐气：攻击 +2.5%' },
  xusheng: { def: 0.03, label: '疑城：防御 +3%' },
  dingfeng: { speed: 0.04, label: '雪中先登：行军提速' },
  huanggai: { loot: 0.06, label: '火攻：缴获更多' },
  yanyan: { def: 0.03, label: '断头将军：防御 +3%' },
  wangping: { def: 0.025, label: '守隘：防御 +2.5%' },
  zhangyi: { food: 0.06, label: '会算粮：日耗减少' },
  lidian: { def: 0.02, label: '稳营：防御 +2%' },
  yuejin: { atk: 0.03, label: '先登：攻击 +3%' },
  yujin: { def: 0.035, label: '治军：防御 +3.5%' },
  caohong: { loot: 0.08, label: '救驾之功：缴获更多' },
  zangba: { speed: 0.04, loot: 0.05, label: '海路熟：行军快、缴获多' },
  haozhao: { def: 0.04, label: '守城：防御 +4%' },
  zhuran: { def: 0.03, label: '坚壁：防御 +3%' },
  huojun: { def: 0.035, label: '孤城：防御 +3.5%' },
  zhangni: { speed: 0.05, label: '开山道：行军提速' },
  lvdai: { morale: 2, label: '老将坐镇：每日士气 +2' },
  sunhuan: { atk: 0.02, label: '锐卒：攻击 +2%' },
  niujin: { atk: 0.03, label: '先冲：攻击 +3%' },
  tianyu: { morale: 2, label: '边塞老将：每日士气 +2' },
  qianzhao: { def: 0.025, label: '守边：防御 +2.5%' },
  zhangyan: { speed: 0.06, label: '钻山沟：行军提速' },
};

const HERO_MAX_LEVEL = 10;

/* ---------------------------------------------------------------- 领主台词 */

const LORD_TALK = {
  caocao: {
    greet: '你看我做什么？',
    bio: '曹操，沛国谯人。二十举孝廉，做洛阳北部尉时棒杀过蹇硕的叔父。讨董卓，诸侯都看着，只有他带兵追到荥阳，败得只剩几百人。',
    idle: [
      '在看舆图。这天下，缺口太多了。',
      '在等粮。粮不到，兵就是纸糊的。',
      '在写信。写给很多人，写得都一样。',
    ],
    warLine: '在和袁本初对峙。这一仗，谁先断粮谁就输。',
  },
  xiahou: {
    greet: '要打就快点。',
    bio: '夏侯惇，沛国谯人。早年替人出头，被人射瞎了一只眼，拔矢啖睛，从此军中都叫他盲夏侯。',
    idle: [
      '在点兵。少三个人，我得问清楚。',
      '在修营垒。土要一层一层夯。',
      '在喝粥。军中的粥，比肉香。',
    ],
    warLine: '在北边压着袁军的粮道，一天挪十里。',
  },
  zhangliao: {
    greet: '报上名来。',
    bio: '张辽，雁门马邑人。先跟丁原、吕布，白门楼之后归了曹操。合肥那一夜，八百人冲十万，江东从此不敢过江。',
    idle: [
      '在巡营。夜里最怕火。',
      '在练骑。马不熟，阵就散。',
      '在数箭。箭不够，守城就是空话。',
    ],
    warLine: '在盯着江东的动静。他们一动，我就动。',
  },
  liubei: {
    greet: '壮士，何处来？',
    bio: '刘备，涿郡人。织席卖履出身，讨黄巾起家。半生寄人篱下，四十岁还没有一块自己的地。',
    idle: [
      '在编草鞋。手不闲，心就静。',
      '在等一个人。他会来的。',
      '在和百姓说话。他们记得我。',
    ],
    warLine: '在和曹操抢粮。抢不到，就只能往南走。',
  },
  guanyu: {
    greet: '你的旗，是哪一路？',
    bio: '关羽，河东解良人。亡命到涿郡，遇上刘备。斩颜良于万众之中，水淹七军，最后败走麦城。',
    idle: [
      '在读《春秋》。读到一半，天就黑了。',
      '在擦刀。刀要亮，人才齐。',
      '在看北边。那里有我想杀的人。',
    ],
    warLine: '在围樊城，水已经放了一半。',
  },
  zhangfei: {
    greet: '站住！',
    bio: '张飞，涿郡人。长坂桥上一声吼，曹军不敢近。后来死于自己帐下的两个人手里。',
    idle: [
      '在喝酒。喝完就打。',
      '在骂人。骂完了照样请吃饭。',
      '在练矛。一矛下去，树折了。',
    ],
    warLine: '在守当阳桥。谁过来，我就吼他。',
  },
  sunquan: {
    greet: '江东的船，你坐过吗？',
    bio: '孙权，吴郡富春人。十八岁接兄长孙策的位置，赤壁一把火烧退曹操，此后坐断东南五十年。',
    idle: [
      '在看江。江水比人心好懂。',
      '在听人吵。吵完我就知道该用谁。',
      '在数船。少一艘，江就漏风。',
    ],
    warLine: '在和曹操隔江对望，谁先动谁吃亏。',
  },
  zhouyu: {
    greet: '你懂风向吗？',
    bio: '周瑜，庐江舒人。二十四岁做建威中郎将，江东人都叫他周郎。赤壁那一夜，东南风起，他把火点在了该点的地方。',
    idle: [
      '在听风。今天不对。',
      '在算粮。十万人的嘴，不是小数。',
      '在弹琴。弹错了也不停。',
    ],
    warLine: '在赤壁布火船。等一场东南风。',
  },
  taishici: {
    greet: '来比一场？',
    bio: '太史慈，东莱黄人。为了报恩，单骑出城突围。后来跟了孙策，箭术江东第一。',
    idle: [
      '在射箭。一百步，中了。',
      '在带新兵。他们的手在抖。',
      '在等孙策。他答应过要回来。',
    ],
    warLine: '在盯着豫章的渡口，那边有我要找的人。',
  },
  yuanshao: {
    greet: '四世三公的门，你进得来吗？',
    bio: '袁绍，汝南汝阳人。四世三公之后，据河北四州，带甲十万。官渡之前，天下人都以为他会赢。',
    idle: [
      '在议事。议了三天，还没议完。',
      '在看降表。每天都有人来降。',
      '在喝酒。这酒是冀州最好的。',
    ],
    warLine: '在官渡和曹操耗着。我的粮比他多。',
  },
  yanliang: {
    greet: '前面那个，别挡道。',
    bio: '颜良，河北名将。袁绍麾下第一勇，白马之战，被关羽一骑冲阵斩于麾盖之下。',
    idle: [
      '在磨刀。刀口卷了。',
      '在看阵。对面那排枪，站得不齐。',
      '在骂粮官。粮又晚了。',
    ],
    warLine: '在白马列阵。今天要过去。',
  },
  lvbu: {
    greet: '方天画戟，认得么？',
    bio: '吕布，五原九原人。人中吕布，马中赤兔。杀了丁原、董卓，占了徐州，最后困在下邳白门楼。',
    idle: [
      '在饮马。这匹马只认我。',
      '在练戟。一戟下去，木桩断了三根。',
      '在等人送粮。陈宫说快到了。',
    ],
    warLine: '在下邳城里。曹操的水，围了三面。',
  },
  gaoshun: {
    greet: '陷阵营，不许退。',
    bio: '高顺，吕布麾下。所带七百余人，号陷阵营，攻无不破。吕布败后，他一句话没求，就死了。',
    idle: [
      '在整甲。甲叶子要一片片扣。',
      '在巡城。城墙的裂缝我记着。',
      '在罚人。军法不能松。',
    ],
    warLine: '在小沛驻着，随时能出。',
  },
  liubiao: {
    greet: '荆州八郡，还算安稳。',
    bio: '刘表，山阳高平人。单骑入荆州，收服宗贼，坐守二十年。他不动，别人也不动他。',
    idle: [
      '在宴客。荆襄的士人都在。',
      '在看书。看了半卷，困了。',
      '在听蔡瑁说话。听着，不答。',
    ],
    warLine: '在襄阳按兵。北边打起来，我这边先看看。',
  },
  caimao: {
    greet: '水军的账，你要看？',
    bio: '蔡瑁，襄阳人。荆州水军的头，也是刘表妻族。后来降了曹操，做了水军都督，死在周瑜的反间计里。',
    idle: [
      '在点船。江面上少了两艘。',
      '在算账。这个月的军饷又超了。',
      '在看江雾。雾一起，什么都看不见。',
    ],
    warLine: '在江陵练水军，等着北边的号令。',
  },
  liuzhang: {
    greet: '益州天府，可惜我守得累。',
    bio: '刘璋，江夏竟陵人。接了父亲刘焉的益州，性子软。请刘备入川帮忙，最后把自己请了出去。',
    idle: [
      '在收租。今年的租，收得勉强。',
      '在犹豫。张鲁在北边，刘备在东边。',
      '在听曲。听了就忘了烦。',
    ],
    warLine: '在成都城里，防着北边的张鲁。',
  },
  zhangren: {
    greet: '剑阁的门，我关着。',
    bio: '张任，蜀郡人。刘璋麾下最硬的将。雒城一战射死庞统，后来被擒，不肯降。',
    idle: [
      '在守隘。这地方一个人能挡一百个。',
      '在练兵。弓要拉满才算练过。',
      '在画图。山路我走过三遍。',
    ],
    warLine: '在雒城设伏，等一个入川的人。',
  },
  kebineng: {
    greet: '草原上的规矩，你不懂。',
    bio: '轲比能，鲜卑小帅出身。统一漠南诸部，控弦十余万，曹操、曹丕都拿他没办法。',
    idle: [
      '在放马。马群跑起来像云。',
      '在分肉。分得公平，就没人闹。',
      '在望南边。南边的城，墙都很矮。',
    ],
    warLine: '在阴山南麓游动，等边关换防。',
  },
  mateng: {
    greet: '凉州的马，你骑得住吗？',
    bio: '马腾，扶风茂陵人。凉州军阀，和马超一起反过曹操，后来入朝做人质，死于许都。',
    idle: [
      '在挑马。这一匹前腿好。',
      '在和后生比箭。输赢都不重要。',
      '在等儿子回来。他总在打。',
    ],
    warLine: '在渭水边上列阵，和曹军隔着河。',
  },
  machao: {
    greet: '锦马超，听说过？',
    bio: '马超，扶风茂陵人。潼关一战杀得曹操割须弃袍。后来投了刘备，做了蜀汉的骠骑将军。',
    idle: [
      '在洗马。马比人干净。',
      '在练冲阵。三十步内，没人挡得住。',
      '在看西边。那里埋着我的家。',
    ],
    warLine: '在潼关外，等着冲一次。',
  },
  huangfusong: {
    greet: '汉家的旗，还没倒。',
    bio: '皇甫嵩，安定朝那人。平黄巾的第一功是他立的，长社一把火，烧了波才十万众。',
    idle: [
      '在整军。乱世里，军纪最值钱。',
      '在写表。写给朝廷，多半没人看。',
      '在看城。长安的城墙，比十年前旧了。',
    ],
    warLine: '在长安整兵，等朝廷一句话。',
  },
};

/* ---------------------------------------------------------------- 村庄 */
const VILLAGE_FOOD = [
  { id: 'ox', name: '耕牛', price: 180, food: 60, stockMax: 1, desc: '一头牛换六十口粮。村里人舍不得，但给钱就卖。' },
  { id: 'sheep', name: '羊', price: 70, food: 22, stockMax: 2, desc: '两只羊够一队人吃两天。' },
  { id: 'chicken', name: '鸡鸭', price: 26, food: 8, stockMax: 4, desc: '零碎换的，胜在便宜。' },
  { id: 'grain', name: '谷子', price: 40, food: 30, stockMax: 3, desc: '村里自己的存粮，价比城里低。' },
  { id: 'veg', name: '菜蔬', price: 18, food: 6, stockMax: 5, desc: '地里刚拔的，撑不了几天。' },
];

/**
 * 每位领主长得不一样：兵器、头饰、披风、马色
 * weapon: ji 戟 / dao 刀 / qiang 枪 / gong 弓 / jian 剑
 * helm:   plume 双翎 / horn 红缨盔 / crown 高冠 / band 头巾
 */
const LORD_LOOK = {
  caocao: { weapon: 'jian', helm: 'crown', cape: '#7a2118', horse: '#2a2320' },
  xiahou: { weapon: 'dao', helm: 'horn', cape: '#4a2a20', horse: '#6a3a24' },
  zhangliao: { weapon: 'qiang', helm: 'horn', cape: '#3a4a58', horse: '#4a4440' },
  liubei: { weapon: 'jian', helm: 'crown', cape: '#c9c2ae', horse: '#7a6a52' },
  guanyu: { weapon: 'dao', helm: 'band', cape: '#2f6a3a', horse: '#8a5a36', beard: true, tall: true },
  zhangfei: { weapon: 'qiang', helm: 'horn', cape: '#2a2a2e', horse: '#2a2a2e', beard: true, big: true },
  sunquan: { weapon: 'jian', helm: 'crown', cape: '#4a3a68', horse: '#4a4440' },
  zhouyu: { weapon: 'jian', helm: 'band', cape: '#d8d2c0', horse: '#8a7a5c' },
  taishici: { weapon: 'gong', helm: 'horn', cape: '#3a5a52', horse: '#6a4a30' },
  yuanshao: { weapon: 'jian', helm: 'crown', cape: '#8a6a2a', horse: '#5a4030' },
  yanliang: { weapon: 'dao', helm: 'horn', cape: '#6a2a24', horse: '#5a3a26', big: true },
  lvbu: { weapon: 'ji', helm: 'plume', cape: '#b03a30', horse: '#6a2a22' },
  gaoshun: { weapon: 'qiang', helm: 'horn', cape: '#4a4a4e', horse: '#3a3430' },
  liubiao: { weapon: 'jian', helm: 'crown', cape: '#5a6a4a', horse: '#5a4a3a' },
  caimao: { weapon: 'gong', helm: 'band', cape: '#3a5a6a', horse: '#4a4440' },
  liuzhang: { weapon: 'jian', helm: 'crown', cape: '#6a5a2a', horse: '#6a5a42' },
  zhangren: { weapon: 'qiang', helm: 'horn', cape: '#5a4a2a', horse: '#4a3a28' },
  kebineng: { weapon: 'gong', helm: 'band', cape: '#7a6a3a', horse: '#c9c2ae' },
  mateng: { weapon: 'qiang', helm: 'horn', cape: '#4a5a6a', horse: '#c9c2ae' },
  machao: { weapon: 'qiang', helm: 'horn', cape: '#d8d2c0', horse: '#e2dcd0' },
  huangfusong: { weapon: 'jian', helm: 'crown', cape: '#5a4a3a', horse: '#4a4440' },
};

/** 后补领主的史实一句（台词主体仍走 LORD_TALK，缺省时用势力通用池） */
const LORD_EXTRA_BIO = {
  caoren: '曹仁，曹操从弟。守樊城，关羽水淹七军，他还站在城墙上。',
  xiahouyuan: '夏侯渊，夏侯惇族弟。军中说他三日五百、六日一千，关中的路是他跑出来的。',
  xuhuang: '徐晃，河东杨人。治军像周亚夫，樊城一战长驱直入，曹操说他有古之名将风。',
  zhanghe: '张郃，河间鄚人。官渡投曹，后来在街亭断了马谡的水。',
  xuchu: '许褚，谯国谯人。年轻时拉着牛尾巴走了百步，曹操的虎卫头一号。',
  litong: '李通，江夏平春人。平叛路上病倒，曹操亲自为他吊丧。',
  zhaoyun: '赵云，常山真定人。长坂坡抱着孩子冲出来，一辈子没丢过阵。',
  huangzhong: '黄忠，南阳人。定军山一刀，夏侯渊的头就挂在了旗下。',
  weiyan: '魏延，义阳人。守汉中十年，敢走子午谷那条险路。',
  chendao: '陈到，汝南人。白毦兵的头，刘备最信的那一支。',
  liufeng: '刘封，长沙刘氏之后。上庸的兵是他带的，后来没去救关羽。',
  mizhu: '糜竺，东海朐人。徐州起家时的钱粮，一半是他出的。',
  ganning: '甘宁，巴郡临江人。锦帆贼出身，百骑劫营，回来一个没少。',
  lvmeng: '吕蒙，汝南富陂人。从吴下阿蒙到白衣渡江，只用了几年。',
  luxun: '陆逊，吴郡吴人。夷陵一把火，烧了刘备七百里连营。',
  chengpu: '程普，右北平土垠人。江东三代老将，周瑜也曾在他手下。',
  handang: '韩当，辽西令支人。从孙坚起就在，弓马一辈子。',
  wenchou: '文丑，河北名将。延津一战，死在乱军里。',
  chunyuqiong: '淳于琼，颍川人。乌巢守将，酒还没醒，火就起来了。',
  jiangyiqu: '蒋义渠，河北校尉。袁军的粮道，一半在他手上。',
  guotu: '郭图，颍川人。劝袁谭攻袁尚，兄弟就这样散了。',
  lvkuang: '吕旷，袁家校尉。后来与吕翔一同降了曹。',
  lvxiang: '吕翔，与吕旷同来的那一个。',
  chengong: '陈宫，东郡武阳人。放曹操一马，后来又要杀他。',
  houcheng: '侯成，吕布部将。下邳城破前，是他先开的门。',
  songxian: '宋宪，吕布部将。绑了陈宫出城的人之一。',
  weixu: '魏续，与宋宪同去的那一个。',
  huangzu: '黄祖，江夏太守。守了十几年，射死过孙坚。',
  wenpin: '文聘，南阳宛人。刘表死后守江夏，曹丕说他是真将。',
  zhangyun: '张允，荆州水军副将。船比人多。',
  wangwei: '王威，荆州牙门将。劝刘琮不要降，没人听。',
  wuyi: '吴懿，兖州陈留人。益州老将，妹妹嫁给了刘备。',
  leitong: '雷铜，巴西副将。与张飞同守一条线。',
  lengbao: '冷苞，守剑阁的裨将。粮草总是最紧。',
  liugui: '刘璝，成都城里的中郎将。名是宗室的。',
  suli: '素利，东部鲜卑大人。跟轲比能不一条心。',
  mijia: '弥加，漠南部帅。马比人多。',
  queji: '阙机，与素利争草场的小帅。',
  huaitou: '槐头，弹汗山下的小部。只有几百骑。',
  pufulu: '普富卢，代郡的鲜卑大人。汉人叫他"大人"，他叫自己"牧马的"。',
  zhongji: '种辑，越骑校尉。衣带诏上，签了名的还有他。',
  pangde: '庞德，南安狟道人。抬着棺材去樊城，射过关羽一箭。',
  maxiu: '马休，马腾之子。跟着父亲进了许都。',
  matie: '马铁，与马休一同的骑都尉。',
  chengyin: '程银，西凉九部之一。跟着马超反过。',
  zhujun: '朱儁，会稽上虞人。讨黄巾的三路之一，围宛城围了几个月。',
  luzhi: '卢植，涿郡涿人。刘备、公孙瓒都叫他老师，围广宗时被宦官换了。',
  dongcheng: '董承，汉献帝的国舅。衣带诏那件事，他是领头的人。',
  yangfeng: '杨奉，白波出身。护着天子往东走。',
};

/** 缺台词时的势力通用池 */
const FACTION_TALK = {
  wei: {
    greet: ['魏军大营，闲人退后。', '何事？军务在身。'],
    idle: ['在点粮。少一斗都要查。', '在看舆图，北边那条线要重画。', '在磨刀。刀不快，人就白死。'],
  },
  shu: {
    greet: ['来者何人？', '汉室的事，你也要管？'],
    idle: ['在看南边的山。路太窄。', '在清点伤员。今天又多了七个。', '在写信回成都，写完烧了。'],
  },
  wu: {
    greet: ['江上有雾，别乱走。', '有事说，船要开了。'],
    idle: ['在看水势。这个月风向不对。', '在补船板。木板比人金贵。', '在算粮。水路运粮，省一半。'],
  },
  yuan: {
    greet: ['河北的兵，不是给你看的。', '要见我，先报门第。'],
    idle: ['在等冀州的粮车。', '在看名册。人比册子少。', '在议立谁为主。这事没完。'],
  },
  lv: {
    greet: ['徐州城下，站住。', '我奉温侯之命守这儿。'],
    idle: ['在喂马。赤兔只认一个人。', '在修城门。前天刚撞坏。', '在等并州的旧部。他们还没来。'],
  },
  biao: {
    greet: ['荆州的规矩，先递名帖。', '江水深，话要短。'],
    idle: ['在听琴。城里没什么事。', '在查船。商船比战船多。', '在写表。写给许都，也写给江东。'],
  },
  zhang: {
    greet: ['益州的地界，你从哪儿来？', '天府之国，不缺你这一口饭。'],
    idle: ['在看粮仓。成都的米够吃三年。', '在修栈道。剑阁那条路总塌。', '在听外面的事。关中的消息总慢一步。'],
  },
  xianbei: {
    greet: ['草原上没主，谁的马快谁说了算。', '带了多少盐？'],
    idle: ['在放马。草场往北退了。', '在数牲口。今年雪大。', '在等南边来的铁器。'],
  },
  ma: {
    greet: ['西凉的风沙，吹得眼睛疼。', '羌骑在后头，别挡道。'],
    idle: ['在刷马。马比人耐得住。', '在看关中的方向。', '在分羊肉。今天只够一半人。'],
  },
  han: {
    greet: ['朝廷的旗还在，你要怎样？', '车骑将军帐下，不得喧哗。'],
    idle: ['在等诏书。诏书总在路上。', '在点残兵。名册越翻越薄。', '在看长安的城墙。补了三年还没补完。'],
  },
};

const LOOK_WEAPONS = ['ji', 'dao', 'qiang', 'gong', 'jian'];
const LOOK_HELMS = ['plume', 'horn', 'crown', 'band'];
const LOOK_CAPES = ['#7a2118', '#4a2a20', '#3a4a58', '#2f6a3a', '#4a3a68', '#8a6a2a', '#5a6a4a', '#3a5a6a', '#6a5a2a', '#4a5a6a'];
const LOOK_HORSES = ['#2a2320', '#6a3a24', '#4a4440', '#8a5a36', '#c9c2ae', '#e2dcd0', '#5a4030', '#3a3430'];
const LOOK_CACHE = {};
const LOOK_TAKEN = {};

/** 先查手写造型，没有就按 id 稳定生成一个不撞脸的 */
function lookFor(id) {
  if (LORD_LOOK[id]) return LORD_LOOK[id];
  if (LOOK_CACHE[id]) return LOOK_CACHE[id];
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 131 + id.charCodeAt(i)) >>> 0;
  for (let t = 0; t < 128; t += 1) {
    const k = (h + t * 7919) >>> 0;
    const look = {
      weapon: LOOK_WEAPONS[k % LOOK_WEAPONS.length],
      helm: LOOK_HELMS[Math.floor(k / 5) % LOOK_HELMS.length],
      cape: LOOK_CAPES[Math.floor(k / 20) % LOOK_CAPES.length],
      horse: LOOK_HORSES[Math.floor(k / 200) % LOOK_HORSES.length],
      beard: Math.floor(k / 1600) % 3 === 0,
      tall: Math.floor(k / 4800) % 5 === 0,
      big: Math.floor(k / 24000) % 6 === 0,
    };
    const key = [look.weapon, look.helm, look.cape, look.horse, look.beard, look.tall, look.big].join('|');
    if (!LOOK_TAKEN[key]) {
      LOOK_TAKEN[key] = id;
      LOOK_CACHE[id] = look;
      return look;
    }
  }
  const fallback = { weapon: 'qiang', helm: 'band', cape: LOOK_CAPES[0], horse: LOOK_HORSES[0] };
  LOOK_CACHE[id] = fallback;
  return fallback;
}

module.exports = {
  GOODS,
  BANDIT_TIERS,
  BANDIT_NAMES,
  BANDIT_UNLOCK_STAGE,
  HEROES,
  HERO_STORIES,
  heroStory,
  HERO_BONUS,
  HERO_MAX_LEVEL,
  LORD_TALK,
  LORD_EXTRA_BIO,
  FACTION_TALK,
  LORD_LOOK,
  lookFor,
  VILLAGE_FOOD,
};
