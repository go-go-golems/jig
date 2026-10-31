// A stand-in for the engine worker (BUILD.md §2) that answers the same protocol in the main thread with a canned
// ProgramData: a box (shelled when the script has a `wall` param) sized from the script's own length params, with a
// feature graph read from the script's text. It exists so the workbench runs before dist/worker.js speaks the
// protocol; host/engine.js switches to the real worker as soon as it answers `init`.

const UNIT = { mm: 1, cm: 10, m: 1000, um: 0.001, inch: 25.4, ft: 304.8 };
const FEATURE_OPS = 'extrude|cut|revolve|sweep|loft|hole|fillet|chamfer|shell|draft|rib|emboss|thicken|pattern|mirror|add|feature|split|boolean';

// ---------- params: parse `.params({ … })`, evaluate expressions, apply overrides ----------
function parseParams(script) {
  const out = [];
  const re = /\.params\(\s*\{/g;
  let m;
  while ((m = re.exec(script))) {
    let i = re.lastIndex, depth = 1;
    while (i < script.length && depth) { const ch = script[i++]; if (ch === '{') depth++; else if (ch === '}') depth--; }
    const body = script.slice(re.lastIndex, i - 1);
    const kv = /(\w+)\s*:\s*(?:(mm|cm|m|um|inch|ft|deg|rad|gram|kg)\(\s*(-?[\d.]+)\s*\)|(-?[\d.]+)|'([^']*)'|"([^"]*)")/g;
    let k;
    while ((k = kv.exec(body))) {
      const [, name, unit, uval, num, s1, s2] = k;
      if (out.some(p => p.name === name)) continue;
      if (unit) out.push(unit === 'deg' || unit === 'rad'
        ? { name, value: unit === 'rad' ? +uval * 180 / Math.PI : +uval, unit: 'deg', expr: null }
        : unit in UNIT ? { name, value: +uval * UNIT[unit], unit: 'mm', expr: null } : { name, value: +uval, unit: 'g', expr: null });
      else if (num != null) out.push({ name, value: +num, unit: '', expr: null });
      else out.push({ name, value: null, unit: 'mm', expr: s1 ?? s2 });
    }
  }
  return out;
}
function parseExposed(script) {
  const m = /\.expose\(\s*\[([^\]]*)\]/.exec(script);
  return m ? [...m[1].matchAll(/'(\w+)'|"(\w+)"/g)].map(x => x[1] || x[2]) : [];
}
function parseLabels(script) {
  const m = /labels:\s*\{([^}]*)\}/.exec(script);
  return m ? Object.fromEntries([...m[1].matchAll(/(\w+):\s*'([^']*)'/g)].map(x => [x[1], x[2]])) : {};
}

// a tiny expression evaluator: numbers (with an optional unit), names, + − × ÷, parentheses
function evalExpr(text, env) {
  const toks = String(text).match(/\d+\.?\d*(?:\s*(?:mm|cm|um|inch|m|deg|rad|turn|g|kg)\b)?|[A-Za-z_]\w*|[-+*/()]/g) || [];
  let i = 0;
  const deps = new Set();
  const peek = () => toks[i], next = () => toks[i++];
  const atom = () => {
    const t = next();
    if (t === '(') { const v = sum(); next(); return v; }
    if (t === '-') return -atom();
    if (/^\d/.test(t)) { const [, n, u] = /^([\d.]+)\s*(\w+)?$/.exec(t); return +n * (UNIT[u] ?? 1); }
    if (/^[A-Za-z_]/.test(t)) { deps.add(t); if (!(t in env)) throw new Error(`unknown parameter ${t}`); return env[t]; }
    throw new Error(`unexpected ${t ?? 'end'} in '${text}'`);
  };
  const prod = () => { let v = atom(); while (peek() === '*' || peek() === '/') v = next() === '*' ? v * atom() : v / atom(); return v; };
  const sum = () => { let v = prod(); while (peek() === '+' || peek() === '-') v = next() === '+' ? v + prod() : v - prod(); return v; };
  const value = sum();
  return { value, deps: [...deps] };
}
const fmtNum = v => String(+(+v).toFixed(4));

function resolveParams(script, override = {}) {
  const raw = parseParams(script), exposed = parseExposed(script), labels = parseLabels(script);
  const env = {}, params = [];
  const pending = [...raw];
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    for (const p of [...pending]) {
      let value = p.value, deps = [], src = 'params';
      if (p.expr != null) {
        try { ({ value, deps } = evalExpr(p.expr, env)); } catch (e) { if (pass < 7) continue; throw e; }
      }
      if (override[p.name] != null) {
        const o = override[p.name];
        value = typeof o === 'number' ? o : evalExpr(String(o), env).value;
        src = 'override';
      }
      env[p.name] = value;
      pending.splice(pending.indexOf(p), 1);
      const lo = p.unit === 'mm' ? Math.max(0.1, Math.round(value * 0.3 * 10) / 10) : 0;
      const hi = p.unit === 'mm' ? Math.round(value * 2.5) : p.unit === 'deg' ? 360 : Math.max(10, value * 3);
      params.push({
        name: p.name, value, unit: p.unit, text: `${fmtNum(value)}${p.unit ? ' ' + p.unit : ''}`, expr: p.expr, src, deps,
        exposed: exposed.includes(p.name) ? { label: labels[p.name] || p.name, range: [lo, hi], step: p.unit === 'mm' ? 0.5 : 1 } : null,
      });
    }
  }
  for (const p of params) p.dependents = params.filter(q => q.deps.includes(p.name)).map(q => q.name);
  return { params, env };
}

