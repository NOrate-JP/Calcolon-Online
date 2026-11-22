// 画面のHTML文字列を作る関数群（DOM/Firebase非依存）
import { CARDS, DEVIL_ID, cardKey, keyLabel, sortRank, solveBest, FLAME_KEYS, OP_SYM, OP_JP } from './engine.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- カード ----------
function faceParts(id) {
  const c = CARDS[id];
  if (c.kind === 'num') { if (c.val === 'T') return ['1/10', '']; if (c.val === 'D') return ['0', 'デビルゼロ']; return [c.val, '']; }
  if (c.kind === 'op') return [OP_SYM[c.op], c.flame ? '🔥フレイム' : OP_JP[c.op]];
  if (c.kind === 'bow') return ['( )', 'ボウ'];
  return ['⇄', 'トレード' + c.n];
}
const IMG = (key) => `<img class="cimg" src="assets/cards/${key}.png" alt="" draggable="false" onload="this.closest('.card').classList.add('has-img')" onerror="this.remove()">`;
export function cardHTML(id, cls = '', attrs = '') {
  const key = cardKey(id); const [m, s] = faceParts(id);
  return `<div class="card k-${key} ${cls}" data-id="${id}" ${attrs}><div class="cface"><span class="clogo">Calcolon</span><span class="cmain">${esc(m)}</span><span class="csub">${esc(s)}</span></div>${IMG(key)}</div>`;
}
export function backHTML(cls = '', attrs = '') {
  return `<div class="card back ${cls}" ${attrs}><div class="cface"><span class="clogo">Calcolon</span><span class="bsig">✠</span></div>${IMG('back')}</div>`;
}

// ---------- 共通ヘルパ ----------
const sortedHand = h => [...h].sort((a, b) => sortRank(a) - sortRank(b) || a - b);
export const isMyTurn = S => S.pub.turn === S.uid;
export function canSelect(S) {
  const P = S.pub, me = S.uid;
  if (P.phase !== 'duel') return false;
  if (P.step === 'act' && P.turn === me) return true;
  if (P.step === 'lastdraw' && me !== P.king && !P.ldone[me]) return true;
  return false;
}
const nm = (P, u) => esc(P.names[u] || '???');

export function statusText(S) {
  const P = S.pub, me = S.uid;
  if (P.phase === 'end') return 'ゲーム終了';
  switch (P.step) {
    case 'draw': return P.turn === me ? (P.rebellion[me] ? 'あなたの番：ドロー、またはリベリオントレード' : 'あなたの番：山札からドローしてください') : `${nm(P, P.turn)} の番です`;
    case 'act': return P.turn === me ? '不要なカードを1枚選んで捨てます（コンプリートならアタック可）' : `${nm(P, P.turn)} が考えています…`;
    case 'rob': return P.lastDiscard && P.lastDiscard.by === me ? 'ロブされなければ次の手番へ…' : '捨てられたカードでコンプリートできるなら「ロブ！」';
    case 'lastdraw': return me === P.king ? 'ラストドロー中… 全員の準備を待っています' : (P.ldone[me] ? '他のプレイヤーを待っています…' : 'ラストドロー：2枚引きました。捨てる1枚を選んでください');
    case 'reveal': return '結果発表';
  }
  return '';
}

