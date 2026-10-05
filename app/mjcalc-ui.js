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

  // 聽牌建議：一句話說完，牌直接畫在句子裡
  function advice(html, action) {
    return '<div class="mc-advice"><span class="mc-advice-lb">聽牌建議</span><p>' + html + '</p>' + (action || '') + '</div>';
  }
  function inlineTiles(list, max) {
    var shown = list.slice(0, max || list.length);
    return '<span class="mc-inline">' + shown.map(function (w) { return tileHtml(w.tile); }).join('') + '</span>' +
      (list.length > shown.length ? '等 ' + list.length + ' 種' : '');
  }
  function special(r) { return r.special ? '（' + r.special + '）' : ''; }

  function renderMode() {
    $$('#mcMode [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-mode')) === mode)); });
  }

  function renderHand() {
    var html = hand.length
      ? H.sortTiles(hand).map(function (t) {
          return '<button type="button" class="mc-tbtn" data-ctile="' + t + '" aria-label="拿掉 ' + H.tileName(t) + '">' + tileHtml(t) + '</button>';
        }).join('')
      : '<span class="empty">用下面的鍵盤點手上的牌</span>';
    $('#mcHand').innerHTML = '<div class="mc-row">' + html + '</div><span class="mc-count">' + (hand.length > mode ? hand.length + ' 張（多摸 1 張）' : hand.length + ' / ' + mode + ' 張') + '</span>';
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
    // 點滿才算：剛好 16 張（13 張模式 13 張）看胡什麼，多摸一張看打哪張
    if (hand.length < mode) {
      return msg(hand.length
        ? '還差 ' + (mode - hand.length) + ' 張。點滿 ' + mode + ' 張才會算胡什麼；多摸一張（' + (mode + 1) + ' 張）就給聽牌建議。'
        : '點手上的 ' + mode + ' 張牌（吃、碰的牌也一起點，槓只點 3 張），點滿就會算胡什麼；多摸一張（' + (mode + 1) + ' 張）就給聽牌建議。');
    }
    var r = H.check(hand, mode);
    if (r.kind === 'over') return msg(H.tileName(r.tile) + '超過 4 張了，點上面的牌拿掉一張。', true);
    if (r.kind === 'win') {
      box.innerHTML = '<div class="mc-total"><b>胡了！</b>' + (r.special ? '<span class="sub">' + r.special + '</span>' : '') + '</div>';
      return;
    }
    if (r.kind === 'waits') {
      box.innerHTML = advice(r.live
        ? '此牌型尚未胡牌，已經聽牌：聽 ' + inlineTiles(r.waits) + '（共 <b>' + r.live + '</b> 張）' + special(r) + '。'
        : '此牌型尚未胡牌，聽 ' + inlineTiles(r.waits) + '，但要的牌都在你手上了（空聽），胡不到。') +
        '<p class="mc-sub">每張還剩幾張：</p>' + tileList(r.waits, true);
      return;
    }
    if (r.kind === 'far') {
      box.innerHTML = advice('此牌型尚未胡牌，還差 <b>' + r.shanten + '</b> 張聽牌；摸到 ' + inlineTiles(r.accepts, 8) +
        '（共 <b>' + r.live + '</b> 張）會更接近。') +
        '<p class="mc-sub">每張還剩幾張：</p>' + tileList(r.accepts, true);
      return;
    }
    // 多一張還沒胡：建議捨棄哪張，打了聽什麼
    var opts = r.options;
    var top = opts[0];
    var bests = opts.filter(function (o) { return o.shanten === top.shanten && o.live === top.live; });
    var text = '此牌型尚未胡牌，建議捨棄 ' + inlineTiles([top]) + (top.shanten === 0
      ? '，聽 ' + inlineTiles(top.tiles) + (top.live ? '（共 <b>' + top.live + '</b> 張）。' : '（要的牌都在你手上，空聽）。')
      : '，還差 <b>' + top.shanten + '</b> 張聽牌；摸到 ' + inlineTiles(top.tiles, 8) + '（共 <b>' + top.live + '</b> 張）會更接近。');
    if (bests.length > 1) text += '<br>捨棄 ' + inlineTiles(bests.slice(1)) + ' 也一樣好。';
    box.innerHTML = advice(text, '<button type="button" class="btn primary mc-do" data-discard="' + top.tile + '">捨棄' + H.tileName(top.tile) + '</button>') +
      '<p class="mc-sub">每一種打法（點一下就打掉）：</p>' +
      '<div class="mc-opts">' + opts.slice(0, SHOW_OPTIONS).map(function (o) { return optionHtml(o, bests.indexOf(o) !== -1); }).join('') + '</div>' +
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

  /* ---------- 拍照辨識：用看的人自己的 Claude 看照片，把牌填進來 ---------- */

  var sample = null;  // 這個畫面能用 Claude 看照片時才有
  var photoCtl = null; // 辨識中可以停止
  // 能不能拍照：checking 確認中、ready 可以、noclaude 不是在 claude.ai 打開、
  // denied 看的人沒允許、unavailable 這裡不能用 Claude、noimages 這裡不能傳照片
  var photoState = 'checking';
  var photoDiag = ''; // 不能用時附一行小字，回報問題時方便看是哪裡不行
  var HONOR_CODE = { E: 27, S: 28, W: 29, N: 30, C: 31, F: 32, P: 33 };

  function photoPrompt() {
    return 'This photo shows the tiles in one player\'s Mahjong hand (Taiwanese mahjong, about ' + mode + ' or ' + (mode + 1) +
      ' tiles). List every tile face you can see, in order from left to right (then the next row, if any). ' +
      'Codes: characters 萬 (a red 萬 under a Chinese numeral 一–九) = 1m-9m; dots/circles 筒 = 1p-9p (count the circles); ' +
      'bamboo 條/索 = 1s-9s (count the sticks; 1s is usually a bird); winds 東=E, 南=S, 西=W, 北=N; ' +
      'dragons 中 (red) = C, 發 (green) = F, 白 (blank, or an empty blue frame) = P. ' +
      'Skip flower and season tiles (春夏秋冬梅蘭竹菊), face-down tiles, and anything that is not a tile face. ' +
      'Reply with only JSON like {"tiles": ["1m","1m","5p","E","C"], "unsure": 0, "note": ""}: "unsure" is how many tiles you could not read with confidence, ' +
      'and "note" is one short sentence in Traditional Chinese (Taiwan) only if the photo is unclear or cut off, otherwise "".';
  }

  function codeToTile(code) {
    var c = String(code == null ? '' : code).trim();
    var m = c.match(/^([1-9])\s*([mps])$/i);
    if (m) return { m: 0, p: 9, s: 18 }[m[2].toLowerCase()] + Number(m[1]) - 1;
    var h = HONOR_CODE[c.toUpperCase()];
    return h == null ? null : h;
  }

  function photoStatus(text, kind) {
    var el = $('#mcPhotoStatus');
    el.textContent = text;
    el.className = 'mc-photo-status' + (kind ? ' ' + kind : '');
    var busy = kind === 'busy';
    $('#mcPhoto').disabled = busy;
    $('#mcPhotoStop').hidden = !busy;
  }

  var PHOTO_WHY = {
    checking: '還在確認這個畫面能不能用拍照辨識，等幾秒再按一次。',
    noclaude: '要在 claude.ai 打開這個頁面（登入 Claude）才能拍照辨識；直接開檔案不行。現在請用下面的鍵盤點牌。',
    denied: '你之前沒有允許這個頁面使用 Claude。按「開啟權限」把 Claude 打開，再按一次拍照。',
    unavailable: '這個畫面不能使用 Claude：請確認已經登入 claude.ai；用手機 App 打開的話，試試用手機瀏覽器打開同一個連結。',
    noimages: '這個畫面不能把照片傳給 Claude（可能是 App 版本比較舊）。請改用手機瀏覽器打開同一個連結，或更新 App。'
  };

  // 不能用時說明原因；沒允許的話給一個開權限的按鈕
  function explainPhoto() {
    photoStatus((PHOTO_WHY[photoState] || PHOTO_WHY.unavailable) + (photoDiag && photoState !== 'checking' ? '（' + photoDiag + '）' : ''),
      photoState === 'checking' ? '' : 'bad');
    $('#mcPhotoPerm').hidden = photoState !== 'denied';
  }

  function hidePhoto(state) {
    sample = null;
    photoState = state || 'unavailable';
    explainPhoto();
  }

  function checkPhoto() {
    var c = window.claude;
    if (!c || typeof c.use !== 'function') { photoState = 'noclaude'; photoDiag = '代碼 N0'; return; }
    c.use('sample').then(function (s) {
      if (!s) {
        // 看是沒允許還是這裡根本不能用
        return c.use('permissions').then(function (perms) {
          return perms ? perms.state('sample') : 'no-perms';
        }).then(function (st) {
          photoState = st === 'denied' ? 'denied' : 'unavailable';
          photoDiag = '代碼 S0・' + st + '・' + (T.view.mode || '');
        }, function () { photoState = 'unavailable'; photoDiag = '代碼 S0・perm-error'; });
      }
      return s.limits().then(function (lim) {
        if (!lim || !lim.images) { photoState = 'noimages'; photoDiag = '代碼 I0・' + (lim ? Object.keys(lim).join('+') : 'no-limits'); return; }
        sample = s;
        photoState = 'ready';
        if (lim.images.mediaTypes && lim.images.mediaTypes.length) $('#mcPhotoInput').accept = lim.images.mediaTypes.join(',');
      }, function (e) { photoState = 'noimages'; photoDiag = '代碼 I1・' + ((e && e.code) || 'limits-error'); });
    }).catch(function (e) { photoState = 'unavailable'; photoDiag = '代碼 S1・' + ((e && e.code) || 'use-error'); });
  }

  function useTiles(res) {
    var list = res && Array.isArray(res.tiles) ? res.tiles : [];
    var counts = {};
    var tiles = [];
    list.forEach(function (code) {
      var t = codeToTile(code);
      if (t == null) return;
      counts[t] = (counts[t] || 0) + 1;
      if (counts[t] <= 4) tiles.push(t);
    });
    var max = H.maxTiles(mode);
    var cut = Math.max(0, tiles.length - max);
    tiles = tiles.slice(0, max);
    if (!tiles.length) {
      photoStatus('沒認出麻將牌。再拍一次：牌排成一排、正面朝上、光線充足、拍近一點。', 'bad');
      return;
    }
    hand = tiles;
    render();
    var unsure = Math.max(0, Math.round(Number(res.unsure) || 0));
    var note = typeof res.note === 'string' ? res.note.trim().slice(0, 80) : '';
    photoStatus('辨識出 ' + tiles.length + ' 張，已經填進來了' + (unsure ? '，其中 ' + unsure + ' 張不太確定' : '') +
      (cut ? '（多的 ' + cut + ' 張沒放進來）' : '') + '。請對一下：錯的點上面的牌拿掉，少的用鍵盤補。' + (note ? note : ''));
  }

  function recognize(file) {
    if (!sample || photoCtl) return;
    var ctl = new AbortController();
    photoCtl = ctl;
    photoStatus('辨識中…通常要 10 到 30 秒，第一次會先問你要不要讓這個頁面使用 Claude。', 'busy');
    sample.json(photoPrompt(), { images: file, signal: ctl.signal }).then(useTiles, function (e) {
      var code = e && e.code;
      if (code === 'cancelled') photoStatus('已經停止。');
      else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable'].indexOf(code) !== -1) {
        hidePhoto(code === 'not_granted' ? 'denied' : code === 'images_unavailable' ? 'noimages' : 'unavailable');
      } else if (code === 'rate_limited') photoStatus('用得太頻繁了，等一下再試。', 'bad');
      else if (code === 'image_rejected') photoStatus('這張照片不能用，換一張試試（JPG、PNG）。', 'bad');
      else if (code === 'session_expired') photoStatus('要重新登入 Claude 才能用。', 'bad');
      else if (code === 'refused' || code === 'empty_completion' || code === 'invalid_json') {
        photoStatus('沒認出來。再拍一次：牌排成一排、正面朝上、光線充足、拍近一點。', 'bad');
      } else photoStatus('連線出了點問題，再試一次。', 'bad');
    }).then(function () {
      if (photoCtl === ctl) photoCtl = null;
      if ($('#mcPhotoStatus').className.indexOf('busy') !== -1) photoStatus('');
      $('#mcPhoto').disabled = false;
      $('#mcPhotoStop').hidden = true;
    });
  }

  // 一開頁面就先確認能不能用，按下去時才能馬上打開相機（不然手機會擋）
  checkPhoto();

  $('#mcPhoto').addEventListener('click', function () {
    if (photoCtl) return;
    if (photoState === 'ready' && sample) $('#mcPhotoInput').click();
    else explainPhoto();
  });
  $('#mcPhotoPerm').addEventListener('click', function () {
    var c = window.claude;
    if (!c || typeof c.use !== 'function') return;
    c.use('permissions').then(function (perms) {
      if (!perms) throw new Error('none');
      return perms.manage();
    }).then(function () {
      photoState = 'checking';
      $('#mcPhotoPerm').hidden = true;
      photoStatus('重新確認中…');
      checkPhoto();
      setTimeout(function () {
        if (photoState === 'ready') photoStatus('可以了，按「拍照辨識手牌」。');
        else photoStatus('權限改好後，請重新整理這個頁面，再按一次拍照。', 'bad');
      }, 1500);
    }).catch(function () {
      photoStatus('打不開權限設定。請從這個頁面右上角的選單找「權限」，把 Claude 打開。', 'bad');
    });
  });
  $('#mcPhotoStop').addEventListener('click', function () { if (photoCtl) photoCtl.abort(); });
  $('#mcPhotoInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = ''; // 同一張可以再選一次
    if (file) recognize(file);
  });

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
