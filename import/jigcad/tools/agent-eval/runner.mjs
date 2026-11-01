// The evaluation runner (JIG-003 design doc §5.4): one case = load the preset into the real Host, apply setup
// edits, compile, run one real agent turn (runTurn: eval tool, lab scope) against `sample`, recompile the final
// files, evaluate the checks, return a record. Import after registering tools/agent-eval/loader.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runTurn, newThread, NOTES } from '../../src/agent/turn.js';
import { evaluate } from './checks.mjs';

const STEP_TEXT = 400;

// Eval code that starts a promise without awaiting it (`faces('x')` instead of `await faces('x')`) leaves a
// rejection nobody handles. A browser logs it to the console and the page goes on; Node's default ends the process.
// The runner behaves like the page: it counts such rejections and records them on the case that was running.
const unhandled = { count: 0, last: null, installed: false };
/** Record one unhandled rejection (the process-level handler; exported for tests). */
export function onUnhandled(reason) { unhandled.count++; unhandled.last = String(reason?.message ?? reason).slice(0, 300); }
export function trackUnhandled() {
  if (!unhandled.installed) { unhandled.installed = true; process.on('unhandledRejection', onUnhandled); }
  return unhandled;
}
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

/** Read cases/*.json (sorted by file name); `filter` keeps ids containing any of its comma-separated parts. */
export function loadCases(dir, filter = '') {
  const parts = String(filter || '').split(',').map(s => s.trim()).filter(Boolean);
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ file: f, dir, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
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

/** A case's images (file names in test/agent-eval/images, JPEG) as { mimeType, data }. */
export function caseImages(c) {
  return (c.images || []).map(f => ({ mimeType: 'image/jpeg', data: readFileSync(join(c.dir || '.', '..', 'images', f)).toString('base64') }));
}

/** Usage of several turns added up (the model name of the last). */
export function sumUsage(list) {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const out = { ...list[list.length - 1] };
  for (const k of ['input', 'cacheRead', 'cacheWrite', 'output', 'rounds', 'toolCalls']) out[k] = list.reduce((n, u) => n + (u[k] || 0), 0);
  return out;
}

const stepSummary = s => ({ code: cut(s.code, STEP_TEXT), result: cut(s.result, STEP_TEXT), ms: s.ms, error: !!s.error, changed: !!s.changed });

/**
 * Run one case. opts: { host, sample, tier, repeat, deadlineMs }.
 * c.followUps (optional) are further requests in the same thread; checks then judge the final state, the last answer
 * and the steps of all turns.
 * → { case, tier, repeat, pass, outcome, timedOut, ms, toolCalls, turns, usage, promptChars, checks, answer, answers?, note, steps, error? }
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
  const seen = trackUnhandled(), unhandledBefore = seen.count;
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
  // one request, or a conversation: followUps run as further turns of the same thread, each after the last finished
  const requests = [c.request, ...(c.followUps || [])];
  const images = caseImages(c);                    // JIG-006: pictures sent with the first request
  const usages = [];
  try {
    for (const text of requests) {
      if (ctl.signal.aborted) break;
      cap.usage = null;
      await runTurn({ host, sample: cap.fn, thread, text, images: text === c.request ? images : [], settings: { mode, tier, effort: c.effort || '' },
        reference: host.reference(), signal: ctl.signal, onUpdate: mode === 'ask' ? approve : () => {} });
      if (cap.usage) usages.push(cap.usage);
    }
  } finally { clearTimeout(timer); }
  const ms = Math.round(performance.now() - t0);
  await new Promise(r => setTimeout(r, 0));   // let rejections of the turn's last step surface
  const agentTurns = thread.turns.filter(t => t.role !== 'user');
  const turn = agentTurns[agentTurns.length - 1];
  const steps = agentTurns.flatMap(t => t.steps);
  // judge what the person would see after the turn: the final files (and overrides) compiled
  const program = await host.compile();
  const checks = evaluate(c, { initialFiles, files: Object.fromEntries(host.files), program, turn, steps, truncatedNote: NOTES.truncated });
  return {
    ...base, pass: checks.every(x => x.pass), outcome: timedOut ? 'deadline' : noteCode(turn.note), timedOut, ms,
    toolCalls: steps.length, turns: agentTurns.length, usage: sumUsage(usages), promptChars: cap.promptChars, sampleError: cap.error,
    unhandledRejections: seen.count - unhandledBefore, ...(seen.count > unhandledBefore ? { lastUnhandled: seen.last } : {}),
    checks, answer: turn.text, note: turn.note || null, steps: steps.map(stepSummary),
    ...(agentTurns.length > 1 ? { answers: agentTurns.map(t => t.text) } : {}),
    // the model's reasoning, before which step of its turn it came (empty for a model that does not stream it)
    ...(agentTurns.some(t => (t.blocks || []).some(b => b.kind === 'thought' && b.text))
      ? { thinking: agentTurns.flatMap((t, n) => (t.blocks || []).filter(b => b.kind === 'thought' && b.text).map(b => ({ turn: n, at: b.at, text: b.text }))) } : {}),
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

/**
 * A sample function that replays a case's oracle (a known-good scripted turn, or one per request when the case has
 * followUps: oracle.turns = [{ steps, answer }, …]) instead of asking a model.
 */
export function oracleSample(c) {
  const turns = c.oracle?.turns || [c.oracle || {}];
  let i = 0;
  return async (_, opts) => {
    const t = turns[Math.min(i++, turns.length - 1)];
    for (const code of t.steps || []) await opts.tools[0].execute({ code }, { signal: opts.signal });
    const text = t.answer || '';
    opts.onText?.({ text, delta: text });
    return { text, truncated: false, usage: { input: 1200, cacheRead: 1000, cacheWrite: 0, output: 50, rounds: (t.steps || []).length + 1, toolCalls: (t.steps || []).length } };
  };
}
