// Print jobs (README §4.13): printers, orientation (26 candidates, lexicographic, teardrop fixpoint),
// supports estimate, bed fit, skyline plates, slicing with cusp metrics.
import * as K from './kernel.js';
import { meshBody } from './mesh.js';
import { meshTris, catTris, freeTris, orientationScore, sectionLoops, loopsProps, material, asPrinted } from './inspect.js';
import * as RS from './rs/index.js';
import { fmtDir } from './holes.js';
import { Part } from './part.js';
import { callerLine } from './part.js';
import { fitContext } from './fit.js';
import { paramLayers, resolveAll, paramRows } from './params.js';
import { mm } from './units.js';
import { Body } from './body.js';
import { splitByPlane, booleanOp, namedFromExplicit, transformNamed } from './ops.js';
import { solveAssembly } from './assembly.js';
import * as S from './shapes.js';
import { frameOf } from './adapt.js';

const V = K.V;
const faceGeo = b => b.names.map((_, i) => b.faceInfo(i));   // exact normals for overhang checks
export const PRINTERS = {
  'generic-fdm': { bed: [250, 210, 220], nozzle: 0.4, kind: 'fdm', lw: 0.45, layer: 0.2, maxOverhang: 45, bridge: 10 },
  mk4: { bed: [250, 210, 220], nozzle: 0.4, kind: 'fdm', lw: 0.45, layer: 0.2, maxOverhang: 45, bridge: 10 },
  mini: { bed: [180, 180, 180], nozzle: 0.4, kind: 'fdm', lw: 0.45, layer: 0.2, maxOverhang: 45, bridge: 10 },
  x1c: { bed: [256, 256, 256], nozzle: 0.4, kind: 'fdm', lw: 0.42, layer: 0.2, maxOverhang: 45, bridge: 10 },
  'generic-msla': { bed: [130, 80, 150], nozzle: 0.05, kind: 'msla', lw: 0.05, layer: 0.05, maxOverhang: 30, bridge: 3 },
};
const mmv = x => x == null ? null : typeof x === 'number' ? x : x.value ?? Number(x);
export function printer(p = 'generic-fdm') {
  if (p?.isPrinter) return p;
  if (typeof p === 'string') { const s = PRINTERS[p]; if (!s) throw new Error(`unknown printer '${p}' (known: ${Object.keys(PRINTERS).join(', ')})`); return Object.freeze({ isPrinter: true, name: p, ...s }); }
  return Object.freeze({ isPrinter: true, name: p.name ?? 'custom', ...PRINTERS['generic-fdm'], ...p, bed: (p.bed ?? [250, 210, 220]).map(mmv), nozzle: mmv(p.nozzle ?? 0.4) });
}

// 26 candidate build directions: cube faces, edges, corners
export const CANDIDATES = (() => {
  const out = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) out.push(V.unit([x, y, z]));
  const rank = d => (d.filter(v => v).length) * 10 + (d[2] > 0.5 ? 0 : d[2] < -0.5 ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
})();
export const dirName = d => { const n = d.map(v => Math.abs(v) < 1e-9 ? 0 : Math.sign(v)); const k = n.filter(Boolean).length; return k === 1 ? fmtDir(d) : n.map((v, i) => v ? (v > 0 ? '+' : '-') + 'XYZ'[i] : '').join(''); };
export function parseDirName(s) {
  if (Array.isArray(s)) return V.unit(s);
  if (s?.toArray) return V.unit(s.toArray());
  if (s?.x !== undefined) return V.unit([s.x, s.y, s.z]);
  const m = String(s).match(/[+-][XYZ]/gi); if (!m) return null;
  const v = [0, 0, 0]; for (const t of m) v['XYZ'.indexOf(t[1].toUpperCase())] = t[0] === '-' ? -1 : 1;
  return V.unit(v);
}
// rotation taking model direction u to +Z
export function upMatrix(u) {
  const z = [0, 0, 1]; const c = V.dot(u, z);
  if (c > 1 - 1e-12) return K.IDENTITY.slice();
  if (c < -1 + 1e-12) return K.matRotate([1, 0, 0], Math.PI);
  return K.matRotate(V.cross(u, z), Math.acos(c));
}

class PrintJob {
  constructor(name, o) { this.name = name; this.o = o; Object.freeze(this); }
  toString() { return `print job ${this.name}`; }
  get isPrintJob() { return true; }
  get kind() { return 'print'; }
  _w(patch) { return new PrintJob(this.name, { ...this.o, ...patch }); }
  add(id, item, opts = {}) { return this._w({ items: [...this.o.items, { id, item, qty: opts.qty ?? 1, orient: opts.orient, color: opts.color, at: callerLine() }] }); }
  fit(p) { return this._w({ fit: p }); }
  // shared params: every part that declares the same name takes the job's value (one slider for box and lid)
  params(obj) { return this._w({ params: { ...(this.o.params ?? {}), ...obj } }); }
  orient(slot) { return this._w({ orientSlot: slot }); }
  supports(s) { return this._w({ supports: s === false ? false : { ...(this.o.supports || {}), ...s } }); }
  split(id, opts) { return this._w({ splits: [...(this.o.splits ?? []), { id, opts }] }); }
  plates(o) { return this._w({ platesOpts: { ...(this.o.platesOpts ?? {}), ...o } }); }
  slice(o) { return this._w({ sliceOpts: { ...(this.o.sliceOpts ?? {}), ...o } }); }
  material(a, b) { return b === undefined ? this._w({ material: a }) : this._w({ materials: [...(this.o.materials ?? []), { sel: a, m: b }] }); }
  color(a, b) { return this._w({ colors: [...(this.o.colors ?? []), { sel: a, c: b }] }); }
  modifier(sel, o) { return this._w({ modifiers: [...(this.o.modifiers ?? []), { sel, o }] }); }
  seam(s) { return this._w({ seam: s }); } brim(b) { return this._w({ brim: b }); } ironing(s) { return this._w({ ironing: s }); }
  use(...fns) { let j = this; for (const f of fns.flat()) j = typeof f === 'function' ? f(j) ?? j : f?.isRules ? j._w({ rules: [...(j.o.rules ?? []), f] }) : j; return j; }
  with(fn) { return fn(this) ?? this; }
  set(k, v) { return this._w({ sets: { ...(this.o.sets ?? {}), [k]: v } }); }
  compile(opts, { compilePart, finalize }) { return compileJob(this, opts, { compilePart, finalize }); }
}
export function print(name, o = {}) {
  let job = new PrintJob(name, { items: [], printer: printer(o.printer ?? 'generic-fdm'), material: o.material ?? null, fit: o.fit ?? null, supports: undefined });
  for (const p of o.parts ?? []) job = job.add(p.name ?? `part${job.o.items.length + 1}`, p);
  return job;
}

