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
// フレイムアローで指定できるカード（フレイムアロー自身は1枚だけなので除外、デビルゼロも不可）
export const FLAME_KEYS = ['n0','n1','n2','n3','n4','n5','n6','n7','n8','n9','tenth','sword','arrow','halberd','shield','bow','trade1','trade2'];
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

/** 括弧の範囲。'N'=なし / 'i-j'=i番目〜j番目の数字を括る（旧表記 L=0-1, R=1-2） */
export function spanOf(m) {
  if (m === 'L') return [0, 1]; if (m === 'R') return [1, 2];
  return (m && /^\d-\d$/.test(m)) ? [Number(m[0]), Number(m[2])] : null;
}
/** 式の長さ（5 or 7）で選べる括弧モード */
export function modesFor(len) {
  const n = (len + 1) / 2, out = ['N'];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!(i === 0 && j === n - 1)) out.push(`${i}-${j}`);
  return out;
}
function evalFlat(nums, ops) {            // 掛け算・割り算が先
  const ns = [nums[0]], os = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    if (o === 'x' || o === '/') { const r = ap(o, ns.pop(), nums[k + 1]); if (!r) return null; ns.push(r); }
    else { os.push(o); ns.push(nums[k + 1]); }
  }
  let r = ns[0];
  for (let k = 0; k < os.length; k++) r = ap(os[k], r, ns[k + 1]);
  return r;
}
function evalSpan(nums, ops, span) {
  if (!span) return evalFlat(nums, ops);
  const [i, j] = span;
  const inner = evalFlat(nums.slice(i, j + 1), ops.slice(i, j)); if (!inner) return null;
  return evalFlat([...nums.slice(0, i), inner, ...nums.slice(j + 1)], [...ops.slice(0, i), ...ops.slice(j)]);
}

/**
 * 並べた順（数字・記号・数字・記号・数字［・記号・数字］）で評価する。
 * 「下一桁0・整数・0以上」になる最大の結果を返す。なれなければ null。括弧はボウ2枚以上のとき
 */
export function evalOrdered(ids, bows = 0, rebel = false, mode = 'N') {
  if (!ids || (ids.length !== 5 && ids.length !== 7)) return null;
  const cs = ids.map(i => CARDS[i]);
  for (let k = 0; k < cs.length; k++) if (cs[k].kind !== (k % 2 === 0 ? 'num' : 'op')) return null;
  let span = null;
  if (mode !== 'N') { if (bows < 2 || !(modesFor(ids.length).includes(mode) || ((mode === 'L' || mode === 'R') && ids.length === 5))) return null; span = spanOf(mode); }
  const pos = cs.map((c, k) => k % 2 === 0 ? numVars(c, rebel) : opVars(c, rebel));
  const idx = pos.map(() => 0);
  let best = null;
  for (;;) {
    const nums = [], ops = [], tx = [];
    pos.forEach((v, k) => { const x = v[idx[k]]; if (k % 2 === 0) nums.push(x.f); else ops.push(x.o); tx.push(x.t); });
    const r = evalSpan(nums, ops, span);
    if (r && r.d === 1 && r.n >= 0 && r.n % 10 === 0 && (!best || r.n > best.value)) {
      if (span) { tx[2 * span[0]] = '(' + tx[2 * span[0]]; tx[2 * span[1]] = tx[2 * span[1]] + ')'; }
      best = { value: r.n, text: tx.join(' '), mode, ids: ids.slice() };
    }
    let k = pos.length - 1;
    while (k >= 0) { idx[k]++; if (idx[k] < pos[k].length) break; idx[k] = 0; k--; }
    if (k < 0) break;
  }
  return best;
}

