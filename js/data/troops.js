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
    id: 'tiefu', name: '西凉重步', tier: 4, atk: 20, def: 14, hp: 36, food: 3, recruit: 176, cav: false, renownReq: 180,
    desc: '凉州重甲步卒，持长刀大盾。走得慢，正面极硬。',
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

/* ---------------------------------------------------------------- 各国兵种
 *
 * n59：每个势力一套自己的 T1-T4（魏蜀吴另有 T5），
 * 招募严格按“当前管辖势力”出牌；旧的基础兵种继续留给匪团、叛军、
 * 无旗玩家与边陲小镇使用，避免旧档和特殊玩法断链。
 */

const FACTION_ROLE_STATS = {
  t1_inf: { atk: 6, def: 6, hp: 24, food: 1, recruit: 12 },
  t1_cav: { atk: 7, def: 6, hp: 24, food: 2, recruit: 18, cav: true },
  t1_naval: { atk: 6, def: 6, hp: 24, food: 2, recruit: 16, naval: true },
  t2_inf: { atk: 9, def: 11, hp: 26, food: 1, recruit: 30 },
  t2_ranged: { atk: 12, def: 5, hp: 20, food: 1, recruit: 34, ranged: true },
  t2_cav: { atk: 13, def: 7, hp: 28, food: 3, recruit: 56, cav: true },
  t2_naval: { atk: 10, def: 8, hp: 24, food: 2, recruit: 54, naval: true },
  t3_inf: { atk: 14, def: 12, hp: 32, food: 1, recruit: 78 },
  t3_guard: { atk: 15, def: 13, hp: 34, food: 1, recruit: 88 },
  t3_ranged: { atk: 14, def: 4, hp: 20, food: 1, recruit: 46, ranged: true, pierce: true },
  t3_cav: { atk: 15, def: 8, hp: 30, food: 3, recruit: 64, cav: true },
  t3_cav_ranged: { atk: 13, def: 7, hp: 28, food: 3, recruit: 70, cav: true, ranged: true },
  t3_naval: { atk: 13, def: 8, hp: 26, food: 2, recruit: 86, naval: true },
  t4_cav: { atk: 18, def: 13, hp: 36, food: 3, recruit: 118, cav: true },
  t4_heavy: { atk: 19, def: 14, hp: 38, food: 3, recruit: 132, cav: true },
  t4_inf: { atk: 17, def: 15, hp: 38, food: 1, recruit: 128 },
  t4_guard: { atk: 18, def: 16, hp: 40, food: 1, recruit: 150, renownReq: 120 },
  t4_naval: { atk: 18, def: 14, hp: 40, food: 2, recruit: 150, naval: true },
  t5_cav: { atk: 26, def: 21, hp: 58, food: 3, recruit: 360, cav: true },
  t5_ranged: { atk: 29, def: 16, hp: 52, food: 2, recruit: 360, ranged: true, pierce: true },
  t5_naval: { atk: 27, def: 21, hp: 60, food: 2, recruit: 360, naval: true },
};

