import { register } from 'node:module';
import fs from 'node:fs';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const { getOC } = await import('/home/claude/jigcad/src/engine/oc.js');
const K = await import('/home/claude/jigcad/src/engine/kernel.js');
const { makeJ } = await import('/home/claude/jigcad/src/engine/j.js');
const { j, bare } = makeJ();
const oc = getOC();
const T = oc.TopAbs_ShapeEnum;
const report = (label, prog) => {
  for (const { body } of prog.kernelBodies()) {
    const vs = K.subShapes(body.shape, 'VERTEX'), es = K.subShapes(body.shape, 'EDGE'), fs = K.subShapes(body.shape, 'FACE');
    const tv = vs.list.map(v => oc.BRep_Tool.Tolerance(oc.TopoDS.Vertex(v)));
    let te = [], tf = [];
    try { te = es.list.map(e => oc.BRep_Tool.Tolerance(oc.TopoDS.Edge(e))); } catch (e) { te = ['err ' + e]; }
    try { tf = fs.list.map(f => oc.BRep_Tool.Tolerance(oc.TopoDS.Face(f))); } catch (e) { tf = ['err ' + e]; }
    const mx = a => typeof a[0] === 'number' ? Math.max(...a).toExponential(1) : a[0];
    console.log(`${label} ${body.id}: V ${tv.length} max vertex tol ${mx(tv)}, E ${te.length} max edge tol ${mx(te)}, F ${tf.length} max face tol ${mx(tf)}, valid ${K.isValid(body.shape)}`);
  }
};
const { mm, deg } = bare;
const box = j.part('box').extrude(j.region.rect(20, 10), mm(5), { id: 'b' });
report('box', j.compile(box));
const cube = j.box(mm(20), mm(20), mm(20), { center: true });
const ball = j.sphere(mm(13));
const rod = j.cyl(mm(5), mm(40), { center: true });
const rods = rod.union(rod.moved(j.tx.rotate(j.axis.X, deg(90)))).union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))));
report('die', j.compile(j.part('die').add(cube.intersect(ball).subtract(rods), { id: 'body' })));
report('round', j.compile(j.part('b').extrude(j.region.rect(20, 20), mm(10), { id: 'body' }).fillet(j.sel.edges(), mm(2), { id: 'round' })));
const thr = j.part('bolt').add(j.lib.thread('M8', { length: mm(12) }), { id: 'thread' });
report('M8 thread', j.compile(thr));
const gear = j.part('g').add(j.lib.gear.spur({ module: 1, teeth: 12, width: mm(5) }), { id: 'gear' });
report('spur gear', j.compile(gear));
