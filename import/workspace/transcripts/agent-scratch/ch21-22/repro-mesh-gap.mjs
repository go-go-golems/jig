// mesh interference misses a pin through a gear's web and a cube buried in it (exact check sees both)
import { compile } from './h.mjs';
const g = `const g = j.lib.gear.spur({ module: mm(2), teeth: 30, width: mm(6) }).hole([[0, 0]], j.hole.simple(mm(5)), { id: 'bore' })`;
for (const [h, ex] of [[20, ''], [20, '{ exact: true }'], [2, ''], [2, '{ exact: true }']]) {
  const p = await compile(`${g}
  const pin = j.part('pin').add(j.box(2, 2, ${h}, { center: true }), { id: 'pin' })
  return j.assembly('a').add('g', g, { ground: true }).add('pin', pin, { at: j.tx.move(15, 0, 3) }).interference(${ex})`);
  console.log(`box 2x2x${h} at (15,0,3) ${ex || 'mesh'}:`, p.decisions.find(d => d.kind === 'gap').chose, p.diagnostics.map(d => d.kind).join() || 'no diagnostic');
}
