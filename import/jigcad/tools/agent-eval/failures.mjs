// The failure report (JIG-012 phase 0): what goes wrong in the agent's eval steps across recorded runs.
//   node tools/agent-eval/failures.mjs RESULTS.jsonl… [--json] [--examples N]
// For every step it classifies the result (an error the model caused by using the API wrongly, an unawaited promise,
// a timeout, any other error), then reports per class the steps and runs affected, how many steps it took to recover
// after a failed step, stuck loops (three or more failed steps in a row), and which scope names the code called.
// Pattern from factory-videos' JSDRILL round report: coverage, failures per kind, evals to recover, stuck loops.
import { scopeNames } from '../../src/agent/docs.js';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The names the agent's eval scope offers (reference.md "The agent's eval scope"); coverage counts calls of these.
export const SCOPE_NAMES = [...new Set(scopeNames()
  .filter(n => !['console', 'log', 'data'].includes(n))
  .map(n => n.startsWith('lab.') ? 'lab.' : n === 'j' ? 'j.' : n))];

// scope functions that return promises (the engine answers them)
const ASYNC = new Set(['run', 'check', 'why', 'faces', 'feature', 'sketch', 'look', 'measure.area', 'params.get', 'params.set', 'params.clear', 'presets.load', 'presets.create', 'exportFile', 'program.ir']);

