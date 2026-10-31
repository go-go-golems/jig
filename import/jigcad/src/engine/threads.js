// Printed threads (README §4.9 j.lib.thread): a tooth profile swept along a helix (binormal = axis, so the
// profile keeps its angle to the axis), fused with a core cylinder and clipped to length by planes. External
// threads add material (bolts, jar necks); internal threads are cutting tools (nuts, lids, tapped holes).
//
// The solid is screw-invariant between the clip planes, so its cross-section area is constant and
//   V = π·rMinor²·L + A·2π·r̄·L / pitch        (A, r̄: area and centroid radius of the tooth above rMinor)
// which `threadVolume` returns; the tests hold the modelled solid to it.
import { getOC } from './oc.js';
import * as K from './kernel.js';
import * as S from './shapes.js';
import { booleanOp, tmpBody } from './ops.js';
import { uniquify } from './body.js';
import { METRIC } from './holes.js';

const THREAD_PIECE_TURNS = 1;   // one helix edge per turn: long single-edge sweeps fail to intersect the core (M12×15)
export const PROFILES = {
  // depth (radial, × pitch); crest = flat at the major radius, base = width at the minor radius (× pitch);
  // lead = axial offset of the crest's low end from the base's low end (× pitch), for asymmetric flanks.
  iso: { depth: 0.5413, crest: 0.125, base: 0.75, angle: '60° (ISO 68-1 basic profile: crest P/8, root P/4)' },
  trapezoid: { depth: 0.5, crest: 0.366, base: 0.634, angle: '30° (ISO 2904 Tr)' },
  buttress: { depth: 0.6, crest: 0.1, base: 0.478, lead: 0.6 * Math.tan(3 * Math.PI / 180), angle: '3°/30° (load flank toward −z)' },
};
// 'M8x1.25' | 'M8' | 'Tr40x3' | { d, pitch } → { d, pitch, label }
export function threadSpec(spec) {
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) return { d: num(spec.d), pitch: num(spec.pitch), label: spec.label ?? `Ø${num(spec.d)}×${num(spec.pitch)}` };
  const s = String(spec);
  const tr = /^Tr\s*([\d.]+)\s*[x×]\s*([\d.]+)/i.exec(s);
  if (tr) return { d: +tr[1], pitch: +tr[2], label: `Tr${tr[1]}×${tr[2]}`, profile: 'trapezoid' };
  const m = /^M([\d.]+)(?:\s*[x×]\s*([\d.]+))?/i.exec(s);
  if (!m) throw new Error(`thread: unknown spec '${spec}' (use 'M8x1.25', 'Tr40x3' or { d, pitch })`);
  const key = `M${m[1]}`; const d = +m[1];
  const pitch = m[2] ? +m[2] : METRIC[key]?.pitch ?? coarsePitch(d);
  return { d, pitch, label: `M${m[1]}×${pitch}` };
}
// ISO 261 coarse pitches for sizes outside the hole table
const COARSE = [[1, 0.25], [1.2, 0.25], [1.6, 0.35], [2, 0.4], [2.5, 0.45], [3, 0.5], [4, 0.7], [5, 0.8], [6, 1], [8, 1.25], [10, 1.5], [12, 1.75], [16, 2], [20, 2.5], [24, 3], [30, 3.5], [36, 4], [42, 4.5], [48, 5], [56, 5.5], [64, 6]];
function coarsePitch(d) { let best = COARSE[0]; for (const c of COARSE) if (Math.abs(c[0] - d) < Math.abs(best[0] - d)) best = c; return best[1]; }
const num = x => typeof x === 'number' ? x : x?.value ?? Number(x);

// Tooth outline in (radius, axial) coordinates: low flank, crest, high flank, extended below rMinor by e
// along the flank lines so the ridge sinks into the core (a clean union, no tangent faces).
function toothPoints(pf, pitch, rMajor, rMinor, e) {
  const depth = rMajor - rMinor;
  const b0 = -pf.base * pitch / 2, b1 = pf.base * pitch / 2;
  const c0 = pf.lead != null ? b0 + pf.lead * pitch : -pf.crest * pitch / 2, c1 = c0 + pf.crest * pitch;
  const k = e / depth, rr = rMinor - e;
  return { pts: [[rr, b0 - (c0 - b0) * k], [rMajor, c0], [rMajor, c1], [rr, b1 + (b1 - c1) * k]], b0, b1, c0, c1 };
}
// Exact volume of the clipped thread solid (see the header).
export function threadVolume({ rMajor, rMinor, pitch, length, profile = 'iso' }) {
  const pf = PROFILES[profile] ?? PROFILES.iso;
  const d = rMajor - rMinor, b = pf.base * pitch, c = pf.crest * pitch;
  const A = (b + c) / 2 * d, rc = rMinor + d * (b + 2 * c) / (3 * (b + c));
  return Math.PI * rMinor ** 2 * length + A * 2 * Math.PI * rc * length / pitch;
}

