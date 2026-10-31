import { W, r6 } from './lib.mjs';
for (const x of process.argv.slice(2)) {
  const code = `return j.part('p').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).circle('c', 4, { at: [${x}, 0] }).profiles(), mm(10), { id: 'block' })`;
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': code } });
  const p = r.program;
  console.log(`x=${x}: ok ${r.ok} bodies ${p.bodies?.length} faces ${p.summary?.faces} vol ${r6(p.summary?.volume)} topo ${JSON.stringify(p.bodies?.[0]?.topology)}`);
  for (const d of p.diagnostics) console.log('   ', d.level, d.kind, d.message);
  console.log('    profiles', JSON.stringify(p.sketches?.[0]?.profiles?.map(q => q.area)));
}
