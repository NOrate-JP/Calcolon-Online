// ホスト端末で動くゲーム進行役。全員の操作(actions)を受け取り、エンジンで処理して状態を配信する。
import { db, ref, set, update, get, remove, onChildAdded } from './fb.js';
import { createGame, reduce, closeRob, publicView, hydrate } from './engine.js';

const clean = o => JSON.parse(JSON.stringify(o));

export class Host {
  constructor(code, uid) { this.code = code; this.uid = uid; this.G = null; this.robScheduled = -1; this.timer = null; this.unsub = null; }
  p(path) { return `rooms/${this.code}/${path}`; }
  async resume() {
    const s = await get(ref(db, this.p('private')));
    if (s.exists()) { this.G = hydrate(s.val()); this.scheduleRob(); this.publish(); }
    return !!this.G;
  }
  listen() {
    this.unsub = onChildAdded(ref(db, this.p('actions')), snap => {
      const a = snap.val(); remove(snap.ref);
      if (a) this.handle(a);
    });
  }
  stop() { if (this.unsub) this.unsub(); clearTimeout(this.timer); }
  startGame(players, opts) {
    const uids = players.map(x => x.uid), names = Object.fromEntries(players.map(x => [x.uid, x.name]));
    this.G = createGame(this.uid, uids, names, opts);
    this.robScheduled = -1;
    this.scheduleRob(); this.publish();
    return update(ref(db, this.p('meta')), { status: 'playing' });
  }
  handle(a) {
    if (!this.G) return;
    const res = reduce(this.G, a);
    if (!res.ok) { if (a.uid) set(ref(db, this.p('msgs/' + a.uid)), { text: res.err, t: Date.now() }); return; }
    this.scheduleRob(); this.publish();
  }
  scheduleRob() {
    const G = this.G;
    if (G.phase === 'duel' && G.step === 'rob' && this.robScheduled !== G.robSeq) {
      this.robScheduled = G.robSeq; clearTimeout(this.timer);
      this.timer = setTimeout(() => { if (closeRob(this.G)) { this.scheduleRob(); this.publish(); } }, G.robMs);
    }
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