/** 手札(5枚 or 7枚)をどう並べ替えても作れる最大の式（ロブ判定・CPU用）。作れなければ null */
export function solveBest(handIds, bows = 0, rebel = false) {
  const cs = handIds.map(i => CARDS[i]); const len = cs.length;
  if (len !== 5 && len !== 7) return null;
  const nums = cs.filter(c => c.kind === 'num'), ops = cs.filter(c => c.kind === 'op');
  if (nums.length !== (len + 1) / 2 || ops.length !== (len - 1) / 2) return null;
  const modes = bows >= 2 ? modesFor(len) : ['N'];
  let best = null;
  for (const np of perms(nums)) for (const opp of perms(ops)) {
    const ids = []; np.forEach((c, k) => { ids.push(c.id); if (k < opp.length) ids.push(opp[k].id); });
    for (const m of modes) { const r = evalOrdered(ids, bows, rebel, m); if (r && (!best || r.value > best.value)) best = r; }
  }
  return best;
}

/** 勝者の得点（最終デュエル2倍・0勝利・ダブルスコア）を per[u].delta に計算する。G.duel / totalDuels / zeroPending / prevWin を参照 */
export function applyWinScores(G, per, winners) {
  const isFinal = G.duel >= G.totalDuels, pend = G.zeroPending || [];
  winners.forEach(u => {
    const r = per[u]; const notes = []; let eff = r.value;
    if (r.value === 0 && pend.includes(u)) { eff = 100; notes.push('0勝利の連続 → 100点換算'); }
    const gain = isFinal ? eff * 2 : eff; if (isFinal) notes.push('最終デュエル×2');
    let extra = 0; if (G.prevWin != null && eff > 0 && eff === G.prevWin) { extra = eff; notes.push(`ダブルスコア +${eff}`); }
    let retro = 0; if (pend.includes(u)) { retro = eff; notes.push(`前回の0勝利にも +${eff}`); }
    r.eff = eff; r.delta = gain + extra + retro; r.note = notes.join(' / ');
  });
}

// ---------- ゲーム状態 ----------
const rnd = n => Math.floor(Math.random() * n);
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const nm = (G, u) => G.names[u] || '???';
function say(G, text) { G.log.push(text); if (G.log.length > 60) G.log.shift(); }
function ev(G, kind, text, uid) { G.events.push({ id: ++G.evSeq, kind, text, uid: uid || null }); if (G.events.length > 10) G.events.shift(); say(G, text); }
const nextOf = (G, u, k = 1) => G.order[(G.order.indexOf(u) + k) % G.order.length];
export const leftOf = (G, u) => nextOf(G, u, 1);
const sameSet = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

export function createGame(hostUid, uids, names, opts = {}) {
  const G = {
    hostUid, order: uids.slice(), names: { ...names }, cpu: { ...(opts.cpu || {}) }, totalDuels: opts.totalDuels || 5, robMs: opts.robMs ?? 3500, cutMs: opts.cutMs ?? 2600,
    formulaLen: opts.final && uids.length === 2 ? 7 : 5, zeroPending: [], prevWin: null,
    duel: 0, scores: {}, nextRebellion: {}, log: [], events: [], evSeq: 0, robSeq: 0, cutSeq: 0, showSeq: 0, rev: 0, lastWinner: null, phase: 'duel'
  };
  uids.forEach(u => { G.scores[u] = 0; });
  startDuel(G, uids[rnd(uids.length)]);
  return G;
}

export function hydrate(G) {
  G.deck = G.deck || []; G.discard = G.discard || []; G.log = G.log || []; G.events = G.events || [];
  G.robReq = G.robReq || []; G.ldone = G.ldone || {}; G.confirmed = G.confirmed || {}; G.arr = G.arr || {};
  G.nextRebellion = G.nextRebellion || {}; G.cpu = G.cpu || {}; G.cutMs = G.cutMs || 2600; G.showSeq = G.showSeq || 0; G.formulaLen = G.formulaLen || 5; G.zeroPending = G.zeroPending || [];
  if (G.show) G.show.shown = G.show.shown || [];
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
  for (let i = 0; i < G.formulaLen - 1; i++) G.order.forEach(u => G.hands[u].push(G.deck.pop()));
  G.nextRebellion = {}; G.king = null; G.step = 'draw'; G.turn = firstUid;
  G.lastDiscard = null; G.robReq = []; G.ldone = {}; G.confirmed = {}; G.arr = {}; G.trade = null; G.cutKind = null; G.show = null; G.devilDisc = null;
  G.result = null; G.skipNext = false;
  tidy(G);
  const rebs = G.order.filter(u => G.rebellion[u]).map(u => nm(G, u));
  ev(G, 'duel', `デュエル ${G.duel}/${G.totalDuels} 開始！ ${nm(G, firstUid)}から` + (rebs.length ? `（リベリオン: ${rebs.join('、')}）` : ''));
}

