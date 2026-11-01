// One turn: append the user's words and an agent turn, call sample() once with the eval tool, stream the answer,
// turn a rejection into one plain sentence. The loop of tool rounds belongs to the capability (how-the-agent-works.md).
import { createEvalTool, restoreSnapshot } from './evaltool.js';
import { toTurns } from './prompt.js';

export const TIERS = { fast: 'quick', balanced: 'default', deep: 'complex' };
export const EFFORTS = { auto: '', low: 'low', med: 'medium', high: 'high' };
export const THREAD_TITLE = 32;

// The off banner's sentences (modes-and-permissions.md, "When Claude is not available").
export const OFF_TITLE = 'The agent is off here.';
export const OFF_AT_LOAD = 'Claude is not available in this view, so the agent cannot run. Everything else in the workbench works.';
export const OFF_AT_SEND = 'Claude is not available here, so the agent is off. Everything else in the workbench works.';
export const OFF_CODES = {
  not_granted: 'Claude is not allowed for this page. You can allow it from the artifact’s permissions.',
  sampling_disabled: 'Claude is not available for this account.',
  not_declared: 'This page no longer asks for Claude.',
  capability_disabled: 'Claude is unavailable in this view.',
  tools_unavailable: 'This view cannot run the agent’s tool.',
  capability_removed: 'This app version cannot run the agent.',
  unauthorized: 'This server needs its access token. Open the workbench once with ?token=… in the address.',
};
// Notes under a turn that ended early.
export const NOTES = {
  cancelled: 'Stopped.',
  rate_limited: 'Too many requests just now; try again in a little while.',
  prompt_too_large: 'The conversation is too long. Start a new thread.',
  refused: 'Claude declined this request.',
  truncated: 'The answer hit the length limit.',
  authentication_error: 'The model provider rejected the server’s login. Log in through Pi, then restart jigcad serve.',
  empty_completion: 'The model returned an empty answer. Try again, or pick another model.',
};

/** The sentence for a rejection: { note, off } where off is the banner sentence when the agent cannot work here. */
export function explainError(e) {
  const code = e && typeof e === 'object' ? e.code : null;
  if (code && OFF_CODES[code]) return { note: OFF_CODES[code], off: OFF_CODES[code] };
  if (code && NOTES[code]) return { note: NOTES[code], off: null };
  if (e && e.name === 'AbortError') return { note: NOTES.cancelled, off: null };
  const msg = (e && (e.message || e.code)) || String(e);
  return { note: `Interrupted: ${msg}`, off: null };
}

export const newThread = () => ({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: 'New thread', turns: [], created: Date.now() });

/** Closed threads with turns, newest first, at most ARCHIVE_MAX (the panel's History). */
export const ARCHIVE_MAX = 50;
export function archiveThread(archive, thread, now = Date.now()) {
  if (!thread || !thread.turns || !thread.turns.length) return archive || [];
  const rest = (archive || []).filter(t => t.id !== thread.id);
  return [{ ...thread, closed: now }, ...rest].slice(0, ARCHIVE_MAX);
}

/**
 * Run a whole turn on `thread`.
 * opts: host, sample (the capability function), text, settings { mode, tier, effort }, reference,
 *       signal (Stop), onUpdate() after every change, timeoutMs (tests).
 * → { ok, off? } where off is the banner sentence when the agent cannot work here.
 */
export async function runTurn({ host, sample, thread, text, images = [], settings, reference = '', signal, onUpdate = () => {}, timeoutMs }) {
  text = String(text || '').trim();
  if (!text) return { ok: false };
  if (!sample) return { ok: false, off: OFF_AT_SEND };
  thread.turns.push(images.length ? { role: 'user', text, images: images.length } : { role: 'user', text });   // the count, not the bytes
  if (thread.title === 'New thread') thread.title = text.slice(0, THREAD_TITLE);
  thread.updated = Date.now();
  if (!thread.preset && host && host.preset) thread.preset = host.preset.id;
  const turn = { role: 'agent', text: '', steps: [], pending: true };
  thread.turns.push(turn);
  onUpdate();

  const tool = createEvalTool(host, {
    getMode: () => settings.mode,
    onStep: s => turn.steps.push(s),
    onUpdate,
    signal,
    timeoutMs,
  });
  const turns = toTurns(host, { ...thread, turns: thread.turns.slice(0, -1) }, reference);
  const opts = { tools: [tool], signal, modelTier: settings.tier || 'default', cache: false,
    onText: ({ text: t }) => { turn.text = t; addBlock(turn, 'text', t); onUpdate(); },
    onThinking: ({ text: t }) => { addBlock(turn, 'thought', t); onUpdate(); } };
  if (settings.effort) opts.effort = settings.effort;
  if (images.length) opts.images = images;
  let off = null;
  try {
    const res = await sample(turns, opts);
    turn.text = (res && res.text) ?? turn.text;
    if (res && res.modelApplied) turn.model = res.modelApplied;
    if (res && res.truncated) turn.note = NOTES.truncated;
  } catch (e) {
    const x = explainError(e);
    turn.note = x.note;
    off = x.off;
    if (e && e.code === 'refused') { turn.text = ''; if (turn.blocks) turn.blocks = turn.blocks.filter(b => b.kind !== 'text'); }
  }
  for (const s of turn.steps) if (s.asking && s.resolve) s.resolve(false);
  turn.pending = false;
  thread.updated = Date.now();
  onUpdate();
  return { ok: !turn.note || turn.note === NOTES.truncated, off };
}

