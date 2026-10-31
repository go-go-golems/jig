// params.js · layered parameters with provenance, evaluated as a DAG (README §4.2).
// Precedence (low → high): library default < .params < .configs row < .override < design point / compile override.
// resolveAll(layers, ctx) evaluates every name lazily in dependency order, records provenance, and reports
// cycles with their path (param.cycle), dimension errors (units.dimension) and unknown names (param.unknown).
import { Quantity, DimensionError, q as parseQ, dimsKind, fmtNum, prettyUnit, resolveCtx, mm, describe } from './units.js';
import { Expr, ExprError, parseExpr, deps as exprDeps, evaluate, printExpr } from './expr.js';

export class ParamCycleError extends Error {
  constructor(path) {
    super(`parameter cycle: ${path.join(' → ')}`);
    this.name = 'ParamCycleError'; this.path = path; this.kind = 'param.cycle';
  }
}
class UpstreamError extends Error { constructor(name) { super(`depends on failed parameter '${name}'`); this.name = 'UpstreamError'; this.dep = name; } }

// A plain string value that is not an expression (table cells such as 'PLA').
export class Literal {
  constructor(value) { this.kind = 'literal'; this.value = value; Object.freeze(this); }
  toString() { return String(this.value); }
}

// ── design tables ──────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ',') { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}
export function parseCell(cell) {
  if (cell === '' || cell == null) return undefined;
  if (/^(true|false)$/i.test(cell)) return /^true$/i.test(cell);
  let ast;
  try { ast = parseExpr(cell); } catch { return new Literal(cell); }
  const d = exprDeps(ast);
  if (d.length) return /^[A-Za-z_][\w.]*$/.test(cell) ? new Literal(cell) : cell;   // a bare word is a literal; a formula stays an expression
  try {
    const v = parseQ(cell);
    return v.isDimensionless ? v.value : v;
  } catch { return new Literal(cell); }
}
export function table(csv, { key } = {}) {
  const rows = Array.isArray(csv) ? csv : parseCSV(csv);
  const [head, ...body] = rows;
  const keyCol = key ?? head[0];
  const ki = head.indexOf(keyCol);
  if (ki < 0) throw new Error(`table: key column '${keyCol}' not found (columns: ${head.join(', ')})`);
  const out = {}, names = [];
  body.forEach((r, i) => {
    const name = r[ki];
    const vals = {};
    head.forEach((col, c) => { if (c !== ki) { const v = parseCell(r[c]); if (v !== undefined) vals[col] = v; } });
    out[name] = Object.freeze(vals);
    names.push(name);
  });
  return Object.freeze({ kind: 'table', key: keyCol, columns: head.filter((_, c) => c !== ki), names, rows: Object.freeze(out),
    rowIndex: Object.freeze(Object.fromEntries(names.map((n, i) => [n, i + 1]))) });
}

// ── configurations and layers ─────────────────────────────────────────────
export function configNames(configs) {
  if (!configs) return [];
  return configs.kind === 'table' ? configs.names : Object.keys(configs);
}
export function activeConfig(configs, chosen = null) {
  const names = configNames(configs);
  if (!names.length) return null;
  let name = chosen, reason = 'chosen';
  if (name == null) { name = names[Math.floor((names.length - 1) / 2)]; reason = 'default: the middle row'; }
  if (!names.includes(name)) throw new Error(`unknown configuration '${name}' (have ${names.join(', ')})`);
  const isTable = configs.kind === 'table';
  const values = isTable ? configs.rows[name] : configs[name];
  const src = isTable ? `configs.${name} (table row ${configs.rowIndex[name]})` : `configs.${name}`;
  return { name, values, src, names, reason, tabulated: true, active: reason === 'chosen' ? name : `${name} (${reason})` };
}

