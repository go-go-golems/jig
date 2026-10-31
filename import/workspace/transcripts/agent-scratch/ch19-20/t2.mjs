import { build, oc, K } from './lib.mjs';
const prog = await build(`return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4).profiles(), mm(10), { id: 'block' })`);
const b = prog.kernelBodies()[0].body;
console.log(b.names, prog.data.bodies[0].topology);
const f0 = b.faces.list[0], e0 = b.edges.list[0], v0 = b.vertices.list[0];
for (const [n, s] of [['face', f0], ['edge', e0], ['vertex', v0]]) {
  try { console.log(n, oc.BRep_Tool.Tolerance(s)); } catch (e) { console.log(n, 'ERR', e.message ?? e); }
}
console.log('Confusion', oc.Precision.Confusion(), 'Angular', oc.Precision.Angular(), 'PConf', oc.Precision.PConfusion(), 'Intersection', oc.Precision.Intersection(), 'Approx', oc.Precision.Approximation());
console.log(oc.BRep_Tool.Tolerance.length, oc.BRep_Tool.Degenerated.length, oc.BRep_Tool.IsClosed.length, oc.BRep_Tool.CurveOnSurface.length);
console.log(Object.keys(oc.BRep_Tool.Tolerance), String(oc.BRep_Tool.Tolerance).slice(0, 300));
