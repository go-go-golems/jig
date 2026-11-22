// Forces in a mechanism (assemblies spec v0.2, layer 5): masses from the parts, accelerations from the poses a
// study solves, and the joint reactions from the same Jacobian the pose solver uses.
//
// Each moving body carries the solver's six coordinates (a small rotation ω about its origin t, a translation v).
// The joint equations g(q) = 0 have the Jacobian J, and the forces the joints exert are Jᵀλ: one multiplier per
// equation (a force for a point or on-axis row, a moment for an axis or twist row, the driving torque for a drive
// row, the mesh torque for a coupling). In d'Alembert's form every body is in equilibrium under its applied
// forces, its weight and its inertia (−m a_c, −(I α + ω × I ω)), so
//     Jᵀ λ = −Q,   Q the generalised applied, gravity and inertia forces (moment about t, then force),
// solved for the least λ: where joint equations repeat (r > 0), the split among them is not fixed by statics, and
// the least one is reported as such. Velocities and accelerations come from poses solved a step either side of
// each sample, at a constant drive rate.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mv = (R, p) => [dot(R[0], p), dot(R[1], p), dot(R[2], p)];
const tr = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

// mass properties of a closed triangle mesh (divergence theorem over tetrahedra from the origin), density in t/mm³:
// { mass (t), volume (mm³), c (centre of mass), I (3×3 about c, t·mm²) }
export function massProps(meshes, density) {
  let V = 0; const s1 = [0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { positions: P, indices: T } of meshes) for (let t = 0; t < T.length; t += 3) {
    const a = [P[3 * T[t]], P[3 * T[t] + 1], P[3 * T[t] + 2]], b = [P[3 * T[t + 1]], P[3 * T[t + 1] + 1], P[3 * T[t + 1] + 2]], c = [P[3 * T[t + 2]], P[3 * T[t + 2] + 1], P[3 * T[t + 2] + 2]];
    const v = dot(a, cross(b, c)) / 6, s = add(add(a, b), c);
    V += v; for (let k = 0; k < 3; k++) s1[k] += v * s[k] / 4;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += v / 20 * (a[i] * a[j] + b[i] * b[j] + c[i] * c[j] + s[i] * s[j]);
  }
  const sign = V < 0 ? -1 : 1;
  V *= sign; for (let k = 0; k < 3; k++) s1[k] *= sign; for (const r of C) for (let k = 0; k < 3; k++) r[k] *= sign;
  const cm = V > 0 ? s1.map((x) => x / V) : [0, 0, 0], m = density * V;
  const tc = C[0][0] + C[1][1] + C[2][2];
  // inertia about the origin, then about the centre of mass
  const I = [0, 1, 2].map((i) => [0, 1, 2].map((j) => density * ((i === j ? tc : 0) - C[i][j]) - m * ((i === j ? dot(cm, cm) : 0) - cm[i] * cm[j])));
  return { mass: m, volume: V, c: cm, I };
}

// the rotation vector of a rotation matrix (log map)
function logSO3(R) {
  const c = Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2)), th = Math.acos(c);
  const w = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
  if (th < 1e-9) return mul(w, 0.5);
  return mul(w, th / (2 * Math.sin(th)));
}

// Kinematics at the solver's pose: drive `id` at its current value, at `rate` (rad/s, or mm/s for a slider), by
// poses solved h either side. → per body index: { c (world centre), v, a, w (ω), al (α), R, t }
export function kinematics(S, id, rate, masses, h) {
  const jn = S.jointById.get(id);
  const home = S.pose, drives = new Map(S.drives), q0 = S.drives.get(id);
  const step = h ?? (jn.kind === 'slider' ? 0.05 : 0.25 * Math.PI / 180);
  const at = (q) => { S.pose = home; S.drives = new Map(drives); const ok = S.driveTo({ [id]: q }, { maxIter: 60 }); const p = S.pose; return ok ? p : null; };
  const pp = at(q0 + step), pm = at(q0 - step);
  S.pose = home; S.drives = drives;
  if (!pp || !pm) return null;
  const out = [];
  S.bodies.forEach((b, i) => {
    const cl = masses.get(i)?.c ?? [0, 0, 0];
    const R0 = home[i].R, cw = (p) => add(mv(p[i].R, cl), p[i].t);
    if (b.ground) { out.push({ c: cw(home), v: [0, 0, 0], a: [0, 0, 0], w: [0, 0, 0], al: [0, 0, 0], R: R0, t: home[i].t }); return; }
    const c0 = cw(home), cp = cw(pp), cmn = cw(pm);
    const fp = logSO3(mm(pp[i].R, tr(R0))), fm = logSO3(mm(pm[i].R, tr(R0)));
    out.push({
      c: c0, R: R0, t: home[i].t,
      v: mul(sub(cp, cmn), rate / (2 * step)),
      a: mul(add(sub(cp, mul(c0, 2)), cmn), rate * rate / (step * step)),
      w: mul(sub(fp, fm), rate / (2 * step)),
      al: mul(add(fp, fm), rate * rate / (step * step)),
    });
  });
  return out;
}

