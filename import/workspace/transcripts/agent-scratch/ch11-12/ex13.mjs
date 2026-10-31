import { sketch, c, analyse, rowsOf } from './h.mjs';
const A = analyse(sketch('L').line('l1', [0, 0], [40, 0]).line('l2', 'l1.end', [40, 30])
  .constrain(c.fix('l1.start'), c.horizontal('l1'), c.perpendicular('l1', 'l2')).dim('l2', 30));
const cl = A.clusters[0];
const d = [0, 0, 1, 0, 1, 0, 1, 0];
console.log(cl.names.join(' '));
console.log('J·d per row:', rowsOf(cl.J, cl.m, cl.n).map(r => r.reduce((s, v, k) => s + v * d[k], 0).toExponential(1)).join(' '));