function drawCard(G) {
  if (!G.deck.length && G.discard.length) { G.deck = shuffle(G.discard); G.discard = []; say(G, '山札が尽きたので捨て札を混ぜ直しました'); }
  return G.deck.length ? G.deck.pop() : null;
}
// デビルゼロの所在更新（押し付けられるまでは「デビルハンド」は付かない＝pushed:false）
function tidy(G) {
  const dh = G.order.find(u => G.hands[u].includes(DEVIL_ID)) || null;
  G.devil = { holder: dh, pushed: dh ? !!G.devil.pushed : false };
}
const rm = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); return i >= 0; };

function endTurn(G) {
  let k = 1;
  if (G.skipNext) { k = 2; G.skipNext = false; ev(G, 'skip', `${nm(G, nextOf(G, G.turn, 1))}はスキップ！`); }
  G.turn = nextOf(G, G.turn, k); G.step = 'draw'; G.lastDiscard = null; G.trade = null; G.devilDisc = null;
}

function doAttack(G, uid, viaRob) {
  G.king = uid; G.step = 'cutin'; G.cutKind = viaRob ? 'rob' : 'attack'; G.cutSeq++;
  G.ldone = {}; G.confirmed = {}; G.skipNext = false; G.robReq = []; G.trade = null;
  G.confirmed[uid] = true;
  ev(G, viaRob ? 'rob' : 'attack', viaRob ? `${nm(G, uid)}のロブアタック！` : `${nm(G, uid)}がアタック！`, uid);
}
/** カットイン終了 → 全員ラストドロー（ホストのタイマーから呼ぶ） */
export function finishCutin(G) {
  if (G.phase !== 'duel' || G.step !== 'cutin') return false;
  const uid = G.king;
  for (let k = 1; k < G.order.length; k++) {
    const u = nextOf(G, uid, k);
    let got = 0, guard = 0;
    while (got < 2 && guard++ < 30) {
      const c = drawCard(G); if (c == null) break;
      if (CARDS[c].kind === 'bow') { G.discard.push(c); ev(G, 'bow', `${nm(G, u)}はボウを引いて公開、引き直し`, u); continue; }
      G.hands[u].push(c); got++;
    }
  }
  G.step = 'lastdraw'; tidy(G); G.rev++;
  return true;
}
function maybeReveal(G) {
  if (G.order.every(u => (u === G.king || G.ldone[u]) && G.confirmed[u])) startShowdown(G);
}

