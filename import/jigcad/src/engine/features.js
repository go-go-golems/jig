// Feature evaluation (README §4.6): (state, record, ctx) → state'. States are immutable; bodies are shared.
// state = { bodies: [Body], tools: { featId: { op, bodies: [Body] } }, info: { featId: {...} } }
import * as K from './kernel.js';
import * as S from './shapes.js';
import { Body, nextBodyId } from './body.js';
import { draft as ocDraft, thicken as ocThicken, booleanOp, fillet as ocFillet, chamfer as ocChamfer, shell as ocShell, namedFromExplicit, transformNamed, splitByPlane, touches, tmpBody } from './ops.js';
import { Selector, FeatureRef } from './select.js';
import { matOf, axisOf, frameOnFace } from './adapt.js';
import { buildHoles } from './holes.js';

const V = K.V;
export const emptyState = () => ({ bodies: [], tools: {}, info: {} });
const mkBody = (id, n, meta) => new Body(id, n.shape, n.names, { aliases: n.aliases, ...meta });
const releaseTmp = b => b.detach();

// ── combining a feature's solids with the existing bodies ───────────────────
export function combine(state, named, op, id, ctx, hints = {}) {
  let bodies = state.bodies.slice();
  const fresh = () => { const b = nextBodyId({ bodies }); return b; };
  const touchedNames = [];
  if (op === 'auto') {
    const anyTouch = bodies.length && named.some(n => bodies.some(b => { const t = tmpBody(n); const r = touches(b, n.shape); releaseTmp(t); return r; }));
    op = !bodies.length ? 'new' : anyTouch ? 'join' : 'new';
    ctx.decide({ kind: 'op', chose: op, alternatives: op === 'join' ? ['new'] : ['join'],
      reason: !state.bodies.length ? 'first solid feature' : op === 'join' ? `touches ${bodies.filter(b => named.some(n => touches(b, n.shape))).map(b => b.id).join(', ')}` : 'does not touch any body; creates a new body' });
  }
  if (op === 'new') {
    for (const n of named) bodies.push(mkBody(fresh(), n, { createdBy: id }));
  } else if (op === 'join') {
    // group the new solids by the bodies they touch, then one fuse per group (fast for many small pieces)
    const before = bodies.length, vol0 = bodies.reduce((s, b) => s + b.volume(), 0);
    const groups = new Map();
    for (const n of named) {
      const hit = hints.target ? bodies.filter(b => b === hints.target) : bodies.filter(b => touches(b, n.shape));
      if (!hit.length) { bodies.push(mkBody(fresh(), n, { createdBy: id })); continue; }
      const key = hit.map(b => b.uid).join(',');
      if (!groups.has(key)) groups.set(key, { hit, tools: [] });
      groups.get(key).tools.push(n);
    }
    for (const { hit, tools } of groups.values()) {
      const live = hit.filter(b => bodies.includes(b));
      if (!live.length) { tools.forEach(n => bodies.push(mkBody(fresh(), n, { createdBy: id }))); continue; }
      const res = booleanOp('fuse', live[0], [...live.slice(1), ...tools], id);
      const keepId = live[0].id;
      if (res.length > 1 && !hints.allowSeparate) ctx.diag({ level: 'warning', kind: 'boolean.nonManifold', message: `join left ${res.length} solids that only touch along an edge or a point`, fix: 'overlap the solids by at least one line width (0.45 mm) or separate them' });
      bodies = bodies.filter(b => !live.includes(b));
      res.forEach((r, k) => bodies.push(mkBody(k === 0 ? keepId : fresh(), r, { createdBy: live[0].meta.createdBy })));
      touchedNames.push(...live.map(b => b.id));
    }
    if (!hints.quiet && before && bodies.length === before && Math.abs(bodies.reduce((s, b) => s + b.volume(), 0) - vol0) <= 1e-9 * Math.max(1, vol0))
      ctx.diag({ level: 'warning', kind: 'feature.noEffect', message: `${id}: the join adds no material (it lies inside the existing bodies)`, fix: 'check its position and size, or remove it' });
  } else if (op === 'cut' || op === 'intersect') {
    const out = [];
    let hit = 0, vBefore = 0, vAfter = 0;
    for (const b of bodies) {
      const hitting = named.filter(n => { const bb = K.bboxOf(n.shape), ab = b.bbox(); return overlap(ab, bb); });
      if (!hitting.length) { out.push(op === 'intersect' ? null : b); continue; }
      const res = booleanOp(op === 'cut' ? 'cut' : 'common', b, hitting, id);
      hit++; vBefore += b.volume();
      res.forEach((r, k) => { const nb = mkBody(k === 0 ? b.id : `${b.id}.${k + 1}`, r, { createdBy: b.meta.createdBy }); vAfter += nb.volume(); out.push(nb); });
      touchedNames.push(b.id);
    }
    bodies = out.filter(Boolean);
    if (op === 'cut' && !hints.quiet && state.bodies.length && (!hit || Math.abs(vAfter - vBefore) <= 1e-9 * Math.max(1, vBefore)))
      ctx.diag({ level: 'warning', kind: 'feature.noEffect', message: `${id}: the cut removes no material${hit ? '' : ' (it misses every body)'}`, fix: 'check its direction and depth (a cut from a sketch plane goes along the plane normal), or flip it with a negative depth' });
  } else throw new Error(`unknown op '${op}'`);
  return { bodies, op, touched: touchedNames };
}
const overlap = (a, b, tol = 1e-6) => a && b && [0, 1, 2].every(i => a[0][i] <= b[1][i] + tol && b[0][i] <= a[1][i] + tol);

