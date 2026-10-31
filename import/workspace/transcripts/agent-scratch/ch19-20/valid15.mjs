import { W, r6 } from './lib.mjs';
for (const R of [0.8, 1.5, 2]) {
  const code = `const R = ${R}
const base = j.cyl(mm(20), mm(8)).union(j.cyl(mm(8), mm(13))).union(j.cyl(mm(3), mm(22)).moved(j.tx.move(12, 0, 0)))
const ring = j.cyl(mm(8 + R), mm(R)).subtract(j.cyl(mm(8), mm(R))).moved(j.tx.move(0, 0, 8))
const tor = j.torus(mm(8 + R), mm(R)).moved(j.tx.move(0, 0, 8 + R))
const sp = ring.subtract(tor)
return j.part('u').add(base.union(sp), { id: 'u' })`;
  const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': code } });
  console.log(R, r.ok, r6(r.program.summary.volume), r.program.summary.faces, r.program.diagnostics.map(d => d.kind + ': ' + d.message).join('; '));
}
