import { compile, drag, ents } from './lib.mjs';
const arm = `return j.sketch('arm', { on: j.plane.XY })
  .line('l1', [0, 0], [18, 24])
  .line('l2', 'l1.end', [38, 24])
  .constrain(j.c.fix('l1.start'))
  .dim('l1', 30).dim('l2', 20)`;
let p = await compile(arm);
console.log(p.sketches[0].dump);
console.log(p.diagnostics.map(d => `${d.kind}: ${d.message} | ${d.fix}`).join('\n'));
let d = await drag('arm', 'l2.end', [10, 40]);
console.log(ents(d)); console.log(JSON.stringify(d.drag));
for (const e of d.entities) console.log(e.id, e.a, e.b, Math.hypot(e.b[0]-e.a[0], e.b[1]-e.a[1]));
p = await compile(arm);
d = await drag('arm', 'l2.end', [60, 30]);
console.log('unreachable'); for (const e of d.entities) console.log(e.id, e.a, e.b, Math.hypot(e.b[0]-e.a[0], e.b[1]-e.a[1]));
console.log(JSON.stringify(d.drag), d.status, d.dof);
// then drag back inside
d = await drag('arm', 'l2.end', [30, 30]);
console.log('back'); for (const e of d.entities) console.log(e.id, e.a, e.b);
console.log(JSON.stringify(d.drag));
// drag the fixed base
p = await compile(arm);
d = await drag('arm', 'l1.start', [5, 5]);
console.log('fixed base'); console.log(ents(d), d.moved, d.fixed, JSON.stringify(d.drag));
