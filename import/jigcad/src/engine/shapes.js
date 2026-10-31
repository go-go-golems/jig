// Shape construction with names: profile loops → wires/faces, prisms, revolves, lofts, sweeps, primitives.
// Every maker returns { shape, names } where names come from the maker's own history (Generated).
// Profile (kernel form): { frame: { origin, x, y, z }, regions: [{ loops: [Loop, …] }] }  (first loop outer)
// Loop: [{ kind: 'line', a, b, src } | { kind: 'arc', c, r, a0, a1, ccw, src } | { kind: 'circle', c, r, src }
//        | { kind: 'spline', pts, closed?, src } | { kind: 'ellipse', c, rx, ry, angle, src }]   (2D, mm)
import { getOC } from './oc.js';
import * as K from './kernel.js';
import { bezierPoint } from './fonts.js';

const V = K.V;
const W = (f, p) => K.frameToWorld(f, p[0], p[1]);

// Signed area of a loop (polygonised), > 0 = counter-clockwise in the frame.
export function loopArea(loop) {
  const pts = loopPolygon(loop, 64);
  let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
// Exact signed area by Green's theorem, ½∮(x dy − y dx): lines and arcs in closed form, circles and ellipses
// whole, splines and Béziers through fine polylines.
export function loopAreaExact(loop) {
  let a = 0;
  const seg = (p, q) => { a += (p[0] * q[1] - q[0] * p[1]) / 2; };
  for (const s of loop) {
    if (s.kind === 'line') seg(s.a, s.b);
    else if (s.kind === 'circle') return (s.cw ? -1 : 1) * Math.PI * s.r * s.r;
    else if (s.kind === 'ellipse') return (s.cw ? -1 : 1) * Math.PI * s.rx * s.ry;
    else if (s.kind === 'arc') {
      const d = arcSweep(s), t0 = s.a0, t1 = s.a0 + d, [cx, cy] = s.c, r = s.r;
      a += (r * r * d + r * (cx * (Math.sin(t1) - Math.sin(t0)) - cy * (Math.cos(t1) - Math.cos(t0)))) / 2;
    } else if (s.kind === 'spline' || s.kind === 'bezier') {
      const P = s.kind === 'bezier' ? Array.from({ length: 65 }, (_, i) => bezierPoint(s.pts, i / 64)) : s.closed ? [...s.pts, s.pts[0]] : s.pts;
      for (let i = 0; i + 1 < P.length; i++) seg(P[i], P[i + 1]);
    }
  }
  return a;
}
export function loopPolygon(loop, n = 24) {
  const out = [];
  for (const s of loop) {
    if (s.kind === 'line') out.push(s.a);
    else if (s.kind === 'circle') for (let i = 0; i < n * 2; i++) { const t = (i / (n * 2)) * 2 * Math.PI; out.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]); }
    else if (s.kind === 'ellipse') for (let i = 0; i < n * 2; i++) { const t = (i / (n * 2)) * 2 * Math.PI, ca = Math.cos(s.angle ?? 0), sa = Math.sin(s.angle ?? 0); const x = s.rx * Math.cos(t), y = s.ry * Math.sin(t); out.push([s.c[0] + x * ca - y * sa, s.c[1] + x * sa + y * ca]); }
    else if (s.kind === 'arc') {
      let sweep = arcSweep(s);
      for (let i = 0; i < n; i++) { const t = s.a0 + sweep * i / n; out.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]); }
    } else if (s.kind === 'spline') { const P = s.pts; for (let i = 0; i < P.length - (s.closed ? 0 : 1); i++) out.push(P[i]); }
    else if (s.kind === 'bezier') for (let i = 0; i < 8; i++) out.push(bezierPoint(s.pts, i / 8));
  }
  return out;
}
export function arcSweep(s) {
  let d = s.a1 - s.a0;
  if (s.ccw !== false) { while (d <= 0) d += 2 * Math.PI; while (d > 2 * Math.PI) d -= 2 * Math.PI; }
  else { while (d >= 0) d -= 2 * Math.PI; while (d < -2 * Math.PI) d += 2 * Math.PI; }
  return d;
}
const segStart = s => s.kind === 'line' ? s.a : s.kind === 'arc' ? [s.c[0] + s.r * Math.cos(s.a0), s.c[1] + s.r * Math.sin(s.a0)] : s.kind === 'spline' ? s.pts[0] : null;
const segEnd = s => s.kind === 'line' ? s.b : s.kind === 'arc' ? [s.c[0] + s.r * Math.cos(s.a1), s.c[1] + s.r * Math.sin(s.a1)] : s.kind === 'spline' ? s.pts[s.pts.length - 1] : null;
export function reverseLoop(loop) {
  return loop.slice().reverse().map(s => s.kind === 'line' ? { ...s, a: s.b, b: s.a }
    : s.kind === 'arc' ? { ...s, a0: s.a1, a1: s.a0, ccw: s.ccw === false } : s.kind === 'spline' || s.kind === 'bezier' ? { ...s, pts: s.pts.slice().reverse() }
    : s.kind === 'circle' ? { ...s, cw: !s.cw } : { ...s, cw: !s.cw });
}

