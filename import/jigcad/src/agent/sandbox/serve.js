// The page's side of the sandbox bridge (JIG-012).
//
// The sandbox runs the same lab scope (src/agent/scope.js) over a *mirror* of the page's state, so every call that is
// synchronous on the page stays synchronous there: files.read/grep/list, program.*, measure.*, selection(), view.get(),
// params.list/overrides, presets.list/current and the lab.* links read the mirror. What needs the page crosses the
// bridge, by path, and runs in the page's own labScope(host) — which is also where read-only mode is enforced, so
// nothing the sandbox's code does can get around it:
//   effects   run, look, exportFile, params.get/set/clear, presets.create/load/rename, select, view.set, lab.follow,
//             and the file changes (applied to the mirror first, then sent here in order);
//   __call    the page engine's queries on the last compile (why, faces, feature, sketch, measure.area by selector),
//             host.call(method, …args): the sandbox shapes their results with the same scope code.
// A call that changes what the mirror holds returns the new ctx with its value.
import { labScope, filesObject } from '../scope.js';

export const BRIDGED = ['run', 'look', 'exportFile', 'params.get', 'params.set', 'params.clear', 'presets.create', 'presets.load',
  'presets.rename', 'select', 'view.set', 'lab.follow', 'files.write', 'files.edit', 'files.rename', 'files.remove'];
export const RAW_CALL = '__call';
// calls after which the sandbox's mirror is out of date
export const CHANGES = new Set(['files.write', 'files.edit', 'files.rename', 'files.remove', 'run', 'params.set', 'params.clear',
  'presets.load', 'presets.create', 'presets.rename', 'select', 'view.set', 'lab.follow']);

const plainView = v => (v ? { name: v.name ?? null, overlays: v.overlays ? [...v.overlays] : [], shown: v.shown ? [...v.shown] : [] } : null);
const presetMeta = p => (p ? { id: p.id, title: p.title, group: p.group, about: p.about } : null);

/** The page state the sandbox mirrors and compiles with (structured-cloneable). */
export function ctxOf(host) {
  const files = filesObject(host);
  const edited = {};
  for (const p of Object.keys(files)) { try { edited[p] = typeof host.isEdited === 'function' ? !!host.isEdited(p) : false; } catch { edited[p] = false; } }
  const ov = host.overrides;
  return {
    files, edited, editedAny: typeof host.isEdited === 'function' ? !!host.isEdited() : false,
    overrides: typeof host.overrideValues === 'function' ? host.overrideValues() : {},
    overridesRaw: ov instanceof Map ? Object.fromEntries(ov) : { ...(ov || {}) },
    program: host.program ?? null, lastGood: host.lastGood ?? null,
    selection: host.selection ?? null, view: plainView(host.view),
    preset: presetMeta(host.preset), presets: (typeof host.presets === 'function' ? host.presets() : []).map(presetMeta),
    entry: 'script.js',
  };
}

/** The bridge for one eval: { paths, call(path, args) → { value, ctx? } }. look()'s images stay on the page. */
export function bridge(host, { readOnly = false, images = null } = {}) {
  const scope = labScope(host, { readOnly, images });
  const api = new Map();
  for (const path of BRIDGED) {
    const [ns, fn] = path.split('.');
    const f = fn ? scope[ns]?.[fn] : scope[ns];
    if (typeof f === 'function') api.set(path, f);
  }
  api.set(RAW_CALL, async (method, ...args) => {
    if (typeof host.call !== 'function') throw new Error('the engine is not ready');
    return host.call(method, ...args);
  });
  return {
    paths: [...api.keys()].filter(p => p !== RAW_CALL),
    async call(path, args) {
      const f = api.get(path);
      if (!f) throw new Error(`${path} is not part of the workbench API`);
      const value = await f(...(Array.isArray(args) ? args : []));
      return { value, ...(CHANGES.has(path) ? { ctx: ctxOf(host) } : {}) };
    },
  };
}
