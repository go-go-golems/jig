import { build, tally, oc, K } from './base.mjs';
const die = `const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })`;
const { bodies, data } = await build(die);
const b = bodies[0];
console.log(data.summary.volume, tally(b), b.topology(), 'valid', K.isValid(b.shape));
console.log(Object.keys(oc).filter(k => /Classifier|Class3d|SolidClass/.test(k)));
const pts = [[0,0,0],[9,0,6],[8,8,8],[10,0,0],[9,9,0],[7,7,7],[0,0,10],[6,6,0],[3,4,8],[9,6,6]];
const TS = oc.TopAbs_State;
const nm = s => Object.keys(TS).find(k => TS[k] === s);
for (const p of pts) {
  const c = new oc.BRepClass3d_SolidClassifier(b.shape, K.pnt(p), 1e-7);
  console.log(p, nm(c.State()));
  c.delete();
}
