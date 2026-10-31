import { compile, drag } from './lib.mjs';
const rect = `return j.sketch('r', { on: j.plane.XY })
  .polyline('p', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })
  .constrain(j.c.horizontal('p.1'), j.c.vertical('p.2'),
    j.c.horizontal('p.3'), j.c.vertical('p.4'))
  .dim('p.1', 40)`;
await compile(rect);
const d = await drag('r', 'p.2.end', [46, 26]);
for (const e of d.entities) console.log(e.id, e.a, e.b);
const before = [[0,0,40,0],[40,0,40,20],[40,20,0,20],[0,20,0,0]];
let s = 0; d.entities.forEach((e, i) => { const v = [...e.a, ...e.b]; v.forEach((x, k) => s += (x - before[i][k]) ** 2); });
console.log('|h| =', Math.sqrt(s));
