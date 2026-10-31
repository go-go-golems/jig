import { S, genericIncidence, dm, report } from './dm.mjs';
const { sketch, c } = S;
const sk = sketch('outline').polyline('p', [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]], { closed: true })
  .constrain(c.fix('p.1.start'), c.horizontal('p.1'), c.vertical('p.2'), c.horizontal('p.3'), c.vertical('p.4'), c.horizontal('p.5'), c.vertical('p.6'), c.parallel('p.1', 'p.3')).dim('p.1', 60);
const inc = genericIncidence(sk); report(inc, dm(inc), { verbose: false });
const sol = sk.solve(); console.log(sol.ir()); console.log(sol.diagnostics.map(d => `${d.kind}: ${d.message}`).join('\n'));
