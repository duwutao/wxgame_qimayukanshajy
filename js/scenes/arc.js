/**
 * 长夜篇：第一次统一后的庆祝、三十天大旱、流亡边陲、再统一与尾声。
 * 这一页只负责把大事讲清楚；真正的倒计时和天下局势在大地图左上角。
 */

const { text, wrap } = require('../render/ui.js');
const { UI_COLORS } = require('../render/pixel.js');
const { drawBackdrop } = require('../render/scenery.js');
const { STORY } = require('../data/story.js');

const ArcScene = {
  enter(app, params) {
    let phase = (params && params.phase) || (app.state && app.state.arc && app.state.arc.phase) || 'celebration';
    // 新叙事：背叛事件对应“退往边陲”，到达事件对应“边陲复国”。
    if (phase === 'betrayal' || phase === 'retreat-block') phase = 'retreat';
    if (phase === 'edge') phase = 'reconquest';
    this.phase = phase;
    this.t = 0;
  },
  update(app, dt) { this.t += dt || 0; },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    if (!st) { app.replace('title'); return; }
    const arc = st.arc || {};
    const phase = this.phase === 'finale' ? 'finale' : this.phase;
    const data = phase === 'celebration'
      ? {
        title: '天下归一',
        sub: '距大旱还有 ' + Math.max(0, (arc.disasterDay || st.clock.day) - st.clock.day) + ' 天',
        lines: [
          st.player.faction && st.player.faction !== 'player' && st.player.country
            ? '你随着' + st.player.country.name + '的旗，走到了最后一座城。'
            : '你把自己的旗插上了最后一座城。',
          '各地使者排队递上降表。你在城楼上站了很久，风从西边来，带着一点土味。',
          '从今天起，天下只有一个年号。只是西边的云，已经开始发黄。',
        ],
        btn: '继续守这三十天',
      }
      : phase === 'disaster'
        ? {
          title: '大旱 · 天下皆反',
          sub: '第三十天',
          lines: [
            '西边的天一直黄着。井先干了，然后是河。',
            '粮价一天三涨。路边开始有人交换孩子；史官只写了四个字：易子而食。',
            '各地豪强把你的旗从城头扯下来，换上了自己的。你所在的城市被反贼围了。',
            '你带着还能走的旧部，从北门杀出去。天亮时，在一座地图边缘的小城停下。',
            '从今天起，全国都在捉拿你。只有从你队伍里出去的领主，还愿意站在你这边。',
          ],
          btn: '在边陲小城落脚',
        }
        : phase === 'finale'
          ? {
            title: '国泰民安',
            sub: '重定天下 · 第 ' + (arc.finaleDay || st.clock.day) + ' 天',
            lines: [
              '你带着旧部从边陲小城一路打回都城。城门开时，城里的人跪了一地。',
              '你在大殿上摆下酒席，把一路跟来的旧部一个个叫到面前。',
              '封侯、赐地、赦天下。史官在殿下写：天下再定，百姓始安。',
              '你终于可以把刀放下。只是这片大陆的风，还没有停。',
            ],
            btn: null,
          }
          : phase === 'retreat'
            ? {
              title: STORY.unification.betrayTitle || '全国背叛',
              sub: '退往边陲小镇 · 第 ' + (arc.disasterDay || st.clock.day) + ' 天',
              lines: STORY.unification.betrayLines || [],
              btn: '继续往边陲小镇',
            }
            : {
              title: STORY.unification.edgeTitle || '边陲小镇',
              sub: '每月 1000 金币 · 400 粮草',
              lines: STORY.unification.edgeLines || [],
              btn: '从边陲小镇反攻',
            };

    drawBackdrop(ctx, phase === 'finale' || phase === 'celebration' ? 'hall' : 'battle', w, h, 77);
    ctx.fillStyle = 'rgba(8,6,4,0.58)';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(240,192,96,0.12)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    text(ctx, data.title, w / 2, h * 0.16, { size: 52, align: 'center', color: '#f0c060' });
    text(ctx, data.sub, w / 2, h * 0.16 + 56, { size: 16, align: 'center', color: '#a2947a' });
    ctx.fillStyle = UI_COLORS.accent;
    ctx.fillRect(w / 2 - 60, h * 0.16 + 84, 120, 2);

    let y = h * 0.16 + 118;
    data.lines.forEach(function (line) {
      wrap(ctx, line, w - 64, 22, 'bold').forEach(function (l) {
        text(ctx, l, w / 2, y, { size: 21, align: 'center', color: '#e6d7b6' });
        y += 34;
      });
      y += 8;
    });

    if (phase === 'finale') {
      const stats = '第 ' + st.clock.day + ' 天 · 胜 ' + st.stats.battlesWon + ' · 城 ' + st.stats.sitesTaken
        + ' · 兵 ' + require('../core/army.js').troopCount(st.player.troops);
      text(ctx, stats, w / 2, h - 188, { size: 15, align: 'center', color: '#8a8070' });
      app.ui.button(ctx, 40, h - 164, w - 80, 66, '留在这片大陆', {
        id: 'arc_stay', size: 24, fill: '#3a2b1b', onTap: function () {
          st.arc.phase = 'sandbox';
          st.events.push({ type: 'warning', text: '你留在了这片大陆。天下已定，但烽火还可以再点。' });
          app.replace('map');
        },
      });
      app.ui.button(ctx, 40, h - 88, w - 80, 58, '离开 · 回到标题', {
        id: 'arc_leave', size: 22, fill: '#201a14', onTap: function () {
          st.arc.phase = 'done';
          st.ending = {
            type: 'arc',
            title: '谢君一游',
            text: '你放下了刀，走出了这座城。\n\n天下很大，故事到这里。\n\n感谢你游玩《征战汉末》。\n愿你在下一个乱世，仍有旧部相随。',
          };
          st.gameOver = true;
          app.replace('ending');
        },
      });
      return;
    }

    app.ui.button(ctx, 44, h - 128, w - 88, 70, data.btn, {
      id: 'arc_go', size: 25, fill: '#3a2b1b', onTap: function () {
        app.replace('map');
      },
    });
    text(ctx, '这一段不跳时间；点下去，继续走。', w / 2, h - 42, { size: 14, align: 'center', color: '#8a8070' });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ArcScene;
