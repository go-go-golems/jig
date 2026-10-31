// Sharing and orientation in TopoDS: explorer visit counts, IsSame / IsEqual / IsPartner, NbChildren, locations.
import { build, oc, K, r6 } from './lib.mjs';
import { oname } from './explore.mjs';
const prog = await build(`return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4).profiles(), mm(10), { id: 'block' })`);
const b = prog.kernelBodies()[0].body;
const TA = oc.TopAbs_ShapeEnum;
for (const k of ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX']) { let n = 0; K.explore(b.shape, k, () => n++); console.log(`explorer visits ${k}: ${n}, unique ${K.countSub(b.shape, k)}`); }
// children counts down the tree
const nb = s => s.NbChildren();
let shell; K.explore(b.shape, 'SHELL', s => shell ??= oc.TopoDS.Shell(s));
console.log('solid children', b.shape.NbChildren(), 'shell children', shell.NbChildren());
b.faces.list.forEach((f, i) => { const ws = []; K.explore(f, 'WIRE', w => ws.push(w.NbChildren())); console.log(`  f${i} ${b.names[i]} wires ${f.NbChildren()} edges per wire ${ws}`); });
b.edges.list.forEach((e, i) => console.log(`  e${i} children ${e.NbChildren()}`));
// the edge e0 as seen from its two faces
const e0 = b.edges.list[0];
const uses = [];
b.faces.list.forEach((f, fi) => K.explore(f, 'EDGE', x => { if (x.IsSame(e0)) uses.push({ fi, s: oc.TopoDS.Edge(x) }); }));
console.log('uses of e0:', uses.map(u => `f${u.fi}:${oname(u.s.Orientation())}`).join(' '));
const [a, c] = uses;
console.log('IsSame', a.s.IsSame(c.s), 'IsEqual', a.s.IsEqual(c.s), 'IsPartner', a.s.IsPartner(c.s));
// a moved copy shares the TShape: IsPartner but not IsSame
const moved = K.moveShape(b.shape, [1,0,0,0, 0,1,0,0, 0,0,1,0, 30,0,0,1]);
const copied = K.transformShape(b.shape, [1,0,0,0, 0,1,0,0, 0,0,1,0, 30,0,0,1]);
const mf = K.subShapes(moved, 'FACE').list[0], cf = K.subShapes(copied, 'FACE').list[0];
console.log('moved: IsPartner', mf.IsPartner(b.faces.list[0]), 'IsSame', mf.IsSame(b.faces.list[0]), '| copied: IsPartner', cf.IsPartner(b.faces.list[0]));
console.log('location identity? orig', b.shape.Location().IsIdentity(), 'moved', moved.Location().IsIdentity(), 'copied', copied.Location().IsIdentity());
// edge orientation pairing over the whole shell
const pairs = new Map();
b.faces.list.forEach((f, fi) => K.explore(f, 'EDGE', x => { const ei = b.edges.indexOf(x); (pairs.get(ei) ?? pairs.set(ei, []).get(ei)).push(oname(x.Orientation())); }));
console.log('edge uses', [...pairs].map(([k, v]) => `e${k}:${v.join('')}`).join(' '));
