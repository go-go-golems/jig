// The boolean pipeline on chapter 5's box A and cylinder B: culling, section, general fuse, classification, history.
import { oc, K, r6, B as BD } from './lib.mjs';
const r = K.scope();
const A = r(new oc.BRepPrimAPI_MakeBox(r(new oc.gp_Pnt(-20, -15, -10)), 40, 30, 20)).Shape();
const cylAx = r(new oc.gp_Ax2(r(new oc.gp_Pnt(20, 0, -25)), r(new oc.gp_Dir(0, 0, 1))));
const Bs = r(new oc.BRepPrimAPI_MakeCylinder(cylAx, 12, 50)).Shape();
console.log('vol A', r6(K.volumeProps(A).volume), 'vol B', r6(K.volumeProps(Bs).volume));
const fa = K.subShapes(A, 'FACE').list, fb = K.subShapes(Bs, 'FACE').list;
const ea = K.subShapes(A, 'EDGE').list, eb = K.subShapes(Bs, 'EDGE').list;
const box = s => { const bx = new oc.Bnd_Box(); oc.BRepBndLib.Add(s, bx, false); return bx; };
const finfo = f => { const i = K.faceInfo(f); return `${i.kind}${i.normal ? '(' + i.normal.map(r6) + ')' : ''}`; };
let n = 0, hit = 0; const hits = [];
fa.forEach((f, i) => fb.forEach((g, j) => { n++; const b1 = box(f), b2 = box(g); if (!b1.IsOut(b2)) { hit++; hits.push(`A.f${i} ${finfo(f)} × B.f${j} ${finfo(g)}`); } b1.delete(); b2.delete(); }));
console.log(`face pairs ${n}, boxes overlap ${hit}`); hits.forEach(h => console.log('  ', h));
let ne = 0, he = 0; ea.forEach(e => fb.forEach(g => { ne++; const b1 = box(e), b2 = box(g); if (!b1.IsOut(b2)) he++; })); eb.forEach(e => fa.forEach(g => { ne++; const b1 = box(e), b2 = box(g); if (!b1.IsOut(b2)) he++; }));
console.log(`edge-face pairs ${ne}, boxes overlap ${he}`);
// section
const sec = r(new oc.BRepAlgoAPI_Section(A, Bs, true));
const se = K.subShapes(sec.Shape(), 'EDGE').list;
console.log('section edges', se.length, se.map(e => { const i = K.edgeInfo(e); return `${i.kind} ${r6(i.length)}`; }).join(', '), 'total', r6(se.reduce((s, e) => s + K.edgeInfo(e).length, 0)));
console.log('section vertices', K.subShapes(sec.Shape(), 'VERTEX').list.map(v => { const p = oc.BRep_Tool.Pnt(v); return `(${r6(p.X())},${r6(p.Y())},${r6(p.Z())})`; }).join(' '));
// general fuse
const gf = r(new oc.BRepAlgoAPI_BuilderAlgo());
gf.SetArguments(r(K.arrayToList([A, Bs])));
gf.SetRunParallel(false);
gf.Build(r(new oc.Message_ProgressRange()));
const G = gf.Shape();
const gs = K.subShapes(G, 'SOLID').list, gfaces = K.subShapes(G, 'FACE');
console.log('GF solids', gs.length, gs.map(s => r6(K.volumeProps(s).volume)).join(', '), '| faces', gfaces.list.length, 'edges', K.countSub(G, 'EDGE'), 'vertices', K.countSub(G, 'VERTEX'));
// which solids does each face bound?
const bound = gfaces.list.map(() => []);
gs.forEach((s, si) => K.explore(s, 'FACE', f => { const k = gfaces.indexOf(f); if (k >= 0 && !bound[k].includes(si)) bound[k].push(si); }));
// origin of each GF face: from A or B (via Modified / same)
const origin = gfaces.list.map(() => '?');
[[fa, 'A'], [fb, 'B']].forEach(([fs, tag]) => fs.forEach((f, i) => {
  const mods = K.listToArray(gf.Modified(f));
  if (mods.length) mods.forEach(m => { const k = gfaces.indexOf(m); if (k >= 0) origin[k] = `${tag}.f${i}`; });
  else { const k = gfaces.indexOf(f); if (k >= 0) origin[k] = `${tag}.f${i}`; }
}));
gfaces.list.forEach((f, k) => console.log(`  GF face ${k}: from ${origin[k]} ${finfo(f)} area ${r6(K.faceInfo(f).area)} bounds solids [${bound[k]}]`));
for (const [name, Op] of [['fuse', oc.BRepAlgoAPI_Fuse], ['common', oc.BRepAlgoAPI_Common], ['cut', oc.BRepAlgoAPI_Cut]]) {
  const mk = r(new Op()); mk.SetArguments(r(K.arrayToList([A]))); mk.SetTools(r(K.arrayToList([Bs]))); mk.SetRunParallel(false); mk.Build(r(new oc.Message_ProgressRange()));
  const s = mk.Shape();
  const f0 = K.countSub(s, 'FACE'), v0 = K.volumeProps(s).volume;
  const secE = K.listToArray(mk.SectionEdges()).length;
  mk.SimplifyResult(true, true, 1e-9);
  const s2 = mk.Shape();
  console.log(`${name}: faces ${f0} → simplified ${K.countSub(s2, 'FACE')}, vol ${r6(v0)} → ${r6(K.volumeProps(s2).volume)}, section edges ${secE}, valid ${K.isValid(s2)}`);
  if (name === 'fuse' || name === 'cut') {
    [[fa, 'A'], [fb, 'B']].forEach(([fs, tag]) => fs.forEach((f, i) => {
      const m = K.listToArray(mk.Modified(f)); const g = K.listToArray(mk.Generated(f));
      console.log(`   ${tag}.f${i} ${finfo(f)}: modified ${m.length}${m.length ? ' [' + m.map(x => r6(K.faceInfo(K.castTo(x, 'FACE')).area)).join(', ') + ']' : ''} generated ${g.length}${g.length ? " " + g.map(x => K.isType(x, "EDGE") ? "edge" : "other").join(",") : ""} deleted ${mk.IsDeleted(f)}`);
    }));
  }
}
