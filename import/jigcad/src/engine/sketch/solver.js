// solver.js · graph-decomposed nonlinear solve of a sketch system (README §4.5, example 04).
// Clusters = connected components of the parameter/constraint graph. Per cluster: DogLeg (Gauss–Newton step =
// minimum-norm solution through a rank-revealing QR) with Levenberg–Marquardt fallback. DOF = n − rank J.
// Redundant rows are found incrementally; conflicts get a minimal conflicting set by a deletion filter.
import { factorJ, cholSolve, RowSpace, norm, normInf, lsCoefficients, qrcp } from './linalg.js';
import { buildTape } from './sym.js';
import * as RS from '../rs/index.js';

// ── tapes: with jig-compute loaded, every equation (sym.js expression) is solved in Rust ───────────────────
// A sketch system gets one tape; each equation remembers its index (tid) and the TapeRef.
export function ensureTape(sys) {
  if (sys._tape !== undefined) return sys._tape;
  const eqs = sys.cons.flatMap(c => c.eqs ?? []);
  if (!eqs.length || !eqs.every(e => e.s)) return (sys._tape = null);
  const ref = new RS.TapeRef(buildTape(eqs.map(e => e.s)));
  eqs.forEach((e, k) => { e.tid = k; e.tref = ref; });
  return (sys._tape = ref);
}
const tapedRef = eqs => {
  if (!RS.enabled() || !eqs.length) return null;
  const ref = eqs[0].tref;
  return ref && eqs.every(e => e.tref === ref) ? ref : null;
};
const tidsOf = eqs => Uint32Array.from(eqs, e => e.tid);

const TOL_F = 1e-10, FEASIBLE = 1e-8;
export const METHODS = ['dogleg', 'lm', 'newton'];

// ── local problem over a set of columns ──────────────────────────────────────
export function makeProblem(x, eqs, cols) {
  const ref = tapedRef(eqs);
  if (ref) {
    const n = cols.length, m = eqs.length, tids = tidsOf(eqs), C = Uint32Array.from(cols), X = x;
    const set = xc => { for (let k = 0; k < n; k++) X[cols[k]] = xc[k]; };
    const get = () => Float64Array.from(cols, c => X[c]);
    const both = xc => { set(xc); const o = RS.tapeJacobian(ref, X, C, tids); if (!o) throw new Error('jig-compute failed in tapeJacobian'); return o; };
    return { n, m, res: xc => Float64Array.from(both(xc).r), jac: xc => Float64Array.from(both(xc).J), get, set, cols, taped: true };
  }
  const n = cols.length, m = eqs.length;
  const colOf = new Map(cols.map((c, k) => [c, k]));
  const local = eqs.map(e => ({ f: e.f, vars: e.vars, lc: e.vars.map(v => colOf.get(v)) }));
  const X = x;                                   // shared full vector; we write cluster params in place
  const set = xc => { for (let k = 0; k < n; k++) X[cols[k]] = xc[k]; };
  const get = () => Float64Array.from(cols, c => X[c]);
  const res = xc => { set(xc); const r = new Float64Array(m); for (let i = 0; i < m; i++) r[i] = local[i].f(X); return r; };
  const jac = xc => {
    set(xc);
    const J = new Float64Array(m * n);
    for (let i = 0; i < m; i++) {
      const e = local[i];
      for (let t = 0; t < e.vars.length; t++) {
        const v = e.vars[t], k = e.lc[t];
        if (k == null) continue;
        const x0 = X[v], h = 1e-4 * Math.max(1, Math.abs(x0));
        X[v] = x0 + h; const f1 = e.f(X);
        X[v] = x0 - h; const f_1 = e.f(X);
        X[v] = x0 + 2 * h; const f2 = e.f(X);
        X[v] = x0 - 2 * h; const f_2 = e.f(X);
        X[v] = x0;
        J[i * n + k] = (8 * (f1 - f_1) - (f2 - f_2)) / (12 * h);
      }
    }
    return J;
  };
  return { n, m, res, jac, get, set, cols };
}
const half2 = r => { let s = 0; for (let i = 0; i < r.length; i++) s += r[i] * r[i]; return s / 2; };
function matVec(J, m, n, v) { const o = new Float64Array(m); for (let i = 0; i < m; i++) { let s = 0; for (let k = 0; k < n; k++) s += J[i * n + k] * v[k]; o[i] = s; } return o; }
function matTVec(J, m, n, v) { const o = new Float64Array(n); for (let i = 0; i < m; i++) { const vi = v[i]; if (vi) for (let k = 0; k < n; k++) o[k] += J[i * n + k] * vi; } return o; }

