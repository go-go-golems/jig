// The sandbox's side (JIG-012): runs inside a worker that has its own engine (src/engine/worker.js as a module, one
// engine per worker). It serves a control port: { t: 'init', occt?, compute? } loads the engine (from bytes the page
// sent: in the browser the sandbox cannot fetch) and answers { t: 'ready', ms, compute }; { t: 'eval', port } serves
// one step on its own port (client.js has the page's side of the protocol).
//
// In a step's scope:
//   local    j, the unit functions (mm, deg, lw, layer, …), data (the preset's data files), check(variant?, options?)
//            (a compile in this engine; nothing in the workbench changes) with a live `program`, log and console;
//   bridged  every path the page lists in `api` (files.*, run, program.*, faces, look, …): a stub that sends
//            { t: 'call' } and waits for { t: 'ret' }; the page checks the path and the run mode.
// The result is the same text the page's runEval writes: YAML of the value, logs first, notes for promises the code
// never awaited. Keys a step adds to globalThis are removed after it, so steps do not leak into each other.
import * as W from '../../engine/worker.js';
import { compileStep, trackScope, makeConsole, formatResult, markPromises, promiseNotes, cut } from '../evaltool.js';
import { labScope, makeProgram, makeMeasure, makeQueries, compileResult, flatMetrics } from '../scope.js';
import { listen, closePort } from './ports.js';

const IDENT = /^[A-Za-z_$][\w$]*$/;
let generation = 0;            // which check() made the engine's current Program

/** Serve the control port of a sandbox worker. initDefaults go into init (Node passes nothing: it reads files). */
export function serveControl(port, initDefaults = {}) {
  let ready = null;
  listen(port, m => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'init') {
      const opts = { ...initDefaults };
      if (m.occt) opts.wasmBinary = m.occt;
      if (m.compute) opts.computeBinary = m.compute;
      else if (m.noCompute) opts.compute = 'js';
      ready = W.init(opts);
      ready.then(r => port.postMessage({ t: 'ready', ms: r.ms, compute: r.compute?.kind ?? 'js' }),
        e => port.postMessage({ t: 'failed', message: String(e?.message ?? e) }));
    } else if (m.t === 'eval' && m.port) {
      const ep = m.port;
      (ready ?? (ready = W.init(initDefaults))).then(() => serveEval(ep), e => {
        ep.postMessage({ t: 'done', ok: false, text: `Error: the sandbox's engine did not start: ${e?.message ?? e}` });
        closePort(ep);
      });
    }
  });
}

function serveEval(port) {
  let next = 0, started = false;
  const waiting = new Map();
  const stop = listen(port, m => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ret') {
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      w(m);
    } else if (m.t === 'start' && !started) {
      started = true;
      runStep(m, (path, args) => new Promise((resolve, reject) => {
        const id = ++next;
        waiting.set(id, resolve);
        try { port.postMessage({ t: 'call', id, path, args }); }
        catch (e) { waiting.delete(id); reject(new TypeError(`${path}: its arguments cannot be sent to the workbench (${e.message}); pass plain data`)); }
      })).then(r => { port.postMessage({ t: 'done', ...r }); stop(); closePort(port); });
    }
  });
}

const hasFunction = (v, depth = 6) => typeof v === 'function' || (depth > 0 && v && typeof v === 'object' && !ArrayBuffer.isView(v) && Object.values(v).some(x => hasFunction(x, depth - 1)));

/** A host for labScope over the page state in ctx (serve.js ctxOf). Engine queries go to callRaw (the page). */
function mirrorHost(ctx, callRaw) {
  const files = new Map(Object.entries(ctx.files || {}));
  const m = {
    files, program: null, lastGood: null, overrides: {}, selection: null, view: null, preset: null, _presets: [], _ctx: ctx,
    isEdited(path) {
      const c = m._ctx;
      if (path == null) return !!c.editedAny || [...files].some(([p, t]) => t !== c.files?.[p]);
      return !!c.edited?.[path] || files.get(path) !== c.files?.[path];
    },
    presets: () => m._presets,
    setFile(path, text) { files.set(path, text); },
    renameFile(from, to) { const t = files.get(from); files.delete(from); files.set(to, t); return true; },
    deleteFile(path) { return files.delete(path); },
    call: (method, ...args) => callRaw(method, args),
    apply(c) {
      m._ctx = { ...m._ctx, ...c };
      if (c.files) { files.clear(); for (const [k, v] of Object.entries(c.files)) files.set(k, v); }
      if ('program' in c) m.program = c.program;
      if ('lastGood' in c) m.lastGood = c.lastGood;
      if (c.overridesRaw) m.overrides = { ...c.overridesRaw };
      if ('selection' in c) m.selection = c.selection;
      if ('view' in c) m.view = c.view && { ...c.view, overlays: new Set(c.view.overlays || []), shown: new Set(c.view.shown || []) };
      if ('preset' in c) m.preset = c.preset;
      if (c.presets) m._presets = c.presets;
    },
  };
  m.apply(ctx);
  return m;
}

const FILE_CHANGES = ['write', 'edit', 'rename', 'remove'];

