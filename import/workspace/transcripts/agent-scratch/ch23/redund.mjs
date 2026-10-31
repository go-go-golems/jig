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
    j.c.vertical('l2'), j.c.vertical('l4'), j.c.parallel('l1', 'l3'),
    j.c.angle('l1', 'l2', deg(90)))
  .dim('l1', 2 * sz).dim("l2", sz)`;
for (const [X, s] of [[0, 10], [0, 0.5], [2000, 0.5], [20000, 0.5], [20000, 0.05], [100000, 0.05]]) {
  const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': src(X, s) } });
  const sk = r.program.sketches?.[0]; if (!sk) { console.log(X, s, JSON.stringify(r.error ?? r.program?.diagnostics)); continue; }
  console.log(`X=${X} s=${s}: dof ${sk.dof} ${sk.status}, statuses`, sk.constraints.filter(c => c.status !== 'ok').map(c => `${c.kind}:${c.status}`).join(' '), r.program.diagnostics.map(d => d.kind + ': ' + d.message).join(' | '));
}
