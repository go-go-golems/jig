// The Program (README §5): compile any model value into ProgramData (plain, cloneable) plus a live object
// that answers why/param/ir/feature/faces/sketch/metric/find against the kept kernel state.
import * as K from './kernel.js';
import { Part, part as mkPart } from './part.js';
import { Shape } from './csg.js';
import { compilePart as compilePart0, featureCache, cachedStates, selEnv, resolveInPart } from './compile.js';
const compilePart = Object.assign((p, o) => compilePart0(p, o), { resolveInPart });
import { sweepBodies } from './body.js';
import { bodyData } from './mesh.js';
import { irText } from './ir.js';
import { Selector, FeatureRef, resolve as resolveSel, sel as selNS } from './select.js';
const selFaces = q => selNS.faces(q), selEdges = q => selNS.edges(q);
import { explainParam } from './params.js';
import { material as materialOf, orientationScore, meshTris } from './inspect.js';
import { hashStr } from './hash.js';

const V = K.V;
const livePrograms = new Set();   // Programs whose bodies must stay alive (the current one and those made by the running script)

// opts: { override, config, fit, seed, printer, buildDir, mesh (default true), data }
export function compile(model, opts = {}) {
  const t0 = performance.now();
  let value = model;
  if (value instanceof Shape) value = mkPart('shape').add(value, { id: 'body' });
  if (value?.isDesign) { const prog = compile(value.defaultModel(), opts); prog.data.kind = 'design'; prog.data.design = { params: Object.fromEntries(Object.entries(value.params).map(([k, p]) => [k, { kind: p.kind, default: String(p.def) }])) }; return prog; }
  if (value?.isPrintJob) return value.compile(opts, { compilePart, finalize });
  if (value?.isAssembly) return value.compile(opts, { compilePart, finalize });
  if (value instanceof Part) {
    const res = compilePart(value, opts);
    const prog = finalize({ kind: 'part', name: value.name, parts: [{ name: value.name, part: value, res }], t0, opts });
    for (const rs of value.meta.rules ?? []) prog.data.diagnostics.push(...rs.check(prog, {}));
    prog.data.summary.errors = prog.data.diagnostics.filter(d => d.level === 'error').length;
    prog.data.summary.warnings = prog.data.diagnostics.filter(d => d.level === 'warning').length;
    prog.data.ok = !prog.data.summary.errors;
    return prog;
  }
  if (value?.isSketch || (value?.solve && value?.profiles)) return compileSketchOnly(value, opts, t0);
  if (value?.isRegion) { const prog = compile(mkPart('region').extrude(value, 1, { id: 'region' }), opts); prog.data.kind = 'region'; return prog; }
  throw new Error(`the script must return a part, sketch, assembly, print job, design or shape (got ${value === undefined ? 'undefined' : typeof value === 'object' ? value.constructor?.name : typeof value})`);
}

function compileSketchOnly(sk, opts, t0) {
  const p = mkPart(sk.id ?? 'sketch');
  const res = compilePart(p, opts);
  const { solveSketch } = compileHelpers;
  try { solveSketch(sk, res.state, res.pc, { resolve: () => ({ items: [] }), fail: (k, m) => Object.assign(new Error(m), { kind: k }) }); }
  catch (e) { res.diagnostics.push({ level: 'error', kind: e.kind ?? 'sketch.failed', at: sk.id, message: e.message }); }
  return finalize({ kind: 'sketch', name: sk.id, parts: [{ name: sk.id, part: p, res }], t0, opts });
}
import { solveSketch } from './compile.js';
const compileHelpers = { solveSketch };