// One 3D edge per segment; returns [{ edge, src }]
function segEdges(frame, s, r) {
  const oc = getOC();
  const z = frame.z, x = frame.x;
  if (s.kind === 'line') {
    const A = W(frame, s.a), B = W(frame, s.b);
    if (V.dist(A, B) < 1e-9) return [];
    return [{ edge: new oc.BRepBuilderAPI_MakeEdge(r(K.pnt(A)), r(K.pnt(B))).Edge(), src: s.src }];
  }
  if (s.kind === 'circle' || s.kind === 'arc') {
    const circ = r(new oc.gp_Circ(r(K.ax2(W(frame, s.c), z, x, r)), s.r));
    if (s.kind === 'circle') {
      let e = new oc.BRepBuilderAPI_MakeEdge(circ).Edge();
      if (s.cw) { const rev = oc.TopoDS.Edge(e.Reversed()); e.delete(); e = rev; }
      return [{ edge: e, src: s.src }];
    }
    const sw = arcSweep(s);
    if (sw > 0) return [{ edge: new oc.BRepBuilderAPI_MakeEdge(circ, s.a0, s.a0 + sw).Edge(), src: s.src }];
    const e = new oc.BRepBuilderAPI_MakeEdge(circ, s.a0 + sw, s.a0).Edge();
    const rev = oc.TopoDS.Edge(e.Reversed()); e.delete();
    return [{ edge: rev, src: s.src }];
  }
  if (s.kind === 'ellipse') {
    const xa = V.add(V.mul(x, Math.cos(s.angle ?? 0)), V.mul(frame.y, Math.sin(s.angle ?? 0)));
    const [maj, min, xd] = s.rx >= s.ry ? [s.rx, s.ry, xa] : [s.ry, s.rx, V.cross(z, xa)];
    const el = r(new oc.gp_Elips(r(K.ax2(W(frame, s.c), z, xd, r)), maj, min));
    let e = new oc.BRepBuilderAPI_MakeEdge(el).Edge();
    if (s.cw) { const rev = oc.TopoDS.Edge(e.Reversed()); e.delete(); e = rev; }
    return [{ edge: e, src: s.src }];
  }
  if (s.kind === 'bezier') {
    const pts = s.pts.map(p => W(frame, p));
    if (V.dist(pts[0], pts[pts.length - 1]) < 1e-9) return [];
    const arr = r(new oc.NCollection_Array1_gp_Pnt(1, pts.length));
    pts.forEach((p, i) => arr.SetValue(i + 1, r(K.pnt(p))));
    const bz = r(new oc.Geom_BezierCurve(arr));
    return [{ edge: new oc.BRepBuilderAPI_MakeEdge(bz).Edge(), src: s.src }];
  }
  if (s.kind === 'spline') {
    const pts = s.pts.map(p => W(frame, p));
    const curve = interpolate3d(pts, !!s.closed, r);
    return [{ edge: new oc.BRepBuilderAPI_MakeEdge(curve).Edge(), src: s.src }];
  }
  throw new Error(`unknown segment kind ${s.kind}`);
}
export function interpolate3d(pts, closed, r) {
  const oc = getOC();
  const P = closed && V.dist(pts[0], pts[pts.length - 1]) < 1e-9 ? pts.slice(0, -1) : pts;
  const a1 = r(new oc.NCollection_Array1_gp_Pnt(1, P.length));
  P.forEach((p, i) => a1.SetValue(i + 1, r(K.pnt(p))));
  const arr = r(new oc.NCollection_HArray1_gp_Pnt(a1));
  const interp = r(new oc.GeomAPI_Interpolate(arr, closed, 1e-7));
  interp.Perform();
  if (!interp.IsDone()) throw new Error('spline interpolation failed');
  return r(interp.Curve());
}

