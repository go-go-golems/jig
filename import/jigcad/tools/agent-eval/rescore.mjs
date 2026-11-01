// Re-evaluate the answer checks of a results.jsonl with the current case files and check code (JIG-005): after a
// check is corrected, recorded runs can be scored again without new model calls. Checks other than `answer` keep
// their recorded verdict (they need the final program, which the record does not hold).
//   node tools/agent-eval/rescore.mjs RESULTS.jsonl [--write OUT.jsonl]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './checks.mjs';
import { loadCases } from './runner.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const [file, flag, out] = process.argv.slice(2);
const cases = Object.fromEntries(loadCases(join(ROOT, 'test/agent-eval/cases')).map(c => [c.id, c]));
const records = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const changed = [];
for (const r of records) {
  const c = cases[r.case];
  if (!c || r.checks.length !== c.checks.length) continue;
  const checks = c.checks.map((ch, i) => ch.kind === 'answer' ? evaluate({ checks: [ch] }, { turn: { text: r.answer }, steps: [] })[0] : r.checks[i]);
  const pass = checks.every(x => x.pass);
  if (pass !== r.pass) changed.push(`${r.tier} #${r.repeat} ${r.case}: ${r.pass ? 'PASS' : 'FAIL'} → ${pass ? 'PASS' : 'FAIL'}`);
  Object.assign(r, { checks, pass, rescored: true });
}
const tiers = [...new Set(records.map(r => r.tier))];
for (const t of tiers) { const R = records.filter(r => r.tier === t); console.log(`${t}: ${R.filter(r => r.pass).length}/${R.length}`); }
for (const line of changed) console.log('  ' + line);
if (flag === '--write' && out) writeFileSync(out, records.map(r => JSON.stringify(r)).join('\n') + '\n');
