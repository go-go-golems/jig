import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const src = K => `const K = ${K}
const pts = [[0, 0]]
for (let i = 1; i <= K; i++) {
  const [x, y] = pts[i - 1]
  pts.push(i % 2 ? [x + 5.3, y + 0.2] : [x - 0.3, y + 4.6])
}
let cs = [j.c.fix('p.1.start')]
for (let i = 1; i <= K; i++) {
  cs.push(i % 2 ? j.c.horizontal('p.' + i) : j.c.vertical('p.' + i))
}
let sk = j.sketch('stairs', { on: j.plane.XY }).polyline('p', pts)
  .constrain(...cs)
for (let i = 1; i <= K; i++) sk = sk.dim('p.' + i, 5)
return sk`;
for (const K of [10, 20, 40, 80, 160]) {
  let best = Infinity, res;
  for (let rep = 0; rep < 3; rep++) {
    const t = performance.now();
    res = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': src(K) + `\n// ${rep}` } });
    best = Math.min(best, performance.now() - t);
  }
  const s = res.program.sketches[0];
  const dec = res.program.decisions.filter(d => d.kind === 'solver').map(d => d.reason);
  const tr = res.program.trace.filter(t => /sketch/.test(t.pass)).map(t => `${t.pass} ${t.ms?.toFixed?.(1)}ms`);
  console.log(`K=${K} lines: n=${s.n ?? '?'} rank ${s.rank ?? '?'} dof ${s.dof} status ${s.status} compile ${best.toFixed(0)} ms`, dec, tr);
}
