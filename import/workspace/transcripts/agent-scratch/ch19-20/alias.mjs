import { build } from './lib.mjs';
const prog = await build(`return j.part('p')
  .extrude(j.region.rect(20, 20), mm(20), { id: 'a' })
  .extrude(j.region.rect(20, 20, { at: [19.55, 0] }), mm(20), { id: 'b' })`);
const b = prog.kernelBodies()[0].body;
b.names.forEach((n, i) => console.log(n, JSON.stringify(b.aliases[i])));
