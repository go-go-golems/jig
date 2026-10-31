// sketch/index.js · the immutable sketch builder (README §4.5), lazy profile references, sketch3d.
import { System } from './system.js';
import { runOp } from './ops.js';
import { SolvedSketch } from './solved.js';
import { c } from './constraints.js';
import { solver } from './solver.js';
import { Frame, Deferred, plane as planes, resolveDatum, toVec3, Axis, Dir, Point } from '../geom.js';
import { Quantity, coerce } from '../units.js';
import { Pattern } from '../pattern.js';
import { stampLine } from '../callsite.js';

const solveCache = new WeakMap();
const EMPTY_ENV = Object.freeze({});

export class Sketch {
  constructor(id, opts = {}, ops = [], solverSlot = null, strictFlag = false) {
    this.kind = 'sketch';
    this.id = id;
    this.on = opts.on ?? planes.XY;
    this.opts = Object.freeze({ ...opts });
    this.ops = Object.freeze(ops);
    this.solverSlot = solverSlot;
    this.strictFlag = strictFlag;
    Object.freeze(this);
  }
  // every op remembers its script.js line (non-enumerable: keys and caches ignore it)
  _add(op) { return new Sketch(this.id, this.opts, [...this.ops, Object.freeze(stampLine(op))], this.solverSlot, this.strictFlag); }
  point(id, at = [0, 0], o = {}) { return this._add({ op: 'point', id, at, construction: !!o.construction }); }
  line(id, a, b) { return this._add({ op: 'line', id, a, b }); }
  polyline(id, pts, { closed = false } = {}) { return this._add({ op: 'polyline', id, pts, closed }); }
  arc(id, spec) { return this._add({ op: 'arc', id, spec }); }
  circle(id, r, { at = [0, 0] } = {}) { return this._add({ op: 'circle', id, r, at }); }
  ellipse(id, rx, ry, { at = [0, 0], angle = 0 } = {}) { return this._add({ op: 'ellipse', id, rx, ry, at, angle }); }
  spline(id, pts, { degree = 3, fit = 'interp', closed = false } = {}) { return this._add({ op: 'spline', id, pts, degree, fit, closed }); }
  rect(id, w, h, { at = null, center = false, r = null } = {}) { return this._add({ op: 'rect', id, w, h, at, center, r }); }
  polygon(id, n, r, { at = null, inscribed = true } = {}) { return this._add({ op: 'polygon', id, n, r, at, inscribed }); }
  slot(id, a, b, width) { return this._add({ op: 'slot', id, a, b, width }); }
  text(id, str, opts = {}) { return this._add({ op: 'text', id, str, opts }); }
  project(id, sel) { return this._add({ op: 'project', id, sel }); }
  intersect(id, sel) { return this._add({ op: 'intersect', id, sel }); }
  offset(id, srcIds, d) { return this._add({ op: 'offset', id, src: srcIds, d }); }
  fillet(id, corner, r) { return this._add({ op: 'fillet', id, corner, r }); }
  chamfer(id, corner, d) { return this._add({ op: 'chamfer', id, corner, d }); }
  trim(id, at) { return this._add({ op: 'trim', id, at }); }
  mirror(srcIds, axis) { return this._add({ op: 'mirror', src: srcIds, axis }); }
  pattern(srcIds, pattern) { return this._add({ op: 'pattern', src: srcIds, pattern }); }
  construction(...ids) { return this._add({ op: 'construction', ids: ids.flat() }); }
  import(id, region) { return this._add({ op: 'import', id, region }); }
  constrain(...cs) { return this._add({ op: 'constrain', cs: cs.flat() }); }
  dim(target, value, { driven = false } = {}) { return this._add({ op: 'dim', target, value, driven }); }
  solver(slot) { return new Sketch(this.id, this.opts, this.ops, slot, this.strictFlag); }
  strict(on = true) { return new Sketch(this.id, this.opts, this.ops, this.solverSlot, on); }

