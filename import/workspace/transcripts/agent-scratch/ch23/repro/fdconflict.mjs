// A consistent 0.1 x 0.05 mm rectangle at (500, 500) mm is reported over-constrained
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
for (const X of [0, 500]) {
  const s = `const X = ${X}
return j.sketch('q', { on: j.plane.XY })
  .line('l1', [X, X], [X + 0.1, X])
  .line('l2', 'l1.end', [X + 0.1, X + 0.065])
  .line('l3', 'l2.end', [X, X + 0.065])
  .line('l4', 'l3.end', 'l1.start')
  .constrain(j.c.fix('l1.start'), j.c.horizontal('l1'), j.c.horizontal('l3'),
    j.c.vertical('l2'), j.c.vertical('l4'), j.c.angle('l1', 'l2', deg(90)))
  .dim('l1', 0.1).dim('l2', 0.05)`;
  const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': s } });
  console.log(X, r.program.sketches[0].status, r.program.diagnostics.map(d => d.kind + ': ' + d.message));
}
// X = 0: fully, angle redundant (right). X = 500: sketch.overConstrained, l2 left at 0.065 mm.
// Cause: solver.js makeProblem h = 1e-4 * max(1, |x|) = 0.05 mm, comparable to the 0.065 mm line.
