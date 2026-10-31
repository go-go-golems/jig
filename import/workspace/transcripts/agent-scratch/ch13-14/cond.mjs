import { sketch, c, SV, problem } from './core.mjs';
const out = [];
for (const eps of [1, 0.1, 0.01, 0.001, 0]) {
  const sk = sketch('tri').polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
    .constrain(c.fix('t.1')).dim('t.2', 35).dim('t.3', 25 + eps);
  const { sys, cls } = problem(sk);
  const cl = cls[0], eqs = cl.cons.flatMap(k => k.eqs);
  const F = SV.makeProblem(Float64Array.from(sys.x), eqs, cl.cols);
  const o = SV.dogleg(F, F.get(), {});
  const J = F.jac(o.x);
  const P = n => o.x[cl.cols.findIndex(i => sys.pname[i] === n)];
  out.push({ eps, iters: o.iters, res: o.residual, x: P('t.2.bx'), y: P('t.2.by'), m: F.m, n: F.n, J: Array.from(J) });
}
console.log(JSON.stringify(out));
