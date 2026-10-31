import { W, r6 } from './lib.mjs';
const src = op => `return j.part('p')
  .extrude(j.region.rect(40, 30), mm(20), { id: 'block' })
  .extrude(j.region.circle(12, { at: [20, 0] })
    .on(j.plane.offset(j.plane.XY, -5)), mm(30), { id: 'post', op: '${op}' })`;
for (const op of ['join', 'cut']) {
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': src(op) } });
  const p = r.program;
  console.log(`== ${op}: faces ${p.summary.faces} vol ${r6(p.summary.volume)} topo ${JSON.stringify(p.bodies[0].topology)}`);
  for (const f of p.bodies[0].faces) console.log(`  ${f.name}  ${f.kind} ${r6(f.area)}`);
  for (const d of p.diagnostics) console.log('  diag', d.kind, d.message);
  for (const d of p.decisions) console.log('  decision', d.at, d.kind, d.chose);
  const e = await W.handle({ id: 2, op: 'call', method: 'edges', args: [`j.sel.edges('all')`] });
  if (e.ok) console.log('  edges:', JSON.stringify(e.value).slice(0, 1500));
  else console.log('  edges err', e.error?.message);
  const w = await W.handle({ id: 3, op: 'call', method: 'why', args: ['block/side[rect.right]#a'] });
  console.log('  why', JSON.stringify(w.value ?? w.error).slice(0, 600));
}