const FACTION_DEFS = {
  wei: {
    label: '曹魏', t5: true,
    units: [
      ['t1', '郡国步卒', 't1_inf', '郡国征发的常备步卒，队列整齐，能顶住第一轮冲阵。'],
      ['t2', '谯沛锐卒', 't2_inf', '曹操从谯沛带出的旧部，乡党为骨，进退不乱。'],
      ['t3a', '虎豹轻骑', 't3_cav', '虎豹骑的轻装前哨，擅长长途奔袭与侧翼包抄。'],
      ['t3b', '大黄劲弩卒', 't3_ranged', '列装大黄强弩的精锐弩兵，远程破甲能力突出。'],
      ['t4', '陷阵重骑', 't4_heavy', '人马俱甲的重骑，正面撞阵时像一堵会动的墙。'],
      ['t5', '虎豹禁骑', 't5_cav', '虎豹骑中的禁卫，只有魏主与武力榜最前列的猛将能统率。'],
    ],
  },
  shu: {
    label: '蜀汉', t5: true,
    units: [
      ['t1', '蜀地征卒', 't1_inf', '益州征来的乡卒，脚力好，能走山路。'],
      ['t2', '巴渝弩卒', 't2_ranged', '巴渝山地征召的进阶弩兵，适配山地作战。'],
      ['t3a', '无当飞军', 't3_inf', '南中劲卒，山地如平地，翻山越岭不减速。', { hill: true }],
      ['t3b', '青羌劲弩手', 't3_ranged', '青羌部族组建的精锐弩兵，善走险地、射速迅猛。', { hill: true }],
      ['t4', '白毦亲卫', 't4_guard', '白毦为饰，士气锁死，不溃不散。', { lock: true }],
      ['t5', '元戎神弩营', 't5_ranged', '蜀汉倾国之力打造的元戎连弩营，箭雨能压住整片阵线。'],
    ],
  },
  wu: {
    label: '东吴', t5: true,
    units: [
      ['t1', '山越乡卒', 't1_inf', '山越寨子里征来的乡卒，丛林水网都能走。'],
      ['t2', '山越健卒', 't2_inf', '山越族群选拔的进阶步兵，丛林水网作战娴熟。'],
      ['t3a', '解烦卫', 't3_guard', '孙权帐下的禁军精锐，专门解围救急。'],
      ['t3b', '濡须劲弩卒', 't3_ranged', '濡须防线部署的江防弩兵，水战陆战双适配。'],
      ['t4', '锦帆斗舰军', 't4_naval', '锦帆斗舰上的水军死士，接舷之后比陆战还凶。'],
      ['t5', '横江艨艟死士', 't5_naval', '横江拒敌的艨艟死士，船在人在，船沉人亡。', { lock: true }],
    ],
  },
  lv: {
    label: '吕布', t5: false,
    units: [
      ['t1', '并州骑卒', 't1_cav', '并州边地征来的骑卒，马术比步战熟。'],
      ['t2', '九原轻骑', 't2_cav', '九原出身的进阶轻骑兵，弓马娴熟。'],
      ['t3a', '陷阵营', 't3_guard', '高顺练出来的重装精锐步兵，攻城陷阵，无坚不摧。'],
      ['t3b', '九原劲弩卒', 't3_ranged', '并州善射士卒组建，骑射步射皆精。'],
      ['t4', '并州狼骑', 't4_cav', '吕布麾下最能冲的狼骑，来去如狼。'],
    ],
  },
  yuan: {
    label: '袁绍', t5: false,
    units: [
      ['t1', '河北乡卒', 't1_inf', '河北州县征来的乡卒，人多粮足，甲仗一般。'],
      ['t2', '邺都弩卒', 't2_ranged', '邺城直辖的进阶弩兵，训练规范。'],
      ['t3a', '大戟士', 't3_guard', '袁绍帐下的重装护卫步兵，长戟如林。'],
      ['t3b', '黎阳劲弩营', 't3_ranged', '黎阳重镇驻防的精锐弩兵，阵列齐射威力强。'],
      ['t4', '先登死士', 't4_inf', '攻城时第一个登上城头的死士，退后者斩。', { lock: true }],
    ],
  },
  gongsun: {
    label: '公孙瓒', t5: false,
    units: [
      ['t1', '幽州边卒', 't1_inf', '幽州边郡的戍卒，守边多年，能吃苦。'],
      ['t2', '渔阳突骑', 't2_cav', '渔阳边郡的进阶轻骑兵，熟悉塞外作战。'],
      ['t3a', '白马义从', 't3_cav_ranged', '白马白袍的骑射精锐，塞外闻名。'],
      ['t3b', '右北平劲弩卒', 't3_ranged', '右北平边军下辖强弩部队，擅长守御关隘。'],
      ['t4', '幽州突骑重营', 't4_heavy', '幽州突骑里的重装营，人马俱甲，专撞敌阵。'],
    ],
  },
  han: {
    label: '汉廷', t5: false,
    units: [
      ['t1', '京畿戍卒', 't1_inf', '京畿征来的戍卒，守宫门比打野战熟。'],
      ['t2', '三辅锐卒', 't2_inf', '三辅地区选拔的进阶步兵，为中央军主力。'],
      ['t3a', '羽林郎', 't3_guard', '羽林卫里的宫廷精锐侍卫，甲仗鲜亮。'],
      ['t3b', '羽林劲弩手', 't3_ranged', '羽林卫下辖精锐弩兵，负责中枢远程护卫。'],
      ['t4', '虎贲禁军', 't4_guard', '汉家虎贲，最后一支还听诏书的禁军。', { lock: true }],
    ],
  },
  ma: {
    label: '马腾', t5: false,
    units: [
      ['t1', '西凉征骑', 't1_cav', '西凉征来的骑卒，马比甲多。'],
      ['t2', '陇西轻骑', 't2_cav', '陇西郡征召的进阶轻骑兵，熟悉羌地地形。'],
      ['t3a', '西凉铁骑', 't3_cav', '西凉铁骑，正面冲阵的硬手。'],
      ['t3b', '天水劲弩卒', 't3_ranged', '天水郡善射士卒组建，强弩破甲能力出众。'],
      ['t4', '马家亲卫骑', 't4_cav', '马氏宗族亲卫，骑术与忠诚都靠得住。'],
    ],
  },
  hansui: {
    label: '韩遂', t5: false,
    units: [
      ['t1', '羌胡步卒', 't1_inf', '羌胡部落征来的步卒，能走荒漠。'],
      ['t2', '湟中轻骑', 't2_cav', '湟中地区征召的进阶轻骑兵，擅长游击。'],
      ['t3a', '湟中羌骑', 't3_cav', '湟中羌族精锐骑兵，来去飘忽。'],
      ['t3b', '金城劲弩卒', 't3_ranged', '金城郡直辖的精锐弩兵，城守野战皆宜。'],
      ['t4', '韩氏义从骑', 't4_cav', '韩氏宗族义从，骑战老练。'],
    ],
  },
  nanman: {
    label: '南蛮', t5: false,
    units: [
      ['t1', '蛮民猎手', 't1_inf', '山里打猎的蛮民，弩箭和陷阱比军阵熟。', { hill: true }],
      ['t2', '藤盾锐卒', 't2_inf', '配备藤盾的进阶蛮族步兵，防御轻便。'],
      ['t3a', '象兵辅卒', 't3_inf', '随战象推进的辅卒，借象威压阵。', { hp: 38 }],
      ['t3b', '南蛮毒弩手', 't3_ranged', '装备淬毒竹弩，伏击与持续杀伤能力强。', { hill: true }],
      ['t4', '南蛮战象营', 't4_inf', '披甲战象与驭手组成的重阵，正面极难撼动。', { hp: 52, def: 16 }],
    ],
  },
  shanyue: {
    label: '南越', t5: false,
    units: [
      ['t1', '越民舟卒', 't1_naval', '交州水寨里的越民舟卒，撑船比走路快。'],
      ['t2', '交趾猎卒', 't2_inf', '交趾丛林猎人组成的进阶兵，擅长追踪。', { hill: true }],
      ['t3a', '交趾舟师', 't3_naval', '内河舟师，熟悉交州水道。'],
      ['t3b', '瘴林劲弩卒', 't3_ranged', '适配丛林伏击的淬毒弩兵，隐蔽性极强。', { hill: true }],
      ['t4', '南越死士营', 't4_inf', '南越诸洞的死士，退无可退时最凶。', { lock: true }],
    ],
  },
  biao: {
    label: '刘表', t5: false,
    units: [
      ['t1', '荆襄乡卒', 't1_inf', '荆襄州县征来的乡卒，守土尚可。'],
      ['t2', '江陵舟卒', 't2_naval', '江陵郡组建的进阶水军，熟悉长江水情。'],
      ['t3a', '荆襄强弩兵', 't3_ranged', '荆州原有的陆战精锐弩兵。'],
      ['t3b', '江汉舟弩手', 't3_ranged', '长江战船配属的水军弩兵，远程压制舰船。', { naval: true }],
      ['t4', '襄阳禁军', 't4_guard', '襄阳城内的禁军，守城经验丰富。'],
    ],
  },
  xianbei: {
    label: '鲜卑', t5: false,
    units: [
      ['t1', '控弦骑卒', 't1_cav', '鲜卑部落的控弦骑卒，从小在马背上长大。'],
      ['t2', '漠南突骑', 't2_cav', '漠南鲜卑部落的进阶轻骑兵，机动性极强。'],
      ['t3a', '鲜卑铁骑', 't3_cav', '鲜卑重装骑兵，冲阵时马蹄声先到。'],
      ['t3b', '草原骑弩士', 't3_cav_ranged', '擅长骑射游击的鲜卑弩骑兵，拉扯作战能力突出。'],
      ['t4', '单于亲卫骑', 't4_cav', '单于帐下的亲卫骑，马力最盛。'],
    ],
  },
  zhanglu: {
    label: '张鲁', t5: false,
    units: [
      ['t1', '教民戍卒', 't1_inf', '五斗米教教民组成的戍卒，守山门很认真。'],
      ['t2', '教团锐卒', 't2_inf', '教众组成的进阶步兵，忠诚度高。'],
      ['t3a', '义舍锐士', 't3_guard', '义舍里养出来的教团精锐步兵。'],
      ['t3b', '天师弩士', 't3_ranged', '天师道直辖的精锐弩兵，守城作战经验丰富。'],
      ['t4', '天师亲卫营', 't4_guard', '张鲁身边的亲卫营，政教合一的最后底牌。'],
    ],
  },
  // 附件没有列袁术、刘璋；这里按同一套层级补齐，避免这两家的城仍招旧兵。
  yuanshu: {
    label: '袁术', t5: false,
    units: [
      ['t1', '淮南乡卒', 't1_inf', '淮南州县征来的乡卒，兵多粮足，甲仗一般。'],
      ['t2', '寿春弩卒', 't2_ranged', '寿春直辖的进阶弩兵，训练还算规范。'],
      ['t3a', '仲氏宿卫', 't3_guard', '袁术称帝后编成的宿卫，旗号比战力响亮。'],
      ['t3b', '淮南劲弩营', 't3_ranged', '淮南重镇驻防的精锐弩兵，齐射威势不小。'],
      ['t4', '仲氏禁军', 't4_guard', '仲家朝廷的禁军，装备最好，士气看粮。'],
    ],
  },
  zhang: {
    label: '刘璋', t5: false,
    units: [
      ['t1', '益州乡卒', 't1_inf', '益州天府征来的乡卒，守城尚可。'],
      ['t2', '东州锐卒', 't2_inf', '东州兵出身的进阶步兵，是刘璋手里最能打的一支。'],
      ['t3a', '东州宿卫', 't3_guard', '东州旧部编成的宿卫，护着成都城门。'],
      ['t3b', '益州强弩兵', 't3_ranged', '益州本地强弩兵，守险隘有一手。'],
      ['t4', '成都禁军', 't4_guard', '成都城内的禁军，甲仗齐整，野战经验少。'],
    ],
  },
};

