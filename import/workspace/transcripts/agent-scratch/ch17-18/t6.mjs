import { build, oc, K } from './base.mjs';
const die = `const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })`;
const { bodies } = await build(die);
const b = bodies[0];
const pts = [[0,0,0],[9,0,6],[8,8,8],[10,0,0],[10,6,0],[7,7,7],[6,6,0],[3,4,8],[9,6,6],[0,9,9], [5,0,8], [4,3,9]];
const cls = p => {
  const v = new oc.BRepBuilderAPI_MakeVertex(K.pnt(p)).Vertex();
  const d = K.distance(v, b.shape); v.delete();
  return d.inner ? 'in' : d.value < 1e-7 ? 'on' : 'out (' + d.value.toFixed(4) + ')';
};
// CSG PMC by hand
const inCube = p => Math.max(...p.map(Math.abs)) - 10;
const inBall = p => Math.hypot(...p) - 13;
const rodsF = p => Math.min(Math.hypot(p[0],p[1]) - 5, Math.hypot(p[1],p[2]) - 5, Math.hypot(p[0],p[2]) - 5);
const sdf = p => Math.max(inCube(p), inBall(p), -rodsF(p));
for (const p of pts) console.log(JSON.stringify(p), 'cube', inCube(p).toFixed(3), 'ball', inBall(p).toFixed(3), 'rods', rodsF(p).toFixed(3), 'f', sdf(p).toFixed(4), '| kernel:', cls(p));
