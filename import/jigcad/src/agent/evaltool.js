// The agent's one tool, `eval`: an async function body run against the lab scope, raced against a 25 s timeout,
// its value serialised to YAML and cut at 9,000 characters. Files are snapshotted before each step.
import { labScope, filesObject } from './scope.js';
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

function compile(names, code) {
  return new Function(...names, '"use strict";\nreturn (async () => {\n' + code + '\n})();\n//# sourceURL=' + SOURCE_URL);
}

// The line of the step's own code that threw. The engine numbers the generated source, so find the offset once.
let lineOffset = null;
function probeOffset() {
  if (lineOffset !== null) return lineOffset;
  lineOffset = 0;
  try { compile([], 'throw new Error("probe")')().catch(e => { const n = frameLine(e); if (n) lineOffset = n - 1; }); } catch { /* keep 0 */ }
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

export function makeConsole(logs) {
  const line = args => args.map(a => (typeof a === 'string' ? a : yamlInline(a))).join(' ');
  const log = (...a) => { logs.push(line(a)); };
  return {
    log, info: log, debug: log,
    warn: (...a) => { logs.push('warn: ' + line(a)); },
    error: (...a) => { logs.push('error: ' + line(a)); },
    table: v => { logs.push(yaml(v)); },
  };
}

export function formatResult(value, logs, error) {
  const body = error ? errorText(error) : yaml(value);
  return logs.length ? `logs:\n${logs.join('\n')}\n---\n${body}` : body;
}

/**
 * Run one step's code against a fresh scope.
 * → { text, error: boolean, ms, value }
 */
export async function runEval(host, code, { readOnly = false, timeoutMs = EVAL_TIMEOUT_MS, signal } = {}) {
  const logs = [];
  const con = makeConsole(logs);
  const scope = labScope(host, { readOnly, console: con });
  delete scope.host;
  const names = Object.keys(scope).filter(k => IDENT.test(k));
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  let value, error = null, timer = null, onAbort = null;
  try {
    const fn = compile(names, String(code));
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
  const ms = Math.round(now() - t0);
  let text;
  try { text = formatResult(value, logs, error); } catch (e) { text = `Error: the result could not be written as YAML: ${e.message}`; error = e; }
  return { text: cut(text), error: !!error, ms, value };
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
 * opts: getMode() → 'auto' | 'ask' | 'read'; onStep(step) when created; onUpdate() on every change; signal (Stop).
 */
export function createEvalTool(host, { getMode = () => 'auto', onStep = () => {}, onUpdate = () => {}, signal, timeoutMs } = {}) {
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
      const r = await runEval(host, code, { readOnly: getMode() === 'read', signal: sig, timeoutMs });
      step.running = false; step.result = r.text; step.error = r.error; step.ms = r.ms;
      step.changed = filesChanged(step.snapshot, host);
      onUpdate();
      return r.text;
    },
  };
}
