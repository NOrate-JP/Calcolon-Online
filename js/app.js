import * as FB from './fb.js';
import { Host } from './host.js';
import { CARDS, DEVIL_ID } from './engine.js';
import { titleHTML, setupHTML, lobbyHTML, gameHTML, modalHTML, canSelect, esc } from './views.js';

const $ = s => document.querySelector(s);
const S = {
  uid: null, name: localStorage.getItem('calc_name') || '', code: null, meta: null, players: {}, pub: null, hand: [],
  host: null, unsubs: [], sel: null, modal: null, seenEv: -1, prevHand: null, prevTop: null,
  robSeen: -1, robStart: 0, robbed: -1, lockRev: null, logOpen: false, bannerAt: 0
};

// ---------- 起動 ----------
async function boot() {
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
    await FB.set(FB.ref(FB.db, `rooms/${code}/meta`), { hostUid: S.uid, status: 'lobby', totalDuels: 5, robMs: 3500, createdAt: Date.now() });
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
function sub(r, cb) { S.unsubs.push(FB.onValue(r, snap => cb(snap.val()))); }
function enterRoom(code) {
  S.code = code; localStorage.setItem('calc_room', code);
  S.pub = null; S.hand = []; S.seenEv = -1; S.prevHand = null; S.prevTop = null; S.sel = null; S.modal = null;
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
  sub(r('pub'), v => { S.pub = v; onPub(); render(); });
  sub(r('hands/' + S.uid), v => { S.hand = v ? (Array.isArray(v) ? v.filter(x => x != null) : Object.values(v)) : []; render(); });
  sub(r('msgs/' + S.uid), v => { if (v && Date.now() - v.t < 6000) { toast(v.text); S.lockRev = null; render(); } });
}
function leaveRoom(silent) {
  S.unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); S.unsubs = [];
  if (S.host) { S.host.stop(); S.host = null; }
  if (!silent && S.meta && S.meta.status === 'lobby' && S.meta.hostUid !== S.uid) FB.remove(FB.ref(FB.db, `rooms/${S.code}/players/${S.uid}`));
  localStorage.removeItem('calc_room');
  S.code = null; S.meta = null; S.pub = null; S.hand = []; S.players = {}; S.modal = null; S.sel = null;
  render();
}

// ---------- 状態更新フック ----------
const BANNER = { attack: 'ATTACK!', rob: 'ROB ATTACK!', kingkill: 'KING KILLING', burst: 'BURST', devilburst: 'DEVIL BURST', devil: 'DEVIL ZERO', reb: 'REBELLION', skip: 'SKIP', trade: 'TRADE', flame: 'FLAME ARROW', bow: 'BOW', end: 'GAME SET' };
function onPub() {
  const P = S.pub; if (!P) return;
  const evs = P.events || [];
  const maxId = evs.length ? evs[evs.length - 1].id : 0;
  if (S.seenEv < 0) S.seenEv = maxId;
  else { evs.filter(e => e.id > S.seenEv).forEach(e => banner(e)); S.seenEv = Math.max(S.seenEv, maxId); }
  if (P.step === 'rob' && P.robSeq !== S.robSeen) { S.robSeen = P.robSeq; S.robStart = Date.now(); }
  if (S.sel != null && !S.hand.includes(S.sel)) S.sel = null;
}
function banner(e) {
  let text = BANNER[e.kind]; if (e.kind === 'duel') text = 'DUEL';
  if (!text) return;
  const at = Math.max(Date.now(), S.bannerAt); S.bannerAt = at + 1100;
  setTimeout(() => {
    const d = document.createElement('div'); d.className = 'banner b-' + e.kind;
    d.innerHTML = `<span>${esc(text)}</span><small>${esc(e.text)}</small>`;
    $('#fx').appendChild(d); setTimeout(() => d.remove(), 2300);
  }, at - Date.now());
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }

// ---------- 描画 ----------
function render() {
  const app = $('#app');
  if (!S.uid) { app.innerHTML = ''; return; }
  if (!S.code) { if (!app.querySelector('#in-name')) { app.className = ''; app.innerHTML = titleHTML(S); } $('#modal').innerHTML = ''; return; }
  const m = S.meta; if (!m) return;
  if (m.status === 'lobby' || !S.pub) {
    const keep = document.activeElement && document.activeElement.id;
    app.className = ''; app.innerHTML = lobbyHTML(S); $('#modal').innerHTML = '';
    if (keep && $('#' + keep)) $('#' + keep).focus();
    return;
  }
  app.className = 'ingame';
  app.innerHTML = gameHTML(S);
  $('#modal').innerHTML = modalHTML(S);
  S.prevHand = new Set(S.hand);
  const P = S.pub; S.prevTop = P.discardCount + '-' + ((P.discardTop || [])[(P.discardTop || []).length - 1] ?? 'x');
}