// ---------- タイトル / ロビー ----------
export function titleHTML(S) {
  return `<div class="title-screen"><div class="logo-big">Calcolon</div><div class="logo-sub">数式で戦え。勝つための武器はここにある。</div>
  <div class="panel">
    <label>プレイヤー名<input id="in-name" maxlength="12" value="${esc(S.name)}" placeholder="なまえ"></label>
    <button class="btn gold" data-act="create">部屋を作る</button>
    <div class="or">または</div>
    <label>部屋コード<input id="in-code" maxlength="4" value="" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:.3em;text-align:center"></label>
    <button class="btn" data-act="join">部屋に入る</button>
  </div></div>`;
}
export function setupHTML() {
  return `<div class="title-screen"><div class="logo-big">Calcolon</div><div class="panel wide"><h3>Firebaseの設定が必要です</h3>
  <p><code>js/firebase-config.js</code> に Firebase の設定を貼り付けてください。手順は README.md を参照。</p></div></div>`;
}
export function lobbyHTML(S) {
  const m = S.meta, isHost = m.hostUid === S.uid;
  const ps = Object.entries(S.players || {}).map(([uid, v]) => ({ uid, ...v })).sort((a, b) => a.joinedAt - b.joinedAt);
  const list = ps.map((p, i) => `<li class="${i >= 4 ? 'over' : ''}"><span class="seatno">${i + 1}</span>${esc(p.name)}${p.uid === m.hostUid ? ' <em>ホスト</em>' : ''}${p.uid === S.uid ? ' <em>あなた</em>' : ''}</li>`).join('');
  const opt = (arr, v, f) => arr.map(x => `<option value="${x}" ${x === v ? 'selected' : ''}>${f(x)}</option>`).join('');
  const settings = isHost ? `<div class="settings">
    <label>デュエル数<select id="sel-duels">${opt([1, 2, 3, 5, 7, 10], m.totalDuels, x => x + '回')}</select></label>
    <label>ロブ猶予<select id="sel-rob">${opt([2000, 3000, 3500, 5000, 8000], m.robMs, x => (x / 1000) + '秒')}</select></label></div>
    <button class="btn gold" data-act="start" ${ps.length < 2 ? 'disabled' : ''}>ゲーム開始（${Math.min(ps.length, 4)}人）</button>` : `<p class="wait">ホストの開始を待っています…</p>
    <p class="muted">デュエル数 ${m.totalDuels}回 / ロブ猶予 ${(m.robMs / 1000)}秒</p>`;
  return `<div class="title-screen"><div class="logo-mid">Calcolon</div><div class="panel">
    <div class="codebox">部屋コード<strong>${esc(S.code)}</strong></div>
    <ul class="plist">${list}</ul>
    ${ps.length > 4 ? '<p class="muted">5人目以降は参加できません（最大4人）</p>' : ''}
    ${settings}<button class="btn ghost" data-act="leave">退出</button></div></div>`;
}

