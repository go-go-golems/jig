// A host for the agent's tests that keeps BUILD.md §4: files, preset, program, selection, view, overrides, events,
// compile/check/call/export, snapshot/restore. Its "engine" compiles an open box (60 × 40 × 30 mm, 2 mm walls)
// from the script's own params, so edits and overrides change the numbers the agent measures.

export const BOX_SCRIPT = `const box = j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })
  .extrude(j.sketch('base', { on: j.plane.XY }).rect('r', 'w', 'd', { center: true }).profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
return box
`;
export const BOX_NOTES = '# Open box\n\nA 60 × 40 × 30 mm box with 2 mm walls, shelled from the top face.\n';
export const PRESET = {
  id: 'A-01', title: 'Open box', group: 'Basics', about: 'a shelled box: one sketch, an extrude and a shell',
  tries: 'Make the walls 2.4 mm and check the mass | Why is the rim face called body/end?',
  files: { 'script.js': BOX_SCRIPT, 'notes.md': BOX_NOTES },
};

const UNIT = { mm: 1, cm: 10, m: 1000, um: 0.001, inch: 25.4 };
const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function parseParams(script) {
  const out = {};
  const m = /\.params\(\s*\{([^}]*)\}/.exec(script);
  if (!m) return out;
  for (const k of m[1].matchAll(/(\w+)\s*:\s*(mm|cm|m|um|inch)\(\s*(-?[\d.]+)\s*\)/g)) out[k[1]] = +k[3] * UNIT[k[2]];
  return out;
}
const num = v => (typeof v === 'number' ? v : parseFloat(String(v)));

