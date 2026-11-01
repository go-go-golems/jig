// The evaluation harness without a network: checks and statistics on synthetic data, then runCase with a scripted
// sample on the real Host and engine (OpenCascade + jig-compute in this process).
// node --test test/agent-eval/harness.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('../../tools/agent-eval/loader.mjs', import.meta.url).href);
const { evaluate, compareValue } = await import('../../tools/agent-eval/checks.mjs');
const { wilson, summarise, markdown } = await import('../../tools/agent-eval/report.mjs');
const { runCase, captureUsage, noteCode } = await import('../../tools/agent-eval/runner.mjs');
const { createNodeEngine } = await import('../../tools/agent-eval/node-engine.mjs');
const { Host } = await import('../../src/host/host.js');

// ── checks on synthetic state ─────────────────────────────────────────────────
const program = {
  ok: true, diagnostics: [{ level: 'warning', kind: 'x' }],
  metrics: { mass: { value: 22.505 }, bbox: { value: [60, 40, 30] }, faces: { value: 19 } },
  params: [{ name: 'wall', value: 2.4 }], sketches: [{ id: 'outline', dof: 1 }],
};
const state = {
  initialFiles: { 'script.js': 'wall: mm(2)', 'notes.md': 'n' }, files: { 'script.js': 'wall: mm(2.4)', 'notes.md': 'n' },
  program, turn: { text: 'The mass is now 22.5 g.', note: null }, steps: [{ code: 'files.edit(…)' }, { code: 'await run()' }],
};
const one = ch => evaluate({ checks: [ch] }, state)[0];

test('every check kind passes and fails as specified', () => {
  const cases = [
    [{ kind: 'compiles' }, true],
    [{ kind: 'fails' }, false],
    [{ kind: 'file', path: 'script.js', matches: 'wall:\\s*mm\\(2\\.4\\)' }, true],
    [{ kind: 'file', path: 'script.js', notMatches: 'mm\\(2\\.4' }, false],
    [{ kind: 'file', path: 'nope.js', contains: 'x' }, false],
    [{ kind: 'unchanged' }, false],
    [{ kind: 'unchanged', paths: ['notes.md'] }, true],
    [{ kind: 'metric', name: 'mass', approx: 22.5, tol: 0.01 }, true],
    [{ kind: 'metric', name: 'mass', approx: 19.03, tol: 0.01 }, false],
    [{ kind: 'metric', name: 'bbox', equals: [60, 40, 30] }, true],
    [{ kind: 'metric', name: 'faces', min: 20 }, false],
    [{ kind: 'param', name: 'wall', approx: 2.4, tol: 1e-9 }, true],
    [{ kind: 'sketchDof', id: 'outline', dof: 0 }, false],
    [{ kind: 'answer', matches: ['22[.,]5'] }, true],
    [{ kind: 'answer', any: ['kilogram', 'g\\b'] }, true],
    [{ kind: 'answer', notMatches: ['mass'] }, false],
    [{ kind: 'steps', max: 1 }, false],
    [{ kind: 'stepCode', matches: 'run\\(' }, true],
    [{ kind: 'noNote' }, true],
    [{ kind: 'speling' }, false],
  ];
  for (const [ch, want] of cases) assert.equal(one(ch).pass, want, `${JSON.stringify(ch)} → ${one(ch).detail}`);
  assert.match(one({ kind: 'speling' }).detail, /unknown check kind/);
  assert.equal(compareValue('x', { min: 0 }), false);
});

test('Wilson intervals match known values', () => {
  const a = wilson(30, 39);
  assert.ok(Math.abs(a.lo - 0.616) < 0.002 && Math.abs(a.hi - 0.873) < 0.002, JSON.stringify(a));
  const z = wilson(0, 5);
  assert.equal(z.lo, 0); assert.ok(Math.abs(z.hi - 0.434) < 0.002);
  const f = wilson(5, 5);
  assert.equal(f.hi, 1); assert.ok(Math.abs(f.lo - 0.566) < 0.002);
  assert.deepEqual(wilson(0, 0), { p: 0, lo: 0, hi: 0 });
});