// ---------- ゲーム画面 ----------
function badges(S, u) {
  const P = S.pub; let h = '';
  if (P.king === u) h += '<span class="bd king" title="キング">👑</span>';
  if (P.rebellion[u]) h += '<span class="bd reb" title="リベリオン">🚩</span>';
  if (P.devil.holder === u) h += '<span class="bd dh">🖐 デビルハンド</span>';
  if ((P.bows[u] || 0) > 0) h += `<span class="bd bow">ボウ×${P.bows[u]}</span>`;
  if (P.step === 'lastdraw' && u !== P.king && P.ldone[u]) h += '<span class="bd ok">✔</span>';
  return h;
}
function plate(S, u) {
  const P = S.pub; const active = P.phase === 'duel' && (P.step === 'draw' || P.step === 'act') && P.turn === u;
  return `<div class="plate ${active ? 'turn' : ''}"><span class="pname">${nm(P, u)}</span><span class="pscore">${P.scores[u]}</span></div><div class="badges">${badges(S, u)}</div>`;
}
function seatHTML(S, u, pos) {
  const P = S.pub; const n = P.handCounts[u] || 0; let backs = '';
  for (let i = 0; i < n; i++) backs += backHTML(i === 0 && P.devil.holder === u ? 'clip' : '', '');
  return `<div class="seat seat-${pos}">${plate(S, u)}<div class="rack">${backs}</div></div>`;
}
function pilesHTML(S) {
  const P = S.pub; const layers = Math.max(1, Math.min(12, Math.ceil(P.deckCount / 4)));
  let deck = ''; for (let i = 0; i < layers; i++) deck += backHTML('lay', `style="transform:translateZ(${i * 1.8}px)"`);
  const top = P.discardTop || []; let disc = '';
  const key = P.discardCount + '-' + (top[top.length - 1] ?? 'x');
  const rots = [-9, 6, -3];
  top.forEach((id, i) => { const last = i === top.length - 1; disc += cardHTML(id, 'lay ' + (last && S.prevTop !== key ? 'drop' : ''), `style="transform:translateZ(${(i + 1) * 2}px) rotate(${rots[(i + 3 - top.length) % 3]}deg)"`); });
  if (!top.length) disc = '<div class="emptyslot">捨て札</div>';
  const who = P.lastDiscard ? `<div class="whodisc">${nm(P, P.lastDiscard.by)}${P.lastDiscard.skip ? '　SKIP!' : ''}</div>` : '';
  return `<div class="piles"><div class="pilebox"><div class="pile">${deck}</div><div class="plabel">山札 ${P.deckCount}</div></div>
    <div class="pilebox"><div class="pile">${disc}</div><div class="plabel">捨て札 ${P.discardCount}</div>${who}</div></div>`;
}
export function controlsHTML(S) {
  const P = S.pub, me = S.uid, my = S.hand; const locked = S.lockRev === P.rev;
  const dis = locked ? 'disabled' : '';
  let h = '';
  const sol = my.length === 5 ? solveBest(my, P.bows[me] || 0, !!P.rebellion[me]) : null;
  if (P.phase !== 'duel') return '';
  if (P.step === 'draw' && P.turn === me) {
    h += `<button class="btn gold" data-act="draw" ${dis}>ドロー</button>`;
    if (P.rebellion[me]) h += `<button class="btn" data-act="rebtrade" ${dis}>リベリオントレード</button>`;
  } else if (P.step === 'act' && P.turn === me) {
    if (sol) h += `<button class="btn gold pulse" data-act="attack" ${dis}>アタック！ ${sol.value}点</button>`;
    const id = S.sel; if (id != null && my.includes(id)) {
      const c = CARDS[id];
      if (id === DEVIL_ID) h += P.devil.pushed ? '<span class="note">押し付けられたデビルゼロは捨てられません</span>' : `<button class="btn red" data-act="push" ${dis}>デビルゼロを押し付ける</button>`;
      else if (c.kind === 'bow') h += `<button class="btn" data-act="discard" ${dis}>「ボウカードです」左隣へ渡す</button>`;
      else if (c.kind === 'trade') h += `<button class="btn" data-act="trade" ${dis}>トレードを使う</button><button class="btn ghost" data-act="discard" ${dis}>効果なしで捨てる</button>`;
      else if (c.kind === 'num' && c.val === '0') h += `<button class="btn" data-act="discard" ${dis}>捨てる</button><button class="btn" data-act="skip" ${dis}>捨てる＋スキップ</button>`;
      else if (c.kind === 'op' && c.flame) h += `<button class="btn" data-act="discard" ${dis}>アローとして捨てる</button><button class="btn red" data-act="flame" ${(P.bows[me] || 0) < 1 || locked ? 'disabled' : ''}>フレイムアロー${(P.bows[me] || 0) < 1 ? '（要ボウ）' : ''}</button>`;
      else h += `<button class="btn" data-act="discard" ${dis}>捨てる</button>`;
    } else h += '<span class="note">捨てるカードを選んでください</span>';
  } else if (P.step === 'rob' && P.lastDiscard && P.lastDiscard.by !== me) {
    const can = !!solveBest([...my, P.lastDiscard.id], P.bows[me] || 0, !!P.rebellion[me]);
    const done = S.robbed === P.robSeq;
    const el = Math.max(0, Date.now() - (S.robStart || Date.now()));
    h += `<button class="btn rob ${can && !done ? 'pulse' : ''}" data-act="rob" ${can && !done ? '' : 'disabled'}>${done ? 'ロブ宣言済み' : 'ロブ！'}</button>
      <div class="robbar"><i style="animation-duration:${P.robMs}ms;animation-delay:-${el}ms"></i></div>`;
  } else if (P.step === 'lastdraw' && me !== P.king && !P.ldone[me]) {
    h += S.sel != null && my.includes(S.sel) ? `<button class="btn gold" data-act="lastdiscard" ${dis}>この1枚を捨てる</button>` : '<span class="note">捨てる1枚を選んでください</span>';
  }
  let pv = '';
  if (sol && (P.step === 'act' || P.step === 'lastdraw')) pv = `<div class="preview">コンプリート: ${esc(sol.text)} ＝ <b>${sol.value}</b></div>`;
  return pv + `<div class="btnrow">${h}</div>`;
}
export function gameHTML(S) {
  const P = S.pub, me = S.uid, N = P.order.length; const mi = Math.max(0, P.order.indexOf(me));
  const pos = { 2: { 1: 'top' }, 3: { 1: 'left', 2: 'right' }, 4: { 1: 'left', 2: 'top', 3: 'right' } }[N] || {};
  let seats = ''; for (let k = 1; k < N; k++) seats += seatHTML(S, P.order[(mi + k) % N], pos[k]);
  const hand = sortedHand(S.hand), sel = canSelect(S);
  const cards = hand.map((id, i) => cardHTML(id, `${S.sel === id ? 'sel ' : ''}${S.prevHand && !S.prevHand.has(id) ? 'enter ' : ''}${id === DEVIL_ID ? 'devilhand ' : ''}${sel ? 'pick' : ''}`, `style="--rot:${((i - (hand.length - 1) / 2) * 3).toFixed(1)}deg"`)).join('');
  const chips = P.order.map(u => `<span class="chip ${u === me ? 'mine' : ''}">${nm(P, u)} <b>${P.scores[u]}</b></span>`).join('');
  const logs = (S.logOpen ? P.log.slice(-30) : P.log.slice(-4)).map(l => `<div>${esc(l)}</div>`).join('');
  return `<div class="topbar"><span class="logo-s">Calcolon</span><span class="duel">DUEL ${P.duel}/${P.totalDuels}</span><span class="chips">${chips}</span><span class="room">${esc(S.code)}</span><button class="btn mini" data-act="leave">退出</button></div>
  <div class="scene"><div class="table">${pilesHTML(S)}</div>${seats}</div>
  <div class="logbox ${S.logOpen ? 'open' : ''}" data-act="log">${logs}</div>
  <div class="me"><div class="statusline">${statusText(S)}</div>${plate(S, me)}<div class="ctl">${controlsHTML(S)}</div><div class="hand">${cards}</div><div class="rackbar"></div></div>
  ${(P.step === 'reveal' || P.phase === 'end') ? resultHTML(S) : ''}`;
}