// ── compile a job ───────────────────────────────────────────────────────────
function compileJob(job, opts, { compilePart, finalize }) {
  const t0 = performance.now();
  const o = job.o, pr = o.printer;
  const printerCtx = { lw: pr.lw, layer: mmv(o.sliceOpts?.layer) ?? pr.layer, nozzle: pr.nozzle };
  const mat = material(o.material ?? 'PLA');
  const diagnostics = [], decisions = [], trace = [];
  const parts = [], orientation = {}, overhang = [], items = [];
  const maxAngle = (mmv(o.supports?.angle) ?? (pr.maxOverhang * Math.PI / 180));
  // job-level params (overridable by their plain names), bound into the parts that declare them
  let jobParams = null;
  if (o.params && Object.keys(o.params).length) {
    const ov = Object.fromEntries(Object.entries(opts.override ?? {}).filter(([k]) => k in o.params).map(([k, v]) => [k, typeof v === 'number' ? mm(v) : v]));
    const pres = resolveAll(paramLayers({ params: [o.params], compileOverride: ov }), { ...printerCtx });
    jobParams = { values: pres.values, rows: paramRows(pres).map(r => ({ ...r, src: r.src === 'params' ? 'job' : r.src, part: null, shared: true })), diagnostics: pres.diagnostics ?? [] };
    diagnostics.push(...jobParams.diagnostics);
    opts = { ...opts, bind: { ...(opts.bind ?? {}), ...jobParams.values } };
  }
  // flatten assemblies into their parts (printed as posed)
  const flat = [];
  for (const it of o.items) {
    if (it.item?.isAssembly) {
      // an assembly prints as one item in its print pose (printInPlace pose, else its joint values): its
      // components' bodies move into the assembly frame and are oriented and packed together
      const sol = solveAssembly(it.item, { ...opts, forPrint: true, printerCtx, fit: o.fit ?? opts.fit, printer: pr, override: opts.override }, compilePart);
      for (const d of sol.diagnostics) diagnostics.push({ ...d, at: `${it.id}.${d.at ?? ''}` });
      for (const d of sol.decisions) decisions.push({ ...d, at: `${it.id}.${d.at ?? ''}` });
      trace.push(...sol.trace);
      const bodies = [];
      for (const [cid, x] of sol.comp) for (const b of x.res.state.bodies) {
        const t = transformNamed({ shape: b.shape, names: b.names, aliases: b.aliases }, x.T);
        bodies.push(new Body(`${cid}.${b.id}`, t.shape, t.names, { aliases: t.aliases, createdBy: cid }));
      }
      const first = sol.parts[0]?.res;
      if (!first) { diagnostics.push({ level: 'error', kind: 'print.item', at: it.id, message: `print: assembly '${it.id}' has no parts` }); continue; }
      const res = { ...first, name: it.id, state: { ...first.state, bodies }, diagnostics: sol.parts.flatMap(p => p.res.diagnostics.map(d => ({ ...d, at: `${p.name}.${d.at ?? ''}` }))), decisions: [], trace: sol.parts.flatMap(p => p.res.trace.map(t => ({ ...t, pass: `${p.name}:${t.pass}` }))),
        features: sol.parts.flatMap(p => p.res.features), sketches: new Map(), paramRows: sol.parts.flatMap(p => (p.res.paramRows ?? []).map(r => ({ ...r, name: `${p.name}.${r.name}` }))),
        cacheHits: sol.parts.reduce((a, p) => a + p.res.cacheHits, 0), featureCount: sol.parts.reduce((a, p) => a + p.res.featureCount, 0) };
      flat.push({ ...it, group: res, item: new Part(it.id) });
      continue;
    }
    else if (it.item instanceof Part) flat.push(it);
    else if (it.item?.isShape) flat.push({ ...it, item: new Part(it.id).add(it.item, { id: 'body' }) });
    else diagnostics.push({ level: 'error', kind: 'print.item', at: it.id, message: `print: '${it.id}' is not a part or assembly` });
  }
  for (const it of flat) {
    const part = it.item;
    const slot = it.orient ?? o.orientSlot ?? 'auto';
    let dir = slotFixed(slot) ?? [0, 0, 1];
    let res, choice, prevChoice = null, iter = 0, history = [];
    for (iter = 1; iter <= 4; iter++) {
      const tc = performance.now();
      if (it.group) res = it.group;   // an assembly: modelled once, oriented as a whole (no teardrop iteration)
      else {
        res = compilePart(part, { ...opts, buildDir: dir, printerCtx, fit: o.fit ?? opts.fit, printer: pr, override: opts.override, itemId: it.id });
        trace.push({ pass: 'teardrops', level: 'L4', iter, ms: performance.now() - tc, cached: res.cacheHits === res.featureCount, note: `${part.name}: build direction ${dirName(dir)}` });
      }
      const to = performance.now();
      const tris = catTris(res.state.bodies.map(b => meshTris(meshBody(b), it.place ?? K.IDENTITY, faceGeo(b))));
      const supportsOff = o.supports === false;
      const factor = supportsOff ? 0 : (o.supports?.kind === 'grid' ? 1 : 0.35);
      const ranked = slotFixed(slot) ? [] : rankCandidates(tris, maxAngle, factor);   // a fixed direction needs no ranking
      const ctxO = { default: () => ranked[0], candidates: () => ranked, previous: prevChoice };
      choice = chooseOrientation(slot, ranked, tris, maxAngle, ctxO, part, factor);
      trace.push({ pass: 'orient', level: 'L5', iter, ms: performance.now() - to, cached: false, note: `${part.name}: ${dirName(choice.dir)} (support ${choice.supportVolume.toFixed(0)} mm³, bed contact ${choice.bedContact.toFixed(0)} mm², height ${choice.height.toFixed(1)} mm)` });
      history.push(dirName(choice.dir));
      if (it.group || V.dist(choice.dir, dir) < 1e-9) break;
      prevChoice = choice; dir = choice.dir;
    }
    if (iter > 4) diagnostics.push({ level: 'error', kind: 'fixpoint.notConverged', at: 'orient', message: `orient ⇄ teardrops did not converge in 4 iterations: ${history.join(' → ')}`, fix: 'make the orient lambda independent of the previous decision, or fix a direction' });
    else trace.push({ pass: 'fixpoint', level: 'L5', ms: 0, cached: false, note: `converged in ${Math.min(iter, 4)}` });
    const supportsOff = o.supports === false;
    const sv = choice.supportVolume;
    orientation[it.id] = { dir: dirName(choice.dir), supportVolume: sv, bedContact: choice.bedContact, height: choice.height, overhangArea: choice.overhangArea, reason: choice.reason };
    decisions.push({ at: it.id, kind: 'orient', chose: dirName(choice.dir), alternatives: choice.alternatives, reason: choice.reason });
    if (choice.overhangArea > 1e-6) {
      for (const b of res.state.bodies) {
        const sc = orientationScore(meshTris(meshBody(b), it.place ?? K.IDENTITY, faceGeo(b)), choice.dir, { maxAngle });
        if (sc.overhangArea > 1e-6) overhang.push({ body: `${it.id}/${b.id}`, faces: sc.overhangFaces, area: sc.overhangArea, names: sc.overhangFaces.map(i => b.names[i]) });
      }
      diagnostics.push({ level: supportsOff ? 'warning' : 'info', kind: 'print.overhang', at: it.id, message: `${choice.overhangArea.toFixed(1)} mm² overhangs more than ${(maxAngle * 180 / Math.PI).toFixed(0)}° from vertical with ${dirName(choice.dir)} up${supportsOff ? ' and supports are off' : `; supports ≈ ${sv.toFixed(0)} mm³ (${o.supports?.kind ?? 'tree'})`}`, fix: 'chamfer overhanging edges at 45°, or choose another orientation' });
    }
    const splitReq = (o.splits ?? []).find(x => x.id === it.id);
    if (splitReq) {
      const pieces = splitItem(it, res, splitReq.opts ?? {}, { pr, maxAngle, o, diagnostics, decisions, trace, fit: res.pc.fit, resolveInPart: compilePart.resolveInPart });
      if (pieces) {
        delete orientation[it.id];
        for (let k = overhang.length - 1; k >= 0; k--) if (overhang[k].body.startsWith(it.id + '/')) overhang.splice(k, 1);
        for (let k = decisions.length - 1; k >= 0; k--) if (decisions[k].at === it.id && decisions[k].kind === 'orient') decisions.splice(k, 1);
        for (const pc of pieces) {
          parts.push(pc.entry);
          const tris = pc.body ? meshTris(meshBody(pc.body), K.IDENTITY, faceGeo(pc.body)) : [];
          const ranked = rankCandidates(tris, maxAngle, o.supports === false ? 0 : 0.35);
          const ch = ranked[0];
          orientation[pc.id] = { dir: dirName(ch.dir), supportVolume: ch.supportVolume, bedContact: ch.bedContact, height: ch.height, overhangArea: ch.overhangArea, reason: describe(ch, ranked[1]) };
          decisions.push({ at: pc.id, kind: 'orient', chose: dirName(ch.dir), alternatives: ranked.slice(1, 4).map(r => dirName(r.dir)), reason: describe(ch, ranked[1]) });
          const R = upMatrix(ch.dir);
          const obb = orientedBox(pc.body, R);
          const M = K.matMul(K.matTranslate(-obb[0][0], -obb[0][1], -obb[0][2]), R);
          const size = obb[1].map((v, i) => v - obb[0][i]);
          for (let q = 0; q < it.qty; q++) items.push({ id: pc.id, q, size, M, res: pc.entry.res, footprint: size[0] * size[1] });
          if (!fitsBed(size, pr.bed).ok) diagnostics.push({ level: 'error', kind: 'print.bedFit', at: pc.id, message: `piece ${pc.id} (${size.map(v => v.toFixed(1)).join(' × ')} mm) still does not fit the bed`, fix: 'split into more pieces' });
        }
        continue;
      }
    }
    parts.push({ name: it.id === part.name ? part.name : it.id, part, res });
    // world transform of this item on the bed (before packing): rotate dir → +Z, put on z = 0
    const R = K.matMul(upMatrix(choice.dir), it.place ?? K.IDENTITY);
    const obb = K.bboxUnion(res.state.bodies.map(b => orientedBox(b, R)));
    const lift = K.matTranslate(-obb[0][0], -obb[0][1], -obb[0][2]);
    const M = K.matMul(lift, R);
    const size = obb[1].map((v, i) => v - obb[0][i]);
    for (let q = 0; q < it.qty; q++) items.push({ id: it.id, q, size, M, res, footprint: size[0] * size[1] });
    // bed fit
    const fits = fitsBed(size, pr.bed);
    if (!fits.ok) diagnostics.push({ level: 'error', kind: 'print.bedFit', at: it.id, message: `${size.map(v => v.toFixed(1)).join(' × ')} mm does not fit ${pr.bed.join(' × ')} mm${fits.rotated ? '' : ' in this orientation'}`, fix: `job.split('${it.id}', { fit: 'bed' }) or a larger printer` });
  }
  // plates
  const tp = performance.now();
  const spacing = mmv(o.platesOpts?.spacing) ?? 5;
  const plates = packPlates(items, pr.bed, spacing);
  const lowerBound = Math.ceil(items.reduce((s, x) => s + x.footprint, 0) / (pr.bed[0] * pr.bed[1]));
  trace.push({ pass: 'plates', level: 'L5', ms: performance.now() - tp, cached: false, note: `${plates.length} plate(s), lower bound ${lowerBound} (skyline, ${spacing} mm spacing)` });
  decisions.push({ at: job.name, kind: 'plates', chose: `${plates.length} plate${plates.length === 1 ? '' : 's'}`, alternatives: [], reason: `skyline packing; area lower bound ⌈Σ footprint / bed area⌉ = ${lowerBound}` });
  // slicing and cusp
  const ts = performance.now();
  const layerH = mmv(o.sliceOpts?.layer) ?? pr.layer;
  // section loops (layer samples, Σ area·t) only when asked: job.slice(…) or compile option layers: true;
  // the layer count and cusp heights are always computed (they are cheap)
  const wantLayers = !!o.sliceOpts || !!opts.layers;
  const layers = sliceItems(items.filter(x => x.q === 0), layerH, !!o.sliceOpts, wantLayers);
  trace.push({ pass: 'slice', level: 'L6', ms: performance.now() - ts, cached: false, note: wantLayers ? `${layers.count} layers × ${layerH} mm; ${layers.sample.length} sampled${o.sliceOpts ? ', all layers measured' : ''}` : `${layers.count} layers × ${layerH} mm; sections on request (job.slice(…) or options.layers)` });
  // print metrics
  const vol = items.reduce((s, x) => s + x.res.state.bodies.reduce((t, b) => t + b.volume(), 0), 0);
  const area = items.reduce((s, x) => s + x.res.state.bodies.reduce((t, b) => t + b.names.reduce((u, _, i) => u + b.faceInfo(i).area, 0), 0), 0);
  const fp = items.reduce((s, x) => s + x.footprint, 0);
  const hMax = Math.max(0, ...items.map(x => x.size[2]));
  const ap = asPrinted(vol, area, hMax || 1, fp * 0.8, { walls: o.sliceOpts?.walls ?? 3, infill: o.sliceOpts?.infill?.density ?? 0.15, lw: pr.lw, layer: layerH });
  const supportVolume = Object.values(orientation).reduce((s, x) => s + x.supportVolume, 0);
  const filamentG = (ap.volume + supportVolume * 0.3) * mat.density / 1000;
  const filamentM = (ap.volume + supportVolume * 0.3) / (Math.PI * 0.875 * 0.875) / 1000;
  const printTime = ((ap.volume + supportVolume * 0.3) / (pr.lw * layerH * 60) + layers.count * 4) / 60;
  const extraMetrics = {
    supportVolume: { value: supportVolume, unit: 'mm³', fidelity: 'approx', note: o.supports?.kind === 'grid' ? 'grid columns' : 'tree proxy (0.35 × columns)' },
    bedContact: { value: Object.values(orientation).reduce((s, x) => s + x.bedContact, 0), unit: 'mm²', fidelity: 'exact' },
    overhangArea: { value: Object.values(orientation).reduce((s, x) => s + x.overhangArea, 0), unit: 'mm²', fidelity: 'exact' },
    plates: { value: plates.length, unit: 'count', fidelity: 'exact', lowerBound },
    layers: { value: layers.count, unit: 'count', fidelity: 'exact' },
    cuspMax: { value: layers.cuspMax, unit: 'mm', fidelity: 'approx' }, cuspMean: { value: layers.cuspMean, unit: 'mm', fidelity: 'approx' },
    filament: { value: filamentM, unit: 'm', fidelity: 'approx', note: '1.75 mm filament; walls + infill model' },
    filamentMass: { value: filamentG, unit: 'g', fidelity: 'approx', note: `${mat.name} ${mat.density} g/cm³; walls + infill model` },
    cost: { value: filamentG / 1000 * mat.cost, unit: 'usd', fidelity: 'approx', note: `${mat.cost} usd/kg` },
    printTime: { value: printTime, unit: 'min', fidelity: 'approx', note: 'motion model, uncalibrated' },
    height: { value: hMax, unit: 'mm', fidelity: 'exact' },
  };
  const printData = {
    printer: { name: pr.name, bed: pr.bed, nozzle: pr.nozzle },
    plates: plates.map((pl, i) => ({ index: i + 1, items: pl.items.map(x => ({ body: x.bodyId, part: x.id, transform: x.T })), utilisation: pl.util })),
    orientation, overhang, layers: { height: layerH, count: layers.count, sample: layers.sample, areas: layers.areas, cuspMax: layers.cuspMax, cuspMean: layers.cuspMean, volume: layers.volume ?? null },
    lowerBound,
  };
  printData.transforms = Object.fromEntries(plates.flatMap(pl => pl.items.filter(x => x.q === 0).map(x => [x.bodyId, x.T])));
  // rules attached to the job or parts
  const ruleSets = [...(o.rules ?? []), ...flat.flatMap(it => it.item.meta?.rules ?? [])];
  const prog = finalize({ kind: 'print', name: job.name, parts, t0, opts: { ...opts, printerCtx }, sharedParams: jobParams?.rows ?? null, job: { name: job.name, printer: pr, material: mat, printerCtx, orientSlotText: typeof o.orientSlot === 'function' ? 'lambda' : o.orientSlot ?? 'auto', supportsText: o.supports === false ? 'off' : o.supports?.kind ?? 'tree', sliceText: `${layerH} mm`, packText: o.platesOpts?.pack ?? 'skyline' },
    print: printData, extraMetrics, extraDiagnostics: diagnostics, extraDecisions: decisions, extraTrace: trace });
  for (const rs of ruleSets) prog.data.diagnostics.push(...rs.check(prog, { printer: pr, job }));
  return prog;
}
function slotFixed(slot) { if (typeof slot === 'string' && slot !== 'auto' && slot !== 'min-height' && slot !== 'max-contact') return parseDirName(slot); if (slot?.toArray || Array.isArray(slot)) return parseDirName(slot); return null; }
function orientedBox(b, R) {
  const bb = b.bbox(); const pts = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => K.matApply(R, [bb[i][0], bb[j][1], bb[k][2]]))));
  return [[0, 1, 2].map(a => Math.min(...pts.map(p => p[a]))), [0, 1, 2].map(a => Math.max(...pts.map(p => p[a])))];
}
function fitsBed(size, bed) {
  const [x, y, z] = size;
  if (z > bed[2] + 1e-6) return { ok: false };
  if ((x <= bed[0] && y <= bed[1]) || (y <= bed[0] && x <= bed[1])) return { ok: true };
  return { ok: false, rotated: true };
}
export function rankCandidates(tris, maxAngle, supportFactor = 1) {
  const scored = CANDIDATES.map(d => orientationScore(tris, d, { maxAngle, supportFactor }));
  const cmp = (a, b) => {
    const sa = a.bedContact >= 1, sb = b.bedContact >= 1;   // a part must stand on a face, not an edge or a corner
    if (sa !== sb) return sa ? -1 : 1;
    const ts = Math.max(1, 0.02 * Math.max(a.supportVolume, b.supportVolume));
    if (Math.abs(a.supportVolume - b.supportVolume) > ts) return a.supportVolume - b.supportVolume;
    const tb = Math.max(1, 0.02 * Math.max(a.bedContact, b.bedContact));
    if (Math.abs(a.bedContact - b.bedContact) > tb) return b.bedContact - a.bedContact;
    if (Math.abs(a.height - b.height) > 1e-3) return a.height - b.height;
    return 0;
  };
  return scored.map((s, i) => ({ ...s, i })).sort((a, b) => cmp(a, b) || a.i - b.i);
}
function describe(c, next) {
  return `lexicographic: support ${c.supportVolume.toFixed(0)} mm³ → bed contact ${c.bedContact.toFixed(0)} mm² → height ${c.height.toFixed(1)} mm${next ? ` (next: ${dirName(next.dir)}, support ${next.supportVolume.toFixed(0)} mm³)` : ''}`;
}
function chooseOrientation(slot, ranked, tris, maxAngle, ctxO, part, supportFactor = 1) {
  const alts = ranked.slice(0, 6).map(r => ({ dir: dirName(r.dir), supportVolume: +r.supportVolume.toFixed(1), bedContact: +r.bedContact.toFixed(1), height: +r.height.toFixed(2) }));
  const withMeta = (c, reason) => ({ ...c, reason, alternatives: alts, faceDown: () => false, faceUp: () => false });
  if (slot === 'auto' || slot == null) return withMeta(ranked[0], describe(ranked[0], ranked[1]));
  if (slot === 'min-height') { const c = [...ranked].sort((a, b) => a.height - b.height || a.supportVolume - b.supportVolume)[0]; return withMeta(c, `min-height: ${c.height.toFixed(1)} mm`); }
  if (slot === 'max-contact') { const c = [...ranked].sort((a, b) => b.bedContact - a.bedContact)[0]; return withMeta(c, `max bed contact: ${c.bedContact.toFixed(0)} mm²`); }
  if (typeof slot === 'function') {
    const out = slot(part, { ...ctxO, default: () => withMeta(ranked[0], describe(ranked[0], ranked[1])), candidates: () => ranked.map(r => withMeta(r, describe(r))) });
    if (out?.dir && Array.isArray(out.dir)) return withMeta(out, 'lambda');
    const d = parseDirName(out);
    if (!d) return withMeta(ranked[0], 'lambda returned nothing usable; default kept');
    const s = orientationScore(tris, d, { maxAngle, supportFactor });
    return withMeta(s, `lambda chose ${dirName(d)}`);
  }
  const d = parseDirName(slot);
  const s = orientationScore(tris, d, { maxAngle, supportFactor });
  return withMeta(s, `fixed ${dirName(d)} (support ${s.supportVolume.toFixed(0)} mm³)`);
}

