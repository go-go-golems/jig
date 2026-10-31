import { compile } from './base.mjs';
for (const code of [
  "return j.part('b').add(j.sphere(mm(13)), { id: 'ball' })",
  "return j.part('c').add(j.cone(mm(10), mm(0), mm(20)), { id: 'cone' })",
  "return j.part('t').add(j.torus(mm(20), mm(5)), { id: 't' })",
]) {
  const r = await compile(code);
  console.log(r.program.ir.L4.split('\n')[0], JSON.stringify(r.program.bodies[0].topology));
}