// layers: [{ src, values }] in precedence order, low → high. `params` may be one object or a list (each .params() call).
export function paramLayers({ defaults = null, params = [], configs = null, config = null, overrides = [], compileOverride = null, point = null } = {}) {
  const layers = [];
  if (defaults) layers.push({ src: 'default', values: defaults });
  for (const p of [].concat(params)) if (p) layers.push({ src: 'params', values: p });
  const ac = configs ? activeConfig(configs, config) : null;
  if (ac) layers.push({ src: ac.src, values: ac.values, config: ac.name });
  for (const o of [].concat(overrides)) if (o) layers.push({ src: 'override', values: o });
  if (compileOverride) layers.push({ src: 'compile.override', values: compileOverride });
  if (point) layers.push({ src: 'point', values: point });
  return layers;
}

export function exposeMeta(names, { labels = {}, ranges = {}, steps = {} } = {}) {
  const out = {};
  for (const n of [].concat(names)) out[n] = { label: labels[n] ?? n, range: ranges[n] ?? null, step: steps[n] ?? null };
  return out;
}

// how to write a value back as code (used in fix suggestions)
export function codeOf(v) {
  if (v instanceof Quantity) {
    if (v.sym && Math.abs(v.v) < 1e-12 && Object.keys(v.sym).length === 1) { const [k, c] = Object.entries(v.sym)[0]; return `${k}(${fmtNum(c)})`; }
    if (!v.sym && !v.fn) {
      const u = v.u === 'deg' ? 'deg' : v.u;
      if (/^[A-Za-z]+$/.test(u)) return `${u === 'in' ? 'inch' : u}(${fmtNum(v.displayValue())})`;
    }
    return `j.q('${v}')`;
  }
  if (typeof v === 'string') return `'${v}'`;
  return String(v);
}
const showValue = v => (v instanceof Quantity ? v.toString() : v instanceof Literal ? v.value : typeof v === 'function' ? 'ƒ(ctx)' : v instanceof Expr ? v.text : v);

