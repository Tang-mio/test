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
const one = s => tiles(s)[0];
const base = { method: 'fangQiang', roundWind: 0, seatWind: 1, flowers: [] };
const ids = r => Object.keys(r.picks).sort();

test('還不夠 16 張、還沒點胡牌、胡不了，都會說原因', () => {
  assert.deepEqual(H.analyze({ ...base, concealed: tiles('123m') }), { ok: false, reason: 'short', need: 13 });
  assert.equal(H.analyze({ ...base, concealed: tiles('123m 456m 789m 123p 99s 23s') }).reason, 'win');
  const bad = H.analyze({ ...base, concealed: tiles('123m 456m 789m 123p 99s 23s'), win: one('6s') });
  assert.equal(bad.reason, 'notWin');
});

test('平胡：全是順子、沒字沒花、聽兩面、胡別人打的', () => {
  // 23s 聽 1s、4s，胡 4s
  const hand = { ...base, concealed: tiles('123m 456m 789m 234p 99s 23s'), win: one('4s') };
  const r = H.analyze(hand);
  assert.equal(r.ok, true);
  assert.equal(r.shape, 'sides');
  assert.deepEqual(ids(r), ['menQing', 'pingHu']);
  assert.equal(r.tai, 1 + 2);
  // 自摸就不算平胡：門清自摸 3 台
  const z = H.analyze({ ...hand, method: 'ziMo' });
  assert.deepEqual(ids(z), ['menQing']);
  assert.equal(z.tai, 3);
});

test('獨聽：中洞、邊張、單吊只聽一張', () => {
  const mid = H.analyze({ ...base, concealed: tiles('123m 456m 789m 234p 99s 13s'), win: one('2s') });
  assert.equal(mid.shape, 'middle');
  assert.deepEqual(ids(mid), ['duTing', 'menQing']);
  const edge = H.analyze({ ...base, concealed: tiles('123m 456m 789m 234p 99s 12s'), win: one('3s') });
  assert.equal(edge.shape, 'edge');
  assert.equal(edge.picks.duTing, 1);
  // 1112s 聽 2s、3s：不是獨聽
  const two = H.analyze({ ...base, concealed: tiles('123m 456m 789m 234p 1112s'), win: one('2s') });
  assert.deepEqual(H.waitsOf({ concealed: tiles('123m 456m 789m 234p 1112s'), melds: [] }).map(H.tileName), ['2條', '3條']);
  assert.equal(two.picks.duTing, undefined);
});

test('碰碰胡、暗刻：自摸的刻子算暗刻，放槍胡成的刻子不算', () => {
  const concealed = tiles('111m 999p EE 77s');
  const melds = [{ type: 'pon', tile: one('3m') }, { type: 'pon', tile: one('8p') }];
  const zi = H.analyze({ ...base, method: 'ziMo', concealed, melds, win: one('7s') });
  assert.equal(zi.picks.pengPeng, 1);
  assert.equal(zi.picks.sanAn, 1); // 111m 999p 777s 三個暗刻
  const fang = H.analyze({ ...base, concealed, melds, win: one('7s') });
  assert.equal(fang.picks.pengPeng, 1);
  assert.equal(fang.picks.sanAn, undefined); // 777s 是胡別人的，只剩兩個暗刻
});

test('暗槓算暗刻、不影響門清；明槓、碰就不是門清', () => {
  const r = H.analyze({ ...base, concealed: tiles('123m 456m 789m 55p 67p'), melds: [{ type: 'ankong', tile: one('9s') }], win: one('8p') });
  assert.equal(r.picks.menQing, 1);
  const k = H.analyze({ ...base, concealed: tiles('123m 456m 789m 55p 67p'), melds: [{ type: 'kong', tile: one('9s') }], win: one('8p') });
  assert.equal(k.picks.menQing, undefined);
});

test('一色：清一色、混一色、字一色', () => {
  const q = H.analyze({ ...base, concealed: tiles('123m 456m 789m 111m 345m 2m'), win: one('2m') });
  assert.equal(q.picks.qingYiSe, 1);
  const h = H.analyze({ ...base, concealed: tiles('123m 456m 789m EEE 345m 2m'), win: one('2m') });
  assert.equal(h.picks.hunYiSe, 1);
  const z = H.analyze({ ...base, concealed: tiles('EEE SSS WWW CCC FF P'), win: one('P') });
  assert.equal(z.ok, false); // 16 張要 5 組
  const z2 = H.analyze({ ...base, concealed: tiles('EEE SSS WWW CCC FFF P'), win: one('P') });
  assert.equal(z2.picks.ziYiSe, 1);
  assert.equal(z2.picks.pengPeng, 1);
});

