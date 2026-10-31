import { compile } from './base.mjs';
const mk = (exact) => `const pinion = j.lib.gear.spur({ module: mm(2), teeth: 18, width: mm(8) })
const wheel = j.lib.gear.spur({ module: mm(2), teeth: 36, width: mm(8) })
return j.assembly('pair')
  .add('pinion', pinion, { ground: true })
  .add('wheel', wheel, { at: j.tx.move(54, 0, 0).then ? j.tx.move(54, 0, 0) : j.tx.move(54, 0, 0) })
  .interference(${exact ? '{ exact: true }' : ''})`;
for (const ex of [false, true]) {
  const t0 = performance.now();
  const r = await compile(mk(ex));
  const p = r.program;
  if (!r.ok) { console.log(r.error); continue; }
  console.log('exact', ex, ((performance.now() - t0)/1000).toFixed(2) + ' s');
  for (const d of p.decisions.filter(d => d.kind === 'gap')) console.log('  decision', d.at, d.chose, '·', d.reason);
  for (const d of p.diagnostics) console.log('  diag', d.level, d.kind, d.message);
  for (const t of p.trace.filter(t => t.pass === 'interference')) console.log('  trace', t.ms.toFixed(0), 'ms', t.note);
}