const FACTION_TROOPS = {};
const FACTION_SLOTS = {};
const FACTION_RECRUIT_SETS = {
  player: ['militia', 'spear', 'archer', 'crossbow', 'cav', 'heavy'],
  rebel: ['militia', 'spear', 'archer', 'cav'],
  bandit: [],
  none: ['militia', 'spear'],
};

Object.keys(FACTION_DEFS).forEach(function (faction) {
  const def = FACTION_DEFS[faction];
  const entry = { label: def.label, t5: null, units: [], slots: {} };
  def.units.forEach(function (row) {
    const slot = row[0];
    const name = row[1];
    const role = row[2];
    const desc = row[3];
    const extra = row[4] || {};
    const id = faction + '_' + slot;
    const unit = Object.assign({
      id: id,
      name: name,
      tier: Number(role.charAt(1)),
      faction: faction,
      slot: slot,
      desc: desc,
    }, FACTION_ROLE_STATS[role], extra);
    if (slot === 't5') {
      unit.t5 = true;
      entry.t5 = id;
    }
    TROOPS[id] = unit;
    entry.units.push(unit);
    entry.slots[slot] = id;
  });
  FACTION_TROOPS[faction] = entry;
  FACTION_SLOTS[faction] = entry.slots;
  FACTION_RECRUIT_SETS[faction] = entry.units.map(function (u) { return u.id; });
});

