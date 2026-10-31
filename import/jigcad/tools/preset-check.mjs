// Compile presets in Node with the real engine and print what the workbench would show.
// Usage: node tools/preset-check.mjs [presetDirOrIdFilter …] [--quiet]
// Exit code 1 if any preset fails to compile or reports an error diagnostic.
import { register } from 'node:module';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
register(new URL('../test/engine/loader.mjs', import.meta.url).href);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const W = await import('../src/engine/worker.js');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const quiet = process.argv.includes('--quiet');
const PDIR = join(ROOT, 'content/presets');
let dirs = readdirSync(PDIR).filter(d => statSync(join(PDIR, d)).isDirectory()).sort();
if (args.length) dirs = dirs.filter(d => args.some(a => d.includes(basename(a))));
await W.handle({ id: 0, op: 'init' });
let bad = 0;
for (const d of dirs) {
  const dir = join(PDIR, d);
  if (!existsSync(join(dir, 'script.js'))) { console.log(`skip ${d} (no script.js)`); continue; }
  const files = {};
  for (const f of readdirSync(dir)) if (f !== 'meta.json') files[f] = readFileSync(join(dir, f), 'utf8');
  const t0 = performance.now();
  const r = await W.handle({ id: 1, op: 'compile', files, entry: 'script.js', options: {} });
  const ms = (performance.now() - t0).toFixed(0);
  const p = r.program;
  const diags = p?.diagnostics ?? [];
  const errors = diags.filter(x => x.level === 'error');
  const warns = diags.filter(x => x.level === 'warning');
  const ok = r.ok && p?.ok !== false && errors.length === 0;
  if (!ok) bad++;
  const s = p?.summary ?? {};
  const m = p?.metrics ?? {};
  const fmt = k => m[k] ? `${k} ${typeof m[k].value === 'number' ? +m[k].value.toFixed(2) : m[k].value} ${m[k].unit ?? ''}`.trim() : null;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${d} · ${ms} ms · ${[`${s.features ?? '?'} features`, `${s.bodies ?? '?'} bodies`, `dof ${s.dof ?? '?'}`, fmt('volume'), fmt('mass'), fmt('printTime')].filter(Boolean).join(' · ')}`);
  if (!r.ok) console.log(`     error: ${r.error?.message} (line ${r.error?.line ?? '?'}:${r.error?.column ?? '?'})`);
  for (const e of errors) console.log(`     error ${e.kind} at ${e.at ?? '?'}${e.line ? ' line ' + e.line : ''}: ${e.message}${e.fix ? ' · fix: ' + e.fix : ''}`);
  if (!quiet) for (const w of warns) console.log(`     warning ${w.kind} at ${w.at ?? '?'}: ${w.message}`);
  // House rule: code wraps at 80 characters so it reads in the Code view and in the book.
  for (const [f, text] of Object.entries(files)) {
    if (!f.endsWith('.js')) continue;
    const long = text.split('\n').map((l, i) => [i + 1, l.length]).filter(([, n]) => n > 80);
    if (long.length) {
      console.log(`     wrap ${f}: ${long.length} line(s) over 80 characters (` +
        long.slice(0, 6).map(([i, n]) => `${i}:${n}`).join(', ') + (long.length > 6 ? ', …' : '') + ')');
    }
  }
}
console.log(`\n${dirs.length - bad}/${dirs.length} presets compile cleanly`);
process.exit(bad ? 1 : 0);
