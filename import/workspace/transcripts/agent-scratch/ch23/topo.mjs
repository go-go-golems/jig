import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const { getOC } = await import('/home/claude/jigcad/src/engine/oc.js');
const K = await import('/home/claude/jigcad/src/engine/kernel.js');
const cases = {
  sphere: "return j.part('s').add(j.sphere(mm(10)), { id: 'ball' })",
  cone: "return j.part('c').add(j.cone(mm(10), mm(0), mm(20)), { id: 'cone' })",
  torus: "return j.part('t').add(j.torus(mm(20), mm(5)), { id: 'ring' })",
  cyl: "return j.part('c').add(j.cyl(mm(10), mm(20)), { id: 'cyl' })",
  roundBlock: "return j.part('b').extrude(j.region.rect(20, 20), mm(10), { id: 'body' }).fillet(j.sel.edges(), mm(2), { id: 'round' })",
  roundPlate: "return j.part('b').extrude(j.region.rect(20, 20), mm(10), { id: 'body' }).fillet(j.feat('body').endFace().edges(), mm(2), { id: 'round' })",
};
for (const [k, s] of Object.entries(cases)) {
  const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': s } });
  const b = r.program.bodies[0];
  console.log(k, r.ok, JSON.stringify(b?.topology), r.program.summary.volume);
}
// count degenerate edges directly via run
const r = await W.handle({ id: 2, op: 'run', code: `return 1` });
