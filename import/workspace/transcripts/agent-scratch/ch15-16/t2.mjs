import { compile, drag } from './lib.mjs';
const code = `return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60)`;
const p = await compile(code);
const d = await drag('outline', 'p.4.end', [14, 46]);
for (const e of d.entities) console.log(e.id, e.a, e.b);
console.log(d.drag);