// Wire for one loop: { wire, edges: [{ edge, src }] } — edges as stored in the wire (MakeWire may copy them).
export function makeWire(frame, loop, r) {
  const oc = getOC();
  const mw = r(new oc.BRepBuilderAPI_MakeWire());
  const edges = [];
  for (const s of loop) for (const e of segEdges(frame, s, r)) {
    mw.Add(e.edge);
    if (!mw.IsDone()) throw new Error(`profile loop is not connected at ${e.src}`);
    edges.push({ edge: mw.Edge(), src: e.src });
    e.edge.delete();
  }
  return { wire: mw.Wire(), edges };
}

// Face for one region; edges carry their sketch-entity src.
export function makeRegionFace(frame, region, r) {
  const oc = getOC();
  const loops = region.loops.map((l, k) => {
    const a = loopArea(l);
    return (k === 0) === (a > 0) ? l : reverseLoop(l);
  });
  const outer = makeWire(frame, loops[0], r);
  const pln = r(new oc.gp_Pln(r(K.ax3(frame.origin, frame.z, frame.x, r))));
  const mf = r(new oc.BRepBuilderAPI_MakeFace(pln, outer.wire, true));
  const edges = outer.edges.slice();
  for (const hl of loops.slice(1)) { const h = makeWire(frame, hl, r); mf.Add(h.wire); edges.push(...h.edges); }
  if (!mf.IsDone()) throw new Error('could not make a face from the profile');
  let face = mf.Face();
  const fix = r(new oc.ShapeFix_Face(face));
  fix.FixOrientation();
  const fixed = oc.TopoDS.Face(fix.Face());
  return { face: fixed, edges };
}

// For a generated face list, keep only faces (and delete the rest).
const castFace = f => getOC().TopoDS.Face(f);
const facesOnly = arr => arr.filter(s => { if (K.isType(s, 'FACE')) return true; s.delete(); return false; });

// Extrude every region of a profile. dirVec: world vector (length = distance); offset: shift along z before.
// names: `${id}/side[${src}]`, `${id}/start`, `${id}/end` (with #a/#b when several regions).
export function prism(profile, { id, dist, offset = 0, dirOverride }) {
  const oc = getOC();
  const r = K.scope();
  try {
    const dirv = dirOverride ?? profile.frame.z;
    const fr = offset ? { ...profile.frame, origin: V.add(profile.frame.origin, V.mul(dirv, offset)) } : profile.frame;
    const results = [];
    profile.regions.forEach((region, ri) => {
      const { face, edges } = makeRegionFace(fr, region, r);
      r(face);
      const mk = r(new oc.BRepPrimAPI_MakePrism(face, r(K.vec(V.mul(dirv, dist))), false, true));
      mk.Build(r(new oc.Message_ProgressRange()));
      const shape = mk.Shape();
      const suffix = profile.regions.length > 1 ? `#${String.fromCharCode(97 + ri)}` : '';
      const explicit = [];
      for (const { edge, src } of edges) for (const g of facesOnly(K.listToArray(mk.Generated(edge)))) explicit.push({ shape: g, name: `${id}/side[${src}]` });
      const first = mk.FirstShape(), last = mk.LastShape();
      const flip = dist < 0;
      explicit.push({ shape: first, name: `${id}/${flip ? 'end' : 'start'}${suffix}` }, { shape: last, name: `${id}/${flip ? 'start' : 'end'}${suffix}` });
      results.push({ shape, explicit });
      edges.forEach(e => e.edge.delete());
    });
    return results;
  } finally { r.free(); }
}

