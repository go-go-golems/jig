// run.mjs · runs every core test file: node test/engine-core/run.mjs
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summary } from './harness.mjs';
const here = dirname(fileURLToPath(import.meta.url));
// jig-compute (Rust) solves taped sketches when loaded; JIG_COMPUTE=js runs the JS solver
const RS = await import('../../src/engine/rs/index.js');
try { await RS.loadCompute(); } catch (e) { console.log(`jig-compute not loaded: ${e.message}`); }
console.log(`compute: ${RS.enabled() ? 'rust ' + RS.status.version : 'js'}`);
const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort();
const t0 = performance.now();
for (const f of files) {
  console.log(`\n${f}`);
  await import(pathToFileURL(join(here, f)).href);
}
const r = summary();
console.log(`\n${r.pass} passed, ${r.fail} failed · ${files.length} files · ${(performance.now() - t0).toFixed(0)} ms`);
if (r.fail) { for (const { name, e } of r.failures) console.log(`\nFAIL ${name}\n${e.stack}`); process.exit(1); }
