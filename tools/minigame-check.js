/**
 * 小游戏工程体检：导入抖音 / 微信开发者工具之前先自查
 * node tools/minigame-check.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let pass = 0;
const warns = [];
const fails = [];

function ok(name) {
  pass++;
}
function warn(msg) {
  warns.push(msg);
}
function fail(msg) {
  fails.push(msg);
}

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else out.push(p);
  });
  return out;
}

/* 1. 包体积：小游戏首包上限 4MB（微信/抖音同档） */
const codeFiles = walk(path.join(root, 'js'), []);
const rootFiles = ['game.js', 'game.json', 'project.config.json', 'project.tt.json']
  .map((f) => path.join(root, f))
  .filter((f) => fs.existsSync(f));
const all = codeFiles.concat(rootFiles);
const bytes = all.reduce((s, f) => s + fs.statSync(f).size, 0);
const kb = bytes / 1024;
if (kb < 4096) ok('包体积');
else fail('包体积 ' + kb.toFixed(1) + 'KB 超过 4MB 首包上限');
console.log('包体积：' + kb.toFixed(1) + ' KB（' + all.length + ' 个文件，无图片/音频资源，画面全部运行时绘制）');

/* 2. 浏览器 API 依赖：只允许出现在 platform.js / audio.js，且必须有 wx/tt 分支 */
const BROWSER_API = /\b(document|window|localStorage|addEventListener|requestAnimationFrame|XMLHttpRequest|fetch|new Image)\b/;
const ALLOWED = ['platform.js', 'audio.js'];
codeFiles.forEach((f) => {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  if (ALLOWED.some((a) => rel.endsWith(a))) return;
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!BROWSER_API.test(line)) return;
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    // 带 typeof 守卫的探测在宿主缺失时不会执行，算安全
    if (/typeof\s+(window|document|localStorage)\s*!==?\s*['"]undefined['"]/.test(line)) return;
    fail(rel + ':' + (i + 1) + ' 直接用了浏览器 API → ' + line.trim().slice(0, 70));
  });
});
ok('浏览器 API 扫描');

/* 3. 配置字段 */
function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (e) {
    fail(rel + ' 不是合法 JSON：' + e.message);
    return null;
  }
}

const gameJson = readJson('game.json');
if (gameJson) {
  if (gameJson.deviceOrientation === 'portrait') ok('竖屏配置');
  else fail('game.json deviceOrientation 应为 portrait');
  if (gameJson.showStatusBar === false) ok('隐藏状态栏');
}

const wxConf = readJson('project.config.json');
if (wxConf) {
  if (wxConf.compileType === 'game') ok('微信 compileType');
  else fail('project.config.json compileType 应为 game');
  if (!/^wx/.test(String(wxConf.appid || ''))) {
    warn('微信 AppID 还不是真实值（当前 ' + wxConf.appid + '）：开发者工具能用游客模式跑模拟器，真机预览/上传要换成 wx 开头的正式 AppID');
  }
  const ignores = ((wxConf.packOptions || {}).ignore || []).map((i) => i.value);
  ['tools', 'web', '.git'].forEach((d) => {
    if (ignores.indexOf(d) >= 0) ok('打包排除 ' + d);
    else warn('project.config.json 没排除 ' + d + '，上传时会被打进包里');
  });
}

const ttConf = readJson('project.tt.json');
if (ttConf) {
  if (ttConf.compileType === 'game') ok('抖音 compileType');
  else fail('project.tt.json compileType 应为 game');
  if (!/^tt/.test(String(ttConf.appid || ''))) {
    warn('抖音 AppID 仍是占位文案（' + String(ttConf.appid).slice(0, 12) + '…）：需要填抖音开放平台申请的小游戏 AppID 才能真机预览');
  }
}

/* 4. require 路径是否都存在 */
const REQUIRE = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
let reqChecked = 0;
codeFiles.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = REQUIRE.exec(src)) !== null) {
    const target = path.resolve(path.dirname(f), m[1]);
    reqChecked++;
    if (!fs.existsSync(target) && !fs.existsSync(target + '.js')) {
      fail(path.relative(root, f) + ' 引用了不存在的 ' + m[1]);
    }
  }
});
if (reqChecked > 0) ok('require 路径 ' + reqChecked + ' 处');

/* 5. 老基础库不认的语法（开发者工具 es6 关闭时会炸） */
const RISKY = [['?.', '可选链'], ['??', '空值合并'], ['#priv', '私有字段']];
codeFiles.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  RISKY.forEach(([token, label]) => {
    if (src.indexOf(token) >= 0) {
      warn(path.relative(root, f) + ' 里出现 ' + label + '（' + token + '），确认开发者工具 es6 转译已开启');
    }
  });
});

/* 6. 入口 */
if (fs.existsSync(path.join(root, 'game.js')) && fs.readFileSync(path.join(root, 'game.js'), 'utf8').indexOf('boot()') >= 0) {
  ok('入口 game.js 调用 boot');
} else {
  fail('game.js 没有调用 boot()');
}

console.log('\n============================================');
console.log('通过 ' + pass + ' 项，警告 ' + warns.length + ' 项，失败 ' + fails.length + ' 项');
if (warns.length) console.log('\n警告：\n- ' + warns.join('\n- '));
if (fails.length) console.log('\n失败：\n- ' + fails.join('\n- '));
console.log('============================================');
process.exit(fails.length ? 1 : 0);