export function compileBox(files, { override = {} } = {}) {
  const script = files['script.js'] ?? '';
  const t0 = Date.now();
  try { new Function(script); } catch (e) {
    const line = /line (\d+)/.exec(e.message)?.[1];
    return failed(e.message, line ? +line : undefined);
  }
  const lineOf = re => { const i = script.search(re); return i < 0 ? undefined : script.slice(0, i).split('\n').length; };
  const P = parseParams(script);
  for (const [k, v] of Object.entries(override)) if (k in P) P[k] = num(v);
  const { w = 60, d = 40, h = 30, wall = 2 } = P;
  if (wall * 2 >= Math.min(w, d)) return failed(`shell: wall ${wall} mm leaves no inside in a ${w} × ${d} mm box`, lineOf(/\.shell\(/), 'feature.failed', 'shell');
  const iw = w - 2 * wall, id_ = d - 2 * wall, ih = h - wall;
  const volume = w * d * h - iw * id_ * ih;
  const F = [];
  const face = (name, kind, area, center, normal) => F.push({ index: F.length, name, kind, area, center, normal });
  face('body/start', 'plane', w * d, [0, 0, 0], [0, 0, -1]);
  face('body/side[base.l1]', 'plane', w * h, [0, -d / 2, h / 2], [0, -1, 0]);
  face('body/side[base.l2]', 'plane', d * h, [w / 2, 0, h / 2], [1, 0, 0]);
  face('body/side[base.l3]', 'plane', w * h, [0, d / 2, h / 2], [0, 1, 0]);
  face('body/side[base.l4]', 'plane', d * h, [-w / 2, 0, h / 2], [-1, 0, 0]);
  face('body/end', 'plane', w * d - iw * id_, [0, d / 2 - wall / 2, h], [0, 0, 1]);
  face('shell/inner[body/side[base.l1]]', 'plane', iw * ih, [0, -id_ / 2, wall + ih / 2], [0, 1, 0]);
  face('shell/inner[body/side[base.l2]]', 'plane', id_ * ih, [iw / 2, 0, wall + ih / 2], [-1, 0, 0]);
  face('shell/inner[body/side[base.l3]]', 'plane', iw * ih, [0, id_ / 2, wall + ih / 2], [0, -1, 0]);
  face('shell/inner[body/side[base.l4]]', 'plane', id_ * ih, [-iw / 2, 0, wall + ih / 2], [1, 0, 0]);
  face('shell/floor', 'plane', iw * id_, [0, 0, wall], [0, 0, 1]);
  const edge = (name, a, b, faces) => ({ index: 0, name, kind: 'line', points: new Float32Array([...a, ...b]), faces });
  const E = [
    edge('body/side[base.l1] ∩ body/side[base.l2]', [w / 2, -d / 2, 0], [w / 2, -d / 2, h], [1, 2]),
    edge('body/side[base.l1] ∩ body/end', [-w / 2, -d / 2, h], [w / 2, -d / 2, h], [1, 5]),
  ].map((e, i) => ({ ...e, index: i }));
  const n = 24;
  const diagnostics = [{ level: 'info', kind: 'fit.uncalibrated', at: 'box', message: 'using default fit classes' }];
  if (wall < lw * 2) diagnostics.push({ level: 'warning', kind: 'print.thinWall', at: 'shell', line: lineOf(/wall:/), message: `walls of ${wall} mm are under two line widths (0.9 mm)`, fix: 'wall: lw(2)' });
  const src = k => (k in override ? 'override' : 'params');
  return {
    ok: true, hash: 'b3:' + Math.round(volume).toString(16), kind: 'part', name: 'box', ms: Date.now() - t0,
    summary: { features: 3, bodies: 1, sketches: 1, dof: 0, faces: F.length, volume },
    metrics: {
      volume: { value: volume, unit: 'mm³', fidelity: 'exact' },
      mass: { value: volume * 1.24e-3, unit: 'g', fidelity: 'exact' },
      bbox: { value: [w, d, h], unit: 'mm', fidelity: 'exact' },
      faces: { value: F.length, unit: 'count', fidelity: 'exact' },
    },
    diagnostics,
    trace: [{ pass: 'sketch:base', level: 'L3', ms: 0.4, cached: false }, { pass: 'feature:body', level: 'L4', ms: 2.1, cached: false }, { pass: 'feature:shell', level: 'L4', ms: 3.3, cached: false }],
    decisions: [{ at: 'body', kind: 'op', chose: 'new', alternatives: ['join'], reason: 'first feature' }],
    params: Object.entries({ w, d, h, wall }).map(([name, value]) => ({ name, value, unit: 'mm', text: `${+value.toFixed(3)} mm`, expr: null, src: src(name), deps: [], exposed: null })),
    graph: { nodes: [{ id: 'base', kind: 'sketch', label: 'base · sketch', level: 'L1' }, { id: 'body', kind: 'extrude', label: 'body · extrude', level: 'L1' }, { id: 'shell', kind: 'shell', label: 'shell · shell', level: 'L1' }],
      edges: [{ from: 'base', to: 'body', kind: 'profile' }, { from: 'body', to: 'shell', kind: 'body' }] },
    sketches: [{ id: 'base', plane: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] }, dof: 0, status: 'fully', entities: [], constraints: [], conflicts: [], profiles: [] }],
    bodies: [{ id: 'box/body1', name: 'body1', part: 'box', color: null, transform: ID,
      mesh: { positions: new Float32Array(n * 9), normals: new Float32Array(n * 9), indices: new Uint32Array(n * 3), triFace: new Uint32Array(n) },
      faces: F, edges: E, bbox: [[-w / 2, -d / 2, 0], [w / 2, d / 2, h]] }],
    print: null,
    ir: { L0: 'part box', L1: 'base sketch\nbody extrude(base, h)\nshell shell(body/end, wall)', L2: `w = ${w} mm\nd = ${d} mm\nh = ${h} mm\nwall = ${wall} mm`, L3: 'base fully (dof 0)', L4: F.map(f => f.name).join('\n'), L5: 'box/body1 at identity', L6: 'mesh: 24 triangles' },
  };
}
const lw = 0.45;

