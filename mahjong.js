/*
 * 麻將計錢（台灣十六張）：計分核心
 *
 * 每位付錢的人付「底 + 台數 × 每台」。
 * 莊家有關的支付（莊家胡，或莊家付錢）另外加莊家台：1 台 + 連莊數 × 2（連 N 拉 N）。
 * 瀏覽器載入後是 window.Mahjong，Node 用 require('./mahjong.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Mahjong = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEATS = 4;

  /*
   * 常見台型。max > 1 的可以算好幾次（例如兩組三元牌刻子）。
   * ex：同一組只能選一個；clears：選了它就清掉被包含的台型。
   * only：'ziMo' 只有自摸才有、'fangQiang' 只有放槍（別人打出）才有。
   */
  var PATTERNS = [
    { id: 'menQing', name: '門清', tai: 1, group: 'basic', note: '沒有吃、碰、明槓；自摸時算門清自摸共 3 台' },
    { id: 'duTing', name: '獨聽', tai: 1, group: 'basic', note: '邊張、中洞、單吊' },
    { id: 'pingHu', name: '平胡', tai: 2, group: 'basic', note: '沒有字、沒有花、都是順子、聽兩面' },
    { id: 'banQiu', name: '半求', tai: 1, group: 'basic', ex: 'qiu', only: 'ziMo', note: '全部吃碰完，自摸最後一張' },
    { id: 'quanQiu', name: '全求', tai: 2, group: 'basic', ex: 'qiu', only: 'fangQiang', note: '全部吃碰完，胡別人打的' },
    { id: 'gangShang', name: '槓上開花', tai: 1, group: 'basic', only: 'ziMo' },
    { id: 'haiDi', name: '海底撈月', tai: 1, group: 'basic', only: 'ziMo', note: '自摸最後一張牌' },
    { id: 'heDi', name: '河底撈魚', tai: 1, group: 'basic', only: 'fangQiang', note: '胡最後一張打出的牌' },
    { id: 'qiangGang', name: '搶槓', tai: 1, group: 'basic', only: 'fangQiang' },

    { id: 'sanYuan', name: '三元牌', tai: 1, group: 'honor', max: 3, note: '中、發、白的刻子，每組 1 台' },
    { id: 'quanFeng', name: '圈風', tai: 1, group: 'honor', note: '這一圈的風牌刻子' },
    { id: 'menFeng', name: '門風', tai: 1, group: 'honor', note: '自己座位的風牌刻子' },
    { id: 'hua', name: '正花', tai: 1, group: 'honor', max: 2, note: '和座位對應的花，每張 1 台' },
    { id: 'huaGang', name: '花槓', tai: 2, group: 'honor', max: 2, note: '春夏秋冬或梅蘭竹菊一整組' },

    { id: 'pengPeng', name: '碰碰胡', tai: 4, group: 'big' },
    { id: 'sanAn', name: '三暗刻', tai: 2, group: 'big', ex: 'anKe' },
    { id: 'siAn', name: '四暗刻', tai: 5, group: 'big', ex: 'anKe' },
    { id: 'wuAn', name: '五暗刻', tai: 8, group: 'big', ex: 'anKe' },
    { id: 'hunYiSe', name: '混一色', tai: 4, group: 'big', ex: 'yiSe' },
    { id: 'qingYiSe', name: '清一色', tai: 8, group: 'big', ex: 'yiSe' },
    { id: 'ziYiSe', name: '字一色', tai: 16, group: 'big', ex: 'yiSe' },
    { id: 'xiaoSanYuan', name: '小三元', tai: 4, group: 'big', ex: 'sanYuanDa', clears: ['sanYuan'] },
    { id: 'daSanYuan', name: '大三元', tai: 8, group: 'big', ex: 'sanYuanDa', clears: ['sanYuan'] },
    { id: 'xiaoSiXi', name: '小四喜', tai: 8, group: 'big', ex: 'siXi', clears: ['quanFeng', 'menFeng'] },
    { id: 'daSiXi', name: '大四喜', tai: 16, group: 'big', ex: 'siXi', clears: ['quanFeng', 'menFeng'] },
    { id: 'baXian', name: '八仙過海', tai: 8, group: 'big', ex: 'huaAll', clears: ['hua', 'huaGang'] },
    { id: 'qiQiangYi', name: '七搶一', tai: 8, group: 'big', ex: 'huaAll', clears: ['hua', 'huaGang'] },
    { id: 'tianHu', name: '天胡', tai: 16, group: 'big', ex: 'tian', only: 'ziMo' },
    { id: 'diHu', name: '地胡', tai: 16, group: 'big', ex: 'tian', only: 'ziMo' },
    { id: 'renHu', name: '人胡', tai: 8, group: 'big', ex: 'tian', only: 'fangQiang' }
  ];
  var BY_ID = {};
  PATTERNS.forEach(function (p) { BY_ID[p.id] = p; });

  var DEFAULT_SETTINGS = { base: 50, perTai: 20 };

  function num(v, fallback, min) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return n < min ? min : n;
  }

  function normalizeSettings(s) {
    s = s || {};
    return { base: num(s.base, DEFAULT_SETTINGS.base, 0), perTai: num(s.perTai, DEFAULT_SETTINGS.perTai, 0) };
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  // 只留合法的選擇：存在的台型、次數在範圍內、符合胡法
  function cleanPicks(picks, method) {
    var out = {};
    Object.keys(picks || {}).forEach(function (id) {
      var p = BY_ID[id];
      if (!p) return;
      var n = Math.floor(Number(picks[id]) || 0);
      n = Math.max(0, Math.min(p.max || 1, n));
      if (n && (!p.only || !method || p.only === method)) out[id] = n;
    });
    return out;
  }

  // 點一下台型：一般台型切換有無，可多次的台型循環 0 → 1 → … → max → 0
  function togglePick(picks, id, method) {
    var p = BY_ID[id];
    var out = cleanPicks(picks, method);
    if (!p || (p.only && method && p.only !== method)) return out;
    var next = ((out[id] || 0) + 1) % ((p.max || 1) + 1);
    if (next) {
      out[id] = next;
      PATTERNS.forEach(function (q) {
        if (q !== p && p.ex && q.ex === p.ex) delete out[q.id];
      });
      (p.clears || []).forEach(function (c) { delete out[c]; });
      PATTERNS.forEach(function (q) {
        if (q.clears && q.clears.indexOf(id) !== -1) delete out[q.id];
      });
    } else {
      delete out[id];
    }
    return out;
  }

  // 胡牌者的台數（不含莊家台）。自摸 1 台；門清加自摸合計 3 台（門清自摸）
  function countTai(picks, method, extra) {
    var clean = cleanPicks(picks, method);
    var items = [];
    var tai = 0;
    PATTERNS.forEach(function (p) {
      var n = clean[p.id];
      if (!n) return;
      tai += p.tai * n;
      items.push({ id: p.id, name: p.name + (n > 1 ? ' ×' + n : ''), tai: p.tai * n });
    });
    if (method === 'ziMo') {
      if (clean.menQing) {
        tai += 2;
        items = items.filter(function (it) { return it.id !== 'menQing'; });
        items.unshift({ id: 'buQiuRen', name: '門清自摸', tai: 3 });
      } else {
        tai += 1;
        items.unshift({ id: 'ziMo', name: '自摸', tai: 1 });
      }
    }
    var more = Math.round(Number(extra) || 0);
    if (more) {
      tai += more;
      items.push({ id: 'extra', name: '其他', tai: more });
    }
    return { tai: Math.max(0, tai), items: items };
  }

  function dealerTai(streak) { return 1 + 2 * Math.max(0, Math.floor(Number(streak) || 0)); }

  /*
   * hand = { dealer, streak, winner, method: 'ziMo' | 'fangQiang', discarder, tai }
   * 回傳每筆支付與每人淨額；資料不完整時回傳 { ready: false, reason }
   */
  function settle(hand, settings) {
    var s = normalizeSettings(settings);
    var w = hand.winner;
    if (w == null || w < 0 || w >= SEATS) return { ready: false, reason: 'winner' };
    if (hand.method !== 'ziMo' && hand.method !== 'fangQiang') return { ready: false, reason: 'method' };
    if (hand.method === 'fangQiang' && (hand.discarder == null || hand.discarder === w || hand.discarder < 0 || hand.discarder >= SEATS)) {
      return { ready: false, reason: 'discarder' };
    }
    var tai = Math.max(0, Math.round(Number(hand.tai) || 0));
    var dTai = dealerTai(hand.streak);
    var payers = [];
    for (var i = 0; i < SEATS; i++) {
      if (i === w) continue;
      if (hand.method === 'ziMo' || i === hand.discarder) payers.push(i);
    }
    var nets = [0, 0, 0, 0];
    var transfers = payers.map(function (p) {
      var withDealer = p === hand.dealer || w === hand.dealer;
      var total = tai + (withDealer ? dTai : 0);
      var amount = round2(s.base + total * s.perTai);
      nets[p] = round2(nets[p] - amount);
      nets[w] = round2(nets[w] + amount);
      return { from: p, to: w, tai: tai, dealerTai: withDealer ? dTai : 0, totalTai: total, base: s.base, perTai: s.perTai, amount: amount };
    });
    return { ready: true, settings: s, winner: w, method: hand.method, tai: tai, dealerTai: dTai, transfers: transfers, nets: nets };
  }

  // 莊家胡或流局：連莊；其他人胡：下一家當莊
  function nextDealer(dealer, streak, winner) {
    if (winner == null || winner < 0 || winner === dealer) return { dealer: dealer, streak: streak + 1 };
    return { dealer: (dealer + 1) % SEATS, streak: 0 };
  }

  return {
    PATTERNS: PATTERNS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    cleanPicks: cleanPicks,
    togglePick: togglePick,
    countTai: countTai,
    dealerTai: dealerTai,
    settle: settle,
    nextDealer: nextDealer
  };
});