// Assemble ProgramData + Program from compiled parts. extra: { job, assembly, occurrences, print, bodiesExtra }
export function finalize({ kind, name, parts, t0, opts, sharedParams = null, job = null, assembly = null, occurrences = null, print = null, extraMetrics = {}, extraDiagnostics = [], extraDecisions = [], extraTrace = [], placements = null }) {
  const diagnostics = [...parts.flatMap(p => p.res.diagnostics.map(d => ({ ...d, part: p.name }))), ...extraDiagnostics];
  const decisions = [...parts.flatMap(p => p.res.decisions), ...extraDecisions];
  const trace = [...parts.flatMap(p => p.res.trace.map(t => parts.length > 1 ? { ...t, pass: `${p.name}:${t.pass}` } : t)), ...extraTrace];
  // fit info diagnostic
  const fitUsed = parts.some(p => p.res.fitUsed.size);
  const fitCtx = parts[0]?.res.pc.fit;
  if (fitUsed && fitCtx && !fitCtx.calibrated) diagnostics.push({ level: 'info', kind: 'fit.uncalibrated', at: [...new Set(parts.flatMap(p => [...p.res.fitUsers]))].join(', ') || 'fit', message: 'using default fit classes and hole compensation; print j.fit.coupon() once to calibrate', fix: "j.fit.coupon({ kind: 'pin-hole' }) then j.fit.calibrate(rows)" });
  // meshes
  const tm = performance.now();
  const bodiesData = [];
  const meshOn = opts.mesh !== false;
  for (const p of parts) for (const b of p.res.state.bodies) {
    const place = placements?.[`${p.name}/${b.id}`] ?? placements?.[p.name] ?? K.IDENTITY;
    try { bodiesData.push(bodyData(b, { part: p.name, transform: place, color: p.part?.meta?.color ?? null, mesh: meshOn })); }
    catch (e) { diagnostics.push({ level: 'error', kind: 'mesh.failed', at: `${p.name}/${b.id}`, message: e.message }); }
  }
  if (meshOn) trace.push({ pass: 'mesh', level: 'L6', ms: performance.now() - tm, cached: false, note: `${bodiesData.length} bod${bodiesData.length === 1 ? 'y' : 'ies'}, ${bodiesData.reduce((s, b) => s + (b.mesh?.indices.length ?? 0) / 3, 0)} triangles` });
  // sketches
  const sketches = parts.flatMap(p => [...p.res.sketches.values()].map(s => s.data).filter(Boolean));
  // metrics
  const mat = parts[0]?.part?.meta?.material ? materialOf(parts[0].part.meta.material) : materialOf(job?.material ?? 'PLA');
  const volume = bodiesData.reduce((s, b) => s + b.volume, 0);
  const area = bodiesData.reduce((s, b) => s + b.faces.reduce((t, f) => t + f.area, 0), 0);
  const bb = K.bboxUnion(bodiesData.map(b => worldBox(b.bbox, b.transform)));
  const nFeatures = parts.reduce((s, p) => s + p.res.features.length, 0);
  const hits = parts.reduce((s, p) => s + p.res.cacheHits, 0);
  const fragile = diagnostics.filter(d => d.kind === 'ref.fragile' || d.kind === 'ref.lost').length;
  const rebuildMs = performance.now() - t0;
  const m = {
    volume: { value: volume, unit: 'mm³', fidelity: 'exact' },
    area: { value: area, unit: 'mm²', fidelity: 'exact' },
    mass: { value: volume * mat.density / 1000, unit: 'g', fidelity: 'exact', note: `solid, ${mat.name} ${mat.density} g/cm³` },
    cost: { value: volume * mat.density / 1e6 * mat.cost, unit: 'usd', fidelity: 'exact', note: `${mat.cost} usd/kg` },
    bbox: { value: bb ? bb[1].map((v, i) => v - bb[0][i]) : [0, 0, 0], unit: 'mm', fidelity: 'exact' },
    height: { value: bb ? bb[1][2] - bb[0][2] : 0, unit: 'mm', fidelity: 'exact' },
    faces: { value: bodiesData.reduce((s, b) => s + b.faces.length, 0), unit: 'count', fidelity: 'exact' },
    bodies: { value: bodiesData.length, unit: 'count', fidelity: 'exact' },
    features: { value: nFeatures, unit: 'count', fidelity: 'exact' },
    sketchDOF: { value: sketches.reduce((s, k) => s + (k.dof ?? 0), 0), unit: 'count', fidelity: 'exact' },
    fragileRefs: { value: fragile, unit: 'count', fidelity: 'exact' },
    rebuildMs: { value: rebuildMs, unit: 'ms', fidelity: 'measured' },
    cacheHitRate: { value: nFeatures ? hits / nFeatures : 0, unit: 'ratio', fidelity: 'measured' },
    ...extraMetrics,
  };
  const snaps = parts.flatMap(p => p.res.features.map(f => f.info?.ratio).filter(x => x != null));
  if (snaps.length) m.snapStrain = { value: Math.max(...snaps), unit: 'ratio', fidelity: 'approx', note: 'peak / allowable strain (beam theory)' };
  if (!print && meshOn) {
    let oa = 0, bc = 0;
    for (const b of bodiesData) if (b.mesh) { const sc = orientationScore(meshTris(b.mesh, b.transform, b.faces), [0, 0, 1]); oa += sc.overhangArea; bc += sc.bedContact; }
    m.overhangArea = { value: oa, unit: 'mm²', fidelity: 'exact', note: '+Z up as modelled; 45° from vertical' };
    m.bedContact = { value: bc, unit: 'mm²', fidelity: 'exact', note: '+Z up as modelled' };
  }
  const flat = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.value]));
  const summary = { features: nFeatures, bodies: bodiesData.length, sketches: sketches.length, dof: flat.sketchDOF, faces: flat.faces, volume: +volume.toFixed(3), mass: +flat.mass.toFixed(3),
    bbox: flat.bbox.map(v => +v.toFixed(3)), material: mat.name, errors: diagnostics.filter(d => d.level === 'error').length, warnings: diagnostics.filter(d => d.level === 'warning').length, rebuildMs: +rebuildMs.toFixed(1), cacheHitRate: +flat.cacheHitRate.toFixed(3) };
  if (print) Object.assign(summary, { printer: print.printer.name, plates: print.plates.length, printTime: +flat.printTime.toFixed(1), filament: +flat.filament.toFixed(3), filamentMass: +flat.filamentMass.toFixed(2), supportVolume: +flat.supportVolume.toFixed(1), orientation: Object.fromEntries(Object.entries(print.orientation).map(([k, o]) => [k, o.dir])) });
  // params
  // multi-part names are '<component or job item id>.<param>'; partName is the part's own name (links accept both)
  const shared = new Set((sharedParams ?? []).map(r => r.name));
  const params = [...(sharedParams ?? []).map(r => ({ ...r, local: r.name, partName: null })),
    ...parts.flatMap(p => (p.res.paramRows ?? []).filter(r => !(shared.has(r.name) && r.src === 'job')).map(r => ({ ...r, part: p.name, partName: p.part?.name ?? p.name, local: r.name, name: parts.length > 1 ? `${p.name}.${r.name}` : r.name })))];
  const fitRows = fitCtx ? Object.entries(fitCtx.classes).map(([k, v]) => ({ name: k, value: v, src: fitCtx.calibrated ? `fit '${fitCtx.name}'` : 'default fit classes (uncalibrated)' })) : [];
  for (const g of fitRows) params.push({ name: `gap.${g.name}`, value: g.value, unit: 'mm', text: `${g.value} mm`, expr: null, src: g.src, deps: [], exposed: null });
  // graph
  const graph = buildGraph(parts, assembly);
  const hash = 'h:' + hashStr(parts.map(p => p.res.key).join('|') + (print ? JSON.stringify(print.orientation) + JSON.stringify(print.plates.map(p => p.items.map(i => i.body))) : '') + kind);
  const P = { kind, name, parts, job, assembly, occurrences, print, decisions, sketches, bodiesData, hash, fitName: fitCtx?.name ?? 'default', fitRows, printerCtx: opts.printerCtx ?? job?.printerCtx ?? null, metricsFlat: flat };
  const ir = irText(P);
  const data = { ok: !diagnostics.some(d => d.level === 'error' && d.kind !== 'print.bedFit' && d.fatal), hash, kind, name, summary, metrics: m, diagnostics, trace, decisions, params, graph, sketches, bodies: bodiesData.map(stripBody), print, ir };
  data.ok = !diagnostics.some(d => d.level === 'error');
  const program = new Program(P, data);
  return program;
}
// Coordinates: face centres/normals/axes, edge polylines, mesh positions and bbox are BODY-LOCAL (the part's own
// frame). bodies[].transform (column-major 4×4) places a body in the world: identity for parts, the component
// placement in assemblies. Print jobs keep identity here and give each plate item its own transform in print.plates.
const stripBody = b => { const { volume, topology, deflection, ...rest } = b; return { ...rest, volume, topology }; };
function worldBox(bb, m) {
  if (!bb) return null; if (!m || K.isIdentity(m)) return bb;
  const pts = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => K.matApply(m, [bb[i][0], bb[j][1], bb[k][2]]))));
  return [[0, 1, 2].map(a => Math.min(...pts.map(p => p[a]))), [0, 1, 2].map(a => Math.max(...pts.map(p => p[a])))];
}
function buildGraph(parts, assembly) {
  const nodes = [], edges = [];
  for (const p of parts) {
    const pre = parts.length > 1 ? `${p.name}:` : '';
    // sketch nodes are 'sketch:<id>' so a sketch and a feature may share a name
    for (const s of p.res.sketches.keys()) nodes.push({ id: `${pre}sketch:${s}`, kind: 'sketch', label: `${s} · sketch`, level: 'L3', sketch: s });
    let prev = null;
    for (const f of p.res.features) {
      nodes.push({ id: pre + f.id, kind: f.type, label: `${f.id} · ${f.type}`, level: 'L1', cached: f.cached, failed: !!f.failed, line: f.line });
      if (prev) edges.push({ from: pre + prev, to: pre + f.id, kind: 'timeline' });
      prev = f.id;
    }
    // profile edges: the sketches each feature solved
    for (const f of p.res.features) for (const sid of f.sketches ?? []) edges.push({ from: `${pre}sketch:${sid}`, to: pre + f.id, kind: 'profile' });
    for (const r of p.res.refs) { const at = String(r.at).split('.')[0]; if (r.id !== at) edges.push({ from: pre + r.id, to: pre + at, kind: 'ref' }); }
  }
  if (assembly) for (const c of assembly.components) nodes.push({ id: `comp:${c.id}`, kind: 'component', label: `${c.id} · component`, level: 'L5' });
  const seen = new Set();
  return { nodes, edges: edges.filter(e => { const k = e.from + '>' + e.to + e.kind; if (seen.has(k)) return false; seen.add(k); return true; }) };
}

