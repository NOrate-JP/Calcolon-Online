import assert from 'node:assert/strict';
import { CARDS, DEVIL_ID, solveBest, evalOrdered, createGame, reduce, closeRob, finishCutin, publicView, FLAME_KEYS } from '../js/engine.js';
import { cpuAction } from '../js/cpu.js';

const find = (pred, used = []) => CARDS.find(c => pred(c) && !used.includes(c.id)).id;
function hand(spec) {
  const used = [];
  return spec.map(s => {
    const id = ['+','-','x','/'].includes(s) ? find(c => c.kind === 'op' && c.op === s && !c.flame, used) : find(c => c.kind === 'num' && c.val === s, used);
    used.push(id); return id;
  });
}
// --- 並べた順の判定 ---
assert.equal(evalOrdered(hand(['8','x','1','+','2'])).value, 10);
assert.equal(evalOrdered(hand(['8','+','2','x','1'])).value, 10);
assert.equal(evalOrdered(hand(['1','+','2','x','8'])), null);                 // 17
assert.equal(evalOrdered(hand(['4','+','6','x','9']), 0, false, 'N'), null);  // 4+54=58
assert.equal(evalOrdered(hand(['4','+','6','x','9']), 2, false, 'L').value, 90);
assert.equal(evalOrdered(hand(['4','+','6','x','9']), 0, false, 'L'), null);  // ボウなしで括弧は不可
assert.equal(evalOrdered(hand(['9','/','T','x','T']), 2, false, 'R').value, 900);
assert.equal(evalOrdered(hand(['9','/','T','/','T'])).value, 900);
assert.equal(evalOrdered(hand(['6','x','4','/','T'])).value, 240);
assert.equal(evalOrdered(hand(['0','-','9','-','1'])), null);                 // 負は不可
assert.equal(evalOrdered(hand(['6','x','5','x','1']), 0, true).value, 30);
assert.equal(evalOrdered(hand(['6','x','5','+','1']), 0, true).value, 30);    // +を×に回転
assert.equal(evalOrdered(hand(['6','x','5','+','1']), 0, false), null);
assert.equal(evalOrdered(hand(['6','5','1','+','x'])), null);                 // 並びが 数字・記号… でない
assert.equal(solveBest(hand(['6','5','1','+','x']), 0, true).value, 30);
assert.equal(solveBest(hand(['4','6','9','+','x']), 2).value, 90);
assert.ok(!FLAME_KEYS.includes('flame') && !FLAME_KEYS.includes('devil'));
console.log('solver ok');

// --- CPU同士で通しテスト（ホストの動きも再現） ---
const stat = { games: 0, steps: 0, attack: 0, rob: 0, trade: 0, flame: 0, devil: 0, kk: 0, burst: 0 };
for (let g = 0; g < 300; g++) {
  const n = 2 + (g % 3); const uids = ['a', 'b', 'c', 'd'].slice(0, n);
  const cpu = Object.fromEntries(uids.map(u => [u, true]));
  const G = createGame('a', uids, Object.fromEntries(uids.map(u => [u, u])), { totalDuels: 3, robMs: g % 2 ? 3000 : 0, cpu });
  let guard = 0, lastEv = 0;
  while (G.phase !== 'end' && guard++ < 6000) {
    G.events.forEach(e => { if (e.id > lastEv) { lastEv = e.id; if (stat[e.kind] != null) stat[e.kind]++; } });
    if (G.step === 'cutin') { assert.ok(finishCutin(G)); continue; }
    if (G.step === 'reveal') { assert.ok(reduce(G, { t: 'next', uid: 'a' }).ok); continue; }
    let acted = false;
    for (const u of uids) { const a = cpuAction(G, u); if (a) { const r = reduce(G, a); assert.ok(r.ok, JSON.stringify([r.err, a, G.step])); acted = true; stat.steps++; break; } }
    if (acted) {
      // 不変条件
      const all = [...G.deck, ...G.discard]; uids.forEach(u => { all.push(...G.hands[u]); all.push(...G.bowIds[u]); });
      assert.equal(new Set(all).size, all.length, '重複'); assert.equal(all.length, 56, '枚数保存');
      const dh = uids.filter(u => G.hands[u].includes(DEVIL_ID)); assert.ok(dh.length <= 1);
      const pv = publicView(G);
      if (!G.devil.pushed) assert.equal(pv.devil.holder, null, '押し付け前はデビルハンド非公開');
      else assert.equal(G.hands[pv.devil.holder][pv.devil.idx], DEVIL_ID);
      JSON.stringify(pv);
      continue;
    }
    if (G.step === 'rob') { closeRob(G); continue; }
    assert.fail('stuck at ' + G.step + ' ' + JSON.stringify(G.trade));
  }
  assert.equal(G.phase, 'end', 'ゲームが終わらない');
  stat.games++;
}
console.log(stat, 'OK');
