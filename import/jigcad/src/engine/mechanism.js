// Mechanisms (README §4.10, the solver slot "Newton on SE(3) with Lie-algebra updates"): the joints of an
// assembly solved together, mobility from the rank of their Jacobian, and studies that sweep a drive.
//
// Each moving component carries 6 coordinates: a small rotation ω applied to its current orientation and a
// translation v of its origin, so a point P on it moves by δP = ω × (P − t) + v. Every joint is a fixed set
// of scalar equations between its two ports in world coordinates, built from five primitives:
//   point (3) p_b − p_a = 0 · on-axis (2) (p_b − p_a)·x_a, ·y_a = 0 · in-plane (1) (p_b − p_a)·z_a = 0
//   axis (2) z_a·x_b = z_a·y_b = 0 · twist (1) x_a·y_b = 0
// rigid/snap = point + axis + twist (6), revolute = point + axis (5), slider = on-axis + axis + twist (5),
// cylindrical = on-axis + axis (4), planar = axis + in-plane (3), ball = point (3).
// Placement walks a spanning tree from ground (driven, hinted and coupled joints first), then Gauss–Newton
// with the minimum-norm step closes the loops. Mobility is 6n − rank J; Kutzbach's 6n − Σc is reported beside
// it, and r = Σc − rank J equations are redundant: a requirement on manufacture, not an error.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const neg = (a) => [-a[0], -a[1], -a[2]];
const TAU = 2 * Math.PI;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const I3 = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const mv = (R, p) => [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2], R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];
const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const tr = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
const cols = (x, y, z) => [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
const col = (R, j) => [R[0][j], R[1][j], R[2][j]];
const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
function expSO3(w) {
  const t = len(w), K = [[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]];
  if (t < 1e-12) return I3().map((r, i) => r.map((v, j) => v + K[i][j]));
  const a = Math.sin(t) / t, b = (1 - Math.cos(t)) / (t * t), K2 = mm(K, K);
  return I3().map((r, i) => r.map((v, j) => v + a * K[i][j] + b * K2[i][j]));
}
function orthonormal(R) { const x = unit(col(R, 0)), y0 = col(R, 1), y = unit(sub(y0, mul(x, dot(x, y0)))); return cols(x, y, cross(x, y)); }
// column-major 4×4 ⇄ { R, t } and port frames { o, x, y, z }
export const poseOfMatrix = (m) => ({ R: [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], t: [m[12], m[13], m[14]] });
export const matrixOfPose = ({ R, t }) => [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, t[0], t[1], t[2], 1];
export const frameOfMatrix = (m) => ({ o: [m[12], m[13], m[14]], x: [m[0], m[1], m[2]], y: [m[4], m[5], m[6]], z: [m[8], m[9], m[10]] });

// one-sided Jacobi SVD of an m×n matrix (m ≥ n): { s, V }
function svd(A, m, n) {
  const U = A.map((r) => r.slice()), V = Array.from({ length: n }, (_, i) => { const r = new Array(n).fill(0); r[i] = 1; return r; });
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      let a = 0, b = 0, c = 0;
      for (let i = 0; i < m; i++) { const up = U[i][p], uq = U[i][q]; a += up * up; b += uq * uq; c += up * uq; }
      if (c === 0 || Math.abs(c) <= 1e-13 * Math.sqrt(a * b)) continue;
      off = Math.max(off, Math.abs(c) / Math.sqrt(a * b));
      const z = (b - a) / (2 * c), t = Math.sign(z || 1) / (Math.abs(z) + Math.sqrt(1 + z * z)), cs = 1 / Math.sqrt(1 + t * t), sn = cs * t;
      for (let i = 0; i < m; i++) { const up = U[i][p], uq = U[i][q]; U[i][p] = cs * up - sn * uq; U[i][q] = sn * up + cs * uq; }
      for (let i = 0; i < n; i++) { const vp = V[i][p], vq = V[i][q]; V[i][p] = cs * vp - sn * vq; V[i][q] = sn * vp + cs * vq; }
    }
    if (off < 1e-12) break;
  }
  const s = new Array(n).fill(0);
  for (let k = 0; k < n; k++) { let t = 0; for (let i = 0; i < m; i++) t += U[i][k] * U[i][k]; s[k] = Math.sqrt(t); }
  return { s, V };
}
// dx = −Jᵀ (J Jᵀ + μI)⁻¹ F: the least change that satisfies the linearised equations; μ keeps it finite when rows repeat
function minNormStep(J, F, n) {
  const m = J.length, A = Array.from({ length: m }, () => new Array(m).fill(0));
  let trc = 0;
  for (let i = 0; i < m; i++) for (let k = 0; k <= i; k++) { let t = 0; const a = J[i], b = J[k]; for (let j = 0; j < n; j++) t += a[j] * b[j]; A[i][k] = A[k][i] = t; if (i === k) trc += t; }
  const mu = 1e-10 * (trc / Math.max(1, m)) + 1e-16;
  for (let i = 0; i < m; i++) A[i][i] += mu;
  const L = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let i = 0; i < m; i++) for (let k = 0; k <= i; k++) { let t = A[i][k]; for (let j = 0; j < k; j++) t -= L[i][j] * L[k][j]; if (i === k) L[i][i] = Math.sqrt(Math.max(t, mu)); else L[i][k] = t / L[k][k]; }
  const y = new Array(m).fill(0);
  for (let i = 0; i < m; i++) { let t = F[i]; for (let j = 0; j < i; j++) t -= L[i][j] * y[j]; y[i] = t / L[i][i]; }
  for (let i = m - 1; i >= 0; i--) { let t = y[i]; for (let j = i + 1; j < m; j++) t -= L[j][i] * y[j]; y[i] = t / L[i][i]; }
  const dx = new Array(n).fill(0);
  for (let i = 0; i < m; i++) { const yi = y[i], a = J[i]; if (yi) for (let j = 0; j < n; j++) dx[j] -= a[j] * yi; }
  return dx;
}
const norm2 = (F) => F.reduce((a, b) => a + b * b, 0);
const normInf = (F) => F.reduce((a, b) => Math.max(a, Math.abs(b)), 0);

