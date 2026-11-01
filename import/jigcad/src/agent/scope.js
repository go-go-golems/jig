// labScope(host): the names the agent's eval code sees. Every name is documented in reference.md
// ("The agent's eval scope"), which is appended to the instructions and shown in the Reference view.
// Return small plain data; throw an Error whose message says how to fix the call. The host itself is never in scope.

export const READONLY = ['files.write', 'files.edit', 'files.rename', 'files.remove', 'run', 'params.set', 'params.clear', 'presets.load', 'presets.create', 'presets.rename'];

const r3 = x => (typeof x === 'number' && Number.isFinite(x) ? +x.toFixed(3) : x);
const v3 = a => (a ? Array.from(a, r3) : a);
const sorted = a => [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

// ── files ────────────────────────────────────────────────────────────────────
export function filesOf(host) {
  const f = host.files;
  if (!f) return new Map();
  return f instanceof Map ? f : new Map(Object.entries(f));
}
export function filesObject(host) { return Object.fromEntries(filesOf(host)); }

function getFile(host, path, verb) {
  const map = filesOf(host);
  if (typeof path !== 'string') throw new Error(`${verb}: give a path as a string; files are ${sorted(map.keys()).join(', ')}`);
  if (!map.has(path)) throw new Error(`${verb}: no file ${path}; files are ${sorted(map.keys()).join(', ')}`);
  return map.get(path);
}

function countOf(text, find) {
  let n = 0, i = 0;
  while ((i = text.indexOf(find, i)) !== -1) { n++; i += Math.max(1, find.length); }
  return n;
}
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

function isEdited(host, path, text) {
  if (typeof host.isEdited === 'function') return !!host.isEdited(path);
  const orig = host.preset && host.preset.files;
  if (!orig) return false;
  return orig[path] !== text;
}

function setFile(host, path, text) {
  if (typeof host.setFile === 'function') host.setFile(path, text);
  else filesOf(host).set(path, text);
}

function makeFiles(host) {
  return {
    list() {
      return sorted(filesOf(host).keys()).map(path => {
        const text = filesOf(host).get(path);
        return { path, lines: text.split('\n').length, edited: isEdited(host, path, text) };
      });
    },
    read(path, from, to) {
      const text = getFile(host, path, 'read');
      if (from == null) return text;
      const lines = text.split('\n');
      const a = Math.max(1, Math.floor(from)), b = Math.min(lines.length, Math.floor(to ?? a + 39));
      if (a > lines.length) throw new Error(`read: ${path} has ${lines.length} lines; from ${a} is past the end`);
      const w = String(b).length;
      return lines.slice(a - 1, b).map((l, i) => `${String(a + i).padStart(w)}  ${l}`).join('\n');
    },
    grep(pattern, path) {
      const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.replace('g', '')) : null;
      if (!re && (typeof pattern !== 'string' || !pattern)) throw new Error('grep: give a string (matched literally) or a RegExp');
      const paths = path ? [path] : sorted(filesOf(host).keys());
      const out = [];
      let total = 0;
      for (const p of paths) {
        const lines = getFile(host, p, 'grep').split('\n');
        lines.forEach((l, i) => {
          if (re ? re.test(l) : l.includes(pattern)) {
            total++;
            if (out.length < 80) { const t = l.trim(); out.push(`${p}:${i + 1}  ${t.length > 160 ? t.slice(0, 159) + '…' : t}`); }
          }
        });
      }
      if (total > out.length) out.push(`… ${total - out.length} more matches; narrow the pattern or give a path`);
      return out;
    },
    write(path, text) {
      if (typeof path !== 'string' || !path) throw new Error('write: give a path and the whole text');
      if (typeof text !== 'string') throw new Error('write: the text must be a string');
      setFile(host, path, text);
      return { path, lines: text.split('\n').length };
    },
    edit(path, find, replace) {
      const text = getFile(host, path, 'edit');
      if (typeof find !== 'string' || !find) throw new Error('edit: give the exact text to find, as a string');
      if (typeof replace !== 'string') throw new Error('edit: the replacement must be a string');
      const n = countOf(text, find);
      if (n === 0) throw new Error(`edit: text not found in ${path} (it must match exactly, including spaces)`);
      if (n > 1) throw new Error(`edit: text occurs ${n} times in ${path}; include more context so it is unique`);
      const at = text.indexOf(find);
      const next = text.slice(0, at) + replace + text.slice(at + find.length);
      if (typeof host.edit === 'function') {
        const r = host.edit(path, find, replace);
        if (r && r.ok === false) throw new Error(`edit: ${r.error || 'the workbench refused the edit'}`);
        if (filesOf(host).get(path) !== next) setFile(host, path, next);
      } else setFile(host, path, next);
      return { path, line: lineAt(text, at) };
    },
    rename(from, to) {
      getFile(host, from, 'rename');
      if (typeof to !== 'string' || !to.trim()) throw new Error('rename: give the new path as text');
      if (from === 'script.js' || to === 'script.js') throw new Error('rename: script.js is the entry point and keeps its name');
      if (filesOf(host).has(to)) throw new Error(`rename: ${to} exists already`);
      if (typeof host.renameFile === 'function') { if (!host.renameFile(from, to)) throw new Error(`rename: the workbench refused to rename ${from}`); }
      else { const map = filesOf(host), text = map.get(from); map.delete(from); map.set(to, text); }
      return { from, to };
    },
    remove(path) {
      getFile(host, path, 'remove');
      if (path === 'script.js') throw new Error('remove: script.js is the entry point and cannot be removed');
      if (typeof host.deleteFile === 'function') { if (!host.deleteFile(path)) throw new Error(`remove: the workbench refused to remove ${path}`); }
      else filesOf(host).delete(path);
      return { removed: path };
    },
  };
}

