// Fit (README §4.11): clearance classes, printer/material fit profiles, fit-aware sizes, coupons,
// calibration by least squares, and tolerance stacks (worst case, RSS, Monte Carlo).
import { mm, isQuantity, Quantity } from './units.js';
import { hashStr } from './hash.js';

export const DEFAULT_CLASSES = Object.freeze({ press: 0.05, snug: 0.10, slide: 0.20, free: 0.30, printInPlace: 0.40 });
const mmv = x => x == null ? null : typeof x === 'number' ? x : isQuantity(x) ? x.value : Number(x);

export class FitProfile {
  constructor(name, o = {}) {
    this.name = name; this.printer = o.printer ?? null; this.material = o.material ?? null;
    this.classes = Object.fromEntries(Object.entries({ ...DEFAULT_CLASSES, ...(o.classes ?? {}) }).map(([k, v]) => [k, mmv(v)]));
    this.holeComp = o.holeComp ?? 0.1; this.xyComp = mmv(o.xyComp ?? 0); this.elephantFoot = mmv(o.elephantFoot ?? 0.2);
    this.calibrated = o.calibrated ?? !!o.classes; this.date = o.date ?? null; this.coupons = o.coupons ?? [];
    Object.freeze(this);
  }
  get isFitProfile() { return true; }
  toString() { return `fit '${this.name}'`; }
}
export const fit = {
  classes(obj) { return obj ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? mm(v) : v])) : Object.fromEntries(Object.entries(DEFAULT_CLASSES).map(([k, v]) => [k, mm(v)])); },
  profile(name, o = {}) { return new FitProfile(name, { ...o, calibrated: !!o.classes }); },
  gap(cls) { return lazyFit(`gap(${cls})`, f => f.classes[cls] ?? err(cls)); },
  hole(d, cls) { return lazyFit(`hole(${fmt(d)}, ${cls})`, (f, len) => { const n = len(d); const target = n + 2 * (f.classes[cls] ?? err(cls)); return target + compOf(f, target); }); },
  pin(d, cls) { return lazyFit(`pin(${fmt(d)}, ${cls})`, (f, len) => len(d) - 2 * (f.classes[cls] ?? err(cls)) + 2 * f.xyComp); },
  coupon(o = {}) { return coupon(o); },
  calibrate,
};
const err = cls => { throw new Error(`unknown fit class '${cls}'`); };
const fmt = d => typeof d === 'number' ? `${d} mm` : String(d);
// Hole compensation (mm) for a hole of diameter d (number in mm or a Quantity). f is a FitProfile, whose
// holeComp is a length or a function (d: Quantity, { fit }) → Quantity | mm, or a compile fit context
// (holeComp(d mm) → mm already).
export function compOf(f, d) {
  const dv = mmv(d);
  if (f?.profile?.isFitProfile) return mmv(f.holeComp(dv));
  const hc = f.holeComp;
  if (typeof hc === 'function') { const r = hc(mm(dv), { fit: f }); return mmv(r); }
  return mmv(hc);
}
// The fit context of the compile in progress (compilePart sets it), so fit values resolve right wherever core
// reads them (sketch dimensions, params, arithmetic) without a context of their own.
let CURRENT_FIT = null, CURRENT_LEN = null;   // the compile's fit context and length coercer (expressions)
export const setCurrentFit = (f, len = null) => { const prev = [CURRENT_FIT, CURRENT_LEN]; CURRENT_FIT = f; CURRENT_LEN = len; return prev; };
export const restoreFit = prev => { [CURRENT_FIT, CURRENT_LEN] = prev ?? [null, null]; };
const fitOf = f => f?.isFitProfile ? (f.profile ? f : fitContext(f)) : typeof f === 'string' ? fitContext(f) : CURRENT_FIT ?? fitContext(null);
// A fit-dependent length is a lazy core Quantity (arithmetic works: j.fit.pin(5, 'slide').div(2)) that resolves
// in ctx.fit, else the compile's fit context, else the default classes. Its text names it ('j.fit.gap(slide)'),
// which also puts the fit key into feature cache keys.
class FitQuantity extends Quantity {
  get isFitValue() { return true; }
  resolveSize(ctx = {}) { return this.resolve({ fit: ctx.fit }).value; }
}
const LEN = mm(1).d;
function lazyFit(text, fn) {
  const lenOf = x => typeof x === 'string' ? (CURRENT_LEN ? CURRENT_LEN(x) : NaN) : mmv(x);   // 'pin' names a param
  return new FitQuantity(0, LEN, 'mm', null, c => mm(fn(fitOf(c?.fit), lenOf)), `j.fit.${text}`);
}

