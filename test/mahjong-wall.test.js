const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../mahjong-wall.js');

test('一副牌與牌牆：有花 144 張 18 墩，沒花 136 張 17 墩', () => {
  assert.equal(W.totalTiles(true), 144);
  assert.equal(W.stacksPerWall(true), 18);
  assert.equal(W.totalTiles(false), 136);
  assert.equal(W.stacksPerWall(false), 17);
});

test('開門：從莊家數起數到點數那一家，右邊數幾墩，下一墩開始抓', () => {
  // 3 點：莊家、下家、對家 → 對家
  assert.deepEqual(W.breakPoint(3, true), { sum: 3, per: 18, owner: 2, from: 'right', tail: 3, startOwner: 2, startStack: 4 });
  // 5、9、13、17 點都是莊家自己
  [5, 9, 13, 17].forEach(n => assert.equal(W.breakPoint(n, true).owner, 0));
  // 10 點是下家，12 點是上家
  assert.equal(W.breakPoint(10, true).owner, 1);
  assert.equal(W.breakPoint(12, true).owner, 3);
});

test('點數數完整面牆：接著從他上家的牌牆數', () => {
  // 有花 18 墩、擲 18 點（下家）：整面都是牌尾，從下家的上家（莊家）牌牆右邊第 1 墩開始
  assert.deepEqual(W.breakPoint(18, true), { sum: 18, per: 18, owner: 1, from: 'right', tail: 18, startOwner: 0, startStack: 1 });
  // 沒花 17 墩、擲 18 點：多數 1 墩，從第 2 墩開始
  assert.deepEqual(W.breakPoint(18, false), { sum: 18, per: 17, owner: 1, from: 'right', tail: 18, startOwner: 0, startStack: 2 });
  assert.equal(W.breakPoint(17, false).startStack, 1);
  assert.equal(W.breakPoint(16, false).startStack, 17);
});

test('逆抓：從那一家看的左邊數，數完整面接著數他下家的牌牆', () => {
  // 3 點一樣是對家，只是從左邊數
  assert.deepEqual(W.breakPoint(3, true, true), { sum: 3, per: 18, owner: 2, from: 'left', tail: 3, startOwner: 2, startStack: 4 });
  // 有花擲 18 點（下家）：整面是牌尾，從下家的下家（對家）牌牆左邊第 1 墩開始
  assert.deepEqual(W.breakPoint(18, true, true), { sum: 18, per: 18, owner: 1, from: 'left', tail: 18, startOwner: 2, startStack: 1 });
  assert.equal(W.breakPoint(18, false, true).startStack, 2);
});

test('擲骰子是 1 到 6', () => {
  assert.equal(W.rollDie(() => 0), 1);
  assert.equal(W.rollDie(() => 0.9999), 6);
});
