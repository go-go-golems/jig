import { build, oc, K, r6 } from './lib.mjs';
const prog = await build(`return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4).profiles(), mm(10), { id: 'block' })`);
const b = prog.kernelBodies()[0].body;
const O = oc.TopAbs_Orientation;
function assemble(faces) {
  const B = new oc.TopoDS_Builder();
  const sh = new oc.TopoDS_Shell(); B.MakeShell(sh);
  for (const f of faces) B.Add(sh, f);
  const so = new oc.TopoDS_Solid(); B.MakeSolid(so); B.Add(so, sh);
  return so;
}
const all = b.faces.list;
const same = assemble(all);
console.log('reassembled: valid', K.isValid(same), 'vol', r6(K.volumeProps(same).volume));
const missing = assemble(all.filter((_, i) => i !== 6));
console.log('without block/end: valid', K.isValid(missing), 'vol', r6(K.volumeProps(missing).volume));
const flipped = assemble(all.map((f, i) => i === 6 ? oc.TopoDS.Face(f.Reversed()) : f));
console.log('block/end reversed: valid', K.isValid(flipped), 'vol', r6(K.volumeProps(flipped).volume));
const allrev = assemble(all.map(f => oc.TopoDS.Face(f.Reversed())));
console.log('all reversed: valid', K.isValid(allrev), 'vol', r6(K.volumeProps(allrev).volume));
// BRepCheck with exact method
const a = new oc.BRepCheck_Analyzer(flipped, true, false); console.log('analyzer methods', a.IsValid());