// ---------- geometry: an (optionally open, shelled) box ----------
function boxGeometry(w, d, h, t, src = 'base.outline') {
  const side = k => `body/side[${src}.${['bottom', 'right', 'top', 'left'][k - 1]}]`;
  const faces = [], quads = [];
  const add = (name, kind, normal, qs) => { const index = faces.length; faces.push({ index, name, kind, normal }); for (const q of qs) quads.push([index, q]); };
  const X0 = -w / 2, X1 = w / 2, Y0 = -d / 2, Y1 = d / 2;
  const P = (x, y, z) => [x, y, z];
  add('body/start', 'plane', [0, 0, -1], [[P(X0, Y0, 0), P(X0, Y1, 0), P(X1, Y1, 0), P(X1, Y0, 0)]]);
  add(side(1), 'plane', [0, -1, 0], [[P(X0, Y0, 0), P(X1, Y0, 0), P(X1, Y0, h), P(X0, Y0, h)]]);
  add(side(2), 'plane', [1, 0, 0], [[P(X1, Y0, 0), P(X1, Y1, 0), P(X1, Y1, h), P(X1, Y0, h)]]);
  add(side(3), 'plane', [0, 1, 0], [[P(X1, Y1, 0), P(X0, Y1, 0), P(X0, Y1, h), P(X1, Y1, h)]]);
  add(side(4), 'plane', [-1, 0, 0], [[P(X0, Y1, 0), P(X0, Y0, 0), P(X0, Y0, h), P(X0, Y1, h)]]);
  const edges = [];
  const loop = (pts) => { for (let i = 0; i < pts.length; i++) edges.push([pts[i], pts[(i + 1) % pts.length]]); };
  loop([P(X0, Y0, 0), P(X1, Y0, 0), P(X1, Y1, 0), P(X0, Y1, 0)]);
  loop([P(X0, Y0, h), P(X1, Y0, h), P(X1, Y1, h), P(X0, Y1, h)]);
  for (const [x, y] of [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]) edges.push([P(x, y, 0), P(x, y, h)]);
  if (!t) {
    add('body/end', 'plane', [0, 0, 1], [[P(X0, Y0, h), P(X1, Y0, h), P(X1, Y1, h), P(X0, Y1, h)]]);
  } else {
    const x0 = X0 + t, x1 = X1 - t, y0 = Y0 + t, y1 = Y1 - t;
    add('body/end', 'plane', [0, 0, 1], [
      [P(X0, Y0, h), P(X1, Y0, h), P(x1, y0, h), P(x0, y0, h)], [P(X1, Y0, h), P(X1, Y1, h), P(x1, y1, h), P(x1, y0, h)],
      [P(X1, Y1, h), P(X0, Y1, h), P(x0, y1, h), P(x1, y1, h)], [P(X0, Y1, h), P(X0, Y0, h), P(x0, y0, h), P(x0, y1, h)]]);
    add(`shell/inner[${side(1)}]`, 'plane', [0, 1, 0], [[P(x1, y0, t), P(x0, y0, t), P(x0, y0, h), P(x1, y0, h)]]);
    add(`shell/inner[${side(2)}]`, 'plane', [-1, 0, 0], [[P(x1, y1, t), P(x1, y0, t), P(x1, y0, h), P(x1, y1, h)]]);
    add(`shell/inner[${side(3)}]`, 'plane', [0, -1, 0], [[P(x0, y1, t), P(x1, y1, t), P(x1, y1, h), P(x0, y1, h)]]);
    add(`shell/inner[${side(4)}]`, 'plane', [1, 0, 0], [[P(x0, y0, t), P(x0, y1, t), P(x0, y1, h), P(x0, y0, h)]]);
    add('shell/inner[body/start]', 'plane', [0, 0, 1], [[P(x0, y0, t), P(x1, y0, t), P(x1, y1, t), P(x0, y1, t)]]);
    loop([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)]);
    loop([P(x0, y0, t), P(x1, y0, t), P(x1, y1, t), P(x0, y1, t)]);
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) edges.push([P(x, y, t), P(x, y, h)]);
  }
  const positions = [], normals = [], indices = [], triFace = [];
  const area = new Array(faces.length).fill(0), cen = faces.map(() => [0, 0, 0]);
  for (const [fi, q] of quads) {
    const base = positions.length / 3, n = faces[fi].normal;
    for (const p of q) { positions.push(...p); normals.push(...n); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    triFace.push(fi, fi);
    const a = Math.hypot(...cross(sub(q[1], q[0]), sub(q[3], q[0])));
    area[fi] += a;
    for (let k = 0; k < 3; k++) cen[fi][k] += a * (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4;
  }
  faces.forEach((f, i) => { f.area = area[i]; f.center = cen[i].map(v => v / (area[i] || 1)); });
  const edgeList = edges.map(([a, b], i) => ({ index: i, name: `edge#${i}`, kind: 'line', points: new Float32Array([...a, ...b]), faces: [] }));
  const volume = w * d * h - (t ? (w - 2 * t) * (d - 2 * t) * (h - t) : 0);
  return {
    volume, faces, edges: edgeList, bbox: [[X0, Y0, 0], [X1, Y1, h]],
    mesh: { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), triFace: new Uint32Array(triFace) },
  };
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// ---------- the feature graph, read from the script's text ----------
function lineOf(script, index) { return script.slice(0, index).split('\n').length; }
function readGraph(script, params) {
  const nodes = [], edges = [];
  const partM = /j\.(part|assembly|print)\(\s*'([^']+)'/.exec(script);
  const partName = partM ? partM[2] : 'part';
  const sketches = [...script.matchAll(/j\.sketch\(\s*'([^']+)'/g)].map(m => {
    const decl = /(?:const|let|var)\s+(\w+)\s*=\s*$/.exec(script.slice(Math.max(0, m.index - 40), m.index));
    return { id: m[1], at: m.index, line: lineOf(script, m.index), name: decl?.[1] };
  });
  const feats = [];
  const fre = new RegExp(`\\.(${FEATURE_OPS})\\(`, 'g');
  let m;
  while ((m = fre.exec(script))) {
    const tail = script.slice(m.index, m.index + 600);
    const idm = /\bid:\s*'([^']+)'/.exec(tail);
    const next = tail.slice(1).search(new RegExp(`\\.(${FEATURE_OPS})\\(`));
    const own = idm && (next < 0 || idm.index < next + 1);
    feats.push({ id: own ? idm[1] : `${m[1]}${feats.filter(f => f.op === m[1]).length + 1}`, op: m[1], at: m.index, line: lineOf(script, m.index), text: tail.slice(0, next < 0 ? 600 : next + 1) });
  }
  for (const p of params) nodes.push({ id: p.name, kind: 'param', label: `${p.name} · ${p.text}`, level: 'L2' });
  for (const s of sketches) nodes.push({ id: s.id, kind: 'sketch', label: `${s.id} · sketch`, level: 'L3', line: s.line });
  for (const f of feats) nodes.push({ id: f.id, kind: f.op, label: `${f.id} · ${f.op}`, level: 'L4', line: f.line });
  nodes.push({ id: partName, kind: partM?.[1] || 'part', label: `${partName} · ${partM?.[1] || 'part'}`, level: 'L5' });
  const uses = (text, name) => new RegExp(`'[^']*\\b${name}\\b[^']*'`).test(text);
  for (const p of params) {
    for (const q of params) if (q.deps.includes(p.name)) edges.push({ from: p.name, to: q.name, kind: 'expr' });
    for (const s of sketches) { const end = script.indexOf(')', script.indexOf('.profiles', s.at)); if (uses(script.slice(s.at, end > 0 ? end : s.at + 400), p.name)) edges.push({ from: p.name, to: s.id, kind: 'dim' }); }
    for (const f of feats) if (uses(f.text.replace(/j\.sketch\([\s\S]*?\.profiles\(\)/g, ''), p.name)) edges.push({ from: p.name, to: f.id, kind: 'value' });
  }
  for (const s of sketches) {
    const f = feats.find(f => s.at > f.at && s.at < f.at + f.text.length)                    // a sketch written inside the call
      || (s.name && feats.find(f => new RegExp(`\\b${s.name}\\b`).test(f.text)))           // or passed by its variable
      || feats.find(f => f.at > s.at);
    if (f) edges.push({ from: s.id, to: f.id, kind: 'profile' });
  }
  for (let i = 1; i < feats.length; i++) edges.push({ from: feats[i - 1].id, to: feats[i].id, kind: 'body' });
  if (feats.length) edges.push({ from: feats[feats.length - 1].id, to: partName, kind: 'body' });
  return { graph: { nodes, edges }, sketches, feats, partName, partKind: partM?.[1] || 'part' };
}

