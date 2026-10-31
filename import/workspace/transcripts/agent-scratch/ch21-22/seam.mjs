import { compile, call } from './h.mjs';
const p = await compile(`return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })`);
const b = p.bodies[0];
console.log(b.edges.map(e => e.name + ' faces=' + JSON.stringify(e.faces) + ' ' + e.kind));
console.log(b.faces.map((f, i) => i + ' ' + f.name));
const { edgeDihedral } = await import('/home/claude/jigcad/src/engine/compile.js');
const P = await import('/home/claude/jigcad/src/engine/program.js');
const r = await call('edges', "j.feat('peg').edges()");
console.log(JSON.stringify(r).slice(0, 1500));
