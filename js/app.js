import * as FB from './fb.js';
import { Host } from './host.js';
import { CARDS, DEVIL_ID, DEFAULT_DECK, normDeck, maxCopies, deckTotal, deckMinimum } from './engine.js';
import { titleHTML, setupHTML, lobbyHTML, gameHTML, modalHTML, modeOf, tradeNFor, normPub, backHTML, preloadCardImages, esc } from './views.js';

const $ = s => document.querySelector(s);
const S = {
  uid: null, name: localStorage.getItem('calc_name') || '', code: null, meta: null, players: {}, pub: null, hand: [], order: [], mode: 'N',
  host: null, unsubs: [], sel: null, modal: null, tsel: { give: [], take: [] }, tkey: '', seenEv: -1, prevHand: null, prevTop: null,
  robSeen: -1, robStart: 0, robbed: -1, cutSeen: -1, lockRev: null, logOpen: false, bannerAt: 0, drag: null, flyQ: [], flip: false, revSeen: new Set(), imgsReady: false,
  opts: Object.assign({ waits: false, current: false }, JSON.parse(localStorage.getItem('calc_opts') || '{}'))
};

// ---------- 起動 ----------
async function boot() {
  // カード画像を最初に全部読み込んでおく（対戦中に仮カードが一瞬出ないように）
  Promise.race([preloadCardImages(), new Promise(r => setTimeout(r, 8000))]).then(() => { S.imgsReady = true; render(); });
  if (!FB.configured) { $('#app').innerHTML = setupHTML(); return; }
  FB.onAuthStateChanged(FB.auth, async u => {
    if (!u) return;
    const first = !S.uid; S.uid = u.uid;
    if (first) {
      const saved = localStorage.getItem('calc_room');
      if (saved) { try { await tryRejoin(saved); } catch (e) { /* ignore */ } }
      if (!S.code) render();
    }
  });
  try { await FB.signInAnonymously(FB.auth); } catch (e) { toast('ログインに失敗しました: ' + e.message); }
  render();
}
async function tryRejoin(code) {
  const m = (await FB.get(FB.ref(FB.db, `rooms/${code}/meta`))).val();
  const me = (await FB.get(FB.ref(FB.db, `rooms/${code}/players/${S.uid}`))).val();
  if (m && me && m.status !== 'ended') enterRoom(code); else localStorage.removeItem('calc_room');
}

