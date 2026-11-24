/**
 * 立国页：打下第一座城后选一个字的国号，再选旗色。
 * 扎营里的“国号与旗色”也复用这一页，只改两个字。
 */

const { text, panel, wrap } = require('../render/ui.js');
const stateLib = require('../core/state.js');

const PAD = 20;
const GAP = 8;

// 两页各三十个字，都是能当国号的一个汉字；不用键盘，拇指点得中。
const NAME_PAGES = [
  ['赵', '燕', '秦', '齐', '楚', '周', '夏', '商', '梁', '晋',
    '唐', '宋', '郑', '卫', '陈', '鲁', '韩', '徐', '幽', '并',
    '青', '兖', '豫', '荆', '扬', '益', '雍', '司', '朔', '代'],
  ['汉', '魏', '吴', '蜀', '曹', '刘', '孙', '袁', '董', '马',
    '李', '王', '张', '黄', '高', '杨', '冯', '庞', '陆', '顾',
    '桓', '谢', '陶', '温', '杜', '钟', '严', '华', '霍', '窦'],
];

const FLAG_COLORS = [
  { c: '#d9a441', n: '鎏金' },
  { c: '#b4463c', n: '赤' },
  { c: '#3f6fa8', n: '靛' },
  { c: '#4f8f5a', n: '苍' },
  { c: '#8c6fae', n: '紫' },
  { c: '#b06a3c', n: '赭' },
  { c: '#6a8f8a', n: '青' },
  { c: '#8f8f86', n: '灰' },
  { c: '#c95a7a', n: '桃' },
  { c: '#5a7fa0', n: '蓝' },
  { c: '#7a6a4a', n: '褐' },
  { c: '#2f6f6a', n: '墨青' },
];

function selectedColorName(hex) {
  const named = stateLib.flagColorName(hex);
  if (named) return named;
  for (let i = 0; i < FLAG_COLORS.length; i++) {
    if (FLAG_COLORS[i].c.toLowerCase() === String(hex || '').toLowerCase()) return FLAG_COLORS[i].n;
  }
  return hex;
}

/** 从输入里取第一个汉字；国号只能一个字，拼音、空格、标点都不算 */
function pickCountryChar(value) {
  const chars = Array.from(String(value === undefined || value === null ? '' : value));
  for (let i = 0; i < chars.length; i++) {
    if (/^[\u4e00-\u9fa5]$/.test(chars[i])) return chars[i];
  }
  return null;
}

