// カルコロン ルールエンジン（DOM / Firebase 非依存。ホストのみが状態を更新する）
// 左隣 = 手番順で次のプレイヤー

export const CARDS = [];
const _add = d => { d.id = CARDS.length; CARDS.push(d); };
for (let v = 1; v <= 9; v++) for (let i = 0; i < 3; i++) _add({ kind: 'num', val: String(v) });
for (let i = 0; i < 2; i++) _add({ kind: 'num', val: 'T' });      // 1/10
for (let i = 0; i < 2; i++) _add({ kind: 'num', val: '0' });
_add({ kind: 'num', val: 'D' });                                  // デビルゼロ
for (const op of ['+', '-', 'x', '/']) for (let i = 0; i < 4; i++) _add({ kind: 'op', op, flame: op === '-' && i === 0 });
for (let i = 0; i < 6; i++) _add({ kind: 'bow' });
_add({ kind: 'trade', n: 1 });
_add({ kind: 'trade', n: 2 });
export const DEVIL_ID = CARDS.findIndex(c => c.val === 'D');

export const OP_SYM = { '+': '＋', '-': '－', 'x': '×', '/': '÷' };
export const OP_NAME = { '+': 'sword', '-': 'arrow', 'x': 'halberd', '/': 'shield' };
export const OP_JP = { '+': 'ソード', '-': 'アロー', 'x': 'ハルバード', '/': 'シールド' };

export function cardKey(id) {
  const c = CARDS[id];
  if (c.kind === 'num') return c.val === 'T' ? 'tenth' : c.val === 'D' ? 'devil' : 'n' + c.val;
  if (c.kind === 'op') return c.flame ? 'flame' : OP_NAME[c.op];
  if (c.kind === 'bow') return 'bow';
  return 'trade' + c.n;
}
export const FLAME_KEYS = ['n0','n1','n2','n3','n4','n5','n6','n7','n8','n9','tenth','sword','arrow','flame','halberd','shield','bow','trade1','trade2'];
export function keyLabel(k) {
  const m = { tenth: '1/10', sword: '＋ ソード', arrow: '－ アロー', flame: 'フレイムアロー', halberd: '× ハルバード', shield: '÷ シールド', bow: 'ボウ', trade1: 'トレード1', trade2: 'トレード2', devil: 'デビルゼロ' };
  return m[k] || k.replace('n', '');
}
export function cardLabel(id) {
  const c = CARDS[id];
  if (c.kind === 'num') return c.val === 'T' ? '1/10' : c.val === 'D' ? 'デビルゼロ' : c.val;
  if (c.kind === 'op') return c.flame ? 'フレイムアロー' : OP_SYM[c.op] + OP_JP[c.op];
  if (c.kind === 'bow') return 'ボウ';
  return 'トレード' + c.n;
}
export function sortRank(id) {
  const c = CARDS[id];
  if (c.kind === 'num') return c.val === 'D' ? 1.5 : c.val === 'T' ? 0.5 : Number(c.val) + 1;
  if (c.kind === 'op') return 20 + '+-x/'.indexOf(c.op) * 2 + (c.flame ? 1 : 0);
  if (c.kind === 'bow') return 40;
  return 50 + c.n;
}

// ---------- 分数計算 ----------
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; };
const F = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
function ap(op, a, b) {
  switch (op) {
    case '+': return F(a.n * b.d + b.n * a.d, a.d * b.d);
    case '-': return F(a.n * b.d - b.n * a.d, a.d * b.d);
    case 'x': return F(a.n * b.n, a.d * b.d);
    case '/': return b.n === 0 ? null : F(a.n * b.d, a.d * b.n);
  }
}
function perms(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => { const rest = arr.slice(0, i).concat(arr.slice(i + 1)); perms(rest).forEach(p => out.push([x, ...p])); });
  return out;
}
function numVars(c, rebel) {
  if (c.val === 'D') return [{ f: F(0), t: '0' }];
  if (c.val === 'T') return [{ f: F(1, 10), t: '1/10' }];
  const r = [{ f: F(Number(c.val)), t: c.val }];
  if (rebel && c.val === '6') r.push({ f: F(9), t: '9↻' });
  if (rebel && c.val === '9') r.push({ f: F(6), t: '6↻' });
  return r;
}
function opVars(c, rebel) {
  const r = [{ o: c.op, t: OP_SYM[c.op] }];
  if (rebel && (c.op === '+' || c.op === 'x')) { const o = c.op === '+' ? 'x' : '+'; r.push({ o, t: OP_SYM[o] + '↻' }); }
  return r;
}

