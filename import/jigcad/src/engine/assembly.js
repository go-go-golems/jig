// Assemblies (README §4.10): components placed by transforms or joints between ports, grounding,
// rigid/revolute/slider joints as placement constraints, print-in-place gap checks, BOM, mobility.
import * as K from './kernel.js';
import { callerLine } from './part.js';
import { frameOf, matOf, orthoFrame } from './adapt.js';
import { mobility, meshGap, meshGapNear, meshTris } from './inspect.js';
import { meshBody } from './mesh.js';
import { resolveInPart, selectInPart } from './compile.js';
import { isDeferred, Deferred } from './geom.js';
import { Selector } from './select.js';
import { MechanismSolver, runStudy, studyApi, equationCount, COORDS, coordKey } from './mechanism.js';
import { q as quantity } from './units.js';
import { toKine } from './kine.js';
import { gearSpecOf, meshReport } from './gears.js';

const V = K.V;
const DOF = { rigid: 0, revolute: 1, slider: 1, cylindrical: 2, pinSlot: 2, planar: 3, ball: 3, snap: 0 };
const GROUP = { rigid: '{e}', revolute: 'SO(2)', slider: 'ℝ', cylindrical: 'SO(2)×ℝ', pinSlot: 'SO(2)×ℝ (slide ⟂ axis)', planar: 'SE(2)', ball: 'SO(3)', snap: '{e} once engaged' };
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
  // interference(ids?, { study?, pairs?, every?, within?, clearance?, volume?, exact? }): with a study, every
  // sampled pose of it is checked; overlaps report the shared volume V(a ∩ b) = V(a) + V(b) − V(a ∪ b)
  interference(ids, o = {}) { return this._w({ interference: Array.isArray(ids) ? { ...o, ids } : { ...(ids ?? {}) } }); }
  // contact sets (Fusion's term): a drag stops where two of these components would touch; no ids: every component
  contact(ids) { return this._w({ contacts: [...(this.o.contacts ?? []), { ids: Array.isArray(ids) ? ids : null }] }); }
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
  // past the solve, the program reads the assembly only as expanded (eff: a flexible subassembly's joints, drives,
  // readings and contact sets prefixed and merged, the tree of every subassembly): the declaration's own lists are
  // not in scope to be read by mistake, only its name crosses
  return programOf(asm.name, solveAssembly(asm, opts, compilePart), { t0, opts, finalize });
}
function programOf(name, solved, { t0, opts, finalize }) {
  const { parts, placements, occurrences, diagnostics, decisions, trace, comp, groundId, mech, eff } = solved;
  const o = eff.o, subNodes = subassemblyNodes(eff.tree);
  // the count (Grübler–Kutzbach, from the joint kinds alone) and, beside it, what the solver found
  const mob = { ...mobility({ components: [...comp.keys()], joints: mech?.jointRefs ?? [] }), ...(mech?.mobility ?? {}) };
  if (mech?.mobility) { mob.solverDOF = mech.mobility.dof; mob.note = mech.mobility.redundant ? `${mech.mobility.redundant} joint equation(s) repeat the others: ${mech.mobility.redundantJoints.join(', ')} must stay exactly aligned in the real parts` : 'no joint equation repeats another'; }
  const values = new Map((mech?.joints ?? []).map(j => [j.id, j]));
  // every subassembly, a rigid one's nested ones too: the tree is the one record of the product structure
  const subOf = id => subNodes.map(n => n.id).filter(s => id.startsWith(s + '/')).sort((a, b) => b.length - a.length)[0] ?? null;
  const info = { name, hash: null, components: [...comp.keys()].map(id => ({ id, ground: id === groundId, sub: subOf(id) })),
    subassemblies: subNodes.map(S => ({ id: S.id, flexible: S.flexible, root: S.root, fixed: !!comp.get(S.root)?.fixed })),
    joints: o.joints.filter(j => !j.synthetic).map(j => ({ id: j.id, kind: j.kind, a: refText(j.a), b: refText(j.b), limits: limitsOf(j), slideLimits: slideLimitsOf(j), equations: equationCount(j.kind),
      slide: values.get(j.id)?.slide ?? null,
      value: values.get(j.id)?.value ?? null, unit: values.get(j.id)?.unit ?? '', driven: values.get(j.id)?.driven ?? false, tree: values.get(j.id)?.tree ?? false,
      at: values.get(j.id)?.at ?? null, atB: values.get(j.id)?.atB ?? null, axis: values.get(j.id)?.axis ?? null, slideAxis: values.get(j.id)?.slideAxis ?? null })),
    ports: (mech?.ports ?? []).filter(pf => !pf.ref.includes(':@rigid')), origins: mech?.origins ?? {}, fixed: mech?.ground ?? [],
    mobility: mob, assembled: mech?.assembled ?? true, conflicts: mech?.conflicts ?? [], residual: mech?.residual ?? 0,
    drives: mech?.drives ?? {}, couples: mech?.couples ?? [],
    measures: mech?.measures ?? {}, studies: mech?.studies ?? {}, reports: mech?.reports ?? [],
    // the bill of materials nests by subassembly; prog.bom({ group: 'flat' }) lists the parts alone
    bom: bomOf(eff.tree.children) };
  const prog = finalize({ kind: 'assembly', name, parts, t0, opts, assembly: info, occurrences, placements,
    extraDiagnostics: diagnostics, extraDecisions: decisions, extraTrace: trace,
    extraMetrics: { assemblyDOF: { value: mob.solverDOF, unit: 'count', fidelity: 'exact', note: 'mobility 6n − rank J from the joint equations at the solved pose' } } });
  prog.bom = (bo = {}) => (bo.group === 'flat' ? flatBom(info.bom) : info.bom);
  // the product structure (STEP export): parts and subassemblies with their placements now
  prog.structure = () => structureOf(eff.tree, comp, name); prog.dof = () => ({ total: mob.solverDOF, grounded: groundId }); prog.occurrence = id => occurrences.find(x => x.id === id) ?? null;
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
      // contact sets, the expanded assembly's (a flexible subassembly's own come prefixed): the drag walks each step
      // within the clearance, so it stops where a pair would touch, however far the target lies
      const ids = [...comp.keys()];
      const ok = S.drag(ref, to, { guard: contactGuard(comp, ids, o.contacts) });
      const T = S.transforms();
      const out = { ok, transforms: Object.fromEntries(ids.map((id, i) => [id, T[i]])), ports: S.portFrames(), joints: S.jointValues(),
        overrides: Object.fromEntries(S.holds().map(h => [h.id, `${+h.shown.toFixed(4)} ${h.unit}`])), at: S.world(S.port(ref)).P,
        // pinned: the overrides recompile to this pose (false: a joint without coordinates, planar or ball, moved)
        pinned: S.pinned, limits: S.limited ?? [], contacts: S.touched ?? [] };
      if (ok) dragged = S.pose;
      return out;
    } finally { S.pose = home; }
  };
  return prog;
}
// Compile the components and solve the joints (opts.forPrint: joints at the print pose).
// → { parts, placements, occurrences, diagnostics, decisions, trace, comp: Map id → { c, res, T }, groundId }
export function solveAssembly(asm, opts, compilePart) {
  const diagnostics = [], decisions = [], trace = [];
  const placements = {}, occurrences = [];
  // subassemblies flattened: their components under '<sub>/<id>', a flexible one's joints, drives, values and readings
  // with them, a rigid one solved on its own and held together (see expandAssembly)
  const E = expandAssembly(asm, opts, compilePart, diagnostics, { ...(asm.o.params ?? {}), ...(asm.o.overrides ?? {}), ...(opts.override ?? {}) });
  const o = E.o, comp = E.comps, parts = E.parts, groundId = E.groundId, values = E.values;
  // the joints, solved together (mechanism.js). A joint whose value is given (a param or override named by its id,
  // the print pose, or .drive) is driven; any other starts at its first limit, or 0, and is free.
  const rad = v => num(v);
  const portsOf = new Map();                       // component id → { port name → 4×4 }
  for (const pp of E.presetPorts) { const mp = portsOf.get(pp.cid) ?? new Map(); portsOf.set(pp.cid, mp); mp.set(pp.name, pp.m); }
  const wantPort = (cid, pname, at) => {
    const X = comp.get(cid); if (!X || !pname) return;
    const m = portsOf.get(cid) ?? new Map(); portsOf.set(cid, m);
    if (!m.has(pname)) m.set(pname, portMatrix(X, pname, at ? diagnostics : [], at));
  };
  const joints = [];
  // a joint end picked on geometry, or the frame of an as-built joint, becomes a port named '@<joint>.<a|b>'
  const setPort = (cid, pname, m) => { const mp = portsOf.get(cid) ?? new Map(); portsOf.set(cid, mp); mp.set(pname, m); };
  const endFrame = (e, side, jid) => {     // → a 4×4 in the component's own frame, or null (diagnostic pushed)
    const X = comp.get(e.comp);
    if (e.port) { wantPort(e.comp, e.port, jid); return portsOf.get(e.comp)?.get(e.port) ?? null; }
    try {
      const g = geometryFrame(X, e.sel, e.opts, side);
      for (const d of g.diags) diagnostics.push({ ...d, at: jid });
      decisions.push({ at: `${jid}.${side}`, kind: 'port', chose: g.what, alternatives: [], reason: `joint end picked on ${e.comp}: ${g.rule}` });
      return g.m;
    } catch (err) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jid, message: `joint ${jid}: ${err.message}`, fix: err.fix }); return null; }
  };
  for (const jn of o.joints) {
    const ea = parseEnd(jn.a), eb = parseEnd(jn.b);
    const bad = [ea, eb].find(e => e.error);
    if (bad) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jn.id, message: `joint ${jn.id}: ${bad.error}` }); continue; }
    if (!comp.get(ea.comp) || !comp.get(eb.comp)) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jn.id, message: `joint ${jn.id}: unknown component ${!comp.get(ea.comp) ? ea.comp : eb.comp}` }); continue; }
    const asBuilt = jn.asBuilt ?? jn.opts?.asBuilt;
    const before = diagnostics.length;
    let pa = ea.port, pb = eb.port;
    if (asBuilt) {
      // as built (Fusion's As-Built Joint): one joint frame in the world, read where the components already sit
      // (their `at`), so the joint holds at value 0 without moving them
      const eo = asBuilt === true ? null : parseEnd(asBuilt);
      if (eo?.error) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jn.id, message: `joint ${jn.id}: asBuilt: ${eo.error}` }); continue; }
      const src = eo ?? (ea.port || ea.sel ? ea : eb.port || eb.sel ? eb : null);
      if (!src) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jn.id, message: `joint ${jn.id}: an as-built joint needs a frame: a port or geometry on one end, or asBuilt: j.on(…)`, fix: `j.joint.${jn.kind}({ asBuilt: j.on('${ea.comp}', j.sel.faces(…)) })` }); continue; }
      if (!comp.get(src.comp)) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jn.id, message: `joint ${jn.id}: unknown component ${src.comp}` }); continue; }
      const local = endFrame(src, src === eb ? 'b' : 'a', jn.id);
      if (!local || diagnostics.length > before) continue;
      const W = K.matMul(comp.get(src.comp).T0, local);
      pa = `@${jn.id}`; pb = `@${jn.id}`;
      setPort(ea.comp, pa, K.matMul(K.matInverse(comp.get(ea.comp).T0), W));
      setPort(eb.comp, pb, K.matMul(K.matInverse(comp.get(eb.comp).T0), W));
    } else {
      for (const [e, side] of [[ea, 'a'], [eb, 'b']]) {
        if (!e.port && !e.sel) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jn.id, message: `joint ${jn.id}: '${e.comp}' names a component without a port`, fix: `'${e.comp}:<port>', j.on('${e.comp}', selector), or an as-built joint: j.joint.${jn.kind}({ asBuilt: true })` }); continue; }
        if (e.port) { wantPort(e.comp, e.port, jn.id); continue; }
        const m = endFrame(e, side, jn.id); if (!m) continue;
        const name = `@${jn.id}.${side}`; setPort(e.comp, name, m);
        if (side === 'a') pa = name; else pb = name;
      }
      if (diagnostics.length > before) continue;
    }
    joints.push({ id: jn.id, kind: jn.kind, a: `${ea.comp}:${pa}`, b: `${eb.comp}:${pb}`, limits: limitsOf(jn), slideLimits: slideLimitsOf(jn), asBuilt: !!asBuilt, src: jn });
  }
  // every port of every component is readable by measures (resolved lazily; failures stay quiet here)
  for (const [cid, X] of comp) for (const pt of X.c.item.meta?.ports ?? []) wantPort(cid, pt.name, null);
  const jointed = new Set(joints.flatMap(j => [j.a.split(':')[0], j.b.split(':')[0]]));
  // every coordinate of every joint (mechanism.js COORDS: 'h', and 'h.slide' for a two-valued joint) is driven when
  // its value is given (the print pose, a param or override by its key, or .drive) and free otherwise
  const givenFor = (key) => {
    const posed = o.pip?.pose?.[key] !== undefined, usePose = posed && (opts.forPrint || values[key] === undefined);
    if (usePose) return { v: rad(o.pip.pose[key]), why: 'print pose' };
    if (values[key] !== undefined) return { v: rad(values[key]), why: 'override' };
    if (o.drives?.[key] !== undefined) return { v: rad(o.drives[key]), why: 'drive' };
    return null;
  };
  const coordsOf = (j) => (COORDS[j.kind] ?? ['value']).map((part) => ({ part, key: coordKey(j.id, part), limits: part === 'value' ? j.limits : j.slideLimits }));
  const drives = new Map(), seeds = new Map(), why = new Map();
  for (const j of joints) for (const { part, key } of coordsOf(j)) {
    const d = givenFor(key);
    if (d) { drives.set(key, d.v); why.set(key, d.why); }
    else if (part === 'value') seeds.set(j.id, j.asBuilt ? (j.limits ? Math.min(j.limits[1], Math.max(j.limits[0], 0)) : 0) : j.limits ? j.limits[0] : 0);
  }
  // a drive past a joint's limit is held at the limit (as Fusion holds a joint at its motion limit)
  const shownV = (j, part, v) => (part === 'slide' || j.kind === 'slider' ? `${+v.toFixed(3)} mm` : `${+(v * 180 / Math.PI).toFixed(3)}°`);
  for (const j of joints) for (const { part, key, limits } of coordsOf(j)) {
    const d = drives.get(key); if (d == null || !limits) continue;
    const [lo, hi] = limits, c = Math.min(hi, Math.max(lo, d));
    if (Math.abs(c - d) > 1e-9) { drives.set(key, c); diagnostics.push({ level: 'warning', kind: 'asm.limit', at: key, message: `${key} is driven to ${shownV(j, part, d)}, past its limit ${shownV(j, part, c)}: held at the limit`, fix: 'drive it inside its limits, or widen them' }); }
  }
  for (const c of o.couples ?? []) if (c.unsupported) diagnostics.push({ level: 'error', kind: 'asm.couple', at: c.at ? `line ${c.at}` : 'couple', message: 'couple takes (id, jointA, jointB, { ratio, offset }) or a coupling between gears: j.couple.gear(a, b), j.couple.rack(rack, pinion), j.couple.belt(a, b)' });
  const S = new MechanismSolver({
    bodies: [...comp].map(([id, x]) => ({ id, ground: id === groundId || !!x.fixed || (x.c.opts.at != null && !jointed.has(id)), T0: x.T0, ports: Object.fromEntries(portsOf.get(id) ?? []) })),
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
    // the pose closes but puts a joint past its limit (a loop joint, or a start value the hints chose)
    for (const v of S.limitViolations()) {
      const show = x => (v.part === 'slide' || v.jn.kind === 'slider' ? `${+x.toFixed(3)} mm` : `${+(x * 180 / Math.PI).toFixed(2)}°`);
      diagnostics.push({ level: 'warning', kind: 'asm.limit', at: v.id, message: `${v.id}${v.part === 'slide' ? ' slides' : ' sits'} at ${show(v.value)}, past its limit ${show(v.bound)}`, fix: 'move the drive, hint the joint inside its limits, or widen them' });
    }
  }
  trace.push({ pass: 'mechanism', level: 'L5', ms: performance.now() - ts, cached: false, note: `${joints.length} joints, ${S.n} coordinates, rank ${mobility.rank}, mobility ${mobility.dof}${mobility.drives ? `, ${mobility.drives} drive(s)` : ''}; residual ${residual.toExponential(1)}, ${S.how}` });
  // readings, studies and reports (not for a print job's pose)
  // a study row keeps its own x (drive value), q, ok, move and limit: a measure by one of those names would overwrite it
  const RESERVED = new Set(['x', 'q', 'ok', 'move', 'limit']);
  for (const m of o.measures ?? []) if (RESERVED.has(m.name)) diagnostics.push({ level: 'error', kind: 'asm.measure', at: m.name, message: `a measure cannot be called '${m.name}': study rows use that name`, fix: `rename it, e.g. '${m.name}1'` });
  const measures = (o.measures ?? []).filter(m => !RESERVED.has(m.name)), studies = {};
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
      const res = runStudy(S, { name: st.name, drive: st.drive, from: st.from != null ? rad(st.from) : 0, to: st.to != null ? rad(st.to) : full, steps: st.steps ?? 360,
        onRow: swept ? (k) => { poses[k] = S.transforms(); } : null }, measures, o.events ?? []);
      studies[st.name] = res;
      if (swept && !res.error) {
        const tc = performance.now(), c = studyClearance(res, poses, comp, ifr, diagnostics, decisions);
        res.clearance = c.pairs;
        trace.push({ pass: `interference:${st.name}`, level: 'L5', ms: performance.now() - tc, cached: false, note: `${c.pairs.length} pair(s) over ${c.samples} poses; ${c.booleans} overlap volume(s)` });
      }
      if (res.error) diagnostics.push({ level: 'error', kind: 'asm.study', at: st.name, message: res.error });
      if (res.limited?.length) { const ids = [...new Set(res.limited.flatMap(l => l.ids.split(', ')))]; diagnostics.push({ level: 'warning', kind: 'asm.limit', at: st.name, message: `${res.limited.length} of ${res.rows.length} drive values put ${ids.join(', ')} past ${ids.length > 1 ? 'their limits' : 'its limit'} (${+res.limited[0].at.toFixed(1)}…${+res.limited[res.limited.length - 1].at.toFixed(1)} ${res.unit})`, fix: 'keep the study inside the limits, or widen them' }); }
      if (res.gaps?.length) diagnostics.push({ level: 'warning', kind: 'asm.unreachable', at: st.name, message: `${res.gaps.length} of ${res.rows.length} drive values cannot be reached (${+res.gaps[0].toFixed(1)}…${+res.gaps[res.gaps.length - 1].toFixed(1)} ${res.unit})`, fix: 'the loop cannot close there: change a length, or drive another joint' });
      if (res.jump != null) diagnostics.push({ level: 'warning', kind: 'asm.branchJump', at: st.name, message: `a component jumped at ${res.jump.toFixed(1)}${res.unit}: the solution changed branch`, fix: 'use more steps, or a hint that starts on the other branch' });
      trace.push({ pass: `study:${st.name}`, level: 'L5', ms: performance.now() - tq, cached: false, note: `${res.rows.length} poses, ${res.events.length} event(s)` });
    }
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
    for (const [key, v] of Object.entries(pose)) if (S.coord(key)) S.drives.set(key, rad(v));
    S.solve();
    const Tp = S.transforms(), out = new Map([...comp.keys()].map((id, i) => [id, Tp[i]]));
    S.pose = home; S.drives = homeDrives;
    return out;
  };
  const studyRows = Object.fromEntries(Object.entries(studies).map(([k, v]) => [k, { ...v, rows: v.rows.map(r => ({ ...r })) }]));
  const mech = { jointRefs: joints.map(j => ({ id: j.id, kind: j.kind, a: j.a, b: j.b })), couples: S.couples.map(c => ({ id: c.id, a: c.a, b: c.b, ratio: c.ratio, offset: c.offset, kind: meshes.find(m => m.c.id === c.id)?.kind ?? 'joint' })), mobility, assembled, conflicts, residual, joints: jv, measures: measured, studies: studyRows, reports, drives: Object.fromEntries([...S.drives].map(([k, v]) => [k, v])), solver: S,
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
  // a rigid subassembly's own studies, reports and readings (in its own frame), under its id
  Object.assign(mech.studies, E.childOut.studies); mech.reports.push(...E.childOut.reports); Object.assign(mech.measures, E.childOut.measures);
  return { parts, placements, occurrences, diagnostics, decisions, trace, comp, groundId, mech, eff: E };
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

// limits: numbers are degrees for an angle and millimetres for a slide; quantities carry their own unit
const limitsOf = jn => jn.limits?.map(x => typeof x === 'number' ? (jn.kind === 'slider' ? x : x * Math.PI / 180) : num(x));
const slideLimitsOf = jn => jn.slideLimits?.map(x => typeof x === 'number' ? x : num(x)) ?? null;
// a joint end as text: 'comp:port', or a selector or frame on a component
const refText = r => (typeof r === 'string' ? r : r?.root?.type === 'on' ? String(r) : isDeferred(r) && r.args?.[0]?.root?.type === 'on' ? `j.frame.on(${String(r.args[0])})` : String(r));

// the component pairs of the contact sets, each pair once
function contactPairs(sets, ids) {
  const seen = new Set(), out = [];
  for (const c of sets ?? []) {
    const list = (c.ids ?? ids).filter(id => ids.includes(id));
    for (let i = 0; i < list.length; i++) for (let k = i + 1; k < list.length; k++) { const key = [list[i], list[k]].sort().join('|'); if (!seen.has(key)) { seen.add(key); out.push([list[i], list[k]]); } }
  }
  return out;
}
// Contact sets as a drag sees them (MechanismSolver.drag's guard). A check of the pose a step ends at cannot see a
// part that passed through another on the way, so the guard speaks of motions instead: at(T) measures the clearance of
// each pair at a pose, room(at, T) how much of it the motion from there to T uses, and a drag only takes a piece of a
// step whose travel fits inside the clearance where the piece starts (conservative advancement). The clearance is a
// lower bound: the boxes' gap when they are apart by more than NEAR, the meshes' gap within it; the travel an upper
// one: how far a corner of a part's box moves, the two parts' summed. Pairs that touch when the drag starts may part.
const NEAR = 1, TOUCH = 1e-3, SAFE = 0.9;
function contactGuard(comp, ids, sets) {
  const pairs = contactPairs(sets, ids);
  if (!pairs.length) return null;
  const index = new Map(ids.map((id, i) => [id, i]));
  const corners = new Map([...new Set(pairs.flat())].map(id => [id, comp.get(id).res.state.bodies.flatMap(b => { const bb = b.bbox(); return [0, 1].flatMap(i => [0, 1].flatMap(k => [0, 1].map(l => [bb[i][0], bb[k][1], bb[l][2]]))); })]));
  const gap = ([a, b], T) => {
    const A = comp.get(a), B = comp.get(b), TA = T[index.get(a)], TB = T[index.get(b)];
    let g = Infinity;
    for (const x of A.res.state.bodies) for (const y of B.res.state.bodies) {
      const bg = boxGapOf(worldBox(x.bbox(), TA), worldBox(y.bbox(), TB));
      g = Math.min(g, bg > NEAR ? bg : Math.min(NEAR, meshGapNear(meshTris(meshBody(x), TA), meshTris(meshBody(y), TB), NEAR)));
    }
    return g;
  };
  const travel = (id, Ta, Tb) => { const i = index.get(id); let m = 0; for (const c of corners.get(id)) m = Math.max(m, V.len(V.sub(K.matApply(Tb[i], c), K.matApply(Ta[i], c)))); return m; };
  let live = pairs;
  return {
    start(T) { live = pairs.filter(p => gap(p, T) >= TOUCH); return live.length > 0; },
    at(T) { const gaps = live.map(p => gap(p, T)); return { T, gaps, touching: live.filter((p, k) => gaps[k] < TOUCH).map(p => p.join('–')) }; },
    // ≥ 1: the motion from the measured pose to T fits; below, the share of it that would
    room(at, T) { let r = Infinity; live.forEach((p, k) => { const t = travel(p[0], at.T, T) + travel(p[1], at.T, T); if (t > 0) r = Math.min(r, SAFE * at.gaps[k] / t); }); return r; },
  };
}

// a joint end: 'comp:port' | 'comp' (as-built) | j.on(comp, sel) | j.frame.on(j.on(comp, sel), { flip, at, offset })
function parseEnd(ref) {
  if (typeof ref === 'string') { const i = ref.indexOf(':'); return i < 0 ? { comp: ref, port: null } : { comp: ref.slice(0, i), port: ref.slice(i + 1) }; }
  if (ref?.root?.type === 'on') return { comp: ref.root.comp, sel: ref.steps?.length ? new Selector(ref.root.sel.kind, ref.root.sel.root, [...ref.root.sel.steps, ...ref.steps]) : ref.root.sel, opts: {} };
  if (isDeferred(ref) && ref.type === 'frame' && ref.op === 'on' && ref.args[0]?.root?.type === 'on') {
    const o = { ...(ref.args[1] ?? {}) };
    o.flip = ref.chain.filter(c => c[0] === 'flip').length % 2 === 1;
    const off = ref.chain.filter(c => c[0] === 'offset').reduce((a, c) => a + num(c[1]), 0) + (o.offset != null ? num(o.offset) : 0);
    o.offset = off;
    return { comp: ref.args[0].root.comp, sel: ref.args[0].root.sel, opts: o };
  }
  return { error: `a joint end is 'component:port', j.on(component, selector) or j.frame.on(j.on(…), { flip, at, offset }); got ${String(ref)}` };
}
// Ports from geometry (Fusion's joint origins): the frame a picked face, edge or vertex gives, in the component's
// own frame. A cylinder (a bore, a pin) gives its axis, the origin mid-way along it (at: 'start' | 'end' for its
// ends); a circular edge its centre and axis; a straight edge its middle and direction; a planar face its centre and
// normal — outward on the joint's a end, inward on its b end, so two picked faces meet face to face; a vertex its
// point. An axis has no sign of its own, so it points along +Z, else +Y, else +X; x follows the frame rule
// (horizontal where it can be). { flip: true } turns the frame half a turn about x; { offset } moves it along z.
function geometryFrame(X, sel, o = {}, side = 'a') {
  const r = selectInPart(X.res, sel);
  const diags = (r.diags ?? []).map(d => ({ ...d }));
  if (!r.items.length) throw Object.assign(new Error(`${sel} picks nothing on ${X.c.id}`), { fix: 'check the selector with prog.why(…)' });
  const c = r.items[0], V = K.V;
  const canon = d => { const u = V.unit(d); const k = Math.abs(u[2]) > 1e-9 ? u[2] : Math.abs(u[1]) > 1e-9 ? u[1] : u[0]; return k < 0 ? V.neg(u) : u; };
  const along = (A, d, pts) => { const ts = pts.map(p => V.dot(V.sub(p, A), d)); return [Math.min(...ts), Math.max(...ts)]; };
  let origin, z, what, rule;
  if (r.kind === 'faces') {
    const fi = c.body.faceInfo(c.index);
    if (fi.kind === 'plane') {
      origin = fi.center; z = side === 'b' ? V.neg(fi.normal) : fi.normal;
      what = `planar face ${c.name}`; rule = `its centre, the ${side === 'b' ? 'inward' : 'outward'} normal (the ${side} end)`;
    } else if (fi.axis && (fi.kind === 'cylinder' || fi.kind === 'cone')) {
      const A = fi.axis.origin; z = canon(fi.axis.dir);
      // every face picked on the same axis counts (a cylinder split at its seam is two faces)
      const same = r.items.filter(q => { const f = q.body.faceInfo(q.index); return f.axis && Math.abs(Math.abs(V.dot(V.unit(f.axis.dir), z)) - 1) < 1e-9 && V.len(V.cross(V.sub(f.axis.origin, A), z)) < 1e-6; });
      const pts = [];
      for (const q of same) q.body.edgeFaces.forEach((fs, e) => { if (fs.includes(q.index)) { const ei = q.body.edgeInfo(e); pts.push(ei.a, ei.b, ei.mid); } });
      const [t0, t1] = pts.length ? along(A, z, pts) : [0, 0];
      const t = o.at === 'start' ? t0 : o.at === 'end' ? t1 : (t0 + t1) / 2;
      origin = V.add(A, V.mul(z, t));
      what = `${fi.kind} ${c.name}${same.length > 1 ? ` (+${same.length - 1} on its axis)` : ''}, r ${+fi.axis.radius.toFixed(4)} mm`;
      rule = `its axis, at the ${o.at === 'start' ? 'start' : o.at === 'end' ? 'end' : 'middle'} of its length (${+(t1 - t0).toFixed(3)} mm)`;
      if (r.items.length > same.length) diags.push({ level: 'warning', kind: 'joint.ambiguous', message: `${sel} picks ${r.items.length} faces on ${X.c.id}; the first one's axis is used`, fix: 'pick one face' });
    } else if (fi.kind === 'sphere' && fi.axis) {
      origin = fi.axis.origin; z = [0, 0, 1]; what = `sphere ${c.name}`; rule = 'its centre';
    } else throw Object.assign(new Error(`${c.name} on ${X.c.id} is ${fi.kind}: a joint end needs a planar face, a cylinder, a cone, a sphere, an edge or a vertex`), { fix: 'pick a planar face, a bore or a circular edge' });
  } else if (r.kind === 'edges') {
    const ei = c.body.edgeInfo(c.index);
    if (ei.axis) { origin = ei.axis.origin; z = canon(ei.axis.dir); what = `circular edge ${c.name}, r ${+ei.axis.radius.toFixed(4)} mm`; rule = 'its centre and axis'; }
    else if (ei.dir) { z = canon(ei.dir); const [p, q] = V.dot(V.sub(ei.b, ei.a), z) >= 0 ? [ei.a, ei.b] : [ei.b, ei.a]; origin = o.at === 'start' ? p : o.at === 'end' ? q : ei.mid; what = `straight edge ${c.name}`; rule = `its ${o.at === 'start' ? 'start' : o.at === 'end' ? 'end' : 'middle'}, along it`; }
    else throw Object.assign(new Error(`${c.name} on ${X.c.id} is a ${ei.kind} edge: a joint end needs a straight or circular edge`), { fix: 'pick a straight or circular edge' });
    if (r.items.length > 1) diags.push({ level: 'warning', kind: 'joint.ambiguous', message: `${sel} picks ${r.items.length} edges on ${X.c.id}; the first is used`, fix: 'pick one edge' });
  } else if (r.kind === 'vertices') {
    origin = c.body.vertexPoint(c.index); z = [0, 0, 1]; what = `vertex ${c.name}`; rule = 'its point';
  } else throw new Error(`${sel} picks ${r.kind} on ${X.c.id}: a joint end needs a face, an edge or a vertex`);
  if (o.flip) z = V.neg(z);
  const f = orthoFrame(origin, null, z);
  let fr = f;
  if (o.flip) { const g = orthoFrame(origin, null, V.neg(z)); fr = { origin: f.origin, x: g.x, y: V.neg(g.y), z: f.z }; }   // half a turn about x
  if (o.offset) fr = { ...fr, origin: V.add(fr.origin, V.mul(fr.z, o.offset)) };
  return { m: K.frameMatrix(fr), what, rule: rule + (o.flip ? ', flipped' : '') + (o.offset ? `, ${o.offset} mm along z` : ''), diags };
}

// ---- subassemblies (README §4.10: .add(id, assembly, { at, flexible })) --------------------------------------
// A subassembly's components join the parent under '<sub>/<id>' (so 'hook/shaft:axis' is a port of one of them),
// placed by the subassembly's `at`. A rigid one (the default, as in Inventor and FreeCAD) is solved on its own, then
// held as one body: each of its components is joined rigidly to its root where that solve put it. A flexible one
// brings its joints, drives, hints, couplings, readings, studies and reports into the parent's solve, prefixed.
// Either is fixed where its `at` puts it unless a joint of the parent holds it (a rigid one: any of its components; a
// flexible one: its root, the component it grounds).
function expandAssembly(asm, opts, compilePart, diagnostics, declared) {
  const comps = new Map(), parts = [], subs = new Map(), presetPorts = [];
  const values = { ...declared };   // by full id: a flexible child's own values join under its prefix (gather)
  const extra = { joints: [], drives: {}, hints: {}, couples: [], measures: [], events: [], studies: [], sweeps: [], reports: [], contacts: [] };
  const childOut = { studies: {}, reports: [], measures: {} };
  const tree = { kind: 'assembly', id: '', item: asm.name, children: [] };
  const rootOf = A => A.o.ground ?? A.o.components.find(x => x.opts.ground)?.id ?? A.o.components[0]?.id;
  // a root is always a component: an id that names a subassembly (it grounds its parent, by .ground() or by coming
  // first) stands for that one's root, which walk() has resolved already; one that names nothing is an error
  const rootIn = (id, at) => {
    const r = subs.get(id)?.root ?? id;
    if (comps.has(r)) return r;
    diagnostics.push({ level: 'error', kind: 'asm.ground', at, message: `${at}: its root '${r}' is not one of its components`, fix: '.ground(id) names one of its components' });
    return null;
  };
  const walk = (A, prefix, Tp, node, vals) => {
    for (const c of A.o.components) {
      const id = prefix ? `${prefix}/${c.id}` : c.id;
      if (c.item?.isPart) {
        // bind the part's params to this level's values / expressions
        const bound = {};
        for (const [k, v] of Object.entries(c.opts.params ?? {})) bound[k] = typeof v === 'string' && vals[v] !== undefined ? vals[v] : v;
        const res = compilePart(c.item, { ...opts, override: Object.keys(bound).length ? bound : null });
        const T0 = prefix ? K.matMul(Tp, atMatrix(res, c.opts.at)) : atMatrix(res, c.opts.at);
        comps.set(id, { c: prefix ? { ...c, id } : c, res, T: T0, T0, level: prefix });
        parts.push({ name: id, part: c.item, res });
        node.children.push({ kind: 'part', id, item: c.item.name, qty: c.opts.qty ?? 1 });
        continue;
      }
      if (!c.item?.isAssembly) { diagnostics.push({ level: 'warning', kind: 'asm.unsupported', at: id, message: `component '${id}' is neither a part nor an assembly` }); continue; }
      const flexible = !!c.opts.flexible, Ts = K.matMul(Tp, matOf(c.opts.at));
      const sn = { kind: 'assembly', id, item: c.item.name, qty: c.opts.qty ?? 1, flexible, children: [] };
      node.children.push(sn);
      if (flexible) {
        const cv = scopeValues(c.item, vals, c.id);
        walk(c.item, id, Ts, sn, cv);
        gather(c.item, id, cv);
        const root = rootIn(`${id}/${rootOf(c.item)}`, id);
        subs.set(id, Object.assign(sn, { root, level: prefix, Ts, rootLocal: K.matMul(K.matInverse(Ts), comps.get(root)?.T0 ?? Ts) }));
        continue;
      }
      // rigid: its own solve, with this level's values for '<sub>/…' as its overrides (its solve layers them over its
      // own params and overrides, as scopeValues does for a flexible one)
      const sub = unprefix(vals, c.id);
      const r = solveAssembly(c.item, { ...opts, override: Object.keys(sub).length ? sub : null }, compilePart);
      for (const d of r.diagnostics) diagnostics.push({ ...d, at: `${id}/${d.at ?? ''}` });
      for (const [cid, X] of r.comp) {
        const gid = `${id}/${cid}`, T0 = K.matMul(Ts, X.T);
        comps.set(gid, { c: { ...X.c, id: gid }, res: X.res, T: T0, T0, level: id });
        parts.push({ name: gid, part: X.c.item, res: X.res });
      }
      // its tree whole, nested subassemblies and all, as this level names and places them (structure only: it moves
      // as one body here, so none of them is solved or fixed again)
      sn.children = nestTree(r.eff.tree.children, id, Ts);
      const root = rootIn(`${id}/${r.groundId}`, id);
      for (const cid of root ? r.comp.keys() : []) {
        const gid = `${id}/${cid}`; if (gid === root) continue;
        presetPorts.push({ cid: root, name: `@rigid~${cid}`, m: K.matMul(K.matInverse(comps.get(root).T0), comps.get(gid).T0) });
        presetPorts.push({ cid: gid, name: '@rigid', m: K.IDENTITY.slice() });
        extra.joints.push({ id: `${id}/(rigid ${cid})`, kind: 'rigid', group: '{e}', dof: 0, a: `${root}:@rigid~${cid}`, b: `${gid}:@rigid`, opts: {}, synthetic: true, level: id });
      }
      subs.set(id, Object.assign(sn, { root, level: prefix, Ts, rootLocal: K.matMul(K.matInverse(Ts), comps.get(root)?.T0 ?? Ts) }));
      for (const [k, v] of Object.entries(r.mech?.studies ?? {})) childOut.studies[`${id}/${k}`] = { ...v, name: `${id}/${k}` };
      for (const rep of r.mech?.reports ?? []) childOut.reports.push({ ...rep, name: `${id}/${rep.name}` });
      for (const [k, v] of Object.entries(r.mech?.measures ?? {})) childOut.measures[`${id}/${k}`] = v;
    }
  };
  // a flexible subassembly's declarations, as its parent's: every kind of declaration has a rule (FLEXIBLE: carried
  // prefixed, read where the child is walked, or not carried, with why), and a kind with none is reported, so a
  // declaration a flexible child makes is never dropped without a word
  const carry = {
    joints: (v, P, prefix) => { for (const jn of v) { const ab = jn.asBuilt ?? jn.opts?.asBuilt; extra.joints.push({ ...jn, id: P(jn.id), a: reroot(jn.a, prefix), b: reroot(jn.b, prefix), asBuilt: ab && ab !== true ? reroot(ab, prefix) : ab, opts: { ...jn.opts, asBuilt: undefined }, level: prefix }); } },
    drives: (v, P) => { for (const [k, x] of Object.entries(v)) extra.drives[P(k)] = x; },
    hints: (v, P) => { for (const [k, x] of Object.entries(v)) extra.hints[P(k)] = x; },
    couples: (v, P, prefix) => { for (const c of v) {
      if (c.spec) extra.couples.push({ ...c, id: P(c.id), spec: { ...c.spec, a: reroot(c.spec.a, prefix), b: reroot(c.spec.b, prefix), joints: c.spec.joints?.map(P) } });
      else if (!c.unsupported) extra.couples.push({ ...c, id: P(c.id), a: P(c.a), b: P(c.b) });
    } },
    measures: (v, P, prefix) => { for (const m of v) extra.measures.push({ name: P(m.name), fn: mm => m.fn(prefixReader(mm, prefix)) }); },
    events: (v, P, prefix) => { for (const e of v) extra.events.push({ name: P(e.name), fn: row => e.fn(unprefixRow(row, prefix)) }); },
    studies: (v, P) => { for (const st of v) extra.studies.push({ ...st, name: P(st.name), drive: P(st.drive) }); },
    sweeps: (v, P) => { for (const sw of v) extra.sweeps.push({ ...sw, jointId: P(sw.jointId) }); },
    reports: (v, P, prefix) => { for (const rp of v) extra.reports.push({ ...rp, name: P(rp.name), fn: ctx => rp.fn(unprefixCtx(ctx, prefix)) }); },
    contacts: (v, P, prefix, A) => { for (const ct of v) extra.contacts.push({ ids: (ct.ids ?? A.o.components.map(x => x.id)).map(P) }); },
  };
  const gather = (A, prefix, cv) => {
    const P = s => `${prefix}/${s}`;
    for (const [k, v] of Object.entries(A.o)) {
      if (v == null) continue;
      const rule = FLEXIBLE[k];
      if (rule === 'carried') carry[k](v, P, prefix, A);
      else if (rule === 'walked') continue;
      else diagnostics.push({ level: 'warning', kind: 'asm.flexible', at: prefix, message: `${prefix} is flexible: its .${k}() is not carried into ${asm.name}${rule ? ` (${rule})` : ''}`, fix: `declare it on ${asm.name} with the prefixed ids ('${prefix}/…'), or add ${prefix} rigid` });
    }
    // its values (params, overrides, and what the levels above set for it) under its prefix: a value the child gives
    // a joint drives that joint here as it does on its own
    for (const [k, v] of Object.entries(cv)) values[P(k)] = v;
  };
  walk(asm, '', K.IDENTITY.slice(), tree, values);
  const own = asm.o;
  const joints = [...(own.joints ?? []).map(j => ({ ...j, level: '' })), ...extra.joints];
  // the root of a subassembly is fixed unless a joint from outside it holds it
  const compOfEnd = e => parseEnd(e).comp;
  for (const S of subs.values()) {
    const outside = joints.filter(j => j.level !== S.id && !String(j.level).startsWith(S.id + '/'));
    const inSub = cid => cid != null && (S.flexible ? cid === S.root : cid.startsWith(S.id + '/'));
    const held = outside.some(j => [j.a, j.b, j.asBuilt && j.asBuilt !== true ? j.asBuilt : null].some(e => e != null && inSub(compOfEnd(e))));
    if (!held && comps.get(S.root)) comps.get(S.root).fixed = true;
  }
  let groundId = own.ground ?? own.components.find(c => c.opts.ground)?.id ?? own.components[0]?.id;
  if (groundId != null) groundId = rootIn(groundId, asm.name);
  const o = { ...own, joints, drives: { ...extra.drives, ...(own.drives ?? {}) }, hints: { ...extra.hints, ...(own.hints ?? {}) },
    couples: [...extra.couples, ...(own.couples ?? [])], measures: [...extra.measures, ...(own.measures ?? [])], events: [...extra.events, ...(own.events ?? [])],
    studies: [...extra.studies, ...(own.studies ?? [])], sweeps: [...extra.sweeps, ...(own.sweeps ?? [])], reports: [...extra.reports, ...(own.reports ?? [])],
    contacts: [...extra.contacts, ...(own.contacts ?? [])] };
  return { o, comps, parts, tree, presetPorts, childOut, groundId, values };
}
// What each declaration of a flexible subassembly becomes in its parent (expandAssembly's gather): 'carried' under its
// prefix (by carry[kind]), 'walked' (read where the child is walked: its components, root and values), or a reason it
// is not carried, which the compile says. A declaration kind not listed is reported too.
const FLEXIBLE = {
  components: 'walked', ground: 'walked', params: 'walked', overrides: 'walked',
  joints: 'carried', drives: 'carried', hints: 'carried', couples: 'carried', measures: 'carried', events: 'carried',
  studies: 'carried', sweeps: 'carried', reports: 'carried', contacts: 'carried',
  pip: 'print-in-place is planned for the assembly printed', interference: 'its pairs and study are named in its own ids',
  explode: 'an exploded view is the top assembly\'s', configs: 'configurations are chosen on the top assembly',
};
// the values a level sets for one of its subassemblies ('<id>/…'), as that subassembly names them
const unprefix = (vals, id) => Object.fromEntries(Object.entries(vals).filter(([k]) => k.startsWith(id + '/')).map(([k, v]) => [k.slice(id.length + 1), v]));
// a flexible subassembly's values as its own joints and parts see them: its params, its overrides, and what the level
// above sets for it, which wins (the layering a rigid one's own solve makes of the same three)
const scopeValues = (A, vals, id) => ({ ...(A.o.params ?? {}), ...(A.o.overrides ?? {}), ...unprefix(vals, id) });
// The tree is the one record of the product structure: a subassembly's node carries its root, its placement Ts and
// rootLocal (its frame in its root's), and expandAssembly's `subs` indexes those same nodes for the ones this level
// solves (and may fix); nothing else keeps a copy to fall out of step with it. A rigid child's tree comes whole:
// ids and roots under its prefix, placements in this level's frame.
const nestTree = (nodes, p, Tp) => nodes.map(n => (n.kind === 'part' ? { ...n, id: `${p}/${n.id}` }
  : { ...n, id: `${p}/${n.id}`, root: `${p}/${n.root}`, level: n.level ? `${p}/${n.level}` : p, Ts: K.matMul(Tp, n.Ts), children: nestTree(n.children, p, Tp) }));
const subassemblyNodes = node => node.children.flatMap(n => (n.kind === 'assembly' ? [n, ...subassemblyNodes(n)] : []));
// a joint end of a subassembly, as the parent names it
function reroot(e, prefix) {
  if (e == null || e === true) return e;
  if (typeof e === 'string') return `${prefix}/${e}`;
  if (e?.root?.type === 'on') return new Selector(e.kind, { ...e.root, comp: `${prefix}/${e.root.comp}` }, e.steps);
  if (isDeferred(e) && e.args?.[0]?.root?.type === 'on') return new Deferred(e.type, e.op, [reroot(e.args[0], prefix), ...e.args.slice(1)], e.chain);
  return e;
}
// readings written inside a subassembly see its own names
function prefixReader(m, p) {
  const P = r => `${p}/${r}`;
  return { ...m, point: (r, local) => m.point(P(r), local), axis: (r, w) => m.axis(P(r), w), angle: (a, b, w) => m.angle(P(a), P(b), w), distance: (a, b) => m.distance(P(a), P(b)), joint: id => m.joint(P(id)) };
}
function unprefixRow(row, p) {
  const out = { ...row };
  for (const [k, v] of Object.entries(row)) if (k.startsWith(p + '/')) out[k.slice(p.length + 1)] = v;
  return out;
}
function unprefixCtx(ctx, p) {
  const studies = {};
  for (const [k, st] of Object.entries(ctx.studies ?? {})) {
    if (!k.startsWith(p + '/')) continue;
    const P = n => `${p}/${n}`;
    studies[k.slice(p.length + 1)] = { ...st, range: n => st.range(P(n)), at: (n, x) => st.at(P(n), x), row: x => unprefixRow(st.row(x), p), clearance: (a, b) => st.clearance(P(a), P(b)), extrema: st.extrema };
  }
  return { ...ctx, studies, measures: unprefixRow(ctx.measures ?? {}, p) };
}

const bomOf = nodes => nodes.map(n => (n.kind === 'part' ? { item: n.item, id: n.id, qty: n.qty ?? 1, kind: 'printed' } : { item: n.item, id: n.id, qty: n.qty ?? 1, kind: 'assembly', flexible: !!n.flexible, children: bomOf(n.children) }));
const flatBom = rows => rows.flatMap(r => (r.kind === 'assembly' ? flatBom(r.children) : [r]));
// { name, children: [{ kind: 'part', id, name, T, shapes } | { kind: 'assembly', id, name, T, children }] }, every T in
// the world; a subassembly's T is where its root now puts its frame
function structureOf(tree, comp, name) {
  const node = n => {
    if (n.kind === 'part') { const X = comp.get(n.id); return { kind: 'part', id: n.id, name: n.item, T: X.T, res: X.res }; }
    const R = comp.get(n.root);
    const T = R ? K.matMul(R.T, K.matInverse(n.rootLocal)) : n.Ts;
    return { kind: 'assembly', id: n.id, name: n.item, T, children: n.children.map(node) };
  };
  return { name, children: tree.children.map(node) };
}
