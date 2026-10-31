import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const src = (X) => `const X = ${X}
return j.sketch('q', { on: j.plane.XY })
  .line('l1', [X, X], [X + 0.1, X])
  .line('l2', 'l1.end', [X + 0.1, X + 0.065])
  .line('l3', 'l2.end', [X, X + 0.065])
  .line('l4', 'l3.end', 'l1.start')
  .constrain(j.c.fix('l1.start'), j.c.horizontal('l1'), j.c.horizontal('l3'),
    j.c.vertical('l2'), j.c.vertical('l4'),
    j.c.angle('l1', 'l2', deg(90)))
  .dim("l1", 0.1).dim("l2", 0.05)`;
for (const X of [100, 200, 300, 500]) {
  const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': src(X) } });
  const sk = r.program.sketches[0];
  const l2 = sk.entities.find(e => e.id === 'l2');
  console.log(`X=${X}: dof ${sk.dof} ${sk.status}; l2 from ${l2.a} to ${l2.b}, length ${Math.hypot(l2.b[0]-l2.a[0], l2.b[1]-l2.a[1]).toFixed(6)}; profile area ${sk.profiles.map(p=>p.area)}`);
  for (const d of r.program.diagnostics) console.log('   ', d.level, d.kind, d.message);
}
