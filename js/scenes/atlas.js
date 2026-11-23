/**
 * 天下大势：整张中国地图一屏看完，标大城关隘、势力、自己的位置
 */

const { REGIONS, FACTIONS } = require('../data/china.js');
const { text } = require('../render/ui.js');

const MAP_TOP = 112;
const MAP_LEFT = 10;

/** 只给这些要地标名字，其余城池只点方块，免得满屏小字 */
const KEY_SITES = [
  'luoyang', 'changan', 'xuchang', 'ye', 'chengdu', 'jianye', 'xiangyang',
  'jiangling', 'shouchun', 'xiapi', 'beiping', 'jinyang', 'tianshui', 'hanzhong',
  'changsha', 'wujun', 'chenliu', 'guandu',
];

function cellColor(t, region) {
  if (t === 'sea') return '#1e4166';
  if (t === 'river') return '#356a94';
  if (t === 'mountain') return '#6d6760';
  if (t === 'road') return '#8f7a58';
  const r = REGIONS[region] || REGIONS.zhongyuan;
  return r.palette.ground;
}

const AtlasScene = {
  enter(app) {
    app.atlasPulse = 0;
  },

  update(app, dt) {
    app.atlasPulse = (app.atlasPulse || 0) + dt;
  },

  render(app) {
    const ctx = app.runtime.ctx;
    const w = app.runtime.width;
    const h = app.runtime.height;
    const st = app.state;

    ctx.fillStyle = '#0e0b08';
    ctx.fillRect(0, 0, w, h);

    text(ctx, '天下大势', 16, 22, { size: 34, color: '#f0c060' });
    text(ctx, '魏 · 蜀 · 吴 · 群雄割据', 16, 66, { size: 17, color: '#a2947a' });

    app.ui.button(ctx, w - 146, 20, 130, 56, '返回', {
      id: 'atlas_back', size: 22, onTap: function () { app.pop(); },
    });

    const world = st.world;
    const cell = Math.min((w - MAP_LEFT * 2) / world.w, (h - MAP_TOP - 150) / world.h);
    const ox = (w - cell * world.w) / 2;
    const oy = MAP_TOP + 6;
    const mw = cell * world.w;
    const mh = cell * world.h;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, MAP_TOP, w, mh + 12);
    ctx.clip();

    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const t = world.tiles[y * world.w + x];
        const reg = (world.regions && world.regions[y * world.w + x]) || 'zhongyuan';
        ctx.fillStyle = cellColor(t, reg);
        ctx.fillRect(ox + x * cell, oy + y * cell, Math.ceil(cell) + 1, Math.ceil(cell) + 1);
      }
    }

    // 据点：城与关标名牌，村庄只点一个点
    world.sites.forEach(function (s) {
      const sx = ox + (s.x + 0.5) * cell;
      const sy = oy + (s.y + 0.5) * cell;
      if (sx < -20 || sx > w + 20 || sy < MAP_TOP - 20 || sy > MAP_TOP + mh + 20) return;
      const fac = s.ownerFaction ? FACTIONS[s.ownerFaction] : null;
      const col = fac ? fac.color : '#8a8276';

      if (s.type === 'village') {
        ctx.fillStyle = col;
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        return;
      }
      if (s.type === 'camp') {
        ctx.fillStyle = '#a8503c';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
        return;
      }

      const big = s.type === 'town';
      const sz = big ? 8 : 6;
      ctx.fillStyle = '#0d0a07';
      ctx.fillRect(sx - sz / 2 - 1, sy - sz / 2 - 1, sz + 2, sz + 2);
      ctx.fillStyle = s.playerOwned ? '#f0c060' : col;
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
      if (big) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, 1);
      }

      if (KEY_SITES.indexOf(s.id) < 0) return;
      ctx.font = 'bold 12px "PingFang SC","Microsoft YaHei",sans-serif';
      const tw = ctx.measureText(s.name).width;
      ctx.fillStyle = 'rgba(8,6,4,0.78)';
      ctx.fillRect(sx - tw / 2 - 3, sy + sz / 2 + 1, tw + 6, 16);
      text(ctx, s.name, sx, sy + sz / 2 + 3, {
        size: 12, align: 'center', color: s.playerOwned ? '#f0c060' : '#ece1c8',
      });
    });

    // 自己
    const ppx = ox + (st.player.x + 0.5) * cell;
    const ppy = oy + (st.player.y + 0.5) * cell;
    const pulse = 5 + Math.sin((app.atlasPulse || 0) * 3) * 2;
    ctx.strokeStyle = 'rgba(240,192,96,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ppx, ppy, pulse + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.moveTo(ppx, ppy - 8);
    ctx.lineTo(ppx + 6, ppy + 6);
    ctx.lineTo(ppx, ppy + 2);
    ctx.lineTo(ppx - 6, ppy + 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // 边框
    ctx.strokeStyle = 'rgba(240,192,96,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, mw, mh);

    // 势力图例
    const legendY = oy + mh + 16;
    const ids = Object.keys(FACTIONS);
    const cols = 5;
    const cw = (w - MAP_LEFT * 2) / cols;
    ids.forEach(function (id, i) {
      const cx = MAP_LEFT + (i % cols) * cw;
      const cy = legendY + Math.floor(i / cols) * 32;
      ctx.fillStyle = FACTIONS[id].color;
      ctx.fillRect(cx, cy + 3, 14, 14);
      text(ctx, FACTIONS[id].name || FACTIONS[id].full, cx + 22, cy + 2, { size: 15, color: '#c9bda2' });
    });

    text(ctx, '金圈是你所在的位置 · 城与关标名牌 · 灰块是山、蓝带是水', MAP_LEFT, legendY + 76, {
      size: 14, color: '#8a8070',
    });
  },

  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
};

module.exports = AtlasScene;
