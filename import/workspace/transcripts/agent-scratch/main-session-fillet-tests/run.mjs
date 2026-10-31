import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const script = readFileSync(process.argv[2], 'utf8');
const t0 = performance.now();
const r = await W.handle({ id: 1, op: 'compile', files: { 'script.js': script }, entry: 'script.js', options: {} });
const p = r.program;
console.log('ok', r.ok, p?.ok, Math.round(performance.now() - t0), 'ms', r.error?.message ?? '');
for (const d of p?.diagnostics ?? []) if (d.level !== 'info') console.log(d.level, d.kind, d.at, d.message, d.fix ?? '');
for (const [k, v] of Object.entries(p?.featureInfo ?? {})) {}
const info = p?.features ?? [];
console.log(JSON.stringify(p?.summary));
for (const b of p?.bodies ?? []) console.log(b.id, (b.faces||[]).length, 'faces', b.faces.filter(f => /root|scoop|fillet/.test(f.name)).map(f=>f.name).slice(0,6));
for (const d of p?.decisions ?? []) if (d.kind === 'gap' || d.kind==='fillet.order') console.log('decision', d.at, d.kind, d.chose, d.reason);