// ── evaluation ─────────────────────────────────────────────────────────────
export function resolveAll(layers, ctx = {}, opts = {}) {
  const { exposed = {}, lookup = null } = opts;
  const entries = new Map();          // name → [{ src, value, note }] low → high
  const declOrder = [];
  for (const L of layers) {
    for (const [name, value] of Object.entries(L.values ?? {})) {
      if (value === undefined) continue;
      if (!entries.has(name)) { entries.set(name, []); declOrder.push(name); }
      entries.get(name).push({ src: L.src, value });
    }
  }
  const pctx = resolveCtx(ctx);
  const values = {}, info = {}, diagnostics = [];
  const state = new Map();            // name → 'busy' | 'done' | 'failed'
  const finish = [];
  const reportedCycles = new Set();

  const get = (name, stack) => {
    const st = state.get(name);
    if (st === 'done') return values[name];
    if (st === 'failed') throw new UpstreamError(name);
    if (!entries.has(name)) {
      const v = lookup ? lookup(name) : undefined;
      if (v !== undefined) return v;
      return undefined;
    }
    if (st === 'busy') throw new ParamCycleError([...stack.slice(stack.indexOf(name)), name]);
    state.set(name, 'busy');
    const list = entries.get(name);
    const win = list[list.length - 1];
    const used = new Set();
    const scope = n => {
      if (n === name) throw new ParamCycleError([name, name]);
      const v = get(n, [...stack, name]);
      if (v !== undefined) used.add(n);
      return v;
    };
    try {
      const { value, exprText, raw } = evalValue(win.value, scope, pctx, ctx);
      values[name] = value;
      const depList = exprText != null ? exprDeps(exprText).filter(n => entries.has(n) || (lookup && lookup(n) !== undefined)) : [...used];
      info[name] = {
        name, value, text: showValue(value), raw: raw ?? showValue(win.value), expr: exprText, src: win.src,
        shadowed: list.slice(0, -1).reverse().map(e => ({ src: e.src, value: showValue(e.value), code: codeOf(e.value) })),
        deps: depList.sort(), via: {}, kind: dimsKind(value), exposed: null,
      };
      state.set(name, 'done');
      finish.push(name);
      return value;
    } catch (e) {
      state.set(name, 'failed');
      if (e instanceof ParamCycleError) {
        const key = [...new Set(e.path)].sort().join(',');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          const shadowedFix = e.path.map(n => ({ n, s: entries.get(n)?.slice(0, -1).reverse().find(x => !(typeof x.value === 'string')) })).find(x => x.s);
          diagnostics.push({ level: 'error', kind: 'param.cycle', at: `params.${e.path[0]}`, message: e.path.join(' → '), path: e.path,
            fix: shadowedFix ? `give one of them a value, e.g. ${shadowedFix.n}: ${codeOf(shadowedFix.s.value)}` : `give one of them a value: ${e.path[0]} has no base value` });
        }
        if (stack.length && e.path.includes(stack[stack.length - 1])) throw e;   // keep unwinding inside the cycle
        throw new UpstreamError(e.path[0]);
      }
      if (e instanceof UpstreamError) { if (stack.length) throw e; return undefined; }
      const text = typeof win.value === 'string' ? win.value : win.value instanceof Expr ? win.value.text : null;
      if (e instanceof DimensionError) {
        diagnostics.push({ level: 'error', kind: 'units.dimension', at: `params.${name}`, message: e.message.startsWith("'") || !text ? e.message : `'${text}': ${e.message}`, column: e.column ?? null });
      } else if (e instanceof ExprError) {
        diagnostics.push({ level: 'error', kind: e.kind === 'param.unknown' ? 'param.unknown' : 'expr.syntax', at: `params.${name}`, message: e.message, column: e.column,
          fix: e.kind === 'param.unknown' ? `define it in .params({ … }) or check the spelling` : undefined });
      } else {
        diagnostics.push({ level: 'error', kind: 'param.error', at: `params.${name}`, message: e.message });
      }
      if (stack.length) throw new UpstreamError(name);
      return undefined;
    }
  };

  for (const name of declOrder) {
    if (!state.has(name)) { try { get(name, []); } catch (e) { if (!(e instanceof UpstreamError) && !(e instanceof ParamCycleError)) throw e; } }
  }

  // provenance: via, levels, exposed metadata
  const level = {};
  const lev = n => {
    if (level[n] != null) return level[n];
    const i = info[n];
    level[n] = 0;
    if (i) level[n] = i.deps.length ? 1 + Math.max(...i.deps.map(d => (info[d] ? lev(d) : 0))) : 0;
    return level[n];
  };
  for (const n of Object.keys(info)) {
    const i = info[n];
    i.level = lev(n);
    for (const d of i.deps) if (info[d] && info[d].src !== 'params' && info[d].src !== 'default') i.via[d] = info[d].src;
    if (exposed[n]) i.exposed = exposedInfo(exposed[n], i.value);
  }
  const order = declOrder.filter(n => info[n]).sort((a, b) => level[a] - level[b] || declOrder.indexOf(a) - declOrder.indexOf(b));
  const levels = [];
  for (const n of order) (levels[level[n]] ??= []).push(n);
  const failed = declOrder.filter(n => state.get(n) === 'failed');
  return { values, info, order, levels, declOrder, failed, diagnostics, ctx: pctx, ok: !diagnostics.some(d => d.level === 'error') };
}

