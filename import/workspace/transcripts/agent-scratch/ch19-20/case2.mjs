import { W, r6 } from './lib.mjs';
const src = R => `return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), mm(${R}), { id: 'hub-root' })`;
for (const R of process.argv.slice(2)) {
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': src(R) } });
  const p = r.program;
  const d = p.diagnostics.filter(x => x.level !== 'info').map(x => `${x.kind}: ${x.message}${x.fix ? ' · fix: ' + x.fix : ''}`);
  console.log(`r=${R}: faces ${p.summary.faces} vol ${r6(p.summary.volume)} topo ${JSON.stringify(p.bodies[0]?.topology)} zmax ${p.bodies[0]?.bbox[1][2]}`);
  for (const x of d) console.log('   ', x);
  if (+R !== 1) console.log('    names:', p.bodies[0].faces.map(f => f.name).join(' | '));
}
