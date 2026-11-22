// Assemblies (README §4.10): components placed by transforms or joints between ports, grounding,
// rigid/revolute/slider joints as placement constraints, print-in-place gap checks, BOM, mobility.
import * as K from './kernel.js';
import { callerLine } from './part.js';
import { frameOf, matOf } from './adapt.js';
import { mobility, meshGap, meshGapNear, meshTris } from './inspect.js';
import { meshBody } from './mesh.js';
import { resolveInPart } from './compile.js';
import { MechanismSolver, runStudy, studyApi, equationCount } from './mechanism.js';
import { q as quantity } from './units.js';
import { toKine } from './kine.js';
import { gearSpecOf, meshReport } from './gears.js';
import { massProps, kinematics, reactions as jointReactions, magnitude } from './dynamics.js';
import { material as materialOf } from './inspect.js';
import { isQuantity } from './units.js';
import { G0, acceleration, force, moment } from './vectors.js';

const V = K.V;
const DOF = { rigid: 0, revolute: 1, slider: 1, cylindrical: 2, planar: 3, ball: 3, snap: 0 };
const GROUP = { rigid: '{e}', revolute: 'SO(2)', slider: 'ℝ', cylindrical: 'SO(2)×ℝ', planar: 'SE(2)', ball: 'SO(3)', snap: '{e} once engaged' };
export const joint = Object.fromEntries(Object.keys(DOF).map(k => [k, (o = {}) => Object.freeze({ kind: k, group: GROUP[k], dof: DOF[k], ...o })]));
joint.prismatic = joint.slider; joint.fixed = joint.rigid;   // the assembly spec's names (spec v0.1)
// couplings between gear components (README §4.10): the joints that turn them are found, and the ratio and its
// sign come from the teeth and the solved axes. a, b: 'pinion:axis' or 'pinion'. o: { ratio?, offset?, joints?: [ja, jb], id? }
export const couple = {
  gear: (a, b, o = {}) => Object.freeze({ couple: 'gear', a, b, ...o }),
  rack: (rack, pinion, o = {}) => Object.freeze({ couple: 'rack', a: pinion, b: rack, ...o }),
  belt: (a, b, o = {}) => Object.freeze({ couple: 'belt', a, b, ...o }),
};

class Assembly {
  constructor(name, o) { this.name = name; this.o = o; Object.freeze(this); }
  toString() { return `assembly ${this.name}`; }
  get isAssembly() { return true; }
  get kind() { return 'assembly'; }
  _w(p) { return new Assembly(this.name, { ...this.o, ...p }); }
  params(obj) { return this._w({ params: { ...(this.o.params ?? {}), ...obj } }); }
  configs(c) { return this._w({ configs: c }); }
  override(obj) { return this._w({ overrides: { ...(this.o.overrides ?? {}), ...obj } }); }
  add(id, item, opts = {}) { return this._w({ components: [...this.o.components, { id, item, opts, at: callerLine() }] }); }
  ground(id) { return this._w({ ground: id }); }
  joint(id, kind, a, b, opts = {}) { return this._w({ joints: [...this.o.joints, { id, ...(typeof kind === 'string' ? joint[kind](opts) : kind), a, b, opts }] }); }
  printInPlace(ids, o = {}) { return this._w({ pip: { ids, ...o } }); }
  sweep(jointId, o = {}) { return this._w({ sweeps: [...(this.o.sweeps ?? []), { jointId, ...o }] }); }
  // mechanisms (spec v0.1): a drive fixes a joint value, a hint seeds the start pose, a couple ties two joint values
  // (gears, belts); measures read the pose, events mark where a reading flips, studies sweep a drive, reports turn
  // studies into numbers
  drive(jointId, value) { return this._w({ drives: { ...(this.o.drives ?? {}), [jointId]: value } }); }
  hint(jointId, value) { return this._w({ hints: { ...(this.o.hints ?? {}), [jointId]: value } }); }
  // couple(id, jointA, jointB, { ratio, offset }) | couple(j.couple.gear(a, b)) | couple(id, j.couple.gear(a, b))
  couple(id, a, b, o = {}) {
    const at = callerLine();
    if (id?.couple || a?.couple) {
      const spec = id?.couple ? id : a, cid = typeof id === 'string' ? id : spec.id ?? `${spec.couple} ${compOf(spec.a)}–${compOf(spec.b)}`;
      return this._w({ couples: [...(this.o.couples ?? []), { id: cid, spec, at }] });
    }
    if (typeof id !== 'string') return this._w({ couples: [...(this.o.couples ?? []), { unsupported: true, spec: id, at }] });
    return this._w({ couples: [...(this.o.couples ?? []), { id, a, b, ratio: o.ratio ?? 1, offset: o.offset ?? 0 }] });
  }
  measure(name, fn) { return this._w({ measures: [...(this.o.measures ?? []), { name, fn }] }); }
  event(name, fn) { return this._w({ events: [...(this.o.events ?? []), { name, fn }] }); }
  study(name, o = {}) { return this._w({ studies: [...(this.o.studies ?? []), { name, ...o }] }); }
  report(name, fn, o = {}) { return this._w({ reports: [...(this.o.reports ?? []), { name, fn, unit: o.unit ?? '', digits: o.digits ?? 3 }] }); }
  explode(steps) { return this._w({ explode: steps }); }
  // forces (spec v0.2, layer 5): the drive's speed turns per-radian rates into per-second ones; gravity (−Z, 1 g, by
  // default once forces are asked for); wrenches on a port, a vector or a lambda of the study row (null: none);
  // reactions(study) adds the joint forces, the driving torques and the bodies' accelerations to that study's rows
  speed(jointId, value) { return this._w({ speed: { joint: jointId, value } }); }
  gravity(v = '-Z') { return this._w({ gravity: v }); }
  wrench(ref, fn, o = {}) { return this._w({ wrenches: [...(this.o.wrenches ?? []), { ref, fn, at: o.at ?? null, moment: o.moment ?? null, label: o.label ?? ref, line: callerLine() }] }); }
  reactions(study = null, o = {}) { return this._w({ reactions: [...(this.o.reactions ?? []), { study, ...o }] }); }
  // the loads one component carries at a pose of a study, for a stress study (j.fea(…).from(asm, { component, … }))
  loadCase(from, opts, h) { return loadCaseOf(this, from, opts, h); }
  // interference(ids?, { study?, pairs?, every?, within?, clearance?, volume?, exact? }): with a study, every
  // sampled pose of it is checked; overlaps report the shared volume V(a ∩ b) = V(a) + V(b) − V(a ∪ b)
  interference(ids, o = {}) { return this._w({ interference: Array.isArray(ids) ? { ...o, ids } : { ...(ids ?? {}) } }); }
  use(...fns) { let a = this; for (const f of fns.flat()) a = typeof f === 'function' ? f(a) ?? a : a; return a; }
  with(fn) { return fn(this) ?? this; }
  get components() { return this.o.components.map(c => ({ id: c.id })); }
  get joints() { return this.o.joints.map(j => ({ id: j.id, kind: j.kind, a: j.a, b: j.b })); }
  flatParts() { return this.o.components.filter(c => c.item?.isPart).map(c => ({ id: c.id, part: c.item, tx: matOf(c.opts.at) })); }
  compile(opts, { compilePart, finalize }) { return compileAssembly(this, opts, { compilePart, finalize }); }
}
export function assembly(name = 'assembly') { return new Assembly(name, { components: [], joints: [] }); }

