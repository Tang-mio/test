/*
 * 麻將計錢（台灣十六張）：計分核心
 *
 * 每位付錢的人付「底 + 台數 × 每台」。
 * 莊家有關的支付（莊家胡，或莊家付錢）另外加莊家台：預設 1 台 + 連莊數 × 2（連 N 拉 N）。
 * 台數、莊家台、限台都可以在設定裡改，也能關掉或新增台型。
 * 炸胡（亂喊胡）：炸胡的人賠另外三家，每家付炸胡的底；跟莊家有關的那筆（莊家炸胡，或付給莊家）再加幾台。
 * 炸胡後預設莊家連莊（跟流局一樣），規則裡可以關掉，關掉時莊家和連莊都不變。
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
   * tiles：設定裡是一項，輸入時拆成一張張牌點：'dragon' 拆成中、發、白；'wind' 拆成東、南、西、北。
   */
  var PATTERNS = [
    { id: 'menQing', name: '門清', tai: 1, group: 'basic', note: '沒有吃、碰、明槓；又自摸時改算門清自摸' },
    { id: 'duTing', name: '獨聽', tai: 1, group: 'basic', note: '邊張、中洞、單吊' },
    { id: 'pingHu', name: '平胡', tai: 2, group: 'basic', only: 'fangQiang', note: '沒有字、沒有花、都是順子、聽兩面，胡別人打的' },
    { id: 'banQiu', name: '半求', tai: 1, group: 'basic', ex: 'qiu', only: 'ziMo', note: '全部吃碰完，自摸最後一張' },
    { id: 'quanQiu', name: '全求', tai: 2, group: 'basic', ex: 'qiu', only: 'fangQiang', note: '全部吃碰完，胡別人打的' },
    { id: 'gangShang', name: '槓上開花', tai: 1, group: 'basic', only: 'ziMo' },
    { id: 'haiDi', name: '海底撈月', tai: 1, group: 'basic', only: 'ziMo', note: '自摸最後一張牌' },
    { id: 'heDi', name: '河底撈魚', tai: 1, group: 'basic', only: 'fangQiang', note: '胡最後一張打出的牌' },
    { id: 'qiangGang', name: '搶槓', tai: 1, group: 'basic', only: 'fangQiang' },

    { id: 'sanYuan', name: '三元牌', tai: 1, group: 'honor', tiles: 'dragon', note: '中、發、白的刻子，每組都算' },
    { id: 'quanFeng', name: '圈風', tai: 1, group: 'honor', tiles: 'wind', note: '這一圈的風牌刻子' },
    { id: 'menFeng', name: '門風', tai: 1, group: 'honor', tiles: 'wind', note: '自己門風的風牌刻子' },
    { id: 'jianFeng', name: '見字', tai: 1, group: 'honor', tiles: 'wind', defaultOff: true,
      note: '不分圈風、門風，有風牌刻子就算（南部打法）' },
    { id: 'hua', name: '正花', tai: 1, group: 'honor', max: 2, flower: true, note: '和座位對應的花，每張都算' },
    { id: 'huaGang', name: '花槓', tai: 2, group: 'honor', max: 2, flower: true, note: '春夏秋冬或梅蘭竹菊一整組' },

    { id: 'pengPeng', name: '碰碰胡', tai: 4, group: 'big' },
    { id: 'sanAn', name: '三暗刻', tai: 2, group: 'big', ex: 'anKe' },
    { id: 'siAn', name: '四暗刻', tai: 5, group: 'big', ex: 'anKe' },
    { id: 'wuAn', name: '五暗刻', tai: 8, group: 'big', ex: 'anKe' },
    { id: 'hunYiSe', name: '混一色', tai: 4, group: 'big', ex: 'yiSe' },
    { id: 'qingYiSe', name: '清一色', tai: 8, group: 'big', ex: 'yiSe' },
    { id: 'ziYiSe', name: '字一色', tai: 16, group: 'big', ex: 'yiSe' },
    { id: 'xiaoSanYuan', name: '小三元', tai: 4, group: 'big', ex: 'sanYuanDa', clears: ['zhong', 'fa', 'bai'] },
    { id: 'daSanYuan', name: '大三元', tai: 8, group: 'big', ex: 'sanYuanDa', clears: ['zhong', 'fa', 'bai'] },
    { id: 'xiaoSiXi', name: '小四喜', tai: 8, group: 'big', ex: 'siXi', clears: ['fengE', 'fengS', 'fengW', 'fengN'] },
    { id: 'daSiXi', name: '大四喜', tai: 16, group: 'big', ex: 'siXi', clears: ['fengE', 'fengS', 'fengW', 'fengN'] },
    { id: 'baXian', name: '八仙過海', tai: 8, group: 'big', ex: 'huaAll', flower: true, clears: ['hua', 'huaGang'] },
    { id: 'qiQiangYi', name: '七搶一', tai: 8, group: 'big', ex: 'huaAll', flower: true, clears: ['hua', 'huaGang'] },
    { id: 'tianHu', name: '天胡', tai: 16, group: 'big', ex: 'tian', only: 'ziMo' },
    { id: 'diHu', name: '地胡', tai: 16, group: 'big', ex: 'tian', only: 'ziMo' },
    { id: 'renHu', name: '人胡', tai: 8, group: 'big', ex: 'tian', only: 'fangQiang' }
  ];
  var BY_ID = {};
  PATTERNS.forEach(function (p) { BY_ID[p.id] = p; });

  var GROUP_NAMES = { basic: '常見', honor: '字牌與花', big: '大牌', custom: '自訂' };
  // 輸入時的牌：三元牌和風牌刻子一張張點
  var DRAGONS = [{ id: 'zhong', name: '中' }, { id: 'fa', name: '發' }, { id: 'bai', name: '白' }];
  var WIND_IDS = ['fengE', 'fengS', 'fengW', 'fengN'];
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
    zhaHuBase: 20,          // 炸胡：賠每家多少
    zhaHuDealerTai: 1,      // 炸胡：跟莊家有關的那筆再加幾台
    zhaHuStreak: true,      // 炸胡後莊家連莊（關掉：莊家、連莊都不變）
    menFengBySeat: false,   // 門風照座位（坐東就是東風）；預設跟著莊家（莊家算東）
    reverseDraw: false,     // 逆抓（從牌牆左邊數、往逆時針抓）；預設順抓
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
      zhaHuBase: num(s.zhaHuBase, d.zhaHuBase, 0),
      zhaHuDealerTai: int(s.zhaHuDealerTai, d.zhaHuDealerTai, 0, 99),
      zhaHuStreak: s.zhaHuStreak === undefined ? d.zhaHuStreak : !!s.zhaHuStreak,
      menFengBySeat: !!s.menFengBySeat,
      reverseDraw: !!s.reverseDraw,
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

  /*
   * 輸入這把時能點的台型：三元牌拆成中、發、白，圈風／門風／見字合成東、南、西、北四張。
   * ctx = { roundWind 圈風, seatWind 胡的人的門風 }（0–3，不知道就省略）。
   * 風牌的台數照 ctx 算：是圈風加圈風台、是門風加門風台、開了見字就每張都算；都不是就 0 台。
   */
  function handPatterns(settings, ctx) {
    var s = normalizeSettings(settings);
    ctx = ctx || {};
    var all = patternsFor(s);
    var windParts = all.filter(function (p) { return p.tiles === 'wind'; });
    var list = [];
    all.forEach(function (p) {
      if (p.tiles === 'dragon') {
        DRAGONS.forEach(function (d) { list.push({ id: d.id, name: d.name, tai: p.tai, group: 'dragon', tile: 'dragon' }); });
      } else if (p !== windParts[0]) {
        if (p.tiles !== 'wind') list.push(p);
      } else {
        // 在第一個風牌台型的位置放東南西北
        WIND_NAMES.forEach(function (c, w) {
          var tai = 0;
          var why = [];
          windParts.forEach(function (q) {
            var hit = q.id === 'jianFeng' || (q.id === 'quanFeng' && ctx.roundWind === w) || (q.id === 'menFeng' && ctx.seatWind === w);
            if (!hit) return;
            tai += q.tai;
            if (q.id !== 'jianFeng') why.push(q.name);
          });
          list.push({ id: WIND_IDS[w], name: c, tai: tai, group: 'wind', tile: 'wind', why: why });
        });
      }
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
    var pats = byId(handPatterns(settings));
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
    var list = handPatterns(settings);
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

  // 胡牌者的台數（不含莊家台、還沒套用限台）；ctx 見 handPatterns
  function countTai(picks, method, extra, settings, ctx) {
    var s = normalizeSettings(settings);
    var list = handPatterns(s, ctx);
    var clean = cleanPicks(picks, method, s);
    var items = [];
    var tai = 0;
    list.forEach(function (p) {
      var n = clean[p.id];
      if (!n || !p.tai) return;
      tai += p.tai * n;
      var name = p.tile === 'wind' && p.why.length ? p.name + '（' + p.why.join('、') + '）' : p.name;
      items.push({ id: p.id, name: name + (n > 1 ? ' ×' + n : ''), tai: p.tai * n });
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

  // 炸胡：w 賠另外三家，每家付炸胡的底；莊家炸胡或付給莊家的那筆再加炸胡莊家台（不算連莊、不限台）
  function settleZhaHu(w, dealer, s) {
    var nets = [0, 0, 0, 0];
    var transfers = [];
    for (var i = 0; i < SEATS; i++) {
      if (i === w) continue;
      var extra = i === dealer || w === dealer ? s.zhaHuDealerTai : 0;
      var amount = round2(s.zhaHuBase + extra * s.perTai);
      nets[w] = round2(nets[w] - amount);
      nets[i] = round2(nets[i] + amount);
      transfers.push({
        from: w, to: i, tai: 0, dealerTai: extra, totalTai: extra, capped: false,
        base: s.zhaHuBase, perTai: s.perTai, amount: amount
      });
    }
    return {
      ready: true, settings: s, winner: w, method: 'zhaHu', tai: 0, dealerTai: s.zhaHuDealerTai,
      capped: false, transfers: transfers, nets: nets
    };
  }

  /*
   * hand = { dealer, streak, winner, method: 'ziMo' | 'fangQiang' | 'zhaHu', discarder, tai }
   * tai 是胡牌者的台數（countTai 的結果），限台在這裡套用。
   * 炸胡時 winner 是炸胡的人，他付錢給另外三家。
   * 回傳每筆支付與每人淨額；資料不完整時回傳 { ready: false, reason }
   */
  function settle(hand, settings) {
    var s = normalizeSettings(settings);
    var w = hand.winner;
    if (w == null || w < 0 || w >= SEATS) return { ready: false, reason: 'winner' };
    if (hand.method === 'zhaHu') return settleZhaHu(w, hand.dealer, s);
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

  // 「東風南」拆回 { wind: 0, offset: 1 }；看不懂就回傳 null
  function parseRound(name) {
    var m = /^([東南西北])風([東南西北])$/.exec(String(name || ''));
    return m ? { wind: WIND_NAMES.indexOf(m[1]), offset: WIND_NAMES.indexOf(m[2]) } : null;
  }

  // 這把記錄當時牌局進度的快照，刪掉這把時退回去
  var PROGRESS_KEYS = ['jiang', 'wind', 'startDealer', 'dealer', 'streak', 'hands'];
  function progressOf(m) {
    var p = {};
    PROGRESS_KEYS.forEach(function (k) { p[k] = m[k]; });
    p.seats = (m.seats || [0, 1, 2, 3]).slice();
    return p;
  }

  /*
   * 刪掉一把之後，牌局要退回這把開始前的樣子。
   * entry 有 prev（記錄時存的快照）就用它；沒有的舊紀錄用它的第幾將和圈風推算：
   * 前面連續同一圈同一位莊家的把數是連莊數（炸胡不算），同一將前面幾把是把數。
   * before 是這把之前的麻將紀錄（舊到新），startDealer 是現在的起莊。
   * 沒有快照的舊炸胡當時不改進度，回傳 null。
   */
  function progressBefore(entry, before, startDealer) {
    if (!entry) return null;
    if (entry.prev) return entry.prev;
    if (entry.kind === 'zhaHu') return null;
    var r = parseRound(entry.round);
    if (!r || !entry.jiang) return null;
    var streak = 0;
    for (var i = before.length - 1; i >= 0; i--) {
      var e = before[i];
      if (e.kind === 'zhaHu') continue;
      if (e.jiang !== entry.jiang || e.round !== entry.round) break;
      streak++;
    }
    var hands = before.filter(function (e) { return e.jiang === entry.jiang && e.kind !== 'zhaHu'; }).length;
    var start = Math.max(0, Math.min(SEATS - 1, Math.floor(Number(startDealer) || 0)));
    return {
      jiang: entry.jiang, wind: r.wind, startDealer: start, dealer: (start + r.offset) % SEATS,
      streak: streak, hands: hands, seats: null
    };
  }

  return {
    PATTERNS: PATTERNS,
    GROUP_NAMES: GROUP_NAMES,
    MAX_CUSTOM: MAX_CUSTOM,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    patternsFor: patternsFor,
    handPatterns: handPatterns,
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
    roundName: roundName,
    parseRound: parseRound,
    progressOf: progressOf,
    progressBefore: progressBefore
  };
});
