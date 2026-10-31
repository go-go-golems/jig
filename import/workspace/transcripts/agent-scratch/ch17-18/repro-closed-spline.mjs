// Closed sketch splines: the kernel interpolates the points themselves (GeomAPI_Interpolate, periodic),
// whatever `fit` says; the sketch draws a uniform B-spline (fit: 'control') or a centripetal Catmull-Rom ('interp').
import { compile } from './base.mjs';
const pts = '[[0, 0], [10, 15], [25, 18], [40, 5], [30, -10], [10, -8]]';
for (const fit of ['control', 'interp']) {
  const r = await compile(`const sk = j.sketch('s', { on: j.plane.XY })
  .spline('c', ${pts}, { closed: true, fit: '${fit}' })
return j.part('p').extrude(sk.profiles(), mm(10), { id: 'e' })`);
  const p = r.program;
  console.log(fit, 'sketch profile area', p.sketches[0].profiles[0].area.toFixed(2), 'mm² · kernel volume / 10 mm', (p.bodies[0].volume / 10).toFixed(2), 'mm²');
}
// prints: control 618.53 vs 908.34; interp 871.46 vs 908.34
