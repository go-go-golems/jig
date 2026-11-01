// The agent's one tool, `eval`: an async function body run against the lab scope, raced against a 25 s timeout,
// its value serialised to YAML and cut at 9,000 characters. Files are snapshotted before each step.
import { labScope, filesObject } from './scope.js';
import { runInSandbox } from './sandbox/client.js';
import { yaml, yamlInline } from './yaml.js';

export const EVAL_TIMEOUT_MS = 25000;
export const RESULT_CUT = 9000;
export const DECLINED_RESULT = 'The person declined this step.';
export const DECLINED_TO_MODEL = 'Declined by the person. Ask what they want instead, or explain the change without running it.';

export const EVAL_TOOL_DESCRIPTION = 'Run an async JavaScript function body in the jigcad workbench with the lab API in scope (files, run, check, program, why, faces, feature, sketch, select, view, params, measure, exportFile, presets, lab). Returns the value as YAML plus console.log output. Use `return` to return a value.';
export const EVAL_INPUT_SCHEMA = {
  type: 'object',
  properties: { code: { type: 'string', description: 'the body of an async function; return what you want to see' } },
  required: ['code'],
};

const SOURCE_URL = 'agent-eval.js';
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** The step's code as an async function of the scope's names (the sandbox runner uses the same, so lines match). */
export function compileStep(names, code) {
  return new Function(...names, '"use strict";\nreturn (async () => {\n' + code + '\n})();\n//# sourceURL=' + SOURCE_URL);
}

// The line of the step's own code that threw. The engine numbers the generated source, so find the offset once.
let lineOffset = null;
function probeOffset() {
  if (lineOffset !== null) return lineOffset;
  lineOffset = 0;
  try { compileStep([], 'throw new Error("probe")')().catch(e => { const n = frameLine(e); if (n) lineOffset = n - 1; }); } catch { /* keep 0 */ }
  return lineOffset;
}
function frameLine(e) {
  const m = e && typeof e.stack === 'string' && e.stack.match(new RegExp(SOURCE_URL.replace('.', '\\.') + ':(\\d+)'));
  return m ? +m[1] : null;
}
probeOffset();

export function errorText(e) {
  if (e == null) return 'Error: undefined';
  if (typeof e !== 'object') return `Error: ${String(e)}`;
  const name = e.name && e.name !== 'Error' ? e.name : 'Error';
  let msg = `${name}: ${e.message ?? e.code ?? String(e)}`;
  const n = frameLine(e);
  if (n) msg += ` (line ${Math.max(1, n - (lineOffset || 0))})`;
  return msg;
}

