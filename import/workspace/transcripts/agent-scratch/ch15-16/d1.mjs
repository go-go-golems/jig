import { compile, drag, ents, f } from './lib.mjs';
const rect = `return j.sketch('r', { on: j.plane.XY })
  .polyline('p', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })
  .constrain(j.c.horizontal('p.1'), j.c.vertical('p.2'),
    j.c.horizontal('p.3'), j.c.vertical('p.4'))
  .dim('p.1', 40)`;
let p = await compile(rect);
console.log(p.sketches[0].dump);
console.log(p.diagnostics.map(d => `${d.kind}: ${d.message} | ${d.fix}`).join('\n'));
let d = await drag('r', 'p.2.end', [46, 26]);
console.log(ents(d)); console.log(d.moved, d.fixed, JSON.stringify(d.drag));
console.log(d.dump.split('\n')[0]);
// chained
d = await drag('r', 'p.2.end', [50, 30]);
console.log(ents(d)); console.log(JSON.stringify(d.drag));
// recompile resets
p = await compile(rect);
d = await drag('r', 'p.4.start', [-5, 25]);   // top-left corner
console.log('tl drag'); console.log(ents(d)); console.log(JSON.stringify(d.drag));
