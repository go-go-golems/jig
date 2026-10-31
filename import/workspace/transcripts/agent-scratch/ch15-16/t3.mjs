import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const S = await import('/home/claude/jigcad/src/engine/sketch/index.js');
const L = await import('/home/claude/jigcad/src/engine/sketch/linalg.js');
const SV = await import('/home/claude/jigcad/src/engine/sketch/solver.js');
const { sketch, c } = S;
const sk = sketch('outline').polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'), c.vertical('p.4'), c.horizontal('p.5'), c.vertical('p.6'))
  .dim('p.1', 60);
const sol = sk.solve();
const sys = sol.sys;
const cl = sol.run.clusters[0], r0 = sol.run.results[0];
const cons = r0.activeCons;
const F = SV.makeProblem(Float64Array.from(sol.X), cons.flatMap(c => c.eqs), cl.cols);
const x = F.get();
const J = F.jac(x);
const fac = L.factorJ(J, F.m, F.n);
console.log('rank', fac.rank, 'n', F.n, 'm', F.m);
const N = fac.nullBasis;
const names = cl.cols.map(i => sys.pname[i]);
for (const v of N) console.log(Array.from(v).map((a, k) => Math.abs(a) > 1e-9 ? `${names[k]}:${a.toFixed(4)}` : '').filter(Boolean).join(' '));
const H = sys.handle('p.4.end');
const d1 = sol.drag('p.4.end', [14, 46]);
console.log(d1.X.filter((v,i)=>true).map((v,i)=>`${sys.pname[i]}=${v}`).join('\n'));
console.log([...d1.X].map((v,i)=>`${sys.pname[i]}=${v}`).join(' '));
// replicate dragCluster step 0
{
  const X = Float64Array.from(sol.X);
  const F2 = SV.makeProblem(X, cons.flatMap(c => c.eqs), cl.cols);
  const n = cl.cols.length, colOf = new Map(cl.cols.map((c, k) => [c, k]));
  let x = F2.get();
  for (let it = 0; it < 3; it++) {
    F2.set(x);
    const r = F2.res(x), J = F2.jac(x), fac = L.factorJ(J, F2.m, n);
    const h0 = fac.solve(Float64Array.from(r, v => -v));
    const p = H.get(X), e = [p[0] - 14, p[1] - 46];
    const D = new Float64Array(2 * n);
    for (const v of H.vars) { const k = colOf.get(v); const x0 = X[v], hh = 1e-6 * Math.max(1, Math.abs(x0)); X[v] = x0 + hh; const p1 = H.get(X); X[v] = x0 - hh; const p0 = H.get(X); X[v] = x0; D[k] = (p1[0] - p0[0]) / (2 * hh); D[n + k] = (p1[1] - p0[1]) / (2 * hh); }
    const N = fac.nullBasis, k = N.length;
    const M = new Float64Array(2 * k);
    for (let i = 0; i < 2; i++) for (let j = 0; j < k; j++) { let s = 0; for (let t = 0; t < n; t++) s += D[i * n + t] * N[j][t]; M[i * k + j] = s; }
    console.log('it', it, 'res', L.normInf(r), 'e', e, 'M', [...M].map(v=>v.toFixed(6)), 'D nz', [...D].map((v,i)=>v?`${i}:${v}`:'').filter(Boolean));
    const Dh0 = [0, 1].map(i => { let s = 0; for (let t = 0; t < n; t++) s += D[i * n + t] * h0[t]; return s; });
    const rhs = [-(e[0] + Dh0[0]), -(e[1] + Dh0[1])];
    const MtM = new Float64Array(k * k), Mtr = new Float64Array(k); let tr = 0;
    for (let a = 0; a < k; a++) { for (let b = 0; b < k; b++) MtM[a * k + b] = M[a] * M[b] + M[k + a] * M[k + b]; Mtr[a] = M[a] * rhs[0] + M[k + a] * rhs[1]; tr += MtM[a * k + a]; }
    const z = L.cholSolve(MtM, k, Mtr, 1e-12 * Math.max(1, tr));
    console.log('z', z, 'tr', tr);
    let h = Float64Array.from(h0);
    for (let j = 0; j < k; j++) for (let t = 0; t < n; t++) h[t] += z[j] * N[j][t];
    const step = L.norm(h), cap = Math.max(5, 2 * Math.hypot(e[0], e[1]));
    console.log('step', step, 'cap', cap, 'h', [...h].map((v,i)=>Math.abs(v)>1e-9?`${sys.pname[cl.cols[i]]}:${v.toFixed(6)}`:'').filter(Boolean).join(' '));
    if (step > cap) for (let t = 0; t < n; t++) h[t] *= cap / step;
    x = Float64Array.from(x, (v, t) => v + h[t]);
  }
}
