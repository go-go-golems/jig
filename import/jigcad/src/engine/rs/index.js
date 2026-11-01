// The engine's door to jig-compute (Rust → wasm). Engine modules keep their function names and call these when
// `enabled()`; the original JS bodies stay as the reference and the fallback (design doc JIG-001, D4/D5).
//
// Meshes: meshTris() returns a TriSoup instead of an array of records. A TriSoup owns a Rust mesh handle and
// remembers what it was built from (display mesh, placement, face geometry), so it can rebuild the handle after
// resetArena() or produce JS records if the module is gone. catTris() is the TriSoup-aware `flatMap`.
import { compute, put, release, result, onTrap, status, loadCompute } from './wasm.js';

export { loadCompute, status };
export const enabled = () => compute() != null;

// Face geometry for exact normals (rust/jig-compute/src/mesh.rs GEO_STRIDE)
const GEO_STRIDE = 13;
const KIND = { plane: 1, cylinder: 2, cone: 3, sphere: 4 };
export function encodeGeo(faces) {
  if (!faces) return null;
  const g = new Float64Array(faces.length * GEO_STRIDE);
  faces.forEach((f, i) => {
    const o = i * GEO_STRIDE;
    g[o + 12] = NaN;
    if (!f) return;
    g[o] = KIND[f.kind] ?? 0;
    if (f.normal) { g[o + 1] = 1; g[o + 2] = f.normal[0]; g[o + 3] = f.normal[1]; g[o + 4] = f.normal[2]; }
    if (f.axis) {
      g[o + 5] = 1;
      g[o + 6] = f.axis.origin[0]; g[o + 7] = f.axis.origin[1]; g[o + 8] = f.axis.origin[2];
      g[o + 9] = f.axis.dir[0]; g[o + 10] = f.axis.dir[1]; g[o + 11] = f.axis.dir[2];
      if (f.axis.semiAngle != null) g[o + 12] = f.axis.semiAngle;
    }
  });
  return g;
}

let jsMeshTris = null;                     // inspect.js registers its JS meshTris for TriSoup.records() fallbacks
export const setJsMeshTris = fn => { jsMeshTris = fn; };

const arena = new Set();                   // TriSoups with a live handle
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function newHandle(X, parts) {
  let h = 0;
  for (const { mesh, m, faces } of parts) {
    const pos = put(X, mesh.positions, Float32Array), idx = put(X, mesh.indices, Uint32Array);
    const tf = mesh.triFace ? put(X, mesh.triFace, Uint32Array) : null;
    const mm = put(X, m ?? IDENT, Float64Array);
    const geo = faces ? put(X, encodeGeo(faces), Float64Array) : null;
    const args = [pos.p, mesh.positions.length / 3, idx.p, mesh.indices.length / 3, tf ? tf.p : 0, mm.p, geo ? geo.p : 0, faces ? faces.length : 0];
    const r = h ? X.jc_mesh_append(h, ...args) : X.jc_mesh_new(...args);
    release(X, pos, idx, tf, mm, geo);
    if (r < 0) { if (h) X.jc_mesh_free(h); result(X, r); }   // throws the module's message
    if (!h) h = r;
  }
  if (!h) { const e = put(X, [], Float32Array); h = X.jc_mesh_new(e.p, 0, e.p, 0, 0, 0, 0, 0); release(X, e); }
  return h >>> 0;
}

export class TriSoup {
  constructor(parts) { this.parts = parts; this.h = 0; this._records = null; this._n = null; }
  /** the live Rust handle (rebuilt when stale), or 0 when Rust is off */
  handle() {
    const X = compute();
    if (!X) return 0;
    if (this.h && X.jc_mesh_len(this.h) >= 0) return this.h;
    this.h = newHandle(X, this.parts);
    arena.add(this);
    return this.h;
  }
  get length() {
    if (this._n != null) return this._n;
    const X = compute(), h = this.handle();
    return (this._n = h ? X.jc_mesh_len(h) : this.records().length);
  }
  /** JS records { a, b, c, n, area, face, cen }, as inspect.js's meshTris made them */
  records() {
    if (this._records) return this._records;
    const X = compute(), h = this.handle();
    if (!h) return (this._records = this.parts.flatMap(({ mesh, m, faces }) => jsMeshTris(mesh, m ?? IDENT, faces)));
    const r = result(X, X.jc_mesh_tris(h)), n = r.length / 17, out = new Array(n);
    for (let t = 0; t < n; t++) {
      const o = t * 17;
      out[t] = { a: [r[o], r[o + 1], r[o + 2]], b: [r[o + 3], r[o + 4], r[o + 5]], c: [r[o + 6], r[o + 7], r[o + 8]], n: [r[o + 9], r[o + 10], r[o + 11]], area: r[o + 12], face: r[o + 13], cen: [r[o + 14], r[o + 15], r[o + 16]] };
    }
    return (this._records = out);
  }
  [Symbol.iterator]() { return this.records()[Symbol.iterator](); }
  free() { const X = compute(); if (X && this.h) X.jc_mesh_free(this.h); this.h = 0; arena.delete(this); }
}
export const isSoup = x => x instanceof TriSoup;

