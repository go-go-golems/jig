import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const r = await W.handle({ id: 1, op: 'run', code: `
  const a = j.structure(j.Transform, 'group', { op: (a, b) => a.then(b) }).map(l => l.name);
  const b = j.structure().map(l => l.name);
  const g = Object.keys(j.gen);
  const fails = j.laws.check([j.law('always.fails', r => ({ x: r() }), ({ x }) => ({ ok: x < 0.3, got: x }), { justifies: 'demo' })], { n: 20, seed: 1 });
  let refused; try { j.law('no.just', r => 1, () => ({ ok: true })) } catch (e) { refused = e.message }
  const boolOnly = j.laws.check(j.laws.suite, { n: 8, seed: 1, only: ['shape.boolean'] });
  const plain = j.laws.check([j.law('bool', r => 1, () => true, { justifies: 'x' })], { n: 2 });
  return { a, b, g, fails, refused, boolOnly, plain };
` });
console.log(JSON.stringify(r.value, null, 1));
