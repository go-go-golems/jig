import { compile } from './base.mjs';
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/claude/jigcad/content/presets/M-07-spur-gear-pair/script.js', 'utf8');
for (const ex of [false, true, false, true]) {
  const code = ex ? src.replace('\n  .interference()', '\n  .interference({ exact: true })') : src;
  const t0 = performance.now();
  const r = await compile(code);
  const p = r.program;
  console.log('exact', ex, ((performance.now() - t0)/1000).toFixed(2) + ' s', p.kind);
  for (const d of p.decisions.filter(d => d.kind === 'gap')) console.log('  decision', d.at, d.chose, '·', d.reason);
  for (const d of p.diagnostics.filter(d => d.level !== 'info')) console.log('  diag', d.level, d.kind, d.message);
  for (const t of p.trace.filter(t => /interference/.test(t.pass))) console.log('  trace', t.ms.toFixed(0), 'ms', t.note);
}