function withTool(state, id, op, named) {
  const tools = { ...state.tools, [id]: { op, bodies: named.map(n => mkBody(`_tool:${id}`, { shape: K.transformShape(n.shape, K.IDENTITY), names: n.names, aliases: n.aliases })) } };
  return tools;
}
function finish(state, id, res, named, info) {
  return { bodies: res.bodies, tools: withTool(state, id, res.op, named), info: { ...state.info, [id]: info } };
}

// ── extent handling for extrude ──────────────────────────────────────────────
function extentOf(extent, profile, state, ctx) {
  if (extent && typeof extent === 'object' && !extent.dims && !extent.isQuantity && !(typeof extent.value === 'number' && extent.unit)) {
    if ('symmetric' in extent) { const h = ctx.len(extent.symmetric); return { dist: h, offset: -h / 2, text: `symmetric ${fmt(h)}` }; }
    if ('two' in extent) { const [a, b] = extent.two.map(x => ctx.len(x)); return { dist: a + b, offset: -b, text: `two ${fmt(a)} / ${fmt(b)}` }; }
    if ('through' in extent) {
      const bb = K.bboxUnion(state.bodies.map(b => b.bbox()));
      const L = bb ? V.dist(bb[0], bb[1]) + V.dist(profile.frame.origin, V.lerp(bb[0], bb[1], 0.5)) + 1 : 1000;
      return { dist: 2 * L, offset: -L, text: 'through all' };
    }
    if ('to' in extent) {
      const r = ctx.resolve(extent.to, state);
      const f = r.items[0];
      if (!f) throw ctx.fail('ref.lost', `extrude to: '${extent.to}' resolved to nothing`);
      const c = f.body.faceInfo(f.index).center;
      const d = V.dot(V.sub(c, profile.frame.origin), profile.frame.z);
      return { dist: d, offset: 0, text: `to ${f.name} (${fmt(d)})` };
    }
  }
  const h = ctx.len(extent);
  return { dist: h, offset: 0, text: fmt(h) };
}
export const fmt = v => `${+(+v).toFixed(3)} mm`;

