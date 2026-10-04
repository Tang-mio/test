/* 麻將小工具：擲骰子（從哪裡開始抓）、剩幾張牌（牌牆還能摸幾張、何時海底） */
(function () {
  'use strict';
  var T = window.TableApp;
  var W = window.MahjongWall;
  var $ = T.$, $$ = T.$$, esc = T.esc;
  var PATH = 'table/mahjong';
  var POS = ['at-bottom', 'at-right', 'at-top', 'at-left'];
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  var dice = [null, null, null];
  var rollTimer = null;
  var history = []; // 這支手機按過的摸牌、補花、槓，復原用

  function mj() { return T.state.mahjong; }
  function flowersOn() { return mj().settings.flowers; }
  function seated() { return !!mj().seatsAt; }
  function meWind() { var me = T.me(); return me == null ? -1 : mj().seats.indexOf(me); }

  function openDialog(id) {
    var dlg = $(id);
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  /* ---------- 擲骰子 ---------- */

  function dieHtml(v, i) {
    var label = '第 ' + (i + 1) + ' 顆骰子';
    if (v == null) return '<button type="button" class="die blank" data-die="' + i + '" aria-label="' + label + '，點一下設定點數">?</button>';
    var cells = '';
    for (var k = 0; k < 9; k++) cells += '<i' + (PIPS[v].indexOf(k) !== -1 ? ' class="on"' : '') + '></i>';
    return '<button type="button" class="die' + (v === 1 ? ' one' : '') + (rollTimer ? ' rolling' : '') + '" data-die="' + i + '" aria-label="' + label + '：' + v + ' 點，點一下改">' + cells + '</button>';
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
    $('#diceFaces').innerHTML = dice.map(dieHtml).join('');
    var box = $('#diceResult');
    if (rollTimer) return;
    if (dice.some(function (v) { return v == null; })) {
      box.innerHTML = '<p class="hint">三顆骰子都有點數後，這裡會告訴你從誰的牌牆、第幾墩開始抓。</p>';
      return;
    }
    var sum = dice[0] + dice[1] + dice[2];
    var bp = W.breakPoint(sum, flowersOn());
    var start;
    if (bp.startOwner === bp.owner) {
      start = '從他那邊看，右邊數 <b>' + sum + '</b> 墩當牌尾，從第 <b>' + bp.startStack + '</b> 墩開始抓。';
    } else {
      start = '這面牆 ' + bp.per + ' 墩全是牌尾' + (bp.startStack > 1 ? '，再數到 ' + esc(whoOf(bp.startOwner)) + ' 的牌牆右邊 ' + (bp.startStack - 1) + ' 墩' : '') +
        '；從 <b>' + esc(whoOf(bp.startOwner)) + '</b> 的牌牆、他右邊第 <b>' + bp.startStack + '</b> 墩開始抓。';
    }
    box.innerHTML = '<div class="dice-sum"><b>' + sum + '</b>點（' + dice.join(' + ') + '）</div>' +
      '<p class="dice-what">從莊家數 ' + sum + '（莊家算 1，往下家數）：<b>' + esc(whoOf(bp.owner)) + '</b>面前的牌牆開門。' + start + '</p>' +
      wallMap(bp) +
      '<p class="hint">牌一面 ' + bp.per + ' 墩（' + (flowersOn() ? '有花 144 張' : '沒花 136 張') + '）。莊家先抓 2 墩（4 張），下家、對家、上家輪流，抓 4 輪每人 16 張，莊家再跳牌多拿 1 張；往順時針方向抓。</p>';
  }

  function roll() {
    if (rollTimer) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var frames = reduce ? 0 : 7;
    var tick = function () {
      dice = dice.map(function () { return W.rollDie(); });
      if (frames-- <= 0) {
        clearInterval(rollTimer);
        rollTimer = null;
      }
      renderDice();
    };
    rollTimer = setInterval(tick, 70);
    tick();
  }

  /* ---------- 剩幾張牌 ---------- */

  function status() {
    var m = mj();
    return W.wallStatus(m.settings.flowers, m.wall.drawn, m.settings.wallReserve);
  }

  function chipText(st) {
    if (st.empty) return '牌摸完了';
    if (st.last) return '下一張海底';
    return '還能摸 ' + st.canDraw + ' 張';
  }

  function renderWall() {
    var m = mj();
    var st = status();
    var editable = T.canEdit();
    var msg = st.empty ? '<span class="st-msg warn">沒牌了：沒人胡就流局</span>'
      : st.last ? '<span class="st-msg warn">下一張是海底</span>'
      : '<span class="lb">大約每人還能摸 ' + st.rounds + ' 輪</span>';
    $('#wallBig').innerHTML = '<span class="lb">還能摸</span><span class="n' + (st.canDraw <= 4 ? ' warn' : '') + '">' + st.canDraw + '</span>' +
      '<span class="lb">張・牌牆剩 ' + st.left + ' 張，留 ' + st.reserve + ' 張不摸</span>' + msg;
    $('#wallDraw').disabled = !editable || st.empty;
    $('#wallFlower').disabled = !editable || !st.left;
    $('#wallKong').disabled = !editable || !st.left;
    $('#wallUndo').disabled = !editable || !m.wall.drawn;
    $('#wallReset').disabled = !editable;
    $('#wallReserve').textContent = st.reserve;
    $('#wallReserveDown').disabled = !editable || st.reserve <= 0;
    $('#wallReserveUp').disabled = !editable || st.reserve >= 60;
    var w = m.wall;
    $('#wallLog').textContent = (flowersOn() ? '有花 144' : '沒花 136') + ' 張，配牌 65 張後剩 ' + st.afterDeal + ' 張；這把又摸了 ' + w.drawn + ' 張' +
      (w.flowers || w.kongs ? '（補花 ' + w.flowers + '、槓 ' + w.kongs + '）' : '') + '。';
  }

  function take(kind) {
    if (!T.canEdit()) return;
    var st = status();
    if (kind === 'draw' ? st.empty : !st.left) return;
    var w = mj().wall;
    w.drawn += 1;
    if (kind === 'flower') w.flowers += 1;
    if (kind === 'kong') w.kongs += 1;
    history.push(kind);
    T.changed(PATH);
    var after = status();
    if (after.last) T.toast('下一張是海底');
    else if (after.empty) T.toast('牌摸完了，沒人胡就流局');
  }

  function undo() {
    var w = mj().wall;
    if (!T.canEdit() || !w.drawn) return;
    var kind = history.pop();
    w.drawn -= 1;
    if (kind === 'flower' && w.flowers) w.flowers -= 1;
    if (kind === 'kong' && w.kongs) w.kongs -= 1;
    T.changed(PATH);
  }

  function setReserve(n) {
    if (!T.canEdit()) return;
    mj().settings.wallReserve = Math.max(0, Math.min(60, n));
    T.changed(PATH);
  }

  /* ---------- 對外 ---------- */

  T.mjTools = {
    // 麻將頁的小工具列；對話框開著就一起更新（別支手機按了也會同步）
    render: function () {
      var st = status();
      var chip = $('#mjWallChip');
      chip.textContent = chipText(st);
      chip.parentNode.classList.toggle('warn', st.canDraw <= 4);
      if ($('#mjWall').open) renderWall();
      if ($('#mjDice').open && !rollTimer) renderDice();
    },
    // 記入下一把：牌牆重算
    newHand: function () {
      mj().wall = T.emptyWall();
      history = [];
      dice = [null, null, null];
    }
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tool="dice"], [data-tool="wall"]');
    if (!b) return;
    if (b.getAttribute('data-tool') === 'dice') { renderDice(); openDialog('#mjDice'); }
    else { renderWall(); openDialog('#mjWall'); }
  });
  $$('#mjDice, #mjWall').forEach(function (dlg) {
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) closeDialog(dlg);
    });
  });
  $('#diceRoll').addEventListener('click', roll);
  $('#diceFaces').addEventListener('click', function (e) {
    var b = e.target.closest('[data-die]');
    if (!b || rollTimer) return;
    var i = Number(b.getAttribute('data-die'));
    dice[i] = dice[i] == null ? 1 : dice[i] % 6 + 1;
    renderDice();
  });
  $('#wallDraw').addEventListener('click', function () { take('draw'); });
  $('#wallFlower').addEventListener('click', function () { take('flower'); });
  $('#wallKong').addEventListener('click', function () { take('kong'); });
  $('#wallUndo').addEventListener('click', undo);
  $('#wallReserveDown').addEventListener('click', function () { setReserve(mj().settings.wallReserve - 2); });
  $('#wallReserveUp').addEventListener('click', function () { setReserve(mj().settings.wallReserve + 2); });
  $('#wallReset').addEventListener('click', function () {
    if (!T.canEdit()) return;
    mj().wall = T.emptyWall();
    history = [];
    T.changed(PATH);
    T.toast('重新配牌：牌牆剩 ' + status().left + ' 張');
  });
})();
