/**
 * 结局页
 */

const { text, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const stateLib = require('../core/state.js');
const armyLib = require('../core/army.js');
const { ENDINGS } = require('../data/china.js');

const EndingScene = {
  enter(app) {},
  update() {},

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const ending = (st && st.ending) || { type: 'self', text: '故事到这里。', title: '终局' };

    ctx.fillStyle = '#0e0b08';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(240,192,96,0.10)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    text(ctx, ending.title || (ENDINGS[ending.type] ? ENDINGS[ending.type].title : '终局'), w / 2, h * 0.18, {
      size: 72, align: 'center', color: '#f0c060',
    });
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(w / 2 - 70, h * 0.18 + 92, 140, 3);

    let y = h * 0.18 + 130;
    ending.text.split('\n').forEach(function (line) {
      wrap(ctx, line, w - 100, 22, 'bold').forEach(function (l) {
        text(ctx, l, w / 2, y, { size: 22, align: 'center', color: '#e6d7b6' });
        y += 38;
      });
      y += 10;
    });

    if (st) {
      y += 30;
      const lines = [
        '第 ' + st.clock.day + ' 天',
        '胜 ' + st.stats.battlesWon + ' · 败 ' + st.stats.battlesLost,
        '城 ' + st.stats.sitesTaken + ' · 村 ' + st.stats.villagesRaided,
        '兵 ' + armyLib.troopCount(st.player.troops),
        '天机简 ' + st.player.shiUsed,
      ];
      text(ctx, lines.join('　'), w / 2, y, { size: 16, align: 'center', color: '#8a8070' });
    }

    if (ending.type !== 'arc') {
      app.ui.button(ctx, 40, h - 200, w - 80, 82, '再走一遍', {
        id: 'again', size: 28, fill: '#33271b', onTap: function () {
          app.runtime.storage.remove('bw_save_v3');
          app.state = stateLib.createGame({});
          app.replace('map');
        },
      });
    }
    app.ui.button(ctx, 40, h - 104, w - 80, 70, '回到标题', {
      id: 'to_title', size: 26, fill: '#201a14', onTap: function () {
        app.saveMeta = null;
        app.replace('title');
      },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = EndingScene;
