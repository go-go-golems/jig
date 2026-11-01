// system.js · a sketch compiled to a parameter vector, entities, refs and constraint records.
// Entity parameters: point (x, y) · line (ax, ay, bx, by) · circle (cx, cy, r) · arc (cx, cy, r, a0, a1)
// · ellipse (cx, cy, rx, ry, phi) · spline (x0, y0, …) · rigid import (tx, ty, th). External entities are fixed.
import { Quantity, coerce } from '../units.js';
import { equations, ConstraintError, VALUE_KIND, measure, eqS } from './constraints.js';
import { polar, sub, cross, len, sweepCCW, TAU } from './geom2d.js';
import * as S from './sym.js';

const SUBS = new Set(['start', 'end', 'mid', 'center']);

export class System {
  constructor(id, env = {}) {
    this.id = id;
    this.env = env;
    this.scope = env.scope ?? {};
    this.x = []; this.fixed = []; this.pname = []; this.pent = [];
    this.entities = new Map();
    this.order = [];
    this.cons = [];
    this.aliases = new Map();
    this.groups = new Map();            // helper id → [entity ids]
    this.diags = [];
    this.decisions = [];
    this.consIds = new Set();
    this.opIndex = null;                // the op being run (Sketch.system), recorded on entities and constraints
    this.consK = null;                  // the index of a user constraint within its .constrain(…) call
  }
  // ── parameters and entities ────────────────────────────────────────────
  param(ent, name, v, fixed = false) {
    const i = this.x.length;
    this.x.push(Number.isFinite(v) ? v : 0); this.fixed.push(!!fixed); this.pname.push(`${ent}.${name}`); this.pent.push(ent);
    return i;
  }
  addEntity(id, kind, params, { construction = false, external = false, group = null, meta = {} } = {}) {
    if (this.entities.has(id)) throw new ConstraintError(`sketch ${this.id}: duplicate id '${id}'`);
    const p = {};
    for (const [k, v] of Object.entries(params)) p[k] = this.param(id, k, v, external);
    const e = { id, kind, p, construction, external, group, meta, op: this.opIndex };
    this.entities.set(id, e);
    this.order.push(id);
    if (group) { if (!this.groups.has(group)) this.groups.set(group, []); this.groups.get(group).push(id); }
    return e;
  }
  removeEntity(id) {
    this.entities.delete(id);
    this.order = this.order.filter(x => x !== id);
    this.cons = this.cons.filter(c => !c.refs.some(r => typeof r === 'string' && (r === id || r.startsWith(id + '.') || r.startsWith(id + '#'))));
  }
  numLen(v, fallback = 10) {
    if (v == null) return fallback;
    const q = coerce(v, 'length', this.scope);
    return q instanceof Quantity ? q.value : Number(q);
  }
  numAng(v) {
    const q = coerce(v, 'angle', this.scope);
    return q instanceof Quantity ? q.value : Number(q);
  }
  // a coordinate pair or a ref → [x, y] (current value)
  posOf(v) {
    if (Array.isArray(v)) return [this.numLen(v[0], 0), this.numLen(v[1], 0)];
    if (v && typeof v === 'object' && 'x' in v && 'y' in v) return [v.x, v.y];
    return this.handle(v).get(this.x);
  }
  isRef(v) { return typeof v === 'string'; }
  // ── refs ───────────────────────────────────────────────────────────────
  canon(ref) {
    let r = ref, guard = 0;
    while (this.aliases.has(r) && guard++ < 50) r = this.aliases.get(r);
    if (typeof r !== 'string') return r;
    // alias on the base of a sub-ref ('r.tl.center' when r.tl is an alias)
    const i = r.lastIndexOf('.');
    if (i > 0 && !this.entities.has(r)) {
      const base = r.slice(0, i), s = r.slice(i + 1);
      if (this.aliases.has(base)) return this.canon(`${this.canon(base)}.${s}`);
    }
    return r;
  }
  entityOf(ref) {
    const r = this.canon(ref);
    if (this.entities.has(r)) return { e: this.entities.get(r), sub: null };
    const h = r.indexOf('#');
    if (h > 0 && this.entities.has(r.slice(0, h))) return { e: this.entities.get(r.slice(0, h)), sub: r.slice(h) };
    const i = r.lastIndexOf('.');
    if (i > 0 && this.entities.has(r.slice(0, i))) return { e: this.entities.get(r.slice(0, i)), sub: r.slice(i + 1) };
    return null;
  }
  vars(...idx) { return idx.filter(i => !this.fixed[i]); }
  // handles: get(x) evaluates; s is the same quantity as a sym.js expression (for taped equations)
  ptH(ix, iy) { return { kind: 'point', vars: this.vars(ix, iy), get: x => [x[ix], x[iy]], s: [S.X(ix), S.X(iy)] }; }
  scalarH(i) { return { kind: 'scalar', vars: this.vars(i), get: x => x[i], s: S.X(i) }; }
  constPoint(p) { return { kind: 'point', vars: [], get: () => p, const: true, s: [S.K(p[0]), S.K(p[1])] }; }
  constLine(a, b) { return { kind: 'line', a: this.constPoint(a), b: this.constPoint(b), vars: [], const: true }; }

