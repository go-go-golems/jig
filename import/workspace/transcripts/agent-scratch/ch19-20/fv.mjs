import { build, oc, K, r6 } from './lib.mjs';
const prog = await build(`return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4).profiles(), mm(10), { id: 'block' })`);
const b = prog.kernelBodies()[0].body;
b.edges.list.forEach((e, i) => { const ad = new oc.BRepAdaptor_Curve(e); const p = ad.Value(ad.FirstParameter()), q = ad.Value(ad.LastParameter());
  const vs = []; K.explore(e, 'VERTEX', v => vs.push((v.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD ? 'F' : 'R') + b.vertices.indexOf(v)));
  console.log(`e${i} ${vs} first (${[p.X(), p.Y(), p.Z()].map(r6)}) last (${[q.X(), q.Y(), q.Z()].map(r6)}) edgeOri ${e.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD ? 'F' : 'R'}`); });