/** 手札(ちょうど数字3+記号2)から作れる「下一桁0・整数・0以上」の最大式。作れなければ null */
export function solveBest(handIds, bows = 0, rebel = false) {
  const cs = handIds.map(i => CARDS[i]);
  const nums = cs.filter(c => c.kind === 'num'), ops = cs.filter(c => c.kind === 'op');
  if (cs.length !== 5 || nums.length !== 3 || ops.length !== 2) return null;
  const modes = bows >= 2 ? ['N', 'L', 'R'] : ['N'];
  let best = null;
  for (const np of perms(nums)) for (const opp of perms(ops)) {
    const nv = np.map(c => numVars(c, rebel)), ov = opp.map(c => opVars(c, rebel));
    for (const a of nv[0]) for (const b of nv[1]) for (const c of nv[2])
      for (const o1 of ov[0]) for (const o2 of ov[1]) for (const m of modes) {
        let r = null, t;
        if (m === 'L') { t = ap(o1.o, a.f, b.f); r = t && ap(o2.o, t, c.f); }
        else if (m === 'R') { t = ap(o2.o, b.f, c.f); r = t && ap(o1.o, a.f, t); }
        else if ((o2.o === 'x' || o2.o === '/') && (o1.o === '+' || o1.o === '-')) { t = ap(o2.o, b.f, c.f); r = t && ap(o1.o, a.f, t); }
        else { t = ap(o1.o, a.f, b.f); r = t && ap(o2.o, t, c.f); }
        if (!r || r.d !== 1 || r.n < 0 || r.n % 10 !== 0) continue;
        if (!best || r.n > best.value) {
          const text = m === 'L' ? `(${a.t} ${o1.t} ${b.t}) ${o2.t} ${c.t}` : m === 'R' ? `${a.t} ${o1.t} (${b.t} ${o2.t} ${c.t})` : `${a.t} ${o1.t} ${b.t} ${o2.t} ${c.t}`;
          best = { value: r.n, text, mode: m, ids: [np[0].id, opp[0].id, np[1].id, opp[1].id, np[2].id] };
        }
      }
  }
  return best;
}

// ---------- ゲーム状態 ----------
const rnd = n => Math.floor(Math.random() * n);
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const nm = (G, u) => G.names[u] || '???';
function say(G, text) { G.log.push(text); if (G.log.length > 60) G.log.shift(); }
function ev(G, kind, text, uid) { G.events.push({ id: ++G.evSeq, kind, text, uid: uid || null }); if (G.events.length > 10) G.events.shift(); say(G, text); }
const nextOf = (G, u, k = 1) => G.order[(G.order.indexOf(u) + k) % G.order.length];
export const leftOf = (G, u) => nextOf(G, u, 1);

export function createGame(hostUid, uids, names, opts = {}) {
  const G = {
    hostUid, order: uids.slice(), names: { ...names }, totalDuels: opts.totalDuels || 5, robMs: opts.robMs ?? 3500,
    duel: 0, scores: {}, nextRebellion: {}, log: [], events: [], evSeq: 0, robSeq: 0, rev: 0, lastWinner: null, phase: 'duel'
  };
  uids.forEach(u => { G.scores[u] = 0; });
  startDuel(G, uids[rnd(uids.length)]);
  return G;
}