  entityHandle(e) {
    const p = e.p;
    switch (e.kind) {
      case 'point': return { ...this.ptH(p.x, p.y), ent: e.id };
      case 'line': {
        const a = this.ptH(p.ax, p.ay), b = this.ptH(p.bx, p.by);
        const mid = { kind: 'point', vars: [...a.vars, ...b.vars], get: x => [(x[p.ax] + x[p.bx]) / 2, (x[p.ay] + x[p.by]) / 2], s: S.vmid(a.s, b.s) };
        return { kind: 'line', a, b, mid, vars: [...a.vars, ...b.vars], ent: e.id };
      }
      case 'circle': {
        const c = this.ptH(p.cx, p.cy), r = this.scalarH(p.r);
        return { kind: 'circle', c, r, vars: [...c.vars, ...r.vars], ent: e.id };
      }
      case 'arc': {
        const c = this.ptH(p.cx, p.cy), r = this.scalarH(p.r), a0 = this.scalarH(p.a0), a1 = this.scalarH(p.a1);
        const at = (fa) => ({ kind: 'point', vars: this.vars(p.cx, p.cy, p.r, ...fa.idx), get: x => polar([x[p.cx], x[p.cy]], x[p.r], fa.f(x)), s: S.polar(c.s, r.s, fa.s) });
        return {
          kind: 'arc', c, r, a0, a1, ent: e.id, vars: this.vars(p.cx, p.cy, p.r, p.a0, p.a1),
          start: at({ idx: [p.a0], f: x => x[p.a0], s: a0.s }), end: at({ idx: [p.a1], f: x => x[p.a1], s: a1.s }),
          mid: at({ idx: [p.a0, p.a1], f: x => x[p.a0] + sweepCCW(x[p.a0], x[p.a1]) / 2, s: S.add(a0.s, S.div(S.sweepCCW(a0.s, a1.s), 2)) }),
        };
      }
      case 'ellipse': {
        const c = this.ptH(p.cx, p.cy);
        return { kind: 'ellipse', c, rx: this.scalarH(p.rx), ry: this.scalarH(p.ry), phi: this.scalarH(p.phi), vars: this.vars(p.cx, p.cy, p.rx, p.ry, p.phi), ent: e.id };
      }
      case 'spline': {
        const pts = e.meta.n ? Array.from({ length: e.meta.n }, (_, k) => this.ptH(p[`x${k}`], p[`y${k}`])) : [];
        return { kind: 'spline', pts, vars: pts.flatMap(q => q.vars), ent: e.id, meta: e.meta };
      }
      case 'rigid': {
        const c = this.ptH(p.tx, p.ty);
        return { kind: 'rigid', c, th: this.scalarH(p.th), vars: this.vars(p.tx, p.ty, p.th), ent: e.id };
      }
    }
    throw new ConstraintError(`entity kind ${e.kind}`);
  }
  handle(ref) {
    if (Array.isArray(ref)) {
      const p = this.posOf(ref);
      return this.constPoint(p);
    }
    if (ref && typeof ref === 'object' && ref.kind) return ref;
    if (ref === 'origin') return this.constPoint([0, 0]);
    if (ref === 'X') return this.constLine([0, 0], [1, 0]);
    if (ref === 'Y') return this.constLine([0, 0], [0, 1]);
    if (typeof ref !== 'string') throw new ConstraintError(`bad ref ${JSON.stringify(ref)}`);
    const hit = this.entityOf(ref);
    if (!hit) throw new ConstraintError(`unknown ref '${ref}'`);
    const H = this.entityHandle(hit.e);
    if (!hit.sub) return H;
    const s = hit.sub;
    if (s.startsWith('#')) {
      const k = s.slice(1);
      if (hit.e.p[k] == null) throw new ConstraintError(`unknown parameter '${ref}'`);
      return this.scalarH(hit.e.p[k]);
    }
    if (H.kind === 'line' && (s === 'start' || s === 'end' || s === 'mid')) return s === 'start' ? H.a : s === 'end' ? H.b : H.mid;
    if (H.kind === 'arc' && SUBS.has(s)) return s === 'center' ? H.c : H[s];
    if ((H.kind === 'circle' || H.kind === 'ellipse' || H.kind === 'rigid') && s === 'center') return H.c;
    if (H.kind === 'spline') {
      if (s === 'start') return H.pts[0];
      if (s === 'end') return H.pts[H.pts.length - 1];
      const m = /^p(\d+)$/.exec(s);
      if (m && H.pts[+m[1]]) return H.pts[+m[1]];
    }
    if (H.kind === 'point' && s === 'center') return H;
    throw new ConstraintError(`'${ref}': ${hit.e.kind} has no '${s}'`);
  }
  kindOf(ref) { try { return this.handle(ref).kind; } catch { return null; } }
  // helper ids expand to their entities ('r' → r.bottom, r.right, …)
  expandIds(ids) {
    const out = [];
    for (const id of [].concat(ids)) {
      const c = this.canon(id);
      if (this.entities.has(c)) out.push(c);
      else if (this.groups.has(id)) out.push(...this.groups.get(id).filter(x => this.entities.has(x)));
      else {
        const pre = this.order.filter(x => x.startsWith(id + '.'));
        if (pre.length) out.push(...pre);
        else this.diag('error', 'sketch.ref', `unknown id '${id}'`);
      }
    }
    return [...new Set(out)];
  }
  // ── constraints ────────────────────────────────────────────────────────
  addCons({ type, refs, value = null, driven = false, src = 'user', id = null, label = null, opts = {}, valueKind = null }) {
    let cid = id ?? `${type}(${refs.map(refText).join(', ')})`;
    if (this.consIds.has(cid)) { let k = 2; while (this.consIds.has(`${cid}#${k}`)) k++; cid = `${cid}#${k}`; }
    this.consIds.add(cid);
    const rec = { id: cid, type, refs: refs.map(r => (typeof r === 'string' ? this.canon(r) : r)), value, driven, src, label, opts, valueKind, status: 'ok', op: this.opIndex, k: this.consK };
    this.cons.push(rec);
    return rec;
  }
  diag(level, kind, message, extra = {}) { this.diags.push({ level, kind, at: this.id, message, ...extra }); }

