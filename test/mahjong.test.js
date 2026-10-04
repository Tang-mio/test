const test = require('node:test');
const assert = require('node:assert/strict');
const MJ = require('../mahjong.js');

const S = { base: 50, perTai: 20 };

test('放槍：只有放槍的人付「底 + 台數 × 每台」', () => {
  const r = MJ.settle({ dealer: 0, streak: 0, winner: 1, method: 'fangQiang', discarder: 2, tai: 3 }, S);
  assert.equal(r.transfers.length, 1);
  assert.deepEqual(r.transfers[0], { from: 2, to: 1, tai: 3, dealerTai: 0, totalTai: 3, base: 50, perTai: 20, amount: 110 });
  assert.deepEqual(r.nets, [0, 110, -110, 0]);
});

test('閒家自摸：三家都付，莊家多付莊家台', () => {
  const r = MJ.settle({ dealer: 0, streak: 0, winner: 2, method: 'ziMo', tai: 2 }, S);
  const byFrom = Object.fromEntries(r.transfers.map(t => [t.from, t.amount]));
  assert.deepEqual(byFrom, { 0: 50 + 3 * 20, 1: 90, 3: 90 });
  assert.deepEqual(r.nets, [-110, -90, 290, -90]);
});

test('莊家連 2 自摸：每家都多 1 + 2×2 = 5 台', () => {
  const r = MJ.settle({ dealer: 3, streak: 2, winner: 3, method: 'ziMo', tai: 1 }, S);
  assert.equal(r.dealerTai, 5);
  r.transfers.forEach(t => assert.equal(t.amount, 50 + 6 * 20));
  assert.deepEqual(r.nets, [-170, -170, -170, 510]);
});

test('莊家放槍給閒家，也要加莊家台', () => {
  const r = MJ.settle({ dealer: 1, streak: 1, winner: 0, method: 'fangQiang', discarder: 1, tai: 0 }, S);
  assert.equal(r.transfers[0].dealerTai, 3);
  assert.equal(r.transfers[0].amount, 50 + 3 * 20);
});

test('資料不完整時不結算', () => {
  assert.equal(MJ.settle({ dealer: 0, streak: 0, winner: null, method: 'ziMo', tai: 1 }, S).ready, false);
  assert.equal(MJ.settle({ dealer: 0, streak: 0, winner: 1, method: 'fangQiang', discarder: 1, tai: 1 }, S).reason, 'discarder');
});

test('台數：自摸 1 台，門清自摸合計 3 台', () => {
  assert.equal(MJ.countTai({}, 'ziMo').tai, 1);
  const r = MJ.countTai({ menQing: 1, sanYuan: 2 }, 'ziMo');
  assert.equal(r.tai, 3 + 2);
  assert.equal(r.items[0].name, '門清自摸');
  assert.equal(MJ.countTai({ menQing: 1 }, 'fangQiang').tai, 1);
});

test('台數：只限自摸或放槍的台型會依胡法過濾，另可手動加減', () => {
  assert.equal(MJ.countTai({ haiDi: 1, heDi: 1 }, 'fangQiang').tai, 1);
  assert.equal(MJ.countTai({ qingYiSe: 1 }, 'fangQiang', 2).tai, 10);
  assert.equal(MJ.countTai({}, 'fangQiang', -5).tai, 0);
});

test('切換台型：同組互斥、大牌清掉被包含的小台型、可多次的會循環', () => {
  let p = MJ.togglePick({}, 'sanAn');
  p = MJ.togglePick(p, 'siAn');
  assert.deepEqual(p, { siAn: 1 });
  p = MJ.togglePick({ sanYuan: 2 }, 'daSanYuan');
  assert.deepEqual(p, { daSanYuan: 1 });
  p = MJ.togglePick({ daSanYuan: 1 }, 'sanYuan');
  assert.deepEqual(p, { sanYuan: 1 });
  p = MJ.togglePick({ hua: 2 }, 'hua');
  assert.deepEqual(p, {});
  assert.deepEqual(MJ.togglePick({}, 'haiDi', 'fangQiang'), {});
});

test('換莊：莊家胡或流局連莊，閒家胡就下一家當莊', () => {
  assert.deepEqual(MJ.nextDealer(0, 0, 0), { dealer: 0, streak: 1 });
  assert.deepEqual(MJ.nextDealer(0, 1, -1), { dealer: 0, streak: 2 });
  assert.deepEqual(MJ.nextDealer(3, 2, 1), { dealer: 0, streak: 0 });
});