export function hydrate(G) {
  G.deck = G.deck || []; G.discard = G.discard || []; G.log = G.log || []; G.events = G.events || [];
  G.robReq = G.robReq || []; G.ldone = G.ldone || {}; G.nextRebellion = G.nextRebellion || {};
  G.rebellion = G.rebellion || {}; G.bows = G.bows || {}; G.bowIds = G.bowIds || {}; G.hands = G.hands || {};
  G.order.forEach(u => { G.hands[u] = G.hands[u] || []; G.bowIds[u] = G.bowIds[u] || []; G.bows[u] = G.bowIds[u].length; });
  G.devil = G.devil || { holder: null, pushed: false };
  return G;
}

export function startDuel(G, firstUid) {
  G.duel++; G.phase = 'duel';
  G.deck = shuffle([...Array(CARDS.length).keys()]); G.discard = [];
  G.hands = {}; G.bows = {}; G.bowIds = {}; G.rebellion = {};
  G.devil = { holder: null, pushed: false };
  G.order.forEach(u => { G.hands[u] = []; G.bows[u] = 0; G.bowIds[u] = []; G.rebellion[u] = !!G.nextRebellion[u]; });
  for (let i = 0; i < 4; i++) G.order.forEach(u => G.hands[u].push(G.deck.pop()));
  G.nextRebellion = {}; G.king = null; G.step = 'draw'; G.turn = firstUid;
  G.lastDiscard = null; G.robReq = []; G.ldone = {}; G.result = null; G.skipNext = false;
  tidy(G);
  const rebs = G.order.filter(u => G.rebellion[u]).map(u => nm(G, u));
  ev(G, 'duel', `デュエル ${G.duel}/${G.totalDuels} 開始！ ${nm(G, firstUid)}から` + (rebs.length ? `（リベリオン: ${rebs.join('、')}）` : ''));
}

function drawCard(G) {
  if (!G.deck.length && G.discard.length) { G.deck = shuffle(G.discard); G.discard = []; say(G, '山札が尽きたので捨て札を混ぜ直しました'); }
  return G.deck.length ? G.deck.pop() : null;
}
// 手札の並びをランダム化（トレードの「引き抜き」を公平にするため）。デビルゼロは常に先頭
function tidy(G) {
  G.order.forEach(u => {
    const h = G.hands[u]; const hasD = h.includes(DEVIL_ID);
    const rest = shuffle(h.filter(i => i !== DEVIL_ID));
    G.hands[u] = hasD ? [DEVIL_ID, ...rest] : rest;
  });
  const dh = G.order.find(u => G.hands[u].includes(DEVIL_ID));
  const was = G.devil.pushed;
  G.devil = { holder: dh || null, pushed: dh ? was : false };
}
const rm = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); return i >= 0; };

function endTurn(G) {
  let k = 1;
  if (G.skipNext) { k = 2; G.skipNext = false; ev(G, 'skip', `${nm(G, nextOf(G, G.turn, 1))}はスキップ！`); }
  G.turn = nextOf(G, G.turn, k); G.step = 'draw'; G.lastDiscard = null;
}

function doAttack(G, uid, viaRob) {
  G.king = uid; G.step = 'lastdraw'; G.ldone = {}; G.skipNext = false; G.robReq = [];
  ev(G, viaRob ? 'rob' : 'attack', viaRob ? `${nm(G, uid)}のロブアタック！` : `${nm(G, uid)}がアタック！`, uid);
  for (let k = 1; k < G.order.length; k++) {
    const u = nextOf(G, uid, k);
    let got = 0, guard = 0;
    while (got < 2 && guard++ < 30) {
      const c = drawCard(G); if (c == null) break;
      if (CARDS[c].kind === 'bow') { G.discard.push(c); ev(G, 'bow', `${nm(G, u)}はボウを引いて公開、引き直し`, u); continue; }
      G.hands[u].push(c); got++;
    }
  }
  tidy(G);
}

