import { S, incidence, dm, report } from './dm.mjs';
const { sketch, c } = S;
const tri = sketch('tri').line('a', [0, 0], [40, 0]).line('b', 'a.end', [10, 25]).line('c', 'b.end', 'a.start')
  .constrain(c.fix('a.start'), c.horizontal('a')).dim('a', 40).dim('b', 35).dim('c', 25);
let inc = incidence(tri); report(inc, dm(inc));
const sol = tri.solve();
console.log(sol.ir());