function compileAssembly(asm, opts, { compilePart, finalize }) {
  const t0 = performance.now();
  const { parts, placements, occurrences, diagnostics, decisions, trace, comp, groundId, mech } = solveAssembly(asm, opts, compilePart);
  const o = asm.o;
  // the count (Grübler–Kutzbach, from the joint kinds alone) and, beside it, what the solver found
  const mob = { ...mobility({ components: [...comp.keys()], joints: o.joints }), ...(mech?.mobility ?? {}) };
  if (mech?.mobility) { mob.solverDOF = mech.mobility.dof; mob.note = mech.mobility.redundant ? `${mech.mobility.redundant} joint equation(s) repeat the others: ${mech.mobility.redundantJoints.join(', ')} must stay exactly aligned in the real parts` : 'no joint equation repeats another'; }
  const values = new Map((mech?.joints ?? []).map(j => [j.id, j]));
  const info = { name: asm.name, hash: null, components: [...comp.keys()].map(id => ({ id, ground: id === groundId })),
    joints: o.joints.map(j => ({ id: j.id, kind: j.kind, a: j.a, b: j.b, limits: j.limits?.map(x => typeof x === 'number' ? x * Math.PI / 180 : x.value), equations: equationCount(j.kind),
      value: values.get(j.id)?.value ?? null, unit: values.get(j.id)?.unit ?? '', driven: values.get(j.id)?.driven ?? false, tree: values.get(j.id)?.tree ?? false,
      at: values.get(j.id)?.at ?? null, atB: values.get(j.id)?.atB ?? null, axis: values.get(j.id)?.axis ?? null })),
    ports: mech?.ports ?? [], origins: mech?.origins ?? {}, fixed: mech?.ground ?? [],
    mobility: mob, assembled: mech?.assembled ?? true, conflicts: mech?.conflicts ?? [], residual: mech?.residual ?? 0,
    drives: mech?.drives ?? {}, couples: mech?.couples ?? [],
    measures: mech?.measures ?? {}, studies: mech?.studies ?? {}, reports: mech?.reports ?? [], forces: mech?.forces ?? null,
    bom: [...comp.values()].map(x => ({ item: x.c.item.name, id: x.c.id, qty: x.c.opts.qty ?? 1, kind: 'printed' })) };
  const prog = finalize({ kind: 'assembly', name: asm.name, parts, t0, opts, assembly: info, occurrences, placements,
    extraDiagnostics: diagnostics, extraDecisions: decisions, extraTrace: trace,
    extraMetrics: { assemblyDOF: { value: mob.solverDOF, unit: 'count', fidelity: 'exact', note: 'mobility 6n − rank J from the joint equations at the solved pose' } } });
  prog.P.mech = mech; prog.P.comp = comp;
  prog.bom = () => info.bom; prog.dof = () => ({ total: mob.solverDOF, grounded: groundId }); prog.occurrence = id => occurrences.find(x => x.id === id) ?? null;
  // compile the solved mechanism to a kine program (spec M7): { source, observe, notes, input }
  prog.kine = (ko = {}) => { if (!mech?.solver) throw new Error('kine: no solved mechanism'); return toKine(mech.solver, info, ko); };
  // drag to pose: { ref: 'comp:port', to: [x, y, z] } → the pose the joints allow nearest the target, the component
  // transforms and port frames to draw it, and the joint values (overrides) that pin it. Drags chain from the last
  // dragged pose; { reset: true } starts again from the compiled one.
  let dragged = null;
  prog.dragPose = ({ ref, to, reset } = {}) => {
    const S = mech?.solver; if (!S || !mech.assembled) throw new Error('drag: no assembled mechanism');
    const home = S.pose;
    if (dragged && !reset) S.pose = dragged;
    try {
      const ok = S.drag(ref, to);
      const T = S.transforms(), ids = [...comp.keys()];
      const out = { ok, transforms: Object.fromEntries(ids.map((id, i) => [id, T[i]])), ports: S.portFrames(), joints: S.jointValues(),
        overrides: Object.fromEntries(S.holds().map(h => [h.id, `${+h.shown.toFixed(4)} ${h.unit}`])), at: S.world(S.port(ref)).P };
      if (ok) dragged = S.pose;
      return out;
    } finally { S.pose = home; }
  };
  return prog;
}
// Compile the components and solve the joints (opts.forPrint: joints at the print pose).
// → { parts, placements, occurrences, diagnostics, decisions, trace, comp: Map id → { c, res, T }, groundId }
export function solveAssembly(asm, opts, compilePart) {
  const o = asm.o;
  const diagnostics = [], decisions = [], trace = [];
  const parts = [], placements = {}, occurrences = [];
  const values = { ...(o.params ?? {}), ...(o.overrides ?? {}), ...(opts.override ?? {}) };
  const comp = new Map();
  for (const c of o.components) {
    if (!c.item?.isPart) { diagnostics.push({ level: 'warning', kind: 'asm.unsupported', at: c.id, message: `component '${c.id}' is not a part; nested assemblies are not supported yet` }); continue; }
    // bind child params to parent values / expressions
    const bound = {};
    for (const [k, v] of Object.entries(c.opts.params ?? {})) bound[k] = typeof v === 'string' && values[v] !== undefined ? values[v] : v;
    const res = compilePart(c.item, { ...opts, override: Object.keys(bound).length ? bound : null });
    const T0 = atMatrix(res, c.opts.at);
    comp.set(c.id, { c, res, T: T0, T0 });
    parts.push({ name: c.id, part: c.item, res });
  }
  const groundId = o.ground ?? o.components.find(c => c.opts.ground)?.id ?? o.components[0]?.id;
  // the joints, solved together (mechanism.js). A joint whose value is given (a param or override named by its id,
  // the print pose, or .drive) is driven; any other starts at its first limit, or 0, and is free.
  const rad = v => num(v);
  const limitsOf = jn => jn.limits?.map(x => typeof x === 'number' ? x * Math.PI / 180 : x.value);
  const portsOf = new Map();                       // component id → { port name → 4×4 }
  const wantPort = (cid, pname, at) => {
    const X = comp.get(cid); if (!X || !pname) return;
    const m = portsOf.get(cid) ?? new Map(); portsOf.set(cid, m);
    if (!m.has(pname)) m.set(pname, portMatrix(X, pname, at ? diagnostics : [], at));
  };
  const joints = [];
  for (const jn of o.joints) {
    const [ca, pa] = String(jn.a).split(':'), [cb, pb] = String(jn.b).split(':');
    if (!comp.get(ca) || !comp.get(cb)) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jn.id, message: `joint ${jn.id}: unknown component ${!comp.get(ca) ? ca : cb}` }); continue; }
    const before = diagnostics.length;
    wantPort(ca, pa, jn.id); wantPort(cb, pb, jn.id);
    if (diagnostics.length > before) continue;
    joints.push({ id: jn.id, kind: jn.kind, a: `${ca}:${pa}`, b: `${cb}:${pb}`, limits: limitsOf(jn), src: jn });
  }
  // every port of every component is readable by measures (resolved lazily; failures stay quiet here)
  for (const [cid, X] of comp) for (const pt of X.c.item.meta?.ports ?? []) wantPort(cid, pt.name, null);
  const jointed = new Set(joints.flatMap(j => [j.a.split(':')[0], j.b.split(':')[0]]));
  const driveOf = (jn) => {
    const posed = o.pip?.pose?.[jn.id] !== undefined, usePose = posed && (opts.forPrint || values[jn.id] === undefined);
    if (usePose) return { v: rad(o.pip.pose[jn.id]), why: 'print pose' };
    if (values[jn.id] !== undefined) return { v: rad(values[jn.id]), why: 'override' };
    if (o.drives?.[jn.id] !== undefined) return { v: rad(o.drives[jn.id]), why: 'drive' };
    return null;
  };
  const drives = new Map(), seeds = new Map(), why = new Map();
  for (const j of joints) { const d = driveOf(j.src); if (d) { drives.set(j.id, d.v); why.set(j.id, d.why); } else seeds.set(j.id, j.limits ? j.limits[0] : 0); }
  for (const c of o.couples ?? []) if (c.unsupported) diagnostics.push({ level: 'error', kind: 'asm.couple', at: c.at ? `line ${c.at}` : 'couple', message: 'couple takes (id, jointA, jointB, { ratio, offset }) or a coupling between gears: j.couple.gear(a, b), j.couple.rack(rack, pinion), j.couple.belt(a, b)' });
  const S = new MechanismSolver({
    bodies: [...comp].map(([id, x]) => ({ id, ground: id === groundId || (x.c.opts.at != null && !jointed.has(id)), T0: x.T0, ports: Object.fromEntries(portsOf.get(id) ?? []) })),
    joints, drives, seeds,
    hints: new Map(Object.entries(o.hints ?? {}).map(([k, v]) => [k, rad(v)])),
    couples: (o.couples ?? []).filter(c => !c.unsupported && !c.spec).map(c => ({ id: c.id, a: c.a, b: c.b, ratio: num(c.ratio), offset: rad(c.offset) })),
  });
  diagnostics.push(...S.diags);
  // couplings between gears: find the joints that turn them and take the ratio's sign from the axes of a provisional pose
  const meshes = [];
  const gearCouples = (o.couples ?? []).filter(c => c.spec && !c.unsupported);
  if (gearCouples.length) {
    S.place(); S.solve({ maxIter: 60 });
    for (const c of gearCouples) {
      const m = resolveGearCouple(c, S, comp, diagnostics);
      if (m) { S.couples.push({ id: c.id, a: m.ja.id, b: m.jb.id, ratio: m.ratio, offset: m.offset, on: true }); meshes.push(m); }
    }
  }
  const ts = performance.now();
  const scriptDrives = new Map(Object.entries(o.drives ?? {}).map(([k, v]) => [k, rad(v)]));
  const assembled = S.assemble(scriptDrives);
  const mobility = S.analyse();
  let conflicts = [];
  const residual = S.residual, flipped = assembled ? [] : [...(S.flipped ?? [])];
  if (!assembled) {
    const keep = S.pose; conflicts = S.conflictSet(); S.pose = keep;
    const why = flipped.length && residual <= 1e-8
      ? `the joints close only with ${flipped.join(', ')} turned half a turn: ${flipped.length > 1 ? 'their' : 'its'} ports meet with ${flipped.length > 1 ? 'an axis' : 'the axis'} reversed`
      : `the joints cannot all hold (largest residual ${residual < 0.01 ? residual.toExponential(2) : residual.toFixed(3)})`;
    diagnostics.push({ level: 'error', kind: 'asm.conflict', at: conflicts[0] ?? flipped[0] ?? 'joints', message: why, fix: conflicts.length ? `these conflict: ${conflicts.join(', ')}; check their ports (z with z, x with x), or remove one` : 'check the ports' });
  } else {
    if (mobility.redundant > 0) diagnostics.push({ level: 'info', kind: 'asm.redundant', at: mobility.redundantJoints[0] ?? 'joints', message: `${mobility.redundant} joint equation${mobility.redundant > 1 ? 's repeat' : ' repeats'} the others (Kutzbach ${mobility.kutzbach}, rank says ${mobility.dof})`, fix: mobility.redundantJoints.length ? `${mobility.redundantJoints.join(', ')}: their axes must stay exactly aligned in the real parts` : undefined });
    if (mobility.left > 0 && mobility.drives > 0) diagnostics.push({ level: 'warning', kind: 'asm.underconstrained', at: 'joints', message: `${mobility.left} free motion${mobility.left > 1 ? 's' : ''} left after the drives`, fix: 'drive or couple another joint' });
  }
  trace.push({ pass: 'mechanism', level: 'L5', ms: performance.now() - ts, cached: false, note: `${joints.length} joints, ${S.n} coordinates, rank ${mobility.rank}, mobility ${mobility.dof}${mobility.drives ? `, ${mobility.drives} drive(s)` : ''}; residual ${residual.toExponential(1)}, ${S.how}` });
  // readings, studies and reports (not for a print job's pose)
  const measures = o.measures ?? [], studies = {};
  let forceCtx = null; const dynLive = {};
  let measured = {}, reports = [];
  if (assembled && !opts.forPrint) {
    measured = S.read(measures);
    const studyList = [...(o.studies ?? []), ...(o.sweeps ?? []).map(sw => {
      const L = joints.find(j => j.id === sw.jointId)?.limits;
      return { name: `sweep:${sw.jointId}`, drive: sw.jointId, from: L ? L[0] : 0, to: L ? L[1] : 2 * Math.PI, steps: sw.steps ?? 36 };
    })];
    for (const st of studyList) {
      const tq = performance.now();
      const jn = S.jointById.get(st.drive);
      const full = jn && jn.kind !== 'slider' ? 2 * Math.PI : 10;
      // interference over the study: the named one(s), or every sweep when .interference() names none
      const ifr = o.interference, swept = !!ifr && (ifr.study ? [ifr.study].flat().includes(st.name) : st.name.startsWith('sweep:'));
      const poses = [];
      // forces over the study (layer 5): joint reactions, driving torques and accelerations at every pose
      const dynOn = !!jn && (o.reactions ?? []).some((r) => r.study == null || r.study === st.name);
      const F = dynOn ? (forceCtx ??= forceSetup(S, comp, o, diagnostics, decisions)) : null, dyn = [];
      const res = runStudy(S, { name: st.name, drive: st.drive, from: st.from != null ? rad(st.from) : 0, to: st.to != null ? rad(st.to) : full, steps: st.steps ?? 360,
        onRow: swept || dynOn ? (k, row) => { if (swept) poses[k] = S.transforms(); if (dynOn) { const d = forceRow(S, F, st.drive, row); dyn[k] = d; Object.assign(row, d.readings); } } : null }, measures, o.events ?? []);
      studies[st.name] = res;
      if (dynOn) {
        const keys = Object.keys(dyn.find(Boolean)?.readings ?? {});
        for (const k of keys) { res.keys.push(k); res.extrema[k] = extremaOf(res.rows, k); }
        res.forces = dyn.map((d) => d && { joints: Object.fromEntries(Object.entries(d.joints).map(([id, w]) => [id, { F: w.F.map(r6), M: w.M.map(r6), at: w.at.map(r6) }])), drives: d.drives });
        res.rate = F.rate(st.drive); res.gravity = F.g;
        dynLive[st.name] = dyn;
        const worst = Math.max(0, ...dyn.filter(Boolean).map((d) => d.residual));
        if (worst > 1e-6) diagnostics.push({ level: 'warning', kind: 'asm.forces', at: st.name, message: `the joints cannot hold the loads in balance at every pose (residual ${(worst * 100).toFixed(2)} %): a free motion is not driven, or a load pushes along it`, fix: 'drive or couple every free joint, or check the loads' });
        trace.push({ pass: `forces:${st.name}`, level: 'L5', ms: 0, cached: false, note: `${dyn.filter(Boolean).length} poses, ${F.rate(st.drive) ? 'inertia at ' + F.rate(st.drive).toFixed(3) + (jn.kind === 'slider' ? ' mm/s' : ' rad/s') : 'statics (no .speed())'}` });
      }
      if (swept && !res.error) {
        const tc = performance.now(), c = studyClearance(res, poses, comp, ifr, diagnostics, decisions);
        res.clearance = c.pairs;
        trace.push({ pass: `interference:${st.name}`, level: 'L5', ms: performance.now() - tc, cached: false, note: `${c.pairs.length} pair(s) over ${c.samples} poses; ${c.booleans} overlap volume(s)` });
      }
      if (res.error) diagnostics.push({ level: 'error', kind: 'asm.study', at: st.name, message: res.error });
      if (res.gaps?.length) diagnostics.push({ level: 'warning', kind: 'asm.unreachable', at: st.name, message: `${res.gaps.length} of ${res.rows.length} drive values cannot be reached (${+res.gaps[0].toFixed(1)}…${+res.gaps[res.gaps.length - 1].toFixed(1)} ${res.unit})`, fix: 'the loop cannot close there: change a length, or drive another joint' });
      if (res.jump != null) diagnostics.push({ level: 'warning', kind: 'asm.branchJump', at: st.name, message: `a component jumped at ${res.jump.toFixed(1)}${res.unit}: the solution changed branch`, fix: 'use more steps, or a hint that starts on the other branch' });
      trace.push({ pass: `study:${st.name}`, level: 'L5', ms: performance.now() - tq, cached: false, note: `${res.rows.length} poses, ${res.events.length} event(s)` });
    }
    for (const r of o.reactions ?? []) if (r.study != null && !studies[r.study]) diagnostics.push({ level: 'error', kind: 'asm.forces', at: String(r.study), message: `reactions: no study '${r.study}'`, fix: Object.keys(studies).length ? `one of ${Object.keys(studies).map((k) => `'${k}'`).join(', ')}, or asm.study('${r.study}', { drive, from, to, steps })` : `asm.study('${r.study}', { drive, from, to, steps })` });
    for (const name of [ifrStudies(o.interference)].flat().filter(Boolean)) if (!studies[name]) diagnostics.push({ level: 'error', kind: 'asm.interference', at: name, message: `interference: no study '${name}'`, fix: `asm.study('${name}', { drive, from, to, steps })` });
    const api = Object.fromEntries(Object.entries(studies).map(([k, v]) => [k, studyApi(v)]));
    reports = (o.reports ?? []).map(r => { let value = null, error = null; try { value = r.fn({ studies: api, measures: measured, mobility, joints: S.jointValues() }); } catch (e) { error = e.message; } return { name: r.name, value: typeof value === 'number' ? value : value == null ? null : String(value), unit: r.unit, digits: r.digits, error }; });
    for (const r of reports) if (r.error) diagnostics.push({ level: 'error', kind: 'asm.report', at: r.name, message: r.error });
    if (S.measureError) diagnostics.push({ level: 'warning', kind: 'asm.measure', at: 'measure', message: S.measureError });
  }
  const T = S.transforms();
  [...comp.keys()].forEach((id, i) => { comp.get(id).T = T[i]; });
  const jv = S.jointValues();
  for (const j of jv) {
    const X = comp.get(j.b.split(':')[0]);
    const shown = j.value == null ? j.kind : `${j.value.toFixed(j.unit === 'mm' ? 3 : 1)}${j.unit === 'mm' ? ' mm' : '°'}`;
    occurrences.push({ id: j.b.split(':')[0], joint: j.id, value: shown, txText: txText(X.T) });
    decisions.push({ at: j.id, kind: 'joint', chose: `${j.kind} at ${shown}`, alternatives: [], reason: why.get(j.id) ?? (!j.tree ? 'solved: closes a loop' : mobility.left === 0 && assembled ? 'solved from the drives' : 'first limit (default pose)') });
  }
  for (const m of meshes) checkMesh(m, S, diagnostics, decisions);
  for (const [id, x] of comp) {
    for (const b of x.res.state.bodies) placements[`${id}/${b.id}`] = x.T;
    if (!occurrences.find(oc => oc.id === id)) occurrences.unshift({ id, ground: id === groundId, txText: txText(x.T) });
  }
  // a pose with other joint values (the print pose), solved from this one
  const solvePose = pose => {
    const home = S.pose, homeDrives = new Map(S.drives);
    for (const [id, v] of Object.entries(pose)) if (S.jointById.has(id)) S.drives.set(id, rad(v));
    S.solve();
    const Tp = S.transforms(), out = new Map([...comp.keys()].map((id, i) => [id, Tp[i]]));
    S.pose = home; S.drives = homeDrives;
    return out;
  };
  const studyRows = Object.fromEntries(Object.entries(studies).map(([k, v]) => [k, { ...v, rows: v.rows.map(r => ({ ...r })) }]));
  if (forceCtx?.redundantNote && mobility.redundant > 0) diagnostics.push({ level: 'info', kind: 'asm.forcesSplit', at: mobility.redundantJoints[0] ?? 'joints', message: `${mobility.redundant} joint equation(s) repeat: how ${mobility.redundantJoints.join(', ')} share the load along them is not fixed by statics; the least split is reported`, fix: 'a stress study of the parts that share it (bonded, with their stiffness) settles the split' });
  const mech = { dyn: dynLive, forces: forceCtx ? { gravity: forceCtx.g, masses: forceCtx.table, speed: o.speed ? { joint: o.speed.joint, rate: forceCtx.rate(o.speed.joint) } : null } : null, couples: S.couples.map(c => ({ id: c.id, a: c.a, b: c.b, ratio: c.ratio, offset: c.offset, kind: meshes.find(m => m.c.id === c.id)?.kind ?? 'joint' })), mobility, assembled, conflicts, residual, joints: jv, measures: measured, studies: studyRows, reports, drives: Object.fromEntries([...S.drives].map(([k, v]) => [k, v])), solver: S,
    ports: S.portFrames(), origins: Object.fromEntries(S.bodies.map((b) => [b.id, b.t.slice()])), ground: S.bodies.filter((b) => b.ground).map((b) => b.id) };
  // print-in-place / interference: minimum gap between components, at the print pose when one is given.
  // Bounding boxes rule out far pairs; small bodies get the exact B-rep distance; large ones (gears) a mesh
  // distance unless { exact: true } (printInPlace or interference options) asks for B-rep everywhere.
  // explicit only: .interference(), printInPlace(ids, { check: true }) or compile option interference
  // (an interference check over a study replaces the one at this pose)
  if ((o.interference && !o.interference.study) || o.pip?.check || opts.interference) {
    const ti = performance.now();
    const Tpose = o.pip?.pose && !opts.forPrint && Object.keys(o.pip.pose).some(k => values[k] !== undefined) ? solvePose(o.pip.pose) : null;
    const Tof = (id, X) => Tpose?.get(id) ?? X.T;
    const ids = o.interference?.ids ?? o.pip?.ids ?? [...comp.keys()];
    const clearance = o.pip?.clearance && typeof o.pip.clearance !== 'string' ? num(o.pip.clearance) : 0.4;
    const exact = !!(o.pip?.exact || o.interference?.exact || opts.interference === 'exact');
    let nExact = 0, nMesh = 0, nBox = 0;
    for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) {
      const A = comp.get(ids[i]), B = comp.get(ids[k]); if (!A || !B) continue;
      const TA = Tof(ids[i], A), TB = Tof(ids[k], B);
      let gap = Infinity, how = 'exact';
      for (const a of A.res.state.bodies) for (const b of B.res.state.bodies) {
        const ba = worldBox(a.bbox(), TA), bb = worldBox(b.bbox(), TB);
        const boxGap = Math.hypot(...[0, 1, 2].map(d => Math.max(0, ba[0][d] - bb[1][d], bb[0][d] - ba[1][d])));
        if (boxGap > 2 * clearance + 1) { nBox++; if (boxGap < gap) { gap = boxGap; how = 'box'; } continue; }
        const freeform = x => x.names.some((_, i) => !['plane', 'cylinder', 'cone', 'sphere', 'torus'].includes(x.faceInfo(i).kind));
        if (exact || (a.nFaces + b.nFaces <= 400 && !freeform(a) && !freeform(b))) {
          nExact++;
          const sa = K.transformShape(a.shape, TA), sb = K.transformShape(b.shape, TB);
          try { const d = K.distance(sa, sb); const g = d.inner ? 0 : d.value; if (g < gap) { gap = g; how = 'exact'; } } finally { sa.delete(); sb.delete(); }
        } else {
          nMesh++;
          const g = meshGap(meshTris(meshBody(a), TA), meshTris(meshBody(b), TB), 2 * clearance + 1);
          if (g < gap) { gap = g; how = 'mesh'; }
        }
      }
      const tag = `${ids[i]}–${ids[k]}`;
      const shown = !Number.isFinite(gap) ? '∞ mm' : how === 'box' ? `≥ ${gap.toFixed(1)} mm` : how === 'mesh' ? `≈ ${gap.toFixed(3)} mm` : `${gap.toFixed(3)} mm`;
      if (gap < 1e-6) diagnostics.push({ level: 'error', kind: 'asm.interference', at: tag, message: `${ids[i]} and ${ids[k]} touch or overlap${Tpose ? ' in the print pose' : ''}`, fix: o.pip ? `leave a ${clearance} mm gap (fit class printInPlace)` : 'move them apart, or take material off one of them (a smaller radius, a chamfer, a clearance cut)' });
      else if (o.pip && gap < clearance - (how === 'mesh' ? 0.02 : 1e-6)) diagnostics.push({ level: 'warning', kind: 'asm.interference', at: tag, message: `gap ${shown} < print-in-place clearance ${clearance} mm`, fix: `increase the gap to ${clearance} mm` });
      decisions.push({ at: tag, kind: 'gap', chose: shown, alternatives: [], reason: `minimum distance between components${Tpose ? ' in the print pose' : ''}${how === 'mesh' ? ' (display meshes; { exact: true } for the B-rep distance)' : how === 'box' ? ' (bounding boxes apart)' : ''}` });
    }
    trace.push({ pass: 'interference', level: 'L5', ms: performance.now() - ti, cached: false, note: `${nExact} exact, ${nMesh} mesh, ${nBox} box-separated pairs${Tpose ? '; print pose' : ''}` });
  }
  return { parts, placements, occurrences, diagnostics, decisions, trace, comp, groundId, mech };
}
// a joint value: a number (rad or mm), a quantity, or quantity text such as '90 deg' (an override typed in the params view)
const num = v => { if (typeof v === 'number') return v; if (typeof v === 'string') { try { return quantity(v).value; } catch { return NaN; } } return v?.value ?? Number(v); };
const worldBox = (bb, T) => K.bboxUnion([[0, 1].flatMap(i => [0, 1].flatMap(j => [0, 1].map(k => K.matApply(T, [bb[i][0], bb[j][1], bb[k][2]]))))].map(ps => [[0, 1, 2].map(d => Math.min(...ps.map(p => p[d]))), [0, 1, 2].map(d => Math.max(...ps.map(p => p[d])))]));
// a component's `at`: a transform or frame, possibly with param expressions (resolved over the part's params)
function atMatrix(res, at) {
  if (at?.kind !== 'deferred') return matOf(at);
  const d = resolveInPart(res, at, 'frame');
  if (d?.m instanceof Float64Array || d?.constructor?.name === 'Transform') return matOf(d);
  const f = frameOf(d); return f ? K.frameMatrix(f) : K.IDENTITY.slice();
}
const txText = m => K.isIdentity(m) ? 'identity' : `move(${[m[12], m[13], m[14]].map(v => +v.toFixed(3)).join(', ')})${Math.abs(m[0] - 1) > 1e-9 || Math.abs(m[5] - 1) > 1e-9 ? ' · rotated' : ''}`;
function portMatrix(x, name, diagnostics, at) {
  if (!name) return K.IDENTITY;
  const port = x.c.item.meta.ports.find(p => p.name === name);
  if (!port) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at, message: `component '${x.c.id}' has no port '${name}'` }); return K.IDENTITY; }
  try {
    const f = frameOf(port.frame) ?? frameOf(resolveInPart(x.res, port.frame, 'frame'));
    return K.frameMatrix(f);
  } catch (e) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at, message: `port ${x.c.id}:${name}: ${e.message}` }); return K.IDENTITY; }
}

