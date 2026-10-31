// solved.js · a solved sketch: DOF, status, diagnostics, entities, profiles, drags, SketchData and the L3 dump.
import { solveSketch, analyseCluster, dragCluster } from './solver.js';
import { buildProfiles } from './profiles.js';
import { polar, sampleSpline, sampleEllipse, sweepCCW, sub, len, dot, norm, TAU } from './geom2d.js';
import { fmtNum, mm } from '../units.js';

const NICE = { ax: 'start.x', ay: 'start.y', bx: 'end.x', by: 'end.y', cx: 'center.x', cy: 'center.y', r: 'r', a0: 'start angle', a1: 'end angle',
  x: 'x', y: 'y', rx: 'rx', ry: 'ry', phi: 'angle', tx: 'x', ty: 'y', th: 'rotation' };
const DIMLESS = new Set(['parallel', 'perpendicular', 'tangent', 'equal', 'coincident', 'horizontal', 'vertical', 'symmetric', 'midpoint', 'concentric', 'collinear', 'on']);

export class SolvedSketch {
  constructor(sketch, sys, X, run, env = {}, extra = {}) {
    this.sketch = sketch; this.sys = sys; this.X = X; this.run = run; this.env = env;
    this.id = sketch.id;
    this.moved = extra.moved ?? null; this.fixed = extra.fixed ?? null; this.dragInfo = extra.drag ?? null;
    this._profiles = null;
  }
  static solve(sketch, sys, env) {
    const run = solveSketch(sys, { slot: sketch.solverSlot, sketchId: sketch.id });
    return new SolvedSketch(sketch, sys, run.X, run, env);
  }
  get n() { return this.run.clusters.reduce((s, c) => s + c.n, 0); }
  get rank() { return this.run.results.reduce((s, r) => s + (r.rank ?? 0), 0); }
  get dof() { return this.run.results.reduce((s, r) => s + (r.dof ?? 0), 0); }
  get conflicts() { return this.run.results.flatMap(r => r.conflicts); }
  get redundant() { return this.sys.cons.filter(c => c.status === 'redundant').map(c => c.id); }
  get unsolved() { return this.run.results.some(r => !r.converged); }
  get status() { return this.conflicts.length || this.unsolved ? 'over' : this.dof === 0 ? 'fully' : 'under'; }
  get decisions() { return [...this.sys.decisions, ...this.run.decisions]; }
  point(ref) { return this.sys.handle(ref).get(this.X); }
  // the script.js line of an entity or constraint record: its j.c.* value's own line inside .constrain(…), else the
  // line of the op that made it (a helper's constraints get the helper call, implicit ones the entity's call)
  lineOf(rec) {
    const op = rec && rec.op != null ? this.sketch.ops?.[rec.op] : null;
    if (!op) return null;
    if (rec.k != null && op.cs?.[rec.k]?.line != null) return op.cs[rec.k].line;
    return op.line ?? null;
  }
  // the same solution read through another builder with the same key (a feature cached across compiles: the new
  // script's sketch may sit on other lines)
  withSketch(sk) {
    if (!sk || sk === this.sketch) return this;
    const s = new SolvedSketch(sk, this.sys, this.X, this.run, this.env, { moved: this.moved, fixed: this.fixed, drag: this.dragInfo });
    s._profiles = this._profiles;
    return s;
  }