// ---------- 操作 ----------
function send(a) {
  if (S.pub) S.lockRev = S.pub.rev;
  setTimeout(() => { if (S.lockRev != null) { S.lockRev = null; render(); } }, 4000);
  FB.push(FB.ref(FB.db, `rooms/${S.code}/actions`), { uid: S.uid, ...a });
}
function pick(arr, id, max) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else { if (arr.length >= max) arr.shift(); arr.push(id); } }
function tradeN() {
  const P = S.pub, M = S.modal; const want = M.reb ? 1 : CARDS[M.cardId].n;
  const mine = S.hand.filter(i => i !== M.cardId && i !== DEVIL_ID);
  const th = P.handCounts[M.target] - (P.devil.holder === M.target ? 1 : 0);
  return Math.min(want, mine.length, th);
}
function act(name, el) {
  const P = S.pub;
  switch (name) {
    case 'create': return createRoom();
    case 'join': return joinRoom();
    case 'leave': if (confirm('退出しますか？')) leaveRoom(); return;
    case 'start': {
      const ps = Object.entries(S.players).map(([uid, v]) => ({ uid, ...v })).sort((a, b) => a.joinedAt - b.joinedAt).slice(0, 4);
      if (ps.length < 2) return toast('2人以上必要です');
      if (!S.host) return toast('ホストの準備中です。少し待ってください');
      return S.host.startGame(ps, { totalDuels: S.meta.totalDuels, robMs: S.meta.robMs });
    }
    case 'draw': return send({ t: 'draw' });
    case 'attack': return send({ t: 'attack' });
    case 'rob': S.robbed = P.robSeq; send({ t: 'rob' }); S.lockRev = null; return render();
    case 'discard': send({ t: 'discard', cardId: S.sel }); S.sel = null; return;
    case 'skip': send({ t: 'discard', cardId: S.sel, effect: 'skip' }); S.sel = null; return;
    case 'lastdiscard': send({ t: 'lastDiscard', cardId: S.sel }); S.sel = null; return;
    case 'push': S.modal = { type: 'push', cardId: S.sel }; return render();
    case 'flame': S.modal = { type: 'flame', cardId: S.sel }; return render();
    case 'trade': S.modal = { type: 'trade', cardId: S.sel, target: null, give: [], take: [] }; return render();
    case 'rebtrade': S.modal = { type: 'trade', cardId: null, reb: true, target: null, give: [], take: [] }; return render();
    case 'mclose': S.modal = null; return render();
    case 'mpush': send({ t: 'discard', cardId: S.modal.cardId, effect: 'push', target: el.dataset.u }); S.modal = null; S.sel = null; return render();
    case 'mflame': send({ t: 'discard', cardId: S.modal.cardId, effect: 'flame', key: el.dataset.k }); S.modal = null; S.sel = null; return render();
    case 'mtarget': S.modal.target = el.dataset.u; S.modal.give = []; S.modal.take = []; return render();
    case 'mgive': pick(S.modal.give, +el.dataset.id, tradeN()); return render();
    case 'mtake': pick(S.modal.take, +el.dataset.i, tradeN()); return render();
    case 'mgo': {
      const M = S.modal; const base = { target: M.target, give: M.give.slice(), take: M.take.slice() };
      if (M.reb) send({ t: 'rebTrade', ...base });
      else send({ t: 'discard', cardId: M.cardId, effect: 'trade', ...base });
      S.modal = null; S.sel = null; return render();
    }
    case 'next': return send({ t: 'next' });
    case 'rematch': return send({ t: 'rematch' });
    case 'log': S.logOpen = !S.logOpen; return render();
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && !b.classList.contains('card')) { act(b.dataset.act, b); return; }
  const c = e.target.closest('[data-act].card');
  if (c) { act(c.dataset.act, c); return; }
  const h = e.target.closest('.hand .card');
  if (h && S.pub && canSelect(S)) { const id = +h.dataset.id; S.sel = S.sel === id ? null : id; render(); }
});
document.addEventListener('change', e => {
  if (!S.meta || S.meta.hostUid !== S.uid) return;
  if (e.target.id === 'sel-duels') FB.update(FB.ref(FB.db, `rooms/${S.code}/meta`), { totalDuels: +e.target.value });
  if (e.target.id === 'sel-rob') FB.update(FB.ref(FB.db, `rooms/${S.code}/meta`), { robMs: +e.target.value });
});

boot();
