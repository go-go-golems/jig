import { prog, K } from './h.mjs';
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const ringCount = (m, z) => { const s = new Set(); const P = m.positions; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i+2] - z) < 1e-6) s.add(P[i].toFixed(4) + ',' + P[i+1].toFixed(4)); return s.size; };
const nLin = (r, e) => Math.ceil(Math.PI / Math.acos(1 - e / r));
console.log('r | default lin | n measured | n linear-only | n angular-only (2pi/0.3) | sagitta at measured n');
for (const R of [0.5, 1, 2.5, 5, 10, 20, 40, 80]) {
  const pr = await prog(`return j.part('c').extrude(j.region.circle(${R}), mm(10), { id: 'c' })`);
  const { body } = pr.kernelBodies()[0];
  const m = M.meshBody(body);
  const n = ringCount(m, 10);
  console.log(R, m.deflection.toFixed(4), n, nLin(R, m.deflection), Math.ceil(2*Math.PI/0.3), (R*(1-Math.cos(Math.PI/n))).toFixed(5));
}
console.log('fixed deflection 0.05, angular 0.3 vs angular large');
for (const R of [0.5, 1, 2.5, 5, 10, 20, 40]) {
  const pr = await prog(`return j.part('c').extrude(j.region.circle(${R}), mm(10), { id: 'c' })`);
  const { body } = pr.kernelBodies()[0];
  const a = ringCount(M.meshBody(body, { deflection: 0.05, angular: 0.3 }), 10);
  body._mesh = null;
  const b = ringCount(M.meshBody(body, { deflection: 0.05, angular: 3 }), 10);
  body._mesh = null;
  const c = ringCount(M.meshBody(body, { deflection: 0.01, angular: 3 }), 10);
  console.log(R, 'ang0.3:', a, ' ang3:', b, ' formula(0.05):', nLin(R, 0.05), ' eps0.01 ang3:', c, ' formula(0.01):', nLin(R, 0.01));
}
