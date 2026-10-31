import { compile } from './h.mjs';
for (const r of [0.98, 1, 1.02, 1.5]) {
const q = await compile(`return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), mm(${r}), { id: 'hub-root' })`);
console.log(r, q.bodies[0].volume.toFixed(4), q.bodies[0].bbox[1][2], q.bodies[0].faces.length, q.diagnostics.map(d => d.kind + ': ' + d.message).join(' / '));
}