// Skyline bottom-left packing with rotation; one skyline per plate.
export function packPlates(items, bed, spacing) {
  const order = items.map((x, i) => ({ x, i })).sort((a, b) => (b.x.size[0] * b.x.size[1]) - (a.x.size[0] * a.x.size[1]) || a.i - b.i);
  const plates = [];
  const W = bed[0], D = bed[1];
  const place = (sky, w, d) => {
    let best = null;
    for (let s = 0; s < sky.length; s++) {
      const x = sky[s].x; if (x + w > W + 1e-9) break;
      let y = 0, e = x + w;
      for (let t = s; t < sky.length && sky[t].x < e - 1e-9; t++) y = Math.max(y, sky[t].y);
      if (y + d <= D + 1e-9 && (!best || y < best.y || (y === best.y && x < best.x))) best = { x, y };
    }
    return best;
  };
  const addSky = (sky, x, w, top) => {
    const out = [];
    for (const seg of sky) { const segEnd = seg.end; if (segEnd <= x || seg.x >= x + w) out.push(seg); else { if (seg.x < x) out.push({ x: seg.x, end: x, y: seg.y }); if (segEnd > x + w) out.push({ x: x + w, end: segEnd, y: seg.y }); } }
    out.push({ x, end: x + w, y: top }); out.sort((a, b) => a.x - b.x);
    return out;
  };
  for (const { x: it } of order) {
    const sizes = [[it.size[0] + spacing, it.size[1] + spacing, false], [it.size[1] + spacing, it.size[0] + spacing, true]];
    let done = false;
    for (const pl of plates) {
      for (const [w, d, rot] of sizes) { const p = place(pl.sky, Math.min(w, W), Math.min(d, D)); if (p) { pl.sky = addSky(pl.sky, p.x, w, p.y + d); pl.items.push(...placed(it, p, rot)); done = true; break; } }
      if (done) break;
    }
    if (!done) {
      const pl = { sky: [{ x: 0, end: W, y: 0 }], items: [] };
      const [w, d, rot] = sizes[0][0] <= W + spacing ? sizes[0] : sizes[1];
      pl.sky = addSky(pl.sky, 0, w, d); pl.items.push(...placed(it, { x: 0, y: 0 }, rot)); plates.push(pl);
    }
  }
  for (const pl of plates) pl.util = pl.items.filter(i => i.first).reduce((s, i) => s + i.footprint, 0) / (W * D);
  return plates;
  function placed(it, p, rot) {
    const R = rot ? K.matMul(K.matTranslate(it.size[1], 0, 0), K.matRotate([0, 0, 1], Math.PI / 2)) : K.IDENTITY;
    const T = K.matMul(K.matTranslate(p.x + spacing / 2, p.y + spacing / 2, 0), K.matMul(R, it.M));
    return it.res.state.bodies.map((b, k) => ({ id: it.id, q: it.q, bodyId: `${it.res.name === it.id ? it.id : it.id}/${b.id}`, T, footprint: it.footprint, first: k === 0 }));
  }
}

