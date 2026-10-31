// geom.js · points, vectors, transforms and datums (README §4.3).
// Points form an affine space over vectors (p + p is an AffineError). Transforms are 4×4 matrices (column-major,
// world), a group under `then`. Datums (planes, axes, frames) are concrete here unless they depend on topology
// or on parameters, in which case they are Deferred records the kernel resolves with resolveDatum().
import { Quantity, AffineError, DimensionError, coerce, mm, deg, rad, fmtNum } from './units.js';
import { deps as exprDeps } from './expr.js';

const EPS = 1e-12;
const lenNum = (x, scope = null) => {
  if (typeof x === 'number') return x;
  const v = coerce(x, 'length', scope ?? {});
  return v instanceof Quantity ? v.value : Number(v);
};
const angNum = (x, scope = null) => {
  if (typeof x === 'number') return x * Math.PI / 180;   // a bare number in an Angle slot is degrees
  const v = coerce(x, 'angle', scope ?? {});
  return v instanceof Quantity ? v.value : Number(v) * Math.PI / 180;
};
const hasDeps = x => typeof x === 'string' && exprDeps(x).length > 0;

// ── Point / Vec / Dir ─────────────────────────────────────────────────────
export class Vec {
  constructor(x, y, z = 0) { this.x = x; this.y = y; this.z = z; Object.freeze(this); }
  add(v) {
    if (v instanceof Point) throw new AffineError('vec + point: write point.add(vec) to translate a point');
    const w = asVecLike(v); return new Vec(this.x + w.x, this.y + w.y, this.z + w.z);
  }
  sub(v) {
    if (v instanceof Point) throw new AffineError('vec − point is undefined');
    const w = asVecLike(v); return new Vec(this.x - w.x, this.y - w.y, this.z - w.z);
  }
  mul(k) { const s = scalar(k); return new Vec(this.x * s, this.y * s, this.z * s); }
  div(k) { return this.mul(1 / scalar(k)); }
  neg() { return this.mul(-1); }
  dot(w) { const v = asVecLike(w); const d = this.x * v.x + this.y * v.y + this.z * v.z; return v instanceof Dir ? mm(d) : mm(1).mul(mm(d)); }
  cross(w) { const v = asVecLike(w); return new Vec(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
  norm() { return mm(Math.hypot(this.x, this.y, this.z)); }
  get length() { return Math.hypot(this.x, this.y, this.z); }
  unit() { return Dir.from(this.x, this.y, this.z); }
  angleTo(w) { return angleBetween(this, asVecLike(w)); }
  toArray() { return [this.x, this.y, this.z]; }
  eq(w, tol = 1e-9) { const v = asVecLike(w); return Math.abs(this.x - v.x) <= tol && Math.abs(this.y - v.y) <= tol && Math.abs(this.z - v.z) <= tol; }
  toString() { return `vec(${fmtNum(this.x)}, ${fmtNum(this.y)}, ${fmtNum(this.z)}) mm`; }
  toJSON() { return { vec: this.toArray() }; }
}
export class Dir {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z; Object.freeze(this); }
  static from(x, y, z = 0) {
    const n = Math.hypot(x, y, z);
    if (n < EPS) throw new AffineError('a direction needs a non-zero vector');
    return new Dir(x / n, y / n, z / n);
  }
  neg() { return new Dir(-this.x, -this.y, -this.z); }
  mul(k) { const s = k instanceof Quantity ? coerce(k, 'length').value : scalar(k); return new Vec(this.x * s, this.y * s, this.z * s); }
  dot(w) { const v = asVecLike(w); return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(w) { const v = asVecLike(w); return Dir.from(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
  angleTo(w) { return angleBetween(this, asVecLike(w)); }
  unit() { return this; }
  toArray() { return [this.x, this.y, this.z]; }
  eq(w, tol = 1e-9) { const v = asVecLike(w); return Math.abs(this.x - v.x) <= tol && Math.abs(this.y - v.y) <= tol && Math.abs(this.z - v.z) <= tol; }
  get name() {
    for (const [n, v] of Object.entries(AXES)) if (this.eq(new Dir(...v), 1e-12)) return n;
    return null;
  }
  toString() { const n = this.name; return n ? `dir('${n}')` : `dir(${fmtNum(this.x)}, ${fmtNum(this.y)}, ${fmtNum(this.z)})`; }
  toJSON() { return { dir: this.toArray() }; }
}
export class Point {
  constructor(x, y, z = 0) { this.x = x; this.y = y; this.z = z; Object.freeze(this); }
  add(v) {
    if (v instanceof Point) throw new AffineError('cannot add two points: translate with point.add(vector), or take a difference point.sub(other)');
    if (v instanceof Dir) throw new AffineError('point + direction: scale the direction first, e.g. dir.mul(mm(5))');
    const w = asVecLike(v); return new Point(this.x + w.x, this.y + w.y, this.z + w.z);
  }
  sub(o) {
    if (o instanceof Point) return new Vec(this.x - o.x, this.y - o.y, this.z - o.z);
    const w = asVecLike(o); return new Point(this.x - w.x, this.y - w.y, this.z - w.z);
  }
  lerp(o, t) { return new Point(this.x + (o.x - this.x) * t, this.y + (o.y - this.y) * t, this.z + (o.z - this.z) * t); }
  distanceTo(o) { return mm(Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z)); }
  mul() { throw new AffineError('a point cannot be scaled; scale the vector p.sub(j.origin)'); }
  toArray() { return [this.x, this.y, this.z]; }
  eq(o, tol = 1e-7) { return Math.abs(this.x - o.x) <= tol && Math.abs(this.y - o.y) <= tol && Math.abs(this.z - o.z) <= tol; }
  toString() { return `pt(${fmtNum(this.x)}, ${fmtNum(this.y)}, ${fmtNum(this.z)}) mm`; }
  toJSON() { return { pt: this.toArray() }; }
}
function scalar(k) {
  if (typeof k === 'number') return k;
  if (k instanceof Quantity) return coerce(k, 'number');
  throw new DimensionError(`expected a number, got ${String(k)}`);
}
function asVecLike(v) {
  if (v instanceof Vec || v instanceof Dir) return v;
  if (Array.isArray(v)) return new Vec(lenNum(v[0]), lenNum(v[1]), lenNum(v[2] ?? 0));
  if (v instanceof Point) return v;
  throw new AffineError(`expected a vector, got ${String(v)}`);
}
function angleBetween(a, b) {
  const c = a.x * b.x + a.y * b.y + a.z * b.z;
  const cr = Math.hypot(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  return rad(Math.atan2(cr, c)).to('deg');
}
const AXES = { '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1] };

export function pt(x, y, z = 0) {
  if ([x, y, z].some(hasDeps)) return new Deferred('point', 'pt', [x, y, z]);
  return new Point(lenNum(x), lenNum(y), lenNum(z));
}
export function vec(x, y, z = 0) {
  if (x instanceof Point || x instanceof Vec) return new Vec(x.x, x.y, x.z);
  return new Vec(lenNum(x), lenNum(y), lenNum(z));
}
export function dir(x, y, z = 0) {
  if (x instanceof Dir) return x;
  if (x instanceof Vec) return x.unit();
  if (x instanceof Axis) return x.dir;
  if (typeof x === 'string') {
    const k = x.trim().toUpperCase();
    const key = /^[+-]/.test(k) ? k : '+' + k;
    if (!AXES[key]) throw new AffineError(`unknown direction '${x}' (use '+X', '-Y', 'Z', …)`);
    return new Dir(...AXES[key]);
  }
  if (Array.isArray(x)) return Dir.from(...x.map(Number), 0);
  return Dir.from(Number(x), Number(y), Number(z));
}
export const origin = new Point(0, 0, 0);
export function toVec3(x) {
  if (x == null) return [0, 0, 0];
  if (Array.isArray(x)) return [lenNum(x[0]), lenNum(x[1]), lenNum(x[2] ?? 0)];
  if (x instanceof Point || x instanceof Vec || x instanceof Dir) return [x.x, x.y, x.z];
  throw new AffineError(`expected a point, got ${String(x)}`);
}
export function asPoint(x) {
  if (x instanceof Point) return x;
  const [a, b, c] = toVec3(x); return new Point(a, b, c);
}

// ── Transform (4×4, column-major) ─────────────────────────────────────────
const I16 = () => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function mul4(a, b) { // a · b
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function inv4(m) {
  const inv = new Float64Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(det) < 1e-300) throw new AffineError('transform is singular (scale 0?)');
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}

export class Transform {
  constructor(m, desc = null) { this.m = m instanceof Float64Array ? m : Float64Array.from(m); this.desc = desc; Object.freeze(this); }
  then(u) { return new Transform(mul4(asTx(u).m, this.m), joinDesc(this.desc, asTx(u).desc)); }
  inverse() { return new Transform(inv4(this.m), this.desc ? `inverse(${this.desc})` : null); }
  pow(n) {
    if (!Number.isInteger(n)) throw new Error('pow takes an integer');
    let base = n < 0 ? this.inverse() : this, out = IDENTITY;
    for (let i = 0; i < Math.abs(n); i++) out = out.then(base);
    return out;
  }
  get det() {
    const m = this.m;
    return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  }
  applyArray([x, y, z = 0], w = 1) {
    const m = this.m;
    return [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];
  }
  apply(x) {
    if (x instanceof Point) return new Point(...this.applyArray([x.x, x.y, x.z]));
    if (x instanceof Dir) return Dir.from(...this.applyArray([x.x, x.y, x.z], 0));
    if (x instanceof Vec) return new Vec(...this.applyArray([x.x, x.y, x.z], 0));
    if (x instanceof Frame) return x.moved(this);
    if (x instanceof Axis) return x.moved(this);
    if (x instanceof Transform) return x.then(this);
    if (Array.isArray(x)) return x.length === 2 ? this.applyArray([x[0], x[1], 0]).slice(0, 2) : this.applyArray(x);
    if (x instanceof Deferred) return x.moved(this);
    throw new AffineError(`cannot apply a transform to ${String(x)}`);
  }
  eq(u, tol = 1e-9) { const o = asTx(u).m; return this.m.every((v, i) => Math.abs(v - o[i]) <= tol * (i >= 12 ? Math.max(1, Math.abs(v)) : 1)); }
  get isIdentity() { return this.eq(IDENTITY); }
  get translation() { return [this.m[12], this.m[13], this.m[14]]; }
  toArray() { return Array.from(this.m); }
  toJSON() { return { tx: this.toArray(), text: this.toString() }; }
  key() { return Array.from(this.m, v => (Math.abs(v) < 1e-10 ? 0 : Number(v.toFixed(8)))).join(','); }
  toString() { return describeTx(this); }
}
function joinDesc(a, b) { if (!a) return b; if (!b) return a; if (a === 'identity') return b; if (b === 'identity') return a; return `${a} · ${b}`; }
const asTx = u => {
  if (u instanceof Transform) return u;
  if (u instanceof Frame) return u.toTransform();
  if (Array.isArray(u) && u.length === 16) return new Transform(u);
  throw new AffineError(`expected a transform, got ${String(u)}`);
};
export const IDENTITY = new Transform(I16(), 'identity');

function describeTx(t) {
  const m = t.m;
  if (t.isIdentity) return 'identity';
  const [tx_, ty, tz] = [m[12], m[13], m[14]];
  const lin = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const isId3 = Math.abs(lin[0] - 1) < 1e-9 && Math.abs(lin[4] - 1) < 1e-9 && Math.abs(lin[8] - 1) < 1e-9 && [1, 2, 3, 5, 6, 7].every(i => Math.abs(lin[i]) < 1e-9);
  if (isId3) return `move(${fmtNum(tx_)}, ${fmtNum(ty)}, ${fmtNum(tz)})`;
  const det = t.det;
  if (Math.abs(det - 1) < 1e-9) {
    const tr = lin[0] + lin[4] + lin[8];
    const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
    let ax = [lin[5] - lin[7], lin[6] - lin[2], lin[1] - lin[3]];
    if (Math.hypot(...ax) < 1e-9) ax = [Math.sqrt(Math.max(0, (lin[0] + 1) / 2)), Math.sqrt(Math.max(0, (lin[4] + 1) / 2)), Math.sqrt(Math.max(0, (lin[8] + 1) / 2))];
    const d = Dir.from(...ax);
    const nm = d.name ? d.name.replace('+', '') : `(${d.toArray().map(fmtNum).join(', ')})`;
    const rot = `rotate(${nm}, ${fmtNum(ang * 180 / Math.PI)}°)`;
    return Math.hypot(tx_, ty, tz) < 1e-9 ? rot : t.desc ?? `${rot} · move(${fmtNum(tx_)}, ${fmtNum(ty)}, ${fmtNum(tz)})`;
  }
  return t.desc ?? (Math.abs(det + 1) < 1e-9 ? 'mirror' : `matrix(det ${fmtNum(det)})`);
}

function asAxis(a) {
  if (a instanceof Axis) return a;
  if (a instanceof Dir) return new Axis(origin, a);
  if (typeof a === 'string') return new Axis(origin, dir(a));
  if (a instanceof Vec) return new Axis(origin, a.unit());
  if (a instanceof Frame) return new Axis(a.origin, a.z);
  if (Array.isArray(a)) return new Axis(origin, dir(a));
  throw new AffineError(`expected an axis, got ${String(a)}`);
}
function asPlane(p) {
  if (p instanceof Frame) return p;
  if (typeof p === 'string' && PLANES[p.toUpperCase()]) return PLANES[p.toUpperCase()];
  throw new AffineError(`expected a plane, got ${String(p)}`);
}
function rotationMatrix(axis, angle) {
  const { x, y, z } = axis.dir, c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  const r = I16();
  r[0] = t * x * x + c; r[4] = t * x * y - s * z; r[8] = t * x * z + s * y;
  r[1] = t * x * y + s * z; r[5] = t * y * y + c; r[9] = t * y * z - s * x;
  r[2] = t * x * z - s * y; r[6] = t * y * z + s * x; r[10] = t * z * z + c;
  // clean tiny values so quarter turns are exact
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) if (Math.abs(r[i]) < 1e-15) r[i] = 0;
  const o = axis.origin;
  if (o.x || o.y || o.z) {
    const p = [o.x, o.y, o.z];
    r[12] = p[0] - (r[0] * p[0] + r[4] * p[1] + r[8] * p[2]);
    r[13] = p[1] - (r[1] * p[0] + r[5] * p[1] + r[9] * p[2]);
    r[14] = p[2] - (r[2] * p[0] + r[6] * p[1] + r[10] * p[2]);
  }
  return r;
}
function mirrorMatrix(o, n) {
  const r = I16();
  const N = [n.x, n.y, n.z];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) r[k * 4 + i] = (i === k ? 1 : 0) - 2 * N[i] * N[k];
  const d = o.x * n.x + o.y * n.y + o.z * n.z;
  r[12] = 2 * d * n.x; r[13] = 2 * d * n.y; r[14] = 2 * d * n.z;
  return r;
}
export const tx = {
  identity: IDENTITY,
  move(v, y, z) {
    let a;
    if (v instanceof Vec || v instanceof Point || Array.isArray(v)) a = toVec3(v);
    else a = [lenNum(v), lenNum(y ?? 0), lenNum(z ?? 0)];
    const m = I16(); m[12] = a[0]; m[13] = a[1]; m[14] = a[2];
    return new Transform(m, `move(${a.map(fmtNum).join(', ')})`);
  },
  rotate(axis, angle) {
    const ax = asAxis(axis), a = angNum(angle);
    const nm = ax.dir.name ? ax.dir.name.replace('+', '') : 'axis';
    return new Transform(rotationMatrix(ax, a), `rotate(${nm}, ${fmtNum(a * 180 / Math.PI)}°)`);
  },
  mirror(p) {
    if (p instanceof Axis || (typeof p === 'string' && /^[+-]?[XYZ]$/i.test(p))) {
      const ax = asAxis(p);
      const ref = Math.abs(ax.dir.z) > 0.9 ? new Dir(1, 0, 0) : new Dir(0, 0, 1);
      const n = ax.dir.cross(ref);
      return new Transform(mirrorMatrix(ax.origin, n), `mirror(axis ${ax.dir.name ?? ''})`);
    }
    const pl = asPlane(p);
    return new Transform(mirrorMatrix(pl.origin, pl.z), `mirror(${pl.name ?? 'plane'})`);
  },
  scale(k, { about = origin } = {}) {
    const ks = Array.isArray(k) ? k.map(scalar) : [scalar(k), scalar(k), scalar(k)];
    const m = I16(); m[0] = ks[0]; m[5] = ks[1]; m[10] = ks[2];
    const o = asPoint(about);
    m[12] = o.x - ks[0] * o.x; m[13] = o.y - ks[1] * o.y; m[14] = o.z - ks[2] * o.z;
    return new Transform(m, `scale(${ks.map(fmtNum).join(', ')})`);
  },
  align(from, to) { return asFrame(from).toTransform().inverse().then(asFrame(to).toTransform()); },
  matrix(arr) { return new Transform(Float64Array.from(arr)); },
};

// ── Frames (planes are frames), axes ───────────────────────────────────────
export class Frame {
  constructor(o, x, y, z, name = null, kind = 'frame') { this.origin = o; this.x = x; this.y = y; this.z = z; this.name = name; this.kind = kind; Object.freeze(this); }
  static make(o, xd, zd, name = null, kind = 'frame') {
    const z = zd.unit ? zd.unit() : zd;
    const d = xd.x * z.x + xd.y * z.y + xd.z * z.z;
    const x = Dir.from(xd.x - d * z.x, xd.y - d * z.y, xd.z - d * z.z);
    const y = z.cross(x);
    return new Frame(asPoint(o), x, y, z, name, kind);
  }
  get normal() { return this.z; }
  offset(d) {
    if (hasDeps(d)) return new Deferred(this.kind === 'plane' ? 'plane' : 'frame', 'offset', [this, d]);
    const k = lenNum(d);
    return new Frame(this.origin.add(this.z.mul(k)), this.x, this.y, this.z, this.name && k === 0 ? this.name : null, this.kind);
  }
  flip() { return new Frame(this.origin, this.x, this.y.neg(), this.z.neg(), null, this.kind); }
  rotate(axis, a) { return this.moved(tx.rotate(axis, a)); }
  moved(t) {
    const T = asTx(t);
    return Frame.make(T.apply(this.origin), T.apply(this.x), T.apply(this.z), null, this.kind);
  }
  toTransform() {
    const m = I16();
    [m[0], m[1], m[2]] = this.x.toArray(); [m[4], m[5], m[6]] = this.y.toArray(); [m[8], m[9], m[10]] = this.z.toArray();
    [m[12], m[13], m[14]] = this.origin.toArray();
    return new Transform(m, this.name ? `frame(${this.name})` : null);
  }
  get matrix() { return this.toTransform(); }
  toWorld(p2) { return this.toTransform().applyArray([p2[0], p2[1], p2[2] ?? 0]); }
  toLocal(p3) { return this.toTransform().inverse().applyArray(p3); }
  toPlaneData() { return { origin: this.origin.toArray(), x: this.x.toArray(), y: this.y.toArray(), normal: this.z.toArray() }; }
  toJSON() { return { ...this.toPlaneData(), name: this.name }; }
  key() { return [this.origin, this.x, this.z].flatMap(v => v.toArray()).map(v => (Math.abs(v) < 1e-10 ? 0 : Number(v.toFixed(9)))).join(','); }
  eq(o, tol = 1e-9) { return this.origin.eq(o.origin, tol) && this.x.eq(o.x, tol) && this.z.eq(o.z, tol); }
  toString() { return this.name ? `plane.${this.name}` : `frame(origin ${this.origin}, z ${this.z})`; }
}
export class Axis {
  constructor(o, d, name = null) { this.origin = o; this.dir = d; this.name = name; Object.freeze(this); }
  moved(t) { const T = asTx(t); return new Axis(T.apply(this.origin), T.apply(this.dir)); }
  reversed() { return new Axis(this.origin, this.dir.neg()); }
  offset(v) { return new Axis(this.origin.add(asVecLike(v)), this.dir); }
  toJSON() { return { origin: this.origin.toArray(), dir: this.dir.toArray(), name: this.name }; }
  toString() { return this.name ? `axis.${this.name}` : `axis(${this.origin}, ${this.dir})`; }
}
function asFrame(f) {
  if (f instanceof Frame) return f;
  if (typeof f === 'string') return asPlane(f);
  if (f instanceof Transform) {
    const m = f.m;
    return Frame.make(new Point(m[12], m[13], m[14]), new Vec(m[0], m[1], m[2]), new Vec(m[8], m[9], m[10]));
  }
  throw new AffineError(`expected a frame, got ${String(f)}`);
}

const PLANES = {
  XY: new Frame(origin, new Dir(1, 0, 0), new Dir(0, 1, 0), new Dir(0, 0, 1), 'XY', 'plane'),
  XZ: new Frame(origin, new Dir(1, 0, 0), new Dir(0, 0, 1), new Dir(0, -1, 0), 'XZ', 'plane'),
  YZ: new Frame(origin, new Dir(0, 1, 0), new Dir(0, 0, 1), new Dir(1, 0, 0), 'YZ', 'plane'),
};

// ── Deferred datums (topology or parameters) ──────────────────────────────
export class Deferred {
  constructor(type, op, args, chain = []) { this.kind = 'deferred'; this.type = type; this.op = op; this.args = Object.freeze(args); this.chain = Object.freeze(chain); Object.freeze(this); }
  _with(method, ...a) { return new Deferred(this.type, this.op, this.args, [...this.chain, [method, ...a]]); }
  offset(d) { return this._with('offset', d); }
  flip() { return this._with('flip'); }
  rotate(axis, a) { return this._with('rotate', axis, a); }
  moved(t) { return this._with('moved', t); }
  get normal() { throw new Error(`${this} is not resolved yet (it needs the kernel)`); }
  toString() { return `${this.type}.${this.op}(…)${this.chain.map(c => '.' + c[0] + '(…)').join('')}`; }
  toJSON() { return { deferred: this.type, op: this.op, chain: this.chain.map(c => c[0]) }; }
}
export const isDeferred = x => x instanceof Deferred;

// resolveDatum(d, { scope, resolve }) → Frame | Axis | Point. `resolve(op, args, type)` is the kernel's selector hook.
export function resolveDatum(d, env = {}) {
  if (!(d instanceof Deferred)) {
    if (typeof d === 'string' && PLANES[d.toUpperCase()]) return PLANES[d.toUpperCase()];
    return d;
  }
  const scope = env.scope ?? {};
  let base;
  switch (d.op) {
    case 'pt': base = new Point(...d.args.map(a => lenNum(a, scope))); break;
    case 'offset': base = resolveDatum(d.args[0], env).offset(lenNum(d.args[1], scope)); break;
    case 'angle': base = resolveDatum(d.args[0], env).moved(tx.rotate(resolveDatum(d.args[1], env), angNum(d.args[2], scope))); break;
    case 'through': base = plane.through(...d.args.map(a => resolveDatum(a, env))); break;
    default:
      if (!env.resolve) throw new Error(`${d.type}.${d.op}(…) depends on topology; the kernel must resolve it`);
      base = env.resolve(d.op, d.args, d.type);
  }
  for (const [method, ...a] of d.chain) {
    if (method === 'offset') base = base.offset(lenNum(a[0], scope));
    else if (method === 'flip') base = base.flip();
    else if (method === 'rotate') base = base.rotate(resolveDatum(a[0], env), angNum(a[1], scope));
    else if (method === 'moved') base = base.moved(a[0]);
  }
  return base;
}

export const plane = {
  XY: PLANES.XY, XZ: PLANES.XZ, YZ: PLANES.YZ,
  offset(p, d) {
    if (p instanceof Deferred || hasDeps(d)) return p instanceof Deferred ? p.offset(d) : new Deferred('plane', 'offset', [asPlane(p), d]);
    return asPlane(p).offset(d);
  },
  angle(p, axis, a) {
    if (p instanceof Deferred || axis instanceof Deferred || hasDeps(a)) return new Deferred('plane', 'angle', [p, axis, a]);
    return asPlane(p).moved(tx.rotate(asAxis(axis), a));
  },
  through(a, b, c) {
    if ([a, b, c].some(x => x instanceof Deferred)) return new Deferred('plane', 'through', [a, b, c]);
    const A = asPoint(a), B = asPoint(b), C = asPoint(c);
    const u = B.sub(A), v = C.sub(A);
    const n = u.cross(v);
    if (n.length < EPS) throw new AffineError('plane.through: the three points are collinear');
    return Frame.make(A, u, n, null, 'plane');
  },
  on(sel, opts = {}) { return new Deferred('plane', 'on', [sel, opts]); },
  mid(a, b) {
    if (a instanceof Frame && b instanceof Frame) {
      const o = a.origin.lerp(b.origin, 0.5);
      const par = Math.abs(a.z.dot(b.z));
      if (par > 1 - 1e-9) {
        const s = a.z.dot(b.z) > 0 ? 1 : -1;
        const d = (b.origin.sub(a.origin)).dot(a.z).value / 2;
        void s;
        return new Frame(a.origin.add(a.z.mul(d)), a.x, a.y, a.z, null, 'plane');
      }
      return Frame.make(o, a.x, a.z.mul(1).add(b.z.mul(a.z.dot(b.z) > 0 ? 1 : -1)), null, 'plane');
    }
    return new Deferred('plane', 'mid', [a, b]);
  },
  normalTo(sel, opts = {}) { return new Deferred('plane', 'normalTo', [sel, opts]); },
};
export const axis = {
  X: new Axis(origin, new Dir(1, 0, 0), 'X'), Y: new Axis(origin, new Dir(0, 1, 0), 'Y'), Z: new Axis(origin, new Dir(0, 0, 1), 'Z'),
  through(p, q) {
    if (p instanceof Deferred || q instanceof Deferred) return new Deferred('axis', 'through', [p, q]);
    const A = asPoint(p), B = asPoint(q); return new Axis(A, B.sub(A).unit());
  },
  of(sel) { return new Deferred('axis', 'of', [sel]); },
};
export function frame({ origin: o = origin, x = new Dir(1, 0, 0), z = new Dir(0, 0, 1) } = {}) {
  return Frame.make(asPoint(o), typeof x === 'string' ? dir(x) : asVecLike(x), typeof z === 'string' ? dir(z) : asVecLike(z));
}
frame.on = (sel, opts = {}) => new Deferred('frame', 'on', [sel, opts]).__withFlip(opts);
Deferred.prototype.__withFlip = function (opts) { return opts.flip ? this.flip() : this; };
export const point = {
  center(sel) { return new Deferred('point', 'center', [sel]); },
  on(sel, opts = {}) { return new Deferred('point', 'on', [sel, opts]); },
};
export { asAxis, asPlane, asFrame, asTx, lenNum, angNum };