// Tapered extrude: loft between the profile and its offset (by dist·tan(taper)) at the far end.
export function taperedPrism(profile, { id, dist, taper }) {
  const oc = getOC();
  const r = K.scope();
  try {
    const results = [];
    const d = dist * Math.tan(taper);
    profile.regions.forEach((region, ri) => {
      if (region.loops.length > 1) throw new Error('taper supports profiles without holes');
      const loop = loopArea(region.loops[0]) > 0 ? region.loops[0] : reverseLoop(region.loops[0]);
      const w0 = makeWire(profile.frame, loop, r);
      const top = { ...profile.frame, origin: V.add(profile.frame.origin, V.mul(profile.frame.z, dist)) };
      const w1 = makeWire(top, loop, r);
      const off = r(new oc.BRepOffsetAPI_MakeOffset(w1.wire, oc.GeomAbs_JoinType.GeomAbs_Intersection, false));
      off.Perform(d, 0);
      const w1o = oc.TopoDS.Wire(off.Shape());
      const ts = r(new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6));
      ts.AddWire(w0.wire); ts.AddWire(w1o);
      ts.CheckCompatibility(false);
      ts.Build(r(new oc.Message_ProgressRange()));
      const shape = ts.Shape();
      const suffix = profile.regions.length > 1 ? `#${String.fromCharCode(97 + ri)}` : '';
      const explicit = [];
      for (const { edge, src } of w0.edges) for (const g of facesOnly(K.listToArray(ts.Generated(edge)))) explicit.push({ shape: g, name: `${id}/side[${src}]` });
      explicit.push({ shape: ts.FirstShape(), name: `${id}/start${suffix}` }, { shape: ts.LastShape(), name: `${id}/end${suffix}` });
      results.push({ shape, explicit });
    });
    return results;
  } finally { r.free(); }
}

// Twisted extrude: sections of the profile rotated about the frame's z axis, lofted smoothly (B-spline through
// ≥ 3 sections per span, ≤ 0.2 rad of twist between sections). twist = rotation of the end section; with
// herringbone the middle section is rotated by twist and the end comes back to 0. Every loop (holes too) gets
// lateral loft shells; circles on the axis stay exact cylinders; the caps are planar faces; all are sewn into
// one solid (no booleans). Names: `${id}/side[src]` (#1 lower, #2 upper half), `${id}/start`, `${id}/end`.
export function twistedPrism(profile, { id, dist, offset = 0, twist, herringbone = false }) {
  const oc = getOC();
  const r = K.scope();
  try {
    const fr0 = offset ? { ...profile.frame, origin: V.add(profile.frame.origin, V.mul(profile.frame.z, offset)) } : profile.frame;
    const halves = herringbone ? 2 : 1, segLen = dist / halves;
    const nsec = Math.max(3, Math.ceil(Math.abs(twist) / 0.2) + 1);
    const rot = (loop, a) => { const c = Math.cos(a), s = Math.sin(a), R = p => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
      return loop.map(sg => sg.kind === 'arc' ? { ...sg, c: R(sg.c), a0: sg.a0 + a, a1: sg.a1 + a } : sg.kind === 'circle' ? { ...sg, c: R(sg.c) } : sg.kind === 'ellipse' ? { ...sg, c: R(sg.c), angle: (sg.angle ?? 0) + a } : sg.kind === 'line' ? { ...sg, a: R(sg.a), b: R(sg.b) } : sg.kind === 'bezier' || sg.kind === 'spline' ? { ...sg, pts: sg.pts.map(R) } : sg); };
    const frameAt = z => ({ ...fr0, origin: V.add(fr0.origin, V.mul(fr0.z, z)) });
    // section k of the whole height: height and rotation
    const nTot = halves * (nsec - 1) + 1;
    const secAt = k => { const half = Math.min(halves - 1, Math.floor(k / (nsec - 1))), j = k - half * (nsec - 1); const h = half === 0 ? j : nsec - 1 - j; return { z: segLen * k / (nsec - 1), a: twist * h / (nsec - 1) }; };
    const results = [];
    profile.regions.forEach((region, ri) => {
      const loops = region.loops.map((l, k) => (k === 0) === (loopArea(l) > 0) ? l : reverseLoop(l));
      const named = [];
      const sew = r(new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false));
      for (const loop of loops) {
        const axisCircle = loop.length === 1 && loop[0].kind === 'circle' && Math.hypot(...loop[0].c) < 1e-9;
        if (axisCircle) {
          // twisting changes nothing: an exact cylinder
          const w = makeWire(fr0, loop, r);
          const mk = r(new oc.BRepPrimAPI_MakePrism(w.wire, r(K.vec(V.mul(fr0.z, dist))), false, true));
          for (const { edge, src } of w.edges) for (const g of facesOnly(K.listToArray(mk.Generated(edge)))) named.push({ shape: g, name: `${id}/side[${src}]` });
          sew.Add(r(mk.Shape()));
          continue;
        }
        const wires = Array.from({ length: nTot }, (_, k) => { const sc = secAt(k); return makeWire(frameAt(sc.z), rot(loop, sc.a), r); });
        for (let h = 0; h < halves; h++) {
          const sec = wires.slice(h * (nsec - 1), h * (nsec - 1) + nsec);
          const ts = r(new oc.BRepOffsetAPI_ThruSections(false, false, 1e-6));
          sec.forEach(w => ts.AddWire(w.wire)); ts.CheckCompatibility(false);
          ts.Build(r(new oc.Message_ProgressRange()));
          if (!ts.IsDone()) throw new Error('twisted extrude: loft failed');
          for (const { edge, src } of sec[0].edges) for (const g of facesOnly(K.listToArray(ts.Generated(edge)))) named.push({ shape: g, name: `${id}/side[${src}]` });
          sew.Add(r(ts.Shape()));
        }
      }
      // caps (returned via explicit: not scoped)
      const last = secAt(nTot - 1);
      const capA = makeRegionFace(frameAt(0), { loops }, r).face, capB = makeRegionFace(frameAt(dist), { loops: loops.map(l => rot(l, last.a)) }, r).face;
      const suffix = profile.regions.length > 1 ? `#${String.fromCharCode(97 + ri)}` : '';
      named.push({ shape: capA, name: `${id}/start${suffix}` }, { shape: capB, name: `${id}/end${suffix}` });
      sew.Add(capA); sew.Add(capB);
      sew.Perform(r(new oc.Message_ProgressRange()));
      const sewn = r(sew.SewedShape());
      let shell = null, nShells = 0; K.explore(sewn, 'SHELL', s => { nShells++; if (!shell) shell = oc.TopoDS.Shell(s); });
      if (!shell || nShells !== 1) throw new Error(`twisted extrude: the faces sewed into ${nShells} shells`);
      let solid = r(new oc.BRepBuilderAPI_MakeSolid(shell)).Solid();
      if (K.volumeProps(solid).volume < 0) solid = oc.TopoDS.Solid(solid.Reversed());
      const explicit = named.map(n => ({ shape: sew.IsModified(n.shape) ? sew.Modified(n.shape) : n.shape, name: n.name }));
      results.push({ shape: solid, explicit });
    });
    return results;
  } finally { r.free(); }
}

