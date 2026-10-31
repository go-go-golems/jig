import { build, tally, K, oc } from './base.mjs';
const head = `const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
`;
for (const expr of ['cube', 'ball', 'rod', 'rods', 'cube.intersect(ball)', 'cube.intersect(ball).subtract(rods)', 'cube.intersect(ball).intersect(rods)']) {
  const t0 = performance.now();
  const { bodies, data } = await build(head + `return j.part('x').add(${expr}, { id: 'body' })`);
  const ms = performance.now() - t0;
  const b = bodies[0];
  console.log(expr.padEnd(40), JSON.stringify(b.topology()), 'vol', b.volume().toFixed(3), JSON.stringify(tally(b)), ms.toFixed(0) + ' ms');
}
