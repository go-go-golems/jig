import { compile } from './h.mjs';
const p = await compile(`return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })`);
console.log(p.metrics.overhangArea, p.metrics.volume.value, p.metrics.mass);
const q = await compile(`return j.part('t').extrude(j.region.rect(60, 40, { r: 1 }), mm(30), { id: 'body' }).shell(j.feat('body').endFace(), mm(2), { id: 'shell' })`);
console.log(q.diagnostics);
