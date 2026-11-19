// A reference solver for the same linear static problem the CalculiX deck states, in plain JavaScript: C3D10
// stiffness with CalculiX's 4-point rule (exact for straight-sided elements), assembled in 3×3 node blocks,
// solved by conjugate gradients with a block-Jacobi preconditioner. Its output has the .dat's shape (deck.readDat),
// so the post-processing cannot tell the two apart. It is the fallback when no CalculiX module is present, and the
// second opinion the tests hold CalculiX to.
import { IP4, W4, shape, jacobian, globalDerivatives } from './tet10.js';

const SHAPES = IP4.map(([x, y, z]) => shape(x, y, z));

function elasticity(E, nu) {
  const l = E * nu / ((1 + nu) * (1 - 2 * nu)), m = E / (2 * (1 + nu));
  return [[l + 2 * m, l, l, 0, 0, 0], [l, l + 2 * m, l, 0, 0, 0], [l, l, l + 2 * m, 0, 0, 0], [0, 0, 0, m, 0, 0], [0, 0, 0, 0, m, 0], [0, 0, 0, 0, 0, m]];
}
// strain–displacement rows at a point: Voigt εxx εyy εzz γxy γxz γyz (CalculiX's stress order sxy sxz syz)
function bMatrix(G) {
  const B = Array.from({ length: 6 }, () => new Float64Array(30));
  for (let n = 0; n < 10; n++) {
    const x = G[0][n], y = G[1][n], z = G[2][n], c = 3 * n;
    B[0][c] = x; B[1][c + 1] = y; B[2][c + 2] = z;
    B[3][c] = y; B[3][c + 1] = x;
    B[4][c] = z; B[4][c + 2] = x;
    B[5][c + 1] = z; B[5][c + 2] = y;
  }
  return B;
}
const coords = (X, T, e) => Array.from({ length: 10 }, (_, i) => { const n = T[10 * e + i]; return [X[3 * n], X[3 * n + 1], X[3 * n + 2]]; });