// ---------- 部屋 ----------
const genCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
function readName() {
  const v = ($('#in-name') && $('#in-name').value || '').trim();
  if (!v) { toast('プレイヤー名を入力してください'); return null; }
  S.name = v; localStorage.setItem('calc_name', v); return v;
}
async function createRoom() {
  const name = readName(); if (!name) return;
  for (let k = 0; k < 10; k++) {
    const code = genCode();
    const ex = (await FB.get(FB.ref(FB.db, `rooms/${code}/meta`))).exists();
    if (ex) continue;
    await FB.set(FB.ref(FB.db, `rooms/${code}/meta`), { hostUid: S.uid, status: 'lobby', totalDuels: 5, robMs: 2000, createdAt: Date.now() });
    await FB.set(FB.ref(FB.db, `rooms/${code}/players/${S.uid}`), { name, joinedAt: Date.now() });
    enterRoom(code); return;
  }
  toast('部屋コードを作れませんでした。もう一度お試しください');
}
async function joinRoom() {
  const name = readName(); if (!name) return;
  const code = ($('#in-code').value || '').trim().toUpperCase();
  if (code.length !== 4) { toast('4文字の部屋コードを入力してください'); return; }
  const m = (await FB.get(FB.ref(FB.db, `rooms/${code}/meta`))).val();
  if (!m) { toast('その部屋は見つかりません'); return; }
  const ps = (await FB.get(FB.ref(FB.db, `rooms/${code}/players`))).val() || {};
  if (!ps[S.uid]) {
    if (m.status !== 'lobby') { toast('すでにゲームが始まっています'); return; }
    if (Object.keys(ps).length >= 4) { toast('満員です（最大4人）'); return; }
  }
  await FB.set(FB.ref(FB.db, `rooms/${code}/players/${S.uid}`), { name, joinedAt: ps[S.uid] ? ps[S.uid].joinedAt : Date.now() });
  enterRoom(code);
}
async function addCpu() {
  const ids = Object.keys(S.players);
  if (ids.length >= 4) return toast('満員です（最大4人）');
  const k = ['A', 'B', 'C'].find(x => !ids.includes('cpu_' + x));
  if (!k) return;
  await FB.set(FB.ref(FB.db, `rooms/${S.code}/players/cpu_${k}`), { name: 'CPU-' + k, cpu: true, joinedAt: Date.now() });
}
async function removeCpu() {
  const c = Object.entries(S.players).filter(([, v]) => v.cpu).sort((a, b) => b[1].joinedAt - a[1].joinedAt)[0];
  if (c) await FB.remove(FB.ref(FB.db, `rooms/${S.code}/players/${c[0]}`));
}
function sub(r, cb) { S.unsubs.push(FB.onValue(r, snap => cb(snap.val()))); }
function enterRoom(code) {
  S.code = code; localStorage.setItem('calc_room', code);
  S.pub = null; S.hand = []; S.order = []; S.mode = 'N'; S.seenEv = -1; S.cutSeen = -1; S.revSeen = new Set(); S.prevHand = null; S.prevTop = null; S.sel = null; S.modal = null;
  const r = p => FB.ref(FB.db, `rooms/${code}/${p}`);
  sub(r('meta'), async v => {
    S.meta = v;
    if (!v) { leaveRoom(true); return; }
    if (v.hostUid === S.uid && !S.host) {
      S.host = new Host(code, S.uid); await S.host.resume(); S.host.listen();
    }
    render();
  });
  sub(r('players'), v => { S.players = v || {}; render(); });
  sub(r('pub'), v => {
    const prev = S.pub; S.pub = normPub(v);
    if (!v) { S.seenEv = -1; S.cutSeen = -1; S.revSeen = new Set(); S.prevHand = null; S.prevTop = null; S.sel = null; if (S.modal && !['settings', 'deck'].includes(S.modal.type)) S.modal = null; render(); return; }
    onPub(prev); render();
  });
  sub(r('hands/' + S.uid), v => { S.hand = v ? (Array.isArray(v) ? v.filter(x => x != null) : Object.values(v)) : []; render(); });
  sub(r('msgs/' + S.uid), v => { if (v && Date.now() - v.t < 6000) { toast(v.text); S.lockRev = null; render(); } });
}
function leaveRoom(silent) {
  S.unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); S.unsubs = [];
  if (S.host) { S.host.stop(); S.host = null; }
  if (!silent && S.meta && S.meta.status === 'lobby' && S.meta.hostUid !== S.uid) FB.remove(FB.ref(FB.db, `rooms/${S.code}/players/${S.uid}`));
  localStorage.removeItem('calc_room');
  S.code = null; S.meta = null; S.pub = null; S.hand = []; S.order = []; S.players = {}; S.modal = null; S.sel = null;
  render();
}

