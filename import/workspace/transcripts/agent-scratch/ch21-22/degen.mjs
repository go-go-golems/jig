import { prog, getOC, K } from './h.mjs';
const pr = await prog(`return j.part('b').extrude(j.region.rect(40, 30), mm(20), { id: 'box' }).fillet(j.feat('box').edges(), mm(3), { id: 'round' })`);
const oc = getOC();
const { body } = pr.kernelBodies()[0];
let deg = 0;
for (const e of body.edges.list) if (oc.BRep_Tool.Degenerated(K.castTo(e, 'EDGE'))) deg++;
console.log('edges', body.edges.list.length, 'degenerate', deg, body.topology());
