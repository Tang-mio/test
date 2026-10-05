/*
 * 麻將擲骰開門（台灣十六張）。
 *
 * 一副牌有花 144 張、沒花 136 張；四面牌牆各 18 墩（沒花 17 墩），一墩兩張。
 * 莊家擲三顆骰子，從莊家自己數起（逆時針：莊家、下家、對家、上家）數到點數那一家，
 * 從他面前牌牆的右邊數點數那麼多墩，這幾墩是牌尾（補花、槓從這裡拿），從下一墩開始抓。
 * 瀏覽器載入後是 window.MahjongWall，Node 用 require('./mahjong-wall.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MahjongWall = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RELATION = ['莊家', '下家', '對家', '上家']; // 相對莊家

  function totalTiles(flowers) { return flowers ? 144 : 136; }
  function stacksPerWall(flowers) { return totalTiles(flowers) / 8; }

  /*
   * 骰子點數 → 開門的位置。owner、startOwner 都是相對莊家：0 莊家、1 下家、2 對家、3 上家。
   * tail：牌尾有幾墩（從 owner 牌牆右邊數）；點數比一面牆多時，數完這面再接著數他上家的牌牆，
   * 這時 startOwner 是 owner 的上家，startStack 是那面牆從右邊數第幾墩。
   */
  function breakPoint(sum, flowers) {
    var per = stacksPerWall(flowers);
    var owner = (sum - 1) % 4;
    if (sum < per) return { sum: sum, per: per, owner: owner, tail: sum, startOwner: owner, startStack: sum + 1 };
    return { sum: sum, per: per, owner: owner, tail: sum, startOwner: (owner + 3) % 4, startStack: sum - per + 1 };
  }

  function rollDie(random) { return 1 + Math.floor((random || Math.random)() * 6); }

  return {
    RELATION: RELATION,
    totalTiles: totalTiles,
    stacksPerWall: stacksPerWall,
    breakPoint: breakPoint,
    rollDie: rollDie
  };
});
