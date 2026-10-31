import { sketch, c, SV, LA, problem } from './core.mjs';
const sk = sketch('outline').polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'),
    c.vertical('p.4'), c.horizontal('p.5'), c.vertical('p.6'), c.parallel('p.1', 'p.3'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8);
const { sys, cls } = problem(sk);
const cl = cls[0];
const PR = { implicit: 0, helper: 1, user: 2 };
const ordered = cl.cons.slice().sort((a, b) => (PR[a.src] - PR[b.src]) || a.order - b.order);
console.log(ordered.map(k => `${k.id}[${k.src}]`).join(' '));
const F = SV.makeProblem(Float64Array.from(sys.x), ordered.flatMap(k => k.eqs), cl.cols);
const J = F.jac(F.get()), n = F.n;
const rows = [], owner = [];
const rs = new LA.RowSpace(n, 1e-8);
let row = 0;
for (const k of ordered) {
  const R = k.eqs.map((_, i) => J.subarray((row + i) * n, (row + i + 1) * n));
  row += k.eqs.length;
  const added = rs.add(R);
  if (added < R.length) {
    const coef = LA.lsCoefficients(rows, R[0], n);
    const mx = Math.max(...coef.map(Math.abs));
    console.log('dependent:', k.id, 'rank so far', rs.rank);
    coef.forEach((w, i) => { if (Math.abs(w) > 1e-6 * mx) console.log('   ', owner[i], w.toFixed(6), (1 / w).toFixed(4)); });
    // residual of the reconstruction
    const rec = new Float64Array(n); coef.forEach((w, i) => rows[i].forEach((v, t) => rec[t] += w * v));
    console.log('   reconstruction error', LA.norm(Float64Array.from(rec, (v, t) => v - R[0][t])).toExponential(2));
    const nz = []; R[0].forEach((v, t) => { if (Math.abs(v) > 1e-9) nz.push(`${sys.pname[cl.cols[t]]}:${v.toFixed(6)}`); });
    console.log('   row', nz.join(' '));
  }
  R.forEach(v => { rows.push(Float64Array.from(v)); owner.push(k.id); });
}
console.log('rank', rs.rank, 'n', n);
