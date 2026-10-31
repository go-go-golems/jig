// Body.topology() counts degenerate edges, so the genus is wrong (ball G = 1, cone G = 0.5)
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
for (const s of ["return j.part('s').add(j.sphere(mm(10)), { id: 'ball' })",
  "return j.part('c').add(j.cone(mm(10), mm(0), mm(20)), { id: 'cone' })",
  "return j.part('b').extrude(j.region.rect(20, 20), mm(10), { id: 'body' })" +
  ".fillet(j.sel.edges(), mm(2), { id: 'round' })"]) {
  const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': s } });
  console.log(JSON.stringify(r.program.bodies[0].topology));
}
// prints G 1, 0.5 and 4; all three solids have genus 0
