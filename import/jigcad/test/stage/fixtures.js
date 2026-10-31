// fixtures.js: synthetic ProgramData built by hand (BUILD.md §3), for the stage's tests. Meshes repeat a vertex for
// every face it bounds, as OpenCascade's do; every B-rep edge is a polyline with the two faces it separates; names
// follow the persistent-naming scheme (`body/side[base.l1]`, `body/end`, `a ∩ b`).

const TAU = Math.PI * 2;
const translate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const applyN = (m, n) => [m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };

// ---- a mesh with faces and edges
class Body {
  constructor(part, name) { this.part = part; this.name = name; this.P = []; this.N = []; this.I = []; this.TF = []; this.faces = []; this.edges = []; }
  face(name, kind, extra = {}) { const index = this.faces.length; this.faces.push({ index, name, kind, area: 0, center: [0, 0, 0], ...extra, _n: 0 }); return index; }
  v(p, n) { this.P.push(...p); this.N.push(...n); return this.P.length / 3 - 1; }
  tri(a, b, c, f) {
    this.I.push(a, b, c); this.TF.push(f);
    const A = this.P.slice(3 * a, 3 * a + 3), B = this.P.slice(3 * b, 3 * b + 3), C = this.P.slice(3 * c, 3 * c + 3);
    const ar = Math.hypot(...cross(sub(B, A), sub(C, A))) / 2, F = this.faces[f];
    F.center = F.center.map((x, k) => x + (A[k] + B[k] + C[k]) / 3 * ar); F.area += ar;
  }
  edge(name, kind, pts, faces) { this.edges.push({ index: this.edges.length, name, kind, points: Float32Array.from(pts.flat()), faces }); }
  transform(m) {          // bake a rigid transform into everything
    for (let i = 0; i < this.P.length; i += 3) { const p = apply(m, this.P.slice(i, i + 3)), n = applyN(m, this.N.slice(i, i + 3)); this.P.splice(i, 3, ...p); this.N.splice(i, 3, ...n); }
    for (const e of this.edges) { const q = []; for (let i = 0; i < e.points.length; i += 3) q.push(...apply(m, [e.points[i], e.points[i + 1], e.points[i + 2]])); e.points = Float32Array.from(q); }
    for (const f of this.faces) { f._t = m; }
    return this;
  }
  done(o = {}) {
    const P = Float32Array.from(this.P), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
    const faces = this.faces.map(f => {
      let center = f.area ? f.center.map(x => x / f.area) : f.center;
      let normal = f.normal, axis = f.axis;
      if (f._t) { center = apply(f._t, center); normal = normal && norm(applyN(f._t, normal)); if (axis) axis = { ...axis, origin: apply(f._t, axis.origin), dir: norm(applyN(f._t, axis.dir)) }; }
      const out = { index: f.index, name: f.name, kind: f.kind, area: +f.area.toFixed(3), center };
      if (normal) out.normal = normal; if (axis) out.axis = axis;
      return out;
    });
    return {
      id: `${this.part}/${this.name}`, name: this.name, part: this.part, color: null, transform: o.transform || translate(0, 0, 0),
      mesh: { positions: P, normals: Float32Array.from(this.N), indices: Uint32Array.from(this.I), triFace: Uint32Array.from(this.TF) },
      faces, edges: this.edges, bbox: [lo, hi],
    };
  }
}