/** The class of one step's result, or null when the step succeeded and carries no note. */
export function classify(step) {
  const r = String(step?.result ?? '');
  const head = r.replace(/^logs:[\s\S]*?\n---\n/, '');
  const noted = /never awaited/.test(r);
  // a promise the code used as a value: the JIG-004 note, or (in runs before it) a method of the promise called
  const asyncCall = /^TypeError: (?:await )?([\w$]+(?:\.[\w$]+)?)\(\.\.\.\)\.\w+ is not a function/.exec(head);
  if (asyncCall && ASYNC.has(asyncCall[1])) return 'promise not awaited';
  if (noted && (!step?.error || /\(\.\.\.\)\.\w+ is not a function|Cannot read properties/.test(head.split('\n')[0]))) return 'promise not awaited';
  if (/eval timed out/.test(head)) return 'timeout';
  if (/^Declined|The person declined/.test(head)) return null;
  let m;
  if ((m = /^ReferenceError: ([\w$]+) is not defined/.exec(head))) return `not defined: ${m[1]}`;
  if ((m = /^TypeError: (?:Cannot read properties of (?:undefined|null)) \(reading '([^']+)'\)/.exec(head))) return `read of undefined: .${m[1]}`;
  if ((m = /^TypeError: (.+?) is not a function/.exec(head))) return `not a function: ${m[1].replace(/\(.*?\)/g, '()').replace(/^.*\./, '.')}`;
  if ((m = /^TypeError: ([\w$.()]+) does not exist/.exec(head))) return `guarded name: ${m[1]}`;
  if (/NaN/.test(head.split('\n')[0]) && /^\w*Error/.test(head)) return 'NaN in an error';
  if (/^SyntaxError/.test(head)) return 'syntax error';
  if (step?.error || /^\w*Error:/.test(head)) return 'other error';
  return null;
}

// Groups of classes, for the summary line: misuse is what an API that teaches should remove.
export const MISUSE = c => /^(not defined|read of undefined|not a function|guarded name|NaN in an error)/.test(c);

export function analyse(records) {
  const classes = new Map();          // class → { steps, runs:Set, examples: [] }
  let steps = 0, failedSteps = 0, misuseRuns = 0, stuckRuns = 0;
  const recovery = new Map();         // steps until the next success → count ('never' when the run ended first)
  const coverage = new Map(SCOPE_NAMES.map(n => [n, 0]));
  const stuck = [];
  for (const [ri, r] of records.entries()) {
    const key = `${r.tier} #${r.repeat} ${r.case}`;
    let misuse = false, streak = 0, maxStreak = 0;
    const ss = r.steps || [];
    ss.forEach((s, i) => {
      steps++;
      for (const n of SCOPE_NAMES) if (n.endsWith('.') ? s.code?.includes(n) : new RegExp(`(^|[^\\w$.])${n.replace('.', '\\.')}\\s*\\(`).test(s.code || '')) coverage.set(n, coverage.get(n) + 1);
      const c = classify(s);
      const failed = c && c !== 'promise not awaited' ? true : !!s.error;
      if (c) {
        const e = classes.get(c) || { steps: 0, runs: new Set(), examples: [] };
        e.steps++; e.runs.add(ri);
        if (e.examples.length < 3) e.examples.push({ run: key, line: String(s.result).replace(/^logs:[\s\S]*?\n---\n/, '').split('\n')[0].slice(0, 160) });
        classes.set(c, e);
        if (MISUSE(c)) misuse = true;
      }
      if (failed) {
        failedSteps++;
        streak++; maxStreak = Math.max(maxStreak, streak);
        let k = i + 1;
        while (k < ss.length && (ss[k].error || (classify(ss[k]) && classify(ss[k]) !== 'promise not awaited'))) k++;
        const after = k < ss.length ? k - i : 'never';
        recovery.set(after, (recovery.get(after) || 0) + 1);
      } else streak = 0;
    });
    if (misuse) misuseRuns++;
    if (maxStreak >= 3) { stuckRuns++; stuck.push({ run: key, streak: maxStreak }); }
  }
  return { runs: records.length, steps, failedSteps, misuseRuns, stuckRuns, stuck, classes, recovery, coverage };
}

export function report(a, { examples = 1 } = {}) {
  const pct = (n, d) => d ? `${Math.round(100 * n / d)} %` : '–';
  const out = [];
  out.push(`# Agent eval failures`, '');
  out.push(`Runs: ${a.runs} · steps: ${a.steps} · failed steps: ${a.failedSteps} (${pct(a.failedSteps, a.steps)}) · runs with a misuse error: ${a.misuseRuns} (${pct(a.misuseRuns, a.runs)}) · runs with a stuck loop (≥ 3 failures in a row): ${a.stuckRuns}`, '');
  out.push('| Class | Steps | Runs | Example |', '|---|---:|---:|---|');
  for (const [c, e] of [...a.classes].sort((x, y) => y[1].steps - x[1].steps))
    out.push(`| ${MISUSE(c) ? '**' + c + '**' : c} | ${e.steps} | ${e.runs.size} | ${e.examples.slice(0, examples).map(x => '`' + x.line.replace(/\|/g, '\\|').replace(/`/g, "'") + '`').join('<br>')} |`);
  out.push('', 'Misuse classes are in bold.', '');
  const rec = [...a.recovery].sort((x, y) => (x[0] === 'never') - (y[0] === 'never') || x[0] - y[0]);
  out.push(`Steps to recover after a failed step: ${rec.map(([k, v]) => `${k}: ${v}`).join(' · ') || '–'}`, '');
  if (a.stuck.length) out.push(`Stuck loops: ${a.stuck.map(s => `${s.run} (${s.streak})`).join('; ')}`, '');
  const used = [...a.coverage].filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  const unused = [...a.coverage].filter(([, n]) => n === 0).map(([k]) => k);
  out.push(`Scope names called (steps): ${used.map(([k, n]) => `${k} ${n}`).join(' · ')}`, '');
  out.push(`Never called: ${unused.join(', ') || '–'}`);
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const files = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a));
  const ex = args.includes('--examples') ? +args[args.indexOf('--examples') + 1] || 1 : 1;
  if (!files.length) { console.error('usage: node tools/agent-eval/failures.mjs RESULTS.jsonl… [--json] [--examples N]'); process.exit(2); }
  const records = files.flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
  const a = analyse(records);
  if (args.includes('--json')) console.log(JSON.stringify({ ...a, classes: Object.fromEntries([...a.classes].map(([k, v]) => [k, { steps: v.steps, runs: v.runs.size, examples: v.examples }])), recovery: Object.fromEntries(a.recovery), coverage: Object.fromEntries(a.coverage) }, null, 1));
  else console.log(report(a, { examples: ex }));
}
