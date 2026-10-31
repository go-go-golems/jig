import { build, oc, K } from './lib.mjs';
const prog = await build(`return j.part('p').extrude(j.region.rect(20, 10), mm(5))`);
const kb = prog.kernelBodies();
console.log(kb.length, kb[0].body.names, prog.data.bodies[0].topology);
const s = kb[0].body.shape;
console.log(s.ShapeType(), s.Orientation());
