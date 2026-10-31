// Print design rules (README §4.15): rule sets are values; check(prog) → diagnostics. Later rules win by name.
import * as K from './kernel.js';
import { meshTris, orientationScore } from './inspect.js';
import { PRINTERS } from './print.js';

const V = K.V;
const mmv = (x, d) => x == null ? d : typeof x === 'number' ? x : x.isSymbolic ? x.resolve({}).value : x.value ?? d;

class RuleSet {
  constructor(name, list) { this.name = name; this.list = list; Object.freeze(this); }
  get isRules() { return true; }
  get rules() { const m = new Map(); for (const r of this.list.flatMap(x => x.isRules ? x.rules : [x])) m.set(r.name, r); return [...m.values()]; }
  check(prog, ctx = {}) { return this.rules.flatMap(r => { try { return r.check(prog, ctx).map(d => ({ rule: r.name, ...d })); } catch (e) { return [{ level: 'warning', kind: 'rule.failed', at: r.name, message: e.message }]; } }); }
  toString() { return `j.rules('${this.name}', ${this.rules.length} rules)`; }
}
export function rules(name, list) { return new RuleSet(name, list); }
const R = (name, check, opts) => Object.freeze({ name, opts, check });
const bodiesOf = prog => prog.data.bodies;
const upOf = (prog, b) => prog.data.print ? null : [0, 0, 1];

export const rule = {
  overhang: (o = {}) => R('overhang', prog => {
    const max = o.max != null ? mmv(o.max) : Math.PI / 4;
    if (prog.data.print) return [];   // print jobs report print.overhang during orientation
    const out = [];
    for (const b of bodiesOf(prog)) {
      if (!b.mesh) continue;
      const s = orientationScore(meshTris(b.mesh, b.transform, b.faces), [0, 0, 1], { maxAngle: max });
      if (s.overhangArea > 1e-3) out.push({ level: 'warning', kind: 'print.overhang', at: b.id, message: `${s.overhangArea.toFixed(1)} mm² overhangs more than ${(max * 180 / Math.PI).toFixed(0)}° with +Z up (faces ${s.overhangFaces.map(i => b.faces[i]?.name).join(', ')})`, fix: 'chamfer at 45° or reorient the part', faces: s.overhangFaces });
    }
    return out;
  }, o),
  bedFit: (o = {}) => R('bedFit', (prog, ctx) => {
    if (prog.data.print) return [];
    const bed = ctx.printer?.bed ?? PRINTERS['generic-fdm'].bed;
    const bb = prog.data.metrics.bbox.value; const [x, y, z] = bb;
    const ok = z <= bed[2] && ((x <= bed[0] && y <= bed[1]) || (y <= bed[0] && x <= bed[1]));
    return ok ? [] : [{ level: 'error', kind: 'print.bedFit', at: prog.data.name, message: `${bb.map(v => v.toFixed(1)).join(' × ')} mm does not fit the ${bed.join(' × ')} mm bed`, fix: 'split the part or scale it' }];
  }, o),
  minHole: (o = {}) => R('minHole', prog => {
    const min = mmv(o.min, 1.0);
    const out = [];
    for (const p of prog.P.parts) for (const f of p.res.features) if (f.type === 'hole') for (const h of f.info?.holes ?? []) if (h.modelled < min) out.push({ level: 'warning', kind: 'print.thinFeature', at: `${f.id}.${h.label}`, message: `hole Ø ${h.modelled} mm is below ${min} mm and will close up`, fix: `Ø ≥ ${min} mm, or drill after printing` });
    return out;
  }, o),
  minWall: (o = {}) => R('minWall', prog => {
    const min = mmv(o.min, 0.9);
    const out = [];
    for (const p of prog.P.parts) for (const f of p.res.features) if (f.type === 'shell' && f.info?.thickness < min) out.push({ level: 'warning', kind: 'print.thinWall', at: f.id, message: `shell wall ${f.info.thickness} mm is thinner than ${min} mm (2 line widths)`, fix: `wall ≥ ${min} mm` });
    for (const b of bodiesOf(prog)) { const d = b.bbox[1].map((v, i) => v - b.bbox[0][i]); const t = Math.min(...d); if (t < min) out.push({ level: 'warning', kind: 'print.thinWall', at: b.id, message: `${b.id} is only ${t.toFixed(2)} mm thick`, fix: `thickness ≥ ${min} mm` }); }
    return out;
  }, o),
  holeOrientation: (o = {}) => R('holeOrientation', prog => {
    const out = [];
    for (const p of prog.P.parts) for (const f of p.res.features) if (f.type === 'hole') for (const h of f.info?.holes ?? []) {
      const up = p.res.pc.buildDir;
      if (Math.abs(V.dot(h.axis, up)) < 1e-3 && !h.teardrop) out.push({ level: 'warning', kind: 'print.overhang', at: `${f.id}.${h.label}`, message: `horizontal hole without a teardrop: its top overhangs`, fix: "allow teardrops (default) or orient the hole vertically" });
    }
    return out;
  }, o),
  bridge: (o = {}) => R('bridge', () => [], o),
  minFeature: (o = {}) => R('minFeature', () => [], o),
  text: (o = {}) => R('text', () => [], o),
  firstLayer: (o = {}) => R('firstLayer', prog => {
    const min = mmv(o.minArea, 100);
    const pr = prog.data.print;
    if (!pr) return [];
    return Object.entries(pr.orientation).filter(([, x]) => x.bedContact < min).map(([k, x]) => ({ level: 'warning', kind: 'print.firstLayer', at: k, message: `first layer touches only ${x.bedContact.toFixed(0)} mm² of the bed`, fix: 'add a brim or reorient for more bed contact' }));
  }, o),
  custom: (name, fn) => R(name, (prog, ctx) => fn(prog, ctx) ?? []),
};
rules.fdm = rules('fdm', [rule.overhang(), rule.bedFit(), rule.minHole(), rule.minWall(), rule.holeOrientation(), rule.firstLayer()]);
rules.msla = rules('msla', [rule.overhang({ max: Math.PI / 6 }), rule.bedFit(), rule.minHole({ min: 0.5 }), rule.minWall({ min: 0.4 })]);
rules.printInPlace = rules('printInPlace', [rule.overhang(), rule.bedFit(), rule.minWall()]);
export function check(prog, rs) { return (rs?.isRules ? rs : rules('check', [].concat(rs))).check(prog, {}); }
