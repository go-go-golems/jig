import { compile } from './h.mjs';
const base = `j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })`;
const v = async s => { const p = await compile('return ' + s); return { v: p.bodies[0].volume, p }; };
const v0 = (await v(base)).v;
console.log('v0', v0.toFixed(9));
const R = 2.5, r = 1;
const A = r*r*(1-Math.PI/4), c = r*(10-3*Math.PI)/(12-3*Math.PI);
// concave root
let x = await v(base + `.fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })`);
console.log('root', (x.v - v0).toFixed(9), (2*Math.PI*(R+c)*A).toFixed(9), 'c', c, 'A', A);
// convex top
x = await v(base + `.fillet(j.feat('peg').endFace().edges(), mm(1), { id: 'top' })`);
console.log('top', (x.v - v0).toFixed(9), (-2*Math.PI*(R-c)*A).toFixed(9), x.p.bodies[0].faces.map(f=>f.name+':'+f.kind).join(' | '));
// chamfer top 0.5
x = await v(base + `.chamfer(j.feat('peg').endFace().edges(), mm(0.5), { id: 'tip' })`);
const d = 0.5;
console.log('chamfer top', (x.v - v0).toFixed(9), (-2*Math.PI*(R-d/3)*d*d/2).toFixed(9), x.p.bodies[0].faces.map(f=>f.name+':'+f.kind).join(' | '));
// chamfer root 1
x = await v(base + `.chamfer(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'rc' })`);
console.log('chamfer root', (x.v - v0).toFixed(9), (2*Math.PI*(R+1/3)*1/2).toFixed(9), x.p.bodies[0].faces.map(f=>f.name+':'+f.kind).join(' | '));
// both root and top, decisions
x = await v(base + `.fillet(j.feat('peg').edges(), mm(1), { id: 'both' })`);
console.log('both', (x.v - v0).toFixed(9), (2*Math.PI*(R+c)*A - 2*Math.PI*(R-c)*A).toFixed(9), JSON.stringify(x.p.decisions.filter(d=>d.kind.startsWith('fillet'))));
console.log(x.p.diagnostics);
