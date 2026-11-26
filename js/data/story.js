/**
 * 汉末战略：各国按历史走势分阶段用兵，不再随机开战。
 *
 * 这里只放配置与文案，状态机在 core/story.js。
 * 边缘小国不是完全不打仗：它们只打与本土相邻的城，做出骚扰内陆的样子，
 * 不向远处延伸；募兵速度减半，所以更容易被灭。
 */

const STORY = {
  label: '汉末战略',
  yearDays: 360,
  // “天下棋局”开局军情不在第一天弹出，留到第三天再报。
  openingEventDay: 3,
  // 剧情阶段不设超时：目标未达成，就不允许进入下一阶段。
  mandatoryAll: true,

  // 主动经营天下的大国；其余势力都是边缘/守成势力
  majors: ['wei', 'shu', 'wu'],
  kingdoms: ['wei', 'shu', 'wu'],
  duelFactions: ['yuan', 'gongsun'],
  passiveFactions: [
    'lv', 'yuanshu', 'biao', 'zhang', 'zhanglu',
    'xianbei', 'ma', 'hansui', 'nanman', 'shanyue', 'han',
  ],

  // 开局就不死不休的两家：袁绍—公孙瓒、南蛮—南越；马腾—韩遂—汉廷三方也互不收兵。
  noPeacePairs: [
    ['yuan', 'gongsun'],
    ['nanman', 'shanyue'],
    ['nanman', 'zhang'],
    ['shanyue', 'biao'],
    ['ma', 'hansui'],
    ['ma', 'han'],
    ['hansui', 'han'],
  ],
  // 凉州—关中的三方混战：开局即互相宣战，只在各自本土一城范围内争夺。
  tripleWar: ['ma', 'hansui', 'han'],
  // 牵制战：南蛮只下山打刘璋的野战领主，不围城；南越沿新开的武陵道北上，
  // 只取长沙以南的武陵/长沙/桂阳，不碰襄阳、江陵、夏口。
  proxyWars: {
    nanman: { target: 'zhang', mode: 'harass', siege: false },
    shanyue: { target: 'biao', mode: 'south', siegeSites: ['wuling', 'changsha', 'guiyang'] },
  },

  // 边缘部落：等大国第一阶段结束后再互相攻伐，只打与本土道路直接相邻的领土。
  edgeFactions: ['xianbei', 'ma', 'hansui', 'nanman', 'shanyue'],
  edgeWarDay: 90,

  // 荆州三点：襄阳第一、新野第二、江陵第三，三镇尽归一家即最终争霸之位。
  jingzhouSites: ['xiangyang', 'xinye', 'jiangling'],
  // 三家都完成第三阶段后，先休整一个月，再聚战荆州。
  jingzhouUnlockRestDays: 30,
  // 每一轮荆州争霸：占领方休整一个月，联盟两国同时多点开战。
  jingzhouCycleRestDays: 30,
  // 第 10 次循环不再休战，强势方与弱势联盟不死不休。
  jingzhouMaxCycles: 10,
  // 占领荆州三镇的国家，全国募兵效率 +20%。
  jingzhouStrongRecruitMul: 1.2,
  // 袁术称帝：曹、孙两国完成第一阶段后三天触发。
  emperorDelayDays: 3,
  emperorAttackers: ['wei', 'wu'],
  emperorTargets: ['yuanshu'],
  // 官渡昏君状态下的袁军对拼系数；一个袁绍兵抵不上三个曹兵。
  yuanWeakPower: 0.33,

  // 三国演义专属人事：削减吕布、刘表、刘璋的领主，给魏蜀吴袁各补新人。
  // 乱世三国不读取这些配置，仍用完整 LORDS 名单。
  lordCuts: {
    lv: ['chengong', 'houcheng', 'weixu'],
    biao: ['zhangyun', 'wangwei', 'liupan', 'huangshe'],
    zhang: ['liugui', 'gaopei'],
  },
  lordAdds: [
    { id: 'caozhen', name: '曹真', faction: 'wei', home: 'chenliu', title: '镇西将军', soldiers: { militia: 35, spear: 30, cav: 20, guard: 8 }, morale: 84, sight: 7 },
    { id: 'caoxiu', name: '曹休', faction: 'wei', home: 'qiao', title: '征东将军', soldiers: { militia: 30, spear: 25, cav: 25 }, morale: 82, sight: 7 },
    { id: 'xunyou', name: '荀攸', faction: 'wei', home: 'xuchang', title: '军师', soldiers: { militia: 20, spear: 18, crossbow: 18, guard: 5 }, morale: 80, sight: 7 },
    { id: 'wuban', name: '吴班', faction: 'shu', home: 'xinye', title: '牙门将', soldiers: { militia: 32, spear: 28, archer: 16 }, morale: 80, sight: 6 },
    { id: 'huojun', name: '霍峻', faction: 'shu', home: 'shangyong', title: '中郎将', soldiers: { spear: 35, militia: 25, archer: 18 }, morale: 86, sight: 7 },
    { id: 'masu', name: '马谡', faction: 'shu', home: 'xinye', title: '参军', soldiers: { militia: 22, spear: 18, crossbow: 15 }, morale: 74, sight: 6 },
    { id: 'huanggai', name: '黄盖', faction: 'wu', home: 'wujun', title: '丹阳都尉', soldiers: { militia: 30, archer: 28, boat: 22 }, morale: 86, sight: 6 },
    { id: 'zhuran', name: '朱然', faction: 'wu', home: 'jianye', title: '偏将军', soldiers: { militia: 28, spear: 25, boat: 18 }, morale: 82, sight: 6 },
    { id: 'sunshao', name: '孙韶', faction: 'wu', home: 'kuaiji', title: '广陵太守', soldiers: { militia: 30, archer: 22, cav: 15 }, morale: 80, sight: 7 },
    { id: 'quyi', name: '麴义', faction: 'yuan', home: 'pingyuan', title: '都督', soldiers: { militia: 35, spear: 45, crossbow: 20 }, morale: 82, sight: 7 },
    { id: 'tianfeng', name: '田丰', faction: 'yuan', home: 'ye', title: '别驾', soldiers: { militia: 22, spear: 20, archer: 15 }, morale: 76, sight: 7 },
    { id: 'jushou', name: '沮授', faction: 'yuan', home: 'ye', title: '监军', soldiers: { militia: 25, spear: 22, crossbow: 18 }, morale: 78, sight: 7 },
  ],

  // 阶段时长与休整
  phaseTimeout: 360,
  // 防卡死：玩家可能故意阻挠某一阶段；两年没完成就自动进入下一阶段。
  phaseDeadlineDays: 720,
  restDays: 120,
  bleedDays: 150,
  weakCityFloor: 4,
  weakCityRatio: 0.42,

  /**
   * 阶段表：
   *  - targets：本阶段要宣战、要打的势力
   *  - objective：destroy（灭掉全部目标）/ capture（占住全部城）
   *               / captureOrDestroy（占住全部城，或灭掉目标）
   *  - next：默认下一阶段；successNext / timeoutNext 可分支
   *  - notBeforeDay：开局第几天才递战书
   *  - waitBleed：等袁绍、公孙瓒先杀到两败俱伤
   *  - parallel：进入本阶段时额外保留的战线
   */
  phases: {
    // 蜀：刘璋 → 张鲁 → 南蛮 → 待天下大势 → 荆州
    shu: [
      {
        id: 'shu_yizhou',
        label: '收取西川',
        short: '收取西川',
        stage: 1,
        targets: ['zhang'],
        objective: { type: 'destroy', factions: ['zhang'] },
        noTimeout: true,
        notBeforeDay: 8,
        restDays: 3,
        next: 'shu_zhanglu',
        title: '收取西川',
        casusBelli: '刘备自新野誓师，以“收取西川，作为问鼎天下的资本”为名，只向刘璋递了战书。',
        warLines: [
          '刘备自新野起兵，以“收取西川”为名，只向刘璋一家宣战。',
          '蜀军先取剑阁，再经巴西直下成都；刘璋开关迎客，却把剑阁让成了前线。',
          '诸葛亮在帐中说得明白：成都一入囊中，便以成都为大本营，才有与中原诸侯争锋的本钱。',
        ],
        successLines: [
          '成都城头换旗，刘璋势力覆灭，西川诸郡归入刘备手中。',
          '刘备把治所迁到成都，以成都为蜀军大本营，汉中、成都开仓赈济。',
          '三日后，兵锋北指汉中：张鲁盘踞秦岭，是西川门户，也是刘备统一西南的第一道关。',
        ],
      },
      {
        id: 'shu_zhanglu',
        label: '讨伐张鲁',
        short: '讨伐张鲁',
        stage: 2,
        targets: ['zhanglu'],
        objective: { type: 'destroy', factions: ['zhanglu'] },
        noTimeout: true,
        restDays: 3,
        next: 'shu_nanman',
        title: '讨伐张鲁',
        casusBelli: '西川既定，刘备以“汉中本属益州”为名，向张鲁递出战书，要取汉中、武都、上洛。',
        warLines: [
          '刘备命张飞、魏延出阳平关，马岱、黄忠自剑阁北上，兵锋直指汉中。',
          '张鲁据秦岭山口而守，五斗米道教众遍布山谷，汉中城头挂起“鲁”字旗。',
          '汉中一破，秦岭以南尽归刘备，益州才真正连成一片。',
        ],
        successLines: [
          '汉中、武都、上洛相继易手，张鲁降蜀，五斗米道教众归刘备约束。',
          '刘备在汉中设宴，以魏延督汉中，马岱守武都，益州北门自此稳固。',
          '下一阶段：南征南蛮，收孟获丁壮，完成西南一统。',
        ],
      },
      {
        id: 'shu_nanman',
        label: '南征南蛮',
        short: '南征南蛮',
        stage: 3,
        targets: ['nanman'],
        objective: { type: 'destroy', factions: ['nanman'] },
        noTimeout: true,
        restDays: 30,
        next: 'shu_sworn',
        title: '南征南蛮',
        casusBelli: '汉中已定，刘备转兵南方，要收南蛮诸部，完成西南一统，成为一方枭雄。',
        warLines: [
          '诸葛亮率军南征，马岱、魏延为先锋，兵锋直指建宁、朱提。',
          '南蛮诸部善走山林，蜀军每下一城都要先修栈道。',
          '孟获若降，南中丁壮与象兵便能为蜀所用；若逃，则往他国去。',
        ],
        successLines: [
          '南蛮王城陷落，孟获以下诸部大半归蜀，小部分残部逃往邻国。',
          '刘备命诸葛亮在南中置庲降都督，安抚夷汉，征发丁壮。',
          '西南已定，刘备成为一方枭雄；下一步，只看荆州那三座城。',
        ],
      },
      {
        id: 'shu_sworn',
        label: '会盟荆州',
        short: '会盟荆州',
        stage: 4,
        targets: [],
        waitAllMajorsStage3: true,
        noTimeout: true,
        restDays: 0,
        next: 'shu_jingzhou',
        title: '西南已定',
        casusBelli: '刘备已统一西南，只等曹操、孙权也完成各自战略，三家再会猎荆州。',
        waitLines: [
          '成都的粮仓堆满新谷，汉中的栈道也修到了长安方向。',
          '刘备按兵不动，只派斥候北上关中、东下荆州，等曹孙两家也走到最后一步。',
          '天下大势，即将在三家会盟荆州时翻开新的一页。',
        ],
      },
      {
        id: 'shu_jingzhou',
        label: '荆州争霸',
        short: '荆州争霸',
        stage: 5,
        targets: [],
        waitJingzhou: true,
        noTimeout: true,
        restDays: 0,
        next: 'end',
        title: '荆州争霸',
        casusBelli: '三家战略已毕，荆州三镇成为天下唯一的焦点。',
        waitLines: [
          '襄阳、新野、江陵三镇的探马一日三报，蜀军按剑待发。',
          '谁先占尽荆州三镇，谁就能号令天下募兵；另外两家，必然结盟来攻。',
        ],
      },
    ],

    // 魏：吕布 → 汉廷 → 马腾韩遂 → 官渡/河北 → 待天下大势 → 荆州
    wei: [
      {
        id: 'wei_lv',
        label: '灭吕布',
        short: '灭吕布',
        stage: 1,
        targets: ['lv'],
        objective: { type: 'destroy', factions: ['lv'] },
        noTimeout: true,
        restDays: 3,
        next: 'wei_han',
        title: '兖州旧怨',
        casusBelli: '曹操与吕布争兖州多年，这一次要先把徐州拿下，收吕布麾下的并州骑兵。',
        warLines: [
          '曹操亲率兖州兵马东进，以“徐州旧怨”为名，向吕布宣战。',
          '夏侯惇、曹仁分屯彭城、小沛，先断吕布的粮道。',
          '吕布若败，张辽、高顺等并州旧部便可为曹操所用。',
        ],
        successLines: [
          '下邳城破，吕布授首，其麾下并州骑兵大半归入曹操帐下。',
          '曹操下令休整，徐州、兖州连成一片。',
          '三日后，兵锋西指长安：汉廷空有其名，曹操要挟天子以令诸侯。',
        ],
      },
      {
        id: 'wei_han',
        label: '挟天子',
        short: '挟天子',
        stage: 2,
        targets: ['han'],
        objective: { type: 'capture', sites: ['changan'] },
        noTimeout: true,
        restDays: 3,
        next: 'wei_xiliang',
        title: '挟天子以令诸侯',
        casusBelli: '曹操要入关中攻取长安，把汉廷奉到自己帐下，挟天子以令诸侯。',
        warLines: [
          '曹操以“护驾”为名西进，兵锋直指长安、潼关。',
          '汉廷诸将据关而守，关中百姓却已分不清谁是官军、谁是诸侯。',
          '长安一破，汉室诏书便出自曹操营中，天下诸侯再难违抗。',
        ],
        successLines: [
          '长安城头竖起曹字旗，汉廷百官被迁入许都，天子诏书从此出自曹操帐下。',
          '曹操以天子名义下诏，西凉马腾、韩遂割据不服，正好一并扫平。',
          '下一阶段：扫平马腾、韩遂，把关中与凉州连成一线。',
        ],
      },
      {
        id: 'wei_xiliang',
        label: '扫平西凉',
        short: '扫平西凉',
        stage: 2,
        targets: ['ma', 'hansui'],
        objective: { type: 'destroy', factions: ['ma', 'hansui'] },
        noTimeout: true,
        restDays: 30,
        next: 'wei_north',
        title: '扫平西凉',
        casusBelli: '曹操挟天子在手，以“西凉反复”为名兵发武威、金城，要灭马腾、韩遂。',
        warLines: [
          '曹操以天子诏书为名，兵发武威、金城，要灭马腾、韩遂。',
          '关中诸将随军西进，凉州骑兵来去如风，曹军只能一城一城地推。',
          '马腾、韩遂互不投降，却也不肯合兵；曹操正好分而破之。',
        ],
        successLines: [
          '马腾、韩遂相继败亡，凉州诸郡归入曹操手中。',
          '曹操在长安休整，关中、凉州连成一线，北方只剩河北袁绍未平。',
          '一个月后，曹操将尽起中原兵马北上，与袁绍在官渡决战。',
        ],
      },
      {
        id: 'wei_north',
        label: '官渡定河北',
        short: '官渡定河北',
        stage: 3,
        stageFlag: 'guandu',
        targets: ['yuan', 'gongsun', 'xianbei'],
        waitDays: 30,
        objective: { type: 'destroy', factions: ['yuan', 'gongsun', 'xianbei'] },
        noTimeout: true,
        restDays: 30,
        next: 'wei_sworn',
        title: '官渡定河北',
        casusBelli: '西凉已平，曹操等了一个月，尽起中原兵马北上，要在官渡与袁绍决战。',
        warLines: [
          '一个月后，曹操尽起中原兵马北上，袁绍也把河北大军压到官渡。',
          '袁绍自恃兵多，临阵改令，军心已散；曹操兵精粮足，以逸待劳。',
          '官渡一战，袁绍一个兵已抵不上曹操三个兵；曹操一路推平河北，顺手灭公孙瓒、逐鲜卑。',
        ],
        successLines: [
          '官渡火起，袁绍大军溃散，曹操一路追到邺城，袁氏覆灭。',
          '公孙瓒、鲜卑先后被扫平，河北、幽燕、塞外尽归曹操。',
          '曹操完成第三阶段，北方已定；只等蜀、吴也走完各自的三步。',
        ],
      },
      {
        id: 'wei_sworn',
        label: '会盟荆州',
        short: '会盟荆州',
        stage: 4,
        targets: [],
        waitAllMajorsStage3: true,
        noTimeout: true,
        restDays: 0,
        next: 'wei_jingzhou',
        title: '北方已定',
        casusBelli: '曹操已统一北方，只等刘备、孙权也完成各自战略，三家再会猎荆州。',
        waitLines: [
          '许都的粮车一辆接一辆往南运，邺城的降卒也被编入曹军。',
          '曹操按兵不动，只派曹仁、夏侯惇盯着襄阳、新野、江陵三镇。',
          '天下大势，即将在三家会盟荆州时翻开新的一页。',
        ],
      },
      {
        id: 'wei_jingzhou',
        label: '荆州争霸',
        short: '荆州争霸',
        stage: 5,
        targets: [],
        waitJingzhou: true,
        noTimeout: true,
        restDays: 0,
        next: 'end',
        title: '荆州争霸',
        casusBelli: '三家战略已毕，荆州三镇成为天下唯一的焦点。',
        waitLines: [
          '襄阳、新野、江陵三镇的探马一日三报，曹军按剑待发。',
          '谁先占尽荆州三镇，谁就能号令天下募兵；另外两家，必然结盟来攻。',
        ],
      },
    ],

    // 吴：刘表 → 袁术（称帝后）→ 南越 → 待天下大势 → 荆州
    wu: [
      {
        id: 'wu_jiangdong',
        label: '为父报仇',
        short: '为父报仇',
        stage: 1,
        targets: ['biao'],
        objective: { type: 'destroy', factions: ['biao'] },
        noTimeout: true,
        restDays: 3,
        next: 'wu_yuanshu',
        title: '为父报仇',
        casusBelli: '孙权要报孙坚死于黄祖箭下之仇，先取荆州，统一江东门户。',
        warLines: [
          '孙权以“为父报仇”为名，向刘表宣战，周瑜督水军直取夏口、江陵。',
          '荆州水军与江东水军在三江口对峙，两岸烽火连了百里。',
          '长沙、武陵、桂阳、夷陵、赤壁皆在刘表旗下，江东要一座一座地拔。',
        ],
        successLines: [
          '刘表势力覆灭，长沙、武陵、桂阳、夷陵、赤壁尽归江东。',
          '孙权在江陵祭告孙坚，周瑜督造战船，准备北上。',
          '只等曹操也走完第一步，天下便会传出袁术称帝的消息。',
        ],
      },
      {
        id: 'wu_yuanshu',
        label: '讨伐袁术',
        short: '讨伐袁术',
        stage: 2,
        targets: ['yuanshu'],
        objective: { type: 'destroy', factions: ['yuanshu'] },
        waitEmperor: true,
        noTimeout: true,
        restDays: 30,
        next: 'wu_shanyue',
        title: '讨伐袁术',
        casusBelli: '袁术在寿春僭号称帝，孙权奉天子诏，与曹操合兵讨伐仲家。',
        warLines: [
          '袁术在寿春僭号称帝，建号“仲家”，置百官、修宫室。',
          '孙权与曹操同时传檄，江东水军自濡须入淮，直取寿春、合肥、庐江。',
          '袁术原本只守本土，如今四面受敌，术军连城门都不敢开。',
        ],
        successLines: [
          '寿春城破，袁术病亡，仲家百官尽散，淮南之地归孙曹两家分取。',
          '孙权收编袁术水军，江东声势大振。',
          '下一阶段：南征南越，把交州、桂阳以南尽收入吴。',
        ],
      },
      {
        id: 'wu_shanyue',
        label: '南征南越',
        short: '南征南越',
        stage: 3,
        targets: ['shanyue'],
        objective: { type: 'destroy', factions: ['shanyue'] },
        noTimeout: true,
        restDays: 30,
        next: 'wu_sworn',
        title: '南征南越',
        casusBelli: '袁术已灭，孙权转兵南方，要收南越诸部，完成江东的第三阶段。',
        warLines: [
          '孙权命贺齐、吕范南征南越，兵锋直指南越王城。',
          '南越诸部据险而守，江东军每进一步都要先开山道。',
          '南越一平，其丁壮便可补入江东水军，荆州争霸才有本钱。',
        ],
        successLines: [
          '南越王城破，潘临等部大半归吴，小部分残部逃往交州。',
          '孙权命贺齐镇南越，征发丁壮，江东休养生息。',
          '江东三阶段已毕；下一步，只看荆州那三座城。',
        ],
      },
      {
        id: 'wu_sworn',
        label: '会盟荆州',
        short: '会盟荆州',
        stage: 4,
        targets: [],
        waitAllMajorsStage3: true,
        noTimeout: true,
        restDays: 0,
        next: 'wu_jingzhou',
        title: '江东已定',
        casusBelli: '孙权已统一江东、交州，只等曹操、刘备也完成各自战略，三家再会猎荆州。',
        waitLines: [
          '建业的船坞日夜赶工，柴桑的粮船已经排到江心。',
          '孙权按兵不动，只派吕蒙、甘宁盯着荆州三镇。',
          '天下大势，即将在三家会盟荆州时翻开新的一页。',
        ],
      },
      {
        id: 'wu_jingzhou',
        label: '荆州争霸',
        short: '荆州争霸',
        stage: 5,
        targets: [],
        waitJingzhou: true,
        noTimeout: true,
        restDays: 0,
        next: 'end',
        title: '荆州争霸',
        casusBelli: '三家战略已毕，荆州三镇成为天下唯一的焦点。',
        waitLines: [
          '襄阳、新野、江陵三镇的探马一日三报，吴军按剑待发。',
          '谁先占尽荆州三镇，谁就能号令天下募兵；另外两家，必然结盟来攻。',
        ],
      },
    ],

    // 袁绍：与公孙瓒混战 → 东取吕布、北扫鲜卑 → 等官渡 → 官渡
    yuan: [
      {
        id: 'yuan_duel',
        label: '幽冀不死不休',
        short: '不死不休',
        stage: 1,
        targets: ['gongsun'],
        objective: { type: 'destroy', factions: ['gongsun'] },
        noTimeout: true,
        restDays: 15,
        next: 'yuan_expand',
        title: '幽冀不死不休',
        casusBelli: '袁绍与公孙瓒开局便撕破脸，幽冀两家不死不休，任何议和书都退回。',
        warLines: [
          '袁绍与公孙瓒在幽冀边界点起烽火，两家开局便是不死不休。',
          '袁绍自邺城北上，公孙瓒自蓟城南下，范阳、涿郡一线成了绞肉场。',
          '这一战没有议和，只有一方灭国才会停。',
        ],
        successLines: [
          '公孙瓒败亡，袁绍尽收幽燕之地，白马义从的旗号从此不再出现。',
          '邺城大摆宴席，河北兵甲堆满武库，袁绍志得意满。',
          '席间田丰、沮授劝他休养生息，袁绍不听，只令大军休整半月，便要继续用兵。',
        ],
      },
      {
        id: 'yuan_expand',
        label: '东取吕布，北扫鲜卑',
        short: '吕布鲜卑',
        stage: 2,
        targets: ['lv', 'xianbei'],
        objective: { type: 'destroy', factions: ['lv', 'xianbei'] },
        noTimeout: true,
        restDays: 30,
        next: 'yuan_wait_guandu',
        title: '河北极盛',
        casusBelli: '袁绍灭公孙瓒后兵强马壮，要趁势东取吕布、北扫鲜卑，把河北四州连成一片。',
        warLines: [
          '袁绍席罢，兵分两路：一路东出徐州取吕布，一路北出塞外扫鲜卑。',
          '河北新胜，粮草充足，袁绍自谓兵强马壮，不把曹操、孙权放在眼里。',
          '他要赶在曹操统一北方之前，先拿下吕布与鲜卑。',
        ],
        successLines: [
          '吕布、鲜卑先后败亡，袁绍坐拥河北、幽燕、塞外，声势到了极点。',
          '袁绍在邺城阅兵，甲士塞满漳水两岸，谋臣武将都不敢再劝他收手。',
          '他按兵不动，只等曹操完成西凉战事，再南下与曹操争锋。',
        ],
      },
      {
        id: 'yuan_wait_guandu',
        label: '坐等官渡',
        short: '坐等官渡',
        stage: 3,
        targets: [],
        waitGuandu: true,
        noTimeout: true,
        restDays: 0,
        next: 'yuan_guandu',
        title: '坐观成败',
        casusBelli: '袁绍要等曹操北上，再举河北之兵南下，与曹操争夺中原。',
        waitLines: [
          '袁绍在邺城按兵不动，只派斥候南下打探许都消息。',
          '他要等曹操先动，再以逸待劳，南下与曹操决战。',
          '田丰、沮授数次进言，劝他趁曹操兵疲先取许都；袁绍只笑不答。',
        ],
      },
      {
        id: 'yuan_guandu',
        label: '官渡决战',
        short: '官渡决战',
        stage: 4,
        targets: ['wei'],
        objective: { type: 'destroy', factions: ['wei'] },
        noTimeout: true,
        restDays: 0,
        next: 'end',
        stageFlag: 'guandu',
        yuanPenalty: true,
        title: '官渡决战',
        casusBelli: '曹操北上，袁绍尽起河北大军南下，两军在官渡决战。',
        warLines: [
          '曹操北上，袁绍也把河北大军全部压上，两军在官渡相遇。',
          '营寨连绵数十里，粮道只隔一条汴水。',
          '袁绍自恃兵多，不肯听田丰、沮授之谏，临阵改令，军心已散。',
          '曹操兵精粮足，以逸待劳；这一战，袁绍一个兵已抵不上曹操三个兵。',
        ],
        successLines: [
          '官渡一战，袁绍大军溃散，曹操一路追到邺城。',
          '袁绍带着残部退回河北，从此再无力南下。',
        ],
      },
    ],

    // 公孙瓒：与袁绍不死不休；若赢，也只是等曹操北上
    gongsun: [
      {
        id: 'gongsun_duel',
        label: '幽冀不死不休',
        short: '不死不休',
        stage: 1,
        targets: ['yuan'],
        objective: { type: 'destroy', factions: ['yuan'] },
        noTimeout: true,
        restDays: 0,
        next: 'gongsun_wait',
        title: '幽冀不死不休',
        casusBelli: '公孙瓒与袁绍开局便撕破脸，幽冀两家不死不休，任何议和书都退回。',
        warLines: [
          '公孙瓒与袁绍在幽冀边界点起烽火，两家开局便是不死不休。',
          '白马义从自蓟城南下，袁绍的河北步卒自邺城北上。',
          '这一战没有议和，只有一方灭国才会停。',
        ],
        successLines: [
          '袁绍败亡，公孙瓒尽收冀州，白马义从的旗号重新立在中原。',
          '但他还没来得及庆功，曹操的北方大军已经压到幽燕边界。',
        ],
      },
      {
        id: 'gongsun_wait',
        label: '坐等幽燕',
        short: '坐等幽燕',
        stage: 2,
        targets: [],
        noTimeout: true,
        restDays: 0,
        next: 'end',
        title: '坐等幽燕',
        casusBelli: '公孙瓒守住幽燕，只等曹操与袁绍分出胜负。',
        waitLines: [
          '公孙瓒据蓟城而守，北连鲜卑，南望冀州。',
          '他既不降曹，也不降袁，只想等两家拼到两败俱伤。',
        ],
      },
    ],
  },
  emperor: {
    title: '袁术称帝',
    lines: [
      '袁术在寿春僭号称帝，建号“仲家”，置百官、修宫室。',
      '曹操与孙权同时传檄，尽起两国兵马讨伐仲家。',
      '寿春、合肥、庐江一带烽火连天；袁术原本只守本土，如今四面受敌。',
      '袁术覆灭之后，孙曹两家暂不开战，各自去完成自己的第二阶段。',
    ],
  },

  jingzhou: {
    title: '荆州会战',
    lines: [
      '魏、蜀、吴三家各自完成第三阶段，按兵一个月后，同时把兵锋转向荆州。',
      '襄阳第一，新野第二，江陵第三；三镇是荆州的点位，也是天下霸主的门闩。',
      '谁先尽占三镇，谁就夺得霸主之位：全国募兵效率 +20%，另外两家立刻结盟。',
    ],
    cycleTitle: '荆州再战',
    cycleLines: [
      '霸主占着荆州三镇，另外两家结盟，休整一个月后同时来攻。',
      '曹刘在汉中到长安、洛阳一线开战；刘孙在夷陵、江陵、长沙、武陵开战；曹孙在合肥、庐江、寿春开战。',
      '结盟的两家彼此停战，只合力攻打霸主；谁再占尽三镇，谁就是新的霸主。',
    ],
    finalTitle: '第十轮·不死不休',
    finalLines: [
      '荆州已经易主十次，这一次不再休战。',
      '霸主与两家联盟不死不休：要么霸主灭掉两家，要么两家合力灭掉霸主。',
      '霸主灭国的一瞬间，盟友因利益分配不均立刻反目，天下只剩最后一个国家。',
    ],
  },

  endgame: {
    title: '乱国叙事',
    lines: [
      '魏蜀吴三足鼎立，谁占荆州三镇，谁就做霸主。',
      '霸主募兵更盛，另外两家结盟来攻；一轮又一轮，直到第十轮不再休战。',
    ],
  },

  unification: {
    title: '天下归一',
    lines: [
      '最后一国降旗，九州尽归一统。',
      '可就在统一的那一刻，除了跟随你起兵的兄弟，所有封臣都翻脸了。',
      '一支冷箭从背后射来，你失去三分之一的弟兄；他们拼死断后，护着你往西逃。',
      '边境小镇的雾里还有一条活路。主线已在地图上标出，沿着线条走，不要回头。',
    ],
    betrayTitle: '全国背叛',
    betrayLines: [
      '统一大典还没结束，各地太守同时举兵，旗号从“匡扶”换成了“清君侧”。',
      '你身边只剩兄弟旧部；三分之一的弟兄在乱军中倒下，用命换出一条缺口。',
      '追兵就在身后，不能停留。路上遇到拦路的 NPC，只能留下部分兵力断后，自己继续往边陲小镇走。',
    ],
    edgeTitle: '边陲小镇',
    edgeLines: [
      '雾散开一线，小镇的灯火在雾里亮着。',
      '这里每月送来 1000 金币、2000 粮草；其余诸侯的人马不敢靠近小镇十格。',
      '从今天起，你带着剩下的兄弟，从这座小镇重新反攻九州。',
    ],
    fogTitle: '迷雾迷人眼',
    fogLines: [
      '迷雾迷人眼，无法深入探索；再往里走，可能会迷失其中，永远无法出来。',
    ],
  },
};

module.exports = { STORY };
