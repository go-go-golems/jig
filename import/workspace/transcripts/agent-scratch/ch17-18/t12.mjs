import { build, tally, K, oc, surfType, curveType } from './base.mjs';
const pts = '[[0, 0], [10, 15], [25, 18], [40, 5], [30, -10], [10, -8]]';
const cases = {
  closedInterp: `const sk = j.sketch('s', { on: j.plane.XY }).spline('c', ${pts}, { closed: true })`,
  closedControl: `const sk = j.sketch('s', { on: j.plane.XY }).spline('c', ${pts}, { closed: true, fit: 'control' })`,
  openInterp: `const sk = j.sketch('s', { on: j.plane.XY }).spline('c', [[0, 0], [10, 15], [25, 18], [40, 0]]).line('l', [40, 0], [0, 0])`,
  openControl: `const sk = j.sketch('s', { on: j.plane.XY }).spline('c', [[0, 0], [10, 15], [25, 18], [40, 0]], { fit: 'control' }).line('l', [40, 0], [0, 0])`,
};
for (const [k, sk] of Object.entries(cases)) {
  const { bodies, data } = await build(sk + `\nreturn j.part('p').extrude(sk.profiles(), mm(10), { id: 'e' })`);
  const b = bodies[0];
  const area = data.sketches[0]?.profiles?.map(p => p.area);
  console.log(k, 'sketch area', area, 'kernel vol/10', b ? (b.volume() / 10).toFixed(4) : null, b && JSON.stringify(tally(b)));
  if (!b) { console.log(data.diagnostics); continue; }
  b.edges.list.forEach(e => { if (curveType(e) === 'BSplineCurve') { const ad = new oc.BRepAdaptor_Curve(e); const h = ad.BSpline(); const c = h.get ? h.get() : h; console.log('   bspline deg', c.Degree(), 'poles', c.NbPoles(), 'knots', c.NbKnots(), 'periodic', c.IsPeriodic(), 'rational', c.IsRational()); ad.delete(); } });
}
