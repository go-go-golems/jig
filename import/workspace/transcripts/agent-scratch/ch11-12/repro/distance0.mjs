// distance(b, a, 0) between points: b is pinned to the fixed a, but jig reports DOF 1 (drawn apart)
// or "implied by the other constraints; dropped" and DOF 2 (drawn on a). coincident gives DOF 0.
import { run } from './_h.mjs';
for (const at of ['[10, 5]', '[0, 0]']) await run(`return j.sketch('s').point('a', [0, 0]).point('b', ${at})
  .constrain(j.c.fix('a'), j.c.distance('b', 'a', 0))`);
await run(`return j.sketch('s').point('a', [0, 0]).point('b', [10, 5]).constrain(j.c.fix('a'), j.c.coincident('b', 'a'))`);
