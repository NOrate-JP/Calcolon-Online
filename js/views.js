// 画面のHTML文字列を作る関数群（DOM/Firebase非依存）
import { CARDS, DEVIL_ID, cardKey, cardLabel, keyLabel, sortRank, solveBest, evalOrdered, calcOrdered, spanOf, modesFor, FLAME_KEYS, OP_SYM, OP_JP } from './engine.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Realtime Databaseは空の配列/オブジェクトを保存しないため、受信時に補う */
export function normPub(P) {
  if (!P) return P;
  P.ldone = P.ldone || {}; P.confirmed = P.confirmed || {}; P.cpu = P.cpu || {};
  P.log = P.log || []; P.events = P.events || []; P.discardTop = P.discardTop || [];
  P.devil = P.devil || { holder: null, pushed: false, idx: -1 };
  P.rebellion = P.rebellion || {}; P.bows = P.bows || {}; P.handCounts = P.handCounts || {}; P.scores = P.scores || {};
  P.order = P.order || []; P.names = P.names || {}; P.shownInfo = P.shownInfo || {}; P.formulaLen = P.formulaLen || 5; P.hist = P.hist || {};
  if (P.show) P.show.shown = P.show.shown || [];
  Object.values(P.shownInfo).forEach(r => { r.hand = r.hand || []; r.ids = r.ids || []; });
  if (P.result && P.result.per) Object.values(P.result.per).forEach(r => { r.hand = r.hand || []; r.ids = r.ids || []; });
  return P;
}

// ---------- カード ----------
function faceParts(id) {
  const c = CARDS[id];
  if (c.kind === 'num') { if (c.val === 'T') return ['1/10', '']; if (c.val === 'D') return ['0', 'デビルゼロ']; return [c.val, '']; }
  if (c.kind === 'op') return [OP_SYM[c.op], c.flame ? '🔥フレイム' : OP_JP[c.op]];
  if (c.kind === 'bow') return ['(', 'ボウ'];
  return ['⇄', 'トレード' + c.n];
}
export const imgState = {};   // key -> true(あり) / false(なし)
const keepImgs = [];
export const IMG_KEYS = ['n0','n1','n2','n3','n4','n5','n6','n7','n8','n9','tenth','devil','sword','arrow','flame','halberd','shield','bow','trade1','trade2','back'];
export function preloadCardImages() {
  return Promise.all(IMG_KEYS.map(k => new Promise(res => {
    const im = new Image(); im.onload = () => { imgState[k] = true; res(); }; im.onerror = () => { imgState[k] = false; res(); };
    im.src = `assets/cards/${k}.png`; keepImgs.push(im);
  })));
}
const IMG = key => imgState[key] === false ? '' :
  `<img class="cimg" src="assets/cards/${key}.png" alt="" draggable="false" decoding="sync" ${imgState[key] === true ? '' : `onload="this.closest('.card').classList.add('has-img')"`} onerror="this.remove()">`;
const pre = key => imgState[key] === true ? ' has-img' : '';
export function cardHTML(id, cls = '', attrs = '') {
  const key = cardKey(id); const [m, s] = faceParts(id);
  return `<div class="card k-${key}${pre(key)} ${cls}" data-id="${id}" ${attrs}><div class="cface"><span class="clogo">Calcolon</span><span class="cmain">${esc(m)}</span><span class="csub">${esc(s)}</span></div>${IMG(key)}</div>`;
}
export function backHTML(cls = '', attrs = '') {
  return `<div class="card back${pre('back')} ${cls}" ${attrs}><div class="cface"><span class="clogo">Calcolon</span><span class="bsig">✠</span></div>${IMG('back')}</div>`;
}

