/**
 * 存档槽：九个位置
 * mode = 'load' 读档 / 'save' 存到某个槽
 */

const { text, panel } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const { formatClock } = require('../core/world.js');

const SLOT_COUNT = 9;

function slotKey(i) {
  return 'bw_slot_' + i;
}

function readSlot(app, i) {
  const raw = app.runtime.storage.get(slotKey(i));
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
  return '第 ' + (data.clock ? data.clock.day : '?') + ' 天 · ' + troops + ' 兵 · ' + (p.gold || 0) + ' 金';
}

const SavesScene = {
  enter(app, params) {
    const p = params || {};
    app.savesView = {
      mode: p.mode || 'load',
      from: p.from || 'menu',
      sel: null,
      note: '',
      slots: [],
    };
    for (let i = 1; i <= SLOT_COUNT; i += 1) app.savesView.slots.push(readSlot(app, i));
  },

  update() {},

  load(app, i) {
    const raw = app.runtime.storage.get(slotKey(i));
    const loaded = stateLib.deserialize(raw);
    if (!loaded) {
      app.showToast('这个槽读不出来。', 2);
      return;
    }
    app.state = loaded;
    app.replace('map');
    app.showToast('已读取槽位 ' + i + '：第 ' + loaded.clock.day + ' 天', 2);
  },

  save(app, i) {
    if (!app.state) return;
    app.runtime.storage.set(slotKey(i), stateLib.serialize(app.state));
    app.savesView.slots[i - 1] = readSlot(app, i);
    app.showToast('已存到槽位 ' + i + '：第 ' + app.state.clock.day + ' 天', 2);
  },

  remove(app, i) {
    app.runtime.storage.remove(slotKey(i));
    app.savesView.slots[i - 1] = null;
    app.savesView.sel = null;
    app.showToast('槽位 ' + i + ' 已清空', 1.6);
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const sv = app.savesView || { mode: 'load', slots: [], sel: null };

    ctx.fillStyle = '#12100c';
    ctx.fillRect(0, 0, w, h);

    text(ctx, sv.mode === 'save' ? '保存到槽位' : '读取存档', w / 2, 26, { size: 32, align: 'center', color: '#f0c060' });
    text(ctx, sv.mode === 'save' ? '点一个空槽就存进去；已有内容需要再点一次底部按钮覆盖。'
      : '点一个槽就读到那一天。九个槽互不影响。', w / 2, 68, { size: 16, align: 'center', color: '#8a8070' });

    const cols = 3;
    const gap = 14;
    const gw = (w - 40 - gap * (cols - 1)) / cols;
    const gh = 178;
    const y0 = 132;

    for (let i = 1; i <= SLOT_COUNT; i += 1) {
      const col = (i - 1) % cols;
      const row = Math.floor((i - 1) / cols);
      const x = 20 + col * (gw + gap);
      const y = y0 + row * (gh + gap);
      const data = sv.slots[i - 1];
      const selected = sv.sel === i;

      panel(ctx, x, y, gw, gh, {
        fill: selected ? '#3a2c1e' : data ? '#201a14' : '#191510',
      });
      text(ctx, '槽 ' + i, x + 12, y + 8, { size: 18, color: selected ? '#f0c060' : '#a2947a' });
      if (data) {
        text(ctx, '第 ' + (data.clock ? data.clock.day : '?') + ' 天', x + 12, y + 38, { size: 22, color: '#efe3c6' });
        const p = data.player || {};
        const troopN = Object.keys(p.troops || {}).reduce(function (s, k) { return s + (p.troops[k] || 0); }, 0);
        text(ctx, troopN + ' 兵 · ' + (p.gold || 0) + ' 金', x + 12, y + 68, { size: 15, color: '#a2947a' });
        text(ctx, (data.player && data.player.flagName) || '无旗', x + 12, y + 92, { size: 14, color: '#8a8070' });
        text(ctx, data.clock ? formatClock(data.clock) : '', x + 12, y + 116, { size: 13, color: '#6a6050' });
      } else {
        text(ctx, '（空）', x + 12, y + 52, { size: 20, color: '#5a5245' });
        text(ctx, '点此存入', x + 12, y + 86, { size: 14, color: '#4a4238' });
      }

      if (data) {
        app.ui.button(ctx, x + gw - 66, y + gh - 44, 56, 34, '删除', {
          id: 'slot_del_' + i, size: 15, fill: '#43201a', onTap: function () {
            SavesScene.remove(app, i);
          },
        });
      }
    }

    const bottomY = y0 + 3 * (gh + gap) + 10;
    if (sv.mode === 'save' && sv.sel) {
      app.ui.button(ctx, 20, bottomY, w - 40, 66,
        sv.slots[sv.sel - 1] ? '覆盖槽 ' + sv.sel + ' 保存' : '存入槽 ' + sv.sel, {
          id: 'save_confirm', size: 24, fill: '#3a2c1e', onTap: function () {
            SavesScene.save(app, sv.sel);
            sv.sel = null;
          },
        });
    }
    app.ui.button(ctx, 20, h - 86, w - 40, 66, '返回', {
      id: 'saves_back', size: 24, fill: '#241c14', onTap: function () { app.pop(); },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd(app, x, y) {
    const sv = app.savesView;
    if (!sv) return;
    const w = app.runtime.width;
    const cols = 3;
    const gap = 14;
    const gw = (w - 40 - gap * (cols - 1)) / cols;
    const gh = 178;
    const y0 = 132;
    for (let i = 1; i <= SLOT_COUNT; i += 1) {
      const col = (i - 1) % cols;
      const row = Math.floor((i - 1) / cols);
      const cx = 20 + col * (gw + gap);
      const cy = y0 + row * (gh + gap);
      if (x < cx || x > cx + gw || y < cy || y > cy + gh) continue;
      // 删除按钮由 ui 处理，这里只管整格
      if (x > cx + gw - 66 && y > cy + gh - 44) return;
      if (sv.mode === 'load') {
        if (sv.slots[i - 1]) SavesScene.load(app, i);
        else app.showToast('这个槽是空的。', 1.6);
      } else {
        if (!sv.slots[i - 1]) SavesScene.save(app, i);
        else sv.sel = i;
      }
      return;
    }
  },
};

module.exports = SavesScene;
module.exports.SLOT_COUNT = SLOT_COUNT;
module.exports.slotKey = slotKey;