export function cut(text, max = RESULT_CUT) {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n… cut (${text.length} chars). Return less: pick fields, slice arrays.`;
}

// ── tracked promises (JIG-004) ────────────────────────────────────────────────
// Lab functions that ask the engine (faces, why, feature, sketch, check, run, …) return promises. Code that forgets
// `await` works with the promise instead of the value: its YAML is {}, and a rejection surfaces after the step.
// runEval wraps the scope so every promise a lab function returns is tracked; `await`, returning it, Promise.all,
// .then/.catch/.finally mark it consumed. What is still unconsumed when the step ends gets a note in the result,
// with its error if it failed, and shows as a marker wherever it appears in the value or a log line.
const TRACKED = Symbol('jigcad.trackedPromise');
// A tool result with images (JIG-006): sample adapters that can carry images send them next to the value (see
// src/host/sample-http.js); others send the value alone.
export const TOOL_IMAGES = Symbol.for('jigcad.toolImages');
export const withImages = (value, images) => ({ [TOOL_IMAGES]: images, value });
const argText = a => {
  let s;
  // strings in single quotes, as the model writes them (and as YAML quoting leaves them readable)
  try { s = typeof a === 'string' ? `'${a.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : a === undefined ? 'undefined' : typeof a === 'function' ? 'fn' : JSON.stringify(a) ?? String(a); } catch { s = '…'; }
  return s.length > 60 ? s.slice(0, 59) + '…' : s;
};
function track(p, label, promises) {
  const t = { label, consumed: false, settled: false, error: null, p: null };
  t.p = Promise.resolve(p).then(() => { t.settled = true; }, e => { t.settled = true; t.error = e; });   // handled: no unhandled rejection
  promises.push(t);
  const tp = {
    then(a, b) { t.consumed = true; return Promise.resolve(p).then(a, b); },
    catch(b) { t.consumed = true; return Promise.resolve(p).catch(b); },
    finally(f) { t.consumed = true; return Promise.resolve(p).finally(f); },
  };
  Object.defineProperty(tp, TRACKED, { value: t });
  Object.defineProperty(tp, Symbol.toStringTag, { value: 'Promise' });
  return tp;
}
/** The scope with every function (one level into namespaces) wrapped so returned promises are tracked. */
export function trackScope(scope, promises) {
  const wrap = (fn, name) => (...args) => {
    const r = fn(...args);
    return r && typeof r.then === 'function' && !r[TRACKED] ? track(r, `${name}(${args.map(argText).join(', ')})`, promises) : r;
  };
  const out = {};
  for (const [k, v] of Object.entries(scope)) {
    if (k === 'console' || k === 'log') out[k] = v;
    else if (typeof v === 'function') out[k] = wrap(v, k);
    else if (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype) {
      out[k] = Object.fromEntries(Object.entries(v).map(([k2, v2]) => [k2, typeof v2 === 'function' ? wrap(v2, `${k}.${k2}`) : v2]));
    } else out[k] = v;
  }
  return out;
}
const isPlain = v => v && typeof v === 'object' && (Array.isArray(v) || [Object.prototype, null].includes(Object.getPrototypeOf(v)));
/** A copy of v with tracked promises replaced by marker strings (plain objects and arrays, depth ≤ 8). */
export function markPromises(v, depth = 0, seen = new WeakSet()) {
  if (v && typeof v === 'object' && v[TRACKED]) return `<Promise from ${v[TRACKED].label}: not awaited>`;
  if (!isPlain(v) || depth > 8 || seen.has(v)) return v;
  seen.add(v);
  if (Array.isArray(v)) return v.map(x => markPromises(x, depth + 1, seen));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = markPromises(x, depth + 1, seen);
  return out;
}
/** Notes for the promises a step never consumed (same call written several times: one note with a count). */
export function promiseNotes(promises) {
  const open = new Map();
  for (const t of promises) if (!t.consumed) open.set(t.label, [...(open.get(t.label) || []), t]);
  return [...open].map(([label, ts]) => {
    const err = ts.find(t => t.error)?.error;
    return `note: ${label} returned a Promise that this step never awaited${ts.length > 1 ? ` (${ts.length}×)` : ''}. Write: const x = await ${label};` +
      (err ? ` It failed: ${err?.message ?? err}` : '');
  });
}

export function makeConsole(logs, mark = x => x) {
  const line = args => args.map(a0 => { const a = mark(a0); return typeof a === 'string' ? a : yamlInline(a); }).join(' ');
  const log = (...a) => { logs.push(line(a)); };
  return {
    log, info: log, debug: log,
    warn: (...a) => { logs.push('warn: ' + line(a)); },
    error: (...a) => { logs.push('error: ' + line(a)); },
    table: v => { logs.push(yaml(mark(v))); },
  };
}

export function formatResult(value, logs, error, notes = []) {
  const body = (error ? errorText(error) : yaml(markPromises(value))) + (notes.length ? '\n' + notes.join('\n') : '');
  return logs.length ? `logs:\n${logs.join('\n')}\n---\n${body}` : body;
}

/**
 * Run one step's code against a fresh scope.
 * → { text, error: boolean, ms, value, images: [{ mimeType, data }] (from look()) }
 */
export async function runEval(host, code, { readOnly = false, timeoutMs = EVAL_TIMEOUT_MS, signal } = {}) {
  const logs = [];
  const promises = [];
  const con = makeConsole(logs, markPromises);
  const images = [];
  const scope = trackScope(labScope(host, { readOnly, console: con, images }), promises);
  delete scope.host;
  const names = Object.keys(scope).filter(k => IDENT.test(k));
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  let value, error = null, timer = null, onAbort = null;
  try {
    const fn = compileStep(names, String(code));
    const racers = [
      fn(...names.map(k => scope[k])),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`eval timed out after ${Math.round(timeoutMs / 100) / 10} s`)), timeoutMs); }),
    ];
    if (signal) racers.push(new Promise((_, rej) => {
      onAbort = () => rej(Object.assign(new Error('stopped by the person'), { code: 'cancelled' }));
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    }));
    value = await Promise.race(racers);
  } catch (e) { error = e || new Error('undefined'); }
  finally { clearTimeout(timer); if (signal && onAbort) signal.removeEventListener('abort', onAbort); }
  // promises the step never consumed: give pending ones a moment to settle, so a failure can be reported
  const open = promises.filter(t => !t.consumed && !t.settled);
  if (open.length) await Promise.race([Promise.all(open.map(t => t.p)), new Promise(r => setTimeout(r, 1000))]);
  const ms = Math.round(now() - t0);
  let text;
  try { text = formatResult(value, logs, error, promiseNotes(promises)); } catch (e) { text = `Error: the result could not be written as YAML: ${e.message}`; error = e; }
  return { text: cut(text), error: !!error, ms, value, images };
}