  resolveValue(rec) {
    if (rec.value == null) return null;
    if (rec.type === 'mapPoint' || rec.type === 'scalarRel') return rec.value;
    if (rec.type === 'fix') return Array.isArray(rec.value) ? this.posOf(rec.value) : null;
    const kind = rec.valueKind ?? VALUE_KIND[rec.type] ?? 'length';
    if (typeof rec.value === 'number' && rec.opts.canonical) return rec.value;
    if (typeof rec.value === 'function') return rec.value(this);
    return kind === 'angle' ? this.numAng(rec.value) : this.numLen(rec.value);
  }

  // build the equations of every constraint (after all ops have run)
  // endpoints joined by coincidences (union-find over canonical point refs)
  endpointGroups() {
    const parent = new Map();
    const find = a => { if (!parent.has(a)) parent.set(a, a); while (parent.get(a) !== a) a = parent.get(a); return a; };
    for (const c of this.cons) if (c.type === 'coincident' && c.refs.every(r => typeof r === 'string')) {
      const a = find(this.canon(c.refs[0])), b = find(this.canon(c.refs[1]));
      if (a !== b) parent.set(a, b);
    }
    return r => find(this.canon(r));
  }
  sharedEnd(A, B, group) {
    const ends = id => { const e = this.entities.get(this.canon(id)); return e && (e.kind === 'line' || e.kind === 'arc') ? ['start', 'end'] : []; };
    for (const a of ends(A)) for (const b of ends(B)) if (group(`${this.canon(A)}.${a}`) === group(`${this.canon(B)}.${b}`)) return { a, b };
    return null;
  }
  finalize() {
    const x0 = Float64Array.from(this.x);
    this.x0 = x0;
    const group = this.endpointGroups();
    for (const rec of this.cons) if (rec.type === 'tangent' && rec.refs.every(r => typeof r === 'string')) {
      const sh = this.sharedEnd(rec.refs[0], rec.refs[1], group);
      if (sh) rec.opts = { ...rec.opts, shared: sh };
    }
    for (const rec of this.cons) {
      rec.eqs = [];
      try {
        rec.hs = rec.refs.map(r => this.handle(r));
        rec.v = this.resolveValue(rec);
        if (rec.driven) continue;
        if (rec.type === 'coord') { const P = rec.hs[0], k = rec.opts.k, v = rec.v; rec.eqs = [eqS(P.vars, S.sub(P.s[k], v))]; }
        else rec.eqs = equations(rec.type, rec.hs, rec.v, x0, rec.opts);
        rec.eqs = rec.eqs.filter(e => e.vars.length > 0 || Math.abs(e.f(x0)) > 1e-9);
      } catch (e) {
        rec.status = 'invalid';
        rec.error = e.message;
        this.diag('error', 'sketch.ref', `${rec.id}: ${e.message}`);
      }
    }
    return this;
  }
  measure(rec, x) { try { return measure(rec.type, rec.hs, x); } catch { return null; } }
}

