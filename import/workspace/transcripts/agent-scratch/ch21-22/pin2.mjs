import { compile } from './h.mjs';
const src = (extra = '') => `const g = j.lib.gear.spur({ module: mm(2), teeth: 30, width: mm(6) }).hole([[0, 0]], j.hole.simple(mm(5)), { id: 'bore' })
  const pin = j.part('pin').add(j.box(2, 2, 2, { center: true }), { id: 'pin' })
  return j.assembly('a').add('g', g, { ground: true }).add('pin', pin, { at: j.tx.move(15, 0, 3) }).interference(${extra})`;
for (const extra of ['', '{ exact: true }']) {
  const p = await compile(src(extra));
  console.log(`buried cube ${extra} |`, p.decisions.filter(d => d.kind === 'gap').map(d => d.chose).join(), '|', p.diagnostics.map(d => d.kind).join());
}
