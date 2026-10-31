import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': readFileSync(process.argv[2], 'utf8') }, entry: 'script.js', options: {} });
const p = r.program;
for (const b of p.bodies) { console.log(b.id, b.part, JSON.stringify(b.bbox), b.faces.length); console.log('  ', b.faces.map(f => f.name).filter(n => !/gear\/side|rack\/side|t\d/.test(n)).join('\n   ')); }
console.log(JSON.stringify(p.decisions.filter(d => /fillet|chamfer|op/.test(d.kind)).slice(0, 10)));
