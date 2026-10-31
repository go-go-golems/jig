import { sketch, c, analyse, rowsOf, fmt } from './h.mjs';
for (const [name, cons, at] of [
  ['coincident', c.coincident('b', 'a'), [10, 5]],
  ['distance0', c.distance('b', 'a', 0), [10, 5]],
  ['distance0-exact', c.distance('b', 'a', 0), [0, 0]],
  ['coincident-exact', c.coincident('b', 'a'), [0, 0]],
]) {
  const sk = sketch('t').point('a', [0, 0]).point('b', at).constrain(c.fix('a'), cons);
  const A = analyse(sk);
  const s = A.solved;
  console.log('==', name); console.log(s.ir().split('\n').slice(0, 4).join('\n'));
  console.log('  b =', s.point('b'), 'iters', s.run.results.map(r => r.iters), 'res', s.run.results.map(r => r.residual));
  for (const cl of A.clusters) rowsOf(cl.J, cl.m, cl.n).forEach((r, i) => console.log('  ', cl.rows[i].padEnd(22), r.map(v => v.toExponential(3)).join('\t')));
  console.log('  diags', s.diagnostics.map(d => d.kind + ': ' + d.message + (d.fix ? ' · ' + d.fix : '')));
}
