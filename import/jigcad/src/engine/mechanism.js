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
const COUNT = { point: 3, onAxis: 2, inPlane: 1, axis: 2, twist: 1 };
export const PRIMITIVES = {
  rigid: ['point', 'axis', 'twist'], snap: ['point', 'axis', 'twist'], revolute: ['point', 'axis'], slider: ['onAxis', 'axis', 'twist'],
  cylindrical: ['onAxis', 'axis'], planar: ['axis', 'inPlane'], ball: ['point'],
};
export const equationCount = (kind) => (PRIMITIVES[kind] ?? []).reduce((a, p) => a + COUNT[p], 0);
const HAS_VALUE = new Set(['revolute', 'slider', 'cylindrical']);
const ANGULAR = new Set(['revolute', 'cylindrical']);

// spec: { bodies: [{ id, ground, T0 (4×4), ports: { name: 4×4 } }], joints: [{ id, kind, a, b }], drives: Map, hints: Map,
//         couples: [{ id, a, b, ratio, offset }], seeds: Map (start values for undriven tree joints) }
export class MechanismSolver {
  constructor(spec) {
    this.diags = [];
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
      this.joints.push({ id: jn.id, kind: jn.kind, A, B, c: equationCount(jn.kind), on: true, limits: jn.limits ?? null });
    }
    this.jointById = new Map(this.joints.map((jn) => [jn.id, jn]));
    this.drives = new Map([...(spec.drives ?? [])].filter(([id]) => { const jn = this.jointById.get(id); if (jn && !HAS_VALUE.has(jn.kind)) { this.diags.push({ level: 'error', kind: 'asm.drive', at: id, message: `a ${jn.kind} joint has no single value to drive` }); return false; } return !!jn; }));
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
        if (prim === 'onAxis' || prim === 'inPlane') for (const u of prim === 'onAxis' ? [a.X, a.Y] : [a.Z]) { const g = row(); this.dU(g, jn, a, b, u); F.push(dot(d, u)); J.push(g); tag.push(jn.id); }
        if (prim === 'axis') for (const w of [b.X, b.Y]) { const g = row(); this.addW(g, jn.A.bi, cross(a.Z, w)); this.addW(g, jn.B.bi, cross(w, a.Z)); F.push(dot(a.Z, w)); J.push(g); tag.push(jn.id); }
        if (prim === 'twist') { const g = row(); this.addW(g, jn.A.bi, cross(a.X, b.Y)); this.addW(g, jn.B.bi, cross(b.Y, a.X)); F.push(dot(a.X, b.Y)); J.push(g); tag.push(jn.id); }
      }
    }
    if (which === 'all') {
      for (const [id, target] of this.drives) { const jn = this.jointById.get(id); if (!jn.on) continue; const g = row(); this.valueGrad(jn, g); const v = this.value(jn); F.push(jn.kind === 'slider' ? v - target : wrap(v - target)); J.push(g); tag.push(`drive ${id}`); }
      for (const c of this.couples) {
        if (!c.on) continue;
        const ja = this.jointById.get(c.a), jb = this.jointById.get(c.b), g = row(), ga = row();
        this.valueGrad(jb, g); this.valueGrad(ja, ga); for (let i = 0; i < n; i++) g[i] -= c.ratio * ga[i];
        const f = this.value(jb) - c.ratio * this.value(ja) - c.offset;
        F.push(jb.kind === 'slider' && ja.kind === 'slider' ? f : wrap(f)); J.push(g); tag.push(`couple ${c.id}`);
      }
    }
    return { F, J, tag };
  }
  get pose() { return this.bodies.map((b) => ({ R: b.R.map((r) => r.slice()), t: b.t.slice() })); }
  set pose(p) { p.forEach((q, i) => { this.bodies[i].R = q.R.map((r) => r.slice()); this.bodies[i].t = q.t.slice(); }); }
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
    return r <= (o.accept ?? 1e-8);
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
    for (;;) {
      const jn = order.find((q) => known.has(q.A.bi) !== known.has(q.B.bi));
      if (!jn) break;
      const ka = known.has(jn.A.bi), v = startValue(jn.id);
      const th = ANGULAR.has(jn.kind) ? v : 0, s = jn.kind === 'slider' ? v : 0, T = rotZ(th);
      if (ka) {
        const a = this.world(jn.A), Ra = cols(a.X, a.Y, a.Z), Rb = mm(Ra, T), ob = add(a.P, mv(Ra, [0, 0, s]));
        const B = this.bodies[jn.B.bi]; B.R = mm(Rb, tr(cols(jn.B.x, jn.B.y, jn.B.z))); B.t = sub(ob, mv(B.R, jn.B.o)); known.add(jn.B.bi);
      } else {
        const b = this.world(jn.B), Rb = cols(b.X, b.Y, b.Z), Ra = mm(Rb, tr(T)), oa = sub(b.P, mv(Ra, [0, 0, s]));
        const A = this.bodies[jn.A.bi]; A.R = mm(Ra, tr(cols(jn.A.x, jn.A.y, jn.A.z))); A.t = sub(oa, mv(A.R, jn.A.o)); known.add(jn.A.bi);
      }
      this.tree.add(jn.id);
      this.treeEdges.push({ id: jn.id, parent: ka ? jn.A.bi : jn.B.bi, child: ka ? jn.B.bi : jn.A.bi, childIsB: ka });
    }
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
    const ids = Object.keys(values).filter((id) => this.jointById.has(id));
    const from = new Map(ids.map((id) => [id, this.drives.has(id) ? this.drives.get(id) : this.value(this.jointById.get(id))]));
    const setAt = (k) => { for (const id of ids) { const v0 = from.get(id); this.drives.set(id, v0 + (values[id] - v0) * k); } };
    let steps = 1;
    for (const id of ids) { const jn = this.jointById.get(id), d = Math.abs(values[id] - from.get(id)); steps = Math.max(steps, Math.ceil(d / (jn.kind === 'slider' ? maxL : maxA))); }
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
    for (const { name, fn } of measures) { try { const v = fn(m); out[name] = Array.isArray(v) ? v.map((x) => +x) : v; } catch (e) { out[name] = null; this.measureError = e.message; } }
    return out;
  }
  jointValues() {
    return this.joints.map((jn) => {
      const v = this.value(jn), a = this.world(jn.A), b = this.world(jn.B);
      return { id: jn.id, kind: jn.kind, a: jn.A.ref, b: jn.B.ref, equations: jn.c, value: v == null ? null : jn.kind === 'slider' ? v : v * 180 / Math.PI, unit: v == null ? '' : jn.kind === 'slider' ? 'mm' : '°',
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
  const rows = [], gaps = [];
  if (!S.drives.has(id)) S.drives.set(id, S.value(jn));
  S.driveTo({ [id]: from });
  let prev = null, jump = null;
  for (let k = 0; k <= steps; k++) {
    const q = from + (to - from) * k / steps, failing = rows.length && !rows[rows.length - 1].ok;
    const ok = k === 0 ? S.solve() : S.driveTo({ [id]: q }, failing ? { depth: 1, maxIter: 25 } : {});
    const row = { x: q * k2u, q, ok };
    if (ok) Object.assign(row, S.read(measures)); else gaps.push(q * k2u);
    const now = S.bodies.map((b) => b.t.slice());
    if (prev && ok) {
      row.move = Math.max(...now.map((p, i) => len(sub(p, prev[i]))));
      const med = rows.length > 4 ? rows.slice(-4).map((r) => r.move || 0).sort((a, b) => a - b)[2] : null;
      if (med != null && row.move > 1 && row.move > 8 * Math.max(med, 1e-6) && jump == null) jump = q * k2u;
    }
    rows.push(row); prev = ok ? now : prev;
  }
  const evs = [];
  for (const ev of events) {
    const test = (row) => { try { return !!ev.fn(row); } catch { return null; } };
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
  return { name: st.name, drive: id, unit: ang ? '°' : 'mm', from: from * k2u, to: to * k2u, steps, rows, keys, events: evs, gaps, jump, extrema };
}
// the helpers a report sees for one study
export function studyApi(st) {
  return { ...st,
    range: (name) => { const e = st.extrema[name]; return e ? e.max.value - e.min.value : null; },
    at: (name, x) => { const r = st.rows.reduce((b, q) => (Math.abs(q.x - x) < Math.abs(b.x - x) ? q : b), st.rows[0]); return r?.[name] ?? null; },
    row: (x) => st.rows.reduce((b, q) => (Math.abs(q.x - x) < Math.abs(b.x - x) ? q : b), st.rows[0]) };
}