export function dogleg(F, x0, { maxIter = 100 } = {}) {
  let x = Float64Array.from(x0), r = F.res(x), f = half2(r);
  let delta = Math.max(1, 0.25 * normInf(x)), it = 0;
  const { m, n } = F;
  if (!m) return { x, r, iters: 0, converged: true, residual: 0 };
  let stall = 0, inconsistent = 0;
  const hist = [];
  for (; it < maxIter && normInf(r) > TOL_F; it++) {
    const fPrev = f;
    const J = F.jac(x);
    const g = matTVec(J, m, n, r);
    if (normInf(g) < 1e-15) break;
    const fac = factorJ(J, m, n);
    const hgn = fac.solve(Float64Array.from(r, v => -v));
    if (fac.rank < m) {
      // dependent rows: if the linear model cannot reach zero either, the system is (locally) inconsistent
      const Jh0 = matVec(J, m, n, hgn);
      if (norm(Float64Array.from(r, (v, i) => v + Jh0[i])) > 0.5 * norm(r)) { if (++inconsistent >= 3) break; } else inconsistent = 0;
    }
    hist.push(f);
    if (hist.length > 10 && f > 0.99 * hist[hist.length - 11]) break;
    const Jg = matVec(J, m, n, g);
    const alpha = (norm(g) ** 2) / Math.max(1e-300, norm(Jg) ** 2);
    let accepted = false;
    for (let tries = 0; tries < 30 && !accepted; tries++) {
      let h;
      const ngn = norm(hgn);
      if (ngn <= delta) h = hgn;
      else if (alpha * norm(g) >= delta) h = Float64Array.from(g, v => (-delta / norm(g)) * v);
      else {
        const a = Float64Array.from(g, v => -alpha * v), d = Float64Array.from(hgn, (v, k) => v - a[k]);
        const aa = norm(a) ** 2, dd = norm(d) ** 2, ad = a.reduce((s, v, k) => s + v * d[k], 0);
        const beta = (-ad + Math.sqrt(Math.max(0, ad * ad + dd * (delta * delta - aa)))) / Math.max(1e-300, dd);
        h = Float64Array.from(a, (v, k) => v + beta * d[k]);
      }
      const xn = Float64Array.from(x, (v, k) => v + h[k]);
      const rn = F.res(xn), fn = half2(rn);
      const Jh = matVec(J, m, n, h);
      const pred = f - half2(Float64Array.from(r, (v, i) => v + Jh[i]));
      const rho = pred > 0 ? (f - fn) / pred : -1;
      if (fn < f) { x = xn; r = rn; f = fn; accepted = true; }
      if (rho > 0.75) delta = Math.max(delta, 3 * norm(h));
      else if (rho < 0.25) delta = delta / 2;
      if (!accepted && delta < 1e-14 * (1 + norm(x))) break;
    }
    if (!accepted) break;
    // an inconsistent system converges to a non-zero least-squares minimum: stop when progress stalls
    if (fPrev - f < 1e-9 * fPrev && f > TOL_F * TOL_F) { if (++stall >= 3) break; } else stall = 0;
  }
  F.set(x);
  const residual = normInf(r);
  return { x, r, iters: it, converged: residual <= TOL_F * 10, residual };
}

