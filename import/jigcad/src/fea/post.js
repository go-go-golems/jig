// From displacements and integration-point stresses to the numbers an engineer reads: the nodal von Mises field
// (each element's stress extrapolated linearly from its four points to its corners, the middles the mean of their
// two corners, then averaged over the elements at a node), both peaks, the safety factor against the material's
// strength, the largest displacement, and the boundary surface coloured by them.
import { CORNER_FROM_IP, EDGES, vonMises } from './tet10.js';

const at = (X, i) => [X[3 * i], X[3 * i + 1], X[3 * i + 2]];

export function stressField(mesh, S) {
  const nn = mesh.nodes.length / 3, ne = mesh.tets.length / 10;
  const sum = new Float64Array(nn), cnt = new Uint16Array(nn);
  let gauss = { value: -Infinity, element: -1, point: -1 };
  const tensor = new Float64Array(6 * nn);   // averaged nodal tensors, for probes and principal stresses
  for (let e = 0; e < ne; e++) {
    const ip = [0, 1, 2, 3].map((k) => S.subarray(24 * e + 6 * k, 24 * e + 6 * k + 6));
    for (let k = 0; k < 4; k++) { const v = vonMises(ip[k]); if (v > gauss.value) gauss = { value: v, element: e, point: k }; }
    const corner = CORNER_FROM_IP.map((row) => [0, 1, 2, 3, 4, 5].map((c) => row.reduce((s, w, k) => s + w * ip[k][c], 0)));
    const all = [...corner, ...EDGES.map(([a, b]) => corner[a].map((x, c) => (x + corner[b][c]) / 2))];
    for (let i = 0; i < 10; i++) {
      const n = mesh.tets[10 * e + i];
      sum[n] += vonMises(all[i]); cnt[n]++;
      for (let c = 0; c < 6; c++) tensor[6 * n + c] += all[i][c];
    }
  }
  const vm = new Float64Array(nn);
  for (let n = 0; n < nn; n++) if (cnt[n]) { vm[n] = sum[n] / cnt[n]; for (let c = 0; c < 6; c++) tensor[6 * n + c] /= cnt[n]; }
  return { vm, tensor, gauss };
}

// the boundary markers each node lies on
export function nodeMarkers(mesh) {
  const m = new Map();
  for (let f = 0; f < mesh.fmarks.length; f++) for (let k = 0; k < 6; k++) { const n = mesh.faces[6 * f + k]; const s = m.get(n) ?? new Set(); s.add(mesh.fmarks[f]); m.set(n, s); }
  return m;
}

// → { peak, gauss, displacement, field } for one solve; faceName(marker) names a face
export function summarise(mesh, sol, { faceName = (k) => `face ${k}` } = {}) {
  const { vm, tensor, gauss } = stressField(mesh, sol.S);
  const nn = mesh.nodes.length / 3;
  let peak = { value: -Infinity, node: -1 }, dmax = { value: -Infinity, node: -1 };
  const disp = new Float64Array(nn);
  for (let n = 0; n < nn; n++) {
    if (vm[n] > peak.value) peak = { value: vm[n], node: n };
    const d = Math.hypot(sol.U[3 * n], sol.U[3 * n + 1], sol.U[3 * n + 2]); disp[n] = d;
    if (d > dmax.value) dmax = { value: d, node: n };
  }
  const marks = nodeMarkers(mesh);
  const where = (n) => ({ at: at(mesh.nodes, n), faces: [...(marks.get(n) ?? [])].map(faceName) });
  const g = gauss.element >= 0 ? { value: gauss.value, element: gauss.element, at: ipPoint(mesh, gauss.element, gauss.point) } : null;
  return { vm, tensor, disp, peak: { value: peak.value, node: peak.node, ...where(peak.node) }, gauss: g, displacement: { value: dmax.value, node: dmax.node, ...where(dmax.node) } };
}
function ipPoint(mesh, e, k) {
  const L = CORNER_FROM_IP;   // the point lies at barycentric M[k]; recompute from the rule rather than invert
  void L;
  const A = 0.585410196624968, B = 0.138196601125011, w = [B, B, B, B]; w[k] = A;
  return [0, 1, 2].map((c) => w.reduce((s, x, i) => s + x * mesh.nodes[3 * mesh.tets[10 * e + i] + c], 0));
}

// The boundary surface for display: its corner nodes (renumbered), triangles with their face markers, and the
// nodal von Mises and displacement magnitude at each, Float32 for the wire.
export function surfaceField(mesh, sum, U) {
  const map = new Map(), pts = [], vm = [], du = [], uv = [];
  const id = (n) => { let i = map.get(n); if (i == null) { i = pts.length / 3; map.set(n, i); pts.push(...at(mesh.nodes, n)); vm.push(sum.vm[n]); du.push(sum.disp[n]); uv.push(U[3 * n], U[3 * n + 1], U[3 * n + 2]); } return i; };
  const nf = mesh.fmarks.length, tris = new Uint32Array(3 * nf);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) tris[3 * f + k] = id(mesh.faces[6 * f + k]);
  return { positions: Float32Array.from(pts), indices: tris, marks: Int32Array.from(mesh.fmarks), vonMises: Float32Array.from(vm), displacement: Float32Array.from(du), u: Float32Array.from(uv) };
}

// the element containing a point, by barycentric coordinates (corners); → { element, L } or null
export function locate(mesh, p, grid) {
  const T = mesh.tets, X = mesh.nodes;
  const cands = grid ? grid.near(p) : Array.from({ length: T.length / 10 }, (_, e) => e);
  let best = null;
  for (const e of cands) {
    const P = [0, 1, 2, 3].map((i) => at(X, T[10 * e + i]));
    const L = barycentric(P, p); if (!L) continue;
    const worst = Math.min(...L);
    if (worst >= -1e-9) return { element: e, L };
    if (!best || worst > best.worst) best = { element: e, L, worst };
  }
  return best && best.worst > -0.05 ? best : null;
}
function barycentric(P, p) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const a = sub(P[1], P[0]), b = sub(P[2], P[0]), c = sub(P[3], P[0]), d = sub(p, P[0]);
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (!det) return null;
  const s = (d[0] * (b[1] * c[2] - b[2] * c[1]) - d[1] * (b[0] * c[2] - b[2] * c[0]) + d[2] * (b[0] * c[1] - b[1] * c[0])) / det;
  const t = (a[0] * (d[1] * c[2] - d[2] * c[1]) - a[1] * (d[0] * c[2] - d[2] * c[0]) + a[2] * (d[0] * c[1] - d[1] * c[0])) / det;
  const u = (a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])) / det;
  return [1 - s - t - u, s, t, u];
}