function factionTroopIds(faction, siteType) {
  const entry = FACTION_TROOPS[faction];
  let ids;
  if (entry) ids = entry.units.map(function (u) { return u.id; });
  else ids = (FACTION_RECRUIT_SETS[faction] || []).slice();
  if (siteType === 'village') {
    ids = ids.filter(function (id) { return TROOPS[id] && Number(TROOPS[id].tier) === 1; });
  }
  return ids;
}

function factionT5Id(faction) {
  return FACTION_TROOPS[faction] ? FACTION_TROOPS[faction].t5 : null;
}

function factionLabel(faction) {
  return FACTION_TROOPS[faction] ? FACTION_TROOPS[faction].label : (faction || '');
}

function t5FactionOf(troopId) {
  const t = TROOPS[troopId];
  return t && t.t5 ? t.faction : null;
}

/** 玩家是否已解锁某国 T5：加入该国，或亲手灭其国。 */
function t5UnlockedForPlayer(state, faction) {
  const p = state && state.player;
  if (!p || !faction || !factionT5Id(faction)) return false;
  if (p.faction === faction) return true;
  return !!(p.t5Unlocked && p.t5Unlocked[faction]);
}

/** T3 只看声望；T4 仍要投国或自立，再看声望。 */
const TIER_RENOWN_REQ = { 3: 200, 4: 500 };
/** 自立后自选兵源国的冷却：换一次锁 30 天。 */
const RECRUIT_SOURCE_COOLDOWN_DAYS = 30;

