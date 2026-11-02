// Part compilation: parameters (L2), sketches (L3), the feature timeline with a per-feature content-hash cache (L4).
import { getOC } from './oc.js';
import * as K from './kernel.js';
import { FEATURES, emptyState, combine } from './features.js';
import { Selector, FeatureRef, resolve as resolveSel } from './select.js';
import { makeCoercers, textValue, frameOf, axisOf, matOf, arr3, frameOnFace, profileFromSegments, orthoFrame } from './adapt.js';
import { Frame, Point, Dir, Axis, Deferred, resolveDatum, isDeferred, tx as coreTx, frame as coreFrame } from './geom.js';
import { paramLayers, resolveAll, paramRows, Literal } from './params.js';
import { isQuantity, mm, rad, q as qParse } from './units.js';
import { deps as exprDeps } from './expr.js';
import { Shape } from './csg.js';
import { TABLES_VERSION } from './holes.js';
import { fitContext, setCurrentFit, restoreFit } from './fit.js';
import { hashStr, canon } from './hash.js';
import { textPolylines } from './fonts.js';

const V = K.V;
export const KERNEL_TOL = '1e-7 mm';

// ── feature cache, kept across compiles (worker lifetime) ───────────────────
export const featureCache = new Map();   // key → { state, notes, decisions, diagnostics, ms }
const CACHE_MAX = 400;
function cachePut(key, entry) {
  featureCache.set(key, entry);
  if (featureCache.size > CACHE_MAX) featureCache.delete(featureCache.keys().next().value);
}
export function cachedStates() { const out = []; for (const e of featureCache.values()) out.push(e.state); return out; }

