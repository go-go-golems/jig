import { sketch, c, analyse, rowsOf } from './h.mjs';
import { writeFileSync } from 'node:fs';
const out = [];
for (const eps of [1, 1e-2, 1e-4, 1e-6, 1e-8, 1e-10, 1e-12, 0]) {
  const L = 70 - eps;
  const x = (L * L + 900 - 1600) / (2 * L), y = Math.sqrt(Math.max(0, 900 - x * x));
  const sk = sketch('flat').polyline('t', [[0, 0], [x, y], [L, 0]], { closed: true })
    .constrain(c.fix('t.1.start'), c.horizontal('t.3'))
    .dim('t.1', 30).dim('t.2', 40).dim('t.3', L);
  const A = analyse(sk), S = A.solved, cl = A.clusters[0];
  const Jfull = rowsOf(cl.J, cl.m, cl.n);
  out.push({ eps, y, J: Jfull });
  console.log(`eps ${eps.toExponential(0)}  apex height ${y.toExponential(3)}  ${S.ir().split('\n')[3].trim()}  iters ${S.run.results[0].iters}  B=(${S.point('t.1.end').map(v => v.toPrecision(8))})`);
}
writeFileSync('/tmp/ch11-12/ex8.json', JSON.stringify(out));
