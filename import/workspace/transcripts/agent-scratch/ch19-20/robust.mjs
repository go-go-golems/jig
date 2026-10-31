// Robustness: two 20 mm cubes side by side, overlapping by d along x (negative d is a gap). Fuse, with and without
// SimplifyResult, and with a fuzzy value.
import { oc, K, r6 } from './lib.mjs';
const r = K.scope();
const cube = (x, y = 0, z = 0, w = 20, d = 20, h = 20) => r(new oc.BRepPrimAPI_MakeBox(r(new oc.gp_Pnt(x, y, z)), w, d, h)).Shape();
function fuse(a, b, { simplify = false, fuzzy = 0 } = {}) {
  const mk = r(new oc.BRepAlgoAPI_Fuse()); mk.SetArguments(r(K.arrayToList([a]))); mk.SetTools(r(K.arrayToList([b]))); mk.SetRunParallel(false);
  if (fuzzy) mk.SetFuzzyValue(fuzzy);
  mk.Build(r(new oc.Message_ProgressRange()));
  const ok = mk.IsDone() && !mk.HasErrors();
  const warn = mk.HasWarnings();
  if (simplify) mk.SimplifyResult(true, true, 1e-9);
  const s = mk.Shape();
  let S = 0; K.explore(s, 'SOLID', () => S++);
  const fs = K.subShapes(s, 'FACE').list;
  const areas = fs.map(f => K.faceInfo(f).area).sort((x, y) => x - y);
  return { ok, warn, solids: S, faces: fs.length, vol: K.volumeProps(s).volume, valid: K.isValid(s), minArea: areas[0], maxTolV: oc.BRep_Tool.MaxTolerance(s, oc.TopAbs_ShapeEnum.TopAbs_VERTEX) };
}
const fmt = o => `solids ${o.solids} faces ${o.faces} vol ${r6(o.vol)} valid ${o.valid} minFace ${o.minArea.toExponential(3)} maxTolV ${o.maxTolV.toExponential(2)} warn ${o.warn}`;
for (const d of [-1e-3, -1e-6, -1e-7, -5e-8, -1e-8, 0, 1e-8, 5e-8, 1e-7, 1e-6, 1e-5, 1e-3, 0.45]) {
  const a = cube(0), b = cube(20 - d);
  const want = d > 0 ? 16000 - d * 400 : 16000;
  console.log(`d=${d}: raw ${fmt(fuse(a, b))}`);
  console.log(`        simplified ${fmt(fuse(a, b, { simplify: true }))} | exact vol ${r6(want)}`);
}
for (const d of [1e-5, 1e-4]) for (const fz of [1e-4, 1e-3]) { const a = cube(0), b = cube(20 - d); console.log(`d=${d} fuzzy ${fz}: ${fmt(fuse(a, b, { fuzzy: fz, simplify: true }))}`); }
// shifted in y too so the faces are not aligned: a staircase join with coplanar top
const a = cube(0), b = cube(10, 5, 0);
console.log('offset boxes, coplanar tops: raw', fmt(fuse(a, b)), '\n   simplified', fmt(fuse(a, b, { simplify: true })));