// Revolve each region about a world axis { origin, dir } by angle (rad).
export function revolve(profile, { id, axis, angle }) {
  const oc = getOC();
  const r = K.scope();
  try {
    const full = Math.abs(Math.abs(angle) - 2 * Math.PI) < 1e-9;
    return profile.regions.map((region, ri) => {
      const { face, edges } = makeRegionFace(profile.frame, region, r);
      r(face);
      const a1 = r(K.ax1(axis.origin, axis.dir, r));
      const mk = r(full ? new oc.BRepPrimAPI_MakeRevol(face, a1, false) : new oc.BRepPrimAPI_MakeRevol(face, a1, angle, false));
      mk.Build(r(new oc.Message_ProgressRange()));
      const shape = mk.Shape();
      const suffix = profile.regions.length > 1 ? `#${String.fromCharCode(97 + ri)}` : '';
      const explicit = [];
      for (const { edge, src } of edges) for (const g of facesOnly(K.listToArray(mk.Generated(edge)))) explicit.push({ shape: g, name: `${id}/side[${src}]` });
      if (!full) explicit.push({ shape: mk.FirstShape(), name: `${id}/start${suffix}` }, { shape: mk.LastShape(), name: `${id}/end${suffix}` });
      // full revolves: Generated() misses faces whose edges were merged; find their generator geometrically
      const all = K.subShapes(shape, 'FACE');
      const named = new Set(explicit.map(e => all.indexOf(e.shape)));
      all.list.forEach((f, i) => {
        if (named.has(i)) return;
        for (const { edge, src } of edges) {
          const m = K.edgeInfo(edge).mid;
          if (K.pointDistance(f, m) < 1e-6) { explicit.push({ shape: castFace(f), name: `${id}/side[${src}]` }); break; }
        }
      });
      all.free();
      edges.forEach(e => e.edge.delete());
      return { shape, explicit };
    });
  } finally { r.free(); }
}

