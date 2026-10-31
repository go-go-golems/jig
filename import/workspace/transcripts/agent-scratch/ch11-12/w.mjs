// compile a script with the worker and print sketches + L3 dumps
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
import { readFileSync } from 'node:fs';
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const code = readFileSync(process.argv[2], 'utf8');
const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js', files: { 'script.js': code } });
if (!r.ok) console.log('ERR', r.error);
const p = r.program;
for (const d of p?.diagnostics || []) console.log(d.level, d.kind, d.message, d.fix ? '· fix: ' + d.fix : '');
for (const sk of p?.sketches || []) {
  const d = await W.handle({ id: 2, op: 'call', method: 'ir', args: ['L3', { node: sk.id }] });
  console.log(d.value);
}
for (const d of p?.decisions || []) console.log('decision', d.at, d.kind, '→', d.chose, '·', d.reason);
