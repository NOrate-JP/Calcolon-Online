// CPUプレイヤーの思考（ホスト端末で動く）。cpuAction(G, uid) は「今CPUが取るべき操作」を返す（無ければ null）
import { CARDS, DEVIL_ID, cardKey, solveBest, tradeCount, shuffle, FLAME_KEYS } from './engine.js';

const REPS = (() => { const m = new Map(); CARDS.forEach(c => { const k = cardKey(c.id); if (!m.has(k)) m.set(k, c.id); }); return [...m.values()].filter(id => CARDS[id].kind !== 'bow' && CARDS[id].kind !== 'trade'); })();
const pick = a => a[Math.floor(Math.random() * a.length)];

// 4枚から「1枚引いたら完成する」カードの種類の多さ（高得点ほど加点）
function potential(hand4, bows, rebel) {
  let s = 0;
  for (const id of REPS) { const r = solveBest([...hand4, id], bows, rebel); if (r) s += 1 + r.value / 100; }
  return s;
}

export function cpuAction(G, u) {
  if (G.phase !== 'duel') return null;
  const hand = G.hands[u], bows = G.bows[u], reb = !!G.rebellion[u];
  const others = G.order.filter(x => x !== u);
  switch (G.step) {
    case 'draw': return G.turn === u ? { t: 'draw', uid: u } : null;
    case 'act': {
      if (G.turn !== u) return null;
      const sol = solveBest(hand, bows, reb);
      if (sol) {
        const v = sol.value;
        if (v >= 60 || (v >= 20 && Math.random() < 0.6) || Math.random() < 0.3) return { t: 'attack', uid: u, order: sol.ids, mode: sol.mode };
      }
      // 特殊カードの処理を優先
      if (hand.includes(DEVIL_ID) && !G.devil.pushed) {
        const ts = others.filter(x => !G.rebellion[x]);
        if (ts.length) return { t: 'discard', uid: u, cardId: DEVIL_ID, effect: 'push', target: pick(ts) };
      }
      const bow = hand.find(i => CARDS[i].kind === 'bow'); if (bow != null) return { t: 'discard', uid: u, cardId: bow };
      const tr = hand.find(i => CARDS[i].kind === 'trade');
      if (tr != null) {
        const ts = others.filter(x => tradeCount(G, u, x, CARDS[tr].n, tr) > 0);
        if (ts.length && Math.random() < 0.5) return { t: 'discard', uid: u, cardId: tr, effect: 'trade', target: pick(ts) };
        return { t: 'discard', uid: u, cardId: tr };
      }
      const fl = hand.find(i => CARDS[i].kind === 'op' && CARDS[i].flame);
      if (fl != null && bows >= 1 && Math.random() < 0.5) return { t: 'discard', uid: u, cardId: fl, effect: 'flame', key: pick(FLAME_KEYS) };
      // 残りは「捨てた後の可能性」が最大のカードを捨てる
      let bestId = null, bestS = -1;
      for (const c of hand) {
        if (c === DEVIL_ID) continue;
        const s = potential(hand.filter(x => x !== c), bows, reb) + Math.random() * 0.2;
        if (s > bestS) { bestS = s; bestId = c; }
      }
      if (bestId == null) bestId = hand.find(i => i !== DEVIL_ID);
      const d = CARDS[bestId];
      return { t: 'discard', uid: u, cardId: bestId, effect: d.kind === 'num' && d.val === '0' && Math.random() < 0.3 ? 'skip' : undefined };
    }
    case 'rob': {
      if (!G.lastDiscard || G.lastDiscard.by === u || G.robReq.includes(u)) return null;
      return solveBest([...hand, G.lastDiscard.id], bows, reb) ? { t: 'rob', uid: u } : null;
    }
    case 'trade': {
      const T = G.trade; if (!T) return null;
      if (T.stage === 'shuffle' && T.target === u) return { t: 'tradeReady', uid: u, order: shuffle(hand.slice()) };
      if (T.stage === 'pick' && T.by === u) {
        const th = G.hands[T.target], n = T.n;
        const idx = th.map((c, i) => i).filter(i => !(th[i] === DEVIL_ID && G.devil.pushed));
        return { t: 'tradePick', uid: u, give: shuffle(hand.filter(i => i !== DEVIL_ID)).slice(0, n), take: shuffle(idx).slice(0, n) };
      }
      return null;
    }
    case 'lastdraw': {
      if (u === G.king) return null;
      if (!G.ldone[u]) {
        let best = null, bv = -1;
        for (const c of hand) { const r = solveBest(hand.filter(x => x !== c), bows, reb); if (r && r.value > bv) { bv = r.value; best = c; } }
        if (best == null) {
          best = hand.includes(DEVIL_ID) ? DEVIL_ID : (hand.find(i => ['bow', 'trade'].includes(CARDS[i].kind)) ?? pick(hand));
        }
        return { t: 'lastDiscard', uid: u, cardId: best };
      }
      if (!G.confirmed[u]) {
        const r = solveBest(hand, bows, reb);
        return { t: 'lastConfirm', uid: u, order: r ? r.ids : hand.slice(), mode: r ? r.mode : 'N' };
      }
      return null;
    }
  }
  return null;
}