/**
 * What the person sees of a turn, in order: blocks of reasoning ('thought') and of text ('text'), each placed before
 * the step it led to. `block.at` is the number of steps taken when the block began, so blocks with at = steps.length
 * come after the last step. `full` is the call's cumulative stream of that kind (rounds joined by a blank line, as
 * the server sends it); a block ends when the other kind arrives or a step is taken. turn.text stays the whole text:
 * the history and the evaluation read it.
 */
export function addBlock(turn, kind, full) {
  full = String(full || '');
  const blocks = turn.blocks || (turn.blocks = []);
  const seen = turn.seen || (turn.seen = { thought: 0, text: 0 });
  const k = (turn.steps || []).length;
  let last = blocks[blocks.length - 1];
  if (!last || last.kind !== kind || last.at !== k) {
    last = { kind, at: k, from: Math.min(seen[kind], full.length), text: '' };
    blocks.push(last);
  }
  seen[kind] = full.length;
  last.text = full.slice(last.from).replace(/^\s+/, '');
  return last;
}

/** Revert the files to before step i of a turn; marks it and every later step reverted. */
export async function revertStep(host, turn, i) {
  const s = turn.steps[i];
  if (!s || !s.snapshot) { host.toast && host.toast('This step’s snapshot is gone (reloaded page)', 'error'); return false; }
  await restoreSnapshot(host, s.snapshot);
  for (let j = i; j < turn.steps.length; j++) turn.steps[j].reverted = true;
  try { await host.compile(); } catch { /* the compile result shows in the workbench */ }
  host.toast && host.toast('Reverted the files to before that step and recompiled');
  return true;
}

// ── storage (localStorage under jigcad.v1.; every access wrapped) ─────────────
const PREFIX = 'jigcad.v1.';
export const TURNS_STORED = 30;
export const RESULT_STORED = 3000;
export const THOUGHT_STORED = 4000;   // characters of each reasoning segment kept in localStorage

function store() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }
export function load(key, fallback) {
  try { const s = store(); const v = s && s.getItem(PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function save(key, value) {
  try { const s = store(); if (!s) return false; s.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; /* storage full or blocked: this page load only */ }
}
export function trimThreads(threads) {
  return threads.map(th => ({
    id: th.id, title: th.title,
    ...(th.created ? { created: th.created } : {}), ...(th.updated ? { updated: th.updated } : {}),
    ...(th.closed ? { closed: th.closed } : {}), ...(th.preset ? { preset: th.preset } : {}),
    turns: th.turns.slice(-TURNS_STORED).map(t => t.role === 'user' ? { role: 'user', text: t.text, ...(t.images ? { images: t.images } : {}) } : {
      role: 'agent', text: t.text, ...(t.note ? { note: t.note } : {}), ...(t.model ? { model: t.model } : {}),
      ...(t.blocks && t.blocks.length ? { blocks: t.blocks.filter(x => x.text).map(x => ({ kind: x.kind, at: x.at,
        text: x.kind === 'thought' && x.text.length > THOUGHT_STORED ? x.text.slice(0, THOUGHT_STORED) + '\n…' : x.text })) } : {}),
      steps: (t.steps || []).map(s => ({
        code: s.code, ms: s.ms, error: !!s.error, changed: !!s.changed, reverted: !!s.reverted,
        result: s.result && s.result.length > RESULT_STORED ? s.result.slice(0, RESULT_STORED) + '\n…' : s.result,
      })),
    }),
  }));
}
