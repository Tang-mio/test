/*
 * 牌桌計錢：共用核心
 * 狀態、本機儲存、共用牌桌同步、首頁、累計帳、名字與規則面板、分頁切換。
 * 各遊戲的畫面在 app/*-ui.js，透過 TableApp.games 註冊。
 */
(function () {
  'use strict';
  var PaiQi = window.PaiQi;
  var MJ = window.Mahjong;
  var BJ = window.Blackjack;

  var T = window.TableApp = {};
  var SEAT_CHARS = ['東', '南', '西', '北'];
  var MAX_PLAYERS = 8;
  var NAME_MAX = 10;
  var LOCAL_KEY = 'paitable-v2';
  var OLD_LOCAL_KEY = 'paiqi-calc-v1';
  var VIEW_KEY = 'paitable-view';
  var GAMES = { paiqi: '排七', mahjong: '麻將', blackjack: '21點' };
  var ROUND_WORD = { paiqi: '局', mahjong: '將', blackjack: '局' };
  var ID_PREFIX = { paiqi: 'r', mahjong: 'm', blackjack: 'b' };
  var MODE_TEXT = {
    connecting: ['連線中…', '正在連到共用的牌桌…'],
    sync: ['已同步', '資料存在共用牌桌。有 Claude 帳號的人登入後打開同一個連結，會看到同一局。'],
    readonly: ['只能看', '你可以即時看到牌桌，但沒有編輯權限，不能輸入。'],
    offline: ['連線中斷', '和共用牌桌的連線中斷了，重新整理頁面再試一次。'],
    local: ['單機', '資料只存在這支手機。']
  };

  T.GAMES = GAMES;
  T.ROUND_WORD = ROUND_WORD;
  T.SEAT_CHARS = SEAT_CHARS;
  T.MAX_PLAYERS = MAX_PLAYERS;
  T.games = {};

  /* ---------- 小工具 ---------- */

  T.$ = function (sel, el) { return (el || document).querySelector(sel); };
  T.$$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  T.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  T.fmtNum = function (x) { return Number(x).toLocaleString('zh-TW', { maximumFractionDigits: 2 }); };
  T.money = function (x) { return '$' + T.fmtNum(Math.abs(x)); };
  T.signedMoney = function (x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + T.money(x); };
  T.signClass = function (x) { return x > 0 ? 'pos' : x < 0 ? 'neg' : 'zero'; };
  T.round2 = function (x) { return Math.round(x * 100) / 100; };
  T.badge = function (i) { return i < 4 ? SEAT_CHARS[i] : String(i + 1); };
  T.name = function (i) {
    var n = (T.state.names[i] || '').trim();
    return n || (i < 4 ? SEAT_CHARS[i] + '家' : '玩家 ' + (i + 1));
  };
  T.canEdit = function () { return T.view.mode === 'local' || T.view.mode === 'sync'; };
  function $(s, el) { return T.$(s, el); }
  function $$(s, el) { return T.$$(s, el); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function int(v, fallback, min, max) {
    var n = Math.floor(Number(v));
    if (!isFinite(n)) return fallback;
    if (n < min) return min;
    if (max != null && n > max) return max;
    return n;
  }

  T.toast = function (msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('no-dock', $('#dock').hidden);
    t.classList.add('show');
    clearTimeout(T.toast.timer);
    T.toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  };

  /* ---------- 狀態 ---------- */

  function emptyPaiqiSeat() { return { covered: [], lastSeven: false }; }
  function emptyHand() { return { winner: null, method: null, discarder: null, picks: {}, extra: 0 }; }
  function filled(v) { var a = []; for (var i = 0; i < MAX_PLAYERS; i++) a.push(typeof v === 'function' ? v(i) : v); return a; }

  function emptyState() {
    return {
      names: filled(''),
      paiqi: {
        settings: PaiQi.normalizeSettings(),
        firstIdx: 0,
        players: [emptyPaiqiSeat(), emptyPaiqiSeat(), emptyPaiqiSeat(), emptyPaiqiSeat()],
        nextRound: 1
      },
      mahjong: { settings: MJ.normalizeSettings(), dealer: 0, streak: 0, hand: emptyHand(), nextRound: 1 },
      blackjack: { settings: BJ.normalizeSettings(), banker: 0, bets: filled(null), results: filled(null), doubled: filled(false), nextRound: 1 },
      ledger: []
    };
  }
  T.emptyHand = emptyHand;

  function cleanName(n) { return typeof n === 'string' ? n.slice(0, NAME_MAX) : ''; }
  function cleanPaiqiSeat(p) {
    p = p || {};
    return {
      covered: Array.isArray(p.covered)
        ? p.covered.filter(function (c) { return PaiQi.RANKS.indexOf(c) !== -1; }).slice(0, PaiQi.HAND_SIZE)
        : [],
      lastSeven: !!p.lastSeven
    };
  }
  function cleanMahjong(d) {
    d = d || {};
    var h = d.hand || {};
    var method = h.method === 'ziMo' || h.method === 'fangQiang' ? h.method : null;
    var winner = h.winner === -1 ? -1 : (h.winner == null ? null : int(h.winner, null, 0, 3));
    var settings = MJ.normalizeSettings(d.settings);
    return {
      settings: settings,
      dealer: int(d.dealer, 0, 0, 3),
      streak: int(d.streak, 0, 0, 99),
      hand: {
        winner: winner,
        method: method,
        discarder: h.discarder == null ? null : int(h.discarder, null, 0, 3),
        picks: MJ.cleanPicks(h.picks, method, settings),
        extra: int(h.extra, 0, -99, 99)
      },
      nextRound: int(d.nextRound, 1, 1)
    };
  }
  function cleanBlackjack(d) {
    d = d || {};
    var ids = BJ.RESULTS.map(function (r) { return r.id; });
    var arr = function (a, f) { return filled(function (i) { return f(Array.isArray(a) ? a[i] : undefined); }); };
    return {
      settings: BJ.normalizeSettings(d.settings),
      banker: int(d.banker, 0, 0, MAX_PLAYERS - 1),
      bets: arr(d.bets, function (v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Math.max(0, Number(v)); }),
      results: arr(d.results, function (v) { return ids.indexOf(v) !== -1 ? v : null; }),
      doubled: arr(d.doubled, function (v) { return !!v; }),
      nextRound: int(d.nextRound, 1, 1)
    };
  }
  function cleanEntry(e, id) {
    if (!e || !Array.isArray(e.nets) || (e.nets.length !== 4 && e.nets.length !== MAX_PLAYERS)) return null;
    var nets = filled(function (i) { return Number(e.nets[i]) || 0; });
    if (nets.some(function (n) { return !isFinite(n); })) return null;
    var game = GAMES[e.game] ? e.game : 'paiqi';
    return {
      id: id || e.id || null,
      game: game,
      at: Number(e.at) || 0,
      winner: int(e.winner, -1, -1, MAX_PLAYERS - 1),
      kind: typeof e.kind === 'string' ? e.kind.slice(0, 20) : '',
      tai: e.tai == null ? null : int(e.tai, null, 0, 999),
      nets: nets
    };
  }
  T.cleanEntry = cleanEntry;

  T.state = emptyState();
  T.view = { mode: 'local', screen: 'home', game: 'paiqi', ledgerFilter: 'all', rulesGame: 'paiqi' };

  /* ---------- 本機儲存 ---------- */

  function loadLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (raw && raw.names) {
        var s = emptyState();
        s.names = filled(function (i) { return cleanName(raw.names[i]); });
        var pq = raw.paiqi || {};
        s.paiqi.settings = PaiQi.normalizeSettings(pq.settings);
        s.paiqi.firstIdx = int(pq.firstIdx, 0, 0, 3);
        s.paiqi.nextRound = int(pq.nextRound, 1, 1);
        if (Array.isArray(pq.players)) s.paiqi.players = [0, 1, 2, 3].map(function (i) { return cleanPaiqiSeat(pq.players[i]); });
        s.mahjong = cleanMahjong(raw.mahjong);
        s.blackjack = cleanBlackjack(raw.blackjack);
        s.ledger = (Array.isArray(raw.ledger) ? raw.ledger : []).map(function (e) { return cleanEntry(e, e && e.id); }).filter(Boolean);
        return s;
      }
      // 舊版（只有排七）的資料搬過來
      var old = JSON.parse(localStorage.getItem(OLD_LOCAL_KEY) || 'null');
      if (old && old.round && Array.isArray(old.round.players) && old.round.players.length === 4) {
        var t = emptyState();
        t.paiqi.settings = PaiQi.normalizeSettings(old.settings);
        t.paiqi.firstIdx = int(old.round.firstIdx, 0, 0, 3);
        old.round.players.forEach(function (p, i) {
          t.names[i] = cleanName(p && p.name);
          if (!old.round.example) t.paiqi.players[i] = cleanPaiqiSeat(p);
        });
        t.ledger = (Array.isArray(old.ledger) ? old.ledger : []).map(function (e) { return cleanEntry(e); }).filter(Boolean);
        return t;
      }
    } catch (e) { /* 讀不到就從空的開始 */ }
    return null;
  }

  function saveLocal() {
    if (T.view.mode !== 'local') return;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(T.state)); } catch (e) { /* 無痕視窗等情況存不了，畫面照常運作 */ }
  }

  function loadView() {
    try {
      var v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (v && GAMES[v.game]) T.view.game = v.game;
      if (v && v.lastGame && GAMES[v.lastGame]) T.view.lastGame = v.lastGame;
      if (v && v.mySeat != null && v.mySeat >= 0 && v.mySeat < 4) T.view.mySeat = Math.floor(v.mySeat);
    } catch (e) { /* 沒有偏好就用預設 */ }
  }
  function saveView() {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ game: T.view.game, lastGame: T.view.lastGame, mySeat: T.view.mySeat })); } catch (e) { /* 同上 */ }
  }

  // 這支手機的人坐哪一家（只存在這支手機）；沒選過就當作東家
  T.mySeat = function () { return T.view.mySeat == null ? 0 : T.view.mySeat; };
  T.hasMySeat = function () { return T.view.mySeat != null; };
  T.setMySeat = function (i) {
    T.view.mySeat = i;
    saveView();
    T.render();
  };
  // 相對於自己的位置：0 我、1 下家、2 對家、3 上家
  T.RELATION = ['我', '下家', '對家', '上家'];
  T.relationOf = function (i) { return (i - T.mySeat() + 4) % 4; };
  T.mySeatButtons = function () {
    return T.SEAT_CHARS.map(function (c, i) {
      return '<button type="button" role="radio" data-me="' + i + '" aria-checked="' + (T.hasMySeat() && T.mySeat() === i) + '">' +
        '<span class="w">' + c + '</span>' + T.esc(T.name(i)) + '</button>';
    }).join('');
  };

  /* ---------- 共用牌桌（db） ----------
   * seats/0..3      排七每家的蓋牌，以及前四位玩家的名字
   * table/meta      排七規則、誰拿 ♠7、下一局編號
   * table/roster    第 5～8 位玩家的名字（21 點用）
   * table/mahjong   麻將規則、莊家、連莊、這將的輸入
   * table/blackjack 21 點規則、莊家、下注與結果
   * ledger/{id}     每局結果；id 依遊戲與局號，兩支手機同時記入會寫到同一份，不會重複記帳
   */

  var db = null;
  var writers = {};
  var timers = {};

  function docFor(path) {
    var s = T.state;
    var m = /^seats\/([0-3])$/.exec(path);
    if (m) {
      var i = Number(m[1]);
      return { name: s.names[i], covered: s.paiqi.players[i].covered.slice(), lastSeven: s.paiqi.players[i].lastSeven };
    }
    if (path === 'table/meta') return { settings: s.paiqi.settings, firstIdx: s.paiqi.firstIdx, nextRound: s.paiqi.nextRound };
    if (path === 'table/roster') return { extra: s.names.slice(4) };
    if (path === 'table/mahjong') return clone(s.mahjong);
    if (path === 'table/blackjack') return clone(s.blackjack);
    throw new Error('unknown path ' + path);
  }

  function setWithRetry(ref, data) {
    return ref.set(data).catch(function (e) {
      if (e && e.code && e.code !== 'unavailable') throw e;
      return new Promise(function (ok) { setTimeout(ok, 400 + Math.random() * 800); })
        .then(function () { return ref.set(data); });
    });
  }

  // 同一份文件一次只送一個寫入；連續修改時只送最新的內容
  function queueWrite(path, data) {
    var w = writers[path] || (writers[path] = { busy: false, next: null });
    w.next = data;
    if (w.busy) return;
    w.busy = true;
    (function send() {
      if (!w.next || !db) { w.busy = false; return; }
      var body = w.next;
      w.next = null;
      setWithRetry(db.doc(path), body).then(send, function (e) {
        w.busy = false;
        w.next = null;
        onWriteError(e);
      });
    })();
  }
  function busyLocally(path) { var w = writers[path]; return !!(timers[path] || (w && w.next)); }

  // 修改了某份資料：存起來（共用牌桌就排入寫入），再重畫
  T.save = function (path, delay) {
    if (db) {
      clearTimeout(timers[path]);
      if (delay) {
        timers[path] = setTimeout(function () { delete timers[path]; queueWrite(path, docFor(path)); }, delay);
      } else {
        delete timers[path];
        queueWrite(path, docFor(path));
      }
    }
    saveLocal();
  };
  T.changed = function (path, delay) {
    T.save(path, delay);
    T.render();
  };

  function onWriteError(e) {
    var code = e && e.code;
    if (code === 'invalid_argument' || code === 'not_granted') {
      setMode('readonly');
      T.toast('你沒有這個牌桌的編輯權限，只能觀看');
    } else if (code === 'quota_exceeded') {
      T.toast('共用牌桌的空間滿了，請到累計帳刪掉一些舊的局');
    } else if (code === 'revoked' || code === 'capability_disabled' || code === 'capability_removed') {
      setMode('offline');
    } else {
      T.toast('剛才的修改沒有同步成功，請再試一次');
    }
  }
  T.onWriteError = onWriteError;

  function onSubError() { setMode('offline'); }

  function subscribe() {
    db.collection('seats').onSnapshot(function (snap) {
      var got = {};
      snap.docs.forEach(function (d) { if (d.exists && /^[0-3]$/.test(d.id)) got[d.id] = d.data(); });
      for (var i = 0; i < 4; i++) {
        if (busyLocally('seats/' + i)) continue; // 自己還沒送出的修改優先
        var d = got[i] || {};
        if (document.activeElement !== $('#pname-' + i)) T.state.names[i] = cleanName(d.name);
        T.state.paiqi.players[i] = cleanPaiqiSeat(d);
      }
      T.render();
    }, onSubError);

    db.collection('table').onSnapshot(function (snap) {
      var got = {};
      snap.docs.forEach(function (d) { if (d.exists) got[d.id] = d.data(); });
      var s = T.state;
      if (!busyLocally('table/meta')) {
        var m = got.meta || {};
        s.paiqi.settings = PaiQi.normalizeSettings(m.settings);
        s.paiqi.firstIdx = int(m.firstIdx, 0, 0, 3);
        s.paiqi.nextRound = int(m.nextRound, 1, 1);
      }
      if (!busyLocally('table/roster')) {
        var extra = (got.roster && Array.isArray(got.roster.extra)) ? got.roster.extra : [];
        for (var i = 4; i < MAX_PLAYERS; i++) {
          if (document.activeElement !== $('#pname-' + i)) s.names[i] = cleanName(extra[i - 4]);
        }
      }
      if (!busyLocally('table/mahjong')) s.mahjong = cleanMahjong(got.mahjong);
      if (!busyLocally('table/blackjack')) s.blackjack = cleanBlackjack(got.blackjack);
      syncSettingsForms();
      T.render();
    }, onSubError);

    db.collection('ledger').orderBy('at').onSnapshot(function (snap) {
      T.state.ledger = snap.docs.map(function (d) { return d.exists ? cleanEntry(d.data(), d.id) : null; }).filter(Boolean);
      T.render();
    }, onSubError);
  }

  function connect() {
    var c = window.claude;
    if (!c || typeof c.use !== 'function') { goLocal(); return; }
    setMode('connecting');
    Promise.all([c.use('db'), c.use('user')]).then(function (got) {
      if (!got[0]) { goLocal(); return; }
      db = got[0];
      var user = got[1];
      return (user ? user.can('data.write') : Promise.resolve(null)).then(function (may) {
        T.state = emptyState();
        setMode(may === false ? 'readonly' : 'sync');
        syncSettingsForms();
        subscribe();
      });
    }).catch(goLocal);
  }

  function goLocal() {
    db = null;
    T.state = loadLocal() || emptyState();
    setMode('local');
    syncSettingsForms();
  }

  function setMode(mode) {
    T.view.mode = mode;
    var t = MODE_TEXT[mode];
    $('#syncPill').setAttribute('data-mode', mode);
    $('#syncText').textContent = t[0];
    $('#syncHint').textContent = t[1];
    ['namesFields', 'set-paiqi', 'set-mahjong', 'set-blackjack'].forEach(function (id) { $('#' + id).disabled = !T.canEdit(); });
    T.render();
  }

  /* ---------- 記帳 ---------- */

  function maxLedgerNo(prefix) {
    var re = new RegExp('^' + prefix + '(\\d+)$');
    return T.state.ledger.reduce(function (m, e) {
      var k = re.exec(e.id || '');
      return k ? Math.max(m, Number(k[1])) : m;
    }, 0);
  }

  // 把一局寫進累計帳；成功後呼叫 done(n)，n 是這局的編號。
  // 等待寫入時，同步可能已經換掉 T.state 裡的物件，所以完成後一律重新讀 T.state
  T.commitEntry = function (game, entry, done) {
    var n = Math.max(T.state[game].nextRound, maxLedgerNo(ID_PREFIX[game]) + 1);
    var id = ID_PREFIX[game] + String(n).padStart(5, '0');
    entry.game = game;
    entry.at = Date.now();
    if (!db) {
      T.state.ledger.push(cleanEntry(entry, id));
      T.state[game].nextRound = n + 1;
      done(n);
      return;
    }
    var btn = $('#commitBtn');
    btn.disabled = true;
    setWithRetry(db.doc('ledger/' + id), entry).then(function () {
      T.state[game].nextRound = Math.max(T.state[game].nextRound, n + 1);
      done(n);
    }, function (e) {
      btn.disabled = false;
      onWriteError(e);
    });
  };

  T.countOf = function (game) {
    return T.state.ledger.filter(function (e) { return e.game === game; }).length;
  };

  function ledgerFor(filter) {
    return T.state.ledger.filter(function (e) { return filter === 'all' || e.game === filter; });
  }
  function totalsOf(list) {
    var totals = filled(0);
    list.forEach(function (e) { e.nets.forEach(function (n, i) { totals[i] = T.round2(totals[i] + n); }); });
    return totals;
  }
  function activePlayers(list) {
    var seen = [0, 1, 2, 3];
    list.forEach(function (e) { e.nets.forEach(function (n, i) { if (n && seen.indexOf(i) === -1) seen.push(i); }); });
    return seen.sort(function (a, b) { return a - b; });
  }
  function entrySummary(e) {
    var esc = T.esc;
    if (e.game === 'paiqi') {
      var k = e.kind && e.kind !== 'normal' && PaiQi.KIND_LABEL[e.kind] ? ' <span class="pill pill-kind">' + PaiQi.KIND_LABEL[e.kind] + '</span>' : '';
      return esc(T.name(e.winner)) + k;
    }
    if (e.game === 'mahjong') {
      var how = e.kind === 'ziMo' ? '自摸' : '胡';
      return esc(T.name(e.winner)) + ' <span class="pill pill-kind">' + how + (e.tai != null ? ' ' + e.tai + ' 台' : '') + '</span>';
    }
    return '莊 ' + esc(T.name(e.winner));
  }

  function renderLedger() {
    var filter = T.view.ledgerFilter;
    var list = ledgerFor(filter);
    $('#ledgerBadge').textContent = T.state.ledger.length;
    $$('#ledgerFilter [data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === filter)); });
    var body = $('#ledgerBody');
    var label = filter === 'all' ? '' : GAMES[filter];
    if (!list.length) {
      $('#ledgerMeta').textContent = '';
      body.innerHTML = '<div class="empty-state"><strong>還沒有' + label + '記錄</strong>' +
        '<span>在遊戲頁算好之後按「記入」，每局輸贏會加總在這裡。</span></div>';
      return;
    }
    var totals = totalsOf(list);
    var who = activePlayers(list);
    var counts = {};
    list.forEach(function (e) { counts[e.game] = (counts[e.game] || 0) + 1; });
    $('#ledgerMeta').textContent = Object.keys(GAMES).filter(function (g) { return counts[g]; })
      .map(function (g) { return GAMES[g] + ' ' + counts[g] + ' ' + ROUND_WORD[g]; }).join('、');

    var tiles = who.map(function (i) {
      return '<div class="total-tile">' +
        '<span class="who"><span class="seat-badge" aria-hidden="true">' + T.badge(i) + '</span><span>' + T.esc(T.name(i)) + '</span></span>' +
        '<span class="amt ' + T.signClass(totals[i]) + '">' + T.signedMoney(totals[i]) + '</span>' +
      '</div>';
    }).join('');
    var head = '<tr><th>#</th><th>' + (filter === 'all' ? '遊戲・' : '') + '結果</th>' +
      who.map(function (i) { return '<th>' + T.esc(T.name(i)) + '</th>'; }).join('') + '</tr>';
    var rows = list.map(function (e, n) {
      var t = new Date(e.at);
      var hhmm = isNaN(t) ? '' : String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      return '<tr><td class="num">' + (n + 1) + '<span class="time">' + hhmm + '</span></td>' +
        '<td>' + (filter === 'all' ? '<span class="game-tag">' + GAMES[e.game] + '</span>' : '') + entrySummary(e) + '</td>' +
        who.map(function (i) { return '<td class="num ' + T.signClass(e.nets[i]) + '">' + (e.nets[i] ? T.signedMoney(e.nets[i]) : '·') + '</td>'; }).join('') + '</tr>';
    }).reverse().join('');
    var foot = '<tr><td>合計</td><td></td>' + who.map(function (i) {
      return '<td class="' + T.signClass(totals[i]) + '">' + T.signedMoney(totals[i]) + '</td>';
    }).join('') + '</tr>';
    var dis = T.canEdit() ? '' : ' disabled';
    body.innerHTML =
      '<div class="ledger">' +
        '<div class="totals">' + tiles + '</div>' +
        '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + rows + '</tbody><tfoot>' + foot + '</tfoot></table></div>' +
        '<div class="ledger-actions">' +
          '<button type="button" class="btn primary" id="copyLedger">複製結算文字</button>' +
          '<button type="button" class="btn" id="undoLedger"' + dis + '>刪除最後一' + (filter === 'mahjong' ? '將' : '局') + '</button>' +
          '<button type="button" class="btn danger" id="clearLedger"' + dis + '>清空' + (label ? label + '的帳' : '全部') + '</button>' +
        '</div>' +
        '<textarea class="copy-fallback" id="copyFallback" readonly hidden aria-label="結算文字"></textarea>' +
      '</div>';
  }

  function ledgerText() {
    var filter = T.view.ledgerFilter;
    var list = ledgerFor(filter);
    var totals = totalsOf(list);
    var lines = ['牌桌累計（' + ($('#ledgerMeta').textContent || '0 局') + '）'];
    activePlayers(list).forEach(function (i) { lines.push(T.name(i) + ' ' + T.signedMoney(totals[i])); });
    return lines.join('\n');
  }

  function deleteEntries(entries, msg) {
    if (!entries.length) return;
    if (!db) {
      T.state.ledger = T.state.ledger.filter(function (e) { return entries.indexOf(e) === -1; });
      saveLocal();
      T.render();
      T.toast(msg);
      return;
    }
    entries.reduce(function (chain, e) {
      return chain.then(function () { return e.id ? db.doc('ledger/' + e.id).delete() : null; });
    }, Promise.resolve()).then(function () { T.toast(msg); }, onWriteError);
  }

  /* ---------- 首頁 ---------- */

  function renderHome() {
    Object.keys(GAMES).forEach(function (g) {
      var n = T.countOf(g);
      var meta = $('[data-meta="' + g + '"]');
      meta.textContent = n ? '已記 ' + n + ' ' + ROUND_WORD[g] : (T.view.lastGame === g ? '上次玩這個' : '');
      $('.game-card[data-game="' + g + '"]').classList.toggle('last', T.view.lastGame === g);
    });
    var bjCount = T.state.blackjack.settings.count;
    var shown = Math.max(4, bjCount);
    var chips = [];
    for (var i = 0; i < shown; i++) {
      chips.push('<span class="name-chip"><span class="seat-badge" aria-hidden="true">' + T.badge(i) + '</span>' + T.esc(T.name(i)) + '</span>');
    }
    $('#homeNameChips').innerHTML = chips.join('');
    $('#homeMe').innerHTML = T.mySeatButtons();
    var all = T.state.ledger;
    var list = $('#homeTotalsList');
    if (!all.length) {
      list.innerHTML = '<li class="hint">還沒有記錄。選一個遊戲開始吧。</li>';
      $('#homeLedger').hidden = true;
      return;
    }
    $('#homeLedger').hidden = false;
    var totals = totalsOf(all);
    list.innerHTML = activePlayers(all)
      .sort(function (a, b) { return totals[b] - totals[a]; })
      .map(function (i) {
        return '<li><span>' + T.esc(T.name(i)) + '</span><b class="' + T.signClass(totals[i]) + '">' + T.signedMoney(totals[i]) + '</b></li>';
      }).join('');
  }

  /* ---------- 名字與規則面板 ---------- */

  function buildNameGrid() {
    var html = '';
    for (var i = 0; i < MAX_PLAYERS; i++) {
      html += '<label class="name-field" data-name-row="' + i + '"><span class="seat-badge" aria-hidden="true">' + T.badge(i) + '</span>' +
        '<input id="pname-' + i + '" data-pname="' + i + '" maxlength="' + NAME_MAX + '" autocomplete="off" placeholder="' +
        (i < 4 ? SEAT_CHARS[i] + '家' : '玩家 ' + (i + 1)) + '" aria-label="第 ' + (i + 1) + ' 位玩家名字"></label>';
    }
    $('#nameGrid').innerHTML = html;
  }

  function renderNameInputs() {
    var showAll = T.view.setupScope === 'blackjack' || T.state.blackjack.settings.count > 4;
    for (var i = 0; i < MAX_PLAYERS; i++) {
      var input = $('#pname-' + i);
      if (document.activeElement !== input && input.value !== T.state.names[i]) input.value = T.state.names[i];
      $('[data-name-row="' + i + '"]').hidden = i >= 4 && !showAll;
    }
  }

  function syncSettingsForms() {
    Object.keys(T.games).forEach(function (g) { if (T.games[g].syncSettings) T.games[g].syncSettings(); });
  }
  T.syncSettingsForms = syncSettingsForms;

  T.openSetup = function (opts) {
    opts = opts || {};
    var scope = opts.scope || (T.view.screen === 'home' ? 'names' : T.view.game);
    T.view.setupScope = scope;
    Object.keys(GAMES).forEach(function (g) { $('#set-' + g).hidden = scope !== g; });
    $('#resetSettings').hidden = !GAMES[scope];
    $('#setupTitle').textContent = GAMES[scope] ? '名字・' + GAMES[scope] + '規則' : '玩家名字';
    renderNameInputs();
    syncSettingsForms();
    var dlg = $('#setup');
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
    if (opts.focusName != null && T.canEdit()) {
      var input = $('#pname-' + opts.focusName);
      input.focus();
      input.select();
    }
  };
  function closeSetup() {
    var dlg = $('#setup');
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  /* ---------- 畫面切換 ---------- */

  T.go = function (screen, game) {
    if (game && GAMES[game]) {
      T.view.game = game;
      T.view.lastGame = game;
      T.view.rulesGame = game;
      if (screen === 'ledger') T.view.ledgerFilter = game;
      saveView();
    }
    T.view.screen = screen;
    if (screen === 'play' && T.games[T.view.game].onShow) T.games[T.view.game].onShow();
    T.render();
    window.scrollTo(0, 0);
  };

  T.render = function () {
    var v = T.view;
    var inGame = v.screen !== 'home';
    $('#top').classList.toggle('in-game', inGame);
    $('#backHome').hidden = !inGame;
    $('#tabs').hidden = !inGame;
    $('#appTitle').textContent = inGame ? GAMES[v.game] : '牌桌計錢';
    $$('#tabs [data-screen]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-screen') === v.screen)); });

    $('#screen-home').hidden = v.screen !== 'home';
    $('#screen-ledger').hidden = v.screen !== 'ledger';
    $('#screen-rules').hidden = v.screen !== 'rules';
    Object.keys(GAMES).forEach(function (g) { $('#play-' + g).hidden = !(v.screen === 'play' && v.game === g); });

    var dock = $('#dock');
    dock.hidden = v.screen !== 'play';
    $('#app').classList.toggle('has-dock', !dock.hidden);
    $('#pqDock').hidden = v.game !== 'paiqi';

    if (v.screen === 'home') renderHome();
    if (v.screen === 'play') T.games[v.game].render();
    if (v.screen === 'ledger') renderLedger();
    else $('#ledgerBadge').textContent = T.state.ledger.length;
    if (v.screen === 'rules') {
      if (T.games[v.rulesGame].renderRules) T.games[v.rulesGame].renderRules();
      $$('#rulesFilter [data-rules]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-rules') === v.rulesGame)); });
      Object.keys(GAMES).forEach(function (g) { $('#rules-' + g).hidden = g !== v.rulesGame; });
    }
    if ($('#setup').open) renderNameInputs();
    measureDock();
  };

  function measureDock() {
    var dock = $('#dock');
    if (!dock.hidden) document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px');
  }

  /* ---------- 事件 ---------- */

  function bind() {
    $('#backHome').addEventListener('click', function () { T.go('home'); });
    $('#tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-screen]');
      if (!b) return;
      var screen = b.getAttribute('data-screen');
      if (screen === 'ledger') T.view.ledgerFilter = T.view.game;
      if (screen === 'rules') T.view.rulesGame = T.view.game;
      T.go(screen);
    });
    $('.games').addEventListener('click', function (e) {
      var c = e.target.closest('[data-game]');
      if (c) T.go('play', c.getAttribute('data-game'));
    });
    $('#homeNames').addEventListener('click', function () { T.openSetup({ scope: 'names' }); });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-me]');
      if (b) T.setMySeat(Number(b.getAttribute('data-me')));
    });
    $('#homeLedger').addEventListener('click', function () { T.view.ledgerFilter = 'all'; T.go('ledger'); });
    $('#ledgerFilter').addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      T.view.ledgerFilter = b.getAttribute('data-filter');
      T.render();
    });
    $('#rulesFilter').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rules]');
      if (!b) return;
      T.view.rulesGame = b.getAttribute('data-rules');
      T.render();
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-setup]')) T.openSetup();
    });
    $('#closeSetup').addEventListener('click', closeSetup);
    $('#setup').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeSetup(); });
    $('#setup').addEventListener('close', function () { T.render(); });

    $('#nameGrid').addEventListener('input', function (e) {
      if (!e.target.matches('[data-pname]') || !T.canEdit()) return;
      var i = Number(e.target.getAttribute('data-pname'));
      T.state.names[i] = e.target.value.slice(0, NAME_MAX);
      T.save(i < 4 ? 'seats/' + i : 'table/roster', 400);
      T.render();
    });

    // 恢復預設要按兩次，免得不小心把自己設好的台數表清掉
    var resetBtn = $('#resetSettings');
    resetBtn.addEventListener('click', function () {
      var g = T.games[T.view.setupScope];
      if (!g || !T.canEdit()) return;
      if (!resetBtn.classList.contains('armed')) {
        resetBtn.classList.add('armed', 'danger');
        resetBtn.textContent = '再按一次恢復預設';
        clearTimeout(resetBtn.timer);
        resetBtn.timer = setTimeout(function () {
          resetBtn.classList.remove('armed', 'danger');
          resetBtn.textContent = '恢復預設規則';
        }, 4000);
        return;
      }
      clearTimeout(resetBtn.timer);
      resetBtn.classList.remove('armed', 'danger');
      resetBtn.textContent = '恢復預設規則';
      g.resetSettings();
      syncSettingsForms();
      T.toast('已恢復預設規則');
    });

    $('#commitBtn').addEventListener('click', function () {
      if (T.view.screen === 'play') T.games[T.view.game].commit();
    });

    $('#ledgerBody').addEventListener('click', function (e) {
      var t = e.target;
      var list = ledgerFor(T.view.ledgerFilter);
      if (t.closest('#copyLedger')) {
        var text = ledgerText();
        var fallback = function () {
          var ta = $('#copyFallback');
          ta.value = text;
          ta.hidden = false;
          ta.focus();
          ta.select();
          T.toast('請長按或 Ctrl+C 複製選取的文字');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { T.toast('已複製，可以貼到群組'); }, fallback);
        } else {
          fallback();
        }
      } else if (t.closest('#undoLedger')) {
        var last = list[list.length - 1];
        if (last) deleteEntries([last], '已刪除最後一筆');
      } else if (t.closest('#clearLedger')) {
        var btn = t.closest('#clearLedger');
        if (btn.classList.contains('armed')) {
          deleteEntries(list, '帳本已清空');
        } else {
          var label = btn.textContent;
          btn.classList.add('armed');
          btn.textContent = '再按一次確定清空';
          setTimeout(function () {
            if (!btn.isConnected) return;
            btn.classList.remove('armed');
            btn.textContent = label;
          }, 4000);
        }
      }
    });

    window.addEventListener('resize', measureDock);
  }

  T.start = function () {
    loadView();
    buildNameGrid();
    Object.keys(T.games).forEach(function (g) { T.games[g].init(); });
    bind();
    var hash = (location.hash || '').replace('#', '');
    if (GAMES[hash]) { T.view.game = hash; T.view.screen = 'play'; }
    else if (hash === 'ledger' || hash === 'rules') T.view.screen = hash;
    connect();
  };
})();
