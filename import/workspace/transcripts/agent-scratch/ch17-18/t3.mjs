import { compile } from './base.mjs';
const code = `const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })`;
const r = await compile(code);
for (const L of ['L0','L1','L2','L3','L4','L5','L6']) { console.log('=====', L); console.log(String(r.program.ir[L]).slice(0, 1800)); }