// Fit context used by the compiler: { name, key, classes (mm), holeComp(d) → mm, xyComp, elephantFoot, calibrated }
const NAMED = new Map();
export function registerProfile(p) { NAMED.set(p.name, p); return p; }
export function fitContext(src, printer, gapOverride = null) {
  let p = src?.isFitProfile && !src.profile ? src : src?.profile ? src.profile : typeof src === 'string' ? NAMED.get(src) ?? new FitProfile(src, { calibrated: false }) : new FitProfile('default', { calibrated: false });
  if (gapOverride && Object.keys(gapOverride).length) {
    const cls = { ...p.classes };
    for (const [k, v] of Object.entries(gapOverride)) cls[k] = typeof v === 'string' ? parseFloat(v) : mmv(v);
    p = new FitProfile(p.name, { ...p, classes: cls, calibrated: p.calibrated });
  }
  const ctx = {
    isFitProfile: true, name: p.name, classes: p.classes, xyComp: p.xyComp, elephantFoot: p.elephantFoot, calibrated: p.calibrated,
    holeComp: d => compOf(p, d), profile: p,
    key: hashStr(JSON.stringify([p.name, p.classes, typeof p.holeComp === 'function' ? p.holeComp.toString() : p.holeComp, p.xyComp])),
  };
  return ctx;
}

// Least squares: actual = a · nominal + b (holes); classes from the first row with each outcome.
export function calibrate(rows, opts = {}) {
  const pts = [];
  let pin = null;
  const classes = {};
  for (const r of rows) {
    if (r.pin != null) pin = mmv(r.pin);
    if (r.holes) for (const [n, m] of r.holes) pts.push([mmv(n), mmv(m)]);
  }
  let a = 1, b = 0, r2 = 1, sd = 0;
  if (pts.length >= 2) {
    const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
    const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
    a = (n * sxy - sx * sy) / (n * sxx - sx * sx); b = (sy - a * sx) / n;
    const my = sy / n, ssTot = pts.reduce((s, p) => s + (p[1] - my) ** 2, 0), ssRes = pts.reduce((s, p) => s + (p[1] - (a * p[0] + b)) ** 2, 0);
    r2 = ssTot ? 1 - ssRes / ssTot : 1; sd = Math.sqrt(ssRes / Math.max(1, n - 2));
  }
  for (const r of rows) {
    if (!r.holes || !r.outcomes || pin == null) continue;
    r.outcomes.forEach((o, i) => { if (['press', 'snug', 'slide', 'free'].includes(o) && classes[o] == null) classes[o] = +((r.holes[i][1] - pin) / 2).toFixed(4); });
  }
  const pip = rows.find(r => r.coupon?.kind === 'print-in-place' && r.outcomes);
  if (pip) {
    const [lo, hi] = (pip.coupon.range ?? [0.2, 0.5]).map(mmv); const steps = pip.coupon.steps ?? pip.outcomes.length;
    const i = pip.outcomes.indexOf('free'); if (i >= 0) classes.printInPlace = +(lo + (hi - lo) * i / Math.max(1, steps - 1)).toFixed(4);
  }
  const nominalPin = rows.find(r => r.coupon?.pin)?.coupon.pin;
  return { hole: { a, b, r2, residualSD: sd, range: pts.length ? [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))] : null },
    pinOversize: pin != null ? +(pin - mmv(nominalPin ?? 6)).toFixed(4) : null, classes, date: opts.at ?? null };
}

