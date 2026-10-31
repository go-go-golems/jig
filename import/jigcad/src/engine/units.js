// units.js · dimensioned quantities (README §4.1).
// A Quantity is a canonical value plus a dimension vector over (L, M, T, Θ, angle, money), plus optional
// symbolic terms (lw, layer, nozzle, bbox) that stay linear until a printer context resolves them.
// Canonical units: L mm, M g, T s, Θ K-difference (degC), angle rad, money usd.
import { parseExpr, evaluate, Expr } from './expr.js';

export const DIM_KEYS = ['L', 'M', 'T', 'Θ', 'angle', 'money'];
const ZERO = Object.freeze([0, 0, 0, 0, 0, 0]);
const D = (L = 0, M = 0, T = 0, Th = 0, A = 0, $ = 0) => Object.freeze([L, M, T, Th, A, $]);
const LEN = D(1);

export class DimensionError extends Error {
  constructor(message, extra = {}) { super(message); this.name = 'DimensionError'; Object.assign(this, extra); }
}
export class AffineError extends Error {
  constructor(message) { super(message); this.name = 'AffineError'; }
}

// Exchange rates are data, not physics: set them (units.rates.eur = 1.1) before compiling.
export const rates = { eur: 1.08 };

// name → { f: canonical per unit, d: dims, sym?: symbol name, show?: display text }
export const UNIT_TABLE = {
  mm: { f: 1, d: LEN }, cm: { f: 10, d: LEN }, m: { f: 1000, d: LEN }, um: { f: 1e-3, d: LEN }, 'µm': { f: 1e-3, d: LEN },
  km: { f: 1e6, d: LEN }, in: { f: 25.4, d: LEN }, inch: { f: 25.4, d: LEN, show: 'in' }, ft: { f: 304.8, d: LEN },
  rad: { f: 1, d: D(0, 0, 0, 0, 1) }, deg: { f: Math.PI / 180, d: D(0, 0, 0, 0, 1) }, '°': { f: Math.PI / 180, d: D(0, 0, 0, 0, 1), show: 'deg' },
  turn: { f: 2 * Math.PI, d: D(0, 0, 0, 0, 1) }, rev: { f: 2 * Math.PI, d: D(0, 0, 0, 0, 1), show: 'turn' },
  g: { f: 1, d: D(0, 1) }, gram: { f: 1, d: D(0, 1), show: 'g' }, kg: { f: 1000, d: D(0, 1) }, mg: { f: 1e-3, d: D(0, 1) },
  s: { f: 1, d: D(0, 0, 1) }, ms: { f: 1e-3, d: D(0, 0, 1) }, minute: { f: 60, d: D(0, 0, 1), show: 'min' }, min: { f: 60, d: D(0, 0, 1) },
  hour: { f: 3600, d: D(0, 0, 1) }, hr: { f: 3600, d: D(0, 0, 1), show: 'hour' },
  degC: { f: 1, d: D(0, 0, 0, 1) }, K: { f: 1, d: D(0, 0, 0, 1) },
  usd: { f: 1, d: D(0, 0, 0, 0, 0, 1) }, eur: { get f() { return rates.eur; }, d: D(0, 0, 0, 0, 0, 1) },
  N: { f: 1e6, d: D(1, 1, -2) }, kN: { f: 1e9, d: D(1, 1, -2) },
  Pa: { f: 1, d: D(-1, 1, -2) }, kPa: { f: 1e3, d: D(-1, 1, -2) }, MPa: { f: 1e6, d: D(-1, 1, -2) }, GPa: { f: 1e9, d: D(-1, 1, -2) },
  lw: { f: 1, d: LEN, sym: 'lw' }, layer: { f: 1, d: LEN, sym: 'layer' }, nozzle: { f: 1, d: LEN, sym: 'nozzle' }, bbox: { f: 1, d: LEN, sym: 'bbox' },
};

