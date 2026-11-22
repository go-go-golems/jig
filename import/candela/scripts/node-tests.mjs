// scripts/node-tests.mjs — run Candela's engine tests (tests/golden-pack.test.ts, tests/session.test.ts) in plain
// Node with no npm install: esbuild (jig's, or any given as $ESBUILD) bundles each test into build/node-tests/, two
// directories below this tree's root, so src/content/node.ts still finds content/ relative to its own file.
//
//   ESBUILD=<path to esbuild's lib/main.js> node scripts/node-tests.mjs [test names…]
// jig runs it from `make test-candela` (part of `make test-js`).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = ['golden-pack', 'session'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : TESTS;
const esbuild = await import(process.env.ESBUILD ? pathToFileURL(process.env.ESBUILD).href : 'esbuild');
let failed = 0;
for (const name of want) {
  const out = join(ROOT, 'build/node-tests', `${name}.mjs`);
  await esbuild.build({ entryPoints: [join(ROOT, 'tests', `${name}.test.ts`)], outfile: out, bundle: true, format: 'esm',
    platform: 'node', target: 'node20', logLevel: 'warning', external: ['node:*'] });
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [out], { cwd: ROOT, stdio: 'inherit' });
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} candela ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
