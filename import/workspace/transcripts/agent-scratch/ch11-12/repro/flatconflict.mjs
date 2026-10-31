// a 30-40-60 triangle (solvable) drawn with its three corners on a line is reported as
// sketch.overConstrained with a "minimal conflicting set"; lifting the middle corner by 0.001 mm solves it.
import { run } from './_h.mjs';
for (const by of [0, 0.001]) await run(`return j.sketch('flat')
  .polyline('t', [[0, 0], [30, ${by}], [70, 0]], { closed: true })
  .constrain(j.c.fix('t.1.start'), j.c.horizontal('t.3'))
  .dim('t.1', 30).dim('t.2', 40).dim('t.3', 60)`);