function startShowdown(G) {
  const per = {}; const comp = [];
  G.order.forEach(u => {
    const a = G.arr[u];
    const sol = a ? evalOrdered(a.ids, G.bows[u], G.rebellion[u], a.mode) : null;
    per[u] = { hand: G.hands[u].slice(), bows: G.bows[u], text: sol ? sol.text : '', value: sol ? sol.value : null, ids: sol ? sol.ids : [], mode: sol ? sol.mode : 'N', hasDevil: G.hands[u].includes(DEVIL_ID) };
    if (sol) comp.push(u);
  });
  const max = comp.length ? Math.max(...comp.map(u => per[u].value)) : null;
  const top = comp.filter(u => per[u].value === max);
  const winners = top.includes(G.king) ? [G.king] : top;
  G.order.forEach(u => {
    const r = per[u];
    if (winners.includes(u)) { r.status = 'win'; r.delta = 0; }
    else if (r.value != null) { if (u === G.king) { r.status = 'kingkill'; r.delta = -30; } else { r.status = 'complete'; r.delta = 0; } }
    else if (r.hasDevil) { r.status = 'devilburst'; r.delta = -100; }
    else { r.status = 'burst'; r.delta = -10; }
    if (r.status === 'win' && r.hasDevil) r.rebellion = true;
  });
  applyWinScores(G, per, winners);
  G.order.forEach(u => { per[u].total = G.scores[u] + per[u].delta; });
  G.result = { per, winners, king: G.king, max };
  const list = [G.king]; for (let k = 1; k < G.order.length; k++) list.push(nextOf(G, G.king, k));
  G.show = { list, shown: [] }; G.step = 'showdown'; G.showSeq++;
  ev(G, 'showdown', 'キングから順に手札を公開します！');
}
/** 手札公開を1人ぶん進める。全員公開したあとはリザルトへ（ホストのタイマーから呼ぶ） */
export function advanceShowdown(G) {
  if (G.phase !== 'duel' || G.step !== 'showdown') return false;
  const sh = G.show;
  if (sh.shown.length < sh.list.length) {
    const u = sh.list[sh.shown.length]; sh.shown.push(u); G.showSeq++;
    const r = G.result.per[u];
    if (r.value == null) ev(G, r.hasDevil ? 'devilburst' : 'burst', `${nm(G, u)}は式を作れず${r.hasDevil ? 'デビルバースト！' : 'バースト…'}`, u);
    else say(G, `${nm(G, u)}の手札 ＝ ${r.value}`);
  } else finalizeShowdown(G);
  G.rev++;
  return true;
}
function finalizeShowdown(G) {
  const { per, winners, max } = G.result;
  G.order.forEach(u => { G.scores[u] += per[u].delta; per[u].total = G.scores[u]; if (per[u].rebellion) G.nextRebellion[u] = true; });
  G.lastWinner = winners[0]; G.prevWin = per[winners[0]].eff; G.zeroPending = winners.filter(u => per[u].eff === 0); G.step = 'reveal';
  ev(G, 'reveal', `結果発表！ 勝者: ${winners.map(u => nm(G, u)).join('、')}（${max}点）`);
  G.order.forEach(u => {
    if (per[u].status === 'kingkill') ev(G, 'kingkill', `${nm(G, u)}はキングキリング！ -30点`, u);
    if (per[u].rebellion) ev(G, 'reb', `${nm(G, u)}は次のデュエルでリベリオン！`, u);
  });
}

const ERR = msg => ({ ok: false, err: msg });
const OK = { ok: true };
const isPlayer = (G, u) => G.order.includes(u);
const takable = (G, card) => !(card === DEVIL_ID && G.devil.pushed);   // 押し付け済みのデビルゼロは引けない

