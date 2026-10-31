// Case study: 1 mm fillet round the Ø16 hub whose rim reaches the crank peg's root at r = 9.
import { build, oc, K, r6 } from './lib.mjs';
const base = `return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })`;
const prog = await build(base);
const b = prog.kernelBodies()[0].body;
console.log('before', b.names, prog.data.bodies[0].topology, 'vol', r6(b.volume()), 'valid', K.isValid(b.shape));
const hubRoot = b.edgeNames.map((n, i) => [n, i]).filter(([n]) => n.includes('hub/side') && n.includes('disc/end'));
console.log('hub root edges', hubRoot);
const ei = hubRoot.map(x => x[1]);
for (const R of [0.5, 0.8, 0.9, 0.95, 0.99, 0.999, 1.0, 1.001, 1.01, 1.1, 1.5, 2]) {
  const mk = new oc.BRepFilletAPI_MakeFillet(b.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for (const i of ei) mk.Add(R, b.edges.list[i]);
  let line = `r=${R}: `;
  try {
    mk.Build(new oc.Message_ProgressRange());
    line += `IsDone ${mk.IsDone()} faulty ${mk.NbFaultyContours()} `;
    if (mk.IsDone()) {
      const s = mk.Shape();
      const nf = K.countSub(s, 'FACE');
      const deleted = b.faces.list.map((f, i) => mk.IsDeleted(f) ? b.names[i] : null).filter(Boolean);
      const vol = K.volumeProps(s).volume;
      const bb = K.bboxOf(s);
      let S = 0; K.explore(s, 'SOLID', () => S++);
      line += `faces ${nf} solids ${S} vol ${r6(vol)} zmax ${r6(bb[1][2])} valid ${K.isValid(s)} deleted [${deleted.join(', ')}] newFaces/hubEdge ${mk.NbSurfaces()}`;
    }
  } catch (e) { line += 'threw ' + (K.ocError(e).message); }
  console.log(line);
  mk.delete();
}
