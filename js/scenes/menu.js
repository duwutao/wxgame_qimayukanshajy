/**
 * 系统菜单：存档、读档、回标题（退出）
 */

const { text, panel, wrap } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const audio = require('../core/audio.js');
const { formatClock } = require('../core/world.js');

const AUTO_KEY = 'bw_save_v4';
const MANUAL_KEY = 'bw_manual_v4';

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

const MenuScene = {
  enter(app) {
    app.menuView = { auto: readMeta(app, AUTO_KEY), manual: readMeta(app, MANUAL_KEY) };
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const mv = app.menuView || {};

    ctx.fillStyle = 'rgba(8,6,4,0.94)';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '营帐', w / 2, 44, { size: 40, align: 'center', color: '#f0c060' });
    text(ctx, st ? formatClock(st.clock) : '', w / 2, 96, { size: 20, align: 'center', color: '#a2947a' });

    // 手动存档信息
    const infoY = 130;
    panel(ctx, 20, infoY, w - 40, 106, { fill: '#201a14' });
    text(ctx, '手动存档', 44, infoY + 14, { size: 20, color: '#c9bda2' });
    text(ctx, mv.manual
      ? '第 ' + mv.manual.clock.day + ' 天 · ' + (mv.manual.player.flagName === '无旗' ? mv.manual.player.name : mv.manual.player.flagName) + ' · ' + (mv.manual.player.gold || 0) + ' 金'
      : '还没有手动存过档', 44, infoY + 50, { size: 18, color: '#8a8070' });

    const BH = 64;
    const GAP = 70;
    let y = infoY + 118;
    app.ui.button(ctx, 20, y, w - 40, BH, '保存到现在', {
      id: 'menu_save', size: 26, fill: '#3a2c1e', onTap: function () {
        if (!app.state) return;
        app.runtime.storage.set(MANUAL_KEY, stateLib.serialize(app.state));
        app.menuView.manual = readMeta(app, MANUAL_KEY);
        app.showToast('已存档：第 ' + app.state.clock.day + ' 天', 2);
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w - 40, BH, mv.manual ? '读取手动存档' : '读取手动存档（空）', {
      id: 'menu_load', size: 26, fill: '#241c14', disabled: !mv.manual, onTap: function () {
        const raw = app.runtime.storage.get(MANUAL_KEY);
        const loaded = stateLib.deserialize(raw);
        if (!loaded) {
          app.showToast('存档读不出来。', 2);
          return;
        }
        app.state = loaded;
        app.replace('map');
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w / 2 - 30, BH, '读取自动存档', {
      id: 'menu_auto', size: 22, fill: '#241c14', disabled: !mv.auto, onTap: function () {
        const raw = app.runtime.storage.get(AUTO_KEY);
        const loaded = stateLib.deserialize(raw);
        if (!loaded) {
          app.showToast('自动存档读不出来。', 2);
          return;
        }
        app.state = loaded;
        app.replace('map');
      },
    });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH, '回到标题', {
      id: 'menu_title', size: 22, fill: '#43201a', onTap: function () {
        app.replace('title');
      },
    });
    y += GAP;

    app.ui.button(ctx, 20, y, w / 2 - 30, BH, '继续游戏', {
      id: 'menu_close', size: 26, fill: '#33271b', onTap: function () { app.pop(); },
    });
    app.ui.button(ctx, w / 2 + 10, y, w / 2 - 30, BH, audio.isEnabled() ? '音乐：开' : '音乐：关', {
      id: 'menu_audio', size: 24, fill: '#241c14', onTap: function () {
        const on = !audio.isEnabled();
        audio.setEnabled(on);
        if (on) audio.play(app.top() && app.top().name === 'battle' ? 'battle' : 'field');
        app.showToast(on ? '音乐已打开' : '音乐已关闭', 1.6);
      },
    });

    text(ctx, '自动存档每 12 秒一次，只在地图上。回标题等于退出这一局。', w / 2, h - 40, {
      size: 15, align: 'center', color: '#6a6050',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = MenuScene;
module.exports.AUTO_KEY = AUTO_KEY;
module.exports.MANUAL_KEY = MANUAL_KEY;
