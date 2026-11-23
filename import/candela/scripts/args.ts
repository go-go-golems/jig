// scripts/args.ts — the command-line parser the scripts share: --flag value, --flag (true), --param id=value
// (repeatable), and the rest positional. Kept apart from render-preset.ts so that tests and tools which only parse
// arguments (core-digest.ts, used by tests/golden-pack.test.ts) do not load Playwright.
import path from 'node:path';

// isMain('core-digest'): this script is the program being run (`tsx scripts/core-digest.ts`, or its bundle
// build/node-tests/core-digest.mjs from scripts/node-tests.mjs). Not `import.meta.url === file://argv[1]`: a bundle
// holds every module it imports and gives them all its own import.meta.url, so that test is true for each of them
// and an imported script's main() would run too (it did: tests/golden-pack.test.ts ran core-digest's whole
// Node-vs-vm digest; JIG-017 diary).
export const isMain = (name: string) => !!process.argv[1] && path.basename(process.argv[1]).replace(/\.(ts|mjs|js)$/, '') === name;

export function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {}, params: Record<string, string> = {}, rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { rest.push(a); continue; }
    const k = a.slice(2), next = argv[i + 1];
    const v = next != null && !next.startsWith('--') ? (i++, next) : true;
    if (k === 'param') { const s = String(v), eq = s.indexOf('='); if (eq < 1) throw new Error(`--param id=value, got '${s}'`); params[s.slice(0, eq)] = s.slice(eq + 1); }
    else flags[k] = v;
  }
  return { flags, params, rest };
}