// ---------- the program ----------
let lastInputs = new Map();

export function mockCompile(files, options = {}) {
  const t0 = performance.now();
  const script = files['script.js'] ?? '';
  checkSyntax(script);
  const { params, env } = resolveParams(script, options.override || {});
  const { graph, sketches, feats, partName, partKind } = readGraph(script, params);
  const lengths = params.filter(p => p.unit === 'mm' && !p.expr).map(p => p.value);
  const pick = (names, i, dflt) => { for (const n of names) if (env[n] > 0) return env[n]; return lengths[i] > 0 ? lengths[i] : dflt; };
  const w = pick(['w', 'width'], 0, 60), d = pick(['d', 'depth'], 1, 40), h = pick(['h', 'height'], 2, 30);
  const wantShell = 'wall' in env || feats.some(f => f.op === 'shell');
  const t = wantShell ? Math.max(0.2, Math.min(env.wall ?? 2, w / 2 - 0.5, d / 2 - 0.5, h - 0.5)) : 0;
  const rect = /j\.sketch\(\s*'([^']+)'[\s\S]*?\.rect\(\s*'([^']+)'/.exec(script);
  const geo = boxGeometry(w, d, h, t, rect ? `${rect[1]}.${rect[2]}` : 'base.outline');
  const density = /PETG/.test(script) ? 1.27 : 1.24, material = /PETG/.test(script) ? 'PETG' : 'PLA';
  const mass = geo.volume / 1000 * density;

  const diagnostics = [];
  for (const p of params) if (p.name === 'wall' && p.value < 1.2) {
    const line = script.split('\n').findIndex(l => /\bwall\s*:/.test(l)) + 1;
    diagnostics.push({ level: 'warning', kind: 'print.thinWall', at: 'shell', message: `wall ${fmtNum(p.value)} mm is under three line widths (1.35 mm)`, fix: 'raise wall to 1.4 mm or more', line: line || undefined });
  }
  if (!/\.fit\(/.test(script)) diagnostics.push({ level: 'info', kind: 'fit.uncalibrated', at: partName, message: 'using default fit classes; print j.fit.coupon() once to calibrate' });

  const inputs = new Map(graph.nodes.map(n => [n.id, JSON.stringify([n.label, graph.edges.filter(e => e.to === n.id).map(e => graph.nodes.find(x => x.id === e.from)?.label)])]));
  const trace = [{ pass: 'parse', level: 'L0', ms: 0.4, cached: lastInputs.get('#src') === script, note: `${script.split('\n').length} lines` },
    { pass: 'params', level: 'L2', ms: 0.2, cached: false, note: `${params.length} params, ${params.filter(p => p.src === 'override').length} overridden` }];
  for (const n of graph.nodes.filter(n => n.kind !== 'param')) {
    const cached = lastInputs.get(n.id) === inputs.get(n.id);
    trace.push({ pass: `${n.kind === 'sketch' ? 'sketch' : n.level === 'L5' ? 'place' : 'feature'}:${n.id}`, level: n.level, ms: cached ? 0.05 : n.kind === 'sketch' ? 1.2 : n.kind === 'shell' ? 6.8 : 3.1, cached, note: n.kind });
  }
  trace.push({ pass: 'mesh', level: 'L6', ms: 1.9, cached: false, note: `${geo.mesh.indices.length / 3} triangles, deviation 0 mm (planar faces)` });
  lastInputs = new Map(inputs); lastInputs.set('#src', script);

  const decisions = feats.map((f, i) => i === 0
    ? { at: f.id, kind: 'op', chose: 'new', alternatives: ['join'], reason: 'first feature of the part; created body1' }
    : { at: f.id, kind: 'op', chose: f.op === 'shell' ? 'modify' : 'join', alternatives: ['new'], reason: `touches body1 (${feats[i - 1].id})` });
  decisions.push({ at: partName, kind: 'orient', chose: '+Z', alternatives: ['-Z', '+X', '+Y'], reason: `support 0 mm³; bed contact ${fmtNum(w * d)} mm²` });

  const body = { id: `${partName}/body1`, name: 'body1', part: partName, color: null,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], mesh: geo.mesh, faces: geo.faces, edges: geo.edges, bbox: geo.bbox };
  const sk = sketches.map(s => ({ id: s.id, plane: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], normal: [0, 0, 1] }, dof: 0, status: 'fully', entities: [], constraints: [], conflicts: [],
    profiles: [{ loops: [[[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]], area: w * d, outer: 0 }] }));
  const metrics = {
    volume: { value: geo.volume, unit: 'mm³', fidelity: 'exact' },
    mass: { value: mass, unit: 'g', fidelity: 'exact', note: `${material}, ${density} g/cm³, solid` },
    bbox: { value: [w, d, h], unit: 'mm', fidelity: 'exact' },
    faces: { value: geo.faces.length, unit: '', fidelity: 'exact' },
    features: { value: feats.length, unit: '', fidelity: 'exact' },
    printTime: { value: Math.round(mass * 1.6 + 4), unit: 'min', fidelity: 'approx' },
    filament: { value: mass / 2.98, unit: 'm', fidelity: 'approx' },
  };
  const hash = 'b3:' + hashString(script + JSON.stringify(options.override || {})).slice(0, 12);
  const ms = performance.now() - t0;
  const program = {
    ok: true, hash, kind: partKind, name: partName,
    summary: { features: feats.length, bodies: 1, sketches: sketches.length, dof: 0, faces: geo.faces.length, volume: geo.volume, mass, material, ms: +ms.toFixed(1) },
    metrics, diagnostics, trace, decisions, params, graph, sketches: sk, bodies: [body], print: null, ir: {},
  };
  program.ir = irText(program, files, w, d, h, t);
  return program;
}

