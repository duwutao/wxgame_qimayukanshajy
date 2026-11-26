/**
 * 标题：征战汉末
 */

const { text, panel, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');

const SAVE_KEY = 'bw_save_v4';

function hasSave(app) {
  const raw = app.runtime.storage.get(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.player || !data.relations) return null;
    return data;
  } catch (e) {
    return null;
  }
}

const TitleScene = {
  enter(app) {
    // 每次回到标题都先收掉剧本选择层，避免从存档/玩法页回来时卡在弹层。
    this.choosing = false;
    app.saveMeta = hasSave(app);
    // 三国争霸主图：浏览器从 web/ 同目录取，小游戏从包内 assets/ 取。
    // 图没加载好时先保留原来的烈火背景兜底，不让首页空着。
    if (!app.titleBg && !app.titleBgFailed) {
      const img = app.runtime.createImage ? app.runtime.createImage() : null;
      if (img) {
        app.titleBg = img;
        img.onload = function () { app.titleBgReady = true; };
        img.onerror = function () { app.titleBgFailed = true; };
        const base = app.runtime.host === 'web'
          ? (app.runtime.assetBase || '') + 'title-bg.jpg'
          : 'assets/title-bg.jpg';
        img.src = base;
      }
    }
  },

  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const t = (app.mapPhase = (app.mapPhase || 0) + 0.016);

    drawTitleBackdrop(ctx, app, w, h, t);

    // 标题
    text(ctx, '征战汉末', w / 2, h * 0.285, {
      size: 104, align: 'center', color: '#ffe0a0', shadow: true,
    });
    text(ctx, '单机休闲 · 汉末经营', w / 2, h * 0.285 + 112, {
      size: 25, align: 'center', color: '#d9a441',
    });
    text(ctx, '汉末风云 · 城池经营 · 招兵买马', w / 2, h * 0.285 + 158, {
      size: 17, align: 'center', color: '#bca88a',
    });

    // 开启游戏后先走剧本选择：乱世三国是开放沙盘，三国演义是汉末战略剧情。
    if (this.choosing) {
      drawScenarioChooser(ctx, app, w, h);
      return;
    }

    // 窄屏/矮屏时不能把主按钮顶到标题第三行，按标题底部留出安全间距。
    const by = Math.max(h * 0.46, h * 0.285 + 210);
    const bh = 76;
    const gapY = 78;
    const bw = w - 160;
    app.ui.button(ctx, 80, by, bw, bh, '开启游戏', {
      id: 'new_game', size: 30, fill: '#3a2c1e', onTap: function () {
        this.choosing = true;
      }.bind(this),
    });
    text(ctx, '选择剧本 · 乱世三国 / 三国演义', w / 2, by + bh + 7, {
      size: 14, align: 'center', color: '#9f8d70',
    });

    const row2 = by + bh + 54;
    const meta = app.saveMeta;
    app.ui.button(ctx, 80, row2, bw, bh,
      meta ? '加载最近存档 · 第 ' + meta.clock.day + ' 天' : '加载最近存档（空）', {
        id: 'cont', size: 26, disabled: !meta, fill: '#241c14', onTap: function () {
          const raw = app.runtime.storage.get(SAVE_KEY);
          const st = stateLib.deserialize(raw);
          if (!st) {
            app.showToast('存档读不出来，只能重开。');
            return;
          }
          app.state = st;
          app.replace('map');
        },
      });

    app.ui.button(ctx, 80, row2 + gapY, bw, bh, '加载保存存档 · 九个槽', {
      id: 'slots', size: 26, fill: '#241c14', onTap: function () {
        app.push('saves', { mode: 'load', from: 'title' });
      },
    });

    app.ui.button(ctx, 80, row2 + gapY * 2, bw, bh - 4, '玩法 · 战役 · 兵种', {
      id: 'help', size: 24, fill: '#201a14', onTap: function () {
        app.push('help');
      },
    });

    text(ctx, '点地图行军 · 城池经营 · 酒馆任务 · 天机改命', w / 2, h - 40, {
      size: 15, align: 'center', color: '#8e8068',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

/** 剧本选择层：先看两句介绍，再决定进哪一个天下。 */
function drawScenarioChooser(ctx, app, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, w, h);

  // 全屏挡板：选择层打开时，避免点穿到背后的标题按钮。
  app.ui.rect(ctx, 0, 0, w, h, function () {});

  const mw = Math.min(w - 48, 520);
  const mh = Math.min(h - 80, 566);
  const mx = (w - mw) / 2;
  const my = (h - mh) / 2;
  panel(ctx, mx, my, mw, mh, { fill: '#18130e' });

  text(ctx, '选择剧本', mx + mw / 2, my + 24, {
    size: 30, align: 'center', color: '#ffe0a0', shadow: true,
  });
  text(ctx, '先定一朝天下，再开一局', mx + mw / 2, my + 62, {
    size: 14, align: 'center', color: '#bca88a',
  });

  const cardX = mx + 18;
  const cardW = mw - 36;
  const cardGap = 14;
  const cardTop = my + 88;
  const cardH = Math.min(188, Math.floor((mh - 88 - 62 - cardGap * 2) / 2));

  drawScenarioCard(ctx, app, cardX, cardTop, cardW, cardH, {
    title: '乱世三国',
    tag: '旧版剧情',
    desc: '沿用以前的洛阳溃兵开局与群雄自由混战；行军、攻城、募兵、内政都与三国演义共用同一套机制。',
    action: '进入乱世三国',
    id: 'new_chaos',
    onTap: function () {
      app.state = stateLib.createGame({ background: 'chaos' });
      app.replace('map');
    },
  });

  const card2Y = cardTop + cardH + cardGap;
  drawScenarioCard(ctx, app, cardX, card2Y, cardW, cardH, {
    title: '三国演义',
    tag: '汉末战略',
    desc: '同一套行军、攻城、募兵、内政机制，换成汉末战略剧情：曹操灭吕布、刘备取西川、孙权报父仇，阶段达成后继续推进。',
    action: '进入三国演义',
    id: 'new_romance',
    onTap: function () {
      app.state = stateLib.createGame({ background: 'romance', storyMode: true });
      app.replace('map');
    },
  });

  app.ui.button(ctx, cardX, my + mh - 57, cardW, 42, '返回', {
    id: 'scenario_back', size: 20, fill: '#241c14', onTap: function () {
      app.top().scene.choosing = false;
    },
  });
}

function drawScenarioCard(ctx, app, x, y, w, h, opts) {
  panel(ctx, x, y, w, h, { fill: '#241b13' });
  text(ctx, opts.title, x + 18, y + 13, {
    size: 26, color: '#f0c060',
  });
  text(ctx, opts.tag, x + w - 18, y + 20, {
    size: 13, align: 'right', color: '#bca88a',
  });

  const lines = wrap(ctx, opts.desc, w - 36, 14, 'normal').slice(0, h < 170 ? 2 : 3);
  lines.forEach(function (line, i) {
    text(ctx, line, x + 18, y + 54 + i * 20, {
      size: 14, weight: 'normal', color: '#c8b89e',
    });
  });

  app.ui.button(ctx, x + 18, y + h - 47, w - 36, 34, opts.action, {
    id: opts.id, size: 18, fill: '#3a2c1e', onTap: opts.onTap,
  });
}

/** 主页背景：有三国争霸图就铺图，图没到就退回程序化烈火战场 */
function drawTitleBackdrop(ctx, app, w, h, t) {
  const img = app.titleBg;
  if (img && app.titleBgReady && img.width && img.height) {
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.save();
    ctx.drawImage(img, dx, dy, dw, dh);
    // 上方压暗给标题让位，下方压暗承托按钮；中间保留战场主图。
    const top = ctx.createLinearGradient(0, 0, 0, h * 0.52);
    top.addColorStop(0, 'rgba(5,3,2,0.62)');
    top.addColorStop(0.52, 'rgba(5,3,2,0.38)');
    top.addColorStop(1, 'rgba(5,3,2,0.02)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h * 0.52);

    const bottom = ctx.createLinearGradient(0, h * 0.48, 0, h);
    bottom.addColorStop(0, 'rgba(5,3,2,0)');
    bottom.addColorStop(0.32, 'rgba(5,3,2,0.56)');
    bottom.addColorStop(1, 'rgba(3,2,1,0.92)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, h * 0.48, w, h * 0.52);

    // 标题附近再压一小块暗晕，金字的边缘不会和夕阳粘在一起。
    const halo = ctx.createRadialGradient(w / 2, h * 0.25, 10, w / 2, h * 0.25, w * 0.72);
    halo.addColorStop(0, 'rgba(3,2,1,0.30)');
    halo.addColorStop(0.55, 'rgba(3,2,1,0.16)');
    halo.addColorStop(1, 'rgba(3,2,1,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h * 0.52);
    ctx.restore();
    return;
  }
  drawFireBackdrop(ctx, w, h, t);
}

/** 烈火背景：不依赖外部图，纯 Canvas 烧出一片战场 */
function drawFireBackdrop(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#060403');
  sky.addColorStop(0.28, '#170a05');
  sky.addColorStop(0.55, '#421407');
  sky.addColorStop(0.78, '#1c0904');
  sky.addColorStop(1, '#050302');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 地平线上的大火光，把半个天都映红
  const glow = ctx.createRadialGradient(w / 2, h * 0.64, 20, w / 2, h * 0.64, h * 0.68);
  glow.addColorStop(0, 'rgba(255,150,52,0.62)');
  glow.addColorStop(0.35, 'rgba(210,62,14,0.32)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 远处烧黑的山脊，压低，不挡住火
  ctx.fillStyle = '#0c0705';
  for (let i = 0; i < 7; i += 1) {
    const bx = -40 + i * (w / 5);
    const bh = 70 + (i % 3) * 36;
    ctx.beginPath();
    ctx.moveTo(bx, h * 0.69);
    ctx.lineTo(bx + w / 10, h * 0.69 - bh);
    ctx.lineTo(bx + w / 4, h * 0.69);
    ctx.closePath();
    ctx.fill();
  }

  // 一层层火舌：底宽、顶窄，随风摆；颜色从暗红到亮黄
  const layers = [
    { col: 'rgba(126,22,6,0.88)', base: 0.83, amp: 140, speed: 1.2, seg: 24 },
    { col: 'rgba(210,54,9,0.86)', base: 0.88, amp: 112, speed: 1.8, seg: 30 },
    { col: 'rgba(255,108,18,0.78)', base: 0.92, amp: 86, speed: 2.4, seg: 36 },
    { col: 'rgba(255,184,56,0.52)', base: 0.95, amp: 54, speed: 3.1, seg: 42 },
  ];
  layers.forEach(function (l, li) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= l.seg; i += 1) {
      const x = (i / l.seg) * w;
      const baseY = h * l.base;
      const wave = Math.sin(i * 0.48 + t * l.speed + li * 2) * 16;
      const spike = Math.pow(Math.abs(Math.sin(i * 1.35 + t * l.speed * 0.6 + li)), 1.35) * l.amp;
      ctx.lineTo(x, baseY - spike - wave);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = l.col;
    ctx.fill();
  });

  // 烧塌的城楼剪影，压在火前面
  ctx.fillStyle = '#070403';
  const by = h * 0.735;
  const gateW = Math.min(170, w * 0.46);
  const gateX = w / 2 - gateW / 2;
  ctx.fillRect(gateX, by - 62, gateW, 62);
  ctx.fillRect(gateX + 18, by - 92, 34, 34);
  ctx.fillRect(gateX + gateW - 52, by - 84, 30, 30);
  for (let x = gateX; x < gateX + gateW; x += 28) {
    ctx.fillRect(x, by - 72, 14, 12);
  }
  // 门洞透出的火
  const door = ctx.createLinearGradient(0, by - 40, 0, by);
  door.addColorStop(0, 'rgba(255,170,60,0.7)');
  door.addColorStop(1, 'rgba(120,26,6,0.1)');
  ctx.fillStyle = door;
  ctx.fillRect(w / 2 - 18, by - 38, 36, 38);

  // 黑烟从城后卷上来
  ctx.fillStyle = 'rgba(10,7,5,0.32)';
  for (let i = 0; i < 5; i += 1) {
    const sx = w * (0.18 + i * 0.16);
    const sh = 120 + i * 34;
    ctx.save();
    ctx.translate(sx, h * 0.55 - sh * 0.4);
    ctx.scale(1, (sh * 0.4) / (34 + i * 8));
    ctx.beginPath();
    ctx.arc(0, 0, 34 + i * 8, 0, Math.PI * 2);
    ctx.restore();
    ctx.fill();
  }

  // 飞灰与火星
  for (let i = 0; i < 64; i += 1) {
    const seed = i * 37.7;
    const x = ((seed + t * (18 + (i % 5) * 8)) % (w + 40)) - 20;
    const y = h * 0.94 - ((seed * 3 + t * (26 + (i % 7) * 9)) % (h * 0.78));
    const a = 0.28 + (Math.sin(t * 2 + i) + 1) * 0.25;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255,224,150,' + a + ')' : 'rgba(255,104,30,' + a + ')';
    ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 3));
  }

  // 底部烟尘，压暗按钮区
  const smoke = ctx.createLinearGradient(0, h * 0.78, 0, h);
  smoke.addColorStop(0, 'rgba(0,0,0,0)');
  smoke.addColorStop(1, 'rgba(0,0,0,0.74)');
  ctx.fillStyle = smoke;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
}

function pixelSilhouette(ctx, app, cx, cy, size, t) {
  // 光晕
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, size * 0.9);
  g.addColorStop(0, 'rgba(240,192,96,0.28)');
  g.addColorStop(1, 'rgba(240,192,96,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

  const w = size;
  const hh = size * 1.25;
  ctx.drawImage(app.assets.player, cx - w / 2, cy - hh * 0.55 + Math.sin(t) * 3, w, hh);
}

module.exports = TitleScene;
module.exports.SAVE_KEY = SAVE_KEY;
