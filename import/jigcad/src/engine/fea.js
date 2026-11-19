// Stress studies (layer 6 of the assemblies spec, v0.2): j.fea(name, { part, material }) holds some faces of a
// part, loads others, and has CalculiX solve the linear elastic response on quadratic tetrahedra. Faces are named
// the way the rest of jig names them (j.feat('base').startFace(), j.sel.faces('>Z'), 'body/end'), so a study
// keeps hold of its faces across edits. A study can take its loads from a mechanism instead (.from(asm, …):
// the forces at the component's joints and its inertia, at the worst pose of a study, mechanism.js).
//
// Compiling a study compiles its part and turns everything into a job of plain data (fea/solve.js); solving is
// asynchronous and happens after: prog.fea() (the worker's op 'fea', the host's second pass, `await` in a script).
// Results join the Program as metrics (stress, safetyFactor, displacement), diagnostics (fea.*), decisions and
// trace passes, and data.fea (the surface coloured by stress, for the stage).
import { callerLine } from './callsite.js';
import { meshBody } from './mesh.js';
import { material as materialOf } from './inspect.js';
import { isQuantity, q as qParse } from './units.js';
import { paramLayers, resolveAll, paramRows } from './params.js';
import { hashStr } from './hash.js';
import { solveJob, SOLVER_VERSION } from '../fea/solve.js';

const G0 = 9806.65;   // mm/s²
const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

class FeaStudy {
  constructor(name, o) { this.name = name; this.o = o; Object.freeze(this); }
  toString() { return `stress study ${this.name}`; }
  get isFeaStudy() { return true; }
  get kind() { return 'fea'; }
  _w(p) { return new FeaStudy(this.name, { ...this.o, ...p }); }
  _push(key, rec) { return this._w({ [key]: [...(this.o[key] ?? []), { ...rec, line: callerLine() }] }); }
  part(p) { return this._w({ part: p }); }
  material(m) { return this._w({ material: m }); }
  params(obj) { return this._w({ params: { ...(this.o.params ?? {}), ...obj } }); }
  /** hold faces still */
  fix(sel, o = {}) { return this._push('fixtures', { type: 'fixed', sel, label: o.label }); }
  /** a frictionless support: the faces slide in their own plane, never off it */
  roller(sel, o = {}) { return this._push('fixtures', { type: 'roller', sel, label: o.label }); }
  /** a total force over the faces: a vector [fx, fy, fz] (N), or a magnitude with { dir } ('-Z', [x, y, z]) */
  force(sel, value, o = {}) { return this._push('loads', { type: 'force', sel, value, dir: o.dir, label: o.label }); }
  /** a pressure (MPa), positive into the surface */
  pressure(sel, value, o = {}) { return this._push('loads', { type: 'pressure', sel, value, label: o.label }); }
  /** the part's own weight: g along -Z, or a direction / vector in g */
  gravity(v = '-Z', o = {}) { return this._push('loads', { type: 'gravity', value: v, label: o.label ?? 'gravity' }); }
  /** a steady acceleration of the part (in g, or a quantity in mm/s²): its inertia loads it the other way */
  accel(v, o = {}) { return this._push('loads', { type: 'accel', value: v, dir: o.dir, label: o.label ?? 'acceleration' }); }
  /** the loads of a component of a mechanism at a pose of a study (mechanism layer 5): its joint forces and inertia */
  from(asm, o = {}) { return this._w({ from: { asm, ...o, line: callerLine() } }); }
  margin(n) { return this._w({ margin: n }); }
  mesh(o = {}) { return this._w({ meshOpts: { ...(this.o.meshOpts ?? {}), ...o } }); }
  check(kind, o = {}) { return this._push('checks', { kind, ...o }); }
  solver(name) { return this._w({ solver: name }); }
  use(...fns) { let s = this; for (const f of fns.flat()) s = typeof f === 'function' ? f(s) ?? s : f?.apply ? f.apply(s) ?? s : s; return s; }
  with(fn) { return fn(this) ?? this; }
  set(k, v) { return this._w({ sets: { ...(this.o.sets ?? {}), [k]: v } }); }
  compile(opts, { compilePart, finalize }) { return compileStudy(this, opts, { compilePart, finalize }); }
}

