/**
 * 玩法：分类页（基础 / 战役 / 势力 / 兵种 / 结局）
 * 内容超出屏幕时可上下拖动。
 */

const { text, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const audio = require('../core/audio.js');
const rank = require('../data/lord-rank.js');
const { FACTIONS, CAMPAIGN, ENDINGS } = require('../data/china.js');
const { TROOPS, FACTION_TROOPS } = require('../data/troops.js');

const TABS = [
  { id: 'basic', label: '基础' },
  { id: 'guide', label: '攻略' },
  { id: 'campaign', label: '战役' },
  { id: 'troops', label: '兵种' },
  { id: 'factions', label: '势力' },
];

const TAB_H = 116;

const MODE_LABEL = {
  title: '标题 / 开局',
  field: '大地图',
  town: '城镇',
  battle: '战斗',
  tense: '史实 / 宣战',
  sorrow: '败亡 / 国殇',
  victory: '凯旋',
};

function chunk(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}
const CONTENT_TOP = TAB_H + 10;

/** 每章的"该做什么"——只指路，不剧透后面发生什么 */
const HINTS = {
  reach_chenliu: '往东走到陈留。路上别停。',
  troops_30: '在陈留募兵，凑到 30 人，粮草按"两日口粮 × 3"备。',
  win_wuchao: '回官渡，到了会有一场硬仗。',
  take_xiapi: '南下打下邳。',
  win_chibi: '去赤壁或柴桑，水战自己会来。',
  win_yiling: '去夷陵。',
  win_final: '带 250 人以上，打进任意一座都城。',
};

/** 内容块：h1/p/gap/faction/troop/chapter/ending/sep */
function buildOps(app, tab) {
  const st = app.state;
  const ops = [];

  if (tab === 'basic') {
    ops.push({ t: 'h1', s: '基本循环' });
    ops.push({ t: 'p', s: '你从洛阳溃兵开始：30 个民兵、80 金钱、45 粮，还有一支天机简。' });
    ops.push({ t: 'p', s: '点地图行军，一格一格走。地形决定耗时：道路 1.3 小时一格，农田 1.9，林地 2.9，沼泽 4.3，渡河 4.6，山地走不了。' });
    ops.push({ t: 'p', s: '每过一天，全队按人头吃粮。断粮会跑兵、掉士气。长途前先在村子里把粮备足。' });
    ops.push({ t: 'h1', s: '城池与村庄' });
    ops.push({ t: 'p', s: '城里四件事：招兵、市场（货物 / 粮草 / 军械）、酒馆（接活、招英雄）、领主府（效忠、宣战、看情报）。' });
    ops.push({ t: 'p', s: '市场军械分十档：兵刃、甲胄、坐骑各十级，越往后价钱近乎翻倍，加成也跟着涨。别指望一进城就满级。' });
    ops.push({ t: 'p', s: '村里三件事：找壮丁（只有民兵，比城里便宜）、找村长买牛羊肉粮、屠村（抢钱抢粮，关系 -5，村子会记很久）。' });
    ops.push({ t: 'h1', s: '战斗' });
    ops.push({ t: 'p', s: '战前选阵法：全军冲锋 / 结阵固守 / 骑兵包围 / 弓弩先射。玩家参与的三国战斗按阵法、兵种克制与 T5 开局特效结算；NPC 互战沿用旧规则。' });
    ops.push({ t: 'p', s: 'T5 只有魏、蜀、吴能出，本体每个按 2 个 T4 计；魏虎豹禁骑要选骑兵包围、蜀元戎神弩营要选弓弩先射、吴横江死士要选结阵固守，才会触发各自的附加效果。' });
    ops.push({ t: 'p', s: '普通遭遇战要打到一方失去战斗力才收场；攻城战则是兵力降到四分之一，弱的一边才会溃退。打不过可以撤——战前能"撤出"（不算败），战中"撤退"额外损失 25%。' });
    ops.push({ t: 'p', s: '撤退后有一段时间对方不会再贴上来，趁机走远。' });
    ops.push({ t: 'h1', s: '天机简' });
    ops.push({ t: 'p', s: '战斗中能落一笔天机简，共七种：南风起（本场攻防按高两阶结算，T1 打 T3、T2 打 T4、T3 打 T5，一人可敌四路同阶）、天降火球（敌军当场折四成，单次最多 80 人）、风行（立刻脱离战场，敌军折一成并原地停 8 小时）、夜袭（敌军 3 回合完全打不出伤害）、倒戈（一成半敌军当场倒戈，最多 60 人）、瘴气（敌军每回合额外折 4%，连折 5 回合）、回魂（战后复活本场阵亡的我方八成士兵）。' });
    ops.push({ t: 'p', s: '除回魂留到战后结算，其余六笔落笔即生效。每落一笔，所有势力对你的好感 -6。用得越多，越没人信你写的东西。' });
    ops.push({ t: 'h1', s: '史册：翻旧账' });
    ops.push({ t: 'p', s: '底栏「史册」记天下事：近十二天一条不落，再往前只留城破、围城、斩将、归降这类大事；往下拖能翻旧账。' });
    ops.push({ t: 'p', s: '条目按类别着色：围城橙、集结青、战事金、天下蓝、归降绿；真正的大事前面加一枚 ◆。' });
    ops.push({ t: 'h1', s: '势力、领主与关系' });
    ops.push({ t: 'p', s: '曹操、刘备、孙权、袁绍、吕布、刘表、刘璋、轲比能、马腾、汉廷，共十家。' });
    ops.push({ t: 'p', s: '你抢他们的村、打他们的城、击败他们的领主，关系就会掉。低于 -25 即开战。' });
    ops.push({ t: 'p', s: '开战后，他们的领主在视野内会一路追着你打。跑得掉就跑，跑不掉就结阵、或者落一笔天机简。' });
    ops.push({ t: 'p', s: '在路上碰上领主，会先说话：了解生平、查看兵力、送礼、开战、问他忙什么、或者走开。' });
    ops.push({ t: 'p', s: '送礼：君主 100 金钱换 5 点关系，领兵者 3 点，普通将领 2 点。想结交真正说得上话的人，得舍得钱。' });
    ops.push({ t: 'p', s: '当场开战一次扣 25 点关系。关系低于 -25，他见到你就会动刀。' });
    ops.push({ t: 'p', s: '一国灭亡时，没被灭国者收走的残部会收旗成为在野之身：地图上挂灰褐色的“野”字旗，不守旧土，全国游走，也不参加国战。' });
    ops.push({ t: 'p', s: '在野的人可以在对话里“招揽入伙”：自立约七成起步，城越多、声望越高、送过礼越好谈；谈崩一次要冷三天。他们也可能过些日子自己带残部投有城的势力。' });
    ops.push({ t: 'h1', s: '声望' });
    ops.push({ t: 'p', s: '声望到 60 可在城里效忠。声望越高队伍上限越大：20 + 声望×0.35。' });
    ops.push({ t: 'p', s: '你的名字会随声望改：溃兵之首 → 一方游侠 → 小有威名 → 郡国校尉 → 一方诸侯 → 天下名将。' });
    ops.push({ t: 'h1', s: '地图缩放' });
    ops.push({ t: 'p', s: '地图右上角有 ＋ / － 两档：远望、常规、近看。拉远能看全境的路与旗，近看能看清每一队人的兵力数字。视野始终跟着你和你的队伍。' });
    ops.push({ t: 'p', s: '地图上的每一支队伍都是一幅小画：领主是骑手带两名步卒和一面旗，匪团按档位不同（青巾是破衣步卒，黄巾四人一队，乱军有骑，赤色兵乱两骑三卒）。' });
    ops.push({ t: 'h1', s: '扎营与等待' });
    ops.push({ t: 'p', s: '地图底栏收成四项：队伍 / 史册 / 扎营 / 菜单。天下大势、玩法说明都收进扎营，不再占底栏。' });
    ops.push({ t: 'p', s: '「在这里待一会儿」可等 2 时辰、半日、一日、三日；你不拔营，天下照走——诸侯会行军、集结、围城。' });
    ops.push({ t: 'p', s: '「招降俘虏」把牢里的领主收进旗下：没有旗必被拒；自立后城越多、声望越高，答应的机会越大；一方之主不会降。' });
    ops.push({ t: 'h1', s: '国战：谁跟谁翻脸' });
    ops.push({ t: 'p', s: '十家势力之间本来就有仇：曹操与袁绍（官渡）、曹操与吕布（兖州）、孙权与刘表（孙坚之死）、刘璋与刘备（益州）。' });
    ops.push({ t: 'p', s: '宣战之后，双方所有领主互为敌人。大地图上他们撞见就厮杀，看见对方的旗会主动扑过去。' });
    ops.push({ t: 'p', s: '天下同时最多三场大战：各国会挑一座敌城，先在国内集结四到十二天，再开拔围城；守方领主收到烽火，最多四人驰援。' });
    ops.push({ t: 'p', s: '蜀国南征南蛮时会一次点起八路领主，诸将分道进山；其余战线仍按常规路数出征。' });
    ops.push({ t: 'p', s: '围城至少三天，最长八天。攻下后胜方留兵守七日；同一对国家三十天内不能再动兵。' });
    ops.push({ t: 'p', s: '除主线要点名的那几位，领主之间不会互相杀死：败的一方溃逃、退回老家，或者被人生擒。' });
    ops.push({ t: 'p', s: '被擒的领主押在城里。关一天，自己逃的概率涨一点（第一天约 2%，十天约 14%，一个月接近一半）；城被攻破时，牢里被这家关着的人会趁乱跑出来。' });
    ops.push({ t: 'h1', s: '俘虏与赎金' });
    ops.push({ t: 'p', s: '你亲手打赢一位领主，他是溃逃还是被你捆走，看运气。捆回来的关在营后，队伍页底部有入口。' });
    ops.push({ t: 'p', s: '牢里可以"收赎金"（按他的家底开价）或"放了"（声望 +12，他那一国对你和气些）。' });
    ops.push({ t: 'h1', s: '军机棋盘' });
    ops.push({ t: 'p', s: '每座城的菜单里有"军机棋盘"：六局军情任选，每局报名 40 金钱，胜者得 200 金钱。七天里只能下十局，过了七天自动重开。' });
    ops.push({ t: 'p', s: '单挑斩将：劈克刺、刺克闪、闪克劈；校场夺魁：左挡右挡、左攻右攻，对手四滴血、你三滴，挡住对攻可反手重击；断粮道：东中西三条道，AI 一次卡死两条，只剩一条空档；狙杀敌哨：前门明哨换防、帐后暗哨不换才中箭；传令搬兵：过两道关卡，每关猜一次守道；火攻时机：顺风遇不备、等风遇防备才得手，也可不再放火，退报名费。' });
    ops.push({ t: 'p', s: '烽火传令要连过两关：第一关三条驿道避开伏兵，第二关只剩两条道再避开一次，军信才算送到。' });
    ops.push({ t: 'p', s: '棋盘不损兵、不死人；输了只是丢报名费，赢了赏钱即时入账。' });
    ops.push({ t: 'h1', s: '存档：最近一份 + 九个槽' });
    ops.push({ t: 'p', s: '标题页四项：新的开始 / 加载最近存档 / 加载保存存档（九个槽）/ 玩法。' });
    ops.push({ t: 'p', s: '游戏里每 45 秒自动存一份"最近"，另留一份上一份可回退；营帐菜单能手动存到九个槽里，也能删、能覆盖。' });
    ops.push({ t: 'h1', s: '场景音乐' });
    ops.push({ t: 'p', s: '标题、大地图、城镇、战斗、对峙、败亡、凯旋七个场景各有一首 CC0 公共领域录音，可商用、无需署名。' });
    ops.push({ t: 'p', s: '录音加载失败或宿主不支持时，自动回落到 WebAudio 现场合成的五声音阶片段。来源与授权见 assets/audio/CREDITS.md。' });
    return ops;
  }

  if (tab === 'guide') {
    // 只教新手怎么开局、怎么活下来；内部公式、概率和后期剧情不写在这里。
    ops.push({ t: 'h1', s: '前几天怎么活' });
    ops.push({ t: 'p', s: '1. 先往东走，别停。序章那支西凉步卒比你强，硬打会散伙。' });
    ops.push({ t: 'p', s: '2. 到陈留进村或进城，先招民兵。民兵便宜，先把人数堆起来。' });
    ops.push({ t: 'p', s: '3. 出远门前把粮草备足两三天，路上断粮会跑兵。' });

    ops.push({ t: 'h1', s: '怎么赚钱' });
    ops.push({ t: 'p', s: '· 打青巾匪团：地图上那些穿青衣的小队伍最好欺负，打散一队就有钱粮。' });
    ops.push({ t: 'p', s: '· 做酒馆的活：清剿、送粮、侦察，钱不算多，但稳当，还能涨声望。' });
    ops.push({ t: 'p', s: '· 跑商：在市场买便宜货，去别的城卖；先看估价，别把本钱压在一趟上。' });
    ops.push({ t: 'p', s: '· 攻贼巢：打下来有一笔现钱和声望，但守军不弱，等队伍成型再去。' });
    ops.push({ t: 'p', s: '· 劫村来钱快，但掉声望、结仇，新手不建议。' });

    ops.push({ t: 'h1', s: '路上遇到什么队伍' });
    ops.push({ t: 'p', s: '青衣匪团最好打；蓝旗开始有弓有骑，别用民兵硬冲；橙旗和赤旗是成建制的硬茬，前期看见就绕开。' });
    ops.push({ t: 'p', s: '匪团和诸侯的部曲撞上也会互砍。你只在附近看得见，别凑太近。' });

    ops.push({ t: 'h1', s: '兵怎么补' });
    ops.push({ t: 'p', s: '民兵便宜，前期靠它撑人数；枪盾和弓贵一些，等钱稳了再换；禁军很贵，别开局就买。' });
    ops.push({ t: 'p', s: '村里的壮丁最便宜，但只有民兵；城里的兵种多，价钱也高。' });

    ops.push({ t: 'h1', s: '酒馆里的人' });
    ops.push({ t: 'p', s: '酒馆角落里坐着一些不起眼的人，花一笔钱能请进队伍。' });
    ops.push({ t: 'p', s: '每人的长处不一样：有人添攻击，有人添防御，有人让队伍跑得快、吃得少，还有老将每天提士气。' });
    ops.push({ t: 'p', s: '随行名额随声望增加；队伍页里能看他们的本事，也能让他们走。' });

    ops.push({ t: 'h1', s: '打不过怎么办' });
    ops.push({ t: 'p', s: '战前“撤出”、战中“撤退”都行。撤出后再走一格，对方短时间内追不上。' });
    ops.push({ t: 'p', s: '真被打光了，不会直接结束；你会回到附近城里重整队伍，再想办法。' });
    return ops;
  }

  if (tab === 'campaign') {
    if (st && st.campaignDisabled) {
      ops.push({ t: 'h1', s: '史实沙盘 · 不设主线' });
      ops.push({ t: 'p', s: '三国演义不再推进十二章主线，也没有必须按顺序打的关键战役。' });
      ops.push({ t: 'p', s: '各国保留史实开局的人事与地盘，之后由国战 AI 自行宣战、集结、围城、吞并；史实会自己演进。' });
      ops.push({ t: 'p', s: '开局头两天各诸侯按兵不动，第三天正式递出战书：曹操讨吕布、孙权攻刘表、袁绍与公孙瓒开战，往后按史实阶段往下走。' });
      ops.push({ t: 'p', s: '史实沙盘没有追兵，洛阳城破后你带着九个人自己往东走。' });
      ops.push({ t: 'p', s: '你仍然可以招兵、攻城、外交、在军机棋盘上推演，只是不再被主线章节牵着走。' });
      return ops;
    }
    const stage = st ? st.campaign.stage : 0;
    ops.push({ t: 'h1', s: '主线战役' });
    ops.push({ t: 'p', s: '一共七章，标题在这里；每一章具体发生什么，走到那一步就知道了。' });
    CAMPAIGN.forEach(function (ch, i) {
      const done = i < stage;
      const active = i === stage;
      ops.push({
        t: 'chapter', ch, done, active, hint: HINTS[ch.check] || ch.goal,
      });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'p', s: '提示：战役战的敌人是预设的，比你强。先把兵练起来，再来打。' });
    return ops;
  }

  if (tab === 'factions') {
    ops.push({ t: 'h1', s: '列国势力' });
    ops.push({ t: 'p', s: '关系 -25 以下即开战。开战后领主会主动追杀，城池也不能进。' });
    Object.keys(FACTIONS).forEach(function (id) {
      if (id === 'bandit' || id === 'player') return;
      if (id === 'rebel' && !(st && st.arc)) return;
      const f = FACTIONS[id];
      const rel = st ? stateLib.relationOf(st, id) : 0;
      const dead = !!(st && st.factionState && st.factionState[id] && st.factionState[id].dead);
      ops.push({ t: 'faction', f, rel, sworn: st && st.player.faction === id, dead: dead });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'h1', s: '黄巾与山贼' });
    ops.push({ t: 'p', s: '六处贼巢，全部敌对。攻破一处声望 +45、金钱 +120，且不再刷匪团。' });
    ops.push({ t: 'gap' });
    ops.push({ t: 'h1', s: '将帅值 / 武力值 / 军师' });
    ops.push({ t: 'p', s: '将帅值 = 带兵指数的标幺值，1.0 = 150 人。君主 / 军师 1.5、武将 1.4；帅才 1.50～1.70，第 1 名最高。' });
    ops.push({ t: 'p', s: '武力值 = 杀敌指数的标幺值。军师默认 0.9、帅才默认 1.4、武将按旧榜七档 1.50～4.00；战场按 (武力/1.5)^0.6 压平，避免单将无双。' });
    ops.push({ t: 'p', s: '帅才五档带兵：' });
    [
      '第 1 名：1.70',
      '第 2-5 名：1.65',
      '第 6-10 名：1.60',
      '第 11-15 名：1.55',
      '第 16-20 名：1.50',
    ].forEach(function (s) { ops.push({ t: 'p', s: '· ' + s }); });
    ops.push({ t: 'p', s: '帅才名录：' });
    chunk(rank.MARSHAL_TOP20, 5).forEach(function (group) {
      const names = group.map(function (m) { return m.rank + '.' + m.name; }).join('、');
      ops.push({ t: 'p', s: '· ' + names });
    });
    ops.push({ t: 'p', s: '同一领主可以同时有将帅、武力、军师三种身份；同类只取最高值，三类之间可叠加。例如君主 1.5 与武将 1.4 重合时，带兵取 1.5。' });
    ops.push({ t: 'p', s: '历史军师开局天降神雷：S+ 杀 50%、S 杀 40%、A 杀 30%、B 杀 20%，单人封顶 100 人。不同军师可叠加；同一场战斗每个军师只触发一次，反复进出同一战场不再触发。' });
    ops.push({ t: 'p', s: '历史军师名录：' });
    rank.STRATEGIST_GRADES.forEach(function (g) {
      const names = g.ids.map(function (id) { return rank.STRATEGIST_NAMES[id] || id; });
      ops.push({ t: 'p', s: '· ' + g.grade + '（雷击 ' + Math.round(g.pct * 100) + '%）：' + names.join('、') });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'h1', s: '场景音乐' });
    audio.listMusic().forEach(function (m) {
      ops.push({ t: 'p', s: '· ' + (MODE_LABEL[m.mode] || m.mode) + '：' + m.tracks.join('、') });
    });
    ops.push({ t: 'p', s: '优先播放 assets/audio 下的 CC0 公共领域录音；加载失败或宿主不支持 InnerAudioContext 时，回落到 WebAudio 现场合成的原创五声音阶片段。录音可商用、无需署名，来源见 assets/audio/CREDITS.md。' });
    return ops;
  }

  if (tab === 'troops') {
    ops.push({ t: 'h1', s: '通用兵种' });
    ops.push({ t: 'p', s: '攻/防/耐久决定硬碰硬的结果；粮是每人每天的口粮；价是招募底价，随城池浮动。匪团、叛军、无旗玩家与边陲小镇仍用这一套通用兵。' });
    const sorted = Object.keys(TROOPS)
      .filter(function (id) { return !TROOPS[id].faction; })
      .sort(function (a, b) { return TROOPS[a].tier - TROOPS[b].tier; });
    sorted.forEach(function (id) {
      ops.push({ t: 'troop', t2: TROOPS[id] });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'h1', s: '各国兵源' });
    ops.push({ t: 'p', s: '城、关、村只招当前管辖势力的兵：村只出 T1，城/关出完整 T1-T4；魏蜀吴另有 T5。换旗后兵源牌随城头一起换。' });
    Object.keys(FACTION_TROOPS).forEach(function (f) {
      const entry = FACTION_TROOPS[f];
      ops.push({
        t: 'p',
        s: entry.label + '：' + entry.units.map(function (u) {
          return 'T' + u.tier + ' ' + u.name;
        }).join(' · '),
      });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'p', s: 'T5 解锁：加入该国，或亲手灭掉该国。未解锁时城里有牌但不能招；灭国后本国的城会额外挂出这国 T5 降卒。T5 只给魏蜀吴的君主与武力榜前 20 名将统率。' });
    ops.push({ t: 'p', s: '特殊：弩手破甲、白毦兵/禁军/死士不溃、无当飞军与山越兵山地不减速、枪盾结阵克骑。' });
    return ops;
  }

  ops.push({ t: 'p', s: '走到最后，站在谁后面、用了几支天机简，会决定这一页怎么收尾——具体怎么写，留到最后自己看。' });
  return ops;
}

/** 粗略估算每块高度 */
function opHeight(op, ctx, w) {
  if (op.t === 'h1') return 54;
  if (op.t === 'p') {
    const lines = wrap(ctx, op.s, w - 48, 18, 'bold');
    return lines.length * 30 + 12;
  }
  if (op.t === 'gap') return 24;
  if (op.t === 'chapter') return 124;
  if (op.t === 'faction') return 96;
  if (op.t === 'troop') return 76;
  if (op.t === 'ending') return 148;
  return 30;
}

function renderOps(app, ops, scroll, w, h, ctx) {
  let y = CONTENT_TOP - scroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, CONTENT_TOP, w, h - CONTENT_TOP);
  ctx.clip();

  ops.forEach(function (op) {
    const hh = opHeight(op, ctx, w);

    if (op.t === 'h1') {
      ctx.fillStyle = UI_COLORS.accent;
      ctx.fillRect(24, y + 12, 5, 26);
      text(ctx, op.s, 40, y + 10, { size: 28, color: '#f0c060' });
      y += hh;
      return;
    }
    if (op.t === 'p') {
      const lines = wrap(ctx, op.s, w - 48, 18, 'bold');
      lines.forEach(function (line, i) {
        text(ctx, line, 24, y + 4 + i * 30, { size: 18, color: '#c9bda2' });
      });
      y += hh;
      return;
    }
    if (op.t === 'gap') {
      y += hh;
      return;
    }
    if (op.t === 'chapter') {
      const ch = op.ch;
      ctx.fillStyle = op.done ? 'rgba(30,40,28,0.6)' : op.active ? 'rgba(60,44,24,0.75)' : 'rgba(24,20,16,0.5)';
      ctx.fillRect(20, y, w - 40, hh - 12);
      ctx.fillStyle = op.active ? UI_COLORS.accent : op.done ? UI_COLORS.good : '#4a3826';
      ctx.fillRect(20, y, 6, hh - 12);
      text(ctx, (op.done ? '✓ ' : op.active ? '▶ ' : '· ') + ch.title, 40, y + 10, {
        size: 22, color: op.done ? '#8fbf7a' : op.active ? '#f0c060' : '#9c907a',
      });
      text(ctx, '目标：' + ch.goal, 40, y + 44, { size: 16, color: '#c9bda2' });
      if (op.hint) {
        const lines = wrap(ctx, '怎么走：' + op.hint, w - 96, 15, 'bold');
        lines.slice(0, 2).forEach(function (line, i) {
          text(ctx, line, 40, y + 70 + i * 24, { size: 15, color: '#8a8070' });
        });
      }
      y += hh;
      return;
    }
    if (op.t === 'faction') {
      const f = op.f;
      const dead = !!op.dead;
      ctx.fillStyle = dead ? '#4a4038' : f.color;
      ctx.fillRect(24, y + 4, 8, 44);
      text(ctx, f.name + ' · ' + f.full, 44, y, { size: 24, color: dead ? '#6a6050' : f.color });
      const rel = op.rel;
      const status = dead ? '亡' : '关系 ' + rel + (op.sworn ? ' · 已效忠' : '');
      text(ctx, status, w - 24, y + 4, {
        size: 18, align: 'right', color: dead ? '#8a8070' : rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#a2947a',
      });
      text(ctx, f.desc, 44, y + 34, { size: 15, color: dead ? '#5a5046' : '#8a8070' });
      y += hh;
      return;
    }
    if (op.t === 'troop') {
      const t = op.t2;
      ctx.fillStyle = 'rgba(24,20,16,0.55)';
      ctx.fillRect(20, y, w - 40, hh - 8);
      text(ctx, t.name, 32, y + 8, { size: 21, color: '#efe3c6' });
      text(ctx, 'T' + t.tier, w - 30, y + 10, { size: 14, align: 'right', color: '#8a8070' });
      text(ctx, '攻 ' + t.atk + '  防 ' + t.def + '  耐久 ' + t.hp + '  粮 ' + t.food, 32, y + 36, {
        size: 15, color: '#a2947a',
      });
      text(ctx, t.recruit ? t.recruit + ' 金钱' : '不卖', w - 30, y + 36, {
        size: 16, align: 'right', color: '#f0c060',
      });
      y += hh;
      return;
    }
    if (op.t === 'ending') {
      text(ctx, op.title, 24, y, { size: 26, color: '#f0c060' });
      text(ctx, op.cond, w - 24, y + 4, { size: 15, align: 'right', color: '#8a8070' });
      const lines = wrap(ctx, op.text, w - 48, 16, 'bold');
      lines.slice(0, 3).forEach(function (line, i) {
        text(ctx, line, 24, y + 36 + i * 26, { size: 16, color: '#c9bda2' });
      });
      y += hh;
      return;
    }
  });

  ctx.restore();
}