// ---- ear clipping, with holes bridged into the outer loop (2D, outer CCW, holes CW)
const area2 = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
function bridge(outer, holes) {
  let poly = outer.map((p, i) => ({ p, k: 'o' + i }));
  const hs = holes.map((h, hi) => h.map((p, i) => ({ p, k: `h${hi}.${i}` }))).sort((a, b) => Math.max(...b.map(v => v.p[0])) - Math.max(...a.map(v => v.p[0])));
  for (const h of hs) {
    let mi = 0; h.forEach((v, i) => { if (v.p[0] > h[mi].p[0]) mi = i; });
    const M = h[mi].p;
    // nearest edge of poly hit by the ray from M toward +x
    let best = -1, bx = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i].p, b = poly[(i + 1) % poly.length].p;
      if ((a[1] > M[1]) === (b[1] > M[1])) continue;
      const x = a[0] + (M[1] - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
      if (x >= M[0] - 1e-9 && x < bx) { bx = x; best = i; }
    }
    const a = poly[best], b = poly[(best + 1) % poly.length];
    let pi = Math.hypot(a.p[0] - bx, a.p[1] - M[1]) <= Math.hypot(b.p[0] - bx, b.p[1] - M[1]) ? best : (best + 1) % poly.length;
    // a reflex vertex inside the triangle (M, hit, P) would block the view: take the one nearest the ray's angle
    const P0 = poly[pi].p, I = [bx, M[1]];
    const inTri = (p, A, B, C) => { const s = (u, v, w) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]); const d1 = s(p, A, B), d2 = s(p, B, C), d3 = s(p, C, A); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
    let bestAng = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i].p; if (i === pi || p[0] < M[0]) continue;
      if (inTri(p, M, I, P0) && !(p[0] === P0[0] && p[1] === P0[1])) { const ang = Math.abs(Math.atan2(p[1] - M[1], p[0] - M[0])); if (ang < bestAng) { bestAng = ang; pi = i; } }
    }
    const ring = h.slice(mi).concat(h.slice(0, mi + 1));
    poly = poly.slice(0, pi + 1).concat(ring, [poly[pi]], poly.slice(pi + 1));
  }
  return poly.map(v => v.p);
}
export function triangulate(outer, holes = []) {
  const pts = holes.length ? bridge(outer, holes) : outer.slice();
  const idx = pts.map((_, i) => i), tris = [];
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length], A = pts[ia], B = pts[ib], Cc = pts[ic];
      if (cr(A, B, Cc) <= 1e-12) continue;
      let ok = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        const p = pts[j]; if ((p[0] === A[0] && p[1] === A[1]) || (p[0] === B[0] && p[1] === B[1]) || (p[0] === Cc[0] && p[1] === Cc[1])) continue;
        if (cr(A, B, p) >= 0 && cr(B, Cc, p) >= 0 && cr(Cc, A, p) >= 0) { ok = false; break; }
      }
      if (!ok) continue;
      tris.push([A, B, Cc]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push(idx.map(i => pts[i]));
  return tris;
}

