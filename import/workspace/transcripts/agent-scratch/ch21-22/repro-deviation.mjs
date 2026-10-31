// STL/3MF reports "max deviation 0.050 mm" (the deflection parameter); the mesh of a Ø10 sphere deviates 0.099 mm
import { compile, exp, prog, K } from './h.mjs';
const M = await import('/home/claude/jigcad/src/engine/mesh.js');
const src = `return j.part('s').add(j.sphere(mm(5)), { id: 's' })`;
await compile(src); console.log((await exp('stl', {})).report.approximated);
const { body } = (await prog(src)).kernelBodies()[0]; const m = M.meshBody(body); const P = m.positions, I = m.indices, V = K.V;
let mx = 0; for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map(k => [P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]]);
  for (let a = 0; a <= 12; a++) for (let b = 0; a + b <= 12; b++) { const p = V.add(v[0], V.add(V.mul(V.sub(v[1], v[0]), a / 12), V.mul(V.sub(v[2], v[0]), b / 12))); mx = Math.max(mx, 5 - V.len(p)); } }
console.log('measured max distance from the sphere', mx.toFixed(4), 'mm');