// Build a thread solid along +Z from z = −extendStart to length + extendEnd. rMajor/rMinor are the crest and
// root radii of the material (external) or of the cutting tool (internal). Returns a named solid
// { shape, names, aliases, obb } with faces `${id}/core`, `${id}/flank.lo`, `${id}/flank.hi`, `${id}/crest`,
// `${id}/start`, `${id}/end` (split pieces get #a, #b…). (A cross-section swept with a helical auxiliary spine
// avoids the booleans but gives degree-8+ surfaces that take seconds to tessellate; the boolean build wins.)
// Long threads: one lead is built by the booleans, copied up the axis (screw-invariant: the section at z + lead
// is the section at z) and the copies' lateral faces sewn with the two end caps; seconds become a fraction.
export function threadSolid(o) {
  const lead = num(o.pitch) * (o.starts ?? 1), total = num(o.length) + (o.extendStart ?? o.extend ?? 0) + (o.extendEnd ?? o.extend ?? 0);
  if (o.core === false || total < 3.5 * lead) return threadSolidBoolean(o);
  try { return threadSolidStacked(o, lead, total); } catch { return threadSolidBoolean(o); }   // e.g. a sewing gap
}
function threadSolidStacked(o, lead, total) {
  const oc = getOC();
  const r = K.scope();
  const id = o.id ?? 'thread', es = o.extendStart ?? o.extend ?? 0, R = o.rMajor, r0 = o.rMinor;
  const base = { ...o, extend: 0, extendStart: 0, extendEnd: 0, hand: 'right', bore: 0 };
  const made = [];
  try {
    const n = Math.floor(total / lead + 1e-9), rem = total - n * lead;
    const slab = threadSolidBoolean({ ...base, length: lead }).shape; made.push(slab);
    const pieces = Array.from({ length: n }, (_, k) => k ? K.moveShape(slab, K.matTranslate(0, 0, k * lead)) : slab);
    if (rem > 1e-4) { const last = threadSolidBoolean({ ...base, length: rem }).shape; made.push(last); pieces.push(K.moveShape(last, K.matTranslate(0, 0, n * lead))); }
   
    pieces.forEach(x => { if (!made.includes(x)) made.push(x); });
    const sew = r(new oc.BRepBuilderAPI_Sewing(3e-4, true, true, true, false));   // the sweeps are good to 1e-4
    pieces.forEach((pc, k) => K.explore(pc, 'FACE', f => {
      const ad = new oc.BRepAdaptor_Surface(oc.TopoDS.Face(f), true); const plane = ad.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane; ad.delete();
      if (plane) { const bb = K.bboxOf(f, false), zc = (bb[0][2] + bb[1][2]) / 2; if ((zc > 1e-6 && k > 0 && Math.abs(zc - k * lead) < 1e-6) || (k < pieces.length - 1 && Math.abs(zc - (k + 1) * lead) < 1e-6)) return; }
      sew.Add(f);
    }));
    sew.Perform(r(new oc.Message_ProgressRange()));
    const sewn = r(sew.SewedShape());
    let shell = null, nShells = 0; K.explore(sewn, 'SHELL', x => { nShells++; if (!shell) shell = oc.TopoDS.Shell(x); });
    if (nShells !== 1) throw new Error(`thread: sewing left ${nShells} shells`);
    let solid = r(new oc.BRepBuilderAPI_MakeSolid(shell)).Solid();
    { const pr = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(solid, pr, 1e-2, false, false); const v = pr.Mass(); pr.delete(); if (v < 0) solid = oc.TopoDS.Solid(solid.Reversed()); }
    if (!K.isValid(solid)) throw new Error('thread: the stacked solid is not valid');
   
    let shape = K.transformShape(solid, K.matTranslate(0, 0, -es));
    if (o.bore > 0) {
      const b = r(new oc.BRepPrimAPI_MakeCylinder(r(K.ax2([0, 0, -es - 1], [0, 0, 1], null, r)), o.bore, total + 2)).Shape();
      const cut = r(r(new oc.BRepAlgoAPI_Cut(shape, b, r(new oc.Message_ProgressRange()))).Shape());
      const [hollow] = K.solidsOf(cut); shape.delete(); shape = hollow;
    }
    if (o.hand === 'left') { const m = K.transformShape(shape, K.matMirror([1, 0, 0])); shape.delete(); shape = m; }
   
    // roles by geometry: end planes, crest / core / bore by radius, flanks by the sign of the axial normal
    const fs = K.subShapes(shape, 'FACE');
    const names = fs.list.map(f => {
      const ad = new oc.BRepAdaptor_Surface(f, true); const t = ad.GetType(); ad.delete();
      const m = K.normalMidUV(f);
      if (t === oc.GeomAbs_SurfaceType.GeomAbs_Plane) return `${id}/${m.normal[2] > 0 ? 'end' : 'start'}`;
      const rad = Math.hypot(m.point[0], m.point[1]);
      if (Math.abs(m.normal[2]) < 0.05) return o.bore > 0 && rad < r0 - 0.05 ? `${id}/bore` : Math.abs(rad - R) < Math.abs(rad - r0) ? `${id}/crest` : `${id}/core`;
      return `${id}/${m.normal[2] < 0 ? 'flank.lo' : 'flank.hi'}`;
    });
    const pts = fs.list.map(f => K.normalMidUV(f).point);
    const uniq = uniquify(names, i => pts[i]);
    fs.free();
    return { shape, names: uniq, aliases: uniq.map(() => null), obb: true };
  } finally { made.forEach(x => { try { x.delete(); } catch {} }); r.free(); }
}
function threadSolidBoolean({ rMajor, rMinor, pitch, length, profile = 'iso', starts = 1, hand = 'right', id = 'thread', extend = 0, extendStart = extend, extendEnd = extend, core: withCore = true, bore = 0 }) {
  const oc = getOC();
  const r = K.scope();
  const pf = PROFILES[profile] ?? PROFILES.iso;
  const depth = rMajor - rMinor;
  if (!(depth > 0) || !(rMinor > 0)) throw new Error(`thread: bad radii (major ${rMajor}, minor ${rMinor})`);
  if (pf.base * pitch >= pitch * starts && starts > 1) throw new Error('thread: the teeth of a multi-start thread overlap');
  const e = Math.max(0.02, Math.min(0.1 * depth, 0.2));
  const { pts } = toothPoints(pf, pitch, rMajor, rMinor, e);
  const lead = pitch * starts;
  const zLo = -extendStart, zHi = length + extendEnd;
  const reach = Math.max(...pts.map(p => Math.abs(p[1]))) + 0.05;   // the swept tooth's axial half-extent
  const z0 = zLo - reach, total = zHi - zLo + 2 * reach;
  const frame = { origin: [0, 0, z0], x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] };
  // [rr,b0]→[R,c0] low flank · [R,c0]→[R,c1] crest · [R,c1]→[rr,b1] high flank · [rr,b1]→[rr,b0] root
  const roles = ['flank.lo', 'crest', 'flank.hi', 'root'];
  const loop = pts.map((p, i) => ({ kind: 'line', a: p, b: pts[(i + 1) % 4], src: roles[i] }));
  const made = [];
  try {
    const turns = total / lead;
    const path = r(S.pathWire([{ kind: 'helix', origin: [0, 0, z0], axis: [0, 0, 1], r: rMinor - e, pitch: lead, turns, pieces: Math.max(1, Math.ceil(turns / THREAD_PIECE_TURNS)) }], r));
    const [sw] = S.sweep({ frame, regions: [{ loops: [loop] }] }, path, { id, frame: 'binormal', auxDir: [0, 0, 1] });
    const fs = K.subShapes(sw.shape, 'FACE');
    const names = fs.list.map(f => sw.explicit.find(x => x.shape.IsSame(f))?.name.replace(/\/side\[(.*)\]$/, '/$1') ?? `${id}/runout`);
    fs.free(); sw.explicit.forEach(x => x.shape.delete());
    // further starts: rotated copies (a copy explores its faces in the same order, so the names carry over)
    const ridges = [{ shape: sw.shape, names, aliases: names.map(() => null) }];
    for (let k = 1; k < starts; k++) ridges.push({ shape: K.transformShape(sw.shape, K.matRotate([0, 0, 1], 2 * Math.PI * k / starts)), names, aliases: names.map(() => null) });
    let fused;
    if (withCore) {
      // the core: a cylinder past both clip planes (hollow with a bore), its seam turned away from the tooth's start plane
      let core = new oc.BRepPrimAPI_MakeCylinder(r(K.ax2([0, 0, zLo - 1], [0, 0, 1], [Math.cos(0.37), Math.sin(0.37), 0], r)), rMinor, zHi - zLo + 2).Shape();
      if (bore > 0) {
        if (!(bore < rMinor - e)) throw new Error(`thread: bore Ø${2 * bore} mm leaves no wall inside the minor Ø${(2 * rMinor).toFixed(2)} mm`);
        const b = r(new oc.BRepPrimAPI_MakeCylinder(r(K.ax2([0, 0, zLo - 2], [0, 0, 1], [Math.cos(0.37), Math.sin(0.37), 0], r)), bore, zHi - zLo + 4)).Shape();
        const cut = r(r(new oc.BRepAlgoAPI_Cut(core, b, r(new oc.Message_ProgressRange()))).Shape());
        const [hollow] = K.solidsOf(cut); core.delete(); b.delete(); core = hollow;
      }
      const cf = K.subShapes(core, 'FACE');
      const coreB = tmpBody({ shape: core, names: cf.list.map(f => { const fi = K.faceInfo(f); return fi.kind === 'cylinder' && fi.axis.radius < rMinor - 1e-6 ? `${id}/bore` : `${id}/core`; }) });
      cf.free();
      fused = booleanOp('fuse', coreB, ridges, id, { simplify: false, obb: true });
      coreB.detach(); made.push(core, ...ridges.map(x => x.shape));
      if (fused.length !== 1) { fused.forEach(x => x.shape.delete()); throw new Error(`thread: the teeth did not fuse with the core (${fused.length} solids)`); }
    } else if (ridges.length === 1) fused = ridges;   // the ridge alone, to join a neck of radius ≥ rMinor
    else {
      const rb = tmpBody(ridges[0]);
      fused = booleanOp('fuse', rb, ridges.slice(1), id, { simplify: false, obb: true });
      rb.detach(); made.push(...ridges.map(x => x.shape));
      if (fused.length !== 1) { const keep = fused; fused = null; keep.forEach(x => x.shape.delete()); throw new Error('thread: core: false needs one start (or starts that touch)'); }
    }
    // clip by the planes z = zLo and z = zHi (a cylinder wider than the crest; its side never touches)
    const clip = new oc.BRepPrimAPI_MakeCylinder(r(K.ax2([0, 0, zLo], [0, 0, 1], [Math.cos(1.1), Math.sin(1.1), 0], r)), rMajor + 1, zHi - zLo).Shape();
    const cf = K.subShapes(clip, 'FACE');
    const clipNames = cf.list.map(f => { const fi = K.faceInfo(f); return fi.kind === 'plane' ? `${id}/${fi.normal[2] > 0 ? 'end' : 'start'}` : `${id}/clip`; });
    cf.free();
    const fb = tmpBody(fused[0]);
    const out = booleanOp('common', fb, [{ shape: clip, names: clipNames }], id, { simplify: false, obb: true });
    fb.detach(); if (!made.includes(fused[0].shape)) made.push(fused[0].shape); made.push(clip);
    if (out.length !== 1) { out.forEach(x => x.shape.delete()); throw new Error(`thread: clipping left ${out.length} solids`); }
    let res = out[0];
    if (hand === 'left') { const m = K.transformShape(res.shape, K.matMirror([1, 0, 0])); res.shape.delete(); res = { ...res, shape: m }; }   // mirror: right → left hand
    return { shape: res.shape, names: res.names, aliases: res.aliases, obb: true };
  } finally { made.forEach(s => { try { s.delete(); } catch {} }); r.free(); }
}
// Modelled radii for a printed thread with a fit class gap c (per side, radial): external shrinks, internal
// grows. The normal clearance on a flank is c·sin(half-angle) per part (c/2 for ISO 60°).
export function threadRadii(spec, { internal = false, profile = 'iso', gap = 0.2 } = {}) {
  const t = threadSpec(spec);
  const pf = PROFILES[profile] ?? PROFILES.iso;
  const depth = pf.depth * t.pitch;
  const rMajor = t.d / 2 + (internal ? gap : -gap);
  return { ...t, rMajor, rMinor: rMajor - depth, depth };
}
