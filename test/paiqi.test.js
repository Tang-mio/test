const test = require('node:test');
const assert = require('node:assert/strict');
const PaiQi = require('../paiqi.js');

function round(covered, opts = {}) {
  const names = ['東家', '南家', '西家', '北家'];
  return {
    firstIdx: opts.firstIdx || 0,
    players: covered.map((c, i) => ({
      name: names[i],
      covered: c,
      lastSeven: (opts.lastSeven || []).includes(i)
    }))
  };
}

function nets(result) {
  return result.players.map((p) => p.net);
}

test('點數：A=1、J=11、Q=12、K=13', () => {
  assert.equal(PaiQi.sumPoints(['A', '10', 'J', 'Q', 'K']), 1 + 10 + 11 + 12 + 13);
});

test('一般局：點數最少的贏，輸家付自己的點數', () => {
  const r = PaiQi.settle(round([['2'], ['K', 'Q'], ['5', '6'], ['A']]), { baoDian: { on: false } });
  assert.equal(r.winner, 3);
  assert.equal(r.winnerKind, 'normal');
  assert.deepEqual(nets(r), [-2, -25, -11, 38]);
});

test('付差額：輸家付與贏家的點數差', () => {
  const r = PaiQi.settle(round([['2'], ['K', 'Q'], ['5', '6'], ['A']]), { mode: 'diff' });
  assert.deepEqual(nets(r), [-1, -24, -10, 35]);
});

test('脫手 ×2、爆點（超過 40）再 ×2', () => {
  const r = PaiQi.settle(round([[], ['K', 'Q', '9'], ['A', '3', '5', '2'], ['K', 'K', 'J', '10', '8']]));
  assert.equal(r.winnerKind, 'tuoShou');
  assert.equal(r.winnerMult, 2);
  assert.deepEqual(nets(r), [310, -68, -22, -220]);
  const north = r.transfers.find((t) => t.from === 3);
  assert.deepEqual(north.factors.map((f) => f.label), ['脫手', '爆點']);
  assert.equal(r.players[3].baoDian, true);
});

test('爆點門檻是「超過」：剛好 40 點不爆', () => {
  const r = PaiQi.settle(round([['A'], ['K', 'K', 'K', 'A'], ['2'], ['3']]));
  assert.equal(r.players[1].points, 40);
  assert.equal(r.players[1].baoDian, false);
  const r2 = PaiQi.settle(round([['A'], ['K', 'K', 'K', '2'], ['2'], ['3']]));
  assert.equal(r2.players[1].points, 41);
  assert.equal(r2.players[1].baoDian, true);
});

test('尾張七取代脫手倍數（×4，不是 ×8）', () => {
  const r = PaiQi.settle(round([[], ['5'], ['6'], ['8']], { lastSeven: [0] }));
  assert.equal(r.winnerKind, 'weiQi');
  assert.equal(r.winnerMult, 4);
  assert.deepEqual(nets(r), [76, -20, -24, -32]);
});

test('兩人都脫手：尾張七的人贏', () => {
  const r = PaiQi.settle(round([[], [], ['6'], ['8']], { lastSeven: [1] }));
  assert.equal(r.winner, 1);
  assert.equal(r.decidedBy, 'kind');
});

test('十三蓋反敗為勝 ×5，付差額時十三蓋以 0 點計', () => {
  const thirteen = ['A', 'A', '2', '2', '3', '3', '4', '4', '5', '5', '6', '6', '8'];
  const covered = [thirteen, [], ['9'], ['10']];
  const full = PaiQi.settle(round(covered));
  assert.equal(full.winner, 0);
  assert.equal(full.winnerKind, 'shiSanGai');
  assert.deepEqual(nets(full), [95, 0, -45, -50]);

  const diff = PaiQi.settle(round(covered), { mode: 'diff' });
  assert.equal(diff.winnerPoints, 0);
  assert.deepEqual(nets(diff), [95, 0, -45, -50]);
});

test('關掉十三蓋：蓋 13 張就只是點數很多的輸家', () => {
  const thirteen = ['A', 'A', '2', '2', '3', '3', '4', '4', '5', '5', '6', '6', '8'];
  const r = PaiQi.settle(round([thirteen, ['9'], ['10'], ['J']]), { shiSanGai: { on: false } });
  assert.equal(r.winner, 1);
  assert.equal(r.players[0].baoDian, true); // 50 點 > 40
});

test('同點數比張數，再同就比出牌順序（從 ♠7 持有者起算）', () => {
  const byCount = PaiQi.settle(round([['5', '5'], ['10'], ['K'], ['Q']]));
  assert.equal(byCount.winner, 1);
  assert.equal(byCount.decidedBy, 'count');

  const tie = round([['K'], ['10'], ['10'], ['Q']], { firstIdx: 2 });
  const byOrder = PaiQi.settle(tie);
  assert.equal(byOrder.winner, 2);
  assert.equal(byOrder.decidedBy, 'order');
});

test('每點金額可以是小數，金額取到小數兩位', () => {
  const r = PaiQi.settle(round([['A'], ['3'], ['3'], ['3']]), { rate: 0.1 });
  assert.deepEqual(nets(r), [0.9, -0.3, -0.3, -0.3]);
});

test('驗證：7 不能蓋、每個點數最多 4 張、每人最多 13 張', () => {
  const errs = PaiQi.validateRound(round([['7'], ['K', 'K', 'K'], ['K', 'K'], []]));
  assert.equal(errs.length, 2);
  assert.ok(PaiQi.validateRound(round([new Array(14).fill('A'), [], [], []])).length > 0);
  assert.deepEqual(PaiQi.validateRound(round([['K'], ['Q'], [], []])), []);
});
