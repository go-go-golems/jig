import { prog, K } from './h.mjs';
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const V = K.V;
for (const R of [2.5, 5, 10, 20]) {
  const pr = await prog(`return j.part('s').add(j.sphere(mm(${R})), { id: 's' })`);
  const { body } = pr.kernelBodies()[0];
  const m = M.meshBody(body);
  const P = m.positions, I = m.indices; let mx = 0, at = null, tri = null;
  const N = 12;
  for (let t = 0; t < I.length; t += 3) {
    const v = [0,1,2].map(k => [P[I[t+k]*3], P[I[t+k]*3+1], P[I[t+k]*3+2]]);
    for (let a = 0; a <= N; a++) for (let b = 0; a + b <= N; b++) {
      const p = V.add(v[0], V.add(V.mul(V.sub(v[1], v[0]), a/N), V.mul(V.sub(v[2], v[0]), b/N)));
      const d = R - V.len(p); if (d > mx) { mx = d; at = p; tri = v; }
    }
  }
  const lat = Math.asin(at[2] / V.len(at)) * 180 / Math.PI;
  const edges = [[0,1],[1,2],[2,0]].map(([i,j]) => V.len(V.sub(tri[i], tri[j])).toFixed(3));
  console.log('sphere R', R, 'defl', m.deflection.toFixed(4), 'tris', I.length/3, 'max dev', mx.toFixed(5), 'at latitude', lat.toFixed(1), 'triangle edges', edges.join(' '));
}