  // ── compile-time ──────────────────────────────────────────────────────────
  // explicit: numbers given to primitives are fixed geometry; constrained: they are starting positions (example 04)
  get mode() {
    if (this.opts.mode === 'explicit' || this.opts.mode === 'constrained') return { mode: this.opts.mode, reason: `set by { mode: '${this.opts.mode}' }` };
    return this.ops.some(op => op.op === 'constrain' || op.op === 'dim')
      ? { mode: 'constrained', reason: 'constraints or dimensions given: coordinates are starting positions' }
      : { mode: 'explicit', reason: 'no constraints: coordinates are fixed' };
  }
  system(env = EMPTY_ENV) {
    const sys = new System(this.id, env);
    // entities and constraints record the index of the op that made them (SolvedSketch.lineOf reads its line)
    this.ops.forEach((op, i) => {
      sys.opIndex = i;
      try { runOp(sys, op); }
      catch (e) { sys.diag('error', e.name === 'ConstraintError' ? 'sketch.ref' : 'sketch.op', `${op.op}${op.id ? ' ' + op.id : ''}: ${e.message}`); if (env.throw) throw e; }
    });
    sys.opIndex = null;
    const { mode, reason } = this.mode;
    sys.mode = mode;
    sys.decisions.unshift({ at: this.id, kind: 'sketch.mode', chose: mode, alternatives: [mode === 'explicit' ? 'constrained' : 'explicit'], reason });
    if (mode === 'explicit') for (const e of sys.entities.values()) if (e.primitive) for (const i of Object.values(e.p)) sys.fixed[i] = true;
    if (env.warm) warmStart(sys, env.warm);
    return sys.finalize();
  }
  // cached per env object, and per (scope object, plane, ctx) so a compile that rebuilds env objects still shares the solve
  solve(env = EMPTY_ENV) {
    let per = solveCache.get(this);
    if (!per) { per = { byEnv: new WeakMap(), byScope: new WeakMap() }; solveCache.set(this, per); }
    if (per.byEnv.has(env)) return per.byEnv.get(env);
    const sc = env.scope && typeof env.scope === 'object' && !env.external && !env.warm ? env.scope : null;
    const sub = `${env.plane && env.plane.key ? env.plane.key() : ''}|${env.ctx ? JSON.stringify(env.ctx, (_, v) => (v instanceof Quantity ? v.key() : v)) : ''}`;
    if (sc && per.byScope.get(sc)?.has(sub)) { const hit = per.byScope.get(sc).get(sub); per.byEnv.set(env, hit); return hit; }
    const out = SolvedSketch.solve(this, this.system(env), env);
    per.byEnv.set(env, out);
    if (sc) { if (!per.byScope.has(sc)) per.byScope.set(sc, new Map()); per.byScope.get(sc).set(sub, out); }
    return out;
  }
  // lazy references (resolved by the kernel with params at compile time)
  profiles() { return new ProfileSet('profiles', this, null); }
  profile(pick) { return new ProfileSet('profiles', this, pick); }
  wire(ids) { return new ProfileSet('wire', this, null, ids); }
  get deferredPlane() { return this.on instanceof Deferred; }
  resolvePlane(env = {}) { return resolveDatum(this.on, env); }
  toSketchData(env) { return this.solve(env).toSketchData(); }
  key() { return keyOf({ id: this.id, on: this.on, mode: this.opts.mode ?? null, ops: this.ops, solver: this.solverSlot, strict: this.strictFlag }); }
  toString() { return `sketch(${this.id}, ${this.ops.length} ops)`; }
}
// a stable cache key for builder values (lambdas by source text)
export function keyOf(v) {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'function') return `fn:${String(v)}`;
  if (v instanceof Quantity) return `q:${v.key()}`;
  if (v instanceof Frame) return `frame:${v.key()}`;
  if (v instanceof Deferred) return `deferred:${v.type}.${v.op}(${keyOf(v.args)})${keyOf(v.chain)}`;
  if (v instanceof Pattern) return `pattern:${v.kind}(${keyOf(v.spec)})${v.ops.map(o => `.${o.op}(${o.fn ? keyOf(o.fn) : keyOf([...(o.set ?? [])])})`).join('')}`;
  if (v instanceof Sketch) return `sketch:${v.key()}`;
  if (v instanceof Set) return `set:${keyOf([...v])}`;
  if (Array.isArray(v)) return `[${v.map(keyOf).join(',')}]`;
  if (typeof v.key === 'function') return `${v.constructor?.name}:${v.key()}`;
  if (typeof v.toJSON === 'function') return JSON.stringify(v.toJSON());
  return `{${Object.keys(v).sort().map(k => `${k}:${keyOf(v[k])}`).join(',')}}`;
}
function warmStart(sys, prev) {
  const old = new Map();
  const S = prev.sys, X = prev.X;
  S.pname.forEach((n, i) => old.set(n, X[i]));
  sys.pname.forEach((n, i) => { if (!sys.fixed[i] && old.has(n)) sys.x[i] = old.get(n); });
}

