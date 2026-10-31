import { sketch, c, SV, LA, problem, traced, ninf } from './core.mjs';
const apex = JSON.parse(process.argv[2] ?? '[30,0.001]');
const which = process.argv[3] ?? 'dogleg';
const sk = sketch('tri').polyline('t', [[0, 0], [60, 0], apex], { closed: true })
  .constrain(c.fix('t.1')).dim('t.2', 35).dim('t.3', 40);
const { sys, cls } = problem(sk);
const cl = cls[0], eqs = cl.cons.flatMap(k => k.eqs);
const names = cl.cols.map(i => sys.pname[i]);
const ax = names.indexOf('t.2.bx'), ay = names.indexOf('t.2.by');
const X = Float64Array.from(sys.x);
const F = SV.makeProblem(X, eqs, cl.cols);
const { F: G, xs } = traced(F);
const fn = { dogleg: SV.dogleg, newton: SV.newton, lm: SV.levenbergMarquardt }[which];
const o = fn(G, F.get(), {});
xs.push(o.x);
let prev = null;
for (const [k, x] of xs.entries()) {
  const r = F.res(x);
  const f = r.reduce((s, v) => s + v * v, 0) / 2;
  const st = prev ? LA.norm(Float64Array.from(x, (v, i) => v - prev[i])) : 0;
  // Gauss–Newton step norm at x
  const J = F.jac(x); const fac = LA.factorJ(J, F.m, F.n); const h = fac.solve(Float64Array.from(r, v => -v));
  console.log(k, x[ax].toFixed(6), x[ay].toFixed(6), 'res', ninf(r).toExponential(2), 'f', f.toExponential(2), 'step', st.toFixed(4), '|h_gn|', LA.norm(h).toExponential(2));
  prev = x;
}
console.log(o);