  // ── diagnostics ────────────────────────────────────────────────────────────
  get diagnostics() {
    const out = this.sys.diags.map(d => ({ ...d }));
    const at = this.id;
    for (const r of this.run.results) {
      for (const set of r.conflicts) {
        const cons = set.map(id => this.sys.cons.find(c => c.id === id));
        const dropped = cons.find(c => c.dropped) ?? cons[cons.length - 1];
        const measured = dropped && !DIMLESS.has(dropped.type) ? this.sys.measure(dropped, this.X) : null;
        out.push({ level: 'error', kind: 'sketch.overConstrained', at, conflict: set,
          message: `no solution; minimal conflicting set: ${cons.map(c => this.labelOf(c)).join(' · ')}`,
          fix: `drop one of the ${cons.length}; e.g. ${dropped && measured != null ? `make ${dropped.id} driven (it measures ${this.fmtValue(dropped, measured)})` : `remove ${dropped?.id}`}` });
      }
      if (!r.converged && !r.conflicts.length) out.push({ level: 'error', kind: 'sketch.unsolved', at, message: `the solver did not converge (residual ${r.residual.toExponential(1)})`, fix: "try .solver('lm') or better initial positions" });
    }
    for (const c of this.sys.cons) if (c.status === 'redundant') {
      const by = c.impliedBy?.length ? summarise(c.impliedBy) : null;
      out.push({ level: 'warning', kind: 'sketch.redundant', at, constraint: c.id,
        message: `${this.labelOf(c)} is ${c.partial ? 'partly ' : ''}implied by ${by ?? 'the other constraints'}${c.partial ? '' : '; dropped'}`,
        fix: 'remove it, or keep it as a driven (reference) constraint' });
    }
    if (this.status === 'under') {
      const free = this.freeSummary();
      out.push({ level: this.sketch.strictFlag ? 'error' : 'warning', kind: 'sketch.underConstrained', at,
        message: `${this.dof} DOF remain`, fix: `free: ${free.join(', ')}${this.sketch.strictFlag ? ' (strict sketch)' : ''}` });
    }
    return out;
  }
  freeSummary() {
    const out = [];
    for (const r of this.run.results) for (const [id, d] of r.entityDof ?? []) {
      if (!d) continue;
      const e = this.sys.entities.get(id);
      const names = Object.entries(e.p).filter(([, i]) => r.dofFree.has(i)).map(([k]) => NICE[k] ?? k);
      out.push(`${id} (${d}${names.length ? ': ' + compactNames(names) : ''})`);
    }
    return out.slice(0, 12);
  }
  labelOf(c) {
    const base = c.label && !/=/.test(c.label) ? c.label : c.label?.split(' = ')[0] ?? c.id;
    if (c.v == null || DIMLESS.has(c.type) || c.type === 'fix' || c.type === 'mapPoint' || c.type === 'scalarRel') return c.label ?? c.id;
    return `${c.type === 'radius' || c.type === 'diameter' || c.type === 'length' ? base.replace(/^dim/, c.type) : base} = ${this.fmtValue(c, c.v)}`;
  }
  fmtValue(c, v) {
    if (v == null) return '?';
    if (c.type === 'angle' || c.valueKind === 'angle') return `${fmtNum((v * 180) / Math.PI)}°`;
    return `${fmtNum(v)} mm`;
  }

  // ── entities and constraints as data ───────────────────────────────────────
  entityData() {
    const X = this.X, out = [];
    const free = new Map(), edof = new Map();
    for (const r of this.run.results) { for (const k of r.dofFree?.keys() ?? []) free.set(k, true); for (const [id, d] of r.entityDof ?? []) edof.set(id, d); }
    for (const id of this.sys.order) {
      const e = this.sys.entities.get(id), P = e.p, g = k => X[P[k]];
      const base = { id, kind: e.kind, construction: !!e.construction, external: !!e.external, group: e.group ?? null,
        dofFree: Object.entries(P).filter(([, i]) => free.has(i)).map(([k]) => NICE[k] ?? k), dof: edof.get(id) ?? 0, line: this.lineOf(e) };
      if (e.kind === 'point') out.push({ ...base, p: [g('x'), g('y')] });
      else if (e.kind === 'line') out.push({ ...base, a: [g('ax'), g('ay')], b: [g('bx'), g('by')] });
      else if (e.kind === 'circle') out.push({ ...base, c: [g('cx'), g('cy')], r: g('r') });
      else if (e.kind === 'arc') {
        const c = [g('cx'), g('cy')], r = g('r'), a0 = g('a0'), a1 = a0 + sweepCCW(a0, g('a1'));
        out.push({ ...base, c, r, a0, a1, ccw: true, start: polar(c, r, a0), end: polar(c, r, a1) });
      } else if (e.kind === 'ellipse') {
        const c = [g('cx'), g('cy')];
        out.push({ ...base, kind: 'spline', shape: 'ellipse', c, rx: g('rx'), ry: g('ry'), angle: g('phi'), closed: true, pts: sampleEllipse(c, g('rx'), g('ry'), g('phi')) });
      } else if (e.kind === 'spline') {
        const ctrl = Array.from({ length: e.meta.n }, (_, k) => [g(`x${k}`), g(`y${k}`)]);
        out.push({ ...base, ctrl, fit: e.meta.fit, degree: e.meta.degree, closed: e.meta.closed, pts: sampleSpline(ctrl, e.meta) });
      } else if (e.kind === 'rigid') {
        const loops = this.rigidLoops(e);
        out.push({ ...base, kind: 'spline', shape: 'import', c: [g('tx'), g('ty')], angle: g('th'), closed: true, pts: loops[0] ?? [], loops });
      }
    }
    return out;
  }
  rigidLoops(e) {
    const X = this.X, tx = X[e.p.tx], ty = X[e.p.ty], th = X[e.p.th], c = Math.cos(th), s = Math.sin(th);
    return e.meta.loops.map(L => L.map(([u, v]) => [tx + u * c - v * s, ty + u * s + v * c]));
  }
  constraintData() {
    return this.sys.cons.map(c => {
      const measured = c.driven ? this.sys.measure(c, this.X) : null;
      const v = c.driven ? measured : c.v;
      const isAng = c.type === 'angle';
      return {
        id: c.id, kind: c.type, refs: c.refs.map(r => (typeof r === 'string' ? r : Array.isArray(r) ? r.map(Number) : String(r))),
        value: v == null || Array.isArray(v) || DIMLESS.has(c.type) ? null : isAng ? (v * 180) / Math.PI : v,
        unit: v == null || DIMLESS.has(c.type) ? null : isAng ? 'deg' : 'mm',
        text: c.driven && v != null ? `${c.id} = ${this.fmtValue(c, v)}` : this.labelOf(c),
        expr: exprOf(c), ...(c.type === 'coord' ? { axis: c.opts?.k ? 'y' : 'x' } : {}),
        driven: !!c.driven, status: c.status === 'invalid' ? 'conflict' : c.status, src: c.src, impliedBy: c.impliedBy ?? null,
        line: this.lineOf(c),
      };
    });
  }
  // measure a driven dimension by id (for prog.sketch(id) and why())
  driven(id) { const c = this.sys.cons.find(k => k.id === id); return c ? this.sys.measure(c, this.X) : null; }

