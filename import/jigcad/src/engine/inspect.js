// Inspect (README §4.12): materials, mass (solid and as-printed), sections, overhangs, bed contact,
// mobility (Grübler–Kutzbach), snap-fit beam checks, gear mesh checks. Mesh-based analyses use body meshes.
import { getOC } from './oc.js';
import * as K from './kernel.js';
import { mm, gram, isQuantity } from './units.js';
import { meshReport } from './gears.js';

const V = K.V;
export const MATERIALS = {
  PLA: { density: 1.24, cost: 22, modulus: 3.5, allowableStrain: 0.02, glassTransition: 60, shrink: 0.003, color: 'white' },
  PETG: { density: 1.27, cost: 24, modulus: 2.1, allowableStrain: 0.025, glassTransition: 80, shrink: 0.004 },
  ABS: { density: 1.04, cost: 22, modulus: 2.3, allowableStrain: 0.025, glassTransition: 105, shrink: 0.007 },
  ASA: { density: 1.07, cost: 28, modulus: 2.2, allowableStrain: 0.025, glassTransition: 100, shrink: 0.006 },
  PP: { density: 0.9, cost: 35, modulus: 1.3, allowableStrain: 0.1, glassTransition: -10, shrink: 0.015 },
  'TPU-95A': { density: 1.21, cost: 35, modulus: 0.03, allowableStrain: 0.5, glassTransition: -30, shrink: 0.005 },
  'PA-CF': { density: 1.15, cost: 70, modulus: 6.0, allowableStrain: 0.015, glassTransition: 70, shrink: 0.003 },
  'resin-standard': { density: 1.18, cost: 40, modulus: 2.0, allowableStrain: 0.01, glassTransition: 55, shrink: 0.02 },
};
class Material {
  constructor(name, props) { this.name = name; Object.assign(this, props); Object.freeze(this); }
  with(patch) { const p = { ...this }; for (const [k, v] of Object.entries(patch)) p[k] = isQuantity(v) ? qNum(k, v) : v; return new Material(this.name, p); }
  get isMaterial() { return true; }
  toString() { return `material '${this.name}'`; }
}
const qNum = (k, v) => k === 'cost' ? (v.dims?.money ? v.value * 1000 : v.value) : k === 'density' ? v.value * 1000 : v.value;
export function material(m) {
  if (m?.isMaterial) return m;
  const name = typeof m === 'string' ? m : 'PLA';
  const p = MATERIALS[name] ?? MATERIALS[name.toUpperCase()];
  if (!p) throw new Error(`unknown material '${name}' (known: ${Object.keys(MATERIALS).join(', ')})`);
  return new Material(name, p);
}