// ── compile results ──────────────────────────────────────────────────────────
const WARNINGS_SHOWN = 6;
function errorList(p, err) {
  if (err) return [{ message: err.message || String(err), ...(err.file ? { file: err.file } : {}), ...(err.line ? { line: err.line } : {}), ...(err.column ? { column: err.column } : {}) }];
  const ds = (p && p.diagnostics) || [];
  const errs = ds.filter(d => d.level === 'error').map(d => compactDiag(d));
  if (!errs.length && p && p.error) return errorList(null, p.error);
  if (!errs.length && p && p.ok === false) return [{ message: 'compile failed without a message' }];
  return errs;
}
function compactDiag(d) {
  const o = { level: d.level, kind: d.kind };
  if (d.at) o.at = d.at;
  if (d.line) o.line = d.line;
  o.message = d.message;
  if (d.fix) o.fix = d.fix;
  return o;
}
export function flatMetrics(p) {
  const out = {};
  for (const [k, m] of Object.entries((p && p.metrics) || {})) out[k] = m && typeof m === 'object' && 'value' in m ? m.value : m;
  return out;
}
async function compileResult(promiseFn) {
  const t0 = now();
  let p = null, err = null;
  try { p = await promiseFn(); } catch (e) { err = e && (e.error || e); }
  const ms = Math.round(now() - t0);
  const errors = errorList(p, err);
  const ok = !err && !!p && p.ok !== false && errors.length === 0;
  // warnings as text, like errors (JIG-009): a count alone hid "the cut removes no material" from the agent
  const ws = ((p && p.diagnostics) || []).filter(d => d.level === 'warning').map(d => compactDiag(d));
  const warnings = ws.length > WARNINGS_SHOWN ? [...ws.slice(0, WARNINGS_SHOWN), { more: ws.length - WARNINGS_SHOWN, see: 'program.diagnostics()' }] : ws;
  return { p, ok, ms, errors, warnings };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ── the program ──────────────────────────────────────────────────────────────
function prog(host, verb) {
  const p = host.program || host.lastGood;
  if (!p) throw new Error(`${verb}: no compiled program yet; call run() first`);
  return p;
}
const good = (host, verb) => {
  const p = host.program && host.program.ok !== false ? host.program : host.lastGood;
  if (!p) throw new Error(`${verb}: no successful compile yet; fix the errors and run() again`);
  return p;
};
const globRe = g => new RegExp('^' + String(g).replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '.') + '$');