  // ── profiles ────────────────────────────────────────────────────────────────
  curves() {
    const X = this.X, out = [];
    for (const id of this.sys.order) {
      const e = this.sys.entities.get(id);
      if (e.construction) continue;
      const P = e.p, g = k => X[P[k]], group = e.group ?? id;
      if (e.kind === 'line') out.push({ kind: 'line', a: [g('ax'), g('ay')], b: [g('bx'), g('by')], src: id, group });
      else if (e.kind === 'circle') out.push({ kind: 'circle', c: [g('cx'), g('cy')], r: g('r'), src: id, group });
      else if (e.kind === 'arc') out.push({ kind: 'arc', c: [g('cx'), g('cy')], r: g('r'), a0: g('a0'), a1: g('a1'), src: id, group });
      else if (e.kind === 'ellipse') {
        const c = [g('cx'), g('cy')], pts = sampleEllipse(c, g('rx'), g('ry'), g('phi'), 128);
        out.push({ kind: 'poly', pts: pts.slice(0, -1), closed: true, src: id, group, exact: { kind: 'ellipse', c, rx: g('rx'), ry: g('ry'), angle: g('phi') } });
      } else if (e.kind === 'spline') {
        const ctrl = Array.from({ length: e.meta.n }, (_, k) => [g(`x${k}`), g(`y${k}`)]);
        const pts = sampleSpline(ctrl, { ...e.meta, per: 24 });
        out.push({ kind: 'poly', pts: e.meta.closed ? pts.slice(0, -1) : pts, closed: e.meta.closed, src: id, group,
          exact: e.meta.closed ? { kind: 'spline', pts: ctrl, fit: e.meta.fit, degree: e.meta.degree, closed: true } : null });
      } else if (e.kind === 'rigid') for (const L of this.rigidLoops(e)) out.push({ kind: 'poly', pts: L, closed: true, lines: true, src: id, group });
    }
    return out;
  }
  get arrangement() {
    if (!this._profiles) this._profiles = buildProfiles(this.curves());
    return this._profiles;
  }
  profiles() { return this.arrangement.profiles.map(p => regionOf(p)); }
  profile(pick) {
    const all = this.profiles();
    if (pick == null) return all;
    if (typeof pick === 'function') return all.filter((r, i) => pick(r, { index: i, all, default: all, sketch: this }));
    if (Array.isArray(pick) && typeof pick[0] === 'number') return all.filter(r => r.contains(pick));
    const ids = [].concat(pick);
    const hit = r => ids.some(id => r.outerSrcs.some(s => s === id || s.startsWith(id + '.')) || r.id === id);
    const out = all.filter(hit);
    return out.length ? out : all.filter(r => ids.some(id => r.srcs.some(s => s === id || s.startsWith(id + '.'))));
  }
  // an open or closed path through the given entities (in order), for sweeps and ribs
  wire(ids) {
    const list = this.sys.expandIds(ids), data = new Map(this.entityData().map(e => [e.id, e]));
    const segs = list.map(id => data.get(id)).map(e => {
      if (e.kind === 'line') return { kind: 'line', a: e.a, b: e.b, src: e.id };
      if (e.kind === 'arc') return { kind: 'arc', c: e.c, r: e.r, a0: e.a0, a1: e.a1, ccw: true, a: e.start, b: e.end, src: e.id };
      if (e.kind === 'circle') return { kind: 'circle', c: e.c, r: e.r, src: e.id };
      return { kind: 'spline', pts: e.ctrl ?? e.pts, fit: e.fit, degree: e.degree, closed: e.closed, src: e.id };
    });
    // orient: each piece starts where the previous one ended
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (!s.a && s.kind !== 'spline') continue;
      const start = x => (x.kind === 'spline' ? x.pts[0] : x.a), end = x => (x.kind === 'spline' ? x.pts[x.pts.length - 1] : x.b);
      const prevEnd = i ? end(segs[i - 1]) : null, next = segs[i + 1];
      const flip = prevEnd ? len(sub(end(s), prevEnd)) < len(sub(start(s), prevEnd)) : next && next.kind !== 'circle' && Math.min(len(sub(start(s), start(next))), len(sub(start(s), end(next)))) < Math.min(len(sub(end(s), start(next))), len(sub(end(s), end(next))));
      if (flip) segs[i] = reverseSeg(s);
    }
    const pts = [];
    for (const s of segs) {
      const p = s.kind === 'line' ? [s.a, s.b] : s.kind === 'arc' ? sampleArcSeg(s) : s.kind === 'circle' ? sampleArcSeg({ ...s, a0: 0, a1: TAU, ccw: true }) : sampleSpline(s.pts, s);
      pts.push(...(pts.length ? p.slice(1) : p));
    }
    const closed = pts.length > 2 && len(sub(pts[0], pts[pts.length - 1])) < 1e-6;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += len(sub(pts[i], pts[i - 1]));
    return { kind: 'wire', segments: segs, pts, closed, length };
  }

  // ── drag (runtime residual solve) ──────────────────────────────────────────
  drag(ref, to) {
    const H = this.sys.handle(ref);
    const target = Array.isArray(to) ? to.map(Number) : [to.x, to.y];
    const k = this.run.clusters.findIndex(c => H.vars.some(v => c.cols.includes(v)));
    if (k < 0) return new SolvedSketch(this.sketch, this.sys, this.X, this.run, this.env, { moved: [], fixed: this.sys.order.slice(), drag: { ref, iterations: 0, note: `${ref} is fixed` } });
    const X = Float64Array.from(this.X), cl = this.run.clusters[k], r0 = this.run.results[k];
    const cons = r0.activeCons.filter(c => !(c.status === 'redundant' && !c.partial));
    const t0 = performance.now();
    const info = dragCluster(this.sys, X, cl, cons, H, target);
    const analysis = analyseCluster(this.sys, X, cl, r0.activeCons);
    const results = this.run.results.slice();
    results[k] = { ...r0, ...analysis, iters: info.iterations, residual: info.residual, converged: info.converged };
    const moved = [], fixed = [];
    for (const id of this.sys.order) {
      const e = this.sys.entities.get(id);
      (Object.values(e.p).some(i => Math.abs(X[i] - this.X[i]) > 1e-9) ? moved : fixed).push(id);
    }
    return new SolvedSketch(this.sketch, this.sys, X, { ...this.run, results }, this.env,
      { moved, fixed, drag: { ref, to: target, cluster: k, iterations: info.iterations, ms: performance.now() - t0, residual: info.residual } });
  }

  toSketchData() {
    return {
      id: this.id, plane: this.plane(), dof: this.dof, status: this.status, rank: this.rank, n: this.n,
      entities: this.entityData(), constraints: this.constraintData(),
      conflicts: this.conflicts, redundant: this.redundant,
      clusters: this.run.clusters.map((c, k) => ({ index: k, entities: c.entities, dof: this.run.results[k].dof, solver: this.run.results[k].used, iterations: this.run.results[k].iters })),
      profiles: this.arrangement.profiles.map(p => ({ id: p.id, loops: p.loops, segments: p.segments, area: p.area, outer: 0 })),
      diagnostics: this.diagnostics,
      dump: this.ir(),                      // the IR view's L3 block for this sketch: solver, iterations, equations, rank
      ...(this.moved ? { moved: this.moved, fixed: this.fixed, drag: this.dragInfo } : {}),
    };
  }
  plane() {
    const pl = this.env.plane ?? this.sketch.on;
    if (pl && typeof pl.toPlaneData === 'function') return pl.toPlaneData();
    return { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1], deferred: !!pl };
  }
  ir() {
    const ents = this.sys.order.map(id => { const e = this.sys.entities.get(id); return `${id} ${e.kind} ${Object.values(e.p).filter(i => !this.sys.fixed[i]).length}`; });
    const counts = new Map();
    for (const c of this.sys.cons) if (c.eqs?.length && !c.driven) { const k = c.type; const v = counts.get(k) ?? [0, 0]; counts.set(k, [v[0] + 1, v[1] + c.eqs.length]); }
    const eqs = [...counts].map(([k, [n, m]]) => `${k}${n > 1 ? '×' + n : ''} (${m})`);
    const m = [...counts.values()].reduce((s, v) => s + v[1], 0);
    const solved = this.entityData().slice(0, 16).map(e => e.kind === 'line' ? `${e.id} (${e.a.map(fmtNum)})→(${e.b.map(fmtNum)})` : e.kind === 'arc' || e.kind === 'circle' ? `${e.id} c(${e.c.map(fmtNum)}) r${fmtNum(e.r)}` : e.kind === 'point' ? `${e.id} (${e.p.map(fmtNum)})` : `${e.id} ${e.kind}`);
    const its = this.run.results.reduce((s, r) => s + r.iters, 0), res = Math.max(0, ...this.run.results.map(r => r.residual));
    const solverName = [...new Set(this.run.results.filter(r => r.used).map(r => r.used))].join('/') || 'none';
    return [
      `sketch ${this.id} (L3) on ${this.sketch.on?.name ?? 'plane'} · solver ${solverName} · ${this.run.clusters.length} cluster${this.run.clusters.length === 1 ? '' : 's'} · ${its} iterations · residual ${res.toExponential(0)}`,
      `  entities   ${ents.join(' · ')}   Σ ${this.n}`,
      `  equations  ${eqs.join(' · ')}   Σ ${m}`,
      `  rank ${this.rank} · dof ${this.dof} · status ${this.status}${this.conflicts.length ? ` · conflicts ${this.conflicts.map(s => '{' + s.join(', ') + '}').join(' ')}` : ''}${this.redundant.length ? ` · redundant ${this.redundant.join(', ')}` : ''}`,
      `  solved     ${solved.join(' · ')}`,
      `  profiles   ${this.arrangement.profiles.map(p => `${p.id} ${fmtNum(p.area)} mm²`).join(' · ') || 'none'}`,
    ].join('\n');
  }
}

