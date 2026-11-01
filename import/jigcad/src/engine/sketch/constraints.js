// constraints.js · j.c.* constructors and the equations each constraint contributes (README §4.5).
// Every equation is { vars, f(x) } over the sketch's parameter vector; residuals are in mm or radians.
import { sub, dot, cross, len, wrapPi, TAU } from './geom2d.js';
import { stampLine } from '../callsite.js';
import * as S from './sym.js';

// a j.c.* value remembers the script.js line it was written on (non-enumerable, like a sketch op's)
const C = (type, refs, value = null, opts = {}) => Object.freeze(stampLine({ kind: 'constraint', type, refs: Object.freeze(refs), value, opts: Object.freeze({ ...opts }) }));
export const c = {
  coincident: (a, b, o) => C('coincident', [a, b], null, o),
  horizontal: (a, b, o) => C('horizontal', b == null || typeof b === 'object' ? [a] : [a, b], null, typeof b === 'object' ? b : o),
  vertical: (a, b, o) => C('vertical', b == null || typeof b === 'object' ? [a] : [a, b], null, typeof b === 'object' ? b : o),
  parallel: (a, b, o) => C('parallel', [a, b], null, o),
  perpendicular: (a, b, o) => C('perpendicular', [a, b], null, o),
  tangent: (a, b, o = {}) => C('tangent', [a, b], null, o),
  equal: (a, b, o) => C('equal', [a, b], null, o),
  symmetric: (a, b, axis, o) => C('symmetric', [a, b, axis], null, o),
  midpoint: (p, l, o) => C('midpoint', [p, l], null, o),
  concentric: (a, b, o) => C('concentric', [a, b], null, o),
  collinear: (a, b, o) => C('collinear', [a, b], null, o),
  on: (p, curve, o) => C('on', [p, curve], null, o),
  fix: (a, at = null, o) => C('fix', [a], at, o),
  distance: (a, b, d, o) => C('distance', [a, b], d, o),
  distanceX: (a, b, d, o) => C('distanceX', [a, b], d, o),
  distanceY: (a, b, d, o) => C('distanceY', [a, b], d, o),
  angle: (a, b, th, o) => C('angle', [a, b], th, o),
  radius: (a, r, o) => C('radius', [a], r, o),
  diameter: (a, d, o) => C('diameter', [a], d, o),
  length: (l, d, o) => C('length', [l], d, o),
};
export const VALUE_KIND = { distance: 'length', distanceX: 'length', distanceY: 'length', angle: 'angle', radius: 'length', diameter: 'length', length: 'length', fix: 'point' };

const uni = (...lists) => [...new Set(lists.flat())];
// An equation is { vars, f(x), s }: s is its residual as a sym.js expression (jig-compute evaluates it as a tape);
// f is compiled from s with the same operation order as the closures this file used to hold.
export const eqS = (vars, s) => ({ vars, f: S.compile(s), s });
const dirS = L => S.vsub(L.b.s, L.a.s);
const dirOf = L => x => sub(L.b.get(x), L.a.get(x));
const isLine = h => h.kind === 'line';
const isCirc = h => h.kind === 'circle' || h.kind === 'arc';
const isPoint = h => h.kind === 'point';
const centerOf = h => (h.kind === 'point' ? h : h.c);
// normalised cross/dot of two directions: op(u, v) / ((|u|·|v|) || 1e-300)
const ncross = (u, v) => S.div(S.vcross(u, v), S.nz(S.mul(S.vlen(u), S.vlen(v))));
const ndot = (u, v) => S.div(S.vdot(u, v), S.nz(S.mul(S.vlen(u), S.vlen(v))));

export class ConstraintError extends Error { constructor(m) { super(m); this.name = 'ConstraintError'; } }
const bad = (type, hs) => { throw new ConstraintError(`${type} does not apply to ${hs.map(h => h.kind).join(' and ')}`); };

