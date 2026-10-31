// Feature operations on named bodies: booleans, fillets, chamfers, shells, transforms, splits.
// Each returns new Body records (inputs are never mutated) plus notes for the trace.
import { getOC } from './oc.js';
import * as K from './kernel.js';
import { Body, carryNames, historyOf, uniquify } from './body.js';

const V = K.V;

// A named solid that is not yet a body (feature output before combining): { shape, names }
export function namedFromExplicit(shape, explicit, featId) {
  const { names, aliases } = carryNames(shape, [], null, featId, explicit);
  explicit.forEach(e => e.shape.delete?.());
  return { shape, names, aliases };
}
export function namedFromRoles(shape, roles, prefix) {
  const fs = K.subShapes(shape, 'FACE');
  const infos = fs.list.map(f => K.faceInfo(f));
  fs.free();
  const names = uniquify(infos.map(i => `${prefix}/${roles(i)}`), i => infos[i].center);
  return { shape, names, aliases: names.map(() => null) };
}
// a pseudo-body for naming purposes (no id, owned faces freed by caller via .free())
export function tmpBody(named) {
  const b = new Body('_tmp', named.shape, named.names, { aliases: named.aliases });
  return b;
}

// Boolean between one body and a set of named tools. op: 'fuse' | 'cut' | 'common'.
// Returns { bodies: [Body] (one per resulting solid), removed: bool }.
export function booleanOp(op, body, tools, featId, { simplify = true, obb = false } = {}) {
  const oc = getOC();
  const r = K.scope();
  try {
    const toolBodies = tools.map(t => t instanceof Body ? t : tmpBody(t));
    const args = r(K.arrayToList([body.shape]));
    const tl = r(K.arrayToList(toolBodies.map(t => t.shape)));
    const mk = r(op === 'fuse' ? new oc.BRepAlgoAPI_Fuse() : op === 'cut' ? new oc.BRepAlgoAPI_Cut() : new oc.BRepAlgoAPI_Common());
    mk.SetArguments(args); mk.SetTools(tl);
    mk.SetRunParallel?.(false);
    // oriented boxes prune face pairs of helical tools (threads: named solids with obb: true) much better
    if (obb || tools.some(t => t.obb)) mk.SetUseOBB?.(true);
    mk.Build(r(new oc.Message_ProgressRange()));
    if (!mk.IsDone() || mk.HasErrors?.()) throw new Error(`boolean ${op} failed`);
    // unifying same-domain faces only pays for planes and cylinders; skip it (and its volume check) for freeform tools
    if (simplify && toolBodies.some(b => b.faces.list.length > 0 && b.names.some((_, i) => !['plane', 'cylinder', 'cone'].includes(b.faceInfo(i).kind)))) simplify = false;
    if (simplify) {
      // unify same-domain faces (coplanar pieces merge, history kept); verify it did not change the solid
      const v0 = K.volumeProps(r(mk.Shape())).volume;
      try { mk.SimplifyResult(true, true, 1e-9); } catch {}
      const v1 = K.volumeProps(r(mk.Shape())).volume;
      if (Math.abs(v1 - v0) > 1e-7 * Math.max(1, Math.abs(v0))) return booleanOp(op, body, tools, featId, { simplify: false, obb });
    }
    const result = mk.Shape();
    const solids = K.solidsOf(result);
    const hist = historyOf(mk);
    const out = solids.map(s => {
      const { names, aliases } = carryNames(s, [{ body }, ...toolBodies.map(b => ({ body: b }))], hist, featId);
      return { shape: s, names, aliases };
    });
    result.delete();
    toolBodies.forEach(b => { if (b.id === '_tmp') b.detach(); });
    return out;
  } finally { r.free(); }
}

// Fuse several named solids into one (used to merge multi-region extrudes).
export function fuseAll(named, featId) {
  if (named.length === 1) return named;
  let acc = named[0];
  for (const t of named.slice(1)) {
    const b = tmpBody(acc);
    const res = booleanOp('fuse', b, [t], featId);
    b.detach();
    if (res.length !== 1) return [acc, ...named.slice(named.indexOf(t))];
    acc = res[0];
  }
  return [acc];
}

// Fillet edges (indices into body.edges) with radii (number or per-edge array).
// A blend only rebuilds the faces along its edges. OpenCascade can report success and still drop faces it never
// touched (a fillet whose rim is tangent to another feature's edge loses that feature): refuse such a result, and
// an invalid one, naming what would be lost.
function checkBlend(mk, shape, body, edgeIdx, kind) {
  const near = new Set(edgeIdx.flatMap(ei => [...(body.edgeFaces[ei] || [])]));
  const lost = [];
  body.faces.list.forEach((f, i) => { if (!near.has(i) && mk.IsDeleted(f)) lost.push(body.names[i]); });
  if (lost.length || !K.isValid(shape)) {
    try { shape.delete(); } catch { /* already freed */ }
    throw Object.assign(new Error(lost.length ? `${kind} would remove ${lost.join(', ')}` : `${kind} gave an invalid solid`), { lost });
  }
}

