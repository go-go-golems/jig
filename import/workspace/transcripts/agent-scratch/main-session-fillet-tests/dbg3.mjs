import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': readFileSync(process.argv[2], 'utf8') }, entry: 'script.js', options: {} });
for (const id of process.argv.slice(3)) { const f = await W.handle({ id: 2, op: 'call', method: 'feature', args: [id] }); console.log(id, JSON.stringify(f.value).slice(0, 600)); }
