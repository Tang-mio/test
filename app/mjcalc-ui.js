/* 胡什麼牌：點手上還沒亮出來的牌，算出胡哪幾張、每張還剩幾張 */
(function () {
  'use strict';
  var T = window.TableApp;
  var H = window.MahjongHand;
  var $ = T.$, esc = T.esc;

  var HONOR_CLASS = { 31: ' t-zhong', 32: ' t-fa', 33: ' t-bai' };
  var SUIT_CLASS = ['m', 'p', 's'];
  var hand = [];

  function tileHtml(t) {
    if (H.isHonor(t)) {
      return '<span class="tl hz' + (HONOR_CLASS[t] || '') + '">' + (t === 33 ? '<span>白</span>' : H.HONORS[t - 27]) + '</span>';
    }
    var s = H.suitOf(t);
    return '<span class="tl ' + SUIT_CLASS[s] + '"><span class="r">' + H.rankOf(t) + '</span><span class="u">' + H.SUITS[s] + '</span></span>';
  }
  function countOf(t) { return hand.filter(function (x) { return x === t; }).length; }

  function renderHand() {
    var html = hand.length
      ? H.sortTiles(hand).map(function (t) {
          return '<button type="button" class="mc-tbtn" data-ctile="' + t + '" aria-label="拿掉 ' + H.tileName(t) + '">' + tileHtml(t) + '</button>';
        }).join('')
      : '<span class="empty">用下面的鍵盤點手上的牌</span>';
    $('#mcHand').innerHTML = '<div class="mc-row">' + html + '</div><span class="mc-count">' + hand.length + ' 張</span>';
  }

  function renderKeys() {
    var full = hand.length >= H.MAX_TILES;
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

  function renderResult() {
    var r = H.check(hand);
    var box = $('#mcResult');
    var msg = function (text, bad) { box.innerHTML = '<p class="mc-msg' + (bad ? ' bad' : '') + '">' + esc(text) + '</p>'; };
    if (r.kind === 'empty') return msg('點手上的牌，這裡會告訴你胡哪幾張。');
    if (r.kind === 'over') return msg(H.tileName(r.tile) + '超過 4 張了，點上面的牌拿掉一張。', true);
    if (r.kind === 'need') return msg('再點 1 張。手上的牌要 1、4、7、10、13 或 16 張（吃、碰、槓的不用點）。');
    if (r.kind === 'win') return msg('這副牌已經胡了！');
    if (r.kind === 'extra') return msg('多了一張：先拿掉要打出去的那張，再看胡哪幾張。');
    if (r.kind === 'none') return msg('還沒聽牌，再換換看。', true);
    box.innerHTML = '<div class="mc-total"><b>胡 ' + r.waits.length + ' 種牌</b><span class="sub">' +
      (r.live ? '還有 ' + r.live + ' 張可以胡' : '要的牌都在你手上了，胡不到（空聽）') + '</span></div>' +
      '<div class="mc-waits">' + r.waits.map(function (w) {
        return '<span class="mc-wait' + (w.left ? '' : ' dead') + '">' + tileHtml(w.tile) + '<span class="left">' + (w.left ? '剩 ' + w.left + ' 張' : '沒了') + '</span></span>';
      }).join('') + '</div>';
  }

  function render() {
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
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-tool="mjcalc"]')) T.mjCalc.open();
  });
})();
