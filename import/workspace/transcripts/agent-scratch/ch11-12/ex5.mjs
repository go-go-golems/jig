import { sketch, c, deg, analyse, rowsOf } from './h.mjs';
const sq = (o, w) => sketch('sq')
  .polyline('p', [[o, o], [o + w, o], [o + w, o + w], [o, o + w]], { closed: true })
  .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'), c.vertical('p.4'),
    c.parallel('p.1', 'p.3'))
  .dim('p.1', w).dim('p.2', w);
for (const [o, w] of [[0, 20], [1000, 20], [1000, 2], [10000, 2], [100000, 2], [100000, 0.5], [1e6, 1]]) {
  const S = analyse(sq(o, w)).solved;
  console.log(`corner ${o}, side ${w}:`, S.ir().split('\n')[3].trim(), '|', S.diagnostics.map(d => d.kind).join(', '));
}
