/**
 * 本地预览服务（浏览器调试 / 手机同 WiFi 实机试玩）
 * 用法：node tools/serve.js
 *   电脑：http://localhost:8901/
 *   手机：http://<本机局域网IP>:8901/   （手机与电脑连同一个 WiFi）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
}).listen(port, '0.0.0.0', function () {
  console.log('电脑预览：http://localhost:' + port + '/');
  const lan = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (n) {
      if (n.family !== 'IPv4' || n.internal) return;
      lan.push('  http://' + n.address + ':' + port + '/   (' + name + ')');
    });
  });
  if (lan.length) {
    console.log('手机试玩（手机与电脑连同一 WiFi，用浏览器打开）：');
    console.log(lan.join('\n'));
  } else {
    console.log('未检测到局域网网卡地址');
  }
});
