// 把 index.html 打包成單一檔案：內嵌 paiqi.js 與字型（data URI），拿掉外層 html/head/body 標籤
// 用法：node tools/build-artifact.js <輸出檔>
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outFile = process.argv[2];
if (!outFile) {
  console.error('用法：node tools/build-artifact.js <輸出檔>');
  process.exit(1);
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<!doctype html>\n/i, '')
  .replace(/<html[^>]*>\n/, '')
  .replace(/<\/html>\n?/, '')
  .replace(/<head>\n/, '')
  .replace(/<\/head>\n/, '')
  .replace(/<body>\n/, '')
  .replace(/<\/body>\n?/, '')
  .replace(/<meta charset="utf-8">\n/, '')
  .replace(/<meta name="viewport"[^>]*>\n/, '');

html = html.replace('<script src="paiqi.js"></script>', () =>
  '<script>\n' + fs.readFileSync(path.join(root, 'paiqi.js'), 'utf8') + '</script>');

html = html.replace(/url\("(fonts\/[^"]+\.woff)"\)/g, (m, file) =>
  'url(data:font/woff;base64,' + fs.readFileSync(path.join(root, file)).toString('base64') + ')');

if (/src="paiqi\.js"|url\("fonts\//.test(html)) throw new Error('還有沒內嵌的外部檔案');
fs.writeFileSync(outFile, html);
console.log(`${outFile}：${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
