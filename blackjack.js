/*
 * 21 點計錢：計分核心
 *
 * 莊家對每位閒家各自結算：閒家贏，莊家照下注賠；閒家輸，莊家收下注。
 * 黑傑克、過五關照設定的倍數賠；投降輸一半；加倍時下注變兩倍。
 * 瀏覽器載入後是 window.Blackjack，Node 用 require('./blackjack.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Blackjack = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_PLAYERS = 8;
  var RESULTS = [
    { id: 'win', name: '贏' },
    { id: 'lose', name: '輸' },
    { id: 'push', name: '平手' },
    { id: 'blackjack', name: '黑傑克' },
    { id: 'fiveCard', name: '過五關' },
    { id: 'surrender', name: '投降' }
  ];
  var DEFAULT_SETTINGS = { bet: 100, blackjack: 1.5, fiveCard: 2, count: 4 };

  function num(v, fallback, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    if (n < min) return min;
    if (max != null && n > max) return max;
    return n;
  }

  function normalizeSettings(s) {
    s = s || {};
    return {
      bet: num(s.bet, DEFAULT_SETTINGS.bet, 0),
      blackjack: num(s.blackjack, DEFAULT_SETTINGS.blackjack, 1),
      fiveCard: num(s.fiveCard, DEFAULT_SETTINGS.fiveCard, 1),
      count: Math.floor(num(s.count, DEFAULT_SETTINGS.count, 2, MAX_PLAYERS))
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  // 閒家的輸贏倍數（以下注為 1）；加倍只影響贏、輸、平手、過五關
  function factor(result, doubled, s) {
    var d = doubled ? 2 : 1;
    switch (result) {
      case 'win': return { x: 1 * d, label: doubled ? '加倍贏' : '贏' };
      case 'lose': return { x: -1 * d, label: doubled ? '加倍輸' : '輸' };
      case 'push': return { x: 0, label: '平手' };
      case 'blackjack': return { x: s.blackjack, label: '黑傑克' };
      case 'fiveCard': return { x: s.fiveCard * d, label: doubled ? '加倍過五關' : '過五關' };
      case 'surrender': return { x: -0.5, label: '投降' };
      default: return null;
    }
  }

  /*
   * round = { banker, players: [{ idx, bet, result, doubled }] }
   * 沒選結果的閒家不結算（pending）。nets 以座位編號為索引。
   */
  function settle(round, settings) {
    var s = normalizeSettings(settings);
    var nets = [];
    for (var i = 0; i < MAX_PLAYERS; i++) nets.push(0);
    var lines = [];
    var pending = [];
    round.players.forEach(function (p) {
      if (p.idx === round.banker) return;
      var f = factor(p.result, !!p.doubled, s);
      if (!f) { pending.push(p.idx); return; }
      var bet = Math.max(0, Number(p.bet) || 0);
      var amount = round2(bet * f.x); // 正數：莊家付給閒家
      nets[p.idx] = round2(nets[p.idx] + amount);
      nets[round.banker] = round2(nets[round.banker] - amount);
      lines.push({ idx: p.idx, bet: bet, result: p.result, doubled: !!p.doubled, x: f.x, label: f.label, amount: amount });
    });
    return { settings: s, banker: round.banker, lines: lines, pending: pending, nets: nets, bankerNet: nets[round.banker] };
  }

  return {
    MAX_PLAYERS: MAX_PLAYERS,
    RESULTS: RESULTS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    factor: factor,
    settle: settle
  };
});
