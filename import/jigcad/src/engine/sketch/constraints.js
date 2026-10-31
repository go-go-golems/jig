// constraints.js · j.c.* constructors and the equations each constraint contributes (README §4.5).
// Every equation is { vars, f(x) } over the sketch's parameter vector; residuals are in mm or radians.
import { sub, dot, cross, len, wrapPi, TAU } from './geom2d.js';
import { stampLine } from '../callsite.js';

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
const eq = (vars, f) => ({ vars, f });
const P = h => h.get;                         // point getter
const dirOf = L => x => sub(L.b.get(x), L.a.get(x));
const isLine = h => h.kind === 'line';
const isCirc = h => h.kind === 'circle' || h.kind === 'arc';
const isPoint = h => h.kind === 'point';
const centerOf = h => (h.kind === 'point' ? h : h.c);

export class ConstraintError extends Error { constructor(m) { super(m); this.name = 'ConstraintError'; } }
const bad = (type, hs) => { throw new ConstraintError(`${type} does not apply to ${hs.map(h => h.kind).join(' and ')}`); };

// signed distance from point p to line (a → b), positive on the left
const sdist = (p, a, b) => { const d = sub(b, a); return cross(d, sub(p, a)) / (len(d) || 1e-300); };
const initSign = (v) => (v < -1e-12 ? -1 : 1);