export const refText = r => (Array.isArray(r) ? `(${r.map(v => (typeof v === 'number' ? +v.toFixed(4) : String(v))).join(', ')})` : typeof r === 'string' ? r : r?.ent ?? '?');

// ── entity creation helpers (used by ops.js) ─────────────────────────────
export function addPoint(sys, id, at, opts = {}) {
  const p = sys.posOf(at ?? [0, 0]);
  const e = sys.addEntity(id, 'point', { x: p[0], y: p[1] }, opts);
  if (typeof at === 'string') sys.addCons({ type: 'coincident', refs: [id, at], src: 'implicit' });
  else coordExprs(sys, id, at);
  return e;
}
// expression coordinates drive the geometry: '…' in an array is a dimension, not a guess
export function coordExprs(sys, ref, at) {
  if (!Array.isArray(at)) return;
  at.forEach((v, k) => { if (typeof v === 'string') sys.addCons({ type: 'coord', refs: [ref], value: v, opts: { k }, src: 'helper', label: `${k ? 'y' : 'x'}(${ref}) = ${v}` }); });
}
export function addLine(sys, id, a, b, opts = {}) {
  const pa = sys.posOf(a), pb = sys.posOf(b);
  const e = sys.addEntity(id, 'line', { ax: pa[0], ay: pa[1], bx: pb[0], by: pb[1] }, opts);
  if (typeof a === 'string') sys.addCons({ type: 'coincident', refs: [`${id}.start`, a], src: 'implicit' }); else coordExprs(sys, `${id}.start`, a);
  if (typeof b === 'string') sys.addCons({ type: 'coincident', refs: [`${id}.end`, b], src: 'implicit' }); else coordExprs(sys, `${id}.end`, b);
  return e;
}
export function addCircle(sys, id, r, at, opts = {}) {
  const c = sys.posOf(at ?? [0, 0]);
  const e = sys.addEntity(id, 'circle', { cx: c[0], cy: c[1], r: sys.numLen(r, 5) }, opts);
  if (typeof at === 'string') sys.addCons({ type: 'coincident', refs: [`${id}.center`, at], src: 'implicit' }); else coordExprs(sys, `${id}.center`, at);
  if (typeof r === 'string') sys.addCons({ type: 'radius', refs: [id], value: r, src: 'helper', label: `radius(${id}) = ${r}` });
  return e;
}
// arc from centre/start/end (ccw from start to end) or through three points
export function addArc(sys, id, spec, opts = {}) {
  let c, r, a0, a1;
  const refs = {};
  if (spec.through) {
    const [A, B, Cc] = spec.through.map(v => sys.posOf(v));
    const circ = circleFromThree(A, B, Cc);
    if (!circ) throw new ConstraintError(`arc ${id}: the three points are collinear`);
    c = circ.c; r = circ.r;
    let s = Math.atan2(A[1] - c[1], A[0] - c[0]), e = Math.atan2(Cc[1] - c[1], Cc[0] - c[0]), m = Math.atan2(B[1] - c[1], B[0] - c[0]);
    const ccw = sweepCCW(s, m) < sweepCCW(s, e);
    if (ccw) { a0 = s; a1 = e; refs.start = spec.through[0]; refs.end = spec.through[2]; }
    else { a0 = e; a1 = s; refs.start = spec.through[2]; refs.end = spec.through[0]; }
    if (typeof spec.through[1] === 'string') refs.on = spec.through[1];
  } else {
    let { center, start, end } = spec;
    if (spec.ccw === false || spec.cw) [start, end] = [end, start];
    c = sys.posOf(center ?? [0, 0]);
    const S = sys.posOf(start), E = sys.posOf(end);
    r = spec.r != null ? sys.numLen(spec.r) : len(sub(S, c));
    a0 = Math.atan2(S[1] - c[1], S[0] - c[0]); a1 = Math.atan2(E[1] - c[1], E[0] - c[0]);
    refs.start = start; refs.end = end; refs.center = center;
  }
  if (a1 <= a0) a1 += TAU;
  const e = sys.addEntity(id, 'arc', { cx: c[0], cy: c[1], r, a0, a1 }, opts);
  for (const k of ['start', 'end', 'center']) if (typeof refs[k] === 'string') sys.addCons({ type: 'coincident', refs: [`${id}.${k}`, refs[k]], src: 'implicit' });
  if (Array.isArray(refs.center)) coordExprs(sys, `${id}.center`, refs.center);
  if (refs.on) sys.addCons({ type: 'on', refs: [refs.on, id], src: 'implicit' });
  return e;
}
function circleFromThree(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}
export function setPoint(sys, ref, p) {
  // move the parameters behind a simple point ref (line ends, point entities, arc ends via angle)
  const hit = sys.entityOf(ref);
  if (!hit) return;
  const { e, sub: s } = hit, P = e.p, X = sys.x;
  if (e.kind === 'point') { X[P.x] = p[0]; X[P.y] = p[1]; }
  else if (e.kind === 'line') { if (s === 'start') { X[P.ax] = p[0]; X[P.ay] = p[1]; } else if (s === 'end') { X[P.bx] = p[0]; X[P.by] = p[1]; } }
  else if (e.kind === 'arc' && (s === 'start' || s === 'end')) {
    const a = Math.atan2(p[1] - X[P.cy], p[0] - X[P.cx]);
    if (s === 'start') X[P.a0] = a; else { X[P.a1] = a; while (X[P.a1] <= X[P.a0]) X[P.a1] += TAU; }
  }
}
export { polar, cross };
