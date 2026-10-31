// geom2d.js · small 2D helpers shared by the sketch system, solver and profiles.
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const scale = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len = a => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const perp = a => [-a[1], a[0]];
export const TAU = 2 * Math.PI;
export const wrapPi = a => { let x = (a + Math.PI) % TAU; if (x < 0) x += TAU; return x - Math.PI; };
export const wrap2Pi = a => { let x = a % TAU; if (x < 0) x += TAU; return x; };
export const polar = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
export const angleOf = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
// ccw sweep from a0 to a1 in (0, 2π]
export const sweepCCW = (a0, a1) => { const s = wrap2Pi(a1 - a0); return s < 1e-12 ? TAU : s; };

// circle through three points → { c, r } | null
export function circleThrough(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = dot(a, a), b2 = dot(b, b), c2 = dot(c, c);
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: dist([ux, uy], a) };
}

// arc sampling: step ≈ 1° but never finer than a 0.05 mm chord, never coarser than 6°
export function arcSteps(r, sweep) {
  const chordStep = r > 0.025 ? 2 * Math.acos(Math.max(-1, 1 - 0.05 / r)) : Math.PI / 4;
  const step = Math.min(Math.max(Math.PI / 180, chordStep), (6 * Math.PI) / 180);
  return Math.max(2, Math.ceil(Math.abs(sweep) / step));
}
export function sampleArc(c, r, a0, sweep, includeEnd = true) {
  const n = arcSteps(r, sweep), out = [];
  for (let i = 0; i <= n; i++) { if (i === n && !includeEnd) break; out.push(polar(c, r, a0 + (sweep * i) / n)); }
  return out;
}

// splines: 'control' = clamped uniform B-spline of degree p; 'interp' = centripetal Catmull–Rom through the points
export function sampleSpline(pts, { degree = 3, fit = 'interp', closed = false, per = 16 } = {}) {
  if (pts.length < 2) return pts.slice();
  if (fit === 'control') return sampleBSpline(pts, Math.min(degree, pts.length - 1), closed, per);
  return sampleCatmull(pts, closed, per);
}
function sampleCatmull(P, closed, per) {
  const n = P.length, out = [];
  const get = i => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const t01 = Math.pow(dist(p0, p1), 0.5) || 1e-9, t12 = Math.pow(dist(p1, p2), 0.5) || 1e-9, t23 = Math.pow(dist(p2, p3), 0.5) || 1e-9;
    const m1 = [0, 1].map(k => (p2[k] - p1[k] + t12 * ((p1[k] - p0[k]) / t01 - (p2[k] - p0[k]) / (t01 + t12)))), m2 = [0, 1].map(k => (p2[k] - p1[k] + t12 * ((p3[k] - p2[k]) / t23 - (p3[k] - p1[k]) / (t12 + t23))));
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([0, 1].map(k => h00 * p1[k] + h10 * m1[k] + h01 * p2[k] + h11 * m2[k]));
    }
  }
  out.push(closed ? P[0].slice() : P[n - 1].slice());
  return out;
}
function sampleBSpline(P0, p, closed, per) {
  const P = closed ? [...P0, ...P0.slice(0, p)] : P0;
  const n = P.length - 1, m = n + p + 1;
  const U = [];
  for (let i = 0; i <= m; i++) {
    if (closed) U.push(i);
    else U.push(i <= p ? 0 : i >= m - p ? m - 2 * p : i - p);
  }
  const lo = U[p], hi = U[n + 1];
  const N = (i, k, u) => {
    if (k === 0) return (U[i] <= u && u < U[i + 1]) || (u === hi && U[i] < u && u <= U[i + 1]) ? 1 : 0;
    const a = U[i + k] - U[i] ? ((u - U[i]) / (U[i + k] - U[i])) * N(i, k - 1, u) : 0;
    const b = U[i + k + 1] - U[i + 1] ? ((U[i + k + 1] - u) / (U[i + k + 1] - U[i + 1])) * N(i + 1, k - 1, u) : 0;
    return a + b;
  };
  const out = [], total = per * Math.max(1, P0.length - (closed ? 0 : 1));
  for (let s = 0; s <= total; s++) {
    const u = lo + ((hi - lo) * s) / total;
    let x = 0, y = 0;
    for (let i = 0; i <= n; i++) { const w = N(i, p, u); x += w * P[i][0]; y += w * P[i][1]; }
    out.push([x, y]);
  }
  return out;
}
export function sampleEllipse(c, rx, ry, phi, n = 96) {
  const out = [];
  const cp = Math.cos(phi), sp = Math.sin(phi);
  for (let i = 0; i <= n; i++) {
    const t = (TAU * i) / n, u = rx * Math.cos(t), v = ry * Math.sin(t);
    out.push([c[0] + u * cp - v * sp, c[1] + u * sp + v * cp]);
  }
  return out;
}
export const polyArea = pts => {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
};
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
