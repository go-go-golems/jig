// Holes (README §4.6 j.hole.*, §7 Holes): fit-aware sizes, counterbores, countersinks, inserts, nut traps,
// and teardrops for horizontal holes relative to the build direction.
import { getOC } from './oc.js';
import * as K from './kernel.js';
import * as S from './shapes.js';
import { namedFromExplicit, transformNamed } from './ops.js';
import { arr3 } from './adapt.js';
import { isQuantity } from './units.js';
import { threadSolid, threadRadii } from './threads.js';

const V = K.V;
// Standards tables (versioned, part of cache keys)
export const TABLES_VERSION = 'iso-metric@1';
export const METRIC = {   // nominal d, pitch, hex nut AF, nut height (ISO 4032), heat-set insert hole Ø, insert length
  M2: { d: 2, pitch: 0.4, af: 4, nut: 1.6, insert: 3.2, insertL: 3 },
  'M2.5': { d: 2.5, pitch: 0.45, af: 5, nut: 2, insert: 3.6, insertL: 4 },
  M3: { d: 3, pitch: 0.5, af: 5.5, nut: 2.4, insert: 4.0, insertL: 5.7 },
  M4: { d: 4, pitch: 0.7, af: 7, nut: 3.2, insert: 5.6, insertL: 8.1 },
  M5: { d: 5, pitch: 0.8, af: 8, nut: 4.7, insert: 6.4, insertL: 9.5 },
  M6: { d: 6, pitch: 1, af: 10, nut: 5.2, insert: 8.0, insertL: 12.7 },
  M8: { d: 8, pitch: 1.25, af: 13, nut: 6.8, insert: 9.6, insertL: 12.7 },
};
export const ISO10642 = { M2: 4.4, 'M2.5': 5.5, M3: 6.72, M4: 8.96, M5: 11.2, M6: 13.44, M8: 17.92 };   // countersunk head Ø dk
export const ISO273 = { M2: 2.4, 'M2.5': 2.9, M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9.0 };   // medium clearance, for reference
export const isThreadName = x => typeof x === 'string' && /^M\d+(\.\d+)?(\s*[x×]\s*[\d.]+)?$/i.test(x.trim());
const thread = name => { const m = /^(M[\d.]+)/i.exec(String(name)); const t = m && METRIC[m[1].toUpperCase()]; if (!t) throw new Error(`unknown thread '${name}' (tapped holes, inserts and nut traps take a thread name such as 'M4')`); return { key: m[1].toUpperCase(), ...t }; };

class HoleSpec {
  constructor(kind, args, opts = {}) { this.kind = kind; this.args = args; this.opts = opts; Object.freeze(this); }
  get isHoleSpec() { return true; }
  get label() {
    const a = this.args;
    return { simple: `hole Ø${q(a[0])}`, counterbore: `counterbore Ø${q(a[0])}/Ø${q(a[1])}`, countersink: isThreadName(a[0]) ? `countersunk ${a[0]} ${this.opts.fit ?? 'slide'}` : `countersink Ø${q(a[0])}/Ø${q(a[1])}`,
      clearance: `clearance ${a[0]} ${this.opts.fit ?? 'slide'}`, tapped: `tapped ${a[0]} (${this.opts.method ?? 'self-tap'})`,
      insert: `insert ${a[0]}`, nutTrap: `nut trap ${a[0]} (${this.opts.kind ?? 'hex'}, from ${this.opts.from ?? 'top'})` }[this.kind];
  }
  toString() { return `j.hole.${this.kind}(${this.args.map(x => typeof x === 'string' ? `'${x}'` : q(x)).join(', ')})`; }
}
const q = x => typeof x === 'number' ? `${x} mm` : x?.toString?.() ?? String(x);
export const hole = {
  simple: (d, depth = 'through', opts) => new HoleSpec('simple', [d, depth], opts),
  counterbore: (d, cbD, cbDepth, depth = 'through', opts) => new HoleSpec('counterbore', [d, cbD, cbDepth, depth], opts),
  // countersink(d, csD, angle, depth) or countersink('M3', { fit, depth }) for ISO 10642 flat heads
  // a thread name ('M3') selects the ISO form; any other string is an expression for the size ('screw_d')
  countersink: (d, csD, angle, depth = 'through', opts) => isThreadName(d) ? new HoleSpec('countersink', [d], csD ?? {}) : new HoleSpec('countersink', [d, csD, angle ?? 90, depth], opts),
  clearance: (size, opts = {}) => new HoleSpec('clearance', [size], opts),
  tapped: (size, opts = {}) => new HoleSpec('tapped', [size], opts),
  insert: (size, opts = {}) => new HoleSpec('insert', [size], opts),
  nutTrap: (size, opts = {}) => new HoleSpec('nutTrap', [size], opts),
};

