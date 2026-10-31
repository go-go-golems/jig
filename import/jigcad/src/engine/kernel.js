// Low-level OpenCascade helpers: memory scopes, gp constructors, topology maps, geometric queries.
// Everything above this file speaks plain arrays ([x, y, z]) and never touches gp_* objects directly.
import { getOC } from './oc.js';

// ── memory ───────────────────────────────────────────────────────────────────
// scope(): r(obj) registers an OCCT object for deletion; r.free() deletes everything registered.
export function scope() {
  const list = [];
  const r = o => { if (o && typeof o.delete === 'function') list.push(o); return o; };
  r.free = () => { for (let i = list.length - 1; i >= 0; i--) { try { list[i].delete(); } catch {} } list.length = 0; };
  r.keep = o => { const i = list.indexOf(o); if (i >= 0) list.splice(i, 1); return o; };
  return r;
}
export function withScope(fn) { const r = scope(); try { return fn(r); } finally { r.free(); } }

// Turn an OCCT exception (a pointer or WebAssembly.Exception) into a JS Error with the OCCT message.
export function ocError(e, what = 'OpenCascade') {
  if (e instanceof Error) return e;
  const oc = getOC();
  let msg = String(e);
  try { const m = oc.getExceptionMessage(e); if (Array.isArray(m)) msg = m.filter(Boolean).join(': '); } catch {}
  const err = new Error(`${what} failed: ${msg}`); err.occt = msg; return err;
}
export function occ(what, fn) { try { return fn(); } catch (e) { throw ocError(e, what); } }

// ── vectors (plain arrays) ───────────────────────────────────────────────────
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  unit: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  neg: a => [-a[0], -a[1], -a[2]],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const r6 = x => Math.round(x * 1e6) / 1e6;

// ── gp constructors (caller owns the result: register with a scope) ─────────
export const pnt = p => new (getOC().gp_Pnt)(p[0], p[1], p[2] ?? 0);
export const dir = d => new (getOC().gp_Dir)(d[0], d[1], d[2] ?? 0);
export const vec = d => new (getOC().gp_Vec)(d[0], d[1], d[2] ?? 0);
export function ax1(origin, d, r) { const oc = getOC(); return new oc.gp_Ax1(r(pnt(origin)), r(dir(d))); }
export function ax2(origin, z, x, r) { const oc = getOC(); return x ? new oc.gp_Ax2(r(pnt(origin)), r(dir(z)), r(dir(x))) : new oc.gp_Ax2(r(pnt(origin)), r(dir(z))); }
export function ax3(origin, z, x, r) { const oc = getOC(); return new oc.gp_Ax3(r(pnt(origin)), r(dir(z)), r(dir(x))); }
export const xyz = p => [p.X(), p.Y(), p.Z()];

