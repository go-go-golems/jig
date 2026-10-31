import { compile } from './h.mjs';
const src = lead => `const peg = j.part('peg')
  .extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10),
    { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })
const collar = j.part('collar')
  .extrude(j.region.circle(8), mm(4), { id: 'ring' })
  .hole([[0, 0]], j.hole.simple(mm(5.3)), { id: 'bore' })
  ${lead ? `.chamfer(j.feat('bore').edges().where(e => e.center.z < 0.1), mm(${lead}), { id: 'lead-in' })` : ''}
return j.assembly('a').add('peg', peg, { ground: true })
  .add('collar', collar, { at: j.tx.move(0, 0, 3.2) }).interference()`;
for (const l of [0, 1, 1.2]) {
  const t0 = performance.now();
  const p = await compile(src(l));
  console.log(l, (performance.now() - t0).toFixed(0), 'ms', p.decisions.filter(d => d.kind === 'gap').map(d => d.chose + ' · ' + d.reason).join(), p.diagnostics.map(d => d.kind + ': ' + d.message).join(), p.trace.filter(t => t.pass === 'interference').map(t => t.note).join());
}
