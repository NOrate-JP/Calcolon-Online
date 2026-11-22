// ホスト端末で動くゲーム進行役。全員の操作(actions)を受け取り、エンジンで処理して状態を配信する。
// CPUプレイヤーの操作もここで生成する。
import { db, ref, set, update, get, remove, onChildAdded } from './fb.js';
import { createGame, reduce, closeRob, finishCutin, advanceShowdown, publicView, hydrate } from './engine.js';
import { cpuAction } from './cpu.js';

const clean = o => JSON.parse(JSON.stringify(o));

export class Host {
  constructor(code, uid) {
    this.code = code; this.uid = uid; this.G = null; this.unsub = null;
    this.robScheduled = -1; this.cutScheduled = -1; this.showScheduled = -1; this.showTimer = null; this.robTimer = null; this.cutTimer = null; this.cpuTimer = null;
  }
  p(path) { return `rooms/${this.code}/${path}`; }
  async resume() {
    const s = await get(ref(db, this.p('private')));
    if (s.exists()) { this.G = hydrate(s.val()); this.afterChange(); }
    return !!this.G;
  }
  listen() {
    this.unsub = onChildAdded(ref(db, this.p('actions')), snap => {
      const a = snap.val(); remove(snap.ref);
      if (a) this.handle(a);
    });
  }
  stop() { if (this.unsub) this.unsub(); clearTimeout(this.robTimer); clearTimeout(this.cutTimer); clearTimeout(this.showTimer); clearTimeout(this.cpuTimer); this.cpuTimer = null; }
  startGame(players, opts) {
    const uids = players.map(x => x.uid), names = Object.fromEntries(players.map(x => [x.uid, x.name]));
    const cpu = Object.fromEntries(players.filter(x => x.cpu).map(x => [x.uid, true]));
    this.G = createGame(this.uid, uids, names, { ...opts, cpu });
    this.robScheduled = -1; this.cutScheduled = -1; this.showScheduled = -1;
    this.afterChange();
    return update(ref(db, this.p('meta')), { status: 'playing' });
  }
  handle(a) {
    if (!this.G) return;
    const res = reduce(this.G, a);
    if (!res.ok) { if (a.uid && !(this.G.cpu && this.G.cpu[a.uid])) set(ref(db, this.p('msgs/' + a.uid)), { text: res.err, t: Date.now() }); return; }
    this.afterChange();
  }
  afterChange() { this.scheduleTimers(); this.scheduleShow(); this.publish(); this.scheduleCpu(); }
  scheduleTimers() {
    const G = this.G;
    if (G.phase === 'duel' && G.step === 'rob' && this.robScheduled !== G.robSeq) {
      this.robScheduled = G.robSeq; clearTimeout(this.robTimer);
      this.robTimer = setTimeout(() => { if (closeRob(this.G)) this.afterChange(); }, G.robMs);
    }
    if (G.phase === 'duel' && G.step === 'cutin' && this.cutScheduled !== G.cutSeq) {
      this.cutScheduled = G.cutSeq; clearTimeout(this.cutTimer);
      this.cutTimer = setTimeout(() => { if (finishCutin(this.G)) this.afterChange(); }, G.cutMs);
    }
  }
  scheduleShow() {
    const G = this.G;
    if (G.phase === 'duel' && G.step === 'showdown' && this.showScheduled !== G.showSeq) {
      this.showScheduled = G.showSeq; clearTimeout(this.showTimer);
      const ms = G.show.shown.length === 0 ? 1400 : (G.show.shown.length >= G.show.list.length ? 2000 : 2300);
      this.showTimer = setTimeout(() => { if (advanceShowdown(this.G)) this.afterChange(); }, ms);
    }
  }
  scheduleCpu() {
    const G = this.G;
    if (this.cpuTimer || !G || !G.cpu) return;
    if (!G.order.some(u => G.cpu[u] && cpuAction(G, u))) return;
    this.cpuTimer = setTimeout(() => {
      this.cpuTimer = null;
      const G2 = this.G; if (!G2) return;
      for (const u of G2.order) { if (!G2.cpu[u]) continue; const a = cpuAction(G2, u); if (a) { this.handle(a); return; } }
    }, 800 + Math.random() * 900);
  }
  publish() {
    const G = this.G, upd = {};
    upd[this.p('pub')] = clean(publicView(G));
    upd[this.p('private')] = clean(G);
    G.order.forEach(u => { upd[this.p('hands/' + u)] = G.hands[u].length ? G.hands[u].slice() : null; });
    upd[this.p('meta/status')] = G.phase === 'end' ? 'ended' : 'playing';
    return update(ref(db), upd);
  }
}