const compOf = ref => String(ref).split(':')[0];
const ifrStudies = ifr => ifr?.study ?? null;
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vadd = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

// j.couple.gear / rack / belt → the joints that turn the two components and value(jb) = ratio · value(ja) + offset.
// The gear on a joint's b side turns by +value about the joint axis (its a port's z), on the a side by −value;
// an external mesh turns the pair in opposite senses (internal and belt: the same), so with axes nA, nB:
//   ratio = k · zA/zB · sA · sB · sign(nA · nB),  k = −1 external, +1 internal or belt.
// A rack moves with the pinion's pitch point: ds/dθ = sP · sR · (nP × (P − C)) · d, P the pitch-line point nearest
// the pinion centre C and d the slider axis.
function resolveGearCouple(c, S, comp, diagnostics) {
  const sp = c.spec, kind = sp.couple, at = c.id;
  const fail = (message, fix) => { diagnostics.push({ level: 'error', kind: 'asm.couple', at, message, fix }); return null; };
  if (!['gear', 'rack', 'belt'].includes(kind)) return fail(`unknown coupling '${kind}'`, 'j.couple.gear, j.couple.rack or j.couple.belt');
  const rigidGroup = bi => {
    const g = new Set([bi]);
    for (let grew = true; grew;) { grew = false; for (const jn of S.joints) if ((jn.kind === 'rigid' || jn.kind === 'snap') && g.has(jn.A.bi) !== g.has(jn.B.bi)) { g.add(g.has(jn.A.bi) ? jn.B.bi : jn.A.bi); grew = true; } }
    return g;
  };
  // the joint that turns (or slides) a component, through any rigid joints to its shaft
  const turning = (id, kinds, named) => {
    const bi = S.index.get(id);
    if (bi == null) return { err: `no component '${id}'` };
    const g = rigidGroup(bi);
    if ([...g].some(i => S.bodies[i].ground)) return { err: `${id} is fixed (it is the ground, or joined rigidly to it)` };
    const cands = named ? [S.jointById.get(named)].filter(Boolean) : S.joints.filter(jn => kinds.includes(jn.kind) && g.has(jn.A.bi) !== g.has(jn.B.bi));
    if (named && (!cands.length || !kinds.includes(cands[0].kind) || g.has(cands[0].A.bi) === g.has(cands[0].B.bi))) return { err: `joint '${named}' is not a ${kinds.join(' or ')} joint carrying ${id}` };
    if (cands.length !== 1) return cands.length ? { err: `${id} turns on ${cands.length} joints (${cands.map(jn => jn.id).join(', ')})`, fix: `name them: j.couple.${kind}(a, b, { joints: ['${cands[0].id}', …] })` } : { err: `no ${kinds.join(' or ')} joint turns ${id}`, fix: `join ${id} (or its shaft) to the frame with a ${kinds[0]} joint` };
    const jn = cands[0], onB = g.has(jn.B.bi);
    return { jn, s: onB ? 1 : -1, carrier: onB ? jn.A.bi : jn.B.bi };
  };
  let ida = compOf(sp.a), idb = compOf(sp.b);
  const spec = id => comp.get(id)?.c.item?.meta?.sets?.gear ?? null;
  if (kind === 'rack' && spec(ida)?.kind === 'rack') [ida, idb] = [idb, ida];
  const GA = spec(ida), GB = spec(idb);
  const rot = ['revolute', 'cylindrical'];
  const TA = turning(ida, rot, sp.joints?.[0]), TB = turning(idb, kind === 'rack' ? ['slider'] : rot, sp.joints?.[1]);
  for (const T of [TA, TB]) if (T.err) return fail(`${kind} ${ida}–${idb}: ${T.err}`, T.fix);
  const sameCarrier = rigidGroup(TA.carrier).has(TB.carrier) || (S.bodies[TA.carrier].ground && S.bodies[TB.carrier].ground);
  if (!sameCarrier) return fail(`${kind} ${ida}–${idb}: the two joints are on different bodies (${S.bodies[TA.carrier].id}, ${S.bodies[TB.carrier].id}); the ratio between joint values holds only on one carrier`, 'for a planet on a turning arm, couple the joint values yourself: couple(id, jointA, jointB, { ratio })');
  const wa = S.world(TA.jn.A), nA = wa.Z;
  if (kind === 'rack') {
    if (GB && GB.kind !== 'rack') return fail(`rack ${idb}–${ida}: ${idb} is a ${GB.kind} gear, not a rack`, 'j.couple.gear(a, b) for two wheels');
    const P0 = S.port(`${idb}:pitch`);
    if (!P0) return fail(`rack ${idb}: no 'pitch' port (the pitch line, along its x)`, `j.lib.gear.rack gives one; or .port('pitch', { origin, x: along the rack, z })`);
    const w = S.world(P0), C = wa.P, P = vadd(w.P, w.X, vdot(vsub(C, w.P), w.X)), d = S.world(TB.jn.A).Z;
    const ratio = TA.s * TB.s * vdot(vcross(nA, vsub(P, C)), d);
    return { kind, c, ja: TA.jn, jb: TB.jn, ratio, offset: num(sp.offset ?? 0), ida, idb, GA, GB, rackPort: P0 };
  }
  const nB = S.world(TB.jn.A).Z, par = vdot(nA, nB);
  if (Math.abs(par) < 1 - 1e-6) return fail(`${kind} ${ida}–${idb}: the axes are not parallel (${(Math.acos(Math.min(1, Math.abs(par))) * 180 / Math.PI).toFixed(2)}° apart)`, 'bevel and crossed-axis gears are not supported; check the ports');
  let mag;
  if (sp.ratio != null) mag = Math.abs(num(sp.ratio));
  else if (GA?.teeth && GB?.teeth) mag = GA.teeth / GB.teeth;
  else return fail(`${kind} ${ida}–${idb}: ${!GA?.teeth ? ida : idb} has no teeth to count`, `give the ratio: j.couple.${kind}(a, b, { ratio })`);
  const internal = !!(GA?.internal || GB?.internal), k = kind === 'belt' ? (sp.crossed ? -1 : 1) : internal ? 1 : -1;
  return { kind, c, ja: TA.jn, jb: TB.jn, ratio: k * mag * TA.s * TB.s * Math.sign(par), offset: num(sp.offset ?? 0), ida, idb, GA, GB, internal, mag };
}
// at the solved pose: centre distance (or pitch-line distance) against the gears' own meshing report
function checkMesh(m, S, diagnostics, decisions) {
  const at = m.c.id, wa = S.world(m.ja.A), C = wa.P, n = wa.Z;
  const perp = v => { const k = vdot(v, n); return [v[0] - k * n[0], v[1] - k * n[1], v[2] - k * n[2]]; };
  const len = v => Math.hypot(...v);
  if (m.kind === 'rack') {
    const w = S.world(m.rackPort), P = vadd(w.P, w.X, vdot(vsub(C, w.P), w.X)), dist = len(perp(vsub(P, C)));
    let want = null;
    if (m.GA && m.GB) { const rep = meshReport(m.GA, m.GB); want = rep.pitchLineDistance; if (Math.abs(dist - want) > 0.01) diagnostics.push({ level: 'warning', kind: 'asm.gearMesh', at, message: `the rack's pitch line is ${dist.toFixed(3)} mm from ${m.ida}'s axis; the mesh wants ${want.toFixed(3)} mm`, fix: `move the slider ${(want - dist).toFixed(3)} mm` }); }
    if (Math.abs(vdot(w.X, S.world(m.jb.A).Z)) < 0.999) diagnostics.push({ level: 'warning', kind: 'asm.gearMesh', at, message: `the rack ${m.idb} runs at an angle to its slider ${m.jb.id}`, fix: "align the rack's pitch port x with the slider axis" });
    decisions.push({ at, kind: 'couple', chose: `${m.jb.id} = ${+m.ratio.toFixed(6)} mm/rad · ${m.ja.id}${m.offset ? ` + ${+m.offset.toFixed(6)} mm` : ''}`, alternatives: [], reason: `${m.idb} on ${m.ida}'s pitch circle (${(Math.abs(m.ratio) * 2 * Math.PI).toFixed(3)} mm per turn); pitch line ${dist.toFixed(3)} mm from the axis${want != null ? `, wants ${want.toFixed(3)}` : ''}` });
    return;
  }
  const Cb = S.world(m.jb.A).P, d = len(perp(vsub(Cb, C)));
  let want = null;
  if (m.kind === 'gear' && m.GA && m.GB) {
    const rep = meshReport(m.GA, m.GB, { centreDistance: d });
    want = rep.centreDistance;
    const bad = rep.messages.filter(x => !/undercut/.test(x));
    if (bad.length) diagnostics.push({ level: 'warning', kind: 'asm.gearMesh', at, message: `${m.ida}–${m.idb}: ${bad.join('; ')}`, fix: Math.abs(d - want) > 0.01 ? `put the axes ${want.toFixed(3)} mm apart` : undefined });
  }
  const zs = m.GA?.teeth && m.GB?.teeth ? `${m.GA.teeth}:${m.GB.teeth} teeth, ` : '';
  decisions.push({ at, kind: 'couple', chose: `${m.jb.id} = ${+m.ratio.toFixed(9)} · ${m.ja.id}${m.offset ? ` + ${+(m.offset * 180 / Math.PI).toFixed(6)}°` : ''}`, alternatives: [],
    reason: `${zs}${m.kind === 'belt' ? 'belt' : m.internal ? 'internal mesh' : 'external mesh'}; axes ${d.toFixed(3)} mm apart${want != null ? ` (the mesh wants ${want.toFixed(3)})` : ''}` });
}

