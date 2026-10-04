/*
 * 麻將牌牆（台灣十六張）：擲骰開門、牌牆還剩幾張。
 *
 * 一副牌有花 144 張、沒花 136 張；四面牌牆各 18 墩（沒花 17 墩），一墩兩張。
 * 開門：莊家擲三顆骰子，從莊家自己數起（逆時針：莊家、下家、對家、上家）數到點數那一家，
 * 從他面前牌牆的右邊數點數那麼多墩，這幾墩是牌尾（補花、槓從這裡拿），從下一墩開始抓。
 * 配牌：每人 16 張，莊家多拿一張，共 65 張；之後每摸一張（含補花、槓）牌牆少一張，
 * 留最後幾張（預設 16 張）不摸，摸到只剩留牌就流局。
 * 瀏覽器載入後是 window.MahjongWall，Node 用 require('./mahjong-wall.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MahjongWall = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEAL = 16 * 4 + 1;
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

  /*
   * 牌牆現況。drawn 是配牌後又摸了幾張（含補花、槓），reserve 是留幾張不摸。
   * canDraw 還能摸幾張；canDraw 是 1 時下一張就是海底，0 就沒牌了（沒人胡就流局）。
   */
  function wallStatus(flowers, drawn, reserve) {
    var total = totalTiles(flowers);
    var afterDeal = total - DEAL;
    var left = Math.max(0, afterDeal - Math.max(0, drawn || 0));
    var keep = Math.max(0, reserve || 0);
    var canDraw = Math.max(0, left - keep);
    return {
      total: total, dealt: DEAL, afterDeal: afterDeal, left: left, reserve: keep, canDraw: canDraw,
      rounds: Math.floor(canDraw / 4), last: canDraw === 1, empty: canDraw === 0
    };
  }

  function rollDie(random) { return 1 + Math.floor((random || Math.random)() * 6); }

  return {
    DEAL: DEAL,
    RELATION: RELATION,
    totalTiles: totalTiles,
    stacksPerWall: stacksPerWall,
    breakPoint: breakPoint,
    wallStatus: wallStatus,
    rollDie: rollDie
  };
});
