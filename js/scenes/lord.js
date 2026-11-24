/**
 * 领主对话：碰面先说话，再决定结交、送礼还是拔刀
 * 六件事：了解生平 / 查看兵力 / 送礼 / 开战 / 你在做什么 / 离开
 */

const { text, panel, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const army = require('../core/army.js');
const { FACTIONS } = require('../data/china.js');
const { lookFor } = require('../data/extra.js');

const RANK_LABEL = { king: '君主', lord: '领兵者', general: '将领' };

function lordOf(app) {
  const d = app.lordTalk;
  if (!d) return null;
  return app.state.lords.filter(function (l) { return l.id === d.lordId; })[0] || null;
}

const OPTIONS = [
  { id: 'bio', label: '了解生平' },
  { id: 'troops', label: '查看兵力' },
  { id: 'gift', label: '送礼结交' },
  { id: 'war', label: '当场开战' },
  { id: 'idle', label: '你在做什么' },
  { id: 'leave', label: '离开' },
];

const LordScene = {
  enter(app, params) {
    const lord = app.state.lords.filter(function (l) { return l.id === params.lordId; })[0];
    const hostile = lord ? stateLib.isHostileFaction(app.state, lord.faction) : false;
    // 排队的同一位领主事件清掉，避免说完了又被弹一次
    const evs = app.state.events;
    if (evs) {
      for (let i = evs.length - 1; i >= 0; i--) {
        if (evs[i].type === 'lord' && evs[i].lordId === params.lordId) evs.splice(i, 1);
      }
    }
    app.lordTalk = {
      lordId: params.lordId,
      // 敌对撞上先给“迎战/撤开”，不把人直接推进战斗
      page: hostile ? 'confront' : 'menu',
      line: !lord ? '……' : hostile
        ? '“站住。”\n他把马横在路当中，手按在刀柄上，眼睛在你队伍上扫了一遍。'
        : stateLib.lordGreet(app.state, lord) + '\n' + stateLib.lordIdle(app.state, lord),
    };
  },

  update(app) {
    const lord = lordOf(app);
    if (!lord || !lord.alive) {
      app.pop();
    }
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const d = app.lordTalk;
    const lord = lordOf(app);
    if (!lord) return;

    const fac = FACTIONS[lord.faction];
    const col = fac ? fac.color : '#8f8f86';

    ctx.fillStyle = '#0d0a07';
    ctx.fillRect(0, 0, w, h);

    // 背景条：势力色
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, 0, w, 300);
    ctx.globalAlpha = 1;

    // 立绘：一整队人马放大（骑手 + 两卒 + 旗），按势力上色
    const look = lookFor(lord.id);
    const sprite = (app.assets.portraitFor ? app.assets.portraitFor(col, look) : null) || app.assets.lord;
    const sw0 = sprite.width || 42;
    const sh0 = sprite.height || 40;
    let spW = Math.min(310, w * 0.74);
    let spH = spW * (sh0 / sw0);
    const maxH = Math.max(170, h * 0.235);
    if (spH > maxH) {
      spH = maxH;
      spW = spH * (sw0 / sh0);
    }
    ctx.drawImage(sprite, w / 2 - spW / 2, 88, spW, spH);

    // 名字与身份
    text(ctx, lord.name, w / 2, 26, { size: 42, align: 'center', color: '#f5e9cf', shadow: true });
    text(ctx, (lord.title || '') + ' · ' + (fac ? fac.full : '无主'), w / 2, 76, {
      size: 18, align: 'center', color: '#c9bda2', shadow: true,
    });

    // 话框
    const boxY = Math.max(h * 0.315, 240);
    const isBio = d.page === 'bio';
    const boxH = isBio ? (h - boxY - 116) : Math.min(260, h - boxY - 250);
    panel(ctx, 20, boxY, w - 40, boxH, { fill: '#201a14' });
    text(ctx, '关系 ' + stateLib.relationOf(st, lord.faction) + ' · ' +
      (RANK_LABEL[stateLib.lordRank(lord)] || '将领'),
      w - 36, boxY + 10, { size: 16, align: 'right', color: '#a2947a' });
    if (isBio) text(ctx, '生平', 40, boxY + 10, { size: 16, color: '#c9bda2' });
    const size = isBio ? 18 : 21;
    const lineH = isBio ? 28 : 32;
    const top = isBio ? 46 : 26;
    const lines = wrap(ctx, d.line, w - 96, size, 'bold');
    const maxLines = Math.floor((boxH - top - 14) / lineH);
    lines.slice(0, maxLines).forEach(function (ln, i) {
      text(ctx, ln, 48, boxY + top + i * lineH, { size, color: '#efe3c6' });
    });

    const bottomY = boxY + boxH + 16;

    if (d.page === 'menu') {
      OPTIONS.forEach(function (op, i) {
        const bw = (w - 60) / 3;
        const bx = 20 + (i % 3) * (bw + 10);
        const by = bottomY + Math.floor(i / 3) * 78;
        app.ui.button(ctx, bx, by, bw, 68, op.label, {
          id: 'ld_' + op.id,
          size: 22,
          fill: op.id === 'war' ? '#43201a' : '#33271b',
          onTap: function () { act(app, op.id); },
        });
      });
    } else if (d.page === 'gift') {
      text(ctx, '送礼：君主 100 金换 5 点，领兵者 3 点，将领 2 点。', 24, bottomY, {
        size: 18, color: '#a2947a',
      });
      [100, 300, 500].forEach(function (g, i) {
        const bw = (w - 60) / 3;
        app.ui.button(ctx, 20 + i * (bw + 10), bottomY + 34, bw, 70, g + ' 金', {
          id: 'gift_' + g, size: 24, fill: '#3a2a12', onTap: function () {
            const r = stateLib.giftLord(st, lord, g);
            app.showToast(r.msg, 2);
            d.line = r.ok ? lord.name + '收下了这份礼。\n（' + r.msg + '）' : r.msg;
            d.page = 'menu';
          },
        });
      });
      app.ui.button(ctx, 20, bottomY + 116, w - 40, 62, '算了', {
        id: 'gift_back', size: 22, fill: '#241c14', onTap: function () { d.page = 'menu'; },
      });
    } else if (d.page === 'confront') {
      // 被拦住：可以迎战，也可以撤开——不是只能打
      text(ctx, '迎战：当场打一场。', 24, bottomY, { size: 17, color: '#c9bda2' });
      text(ctx, '撤开：不损一兵，双方拉开，短时间不会再撞上。', 24, bottomY + 26, {
        size: 17, color: '#8fbf7a',
      });
      app.ui.button(ctx, 20, bottomY + 62, w / 2 - 30, 74, '迎战', {
        id: 'cf_war', size: 26, fill: '#43201a', onTap: function () { act(app, 'war'); },
      });
      app.ui.button(ctx, w / 2 + 10, bottomY + 62, w / 2 - 30, 74, '撤开', {
        id: 'cf_flee', size: 26, fill: '#241c14', onTap: function () {
          stateLib.afterRetreat(st, { lordId: lord.id });
          app.pop();
          app.showToast('你退开一段路，他没有追上来。', 2.2);
        },
      });
    } else {
      app.ui.button(ctx, 20, bottomY, w - 40, 68, '回到话头', {
        id: 'ld_back', size: 24, fill: '#241c14', onTap: function () { d.page = 'menu'; },
      });
    }
  },
};

