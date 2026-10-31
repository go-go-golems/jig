// pattern.js · patterns as group actions (README §4.3, example 10).
// A Pattern is a finite set of transforms; products multiply counts; filter/skip restrict; vary attaches params.
// Coincident instances are removed and recorded as a decision (pattern.dedupe).
import { Quantity, coerce, turn, fmtNum } from './units.js';
import { tx, Transform, Point, Dir, Vec, Frame, Axis, IDENTITY, origin, asAxis, asPlane, dir as mkDir, asPoint, toVec3, lenNum, angNum, plane as planes } from './geom.js';

const num = (x, scope) => {
  if (typeof x === 'number') return x;
  const v = coerce(x, 'number', scope ?? {});
  return typeof v === 'number' ? v : v.value;
};
function asDirLike(d) {
  if (d instanceof Dir) return d;
  if (d instanceof Axis) return d.dir;
  if (d instanceof Vec) return d.unit();
  if (typeof d === 'string' || Array.isArray(d)) return mkDir(d);
  throw new Error(`pattern: expected a direction, got ${String(d)}`);
}
function rotBetween(a, b) {
  // minimal rotation taking unit vector a to b
  const c = a.x * b.x + a.y * b.y + a.z * b.z;
  const cr = new Vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const s = cr.length;
  if (s < 1e-12) {
    if (c > 0) return IDENTITY;
    const ref = Math.abs(a.x) < 0.9 ? new Dir(1, 0, 0) : new Dir(0, 1, 0);
    return tx.rotate(new Axis(origin, a.cross(ref)), 180);
  }
  return tx.rotate(new Axis(origin, cr.unit()), Math.atan2(s, c) * 180 / Math.PI);
}

export class Pattern {
  constructor(kind, spec, ops = []) { this.kind = kind; this.spec = Object.freeze(spec); this.ops = Object.freeze(ops); Object.freeze(this); }
  _op(op) { return new Pattern(this.kind, this.spec, [...this.ops, op]); }
  times(q) { if (!(q instanceof Pattern)) throw new Error('times takes a pattern'); return new Pattern('product', { a: this, b: q }); }
  filter(fn) { return this._op({ op: 'filter', fn }); }
  skip(list) { return this._op({ op: 'skip', set: new Set([].concat(list)) }); }
  vary(fn) { return this._op({ op: 'vary', fn }); }