// ---- extrude a profile along +Z: loops [{ pts, groups: [name per segment], kinds, axis? }] (outer CCW, holes CW)
function extrude(body, feat, sketch, loops, h, o = {}) {
  const fStart = body.face(`${feat}/start`, 'plane', { normal: [0, 0, -1] }), fEnd = body.face(`${feat}/end`, 'plane', { normal: [0, 0, 1] });
  const outer = loops[0].pts, holes = loops.slice(1).map(l => l.pts), cap = o.cap || triangulate(outer, holes);
  for (const [z, f, up] of [[0, fStart, false], [h, fEnd, true]]) {
    for (const t of cap) {
      const n = [0, 0, up ? 1 : -1], vs = t.map(p => body.v([p[0], p[1], z], n));
      up ? body.tri(vs[0], vs[1], vs[2], f) : body.tri(vs[0], vs[2], vs[1], f);
    }
  }
  const faceOf = new Map();
  for (const loop of loops) {
    const n = loop.pts.length, groups = loop.groups, hole = area2(loop.pts) < 0;
    for (let i = 0; i < n; i++) {
      const g = groups[i];
      if (!faceOf.has(g)) {
        const kind = loop.kind && loop.kind(g) || 'plane', extra = {};
        if (kind === 'cylinder') extra.axis = { origin: [...loop.centre, 0], dir: [0, 0, 1], radius: loop.radius };
        else { const a = loop.pts[i], b = loop.pts[(i + 1) % n], d = norm([b[0] - a[0], b[1] - a[1], 0]); extra.normal = [d[1], -d[0], 0]; }
        faceOf.set(g, body.face(loop.name ? loop.name(g) : `${feat}/side[${sketch}.${g}]`, kind, extra));
      }
      const f = faceOf.get(g), a = loop.pts[i], b = loop.pts[(i + 1) % n];
      const smooth = loop.kind && loop.kind(g) === 'cylinder';
      const nA = smooth ? norm([(a[0] - loop.centre[0]) * (hole ? -1 : 1), (a[1] - loop.centre[1]) * (hole ? -1 : 1), 0]) : norm([b[1] - a[1], a[0] - b[0], 0]);
      const nB = smooth ? norm([(b[0] - loop.centre[0]) * (hole ? -1 : 1), (b[1] - loop.centre[1]) * (hole ? -1 : 1), 0]) : nA;
      const v0 = body.v([a[0], a[1], 0], nA), v1 = body.v([b[0], b[1], 0], nB), v2 = body.v([b[0], b[1], h], nB), v3 = body.v([a[0], a[1], h], nA);
      body.tri(v0, v1, v2, f); body.tri(v0, v2, v3, f);
    }
    // edges: per group, its run of segments at the bottom and the top, and the vertical edge where groups change
    const runs = [];
    let start = groups.findIndex((g, i) => g !== groups[(i + n - 1) % n]); if (start < 0) start = 0;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n, g = groups[i];
      if (!runs.length || runs[runs.length - 1].g !== g) runs.push({ g, pts: [loop.pts[i]] });
      runs[runs.length - 1].pts.push(loop.pts[(i + 1) % n]);
    }
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r], f = faceOf.get(run.g), fname = body.faces[f].name, kind = loop.kind && loop.kind(run.g) === 'cylinder' ? 'circle' : 'line';
      body.edge(`${fname} ∩ ${feat}/start`, kind, run.pts.map(p => [p[0], p[1], 0]), [f, fStart]);
      body.edge(`${fname} ∩ ${feat}/end`, kind, run.pts.map(p => [p[0], p[1], h]), [f, fEnd]);
      const next = runs[(r + 1) % runs.length], fn = faceOf.get(next.g), q = run.pts[run.pts.length - 1];
      if (runs.length === 1) body.edge(`${fname} seam`, 'line', [[q[0], q[1], 0], [q[0], q[1], h]], [f, f]);
      else body.edge(`${fname} ∩ ${body.faces[fn].name}`, 'line', [[q[0], q[1], 0], [q[0], q[1], h]], [f, fn]);
    }
  }
  return { fStart, fEnd, faceOf };
}
const circle = (c, r, n, cw = false) => { const out = []; for (let i = 0; i < n; i++) { const a = (cw ? -1 : 1) * TAU * i / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return out; };
const rectLoop = (x0, y0, x1, y1) => ({ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], groups: ['l1', 'l2', 'l3', 'l4'] });

// ---- programs
function program(kind, name, bodies, extra = {}) {
  const faces = bodies.reduce((s, b) => s + b.faces.length, 0);
  return { ok: true, hash: 'b3:fixture-' + name, kind, name, summary: { features: 1, bodies: bodies.length, sketches: (extra.sketches || []).length, dof: 0, faces, ...(extra.summary || {}) },
    metrics: extra.metrics || {}, diagnostics: [], trace: [], decisions: [], params: [], graph: { nodes: [], edges: [] }, sketches: extra.sketches || [], bodies, print: extra.print || null, ir: {} };
}

export function boxBody(w = 60, d = 40, h = 30, part = 'box', o = {}) {
  const b = new Body(part, 'body1');
  extrude(b, 'body', 'base', [rectLoop(-w / 2, -d / 2, w / 2, d / 2)], h);
  return b.done(o);
}
export function box() { return program('part', 'box', [boxBody()], { metrics: { volume: { value: 72000, unit: 'mm³', fidelity: 'exact' } }, sketches: [rectSketch()] }); }