function revealAll(G) {
  const per = {}; const comp = [];
  G.order.forEach(u => {
    const sol = solveBest(G.hands[u], G.bows[u], G.rebellion[u]);
    per[u] = { hand: G.hands[u].slice(), bows: G.bows[u], text: sol ? sol.text : '', value: sol ? sol.value : null, ids: sol ? sol.ids : [], hasDevil: G.hands[u].includes(DEVIL_ID) };
    if (sol) comp.push(u);
  });
  const max = comp.length ? Math.max(...comp.map(u => per[u].value)) : null;
  const top = comp.filter(u => per[u].value === max);
  const winners = top.includes(G.king) ? [G.king] : top;
  G.order.forEach(u => {
    const r = per[u];
    if (winners.includes(u)) { r.status = 'win'; r.delta = r.value; }
    else if (r.value != null) { if (u === G.king) { r.status = 'kingkill'; r.delta = -30; } else { r.status = 'complete'; r.delta = 0; } }
    else if (r.hasDevil) { r.status = 'devilburst'; r.delta = -100; }
    else { r.status = 'burst'; r.delta = -10; }
    G.scores[u] += r.delta;
    r.total = G.scores[u];
    if (r.status === 'win' && r.hasDevil) { G.nextRebellion[u] = true; r.rebellion = true; }
  });
  G.result = { per, winners, king: G.king, max };
  G.lastWinner = winners[0];
  G.step = 'reveal';
  ev(G, 'reveal', `結果発表！ 勝者: ${winners.map(u => nm(G, u)).join('、')}（${max}点）`);
  G.order.forEach(u => {
    const s = per[u].status;
    if (s === 'kingkill') ev(G, 'kingkill', `${nm(G, u)}はキングキリング！ -30点`, u);
    if (s === 'burst') ev(G, 'burst', `${nm(G, u)}はバースト… -10点`, u);
    if (s === 'devilburst') ev(G, 'devilburst', `${nm(G, u)}はデビルバースト！！ -100点`, u);
    if (per[u].rebellion) ev(G, 'reb', `${nm(G, u)}は次のデュエルでリベリオン！`, u);
  });
}

const ERR = msg => ({ ok: false, err: msg });
const OK = { ok: true };
const isPlayer = (G, u) => G.order.includes(u);

export function reduce(G, a) {
  if (!a || !isPlayer(G, a.uid)) return ERR('参加者ではありません');
  const uid = a.uid;
  const res = reduceInner(G, a, uid, G.hands[uid]);
  if (res.ok) { tidy(G); G.rev++; }
  return res;
}

