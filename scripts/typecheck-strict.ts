// scripts/typecheck-strict.ts — the typing ratchet. The repo typechecks with `strict` but `noImplicitAny: false`
// (the engine's builder DSL is dynamic JS ported as-is). Files listed here must also pass `noImplicitAny`:
// add a file once it is fully typed, never remove one. Exits non-zero on any implicit-any error in a listed file.
import { spawnSync } from 'node:child_process';

export const STRICT = [
  'src/content/', 'src/app/claude.ts', 'src/app/highlight.ts', 'src/app/main.tsx',
  'src/engine/units.ts', 'src/engine/diag.ts', 'src/engine/kernel.ts',
  'scripts/', 'tests/',
];

const r = spawnSync('npx', ['tsc', '--noEmit', '-p', '.', '--noImplicitAny'], { encoding: 'utf8' });
const lines = (r.stdout + r.stderr).split('\n').filter(l => /error TS\d+/.test(l));
const mine = lines.filter(l => STRICT.some(p => l.startsWith(p)));
const files = new Set(lines.map(l => l.replace(/\(.*$/, '')));
for (const l of mine) console.log(l);
console.log(`strict files: ${mine.length} implicit-any errors · rest of the repo: ${lines.length - mine.length} in ${files.size - new Set(mine.map(l => l.replace(/\(.*$/, ''))).size} files (not enforced)`);
process.exit(mine.length ? 1 : 0);
