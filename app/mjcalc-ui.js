/* 麻將牌型計算器的畫面：點手上的牌，自動拆牌算台；從麻將的算台步驟打開時可以套用到這把 */
(function () {
  'use strict';
  var T = window.TableApp;
  var MJ = window.Mahjong;
  var H = window.MahjongHand;
  var $ = T.$, esc = T.esc;

  var MODES = [['hand', '手牌'], ['chi', '吃'], ['pon', '碰'], ['kong', '明槓'], ['ankong', '暗槓'], ['win', '胡牌'], ['flower', '花']];
  var TIPS = {
    hand: '點手上沒亮出來的牌（不含胡的那張）；點上面的牌可以拿掉',
    chi: '吃：點順子最小的那張，例如點 3 萬就是 345 萬',
    pon: '碰：點碰的那張牌',
    kong: '明槓：點槓的那張牌（槓不加台，只是佔位置）',
    ankong: '暗槓：點槓的那張牌，算暗刻、不影響門清',
    win: '點胡的那張牌',
    flower: '點拿到的花牌，再點一次取消'
  };
  var MELD_LABEL = { chi: '吃', pon: '碰', kong: '槓', ankong: '暗槓' };
  var HONOR_CLASS = { 31: ' t-zhong', 32: ' t-fa', 33: ' t-bai' };
  var SUIT_CLASS = ['m', 'p', 's'];
  var PATTERN = {};
  MJ.PATTERNS.forEach(function (p) { PATTERN[p.id] = p; });

  var calc = blank();
  var mode = 'hand';
  var opts = {}; // { fromHand, who, method, roundWind, seatWind, onApply }

  function blank() {
    return { concealed: [], melds: [], win: null, flowers: [], extras: {}, method: 'ziMo', roundWind: 0, seatWind: 0 };
  }
  function settings() { return T.state.mahjong.settings; }
  function size() { return calc.concealed.length + calc.melds.length * 3; }

  function tileHtml(t) {
    if (H.isHonor(t)) {
      return '<span class="tl hz' + (HONOR_CLASS[t] || '') + '">' + (t === 33 ? '<span>白</span>' : H.HONORS[t - 27]) + '</span>';
    }
    var s = H.suitOf(t);
    return '<span class="tl ' + SUIT_CLASS[s] + '"><span class="r">' + H.rankOf(t) + '</span><span class="u">' + H.SUITS[s] + '</span></span>';
  }
  function flowerHtml(f) { return '<span class="tl fl">' + H.FLOWERS[f] + '</span>'; }

  // 這個模式下能不能點這張
  function canTap(t) {
    var used = H.usage(calc);
    var room = H.HAND_SIZE - size();
    var free = function (x, n) { return used[x] + n <= 4; };
    var meldOk = room >= 3 && calc.melds.length < 5;
    if (mode === 'hand') return room >= 1 && free(t, 1);
    if (mode === 'chi') return meldOk && H.canChi(t) && free(t, 1) && free(t + 1, 1) && free(t + 2, 1);
    if (mode === 'pon') return meldOk && free(t, 3);
    if (mode === 'kong' || mode === 'ankong') return meldOk && free(t, 4);
    if (mode === 'win') return used[t] - (calc.win === t ? 1 : 0) < 4;
    return false;
  }

  /* ---------- 畫面 ---------- */

  function renderCtx() {
    var W = T.SEAT_CHARS;
    if (opts.fromHand) {
      $('#mcCtx').innerHTML = '<span class="fixed">照這把：<b>' + esc(opts.who) + ' ' + (calc.method === 'ziMo' ? '自摸' : '胡別人打的') +
        '</b>・圈風 <b>' + W[calc.roundWind] + '</b>・門風 <b>' + W[calc.seatWind] + '</b></span>';
      return;
    }
    var opt = function (v) { return W.map(function (c, w) { return '<option value="' + w + '"' + (w === v ? ' selected' : '') + '>' + c + '</option>'; }).join(''); };
    $('#mcCtx').innerHTML =
      '<span class="mc-seg" role="group" aria-label="胡法">' +
        '<button type="button" data-method="ziMo" aria-pressed="' + (calc.method === 'ziMo') + '">自摸</button>' +
        '<button type="button" data-method="fangQiang" aria-pressed="' + (calc.method === 'fangQiang') + '">放槍</button>' +
      '</span>' +
      '<label>圈風<select data-ctx="roundWind">' + opt(calc.roundWind) + '</select></label>' +
      '<label>門風<select data-ctx="seatWind">' + opt(calc.seatWind) + '</select></label>';
  }

  function renderHand() {
    var parts = [];
    calc.melds.forEach(function (m, i) {
      parts.push('<button type="button" class="mc-group" data-meld="' + i + '" aria-label="拿掉' + MELD_LABEL[m.type] + ' ' + H.tileName(m.tile) + '">' +
        '<span class="mc-row">' + H.meldTiles(m).map(tileHtml).join('') + '</span><span class="lb">' + MELD_LABEL[m.type] + '</span></button>');
    });
    if (calc.concealed.length) {
      parts.push('<span class="mc-group mc-concealed"><span class="mc-row">' + H.sortTiles(calc.concealed).map(function (t) {
        return '<button type="button" class="mc-tbtn" data-ctile="' + t + '" aria-label="拿掉 ' + H.tileName(t) + '">' + tileHtml(t) + '</button>';
      }).join('') + '</span><span class="lb">手牌</span></span>');
    }
    if (!parts.length) parts.push('<span class="empty">用下面的鍵盤點手上的牌</span>');
    parts.push('<button type="button" class="mc-group mc-win" data-win aria-label="' + (calc.win == null ? '還沒點胡的牌' : '胡 ' + H.tileName(calc.win) + '，點一下重點') + '">' +
      '<span class="mc-row">' + (calc.win == null ? '<span class="tl ghost">?</span>' : tileHtml(calc.win)) + '</span><span class="lb">胡</span></button>');
    if (calc.flowers.length) {
      parts.push('<span class="mc-group"><span class="mc-row">' + calc.flowers.slice().sort().map(function (f) {
        return '<button type="button" class="mc-tbtn" data-flower="' + f + '" aria-label="拿掉 ' + H.FLOWERS[f] + '">' + flowerHtml(f) + '</button>';
      }).join('') + '</span><span class="lb">花</span></span>');
    }
    parts.push('<span class="mc-count">' + size() + '/16</span>');
    $('#mcHand').innerHTML = parts.join('');
  }

  function renderModes() {
    var list = MODES.filter(function (m) { return m[0] !== 'flower' || settings().flowers; });
    if (mode === 'flower' && !settings().flowers) mode = 'hand';
    $('#mcModes').innerHTML = list.map(function (m) {
      return '<button type="button" data-mode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + '</button>';
    }).join('');
    $('#mcTip').textContent = TIPS[mode];
  }

  function renderKeys() {
    if (mode === 'flower') {
      $('#mcKeys').innerHTML = '<div class="mc-keyrow flowers">' + H.FLOWERS.map(function (c, f) {
        var on = calc.flowers.indexOf(f) !== -1;
        return '<button type="button" class="mc-key" data-f="' + f + '" aria-pressed="' + on + '" aria-label="' + c + '">' + flowerHtml(f) + '</button>';
      }).join('') + '</div>';
      return;
    }
    var used = H.usage(calc);
    var key = function (t) {
      return '<button type="button" class="mc-key" data-t="' + t + '" aria-label="' + H.tileName(t) + (used[t] ? '，已經有 ' + used[t] + ' 張' : '') + '"' +
        (canTap(t) ? '' : ' disabled') + '>' + tileHtml(t) + (used[t] ? '<span class="used">' + used[t] + '</span>' : '') + '</button>';
    };
    var rows = [];
    for (var s = 0; s < 3; s++) {
      var row = [];
      for (var r = 0; r < 9; r++) row.push(key(s * 9 + r));
      rows.push('<div class="mc-keyrow">' + row.join('') + '</div>');
    }
    var honors = [];
    for (var h = 27; h < 34; h++) honors.push(key(h));
    rows.push('<div class="mc-keyrow honors">' + honors.join('') + '</div>');
    $('#mcKeys').innerHTML = rows.join('');
  }

  function renderExtras() {
    var s = settings();
    var avail = {};
    MJ.patternsFor(s).forEach(function (p) { avail[p.id] = true; });
    $('#mcExtras').innerHTML = H.EXTRA_IDS.filter(function (id) { return avail[id]; }).map(function (id) {
      var p = PATTERN[id];
      var off = p.only && p.only !== calc.method;
      return '<button type="button" class="tai-chip" data-extra="' + id + '" aria-pressed="' + !!calc.extras[id] + '"' + (off ? ' disabled' : '') + '>' +
        '<span class="nm">' + p.name + '</span><b>' + (s.tai[id] != null ? s.tai[id] : p.tai) + '</b></button>';
    }).join('');
  }

  function renderResult() {
    var r = H.analyze(calc, settings());
    var box = $('#mcResult');
    if (!r.ok) {
      var msg;
      var bad = false;
      if (r.reason === 'short') msg = '還差 ' + r.need + ' 張（手牌加吃碰槓共 16 張）';
      else if (r.reason === 'long') msg = '多了 ' + (-r.need) + ' 張，點上面的牌拿掉';
      else if (r.reason === 'win') {
        var waits = H.waitsOf(calc);
        msg = waits.length ? '點胡的那張。聽：' + waits.map(H.tileName).join('、') : '這 16 張還沒聽牌，檢查一下有沒有點錯';
        bad = !waits.length;
      } else if (r.reason === 'over') { msg = H.tileName(r.tile) + '超過 4 張了'; bad = true; }
      else { msg = '這副牌胡不了：拆不成 5 組加 1 對眼，檢查一下有沒有點錯'; bad = true; }
      box.innerHTML = '<p class="mc-msg' + (bad ? ' bad' : '') + '">' + esc(msg) + '</p>';
      return;
    }
    var items = r.items.length ? r.items.map(function (it) { return esc(it.name) + ' ' + it.tai; }).join('・') : '沒有台型';
    var sets = r.sets.map(H.setText).concat(['眼 ' + H.setText({ type: 'pair', tile: r.pair })]).join('・');
    var waits = '聽 ' + r.waits.map(H.tileName).join('、') + (r.waits.length === 1 ? '（獨聽）' : '');
    box.innerHTML = '<div class="mc-total"><b>' + r.tai + '</b>台<span class="sub">不含莊家台；莊家台、連莊在算錢時另外加</span></div>' +
      '<p class="mc-items">' + items + '</p>' +
      '<p class="mc-sets">' + esc(sets) + '｜' + esc(waits) + '</p>' +
      (opts.fromHand ? '<button type="button" class="btn primary" id="mcApply">套用到這把（' + r.tai + ' 台）</button>' : '');
  }

  function render() {
    renderCtx();
    renderHand();
    renderModes();
    renderKeys();
    renderExtras();
    renderResult();
  }

  /* ---------- 動作 ---------- */

  function tapTile(t) {
    if (!canTap(t)) return;
    if (mode === 'hand') calc.concealed.push(t);
    else if (mode === 'win') calc.win = t;
    else calc.melds.push({ type: mode, tile: t });
    // 16 張點滿了就接著點胡的那張
    if (mode !== 'win' && size() === H.HAND_SIZE && calc.win == null) mode = 'win';
    render();
  }

  function close() {
    var dlg = $('#mjCalc');
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  T.mjCalc = {
    // o = { fromHand, who, method, roundWind, seatWind, onApply }；沒給就是單獨用
    open: function (o) {
      opts = o || {};
      if (opts.fromHand) {
        calc.method = opts.method;
        calc.roundWind = opts.roundWind;
        calc.seatWind = opts.seatWind;
      }
      if (!settings().flowers) calc.flowers = [];
      if (size() === H.HAND_SIZE && calc.win == null) mode = 'win';
      render();
      var dlg = $('#mjCalc');
      if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
      else dlg.setAttribute('open', '');
    },
    reset: function () { calc = blank(); mode = 'hand'; }
  };

  $('#mcClose').addEventListener('click', close);
  $('#mjCalc').addEventListener('click', function (e) { if (e.target === e.currentTarget) close(); });
  $('#mcClear').addEventListener('click', function () {
    var keep = { method: calc.method, roundWind: calc.roundWind, seatWind: calc.seatWind };
    calc = Object.assign(blank(), keep);
    mode = 'hand';
    render();
  });
  $('#mcCtx').addEventListener('click', function (e) {
    var b = e.target.closest('[data-method]');
    if (!b) return;
    calc.method = b.getAttribute('data-method');
    render();
  });
  $('#mcCtx').addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-ctx');
    if (!k) return;
    calc[k] = Number(e.target.value);
    render();
  });
  $('#mcModes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = b.getAttribute('data-mode');
    render();
  });
  $('#mcKeys').addEventListener('click', function (e) {
    var b = e.target.closest('.mc-key');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-f')) {
      var f = Number(b.getAttribute('data-f'));
      var i = calc.flowers.indexOf(f);
      if (i === -1) calc.flowers.push(f);
      else calc.flowers.splice(i, 1);
      render();
    } else tapTile(Number(b.getAttribute('data-t')));
  });
  $('#mcHand').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ctile], [data-meld], [data-win], [data-flower]');
    if (!b) return;
    if (b.hasAttribute('data-ctile')) calc.concealed.splice(calc.concealed.indexOf(Number(b.getAttribute('data-ctile'))), 1);
    else if (b.hasAttribute('data-meld')) calc.melds.splice(Number(b.getAttribute('data-meld')), 1);
    else if (b.hasAttribute('data-flower')) calc.flowers.splice(calc.flowers.indexOf(Number(b.getAttribute('data-flower'))), 1);
    else { calc.win = null; mode = 'win'; }
    render();
  });
  $('#mcExtras').addEventListener('click', function (e) {
    var b = e.target.closest('[data-extra]');
    if (!b || b.disabled) return;
    var id = b.getAttribute('data-extra');
    if (calc.extras[id]) delete calc.extras[id];
    else calc.extras[id] = 1;
    render();
  });
  $('#mcResult').addEventListener('click', function (e) {
    if (!e.target.closest('#mcApply') || !opts.onApply) return;
    var r = H.analyze(calc, settings());
    if (!r.ok) return;
    opts.onApply(r);
    close();
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-tool="mjcalc"]')) T.mjCalc.open({});
  });
})();
