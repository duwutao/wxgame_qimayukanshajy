/**
 * 玩法：分类页（基础 / 战役 / 势力 / 兵种 / 结局）
 * 内容超出屏幕时可上下拖动。
 */

const { text, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { FACTIONS, CAMPAIGN, ENDINGS } = require('../data/china.js');
const { TROOPS } = require('../data/troops.js');

const TABS = [
  { id: 'basic', label: '基础' },
  { id: 'guide', label: '攻略' },
  { id: 'campaign', label: '战役' },
  { id: 'troops', label: '兵种' },
  { id: 'factions', label: '势力' },
];

const TAB_H = 116;
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
    ops.push({ t: 'p', s: '战前选战术：冲锋 / 结阵 / 包抄 / 弓弩先射。回合自动推进，双方同时结算，低阶兵先倒。' });
    ops.push({ t: 'p', s: '减员到三成半以下就溃。打不过可以撤——战前能"撤出"（不算败），战中"撤退"额外损失 25%。' });
    ops.push({ t: 'p', s: '撤退后有一段时间对方不会再贴上来，趁机走远。' });
    ops.push({ t: 'h1', s: '天机简' });
    ops.push({ t: 'p', s: '战斗中能落一笔：南风起（我方攻击近三倍）、风止（敌军攻势只剩一成，持续三回合）、名册（阵亡者全部归队）。' });
    ops.push({ t: 'p', s: '每落一笔，所有势力对你的好感 -6。用得越多，越没人信你写的东西。' });
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
    ops.push({ t: 'h1', s: '声望' });
    ops.push({ t: 'p', s: '声望到 60 可在城里效忠。声望越高队伍上限越大：20 + 声望×0.35。' });
    ops.push({ t: 'p', s: '你的名字会随声望改：溃兵之首 → 一方游侠 → 小有威名 → 郡国校尉 → 一方诸侯 → 天下名将。' });
    ops.push({ t: 'h1', s: '地图缩放' });
    ops.push({ t: 'p', s: '地图右上角有 ＋ / － 两档：远望、常规、近看。拉远能看全境的路与旗，近看能看清每一队人的兵力数字。视野始终跟着你和你的队伍。' });
    ops.push({ t: 'p', s: '地图上的每一支队伍都是一幅小画：领主是骑手带两名步卒和一面旗，匪团按档位不同（青巾是破衣步卒，黄巾四人一队，乱军有骑，叛军两骑三卒）。' });
    ops.push({ t: 'h1', s: '扎营与等待' });
    ops.push({ t: 'p', s: '地图底栏收成四项：队伍 / 史册 / 扎营 / 菜单。天下大势、玩法说明都收进扎营，不再占底栏。' });
    ops.push({ t: 'p', s: '「在这里待一会儿」可等 2 时辰、半日、一日、三日；你不拔营，天下照走——诸侯会行军、集结、围城。' });
    ops.push({ t: 'p', s: '「招降俘虏」把牢里的领主收进旗下：没有旗必被拒；自立后城越多、声望越高，答应的机会越大；一方之主不会降。' });
    ops.push({ t: 'h1', s: '国战：谁跟谁翻脸' });
    ops.push({ t: 'p', s: '十家势力之间本来就有仇：曹操与袁绍（官渡）、曹操与吕布（兖州）、孙权与刘表（孙坚之死）、马腾与韩遂（西凉内斗）、刘璋与刘备（益州）。' });
    ops.push({ t: 'p', s: '宣战之后，双方所有领主互为敌人。大地图上他们撞见就厮杀，看见对方的旗会主动扑过去。' });
    ops.push({ t: 'p', s: '天下同时最多三场大战：各国会挑一座敌城，先在国内集结四到十二天，再开拔围城；守方领主收到烽火，最多四人驰援。' });
    ops.push({ t: 'p', s: '围城至少三天，最长八天。攻下后胜方留兵守七日；同一对国家三十天内不能再动兵。' });
    ops.push({ t: 'p', s: '除主线要点名的那几位，领主之间不会互相杀死：败的一方溃逃、退回老家，或者被人生擒。' });
    ops.push({ t: 'p', s: '被擒的领主押在城里。关一天，自己逃的概率涨一点（第一天约 2%，十天约 14%，一个月接近一半）；城被攻破时，牢里被这家关着的人会趁乱跑出来。' });
    ops.push({ t: 'h1', s: '俘虏与赎金' });
    ops.push({ t: 'p', s: '你亲手打赢一位领主，他是溃逃还是被你捆走，看运气。捆回来的关在营后，队伍页底部有入口。' });
    ops.push({ t: 'p', s: '牢里可以"收赎金"（按他的家底开价）或"放了"（声望 +12，他那一国对你和气些）。' });
    ops.push({ t: 'h1', s: '比武大会' });
    ops.push({ t: 'p', s: '每座城的菜单里有"比武大会"：交报名费，连打三场，前两场是本地好手，第三场从天下名将里抽。' });
    ops.push({ t: 'p', s: '不损兵、不死人，输了只是丢报名费。三场全胜拿赏钱（随声望涨）和 45 点声望，随行英雄也跟着长本事。' });
    ops.push({ t: 'p', s: '你的胜算看身板：军械、声望、随行英雄的加成都会算进去。打之前每一场都标了把握百分比。' });
    ops.push({ t: 'h1', s: '存档：最近一份 + 九个槽' });
    ops.push({ t: 'p', s: '标题页四项：新的开始 / 加载最近存档 / 加载保存存档（九个槽）/ 玩法。' });
    ops.push({ t: 'p', s: '游戏里每 45 秒自动存一份"最近"，另留一份上一份可回退；营帐菜单能手动存到九个槽里，也能删、能覆盖。' });
    ops.push({ t: 'h1', s: '场景音乐' });
    ops.push({ t: 'p', s: '标题、大地图、城镇、战斗、对峙、败亡、凯旋七个场景各有一首 CC0 公共领域录音，可商用、无需署名。' });
    ops.push({ t: 'p', s: '录音加载失败或宿主不支持时，自动回落到 WebAudio 现场合成的五声音阶片段。来源与授权见 assets/audio/CREDITS.md。' });
    return ops;
  }

  if (tab === 'guide') {
    ops.push({ t: 'h1', s: '前几天怎么活' });
    ops.push({ t: 'p', s: '1. 先往东走，别停。序章那支西凉步卒比你强得多，硬打会散伙。' });
    ops.push({ t: 'p', s: '2. 到陈留进村/进城，找壮丁。民兵便宜得几乎白给，先堆人数。' });
    ops.push({ t: 'p', s: '3. 粮草按"两日口粮 × 3"备。地图比过去大了一倍，路程一长就容易断粮。' });
    ops.push({ t: 'h1', s: '怎么赚钱（新手最缺的）' });
    ops.push({ t: 'p', s: '· 打青巾匪团：地图上到处是绿衣小队伍，人数 6-12，打散一队能拿 150-250 金钱。这是前期最稳的钱。' });
    ops.push({ t: 'p', s: '· 做酒馆的活：清剿、送粮、侦察，一桩 130-250 金钱，还涨声望和关系。' });
    ops.push({ t: 'p', s: '· 跑商：市场"货物"页买低价的粟米/盐/铁，用"估价"看哪座城收得贵，走一趟赚差价。驮队上限 80 件。' });
    ops.push({ t: 'p', s: '· 屠村：一次 90-200 金钱 + 40-85 粮，但关系 -5，声望也掉。缺钱时能用，别指望它长久。' });
    ops.push({ t: 'p', s: '· 打下贼巢：+120 金钱、+45 声望。' });
    ops.push({ t: 'h1', s: '匪团有等级' });
    ops.push({ t: 'p', s: '地图上的匪团按衣服颜色分级：青（最多，好打）、蓝（有弓有骑）、橙（成建制的山贼）、赤（只比领主差一线）。' });
    ops.push({ t: 'p', s: '青六成、蓝三成、橙 8%、赤 2%。主线没过半之前不会出橙和赤——前期地图上是安全的。' });
    ops.push({ t: 'p', s: '匪团也会和领主的部曲撞上，双方都掉人。你只在自己附近看得见这种混战。' });
    ops.push({ t: 'h1', s: '兵怎么买' });
    ops.push({ t: 'p', s: '低阶兵便宜得像消耗品，高阶兵一件就是一笔钱。民兵几个金钱，枪盾二十上下，亲卫一百多，禁军两百多。' });
    ops.push({ t: 'p', s: '村庄的壮丁最便宜，但只有民兵；城里的兵种多，价钱也高。前期靠民兵堆量，中期再换枪盾和弓。' });
    ops.push({ t: 'h1', s: '英雄' });
    ops.push({ t: 'p', s: '酒馆角落里坐着一些不起眼的人：廖化、周仓、马岱、凌统、丁奉、李典、乐进、于禁……' });
    ops.push({ t: 'p', s: '花一笔钱能请进队伍，随队不死，打仗攒经验，1 到 10 级。' });
    ops.push({ t: 'p', s: '每人的长处不一样：有人添攻击，有人添防御，有人让队伍跑得快、吃得少、缴获多，还有老将每天给队伍提士气。' });
    ops.push({ t: 'p', s: '随行名额看声望：开局 3 位，声望每 30 点加一位，最多 15 位。队伍页里点英雄的名字能和他说话，也能让他走（后会有期，回旧地还能再遇见）。' });
    ops.push({ t: 'p', s: '队伍页里每个兵种行右边有"遣1 / 遣5"，把兵遣散省口粮；遣散不退钱。' });
    ops.push({ t: 'h1', s: '打不过怎么办' });
    ops.push({ t: 'p', s: '战前"撤出"、战中"撤退"都行。撤出后再走一格，对方短时间追不上。' });
    ops.push({ t: 'p', s: '真被打光了，天会往回退一天——醒来时人在最近的城里，队伍会重新拉起来。' });
    return ops;
  }

  if (tab === 'campaign') {
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
    ops.push({ t: 'h1', s: '十路势力' });
    ops.push({ t: 'p', s: '关系 -25 以下即开战。开战后领主会主动追杀，城池也不能进。' });
    Object.keys(FACTIONS).forEach(function (id) {
      if (id === 'bandit' || id === 'player') return;
      const f = FACTIONS[id];
      const rel = st ? stateLib.relationOf(st, id) : 0;
      ops.push({ t: 'faction', f, rel, sworn: st && st.player.faction === id });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'h1', s: '黄巾与山贼' });
    ops.push({ t: 'p', s: '六处贼巢，全部敌对。攻破一处声望 +45、金钱 +120，且不再刷匪团。' });
    return ops;
  }

  if (tab === 'troops') {
    ops.push({ t: 'h1', s: '兵种' });
    ops.push({ t: 'p', s: '攻/防/耐久决定硬碰硬的结果；粮是每人每天的口粮；价是招募底价，随城池浮动。' });
    const sorted = Object.keys(TROOPS).sort(function (a, b) { return TROOPS[a].tier - TROOPS[b].tier; });
    sorted.forEach(function (id) {
      ops.push({ t: 'troop', t2: TROOPS[id] });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'p', s: '特殊：弩手破甲、火船手点火、白毦兵与禁军不溃、无当飞军山地不减速、枪盾结阵克骑。' });
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
      ctx.fillStyle = f.color;
      ctx.fillRect(24, y + 4, 8, 44);
      text(ctx, f.name + ' · ' + f.full, 44, y, { size: 24, color: f.color });
      const rel = op.rel;
      text(ctx, '关系 ' + rel + (op.sworn ? ' · 已效忠' : ''), w - 24, y + 4, {
        size: 18, align: 'right', color: rel < -25 ? '#d06a4a' : rel > 25 ? '#8fbf7a' : '#a2947a',
      });
      text(ctx, f.desc, 44, y + 34, { size: 15, color: '#8a8070' });
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