const FoundingScene = {
  enter(app, params) {
    this.closeCustomInput();
    const c = app.state.player.country;
    this.editing = !!(params && params.edit);
    this.step = 0;
    this.page = 0;
    this.name = c && c.name ? c.name : '';
    this.color = c && c.color ? c.color : '#d9a441';
  },

  update() {},

  /** 调出系统键盘输入一个汉字：输入能力交给 platform，小游戏和浏览器共用一套入口 */
  openCustomInput(app) {
    const self = this;
    if (this._textHandle) {
      this._textHandle.focus();
      return;
    }
    if (!app.runtime.askText) {
      app.showToast('当前设备不方便调键盘，点字表里的字也能定国号。', 2.4);
      return;
    }
    const handle = app.runtime.askText({
      value: self.name || '',
      maxLength: 4,
      placeholder: '输入一个汉字',
      onInput: function (value) {
        const ch = pickCountryChar(value);
        if (!ch) return;
        self.name = ch;
        if (self._textHandle) self._textHandle.setValue(ch);
        app.showToast('国号已输入：' + ch, 1.6);
      },
      onDone: function (value) {
        const ch = pickCountryChar(value);
        if (ch) self.name = ch;
        self.closeCustomInput();
      },
    });
    if (!handle) {
      app.showToast('当前设备不方便调键盘，点字表里的字也能定国号。', 2.4);
      return;
    }
    self._textHandle = handle;
    app.showToast('请用键盘输入一个汉字国号。', 2.2);
  },

  closeCustomInput() {
    if (this._textHandle) {
      const h = this._textHandle;
      this._textHandle = null;
      try { h.close(); } catch (e) { /* ignore */ }
    }
  },

  leave() {
    this.closeCustomInput();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const self = this;

    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w / 2, h * 0.36, 30, w / 2, h * 0.36, h * 0.8);
    glow.addColorStop(0, 'rgba(150,104,36,0.22)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    text(ctx, this.editing ? '改国号 · 换旗色' : '立国', PAD, 46, {
      size: 44, color: '#f0c060',
    });
    text(ctx, '第 ' + (this.step + 1) + ' / 2 步', w - PAD, 56, {
      size: 18, align: 'right', color: '#a2947a',
    });

    if (this.step === 0) this.renderName(app, ctx, w, h);
    else this.renderColor(app, ctx, w, h);

    // 顶部始终把选中的国号亮出来
    if (this.name) {
      text(ctx, '国号：' + this.name, w - PAD, 96, {
        size: 20, align: 'right', color: '#ffe0a8',
      });
    }

    app.ui.button(ctx, PAD, h - 82, 170, 58, this.editing ? '取消' : '稍后再定', {
      id: 'found_back', size: 20, fill: '#241c14', onTap: function () { app.pop(); },
    });
    text(ctx, this.editing ? '改完立刻换所有城头与领主旗' : '定下来后，占领的城和麾下领主都挂这面旗',
      PAD, h - 132, { size: 15, color: '#8a8070' });
  },

  renderName(app, ctx, w, h) {
    const self = this;
    text(ctx, '国号 · 只取一个字', PAD, 150, { size: 26, color: '#efe3c6' });
    const lines = wrap(ctx, this.editing
      ? '国号写在城头，也写进天下人的嘴里。改一个字，所有旗都跟着换。'
      : '城已经打下来了。部下把笔递到你手上：写一个字，作为你和这座城的旗。',
      w - PAD * 2, 16);
    lines.slice(0, 2).forEach(function (l, i) {
      text(ctx, l, PAD, 190 + i * 24, { size: 15, color: '#a2947a' });
    });

    const cols = 6;
    const cw = (w - PAD * 2 - GAP * (cols - 1)) / cols;
    const ch = 82;
    const set = NAME_PAGES[this.page];
    let y0 = 260;
    set.forEach(function (chName, i) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAD + col * (cw + GAP);
      const y = y0 + row * (ch + GAP);
      const active = self.name === chName;
      app.ui.button(ctx, x, y, cw, ch, chName, {
        id: 'name_' + chName,
        size: 34,
        fill: active ? '#4a3a20' : '#241c14',
        border: active ? '#ffd76a' : '#5a4a32',
        color: active ? '#ffe0a8' : '#efe3c6',
        onTap: function () { self.name = chName; },
      });
    });

    const gy = y0 + 5 * (ch + GAP) + 8;
    app.ui.button(ctx, PAD, gy, 210, 68, this.page ? '上一组字' : '换一组字', {
      id: 'name_page', size: 22, fill: '#2c2418', onTap: function () { self.page = self.page ? 0 : 1; },
    });
    app.ui.button(ctx, PAD + 230, gy, 150, 68, '自定义', {
      id: 'name_custom', size: 20, fill: '#2c2418', onTap: function () { self.openCustomInput(app); },
    });
    app.ui.button(ctx, w - PAD - 330, gy, 330, 68,
      this.name ? '国号「' + this.name + '」 · 下一步' : '先选一个字', {
        id: 'name_next', size: 23, fill: '#4a3a20',
        disabled: !this.name,
        onTap: function () { self.step = 1; },
      });

    text(ctx, '不想用字表里的字，可以自己输入一个汉字。', PAD, gy + 82, {
      size: 15, color: '#8a8070',
    });
    // 如果读的是旧档国号，正好不在这两页里：也让它能继续改色
    if (this.name && NAME_PAGES[0].indexOf(this.name) < 0 && NAME_PAGES[1].indexOf(this.name) < 0) {
      text(ctx, '当前国号「' + this.name + '」不在字表里，仍可直接下一步换色。', PAD, gy + 108, {
        size: 15, color: '#a2947a',
      });
    }
  },

  renderColor(app, ctx, w, h) {
    const self = this;
    text(ctx, '旗色 · 选一面', PAD, 150, { size: 26, color: '#efe3c6' });
    const lines = wrap(ctx, '旗色会出现在你的城头、地图上的旗块，以及所有挂了你的国号的领主旗下。',
      w - PAD * 2, 16);
    lines.slice(0, 2).forEach(function (l, i) {
      text(ctx, l, PAD, 190 + i * 24, { size: 15, color: '#a2947a' });
    });

    const cols = 6;
    const cw = (w - PAD * 2 - GAP * (cols - 1)) / cols;
    const ch = 70;
    let y0 = 250;
    FLAG_COLORS.forEach(function (fc, i) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAD + col * (cw + GAP);
      const y = y0 + row * (ch + GAP);
      const active = String(self.color).toLowerCase() === fc.c.toLowerCase();
      app.ui.button(ctx, x, y, cw, ch, fc.n, {
        id: 'color_' + fc.n, size: 17, fill: fc.c,
        border: active ? '#ffe0a8' : '#4a4030',
        color: '#171310', onTap: function () { self.color = fc.c; },
      });
    });

    // 预览：一面小旗，加上国号
    const py = 430;
    panel(ctx, PAD, py, w - PAD * 2, 170, { fill: '#241c14' });
    const fx = PAD + 36;
    const fy = py + 28;
    ctx.fillStyle = self.color;
    ctx.fillRect(fx, fy, 62, 78);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(fx, fy, 62, 3);
    text(ctx, self.name || '？', fx + 31, fy + 14, {
      size: 40, align: 'center', color: '#171310',
    });
    text(ctx, '国号「' + (self.name || '未定') + '」', PAD + 128, py + 34, {
      size: 28, color: '#efe3c6',
    });
    text(ctx, '旗色：' + selectedColorName(self.color), PAD + 128, py + 82, {
      size: 21, color: '#c9bda2',
    });
    text(ctx, '所有占领城与麾下领主都会挂这面旗。', PAD + 128, py + 120, {
      size: 16, color: '#8a8070',
    });

    app.ui.button(ctx, PAD, py + 196, 220, 76, '上一步 · 国号', {
      id: 'color_back', size: 22, fill: '#241c14', onTap: function () { self.step = 0; },
    });
    app.ui.button(ctx, w - PAD - 390, py + 196, 390, 76,
      this.editing ? '换旗 · 改国号' : '立国 · 竖旗', {
        id: 'color_confirm', size: 26, fill: '#4a3a20', disabled: !self.name,
        onTap: function () {
          const r = stateLib.foundCountry(app.state, self.name, self.color);
          if (!r.ok) { app.showToast(r.msg, 2.4); return; }
          app.showToast(r.msg, 3);
          app.pop();
        },
      });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = FoundingScene;
