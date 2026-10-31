import { sketch, c, SV, LA, problem, traced, ninf } from './core.mjs';
const sk = sketch('outline').polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'),
    c.vertical('p.4'), c.horizontal('p.5'), c.vertical('p.6'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8).dim('p.3', 50);
const { sys, cls } = problem(sk);
const cl = cls[0], cons = cl.cons, eqs = cons.flatMap(k => k.eqs);
const owner = cons.flatMap(k => k.eqs.map(() => k.id));
for (const [name, fn] of [['dogleg', SV.dogleg], ['lm', SV.levenbergMarquardt], ['newton', SV.newton]]) {
  const F = SV.makeProblem(Float64Array.from(sys.x), eqs, cl.cols);
  const { F: G, xs } = traced(F);
  const o = fn(G, F.get(), {});
  const r = F.res(o.x);
  const f = r.reduce((s, v) => s + v * v, 0) / 2;
  console.log(name, 'iters', o.iters, 'res∞', o.residual.toExponential(4), '‖r‖2', Math.sqrt(2 * f).toFixed(6), 'f', f.toFixed(6));
  const nz = []; r.forEach((v, i) => { if (Math.abs(v) > 1e-6) nz.push(`${owner[i]}:${v.toFixed(4)}`); });
  console.log('   residuals', nz.join('  '));
  const J = F.jac(o.x); const g = new Float64Array(F.n); for (let i = 0; i < F.m; i++) for (let k = 0; k < F.n; k++) g[k] += J[i * F.n + k] * r[i];
  console.log('   ‖Jᵀr‖∞', ninf(g).toExponential(2));
  console.log('   per-iter res∞', xs.map(x => ninf(F.res(x)).toExponential(2)).join(' '));
  const pts = ['p.3.ax', 'p.3.bx', 'p.1.bx', 'p.5.bx', 'p.5.ax'].map(n => `${n}=${o.x[cl.cols.findIndex(i => sys.pname[i] === n)].toFixed(4)}`);
  console.log('   ', pts.join(' '));
}
