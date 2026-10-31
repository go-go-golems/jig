import { prog, K } from './h.mjs';
const O = await import('/home/claude/jigcad/src/engine/ops.js');
const { edgeDihedral } = await import('/home/claude/jigcad/src/engine/compile.js');
async function trial(src, pick, radii) {
  const pr = await prog(src);
  const { body } = pr.kernelBodies()[0];
  const idx = body.edges.list.map((e, i) => i).filter(i => pick(body, i));
  const cls = idx.map(i => edgeDihedral(body, i));
  const conc = idx.filter((i, k) => cls[k] === 'concave'), conv = idx.filter((i, k) => cls[k] === 'convex');
  const rad = i => radii(edgeDihedral(body, i), body, i);
  const run = order => { try { const o = O.fillet(body, order, order.map(rad), 'f'); const v = K.volumeProps(o.shape).volume; o.shape.delete(); return v.toFixed(6); } catch (e) { return 'FAIL ' + e.message.slice(0, 80); } };
  console.log('concave', conc.length, 'convex', conv.length, '| concave first:', run([...conc, ...conv]), '| convex first:', run([...conv, ...conc]));
}
const peg = h => `return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(${h}), { id: 'peg' })`;
const onPeg = (b, i) => b.edgeNames[i].includes('peg/side[circle] ∩');
for (const [h, r1, r2] of [[10, 1, 1], [3, 1.5, 1.4], [3, 1.5, 1.5], [2, 1.2, 0.8], [2, 1, 1]]) {
  process.stdout.write(`peg h=${h} root ${r1} top ${r2}: `);
  await trial(peg(h), onPeg, (c) => c === 'concave' ? r1 : r2);
}
const boss = `return j.part('b').extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.rect(10, 10).on(j.plane.offset(j.plane.XY, 3)), mm(5), { id: 'boss' })`;
const onBoss = (b, i) => b.edgeNames[i].includes('boss/');
for (const [rv, rr] of [[2, 1], [1, 2], [2, 2], [3, 1], [1, 3], [4, 2], [2, 0.5]]) {
  process.stdout.write(`boss convex ${rv} concave ${rr}: `);
  await trial(boss, onBoss, (c) => c === 'concave' ? rr : rv);
}
