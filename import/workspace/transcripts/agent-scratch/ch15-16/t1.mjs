import { compile, drag, ir, ents } from './lib.mjs';
const code = `return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]],
    { closed: true })
  .circle('hole', 2.2, { at: [40, 4] })
  .constrain(
    j.c.fix('p.1.start'),
    j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'),
    j.c.fix('hole.center'))
  .dim('p.1', 60)`;
const p = await compile(code);
const sk = p.sketches[0];
console.log(sk.dump);
console.log(JSON.stringify(sk.clusters));
console.log(p.decisions.map(d=>`${d.at} ${d.kind} ${d.chose} ${d.reason}`).join('\n'));
const d = await drag('outline', 'p.4.end', [14, 46]);
console.log(ents(d)); console.log(d.moved, d.fixed, d.drag);
console.log(d.dump);