export function levenbergMarquardt(F, x0, { maxIter = 200, tau = 1e-3 } = {}) {
  let x = Float64Array.from(x0), r = F.res(x), f = half2(r), it = 0;
  const { m, n } = F;
  if (!m) return { x, r, iters: 0, converged: true, residual: 0 };
  let J = F.jac(x), A = normal(J, m, n), g = matTVec(J, m, n, r);
  let mu = tau * Math.max(1e-12, ...Array.from({ length: n }, (_, k) => A[k * n + k])), nu = 2, stallLM = 0;
  for (; it < maxIter && normInf(r) > TOL_F; it++) {
    const h = cholSolve(A, n, Float64Array.from(g, v => -v), mu);
    if (!h) { mu *= nu; nu *= 2; continue; }
    if (norm(h) < 1e-15 * (norm(x) + 1e-15)) break;
    const xn = Float64Array.from(x, (v, k) => v + h[k]), rn = F.res(xn), fn = half2(rn);
    const pred = 0.5 * h.reduce((s, v, k) => s + v * (mu * v - g[k]), 0);
    const rho = pred > 0 ? (f - fn) / pred : -1;
    if (rho > 0) {
      const stalled = f - fn < 1e-9 * f && fn > TOL_F * TOL_F;
      x = xn; r = rn; f = fn;
      if (stalled && ++stallLM >= 3) break;
      if (!stalled) stallLM = 0;
      J = F.jac(x); A = normal(J, m, n); g = matTVec(J, m, n, r);
      mu *= Math.max(1 / 3, 1 - (2 * rho - 1) ** 3); nu = 2;
      if (normInf(g) < 1e-16) break;
    } else { mu *= nu; nu *= 2; if (mu > 1e20) break; }
  }
  F.set(x);
  const residual = normInf(r);
  return { x, r, iters: it, converged: residual <= TOL_F * 10, residual };
}
function normal(J, m, n) {
  const A = new Float64Array(n * n);
  for (let i = 0; i < m; i++) for (let a = 0; a < n; a++) { const ja = J[i * n + a]; if (ja) for (let b = 0; b < n; b++) A[a * n + b] += ja * J[i * n + b]; }
  return A;
}
export function newton(F, x0, { maxIter = 50 } = {}) {
  let x = Float64Array.from(x0), r = F.res(x), f = half2(r), it = 0;
  for (; it < maxIter && normInf(r) > TOL_F; it++) {
    const J = F.jac(x), h = factorJ(J, F.m, F.n).solve(Float64Array.from(r, v => -v));
    let t = 1, ok = false;
    for (let k = 0; k < 12; k++, t /= 2) {
      const xn = Float64Array.from(x, (v, j) => v + t * h[j]), rn = F.res(xn), fn = half2(rn);
      if (fn < f) { x = xn; r = rn; f = fn; ok = true; break; }
    }
    if (!ok) break;
  }
  F.set(x);
  const residual = normInf(r);
  return { x, r, iters: it, converged: residual <= TOL_F * 10, residual };
}
const RUN = { dogleg, lm: levenbergMarquardt, newton, bfgs: levenbergMarquardt };

// ── strategy slot: default | name | params | (cluster, ctx) => … ─────────────
export const solver = {
  dogleg: (params = {}) => Object.freeze({ kind: 'solver', method: 'dogleg', ...params }),
  lm: (params = {}) => Object.freeze({ kind: 'solver', method: 'lm', ...params }),
  newton: (params = {}) => Object.freeze({ kind: 'solver', method: 'newton', ...params }),
  bfgs: (params = {}) => Object.freeze({ kind: 'solver', method: 'lm', requested: 'bfgs', ...params }),
};
const DEFAULT = Object.freeze({ kind: 'solver', method: 'dogleg', fallback: 'lm', isDefault: true });
export function pickStrategy(slot, cluster) {
  const norm_ = s => {
    if (s == null) return DEFAULT;
    if (typeof s === 'string') { if (!RUN[s]) throw new Error(`unknown solver '${s}' (use ${METHODS.join(', ')})`); return { kind: 'solver', method: s }; }
    if (typeof s === 'object') return { ...DEFAULT, isDefault: false, fallback: s.fallback ?? (s.method ? null : 'lm'), ...s, method: s.method ?? 'dogleg' };
    return DEFAULT;
  };
  if (typeof slot === 'function') {
    const def = () => DEFAULT;
    const out = slot(cluster, { default: def, cluster });
    if (out === def) return DEFAULT;
    return norm_(out);
  }
  return norm_(slot);
}
function runStrategy(F, x0, strat) {
  const fn = RUN[strat.method] ?? dogleg;
  let out = fn(F, x0, strat);
  let used = strat.method, fellBack = false;
  if (!out.converged && strat.fallback && strat.fallback !== strat.method) {
    const alt = RUN[strat.fallback](F, out.residual < normInf(F.res(x0)) ? out.x : x0, strat);
    if (alt.converged || alt.residual < out.residual) { out = alt; used = strat.fallback; fellBack = true; }
  }
  F.set(out.x);   // the shared vector holds the kept result, not a rejected fallback's last point
  return { ...out, used, fellBack };
}