// ── snapshots ────────────────────────────────────────────────────────────────
export function takeSnapshot(host) {
  let token = null;
  try { token = typeof host.snapshot === 'function' ? host.snapshot() : null; } catch { token = null; }
  return { token, files: filesObject(host) };
}
export function filesChanged(snapshot, host) {
  const now = filesObject(host), before = snapshot.files;
  const a = Object.keys(before), b = Object.keys(now);
  if (a.length !== b.length) return true;
  return a.some(k => now[k] !== before[k]);
}
export async function restoreSnapshot(host, snapshot) {
  if (typeof host.restore === 'function') await host.restore(snapshot.token ?? snapshot.files);
  else {
    const m = host.files;
    if (m instanceof Map) { m.clear(); for (const [k, v] of Object.entries(snapshot.files)) m.set(k, v); }
    else host.files = { ...snapshot.files };
  }
}

/**
 * The tool object handed to sample(). Each call creates a step record:
 * { code, result, running, asking, resolve, error, ms, snapshot, changed, reverted }.
 * opts: getMode() → 'auto' | 'ask' | 'read'; onStep(step) when created; onUpdate() on every change; signal (Stop);
 * sandbox: a sandbox client (src/agent/sandbox/client.js), or a function resolving to one, or null for the page.
 */
export function createEvalTool(host, { getMode = () => 'auto', onStep = () => {}, onUpdate = () => {}, signal, timeoutMs, sandbox = null } = {}) {
  return {
    name: 'eval',
    description: EVAL_TOOL_DESCRIPTION,
    inputSchema: EVAL_INPUT_SCHEMA,
    async execute(input, c) {
      const code = String(input && input.code != null ? input.code : input ?? '');
      const sig = (c && c.signal) || signal;
      const step = { code, result: null, running: true, asking: false, resolve: null, error: false, ms: 0, snapshot: null, changed: false, reverted: false };
      onStep(step);
      onUpdate();
      if (getMode() === 'ask') {
        step.asking = true; onUpdate();
        const ok = await new Promise(res => {
          step.resolve = res;
          if (sig) { if (sig.aborted) res(false); else sig.addEventListener('abort', () => res(false), { once: true }); }
        });
        step.asking = false; step.resolve = null;
        if (!ok) {
          step.running = false; step.error = true; step.result = DECLINED_RESULT; onUpdate();
          return DECLINED_TO_MODEL;
        }
      }
      if (sig && sig.aborted) {
        step.running = false; step.error = true; step.result = 'Error: stopped by the person'; onUpdate();
        throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      }
      step.snapshot = takeSnapshot(host);
      step.running = true; onUpdate();
      // JIG-012: the step runs in the sandbox (its own engine, j in scope) when there is one; on the page otherwise
      const sb = typeof sandbox === 'function' ? await sandbox() : sandbox;
      let r;
      if (sb) {
        try { r = await runInSandbox(sb, host, code, { readOnly: getMode() === 'read', signal: sig, timeoutMs }); }
        catch (e) {
          if (sig && sig.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
          r = await runEval(host, code, { readOnly: getMode() === 'read', signal: sig, timeoutMs });
          r.text += `\nnote: the sandbox could not run this step (${e.message}); it ran on the page, where j and the units are not available`;
        }
      } else r = await runEval(host, code, { readOnly: getMode() === 'read', signal: sig, timeoutMs });
      step.running = false; step.result = r.text; step.error = r.error; step.ms = r.ms;
      step.changed = filesChanged(step.snapshot, host);
      if (r.images.length) step.images = r.images.length;
      onUpdate();
      return r.images.length ? withImages(r.text, r.images) : r.text;
    },
  };
}