function act(app, id) {
  const st = app.state;
  const d = app.lordTalk;
  const lord = lordOf(app);
  if (!lord) return;

  if (id === 'bio') {
    const t = stateLib.lordLines(lord);
    d.line = t.bio || ('关于' + lord.name + '，你能知道的只有他现在的样子。');
    d.page = 'bio';
    return;
  }
  if (id === 'troops') {
    const rows = stateLib.lordTroopLine(lord);
    d.line = '“我的家底？”\n' + (rows.length ? rows.join(' · ') : '人已经打光了') +
      '\n合计 ' + army.troopCount(lord.troops) + ' 人，士气 ' + Math.round(lord.morale) +
      (stateLib.isHostileFaction(st, lord.faction) ? '。他手按着刀柄。' : '。');
    d.page = 'troops';
    return;
  }
  if (id === 'gift') {
    d.page = 'gift';
    return;
  }
  if (id === 'idle') {
    d.line = '“' + stateLib.lordIdle(st, lord) + '”\n（他把手里的东西放下，看了你一眼。）';
    d.page = 'idle';
    return;
  }
  if (id === 'war') {
    const r = stateLib.provokeLord(st, lord);
    app.showToast(r.msg + '，他拔了刀。', 2);
    stateLib.startLordBattle(st, lord);
    app.push('battle', { mode: 'lord' });
    return;
  }
  if (id === 'leave') {
    if (stateLib.isHostileFaction(st, lord.faction)) {
      d.page = 'confront';
      d.line = '“既然来了，就别想着走了。”\n他勒转马头，手已经按在刀柄上。';
      return;
    }
    app.pop();
  }
}

module.exports = LordScene;
