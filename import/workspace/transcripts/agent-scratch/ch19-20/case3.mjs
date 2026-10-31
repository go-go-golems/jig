import { build, oc, K, r6, B } from './lib.mjs';
import { dump } from './explore.mjs';
const prog = await build(`return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })`);
const b = prog.kernelBodies()[0].body;
console.log(dump(b, { pcurves: false }));
const ei = b.edgeNames.findIndex(n => n === 'hub/side[circle] ∩ disc/end');
for (const R of process.argv.slice(2).map(Number)) {
  const mk = new oc.BRepFilletAPI_MakeFillet(b.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  mk.Add(R, b.edges.list[ei]);
  mk.Build(new oc.Message_ProgressRange());
  const s = mk.Shape();
  const { names } = B.carryNames(s, [{ body: b }], B.historyOf(mk), 'hub-root', [], { genFrom: 'hub-root' });
  const nb = new B.Body('x', s, names);
  console.log(`\n=== r = ${R}: valid ${K.isValid(s)} vol ${r6(nb.volume())} topo ${JSON.stringify(nb.topology())}`);
  console.log(dump(nb, { pcurves: false }));
  // history of each original face
  b.faces.list.forEach((f, i) => { const m = K.listToArray(mk.Modified(f)); console.log(`  ${b.names[i]}: modified→${m.length} deleted=${mk.IsDeleted(f)}`); m.forEach(x => x.delete()); });
  b.edges.list.forEach((e, i) => { const g = K.listToArray(mk.Generated(e)); if (g.length) console.log(`  edge ${b.edgeNames[i]}: generated ${g.length} ${g.map(x => K.shapeTypeName(x)).join(',')}`); g.forEach(x => x.delete()); });
  b.vertices.list.forEach((v, i) => { const g = K.listToArray(mk.Generated(v)); if (g.length) console.log(`  vertex v${i}: generated ${g.length}`); g.forEach(x => x.delete()); });
}