// Loft through profiles (one region each, outer loop only).
export function loft(profiles, { id, ruled = false, closed = false }) {
  const oc = getOC();
  const r = K.scope();
  try {
    const ts = r(new oc.BRepOffsetAPI_ThruSections(true, ruled, 1e-6));
    let firstEdges = null;
    for (const p of profiles) {
      if (p.point) { ts.AddVertex(r(new oc.BRepBuilderAPI_MakeVertex(r(K.pnt(p.point)))).Vertex()); continue; }
      const loop = p.regions[0].loops[0];
      const w = makeWire(p.frame, loopArea(loop) > 0 ? loop : reverseLoop(loop), r);
      ts.AddWire(w.wire); firstEdges ??= w.edges;
    }
    ts.CheckCompatibility(true);
    ts.Build(r(new oc.Message_ProgressRange()));
    const shape = ts.Shape();
    const explicit = [];
    for (const { edge, src } of firstEdges ?? []) for (const g of facesOnly(K.listToArray(ts.Generated(edge)))) explicit.push({ shape: g, name: `${id}/side[${src}]` });
    try { explicit.push({ shape: ts.FirstShape(), name: `${id}/start` }); } catch {}
    try { explicit.push({ shape: ts.LastShape(), name: `${id}/end` }); } catch {}
    return [{ shape, explicit: explicit.filter(e => !e.shape.IsNull()) }];
  } finally { r.free(); }
}

// Sweep a profile along a path wire. frame: 'rmf' (corrected Frenet) | 'frenet' | 'fixed'.
export function sweep(profile, pathWire, { id, frame = 'rmf', auxDir }) {
  const oc = getOC();
  const r = K.scope();
  try {
    const out = [];
    for (const region of profile.regions) {
      const loop = loopArea(region.loops[0]) > 0 ? region.loops[0] : reverseLoop(region.loops[0]);
      const w = makeWire(profile.frame, loop, r);
      const ps = r(new oc.BRepOffsetAPI_MakePipeShell(pathWire));
      if (frame === 'frenet') ps.SetMode(true);
      else if (frame === 'fixed') ps.SetMode(r(K.ax2(profile.frame.origin, profile.frame.z, profile.frame.x, r)));
      else if (frame === 'binormal' && auxDir) ps.SetMode(r(K.dir(auxDir)));
      else ps.SetMode(false);   // corrected Frenet: rotation-minimising
      ps.Add(w.wire, false, false);
      ps.Build(r(new oc.Message_ProgressRange()));
      if (!ps.IsDone()) throw new Error('sweep failed');
      ps.MakeSolid();
      const shape = ps.Shape();
      const explicit = [];
      for (const { edge, src } of w.edges) for (const g of facesOnly(K.listToArray(ps.Generated(edge)))) explicit.push({ shape: g, name: `${id}/side[${src}]` });
      try { explicit.push({ shape: ps.FirstShape(), name: `${id}/start` }, { shape: ps.LastShape(), name: `${id}/end` }); } catch {}
      out.push({ shape, explicit: explicit.filter(e => !e.shape.IsNull()) });
    }
    return out;
  } finally { r.free(); }
}

// Path wires for sweeps from 3D path segments: [{ kind: 'line', a, b } | { kind: 'spline', pts } | { kind: 'helix', origin, axis, r, pitch, turns }]
export function pathWire(segs, r) {
  const oc = getOC();
  const mw = r(new oc.BRepBuilderAPI_MakeWire());
  for (const s of segs) {
    if (s.kind === 'line') mw.Add(r(new oc.BRepBuilderAPI_MakeEdge(r(K.pnt(s.a)), r(K.pnt(s.b))).Edge()));
    else if (s.kind === 'spline') mw.Add(r(new oc.BRepBuilderAPI_MakeEdge(interpolate3d(s.pts, false, r)).Edge()));
    else if (s.kind === 'arc3') mw.Add(r(new oc.BRepBuilderAPI_MakeEdge(r(new oc.GC_MakeArcOfCircle(r(K.pnt(s.a)), r(K.pnt(s.m)), r(K.pnt(s.b))).Value())).Edge()));
    else if (s.kind === 'helix') mw.Add(helixWire(s, r));
  }
  return mw.Wire();
}
// pieces > 1: one edge per piece (threads: smaller helical faces intersect far more reliably)
function helixWire({ origin = [0, 0, 0], axis = [0, 0, 1], r: rad, pitch, turns, pieces = 1 }, r) {
  const oc = getOC();
  const z = V.unit(axis), x = Math.abs(z[2]) > 0.9 ? [1, 0, 0] : V.unit(V.cross([0, 0, 1], z));
  const surf = new oc.Geom_CylindricalSurface(r(K.ax3(origin, z, x, r)), rad);
  const mw = r(new oc.BRepBuilderAPI_MakeWire());
  for (let i = 0; i < pieces; i++) {
    const t0 = turns * i / pieces, t1 = turns * (i + 1) / pieces;
    const seg = r(new oc.GC_MakeSegment2d(r(new oc.gp_Pnt2d(2 * Math.PI * t0, pitch * t0)), r(new oc.gp_Pnt2d(2 * Math.PI * t1, pitch * t1))));
    const e = r(new oc.BRepBuilderAPI_MakeEdge(seg.Value(), surf)).Edge();
    oc.BRepLib.BuildCurves3d(e);
    mw.Add(e);
  }
  const w = mw.Wire();
  return w;
}

