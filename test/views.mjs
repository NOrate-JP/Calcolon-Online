import assert from 'node:assert/strict';
import { createGame, reduce, publicView, closeRob, solveBest, DEVIL_ID } from '../js/engine.js';
import * as V from '../js/views.js';

const uids = ['a', 'b', 'c', 'd'];
const G = createGame('a', uids, { a: 'アリス', b: 'ボブ<b>', c: 'キャロル', d: 'ダン' }, { totalDuels: 2, robMs: 3000 });
function S_for(u, extra = {}) {
  return { uid: u, code: 'ABCD', meta: { hostUid: 'a', status: 'playing', totalDuels: 2, robMs: 3000 }, players: {}, pub: JSON.parse(JSON.stringify(publicView(G))), hand: G.hands[u].slice(), sel: null, modal: null, prevHand: new Set(), prevTop: null, robbed: -1, lockRev: null, robStart: Date.now(), logOpen: false, name: 'x', ...extra };
}
let n = 0;
function check(label) { for (const u of uids) { const S = S_for(u); const h = V.gameHTML(S); assert.ok(h.includes('class="hand"')); assert.ok(!h.includes('ボブ<b>')); n++; } }
check('start');
// ドロー→act
reduce(G, { t: 'draw', uid: G.turn }); check('act');
const t = G.turn;
let S = S_for(t, { sel: G.hands[t][0] }); assert.ok(V.controlsHTML(S).includes('data-act'));
// 各種選択カードのコントロール
for (const id of G.hands[t]) { S = S_for(t, { sel: id }); V.controlsHTML(S); }
// モーダル
S = S_for(t, { modal: { type: 'push', cardId: DEVIL_ID } }); assert.ok(V.modalHTML(S).includes('押し付ける'));
S = S_for(t, { modal: { type: 'flame', cardId: 0 } }); assert.ok(V.modalHTML(S).includes('keygrid'));
S = S_for(t, { modal: { type: 'trade', cardId: 56 - 2, target: 'b', give: [], take: [] } }); assert.ok(V.modalHTML(S).includes('交換'));
S = S_for(t, { modal: { type: 'trade', cardId: null, reb: true, target: 'b', give: [], take: [] } }); V.modalHTML(S);
// 捨て→ロブ→…通しで結果画面まで
let guard = 0;
while (G.step !== 'reveal' && guard++ < 400) {
  if (G.step === 'draw') reduce(G, { t: 'draw', uid: G.turn });
  else if (G.step === 'act') { const u = G.turn; const s = solveBest(G.hands[u], G.bows[u], G.rebellion[u]); if (s) reduce(G, { t: 'attack', uid: u }); else reduce(G, { t: 'discard', uid: u, cardId: G.hands[u][0] === DEVIL_ID && !G.devil.pushed ? G.hands[u][1] : G.hands[u][0] }); }
  else if (G.step === 'rob') { check('rob'); S = S_for('b'); V.controlsHTML(S); closeRob(G); }
  else if (G.step === 'lastdraw') { for (const u of uids) if (u !== G.king && !G.ldone[u]) { check('ld'); reduce(G, { t: 'lastDiscard', uid: u, cardId: G.hands[u][0] }); } }
}
assert.equal(G.step, 'reveal');
for (const u of uids) { const h = V.gameHTML(S_for(u)); assert.ok(h.includes('RESULT')); }
reduce(G, { t: 'next', uid: 'a' });
console.log(V.lobbyHTML({ ...S_for('a'), players: { a: { name: 'A', joinedAt: 1 }, b: { name: 'B', joinedAt: 2 } } }).length > 100, V.titleHTML({ name: '' }).length > 100, 'views ok', n);
