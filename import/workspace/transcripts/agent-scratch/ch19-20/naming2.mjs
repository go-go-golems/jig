import { build, oc, K, r6 } from './lib.mjs';
const prog = await build(`return j.part('p')
  .extrude(j.region.rect(40, 30), mm(20), { id: 'block' })
  .extrude(j.region.circle(12, { at: [20, 0] })
    .on(j.plane.offset(j.plane.XY, -5)), mm(30), { id: 'post', op: 'join' })`);
const b = prog.kernelBodies()[0].body;
b.edgeNames.forEach((n, i) => { const e = b.edgeInfo(i); console.log(`e${i} ${e.kind} ${r6(e.length)}  ${n}`); });