// Layers: sections at (k + ½)·t; cusp from face normals (c = t·|cos θ|).
function sliceItems(items, t, full, sections = true) {
  let count = 0, cuspMax = 0, cuspNum = 0, cuspDen = 0, volume = 0;
  const sample = [], areas = [];
  for (const it of items) {
    const n = Math.max(1, Math.ceil(it.size[2] / t - 1e-9));
    count = Math.max(count, n);
    // freeform or many-faced bodies (threads, gears) slice their display mesh: B-rep sections of helical
    // B-splines take seconds per layer; simple bodies keep exact sections
    const analytic = ['plane', 'cylinder', 'cone', 'sphere', 'torus'];
    const complex = it.res.state.bodies.some(b => b.nFaces > 80 || b.names.some((_, i) => !analytic.includes(b.faceInfo(i).kind)));
    const tris = complex && sections ? catTris(it.res.state.bodies.map(b => meshTris(meshBody(b), it.M))) : null;
    const shapes = complex || !sections ? [] : it.res.state.bodies.map(b => K.transformShape(b.shape, it.M));
    try {
      const ks = !sections ? [] : full ? [...Array(Math.min(n, 400)).keys()] : [...new Set([0, 1, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1])].filter(k => k >= 0 && k < n);
      for (const k of ks) {
        const z = (k + 0.5) * t;
        const loops = complex ? meshSection(tris, z) : shapes.flatMap(s => sectionLoops(s, [0, 0, z], [0, 0, 1], { deflection: 0.05 }).loops);
        const pr = loopsProps(loops);
        if (full) { volume += pr.area * t; areas[k] = +pr.area.toFixed(4); }
        if (ks.length <= 12 || k % Math.ceil(ks.length / 12) === 0 || k === n - 1) sample.push({ k, z, area: pr.area, regions: pr.regions, holes: pr.holes, loops: loops.map(l => l.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)])) });
      }
      for (const b of it.res.state.bodies) for (let i = 0; i < b.nFaces; i++) {
        const fi = b.faceInfo(i);
        const nrm = fi.normal ? K.matApplyDir(it.M, fi.normal) : null;
        if (nrm && Math.abs(Math.abs(nrm[2]) - 1) < 1e-9) continue;   // horizontal planes snap to layers: cusp 0
        let c;
        if (nrm) c = t * Math.abs(nrm[2]);
        else { const m = K.normalMidUV(b.faces.list[i]); c = m ? t * Math.abs(K.matApplyDir(it.M, m.normal)[2]) : t / 2; if (fi.kind === 'sphere') c = t / 2; }
        cuspMax = Math.max(cuspMax, fi.kind === 'sphere' || fi.kind === 'bspline' || fi.kind === 'torus' ? t : c);
        cuspNum += c * fi.area; cuspDen += fi.area;
      }
    } finally { shapes.forEach(s => s.delete()); }
  }
  sample.sort((a, b) => a.z - b.z);
  return { count, sample, areas: full ? areas : null, cuspMax, cuspMean: cuspDen ? cuspNum / cuspDen : 0, volume: full ? volume : null };
}

