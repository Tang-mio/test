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
const names = list => list.map(w => H.tileName(w.tile));

// 慢慢拆的胡牌判斷（一對眼加其餘全是順子刻子），拿來對照
function slowWin(ts) {
  if (ts.length % 3 !== 2) return false;
  const c = Array(34).fill(0);
  ts.forEach(t => c[t]++);
  const sets = () => {
    let i = c.findIndex(n => n > 0);
    if (i === -1) return true;
    if (c[i] >= 3) { c[i] -= 3; const ok = sets(); c[i] += 3; if (ok) return true; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; const ok = sets(); c[i]++; c[i + 1]++; c[i + 2]++; if (ok) return true;
    }
    return false;
  };
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2; const ok = sets(); c[p] += 2;
    if (ok) return true;
  }
  return false;
}

test('十六張預設：聽兩面、中洞、邊張、單吊', () => {
  const r = H.check(tiles('123m 456m 789m 234p 99s 23s'));
  assert.equal(r.kind, 'waits');
  assert.deepEqual(names(r.waits), ['1條', '4條']);
  assert.equal(r.live, 8);
  assert.deepEqual(names(H.check(tiles('123m 456m 789m 234p 99s 13s')).waits), ['2條']);
  assert.deepEqual(names(H.check(tiles('123m 456m 789m 234p 99s 12s')).waits), ['3條']);
  assert.deepEqual(names(H.check(tiles('123m 456m 789m 234p 567p E')).waits), ['東']);
  assert.deepEqual(names(H.check(tiles('EE SS')).waits), ['東', '南']);
  assert.deepEqual(names(H.check(tiles('1112345678999m 123p')).waits), ['1萬', '2萬', '3萬', '4萬', '5萬', '6萬', '7萬', '8萬', '9萬']);
});

test('還剩幾張：手上已經有的要扣掉；四張都在手上就是空聽', () => {
  const some = H.check(tiles('123m 456m 789m 234p 99s 44s'));
  assert.deepEqual(some.waits.map(w => [H.tileName(w.tile), w.left]), [['4條', 2], ['9條', 2]]);
  const dead = H.check(tiles('2222m 345p'));
  assert.deepEqual(dead.waits, [{ tile: 1, left: 0 }]);
  assert.equal(dead.live, 0);
});

test('還沒聽牌：還差幾張（向聽數）和摸哪些牌會更接近', () => {
  // 13 張全是孤張（一般牌型）
  assert.equal(H.shanten(tiles('147m 147p 147s ESWN'), 16).s, 8);
  // 四組加 24 條，還有兩張孤張：差一張就聽，摸到 3 條（成組）或 9 條、東（成眼）都可以
  const r = H.check(tiles('123m 456m 789m 234p 9s 24s E'));
  assert.equal(r.kind, 'far');
  assert.equal(r.shanten, 1);
  assert.deepEqual(names(r.accepts), ['3條', '9條', '東']);
  // 兩張孤張都不成搭子時差兩張
  assert.equal(H.check(tiles('123m 456m 789m 234p 9s 25s E')).shanten, 2);
  assert.equal(r.live, r.accepts.reduce((s, a) => s + a.left, 0));
});

test('多一張：胡了就說胡了，沒胡就列出打哪張、打了聽什麼', () => {
  assert.deepEqual(H.check(tiles('123m 456m 789m 234p 99s 234s')), { kind: 'win', special: null });
  const r = H.check(tiles('123m 456m 789m 234p 99s 235s'));
  assert.equal(r.kind, 'discard');
  const best = r.options[0];
  assert.equal(H.tileName(best.tile), '5條');
  assert.equal(best.shanten, 0);
  assert.deepEqual(names(best.tiles), ['1條', '4條']);
  assert.equal(best.live, 8);
  // 打 2 條變中洞只聽 4 條，排在後面
  const two = r.options.find(o => H.tileName(o.tile) === '2條');
  assert.deepEqual(names(two.tiles), ['4條']);
  assert.ok(r.options.indexOf(two) > 0);
});

test('十三張：七對、十三么也算', () => {
  const pairs = tiles('11m 33m 55m 77p 99p 11s E');
  assert.deepEqual(names(H.check(pairs, 13).waits), ['東']);
  assert.equal(H.check(pairs, 13).special, '七對');
  // 十六張模式不算七對
  assert.notEqual(H.check(pairs, 16).kind, 'waits');
  assert.deepEqual(H.check(tiles('11m 33m 55m 77p 99p 11s EE'), 13), { kind: 'win', special: '七對' });
  // 十三么十三面聽
  const kokushi = H.check(tiles('19m 19p 19s ESWNCFP'), 13);
  assert.equal(kokushi.waits.length, 13);
  assert.equal(kokushi.special, '十三么');
  assert.deepEqual(H.check(tiles('19m 19p 19s ESWNCFP E'), 13), { kind: 'win', special: '十三么' });
  // 十三么差兩張
  assert.equal(H.shanten(tiles('19m 19p 19s ESWNC 2m 5p'), 13).s, 2);
  // 十三張的一般牌型：四組加一對
  assert.deepEqual(names(H.check(tiles('123m 456m 789m 99s 23s'), 13).waits), ['1條', '4條']);
  assert.equal(H.maxTiles(13), 14);
  assert.equal(H.maxTiles(16), 17);
});

test('張數不對、超過四張', () => {
  assert.equal(H.check([]).kind, 'empty');
  assert.deepEqual(H.check(tiles('123m 456m 789m 234p 99s 2s')), { kind: 'need', need: 1 });
  assert.deepEqual(H.check(tiles('11111m 23m')), { kind: 'over', tile: 0 });
});

test('隨機手牌：向聽數算出的胡牌、聽牌和慢慢拆的結果一樣', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 300; k++) {
    const wall = [];
    for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) wall.push(t);
    // 偏向少數幾種花色，比較容易出現聽牌
    const pool = wall.filter(t => t < 18 || rand() < 0.15);
    const size = [4, 7, 10, 13, 16][k % 5];
    const hand = [];
    while (hand.length < size) hand.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const fast = H.waits(hand, 16).map(w => w.tile);
    const slow = [];
    for (let t = 0; t < 34; t++) if (slowWin(hand.concat([t]))) slow.push(t);
    assert.deepEqual(fast, slow, 'hand ' + hand.join(','));
    assert.equal(H.shanten(hand, 16).s === 0, slow.length > 0);
  }
});
