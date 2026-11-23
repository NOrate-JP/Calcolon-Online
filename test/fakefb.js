// テスト用：Firebaseを差し替えるメモリ上のRealtime Database（空の配列/オブジェクトを保存しない挙動も再現）
const tree = {}; const listeners = [];
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
function norm(v) {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) { const a = v.map(norm); return a.some(x => x !== undefined) ? a : undefined; }
  if (typeof v === 'object') { const o = {}; for (const k in v) { const n = norm(v[k]); if (n !== undefined) o[k] = n; } return Object.keys(o).length ? o : undefined; }
  return v;
}
const parts = p => p.split('/').filter(Boolean);
function getAt(p) { let n = tree; for (const k of parts(p)) { if (n == null || typeof n !== 'object') return undefined; n = n[k]; } return n; }
function setAt(p, v) {
  const ks = parts(p); if (!ks.length) return;
  let n = tree; for (let i = 0; i < ks.length - 1; i++) { if (n[ks[i]] == null || typeof n[ks[i]] !== 'object') n[ks[i]] = {}; n = n[ks[i]]; }
  const nv = norm(clone(v)); if (nv === undefined) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = nv;
  // 空になった親を掃除
  for (let i = ks.length - 1; i > 0; i--) { const pp = ks.slice(0, i).join('/'); const o = getAt(pp); if (o && typeof o === 'object' && !Object.keys(o).length) setAt(pp, null); else break; }
}
const snap = (path, v) => ({ val: () => clone(v), exists: () => v !== undefined, ref: { path }, key: parts(path).pop() });
function notify() {
  listeners.slice().forEach(l => {
    if (l.type === 'value') { const v = getAt(l.path); const s = JSON.stringify(v ?? null); if (s !== l.last) { l.last = s; setTimeout(() => l.cb(snap(l.path, v)), 0); } }
    else { const o = getAt(l.path) || {}; Object.keys(o).forEach(k => { if (!l.seen.has(k)) { l.seen.add(k); setTimeout(() => l.cb(snap(l.path + '/' + k, o[k])), 0); } }); }
  });
}
// database.rules.json と同じ「書き込みできる単位」だけを許可する（それより上のフォルダをまとめて書き換えると拒否）
const WRITABLE = ['rooms/*/meta', 'rooms/*/players/*', 'rooms/*/pub', 'rooms/*/hands/*', 'rooms/*/private', 'rooms/*/actions/*', 'rooms/*/msgs/*'].map(p => p.split('/'));
function writable(path) {
  const ks = parts(path);
  return WRITABLE.some(w => ks.length >= w.length && w.every((seg, i) => seg === '*' || seg === ks[i]));
}
function check(paths) { const bad = paths.filter(p => !writable(p)); if (bad.length) { const e = new Error('PERMISSION_DENIED: ' + bad.join(', ')); window.__denied = (window.__denied || []).concat(bad); throw e; } }
export const configured = true;
export const auth = {}; export const db = {};
export const ref = (d, path = '') => ({ path });
export const set = async (r, v) => { check([r.path]); setAt(r.path, v); notify(); };
export const update = async (r, obj) => { check(Object.keys(obj).map(k => (r.path ? r.path + '/' : '') + k)); for (const k in obj) setAt((r.path ? r.path + '/' : '') + k, obj[k]); notify(); };
export const get = async r => snap(r.path, getAt(r.path));
export const remove = async r => { check([r.path]); setAt(r.path, null); notify(); };
export const push = async (r, v) => { check([r.path + '/x']); const k = 'k' + Date.now() + Math.random().toString(36).slice(2, 6); setAt(r.path + '/' + k, v); notify(); return { path: r.path + '/' + k }; };
export const onValue = (r, cb) => { const l = { type: 'value', path: r.path, cb, last: undefined }; listeners.push(l); notify(); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; };
export const onChildAdded = (r, cb) => { const l = { type: 'child', path: r.path, cb, seen: new Set() }; listeners.push(l); notify(); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; };
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb({ uid: 'me' }), 0); return () => {}; };
export const signInAnonymously = async () => ({ user: { uid: 'me' } });
window.__db = tree;