function playerHasBanner(state) {
  const p = state && state.player;
  return !!(p && p.faction && p.faction !== 'bandit');
}

function troopAccess(state, site, troopId) {
  const t = TROOPS[troopId];
  if (!t) return { ok: false, msg: '没有这种兵' };
  if (t.t5 && !t5UnlockedForPlayer(state, t.faction)) {
    return {
      ok: false,
      code: 't5-locked',
      msg: '需加入' + factionLabel(t.faction) + '，或灭其国',
    };
  }
  const tier = Number(t.tier) || 1;
  const tierReq = TIER_RENOWN_REQ[tier];
  if (tierReq) {
    // n64：T3 只需声望 200，不再要求投国或自立；T4 仍要有旗。
    if (tier >= 4 && !playerHasBanner(state)) {
      return {
        ok: false,
        code: 'banner',
        msg: 'T' + tier + ' 需先投国或自立，声望 ' + tierReq,
      };
    }
    if (!state.player || state.player.renown < tierReq) {
      return {
        ok: false,
        code: 'renown',
        msg: '声望不足 ' + tierReq + '，招不到' + t.name,
      };
    }
  }
  if (t.renownReq && (!state || !state.player || state.player.renown < t.renownReq)) {
    return { ok: false, code: 'renown', msg: '声望不足' + t.renownReq + '，招不到' + t.name };
  }
  return { ok: true };
}