// Preferred display units for derived dimensions (key = dims joined by ',').
const PREFERRED = {
  '1,0,0,0,0,0': 'mm', '2,0,0,0,0,0': 'mm^2', '3,0,0,0,0,0': 'mm^3', '0,1,0,0,0,0': 'g', '0,0,1,0,0,0': 's',
  '0,0,0,1,0,0': 'degC', '0,0,0,0,1,0': 'deg', '0,0,0,0,0,1': 'usd', '-3,1,0,0,0,0': 'g/cm^3',
  '1,1,-2,0,0,0': 'N', '-1,1,-2,0,0,0': 'MPa', '0,-1,0,0,0,1': 'usd/kg', '0,0,-1,0,0,1': 'usd/hour',
  '1,0,-1,0,0,0': 'mm/s', '-1,0,0,0,0,0': '1/mm', '-1,0,0,0,1,0': 'deg/mm', '1,0,0,0,-1,0': 'mm/deg',
};
const BASE_SHOW = ['mm', 'g', 's', 'degC', 'rad', 'usd'];

export const DEFAULT_CTX = Object.freeze({ lw: 0.45, layer: 0.2, nozzle: 0.4, bboxDiag: 100 });

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '.': '·' };
const sup = n => String(n).split('').map(ch => SUP[ch] ?? ch).join('');
export const dimsString = d => {
  const parts = [];
  d.forEach((e, i) => { if (e) parts.push(DIM_KEYS[i] + sup(e)); });
  return parts.length ? parts.join(' ') : 'dimensionless';
};
const dimsEq = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
const dimsAdd = (a, b, k = 1) => Object.freeze(a.map((x, i) => x + k * b[i]));
const isZeroDims = d => d.every(x => x === 0);

export function fmtNum(v) {
  if (!Number.isFinite(v)) return String(v);
  if (Object.is(v, -0) || Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e9) return String(Number(v.toFixed(4)));
  return String(Number(v.toPrecision(4)));
}