// Section of a triangle mesh by the plane z: crossing segments chained into closed loops ([[x, y]…]).
// Shared edges give bit-identical points (endpoints ordered before interpolating).
export function meshSection(tris, z) {
  if (RS.isSoup(tris)) { const r = RS.meshSection(tris, z); if (r) return r; return meshSectionJS(tris.records(), z); }
  return meshSectionJS(tris, z);
}
export function meshSectionJS(tris, z) {
  z += 1e-7;   // keep the plane off vertices
  const segs = [];
  const cut = (p, q) => { const [a, b] = p[2] < q[2] || (p[2] === q[2] && (p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]))) ? [p, q] : [q, p]; const t = (z - a[2]) / (b[2] - a[2]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (const t of tris) {
    const P = [t.a, t.b, t.c], above = P.map(p => p[2] > z);
    if (above[0] === above[1] && above[1] === above[2]) continue;
    const pts = [];
    for (let i = 0; i < 3; i++) { const p = P[i], q = P[(i + 1) % 3]; if (above[i] !== above[(i + 1) % 3]) pts.push(cut(p, q)); }
    if (pts.length === 2) segs.push(pts);
  }
  const key = p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const at = new Map();
  segs.forEach((sg, i) => { for (const e of [0, 1]) { const k = key(sg[e]); (at.get(k) ?? at.set(k, []).get(k)).push([i, e]); } });
  const used = new Array(segs.length).fill(false), loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const loop = [segs[i][0], segs[i][1]];
    let end = segs[i][1];
    for (;;) {
      const next = (at.get(key(end)) ?? []).find(([j]) => !used[j]);
      if (!next) break;
      const [j, e] = next; used[j] = true;
      end = segs[j][1 - e];
      if (key(end) === key(loop[0])) break;
      loop.push(end);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Split-to-fit: cut planes (auto: perpendicular to the longest axis, as few pieces as fit the bed), dowel holes
// across each cut where the section has room (d/2 + 2 lw from any edge). Pieces become print items '<id>.a', '.b', …
function splitItem(it, res, so, env) {
  const { pr, decisions, diagnostics, trace } = env;
  const t0 = performance.now();
  const bodies = res.state.bodies;
  const bb = K.bboxUnion(bodies.map(b => b.bbox()));
  const ext = bb[1].map((v, i) => v - bb[0][i]);
  const auto = () => {
    const ax = ext.indexOf(Math.max(...ext));
    const limit = (ax === 2 ? pr.bed[2] : Math.max(pr.bed[0], pr.bed[1])) - 10;
    const n = Math.max(2, Math.ceil(ext[ax] / limit));
    return Array.from({ length: n - 1 }, (_, k) => { const o = bb[0].slice(); o[ax] = bb[0][ax] + ext[ax] * (k + 1) / n; const z = [0, 0, 0]; z[ax] = 1; return { origin: o, z }; });
  };
  let planes;
  try {
    const by = so.by ?? 'auto';
    const toPlane = d => { const f = frameOf(d) ?? frameOf(env.resolveInPart(res, d, 'plane')); return { origin: f.origin, z: f.z }; };
    if (by === 'auto') planes = auto();
    else if (typeof by === 'function') { const out = by(it.item, { default: () => auto(), bbox: bb }); planes = (Array.isArray(out) ? out : [out]).map(x => x.origin && Array.isArray(x.z) ? x : toPlane(x)); }
    else planes = (Array.isArray(by) ? by : [by]).map(toPlane);
  } catch (e) { diagnostics.push({ level: 'error', kind: 'print.split', at: it.id, message: `split: ${e.message}` }); return null; }
  // joint: dowels (default) or a sliding dovetail across each cut
  const dovetail = so.joint?.isLibFeature && /^dovetail/.test(so.joint.label ?? '') ? (so.joint.spec?.o ?? {}) : null;
  const dw = dovetail ? { d: 4, l: 12, fit: 'press' } : so.joint?.spec ?? { d: 4, l: 12, fit: 'press' };
  const d = mmv(dw.d) ?? 4, l = mmv(dw.l) ?? 12, cls = dw.fit ?? 'press';
  const holeD = d + 2 * (env.fit.classes[cls] ?? 0.05) + env.fit.holeComp(d);
  let pieces = bodies.map(b => ({ body: b, owned: false }));
  const dowelTools = [];
  let seam = 0, dowels = 0;
  const dovetails = [];
  for (const pl of planes) {
    const sec = bodies.flatMap(b => sectionLoops(b.shape, pl.origin, pl.z).loops);
    const sp = loopsProps(sec); seam += Math.abs(sp.area);
    const frame = sectionLoops(bodies[0].shape, pl.origin, pl.z).frame;
    if (dovetail) { const dt = dovetailTools(bodies, sec, frame, pl, dovetail, env); if (dt) dovetails.push(dt); }
    else for (const p2 of dowelPoints(sec, d / 2 + 2 * 0.45, 3)) {
      const c3 = V.add(V.add(pl.origin, V.mul(frame.x, p2[0])), V.mul(frame.y, p2[1]));
      const cyl = S.cylinder(holeD / 2, l + 1, { origin: V.sub(c3, V.mul(pl.z, (l + 1) / 2)), axis: pl.z });
      dowelTools.push({ shape: cyl.shape, names: K.subShapes(cyl.shape, 'FACE').list.map(() => `split/dowel`) });
      dowels++;
    }
    const next = [];
    for (const pc of pieces) {
      const pbb = pc.body.bbox(); const corners = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => [pbb[i][0], pbb[j][1], pbb[k][2]])));
      const sd = corners.map(c => V.dot(V.sub(c, pl.origin), pl.z));
      if (sd.every(x => x <= 1e-6) || sd.every(x => x >= -1e-6)) { next.push(pc); continue; }
      for (const half of splitByPlane(pc.body, pl.origin, pl.z, 'split')) next.push({ body: new Body(pc.body.id, half.shape, half.names, { aliases: half.aliases }), owned: true });
      if (pc.owned) pc.body.free();
    }
    pieces = next;
  }
  // dowel holes in every piece they touch
  if (dowelTools.length) pieces = pieces.map(pc => {
    const hit = dowelTools.filter(t => { const a = pc.body.bbox(), b = K.bboxOf(t.shape); return [0, 1, 2].every(i => a[0][i] <= b[1][i] && b[0][i] <= a[1][i]); });
    if (!hit.length) return pc;
    const out = booleanOp('cut', pc.body, hit, 'split');
    const nb = new Body(pc.body.id, out[0].shape, out[0].names, { aliases: out[0].aliases });
    if (pc.owned) pc.body.free();
    return { body: nb, owned: true };
  });
  dowelTools.forEach(t => t.shape.delete());
  // dovetails: the tail joins the piece below the cut (−normal side), the socket (tail + gap) is cut from the one above
  for (const dt of dovetails) {
    pieces = pieces.map(pc => {
      const bb = pc.body.bbox(); const corners = [0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => [bb[i][0], bb[j][1], bb[k][2]])));
      const sd = corners.map(c => V.dot(V.sub(c, dt.plane.origin), dt.plane.z));
      const below = Math.max(...sd) <= 1e-6 && Math.max(...sd) > -1e-3, above = Math.min(...sd) >= -1e-6 && Math.min(...sd) < 1e-3;
      if (!below && !above) return pc;
      const out = booleanOp(below ? 'fuse' : 'cut', pc.body, [below ? dt.tail : dt.socket], 'split');
      const nb = new Body(pc.body.id, out[0].shape, out[0].names, { aliases: out[0].aliases });
      if (pc.owned) pc.body.free();
      return { body: nb, owned: true };
    });
    dt.tail.shape.delete(); dt.socket.shape.delete();
  }
  const letter = k => String.fromCharCode(97 + k);
  decisions.push({ at: it.id, kind: 'split', chose: planes.map(p => `plane ${p.z.map((v, i) => v ? 'xyz'[i] : '').join('')} = ${+V.dot(p.origin, p.z).toFixed(2)} mm`).join(', '), alternatives: [], reason: `${pieces.length} pieces fit ${pr.bed.join(' × ')} mm; seam ${seam.toFixed(0)} mm²` });
  if (dovetail) {
    decisions.push({ at: it.id, kind: 'joint', chose: dovetails.length ? dovetails.map(t => t.text).join('; ') : 'none', alternatives: ['dowels'], reason: dovetails.length ? 'sliding dovetail across the section, along the build direction where the section allows' : 'the section is too small for a dovetail' });
    if (dovetails.length < planes.length) diagnostics.push({ level: 'warning', kind: 'print.split', at: it.id, message: `no room for a dovetail in ${planes.length - dovetails.length} cut section(s)`, fix: 'a smaller dovetail width/depth, or dowels' });
  } else {
    decisions.push({ at: it.id, kind: 'joint', chose: dowels ? `${dowels} × dowel Ø${d} × ${l} (${cls}, hole Ø${holeD.toFixed(2)})` : 'none', alternatives: [], reason: dowels ? 'section points with room for the dowel' : `no section point has ${(d / 2 + 0.9).toFixed(1)} mm of material around it` });
    if (!dowels) diagnostics.push({ level: 'warning', kind: 'print.split', at: it.id, message: `no room for Ø${d} mm dowels in the cut section`, fix: 'add bosses at the cut or use a thinner dowel' });
  }
  trace.push({ pass: 'split', level: 'L5', ms: performance.now() - t0, cached: false, note: `${it.id}: ${pieces.length} pieces, ${dowels} dowels, seam ${seam.toFixed(0)} mm²` });
  return pieces.map((pc, k) => {
    const id = `${it.id}.${letter(k)}`;
    const first = k === 0;
    const r2 = { ...res, name: id, state: { ...res.state, bodies: [pc.body] }, diagnostics: first ? res.diagnostics : [], decisions: first ? res.decisions : [], trace: first ? res.trace : [], features: first ? res.features : [], sketches: first ? res.sketches : new Map(), cacheHits: first ? res.cacheHits : 0 };
    return { id, body: pc.body, entry: { name: id, part: it.item, res: r2 }, seam, dowels };
  });
}
// A sliding dovetail across a cut: trapezoid (narrow at the cut, wide `depth` into the +normal side) swept along
// the slide direction (the in-plane axis nearest the build direction, else the section's short axis) through
// the whole section, clipped to the material. → { plane, tail, socket, text } or null when the section is too small.
function dovetailTools(bodies, sec, frame, pl, o, env) {
  if (!sec.length) return null;
  const pts = sec.flat();
  const ext = a => { const v = pts.map(p => p[0] * V.dot(frame.x, a) + p[1] * V.dot(frame.y, a)); return [Math.min(...v), Math.max(...v)]; };
  const up = [0, 0, 1];
  let slide = V.sub(up, V.mul(pl.z, V.dot(up, pl.z)));
  if (V.len(slide) < 1e-6) { const ex = ext(frame.x), ey = ext(frame.y); slide = ex[1] - ex[0] < ey[1] - ey[0] ? frame.x : frame.y; }
  slide = V.unit(slide);
  const across = V.cross(pl.z, slide);
  const sa = ext(slide), sw = ext(across);
  const mmv2 = x => x == null ? null : typeof x === 'number' ? x : x.value;
  const ang = o.angle != null ? (typeof o.angle === 'number' ? o.angle * Math.PI / 180 : o.angle.value) : 15 * Math.PI / 180;
  const cls = o.fit ?? 'slide', gap = env.fit.classes[cls] ?? 0.2;
  const widthAvail = sw[1] - sw[0];
  const w = Math.min(mmv2(o.width) ?? 20, 0.5 * widthAvail), depth = Math.min(mmv2(o.depth) ?? 6, 0.5 * widthAvail);
  if (!(w >= 3 && depth >= 1.5) || sa[1] - sa[0] < 3) return null;
  // centred across the section, at the middle of its extent
  const c0 = (sw[0] + sw[1]) / 2;
  const prism = (hw, dpt, grow) => {
    const tw = hw + dpt * Math.tan(ang);
    const fr = { origin: V.add(pl.origin, V.mul(slide, sa[0] - 2)), x: across, y: pl.z, z: slide };
    const v0 = grow ? -0.01 : 0;
    const loop = [[c0 - hw, v0], [c0 + hw, v0], [c0 + tw, dpt], [c0 - tw, dpt]].map((a, i, A) => ({ kind: 'line', a, b: A[(i + 1) % 4], src: ['root', 'flank.r', 'tip', 'flank.l'][i] }));
    const [p] = S.prism({ frame: fr, regions: [{ loops: [loop] }] }, { id: 'split', dist: sa[1] - sa[0] + 4 });
    p.explicit.forEach(e => { e.name = e.name.replace(/^split\/side\[(.*)\]$/, `split/${grow ? 'socket' : 'tail'}.$1`).replace(/^split\/(start|end)$/, `split/${grow ? 'socket' : 'tail'}.end`); });
    return namedFromExplicit(p.shape, p.explicit, 'split');
  };
  const rawTail = prism(w / 2, depth, false);
  // clip the tail to the material on the +normal side (it must not stick out of the part)
  let tail = null;
  for (const b of bodies) { const res = booleanOp('common', b, [rawTail], 'split'); if (res.length) { tail = res[0]; break; } }
  rawTail.shape.delete();
  if (!tail) return null;
  const socket = prism(w / 2 + gap, depth + gap, true);
  return { plane: pl, tail, socket, text: `dovetail ${w.toFixed(1)} × ${depth.toFixed(1)} mm at ${(ang * 180 / Math.PI).toFixed(0)}°, sliding along ${fmtDir(slide)} (${cls} ${gap} mm per flank)` };
}

