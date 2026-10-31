// body.topology() counts degenerate (sphere-pole) edges and derives G from the formula, so residual is always 0
import { prog, getOC, K } from './h.mjs';
const pr = await prog(`return j.part('b').extrude(j.region.rect(40, 30), mm(20), { id: 'box' }).fillet(j.feat('box').edges(), mm(3), { id: 'round' })`);
const { body } = pr.kernelBodies()[0]; const oc = getOC();
const deg = body.edges.list.filter(e => oc.BRep_Tool.Degenerated(K.castTo(e, 'EDGE'))).length;
console.log(body.topology(), 'degenerate edges', deg, '(a rounded box has genus 0)');
