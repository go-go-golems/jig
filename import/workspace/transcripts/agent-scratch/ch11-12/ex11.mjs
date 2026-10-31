import { sketch, c, deg, analyse } from './h.mjs';
const line3 = (s) => s.solve({});
const P = sketch('par').line('a', [0, 0], [30, 2]).line('b', [0, 10], [30, 12]).line('c', [0, 20], [30, 21])
  .constrain(c.parallel('a', 'b'), c.parallel('b', 'c'), c.parallel('a', 'c')).solve({});
console.log(P.ir().split('\n')[3], P.diagnostics.map(d => d.message).join(' | '));
const sq = (diags) => {
  let s = sketch('sq').polyline('r', [[0, 0], [40, 0], [40, 30], [0, 30]], { closed: true });
  if (diags > 0) s = s.line('d1', 'r.1.start', 'r.2.end');
  if (diags > 1) s = s.line('d2', 'r.1.end', 'r.3.end');
  s = s.dim('r.1', 40).dim('r.2', 30).dim('r.3', 40).dim('r.4', 30);
  if (diags > 0) s = s.dim('d1', 50);
  if (diags > 1) s = s.dim('d2', 50);
  return s.solve({});
};
for (const k of [0, 1, 2]) { const S = sq(k); console.log(`square + ${k} diagonals:`, S.ir().split('\n')[3].trim(), '|', S.ir().split('\n')[1].trim().replace(/.*Σ/, 'n ='), '|', S.diagnostics.map(d => d.kind + ' ' + d.message).join(' | ')); }
