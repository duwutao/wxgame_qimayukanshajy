/**
 * 本地预览服务（仅用于浏览器调试）
 * 用法：node tools/serve.js   → 打开 http://localhost:8901/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'web');
const port = Number(process.env.PORT || 8901);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

http.createServer(function (req, res) {
  let pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const file = path.join(root, pathname);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 ' + pathname);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(port, function () {
  console.log('预览地址：http://localhost:' + port + '/');
});