// ---------------------------------------------------------------- joints
// onLineX: b's origin on the line through a's origin along a's x (a pin in a slot), 2 equations
const COUNT = { point: 3, onAxis: 2, onLineX: 2, inPlane: 1, axis: 2, twist: 1 };
export const PRIMITIVES = {
  rigid: ['point', 'axis', 'twist'], snap: ['point', 'axis', 'twist'], revolute: ['point', 'axis'], slider: ['onAxis', 'axis', 'twist'],
  cylindrical: ['onAxis', 'axis'], pinSlot: ['onLineX', 'axis'], planar: ['axis', 'inPlane'], ball: ['point'],
};
export const equationCount = (kind) => (PRIMITIVES[kind] ?? []).reduce((a, p) => a + COUNT[p], 0);
// A joint's coordinates: the scalars a drag moves and a script sets. 'value' is its turn, or a slider's travel; a
// two-valued joint has a 'slide' too (along the port's z for a cylindrical joint, along x for a pin in a slot). Every
// channel that carries a joint's state (drives, overrides, the holds a drag commits, limits and clamps) names a
// coordinate by its key, 'h' for a value and 'h.slide' for a slide, so each coordinate the solver moves has a name to
// be set by and a committed drag cannot leave one behind.
export const COORDS = { revolute: ['value'], slider: ['value'], cylindrical: ['value', 'slide'], pinSlot: ['value', 'slide'] };
export const coordKey = (id, part = 'value') => (part === 'value' ? id : `${id}.${part}`);
const HAS_VALUE = new Set(Object.keys(COORDS));
const ANGULAR = new Set(['revolute', 'cylindrical', 'pinSlot']);
// the second value of a two-valued joint: how far b's origin has slid along a's z (cylindrical) or x (pin in slot)
const SLIDE_AXIS = { cylindrical: 'Z', pinSlot: 'X' };

// User lambdas (a measure, an event, a wrench's load) are called through one door, the solver's: a throw is kept with
// the lambda's name and where it was read (the first time, and how many more), for the compile to report
// (diagnostics()), and the call answers { ok: false }. A throw is never read as a value, such as null for "no load
// here" or "no crossing", so a broken lambda cannot quietly leave a load or an event out of a study.
const CALL_LEVEL = { measure: 'warning', event: 'error', wrench: 'error' };
const CALL_FIX = {
  wrench: 'the load is left out wherever it throws, so the reactions there are not the study\'s: fix the lambda (return null where there is no load)',
  event: 'its crossings are not found where it throws: fix the lambda',
  measure: 'the reading is empty where it throws: fix the lambda',
};
export class UserCalls {
  constructor() { this.failed = new Map(); }
  run(kind, name, fn, arg, where = null) {
    try { return { ok: true, value: fn(arg) }; } catch (e) {
      const key = `${kind}:${name}`, f = this.failed.get(key);
      if (f) f.more++; else this.failed.set(key, { kind, name, message: e?.message ?? String(e), where, more: 0 });
      return { ok: false, value: undefined };
    }
  }
  diagnostics() {
    return [...this.failed.values()].map((f) => ({ level: CALL_LEVEL[f.kind] ?? 'error', kind: `asm.${f.kind}`, at: f.name,
      message: `${f.kind} '${f.name}' threw${f.where ? ` at ${f.where}` : ''}${f.more ? ` (and ${f.more} more time${f.more > 1 ? 's' : ''})` : ''}: ${f.message}`, fix: CALL_FIX[f.kind] }));
  }
}

