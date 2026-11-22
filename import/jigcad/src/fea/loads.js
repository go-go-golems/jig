// Loads as nodal forces, and supports as node sets, on a C3D10 mesh (tetmesh.quadratic's output).
//
// Units: mm, N, MPa, s; density in t/mm³ (g/cm³ × 1e-9), accelerations in mm/s². CalculiX is given nodal forces
// only, so what is applied is exactly their sum, and the balance check compares it with the reactions.
//
// A 6-node face with straight edges under a uniform traction t carries nothing at its corners and t·A/3 at each
// middle node; the same weights carry a distributed force or moment (a port's wrench) over a set of faces.
import { RULE3, naturalOf, shape } from './tet10.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const at = (X, i) => [X[3 * i], X[3 * i + 1], X[3 * i + 2]];

// the boundary faces carrying any of the markers, with area, outward unit normal and centre
export function facesOf(mesh, markers) {
  const want = new Set(markers), out = [];
  for (let f = 0; f < mesh.fmarks.length; f++) {
    if (!want.has(mesh.fmarks[f])) continue;
    const n6 = Array.from(mesh.faces.subarray(6 * f, 6 * f + 6));
    const a = at(mesh.nodes, n6[0]), b = at(mesh.nodes, n6[1]), c = at(mesh.nodes, n6[2]);
    const nr = cross(sub(b, a), sub(c, a)), A = norm(nr) / 2;
    out.push({ f, n6, area: A, normal: nr.map((x) => x / (2 * A || 1)), centre: [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3) });
  }
  return out;
}

// every node of the faces (corners and middles), sorted
export const nodesOf = (faces) => [...new Set(faces.flatMap((x) => x.n6))].sort((a, b) => a - b);

// nodal weights of a face set: A/3 on each middle node (the consistent load of a uniform traction)
export function weightsOf(faces) {
  const w = new Map();
  for (const x of faces) for (let k = 3; k < 6; k++) w.set(x.n6[k], (w.get(x.n6[k]) ?? 0) + x.area / 3);
  return w;
}
export const areaOf = (faces) => faces.reduce((s, x) => s + x.area, 0);

// a total force spread as a uniform traction over the faces
export function addForce(F, faces, force) {
  const A = areaOf(faces); if (!(A > 0)) throw new Error('force on faces with no area');
  for (const [n, w] of weightsOf(faces)) for (let k = 0; k < 3; k++) F[3 * n + k] += force[k] * w / A;
}
// a pressure (MPa), positive into the surface
export function addPressure(F, faces, p) {
  for (const x of faces) for (let k = 3; k < 6; k++) { const n = x.n6[k]; for (let d = 0; d < 3; d++) F[3 * n + d] -= p * x.normal[d] * x.area / 3; }
}

// A wrench (force F and moment M about the point P) over the faces, the way a distributing coupling carries it:
// with nodal weights w_i around their centroid c, f_i = w_i F / W + w_i (I⁻¹ M_c) × (x_i − c), where M_c is the
// moment about c and I = Σ w_i (|r_i|² 1 − r_i r_iᵀ). Σ f_i = F and Σ r_i × f_i = M_c exactly.
// mode 'bearing' (a pin in a bore, a shaft in a bearing): the force goes to the side the face is pushed on, each
// weight times max(0, −n·F̂); the moment still goes by the plain weights.
export function addWrench(F, mesh, faces, { force = [0, 0, 0], moment = [0, 0, 0], point, mode = 'uniform' } = {}) {
  const w0 = weightsOf(faces), nodes = [...w0.keys()];
  if (!nodes.length) throw new Error('wrench on no faces');
  const X = nodes.map((n) => at(mesh.nodes, n));
  const W = nodes.reduce((s, n) => s + w0.get(n), 0);
  const c = [0, 1, 2].map((k) => nodes.reduce((s, n, i) => s + w0.get(n) * X[i][k], 0) / W);
  const P = point ?? c, Mc = [0, 1, 2].map((k) => moment[k] + cross(sub(P, c), force)[k]);
  // the force part
  const Fn = norm(force);
  let wf = w0;
  if (mode === 'bearing' && Fn > 0) {
    const u = force.map((x) => x / Fn), nodeN = new Map();
    for (const x of faces) for (let k = 3; k < 6; k++) { const v = nodeN.get(x.n6[k]) ?? [0, 0, 0]; nodeN.set(x.n6[k], v.map((y, d) => y + x.normal[d] * x.area)); }
    wf = new Map(nodes.map((n) => { const nv = nodeN.get(n), l = norm(nv) || 1; return [n, w0.get(n) * Math.max(0, -dot(nv, u) / l)]; }));
    const Wb = [...wf.values()].reduce((s, v) => s + v, 0);
    if (!(Wb > 0)) wf = w0;
  }
  const Wf = [...wf.values()].reduce((s, v) => s + v, 0);
  // the force on the bearing side has its own centroid: the moment it makes about c is taken back out of Mc
  const cf = [0, 1, 2].map((k) => nodes.reduce((s, n, i) => s + wf.get(n) * X[i][k], 0) / Wf);
  const Mrest = sub(Mc, cross(sub(cf, c), force));
  for (const [i, n] of nodes.entries()) for (let k = 0; k < 3; k++) F[3 * n + k] += force[k] * wf.get(n) / Wf;
  // the moment part, by the plain weights
  const I = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  nodes.forEach((n, i) => { const r = sub(X[i], c), w = w0.get(n), r2 = dot(r, r); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) I[a][b] += w * ((a === b ? r2 : 0) - r[a] * r[b]); });
  const phi = solve3(I, Mrest);
  nodes.forEach((n, i) => { const r = sub(X[i], c), f = cross(phi, r), w = w0.get(n); for (let k = 0; k < 3; k++) F[3 * n + k] += w * f[k]; });
  return { centroid: c, weight: W, bearing: mode === 'bearing' && wf !== w0 };
}