// interference over a study: at every sampled pose, the gap between each pair (display meshes, or the B-rep
// distance with { exact: true }), and where they overlap the shared volume V(a ∩ b) = V(a) + V(b) − V(a ∪ b)
function studyClearance(res, poses, comp, ifr, diagnostics, decisions) {
  const order = [...comp.keys()], ids = ifr.ids ?? order;
  const pairs = ifr.pairs ?? ids.flatMap((a, i) => ids.slice(i + 1).map(b => [a, b]));
  const within = ifr.within != null ? num(ifr.within) : 5, n = res.rows.length, every = ifr.every ?? Math.max(1, Math.ceil(n / 180));
  const sample = [...new Set([...Array.from({ length: Math.ceil(n / every) }, (_, i) => i * every), n - 1])].filter(k => res.rows[k]?.ok && poses[k]);
  const out = [], u = res.unit, f1 = x => `${+x.toFixed(1)}${u}`;
  let booleans = 0;
  for (const [ia, ib] of pairs) {
    const A = comp.get(ia), B = comp.get(ib);
    if (!A || !B) { diagnostics.push({ level: 'error', kind: 'asm.interference', at: res.name, message: `interference: no component '${!A ? ia : ib}'` }); continue; }
    const iA = order.indexOf(ia), iB = order.indexOf(ib), key = `gap ${ia}–${ib}`, vkey = `overlap ${ia}–${ib}`;
    let min = null, worst = null;
    const vols = new Map();
    for (const k of sample) {
      const row = res.rows[k], TA = poses[k][iA], TB = poses[k][iB];
      const g = pairGap(A, B, TA, TB, within, !!ifr.exact);
      row[key] = Number.isFinite(g) ? g : null;
      if (Number.isFinite(g) && (!min || g < min.value)) min = { at: row.x, value: g };
      if (g < 1e-6) {
        if (ifr.volume === false) { vols.set(k, NaN); continue; }
        const v = pairOverlap(A, B, TA, TB); booleans++;
        vols.set(k, v);
        if (v > 1e-6 && (!worst || v > worst.volume)) worst = { at: row.x, volume: v };
      }
    }
    const hit = k => vols.has(k) && (Number.isNaN(vols.get(k)) || vols.get(k) > 1e-6);
    const overlaps = [];
    for (let i = 0; i < sample.length; i++) if (hit(sample[i])) { const from = res.rows[sample[i]].x; while (i + 1 < sample.length && hit(sample[i + 1])) i++; overlaps.push([from, res.rows[sample[i]].x]); }
    const withVol = overlaps.length && ifr.volume !== false;
    if (withVol) for (const k of sample) res.rows[k][vkey] = vols.get(k) ?? 0;
    for (const kk of withVol ? [key, vkey] : [key]) { res.keys.push(kk); res.extrema[kk] = extremaOf(res.rows, kk); }
    const tag = `${ia}–${ib}`, span = ([a, b]) => (a === b ? `at ${f1(a)}` : `from ${f1(a)} to ${f1(b)}`);
    // a warning, not an error: the assembly compiled, and the views must show the poses where it collides
    if (overlaps.length) diagnostics.push({ level: 'warning', kind: 'asm.interference', at: tag, message: `${ia} and ${ib} overlap ${overlaps.map(span).join(', ')} in study ${res.name}${worst ? ` (worst ${worst.volume.toFixed(3)} mm³ at ${f1(worst.at)})` : ''}`, fix: 'take material off one of them where they meet, or keep the joint out of that range' });
    else if (min && min.value < 1e-6) diagnostics.push({ level: 'warning', kind: 'asm.interference', at: tag, message: `${ia} and ${ib} touch at ${f1(min.at)} in study ${res.name}`, fix: 'leave a gap' });
    else if (ifr.clearance != null && min && min.value < num(ifr.clearance)) diagnostics.push({ level: 'warning', kind: 'asm.interference', at: tag, message: `${ia} and ${ib} come within ${min.value.toFixed(3)} mm at ${f1(min.at)} in study ${res.name}, under the clearance ${num(ifr.clearance)} mm`, fix: `open the gap to ${num(ifr.clearance)} mm` });
    decisions.push({ at: `${res.name}:${tag}`, kind: 'gap', chose: min ? `${ifr.exact ? '' : '≈ '}${min.value.toFixed(3)} mm at ${f1(min.at)}` : `≥ ${within} mm`, alternatives: [],
      reason: `closest approach over ${sample.length} poses of study ${res.name}${ifr.exact ? '' : ' (display meshes; { exact: true } for the B-rep distance)'}${overlaps.length ? `; overlapping ${overlaps.map(span).join(', ')}` : ''}` });
    out.push({ a: ia, b: ib, key, volumeKey: withVol ? vkey : null, samples: sample.length, every, within, min, worst, overlaps });
  }
  return { pairs: out, samples: sample.length, booleans };
}
function extremaOf(rows, name) {
  const ok = rows.filter(r => r.ok && typeof r[name] === 'number'); if (!ok.length) return null;
  let lo = ok[0], hi = ok[0]; for (const r of ok) { if (r[name] < lo[name]) lo = r; if (r[name] > hi[name]) hi = r; }
  return { min: { at: lo.x, value: lo[name] }, max: { at: hi.x, value: hi[name] } };
}
const boxGapOf = (ba, bb) => Math.hypot(...[0, 1, 2].map(d => Math.max(0, ba[0][d] - bb[1][d], bb[0][d] - ba[1][d])));
function pairGap(A, B, TA, TB, within, exact) {
  let gap = Infinity;
  for (const a of A.res.state.bodies) for (const b of B.res.state.bodies) {
    if (boxGapOf(worldBox(a.bbox(), TA), worldBox(b.bbox(), TB)) > within) continue;
    let g;
    if (exact) { const sa = K.transformShape(a.shape, TA), sb = K.transformShape(b.shape, TB); try { const d = K.distance(sa, sb); g = d.inner ? 0 : d.value; } finally { sa.delete(); sb.delete(); } }
    else g = meshGapNear(meshTris(meshBody(a), TA), meshTris(meshBody(b), TB), within);
    if (g < gap) gap = g;
  }
  return gap;
}
function pairOverlap(A, B, TA, TB) {
  let v = 0;
  for (const a of A.res.state.bodies) for (const b of B.res.state.bodies) {
    if (boxGapOf(worldBox(a.bbox(), TA), worldBox(b.bbox(), TB)) > 0) continue;
    const sa = K.transformShape(a.shape, TA), sb = K.transformShape(b.shape, TB);
    try { v += K.commonVolume(sa, sb); } finally { sa.delete(); sb.delete(); }
  }
  return v;
}

