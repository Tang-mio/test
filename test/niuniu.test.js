const test = require('node:test');
const assert = require('node:assert/strict');
const NN = require('../niuniu.js');

const ids = list => list.map(h => h.id);

test('看牌算妞：三張湊 10 的倍數，剩兩張看個位數', () => {
  const r = NN.evaluate(['10', 'J', 'K', '3', '5']);
  assert.equal(r.id, 'n8');
  assert.deepEqual(r.three, [0, 1, 2]);
  assert.deepEqual(r.rest, [3, 4]);
  assert.equal(r.high, 'K');
  assert.equal(NN.evaluate(['7', '3', 'Q', '6', '4']).id, 'nn'); // 7+3+Q 湊 20，6+4 = 10
  assert.equal(NN.evaluate(['A', '4', '5', '2', '3'], { special: { wuXiao: false } }).id, 'n5'); // 5+2+3 湊 10，A+4 = 5
});

test('看牌算妞：挑不出三張是沒妞；A 算 1、JQK 算 10', () => {
  assert.equal(NN.evaluate(['2', '3', '4', '6', '8']).id, 'none');
  assert.equal(NN.evaluate(['A', '2', '4', '7', '9']).id, 'n3'); // A+2+7 湊 10，4+9 = 13
  assert.equal(NN.cardValue('A'), 1);
  assert.equal(NN.cardValue('Q'), 10);
  assert.equal(NN.evaluate(['A', '2', '3']), null);
  assert.equal(NN.evaluate(['A', '2', '3', '4', 'X']), null);
});

test('特殊牌型：五小 > 炸彈 > 五花，可以關掉', () => {
  assert.equal(NN.evaluate(['A', 'A', '2', '2', '3']).id, 'wuXiao');
  assert.equal(NN.evaluate(['8', '8', '8', '8', '2']).id, 'zhaDan');
  assert.equal(NN.evaluate(['J', 'Q', 'K', 'K', 'J']).id, 'wuHua');
  // 關掉五花：五張都是 10 點，就是妞妞
  assert.equal(NN.evaluate(['J', 'Q', 'K', 'K', 'J'], { special: { wuHua: false } }).id, 'nn');
  // 關掉五小：照一般算
  assert.equal(NN.evaluate(['A', 'A', '2', '2', '3'], { special: { wuXiao: false } }).id, 'none');
  assert.deepEqual(ids(NN.handsFor({ special: { zhaDan: false } })).slice(-3), ['nn', 'wuHua', 'wuXiao']);
});

test('倍數：預設沒妞～妞6 ×1、妞7～妞9 ×2、妞妞 ×3、特殊 ×5', () => {
  assert.deepEqual(['none', 'n1', 'n6', 'n7', 'n9', 'nn', 'wuHua', 'zhaDan', 'wuXiao'].map(id => NN.multOf(id)), [1, 1, 1, 2, 2, 3, 5, 5, 5]);
  const s = NN.normalizeSettings({ mult: { n9: 3, low: -1 }, bet: '', tie: 'x' });
  assert.equal(s.mult.n9, 3);
  assert.equal(s.mult.low, 0);
  assert.equal(s.bet, 100);
  assert.equal(s.tie, 'card');
});

test('結算：牌型大的贏，照贏家牌型的倍數', () => {
  const r = NN.settle({
    banker: 0, bankerHand: 'n5',
    players: [
      { idx: 0, bet: 100, hand: 'nn' }, // 莊家自己不算
      { idx: 1, bet: 100, hand: 'n8' }, // 閒家贏 ×2
      { idx: 2, bet: 50, hand: 'n3' },  // 莊家贏，照莊家妞5 ×1
      { idx: 3, bet: 100, hand: 'nn' }  // 閒家妞妞 ×3
    ]
  });
  assert.deepEqual(r.lines.map(l => [l.idx, l.winner, l.x, l.amount]), [[1, 'player', 2, 200], [2, 'banker', -1, -50], [3, 'player', 3, 300]]);
  assert.deepEqual(r.nets.slice(0, 4), [-450, 200, -50, 300]);
  assert.equal(r.bankerNet, -450);
});

test('結算：莊家牌大收的是莊家牌型的倍數', () => {
  const r = NN.settle({ banker: 2, bankerHand: 'nn', players: [{ idx: 0, bet: 100, hand: 'n9' }, { idx: 1, bet: 100, hand: 'none' }] });
  assert.deepEqual(r.nets.slice(0, 3), [-300, -300, 600]);
});

test('同牌型：比最大的一張要選誰大；設定成莊家贏就直接算', () => {
  const players = [{ idx: 1, bet: 100, hand: 'n7' }, { idx: 2, bet: 100, hand: 'n7', tie: 'player' }, { idx: 3, bet: 100, hand: 'n7', tie: 'banker' }];
  const r = NN.settle({ banker: 0, bankerHand: 'n7', players });
  assert.deepEqual(r.ties, [1]);
  assert.deepEqual(r.lines.map(l => [l.idx, l.amount, l.sameHand]), [[2, 200, true], [3, -200, true]]);
  const b = NN.settle({ banker: 0, bankerHand: 'n7', players }, { tie: 'banker' });
  assert.deepEqual(b.ties, []);
  assert.deepEqual(b.lines.map(l => l.amount), [-200, -200, -200]);
});

test('結算：還沒選牌型的不算；關掉的特殊牌型當作沒選', () => {
  const r = NN.settle({ banker: 0, bankerHand: null, players: [{ idx: 1, bet: 100, hand: 'n3' }] });
  assert.deepEqual(r.pending, [1]);
  const s = NN.settle({ banker: 0, bankerHand: 'n3', players: [{ idx: 1, bet: 100, hand: 'zhaDan' }, { idx: 2, bet: 100 }] }, { special: { zhaDan: false } });
  assert.deepEqual(s.pending, [1, 2]);
  assert.equal(s.lines.length, 0);
});