// the expression a value came from ('w', 'd / 2'), when it was written as one; null for a literal
function exprOf(c) {
  const v = c.value;
  if (typeof v === 'string') return v.trim() || null;
  if (v && typeof v === 'object' && v.kind === 'expr' && typeof v.text === 'string') return v.text;
  return typeof c.opts?.expr === 'string' ? c.opts.expr : null;
}

function regionOf(p) {
  return Object.freeze({
    kind: 'region', id: p.id, area: mm(1).mul(mm(p.area)), areaValue: p.area, loops: p.loops, segments: p.segments, holes: p.loops.length - 1,
    srcs: p.srcs, outerSrcs: [...new Set(p.segments[0].map(s => s.src))], contains: p.contains, depth: p.depth,
    toJSON() { return { id: p.id, area: p.area, loops: p.loops.length }; },
  });
}
function summarise(ids) {
  const byType = new Map();
  for (const id of ids) { const t = id.split('(')[0]; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(id); }
  return [...byType].map(([t, l]) => (l.length > 1 ? `${t}×${l.length}` : l[0])).join(' + ');
}
function compactNames(names) {
  const s = new Set(names);
  const out = [];
  for (const p of ['start', 'end', 'center']) if (s.has(`${p}.x`) && s.has(`${p}.y`)) { out.push(p); s.delete(`${p}.x`); s.delete(`${p}.y`); }
  return [...out, ...s].join(', ');
}
function reverseSeg(s) {
  if (s.kind === 'line') return { ...s, a: s.b, b: s.a };
  if (s.kind === 'arc') return { ...s, a0: s.a1, a1: s.a0, ccw: !s.ccw, a: s.b, b: s.a };
  if (s.kind === 'spline') return { ...s, pts: s.pts.slice().reverse() };
  return s;
}
function sampleArcSeg(s) {
  const sw = s.ccw ? sweepCCW(s.a0, s.a1) : -sweepCCW(s.a1, s.a0);
  const n = Math.max(8, Math.ceil(Math.abs(sw) / (Math.PI / 90)));
  return Array.from({ length: n + 1 }, (_, i) => polar(s.c, s.r, s.a0 + (sw * i) / n));
}
