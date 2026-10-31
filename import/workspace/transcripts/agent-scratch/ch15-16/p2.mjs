import { show } from './p1.mjs';
import { register } from 'node:module';
const { sketch } = await import('/home/claude/jigcad/src/engine/sketch/index.js');
for (const g of [1e-6, 4e-6, 8e-6, 1e-5, 1e-4, 1e-3]) {
  show(`gap ${g}`, sketch('g').line('b', [0, 0], [40, 0]).line('r', [40, 0], [40, 20]).line('t', [40, 20], [0, 20]).line('l', [0, 20], [0, g]));
}
for (const g of [1e-6, 4e-6, 8e-6, 1e-5]) {
  show(`gap x ${g}`, sketch('g').line('b', [0, 0], [40, 0]).line('r', [40, 0], [40, 20]).line('t', [40, 20], [0, 20]).line('l', [g, 20], [g, 0]));
}
for (const r of [5 - 1e-3, 5 - 1e-5, 5 - 3e-6, 5, 5 + 3e-6, 5 + 1e-5, 5 + 1e-3]) show(`circle r ${r}`, sketch('s').polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true }).circle('c', r, { at: [20, 15] }));
