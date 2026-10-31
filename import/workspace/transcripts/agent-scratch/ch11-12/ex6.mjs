import { sketch, c, analyse, SV, rowsOf } from './h.mjs';
// FD error of jig's five-point Jacobian against the analytic gradient, for a length and a parallel residual
function test(ox, L, ang = Math.atan2(4, 3)) {
  const a = [ox, ox], b = [ox + L * Math.cos(ang), ox + L * Math.sin(ang)];
  const b2 = [ox + L, ox + 7], a2 = [ox + 0, ox + 7];  // second line, for parallel (not parallel: residual nonzero)
  const sk = sketch('t').line('l', a, b).line('m', a2, b2)
    .constrain(c.parallel('l', 'm')).dim('l', L * 1.0001);
  const sys = sk.system({});
  const eqs = sys.cons.flatMap(r => r.eqs);
  const cols = [...Array(8).keys()];
  const F = SV.makeProblem(Float64Array.from(sys.x), eqs, cols);
  const J = rowsOf(F.jac(F.get()), eqs.length, 8);
  // analytic
  const u = [b[0] - a[0], b[1] - a[1]], v = [b2[0] - a2[0], b2[1] - a2[1]];
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  const lenRow = [-u[0] / lu, -u[1] / lu, u[0] / lu, u[1] / lu, 0, 0, 0, 0];
  // g = cross(u,v)/(|u||v|);  dg/du = (v_y, -v_x)/(|u||v|) - g u/|u|^2 ; dg/dv = (-u_y, u_x)/(|u||v|) - g v/|v|^2
  const g = (u[0] * v[1] - u[1] * v[0]) / (lu * lv);
  const du = [v[1] / (lu * lv) - g * u[0] / lu ** 2, -v[0] / (lu * lv) - g * u[1] / lu ** 2];
  const dv = [-u[1] / (lu * lv) - g * v[0] / lv ** 2, u[0] / (lu * lv) - g * v[1] / lv ** 2];
  const parRow = [-du[0], -du[1], du[0], du[1], -dv[0], -dv[1], dv[0], dv[1]];
  const names = sys.cons.map(r => r.type);
  const err = (row, an) => Math.max(...row.map((x, k) => Math.abs(x - an[k])));
  const out = {};
  sys.cons.forEach((r, i) => { out[r.type] = err(J[i], r.type === 'length' ? lenRow : parRow); });
  console.log(`origin ${ox}, L ${L}: h = ${1e-4 * Math.max(1, ox)}  length err ${out.length.toExponential(2)}  parallel err ${out.parallel.toExponential(2)}  |par row| ${Math.hypot(...parRow).toExponential(2)}`);
}
for (const [o, L] of [[0, 50], [0, 5], [1000, 50], [1000, 5], [1000, 1], [10000, 1]]) test(o, L);
