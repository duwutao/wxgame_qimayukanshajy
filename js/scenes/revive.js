/**
 * 复活提示：全灭之后回到一天前，用一段文字说明这是第几次
 * （次数只在这个界面上出现，别处不提示）
 */

const { text, panel, wrap } = require('../render/ui.js');

const OPENERS = [
  '名册上的墨还没干透，你又站了起来。',
  '有人在纸上划掉了你的名字，过了一会儿，又写了回去。',
  '火堆还剩一点余温。你从灰里坐起来，先摸了摸自己的刀。',
  '这一次醒得比上一回快。帐外的马打了个响鼻，像是早知道你会回来。',
  '你睁开眼，看见自己的旗插在原来的地方，旗角卷着风。',
  '血迹被夜里的雨冲干净了，只有靴底还粘着泥。',
  '有人在数人头，数到你的时候停了一下，然后接着往下数。',
  '你听见远处有人喊你的名字，声音很熟，想不起是谁。',
];

const BODY = [
  '身边的人还在，只是都老了一岁——其实是你的记忆往回退了一天。',
  '帐里的粮还剩半袋，地图上的墨迹被水汽晕开了一角。',
  '你记得自己倒下的地方，但走过去只有一片被踩平的草。',
  '队里的老兵什么都没问，把一碗热粥推到你面前。',
  '你翻了个身，发现自己躺在一天前的那张草席上。',
  '马夫说昨天夜里你一直在说梦话，说的是别人的名字。',
  '刀鞘上的缺口还在，说明那一战真的打过。',
  '风把营门口的旗吹得笔直，像什么都没发生过。',
];

const ReviveScene = {
  enter(app, params) {
    const n = (params && params.count) || 1;
    app.reviveView = {
      count: n,
      opener: OPENERS[(n - 1) % OPENERS.length],
      body: BODY[(n - 1) % BODY.length],
      t: 0,
    };
  },

  update(app, dt) {
    if (app.reviveView) app.reviveView.t += dt;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const v = app.reviveView;
    if (!v) return;

    const fade = Math.min(1, v.t / 0.6);

    ctx.fillStyle = '#070605';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(160,40,30,' + (0.10 * fade) + ')';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '第 ' + v.count + ' 次', w / 2, h * 0.18, {
      size: 56, align: 'center', color: '#c05040',
    });

    const lines1 = wrap(ctx, v.opener, w - 120, 24, 'bold');
    lines1.forEach(function (ln, i) {
      text(ctx, ln, w / 2, h * 0.34 + i * 38, { size: 24, align: 'center', color: '#efe3c6' });
    });

    const lines2 = wrap(ctx, v.body, w - 160, 19);
    lines2.forEach(function (ln, i) {
      text(ctx, ln, w / 2, h * 0.34 + lines1.length * 38 + 26 + i * 30, {
        size: 19, align: 'center', color: '#a2947a',
      });
    });

    app.ui.button(ctx, w / 2 - 130, h - 140, 260, 74, '起身', {
      id: 'revive_ok', size: 28, fill: '#33271b', onTap: function () {
        app.pop();
      },
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = ReviveScene;
