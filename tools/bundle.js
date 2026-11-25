/**
 * 极简 CommonJS 打包器：把工程打成一个浏览器可直接运行的 bundle
 * 用法：node tools/bundle.js   → 输出 web/game.bundle.js
 * 只用于浏览器预览，微信小游戏直接用原生 require，不需要 bundle。
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const entryFile = path.join(projectRoot, 'game.js');
const outDir = path.join(projectRoot, 'web');
const outFile = path.join(outDir, 'game.bundle.js');

const ids = new Map();
const modules = [];
let idCounter = 0;

function resolveModule(fromFile, request) {
  if (!request.startsWith('.')) {
    throw new Error('不支持的模块引用：' + request + '（来自 ' + fromFile + '）');
  }
  let target = path.resolve(path.dirname(fromFile), request);
  if (!fs.existsSync(target) && fs.existsSync(target + '.js')) {
    target += '.js';
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.js');
  }
  if (!fs.existsSync(target)) {
    throw new Error('模块不存在：' + target);
  }
  return target;
}

function addModule(file) {
  const abs = path.resolve(file);
  if (ids.has(abs)) return ids.get(abs);
  const id = idCounter++;
  ids.set(abs, id);

  let src = fs.readFileSync(abs, 'utf8');
  const depCount = { n: 0 };
  src = src.replace(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, function (whole, request) {
    depCount.n += 1;
    const depFile = resolveModule(abs, request);
    const depId = addModule(depFile);
    return '__require(' + depId + ')';
  });

  modules.push({ id, file: abs, src, deps: depCount.n });
  return id;
}

const entryId = addModule(entryFile);

let out = '';
out += '/* 征战汉末 —— 浏览器预览包，由 tools/bundle.js 生成，请勿手改 */\n';
out += '(function () {\n';
out += '  var __defs = {};\n';
out += '  var __cache = {};\n';
out += '  function __require(id) {\n';
out += '    if (__cache[id]) return __cache[id].exports;\n';
out += '    var module = { exports: {} };\n';
out += '    __cache[id] = module;\n';
out += '    __defs[id](module, module.exports, __require);\n';
out += '    return module.exports;\n';
out += '  }\n';
modules.forEach(function (m) {
  out += '\n  /* ' + path.relative(projectRoot, m.file).split(path.sep).join('/') + ' */\n';
  out += '  __defs[' + m.id + '] = function (module, exports, __require) {\n';
  out += m.src;
  out += '\n  };\n';
});
out += '\n  __require(' + entryId + ');\n';
out += '})();\n';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, out, 'utf8');

console.log('打包完成：' + outFile);
console.log('模块数：' + modules.length + '，体积：' + (fs.statSync(outFile).size / 1024).toFixed(1) + ' KB');
