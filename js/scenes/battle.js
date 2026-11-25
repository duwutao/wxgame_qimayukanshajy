/**
 * 战斗场景：战前选战术 → 回合自动推进 → 结算
 * 战中可落一笔天机简（南风起 / 风止 / 名册）
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { TROOPS } = require('../data/troops.js');
const { TACTICS, TACTIC_LIST } = require('../core/battle.js');
const { HISTORY_MARKS, CAMPAIGN, FACTIONS } = require('../data/china.js');
const { drawBackdrop } = require('../render/scenery.js');

/** 打完/撤出后一路退回地图，不在城门口再被弹一次 */
function backToMap(app) {
  let guard = 0;
  while (app.stack.length > 1 && guard++ < 4) {
    const t = app.top();
    if (!t) break;
    if (t.name === 'map') break;
    if (t.name === 'town' || t.name === 'lord' || t.name === 'battle' || t.name === 'chapter' ||
        t.name === 'contact') {
      app.pop();
      continue;
    }
    break;
  }
}

function boxTitle(app) {
  const bv = app.battleView;
  const b = app.state.battle;
  if (!b) return '战斗';
  const ctx = b.context || {};
  if (ctx.kind === 'campaign') {
    if (ctx.campaignId === 'act2') return '乌巢夜袭';
    if (ctx.campaignId === 'act4') return '赤壁 · 火烧连环船';
    if (ctx.campaignId === 'act5') return '夷陵 · 破连营';
    if (ctx.campaignId === 'final') return '终幕 · 定稿之战';
    return '战役';
  }
  if (ctx.kind === 'siege') return '攻城 · ' + ctx.siteName;
  if (ctx.kind === 'lord') return '遭遇 · ' + ctx.lordName;
  if (ctx.kind === 'chase') return '逃 · 过桥';
  return '遭遇战';
}

function subTitle(app) {
  const b = app.state.battle;
  if (!b) return '';
  const ctx = b.context || {};
  if (ctx.kind === 'campaign') {
    const ch = CAMPAIGN.filter(function (c) { return c.id === ctx.campaignId; })[0];
    return ch ? ch.goal : '';
  }
  if (ctx.kind === 'siege') return '城头守军已经上墙。';
  if (ctx.kind === 'lord') return '对面是成名的将领，别当他是山贼。';
  if (ctx.kind === 'chase') return '目标不是赢，是带人跑过去。';
  return '刀已经出鞘。';
}