/** One step: { code, api, ctx, readOnly } → { ok, text }. call(path, args) → { ok, value | error, ctx? }. */
export async function runStep({ code, api = [], ctx: ctx0 = {}, readOnly = false }, call) {
  let ctx = { files: {}, overrides: {}, entry: 'script.js', ...ctx0 };
  const logs = [], promises = [], notes = [];
  const con = makeConsole(logs, markPromises);
  let queue = Promise.resolve();   // file changes the page has not confirmed yet, in order
  const refresh = c => { if (c) { ctx = { ...ctx, ...c }; mirror.apply(c); } };

  // engine queries on the page's last compile: their results are shaped here by the scope's own code
  const callRaw = async (method, args) => {
    await queue;
    const r = await call('__call', [method, ...args]);
    if (!r.ok) throw new Error(r.error?.message ?? `${method} failed`);
    return r.value;
  };
  const mirror = mirrorHost(ctx, callRaw);
  const scope = labScope(mirror, { readOnly, images: null });
  delete scope.host;

  // bridged: the error is thrown here, after the await, so its stack names the step's line
  const stub = path => async (...args) => {
    if (hasFunction(args)) throw new TypeError(`${path}: functions cannot be sent to the workbench; pass data (live objects work with check()'s program)`);
    await queue;
    const r = await call(path, args);
    refresh(r.ctx);
    if (!r.ok) { const e = new Error(r.error?.message ?? `${path} failed`); if (r.error?.name && r.error.name !== 'Error') e.name = r.error.name; throw e; }
    return r.value;
  };
  for (const path of api) {
    const [ns, fn] = path.split('.');
    if (ns === 'files' && FILE_CHANGES.includes(fn)) continue;
    if (fn) (scope[ns] ??= {})[fn] = stub(path);
    else scope[ns] = stub(path);
  }
  // file changes: the mirror changes now (sync, as on the page), the page follows in order
  for (const fn of FILE_CHANGES) {
    const local = scope.files[fn];
    if (!api.includes(`files.${fn}`)) continue;
    scope.files[fn] = (...args) => {
      const v = local(...args);
      queue = queue.then(() => call(`files.${fn}`, args)).then(r => {
        refresh(r.ctx);
        if (!r.ok) notes.push(`note: the workbench refused files.${fn}(${args.map(a => JSON.stringify(a)?.slice(0, 40)).join(', ')}): ${r.error?.message}`);
      }, e => { notes.push(`note: files.${fn} did not reach the workbench: ${e.message}`); });
      return v;
    };
  }

  // local: the language and a compile in this engine
  const { j, bare } = W.lang();
  Object.assign(scope, bare, { j, data: W.parseData(ctx.files, ctx.entry) });
  scope.check = (variant, options) => check(() => ({ ...ctx, files: Object.fromEntries(mirror.files) }), variant, options);

  const tracked = trackScope(scope, promises);
  tracked.console = con;
  tracked.log = con.log;
  const names = Object.keys(tracked).filter(k => IDENT.test(k));
  const before = new Set(Object.getOwnPropertyNames(globalThis));
  let value, error = null;
  try { value = await compileStep(names, String(code))(...names.map(k => tracked[k])); }
  catch (e) { error = e || new Error('undefined'); }
  const open = promises.filter(t => !t.consumed && !t.settled);
  if (open.length) await Promise.race([Promise.all(open.map(t => t.p)), new Promise(r => setTimeout(r, 1000))]);
  await queue;
  for (const k of Object.getOwnPropertyNames(globalThis)) if (!before.has(k)) { try { delete globalThis[k]; } catch { /* not configurable */ } }
  let text;
  try { text = formatResult(value, logs, error, [...promiseNotes(promises), ...notes]); }
  catch (e) { text = `Error: the result could not be written as YAML: ${e.message}`; error = e; }
  return { ok: !error, text: cut(text) };
}

/** check(variant?, options?) in this engine: { ok, ms, errors, warnings, summary, metrics, program }. */
async function check(getCtx, variant, options = {}) {
  const ctx = getCtx();
  let files = { ...ctx.files };
  if (typeof variant === 'string') files['script.js'] = variant;
  else if (variant instanceof Map) Object.assign(files, Object.fromEntries(variant));
  else if (variant && typeof variant === 'object') Object.assign(files, variant);
  else if (variant != null) throw new Error('check: give the script text, or { path: text } for the files to change, or nothing for the current files');
  // at the script's own values, as the page's check() always was; options.override applies the overrides given
  const o = { ...(options || {}) };
  const r = await compileResult(async () => {
    try { return (await W.compileFiles({ files, entry: ctx.entry || 'script.js', options: o })).program; }
    catch (e) { throw Object.assign(new Error(e.message), e.info || {}); }
  });
  const gen = ++generation;
  const out = { ok: r.ok, ms: r.ms, errors: r.errors };
  if (r.p && r.ok) {
    out.warnings = r.warnings;
    out.summary = { ok: true, kind: r.p.kind, name: r.p.name, ...(r.p.summary || {}) };
    out.metrics = flatMetrics(r.p);
    out.program = liveProgram(r.p, gen);
  }
  return out;
}

// The Program of one check(), with the page's query functions (scope.js) over this engine. It answers until the
// next check() replaces the engine's current Program.
function liveProgram(data, gen) {
  const host = {
    program: data, lastGood: data,
    call: async (method, ...args) => {
      if (gen !== generation) throw new Error('this program is from an earlier check(); call check() again');
      return W.call(method, args);
    },
  };
  const p = { ...makeProgram(host), ...makeQueries(host), measure: makeMeasure(host) };
  Object.defineProperty(p, 'describe', { value: () => `program ${data.name ?? ''} (${data.kind}) from check()`, enumerable: false });
  return p;
}
