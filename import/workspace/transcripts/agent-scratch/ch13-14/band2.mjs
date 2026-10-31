import { sketch, c, SV, problem } from './core.mjs';
const sk = sketch('tri').polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(c.fix('t.1')).dim('t.2', 35).dim('t.3', 40);
const { sys, cls } = problem(sk);
const cl = cls[0], eqs = cl.cons.flatMap(k => k.eqs);
const names = cl.cols.map(i => sys.pname[i]);
const ix = ['t.2.bx', 't.3.ax'].map(n => names.indexOf(n)), iy = ['t.2.by', 't.3.ay'].map(n => names.indexOf(n));
for (const y of [0.009, 0.008, 0.007, 0.006, 0.005, 0.004]) {
  const F = SV.makeProblem(Float64Array.from(sys.x), eqs, cl.cols); const x0 = F.get();
  for (const k of ix) x0[k] = 30; for (const k of iy) x0[k] = y;
  const o = SV.newton(F, x0, {}); console.log(y, o.converged, o.iters);
}
