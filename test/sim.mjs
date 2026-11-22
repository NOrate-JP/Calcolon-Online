import assert from 'node:assert/strict';
import { CARDS, DEVIL_ID, solveBest, createGame, reduce, closeRob, publicView, FLAME_KEYS, cardKey } from '../js/engine.js';

// --- 式の判定テスト ---
const find = (pred, used = []) => CARDS.find(c => pred(c) && !used.includes(c.id)).id;
function hand(spec) { // spec: ['8','x','1','+','2'] 'T'=1/10, 'D'=devil
  const used = [];
  return spec.map(s => {
    let id;
    if (['+','-','x','/'].includes(s)) id = find(c => c.kind === 'op' && c.op === s && !c.flame, used);
    else id = find(c => c.kind === 'num' && c.val === s, used);
    used.push(id); return id;
  });
}
assert.equal(solveBest(hand(['8','x','1','+','2'])).value, 10);
assert.equal(solveBest(hand(['0','/','6','/','4'])).value, 0);
assert.equal(solveBest(hand(['6','x','4','/','T'])).value, 240);
assert.equal(solveBest(hand(['9','/','T','/','T'])).value, 900);
assert.equal(solveBest(hand(['4','6','9','+','x'].map(x=>x))), null, '括弧なしでは不可');
// 括弧: (4+6)x9 = 90 （ボウ2枚）
const h = hand(['4','6','9','+','x']);
assert.equal(solveBest(h, 0), null);
assert.equal(solveBest(h, 2).value, 90);
// 900 with bows: 9 / (1/10 x 1/10)
assert.equal(solveBest(hand(['9','/','T','x','T']), 2).value, 900);
// 負の結果は不可: 0-9-1 = -10
assert.equal(solveBest(hand(['0','-','9','-','1'])), null);
// リベリオン: +を×に回転して 6x5x1=30
assert.equal(solveBest(hand(['6','5','1','+','x']), 0, false), null);
assert.equal(solveBest(hand(['6','5','1','+','x']), 0, true).value, 30);
console.log('solver ok');

// --- ランダムボットで通しテスト ---
function bot(G, uid) {
  const P = G.hands[uid];
  if (G.step === 'draw' && G.turn === uid) {
    if (G.rebellion[uid] && Math.random() < 0.4) {
      const others = G.order.filter(u => u !== uid && G.hands[u].length > 1);
      const t = others[Math.floor(Math.random() * others.length)];
      const th = G.hands[t]; const idx = th.map((c, i) => i).filter(i => th[i] !== DEVIL_ID);
      const gv = P.filter(c => c !== DEVIL_ID);
      if (t != null && idx.length && gv.length) return { t: 'rebTrade', uid, target: t, give: [gv[0]], take: [idx[Math.floor(Math.random() * idx.length)]] };
    }
    return { t: 'draw', uid };
  }
  if (G.step === 'act' && G.turn === uid) {
    if (solveBest(P, G.bows[uid], G.rebellion[uid]) && Math.random() < 0.7) return { t: 'attack', uid };
    const c = P[Math.floor(Math.random() * P.length)];
    const def = CARDS[c];
    const others = G.order.filter(u => u !== uid);
    if (c === DEVIL_ID) {
      const ok = others.filter(u => !G.rebellion[u]);
      if (G.devil.pushed || !ok.length) { const alt = P.filter(x => x !== DEVIL_ID); return { t: 'discard', uid, cardId: alt[0] }; }
      return { t: 'discard', uid, cardId: c, effect: 'push', target: ok[0] };
    }
    if (def.kind === 'trade' && Math.random() < 0.8) {
      const t = others[0]; const my = P.filter(i => i !== c && i !== DEVIL_ID);
      const th = G.hands[t]; const idx = th.map((_, i) => i).filter(i => th[i] !== DEVIL_ID);
      const n = Math.min(def.n, my.length, idx.length);
      return { t: 'discard', uid, cardId: c, effect: 'trade', target: t, give: my.slice(0, n), take: idx.slice(0, n) };
    }
    if (def.kind === 'op' && def.flame && G.bows[uid] > 0 && Math.random() < 0.8) return { t: 'discard', uid, cardId: c, effect: 'flame', key: FLAME_KEYS[Math.floor(Math.random() * FLAME_KEYS.length)] };
    if (def.kind === 'num' && def.val === '0') return { t: 'discard', uid, cardId: c, effect: 'skip' };
    return { t: 'discard', uid, cardId: c };
  }
  if (G.step === 'lastdraw' && uid !== G.king && !G.ldone[uid]) return { t: 'lastDiscard', uid, cardId: P[Math.floor(Math.random() * P.length)] };
  return null;
}

let games = 0, robs = 0, attacks = 0, kk = 0, bursts = 0, devilb = 0, rebel = 0, steps = 0;
for (let g = 0; g < 300; g++) {
  const n = 2 + (g % 3); const uids = ['a', 'b', 'c', 'd'].slice(0, n);
  const G = createGame('a', uids, Object.fromEntries(uids.map(u => [u, u])), { totalDuels: 3, robMs: g % 2 ? 3000 : 0 });
  let guard = 0;
  while (G.phase !== 'end' && guard++ < 5000) {
    // ホストの next
    if (G.step === 'reveal') { assert.ok(reduce(G, { t: 'next', uid: 'a' }).ok); continue; }
    if (G.step === 'rob') {
      // ロブ要求を試す
      for (const u of uids) if (u !== G.lastDiscard.by && Math.random() < 0.9) reduce(G, { t: 'rob', uid: u });
      closeRob(G); continue;
    }
    let acted = false;
    for (const u of uids) { const a = bot(G, u); if (a) { const r = reduce(G, a); assert.ok(r.ok, JSON.stringify([r.err, a, G.step])); acted = true; steps++; break; } }
    assert.ok(acted, 'stuck at ' + G.step);
    // 不変条件
    const all = [...G.deck, ...G.discard];
    uids.forEach(u => all.push(...G.hands[u]));
    // ボウは bows として別管理
    const bowsHeld = uids.reduce((s, u) => s + G.bows[u], 0);
    const seen = new Set(all); assert.equal(seen.size, all.length, '重複カード');
    assert.equal(all.length + bowsHeld, 56, '枚数保存 ' + all.length + ' ' + bowsHeld);
    const dh = uids.filter(u => G.hands[u].includes(DEVIL_ID)); assert.ok(dh.length <= 1);
    assert.equal(G.devil.holder, dh[0] || null);
    if (dh.length) assert.equal(G.hands[dh[0]][0], DEVIL_ID);
    JSON.stringify(publicView(G));
  }
  assert.equal(G.phase, 'end', 'ゲームが終わらない');
  games++;
  G.events.forEach(e => { if (e.kind === 'rob') robs++; });
}
console.log('games', games, 'steps', steps, 'OK');
