import { compile, drag, ents } from './lib.mjs';
import { readFileSync } from 'node:fs';
let p = await compile(`return j.sketch('outline', { on: j.plane.XY })
  .polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(j.c.fix('p.1.start'), j.c.horizontal('p.1'), j.c.vertical('p.2'), j.c.horizontal('p.3'),
    j.c.vertical('p.4'), j.c.horizontal('p.5'), j.c.vertical('p.6'))
  .dim('p.1', 60)`);
console.log(p.diagnostics.map(d => `${d.kind}: ${d.message} | ${d.fix}`).join('\n'));
p = await compile(readFileSync('/home/claude/jigcad/content/presets/A-03-constrained-plate/script.js', 'utf8'));
const sk = p.sketches.find(s => s.id === 'outline');
console.log(sk.dump.split('\n').slice(0, 4).join('\n'));
const d = await drag('outline', 'h2.center', [50, 10]);
console.log(d.moved, ents(d).split('\n').filter(l => l.startsWith('h')).join(' | '));
p = await compile(`return j.sketch('arm', { on: j.plane.XY })
  .line('l1', [0, 0], [18, 24]).line('l2', 'l1.end', [38, 24])
  .constrain(j.c.fix('l1.start'), j.c.angle('l1', 'l2', deg(60))).dim('l1', 30).dim('l2', 20)`);
console.log(p.sketches[0].dump.split('\n').slice(3, 5).join('\n'));
