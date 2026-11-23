// Compile the F-06 needle-bar drive through jig's worker in Node and print what the bridge would read.
// usage: node 01-f06-face-records.mjs <jig>/import/jigcad
import { readFileSync } from 'node:fs';
const JIG = process.argv[2];
const W = await import(`${JIG}/src/engine/worker.js`);
await W.handle({ id: 0, op: 'init' });
const src = readFileSync(`${JIG}/content/presets/F-06-slider-crank-mechanism/script.js`, 'utf8');
const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': src }, options: {} });

const p = r.program;
console.log('ok', p.ok, 'kind', p.kind, 'bodies', p.bodies?.length);
for (const b of p.bodies ?? []) {
  console.log(`\n${b.id}  part=${b.part}  tris=${b.mesh?.indices.length / 3}  faces=${b.faces.length}  T=[${b.transform.slice(12, 15).map(v => +v.toFixed(2))}]`);
  for (const f of b.faces.slice(0, 12)) console.log('   ', f.index, f.name, f.kind, f.axis ? `axis ${f.axis.dir.map(v => +v.toFixed(2))} r=${+f.axis.radius.toFixed(2)}` : '', f.normal ? `n ${f.normal.map(v => +v.toFixed(2))}` : '');
}
console.log('\ngraph', JSON.stringify((p.graph?.nodes ?? []).slice(0, 8).map(n => [n.id, n.kind])));