// ── part compiler ────────────────────────────────────────────────────────────
// opts: { override, config, fit, buildDir, printer, trace, diagnostics, decisions, prefix, data }
export function compilePart(part, opts = {}) {
  const prev = setCurrentFit(null);
  try { return compilePartIn(part, opts); } finally { restoreFit(prev); }
}
function compilePartIn(part, opts) {
  const t0 = performance.now();
  const out = { name: part.name, kind: 'part', diagnostics: [], decisions: [], trace: [], features: [], sketches: new Map(), fitUsed: new Set(), fitUsers: new Set(), refs: [] };
  const diag = d => out.diagnostics.push({ level: 'error', ...d });
  // L2: parameters
  const tp = performance.now();
  const gapOv = Object.fromEntries(Object.entries(opts.override ?? {}).filter(([k]) => k.startsWith('gap.')).map(([k, v]) => [k.slice(4), v]));
  const fit = fitContext(opts.fit ?? part.meta.fit, opts.printer, gapOv);
  setCurrentFit(fit);
  // fit gaps are names in expressions ('w + gap.slide'), and j.fit.* values may be params: both resolve in this
  // compile's fit context
  const gapVals = Object.fromEntries(Object.entries(fit.classes).map(([k, v]) => [`gap.${k}`, mm(v)]));
  const fitIn = o => o && typeof o === 'object' && !isQuantity(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v?.isFitValue ? v.resolve({ fit }) : v])) : o;
  const cfgs = part.meta.configs && (part.meta.configs.rows ? { ...part.meta.configs, rows: Object.fromEntries(Object.entries(part.meta.configs.rows).map(([k, r]) => [k, fitIn(r)])) } : Object.fromEntries(Object.entries(part.meta.configs).map(([k, r]) => [k, fitIn(r)])));
  const layers = paramLayers({ params: part.meta.params.map(fitIn), configs: cfgs, config: opts.config ?? part.meta.config, overrides: part.meta.overrides.map(fitIn), compileOverride: normalizeOverride(opts.override, part, opts.itemId, opts.bind) });
  // shared (print job) params: the part's own declarations of those names take the job's value
  if (opts.bind) {
    const decl = new Set(part.meta.params.flatMap(o => Object.keys(o ?? {})));
    const vals = Object.fromEntries(Object.entries(opts.bind).filter(([k]) => decl.has(k)));
    if (Object.keys(vals).length) { const at = layers.map(l => l.src).lastIndexOf('params') + 1; layers.splice(at, 0, { src: 'job', values: vals }); }
  }
  const pres = resolveAll(layers, { ...(opts.printerCtx ?? {}) }, { exposed: part.meta.exposed ? exposeOf(part.meta.exposed) : undefined, lookup: n => gapVals[n] });
  pres.values = { ...gapVals, ...(pres.values ?? {}) };
  out.params = pres; out.values = pres.values;
  out.paramRows = safeRows(pres);
  for (const d of pres.diagnostics ?? []) out.diagnostics.push(d);
  out.trace.push({ pass: 'resolve', level: 'L2', ms: performance.now() - tp, cached: false, note: `${Object.keys(pres.values ?? {}).length} params` });
  const { len, ang, number } = makeCoercers(pres.values ?? {}, opts.printerCtx ?? {}, fit);
  setCurrentFit(fit, len);
  const pc = { part, opts, out, values: pres.values ?? {}, len, ang, number, fit, buildDir: opts.buildDir ?? [0, 0, 1], stateHist: [] };

  // L4: timeline
  let state = emptyState();
  let key = hashStr(`part:${part.name}|tol:${KERNEL_TOL}|tables:${TABLES_VERSION}`);
  const timeline = part.timeline();
  const seen = new Set();
  let hits = 0;
  for (const f of timeline) {
    const tf = performance.now();
    const fkey = featureKey(f, key, pc);
    const fctx = makeFeatureCtx(pc, f, seen);
    let entry = featureCache.get(fkey);
    let cached = !!entry;
    if (!entry) {
      try {
        const st = FEATURES[f.type] ? FEATURES[f.type](state, f, fctx) : (() => { throw fctx.fail('feature.failed', `unknown feature type '${f.type}'`); })();
        entry = { state: st, notes: fctx._notes, decisions: fctx._decisions, diagnostics: fctx._diags, ms: performance.now() - tf, sketches: fctx._sketches };
        cachePut(fkey, entry);
      } catch (e0) {
        const e = e0 instanceof Error ? e0 : K.ocError(e0, `${f.type} ${f.id}`);
        const kind = e.kind ?? 'feature.failed';
        const d = { level: 'error', kind, at: f.id, message: e.kind ? e.message : `${f.type} ${f.id} failed: ${e.message}`, fix: e.fix, line: f.at?.line };
        // a JavaScript error from inside the engine is a bug, not a mistake in the script: say so, and where (JIG-013)
        if (!e.kind && !e.occt && (e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError)) {
          const mine = /^\s+at .*script\.js:(\d+)/m.exec(String(e.stack ?? '').split('\n').slice(1, 2).join('\n'));
          if (mine) d.message += ` (in a function of your script, script.js:${Math.max(1, +mine[1] - 1)})`;   // a lambda it passed
          else {
            d.kind = 'engine.bug';
            d.message += ` (an error inside the engine, not in your script; ${engineFrames(e)})`;
            d.fix = d.fix ?? 'try another way to write this feature (another placement or selector), and report it';
          }
        }
        diag(d); out.diagnostics.push(...fctx._diags);
        out.trace.push({ pass: `feature:${f.id}`, level: 'L4', ms: performance.now() - tf, cached: false, note: `failed: ${e.message}` });
        out.features.push({ id: f.id, type: f.type, auto: f.auto, failed: true, line: f.at?.line, key: fkey });
        seen.add(f.id);
        continue;
      }
    } else {
      hits++;
      // a cached feature keeps its solved sketches; read them through this script's builders, whose lines may differ
      const fresh = sketchesIn([f.args, f.opts]);
      for (const rec0 of entry.sketches ?? []) if (!out.sketches.has(rec0.id)) {
        const rec = relined(rec0, fresh.get(rec0.id));
        out.sketches.set(rec.id, rec);
        for (const d of rec.solved.diagnostics ?? []) if (!(d.kind === 'sketch.redundant' && rec.sketch?.mode?.mode === 'explicit')) out.diagnostics.push({ at: rec.id, line: f.at?.line, ...d });
        for (const d of rec.solved.decisions ?? []) out.decisions.push({ at: rec.id, ...d });
      }
    }
    state = entry.state;
    key = fkey;
    for (const d of entry.decisions) out.decisions.push({ at: f.id, ...d });
    for (const d of entry.diagnostics) out.diagnostics.push({ at: f.id, line: f.at?.line, ...d });
    if (f.auto && fctx._referenced) out.diagnostics.push({ level: 'info', kind: 'ref.autoId', at: f.id, message: `feature '${f.id}' has a generated id and is referenced`, fix: `give it an id: { id: '${f.id}' }`, line: f.at?.line });
    out.trace.push({ pass: `feature:${f.id}`, level: 'L4', ms: cached ? performance.now() - tf : entry.ms, cached, note: `${f.type}: ${entry.notes.join('; ')}` });
    out.features.push({ id: f.id, type: f.type, auto: f.auto, line: f.at?.line, key: fkey, cached, bodies: state.bodies.map(b => b.id), info: state.info[f.id], sketches: (entry.sketches ?? []).map(r => r.id) });
    pc.stateHist.push({ id: f.id, state });
    seen.add(f.id);
  }
  // references to auto ids by later features
  for (const r of out.refs) { const ft = timeline.find(f => f.id === r.id); if (ft?.auto) out.diagnostics.push({ level: 'info', kind: 'ref.autoId', at: r.at, message: `'${r.id}' is a generated feature id`, fix: `name it: { id: '${r.id}' }` }); }
  // a valid solid has a whole, non-negative genus (Euler–Poincaré); anything else is a broken body the kernel
  // did not reject, such as a sketch hole tangent to its outline
  for (const b of state.bodies) {
    let t = null; try { t = b.topology(); } catch { /* no topology */ }
    if (t && t.residual) out.diagnostics.push({ level: 'warning', kind: 'brep.invalid', at: b.id, message: `${b.id} is not a valid solid: V − E + F − (L − F) = ${t.V - t.E + t.F - (t.L - t.F)} gives genus ${t.G}, which is not a whole number`, fix: 'look for curves that only touch (a hole tangent to an outline, faces meeting at an edge) and overlap or separate them' });
  }
  out.state = state;
  out.key = key;
  out.hash = 'h:' + key;
  out.cacheHits = hits; out.featureCount = timeline.length;
  out.ms = performance.now() - t0;
  out.pc = pc;
  return out;
}
// Overrides from the host arrive as plain numbers in display units: type them like the declared params.
// Keys: 'name', '<part name>.name' or '<print job item id>.name' (a job may add a part under another id).
function normalizeOverride(ov, part, itemId = null, shared = null) {
  if (!ov) return null;
  const decl = Object.assign({}, ...part.meta.params);
  const cfgNames = new Set(Object.values(part.meta.configs?.rows ?? part.meta.configs ?? {}).flatMap(r => Object.keys(r ?? {})));
  const out = {};
  for (let [k, v] of Object.entries(ov)) {
    if (k.startsWith('gap.')) continue;
    if (shared && k in shared) continue;   // a plain name a print job shares: its job value is bound already
    if (k.startsWith(part.name + '.')) k = k.slice(part.name.length + 1);
    else if (itemId && k.startsWith(itemId + '.')) k = k.slice(itemId.length + 1);
    if (!(k in decl) && !cfgNames.has(k)) continue;   // overrides for other parts or joints
    if (v && typeof v === 'object' && !isQuantity(v) && 'value' in v) out[k] = qParse(`${v.value} ${v.unit ?? 'mm'}`);
    else if (typeof v === 'number' && isQuantity(decl[k]) && decl[k].unit) out[k] = qParse(`${v} ${decl[k].unit}`);
    else if (typeof v === 'number' && typeof decl[k] === 'string') out[k] = mm(v);
    else if (typeof v === 'string' && decl[k]?.kind === 'literal') out[k] = new Literal(v);   // text params take text
    else out[k] = v;
  }
  return out;
}
function safeRows(pres) { try { return paramRows(pres); } catch { return []; } }
function exposeOf(e) { const o = {}; for (const n of e.names ?? []) o[n] = { label: e.labels?.[n] ?? n, range: e.ranges?.[n] ?? null, step: e.steps?.[n] ?? null }; return o; }

