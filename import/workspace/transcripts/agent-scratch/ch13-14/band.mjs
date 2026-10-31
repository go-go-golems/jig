import { sketch, c, SV, problem } from './core.mjs';
const sk = sketch('tri').polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(c.fix('t.1')).dim('t.2', 35).dim('t.3', 40);
const { sys, cls } = problem(sk);
const cl = cls[0], eqs = cl.cons.flatMap(k => k.eqs);
const names = cl.cols.map(i => sys.pname[i]);
const ix = ['t.2.bx', 't.3.ax'].map(n => names.indexOf(n)), iy = ['t.2.by', 't.3.ay'].map(n => names.indexOf(n));
const x = +(process.argv[2] ?? 30);
for (const y of [1, 0.3, 0.1, 0.03, 0.01, 3e-3, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-12]) {
  const out = [];
  for (const [m, fn] of [['newton', SV.newton], ['dogleg', SV.dogleg], ['lm', SV.levenbergMarquardt]]) {
    const X = Float64Array.from(sys.x);
    const F = SV.makeProblem(X, eqs, cl.cols);
    const x0 = F.get();
    for (const k of ix) x0[k] = x; for (const k of iy) x0[k] = y;
    const o = fn(F, x0, {});
    out.push(`${m} ${o.converged ? o.iters : 'fail(' + o.iters + ')'}`);
  }
  console.log(y, out.join('  '));
}
