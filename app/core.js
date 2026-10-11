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
  var NN = window.Niuniu;

  var T = window.TableApp = {};
  var SEAT_CHARS = ['東', '南', '西', '北'];
  var MAX_PLAYERS = 8;
  var NAME_MAX = 10;
  var LOCAL_KEY = 'paitable-v2';
  var OLD_LOCAL_KEY = 'paiqi-calc-v1';
  var VIEW_KEY = 'paitable-view';
  var GAMES = { mahjong: '麻將', paiqi: '排七', blackjack: '21點', niuniu: '妞妞' };
  var ROUND_WORD = { paiqi: '局', mahjong: '把', blackjack: '局', niuniu: '局' };
  var ID_PREFIX = { paiqi: 'r', mahjong: 'm', blackjack: 'b', niuniu: 'n' };
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
  // 玩家用編號和名字；東南西北只在麻將的牌桌上用（要抓位）
  T.badge = function (i) { return String(i + 1); };
  T.name = function (i) {
    var n = (T.state.names[i] || '').trim();
    return n || '玩家 ' + (i + 1);
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
      mahjong: {
        settings: MJ.normalizeSettings(), seats: [0, 1, 2, 3], seatsAt: 0,
        jiang: 1, wind: 0, startDealer: 0, hands: 0, dealer: 0, streak: 0, hand: emptyHand(), nextRound: 1
      },
      blackjack: { settings: BJ.normalizeSettings(), banker: 0, bets: filled(null), results: filled(null), doubled: filled(false), nextRound: 1 },
      niuniu: { settings: NN.normalizeSettings(), banker: 0, bets: filled(null), hands: filled(null), ties: filled(null), nextRound: 1 },
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
  // 麻將抓位：東南西北各坐第幾位玩家，四個人不能重複
  function cleanSeats(a) {
    if (!Array.isArray(a) || a.length !== 4) return [0, 1, 2, 3];
    var out = a.map(function (v) { return int(v, -1, -1, MAX_PLAYERS - 1); });
    var ok = out.every(function (v, i) { return v >= 0 && out.indexOf(v) === i; });
    return ok ? out : [0, 1, 2, 3];
  }

  function cleanMahjong(d) {
    d = d || {};
    var h = d.hand || {};
    var method = h.method === 'ziMo' || h.method === 'fangQiang' || h.method === 'zhaHu' ? h.method : null;
    var winner = h.winner === -1 ? -1 : (h.winner == null ? null : int(h.winner, null, 0, 3));
    var settings = MJ.normalizeSettings(d.settings);
    return {
      settings: settings,
      seats: cleanSeats(d.seats),
      seatsAt: int(d.seatsAt, 0, 0),
      jiang: int(d.jiang, 1, 1, 999),
      wind: int(d.wind, 0, 0, 3),
      startDealer: int(d.startDealer, 0, 0, 3),
      hands: int(d.hands, 0, 0),
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
  // 妞妞：莊家、下注、每個人的牌型（莊家也在 hands 裡）、同牌型時誰大
  function cleanNiuniu(d) {
    d = d || {};
    var settings = NN.normalizeSettings(d.settings);
    var arr = function (a, f) { return filled(function (i) { return f(Array.isArray(a) ? a[i] : undefined); }); };
    return {
      settings: settings,
      banker: int(d.banker, 0, 0, MAX_PLAYERS - 1),
      bets: arr(d.bets, function (v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Math.max(0, Number(v)); }),
      hands: arr(d.hands, function (v) { return NN.isHand(v, settings) ? v : null; }),
      ties: arr(d.ties, function (v) { return v === 'banker' || v === 'player' ? v : null; }),
      nextRound: int(d.nextRound, 1, 1)
    };
  }
  // 麻將：記這把時的牌局進度，刪掉這把時退回去
  function cleanPrev(p) {
    if (!p || typeof p !== 'object') return null;
    return {
      jiang: int(p.jiang, 1, 1, 999),
      wind: int(p.wind, 0, 0, 3),
      startDealer: int(p.startDealer, 0, 0, 3),
      dealer: int(p.dealer, 0, 0, 3),
      streak: int(p.streak, 0, 0, 99),
      hands: int(p.hands, 0, 0),
      seats: Array.isArray(p.seats) ? cleanSeats(p.seats) : null
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
      jiang: e.jiang == null ? null : int(e.jiang, null, 1, 999), // 麻將：第幾將
      round: typeof e.round === 'string' ? e.round.slice(0, 6) : '', // 麻將：例如「東風南」
      prev: game === 'mahjong' ? cleanPrev(e.prev) : null,
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
        s.niuniu = cleanNiuniu(raw.niuniu);
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
      if (v && v.mySeat != null && v.mySeat >= 0 && v.mySeat < MAX_PLAYERS) T.view.mySeat = Math.floor(v.mySeat);
    } catch (e) { /* 沒有偏好就用預設 */ }
  }
  function saveView() {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ game: T.view.game, lastGame: T.view.lastGame, mySeat: T.view.mySeat })); } catch (e) { /* 同上 */ }
  }

  // 這支手機的人是第幾位玩家（只存在這支手機）；麻將坐哪要抓位
  T.me = function () { return T.view.mySeat == null ? null : T.view.mySeat; };
  T.setMySeat = function (i) {
    T.view.mySeat = T.view.mySeat === i ? null : i; // 再點一次取消
    saveView();
    T.render();
  };
  T.plainName = T.name;
  // 相對於自己的位置：0 我、1 下家、2 對家、3 上家
  T.RELATION = ['我', '下家', '對家', '上家'];

  /* ---------- 共用牌桌（db） ----------
   * seats/0..3      排七每家的蓋牌，以及前四位玩家的名字
   * table/meta      排七規則、誰拿 ♠7、下一局編號
   * table/roster    第 5～8 位玩家的名字（21 點用）
   * table/mahjong   麻將規則、抓位（誰坐東南西北）、第幾將和圈風、莊家、連莊、這把的輸入
   * table/blackjack 21 點規則、莊家、下注與結果
   * table/niuniu    妞妞規則、莊家、下注與牌型
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
    if (path === 'table/niuniu') return clone(s.niuniu);
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
      if (!busyLocally('table/niuniu')) s.niuniu = cleanNiuniu(got.niuniu);
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
    ['namesFields', 'set-paiqi', 'set-mahjong', 'set-blackjack', 'set-niuniu'].forEach(function (id) { $('#' + id).disabled = !T.canEdit(); });
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

  // 玩家人數 4–8：前四位排七、麻將，全部的人都能玩 21 點（和 21 點的人數是同一個設定）
  T.playerCount = function () { return Math.max(4, T.state.blackjack.settings.count); };
  T.setPlayerCount = function (n) {
    var bj = T.state.blackjack;
    n = Math.max(4, Math.min(MAX_PLAYERS, n));
    bj.settings = BJ.normalizeSettings(Object.assign({}, bj.settings, { count: n }));
    if (bj.banker >= n) bj.banker = 0;
    T.changed('table/blackjack');
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
      return esc(T.plainName(e.winner)) + k;
    }
    if (e.game === 'mahjong') {
      if (e.kind === 'draw') return '<span class="muted">流局</span>';
      if (e.kind === 'zhaHu') return esc(T.plainName(e.winner)) + ' <span class="pill pill-kind pill-zha">炸胡</span>';
      var how = e.kind === 'ziMo' ? '自摸' : '胡';
      return esc(T.plainName(e.winner)) + ' <span class="pill pill-kind">' + how + (e.tai != null ? ' ' + e.tai + ' 台' : '') + '</span>';
    }
    if (e.game === 'niuniu' && NN.BY_ID[e.kind]) {
      return '莊 ' + esc(T.plainName(e.winner)) + ' <span class="pill pill-kind">' + NN.BY_ID[e.kind].name + '</span>';
    }
    return '莊 ' + esc(T.plainName(e.winner));
  }

  /* 累計帳往左滑刪除：手指往左滑一列，右邊露出「刪除」；表格比畫面寬時，先捲到最右邊再滑。
   * 滑一半以上就停在打開，點「刪除」才真的刪；點別的地方收起來。滑鼠也可以拖，鍵盤 Tab 到「刪除」會自己打開。 */
  var DEL_W = 76;
  var swipe = null;
  function swipeSet(item, x, animate) {
    var cells = item.querySelector('.lg-cells');
    item.classList.toggle('dragging', !animate);
    cells.style.transform = x ? 'translateX(' + x + 'px)' : '';
  }
  function swipeClose(except) {
    $$('#ledgerBody .lg-item.open').forEach(function (it) {
      if (it === except) return;
      it.classList.remove('open');
      swipeSet(it, 0, true);
    });
  }
  function atRightEdge(item) {
    var wrap = item.closest('.table-wrap');
    return !wrap || wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 2;
  }
  function swipeStart(item, x, y) {
    swipe = { item: item, x0: x, y0: y, base: item.classList.contains('open') ? -DEL_W : 0, mode: null, dx: 0 };
  }
  // 回傳 true 表示這一下是往左滑（呼叫的人要擋掉捲動）
  function swipeMove(x, y) {
    if (!swipe) return false;
    var dx = x - swipe.x0;
    var dy = y - swipe.y0;
    if (!swipe.mode) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return false;
      var sideways = Math.abs(dx) > Math.abs(dy) * 1.2;
      swipe.mode = sideways && (swipe.base || (dx < 0 && atRightEdge(swipe.item))) ? 'swipe' : 'scroll';
      if (swipe.mode === 'swipe') swipeClose(swipe.item);
    }
    if (swipe.mode !== 'swipe') return false;
    swipe.dx = dx;
    swipeSet(swipe.item, Math.max(-DEL_W - 24, Math.min(0, swipe.base + dx)), false);
    return true;
  }
  function swipeEnd() {
    var sw = swipe;
    swipe = null;
    if (!sw || sw.mode !== 'swipe') return false;
    var open = sw.base + sw.dx < -DEL_W / 2;
    sw.item.classList.toggle('open', open);
    swipeSet(sw.item, open ? -DEL_W : 0, true);
    return true;
  }
  function initSwipe(body) {
    var itemOf = function (t) {
      if (!T.canEdit() || !t.closest || t.closest('.lg-del')) return null;
      return t.closest('.lg-item');
    };
    body.addEventListener('touchstart', function (e) {
      var item = itemOf(e.target);
      if (!item || e.touches.length !== 1) { swipe = null; return; }
      swipeStart(item, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    body.addEventListener('touchmove', function (e) {
      if (swipe && e.touches.length === 1 && swipeMove(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });
    body.addEventListener('touchend', swipeEnd);
    body.addEventListener('touchcancel', swipeEnd);
    // 滑鼠拖：拖完那一下的 click 不算
    var dragged = false;
    body.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      var item = itemOf(e.target);
      if (!item) return;
      swipeStart(item, e.clientX, e.clientY);
      var move = function (ev) { if (swipeMove(ev.clientX, ev.clientY)) ev.preventDefault(); };
      var up = function () {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        dragged = swipeEnd();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    body.addEventListener('click', function (e) {
      if (dragged) { dragged = false; e.stopImmediatePropagation(); }
    }, true);
    // 點累計帳以外的地方也收起來
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#ledgerBody .lg-item.open')) swipeClose();
    });
  }

  // 累計帳每一筆的代號：有 id 用 id，舊的本機紀錄用位置
  function entryKey(e) { return e.id || 'i' + T.state.ledger.indexOf(e); }
  function entryByKey(key) {
    return T.state.ledger.filter(function (e) { return entryKey(e) === key; })[0] || null;
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
        '<span class="who"><span class="seat-badge" aria-hidden="true">' + (i + 1) + '</span><span>' + T.esc(T.plainName(i)) + '</span></span>' +
        '<span class="amt ' + T.signClass(totals[i]) + '">' + T.signedMoney(totals[i]) + '</span>' +
      '</div>';
    }).join('');
    // 每一筆是一列 grid（不用 table，才能往左滑出「刪除」）；所有列用同一組欄寬，看起來還是一張表
    var editable = T.canEdit();
    var textEm = function (str) {
      var w = 0;
      String(str).split('').forEach(function (c) { w += c.charCodeAt(0) < 0x2E80 ? 0.62 : 1; }); // 中日文字一個字寬，其他（數字、−、$）大約 0.62
      return w;
    };
    // 表格裡的金額不寫 $，手機上四個人才排得下（上面的合計卡片有寫）
    var signed = function (x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + T.fmtNum(Math.abs(x)); };
    var amtEm = 2.2;
    who.forEach(function (i) {
      amtEm = Math.max(amtEm, Math.min(4.6, textEm(T.plainName(i)) * 0.98), textEm(signed(totals[i])) * 1.04);
      list.forEach(function (e) { if (e.nets[i]) amtEm = Math.max(amtEm, textEm(signed(e.nets[i]))); });
    });
    var amtCol = 'calc(' + amtEm.toFixed(2) + 'em + 10px)';
    var cols = '3.5em minmax(5.6em, 1fr) repeat(' + who.length + ', ' + amtCol + ')';
    var minW = 'calc(9.1em + ' + who.length + ' * (' + amtEm.toFixed(2) + 'em + 10px))';
    var head = '<div class="lg-row lg-head" role="row"><span role="columnheader">#</span><span role="columnheader">' + (filter === 'all' ? '遊戲・' : '') + '結果</span>' +
      who.map(function (i) { return '<span role="columnheader">' + T.esc(T.plainName(i)) + '</span>'; }).join('') + '</div>';
    // 麻將打了不只一將時，每將上面加一條細細的「第 N 將」
    var jiangs = {};
    list.forEach(function (e) { if (e.game === 'mahjong' && e.jiang) jiangs[e.jiang] = true; });
    var showJiang = Object.keys(jiangs).length > 1;
    var lastJiang = null;
    var rows = list.map(function (e, n) {
      var t = new Date(e.at);
      var hhmm = isNaN(t) ? '' : String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      // 麻將那格小字寫圈風（例如東風南），其他遊戲寫時間
      var sub = e.game === 'mahjong' && e.round ? e.round : hhmm;
      var key = entryKey(e);
      var word = ROUND_WORD[e.game] || '局';
      return { e: e, html: '<div class="lg-item" role="row" data-key="' + T.esc(key) + '">' +
        '<div class="lg-cells" role="none">' +
          '<span role="cell" class="num"' + (sub !== hhmm && hhmm ? ' title="' + hhmm + '"' : '') + '>' + (n + 1) + '<span class="time">' + sub + '</span></span>' +
          '<span role="cell" class="lg-what">' + (filter === 'all' ? '<span class="game-tag">' + GAMES[e.game] + '</span>' : '') + entrySummary(e) + '</span>' +
          who.map(function (i) { return '<span role="cell" class="num ' + T.signClass(e.nets[i]) + '">' + (e.nets[i] ? signed(e.nets[i]) : '·') + '</span>'; }).join('') +
        '</div>' +
        (editable ? '<span role="cell" class="lg-delcell"><button type="button" class="lg-del" data-del="' + T.esc(key) + '" data-no="' + (n + 1) + '"' +
          ' aria-label="刪除第 ' + (n + 1) + ' ' + word + '">刪除</button></span>' : '') +
      '</div>' };
    }).reverse().map(function (r) {
      var e = r.e;
      if (!showJiang || e.game !== 'mahjong' || !e.jiang || e.jiang === lastJiang) return r.html;
      lastJiang = e.jiang;
      return '<div class="lg-jiang" role="row"><span role="cell">第 ' + e.jiang + ' 將</span></div>' + r.html;
    }).join('');
    var foot = '<div class="lg-row lg-foot" role="row"><span role="cell">合計</span><span role="cell"></span>' + who.map(function (i) {
      return '<span role="cell" class="num ' + T.signClass(totals[i]) + '">' + signed(totals[i]) + '</span>';
    }).join('') + '</div>';
    var dis = editable ? '' : ' disabled';
    body.innerHTML =
      '<div class="ledger">' +
        '<div class="totals">' + tiles + '</div>' +
        '<div class="table-wrap"><div class="lg" role="table" aria-label="每' + (filter === 'mahjong' ? '把' : '局') + '輸贏" style="--cols: ' + cols + '; min-width: ' + minW + '">' +
          head + '<div class="lg-body" role="rowgroup">' + rows + '</div>' + foot + '</div></div>' +
        (editable ? '<p class="hint lg-hint">往左滑一筆可以刪除。刪掉麻將最新的一把，將、圈和莊家也會退回去。</p>' : '') +
        '<div class="ledger-actions">' +
          '<button type="button" class="btn primary" id="copyLedger">複製結算文字</button>' +
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
    activePlayers(list).forEach(function (i) { lines.push(T.plainName(i) + ' ' + T.signedMoney(totals[i])); });
    return lines.join('\n');
  }

  // 刪掉的包含麻將最新的幾把時，牌局進度退回最早刪掉那把開始前；回傳刪完要做的事
  function mahjongRollback(entries) {
    var log = T.state.ledger.filter(function (e) { return e.game === 'mahjong'; });
    var k = log.length;
    while (k > 0 && entries.indexOf(log[k - 1]) !== -1) k--;
    if (k === log.length || !T.games.mahjong || !T.games.mahjong.restore) return null;
    var first = log[k];
    var before = log.slice(0, k);
    return function () { return T.games.mahjong.restore(first, before); };
  }

  function deleteEntries(entries, msg) {
    if (!entries.length) return;
    var rollback = mahjongRollback(entries);
    var done = function () {
      var more = rollback ? rollback() : '';
      T.toast(more ? msg + '，' + more : msg);
    };
    if (!db) {
      T.state.ledger = T.state.ledger.filter(function (e) { return entries.indexOf(e) === -1; });
      saveLocal();
      T.render();
      done();
      return;
    }
    entries.reduce(function (chain, e) {
      return chain.then(function () { return e.id ? db.doc('ledger/' + e.id).delete() : null; });
    }, Promise.resolve()).then(done, onWriteError);
  }

  /* ---------- 首頁 ---------- */

  function renderHome() {
    Object.keys(GAMES).forEach(function (g) {
      var n = T.countOf(g);
      var meta = $('[data-meta="' + g + '"]');
      meta.textContent = n ? '已記 ' + n + ' ' + ROUND_WORD[g] : (T.view.lastGame === g ? '上次玩這個' : '');
      $('.game-card[data-game="' + g + '"]').classList.toggle('last', T.view.lastGame === g);
    });
    // 玩家：4 到 8 人，前四位排七・麻將，第 5 位起 21 點、妞妞；點自己的名字標成「我」
    var shown = T.playerCount();
    var chip = function (i) {
      var mine = T.me() === i;
      return '<button type="button" class="player-chip" role="radio" data-me="' + i + '" aria-checked="' + mine + '">' +
        T.esc(T.plainName(i)) + (mine ? '<span class="me-tag">我</span>' : '') + '</button>';
    };
    var first = [0, 1, 2, 3].map(chip).join('');
    var more = [];
    for (var i = 4; i < shown; i++) more.push(chip(i));
    $('#homeNameChips').innerHTML = '<div class="roster-row"><span class="roster-tag">排七・麻將</span><div class="roster-chips">' + first + '</div></div>' +
      (more.length ? '<div class="roster-row"><span class="roster-tag">21 點、妞妞也一起玩</span><div class="roster-chips">' + more.join('') + '</div></div>' : '');
    $('#homeCount').textContent = shown;
    $('#homeCountDown').disabled = !T.canEdit() || shown <= 4;
    $('#homeCountUp').disabled = !T.canEdit() || shown >= MAX_PLAYERS;
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
        return '<li><span>' + T.esc(T.plainName(i)) + (T.me() === i ? '（我）' : '') + '</span><b class="' + T.signClass(totals[i]) + '">' + T.signedMoney(totals[i]) + '</b></li>';
      }).join('');
  }

  /* ---------- 名字與規則面板 ---------- */

  function buildNameGrid() {
    var html = '';
    for (var i = 0; i < MAX_PLAYERS; i++) {
      html += '<label class="name-field" data-name-row="' + i + '"><span class="seat-badge" data-name-badge aria-hidden="true"></span>' +
        '<input id="pname-' + i + '" data-pname="' + i + '" maxlength="' + NAME_MAX + '" autocomplete="off"' +
        ' aria-label="第 ' + (i + 1) + ' 位玩家名字"></label>';
    }
    $('#nameGrid').innerHTML = html;
  }

  // 名字只標玩家編號（1、2、3…）
  function renderNameInputs() {
    var scope = T.view.setupScope;
    var showAll = scope === 'blackjack' || scope === 'niuniu' || scope === 'names' || T.state.blackjack.settings.count > 4;
    var shown = scope === 'names' ? Math.max(4, T.state.blackjack.settings.count) : MAX_PLAYERS;
    for (var i = 0; i < MAX_PLAYERS; i++) {
      var input = $('#pname-' + i);
      if (document.activeElement !== input && input.value !== T.state.names[i]) input.value = T.state.names[i];
      $('[data-name-badge]', $('[data-name-row="' + i + '"]')).textContent = String(i + 1);
      input.placeholder = '玩家 ' + (i + 1);
      $('[data-name-row="' + i + '"]').hidden = (i >= 4 && !showAll) || i >= shown;
    }
    $('#namesHint').textContent = scope === 'names'
      ? '前四位打排七、麻將（麻將在牌桌上抓位），第 5 位起加入 21 點和妞妞；人數在首頁的玩家旁邊加減。'
      : scope === 'paiqi' ? '排七用前四位，照編號順序輪流出牌。'
      : scope === 'mahjong' ? '誰坐東南西北，在麻將頁的牌桌上抓位。' : '超過四人時再填 5 到 8；人數在首頁的玩家旁邊加減。';
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
    var from = T.view.screen;
    T.view.screen = screen;
    if (screen === 'play' && T.games[T.view.game].onShow) T.games[T.view.game].onShow(from);
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
    if (T.mjTools) T.mjTools.render(); // 擲骰子首頁也能開
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
    $('#screen-home').addEventListener('click', function (e) {
      var c = e.target.closest('.game-card[data-game]');
      if (c) T.go('play', c.getAttribute('data-game'));
    });
    $('#homeNames').addEventListener('click', function () { T.openSetup({ scope: 'names' }); });
    $('#homeCountDown').addEventListener('click', function () { if (T.canEdit()) T.setPlayerCount(T.playerCount() - 1); });
    $('#homeCountUp').addEventListener('click', function () { if (T.canEdit()) T.setPlayerCount(T.playerCount() + 1); });
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

    initSwipe($('#ledgerBody'));
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
      } else if (t.closest('.lg-del')) {
        var del = t.closest('.lg-del');
        var entry = entryByKey(del.getAttribute('data-del'));
        if (entry && T.canEdit()) deleteEntries([entry], '已刪除第 ' + del.getAttribute('data-no') + ' ' + (ROUND_WORD[entry.game] || '局'));
      } else if (t.closest('.lg-item.open')) {
        swipeClose();
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