// 4x4 column-major matrix (world) → gp_Trsf. Only the affine 3x4 part is used.
export function trsfFromMatrix(m) {
  const oc = getOC();
  const t = new oc.gp_Trsf();
  t.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]);
  return t;
}
export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function matMul(a, b) {   // column-major a·b
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
export const matApply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
export const matApplyDir = (m, d) => [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
export const matTranslate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
export function matRotate(axisDir, angle, origin = [0, 0, 0]) {
  const [x, y, z] = V.unit(axisDir), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  const R = [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
  return matMul(matTranslate(...origin), matMul(R, matTranslate(-origin[0], -origin[1], -origin[2])));
}
export function matMirror(normal, origin = [0, 0, 0]) {
  const [a, b, c] = V.unit(normal);
  const M = [1 - 2 * a * a, -2 * a * b, -2 * a * c, 0, -2 * a * b, 1 - 2 * b * b, -2 * b * c, 0, -2 * a * c, -2 * b * c, 1 - 2 * c * c, 0, 0, 0, 0, 1];
  return matMul(matTranslate(...origin), matMul(M, matTranslate(-origin[0], -origin[1], -origin[2])));
}
export function matInverse(m) {   // rigid or mirror (orthonormal 3x3)
  const R = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  const t = matApply(R, [m[12], m[13], m[14]]);
  R[12] = -t[0]; R[13] = -t[1]; R[14] = -t[2];
  return R;
}
export const matDet = m => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
export const isIdentity = m => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-12);

// Frame (plain): { origin, x, y, z } with unit axes; → matrix mapping local coords into world
export const frameMatrix = f => [f.x[0], f.x[1], f.x[2], 0, f.y[0], f.y[1], f.y[2], 0, f.z[0], f.z[1], f.z[2], 0, f.origin[0], f.origin[1], f.origin[2], 1];
export const frameToWorld = (f, u, v, w = 0) => [f.origin[0] + f.x[0] * u + f.y[0] * v + f.z[0] * w, f.origin[1] + f.x[1] * u + f.y[1] * v + f.z[1] * w, f.origin[2] + f.x[2] * u + f.y[2] * v + f.z[2] * w];

// ── topology ─────────────────────────────────────────────────────────────────
const TA = () => getOC().TopAbs_ShapeEnum;
export function shapeTypeName(s) { const t = s.ShapeType(); return String(t?.constructor?.name ?? t).replace('TopAbs_', '') }
export function isType(s, name) { return s.ShapeType() === TA()['TopAbs_' + name]; }

// Unique sub-shapes in TopExp order, with a hash index (TShape + location, orientation ignored, like IsSame).
// Returns { list, indexOf(shape) → 0-based index or -1, free() }. The list holds owned wrappers.
export const HASH_MAX = 2147483647;
export const hashOf = s => getOC().ReplicadShapeHasher.HashCode(s, HASH_MAX);
export class ShapeIndex {
  constructor() { this.list = []; this.buckets = new Map(); }
  add(s) {
    const h = hashOf(s); let b = this.buckets.get(h);
    if (b) for (const i of b) if (this.list[i].IsSame(s)) return i;
    if (!b) this.buckets.set(h, b = []);
    b.push(this.list.length); this.list.push(s); return this.list.length - 1;
  }
  indexOf(s) {
    const b = this.buckets.get(hashOf(s)); if (!b) return -1;
    for (const i of b) if (this.list[i].IsSame(s)) return i;
    return -1;
  }
  free() { for (const s of this.list) s.delete(); this.list = []; this.buckets.clear(); }
}
export function subShapes(shape, kind) {
  const oc = getOC();
  const idx = new ShapeIndex();
  const ex = new oc.TopExp_Explorer(shape, TA()['TopAbs_' + kind], TA().TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) {
    const c = castTo(ex.Current(), kind);
    if (idx.indexOf(c) >= 0) c.delete(); else idx.add(c);
  }
  ex.delete();
  return idx;
}
export function castTo(s, kind) {
  const oc = getOC();
  switch (kind) {
    case 'FACE': return oc.TopoDS.Face(s);
    case 'EDGE': return oc.TopoDS.Edge(s);
    case 'VERTEX': return oc.TopoDS.Vertex(s);
    case 'SOLID': return oc.TopoDS.Solid(s);
    case 'WIRE': return oc.TopoDS.Wire(s);
    case 'SHELL': return oc.TopoDS.Shell(s);
    default: return s;
  }
}
export function explore(shape, kind, fn) {
  const oc = getOC();
  const ex = new oc.TopExp_Explorer(shape, TA()['TopAbs_' + kind], TA().TopAbs_SHAPE);
  try { for (; ex.More(); ex.Next()) fn(ex.Current()); } finally { ex.delete(); }
}
export function countSub(shape, kind) { const idx = subShapes(shape, kind); const n = idx.list.length; idx.free(); return n; }

// NCollection_List → array of new wrappers (caller owns). The list itself is consumed (copied first).
export function listToArray(list, kind) {
  const oc = getOC();
  const copy = new oc.NCollection_List_TopoDS_Shape(list);
  const out = [];
  while (!copy.IsEmpty()) { const s = copy.First(); out.push(kind ? castTo(s, kind) : s); copy.RemoveFirst(); }
  copy.delete();
  return out;
}
export function arrayToList(arr) { const oc = getOC(); const l = new oc.NCollection_List_TopoDS_Shape(); for (const s of arr) l.Append(s); return l; }

export function solidsOf(shape) {
  if (isType(shape, 'SOLID')) return [castTo(shape, 'SOLID')];
  return subShapes(shape, 'SOLID').list;
}
export function makeCompound(shapes) {
  const oc = getOC();
  const b = new oc.TopoDS_Builder(), c = new oc.TopoDS_Compound();
  b.MakeCompound(c);
  for (const s of shapes) b.Add(c, s);
  b.delete();
  return c;
}

// ── properties ───────────────────────────────────────────────────────────────
export function volumeProps(shape) {
  const oc = getOC();
  const p = new oc.GProp_GProps();
  try {
    oc.BRepGProp.VolumeProperties(shape, p, false, false, false);
    const c = p.CentreOfMass(); const out = { volume: p.Mass(), center: xyz(c) }; c.delete();
    return out;
  } finally { p.delete(); }
}
// eps: adaptive integration to that relative error (10× faster on lofted/swept B-spline faces)
export function surfaceProps(shape, eps = 0) {
  const oc = getOC();
  const p = new oc.GProp_GProps();
  try {
    if (eps > 0) oc.BRepGProp.SurfaceProperties(shape, p, eps, false);
    else oc.BRepGProp.SurfaceProperties(shape, p, false, false);
    const c = p.CentreOfMass(); const out = { area: p.Mass(), center: xyz(c) }; c.delete();
    return out;
  } finally { p.delete(); }
}
// Centre of a face for ordering names: exact on analytic surfaces, adaptive (1e-6) on freeform ones.
export function faceCentre(face) {
  const oc = getOC();
  const ad = new oc.BRepAdaptor_Surface(face, true);
  const t = ad.GetType(), T = oc.GeomAbs_SurfaceType; ad.delete();
  const analytic = t === T.GeomAbs_Plane || t === T.GeomAbs_Cylinder || t === T.GeomAbs_Cone || t === T.GeomAbs_Sphere || t === T.GeomAbs_Torus;
  return surfaceProps(face, analytic ? 0 : 1e-6).center;
}
export function linearProps(shape) {
  const oc = getOC();
  const p = new oc.GProp_GProps();
  try {
    oc.BRepGProp.LinearProperties(shape, p, false, false);
    const c = p.CentreOfMass(); const out = { length: p.Mass(), center: xyz(c) }; c.delete();
    return out;
  } finally { p.delete(); }
}
export function bboxOf(shape, optimal = true) {
  const oc = getOC();
  const b = new oc.Bnd_Box();
  try {
    if (optimal) oc.BRepBndLib.AddOptimal(shape, b, false, false); else oc.BRepBndLib.Add(shape, b, false);
    if (b.IsVoid()) return null;
    return [[b.GetXMin(), b.GetYMin(), b.GetZMin()], [b.GetXMax(), b.GetYMax(), b.GetZMax()]];
  } finally { b.delete(); }
}
export function bboxUnion(boxes) {
  const bs = boxes.filter(Boolean); if (!bs.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const [a, b] of bs) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a[i]); hi[i] = Math.max(hi[i], b[i]); }
  return [lo, hi];
}