function makeProgram(host) {
  return {
    summary() { const p = prog(host, 'program.summary'); return { ok: p.ok !== false, kind: p.kind, name: p.name, ...(p.summary || {}) }; },
    metrics(names) {
      const p = good(host, 'program.metrics');
      const want = names == null ? null : new Set([].concat(names));
      const out = {};
      for (const [k, m] of Object.entries(p.metrics || {})) {
        if (want && !want.has(k)) continue;
        out[k] = m && typeof m === 'object' ? { value: m.value, unit: m.unit, fidelity: m.fidelity } : m;
      }
      return out;
    },
    diagnostics(level) {
      const p = prog(host, 'program.diagnostics');
      const ds = p.diagnostics || [];
      return (level ? ds.filter(d => d.level === level) : ds).map(compactDiag);
    },
    params(glob) {
      const p = good(host, 'program.params');
      const re = glob ? globRe(glob) : null;
      return (p.params || []).filter(x => !re || re.test(x.name)).map(x => {
        const o = { name: x.name, value: x.value, unit: x.unit, text: x.text };
        if (x.expr) o.expr = x.expr;
        o.src = x.src;
        if (x.deps && x.deps.length) o.deps = x.deps;
        if (x.exposed) o.range = x.exposed.range;
        return o;
      });
    },
    trace() { return (prog(host, 'program.trace').trace || []).map(t => ({ pass: t.pass, level: t.level, ms: t.ms, cached: t.cached, ...(t.note ? { note: t.note } : {}) })); },
    decisions() { return prog(host, 'program.decisions').decisions || []; },
    graph() {
      const g = good(host, 'program.graph').graph || { nodes: [], edges: [] };
      return {
        nodes: g.nodes.map(n => ({ id: n.id, kind: n.kind, level: n.level })),
        edges: g.edges.map(e => `${e.from} → ${e.to}${e.kind ? ' ' + e.kind : ''}`),
      };
    },
    async ir(level = 'L1', opts = {}) {
      const L = String(level).toUpperCase();
      if (!/^L[0-6]$/.test(L)) throw new Error('program.ir: level is L0 … L6');
      let text;
      if (opts.node) text = await call(host, 'ir', 'program.ir', L, { node: opts.node });
      else text = (good(host, 'program.ir').ir || {})[L];
      if (typeof text !== 'string') text = text == null ? '' : String(text);
      if (opts.from != null) {
        const lines = text.split('\n'); const a = Math.max(1, opts.from), b = Math.min(lines.length, opts.to ?? a + 59);
        return lines.slice(a - 1, b).map((l, i) => `${a + i}  ${l}`).join('\n');
      }
      return text;
    },
    bodies() {
      return (good(host, 'program.bodies').bodies || []).map(b => ({ id: b.id, part: b.part, faces: (b.faces || []).length, edges: (b.edges || []).length, bbox: b.bbox && b.bbox.map(v3) }));
    },
    print() {
      const pr = good(host, 'program.print').print;
      if (!pr) return null;
      return { printer: pr.printer, plates: (pr.plates || []).map(pl => ({ index: pl.index, items: pl.items.map(i => i.body) })), orientation: pr.orientation, overhang: (pr.overhang || []).map(o => ({ body: o.body, faces: o.faces.length, area: o.area })), layers: pr.layers ? { height: pr.layers.height, count: pr.layers.count } : null };
    },
  };
}

async function call(host, method, verb, ...args) {
  if (typeof host.call !== 'function') throw new Error(`${verb}: the engine is not ready`);
  try { return await host.call(method, ...args); }
  catch (e) { const m = (e && (e.message || (e.error && e.error.message))) || String(e); throw new Error(`${verb}: ${m}`); }
}