export class Program {
  constructor(P, data) { this.P = P; this.data = data; }
  get diagnostics() { return this.data.diagnostics; }
  get trace() { return this.data.trace; }
  get decisions() { return this.data.decisions; }
  summary() { return this.data.summary; }
  metrics() { return Object.fromEntries(Object.entries(this.data.metrics).map(([k, v]) => [k, v.value])); }
  metric(name) { return this.data.metrics[name] ?? null; }
  param(name) {
    for (const p of this.P.parts) {
      const nm = name.startsWith(p.name + '.') ? name.slice(p.name.length + 1) : name;
      const info = p.res.params?.info?.[nm];
      if (info) return { name, value: info.value?.toJSON ? info.value.toJSON() : info.value, text: info.text, expr: info.expr, src: info.src, deps: info.deps, shadowed: info.shadowed, why: safe(() => explainParam(nm, p.res.params)) };
    }
    const g = this.data.params.find(r => r.name === name);
    return g ?? null;
  }
  ir(level, opts = {}) {
    const t = this.data.ir[level] ?? '';
    if (!opts.node) return t;
    // L3 keeps a block per sketch: the node's whole block, else the lines that name it
    const id = String(opts.node).replace(/^.*sketch:/, '');
    const block = level === 'L3' ? t.split('\n\n').find(b => b.startsWith(`sketch ${id} (L3)`)) : null;
    return block ?? t.split('\n').filter(l => l.includes(opts.node)).join('\n');
  }
  sketch(id) { return this.data.sketches.find(s => s.id === id) ?? null; }
  feature(id) {
    for (const p of this.P.parts) {
      const ft = p.res.features.find(f => f.id === id || `${p.name}.${f.id}` === id);
      if (!ft) continue;
      const rec = p.part?.items?.find(i => i.id === ft.id);
      return { id: ft.id, part: p.name, type: ft.type, line: ft.line, failed: !!ft.failed, cached: ft.cached, ...(ft.info ?? {}),
        cache: { key: ft.key, includes: { type: ft.type, params: 'resolved values of the names its arguments use', inputs: 'content hash of the bodies before it', refs: 'persistent names of resolved references', strategy: rec && typeof rec.args.find?.(a => typeof a === 'function') === 'function' ? 'lambda (source hash)' : 'default', fit: ft.type === 'hole' ? this.P.fitName : null, tol: '1e-7 mm', tables: ft.type === 'hole' ? ['iso-metric@1'] : [] }, excludes: ['color', 'material', 'display name'] } };
    }
    return null;
  }
  _env(partName) {
    const p = this.P.parts.find(x => x.name === partName) ?? this.P.parts[0];
    const comps = Object.fromEntries(this.P.parts.map(x => [x.name, { bodies: x.res.state.bodies }]));
    return { p, env: { ...selEnv(p.res.pc, { bodies: this.P.parts.length > 1 && !partName ? this.P.parts.flatMap(x => x.res.state.bodies) : p.res.state.bodies }, new Set(p.res.features.map(f => f.id))), components: comps } };
  }
  // Resolve a selector (value, 'j.…' text, query text like '>Z' or '%cylinder and +Z', or a persistent name)
  // to face records { name, body, index, kind, area, center, normal?, axis? } (body-local coordinates).
  faces(sel, opts = {}) {
    let s = sel instanceof FeatureRef ? sel.faces() : sel;
    if (typeof s === 'string') {
      const hits = [];
      for (const p of this.P.parts) for (const b of p.res.state.bodies) b.names.forEach((n, i) => { if (n === s || n.replace(/#[a-z0-9]+$/, '') === s) hits.push(this._record({ body: b, index: i, name: n }, 'faces')); });
      if (hits.length) return opts.names ? hits.map(r => r.name) : hits;
      s = selFaces(s);
    }
    if (!(s instanceof Selector)) throw new Error(`faces: expected a selector, query text or face name, got ${String(sel)}`);
    const { env } = this._env();
    const r = resolveSel(s, env);
    const recs = r.items.map(c => this._record(c, r.kind));
    return opts.names ? recs.map(x => x.name) : recs;
  }
  _record(c, kind) {
    const bodyId = this.data.bodies.find(b => b.name === c.body.id && this.P.parts.find(p => p.name === b.part)?.res.state.bodies.includes(c.body))?.id ?? c.body.id;
    if (kind === 'faces') { const fi = c.body.faceInfo(c.index); return { name: c.name, body: bodyId, index: c.index, kind: fi.kind, area: fi.area, center: fi.center, ...(fi.normal ? { normal: fi.normal } : {}), ...(fi.axis ? { axis: fi.axis } : {}) }; }
    if (kind === 'edges') { const ei = c.body.edgeInfo(c.index); return { name: c.name, body: bodyId, index: c.index, kind: ei.kind, length: ei.length, center: ei.center, ...(ei.axis ? { axis: ei.axis } : {}), ...(ei.dir ? { dir: ei.dir } : {}) }; }
    return { name: c.name, body: bodyId, index: c.index };
  }
  _records(kind) {
    const out = [];
    for (const p of this.P.parts) for (const b of p.res.state.bodies) {
      const names = kind === 'faces' ? b.names : b.edgeNames;
      names.forEach((name, i) => out.push({ name, body: `${p.name}/${b.id}`, index: i }));
    }
    return out;
  }
  edges(sel) {
    let s = typeof sel === 'string' ? (sel.startsWith('j.') ? null : selEdges(sel)) : sel;
    const { env } = this._env();
    const r = resolveSel(s, env);
    return r.items.map(c => this._record(c, r.kind));
  }
  why(target) {
    if (typeof target === 'string' && target.startsWith('param:')) return this.param(target.slice(6));
    if (typeof target === 'string' && target.startsWith('feature:')) return this.feature(target.slice(8));
    if (typeof target === 'string' && !target.startsWith('j.')) {
      // a persistent face or edge name, a feature id, a param name, or query text
      for (const p of this.P.parts) for (const b of p.res.state.bodies) {
        const fi = b.names.indexOf(target);
        if (fi >= 0) return { target, kind: 'face', body: `${p.name}/${b.id}`, resolved: [target], via: 'genealogy', chain: genealogy(target), aliases: b.aliases?.[fi] ?? [], feature: this.feature(target.split('/')[0]) ? target.split('/')[0] : null };
        const ei = b.edgeNames.indexOf(target);
        if (ei >= 0) return { target, kind: 'edge', body: `${p.name}/${b.id}`, resolved: [target], via: 'faces', chain: b.edgeFaces[ei].flatMap(f => genealogy(b.names[f])), faces: b.edgeFaces[ei].map(f => b.names[f]) };
      }
      const ft = this.feature(target); if (ft) return { target, ...ft, featureKind: ft.kind, kind: 'feature', decisions: this.data.decisions.filter(d => d.at === target || String(d.at).startsWith(target + '.')) };
      const pa = this.param(target); if (pa) return { target, ...pa, kind: 'param' };
      try { return this.why(selFaces(target)); } catch { return { target, resolved: [], error: `no face, edge, feature or param named '${target}'` }; }
    }
    const s = target instanceof FeatureRef ? target.faces() : target;
    if (!(s instanceof Selector)) return { error: `why: expected a selector, 'param:name', 'feature:id' or a persistent name` };
    const { env } = this._env();
    const r = resolveSel(s, env);
    const out = { selector: String(s), kind: r.kind, resolved: r.items.map(c => c.name), candidates: r.items.length, chain: r.chain, genealogy: Object.fromEntries(r.items.slice(0, 12).map(c => [c.name, genealogy(c.name)])), fragile: r.fragile, notes: r.notes };
    if (s.root.type === 'feat') {
      const ft = this.feature(s.root.id);
      if (ft?.type === 'hole') { out.value = `Ø ${ft.modelled} mm`; out.holeChain = ft.holes?.[0]?.chain; out.chain = [...out.chain, ...(ft.holes?.[0]?.chain ?? [])]; }
    }
    const split = r.items.filter(c => /#[a-z]$/.test(c.name));
    if (split.length) out.note = `${split.length} faces descend from one source face (split by a later feature)`;
    return out;
  }
  genealogy(name) { return genealogy(name); }
  find(kind) {
    const nodes = this.data.graph.nodes.filter(n => typeof kind === 'function' ? kind(n) : n.kind === kind);
    return nodes;
  }
  body(id) {
    const b = this.data.bodies.find(x => !id || x.id === id || x.name === id || x.part === id);
    return b ? { id: b.id, faces: b.faces.length, edges: b.edges.length, vertices: b.topology.V, volume: b.volume, bbox: b.bbox, topology: b.topology } : null;
  }
  mass() { return this.data.metrics.mass; }
  get plates() { return this.data.print?.plates ?? null; }
  get layers() { const L = this.data.print?.layers; if (!L) return null; return Object.assign((L.areas ?? []).map((a, k) => ({ k, z: [k * L.height, (k + 1) * L.height], area: a })), { count: L.count, sample: L.sample, cuspMax: L.cuspMax, cuspMean: L.cuspMean }); }
  get supports() { return this.data.metrics.supportVolume ?? null; }
  get printTime() { return this.data.metrics.printTime ?? null; }
  get filament() { return this.data.metrics.filament ?? null; }
  // live kernel bodies (for exports)
  kernelBodies() { return this.P.parts.flatMap(p => p.res.state.bodies.map(b => ({ part: p.name, body: b, transform: this.P.print?.transforms?.[`${p.name}/${b.id}`] ?? this.data.bodies.find(x => x.id === `${p.name}/${b.id}`)?.transform ?? K.IDENTITY }))); }
  keep() { livePrograms.add(this); return this; }
}
const safe = f => { try { return f(); } catch { return null; } };

// Genealogy chain of a persistent name, read from its structure: feature/role[source]#split
export function genealogy(name) {
  const chain = [];
  let n = name;
  const split = /#([a-z0-9]+)$/.exec(n); if (split) { chain.push(`${n}: piece ${split[1]} of a face split by a later feature`); n = n.slice(0, -split[0].length); }
  const m = /^([^/]+)\/([a-zA-Z]+)(?:\[(.*)\])?$/.exec(n);
  if (!m) return [...chain, `${n}: no genealogy (generated name)`];
  const [, featId, role, src] = m;
  const what = { side: `swept from sketch entity ${src}`, end: 'the far cap of the extrusion', start: 'the near cap (the profile plane)', face: `born from edge ${src}`, inner: `offset of ${src}`, bore: `bore of hole ${src}`, floor: `floor of hole ${src}`, cbore: `counterbore of hole ${src}` }[role] ?? role;
  chain.push(`${n} ← ${featId}: ${what}`);
  if (src && (role === 'face' || role === 'inner')) for (const part of src.split(' ∩ ')) chain.push(...genealogy(part.trim()).map(x => '  ' + x));
  return chain;
}

// Forget every kept Program except `keepOnly` (called by the worker before each compile).
export function releasePrograms(keepOnly = null) { livePrograms.clear(); if (keepOnly) livePrograms.add(keepOnly); }
// Free kernel bodies not reachable from the cache or the live programs.
export function gc() {
  const keep = [];
  for (const st of cachedStates()) { keep.push(...st.bodies); for (const t of Object.values(st.tools)) keep.push(...t.bodies); }
  for (const prog of livePrograms) for (const p of prog.P.parts) keep.push(...p.res.state.bodies);
  return sweepBodies(keep);
}