const HelpScene = {
  enter(app) {
    app.helpView = { tab: 'basic', scroll: 0, dragging: false, startY: 0, startScroll: 0 };
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const hv = app.helpView;

    ctx.fillStyle = '#14100c';
    ctx.fillRect(0, 0, w, h);

    // 标题
    text(ctx, '玩法', 20, 26, { size: 36, color: '#f0c060' });
    text(ctx, '征战汉末', w - 20, 38, { size: 17, align: 'right', color: '#8a8070' });

    // 分类 tab
    const tabW = (w - 40) / TABS.length;
    TABS.forEach(function (t, i) {
      const x = 20 + i * tabW;
      const active = hv.tab === t.id;
      ctx.fillStyle = active ? '#3a2c1e' : '#201a14';
      ctx.fillRect(x, 74, tabW - 6, 48);
      ctx.fillStyle = active ? UI_COLORS.accent : '#3a2c1e';
      ctx.fillRect(x, 74, tabW - 6, 3);
      text(ctx, t.label, x + (tabW - 6) / 2, 86, {
        size: 21, align: 'center', color: active ? '#f0c060' : '#a2947a',
      });
      app.ui.rect('tab_' + t.id, x, 74, tabW - 6, 48, function () {
        hv.tab = t.id;
        hv.scroll = 0;
      });
    });

    const ops = buildOps(app, hv.tab);
    let total = 12;
    ops.forEach(function (op) { total += opHeight(op, ctx, w); });

    const maxScroll = Math.max(0, total - (h - CONTENT_TOP) + 20);
    hv.scroll = Math.min(maxScroll, Math.max(0, hv.scroll));
    hv.maxScroll = maxScroll;

    renderOps(app, ops, hv.scroll, w, h, ctx);

    // 返回
    app.ui.button(ctx, 20, h - 92, w - 40, 72, '返回', {
      id: 'help_back', size: 26, onTap: function () { app.pop(); },
    });
    if (maxScroll > 0) {
      text(ctx, '↑↓ 可拖动', w - 20, h - 128, { size: 15, align: 'right', color: '#6a6050' });
    }
  },

  onTouchStart(app, x, y) {
    const hv = app.helpView;
    hv.dragging = false;
    hv.startY = y;
    hv.startScroll = hv.scroll;
  },

  onTouchMove(app, x, y) {
    const hv = app.helpView;
    const dy = y - hv.startY;
    if (!hv.dragging && Math.abs(dy) > 14) hv.dragging = true;
    if (hv.dragging) hv.scroll = hv.startScroll - dy;
  },

  onTouchEnd(app) {
    const hv = app.helpView;
    if (hv.maxScroll !== undefined) {
      hv.scroll = Math.min(hv.maxScroll, Math.max(0, hv.scroll));
    }
  },
};

module.exports = HelpScene;
