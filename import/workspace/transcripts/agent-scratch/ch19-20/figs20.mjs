import { W, r6 } from './lib.mjs';
const blocks = {
cubes: `return j.part('p')
  .extrude(j.region.rect(20, 20), mm(20), { id: 'a' })
  .extrude(j.region.rect(20, 20, { at: [19.55, 0] }), mm(20), { id: 'b' })`,
hub: `return j.part('p')
  .params({ r: mm(1) })
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5),
    { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] })
    .on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), 'r',
    { id: 'hub-root' })`,
};
for (const [k, code] of Object.entries(blocks)) {
  const t0 = performance.now();
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': code } });
  const p = r.program;
  console.log(k, r.ok, Math.round(performance.now() - t0), 'ms', p.bodies.map(b => `${b.id} ${JSON.stringify(b.topology)}`).join(' | '), r6(p.summary.volume), p.diagnostics.map(d => d.kind + ' ' + d.message + ' fix ' + d.fix));
  console.log('  ', p.bodies.flatMap(b => b.faces.map(f => f.name)).join(' | '));
  console.log('  ', p.decisions.map(d => `${d.at} ${d.kind} ${d.chose}`).join('; '));
}
