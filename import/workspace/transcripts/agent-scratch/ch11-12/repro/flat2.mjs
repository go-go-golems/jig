import { run } from './_h.mjs';
const body = `.polyline('t', [[0, 0], [30, 0], [70, 0]], { closed: true })
  .constrain(j.c.fix('t.1.start'), j.c.horizontal('t.3'))
  .dim('t.1', 30).dim('t.2', 40).dim('t.3', 60)`;
console.log('no plane'); await run(`return j.sketch('flat')${body}`);
console.log('XY'); await run(`return j.sketch('flat', { on: j.plane.XY })${body}`);
console.log('no plane again'); await run(`return j.sketch('flat')${body}`);
