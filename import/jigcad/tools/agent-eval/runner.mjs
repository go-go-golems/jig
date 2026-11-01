// The evaluation runner (JIG-003 design doc §5.4): one case = load the preset into the real Host, apply setup
// edits, compile, run one real agent turn (runTurn: eval tool, lab scope) against `sample`, recompile the final
// files, evaluate the checks, return a record. Import after registering tools/agent-eval/loader.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runTurn, newThread, NOTES } from '../../src/agent/turn.js';
import { evaluate } from './checks.mjs';

const STEP_TEXT = 400;
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

/** Read cases/*.json (sorted by file name); `filter` keeps ids containing any of its comma-separated parts. */
export function loadCases(dir, filter = '') {
  const parts = String(filter || '').split(',').map(s => s.trim()).filter(Boolean);
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ file: f, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
    .filter(c => !parts.length || parts.some(p => c.id.includes(p)));
}

/** Wrap a sample function so the last call's result or error (and its usage) can be read afterwards. */
export function captureUsage(sample) {
  const cap = { usage: null, error: null, promptChars: 0, calls: 0 };
  cap.fn = async (turns, opts) => {
    cap.calls++;
    cap.promptChars = typeof turns === 'string' ? turns.length : turns.reduce((n, t) => n + t.content.length, 0);
    try {
      const r = await sample(turns, opts);
      cap.usage = r?.usage ?? null;
      return r;
    } catch (e) {
      cap.usage = e?.usage ?? null;
      cap.error = { code: e?.code ?? null, message: e?.message ?? String(e) };
      throw e;
    }
  };
  return cap;
}

function applySetup(host, s) {
  if (s.edit) {
    const { path, find, replace } = s.edit;
    const text = host.files.get(path);
    if (text == null || !text.includes(find)) throw new Error(`setup: ${path} does not contain ${JSON.stringify(find)}`);
    host.setFile(path, text.replace(find, replace));
  } else if (s.file) host.setFile(s.file.path, s.file.text);
  else if (s.override) for (const [k, v] of Object.entries(s.override)) host.setOverride(k, v);
  else throw new Error(`setup: unknown step ${JSON.stringify(s)}`);
}

export function noteCode(note) {
  if (!note) return 'ok';
  const hit = Object.entries(NOTES).find(([, sentence]) => sentence === note);
  return hit ? hit[0] : 'interrupted';
}

const stepSummary = s => ({ code: cut(s.code, STEP_TEXT), result: cut(s.result, STEP_TEXT), ms: s.ms, error: !!s.error, changed: !!s.changed });

/**
 * Run one case. opts: { host, sample, tier, repeat, deadlineMs }.
 * → { case, tier, repeat, pass, outcome, timedOut, ms, toolCalls, usage, promptChars, checks, answer, note, steps, error? }
 */
export async function runCase(c, { host, sample, tier = 'default', repeat = 1, deadlineMs = 300_000 }) {
  const base = { case: c.id, tier, repeat, mode: c.mode || 'auto', tags: c.tags || [] };
  try {
    if (!(await host.loadPreset(c.preset))) throw new Error(`no preset ${c.preset}`);
    host.resetOverrides();
    for (const s of c.setup || []) applySetup(host, s);
    await host.compile();
  } catch (e) {
    return { ...base, pass: false, outcome: 'setup_error', error: e.message, checks: [], toolCalls: 0, ms: 0 };
  }
  const initialFiles = Object.fromEntries(host.files);
  const thread = newThread();
  const cap = captureUsage(sample);
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, deadlineMs);
  const mode = c.mode === 'read' ? 'read' : c.mode === 'ask' ? 'ask' : 'auto';
  // Ask mode: approve every step once its approval promise exists (runTurn reports the step before it waits)
  const approve = () => setTimeout(() => {
    const turn = thread.turns[thread.turns.length - 1];
    for (const s of turn?.steps || []) if (s.asking && s.resolve) s.resolve(true);
  }, 0);
  const t0 = performance.now();
  try {
    await runTurn({ host, sample: cap.fn, thread, text: c.request, settings: { mode, tier, effort: c.effort || '' },
      reference: host.reference(), signal: ctl.signal, onUpdate: mode === 'ask' ? approve : () => {} });
  } finally { clearTimeout(timer); }
  const ms = Math.round(performance.now() - t0);
  const turn = thread.turns[thread.turns.length - 1];
  // judge what the person would see after the turn: the final files (and overrides) compiled
  const program = await host.compile();
  const checks = evaluate(c, { initialFiles, files: Object.fromEntries(host.files), program, turn, steps: turn.steps, truncatedNote: NOTES.truncated });
  return {
    ...base, pass: checks.every(x => x.pass), outcome: timedOut ? 'deadline' : noteCode(turn.note), timedOut, ms,
    toolCalls: turn.steps.length, usage: cap.usage, promptChars: cap.promptChars, sampleError: cap.error,
    checks, answer: turn.text, note: turn.note || null, steps: turn.steps.map(stepSummary),
  };
}

/** Run every case × tier × repeat in order; onRecord(record) after each (e.g. append to results.jsonl). */
/** sampleFor(case) may give each case its own sample function (the CLI's --oracle mode); else `sample` is used. */
export async function runAll(cases, { host, sample, sampleFor = null, tiers = ['default'], repeat = 1, deadlineMs, onRecord = () => {}, log = () => {} }) {
  const out = [];
  for (const tier of tiers) for (let r = 1; r <= repeat; r++) for (const c of cases) {
    log(`… ${tier} #${r} ${c.id}`);
    const rec = await runCase(c, { host, sample: sampleFor ? sampleFor(c) : sample, tier, repeat: r, deadlineMs });
    out.push(rec);
    onRecord(rec);
    const u = rec.usage;
    log(`${rec.pass ? 'PASS' : 'FAIL'} ${tier} #${r} ${c.id} · ${rec.outcome} · ${rec.toolCalls} tools · ${(rec.ms / 1000).toFixed(1)} s` +
      (u ? ` · in ${u.input} (cached ${u.cacheRead}) out ${u.output}` : '') +
      (rec.pass ? '' : ` · ${rec.checks.filter(x => !x.pass).map(x => `${x.kind}: ${x.detail}`).join(' | ') || rec.error || ''}`));
  }
  return out;
}