function checkSyntax(script) {
  try { new (Object.getPrototypeOf(async function () {}).constructor)('j', 'mm', 'cm', 'm', 'deg', 'turn', 'data', script); }
  catch (e) {
    if (!(e instanceof SyntaxError)) return;          // eval refused by a content security policy: skip the check
    const err = new Error(e.message); err.file = 'script.js'; err.line = guessLine(script, e); throw err;
  }
}
function guessLine(script, e) {
  // V8 gives no position for a Function constructor's SyntaxError: the first prefix of lines that fails with an
  // error other than an unfinished input holds the culprit on its last line
  const AF = Object.getPrototypeOf(async function () {}).constructor;
  const lines = script.split('\n');
  for (let k = 1; k <= lines.length; k++) {
    try { new AF(lines.slice(0, k).join('\n')); }
    catch (err) { if (err instanceof SyntaxError && !/end of input|Unterminated|missing \) after|Unexpected end/i.test(err.message)) return k; }
  }
  return lines.length;
}
function hashString(s) {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 + s.charCodeAt(i), 2246822507); }
  return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padEnd(16, '0');
}

function irText(P, files, w, d, h, t) {
  const b = P.bodies[0];
  const L0 = [`# L0 source · program ${P.name} · ${P.hash}`, ...Object.entries(files).map(([f, s]) => `file ${f}  ${s.length} bytes  b3:${hashString(s).slice(0, 8)}`)];
  const L1 = [`# L1 feature graph · ${P.graph.nodes.length} nodes · ${P.graph.edges.length} edges`, ...P.graph.nodes.filter(n => n.kind !== 'param').map(n => {
    const ins = P.graph.edges.filter(e => e.to === n.id).map(e => `${e.from}:${e.kind}`);
    return `${n.id} = ${n.kind}(${ins.join(', ')})`;
  })];
  const L2 = [`# L2 resolved parameters (canonical units, with provenance)`, ...P.params.map(p => `${p.name} = ${p.text}${p.expr ? `   = ${p.expr}` : ''}   ← ${p.src}${p.deps.length ? `   deps ${p.deps.join(', ')}` : ''}`)];
  const L3 = [`# L3 solved sketches`, ...P.sketches.map(s => `sketch ${s.id}: dof ${s.dof} · ${s.status} · ${s.profiles.length} profile, area ${fmtNum(s.profiles[0].area)} mm²`)];
  const L4 = [`# L4 topology · ${b.id}: ${b.faces.length} faces · ${b.edges.length} edges`, ...b.faces.map(f => `face ${f.index} ${f.name}  ${f.kind}  area ${fmtNum(f.area)} mm²`)];
  const L5 = [`# L5 world`, `${b.id} at identity · orient +Z · bbox ${fmtNum(w)} × ${fmtNum(d)} × ${fmtNum(h)} mm${t ? ` · wall ${fmtNum(t)} mm` : ''}`];
  const L6 = [`# L6 products`, `mesh ${b.id}: ${b.mesh.indices.length / 3} triangles · max deviation 0 mm (planar)`, `# the mock engine does not slice; STEP and 3MF need the OpenCascade worker`];
  return { L0: L0.join('\n'), L1: L1.join('\n'), L2: L2.join('\n'), L3: L3.join('\n'), L4: L4.join('\n'), L5: L5.join('\n'), L6: L6.join('\n') };
}