// ── feature implementations ─────────────────────────────────────────────────
export const FEATURES = {
  extrude(state, f, ctx) {
    const [profIn, extent] = f.args;
    const prof = ctx.profile(profIn, state);
    const ext = extentOf(extent, prof, state, ctx);
    const taper = f.opts.taper != null ? ctx.ang(f.opts.taper) : 0;
    if (!(Math.abs(ext.dist) > 1e-6)) throw ctx.fail('feature.failed', `extrude ${f.id}: the distance is ${fmt(ext.dist)}`, 'use a non-zero distance');
    let parts;
    if (prof.faceShape) {
      const r = K.scope();
      try {
        const oc = ctx.oc;
        const mk = r(new oc.BRepPrimAPI_MakePrism(prof.faceShape, r(K.vec(V.mul(prof.frame.z, ext.dist))), false, true));
        const explicit = [];
        prof.faceEdges.forEach(({ edge, src }) => K.listToArray(mk.Generated(edge)).forEach(g => K.isType(g, 'FACE') ? explicit.push({ shape: g, name: `${f.id}/side[${src}]` }) : g.delete()));
        explicit.push({ shape: mk.FirstShape(), name: `${f.id}/start` }, { shape: mk.LastShape(), name: `${f.id}/end` });
        parts = [{ shape: mk.Shape(), explicit }];
      } finally { r.free(); }
    } else {
      // a cut from a plane that has all material behind it goes into the material (like a hole)
      if (f.opts.op === 'cut' && ext.offset === 0 && !f.opts.direction && state.bodies.length) {
        const bb = K.bboxUnion(state.bodies.map(b => b.bbox()));
        const corners = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => [bb[i][0], bb[j][1], bb[k][2]])));
        const sd = corners.map(c => V.dot(V.sub(c, prof.frame.origin), prof.frame.z) * Math.sign(ext.dist || 1));
        if (sd.every(d => d <= 1e-6)) { ext.dist = -ext.dist; ctx.decide({ kind: 'cut.direction', chose: 'into the material', alternatives: ['along the sketch normal'], reason: 'all material lies behind the sketch plane' }); }
      }
      const twist = f.opts.twist != null ? ctx.ang(f.opts.twist) : 0;
      if (twist && taper) throw ctx.fail('feature.failed', `extrude ${f.id}: twist and taper together are not supported`);
      parts = twist ? S.twistedPrism(prof, { id: f.id, dist: ext.dist, offset: ext.offset, twist, herringbone: !!f.opts.herringbone })
        : taper ? S.taperedPrism(prof, { id: f.id, dist: ext.dist, taper }) : S.prism(prof, { id: f.id, dist: ext.dist, offset: ext.offset });
    }
    const named = parts.map(p => namedFromExplicit(p.shape, p.explicit, f.id));
    const res = combine(state, named, f.opts.op ?? 'auto', f.id, ctx);
    const tw = f.opts.twist != null ? ctx.ang(f.opts.twist) : 0;
    ctx.note(`extrude ${ext.text}${taper ? `, taper ${+(taper * 180 / Math.PI).toFixed(2)}°` : ''}${tw ? `, ${f.opts.herringbone ? 'herringbone ' : ''}twist ${+(tw * 180 / Math.PI).toFixed(2)}°` : ''}; ${res.op}`);
    return finish(state, f.id, res, named, { kind: 'extrude', op: res.op, extent: ext.text, regions: prof.regions?.length ?? 1, taper });
  },
  revolve(state, f, ctx) {
    const [profIn, axisIn, angleIn] = f.args;
    const prof = ctx.profile(profIn, state);
    const axis = ctx.axis(axisIn ?? [0, 0, 1]);
    const angle = angleIn == null ? 2 * Math.PI : ctx.ang(angleIn);
    if (!(Math.abs(angle) > 1e-9)) throw ctx.fail('feature.failed', `revolve ${f.id}: the angle is 0`);
    if (Math.abs(V.dot(V.unit(axis.dir), prof.frame.z)) > 1 - 1e-9) throw ctx.fail('feature.failed', `revolve ${f.id}: the axis is perpendicular to the profile plane`, 'sketch the profile on a plane that contains the axis (e.g. j.plane.XZ for j.axis.Z)');
    // the profile must stay on one side of the axis
    const side = [];
    for (const rg of prof.regions) for (const l of rg.loops) for (const p of S.loopPolygon(l, 16)) {
      const w = K.frameToWorld(prof.frame, p[0], p[1]); const rel = V.sub(w, axis.origin);
      const d = V.dot(V.cross(axis.dir, rel), prof.frame.z); if (Math.abs(d) > 1e-6) side.push(Math.sign(d));
    }
    if (side.some(x => x > 0) && side.some(x => x < 0)) throw ctx.fail('feature.failed', `revolve ${f.id}: the profile crosses the axis`, 'move the profile to one side of the axis');
    const named = S.revolve(prof, { id: f.id, axis, angle }).map(p => namedFromExplicit(p.shape, p.explicit, f.id));
    const res = combine(state, named, f.opts.op ?? 'auto', f.id, ctx);
    ctx.note(`revolve ${+(angle * 180 / Math.PI).toFixed(2)}°; ${res.op}`);
    return finish(state, f.id, res, named, { kind: 'revolve', op: res.op, angle, axis });
  },
  loft(state, f, ctx) {
    const [profs] = f.args;
    const ps = profs.map(p => ctx.profile(p, state));
    const named = S.loft(ps, { id: f.id, ruled: !!f.opts.ruled, closed: !!f.opts.closed }).map(p => namedFromExplicit(p.shape, p.explicit, f.id));
    const res = combine(state, named, f.opts.op ?? 'auto', f.id, ctx);
    ctx.note(`loft through ${ps.length} sections; ${res.op}`);
    return finish(state, f.id, res, named, { kind: 'loft', op: res.op, sections: ps.length });
  },
  sweep(state, f, ctx) {
    const [profIn, pathIn] = f.args;
    const prof = ctx.profile(profIn, state);
    const r = K.scope();
    try {
      const segs = ctx.path(pathIn, state);
      const wire = r(S.pathWire(segs, r));
      const frame = typeof f.opts.frame === 'string' ? f.opts.frame : 'rmf';
      if (typeof f.opts.frame === 'function') ctx.decide({ kind: 'sweep.frame', chose: 'rmf', alternatives: ['frenet', 'fixed'], reason: 'frame lambdas are evaluated as their default (rmf) in this kernel' });
      const named = S.sweep(prof, wire, { id: f.id, frame }).map(p => namedFromExplicit(p.shape, p.explicit, f.id));
      const res = combine(state, named, f.opts.op ?? 'auto', f.id, ctx);
      ctx.note(`sweep (${frame === 'rmf' ? 'rotation-minimising frame' : frame}); ${res.op}`);
      return finish(state, f.id, res, named, { kind: 'sweep', op: res.op, frame });
    } finally { r.free(); }
  },
  hole(state, f, ctx) {
    const [at, spec] = f.args;
    const { named, info } = buildHoles(at, spec, f, state, ctx);
    const res = combine(state, named, 'cut', f.id, ctx);
    ctx.note(`${info.count} × ${info.label}${info.teardrops ? `; ${info.teardrops} teardrop` : ''}`);
    return finish(state, f.id, res, named, { kind: 'hole', ...info });
  },
  fillet(state, f, ctx) { return edgeOp(state, f, ctx, 'fillet'); },
  chamfer(state, f, ctx) { return edgeOp(state, f, ctx, 'chamfer'); },
  shell(state, f, ctx) {
    const [openSel, tIn] = f.args;
    const t = ctx.len(tIn);
    const r = ctx.resolve(openSel, state, `${f.id}.open`);
    const byBody = groupByBody(r.items);
    const direction = f.opts.direction ?? 'in';
    let bodies = state.bodies.slice();
    const info = { kind: 'shell', open: r.items.map(c => c.name), thickness: t, direction };
    for (const [b, idx] of byBody) {
      let out;
      try { out = ocShell(b, idx, t, f.id, { direction }); }
      catch (e) { throw ctx.fail('feature.failed', `shell of ${b.id} by ${fmt(t)} failed${e?.message ? ': ' + e.message : ' (OpenCascade could not offset the faces)'}`, 'reduce the thickness or remove small fillets first'); }
      const v1 = K.volumeProps(out.shape).volume;
      if (!(v1 > 1e-9) || (direction === 'in' && v1 >= b.volume() - 1e-9) || !K.isValid(out.shape)) {
        out.shape.delete();
        const bb = b.bbox(); const minDim = Math.min(...bb[1].map((v, i) => v - bb[0][i]));
        throw ctx.fail('brep.invalid', `shell of ${b.id} by ${fmt(t)} gives an invalid solid`, `wall < ${fmt(minDim / 2)} (half the smallest dimension)`);
      }
      bodies = bodies.map(x => x === b ? mkBody(b.id, out, { createdBy: b.meta.createdBy }) : x);
      // inner corner radius of a filleted box: offset of a fillet is a fillet
      const radii = b.names.map((n, i) => n.includes('/face[') && b.faceInfo(i).kind === 'cylinder' ? b.faceInfo(i).axis.radius : null).filter(x => x);
      if (radii.length) info.innerCornerRadius = Math.max(Math.min(...radii) - t, 0);
    }
    ctx.note(`shell ${fmt(t)} ${direction}; open ${r.items.length} face${r.items.length === 1 ? '' : 's'}`);
    return { ...state, bodies, info: { ...state.info, [f.id]: info } };
  },
  pattern(state, f, ctx) {
    const [targets, pat] = f.args;
    return patternLike(state, f, ctx, targets, ctx.instances(pat, state, targets));
  },
  mirror(state, f, ctx) {
    const [targets, plane] = f.args;
    const fr = ctx.frame(plane, state);
    return patternLike(state, f, ctx, targets, [{ index: 1, m: K.matMirror(fr.z, fr.origin) }], true);
  },
  boolean(state, f, ctx) {
    const [op, targets, tools] = f.args;
    const tb = ctx.resolve(targets, state, `${f.id}.targets`).items.map(c => c.body);
    const toolNamed = ctx.solids(tools, state, f.id);
    const sub = { ...state, bodies: [...new Set(tb)] };
    const kOp = { union: 'join', join: 'join', fuse: 'join', cut: 'cut', subtract: 'cut', intersect: 'intersect', common: 'intersect' }[op] ?? op;
    const res = combine(sub, toolNamed, kOp, f.id, ctx);
    const others = state.bodies.filter(b => !tb.includes(b));
    ctx.note(`boolean ${op} on ${tb.length} bod${tb.length === 1 ? 'y' : 'ies'}`);
    return finish(state, f.id, { ...res, bodies: [...others, ...res.bodies] }, toolNamed, { kind: 'boolean', op });
  },
  split(state, f, ctx) {
    const [bodySel, tool] = f.args;
    const tb = bodySel ? [...new Set(ctx.resolve(bodySel, state).items.map(c => c.body))] : state.bodies;
    const fr = ctx.frame(tool, state);
    let bodies = state.bodies.filter(b => !tb.includes(b));
    for (const b of tb) {
      const pieces = splitByPlane(b, fr.origin, fr.z, f.id);
      pieces.forEach((p, k) => bodies.push(mkBody(`${b.id}.${k === 0 ? 'a' : String.fromCharCode(97 + k)}`, p, { createdBy: b.meta.createdBy })));
    }
    ctx.note(`split ${tb.length} bod${tb.length === 1 ? 'y' : 'ies'} by a plane`);
    return { ...state, bodies, info: { ...state.info, [f.id]: { kind: 'split', pieces: bodies.length } } };
  },
  add(state, f, ctx) {
    const [item] = f.args;
    let named, extra = {};
    if (item?.isLibFeature) {
      const out = item.build(ctx, f, state);
      let st = state;
      // ordered steps (hinges: clear room for the other leaf, add knuckles, bore them), else add then cut
      const steps = out.steps ?? [{ op: f.opts.op ?? out.op ?? 'auto', solids: out.add ?? [] }, { op: 'cut', solids: out.cut ?? [] }];
      for (const stp of steps) {
        if (!stp.solids?.length) continue;
        if (stp.op === 'cut' && !st.bodies.length) continue;
        const res = combine(st, stp.solids, stp.op === 'cut' ? 'cut' : stp.op === 'new' ? 'new' : stp.op === 'join' && f.opts.op !== 'cut' ? 'join' : f.opts.op ?? stp.op ?? 'auto', f.id, ctx, stp.hints ?? {});
        st = { ...st, bodies: res.bodies };
      }
      ctx.note(`${item.label ?? 'lib item'}${out.note ? '; ' + out.note : ''}`);
      const all = steps.flatMap(x => x.solids ?? []);
      return { ...st, tools: withTool(st, f.id, steps.some(x => x.op !== 'cut' && x.solids?.length) ? 'join' : 'cut', all), info: { ...st.info, [f.id]: { kind: 'add', item: item.label, ...out.info } } };
    }
    named = ctx.solids(item, state, f.id);
    if (f.opts.at != null) { const m = ctx.placement(f.opts.at, state); named = named.map(n => { const t = transformNamed(n, m); n.shape.delete(); return t; }); }
    const res = combine(state, named, f.opts.op ?? 'auto', f.id, ctx);
    ctx.note(`add ${item?.isPart ? `part '${item.name}'` : item?.isShape ? String(item) : 'shape'}; ${res.op}`);
    return finish(state, f.id, res, named, { kind: 'add', op: res.op, ...extra });
  },
  move(state, f, ctx) { return moveCopy(state, f, ctx, false); },
  copy(state, f, ctx) { return moveCopy(state, f, ctx, true); },
  pushPull(state, f, ctx) {
    const [faces, dIn] = f.args;
    const d = ctx.len(dIn);
    const r = ctx.resolve(faces, state, `${f.id}.faces`);
    const named = [];
    for (const c of r.items) {
      const fi = c.body.faceInfo(c.index);
      if (fi.kind !== 'plane') throw ctx.fail('feature.failed', `pushPull needs planar faces; ${c.name} is ${fi.kind}`);
      const rr = K.scope();
      try {
        const oc = ctx.oc;
        const face = c.body.faces.list[c.index];
        const mk = rr(new oc.BRepPrimAPI_MakePrism(face, rr(K.vec(V.mul(fi.normal, d))), true, true));
        named.push(namedFromExplicit(mk.Shape(), [], f.id));
      } finally { rr.free(); }
    }
    const res = combine(state, named, d >= 0 ? 'join' : 'cut', f.id, ctx);
    ctx.note(`push/pull ${r.items.length} face(s) by ${fmt(d)}`);
    return finish(state, f.id, res, named, { kind: 'pushPull', d });
  },
  custom(state, f, ctx) {
    const [fn] = f.args;
    const input = state.bodies.map(b => ctx.wrapBody(b));
    const out = fn(input, ctx.lambdaCtx(state));
    const list = (Array.isArray(out) ? out : [out]).filter(Boolean);
    const keep = list.filter(x => x?.__body).map(x => x.__body);
    const named = list.filter(x => !x?.__body).flatMap(x => ctx.solids(x, state, f.id));
    const bodies = [...keep];
    for (const n of named) bodies.push(mkBody(nextBodyId({ bodies }), n, { createdBy: f.id }));
    ctx.note(`custom feature: ${bodies.length} bod${bodies.length === 1 ? 'y' : 'ies'}`);
    return { ...state, bodies, info: { ...state.info, [f.id]: { kind: 'custom' } } };
  },
};
// Emboss: a region (text, logo) placed on a planar face and extruded out of it (join) or into it (cut).
// Without an explicit `at`, the region is centred on the face.
FEATURES.emboss = (state, f, ctx) => {
  const [regionIn, depthIn] = f.args;
  const depth = ctx.len(depthIn);
  const op = f.opts.op ?? 'join';
  let prof = ctx.profile(regionIn, state);
  let onFace = null, onBody = null;
  if (f.opts.on) {
    const r = ctx.resolve(f.opts.on, state, `${f.id}.on`);
    if (r.items.length !== 1) throw ctx.fail('ref.expect', `emboss target resolved to ${r.items.length} faces; expected 1`, `pick one: ${f.opts.on}.largest()  or  .near([x, y, z])`);
    const c = r.items[0]; const fi = c.body.faceInfo(c.index);
    if (fi.kind !== 'plane') throw ctx.fail('feature.failed', `emboss on ${c.name}: the face is ${fi.kind}; wrapping is not supported`, 'emboss on a planar face');
    const frame = frameOnFace(fi.center, fi.normal);
    let dx = 0, dy = 0;
    if (!regionIn?.hasAt) {
      const pts = prof.regions.flatMap(rg => rg.loops.flatMap(l => S.loopPolygon(l, 4)));
      const bx = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))], by = [Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1]))];
      const rel = V.sub(fi.center, frame.origin);
      dx = V.dot(rel, frame.x) - (bx[0] + bx[1]) / 2; dy = V.dot(rel, frame.y) - (by[0] + by[1]) / 2;
    }
    prof = { ...shiftProfile(prof, dx, dy), frame };
    onFace = c.name; onBody = c.body;
  }
  const parts = S.prism(prof, { id: f.id, dist: op === 'cut' ? -depth : depth });
  const named = parts.map(p => namedFromExplicit(p.shape, p.explicit, f.id));
  const res = combine(state, named, op === 'cut' ? 'cut' : 'join', f.id, ctx, { target: onBody });
  ctx.note(`emboss ${op} ${fmt(depth)}${onFace ? ` on ${onFace}` : ''}; ${named.length} piece${named.length === 1 ? '' : 's'}`);
  return finish(state, f.id, res, named, { kind: 'emboss', op, depth, on: onFace, pieces: named.length });
};
function shiftProfile(prof, dx, dy) {
  const m = p => [p[0] + dx, p[1] + dy];
  const seg = s => ({ ...s, ...(s.a ? { a: m(s.a) } : {}), ...(s.b ? { b: m(s.b) } : {}), ...(s.c ? { c: m(s.c) } : {}), ...(s.pts ? { pts: s.pts.map(m) } : {}) });
  return { ...prof, regions: prof.regions.map(rg => ({ ...rg, loops: rg.loops.map(l => l.map(seg)) })) };
}
// Draft: faces tilt by angle away from the pull direction about a neutral plane (default: the body's lowest plane along pull).
FEATURES.draft = (state, f, ctx) => {
  const [facesSel, angleIn] = f.args;
  const angle = ctx.ang(angleIn);
  const pull = f.opts.pull ? ctx.axis(f.opts.pull, state).dir : [0, 0, 1];
  const r = ctx.resolve(facesSel, state, `${f.id}.faces`);
  let bodies = state.bodies.slice();
  for (const [b, idx] of groupByBody(r.items)) {
    let neutral;
    if (f.opts.neutral) neutral = ctx.frame(f.opts.neutral, state).origin;
    else { const bb = b.bbox(); const corners = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => [bb[i][0], bb[j][1], bb[k][2]]))); neutral = corners.reduce((m, c) => V.dot(c, pull) < V.dot(m, pull) ? c : m); }
    let out;
    try { out = ocDraft(b, idx, angle, pull, neutral, f.id); }
    catch (e) { throw ctx.fail('feature.failed', `draft ${+(angle * 180 / Math.PI).toFixed(2)}° on ${idx.length} face(s) of ${b.id} failed${e?.message ? ': ' + e.message : ''}`, 'draft faces that are parallel to the pull direction'); }
    bodies = bodies.map(x => x === b ? mkBody(b.id, out, { createdBy: b.meta.createdBy }) : x);
  }
  ctx.note(`draft ${+(angle * 180 / Math.PI).toFixed(2)}° on ${r.items.length} face(s)`);
  return { ...state, bodies, info: { ...state.info, [f.id]: { kind: 'draft', angle, faces: r.items.map(c => c.name) } } };
};
// Rib: a wall of thickness t grown from a sketch line in `direction` until it leaves the bounding box, joined.
FEATURES.rib = (state, f, ctx) => {
  const [wireIn, tIn] = f.args;
  const t = ctx.len(tIn);
  const prof = ctx.profile(wireIn, state);
  const segs = (prof.wire?.segments ?? prof.wire ?? []).filter(x => x.kind === 'line');
  if (!segs.length) throw ctx.fail('feature.failed', 'rib: expected a sketch wire of lines (sketch.wire([...]))');
  const dir = f.opts.direction ? ctx.axis(f.opts.direction, state).dir : V.neg(prof.frame.y);
  const bb = K.bboxUnion(state.bodies.map(b => b.bbox()));
  const L = bb ? V.dist(bb[0], bb[1]) * 2 : 100;
  const named = [];
  segs.forEach((sg, k) => {
    const A = K.frameToWorld(prof.frame, ...sg.a), B = K.frameToWorld(prof.frame, ...sg.b);
    const along = V.unit(V.sub(B, A)); const n = V.unit(V.cross(along, dir));
    // a rectangle in the plane (along, dir), extruded ±t/2 along n
    const fr = { origin: V.sub(A, V.mul(n, t / 2)), x: along, y: V.unit(V.sub(dir, V.mul(along, V.dot(dir, along)))), z: n };
    const len = V.dist(A, B);
    const loop = [[0, 0], [len, 0], [len, L], [0, L]].map((p, i, a) => ({ kind: 'line', a: p, b: a[(i + 1) % 4], src: `${sg.src ?? 'l'}.${['edge', 'end', 'far', 'start'][i]}` }));
    const [pr] = S.prism({ frame: fr, regions: [{ loops: [loop] }] }, { id: f.id, dist: t });
    named.push(namedFromExplicit(pr.shape, pr.explicit, f.id));
  });
  // keep only the part of the slab inside the bodies' bounding box
  const clipped = [];
  for (const n of named) {
    const box = S.box(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]);
    const tb = { shape: K.transformShape(box.shape, K.matTranslate(...bb[0])), names: K.subShapes(box.shape, 'FACE').list.map(() => `${f.id}/clip`) };
    box.shape.delete();
    const tmp = tmpBody(n);
    clipped.push(...booleanOp('common', tmp, [tb], f.id, { simplify: false }));
    tmp.detach(); n.shape.delete(); tb.shape.delete();
  }
  const res = combine(state, clipped, 'join', f.id, ctx);
  ctx.note(`rib ${fmt(t)} from ${segs.length} line(s)`);
  return finish(state, f.id, res, clipped, { kind: 'rib', thickness: t });
};
// Thicken: faces become solids of thickness t (offset along their normals), joined.
FEATURES.thicken = (state, f, ctx) => {
  const [facesSel, tIn] = f.args;
  const t = ctx.len(tIn);
  const r = ctx.resolve(facesSel, state, `${f.id}.faces`);
  const named = ocThicken(r.items.map(c => ({ face: c.body.faces.list[c.index], name: c.name })), t, f.id);
  const res = combine(state, named, f.opts.op ?? 'join', f.id, ctx);
  ctx.note(`thicken ${r.items.length} face(s) by ${fmt(t)}`);
  return finish(state, f.id, res, named, { kind: 'thicken', thickness: t });
};
for (const k of ['import', 'deleteFace']) FEATURES[k] = (state, f, ctx) => {
  ctx.diag({ level: 'warning', kind: 'feature.unsupported', message: `${k} is not supported by this kernel yet; the feature is skipped`, fix: `remove .${k}(…) or model it with extrude/cut` });
  return { ...state, info: { ...state.info, [f.id]: { kind: k, skipped: true } } };
};

