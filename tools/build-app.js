/**
 * 生成可公网部署的手机应用外壳（单文件 HTML）
 * bundle 走 jsDelivr（GitHub 仓库镜像），图标/清单内联为 data URI
 * node tools/build-app.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const outDir = path.join(root, '..');

const CDN = 'https://cdn.jsdelivr.net/gh/duwutao/wxgame_qimayukanshajy@main/web/game.bundle.js';

const icon192 = 'data:image/png;base64,' + fs.readFileSync(path.join(web, 'icon-192.png')).toString('base64');
const icon512 = 'data:image/png;base64,' + fs.readFileSync(path.join(web, 'icon-512.png')).toString('base64');
const touch = 'data:image/png;base64,' + fs.readFileSync(path.join(web, 'apple-touch-icon.png')).toString('base64');

const manifest = {
  name: '征战汉末',
  short_name: '征战汉末',
  start_url: '.',
  scope: '.',
  display: 'fullscreen',
  orientation: 'portrait',
  background_color: '#14100c',
  theme_color: '#14100c',
  icons: [
    { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
};
const manifestUri = 'data:application/manifest+json;base64,' + Buffer.from(JSON.stringify(manifest)).toString('base64');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#14100c" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="format-detection" content="telephone=no" />
  <link rel="manifest" href="${manifestUri}" />
  <link rel="apple-touch-icon" href="${touch}" />
  <title>征战汉末</title>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: #100d0a;
      -webkit-tap-highlight-color: transparent;
      touch-action: none; overscroll-behavior: none;
      -webkit-user-select: none; user-select: none;
    }
    #stage {
      position: fixed;
      top: env(safe-area-inset-top, 0px);
      bottom: env(safe-area-inset-bottom, 0px);
      left: 50%;
      transform: translateX(-50%);
      width: min(100vw, 75vh);
      width: min(100vw, 75dvh);
      background: #14100c;
      overflow: hidden;
      touch-action: none;
      box-shadow: 0 0 0 1px #241d15;
    }
    #boot {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      background: radial-gradient(circle at 50% 45%, #241a12 0%, #100d0a 70%);
      color: #c9bda2;
      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 15px; letter-spacing: 2px;
      text-align: center;
    }
    #boot b { color: #f0c060; font-size: 26px; letter-spacing: 6px; }
    #boot small { color: #8c7f68; font-size: 12px; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div id="stage">
    <div id="boot"><b>征战汉末</b><span id="bootTip">正在聚兵，请稍候…</span><small>首次进入需加载约 440KB 资源</small></div>
  </div>
  <script>
    (function () {
      try {
        var p = new URLSearchParams(location.search);
        var w = parseInt(p.get('w'), 10);
        var h = parseInt(p.get('h'), 10);
        if (!(w > 0 && h > 0)) return;
        var s = document.getElementById('stage');
        s.style.width = w + 'px';
        s.style.height = h + 'px';
        s.style.top = '0';
        s.style.left = '0';
        s.style.transformOrigin = 'top left';
        s.style.transform = 'scale(' + Math.min(1, window.innerWidth / w, window.innerHeight / h) + ')';
      } catch (e) {}
    })();
  </script>
  <script src="${CDN}"></script>
  <script>
    setTimeout(function () {
      if (!window.__BORDER_WARBAND__) {
        var t = document.getElementById('bootTip');
        if (t) t.textContent = '资源加载失败，请检查网络后刷新';
      }
    }, 6000);
  </script>
</body>
</html>
`;

const targets = [
  path.join(outDir, 'mobile-app.html'),
];
targets.forEach(function (p) {
  fs.writeFileSync(p, html, 'utf8');
  console.log('生成', p, (html.length / 1024).toFixed(1) + ' KB');
});
