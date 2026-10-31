// Assemblies (README §4.10): components placed by transforms or joints between ports, grounding,
// rigid/revolute/slider joints as placement constraints, print-in-place gap checks, BOM, mobility.
import * as K from './kernel.js';
import { callerLine } from './part.js';
import { frameOf, matOf } from './adapt.js';
import { mobility, meshGap, meshTris } from './inspect.js';
import { meshBody } from './mesh.js';
import { resolveInPart } from './compile.js';

const V = K.V;
const DOF = { rigid: 0, revolute: 1, slider: 1, cylindrical: 2, planar: 3, ball: 3, snap: 0 };
const GROUP = { rigid: '{e}', revolute: 'SO(2)', slider: 'ℝ', cylindrical: 'SO(2)×ℝ', planar: 'SE(2)', ball: 'SO(3)', snap: '{e} once engaged' };
export const joint = Object.fromEntries(Object.keys(DOF).map(k => [k, (o = {}) => Object.freeze({ kind: k, group: GROUP[k], dof: DOF[k], ...o })]));

class Assembly {
  constructor(name, o) { this.name = name; this.o = o; Object.freeze(this); }
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
  explode(steps) { return this._w({ explode: steps }); }
  interference(o = {}) { return this._w({ interference: o }); }
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
  const { parts, placements, occurrences, diagnostics, decisions, trace, comp, groundId } = solveAssembly(asm, opts, compilePart);
  const o = asm.o;
  const mob = mobility({ components: [...comp.keys()], joints: o.joints });
  const info = { name: asm.name, hash: null, components: [...comp.keys()].map(id => ({ id })), joints: o.joints.map(j => ({ id: j.id, kind: j.kind, a: j.a, b: j.b, limits: j.limits?.map(x => typeof x === 'number' ? x * Math.PI / 180 : x.value) })), mobility: mob,
    bom: [...comp.values()].map(x => ({ item: x.c.item.name, id: x.c.id, qty: x.c.opts.qty ?? 1, kind: 'printed' })) };
  const prog = finalize({ kind: 'assembly', name: asm.name, parts, t0, opts, assembly: info, occurrences, placements,
    extraDiagnostics: diagnostics, extraDecisions: decisions, extraTrace: trace,
    extraMetrics: { assemblyDOF: { value: mob.solverDOF, unit: 'count', fidelity: 'exact' } } });
  prog.bom = () => info.bom; prog.dof = () => ({ total: mob.solverDOF, grounded: groundId }); prog.occurrence = id => occurrences.find(x => x.id === id) ?? null;
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
  const placed = new Set([groundId]);
  for (const [id, x] of comp) if (x.c.opts.at != null || id === groundId) placed.add(id);
  // joints: place b relative to a through ports: T_b = T_a · F_a · J(value) · F_b⁻¹
  const placed0 = new Set(placed);
  const jointMat = (jn, value) => jn.kind === 'revolute' ? K.matRotate([0, 0, 1], value) : jn.kind === 'slider' ? K.matTranslate(0, 0, value) : K.IDENTITY;
  // the print pose: joints at their pose values (params elsewhere), for the print-in-place check
  const solvePose = pose => {
    const T = new Map([...comp].map(([id, x]) => [id, x.T0])), pl = new Set(placed0);
    for (const jn of o.joints) {
      const [ca, pa] = String(jn.a).split(':'), [cb, pb] = String(jn.b).split(':');
      const A = comp.get(ca), B = comp.get(cb); if (!A || !B) continue;
      const Fa = portMatrix(A, pa, [], jn.id), Fb = portMatrix(B, pb, [], jn.id);
      const limits = jn.limits?.map(x => typeof x === 'number' ? x * Math.PI / 180 : x.value);
      const v = pose[jn.id] !== undefined ? num(pose[jn.id]) : values[jn.id] !== undefined ? num(values[jn.id]) : limits ? limits[0] : 0;
      const J = jointMat(jn, v);
      if (!pl.has(cb) || pl.has(ca)) { T.set(cb, K.matMul(T.get(ca), K.matMul(Fa, K.matMul(J, K.matInverse(Fb))))); pl.add(cb); }
      else { T.set(ca, K.matMul(T.get(cb), K.matMul(Fb, K.matMul(K.matInverse(J), K.matInverse(Fa))))); pl.add(ca); }
    }
    return T;
  };
  for (const jn of o.joints) {
    const [ca, pa] = String(jn.a).split(':'), [cb, pb] = String(jn.b).split(':');
    const A = comp.get(ca), B = comp.get(cb);
    if (!A || !B) { diagnostics.push({ level: 'error', kind: 'joint.unsolved', at: jn.id, message: `joint ${jn.id}: unknown component ${!A ? ca : cb}` }); continue; }
    const Fa = portMatrix(A, pa, diagnostics, jn.id), Fb = portMatrix(B, pb, diagnostics, jn.id);
    const limits = jn.limits?.map(x => typeof x === 'number' ? x * Math.PI / 180 : x.value);
    // a print job places the assembly in its print pose; on screen a joint param (a slider) wins
    const posed = o.pip?.pose?.[jn.id] !== undefined, usePose = posed && (opts.forPrint || values[jn.id] === undefined);
    let value = usePose ? num(o.pip.pose[jn.id]) : values[jn.id] !== undefined ? num(values[jn.id]) : limits ? limits[0] : 0;
    const J = jn.kind === 'revolute' ? K.matRotate([0, 0, 1], value) : jn.kind === 'slider' ? K.matTranslate(0, 0, value) : K.IDENTITY;
    // move whichever side is not yet placed
    if (!placed.has(cb) || placed.has(ca)) { B.T = K.matMul(A.T, K.matMul(Fa, K.matMul(J, K.matInverse(Fb)))); placed.add(cb); }
    else { A.T = K.matMul(B.T, K.matMul(Fb, K.matMul(K.matInverse(J), K.matInverse(Fa)))); placed.add(ca); }
    occurrences.push({ id: cb, joint: jn.id, value: jn.kind === 'revolute' ? `${(value * 180 / Math.PI).toFixed(1)}°` : `${value} mm`, txText: txText(B.T) });
    decisions.push({ at: jn.id, kind: 'joint', chose: `${jn.kind} at ${jn.kind === 'revolute' ? (value * 180 / Math.PI).toFixed(1) + '°' : value + ' mm'}`, alternatives: [], reason: usePose ? 'print pose' : values[jn.id] !== undefined ? 'override' : 'first limit (default pose)' });
  }
  for (const [id, x] of comp) {
    for (const b of x.res.state.bodies) placements[`${id}/${b.id}`] = x.T;
    if (!occurrences.find(oc => oc.id === id)) occurrences.unshift({ id, ground: id === groundId, txText: txText(x.T) });
  }
  // print-in-place / interference: minimum gap between components, at the print pose when one is given.
  // Bounding boxes rule out far pairs; small bodies get the exact B-rep distance; large ones (gears) a mesh
  // distance unless { exact: true } (printInPlace or interference options) asks for B-rep everywhere.
  // explicit only: .interference(), printInPlace(ids, { check: true }) or compile option interference
  if (o.interference || o.pip?.check || opts.interference) {
    const ti = performance.now();
    const Tpose = o.pip?.pose && !opts.forPrint && Object.keys(o.pip.pose).some(k => values[k] !== undefined) ? solvePose(o.pip.pose) : null;
    const Tof = (id, X) => Tpose?.get(id) ?? X.T;
    const ids = o.pip?.ids ?? [...comp.keys()];
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
  return { parts, placements, occurrences, diagnostics, decisions, trace, comp, groundId };
}
const num = v => typeof v === 'number' ? v * (Math.abs(v) <= 2 * Math.PI ? 1 : 1) : v?.value ?? Number(v);
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
