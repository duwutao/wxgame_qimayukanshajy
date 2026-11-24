/**
 * 英雄对话页：从队伍页点名字进来，能聊两句，也能请他离开。
 */

const { text, panel, bar, wrap } = require('../render/ui.js');
const stateLib = require('../core/state.js');
const heroesLib = require('../core/heroes.js');
const { siteById } = require('../core/world.js');
const { HERO_MAX_LEVEL, HERO_BONUS } = require('../data/extra.js');

const COMMON = [
  '……营里的火还没灭，坐会儿？',
  '今天走了三十里，马都出汗了。',
  '你信这天下还能太平吗？我不太信。',
  '我这样的人，在城里只配替人看仓门。',
  '跟着你，至少每日有口热饭。',
  '别总自己冲在前头，队里没第二个你。',
  '听说北边又打起来了。这仗没个头。',
  '我不识字。名字是别人替我写上去的。',
  '夜里巡营，看见远处有火。不知道是谁的。',
  '打了这些年，能记住的脸越来越少了。',
];

const BY_KIND = {
  atk: ['刀要常磨。磨刀的时候心也静。', '冲阵的事交给我。你在后头看着就行。', '上一仗我砍倒了三个，忘了数第四个。'],
  def: ['营垒的土得夯三层，少一层半夜就塌。', '守着不动，比冲出去难。', '我这条命，是从城墙上捡回来的。'],
  speed: ['我走惯了山路，你跟着别掉队。', '这条道我走过七回。前面有条河。', '慢一步，吃的就被人抢了。'],
  food: ['粮袋我数过，够七天。第八天得想办法。', '路上看见桑椹，也能顶一顿。', '别把干粮都给马，人先吃饱。'],
  loot: ['打完仗别急着走，死人身上有东西。', '甲可以补，刀可以磨，别扔。', '上一回我捡到一枚印，换了三十金钱。'],
  morale: ['兄弟们累了，让他们歇半日。', '骂几句不顶事。饭热了，人就稳了。', '有人夜里想家。我陪他坐到天亮。'],
};