export function fea(name = 'study', o = {}) {
  if (typeof name === 'object' && name) { o = name; name = 'study'; }
  return new FeaStudy(name, { part: o.part ?? null, material: o.material ?? null, margin: o.margin ?? null, solver: o.solver ?? null, fixtures: [], loads: [], checks: [] });
}

// ── values ───────────────────────────────────────────────────────────────────
function dirOf(d, what) {
  if (Array.isArray(d)) { const v = d.map(Number), l = Math.hypot(...v); if (!(l > 0)) throw new Error(`${what}: the direction [${d}] has no length`); return v.map((x) => x / l); }
  const m = /^([+-]?)([XYZ])$/i.exec(String(d ?? ''));
  if (!m) throw new Error(`${what}: a direction is '+X', '-Z', … or [x, y, z], not ${JSON.stringify(d)}`);
  return AXES[m[2].toUpperCase()].map((x) => (m[1] === '-' ? -x : x));
}
// a number in `unit` from a quantity, a param name or expression, or a plain number (taken as already in `unit`)
function scalar(v, unit, values, what) {
  if (typeof v === 'string') {
    if (values && v in values) v = values[v];
    else { try { v = qParse(v); } catch { throw new Error(`${what}: '${v}' is neither a param nor a quantity`); } }
  }
  if (isQuantity(v)) {
    try { return v.in(unit); } catch { throw new TypeError(`${what} takes ${unit === 'N' ? 'a force (N)' : unit === 'MPa' ? 'a pressure (MPa)' : unit}, got ${v}`); }
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw new TypeError(`${what}: expected ${unit}, got ${v}`);
}
function vector(v, o, unit, values, what) {
  if (Array.isArray(v) && v.length === 3) return v.map((x) => scalar(x, unit, values, what));
  if (o.dir == null) throw new TypeError(`${what}: give a vector [fx, fy, fz] or a magnitude with { dir: '-Z' }`);
  const d = dirOf(o.dir, what), s = scalar(v, unit, values, what);
  return d.map((x) => x * s);
}
// an acceleration in mm/s²: a direction ('-Z', [x, y, z]) is 1 g along it; numbers are in g; quantities are
// accelerations (j.q('3 m/s^2')); a magnitude takes { dir }
function accelVec(v, dir, what) {
  const comp = (x) => (isQuantity(x) ? x.value : Number(x) * G0);
  if (typeof v === 'string') return dirOf(v, what).map((x) => x * G0);
  if (Array.isArray(v) && v.length === 3) return v.map(comp);
  if (dir == null) throw new TypeError(`${what}: give a vector [ax, ay, az] in g, or a magnitude with { dir: '-Z' }`);
  return dirOf(dir, what).map((x) => x * comp(v));
}

// ── compile ──────────────────────────────────────────────────────────────────
const RESULTS = new Map();   // job key → result (the last 16)
function compileStudy(st, opts, { compilePart, finalize }) {
  const t0 = performance.now();
  const o = st.o, diagnostics = [], decisions = [], trace = [];
  const fail = (kind, message, fix, at = st.name) => diagnostics.push({ level: 'error', kind, at, message, fix });
  // the study's own params: loads and margins people move with a slider
  let pvals = {}, prows = [];
  if (o.params && Object.keys(o.params).length) {
    const ov = Object.fromEntries(Object.entries(opts.override ?? {}).filter(([k]) => k in o.params).map(([k, v]) => [k, typeof v === 'number' && isQuantity(o.params[k]) && o.params[k].u ? qParse(`${v} ${o.params[k].u}`) : v]));
    const pres = resolveAll(paramLayers({ params: [o.params], compileOverride: ov }), {});
    pvals = pres.values ?? {}; prows = paramRows(pres).map((r) => ({ ...r, src: r.src === 'params' ? 'study' : r.src, part: null, shared: true }));
    diagnostics.push(...(pres.diagnostics ?? []));
  }
  // the part, and the load case from a mechanism when the study takes one
  let part = o.part, lc = null;
  if (o.from) {
    try { lc = o.from.asm.loadCase ? o.from.asm.loadCase(o.from, opts, { compilePart, finalize }) : (() => { throw new Error('.from() takes an assembly'); })(); }
    catch (e) { fail('fea.from', `from: ${e.message}`, e.fix); }
    if (lc && !part) part = lc.part;
    for (const d of lc?.diagnostics ?? []) diagnostics.push(d);
    for (const d of lc?.decisions ?? []) decisions.push(d);
    for (const t of lc?.trace ?? []) trace.push(t);
  }
  if (!part?.isPart) throw new Error(`j.fea('${st.name}'): give the part to study: j.fea('${st.name}', { part })`);
  // the study's material is the part's for this program: its mass, cost and title say what was solved
  const studyMat = o.material ?? lc?.material ?? null;
  if (studyMat && part.meta.material !== studyMat) {
    const was = part.meta.material ? materialOf(part.meta.material).name : null, now = materialOf(studyMat).name;
    if (was !== now) decisions.push({ at: st.name, kind: 'material', chose: now, alternatives: was ? [was] : [], reason: was ? `the study's material; ${part.name} names ${was}, which its own compile keeps` : `the study's material (${part.name} names none)` });
    part = part.material(studyMat);
  }
  const res = compilePart(part, opts);
  const prog = finalize({ kind: 'fea', name: st.name, parts: [{ name: part.name, part, res }], t0, opts, sharedParams: prows.length ? prows : null, extraDiagnostics: diagnostics, extraDecisions: decisions, extraTrace: trace });
  const D = prog.data;
  const bodies = res.state.bodies;
  if (bodies.length !== 1) {
    D.diagnostics.push({ level: 'error', kind: 'fea.bodies', at: part.name, message: `a stress study takes a part of one solid body; ${part.name} has ${bodies.length}`, fix: 'fuse the bodies into one (op: join), or study them one at a time' });
    return finish(prog);
  }
  const body = bodies[0];
  // faces by persistent name, through the same selectors features use
  const faceIndex = (sel, what) => {
    if (Array.isArray(sel) && sel.every((x) => typeof x === 'number')) return sel;
    let recs;
    try { recs = (Array.isArray(sel) ? sel : [sel]).flatMap((s) => prog.faces(s)); }
    catch (e) { D.diagnostics.push({ level: 'error', kind: 'fea.ref', at: what, message: `${what}: ${e.message}`, fix: 'check the selector with why(…)' }); return []; }
    if (!recs.length) D.diagnostics.push({ level: 'error', kind: 'fea.ref', at: what, message: `${what}: ${String(sel)} names no face of ${part.name}`, fix: 'check the selector with why(…)' });
    return [...new Set(recs.map((r) => r.index))];
  };
  // material: the study's, else the part's, else PLA
  const mat = materialOf(o.material ?? lc?.material ?? part.meta.material ?? 'PLA');
  const material = { name: mat.name, E: mat.modulus * 1000, nu: mat.nu ?? 0.35, strength: mat.strength, density: mat.density * 1e-9 };
  if (!(material.strength > 0)) fail('fea.material', `${mat} has no strength to judge the part against`, `${mat.name}.with({ strength: MPa(…) })`);
  const job = { name: st.name, faceNames: body.names.slice(), material, fixtures: [], loads: [], checks: [], margin: o.margin ?? 2, mesh: { ...(o.meshOpts ?? {}) }, solver: o.solver ?? 'auto' };
  if (job.mesh.size != null) job.mesh.size = scalar(job.mesh.size, 'mm', pvals, 'mesh size');
  for (const [i, fx] of (o.fixtures ?? []).entries()) {
    const label = fx.label ?? `${fx.type === 'roller' ? 'roller' : 'fixture'} ${i + 1}`;
    job.fixtures.push({ type: fx.type, faces: faceIndex(fx.sel, label), label, names: [] });
  }
  for (const [i, ld] of (o.loads ?? []).entries()) {
    const label = ld.label ?? `${ld.type} ${i + 1}`;
    try {
      if (ld.type === 'force') job.loads.push({ type: 'force', faces: faceIndex(ld.sel, label), force: vector(ld.value, ld, 'N', pvals, label), label });
      else if (ld.type === 'pressure') job.loads.push({ type: 'pressure', faces: faceIndex(ld.sel, label), p: scalar(ld.value, 'MPa', pvals, label), label });
      else if (ld.type === 'gravity') job.loads.push({ type: 'body', rho: material.density, g: Array.isArray(ld.value) ? dirOf(ld.value, label).map((x) => x * G0) : accelVec(ld.value, null, label), label });
      else if (ld.type === 'accel') job.loads.push({ type: 'body', rho: material.density, a0: accelVec(ld.value, ld.dir, label), label });
    } catch (e) { D.diagnostics.push({ level: 'error', kind: 'fea.load', at: label, message: e.message, line: ld.line }); }
  }
  // the mechanism's load case: the joints' wrenches on their seats, the inertia as a body load, one seat held
  if (lc) {
    for (const s of lc.seats) {
      const faces = s.faces ? faceIndex(s.faces, `seat ${s.port}`) : seatFaces(body, s);
      if (!faces.length) { D.diagnostics.push({ level: 'error', kind: 'fea.seat', at: s.port, message: `no face of ${part.name} seats port '${s.port}' (no cylinder on its axis)`, fix: `name them: .from(asm, { faces: { ${s.port}: j.feat(…).sideFaces() } })` }); continue; }
      if (s.held) job.fixtures.push({ type: 'fixed', faces, label: `seat ${s.port} (held)` });
      else job.loads.push({ type: 'wrench', faces, force: s.force, moment: s.moment, point: s.point, mode: s.bearing ? 'bearing' : 'uniform', label: `joint ${s.joint} at ${s.port}` });
      D.decisions.push({ at: `${st.name}:${s.port}`, kind: 'seat', chose: `${faces.map((k) => body.names[k]).join(', ')}`, alternatives: [], reason: s.faces ? 'named in .from(…, { faces })' : `the faces coaxial with port ${s.port}'s z` });
    }
    if (lc.body) job.loads.push({ type: 'body', rho: material.density, ...lc.body, label: 'inertia and gravity' });
  }
  for (const c of o.checks ?? []) if (c.kind === 'displacement') job.checks.push({ type: 'displacement', limit: scalar(c.limit, 'mm', pvals, 'displacement check'), faces: c.faces ? faceIndex(c.faces, 'displacement check') : null, label: c.label });
  if (!job.fixtures.length) fail('fea.free', 'nothing holds the part', '.fix(faces) holds faces still; .roller(faces) lets them slide in their plane');
  if (!job.loads.length) fail('fea.unloaded', 'nothing loads the part', '.force(faces, N(…), { dir }), .pressure(faces, MPa(…)) or .gravity()');
  // the surface: the kernel's triangulation, each triangle with its face
  const m = meshBody(body);
  job.surface = { positions: m.positions, indices: m.indices, triFace: m.triFace };
  for (const f of job.fixtures) f.names = f.faces.map((k) => body.names[k]);
  for (const l of job.loads) if (l.faces) l.names = l.faces.map((k) => body.names[k]);
  const key = 'fea:' + hashStr(`${res.key}|${SOLVER_VERSION}|${JSON.stringify({ ...job, surface: m.positions.length })}`);
  prog.P.feaJob = job; prog.P.feaKey = key;
  D.fea = { status: D.diagnostics.some((d) => d.level === 'error') ? 'blocked' : 'pending', name: st.name, key, part: part.name, material, margin: job.margin,
    fixtures: job.fixtures.map(({ type, label, names }) => ({ type, label, faces: names })), loads: job.loads.map(({ type, label, names, force, p, moment }) => ({ type, label, faces: names ?? null, force: force ?? null, p: p ?? null, moment: moment ?? null })),
    pose: lc?.pose ?? null,
    mechanism: lc ? { held: lc.seats.filter((x) => x.held).map((x) => ({ port: x.port, joint: x.joint, force: x.force })), seats: lc.seats.map((x) => ({ port: x.port, joint: x.joint, held: x.held, force: x.force, moment: x.moment })), body: lc.body } : null };
  if (RESULTS.has(key)) merge(prog, RESULTS.get(key), true);
  prog.fea = (so = {}) => solveStudy(prog, so);
  return finish(prog);
}
function finish(prog) {
  const D = prog.data;
  D.summary.errors = D.diagnostics.filter((d) => d.level === 'error').length;
  D.summary.warnings = D.diagnostics.filter((d) => d.level === 'warning').length;
  D.ok = !D.summary.errors;
  return prog;
}

// faces seating a port: cylinders whose axis is the port's z axis (a bore, a pin), else the faces whose centre lies
// within the port's own size of its origin
function seatFaces(body, s) {
  const o = s.local.o, z = s.local.z, out = [];
  const near = (p, a) => { const d = [p[0] - a.origin[0], p[1] - a.origin[1], p[2] - a.origin[2]], t = d[0] * a.dir[0] + d[1] * a.dir[1] + d[2] * a.dir[2]; return Math.hypot(d[0] - t * a.dir[0], d[1] - t * a.dir[1], d[2] - t * a.dir[2]); };
  body.names.forEach((_, i) => {
    const fi = body.faceInfo(i);
    if (fi.kind !== 'cylinder' || !fi.axis) return;
    const par = Math.abs(fi.axis.dir[0] * z[0] + fi.axis.dir[1] * z[1] + fi.axis.dir[2] * z[2]);
    if (par > 1 - 1e-6 && near(o, fi.axis) < 1e-3 * Math.max(1, fi.axis.radius)) out.push(i);
  });
  return out;
}

// ── solve and merge ──────────────────────────────────────────────────────────
async function solveStudy(prog, so = {}) {
  const D = prog.data, job = prog.P.feaJob;
  if (!job) throw new Error('fea: this program has no stress study');
  if (D.fea.status === 'blocked') return prog;
  if (D.fea.status === 'solved' && !so.force) return prog;
  const t0 = performance.now();
  try {
    const r = await solveJob(job, { keepVolume: !!so.keepVolume, keepDeck: !!so.keepDeck });
    const { volume, deck, ...keep } = r;
    RESULTS.set(prog.P.feaKey, keep); if (RESULTS.size > 16) RESULTS.delete(RESULTS.keys().next().value);
    if (volume) prog.P.feaVolume = volume;
    if (deck) prog.P.feaDeck = deck;
    merge(prog, keep, false, performance.now() - t0);
  } catch (e) {
    D.diagnostics.push({ level: 'error', kind: e.kind ?? 'fea.failed', at: D.fea.name, message: e.message, fix: e.fix });
    D.fea.status = 'failed'; D.fea.error = e.message;
    finish(prog);
  }
  return prog;
}
function merge(prog, r, cached, ms = 0) {
  const D = prog.data, part = D.fea.part;
  D.metrics.stress = { value: r.peak.value, unit: 'MPa', fidelity: 'approx', note: `peak von Mises, nodal average (${r.solver})` };
  D.metrics.stressGauss = { value: r.gauss?.value ?? null, unit: 'MPa', fidelity: 'approx', note: 'peak von Mises at an integration point' };
  D.metrics.safetyFactor = { value: r.safetyFactor, unit: 'ratio', fidelity: 'approx', note: `${r.material.name} strength ${r.strength} MPa / peak` };
  D.metrics.displacement = { value: r.displacement.value, unit: 'mm', fidelity: 'approx', note: 'largest displacement' };
  D.metrics.feaDOF = { value: r.mesh.dof, unit: 'count', fidelity: 'exact', note: `${r.mesh.elements} C3D10 elements` };
  Object.assign(D.summary, { stress: +r.peak.value.toFixed(3), safetyFactor: +r.safetyFactor.toFixed(3), displacement: +r.displacement.value.toFixed(5) });
  D.diagnostics = D.diagnostics.filter((d) => !String(d.kind).startsWith('fea.') || d.kind === 'fea.ref' || d.kind === 'fea.material' || d.kind === 'fea.load');
  for (const f of r.findings) D.diagnostics.push({ ...f, part, at: f.at ?? D.fea.name });
  D.decisions.push({ at: D.fea.name, kind: 'mesh', chose: `${r.mesh.elements} quadratic tetrahedra (C3D10), ${r.mesh.nodes} nodes, size ${r.mesh.size.toFixed(2)} mm`, alternatives: [], reason: r.mesh.refined ? `refined from ${r.mesh.refined.fromSize.toFixed(2)} mm because the safety factor was under 3 (peak ${r.mesh.refined.fromPeak.toFixed(1)} → ${r.mesh.refined.peak.toFixed(1)} MPa)` : prog.P.feaJob.mesh.size != null ? 'set by .mesh({ size })' : 'a thirtieth of the part\'s diagonal, finer where its surface is curved' });
  D.decisions.push({ at: D.fea.name, kind: 'solver', chose: r.solver, alternatives: [], reason: /CalculiX/.test(r.solver) ? 'the CalculiX module is present' : 'no CalculiX module: the reference solver states the same problem' });
  D.trace.push({ pass: 'fea', level: 'L6', ms: cached ? 0 : ms, cached, note: `${r.mesh.elements} elements, ${r.mesh.dof} dof, ${r.solver}; mesh ${(r.timings.mesh ?? 0).toFixed(0)} ms, solve ${(r.timings.solve ?? 0).toFixed(0)} ms` });
  // a load case from a mechanism: the held seat's reaction in the stress study is what the mechanism says the joint
  // carries there, when the part's mass and the loads agree
  const mh = D.fea.mechanism?.held?.[0];
  if (mh) {
    const scale = Math.max(1e-9, Math.hypot(...mh.force), ...r.applied.map((a) => Math.hypot(...a.total)));
    const off = Math.hypot(...[0, 1, 2].map((k) => r.reaction[k] - mh.force[k])) / scale;
    if (off > 0.02) D.diagnostics.push({ level: 'warning', kind: 'fea.mechanismBalance', part, at: mh.port, message: `the held seat carries [${r.reaction.map((x) => x.toFixed(3))}] N in the stress study, the mechanism says [${mh.force.map((x) => x.toFixed(3))}] N (${(off * 100).toFixed(1)} % apart)`, fix: 'check the seats found for each port (decisions), and the part\'s material' });
    else D.decisions.push({ at: D.fea.name, kind: 'balance', chose: `seat ${mh.port} carries [${r.reaction.map((x) => x.toFixed(3))}] N`, alternatives: [], reason: `the mechanism's joint ${mh.joint} gives [${mh.force.map((x) => x.toFixed(3))}] N (${(off * 100).toFixed(2)} % apart)` });
  }
  // each face's stress, for the stage's tones: the largest and the area-weighted mean of the nodal field on it
  const S = r.surface, faces = new Map();
  for (let t = 0; t < S.marks.length; t++) {
    const a = S.indices[3 * t], b = S.indices[3 * t + 1], c = S.indices[3 * t + 2], P = (i) => [S.positions[3 * i], S.positions[3 * i + 1], S.positions[3 * i + 2]];
    const u = P(a), v = P(b), w = P(c), e1 = [v[0] - u[0], v[1] - u[1], v[2] - u[2]], e2 = [w[0] - u[0], w[1] - u[1], w[2] - u[2]];
    const A = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    const m = Math.max(S.vonMises[a], S.vonMises[b], S.vonMises[c]), mean = (S.vonMises[a] + S.vonMises[b] + S.vonMises[c]) / 3;
    const f = faces.get(S.marks[t]) ?? { max: 0, sum: 0, area: 0 }; f.max = Math.max(f.max, m); f.sum += mean * A; f.area += A; faces.set(S.marks[t], f);
  }
  const names = prog.P.feaJob.faceNames;
  const faceStress = [...faces].map(([face, f]) => ({ face, name: names[face], max: f.max, mean: f.area ? f.sum / f.area : 0 })).sort((x, y) => y.max - x.max);
  D.fea = { ...D.fea, status: 'solved', cached, body: D.bodies[0]?.id ?? null, faces: faceStress, solver: r.solver, peak: r.peak, gauss: r.gauss, safetyFactor: r.safetyFactor, strength: r.strength, displacement: r.displacement,
    applied: r.applied, appliedTotal: r.appliedTotal, reaction: r.reaction, supports: r.supports, balance: r.balance, mesh: r.mesh, checks: r.checks, timings: r.timings,
    // the program's own copy: a reply to the page transfers (detaches) its buffers, and the result cache keeps r
    surface: Object.fromEntries(Object.entries(r.surface).map(([k, v]) => [k, ArrayBuffer.isView(v) ? v.slice() : v])) };
  finish(prog);
}