// Face geometry: kind, normal (outward, for planes), axis (cylinder/cone/sphere/torus), area, center.
export function faceInfo(face) {
  const oc = getOC();
  const r = scope();
  try {
    const ad = r(new oc.BRepAdaptor_Surface(face, true));
    const t = ad.GetType(), T = oc.GeomAbs_SurfaceType;
    const rev = face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    const analytic = t === T.GeomAbs_Plane || t === T.GeomAbs_Cylinder || t === T.GeomAbs_Cone || t === T.GeomAbs_Sphere || t === T.GeomAbs_Torus;
    // freeform faces: from the display triangulation when the body is meshed (exact integration of swept and
    // lofted B-splines costs seconds), else adaptive to 1e-6
    let sp;
    if (!analytic && oc.BRepTools.Triangulation(face, 1e9, false)) { const p = new oc.GProp_GProps(); oc.BRepGProp.SurfaceProperties(face, p, false, true); const c = p.CentreOfMass(); sp = { area: p.Mass(), center: xyz(c) }; c.delete(); p.delete(); }
    else sp = surfaceProps(face, analytic ? 0 : 1e-6);
    const info = { kind: 'other', area: sp.area, center: sp.center };
    if (t === T.GeomAbs_Plane) {
      const pl = r(ad.Plane()); const a = r(pl.Axis()); const d = r(a.Direction());
      // the surface normal is X × Y of the plane's frame: opposite to its axis when the frame is left-handed
      let n = xyz(d); if (pl.Direct && !pl.Direct()) n = V.neg(n); if (rev) n = V.neg(n);
      info.kind = 'plane'; info.normal = n;
    } else if (t === T.GeomAbs_Cylinder) {
      const cy = r(ad.Cylinder()); const a = r(cy.Axis()); const d = r(a.Direction()); const o = r(a.Location());
      info.kind = 'cylinder'; info.axis = { origin: xyz(o), dir: xyz(d), radius: cy.Radius() };
      info.inner = isInnerRevolved(info, face);
    } else if (t === T.GeomAbs_Sphere) {
      const sp2 = r(ad.Sphere()); const o = r(sp2.Location());
      info.kind = 'sphere'; info.axis = { origin: xyz(o), dir: [0, 0, 1], radius: sp2.Radius() };
    } else if (t === T.GeomAbs_Cone) {
      info.kind = 'cone';
      // gp_Cone is not bound: axis from three points on a parallel circle, semi-angle from a generatrix
      try {
        const u0 = ad.FirstUParameter(), u1 = ad.LastUParameter(), v0 = ad.FirstVParameter(), v1 = ad.LastVParameter(), vm = (v0 + v1) / 2;
        const P = (u, v) => { const q = ad.Value(u, v); const x = xyz(q); q.delete(); return x; };
        const A = P(u0, vm), B = P((u0 + u1) / 2, vm), C = P(u1 - (u1 - u0) * 1e-3, vm);
        const ab = V.sub(B, A), ac = V.sub(C, A), nrm = V.cross(ab, ac), n2 = V.dot(nrm, nrm);
        if (n2 > 1e-18) {
          const centre = V.add(A, V.mul(V.add(V.mul(V.cross(nrm, ab), V.dot(ac, ac)), V.mul(V.cross(ac, nrm), V.dot(ab, ab))), 1 / (2 * n2)));
          const dir = V.unit(nrm), g = V.unit(V.sub(P(u0, v1), P(u0, v0)));
          info.axis = { origin: centre, dir, radius: V.dist(A, centre), semiAngle: Math.acos(Math.min(1, Math.abs(V.dot(g, dir)))) };
        }
      } catch {}
    }
    else if (t === T.GeomAbs_Torus) info.kind = 'torus';
    else if (t === T.GeomAbs_BSplineSurface || t === T.GeomAbs_BezierSurface || t === T.GeomAbs_SurfaceOfRevolution || t === T.GeomAbs_SurfaceOfExtrusion) info.kind = 'bspline';
    return info;
  } finally { r.free(); }
}
// A cylinder face is a bore (material outside) when its outward normal points towards the axis.
function isInnerRevolved(info, face) {
  const m = normalMidUV(face);
  if (!m) return false;
  const { origin, dir: d } = info.axis;
  const rel = V.sub(m.point, origin); const rad = V.sub(rel, V.mul(d, V.dot(rel, d)));
  return V.dot(m.normal, rad) < 0;
}
// Point and outward normal at the middle of a face's UV bounds.
export function normalMidUV(face) {
  const oc = getOC();
  const r = scope();
  try {
    const b = oc.BRepTools.UVBounds(face, 0, 0, 0, 0);
    const ad = r(new oc.BRepAdaptor_Surface(face, false));
    const P = r(new oc.gp_Pnt()), du = r(new oc.gp_Vec()), dv = r(new oc.gp_Vec());
    ad.D1((b.UMin + b.UMax) / 2, (b.VMin + b.VMax) / 2, P, du, dv);
    let n = V.unit(V.cross(xyz(du), xyz(dv)));
    if (face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) n = V.neg(n);
    return { point: xyz(P), normal: n };
  } catch { return null; } finally { r.free(); }
}