// ── unit strings ('mm', 'g/cm^3', 'usd/kg', 'mm²', 'N·m') ─────────────────────
const SUPER_IN = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const unitCache = new Map();
export function parseUnit(text) {
  if (unitCache.has(text)) return unitCache.get(text);
  const src = String(text).trim();
  let f = 1, d = ZERO, sym = null, i = 0, sign = 1;
  if (src === '' || src === '1') return { f: 1, d: ZERO, name: '' };
  const re = /\s*([A-Za-zµ°$][A-Za-zµ°_$]*)\s*((?:\^\s*-?\d+(?:\.\d+)?)|[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?\s*([/*·]|$)/y;
  let first = true;
  while (i < src.length) {
    re.lastIndex = i;
    const mt = re.exec(src);
    if (!mt) throw new DimensionError(`unknown unit '${src}'`);
    const u = UNIT_TABLE[mt[1]];
    if (!u) throw new DimensionError(`unknown unit '${mt[1]}' in '${src}'`);
    let e = 1;
    if (mt[2]) e = mt[2].startsWith('^') ? Number(mt[2].slice(1).replace(/\s/g, '')) : Number(mt[2].split('').map(c => SUPER_IN[c]).join(''));
    if (u.sym) { if (!first || e !== 1) throw new DimensionError(`symbolic unit '${mt[1]}' cannot be combined in '${src}'`); sym = u.sym; }
    f *= Math.pow(u.f, sign * e);
    d = dimsAdd(d, u.d, sign * e);
    first = false;
    if (mt[3] === '/') sign = -1; else if (mt[3] === '*' || mt[3] === '·') sign = 1;
    i = re.lastIndex;
    if (!mt[3]) break;
  }
  const res = { f, d, sym, name: src };
  unitCache.set(text, res);
  return res;
}
const prettyUnit = name => name.replace(/\^(-?\d+)/g, (_, n) => sup(n)).replace(/\*/g, '·');

function preferredUnit(d) {
  const k = d.join(',');
  if (PREFERRED[k]) return PREFERRED[k];
  const num = [], den = [];
  d.forEach((e, i) => {
    if (!e) return;
    const s = BASE_SHOW[i] + (Math.abs(e) !== 1 ? '^' + Math.abs(e) : '');
    (e > 0 ? num : den).push(s);
  });
  if (!num.length && !den.length) return '';
  return (num.length ? num.join('*') : '1') + (den.length ? '/' + den.join('/') : '');
}

export function resolveCtx(ctx = {}) {
  const pick = (k, fb) => {
    const v = ctx?.[k];
    if (v == null) return fb;
    if (v instanceof Quantity) return v.resolve(DEFAULT_CTX).v;
    return Number(v);
  };
  return { lw: pick('lw', DEFAULT_CTX.lw), layer: pick('layer', DEFAULT_CTX.layer), nozzle: pick('nozzle', DEFAULT_CTX.nozzle),
    bbox: pick('bboxDiag', pick('bbox', DEFAULT_CTX.bboxDiag)) };
}
const SYMS = ['lw', 'layer', 'nozzle', 'bbox'];

// ── Quantity ────────────────────────────────────────────────────────────────
export class Quantity {
  // v: canonical concrete part; d: dims; u: display unit name; sym: { lw: c, … } | null; fn: lazy ctx → Quantity
  constructor(v, d = ZERO, u = null, sym = null, fn = null, text = null) {
    this.v = v; this.d = d; this.u = u ?? preferredUnit(d); this.sym = sym; this.fn = fn; this.text = text;
    Object.freeze(this);
  }
  static of(value, unit) {
    const p = parseUnit(unit);
    if (p.sym) return new Quantity(0, p.d, 'mm', { [p.sym]: value });
    return new Quantity(value * p.f, p.d, UNIT_TABLE[unit]?.show ?? unit);
  }
  get isQuantity() { return true; }
  get isSymbolic() { return !!this.sym; }
  get isLazy() { return !!this.fn; }
  get dims() {
    const d = this.fn ? this._probe().d : this.d, out = {};
    d.forEach((e, i) => { if (e) out[DIM_KEYS[i]] = e; });
    return out;
  }
  get dimsVector() { return this.fn ? this._probe().d : this.d; }
  get value() { return this.fn || this.sym ? this.resolve(DEFAULT_CTX).v : this.v; }
  get unit() { return this.u; }
  get isDimensionless() { return isZeroDims(this.dimsVector); }
  _probe() { return this.fn(ctxQuantities(DEFAULT_CTX)); }

  resolve(ctx) {
    if (this.fn) {
      const out = this.fn(ctxQuantities(ctx ?? DEFAULT_CTX));
      return toQuantity(out).resolve(ctx);
    }
    if (!this.sym) return this;
    const c = resolveCtx(ctx);
    let v = this.v;
    for (const k of SYMS) if (this.sym[k]) v += this.sym[k] * c[k];
    return new Quantity(v, this.d, this.u === '' ? preferredUnit(this.d) : this.u);
  }

  _lazy(other, op, text) {
    const a = this, b = other;
    return new Quantity(0, ZERO, null, null, ctx => op(a.resolve(ctx), b instanceof Quantity ? b.resolve(ctx) : b), text);
  }
  add(b) {
    b = toQuantity(b);
    if (this.fn || b.fn) { checkSame(this, b, 'add'); return this._lazy(b, (x, y) => x.add(y), `${this} + ${b}`); }
    if (!dimsEq(this.d, b.d)) throw new DimensionError(`cannot add ${describe(this)} to ${describe(b)}`, { a: this, b });
    return new Quantity(this.v + b.v, this.d, this.u || b.u, mergeSym(this.sym, b.sym, 1));
  }
  sub(b) {
    b = toQuantity(b);
    if (this.fn || b.fn) { checkSame(this, b, 'sub'); return this._lazy(b, (x, y) => x.sub(y), `${this} - ${b}`); }
    if (!dimsEq(this.d, b.d)) throw new DimensionError(`cannot subtract ${describe(b)} from ${describe(this)}`, { a: this, b });
    return new Quantity(this.v - b.v, this.d, this.u || b.u, mergeSym(this.sym, b.sym, -1));
  }
  neg() { return this.mul(-1); }
  mul(b) {
    if (typeof b === 'number') {
      if (this.fn) return this._lazy(b, (x, y) => x.mul(y), `${b}·(${this})`);
      return new Quantity(this.v * b, this.d, this.u, scaleSym(this.sym, b));
    }
    b = toQuantity(b);
    if (this.fn || b.fn || (this.sym && b.sym)) return this._lazy(b, (x, y) => x.mul(y), `(${this})·(${b})`);
    const d = dimsAdd(this.d, b.d);
    const u = isZeroDims(b.d) ? this.u : isZeroDims(this.d) ? b.u : preferredUnit(d);
    if (this.sym) return new Quantity(this.v * b.v, d, u, scaleSym(this.sym, b.v));
    if (b.sym) return new Quantity(this.v * b.v, d, u, scaleSym(b.sym, this.v));
    return new Quantity(this.v * b.v, d, u);
  }
  div(b) {
    if (typeof b === 'number') return this.mul(1 / b);
    b = toQuantity(b);
    if (this.fn || b.fn || b.sym) return this._lazy(b, (x, y) => x.div(y), `(${this})/(${b})`);
    const d = dimsAdd(this.d, b.d, -1);
    const u = isZeroDims(b.d) ? this.u : preferredUnit(d);
    return new Quantity(this.v / b.v, d, u, scaleSym(this.sym, 1 / b.v));
  }
  pow(n) {
    if (this.fn || this.sym) return this._lazy(n, (x) => x.pow(n), `(${this})^${n}`);
    const d = Object.freeze(this.d.map(x => x * n));
    return new Quantity(Math.pow(this.v, n), d, preferredUnit(d));
  }
  sqrt() { return this.pow(0.5); }
  abs() {
    if (this.fn || this.sym) return this._lazy(0, x => x.abs(), `abs(${this})`);
    return new Quantity(Math.abs(this.v), this.d, this.u);
  }
  min(b) { return this._minmax(toQuantity(b), Math.min, 'min'); }
  max(b) { return this._minmax(toQuantity(b), Math.max, 'max'); }
  _minmax(b, f, name) {
    if (this.fn || b.fn || this.sym || b.sym) { checkSame(this, b, name); return this._lazy(b, (x, y) => x[name](y), `${name}(${this}, ${b})`); }
    if (!dimsEq(this.d, b.d)) throw new DimensionError(`${name}: ${describe(this)} vs ${describe(b)}`);
    return new Quantity(f(this.v, b.v), this.d, this.u || b.u);
  }
  clamp(lo, hi) { return this.max(lo).min(hi); }
  _cmp(b, name) {
    b = toQuantity(b);
    const x = this.resolve(DEFAULT_CTX), y = b.resolve(DEFAULT_CTX);
    if (!dimsEq(x.d, y.d)) throw new DimensionError(`cannot compare ${describe(x)} with ${describe(y)} (${name})`);
    return [x.v, y.v, x.d];
  }
  gt(b) { const [x, y] = this._cmp(b, 'gt'); return x > y; }
  gte(b) { const [x, y, d] = this._cmp(b, 'gte'); return x >= y - defaultTol(d, x, y); }
  lt(b) { const [x, y] = this._cmp(b, 'lt'); return x < y; }
  lte(b) { const [x, y, d] = this._cmp(b, 'lte'); return x <= y + defaultTol(d, x, y); }
  eq(b, tol) {
    const [x, y, d] = this._cmp(b, 'eq');
    const t = tol == null ? defaultTol(d, x, y) : tol instanceof Quantity ? tol.value : tol;
    return Math.abs(x - y) <= t;
  }
  to(unit) {
    const p = parseUnit(unit);
    if (p.sym) throw new DimensionError(`cannot convert to symbolic unit '${unit}'`);
    const r = this.resolve(DEFAULT_CTX);
    if (!dimsEq(r.d, p.d)) throw new DimensionError(`cannot convert ${describe(r)} to ${unit} (${dimsString(p.d)})`);
    if (this.sym) return new Quantity(this.v, this.d, UNIT_TABLE[unit]?.show ?? unit, this.sym);
    return new Quantity(r.v, r.d, UNIT_TABLE[unit]?.show ?? unit);
  }
  in(unit) {
    const p = parseUnit(unit), r = this.resolve(DEFAULT_CTX);
    if (!dimsEq(r.d, p.d)) throw new DimensionError(`cannot express ${describe(r)} in ${unit}`);
    return r.v / p.f;
  }
  pm(t) { return new Toleranced(this, slotLike(t, this).neg(), slotLike(t, this)); }
  tol(lo, hi) { return new Toleranced(this, slotLike(lo, this), slotLike(hi, this)); }
  displayValue() { const r = this.resolve(DEFAULT_CTX); return r.v / unitFactor(this.u); }
  toString() {
    if (this.fn) return this.text ?? 'ƒ(ctx)';
    if (this.sym) {
      const parts = [];
      for (const k of SYMS) if (this.sym[k]) parts.push(`${fmtNum(this.sym[k])}${k}`);
      if (Math.abs(this.v) > 1e-12) parts.push(`${fmtNum(this.v / unitFactor(this.u))}${prettyUnit(this.u)}`);
      return parts.join(' + ').replace(/\+ -/g, '- ') || '0';
    }
    const u = this.u;
    if (!u) return fmtNum(this.v);
    const n = fmtNum(this.v / unitFactor(u));
    if (u === 'deg') return `${n}°`;
    return `${n} ${prettyUnit(u)}`;
  }
  [Symbol.for('nodejs.util.inspect.custom')]() { return `Quantity(${this.toString()})`; }
  [Symbol.toPrimitive](hint) { return hint === 'number' ? this.value : this.toString(); }
  toJSON() { return { value: this.value, unit: prettyUnit(this.u), dims: this.dims, text: this.toString() }; }
  key() { return this.fn ? `lazy:${this.text}` : `${this.v}|${this.d.join(',')}|${this.sym ? JSON.stringify(this.sym) : ''}`; }
}

function unitFactor(u) { try { return u ? parseUnit(u).f : 1; } catch { return 1; } }
function defaultTol(d, x, y) {
  if (dimsEq(d, LEN)) return 1e-7;
  if (dimsEq(d, D(0, 0, 0, 0, 1))) return 1e-12;
  return 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
}
function checkSame(a, b, op) {
  let da, db;
  try { da = a.dimsVector; db = b.dimsVector; } catch { return; }
  if (!dimsEq(da, db)) throw new DimensionError(op === 'sub' ? `cannot subtract ${describe(b)} from ${describe(a)}` : `cannot ${op} ${describe(a)} and ${describe(b)}`);
}
function mergeSym(a, b, k) {
  if (!a && !b) return null;
  const out = {};
  for (const s of SYMS) { const v = (a?.[s] ?? 0) + k * (b?.[s] ?? 0); if (Math.abs(v) > 1e-15) out[s] = v; }
  return Object.keys(out).length ? Object.freeze(out) : null;
}
function scaleSym(a, k) {
  if (!a) return null;
  const out = {};
  for (const s of SYMS) if (a[s]) out[s] = a[s] * k;
  return Object.freeze(out);
}
function ctxQuantities(ctx) {
  const c = resolveCtx(ctx);
  return Object.freeze({ ...ctx, lw: mm(c.lw), layer: mm(c.layer), nozzle: mm(c.nozzle), bboxDiag: mm(c.bbox), raw: c });
}
function slotLike(t, ref) {
  if (t instanceof Quantity) return t;
  if (typeof t === 'number') return Quantity.of(t, ref.u || 'mm');
  return toQuantity(t);
}
export function describe(q) {
  if (q.fn) { try { q = q.resolve(DEFAULT_CTX); } catch { return 'ƒ(ctx)'; } }
  if (isZeroDims(q.d)) return '1 (dimensionless)';
  const u = q.sym ? 'mm' : (q.u || preferredUnit(q.d));
  return `${prettyUnit(u === 'deg' ? '°' : u)} (${dimsString(q.d)})`;
}

export function isQuantity(x) { return x instanceof Quantity; }
export function toQuantity(x) {
  if (x instanceof Quantity) return x;
  if (typeof x === 'number') return new Quantity(x, ZERO, '');
  if (typeof x === 'string') return q(x);
  if (typeof x === 'function') return q(x);
  throw new DimensionError(`not a quantity: ${String(x)}`);
}

// ── Toleranced ──────────────────────────────────────────────────────────────
export class Toleranced {
  constructor(nominal, lo, hi) { this.nominal = nominal; this.lo = lo; this.hi = hi; Object.freeze(this); }
  get min() { return this.nominal.add(this.lo); }
  get max() { return this.nominal.add(this.hi); }
  get value() { return this.nominal.value; }
  toString() {
    const sym = Math.abs(this.lo.value + this.hi.value) < 1e-12;
    const u = this.nominal.u, f = unitFactor(u);
    if (sym) return `${this.nominal} ± ${fmtNum(this.hi.value / f)}`;
    return `${this.nominal} +${fmtNum(this.hi.value / f)}/${fmtNum(this.lo.value / f)}`;
  }
  toJSON() { return { nominal: this.nominal.toJSON(), lo: this.lo.value, hi: this.hi.value, text: this.toString() }; }
}

// ── constructors ────────────────────────────────────────────────────────────
const make = unit => {
  const f = n => {
    if (n instanceof Quantity) throw new DimensionError(`${unit}(…) takes a number, got ${n}`);
    if (typeof n === 'string') return q(`${n} ${unit}`);
    if (typeof n !== 'number' || Number.isNaN(n)) throw new TypeError(`${unit}(…) takes a number, got ${String(n)}`);
    return Quantity.of(n, unit);
  };
  Object.defineProperty(f, 'name', { value: unit });
  return f;
};
export const mm = make('mm'), cm = make('cm'), m = make('m'), um = make('um'), inch = make('inch'), ft = make('ft');
export const deg = make('deg'), rad = make('rad'), turn = make('turn');
export const kg = make('kg'), gram = make('gram');
export const N = make('N'), kN = make('kN'), MPa = make('MPa'), GPa = make('GPa');
export const s = make('s'), minute = make('minute'), hour = make('hour'), degC = make('degC');
export const usd = make('usd'), eur = make('eur');
export const lw = make('lw'), layer = make('layer'), nozzle = make('nozzle'), bbox = make('bbox');
export const units = { mm, cm, m, um, inch, ft, deg, rad, turn, kg, gram, N, kN, MPa, GPa, s, minute, hour, degC, usd, eur, lw, layer, nozzle, bbox, rates };
export const BARE_NAMES = Object.keys(units).filter(k => k !== 'rates');

// j.q: parse a string, wrap a number, or make a lazy quantity from a lambda.
export function q(x) {
  if (x instanceof Quantity) return x;
  if (typeof x === 'number') return new Quantity(x, ZERO, '');
  if (typeof x === 'function') {
    const fn = x;
    return new Quantity(0, ZERO, null, null, ctx => toQuantity(fn(ctx)), 'ƒ(ctx)');
  }
  if (typeof x === 'string') {
    const out = evaluate(parseExpr(x), {});
    return out instanceof Quantity ? out : new Quantity(out, ZERO, '');
  }
  throw new TypeError(`j.q: cannot make a quantity from ${typeof x}`);
}
const wrapNum = f => (...a) => {
  const r = f(...a.map(x => (x instanceof Quantity ? x : toQuantity(x))));
  return r;
};
const angleIn = (x, name) => {
  const r = x.resolve(DEFAULT_CTX);
  if (!dimsEq(r.d, D(0, 0, 0, 0, 1)) && !isZeroDims(r.d)) throw new DimensionError(`${name} takes an angle, got ${describe(r)}`);
  return r.v;
};
q.sqrt = wrapNum(a => a.sqrt());
q.sin = wrapNum(a => Math.sin(angleIn(a, 'sin')));
q.cos = wrapNum(a => Math.cos(angleIn(a, 'cos')));
q.tan = wrapNum(a => Math.tan(angleIn(a, 'tan')));
const dimless = (x, name) => { const r = x.resolve(DEFAULT_CTX); if (!isZeroDims(r.d)) throw new DimensionError(`${name} takes a number, got ${describe(r)}`); return r.v; };
q.asin = wrapNum(a => rad(Math.asin(dimless(a, 'asin'))).to('deg'));
q.acos = wrapNum(a => rad(Math.acos(dimless(a, 'acos'))).to('deg'));
q.atan2 = wrapNum((y, x) => {
  const a = y.resolve(DEFAULT_CTX), b = x.resolve(DEFAULT_CTX);
  if (!dimsEq(a.d, b.d)) throw new DimensionError(`atan2: ${describe(a)} vs ${describe(b)}`);
  return rad(Math.atan2(a.v, b.v)).to('deg');
});
q.min = (...xs) => xs.map(toQuantity).reduce((a, b) => a.min(b));
q.max = (...xs) => xs.map(toQuantity).reduce((a, b) => a.max(b));

// dims kind used by slots, rows and the customizer
export function dimsKind(x) {
  if (typeof x === 'number') return Number.isInteger(x) ? 'int' : 'number';
  if (!(x instanceof Quantity)) return 'other';
  const k = x.dimsVector.join(',');
  return { '1,0,0,0,0,0': 'length', '0,0,0,0,1,0': 'angle', '2,0,0,0,0,0': 'area', '3,0,0,0,0,0': 'volume', '0,1,0,0,0,0': 'mass',
    '0,0,1,0,0,0': 'time', '0,0,0,1,0,0': 'temperature', '0,0,0,0,0,1': 'money', '0,0,0,0,0,0': 'number', '1,1,-2,0,0,0': 'force',
    '-1,1,-2,0,0,0': 'pressure', '-3,1,0,0,0,0': 'density' }[k] ?? 'quantity';
}

// Typed-slot coercion. kind: 'length' | 'angle' | 'number' | 'any'. scope: param values (object or fn) for strings.
export function coerce(x, kind = 'any', scope = null) {
  if (x == null) return x;
  if (typeof x === 'number') {
    if (kind === 'length') return mm(x);
    if (kind === 'angle') return deg(x);
    return x;
  }
  if (typeof x === 'string' || (x && x.kind === 'expr')) {
    const text = typeof x === 'string' ? x : x.text;
    if (scope == null) return x.kind === 'expr' ? x : exprOf(text);
    const out = evaluate(typeof x === 'string' ? parseExpr(x) : x.ast, scope);
    return coerce(out, kind, null);
  }
  if (x instanceof Quantity) {
    if (kind === 'any') return x;
    let d;
    try { d = x.dimsVector; } catch { return x; }
    if (kind === 'length' && !dimsEq(d, LEN)) throw new DimensionError(`expected a length, got ${describe(x)}`);
    if (kind === 'angle') {
      if (isZeroDims(d)) return deg(x.value);
      if (!dimsEq(d, D(0, 0, 0, 0, 1))) throw new DimensionError(`expected an angle, got ${describe(x)}`);
    }
    if (kind === 'number') {
      if (!isZeroDims(d)) throw new DimensionError(`expected a number, got ${describe(x)}`);
      return x.value;
    }
    return x;
  }
  return x;
}
function exprOf(text) { return new Expr(text); }

export const LENGTH_DIMS = LEN;
export const ANGLE_DIMS = D(0, 0, 0, 0, 1);
export const NO_DIMS = ZERO;
export { dimsEq, preferredUnit, prettyUnit };