// Diameter/depth plan for one hole given orientation: { segs (revolve profile) | teardrop, d, depth, chain, compensated }
export function planHole(spec, ctx, { horizontal, through }) {
  const fit = ctx.fitCtx();
  const comp = d => horizontal ? 0 : fit.holeComp(d);
  const chain = [];
  const depthOf = x => x == null || x === 'through' ? through : ctx.len(x);
  const a = spec.args, o = spec.opts;
  let d, depth, extra = {};
  switch (spec.kind) {
    case 'simple': {
      d = ctx.len(a[0]); depth = depthOf(a[1]);
      chain.push(`Ø ${f3(d)} mm${a[0]?.resolveSize ? ' (fit-aware)' : ''}`);
      break;
    }
    case 'clearance': {
      const t = isThreadName(a[0]) ? thread(a[0]) : { key: `Ø${f3(ctx.len(a[0]))}`, d: ctx.len(a[0]) };   // 'M3' or a size ('screw_d', mm(4))
      const cls = o.fit ?? 'slide'; const c = fit.classes[cls];
      if (c == null) throw new Error(`unknown fit class '${cls}'`);
      const hc = comp(t.d + 2 * c);
      d = t.d + 2 * c + hc; depth = depthOf(o.depth);
      chain.push(`clearance ${t.key} ${cls}`, `${t.d} + 2 × ${cls} ${f3(c)} mm (${fit.name})`, horizontal ? 'no hole compensation (teardrop)' : `+ holeComp ${f3(hc)} mm`, `= Ø ${f3(d)} mm`);
      extra = { nominal: t.d, fitClass: cls, gap: c, holeComp: hc };
      ctx.useFit(cls);
      break;
    }
    case 'tapped': {
      const t = thread(a[0]); const method = o.method ?? 'self-tap';
      d = method === 'printed' ? t.d - 1.0825 * t.pitch : t.d - 0.1; depth = depthOf(o.depth ?? t.d * 2);
      chain.push(method === 'printed' ? `${t.key}×${t.pitch} printed internal thread (ISO 60°), ${o.fit ?? 'slide'} fit` : `${t.key} self-tap: d − 0.1 mm = Ø ${f3(d)} mm`);
      extra = { thread: `${t.key}x${t.pitch}`, pitch: t.pitch, blind: o.depth !== 'through' };
      break;
    }
    case 'insert': {
      const t = thread(a[0]); const m = /x([\d.]+)/i.exec(a[0]); const L = m ? +m[1] : t.insertL;
      d = t.insert; depth = depthOf(o.depth ?? L + 1.0);
      chain.push(`heat-set insert ${a[0]}: Ø ${f3(d)} × ${f3(depth)} mm (insert ${L} + 1.0 melt room)`);
      extra = { insertLength: L };
      break;
    }
    case 'counterbore': {
      d = ctx.len(a[0]); const cb = ctx.len(a[1]), cbd = ctx.len(a[2]); depth = depthOf(a[3]);
      extra = { cbD: cb, cbDepth: cbd }; chain.push(`Ø ${f3(d)} with counterbore Ø ${f3(cb)} × ${f3(cbd)} mm`);
      break;
    }
    case 'countersink': {
      if (isThreadName(a[0])) {
        const t = thread(a[0]); const cls = o.fit ?? 'slide'; const c = fit.classes[cls];
        const head = ISO10642[t.key] ?? t.d * 2;
        d = t.d + 2 * c + comp(t.d); depth = depthOf(o.depth);
        const cs = head + 2 * c, ang = Math.PI / 2;
        extra = { csD: cs, csAngle: ang, nominal: t.d, fitClass: cls }; ctx.useFit(cls);
        chain.push(`countersunk ${t.key} (ISO 10642 head Ø${head})`, `bore ${t.d} + 2 × ${cls} ${f3(c)} + holeComp = Ø ${f3(d)} mm`, `countersink Ø ${f3(cs)} mm at 90°`);
        break;
      }
      d = ctx.len(a[0]); const cs = ctx.len(a[1]); const ang = ctx.ang(a[2]); depth = depthOf(a[3]);
      extra = { csD: cs, csAngle: ang }; chain.push(`Ø ${f3(d)} with countersink Ø ${f3(cs)} at ${f3(ang * 180 / Math.PI)}°`);
      break;
    }
    case 'nutTrap': {
      const t = thread(a[0]); const c = fit.classes.slide;
      const af = t.af + 2 * c, h = t.nut + 0.4;
      d = t.d + 2 * c + comp(t.d); depth = depthOf(o.depth);
      extra = { nutAF: af, nutH: h, kind: o.kind ?? 'hex', from: o.from ?? 'top' };
      chain.push(`${t.key} nut: AF ${t.af} + 2 × slide ${f3(c)} = ${f3(af)} mm, height ${t.nut} + 0.4 = ${f3(h)} mm`, `bolt Ø ${f3(d)} mm`);
      ctx.useFit('slide');
      break;
    }
  }
  return { d, depth, chain, ...extra };
}
const f3 = v => +(+v).toFixed(3);

