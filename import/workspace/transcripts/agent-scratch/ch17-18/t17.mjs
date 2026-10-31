import { K, oc } from './base.mjs';
const G = await import('/home/claude/jigcad/src/engine/gears.js');
const S = await import('/home/claude/jigcad/src/engine/shapes.js');
const inv = a => Math.tan(a) - a;
for (const [m, z, samples] of [[2, 18, 10], [2, 36, 10], [1, 12, 10], [2, 18, 20], [2,18,5]]) {
  const alpha = 20 * Math.PI / 180;
  const T = G.toothFlank({ m, z, alpha, x: 0, ds: 0, samples });
  const rb = T.rb, rp = T.rp, p = Math.PI * m, sp = p / 2;
  const psi = sp / (2 * rp) + inv(alpha);
  const thInv = r => psi - inv(Math.acos(Math.min(1, rb / r)));
  const pts = T.involute.map(([r, th]) => [r * Math.cos(th), r * Math.sin(th), 0]);
  const r = K.scope();
  const curve = S.interpolate3d(pts, false, r);
  const c = curve.get ? curve.get() : curve;
  const f = c.FirstParameter(), l = c.LastParameter();
  let maxd = 0, at = 0;
  const N = 4000;
  for (let k = 0; k <= N; k++) {
    const P = c.Value(f + (l - f) * k / N); const x = P.X(), y = P.Y(); P.delete();
    const rr = Math.hypot(x, y), th = Math.atan2(y, x);
    // normal distance to the involute at this radius: arc error r·Δθ projected on the normal (cos of the pressure angle at r)
    const phi = Math.acos(Math.min(1, rb / rr));
    const d = Math.abs(rr * (th - thInv(rr))) * Math.cos(phi);
    if (d > maxd) { maxd = d; at = rr; }
  }
  console.log(`m=${m} z=${z} samples=${samples}: rb=${rb.toFixed(3)} form r=${T.formRadius.toFixed(3)} tip r=${T.ra.toFixed(3)} poles=${c.NbPoles()} knots=${c.NbKnots()} deg=${c.Degree()} max normal deviation ${maxd.toExponential(2)} mm at r=${at.toFixed(3)}`);
  r.free();
}
