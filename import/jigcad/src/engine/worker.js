// The engine worker (BUILD.md §2): init, compile, call, solveSketch, export, run.
// Also usable in Node: import { handle } and call handle({ id, op, ... }) directly.
import { loadOC, ocReady } from './oc.js';
import { makeJ, VERSION } from './j.js';
import { compile as compileModel, gc, releasePrograms } from './program.js';
import { exportAs } from './io.js';
import { featureCache } from './compile.js';
import * as RS from './rs/index.js';

let J = null, BARE = null;
let current = null;            // the last Program (kept for `call` and `export`)
let currentScope = null;       // { j, bare, data } of the last compile, for evaluating selector text
// Named slots (JIG-013): Programs kept beside the current one, each answering callSync(slot, …). The agent's
// sandbox keeps 'shadow' (the page's last good compile) and 'check' (its last check()). Every slot's bodies
// survive gc(): see keepAll().
const slots = new Map();       // slot → { prog, scope }
const keepAll = (...extra) => releasePrograms(current, ...[...slots.values()].map(s => s.prog), ...extra);
const setSlot = (slot, prog, scope) => { if (!slot || slot === 'current') { current = prog; currentScope = scope; } else slots.set(slot, { prog, scope }); };

export async function init(opts) {
  const t0 = performance.now();
  await loadOC(opts);
  // jig-compute (Rust → wasm) takes the numeric hot paths; without it the engine runs its JS implementations
  try { await RS.loadCompute(opts ?? {}); } catch (e) { console.warn(`jig-compute unavailable, using JS: ${e.message}`); }
  if (!J) { const m = makeJ(); J = m.j; BARE = m.bare; }
  return { ms: performance.now() - t0, version: VERSION, compute: computeInfo() };
}

// Parse preset data files: .json → object, .csv → { columns, rows }, other text → string
export function parseData(files = {}, entry = 'script.js') {
  const data = {};
  for (const [path, text] of Object.entries(files)) {
    if (path === entry || path.endsWith('.md')) continue;
    const key = path.replace(/^.*\//, '');
    const base = key.replace(/\.[^.]+$/, '');
    let v = text;
    try {
      if (/\.json$/i.test(path)) v = JSON.parse(text);
      else if (/\.csv$/i.test(path)) v = parseCSV(text);
    } catch (e) { v = text; }
    data[key] = v; if (!(base in data)) data[base] = v;
  }
  return data;
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const split = l => l.split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1'));
  const columns = split(lines[0] ?? '');
  const rows = lines.slice(1).map(l => { const c = split(l); return Object.fromEntries(columns.map((k, i) => [k, c[i] !== undefined && c[i] !== '' && !isNaN(+c[i]) ? +c[i] : c[i]])); });
  return { columns, rows };
}

// Run a script body with j, the bare unit names and data in scope. sourceURL=script.js maps errors to lines.
const SCRIPT_HEADER_LINES = 1;
export async function runScript(code, { data = {}, extra = {}, file = 'script.js' } = {}) {
  if (!J) await init();
  const names = ['j', ...Object.keys(BARE), 'data', ...Object.keys(extra)];
  const values = [J, ...Object.values(BARE), data, ...Object.values(extra)];
  const src = `(async function (${names.join(', ')}) {\n${code}\n})\n//# sourceURL=${file}`;
  let fn;
  try { fn = (0, eval)(src); }
  catch (e) { throw scriptError(e, code, file, true, names); }
  try { return await fn(...values); }
  catch (e) { throw scriptError(e, code, file); }
}
function scriptError(e, code, file, syntax = false, names = []) {
  const err = { message: e?.message ?? String(e), stack: e?.stack ?? '', file, kind: e?.kind };
  const re = new RegExp(`${file.replace('.', '\\.')}:(\\d+):(\\d+)`);
  const m = re.exec(err.stack);
  if (m) { err.line = +m[1] - SCRIPT_HEADER_LINES; err.column = +m[2]; }
  else if (syntax) {
    // V8 gives no position for eval syntax errors: bisect by compiling growing prefixes
    const lines = code.split('\n');
    for (let i = 1; i <= lines.length; i++) {
      try { new Function(...names, lines.slice(0, i).join('\n') + '\n}}}}}}}}}}'); } catch (x) { if (!/Unexpected end|missing \) after|Unexpected token '}'/.test(x.message)) { err.line = i; break; } }
    }
  }
  if (err.line != null) err.message = `${err.message} (script.js:${err.line}${err.column ? ':' + err.column : ''})`;
  return Object.assign(new Error(err.message), { info: err });
}

