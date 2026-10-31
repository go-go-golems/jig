import { compile } from './h.mjs';
const res = p => p.diagnostics.length ? p.diagnostics.map(d => d.kind + ': ' + d.message).join(' / ') : p.bodies[0].volume.toFixed(6) + ' faces ' + p.bodies[0].faces.length + ' ' + JSON.stringify(p.bodies[0].topology);
const boss = `j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.rect(10, 10).on(j.plane.offset(j.plane.XY, 3)), mm(5), { id: 'boss' })`;
const p0 = await compile('return ' + boss); console.log('bare', p0.bodies[0].volume);
for (const [rv, rr] of [[2, 1], [4, 2], [1, 1]]) {
  const one = await compile('return ' + boss + `.fillet(j.feat('boss').edges().where(e => !e.smooth), e => e.concave ? mm(${rr}) : mm(${rv}), { id: 'all' })`);
  const a = await compile('return ' + boss + `.fillet(j.feat('boss').edges().where(e => e.concave), mm(${rr}), { id: 'root' }).fillet(j.feat('boss').edges().where(e => e.convex), mm(${rv}), { id: 'rim' })`);
  const b = await compile('return ' + boss + `.fillet(j.feat('boss').edges().where(e => e.convex), mm(${rv}), { id: 'rim' }).fillet(j.feat('boss').edges().where(e => e.concave), mm(${rr}), { id: 'root' })`);
  console.log(`convex ${rv} concave ${rr}\n  one feature:   ${res(one)}\n  ${JSON.stringify(one.decisions.find(d => d.kind === 'fillet.order'))?.slice(0, 300)}\n  root then rim: ${res(a)}\n  rim then root: ${res(b)}`);
}
