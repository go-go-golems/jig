import { compile } from './h.mjs';
const base = `j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })`;
for (const r of [9.9, 10, 12, 20]) {
  const t0 = performance.now();
  const p = await compile('return ' + base + `.fillet(j.feat('peg').edges().where(e => e.concave), mm(${r}), { id: 'root' })`);
  console.log(r, (performance.now()-t0).toFixed(0)+' ms', p.bodies[0]?.volume, p.diagnostics.map(d => d.kind + ': ' + d.message + ' · fix: ' + d.fix));
}
const t0 = performance.now();
const q = await compile(`return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), mm(1), { id: 'hub-root' })`);
console.log((performance.now()-t0).toFixed(0)+' ms', q.diagnostics.map(d => d.kind + ': ' + d.message + ' · fix: ' + d.fix));
