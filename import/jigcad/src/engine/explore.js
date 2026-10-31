// Explore (README §4.16, minimal): design spaces, objectives (Pareto by non-dominated sorting), grid/random/
// Latin-hypercube search, evaluate, a small stage().
import { compile } from './program.js';
import { rng } from './fit.js';
import { mm } from './units.js';
import { CANDIDATES, dirName } from './print.js';

const num = x => typeof x === 'number' ? x : x?.value ?? Number(x);
class Param {
  constructor(kind, o) { this.kind = kind; Object.assign(this, o); Object.freeze(this); }
  values(steps = 5) {
    if (this.kind === 'choice') return this.options;
    if (this.kind === 'int') { const out = []; for (let i = this.lo; i <= this.hi; i++) out.push(i); return out; }
    if (this.kind === 'dir') return CANDIDATES.slice(0, this.samples ?? 26).map(dirName);
    const lo = num(this.lo), hi = num(this.hi), unit = this.lo?.unit;
    const st = this.step ? num(this.step) : (hi - lo) / Math.max(1, steps - 1);
    const out = []; for (let v = lo; v <= hi + 1e-9; v += st) out.push(unit ? mm(v) : v);
    return out;
  }
  sample(r) {
    if (this.kind === 'choice') return this.options[Math.floor(r() * this.options.length)];
    if (this.kind === 'int') return this.lo + Math.floor(r() * (this.hi - this.lo + 1));
    if (this.kind === 'dir') return dirName(CANDIDATES[Math.floor(r() * 26)]);
    const v = num(this.lo) + r() * (num(this.hi) - num(this.lo)); return this.lo?.unit ? mm(v) : v;
  }
  // the value at u ∈ [0, 1): ranges linearly, finite params by equal strata
  at(u) {
    if (this.kind === 'choice') return this.options[Math.min(this.options.length - 1, Math.floor(u * this.options.length))];
    if (this.kind === 'int') return Math.min(this.hi, this.lo + Math.floor(u * (this.hi - this.lo + 1)));
    if (this.kind === 'dir') { const n = Math.min(26, this.samples ?? 26); return dirName(CANDIDATES[Math.min(n - 1, Math.floor(u * n))]); }
    const v = num(this.lo) + u * (num(this.hi) - num(this.lo)); return this.lo?.unit ? mm(v) : v;
  }
  get def() { return this.default ?? (this.kind === 'choice' ? this.options[0] : this.kind === 'dir' ? '+Z' : this.kind === 'int' ? this.lo : this.lo); }
}
export const param = {
  range: (lo, hi, o = {}) => new Param('range', { lo, hi, step: o.step, default: o.default }),
  choice: (options, o = {}) => new Param('choice', { options, default: o.default }),
  int: (lo, hi, o = {}) => new Param('int', { lo, hi, default: o.default }),
  dir: (o = {}) => new Param('dir', { samples: o.samples ?? 26, default: o.default ?? '+Z' }),
};
class Design {
  constructor(params, fn, o = {}) { this.params = params; this.fn = fn; this.o = o; Object.freeze(this); }
  get isDesign() { return true; }
  get kind() { return 'design'; }
  defaults() { return Object.fromEntries(Object.entries(this.params).map(([k, p]) => [k, p.def])); }
  at(point) { return this.fn({ ...this.defaults(), ...point }); }
  defaultModel() { return this.at({}); }
  fix(point) { return new Design(Object.fromEntries(Object.entries(this.params).filter(([k]) => !(k in point))), p => this.fn({ ...p, ...point }), this.o); }
  where(pred) { return new Design(this.params, this.fn, { ...this.o, where: pred }); }
  get size() { return Object.values(this.params).reduce((s, p) => s * (p.kind === 'range' ? Infinity : p.values().length), 1); }
  sample(n, { seed = 1 } = {}) { const r = rng(seed); return Array.from({ length: n }, () => Object.fromEntries(Object.entries(this.params).map(([k, p]) => [k, p.sample(r)]))); }
  // Latin hypercube: each parameter's range is cut into n equal strata and every stratum is used exactly once
  // (an independent random permutation per parameter, a random point inside each stratum)
  lhs(n, { seed = 1 } = {}) {
    const r = rng(seed), keys = Object.keys(this.params);
    const perms = keys.map(() => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });
    return Array.from({ length: n }, (_, i) => Object.fromEntries(keys.map((k, d) => [k, this.params[k].at((perms[d][i] + r()) / n)])));
  }
}
export const design = (params, fn, o) => new Design(params, fn, o);