// equations(type, handles, value, x0, opts) → [{ vars, f }]; x0 = initial guess for side choices
export function equations(type, hs, value, x0, opts = {}) {
  const [A, B, X] = hs;
  switch (type) {
    case 'coincident': {
      if (isPoint(A) && isPoint(B)) return pointEq(A, B);
      if (isPoint(A)) return equations('on', [A, B], null, x0);
      if (isPoint(B)) return equations('on', [B, A], null, x0);
      if (isCirc(A) && isCirc(B)) return [...pointEq(A.c, B.c), eq(uni(A.r.vars, B.r.vars), x => A.r.get(x) - B.r.get(x))];
      return bad(type, hs);
    }
    case 'horizontal': case 'vertical': {
      const k = type === 'horizontal' ? 1 : 0;
      if (hs.length === 1 && isLine(A)) return [eq(A.vars, x => A.b.get(x)[k] - A.a.get(x)[k])];
      if (hs.length === 2 && isPoint(A) && isPoint(B)) return [eq(uni(A.vars, B.vars), x => B.get(x)[k] - A.get(x)[k])];
      return bad(type, hs);
    }
    case 'parallel': case 'perpendicular': {
      if (!isLine(A) || !isLine(B)) return bad(type, hs);
      const dA = dirOf(A), dB = dirOf(B), op = type === 'parallel' ? cross : dot;
      return [eq(uni(A.vars, B.vars), x => { const u = dA(x), v = dB(x); return op(u, v) / ((len(u) * len(v)) || 1e-300); })];
    }
    case 'tangent': {
      if (opts.shared) return tangentAtEnd(A, B, opts.shared);
      if (isLine(A) && isCirc(B)) return tangentLC(A, B, x0);
      if (isCirc(A) && isLine(B)) return tangentLC(B, A, x0);
      if (isCirc(A) && isCirc(B)) {
        const d0 = len(sub(A.c.get(x0), B.c.get(x0))), r1 = A.r.get(x0), r2 = B.r.get(x0);
        const external = Math.abs(d0 - (r1 + r2)) <= Math.abs(d0 - Math.abs(r1 - r2));
        const s = initSign(r1 - r2);
        return [eq(uni(A.vars, B.vars), x => {
          const d = len(sub(A.c.get(x), B.c.get(x)));
          return external ? d - (A.r.get(x) + B.r.get(x)) : d - s * (A.r.get(x) - B.r.get(x));
        })];
      }
      if (isLine(A) && isLine(B)) return equations('parallel', [A, B], null, x0);
      if (A.kind === 'spline' || B.kind === 'spline') return tangentSpline(A.kind === 'spline' ? A : B, A.kind === 'spline' ? B : A, x0);
      return bad(type, hs);
    }
    case 'equal': {
      if (isLine(A) && isLine(B)) { const dA = dirOf(A), dB = dirOf(B); return [eq(uni(A.vars, B.vars), x => len(dA(x)) - len(dB(x)))]; }
      if (isCirc(A) && isCirc(B)) return [eq(uni(A.r.vars, B.r.vars), x => A.r.get(x) - B.r.get(x))];
      if (A.kind === 'ellipse' && B.kind === 'ellipse') return [eq(uni(A.rx.vars, B.rx.vars), x => A.rx.get(x) - B.rx.get(x)), eq(uni(A.ry.vars, B.ry.vars), x => A.ry.get(x) - B.ry.get(x))];
      return bad(type, hs);
    }
    case 'symmetric': {
      if (isPoint(A) && isPoint(B)) return symPoints(A, B, X);
      if (isLine(A) && isLine(B)) return [...symPoints(A.a, B.a, X), ...symPoints(A.b, B.b, X)];
      if (isCirc(A) && isCirc(B)) return [...symPoints(A.c, B.c, X), eq(uni(A.r.vars, B.r.vars), x => A.r.get(x) - B.r.get(x))];
      return bad(type, hs);
    }
    case 'symMid': {   // midpoint of A, B on the axis line X (one equation)
      return [eq(uni(A.vars, B.vars, X.vars), x => { const m = A.get(x), n = B.get(x); return sdist([(m[0] + n[0]) / 2, (m[1] + n[1]) / 2], X.a.get(x), X.b.get(x)); })];
    }
    case 'midpoint': {
      let p = A, l = B;
      if (!isPoint(p)) [p, l] = [B, A];
      if (!isPoint(p)) return bad(type, hs);
      if (isLine(l)) return [0, 1].map(k => eq(uni(p.vars, l.vars), x => p.get(x)[k] - (l.a.get(x)[k] + l.b.get(x)[k]) / 2));
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
      return [B.a, B.b].map(q => eq(uni(A.vars, q.vars), x => sdist(q.get(x), A.a.get(x), A.b.get(x))));
    }
    case 'on': {
      let p = A, cv = B;
      if (!isPoint(p)) [p, cv] = [B, A];
      if (!isPoint(p)) return bad(type, hs);
      if (isPoint(cv)) return pointEq(p, cv);
      if (isLine(cv)) return [eq(uni(p.vars, cv.vars), x => sdist(p.get(x), cv.a.get(x), cv.b.get(x)))];
      if (isCirc(cv)) return [eq(uni(p.vars, cv.c.vars, cv.r.vars), x => len(sub(p.get(x), cv.c.get(x))) - cv.r.get(x))];
      if (cv.kind === 'ellipse') return [eq(uni(p.vars, cv.vars), x => {
        const q = sub(p.get(x), cv.c.get(x)), ph = cv.phi.get(x), cp = Math.cos(ph), sp = Math.sin(ph);
        const u = q[0] * cp + q[1] * sp, v = -q[0] * sp + q[1] * cp, rx = cv.rx.get(x), ry = cv.ry.get(x);
        return (Math.hypot(u / rx, v / ry) - 1) * (rx + ry) / 2;
      })];
      return bad(type, hs);
    }
    case 'fix': {
      const out = [];
      const fixScalar = s => { const v0 = s.get(x0); out.push(eq(s.vars, x => s.get(x) - v0)); };
      const fixPoint = (p, at = null) => { const v0 = at ?? p.get(x0); out.push(eq(p.vars, x => p.get(x)[0] - v0[0]), eq(p.vars, x => p.get(x)[1] - v0[1])); };
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
      return [eq(uni(pa.vars, pb.vars), x => s * (pb.get(x)[k] - pa.get(x)[k]) - value)];
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
      return [eq(uni(A.vars, B.vars), x => wrapPi(phi(x) - target))];
    }
    case 'radius': case 'diameter': {
      if (!isCirc(A)) return bad(type, hs);
      const k = type === 'radius' ? 1 : 2;
      return [eq(A.r.vars, x => k * A.r.get(x) - value)];
    }
    case 'length': {
      if (isLine(A)) { const d = dirOf(A); return [eq(A.vars, x => len(d(x)) - value)]; }
      if (A.kind === 'arc') return [eq(A.vars, x => A.r.get(x) * sweep(A.a0.get(x), A.a1.get(x)) - value)];
      return bad(type, hs);
    }
    // internal kinds used by helpers, mirror, pattern and offset
    case 'mapPoint': {   // A = T·B  (value = 2D affine part of T: [m0, m1, m4, m5, m12, m13])
      const [a, b, c2, d, e, f] = value;
      return [eq(uni(A.vars, B.vars), x => { const p = B.get(x); return A.get(x)[0] - (a * p[0] + c2 * p[1] + e); }),
        eq(uni(A.vars, B.vars), x => { const p = B.get(x); return A.get(x)[1] - (b * p[0] + d * p[1] + f); })];
    }
    case 'scalarRel': {  // A' = k·B + c (mod 2π when opts.angle)
      const [k, c0] = value;
      return [eq(uni(A.vars, B.vars), x => { const r = A.get(x) - (k * B.get(x) + c0); return opts.angle ? wrapPi(r) : r; })];
    }
    case 'mirrorAngle': { // A' + B = 2ψ(X) (mod 2π, or mod π when opts.half)
      return [eq(uni(A.vars, B.vars, X.vars), x => {
        const d = sub(X.b.get(x), X.a.get(x)), psi = Math.atan2(d[1], d[0]);
        const r = A.get(x) + B.get(x) - 2 * psi;
        return opts.half ? wrapPi(2 * r) / 2 : wrapPi(r);
      })];
    }
    case 'perpEnd': {    // offset chain end: A on the normal through B's point S (value: 'line' | 'arc')
      const S = X;       // the source endpoint
      if (isLine(B)) return [eq(uni(A.vars, B.vars, S.vars), x => { const d = dirOf(B)(x); return dot(sub(A.get(x), S.get(x)), d) / (len(d) || 1e-300); })];
      if (isCirc(B)) return [eq(uni(A.vars, B.vars, S.vars), x => { const c0 = B.c.get(x), u = sub(S.get(x), c0); return cross(sub(A.get(x), c0), u) / (len(u) || 1e-300); })];
      return bad(type, hs);
    }
    case 'offsetLine': { // A ∥ B and signed distance of A to B = value
      const dB = dirOf(B);
      return [eq(uni(A.vars, B.vars), x => { const u = dirOf(A)(x), v = dB(x); return cross(u, v) / ((len(u) * len(v)) || 1e-300); }),
        eq(uni(A.vars, B.vars), x => sdist(A.a.get(x), B.a.get(x), B.b.get(x)) - value)];
    }
    case 'offsetCirc': { // A concentric with B, rA = rB + value
      return [...pointEq(A.c, B.c), eq(uni(A.r.vars, B.r.vars), x => A.r.get(x) - B.r.get(x) - value)];
    }
  }
  throw new ConstraintError(`unknown constraint '${type}'`);
}
const sweep = (a0, a1) => { const s = ((a1 - a0) % TAU + TAU) % TAU; return s < 1e-12 ? TAU : s; };

