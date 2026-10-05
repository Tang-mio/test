const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../mahjong-hand.js');

// 用字寫牌：'123m 456p 789s EEE CC' → 牌的編號
const HONOR = { E: 27, S: 28, W: 29, N: 30, C: 31, F: 32, P: 33 };
function tiles(str) {
  const out = [];
  str.split(/\s+/).filter(Boolean).forEach(g => {
    const m = g.match(/^(\d+)([mps])$/);
    if (m) { const base = { m: 0, p: 9, s: 18 }[m[2]]; [...m[1]].forEach(d => out.push(base + Number(d) - 1)); }
    else [...g].forEach(c => out.push(HONOR[c]));
  });
  return out;
}
const names = r => r.waits.map(w => H.tileName(w.tile));

test('聽兩面：23 條聽 1、4 條', () => {
  const r = H.check(tiles('123m 456m 789m 234p 99s 23s'));
  assert.equal(r.kind, 'waits');
  assert.deepEqual(names(r), ['1條', '4條']);
  assert.deepEqual(r.waits.map(w => w.left), [4, 4]);
});

test('中洞、邊張、單吊都只聽一張', () => {
  assert.deepEqual(names(H.check(tiles('123m 456m 789m 234p 99s 13s'))), ['2條']);
  assert.deepEqual(names(H.check(tiles('123m 456m 789m 234p 99s 12s'))), ['3條']);
  assert.deepEqual(names(H.check(tiles('5m'))), ['5萬']);
  assert.deepEqual(names(H.check(tiles('123m 456m 789m 234p 567p E'))), ['東']);
});

test('對碰、一張多種聽法', () => {
  assert.deepEqual(names(H.check(tiles('EE SS'))), ['東', '南']);
  assert.deepEqual(names(H.check(tiles('123m 456m 789m 234p 1112s'))), ['2條', '3條']);
  // 九蓮寶燈的形狀：一到九萬都聽
  assert.deepEqual(names(H.check(tiles('1112345678999m 123p'))), ['1萬', '2萬', '3萬', '4萬', '5萬', '6萬', '7萬', '8萬', '9萬']);
});

test('還剩幾張：手上已經有的要扣掉；四張都在手上就是空聽', () => {
  const some = H.check(tiles('123m 456m 789m 234p 99s 44s'));
  assert.deepEqual(some.waits.map(w => [H.tileName(w.tile), w.left]), [['4條', 2], ['9條', 2]]);
  assert.equal(some.live, 4);
  const dead = H.check(tiles('2222m 345p'));
  assert.deepEqual(dead.waits, [{ tile: 1, left: 0 }]);
  assert.equal(dead.live, 0);
});

test('還沒聽牌、張數不對、多一張、超過四張', () => {
  assert.equal(H.check([]).kind, 'empty');
  assert.equal(H.check(tiles('19m 19p 19s ESWN')).kind, 'none');
  assert.deepEqual(H.check(tiles('123m 456m 789m 234p 99s 2s')), { kind: 'need', need: 1 });
  assert.equal(H.check(tiles('123m 456m 789m 234p 99s 234s')).kind, 'win');
  assert.equal(H.check(tiles('123m 456m 789m 234p 99s 235s')).kind, 'extra');
  assert.deepEqual(H.check(tiles('11111m 23m')), { kind: 'over', tile: 0 });
});

test('胡了沒：一對眼加其餘全是順子刻子', () => {
  assert.equal(H.isWin(tiles('111m 222m 333m 456p 789p 55s')), true);
  assert.equal(H.isWin(tiles('EEE SSS WWW CCC FFF PP')), true);
  assert.equal(H.isWin(tiles('123m 456m 789m 234p 99s 23s')), false);
  assert.equal(H.tileName(31), '中');
});