const computeInfo = () => ({ kind: RS.enabled() ? 'rust' : 'js', reason: RS.status.reason, version: RS.status.version, ms: RS.status.ms });

export async function compileFiles({ files = {}, entry = 'script.js', data, options = {} }) {
  if (!J) await init();
  RS.resetArena();   // mesh handles of the previous compile go; TriSoups still referenced rebuild on use
  const d = data ?? parseData(files, entry);
  const code = files[entry];
  keepAll();   // programs made by the previous script may go; the current one and the slots stay until replaced
  if (code == null) throw new Error(`no ${entry} in files`);
  let model;
  const ts = performance.now();
  const logs = [];
  try { model = await runScript(code, { data: d, file: entry, extra: scriptLog(logs) }); }
  catch (e) {
    // script errors are failed replies with the position in script.js (and an error program for display)
    const info = e.info ?? { message: e.message, file: entry };
    throw Object.assign(new Error(info.message), { info, program: { ...errorProgram(info), logs } });
  }
  const scriptMs = performance.now() - ts;
  if (model?.data && model.P) { setSlot(options.slot, model, { data: d }); keepAll(); gc(); return { program: { ...model.data, logs } }; }
  let prog;
  try { prog = compileModel(model, { override: options.override ?? null, config: options.config ?? null, fit: options.fit, seed: options.seed, layers: !!options.layers, interference: options.interference ?? null }); }
  catch (e) { return { program: { ...errorProgram({ message: e.message, stack: e.stack, kind: e.kind ?? 'compile.failed' }), logs } }; }
  prog.data.logs = logs;
  prog.data.trace.unshift({ pass: 'script', level: 'L0', ms: scriptMs, cached: false, note: `${entry} evaluated to a ${prog.data.kind}` });
  if (options.keep === false) { keepAll(); gc(); return { program: prog.data }; }   // a what-if: the current Program and the slots stay
  setSlot(options.slot, prog, { data: d });
  keepAll();
  gc();
  return { program: prog.data };
}
// log(…) and console.log/warn/error/info in a script (JIG-012): lines for the compile's result (program.logs), so a
// script can report a value it computed; at most 100 lines of 400 characters
const LOG_LINES = 100, LOG_CHARS = 400;
const logText = v => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof v.toString === 'function' && v.toString !== Object.prototype.toString) { try { const t = String(v); if (!t.startsWith('[object')) return t; } catch { /* JSON */ } }
  try { return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && typeof x.toString === 'function' && x.toString !== Object.prototype.toString && !Array.isArray(x) && Object.getPrototypeOf(x) !== Object.prototype ? String(x) : typeof x === 'number' ? +x.toFixed(5) : x)) ?? String(v); } catch { return String(v); }
};
function scriptLog(logs) {
  const put = prefix => (...a) => {
    if (logs.length === LOG_LINES) logs.push(`… more lines not kept`);
    if (logs.length > LOG_LINES) return;
    const line = prefix + a.map(logText).join(' ');
    logs.push(line.length > LOG_CHARS ? line.slice(0, LOG_CHARS) + '…' : line);
  };
  const log = put('');
  return { log, console: { log, info: log, debug: log, warn: put('warn: '), error: put('error: ') } };
}