// ── faces, edges and measurement on the compiled bodies ──────────────────────
function applyPoint(t, p) {
  if (!t || !p) return p && Array.from(p);
  const [x, y, z] = p;
  return [t[0] * x + t[4] * y + t[8] * z + t[12], t[1] * x + t[5] * y + t[9] * z + t[13], t[2] * x + t[6] * y + t[10] * z + t[14]];
}
function applyDir(t, d) {
  if (!t || !d) return d && Array.from(d);
  const [x, y, z] = d;
  return [t[0] * x + t[4] * y + t[8] * z, t[1] * x + t[5] * y + t[9] * z, t[2] * x + t[6] * y + t[10] * z];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function findTopo(host, name, verb) {
  const p = good(host, verb);
  const bodies = p.bodies || [];
  for (const b of bodies) {
    const f = (b.faces || []).find(x => x.name === name);
    if (f) return { type: 'face', body: b, face: f };
  }
  for (const b of bodies) {
    const e = (b.edges || []).find(x => x.name === name);
    if (e) return { type: 'edge', body: b, edge: e };
  }
  const b = bodies.find(x => x.id === name || x.name === name);
  if (b) return { type: 'body', body: b };
  // a name without its split suffix (#a, #b) matches every piece
  const pieces = [];
  for (const b of bodies) for (const f of b.faces || []) if (f.name && f.name.replace(/#[a-z]+$/, '') === name) pieces.push({ body: b, face: f });
  if (pieces.length) return { type: 'faces', pieces };
  return null;
}

/** The engine's faces() may answer with names or records; give records, filled from the program by name. */
function resolveFaces(host, list) {
  let p = null;
  try { p = good(host, 'faces'); } catch { return list; }
  const byName = new Map();
  for (const b of p.bodies || []) for (const f of b.faces || []) if (!byName.has(f.name)) byName.set(f.name, f);
  return list.map(x => {
    if (typeof x === 'string') return byName.get(x) || { name: x };
    if (x && typeof x === 'object' && x.name && x.area == null && byName.has(x.name)) return { ...byName.get(x.name), ...x };
    return x;
  });
}

/** The host keeps a selection's body as an index into program.bodies; show its id. */
export function bodyId(host, b) {
  if (typeof b !== 'number') return b ?? null;
  const p = host.program && host.program.ok !== false ? host.program : host.lastGood;
  const body = p && p.bodies && p.bodies[b];
  return body ? body.id : b;
}

function faceRecord(body, f) {
  const t = body.transform;
  const o = { name: f.name, body: body.id, kind: f.kind, area: r3(f.area), center: v3(applyPoint(t, f.center)) };
  if (f.normal) o.normal = v3(applyDir(t, f.normal));
  if (f.axis) o.axis = { origin: v3(applyPoint(t, f.axis.origin)), dir: v3(applyDir(t, f.axis.dir)), radius: r3(f.axis.radius) };
  return o;
}
function edgeLength(e) {
  const p = e.points; if (!p || p.length < 6) return 0;
  let s = 0; for (let i = 3; i < p.length; i += 3) s += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2], p[i + 2] - p[i - 1]);
  return s;
}
function edgeRecord(body, e) {
  const fs = body.faces || [];
  const o = { name: e.name, body: body.id, kind: e.kind, length: r3(edgeLength(e)) };
  if (e.faces) o.faces = e.faces.map(i => (fs[i] ? fs[i].name : i));
  return o;
}

function geomOf(host, a, verb) {
  if (Array.isArray(a) || ArrayBuffer.isView(a)) return { point: Array.from(a).slice(0, 3), what: 'point' };
  if (typeof a !== 'string') throw new Error(`${verb}: give a face or edge name, or a point [x, y, z]`);
  const t = findTopo(host, a, verb);
  if (!t) throw new Error(`${verb}: no face or edge named ${a}; list names with faces('…') or program.bodies()`);
  if (t.type === 'face') { const r = faceRecord(t.body, t.face); return { point: r.center, normal: r.normal, axis: r.axis, what: t.face.kind, name: a }; }
  if (t.type === 'edge') {
    const p = t.edge.points, n = p.length / 3, tr = t.body.transform;
    const a0 = applyPoint(tr, [p[0], p[1], p[2]]), a1 = applyPoint(tr, [p[(n - 1) * 3], p[(n - 1) * 3 + 1], p[(n - 1) * 3 + 2]]);
    const mid = applyPoint(tr, [p[Math.floor(n / 2) * 3], p[Math.floor(n / 2) * 3 + 1], p[Math.floor(n / 2) * 3 + 2]]);
    const d = sub(a1, a0), L = len(d);
    return { point: mid, dir: t.edge.kind === 'line' && L ? d.map(x => x / L) : null, what: t.edge.kind + ' edge', name: a };
  }
  if (t.type === 'body') { const bb = t.body.bbox; return { point: bb[0].map((x, i) => (x + bb[1][i]) / 2), what: 'body centre', name: a }; }
  throw new Error(`${verb}: ${a} names ${t.pieces.length} split faces; give one (with its #a, #b suffix)`);
}

function makeMeasure(host) {
  return {
    face(name) {
      const t = findTopo(host, name, 'measure.face');
      if (!t || t.type !== 'face') throw new Error(`measure.face: no face named ${name}`);
      return faceRecord(t.body, t.face);
    },
    edge(name) {
      const t = findTopo(host, name, 'measure.edge');
      if (!t || t.type !== 'edge') throw new Error(`measure.edge: no edge named ${name}`);
      return edgeRecord(t.body, t.edge);
    },
    bbox(bodyId) {
      const bodies = (good(host, 'measure.bbox').bodies || []).filter(b => !bodyId || b.id === bodyId || b.name === bodyId || b.part === bodyId);
      if (!bodies.length) throw new Error(`measure.bbox: no body ${bodyId}; bodies are ${(good(host, 'measure.bbox').bodies || []).map(b => b.id).join(', ')}`);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const b of bodies) {
        const [a, c] = b.bbox; const t = b.transform;
        for (const x of [a[0], c[0]]) for (const y of [a[1], c[1]]) for (const z of [a[2], c[2]]) {
          const q = applyPoint(t, [x, y, z]);
          for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], q[i]); max[i] = Math.max(max[i], q[i]); }
        }
      }
      return { min: v3(min), max: v3(max), size: v3(max.map((x, i) => x - min[i])), unit: 'mm' };
    },
    async area(namesOrSelector) {
      const list = [].concat(namesOrSelector);
      let faces = [];
      for (const n of list) {
        const t = typeof n === 'string' ? findTopo(host, n, 'measure.area') : null;
        if (t && t.type === 'face') faces.push(t.face);
        else if (t && t.type === 'faces') faces.push(...t.pieces.map(x => x.face));
        else if (typeof n === 'string') faces.push(...resolveFaces(host, await call(host, 'faces', 'measure.area', n) || []));
      }
      const sum = faces.reduce((s, f) => s + (f.area || 0), 0);
      return { area: r3(sum), unit: 'mm²', faces: faces.length };
    },
    distance(a, b) {
      const A = geomOf(host, a, 'measure.distance'), B = geomOf(host, b, 'measure.distance');
      if (A.normal && B.normal && A.what === 'plane' && B.what === 'plane' && Math.abs(Math.abs(dot(A.normal, B.normal)) - 1) < 1e-6)
        return { distance: r3(Math.abs(dot(sub(B.point, A.point), A.normal))), unit: 'mm', how: 'between parallel planes' };
      if (A.axis && B.axis && Math.abs(Math.abs(dot(A.axis.dir, B.axis.dir)) - 1) < 1e-6) {
        const d = sub(B.axis.origin, A.axis.origin), along = dot(d, A.axis.dir);
        return { distance: r3(len(sub(d, A.axis.dir.map(x => x * along)))), unit: 'mm', how: 'between parallel axes' };
      }
      if (A.normal && A.what === 'plane' && !B.normal) return { distance: r3(Math.abs(dot(sub(B.point, A.point), A.normal))), unit: 'mm', how: `from the plane to the ${B.what}` };
      if (B.normal && B.what === 'plane' && !A.normal) return { distance: r3(Math.abs(dot(sub(A.point, B.point), B.normal))), unit: 'mm', how: `from the plane to the ${A.what}` };
      return { distance: r3(len(sub(B.point, A.point))), unit: 'mm', how: 'between centres' };
    },
    angle(a, b) {
      const dirOf = (x, verb) => {
        if (Array.isArray(x)) return x;
        const g = geomOf(host, x, verb);
        const d = g.normal || (g.axis && g.axis.dir) || g.dir;
        if (!d) throw new Error(`${verb}: ${x} has no normal, axis or direction`);
        return d;
      };
      const u = dirOf(a, 'measure.angle'), v = dirOf(b, 'measure.angle');
      const ang = Math.atan2(len(cross(u, v)), dot(u, v)) * 180 / Math.PI;
      return { angle: r3(ang), unit: '°' };
    },
  };
}