// Positions: [{ p, dir, label }] in world coordinates.
export function holePositions(at, state, ctx) {
  const out = [];
  const bb = K.bboxUnion(state.bodies.map(b => b.bbox()));
  const push = (p, dir, label) => out.push({ p, dir: V.unit(dir), label });
  // one point given as numbers, quantities or expressions ([x, y] / [x, y, z]) vs a list of points
  const scalar = v => typeof v === 'number' || typeof v === 'string' || isQuantity(v);
  const list = Array.isArray(at) && (at.length === 0 || !(at.length <= 3 && at.every(scalar))) ? at : [at];
  list.forEach((x, i) => {
    if (x?.isSketch || x?.solve || x?.kind === 'profiles' && x.sketch) {
      for (const sp of ctx.sketchPoints(x.sketch ?? x, state)) push(sp.p, V.neg(sp.normal), sp.id);
    } else if (x?.isSelector || x?.isFeatureRef) {
      const r = ctx.resolve(x.isFeatureRef ? x.faces() : x, state);
      r.items.forEach((c, k) => {
        if (r.kind === 'faces') { const fi = c.body.faceInfo(c.index); push(fi.center, fi.normal ? V.neg(fi.normal) : [0, 0, -1], `${i}.${k}`); }
        else if (r.kind === 'edges') { const ei = c.body.edgeInfo(c.index); push(ei.axis?.origin ?? ei.center, ei.axis ? V.neg(ei.axis.dir) : [0, 0, -1], `${i}.${k}`); }
      });
    } else if (x?.kind === 'deferred' && x.op === 'center' && (x.args[0]?.isSelector || x.args[0]?.isFeatureRef)) {
      const r = ctx.resolve(x.args[0].isFeatureRef ? x.args[0].faces() : x.args[0], state);
      r.items.forEach((c, k) => { const fi = r.kind === 'faces' ? c.body.faceInfo(c.index) : null; const ei = r.kind === 'edges' ? c.body.edgeInfo(c.index) : null;
        push(fi ? fi.center : ei.axis?.origin ?? ei.center, fi?.normal ? V.neg(fi.normal) : ei?.axis ? V.neg(ei.axis.dir) : [0, 0, -1], r.items.length > 1 ? `${i + 1}.${k + 1}` : String(i + 1)); });
    } else if (x?.kind === 'deferred') {
      const p = ctx.point(x, state); push(p, faceNormalAt(state, p) ?? [0, 0, -1], String(i + 1));
    } else {
      const a = Array.isArray(x) ? x.map(v => ctx.len(v)) : arr3(x);   // expression coordinates resolve over params
      if (Array.isArray(x) && x.length === 2) push([a[0], a[1], rayTop(state, a[0], a[1], bb)], [0, 0, -1], String(i + 1));
      else { const p = arr3(a); push(p, faceNormalAt(state, p) ?? [0, 0, -1], String(i + 1)); }
    }
  });
  // drill into material: flip when the material is on the other side
  const corners = bb ? [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => [bb[i][0], bb[j][1], bb[k][2]]))) : [];
  for (const h of out) {
    // cheap test first: all material on one side of the plane through the point
    const sd = corners.map(c => V.dot(V.sub(c, h.p), h.dir));
    if (sd.every(d => d <= 1e-6)) { h.dir = V.neg(h.dir); continue; }
    if (sd.every(d => d >= -1e-6)) continue;
    const inA = ctx.inside(V.add(h.p, V.mul(h.dir, 0.05)), state), inB = ctx.inside(V.sub(h.p, V.mul(h.dir, 0.05)), state);
    if (!inA && inB) h.dir = V.neg(h.dir);
  }
  return out;
}