// Tolerance stacks: j.stack(name).add(q.pm(t), { dir })
export function stack(name) { return new Stack(name, []); }
class Stack {
  constructor(name, items) { this.name = name; this.items = items; Object.freeze(this); }
  add(ref, { dir = 1 } = {}) { return new Stack(this.name, [...this.items, { ref, dir }]); }
  _terms() { return this.items.map(({ ref, dir }) => { const nominal = mmv(ref.nominal ?? ref.value ?? ref); const lo = mmv(ref.lo ?? ref.minus ?? -(ref.tol ?? 0)), hi = mmv(ref.hi ?? ref.plus ?? ref.tol ?? 0); return { n: dir * nominal, lo: dir > 0 ? lo : -hi, hi: dir > 0 ? hi : -lo }; }); }
  worstCase() { const t = this._terms(); const n = sum(t.map(x => x.n)); return { nominal: mm(n), range: [mm(n + sum(t.map(x => x.lo))), mm(n + sum(t.map(x => x.hi)))] }; }
  rss() { const t = this._terms(); const n = sum(t.map(x => x.n)); const half = Math.sqrt(sum(t.map(x => ((x.hi - x.lo) / 2) ** 2))); return { nominal: mm(n), range: [mm(n - half), mm(n + half)], sigma: mm(half / 3) }; }
  monteCarlo({ n = 10000, seed = 1, dist = 'normal' } = {}) {
    const t = this._terms(); const rnd = rng(seed); const xs = [];
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (const x of t) { const mid = (x.lo + x.hi) / 2, half = (x.hi - x.lo) / 2; let z; if (dist === 'uniform') z = rnd() * 2 - 1; else { do { z = gauss(rnd) / 3; } while (Math.abs(z) > 1); } s += x.n + mid + half * z; }
      xs.push(s);
    }
    xs.sort((a, b) => a - b);
    const mean = sum(xs) / n, sd = Math.sqrt(sum(xs.map(x => (x - mean) ** 2)) / n);
    return { mean: mm(mean), sd: mm(sd), p001: mm(xs[Math.floor(n * 0.001)]), p999: mm(xs[Math.floor(n * 0.999)]), min: mm(xs[0]), max: mm(xs[n - 1]), samples: xs,
      p: pred => xs.filter(x => pred(mm(x))).length / n };
  }
}
const sum = a => a.reduce((s, x) => s + x, 0);
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 1; }

// Calibration coupons: printable parts with graded gaps (compensation off: they measure the raw printer).
import { part } from './part.js';
import { region } from './region.js';
import { cyl } from './csg.js';
function coupon({ kind = 'pin-hole', range = [0.05, 0.5], steps = 10, pin = 6 } = {}) {
  const [lo, hi] = range.map(mmv), d = mmv(pin);
  const gaps = Array.from({ length: steps }, (_, i) => +(lo + (hi - lo) * i / Math.max(1, steps - 1)).toFixed(4));
  const pitch = d + 2 * hi + 4;
  let plate = region.rect(pitch * steps, d + 8, { center: false });
  for (const [i, g] of gaps.entries()) plate = plate.subtract(region.circle(d / 2 + g, { at: [pitch * (i + 0.5), (d + 8) / 2] }));
  let p = part(`coupon-${kind}`).extrude(plate, 4, { id: 'plate' });
  if (kind === 'pin-hole') for (const i of gaps.keys()) p = p.add(cyl(d / 2, 8).moved([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, pitch * (i + 0.5), -(d / 2 + 6), 0, 1]), { id: `pin${i + 1}`, op: 'new' });
  return Object.assign(p.set('coupon', { kind, gaps, pin: d }), {});
}
