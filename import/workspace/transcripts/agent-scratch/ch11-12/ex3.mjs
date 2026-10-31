import { sketch, c, analyse, rowsOf, SV, LA, CN } from './h.mjs';
const sk = sketch('t')
  .line('l', [0, 0], [20, 0])
  .arc('a', { center: [20, 10], start: 'l.end', end: [30, 10] })
  .constrain(c.fix('l'), c.tangent('l', 'a'))
  .dim('a', 10);
const A = analyse(sk);
console.log(A.solved.ir());
const sys = A.sys, X = A.X;
const cl = A.clusters[0];
const svd = async () => {};
const rankOf = (J, m, n) => { const rs = new LA.RowSpace(n, 1e-8); rs.add(rowsOf(J, m, n)); return rs.rank; };
// replace the tangent equation by the distance form (no 'shared' option)
const rec = sys.cons.find(r => r.type === 'tangent');
console.log('opts', rec.opts);
const alt = CN.equations('tangent', rec.hs, null, sys.x0, {});
const eqsAngle = A.solved.run.results[0].activeCons.flatMap(c2 => c2.eqs);
const eqsDist = A.solved.run.results[0].activeCons.flatMap(c2 => c2 === rec ? alt : c2.eqs);
for (const [nm, eqs] of [['angle form', eqsAngle], ['distance form', eqsDist]]) {
  const F = SV.makeProblem(Float64Array.from(X), eqs, cl.cols);
  const J = F.jac(F.get()), r = F.res(F.get());
  const rows = rowsOf(J, eqs.length, cl.n);
  console.log(nm, 'rank', rankOf(J, eqs.length, cl.n), 'n', cl.n, 'res', Math.max(...r.map(Math.abs)));
  console.log('  cols', cl.names.join(' '));
  console.log('  tangent row', rows[rows.length - 2].map(v => +v.toFixed(6)).join(' '), '|', rows[rows.length-1].map(v => +v.toFixed(6)).join(' '));
}