// Up to n points inside the section loops with at least `clear` mm of material around them, spread apart.
function dowelPoints(loops, clear, n) {
  if (!loops.length) return [];
  const xs = loops.flat().map(p => p[0]), ys = loops.flat().map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const step = Math.max(0.5, Math.min(x1 - x0, y1 - y0) / 40);
  const inside = p => { let c = false; for (const l of loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++) if (((l[i][1] > p[1]) !== (l[j][1] > p[1])) && (p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0])) c = !c; return c; };
  const segDist = (p, a, b) => { const d = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1] || 1))); return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]); };
  const cands = [];
  for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
    const p = [x, y]; if (!inside(p)) continue;
    let m = Infinity; for (const l of loops) for (let i = 0; i < l.length; i++) m = Math.min(m, segDist(p, l[i], l[(i + 1) % l.length]));
    if (m >= clear) cands.push({ p, m });
  }
  if (!cands.length) return [];
  const out = [cands.reduce((a, b) => b.m > a.m ? b : a)];
  while (out.length < n) {
    let best = null, bd = 0;
    for (const c of cands) { const d = Math.min(...out.map(o => Math.hypot(o.p[0] - c.p[0], o.p[1] - c.p[1]))); if (d > bd) { bd = d; best = c; } }
    if (!best || bd < 4 * clear) break;
    out.push(best);
  }
  return out.map(o => o.p);
}

// Presets are functions builder → builder
export function preset(name, fn) { const f = b => fn(b) ?? b; f.presetName = name; return f; }
preset.fdm = b => b; preset.msla = b => b; preset.iterate = b => b;
preset.production = b => b.set?.('preset', 'production') ?? b;
preset.printInPlace = b => b;
preset.functional = x => (x?.isPart || x?.isPrintJob) ? (x.set?.('functional', true) ?? x) : (b => b.set?.('functional', x ?? true) ?? b);