const HeroScene = {
  enter(app, params) {
    this.index = (params || {}).index || 0;
    this.confirm = false;
    this.line = '';
    this.talks = 0;
    this.history = [];
    this.say(app);
  },

  heroOf(app) {
    const p = app.state && app.state.player;
    const list = (p && p.heroes) || [];
    return list[this.index] || null;
  },

  say(app) {
    const hh = this.heroOf(app);
    if (!hh) return;
    const b = HERO_BONUS[hh.id] || {};
    const kind = Object.keys(BY_KIND).filter(function (k) { return b[k]; })[0];
    const pool = (kind ? BY_KIND[kind] : []).concat(COMMON);
    const pick = pool[Math.floor(app.state.rng.random() * pool.length)];
    this.line = this.talks === 0 ? (kind ? BY_KIND[kind][0] : COMMON[0]) : pick;
    this.talks += 1;
    this.history.push(this.line);
    if (this.history.length > 8) this.history.shift();
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;
    const hh = this.heroOf(app);
    if (!st || !hh) {
      app.pop();
      return;
    }
    const def = heroesLib.heroById(hh.id) || { name: hh.id, bio: '', site: '' };
    const b = heroesLib.bonusOf(hh.id, hh.level);
    const lv = hh.level || 1;

    ctx.fillStyle = '#12100c';
    ctx.fillRect(0, 0, w, h);

    // 头部
    ctx.fillStyle = '#1b1611';
    ctx.fillRect(0, 0, w, 268);
    text(ctx, def.name, w - 24, 24, { size: 40, align: 'right', color: '#f0c060' });
    text(ctx, b.label || '随行英雄', w - 24, 76, { size: 16, align: 'right', color: '#a2947a' });

    // 头像：一个粗画的人影（左侧）
    const ax = 92;
    const ay = 128;
    ctx.fillStyle = '#2a231b';
    ctx.beginPath();
    ctx.arc(ax, ay, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8c8a8';
    ctx.beginPath();
    ctx.arc(ax, ay - 12, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a4a34';
    ctx.beginPath();
    ctx.moveTo(ax - 32, ay + 48);
    ctx.lineTo(ax - 24, ay + 14);
    ctx.lineTo(ax + 24, ay + 14);
    ctx.lineTo(ax + 32, ay + 48);
    ctx.closePath();
    ctx.fill();

    text(ctx, 'Lv ' + lv + ' / ' + HERO_MAX_LEVEL, 176, 106, { size: 22, color: '#efe3c6' });
    bar(ctx, 176, 136, w - 200, 10, lv >= HERO_MAX_LEVEL ? 1 : (hh.exp || 0) / (lv * heroesLib.EXP_PER_LEVEL), '#7fae6a');
    text(ctx, lv >= HERO_MAX_LEVEL ? '这一身本事，练到头了。' : '经验 ' + (hh.exp || 0) + ' / ' + (lv * heroesLib.EXP_PER_LEVEL), 176, 152, {
      size: 14, color: '#6a6355',
    });
    text(ctx, '队伍加成：' + (b.text || '无'), 176, 176, { size: 17, color: '#8fb0d8' });
    text(ctx, '旧地：' + ((siteById(st.world, def.site) || {}).name || def.site || '不明') + '（离开后能在那儿再遇见）', 176, 204, { size: 14, color: '#8a8070' });

    // 生平
    let y = 288;
    panel(ctx, 16, y, w - 32, 186, { fill: '#1b1611' });
    text(ctx, '生平', 32, y + 12, { size: 15, color: '#8a8070' });
    const bio = wrap(ctx, def.bio || '来历不明。', w - 64, 16);
    bio.slice(0, 6).forEach(function (ln, i) {
      text(ctx, ln, 32, y + 40 + i * 24, { size: 16, color: '#c9c0a8' });
    });
    y += 202;

    // 对话气泡
    const boxH = Math.max(240, h - y - 130);
    panel(ctx, 16, y, w - 32, boxH, { fill: this.confirm ? '#2a1815' : '#1d2420' });
    text(ctx, this.confirm ? '最后一句' : '他说', 32, y + 12, { size: 15, color: '#8a8070' });
    const lineColor = this.confirm ? '#e0a090' : '#efe3c6';
    if (this.confirm) {
      const line = wrap(ctx, '……你这么说，我也没什么好留的。刀我带走，甲留给你。', w - 64, 18);
      line.slice(0, 5).forEach(function (ln, i) {
        text(ctx, ln, 32, y + 44 + i * 28, { size: 19, color: lineColor });
      });
      text(ctx, '走了以后，他会在旧地待着，改天还能请你喝酒。', 32, y + boxH - 40, { size: 14, color: '#8a8070' });
    } else {
      let ty = y + 44;
      const shown = this.history.slice(-4);
      shown.forEach(function (t, idx) {
        const lines = wrap(ctx, t, w - 64, 18);
        lines.slice(0, 2).forEach(function (ln) {
          if (ty > y + boxH - 34) return;
          text(ctx, ln, 32, ty, { size: 19, color: idx === shown.length - 1 ? lineColor : '#9a9080' });
          ty += 28;
        });
        ty += 6;
      });
    }

    // 按钮
    const by = h - 96;
    if (this.confirm) {
      const bw = (w - 52) / 2;
      app.ui.button(ctx, 20, by, bw, 76, '后会有期', {
        id: 'hero_confirm_leave', size: 24, fill: '#5a2418', onTap: function () {
          const r = heroesLib.dismissHero(st, hh.id);
          if (r.ok) {
            stateLib.pushLog(st, def.name + '走了。' + (def.site ? '他说回旧地还能有口饭吃。' : ''));
            app.pop();
            app.showToast(r.msg, 2);
          }
        },
      });
      app.ui.button(ctx, 20 + bw + 12, by, bw, 76, '再留一阵', {
        id: 'hero_stay', size: 24, fill: '#241c14', onTap: function () {
          this.confirm = false;
          this.history.push('……那就再跟一段。');
        }.bind(this),
      });
    } else {
    const third = (w - 88) / 4;
    app.ui.button(ctx, 20, by, third, 76, '拉家常', {
      id: 'hero_talk', size: 20, onTap: function () { this.say(app); }.bind(this),
    });
    app.ui.button(ctx, 20 + (third + 12), by, third, 76, '封地出镇', {
      id: 'hero_promote', size: 20, fill: '#33291d', onTap: function () {
        const free = st.world.sites.filter(function (s) {
          return s.playerOwned && s.type !== 'camp' && !stateLib.siteLord(st, s);
        });
        if (!free.length) {
          app.showToast('名下没有空的封地。先去城里的“封地 · 点将”收回一处。', 3);
          return;
        }
        app.push('fief', { heroId: hh.id });
      },
    });
    app.ui.button(ctx, 20 + (third + 12) * 2, by, third, 76, '让他走', {
      id: 'hero_leave', size: 20, fill: '#3a2418', onTap: function () { this.confirm = true; }.bind(this),
    });
    app.ui.button(ctx, 20 + (third + 12) * 3, by, third, 76, '返回', {
      id: 'hero_back', size: 20, fill: '#241c14', onTap: function () { app.pop(); },
    });
    }
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = HeroScene;
