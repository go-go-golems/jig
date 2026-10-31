import { prog, K, getOC } from './h.mjs';
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const src = `return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })`;
const pr = await prog(src);
const { body } = pr.kernelBodies()[0];
const oc = getOC();
// exact
const gp = new oc.GProp_GProps();
oc.BRepGProp.VolumeProperties(body.shape, gp, false, false, false);
const c = gp.CentreOfMass();
const mom = d => { const ax = new oc.gp_Ax1(c, new oc.gp_Dir(d[0], d[1], d[2])); const v = gp.MomentOfInertia(ax); ax.delete(); return v; };
const ex = { V: gp.Mass(), c: [c.X(), c.Y(), c.Z()], I: [[mom([1,0,0]),0,0],[0,mom([0,1,0]),0],[0,0,mom([0,0,1])]] };
console.log('exact V', ex.V.toFixed(6), 'c', ex.c.map(x => x.toFixed(6)), 'Ixx', ex.I[0][0].toFixed(3), 'Izz', ex.I[2][2].toFixed(3));
function meshProps(m) {
  const P = m.positions, I = m.indices; let V = 0; const s = [0,0,0]; const C = [[0,0,0],[0,0,0],[0,0,0]];
  for (let t = 0; t < I.length; t += 3) {
    const v = [0,1,2].map(k => [P[I[t+k]*3], P[I[t+k]*3+1], P[I[t+k]*3+2]].map(Number));
    const [a, b, cc] = v;
    const det = a[0]*(b[1]*cc[2]-b[2]*cc[1]) - a[1]*(b[0]*cc[2]-b[2]*cc[0]) + a[2]*(b[0]*cc[1]-b[1]*cc[0]);
    const vol = det / 6; V += vol;
    for (let i = 0; i < 3; i++) s[i] += vol * (a[i]+b[i]+cc[i]) / 4;
    const sum = [0,1,2].map(i => a[i]+b[i]+cc[i]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += vol / 20 * (a[i]*a[j] + b[i]*b[j] + cc[i]*cc[j] + sum[i]*sum[j]);
  }
  const cen = s.map(x => x / V);
  // inertia about centroid (unit density)
  const Cc = C.map((r, i) => r.map((x, j) => x - V * cen[i] * cen[j]));
  const tr = Cc[0][0] + Cc[1][1] + Cc[2][2];
  const In = Cc.map((r, i) => r.map((x, j) => (i === j ? tr : 0) - x));
  return { V, c: cen, I: In };
}
for (const d of [undefined, 0.2, 0.05, 0.01, 0.002]) {
  body._mesh = null;
  const m = M.meshBody(body, d ? { deflection: d } : {});
  const mp = meshProps(m);
  console.log('mesh defl', m.deflection, 'tris', m.indices.length / 3, 'V', mp.V.toFixed(4), 'dV', (mp.V - ex.V).toFixed(4), 'rel', ((mp.V - ex.V) / ex.V).toExponential(3), 'cz', mp.c[2].toFixed(5), 'dcz', (mp.c[2] - ex.c[2]).toExponential(2), 'Ixx', mp.I[0][0].toFixed(3), 'Izz', mp.I[2][2].toFixed(3), 'dIzz rel', ((mp.I[2][2] - ex.I[2][2]) / ex.I[2][2]).toExponential(2));
}
// with angular disabled
body._mesh = null;
const m2 = M.meshBody(body, { deflection: 0.05, angular: 3 });
const mp2 = meshProps(m2);
console.log('defl 0.05 ang 3: tris', m2.indices.length/3, 'dV', (mp2.V - ex.V).toFixed(4));
console.log('area exact', K.surfaceProps(body.shape).area);