  // raw group elements (before ops): [{ index, tx }]
  base(ctx = {}) {
    const S = this.spec, scope = ctx.scope ?? {};
    switch (this.kind) {
      case 'linear': {
        const d = asDirLike(S.dir), n = Math.round(num(S.count, scope));
        let step;
        if (S.step != null) step = lenNum(S.step, scope);
        else if (S.extent != null) step = n > 1 ? lenNum(S.extent, scope) / (n - 1) : 0;
        else throw new Error('pattern.linear needs step or extent');
        return Array.from({ length: n }, (_, i) => ({ index: i, tx: tx.move(d.mul(i * step)) }));
      }
      case 'circular': {
        const ax = asAxis(S.axis), n = Math.round(num(S.count, scope));
        const ang = S.angle == null ? 2 * Math.PI : angNum(S.angle, scope);
        const closed = Math.abs(Math.abs(ang) - 2 * Math.PI) < 1e-9;
        const step = closed ? ang / n : n > 1 ? ang / (n - 1) : 0;
        return Array.from({ length: n }, (_, i) => ({ index: i, tx: i === 0 ? IDENTITY : tx.rotate(ax, (i * step * 180) / Math.PI) }));
      }
      case 'hex': {
        const pl = asPlane(S.plane), p = lenNum(S.pitch, scope), out = [];
        const put = (u, v) => out.push({ index: out.length, tx: tx.move(pl.x.mul(u).add(pl.y.mul(v))) });
        if (S.rings != null) {
          const R = Math.round(num(S.rings, scope));
          put(0, 0);
          for (let k = 1; k <= R; k++) {
            // walk ring k: start at axial (k, 0) and go around six sides
            const dirs = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
            let q = k, r = 0;
            for (const [dq, dr] of dirs) for (let s = 0; s < k; s++) {
              put(p * (q + r / 2), p * (r * Math.sqrt(3) / 2));
              q += dq; r += dr;
            }
          }
        } else {
          const [a, b] = S.count.map(c => Math.round(num(c, scope)));
          for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) put(p * (i + (j % 2) / 2), p * j * Math.sqrt(3) / 2);
        }
        return out;
      }
      case 'mirror': {
        const t = S.target instanceof Axis || typeof S.target === 'string' && /^[+-]?[XYZ]$/i.test(S.target) ? tx.mirror(S.target instanceof Axis ? S.target : asAxis(S.target)) : tx.mirror(S.target);
        return [{ index: 0, tx: IDENTITY }, { index: 1, tx: t }];
      }
      case 'points': {
        const pts = S.pts.map(asPoint);
        const ref = ctx.base ? asPoint(ctx.base) : pts[0] ?? origin;
        return pts.map((q, i) => ({ index: i, tx: tx.move(q.sub(ref)) }));
      }
      case 'path': {
        if (!ctx.path) return null;
        const n = Math.round(num(S.count, scope));
        const closed = !!ctx.path.closed;
        const at = t => { const r = ctx.path.at(t); return { p: asPoint(r.point), t: r.tangent ? asDirLike(r.tangent instanceof Dir ? r.tangent : toVec3(r.tangent)) : null }; };
        const first = at(0), out = [];
        for (let i = 0; i < n; i++) {
          const t = closed ? i / n : n > 1 ? i / (n - 1) : 0;
          const r = at(t);
          let T = tx.move(first.p.sub(origin).neg());
          if (S.align !== 'none' && first.t && r.t) T = T.then(rotBetween(first.t, r.t));
          T = T.then(tx.move(r.p.sub(origin)));
          out.push({ index: i, tx: T });
        }
        return out;
      }
      case 'product': {
        const sub = { ...ctx, dedupe: false };
        const A = this.spec.a.instances(sub), B = this.spec.b.instances(sub), nb = this.spec.b.base(ctx)?.length ?? B.length;
        if (!A || !B) return null;
        const out = [];
        for (const a of A) for (const b of B) out.push({ index: a.index * nb + b.index, tx: a.tx.then(b.tx), params: { ...a.params, ...b.params } });
        return out;
      }
    }
    throw new Error(`unknown pattern kind ${this.kind}`);
  }

  expand(ctx = {}) {
    const raw = this.base(ctx);
    const decisions = [], diagnostics = [];
    if (!raw) {
      diagnostics.push({ level: 'info', kind: 'pattern.deferred', at: ctx.at ?? null, message: 'path pattern: the kernel must supply ctx.path' });
      return { instances: [], count: null, total: null, filtered: 0, skipped: 0, deduped: 0, decisions, diagnostics, deferred: true };
    }
    const basePt = ctx.base ? asPoint(ctx.base) : origin;
    let list = raw.map(r => ({ index: r.index, tx: r.tx, at: r.tx.apply(basePt), params: { ...(r.params ?? {}) } }));
    let filtered = 0, skipped = 0;
    for (const op of this.ops) {
      if (op.op === 'filter') { const before = list.length; list = list.filter(inst => op.fn(inst, ctx)); filtered += before - list.length; }
      else if (op.op === 'skip') { const before = list.length; list = list.filter(inst => !op.set.has(inst.index)); skipped += before - list.length; }
      else if (op.op === 'vary') list = list.map(inst => ({ ...inst, params: { ...inst.params, ...(op.fn(inst, ctx) ?? {}) } }));
    }
    let deduped = 0;
    if (ctx.dedupe !== false && list.length > 1) {
      const seen = new Map(), out = [];
      const samples = ctx.samples ? ctx.samples.map(toVec3) : null;
      for (const inst of list) {
        const key = samples ? samples.map(s => inst.tx.applyArray(s).map(v => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6)).join(',')).sort().join(';') : inst.tx.key();
        const hasParams = Object.keys(inst.params).length > 0;
        const k2 = hasParams ? key + '|' + JSON.stringify(inst.params, (_, v) => (v instanceof Quantity ? v.key() : v)) : key;
        if (seen.has(k2)) { deduped++; continue; }
        seen.set(k2, inst); out.push(inst);
      }
      if (deduped) {
        decisions.push({ at: ctx.at ?? null, kind: 'pattern.dedupe', chose: out.length, alternatives: [list.length],
          reason: `${deduped} coincident instance${deduped > 1 ? 's' : ''} removed${samples ? ' (the feature is symmetric under part of the pattern)' : ''}` });
      }
      list = out;
    }
    return { instances: list, count: list.length, total: raw.length, filtered, skipped, deduped, decisions, diagnostics, deferred: false };
  }
  instances(ctx = {}) { const e = this.expand(ctx); return e.deferred ? null : e.instances; }
  get count() { try { return this.expand({ dedupe: false }).count; } catch { return null; } }
  get closed() {
    if (this.ops.some(o => o.op !== 'vary')) return false;
    if (this.kind === 'circular') { const a = this.spec.angle; return a == null || Math.abs(Math.abs(angNum(a)) - 2 * Math.PI) < 1e-9; }
    if (this.kind === 'mirror') return true;
    if (this.kind === 'product') return this.spec.a.closed && this.spec.b.closed;
    return false;
  }
  eq(q, tol = 1e-9) {
    const A = this.instances({ dedupe: false }), B = q.instances({ dedupe: false });
    if (!A || !B || A.length !== B.length) return false;
    const used = new Set();
    return A.every(a => { const i = B.findIndex((b, k) => !used.has(k) && a.tx.eq(b.tx, tol)); if (i < 0) return false; used.add(i); return true; });
  }
  toString() {
    const ops = this.ops.map(o => `.${o.op}(…)`).join('');
    if (this.kind === 'product') return `${this.spec.a} × ${this.spec.b}${ops}`;
    return `pattern.${this.kind}(${this.count ?? '?'})${ops}`;
  }
  toJSON() { return { pattern: this.kind, count: this.count, closed: this.closed }; }
}

export const pattern = {
  linear(d, { count, step, extent } = {}) { return new Pattern('linear', { dir: d, count, step, extent }); },
  circular(ax, { count, angle = null } = {}) { return new Pattern('circular', { axis: ax, count, angle: angle ?? null }); },
  grid(dA, dB, { count = [1, 1], step = [0, 0] } = {}) {
    return new Pattern('linear', { dir: dA, count: count[0], step: step[0] }).times(new Pattern('linear', { dir: dB, count: count[1], step: step[1] }));
  },
  hex(pl = planes.XY, { pitch, rings = null, count = null } = {}) { return new Pattern('hex', { plane: pl, pitch, rings, count }); },
  path(sel, { count, align = 'tangent' } = {}) { return new Pattern('path', { sel, count, align }); },
  mirror(target) { return new Pattern('mirror', { target }); },
  points(pts) { return new Pattern('points', { pts }); },
};