// ── forces (spec v0.2, layer 5) ─────────────────────────────────────────────────────────────────────────────────
const r6 = (x) => +x.toPrecision(6);
// gravity reads as a stress study's does (vectors.js): '-Z' is 1 g, [x, y, z] a vector in g; false leaves it out
function gDir(v) {
  if (v === false || v === null) return null;
  if (v === undefined) return [0, 0, -G0];
  return acceleration(v, { what: 'gravity' });
}
// masses from the parts (each component's bodies, in its own frame) and their materials; the drive rates; wrenches
function forceSetup(S, comp, o, diagnostics, decisions) {
  const masses = new Map(), table = [];
  const ids = [...comp.keys()];
  ids.forEach((id, i) => {
    const X = comp.get(id), bi = S.index.get(id);
    if (bi == null || S.bodies[bi].ground) return;
    const named = X.c.item.meta?.material;
    const mat = materialOf(named ?? 'PLA');
    if (!named) decisions.push({ at: id, kind: 'mass', chose: `${mat.name} (${mat.density} g/cm³)`, alternatives: [], reason: `${X.c.item.name} names no material: .material(j.material('steel')) on the part` });
    const mp = massProps(X.res.state.bodies.map((b) => meshBody(b)), mat.density * 1e-9);
    masses.set(bi, mp);
    table.push({ id, material: mat.name, mass: r6(mp.mass * 1e6), c: mp.c.map(r6) });   // grams
  });
  const g = gDir(o.gravity);
  decisions.push({ at: 'forces', kind: 'gravity', chose: g ? `[${g.map((x) => +(x / G0).toFixed(4))}] g` : 'none', alternatives: [], reason: o.gravity === undefined ? 'jig’s +Z is up; .gravity(false) leaves weight out' : 'set by .gravity()' });
  const num = (v) => (isQuantity(v) ? v.value : Number(v));
  const rate = (drive) => (o.speed && o.speed.joint === drive ? num(o.speed.value) : null);
  const wrenches = (o.wrenches ?? []).map((w) => {
    const [cid, pname] = String(w.ref).split(':'), bi = S.index.get(cid);
    if (bi == null) { diagnostics.push({ level: 'error', kind: 'asm.wrench', at: w.ref, message: `wrench: no component '${cid}'` }); return null; }
    const P = pname ? S.port(`${cid}:${pname}`) : null;
    if (pname && !P) { diagnostics.push({ level: 'error', kind: 'asm.wrench', at: w.ref, message: `wrench: ${cid} has no port '${pname}'` }); return null; }
    return { ...w, bi, comp: cid, port: pname ?? null, point: w.at ? w.at.map(Number) : P ? P.o : [0, 0, 0] };
  }).filter(Boolean);
  return { masses, table, g, rate, wrenches, redundantNote: true };
}
const N3 = (v) => (v == null ? null : force(v, { what: 'wrench force' }));
const NMM3 = (v) => (v == null ? [0, 0, 0] : moment(v, { what: 'wrench moment' }));
// one sampled pose: wrench lambdas read the row, then kinematics (when the drive has a speed) and the reactions
function forceRow(S, F, drive, row) {
  const rate = F.rate(drive);
  const kin = rate ? kinematics(S, drive, rate, F.masses) : null;
  const wr = [];
  for (const w of F.wrenches) {
    let v; try { v = typeof w.fn === 'function' ? w.fn(row) : w.fn; } catch (e) { v = null; }
    if (v == null || v === false) continue;
    const arr = Array.isArray(v), F3 = arr ? N3(v) : N3(v.force) ?? [0, 0, 0], M3 = NMM3(arr ? w.moment : v.moment);
    wr.push({ bi: w.bi, comp: w.comp, port: w.port, label: w.label, point: w.point, force: F3, moment: M3 });
  }
  const r = jointReactions(S, { masses: F.masses, kin, gravity: F.g, wrenches: wr });
  const readings = {};
  for (const [id, x] of Object.entries(r.joints)) readings[`F:${id}`] = magnitude(x.F);
  for (const [id, t] of Object.entries(r.drives)) readings[`T:${id}`] = t;
  return { readings, joints: r.joints, drives: r.drives, couples: r.couples, kin, wrenches: wr, residual: r.residual, R: S.bodies.map((b) => b.R.map((x) => x.slice())), t: S.bodies.map((b) => b.t.slice()) };
}

