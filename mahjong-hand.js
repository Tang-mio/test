/*
 * 胡什麼牌（台灣十六張）：點手上還沒亮出來的牌，算出胡哪幾張。
 *
 * 牌的編號 0–33：0–8 一到九萬、9–17 一到九筒、18–26 一到九條、27–30 東南西北、31–33 中發白。
 * 吃、碰、槓亮出來的已經是完整的一組，不影響胡什麼，所以只看手上的牌：
 * 1、4、7、10、13、16 張時算聽哪幾張；多一張（2、5、8…17 張）時看是不是已經胡了。
 * 瀏覽器載入後是 window.MahjongHand，Node 用 require('./mahjong-hand.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MahjongHand = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUITS = ['萬', '筒', '條'];
  var HONORS = ['東', '南', '西', '北', '中', '發', '白'];
  var MAX_TILES = 17;

  function isHonor(t) { return t >= 27; }
  function suitOf(t) { return t < 27 ? Math.floor(t / 9) : -1; }
  function rankOf(t) { return t < 27 ? t % 9 + 1 : 0; }

  // 例如「3萬」「東」
  function tileName(t) { return t < 27 ? rankOf(t) + SUITS[suitOf(t)] : HONORS[t - 27]; }

  function countsOf(tiles) {
    var c = [];
    for (var i = 0; i < 34; i++) c.push(0);
    tiles.forEach(function (t) { c[t]++; });
    return c;
  }

  // counts 能不能全部拆成順子或刻子
  function allSets(c) {
    var i = 0;
    while (i < 34 && !c[i]) i++;
    if (i === 34) return true;
    if (c[i] >= 3) {
      c[i] -= 3;
      var ok = allSets(c);
      c[i] += 3;
      if (ok) return true;
    }
    if (i < 27 && rankOf(i) <= 7 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      var ok2 = allSets(c);
      c[i]++; c[i + 1]++; c[i + 2]++;
      if (ok2) return true;
    }
    return false;
  }

  // 胡了沒：一對眼加其餘全是順子刻子
  function isWin(tiles) {
    if (tiles.length % 3 !== 2) return false;
    var c = countsOf(tiles);
    for (var p = 0; p < 34; p++) {
      if (c[p] < 2) continue;
      c[p] -= 2;
      var ok = allSets(c);
      c[p] += 2;
      if (ok) return true;
    }
    return false;
  }

  // 聽哪幾張：每張再加一張看會不會胡；left 是這張還剩幾張（手上已經有的不算）
  function waits(tiles) {
    var c = countsOf(tiles);
    var out = [];
    for (var t = 0; t < 34; t++) {
      if (isWin(tiles.concat([t]))) out.push({ tile: t, left: Math.max(0, 4 - c[t]) });
    }
    return out;
  }

  /*
   * 看這手牌現在怎樣：
   *   { kind: 'empty' }                    還沒點
   *   { kind: 'need', need }               還差幾張才能算（張數要是 1、4、7、10、13、16）
   *   { kind: 'waits', waits, live }       聽哪幾張；live 是還摸得到的張數合計（0 就是空聽）
   *   { kind: 'none' }                     還沒聽牌
   *   { kind: 'win' } / { kind: 'extra' }  多一張時：已經胡了／還沒胡，要先打掉一張
   *   { kind: 'over', tile }               同一張牌超過 4 張
   */
  function check(tiles) {
    var n = tiles.length;
    if (!n) return { kind: 'empty' };
    var c = countsOf(tiles);
    for (var t = 0; t < 34; t++) if (c[t] > 4) return { kind: 'over', tile: t };
    if (n % 3 === 2) return { kind: isWin(tiles) ? 'win' : 'extra' };
    if (n % 3 === 0) return { kind: 'need', need: 1 };
    var w = waits(tiles);
    if (!w.length) return { kind: 'none' };
    return { kind: 'waits', waits: w, live: w.reduce(function (s, x) { return s + x.left; }, 0) };
  }

  function sortTiles(tiles) { return tiles.slice().sort(function (a, b) { return a - b; }); }

  return {
    SUITS: SUITS,
    HONORS: HONORS,
    MAX_TILES: MAX_TILES,
    tileName: tileName,
    rankOf: rankOf,
    suitOf: suitOf,
    isHonor: isHonor,
    isWin: isWin,
    waits: waits,
    check: check,
    sortTiles: sortTiles
  };
});