// ---------- calls and exports against the kept program ----------
function call(P, method, args) {
  if (!P) throw new Error('nothing compiled yet');
  const b = P.bodies[0];
  switch (method) {
    case 'why': {
      const target = String(args[0] ?? '');
      const face = b.faces.find(f => f.name === target);
      if (face) {
        const chain = [];
        const inner = /\[(.*)\]$/.exec(target)?.[1];
        const src = /\[([\w.]+)\]+$/.exec(target)?.[1];
        if (src && src.includes('.')) chain.push(`${src} · edge of the sketch rectangle`);
        if (/body\/side/.test(target) && target.startsWith('shell/')) chain.push(`body/side[${src}] · extrude side`);
        chain.push(`${target} · ${target.split('/')[0]} ${target.includes('inner') ? 'offset inward by wall' : 'created'}`);
        return { target, resolved: [target], via: 'genealogy', genealogy: chain, reason: `kept: genealogy resolves through ${chain.length} step${chain.length > 1 ? 's' : ''}; no index-based reference` };
      }
      const node = P.graph.nodes.find(n => n.id === target || `feature:${n.id}` === target || `param:${n.id}` === target);
      if (node) return { target, kind: node.kind, inputs: P.graph.edges.filter(e => e.to === node.id).map(e => `${e.from} (${e.kind})`), reason: `${node.label}; decided ${P.decisions.find(d => d.at === node.id)?.reason ?? 'by default'}` };
      throw new Error(`no face or node ${target}`);
    }
    case 'param': { const p = P.params.find(p => p.name === args[0]); if (!p) throw new Error(`no param ${args[0]}`); return p; }
    case 'ir': { const text = P.ir[args[0]] ?? ''; const node = args[1]?.node; return node ? text.split('\n').filter(l => l.startsWith('#') || l.includes(node)).join('\n') : text; }
    case 'feature': { const n = P.graph.nodes.find(n => n.id === args[0]); if (!n) throw new Error(`no feature ${args[0]}`); return { ...n, decisions: P.decisions.filter(d => d.at === n.id), trace: P.trace.filter(t => t.pass.endsWith(':' + n.id)) }; }
    case 'faces': return b.faces.filter(f => !args[0] || f.name.includes(String(args[0]).replace(/[<>+|#%]/g, ''))).map(f => f.name);
    case 'sketch': return P.sketches.find(s => s.id === args[0]) ?? null;
    case 'metric': return P.metrics[args[0]] ?? null;
    case 'find': return P.graph.nodes.filter(n => n.kind === args[0]).map(n => n.id);
    default: throw new Error(`the mock engine has no call ${method}`);
  }
}

function stl(P) {
  const out = [`solid ${P.name}`];
  for (const b of P.bodies) {
    const { positions: p, indices: ix } = b.mesh;
    for (let i = 0; i < ix.length; i += 3) {
      const v = [0, 1, 2].map(k => [p[ix[i + k] * 3], p[ix[i + k] * 3 + 1], p[ix[i + k] * 3 + 2]]);
      const n = cross(sub(v[1], v[0]), sub(v[2], v[0])), l = Math.hypot(...n) || 1;
      out.push(`  facet normal ${n.map(x => (x / l).toFixed(6)).join(' ')}`, '    outer loop', ...v.map(q => `      vertex ${q.map(x => x.toFixed(4)).join(' ')}`), '    endloop', '  endfacet');
    }
  }
  out.push(`endsolid ${P.name}`);
  return out.join('\n');
}

export function createMockEngine() {
  let kept = null;
  const ops = {
    init: () => ({ ms: 0, version: 'mock' }),
    compile: ({ files, options }) => { const program = mockCompile(files, options); if (options?.keep !== false) kept = program; return { program }; },
    call: ({ method, args = [] }) => ({ value: call(kept, method, args) }),
    solveSketch: ({ sketchId }) => ({ sketch: kept?.sketches.find(s => s.id === sketchId) ?? null }),
    export: ({ format }) => {
      if (!kept) throw new Error('nothing compiled yet');
      if (format === 'stl') return { data: stl(kept), filename: `${kept.name}.stl`, mime: 'model/stl', report: { kept: ['faces'], approximated: [], dropped: ['units (STL has none: millimetres)'], maxDeviation: 0 } };
      if (format === 'ir') return { data: JSON.stringify({ hash: kept.hash, ir: kept.ir }, null, 2), filename: `${kept.name}.ir.json`, mime: 'application/json', report: { kept: ['L0–L6 text'], approximated: [], dropped: [] } };
      throw new Error(`${format.toUpperCase()} export needs the OpenCascade worker; the mock engine writes STL and the IR only`);
    },
    run: async ({ code, files = {} }) => {
      let fn;
      try { fn = new (Object.getPrototypeOf(async function () {}).constructor)('compile', 'data', 'j', 'mm', 'cm', 'm', 'deg', 'turn', code); }
      catch (e) { if (e instanceof SyntaxError) throw e; throw new Error('the mock engine cannot run code under this page’s security policy'); }
      const id = x => x;
      const compile = (text, opts = {}) => mockCompile({ ...files, 'script.js': typeof text === 'string' ? text : files['script.js'] }, { ...opts, keep: false });
      // the mock's units are plain millimetre numbers
      const saved = lastInputs;
      try { return { value: await fn(compile, {}, null, id, x => x * 10, x => x * 1000, id, x => x * 360) }; }
      finally { lastInputs = saved; }
    },
  };
  return {
    kind: 'mock',
    async request(op, args = {}) {
      if (!ops[op]) throw Object.assign(new Error(`unknown op ${op}`), { op });
      await new Promise(r => setTimeout(r, 0));
      return ops[op](args);
    },
    terminate() {},
  };
}