function groupByBody(items) {
  const m = new Map();
  for (const c of items) { if (!m.has(c.body)) m.set(c.body, []); if (!m.get(c.body).includes(c.index)) m.get(c.body).push(c.index); }
  return m;
}

function edgeOp(state, f, ctx, kind) {
  const [sel, rIn] = f.args;
  const r = ctx.resolve(sel, state, `${f.id}.edges`);
  let items = r.items;
  if (r.kind === 'faces') items = ctx.resolve(sel instanceof Selector ? sel.edges() : sel, state).items;
  if (!items.length) { ctx.diag({ level: 'warning', kind: 'ref.lost', message: `${kind} selector resolved to no edges`, fix: 'check the selector with prog.why(…)' }); return state; }
  const byBody = groupByBody(items);
  let bodies = state.bodies.slice();
  const info = { kind, edges: [] };
  for (const [b, idx] of byBody) {
    // per-edge values (lambda slot) and concave-first order
    const props = idx.map(i => ctx.edgeProps(b, i));
    const vals = idx.map((i, k) => typeof rIn === 'function' ? ctx.len(rIn(props[k], ctx.lambdaCtx(state))) : ctx.len(rIn));
    const order = idx.map((i, k) => k).sort((a, c) => (props[a].concave === props[c].concave ? 0 : props[a].concave ? -1 : 1));
    if (kind === 'fillet' && props.some(x => x.convex) && props.some(x => x.concave)) ctx.decide({ kind: 'fillet.order', chose: order.map(k => `${b.edgeNames[idx[k]]} (${props[k].convex ? 'convex' : 'concave'})`), reason: 'concave first: the root blend adds material, so the rim keeps a full face to roll on' });
    const oIdx = order.map(k => idx[k]), oVals = order.map(k => vals[k]);
    let out;
    try {
      out = kind === 'fillet' ? ocFillet(b, oIdx, oVals, f.id) : ocChamfer(b, oIdx, oVals[0], f.id, { d2: f.opts.d2 != null ? ctx.len(f.opts.d2) : undefined, angle: f.opts.angle != null ? ctx.ang(f.opts.angle) : undefined });
    } catch (e) {
      const lost = e && e.lost && e.lost.length ? e.lost : null;
      const runs = lost ? `: its rim runs into ${lost.join(', ')}, which OpenCascade then drops` : '';
      if (kind !== 'fillet') throw ctx.fail('feature.failed', `chamfer ${fmt(oVals[0])} failed on ${idx.length} edges${runs}`, lost ? 'use a smaller chamfer, or move the other feature' : undefined);
      if (lost) {
        // a rim that lands exactly on another feature's edge fails at that radius only: try a little either side
        const r0 = Math.max(...oVals), ok = [];
        for (const r of [r0 * 0.98, r0 * 1.02]) { try { ocFillet(b, oIdx, oVals.map(v => v * r / r0), f.id).shape.delete(); ok.push(r); } catch { /* fails too */ } }
        if (ok.length) throw ctx.fail('fillet.tangent', `r = ${fmt(r0)} puts the fillet's rim exactly on ${lost.join(', ')}, which OpenCascade then drops; ${ok.map(fmt).join(' and ')} work${ok.length === 1 ? 's' : ''}`, `r = ${fmt(Math.floor(ok[0] * 100) / 100)}`);
      }
      const max = maxFeasible(b, oIdx, Math.max(...oVals), f.id);
      throw ctx.fail('fillet.tooLarge', `r = ${fmt(Math.max(...oVals))} is too large for ${idx.length} edge${idx.length === 1 ? '' : 's'} of ${b.id}${runs}${max ? `; the largest that works is about ${fmt(max)}` : ''}`, max ? `r ≤ ${fmt(Math.floor(max * 100) / 100)}` : 'reduce the radius');
    }
    bodies = bodies.map(x => x === b ? mkBody(b.id, out, { createdBy: b.meta.createdBy }) : x);
    idx.forEach((i, k) => info.edges.push({ name: b.edgeNames[i], [kind === 'fillet' ? 'radius' : 'distance']: vals[k], convex: props[k].convex, length: props[k].length?.value ?? props[k].length }));
  }
  ctx.note(`${kind}, ${items.length} edge${items.length === 1 ? '' : 's'}`);
  return { ...state, bodies, info: { ...state.info, [f.id]: info } };
}
function maxFeasible(b, idx, r, id) {
  let lo = 0, hi = r;
  for (let k = 0; k < 7; k++) {
    const mid = (lo + hi) / 2;
    try { const o = ocFillet(b, idx, mid, id); o.shape.delete(); lo = mid; } catch { hi = mid; }
  }
  return lo > 0 ? lo : null;
}

