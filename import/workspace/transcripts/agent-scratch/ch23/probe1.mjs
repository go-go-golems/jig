import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const t0 = performance.now();
const W = await import('/home/claude/jigcad/src/engine/worker.js');
const t1 = performance.now();
const ri = await W.handle({ id: 0, op: 'init' });
const t2 = performance.now();
console.log('import ms', (t1-t0).toFixed(0), 'init', JSON.stringify(ri), 'init wall ms', (t2-t1).toFixed(0));
const r = await W.handle({ id: 1, op: 'run', code: `
  const res = j.laws.check(j.laws.suite, { n: 8, seed: 1 });
  return res.map(r => [r.law, r.tier, r.ok, r.n, r.source]);
` });
console.log(JSON.stringify(r, null, 1));
console.log(process.memoryUsage());
