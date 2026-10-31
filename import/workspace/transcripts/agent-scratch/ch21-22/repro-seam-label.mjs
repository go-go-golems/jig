// fillet.order decision labels a smooth seam edge "concave"
import { compile } from './h.mjs';
const p = await compile(`return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
  .fillet(j.feat('peg').edges(), mm(1), { id: 'both' })`);
console.log(p.decisions.find(d => d.kind === 'fillet.order').chose);
