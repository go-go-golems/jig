import { register } from 'node:module';
import fs from 'node:fs';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const code = fs.readFileSync(process.argv[2], 'utf8');
const t = performance.now();
const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': code } });
console.log('ms', (performance.now() - t).toFixed(0), 'ok', r.ok, r.error?.message, JSON.stringify(r.program?.summary), (r.program?.diagnostics || []).map(d => d.kind + ': ' + d.message));
