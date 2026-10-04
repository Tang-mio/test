/* 21 點畫面：選莊家、每位閒家的下注與結果、結算 */
(function () {
  'use strict';
  var T = window.TableApp;
  var BJ = window.Blackjack;
  var $ = T.$, $$ = T.$$, esc = T.esc;
  var PATH = 'table/blackjack';
  var TONE = { win: 'good', blackjack: 'good', fiveCard: 'good', lose: 'bad', surrender: 'bad', push: 'even' };
  var builtFor = '';

  function bj() { return T.state.blackjack; }
  function count() { return bj().settings.count; }
  function betOf(i) { var b = bj().bets[i]; return b == null ? bj().settings.bet : b; }
  function niceStep(bet) {
    var steps = [1, 5, 10, 50, 100, 500, 1000, 5000];
    var best = 1;
    steps.forEach(function (s) { if (s <= bet / 2) best = s; });
    return best;
  }

  function players() {
    var list = [];
    for (var i = 0; i < count(); i++) {
      list.push({ idx: i, bet: betOf(i), result: bj().results[i], doubled: bj().doubled[i] });
    }
    return list;
  }
  function settleNow() { return BJ.settle({ banker: bj().banker, players: players() }, bj().settings); }

  /* ---------- 規則設定 ---------- */

  function syncSettings() {
    var s = bj().settings;
    var a = document.activeElement;
    if ($('#bjBet') !== a) $('#bjBet').value = s.bet;
    if ($('#bjMultBj') !== a) $('#bjMultBj').value = s.blackjack;
    if ($('#bjMultFive') !== a) $('#bjMultFive').value = s.fiveCard;
    $('#bjCount').textContent = s.count;
    $('#bjCountDown').disabled = s.count <= 2;
    $('#bjCountUp').disabled = s.count >= BJ.MAX_PLAYERS;
  }
  function readSettings() {
    var cur = bj().settings;
    bj().settings = BJ.normalizeSettings({
      count: cur.count,
      bet: $('#bjBet').value === '' ? cur.bet : $('#bjBet').value,
      blackjack: $('#bjMultBj').value === '' ? cur.blackjack : $('#bjMultBj').value,
      fiveCard: $('#bjMultFive').value === '' ? cur.fiveCard : $('#bjMultFive').value
    });
  }
  function setCount(n) {
    var s = bj().settings;
    s.count = Math.max(2, Math.min(BJ.MAX_PLAYERS, n));
    if (bj().banker >= s.count) bj().banker = 0;
    syncSettings();
    T.changed(PATH);
  }

  /* ---------- 畫面 ---------- */

  function buildPlayers() {
    var key = count() + '-' + bj().banker;
    if (key === builtFor) return;
    builtFor = key;
    var html = '';
    for (var i = 0; i < count(); i++) {
      if (i === bj().banker) continue;
      html += '<article class="bj-player" data-p="' + i + '">' +
        '<div class="bj-head"><span class="seat-badge" aria-hidden="true">' + T.badge(i) + '</span><span class="nm" data-nm></span><span class="net" data-net></span></div>' +
        '<div class="bj-bet"><span>下注</span>' +
          '<span class="stepper"><button type="button" data-bet-step="-1" aria-label="少下一點">−</button>' +
          '<input type="number" min="0" inputmode="numeric" data-bet id="bjbet-' + i + '" aria-label="下注金額"><button type="button" data-bet-step="1" aria-label="多下一點">+</button></span>' +
          '<label class="dbl"><input type="checkbox" data-dbl id="bjdbl-' + i + '">加倍</label>' +
        '</div>' +
        '<div class="bj-results" role="group" aria-label="結果">' +
          BJ.RESULTS.map(function (r) {
            return '<button type="button" class="res ' + TONE[r.id] + '" data-res="' + r.id + '" aria-pressed="false">' + r.name + '</button>';
          }).join('') +
        '</div>' +
      '</article>';
    }
    $('#bjPlayers').innerHTML = html;
  }

  function render() {
    var b = bj();
    var editable = T.canEdit();
    var r = settleNow();
    $('#bjRound').textContent = '第 ' + (T.countOf('blackjack') + 1) + ' 局';
    $('#bjChips').innerHTML = '<span class="sum-chip">' + count() + ' 人</span>' +
      '<span class="sum-chip">預設下注 <b>' + T.money(b.settings.bet) + '</b></span>' +
      '<span class="sum-chip">黑傑克 <b>×' + T.fmtNum(b.settings.blackjack) + '</b></span>' +
      '<span class="sum-chip">過五關 <b>×' + T.fmtNum(b.settings.fiveCard) + '</b></span>';
    $('#bjClear').disabled = !editable;

    var chips = [];
    for (var i = 0; i < count(); i++) {
      chips.push('<label><input type="radio" name="bjBanker" value="' + i + '"' + (i === b.banker ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
        T.badge(i) + ' ' + esc(T.name(i)) + '</label>');
    }
    $('#bjBanker').innerHTML = chips.join('');

    buildPlayers();
    var step = niceStep(b.settings.bet);
    $$('#bjPlayers [data-p]').forEach(function (card) {
      var i = Number(card.getAttribute('data-p'));
      var res = b.results[i];
      $('[data-nm]', card).textContent = T.name(i);
      var net = r.nets[i];
      var netEl = $('[data-net]', card);
      netEl.textContent = res ? T.signedMoney(net) : '';
      netEl.className = 'net ' + T.signClass(net);
      var input = $('[data-bet]', card);
      if (document.activeElement !== input) input.value = betOf(i);
      input.disabled = !editable;
      input.step = step;
      $$('[data-bet-step]', card).forEach(function (btn) { btn.disabled = !editable; });
      var dbl = $('[data-dbl]', card);
      dbl.checked = b.doubled[i];
      dbl.disabled = !editable || res === 'blackjack' || res === 'surrender';
      $$('[data-res]', card).forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(btn.getAttribute('data-res') === res));
        btn.disabled = !editable;
      });
    });

    renderResult(r);
    renderDock(r);
  }

  function renderResult(r) {
    var box = $('#bjResult');
    if (!r.lines.length) {
      box.innerHTML = '<div class="guide"><strong>每局這樣輸入</strong><ol>' +
        '<li>點選這局的莊家。</li><li>每位閒家確認下注金額，有加倍就勾「加倍」。</li>' +
        '<li>開牌後點每位閒家的結果，下方就會算出莊家賠多少、收多少。</li></ol></div>';
      return;
    }
    var bankerNet = r.bankerNet;
    var lines = r.lines.map(function (l) {
      var who = esc(T.name(l.idx));
      var flow = l.amount > 0 ? esc(T.name(r.banker)) + '<span class="arrow">付</span>' + who
        : l.amount < 0 ? who + '<span class="arrow">付</span>' + esc(T.name(r.banker)) : who + '<span class="arrow">平手</span>';
      return '<li><div class="t-line"><span class="t-who">' + flow + '</span><span class="t-amt ' + T.signClass(-l.amount) + '">' + T.money(l.amount) + '</span></div>' +
        '<div class="t-formula">' + esc(T.fmtNum(l.bet) + ' × ' + T.fmtNum(Math.abs(l.x)) + '（' + l.label + '）= ' + T.fmtNum(Math.abs(l.amount))) + '</div></li>';
    }).join('');
    var pending = r.pending.length ? '<p class="hint">' + r.pending.map(function (i) { return esc(T.name(i)); }).join('、') + '還沒選結果，不計。</p>' : '';
    box.innerHTML =
      '<div class="win-card">' +
        '<p class="eyebrow">莊家這局</p>' +
        '<p class="win-name">' + esc(T.name(r.banker)) + '</p>' +
        '<p class="win-total">' + (bankerNet >= 0 ? '共收' : '共賠') + '<b>' + T.money(bankerNet) + '</b></p>' +
      '</div>' +
      '<div class="panel-box"><h3 class="sub">誰付多少</h3><ol class="transfers">' + lines + '</ol>' + pending + '</div>';
  }

  function renderDock(r) {
    var sum = $('#sumText');
    var commit = $('#commitBtn');
    var editable = T.canEdit();
    commit.hidden = !editable;
    commit.textContent = '記入，下一局';
    if (!r.lines.length) {
      sum.innerHTML = '<span class="muted">' + (editable ? '點每位閒家的結果' : '等有人輸入') + '</span>';
      commit.disabled = true;
      return;
    }
    var left = r.pending.length ? '<span class="muted">還有 ' + r.pending.length + ' 人沒選</span>' : '';
    sum.innerHTML = '<span class="who">莊家 ' + esc(T.name(r.banker)) + '</span>' +
      '<span class="amt ' + T.signClass(r.bankerNet) + '">' + T.signedMoney(r.bankerNet) + '</span>' + left;
    commit.disabled = false;
  }

  /* ---------- 動作 ---------- */

  function change(delay) { T.changed(PATH, delay); }

  function clearResults() {
    for (var i = 0; i < BJ.MAX_PLAYERS; i++) { bj().results[i] = null; bj().doubled[i] = false; }
  }

  function commit() {
    if (!T.canEdit()) return;
    var r = settleNow();
    if (!r.lines.length) return;
    var no = T.countOf('blackjack') + 1;
    T.commitEntry('blackjack', { winner: r.banker, kind: 'banker', nets: r.nets }, function () {
      clearResults();
      change();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      T.toast('21點第 ' + no + ' 局已記入，下注金額保留');
    });
  }

  function init() {
    $('#bjBanker').addEventListener('change', function (e) {
      if (!T.canEdit() || !e.target.matches('input[name="bjBanker"]')) return;
      var i = Number(e.target.value);
      bj().banker = i;
      bj().results[i] = null;
      bj().doubled[i] = false;
      change();
    });
    var list = $('#bjPlayers');
    list.addEventListener('click', function (e) {
      var card = e.target.closest('[data-p]');
      if (!card || !T.canEdit()) return;
      var i = Number(card.getAttribute('data-p'));
      var res = e.target.closest('[data-res]');
      var step = e.target.closest('[data-bet-step]');
      if (res) {
        var id = res.getAttribute('data-res');
        bj().results[i] = bj().results[i] === id ? null : id;
        if (id === 'blackjack' || id === 'surrender') bj().doubled[i] = false;
        change();
      } else if (step) {
        var d = Number(step.getAttribute('data-bet-step')) * niceStep(bj().settings.bet);
        bj().bets[i] = Math.max(0, betOf(i) + d);
        change(300);
      }
    });
    list.addEventListener('input', function (e) {
      if (!e.target.matches('[data-bet]') || !T.canEdit()) return;
      var i = Number(e.target.closest('[data-p]').getAttribute('data-p'));
      var v = e.target.value;
      bj().bets[i] = v === '' || !isFinite(Number(v)) ? null : Math.max(0, Number(v));
      change(400);
    });
    list.addEventListener('change', function (e) {
      if (!e.target.matches('[data-dbl]') || !T.canEdit()) return;
      var i = Number(e.target.closest('[data-p]').getAttribute('data-p'));
      bj().doubled[i] = e.target.checked;
      change();
    });
    $('#bjClear').addEventListener('click', function () {
      if (!T.canEdit()) return;
      clearResults();
      change();
      T.toast('這局的結果已清空');
    });

    var form = $('#set-blackjack');
    form.addEventListener('input', function () {
      if (!T.canEdit()) return;
      readSettings();
      change(400);
    });
    form.addEventListener('change', function () {
      if (!T.canEdit()) return;
      readSettings();
      syncSettings();
      change();
    });
    $('#bjCountDown').addEventListener('click', function () { if (T.canEdit()) setCount(count() - 1); });
    $('#bjCountUp').addEventListener('click', function () { if (T.canEdit()) setCount(count() + 1); });
  }

  T.games.blackjack = {
    init: init,
    render: render,
    commit: commit,
    syncSettings: syncSettings,
    resetSettings: function () {
      var n = count();
      bj().settings = BJ.normalizeSettings({ count: n });
      change();
    },
    onShow: function () { builtFor = ''; }
  };
})();
