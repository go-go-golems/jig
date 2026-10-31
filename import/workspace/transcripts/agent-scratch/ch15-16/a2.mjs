import { compile } from './lib.mjs';
const code = `return j.sketch('two', { on: j.plane.XY })
  .rect('a', 30, 20)
  .rect('b', 40, 20, { at: [50, 0] })
  .dim('b.top', 36)`;
const p = await compile(code);
const sk = p.sketches[0];
console.log(sk.dump);
console.log(JSON.stringify(sk.clusters));
console.log(p.diagnostics.map(d => `${d.level} ${d.kind} at ${d.at}: ${d.message} | ${d.fix}`).join('\n'));
console.log(sk.profiles.map(x => `${x.id} ${x.area}`));
