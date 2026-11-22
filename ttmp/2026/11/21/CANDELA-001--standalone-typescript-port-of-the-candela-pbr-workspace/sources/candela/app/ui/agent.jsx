// agent.jsx — a chat agent with two tools: `eval`, which runs JavaScript in the workbench with the Candela API
// and the workbench in scope, and `screenshot`, which captures the render or the whole workbench and hands the
// picture back to the agent in its next round. You can attach images too: paste, drop, or pick them.
const { useState, useEffect, useRef } = React;
import { useHost, useFocus, Seg, copyText } from './common.jsx';
import { store, API, test, fragments, formatDiag } from '../host.js';
import { render } from '../markdown.js';
import { highlight } from '../highlight.js';
import { captureWorkbench } from './capture.js';

const S = { threads: store.get('threads', null) || [{ id: 'a1', title: 'New thread', turns: [] }], active: store.get('thread', 'a1'), settings: Object.assign({ mode: 'auto', tier: 'default', effort: '' }, store.get('agentSettings', {})) };
if (!S.threads.find(t => t.id === S.active)) S.active = S.threads[0].id;
const IMGS = new Map();   // image id → { url, blob } (kept for this page's life; threads store ids only)
const persist = () => { store.set('threads', S.threads.slice(-12).map(t => ({ ...t, turns: t.turns.slice(-30).map(u => ({ ...u, pending: false, steps: (u.steps || []).map(s => ({ ...s, snapshot: undefined, resolve: undefined, result: s.result && s.result.length > 3000 ? s.result.slice(0, 3000) + '\n…' : s.result })) })) }))); store.set('thread', S.active); store.set('agentSettings', S.settings); };
let sampleP = null;
const getSample = () => sampleP || (sampleP = (async () => { try { return window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { return null; } })());
let limitsP = null;
const getLimits = () => limitsP || (limitsP = (async () => { const s = await getSample(); if (!s || !s.limits) return null; try { return await s.limits(); } catch (e) { return null; } })());
const addImage = (blob) => { const id = 'img' + Math.random().toString(36).slice(2, 9); const url = URL.createObjectURL(blob); IMGS.set(id, { url, blob }); return id; };

// ---------- eval: run code with the API and the workbench in scope ----------
function yaml(v, ind = '', depth = 0, seen = new Set()) {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toFixed(5)) : String(v);
  if (typeof v === 'string') return v.includes('\n') ? '|\n' + v.split('\n').map(l => ind + '  ' + l).join('\n') : (/^[\w .,:/()+\-·×→%#°]*$/.test(v) && v.length < 120 ? v : JSON.stringify(v));
  if (typeof v === 'function') return `[function ${v.name || ''}]`;
  if (typeof v !== 'object') return String(v);
  const comp = v[Symbol.for('candela.comp')]; if (comp) return `[${comp.kind}${comp.props && comp.props.id ? ' #' + comp.props.id : ''}]`;
  if (v[Symbol.for('candela.expr')]) return `[field ${v[Symbol.for('candela.expr')].type}]`;
  if (v[Symbol.for('candela.param')]) return `[param ${v.id} = ${JSON.stringify(v.value)}]`;
  if (seen.has(v)) return '[circular]';
  if (depth > 5) return Array.isArray(v) ? `[array ${v.length}]` : '{…}';
  if (v instanceof Map) v = Object.fromEntries(v); if (v instanceof Set) v = [...v];
  if (ArrayBuffer.isView(v)) v = Array.from(v.slice(0, 64));
  seen.add(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(x => typeof x === 'number')) return '[' + v.slice(0, 64).map(x => yaml(x)).join(', ') + (v.length > 64 ? `, … ${v.length} items` : '') + ']';
    const items = v.slice(0, 60).map(x => ind + '- ' + yaml(x, ind + '  ', depth + 1, seen).replace(/^\s+/, ''));
    if (v.length > 60) items.push(`${ind}# … ${v.length - 60} more`);
    return '\n' + items.join('\n');
  }
  let keys; try { keys = Object.keys(v); } catch (e) { return '{…}'; }
  if (!keys.length) return '{}';
  return '\n' + keys.slice(0, 80).map(k => { let x; try { x = v[k]; } catch (e) { x = '<' + e.message + '>'; } return `${ind}${k}: ${yaml(x, ind + '  ', depth + 1, seen)}`; }).join('\n');
}
const jobDone = j => new Promise(res => { const k = setInterval(() => { if (j.status !== 'queued' && j.status !== 'running') { clearInterval(k); res({ id: j.id, status: j.status, error: j.error, ms: j.ms, files: (j.files || []).map(f => ({ name: f.name, bytes: f.data.length })) }); } }, 100); });
function labScope(host) {
  const files = {
    list: () => Object.keys(host.files).sort().map(p => ({ path: p, lines: host.files[p].split('\n').length, edited: host.isDirty(p) })),
    read: (path, from, to) => { const s = host.files[path]; if (s == null) throw new Error('no file ' + path); if (from == null) return s; return s.split('\n').slice(from - 1, to || from + 40).map((l, i) => `${from + i}  ${l}`).join('\n'); },
    grep: (pattern, path) => { const re = pattern instanceof RegExp ? pattern : new RegExp(pattern); const out = []; for (const [p, s] of Object.entries(host.files)) { if (path && p !== path) continue; s.split('\n').forEach((l, i) => { if (re.test(l)) out.push(`${p}:${i + 1}  ${l.trim().slice(0, 160)}`); }); } return out.slice(0, 80); },
    write: (path, src) => { if (typeof src !== 'string') throw new Error('write(path, src): src must be a string'); host.files[path] = src; host.saveEditsSoon(); host.notify(); return { path, lines: src.split('\n').length }; },
    edit: (path, find, replace) => {
      const s = host.files[path]; if (s == null) throw new Error('no file ' + path);
      const n = s.split(find).length - 1;
      if (n === 0) throw new Error(`edit: text not found in ${path} (it must match exactly, including spaces)`);
      if (n > 1) throw new Error(`edit: text occurs ${n} times in ${path}; include more context so it is unique`);
      host.files[path] = s.replace(find, () => replace); host.saveEditsSoon(); host.notify();
      return { path, line: s.slice(0, s.indexOf(find)).split('\n').length };
    },
  };
  const vp = () => host.vp;
  const render = {
    status: () => { const v = vp(); return v && v.backend ? { backend: v.backend.name, spp: v.spp, size: [v.backend.w, v.backend.h], ev100: +v.exposureEV().toFixed(2), msPerFrame: +v.lastMs.toFixed(1), spectral: !!(v.compiled && v.compiled.spectral), engine: host.view.engine } : null; },
    waitSpp: async (n = 64, timeoutMs = 15000) => { const t0 = performance.now(); while (vp() && vp().spp < n && performance.now() - t0 < timeoutMs) await new Promise(r => setTimeout(r, 100)); return vp() ? vp().spp : 0; },
    meter: async (x = 0.5, y = 0.5) => { const L = await vp().readLuminanceAt(x, y); return { nit: +L.toFixed(3), ev100: +Math.log2(Math.max(L, 1e-6) * 100 / 12.5).toFixed(2) }; },
    pick: (x = 0.5, y = 0.5) => host.pick(x, y),
    aov: (name) => { host.setView('aov', name); return name; },
    engine: (name) => { host.setView('engine', name); return name; },
    tonemap: (op) => { host.setView('tonemap', op); return op; },
    exposure: (evComp) => { host.setView('evComp', evComp); return evComp; },
    falseColor: (on = true) => { host.setView('falseColor', !!on); return !!on; },
    camera: (o) => { if (!o) { host.resetCamera(); return 'scene camera'; } host.freeCam = { at: o.at, target: o.target || o.lookAt || [0, 0.5, 0] }; host.vp.setView(host.freeCam); host.notify(); return host.freeCam; },
    // output: a job on the queue; resolves when it finishes, with the file names and sizes (the files are saved
    // through the page only if save: true)
    still: async (o = {}) => jobDone(host.render(Object.assign({ kind: 'still', width: 1280, height: 720, spp: 128, format: 'png', autosave: !!o.save }, o))),
    sequence: async (o = {}) => jobDone(host.render(Object.assign({ kind: 'sequence', width: 640, height: 360, spp: 32, fps: 24, start: 0, end: 1, format: 'png', autosave: !!o.save }, o))),
    exr: async (o = {}) => jobDone(host.render(Object.assign({ kind: 'still', width: 1280, height: 720, spp: 128, format: 'exr', autosave: !!o.save }, o))),
    video: async (o = {}) => jobDone(host.render(Object.assign({ kind: 'sequence', width: 1280, height: 720, spp: 32, fps: 24, start: 0, end: 2, format: 'mp4', quality: 'high', autosave: !!o.save }, o))),
    queue: () => host.queue.jobs.map(j => ({ id: j.id, kind: j.kind, status: j.status, progress: +j.progress.toFixed(2), error: j.error, files: j.files ? j.files.map(f => f.name) : null })),
    cancel: (id) => { host.queue.cancel(id); return 'cancelled ' + id; },
    // first-hit ids at a point: instance, face and distance (what the id pass writes into EXRs)
    ids: async (x = 0.5, y = 0.5) => { const r = await vp().idPass(); const px = Math.min(r.width - 1, Math.round(x * r.width)), py = Math.min(r.height - 1, Math.round(y * r.height)), i = (py * r.width + px) * 4; const inst = r.data[i], ob = inst >= 0 ? host.vp.compiled.objects[inst] : null; return inst < 0 ? { hit: false } : { instance: inst, id: ob && ob.id, definition: ob && ob.def ? ob.def.name : null, face: ob && ob.def ? (ob.def.faces[r.data[i + 1]] || {}).id : null, distance: +r.data[i + 2].toFixed(4) }; },
    seek: (t) => { host.seek(+t, 0); return host.time; },
    poses: (p) => host.setPoses(p),
    seed: (n) => { host.vp.setSeed(n); return n; },
  };
  return Object.assign({}, API, {
    files, render, test, fragments,
    run: async () => { const r = await host.build({}); return r.ok ? { ok: true, ms: +r.ms.toFixed(1), stats: r.compiled.stats, warnings: r.diags.filter(d => d.severity !== 'error').map(formatDiag), shaderError: host.compileError ? host.compileError.message : undefined } : { ok: false, errors: r.diags.filter(d => d.severity === 'error').map(formatDiag) }; },
    diagnostics: () => host.diags.map(formatDiag),
    logs: () => host.logs,
    explain: () => host.explain(), ir: () => host.irText(),
    shader: (find) => { const c = host.result && host.result.compiled; if (!c) return null; const lines = c.shared.split('\n'); if (!find) return { lines: lines.length, materials: c.stats.materials }; const out = []; lines.forEach((l, i) => { if (l.includes(find)) out.push(`${i + 1}: ${l}`); }); return out.slice(0, 60); },
    params: (pattern = '') => host.params().filter(h => !pattern || h.id.includes(pattern)).map(h => ({ id: h.id, kind: h.kind, value: h.kind === 'angle' ? +(h.value * 180 / Math.PI).toFixed(3) + '°' : h.value, min: h.min, max: h.max, unit: h.unit, static: h.isStatic })),
    setParam: (id, v) => { const h = host.params().find(x => x.id === id); if (!h) throw new Error(`no param ${id} (have ${host.params().map(x => x.id).join(', ')})`); return h.set(v); },
    world: host.world(),
    presets: { list: () => host.allPresets().map(p => ({ id: p.id, title: p.title, group: p.group })), load: (id) => { host.loadPreset(id); return host.preset.title; } },
    notes: () => host.notes, setNotes: (md) => { host.setNotes(md); return md.length; },
    doc: (id) => { const d = host.docs.find(x => x.id === id); if (!d) throw new Error('docs: ' + host.docs.map(x => x.id).join(', ')); return d.body; },
    link: (href) => host.link(href),
  });
}
const READONLY = new Set(['run', 'setParam', 'setNotes']);
async function runEval(host, code, readOnly) {
  const logs = [], lab = labScope(host);
  const scope = Object.assign({}, lab, {
    lab, files: readOnly ? Object.assign({}, lab.files, { write: () => { throw new Error('read-only mode: files.write is off'); }, edit: () => { throw new Error('read-only mode: files.edit is off'); } }) : lab.files,
    console: { log: (...a) => logs.push(a.map(x => typeof x === 'string' ? x : yaml(x).trim()).join(' ')), warn: (...a) => logs.push('warn: ' + a.join(' ')), error: (...a) => logs.push('error: ' + a.join(' ')) },
    log: (...a) => logs.push(a.map(x => typeof x === 'string' ? x : yaml(x).trim()).join(' ')),
  });
  if (readOnly) for (const k of READONLY) scope[k] = () => { throw new Error(`read-only mode: ${k}() is off`); };
  const names = Object.keys(scope).filter(k => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
  const t0 = performance.now(); let value, error = null;
  try {
    const fn = new Function(...names, '"use strict";\nreturn (async () => {\n' + code + '\n})();\n//# sourceURL=agent-eval.js');
    value = await Promise.race([fn(...names.map(k => scope[k])), new Promise((_, rej) => setTimeout(() => rej(new Error('eval timed out after 30 s')), 30000))]);
  } catch (e) { error = e; }
  const ms = performance.now() - t0;
  let out = error ? `Error${error.code ? ' ' + error.code : ''}: ${error.message}${error.suggest && error.suggest.length ? ` Did you mean ${error.suggest.map(x => `'${x}'`).join(' or ')}?` : ''}${error.hint ? '\n' + [].concat(error.hint).join('\n') : ''}` : yaml(value).replace(/^\n/, '');
  if (logs.length) out = 'logs:\n' + logs.join('\n') + '\n---\n' + out;
  if (out.length > 9000) out = out.slice(0, 9000) + `\n… cut (${out.length} chars). Return less: pick fields, slice arrays.`;
  return { out, error: !!error, ms };
}

// ---------- the prompt ----------
function instructions(host, imagesOn) {
  return `You are the agent inside Candela Workbench, an IDE for physically based rendering. Scenes are written in JavaScript with the Candela API: fluent, immutable builders (scene, shape, material, bsdf, light, camera, medium, engine, pass), typed photometric units (u.lm, u.lux, u.cd, u.nit, u.K, u.deg, u.mm), params that become sliders (params({...}), param.float(...)), fields traced into GPU code (fx.pattern(p => …) — use methods like .mul/.add, never JS operators on fields), and fragments that extend components. The render is a progressive path tracer on the GPU (WebGPU compute, or WebGL2), with NEE, MIS, Russian roulette, a physical sky, participating media and an optional spectral (hero-wavelength) mode.

Tools:
- eval: runs an async JavaScript function body in the page and returns the value as YAML plus console.log output. The whole Candela API is in scope, plus: files (list/read/grep/edit/write), run() (rebuild: returns ok, stats, warnings, errors), diagnostics(), explain(), ir(), shader(find), params(), setParam(id, v), world.$('#id') (live handles: world.$('#key').power = 1200 is a patch), render.status()/waitSpp(n)/meter(x, y)/pick(x, y) (meshes report definition, instance, face and its metadata)/aov(name)/engine(name)/tonemap(op)/exposure(ev)/falseColor(on)/camera({at, target})/ids(x, y)/seek(t)/poses({id: pose})/seed(n)/still(o)/sequence(o)/exr(o)/video(o)/queue()/cancel(id) (renders run on the queue at a fixed width, height, spp and seed; video(o) is a sequence encoded as format 'mp4' (H.264) or 'webm' (VP9) with quality draft|standard|high|max; pass save: true to save the files), test.furnace(bsdf), presets.list()/load(id), notes(), setNotes(md), doc(id).
- screenshot: captures the viewport render (or the whole workbench). ${imagesOn ? 'The picture is sent back to you at the start of your next round automatically: after calling it, end your turn with one short sentence ("Let me look at the render."), and continue when you see the image.' : 'Images cannot be sent back in this view, so describe what you need measured instead (render.meter, render.status).'}

How to work:
- Look before you change: files.read('scene.js'), explain(), params().
- Change scenes with files.edit(path, find, replace) (exact, unique text), then run() and read the result. Fix diagnostics by their codes (E104 unknown method, E120 unit mismatch, E201 JS arithmetic on a field, W420 energy, W330 implausible albedo…).
- Use physical reasoning and units: lights in lumens/candela/lux/nit, exposure in EV100, colour temperature in kelvin, IORs, roughness ∈ [0, 1].
- To judge an image, wait for samples (render.waitSpp(64)) and take a screenshot.
- In Ask mode the person approves each eval; in Read-only mode edits are refused.
- Answer in a few short paragraphs of markdown. You may include links the person can click: [open](lab:open?file=scene.js&line=12), [doc](lab:doc?id=rendering-equation), [param](lab:param?id=gloss&value=0.4), [preset](lab:preset?id=M-03), [show](lab:show?view=shader). Use $…$ for maths.

The API reference:
${host.reference}`;
}
function context(host) {
  const p = host.preset, r = host.result, vp = host.vp;
  const lines = [`preset: ${p.id} ${p.title} (${p.group}) — ${p.about || ''}`];
  lines.push(r ? (r.ok ? `build: ok in ${r.ms.toFixed(0)} ms (${r.compiled.stats.objects} objects, ${r.compiled.stats.lights} lights, ${r.compiled.stats.materials} material kernels, ${r.compiled.stats.params} uniforms)` : `build: FAILS — ${r.error && r.error.message}`) : 'build: none');
  if (host.compileError) lines.push('shader compile error: ' + host.compileError.message.slice(0, 400));
  const ds = host.diags.filter(d => d.severity !== 'info'); if (ds.length) lines.push('diagnostics:\n' + ds.slice(0, 8).map(d => '  ' + formatDiag(d).split('\n')[0]).join('\n'));
  if (vp && vp.backend) lines.push(`render: ${vp.backend.name}, ${vp.spp} spp, ${vp.backend.w}×${vp.backend.h}, EV100 ${vp.exposureEV().toFixed(2)}, engine ${host.view.engine}, view ${host.view.aov}${host.freeCam ? ', free camera' : ''}`);
  lines.push('files: ' + Object.keys(host.files).sort().map(f => f + (host.isDirty(f) ? '*' : '')).join(', ') + ' (* edited)');
  const ps = host.params(); if (ps.length) lines.push('params: ' + ps.slice(0, 24).map(h => `${h.id}=${h.display()}`).join(', '));
  if (host.selection) lines.push('selected: ' + host.selection);
  return '[context]\n' + lines.join('\n') + '\n[/context]';
}
function toTurns(host, thread, imagesOn) {
  const out = [];
  thread.turns.forEach(t => {
    if (t.role === 'user') out.push({ role: 'user', content: (t.text || '') + (t.images && t.images.length ? `\n\n[${t.images.length} image${t.images.length > 1 ? 's' : ''} attached${t.auto ? ' (your screenshots)' : ''}${t.sent ? '' : ''}]` : '') });
    else { const steps = (t.steps || []).map(s => s.kind === 'screenshot' ? `[screenshot ${s.target}] ${s.result || ''}` : `[eval${s.reverted ? ', later reverted' : ''}] ${s.code.split('\n')[0].slice(0, 100)} → ${(s.result || '').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n'); out.push({ role: 'assistant', content: ((steps ? steps + '\n\n' : '') + (t.text || '(no answer)')).trim() }); }
  });
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  if (!out.length) return null;
  out[0] = { role: 'user', content: instructions(host, imagesOn) + '\n\n---\n\n' + out[0].content };
  out[out.length - 1] = { role: 'user', content: context(host) + '\n\n' + out[out.length - 1].content };
  const merged = []; for (const t of out) { if (merged.length && merged[merged.length - 1].role === t.role) merged[merged.length - 1].content += '\n\n' + t.content; else merged.push(t); }
  // keep under the input cap: drop the oldest turns after the instructions
  while (JSON.stringify(merged).length > 220000 && merged.length > 3) merged.splice(1, 2);
  return merged;
}

const OFF = { not_granted: 'Claude is not allowed for this page. You can allow it from the artifact’s permissions.', sampling_disabled: 'Claude is not available for this account.', not_declared: 'This page no longer asks for Claude.', capability_disabled: 'Claude is unavailable in this view.', tools_unavailable: 'This view cannot run the agent’s tools.', capability_removed: 'This app version cannot run the agent.' };

export function AgentView({ host }) {
  useHost(host, 2);
  const [, force] = useState(0); const re = () => { force(x => x + 1); };
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [off, setOff] = useState(null), [avail, setAvail] = useState(undefined), [lim, setLim] = useState(null), [atts, setAtts] = useState([]), [dragOver, setDragOver] = useState(false);
  const ctl = useRef(null), logRef = useRef(null), fileRef = useRef(null);
  useEffect(() => { getSample().then(s => setAvail(!!s)); getLimits().then(setLim); }, []);
  useFocus(host, 'agent', r => { if (r.ask) { setDraft(r.ask); } });
  const th = S.threads.find(t => t.id === S.active);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });
  const imagesOn = !!(lim && lim.images);
  const maxImgs = lim && lim.images ? lim.images.maxCount : 0;
  const attach = async (fileList) => {
    const fs = [...fileList].filter(f => /^image\//.test(f.type));
    if (!fs.length) return;
    if (!imagesOn) { host.toast('Images cannot be sent to Claude in this view', true); return; }
    const ok = fs.filter(f => !lim.images.mediaTypes || lim.images.mediaTypes.includes(f.type));
    if (ok.length < fs.length) host.toast('Some files are not a supported image type (' + (lim.images.mediaTypes || []).join(', ') + ')', true);
    setAtts(a => a.concat(ok.map(f => addImage(f))).slice(0, maxImgs || 4));
  };
  const onPaste = e => { const items = [...(e.clipboardData && e.clipboardData.items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean); if (items.length) { e.preventDefault(); attach(items); } };

  const send = async (text, o = {}) => {
    text = (text != null ? text : draft).trim();
    const imgs = o.images || atts;
    if ((!text && !imgs.length) || busy) return;
    const sample = await getSample(); if (!sample) { setOff('Claude is not available here, so the agent is off. Everything else in the workbench works.'); return; }
    th.turns.push({ role: 'user', text: text || '(image)', images: imgs, auto: !!o.auto });
    if (th.title === 'New thread') th.title = (text || 'image').slice(0, 32);
    const turn = { role: 'agent', text: '', steps: [], pending: true }; th.turns.push(turn);
    if (!o.auto) { setDraft(''); setAtts([]); }
    setBusy(true); persist(); re();
    ctl.current = new AbortController();
    const shots = [];   // screenshots taken in this round, sent back next round
    const evalTool = {
      name: 'eval',
      description: 'Run an async JavaScript function body in the workbench with the Candela API and the workbench helpers in scope (files, run, diagnostics, explain, ir, shader, params, setParam, world, render, test, presets). Returns the value as YAML plus console.log output. Use `return`.',
      inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'the body of an async function; return what you want to see' } }, required: ['code'] },
      execute: async ({ code }, c) => {
        code = String(code || '');
        const step = { kind: 'eval', code, result: null, running: true, ms: 0, snapshot: { files: Object.assign({}, host.files) } };
        turn.steps.push(step); re();
        if (S.settings.mode === 'ask') {
          step.asking = true; re();
          const ok = await new Promise(res => { step.resolve = res; c && c.signal && c.signal.addEventListener('abort', () => res(false)); });
          step.asking = false; step.resolve = undefined;
          if (!ok) { step.running = false; step.result = 'The person declined this step.'; step.error = true; re(); return 'Declined by the person. Ask what they want instead, or explain the change without running it.'; }
        }
        const r = await runEval(host, code, S.settings.mode === 'read');
        Object.assign(step, { running: false, result: r.out, error: r.error, ms: r.ms });
        step.changed = Object.keys(host.files).some(k => step.snapshot.files[k] !== host.files[k]) || Object.keys(step.snapshot.files).some(k => !(k in host.files));
        re(); persist();
        return r.out;
      },
    };
    const shotTool = {
      name: 'screenshot',
      description: imagesOn ? 'Capture the viewport render (target "viewport", default) or the whole workbench UI (target "workbench"). Optionally wait until the render has minSpp samples. The image is sent back to you at the start of your next round; end this turn briefly after calling it.' : 'Capture the viewport (images cannot be returned in this view; returns size and sample count only).',
      inputSchema: { type: 'object', properties: { target: { type: 'string', enum: ['viewport', 'workbench'] }, minSpp: { type: 'number', description: 'wait for this many samples per pixel first (viewport only), up to 15 s' } } },
      execute: async ({ target = 'viewport', minSpp = 0 }) => {
        const step = { kind: 'screenshot', target, code: `screenshot ${target}`, running: true, result: null };
        turn.steps.push(step); re();
        try {
          if (target === 'viewport' && minSpp && host.vp) { const t0 = performance.now(); while (host.vp.spp < minSpp && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100)); }
          const cv = target === 'workbench' ? await captureWorkbench(host, 1400) : await host.screenshotViewport(1200);
          const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
          const id = addImage(blob); step.image = id; step.running = false;
          const info = `${target} ${cv.width}×${cv.height}${target === 'viewport' && host.vp ? ` at ${host.vp.spp} spp, EV100 ${host.vp.exposureEV().toFixed(1)}` : ''}`;
          step.result = info; re();
          if (!imagesOn) return `Captured ${info}. Images cannot be returned to you in this view.`;
          if (shots.length >= Math.max(1, maxImgs - 0)) return 'Screenshot limit for this round reached; the earlier ones will be sent.';
          shots.push(id);
          return `Captured ${info}. It will be attached to your next round: end this turn now with one short sentence.`;
        } catch (e) { step.running = false; step.error = true; step.result = 'failed: ' + e.message; re(); throw new Error('screenshot failed: ' + e.message); }
      },
    };
    try {
      const turns = toTurns(host, th, imagesOn);
      const opts = { signal: ctl.current.signal, modelTier: S.settings.tier, tools: [evalTool, shotTool], onText: ({ text }) => { turn.text = text; re(); } };
      if (S.settings.effort) opts.effort = S.settings.effort;
      if (imgs.length && imagesOn) opts.images = imgs.map(id => IMGS.get(id) && IMGS.get(id).blob).filter(Boolean);
      const res = await sample(turns, opts);
      turn.text = res.text; if (res.truncated) turn.note = 'The answer hit the length limit.';
    } catch (e) {
      const code = e && e.code;
      if (code === 'cancelled') turn.note = 'Stopped.';
      else if (OFF[code]) { setOff(OFF[code]); turn.note = OFF[code]; }
      else if (code === 'rate_limited') turn.note = 'Too many requests just now; try again in a little while.';
      else if (code === 'prompt_too_large') turn.note = 'The conversation is too long. Start a new thread.';
      else if (code === 'images_unavailable') turn.note = 'Images cannot be sent to Claude in this view.';
      else if (code === 'image_rejected') turn.note = 'An image was rejected (type or size).';
      else if (code === 'refused') { turn.text = ''; turn.note = 'Claude declined this request.'; }
      else turn.note = 'Interrupted: ' + (e && (e.message || e.code) || 'unknown error');
      if (e && e.text && code !== 'refused') turn.text = e.text;
      shots.length = 0;
    }
    turn.pending = false; setBusy(false); persist(); re();
    // the agent asked to look: send its screenshots back (bounded, so a loop cannot run away)
    const autoDepth = (o.autoDepth || 0);
    if (shots.length && imagesOn && autoDepth < 4 && !(ctl.current && ctl.current.signal.aborted)) {
      setTimeout(() => send(`[The screenshot${shots.length > 1 ? 's' : ''} you took ${shots.length > 1 ? 'are' : 'is'} attached. Continue the task.]`, { images: shots.slice(0, maxImgs || 4), auto: true, autoDepth: autoDepth + 1 }), 50);
    }
  };
  const revert = (turn, i) => {
    const s = turn.steps[i]; if (!s.snapshot) { host.toast('This step’s snapshot is gone (reloaded page)', true); return; }
    host.files = Object.assign({}, s.snapshot.files); host.saveEdits();
    for (let j = i; j < turn.steps.length; j++) turn.steps[j].reverted = true;
    host.build({}); host.toast('Reverted the files to before that step and rebuilt'); re(); persist();
  };
  const newThread = () => { const id = 'a' + Date.now().toString(36); S.threads.push({ id, title: 'New thread', turns: [] }); S.active = id; persist(); re(); };
  const closeThread = id => { S.threads = S.threads.filter(t => t.id !== id); if (!S.threads.length) S.threads.push({ id: 'a1', title: 'New thread', turns: [] }); if (S.active === id) S.active = S.threads[S.threads.length - 1].id; persist(); re(); };
  const tries = (host.preset && host.preset.tries || []).concat(['Take a screenshot and tell me what to improve physically', 'Explain every default this scene assumed']).slice(0, 6);
  const thumb = (id, k) => { const im = IMGS.get(id); return im ? <img key={k} className="thumb" src={im.url} alt="" /> : <span key={k} className="thumb gone" title="image from an earlier session">▢</span>; };
  return <div className={'tabbody col agent-panel' + (dragOver ? ' dragover' : '')} onDragOver={e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); setDragOver(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }} onDrop={e => { e.preventDefault(); setDragOver(false); attach(e.dataTransfer.files); }}>
    <div className="threads">{S.threads.map(t => <span key={t.id} className={'th' + (t.id === S.active ? ' on' : '')}><button onClick={() => { S.active = t.id; persist(); re(); }}>{t.title}</button><button className="x" aria-label="close thread" onClick={() => closeThread(t.id)}>×</button></span>)}<button className="new" onClick={newThread} disabled={busy}>+ New</button></div>
    <div className="agent-set">
      <span className="ctl-l">Mode</span><Seg small value={S.settings.mode} onChange={v => { S.settings.mode = v; persist(); re(); }} options={[{ value: 'auto', label: 'Auto', title: 'runs each step' }, { value: 'ask', label: 'Ask', title: 'you approve each step' }, { value: 'read', label: 'Read-only', title: 'no edits' }]} />
      <span className="ctl-l">Model</span><Seg small value={S.settings.tier} onChange={v => { S.settings.tier = v; persist(); re(); }} options={[{ value: 'quick', label: 'Fast' }, { value: 'default', label: 'Balanced' }, { value: 'complex', label: 'Deep' }]} />
      <span className="ctl-l">Thinking</span><Seg small value={S.settings.effort} onChange={v => { S.settings.effort = v; persist(); re(); }} options={[{ value: '', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Med' }, { value: 'high', label: 'High' }]} />
    </div>
    {(off || avail === false) && <div className="agent-off"><b>The agent is off here.</b>{off || 'Claude is not available in this view, so the agent cannot run. Everything else in the workbench works.'}</div>}
    <div className="agent-log" ref={logRef}>
      {!th.turns.length && <div className="agent-empty">
        <p>Ask for a change and the agent edits the scene, rebuilds, measures the render and looks at it. It works through two tools: <b>eval</b>, with the API you see in the Reference, and <b>screenshot</b>, which shows it the viewport or the whole workbench.{imagesOn ? ' Paste or drop an image to show it a reference photo.' : ''}</p>
        <div className="sugg">{tries.map(t => <button key={t} onClick={() => send(t)} disabled={busy || avail === false}>{t}</button>)}</div>
      </div>}
      {th.turns.map((t, i) => t.role === 'user' ? <div key={i} className={'msg user' + (t.auto ? ' auto' : '')}><span className="who">{t.auto ? 'Screenshots → agent' : 'You'}</span>{t.images && t.images.length ? <div className="thumbs">{t.images.map(thumb)}</div> : null}{!t.auto && <div className="body">{t.text}</div>}</div> :
        <div key={i} className={'msg agent' + (t.note && !t.text ? ' error' : '')}><span className="who">Agent</span>
          {t.steps.map((s, k) => s.kind === 'screenshot' ? <div key={k} className={'tool shot' + (s.running ? ' run' : '') + (s.error ? ' err' : '')}>
            <div className="sumrow"><i className="dot" /><span className="nm">screenshot</span><span className="first">{s.target}{s.result ? ' · ' + s.result : ''}</span><span className="ms">{s.running ? 'capturing…' : ''}</span></div>
            {s.image && IMGS.get(s.image) && <img className="shotimg" src={IMGS.get(s.image).url} alt={'screenshot of the ' + s.target} />}
          </div> : <details key={k} className={'tool' + (s.running ? ' run' : '') + (s.asking ? ' ask' : '') + (s.error ? ' err' : '') + (s.reverted ? ' reverted' : '')} open={s.asking || undefined}>
            <summary><i className="dot" /><span className="nm">eval</span><span className="first">{s.code.split('\n').find(l => l.trim()) || ''}</span><span className="ms">{s.asking ? 'waiting for you' : s.running ? 'running…' : s.ms ? s.ms.toFixed(0) + ' ms' : ''}</span></summary>
            <div className="tb">
              <pre className="src" dangerouslySetInnerHTML={{ __html: highlight(s.code) }} />
              {s.asking && <div className="row"><button className="btn primary sm" onClick={() => s.resolve && s.resolve(true)}>Run this step</button><button className="btn sm" onClick={() => s.resolve && s.resolve(false)}>Decline</button></div>}
              {s.result != null && <pre className={'res' + (s.error ? ' bad' : '')}>{s.result}</pre>}
              <div className="row">{s.changed && !s.reverted && s.snapshot && <button className="link" onClick={() => revert(t, k)}>revert files to before this step</button>}{s.reverted && <span className="dim">reverted</span>}<button className="link" onClick={() => copyText(s.code, host)}>copy code</button></div>
            </div>
          </details>)}
          {t.text ? <div className="md doc-inline" onClick={e => { const a = e.target.closest('a'); if (a && a.dataset.lab) { e.preventDefault(); host.link(a.dataset.lab); } }} dangerouslySetInnerHTML={{ __html: render(t.text, { highlight, toc: false }).html }} /> : t.pending ? <span className="thinking">{t.steps.length ? 'Working' : 'Thinking'}</span> : null}
          {t.note && <span className="note">{t.note}</span>}
        </div>)}
    </div>
    <div className="composer">
      {atts.length > 0 && <div className="attrow">{atts.map((id, k) => <span key={id} className="att">{thumb(id, k)}<button className="x" aria-label="remove image" onClick={() => setAtts(a => a.filter(x => x !== id))}>×</button></span>)}</div>}
      <textarea value={draft} placeholder={'Ask the agent: “make the copper look aged”, “light this like golden hour”, “why is the glass dark?”' + (imagesOn ? ' — paste or drop a reference image' : '')} onChange={e => setDraft(e.target.value)} onPaste={onPaste} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Message to the agent" />
      <div className="row">
        {imagesOn && <><button className="btn sm" onClick={() => fileRef.current && fileRef.current.click()} title={`Attach images (up to ${maxImgs})`}>Image…</button><input ref={fileRef} type="file" accept={(lim.images.mediaTypes || ['image/png', 'image/jpeg']).join(',')} multiple hidden onChange={e => { attach(e.target.files); e.target.value = ''; }} /></>}
        {imagesOn && <button className="btn sm" disabled={busy || !host.vp} onClick={async () => { try { const c = await host.screenshotViewport(1200); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); setAtts(a => a.concat([addImage(b)]).slice(0, maxImgs || 4)); } catch (e) { host.toast(e.message, true); } }} title="Attach a picture of the current render">+ Render</button>}
        <span className="meta">Enter sends · Shift+Enter new line · {S.settings.mode === 'auto' ? 'steps run as they come' : S.settings.mode === 'ask' ? 'you approve each step' : 'read-only'}</span>
        {busy ? <button className="btn danger" onClick={() => ctl.current && ctl.current.abort()}>Stop</button> : <button className="btn primary" onClick={() => send()} disabled={(!draft.trim() && !atts.length) || avail === false}>Send</button>}
      </div>
    </div>
  </div>;
}
