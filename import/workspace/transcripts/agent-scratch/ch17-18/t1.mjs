import { compile } from './base.mjs';
const r = await compile("return j.part('p').extrude(j.region.rect(20, 10), mm(5))");
console.log(r.ok, r.program.summary, r.program.bodies[0].topology, r.program.bodies[0].faces.map(f=>f.kind+' '+f.name));
