import { register } from 'node:module';
import fs from 'node:fs';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const { getOC } = await import('/home/claude/jigcad/src/engine/oc.js');
const K = await import('/home/claude/jigcad/src/engine/kernel.js');
const { compile } = await import('/home/claude/jigcad/src/engine/program.js');
const oc = getOC();
const report = (label, prog) => {
  for (const { body } of prog.kernelBodies()) {
    const vs = K.subShapes(body.shape, 'VERTEX'), es = K.subShapes(body.shape, 'EDGE'), fs = K.subShapes(body.shape, 'FACE');
    const vt = vs.list.map(v => oc.BRep_Tool.Tolerance_1 ? oc.BRep_Tool.Tolerance_1(oc.TopoDS.Vertex(v)) : oc.BRep_Tool.Tolerance(oc.TopoDS.Vertex(v)));
    const et = es.list.map(e => oc.BRep_Tool.Tolerance_2 ? oc.BRep_Tool.Tolerance_2(oc.TopoDS.Edge(e)) : null);
    const ft = fs.list.map(f => oc.BRep_Tool.Tolerance_3 ? oc.BRep_Tool.Tolerance_3(oc.TopoDS.Face(f)) : null);
    const mx = a => Math.max(...a.filter(x => x != null));
    const mn = a => Math.min(...a.filter(x => x != null));
    console.log(`${label} ${body.id}: V ${vs.list.length} max tol ${mx(vt).toExponential(1)} (min ${mn(vt).toExponential(1)}); E max ${mx(et).toExponential(1)}; F max ${mx(ft).toExponential(1)}; valid ${K.isValid(body.shape)}`);
  }
};
console.log(Object.keys(oc.BRep_Tool).filter(k => /Toler/.test(k)), typeof oc.BRep_Tool.Tolerance);
const run = async (label, code, files) => {
  const r = await W.handle({ id: 9, op: 'run', code: 'return 1' });
  // build model through j in worker scope: use run to return compile? need kernel objects → use compile from program.js with a model built by worker's j
};
