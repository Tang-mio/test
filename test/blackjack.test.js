const test = require('node:test');
const assert = require('node:assert/strict');
const BJ = require('../blackjack.js');

const S = { bet: 100, blackjack: 1.5, fiveCard: 2 };

function round(players, banker = 0) {
  return { banker, players: players.map((p, i) => ({ idx: i, bet: 100, doubled: false, ...p })) };
}

test('閒家贏、輸、平手：莊家照下注賠或收', () => {
  const r = BJ.settle(round([{}, { result: 'win' }, { result: 'lose' }, { result: 'push' }]), S);
  assert.deepEqual(r.nets.slice(0, 4), [0, 100, -100, 0]);
  assert.equal(r.bankerNet, 0);
});

test('黑傑克 ×1.5、過五關 ×2、投降輸一半', () => {
  const r = BJ.settle(round([{}, { result: 'blackjack' }, { result: 'fiveCard' }, { result: 'surrender' }]), S);
  assert.deepEqual(r.nets.slice(0, 4), [-300, 150, 200, -50]);
});

test('加倍：贏輸都變兩倍，黑傑克與投降不受影響', () => {
  const r = BJ.settle(round([{ result: 'win', doubled: true }, {}, { result: 'lose', doubled: true }, { result: 'blackjack', doubled: true }], 1), S);
  assert.deepEqual(r.nets.slice(0, 4), [200, -150, -200, 150]);
  assert.equal(r.bankerNet, -150);
});

test('沒選結果的閒家不結算；莊家淨額等於閒家總和的相反數', () => {
  const r = BJ.settle(round([{}, { result: 'win', bet: 250 }, {}, { result: 'lose', bet: 80 }]), S);
  assert.deepEqual(r.pending, [2]);
  assert.equal(r.bankerNet, -(250 - 80));
});

test('設定：人數限制在 2 到 8 人', () => {
  assert.equal(BJ.normalizeSettings({ count: 20 }).count, 8);
  assert.equal(BJ.normalizeSettings({ count: 1 }).count, 2);
  assert.equal(BJ.normalizeSettings({ blackjack: 2 }).blackjack, 2);
});
