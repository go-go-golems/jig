import { build, oc, K, r6 } from './lib.mjs';
import { dump } from './explore.mjs';
const prog = await build(`return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4, { at: [6, 0] }).profiles(), mm(10), { id: 'block' })`);
for (const kb of prog.kernelBodies()) { const b = kb.body; console.log('\nBODY', b.id, 'valid', K.isValid(b.shape), 'vol', r6(b.volume()), JSON.stringify(b.topology())); console.log(dump(b, { pcurves: false })); }
console.log(prog.data.decisions.map(d => `${d.at} ${d.kind} ${d.chose}`).join('\n'));