function moveCopy(state, f, ctx, copy) {
  const [targets, tx] = f.args;
  const tb = [...new Set(ctx.resolve(targets, state).items.map(c => c.body))];
  const m = ctx.placement(tx, state);
  let bodies = copy ? state.bodies.slice() : state.bodies.filter(b => !tb.includes(b));
  for (const b of tb) {
    const t = transformNamed({ shape: b.shape, names: b.names, aliases: b.aliases }, m);
    bodies.push(mkBody(copy ? nextBodyId({ bodies }) : b.id, t, { createdBy: b.meta.createdBy }));
  }
  ctx.note(`${copy ? 'copy' : 'move'} ${tb.length} bod${tb.length === 1 ? 'y' : 'ies'}`);
  return { ...state, bodies, info: { ...state.info, [f.id]: { kind: copy ? 'copy' : 'move' } } };
}

// Patterns: a feature target replays the feature's tool at every instance with the feature's op;
// a body target copies bodies (joined when they touch).
function patternLike(state, f, ctx, targets, instances, isMirror = false) {
  const featIds = [];
  let bodySel = null;
  const list = Array.isArray(targets) ? targets : [targets];
  for (const t of list) {
    if (t instanceof FeatureRef) featIds.push(t.id);
    else if (typeof t === 'string' && state.tools[t]) featIds.push(t);
    else bodySel = t;
  }
  let st = state;
  const skipped = [];
  let made = 0;
  for (const fid of featIds) {
    const tool = state.tools[fid];
    if (!tool) throw ctx.fail('ref.lost', `pattern: feature '${fid}' has no geometry to repeat`);
    for (const inst of instances) {
      if (K.isIdentity(inst.m)) continue;
      const k = inst.index;
      const named = tool.bodies.map(b => transformNamed({ shape: b.shape, names: b.names, aliases: b.aliases }, inst.m, n => `${f.id}[${k}]/${n}`));
      try {
        const res = combine(st, named, tool.op === 'cut' ? 'cut' : 'join', f.id, ctx);
        st = { ...st, bodies: res.bodies }; made++;
      } catch (e) {
        if (f.opts.onFail === 'error') throw e;
        skipped.push(k); ctx.diag({ level: 'warning', kind: 'pattern.instanceSkipped', message: `instance ${k} of ${fid} failed${e?.message ? ': ' + e.message : ''}` });
      }
    }
  }
  if (bodySel) {
    const tb = [...new Set(ctx.resolve(bodySel, state).items.map(c => c.body))];
    for (const inst of instances) {
      if (K.isIdentity(inst.m)) continue;
      const named = tb.map(b => transformNamed({ shape: b.shape, names: b.names, aliases: b.aliases }, inst.m, n => `${f.id}[${inst.index}]/${n}`));
      const res = combine(st, named, 'auto', f.id, { ...ctx, decide: () => {} });
      st = { ...st, bodies: res.bodies }; made++;
    }
  }
  ctx.note(`${isMirror ? 'mirror' : 'pattern'}: ${made} instance${made === 1 ? '' : 's'}${skipped.length ? `, ${skipped.length} skipped` : ''}`);
  return { ...st, info: { ...st.info, [f.id]: { kind: isMirror ? 'mirror' : 'pattern', instances: made + 1, skipped } } };
}
