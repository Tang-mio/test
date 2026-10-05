/* 胡牌計算機：點手上還沒亮出來的牌，算胡什麼牌、打哪張、還差幾張；16 張（台灣，預設）或 13 張 */
(function () {
  'use strict';
  var T = window.TableApp;
  var H = window.MahjongHand;
  var $ = T.$, $$ = T.$$, esc = T.esc;
  var MODE_KEY = 'paitable-hu-mode';
  var SHOW_OPTIONS = 5; // 打哪張先列前幾種，其他收起來

  var HONOR_CLASS = { 31: ' t-zhong', 32: ' t-fa', 33: ' t-bai' };
  var SUIT_CLASS = ['m', 'p', 's'];
  var hand = [];
  var mode = 16;
  try { if (localStorage.getItem(MODE_KEY) === '13') mode = 13; } catch (e) { /* 存不了就用預設 */ }

  function tileHtml(t) {
    if (H.isHonor(t)) {
      return '<span class="tl hz' + (HONOR_CLASS[t] || '') + '">' + (t === 33 ? '<span>白</span>' : H.HONORS[t - 27]) + '</span>';
    }
    var s = H.suitOf(t);
    return '<span class="tl ' + SUIT_CLASS[s] + '"><span class="r">' + H.rankOf(t) + '</span><span class="u">' + H.SUITS[s] + '</span></span>';
  }
  function countOf(t) { return hand.filter(function (x) { return x === t; }).length; }

  // 一排牌，下面寫還剩幾張
  function tileList(list, big) {
    return '<div class="mc-waits' + (big ? '' : ' small') + '">' + list.map(function (w) {
      return '<span class="mc-wait' + (w.left ? '' : ' dead') + '">' + tileHtml(w.tile) +
        '<span class="left">' + (w.left ? (big ? '剩 ' : '') + w.left + (big ? ' 張' : '') : '沒了') + '</span></span>';
    }).join('') + '</div>';
  }

  function renderMode() {
    $$('#mcMode [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-mode')) === mode)); });
  }

  function renderHand() {
    var html = hand.length
      ? H.sortTiles(hand).map(function (t) {
          return '<button type="button" class="mc-tbtn" data-ctile="' + t + '" aria-label="拿掉 ' + H.tileName(t) + '">' + tileHtml(t) + '</button>';
        }).join('')
      : '<span class="empty">用下面的鍵盤點手上的牌</span>';
    $('#mcHand').innerHTML = '<div class="mc-row">' + html + '</div><span class="mc-count">' + hand.length + ' 張</span>';
  }

  function renderKeys() {
    var full = hand.length >= H.maxTiles(mode);
    var key = function (t) {
      var n = countOf(t);
      return '<button type="button" class="mc-key" data-t="' + t + '" aria-label="' + H.tileName(t) + (n ? '，手上有 ' + n + ' 張' : '') + '"' +
        (full || n >= 4 ? ' disabled' : '') + '>' + tileHtml(t) + (n ? '<span class="used">' + n + '</span>' : '') + '</button>';
    };
    var rows = [];
    for (var s = 0; s < 3; s++) {
      var row = [];
      for (var r = 0; r < 9; r++) row.push(key(s * 9 + r));
      rows.push('<div class="mc-keyrow">' + row.join('') + '</div>');
    }
    var honors = [];
    for (var h = 27; h < 34; h++) honors.push(key(h));
    rows.push('<div class="mc-keyrow">' + honors.join('') + '</div>');
    $('#mcKeys').innerHTML = rows.join('');
  }

  function optionHtml(o, best) {
    var what = o.shanten === 0
      ? '<span class="o-what">聽 ' + o.tiles.length + ' 種・共 <b>' + o.live + '</b> 張</span>'
      : '<span class="o-what">還差 ' + o.shanten + ' 張聽牌・摸到 ' + o.tiles.length + ' 種（' + o.live + ' 張）會更接近</span>';
    return '<button type="button" class="mc-opt' + (best ? ' best' : '') + '" data-discard="' + o.tile + '" aria-label="打 ' + H.tileName(o.tile) + '">' +
      '<span class="o-head"><span class="o-lb">打</span>' + tileHtml(o.tile) + what + '</span>' +
      tileList(o.tiles, false) + '</button>';
  }

  function renderResult() {
    var box = $('#mcResult');
    var msg = function (text, bad) { box.innerHTML = '<p class="mc-msg' + (bad ? ' bad' : '') + '">' + esc(text) + '</p>'; };
    var max = H.maxTiles(mode);
    if (hand.length > max) return msg(mode + ' 張最多 ' + max + ' 張，請拿掉 ' + (hand.length - max) + ' 張。', true);
    var r = H.check(hand, mode);
    var target = mode === 13 ? '1、4、7、10 或 13 張' : '1、4、7、10、13 或 16 張';
    if (r.kind === 'empty') return msg('點手上的牌：' + mode + ' 張看胡什麼；多摸一張（' + (mode + 1) + ' 張）看打哪張。');
    if (r.kind === 'over') return msg(H.tileName(r.tile) + '超過 4 張了，點上面的牌拿掉一張。', true);
    if (r.kind === 'need') return msg('再點 1 張。手上的牌要 ' + target + '（吃、碰、槓的不用點），多摸一張就看打哪張。');
    if (r.kind === 'win') {
      box.innerHTML = '<div class="mc-total"><b>胡了！</b>' + (r.special ? '<span class="sub">' + r.special + '</span>' : '') + '</div>';
      return;
    }
    if (r.kind === 'waits') {
      box.innerHTML = '<div class="mc-total"><b>聽牌！胡 ' + r.waits.length + ' 種</b><span class="sub">' +
        (r.special ? r.special + '・' : '') + (r.live ? '還有 ' + r.live + ' 張可以胡' : '要的牌都在你手上了，胡不到（空聽）') + '</span></div>' +
        tileList(r.waits, true);
      return;
    }
    if (r.kind === 'far') {
      box.innerHTML = '<div class="mc-total"><b>還差 ' + r.shanten + ' 張聽牌</b><span class="sub">' + r.shanten + ' 向聽</span></div>' +
        '<p class="mc-sub">摸到這些牌會更接近（' + r.accepts.length + ' 種、' + r.live + ' 張）：</p>' + tileList(r.accepts, true);
      return;
    }
    // 多一張還沒胡：打哪張
    var opts = r.options;
    var top = opts[0];
    var bestOf = function (o) { return o.shanten === top.shanten && o.live === top.live; };
    box.innerHTML = '<div class="mc-total"><b>打哪張？</b><span class="sub">' +
      (top.shanten === 0 ? '有 ' + opts.filter(function (o) { return o.shanten === 0; }).length + ' 種打法可以聽牌' : '最快還差 ' + top.shanten + ' 張聽牌') +
      '・點一下就打掉</span></div>' +
      '<div class="mc-opts">' + opts.slice(0, SHOW_OPTIONS).map(function (o) { return optionHtml(o, bestOf(o)); }).join('') + '</div>' +
      (opts.length > SHOW_OPTIONS
        ? '<details class="mc-more"><summary>其他 ' + (opts.length - SHOW_OPTIONS) + ' 種打法</summary><div class="mc-opts">' +
          opts.slice(SHOW_OPTIONS).map(function (o) { return optionHtml(o, false); }).join('') + '</div></details>'
        : '');
  }

  function render() {
    renderMode();
    renderHand();
    renderKeys();
    renderResult();
  }

  function close() {
    var dlg = $('#mjCalc');
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  T.mjCalc = {
    open: function () {
      render();
      var dlg = $('#mjCalc');
      if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
      else dlg.setAttribute('open', '');
    }
  };

  $('#mcClose').addEventListener('click', close);
  $('#mjCalc').addEventListener('click', function (e) { if (e.target === e.currentTarget) close(); });
  $('#mcClear').addEventListener('click', function () { hand = []; render(); });
  $('#mcMode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = Number(b.getAttribute('data-mode'));
    try { localStorage.setItem(MODE_KEY, String(mode)); } catch (err) { /* 同上 */ }
    render();
  });
  $('#mcKeys').addEventListener('click', function (e) {
    var b = e.target.closest('.mc-key');
    if (!b || b.disabled) return;
    hand.push(Number(b.getAttribute('data-t')));
    render();
  });
  $('#mcHand').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ctile]');
    if (!b) return;
    hand.splice(hand.indexOf(Number(b.getAttribute('data-ctile'))), 1);
    render();
  });
  // 打哪張：點一下就把那張打掉，接著看聽什麼
  $('#mcResult').addEventListener('click', function (e) {
    var b = e.target.closest('[data-discard]');
    if (!b) return;
    var t = Number(b.getAttribute('data-discard'));
    hand.splice(hand.indexOf(t), 1);
    render();
    T.toast('打掉' + H.tileName(t));
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-tool="mjcalc"]')) T.mjCalc.open();
  });
})();
