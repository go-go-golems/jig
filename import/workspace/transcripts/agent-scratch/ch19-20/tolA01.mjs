import { build, oc, K, r6 } from './lib.mjs';
const prog = await build(`return j.part('box')
  .extrude(j.sketch('base', { on: j.plane.XY })
    .rect('outline', 60, 40, { center: true, r: 3 }).profiles(),
    mm(30), { id: 'body' })
  .shell(j.feat('body').endFace(), mm(2), { direction: 'in', id: 'shell' })`);
const b = prog.kernelBodies()[0].body;
const big = b.vertices.list.map((v, i) => [oc.BRep_Tool.Tolerance(v), b.vertexPoint(i)]).filter(x => x[0] > 1e-6);
console.log(big.length, big.map(x => `${x[0]} (${x[1].map(r6)})`).join('\n'));
