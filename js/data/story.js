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
  // 剧情阶段不设超时：目标未达成，就不允许进入下一阶段。
  mandatoryAll: true,

  // 主动经营天下的大国；其余势力都是边缘/守成势力
  majors: ['wei', 'shu', 'wu'],
  duelFactions: ['yuan', 'gongsun'],
  passiveFactions: [
    'lv', 'yuanshu', 'biao', 'zhang',
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
  // 官渡昏君状态下的袁军对拼系数；一个袁绍兵抵不上三个曹兵。
  yuanWeakPower: 0.33,

  // 三国演义专属人事：削减吕布、刘表、刘璋的领主，给魏蜀吴袁各补新人。
  // 乱世三国不读取这些配置，仍用完整 LORDS 名单。
  lordCuts: {
    lv: ['chengong', 'houcheng', 'weixu'],
    biao: ['zhangyun', 'wangwei', 'liupan', 'huangshe'],
    zhang: ['lengbao', 'liugui', 'gaopei'],
  },
  lordAdds: [
    { id: 'caozhen', name: '曹真', faction: 'wei', home: 'chenliu', title: '镇西将军', soldiers: { militia: 35, spear: 30, cav: 20, guard: 8 }, morale: 84, sight: 7 },
    { id: 'caoxiu', name: '曹休', faction: 'wei', home: 'qiao', title: '征东将军', soldiers: { militia: 30, spear: 25, cav: 25 }, morale: 82, sight: 7 },
    { id: 'xunyou', name: '荀攸', faction: 'wei', home: 'xuchang', title: '军师', soldiers: { militia: 20, spear: 18, crossbow: 18, guard: 5 }, morale: 80, sight: 7 },
    { id: 'wuban', name: '吴班', faction: 'shu', home: 'xinye', title: '牙门将', soldiers: { militia: 32, spear: 28, archer: 16 }, morale: 80, sight: 6 },
    { id: 'huojun', name: '霍峻', faction: 'shu', home: 'hanzhong', title: '中郎将', soldiers: { spear: 35, militia: 25, archer: 18 }, morale: 86, sight: 7 },
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
  restDays: 120,
  bleedDays: 150,
  emperorDay: 360,
  jingzhouDay: 540,
  jingzhouDays: 360,
  endgameRestDays: 240,
  twoStrongDays: 240,
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
    shu: [
      {
        id: 'shu_yizhou',
        label: '收取西川',
        short: '收取西川',
        targets: ['zhang'],
        objective: { type: 'destroy', factions: ['zhang'] },
        notBeforeDay: 8,
        noTimeout: true,
        restDays: 120,
        next: 'shu_jingzhou',
        successNext: 'shu_jingzhou',
        timeoutNext: 'shu_jingzhou',
        title: '收取西川',
        casusBelli: '刘备自新野誓师，以“收取西川，作为问鼎天下的资本”为名，只向刘璋递了战书。',
        warLines: [
          '刘备自新野起兵，以“收取西川，作为问鼎天下的资本”为名，只向刘璋一家宣战。',
          '蜀军沿江而上，先取汉中，再下成都；刘璋开关迎客，却把剑阁让成了前线。',
          '诸葛亮在帐中说得明白：益州一入囊中，才有与中原诸侯争锋的本钱。',
        ],
        successLines: [
          '成都城头换旗，刘璋势力覆灭，西川诸郡归入刘备手中。',
          '刘备下令收兵，汉中、成都开仓赈济，诸将清点降卒，休养生息。',
          '下一阶段：向右看，取荆州刘表之地，问鼎中原。',
        ],
        timeoutLines: [
          '西川战事拖得太久，汉中、成都的粮道已经吃紧。',
          '刘备只得暂收兵锋，留魏延守剑阁，主力回成都休整。',
          '下一阶段：先取荆州，再图中原。',
        ],
      },
      {
        id: 'shu_jingzhou',
        label: '荆州问鼎',
        short: '荆州问鼎',
        targets: ['biao'],
        objective: { type: 'captureOrDestroy', sites: ['xiangyang', 'jiangling'], factions: ['biao'] },
        timeout: 360,
        restDays: 120,
        next: 'shu_nanman',
        successNext: 'shu_han',
        timeoutNext: 'shu_nanman',
        title: '荆州问鼎',
        casusBelli: '西川既定，刘备把兵锋转向荆州，要以刘表之地作为问鼎中原的跳板。',
        warLines: [
          '刘备以“荆州乃用武之地”为名，向刘表递出战书，关羽、张飞两路压上。',
          '襄阳、江陵是荆州门户，水网密布，行军一日只能挪几里。',
          '刘备在江陵誓师，要以荆州为跳板，问鼎中原。',
          '若一年之内拿不下荆州，汉中、成都的粮秣也撑不住两线。',
        ],
        successLines: [
          '襄阳、江陵相继易手，荆州大半归蜀，刘表势力再无力北顾。',
          '刘备在江陵设宴犒军，关羽镇襄阳，诸葛亮督粮，准备问鼎中原。',
          '下一阶段：北上长安、洛阳，匡扶汉室。',
        ],
        timeoutLines: [
          '一年已过，襄阳城下仍未破，荆州水军把江面封得死死的。',
          '刘备只得与刘表遣使议和，收兵回江陵休整。',
          '荆州暂缓：先南下收南蛮，再从长计议。',
        ],
      },
      {
        id: 'shu_nanman',
        label: '南征南蛮',
        short: '南征南蛮',
        targets: ['nanman'],
        objective: { type: 'destroy', factions: ['nanman'] },
        timeout: 360,
        restDays: 120,
        next: 'shu_han',
        title: '南征南蛮',
        casusBelli: '荆州未下，刘备转兵南方，先收南蛮诸部，吸纳其大将为蜀所用。',
        warLines: [
          '诸葛亮率军南征，马岱、魏延为先锋，兵锋直指建宁、朱提。',
          '南蛮诸部善走山林，蜀军每下一城都要先修栈道。',
          '孟获若降，南中丁壮与象兵便能为蜀所用；若逃，则往他国去。',
        ],
        successLines: [
          '南蛮王城陷落，孟获以下诸部大半归蜀，小部分残部逃往邻国。',
          '刘备命诸葛亮在南中置庲降都督，安抚夷汉，征发丁壮。',
          '下一阶段：北上长安、洛阳，匡扶汉室；荆州旧线也可同时再开。',
        ],
        timeoutLines: [
          '南中山高林密，一年未能尽破，蜀军疫病渐起。',
          '刘备只得收兵回成都，留马忠守朱提，暂缓南征。',
          '下一阶段：先图长安、洛阳，匡扶汉室。',
        ],
      },
      {
        id: 'shu_han',
        label: '匡扶汉室',
        short: '匡扶汉室',
        targets: ['han', 'wei'],
        parallel: 'biao',
        objective: { type: 'capture', sites: ['changan', 'luoyang'] },
        timeout: 360,
        restDays: 120,
        next: 'end',
        title: '匡扶汉室',
        casusBelli: '刘备以汉室宗亲之名，北上攻取长安、洛阳，要挟天子以令诸侯。',
        warLines: [
          '刘备在成都誓师，以“匡扶汉室”为名，兵分两路北上长安、洛阳。',
          '汉廷诸将据潼关而守，曹操的洛阳守军也在城头点起了烽火。',
          '荆州旧线若仍未定，关羽可从江陵北上，形成荆州与关中两线同时开战的局面。',
        ],
        successLines: [
          '长安、洛阳两座旧都先后易手，汉室旌旗重新立在关中。',
          '刘备入长安谒陵，三军缟素，天下震动。',
          '魏蜀吴三足之势已成，乱国叙事由此开启。',
        ],
        timeoutLines: [
          '长安、洛阳久攻不下，蜀道粮运一断，前线便撑不住。',
          '刘备收兵回汉中，留魏延守潼关，暂缓北伐。',
          '天下三足之势已现，接下来便是三国相攻的乱世。',
        ],
      },
    ],

    wei: [
      {
        id: 'wei_lv',
        label: '灭吕布',
        short: '灭吕布',
        targets: ['lv'],
        objective: { type: 'destroy', factions: ['lv'] },
        noTimeout: true,
        restDays: 120,
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
          '下一阶段：西入关中，攻长安汉室，挟天子以令诸侯。',
        ],
        timeoutLines: [
          '吕布据下邳死守，一年未下，曹军粮道反被吕布骑兵骚扰。',
          '曹操只得收兵回兖州，留于禁守彭城。',
          '下一阶段：西入关中，先取长安。',
        ],
      },
      {
        id: 'wei_han',
        label: '挟天子',
        short: '挟天子',
        targets: ['han'],
        objective: { type: 'capture', sites: ['changan'] },
        timeout: 360,
        restDays: 120,
        next: 'wei_yuan',
        title: '挟天子以令诸侯',
        casusBelli: '曹操要入关中攻取长安，把汉廷奉到自己帐下，挟天子以令诸侯。',
        warLines: [
          '曹操以“护驾”为名西进，兵锋直指长安、潼关。',
          '汉廷诸将据关而守，关中百姓却已分不清谁是官军、谁是诸侯。',
          '长安一破，汉室诏书便出自曹操营中，天下诸侯再难违抗。',
        ],
        successLines: [
          '长安城头竖起曹字旗，汉廷百官被迁入许都，天子诏书从此出自曹操帐下。',
          '曹操下令休整，关中、中原连成一线。',
          '下一阶段：等袁绍、公孙瓒杀到两败俱伤，再北上统一河北。',
        ],
        timeoutLines: [
          '潼关天险难破，曹军一年未能入长安。',
          '曹操收兵回洛阳，留钟繇守潼关，暂缓西进。',
          '下一阶段：先看河北，等袁绍、公孙瓒两败俱伤。',
        ],
      },
      {
        id: 'wei_yuan',
        label: '一统河北',
        short: '一统河北',
        targets: ['yuan', 'gongsun'],
        waitBleed: true,
        objective: { type: 'destroy', factions: ['yuan', 'gongsun'] },
        timeout: 360,
        restDays: 150,
        next: 'wei_jingzhou',
        title: '河北定鼎',
        casusBelli: '袁绍与公孙瓒已经杀得两败俱伤，曹操趁虚北上，要一举统一河北。',
        warLines: [
          '袁绍、公孙瓒在幽冀之间杀得两败俱伤，曹操按兵不动，等到两家都伤了元气才北上。',
          '曹军先取黎阳、邺城，再扫常山、范阳；若袁绍尚未灭公孙瓒，便一并把公孙瓒收拾了。',
          '公孙瓒一亡，赵云便离开幽州，南下投奔刘备。',
        ],
        successLines: [
          '袁绍、公孙瓒先后覆灭，河北诸郡尽归曹操，北方大业已成。',
          '曹操下令休整，邺城开府，收编河北降卒。',
          '下一阶段：南下攻荆州，取长江上游。',
        ],
        timeoutLines: [
          '河北战事拖过一年，袁绍与公孙瓒的残部仍在互咬。',
          '曹操收兵回邺，留张辽守黎阳，暂缓统一河北。',
          '下一阶段：南下荆州。',
        ],
      },
      {
        id: 'wei_jingzhou',
        label: '南下荆州',
        short: '南下荆州',
        targets: ['biao'],
        objective: { type: 'captureOrDestroy', sites: ['xiangyang', 'jiangling'], factions: ['biao'] },
        timeout: 360,
        restDays: 120,
        next: 'wei_north',
        title: '南下荆州',
        casusBelli: '北方已定，曹操挥师南下，要取襄阳、江陵，控住长江上游。',
        warLines: [
          '曹操以“荆州阻隔王化”为名，向刘表宣战，曹仁、曹洪两路南下。',
          '襄阳、江陵是荆州门户；刘备、孙权也都盯着这两座城。',
          '无论这一战成与不成，诸侯的目光都已聚到荆州。',
        ],
        successLines: [
          '襄阳、江陵易手，曹操控住长江上游，荆州北部尽入魏境。',
          '曹操下令休整，留曹仁守江陵，于禁督襄阳。',
          '下一阶段：西灭马腾、韩遂，再扫北边鲜卑。',
        ],
        timeoutLines: [
          '荆州水网不利北军，一年未能拿下襄阳、江陵。',
          '曹操收兵回许都，留曹仁守宛城，暂缓南下。',
          '下一阶段：先平西凉，再图北边。',
        ],
      },
      {
        id: 'wei_north',
        label: '扫平西凉',
        short: '扫平西凉',
        targets: ['ma', 'hansui', 'xianbei'],
        objective: { type: 'destroy', factions: ['ma', 'hansui', 'xianbei'] },
        timeout: 360,
        restDays: 150,
        next: 'end',
        title: '扫平西凉',
        casusBelli: '曹操要灭马腾、杀韩遂，彻底统一北方，再扫平鲜卑，完成三国鼎立的最后一块拼图。',
        warLines: [
          '曹操以“西凉反复”为名，兵发武威、金城，要灭马腾、杀韩遂。',
          '关中诸将随军西进，鲜卑轲比能也在北边蠢蠢欲动。',
          '西凉一平，北方尽归曹操；魏蜀吴三足鼎立之势，至此成形。',
        ],
        successLines: [
          '马腾、韩遂相继败亡，鲜卑远遁，北方尽归曹操。',
          '曹操在邺城大会诸将，魏蜀吴三足鼎立之势已成。',
          '乱国叙事开启：三国相攻，谁强便合纵攻谁。',
        ],
        timeoutLines: [
          '西凉骑兵来去如风，一年未能尽灭。',
          '曹操收兵回长安，留夏侯渊守天水，暂缓西征。',
          '三国鼎立之势已现，乱国叙事即将开启。',
        ],
      },
    ],

    wu: [
      {
        id: 'wu_jiangdong',
        label: '为父报仇',
        short: '为父报仇',
        targets: ['biao'],
        // 第一阶段是灭国目标：不是占两座城就算完成，必须把刘表势力清零。
        objective: { type: 'destroy', factions: ['biao'] },
        noTimeout: true,
        restDays: 120,
        next: 'wu_hefei',
        successNext: 'wu_hefei',
        title: '为父报仇',
        casusBelli: '孙权要报孙坚死于黄祖箭下之仇，先取荆州，统一江东门户。',
        warLines: [
          '孙权以“为父报仇”为名，向刘表宣战，周瑜督水军直取夏口、江陵。',
          '荆州水军与江东水军在三江口对峙，两岸烽火连了百里。',
          '若拿不下襄阳、江陵，江东的粮秣便要转去南边的南越。',
        ],
        successLines: [
          '襄阳、江陵易手，黄祖伏诛，孙权在江陵祭告孙坚。',
          '江东全军休整，周瑜督造战船，准备北上合肥。',
          '下一阶段：北上攻合肥、寿春，左攻荆州，引三家在荆州搏杀。',
        ],
        timeoutLines: [
          '一年已过，江陵城下仍未破，周瑜的水军被荆州水寨拖住。',
          '孙权只得收兵回建业，休整水师。',
          '荆州暂缓：先南下收南越，再图合肥。',
        ],
      },
      {
        id: 'wu_shanyue',
        label: '南收南越',
        short: '南收南越',
        targets: ['shanyue'],
        objective: { type: 'destroy', factions: ['shanyue'] },
        timeout: 360,
        restDays: 120,
        next: 'wu_hefei',
        title: '南收南越',
        casusBelli: '荆州未下，孙权转兵南方的南越诸部，先收其丁壮，再图北上。',
        warLines: [
          '孙权命贺齐、吕范南征南越，兵锋直指南越王城。',
          '南越诸部据险而守，江东军每进一步都要先开山道。',
          '南越一平，其丁壮便可补入江东水军，合肥之战才有本钱。',
        ],
        successLines: [
          '南越王城破，潘临等部大半归吴，小部分残部逃往交州。',
          '孙权命贺齐镇南越，征发丁壮，江东休养生息。',
          '下一阶段：北上合肥、寿春，左攻荆州。',
        ],
        timeoutLines: [
          '南越据险不出，一年未能尽平。',
          '孙权收兵回建业，留吕范守玉山，暂缓南征。',
          '下一阶段：先北上合肥、寿春。',
        ],
      },
      {
        id: 'wu_hefei',
        label: '合肥寿春',
        short: '合肥寿春',
        targets: ['yuanshu', 'wei', 'biao'],
        parallel: 'biao',
        notBeforeDay: 380,
        objective: { type: 'capture', sites: ['hefei', 'shouchun'] },
        timeout: 360,
        restDays: 120,
        next: 'end',
        title: '合肥寿春',
        casusBelli: '东吴之势已起，孙权要北上攻合肥、寿春，左攻荆州，把三家都引到荆州城下搏杀。',
        warLines: [
          '孙权以“北伐中原”为名，起江东水陆大军，直取合肥、寿春。',
          '周瑜自江陵北上，吕蒙自濡须入淮，荆州旧线同时再开。',
          '合肥、寿春一得，魏蜀吴三家便只能在荆州正面相撞。',
        ],
        successLines: [
          '合肥、寿春易手，江东军威震江淮。',
          '孙权下令休整，周瑜回江陵，吕蒙守濡须。',
          '三家汇聚荆州之势已成，乱国叙事即将开启。',
        ],
        timeoutLines: [
          '合肥城坚，寿春援军不断，一年未能拿下。',
          '孙权收兵回建业，留吕蒙守濡须，暂缓北伐。',
          '三家汇聚荆州之势已现，乱国叙事即将开启。',
        ],
      },
    ],

    yuan: [
      {
        id: 'yuan_duel',
        label: '幽冀不死不休',
        short: '不死不休',
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
          '邺城大摆宴席，河北兵甲堆满武库，袁绍志得意满，自以为天下已在掌中。',
          '席间田丰、沮授劝他休养生息，袁绍不听，只令大军休整半月，便要继续用兵。',
        ],
      },
      {
        id: 'yuan_expand',
        label: '东取吕布，北扫鲜卑',
        short: '吕布鲜卑',
        targets: ['lv', 'xianbei'],
        objective: { type: 'destroy', factions: ['lv', 'xianbei'] },
        noTimeout: true,
        restDays: 30,
        next: 'yuan_wait_yuanshu',
        title: '河北极盛',
        casusBelli: '袁绍灭公孙瓒后兵强马壮，要趁势东取吕布、北扫鲜卑，把河北四州连成一片。',
        warLines: [
          '袁绍席罢，兵分两路：一路东出徐州取吕布，一路北出塞外扫鲜卑。',
          '河北新胜，粮草充足，袁绍自谓兵强马壮，不把曹操、孙权放在眼里。',
          '他要在曹操、孙权灭袁术之前，先拿下吕布与鲜卑，再回头与曹操争中原。',
        ],
        successLines: [
          '吕布、鲜卑先后败亡，袁绍坐拥河北、幽燕、塞外，声势到了极点。',
          '袁绍在邺城阅兵，甲士塞满漳水两岸，谋臣武将都不敢再劝他收手。',
          '他按兵不动，只等曹操与孙权把袁术灭掉，再南下与曹操争锋。',
        ],
      },
      {
        id: 'yuan_wait_yuanshu',
        label: '坐观袁术覆灭',
        short: '等待袁术',
        targets: [],
        noTimeout: true,
        restDays: 0,
        next: 'yuan_guandu',
        waitTitle: '袁绍按兵不动',
        waitLines: [
          '袁绍在邺城按兵不动，只派斥候南下打探寿春消息。',
          '他要等曹操、孙权把袁术灭掉，再以逸待劳，南下与曹操决战。',
          '田丰、沮授数次进言，劝他趁曹操兵疲先取许都；袁绍只笑不答。',
        ],
        title: '坐观成败',
        casusBelli: '袁绍要等曹操、孙权灭掉袁术，再举河北之兵南下，与曹操争夺中原。',
        waitFactionDead: 'yuanshu',
        waitAfterDays: 30,
      },
      {
        id: 'yuan_guandu',
        label: '官渡决战',
        short: '官渡决战',
        targets: ['wei'],
        objective: { type: 'destroy', factions: ['wei'] },
        noTimeout: true,
        restDays: 0,
        next: 'end',
        stage: 'guandu',
        yuanPenalty: true,
        title: '官渡决战',
        casusBelli: '袁术覆灭一月后，袁绍尽起河北大军南下，曹操把中原兵马全部压上，两军在官渡决战。',
        warLines: [
          '袁术覆灭一月后，袁绍尽起河北大军南下，曹操也把中原兵马全部压上。',
          '两军在官渡相遇，营寨连绵数十里，粮道只隔一条汴水。',
          '袁绍自恃兵多，不肯听田丰、沮授之谏，临阵改令，军心已散。',
          '曹操兵精粮足，以逸待劳；这一战，袁绍一个兵已抵不上曹操三个兵。',
        ],
        successLines: [
          '官渡一战，曹军粮道被断，前线溃散，袁绍的河北大军竟被曹操翻盘。',
          '袁绍带着残部退回河北，士气低迷，从此再无力南下。',
          '袁绍军心涣散，士兵力气只剩三成，直到曹操把袁氏彻底灭亡。',
        ],
      },
    ],

    gongsun: [
      {
        id: 'gongsun_duel',
        label: '幽冀不死不休',
        short: '不死不休',
        targets: ['yuan'],
        objective: { type: 'destroy', factions: ['yuan'] },
        noTimeout: true,
        restDays: 0,
        next: 'end',
        title: '幽冀不死不休',
        casusBelli: '公孙瓒与袁绍开局便撕破脸，幽冀两家不死不休，任何议和书都退回。',
        warLines: [
          '公孙瓒与袁绍在幽冀边界点起烽火，两家开局便是不死不休。',
          '白马义从自蓟城南下，袁绍的河北步卒自邺城北上。',
          '这一战没有议和，只有一方灭国才会停。',
        ],
      },
    ],
  },

  emperor: {
    title: '袁术称帝',
    lines: [
      '袁术在寿春僭号称帝，建号“仲家”，置百官、修宫室。',
      '周围诸侯同时传檄，魏、吴、刘表等先后对袁术宣战。',
      '曹操与孙权合兵剿灭仲家，寿春、合肥、庐江一带烽火连天。',
      '袁术原本只守本土，如今四面受敌，术军连城门都不敢开。',
    ],
  },

  jingzhou: {
    title: '荆州会战',
    lines: [
      '诸国各自战略目标已告一段落，荆州成了天下唯一的焦点。',
      '魏、蜀、吴三家同时向荆州用兵：襄阳第一，新野第二，江陵第三。',
      '三镇是荆州的点位，也是最终争霸之位；谁先尽占三镇，谁就握住下一轮天下的门闩。',
      '这一年里谁也不肯先收手；一年之后，或有三镇归一家，或各自收兵再图后举。',
    ],
  },

  endgame: {
    title: '乱国叙事',
    lines: [
      '魏蜀吴三足鼎立，谁最强，另两家便合纵攻谁。',
      '强国被打到极弱时，会与两家同时停战，让另外两家先拼。',
      '两家拼到两败俱伤，再一起收兵；三家休整之后，下一轮又从头开始。',
      '没有玩家插手，单靠 NPC 永远完不成统一。',
    ],
  },
};

module.exports = { STORY };