// A 3D point on a planar face drills along the face's inward normal (prefer faces facing +Z when on an edge).
function faceNormalAt(state, p) {
  let best = null;
  for (const b of state.bodies) {
    const bb = b.bbox(); if (!bb || p.some((v, i) => v < bb[0][i] - 1e-6 || v > bb[1][i] + 1e-6)) continue;
    for (let i = 0; i < b.nFaces; i++) {
      const fi = b.faceInfo(i); if (fi.kind !== 'plane') continue;
      if (Math.abs(V.dot(V.sub(p, fi.center), fi.normal)) > 1e-6) continue;
      if (K.pointDistance(b.faces.list[i], p) > 1e-6) continue;
      const score = fi.normal[2];
      if (!best || score > best.score) best = { score, dir: V.neg(fi.normal) };
    }
  }
  return best?.dir ?? null;
}

// Highest material point above (x, y): the top surface a 2D hole position drills into.
function rayTop(state, x, y, bb) {
  if (!bb) return 0;
  const oc = getOC(); const r = K.scope();
  let top = -Infinity;
  try {
    const e = r(new oc.BRepBuilderAPI_MakeEdge(r(K.pnt([x, y, bb[0][2] - 1])), r(K.pnt([x, y, bb[1][2] + 1]))).Edge());
    for (const b of state.bodies) {
      const c = r(new oc.BRepAlgoAPI_Common(b.shape, e, r(new oc.Message_ProgressRange())));
      const res = r(c.Shape());
      const bx = K.bboxOf(res, false);
      if (bx) top = Math.max(top, bx[1][2]);
    }
  } catch {} finally { r.free(); }
  return Number.isFinite(top) ? top : bb[1][2];
}

// Build the cutting tools for a hole feature: { named: [{ shape, names }], info }
export function buildHoles(at, spec, f, state, ctx) {
  if (!spec?.isHoleSpec) throw ctx.fail('feature.failed', `hole: the second argument must be a j.hole.* spec`);
  const pos = holePositions(at, state, ctx);
  if (!pos.length) throw ctx.fail('ref.lost', 'hole: no positions resolved');
  const up = V.unit(ctx.buildDir ?? [0, 0, 1]);
  const bb = K.bboxUnion(state.bodies.map(b => b.bbox()));
  const named = [];
  const info = { count: pos.length, label: spec.label, teardrops: 0, holes: [] };
  const toolCache = new Map();   // identical holes share one tool, translated to each position
  pos.forEach((h, k) => {
    const horizontal = Math.abs(V.dot(h.dir, up)) < 1e-3 && (f.opts.teardrop ?? true) !== false && spec.opts.teardrop !== false && !(spec.kind === 'tapped' && spec.opts.method === 'printed');
    const through = bb ? V.dist(bb[0], bb[1]) * 1.5 + V.dist(h.p, V.lerp(bb[0], bb[1], 0.5)) : 1000;
    const plan = planHole(spec, ctx, { horizontal, through: Math.ceil(through / 10) * 10 });
    const label = h.label;
    // a printed through-thread only needs to reach the far side of the material (each turn costs time)
    if (spec.kind === 'tapped' && spec.opts.method === 'printed' && !plan.blind && bb) {
      const far = Math.max(...[0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => V.dot(V.sub([bb[i][0], bb[j][1], bb[k][2]], h.p), h.dir)))));
      plan.depth = Math.min(plan.depth, Math.max(far, 0.5));
    }
    const key = JSON.stringify([plan.d, plan.depth, plan.cbD, plan.cbDepth, plan.csD, plan.csAngle, plan.nutAF, plan.from, h.dir.map(v => +v.toFixed(9)), horizontal, up]);
    let proto = toolCache.get(key);
    if (!proto) {
      const h0 = { ...h, p: [0, 0, 0] };
      if (spec.kind === 'tapped' && spec.opts.method === 'printed') proto = [printedThreadTool(h0, plan, spec, f.id, ctx)];
      // a horizontal counterbore/countersink keeps its round head; only the bore becomes a teardrop
      else proto = horizontal ? [...teardropTool(h0, plan, up, f.id, '@L'), ...(plan.cbD || plan.csD ? headTool(h0, plan, f.id, '@L') : [])] : roundTool(h0, plan, spec, f.id, '@L');
      if (spec.kind === 'nutTrap') proto.push(nutTool(h0, plan, f.id, '@L', bb && [V.sub(bb[0], h.p), V.sub(bb[1], h.p)]));
      toolCache.set(key, proto);
    }
    const m = K.matTranslate(...h.p);
    for (const t of proto) named.push(transformNamed(t, m, n => n.replace('[@L]', `[${label}]`)));
    if (horizontal) {
      info.teardrops++;
      ctx.decide({ kind: 'teardrop', at: `${f.id}.${label}`, chose: 'teardrop', alternatives: ['round', 'bridged'], reason: `axis ${fmtDir(h.dir)} ⟂ build direction ${fmtDir(up)} → 45° teardrop, tip toward ${fmtDir(up)}${plan.cbD ? '; the counterbore stays round' : plan.csD ? '; the countersink stays round' : ''}` });
    }
    info.holes.push({ label, at: h.p.map(f3), axis: h.dir.map(f3), modelled: f3(plan.d), depth: f3(plan.depth), teardrop: horizontal, chain: [...plan.chain, ...(horizontal ? [`axis ${fmtDir(h.dir)} ⟂ build direction ${fmtDir(up)} → 45° teardrop, tip toward ${fmtDir(up)}`] : [])] });
  });
  for (const proto of toolCache.values()) for (const t of proto) t.shape.delete();
  info.modelled = info.holes[0]?.modelled;
  return { named, info };
}
export const fmtDir = d => { const a = d.map(x => Math.abs(x) < 1e-9 ? 0 : x); const i = a.map(Math.abs).indexOf(Math.max(...a.map(Math.abs))); return Math.abs(Math.abs(a[i]) - 1) < 1e-6 ? `${a[i] > 0 ? '+' : '-'}${'XYZ'[i]}` : `(${a.map(x => +x.toFixed(3)).join(', ')})`; };

