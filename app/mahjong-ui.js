/* 麻將畫面：抓位、第幾將和圈風、莊家與連莊、誰胡、怎麼胡、幾台、結算；以及規則面板裡的台數表和牌局進度 */
(function () {
  'use strict';
  var T = window.TableApp;
  var MJ = window.Mahjong;
  var $ = T.$, $$ = T.$$, esc = T.esc;
  var PATH = 'table/mahjong';
  var GROUP_ORDER = ['basic', 'honor', 'big', 'custom'];
  // 輸入這把時的分組：三元牌和風牌刻子是一張張的牌
  var HAND_GROUPS = [['basic', '常見'], ['tiles', '字牌刻子'], ['honor', '花牌'], ['big', '大牌'], ['custom', '自訂']];
  var TILE_CLASS = { zhong: ' t-zhong', fa: ' t-fa', bai: ' t-bai' };
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

  function tai() { return MJ.countTai(hand().picks, hand().method, hand().extra, settings(), windCtx()); }

  // 圈風和胡的人的門風（門風預設跟著莊家：莊家算東；設定成照座位時，坐東就是東風）
  function windCtx() {
    var m = mj();
    var w = hand().winner;
    var seat = w == null || w < 0 ? null : settings().menFengBySeat ? w : (w - m.dealer + 4) % 4;
    return { roundWind: m.wind, seatWind: seat };
  }

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
    $('#mjMenFengBySeat').checked = s.menFengBySeat;
    syncProgress();
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
    next.menFengBySeat = $('#mjMenFengBySeat').checked;
    mj().settings = MJ.normalizeSettings(next);
  }

  // 牌局進度：第幾將、圈風、起莊（開始記帳時已經打到一半，可以在這裡改）
  function windRadios(box, name) {
    if (box.children.length) return;
    box.innerHTML = T.SEAT_CHARS.map(function (c, w) {
      return '<label><input type="radio" name="' + name + '" value="' + w + '">' + c + '</label>';
    }).join('');
  }
  function syncProgress() {
    var m = mj();
    var editable = T.canEdit();
    if ($('#mjJiang') !== document.activeElement) $('#mjJiang').value = m.jiang;
    $('#mjJiang').disabled = !editable;
    [['#mjWindPick', 'mjWind', m.wind], ['#mjStartPick', 'mjStart', m.startDealer]].forEach(function (f) {
      var box = $(f[0]);
      windRadios(box, f[1]);
      $$('input', box).forEach(function (r) {
        r.checked = Number(r.value) === f[2];
        r.disabled = !editable;
      });
    });
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
   * 這把的誰胡、誰放槍、莊家都記位置；記入累計帳時才換成玩家。 */

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

    var fresh = m.wind === 0 && m.hands === 0; // 這將還沒開始打
    $('#mjSeatTitle').textContent = fresh && m.jiang > 1 ? '第 ' + m.jiang + ' 將：重新抓位' : '抓位：大家坐哪？';
    $('#mjSeatStart').hidden = !fresh;
    if (fresh) {
      $('#mjSeatStartList').innerHTML = T.SEAT_CHARS.map(function (c, w) {
        return '<button type="button" role="radio" data-start="' + w + '" aria-checked="' + (m.startDealer === w && m.dealer === w) + '">' +
          '<span class="w">' + c + '</span>' + esc(seatName(w)) + '</button>';
      }).join('');
    }

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
        '<span class="who"><span class="wind">' + T.SEAT_CHARS[w] + '</span><span class="nm">' + esc(seatName(w)) + '</span></span>' +
        '<span class="foot">' + tags.join('') +
          '<span class="amt ' + T.signClass(net) + '">' + (ready && net ? T.signedMoney(net) : '') + '</span></span>' +
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

  // 字牌刻子的標題：說明現在哪張風牌算台
  function windTitle(ctx) {
    var s = settings();
    var on = function (id) { return MJ.isOn(MJ.PATTERNS.filter(function (p) { return p.id === id; })[0], s); };
    if (on('jianFeng')) return '字牌刻子・見字有台';
    var parts = [];
    if (on('quanFeng')) parts.push('圈風' + T.SEAT_CHARS[ctx.roundWind]);
    if (on('menFeng')) parts.push('門風' + (ctx.seatWind == null ? '看誰胡' : T.SEAT_CHARS[ctx.seatWind]));
    return '字牌刻子' + (parts.length ? '・' + parts.join(' ') : '');
  }

  // 小小一張牌：上面是字，下面是台數；風牌標「圈」「門」，對不到寫「不算」
  function tileChip(p) {
    var why = p.tile === 'wind' ? p.why.map(function (x) { return x.charAt(0); }).join('') : '';
    var label = p.name + '刻子，' + (p.tai ? p.tai + ' 台' + (p.why && p.why.length ? '（' + p.why.join('、') + '）' : '') : '不算台');
    return '<button type="button" class="tai-chip tile-chip' + (TILE_CLASS[p.id] || '') + '" data-pat="' + p.id + '" aria-pressed="false" aria-label="' + esc(label) + '">' +
      '<span class="face">' + p.name + '</span><b>' + (p.tai ? why + p.tai : '不算') + '</b></button>';
  }

  function buildChips(pats, ctx) {
    var wt = windTitle(ctx);
    var key = wt + '|' + pats.map(function (p) { return p.id + ':' + p.tai + ':' + p.name + ':' + (p.why || ''); }).join('|');
    if (key === chipsKey) return;
    chipsKey = key;
    $('#mjTai').innerHTML = HAND_GROUPS.map(function (g) {
      var list = pats.filter(function (p) { return g[0] === 'tiles' ? !!p.tile : p.group === g[0]; });
      if (!list.length) return '';
      if (g[0] === 'tiles') {
        var dragons = list.filter(function (p) { return p.tile === 'dragon'; });
        var winds = list.filter(function (p) { return p.tile === 'wind'; });
        return '<div class="tai-group"><h4>' + esc(winds.length ? wt : g[1]) + '</h4><div class="tile-row">' +
          (dragons.length ? '<span class="tile-set">' + dragons.map(tileChip).join('') + '</span>' : '') +
          (winds.length ? '<span class="tile-set">' + winds.map(tileChip).join('') + '</span>' : '') + '</div></div>';
      }
      return '<div class="tai-group"><h4>' + g[1] + '</h4><div class="tai-chips">' +
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
    var ctx = windCtx();
    var pats = MJ.handPatterns(s, ctx);
    var byId = {};
    pats.forEach(function (p) { byId[p.id] = p; });

    $('#mjRound').textContent = MJ.roundName(m.wind, m.dealer, m.startDealer);
    $('#mjRoundSub').textContent = '第 ' + m.jiang + ' 將';
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
    buildChips(pats, ctx);
    $$('#mjTai [data-pat]').forEach(function (b) {
      var p = byId[b.getAttribute('data-pat')];
      if (!p) return;
      var n = clean[p.id] || 0;
      b.setAttribute('aria-pressed', String(n > 0));
      // 不算台的風牌（不是圈風也不是門風）點了也沒用，除非已經點了要取消
      b.disabled = !editable || !ready3 || (p.only && h.method && p.only !== h.method) || (p.tile === 'wind' && !p.tai && !n);
      var nm = $('.nm', b);
      if (nm) nm.textContent = p.name + (n > 1 ? ' ×' + n : '');
    });
    $('#mjExtra').textContent = h.extra > 0 ? '+' + h.extra : h.extra;
    $('#mjExtraDown').disabled = !editable || !ready3;
    $('#mjExtraUp').disabled = !editable || !ready3;
    $('#mjTaiAuto').disabled = !editable || !ready3 || !T.mjCalc;
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
      box.innerHTML = '<div class="guide"><strong>每把這樣輸入</strong><ol>' +
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
        '<p class="eyebrow">這把胡牌</p>' +
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
      sum.innerHTML = '<span class="muted">先完成抓位，再輸入這把</span>';
      commit.textContent = '記入，下一把';
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
    commit.textContent = '記入，下一把';
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

  function resetHand() {
    mj().hand = T.emptyHand();
    if (T.mjCalc) T.mjCalc.resetTai(); // 看牌算台點的牌也清掉
  }

  // 這把打完：換莊或連莊，莊家輪一輪就換圈，北風圈打完進下一將並重新抓位；回傳要顯示的訊息
  function finishHand(m, winner) {
    var p = MJ.advance(m, winner);
    ['jiang', 'wind', 'dealer', 'streak', 'hands'].forEach(function (k) { m[k] = p[k]; });
    resetHand();
    if (T.mjTools) T.mjTools.newHand(); // 下一把重擲骰子
    if (p.newJiang) {
      m.seatsAt = 0;
      seatingOpen = false;
      return '第 ' + (p.jiang - 1) + ' 將打完了！重新抓位，開始第 ' + p.jiang + ' 將';
    }
    var who = seatName(m.dealer);
    if (p.newWind) return '進入' + T.SEAT_CHARS[m.wind] + '風圈，' + who + '當莊';
    return m.streak ? who + '連莊（連 ' + m.streak + '）' : who + '當莊';
  }

  function commit() {
    if (!T.canEdit() || seating()) return;
    var m = mj();
    // 累計帳記的是玩家，不是位置；每把都記第幾將和圈風，流局也記一筆
    var nets = [];
    for (var p = 0; p < T.MAX_PLAYERS; p++) nets.push(0);
    var entry = { jiang: m.jiang, round: MJ.roundName(m.wind, m.dealer, m.startDealer), nets: nets };
    var winner = -1;
    if (isDraw()) {
      entry.winner = -1;
      entry.kind = 'draw';
      entry.tai = null;
    } else {
      var r = settleNow();
      if (!r.ready) return;
      r.nets.forEach(function (n, w) { nets[playerAt(w)] = n; });
      winner = r.winner;
      entry.winner = playerAt(r.winner);
      entry.kind = r.method;
      entry.tai = r.tai;
    }
    T.commitEntry('mahjong', entry, function () {
      var msg = finishHand(mj(), winner);
      change();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      T.toast((winner < 0 ? '流局，' : '已記入，') + msg);
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
    // 這將誰起莊：同時是現在的莊家
    $('#mjSeatStart').addEventListener('click', function (e) {
      var b = e.target.closest('[data-start]');
      if (!b || !T.canEdit()) return;
      var m = mj();
      m.dealer = m.startDealer = Number(b.getAttribute('data-start'));
      m.streak = 0;
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
    // 看牌自動勾：點胡牌的 17 張，碰碰胡、一色、中發白、東南西北自動勾
    $('#mjTaiAuto').addEventListener('click', function () {
      var h = hand();
      if (!T.canEdit() || !T.mjCalc || h.winner == null || h.winner < 0 || !h.method) return;
      var ctx = windCtx();
      T.mjCalc.openTai({
        who: seatName(h.winner), method: h.method, roundWind: ctx.roundWind, seatWind: ctx.seatWind,
        onApply: function (auto) {
          if (!T.canEdit()) return;
          var cur = hand();
          // 看牌看得出來的台型整個換掉，門清、獨聽、暗刻這些自己點的留著
          var ids = window.MahjongHand.TILE_PATTERN_IDS;
          var out = {};
          Object.keys(cur.picks || {}).forEach(function (id) { if (ids.indexOf(id) === -1) out[id] = cur.picks[id]; });
          Object.keys(auto).forEach(function (id) {
            if (!out[id]) out = MJ.togglePick(out, id, cur.method, settings());
          });
          cur.picks = MJ.cleanPicks(out, cur.method, settings());
          change();
          T.toast('已自動勾台型，門清、獨聽、暗刻請自己點');
        }
      });
    });
    $('#mjExtraDown').addEventListener('click', function () { if (T.canEdit()) { hand().extra -= 1; change(); } });
    $('#mjExtraUp').addEventListener('click', function () { if (T.canEdit()) { hand().extra += 1; change(); } });
    $('#mjClear').addEventListener('click', function () {
      if (!T.canEdit()) return;
      resetHand();
      change();
      T.toast('這把的輸入已清空');
    });

    // 規則面板：一般欄位
    var form = $('#set-mahjong');
    form.addEventListener('input', function (e) {
      if (!T.canEdit() || e.target.closest('#mjTaiEditor, #mjProgress')) return;
      readSettings();
      T.changed(PATH, 400);
    });
    form.addEventListener('change', function (e) {
      if (!T.canEdit() || e.target.closest('#mjTaiEditor, #mjProgress')) return;
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

    // 規則面板：牌局進度
    $('#mjJiang').addEventListener('input', function (e) {
      if (!T.canEdit() || e.target.value === '') return;
      mj().jiang = Math.max(1, Math.min(999, Math.round(Number(e.target.value)) || 1));
      T.changed(PATH, 400);
    });
    $('#mjJiang').addEventListener('change', function () { syncProgress(); });
    $('#mjProgress').addEventListener('change', function (e) {
      if (!T.canEdit() || e.target.type !== 'radio') return;
      var w = Number(e.target.value);
      if (e.target.name === 'mjWind') mj().wind = w;
      else mj().startDealer = w;
      T.changed(PATH);
    });
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