// → { U, S, RF } as deck.readDat gives them; o: { tol, maxIter }
export function solveStatic({ mesh, material, fixed = [], rollers = [], forces }, o = {}) {
  const X = mesh.nodes, T = mesh.tets, nn = X.length / 3, ne = T.length / 10, D = elasticity(material.E, material.nu);
  // sparsity: node adjacency through the elements
  const adj = Array.from({ length: nn }, () => new Set());
  for (let e = 0; e < ne; e++) for (let a = 0; a < 10; a++) { const na = T[10 * e + a]; for (let b = 0; b < 10; b++) adj[na].add(T[10 * e + b]); }
  const start = new Int32Array(nn + 1);
  for (let i = 0; i < nn; i++) start[i + 1] = start[i] + adj[i].size;
  const cols = new Int32Array(start[nn]);
  for (let i = 0; i < nn; i++) { const s = [...adj[i]].sort((p, q) => p - q); cols.set(s, start[i]); }
  adj.length = 0;
  const vals = new Float64Array(9 * cols.length);
  const find = (i, j) => { let lo = start[i], hi = start[i + 1] - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (cols[mid] < j) lo = mid + 1; else if (cols[mid] > j) hi = mid - 1; else return mid; } throw new Error('sparsity'); };
  const Bs = new Array(ne);   // B and det·w per element and point, kept for the stresses
  for (let e = 0; e < ne; e++) {
    const P = coords(X, T, e), Ke = new Float64Array(900), per = [];
    for (const sh of SHAPES) {
      const { det, inv } = jacobian(P, sh.dN);
      if (!(det > 0)) throw new Error(`element ${e + 1} is inverted (det ${det.toExponential(2)})`);
      const B = bMatrix(globalDerivatives(sh.dN, inv)), w = det * W4;
      per.push(B);
      const DB = D.map((r) => { const out = new Float64Array(30); for (let k = 0; k < 6; k++) if (r[k]) for (let c = 0; c < 30; c++) out[c] += r[k] * B[k][c]; return out; });
      for (let a = 0; a < 30; a++) for (let k = 0; k < 6; k++) { const bka = B[k][a]; if (bka) { const row = DB[k]; for (let c = 0; c < 30; c++) Ke[30 * a + c] += w * bka * row[c]; } }
    }
    Bs[e] = per;
    for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
      const p = 9 * find(T[10 * e + a], T[10 * e + b]);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) vals[p + 3 * r + c] += Ke[30 * (3 * a + r) + 3 * b + c];
    }
  }
  const Kmul = (x, y) => {
    for (let i = 0; i < nn; i++) {
      let y0 = 0, y1 = 0, y2 = 0;
      for (let p = start[i]; p < start[i + 1]; p++) { const j = 3 * cols[p], v = 9 * p, a = x[j], b = x[j + 1], c = x[j + 2]; y0 += vals[v] * a + vals[v + 1] * b + vals[v + 2] * c; y1 += vals[v + 3] * a + vals[v + 4] * b + vals[v + 5] * c; y2 += vals[v + 6] * a + vals[v + 7] * b + vals[v + 8] * c; }
      y[3 * i] = y0; y[3 * i + 1] = y1; y[3 * i + 2] = y2;
    }
  };
  // supports: fixed dofs are projected out of the iteration; a roller holds a node along its normal (a projector
  // P = 1 − n nᵀ applied to the node's update, so the iteration lives in the space the supports allow)
  const held = new Map();   // node → array of unit directions held
  for (const s of fixed) for (const n of s.nodes) held.set(n, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  for (const r of rollers) for (const n of r.nodes) if (!held.has(n) || held.get(n).length < 3) held.set(n, [...(held.get(n) ?? []), r.normals.get(n)]);
  // orthonormalise each node's held directions
  for (const [n, ds] of held) {
    const ob = [];
    for (const d of ds) { let v = d.slice(); for (const u of ob) { const k = v[0] * u[0] + v[1] * u[1] + v[2] * u[2]; v = v.map((x, i) => x - k * u[i]); } const l = Math.hypot(...v); if (l > 1e-9) ob.push(v.map((x) => x / l)); }
    held.set(n, ob);
  }
  const project = (v) => { for (const [n, ds] of held) for (const u of ds) { const k = v[3 * n] * u[0] + v[3 * n + 1] * u[1] + v[3 * n + 2] * u[2]; v[3 * n] -= k * u[0]; v[3 * n + 1] -= k * u[1]; v[3 * n + 2] -= k * u[2]; } };
  // block-Jacobi preconditioner on the projected diagonal blocks
  const Minv = new Float64Array(9 * nn);
  for (let i = 0; i < nn; i++) {
    const p = 9 * find(i, i), M = [0, 1, 2].map((r) => [0, 1, 2].map((c) => vals[p + 3 * r + c]));
    const inv = invert3(M);
    Minv.set(inv.flat(), 9 * i);
  }
  const N = 3 * nn, f = Float64Array.from(forces), u = new Float64Array(N), r = Float64Array.from(f), z = new Float64Array(N), q = new Float64Array(N);
  project(r);
  const prec = (src, dst) => { for (let i = 0; i < nn; i++) { const m = 9 * i, a = src[3 * i], b = src[3 * i + 1], c = src[3 * i + 2]; dst[3 * i] = Minv[m] * a + Minv[m + 1] * b + Minv[m + 2] * c; dst[3 * i + 1] = Minv[m + 3] * a + Minv[m + 4] * b + Minv[m + 5] * c; dst[3 * i + 2] = Minv[m + 6] * a + Minv[m + 7] * b + Minv[m + 8] * c; } project(dst); };
  prec(r, z);
  const p = Float64Array.from(z);
  let rz = dot(r, z);
  const f2 = Math.sqrt(dot(r, r)) || 1, tol = o.tol ?? 1e-10, maxIter = o.maxIter ?? Math.max(2000, 4 * N);
  let it = 0;
  for (; it < maxIter; it++) {
    Kmul(p, q); project(q);
    const alpha = rz / dot(p, q);
    for (let i = 0; i < N; i++) { u[i] += alpha * p[i]; r[i] -= alpha * q[i]; }
    if (Math.sqrt(dot(r, r)) <= tol * f2) break;
    prec(r, z);
    const rz2 = dot(r, z), beta = rz2 / rz; rz = rz2;
    for (let i = 0; i < N; i++) p[i] = z[i] + beta * p[i];
  }
  if (it >= maxIter) throw new Error(`the iterative solver did not converge in ${maxIter} iterations`);
  // stresses at the integration points; reactions K u − f at the held nodes
  const S = new Float64Array(24 * ne);
  for (let e = 0; e < ne; e++) {
    const ue = new Float64Array(30); for (let a = 0; a < 10; a++) { const n = T[10 * e + a]; ue[3 * a] = u[3 * n]; ue[3 * a + 1] = u[3 * n + 1]; ue[3 * a + 2] = u[3 * n + 2]; }
    Bs[e].forEach((B, k) => { const eps = B.map((row) => row.reduce((s, b, c) => s + b * ue[c], 0)); for (let i = 0; i < 6; i++) S[24 * e + 6 * k + i] = D[i].reduce((s, d, j) => s + d * eps[j], 0); });
  }
  const Ku = new Float64Array(N); Kmul(u, Ku);
  const RF = {};
  for (const s of [...fixed, ...rollers]) {
    const nodes = new Map(); let t = [0, 0, 0];
    for (const n of s.nodes) { const v = [0, 1, 2].map((k) => Ku[3 * n + k] - forces[3 * n + k]); nodes.set(n, v); t = t.map((x, k) => x + v[k]); }
    RF[(s.set ?? s.name ?? 'S').toUpperCase()] = { nodes, total: t };
  }
  return { U: u, S, RF, iterations: it };
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
function invert3(M) {
  const d = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  if (!(Math.abs(d) > 0)) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return [
    [(M[1][1] * M[2][2] - M[1][2] * M[2][1]) / d, (M[0][2] * M[2][1] - M[0][1] * M[2][2]) / d, (M[0][1] * M[1][2] - M[0][2] * M[1][1]) / d],
    [(M[1][2] * M[2][0] - M[1][0] * M[2][2]) / d, (M[0][0] * M[2][2] - M[0][2] * M[2][0]) / d, (M[0][2] * M[1][0] - M[0][0] * M[1][2]) / d],
    [(M[1][0] * M[2][1] - M[1][1] * M[2][0]) / d, (M[0][1] * M[2][0] - M[0][0] * M[2][1]) / d, (M[0][0] * M[1][1] - M[0][1] * M[1][0]) / d]];
}