function stockCapFor(site, troopId) {
  const t = TROOPS[troopId];
  if (t && t.t5) return 2;
  return (site && site.recruitCap) || 4;
}

function seedStockFor(site, troopId) {
  const cap = stockCapFor(site, troopId);
  let h = 0;
  const key = String((site && site.id) || '') + ':' + troopId;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 9973;
  return 1 + h % cap;
}

function effectiveSiteFaction(state, site) {
  if (!site) return null;
  const owner = site.ownerFaction;
  if (owner !== 'player') return owner;
  const p = state && state.player;
  if (p && p.faction && p.faction !== 'player' && FACTION_TROOPS[p.faction]) return p.faction;
  // 自立后选了兵源国：所有自己的城统一用这套兵源。
  if (p && p.faction === 'player' && p.country && p.recruitFaction &&
      FACTION_TROOPS[p.recruitFaction]) {
    return p.recruitFaction;
  }
  // 自立/无旗玩家未选兵源：沿用这块地方原本的兵源文化；没有文化才用通用兵。
  if (site.originFaction && FACTION_TROOPS[site.originFaction]) return site.originFaction;
  return 'player';
}

/**
 * 按当前管辖势力重建据点的兵源牌。
 * 城、关：T1-T5；村：只出 T1。
 * 玩家已灭国的 T5 会作为“降卒”额外挂到玩家自己的城下。
 */
