/**
 * 生成仓库根目录的手游网页入口
 * 目的：不管静态托管把「仓库根」还是「web 目录」当站点根，都能直接打开
 * node tools/build-entry.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

let html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
html = html
  // 入口脚本带 ?v= 版本号，必须用正则替换，否则根目录入口会继续指向
  // ./game.bundle.js 而仓库里 bundle 实际在 web/ 下，线上会 404。
  .replace(/<script src="\.\/game\.bundle\.js(\?v=[^"]*)?"><\/script>/,
    '<script src="./web/game.bundle.js$1"></script>')
  .replace('href="./apple-touch-icon.png"', 'href="./web/apple-touch-icon.png"');
fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'web', 'manifest.json'), 'utf8'));
manifest.start_url = './index.html';
manifest.scope = './';
manifest.icons = manifest.icons.map((i) => ({ ...i, src: './web/' + i.src.replace(/^\.\//, '') }));
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('已生成根目录 index.html / manifest.json');