const BattleScene = {
  enter(app, params) {
    // 上一场没处置的败将不跨战斗残留
    if (!params || !params.keepPostBattle) app.state.postBattleLord = null;
    app.battleView = {
      phase: 'prep',
      timer: 0,
      tactic: 'assault',
      shiOpen: false,
      summary: null,
      mode: (params || {}).mode || 'party',
    };
  },

  update(app, dt) {
    const bv = app.battleView;
    const b = app.state.battle;
    if (!b) {
      // 结算页要留着，别一闪而过
      if (bv && bv.summary) return;
      app.pop();
      return;
    }
    if (bv.phase === 'fight') {
      // 天机简面板一开，决斗就按住不动，等玩家落笔或取消。
      if (bv.shiOpen) return;
      bv.timer += dt;
      if (bv.timer >= 0.6) {
        bv.timer = 0;
        if (!b.finished && !b.batchDone) b.step();
      }
      if (b.finished) {
        bv.summary = stateLib.resolveBattle(app.state, b);
        bv.phase = 'result';
      } else if (b.batchDone) {
        bv.summary = b.interimSummary();
        bv.phase = 'interim';
      }
    }
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const bv = app.battleView;
    const b = app.state.battle;
    if (!b) {
      // 仗打完了（state.battle 已清），照样把结果画出来
      if (bv && bv.summary) {
        ctx.fillStyle = '#14100c';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1c1712';
        ctx.fillRect(0, 0, w, 120);
        ctx.fillStyle = '#3a2c1e';
        ctx.fillRect(0, 118, w, 3);
        text(ctx, '战果', w / 2, 26, { size: 36, align: 'center', color: '#f0c060' });
        text(ctx, '认这一战，或者退回开打之前', w / 2, 76, {
          size: 17, align: 'center', color: '#a2947a',
        });
        renderResult(app, bv.summary, w, h, h * 0.30);
      }
      return;
    }

    // 战场背景：烟尘、残旗与枪林，再压一层暗色保证字看得清
    drawBackdrop(ctx, 'battle', w, h, (b.context && b.context.siteId ? b.context.siteId.length : 0) + 9);
    ctx.fillStyle = 'rgba(12,9,7,0.72)';
    ctx.fillRect(0, 0, w, h);

    // 矮屏（桌面窗口）与大屏（手机竖屏）两套排法，按钮永远在屏幕里
    const compact = h < 720;
    const fire = b.fireGround;
    const headH = compact ? 104 : 160;
    ctx.fillStyle = fire ? '#2e1810' : '#1c1712';
    ctx.fillRect(0, 0, w, headH);
    ctx.fillStyle = fire ? '#d0662a' : '#3a2c1e';
    ctx.fillRect(0, headH - 2, w, 4);
    text(ctx, boxTitle(app), w / 2, compact ? 16 : 34, {
      size: compact ? 30 : 40, align: 'center', color: fire ? '#ffb066' : '#f0c060',
    });
    const sub = subTitle(app);
    if (sub) text(ctx, sub, w / 2, compact ? 56 : 92, {
      size: compact ? 15 : 18, align: 'center', color: '#a2947a',
    });
    if (fire) text(ctx, '火攻', w - 20, 10, { size: 16, align: 'right', color: '#ff8f4a' });
    if (b.shiName) text(ctx, '天机简 · ' + b.shiName, 20, 10, { size: 16, color: '#c9a0e0' });

    const a = b.a;
    const bb = b.b;
    const y1 = compact ? 112 : 190;
    const y2 = compact ? 190 : 300;
    drawSide(ctx, w, y1, a, '我方', '#6f9fd8', true);
    drawSide(ctx, w, y2, bb, '敌方', '#d07060', false);

    if (!compact) {
      drawTroopRow(ctx, w, 430, a.troops, a.initialTroops, '#5a8fd0', 1);
      drawTroopRow(ctx, w, 520, bb.troops, bb.initialTroops, '#c05a4a', -1);
      text(ctx, 'VS', w / 2, 470, { size: 30, align: 'center', color: '#6a6050' });
    }

    const logY = compact ? y2 + 92 : 590;
    if (bv.phase === 'fight') {
      text(ctx, '战报', 16, logY, { size: compact ? 17 : 20, color: '#a2947a' });
      const recent = b.log.slice(compact ? -2 : -4);
      recent.forEach(function (e, i) {
        const y = logY + (compact ? 26 : 34) + i * (compact ? 28 : 34);
        text(ctx, '第' + e.round + '轮', 16, y, { size: 15, color: '#8a8070' });
        text(ctx, '我 ' + e.aLossText, 90, y, { size: compact ? 15 : 18, color: '#9fb8d8' });
        text(ctx, '敌 ' + e.bLossText, 380, y, { size: compact ? 15 : 18, color: '#d8a09f' });
      });
    }

    // 底部
    const bottom = compact ? Math.max(y2 + 96, h - 232) : Math.max(778, h - 486);
    if (bv.phase === 'prep') {
      if (compact) {
        text(ctx, '选一个打法', 16, bottom - 30, { size: 18, color: '#a2947a' });
        // 矮屏：四个打法排一行，不占两行高
        const bw4 = (w - 32 - 24) / 4;
        TACTIC_LIST.forEach(function (id, i) {
          const t = TACTICS[id];
          const active = bv.tactic === id;
          app.ui.button(ctx, 16 + i * (bw4 + 8), bottom, bw4, 54, t.name, {
            id: 'tac_' + id, size: 20,
            fill: active ? '#4a3620' : '#241c14',
            border: active ? UI_COLORS.accent : UI_COLORS.border,
            onTap: function () { bv.tactic = id; },
          });
        });
        const dline = wrap(ctx, TACTICS[bv.tactic].desc, w - 32, 15)[0] || '';
        text(ctx, dline, 16, bottom + 62, { size: 15, color: '#a2947a' });
      } else {
        // 桌面/高屏：2×2 打法在上，撤离 / 天机简 / 开战贴底，互不压字。
        const actionY = h - 90;
        const tacH = 54;
        const row2 = actionY - 12 - tacH;
        const row1 = row2 - (tacH + 6);
        text(ctx, '选一个打法', 16, row1 - 66, { size: 18, color: '#a2947a' });
        const dline = wrap(ctx, TACTICS[bv.tactic].desc, w - 32, 15).slice(0, 1)[0] || '';
        text(ctx, dline, 16, row1 - 24, { size: 15, color: '#a2947a' });
        TACTIC_LIST.forEach(function (id, i) {
          const t = TACTICS[id];
          const bx = 16 + (i % 2) * (w / 2 - 8);
          const by = row1 + Math.floor(i / 2) * (tacH + 6);
          const active = bv.tactic === id;
          app.ui.button(ctx, bx, by, w / 2 - 24, tacH, t.name, {
            id: 'tac_' + id, size: 22,
            fill: active ? '#4a3620' : '#241c14',
            border: active ? UI_COLORS.accent : UI_COLORS.border,
            onTap: function () { bv.tactic = id; },
          });
        });
      }

      // 战前也能走：撤离不算撤退伤亡，退开之后对方一时短时间贴不上来
      if (compact) {
        text(ctx, '不想打就撤离：不损一兵，退开后对方短时间贴不上来。', 16, h - 128, {
          size: 14, color: '#8fbf7a',
        });
      }
      if (compact) {
        const bw3 = (w - 32 - 16) / 3;
        app.ui.button(ctx, 16, h - 92, bw3, 74, '撤离', {
          id: 'leave', size: 22, fill: '#241c14', onTap: function () {
            stateLib.afterRetreat(app.state, b.context);
            app.state.battle = null;
            backToMap(app);
            app.showToast('你退离了战场。', 2);
          },
        });
        app.ui.button(ctx, 16 + bw3 + 8, h - 92, bw3, 74,
          '天机简 ×' + app.state.player.shi, {
          id: 'pre_shi', size: 16, fill: '#3a2438',
          disabled: app.state.player.shi <= 0 || !!b.shiMark,
          onTap: function () { bv.shiOpen = true; },
        });
        app.ui.button(ctx, 16 + (bw3 + 8) * 2, h - 92, bw3, 74, '开战', {
          id: 'go', size: 24, fill: '#4a2a1a', onTap: function () {
            b.setTactic(bv.tactic);
            bv.phase = 'fight';
            bv.timer = 0;
          },
        });
      } else {
        app.ui.button(ctx, 16, h - 90, 100, 78, '撤离', {
          id: 'leave', size: 24, fill: '#241c14', onTap: function () {
            stateLib.afterRetreat(app.state, b.context);
            app.state.battle = null;
            backToMap(app);
            app.showToast('你退离了战场。', 2);
          },
        });
        app.ui.button(ctx, 124, h - 90, 112, 78,
          '天机简 ×' + app.state.player.shi, {
          id: 'pre_shi', size: 16, fill: '#3a2438',
          disabled: app.state.player.shi <= 0 || !!b.shiMark,
          onTap: function () { bv.shiOpen = true; },
        });
        app.ui.button(ctx, 244, h - 90, w - 260, 78, '开战', {
          id: 'go', size: 28, fill: '#4a2a1a', onTap: function () {
            b.setTactic(bv.tactic);
            bv.phase = 'fight';
            bv.timer = 0;
          },
        });
      }
    } else if (bv.phase === 'fight') {
      // 打起来了也能走：撤离不损兵，撤退要留人殿后
      const byy = compact ? h - 150 : h - 190;
      const bh = compact ? 66 : 74;
      const bw = (w - 32 - 24) / 3;
      app.ui.button(ctx, 16, byy, bw, bh, '撤离', {
        id: 'b_flee', size: compact ? 22 : 26, fill: '#2a3320', onTap: function () {
          stateLib.afterRetreat(app.state, b.context);
          app.state.battle = null;
          backToMap(app);
          app.showToast('你带人从阵后撤出，不损一兵。', 2);
        },
      });
      app.ui.button(ctx, 16 + bw + 12, byy, bw, bh, '天机简 ×' + app.state.player.shi, {
        id: 'shi', size: compact ? 19 : 22, fill: '#3a2438', disabled: app.state.player.shi <= 0 || !!b.shiMark, onTap: function () {
          bv.shiOpen = true;
        },
      });
      app.ui.button(ctx, 16 + (bw + 12) * 2, byy, bw, bh, '撤退', {
        id: 'retreat', size: compact ? 22 : 26, fill: '#241c14', onTap: function () {
          b.retreat();
          bv.summary = stateLib.resolveBattle(app.state, b);
          bv.phase = 'result';
        },
      });
      text(ctx, '撤离不损兵 · 撤退要留一成殿后', 16, byy + bh + 8, { size: 15, color: '#8fbf7a' });
      text(ctx, b.shiMark ? '本战已落笔：' + b.shiName : '每 12 轮为一战 · 未分胜负可再战', 16, byy + bh + 32, {
        size: 15, color: b.shiMark ? '#c9a0e0' : '#8a8070',
      });
    } else if (bv.phase === 'interim') {
      renderInterim(app, bv.summary, w, h, b);
    } else {
      renderResult(app, bv.summary, w, h);
    }

    if (bv.shiOpen) renderShi(app, w, h, b);
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

function drawSide(ctx, w, y, side, label, color, isPlayer) {
  const ratio = side.initialCount ? army.troopCount(side.troops) / side.initialCount : 0;
  text(ctx, label, 16, y, { size: 17, color: '#8a8070' });
  text(ctx, side.name, 16, y + 22, { size: 26, color: color });
  const n = army.troopCount(side.troops);
  text(ctx, n + ' / ' + side.initialCount + ' 人', w - 16, y + 24, { size: 22, align: 'right', color: '#efe3c6' });
  bar(ctx, 16, y + 60, w - 32, 12, ratio, isPlayer ? UI_COLORS.blue : UI_COLORS.danger);
  // 兵种构成
  const str = Object.keys(side.initialTroops).map(function (id) {
    return (TROOPS[id] ? TROOPS[id].name : id) + ' ' + side.initialTroops[id];
  }).join(' · ');
  text(ctx, str, 16, y + 76, { size: 15, color: '#8a8070' });
}

function drawTroopRow(ctx, w, y, troops, initial, color, dir) {
  const count = army.troopCount(troops);
  const total = army.troopCount(initial) || 1;
  const shown = Math.max(0, Math.min(12, Math.round(count / Math.max(1, total) * 12)));
  const gap = (w - 120) / 12;
  for (let i = 0; i < shown; i++) {
    const x = 60 + i * gap + (dir > 0 ? 0 : 0);
    // 简单小人：头 + 身 + 枪
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 10, 16);
    ctx.fillRect(x + 2, y - 8, 6, 6);
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(x + 4, y + 16, 2, 8);
    ctx.fillRect(x + 8, y + 16, 2, 8);
    ctx.fillStyle = '#cfd3da';
    ctx.fillRect(x + 12, y - 12, 2, 26);
  }
  if (shown === 0) {
    text(ctx, '无人', w / 2, y, { size: 18, align: 'center', color: '#6a6050' });
  }
}

function renderInterim(app, sum, w, h, b) {
  const ctx = app.runtime.ctx;
  if (!sum || !b) return;
  text(ctx, '未分胜负', 16, h - 238, { size: 40, color: '#e0b060' });
  text(ctx, '第 ' + sum.round + ' 轮 · 第 ' + sum.batch + ' 阵结束', 16, h - 192, {
    size: 18, color: '#a2947a',
  });
  text(ctx, '我方 ' + sum.remainA + ' / ' + sum.initialA + '　敌方 ' + sum.remainB + ' / ' + sum.initialB,
    16, h - 160, { size: 20, color: '#d8c8a6' });
  text(ctx, '还有兵，这仗就没完。再打 12 轮，直到一方兵力归零才结算缴获。', 16, h - 126, {
    size: 16, color: '#8fbf7a',
  });

  const gap = 12;
  const leftW = Math.round((w - 32 - gap) * 0.62);
  const rightW = w - 32 - gap - leftW;
  app.ui.button(ctx, 16, h - 96, leftW, 76, '再战 12 轮', {
    id: 'b_next', size: 26, fill: '#4a2a1a', onTap: function () {
      if (!b.nextBatch()) return;
      app.battleView.summary = null;
      app.battleView.phase = 'fight';
      app.battleView.timer = 0;
    },
  });
  app.ui.button(ctx, 16 + leftW + gap, h - 96, rightW, 76, '撤退', {
    id: 'b_retreat', size: 24, fill: '#241c14', onTap: function () {
      b.retreat();
      app.battleView.summary = stateLib.resolveBattle(app.state, b);
      app.battleView.phase = 'result';
    },
  });
}

function renderResult(app, sum, w, h, y0Top) {
  const ctx = app.runtime.ctx;
  const y0 = y0Top || (h * 0.30);
  if (!sum) return;
  const pending = app.state.postBattleLord;

  const win = sum.result === 'win';
  const retreat = sum.result === 'retreat';
  const color = win ? '#8fbf7a' : retreat ? '#c9bda2' : '#d07060';
  const label = win ? '胜' : retreat ? '撤退' : '败';

  text(ctx, label, 16, y0, { size: 46, color });
  text(ctx, '共 ' + sum.round + ' 轮 · ' + sum.batch + ' 阵打完', 120, y0 + 12, { size: 18, color: '#a2947a' });
  text(ctx, '我方 ' + sum.remainA + ' / ' + sum.initialA, 16, y0 + 58, { size: 20, color: '#9fb8d8' });
  text(ctx, '敌方 ' + sum.remainB + ' / ' + sum.initialB, 16, y0 + 88, { size: 20, color: '#d8a09f' });
  if (win) text(ctx, '缴获 ' + sum.loot + ' 金钱', 16, y0 + 122, { size: 22, color: '#f0c060' });
  if (sum.duelNote) text(ctx, sum.duelNote, 16, y0 + (win ? 150 : 122), {
    size: 18, color: String(sum.duelNote).indexOf('斩') >= 0 ? '#d07060' : '#c9bda2',
  });
  if (sum.shiMark) text(ctx, '天机简「' + sum.shiName + '」' + (sum.shiTiming === 'after' ? '已记下，战后结算' : '已生效'), 16, y0 + 178, { size: 17, color: '#c9a0e0' });

  if (pending) {
    panel(ctx, 16, h - 300, w - 32, 190, { fill: 'rgba(42,30,20,0.94)' });
    text(ctx, '阵前跪着 ' + pending.name, 36, h - 280, { size: 26, color: '#f0c060' });
    text(ctx, pending.arcNoCapture
      ? '天下皆反。他是反贼，不能招降，也不能生擒；只能放他回去。'
      : '野战不杀人。你可以放他回去，也可以押进牢里，之后再招降或斩。', 36, h - 242, {
      size: 16, color: '#c9bda2',
    });
    const gap = 12;
    const bw = pending.arcNoCapture ? (w - 32) : (w - 32 - 24 - gap) / 2;
    const by = h - 186;
    app.ui.button(ctx, 16, by, bw, 68, '放他回去', {
      id: 'lord_release', size: 24, fill: '#2a3320', onTap: function () {
        const r = stateLib.resolveDefeatedLord(app.state, 'release');
        app.showToast(r.msg, 3);
        if (r.ok) {
          sum.duelNote = r.note;
          sum.postBattleLord = false;
        }
      },
    });
    if (!pending.arcNoCapture) app.ui.button(ctx, 16 + bw + gap, by, bw, 68, '押进牢里', {
      id: 'lord_capture', size: 24, fill: '#3a2418', onTap: function () {
        const r = stateLib.resolveDefeatedLord(app.state, 'capture');
        app.showToast(r.msg, 3);
        if (r.ok) {
          sum.duelNote = r.note;
          sum.postBattleLord = false;
        }
      },
    });
  }

  // 打完可以认账，也可以退到开打前那份快照
  const preKey = 'bw_pre_v4';
  const hasPre = !!app.runtime.storage.get(preKey);
  const gap = 12;
  const leftW = Math.round((w - 32 - gap) * 0.58);
  const rightW = w - 32 - gap - leftW;

  app.ui.button(ctx, 16, h - 96, leftW, 76, pending ? '先处置败将' : '继续', {
    id: 'cont', size: 27, fill: '#33271b', disabled: !!pending, onTap: function () {
      if (pending) {
        app.showToast('先决定阵前跪着的人怎么处置。', 2);
        return;
      }
      if (app.state.gameOver) {
        app.replace('ending');
      } else {
        backToMap(app);
      }
    },
  });
  app.ui.button(ctx, 16 + leftW + gap, h - 96, rightW, 76, hasPre ? '退回战前' : '退回战前（空）', {
    id: 'rollback', size: 22, fill: '#3a2418', disabled: !hasPre, onTap: function () {
      const loaded = stateLib.deserialize(app.runtime.storage.get(preKey));
      if (!loaded) {
        app.showToast('战前快照读不出来。', 2);
        return;
      }
      app.state = loaded;
      app.replace('map');
      app.showToast('回到开战之前。', 2);
    },
  });
}

function renderShi(app, w, h, b) {
  const ctx = app.runtime.ctx;
  ctx.fillStyle = 'rgba(8,6,4,0.94)';
  ctx.fillRect(0, 0, w, h);
  text(ctx, '落一笔天机简', w / 2, 150, { size: 34, align: 'center', color: '#d9a441' });
  text(ctx, '前两笔战中生效，名册战后结算 · 战中落笔即时生效 · 剩余 ' + app.state.player.shi + ' 支', w / 2, 200, {
    size: 16, align: 'center', color: '#a2947a',
  });

  let y = 250;
  Object.keys(HISTORY_MARKS).forEach(function (id) {
    const m = HISTORY_MARKS[id];
    panel(ctx, 24, y, w - 48, 150, { fill: '#241c14' });
    text(ctx, m.name, 48, y + 16, { size: 29, color: '#d9a441' });
    text(ctx, m.timingLabel || '', 188, y + 28, { size: 15, color: m.timing === 'after' ? '#8fb0c8' : '#c9a0e0' });
    text(ctx, m.desc, 48, y + 58, { size: 16, color: '#c9bda2' });
    text(ctx, '“' + m.text + '”', 48, y + 94, { size: 15, color: '#8a8070' });
    app.ui.button(ctx, w - 176, y + 70, 132, 60, '落笔', {
      id: 'shi_' + id, size: 22, onTap: function () {
        const r = stateLib.useHistory(app.state, id);
        app.showToast(r.msg, 2);
        app.battleView.shiOpen = false;
      },
    });
    y += 162;
  });

  app.ui.button(ctx, 24, y + 10, w - 48, 70, '收起笔', {
    id: 'shi_close', size: 24, fill: '#241c14', onTap: function () {
      app.battleView.shiOpen = false;
    },
  });
}

module.exports = BattleScene;
