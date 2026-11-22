// scripts/bundle-core.ts — bundle the engine's non-DOM core (src/engine/core.ts) into dist-core/candela-core.js: one
// IIFE that defines globalThis.Candela, targeting ES2020 so it runs in the V8 10.2 that libnode 18 embeds in
// candela-rt as well as in current Node and browsers. Prints the bundle's SHA-256, which is its version for the
// browser ↔ candela-rt handshake (design doc 02, D8).
//
//   npx tsx scripts/bundle-core.ts [--out dist-core/candela-core.js]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const outArg = process.argv.indexOf('--out');
const out = path.resolve(outArg > 0 ? process.argv[outArg + 1] : 'dist-core/candela-core.js');

const r = await esbuild.build({
  entryPoints: ['src/engine/core.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'Candela',
  platform: 'neutral',
  target: 'es2020',
  outfile: out,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});
const text = fs.readFileSync(out);
const sha = crypto.createHash('sha256').update(text).digest('hex');
fs.writeFileSync(out + '.sha256', sha + '\n');
const inputs = Object.keys(r.metafile!.inputs).length;
console.log(`${path.relative(process.cwd(), out)}: ${(text.length / 1024).toFixed(0)} KiB from ${inputs} files, sha256 ${sha.slice(0, 16)}…`);