// ── clusters ──────────────────────────────────────────────────────────────────
export function clustersOf(sys, activeCons) {
  const parent = new Map();
  const find = a => { let r = a; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(a) !== r) { const n = parent.get(a); parent.set(a, r); a = n; } return r; };
  const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const unknown = [];
  sys.x.forEach((_, i) => { if (!sys.fixed[i]) { parent.set(i, i); unknown.push(i); } });
  for (const e of sys.entities.values()) {
    const ps = Object.values(e.p).filter(i => !sys.fixed[i]);
    for (let k = 1; k < ps.length; k++) unite(ps[0], ps[k]);
  }
  for (const c of activeCons) for (const e of c.eqs) for (let k = 1; k < e.vars.length; k++) unite(e.vars[0], e.vars[k]);
  const groups = new Map();
  for (const i of unknown) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  const list = [...groups.values()].sort((a, b) => a[0] - b[0]);
  const clusterOfParam = new Map();
  list.forEach((cols, k) => cols.forEach(c => clusterOfParam.set(c, k)));
  return list.map((cols, k) => {
    const cons = activeCons.filter(c => c.eqs.some(e => e.vars.length && clusterOfParam.get(e.vars[0]) === k));
    const ents = [...new Set(cols.map(c => sys.pent[c]))];
    const kinds = new Set(ents.map(id => sys.entities.get(id)?.kind));
    return { index: k, cols, cons, entities: ents, kinds, has: kind => kinds.has(kind), n: cols.length, m: cons.reduce((s, c) => s + c.eqs.length, 0) };
  });
}
const PRIORITY = { implicit: 0, helper: 1, user: 2 };
const byPriority = (a, b) => (PRIORITY[a.src] ?? 2) - (PRIORITY[b.src] ?? 2) || a.order - b.order;

function eqsOf(cons) { return cons.flatMap(c => c.eqs); }
function trySolve(sys, x0, cluster, cons, strat) {
  const eqs = eqsOf(cons), ref = tapedRef(eqs);
  if (ref) {
    const o = RS.tapeSolve(ref, Float64Array.from(x0), Uint32Array.from(cluster.cols), tidsOf(eqs), strat);
    if (o) return { ...o, X: Float64Array.from(o.X), x: Float64Array.from(cluster.cols, c => o.X[c]) };
  }
  const x = Float64Array.from(x0);
  const F = makeProblem(x, eqsOf(cons), cluster.cols);
  const out = runStrategy(F, F.get(), strat);
  return { ...out, X: x };
}

// solve one cluster: solution written into sys-level vector X; returns analysis
export function solveCluster(sys, X, cluster, strat, { analyse = true } = {}) {
  let cons = cluster.cons.filter(c => c.status !== 'conflict');
  const conflicts = [];
  let out = trySolve(sys, X, cluster, cons, strat);
  if (!out.converged && out.residual > FEASIBLE) {
    // a drawing in a singular position (a triangle drawn flat, an apex on its base) can leave every method stuck
    // where the Jacobian loses rank: start once more from a slightly moved drawing before calling it a conflict
    const Xp = Float64Array.from(X);
    let scale = 1; for (const c of cluster.cols) scale = Math.max(scale, Math.abs(X[c]));
    cluster.cols.forEach((c, k) => { Xp[c] += 1e-3 * scale * Math.sin(12.9898 * (k + 1) + 78.233); });
    const again = trySolve(sys, Xp, cluster, cons, strat);
    if (again.converged || again.residual <= FEASIBLE) out = again;
  }
  let rounds = 0;
  while (!out.converged && out.residual > FEASIBLE && rounds++ < 3) {
    const set = minimalConflict(sys, X, cluster, cons, strat, out.X);
    if (!set.length) break;
    conflicts.push(set.map(c => c.id));
    set.forEach(c => { c.status = 'conflict'; });
    const drop = set.reduce((a, b) => (b.order > a.order ? b : a));
    drop.dropped = true;
    cons = cons.filter(c => c !== drop);
    out = trySolve(sys, X, cluster, cons, strat);
  }
  for (const c of cluster.cols) X[c] = out.X[c];
  const res = { iters: out.iters, residual: out.residual, converged: out.converged || out.residual <= FEASIBLE, used: out.used, fellBack: out.fellBack, conflicts, activeCons: cons };
  if (analyse) Object.assign(res, analyseCluster(sys, X, cluster, cons));
  return res;
}