// signed distance from point p to line (a → b), positive on the left (numeric, for side choices at x0)
const sdist = (p, a, b) => { const d = sub(b, a); return cross(d, sub(p, a)) / (len(d) || 1e-300); };
const initSign = (v) => (v < -1e-12 ? -1 : 1);

// equations(type, handles, value, x0, opts) → [{ vars, f, s }]; x0 = initial guess for side choices
export function equations(type, hs, value, x0, opts = {}) {
  const [A, B, X] = hs;
  switch (type) {
    case 'coincident': {
      if (isPoint(A) && isPoint(B)) return pointEq(A, B);
      if (isPoint(A)) return equations('on', [A, B], null, x0);
      if (isPoint(B)) return equations('on', [B, A], null, x0);
      if (isCirc(A) && isCirc(B)) return [...pointEq(A.c, B.c), eqS(uni(A.r.vars, B.r.vars), S.sub(A.r.s, B.r.s))];
      return bad(type, hs);
    }
    case 'horizontal': case 'vertical': {
      const k = type === 'horizontal' ? 1 : 0;
      if (hs.length === 1 && isLine(A)) return [eqS(A.vars, S.sub(A.b.s[k], A.a.s[k]))];
      if (hs.length === 2 && isPoint(A) && isPoint(B)) return [eqS(uni(A.vars, B.vars), S.sub(B.s[k], A.s[k]))];
      return bad(type, hs);
    }
    case 'parallel': case 'perpendicular': {
      if (!isLine(A) || !isLine(B)) return bad(type, hs);
      return [eqS(uni(A.vars, B.vars), (type === 'parallel' ? ncross : ndot)(dirS(A), dirS(B)))];
    }
    case 'tangent': {
      if (opts.shared) return tangentAtEnd(A, B, opts.shared);
      if (isLine(A) && isCirc(B)) return tangentLC(A, B, x0);
      if (isCirc(A) && isLine(B)) return tangentLC(B, A, x0);
      if (isCirc(A) && isCirc(B)) {
        const d0 = len(sub(A.c.get(x0), B.c.get(x0))), r1 = A.r.get(x0), r2 = B.r.get(x0);
        const external = Math.abs(d0 - (r1 + r2)) <= Math.abs(d0 - Math.abs(r1 - r2));
        const s = initSign(r1 - r2);
        const d = S.vlen(S.vsub(A.c.s, B.c.s));
        return [eqS(uni(A.vars, B.vars), external ? S.sub(d, S.add(A.r.s, B.r.s)) : S.sub(d, S.mul(s, S.sub(A.r.s, B.r.s))))];
      }
      if (isLine(A) && isLine(B)) return equations('parallel', [A, B], null, x0);
      if (A.kind === 'spline' || B.kind === 'spline') return tangentSpline(A.kind === 'spline' ? A : B, A.kind === 'spline' ? B : A, x0);
      return bad(type, hs);
    }
    case 'equal': {
      if (isLine(A) && isLine(B)) return [eqS(uni(A.vars, B.vars), S.sub(S.vlen(dirS(A)), S.vlen(dirS(B))))];
      if (isCirc(A) && isCirc(B)) return [eqS(uni(A.r.vars, B.r.vars), S.sub(A.r.s, B.r.s))];
      if (A.kind === 'ellipse' && B.kind === 'ellipse') return [eqS(uni(A.rx.vars, B.rx.vars), S.sub(A.rx.s, B.rx.s)), eqS(uni(A.ry.vars, B.ry.vars), S.sub(A.ry.s, B.ry.s))];
      return bad(type, hs);
    }
    case 'symmetric': {
      if (isPoint(A) && isPoint(B)) return symPoints(A, B, X);
      if (isLine(A) && isLine(B)) return [...symPoints(A.a, B.a, X), ...symPoints(A.b, B.b, X)];
      if (isCirc(A) && isCirc(B)) return [...symPoints(A.c, B.c, X), eqS(uni(A.r.vars, B.r.vars), S.sub(A.r.s, B.r.s))];
      return bad(type, hs);
    }
    case 'symMid': {   // midpoint of A, B on the axis line X (one equation)
      return [eqS(uni(A.vars, B.vars, X.vars), S.sdist(S.vmid(A.s, B.s), X.a.s, X.b.s))];
    }
    case 'midpoint': {
      let p = A, l = B;
      if (!isPoint(p)) [p, l] = [B, A];
      if (!isPoint(p)) return bad(type, hs);
      if (isLine(l)) return [0, 1].map(k => eqS(uni(p.vars, l.vars), S.sub(p.s[k], S.div(S.add(l.a.s[k], l.b.s[k]), 2))));
      if (l.kind === 'arc') return pointEq(p, l.mid);
      return bad(type, hs);
    }
    case 'concentric': {
      const a = A.kind === 'line' ? null : centerOf(A), b = B.kind === 'line' ? null : centerOf(B);
      if (!a || !b) return bad(type, hs);
      return pointEq(a, b);
    }
    case 'collinear': {
      if (!isLine(A) || !isLine(B)) return bad(type, hs);
      return [B.a, B.b].map(q => eqS(uni(A.vars, q.vars), S.sdist(q.s, A.a.s, A.b.s)));
    }
    case 'on': {
      let p = A, cv = B;
      if (!isPoint(p)) [p, cv] = [B, A];
      if (!isPoint(p)) return bad(type, hs);
      if (isPoint(cv)) return pointEq(p, cv);
      if (isLine(cv)) return [eqS(uni(p.vars, cv.vars), S.sdist(p.s, cv.a.s, cv.b.s))];
      if (isCirc(cv)) return [eqS(uni(p.vars, cv.c.vars, cv.r.vars), S.sub(S.vlen(S.vsub(p.s, cv.c.s)), cv.r.s))];
      if (cv.kind === 'ellipse') {
        const q = S.vsub(p.s, cv.c.s), ph = cv.phi.s, cp = S.cos(ph), sp = S.sin(ph);
        const u = S.add(S.mul(q[0], cp), S.mul(q[1], sp)), v = S.add(S.mul(S.neg(q[0]), sp), S.mul(q[1], cp)), rx = cv.rx.s, ry = cv.ry.s;
        return [eqS(uni(p.vars, cv.vars), S.div(S.mul(S.sub(S.hypot(S.div(u, rx), S.div(v, ry)), 1), S.add(rx, ry)), 2))];
      }
      return bad(type, hs);
    }
    case 'fix': {
      const out = [];
      const fixScalar = s => { const v0 = s.get(x0); out.push(eqS(s.vars, S.sub(s.s, v0))); };
      const fixPoint = (p, at = null) => { const v0 = at ?? p.get(x0); out.push(eqS(p.vars, S.sub(p.s[0], v0[0])), eqS(p.vars, S.sub(p.s[1], v0[1]))); };
      if (isPoint(A)) fixPoint(A, value);
      else if (isLine(A)) { fixPoint(A.a); fixPoint(A.b); }
      else if (A.kind === 'circle') { fixPoint(A.c); fixScalar(A.r); }
      else if (A.kind === 'arc') { fixPoint(A.c); fixScalar(A.r); fixScalar(A.a0); fixScalar(A.a1); }
      else if (A.kind === 'ellipse') { fixPoint(A.c); fixScalar(A.rx); fixScalar(A.ry); fixScalar(A.phi); }
      else if (A.kind === 'spline') A.pts.forEach(p => fixPoint(p));
      else if (A.kind === 'rigid') { fixPoint(A.c); fixScalar(A.th); }
      else return bad(type, hs);
      return out;
    }
    case 'distance': return distanceEq(A, B, value, x0);
    case 'distanceX': case 'distanceY': {
      const k = type === 'distanceX' ? 0 : 1;
      const pa = isPoint(A) ? A : isLine(A) ? A.a : centerOf(A), pb = B ? (isPoint(B) ? B : isLine(B) ? B.a : centerOf(B)) : A.b;
      const s = value >= 0 ? initSign(pb.get(x0)[k] - pa.get(x0)[k]) : 1;
      return [eqS(uni(pa.vars, pb.vars), S.sub(S.mul(s, S.sub(pb.s[k], pa.s[k])), value))];
    }
    case 'angle': {
      const lineDir = h => (isLine(h) ? dirOf(h) : null);
      const dA = lineDir(A), dB = lineDir(B);
      if (!dA || !dB) return bad(type, hs);
      const phi = x => { const u = dA(x), v = dB(x); return Math.atan2(cross(u, v), dot(u, v)); };
      const p0 = phi(x0);
      const cands = [value, -value, Math.PI - value, value - Math.PI];
      let target = cands[0], best = Infinity;
      for (const t of cands) { const e = Math.abs(wrapPi(p0 - t)); if (e < best - 1e-12) { best = e; target = t; } }
      const u = dirS(A), v = dirS(B);
      return [eqS(uni(A.vars, B.vars), S.wrapPi(S.sub(S.atan2(S.vcross(u, v), S.vdot(u, v)), target)))];
    }
    case 'radius': case 'diameter': {
      if (!isCirc(A)) return bad(type, hs);
      const k = type === 'radius' ? 1 : 2;
      return [eqS(A.r.vars, S.sub(S.mul(k, A.r.s), value))];
    }
    case 'length': {
      if (isLine(A)) return [eqS(A.vars, S.sub(S.vlen(dirS(A)), value))];
      if (A.kind === 'arc') return [eqS(A.vars, S.sub(S.mul(A.r.s, S.sweep(A.a0.s, A.a1.s)), value))];
      return bad(type, hs);
    }
    // internal kinds used by helpers, mirror, pattern and offset
    case 'mapPoint': {   // A = T·B  (value = 2D affine part of T: [m0, m1, m4, m5, m12, m13])
      const [a, b, c2, d, e, f] = value;
      const p = B.s;
      return [eqS(uni(A.vars, B.vars), S.sub(A.s[0], S.add(S.add(S.mul(a, p[0]), S.mul(c2, p[1])), e))),
        eqS(uni(A.vars, B.vars), S.sub(A.s[1], S.add(S.add(S.mul(b, p[0]), S.mul(d, p[1])), f)))];
    }
    case 'scalarRel': {  // A' = k·B + c (mod 2π when opts.angle)
      const [k, c0] = value;
      const r = S.sub(A.s, S.add(S.mul(k, B.s), c0));
      return [eqS(uni(A.vars, B.vars), opts.angle ? S.wrapPi(r) : r)];
    }
    case 'mirrorAngle': { // A' + B = 2ψ(X) (mod 2π, or mod π when opts.half)
      const d = S.vsub(X.b.s, X.a.s), psi = S.atan2(d[1], d[0]);
      const r = S.sub(S.add(A.s, B.s), S.mul(2, psi));
      return [eqS(uni(A.vars, B.vars, X.vars), opts.half ? S.div(S.wrapPi(S.mul(2, r)), 2) : S.wrapPi(r))];
    }
    case 'perpEnd': {    // offset chain end: A on the normal through B's point S (value: 'line' | 'arc')
      const Sp = X;      // the source endpoint
      if (isLine(B)) { const d = dirS(B); return [eqS(uni(A.vars, B.vars, Sp.vars), S.div(S.vdot(S.vsub(A.s, Sp.s), d), S.nz(S.vlen(d))))]; }
      if (isCirc(B)) { const c0 = B.c.s, u = S.vsub(Sp.s, c0); return [eqS(uni(A.vars, B.vars, Sp.vars), S.div(S.vcross(S.vsub(A.s, c0), u), S.nz(S.vlen(u))))]; }
      return bad(type, hs);
    }
    case 'offsetLine': { // A ∥ B and signed distance of A to B = value
      return [eqS(uni(A.vars, B.vars), ncross(dirS(A), dirS(B))),
        eqS(uni(A.vars, B.vars), S.sub(S.sdist(A.a.s, B.a.s, B.b.s), value))];
    }
    case 'offsetCirc': { // A concentric with B, rA = rB + value
      return [...pointEq(A.c, B.c), eqS(uni(A.r.vars, B.r.vars), S.sub(S.sub(A.r.s, B.r.s), value))];
    }
  }
  throw new ConstraintError(`unknown constraint '${type}'`);
}
const sweep = (a0, a1) => { const s = ((a1 - a0) % TAU + TAU) % TAU; return s < 1e-12 ? TAU : s; };