/** meshTris through Rust: a TriSoup over one body's display mesh placed by m */
export const meshTris = (mesh, m, faces) => new TriSoup([{ mesh, m, faces }]);
/** concatenate per-body tris (TriSoups or arrays) like Array.prototype.flat */
export function catTris(list) {
  if (list.length && list.every(isSoup)) return new TriSoup(list.flatMap(s => s.parts));
  return list.flatMap(x => (isSoup(x) ? x.records() : x));
}
export const freeTris = t => { if (isSoup(t)) t.free(); };
/** free every handle (the start of a compile); TriSoups still referenced rebuild on next use */
export function resetArena() {
  const X = compute();
  for (const s of arena) { if (X && s.h) X.jc_mesh_free(s.h); s.h = 0; }
  arena.clear();
}
export const liveMeshes = () => compute()?.jc_mesh_live() ?? 0;

// Run fn(X) on the Rust side; on a trap switch to JS for good and return undefined so the caller falls back.
export function rust(fn) {
  const X = compute();
  if (!X) return undefined;
  try { return fn(X); } catch (e) { if (onTrap(e)) return undefined; throw e; }
}

export function orientationScore(soup, u, { maxAngle = Math.PI / 4, bedTol = 1e-3, supportFactor = 1 } = {}) {
  return rust(X => {
    const r = result(X, X.jc_orientation_score(soup.handle(), u[0], u[1], u[2], maxAngle, bedTol, supportFactor));
    const nf = r[9];
    return { dir: [r[6], r[7], r[8]], overhangArea: r[0], bedContact: r[1], height: r[2], supportVolume: r[3], overhangFaces: Array.from(r.subarray(10, 10 + nf)), lo: r[4], hi: r[5] };
  });
}
export function meshGap(A, B, maxD) {
  return rust(X => {
    const d = X.jc_mesh_gap(A.handle(), B.handle(), maxD);
    if (Number.isNaN(d)) throw new Error('jc_mesh_gap: stale mesh handle');
    return d;
  });
}
const decodeLoops = (r, i0 = 0) => {
  const loops = [], n = r[i0];
  let i = i0 + 1;
  for (let k = 0; k < n; k++) { const len = r[i++], l = new Array(len); for (let j = 0; j < len; j++, i += 2) l[j] = [r[i], r[i + 1]]; loops.push(l); }
  return { loops, end: i };
};
export function meshSection(soup, z) {
  return rust(X => decodeLoops(result(X, X.jc_mesh_section(soup.handle(), z))).loops);
}
export function loopsProps(loops) {
  return rust(X => {
    let size = 1; for (const l of loops) size += 1 + 2 * l.length;
    const enc = new Float64Array(size);
    let i = 0; enc[i++] = loops.length;
    for (const l of loops) { enc[i++] = l.length; for (const p of l) { enc[i++] = p[0]; enc[i++] = p[1]; } }
    const b = put(X, enc, Float64Array);
    try {
      const r = result(X, X.jc_loops_props(b.p, size));
      return { area: r[0], centroid: [r[1], r[2]], Ixx: r[3], Iyy: r[4], regions: r[5], holes: r[6] };
    } finally { release(X, b); }
  });
}

// ── linear algebra (sketch/linalg.js shapes) ────────────────────────────────
export function factorSolve(J, m, n, b, { tol = 1e-10, wantNull = false } = {}) {
  return rust(X => {
    const bj = put(X, J, Float64Array), bb = put(X, b ?? new Float64Array(m), Float64Array);
    try {
      const rank = X.jc_factor_solve(bj.p, m, n, bb.p, tol, wantNull ? 1 : 0);
      const r = result(X, n + (wantNull ? (n - rank) * n : 0));
      const nullBasis = wantNull ? Array.from({ length: n - rank }, (_, k) => r.slice(n + k * n, n + (k + 1) * n)) : null;
      return { rank, h: r.subarray(0, n), nullBasis };
    } finally { release(X, bj, bb); }
  });
}
export function cholSolve(A, n, b, mu = 0) {
  return rust(X => {
    const ba = put(X, A, Float64Array), bb = put(X, b, Float64Array);
    try { return X.jc_chol_solve(ba.p, n, bb.p, mu) ? result(X, n) : null; } finally { release(X, ba, bb); }
  });
}
export function qrcpRank(A, m, n, tol = 1e-10) {
  return rust(X => { const ba = put(X, A, Float64Array); try { return X.jc_qrcp_rank(ba.p, m, n, tol); } finally { release(X, ba); } });
}
