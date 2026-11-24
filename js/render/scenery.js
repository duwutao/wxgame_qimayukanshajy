/**
 * 场景背景：不引入外部图片，用 Canvas 画出“像照片一样”的场所剪影。
 * 城是街市、村是田埂、扎营是帐篷、比武是彩棚、牢房是铁栏。
 * 所有函数只画背景，UI 仍由各场景盖在上面。
 */

function seeded(seed, n) {
  const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function city(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1a120c');
  sky.addColorStop(0.42, '#3b2415');
  sky.addColorStop(0.72, '#120d09');
  sky.addColorStop(1, '#080605');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 远处城楼与屋脊
  ctx.fillStyle = '#0b0806';
  const base = h * 0.43;
  for (let i = 0; i < 9; i += 1) {
    const bw = w / 7 + seeded(seed, i) * 30;
    const bx = -20 + i * (w / 8);
    const bh = 38 + seeded(seed, i + 9) * 120;
    ctx.fillRect(bx, base - bh, bw, bh);
    // 飞檐
    ctx.beginPath();
    ctx.moveTo(bx - 14, base - bh);
    ctx.lineTo(bx + bw / 2, base - bh - 26 - seeded(seed, i + 30) * 20);
    ctx.lineTo(bx + bw + 14, base - bh);
    ctx.closePath();
    ctx.fill();
  }

  // 街面与两侧铺面
  ctx.fillStyle = '#1b110a';
  ctx.fillRect(0, h * 0.52, w, h * 0.48);
  ctx.fillStyle = '#2a1a10';
  for (let i = 0; i < 8; i += 1) {
    const bx = i * (w / 7) - 20;
    const by = h * 0.54 + seeded(seed, i + 50) * 80;
    ctx.fillRect(bx, by, w / 8, h * 0.24);
    // 铺面招牌
    ctx.fillStyle = 'rgba(210,140,50,0.18)';
    ctx.fillRect(bx + 10, by + 14, 34, 8);
    ctx.fillStyle = '#2a1a10';
  }

  // 灯笼
  for (let i = 0; i < 6; i += 1) {
    const lx = 40 + i * (w / 5.4);
    const ly = h * 0.55 + Math.sin(i) * 16;
    const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 72);
    g.addColorStop(0, 'rgba(255,150,60,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 72, ly - 72, 144, 144);
    ctx.fillStyle = '#c85a24';
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 街上的人影
  ctx.fillStyle = 'rgba(8,6,5,0.88)';
  for (let i = 0; i < 18; i += 1) {
    const px = seeded(seed, i + 80) * w;
    const py = h * 0.68 + seeded(seed, i + 100) * h * 0.2;
    const s = 10 + seeded(seed, i + 120) * 13;
    ctx.fillRect(px, py, s * 0.55, s * 1.7);
    ctx.beginPath();
    ctx.arc(px + s * 0.28, py - 3, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  // 街市下半段：灯笼、摊位与人影，让城页底部不是一块死黑
  const street = ctx.createLinearGradient(0, h * 0.66, 0, h);
  street.addColorStop(0, 'rgba(112,62,30,0.18)');
  street.addColorStop(1, 'rgba(24,14,9,0.46)');
  ctx.fillStyle = street;
  ctx.fillRect(0, h * 0.66, w, h * 0.34);

  for (let i = 0; i < 4; i += 1) {
    const lx = 46 + seeded(seed, i + 180) * (w - 92);
    const ly = h * 0.72 + i * h * 0.045;
    const g2 = ctx.createRadialGradient(lx, ly, 2, lx, ly, 54);
    g2.addColorStop(0, 'rgba(255,176,84,0.28)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(lx - 54, ly - 54, 108, 108);
    ctx.fillStyle = '#c76125';
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(6,4,3,0.9)';
  for (let i = 0; i < 14; i += 1) {
    const px = seeded(seed, i + 240) * w;
    const py = h * 0.76 + seeded(seed, i + 260) * h * 0.16;
    const sc = 12 + seeded(seed, i + 280) * 18;
    ctx.fillRect(px, py, sc * 0.5, sc * 1.6);
    ctx.beginPath();
    ctx.arc(px + sc * 0.25, py - 3, sc * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // 地气
  const fog = ctx.createLinearGradient(0, h * 0.58, 0, h);
  fog.addColorStop(0, 'rgba(90,58,30,0)');
  fog.addColorStop(1, 'rgba(20,12,8,0.55)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, h * 0.58, w, h * 0.42);
}

function village(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#142019');
  sky.addColorStop(0.45, '#28321c');
  sky.addColorStop(0.75, '#100e08');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 田埂
  ctx.strokeStyle = 'rgba(150,120,60,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-40, h * 0.48 + i * 24);
    ctx.lineTo(w + 40, h * 0.52 + i * 26);
    ctx.stroke();
  }

  // 茅屋
  ctx.fillStyle = '#15100a';
  for (let i = 0; i < 5; i += 1) {
    const bx = 20 + i * (w / 5.4);
    const by = h * 0.48 + seeded(seed, i + 5) * 38;
    ctx.fillRect(bx, by, 92, 78);
    ctx.beginPath();
    ctx.moveTo(bx - 16, by);
    ctx.lineTo(bx + 46, by - 48);
    ctx.lineTo(bx + 108, by);
    ctx.closePath();
    ctx.fill();
  }

  // 炊烟
  ctx.strokeStyle = 'rgba(180,170,150,0.14)';
  ctx.lineWidth = 7;
  for (let i = 0; i < 4; i += 1) {
    const sx = 60 + i * (w / 4.3);
    ctx.beginPath();
    for (let j = 0; j < 8; j += 1) {
      ctx.lineTo(sx + Math.sin(j * 0.9 + i) * 12, h * 0.42 - j * 22);
    }
    ctx.stroke();
  }

  // 篱笆与人
  ctx.fillStyle = 'rgba(8,6,4,0.85)';
  for (let i = 0; i < 8; i += 1) {
    const px = seeded(seed, i + 40) * w;
    const py = h * 0.62 + seeded(seed, i + 50) * h * 0.12;
    ctx.fillRect(px, py, 7, 22);
    ctx.beginPath();
    ctx.arc(px + 3, py - 3, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,14,8,0.55)';
  ctx.fillRect(0, h * 0.75, w, h * 0.25);
}

function camp(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b0907');
  sky.addColorStop(0.5, '#171008');
  sky.addColorStop(1, '#080504');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 层层帐篷
  for (let layer = 0; layer < 3; layer += 1) {
    const baseY = h * (0.44 + layer * 0.12);
    const alpha = 0.18 + layer * 0.13;
    ctx.fillStyle = 'rgba(52,42,30,' + alpha + ')';
    for (let i = 0; i < 6 + layer; i += 1) {
      const tx = -30 + i * (w / (5 + layer)) + seeded(seed, i + layer * 9) * 16;
      const tw = 90 + seeded(seed, i + layer * 5) * 30;
      const th = 60 + seeded(seed, i + layer * 7) * 30;
      ctx.beginPath();
      ctx.moveTo(tx, baseY);
      ctx.lineTo(tx + tw / 2, baseY - th);
      ctx.lineTo(tx + tw, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 中军大帐与旗
  ctx.fillStyle = 'rgba(30,22,14,0.95)';
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.64);
  ctx.lineTo(w * 0.5, h * 0.38);
  ctx.lineTo(w * 0.66, h * 0.64);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,192,96,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(w * 0.5 - 3, h * 0.26, 6, h * 0.4);
  ctx.fillStyle = 'rgba(190,70,45,0.5)';
  ctx.fillRect(w * 0.5 + 3, h * 0.27, 34, 18);

  // 营火
  for (let i = 0; i < 4; i += 1) {
    const fx = w * (0.12 + i * 0.24) + seeded(seed, i + 30) * 20;
    const fy = h * 0.73 + seeded(seed, i + 40) * 30;
    const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, 60);
    g.addColorStop(0, 'rgba(255,150,60,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - 60, fy - 60, 120, 120);
    ctx.fillStyle = '#e07824';
    ctx.beginPath();
    ctx.moveTo(fx - 8, fy + 6);
    ctx.lineTo(fx, fy - 20);
    ctx.lineTo(fx + 8, fy + 6);
    ctx.closePath();
    ctx.fill();
  }

  // 枪林
  ctx.strokeStyle = 'rgba(90,75,52,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 25; i += 1) {
    const px = seeded(seed, i + 80) * w;
    const py = h * 0.55 + seeded(seed, i + 90) * h * 0.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 8, py - 54 - seeded(seed, i + 100) * 30);
    ctx.stroke();
  }
}

function tourney(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1c120c');
  sky.addColorStop(0.55, '#3c2415');
  sky.addColorStop(1, '#0d0805');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 彩棚与看台
  ctx.fillStyle = '#251810';
  ctx.fillRect(0, h * 0.44, w, h * 0.18);
  for (let i = 0; i < 9; i += 1) {
    ctx.fillStyle = i % 2 ? 'rgba(150,55,35,0.28)' : 'rgba(190,150,60,0.22)';
    ctx.beginPath();
    ctx.moveTo(i * (w / 8), h * 0.44);
    ctx.lineTo(i * (w / 8) + w / 20, h * 0.38);
    ctx.lineTo(i * (w / 8) + w / 10, h * 0.44);
    ctx.closePath();
    ctx.fill();
  }

  // 台上的人影
  ctx.fillStyle = 'rgba(10,7,5,0.85)';
  for (let i = 0; i < 16; i += 1) {
    const px = 16 + i * (w / 16);
    const py = h * 0.47 + seeded(seed, i + 20) * 14;
    ctx.fillRect(px, py, 8, 18);
    ctx.beginPath();
    ctx.arc(px + 4, py - 3, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 场中两个持械的对手
  ctx.fillStyle = '#0a0705';
  const cy = h * 0.68;
  [[w * 0.40, -1], [w * 0.60, 1]].forEach(function (f, i) {
    const x = f[0];
    const dir = f[1];
    ctx.fillRect(x - 4, cy - 50, 8, 50);
    ctx.beginPath();
    ctx.arc(x, cy - 58, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a0705';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, cy - 38);
    ctx.lineTo(x + dir * 34, cy - 55);
    ctx.stroke();
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(x + dir * 30, cy - 66, 3, 40);
  });

  // 扬尘
  const g = ctx.createRadialGradient(w / 2, cy + 30, 20, w / 2, cy + 30, w * 0.6);
  g.addColorStop(0, 'rgba(180,130,70,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
}

function prison(ctx, w, h) {
  ctx.fillStyle = '#0d0a07';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.35, w * 0.8);
  g.addColorStop(0, 'rgba(100,72,30,0.20)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8,6,4,0.82)';
  for (let i = 0; i < 9; i += 1) {
    ctx.fillRect(24 + i * 58, 0, 11, h * 0.78);
  }
  ctx.fillStyle = 'rgba(160,120,60,0.16)';
  for (let i = 0; i < 9; i += 1) {
    ctx.fillRect(35 + i * 58, 0, 2, h * 0.78);
  }
  ctx.fillStyle = 'rgba(10,7,5,0.65)';
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
}

function hall(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#160f0b');
  sky.addColorStop(0.5, '#261910');
  sky.addColorStop(1, '#0c0806');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 立柱与横梁
  ctx.fillStyle = 'rgba(14,10,7,0.9)';
  for (let i = 0; i < 3; i += 1) {
    ctx.fillRect(40 + i * (w - 120), 0, 34, h);
  }
  ctx.fillRect(0, 0, w, 40);
  // 两盏宫灯
  for (let i = 0; i < 2; i += 1) {
    const lx = w * (0.28 + i * 0.44);
    const ly = h * 0.18;
    const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, 100);
    g.addColorStop(0, 'rgba(255,170,70,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 100, ly - 100, 200, 200);
    ctx.fillStyle = '#b55226';
    ctx.beginPath();
    ctx.arc(lx, ly, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  // 屏风
  ctx.fillStyle = 'rgba(40,28,18,0.5)';
  ctx.fillRect(w * 0.24, h * 0.3, w * 0.52, h * 0.24);
  ctx.strokeStyle = 'rgba(200,160,90,0.18)';
  ctx.strokeRect(w * 0.24, h * 0.3, w * 0.52, h * 0.24);
}

function battle(ctx, w, h, seed) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#160d09');
  sky.addColorStop(0.4, '#3a1d10');
  sky.addColorStop(1, '#080504');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(20,14,9,0.7)';
  for (let i = 0; i < 6; i += 1) {
    const sx = seeded(seed, i) * w;
    ctx.beginPath();
    ctx.arc(sx, h * 0.38 + i * 10, 60 + i * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(80,60,40,0.32)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i += 1) {
    const px = seeded(seed, i + 20) * w;
    const py = h * 0.55 + seeded(seed, i + 30) * h * 0.3;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 10, py - 50);
    ctx.stroke();
  }
}

function drawBackdrop(ctx, kind, w, h, seed) {
  const s = seed || 7;
  if (kind === 'village') village(ctx, w, h, s);
  else if (kind === 'camp') camp(ctx, w, h, s);
  else if (kind === 'tourney') tourney(ctx, w, h, s);
  else if (kind === 'prison') prison(ctx, w, h);
  else if (kind === 'hall') hall(ctx, w, h);
  else if (kind === 'battle') battle(ctx, w, h, s);
  else city(ctx, w, h, s);
}

module.exports = { drawBackdrop };
