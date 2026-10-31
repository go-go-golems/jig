import { compile } from './h.mjs';
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/claude/jigcad/content/presets/A-01-box/script.js', 'utf8');
for (const w of [2, 2.9, 3, 3.5]) {
  const r = await (await import('./h.mjs')).W.handle({ id: 99, op: 'compile', entry: 'script.js', files: { 'script.js': src }, options: { override: { wall: w } } });
  const p = r.program;
  console.log(w, p.bodies[0]?.volume, p.diagnostics.map(d => d.level + ' ' + d.kind + ': ' + d.message + ' · ' + d.fix).join(' / '));
}