function errorProgram(info) {
  return { ok: false, hash: null, kind: 'error', name: 'error', summary: { errors: 1 }, metrics: {}, diagnostics: [{ level: 'error', kind: info.kind ?? 'script.error', at: info.file ?? 'script.js', message: info.message, line: info.line, column: info.column }],
    trace: [], decisions: [], params: [], graph: { nodes: [], edges: [] }, sketches: [], bodies: [], print: null, ir: { L0: '', L1: '', L2: '', L3: '', L4: '', L5: '', L6: '' }, error: info };
}

async function evalArg(a) {
  if (typeof a === 'string' && /^\s*j\./.test(a)) return runScript(`return (${a});`, { data: currentScope?.data ?? {}, file: 'call.js' });
  return a;
}
export async function call(method, args = []) {
  if (!current) throw new Error('nothing compiled yet');
  return answer(current, method, await Promise.all(args.map(evalArg)));
}

// Selector text 'j.…' evaluated synchronously: a plain function over j, the bare names and the slot's data (the
// async evalArg runs it as a script body, which may await; selector expressions never need to).
function evalArgSync(a, scope) {
  if (typeof a !== 'string' || !/^\s*j\./.test(a)) return a;
  const names = ['j', ...Object.keys(BARE), 'data'];
  let f;
  try { f = (0, eval)(`(function (${names.join(', ')}) { return (${a}); })`); }
  catch (e) { throw new Error(`cannot read the selector ${a}: ${e.message}`); }
  return f(J, ...Object.values(BARE), scope?.data ?? {});
}

/** call(), synchronously, on a slot's Program ('current' or a named slot) (JIG-013). */
export function callSync(slot, method, args = []) {
  const s = !slot || slot === 'current' ? (current && { prog: current, scope: currentScope }) : slots.get(slot);
  if (!s) throw new Error(slot && slot !== 'current' ? `nothing compiled in the ${slot} slot yet` : 'nothing compiled yet');
  return answer(s.prog, method, args.map(a => evalArgSync(a, s.scope)));
}
/** The ProgramData of a slot, or null. */
export const slotData = slot => (!slot || slot === 'current' ? current?.data : slots.get(slot)?.prog.data) ?? null;
/** Forget a named slot (its bodies go at the next gc()). */
export function dropSlot(slot) { slots.delete(slot); keepAll(); }

function answer(P, method, a) {
  switch (method) {
    case 'why': return P.why(a[0]);
    case 'param': return P.param(a[0]);
    case 'ir': return P.ir(a[0], a[1] ?? {});
    case 'feature': return P.feature(a[0]);
    case 'faces': return P.faces(a[0], a[1] ?? {});
    case 'edges': return P.edges(a[0]);
    case 'sketch': return P.sketch(a[0]);
    case 'metric': return P.metric(a[0]);
    case 'metrics': return P.metrics();
    case 'summary': return P.summary();
    case 'find': return P.find(a[0]);
    case 'genealogy': return P.genealogy(a[0]);
    case 'body': return P.body(a[0]);
  }
  throw new Error(`unknown call method '${method}'`);
}

// Runtime drag on a sketch: warm-started solve of the dragged cluster (core's SolvedSketch.drag).
export function solveSketch(sketchId, drag) {
  if (!current) throw new Error('nothing compiled yet');
  for (const p of current.P.parts) {
    const s = p.res.sketches.get(sketchId);
    if (!s) continue;
    // drags chain from the last dragged solution; the compiled one (s.solved, shared with the feature cache) stays
    const from = s.dragged ?? s.solved;
    const solved = drag ? from.drag(drag.ref, drag.to) : from;
    const data = solved.toSketchData();
    data.plane = { origin: s.frame.origin, x: s.frame.x, y: s.frame.y, normal: s.frame.z };
    s.dragged = solved;
    return { sketch: data };
  }
  throw new Error(`no sketch '${sketchId}'`);
}

export function exportCurrent(format, options = {}) {
  if (!current) throw new Error('nothing compiled yet');
  const r = exportAs(current, format, options);
  return { data: r.data, filename: r.filename, mime: r.mime, report: r.report };
}