// λ = argmin ‖λ‖ with Jᵀλ = b, by the regularised normal equations (J Jᵀ + μI) λ = J b; → { lambda, residual }
function multipliers(J, b, n) {
  const m = J.length, A = Array.from({ length: m }, () => new Array(m).fill(0)), rhs = new Array(m).fill(0);
  let trc = 0;
  for (let i = 0; i < m; i++) {
    for (let k = 0; k <= i; k++) { let t = 0; for (let j = 0; j < n; j++) t += J[i][j] * J[k][j]; A[i][k] = A[k][i] = t; if (i === k) trc += t; }
    for (let j = 0; j < n; j++) rhs[i] += J[i][j] * b[j];
  }
  const mu = 1e-12 * (trc / Math.max(1, m)) + 1e-30;
  for (let i = 0; i < m; i++) A[i][i] += mu;
  const L = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let i = 0; i < m; i++) for (let k = 0; k <= i; k++) { let t = A[i][k]; for (let j = 0; j < k; j++) t -= L[i][j] * L[k][j]; if (i === k) L[i][i] = Math.sqrt(Math.max(t, mu)); else L[i][k] = t / L[k][k]; }
  const y = new Array(m).fill(0);
  for (let i = 0; i < m; i++) { let t = rhs[i]; for (let j = 0; j < i; j++) t -= L[i][j] * y[j]; y[i] = t / L[i][i]; }
  for (let i = m - 1; i >= 0; i--) { let t = y[i]; for (let j = i + 1; j < m; j++) t -= L[j][i] * y[j]; y[i] = t / L[i][i]; }
  const r = b.slice(); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) r[j] -= J[i][j] * y[i];
  const bn = Math.sqrt(b.reduce((s, x) => s + x * x, 0)) || 1;
  return { lambda: y, residual: Math.sqrt(r.reduce((s, x) => s + x * x, 0)) / bn };
}

// Joint reactions at the solver's current pose.
// ctx: { masses: Map body index → { mass, c, I } (body frame), kin (kinematics(…) or null for statics),
//        gravity: [mm/s²], wrenches: [{ bi, point (body frame), force (world), moment (world) }] }
// → { joints: { id: { F, M, at, A: { F, M } } }, drives: { id: torque }, couples: { id: λ }, residual }
// F, M: the force the joint exerts on its b side and the moment about its b port's origin (world, N and N·mm);
// A: the same on its a side about the same point.
export function reactions(S, ctx) {
  const n = S.n, Q = new Array(n).fill(0);
  S.bodies.forEach((b, i) => {
    if (b.ground) return;
    const o = b.off, mp = ctx.masses.get(i), k = ctx.kin?.[i];
    let F = [0, 0, 0], Mt = [0, 0, 0];
    if (mp && mp.mass > 0) {
      const R = b.R, c = add(mv(R, mp.c), b.t);
      const Iw = mm(mm(R, mp.I), tr(R));
      const a = k?.a ?? [0, 0, 0], w = k?.w ?? [0, 0, 0], al = k?.al ?? [0, 0, 0];
      const f = mul(sub(ctx.gravity ?? [0, 0, 0], a), mp.mass);                       // weight and inertia at c
      const Mc = mul(add(mv(Iw, al), cross(w, mv(Iw, w))), -1);                      // −(I α + ω × I ω)
      F = add(F, f); Mt = add(Mt, add(cross(sub(c, b.t), f), Mc));
    }
    for (const x of ctx.wrenches ?? []) if (x.bi === i) {
      const p = add(mv(b.R, x.point), b.t);
      F = add(F, x.force ?? [0, 0, 0]); Mt = add(Mt, add(cross(sub(p, b.t), x.force ?? [0, 0, 0]), x.moment ?? [0, 0, 0]));
    }
    for (let d = 0; d < 3; d++) { Q[o + d] = Mt[d]; Q[o + 3 + d] = F[d]; }
  });
  const { J, tag } = S.system('all');
  const { lambda, residual } = multipliers(J, Q.map((x) => -x), n);
  // generalised constraint force of each joint (its rows; its drive; its share of each coupling)
  const G = new Map(), put = (id, row, k) => { const g = G.get(id) ?? new Array(n).fill(0); for (let j = 0; j < n; j++) g[j] += k * row[j]; G.set(id, g); };
  const drives = {}, couples = {};
  tag.forEach((t, r) => {
    const l = lambda[r];
    if (t.startsWith('drive ')) { const id = t.slice(6); drives[id] = l; put(id, J[r], l); return; }
    if (t.startsWith('couple ')) {
      const c = S.couples.find((x) => x.id === t.slice(7)); couples[c.id] = l;
      const ja = S.jointById.get(c.a), jb = S.jointById.get(c.b), ga = new Array(n).fill(0), gb = new Array(n).fill(0);
      S.valueGrad(ja, ga); S.valueGrad(jb, gb); put(jb.id, gb, l); put(ja.id, ga, -c.ratio * l);
      return;
    }
    put(t, J[r], l);
  });
  const side = (g, bi, P) => {
    const b = S.bodies[bi]; if (b.ground) return null;
    const o = b.off, Mt = [g[o], g[o + 1], g[o + 2]], F = [g[o + 3], g[o + 4], g[o + 5]];
    return { F, M: sub(Mt, cross(sub(P, b.t), F)) };
  };
  const joints = {};
  for (const jn of S.joints) {
    const g = G.get(jn.id) ?? new Array(n).fill(0), P = S.world(jn.B).P;
    let B = side(g, jn.B.bi, P), A = side(g, jn.A.bi, P);
    if (!B && A) B = { F: mul(A.F, -1), M: mul(A.M, -1) };
    if (!A && B) A = { F: mul(B.F, -1), M: mul(B.M, -1) };
    joints[jn.id] = { F: B?.F ?? [0, 0, 0], M: B?.M ?? [0, 0, 0], at: P, A: A ?? { F: [0, 0, 0], M: [0, 0, 0] } };
  }
  return { joints, drives, couples, residual };
}

export const magnitude = norm;
