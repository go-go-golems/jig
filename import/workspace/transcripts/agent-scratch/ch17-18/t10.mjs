import { build, tally, K, oc } from './base.mjs';
const r = [];
const mkbox = (o, s) => new oc.BRepPrimAPI_MakeBox(K.pnt(o), K.pnt([o[0]+s[0], o[1]+s[1], o[2]+s[2]])).Shape();
const A = mkbox([0,0,0],[20,20,10]), B = mkbox([20,0,0],[20,20,10]);
const fuse = (simplify) => {
  const mk = new oc.BRepAlgoAPI_Fuse();
  mk.SetArguments(K.arrayToList([A])); mk.SetTools(K.arrayToList([B]));
  mk.Build(new oc.Message_ProgressRange());
  if (simplify) mk.SimplifyResult(true, true, 1e-9);
  return mk.Shape();
};
for (const s of [false, true]) {
  const sh = fuse(s);
  console.log('simplify', s, 'F', K.countSub(sh, 'FACE'), 'E', K.countSub(sh, 'EDGE'), 'V', K.countSub(sh, 'VERTEX'), 'vol', K.volumeProps(sh).volume, 'valid', K.isValid(sh));
  // classify (20,10,5): on both boxes' shared face
  const v = new oc.BRepBuilderAPI_MakeVertex(K.pnt([20, 10, 5])).Vertex();
  const dA = K.distance(v, A), dB = K.distance(v, B), dU = K.distance(v, sh);
  console.log('  point (20,10,5): A', dA, 'B', dB, 'union', dU);
}
// common of touching boxes
const mk = new oc.BRepAlgoAPI_Common(); mk.SetArguments(K.arrayToList([A])); mk.SetTools(K.arrayToList([B])); mk.Build(new oc.Message_ProgressRange());
const c = mk.Shape(); console.log('common: solids', K.countSub(c, 'SOLID'), 'faces', K.countSub(c, 'FACE'), 'vol', K.volumeProps(c).volume);
{
  const sh = fuse(true);
  console.log('type', K.shapeTypeName(sh));
  const so = K.solidsOf(sh)[0];
  const v = new oc.BRepBuilderAPI_MakeVertex(K.pnt([20, 10, 5])).Vertex();
  console.log('solid: ', K.distance(v, so), K.distance(so, v));
  const v2 = new oc.BRepBuilderAPI_MakeVertex(K.pnt([20, 10, 10])).Vertex();
  console.log('on top face', K.distance(v2, so));
}
