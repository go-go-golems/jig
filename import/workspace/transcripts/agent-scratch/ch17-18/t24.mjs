import { compile } from './base.mjs';
const code = `const plate = j.sketch('plate', { on: j.plane.XY })
  .rect('r', 40, 30, { center: true, r: 4 })
return j.part('block')
  .extrude(plate.profiles(), mm(8), { id: 'base' })
  .fillet(j.feat('base').endFace().edges(), mm(1.5), { id: 'round' })
  .hole([[-12, 0], [12, 0]], j.hole.clearance('M3'), { id: 'holes' })`;
const r = await compile(code);
for (const L of ['L0', 'L1', 'L4', 'L6']) console.log(L, '\n' + r.program.ir[L]);
console.log(r.program.diagnostics.map(d => d.kind));
