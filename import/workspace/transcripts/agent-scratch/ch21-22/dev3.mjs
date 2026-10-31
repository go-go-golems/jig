import { prog, K } from './h.mjs';
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const V = K.V;
const pr = await prog(`return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })`);
const { body } = pr.kernelBodies()[0];
for (const opt of [{}, { deflection: 0.01 }, {deflection: 0.05, angular: 3}]) {
body._mesh = null;
const m = M.meshBody(body, opt);
const P = m.positions, I = m.indices; const N = 10; const mx = {}; const cnt = {};
for (let t = 0; t < I.length / 3; t++) {
  const fi = body.faceInfo(m.triFace[t]);
  cnt[fi.kind] = (cnt[fi.kind] || 0) + 1;
  const v = [0,1,2].map(k => [P[I[3*t+k]*3], P[I[3*t+k]*3+1], P[I[3*t+k]*3+2]]);
  for (let a = 0; a <= N; a++) for (let b = 0; a + b <= N; b++) {
    const p = V.add(v[0], V.add(V.mul(V.sub(v[1], v[0]), a/N), V.mul(V.sub(v[2], v[0]), b/N)));
    let d = 0; const rho = Math.hypot(p[0], p[1]);
    if (fi.kind === 'cylinder') d = Math.abs(2.5 - rho);
    else if (fi.kind === 'torus') d = Math.abs(Math.hypot(rho - 3.5, p[2] - 4) - 1);
    else if (fi.kind === 'plane') d = 0;
    mx[fi.kind] = Math.max(mx[fi.kind] || 0, d);
  }
}
console.log(JSON.stringify(opt), 'defl', m.deflection, 'tris', I.length/3, 'per kind', JSON.stringify(cnt), 'max dev', JSON.stringify(Object.fromEntries(Object.entries(mx).map(([k, v]) => [k, +v.toFixed(5)]))));
}