// 3×3 solve with a pseudo-inverse fallback (nodes on a line carry no moment about it)
function solve3(M, b) {
  const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const scale = Math.max(...M.flat().map(Math.abs), 1e-300);
  if (Math.abs(det) > 1e-12 * scale ** 3) {
    const inv = [
      [(M[1][1] * M[2][2] - M[1][2] * M[2][1]) / det, (M[0][2] * M[2][1] - M[0][1] * M[2][2]) / det, (M[0][1] * M[1][2] - M[0][2] * M[1][1]) / det],
      [(M[1][2] * M[2][0] - M[1][0] * M[2][2]) / det, (M[0][0] * M[2][2] - M[0][2] * M[2][0]) / det, (M[0][2] * M[1][0] - M[0][0] * M[1][2]) / det],
      [(M[1][0] * M[2][1] - M[1][1] * M[2][0]) / det, (M[0][1] * M[2][0] - M[0][0] * M[2][1]) / det, (M[0][0] * M[1][1] - M[0][1] * M[1][0]) / det]];
    return inv.map((r) => dot(r, b));
  }
  // symmetric: Jacobi eigen-decomposition, invert the non-zero eigenvalues
  const { vals, vecs } = eig3(M);
  const out = [0, 0, 0], vmax = Math.max(...vals.map(Math.abs));
  for (let k = 0; k < 3; k++) if (Math.abs(vals[k]) > 1e-9 * vmax) { const v = vecs.map((r) => r[k]), c = dot(v, b) / vals[k]; for (let d = 0; d < 3; d++) out[d] += c * v[d]; }
  return out;
}
export function eig3(M) {
  const a = M.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let s = 0; s < 50; s++) {
    let p = 0, q = 1; for (const [i, j] of [[0, 2], [1, 2]]) if (Math.abs(a[i][j]) > Math.abs(a[p][q])) { p = i; q = j; }
    if (Math.abs(a[p][q]) < 1e-15 * (Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]) + 1e-300)) break;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
    for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - sn * y; a[k][q] = sn * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - sn * y; a[q][k] = sn * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - sn * y; v[k][q] = sn * x + c * y; }
  }
  return { vals: [a[0][0], a[1][1], a[2][2]], vecs: v };
}

// A body force per volume b(x) = ρ (g − a(x)), a(x) = a0 + α × (x − c) + ω × (ω × (x − c)) (a rigid body's
// acceleration field: d'Alembert's inertial force with gravity), integrated with a degree-3 rule:
// f_i = ∫ N_i b dV. body: { rho, g, a0, alpha, omega, c } (any may be left out). → the total force added
export function addBody(F, mesh, body) {
  const rho = body.rho ?? 0, g = body.g ?? [0, 0, 0], a0 = body.a0 ?? [0, 0, 0], al = body.alpha ?? [0, 0, 0], om = body.omega ?? [0, 0, 0], c = body.c ?? [0, 0, 0];
  const field = (x) => { const r = sub(x, c), a = [0, 1, 2].map((k) => a0[k] + cross(al, r)[k] + cross(om, cross(om, r))[k]); return [0, 1, 2].map((k) => rho * (g[k] - a[k])); };
  const T = mesh.tets, X = mesh.nodes, ne = T.length / 10, total = [0, 0, 0];
  const pts = RULE3.map((q) => ({ w: q.w, N: shape(...naturalOf(q.L)).N }));
  for (let e = 0; e < ne; e++) {
    const n = Array.from(T.subarray(10 * e, 10 * e + 10)), P = n.map((i) => at(X, i));
    const v = Math.abs(dot(sub(P[1], P[0]), cross(sub(P[2], P[0]), sub(P[3], P[0])))) / 6;
    for (const q of pts) {
      const x = [0, 1, 2].map((k) => q.N.reduce((s, Ni, i) => s + Ni * P[i][k], 0)), b = field(x);
      for (let i = 0; i < 10; i++) for (let k = 0; k < 3; k++) { const f = q.w * v * q.N[i] * b[k]; F[3 * n[i] + k] += f; total[k] += f; }
    }
  }
  return total;
}

// a node's outward normal on a face set (area-weighted), for rollers
export function nodeNormals(faces) {
  const m = new Map();
  for (const x of faces) for (const n of x.n6) { const v = m.get(n) ?? [0, 0, 0]; m.set(n, v.map((y, d) => y + x.normal[d] * x.area)); }
  for (const [n, v] of m) { const l = norm(v) || 1; m.set(n, v.map((y) => y / l)); }
  return m;
}
