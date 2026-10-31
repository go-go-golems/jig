import { compile, drag, ents } from './lib.mjs';
// 1 explicit sketch
await compile(`return j.sketch('e', { on: j.plane.XY }).polyline('p', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })`);
let d = await drag('e', 'p.2.end', [46, 26]);
console.log('explicit:', d.moved, d.fixed, JSON.stringify(d.drag));
// 2 fully constrained triangle: drag the apex
await compile(`return j.sketch('tri', { on: j.plane.XY })
  .line('a', [0, 0], [40, 0]).line('b', 'a.end', [10, 25]).line('c', 'b.end', 'a.start')
  .constrain(j.c.fix('a.start'), j.c.horizontal('a'))
  .dim('a', 40).dim('b', 35).dim('c', 25)`);
d = await drag('tri', 'b.end', [20, 30]);
console.log('fully:', d.moved, JSON.stringify(d.drag));
for (const e of d.entities) console.log(e.id, e.a, e.b);
// 3 plate: free-height rectangle + two fixed holes (3 clusters): drag the rectangle
const plate = `return j.sketch('plate', { on: j.plane.XY })
  .rect('r', 60, null)
  .circle('h1', 3, { at: [12, 15] })
  .circle('h2', 3, { at: [48, 15] })
  .constrain(j.c.fix('h1.center'), j.c.fix('h2.center'))
  .dim('h1', 6).dim('h2', 6)`;
let p = await compile(plate);
console.log(p.sketches[0].dump); console.log(JSON.stringify(p.sketches[0].clusters));
console.log(p.diagnostics.map(d => `${d.kind}: ${d.message} | ${d.fix}`).join('\n'));
d = await drag('plate', 'r.tr', [60, 40]);
console.log('plate drag:', d.moved, d.fixed, JSON.stringify(d.drag));
console.log(d.dump);
d = await drag('plate', 'h1.center', [20, 20]);
console.log('hole drag:', d.moved, d.fixed, JSON.stringify(d.drag));