// spec: { bodies: [{ id, ground, T0 (4×4), ports: { name: 4×4 } }], joints: [{ id, kind, a, b }], drives: Map, hints: Map,
//         couples: [{ id, a, b, ratio, offset }], seeds: Map (start values for undriven tree joints) }
export class MechanismSolver {
  constructor(spec) {
    this.diags = []; this.calls = new UserCalls();
    this.bodies = spec.bodies.map((b) => ({ ...b, ...poseOfMatrix(b.T0) }));
    this.index = new Map(this.bodies.map((b, i) => [b.id, i]));
    let off = 0;
    for (const b of this.bodies) { b.off = b.ground ? -1 : off; if (!b.ground) off += 6; }
    this.n = off;
    this.joints = [];
    for (const jn of spec.joints) {
      const A = this.port(jn.a, jn.id), B = this.port(jn.b, jn.id);
      if (!A || !B || !PRIMITIVES[jn.kind]) continue;
      if (A.bi === B.bi) { this.diags.push({ level: 'error', kind: 'joint.selfJoin', at: jn.id, message: `both ports of joint ${jn.id} are on ${this.bodies[A.bi].id}` }); continue; }
      this.joints.push({ id: jn.id, kind: jn.kind, A, B, c: equationCount(jn.kind), on: true, limits: jn.limits ?? null, slideLimits: jn.slideLimits ?? null });
    }
    this.jointById = new Map(this.joints.map((jn) => [jn.id, jn]));
    this.drives = new Map([...(spec.drives ?? [])].filter(([key]) => {
      if (this.coord(key)) return true;
      const jn = this.jointById.get(key);
      if (jn) this.diags.push({ level: 'error', kind: 'asm.drive', at: key, message: `a ${jn.kind} joint has no single value to drive` });
      return false;
    }));
    this.hints = new Map(spec.hints ?? []);
    this.seeds = new Map(spec.seeds ?? []);
    this.couples = (spec.couples ?? []).filter((c) => {
      const ok = this.jointById.has(c.a) && this.jointById.has(c.b) && HAS_VALUE.has(this.jointById.get(c.a).kind) && HAS_VALUE.has(this.jointById.get(c.b).kind);
      if (!ok) this.diags.push({ level: 'error', kind: 'asm.couple', at: c.id, message: `couple ${c.id} must join two revolute, slider or cylindrical joints that exist (${c.a}, ${c.b})` });
      return ok;
    }).map((c) => ({ ...c, on: true }));
  }
  port(ref, at) {
    const P = this._ports?.get(ref); if (P) return P;
    const [bid, pname] = String(ref).split(':'), bi = this.index.get(bid);
    if (bi == null) return null;
    const m = this.bodies[bi].ports[pname]; if (!m) return null;
    const f = frameOfMatrix(m), out = { bi, name: pname, ref, ...f };
    (this._ports ??= new Map()).set(ref, out);
    void at; return out;
  }
  // 'h' → { jn, part: 'value' }, 'h.slide' → { jn, part: 'slide' }; null when no joint has that coordinate
  coord(key) {
    const memo = (this._coords ??= new Map());
    if (memo.has(key)) return memo.get(key);
    let c = null;
    const jn = this.jointById.get(key);
    if (jn) c = COORDS[jn.kind]?.includes('value') ? { jn, part: 'value', key } : null;
    else {
      const i = String(key).lastIndexOf('.'), base = i > 0 ? this.jointById.get(key.slice(0, i)) : null, part = String(key).slice(i + 1);
      if (base && part !== 'value' && COORDS[base.kind]?.includes(part)) c = { jn: base, part, key };
    }
    memo.set(key, c);
    return c;
  }
  coordValue(jn, part) { if (part !== 'slide') return this.value(jn); const a = this.world(jn.A), b = this.world(jn.B); return dot(sub(b.P, a.P), a[SLIDE_AXIS[jn.kind]]); }
  linear(jn, part) { return part === 'slide' || jn.kind === 'slider'; }
  world(P) { const b = this.bodies[P.bi], r = mv(b.R, P.o); return { P: add(r, b.t), r, X: mv(b.R, P.x), Y: mv(b.R, P.y), Z: mv(b.R, P.z) }; }
  value(jn) {
    const a = this.world(jn.A), b = this.world(jn.B);
    if (ANGULAR.has(jn.kind)) return wrap(Math.atan2(dot(cross(a.X, b.X), a.Z), dot(a.X, b.X)));
    if (jn.kind === 'slider') return dot(sub(b.P, a.P), a.Z);
    return null;
  }
  addW(row, bi, w, k = 1) { const o = this.bodies[bi].off; if (o < 0) return; row[o] += k * w[0]; row[o + 1] += k * w[1]; row[o + 2] += k * w[2]; }
  addV(row, bi, v, k = 1) { const o = this.bodies[bi].off; if (o < 0) return; row[o + 3] += k * v[0]; row[o + 4] += k * v[1]; row[o + 5] += k * v[2]; }
  dU(row, jn, a, b, u) {   // d/dq of (Pb − Pa)·u, u a direction on body A
    const d = sub(b.P, a.P);
    this.addW(row, jn.B.bi, cross(b.r, u)); this.addV(row, jn.B.bi, u);
    this.addW(row, jn.A.bi, add(neg(cross(a.r, u)), cross(u, d))); this.addV(row, jn.A.bi, u, -1);
  }
  valueGrad(jn, row) { const a = this.world(jn.A), b = this.world(jn.B); if (jn.kind === 'slider') this.dU(row, jn, a, b, a.Z); else { this.addW(row, jn.B.bi, a.Z, 1); this.addW(row, jn.A.bi, a.Z, -1); } }
  system(which = 'all') {
    const F = [], J = [], tag = [], n = this.n, row = () => new Array(n).fill(0);
    for (const jn of this.joints) {
      if (!jn.on) continue;
      const a = this.world(jn.A), b = this.world(jn.B), d = sub(b.P, a.P);
      for (const prim of PRIMITIVES[jn.kind]) {
        if (prim === 'point') for (let k = 0; k < 3; k++) { const e = [0, 0, 0]; e[k] = 1; const g = row(); this.addW(g, jn.B.bi, cross(b.r, e)); this.addV(g, jn.B.bi, e); this.addW(g, jn.A.bi, cross(a.r, e), -1); this.addV(g, jn.A.bi, e, -1); F.push(d[k]); J.push(g); tag.push(jn.id); }
        if (prim === 'onAxis' || prim === 'onLineX' || prim === 'inPlane') for (const u of prim === 'onAxis' ? [a.X, a.Y] : prim === 'onLineX' ? [a.Y, a.Z] : [a.Z]) { const g = row(); this.dU(g, jn, a, b, u); F.push(dot(d, u)); J.push(g); tag.push(jn.id); }
        if (prim === 'axis') for (const w of [b.X, b.Y]) { const g = row(); this.addW(g, jn.A.bi, cross(a.Z, w)); this.addW(g, jn.B.bi, cross(w, a.Z)); F.push(dot(a.Z, w)); J.push(g); tag.push(jn.id); }
        if (prim === 'twist') { const g = row(); this.addW(g, jn.A.bi, cross(a.X, b.Y)); this.addW(g, jn.B.bi, cross(b.Y, a.X)); F.push(dot(a.X, b.Y)); J.push(g); tag.push(jn.id); }
      }
    }
    if (which === 'all') {
      for (const [key, target] of this.drives) {
        const c = this.coord(key); if (!c || !c.jn.on) continue;
        const g = row(); this.limitGrad(c.jn, c.part, g); const v = this.coordValue(c.jn, c.part);
        F.push(this.linear(c.jn, c.part) ? v - target : wrap(v - target)); J.push(g); tag.push(`drive ${key}`);
      }
      // a joint held at a limit while a drag pushes past it (see drag): one equation on that value
      for (const [key, c] of this.clamps ?? []) { const g = row(); this.limitGrad(c.jn, c.part, g); F.push(this.limitValue(c.jn, c.part) - c.at); J.push(g); tag.push(`limit ${key}`); }
      for (const c of this.couples) {
        if (!c.on) continue;
        const ja = this.jointById.get(c.a), jb = this.jointById.get(c.b), g = row(), ga = row();
        this.valueGrad(jb, g); this.valueGrad(ja, ga); for (let i = 0; i < n; i++) g[i] -= c.ratio * ga[i];
        // on turned values (unwrapped from the last solved pose): a ratio of 0.6 must not jump when one shaft passes 180°
        const f = this.uvalue(jb) - c.ratio * this.uvalue(ja) - c.offset;
        const linear = (!ANGULAR.has(ja.kind) || ja.unw != null) && (!ANGULAR.has(jb.kind) || jb.unw != null);
        F.push(linear ? f : wrap(f)); J.push(g); tag.push(`couple ${c.id}`);
      }
    }
    return { F, J, tag };
  }
  get pose() { const p = this.bodies.map((b) => ({ R: b.R.map((r) => r.slice()), t: b.t.slice() })); p.unw = this.joints.map((jn) => jn.unw); return p; }
  set pose(p) { p.forEach((q, i) => { this.bodies[i].R = q.R.map((r) => r.slice()); this.bodies[i].t = q.t.slice(); }); if (p.unw) p.unw.forEach((u, i) => { this.joints[i].unw = u; }); }
  // a coupled angular joint's value counted in turns: unwrapped from the value at the last solved pose
  uvalue(jn) { const v = this.value(jn); return ANGULAR.has(jn.kind) && jn.unw != null ? jn.unw + wrap(v - jn.unw) : v; }
  tracked(jn) { return ANGULAR.has(jn.kind) && (!!jn.limits || this.couples.some((c) => c.a === jn.id || c.b === jn.id)); }
  settle() { for (const jn of this.joints) if (this.tracked(jn)) jn.unw = this.uvalue(jn); }
  // ---- limits: [lo, hi] on a joint's value (turned, for an angle) and slideLimits on the slide of a two-valued joint
  limitValue(jn, part) { return part === 'slide' ? this.coordValue(jn, part) : this.uvalue(jn); }
  limitGrad(jn, part, row) {
    if (part === 'slide') { const a = this.world(jn.A), b = this.world(jn.B); this.dU(row, jn, a, b, a[SLIDE_AXIS[jn.kind]]); } else this.valueGrad(jn, row);
  }
  // the limits a pose breaks: [{ id, part, value, bound, side }]
  limitViolations(tol = 1e-7) {
    const out = [];
    for (const jn of this.joints) {
      if (!jn.on) continue;
      for (const [part, L] of [['value', jn.limits], ['slide', SLIDE_AXIS[jn.kind] ? jn.slideLimits : null]]) {
        if (!L) continue;
        const v = this.limitValue(jn, part), [lo, hi] = L;
        if (v < lo - tol) out.push({ id: jn.id, part, value: v, bound: lo, side: 'lo', jn });
        else if (v > hi + tol) out.push({ id: jn.id, part, value: v, bound: hi, side: 'hi', jn });
      }
    }
    return out;
  }
  apply(dx, k = 1) {
    for (const b of this.bodies) {
      if (b.off < 0) continue;
      const w = [dx[b.off] * k, dx[b.off + 1] * k, dx[b.off + 2] * k], v = [dx[b.off + 3] * k, dx[b.off + 4] * k, dx[b.off + 5] * k];
      b.R = orthonormal(mm(expSO3(w), b.R)); b.t = add(b.t, v);
    }
  }
  solve(o = {}) {
    const tol = o.tol ?? 1e-10, maxIter = o.maxIter ?? 80;
    let { F, J } = this.system(o.which || 'all'), r = normInf(F), it = 0;
    for (; it < maxIter && r > tol; it++) {
      const dx = minNormStep(J, F, this.n), p0 = this.pose, f0 = norm2(F);
      let k = 1, ok = false;
      for (let h = 0; h < 14; h++) {
        this.apply(dx, k);
        const s = this.system(o.which || 'all');
        if (norm2(s.F) < f0 * (1 - 1e-4 * k) || normInf(s.F) <= tol) { ({ F, J } = s); ok = true; break; }
        this.pose = p0; k /= 2;
      }
      if (!ok) break;
      r = normInf(F);
    }
    this.iterations = it; this.residual = r;
    // a zero residual on a flipped closure is not a solution (see flips)
    this.flipped = r <= (o.accept ?? 1e-8) ? this.flips() : [];
    const ok = r <= (o.accept ?? 1e-8) && !this.flipped.length;
    if (ok) this.settle();
    return ok;
  }
  // The axis and twist equations are dot products that also vanish for a half turn: z_a · x_b = z_a · y_b = 0 holds
  // for z_b = −z_a, and x_a · y_b = 0 for x_b = −x_a. A joint's ports must meet aligned (z with z, and x with x where
  // the twist is fixed), so a closure that satisfies the equations with a reversed axis is rejected here.
  flips() {
    const out = [];
    for (const jn of this.joints) {
      if (!jn.on) continue;
      const P = PRIMITIVES[jn.kind], a = this.world(jn.A), b = this.world(jn.B);
      if (P.includes('axis') && dot(a.Z, b.Z) < 0) out.push(jn.id);
      else if (P.includes('twist') && dot(a.X, b.X) < 0) out.push(jn.id);
    }
    return out;
  }
  // the starting pose: a spanning tree from the ground (and any other fixed) bodies; each tree joint at its drive,
  // hint, coupled value or seed. Driven, hinted and coupled joints place their bodies first.
  place() {
    const known = new Set(this.bodies.map((b, i) => (b.ground ? i : -1)).filter((i) => i >= 0));
    const seeded = (id) => this.drives.has(id) || this.hints.has(id) || this.couples.some((c) => c.b === id);
    const order = this.joints.slice().sort((p, q) => (seeded(q.id) ? 1 : 0) - (seeded(p.id) ? 1 : 0));
    const startValue = (id, depth = 0) => {
      if (this.drives.has(id)) return this.drives.get(id);
      if (this.hints.has(id)) return this.hints.get(id);
      const c = depth < 8 && this.couples.find((q) => q.b === id);
      if (c) return c.ratio * startValue(c.a, depth + 1) + c.offset;
      return this.seeds.get(id) ?? 0;
    };
    this.tree = new Set(); this.treeEdges = [];
    for (const jn of this.joints) jn.unw = null;
    for (;;) {
      const jn = order.find((q) => known.has(q.A.bi) !== known.has(q.B.bi));
      if (!jn) break;
      const ka = known.has(jn.A.bi), v = startValue(jn.id);
      // a slide given (driven or hinted, 'h.slide') places the body there too
      const sk = coordKey(jn.id, 'slide'), sl = COORDS[jn.kind]?.includes('slide') ? (this.drives.get(sk) ?? this.hints.get(sk) ?? 0) : 0;
      const th = ANGULAR.has(jn.kind) ? v : 0, s = jn.kind === 'slider' ? v : 0, T = rotZ(th);
      const off = jn.kind === 'pinSlot' ? [sl, 0, 0] : [0, 0, jn.kind === 'cylindrical' ? sl : s];
      if (ka) {
        const a = this.world(jn.A), Ra = cols(a.X, a.Y, a.Z), Rb = mm(Ra, T), ob = add(a.P, mv(Ra, off));
        const B = this.bodies[jn.B.bi]; B.R = mm(Rb, tr(cols(jn.B.x, jn.B.y, jn.B.z))); B.t = sub(ob, mv(B.R, jn.B.o)); known.add(jn.B.bi);
      } else {
        const b = this.world(jn.B), Rb = cols(b.X, b.Y, b.Z), Ra = mm(Rb, tr(T)), oa = sub(b.P, mv(Ra, off));
        const A = this.bodies[jn.A.bi]; A.R = mm(Ra, tr(cols(jn.A.x, jn.A.y, jn.A.z))); A.t = sub(oa, mv(A.R, jn.A.o)); known.add(jn.A.bi);
      }
      this.tree.add(jn.id); if (ANGULAR.has(jn.kind)) jn.unw = v;
      this.treeEdges.push({ id: jn.id, parent: ka ? jn.A.bi : jn.B.bi, child: ka ? jn.B.bi : jn.A.bi, childIsB: ka });
    }
    for (const jn of this.joints) if (this.tracked(jn) && jn.unw == null) jn.unw = this.value(jn);
    this.start = this.pose;
  }
  // place and close. A drive far from where the walk puts its loop can leave Gauss–Newton in a local minimum,
  // so a failed direct solve is retried by continuation: close the loops with the drives relaxed and follow the
  // drives to their targets; failing that, start from fallback drive values (the script's own) and follow.
  assemble(fallback = new Map()) {
    this.place();
    if (this.solve({ maxIter: 120 })) return (this.how = 'direct', true);
    const targets = Object.fromEntries(this.drives), saved = new Map(this.drives);
    if (saved.size) {
      this.pose = this.start; this.drives = new Map();
      if (this.solve({ maxIter: 120 }) && this.driveTo(targets)) return (this.how = 'continuation from the relaxed loop', true);
      const alt = new Map([...saved].map(([id, v]) => [id, fallback.has(id) ? fallback.get(id) : 0]));
      if ([...alt].some(([id, v]) => v !== saved.get(id))) {
        this.drives = alt; this.place();
        if (this.solve({ maxIter: 120 }) && this.driveTo(targets)) { this.start = this.pose; return (this.how = 'continuation from the script\'s drive values', true); }
      }
      this.drives = saved; this.place(); this.solve({ maxIter: 120 });
    }
    return (this.how = 'failed', false);
  }
  rank(J) {
    const n = this.n; if (!J.length || !n) return 0;
    const m = Math.max(J.length, n), A = Array.from({ length: m }, (_, i) => (i < J.length ? J[i].slice() : new Array(n).fill(0)));
    const { s } = svd(A, m, n), smax = Math.max(...s, 0);
    return s.filter((v) => v > 1e-8 * Math.max(1, smax)).length;
  }
  analyse() {
    const n = this.n, { J } = this.system('joints');
    const eq = this.joints.filter((jn) => jn.on).reduce((a, jn) => a + jn.c, 0), rk = this.rank(J);
    const all = this.system('all'), rkAll = this.rank(all.J), nd = this.drives.size + this.couples.length;
    const mob = { bodies: this.bodies.filter((b) => !b.ground).length, coords: n, equations: eq, rank: rk, dof: n - rk, kutzbach: n - eq, redundant: eq - rk, drives: nd, rankAll: rkAll, left: n - rkAll };
    const freeOf = (Jx, k) => {
      if (k <= 0) return [];
      const m = Math.max(Jx.length, n), A = Array.from({ length: m }, (_, i) => (i < Jx.length ? Jx[i].slice() : new Array(n).fill(0)));
      const { s, V } = svd(A, m, n);
      return s.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]).slice(0, k).map(([, c]) => this.bodies.filter((b) => !b.ground).map((b) => ({
        body: b.id, w: [V[b.off][c], V[b.off + 1][c], V[b.off + 2][c]], v: [V[b.off + 3][c], V[b.off + 4][c], V[b.off + 5][c]] })));
    };
    mob.free = freeOf(J, mob.dof).map((tw) => tw.map((t) => ({ body: t.body, w: t.w.map((x) => +x.toFixed(9)), v: t.v.map((x) => +x.toFixed(9)) })));
    mob.redundantJoints = [];
    if (mob.redundant > 0) for (const jn of this.joints) {
      if (!jn.on) continue;
      jn.on = false; const r2 = (eq - jn.c) - this.rank(this.system('joints').J); jn.on = true;
      if (r2 < mob.redundant) mob.redundantJoints.push(jn.id);
    }
    return (this.mobility = mob);
  }
  conflictSet() {
    const items = [...this.joints.map((jn) => ({ t: 'joint', id: jn.id })), ...[...this.drives.keys()].map((id) => ({ t: 'drive', id })), ...this.couples.map((c) => ({ t: 'couple', id: c.id }))];
    const saved = new Map(this.drives);
    const set = (S) => {
      const on = new Set(S.map((x) => `${x.t}:${x.id}`));
      for (const jn of this.joints) jn.on = on.has(`joint:${jn.id}`);
      this.drives = new Map([...saved].filter(([id]) => on.has(`drive:${id}`)));
      for (const c of this.couples) c.on = on.has(`couple:${c.id}`);
    };
    const feasible = (S) => { set(S); this.pose = this.start; return this.solve({ maxIter: 60 }); };
    let S = items.slice();
    if (feasible(S)) { set(items); this.drives = saved; return []; }
    for (const x of items) { const T = S.filter((y) => y !== x); if (!feasible(T)) S = T; }
    set(items); this.drives = saved;
    return S.map((x) => (x.t === 'joint' ? x.id : `${x.t} ${x.id}`));
  }
  // move the drives to new values from the current pose in steps of at most 2° (or 1 mm), halving a step that fails
  driveTo(values, o = {}) {
    const maxA = o.maxStep ?? (2 * Math.PI / 180), maxL = o.maxStepMm ?? 1;
    const ids = Object.keys(values).filter((key) => this.coord(key));
    const from = new Map(ids.map((key) => { const c = this.coord(key); return [key, this.drives.has(key) ? this.drives.get(key) : this.coordValue(c.jn, c.part)]; }));
    const setAt = (k) => { for (const id of ids) { const v0 = from.get(id); this.drives.set(id, v0 + (values[id] - v0) * k); } };
    let steps = 1;
    for (const id of ids) { const c = this.coord(id), d = Math.abs(values[id] - from.get(id)); steps = Math.max(steps, Math.ceil(d / (this.linear(c.jn, c.part) ? maxL : maxA))); }
    const go = (k0, k1, depth) => {
      const saved = this.pose; setAt(k1);
      if (this.solve({ maxIter: o.maxIter ?? 80 })) return true;
      this.pose = saved;
      if (depth >= (o.depth ?? 6)) return false;
      const km = (k0 + k1) / 2;
      return go(k0, km, depth + 1) && go(km, k1, depth + 1);
    };
    for (let k = 1; k <= steps; k++) if (!go((k - 1) / steps, k / steps, 0)) { setAt((k - 1) / steps); this.solve(); return false; }
    return true;
  }
  // drag to pose (spec M8, as in sketch drag): move a port's origin toward a target with the drives released and the
  // joints and couplings kept. Least squares with the joint rows weighted, then a minimum-norm solve back onto the
  // joints, so the pose is the closest one the joints allow. → true when the joints hold
  // o.guard (contact sets: { start(T), at(T), room(at, T) }, assembly.js contactGuard) speaks of motions, not poses:
  // a step is walked from its start in pieces, each taken only when its travel fits the clearance where it starts,
  // so no step can carry a part through another however far the target is; this.touched names the pairs that stopped it
  drag(ref, target, o = {}) {
    const P = this.port(ref);
    if (!P) throw new Error(`drag: no port '${ref}'`);
    this.touched = [];
    if (this.bodies[P.bi].ground) return false;
    const saved = this.drives, start = this.pose, w = o.weight ?? 1e3;
    let guard = o.guard ?? null;
    this.drives = new Map(); this.clamps = new Map();
    const dist = () => len(sub(this.world(P).P, target));
    // back onto the joints, inside every limit: a joint that would pass one is held at it from then on (a clamp row)
    const admit = () => {
      for (let round = 0; round < 4; round++) {
        if (!this.solve({ maxIter: 40 })) return false;
        const over = this.limitViolations();
        if (!over.length) return true;
        for (const v of over) this.clamps.set(`${v.id}.${v.part}`, { jn: v.jn, part: v.part, at: v.bound });
      }
      return false;
    };
    // conservative advancement along the step dx·k from p0 (fraction 0) to its end (fraction 1): a piece is kept when
    // the guard finds its travel inside the clearance measured where it starts, else cut to the share that fits.
    // → { t: the fraction reached, touching: the pairs that stopped it }, with the pose left at t
    const walk = (p0, c0, dx, k) => {
      this.pose = p0; this.clamps = new Map(c0);
      let t = 0, at = guard.at(this.transforms()), keep = { pose: p0, clamps: new Map(c0) };
      for (let n = 0; t < 1 && !at.touching.length && n < 64; n++) {
        let t1 = 1, fits = false;
        for (let h = 0; h < 40 && t1 - t > 1e-9; h++) {
          this.pose = p0; this.clamps = new Map(c0); this.apply(dx, k * t1);
          if (!admit()) { t1 = t + (t1 - t) / 2; continue; }
          const room = guard.room(at, this.transforms());
          if (room >= 1) { fits = true; break; }
          t1 = t + (t1 - t) * 0.95 * room;
        }
        if (!fits) break;
        t = t1; keep = { pose: this.pose, clamps: new Map(this.clamps) }; at = guard.at(this.transforms());
      }
      this.pose = keep.pose; this.clamps = keep.clamps;
      return { t, touching: at.touching };
    };
    // a step along the joints' tangent space (least squares, joint rows weighted), then back onto them; a step is
    // kept when the port ends nearer the target (walked by the guard when there is one), else halved
    let ok = admit(), d0 = dist();
    if (ok && guard && !guard.start(this.transforms())) guard = null;   // every pair touches already: nothing to guard
    for (let it = 0; ok && it < (o.iters ?? 40) && d0 > 1e-7; it++) {
      const { F, J } = this.system('all'), p = this.world(P), d = sub(p.P, target);
      const rows = F.map((f) => f * w), Jw = J.map((g) => g.map((x) => x * w));
      for (let k = 0; k < 3; k++) { const e = [0, 0, 0]; e[k] = 1; const g = new Array(this.n).fill(0); this.addW(g, P.bi, cross(p.r, e)); this.addV(g, P.bi, e); Jw.push(g); rows.push(d[k]); }
      const dx = minNormStep(Jw, rows, this.n), p0 = this.pose, c0 = new Map(this.clamps);
      let k = 1, moved = false, stop = null;
      for (let h = 0; h < 10; h++) {
        this.apply(dx, k);
        if (admit() && dist() < d0 - 1e-12) {
          if (!guard) { moved = true; break; }
          const wk = walk(p0, c0, dx, k);
          stop = wk.touching.length ? wk.touching : null;
          if (wk.t > 0 && dist() < d0 - 1e-12) { moved = true; break; }
          if (stop || wk.t === 0) break;   // a shorter step would meet the same contact, or fit no better
        }
        this.pose = p0; this.clamps = new Map(c0); k /= 2;
      }
      if (stop) this.touched = stop;
      if (!moved) { this.pose = p0; this.clamps = new Map(c0); break; }
      const d1 = dist(); if (stop || d0 - d1 < 1e-11) { d0 = d1; break; } d0 = d1;
    }
    this.limited = [...this.clamps.keys()];
    this.drives = saved; this.clamps = null;
    if (!ok) this.pose = start;
    return ok;
  }
  // the coordinates whose values pin this pose: the drives, then every joint's coordinates in order while each adds
  // to the rank. → [{ id: key ('h', 'h.slide'), value, unit, shown }]; this.pinned says whether they pin it whole (a
  // planar or ball joint has no coordinates to carry its pose, and a drag of one is not kept)
  holds() {
    const held = (key) => { const { jn, part } = this.coord(key); return part === 'value' ? this.uvalue(jn) : this.coordValue(jn, part); };
    const saved = this.drives, keys = [...saved.keys()].filter((k) => this.coord(k));
    this.drives = new Map(keys.map((k) => [k, held(k)]));
    let rk = this.rank(this.system('all').J);
    const cands = this.joints.flatMap((jn) => (COORDS[jn.kind] ?? []).map((part) => ({ jn, part, key: coordKey(jn.id, part) })));
    for (const { jn, part, key } of cands) {
      if (rk >= this.n) break;
      if (this.drives.has(key) || (part === 'value' && this.couples.some((c) => c.b === jn.id))) continue;
      this.drives.set(key, held(key));
      const r2 = this.rank(this.system('all').J);
      if (r2 > rk) { rk = r2; keys.push(key); } else this.drives.delete(key);
    }
    this.drives = saved; this.pinned = rk >= this.n;
    return keys.map((key) => { const { jn, part } = this.coord(key), v = held(key), lin = this.linear(jn, part); return { id: key, value: v, unit: lin ? 'mm' : 'deg', shown: lin ? v : v * 180 / Math.PI }; });
  }
  reader() {
    const S = this, ref = (r) => { const P = S.port(r); if (!P) throw new Error(`measure: no port '${r}'`); return S.world(P); };
    const ax = (w, k) => (k === 'z' ? w.Z : k === 'y' ? w.Y : w.X);
    return {
      point: (r, local) => { if (local) { const b = S.bodies[S.index.get(r)]; if (!b) throw new Error(`measure: no component '${r}'`); return add(mv(b.R, local), b.t); } return ref(r).P; },
      axis: (r, which = 'z') => ax(ref(r), which),
      angle: (a, b, which = 'x') => Math.acos(Math.max(-1, Math.min(1, dot(ax(ref(a), which), ax(ref(b), which))))) * 180 / Math.PI,
      distance: (a, b) => len(sub(ref(a).P, ref(b).P)),
      joint: (id) => { const jn = S.jointById.get(id); if (!jn) throw new Error(`measure: no joint '${id}'`); const v = S.value(jn); return jn.kind === 'slider' ? v : v * 180 / Math.PI; },
    };
  }
  read(measures) {
    const m = this.reader(), out = {};
    for (const { name, fn } of measures) { const r = this.calls.run('measure', name, fn, m); out[name] = !r.ok ? null : Array.isArray(r.value) ? r.value.map((x) => +x) : r.value; }
    return out;
  }
  jointValues() {
    return this.joints.map((jn) => {
      const v = this.value(jn), a = this.world(jn.A), b = this.world(jn.B);
      const slide = SLIDE_AXIS[jn.kind] ? dot(sub(b.P, a.P), a[SLIDE_AXIS[jn.kind]]) : null;
      return { id: jn.id, kind: jn.kind, a: jn.A.ref, b: jn.B.ref, equations: jn.c, value: v == null ? null : jn.kind === 'slider' ? v : v * 180 / Math.PI, unit: v == null ? '' : jn.kind === 'slider' ? 'mm' : '°',
        slide, slideAxis: jn.kind === 'pinSlot' ? a.X : null,
        driven: this.drives.has(jn.id), tree: this.tree?.has(jn.id) ?? false, at: a.P, atB: b.P, axis: a.Z };
    });
  }
  transforms() { return this.bodies.map((b) => matrixOfPose(b)); }
  // world frames of the ports the joints use, for the stage's triads
  portFrames() {
    const seen = new Map();
    for (const jn of this.joints) for (const P of [jn.A, jn.B]) if (!seen.has(P.ref)) { const w = this.world(P); seen.set(P.ref, { ref: P.ref, o: w.P, x: w.X, z: w.Z }); }
    return [...seen.values()];
  }
}