export async function run(code, files) {
  if (!J) await init();
  const data = files ? parseData(files) : currentScope?.data ?? {};
  // compile(text) compiles `text` as script.js with the other files alongside; it does not replace the current Program
  const compile = async (text, o = {}) => {
    try { const r = await compileFiles({ files: { ...(files ?? {}), 'script.js': text ?? files?.['script.js'] }, options: { keep: false, ...o } }); return r.program; }
    catch (e) { return e.program ?? { ok: false, diagnostics: [{ level: 'error', kind: 'script.error', message: e.message }] }; }
  };
  return runScript(code, { data, extra: { compile, files: files ?? {} }, file: 'run.js' });
}

// ── message handling ─────────────────────────────────────────────────────────
export async function handle(msg) {
  const { id, op } = msg;
  try {
    let result;
    switch (op) {
      case 'init': result = await init(msg.options); break;
      case 'compile': result = await compileFiles(msg); break;
      case 'call': result = { value: await call(msg.method, msg.args) }; break;
      case 'solveSketch': result = solveSketch(msg.sketchId, msg.drag); break;
      case 'export': result = exportCurrent(msg.format, msg.options); break;
      case 'run': result = { value: toPlain(await run(msg.code, msg.files)) }; break;
      case 'stats': result = { cache: featureCache.size, freed: gc(), compute: computeInfo(), meshes: RS.liveMeshes(), tapes: RS.liveTapes(), rustCalls: { ...RS.counters } }; break;
      default: throw new Error(`unknown op '${op}'`);
    }
    return { id, ok: true, ...result };
  } catch (e) {
    const info = e.info ?? {};
    return { id, ok: false, error: { message: e.message ?? String(e), stack: e.stack, line: info.line, column: info.column, file: info.file }, ...(e.program ? { program: e.program } : {}) };
  }
}
// make run() results structured-cloneable: Programs → ProgramData, Quantities → JSON
function toPlain(v, depth = 0) {
  if (v == null || typeof v !== 'object' && typeof v !== 'function') return v;
  if (typeof v === 'function') return `[function ${v.name || 'anonymous'}]`;
  if (depth > 8) return '[…]';
  if (v.data && v.P) return v.data;
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
  if (v.toJSON) { try { return v.toJSON(); } catch {} }
  if (Array.isArray(v)) return v.map(x => toPlain(x, depth + 1));
  const out = {};
  for (const k of Object.keys(v)) out[k] = toPlain(v[k], depth + 1);
  if (!Object.keys(out).length && v.toString && v.toString !== Object.prototype.toString) return v.toString();
  return out;
}
export function transferables(reply) {
  const t = [];
  const walk = (x, d = 0) => {
    if (!x || typeof x !== 'object' || d > 6) return;
    if (ArrayBuffer.isView(x)) { if (!t.includes(x.buffer)) t.push(x.buffer); return; }
    if (x instanceof ArrayBuffer) { if (!t.includes(x)) t.push(x); return; }
    for (const k in x) walk(x[k], d + 1);
  };
  walk(reply);
  return t;
}

// The worker's message loop is in worker-main.js (the dist/worker.js entry), so other bundles can import this
// module without taking over their worker's messages (JIG-012: the agent's sandbox runs its own engine).
export function serve(scope) {
  let queue = Promise.resolve();
  scope.onmessage = e => {
    queue = queue.then(async () => {
      const reply = await handle(e.data);
      try { scope.postMessage(reply, transferables(reply)); }
      catch (err) { scope.postMessage({ id: e.data?.id, ok: false, error: { message: `reply not cloneable: ${err.message}` } }); }
    });
  };
}

/** The language of this engine instance (after init): { j, bare } (bare: the unit functions scripts see). */
export const lang = () => ({ j: J, bare: BARE });
/** The current Program (the last compile kept): the live object, not its data. */
export const currentProgram = () => current;
