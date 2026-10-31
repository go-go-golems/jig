import { sketch, c, SV, problem } from './core.mjs';
const sk = sketch('tri').polyline('t', [[0, 0], [60, 0], [30, 30]], { closed: true })
  .constrain(c.fix('t.1')).dim('t.2', 35).dim('t.3', 40);
const { sys, cls } = problem(sk);
const cl = cls[0], eqs = cl.cons.flatMap(k => k.eqs);
const names = cl.cols.map(i => sys.pname[i]);
const ix = ['t.2.bx', 't.3.ax'].map(n => names.indexOf(n)), iy = ['t.2.by', 't.3.ay'].map(n => names.indexOf(n));
const methods = { newton: SV.newton, dogleg: SV.dogleg, lm: SV.levenbergMarquardt,
  default: (F, x0) => { const o = SV.dogleg(F, x0); if (o.converged) return o; const a = SV.levenbergMarquardt(F, o.residual < Math.max(...Array.from(F.res(x0), Math.abs)) ? o.x : x0); return a.converged || a.residual < o.residual ? { ...a, fb: true } : o; } };
const stats = {};
const step = +(process.argv[2] ?? 2);
let N = 0;
const rows = [];
for (let y = 60; y >= -60; y -= step) {
  if (Math.abs(y) < 1e-12) continue;
  let row = '';
  for (let x = -40; x <= 100; x += step) {
    N++;
    for (const [m, fn] of Object.entries(methods)) {
      const X = Float64Array.from(sys.x);
      const F = SV.makeProblem(X, eqs, cl.cols);
      const x0 = F.get();
      for (const k of ix) x0[k] = x; for (const k of iy) x0[k] = y;
      const o = fn(F, x0, {});
      const s = stats[m] ??= { same: 0, opp: 0, fail: 0, iters: 0, n: 0, maxIt: 0 };
      let tag;
      if (!o.converged) { s.fail++; tag = '.'; }
      else { const yy = o.x[iy[0]]; if (Math.sign(yy) === Math.sign(y)) { s.same++; tag = '+'; } else { s.opp++; tag = 'x'; } s.iters += o.iters; s.n++; s.maxIt = Math.max(s.maxIt, o.iters); }
      if (m === (process.argv[3] ?? 'newton')) row += tag;
    }
  }
  rows.push(row);
}
console.log('starts', N);
for (const [m, s] of Object.entries(stats)) console.log(m, s, 'mean iters', (s.iters / s.n).toFixed(2));
if (process.argv[4]) console.log(rows.join('\n'));