function evalValue(v, scope, pctx, rawCtx) {
  if (v instanceof Quantity) {
    const r = v.resolve(pctx.__isRaw ? pctx : { lw: pctx.lw, layer: pctx.layer, nozzle: pctx.nozzle, bboxDiag: pctx.bbox });
    return { value: r, exprText: null, raw: v.toString() };
  }
  if (typeof v === 'number' || typeof v === 'boolean') return { value: v, exprText: null };
  if (typeof v === 'string') {
    const out = evaluate(parseExpr(v), scope);
    return { value: out instanceof Quantity ? out.resolve({ lw: pctx.lw, layer: pctx.layer, nozzle: pctx.nozzle, bboxDiag: pctx.bbox }) : out, exprText: v };
  }
  if (v instanceof Expr) return { value: v.evaluate(scope), exprText: v.text };
  if (v instanceof Literal) return { value: v.value, exprText: null };
  if (typeof v === 'function') {
    const p = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? scope(k) : undefined) });
    const c = { ...rawCtx, p, lw: mm(pctx.lw), layer: mm(pctx.layer), nozzle: mm(pctx.nozzle), bboxDiag: mm(pctx.bbox) };
    const out = v(c);
    if (typeof out === 'string') return { value: evaluate(parseExpr(out), scope), exprText: out };
    return { value: out instanceof Quantity ? out.resolve({ lw: pctx.lw, layer: pctx.layer, nozzle: pctx.nozzle, bboxDiag: pctx.bbox }) : out, exprText: null, raw: 'ƒ(ctx)' };
  }
  return { value: v, exprText: null };
}

function displayNumber(v) {
  if (v instanceof Quantity) {
    const k = dimsKind(v);
    if (k === 'length') return { value: v.value, unit: 'mm' };
    if (k === 'angle') return { value: v.value * 180 / Math.PI, unit: 'deg' };
    return { value: v.displayValue(), unit: prettyUnit(v.u) };
  }
  if (typeof v === 'number') return { value: v, unit: '' };
  return { value: v, unit: null };
}
function exposedInfo(meta, value) {
  const kind = typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'number') : dimsKind(value);
  const range = meta.range ? meta.range.map(x => displayNumber(x instanceof Quantity ? x : typeof x === 'number' && kind === 'length' ? mm(x) : x).value) : null;
  return { label: meta.label, range, step: meta.step != null ? displayNumber(meta.step).value : null, kind };
}

// ProgramData `params` rows
export function paramRows(res) {
  const rows = [];
  for (const name of res.declOrder) {
    const i = res.info[name];
    if (!i) { rows.push({ name, value: null, unit: null, text: 'error', expr: null, src: null, deps: [], exposed: null, error: true }); continue; }
    const d = displayNumber(i.value);
    rows.push({
      name, value: d.value, unit: d.unit, text: i.text, expr: i.expr, src: i.src, deps: i.deps, exposed: i.exposed,
      canonical: i.value instanceof Quantity ? i.value.value : typeof i.value === 'number' ? i.value : null,
      kind: i.kind, raw: i.raw, shadowed: i.shadowed.map(s => ({ src: s.src, value: s.value })), via: i.via, level: i.level,
    });
  }
  return rows;
}

// 'inner_w = w − 2·wall = 120 mm − 2·2 mm = 116 mm; w from configs.tray-3 (table row 2), wall from override'
export function explainParam(name, res) {
  const i = res.info[name];
  if (!i) {
    const d = res.diagnostics.find(x => x.at === `params.${name}`);
    return d ? `${name}: ${d.message}` : `${name} is not a parameter`;
  }
  let s = `${name} = `;
  if (i.expr) {
    const sub = printExpr(i.expr, n => (res.info[n] ? showValue(res.info[n].value) : undefined));
    s += `${printExpr(i.expr)} = ${sub} = ${showValue(i.value)}`;
  } else s += i.raw !== i.text ? `${i.raw} = ${i.text}` : i.text;
  const from = [];
  if (i.src !== 'params') from.push(`from ${i.src}`);
  for (const d of i.deps) if (res.info[d] && res.info[d].src !== 'params') from.push(`${d} from ${res.info[d].src}`);
  return from.length ? `${s}; ${from.join(', ')}` : s;
}

// A param record as prog.param(name) returns it.
export function paramInfo(name, res) {
  const i = res.info[name];
  if (!i) return null;
  const out = { value: i.value, expr: i.expr, src: i.src, deps: i.deps };
  if (i.shadowed.length) out.shadowed = i.shadowed.map(s => ({ src: s.src, value: s.value }));
  if (Object.keys(i.via).length) out.via = i.via;
  return out;
}
