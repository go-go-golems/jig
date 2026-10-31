// 2D booleans for regions (README §4.3b): union and subtract of loop regions. Disjoint unions and holes that lie
// strictly inside stay exact loop lists; overlapping cases go through OpenCascade face booleans in the XY plane,
// unified, and come back as loops (lines and arcs exact, other curves as interpolating splines). Every
// resulting segment keeps the `src` of the input segment it lies on, so face names survive.
import { getOC } from './oc.js';
import * as K from './kernel.js';
import { loopPolygon, makeRegionFace } from './shapes.js';

const XY = { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

// ── polygon predicates (loops polygonised) ─────────────────────────────────────
const poly = loop => loopPolygon(loop, 32);
function segsCross(p, q) {
  const n = p.length, m = q.length;
  const bb = P => P.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const A = bb(p), B = bb(q);
  if (A[0] > B[2] + 1e-9 || B[0] > A[2] + 1e-9 || A[1] > B[3] + 1e-9 || B[1] > A[3] + 1e-9) return false;
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    for (let j = 0; j < m; j++) {
      const c = q[j], d = q[(j + 1) % m];
      const d1 = orient(a, b, c), d2 = orient(a, b, d), d3 = orient(c, d, a), d4 = orient(c, d, b);
      if (((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))) return true;
      if (Math.abs(d1) <= 1e-12 && Math.abs(d2) <= 1e-12 && Math.abs(d3) <= 1e-12 && Math.abs(d4) <= 1e-12) return true;   // collinear overlap: treat as touching
    }
  }
  return false;
}
function inside(pt, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (((P[i][1] > pt[1]) !== (P[j][1] > pt[1])) && (pt[0] < (P[j][0] - P[i][0]) * (pt[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) c = !c;
  return c;
}
// do two regions share any area (or touch)?
export function regionsOverlap(ra, rb) {
  const pa = poly(ra.loops[0]), pb = poly(rb.loops[0]);
  return segsCross(pa, pb) || inside(pa[0], pb) || inside(pb[0], pa);
}
// is region b's outline strictly inside region a's material (inside its outer loop, clear of its holes)?
function strictlyInside(ra, rb) {
  const pb = poly(rb.loops[0]), pa = poly(ra.loops[0]);
  if (segsCross(pa, pb) || !inside(pb[0], pa)) return false;
  for (const h of ra.loops.slice(1)) { const ph = poly(h); if (segsCross(ph, pb) || inside(pb[0], ph) || inside(ph[0], pb)) return false; }
  return true;
}

// union: disjoint regions stay separate; overlapping ones fuse
export function unionRegions(A, B) {
  const all = [...A, ...B];
  const overlap = A.some(a => B.some(b => regionsOverlap(a, b)));
  return overlap ? booleanRegions('fuse', all, []) : all;
}
// subtract: B's outlines strictly inside one region of A (and clear of each other) become holes; else a boolean
export function subtractRegions(A, B) {
  const simple = B.every(b => b.loops.length === 1) && B.every((b, i) => B.every((c, k) => k === i || !regionsOverlap(b, c)));
  if (simple) {
    const out = A.map(r => ({ ...r, loops: r.loops.slice() }));
    let ok = true;
    for (const b of B) {
      const host = out.find(r => strictlyInside(r, b));
      if (host) host.loops.push(b.loops[0]);
      else if (out.some(r => regionsOverlap(r, b))) { ok = false; break; }   // crosses an outline: needs a boolean
    }
    if (ok) return out;
  }
  return booleanRegions('cut', A, B);
}

// ── OpenCascade path ─────────────────────────────────────────────────────────
export function booleanRegions(op, A, B) {
  const oc = getOC();
  const r = K.scope();
  try {
    const faces = rs => rs.map(rg => r(makeRegionFace(XY, rg, r).face));
    const fa = faces(A), fb = faces(B);
    const srcSegs = [...A, ...B].flatMap(rg => rg.loops.flat());
    let shape;
    if (op === 'fuse') {
      if (fa.length === 1 && !fb.length) shape = fa[0];
      else {
        const mk = r(new oc.BRepAlgoAPI_Fuse());
        mk.SetArguments(r(K.arrayToList([fa[0]]))); mk.SetTools(r(K.arrayToList([...fa.slice(1), ...fb])));
        mk.Build(r(new oc.Message_ProgressRange()));
        if (!mk.IsDone()) throw new Error('region union failed');
        shape = r(mk.Shape());
      }
    } else {
      const mk = r(new oc.BRepAlgoAPI_Cut());
      mk.SetArguments(r(K.arrayToList(fa))); mk.SetTools(r(K.arrayToList(fb)));
      mk.Build(r(new oc.Message_ProgressRange()));
      if (!mk.IsDone()) throw new Error('region subtract failed');
      shape = r(mk.Shape());
    }
    const un = r(new oc.ShapeUpgrade_UnifySameDomain(shape, true, true, false));
    un.Build();
    const unified = r(un.Shape());
    const out = [];
    K.explore(unified, 'FACE', f0 => {
      const face = oc.TopoDS.Face(f0);
      const outer = r(oc.BRepTools.OuterWire(face));
      const wires = [];
      K.explore(face, 'WIRE', w => { const wire = oc.TopoDS.Wire(w); (wire.IsSame(outer) ? wires.unshift(wire) : wires.push(wire)); });
      const loops = wires.map(w => wireLoop(w, srcSegs, r)).filter(l => l.length);
      if (loops.length) out.push({ loops });
      face.delete();
    });
    return out;
  } finally { r.free(); }
}

// ordered segments of a planar wire in XY (edges chained end to start)
function wireLoop(wire, srcSegs, r) {
  const oc = getOC();
  const T = oc.GeomAbs_CurveType;
  const segs = [];
  K.explore(wire, 'EDGE', e0 => {
    const e = oc.TopoDS.Edge(e0);
    const ad = r(new oc.BRepAdaptor_Curve(e));
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter();
    const rev = e.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    const at = t => { const p = ad.Value(t); const v = [p.X(), p.Y()]; p.delete(); return v; };
    const a = at(rev ? t1 : t0), b = at(rev ? t0 : t1);
    const ty = ad.GetType();
    let seg;
    if (ty === T.GeomAbs_Line) seg = { kind: 'line', a, b };
    else if (ty === T.GeomAbs_Circle) {
      const c = r(ad.Circle()); const loc = r(c.Location()); const ax = r(c.Axis()); const dz = r(ax.Direction());
      const C = [loc.X(), loc.Y()], R = c.Radius();
      const ccw = (dz.Z() > 0) !== rev;
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) seg = { kind: 'circle', c: C, r: R, cw: !ccw };
      else seg = { kind: 'arc', c: C, r: R, a0: Math.atan2(a[1] - C[1], a[0] - C[0]), a1: Math.atan2(b[1] - C[1], b[0] - C[0]), ccw };
    } else {
      const n = 24, pts = Array.from({ length: n + 1 }, (_, k) => at(rev ? t1 - (t1 - t0) * k / n : t0 + (t1 - t0) * k / n));
      seg = { kind: 'spline', pts };
    }
    seg.src = srcOf(seg, srcSegs);
    seg._a = a; seg._b = b;
    segs.push(seg);
    e.delete();
  });
  // chain: start from the first segment, follow matching endpoints
  if (segs.length <= 1) return segs.map(clean);
  const out = [segs.shift()];
  while (segs.length) {
    const end = out[out.length - 1]._b;
    let k = segs.findIndex(s => Math.hypot(s._a[0] - end[0], s._a[1] - end[1]) < 1e-6);
    if (k < 0) { k = segs.findIndex(s => Math.hypot(s._b[0] - end[0], s._b[1] - end[1]) < 1e-6); if (k >= 0) segs[k] = flip(segs[k]); }
    if (k < 0) k = 0;
    out.push(segs.splice(k, 1)[0]);
  }
  return out.map(clean);
}
const flip = s => ({ ...s, _a: s._b, _b: s._a, ...(s.kind === 'line' ? { a: s.b, b: s.a } : s.kind === 'arc' ? { a0: s.a1, a1: s.a0, ccw: !s.ccw } : s.kind === 'spline' ? { pts: s.pts.slice().reverse() } : {}) });
const clean = s => { const { _a, _b, ...rest } = s; return rest; };
// the src of the input segment a result segment lies on (by its midpoint)
function srcOf(seg, srcSegs) {
  const mid = seg.kind === 'line' ? [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2]
    : seg.kind === 'circle' ? [seg.c[0] + seg.r, seg.c[1]]
    : seg.kind === 'arc' ? (() => { let d = seg.a1 - seg.a0; if (seg.ccw) { while (d <= 0) d += 2 * Math.PI; } else { while (d >= 0) d -= 2 * Math.PI; } const t = seg.a0 + d / 2; return [seg.c[0] + seg.r * Math.cos(t), seg.c[1] + seg.r * Math.sin(t)]; })()
    : seg.pts[Math.floor(seg.pts.length / 2)];
  let best = null, bd = 1e-4;
  for (const s of srcSegs) {
    let d;
    if (s.kind === 'line') d = segDist(mid, s.a, s.b);
    else if (s.kind === 'arc' || s.kind === 'circle') d = Math.abs(Math.hypot(mid[0] - s.c[0], mid[1] - s.c[1]) - s.r);
    else { const P = loopPolygon([s], 64); d = Infinity; for (let i = 0; i + 1 < P.length; i++) d = Math.min(d, segDist(mid, P[i], P[i + 1])); }
    if (d < bd) { bd = d; best = s; }
  }
  return best?.src ?? 'region.edge';
}
function segDist(p, a, b) { const d = [b[0] - a[0], b[1] - a[1]], L = d[0] * d[0] + d[1] * d[1] || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L)); return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]); }