// Cache key: previous key (input bodies), type, canonical args, the param values the args depend on,
// build direction + fit values for holes, kernel tolerance and tables (in the root key).
function featureKey(f, prevKey, pc) {
  const names = new Set();
  const c = canon([f.type, f.args, f.opts], s => { for (const n of safeDeps(s)) names.add(n); });
  // fit values name their size expression in their text: j.fit.hole(pin, slide) depends on 'pin'
  for (const m of c.matchAll(/j\.fit\.\w+\(([^,()]+),/g)) for (const n of safeDeps(m[1].trim())) names.add(n);
  const vals = [...names].sort().map(n => [n, pc.values[n] === undefined ? null : canon(pc.values[n])]);
  let extra = '';
  // holes, library items and any fit-aware value (j.fit.hole in a region, gear backlash) depend on the fit context
  if (f.type === 'hole' || f.type === 'add' || c.includes('j.fit.') || c.includes('isFitValue:true')) extra = `|dir:${pc.buildDir.map(x => +x.toFixed(6))}|fit:${pc.fit.key}`;
  return hashStr(`${prevKey}|${c}|${JSON.stringify(vals)}${extra}`);
}
const safeDeps = s => { try { return exprDeps(s); } catch { return []; } };

// ── per-feature context ──────────────────────────────────────────────────────
function makeFeatureCtx(pc, f, seen) {
  const ctx = {
    oc: getOC(), featId: f.id, line: f.at?.line, values: pc.values, len: pc.len, ang: pc.ang, number: pc.number,
    buildDir: pc.buildDir, _notes: [], _decisions: [], _diags: [], _referenced: false, _sketches: [],
    note: s => ctx._notes.push(s),
    decide: d => ctx._decisions.push(d),
    diag: d => ctx._diags.push({ level: 'warning', ...d }),
    fail: (kind, message, fix) => Object.assign(new Error(message), { kind, fix }),
    fitCtx: () => pc.fit, useFit: cls => { pc.out.fitUsed.add(cls); pc.out.fitUsers.add(f.id); },
    resolve: (sel, state, at = f.id) => {
      const s = sel instanceof FeatureRef ? sel.faces() : sel instanceof Selector ? sel : typeof sel === 'string' ? null : sel;
      if (!s) throw ctx.fail('ref.lost', `expected a selector, got ${String(sel)}`);
      noteRefs(s, pc, at);
      const r = resolveSel(s, selEnv(pc, state, seen));
      const anon = r.items.filter(c => /\/face#\d+$/.test(c.name));
      if (anon.length) ctx._diags.push({ level: 'warning', kind: 'ref.fragile', at, message: `${anon.map(c => c.name).join(', ')} ha${anon.length === 1 ? 's' : 've'} no genealogy (generated name)`, fix: 'select through a feature with a known role, or a geometric query' });
      if (!r.items.length && !r.notes.some(n => n.kind === 'ref.expect')) ctx._diags.push({ level: 'warning', kind: 'ref.lost', at, message: `${s} resolved to nothing`, fix: 'check the selector with prog.why(…)' });
      for (const n of r.notes) {
        if (n.kind === 'ref.note') { ctx._diags.push({ level: 'info', kind: 'ref.note', at, message: n.message }); continue; }
        if (n.kind === 'ref.expect') throw ctx.fail('ref.expect', `${at}: ${n.message}`, r.items.length > 1 ? `pick one: ${s}.largest()  or  .near([x, y, z])` : 'check the selector with prog.why(…)');
        ctx._diags.push({ level: n.kind === 'ref.fragile' ? 'warning' : 'warning', kind: n.kind, at, message: n.message, fix: n.kind === 'ref.fragile' ? 'prefer a feature-based selector: j.feat(id).sideFace(…) or a query' : undefined });
      }
      return r;
    },
    profile: (p, state) => profileOf(p, state, pc, ctx),
    frame: (x, state) => frameOf(datum(x, state, pc, ctx, 'plane')) ?? (() => { throw ctx.fail('feature.failed', `expected a plane, got ${String(x)}`); })(),
    axis: (x, state) => axisOf(datum(x, state, pc, ctx, 'axis')) ?? (() => { throw ctx.fail('feature.failed', `expected an axis, got ${String(x)}`); })(),
    point: (x, state) => { const d = datum(x, state, pc, ctx, 'point'); return arr3(d); },
    placement: (x, state) => placementOf(x, state, pc, ctx),
    instances: (pat, state, targets) => instancesOf(pat, state, pc, ctx, targets),
    solids: (x, state, id) => solidsOf(x, state, pc, ctx, id),
    sketchPoints: (sk, state) => sketchPoints(sk, state, pc, ctx),
    inside: (p, state) => insideAny(p, state),
    path: (x, state) => pathOf(x, state, pc, ctx),
    edgeProps: (b, i) => props({ body: b, index: i, name: b.edgeNames[i] }, 'edges'),
    lambdaCtx: state => ({ p: pc.values, default: undefined, values: pc.values }),
    wrapBody: b => ({ __body: b, id: b.id, volume: () => mm(b.volume()).mul(mm(1)).mul(mm(1)), faces: b.names.slice() }),
    compileSub: (part, o) => compilePart(part, { ...pc.opts, ...o, override: null, config: null }),
  };
  return ctx;
}
function noteRefs(s, pc, at) {
  const walk = x => {
    if (!x) return;
    if (x instanceof FeatureRef) { pc.out.refs.push({ id: x.id, at }); return; }
    if (x instanceof Selector) { if (x.root.type === 'feat') pc.out.refs.push({ id: x.root.id, at }); for (const st of x.steps) { walk(st.sel); walk(st.target); } if (x.root.sel) walk(x.root.sel); }
  };
  walk(s);
}
export function selEnv(pc, state, seen) {
  return {
    bodies: state.bodies, part: pc.part.name, featureIds: seen, len: pc.len, bedDir: pc.buildDir,
    point: x => arr3(isDeferred(x) ? resolveDatum(x, { scope: pc.values }) : x),
    props, lambdaCtx: { p: pc.values },
  };
}

// Selector candidate → object for where/sortBy lambdas (core types: Dir, Point, Quantity).
export function props(c, kind) {
  const b = c.body;
  if (kind === 'faces') {
    const fi = b.faceInfo(c.index);
    return { name: c.name, kind: fi.kind, area: mm(fi.area).mul(mm(1)), center: new Point(...fi.center), normal: fi.normal ? Dir.from(...fi.normal) : null,
      radius: fi.axis ? mm(fi.axis.radius) : null, axis: fi.axis ? new Axis(new Point(...fi.axis.origin), Dir.from(...fi.axis.dir)) : null, body: b.id };
  }
  if (kind === 'edges') {
    const ei = b.edgeInfo(c.index);
    const o = { name: c.name, kind: ei.kind, length: mm(ei.length), center: new Point(...ei.center), radius: ei.axis ? mm(ei.axis.radius) : null, dir: ei.dir ? Dir.from(...ei.dir) : null, body: b.id };
    Object.defineProperty(o, 'convex', { get: () => edgeDihedral(b, c.index) === 'convex', enumerable: true });
    Object.defineProperty(o, 'concave', { get: () => edgeDihedral(b, c.index) === 'concave', enumerable: true });
    Object.defineProperty(o, 'smooth', { get: () => edgeDihedral(b, c.index) === 'smooth', enumerable: true });
    return o;
  }
  return { name: c.name, body: b.id };
}
// Dihedral class of an edge: 'convex' (moving from the edge into the second face goes below the first face's
// tangent plane), 'concave', or 'smooth' (tangent faces, seams, boundaries).
const convexCache = new WeakMap();
export const edgeConvex = (b, ei) => edgeDihedral(b, ei) === 'convex';
export function edgeDihedral(b, ei) {
  let m = convexCache.get(b); if (!m) convexCache.set(b, m = new Map());
  if (m.has(ei)) return m.get(ei);
  const fs = b.edgeFaces[ei];
  let res = 'smooth';
  if (fs.length === 2 && fs[0] !== fs[1]) {
    const e = b.edges.list[ei];
    const { point: M, tangent: t } = K.edgeMidTangent(e);
    const F1 = b.faces.list[fs[0]], F2 = b.faces.list[fs[1]];
    const n1 = K.normalAt(F1, M)?.normal, n2 = K.normalAt(F2, M)?.normal;
    if (n1 && n2) {
      if (V.dot(n1, n2) > 1 - 1e-7) res = 'smooth';
      else {
        let d2 = V.unit(V.cross(n2, t));
        const eps = Math.max(1e-3, b.edgeInfo(ei).length * 1e-3);
        if (K.pointDistance(F2, V.add(M, V.mul(d2, eps))) > eps * 0.1) d2 = V.neg(d2);
        res = V.dot(d2, n1) < 0 ? 'convex' : 'concave';
      }
    }
  }
  m.set(ei, res);
  return res;
}

// ── datums, placements, patterns, profiles, solids ──────────────────────────
function datum(x, state, pc, ctx, type) {
  // axis.through two deferred points (core's resolveDatum builds a plane for any 'through')
  if (isDeferred(x) && x.type === 'axis' && x.op === 'through') {
    const [p, q] = x.args.map(a => arr3(datum(a, state, pc, ctx, 'point')));
    let ax = new Axis(new Point(...p), Dir.from(...V.unit(V.sub(q, p))));
    if (x.chain.length) ax = resolveDatum(new Deferred('axis', 'kvalue', [ax], x.chain), { scope: pc.values, resolve: (op, args) => args[0] });
    return ax;
  }
  if (x instanceof Selector || x instanceof FeatureRef) return kernelResolve(type === 'plane' ? 'on' : type === 'axis' ? 'of' : 'center', [x], type, state, pc, ctx);
  if (typeof x === 'string' && /^[+-]?[XYZ]$/i.test(x)) { const s = x.startsWith('-') ? -1 : 1; const a = x.replace(/[+-]/, '').toUpperCase(); return type === 'axis' ? { origin: [0, 0, 0], dir: V.mul({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[a], s) } : x; }
  if (Array.isArray(x)) return type === 'axis' ? { origin: [0, 0, 0], dir: x } : x;
  return resolveDatum(x, { scope: pc.values, resolve: (op, args, t) => kernelResolve(op, args, t, state, pc, ctx) });
}
// The kernel hook for topology-dependent datums: plane.on, frame.on, axis.of, point.center, plane.mid, point.on
function kernelResolve(op, args, type, state, pc, ctx) {
  const sel = args[0];
  // transforms and frames given with expressions (j.js wraps j.tx / j.frame)
  if (type === 'tx') {
    const L = v => mm(pc.len(v)), pnt = v => isDeferred(v) ? datum(v, state, pc, ctx, 'point') : v;
    if (op === 'move') return Array.isArray(args[0]) || isDeferred(args[0]) ? coreTx.move(isDeferred(args[0]) ? pnt(args[0]) : args[0].map(L)) : coreTx.move(...args.map(L));
    if (op === 'rotate') return coreTx.rotate(isDeferred(args[0]) || typeof args[0] === 'object' && !(args[0] instanceof Axis) ? datum(args[0], state, pc, ctx, 'axis') : args[0], rad(pc.ang(args[1])));
    if (op === 'scale') return coreTx.scale(...args.map(v => typeof v === 'number' || isQuantity(v) ? v : pc.number(v)));
  }
  if (type === 'frame' && op === 'make') {
    const o = args[0] ?? {};
    const fix = v => v == null ? v : isDeferred(v) ? datum(v, state, pc, ctx, v.type === 'dir' ? 'point' : 'point') : Array.isArray(v) ? v.map(c => pc.len(c)) : v;
    const origin = o.origin == null ? undefined : isDeferred(o.origin) ? datum(o.origin, state, pc, ctx, 'point') : Array.isArray(o.origin) ? new Point(...o.origin.map(c => pc.len(c))) : o.origin;
    return coreFrame({ ...o, ...(origin ? { origin } : {}), x: fix(o.x) ?? undefined, z: fix(o.z) ?? undefined });
  }
  if (op === 'mid') { const a = frameOf(datum(args[0], state, pc, ctx, 'plane')), b = frameOf(datum(args[1], state, pc, ctx, 'plane')); return Frame.make(new Point(...V.lerp(a.origin, b.origin, 0.5)), Dir.from(...a.x), Dir.from(...a.z)); }
  const r = ctx.resolve(sel, state, `${ctx.featId}.${op}`);
  const c = r.items[0];
  if (!c) throw ctx.fail('ref.lost', `${type}.${op}(${sel}) resolved to nothing`);
  if (r.kind === 'faces') {
    const fi = c.body.faceInfo(c.index);
    if (type === 'axis') { if (!fi.axis) throw ctx.fail('ref.lost', `axis.of: ${c.name} is ${fi.kind}, not a revolved face`); return new Axis(new Point(...fi.axis.origin), Dir.from(...fi.axis.dir)); }
    if (type === 'point') return new Point(...fi.center);
    if (fi.kind !== 'plane') throw ctx.fail('ref.lost', `${type}.on: ${c.name} is ${fi.kind}, not planar`);
    const f = type === 'frame' ? orthoFrame(fi.center, null, fi.normal) : frameOnFace(fi.center, fi.normal);
    return Frame.make(new Point(...f.origin), Dir.from(...f.x), Dir.from(...f.z));
  }
  if (r.kind === 'edges') {
    const ei = c.body.edgeInfo(c.index);
    if (type === 'axis') return ei.axis ? new Axis(new Point(...ei.axis.origin), Dir.from(...ei.axis.dir)) : new Axis(new Point(...ei.a), Dir.from(...ei.dir));
    if (type === 'point') return new Point(...(ei.axis?.origin ?? ei.mid));
    // frame on an edge: origin at the midpoint, z along the edge
    const z = ei.axis?.dir ?? ei.dir ?? [0, 0, 1];
    return Frame.make(new Point(...(ei.axis?.origin ?? ei.mid)), Dir.from(...(Math.abs(z[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])), Dir.from(...z));
  }
  if (r.kind === 'vertices') return new Point(...c.body.vertexPoint(c.index));
  const vp = K.volumeProps(c.body.shape);
  return type === 'point' ? new Point(...vp.center) : Frame.make(new Point(...vp.center), Dir.from(1, 0, 0), Dir.from(0, 0, 1));
}
function placementOf(x, state, pc, ctx) {
  if (x == null) return K.IDENTITY.slice();
  if (x.m instanceof Float64Array || x.constructor?.name === 'Transform') return matOf(x);
  if (Array.isArray(x) && x.length === 16) return x.slice();
  if (Array.isArray(x) || x instanceof Point) { const p = arr3(x); return K.matTranslate(...p); }
  const d = datum(x, state, pc, ctx, 'frame');
  if (d instanceof Point) return K.matTranslate(...arr3(d));
  if (d?.m instanceof Float64Array || d?.constructor?.name === 'Transform') return matOf(d);
  const f = frameOf(d);
  return f ? K.frameMatrix(f) : K.IDENTITY.slice();
}
function instancesOf(pat, state, pc, ctx, targets) {
  if (!pat?.instances && !pat?.expand) throw ctx.fail('feature.failed', 'pattern: expected a j.pattern.* value');
  const anchor = (() => {
    const t = Array.isArray(targets) ? targets[0] : targets;
    const id = t instanceof FeatureRef ? t.id : typeof t === 'string' ? t : null;
    const tool = id && state.tools[id];
    if (tool) { const bb = K.bboxUnion(tool.bodies.map(b => b.bbox())); return bb ? V.lerp(bb[0], bb[1], 0.5) : [0, 0, 0]; }
    return [0, 0, 0];
  })();
  const e = pat.expand({ scope: pc.values, base: new Point(...anchor) });
  for (const d of e.diagnostics ?? []) ctx.diag(d);
  for (const d of e.decisions ?? []) ctx.decide(d);
  if (e.deferred) throw ctx.fail('pattern.deferred', 'path patterns need a path the kernel cannot resolve yet');
  return e.instances.map((inst, i) => ({ index: inst.index ?? i, m: matOf(inst.tx), params: inst.params }));
}
function insideAny(p, state) {
  for (const b of state.bodies) {
    const bb = b.bbox(); if (!bb || p.some((v, i) => v < bb[0][i] - 1e-6 || v > bb[1][i] + 1e-6)) continue;
    const oc = getOC(); const r = K.scope();
    try {
      const v = r(new oc.BRepBuilderAPI_MakeVertex(r(K.pnt(p)))).Vertex(); r(v);
      const d = r(new oc.BRepExtrema_DistShapeShape(v, b.shape, oc.Extrema_ExtFlag?.Extrema_ExtFlag_MIN, oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad, r(new oc.Message_ProgressRange())));
      if (d.IsDone() && (d.InnerSolution() || d.Value() < 1e-9)) return true;
    } finally { r.free(); }
  }
  return false;
}
function solidsOf(x, state, pc, ctx, id) {
  if (x instanceof Shape) {
    return x.build(pc.len).map(n => ({ ...n, names: n.names.map(nm => `${id}/${nm}`) }));
  }
  if (x?.isPart) {
    const sub = ctx.compileSub(x, {});
    for (const d of sub.diagnostics) ctx.diag({ ...d, at: `${id}/${d.at ?? ''}` });
    return sub.state.bodies.map(b => ({ shape: K.transformShape(b.shape, K.IDENTITY), names: b.names.map(n => `${id}:${n}`), aliases: b.aliases }));
  }
  if (x instanceof Selector || x instanceof FeatureRef) {
    const r = ctx.resolve(x instanceof FeatureRef ? x.body() : x.kind === 'bodies' ? x : x.body(), state);
    return [...new Set(r.items.map(c => c.body))].map(b => ({ shape: K.transformShape(b.shape, K.IDENTITY), names: b.names.slice(), aliases: b.aliases }));
  }
  if (x?.__body) { const b = x.__body; return [{ shape: K.transformShape(b.shape, K.IDENTITY), names: b.names.slice(), aliases: b.aliases }]; }
  if (Array.isArray(x)) return x.flatMap(y => solidsOf(y, state, pc, ctx, id));
  throw ctx.fail('feature.failed', `expected a shape, part or body selector, got ${String(x)}`);
}

// ── sketches and profiles ────────────────────────────────────────────────────
const WARM = new Map();   // `${part}/${sketch}` → { key, pkey, solved } (most recent last)
// Solve a core sketch with the kernel resolving `on` when it depends on topology.
export function solveSketch(sk, state, pc, ctx) {
  const on = sk.on;
  let plane = null;
  if (on && !(on instanceof Frame)) {
    const d = datum(on, state, pc, ctx, 'plane');
    plane = d instanceof Frame ? d : (() => { const f = frameOf(d); return Frame.make(new Point(...f.origin), Dir.from(...f.x), Dir.from(...f.z)); })();
  }
  const id = sk.id;
  const prev = pc.out.sketches.get(id);
  const pkey = plane ? plane.key() : 'own';
  if (prev && prev.sketch === sk && prev.pkey === pkey) { if (ctx?._sketches && !ctx._sketches.includes(prev)) ctx._sketches.push(prev); return prev; }
  const env = { scope: pc.values, ctx: pc.opts.printerCtx ?? {}, plane: plane ?? undefined };
  // warm start (core's env.warm): a constrained sketch whose text is unchanged starts from its last solution in
  // this worker, so moving a parameter keeps the solution branch; an edited sketch (new starting positions) or a
  // fresh worker solves cold
  const wkey = `${pc.part.name}/${id}`, skey = sk.mode?.mode === 'constrained' ? sk.key() : null;
  const warm = skey ? WARM.get(wkey) : null;
  if (warm && warm.key === skey && warm.pkey === pkey) env.warm = warm.solved;
  if (sk.ops?.some(o => o.op === 'text' || o.op === 'project' || o.op === 'intersect')) env.external = (eid, op, args) => {
    if (op === 'text') return textPolylines(textValue(args.str, pc.values), { size: args.size != null ? pc.len(args.size) : 5, font: args.font ?? 'sans', align: args.align ?? 'left', valign: args.valign ?? 'baseline', at: (args.at ?? [0, 0]).map(v => pc.len(v)) });
    return [];   // project/intersect: not supported yet (core reports the empty entity)
  };
  const solved = sk.solve(env);
  if (skey && solved.status !== 'over') { WARM.delete(wkey); WARM.set(wkey, { key: skey, pkey, solved }); if (WARM.size > 200) WARM.delete(WARM.keys().next().value); }
  const frame = frameOf(plane ?? (on instanceof Frame ? on : null) ?? { origin: [0, 0, 0], x: [1, 0, 0], z: [0, 0, 1] });
  const data = solved.toSketchData ? solved.toSketchData() : null;
  if (data) data.plane = { origin: frame.origin, x: frame.x, y: frame.y, normal: frame.z };
  const rec = { id, data, solved, frame, sketch: sk, pkey };
  if (!prev) {
    // explicit sketches fix every coordinate, so the helper constraints of fillets/chamfers are implied by
    // construction: their 'redundant' notes say nothing (one info line instead)
    const explicit = sk.mode?.mode === 'explicit';
    const all = solved.diagnostics ?? [];   // a getter: read once
    const quiet = all.filter(d => explicit && d.kind === 'sketch.redundant');
    if (quiet.length) pc.out.diagnostics.push({ level: 'info', kind: 'sketch.implied', at: id, line: ctx?.line, message: `${quiet.length} helper constraint${quiet.length === 1 ? ' is' : 's are'} implied by the fixed coordinates of this explicit sketch` });
    for (const d of all) if (!quiet.includes(d)) pc.out.diagnostics.push({ at: id, line: ctx?.line, ...d });
    for (const d of solved.decisions ?? []) pc.out.decisions.push({ at: id, ...d });
  }
  pc.out.sketches.set(id, rec);
  ctx?._sketches?.push(rec);
  return rec;
}
// the sketch builders a feature's arguments hold (directly, or through profiles() / wire()), by id
function sketchesIn(x, out = new Map(), seen = new Set(), depth = 0) {
  if (!x || typeof x !== 'object' || seen.has(x) || depth > 6) return out;
  seen.add(x);
  if (x.kind === 'sketch' && Array.isArray(x.ops) && typeof x.key === 'function') { if (!out.has(x.id)) out.set(x.id, x); return out; }
  if (x.sketch && typeof x.sketch === 'object') sketchesIn(x.sketch, out, seen, depth + 1);
  const proto = Object.getPrototypeOf(x);
  if (Array.isArray(x)) for (const v of x) sketchesIn(v, out, seen, depth + 1);
  else if (proto === Object.prototype || proto === null) for (const v of Object.values(x)) sketchesIn(v, out, seen, depth + 1);
  return out;
}
// a cached sketch record read through a fresh builder with the same key: same solution, the new script's lines;
// a drag on the last program (rec.dragged, worker.js) does not carry over
function relined(rec0, sk) {
  const { dragged, ...rec } = rec0;
  if (!sk || sk === rec.sketch || !rec.solved?.withSketch || sk.key() !== rec.sketch?.key?.()) return rec;
  const solved = rec.solved.withSketch(sk);
  const data = solved.toSketchData();
  if (rec.data?.plane) data.plane = rec.data.plane;
  return { ...rec, sketch: sk, solved, data };
}
function profileOf(p, state, pc, ctx) {
  if (!p) throw ctx.fail('feature.failed', 'missing profile');
  // a planar face selector: extrude the face itself
  if (p instanceof Selector || p instanceof FeatureRef) {
    const r = ctx.resolve(p instanceof FeatureRef ? p.endFace() : p, state);
    const c = r.items[0];
    if (!c || c.body.faceInfo(c.index).kind !== 'plane') throw ctx.fail('ref.lost', `profile: ${p} is not a planar face`);
    const fi = c.body.faceInfo(c.index);
    const face = c.body.faces.list[c.index];
    const faceEdges = [];
    K.explore(face, 'EDGE', e => { const ei = c.body.edges.indexOf(e); faceEdges.push({ edge: e, src: ei >= 0 ? c.body.edgeNames[ei] : 'edge' }); });
    return { frame: orthoFrame(fi.center, null, fi.normal), faceShape: face, faceEdges, regions: [{ loops: [] }] };
  }
  if (p.kind === 'profiles' || p.kind === 'wire' || p.resolve && p.sketch) {
    const sk = p.sketch;
    const { solved, frame } = solveSketch(sk, state, pc, ctx);
    let profiles;
    if (p.kind === 'wire') return { frame, wire: solved.wire ? solved.wire(p.ids) : null };
    profiles = p.pick != null && solved.profile ? [].concat(solved.profile(p.pick)) : solved.profiles();
    if (!profiles?.length) throw ctx.fail('feature.failed', `sketch '${sk.id}' has no closed profile`, 'close the outline or check sketch diagnostics');
    return profileFromSegments(frame, profiles, sk.id);
  }
  if (p.isSketch || p.solve) return profileOf(p.profiles(), state, pc, ctx);
  if (p.isRegion || p.kind === 'region') return (p.plane && (isDeferred(p.plane) || p.plane instanceof Selector || p.plane instanceof FeatureRef) ? p.on(datum(p.plane, state, pc, ctx, 'plane')) : p).toProfile(pc.len);
  if (p.regions && p.frame) return p;
  throw ctx.fail('feature.failed', `expected a profile (sketch.profiles(), j.region.*, or a planar face), got ${String(p)}`);
}
function sketchPoints(sk, state, pc, ctx) {
  const { solved, frame } = solveSketch(sk, state, pc, ctx);
  const data = solved.toSketchData ? solved.toSketchData() : { entities: solved.entities ?? [] };
  // points, including pattern and mirror copies (p.p1, p.m); helper points (centres, corners) are not holes
  let pts = data.entities.filter(e => e.kind === 'point' && !e.construction && !/\.(center|centre|corner|mid|start|end|a|b|c)$/.test(String(e.id)));
  if (!pts.length) pts = data.entities.filter(e => e.kind === 'circle' && !e.construction).map(e => ({ id: e.id, p: e.c }));
  return pts.map(e => ({ id: e.id, p: K.frameToWorld(frame, e.p[0], e.p[1]), normal: frame.z }));
}
function pathOf(x, state, pc, ctx) {
  if (x?.segments3d) return x.segments3d(pc.len);
  if (x?.isPath3d) return x.toSegments(pc.len);
  if (x?.kind === 'sketch3d') return x.items.flatMap(it => it.kind === 'helix' && it.helix
    ? [{ kind: 'helix', origin: it.helix.axis?.origin ?? [0, 0, 0], axis: it.helix.axis?.dir ?? [0, 0, 1], pitch: it.helix.pitch, turns: it.helix.turns, r: it.helix.r }]
    : it.kind === 'spline' ? [{ kind: 'spline', pts: it.pts.map(arr3) }]
    : it.pts.slice(1).map((p, i) => ({ kind: 'line', a: arr3(it.pts[i]), b: arr3(p) })));
  if (x?.kind === 'wire' && x.sketch) {
    const { solved, frame } = solveSketch(x.sketch, state, pc, ctx);
    const w = solved.wire(x.ids);
    const segs = (w.segments ?? w).flat ? (w.segments ?? w).flat() : w.segments;
    return segs.map(s => s.kind === 'line' ? { kind: 'line', a: K.frameToWorld(frame, ...s.a), b: K.frameToWorld(frame, ...s.b) }
      : s.kind === 'arc' ? { kind: 'arc3', a: K.frameToWorld(frame, ...(s.a ?? [s.c[0] + s.r * Math.cos(s.a0), s.c[1] + s.r * Math.sin(s.a0)])), m: K.frameToWorld(frame, s.c[0] + s.r * Math.cos((s.a0 + s.a1) / 2), s.c[1] + s.r * Math.sin((s.a0 + s.a1) / 2)), b: K.frameToWorld(frame, ...(s.b ?? [s.c[0] + s.r * Math.cos(s.a1), s.c[1] + s.r * Math.sin(s.a1)])) }
      : { kind: 'spline', pts: s.pts.map(p => K.frameToWorld(frame, ...p)) });
  }
  if (Array.isArray(x)) return [{ kind: 'spline', pts: x.map(arr3) }];
  throw ctx.fail('feature.failed', `sweep: expected a path (j.sketch3d(…) or sketch.wire([…])), got ${String(x)}`);
}

// Resolve a datum (port frame, plane.on(…), …) against a compiled part's final state.
export function resolveInPart(res, d, type = 'frame') {
  const pc = res.pc;
  const ctx = makeFeatureCtx(pc, { id: 'port', type: 'port', args: [], opts: {} }, new Set(res.features.map(x => x.id)));
  return datum(d, res.state, pc, ctx, type);
}

// the first engine frames of an internal error, as 'at fn (file:line)', for engine.bug diagnostics
function engineFrames(e) {
  const frames = String(e?.stack ?? '').split('\n').filter(l => /^\s+at /.test(l)).slice(0, 3)
    .map(l => l.trim().replace(/^at /, '').replace(/\(?(?:file|https?):\/\/[^)]*\/(src\/engine\/[^):]+:\d+)(?::\d+)?\)?/, '($1)'));
  return frames.length ? `at ${frames.join(' ← ')}` : 'no stack';
}
