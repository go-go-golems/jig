import { sketch, c, SV, LA, problem, ninf } from './core.mjs';
const sk = sketch('tri').polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(c.fix('t.1')).dim('t.2', 20).dim('t.3', 30);
const { sys, cls } = problem(sk);
const cl = cls[0], cons = cl.cons, eqs = cons.flatMap(k => k.eqs);
const owner = cons.flatMap(k => k.eqs.map((_, i) => k.id + (k.eqs.length > 1 ? '#' + i : '')));
for (const [name, fn] of [['dogleg', SV.dogleg], ['lm', SV.levenbergMarquardt]]) {
  const F = SV.makeProblem(Float64Array.from(sys.x), eqs, cl.cols);
  const o = fn(F, F.get(), {});
  const r = F.res(o.x), J = F.jac(o.x);
  const g = new Float64Array(F.n); for (let i = 0; i < F.m; i++) for (let k = 0; k < F.n; k++) g[k] += J[i * F.n + k] * r[i];
  const rank = LA.factorJ(J, F.m, F.n).rank;
  console.log(name, 'iters', o.iters, 'res∞', o.residual.toFixed(5), '‖r‖', LA.norm(r).toFixed(5), '‖Jᵀr‖∞', ninf(g).toExponential(2), 'rank', rank);
  const nz = []; r.forEach((v, i) => { if (Math.abs(v) > 1e-6) nz.push(`${owner[i]}:${v.toFixed(4)}`); });
  console.log('   ', nz.join('  '));
  const P = n => o.x[cl.cols.findIndex(i => sys.pname[i] === n)].toFixed(4);
  console.log('    apex', P('t.2.bx'), P('t.2.by'), 'base end', P('t.1.bx'), P('t.1.by'), 'base start', P('t.1.ax'));
}