test('summaries aggregate per tier and per case', () => {
  const rec = (c, tier, pass, input, cached) => ({ case: c, tier, pass, outcome: pass ? 'ok' : 'empty_completion', ms: 2000, toolCalls: 4, tags: ['edit'],
    usage: { input, cacheRead: cached, output: 100, rounds: 5, model: `m-${tier}` }, checks: pass ? [] : [{ kind: 'metric', pass: false }] });
  const s = summarise([rec('a', 'default', true, 1000, 800), rec('b', 'default', false, 1000, 900), rec('a', 'complex', true, 2000, 1000)]);
  const d = s.byTier.find(t => t.tier === 'default');
  assert.equal(d.passed, 1); assert.equal(d.n, 2); assert.equal(d.cachedShare, 0.85); assert.equal(d.model, 'm-default');
  assert.deepEqual(d.outcomes, { ok: 1, empty_completion: 1 });
  assert.deepEqual(s.cases.find(c => c.id === 'b').byTier.default.fails, { metric: 1 });
  assert.match(markdown(s, { repeat: 1 }), /\| default \| m-default \| 1\/2 \|/);
});

// ── runCase on the real engine with a scripted model ─────────────────────────
const engine = await createNodeEngine();
const host = new Host({ engine });
await engine.ready;

/** A sample that runs the given eval codes in order, then answers. */
const scripted = (codes, answer) => async (turns, opts) => {
  for (const code of codes) await opts.tools[0].execute({ code }, { signal: opts.signal });
  opts.onText?.({ text: answer, delta: answer });
  return { text: answer, truncated: false, usage: { input: 1200, cacheRead: 1000, cacheWrite: 0, output: 50, rounds: codes.length + 1, toolCalls: codes.length } };
};
const EDIT = [
  "files.edit('script.js', 'wall: mm(2)', 'wall: mm(2.4)'); const r = await run(); return { ok: r.ok };",
  "return program.metrics('mass').mass.value;",
];
const wallCase = {
  id: 'wall', preset: 'A-01', request: 'Set the wall to 2.4 mm',
  checks: [{ kind: 'compiles' }, { kind: 'file', path: 'script.js', matches: 'wall:\\s*mm\\(2\\.4\\)' },
    { kind: 'metric', name: 'mass', approx: 22.505, tol: 0.01 }, { kind: 'answer', matches: ['22[.,]5'] }, { kind: 'steps', max: 4 }],
};

test('an edit case passes with a correct scripted turn, and records usage and steps', async () => {
  const r = await runCase(wallCase, { host, sample: scripted(EDIT, 'Done: the mass is now 22.5 g.') });
  assert.equal(r.pass, true, JSON.stringify(r.checks));
  assert.equal(r.outcome, 'ok');
  assert.equal(r.toolCalls, 2);
  assert.equal(r.usage.rounds, 3);
  assert.ok(r.promptChars > 40_000, `the prompt carries the reference (${r.promptChars} chars)`);
  assert.equal(r.steps[0].changed, true);
});

test('a wrong expectation fails, and the next case starts from the published preset', async () => {
  const wrong = { ...wallCase, checks: [{ kind: 'metric', name: 'mass', approx: 19.027, tol: 0.01 }] };
  const r = await runCase(wrong, { host, sample: scripted(EDIT, 'ok') });
  assert.equal(r.pass, false);
  assert.match(r.checks[0].detail, /mass 22\.50/);
  const fresh = await runCase({ id: 'q', preset: 'A-01', request: 'q', checks: [{ kind: 'metric', name: 'mass', approx: 19.027, tol: 0.01 }, { kind: 'unchanged' }] },
    { host, sample: scripted([], 'nothing to do') });
  assert.equal(fresh.pass, true, JSON.stringify(fresh.checks));
});

