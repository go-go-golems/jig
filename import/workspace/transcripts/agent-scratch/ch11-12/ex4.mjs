import { sketch, c, deg, analyse, rowsOf } from './h.mjs';
// a triangle with three angle constraints (30, 60, 90): third is redundant; then the same far from the origin
const tri = (ox, oy, s = 1, angs = [30, 60, 90]) => sketch('tri')
  .polyline('t', [[ox, oy], [ox + 40 * s, oy], [ox + 40 * s, oy + 23.094 * s]], { closed: true })
  .constrain(
    c.angle('t.1', 't.2', deg(180 - angs[2])),
    c.angle('t.2', 't.3', deg(180 - angs[0])),
    c.angle('t.3', 't.1', deg(180 - angs[1])));
for (const [ox, s] of [[0, 1], [1000, 1], [5000, 0.1], [20000, 0.1], [100000, 0.05]]) {
  const A = analyse(tri(ox, ox, s));
  const S = A.solved;
  console.log(`origin ${ox}, scale ${s}:`, S.ir().split('\n')[3].trim(), '|', S.diagnostics.map(d => d.kind + ': ' + d.message).join(' | '));
}
