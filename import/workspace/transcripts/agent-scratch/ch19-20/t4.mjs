import { build, oc, K } from './lib.mjs';
const prog = await build(`return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4).profiles(), mm(10), { id: 'block' })`);
const b = prog.kernelBodies()[0].body;
const f = b.faces.list[4], e = b.edges.list.find((_, i) => b.edgeFaces[i][0] === 4 && b.edgeFaces[i][1] === 4);
console.log('seam?', b.edgeFaces);
const c2 = new oc.BRepAdaptor_Curve2d(e, f);
let p = c2; const protos = []; while (p && p !== Object.prototype) { protos.push(Object.getOwnPropertyNames(Object.getPrototypeOf(p)).join(' ')); p = Object.getPrototypeOf(p); }
console.log(protos.join('\n'));
try { const h = oc.BRep_Tool.CurveOnSurface(e, f, 0, 0); console.log('COS', h, h && h.get && h.get().DynamicType && h.get().DynamicType().get().Name()); } catch (x) { console.log('COS err', x.message ?? x); }
