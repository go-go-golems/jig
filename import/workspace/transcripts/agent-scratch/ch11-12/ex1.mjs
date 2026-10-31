import { sketch, c, analyse, rowsOf, fmt } from './h.mjs';
const sk = sketch('L')
  .line('l1', [0, 0], [40, 0])
  .line('l2', 'l1.end', [40, 30])
  .constrain(c.fix('l1.start'), c.horizontal('l1'), c.perpendicular('l1', 'l2'))
  .dim('l1', 40).dim('l2', 30);
const A = analyse(sk);
console.log(A.solved.ir());
for (const cl of A.clusters) {
  console.log(cl.names.join(' '), 'm', cl.m, 'n', cl.n, 'rank', cl.rank, 'dof', cl.dof);
  rowsOf(cl.J, cl.m, cl.n).forEach((r, i) => console.log(cl.rows[i].padEnd(28), r.map(fmt).join('\t')));
  // hand matrix
  const H = [
    [0,0,-1,0,1,0,0,0],[0,0,0,-1,0,1,0,0],[1,0,0,0,0,0,0,0],[0,1,0,0,0,0,0,0],[0,-1,0,1,0,0,0,0],
    [0,-1/40,0,1/40,-1/30,0,1/30,0],[-1,0,1,0,0,0,0,0],[0,0,0,0,0,-1,0,1]];
}
const cl = A.clusters[0];
const H = [
    [0,0,-1,0,1,0,0,0],[0,0,0,-1,0,1,0,0],[1,0,0,0,0,0,0,0],[0,1,0,0,0,0,0,0],[0,-1,0,1,0,0,0,0],
    [0,-1/40,0,1/40,-1/30,0,1/30,0],[-1,0,1,0,0,0,0,0],[0,0,0,0,0,-1,0,1]];
let mx = 0; rowsOf(cl.J, 8, 8).forEach((r, i) => r.forEach((v, k) => { mx = Math.max(mx, Math.abs(v - H[i][k])); }));
console.log('max |FD - hand| =', mx);
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/ch11-12/ex1J.json', JSON.stringify(rowsOf(cl.J, 8, 8)));
