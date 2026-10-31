import { sketch, c, SV, problem, traced, ninf } from './core.mjs';
const apex = process.argv[2] ? JSON.parse(process.argv[2]) : [30, 30];
const sk = sketch('tri').polyline('t', [[0, 0], [60, 0], apex], { closed: true })
  .constrain(c.fix('t.1')).dim('t.2', 35).dim('t.3', 40);
const { sys, cls } = problem(sk);
console.log('clusters', cls.length, cls.map(k => [k.n, k.m]));
const cl = cls[0];
const eqs = cl.cons.flatMap(k => k.eqs);
for (const [name, fn] of [['newton', SV.newton], ['dogleg', SV.dogleg], ['lm', SV.levenbergMarquardt]]) {
  const X = Float64Array.from(sys.x);
  const F = SV.makeProblem(X, eqs, cl.cols);
  const { F: G, xs } = traced(F);
  const out = fn(G, F.get(), {});
  const apexIdx = cl.cols.map(i => sys.pname[i]);
  const ax = apexIdx.indexOf('t.2.bx'), ay = apexIdx.indexOf('t.2.by');
  console.log(name, 'iters', out.iters, 'converged', out.converged, 'res', out.residual.toExponential(2),
    'apex', out.x[ax].toFixed(6), out.x[ay].toFixed(6));
  xs.push(out.x);
  for (const [k, x] of xs.entries()) {
    const r = F.res(x);
    console.log('  ', k, x[ax].toFixed(10), x[ay].toFixed(10), ninf(r).toExponential(3));
  }
}