export function fillet(body, edgeIdx, radii, featId) {
  const oc = getOC();
  const r = K.scope();
  try {
    const mk = r(new oc.BRepFilletAPI_MakeFillet(body.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational));
    edgeIdx.forEach((ei, k) => mk.Add(Array.isArray(radii) ? radii[k] : radii, body.edges.list[ei]));
    mk.Build(r(new oc.Message_ProgressRange()));
    if (!mk.IsDone()) throw new Error('fillet failed');
    const shape = mk.Shape();
    checkBlend(mk, shape, body, edgeIdx, 'fillet');
    const { names, aliases } = carryNames(shape, [{ body }], historyOf(mk), featId, [], { genFrom: featId });
    return { shape, names, aliases };
  } finally { r.free(); }
}
export function chamfer(body, edgeIdx, d, featId, { d2, angle } = {}) {
  const oc = getOC();
  const r = K.scope();
  try {
    const mk = r(new oc.BRepFilletAPI_MakeChamfer(body.shape));
    const ef = body.edgeFaces;
    // asymmetric chamfers measure d on the edge's first face in genealogy order (the order of its name: caps
    // last, then alphabetical), so d and d2 fall on the same kind of face along a whole loop of edges
    const capRank = n => /\/(end|start|top|bottom)\b/.test(n) ? 1 : 0;
    const refFace = ei => [...ef[ei]].sort((a, b) => capRank(body.names[a]) - capRank(body.names[b]) || (body.names[a] < body.names[b] ? -1 : body.names[a] > body.names[b] ? 1 : a - b))[0];
    edgeIdx.forEach(ei => {
      const e = body.edges.list[ei];
      if (angle != null && Math.abs(angle - Math.PI / 4) > 1e-9) mk.AddDA(d, angle, e, body.faces.list[refFace(ei)]);
      else if (d2 != null) mk.Add(d, d2, e, body.faces.list[refFace(ei)]);
      else mk.Add(d, e);
    });
    mk.Build(r(new oc.Message_ProgressRange()));
    if (!mk.IsDone()) throw new Error('chamfer failed');
    const shape = mk.Shape();
    checkBlend(mk, shape, body, edgeIdx, 'chamfer');
    const { names, aliases } = carryNames(shape, [{ body }], historyOf(mk), featId, [], { genFrom: featId });
    return { shape, names, aliases };
  } finally { r.free(); }
}

// Shell: remove open faces, offset the rest inwards by t (negative offset).
// Inner faces are named `${featId}/inner[<face>]`; the rim left of an opened face keeps that face's name.
export function shell(body, openIdx, t, featId, { direction = 'in' } = {}) {
  const oc = getOC();
  const r = K.scope();
  try {
    const mk = r(new oc.BRepOffsetAPI_MakeThickSolid());
    const closing = r(K.arrayToList(openIdx.map(i => body.faces.list[i])));
    const off = direction === 'out' ? t : -t;
    mk.MakeThickSolidByJoin(body.shape, closing, off, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false, r(new oc.Message_ProgressRange()));
    if (!mk.IsDone()) throw new Error('shell failed');
    const shape = mk.Shape();
    const hist = historyOf(mk);
    // inner faces: Modified(original) returns the offset face; originals that survive stay as they are
    const nf = K.subShapes(shape, 'FACE');
    const names = new Array(nf.list.length).fill(null);
    body.faces.list.forEach((f, i) => {
      if (openIdx.includes(i)) return;
      const j = nf.indexOf(f);
      if (j >= 0) names[j] = body.names[i];
      for (const m of hist.modified(f)) { const k = nf.indexOf(m); if (k >= 0 && k !== j) names[k] ??= `${featId}/inner[${body.names[i]}]`; m.delete(); }
      for (const g of hist.generated(f)) { const k = nf.indexOf(g); if (k >= 0) names[k] ??= `${featId}/inner[${body.names[i]}]`; g.delete(); }
    });
    // rims: faces on the plane of an opened face
    const openInfo = openIdx.map(i => ({ name: body.names[i], info: body.faceInfo(i) }));
    let anon = 0;
    nf.list.forEach((f, k) => {
      if (names[k]) return;
      const fi = K.faceInfo(f);
      const rim = openInfo.find(o => o.info.kind === 'plane' && fi.kind === 'plane' && V.dot(o.info.normal, fi.normal) > 1 - 1e-9 && Math.abs(V.dot(V.sub(fi.center, o.info.center), o.info.normal)) < 1e-6);
      if (rim) { names[k] = rim.name; return; }
      // inner faces not reported by history: match by parallel offset of an original face
      for (let i = 0; i < body.nFaces; i++) {
        const oi = body.faceInfo(i);
        if (oi.kind === 'plane' && fi.kind === 'plane' && V.dot(oi.normal, fi.normal) > 1 - 1e-9 && Math.abs(Math.abs(V.dot(V.sub(fi.center, oi.center), oi.normal)) - t) < 1e-6) { names[k] = `${featId}/inner[${body.names[i]}]`; return; }
        if (oi.kind === 'cylinder' && fi.kind === 'cylinder' && Math.abs(Math.abs(oi.axis.radius - fi.axis.radius) - t) < 1e-6 && V.dist(oi.axis.origin, fi.axis.origin) < 1e-6 + t * 2) { names[k] = `${featId}/inner[${body.names[i]}]`; return; }
      }
      names[k] = `${featId}/face#${++anon}`;
    });
    nf.free();
    const nf2 = K.subShapes(shape, 'FACE');
    const uniq = uniquify(names, k => K.faceCentre(nf2.list[k]));
    nf2.free();
    return { shape, names: uniq, aliases: uniq.map(() => null) };
  } finally { r.free(); }
}