// Outward normal of a face at (the projection of) a point: { point, normal }
export function normalAt(face, p) {
  const oc = getOC();
  const r = scope();
  try {
    const surf = r(oc.BRep_Tool.Surface(face));
    const proj = r(new oc.GeomAPI_ProjectPointOnSurf(r(pnt(p)), surf, 1e-7));
    if (!proj.NbPoints()) return null;
    const uv = proj.LowerDistanceParameters();
    const ad = r(new oc.BRepAdaptor_Surface(face, false));
    const P = r(new oc.gp_Pnt()), du = r(new oc.gp_Vec()), dv = r(new oc.gp_Vec());
    ad.D1(uv.U, uv.V, P, du, dv);
    let n = V.unit(V.cross(xyz(du), xyz(dv)));
    if (face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) n = V.neg(n);
    return { point: xyz(P), normal: n, uv: [uv.U, uv.V] };
  } catch { return null; } finally { r.free(); }
}

export function edgeInfo(edge) {
  const oc = getOC();
  const r = scope();
  try {
    const ad = r(new oc.BRepAdaptor_Curve(edge));
    const t = ad.GetType(), T = oc.GeomAbs_CurveType;
    const lp = linearProps(edge);
    const u0 = ad.FirstParameter(), u1 = ad.LastParameter();
    const P0 = r(ad.Value(u0)), P1 = r(ad.Value(u1)), Pm = r(ad.Value((u0 + u1) / 2));
    const info = { kind: 'other', length: lp.length, center: lp.center, a: xyz(P0), b: xyz(P1), mid: xyz(Pm) };
    if (t === T.GeomAbs_Line) { info.kind = 'line'; info.dir = V.unit(V.sub(info.b, info.a)); }
    else if (t === T.GeomAbs_Circle) {
      const c = r(ad.Circle()); const a = r(c.Axis()); const o = r(c.Location()); const d = r(a.Direction());
      info.kind = 'circle'; info.axis = { origin: xyz(o), dir: xyz(d), radius: c.Radius() };
      info.closed = Math.abs(u1 - u0 - 2 * Math.PI) < 1e-9;
      info.center = info.axis.origin;
    } else if (t === T.GeomAbs_Ellipse) info.kind = 'ellipse';
    else if (t === T.GeomAbs_BSplineCurve || t === T.GeomAbs_BezierCurve) info.kind = 'bspline';
    return info;
  } finally { r.free(); }
}
// Tangent of an edge at its middle parameter, following the edge's orientation.
export function edgeMidTangent(edge) {
  const oc = getOC();
  const r = scope();
  try {
    const ad = r(new oc.BRepAdaptor_Curve(edge));
    const u = (ad.FirstParameter() + ad.LastParameter()) / 2;
    const P = r(new oc.gp_Pnt()), D = r(new oc.gp_Vec());
    ad.D1(u, P, D);
    let t = V.unit(xyz(D));
    if (edge.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) t = V.neg(t);
    return { point: xyz(P), tangent: t };
  } finally { r.free(); }
}

