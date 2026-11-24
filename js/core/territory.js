/**
 * 势力领土网格：天下大势与大地图共用。
 *
 * 每格归给最近的、权重最高的据点；城控制的范围比村镇大。
 * 只要据点坐标或归属变了（玩家攻占、AI 夺城、山寨换地方），
 * 签名就会变化并重算，不再让旧颜色留在图上。
 */

const SITE_WEIGHT = { town: 3.2, castle: 2.4, village: 1.2, camp: 0.9 };

function siteOwner(site) {
  if (!site) return '';
  if (site.playerOwned) return 'player';
  return site.ownerFaction || '';
}

function signature(world) {
  const sites = world && world.sites ? world.sites : [];
  return sites.map(function (s) {
    return s.id + ':' + siteOwner(s) + ':' + (s.x || 0) + ',' + (s.y || 0) +
      ':' + (s.type === 'camp' && s.cleared ? 'c' : '');
  }).join('|');
}

function buildFactionGrid(world) {
  if (!world || !world.sites || !world.w || !world.h) return [];
  const sig = signature(world);
  if (world.factionGrid && world.factionGridSig === sig) return world.factionGrid;

  const W = world.w;
  const H = world.h;
  const grid = new Array(W * H).fill('');
  // 洗劫后的空山寨不再向外投射势力色
  const sites = world.sites.filter(function (s) {
    return siteOwner(s) && !(s.type === 'camp' && s.cleared);
  });

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = world.tiles[y * W + x];
      if (t === 'sea') continue;
      let best = '';
      let bestScore = Infinity;
      for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        const dx = s.x - x;
        const dy = s.y - y;
        const score = (dx * dx + dy * dy) / (SITE_WEIGHT[s.type] || 1);
        if (score < bestScore) {
          bestScore = score;
          best = siteOwner(s);
        }
      }
      grid[y * W + x] = best;
    }
  }
  world.factionGrid = grid;
  world.factionGridSig = sig;
  return grid;
}

module.exports = {
  SITE_WEIGHT,
  buildFactionGrid,
  signature,
};
