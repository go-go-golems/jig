// Agent evaluation (JIG-003): run the cases in test/agent-eval/cases against the real agent turn, the real Host and
// engine (in this process) and a model backend (jigcad serve), then write results.jsonl and summary.md.
//
//   node tools/agent-eval.mjs [--base http://127.0.0.1:8787/] [--tiers default,complex] [--repeat 1]
//                             [--cases a01-,s01] [--out DIR] [--deadline 300] [--compute rust|js] [--oracle]
//
// --oracle replaces the model with each case's oracle turn (a known-good scripted turn): no network, checks the
// harness and the cases. Prerequisites: `node build.mjs` (src/generated/content.json, dist/jig_compute.wasm) and,
// unless --oracle, a running `jigcad serve` with models.
import { register } from 'node:module';
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
register(new URL('./agent-eval/loader.mjs', import.meta.url).href);

function flags(argv) {
  const o = { base: 'http://127.0.0.1:8787/', tiers: 'default,complex', repeat: '1', cases: '', out: '', deadline: '300', compute: 'rust', oracle: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--oracle') o.oracle = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); o[k] = v ?? argv[++i]; }
  }
  return o;
}
const o = flags(process.argv.slice(2));
if (o.help) { console.log('usage: node tools/agent-eval.mjs [--base URL] [--tiers default,complex] [--repeat n] [--cases ids] [--out DIR] [--deadline s] [--compute rust|js] [--oracle]'); process.exit(0); }

for (const [path, fix] of [['src/generated/content.json', 'node build.mjs'], ['vendor/occt/replicad_single.wasm', 'gunzip -k vendor/occt/replicad_single.wasm.gz']]) {
  if (!existsSync(join(ROOT, path))) { console.error(`missing ${path}: run \`${fix}\` in import/jigcad`); process.exit(2); }
}

const { createNodeEngine } = await import('./agent-eval/node-engine.mjs');
const { loadCases, runAll } = await import('./agent-eval/runner.mjs');
const { summarise, markdown } = await import('./agent-eval/report.mjs');
const { Host } = await import('../src/host/host.js');
const { httpSample } = await import('../src/host/sample-http.js');

const cases = loadCases(join(ROOT, 'test/agent-eval/cases'), o.cases);
if (!cases.length) { console.error(`no cases match '${o.cases}'`); process.exit(2); }

let sample = null, info = null;
if (!o.oracle) {
  const base = o.base.endsWith('/') ? o.base : o.base + '/';
  const s = await httpSample(base);
  if (!s) { console.error(`no model backend at ${base} (start it: go run ./cmd/jigcad serve)`); process.exit(2); }
  sample = s; info = s.info; o.base = base;
}

const engine = await createNodeEngine({ compute: o.compute });
const host = new Host({ engine });
await engine.ready;

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = resolve(o.out || join(ROOT, 'test/agent-eval/out', stamp));
mkdirSync(out, { recursive: true });
const jsonl = join(out, 'results.jsonl');
writeFileSync(jsonl, '');
const tiers = o.oracle ? ['oracle'] : o.tiers.split(',').map(s => s.trim()).filter(Boolean);
const meta = { stamp, base: o.oracle ? 'oracle' : o.base, repeat: +o.repeat, compute: engine.compute?.kind, tiers, cases: cases.map(c => c.id),
  tierModels: info?.tiers ?? null, maxRounds: info?.maxRounds ?? null, engine: engine.version };
writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(`agent-eval: ${cases.length} cases × ${tiers.join(', ')} × ${o.repeat} → ${out}`);
if (info) console.log(`backend: ${JSON.stringify(info.tiers)} · max rounds ${info.maxRounds} · engine ${engine.compute?.kind}`);

// --oracle: each case's own known-good turn (no network)
const oracleFor = c => async (turns, opts) => {
  for (const code of c.oracle?.steps || []) await opts.tools[0].execute({ code }, { signal: opts.signal });
  const text = c.oracle?.answer || '';
  opts.onText?.({ text, delta: text });
  return { text, truncated: false };
};
const records = await runAll(cases, {
  host, tiers, repeat: +o.repeat, deadlineMs: +o.deadline * 1000,
  sample, sampleFor: o.oracle ? oracleFor : null,
  onRecord: r => appendFileSync(jsonl, JSON.stringify(r) + '\n'),
  log: line => { if (!line.startsWith('…')) console.log(line); },
});
const summary = summarise(records);
const md = markdown(summary, meta);
writeFileSync(join(out, 'summary.md'), md);
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('\n' + md);
process.exit(records.some(r => r.outcome === 'setup_error') ? 1 : 0);