function reduceInner(G, a, uid, mine) {
  switch (a.t) {
    case 'draw': {
      if (G.phase !== 'duel' || G.step !== 'draw' || G.turn !== uid) return ERR('今はドローできません');
      const short = mine.length <= 3;
      const c = drawCard(G); if (c == null) return ERR('山札がありません');
      mine.push(c); say(G, `${nm(G, uid)}がドロー`);
      if (short) endTurn(G); else G.step = 'act';
      return OK;
    }
    case 'rebTrade': {
      if (G.phase !== 'duel' || G.step !== 'draw' || G.turn !== uid || !G.rebellion[uid]) return ERR('リベリオントレードはできません');
      const t = a.target; if (!isPlayer(G, t) || t === uid) return ERR('相手が不正です');
      const give = (a.give || [])[0], take = (a.take || [])[0];
      if (!mine.includes(give) || give === DEVIL_ID) return ERR('渡すカードが不正です');
      const th = G.hands[t]; if (take == null || take < 0 || take >= th.length || th[take] === DEVIL_ID) return ERR('引くカードが不正です');
      const got = th.splice(take, 1)[0]; th.push(give); rm(mine, give); mine.push(got);
      ev(G, 'trade', `${nm(G, uid)}がリベリオントレード（${nm(G, t)}と1枚交換）`, uid);
      endTurn(G);
      return OK;
    }
    case 'attack': {
      if (G.phase !== 'duel' || G.step !== 'act' || G.turn !== uid) return ERR('今はアタックできません');
      if (!solveBest(mine, G.bows[uid], G.rebellion[uid])) return ERR('コンプリートしていません');
      doAttack(G, uid, false); return OK;
    }
    case 'discard': return discardAct(G, a, uid, mine);
    case 'rob': {
      if (G.phase !== 'duel' || G.step !== 'rob') return ERR('ロブできません');
      if (G.lastDiscard.by === uid || G.robReq.includes(uid)) return ERR('ロブできません');
      if (!solveBest([...mine, G.lastDiscard.id], G.bows[uid], G.rebellion[uid])) return ERR('そのカードではコンプリートできません');
      G.robReq.push(uid); return OK;
    }
    case 'lastDiscard': {
      if (G.phase !== 'duel' || G.step !== 'lastdraw' || uid === G.king || G.ldone[uid]) return ERR('今は捨てられません');
      if (!mine.includes(a.cardId)) return ERR('カードが不正です');
      rm(mine, a.cardId); G.discard.push(a.cardId); G.ldone[uid] = true;
      say(G, `${nm(G, uid)}がラストドローを終えた`);
      if (G.order.every(u => u === G.king || G.ldone[u])) { tidy(G); revealAll(G); }
      return OK;
    }
    case 'next': {
      if (uid !== G.hostUid) return ERR('ホストだけが進められます');
      if (G.step !== 'reveal') return ERR('今は進められません');
      if (G.duel >= G.totalDuels) { G.phase = 'end'; G.step = 'end'; ev(G, 'end', 'ゲーム終了！'); }
      else startDuel(G, G.lastWinner);
      return OK;
    }
    case 'rematch': {
      if (uid !== G.hostUid || G.phase !== 'end') return ERR('今はできません');
      G.duel = 0; G.order.forEach(u => { G.scores[u] = 0; }); G.nextRebellion = {};
      startDuel(G, G.order[rnd(G.order.length)]); return OK;
    }
  }
  return ERR('不明な操作です');
}

