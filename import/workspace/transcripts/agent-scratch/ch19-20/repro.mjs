// Minimal repros for the chapter 19-20 issues. Run: node /tmp/ch19-20/repro.mjs
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const run = async (label, code) => {
  const p = (await W.handle({ id: 1, op: 'compile', files: { 'script.js': code } })).program;
  console.log(`${label}: ${p.bodies.length} bodies, volume ${p.summary.volume.toFixed(3)}`);
  for (const b of p.bodies) console.log('   ', b.id, JSON.stringify(b.topology));
  for (const d of p.diagnostics) console.log('   ', d.kind, d.message);
};
// 1. degenerate edges counted: sphere G = 1, cone G = 0.5 (should be 0)
await run('sphere', `return j.part('s').add(j.sphere(mm(10)), { id: 'ball' })`);
await run('cone', `return j.part('s').add(j.cone(mm(10), mm(0), mm(15)), { id: 'cone' })`);
// 2+3. hole tangent to the outline: wrong solid (4502.65 mm³ > the 4000 mm³ box) + a disc body; G = 0.5 printed with ✓
await run('tangent hole', `return j.part('p').extrude(j.sketch('s', { on: j.plane.XY })
  .rect('r', 20, 20, { center: true }).circle('c', 4, { at: [6, 0] }).profiles(), mm(10), { id: 'block' })`);
// 4. fillet.tooLarge says r = 1 is too large (largest about 0.992) but r = 1.5 works: only the tangent radius fails
const hub = r => `return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5), { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] }).on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), mm(${r}), { id: 'hub-root' })`;
await run('fillet r=1', hub(1));
await run('fillet r=1.5', hub(1.5));
