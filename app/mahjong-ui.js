/* 麻將畫面：莊家與連莊、誰胡、怎麼胡、幾台、結算；以及規則面板裡的台數表 */
(function () {
  'use strict';
  var T = window.TableApp;
  var MJ = window.Mahjong;
  var $ = T.$, $$ = T.$$, esc = T.esc;
  var PATH = 'table/mahjong';
  var GROUP_ORDER = ['basic', 'honor', 'big', 'custom'];
  var BUILTIN = {};
  MJ.PATTERNS.forEach(function (p) { BUILTIN[p.id] = p; });

  var chipsKey = '';
  var editorKey = '';
  var pickDealer = false; // 按了「換莊家」，下一次點牌桌就是選莊家
  var seatingOpen = false; // 這支手機正在抓位
  var seatingFor = 0;      // 開始抓位時的 seatsAt；別支手機先按了完成（seatsAt 變了）就收起來
  var seatSlot = null;     // 抓位時正在選哪一風坐誰
  var seatStart = null;    // 從哪一風開始選，繞一圈回來就停
  var RESEAT_AFTER = 3 * 60 * 60 * 1000; // 超過 3 小時沒抓位，從首頁進來就先抓位

  function mj() { return T.state.mahjong; }
  function hand() { return mj().hand; }
  function isDraw() { return hand().winner === -1; }
  function settings() { return mj().settings; }

  function tai() { return MJ.countTai(hand().picks, hand().method, hand().extra, settings()); }

  function settleNow() {
    var h = hand();
    if (h.winner == null || h.winner < 0) return { ready: false };
    return MJ.settle({
      dealer: mj().dealer, streak: mj().streak, winner: h.winner, method: h.method, discarder: h.discarder, tai: tai().tai
    }, settings());
  }

  // 台型說明；沒寫說明的再補上「限自摸／限胡別人打的」
  function onlyNote(p) {
    if (p.note) return p.note;
    if (p.only === 'ziMo') return '限自摸';
    if (p.only === 'fangQiang') return '限胡別人打的';
    return '';
  }

  /* ---------- 規則設定 ---------- */

  var FIELDS = [
    ['#mjBase', 'base'], ['#mjPerTai', 'perTai'], ['#mjCap', 'cap'], ['#mjDealerTai', 'dealerTai'],
    ['#mjStreakTai', 'streakTai'], ['#mjZiMoTai', 'ziMoTai'], ['#mjMqzmTai', 'menQingZiMoTai']
  ];

  function syncSettings() {
    var s = settings();
    var a = document.activeElement;
    FIELDS.forEach(function (f) { if ($(f[0]) !== a) $(f[0]).value = s[f[1]]; });
    $('#mjCapDealer').checked = s.capIncludesDealer;
    $('#mjFlowers').checked = s.flowers;
    $('#mjDealerNeedsStreak').checked = s.dealerNeedsStreak;
    var preset = MJ.matchPreset(s);
    $$('#mjPresets [data-preset]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === preset));
    });
    syncEditor();
  }

  function readSettings() {
    var cur = settings();
    var next = Object.assign({}, cur);
    FIELDS.forEach(function (f) {
      var v = $(f[0]).value;
      if (v !== '') next[f[1]] = v;
    });
    next.capIncludesDealer = $('#mjCapDealer').checked;
    next.flowers = $('#mjFlowers').checked;
    next.dealerNeedsStreak = $('#mjDealerNeedsStreak').checked;
    mj().settings = MJ.normalizeSettings(next);
  }

  // 台數表：每種台型一列，可以改台數、開關；自訂台型可以刪除
  function buildEditor() {
    var s = settings();
    var key = s.custom.map(function (c) { return c.id + ':' + c.name; }).join('|');
    if (key === editorKey && $('#mjTaiRows').children.length) return;
    editorKey = key;
    var html = GROUP_ORDER.map(function (g) {
      var rows = g === 'custom'
        ? s.custom.map(function (c) {
            return '<div class="te-row" data-te="' + c.id + '" data-custom>' +
              '<span class="te-name"><span>' + esc(c.name) + '</span></span>' +
              '<span class="hint">自訂</span>' +
              '<span class="te-ctrl"><span class="field small"><input type="number" min="0" max="99" step="1" inputmode="numeric" data-te-tai aria-label="' + esc(c.name) + '台數"><span>台</span></span>' +
              '<button type="button" class="link-btn" data-te-del>刪除</button></span></div>';
          })
        : MJ.PATTERNS.filter(function (p) { return p.group === g; }).map(function (p) {
            return '<div class="te-row" data-te="' + p.id + '">' +
              '<label class="te-name"><input type="checkbox" class="switch" data-te-on aria-label="使用' + p.name + '"><span>' + p.name + '</span></label>' +
              '<span class="hint" data-te-hint></span>' +
              '<span class="te-ctrl"><span class="field small"><input type="number" min="0" max="99" step="1" inputmode="numeric" data-te-tai aria-label="' + p.name + '台數"><span>台</span></span></span></div>';
          });
      if (!rows.length) return '';
      return '<div class="te-group"><h4>' + MJ.GROUP_NAMES[g] + '</h4>' + rows.join('') + '</div>';
    }).join('');
    $('#mjTaiRows').innerHTML = html;
  }

  function syncEditor() {
    buildEditor();
    var s = settings();
    var a = document.activeElement;
    var changed = 0;
    $$('#mjTaiRows [data-te]').forEach(function (row) {
      var id = row.getAttribute('data-te');
      var input = $('[data-te-tai]', row);
      var val;
      if (row.hasAttribute('data-custom')) {
        var c = s.custom.filter(function (x) { return x.id === id; })[0];
        val = c ? c.tai : 0;
      } else {
        var def = BUILTIN[id].tai;
        val = s.tai[id] != null ? s.tai[id] : def;
        var on = MJ.isOn(BUILTIN[id], s);
        var noFlower = !!(BUILTIN[id].flower && !s.flowers);
        var toggle = $('[data-te-on]', row);
        toggle.checked = on && !noFlower;
        toggle.disabled = noFlower;
        input.disabled = noFlower;
        row.classList.toggle('is-off', !on || noFlower);
        row.classList.toggle('changed', val !== def);
        var note = onlyNote(BUILTIN[id]);
        $('[data-te-hint]', row).textContent = noFlower ? '沒玩花牌，不會出現' :
          (val !== def ? '預設 ' + def + ' 台' + (note ? '；' : '') : '') + note +
          (BUILTIN[id].max > 1 ? (note || val !== def ? '；' : '') + '最多 ' + BUILTIN[id].max + ' 組' : '');
        if (val !== def || on === !!BUILTIN[id].defaultOff) changed++;
      }
      if (input !== a) input.value = val;
    });
    var extra = s.custom.length;
    $('#mjTaiEditorHint').textContent = changed || extra
      ? '已改 ' + changed + ' 項' + (extra ? '、自訂 ' + extra + ' 項' : '')
      : '修改台數、關掉不用的、新增自己家的台型';
  }

  function updateSettings(fn, delay) {
    var next = JSON.parse(JSON.stringify(settings()));
    fn(next);
    mj().settings = MJ.normalizeSettings(next);
    T.changed(PATH, delay);
    syncEditor();
  }

  function addCustom() {
    var name = $('#mjNewName').value.trim().slice(0, 12);
    var n = Math.max(0, Math.min(99, Math.round(Number($('#mjNewTai').value) || 0)));
    if (!name) { T.toast('請先填台型名稱'); $('#mjNewName').focus(); return; }
    var s = settings();
    if (s.custom.length >= MJ.MAX_CUSTOM) { T.toast('自訂台型最多 ' + MJ.MAX_CUSTOM + ' 種'); return; }
    var dup = s.custom.some(function (c) { return c.name === name; }) ||
      MJ.PATTERNS.some(function (p) { return p.name === name; });
    if (dup) { T.toast('已經有「' + name + '」了，直接改它的台數就好'); return; }
    var id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    updateSettings(function (x) { x.custom.push({ id: id, name: name, tai: n }); });
    $('#mjNewName').value = '';
    $('#mjNewTai').value = 1;
    T.toast('已新增「' + name + '」' + n + ' 台');
  }

  /* ---------- 抓位 ----------
   * 牌桌上的位置（東南西北）和玩家是分開的：seats[w] 是坐在第 w 風的玩家。
   * 這將的誰胡、誰放槍、莊家都記位置；記入累計帳時才換成玩家。 */

  function seats() { return mj().seats; }
  function playerAt(w) { return seats()[w]; }
  function seatName(w) { return T.plainName(playerAt(w)); }
  // 我坐哪一風；還沒選我是誰、或我沒上桌時是 -1
  function meWind() { var me = T.me(); return me == null ? -1 : seats().indexOf(me); }
  function relOf(w) { var mw = meWind(); return mw < 0 ? '' : T.RELATION[(w - mw + 4) % 4]; }
  function seating() {
    var at = mj().seatsAt;
    return T.canEdit() && (!at || (seatingOpen && at === seatingFor));
  }

  // 可以上桌的玩家：首頁列出的那些，加上已經坐著的
  function players() {
    var n = Math.max(4, T.state.blackjack.settings.count);
    var list = [];
    for (var p = 0; p < n; p++) list.push(p);
    seats().forEach(function (p) { if (list.indexOf(p) === -1) list.push(p); });
    return list.sort(function (a, b) { return a - b; });
  }

  // 讓玩家 p 坐第 w 風；他原本坐別的位置的話，和那裡的人對調
  function assignSeat(w, p) {
    var s = seats().slice();
    var j = s.indexOf(p);
    var old = s[w];
    s[w] = p;
    if (j !== -1 && j !== w) s[j] = old;
    mj().seats = s;
  }

  // 選完一個位置，換下一風（跳過自己），繞一圈回到起點就停
  function nextSlot(w) {
    var mw = meWind();
    for (var k = 1; k < 4; k++) {
      var n = (w + k) % 4;
      if (n === seatStart) return null;
      if (n !== mw) return n;
    }
    return null;
  }

  function openSeating() {
    seatingOpen = true;
    seatingFor = mj().seatsAt;
    seatSlot = null;
    seatStart = null;
    pickDealer = false;
  }

  function seatSummary() {
    return T.SEAT_CHARS.map(function (c, w) {
      return c + ' <b>' + esc(seatName(w)) + (w === meWind() ? '（我）' : '') + '</b>';
    }).join('・');
  }

  function renderSeating() {
    var sit = seating();
    var m = mj();
    $('#play-mahjong').classList.toggle('seating', sit);
    $('#mjSeating').hidden = !sit;
    $('#mjSeatDone').hidden = !sit;
    $('#mjSeatBar').hidden = sit;
    $('#mjSeatEdit').disabled = !T.canEdit();
    $('#mjSeatSummary').innerHTML = (m.seatsAt ? '' : '還沒抓位：') + seatSummary();
    if (!sit) return;

    var me = T.me();
    var mw = meWind();
    if (me == null) {
      $('#mjSeatMe').innerHTML = '<span class="set-label" id="mjSeatMeLabel">先選你是誰</span>' +
        '<div class="me-seats" role="radiogroup" aria-labelledby="mjSeatMeLabel">' + players().map(function (p) {
          return '<button type="button" role="radio" aria-checked="false" data-me="' + p + '">' + esc(T.plainName(p)) + '</button>';
        }).join('') + '</div>';
    } else {
      $('#mjSeatMe').innerHTML = '<span class="set-label" id="mjSeatMeLabel"><b>' + esc(T.plainName(me)) + '</b>（我）抓到</span>' +
        '<div class="me-seats" role="radiogroup" aria-labelledby="mjSeatMeLabel">' + T.SEAT_CHARS.map(function (c, w) {
          return '<button type="button" role="radio" data-mywind="' + w + '" aria-checked="' + (mw === w) + '"><span class="w">' + c + '</span>' + c + '家</button>';
        }).join('') + '</div>';
    }

    var slot = seatSlot;
    $('#mjSeatChoices').hidden = slot == null;
    if (slot == null) return;
    var rel = relOf(slot);
    $('#mjSeatChoicesLabel').textContent = T.SEAT_CHARS[slot] + '家' + (rel ? '（' + rel + '）' : '') + '坐誰？';
    $('#mjSeatChoicesList').innerHTML = players().map(function (p) {
      var at = seats().indexOf(p);
      var where = at === slot ? '' : at === -1 ? '沒上桌' : T.SEAT_CHARS[at];
      return '<button type="button" role="radio" data-sit="' + p + '" aria-checked="' + (at === slot) + '">' +
        esc(T.plainName(p)) + (p === me ? '（我）' : '') + (where ? ' <span class="where">' + where + '</span>' : '') + '</button>';
    }).join('');
  }

  /* ---------- 畫面 ---------- */

  // 名字加上相對位置與莊家，例如「小華（下家・莊）」
  function seatLabel(w) {
    var parts = [];
    if (relOf(w)) parts.push(relOf(w));
    if (w === mj().dealer) parts.push('莊');
    return seatName(w) + (parts.length ? '（' + parts.join('・') + '）' : '');
  }

  // 牌桌現在在等什麼
  function tableState() {
    var h = hand();
    if (pickDealer) return 'dealer';
    if (isDraw()) return 'draw';
    if (h.winner == null) return 'winner';
    if (!h.method) return 'method';
    if (h.method === 'fangQiang' && h.discarder == null) return 'discarder';
    return 'done';
  }

  // 牌桌：自己坐下面，右邊下家、對面對家、左邊上家（東→南→西→北 逆時針輪）；
  // 不知道我坐哪時東家在下面
  function renderTable(r) {
    var m = mj();
    var h = hand();
    var mw = meWind();
    var bottom = mw < 0 ? 0 : mw;
    var editable = T.canEdit();
    var sit = seating();
    var state = sit ? 'seating' : tableState();
    var POS = ['bottom', 'right', 'top', 'left'];
    var ready = !sit && r && r.ready;
    var html = '';
    for (var k = 0; k < 4; k++) {
      var w = (bottom + k) % 4;
      var rel = relOf(w);
      var tags = [];
      if (!sit) {
        if (w === m.dealer) tags.push('<span class="tg dealer">莊' + (m.streak ? ' 連' + m.streak : '') + '</span>');
        if (w === h.winner) tags.push('<span class="tg win">' + (h.method === 'ziMo' ? '自摸' : '胡') + '</span>');
        if (h.method === 'fangQiang' && w === h.discarder) tags.push('<span class="tg pay">放槍</span>');
      }
      var net = ready ? r.nets[w] : 0;
      var cls = 'tseat p-' + POS[k] + (sit
        ? (w === seatSlot ? ' is-picking' : '')
        : (w === h.winner ? ' is-winner' : '') + (ready && net < 0 ? ' is-payer' : ''));
      html += '<button type="button" class="' + cls + '"' +
        ' data-tseat="' + w + '"' + (editable ? '' : ' disabled') +
        (sit ? ' aria-pressed="' + (w === seatSlot) + '"' : '') +
        ' aria-label="' + esc(T.SEAT_CHARS[w] + '家 ' + seatName(w) + (rel ? '，' + rel : '')) + '">' +
        (rel ? '<span class="rel' + (w === mw ? ' me' : '') + '">' + rel + '</span>' : '') +
        '<span class="wind">' + T.SEAT_CHARS[w] + '</span>' +
        '<span class="nm">' + esc(seatName(w)) + '</span>' +
        '<span class="tags">' + tags.join('') + '</span>' +
        '<span class="amt ' + T.signClass(net) + '">' + (ready && net ? T.signedMoney(net) : '') + '</span>' +
      '</button>';
    }
    var main;
    var sub = '';
    if (state === 'seating') {
      if (seatSlot != null) { main = T.SEAT_CHARS[seatSlot] + '家坐誰？'; sub = '在下面選'; }
      else { main = '點位置換人'; sub = mw < 0 ? '或先選你抓到哪一風' : '好了按下面的完成'; }
    }
    else if (state === 'dealer') main = '點新的莊家';
    else if (state === 'draw') { main = '流局'; sub = seatName(m.dealer) + '連莊'; }
    else if (state === 'winner') { main = '點誰胡'; sub = '沒人胡就按「流局」'; }
    else if (state === 'method') { main = '自摸還是放槍？'; sub = '點下面的按鈕'; }
    else if (state === 'discarder') main = '點誰放槍';
    else {
      main = seatName(h.winner) + (h.method === 'ziMo' ? ' 自摸' : ' 胡');
      sub = ready ? r.tai + ' 台' + (r.capped ? '・限 ' + r.settings.cap : '') : '';
    }
    html += '<div class="table-center" aria-live="polite"><span class="tc-main">' + esc(main) + '</span>' +
      (sub ? '<span class="tc-sub">' + esc(sub) + '</span>' : '') + '</div>';
    var table = $('#mjTable');
    table.innerHTML = html;
    table.classList.toggle('expect', editable && (state === 'seating' ? seatSlot == null : state === 'dealer' || state === 'winner' || state === 'discarder'));
    $('#mjQ1Text').textContent = state === 'discarder' ? '誰放槍？點牌桌上的人'
      : state === 'dealer' ? '換莊家：點牌桌上的人' : '誰胡？點牌桌上的人';
  }

  function buildChips(pats) {
    var key = pats.map(function (p) { return p.id + ':' + p.tai + ':' + p.name; }).join('|');
    if (key === chipsKey) return;
    chipsKey = key;
    $('#mjTai').innerHTML = GROUP_ORDER.map(function (g) {
      var list = pats.filter(function (p) { return p.group === g; });
      if (!list.length) return '';
      return '<div class="tai-group"><h4>' + MJ.GROUP_NAMES[g] + '</h4><div class="tai-chips">' +
        list.map(function (p) {
          return '<button type="button" class="tai-chip" data-pat="' + p.id + '" aria-pressed="false"' + (p.note ? ' title="' + esc(p.note) + '"' : '') + '>' +
            '<span class="nm">' + esc(p.name) + '</span><b>' + p.tai + '</b></button>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function render() {
    var m = mj();
    var s = m.settings;
    var h = hand();
    var editable = T.canEdit();
    var dTai = MJ.dealerTai(m.streak, s);
    var pats = MJ.patternsFor(s);
    var byId = {};
    pats.forEach(function (p) { byId[p.id] = p; });

    $('#mjRound').textContent = '第 ' + m.nextRound + ' 將';
    var preset = MJ.matchPreset(s);
    $('#mjChips').innerHTML = '<span class="sum-chip">底 <b>' + T.money(s.base) + '</b></span>' +
      '<span class="sum-chip">每台 <b>' + T.money(s.perTai) + '</b></span>' +
      '<span class="sum-chip">' + (s.flowers ? '有花' : '不玩花') + '</span>' +
      '<span class="sum-chip">' + (s.cap ? '限 <b>' + s.cap + '</b> 台' + (s.capIncludesDealer ? '（含莊）' : '') : '不限台') + '</span>' +
      '<span class="sum-chip">' + (preset ? MJ.PRESETS[preset].name : '自訂規則') + (s.custom.length ? '＋自訂台型' : '') + '</span>';
    $('#mjClear').disabled = !editable;

    // 抓位、莊家
    renderSeating();
    $('#mjDealerName').textContent = T.SEAT_CHARS[m.dealer] + ' ' + seatName(m.dealer);
    var pd = $('#mjPickDealer');
    pd.setAttribute('aria-pressed', String(pickDealer));
    pd.textContent = pickDealer ? '取消' : '換莊家';
    pd.disabled = !editable;
    $('#mjStreak').textContent = m.streak;
    $('#mjStreakDown').disabled = !editable || m.streak === 0;
    $('#mjStreakUp').disabled = !editable;
    $('#mjDealerHint').textContent = seatName(m.dealer) + '當莊' + (m.streak ? '，連 ' + m.streak : '') + '：' +
      (dTai === 0
        ? (s.dealerNeedsStreak && !m.streak ? '還沒連莊，莊家不算台。' : '莊家不算台。')
        : '莊家胡牌或莊家付錢時，多算 ' + dTai + ' 台' +
          (m.streak ? '（莊家 ' + s.dealerTai + ' + 連莊 ' + m.streak + ' × ' + s.streakTai + '）' : '') + '。');

    // 1 牌桌：誰胡、誰放槍
    renderTable(settleNow());
    var draw = $('#mjDraw');
    draw.setAttribute('aria-pressed', String(isDraw()));
    draw.disabled = !editable;

    // 自摸或放槍：點了誰胡之後才出現
    var hasWinner = h.winner != null && h.winner >= 0;
    $('#mjStep2').hidden = !hasWinner;
    $$('#mjMethod [data-method]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(h.method === b.getAttribute('data-method')));
      b.disabled = !editable || !hasWinner;
    });

    // 3 幾台
    var ready3 = hasWinner && !!h.method;
    var t = tai();
    var clean = MJ.cleanPicks(h.picks, h.method, s);
    $('#mjStep3').classList.toggle('off', !ready3);
    $('#mjTaiSum').textContent = ready3 ? t.tai : 0;
    $('#mjCapNote').hidden = !(ready3 && s.cap && t.tai > s.cap);
    $('#mjCapNote').textContent = '限 ' + s.cap + ' 台';
    buildChips(pats);
    $$('#mjTai [data-pat]').forEach(function (b) {
      var p = byId[b.getAttribute('data-pat')];
      if (!p) return;
      var n = clean[p.id] || 0;
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

  function formula(t, s) {
    var handPart = t.capped && !s.capIncludesDealer ? Math.min(s.cap, t.tai) : t.tai;
    var expr = t.dealerTai && !(t.capped && s.capIncludesDealer)
      ? '(' + handPart + ' + 莊家 ' + t.dealerTai + ')'
      : String(t.totalTai);
    return T.fmtNum(t.base) + ' + ' + expr + ' 台 × ' + T.fmtNum(t.perTai) +
      (t.capped ? '（原本 ' + (t.tai + (s.capIncludesDealer ? t.dealerTai : 0)) + ' 台，限 ' + s.cap + ' 台）' : '');
  }

  function renderResult() {
    var box = $('#mjResult');
    var m = mj();
    if (isDraw()) {
      box.innerHTML = '<div class="guide"><strong>流局</strong><ol><li>沒人胡，不用付錢。</li><li>按「記流局」後，' +
        esc(seatName(m.dealer)) + '繼續當莊，變成連 ' + (m.streak + 1) + '。</li></ol></div>';
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
      return '<li><div class="t-line"><span class="t-who">' + esc(seatLabel(t.from)) +
        '<span class="arrow">付</span>' + esc(seatLabel(w)) + '</span><span class="t-amt neg">' + T.money(t.amount) + '</span></div>' +
        '<div class="t-formula">' + esc(formula(t, r.settings)) + '</div></li>';
    }).join('');
    box.innerHTML =
      '<div class="win-card">' +
        '<p class="eyebrow">這將胡牌</p>' +
        '<p class="win-name">' + esc(seatName(w)) + '</p>' +
        '<p class="win-total">共收<b>' + T.money(r.nets[w]) + '</b></p>' +
        '<p class="win-meta"><span class="win-kind">' + (r.method === 'ziMo' ? '自摸' : '胡 ' + esc(seatName(hand().discarder))) +
        ' <b>' + r.tai + ' 台</b></span>' +
        (r.capped ? '<span class="win-why">限 ' + r.settings.cap + ' 台</span>' : '') +
        (w === m.dealer ? '<span class="win-why">莊家胡，每家多 ' + r.dealerTai + ' 台</span>' : '') + '</p>' +
      '</div>' +
      '<div class="panel-box"><h3 class="sub">誰付多少</h3><ol class="transfers">' + transfers + '</ol></div>';
  }

  function renderDock() {
    var sum = $('#sumText');
    var commit = $('#commitBtn');
    var editable = T.canEdit();
    commit.hidden = !editable;
    if (seating()) {
      sum.innerHTML = '<span class="muted">先完成抓位，再輸入這將</span>';
      commit.textContent = '記入，下一將';
      commit.disabled = true;
      return;
    }
    if (isDraw()) {
      sum.innerHTML = '<span class="who">流局</span><span class="muted">' + esc(seatName(mj().dealer)) + '連莊</span>';
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
    sum.innerHTML = '<span class="who">' + esc(seatName(r.winner)) + ' ' + (r.method === 'ziMo' ? '自摸' : '胡') + '</span>' +
      '<span class="pill pill-kind">' + r.tai + ' 台' + (r.capped ? '・限 ' + r.settings.cap : '') + '</span>' +
      '<span class="amt">收 ' + T.money(r.nets[r.winner]) + '</span>';
    commit.disabled = false;
  }

  // 規則頁：目前設定與台數表
  function renderRules() {
    var s = settings();
    $('#mjRulesNow').textContent = '目前設定：底 ' + T.money(s.base) + '、每台 ' + T.money(s.perTai) + '，' +
      (s.flowers ? '有玩花牌' : '沒玩花牌') + '，' +
      (s.cap ? '限 ' + s.cap + ' 台（莊家台' + (s.capIncludesDealer ? '算在內' : '另外加') + '）' : '不限台') +
      '，莊家 ' + s.dealerTai + ' 台' + (s.dealerNeedsStreak ? '（沒連莊不算）' : '') + '、每連莊加 ' + s.streakTai + ' 台' +
      (MJ.matchPreset(s) ? '（' + MJ.PRESETS[MJ.matchPreset(s)].name + '）' : '') + '。';
    var rows = [
      ['自摸', '選「自摸」就自動算', String(s.ziMoTai)],
      ['門清自摸', '門清又自摸，兩個合計', String(s.menQingZiMoTai)]
    ].concat(MJ.patternsFor(s).map(function (p) {
      return [p.name, p.custom ? '自訂' : onlyNote(p), p.max > 1 ? '每組 ' + p.tai : String(p.tai)];
    }));
    $('#mjTaiTable tbody').innerHTML = rows.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td style="white-space:normal">' + esc(r[1]) + '</td><td class="num">' + esc(r[2]) + '</td></tr>';
    }).join('');
  }

  /* ---------- 動作 ---------- */

  function change() { T.changed(PATH); }

  function resetHand() { mj().hand = T.emptyHand(); }

  function commit() {
    if (!T.canEdit() || seating()) return;
    var m = mj();
    if (isDraw()) {
      var nd = MJ.nextDealer(m.dealer, m.streak, -1);
      m.dealer = nd.dealer;
      m.streak = nd.streak;
      m.nextRound += 1;
      resetHand();
      change();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      T.toast('流局，' + seatName(m.dealer) + '連莊（連 ' + m.streak + '）');
      return;
    }
    var r = settleNow();
    if (!r.ready) return;
    var no = m.nextRound;
    // 累計帳記的是玩家，不是位置
    var nets = [];
    for (var p = 0; p < T.MAX_PLAYERS; p++) nets.push(0);
    r.nets.forEach(function (n, w) { nets[playerAt(w)] = n; });
    T.commitEntry('mahjong', { winner: playerAt(r.winner), kind: r.method, tai: r.tai, nets: nets }, function () {
      var cur = mj();
      var nd = MJ.nextDealer(cur.dealer, cur.streak, r.winner);
      var same = nd.dealer === cur.dealer;
      cur.dealer = nd.dealer;
      cur.streak = nd.streak;
      resetHand();
      change();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      T.toast('第 ' + no + ' 將已記入，' + seatName(cur.dealer) + (same ? '連莊（連 ' + cur.streak + '）' : '當莊'));
    });
  }

  function init() {
    $('#mjSeatEdit').addEventListener('click', function () {
      if (!T.canEdit()) return;
      openSeating();
      T.render();
    });
    $('#mjSeatDone').addEventListener('click', function () {
      if (!T.canEdit()) return;
      mj().seatsAt = Date.now();
      seatingOpen = false;
      seatSlot = null;
      change();
      var mw = meWind();
      T.toast('抓位完成' + (mw < 0 ? '' : '，你坐' + T.SEAT_CHARS[mw] + '家'));
    });
    // 我抓到哪一風；選完接著問下家坐誰
    $('#mjSeatMe').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mywind]');
      if (!b || !T.canEdit() || T.me() == null) return;
      var w = Number(b.getAttribute('data-mywind'));
      assignSeat(w, T.me());
      seatStart = (w + 1) % 4;
      seatSlot = seatStart;
      change();
    });
    $('#mjSeatChoices').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sit]');
      if (!b || !T.canEdit() || seatSlot == null) return;
      assignSeat(seatSlot, Number(b.getAttribute('data-sit')));
      seatSlot = nextSlot(seatSlot);
      change();
    });
    $('#mjPickDealer').addEventListener('click', function () {
      if (!T.canEdit()) return;
      pickDealer = !pickDealer;
      T.render();
    });
    // 點牌桌：換莊家模式就設莊家；沒人胡就設誰胡；點胡的人取消；放槍時點別人就是放槍的人
    $('#mjTable').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tseat]');
      if (!b || !T.canEdit()) return;
      var i = Number(b.getAttribute('data-tseat'));
      var m = mj();
      if (seating()) {
        seatSlot = seatSlot === i ? null : i;
        seatStart = seatSlot;
        T.render();
        return;
      }
      if (pickDealer) {
        pickDealer = false;
        if (i !== m.dealer) { m.dealer = i; m.streak = 0; }
        change();
        T.toast(seatName(i) + '當莊');
        return;
      }
      var h = hand();
      if (h.winner == null || h.winner === -1) {
        if (h.winner === -1) { m.hand = T.emptyHand(); h = hand(); }
        h.winner = i;
      } else if (i === h.winner) {
        h.winner = null;
        h.discarder = null;
      } else if (h.method === 'fangQiang') {
        h.discarder = i;
      } else {
        h.winner = i;
      }
      change();
    });
    $('#mjStreakDown').addEventListener('click', function () { if (T.canEdit() && mj().streak > 0) { mj().streak -= 1; change(); } });
    $('#mjStreakUp').addEventListener('click', function () { if (T.canEdit()) { mj().streak += 1; change(); } });

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
      h.picks = MJ.cleanPicks(h.picks, h.method, settings());
      change();
    });
    $('#mjTai').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pat]');
      if (!b || b.disabled || !T.canEdit()) return;
      hand().picks = MJ.togglePick(hand().picks, b.getAttribute('data-pat'), hand().method, settings());
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

    // 規則面板：一般欄位
    var form = $('#set-mahjong');
    form.addEventListener('input', function (e) {
      if (!T.canEdit() || e.target.closest('#mjTaiEditor')) return;
      readSettings();
      T.changed(PATH, 400);
    });
    form.addEventListener('change', function (e) {
      if (!T.canEdit() || e.target.closest('#mjTaiEditor')) return;
      readSettings();
      syncSettings();
      T.changed(PATH);
    });

    // 規則面板：台數表
    var rows = $('#mjTaiRows');
    rows.addEventListener('input', function (e) {
      if (!T.canEdit() || !e.target.matches('[data-te-tai]') || e.target.value === '') return;
      var row = e.target.closest('[data-te]');
      var id = row.getAttribute('data-te');
      var v = Number(e.target.value);
      updateSettings(function (x) {
        if (row.hasAttribute('data-custom')) x.custom.forEach(function (c) { if (c.id === id) c.tai = v; });
        else x.tai[id] = v;
      }, 400);
    });
    rows.addEventListener('change', function (e) {
      if (!T.canEdit()) return;
      if (e.target.matches('[data-te-on]')) {
        var id = e.target.closest('[data-te]').getAttribute('data-te');
        var on = e.target.checked;
        updateSettings(function (x) {
          if (BUILTIN[id].defaultOff) { if (on) x.on[id] = true; else delete x.on[id]; }
          else if (on) delete x.off[id];
          else x.off[id] = true;
        });
      } else if (e.target.matches('[data-te-tai]')) {
        syncEditor();
      }
    });
    rows.addEventListener('click', function (e) {
      var del = e.target.closest('[data-te-del]');
      if (!del || !T.canEdit()) return;
      var id = del.closest('[data-te]').getAttribute('data-te');
      var c = settings().custom.filter(function (x) { return x.id === id; })[0];
      updateSettings(function (x) { x.custom = x.custom.filter(function (y) { return y.id !== id; }); });
      if (c) T.toast('已刪除「' + c.name + '」');
    });
    $('#mjAddCustom').addEventListener('click', function () { if (T.canEdit()) addCustom(); });
    $('#mjPresets').addEventListener('click', function (e) {
      var b = e.target.closest('[data-preset]');
      if (!b || !T.canEdit()) return;
      var name = b.getAttribute('data-preset');
      mj().settings = MJ.applyPreset(settings(), name);
      hand().picks = MJ.cleanPicks(hand().picks, hand().method, settings());
      T.changed(PATH);
      syncSettings();
      T.toast('已套用' + MJ.PRESETS[name].name);
    });
    $('#mjNewName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (T.canEdit()) addCustom(); }
    });
  }

  T.games.mahjong = {
    init: init,
    render: render,
    renderRules: renderRules,
    commit: commit,
    syncSettings: syncSettings,
    resetSettings: function () { mj().settings = MJ.normalizeSettings(); T.changed(PATH); },
    // 從來沒抓過位就一直先抓位；從首頁進來而且很久沒抓位（新的一場）也先抓位，之前坐的位置會留著
    onShow: function (from) {
      var at = mj().seatsAt;
      if (from === 'home' && T.canEdit() && at && Date.now() - at > RESEAT_AFTER) openSeating();
    }
  };
})();
