/* 排七畫面：四家分頁、正在輸入的那家、牌面鍵盤、結算明細 */
(function () {
  'use strict';
  var T = window.TableApp;
  var P = window.PaiQi;
  var $ = T.$, $$ = T.$$, esc = T.esc;
  var RULE_KEYS = ['tuoShou', 'weiQi', 'shiSanGai', 'baoDian'];
  var KIND_DESC = {
    shiSanGai: '13 張全蓋，反敗為勝',
    weiQi: '脫手，最後一張打出 7',
    tuoShou: '一張都沒蓋',
    normal: '蓋牌點數最少'
  };
  var KIND_SHORT = { shiSanGai: '十三蓋', weiQi: '尾七', tuoShou: '脫手', normal: '' };
  var KEYBOARD = { a: 'A', 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 8: '8', 9: '9', 0: '10', t: '10', j: 'J', q: 'Q', k: 'K' };

  var active = 0;
  var lastAdded = null;
  var result = null;

  function pq() { return T.state.paiqi; }
  function seatPath(i) { return 'seats/' + i; }

  function totalCovered() {
    return pq().players.reduce(function (n, p) { return n + p.covered.length; }, 0);
  }
  function usedCounts() {
    var used = {};
    pq().players.forEach(function (p) { p.covered.forEach(function (r) { used[r] = (used[r] || 0) + 1; }); });
    return used;
  }
  function sortedCovered(covered) {
    return covered.slice().sort(function (a, b) { return P.RANKS.indexOf(a) - P.RANKS.indexOf(b); });
  }
  function seatInfo(i) { return result && totalCovered() > 0 ? result.players[i] : null; }

  /* ---------- 規則設定 ---------- */

  function syncSettings() {
    var s = pq().settings;
    var activeEl = document.activeElement;
    function put(el, v) { if (el !== activeEl) el.value = v; }
    put($('#rate'), s.rate);
    $('#mode-' + s.mode).checked = true;
    RULE_KEYS.forEach(function (k) {
      $('#on-' + k).checked = s[k].on;
      put($('#mult-' + k), s[k].mult);
    });
    put($('#threshold-baoDian'), s.baoDian.threshold);
    $('#modeHint').textContent = s.mode === 'full'
      ? '輸家付自己蓋牌的點數。'
      : '輸家付和贏家的點數差；十三蓋的贏家以 0 點計。';
  }

  function readSettings() {
    var cur = pq().settings;
    var raw = {
      rate: $('#rate').value === '' ? cur.rate : $('#rate').value,
      mode: $('#mode-diff').checked ? 'diff' : 'full'
    };
    RULE_KEYS.forEach(function (k) {
      var m = $('#mult-' + k).value;
      raw[k] = { on: $('#on-' + k).checked, mult: m === '' ? cur[k].mult : m };
    });
    var th = $('#threshold-baoDian').value;
    raw.baoDian.threshold = th === '' ? cur.baoDian.threshold : th;
    pq().settings = P.normalizeSettings(raw);
  }

  function renderChips() {
    var s = pq().settings;
    var chips = [
      '<span class="sum-chip">每點 <b>' + T.money(s.rate) + '</b></span>',
      '<span class="sum-chip">' + (s.mode === 'full' ? '付全額' : '付差額') + '</span>'
    ];
    var labels = { tuoShou: '脫手', weiQi: '尾張七', shiSanGai: '十三蓋', baoDian: '爆點' };
    RULE_KEYS.forEach(function (k) {
      var r = s[k];
      var extra = k === 'baoDian' ? ' &gt;' + T.fmtNum(r.threshold) : '';
      chips.push('<span class="sum-chip' + (r.on ? '' : ' off') + '">' + labels[k] + extra + ' <b>×' + T.fmtNum(r.mult) + '</b></span>');
    });
    $('#pqChips').innerHTML = chips.join('');
  }

  /* ---------- 畫面 ---------- */

  function buildRound() {
    return {
      firstIdx: pq().firstIdx,
      players: pq().players.map(function (p, i) {
        return { name: T.name(i), covered: p.covered, lastSeven: p.lastSeven };
      })
    };
  }

  function renderTabs() {
    pq().players.forEach(function (p, i) {
      var el = $('#pqTabs [data-seat="' + i + '"]');
      var info = seatInfo(i);
      el.setAttribute('aria-selected', String(active === i));
      $('[data-name]', el).textContent = T.name(i);
      $('[data-pts]', el).innerHTML = '<b>' + p.covered.length + '</b>張 <b>' + P.sumPoints(p.covered) + '</b>點';
      var net = info ? info.net : 0;
      var netEl = $('[data-net]', el);
      netEl.textContent = info ? T.signedMoney(net) : '—';
      netEl.className = 'st-net ' + T.signClass(net);
      var tags = [];
      if (T.me() === i) tags.push('<span class="st-tag me">我</span>');
      if (info && result.winner === i) tags.push('<span class="st-tag win">贏</span>');
      if (info && info.kind !== 'normal') tags.push('<span class="st-tag kind">' + KIND_SHORT[info.kind] + '</span>');
      if (info && info.baoDian) tags.push('<span class="st-tag bao">爆</span>');
      if (pq().firstIdx === i) tags.push('<span class="st-tag first">♠7</span>');
      $('[data-tags]', el).innerHTML = tags.join('');
    });
  }

  function renderActive() {
    var i = active;
    var p = pq().players[i];
    var info = seatInfo(i);
    var editable = T.canEdit();
    var count = p.covered.length;
    var waiting = totalCovered() === 0;

    $('#pqBadge').textContent = T.SEAT_CHARS[i];
    $('#pqNameText').textContent = T.name(i);
    $('#pqName').disabled = !editable;
    var first = $('#pqFirst');
    first.setAttribute('aria-pressed', String(pq().firstIdx === i));
    first.disabled = !editable;

    var tags = [];
    if (info && result.winner === i) tags.push('<span class="pill pill-win">贏家</span>');
    if (info && info.kind !== 'normal') tags.push('<span class="pill pill-kind">' + P.KIND_LABEL[info.kind] + '</span>');
    if (info && info.baoDian) tags.push('<span class="pill pill-bao">爆點</span>');
    var net = info ? '<span class="net ' + T.signClass(info.net) + '">' + T.signedMoney(info.net) + '</span>' : '';
    $('#pqTally').innerHTML = '蓋 <b>' + count + '</b> 張 · <b>' + P.sumPoints(p.covered) + '</b> 點 ' + tags.join('') + net;

    var added = lastAdded;
    lastAdded = null;
    $('#pqChipsCovered').innerHTML = count
      ? sortedCovered(p.covered).map(function (r) {
          var isNew = added === r;
          if (isNew) added = null;
          return editable
            ? '<button type="button" class="chip' + (isNew ? ' new' : '') + '" data-chip="' + r + '" aria-label="移除一張 ' + r + '">' + r + '</button>'
            : '<span class="chip">' + r + '</span>';
        }).join('')
      : '<span class="chips-empty">' + (waiting ? '用下方鍵盤點' + esc(T.name(i)) + '蓋的牌' : '沒有蓋牌（脫手）') + '</span>';

    $('#pqLast7Wrap').hidden = waiting || !(count === 0 && pq().settings.weiQi.on);
    var last7 = $('#pqLast7');
    last7.checked = p.lastSeven;
    last7.disabled = !editable;
    $('#pqClearSeat').disabled = !editable || count === 0;
  }

  function renderDock() {
    var used = usedCounts();
    var p = pq().players[active];
    var editable = T.canEdit();
    $$('#pqKeys .key').forEach(function (k) {
      var r = k.getAttribute('data-r');
      k.disabled = !editable || p.covered.length >= P.HAND_SIZE || (used[r] || 0) >= P.PER_RANK;
    });
    $('#pqUndo').disabled = !editable || p.covered.length === 0;
    $('#pqNextText').textContent = '下一家：' + T.name((active + 1) % 4);

    var commit = $('#commitBtn');
    var sum = $('#sumText');
    commit.textContent = '記入，下一局';
    commit.hidden = !editable;
    if (!result || totalCovered() === 0) {
      sum.innerHTML = '<span class="muted">' + (editable ? '點牌輸入這家的蓋牌，再按「下一家」' : '等有人輸入蓋牌') + '</span>';
      commit.disabled = true;
      return;
    }
    var w = result.players[result.winner];
    var kind = w.kind !== 'normal' ? '<span class="pill pill-kind">' + P.KIND_LABEL[w.kind] + ' ×' + T.fmtNum(result.winnerMult) + '</span>' : '';
    sum.innerHTML = '<span class="who">' + esc(w.name) + ' 贏</span>' + kind + '<span class="amt">收 ' + T.money(w.net) + '</span>';
    commit.disabled = false;
  }

  function whyText(r) {
    var w = r.players[r.winner];
    var ru = r.runnerUp != null ? r.players[r.runnerUp] : null;
    if (r.decidedBy === 'kind') return KIND_DESC[w.kind];
    if (r.decidedBy === 'points') return KIND_DESC[w.kind] + '（' + w.points + ' 點）';
    var order = '出牌順序較早（' + T.name(pq().firstIdx) + '拿 ♠7 先出）';
    if (w.kind !== 'normal') return '和' + ru.name + '都是' + P.KIND_LABEL[w.kind] + '，' + order;
    if (r.decidedBy === 'count') return '和' + ru.name + '同為 ' + w.points + ' 點，蓋的張數較少';
    return '和' + ru.name + '點數、張數都一樣，' + order;
  }

  function formulaText(t, r) {
    var from = r.players[t.from];
    var parts = [];
    if (r.settings.mode === 'full') parts.push(from.points + ' 點');
    else parts.push('(' + from.points + ' − ' + r.winnerPoints + ') 點');
    t.factors.forEach(function (f) { parts.push(f.label + ' ' + T.fmtNum(f.x)); });
    parts.push('每點 ' + T.money(t.rate));
    return parts.join(' × ');
  }

  function renderResult(errors) {
    var box = $('#pqResult');
    if (errors.length) {
      box.innerHTML = '<div class="alert"><b>這局的牌對不起來</b>' +
        errors.map(function (e) { return '<span>' + esc(e) + '</span>'; }).join('') +
        '<span>請移除多出來的牌。</span></div>';
      return;
    }
    if (totalCovered() === 0) {
      box.innerHTML = '<div class="guide"><strong>每局這樣輸入</strong><ol>' +
        '<li>翻開' + esc(T.name(active)) + '的蓋牌，用下方鍵盤一張一張點。</li>' +
        '<li>按「下一家」換人；脫手的人沒有牌，直接跳過。</li>' +
        '<li>四家輸入完，上方就是每個人的輸贏，按「記入，下一局」。</li>' +
        '</ol></div>';
      return;
    }
    var r = result;
    var w = r.players[r.winner];
    var kindHtml = w.kind !== 'normal'
      ? '<span class="win-kind">' + P.KIND_LABEL[w.kind] + ' <b>×' + T.fmtNum(r.winnerMult) + '</b></span>'
      : '';
    var transfers = r.transfers.map(function (t) {
      return '<li>' +
        '<div class="t-line"><span class="t-who">' + esc(r.players[t.from].name) + '<span class="arrow">付</span>' + esc(w.name) + '</span>' +
        '<span class="t-amt ' + (t.amount > 0 ? 'neg' : 'zero') + '">' + T.money(t.amount) + '</span></div>' +
        '<div class="t-formula">' + esc(formulaText(t, r)) + '</div>' +
      '</li>';
    }).join('');
    box.innerHTML =
      '<div class="win-card">' +
        '<p class="eyebrow">本局贏家</p>' +
        '<p class="win-name">' + esc(w.name) + '</p>' +
        '<p class="win-total">共收<b>' + T.money(w.net) + '</b></p>' +
        '<p class="win-meta">' + kindHtml + '<span class="win-why">' + esc(whyText(r)) + '</span></p>' +
      '</div>' +
      '<div class="panel-box">' +
        '<h3 class="sub">誰付多少</h3>' +
        '<ol class="transfers">' + transfers + '</ol>' +
      '</div>';
  }

  function render() {
    var round = buildRound();
    var errors = P.validateRound(round);
    result = errors.length ? null : P.settle(round, pq().settings);
    $('#pqRound').textContent = '第 ' + (T.countOf('paiqi') + 1) + ' 局';
    renderChips();
    renderTabs();
    renderActive();
    renderDock();
    renderResult(errors);
    $('#pqClear').disabled = !T.canEdit() || totalCovered() === 0;
  }

  /* ---------- 動作 ---------- */

  function clearRound() {
    pq().players.forEach(function (p, i) {
      p.covered = [];
      p.lastSeven = false;
      T.save(seatPath(i));
    });
  }

  function addCard(r) {
    if (!T.canEdit()) return;
    var p = pq().players[active];
    var used = usedCounts();
    if (p.covered.length >= P.HAND_SIZE || (used[r] || 0) >= P.PER_RANK) return;
    p.covered.push(r);
    p.lastSeven = false;
    lastAdded = r;
    T.changed(seatPath(active));
  }

  function undoCard() {
    if (!T.canEdit()) return;
    var p = pq().players[active];
    if (!p.covered.length) return;
    p.covered.pop();
    T.changed(seatPath(active));
  }

  function goSeat(i) {
    active = ((i % 4) + 4) % 4;
    T.render();
  }

  function commit() {
    if (!result || !T.canEdit() || totalCovered() === 0) return;
    var no = T.countOf('paiqi') + 1;
    T.commitEntry('paiqi', {
      winner: result.winner,
      kind: result.winnerKind,
      nets: result.players.map(function (p) { return p.net; })
    }, function () {
      clearRound();
      T.save('table/meta');
      active = 0;
      T.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      T.toast('排七第 ' + no + ' 局已記入');
    });
  }

  function init() {
    $('#pqTabs').innerHTML = T.SEAT_CHARS.map(function (seat, i) {
      return '<button type="button" class="seat-tab" role="tab" data-seat="' + i + '" aria-selected="false">' +
        '<span class="st-top"><span class="st-badge">' + seat + '</span><span class="st-name" data-name></span></span>' +
        '<span class="st-pts" data-pts></span>' +
        '<span class="st-net" data-net></span>' +
        '<span class="st-tags" data-tags></span>' +
      '</button>';
    }).join('');
    $('#pqKeys').innerHTML = P.RANKS.map(function (r) {
      var pts = P.RANK_POINTS[r];
      var showPts = r === 'A' || pts > 10;
      return '<button type="button" class="key" data-r="' + r + '" aria-label="蓋 ' + r + '（' + pts + ' 點）">' +
        '<span class="r">' + r + '</span>' + (showPts ? '<span class="p">' + pts + '</span>' : '') + '</button>';
    }).join('');

    $('#pqTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-seat]');
      if (b) goSeat(Number(b.getAttribute('data-seat')));
    });
    $('#pqKeys').addEventListener('click', function (e) {
      var k = e.target.closest('[data-r]');
      if (k && !k.disabled) addCard(k.getAttribute('data-r'));
    });
    $('#pqUndo').addEventListener('click', undoCard);
    $('#pqNext').addEventListener('click', function () { goSeat(active + 1); });
    $('#pqChipsCovered').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (!chip || !T.canEdit()) return;
      var p = pq().players[active];
      var at = p.covered.lastIndexOf(chip.getAttribute('data-chip'));
      if (at !== -1) p.covered.splice(at, 1);
      T.changed(seatPath(active));
    });
    $('#pqFirst').addEventListener('click', function () {
      if (!T.canEdit()) return;
      pq().firstIdx = active;
      T.changed('table/meta');
    });
    $('#pqLast7').addEventListener('change', function (e) {
      if (!T.canEdit()) return;
      pq().players[active].lastSeven = e.target.checked;
      T.changed(seatPath(active));
    });
    $('#pqClearSeat').addEventListener('click', function () {
      if (!T.canEdit()) return;
      var p = pq().players[active];
      p.covered = [];
      p.lastSeven = false;
      T.changed(seatPath(active));
    });
    $('#pqName').addEventListener('click', function () { T.openSetup({ scope: 'paiqi', focusName: active }); });
    $('#pqClear').addEventListener('click', function () {
      if (!T.canEdit()) return;
      clearRound();
      active = 0;
      T.render();
      T.toast('本局蓋牌已清空');
    });

    var form = $('#set-paiqi');
    form.addEventListener('input', function (e) {
      if (!T.canEdit()) return;
      readSettings();
      T.changed('table/meta', e.target.type === 'number' ? 400 : 0);
    });
    form.addEventListener('change', function () {
      if (!T.canEdit()) return;
      readSettings();
      syncSettings();
      T.changed('table/meta');
    });

    // 電腦上可以直接打字：A 2–6 8 9 0(=10) J Q K，退格退一張，→ 或 Enter 下一家
    document.addEventListener('keydown', function (e) {
      if (T.view.screen !== 'play' || T.view.game !== 'paiqi') return;
      if (e.metaKey || e.ctrlKey || e.altKey || $('#setup').open) return;
      if (e.target.closest('input, textarea, select, dialog')) return;
      var k = e.key.toLowerCase();
      if (KEYBOARD[k]) { e.preventDefault(); addCard(KEYBOARD[k]); }
      else if (e.key === 'Backspace') { e.preventDefault(); undoCard(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (e.target.closest('button')) return; e.preventDefault(); goSeat(active + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goSeat(active - 1); }
    });
  }

  T.games.paiqi = {
    init: init,
    render: render,
    commit: commit,
    syncSettings: syncSettings,
    resetSettings: function () { pq().settings = P.normalizeSettings(); T.changed('table/meta'); },
    onShow: function () {}
  };
})();
