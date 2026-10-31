import { compile, drag, ents } from './lib.mjs';
const A = `return j.sketch('plate', { on: j.plane.XY })
  .rect('r', 60, 30)
  .circle('h1', 3, { at: [12, 15] })
  .circle('h2', 3, { at: [48, 15] })
  .constrain(j.c.fix('h1.center'), j.c.fix('h2.center'))
  .dim('h1', 6).dim('h2', 6)`;
const B = `return j.sketch('plate', { on: j.plane.XY })
  .rect('r', 60, 30)
  .circle('h1', 3, { at: [12, 15] })
  .circle('h2', 3, { at: [48, 15] })
  .constrain(j.c.equal('h1', 'h2'), j.c.horizontal('h1.center', 'h2.center'))
  .dim('h1', 6)
  .constrain(j.c.distanceX('r.bl', 'h1.center', 12),
    j.c.distanceY('r.bl', 'h1.center', 15),
    j.c.distanceX('h1.center', 'h2.center', 36))`;
for (const [name, code] of [['A', A], ['B', B]]) {
  const p = await compile(code);
  const sk = p.sketches[0];
  console.log('==', name); console.log(sk.dump);
  console.log(JSON.stringify(sk.clusters));
  console.log(p.decisions.map(d => `${d.at} ${d.kind} ${d.chose} ${d.reason}`).join('\n'));
  console.log(p.diagnostics.map(d => `${d.level} ${d.kind}: ${d.message} | ${d.fix}`).join('\n'));
}
