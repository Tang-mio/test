/*
 * 排七計錢：計分核心
 *
 * 只負責「蓋牌 → 勝負 → 誰付誰多少」的純計算，不碰畫面。
 * 瀏覽器載入後是 window.PaiQi，Node 用 require('./paiqi.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PaiQi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HAND_SIZE = 13; // 四人各 13 張
  var PER_RANK = 4;   // 每個點數有四種花色

  // 7 只要在手上就一定能出，所以永遠不會被蓋，鍵盤上也沒有 7
  var RANKS = ['A', '2', '3', '4', '5', '6', '8', '9', '10', 'J', 'Q', 'K'];
  var RANK_POINTS = {
    A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13
  };

  // 比牌：數字越大越贏（十三蓋 > 尾張七 > 脫手 > 一般）
  var KIND_TIER = { shiSanGai: 3, weiQi: 2, tuoShou: 1, normal: 0 };
  var KIND_LABEL = { shiSanGai: '十三蓋', weiQi: '尾張七', tuoShou: '脫手', normal: '' };

  var DEFAULT_SETTINGS = {
    rate: 1,        // 每點多少錢
    mode: 'full',   // full：輸家付自己的點數；diff：輸家付與贏家的點數差
    tuoShou: { on: true, mult: 2 },
    weiQi: { on: true, mult: 4 },
    shiSanGai: { on: true, mult: 5 },
    baoDian: { on: true, threshold: 40, mult: 2 }
  };

  function num(v, fallback, min) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return n < min ? min : n;
  }

  function rule(src, def) {
    src = src || {};
    var out = { on: src.on === undefined ? def.on : !!src.on, mult: num(src.mult, def.mult, 1) };
    if ('threshold' in def) out.threshold = num(src.threshold, def.threshold, 0);
    return out;
  }

  function normalizeSettings(s) {
    s = s || {};
    var d = DEFAULT_SETTINGS;
    return {
      rate: num(s.rate, d.rate, 0),
      mode: s.mode === 'diff' ? 'diff' : 'full',
      tuoShou: rule(s.tuoShou, d.tuoShou),
      weiQi: rule(s.weiQi, d.weiQi),
      shiSanGai: rule(s.shiSanGai, d.shiSanGai),
      baoDian: rule(s.baoDian, d.baoDian)
    };
  }

  function sumPoints(covered) {
    var total = 0;
    for (var i = 0; i < covered.length; i++) total += RANK_POINTS[covered[i]] || 0;
    return total;
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  // 回傳錯誤訊息陣列；空陣列代表這局的蓋牌是可能出現的
  function validateRound(round) {
    var errors = [];
    var used = {};
    round.players.forEach(function (p) {
      if (p.covered.length > HAND_SIZE) {
        errors.push(p.name + ' 蓋了 ' + p.covered.length + ' 張，超過手牌 ' + HAND_SIZE + ' 張');
      }
      p.covered.forEach(function (r) {
        if (r === '7') errors.push(p.name + ' 蓋了 7，但 7 一定能出，不會被蓋');
        else if (!(r in RANK_POINTS)) errors.push(p.name + ' 有無法辨識的牌「' + r + '」');
        used[r] = (used[r] || 0) + 1;
      });
    });
    Object.keys(used).forEach(function (r) {
      if (r !== '7' && used[r] > PER_RANK) {
        errors.push('全桌蓋了 ' + used[r] + ' 張 ' + r + '，一副牌只有 ' + PER_RANK + ' 張');
      }
    });
    return errors;
  }

  function kindOf(p, count, s) {
    if (s.shiSanGai.on && count === HAND_SIZE) return 'shiSanGai';
    if (count === 0 && p.lastSeven && s.weiQi.on) return 'weiQi';
    if (count === 0 && s.tuoShou.on) return 'tuoShou';
    return 'normal';
  }

  /*
   * round = {
   *   firstIdx: 拿 ♠7 先出的座位（0 起算，依座位順序輪流）,
   *   players: [{ name, covered: ['K', 'Q', ...], lastSeven: 脫手時最後一張是否為 7 }]
   * }
   */
  function settle(round, settings) {
    var s = normalizeSettings(settings);
    var n = round.players.length;
    var first = ((round.firstIdx || 0) % n + n) % n;

    var players = round.players.map(function (p, i) {
      var count = p.covered.length;
      return {
        idx: i,
        name: p.name,
        count: count,
        points: sumPoints(p.covered),
        kind: kindOf(p, count, s),
        order: (i - first + n) % n, // 從 ♠7 持有者開始數的出牌順位
        baoDian: false,
        net: 0
      };
    });

    // 比牌順序：十三蓋 > 尾張七 > 脫手 > 點數少 > 張數少 > 出牌順序早
    var ranked = players.slice().sort(function (a, b) {
      return (KIND_TIER[b.kind] - KIND_TIER[a.kind]) ||
        (a.points - b.points) ||
        (a.count - b.count) ||
        (a.order - b.order);
    });
    var winner = ranked[0];
    var runnerUp = ranked[1];
    var decidedBy = 'kind';
    if (runnerUp && KIND_TIER[winner.kind] === KIND_TIER[runnerUp.kind]) {
      if (winner.points !== runnerUp.points) decidedBy = 'points';
      else if (winner.count !== runnerUp.count) decidedBy = 'count';
      else decidedBy = 'order';
    }

    var winnerMult = winner.kind === 'normal' ? 1 : s[winner.kind].mult;
    // 十三蓋的人蓋了一大堆，但算贏家，付差額時以 0 點計
    var winnerPoints = winner.kind === 'shiSanGai' ? 0 : winner.points;

    var transfers = [];
    players.forEach(function (p) {
      if (p === winner) return;
      var base = s.mode === 'full' ? p.points : Math.max(0, p.points - winnerPoints);
      var factors = [];
      if (winnerMult !== 1) factors.push({ label: KIND_LABEL[winner.kind], x: winnerMult });
      if (s.baoDian.on && p.points > s.baoDian.threshold) {
        p.baoDian = true;
        factors.push({ label: '爆點', x: s.baoDian.mult });
      }
      var mult = factors.reduce(function (m, f) { return m * f.x; }, 1);
      var amount = round2(base * mult * s.rate);
      p.net = round2(p.net - amount);
      winner.net = round2(winner.net + amount);
      transfers.push({
        from: p.idx,
        to: winner.idx,
        base: base,
        factors: factors,
        mult: mult,
        rate: s.rate,
        amount: amount
      });
    });

    return {
      settings: s,
      winner: winner.idx,
      winnerKind: winner.kind,
      winnerMult: winnerMult,
      winnerPoints: winnerPoints,
      decidedBy: decidedBy,
      runnerUp: runnerUp ? runnerUp.idx : null,
      players: players,
      transfers: transfers
    };
  }

  return {
    HAND_SIZE: HAND_SIZE,
    PER_RANK: PER_RANK,
    RANKS: RANKS,
    RANK_POINTS: RANK_POINTS,
    KIND_LABEL: KIND_LABEL,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    sumPoints: sumPoints,
    validateRound: validateRound,
    settle: settle
  };
});
