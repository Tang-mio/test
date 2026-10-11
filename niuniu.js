/*
 * 妞妞（牛牛）計錢：計分核心
 *
 * 每人五張牌：10、J、Q、K 算 10，A 算 1，其他照牌面。
 * 挑三張加起來是 10 的倍數就「有妞」，剩下兩張加起來的個位數是妞幾，個位數是 0 叫「妞妞」；挑不出來是「沒妞」。
 * 特殊牌型（各自可以關掉）：五小 > 炸彈 > 五花 > 妞妞 > 妞9 > … > 妞1 > 沒妞。
 * 莊家和每位閒家各自比：牌型大的贏，照贏家牌型的倍數算「下注 × 倍數」；
 * 同牌型比最大的一張（K 最大、A 最小，一樣再比花色），也可以設定成同牌型莊家贏。
 * 瀏覽器載入後是 window.Niuniu，Node 用 require('./niuniu.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Niuniu = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_PLAYERS = 8;
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var FACES = { J: true, Q: true, K: true };

  // 牌型由小到大；mult 是倍數設定裡的哪一格（妞1～妞6 共用一格）
  var HANDS = [
    { id: 'none', name: '沒妞', short: '沒妞', mult: 'none' },
    { id: 'n1', name: '妞1', short: '1', mult: 'low' },
    { id: 'n2', name: '妞2', short: '2', mult: 'low' },
    { id: 'n3', name: '妞3', short: '3', mult: 'low' },
    { id: 'n4', name: '妞4', short: '4', mult: 'low' },
    { id: 'n5', name: '妞5', short: '5', mult: 'low' },
    { id: 'n6', name: '妞6', short: '6', mult: 'low' },
    { id: 'n7', name: '妞7', short: '7', mult: 'n7' },
    { id: 'n8', name: '妞8', short: '8', mult: 'n8' },
    { id: 'n9', name: '妞9', short: '9', mult: 'n9' },
    { id: 'nn', name: '妞妞', short: '妞妞', mult: 'nn' },
    { id: 'wuHua', name: '五花', short: '五花', mult: 'wuHua', special: true, note: '五張都是 J、Q、K' },
    { id: 'zhaDan', name: '炸彈', short: '炸彈', mult: 'zhaDan', special: true, note: '四張一樣的牌' },
    { id: 'wuXiao', name: '五小', short: '五小', mult: 'wuXiao', special: true, note: '五張都小於 5，加起來不超過 10' }
  ];
  var BY_ID = {};
  HANDS.forEach(function (h, i) { h.rank = i; BY_ID[h.id] = h; });
  var SPECIALS = HANDS.filter(function (h) { return h.special; }).map(function (h) { return h.id; });

  // 倍數設定的每一格
  var MULTS = [
    { id: 'none', name: '沒妞' },
    { id: 'low', name: '妞1～妞6' },
    { id: 'n7', name: '妞7' },
    { id: 'n8', name: '妞8' },
    { id: 'n9', name: '妞9' },
    { id: 'nn', name: '妞妞' },
    { id: 'wuHua', name: '五花' },
    { id: 'zhaDan', name: '炸彈' },
    { id: 'wuXiao', name: '五小' }
  ];

  var DEFAULT_SETTINGS = {
    bet: 100,
    mult: { none: 1, low: 1, n7: 2, n8: 2, n9: 2, nn: 3, wuHua: 5, zhaDan: 5, wuXiao: 5 },
    special: { wuHua: true, zhaDan: true, wuXiao: true },
    tie: 'card' // 'card' 同牌型比最大的一張；'banker' 同牌型莊家贏
  };

  function num(v, fallback, min, max) {
    var n = Number(v);
    if (v === '' || v == null || !isFinite(n)) return fallback;
    if (n < min) return min;
    if (max != null && n > max) return max;
    return n;
  }

  function normalizeSettings(s) {
    s = s || {};
    var d = DEFAULT_SETTINGS;
    var mult = {};
    MULTS.forEach(function (m) { mult[m.id] = num(s.mult && s.mult[m.id], d.mult[m.id], 0, 99); });
    var special = {};
    SPECIALS.forEach(function (id) { special[id] = !s.special || s.special[id] === undefined ? d.special[id] : !!s.special[id]; });
    return {
      bet: num(s.bet, d.bet, 0),
      mult: mult,
      special: special,
      tie: s.tie === 'banker' ? 'banker' : 'card'
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  // 這個設定下能選的牌型（關掉的特殊牌型不出現）
  function handsFor(settings) {
    var s = normalizeSettings(settings);
    return HANDS.filter(function (h) { return !h.special || s.special[h.id]; });
  }
  function isHand(id, settings) {
    var h = BY_ID[id];
    return !!h && (!h.special || normalizeSettings(settings).special[id]);
  }
  function multOf(id, settings) {
    var h = BY_ID[id];
    return h ? normalizeSettings(settings).mult[h.mult] : 0;
  }

  /* ---------- 看五張牌算妞 ---------- */

  function cardValue(r) {
    var i = RANKS.indexOf(r);
    return i < 0 ? 0 : Math.min(10, i + 1);
  }

  /*
   * cards 是五張牌的點數（'A'…'K'）。回傳 { id, three: [三張的位置] 或 null, rest: [兩張的位置], high: 最大那張 }。
   * 剩下兩張的點數 = 總和 − 三張，三張是 10 的倍數，所以有妞時妞幾只看總和的個位數。
   */
  function evaluate(cards, settings) {
    var s = normalizeSettings(settings);
    if (!Array.isArray(cards) || cards.length !== 5 || cards.some(function (c) { return RANKS.indexOf(c) < 0; })) return null;
    var vals = cards.map(cardValue);
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var high = cards.slice().sort(function (a, b) { return RANKS.indexOf(b) - RANKS.indexOf(a); })[0];
    var counts = {};
    cards.forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    var out = function (id, three) {
      var rest = three ? [0, 1, 2, 3, 4].filter(function (i) { return three.indexOf(i) < 0; }) : [];
      return { id: id, three: three, rest: rest, high: high };
    };
    if (s.special.wuXiao && vals.every(function (v) { return v < 5; }) && total <= 10) return out('wuXiao', null);
    if (s.special.zhaDan && Object.keys(counts).some(function (k) { return counts[k] === 4; })) return out('zhaDan', null);
    if (s.special.wuHua && cards.every(function (c) { return FACES[c]; })) return out('wuHua', null);
    for (var a = 0; a < 5; a++) {
      for (var b = a + 1; b < 5; b++) {
        for (var c = b + 1; c < 5; c++) {
          if ((vals[a] + vals[b] + vals[c]) % 10 !== 0) continue;
          var n = total % 10;
          return out(n === 0 ? 'nn' : 'n' + n, [a, b, c]);
        }
      }
    }
    return out('none', null);
  }

  /* ---------- 結算 ---------- */

  /*
   * round = { banker, bankerHand, players: [{ idx, bet, hand, tie }] }
   * hand 是牌型 id；tie 是同牌型時誰大（'banker' 或 'player'）。
   * 莊家或閒家還沒選牌型的不結算（pending）；同牌型又還沒選誰大的放在 ties。nets 以玩家編號為索引。
   */
  function settle(round, settings) {
    var s = normalizeSettings(settings);
    var nets = [];
    for (var i = 0; i < MAX_PLAYERS; i++) nets.push(0);
    var lines = [];
    var pending = [];
    var ties = [];
    var bh = isHand(round.bankerHand, s) ? round.bankerHand : null;
    round.players.forEach(function (p) {
      if (p.idx === round.banker) return;
      var ph = isHand(p.hand, s) ? p.hand : null;
      if (!ph || !bh) { pending.push(p.idx); return; }
      var c = BY_ID[ph].rank - BY_ID[bh].rank;
      var winner = c > 0 ? 'player' : c < 0 ? 'banker'
        : s.tie === 'banker' ? 'banker' : (p.tie === 'banker' || p.tie === 'player' ? p.tie : null);
      if (!winner) { ties.push(p.idx); return; }
      var hand = winner === 'player' ? ph : bh;
      var x = multOf(hand, s) * (winner === 'player' ? 1 : -1);
      var bet = Math.max(0, Number(p.bet) || 0);
      var amount = round2(bet * x); // 正數：莊家付給閒家
      nets[p.idx] = round2(nets[p.idx] + amount);
      nets[round.banker] = round2(nets[round.banker] - amount);
      lines.push({
        idx: p.idx, bet: bet, hand: ph, bankerHand: bh, winner: winner, sameHand: c === 0,
        x: x, amount: amount
      });
    });
    return {
      settings: s, banker: round.banker, bankerHand: bh, lines: lines, pending: pending, ties: ties,
      nets: nets, bankerNet: nets[round.banker]
    };
  }

  return {
    MAX_PLAYERS: MAX_PLAYERS,
    RANKS: RANKS,
    HANDS: HANDS,
    BY_ID: BY_ID,
    MULTS: MULTS,
    SPECIALS: SPECIALS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    handsFor: handsFor,
    isHand: isHand,
    multOf: multOf,
    cardValue: cardValue,
    evaluate: evaluate,
    settle: settle
  };
});