// ---------- 結果 ----------
const STATUS = { win: ['勝利', 'st-win'], complete: ['コンプリート（0点）', 'st-comp'], kingkill: ['キングキリング', 'st-kk'], burst: ['バースト', 'st-burst'], devilburst: ['デビルバースト', 'st-db'] };
export function resultHTML(S) {
  const P = S.pub, R = P.result, isHost = P.hostUid === S.uid;
  if (!R) return '';
  if (P.phase === 'end') {
    const rank = [...P.order].sort((a, b) => P.scores[b] - P.scores[a]);
    const rows = rank.map((u, i) => `<li class="${i === 0 ? 'first' : ''}"><span class="rk">${i + 1}</span><span class="rn">${nm(P, u)}</span><span class="rs">${P.scores[u]}</span></li>`).join('');
    return `<div class="result end"><div class="rbox"><h2>FINAL RESULT</h2><ol class="rank">${rows}</ol>
      <div class="btnrow">${isHost ? '<button class="btn gold" data-act="rematch">もう一度遊ぶ</button>' : '<span class="note">ホストが再戦を選べます</span>'}<button class="btn ghost" data-act="leave">退出</button></div></div></div>`;
  }
  const rows = P.order.map((u, ri) => {
    const r = R.per[u]; const ids = r.value != null && r.ids.length === 5 ? r.ids : sortedHand(r.hand);
    const cs = ids.map((id, i) => cardHTML(id, 'flip', `style="--d:${(ri * 0.35 + i * 0.12).toFixed(2)}s"`)).join('');
    const [lab, cl] = STATUS[r.status];
    const win = R.winners.includes(u);
    return `<div class="rrow ${win ? 'winner' : ''}"><div class="rwho">${P.king === u ? '👑 ' : ''}${nm(P, u)}${r.bows ? `<small>ボウ×${r.bows}</small>` : ''}</div>
      <div class="rcards">${cs}</div>
      <div class="rinfo"><div class="rform">${r.value != null ? esc(r.text) + ' ＝ ' + r.value : '式を作れず'}</div><div class="rst ${cl}">${lab}</div>
      <div class="rdelta ${r.delta < 0 ? 'neg' : ''}">${r.delta > 0 ? '+' : ''}${r.delta}<small>計 ${r.total}</small></div></div></div>`;
  }).join('');
  return `<div class="result"><div class="rbox"><h2>DUEL ${P.duel} RESULT</h2>${rows}<div class="btnrow">${isHost ? `<button class="btn gold" data-act="next">${P.duel >= P.totalDuels ? '最終結果へ' : '次のデュエルへ'}</button>` : '<span class="note">ホストが進めるのを待っています…</span>'}</div></div></div>`;
}