test('中發白、東南西北刻子；小三元、大三元、小四喜、大四喜', () => {
  const r = H.analyze({ ...base, roundWind: 0, seatWind: 1, concealed: tiles('123m 456m CCC SSS 789m 2m'), win: one('2m') });
  assert.equal(r.picks.zhong, 1);
  assert.equal(r.picks.fengS, 1);
  assert.equal(r.items.some(i => i.name === '南（門風）' && i.tai === 1), true);
  const xiao2 = H.analyze({ ...base, concealed: tiles('123m 456m 789m CCC FFF P'), win: one('P') });
  assert.equal(xiao2.picks.xiaoSanYuan, 1);
  assert.equal(xiao2.picks.zhong, undefined);
  const da = H.analyze({ ...base, concealed: tiles('123m 456m CCC FFF PPP 9m'), win: one('9m') });
  assert.equal(da.picks.daSanYuan, 1);
  const siXi = H.analyze({ ...base, concealed: tiles('EEE SSS WWW NNN 123m 9m'), win: one('9m') });
  assert.equal(siXi.picks.daSiXi, 1);
  assert.equal(siXi.picks.fengE, undefined);
});

test('全求、半求：五組都亮出來，單吊最後一張', () => {
  const melds = [['chi', '1m'], ['chi', '4m'], ['pon', '9p'], ['chi', '2s'], ['pon', 'C']].map(([type, t]) => ({ type, tile: one(t) }));
  const quan = H.analyze({ ...base, concealed: tiles('5s'), melds, win: one('5s') });
  assert.equal(quan.picks.quanQiu, 1);
  const ban = H.analyze({ ...base, method: 'ziMo', concealed: tiles('5s'), melds, win: one('5s') });
  assert.equal(ban.picks.banQiu, 1);
  assert.equal(ban.picks.menQing, undefined);
});

test('花牌：正花看門風，一整組是花槓，八張是八仙過海', () => {
  const hand = { ...base, seatWind: 1, concealed: tiles('123m 456m 789m 234p 99s 23s'), win: one('4s') };
  const r = H.analyze({ ...hand, flowers: [1, 5, 0] }); // 夏、蘭是南的正花
  assert.equal(r.picks.hua, 2);
  assert.equal(r.picks.pingHu, undefined); // 有花不算平胡
  assert.equal(H.analyze({ ...hand, flowers: [0, 1, 2, 3] }).picks.huaGang, 1);
  const all = H.analyze({ ...hand, flowers: [0, 1, 2, 3, 4, 5, 6, 7] });
  assert.equal(all.picks.baXian, 1);
  assert.equal(all.picks.hua, undefined);
  // 不玩花牌時花牌不算
  assert.equal(H.analyze({ ...hand, flowers: [1, 5] }, { flowers: false }).picks.hua, undefined);
});

test('看牌看不出來的（槓上開花、海底撈月…）照勾的算，也照胡法過濾', () => {
  const hand = { ...base, method: 'ziMo', concealed: tiles('123m 456m 789m 234p 99s 23s'), win: one('4s'), extras: { gangShang: 1, heDi: 1 } };
  const r = H.analyze(hand);
  assert.equal(r.picks.gangShang, 1);
  assert.equal(r.picks.heDi, undefined);
});

test('同一副牌有好幾種拆法時取台數最多的', () => {
  // 111222333m：三個暗刻（自摸）比三組順子台數多
  const r = H.analyze({ ...base, method: 'ziMo', concealed: tiles('111m 222m 333m 456p 789p 5s'), win: one('5s') });
  assert.equal(r.picks.sanAn, 1);
  assert.equal(H.setText({ type: 'seq', tile: one('1m') }), '123萬');
  assert.equal(H.setText({ type: 'pair', tile: one('E') }), '東東');
});

test('同一張牌超過 4 張會擋下來', () => {
  const r = H.analyze({ ...base, concealed: tiles('1111m 123m 456m 789m 99s 2m'), win: one('1m') });
  assert.equal(r.reason, 'over');
});