// Polyline of an edge (for display and slicing).
export function edgePolyline(edge, deflection = 0.05, angular = 0.3) {
  const oc = getOC();
  const r = scope();
  try {
    const ad = r(new oc.BRepAdaptor_Curve(edge));
    // 8-argument form: the 6-argument call is ambiguous with (curve, first, last, …) in this binding
    const d = r(new oc.GCPnts_TangentialDeflection(ad, ad.FirstParameter(), ad.LastParameter(), angular, deflection, 2, 1e-9, 1e-7));
    const n = d.NbPoints(); const out = new Float32Array(n * 3);
    for (let i = 1; i <= n; i++) { const p = r(d.Value(i)); out[(i - 1) * 3] = p.X(); out[(i - 1) * 3 + 1] = p.Y(); out[(i - 1) * 3 + 2] = p.Z(); }
    return out;
  } finally { r.free(); }
}

export function distance(a, b) {
  const oc = getOC();
  const d = new oc.BRepExtrema_DistShapeShape(a, b, oc.Extrema_ExtFlag?.Extrema_ExtFlag_MIN, oc.Extrema_ExtAlgo?.Extrema_ExtAlgo_Grad, new oc.Message_ProgressRange());
  try { return d.IsDone() ? { value: d.Value(), inner: d.InnerSolution() } : { value: Infinity, inner: false }; } finally { d.delete(); }
}

// Transform a shape (copy geometry). Face/edge order is preserved by the copy.
export function transformShape(shape, m) {
  const oc = getOC();
  const t = trsfFromMatrix(m);
  try {
    const tr = new oc.BRepBuilderAPI_Transform(shape, t, true, false);
    const s = tr.Shape(); tr.delete(); return s;
  } finally { t.delete(); }
}

// Rigid placement that shares geometry (a location, no deep copy): cheap for repeated pieces.
export function moveShape(shape, m) {
  const oc = getOC();
  const t = trsfFromMatrix(m);
  try { const tr = new oc.BRepBuilderAPI_Transform(shape, t, false, false); const s = tr.Shape(); tr.delete(); return s; } finally { t.delete(); }
}

export function isValid(shape) {
  const oc = getOC();
  const a = new oc.BRepCheck_Analyzer(shape, true, false);
  try { return a.IsValid(); } finally { a.delete(); }
}

// Distance from a point to a shape (face, edge, solid boundary).
export function pointDistance(shape, p) {
  const oc = getOC();
  const r = scope();
  try {
    const v = r(new oc.BRepBuilderAPI_MakeVertex(r(pnt(p)))).Vertex();
    r(v);
    const d = r(new oc.BRepExtrema_DistShapeShape(v, shape, oc.Extrema_ExtFlag?.Extrema_ExtFlag_MIN, oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad, r(new oc.Message_ProgressRange())));
    return d.IsDone() ? d.Value() : Infinity;
  } finally { r.free(); }
}