const metricsRegistry = new Map();
export function metric(name, fn, o = {}) { metricsRegistry.set(name, { name, fn, ...o }); return name; }
const metricValue = (prog, name) => { const r = metricsRegistry.get(name); if (r) return num(r.fn(prog)); const m = prog.data.metrics[name]; return m ? num(Array.isArray(m.value) ? m.value.reduce((a, b) => a * b, 1) : m.value) : NaN; };
export const objective = {
  minimize: m => ({ kind: 'min', m, score: p => metricValue(p, m) }),
  maximize: m => ({ kind: 'max', m, score: p => -metricValue(p, m) }),
  weighted: ws => ({ kind: 'weighted', score: p => Object.values(ws).reduce((s, [m, w]) => s + w * metricValue(p, typeof m === 'string' ? m : m.m), 0) }),
  lexicographic: list => ({ kind: 'lex', list: list.map(x => typeof x === 'string' ? objective.minimize(x) : x), score: p => list.map(x => (typeof x === 'string' ? objective.minimize(x) : x).score(p)) }),
  // Pareto: rows ranked by non-dominated front (1 = Pareto-optimal), then by crowding distance (NSGA-II)
  pareto: list => { const objs = list.map(x => typeof x === 'string' ? objective.minimize(x) : x); return { kind: 'pareto', list: objs, score: p => objs.map(o => o.score(p)) }; },
  require: rules => ({ kind: 'require', rules, score: p => (rules.check ? rules.check(p) : []).filter(d => d.level === 'error').length }),
};
export function evaluate(obj, prog) { return obj.score(prog); }
const cmpScore = (a, b) => Array.isArray(a) ? a.reduce((r, x, i) => r || (Math.abs(x - b[i]) > 1e-9 ? x - b[i] : 0), 0) : a - b;
async function run(d, points, o) {
  const obj = o.objective ?? d.o.objective ?? objective.minimize('volume');
  const t0 = performance.now();
  const rows = [];
  let hits = 0, feats = 0;
  for (const point of points) {
    if (d.o.where && !d.o.where(point)) continue;
    const prog = compile(d.at(point), { mesh: false });
    hits += prog.data.metrics.cacheHitRate.value * prog.data.metrics.features.value; feats += prog.data.metrics.features.value;
    rows.push({ point, score: obj.score(prog), metrics: prog.metrics(), ok: prog.data.ok });
  }
  if (obj.kind === 'pareto') paretoRank(rows); else rows.sort((a, b) => cmpScore(a.score, b.score));
  return { best: rows[0], ranked: rows, front: obj.kind === 'pareto' ? rows.filter(r => r.front === 1) : rows.slice(0, 5), stats: { compiles: rows.length, cacheHitRate: feats ? hits / feats : 0, ms: performance.now() - t0 },
    table: () => rows.map(r => ({ ...r.point, score: r.score })) };
}
// Fast non-dominated sorting (Deb et al. 2002): front numbers, then crowding distance inside each front
// (boundary points ∞); rows sorted by (front ↑, crowding ↓). Scores are vectors to minimise.
export function paretoRank(rows) {
  const n = rows.length, S = rows.map(() => []), dom = new Array(n).fill(0);
  const dominates = (a, b) => { let better = false; for (let i = 0; i < a.length; i++) { if (a[i] > b[i] + 1e-12) return false; if (a[i] < b[i] - 1e-12) better = true; } return better; };
  for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
    if (dominates(rows[p].score, rows[q].score)) { S[p].push(q); dom[q]++; }
    else if (dominates(rows[q].score, rows[p].score)) { S[q].push(p); dom[p]++; }
  }
  let current = rows.map((_, i) => i).filter(i => dom[i] === 0), k = 1;
  while (current.length) {
    const next = [];
    for (const p of current) { rows[p].front = k; for (const q of S[p]) if (--dom[q] === 0) next.push(q); }
    crowding(current.map(i => rows[i]));
    current = next; k++;
  }
  rows.sort((a, b) => a.front - b.front || b.crowding - a.crowding);
  return rows;
}
function crowding(front) {
  front.forEach(r => { r.crowding = 0; });
  const m = front[0]?.score.length ?? 0;
  for (let i = 0; i < m; i++) {
    const s = front.slice().sort((a, b) => a.score[i] - b.score[i]);
    const span = s[s.length - 1].score[i] - s[0].score[i];
    s[0].crowding = s[s.length - 1].crowding = Infinity;
    if (span > 0) for (let j = 1; j < s.length - 1; j++) s[j].crowding += (s[j + 1].score[i] - s[j - 1].score[i]) / span;
  }
}
export const search = {
  grid: async (d, o = {}) => { const keys = Object.keys(d.params); let pts = [{}]; for (const k of keys) pts = pts.flatMap(p => d.params[k].values(o.steps ?? 5).map(v => ({ ...p, [k]: v }))); return run(d, pts, o); },
  random: async (d, o = {}) => run(d, d.sample(o.budget ?? 10, { seed: o.seed ?? 1 }), o),
  lhs: async (d, o = {}) => run(d, d.lhs(o.budget ?? 10, { seed: o.seed ?? 1 }), o),
};
// Staging (minimal): finite params tabulated, volume/mass linear in a single length param via two compiles.
export function stage(x) {
  if (!x?.isDesign) return { tabulated: { compiled: 1 }, residual: {}, note: 'nothing to stage: not a design space', summary: () => 'static' };
  const keys = Object.keys(x.params);
  const k = keys.find(n => x.params[n].kind === 'range');
  if (!k) return { tabulated: { points: x.size }, residual: {}, note: 'all parameters are finite: tabulate them' };
  const p = x.params[k], a = num(p.def), b = a + 1;
  const A = compile(x.at({ [k]: p.lo?.unit ? mm(a) : a }), { mesh: false }), B = compile(x.at({ [k]: p.lo?.unit ? mm(b) : b }), { mesh: false });
  const slope = B.data.metrics.mass.value - A.data.metrics.mass.value, icpt = A.data.metrics.mass.value - slope * a;
  const massFn = h => slope * num(h) + icpt;
  return { tabulated: { compiled: 2 }, residual: { mass: Object.assign(massFn, { slope, intercept: icpt }) }, note: `mass is linear in ${k} (Cavalieri); geometry compiled at ${k} = ${a} and ${b}` };
}