// deletion filter: the smallest set of (non-structural) constraints that is still infeasible.
// Large clusters first narrow the candidates to the linear dependency behind the inconsistency
// (the dependent rows at the least-squares point and the rows that span them); the rest is kept as hard.
function minimalConflict(sys, X0, cluster, cons, strat, lsX = null) {
  const t0 = performance.now();
  let solves = 0;
  const feasible = set => { solves++; const o = trySolve(sys, X0, cluster, set, { ...strat, maxIter: 60 }); return o.converged || o.residual <= FEASIBLE; };
  let hard = cons.filter(c => c.src === 'implicit'), cand = cons.filter(c => c.src !== 'implicit');
  if (cand.length > 10 && lsX) {
    const narrowed = dependencySupport(sys, lsX, cluster, cons);
    if (narrowed.length) {
      const set = new Set(narrowed);
      const c2 = cand.filter(c => set.has(c));
      if (c2.length && !feasible([...hard, ...cons.filter(c => c.src !== 'implicit' && !set.has(c)), ...c2])) {
        hard = [...hard, ...cons.filter(c => c.src !== 'implicit' && !set.has(c))];
        cand = c2;
      }
    }
  }
  if (!feasible(hard)) { hard = []; cand = cons.slice(); }
  let S = cand.slice().sort((a, b) => a.order - b.order);
  for (const c of S.slice()) {
    if (solves > 60 || performance.now() - t0 > 4000) break;   // budget: report what we have
    const rest = S.filter(s => s !== c);
    if (!feasible([...hard, ...rest])) S = rest;
  }
  return S;
}
function dependencySupport(sys, X, cluster, cons) {
  const ordered = cons.slice().sort(byPriority), n = cluster.cols.length;
  const F = makeProblem(Float64Array.from(X), eqsOf(ordered), cluster.cols);
  const xc = F.get(), J = F.jac(xc), r = F.res(xc);
  const rs = new RowSpace(n, 1e-8), rows = [], owner = [], out = new Set();
  let row = 0;
  for (const c of ordered) {
    const R = c.eqs.map((_, k) => J.subarray((row + k) * n, (row + k + 1) * n));
    const bad = c.eqs.some((_, k) => Math.abs(r[row + k]) > FEASIBLE);
    row += c.eqs.length;
    const added = rs.add(R);
    if (added < R.length && bad) {
      out.add(c);
      for (const v of R) {
        const coef = lsCoefficients(rows, v, n), mx = Math.max(1e-300, ...coef.map(Math.abs));
        coef.forEach((w, k) => { if (Math.abs(w) > 1e-6 * mx) out.add(owner[k]); });
      }
    }
    R.forEach(v => { rows.push(Float64Array.from(v)); owner.push(c); });
  }
  return [...out];
}

