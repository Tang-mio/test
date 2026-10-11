/* 妞妞畫面：選莊家、每個人的牌型、閒家下注、同牌型比大小、結算；另外有「看牌算妞」：點五張牌算出妞幾 */
(function () {
  'use strict';
  var T = window.TableApp;
  var NN = window.Niuniu;
  var $ = T.$, $$ = T.$$, esc = T.esc;
  var PATH = 'table/niuniu';
  var builtFor = '';

  function nn() { return T.state.niuniu; }
  function settings() { return nn().settings; }
  function count() { return T.playerCount(); }
  function banker() { return nn().banker < count() ? nn().banker : 0; }
  function betOf(i) { var b = nn().bets[i]; return b == null ? settings().bet : b; }
  function handName(id) { return NN.BY_ID[id] ? NN.BY_ID[id].name : ''; }
  function niceStep(bet) {
    var steps = [1, 5, 10, 50, 100, 500, 1000, 5000];
    var best = 1;
    steps.forEach(function (s) { if (s <= bet / 2) best = s; });
    return best;
  }

  function settleNow() {
    var b = banker();
    var players = [];
    for (var i = 0; i < count(); i++) players.push({ idx: i, bet: betOf(i), hand: nn().hands[i], tie: nn().ties[i] });
    return NN.settle({ banker: b, bankerHand: nn().hands[b], players: players }, settings());
  }

  /* ---------- 規則設定 ---------- */

  function syncSettings() {
    var s = settings();
    var a = document.activeElement;
    if ($('#nnBet') !== a) $('#nnBet').value = s.bet;
    NN.MULTS.forEach(function (m) {
      var input = $('#nnMult-' + m.id);
      if (input !== a) input.value = s.mult[m.id];
    });
    NN.SPECIALS.forEach(function (id) { $('#nnSp-' + id).checked = s.special[id]; });
    $$('#nnTie input').forEach(function (r) { r.checked = r.value === s.tie; });
  }
  function readSettings() {
    var cur = settings();
    var mult = {};
    NN.MULTS.forEach(function (m) {
      var v = $('#nnMult-' + m.id).value;
      mult[m.id] = v === '' ? cur.mult[m.id] : v;
    });
    var special = {};
    NN.SPECIALS.forEach(function (id) { special[id] = $('#nnSp-' + id).checked; });
    var tie = $('#nnTie input:checked');
    nn().settings = NN.normalizeSettings({
      bet: $('#nnBet').value === '' ? cur.bet : $('#nnBet').value,
      mult: mult,
      special: special,
      tie: tie ? tie.value : cur.tie
    });
    // 關掉的特殊牌型，已經選的也拿掉
    nn().hands = nn().hands.map(function (h) { return NN.isHand(h, nn().settings) ? h : null; });
  }

  /* ---------- 畫面 ---------- */

  // 牌型按鈕：沒妞、妞1～妞9、妞妞，加上開著的特殊牌型
  function pickerHtml(label) {
    return '<div class="nn-pick" role="group" aria-label="' + esc(label) + '">' +
      NN.handsFor(settings()).map(function (h) {
        return '<button type="button" class="nn-h' + (h.special ? ' sp' : h.id === 'nn' || h.id === 'none' ? ' nn' : '') + '" data-hand="' + h.id + '"' +
          ' aria-pressed="false" aria-label="' + h.name + '">' + h.short + '</button>';
      }).join('') +
    '</div>';
  }
  var CALC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4" y="3" width="11" height="15" rx="2"></rect><path d="M9 21h9a2 2 0 0 0 2-2V8"></path></svg>';

  function build() {
    var s = settings();
    var key = count() + '-' + banker() + '-' + NN.SPECIALS.map(function (id) { return s.special[id] ? 1 : 0; }).join('');
    if (key === builtFor) return;
    builtFor = key;
    $('#nnBankHand').innerHTML =
      '<div class="nn-row-head"><span class="set-label">莊家的牌型</span>' +
      '<button type="button" class="btn nn-calc-btn" data-calc="' + banker() + '">' + CALC_ICON + '看牌算妞</button></div>' +
      pickerHtml('莊家的牌型');
    var html = '';
    for (var i = 0; i < count(); i++) {
      if (i === banker()) continue;
      html += '<article class="bj-player nn-player" data-p="' + i + '">' +
        '<div class="bj-head"><span class="seat-badge" aria-hidden="true">' + T.badge(i) + '</span><span class="nm" data-nm></span>' +
          '<span class="nn-cur" data-cur></span><span class="net" data-net></span></div>' +
        '<div class="bj-bet"><span>下注</span>' +
          '<span class="stepper"><button type="button" data-bet-step="-1" aria-label="少下一點">−</button>' +
          '<input type="number" min="0" inputmode="numeric" data-bet id="nnbet-' + i + '" aria-label="下注金額"><button type="button" data-bet-step="1" aria-label="多下一點">+</button></span>' +
          '<button type="button" class="btn nn-calc-btn" data-calc="' + i + '">' + CALC_ICON + '看牌算妞</button>' +
        '</div>' +
        pickerHtml('牌型') +
        '<div class="nn-tie" data-tie hidden><span>同牌型，誰的最大張大？</span>' +
          '<span class="nn-tie-btns"><button type="button" class="res bad" data-tie-v="banker" aria-pressed="false">莊家大</button>' +
          '<button type="button" class="res good" data-tie-v="player" aria-pressed="false">閒家大</button></span></div>' +
      '</article>';
    }
    $('#nnPlayers').innerHTML = html;
  }

  function syncPicker(box, hand, editable) {
    $$('[data-hand]', box).forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-hand') === hand));
      btn.disabled = !editable;
    });
  }

  function render() {
    var n = nn();
    var s = settings();
    var editable = T.canEdit();
    var b = banker();
    var r = settleNow();
    $('#nnRound').textContent = '第 ' + (T.countOf('niuniu') + 1) + ' 局';
    var sp = NN.SPECIALS.filter(function (id) { return s.special[id]; });
    $('#nnChips').innerHTML = '<span class="sum-chip">' + count() + ' 人</span>' +
      '<span class="sum-chip">預設下注 <b>' + T.money(s.bet) + '</b></span>' +
      '<span class="sum-chip">妞7～9 <b>×' + [s.mult.n7, s.mult.n8, s.mult.n9].filter(function (x, i, a) { return a.indexOf(x) === i; }).map(T.fmtNum).join('/') + '</b></span>' +
      '<span class="sum-chip">妞妞 <b>×' + T.fmtNum(s.mult.nn) + '</b></span>' +
      (sp.length ? '<span class="sum-chip">' + sp.map(handName).join('、') + '</span>' : '<span class="sum-chip">不算特殊牌型</span>') +
      '<span class="sum-chip">' + (s.tie === 'banker' ? '同牌型莊家贏' : '同牌型比大張') + '</span>';
    $('#nnClear').disabled = !editable;

    var chips = [];
    for (var i = 0; i < count(); i++) {
      chips.push('<label><input type="radio" name="nnBanker" value="' + i + '"' + (i === b ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
        T.badge(i) + ' ' + esc(T.name(i)) + '</label>');
    }
    $('#nnBanker').innerHTML = chips.join('');

    build();
    syncPicker($('#nnBankHand'), n.hands[b], editable);
    $$('#nnBankHand [data-calc]').forEach(function (btn) { btn.disabled = !editable; });
    var lineOf = {};
    r.lines.forEach(function (l) { lineOf[l.idx] = l; });
    var step = niceStep(s.bet);
    $$('#nnPlayers [data-p]').forEach(function (card) {
      var i = Number(card.getAttribute('data-p'));
      var hand = n.hands[i];
      var line = lineOf[i];
      $('[data-nm]', card).textContent = T.name(i);
      $('[data-cur]', card).textContent = hand ? handName(hand) : '';
      var netEl = $('[data-net]', card);
      netEl.textContent = line ? T.signedMoney(line.amount) : '';
      netEl.className = 'net ' + T.signClass(line ? line.amount : 0);
      card.classList.toggle('won', !!line && line.amount > 0);
      card.classList.toggle('lost', !!line && line.amount < 0);
      var input = $('[data-bet]', card);
      if (document.activeElement !== input) input.value = betOf(i);
      input.disabled = !editable;
      input.step = step;
      $$('[data-bet-step], [data-calc]', card).forEach(function (btn) { btn.disabled = !editable; });
      syncPicker(card, hand, editable);
      // 同牌型而且要比最大張：問誰大
      var same = s.tie === 'card' && hand && n.hands[b] && hand === n.hands[b];
      var tieBox = $('[data-tie]', card);
      tieBox.hidden = !same;
      $$('[data-tie-v]', tieBox).forEach(function (btn) {
        btn.setAttribute('aria-pressed', String(btn.getAttribute('data-tie-v') === n.ties[i]));
        btn.disabled = !editable;
      });
      card.classList.toggle('need-tie', !!same && !n.ties[i]);
    });

    renderResult(r);
    renderDock(r);
  }

  function lineFormula(l, r) {
    var why;
    if (l.sameHand) why = '都是' + handName(l.hand) + '，' + (l.winner === 'player' ? '閒家' : '莊家') + (r.settings.tie === 'banker' ? '贏（同牌型莊家贏）' : '最大張比較大');
    else if (l.winner === 'player') why = '閒家' + handName(l.hand) + ' 贏 莊家' + handName(l.bankerHand);
    else why = '莊家' + handName(l.bankerHand) + ' 贏 閒家' + handName(l.hand);
    return T.fmtNum(l.bet) + ' × ' + T.fmtNum(Math.abs(l.x)) + '（' + why + '）= ' + T.fmtNum(Math.abs(l.amount));
  }

  function renderResult(r) {
    var box = $('#nnResult');
    if (!r.lines.length) {
      var steps = '<li>點選這局的莊家。</li><li>每位閒家確認下注金額。</li>' +
        '<li>開牌後點莊家和每位閒家的牌型；不會算就按「看牌算妞」點五張牌。</li>' +
        '<li>同牌型時選誰的最大張比較大，下方就會算出誰付多少。</li>';
      var wait = r.bankerHand ? '' : '<p class="hint">先點莊家的牌型。</p>';
      box.innerHTML = '<div class="guide"><strong>每局這樣輸入</strong><ol>' + steps + '</ol>' + wait + '</div>';
      return;
    }
    var bankerName = esc(T.name(r.banker));
    var lines = r.lines.map(function (l) {
      var who = esc(T.name(l.idx));
      var flow = l.amount > 0 ? bankerName + '<span class="arrow">付</span>' + who : who + '<span class="arrow">付</span>' + bankerName;
      return '<li><div class="t-line"><span class="t-who">' + flow + '</span><span class="t-amt ' + T.signClass(-Math.abs(l.amount)) + '">' + T.money(l.amount) + '</span></div>' +
        '<div class="t-formula">' + esc(lineFormula(l, r)) + '</div></li>';
    }).join('');
    var notes = '';
    if (r.ties.length) notes += '<p class="hint warn-text">' + r.ties.map(function (i) { return esc(T.name(i)); }).join('、') + '和莊家同牌型，選誰的最大張比較大。</p>';
    if (r.pending.length) notes += '<p class="hint">' + r.pending.map(function (i) { return esc(T.name(i)); }).join('、') + '還沒選牌型，不計。</p>';
    box.innerHTML =
      '<div class="win-card">' +
        '<p class="eyebrow">莊家這局</p>' +
        '<p class="win-name">' + bankerName + '</p>' +
        '<p class="win-total">' + (r.bankerNet >= 0 ? '共收' : '共賠') + '<b>' + T.money(r.bankerNet) + '</b></p>' +
        '<p class="win-meta"><span class="win-kind">' + handName(r.bankerHand) + '</span></p>' +
      '</div>' +
      '<div class="panel-box"><h3 class="sub">誰付多少</h3><ol class="transfers">' + lines + '</ol>' + notes + '</div>';
  }

  function renderDock(r) {
    var sum = $('#sumText');
    var commit = $('#commitBtn');
    var editable = T.canEdit();
    commit.hidden = !editable;
    commit.textContent = '記入，下一局';
    if (!r.lines.length) {
      var tip = !r.bankerHand ? '點莊家的牌型' : r.ties.length ? '選同牌型誰大' : '點每位閒家的牌型';
      sum.innerHTML = '<span class="muted">' + (editable ? tip : '等有人輸入') + '</span>';
      commit.disabled = true;
      return;
    }
    var left = r.pending.length + r.ties.length;
    sum.innerHTML = '<span class="who">莊家 ' + esc(T.name(r.banker)) + '</span>' +
      '<span class="pill pill-kind">' + handName(r.bankerHand) + '</span>' +
      '<span class="amt ' + T.signClass(r.bankerNet) + '">' + T.signedMoney(r.bankerNet) + '</span>' +
      (left ? '<span class="muted">還有 ' + left + ' 人沒定</span>' : '');
    commit.disabled = false;
  }

  // 規則頁：倍數表照目前設定
  function renderRules() {
    var s = settings();
    $('#nnRulesTable tbody').innerHTML = NN.HANDS.slice().reverse().filter(function (h) { return !h.special || s.special[h.id]; }).map(function (h) {
      var what = h.note || (h.id === 'none' ? '挑不出三張湊成 10 的倍數' : h.id === 'nn' ? '剩下兩張加起來是 10 或 20' : '剩下兩張加起來個位數是 ' + h.id.slice(1));
      return '<tr><td>' + h.name + '</td><td style="white-space:normal">' + what + '</td><td class="num">×' + T.fmtNum(s.mult[h.mult]) + '</td></tr>';
    }).join('');
    $('#nnRulesNow').textContent = '目前設定：預設下注 ' + T.money(s.bet) + '，' +
      (s.tie === 'banker' ? '同牌型莊家贏' : '同牌型比最大的一張') + '。倍數和特殊牌型可以在「名字・規則」裡改。';
  }

  /* ---------- 看牌算妞 ---------- */

  var calcFor = null; // 幫誰算
  var calcCards = [];

  function calcResult() {
    if (calcCards.length < 5) return null;
    return NN.evaluate(calcCards, settings());
  }

  function renderCalc() {
    var slots = '';
    for (var k = 0; k < 5; k++) {
      var c = calcCards[k];
      slots += c
        ? '<button type="button" class="nn-card" data-rm="' + k + '" aria-label="拿掉 ' + c + '"><span>' + c + '</span></button>'
        : '<span class="nn-card empty" aria-hidden="true"></span>';
    }
    var r = calcResult();
    var res = $('#nnCalcResult');
    if (!r) {
      res.innerHTML = '<p class="hint">點 5 張牌（點上面的牌可以拿掉）。10、J、Q、K 算 10，A 算 1。</p>';
    } else {
      var v = function (i) { return calcCards[i]; };
      var sum = function (idx) { return idx.reduce(function (a, i) { return a + NN.cardValue(calcCards[i]); }, 0); };
      var how;
      if (r.three) {
        how = r.three.map(v).join(' + ') + ' = ' + sum(r.three) + '，湊成 10 的倍數；剩下 ' + r.rest.map(v).join(' + ') + ' = ' + sum(r.rest);
      } else if (r.id === 'none') {
        how = '挑不出三張加起來是 10 的倍數';
      } else {
        how = NN.BY_ID[r.id].note;
      }
      res.innerHTML = '<div class="mc-advice"><span class="mc-advice-lb">算出來</span><p><b class="nn-big">' + handName(r.id) + '</b>' +
        '　倍數 ×' + T.fmtNum(NN.multOf(r.id, settings())) + '</p><p class="mc-sub">' + esc(how) + '。最大的一張是 ' + r.high + '。</p>' +
        '<button type="button" class="btn primary mc-do" id="nnCalcUse">填入' + (calcFor === banker() ? '莊家' : '') + '：' + handName(r.id) + '</button></div>';
    }
    $('#nnCalcCards').innerHTML = slots;
    var used = {};
    calcCards.forEach(function (c) { used[c] = (used[c] || 0) + 1; });
    $('#nnCalcKeys').innerHTML = NN.RANKS.map(function (k) {
      var n = used[k] || 0;
      return '<button type="button" class="nn-key" data-k="' + k + '"' + (calcCards.length >= 5 || n >= 4 ? ' disabled' : '') + '>' + k +
        (n ? '<span class="used">' + n + '</span>' : '') + '</button>';
    }).join('');
  }

  function openCalc(i) {
    calcFor = i;
    calcCards = [];
    $('#nnCalcWho').textContent = (i === banker() ? '莊家 ' : '') + T.name(i);
    renderCalc();
    var dlg = $('#nnCalc');
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }
  function closeCalc() {
    var dlg = $('#nnCalc');
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  /* ---------- 動作 ---------- */

  function change(delay) { T.changed(PATH, delay); }

  function setHand(i, id) {
    var n = nn();
    n.hands[i] = n.hands[i] === id ? null : id;
    // 牌型變了，同牌型誰大要重選
    if (i === banker()) n.ties = n.ties.map(function () { return null; });
    else n.ties[i] = null;
  }

  function clearRound() {
    var n = nn();
    n.hands = n.hands.map(function () { return null; });
    n.ties = n.ties.map(function () { return null; });
  }

  function commit() {
    if (!T.canEdit()) return;
    var r = settleNow();
    if (!r.lines.length) return;
    var no = T.countOf('niuniu') + 1;
    T.commitEntry('niuniu', { winner: r.banker, kind: r.bankerHand, nets: r.nets }, function () {
      clearRound();
      change();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      T.toast('妞妞第 ' + no + ' 局已記入，下注金額保留');
    });
  }

  function init() {
    $('#nnBanker').addEventListener('change', function (e) {
      if (!T.canEdit() || !e.target.matches('input[name="nnBanker"]')) return;
      var n = nn();
      n.banker = Number(e.target.value);
      n.ties = n.ties.map(function () { return null; });
      change();
    });
    $('#nnBankHand').addEventListener('click', function (e) {
      if (!T.canEdit()) return;
      var h = e.target.closest('[data-hand]');
      var c = e.target.closest('[data-calc]');
      if (h) { setHand(banker(), h.getAttribute('data-hand')); change(); }
      else if (c) openCalc(banker());
    });
    var list = $('#nnPlayers');
    list.addEventListener('click', function (e) {
      var card = e.target.closest('[data-p]');
      if (!card || !T.canEdit()) return;
      var i = Number(card.getAttribute('data-p'));
      var h = e.target.closest('[data-hand]');
      var step = e.target.closest('[data-bet-step]');
      var tie = e.target.closest('[data-tie-v]');
      var c = e.target.closest('[data-calc]');
      if (h) {
        setHand(i, h.getAttribute('data-hand'));
        change();
      } else if (tie) {
        var v = tie.getAttribute('data-tie-v');
        nn().ties[i] = nn().ties[i] === v ? null : v;
        change();
      } else if (step) {
        var d = Number(step.getAttribute('data-bet-step')) * niceStep(settings().bet);
        nn().bets[i] = Math.max(0, betOf(i) + d);
        change(300);
      } else if (c) {
        openCalc(i);
      }
    });
    list.addEventListener('input', function (e) {
      if (!e.target.matches('[data-bet]') || !T.canEdit()) return;
      var i = Number(e.target.closest('[data-p]').getAttribute('data-p'));
      var v = e.target.value;
      nn().bets[i] = v === '' || !isFinite(Number(v)) ? null : Math.max(0, Number(v));
      change(400);
    });
    $('#nnClear').addEventListener('click', function () {
      if (!T.canEdit()) return;
      clearRound();
      change();
      T.toast('這局的牌型已清空');
    });

    // 看牌算妞
    $('#nnCalcKeys').addEventListener('click', function (e) {
      var k = e.target.closest('[data-k]');
      if (!k || k.disabled || calcCards.length >= 5) return;
      calcCards.push(k.getAttribute('data-k'));
      renderCalc();
    });
    $('#nnCalcCards').addEventListener('click', function (e) {
      var rm = e.target.closest('[data-rm]');
      if (!rm) return;
      calcCards.splice(Number(rm.getAttribute('data-rm')), 1);
      renderCalc();
    });
    $('#nnCalcResult').addEventListener('click', function (e) {
      if (!e.target.closest('#nnCalcUse') || !T.canEdit()) return;
      var r = calcResult();
      if (!r || calcFor == null) return;
      if (nn().hands[calcFor] !== r.id) setHand(calcFor, r.id);
      closeCalc();
      change();
      T.toast((calcFor === banker() ? '莊家' : T.name(calcFor)) + '：' + handName(r.id));
    });
    $('#nnCalcClear').addEventListener('click', function () { calcCards = []; renderCalc(); });
    $('#nnCalcClose').addEventListener('click', closeCalc);
    $('#nnCalc').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeCalc(); });

    var form = $('#set-niuniu');
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
  }

  T.games.niuniu = {
    init: init,
    render: render,
    renderRules: renderRules,
    commit: commit,
    syncSettings: syncSettings,
    resetSettings: function () { nn().settings = NN.normalizeSettings(); change(); },
    onShow: function () { builtFor = ''; }
  };
})();