export function cylinderBody(r = 15, h = 40, n = 64, part = 'cyl') {
  const b = new Body(part, 'body1');
  extrude(b, 'body', 'base', [{ pts: circle([0, 0], r, n), groups: new Array(n).fill('c1'), kind: () => 'cylinder', centre: [0, 0], radius: r }], h);
  return b.done();
}
export function cylinder() { return program('part', 'cylinder', [cylinderBody()]); }

// an L-bracket: an L profile in XZ (a 5 mm upright 50 mm tall, a 40 mm foot 5 mm thick) extruded 30 mm along Y
export function bracketBody(part = 'bracket', o = {}) {
  const b = new Body(part, 'body1'), t = 5, H = 50, F = 40, D = 30;
  extrude(b, 'body', 'profile', [{ pts: [[0, 0], [F, 0], [F, t], [t, t], [t, H], [0, H]], groups: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'] }], D);
  b.transform(mul(translate(-F / 2, D / 2, 0), [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]));     // (x, y, z) → (x, −z, y)
  return b.done(o);
}
export function bracket() { return program('part', 'bracket', [bracketBody()]); }

// the spec's plate: 80 × 50 × 4 mm with four M3 clearance holes (Ø 3.4 mm) 6 mm in from the corners
export function plateBody(n = 32) {
  const b = new Body('plate', 'body1'), W = 80, Dp = 50, T = 4, r = 1.7, at = [[-34, -19], [34, -19], [34, 19], [-34, 19]];
  const loops = [rectLoop(-W / 2, -Dp / 2, W / 2, Dp / 2)];
  at.forEach((c, i) => loops.push({ pts: circle(c, r, n, true), groups: new Array(n).fill(`h${i + 1}`), kind: () => 'cylinder', centre: c, radius: r, name: g => `holes/bore[${g}]` }));
  // the cap, a quadrant (and one hole) at a time
  const cap = [];
  at.forEach((c, i) => { const x0 = Math.min(0, Math.sign(c[0]) * W / 2), y0 = Math.min(0, Math.sign(c[1]) * Dp / 2); cap.push(...triangulate(rectLoop(x0, y0, x0 + W / 2, y0 + Dp / 2).pts, [loops[i + 1].pts])); });
  extrude(b, 'body', 'base', loops, T, { cap });
  return b.done();
}
export function plate() { return program('part', 'plate', [plateBody()]); }

// a 20 160-triangle ring (torus R 30, r 10) on the floor: the redraw-time fixture
export function torusBody(R = 30, r = 10, nu = 140, nv = 72) {
  const b = new Body('ring', 'body1'), f = b.face('ring/face#1', 'torus', { axis: { origin: [0, 0, r], dir: [0, 0, 1], radius: R } });
  const idx = [];
  for (let i = 0; i <= nu; i++) {
    idx.push([]);
    const u = TAU * i / nu;
    for (let j = 0; j <= nv; j++) {
      const v = TAU * j / nv, n = [Math.cos(u) * Math.cos(v), Math.sin(u) * Math.cos(v), Math.sin(v)];
      idx[i].push(b.v([(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r + r * Math.sin(v)], n));
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = idx[i][j], c = idx[i + 1][j], d = idx[i + 1][j + 1], e = idx[i][j + 1]; b.tri(a, c, d, f); b.tri(a, d, e, f); }
  const seamU = [], seamV = [];
  for (let j = 0; j <= nv; j++) { const v = TAU * j / nv; seamU.push([R + r * Math.cos(v), 0, r + r * Math.sin(v)]); }
  for (let i = 0; i <= nu; i++) { const u = TAU * i / nu; seamV.push([(R + r) * Math.cos(u), (R + r) * Math.sin(u), r]); }
  b.edge('ring/face#1 seam u', 'circle', seamU, [f, f]); b.edge('ring/face#1 seam v', 'circle', seamV, [f, f]);
  return b.done();
}
export function torus() { return program('part', 'ring', [torusBody()]); }

// a print job: the box and the bracket on one plate of a 250 × 210 × 220 mm bed; the bracket stands upside down
// (a Γ), so the underside of its foot prints over air
export function printJob() {
  const bx = boxBody(60, 40, 30, 'box'), br = bracketBody('bracket', { transform: translate(70, 0, 0) });
  const flip = mul(translate(175, 110, 50), rotY(Math.PI));
  const footTop = br.faces.findIndex(f => f.name === 'body/side[profile.l3]');
  return program('print', 'tray-job', [bx, br], {
    print: {
      printer: { name: 'mk4', bed: [250, 210, 220], nozzle: 0.4 },
      plates: [{ index: 1, items: [{ body: bx.id, transform: mul(translate(70, 95, 0), rotZ(Math.PI / 12)) }, { body: br.id, transform: flip }] }],
      orientation: { box: { dir: '+Z', supportVolume: 0, bedContact: 2400, height: 30, reason: 'flat base down' }, bracket: { dir: '-Z', supportVolume: 5200, bedContact: 150, height: 50, reason: 'pinned upside down by the fixture' } },
      overhang: [{ body: br.id, faces: [footTop], area: 35 * 30 }],
      layers: null,
    },
  });
}

// ---- sketches
const XY = { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] };
function arcPts(c, r, a0, a1, n = 24) { const out = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return out; }
// the spec's slot (example 04): two lines, two arcs, a free Ø 3.4 hole and a construction centreline: 3 DOF
export function slotSketch(o = {}) {
  const hole = { id: 'hole', kind: 'circle', construction: false, c: [20, 5], r: 1.7, dofFree: ['c.x', 'c.y', 'r'] };
  const sk = {
    id: 'slot', plane: XY, dof: 3, status: 'under',
    entities: [
      { id: 'l1', kind: 'line', construction: false, a: [0, 0], b: [40, 0], dofFree: [] },
      { id: 'a1', kind: 'arc', construction: false, c: [40, 5], r: 5, start: -Math.PI / 2, end: Math.PI / 2, dofFree: [] },
      { id: 'l2', kind: 'line', construction: false, a: [40, 10], b: [0, 10], dofFree: [] },
      { id: 'a2', kind: 'arc', construction: false, c: [0, 5], r: 5, start: Math.PI / 2, end: Math.PI * 1.5, dofFree: [] },
      hole,
      { id: 'cl', kind: 'line', construction: true, a: [-9, 5], b: [49, 5], dofFree: [] },
    ],
    constraints: [
      ...[['l1.end', 'a1.start'], ['a1.end', 'l2.start'], ['l2.end', 'a2.start'], ['a2.end', 'l1.start']].map((refs, i) => ({ id: `coincident${i + 1}`, kind: 'coincident', refs, driven: false, status: 'ok' })),
      ...[['l1', 'a1'], ['l1', 'a2'], ['l2', 'a1'], ['l2', 'a2']].map(refs => ({ id: `tangent(${refs.join(', ')})`, kind: 'tangent', refs, driven: false, status: 'ok' })),
      { id: 'equal(a1, a2)', kind: 'equal', refs: ['a1', 'a2'], driven: false, status: 'ok' },
      { id: 'horizontal(l1)', kind: 'horizontal', refs: ['l1'], driven: false, status: 'ok' },
      { id: 'fix(l1.start)', kind: 'fix', refs: ['l1.start'], driven: false, status: 'ok' },
      { id: 'dim(l1)', kind: 'length', refs: ['l1'], value: 40, driven: false, status: 'ok' },
      { id: 'dim(a1)', kind: 'radius', refs: ['a1'], value: 5, driven: false, status: 'ok' },
      { id: 'dim(l1, l2)', kind: 'distance', refs: ['l1', 'l2'], value: 10, driven: true, status: 'ok' },
      { id: 'parallel(l1, l2)', kind: 'parallel', refs: ['l1', 'l2'], driven: false, status: 'redundant' },
    ],
    conflicts: [],
    profiles: [{ loops: [[...arcPts([0, 5], 5, Math.PI / 2, Math.PI * 1.5).slice(0, -1), [0, 0], ...arcPts([40, 5], 5, -Math.PI / 2, Math.PI / 2).slice(1, -1), [40, 10], [0, 10]], arcPts(hole.c, hole.r, 0, TAU, 32).slice(0, -1).reverse()], area: 40 * 10 + Math.PI * 25 - Math.PI * 1.7 ** 2, outer: 0 }],
  };
  if (o.conflict) {
    sk.status = 'over'; sk.dof = 0;
    sk.constraints.push({ id: 'dim(l1, l2) = 12 mm', kind: 'distance', refs: ['l1', 'l2'], value: 12, driven: false, status: 'conflict' });
    for (const c of sk.constraints) if (['dim(a1)', 'tangent(l1, a1)', 'tangent(l2, a1)'].includes(c.id)) c.status = 'conflict';
    sk.conflicts = [['dim(l1, l2) = 12 mm', 'dim(a1)', 'tangent(l1, a1)', 'tangent(l2, a1)']];
    sk.entities[4].dofFree = [];
  }
  return sk;
}
export function rectSketch() {
  return {
    id: 'base', plane: XY, dof: 0, status: 'fully',
    entities: [
      { id: 'l1', kind: 'line', construction: false, a: [-30, -20], b: [30, -20], dofFree: [] },
      { id: 'l2', kind: 'line', construction: false, a: [30, -20], b: [30, 20], dofFree: [] },
      { id: 'l3', kind: 'line', construction: false, a: [30, 20], b: [-30, 20], dofFree: [] },
      { id: 'l4', kind: 'line', construction: false, a: [-30, 20], b: [-30, -20], dofFree: [] },
      { id: 'o', kind: 'point', construction: true, p: [0, 0], dofFree: [] },
    ],
    constraints: [
      { id: 'horizontal(l1)', kind: 'horizontal', refs: ['l1'], driven: false, status: 'ok' },
      { id: 'horizontal(l3)', kind: 'horizontal', refs: ['l3'], driven: false, status: 'ok' },
      { id: 'vertical(l2)', kind: 'vertical', refs: ['l2'], driven: false, status: 'ok' },
      { id: 'vertical(l4)', kind: 'vertical', refs: ['l4'], driven: false, status: 'ok' },
      { id: 'dim(l1)', kind: 'length', refs: ['l1'], value: 60, driven: false, status: 'ok' },
      { id: 'dim(l2)', kind: 'length', refs: ['l2'], value: 40, driven: false, status: 'ok' },
      { id: 'symmetric', kind: 'symmetric', refs: ['l1.start', 'l2.end', 'o'], driven: false, status: 'ok' },
      { id: 'fix(o)', kind: 'fix', refs: ['o'], driven: false, status: 'ok' },
    ],
    conflicts: [],
    profiles: [{ loops: [[[-30, -20], [30, -20], [30, 20], [-30, 20]]], area: 2400, outer: 0 }],
  };
}
export function sketch() { return program('sketch', 'slot', [], { sketches: [slotSketch()], summary: { dof: 3 } }); }
export function sketchConflict() { return program('sketch', 'slot', [], { sketches: [slotSketch({ conflict: true })] }); }

// nothing to draw (a failed compile keeps its last good program, but the stage must survive an empty one)
export function empty() { return program('part', 'empty', []); }

export const FIXTURES = { box, cylinder, bracket, plate, print: printJob, sketch, sketchConflict, torus, empty };
export { translate, rotZ, rotY, mul };
