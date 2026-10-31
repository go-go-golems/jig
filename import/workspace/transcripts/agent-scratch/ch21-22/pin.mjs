import { compile } from './h.mjs';
const src = (x, extra = '') => `const g = j.lib.gear.spur({ module: mm(2), teeth: 30, width: mm(6) }).hole([[0, 0]], j.hole.simple(mm(5)), { id: 'bore' })
  const pin = j.part('pin').add(j.box(2, 2, 20, { center: true }), { id: 'pin' })
  return j.assembly('a').add('g', g, { ground: true }).add('pin', pin, { at: j.tx.move(${x}, 0, 3) }).interference(${extra})`;
for (const [x, extra] of [[15, ''], [15, '{ exact: true }'], [40, ''], [27, ''], [3.6, '']]) {
  const t0 = performance.now();
  const p = await compile(src(x, extra));
  console.log(`pin at x=${x} ${extra}`, (performance.now() - t0).toFixed(0), 'ms |', p.decisions.filter(d => d.kind === 'gap').map(d => d.chose).join(), '|', p.diagnostics.map(d => d.kind).join(), '|', p.trace.filter(t => t.pass === 'interference').map(t => t.note).join());
}
