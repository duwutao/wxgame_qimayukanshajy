/**
 * 系统菜单：九个存档槽 / 最近存档 / 退回战前 / 回标题
 */

const { text, panel } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const audio = require('../core/audio.js');
const { formatClock } = require('../core/world.js');
const savesLib = require('./saves.js');

const AUTO_KEY = 'bw_save_v4';
const AUTO_1 = 'bw_save_v4_a1';
const AUTO_2 = 'bw_save_v4_a2';
const PRE_KEY = 'bw_pre_v4';

function readMeta(app, key) {
  const raw = app.runtime.storage.get(key);
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.player) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function describe(data) {
  if (!data) return '';
  const p = data.player || {};
  const troops = Object.keys(p.troops || {}).reduce(function (s, k) { return s + (p.troops[k] || 0); }, 0);
  return '第 ' + (data.clock ? data.clock.day : '?') + ' 天 · ' + troops + ' 兵 · ' + (p.gold || 0) + ' 金钱';
}

function load(app, key, failMsg) {
  const raw = app.runtime.storage.get(key);
  const loaded = stateLib.deserialize(raw);
  if (!loaded) {
    app.showToast(failMsg, 2);
    return;
  }
  app.state = loaded;
  app.replace('map');
}

const MenuScene = {
  enter(app) {
    let used = 0;
    for (let i = 1; i <= savesLib.SLOT_COUNT; i += 1) {
      if (app.runtime.storage.get(savesLib.slotKey(i))) used += 1;
    }
    app.menuView = {
      auto: readMeta(app, AUTO_KEY),
      auto1: readMeta(app, AUTO_1),
      pre: readMeta(app, PRE_KEY),
      used: used,
      total: savesLib.SLOT_COUNT,
    };
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const st = app.state;
    const mv = app.menuView || {};

    ctx.fillStyle = 'rgba(8,6,4,0.96)';
    ctx.fillRect(0, 0, w, app.runtime.height);

    text(ctx, '营帐', w / 2, 26, { size: 36, align: 'center', color: '#f0c060' });
    text(ctx, st ? formatClock(st.clock) : '', w / 2, 72, { size: 18, align: 'center', color: '#a2947a' });

    // 存档信息
    const infoY = 98;
    panel(ctx, 20, infoY, w - 40, 92, { fill: '#201a14' });
    text(ctx, '最近存档', 40, infoY + 10, { size: 18, color: '#c9bda2' });
    text(ctx, mv.auto ? describe(mv.auto) : '暂无', 40, infoY + 42, {
      size: 16, color: mv.auto ? '#efe3c6' : '#8a8070',
    });
    text(ctx, '保存槽 ' + (mv.used || 0) + ' / ' + (mv.total || 9), w - 40, infoY + 10, {
      size: 18, align: 'right', color: '#c9bda2',
    });
    text(ctx, '开打前快照 ' + (mv.pre ? '第' + mv.pre.clock.day + '天' : '空'), w - 40, infoY + 42, {
      size: 15, align: 'right', color: mv.pre ? '#a2947a' : '#6a6050',
    });

    const BH = 58;
    const GAP = 66;
    let y = infoY + 104;

    app.ui.button(ctx, 20, y, w / 2 - 30, BH, '保存到槽位', {
      id: 'menu_saves_save', size: 22, fill: '#3a2c1e', onTap: function () {
        app.push('saves', { mode: 'save', from: 'menu' });
      },
    });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH, '读取最近存档', {
      id: 'menu_auto', size: 22, fill: '#241c14', disabled: !mv.auto, onTap: function () {
        load(app, AUTO_KEY, '最近存档读不出来。');
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w - 40, BH,
      '读取保存存档 · ' + (mv.used || 0) + '/' + (mv.total || 9) + ' 个槽有档', {
        id: 'menu_saves_load', size: 24, fill: '#241c14', onTap: function () {
          app.push('saves', { mode: 'load', from: 'menu' });
        },
      });
    y += GAP;

    // 退回：开打前的快照 / 上一份自动存档
    app.ui.button(ctx, 20, y, w / 2 - 30, BH,
      mv.pre ? '退回战前 · 第' + mv.pre.clock.day + '天' : '退回战前（空）', {
        id: 'menu_pre', size: 19, fill: '#3a2418', disabled: !mv.pre, onTap: function () {
          load(app, PRE_KEY, '战前快照读不出来。');
        },
      });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH,
      mv.auto1 ? '退回上一份 · 第' + mv.auto1.clock.day + '天' : '退回上一份（空）', {
        id: 'menu_auto1', size: 19, fill: '#241c14', disabled: !mv.auto1, onTap: function () {
          load(app, AUTO_1, '上一份自动存档读不出来。');
        },
      });
    y += GAP;

    app.ui.button(ctx, 20, y, w / 2 - 30, BH, '回到标题', {
      id: 'menu_title', size: 22, fill: '#43201a', onTap: function () {
        app.replace('title');
      },
    });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH, audio.isEnabled() ? '音乐：开' : '音乐：关', {
      id: 'menu_audio', size: 22, fill: '#241c14', onTap: function () {
        const on = !audio.isEnabled();
        audio.setEnabled(on);
        if (on) audio.play(app.top() && app.top().name === 'battle' ? 'battle' : 'field');
        app.showToast(on ? '音乐已打开' : '音乐已关闭', 1.6);
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w - 40, BH, '继续游戏', {
      id: 'menu_close', size: 24, fill: '#33271b', onTap: function () { app.pop(); },
    });

    text(ctx, '最近存档每 45 秒一份，另留一份上一份可回退；保存槽九格，手动存。', w / 2, y + BH + 26, {
      size: 13, align: 'center', color: '#6a6050',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = MenuScene;
module.exports.AUTO_KEY = AUTO_KEY;
module.exports.PRE_KEY = PRE_KEY;
