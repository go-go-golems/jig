import { W } from './lib.mjs';
const code = r => `return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(4, { at: [14, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), mm(${r}), { id: 'hub-root' })`;
for (const r of [2, 1.9]) { const p = (await W.handle({ id: 1, op: 'compile', files: { 'script.js': code(r) } })).program; console.log(r, p.summary.faces, p.diagnostics.map(d => d.kind + ': ' + d.message)); }