// Primitives with face names. Box faces: left right front back bottom top (−X +X −Y +Y −Z +Z).
export function box(w, d, h, { center = false } = {}) {
  const oc = getOC();
  const r = K.scope();
  try {
    const o = center === true ? [-w / 2, -d / 2, -h / 2] : center === 'xy' ? [-w / 2, -d / 2, 0] : [0, 0, 0];
    const mk = r(new oc.BRepPrimAPI_MakeBox(r(K.pnt(o)), r(K.pnt([o[0] + w, o[1] + d, o[2] + h]))));
    const shape = mk.Shape();
    return { shape, roles: (info) => roleByNormal(info) };
  } finally { r.free(); }
}
export function roleByNormal(info) {
  if (info.kind !== 'plane') return 'face';
  const n = info.normal, a = n.map(Math.abs), i = a.indexOf(Math.max(...a));
  return [['left', 'right'], ['front', 'back'], ['bottom', 'top']][i][n[i] > 0 ? 1 : 0];
}
export function cylinder(rad, h, { center = false, axis = [0, 0, 1], origin = [0, 0, 0] } = {}) {
  const oc = getOC();
  const r = K.scope();
  try {
    const o = center ? V.sub(origin, V.mul(V.unit(axis), h / 2)) : origin;
    const mk = r(new oc.BRepPrimAPI_MakeCylinder(r(K.ax2(o, axis, null, r)), rad, h));
    return { shape: mk.Shape(), roles: info => info.kind === 'plane' ? (V.dot(info.normal, axis) > 0 ? 'top' : 'bottom') : 'side' };
  } finally { r.free(); }
}
export function sphere(rad, { center = [0, 0, 0] } = {}) {
  const oc = getOC();
  const r = K.scope();
  try {
    const mk = r(new oc.BRepPrimAPI_MakeSphere(r(K.pnt(center)), rad));
    return { shape: mk.Shape(), roles: () => 'surface' };
  } finally { r.free(); }
}
export function cone(r1, r2, h) {
  // revolve a trapezoid about Z (BRepPrimAPI_MakeCone is not in this build)
  const pts = [[0, 0], [r1, 0], [r2, h], [0, h]].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  const loop = pts.map((p, i) => ({ kind: 'line', a: p, b: pts[(i + 1) % pts.length], src: ['bottom', 'side', 'top', 'axis'][i] })).filter(s => V.dist([...s.a, 0], [...s.b, 0]) > 1e-12);
  const prof = { frame: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] }, regions: [{ loops: [loop] }] };
  const [res] = revolve(prof, { id: 'c', axis: { origin: [0, 0, 0], dir: [0, 0, 1] }, angle: 2 * Math.PI });
  res.explicit.forEach(e => e.shape.delete());
  return { shape: res.shape, roles: info => info.kind === 'plane' ? (info.normal[2] > 0 ? 'top' : 'bottom') : 'side' };
}
export function torus(R, rr) {
  const oc = getOC();
  const r = K.scope();
  try {
    const mk = r(new oc.BRepPrimAPI_MakeTorus(r(K.ax2([0, 0, 0], [0, 0, 1], null, r)), R, rr));
    return { shape: mk.Shape(), roles: () => 'surface' };
  } finally { r.free(); }
}
