import { sketch, c, deg, mm } from './h.mjs';
const base = () => sketch('k', { mode: 'constrained' })
  .point('p', [5, 12]).point('q', [25, 12])
  .line('l1', [0, 0], [30, 0]).line('l2', [32, 1], [33, 20]).line('l3', [0, 30], [30, 31])
  .circle('c1', 5, { at: [50, 5] }).circle('c2', 3, { at: [51, 6] })
  .arc('a1', { center: [70, 0], start: [75, 0], end: [70, 5] })
  .ellipse('e1', 6, 3, { at: [90, 0] }).ellipse('e2', 5, 2, { at: [110, 0] });
const cases = [
  ['coincident pt-pt', c.coincident('p', 'q')], ['coincident pt-line', c.coincident('p', 'l1')], ['coincident circ-circ', c.coincident('c1', 'c2')],
  ['horizontal line', c.horizontal('l2')], ['horizontal 2pts', c.horizontal('p', 'l2.end')], ['vertical line', c.vertical('l1')],
  ['parallel', c.parallel('l1', 'l3')], ['perpendicular', c.perpendicular('l1', 'l2')], ['collinear', c.collinear('l1', 'l3')],
  ['tangent line-circle', c.tangent('l3', 'c1')], ['tangent circ-circ', c.tangent('c1', 'c2')], ['tangent line-line', c.tangent('l1', 'l3')],
  ['concentric', c.concentric('c1', 'a1')], ['equal lines', c.equal('l1', 'l3')], ['equal circles', c.equal('c1', 'a1')], ['equal ellipses', c.equal('e1', 'e2')],
  ['symmetric pts/line', c.symmetric('p', 'q', 'l2')], ['symmetric pts/point', c.symmetric('p', 'q', 'l1.mid')], ['symmetric lines', c.symmetric('l1', 'l3', 'l2')], ['symmetric circles', c.symmetric('c1', 'c2', 'l2')],
  ['midpoint line', c.midpoint('p', 'l1')], ['midpoint arc', c.midpoint('p', 'a1')], ['on line', c.on('p', 'l1')], ['on circle', c.on('p', 'c1')], ['on arc', c.on('p', 'a1')], ['on ellipse', c.on('p', 'e1')],
  ['fix point', c.fix('p')], ['fix line', c.fix('l1')], ['fix circle', c.fix('c1')], ['fix arc', c.fix('a1')], ['fix ellipse', c.fix('e1')],
  ['distance pt-pt', c.distance('p', 'q', 10)], ['distance pt-line', c.distance('p', 'l1', 10)], ['distance line-line', c.distance('l1', 'l3', 10)], ['distance pt-circle', c.distance('p', 'c1', 10)], ['distance circ-circ', c.distance('c1', 'c2', 10)], ['distance line-circle', c.distance('l1', 'c1', 10)],
  ['distanceX', c.distanceX('p', 'q', 10)], ['distanceY', c.distanceY('p', 'q', 10)], ['length line', c.length('l1', 20)], ['length arc', c.length('a1', 9)],
  ['radius', c.radius('c1', 4)], ['diameter', c.diameter('c1', 8)], ['angle', c.angle('l1', 'l2', deg(80))],
];
for (const [nm, k] of cases) {
  const S = base().constrain(k).solve({});
  const eqLine = S.ir().split('\n')[2].trim();
  const errs = S.diagnostics.filter(d => d.level === 'error').map(d => d.kind + ' ' + d.message);
  console.log(nm.padEnd(22), eqLine.replace(/\s+Σ.*/, '').replace('equations  ', ''), '| rank', S.rank, errs.join(' '));
}
