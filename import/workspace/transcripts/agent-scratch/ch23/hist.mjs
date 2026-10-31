import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const { loadOC } = await import('/home/claude/jigcad/src/engine/oc.js');
const K = await import('/home/claude/jigcad/src/engine/kernel.js');
const oc = await loadOC();
const box = (x, y, z, w, d, h) => new oc.BRepPrimAPI_MakeBox(new oc.gp_Pnt(x, y, z), new oc.gp_Pnt(x + w, y + d, z + h)).Shape();
const A = box(0, 0, 0, 60, 40, 20);
const B = box(-1, 17, 16, 62, 6, 10);   // groove 6 wide, 4 deep across the top
const run = (name, mk, ins) => {
  mk.Build(new oc.Message_ProgressRange());
  const out = mk.Shape();
  const nOut = K.countSub(out, 'FACE');
  console.log(`== ${name}: result faces ${nOut}`);
  const counts = { kept: 0, modified: 0, deleted: 0, split: 0 };
  ins.forEach(([label, s]) => {
    const fs = K.subShapes(s, 'FACE');
    fs.list.forEach((f, i) => {
      const mod = K.listToArray(mk.Modified(f)); const gen = K.listToArray(mk.Generated(f)); const del = mk.IsDeleted(f);
      const st = del ? 'deleted' : mod.length ? `modified → ${mod.length}` : 'kept';
      if (del) counts.deleted++; else if (mod.length > 1) counts.split++; else if (mod.length) counts.modified++; else counts.kept++;
      const info = K.faceInfo(f);
      console.log(`  ${label} face ${i} ${info.kind} n=${info.normal?.map(v=>+v.toFixed(2))} c=${info.center.map(v=>+v.toFixed(1))}: ${st}${gen.length ? `, generated ${gen.length}` : ''}`);
    });
  });
  console.log('  ', counts);
  return out;
};
const cut = new oc.BRepAlgoAPI_Cut(A, B, new oc.Message_ProgressRange());
run('block − groove', cut, [['A', A], ['B', B]]);
// also: edge history? fillet
const C = box(0, 0, 0, 20, 20, 10);
const mf = new oc.BRepFilletAPI_MakeFillet(C, oc.ChFi3d_FilletShape.ChFi3d_Rational);
const es = K.subShapes(C, 'EDGE');
es.list.forEach(e => mf.Add(2, e));
mf.Build(new oc.Message_ProgressRange());
const fo = mf.Shape();
let genE = 0, genV = 0;
es.list.forEach(e => { genE += K.listToArray(mf.Generated(e)).filter(g => K.isType(g, 'FACE')).length; });
const vs = K.subShapes(C, 'VERTEX');
vs.list.forEach(v => { genV += K.listToArray(mf.Generated(v)).filter(g => K.isType(g, 'FACE')).length; });
const fsC = K.subShapes(C, 'FACE');
let modF = 0; fsC.list.forEach(f => { modF += K.listToArray(mf.Modified(f)).length; });
console.log('fillet all 12 edges r=2: result faces', K.countSub(fo, 'FACE'), 'faces generated from edges', genE, 'from vertices', genV, 'modified from faces', modF, 'volume', K.volumeProps(fo).volume);
const kinds = {}; K.subShapes(fo, 'FACE').list.forEach(f => { const k = K.faceInfo(f).kind; kinds[k] = (kinds[k] ?? 0) + 1; });
console.log(kinds);