// sweep a drive by continuation and record the measures: { rows, keys, events, gaps, jump, extrema }
export function runStudy(S, st, measures, events) {
  const id = st.drive, jn = S.jointById.get(id);
  if (!jn) return { name: st.name, error: `study ${st.name}: no joint '${id}'`, rows: [], keys: [], events: [], gaps: [] };
  const ang = jn.kind !== 'slider', from = st.from, to = st.to, steps = st.steps ?? 360, k2u = ang ? 180 / Math.PI : 1;
  const home = S.pose, homeDrives = new Map(S.drives);
  const rows = [], gaps = [], limited = [];
  if (!S.drives.has(id)) S.drives.set(id, S.value(jn));
  // the start: when continuation cannot reach `from`, driveTo leaves the drive at the last value it reached, so the
  // first row is a gap rather than a pose at some other drive value
  const reached = S.driveTo({ [id]: from });
  let prev = null, jump = null;
  for (let k = 0; k <= steps; k++) {
    const q = from + (to - from) * k / steps, failing = rows.length && !rows[rows.length - 1].ok && !rows[rows.length - 1].limit;
    const solved = k === 0 ? reached && S.solve() : S.driveTo({ [id]: q }, failing ? { depth: 1, maxIter: 25 } : {});
    // a pose past a joint's limit closes, but the machine cannot be there: a gap marked with the joint
    const over = solved ? S.limitViolations() : [];
    const ok = solved && !over.length;
    const row = { x: q * k2u, q, ok };
    if (over.length) { row.limit = [...new Set(over.map((v) => v.id))].join(', '); limited.push({ at: q * k2u, ids: row.limit }); }
    if (ok) Object.assign(row, S.read(measures)); else if (!over.length) gaps.push(q * k2u);
    const now = S.bodies.map((b) => b.t.slice());
    if (prev && ok) {
      row.move = Math.max(...now.map((p, i) => len(sub(p, prev[i]))));
      const med = rows.length > 4 ? rows.slice(-4).map((r) => r.move || 0).sort((a, b) => a - b)[2] : null;
      if (med != null && row.move > 1 && row.move > 8 * Math.max(med, 1e-6) && jump == null) jump = q * k2u;
    }
    rows.push(row); prev = ok ? now : prev;
    if (ok && st.onRow) st.onRow(k, row);
  }
  const evs = [];
  for (const ev of events) {
    const test = (row) => { const r = S.calls.run('event', ev.name, ev.fn, row, `${st.name} at ${+row.x.toFixed(3)}${ang ? '°' : ' mm'}`); return r.ok ? !!r.value : null; };
    for (let k = 1; k < rows.length; k++) {
      const a = rows[k - 1], b = rows[k]; if (!a.ok || !b.ok) continue;
      const ta = test(a), tb = test(b); if (ta == null || tb == null || ta === tb) continue;
      let lo = a.q, hi = b.q;
      S.pose = home; S.drives = new Map(homeDrives); if (!S.drives.has(id)) S.drives.set(id, S.value(jn)); S.driveTo({ [id]: lo });
      for (let h = 0; h < 12; h++) { const mid = (lo + hi) / 2; S.driveTo({ [id]: mid }, { maxStep: 1 }); if (test({ x: mid * k2u, ...S.read(measures) }) === ta) lo = mid; else hi = mid; }
      evs.push({ name: ev.name, at: (lo + hi) / 2 * k2u, rising: !ta && tb });
    }
  }
  S.pose = home; S.drives = homeDrives; S.solve();
  const keys = measures.map((m) => m.name);
  const extremaOf = (name) => {
    const ok = rows.filter((r) => r.ok && typeof r[name] === 'number'); if (!ok.length) return null;
    let lo = ok[0], hi = ok[0]; for (const r of ok) { if (r[name] < lo[name]) lo = r; if (r[name] > hi[name]) hi = r; }
    return { min: { at: lo.x, value: lo[name] }, max: { at: hi.x, value: hi[name] } };
  };
  const extrema = Object.fromEntries(keys.map((k) => [k, extremaOf(k)]));
  return { name: st.name, drive: id, unit: ang ? '°' : 'mm', from: from * k2u, to: to * k2u, steps, rows, keys, events: evs, gaps, limited, jump, extrema };
}
// the helpers a report sees for one study
export function studyApi(st) {
  return { ...st,
    range: (name) => { const e = st.extrema[name]; return e ? e.max.value - e.min.value : null; },
    clearance: (a, b) => st.clearance?.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)) ?? null,
    at: (name, x) => { const r = st.rows.reduce((b, q) => (Math.abs(q.x - x) < Math.abs(b.x - x) ? q : b), st.rows[0]); return r?.[name] ?? null; },
    row: (x) => st.rows.reduce((b, q) => (Math.abs(q.x - x) < Math.abs(b.x - x) ? q : b), st.rows[0]) };
}
