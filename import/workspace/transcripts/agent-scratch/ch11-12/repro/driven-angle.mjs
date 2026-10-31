// a driven angle at a 30° polyline corner reads 150° (angle between direction vectors); the conflict
// fix for an angle quotes the same exterior value ("make dim(t.3, t.1) driven (it measures 150°)").
import { run } from './_h.mjs';
await run(`return j.sketch('tri').polyline('t', [[0, 0], [40, 0], [40, 23]], { closed: true })
  .dim(['t.1', 't.2'], deg(90)).dim(['t.2', 't.3'], deg(60)).dim(['t.3', 't.1'], deg(31))`);