function failed(message, line, kind = 'script.error', at = 'script.js') {
  return { ok: false, hash: null, kind: null, name: null, error: { message, line, file: 'script.js' }, summary: {}, metrics: {}, trace: [], decisions: [], params: [], graph: { nodes: [], edges: [] }, sketches: [], bodies: [], print: null, ir: {},
    diagnostics: [{ level: 'error', kind, at, message, line }] };
}

function selectFaces(program, q) {
  const faces = program.bodies.flatMap(b => b.faces);
  const ax = { X: 0, Y: 1, Z: 2 };
  const m = /^([+\-<>|#%])(\w+)$/.exec(String(q).trim());
  if (!m) throw new Error(`faces: cannot read the query ${q}`);
  const [, op, a] = m;
  if (op === '%') return faces.filter(f => f.kind === a);
  const i = ax[a.toUpperCase()];
  if (op === '+') return faces.filter(f => f.normal && f.normal[i] > 0.999);
  if (op === '-') return faces.filter(f => f.normal && f.normal[i] < -0.999);
  if (op === '|') return faces.filter(f => f.normal && Math.abs(f.normal[i]) > 0.999);
  if (op === '#') return faces.filter(f => f.normal && Math.abs(f.normal[i]) < 1e-6);
  const best = op === '>' ? Math.max(...faces.map(f => f.center[i])) : Math.min(...faces.map(f => f.center[i]));
  return faces.filter(f => Math.abs(f.center[i] - best) < 1e-9);
}

export function createMockHost({ delay = 5, preset = PRESET } = {}) {
  const ls = new Map();
  const host = {
    files: new Map(Object.entries(preset.files)),
    preset: { ...preset },
    program: null, lastGood: null, selection: null,
    view: { name: 'axo', yaw: 0.66, pitch: 0.47, scale: 1, target: null, overlays: new Set(['shadows', 'grid', 'dims']) },
    overrides: {}, compiling: false, toasts: [], log: [],
    on(ev, fn) { if (!ls.has(ev)) ls.set(ev, new Set()); ls.get(ev).add(fn); return () => ls.get(ev).delete(fn); },
    emit(ev, d) { for (const f of ls.get(ev) || []) f(d); },
    setFile(path, text) { host.files.set(path, text); host.emit('files', host.files); },
    edit(path, oldText, newText) {
      const cur = host.files.get(path);
      if (cur == null) return { ok: false, error: `no file ${path}` };
      const i = cur.indexOf(oldText);
      if (i < 0) return { ok: false, error: `text not found in ${path}` };
      host.setFile(path, cur.slice(0, i) + newText + cur.slice(i + oldText.length));
      return { ok: true };
    },
    isEdited(path) { return host.files.get(path) !== preset.files[path]; },
    async compile() {
      host.compiling = true; host.emit('compiling', true);
      await new Promise(r => setTimeout(r, delay));
      const p = compileBox(Object.fromEntries(host.files), { override: host.overrides });
      host.program = p; if (p.ok) { host.lastGood = p; host.goodInputs = { files: Object.fromEntries(host.files), override: { ...(host.overrides instanceof Map ? Object.fromEntries(host.overrides) : host.overrides || {}) } }; }
      host.compiling = false; host.emit('program', p);
      return p;
    },
    async check(files) {
      await new Promise(r => setTimeout(r, delay));
      return compileBox({ ...Object.fromEntries(host.files), ...files });
    },
    async call(method, ...args) {
      host.log.push(['call', method, ...args]);
      const p = host.program && host.program.ok ? host.program : host.lastGood;
      if (!p) throw new Error('no program');
      if (method === 'faces') return selectFaces(p, args[0]);
      if (method === 'why') return { target: args[0], resolved: ['body/end'], chain: ['body/end ← extrude(base) cap', 'shell removed the inner region; the remaining rim keeps its name'] };
      if (method === 'feature') { const n = p.graph.nodes.find(x => x.id === args[0]); if (!n) throw new Error(`no feature ${args[0]}`); return { id: n.id, kind: n.kind, inputs: p.graph.edges.filter(e => e.to === n.id).map(e => e.from), cache: { key: 'b3:9f2c', cached: false } }; }
      if (method === 'sketch') { const s = p.sketches.find(x => x.id === args[0]); if (!s) throw new Error(`no sketch ${args[0]}`); return { id: s.id, dof: s.dof, status: s.status, conflicts: [], entities: 4, constraints: 6 }; }
      if (method === 'param') return p.params.find(x => x.name === args[0]) || null;
      if (method === 'ir') return `${args[0]} of ${args[1]?.node}:\n` + (p.ir[args[0]] || '');
      throw new Error(`unknown method ${method}`);
    },
    async export(format) {
      if (!host.program || !host.program.ok) throw new Error('nothing to export: the compile failed');
      const data = format === 'step' ? 'ISO-10303-21;\n' + 'x'.repeat(4000) : new ArrayBuffer(84 + 50 * 24);
      return { data, filename: `box.${format}`, mime: 'model/stl', report: { kept: ['part names'], approximated: ['B-rep → mesh (max deviation 0.008 mm)'], dropped: [] } };
    },
    user: [],
    presets() { return [{ id: preset.id, title: preset.title, group: preset.group, about: preset.about }, { id: 'A-02', title: 'Plate', group: 'Basics', about: 'an 80 × 50 × 4 mm plate with four M3 holes' }, ...host.user.map(({ files, ...m }) => m)]; },
    findPreset(id) { return host.user.find(p => p.id === id) || (host.presets().some(p => p.id === id) ? { ...preset, id } : null); },
    async loadPreset(id) { const u = host.user.find(p => p.id === id); host.preset = u ? { ...u } : { ...preset, id }; if (u) host.files = new Map(Object.entries(u.files)); host.emit('preset', host.preset); await host.compile(); },
    isMine(id) { return host.user.some(p => p.id === id); },
    async createPreset({ title, about, files, from, open = true } = {}) {
      if (from != null && !host.findPreset(from)) throw new Error(`no preset ${from} to copy`);
      const fs = files ? { ...files } : from === host.preset.id ? Object.fromEntries(host.files) : from ? { ...preset.files } : { 'script.js': "return j.part('part')\n" };
      const id = `U-${String(host.user.length + 1).padStart(2, '0')}`;
      host.user.push({ id, title: title || 'Untitled', group: 'Yours', about: about || '', files: fs });
      if (open) await host.loadPreset(id);
      return id;
    },
    renamePreset(id, title) {
      const u = host.user.find(p => p.id === id);
      if (!u) throw new Error(host.findPreset(id) ? `${id} ships with the workbench; copy it first: createPreset({ from: '${id}', title })` : `no preset ${id}`);
      if (!String(title ?? '').trim()) throw new Error('give the new title as text');
      u.title = String(title).trim(); if (host.preset.id === id) host.preset.title = u.title;
      return u.title;
    },
    renameFile(from, to) { if (!host.files.has(from) || host.files.has(to)) return false; const t = host.files.get(from); host.files.delete(from); host.files.set(to, t); return true; },
    deleteFile(path) { if (path === 'script.js') return false; return host.files.delete(path); },
    select(sel) { host.selection = sel; host.emit('selection', sel); },
    setView(patch) { host.view = { ...host.view, ...patch }; host.emit('view', host.view); },
    setOverride(name, value) { if (value == null) delete host.overrides[name]; else host.overrides[name] = value; host.overrides = { ...host.overrides }; },
    resetOverrides() { host.overrides = {}; },
    toast(text, level) { host.toasts.push(level ? `${level}: ${text}` : text); host.emit('toast', { text, level }); },
    focus(view, intent) { host.log.push(['focus', view, intent]); },
    selectNode(id) { host.log.push(['node', id]); },
    snapshot() { return Object.fromEntries(host.files); },
    restore(s) { host.files = new Map(Object.entries(s)); host.emit('files', host.files); },
  };
  return host;
}
