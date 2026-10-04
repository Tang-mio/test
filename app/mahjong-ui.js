/* 麻將畫面：莊家與連莊、誰胡、怎麼胡、幾台、結算 */
(function () {
  'use strict';
  var T = window.TableApp;
  var MJ = window.Mahjong;
  var $ = T.$, $$ = T.$$, esc = T.esc;
  var PATH = 'table/mahjong';
  var GROUPS = [['basic', '常見'], ['honor', '字牌與花'], ['big', '大牌']];

  function mj() { return T.state.mahjong; }
  function hand() { return mj().hand; }
  function isDraw() { return hand().winner === -1; }

  function tai() { return MJ.countTai(hand().picks, hand().method, hand().extra); }

  function settleNow() {
    var h = hand();
    if (h.winner == null || h.winner < 0) return { ready: false };
    return MJ.settle({
      dealer: mj().dealer, streak: mj().streak, winner: h.winner, method: h.method, discarder: h.discarder, tai: tai().tai
    }, mj().settings);
  }

  /* ---------- 規則設定 ---------- */

  function syncSettings() {
    var s = mj().settings;
    var a = document.activeElement;
    if ($('#mjBase') !== a) $('#mjBase').value = s.base;
    if ($('#mjPerTai') !== a) $('#mjPerTai').value = s.perTai;
  }
  function readSettings() {
    var cur = mj().settings;
    mj().settings = MJ.normalizeSettings({
      base: $('#mjBase').value === '' ? cur.base : $('#mjBase').value,
      perTai: $('#mjPerTai').value === '' ? cur.perTai : $('#mjPerTai').value
    });
  }

  /* ---------- 畫面 ---------- */

  function seatButton(i, opts) {
    return '<button type="button" class="sp" data-seat="' + i + '" aria-pressed="' + !!opts.on + '"' + (opts.disabled ? ' disabled' : '') + '>' +
      (i === mj().dealer ? '<span class="tag">莊</span>' : '') +
      '<span class="b">' + T.SEAT_CHARS[i] + '</span><span class="nm">' + esc(T.name(i)) + '</span></button>';
  }

  function render() {
    var m = mj();
    var h = hand();
    var editable = T.canEdit();
    var dTai = MJ.dealerTai(m.streak);

    $('#mjRound').textContent = '第 ' + m.nextRound + ' 將';
    $('#mjChips').innerHTML = '<span class="sum-chip">底 <b>' + T.money(m.settings.base) + '</b></span>' +
      '<span class="sum-chip">每台 <b>' + T.money(m.settings.perTai) + '</b></span>';
    $('#mjClear').disabled = !editable;

    // 莊家
    $('#mjDealer').innerHTML = T.SEAT_CHARS.map(function (c, i) {
      return '<button type="button" data-dealer="' + i + '" aria-pressed="' + (i === m.dealer) + '" title="' + esc(T.name(i)) + '"' + (editable ? '' : ' disabled') + '>' + c + '</button>';
    }).join('');
    $('#mjStreak').textContent = m.streak;
    $('#mjStreakDown').disabled = !editable || m.streak === 0;
    $('#mjStreakUp').disabled = !editable;
    $('#mjDealerHint').textContent = T.name(m.dealer) + '當莊' + (m.streak ? '，連 ' + m.streak + ' 拉 ' + m.streak : '') +
      '：莊家胡牌或莊家付錢時，多算 ' + dTai + ' 台。';

    // 1 誰胡
    $('#mjWinner').innerHTML = [0, 1, 2, 3].map(function (i) {
      return seatButton(i, { on: h.winner === i, disabled: !editable });
    }).join('');
    var draw = $('#mjDraw');
    draw.setAttribute('aria-pressed', String(isDraw()));
    draw.disabled = !editable;

    // 2 怎麼胡
    var hasWinner = h.winner != null && h.winner >= 0;
    $('#mjStep2').classList.toggle('off', !hasWinner);
    $$('#mjMethod [data-method]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(h.method === b.getAttribute('data-method')));
      b.disabled = !editable || !hasWinner;
    });
    $('#mjDiscWrap').hidden = h.method !== 'fangQiang' || !hasWinner;
    $('#mjDiscarder').innerHTML = [0, 1, 2, 3].map(function (i) {
      return seatButton(i, { on: h.discarder === i, disabled: !editable || i === h.winner });
    }).join('');

    // 3 幾台
    var ready3 = hasWinner && !!h.method;
    var t = tai();
    $('#mjStep3').classList.toggle('off', !ready3);
    $('#mjTaiSum').textContent = ready3 ? t.tai : 0;
    $$('#mjTai [data-pat]').forEach(function (b) {
      var p = MJ.PATTERNS.filter(function (q) { return q.id === b.getAttribute('data-pat'); })[0];
      var n = h.picks[p.id] || 0;
      b.setAttribute('aria-pressed', String(n > 0));
      b.disabled = !editable || !ready3 || (p.only && h.method && p.only !== h.method);
      $('.nm', b).textContent = p.name + (n > 1 ? ' ×' + n : '');
    });
    $('#mjExtra').textContent = h.extra > 0 ? '+' + h.extra : h.extra;
    $('#mjExtraDown').disabled = !editable || !ready3;
    $('#mjExtraUp').disabled = !editable || !ready3;
    $('#mjTaiList').textContent = ready3 && t.items.length
      ? t.items.map(function (it) { return it.name + ' ' + it.tai; }).join('・') + '（不含莊家台）'
      : '';

    renderResult();
    renderDock();
  }

  function renderResult() {
    var box = $('#mjResult');
    var m = mj();
    if (isDraw()) {
      box.innerHTML = '<div class="guide"><strong>流局</strong><ol><li>沒人胡，不用付錢。</li><li>按「記流局」後，' +
        esc(T.name(m.dealer)) + '繼續當莊，變成連 ' + (m.streak + 1) + '。</li></ol></div>';
      return;
    }
    var r = settleNow();
    if (!r.ready) {
      box.innerHTML = '<div class="guide"><strong>每將這樣輸入</strong><ol>' +
        '<li>確認莊家和連莊次數。</li><li>點誰胡；沒人胡就按「流局」。</li>' +
        '<li>選自摸或放槍，放槍要再點是誰打的。</li><li>點選牌型算台數，下方就會算出誰付多少。</li></ol></div>';
      return;
    }
    var w = r.winner;
    var transfers = r.transfers.map(function (t) {
      var f = T.fmtNum(t.base) + ' + ' + (t.dealerTai ? '(' + t.tai + ' + 莊家 ' + t.dealerTai + ')' : t.tai) + ' 台 × ' + T.fmtNum(t.perTai);
      return '<li><div class="t-line"><span class="t-who">' + esc(T.name(t.from)) + (t.from === m.dealer ? '（莊）' : '') +
        '<span class="arrow">付</span>' + esc(T.name(w)) + '</span><span class="t-amt neg">' + T.money(t.amount) + '</span></div>' +
        '<div class="t-formula">' + esc(f) + '</div></li>';
    }).join('');
    box.innerHTML =
      '<div class="win-card">' +
        '<p class="eyebrow">這將胡牌</p>' +
        '<p class="win-name">' + esc(T.name(w)) + '</p>' +
        '<p class="win-total">共收<b>' + T.money(r.nets[w]) + '</b></p>' +
        '<p class="win-meta"><span class="win-kind">' + (r.method === 'ziMo' ? '自摸' : '胡 ' + esc(T.name(hand().discarder))) +
        ' <b>' + r.tai + ' 台</b></span>' + (w === m.dealer ? '<span class="win-why">莊家胡，每家多 ' + r.dealerTai + ' 台</span>' : '') + '</p>' +
      '</div>' +
      '<div class="panel-box"><h3 class="sub">誰付多少</h3><ol class="transfers">' + transfers + '</ol></div>';
  }

  function renderDock() {
    var sum = $('#sumText');
    var commit = $('#commitBtn');
    var editable = T.canEdit();
    commit.hidden = !editable;
    if (isDraw()) {
      sum.innerHTML = '<span class="who">流局</span><span class="muted">' + esc(T.name(mj().dealer)) + '連莊</span>';
      commit.textContent = '記流局';
      commit.disabled = false;
      return;
    }
    var r = settleNow();
    commit.textContent = '記入，下一將';
    if (!r.ready) {
      var h = hand();
      var tip = h.winner == null ? '點誰胡' : !h.method ? '選自摸或放槍' : '點是誰放槍';
      sum.innerHTML = '<span class="muted">' + (editable ? tip : '等有人輸入') + '</span>';
      commit.disabled = true;
      return;
    }
    sum.innerHTML = '<span class="who">' + esc(T.name(r.winner)) + ' ' + (r.method === 'ziMo' ? '自摸' : '胡') + '</span>' +
      '<span class="pill pill-kind">' + r.tai + ' 台</span><span class="amt">收 ' + T.money(r.nets[r.winner]) + '</span>';
    commit.disabled = false;
  }

  /* ---------- 動作 ---------- */

  function change() { T.changed(PATH); }

  function resetHand() { mj().hand = T.emptyHand(); }

  function commit() {
    if (!T.canEdit()) return;
    var m = mj();
    if (isDraw()) {
      var nd = MJ.nextDealer(m.dealer, m.streak, -1);
      m.dealer = nd.dealer;
      m.streak = nd.streak;
      m.nextRound += 1;
      resetHand();
      change();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      T.toast('流局，' + T.name(m.dealer) + '連莊（連 ' + m.streak + '）');
      return;
    }
    var r = settleNow();
    if (!r.ready) return;
    var no = m.nextRound;
    T.commitEntry('mahjong', { winner: r.winner, kind: r.method, tai: r.tai, nets: r.nets }, function () {
      var cur = mj();
      var nd = MJ.nextDealer(cur.dealer, cur.streak, r.winner);
      var same = nd.dealer === cur.dealer;
      cur.dealer = nd.dealer;
      cur.streak = nd.streak;
      resetHand();
      change();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      T.toast('第 ' + no + ' 將已記入，' + T.name(cur.dealer) + (same ? '連莊（連 ' + cur.streak + '）' : '當莊'));
    });
  }

  function init() {
    // 台型按鈕
    $('#mjTai').innerHTML = GROUPS.map(function (g) {
      return '<div class="tai-group"><h4>' + g[1] + '</h4><div class="tai-chips">' +
        MJ.PATTERNS.filter(function (p) { return p.group === g[0]; }).map(function (p) {
          return '<button type="button" class="tai-chip" data-pat="' + p.id + '" aria-pressed="false"' + (p.note ? ' title="' + esc(p.note) + '"' : '') + '>' +
            '<span class="nm">' + p.name + '</span><b>' + p.tai + '</b></button>';
        }).join('') + '</div></div>';
    }).join('');

    // 規則頁的台數表
    var rows = [
      ['自摸', '自己摸到胡的牌，選「自摸」就自動算', '1'],
      ['門清自摸', '門清又自摸，兩個合計', '3']
    ].concat(MJ.PATTERNS.map(function (p) {
      return [p.name, (p.note || '') + (p.only === 'ziMo' ? (p.note ? '；' : '') + '限自摸' : p.only === 'fangQiang' ? (p.note ? '；' : '') + '限胡別人打的' : ''), p.max > 1 ? '每組 ' + p.tai : String(p.tai)];
    }));
    $('#mjTaiTable tbody').innerHTML = rows.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td style="white-space:normal">' + esc(r[1]) + '</td><td class="num">' + esc(r[2]) + '</td></tr>';
    }).join('');

    $('#mjDealer').addEventListener('click', function (e) {
      var b = e.target.closest('[data-dealer]');
      if (!b || !T.canEdit()) return;
      var i = Number(b.getAttribute('data-dealer'));
      if (i !== mj().dealer) { mj().dealer = i; mj().streak = 0; }
      change();
    });
    $('#mjStreakDown').addEventListener('click', function () { if (T.canEdit() && mj().streak > 0) { mj().streak -= 1; change(); } });
    $('#mjStreakUp').addEventListener('click', function () { if (T.canEdit()) { mj().streak += 1; change(); } });

    $('#mjWinner').addEventListener('click', function (e) {
      var b = e.target.closest('[data-seat]');
      if (!b || !T.canEdit()) return;
      var i = Number(b.getAttribute('data-seat'));
      var h = hand();
      h.winner = h.winner === i ? null : i;
      if (h.discarder === h.winner) h.discarder = null;
      change();
    });
    $('#mjDraw').addEventListener('click', function () {
      if (!T.canEdit()) return;
      var h = hand();
      if (h.winner === -1) h.winner = null;
      else { mj().hand = T.emptyHand(); mj().hand.winner = -1; }
      change();
    });
    $('#mjMethod').addEventListener('click', function (e) {
      var b = e.target.closest('[data-method]');
      if (!b || !T.canEdit()) return;
      var h = hand();
      h.method = b.getAttribute('data-method');
      if (h.method === 'ziMo') h.discarder = null;
      h.picks = MJ.cleanPicks(h.picks, h.method);
      change();
    });
    $('#mjDiscarder').addEventListener('click', function (e) {
      var b = e.target.closest('[data-seat]');
      if (!b || b.disabled || !T.canEdit()) return;
      hand().discarder = Number(b.getAttribute('data-seat'));
      change();
    });
    $('#mjTai').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pat]');
      if (!b || b.disabled || !T.canEdit()) return;
      hand().picks = MJ.togglePick(hand().picks, b.getAttribute('data-pat'), hand().method);
      change();
    });
    $('#mjExtraDown').addEventListener('click', function () { if (T.canEdit()) { hand().extra -= 1; change(); } });
    $('#mjExtraUp').addEventListener('click', function () { if (T.canEdit()) { hand().extra += 1; change(); } });
    $('#mjClear').addEventListener('click', function () {
      if (!T.canEdit()) return;
      resetHand();
      change();
      T.toast('這將的輸入已清空');
    });

    var form = $('#set-mahjong');
    form.addEventListener('input', function () {
      if (!T.canEdit()) return;
      readSettings();
      T.changed(PATH, 400);
    });
    form.addEventListener('change', function () {
      if (!T.canEdit()) return;
      readSettings();
      syncSettings();
      T.changed(PATH);
    });
  }

  T.games.mahjong = {
    init: init,
    render: render,
    commit: commit,
    syncSettings: syncSettings,
    resetSettings: function () { mj().settings = MJ.normalizeSettings(); T.changed(PATH); },
    onShow: function () {}
  };
})();
