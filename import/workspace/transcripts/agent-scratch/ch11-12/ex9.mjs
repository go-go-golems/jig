import { sketch, c, analyse } from './h.mjs';
for (const [L, by] of [[69.99, 0], [69.99, 0.001], [69.99, -0.001], [70.01, 0], [69, 0], [60, 0]]) {
  const sk = sketch('flat').polyline('t', [[0, 0], [30, by], [70, 0]], { closed: true })
    .constrain(c.fix('t.1.start'), c.horizontal('t.3'))
    .dim('t.1', 30).dim('t.2', 40).dim('t.3', L);
  const S = sk.solve({});
  const r = S.run.results[0];
  console.log(`L ${L} drawn B.y ${by}: ${S.ir().split('\n')[3].trim()} · ${r.used} ${r.iters} it · res ${r.residual.toExponential(1)} · B=(${S.point('t.1.end').map(v => +v.toFixed(6))})`);
  for (const d of S.diagnostics) console.log('    ', d.kind, d.message, d.fix ?? '');
}
