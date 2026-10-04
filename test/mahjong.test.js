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
  const r = MJ.countTai({ menQing: 1, zhong: 1, bai: 1 }, 'ziMo');
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
  p = MJ.togglePick({ zhong: 1, fa: 1 }, 'daSanYuan');
  assert.deepEqual(p, { daSanYuan: 1 });
  p = MJ.togglePick({ daSanYuan: 1 }, 'fa');
  assert.deepEqual(p, { fa: 1 });
  p = MJ.togglePick({ fengE: 1, fengN: 1 }, 'daSiXi');
  assert.deepEqual(p, { daSiXi: 1 });
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
  assert.equal(MJ.countTai({ hua: 2, baXian: 1, zhong: 1 }, 'fangQiang', 0, s).tai, 1);
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

test('南部打法：不打花、邊張中洞單吊不算、見風就算、碰碰胡 2 台、滿台 4 台', () => {
  const s = MJ.applyPreset({ base: 30, perTai: 10 }, 'south');
  assert.equal(s.base, 30);
  assert.equal(MJ.matchPreset(s), 'south');
  const ids = MJ.patternsFor(s).map(p => p.id);
  ['hua', 'huaGang', 'duTing', 'quanFeng', 'menFeng'].forEach(id => assert.equal(ids.includes(id), false));
  assert.equal(ids.includes('jianFeng'), true);
  // 見字：東、北都算，不管圈風門風
  assert.equal(MJ.countTai({ pengPeng: 1, fengE: 1, fengN: 1, zhong: 1 }, 'fangQiang', 0, s, { roundWind: 1, seatWind: 2 }).tai, 2 + 2 + 1);
  // 6 台照滿台 4 台算：30 + 4 × 10
  const r = MJ.settle({ dealer: 3, streak: 0, winner: 1, method: 'fangQiang', discarder: 2, tai: 6 }, s);
  assert.equal(r.transfers[0].amount, 70);
});

test('南部打法：莊家沒連莊不算台，連 N 拉 N 是 2N+1 台', () => {
  const s = MJ.applyPreset({}, 'south');
  assert.equal(MJ.dealerTai(0, s), 0);
  assert.equal(MJ.dealerTai(1, s), 3);
  assert.equal(MJ.dealerTai(2, s), 5);
  // 只算 2N 的打法：莊家 0 台、每連 2 台
  assert.equal(MJ.dealerTai(2, { dealerTai: 0, streakTai: 2 }), 4);
});

test('打法切換：預設是北部打法，改過任何一項就不算任何一種打法', () => {
  assert.equal(MJ.matchPreset({}), 'north');
  const s = MJ.applyPreset({}, 'south');
  assert.equal(MJ.matchPreset({ ...s, cap: 5 }), null);
  assert.equal(MJ.matchPreset(MJ.applyPreset(s, 'north')), 'north');
});

test('預設不用的台型（見字）要打開才出現', () => {
  assert.equal(MJ.patternsFor({}).some(p => p.id === 'jianFeng'), false);
  assert.equal(MJ.patternsFor({ on: { jianFeng: true } }).some(p => p.id === 'jianFeng'), true);
});

test('輸入時三元牌拆成中發白、風牌拆成東南西北', () => {
  const ids = MJ.handPatterns({}).map(p => p.id);
  ['zhong', 'fa', 'bai', 'fengE', 'fengS', 'fengW', 'fengN'].forEach(id => assert.equal(ids.includes(id), true));
  ['sanYuan', 'quanFeng', 'menFeng', 'jianFeng'].forEach(id => assert.equal(ids.includes(id), false));
  assert.deepEqual(MJ.countTai({ zhong: 1, fa: 1, bai: 1 }, 'fangQiang').tai, 3);
  // 關掉三元牌就沒有中發白；三種風都關掉就沒有東南西北
  const off = MJ.handPatterns({ off: { sanYuan: true, quanFeng: true, menFeng: true } }).map(p => p.id);
  ['zhong', 'fengE'].forEach(id => assert.equal(off.includes(id), false));
});

test('風牌刻子：是圈風加圈風台、是門風加門風台，都不是不算', () => {
  const ctx = { roundWind: 0, seatWind: 0 }; // 東風圈、胡的人門風東
  const r = MJ.countTai({ fengE: 1, fengS: 1 }, 'fangQiang', 0, {}, ctx);
  assert.equal(r.tai, 2);
  assert.deepEqual(r.items, [{ id: 'fengE', name: '東（圈風、門風）', tai: 2 }]);
  assert.equal(MJ.countTai({ fengS: 1 }, 'fangQiang', 0, {}, { roundWind: 0, seatWind: 1 }).tai, 1);
  assert.equal(MJ.countTai({ fengW: 1 }, 'fangQiang', 0, { tai: { quanFeng: 2 } }, { roundWind: 2, seatWind: 1 }).tai, 2);
  // 沒有圈風門風資料時只看見字
  assert.equal(MJ.countTai({ fengE: 1 }, 'fangQiang', 0, {}).tai, 0);
  assert.equal(MJ.normalizeSettings({ menFengBySeat: 1 }).menFengBySeat, true);
});

test('一將四圈：莊家輪一輪回到起莊換下一圈，北風圈打完進下一將', () => {
  let p = { jiang: 1, wind: 0, startDealer: 0, dealer: 0, streak: 0, hands: 0 };
  const names = [];
  for (let i = 0; i < 16; i++) {
    names.push(MJ.roundName(p.wind, p.dealer, p.startDealer));
    p = MJ.advance(p, (p.dealer + 1) % 4); // 每把都是下家胡，莊家下莊
  }
  assert.deepEqual(names.slice(0, 5), ['東風東', '東風南', '東風西', '東風北', '南風東']);
  assert.equal(names[15], '北風北');
  assert.deepEqual(p, { jiang: 2, wind: 0, startDealer: 0, dealer: 0, streak: 0, hands: 0, newWind: true, newJiang: true });
});

test('連莊和流局不換圈，只多算一把', () => {
  let p = { jiang: 1, wind: 3, startDealer: 0, dealer: 3, streak: 0, hands: 12 };
  p = MJ.advance(p, 3); // 莊家胡，連莊
  assert.deepEqual([p.wind, p.dealer, p.streak, p.hands, p.newWind], [3, 3, 1, 13, false]);
  p = MJ.advance(p, -1); // 流局，連莊
  assert.deepEqual([p.wind, p.dealer, p.streak, p.hands, p.newJiang], [3, 3, 2, 14, false]);
  p = MJ.advance(p, 1); // 閒家胡，北風北打完
  assert.deepEqual([p.jiang, p.wind, p.dealer, p.streak, p.hands, p.newJiang], [2, 0, 0, 0, 0, true]);
});

test('起莊不是東家時，圈照起莊算', () => {
  let p = { jiang: 1, wind: 0, startDealer: 2, dealer: 2, streak: 0, hands: 0 };
  assert.equal(MJ.roundName(p.wind, p.dealer, p.startDealer), '東風東');
  for (let i = 0; i < 3; i++) p = MJ.advance(p, p.dealer === 3 ? 0 : 3);
  assert.deepEqual([p.wind, p.dealer, MJ.roundName(p.wind, p.dealer, p.startDealer)], [0, 1, '東風北']);
  p = MJ.advance(p, 0);
  assert.deepEqual([p.wind, p.dealer, p.newWind, MJ.roundName(p.wind, p.dealer, p.startDealer)], [1, 2, true, '南風東']);
});
