// scripts/args.ts — the command-line parser the scripts share: --flag value, --flag (true), --param id=value
// (repeatable), and the rest positional. Kept apart from render-preset.ts so that tests and tools which only parse
// arguments (core-digest.ts, used by tests/golden-pack.test.ts) do not load Playwright.
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
