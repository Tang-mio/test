// 產生頁面用的獅尾肉丸子集字型
// 收錄：頁面與各個程式檔裡出現的所有字、ASCII、Big5 常用字（5401 字，讓玩家名字也能用同一套字體）
// 用法：node tools/build-fonts.js <獅尾肉丸 TTF 所在資料夾>
//   字型下載：https://github.com/max32002/swei-meatball（CJK TC/SweiMeatballCJKtc-Regular.ttf、-Bold.ttf）
'use strict';
const fs = require('fs');
const path = require('path');
const { subset } = require('./subset-font.js');

const root = path.join(__dirname, '..');
const srcDir = process.argv[2];
if (!srcDir) {
  console.error('用法：node tools/build-fonts.js <SweiMeatballCJKtc TTF 所在資料夾>');
  process.exit(1);
}

function big5Common() {
  const dec = new TextDecoder('big5');
  let out = '';
  for (let hi = 0xA4; hi <= 0xC6; hi++) {
    const los = [];
    for (let lo = 0x40; lo <= 0x7E; lo++) los.push(lo);
    for (let lo = 0xA1; lo <= 0xFE; lo++) los.push(lo);
    for (const lo of los) {
      if (hi === 0xC6 && lo > 0x7E) break;
      const ch = dec.decode(Uint8Array.of(hi, lo));
      if (ch !== '�') out += ch;
    }
  }
  return out;
}

let ascii = '';
for (let c = 0x20; c < 0x7F; c++) ascii += String.fromCharCode(c);
const sources = ['index.html', 'paiqi.js', 'mahjong.js', 'mahjong-hand.js', 'mahjong-wall.js', 'blackjack.js']
  .concat(fs.readdirSync(path.join(root, 'app')).filter(f => f.endsWith('.js')).map(f => 'app/' + f));
const text = ascii + big5Common() + sources.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('');

for (const [weight, file] of [['regular', 'Regular'], ['bold', 'Bold']]) {
  const src = path.join(srcDir, `SweiMeatballCJKtc-${file}.ttf`);
  const r = subset(fs.readFileSync(src), text);
  const out = path.join(root, 'fonts', `swei-meatball-${weight}.woff`);
  fs.writeFileSync(out, r.woff);
  console.log(`${path.relative(root, out)}：${r.chars} 字，${(r.woff.length / 1024).toFixed(0)} KB`);
}