// Copy a named solid through a matrix; names get a prefix/suffix via rename(name).
export function transformNamed(named, m, rename = n => n) {
  const shape = K.transformShape(named.shape, m);
  return { shape, names: named.names.map(rename), aliases: (named.aliases ?? named.names.map(() => null)).map(a => a && a.map(rename)), ...(named.obb ? { obb: true } : {}) };
}

// Split a body by a plane (point, normal): two named pieces ('#a' below, '#b' above); cut faces `${featId}/cut`.
export function splitByPlane(body, point, normal, featId) {
  const oc = getOC();
  const r = K.scope();
  try {
    const bb = body.bbox(); const big = V.dist(bb[0], bb[1]) * 4 + 100;
    const n = V.unit(normal);
    const u = Math.abs(n[2]) < 0.9 ? V.unit(V.cross(n, [0, 0, 1])) : V.unit(V.cross(n, [1, 0, 0]));
    const w = V.cross(n, u);
    const o = V.sub(V.sub(V.sub(point, V.mul(u, big / 2)), V.mul(w, big / 2)), V.mul(n, big));
    const pieces = [];
    for (const side of [0, 1]) {
      const origin = side ? V.add(o, V.mul(n, big)) : o;
      const fr = r(K.ax2(origin, n, u, r));
      const half = r(new oc.BRepPrimAPI_MakeBox(fr, big, big, big)).Shape();
      const tool = { shape: half, names: K.subShapes(half, 'FACE').list.map(() => `${featId}/cut`) };
      const res = booleanOp('common', body, [tool], featId, { simplify: false });
      pieces.push(...res.map(x => ({ ...x, side })));
    }
    return pieces;
  } finally { r.free(); }
}

// Does a candidate solid touch/overlap a body? (distance ≤ tol)
export function touches(body, shape, tol = 1e-6) {
  const a = body.bbox(), b = K.bboxOf(shape);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[1][i] < b[0][i] - tol || b[1][i] < a[0][i] - tol) return false;
  return K.distance(body.shape, shape).value <= tol;
}

// Draft: tilt faces by angle about a neutral plane (point, normal = pull direction).
export function draft(body, faceIdx, angle, pull, neutral, featId) {
  const oc = getOC();
  const r = K.scope();
  try {
    const mk = r(new oc.BRepOffsetAPI_DraftAngle(body.shape));
    const pln = r(new oc.gp_Pln(r(K.pnt(neutral)), r(K.dir(pull))));
    for (const i of faceIdx) {
      mk.Add(body.faces.list[i], r(K.dir(pull)), angle, pln, true);
      if (!mk.AddDone()) throw new Error(`cannot draft ${body.names[i]}`);
    }
    mk.Build(r(new oc.Message_ProgressRange()));
    if (!mk.IsDone()) throw new Error('draft failed');
    const shape = mk.Shape();
    const h = historyOf(mk);
    const hist = { ...h, modified: f => { const m = h.modified(f); if (m.length) return m; try { const x = mk.ModifiedShape(f); if (x && !x.IsNull() && !x.IsSame(f)) return [x]; } catch {} return []; } };
    const { names, aliases } = carryNames(shape, [{ body }], hist, featId);
    return { shape, names, aliases };
  } finally { r.free(); }
}
// Thicken faces into a solid (offset by t along their normals).
export function thicken(faces, t, featId) {
  const oc = getOC();
  const r = K.scope();
  try {
    const out = [];
    for (const { face, name } of faces) {
      const mk = r(new oc.BRepOffsetAPI_MakeThickSolid());
      mk.MakeThickSolidBySimple(face, t);
      mk.Build(r(new oc.Message_ProgressRange()));
      if (!mk.IsDone()) throw new Error(`cannot thicken ${name}`);
      const shape = mk.Shape();
      const solids = K.solidsOf(shape).map(x => { if (K.volumeProps(x).volume < 0) { const rv = K.castTo(x.Reversed(), 'SOLID'); x.delete(); return rv; } return x; });
      for (const sld of solids) {
        const fs = K.subShapes(sld, 'FACE');
        const names = fs.list.map(f => { const m = K.faceInfo(f); return m.kind === 'plane' && K.pointDistance(face, m.center) < Math.abs(t) * 1e-3 + 1e-6 ? `${featId}/base[${name}]` : `${featId}/face`; });
        fs.free();
        out.push({ shape: sld, names: uniquify(names, i => [i, 0, 0]) });
      }
    }
    return out;
  } finally { r.free(); }
}
