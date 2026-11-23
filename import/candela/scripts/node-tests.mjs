// scripts/node-tests.mjs — run Candela's engine tests (tests/golden-pack.test.ts, tests/session.test.ts) in plain
// Node with no npm install: esbuild (jig's, or any given as $ESBUILD) bundles each test into build/node-tests/, two
// directories below this tree's root, so src/content/node.ts still finds content/ relative to its own file.
//
//   ESBUILD=<path to esbuild's lib/main.js> node scripts/node-tests.mjs [test names…]
//   ESBUILD=… node scripts/node-tests.mjs --run scripts/core-digest.ts -- --ids B-01 --compare rt.json
// The second form bundles and runs any Node-only script the same way (the GPU CI job compares candela-rt's digests
// with Node's). jig runs the tests from `make test-candela` (part of `make test-js`).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = async (esbuild, entry, out) => esbuild.build({ entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', target: 'node20', logLevel: 'warning', external: ['node:*'] });
const TESTS = ['golden-pack', 'session'];
const esbuild = await import(process.env.ESBUILD ? pathToFileURL(process.env.ESBUILD).href : 'esbuild');
const runAt = process.argv.indexOf('--run');
if (runAt >= 0) {
  const script = process.argv[runAt + 1], rest = process.argv.slice(runAt + 2);
  const out = join(ROOT, 'build/node-tests', script.replace(/^.*\//, '').replace(/\.ts$/, '.mjs'));
  await bundle(esbuild, join(ROOT, script), out);
  const r = spawnSync(process.execPath, [out, ...(rest[0] === '--' ? rest.slice(1) : rest)], { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const want = process.argv.slice(2).length ? process.argv.slice(2) : TESTS;
let failed = 0;
for (const name of want) {
  const out = join(ROOT, 'build/node-tests', `${name}.mjs`);
  await bundle(esbuild, join(ROOT, 'tests', `${name}.test.ts`), out);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [out], { cwd: ROOT, stdio: 'inherit' });
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} candela ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