export class ProfileSet {
  constructor(kind, sketch, pick = null, ids = null) { this.kind = kind; this.sketch = sketch; this.pick = pick; this.ids = ids; Object.freeze(this); }
  resolve(env = EMPTY_ENV) {
    const solved = this.sketch.solve(env);
    if (this.kind === 'wire') return { wire: solved.wire(this.ids), solved };
    return { profiles: solved.profile(this.pick), solved };
  }
  toString() { return `${this.sketch.id}.${this.kind === 'wire' ? 'wire' : this.pick == null ? 'profiles()' : 'profile(…)'}`; }
  toJSON() { return { kind: this.kind, sketch: this.sketch.id, pick: typeof this.pick === 'function' ? 'ƒ' : this.pick, ids: this.ids }; }
}

export function sketch(id, opts = {}) {
  if (typeof id !== 'string' || !id) throw new TypeError('j.sketch(id, { on }) needs an id first');
  return new Sketch(id, opts);
}

// ── sketch3d: 3D point lists for sweeps and paths ────────────────────────────
export class Sketch3D {
  constructor(id, items = []) { this.kind = 'sketch3d'; this.id = id; this.items = Object.freeze(items); Object.freeze(this); }
  _add(it) { return new Sketch3D(this.id, [...this.items, Object.freeze(it)]); }
  line(id, a, b) { return this._add({ id, kind: 'line', pts: [toVec3(a), toVec3(b)] }); }
  polyline(id, pts) { return this._add({ id, kind: 'polyline', pts: pts.map(toVec3) }); }
  spline(id, pts, opts = {}) { return this._add({ id, kind: 'spline', pts: pts.map(toVec3), ctrl: pts.map(toVec3), opts }); }
  helix(id, { axis = null, pitch, turns = 1, r, segments = 24 } = {}) {
    const P = num(pitch), R = num(r), T = Number(turns);
    const ax = axis instanceof Axis ? axis : new Axis(new Point(0, 0, 0), new Dir(0, 0, 1));
    const z = ax.dir, ref = Math.abs(z.x) < 0.9 ? new Dir(1, 0, 0) : new Dir(0, 1, 0), x = refOrtho(ref, z), y = z.cross(x), o = ax.origin;
    const n = Math.max(8, Math.ceil(T * segments)), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * T * 2 * Math.PI, h = (i / n) * T * P;
      pts.push([0, 1, 2].map(k => o.toArray()[k] + R * Math.cos(t) * x.toArray()[k] + R * Math.sin(t) * y.toArray()[k] + h * z.toArray()[k]));
    }
    return this._add({ id, kind: 'helix', pts, helix: { axis: ax.toJSON(), pitch: P, turns: T, r: R } });
  }
  curves() { return this.items.map(it => ({ ...it, pts: it.kind === 'spline' ? catmull3(it.pts) : it.pts })); }
  toData() { return { id: this.id, kind: 'sketch3d', curves: this.curves() }; }
  toString() { return `sketch3d(${this.id}, ${this.items.length})`; }
}
const num = v => (typeof v === 'number' ? v : coerce(v, 'length', {}).value);
function refOrtho(ref, z) { const d = ref.dot(z); return Dir.from(ref.x - d * z.x, ref.y - d * z.y, ref.z - d * z.z); }
function catmull3(P, per = 12) {
  if (P.length < 3) return P;
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
export function sketch3d(id) { return new Sketch3D(id); }

export { c, solver, SolvedSketch };