/** トレードで実際に動かせる枚数 */
export function tradeCount(G, uid, target, want, excludeId) {
  const mine = G.hands[uid].filter(i => i !== DEVIL_ID && i !== excludeId).length;
  const th = G.hands[target].filter(i => takable(G, i)).length;
  return Math.min(want, mine, th);
}

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
      const short = mine.length <= G.formulaLen - 2;
      const c = drawCard(G); if (c == null) return ERR('山札がありません');
      mine.push(c); say(G, `${nm(G, uid)}がドロー`);
      if (short) endTurn(G); else G.step = 'act';
      return OK;
    }
    case 'rebTrade': {
      if (G.phase !== 'duel' || G.step !== 'draw' || G.turn !== uid || !G.rebellion[uid]) return ERR('リベリオントレードはできません');
      const t = a.target; if (!isPlayer(G, t) || t === uid) return ERR('相手が不正です');
      const n = tradeCount(G, uid, t, 1, null); if (n < 1) return ERR('交換できるカードがありません');
      G.trade = { by: uid, target: t, n, stage: 'shuffle', reb: true }; G.step = 'trade';
      ev(G, 'trade', `${nm(G, uid)}がリベリオントレード！ ${nm(G, t)}を指名`, uid);
      return OK;
    }
    case 'tradeReady': {
      const T = G.trade;
      if (G.step !== 'trade' || !T || T.stage !== 'shuffle' || T.target !== uid) return ERR('今は確定できません');
      if (!Array.isArray(a.order) || !sameSet(a.order, mine)) return ERR('手札の並びが不正です');
      G.hands[uid] = a.order.slice(); T.stage = 'pick';
      say(G, `${nm(G, uid)}が手札を並べ替えた`);
      return OK;
    }
    case 'tradePick': {
      const T = G.trade;
      if (G.step !== 'trade' || !T || T.stage !== 'pick' || T.by !== uid) return ERR('今は選べません');
      const n = tradeCount(G, uid, T.target, T.n, null);
      const give = a.give || [], take = a.take || [];
      if (give.length !== n || take.length !== n || new Set(give).size !== n || new Set(take).size !== n) return ERR('交換枚数が不正です');
      if (!give.every(g => mine.includes(g) && g !== DEVIL_ID)) return ERR('渡すカードが不正です');
      const th = G.hands[T.target];
      if (!take.every(i => Number.isInteger(i) && i >= 0 && i < th.length && takable(G, th[i]))) return ERR('引くカードが不正です');
      const got = take.map(i => th[i]);
      G.hands[T.target] = th.filter((_, i) => !take.includes(i)).concat(give);
      give.forEach(g => rm(mine, g)); got.forEach(g => mine.push(g));
      ev(G, 'trade', `${nm(G, uid)}と${nm(G, T.target)}が${n}枚交換した`, uid);
      endTurn(G);
      return OK;
    }
    case 'attack': {
      if (G.phase !== 'duel' || G.step !== 'act' || G.turn !== uid) return ERR('今はアタックできません');
      if (!Array.isArray(a.order) || !sameSet(a.order, mine)) return ERR('手札の並びが不正です');
      const sol = evalOrdered(a.order, G.bows[uid], G.rebellion[uid], a.mode || 'N');
      if (!sol) return ERR('その並びではコンプリートしていません');
      G.hands[uid] = a.order.slice(); G.arr[uid] = { ids: sol.ids, mode: sol.mode };
      doAttack(G, uid, false); return OK;
    }
    case 'devilDiscard': {
      const D = G.devilDisc;
      if (G.step !== 'devildiscard' || !D || D.target !== uid) return ERR('今は捨てられません');
      if (!mine.includes(a.cardId) || a.cardId === DEVIL_ID) return ERR('そのカードは捨てられません');
      rm(mine, a.cardId); G.discard.push(a.cardId);
      say(G, `${nm(G, uid)}は押し付けられて1枚捨てた`);
      endTurn(G); return OK;
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
      if (a.cardId === DEVIL_ID && G.devil.pushed) return ERR('押し付けられたデビルゼロは捨てられません');
      rm(mine, a.cardId); G.discard.push(a.cardId); G.ldone[uid] = true;
      say(G, `${nm(G, uid)}が1枚捨てた`);
      return OK;
    }
    case 'lastConfirm': {
      if (G.phase !== 'duel' || G.step !== 'lastdraw' || uid === G.king || !G.ldone[uid] || G.confirmed[uid]) return ERR('今は確定できません');
      if (!Array.isArray(a.order) || !sameSet(a.order, mine)) return ERR('手札の並びが不正です');
      G.hands[uid] = a.order.slice(); G.arr[uid] = { ids: a.order.slice(), mode: modesFor(G.formulaLen).includes(a.mode) ? a.mode : 'N' };
      G.confirmed[uid] = true; say(G, `${nm(G, uid)}が手札を確定した`);
      maybeReveal(G);
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
      G.duel = 0; G.order.forEach(u => { G.scores[u] = 0; }); G.nextRebellion = {}; G.zeroPending = []; G.prevWin = null;
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
  // --- デビルゼロ: 押し付け（ここで初めてデビルハンドが付く） ---
  if (id === DEVIL_ID) {
    if (G.devil.pushed) return ERR('押し付けられたデビルゼロは捨てられません');
    if (a.effect !== 'push' || !validTarget(a.target) || G.rebellion[a.target]) return ERR('押し付ける相手を選んでください');
    rm(mine, id); G.hands[a.target].push(id); G.devil = { holder: a.target, pushed: true };
    ev(G, 'devil', `${me}がデビルゼロを${nm(G, a.target)}に押し付けた！`, a.target);
    G.devilDisc = { target: a.target, by: uid }; G.step = 'devildiscard'; return OK;
  }
  // --- ボウ ---
  if (def.kind === 'bow') {
    rm(mine, id); const l = leftOf(G, uid); G.bowIds[l].push(id); G.bows[l] = G.bowIds[l].length;
    ev(G, 'bow', `${me}「ボウカードです」→ ${nm(G, l)}へ`, l);
    endTurn(G); return OK;
  }
  // --- トレード（相手指名 → 相手が並べ替え確定 → 引き抜き） ---
  if (def.kind === 'trade') {
    if (a.effect === 'trade') {
      const t = a.target; if (!validTarget(t)) return ERR('相手が不正です');
      const n = tradeCount(G, uid, t, def.n, id);
      rm(mine, id); G.discard.push(id);
      if (n < 1) { say(G, `${me}のトレードは交換できるカードがなく不発`); endTurn(G); return OK; }
      G.trade = { by: uid, target: t, n, stage: 'shuffle', reb: false }; G.step = 'trade';
      ev(G, 'trade', `${me}がトレード${def.n}を使用！ ${nm(G, t)}を指名`, uid);
      return OK;
    }
    rm(mine, id); G.discard.push(id); say(G, `${me}がトレード${def.n}を捨てた`);
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
    G.lastDiscard = null;
    const sol = solveBest(G.hands[r], G.bows[r], G.rebellion[r]);   // ロブアタックは自動で式を組む
    G.hands[r] = sol.ids.slice(); G.arr[r] = { ids: sol.ids, mode: sol.mode };
    doAttack(G, r, true);
  } else { G.robReq = []; endTurn(G); }
  tidy(G); G.rev++;
  return true;
}

