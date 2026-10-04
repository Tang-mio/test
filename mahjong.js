/*
 * 麻將計錢（台灣十六張）：計分核心
 *
 * 每位付錢的人付「底 + 台數 × 每台」。
 * 莊家有關的支付（莊家胡，或莊家付錢）另外加莊家台：預設 1 台 + 連莊數 × 2（連 N 拉 N）。
 * 台數、莊家台、限台都可以在設定裡改，也能關掉或新增台型。
 * 瀏覽器載入後是 window.Mahjong，Node 用 require('./mahjong.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Mahjong = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEATS = 4;
  var WIND_NAMES = ['東', '南', '西', '北'];

  /*
   * 常見台型。max > 1 的可以算好幾次（例如兩組三元牌刻子）。
   * ex：同一組只能選一個；clears：選了它就清掉被包含的台型。
   * only：'ziMo' 只有自摸才有、'fangQiang' 只有放槍（別人打出）才有。
   * flower：花牌的台型，設定成不玩花牌時不出現。
   * defaultOff：預設不用的台型，要在設定裡打開（例如南部的風牌刻子）。
   */
  var PATTERNS = [
    { id: 'menQing', name: '門清', tai: 1, group: 'basic', note: '沒有吃、碰、明槓；又自摸時改算門清自摸' },
    { id: 'duTing', name: '獨聽', tai: 1, group: 'basic', note: '邊張、中洞、單吊' },
    { id: 'pingHu', name: '平胡', tai: 2, group: 'basic', note: '沒有字、沒有花、都是順子、聽兩面' },
    { id: 'banQiu', name: '半求', tai: 1, group: 'basic', ex: 'qiu', only: 'ziMo', note: '全部吃碰完，自摸最後一張' },
    { id: 'quanQiu', name: '全求', tai: 2, group: 'basic', ex: 'qiu', only: 'fangQiang', note: '全部吃碰完，胡別人打的' },
    { id: 'gangShang', name: '槓上開花', tai: 1, group: 'basic', only: 'ziMo' },
    { id: 'haiDi', name: '海底撈月', tai: 1, group: 'basic', only: 'ziMo', note: '自摸最後一張牌' },
    { id: 'heDi', name: '河底撈魚', tai: 1, group: 'basic', only: 'fangQiang', note: '胡最後一張打出的牌' },
    { id: 'qiangGang', name: '搶槓', tai: 1, group: 'basic', only: 'fangQiang' },

    { id: 'sanYuan', name: '三元牌', tai: 1, group: 'honor', max: 3, note: '中、發、白的刻子，每組都算' },
    { id: 'quanFeng', name: '圈風', tai: 1, group: 'honor', note: '這一圈的風牌刻子' },
    { id: 'menFeng', name: '門風', tai: 1, group: 'honor', note: '自己座位的風牌刻子' },
    { id: 'jianFeng', name: '風牌刻子', tai: 1, group: 'honor', max: 4, defaultOff: true, clears: ['quanFeng', 'menFeng'],
      note: '不分圈風、門風，有風牌刻子就算（南部的見字有台）' },
    { id: 'hua', name: '正花', tai: 1, group: 'honor', max: 2, flower: true, note: '和座位對應的花，每張都算' },
    { id: 'huaGang', name: '花槓', tai: 2, group: 'honor', max: 2, flower: true, note: '春夏秋冬或梅蘭竹菊一整組' },

    { id: 'pengPeng', name: '碰碰胡', tai: 4, group: 'big' },
    { id: 'sanAn', name: '三暗刻', tai: 2, group: 'big', ex: 'anKe' },
    { id: 'siAn', name: '四暗刻', tai: 5, group: 'big', ex: 'anKe' },
    { id: 'wuAn', name: '五暗刻', tai: 8, group: 'big', ex: 'anKe' },
    { id: 'hunYiSe', name: '混一色', tai: 4, group: 'big', ex: 'yiSe' },
    { id: 'qingYiSe', name: '清一色', tai: 8, group: 'big', ex: 'yiSe' },
    { id: 'ziYiSe', name: '字一色', tai: 16, group: 'big', ex: 'yiSe' },
    { id: 'xiaoSanYuan', name: '小三元', tai: 4, group: 'big', ex: 'sanYuanDa', clears: ['sanYuan'] },
    { id: 'daSanYuan', name: '大三元', tai: 8, group: 'big', ex: 'sanYuanDa', clears: ['sanYuan'] },
    { id: 'xiaoSiXi', name: '小四喜', tai: 8, group: 'big', ex: 'siXi', clears: ['quanFeng', 'menFeng', 'jianFeng'] },
    { id: 'daSiXi', name: '大四喜', tai: 16, group: 'big', ex: 'siXi', clears: ['quanFeng', 'menFeng', 'jianFeng'] },
    { id: 'baXian', name: '八仙過海', tai: 8, group: 'big', ex: 'huaAll', flower: true, clears: ['hua', 'huaGang'] },
    { id: 'qiQiangYi', name: '七搶一', tai: 8, group: 'big', ex: 'huaAll', flower: true, clears: ['hua', 'huaGang'] },
    { id: 'tianHu', name: '天胡', tai: 16, group: 'big', ex: 'tian', only: 'ziMo' },
    { id: 'diHu', name: '地胡', tai: 16, group: 'big', ex: 'tian', only: 'ziMo' },
    { id: 'renHu', name: '人胡', tai: 8, group: 'big', ex: 'tian', only: 'fangQiang' }
  ];
  var BY_ID = {};
  PATTERNS.forEach(function (p) { BY_ID[p.id] = p; });

  var GROUP_NAMES = { basic: '常見', honor: '字牌與花', big: '大牌', custom: '自訂' };
  var MAX_CUSTOM = 20;

  var DEFAULT_SETTINGS = {
    base: 50,               // 底
    perTai: 20,             // 每台
    flowers: true,          // 有沒有玩花牌
    cap: 0,                 // 限台：一把最多幾台，0 是不限
    capIncludesDealer: false, // 莊家台是否也算在限台裡
    dealerTai: 1,           // 莊家台
    dealerNeedsStreak: false, // 沒連莊時莊家不算台（南部打法）
    streakTai: 2,           // 每連莊一次加幾台（連 N 拉 N 是 2）
    ziMoTai: 1,             // 自摸
    menQingZiMoTai: 3,      // 門清加自摸合計
    tai: {},                // 改過的台數 { 台型 id: 台數 }
    off: {},                // 不用的台型 { 台型 id: true }
    on: {},                 // 打開的預設不用台型 { 台型 id: true }
    custom: []              // 自訂台型 [{ id, name, tai }]
  };

  function num(v, fallback, min) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return n < min ? min : n;
  }
  function int(v, fallback, min, max) {
    var n = Math.round(Number(v));
    if (v === '' || v == null || !isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeSettings(s) {
    s = s || {};
    var d = DEFAULT_SETTINGS;
    var tai = {};
    Object.keys(s.tai || {}).forEach(function (id) {
      if (!BY_ID[id]) return;
      var n = int(s.tai[id], null, 0, 99);
      if (n != null && n !== BY_ID[id].tai) tai[id] = n;
    });
    var off = {};
    Object.keys(s.off || {}).forEach(function (id) { if (BY_ID[id] && !BY_ID[id].defaultOff && s.off[id]) off[id] = true; });
    var on = {};
    Object.keys(s.on || {}).forEach(function (id) { if (BY_ID[id] && BY_ID[id].defaultOff && s.on[id]) on[id] = true; });
    var seen = {};
    var custom = [];
    (Array.isArray(s.custom) ? s.custom : []).forEach(function (c) {
      if (!c || custom.length >= MAX_CUSTOM) return;
      var name = String(c.name == null ? '' : c.name).trim().slice(0, 12);
      var id = typeof c.id === 'string' && /^c[A-Za-z0-9]{1,16}$/.test(c.id) ? c.id : null;
      if (!name || !id || seen[id]) return;
      seen[id] = true;
      custom.push({ id: id, name: name, tai: int(c.tai, 1, 0, 99) });
    });
    return {
      base: num(s.base, d.base, 0),
      perTai: num(s.perTai, d.perTai, 0),
      flowers: s.flowers === undefined ? d.flowers : !!s.flowers,
      cap: int(s.cap, d.cap, 0, 999),
      capIncludesDealer: !!s.capIncludesDealer,
      dealerTai: int(s.dealerTai, d.dealerTai, 0, 99),
      dealerNeedsStreak: !!s.dealerNeedsStreak,
      streakTai: int(s.streakTai, d.streakTai, 0, 99),
      ziMoTai: int(s.ziMoTai, d.ziMoTai, 0, 99),
      menQingZiMoTai: int(s.menQingZiMoTai, d.menQingZiMoTai, 0, 99),
      tai: tai,
      off: off,
      on: on,
      custom: custom
    };
  }

  function isOn(p, s) { return p.defaultOff ? !!s.on[p.id] : !s.off[p.id]; }

  // 依設定算出實際可用的台型（改過的台數、關掉的不算、沒玩花牌時拿掉花牌台型、加上自訂的）
  function patternsFor(settings) {
    var s = normalizeSettings(settings);
    var list = [];
    PATTERNS.forEach(function (p) {
      if (!isOn(p, s) || (p.flower && !s.flowers)) return;
      var q = {};
      Object.keys(p).forEach(function (k) { q[k] = p[k]; });
      q.tai = s.tai[p.id] != null ? s.tai[p.id] : p.tai;
      q.defaultTai = p.tai;
      list.push(q);
    });
    s.custom.forEach(function (c) {
      list.push({ id: c.id, name: c.name, tai: c.tai, group: 'custom', custom: true });
    });
    return list;
  }

  function byId(list) {
    var m = {};
    list.forEach(function (p) { m[p.id] = p; });
    return m;
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  // 只留合法的選擇：存在且沒關掉的台型、次數在範圍內、符合胡法
  function cleanPicks(picks, method, settings) {
    var pats = byId(patternsFor(settings));
    var out = {};
    Object.keys(picks || {}).forEach(function (id) {
      var p = pats[id];
      if (!p) return;
      var n = Math.floor(Number(picks[id]) || 0);
      n = Math.max(0, Math.min(p.max || 1, n));
      if (n && (!p.only || !method || p.only === method)) out[id] = n;
    });
    return out;
  }

  // 點一下台型：一般台型切換有無，可多次的台型循環 0 → 1 → … → max → 0
  function togglePick(picks, id, method, settings) {
    var list = patternsFor(settings);
    var p = byId(list)[id];
    var out = cleanPicks(picks, method, settings);
    if (!p || (p.only && method && p.only !== method)) return out;
    var next = ((out[id] || 0) + 1) % ((p.max || 1) + 1);
    if (next) {
      out[id] = next;
      list.forEach(function (q) {
        if (q !== p && p.ex && q.ex === p.ex) delete out[q.id];
      });
      (p.clears || []).forEach(function (c) { delete out[c]; });
      list.forEach(function (q) {
        if (q.clears && q.clears.indexOf(id) !== -1) delete out[q.id];
      });
    } else {
      delete out[id];
    }
    return out;
  }

  // 胡牌者的台數（不含莊家台、還沒套用限台）
  function countTai(picks, method, extra, settings) {
    var s = normalizeSettings(settings);
    var list = patternsFor(s);
    var clean = cleanPicks(picks, method, s);
    var items = [];
    var tai = 0;
    list.forEach(function (p) {
      var n = clean[p.id];
      if (!n) return;
      tai += p.tai * n;
      items.push({ id: p.id, name: p.name + (n > 1 ? ' ×' + n : ''), tai: p.tai * n });
    });
    if (method === 'ziMo') {
      if (clean.menQing) {
        var mq = byId(list).menQing.tai;
        tai += s.menQingZiMoTai - mq;
        items = items.filter(function (it) { return it.id !== 'menQing'; });
        items.unshift({ id: 'buQiuRen', name: '門清自摸', tai: s.menQingZiMoTai });
      } else {
        tai += s.ziMoTai;
        items.unshift({ id: 'ziMo', name: '自摸', tai: s.ziMoTai });
      }
    }
    var more = Math.round(Number(extra) || 0);
    if (more) {
      tai += more;
      items.push({ id: 'extra', name: '其他', tai: more });
    }
    return { tai: Math.max(0, tai), items: items };
  }

  // 莊家台：莊家台數 + 連莊數 × 每連幾台；設定「沒連莊時莊家不算台」時，沒連莊就是 0
  function dealerTai(streak, settings) {
    var s = normalizeSettings(settings);
    var n = Math.max(0, Math.floor(Number(streak) || 0));
    if (s.dealerNeedsStreak && n === 0) return 0;
    return s.dealerTai + s.streakTai * n;
  }

  /*
   * hand = { dealer, streak, winner, method: 'ziMo' | 'fangQiang', discarder, tai }
   * tai 是胡牌者的台數（countTai 的結果），限台在這裡套用。
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
    var dTai = dealerTai(hand.streak, s);
    var payers = [];
    for (var i = 0; i < SEATS; i++) {
      if (i === w) continue;
      if (hand.method === 'ziMo' || i === hand.discarder) payers.push(i);
    }
    var nets = [0, 0, 0, 0];
    var capped = false;
    var transfers = payers.map(function (p) {
      var extra = p === hand.dealer || w === hand.dealer ? dTai : 0;
      var total;
      if (!s.cap) total = tai + extra;
      else if (s.capIncludesDealer) total = Math.min(s.cap, tai + extra);
      else total = Math.min(s.cap, tai) + extra;
      var cut = total < tai + extra;
      if (cut) capped = true;
      var amount = round2(s.base + total * s.perTai);
      nets[p] = round2(nets[p] - amount);
      nets[w] = round2(nets[w] + amount);
      return {
        from: p, to: w, tai: tai, dealerTai: extra, totalTai: total, capped: cut,
        base: s.base, perTai: s.perTai, amount: amount
      };
    });
    return {
      ready: true, settings: s, winner: w, method: hand.method, tai: tai, dealerTai: dTai,
      capped: capped, transfers: transfers, nets: nets
    };
  }

  /*
   * 一鍵套用的打法。只改規則與台數表，底、每台、自訂台型保持不變。
   * 南部打法（無花）：不打花牌；邊張、中洞、單吊不算台；見字有台（風牌不用對位）；
   * 滿台 4 台；莊家沒連莊不算台，連 N 拉 N 共 2N+1 台；碰碰胡 2 台。
   */
  var PRESETS = {
    north: {
      name: '北部打法', flowers: true, cap: 0, capIncludesDealer: false,
      dealerTai: 1, dealerNeedsStreak: false, streakTai: 2, ziMoTai: 1, menQingZiMoTai: 3,
      tai: {}, off: {}, on: {}
    },
    south: {
      name: '南部打法', flowers: false, cap: 4, capIncludesDealer: false,
      dealerTai: 1, dealerNeedsStreak: true, streakTai: 2, ziMoTai: 1, menQingZiMoTai: 3,
      tai: { pengPeng: 2 }, off: { duTing: true, quanFeng: true, menFeng: true }, on: { jianFeng: true }
    }
  };
  var PRESET_KEYS = ['flowers', 'cap', 'capIncludesDealer', 'dealerTai', 'dealerNeedsStreak', 'streakTai', 'ziMoTai', 'menQingZiMoTai', 'tai', 'off', 'on'];

  function applyPreset(settings, name) {
    var p = PRESETS[name];
    var s = normalizeSettings(settings);
    if (!p) return s;
    var next = JSON.parse(JSON.stringify(s));
    PRESET_KEYS.forEach(function (k) { next[k] = JSON.parse(JSON.stringify(p[k])); });
    return normalizeSettings(next);
  }

  // 目前的規則和哪個打法一樣（不看底、每台、自訂台型）；都不一樣就回傳 null
  function matchPreset(settings) {
    var s = normalizeSettings(settings);
    var found = null;
    Object.keys(PRESETS).forEach(function (name) {
      var p = normalizeSettings(applyPreset(s, name));
      var same = PRESET_KEYS.every(function (k) { return JSON.stringify(p[k]) === JSON.stringify(s[k]); });
      if (same && !found) found = name;
    });
    return found;
  }

  // 莊家胡或流局：連莊；其他人胡：下一家當莊
  function nextDealer(dealer, streak, winner) {
    if (winner == null || winner < 0 || winner === dealer) return { dealer: dealer, streak: streak + 1 };
    return { dealer: (dealer + 1) % SEATS, streak: 0 };
  }

  /* 一將四圈：東風、南風、西風、北風圈。莊家從起莊輪一輪、回到起莊就換下一圈，連莊和流局不算；
   * 北風圈最後一位莊家下莊，這將就打完，下一將從起莊重新開始。
   * p = { jiang 第幾將, wind 圈風 0–3, startDealer 起莊位置, dealer, streak, hands 這將打了幾把 }
   * winner 是胡牌的位置，流局給 -1 */
  function advance(p, winner) {
    var nd = nextDealer(p.dealer, p.streak, winner);
    var out = {
      jiang: p.jiang, wind: p.wind, startDealer: p.startDealer, dealer: nd.dealer, streak: nd.streak,
      hands: p.hands + 1, newWind: false, newJiang: false
    };
    if (nd.dealer !== p.dealer && nd.dealer === p.startDealer) {
      out.wind += 1;
      out.newWind = true;
      if (out.wind >= SEATS) {
        out.jiang += 1;
        out.wind = 0;
        out.hands = 0;
        out.newJiang = true;
      }
    }
    return out;
  }

  // 例如「東風南」：東風圈，莊家是從起莊數來第二位（起莊算東）
  function roundName(wind, dealer, startDealer) {
    return WIND_NAMES[wind] + '風' + WIND_NAMES[(dealer - startDealer + SEATS) % SEATS];
  }

  return {
    PATTERNS: PATTERNS,
    GROUP_NAMES: GROUP_NAMES,
    MAX_CUSTOM: MAX_CUSTOM,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    patternsFor: patternsFor,
    isOn: isOn,
    PRESETS: PRESETS,
    applyPreset: applyPreset,
    matchPreset: matchPreset,
    cleanPicks: cleanPicks,
    togglePick: togglePick,
    countTai: countTai,
    dealerTai: dealerTai,
    settle: settle,
    nextDealer: nextDealer,
    advance: advance,
    roundName: roundName
  };
});
