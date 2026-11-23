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
  { id: 'campaign', label: '战役' },
  { id: 'factions', label: '势力' },
  { id: 'troops', label: '兵种' },
  { id: 'endings', label: '结局' },
];

const TAB_H = 116;
const CONTENT_TOP = TAB_H + 10;

/** 内容块：h1/p/gap/faction/troop/chapter/ending/sep */
function buildOps(app, tab) {
  const st = app.state;
  const ops = [];

  if (tab === 'basic') {
    ops.push({ t: 'h1', s: '基本循环' });
    ops.push({ t: 'p', s: '你从洛阳溃兵开始：30 个民兵、60 金、40 粮，还有一支史简。' });
    ops.push({ t: 'p', s: '点地图行军。地形决定耗时：道路 1.3 小时一格，农田 1.9，林地 2.9，沼泽 4.3，渡河 4.6，山地走不了。' });
    ops.push({ t: 'p', s: '每过一天，全队按人头吃粮。断粮会跑兵、掉士气。长途前先在村子里把粮备足。' });
    ops.push({ t: 'p', s: '走进城池：招兵、市场（粮草/军械）、酒馆接活、领主府效忠或宣战。村庄只能招兵、买粮、劫掠。' });
    ops.push({ t: 'h1', s: '战斗' });
    ops.push({ t: 'p', s: '战前选战术：冲锋 / 结阵 / 包抄 / 弓弩先射。回合自动推进，双方同时结算，低阶兵先倒。' });
    ops.push({ t: 'p', s: '减员到三成半以下就溃。打不过可以撤，撤退额外损失 25%。' });
    ops.push({ t: 'h1', s: '史简' });
    ops.push({ t: 'p', s: '战斗中能落一笔：南风起（我方攻击大增）、风止（双方攻击减半，救下很多人）、名册（阵亡者部分回来）。' });
    ops.push({ t: 'p', s: '每落一笔，所有势力对你的好感 -6。用得越多，越没人信你写的东西。' });
    ops.push({ t: 'h1', s: '势力与领主' });
    ops.push({ t: 'p', s: '曹操、刘备、孙权、袁绍、吕布、刘表、刘璋、轲比能、马腾、汉廷，共十家。' });
    ops.push({ t: 'p', s: '你抢他们的村、打他们的城、击败他们的领主，关系就会掉。低于 -25 即开战。' });
    ops.push({ t: 'p', s: '开战后，他们的领主在视野 7 格内会一路追着你打。跑得掉就跑，跑不掉就结阵、或者落一笔史简。' });
    ops.push({ t: 'h1', s: '声望' });
    ops.push({ t: 'p', s: '声望到 60 可在城里效忠。声望越高队伍上限越大：20 + 声望×0.35。' });
    ops.push({ t: 'p', s: '你的名字会随声望改：溃兵之首 → 一方游侠 → 小有威名 → 郡国校尉 → 一方诸侯 → 天下名将。' });
    return ops;
  }

  if (tab === 'campaign') {
    const stage = st ? st.campaign.stage : 0;
    ops.push({ t: 'h1', s: '主线战役' });
    ops.push({ t: 'p', s: '七章。目标是活的，不是通关的。每一章都会改写后面所有人的态度。' });
    CAMPAIGN.forEach(function (ch, i) {
      const done = i < stage;
      const active = i === stage;
      ops.push({
        t: 'chapter', ch, done, active,
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
      if (id === 'bandit') return;
      const f = FACTIONS[id];
      const rel = st ? stateLib.relationOf(st, id) : 0;
      ops.push({ t: 'faction', f, rel, sworn: st && st.player.faction === id });
    });
    ops.push({ t: 'gap' });
    ops.push({ t: 'h1', s: '黄巾与山贼' });
    ops.push({ t: 'p', s: '六处贼巢，全部敌对。攻破一处声望 +45、金 +120，且不再刷匪团。' });
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

  ops.push({ t: 'h1', s: '四种结局' });
  ops.push({ t: 'p', s: '结局不看对话选项，看你站在谁后面、以及你用了几支史简。' });
  [
    { k: 'ding', cond: '投魏，并在终幕清掉其他两家' },
    { k: 'xu', cond: '投蜀，并保住名册上的人' },
    { k: 'fen', cond: '投吴，并烧掉全部史简' },
    { k: 'self', cond: '谁都不投，兵过 250，赢下终幕' },
  ].forEach(function (e) {
    const d = ENDINGS[e.k];
    ops.push({ t: 'ending', title: d.title, text: d.text, cond: e.cond });
  });
  ops.push({ t: 'gap' });
  ops.push({ t: 'p', s: '另外：全军覆没或断粮瓦解，会直接终局，不给结局。' });
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
  if (op.t === 'chapter') return 172;
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
      const lines = wrap(ctx, ch.story, w - 96, 15, 'bold');
      lines.slice(0, 3).forEach(function (line, i) {
        text(ctx, line, 40, y + 70 + i * 24, { size: 15, color: '#8a8070' });
      });
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
      text(ctx, t.recruit ? t.recruit + ' 金' : '不卖', w - 30, y + 36, {
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
    text(ctx, '骑砍大师 · 三国', w - 20, 38, { size: 17, align: 'right', color: '#8a8070' });

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