function holeFrame(h, upHint) {
  const z = h.dir;
  let y = upHint ? V.sub(upHint, V.mul(z, V.dot(upHint, z))) : null;
  if (!y || V.len(y) < 1e-6) y = Math.abs(z[2]) < 0.9 ? V.cross(z, V.cross([0, 0, 1], z)) : [0, 1, 0];
  y = V.unit(y);
  return { origin: h.p, x: V.cross(y, z), y, z };
}
// Round holes: revolve a half profile (radius, depth) about the axis.
function roundTool(h, plan, spec, id, label) {
  const r = plan.d / 2, D = plan.depth;
  let pts;
  if (plan.cbD) pts = [['mouth', 0, 0], ['cbore', plan.cbD / 2, 0], ['cbFloor', plan.cbD / 2, plan.cbDepth], ['bore', r, plan.cbDepth], ['floor', r, D], ['axis', 0, D]];
  else if (plan.csD) { const hcs = (plan.csD / 2 - r) / Math.tan(plan.csAngle / 2); pts = [['mouth', 0, 0], ['csink', plan.csD / 2, 0], ['bore', r, hcs], ['floor', r, D], ['axis', 0, D]]; }
  else pts = [['mouth', 0, 0], ['bore', r, 0], ['floor', r, D], ['axis', 0, D]];
  const fr = holeFrame(h);
  // the profile plane contains the axis: local x = radial (fr.x), local y = depth (fr.z); its normal = −fr.y
  const frame = { origin: h.p, x: fr.x, y: fr.z, z: V.neg(fr.y) };
  const loop = pts.map((p, i) => ({ kind: 'line', a: [p[1], p[2]], b: [pts[(i + 1) % pts.length][1], pts[(i + 1) % pts.length][2]], src: p[0] }));
  const [res] = S.revolve({ frame, regions: [{ loops: [loop] }] }, { id: '@', axis: { origin: h.p, dir: fr.z }, angle: 2 * Math.PI });
  res.explicit.forEach(e => { e.name = `${id}/${e.name.match(/\[(.*)\]/)[1]}[${label}]`; });
  return [namedFromExplicit(res.shape, res.explicit, id)];
}
// The round head of a counterbore or countersink alone (used with a teardrop bore).
function headTool(h, plan, id, label) {
  const r = plan.d / 2;
  const hd = plan.cbD ? plan.cbDepth : (plan.csD / 2 - r) / Math.tan(plan.csAngle / 2);
  const pts = plan.cbD ? [['mouth', 0, 0], ['cbore', plan.cbD / 2, 0], ['cbFloor', plan.cbD / 2, hd], ['axis', 0, hd]]
    : [['mouth', 0, 0], ['csink', plan.csD / 2, 0], ['csFloor', r, hd], ['axis', 0, hd]];
  const fr = holeFrame(h);
  const frame = { origin: h.p, x: fr.x, y: fr.z, z: V.neg(fr.y) };
  const loop = pts.map((p, i) => ({ kind: 'line', a: [p[1], p[2]], b: [pts[(i + 1) % pts.length][1], pts[(i + 1) % pts.length][2]], src: p[0] }));
  const [res] = S.revolve({ frame, regions: [{ loops: [loop] }] }, { id: '@', axis: { origin: h.p, dir: fr.z }, angle: 2 * Math.PI });
  res.explicit.forEach(e => { e.name = `${id}/${e.name.match(/\[(.*)\]/)[1]}[${label}]`; });
  return [namedFromExplicit(res.shape, res.explicit, id)];
}
// Teardrops: circle + 45° tangent tip toward the build direction, extruded along the axis.
function teardropTool(h, plan, up, id, label) {
  const r = plan.d / 2, s = r / Math.SQRT2;
  const fr = holeFrame(h, up);
  const loop = [
    { kind: 'arc', c: [0, 0], r, a0: 3 * Math.PI / 4, a1: Math.PI / 4, ccw: true, src: 'bore' },
    { kind: 'line', a: [s, s], b: [0, r * Math.SQRT2], src: 'tear.r' },
    { kind: 'line', a: [0, r * Math.SQRT2], b: [-s, s], src: 'tear.l' },
  ];
  const parts = S.prism({ frame: fr, regions: [{ loops: [loop] }] }, { id: '@', dist: plan.depth });
  return parts.map(p => {
    p.explicit.forEach(e => { const m = e.name.match(/\[(.*)\]/); e.name = m ? `${id}/${m[1]}[${label}]` : e.name.endsWith('start') ? `${id}/mouth[${label}]` : `${id}/floor[${label}]`; });
    return namedFromExplicit(p.shape, p.explicit, id);
  });
}
function nutTool(h, plan, id, label, bb) {
  const fr = holeFrame(h);
  const R = plan.nutAF / Math.sqrt(3);   // circumradius of the hex
  const pts = Array.from({ length: 6 }, (_, i) => [R * Math.cos(i * Math.PI / 3), R * Math.sin(i * Math.PI / 3)]);
  let loop = pts.map((p, i) => ({ kind: 'line', a: p, b: pts[(i + 1) % 6], src: `nut.${i + 1}` }));
  if (plan.from === 'side' && bb) {
    // a slot from the nearest side: extend the hex pocket to the bounding box along local x
    const ext = V.dist(bb[0], bb[1]);
    const w = plan.nutAF / 2;
    loop = [[-R, -w], [ext, -w], [ext, w], [-R, w]].map((p, i, a) => ({ kind: 'line', a: p, b: a[(i + 1) % 4], src: `slot.${i + 1}` }));
  }
  const depthStart = plan.from === 'side' ? Math.max(0, plan.depth / 2 - plan.nutH / 2) : 0;
  const frame = { ...fr, origin: V.add(fr.origin, V.mul(fr.z, depthStart)) };
  const [p] = S.prism({ frame, regions: [{ loops: [loop] }] }, { id: '@', dist: plan.nutH });
  p.explicit.forEach(e => { const m = e.name.match(/\[(.*)\]/); e.name = m ? `${id}/${m[1]}[${label}]` : `${id}/nut${e.name.endsWith('start') ? 'Top' : 'Floor'}[${label}]`; });
  return namedFromExplicit(p.shape, p.explicit, id);
}

// A printed internal thread as the hole tool, along the drilling direction from the hole point.
function printedThreadTool(h, plan, spec, id, ctx) {
  const fit = ctx.fitCtx(); const cls = spec.opts.fit ?? 'slide';
  ctx.useFit(cls);
  const R = threadRadii(plan.thread, { internal: true, gap: fit.classes[cls] ?? 0.2 });
  const named = threadSolid({ rMajor: R.rMajor, rMinor: R.rMinor, pitch: R.pitch, length: plan.depth, id, extendStart: 0.5, extendEnd: plan.blind ? 0 : 0.5 });
  named.names = named.names.map(n => n.replace(`${id}/`, `${id}/thread.`) + '[@L]').map(n => n.replace(/^(.*)\[@L\]$/, (m0, a) => `${a}[@L]`));
  const fr = holeFrame(h);
  const t = transformNamed(named, K.frameMatrix(fr)); named.shape.delete();
  return t;
}