// ---------- 共通ヘルパ ----------
const BOW_ID = CARDS.findIndex(c => c.kind === 'bow');
/** 場に出ているボウ（表向き）。2枚目は上下をひっくり返して「)」に見せる */
function bowsHTML(P, u) {
  const n = P.bows[u] || 0; let h = '';
  for (let i = 0; i < n; i++) h += cardHTML(BOW_ID, 'bowc' + (i % 2 ? ' flipbow' : ''));
  return h;
}
const sortedHand = h => [...h].sort((a, b) => sortRank(a) - sortRank(b) || a - b);
const nm = (P, u) => esc(P.names[u] || '???');
export const modeOf = S => ((S.pub.bows[S.uid] || 0) >= 2 && modesFor(S.pub.formulaLen || 5).includes(S.mode) ? S.mode : 'N');
/** 今、自分が「捨てるカード」を選べる状況か */
export function canDiscard(S) {
  const P = S.pub, me = S.uid;
  if (P.phase !== 'duel') return false;
  if (P.step === 'act' && P.turn === me) return true;
  if (P.step === 'lastdraw' && me !== P.king && !P.ldone[me]) return true;
  return false;
}
/** 自分の並びがコンプリートか */
export function myFormula(S) {
  const P = S.pub, me = S.uid;
  if (S.order.length !== (P.formulaLen || 5)) return null;
  return evalOrdered(S.order, P.bows[me] || 0, !!P.rebellion[me], modeOf(S));
}
export function tradeNFor(P, hand, target, want, excludeId) {
  const mine = hand.filter(i => i !== DEVIL_ID && i !== excludeId).length;
  const th = (P.handCounts[target] || 0) - (P.devil.pushed && P.devil.holder === target ? 1 : 0);
  return Math.min(want, mine, th);
}

