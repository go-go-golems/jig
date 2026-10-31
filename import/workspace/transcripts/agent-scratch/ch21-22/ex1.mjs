import { compile } from './h.mjs';
const src = r => `return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10), { id: 'peg' })
  ${r ? `.fillet(j.feat('peg').edges().where(e => e.concave), mm(${r}), { id: 'root' })` : ''}`;
const p0 = await compile(src(0));
console.log('no fillet', p0.summary.volume, p0.bodies[0].volume, p0.bodies[0].topology);
for (const r of [0.5, 1, 1.5, 2, 2.5, 3]) {
  const p = await compile(src(r));
  const v = p.bodies[0].volume;
  const R = 2.5;
  const A = r*r*(1-Math.PI/4), c = r*(10-3*Math.PI)/(12-3*Math.PI);
  const pap = 2*Math.PI*(R + c)*A;
  console.log(r, 'dV', (v - p0.bodies[0].volume).toFixed(6), 'pappus', pap.toFixed(6), 'faces', p.bodies[0].faces.map(f=>f.name+':'+f.kind).join(' | '), p.diagnostics.map(d=>d.kind+' '+d.message));
}
