// The engine's door to jig-compute (Rust → wasm). Engine modules keep their function names and call these when
// `enabled()`; the original JS bodies stay as the reference and the fallback (design doc JIG-001, D4/D5).
//
// Meshes: meshTris() returns a TriSoup instead of an array of records. A TriSoup owns a Rust mesh handle and
// remembers what it was built from (display mesh, placement, face geometry), so it can rebuild the handle after
// resetArena() or produce JS records if the module is gone. catTris() is the TriSoup-aware `flatMap`.
import { compute, put, release, result, onTrap, status, loadCompute, withJs } from './wasm.js';

export { loadCompute, status, withJs };
export const enabled = () => compute() != null;
/** calls that ran in Rust, by bridge function (diagnostics; the worker reports them in `stats`) */
export const counters = {};
const count = k => { counters[k] = (counters[k] ?? 0) + 1; };

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
  return rust(X => { count('orientationScore');
    const r = result(X, X.jc_orientation_score(soup.handle(), u[0], u[1], u[2], maxAngle, bedTol, supportFactor));
    const nf = r[9];
    return { dir: [r[6], r[7], r[8]], overhangArea: r[0], bedContact: r[1], height: r[2], supportVolume: r[3], overhangFaces: Array.from(r.subarray(10, 10 + nf)), lo: r[4], hi: r[5] };
  });
}
export function meshGap(A, B, maxD) {
  return rust(X => { count('meshGap');
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
  return rust(X => { count('meshSection'); return decodeLoops(result(X, X.jc_mesh_section(soup.handle(), z))).loops; });
}
export function loopsProps(loops) {
  return rust(X => { count('loopsProps');
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
  return rust(X => { count('factorSolve');
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
  return rust(X => { count('cholSolve');
    const ba = put(X, A, Float64Array), bb = put(X, b, Float64Array);
    try { return X.jc_chol_solve(ba.p, n, bb.p, mu) ? result(X, n) : null; } finally { release(X, ba, bb); }
  });
}
export function qrcpRank(A, m, n, tol = 1e-10) {
  return rust(X => { const ba = put(X, A, Float64Array); try { return X.jc_qrcp_rank(ba.p, m, n, tol); } finally { release(X, ba); } });
}

// ── residual tapes (sketch solver, Phase 4b) ────────────────────────────────
// A TapeRef owns the tape data (sym.js buildTape) and a Rust handle, re-uploaded when stale (the Rust registry is
// capped and evicts its oldest tapes).
export class TapeRef {
  constructor(tape) { this.tape = tape; this.h = 0; }
  handle(X) {
    if (this.h && X.jc_tape_len(this.h) >= 0) return this.h;
    const ops = put(X, this.tape.ops, Float64Array), st = put(X, this.tape.starts, Uint32Array);
    try { const h = X.jc_tape_new(ops.p, this.tape.ops.length / 4, st.p, this.tape.count); if (h < 0) result(X, h); this.h = h >>> 0; }
    finally { release(X, ops, st); }
    return this.h;
  }
  free() { const X = compute(); if (X && this.h) X.jc_tape_free(this.h); this.h = 0; }
}
const METHOD = { dogleg: 0, lm: 1, bfgs: 1, newton: 2 };
const METHOD_NAME = ['dogleg', 'lm', 'newton'];
function withProblem(X, ref, x, cols, tids, fn) {
  const bx = put(X, x, Float64Array), bc = put(X, cols, Uint32Array), be = put(X, tids, Uint32Array);
  try { return fn(ref.handle(X), bx.p, x.length, bc.p, cols.length, be.p, tids.length); } finally { release(X, bx, bc, be); }
}
/** residuals and exact Jacobian (m × n) of tape equations `tids` over `cols` at the full vector x */
export function tapeJacobian(ref, x, cols, tids) {
  return rust(X => { count('tapeJacobian');
    const r = result(X, withProblem(X, ref, x, cols, tids, (h, ...a) => X.jc_tape_jacobian(h, ...a)));
    const m = tids.length;
    return { r: r.subarray(0, m), J: r.subarray(m) };
  });
}
/** runStrategy in Rust: { x (full vector), iters, converged, residual, used, fellBack } */
export function tapeSolve(ref, x, cols, tids, strat) {
  return rust(X => { count('tapeSolve');
    const method = METHOD[strat.method] ?? 0, fallback = strat.fallback ? (METHOD[strat.fallback] ?? -1) : -1;
    const n = withProblem(X, ref, x, cols, tids, (h, ...a) => X.jc_tape_solve(h, ...a, method, fallback, strat.maxIter ?? -1, strat.tau ?? 1e-3));
    const r = result(X, n);
    return { converged: !!r[0], iters: r[1], residual: r[2], used: METHOD_NAME[r[3]] ?? strat.method, fellBack: !!r[4], X: r.subarray(5) };
  });
}
/** dragCluster in Rust; hx, hy are tape equations giving the dragged point */
export function tapeDrag(ref, x, cols, tids, hx, hy, target, maxIter = 40) {
  return rust(X => { count('tapeDrag');
    const n = withProblem(X, ref, x, cols, tids, (h, ...a) => X.jc_tape_drag(h, ...a, hx, hy, target[0], target[1], maxIter));
    const r = result(X, n);
    return { iterations: r[0], residual: r[1], converged: !!r[2], X: r.subarray(3) };
  });
}
export const liveTapes = () => compute()?.jc_tape_live() ?? 0;
/** analyseCluster in Rust. groups: equations per constraint (priority order); ents: column-index sets per entity.
 *  → { rank, groups: [{ added, coef: Float64Array | null }], free: Float64Array(n), entityDof: number[] } */
export function tapeAnalyse(ref, x, cols, tids, groups, ents) {
  return rust(X => {
    count('tapeAnalyse');
    const words = []; for (const s of ents) { words.push(s.length, ...s); }
    const bg = put(X, groups, Uint32Array), bw = put(X, words, Uint32Array);
    try {
      const n = withProblem(X, ref, x, cols, tids, (h, ...a) => X.jc_tape_analyse(h, ...a, bg.p, groups.length, bw.p, words.length, ents.length));
      const r = result(X, n);
      let i = 1; const gs = [];
      for (let g = 0; g < groups.length; g++) { const added = r[i++], k = r[i++]; gs.push({ added, coef: k ? r.slice(i, i + k) : null }); i += k; }
      const free = r.slice(i, i + cols.length); i += cols.length;
      return { rank: r[0], groups: gs, free, entityDof: Array.from(r.subarray(i, i + ents.length)) };
    } finally { release(X, bg, bw); }
  });
}

// ── stage (main thread): frames in wasm memory, instance meshes, raster, line classification (Phase 5) ───────
// A frame's depth and id arrays are views onto wasm memory, re-created when memory has grown (growth detaches
// the old ArrayBuffer). Its dirty rectangle (x0 y0 x1 y1) is mirrored from Rust after each raster.
const frames = new WeakMap();                   // key object → RsFrame
const framesFree = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry(h => compute()?.jc_frame_free(h)) : null;
class RsFrame {
  constructor(X, w, h) { this.rust = true; this.w = w; this.h = h; this.fh = X.jc_frame_new(w, h); this._mem = null; this._d = null; this._i = null; this.x0 = w; this.y0 = h; this.x1 = -1; this.y1 = -1; }
  views() {
    const X = compute(), buf = X.memory.buffer;
    if (this._mem !== buf) { this._mem = buf; this._d = new Float32Array(buf, X.jc_frame_depth_ptr(this.fh), this.w * this.h); this._i = new Int32Array(buf, X.jc_frame_id_ptr(this.fh), this.w * this.h); }
  }
  get depth() { this.views(); return this._d; }
  get id() { this.views(); return this._i; }
  syncBox() { const X = compute(), r = result(X, X.jc_frame_bbox(this.fh)); [this.x0, this.y0, this.x1, this.y1] = r; }
}
/** buffers() for Rust: the frame for `key` at w × h, cleared where the last raster drew */
export function stageFrame(key, w, h) {
  return rust(X => {
    let f = frames.get(key);
    if (!f || f.w !== w || f.h !== h || X.jc_frame_bbox(f.fh) < 0) {
      if (f) X.jc_frame_free(f.fh);
      f = new RsFrame(X, w, h); frames.set(key, f); framesFree?.register(f, f.fh);
    } else X.jc_frame_clear(f.fh);
    f.syncBox();
    return f;
  });
}
const stageMeshes = new WeakMap();              // inst.P (world positions) → handle
const meshFree = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry(h => compute()?.jc_stage_mesh_free(h)) : null;
function stageMesh(X, inst) {
  let h = stageMeshes.get(inst.P);
  if (h) return h;
  const m = inst.body.mesh, P = put(X, inst.P, Float32Array), I = put(X, m.indices, Uint32Array), T = m.triFace ? put(X, m.triFace, Uint32Array) : null;
  try { h = X.jc_stage_mesh_new(P.p, inst.P.length / 3, I.p, m.indices.length / 3, T ? T.p : 0); if (h < 0) result(X, h); }
  finally { release(X, P, I, T); }
  stageMeshes.set(inst.P, h); meshFree?.register(inst.P, h);
  return h;
}
/** project + rasterise one instance into a Rust frame; returns the projected vertices (Float32Array copy) */
export function stageRaster(frame, inst, cam, k) {
  return rust(X => {
    count('stageRaster');
    const mh = stageMesh(X, inst);
    const c = put(X, [...cam.T, ...cam.r, ...cam.u, ...cam.c, cam.s * k, cam.W / 2 * k, cam.Y0 * k], Float64Array);
    let n;
    try { n = X.jc_frame_raster(frame.fh, mh, inst.base, c.p); if (n < 0) result(X, n); } finally { release(X, c); }
    frame.syncBox();
    return new Float32Array(X.memory.buffer, X.jc_stage_mesh_s_ptr(mh), n * 3).slice();
  });
}
/** classify a batch of polylines: items [{ pts: Float32Array(3n), fa, fb (number | per-segment array), on?: Float32Array(2(n−1)) }]
 *  → per item an array of runs [state, [x, y, …]] (CSS px) */
export function stageClassify(frame, items, { bias, near, shallow, k, step }, sil) {
  return rust(X => {
    count('stageClassify');
    let np = 0; for (const it of items) np += it.pts.length / 3;
    const pts = new Float32Array(np * 3), offs = new Uint32Array(items.length + 1), fa = new Float64Array(np), fb = new Float64Array(np), on = sil ? new Float32Array(np * 2) : null;
    let o = 0;
    items.forEach((it, p) => {
      const n = it.pts.length / 3;
      offs[p] = o; pts.set(it.pts, o * 3);
      for (let i = 0; i < n; i++) {
        fa[o + i] = typeof it.fa === 'number' ? it.fa : (it.fa[i] ?? -1e9);
        fb[o + i] = typeof it.fb === 'number' ? it.fb : (it.fb[i] ?? -1e9);
      }
      if (sil && it.on) on.set(it.on.subarray(0, Math.min(it.on.length, (n - 1) * 2)), o * 2);
      o += n;
    });
    offs[items.length] = o;
    const B = [put(X, [bias, near, shallow, k, step], Float64Array), put(X, pts, Float32Array), put(X, offs, Uint32Array), put(X, fa, Float64Array), put(X, fb, Float64Array), on ? put(X, on, Float32Array) : null];
    try {
      const r = result(X, X.jc_frame_classify(frame.fh, B[0].p, B[1].p, np, B[2].p, items.length, B[3].p, B[4].p, B[5] ? B[5].p : 0));
      const out = []; let i = 0;
      for (let p = 0; p < items.length; p++) {
        const nr = r[i++], runs = [];
        for (let q = 0; q < nr; q++) { const st = r[i++], n = r[i++]; runs.push([st, Array.from(r.subarray(i, i + 2 * n))]); i += 2 * n; }
        out.push(runs);
      }
      return out;
    } finally { release(X, ...B); }
  });
}
