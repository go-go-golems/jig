import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const src = (X, s) => `const X = ${X}, sz = ${s}
return j.sketch('q', { on: j.plane.XY })
  .line('l1', [X, X], [X + 2 * sz, X])
  .line('l2', 'l1.end', [X + 2 * sz, X + sz])
  .line('l3', 'l2.end', [X, X + sz])
  .line('l4', 'l3.end', 'l1.start')
  .constrain(j.c.fix('l1.start'), j.c.horizontal('l1'), j.c.horizontal('l3'),
    j.c.vertical('l2'), j.c.vertical('l4'),
    j.c.angle('l1', 'l2', deg(90)))
  .dim('l1', 2 * sz).dim('l2', sz)`;
for (const s of [10, 1, 0.5, 0.1]) for (const X of [0, 100, 300, 1000, 3000, 10000, 30000]) {
  const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': src(X, s) } });
  const sk = r.program.sketches?.[0];
  const red = sk.constraints.filter(c => c.status === 'redundant').map(c => c.kind);
  console.log(`s=${s} X=${X}: dof ${sk.dof} ${sk.status} redundant: ${red.join(',')}`);
}
