import { S, genericIncidence, dm, report } from './dm.mjs';
const { sketch, c } = S;
const sk = sketch('outline').polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'), c.vertical('p.4'), c.horizontal('p.5'), c.vertical('p.6'))
  .dim('p.1', 60).dim('p.6', 40).dim('p.2', 8).dim('p.5', 8);
const inc = genericIncidence(sk); report(inc, dm(inc), { verbose: false });
