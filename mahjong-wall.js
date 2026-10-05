/*
 * 麻將擲骰開門（台灣十六張）。
 *
 * 一副牌有花 144 張、沒花 136 張；四面牌牆各 18 墩（沒花 17 墩），一墩兩張。
 * 莊家擲三顆骰子，從莊家自己數起（逆時針：莊家、下家、對家、上家）數到點數那一家，
 * 從他面前的牌牆數點數那麼多墩，這幾墩是牌尾（補花、槓從這裡拿），從下一墩開始抓。
 * 順抓：從那一家看的右邊數，往順時針方向抓；逆抓：從左邊數，往逆時針方向抓。
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
   * reverse 是逆抓。from 是從牌牆哪一邊數（'right' 順抓、'left' 逆抓，都是從那一家看）。
   * tail：牌尾有幾墩；點數比一面牆多時，數完這面再接著數下一面（順抓是他上家的、逆抓是他下家的），
   * 這時 startOwner 是那一家，startStack 是那面牆從同一邊數第幾墩。
   */
  function breakPoint(sum, flowers, reverse) {
    var per = stacksPerWall(flowers);
    var owner = (sum - 1) % 4;
    var from = reverse ? 'left' : 'right';
    if (sum < per) return { sum: sum, per: per, owner: owner, from: from, tail: sum, startOwner: owner, startStack: sum + 1 };
    var next = reverse ? (owner + 1) % 4 : (owner + 3) % 4;
    return { sum: sum, per: per, owner: owner, from: from, tail: sum, startOwner: next, startStack: sum - per + 1 };
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