// rank, redundancy, free parameters at the solution
export function analyseCluster(sys, X, cluster, cons) {
  const cols = cluster.cols, n = cols.length;
  const ordered = cons.slice().sort(byPriority);
  const ref = tapedRef(eqsOf(ordered));
  if (ref) {
    const ents = cluster.entities.map(id => Object.values(sys.entities.get(id).p).map(i => cols.indexOf(i)).filter(k => k >= 0));
    const a = RS.tapeAnalyse(ref, X, Uint32Array.from(cols), tidsOf(eqsOf(ordered)), Uint32Array.from(ordered, c => c.eqs.length), ents);
    if (a) {
      const redundant = [], rowOwner = [];
      ordered.forEach((c, g) => {
        const { added, coef } = a.groups[g];
        if (added < c.eqs.length) {
          c.status = c.status === 'conflict' ? 'conflict' : 'redundant';
          c.partial = added > 0;
          if (added === 0 && coef) {
            const maxc = Math.max(1e-300, ...Array.from(coef, Math.abs));
            c.impliedBy = [...new Set(Array.from(coef, (v, k) => (Math.abs(v) > 1e-6 * maxc ? rowOwner[k] : null)).filter(Boolean))];
          }
          redundant.push(c.id);
        }
        c.eqs.forEach(() => rowOwner.push(c.id));
      });
      const dofFree = new Map(), entityDof = new Map();
      cols.forEach((c, k) => { if (a.free[k] > 1e-8) dofFree.set(c, true); });
      cluster.entities.forEach((id, k) => entityDof.set(id, a.entityDof[k]));
      return { rank: a.rank, dof: n - a.rank, redundant, dofFree, entityDof };
    }
  }
  const F = makeProblem(X, eqsOf(ordered), cols);
  const J = F.jac(F.get());
  const rs = new RowSpace(n, 1e-8);
  const redundant = [];
  let row = 0;
  const indepRows = [], rowOwner = [];
  for (const c of ordered) {
    const rows = c.eqs.map((_, k) => J.subarray((row + k) * n, (row + k + 1) * n));
    row += c.eqs.length;
    const added = rs.add(rows);
    if (added < rows.length) {
      c.status = c.status === 'conflict' ? 'conflict' : 'redundant';
      c.partial = added > 0;
      if (added === 0) {
        const coef = lsCoefficients(indepRows, rows[0], n);
        const maxc = Math.max(1e-300, ...coef.map(Math.abs));
        c.impliedBy = [...new Set(coef.map((v, k) => (Math.abs(v) > 1e-6 * maxc ? rowOwner[k] : null)).filter(Boolean))];
      }
      redundant.push(c.id);
    }
    rows.forEach(r => { indepRows.push(Float64Array.from(r)); rowOwner.push(c.id); });
  }
  const rank = rs.rank;
  // free parameters: diagonal of the null-space projector P = I − QᵀQ
  const free = new Float64Array(n).fill(1);
  for (const q of rs.basis) for (let k = 0; k < n; k++) free[k] -= q[k] * q[k];
  const dofFree = new Map(), entityDof = new Map();
  cols.forEach((c, k) => { if (free[k] > 1e-8) dofFree.set(c, true); });
  for (const id of cluster.entities) {
    const e = sys.entities.get(id);
    const S = Object.values(e.p).map(i => cols.indexOf(i)).filter(k => k >= 0);
    if (!S.length) { entityDof.set(id, 0); continue; }
    const s = S.length, P = new Float64Array(s * s);
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) {
      let v = a === b ? 1 : 0;
      for (const q of rs.basis) v -= q[S[a]] * q[S[b]];
      P[a * s + b] = v;
    }
    entityDof.set(id, qrcp(P, s, s, { tol: 1e-7 }).rank);
  }
  return { rank, dof: n - rank, redundant, dofFree, entityDof };
}

// ── whole-sketch solve ────────────────────────────────────────────────────────
export function solveSketch(sys, { slot = null, sketchId = sys.id } = {}) {
  sys.cons.forEach((c, i) => { c.order = i; });
  if (RS.enabled()) ensureTape(sys);
  const active = sys.cons.filter(c => c.status !== 'invalid' && !c.driven && c.eqs && c.eqs.length);
  const X = Float64Array.from(sys.x);
  const clusters = clustersOf(sys, active);
  const decisions = [], results = [];
  for (const cl of clusters) {
    const strat = pickStrategy(slot, cl);
    const t0 = performance.now();
    const r = solveCluster(sys, X, cl, strat);
    r.ms = performance.now() - t0;
    results.push(r);
    if (cl.m) decisions.push({
      at: `${sketchId}/cluster${cl.index}`, kind: 'solver', chose: r.used, alternatives: METHODS.filter(mm => mm !== r.used),
      reason: `${strat.isDefault ? 'default' : 'slot'}${r.fellBack ? `; ${strat.method} stalled, fell back to ${r.used}` : ''}; ${r.converged ? 'converged' : 'did not converge'} in ${r.iters} iteration${r.iters === 1 ? '' : 's'}, residual ${r.residual.toExponential(0)}`,
    });
  }
  return { X, clusters, results, decisions };
}