// ── links ────────────────────────────────────────────────────────────────────
// Escape what the link syntax needs (guides/agent/lab-links.md); spaces and other characters stay readable.
export const enc = v => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/#/g, '%23').replace(/\+/g, '%2B')
  .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\$/g, '%24').replace(/\n/g, '%0A');
const q = o => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${enc(v)}`).join('&');
const href = (action, o = {}) => { const s = q(o); return `lab:${action}${s ? '?' + s : ''}`; };

function makeLab(host, guard) {
  const node = (id, inView) => href('node', { id, in: inView });
  return {
    open: (file, at) => href('open', { file, ...(typeof at === 'number' ? { line: at } : at ? { find: at } : {}) }),
    face: name => href('face', { name }),
    node,
    feature: id => node(id),
    sketch: id => node(id),
    param: (name, value) => href('param', { name, value }),
    view: name => href('view', { name }),
    overlay: (name, on) => href('overlay', { name, on: on == null ? null : on ? 1 : 0 }),
    preset: id => href('preset', { id }),
    show: view => href('show', { view }),
    doc: (id, at) => href('doc', { id, at }),
    book: (ch, at) => href('book', { ch, at }),
    ask: text => href('ask', { q: text }),
    md: (text, target) => `[${String(text).replace(/[[\]]/g, '\\$&')}](${target})`,
    follow(target) {
      const t = String(target);
      if (/^lab:(param\?.*value=|preset|build|run|compile|reset)/.test(t)) guard('lab.follow ' + t.split('?')[0]);
      if (typeof host.link !== 'function') throw new Error('lab.follow: this workbench does not follow links yet');
      return host.link(t) !== false;
    },
  };
}

// ── the scope ────────────────────────────────────────────────────────────────
export const LOOK_MAX = 2;          // images per step
const LOOK_VIEWS = ['axo', 'front', 'side', 'plan'];

export function labScope(host, { readOnly = false, console: con, images = null } = {}) {
  const off = name => () => { throw new Error(`read-only mode: ${name} is off`); };
  const guard = name => { if (readOnly) throw new Error(`read-only mode: ${name} is off`); };

  const files = makeFiles(host);
  const program = makeProgram(host);
  const measure = makeMeasure(host);
  const lab = makeLab(host, guard);

  async function run() {
    const r = await compileResult(() => host.compile());
    const out = { ok: r.ok, ms: r.ms, errors: r.errors };
    if (r.p && r.ok) { out.warnings = r.warnings; out.summary = r.p.summary || {}; }
    return out;
  }

  async function check(variant, options) {
    let files0 = filesObject(host);
    if (typeof variant === 'string') files0 = { ...files0, 'script.js': variant };
    else if (variant instanceof Map) files0 = { ...files0, ...Object.fromEntries(variant) };
    else if (variant && typeof variant === 'object') files0 = { ...files0, ...variant };
    else if (variant != null) throw new Error('check: give the script text, or { path: text } for the files to change');
    if (typeof host.check !== 'function') throw new Error('check: the workbench cannot compile variants yet');
    const r = await compileResult(() => host.check(files0, options));
    const out = { ok: r.ok, ms: r.ms, errors: r.errors };
    if (r.p && r.ok) { out.warnings = r.warnings; out.summary = r.p.summary || {}; out.metrics = flatMetrics(r.p); }
    return out;
  }

  const params = {
    list: glob => program.params(glob),
    async get(name) { return call(host, 'param', 'params.get', name); },
    overrides() { const o = host.overrides; return o instanceof Map ? Object.fromEntries(o) : { ...(o || {}) }; },
    async set(name, value) {
      if (typeof name !== 'string') throw new Error('params.set: give the param name and a value (a number in its unit, or text such as "80 mm")');
      if (typeof host.setOverride === 'function') await host.setOverride(name, value);
      else if (host.overrides instanceof Map) host.overrides.set(name, value);
      else { if (!host.overrides) host.overrides = {}; host.overrides[name] = value; }
      const r = await run();
      let p = null;
      try { p = (good(host, 'params.set').params || []).find(x => x.name === name); } catch { /* no program */ }
      return { name, value: p ? p.text : value, ok: r.ok, ...(r.ok ? {} : { errors: r.errors }) };
    },
    async clear(name) {
      if (name && typeof host.setOverride === 'function') await host.setOverride(name, null);
      else if (!name && typeof host.resetOverrides === 'function') await host.resetOverrides();
      else if (host.overrides instanceof Map) name ? host.overrides.delete(name) : host.overrides.clear();
      else if (host.overrides) { if (name) delete host.overrides[name]; else for (const k of Object.keys(host.overrides)) delete host.overrides[k]; }
      const r = await run();
      return { cleared: name || 'all', ok: r.ok };
    },
  };

  const view = {
    get() { const v = host.view || {}; return { name: v.name, overlays: v.overlays ? [...v.overlays] : [], sketches: v.shown ? [...v.shown] : [] }; },
    set({ name, overlays, sketches } = {}) {
      const patch = {};
      // sketches: the ids drawn on the part in the 3D views (Sketch ▾ › 3D); [] hides them
      if (sketches) {
        const known = new Set(((host.program || host.lastGood || {}).sketches || []).map(x => x.id));
        const bad = [...sketches].filter(id => !known.has(id));
        if (bad.length) throw new Error(`view.set: no sketch ${bad.join(', ')} (sketches: ${[...known].join(', ') || 'none'})`);
        patch.shown = new Set(sketches);
      }
      if (name) {
        if (!['axo', 'front', 'side', 'plan'].includes(name)) throw new Error('view.set: name is axo, front, side or plan');
        patch.name = name;
      }
      if (overlays) {
        const cur = new Set(host.view && host.view.overlays ? host.view.overlays : []);
        if (Array.isArray(overlays) || overlays instanceof Set) patch.overlays = new Set(overlays);
        else { for (const [k, on] of Object.entries(overlays)) on ? cur.add(k) : cur.delete(k); patch.overlays = cur; }
      }
      host.setView(patch);
      return view.get();
    },
  };

  const mine = id => (typeof host.isMine === 'function' ? !!host.isMine(id) : /^[UZ]-/.test(String(id)));
  const needs = (name, verb) => { if (typeof host[name] !== 'function') throw new Error(`${verb}: this workbench cannot do that yet`); };
  const presets = {
    list() { return (host.presets ? host.presets() : []).map(p => ({ id: p.id, title: p.title, group: p.group, about: p.about, ...(mine(p.id) ? { mine: true } : {}) })); },
    current() {
      const p = host.preset;
      if (!p) return null;
      return { id: p.id, title: p.title, group: p.group, about: p.about, mine: mine(p.id), edited: typeof host.isEdited === 'function' ? !!host.isEdited() : false };
    },
    async create({ title, about, files, from, open = true } = {}) {
      needs('createPreset', 'presets.create');
      if (files != null && from != null) throw new Error('presets.create: give files or from, not both');
      let id;
      try { id = await host.createPreset({ title, about, files, from, open }); }
      catch (e) { throw new Error(`presets.create: ${e.message}`); }
      const p = host.findPreset ? host.findPreset(id) : null;
      return { id, title: p ? p.title : title, files: p ? sorted(Object.keys(p.files || {})) : [], open: !!open };
    },
    rename(id, title) {
      needs('renamePreset', 'presets.rename');
      try { return { id, title: host.renamePreset(id, title) }; }
      catch (e) { throw new Error(`presets.rename: ${e.message}`); }
    },
    async load(id) {
      const all = host.presets ? host.presets() : [];
      if (!all.some(p => p.id === id)) throw new Error(`presets.load: no preset ${id}; presets are ${all.map(p => p.id).join(', ')}`);
      await host.loadPreset(id);
      const p = host.preset || {};
      return { id: p.id, title: p.title, files: sorted(filesOf(host).keys()) };
    },
  };

  const scope = {
    files,
    run,
    check,
    program,
    why: target => call(host, 'why', 'why', target),
    async faces(selectorText) {
      const r = await call(host, 'faces', 'faces', selectorText);
      return Array.isArray(r) ? resolveFaces(host, r).map(f => (f && typeof f === 'object' ? { name: f.name, kind: f.kind, area: r3(f.area), center: v3(f.center), ...(f.normal ? { normal: v3(f.normal) } : {}), ...(f.axis ? { radius: r3(f.axis.radius) } : {}) } : f)) : r;
    },
    feature: id => call(host, 'feature', 'feature', id),
    async sketch(id) {
      try { return await call(host, 'sketch', 'sketch', id); }
      catch (e) {
        const s = (good(host, 'sketch').sketches || []).find(x => x.id === id);
        if (!s) throw e;
        return { id: s.id, dof: s.dof, status: s.status, conflicts: s.conflicts, entities: s.entities.map(x => ({ id: x.id, kind: x.kind, dofFree: x.dofFree })), constraints: s.constraints.map(c => ({ id: c.id, kind: c.kind, refs: c.refs, status: c.status })) };
      }
    },
    selection() {
      const s = host.selection;
      if (!s) return null;
      if (s.sketch && (s.constraint != null || s.entity != null)) return { sketch: s.sketch, ...(s.constraint != null ? { constraint: s.constraint } : { entity: s.entity }) };
      return { name: s.name ?? null, body: bodyId(host, s.body), face: s.face ?? null, edge: s.edge ?? null, ...(s.lost ? { lost: true } : {}) };
    },
    select(name) {
      if (name == null) { host.select(null); return null; }
      const t = findTopo(host, name, 'select');
      if (!t) throw new Error(`select: no face, edge or body named ${name}; list names with faces('…') or program.bodies()`);
      if (t.type === 'faces') throw new Error(`select: ${name} names ${t.pieces.length} split faces; give one (with its #a, #b suffix)`);
      const bodies = good(host, 'select').bodies || [];
      const sel = { body: bodies.indexOf(t.body), face: t.face ? t.face.index : null, edge: t.edge ? t.edge.index : null, name };
      host.select(sel);
      return { selected: name, body: t.body.id, ...(t.face ? { face: t.face.index } : {}), ...(t.edge ? { edge: t.edge.index } : {}) };
    },
    view,
    params,
    // exportFile(format, { save: true }) also hands the file to the page's save path (a browser download, or the
    // runtime's downloads capability); the bytes never reach the model.
    async exportFile(format, options = {}) {
      const { save = false, ...rest } = options || {};
      const r = await host.export(format, rest);
      const d = r && r.data;
      const bytes = d == null ? 0 : typeof d === 'string' ? new TextEncoder().encode(d).length : d.byteLength ?? d.size ?? 0;
      const out = { format, filename: r && r.filename, mime: r && r.mime, bytes, report: r && r.report };
      if (save) {
        if (typeof host.saveFile !== 'function') throw new Error('exportFile: this workbench cannot save files');
        out.saved = !!(await host.saveFile({ filename: r.filename, data: d, mime: r.mime, report: r.report }));
      }
      return out;
    },
    presets,
    measure,
    lab,
  };
  if (con) { scope.console = con; scope.log = con.log; }

  // look(view?, { width, height, overlays }): draw the sheet to a JPEG that reaches the model after this round's
  // tool results (JIG-006). The step's value says what was attached.
  scope.look = async function look(name, o = {}) {
    if (name && typeof name === 'object') { o = name; name = o.view; }
    if (!images) throw new Error('look: images do not reach the model from here');
    if (typeof host.renderView !== 'function') throw new Error('look: this workbench cannot draw here');
    if (images.length >= LOOK_MAX) throw new Error(`look: at most ${LOOK_MAX} images per step`);
    if (name != null && !LOOK_VIEWS.includes(name)) throw new Error('look: the view is axo, front, side or plan');
    const px = (v, d) => Math.max(64, Math.min(1600, Math.round(Number(v) || d)));
    const width = px(o.width, 640), height = px(o.height, width * 3 / 4);
    const shot = await host.renderView({ view: name || null, width, height, overlays: o.overlays || null });
    images.push({ mimeType: shot.mimeType, data: shot.data });
    const kb = Math.round(shot.data.length * 3 / 4 / 1024);
    return `image ${images.length}: ${shot.view} view, ${shot.width} × ${shot.height} px, ${kb} KB, attached after the tool results`;
  };

  if (readOnly) {
    files.write = off('files.write');
    files.edit = off('files.edit');
    scope.run = off('run');
    params.set = off('params.set');
    params.clear = off('params.clear');
    presets.load = off('presets.load');
    presets.create = off('presets.create');
    presets.rename = off('presets.rename');
    files.rename = off('files.rename');
    files.remove = off('files.remove');
  }
  return scope;
}