function syncSiteRecruitList(site, faction, state) {
  if (!site) return [];
  let ids = factionTroopIds(faction, site.type);
  if (site.playerOwned && state && state.player) {
    const p = state.player;
    const unlocked = p.t5Unlocked || {};
    Object.keys(unlocked).forEach(function (f) {
      const id = factionT5Id(f);
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    if (p.faction && p.faction !== 'player') {
      const ownT5 = factionT5Id(p.faction);
      if (ownT5 && ids.indexOf(ownT5) < 0) ids.push(ownT5);
    }
  }
  if (site.type === 'village') {
    ids = ids.filter(function (id) { return TROOPS[id] && Number(TROOPS[id].tier) === 1; });
  }
  site.recruitList = ids;
  site.recruitFaction = faction || null;
  site.recruits = site.recruits || {};
  site.lordRecruits = site.lordRecruits || {};
  ids.forEach(function (id) {
    if (site.recruits[id] === undefined) site.recruits[id] = seedStockFor(site, id);
    if (site.lordRecruits[id] === undefined) site.lordRecruits[id] = 1;
  });
  return ids;
}

function isInfantryUnit(id) {
  const t = TROOPS[id];
  return !!(t && !t.cav && !t.ranged && !t.naval);
}

function isNavalUnit(id) {
  const t = TROOPS[id];
  return !!(t && t.naval);
}

/** 旧兵种 → 当前势力对应槽位；只按兵种角色找最接近的一档。 */
function pickFactionSlot(oldId, slots) {
  const t = TROOPS[oldId];
  if (!t || !slots) return null;
  if (t.faction && slots[t.slot] === oldId) return oldId;
  const naval = !!t.naval;
  const cav = !!t.cav;
  const ranged = !!t.ranged;
  const tier = Number(t.tier) || 1;
  if (oldId === 'militia' || tier <= 1) return slots.t1 || slots.t3a || null;
  if (oldId === 'spear') {
    if (slots.t2 && isInfantryUnit(slots.t2)) return slots.t2;
    if (slots.t3a && isInfantryUnit(slots.t3a)) return slots.t3a;
    return slots.t1 || null;
  }
  if (oldId === 'archer') {
    if (slots.t2 && TROOPS[slots.t2].ranged) return slots.t2;
    if (slots.t3b) return slots.t3b;
    if (slots.t3a) return slots.t3a;
    return slots.t1 || null;
  }
  if (oldId === 'crossbow') return slots.t3b || slots.t3a || slots.t1 || null;
  if (oldId === 'cav') {
    if (slots.t3a && TROOPS[slots.t3a].cav) return slots.t3a;
    if (slots.t2 && TROOPS[slots.t2].cav) return slots.t2;
    if (slots.t4 && TROOPS[slots.t4].cav) return slots.t4;
    return slots.t1 || null;
  }
  if (oldId === 'qishe') {
    if (slots.t3a && TROOPS[slots.t3a].cav) return slots.t3a;
    if (slots.t2 && TROOPS[slots.t2].cav) return slots.t2;
    if (slots.t4 && TROOPS[slots.t4].cav) return slots.t4;
    return slots.t3b || slots.t1 || null;
  }
  if (oldId === 'boat' || oldId === 'huochuan' || naval) {
    if (slots.t3a && isNavalUnit(slots.t3a)) return slots.t3a;
    if (slots.t4 && isNavalUnit(slots.t4)) return slots.t4;
    if (slots.t2 && isNavalUnit(slots.t2)) return slots.t2;
    return slots.t1 || null;
  }
  if (tier >= 4 || oldId === 'jinjun') return slots.t4 || slots.t3a || slots.t1 || null;
  if (tier === 3) {
    if (cav && slots.t3a) return slots.t3a;
    if (ranged && slots.t3b) return slots.t3b;
    if (!cav && !ranged && slots.t3a) return slots.t3a;
    return slots.t3b || slots.t3a || slots.t1 || null;
  }
  if (tier === 2) {
    if (cav && slots.t2 && TROOPS[slots.t2].cav) return slots.t2;
    if (ranged && slots.t3b) return slots.t3b;
    if (slots.t2) return slots.t2;
  }
  return slots.t1 || null;
}

/**
 * 把任意旧编制折算成目标势力的兵种编制，总人数不变。
 * preserveT5：玩家换旗时保留已经到手的 T5，不把它折成 T4。
 */
function convertRosterToFaction(roster, faction, opts) {
  const slots = FACTION_SLOTS[faction];
  if (!roster || !slots) return JSON.parse(JSON.stringify(roster || {}));
  const preserveT5 = !!(opts && opts.preserveT5);
  const out = {};
  Object.keys(roster).forEach(function (id) {
    const n = roster[id] || 0;
    if (n <= 0) return;
    let target = null;
    const t = TROOPS[id];
    if (t && t.t5) {
      target = preserveT5 ? id : (slots.t4 || slots.t1);
    } else if (t && t.faction === faction) {
      target = id;
    } else {
      target = pickFactionSlot(id, slots);
    }
    if (!target) target = id;
    out[target] = (out[target] || 0) + n;
  });
  return out;
}

const TROOP_IDS = Object.keys(TROOPS);

/** 可招募的兵（不含匪类） */
const RECRUITABLE = [
  'militia', 'spear', 'archer', 'crossbow', 'cav', 'qishe', 'heavy',
  'guard', 'baier', 'wudang', 'danyang', 'boat', 'huochuan', 'xianbei',
  'tengri', 'tiefu', 'jinjun',
].concat(Object.keys(FACTION_TROOPS).reduce(function (list, f) {
  return list.concat(FACTION_TROOPS[f].units.map(function (u) { return u.id; }));
}, []));

function troopOf(id) {
  return TROOPS[id] || null;
}

module.exports = {
  TROOPS,
  TROOP_IDS,
  RECRUITABLE,
  troopOf,
  FACTION_TROOPS,
  FACTION_SLOTS,
  FACTION_RECRUIT_SETS,
  factionTroopIds,
  factionT5Id,
  factionLabel,
  t5FactionOf,
  t5UnlockedForPlayer,
  TIER_RENOWN_REQ,
  RECRUIT_SOURCE_COOLDOWN_DAYS,
  playerHasBanner,
  troopAccess,
  stockCapFor,
  seedStockFor,
  effectiveSiteFaction,
  syncSiteRecruitList,
  convertRosterToFaction,
};

