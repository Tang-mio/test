const test = require('node:test');
const assert = require('node:assert/strict');
const MJ = require('../mahjong.js');

const S = { base: 50, perTai: 20 };

test('放槍：只有放槍的人付「底 + 台數 × 每台」', () => {
  const r = MJ.settle({ dealer: 0, streak: 0, winner: 1, method: 'fangQiang', discarder: 2, tai: 3 }, S);
  assert.equal(r.transfers.length, 1);
  assert.deepEqual(r.transfers[0], { from: 2, to: 1, tai: 3, dealerTai: 0, totalTai: 3, capped: false, base: 50, perTai: 20, amount: 110 });
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

test('自己改台數：改過的台型照新台數算，關掉的台型不算', () => {
  const s = { tai: { qingYiSe: 10, menQing: 2 }, off: { pingHu: true } };
  assert.equal(MJ.countTai({ qingYiSe: 1 }, 'fangQiang', 0, s).tai, 10);
  assert.equal(MJ.countTai({ pingHu: 1 }, 'fangQiang', 0, s).tai, 0);
  assert.equal(MJ.patternsFor(s).some(p => p.id === 'pingHu'), false);
  // 門清自摸合計照設定，不受門清單獨的台數影響
  assert.equal(MJ.countTai({ menQing: 1 }, 'ziMo', 0, s).tai, 3);
  assert.equal(MJ.countTai({ menQing: 1 }, 'fangQiang', 0, s).tai, 2);
});

test('自訂台型：可以點選、算進台數；名字空白或 id 不合法的會被丟掉', () => {
  const s = MJ.normalizeSettings({ custom: [{ id: 'c1', name: '見字', tai: 1 }, { id: 'c2', name: '  ', tai: 3 }, { id: 'x', name: '壞的', tai: 2 }] });
  assert.deepEqual(s.custom, [{ id: 'c1', name: '見字', tai: 1 }]);
  const picks = MJ.togglePick({}, 'c1', 'ziMo', s);
  assert.deepEqual(picks, { c1: 1 });
  assert.equal(MJ.countTai(picks, 'ziMo', 0, s).tai, 2);
});

test('自摸、門清自摸、莊家台、每連幾台都照設定', () => {
  const s = { ziMoTai: 2, menQingZiMoTai: 4, dealerTai: 2, streakTai: 1 };
  assert.equal(MJ.countTai({}, 'ziMo', 0, s).tai, 2);
  assert.equal(MJ.countTai({ menQing: 1 }, 'ziMo', 0, s).tai, 4);
  assert.equal(MJ.dealerTai(3, s), 5);
  const r = MJ.settle({ dealer: 0, streak: 3, winner: 0, method: 'ziMo', tai: 0 }, { ...s, base: 0, perTai: 10 });
  r.transfers.forEach(t => assert.equal(t.amount, 50));
});

test('限台：超過上限的台數不算；莊家台可選擇算在限台內或另外加', () => {
  const hand = { dealer: 0, streak: 2, winner: 1, method: 'ziMo', tai: 13 };
  const out = MJ.settle(hand, { cap: 10 });
  const east = out.transfers.find(t => t.from === 0);
  const west = out.transfers.find(t => t.from === 2);
  assert.equal(west.totalTai, 10);
  assert.equal(west.capped, true);
  assert.equal(east.totalTai, 10 + 5);
  assert.equal(out.capped, true);

  const inside = MJ.settle(hand, { cap: 10, capIncludesDealer: true });
  assert.equal(inside.transfers.find(t => t.from === 0).totalTai, 10);

  const none = MJ.settle({ ...hand, tai: 3 }, { cap: 10 });
  assert.equal(none.capped, false);
  assert.equal(none.transfers.find(t => t.from === 2).totalTai, 3);
});

test('不玩花牌：花牌台型不出現、也不算台；其他台型照常', () => {
  const s = { flowers: false };
  const ids = MJ.patternsFor(s).map(p => p.id);
  ['hua', 'huaGang', 'baXian', 'qiQiangYi'].forEach(id => assert.equal(ids.includes(id), false));
  assert.equal(ids.includes('sanYuan'), true);
  assert.equal(MJ.countTai({ hua: 2, baXian: 1, sanYuan: 1 }, 'fangQiang', 0, s).tai, 1);
  assert.deepEqual(MJ.togglePick({}, 'huaGang', 'ziMo', s), {});
  assert.equal(MJ.normalizeSettings({}).flowers, true);
  assert.equal(MJ.countTai({ hua: 2 }, 'fangQiang', 0, {}).tai, 2);
});

test('設定：台數和限台限制在合理範圍', () => {
  const s = MJ.normalizeSettings({ cap: -3, dealerTai: 200, tai: { qingYiSe: 8, unknown: 3 } });
  assert.equal(s.cap, 0);
  assert.equal(s.dealerTai, 99);
  assert.deepEqual(s.tai, {});
});
