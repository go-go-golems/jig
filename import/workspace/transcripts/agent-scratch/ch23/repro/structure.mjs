// j.structure ignores its arguments; j.laws.check does not shrink; a prop returning true fails
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const r = await W.handle({ id: 1, op: 'run', code: `return {
  group: j.structure(j.Transform, 'group', { op: (a, b) => a.then(b) }).map(l => l.name),
  plainTrue: j.laws.check([j.law('t', r => 1, () => true, { justifies: 'x' })], { n: 2 })[0].ok }` });
console.log(r.value); // { group: ['shape.boolean'], plainTrue: false }