function pointEq(A, B) {
  const v = uni(A.vars, B.vars);
  return [eqS(v, S.sub(A.s[0], B.s[0])), eqS(v, S.sub(A.s[1], B.s[1]))];
}
function symPoints(A, B, X) {
  if (isPoint(X)) return [0, 1].map(k => eqS(uni(A.vars, B.vars, X.vars), S.sub(S.add(A.s[k], B.s[k]), S.mul(2, X.s[k]))));
  if (!isLine(X)) throw new ConstraintError('symmetric needs a line or a point as the axis');
  const v = uni(A.vars, B.vars, X.vars);
  const d = S.vsub(X.b.s, X.a.s);
  return [
    eqS(v, S.div(S.vdot(S.vsub(B.s, A.s), d), S.nz(S.vlen(d)))),
    eqS(v, S.sdist(S.vmid(A.s, B.s), X.a.s, X.b.s)),
  ];
}
function tangentLC(L, Cc, x0) {
  const s = initSign(sdist(Cc.c.get(x0), L.a.get(x0), L.b.get(x0)));
  return [eqS(uni(L.vars, Cc.c.vars, Cc.r.vars), S.sub(S.mul(s, S.sdist(Cc.c.s, L.a.s, L.b.s)), Cc.r.s))];
}
// tangency where the two curves share an endpoint: an angle condition (the distance form is singular there)
function tangentAtEnd(A, B, shared) {
  const endOf = (h, w) => (isLine(h) ? (w === 'start' ? h.a : h.b) : h[w]);
  if (isLine(A) && isLine(B)) return equations('parallel', [A, B], null, null);
  if (isLine(A) !== isLine(B)) {
    const L = isLine(A) ? A : B, Cc = isLine(A) ? B : A, w = isLine(A) ? shared.b : shared.a;
    const Pp = endOf(Cc, w);
    return [eqS(uni(L.vars, Cc.vars), ndot(dirS(L), S.vsub(Pp.s, Cc.c.s)))];
  }
  const Pp = endOf(A, shared.a);
  return [eqS(uni(A.vars, B.vars), ncross(S.vsub(Pp.s, A.c.s), S.vsub(Pp.s, B.c.s)))];
}
function tangentSpline(Sp, O, x0) {
  const n = Sp.pts.length;
  const ends = [{ p: Sp.pts[0], q: Sp.pts[1] }, { p: Sp.pts[n - 1], q: Sp.pts[n - 2] }];
  const near = h => { const pts = isLine(h) ? [h.a.get(x0), h.b.get(x0)] : isCirc(h) ? [h.start?.get(x0) ?? h.c.get(x0), h.end?.get(x0) ?? h.c.get(x0)] : [];
    return e => Math.min(...pts.map(t => len(sub(t, e.p.get(x0))))); };
  const score = near(O);
  const e = score(ends[0]) <= score(ends[1]) ? ends[0] : ends[1];
  const vars = uni(e.p.vars, e.q.vars, O.vars ?? []);
  const t = S.vsub(e.q.s, e.p.s);
  if (isLine(O)) return [eqS(vars, ncross(t, dirS(O)))];
  if (isCirc(O)) return [eqS(uni(vars, O.c.vars), ndot(t, S.vsub(e.p.s, O.c.s)))];
  throw new ConstraintError('tangent to a spline needs a line or an arc');
}
function distanceEq(A, B, d, x0) {
  if (isPoint(A) && isPoint(B)) {
    // a zero distance is a coincidence: |p − q| has no derivative at 0, so use the two components instead
    if (d === 0) return [0, 1].map(k => eqS(uni(A.vars, B.vars), S.sub(A.s[k], B.s[k])));
    return [eqS(uni(A.vars, B.vars), S.sub(S.vlen(S.vsub(A.s, B.s)), d))];
  }
  if (isPoint(A) && isLine(B) || isLine(A) && isPoint(B)) {
    const p = isPoint(A) ? A : B, l = isLine(A) ? A : B;
    const s = initSign(sdist(p.get(x0), l.a.get(x0), l.b.get(x0)));
    return [eqS(uni(p.vars, l.vars), S.sub(S.mul(s, S.sdist(p.s, l.a.s, l.b.s)), d))];
  }
  if (isLine(A) && isLine(B)) {
    const mid = x => { const a = B.a.get(x), b = B.b.get(x); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    const s = initSign(sdist(mid(x0), A.a.get(x0), A.b.get(x0)));
    return [eqS(uni(A.vars, B.vars), S.sub(S.mul(s, S.sdist(S.vmid(B.a.s, B.b.s), A.a.s, A.b.s)), d))];
  }
  if ((isPoint(A) && isCirc(B)) || (isCirc(A) && isPoint(B))) {
    const p = isPoint(A) ? A : B, cc = isCirc(A) ? A : B;
    const s = initSign(len(sub(p.get(x0), cc.c.get(x0))) - cc.r.get(x0));
    return [eqS(uni(p.vars, cc.c.vars, cc.r.vars), S.sub(S.mul(s, S.sub(S.vlen(S.vsub(p.s, cc.c.s)), cc.r.s)), d))];
  }
  if (isCirc(A) && isCirc(B)) return [eqS(uni(A.c.vars, B.c.vars), S.sub(S.vlen(S.vsub(A.c.s, B.c.s)), d))];
  if ((isLine(A) && isCirc(B)) || (isCirc(A) && isLine(B))) {
    const l = isLine(A) ? A : B, cc = isCirc(A) ? A : B;
    const s = initSign(sdist(cc.c.get(x0), l.a.get(x0), l.b.get(x0)));
    return [eqS(uni(l.vars, cc.c.vars), S.sub(S.mul(s, S.sdist(cc.c.s, l.a.s, l.b.s)), d))];
  }
  return bad('distance', [A, B]);
}

// measure the current value of a dimension (for driven dims and messages)
export function measure(type, hs, x) {
  const [A, B] = hs;
  switch (type) {
    case 'length': return isLine(A) ? len(sub(A.b.get(x), A.a.get(x))) : A.r.get(x) * sweep(A.a0.get(x), A.a1.get(x));
    case 'radius': return A.r.get(x);
    case 'diameter': return 2 * A.r.get(x);
    case 'distanceX': case 'distanceY': {
      const k = type === 'distanceX' ? 0 : 1;
      const pa = isPoint(A) ? A : isLine(A) ? A.a : centerOf(A), pb = B ? (isPoint(B) ? B : isLine(B) ? B.a : centerOf(B)) : A.b;
      return Math.abs(pb.get(x)[k] - pa.get(x)[k]);
    }
    case 'angle': { const u = sub(A.b.get(x), A.a.get(x)), v = sub(B.b.get(x), B.a.get(x)); return Math.abs(Math.atan2(cross(u, v), dot(u, v))); }
    case 'distance': {
      const eqs = distanceEq(A, B, 0, x);
      return Math.abs(eqs[0].f(x));
    }
  }
  return null;
}
