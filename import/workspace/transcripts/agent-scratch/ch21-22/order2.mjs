import { compile } from './h.mjs';
const res = p => p.diagnostics.length ? p.diagnostics.map(d => d.kind + ': ' + d.message.slice(0, 140)).join(' / ') : p.bodies[0].volume.toFixed(6) + ' faces ' + p.bodies[0].faces.length;
const peg = h => `j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(${h}), { id: 'peg' })`;
const root = r => `.fillet(j.feat('peg').edges().where(e => e.concave), mm(${r}), { id: 'root' })`;
const top = r => `.fillet(j.feat('peg').endFace().edges(), mm(${r}), { id: 'top' })`;
for (const [h, r1, r2] of [[3, 1.5, 1.5], [3, 1.6, 1.4], [2, 1, 1], [2, 1.2, 0.8], [3, 1.5, 1.4]]) {
  const a = await compile('return ' + peg(h) + root(r1) + top(r2));
  const b = await compile('return ' + peg(h) + top(r2) + root(r1));
  const c = await compile('return ' + peg(h) + `.fillet(j.feat('peg').edges().where(e => !e.smooth), (e) => e.concave ? mm(${r1}) : mm(${r2}), { id: 'both' })`);
  console.log(`h=${h} root ${r1} top ${r2}\n  root then top: ${res(a)}\n  top then root: ${res(b)}\n  one feature:   ${res(c)}`);
}
const boss = `j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.rect(10, 10).on(j.plane.offset(j.plane.XY, 3)), mm(5), { id: 'boss' })`;
for (const [rv, rr] of [[2, 1], [4, 2], [3, 2], [4, 1]]) {
  const a = await compile('return ' + boss + `.fillet(j.feat('boss').edges().where(e => e.concave), mm(${rr}), { id: 'root' }).fillet(j.feat('boss').edges().where(e => e.convex), mm(${rv}), { id: 'rim' })`);
  const b = await compile('return ' + boss + `.fillet(j.feat('boss').edges().where(e => e.convex), mm(${rv}), { id: 'rim' }).fillet(j.feat('boss').edges().where(e => e.concave), mm(${rr}), { id: 'root' })`);
  console.log(`boss convex ${rv} concave ${rr}\n  root then rim: ${res(a)}\n  rim then root: ${res(b)}`);
}