function pointEq(A, B) {
  const v = uni(A.vars, B.vars);
  return [eq(v, x => A.get(x)[0] - B.get(x)[0]), eq(v, x => A.get(x)[1] - B.get(x)[1])];
}
function symPoints(A, B, X) {
  if (isPoint(X)) return [0, 1].map(k => eq(uni(A.vars, B.vars, X.vars), x => A.get(x)[k] + B.get(x)[k] - 2 * X.get(x)[k]));
  if (!isLine(X)) throw new ConstraintError('symmetric needs a line or a point as the axis');
  const v = uni(A.vars, B.vars, X.vars);
  return [
    eq(v, x => { const d = sub(X.b.get(x), X.a.get(x)); return dot(sub(B.get(x), A.get(x)), d) / (len(d) || 1e-300); }),
    eq(v, x => { const m = A.get(x), n = B.get(x); return sdist([(m[0] + n[0]) / 2, (m[1] + n[1]) / 2], X.a.get(x), X.b.get(x)); }),
  ];
}
function tangentLC(L, Cc, x0) {
  const s = initSign(sdist(Cc.c.get(x0), L.a.get(x0), L.b.get(x0)));
  return [eq(uni(L.vars, Cc.c.vars, Cc.r.vars), x => s * sdist(Cc.c.get(x), L.a.get(x), L.b.get(x)) - Cc.r.get(x))];
}
// tangency where the two curves share an endpoint: an angle condition (the distance form is singular there)
function tangentAtEnd(A, B, shared) {
  const endOf = (h, w) => (isLine(h) ? (w === 'start' ? h.a : h.b) : h[w]);
  if (isLine(A) && isLine(B)) return equations('parallel', [A, B], null, null);
  if (isLine(A) !== isLine(B)) {
    const L = isLine(A) ? A : B, Cc = isLine(A) ? B : A, w = isLine(A) ? shared.b : shared.a;
    const Pp = endOf(Cc, w), dL = dirOf(L);
    return [eq(uni(L.vars, Cc.vars), x => { const d = dL(x), q = sub(Pp.get(x), Cc.c.get(x)); return dot(d, q) / ((len(d) * len(q)) || 1e-300); })];
  }
  const Pp = endOf(A, shared.a);
  return [eq(uni(A.vars, B.vars), x => { const p = Pp.get(x), u = sub(p, A.c.get(x)), v = sub(p, B.c.get(x)); return cross(u, v) / ((len(u) * len(v)) || 1e-300); })];
}
function tangentSpline(S, O, x0) {
  const n = S.pts.length;
  const ends = [{ p: S.pts[0], q: S.pts[1] }, { p: S.pts[n - 1], q: S.pts[n - 2] }];
  const near = h => { const pts = isLine(h) ? [h.a.get(x0), h.b.get(x0)] : isCirc(h) ? [h.start?.get(x0) ?? h.c.get(x0), h.end?.get(x0) ?? h.c.get(x0)] : [];
    return e => Math.min(...pts.map(t => len(sub(t, e.p.get(x0))))); };
  const score = near(O);
  const e = score(ends[0]) <= score(ends[1]) ? ends[0] : ends[1];
  const vars = uni(e.p.vars, e.q.vars, O.vars ?? []);
  if (isLine(O)) return [eq(vars, x => { const t = sub(e.q.get(x), e.p.get(x)), d = dirOf(O)(x); return cross(t, d) / ((len(t) * len(d)) || 1e-300); })];
  if (isCirc(O)) return [eq(uni(vars, O.c.vars), x => { const t = sub(e.q.get(x), e.p.get(x)), rr = sub(e.p.get(x), O.c.get(x)); return dot(t, rr) / ((len(t) * len(rr)) || 1e-300); })];
  throw new ConstraintError('tangent to a spline needs a line or an arc');
}
function distanceEq(A, B, d, x0) {
  if (isPoint(A) && isPoint(B)) {
    // a zero distance is a coincidence: |p − q| has no derivative at 0, so use the two components instead
    if (d === 0) return [0, 1].map(k => eq(uni(A.vars, B.vars), x => A.get(x)[k] - B.get(x)[k]));
    return [eq(uni(A.vars, B.vars), x => len(sub(A.get(x), B.get(x))) - d)];
  }
  if (isPoint(A) && isLine(B) || isLine(A) && isPoint(B)) {
    const p = isPoint(A) ? A : B, l = isLine(A) ? A : B;
    const s = initSign(sdist(p.get(x0), l.a.get(x0), l.b.get(x0)));
    return [eq(uni(p.vars, l.vars), x => s * sdist(p.get(x), l.a.get(x), l.b.get(x)) - d)];
  }
  if (isLine(A) && isLine(B)) {
    const mid = x => { const a = B.a.get(x), b = B.b.get(x); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    const s = initSign(sdist(mid(x0), A.a.get(x0), A.b.get(x0)));
    return [eq(uni(A.vars, B.vars), x => s * sdist(mid(x), A.a.get(x), A.b.get(x)) - d)];
  }
  if ((isPoint(A) && isCirc(B)) || (isCirc(A) && isPoint(B))) {
    const p = isPoint(A) ? A : B, cc = isCirc(A) ? A : B;
    const s = initSign(len(sub(p.get(x0), cc.c.get(x0))) - cc.r.get(x0));
    return [eq(uni(p.vars, cc.c.vars, cc.r.vars), x => s * (len(sub(p.get(x), cc.c.get(x))) - cc.r.get(x)) - d)];
  }
  if (isCirc(A) && isCirc(B)) return [eq(uni(A.c.vars, B.c.vars), x => len(sub(A.c.get(x), B.c.get(x))) - d)];
  if ((isLine(A) && isCirc(B)) || (isCirc(A) && isLine(B))) {
    const l = isLine(A) ? A : B, cc = isCirc(A) ? A : B;
    const s = initSign(sdist(cc.c.get(x0), l.a.get(x0), l.b.get(x0)));
    return [eq(uni(l.vars, cc.c.vars), x => s * sdist(cc.c.get(x), l.a.get(x), l.b.get(x)) - d)];
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