// ── drag: least-change motion of one point, warm-started, only its cluster ────
export function dragCluster(sys, X, cluster, cons, H, target, { maxIter = 40 } = {}) {
  const eqs = eqsOf(cons), cols = cluster.cols, n = cols.length;
  if (RS.enabled() && H.s && eqs.every(e => e.s)) {
    // a small tape of the cluster's equations plus the dragged point's two coordinates
    const ref = new RS.TapeRef(buildTape([...eqs.map(e => e.s), H.s[0], H.s[1]]));
    try {
      const m = eqs.length, o = RS.tapeDrag(ref, X, Uint32Array.from(cols), Uint32Array.from({ length: m }, (_, k) => k), m, m + 1, target, maxIter);
      if (o) { for (const c of cols) X[c] = o.X[c]; return { iterations: o.iterations, residual: o.residual, converged: o.converged }; }
    } finally { ref.free(); }
  }
  const F = makeProblem(X, eqs, cols);
  const colOf = new Map(cols.map((c, k) => [c, k]));
  let x = F.get(), it = 0;
  const dragJ = () => {
    const D = new Float64Array(2 * n);
    for (const v of H.vars) {
      const k = colOf.get(v); if (k == null) continue;
      const x0 = X[v], h = 1e-6 * Math.max(1, Math.abs(x0));
      X[v] = x0 + h; const p1 = H.get(X); X[v] = x0 - h; const p0 = H.get(X); X[v] = x0;
      D[k] = (p1[0] - p0[0]) / (2 * h); D[n + k] = (p1[1] - p0[1]) / (2 * h);
    }
    return D;
  };
  for (; it < maxIter; it++) {
    F.set(x);
    const r = F.res(x), J = eqs.length ? F.jac(x) : new Float64Array(0);
    const fac = factorJ(J, eqs.length, n);
    const h0 = fac.solve(Float64Array.from(r, v => -v));
    const p = H.get(X), e = [p[0] - target[0], p[1] - target[1]];
    const D = dragJ(), N = fac.nullBasis, k = N.length;
    let h = h0;
    if (k) {
      const M = new Float64Array(2 * k);
      for (let i = 0; i < 2; i++) for (let j = 0; j < k; j++) { let s = 0; for (let t = 0; t < n; t++) s += D[i * n + t] * N[j][t]; M[i * k + j] = s; }
      const Dh0 = [0, 1].map(i => { let s = 0; for (let t = 0; t < n; t++) s += D[i * n + t] * h0[t]; return s; });
      const rhs = [-(e[0] + Dh0[0]), -(e[1] + Dh0[1])];
      // least-change: the minimum-norm z with M z = rhs, z = Mᵀ (M Mᵀ)⁺ rhs. M Mᵀ is 2 × 2, so its pseudo-inverse is
      // exact (rank 2: the inverse; rank 1: G / tr²; rank 0: nothing moves); normal equations MᵀM (k × k, rank ≤ 2)
      // needed a damping term that let the step drift along directions the target does not determine
      const g00 = M.slice(0, k).reduce((s, v) => s + v * v, 0), g11 = M.slice(k).reduce((s, v) => s + v * v, 0);
      let g01 = 0; for (let j = 0; j < k; j++) g01 += M[j] * M[k + j];
      const tr = g00 + g11, det = g00 * g11 - g01 * g01;
      let w = [0, 0];
      if (tr > 1e-24 && det > 1e-12 * tr * tr) w = [(g11 * rhs[0] - g01 * rhs[1]) / det, (g00 * rhs[1] - g01 * rhs[0]) / det];
      else if (tr > 1e-24) w = [(g00 * rhs[0] + g01 * rhs[1]) / (tr * tr), (g01 * rhs[0] + g11 * rhs[1]) / (tr * tr)];
      const z = new Float64Array(k);
      for (let j = 0; j < k; j++) z[j] = M[j] * w[0] + M[k + j] * w[1];
      h = Float64Array.from(h0);
      for (let j = 0; j < k; j++) if (z[j]) for (let t = 0; t < n; t++) h[t] += z[j] * N[j][t];
    }
    const step = norm(h), cap = Math.max(5, 2 * Math.hypot(e[0], e[1]));
    if (step > cap) for (let t = 0; t < n; t++) h[t] *= cap / step;
    x = Float64Array.from(x, (v, t) => v + h[t]);
    if (step < 1e-11 * (1 + norm(x))) break;
  }
  F.set(x);
  const fin = dogleg(F, x, { maxIter: 50 });
  for (let t = 0; t < n; t++) X[cols[t]] = fin.x[t];
  return { iterations: it, residual: fin.residual, converged: fin.converged || fin.residual <= FEASIBLE };
}
