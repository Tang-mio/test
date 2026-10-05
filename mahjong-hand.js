/*
 * 胡牌計算機：點手上還沒亮出來的牌，算胡什麼牌、打哪張、還差幾張聽牌。
 *
 * 牌的編號 0–33：0–8 一到九萬、9–17 一到九筒、18–26 一到九條、27–30 東南西北、31–33 中發白。
 * 吃、碰、槓亮出來的已經是完整的一組，所以只看手上的牌：
 *   1、4、7、10、13、16 張 → 聽哪幾張；還沒聽就算還差幾張、摸哪些牌會更接近
 *   多一張（2、5、8…17 張）→ 胡了沒；沒胡就列出打哪張、打了聽什麼
 * mode 16 是台灣十六張（預設，五組加一對）；13 是十三張，另外算七對、十三么。
 * tilePatterns：胡牌的 17 張看得出來的台型（碰碰胡、一色、中發白、東南西北、三元、四喜），給算台數用。
 * 「還差幾張」用向聽數：0 是聽牌，-1 是胡了，1 是再摸到一張有用的就聽。
 * 瀏覽器載入後是 window.MahjongHand，Node 用 require('./mahjong-hand.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MahjongHand = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUITS = ['萬', '筒', '條'];
  var HONORS = ['東', '南', '西', '北', '中', '發', '白'];
  var ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]; // 十三么的十三種牌
  var SPECIAL_NAME = { pairs: '七對', orphans: '十三么' };

  function isHonor(t) { return t >= 27; }
  function suitOf(t) { return t < 27 ? Math.floor(t / 9) : -1; }
  function rankOf(t) { return t < 27 ? t % 9 + 1 : 0; }
  function maxTiles(mode) { return mode === 13 ? 14 : 17; }

  // 例如「3萬」「東」
  function tileName(t) { return t < 27 ? rankOf(t) + SUITS[suitOf(t)] : HONORS[t - 27]; }

  function countsOf(tiles) {
    var c = [];
    for (var i = 0; i < 34; i++) c.push(0);
    tiles.forEach(function (t) { c[t]++; });
    return c;
  }

  /* ---------- 一般牌型（幾組加一對）的向聽數 ----------
   * 每種花色分開拆：能湊出幾組（m）、幾個搭子（t，差一張成組）、有沒有眼（p），
   * 各花色的結果組起來，向聽數 = 2 × 要幾組 − 2m − t − p（搭子最多算到補滿組數）。 */

  // 只留下不會被別的拆法完全贏過的 [m, t, p]
  function prune(list) {
    var out = [];
    list.forEach(function (x) {
      for (var i = 0; i < out.length; i++) {
        var y = out[i];
        if (y[0] >= x[0] && y[1] >= x[1] && y[2] >= x[2]) return;
      }
      out = out.filter(function (y) { return !(x[0] >= y[0] && x[1] >= y[1] && x[2] >= y[2]); });
      out.push(x);
    });
    return out;
  }

  var memo = {};
  // 一種花色（9 格，字牌 7 格不能連）所有拆法
  function groupOptions(arr, seq) {
    var a = arr.slice();
    var L = a.length;
    var tag = seq ? 's' : 'h';
    function rec(i) {
      while (i < L && !a[i]) i++;
      if (i >= L) return [[0, 0, 0]];
      var key = tag + i + ':' + a.slice(i).join('');
      if (memo[key]) return memo[key];
      var res = [];
      var add = function (list, dm, dt, dp) {
        list.forEach(function (r) { if (!(dp && r[2])) res.push([r[0] + dm, r[1] + dt, r[2] + dp]); });
      };
      if (a[i] >= 3) { a[i] -= 3; add(rec(i), 1, 0, 0); a[i] += 3; }
      if (seq && i <= 6 && a[i + 1] && a[i + 2]) {
        a[i]--; a[i + 1]--; a[i + 2]--;
        add(rec(i), 1, 0, 0);
        a[i]++; a[i + 1]++; a[i + 2]++;
      }
      if (a[i] >= 2) {
        a[i] -= 2;
        var sub = rec(i);
        add(sub, 0, 0, 1); // 當眼
        add(sub, 0, 1, 0); // 當對子搭子
        a[i] += 2;
      }
      if (seq && i <= 7 && a[i + 1]) { a[i]--; a[i + 1]--; add(rec(i), 0, 1, 0); a[i]++; a[i + 1]++; }
      if (seq && i <= 6 && a[i + 2]) { a[i]--; a[i + 2]--; add(rec(i), 0, 1, 0); a[i]++; a[i + 2]++; }
      a[i]--; add(rec(i), 0, 0, 0); a[i]++; // 孤張
      res = prune(res);
      memo[key] = res;
      return res;
    }
    return rec(0);
  }

  function standardShanten(c, sets) {
    var groups = [[c.slice(0, 9), true], [c.slice(9, 18), true], [c.slice(18, 27), true], [c.slice(27, 34), false]];
    var combos = [[0, 0, 0]];
    groups.forEach(function (g) {
      var opts = groupOptions(g[0], g[1]);
      var next = [];
      combos.forEach(function (x) {
        opts.forEach(function (o) { if (!(x[2] && o[2])) next.push([x[0] + o[0], x[1] + o[1], x[2] + o[2]]); });
      });
      combos = prune(next);
    });
    var best = 2 * sets;
    combos.forEach(function (x) {
      var m = Math.min(x[0], sets);
      var t = Math.min(x[1], sets - m);
      best = Math.min(best, 2 * sets - 2 * m - t - x[2]);
    });
    return best;
  }

  // 七對（十三張）：七種對子
  function pairsShanten(c) {
    var pairs = 0;
    var kinds = 0;
    c.forEach(function (n) { if (n) kinds++; if (n >= 2) pairs++; });
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  // 十三么（十三張）：一九萬筒條、東南西北中發白各一張，再多一張湊對
  function orphansShanten(c) {
    var kinds = 0;
    var pair = 0;
    ORPHANS.forEach(function (t) { if (c[t]) kinds++; if (c[t] >= 2) pair = 1; });
    return 13 - kinds - pair;
  }

  // 向聽數：{ s, kind }；kind 是 'std'、'pairs'（七對）或 'orphans'（十三么），一樣好時算一般牌型
  function shanten(tiles, mode) {
    var c = countsOf(tiles);
    var best = { s: standardShanten(c, Math.floor(tiles.length / 3)), kind: 'std' };
    if (mode === 13 && tiles.length >= 13) {
      var p = pairsShanten(c);
      if (p < best.s) best = { s: p, kind: 'pairs' };
      var o = orphansShanten(c);
      if (o < best.s) best = { s: o, kind: 'orphans' };
    }
    return best;
  }

  function isWin(tiles, mode) { return tiles.length % 3 === 2 && shanten(tiles, mode).s === -1; }

  // 聽哪幾張：left 是還剩幾張（手上已經有的不算）
  function waits(tiles, mode) {
    var c = countsOf(tiles);
    var out = [];
    for (var t = 0; t < 34; t++) {
      if (shanten(tiles.concat([t]), mode).s === -1) out.push({ tile: t, left: Math.max(0, 4 - c[t]) });
    }
    return out;
  }

  // 還沒聽牌時，摸到哪些牌會更接近（進張）
  function accepts(tiles, mode) {
    var c = countsOf(tiles);
    var now = shanten(tiles, mode).s;
    var out = [];
    for (var t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      if (shanten(tiles.concat([t]), mode).s < now) out.push({ tile: t, left: 4 - c[t] });
    }
    return out;
  }

  function sumLeft(list) { return list.reduce(function (s, x) { return s + x.left; }, 0); }

  // 多一張時：打每一種牌之後的樣子，聽牌的排前面、可以胡的張數多的排前面
  function discards(tiles, mode) {
    var seen = {};
    var out = [];
    tiles.forEach(function (d) {
      if (seen[d]) return;
      seen[d] = true;
      var rest = tiles.slice();
      rest.splice(rest.indexOf(d), 1);
      var sh = shanten(rest, mode);
      var list = sh.s === 0 ? waits(rest, mode) : accepts(rest, mode);
      out.push({ tile: d, shanten: sh.s, tiles: list, live: sumLeft(list) });
    });
    return out.sort(function (a, b) { return a.shanten - b.shanten || b.live - a.live || a.tile - b.tile; });
  }

  /*
   * 看這手牌現在怎樣：
   *   { kind: 'empty' }                          還沒點
   *   { kind: 'over', tile }                     同一張牌超過 4 張
   *   { kind: 'need', need: 1 }                  張數不對，再點一張
   *   { kind: 'waits', waits, live, special }    聽牌：聽哪幾張、還有幾張可以胡（live 0 是空聽）
   *   { kind: 'far', shanten, accepts, live }    還沒聽：還差幾張、摸哪些牌會更接近
   *   { kind: 'win', special }                   多一張而且胡了；special 是七對、十三么（一般牌型是 null）
   *   { kind: 'discard', options }               多一張還沒胡：打哪張、打了怎樣
   */
  function check(tiles, mode) {
    mode = mode === 13 ? 13 : 16;
    var n = tiles.length;
    if (!n) return { kind: 'empty' };
    var c = countsOf(tiles);
    for (var t = 0; t < 34; t++) if (c[t] > 4) return { kind: 'over', tile: t };
    if (n % 3 === 0) return { kind: 'need', need: 1 };
    var sh = shanten(tiles, mode);
    if (n % 3 === 2) {
      if (sh.s === -1) return { kind: 'win', special: SPECIAL_NAME[sh.kind] || null };
      return { kind: 'discard', options: discards(tiles, mode) };
    }
    if (sh.s === 0) {
      var w = waits(tiles, mode);
      return { kind: 'waits', waits: w, live: sumLeft(w), special: SPECIAL_NAME[sh.kind] || null };
    }
    var a = accepts(tiles, mode);
    return { kind: 'far', shanten: sh.s, accepts: a, live: sumLeft(a) };
  }

  function sortTiles(tiles) { return tiles.slice().sort(function (a, b) { return a - b; }); }

  /* ---------- 看牌就知道的台型（算台數用） ---------- */

  // 看牌就能判斷的台型；門清、獨聽、暗刻、自摸、花牌這些看牌看不出來
  var TILE_PATTERN_IDS = ['pengPeng', 'hunYiSe', 'qingYiSe', 'ziYiSe', 'zhong', 'fa', 'bai', 'xiaoSanYuan', 'daSanYuan',
    'fengE', 'fengS', 'fengW', 'fengN', 'xiaoSiXi', 'daSiXi'];
  var DRAGON_IDS = ['zhong', 'fa', 'bai'];
  var WIND_IDS = ['fengE', 'fengS', 'fengW', 'fengN'];

  // 胡牌的每一種拆法：一對眼加其餘全是順子（seq）或刻子（tri）
  function winningSplits(tiles) {
    var c = countsOf(tiles);
    var found = [];
    var acc = [];
    function sets(i) {
      while (i < 34 && !c[i]) i++;
      if (i === 34) { found.push(acc.slice()); return; }
      if (c[i] >= 3) {
        c[i] -= 3; acc.push({ type: 'tri', tile: i });
        sets(i);
        acc.pop(); c[i] += 3;
      }
      if (i < 27 && rankOf(i) <= 7 && c[i + 1] && c[i + 2]) {
        c[i]--; c[i + 1]--; c[i + 2]--; acc.push({ type: 'seq', tile: i });
        sets(i);
        acc.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
      }
    }
    var out = [];
    for (var p = 0; p < 34; p++) {
      if (c[p] < 2) continue;
      c[p] -= 2;
      found = [];
      sets(0);
      found.forEach(function (list) { out.push({ pair: p, sets: list }); });
      c[p] += 2;
    }
    return out;
  }

  // 每一種拆法看得出來的台型 { picks, pair, sets }；picks 用 Mahjong 台型的 id，給 countTai 選台數最多的
  function tilePatterns(tiles) {
    return winningSplits(tiles).map(function (w) {
      var picks = {};
      var tris = w.sets.filter(function (x) { return x.type === 'tri'; });
      if (tris.length === w.sets.length) picks.pengPeng = 1;
      var all = w.sets.map(function (x) { return x.tile; }).concat([w.pair]);
      var honors = all.some(isHonor);
      var suits = {};
      all.forEach(function (t) { if (!isHonor(t)) suits[suitOf(t)] = true; });
      var n = Object.keys(suits).length;
      if (!n) picks.ziYiSe = 1;
      else if (n === 1) picks[honors ? 'hunYiSe' : 'qingYiSe'] = 1;
      var dragons = tris.filter(function (x) { return x.tile >= 31; });
      if (dragons.length === 3) picks.daSanYuan = 1;
      else if (dragons.length === 2 && w.pair >= 31) picks.xiaoSanYuan = 1;
      else dragons.forEach(function (x) { picks[DRAGON_IDS[x.tile - 31]] = 1; });
      var winds = tris.filter(function (x) { return x.tile >= 27 && x.tile <= 30; });
      var pairWind = w.pair >= 27 && w.pair <= 30;
      if (winds.length === 4) picks.daSiXi = 1;
      else if (winds.length === 3 && pairWind) picks.xiaoSiXi = 1;
      else winds.forEach(function (x) { picks[WIND_IDS[x.tile - 27]] = 1; });
      return { picks: picks, pair: w.pair, sets: w.sets };
    });
  }

  // 一組牌寫成字，例如「123萬」「東東東」「眼 99條」
  function setText(set) {
    if (set.type === 'seq') return rankOf(set.tile) + '' + (rankOf(set.tile) + 1) + (rankOf(set.tile) + 2) + SUITS[suitOf(set.tile)];
    var n = set.type === 'pair' ? 2 : 3;
    if (isHonor(set.tile)) return new Array(n + 1).join(HONORS[set.tile - 27]);
    return new Array(n + 1).join(String(rankOf(set.tile))) + SUITS[suitOf(set.tile)];
  }

  return {
    SUITS: SUITS,
    HONORS: HONORS,
    maxTiles: maxTiles,
    tileName: tileName,
    rankOf: rankOf,
    suitOf: suitOf,
    isHonor: isHonor,
    shanten: shanten,
    isWin: isWin,
    waits: waits,
    accepts: accepts,
    discards: discards,
    check: check,
    sortTiles: sortTiles,
    TILE_PATTERN_IDS: TILE_PATTERN_IDS,
    winningSplits: winningSplits,
    tilePatterns: tilePatterns,
    setText: setText
  };
});
