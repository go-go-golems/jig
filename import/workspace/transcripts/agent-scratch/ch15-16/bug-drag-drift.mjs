// A drag moves coordinates the target does not ask for, by ~1e-4 mm, and dragging a fixed point moves free ones.
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const go = async (code, sk, ref, to) => {
  await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': code } });
  return (await W.handle({ id: 2, op: 'solveSketch', sketchId: sk, drag: { ref, to } })).sketch;
};
// 1. free rectangle (width 40): drag the top-right corner; the bottom should stay at y = 0
let s = await go(`return j.sketch('r', { on: j.plane.XY })
  .polyline('p', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })
  .constrain(j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'), j.c.vertical('p.4'))
  .dim('p.1', 40)`, 'r', 'p.2.end', [46, 26]);
console.log('bottom y after drag (want 0):', s.entities[0].a[1]);          // -7.4e-5
// 2. two-link arm with a fixed base: drag the fixed base; nothing should move
s = await go(`return j.sketch('arm', { on: j.plane.XY })
  .line('l1', [0, 0], [18, 24]).line('l2', 'l1.end', [38, 24])
  .constrain(j.c.fix('l1.start')).dim('l1', 30).dim('l2', 20)`, 'arm', 'l1.start', [5, 5]);
console.log('moved (want []):', s.moved, 'elbow (want 18,24):', s.entities[0].b);   // [l1, l2], (18.0002, 23.9998)
