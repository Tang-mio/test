/*
 * 麻將牌型計算器（台灣十六張）：輸入手上的牌，自動拆牌、找出牌型，再用 Mahjong.countTai 算台。
 *
 * 牌的編號 0–33：0–8 一到九萬、9–17 一到九筒、18–26 一到九條、27–30 東南西北、31–33 中發白。
 * 花牌 0–7：春夏秋冬、梅蘭竹菊；春、梅是東，夏、蘭是南，秋、竹是西，冬、菊是北。
 *
 * hand = {
 *   concealed: [牌…]                手上沒亮出來的牌（不含胡的那張）
 *   melds: [{ type, tile }]          亮出來的：'chi' 吃（tile 是順子最小那張）、'pon' 碰、'kong' 明槓、'ankong' 暗槓
 *   win: 牌                          胡的那張
 *   flowers: [花…]
 *   method: 'ziMo' | 'fangQiang'
 *   roundWind, seatWind: 0–3         圈風、胡的人的門風
 *   extras: { 台型 id: 1 }           看牌看不出來的：槓上開花、海底撈月、河底撈魚、搶槓、天胡、地胡、人胡、七搶一
 * }
 * 瀏覽器載入後是 window.MahjongHand（要先載入 mahjong.js），Node 用 require('./mahjong-hand.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mahjong.js'));
  else root.MahjongHand = factory(root.Mahjong);
})(typeof self !== 'undefined' ? self : this, function (MJ) {
  'use strict';

  var SUITS = ['萬', '筒', '條'];
  var HONORS = ['東', '南', '西', '北', '中', '發', '白'];
  var FLOWERS = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];
  var NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var HAND_SIZE = 16;
  var SETS = 5;
  var EXTRA_IDS = ['gangShang', 'haiDi', 'heDi', 'qiangGang', 'tianHu', 'diHu', 'renHu', 'qiQiangYi'];
  var DRAGON_PICK = { 31: 'zhong', 32: 'fa', 33: 'bai' };
  var WIND_PICK = { 27: 'fengE', 28: 'fengS', 29: 'fengW', 30: 'fengN' };

  function isHonor(t) { return t >= 27; }
  function isWind(t) { return t >= 27 && t <= 30; }
  function isDragon(t) { return t >= 31; }
  function suitOf(t) { return t < 27 ? Math.floor(t / 9) : -1; }
  function rankOf(t) { return t < 27 ? t % 9 + 1 : 0; }

  // 例如「3萬」「東」
  function tileName(t) { return t < 27 ? rankOf(t) + SUITS[suitOf(t)] : HONORS[t - 27]; }

  function meldTiles(m) {
    if (m.type === 'chi') return [m.tile, m.tile + 1, m.tile + 2];
    if (m.type === 'pon') return [m.tile, m.tile, m.tile];
    return [m.tile, m.tile, m.tile, m.tile];
  }
  function canChi(t) { return t < 27 && rankOf(t) <= 7; }

  function emptyCounts() { var c = []; for (var i = 0; i < 34; i++) c.push(0); return c; }
  function countsOf(tiles) { var c = emptyCounts(); tiles.forEach(function (t) { c[t]++; }); return c; }

  // 每種牌一共用了幾張（手牌、亮出來的、胡的那張）
  function usage(hand) {
    var c = countsOf(hand.concealed || []);
    (hand.melds || []).forEach(function (m) { meldTiles(m).forEach(function (t) { c[t]++; }); });
    if (hand.win != null) c[hand.win]++;
    return c;
  }

  // 把 counts 全部拆成順子或刻子，回傳所有拆法；拆不完回傳 []
  function splitSets(c) {
    var i = 0;
    while (i < 34 && !c[i]) i++;
    if (i === 34) return [[]];
    var out = [];
    if (c[i] >= 3) {
      c[i] -= 3;
      splitSets(c).forEach(function (rest) { out.push([{ type: 'tri', tile: i }].concat(rest)); });
      c[i] += 3;
    }
    if (i < 27 && rankOf(i) <= 7 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      splitSets(c).forEach(function (rest) { out.push([{ type: 'seq', tile: i }].concat(rest)); });
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    return out;
  }

  // 拆成一對眼 + 其餘全是順子刻子；回傳 [{ pair, sets }]
  function decompose(tiles) {
    var c = countsOf(tiles);
    var out = [];
    for (var p = 0; p < 34; p++) {
      if (c[p] < 2) continue;
      c[p] -= 2;
      splitSets(c).forEach(function (sets) { out.push({ pair: p, sets: sets }); });
      c[p] += 2;
    }
    return out;
  }

  // 聽哪些牌：16 張再加哪一張可以胡
  function waitsOf(hand) {
    var used = usage({ concealed: hand.concealed, melds: hand.melds });
    var out = [];
    for (var t = 0; t < 34; t++) {
      if (used[t] >= 4) continue;
      if (decompose(hand.concealed.concat([t])).length) out.push(t);
    }
    return out;
  }

  // 胡的那張在這組裡是什麼聽法
  function waitShape(set, win) {
    if (set.type === 'pair') return 'single';
    if (set.type === 'tri') return 'shanpon';
    var r = rankOf(set.tile);
    if (win === set.tile + 1) return 'middle';
    if ((win === set.tile + 2 && r === 1) || (win === set.tile && r === 7)) return 'edge';
    return 'sides';
  }

  /*
   * 算這副牌。回傳
   *   { ok: false, reason, need }  還不能算（need 是還差幾張）
   *   { ok: true, tai, items, picks, sets, pair, waits, shape }
   * settings 是 Mahjong 的規則設定（關掉的台型不算、台數照設定）。
   */
  function analyze(hand, settings) {
    hand = hand || {};
    var concealed = (hand.concealed || []).slice();
    var melds = hand.melds || [];
    var size = concealed.length + melds.length * 3;
    if (size < HAND_SIZE) return { ok: false, reason: 'short', need: HAND_SIZE - size };
    if (size > HAND_SIZE) return { ok: false, reason: 'long', need: HAND_SIZE - size };
    if (hand.win == null) return { ok: false, reason: 'win' };
    var used = usage(hand);
    for (var t = 0; t < 34; t++) if (used[t] > 4) return { ok: false, reason: 'over', tile: t };

    var full = concealed.concat([hand.win]);
    var ways = decompose(full);
    if (!ways.length) return { ok: false, reason: 'notWin' };

    var s = MJ.normalizeSettings(settings);
    var ctx = { roundWind: hand.roundWind, seatWind: hand.seatWind };
    var method = hand.method === 'fangQiang' ? 'fangQiang' : 'ziMo';
    var waits = waitsOf({ concealed: concealed, melds: melds });
    var flowers = (hand.flowers || []).filter(function (f, i, a) { return f >= 0 && f < 8 && a.indexOf(f) === i; });
    var exposed = melds.filter(function (m) { return m.type !== 'ankong'; }).length;
    var meldSets = melds.map(function (m) {
      return { type: m.type === 'chi' ? 'seq' : 'tri', tile: m.tile, meld: m.type, concealed: m.type === 'ankong' };
    });

    var best = null;
    ways.forEach(function (way) {
      // 胡的那張可能落在眼、或任何一組有這張牌的順子刻子
      var roles = [{ type: 'pair', tile: way.pair, idx: -1 }];
      way.sets.forEach(function (st, idx) {
        var has = st.type === 'tri' ? st.tile === hand.win : hand.win >= st.tile && hand.win <= st.tile + 2;
        if (has) roles.push({ type: st.type, tile: st.tile, idx: idx });
      });
      if (way.pair !== hand.win) roles.shift();
      roles.forEach(function (role) {
        var shape = waitShape(role, hand.win);
        var sets = way.sets.map(function (st, idx) {
          // 放槍胡成刻子的那組算明刻
          return { type: st.type, tile: st.tile, concealed: !(method === 'fangQiang' && idx === role.idx && st.type === 'tri') };
        }).concat(meldSets);
        var picks = patternPicks(sets, way.pair, shape, waits, exposed, flowers, method, hand, s);
        var r = MJ.countTai(picks, method, 0, s, ctx);
        if (!best || r.tai > best.tai) {
          best = { ok: true, tai: r.tai, items: r.items, picks: MJ.cleanPicks(picks, method, s), sets: sets, pair: way.pair, waits: waits, shape: shape };
        }
      });
    });
    return best;
  }

  function patternPicks(sets, pair, shape, waits, exposed, flowers, method, hand, s) {
    var picks = {};
    var all = sets.map(function (x) { return x.tile; }).concat([pair]);
    var seqs = sets.filter(function (x) { return x.type === 'seq'; });
    var tris = sets.filter(function (x) { return x.type === 'tri'; });
    var hasHonor = all.some(isHonor);
    var suits = {};
    sets.forEach(function (x) { if (!isHonor(x.tile)) suits[suitOf(x.tile)] = true; });
    if (!isHonor(pair)) suits[suitOf(pair)] = true;
    var nSuits = Object.keys(suits).length;

    if (!exposed) picks.menQing = 1;
    if (waits.length === 1) picks.duTing = 1;
    if (exposed === SETS && shape === 'single') picks[method === 'ziMo' ? 'banQiu' : 'quanQiu'] = 1;
    if (!tris.length && !hasHonor && !flowers.length && shape === 'sides' && waits.length > 1) picks.pingHu = 1;
    if (!seqs.length) picks.pengPeng = 1;

    var an = tris.filter(function (x) { return x.concealed; }).length;
    if (an >= 5) picks.wuAn = 1;
    else if (an === 4) picks.siAn = 1;
    else if (an === 3) picks.sanAn = 1;

    if (!nSuits) picks.ziYiSe = 1;
    else if (nSuits === 1) picks[hasHonor ? 'hunYiSe' : 'qingYiSe'] = 1;

    var dragonTris = tris.filter(function (x) { return isDragon(x.tile); });
    if (dragonTris.length === 3) picks.daSanYuan = 1;
    else if (dragonTris.length === 2 && isDragon(pair)) picks.xiaoSanYuan = 1;
    else dragonTris.forEach(function (x) { picks[DRAGON_PICK[x.tile]] = 1; });

    var windTris = tris.filter(function (x) { return isWind(x.tile); });
    if (windTris.length === 4) picks.daSiXi = 1;
    else if (windTris.length === 3 && isWind(pair)) picks.xiaoSiXi = 1;
    else windTris.forEach(function (x) { picks[WIND_PICK[x.tile]] = 1; });

    if (flowers.length === 8) picks.baXian = 1;
    else {
      var own = flowers.filter(function (f) { return f % 4 === hand.seatWind; }).length;
      if (own) picks.hua = own;
      var gang = [0, 4].filter(function (start) {
        return [0, 1, 2, 3].every(function (k) { return flowers.indexOf(start + k) !== -1; });
      }).length;
      if (gang) picks.huaGang = gang;
    }

    var extras = hand.extras || {};
    EXTRA_IDS.forEach(function (id) { if (extras[id]) picks[id] = 1; });
    if (picks.qiQiangYi) { delete picks.hua; delete picks.huaGang; }
    return picks;
  }

  // 把一組牌寫成字，例如「123萬」「東東東」「77條」
  function setText(set) {
    if (set.type === 'seq') return rankOf(set.tile) + '' + (rankOf(set.tile) + 1) + (rankOf(set.tile) + 2) + SUITS[suitOf(set.tile)];
    var n = set.type === 'pair' ? 2 : set.meld === 'kong' || set.meld === 'ankong' ? 4 : 3;
    if (isHonor(set.tile)) return new Array(n + 1).join(HONORS[set.tile - 27]);
    return new Array(n + 1).join(String(rankOf(set.tile))) + SUITS[suitOf(set.tile)];
  }

  // 依花色、點數排好
  function sortTiles(tiles) { return tiles.slice().sort(function (a, b) { return a - b; }); }

  return {
    SUITS: SUITS,
    HONORS: HONORS,
    FLOWERS: FLOWERS,
    NUMS: NUMS,
    HAND_SIZE: HAND_SIZE,
    EXTRA_IDS: EXTRA_IDS,
    tileName: tileName,
    rankOf: rankOf,
    suitOf: suitOf,
    isHonor: isHonor,
    canChi: canChi,
    meldTiles: meldTiles,
    usage: usage,
    decompose: decompose,
    waitsOf: waitsOf,
    analyze: analyze,
    setText: setText,
    sortTiles: sortTiles
  };
});
