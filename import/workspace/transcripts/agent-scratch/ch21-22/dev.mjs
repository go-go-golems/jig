import { prog, K } from './h.mjs';
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const V = K.V;
function sample(m, f) {
  const P = m.positions, I = m.indices; let mx = 0, vol = 0;
  for (let t = 0; t < I.length; t += 3) {
    const v = [0,1,2].map(k => [P[I[t+k]*3], P[I[t+k]*3+1], P[I[t+k]*3+2]]);
    for (const [u, w] of [[1/3,1/3],[0.5,0],[0,0.5],[0.5,0.5],[0.25,0.25],[0.5,0.25],[0.25,0.5]]) {
      const p = V.add(v[0], V.add(V.mul(V.sub(v[1], v[0]), u), V.mul(V.sub(v[2], v[0]), w)));
      const d = f(p); if (d > mx) mx = d;
    }
    vol += V.dot(v[0], V.cross(v[1], v[2])) / 6;
  }
  return { mx, vol, tris: I.length / 3 };
}
// sphere
for (const R of [5, 20]) {
  const pr = await prog(`return j.part('s').add(j.sphere(mm(${R})), { id: 's' })`);
  const { body } = pr.kernelBodies()[0];
  for (const opt of [{}, { deflection: 0.05, angular: 3 }, { deflection: 0.2, angular: 3 }]) {
    body._mesh = null; const m = M.meshBody(body, opt);
    const s = sample(m, p => Math.max(0, R - V.len(p)));
    const ex = 4/3*Math.PI*R**3;
    console.log('sphere R', R, JSON.stringify(opt), 'defl', m.deflection.toFixed(4), 'tris', s.tris, 'max dev', s.mx.toFixed(5), 'vol', s.vol.toFixed(3), 'exact', ex.toFixed(3), 'rel loss', ((ex - s.vol)/ex).toExponential(3));
  }
}
// cylinder
for (const R of [2.5, 40]) {
  const pr = await prog(`return j.part('c').extrude(j.region.circle(${R}), mm(10), { id: 'c' })`);
  const { body } = pr.kernelBodies()[0];
  for (const opt of [{}, { deflection: 0.05, angular: 3 }]) {
    body._mesh = null; const m = M.meshBody(body, opt);
    const s = sample(m, p => Math.max(0, R - Math.hypot(p[0], p[1])));
    const ex = Math.PI*R*R*10;
    // n from ring
    const ring = new Set(); const P = m.positions; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i+2] - 10) < 1e-6) ring.add(P[i].toFixed(4)+','+P[i+1].toFixed(4));
    const n = ring.size; const pred = 1 - Math.sin(2*Math.PI/n)/(2*Math.PI/n);
    console.log('cyl R', R, JSON.stringify(opt), 'defl', m.deflection.toFixed(4), 'n', n, 'max dev', s.mx.toFixed(5), 'sagitta', (R*(1-Math.cos(Math.PI/n))).toFixed(5), 'vol', s.vol.toFixed(4), 'exact', ex.toFixed(4), 'loss', (ex - s.vol).toFixed(4), 'pred loss', (ex*pred).toFixed(4), 'rel', ((ex - s.vol)/ex).toExponential(4), 'pred rel', pred.toExponential(4), '4/3 d/r', (4/3*R*(1-Math.cos(Math.PI/n))/R).toExponential(4));
  }
}
