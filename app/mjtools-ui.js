/* 麻將小工具：擲骰子，告訴你從誰的牌牆、第幾墩開始抓（可以隨機擲，也可以自己輸入擲出幾點） */
(function () {
  'use strict';
  var T = window.TableApp;
  var W = window.MahjongWall;
  var $ = T.$, esc = T.esc;
  var POS = ['at-bottom', 'at-right', 'at-top', 'at-left'];
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  var dice = null;  // 隨機擲出來的三顆骰子；自己輸入點數時是 null
  var sum = null;   // 點數 3–18
  var rollTimer = null;

  function mj() { return T.state.mahjong; }
  function flowersOn() { return mj().settings.flowers; }
  function seated() { return !!mj().seatsAt; }
  function meWind() { var me = T.me(); return me == null ? -1 : mj().seats.indexOf(me); }

  function dieHtml(v) {
    if (v == null) return '<span class="die blank" aria-hidden="true">?</span>';
    var cells = '';
    for (var k = 0; k < 9; k++) cells += '<i' + (PIPS[v].indexOf(k) !== -1 ? ' class="on"' : '') + '></i>';
    return '<span class="die' + (v === 1 ? ' one' : '') + (rollTimer ? ' rolling' : '') + '" aria-hidden="true">' + cells + '</span>';
  }

  // 相對莊家的稱呼；抓過位就用名字
  function whoOf(rel) {
    var m = mj();
    if (!seated()) return rel === 0 ? '莊家自己' : '莊家的' + W.RELATION[rel];
    var w = (m.dealer + rel) % 4;
    return T.plainName(m.seats[w]) + '（' + (rel === 0 ? '莊家' : '莊家的' + W.RELATION[rel]) + '）';
  }

  // 牌桌小圖：四面牌牆，牌尾和開始抓的那墩標出來
  function wallMap(bp) {
    var m = mj();
    var mw = meWind();
    var bottom = seated() && mw >= 0 ? mw : m.dealer;
    var ownerSeat = (m.dealer + bp.owner) % 4;
    var startSeat = (m.dealer + bp.startOwner) % 4;
    var html = '';
    for (var k = 0; k < 4; k++) {
      var w = (bottom + k) % 4;
      var cells = '';
      for (var i = 0; i < bp.per; i++) {
        var cls = 'st';
        if (w === ownerSeat && i < Math.min(bp.tail, bp.per)) cls += ' tail';
        if (w === startSeat && startSeat !== ownerSeat && i < bp.startStack - 1) cls += ' tail';
        if (w === startSeat && i === bp.startStack - 1) cls += ' start';
        cells += '<span class="' + cls + '"></span>';
      }
      var rel = (w - m.dealer + 4) % 4;
      var name = seated() ? esc(T.plainName(m.seats[w])) + (w === mw ? '（我）' : '') : W.RELATION[rel];
      html += '<div class="wl ' + POS[k] + (w === ownerSeat || w === startSeat ? ' pick' : '') + '" aria-hidden="true">' + cells + '</div>' +
        '<div class="who ' + POS[k] + '">' + name + (rel === 0 ? ' <span class="tg">莊</span>' : '') + '</div>';
    }
    return '<div class="wall-map" role="img" aria-label="牌桌小圖：黃色是牌尾，紅色是開始抓的那一墩">' + html +
      '<div class="center">' + bp.sum + ' 點</div></div>' +
      '<div class="wall-legend"><span><i style="background:var(--warn)"></i>牌尾（補花、槓從這裡拿）</span><span><i style="background:#C62839"></i>從這墩開始抓</span></div>';
  }

  function renderDice() {
    $('#diceFaces').innerHTML = (dice || [null, null, null]).map(dieHtml).join('');
    var keys = '';
    for (var n = 3; n <= 18; n++) {
      keys += '<button type="button" data-sum="' + n + '" aria-pressed="' + (!dice && sum === n) + '">' + n + '</button>';
    }
    $('#diceInput').innerHTML = keys;
    var box = $('#diceResult');
    if (rollTimer) { box.innerHTML = ''; return; }
    if (sum == null) {
      box.innerHTML = '<p class="hint">按「擲骰子」，或在上面點你們擲出來的點數，這裡會告訴你從誰的牌牆、第幾墩開始抓。</p>';
      return;
    }
    var bp = W.breakPoint(sum, flowersOn());
    var start;
    if (bp.startOwner === bp.owner) {
      start = '從他那邊看，右邊數 <b>' + sum + '</b> 墩當牌尾，從第 <b>' + bp.startStack + '</b> 墩開始抓。';
    } else {
      start = '這面牆 ' + bp.per + ' 墩全是牌尾' + (bp.startStack > 1 ? '，再數到 ' + esc(whoOf(bp.startOwner)) + ' 的牌牆右邊 ' + (bp.startStack - 1) + ' 墩' : '') +
        '；從 <b>' + esc(whoOf(bp.startOwner)) + '</b> 的牌牆、他右邊第 <b>' + bp.startStack + '</b> 墩開始抓。';
    }
    box.innerHTML = '<div class="dice-sum"><b>' + sum + '</b>點' + (dice ? '（' + dice.join(' + ') + '）' : '（自己輸入）') + '</div>' +
      '<p class="dice-what">從莊家數 ' + sum + '（莊家算 1，往下家數）：<b>' + esc(whoOf(bp.owner)) + '</b>面前的牌牆開門。' + start + '</p>' +
      wallMap(bp) +
      '<p class="hint">牌一面 ' + bp.per + ' 墩（' + (flowersOn() ? '有花 144 張' : '沒花 136 張') + '）。莊家先抓 2 墩（4 張），下家、對家、上家輪流，抓 4 輪每人 16 張，莊家再跳牌多拿 1 張；往順時針方向抓。</p>';
  }

  function roll() {
    if (rollTimer) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var frames = reduce ? 0 : 7;
    var tick = function () {
      dice = [W.rollDie(), W.rollDie(), W.rollDie()];
      sum = dice[0] + dice[1] + dice[2];
      if (frames-- <= 0) {
        clearInterval(rollTimer);
        rollTimer = null;
      }
      renderDice();
    };
    rollTimer = setInterval(tick, 70);
    tick();
  }

  function close() {
    var dlg = $('#mjDice');
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  T.mjTools = {
    // 對話框開著時跟著更新（換莊家、抓位後名字會變）
    render: function () { if ($('#mjDice').open && !rollTimer) renderDice(); },
    // 記入下一把：骰子清掉，下一把重擲
    newHand: function () { dice = null; sum = null; }
  };

  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-tool="dice"]')) return;
    renderDice();
    var dlg = $('#mjDice');
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  });
  $('#mjDice').addEventListener('click', function (e) {
    if (e.target === e.currentTarget || e.target.closest('[data-close]')) close();
  });
  $('#diceRoll').addEventListener('click', roll);
  $('#diceInput').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sum]');
    if (!b || rollTimer) return;
    dice = null;
    sum = Number(b.getAttribute('data-sum'));
    renderDice();
  });
})();