test('read-only mode refuses edits; setup edits plant a bug', async () => {
  const r = await runCase({ id: 'ro', preset: 'A-01', mode: 'read', request: 'make the walls thicker', checks: [{ kind: 'unchanged' }] },
    { host, sample: scripted([EDIT[0]], 'I would change line 6.') });
  assert.equal(r.pass, true);
  assert.equal(r.steps[0].error, true);
  const bug = await runCase({ id: 'bug', preset: 'A-01', request: 'fix it', setup: [{ edit: { path: 'script.js', find: "'h', { id: 'body' }", replace: "'height', { id: 'body' }" } }],
    checks: [{ kind: 'fails', diagnostic: 'param.unknown' }] }, { host, sample: scripted([], 'not fixed') });
  assert.equal(bug.pass, true, JSON.stringify(bug.checks));
});

test('ask mode approves every step; a turn past its deadline is recorded as such', async () => {
  const ask = await runCase({ ...wallCase, mode: 'ask' }, { host, sample: scripted(EDIT, 'Done: 22.5 g') });
  assert.equal(ask.pass, true, JSON.stringify(ask.checks));
  const hang = async (turns, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { code: 'cancelled' }))));
  const late = await runCase({ id: 'late', preset: 'A-01', request: 'x', checks: [{ kind: 'noNote' }] }, { host, sample: hang, deadlineMs: 300 });
  assert.equal(late.outcome, 'deadline');
  assert.equal(late.pass, false);
});

test('unhandled rejections are counted instead of ending the process', async () => {
  // node:test fails a test on any unhandled rejection (even an emitted one), so call the handler directly; the CLI run covers the
  // real path (eval code calling faces('…') without await)
  const { trackUnhandled, onUnhandled } = await import('../../tools/agent-eval/runner.mjs');
  const u = trackUnhandled(), before = u.count;
  onUnhandled(new Error("faces: selector: unknown token 'shell/inner*'"));
  assert.equal(u.count, before + 1);
  assert.match(u.last, /unknown token/);
});

test('captureUsage keeps error usage; noteCode maps turn notes back to codes', async () => {
  const cap = captureUsage(async () => { throw Object.assign(new Error('empty'), { code: 'empty_completion', usage: { input: 9, rounds: 16 } }); });
  await assert.rejects(cap.fn([{ role: 'user', content: 'x' }], {}));
  assert.equal(cap.usage.rounds, 16);
  assert.equal(cap.error.code, 'empty_completion');
  assert.equal(noteCode(null), 'ok');
  assert.equal(noteCode('Stopped.'), 'cancelled');
});

// ── the case set: every case is well formed, and its oracle (a known-good turn) passes it ─────────────────────
const { loadCases } = await import('../../tools/agent-eval/runner.mjs');
const { CHECKS } = await import('../../tools/agent-eval/checks.mjs');
const CASES = loadCases(new URL('./cases/', import.meta.url).pathname);

test('cases are well formed', () => {
  assert.ok(CASES.length >= 12, `${CASES.length} cases`);
  const ids = new Set();
  for (const c of CASES) {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`); ids.add(c.id);
    assert.ok(host.findPreset(c.preset), `${c.id}: no preset ${c.preset}`);
    assert.ok(['auto', 'read', 'ask'].includes(c.mode || 'auto'), `${c.id}: mode`);
    assert.ok(c.request && c.checks?.length, `${c.id}: request and checks`);
    for (const ch of c.checks) assert.ok(CHECKS[ch.kind], `${c.id}: unknown check ${ch.kind}`);
    assert.ok(c.oracle, `${c.id}: oracle`);
  }
});

test('every case passes with its oracle turn', async () => {
  for (const c of CASES) {
    const r = await runCase(c, { host, sample: scripted(c.oracle.steps, c.oracle.answer) });
    assert.equal(r.pass, true, `${c.id}: ${r.error || r.checks.filter(x => !x.pass).map(x => `${x.kind}: ${x.detail}`).join(' | ')}`);
  }
});
