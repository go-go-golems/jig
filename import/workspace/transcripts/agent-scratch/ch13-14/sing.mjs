import { sketch, c, SV, problem, traced, ninf } from './core.mjs';
const sk = sketch('tri').polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(c.fix('t.1')).dim('t.2', 35).dim('t.3', 25);
const { sys, cls } = problem(sk);
const cl = cls[0], eqs = cl.cons.flatMap(k => k.eqs);
const F = SV.makeProblem(Float64Array.from(sys.x), eqs, cl.cols);
const { F: G, xs } = traced(F);
const o = SV.dogleg(G, F.get(), {});
xs.push(o.x);
const P = (x, n) => x[cl.cols.findIndex(i => sys.pname[i] === n)];
let py = null;
for (const [k, x] of xs.entries()) { const y = P(x, 't.2.by'); console.log(k, P(x, 't.2.bx').toFixed(6), y.toExponential(3), ninf(F.res(x)).toExponential(2), py ? (y / py).toFixed(3) : ''); py = y; }