// ---------- 状態更新フック ----------
const BANNER = { devil: 'DEVIL ZERO', skip: 'SKIP', trade: 'TRADE', flame: 'FLAME ARROW', bow: 'BOW', end: 'GAME SET' };
function onPub(prev) {
  const P = S.pub; if (!P) return;
  const evs = P.events;
  const maxId = evs.length ? evs[evs.length - 1].id : 0;
  if (S.seenEv < 0) S.seenEv = maxId;
  else { evs.filter(e => e.id > S.seenEv).forEach(e => banner(e)); S.seenEv = Math.max(S.seenEv, maxId); }
  if (P.step === 'rob' && P.robSeq !== S.robSeen) { S.robSeen = P.robSeq; S.robStart = Date.now(); }
  if (P.step === 'cutin' && P.cutSeq !== S.cutSeen) { S.cutSeen = P.cutSeq; showCutin(P); }
  const tk = `${P.step}|${P.trade ? P.trade.stage + P.trade.by : ''}`;
  if (tk !== S.tkey) { S.tkey = tk; S.tsel = { give: [], take: [] }; }
  // ドローの描写
  if (prev && P.phase === 'duel' && P.deckCount < prev.deckCount) {
    if (prev.step === 'draw') S.flyQ.push({ uid: prev.turn, n: 1 });
    else if (prev.step === 'cutin' && P.step === 'lastdraw') P.order.filter(u => u !== P.king).forEach(u => S.flyQ.push({ uid: u, n: 2 }));
  }
  if (S.sel != null && !S.hand.includes(S.sel)) S.sel = null;
}
function banner(e) {
  const text = BANNER[e.kind]; if (!text) return;
  const at = Math.max(Date.now(), S.bannerAt); S.bannerAt = at + 1100;
  setTimeout(() => {
    const d = document.createElement('div'); d.className = 'banner b-' + e.kind;
    d.innerHTML = `<span>${esc(text)}</span><small>${esc(e.text)}</small>`;
    $('#fx').appendChild(d); setTimeout(() => d.remove(), 2300);
  }, at - Date.now());
}
function showCutin(P) {
  const d = document.createElement('div'); d.className = 'cutin ' + (P.cutKind || 'attack');
  d.style.setProperty('--ms', P.cutMs + 'ms');
  d.innerHTML = `<div class="cflash"></div><div class="cband"><span class="cwho">${esc(P.names[P.king])}</span><span class="ctext">${P.cutKind === 'rob' ? 'ROB ATTACK!' : 'ATTACK!'}</span></div><div class="cslash"></div>`;
  $('#fx').appendChild(d); setTimeout(() => d.remove(), P.cutMs + 150);
}
function runFly() {
  const q = S.flyQ; S.flyQ = [];
  let n = 0; q.forEach(x => { n += x.n; });
  for (let i = 0; i < n; i++) setTimeout(fly, i * 200);
}
// 山札の中央から、上に1枚動きながらフェードアウト（捨てる時の逆のイメージ）
function fly() {
  const deck = document.querySelector('.pilebox .pile'); if (!deck) return;
  const a = deck.getBoundingClientRect(); const sz = Math.max(48, a.width);
  const el = document.createElement('div'); el.className = 'flyer'; el.style.width = el.style.height = sz + 'px'; el.style.setProperty('--cw', sz + 'px');
  el.innerHTML = backHTML('');
  const x = a.left + a.width / 2 - sz / 2, y = a.top + a.height / 2 - sz / 2;
  $('#fx').appendChild(el);
  const an = el.animate([
    { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1 },
    { transform: `translate(${x}px,${y - 95}px) scale(1.08)`, opacity: 0 }
  ], { duration: 650, easing: 'ease-out' });
  an.onfinish = () => el.remove();
}
function captureHand() {
  const m = {}; document.querySelectorAll('.hand .card.pick').forEach(c => { m[c.dataset.id] = c.getBoundingClientRect().left; }); return m;
}
function playFlip(before) {
  document.querySelectorAll('.hand .card.pick').forEach(c => {
    const o = before[c.dataset.id]; if (o == null) return;
    const dx = o - c.getBoundingClientRect().left; if (Math.abs(dx) < 1) return;
    c.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }

// ---------- 描画 ----------
function syncOrder() {
  S.order = S.order.filter(id => S.hand.includes(id));
  S.hand.forEach(id => { if (!S.order.includes(id)) S.order.push(id); });
}
function render() {
  if (S.pd && S.pd.active) { S.pendingRender = true; return; }   // カードを掴んでいる間は描き直さない
  const app = $('#app');
  if (!S.uid) { app.innerHTML = ''; return; }
  if (!S.code) { if (!app.querySelector('#in-name')) { app.className = ''; app.innerHTML = titleHTML(S); } $('#modal').innerHTML = ''; return; }
  const m = S.meta; if (!m) return;
  if (m.status === 'lobby' || !S.pub) {
    const keep = document.activeElement && document.activeElement.id;
    app.className = ''; app.innerHTML = lobbyHTML(S); $('#modal').innerHTML = S.modal && ['settings', 'deck'].includes(S.modal.type) ? modalHTML(S) : '';
    if (keep && $('#' + keep)) $('#' + keep).focus();
    return;
  }
  if (!S.imgsReady) { app.className = ''; app.innerHTML = '<div class="loading">カード画像を読み込み中…</div>'; return; }
  syncOrder();
  const before = S.flip ? captureHand() : null; S.flip = false;
  app.className = 'ingame';
  app.innerHTML = gameHTML(S);
  $('#modal').innerHTML = modalHTML(S);
  if (before) playFlip(before);
  S.prevHand = new Set(S.hand);
  const P = S.pub;
  if (P.shownInfo) Object.keys(P.shownInfo).forEach(u => S.revSeen.add(P.duel + ':' + u));
  if (P.step === 'reveal' && P.show) P.show.list.forEach(u => S.revSeen.add(P.duel + ':' + u)); S.prevTop = P.discardCount + '-' + (P.discardTop[P.discardTop.length - 1] ?? 'x');
  runFly();
}

// ---------- 操作 ----------
function send(a) {
  if (S.pub) S.lockRev = S.pub.rev;
  setTimeout(() => { if (S.lockRev != null) { S.lockRev = null; render(); } }, 4000);
  FB.push(FB.ref(FB.db, `rooms/${S.code}/actions`), { uid: S.uid, ...a });
}
function toggle(arr, v, max) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else { if (arr.length >= max) arr.shift(); arr.push(v); } }
function tradeN() { const T = S.pub.trade; return tradeNFor(S.pub, S.hand, T.target, T.n, null); }
function act(name, el) {
  const P = S.pub;
  switch (name) {
    case 'create': return createRoom();
    case 'join': return joinRoom();
    case 'addcpu': return addCpu();
    case 'rmcpu': return removeCpu();
    case 'leave': if (confirm('退出しますか？')) leaveRoom(); return;
    case 'start': {
      const ps = Object.entries(S.players).map(([uid, v]) => ({ uid, ...v })).sort((a, b) => a.joinedAt - b.joinedAt).slice(0, 4);
      if (ps.length < 2) return toast('2人以上必要です');
      if (deckTotal(S.meta.deck) < deckMinimum(ps.length, S.meta.finalRule ? 7 : 5)) return toast(`デッキが少なすぎます（${ps.length}人なら${deckMinimum(ps.length, S.meta.finalRule ? 7 : 5)}枚以上）`);
      if (S.meta.finalRule && ps.length !== 2) return toast('決勝ルールは2人専用です（CPU追加/退出で2人にしてください）');
      if (!S.host) return toast('ホストの準備中です。少し待ってください');
      return S.host.startGame(ps, { totalDuels: S.meta.totalDuels, robMs: S.meta.robMs, finalRule: !!S.meta.finalRule, deck: normDeck(S.meta.deck) });
    }
    case 'draw': return send({ t: 'draw' });
    case 'attack': return send({ t: 'attack', order: S.order.slice(), mode: modeOf(S) });
    case 'rob': S.robbed = P.robSeq; send({ t: 'rob' }); S.lockRev = null; return render();
    case 'discard': send({ t: 'discard', cardId: S.sel }); S.sel = null; return;
    case 'skip': send({ t: 'discard', cardId: S.sel, effect: 'skip' }); S.sel = null; return;
    case 'devdiscard': send({ t: 'devilDiscard', cardId: S.sel }); S.sel = null; return;
    case 'lastdiscard': send({ t: 'lastDiscard', cardId: S.sel }); S.sel = null; return;
    case 'lconfirm': return send({ t: 'lastConfirm', order: S.order.slice(), mode: modeOf(S) });
    case 'tready': return send({ t: 'tradeReady', order: S.order.slice() });
    case 'mvl': case 'mvr': {
      const i = S.order.indexOf(S.sel), j = name === 'mvl' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= S.order.length) return;
      [S.order[i], S.order[j]] = [S.order[j], S.order[i]]; return render();
    }
    case 'mode': S.mode = el.dataset.m; return render();
    case 'push': S.modal = { type: 'push', cardId: S.sel }; return render();
    case 'flame': S.modal = { type: 'flame', cardId: S.sel }; return render();
    case 'trade': S.modal = { type: 'trade', cardId: S.sel }; return render();
    case 'rebtrade': S.modal = { type: 'trade', cardId: null, reb: true }; return render();
    case 'mclose': S.modal = null; return render();
    case 'mpush': send({ t: 'discard', cardId: S.modal.cardId, effect: 'push', target: el.dataset.u }); S.modal = null; S.sel = null; return render();
    case 'mflame': send({ t: 'discard', cardId: S.modal.cardId, effect: 'flame', key: el.dataset.k }); S.modal = null; S.sel = null; return render();
    case 'mtarget': {
      const M = S.modal;
      if (M.reb) send({ t: 'rebTrade', target: el.dataset.u });
      else send({ t: 'discard', cardId: M.cardId, effect: 'trade', target: el.dataset.u });
      S.modal = null; S.sel = null; return render();
    }
    case 'tgive': toggle(S.tsel.give, +el.dataset.id, tradeN()); return render();
    case 'ttake': toggle(S.tsel.take, +el.dataset.i, tradeN()); return render();
    case 'tgo': send({ t: 'tradePick', give: S.tsel.give.slice(), take: S.tsel.take.slice() }); S.tsel = { give: [], take: [] }; return;
    case 'scores': S.modal = { type: 'scores' }; return render();
    case 'deck': S.modal = { type: 'deck' }; return render();
    case 'deckinc': case 'deckdec': {
      if (S.meta.hostUid !== S.uid) return;
      const k = el.dataset.k, c = normDeck(S.meta.deck), v = c[k] + (name === 'deckinc' ? 1 : -1);
      if (v < 0 || v > maxCopies(k)) return;
      return FB.update(FB.ref(FB.db, `rooms/${S.code}/meta/deck`), { [k]: v });
    }
    case 'deckreset': if (S.meta.hostUid === S.uid) FB.set(FB.ref(FB.db, `rooms/${S.code}/meta/deck`), { ...DEFAULT_DECK }); return;
    case 'tolobby': if (S.host && confirm('ロビーに戻りますか？（点数はリセットされます）')) { S.modal = null; S.host.backToLobby(); } return;
    case 'settings': S.modal = { type: 'settings' }; return render();
    case 'next': return send({ t: 'next' });
    case 'rematch': return send({ t: 'rematch' });
    case 'log': S.logOpen = !S.logOpen; return render();
  }
}
document.addEventListener('click', e => {
  if (S.suppressClick) { S.suppressClick = false; return; }
  const c = e.target.closest('[data-act].card');
  if (c) { act(c.dataset.act, c); return; }
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) { act(b.dataset.act, b); return; }
  const h = e.target.closest('.hand .card.pick');
  if (h && S.pub) { const id = +h.dataset.id; S.sel = S.sel === id ? null : id; render(); }
});
// ---------- 手札の並べ替え（ゲーム風：掴んだカードが指に付いてきて、他のカードが隙間を空ける） ----------
// 並び位置は掴んだ瞬間のスロット位置を基準に計算するので、境目でカードが行ったり来たりしない。マウス・タッチ共通
const DRAG_START_PX = 6;
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const c = e.target.closest && e.target.closest('.hand .card.pick'); if (!c) return;
  S.pd = { id: +c.dataset.id, el: c, x0: e.clientX, y0: e.clientY, pid: e.pointerId, active: false };
});
function beginDrag(e) {
  const pd = S.pd, hand = pd.el.closest('.hand');
  const cards = [...hand.querySelectorAll('.card.pick')];
  pd.hand = hand; pd.cards = cards;
  pd.ids = cards.map(c => +c.dataset.id);
  pd.slots = cards.map(c => { const r = c.getBoundingClientRect(); return r.left + r.width / 2; });   // 各スロットの中心X（固定）
  pd.from = pd.ids.indexOf(pd.id); pd.to = pd.from;
  pd.lastX = e.clientX; pd.tilt = 0; pd.active = true;
  if (S.sel != null) { S.sel = null; cards.forEach(c => c.classList.remove('sel')); }
  hand.classList.add('dragmode'); pd.el.classList.add('lifted');
  try { pd.el.setPointerCapture(pd.pid); } catch (_) { /* ignore */ }
}
function layoutDrag() {
  const pd = S.pd, n = pd.ids.length;
  // 掴んだカード以外を、新しい並びのスロットへずらす
  let k = 0;
  for (let j = 0; j < n; j++) {
    if (j === pd.from) continue;
    if (k === pd.to) k++;
    const dx = pd.slots[k] - pd.slots[j];
    pd.cards[j].style.transform = dx ? `translateX(${dx}px)` : '';
    k++;
  }
}
document.addEventListener('pointermove', e => {
  const pd = S.pd; if (!pd || e.pointerId !== pd.pid) return;
  if (!pd.active) {
    if (Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) < DRAG_START_PX) return;
    beginDrag(e);
  }
  e.preventDefault();
  const dx = e.clientX - pd.x0, dy = e.clientY - pd.y0;
  // 動かした方向へ少し傾ける
  pd.tilt = Math.max(-14, Math.min(14, pd.tilt * 0.7 + (e.clientX - pd.lastX) * 0.9)); pd.lastX = e.clientX;
  pd.el.style.transform = `translate(${dx}px, ${Math.min(dy, 30) - 26}px) scale(1.12) rotate(${pd.tilt.toFixed(1)}deg)`;
  // 指の位置から入る場所を決める（基準のスロットは動かさない）
  const x = e.clientX; let to = 0;
  for (let j = 0; j < pd.slots.length; j++) { if (j === pd.from) continue; if (x > pd.slots[j]) to++; }
  if (to !== pd.to) { pd.to = to; layoutDrag(); }
}, { passive: false });
function endDrag(e, cancel) {
  const pd = S.pd; if (!pd || (e && e.pointerId !== pd.pid)) return;
  S.pd = null;
  if (!pd.active) return;                     // ただのクリック → 選択はclickで処理
  S.suppressClick = true; setTimeout(() => { S.suppressClick = false; }, 0);
  const to = cancel ? pd.from : pd.to;
  // 掴んだカードを隙間へパチッと収める
  pd.el.classList.remove('lifted'); pd.el.classList.add('settle');
  pd.el.style.transform = `translateX(${pd.slots[to] - pd.slots[pd.from]}px)`;
  if (cancel) pd.cards.forEach((c, j) => { if (j !== pd.from) c.style.transform = ''; });
  setTimeout(() => {
    if (!cancel && to !== pd.from) {
      const ids = pd.ids.slice(); ids.splice(pd.from, 1); ids.splice(to, 0, pd.id);
      // 並べ替えたのは手札の一部（括弧以外のカード）なので、その順で S.order を作り直す
      S.order = ids.concat(S.order.filter(i => !ids.includes(i)));
    }
    S.pendingRender = false; render();
  }, 150);
}
document.addEventListener('pointerup', e => endDrag(e, false));
document.addEventListener('pointercancel', e => endDrag(e, true));
document.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.hand')) e.preventDefault(); });   // ブラウザ標準の画像ドラッグを止める
document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.opt) { S.opts[e.target.dataset.opt] = e.target.checked; localStorage.setItem('calc_opts', JSON.stringify(S.opts)); render(); return; }
  if (!S.meta || S.meta.hostUid !== S.uid) return;
  if (e.target.id === 'sel-duels') FB.update(FB.ref(FB.db, `rooms/${S.code}/meta`), { totalDuels: +e.target.value });
  if (e.target.id === 'sel-final') FB.update(FB.ref(FB.db, `rooms/${S.code}/meta`), { finalRule: e.target.value === '1' });
  if (e.target.id === 'sel-rob') FB.update(FB.ref(FB.db, `rooms/${S.code}/meta`), { robMs: +e.target.value });
});

boot();