export function publicView(G) {
  const handCounts = {}; G.order.forEach(u => { handCounts[u] = G.hands[u].length; });
  const dv = G.devil, shown = dv.pushed && dv.holder;
  const shownInfo = {};
  if (G.show && G.result) G.show.shown.forEach(u => { const r = G.result.per[u]; shownInfo[u] = { hand: r.hand, ids: r.ids, text: r.text, value: r.value, mode: r.mode, bows: r.bows, devil: r.hasDevil }; });
  return {
    phase: G.phase, duel: G.duel, totalDuels: G.totalDuels, formulaLen: G.formulaLen, order: G.order, names: G.names, cpu: G.cpu, hostUid: G.hostUid,
    turn: G.turn, step: G.step, deckCount: G.deck.length, discardCount: G.discard.length, discardTop: G.discard.slice(-3),
    lastDiscard: G.lastDiscard || null, handCounts, bows: G.bows,
    devil: { holder: shown ? dv.holder : null, pushed: !!dv.pushed, idx: shown ? G.hands[dv.holder].indexOf(DEVIL_ID) : -1 },
    rebellion: G.rebellion, scores: G.scores, king: G.king || null, ldone: G.ldone || {}, confirmed: G.confirmed || {},
    trade: G.trade || null, devilDisc: G.devilDisc || null, show: G.show ? { list: G.show.list, shown: G.show.shown } : null, shownInfo, showSeq: G.showSeq, robSeq: G.robSeq, robMs: G.robMs, cutSeq: G.cutSeq, cutMs: G.cutMs, cutKind: G.cutKind || null,
    skipNext: !!G.skipNext, log: G.log.slice(-40), events: G.events.slice(-8),
    result: (G.step === 'reveal' || G.phase === 'end') ? G.result : null, rev: G.rev
  };
}
