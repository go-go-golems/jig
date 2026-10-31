import { W, r6 } from './lib.mjs';
const blocks = {
three: `return j.part('p')
  .add(j.sphere(mm(10)), { id: 'ball' })
  .add(j.cone(mm(10), mm(0), mm(15)),
    { id: 'cone', at: j.tx.move(30, 0, -10) })
  .add(j.torus(mm(10), mm(3)), { id: 'ring', at: j.tx.move(65, 0, 0) })`,
shellbox: `return j.part('box')
  .extrude(j.sketch('base', { on: j.plane.XY })
    .rect('outline', 60, 40, { center: true, r: 3 }).profiles(),
    mm(30), { id: 'body' })
  .shell(j.feat('body').endFace(), mm(2), { direction: 'in', id: 'shell' })`,
};
for (const [k, code] of Object.entries(blocks)) {
  const t0 = performance.now();
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': code } });
  const p = r.program;
  console.log(k, r.ok, Math.round(performance.now() - t0), 'ms', p.bodies.map(b => `${b.id} ${JSON.stringify(b.topology)} ${r6(b.volume?.value ?? b.volume)}`).join(' | '), p.diagnostics.map(d => d.kind + ' ' + d.message));
  console.log('  ', p.bodies.flatMap(b => b.faces.map(f => f.name)).join(' | '));
}