// ── sections: plane ∩ solid → closed 2D loops in the plane frame ───────────
export function sectionLoops(shape, origin, normal, { deflection = 0.02 } = {}) {
  const oc = getOC();
  const r = K.scope();
  const z = V.unit(normal), x = Math.abs(z[2]) > 0.9 ? [1, 0, 0] : V.unit(V.cross([0, 0, 1], z)), y = V.cross(z, x);
  try {
    const pln = r(new oc.gp_Pln(r(K.ax3(origin, z, x, r))));
    const sec = r(new oc.BRepAlgoAPI_Section(shape, pln, false));
    sec.Build(r(new oc.Message_ProgressRange()));
    if (!sec.IsDone()) return { loops: [], frame: { origin, x, y, z } };
    const res = r(sec.Shape());
    const polys = [];
    K.explore(res, 'EDGE', e => {
      const pts = K.edgePolyline(K.castTo(e, 'EDGE'), deflection, 0.2);
      const p2 = [];
      for (let i = 0; i < pts.length; i += 3) { const d = V.sub([pts[i], pts[i + 1], pts[i + 2]], origin); p2.push([V.dot(d, x), V.dot(d, y)]); }
      if (p2.length >= 2) polys.push(p2);
    });
    return { loops: chainLoops(polys), frame: { origin, x, y, z } };
  } finally { r.free(); }
}
function chainLoops(polys, tol = 1e-5) {
  const loops = [];
  const used = new Array(polys.length).fill(false);
  const close = (a, b) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
  for (let i = 0; i < polys.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let loop = polys[i].slice();
    let grew = true;
    while (grew && !close(loop[0], loop[loop.length - 1])) {
      grew = false;
      for (let j = 0; j < polys.length; j++) {
        if (used[j]) continue;
        const p = polys[j], end = loop[loop.length - 1];
        if (close(p[0], end)) { loop.push(...p.slice(1)); used[j] = true; grew = true; break; }
        if (close(p[p.length - 1], end)) { loop.push(...p.slice(0, -1).reverse()); used[j] = true; grew = true; break; }
      }
    }
    if (close(loop[0], loop[loop.length - 1])) loop.pop();
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
// Polygon properties (signed loops; outer and holes combined by orientation-independent nesting)
export function loopsProps(loops) {
  // orient: the loop with the largest |area| and those nested at even depth count +, odd −
  const raw = loops.map(l => ({ l, a: polyArea(l) }));
  const inside = (p, l) => { let c = false; for (let i = 0, j = l.length - 1; i < l.length; j = i++) { if (((l[i][1] > p[1]) !== (l[j][1] > p[1])) && (p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0])) c = !c; } return c; };
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0;
  let regions = 0, holes = 0;
  for (const r of raw) {
    const depth = raw.filter(o => o !== r && Math.abs(o.a) > Math.abs(r.a) && inside(r.l[0], o.l)).length;
    const sgn = depth % 2 === 0 ? 1 : -1;
    if (sgn > 0) regions++; else holes++;
    const s = Math.sign(r.a) * sgn;
    const l = r.l;
    for (let i = 0; i < l.length; i++) {
      const [x0, y0] = l[i], [x1, y1] = l[(i + 1) % l.length];
      const c = x0 * y1 - x1 * y0;
      A += s * c / 2; Sx += s * (x0 + x1) * c / 6; Sy += s * (y0 + y1) * c / 6;
      Iyy += s * (x0 * x0 + x0 * x1 + x1 * x1) * c / 12; Ixx += s * (y0 * y0 + y0 * y1 + y1 * y1) * c / 12;
    }
  }
  const cx = A ? Sx / A : 0, cy = A ? Sy / A : 0;
  return { area: A, centroid: [cx, cy], Ixx: Ixx - A * cy * cy, Iyy: Iyy - A * cx * cx, regions, holes };
}
export const polyArea = l => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

// ── mesh analyses for a build direction u (world mesh positions) ───────────
// mesh: { positions, indices, triFace }; returns per-triangle data
// faces (optional): per-face geometry ({ kind, normal, axis: { origin, dir, semiAngle } }, body-local) so that
// triangles of planes, cylinders, cones and spheres carry the exact surface normal, not the facet's (a 45° cone
// is exactly 45°, whatever the tessellation).
export function meshTris(mesh, m = K.IDENTITY, faces = null) {
  const P = mesh.positions, I = mesh.indices; const n = I.length / 3;
  const tris = new Array(n);
  const R = d => { const o = K.matApply(m, [0, 0, 0]); return V.unit(V.sub(K.matApply(m, d), o)); };
  const geo = faces ? faces.map(f => f && {
    kind: f.kind, normal: f.normal && R(f.normal),
    axis: f.axis && { origin: K.matApply(m, f.axis.origin), dir: R(f.axis.dir), semiAngle: f.axis.semiAngle },
  }) : null;
  for (let t = 0; t < n; t++) {
    const a = K.matApply(m, [P[I[3 * t] * 3], P[I[3 * t] * 3 + 1], P[I[3 * t] * 3 + 2]]);
    const b = K.matApply(m, [P[I[3 * t + 1] * 3], P[I[3 * t + 1] * 3 + 1], P[I[3 * t + 1] * 3 + 2]]);
    const c = K.matApply(m, [P[I[3 * t + 2] * 3], P[I[3 * t + 2] * 3 + 1], P[I[3 * t + 2] * 3 + 2]]);
    const cr = V.cross(V.sub(b, a), V.sub(c, a)); const l = V.len(cr);
    const face = mesh.triFace?.[t] ?? 0, cen = V.mul(V.add(V.add(a, b), c), 1 / 3);
    let nrm = l ? V.mul(cr, 1 / l) : [0, 0, 1];
    const g = geo?.[face];
    if (g && l) nrm = exactNormal(g, cen, nrm) ?? nrm;
    tris[t] = { a, b, c, n: nrm, area: l / 2, face, cen };
  }
  return tris;
}
function exactNormal(g, p, fn) {
  const sgn = x => x < 0 ? -1 : 1;
  if (g.kind === 'plane' && g.normal) return V.dot(g.normal, fn) < 0 ? V.neg(g.normal) : g.normal;
  if (!g.axis) return null;
  const rel = V.sub(p, g.axis.origin), ax = g.axis.dir;
  if (g.kind === 'sphere') { const e = V.unit(rel); return V.mul(e, sgn(V.dot(e, fn))); }
  const rad = V.sub(rel, V.mul(ax, V.dot(rel, ax))); if (V.len(rad) < 1e-9) return null;
  const e = V.unit(rad);
  if (g.kind === 'cylinder') return V.mul(e, sgn(V.dot(e, fn)));
  const sa = g.axis.semiAngle;
  if (g.kind === 'cone' && sa != null) return V.add(V.mul(e, sgn(V.dot(e, fn)) * Math.cos(sa)), V.mul(ax, sgn(V.dot(ax, fn)) * Math.sin(sa)));
  return null;
}
// Smallest distance between two triangle meshes (world tris from meshTris), searched up to maxD: vertices of
// each against triangles of the other through a uniform grid. A real distance between surface points, so it
// never under-reports; Infinity when nothing is closer than maxD.
export function meshGap(A, B, maxD) {
  const h = Math.max(maxD, 0.25), key = (i, j, k) => `${i},${j},${k}`;
  const grid = tris => { const g = new Map(); tris.forEach((t, n) => {
    const lo = [0, 1, 2].map(d => Math.floor((Math.min(t.a[d], t.b[d], t.c[d]) - maxD) / h)), hi = [0, 1, 2].map(d => Math.floor((Math.max(t.a[d], t.b[d], t.c[d]) + maxD) / h));
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4096) { (g.get('big') ?? g.set('big', []).get('big')).push(n); return; }
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const kk = key(i, j, k); (g.get(kk) ?? g.set(kk, []).get(kk)).push(n); }
  }); return g; };
  let best = Infinity;
  const pass = (P, T) => {
    const g = grid(T), big = g.get('big') ?? [];
    const seen = new Set();
    for (const t of P) for (const p of [t.a, t.b, t.c]) {
      const id = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}`; if (seen.has(id)) continue; seen.add(id);
      const cell = g.get(key(Math.floor(p[0] / h), Math.floor(p[1] / h), Math.floor(p[2] / h))) ?? [];
      for (const n of cell.length || big.length ? [...cell, ...big] : []) { const d = pointTri(p, T[n]); if (d < best) best = d; }
    }
  };
  pass(A, B); pass(B, A);
  // Vertex-to-triangle distances miss two meshes that pass through each other (a fillet into a bore leaves every
  // vertex outside the other mesh's triangles): two triangles intersect only if an edge of one crosses the other,
  // so test the edges of each mesh against the other's triangles. Walk each edge in steps of h / 2: a crossing point
  // lies inside the triangle's box, so the sample before it falls in a cell that holds the triangle.
  const cross = (P, T) => {
    const g = grid(T), big = g.get('big') ?? [];
    const seen = new Set();
    for (const t of P) for (const [p, q] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
      const id = edgeKey(p, q); if (seen.has(id)) continue; seen.add(id);
      const L = V.len(V.sub(q, p)), n = Math.max(1, Math.ceil(L / (h / 2)));
      const cand = new Set(big);
      for (let s = 0; s <= n; s++) {
        const x = V.add(p, V.mul(V.sub(q, p), s / n));
        for (const k of g.get(key(Math.floor(x[0] / h), Math.floor(x[1] / h), Math.floor(x[2] / h))) ?? []) cand.add(k);
      }
      for (const k of cand) if (segTri(p, q, T[k])) return true;
    }
    return false;
  };
  // run it even when no vertex came near: a thin part straight through a web has all its vertices far away
  if (best > 1e-9 && (cross(A, B) || cross(B, A))) best = 0;
  // one mesh wholly inside the other crosses nothing: a ray from one vertex crosses the other an odd number of times
  if (best > 1e-9 && A.length && B.length && (inside(A[0].a, B) || inside(B[0].a, A))) best = 0;
  return best <= maxD ? best : Infinity;
}
function inside(p, T) {
  let far = 0;
  for (const t of T) for (const v of [t.a, t.b, t.c]) far = Math.max(far, Math.abs(v[0] - p[0]), Math.abs(v[1] - p[1]), Math.abs(v[2] - p[2]));
  const q = V.add(p, V.mul([1, 0.000123, 0.000457], 2 * far + 1));   // skewed, so it misses edges and vertices
  let n = 0;
  for (const t of T) if (segTri(p, q, t)) n++;
  return n % 2 === 1;
}
const edgeKey = (p, q) => { const a = p.map(v => v.toFixed(5)).join(','), b = q.map(v => v.toFixed(5)).join(','); return a < b ? a + '|' + b : b + '|' + a; };
/** Does the segment p–q cross the triangle's interior (Möller–Trumbore)? Touching at an end or an edge does not count. */
function segTri(p, q, t) {
  const d = V.sub(q, p), e1 = V.sub(t.b, t.a), e2 = V.sub(t.c, t.a);
  const s = V.cross(d, e2), det = V.dot(e1, s);
  if (Math.abs(det) < 1e-12) return false;            // parallel or coplanar: the distance pass sees those
  const inv = 1 / det, o = V.sub(p, t.a);
  const u = V.dot(o, s) * inv; if (u <= 1e-9 || u >= 1 - 1e-9) return false;
  const r = V.cross(o, e1), v = V.dot(d, r) * inv; if (v <= 1e-9 || u + v >= 1 - 1e-9) return false;
  const w = V.dot(e2, r) * inv;
  return w > 1e-9 && w < 1 - 1e-9;
}
function pointTri(p, t) {   // distance from p to triangle (a, b, c)
  const ab = V.sub(t.b, t.a), ac = V.sub(t.c, t.a), ap = V.sub(p, t.a);
  const d1 = V.dot(ab, ap), d2 = V.dot(ac, ap); if (d1 <= 0 && d2 <= 0) return V.len(ap);
  const bp = V.sub(p, t.b), d3 = V.dot(ab, bp), d4 = V.dot(ac, bp); if (d3 >= 0 && d4 <= d3) return V.len(bp);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return V.len(V.sub(p, V.add(t.a, V.mul(ab, d1 / (d1 - d3)))));
  const cp = V.sub(p, t.c), d5 = V.dot(ab, cp), d6 = V.dot(ac, cp); if (d6 >= 0 && d5 <= d6) return V.len(cp);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return V.len(V.sub(p, V.add(t.a, V.mul(ac, d2 / (d2 - d6)))));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return V.len(V.sub(p, V.add(t.b, V.mul(V.sub(t.c, t.b), w)))); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return V.len(V.sub(p, V.add(t.a, V.add(V.mul(ab, v), V.mul(ac, w)))));
}
// Overhang/support/bed-contact for build direction u. maxAngle from vertical (rad).
export function orientationScore(tris, u, { maxAngle = Math.PI / 4, bedTol = 1e-3, supportFactor = 1 } = {}) {
  u = V.unit(u);
  let lo = Infinity, hi = -Infinity;
  for (const t of tris) for (const p of [t.a, t.b, t.c]) { const h = V.dot(p, u); if (h < lo) lo = h; if (h > hi) hi = h; }
  const s = Math.sin(maxAngle + 0.5 * Math.PI / 180);   // 0.5° tolerance: facets of a 45° cone stay at the limit
  let overhangArea = 0, bedContact = 0;
  const over = [], faces = new Set();
  for (const t of tris) {
    const d = -V.dot(t.n, u);
    const minH = Math.min(V.dot(t.a, u), V.dot(t.b, u), V.dot(t.c, u)), maxH = Math.max(V.dot(t.a, u), V.dot(t.b, u), V.dot(t.c, u));
    if (d > 1 - 1e-6 && maxH - lo < bedTol) { bedContact += t.area; continue; }
    if (d > s + 1e-9) { overhangArea += t.area; over.push(t); faces.add(t.face); }
  }
  // support columns: from each overhanging triangle down (−u) to the part or the bed
  const supportVolume = over.length ? supportColumns(tris, over, u, lo) * supportFactor : 0;
  return { dir: u, overhangArea, bedContact, height: hi - lo, supportVolume, overhangFaces: [...faces], lo, hi };
}
function supportColumns(tris, over, u, lo) {
  // grid over the plane ⟂ u
  const x = Math.abs(u[2]) > 0.9 ? [1, 0, 0] : V.unit(V.cross([0, 0, 1], u)), y = V.cross(u, x);
  const proj = p => [V.dot(p, x), V.dot(p, y)];
  const cell = 2;
  const grid = new Map();
  const keyOf = (i, j) => i * 100003 + j;
  tris.forEach((t, k) => {
    const ps = [t.a, t.b, t.c].map(proj);
    const x0 = Math.floor(Math.min(...ps.map(p => p[0])) / cell), x1 = Math.floor(Math.max(...ps.map(p => p[0])) / cell);
    const y0 = Math.floor(Math.min(...ps.map(p => p[1])) / cell), y1 = Math.floor(Math.max(...ps.map(p => p[1])) / cell);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const kk = keyOf(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(k); }
  });
  let vol = 0;
  for (const t of over) {
    const c = t.cen, h0 = V.dot(c, u), q = proj(c);
    const cand = grid.get(keyOf(Math.floor(q[0] / cell), Math.floor(q[1] / cell))) ?? [];
    let floor = lo;
    for (const k of cand) {
      const s = tris[k]; if (s === t) continue;
      if (V.dot(s.n, u) <= 1e-6) continue;   // only upward-facing surfaces hold supports
      const hit = rayDown(s, c, u);
      if (hit != null && hit < h0 - 1e-6 && hit > floor) floor = hit;
    }
    vol += t.area * Math.abs(V.dot(t.n, u)) * Math.max(0, h0 - floor);
  }
  return vol;
}
function rayDown(t, p, u) {
  // intersection of the line p − s·u with triangle t, returns height along u
  const e1 = V.sub(t.b, t.a), e2 = V.sub(t.c, t.a), d = V.neg(u);
  const h = V.cross(d, e2), a = V.dot(e1, h);
  if (Math.abs(a) < 1e-12) return null;
  const f = 1 / a, s = V.sub(p, t.a), uu = f * V.dot(s, h);
  if (uu < -1e-9 || uu > 1 + 1e-9) return null;
  const qv = V.cross(s, e1), vv = f * V.dot(d, qv);
  if (vv < -1e-9 || uu + vv > 1 + 1e-9) return null;
  const tt = f * V.dot(e2, qv);
  return V.dot(V.add(p, V.mul(d, tt)), u);
}

// As-printed mass: walls (perimeters) + top/bottom skins + infill fraction of the interior.
export function asPrinted(volume, area, bboxHeight, footprint, { walls = 3, infill = 0.15, lw = 0.45, layer = 0.2, top = 5, bottom = 4 } = {}) {
  const wallT = walls * lw;
  const sideArea = Math.max(0, area - 2 * footprint);
  const vWalls = Math.min(volume, sideArea * wallT);
  const vSkins = Math.min(volume - vWalls, Math.max(0, footprint - sideArea / Math.max(bboxHeight, 1e-9) * wallT) * (top + bottom) * layer);
  const vInterior = Math.max(0, volume - vWalls - vSkins);
  const vInfill = infill * vInterior;
  return { volume: vWalls + vSkins + vInfill, parts: { walls: vWalls, skins: vSkins, infill: vInfill } };
}

// ── mechanisms and snap-fits ─────────────────────────────────────────────────
export function mobility(asm) {
  const n = asm.components.length; const joints = asm.joints;
  const dofOf = { rigid: 0, revolute: 1, slider: 1, cylindrical: 2, planar: 3, ball: 3, snap: 0 };
  const sumF = joints.reduce((s, j) => s + (dofOf[j.kind] ?? 0), 0);
  const M = 6 * (n - 1 - joints.length) + sumF;
  // solver DOF: joints between the same pair along the same axis are redundant
  const pairs = new Map();
  for (const j of joints) { const k = [j.a.split(':')[0], j.b.split(':')[0]].sort().join('|') + (j.a.split(':')[1] ?? '') + (j.b.split(':')[1] ?? ''); pairs.set(k, Math.max(pairs.get(k) ?? 0, dofOf[j.kind] ?? 0)); }
  const solverDOF = [...pairs.values()].reduce((s, v) => s + v, 0);
  const redundant = Math.max(0, solverDOF - M);
  return { grubler: { n, joints: joints.length, sumF, M }, solverDOF, redundant, note: redundant ? `${joints.length - pairs.size} joint(s) repeat another between the same ports (special geometry the formula cannot see)` : 'formula and solver agree' };
}
export function snap(hook) {
  const o = hook.spec ?? hook;
  const L = mmv(o.length), t = mmv(o.thickness), y = mmv(o.deflection);
  const mat = material(o.material ?? 'PETG');
  const strain = 1.5 * t * y / (L * L);
  const allowable = mat.allowableStrain;
  const permissibleDeflection = 0.67 * allowable * L * L / t;
  return { strain, allowable, permissibleDeflection: mm(permissibleDeflection), ratio: strain / allowable, ok: strain <= allowable,
    fix: strain > allowable ? `length ≥ ${(Math.sqrt(1.5 * t * y / allowable)).toFixed(1)} mm at t = ${t} mm, or thickness ≤ ${(allowable * L * L / (1.5 * y)).toFixed(2)} mm at L = ${L} mm` : null };
}
// j.inspect.gearMesh(a, b, { centreDistance?, tolerance? }): module and pressure agreement, helix hands,
// working centre distance with profile shift, contact ratio, undercut and normal backlash (gears.js).
export function gearMesh(a, b, o = {}) {
  const r = meshReport(a, b, o);
  return { ...r, module: mm(r.module), centreDistance: mm(r.centreDistance), standardCentreDistance: r.standardCentreDistance != null ? mm(r.standardCentreDistance) : undefined, backlash: mm(r.backlash), pitchLineDistance: r.pitchLineDistance != null ? mm(r.pitchLineDistance) : undefined };
}
const mmv = x => x == null ? 0 : typeof x === 'number' ? x : x.value ?? Number(x);
export { mmv };
