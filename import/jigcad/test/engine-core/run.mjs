// run.mjs · runs every core test file: node test/engine-core/run.mjs
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summary } from './harness.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort();
const t0 = performance.now();
for (const f of files) {
  console.log(`\n${f}`);
  await import(pathToFileURL(join(here, f)).href);
}
const r = summary();
console.log(`\n${r.pass} passed, ${r.fail} failed · ${files.length} files · ${(performance.now() - t0).toFixed(0)} ms`);
if (r.fail) { for (const { name, e } of r.failures) console.log(`\nFAIL ${name}\n${e.stack}`); process.exit(1); }