export function statusText(S) {
  const P = S.pub, me = S.uid;
  if (P.phase === 'end') return 'ゲーム終了';
  switch (P.step) {
    case 'draw': return P.turn === me ? (P.rebellion[me] ? 'あなたの番：ドロー、またはリベリオントレード' : 'あなたの番：山札からドローしてください') : `${nm(P, P.turn)} の番です`;
    case 'act': return P.turn === me ? '不要なカードを1枚捨てます。手札を並べて式が完成するとアタックできます' : `${nm(P, P.turn)} が考えています…`;
    case 'rob': return P.lastDiscard && P.lastDiscard.by === me ? 'ロブされなければ次の手番へ…' : '捨てられたカードでコンプリートできるなら「ロブ！」';
    case 'trade': {
      const T = P.trade; if (!T) return '';
      if (T.stage === 'shuffle') return T.target === me ? `${nm(P, T.by)}にトレードを仕掛けられました！手札を並べ替えて「確定」を押してください` : (T.by === me ? `${nm(P, T.target)}が手札を並べ替えています…` : `${nm(P, T.by)}が${nm(P, T.target)}にトレードを仕掛けています`);
      return T.by === me ? `${nm(P, T.target)}の手札から引くカードを選んでください` : `${nm(P, T.by)}がカードを選んでいます…`;
    }
    case 'devildiscard': {
      const D = P.devilDisc; if (!D) return '';
      return D.target === me ? 'デビルゼロを押し付けられました！手札から1枚捨ててください' : `${nm(P, D.target)}がデビルゼロを押し付けられ、1枚捨てます`;
    }
    case 'showdown': return 'キングから順に手札を公開します…';
    case 'cutin': return `${nm(P, P.king)} のアタック！`;
    case 'lastdraw':
      if (me === P.king) return (P.cutKind === 'rob' && !P.confirmed[me]) ? 'ロブアタック！手札を並べて式を作り、「確定」を押してください' : 'ラストドロー中… 全員の準備を待っています';
      if (!P.ldone[me]) return 'ラストドロー：2枚引きました。捨てる1枚を選んでください';
      return P.confirmed[me] ? '他のプレイヤーを待っています…' : '手札を並べて式を作り、「確定」を押してください';
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
  const cpus = ps.filter(p => p.cpu).length;
  const list = ps.map((p, i) => `<li class="${i >= 4 ? 'over' : ''}"><span class="seatno">${i + 1}</span>${esc(p.name)}${p.cpu ? ' <em class="cpu">CPU</em>' : ''}${p.uid === m.hostUid ? ' <em>ホスト</em>' : ''}${p.uid === S.uid ? ' <em>あなた</em>' : ''}</li>`).join('');
  const opt = (arr, v, f) => arr.map(x => `<option value="${x}" ${x === v ? 'selected' : ''}>${f(x)}</option>`).join('');
  const settings = isHost ? `<div class="btnrow"><button class="btn mini" data-act="addcpu" ${ps.length >= 4 ? 'disabled' : ''}>＋ CPUを追加</button><button class="btn mini ghost" data-act="rmcpu" ${cpus ? '' : 'disabled'}>－ CPUを外す</button></div>
    <div class="settings">
    <label>デュエル数<select id="sel-duels">${opt([1, 2, 3, 5, 7, 10], m.totalDuels, x => x + '回')}</select></label>
    <label>ロブ猶予<select id="sel-rob">${opt([2000, 3000, 3500, 5000, 8000], m.robMs, x => (x / 1000) + '秒')}</select></label>
    <label class="span2">ルール<select id="sel-final"><option value="0" ${m.finalRule ? '' : 'selected'}>通常（手札4枚・式5枚）</option><option value="1" ${m.finalRule ? 'selected' : ''}>決勝ルール（2人専用・手札6枚・式7枚）</option></select></label></div>
    <button class="btn gold" data-act="start" ${ps.length < 2 ? 'disabled' : ''}>ゲーム開始（${Math.min(ps.length, 4)}人）</button>` : `<p class="wait">ホストの開始を待っています…</p>
    <p class="muted">デュエル数 ${m.totalDuels}回 / ロブ猶予 ${(m.robMs / 1000)}秒 / ${m.finalRule ? '決勝ルール' : '通常ルール'}</p>`;
  return `<div class="title-screen"><div class="logo-mid">Calcolon</div><div class="panel">
    <div class="codebox">部屋コード<strong>${esc(S.code)}</strong></div>
    <ul class="plist">${list}</ul>
    ${ps.length > 4 ? '<p class="muted">5人目以降は参加できません（最大4人）</p>' : ''}
    ${settings}<div class="btnrow"><button class="btn mini ghost" data-act="settings">⚙ 初心者向け設定</button><button class="btn ghost" data-act="leave">退出</button></div></div></div>`;
}

// ---------- ゲーム画面 ----------
function badges(S, u) {
  const P = S.pub; let h = '';
  if (P.cpu[u]) h += '<span class="bd cpu">CPU</span>';
  if (P.king === u) h += '<span class="bd king" title="キング">👑</span>';
  if (P.rebellion[u]) h += '<span class="bd reb" title="リベリオン">🚩</span>';
  if (P.devil.holder === u) h += '<span class="bd dh">🖐 デビルハンド</span>';
  if (P.step === 'lastdraw' && u !== P.king && P.confirmed[u]) h += '<span class="bd ok">✔</span>';
  return h;
}
function plate(S, u) {
  const P = S.pub;
  const active = P.phase === 'duel' && ((['draw', 'act'].includes(P.step) && P.turn === u) || (P.step === 'devildiscard' && P.devilDisc && P.devilDisc.target === u) || (P.step === 'trade' && P.trade && ((P.trade.stage === 'shuffle' ? P.trade.target : P.trade.by) === u)));
  return `<div class="plate ${active ? 'turn' : ''}"><span class="pname">${nm(P, u)}</span><span class="pscore">${P.scores[u]}</span></div><div class="badges">${badges(S, u)}</div>`;
}
function seatHTML(S, u, pos) {
  const P = S.pub; const n = P.handCounts[u] || 0; let backs = '';
  for (let i = 0; i < n; i++) backs += backHTML(P.devil.holder === u && P.devil.idx === i ? 'clip' : '', '');
  return `<div class="seat seat-${pos}" data-uid="${esc(u)}">${plate(S, u)}<div class="rack">${backs}</div><div class="bowrow">${bowsHTML(P, u)}</div></div>`;
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

const WAIT_REPS = (() => { const m = new Map(); CARDS.forEach(c => { const k = cardKey(c.id); if (['bow', 'trade1', 'trade2', 'devil'].includes(k)) return; if (!m.has(k)) m.set(k, c.id); }); return [...m.values()]; })();
const waitCache = new Map();
function waitsHTML(S) {
  const P = S.pub, me = S.uid;
  if (!S.opts.waits || P.phase !== 'duel' || S.hand.length !== P.formulaLen - 1 || ['reveal', 'showdown', 'cutin', 'lastdraw'].includes(P.step)) return '';
  const bows = P.bows[me] || 0, reb = !!P.rebellion[me];
  const key = [...S.hand].sort((a, b) => a - b).join(',') + '|' + bows + '|' + reb;
  let res = waitCache.get(key);
  if (!res) { res = WAIT_REPS.filter(id => solveBest([...S.hand, id], bows, reb)).map(id => cardLabel(id)); waitCache.set(key, res); if (waitCache.size > 60) waitCache.clear(); }
  return `<div class="waits">待ち（これが来ればアガリ）: ${res.length ? esc(res.join('　')) : 'なし'}</div>`;
}
function currentHTML(S) {
  const P = S.pub;
  if (!S.opts.current || S.order.length !== P.formulaLen || P.phase !== 'duel' || ['reveal', 'showdown', 'cutin'].includes(P.step)) return '';
  const c = calcOrdered(S.order, P.bows[S.uid] || 0, modeOf(S)); if (!c) return '';
  return `<div class="cur ${c.ok ? 'ok' : ''}">今の並び: ${esc(c.line)}${c.ok ? '　✔コンプリート' : ''}</div>`;
}
export function controlsHTML(S) {
  const P = S.pub, me = S.uid, my = S.order; const locked = S.lockRev === P.rev;
  const dis = locked ? 'disabled' : '';
  let h = '', tools = '';
  if (P.phase !== 'duel') return '';
  // 並べ替え（いつでも）
  if (S.sel != null && my.includes(S.sel)) tools += '<button class="btn mini" data-act="mvl" title="左へ">◀</button><button class="btn mini" data-act="mvr" title="右へ">▶</button>';
  if ((P.bows[me] || 0) >= 2 && my.length === P.formulaLen) {
    const m = modeOf(S);
    tools += `<span class="sep"></span><span class="tl">括弧</span>` + modesFor(P.formulaLen).map(k => { const sp = spanOf(k); const l = k === 'N' ? 'なし' : `( ${2 * sp[0] + 1}〜${2 * sp[1] + 1} )`; return `<button class="btn mini ${m === k ? 'gold' : 'ghost'}" data-act="mode" data-m="${k}">${l}</button>`; }).join('');
  }
  const f = myFormula(S);
  if (P.step === 'draw' && P.turn === me) {
    h += `<button class="btn gold" data-act="draw" ${dis}>ドロー</button>`;
    if (P.rebellion[me]) h += `<button class="btn" data-act="rebtrade" ${dis}>リベリオントレード</button>`;
  } else if (P.step === 'act' && P.turn === me) {
    if (f) h += `<button class="btn gold pulse" data-act="attack" ${dis}>アタック！ ${f.value}点</button>`;
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
    const can = !!solveBest([...S.hand, P.lastDiscard.id], P.bows[me] || 0, !!P.rebellion[me]);
    const done = S.robbed === P.robSeq;
    const el = Math.max(0, Date.now() - (S.robStart || Date.now()));
    h += `<button class="btn rob ${can && !done ? 'pulse' : ''}" data-act="rob" ${can && !done ? '' : 'disabled'}>${done ? 'ロブ宣言済み' : 'ロブ！'}</button>
      <div class="robbar"><i style="animation-duration:${P.robMs}ms;animation-delay:-${el}ms"></i></div>`;
  } else if (P.step === 'trade' && P.trade && P.trade.stage === 'shuffle' && P.trade.target === me) {
    h += `<button class="btn gold pulse" data-act="tready" ${dis}>並べ替え完了（確定）</button>`;
  } else if (P.step === 'devildiscard' && P.devilDisc && P.devilDisc.target === me) {
    h += S.sel != null && my.includes(S.sel) && S.sel !== DEVIL_ID ? `<button class="btn red" data-act="devdiscard" ${dis}>この1枚を捨てる</button>` : '<span class="note">デビルゼロ以外から、捨てる1枚を選んでください</span>';
  } else if (P.step === 'lastdraw' && me === P.king && P.cutKind === 'rob' && !P.confirmed[me]) {
    h += `<button class="btn gold pulse" data-act="lconfirm" ${dis}>確定（公開する）</button>`;
  } else if (P.step === 'lastdraw' && me !== P.king) {
    if (!P.ldone[me]) h += S.sel === DEVIL_ID && P.devil.pushed ? '<span class="note">押し付けられたデビルゼロは捨てられません</span>' : S.sel != null && my.includes(S.sel) ? `<button class="btn gold" data-act="lastdiscard" ${dis}>この1枚を捨てる</button>` : '<span class="note">捨てる1枚を選んでください</span>';
    else if (!P.confirmed[me]) h += `<button class="btn gold pulse" data-act="lconfirm" ${dis}>確定（公開する）</button>`;
  }
  return waitsHTML(S) + currentHTML(S) + (tools ? `<div class="tools">${tools}</div>` : '') + `<div class="btnrow">${h}</div>`;
}

function handRowHTML(S) {
  const P = S.pub; const o = S.order, m = modeOf(S), sel = S.sel, sp = o.length === P.formulaLen ? spanOf(m) : null;
  const paren = c => `<span class="paren">${c}</span>`;
  let out = '';
  o.forEach((id, i) => {
    if (sp && i === 2 * sp[0]) out += paren('(');
    out += cardHTML(id, `pick ${sel === id ? 'sel ' : ''}${S.prevHand && !S.prevHand.has(id) ? 'enter ' : ''}${id === DEVIL_ID ? 'devilhand ' : ''}`, '');
    if (sp && i === 2 * sp[1]) out += paren(')');
  });
  return out;
}
export function gameHTML(S) {
  const P = S.pub, me = S.uid, N = P.order.length; const mi = Math.max(0, P.order.indexOf(me));
  const pos = { 2: { 1: 'top' }, 3: { 1: 'left', 2: 'right' }, 4: { 1: 'left', 2: 'top', 3: 'right' } }[N] || {};
  let seats = ''; for (let k = 1; k < N; k++) seats += seatHTML(S, P.order[(mi + k) % N], pos[k]);
  const chips = P.order.map(u => `<span class="chip ${u === me ? 'mine' : ''}">${nm(P, u)} <b>${P.scores[u]}</b></span>`).join('');
  const logs = (S.logOpen ? P.log.slice(-30) : P.log.slice(-4)).map(l => `<div>${esc(l)}</div>`).join('');
  return `<div class="topbar"><span class="logo-s">Calcolon</span><span class="duel">DUEL ${P.duel}/${P.totalDuels}</span><span class="chips">${chips}</span><span class="room">${esc(S.code)}</span><button class="btn mini" data-act="scores">点数表</button><button class="btn mini ghost" data-act="settings" title="初心者向け設定">⚙</button><button class="btn mini" data-act="leave">退出</button></div>
  <div class="scene"><div class="table">${pilesHTML(S)}</div>${seats}</div>
  <div class="logbox ${S.logOpen ? 'open' : ''}" data-act="log">${logs}</div>
  <div class="me" data-uid="${esc(me)}"><div class="statusline">${statusText(S)}</div>${plate(S, me)}<div class="ctl">${controlsHTML(S)}</div><div class="hand n${S.order.length}">${handRowHTML(S)}</div><div class="rackbar"></div><div class="bowfield">${bowsHTML(P, me)}</div></div>
  ${(P.step === 'showdown' || P.step === 'reveal' || P.phase === 'end') ? resultHTML(S) : ''}`;
}

// ---------- 手札公開（ショーダウン）と結果 ----------
const STATUS = { win: ['勝利', 'st-win'], complete: ['コンプリート（0点）', 'st-comp'], kingkill: ['キングキリング', 'st-kk'], burst: ['バースト', 'st-burst'], devilburst: ['デビルバースト', 'st-db'] };
function formulaCards(ids, mode, anim, len) {
  const sp = ids.length === len ? spanOf(mode) : null; let cs = '';
  ids.forEach((id, i) => {
    if (sp && i === 2 * sp[0]) cs += '<span class="paren s">(</span>';
    cs += cardHTML(id, anim, `style="--d:${(i * 0.12).toFixed(2)}s"`);
    if (sp && i === 2 * sp[1]) cs += '<span class="paren s">)</span>';
  });
  return cs;
}
export function resultHTML(S) {
  const P = S.pub, R = P.result, isHost = P.hostUid === S.uid;
  if (P.phase === 'end') {
    if (!R) return '';
    const rank = [...P.order].sort((a, b) => P.scores[b] - P.scores[a]);
    const rows = rank.map((u, i) => `<li class="${i === 0 ? 'first' : ''}"><span class="rk">${i + 1}</span><span class="rn">${nm(P, u)}</span><span class="rs">${P.scores[u]}</span></li>`).join('');
    return `<div class="result end"><div class="rbox"><h2>FINAL RESULT</h2><ol class="rank">${rows}</ol>
      <div class="btnrow">${isHost ? '<button class="btn gold" data-act="rematch">もう一度遊ぶ</button>' : '<span class="note">ホストが再戦を選べます</span>'}<button class="btn" data-act="scores">点数表</button><button class="btn ghost" data-act="leave">退出</button></div></div></div>`;
  }
  const final = P.step === 'reveal' && R;
  const list = P.show && P.show.list && P.show.list.length ? P.show.list : P.order;
  const rows = list.map(u => {
    const info = final ? R.per[u] : P.shownInfo[u];
    const who = `${P.king === u ? '👑 ' : ''}${nm(P, u)}`;
    if (!info) {
      let backs = ''; for (let i = 0; i < (P.handCounts[u] || 0); i++) backs += backHTML('', '');
      return `<div class="rrow waiting"><div class="rwho">${who}</div><div class="rcards">${backs}</div><div class="rinfo"><div class="rform muted">…</div></div></div>`;
    }
    const anim = S.revSeen && S.revSeen.has(P.duel + ':' + u) ? 'static' : 'flip';
    const ids = info.ids.length === P.formulaLen ? info.ids : info.hand;
    const cs = formulaCards(ids, info.mode, anim, P.formulaLen);
    const bowTxt = info.bows ? `<small>ボウ×${info.bows}</small>` : '';
    const burst = info.value == null;
    if (!final) {
      const stamp = burst ? `<div class="rstamp ${info.devil ? 'dev' : ''} ${anim}">${info.devil ? 'DEVIL BURST' : 'BURST'}</div>` : `<div class="rval ${anim}">${info.value}<small>点</small></div>`;
      return `<div class="rrow shown ${burst ? 'isburst' : ''}"><div class="rwho">${who}${bowTxt}</div><div class="rcards">${cs}</div><div class="rinfo"><div class="rform">${burst ? esc(info.calc || '式を作れず') : esc(info.text) + ' ＝ ' + info.value}</div>${stamp}</div></div>`;
    }
    const [lab, cl] = STATUS[info.status];
    const win = R.winners.includes(u);
    return `<div class="rrow ${win ? 'winner' : ''}"><div class="rwho">${who}${bowTxt}</div><div class="rcards">${cs}</div>
      <div class="rinfo"><div class="rform">${burst ? esc(info.calc || '式を作れず') : esc(info.text) + ' ＝ ' + info.value}</div><div class="rst ${cl}">${lab}${info.rebellion ? ' ・次回リベリオン🚩' : ''}</div>
      <div class="rdelta ${info.delta < 0 ? 'neg' : ''}">${info.delta > 0 ? '+' : ''}${info.delta}<small>計 ${info.total}</small></div>${info.note ? `<div class="rnote">${esc(info.note)}</div>` : ''}</div></div>`;
  }).join('');
  const btn = final ? `<div class="btnrow">${isHost ? `<button class="btn gold" data-act="next">${P.duel >= P.totalDuels ? '最終結果へ' : '次のデュエルへ'}</button>` : '<span class="note">ホストが進めるのを待っています…</span>'}<button class="btn" data-act="scores">点数表</button></div>` : '';
  return `<div class="result ${final ? '' : 'showdown'}"><div class="rbox"><h2>${final ? 'DUEL ' + P.duel + ' RESULT' : 'SHOWDOWN'}</h2>${rows}${btn}</div></div>`;
}

// ---------- モーダル ----------
export function settingsHTML(S) {
  const o = S.opts;
  return `<div class="mback"><div class="mbox"><h3>初心者向け設定</h3><p class="muted">自分の画面だけに表示されます（初期値はどちらもOFF）。</p>
    <label class="chk"><input type="checkbox" data-opt="waits" ${o.waits ? 'checked' : ''}><span>待ち表示<small>何のカードが来ればアガリになるかを表示</small></span></label>
    <label class="chk"><input type="checkbox" data-opt="current" ${o.current ? 'checked' : ''}><span>今の並びの計算結果を表示<small>数・記・数・記・数の並びのときだけ</small></span></label>
    <div class="btnrow"><button class="btn gold" data-act="mclose">閉じる</button></div></div></div>`;
}
export function scoresHTML(S) {
  const P = S.pub; if (!P) return '';
  const n = P.totalDuels; let head = ''; for (let i = 0; i < n; i++) head += `<th>${i + 1}</th>`;
  const rows = P.order.map(u => {
    let tds = '';
    for (let i = 0; i < n; i++) {
      const h = (P.hist[u] || [])[i]; let c = '';
      if (h) c = h.r ? `<span class="dg"><i>${h.p}</i><b>${h.p + h.r}</b></span>` : `${h.p}`;
      tds += `<td class="${h && h.p + (h.r || 0) < 0 ? 'neg' : ''}">${c}${i === n - 1 ? '<small class="x2">×2</small>' : ''}</td>`;
    }
    return `<tr><th class="pl">${nm(P, u)}</th>${tds}<td class="tot">${P.scores[u]}</td></tr>`;
  }).join('');
  return `<div class="mback"><div class="mbox wide"><h3>点数表</h3><table class="stab"><thead><tr><th class="corner">Duel<br>Player</th>${head}<th class="tt">TOTAL</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">斜線のマスは「0勝利」で後から加算された点数（左上が元の点、右下が確定点）です。最終デュエルは全部2倍。</p>
    <div class="btnrow"><button class="btn gold" data-act="mclose">閉じる</button></div></div></div>`;
}
export function modalHTML(S) {
  if (S.modal && S.modal.type === 'settings') return settingsHTML(S);
  if (S.modal && S.modal.type === 'scores') return scoresHTML(S);
  const P = S.pub, me = S.uid; if (!P) return '';
  const others = P.order.filter(u => u !== me);
  const close = '<button class="btn ghost" data-act="mclose">やめる</button>';
  // 引き抜きフェーズ（トレードを仕掛けた本人）
  if (P.step === 'trade' && P.trade && P.trade.stage === 'pick' && P.trade.by === me) {
    const T = P.trade, sel = S.tsel || { give: [], take: [] };
    const n = tradeNFor(P, S.hand, T.target, T.n, null);
    const mine = S.order.filter(i => i !== DEVIL_ID).map(id => cardHTML(id, 'mini2 ' + (sel.give.includes(id) ? 'sel' : ''), `data-act="tgive" data-id="${id}"`)).join('');
    let th = ''; for (let i = 0; i < P.handCounts[T.target]; i++) {
      const dev = P.devil.holder === T.target && P.devil.idx === i;
      th += backHTML('mini2 ' + (sel.take.includes(i) ? 'sel ' : '') + (dev ? 'clip dim' : ''), dev ? '' : `data-act="ttake" data-i="${i}"`);
    }
    return `<div class="mback"><div class="mbox wide"><h3>${nm(P, T.target)}とトレード</h3>
      <p class="muted">あなたの手札から渡すカードを${n}枚、相手の伏せ札から引くカードを${n}枚選んでください</p>
      <div class="mrow"><span>あなたの手札</span><div class="mcards">${mine}</div></div>
      <div class="mrow"><span>${nm(P, T.target)}の手札（ババ抜きのように選ぶ）</span><div class="mcards">${th}</div></div>
      <button class="btn gold" data-act="tgo" ${sel.give.length === n && sel.take.length === n ? '' : 'disabled'}>交換する</button></div></div>`;
  }
  const M = S.modal; if (!M) return '';
  if (M.type === 'push') {
    const ts = others.filter(u => !P.rebellion[u]);
    return `<div class="mback"><div class="mbox"><h3>デビルゼロを押し付ける相手</h3><div class="btnrow wrapr">${ts.length ? ts.map(u => `<button class="btn red" data-act="mpush" data-u="${u}">${nm(P, u)}</button>`).join('') : '<span class="note">押し付けられる相手がいません（リベリオン中の人には押し付けられません）</span>'}</div>${close}</div></div>`;
  }
  if (M.type === 'flame') {
    return `<div class="mback"><div class="mbox"><h3>フレイムアロー：消すカードを指定</h3><p class="muted">全員の手札からそのカードが1枚ずつ捨てられます（あなたも対象）。デビルゼロ・フレイムアローは指定できません。</p>
      <div class="keygrid">${FLAME_KEYS.map(k => `<button class="btn mini" data-act="mflame" data-k="${k}">${esc(keyLabel(k))}</button>`).join('')}</div>${close}</div></div>`;
  }
  if (M.type === 'trade') {
    const want = M.reb ? 1 : CARDS[M.cardId].n;
    const tbtn = others.map(u => { const n = tradeNFor(P, S.hand, u, want, M.cardId); return `<button class="btn" data-act="mtarget" data-u="${u}" ${n < 1 ? 'disabled' : ''}>${nm(P, u)}（${P.handCounts[u]}枚）</button>`; }).join('');
    return `<div class="mback"><div class="mbox"><h3>${M.reb ? 'リベリオントレード（1枚）' : 'トレード' + want}：相手を指名</h3>
      <p class="muted">指名された相手は手札を並べ替えて確定します。その後、伏せ札から引くカードを選びます。</p><div class="btnrow wrapr">${tbtn}</div>${close}</div></div>`;
  }
  return '';
}