function discardAct(G, a, uid, mine) {
  if (G.phase !== 'duel' || G.step !== 'act' || G.turn !== uid) return ERR('今は捨てられません');
  const id = a.cardId; if (!mine.includes(id)) return ERR('カードが不正です');
  const def = CARDS[id]; const me = nm(G, uid);
  const validTarget = t => isPlayer(G, t) && t !== uid;
  // --- デビルゼロ: 押し付け ---
  if (id === DEVIL_ID) {
    if (G.devil.pushed) return ERR('押し付けられたデビルゼロは捨てられません');
    if (a.effect !== 'push' || !validTarget(a.target) || G.rebellion[a.target]) return ERR('押し付ける相手を選んでください');
    rm(mine, id); G.hands[a.target].push(id); G.devil = { holder: a.target, pushed: true };
    ev(G, 'devil', `${me}がデビルゼロを${nm(G, a.target)}に押し付けた！`, a.target);
    endTurn(G); return OK;
  }
  // --- ボウ ---
  if (def.kind === 'bow') {
    rm(mine, id); const l = leftOf(G, uid); G.bowIds[l].push(id); G.bows[l] = G.bowIds[l].length;
    ev(G, 'bow', `${me}「ボウカードです」→ ${nm(G, l)}へ`, l);
    endTurn(G); return OK;
  }
  // --- トレード ---
  if (def.kind === 'trade') {
    if (a.effect === 'trade') {
      const t = a.target; if (!validTarget(t)) return ERR('相手が不正です');
      const myAvail = mine.filter(i => i !== id && i !== DEVIL_ID);
      const thAvail = G.hands[t].filter(i => i !== DEVIL_ID).length;
      const n = Math.min(def.n, myAvail.length, thAvail);
      const give = a.give || [], take = a.take || [];
      if (give.length !== n || take.length !== n || new Set(give).size !== n || new Set(take).size !== n) return ERR('交換枚数が不正です');
      if (!give.every(g => myAvail.includes(g))) return ERR('渡すカードが不正です');
      const th = G.hands[t];
      if (!take.every(i => Number.isInteger(i) && i >= 0 && i < th.length && th[i] !== DEVIL_ID)) return ERR('引くカードが不正です');
      const got = take.map(i => th[i]);
      G.hands[t] = th.filter((_, i) => !take.includes(i)).concat(give);
      rm(mine, id); give.forEach(g => rm(mine, g)); got.forEach(g => mine.push(g)); G.discard.push(id);
      ev(G, 'trade', `${me}がトレード${def.n}を使用！ ${nm(G, t)}と${n}枚交換`, uid);
    } else { rm(mine, id); G.discard.push(id); say(G, `${me}がトレード${def.n}を捨てた`); }
    endTurn(G); return OK;
  }
  // --- フレイムアロー（効果） ---
  if (def.kind === 'op' && def.flame && a.effect === 'flame') {
    if (G.bows[uid] < 1) return ERR('ボウカードがありません');
    if (!FLAME_KEYS.includes(a.key)) return ERR('指定できないカードです');
    G.discard.push(G.bowIds[uid].pop()); G.bows[uid] = G.bowIds[uid].length; rm(mine, id);
    const removed = [];
    G.order.forEach(u => { const c = G.hands[u].find(i => cardKey(i) === a.key); if (c != null) { rm(G.hands[u], c); G.discard.push(c); removed.push(nm(G, u)); } });
    G.discard.push(id);
    ev(G, 'flame', `${me}のフレイムアロー！「${keyLabel(a.key)}」を指定` + (removed.length ? ` → ${removed.join('、')}の手札から消滅` : ' → 該当なし'), uid);
    endTurn(G); return OK;
  }
  // --- 通常の捨て（0のスキップ含む） ---
  rm(mine, id); G.discard.push(id);
  const skip = def.kind === 'num' && def.val === '0' && a.effect === 'skip';
  if (skip) { G.skipNext = true; ev(G, 'skip', `${me}が0を捨ててスキップ宣言！`, uid); } else say(G, `${me}が「${cardLabel(id)}」を捨てた`);
  G.lastDiscard = { id, by: uid, skip };
  if (G.robMs > 0) { G.step = 'rob'; G.robReq = []; G.robSeq++; } else endTurn(G);
  return OK;
}

/** ロブ猶予の終了（ホストのタイマーから呼ぶ） */
export function closeRob(G) {
  if (G.phase !== 'duel' || G.step !== 'rob') return false;
  const n = G.order.length, by = G.lastDiscard.by, bi = G.order.indexOf(by);
  const req = (G.robReq || []).filter(u => solveBest([...G.hands[u], G.lastDiscard.id], G.bows[u], G.rebellion[u]));
  if (req.length) {
    req.sort((x, y) => ((G.order.indexOf(x) - bi + n) % n) - ((G.order.indexOf(y) - bi + n) % n));
    const r = req[0]; rm(G.discard, G.lastDiscard.id); G.hands[r].push(G.lastDiscard.id);
    G.lastDiscard = null; doAttack(G, r, true);
  } else { G.robReq = []; endTurn(G); }
  G.rev++;
  return true;
}

export function publicView(G) {
  const handCounts = {}; G.order.forEach(u => { handCounts[u] = G.hands[u].length; });
  return {
    phase: G.phase, duel: G.duel, totalDuels: G.totalDuels, order: G.order, names: G.names, hostUid: G.hostUid,
    turn: G.turn, step: G.step, deckCount: G.deck.length, discardCount: G.discard.length, discardTop: G.discard.slice(-3),
    lastDiscard: G.lastDiscard || null, handCounts, bows: G.bows, devil: G.devil, rebellion: G.rebellion,
    scores: G.scores, king: G.king || null, ldone: G.ldone || {}, robSeq: G.robSeq, robMs: G.robMs, skipNext: !!G.skipNext,
    log: G.log.slice(-40), events: G.events.slice(-8), result: (G.step === 'reveal' || G.phase === 'end') ? G.result : null, rev: G.rev
  };
}
