/**
 * UI 层：硬边像素风面板、按钮、进度条、文字排版
 * 所有热区在 render 时注册，touch 时按最近一帧的热区判定。
 */

const { UI_COLORS } = require('./pixel.js');

const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Heiti SC",sans-serif';

function font(size, weight) {
  return (weight || 'bold') + ' ' + size + 'px ' + FONT_STACK;
}

function text(ctx, str, x, y, opts) {
  const o = opts || {};
  ctx.save();
  ctx.font = font(o.size || 24, o.weight || 'bold');
  ctx.fillStyle = o.color || UI_COLORS.text;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'top';
  if (o.shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(str, x + 2, y + 2);
    ctx.fillStyle = o.color || UI_COLORS.text;
  }
  ctx.fillText(str, x, y);
  ctx.restore();
}

function measure(ctx, str, size, weight) {
  ctx.save();
  ctx.font = font(size || 24, weight || 'bold');
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

/** 中英混排按宽度断行 */
function wrap(ctx, str, maxWidth, size, weight) {
  const lines = [];
  let line = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const test = line + ch;
    if (measure(ctx, test, size, weight) > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function panel(ctx, x, y, w, h, opts) {
  const o = opts || {};
  ctx.save();
  if (o.shadow !== false) {
    ctx.fillStyle = UI_COLORS.shadow;
    ctx.fillRect(x + 4, y + 6, w, h);
  }
  ctx.fillStyle = o.fill || UI_COLORS.panel;
  ctx.fillRect(x, y, w, h);
  // 外框
  ctx.fillStyle = o.border || UI_COLORS.border;
  ctx.fillRect(x, y, w, 3);
  ctx.fillRect(x, y + h - 3, w, 3);
  ctx.fillRect(x, y, 3, h);
  ctx.fillRect(x + w - 3, y, 3, h);
  // 内框
  ctx.fillStyle = UI_COLORS.borderDark;
  ctx.fillRect(x + 3, y + 3, w - 6, 2);
  ctx.fillRect(x + 3, y + h - 5, w - 6, 2);
  ctx.fillRect(x + 3, y + 3, 2, h - 6);
  ctx.fillRect(x + w - 5, y + 3, 2, h - 6);
  // 四角装饰
  ctx.fillStyle = UI_COLORS.accent;
  const s = 6;
  ctx.fillRect(x + 6, y + 6, s, 2);
  ctx.fillRect(x + 6, y + 6, 2, s);
  ctx.fillRect(x + w - 12, y + 6, s, 2);
  ctx.fillRect(x + w - 8, y + 6, 2, s);
  ctx.fillRect(x + 6, y + h - 8, s, 2);
  ctx.fillRect(x + 6, y + h - 12, 2, s);
  ctx.fillRect(x + w - 12, y + h - 8, s, 2);
  ctx.fillRect(x + w - 8, y + h - 12, 2, s);
  ctx.restore();
}

function bar(ctx, x, y, w, h, ratio, color, opts) {
  const o = opts || {};
  const r = Math.max(0, Math.min(1, ratio));
  ctx.save();
  ctx.fillStyle = o.bg || '#171310';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color || UI_COLORS.accent;
  ctx.fillRect(x, y, Math.round(w * r), h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, Math.round(w * r), Math.max(1, Math.floor(h / 4)));
  ctx.fillStyle = UI_COLORS.borderDark;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.restore();
}

class UI {
  constructor() {
    this.items = [];
    this.pressed = null;
    this.released = null;
  }

  begin() {
    this.items.length = 0;
  }

  register(item) {
    this.items.push(item);
    return item;
  }

  /** 标准按钮，返回注册项 */
  button(ctx, x, y, w, h, label, opts) {
    const o = opts || {};
    const disabled = !!o.disabled;
    const active = this.pressed && this.pressed.id === o.id;
    const dy = active ? 2 : 0;
    const fill = disabled ? '#1e1a15' : o.fill || '#3a2c1e';
    const border = disabled ? '#4a3f32' : o.border || UI_COLORS.border;
    const labelColor = disabled ? '#6a6355' : o.color || UI_COLORS.text;

    ctx.save();
    if (!disabled) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 3, y + 5, w, h);
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x, y + dy, w, h);
    ctx.fillStyle = border;
    ctx.fillRect(x, y + dy, w, 2);
    ctx.fillRect(x, y + dy + h - 2, w, 2);
    ctx.fillRect(x, y + dy, 2, h);
    ctx.fillRect(x + w - 2, y + dy, 2, h);
    if (!disabled) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 2, y + dy + 2, w - 4, Math.floor(h / 3));
    }
    ctx.restore();

    text(ctx, label, x + w / 2, y + dy + h / 2, {
      size: o.size || 26,
      align: 'center',
      baseline: 'middle',
      color: labelColor,
    });

    const item = this.register({
      id: o.id || label,
      x,
      y,
      w,
      h,
      disabled,
      onTap: o.onTap || null,
      label,
    });
    return item;
  }

  rect(id, x, y, w, h, onTap, data) {
    return this.register({ id: id || 'rect' + this.items.length, x, y, w, h, onTap, data, disabled: false });
  }

  press(x, y) {
    this.pressed = null;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.disabled) continue;
      if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) {
        this.pressed = it;
        return it;
      }
    }
    return null;
  }

  release(x, y) {
    const p = this.pressed;
    this.pressed = null;
    if (!p) return null;
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
      this.released = p;
      if (p.onTap) p.onTap(p);
      return p;
    }
    return null;
  }

  isPressed(x, y) {
    return !!(this.pressed && x >= this.pressed.x && x <= this.pressed.x + this.pressed.w &&
      y >= this.pressed.y && y <= this.pressed.y + this.pressed.h);
  }
}

module.exports = { UI, text, wrap, measure, panel, bar, font, FONT_STACK };