// The loads one component carries at one pose: the wrench each of its joints puts on it (moved into its own frame),
// the wrenches applied to it, and its weight and inertia as a body load. One seat is held (the support a stress
// study needs): the one named, else the joint toward the ground, else the most loaded.
function loadCaseOf(asm, from, opts, h) {
  const cid = from.component;
  if (!cid) throw Object.assign(new Error('name the component to study: .from(asm, { component: \'link\' })'), {});
  const studyName = from.study ?? asm.o.studies?.[0]?.name;
  if (!studyName) throw new Error('the assembly has no study to take a pose from: asm.study(\'cycle\', { drive, from, to, steps })');
  const withForces = (asm.o.reactions ?? []).some((r) => r.study == null || r.study === studyName) ? asm : asm.reactions(studyName);
  const t0 = performance.now();
  const prog = compileAssembly(withForces, { ...opts, mesh: false }, h);
  const errs = prog.data.diagnostics.filter((d) => d.level === 'error');
  if (errs.length) throw new Error(`the assembly does not compile: ${errs[0].message}`);
  const mech = prog.P.mech, S = mech.solver, dyn = mech.dyn[studyName];
  if (!dyn) throw new Error(`no study '${studyName}'`);
  const X = prog.P.comp.get(cid), bi = S.index.get(cid);
  if (!X || bi == null) throw new Error(`no component '${cid}' (the assembly has ${[...prog.P.comp.keys()].join(', ')})`);
  if (S.bodies[bi].ground) throw new Error(`${cid} is the ground: it carries no reaction of its own; study a moving component`);
  const st = mech.studies[studyName], rows = st.rows;
  const mine = S.joints.filter((jn) => jn.A.bi === bi || jn.B.bi === bi);
  const load = (k) => { const d = dyn[k]; if (!d) return -1; let s = 0; for (const jn of mine) s += magnitude(d.joints[jn.id].F); return s; };
  let k;
  if (from.at == null || from.at === 'worst') { k = 0; let best = -1; for (let i = 0; i < rows.length; i++) { const v = load(i); if (v > best) { best = v; k = i; } } }
  else { const x = isQuantity(from.at) ? (st.unit === 'mm' ? from.at.in('mm') : from.at.in('deg')) : Number(from.at); k = rows.reduce((b, r, i) => (dyn[i] && Math.abs(r.x - x) < Math.abs(rows[b].x - x) ? i : b), rows.findIndex((r, i) => dyn[i])); }
  const d = dyn[k];
  if (!d) throw new Error(`study ${studyName} reached no pose to take loads from`);
  const R = d.R[bi], t = d.t[bi], RT = [0, 1, 2].map((i) => [R[0][i], R[1][i], R[2][i]]);
  const toLocalV = (v) => [0, 1, 2].map((i) => RT[i][0] * v[0] + RT[i][1] * v[1] + RT[i][2] * v[2]);
  const toLocalP = (p) => toLocalV([p[0] - t[0], p[1] - t[1], p[2] - t[2]]);
  const vsub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vcr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // the seat to hold: named, else the joint toward the ground in the placement tree, else the most loaded
  const parent = S.treeEdges?.find((e) => e.child === bi)?.id;
  let held = from.hold ? mine.find((jn) => (jn.A.bi === bi ? jn.A.name : jn.B.name) === from.hold)?.id : parent ?? null;
  if (from.hold && !held) throw new Error(`hold: ${cid} has no joint at a port '${from.hold}' (its ports: ${mine.map((jn) => (jn.A.bi === bi ? jn.A.name : jn.B.name)).join(', ')})`);
  if (!held && mine.length) held = mine.reduce((b, jn) => (magnitude(d.joints[jn.id].F) > magnitude(d.joints[b.id].F) ? jn : b)).id;
  const seats = [];
  for (const jn of mine) {
    const onB = jn.B.bi === bi, P = onB ? jn.B : jn.A, w = d.joints[jn.id];
    const F = onB ? w.F : w.A.F, Mb = onB ? w.M : w.A.M;
    const Pw = [R[0][0] * P.o[0] + R[0][1] * P.o[1] + R[0][2] * P.o[2] + t[0], R[1][0] * P.o[0] + R[1][1] * P.o[1] + R[1][2] * P.o[2] + t[1], R[2][0] * P.o[0] + R[2][1] * P.o[1] + R[2][2] * P.o[2] + t[2]];
    const M = vsub3(Mb, vcr(vsub3(Pw, w.at), F));   // the moment about this side's own port origin
    seats.push({ port: P.name, joint: jn.id, kind: jn.kind, force: toLocalV(F), moment: toLocalV(M), point: P.o.slice(), local: { o: P.o, z: P.z }, held: jn.id === held, bearing: jn.kind === 'revolute' || jn.kind === 'cylindrical', faces: from.faces?.[P.name] ?? null });
  }
  for (const w of d.wrenches.filter((x) => x.bi === bi)) {
    const P = w.port ? S.port(`${cid}:${w.port}`) : null;
    seats.push({ port: w.port ?? `at [${w.point}]`, joint: w.label, kind: 'wrench', force: toLocalV(w.force), moment: toLocalV(w.moment), point: w.point, local: { o: w.point, z: P?.z ?? [0, 0, 1] }, held: false, bearing: false, faces: (w.port && from.faces?.[w.port]) ?? null });
  }
  const mp = mech.solver && prog.P.mech && (forceMass(S, prog.P.comp, cid));
  const kin = d.kin?.[bi];
  const g = st.gravity ?? null;
  const body = { c: mp?.c ?? [0, 0, 0], a0: kin ? toLocalV(kin.a) : [0, 0, 0], alpha: kin ? toLocalV(kin.al) : [0, 0, 0], omega: kin ? toLocalV(kin.w) : [0, 0, 0], g: g ? toLocalV(g) : [0, 0, 0] };
  const pose = { study: studyName, row: k, x: rows[k].x, unit: st.unit, rate: st.rate ?? null, held, component: cid };
  const decisions = [{ at: `${cid}@${studyName}`, kind: 'pose', chose: `${+rows[k].x.toFixed(3)}${st.unit} of ${studyName}`, alternatives: [], reason: from.at == null || from.at === 'worst' ? `the pose where ${cid}'s joints carry the most (Σ|F| ${load(k).toFixed(3)} N)` : 'named by at' },
    { at: `${cid}@${studyName}`, kind: 'support', chose: `seat ${seats.find((x) => x.held)?.port ?? '—'} held`, alternatives: seats.filter((x) => !x.held && x.kind !== 'wrench').map((x) => x.port), reason: from.hold ? 'named by hold' : parent ? 'the joint toward the ground; its reaction is what the others and the inertia leave' : 'the most loaded joint' }];
  return { part: X.c.item, material: X.c.item.meta?.material ?? null, seats, body, pose, diagnostics: [], decisions, trace: [{ pass: `loads:${cid}`, level: 'L5', ms: performance.now() - t0, cached: false, note: `${seats.length} seats at ${+rows[k].x.toFixed(2)}${st.unit} of ${studyName}` }] };
}
function forceMass(S, comp, cid) {
  const X = comp.get(cid), mat = materialOf(X.c.item.meta?.material ?? 'PLA');
  return massProps(X.res.state.bodies.map((b) => meshBody(b)), mat.density * 1e-9);
}
