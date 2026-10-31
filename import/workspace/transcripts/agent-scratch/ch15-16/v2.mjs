import { compile } from './lib.mjs';
import { readFileSync } from 'node:fs';
for (const r of [4.99, 5, 5.01]) {
  const p = await compile(`return j.sketch('s', { on: j.plane.XY })
  .polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })
  .circle('c', ${r}, { at: [20, 15] })
  .line('spur', [32, 20], [32, 30])`);
  console.log(r, p.sketches[0].profiles.map(x => `${x.id} ${x.area.toFixed(4)}`).join(' · '));
}
const p = await compile(readFileSync('/home/claude/jigcad/content/presets/A-03-constrained-plate/script.js', 'utf8'));
console.log(p.sketches.find(s => s.id === 'outline').profiles.map(x => `${x.id} ${x.area.toFixed(3)} loops ${x.loops.length}`));