// ---------- モーダル ----------
export function modalHTML(S) {
  const M = S.modal; if (!M) return '';
  const P = S.pub, me = S.uid;
  const others = P.order.filter(u => u !== me);
  const close = '<button class="btn ghost" data-act="mclose">やめる</button>';
  if (M.type === 'push') {
    const ts = others.filter(u => !P.rebellion[u]);
    return `<div class="mback"><div class="mbox"><h3>デビルゼロを押し付ける相手</h3><div class="btnrow wrapr">${ts.length ? ts.map(u => `<button class="btn red" data-act="mpush" data-u="${u}">${nm(P, u)}</button>`).join('') : '<span class="note">押し付けられる相手がいません（リベリオン中の人には押し付けられません）</span>'}</div>${close}</div></div>`;
  }
  if (M.type === 'flame') {
    return `<div class="mback"><div class="mbox"><h3>フレイムアロー：消すカードを指定</h3><p class="muted">全員の手札からそのカードが1枚ずつ捨てられます（あなたも対象）。デビルゼロは指定できません。</p>
      <div class="keygrid">${FLAME_KEYS.map(k => `<button class="btn mini" data-act="mflame" data-k="${k}">${esc(keyLabel(k))}</button>`).join('')}</div>${close}</div></div>`;
  }
  if (M.type === 'trade') {
    const want = M.reb ? 1 : CARDS[M.cardId].n;
    const tbtn = others.map(u => `<button class="btn ${M.target === u ? 'gold' : ''}" data-act="mtarget" data-u="${u}">${nm(P, u)}（${P.handCounts[u]}枚）</button>`).join('');
    let body = '';
    if (M.target) {
      const mine = S.hand.filter(i => i !== M.cardId && i !== DEVIL_ID);
      const thAvail = P.handCounts[M.target] - (P.devil.holder === M.target ? 1 : 0);
      const n = Math.min(want, mine.length, thAvail);
      if (n === 0) body = '<p class="note">交換できるカードがありません</p>';
      else {
        const my = sortedHand(mine).map(id => cardHTML(id, 'mini2 ' + (M.give.includes(id) ? 'sel' : ''), `data-act="mgive" data-id="${id}"`)).join('');
        let th = ''; for (let i = 0; i < P.handCounts[M.target]; i++) { const dev = P.devil.holder === M.target && i === 0; th += backHTML('mini2 ' + (M.take.includes(i) ? 'sel ' : '') + (dev ? 'clip dim' : ''), dev ? '' : `data-act="mtake" data-i="${i}"`); }
        body = `<p class="muted">渡すカードを${n}枚、相手の手札から引くカードを${n}枚選んでください</p><div class="mrow"><span>あなたの手札</span><div class="mcards">${my}</div></div>
          <div class="mrow"><span>${nm(P, M.target)}の手札</span><div class="mcards">${th}</div></div>
          <button class="btn gold" data-act="mgo" ${M.give.length === n && M.take.length === n ? '' : 'disabled'}>交換する</button>`;
      }
    }
    return `<div class="mback"><div class="mbox wide"><h3>${M.reb ? 'リベリオントレード（1枚）' : 'トレード' + want}：相手を選択</h3><div class="btnrow wrapr">${tbtn}</div>${body}${close}</div></div>`;
  }
  return '';
}
