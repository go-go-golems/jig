import { S, incidence, genericIncidence, dm, report } from './dm.mjs';
const { sketch, c } = S;
const tri = sketch('tri').line('a', [0, 0], [40, 0]).line('b', 'a.end', [10, 25]).line('c', 'b.end', 'a.start')
  .constrain(c.fix('a.start'), c.horizontal('a')).dim('a', 40).dim('b', 35).dim('c', 25);
console.log('--- triangle, declared vars'); let inc = incidence(tri); report(inc, dm(inc), { verbose: false });
console.log('--- triangle, generic pattern'); inc = genericIncidence(tri); report(inc, dm(inc));
const outline = () => sketch('outline').polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'), c.vertical('p.4'), c.horizontal('p.5'), c.vertical('p.6'));
console.log('--- outline 3 DOF'); inc = genericIncidence(outline().dim('p.1', 60)); report(inc, dm(inc));
console.log('--- outline fully + parallel'); inc = genericIncidence(outline().constrain(c.parallel('p.1', 'p.3')).dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8)); report(inc, dm(inc));
console.log('--- outline fully + conflicting dim p.3'); inc = genericIncidence(outline().dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8).dim('p.3', 50)); report(inc, dm(inc));
