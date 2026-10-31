// yaml(): any value → the compact, deterministic YAML text the model reads (never JSON).
// Limits (guides/agent/the-eval-tool.md, "The result format"): numbers to 5 decimals, 64 numbers on one line,
// 60 list items, 80 keys, 5 levels. Typed arrays are summarised as `Float32Array(3600)`.

export const LIMITS = { decimals: 5, numbers: 64, items: 60, keys: 80, depth: 5, plain: 120 };

// Plain (bare) strings: letters, digits, spaces and . , : / ( ) + - · × → %, plus the characters of
// persistent names and units (_ [ ] ∩ ² ³ ° µ ∖). Anything that would read as another type is quoted.
const PLAIN = /^[\p{L}\p{N} _.,:/()+\-·×→%[\]∩∖²³°µ']+$/u;
const LOOKS_TYPED = /^(?:[-+]?(?:\d[\d_]*)?\.?\d+(?:e[-+]?\d+)?|true|false|null|undefined|yes|no|on|off|~|NaN|[-+]?Infinity)$/i;

export function num(n) {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  const r = +n.toFixed(LIMITS.decimals);
  return String(Object.is(r, -0) ? 0 : r);
}

export function str(s) {
  if (s === '') return '""';
  if (s.length < LIMITS.plain && PLAIN.test(s) && !LOOKS_TYPED.test(s) && !/^[-[\]' ]|[ :]$|: | #/.test(s)) return s;
  return JSON.stringify(s);
}

const key = k => {
  k = String(k);
  return k !== '' && k.length < LIMITS.plain && /^[\p{L}\p{N}_$.\-/[\]∩# ]+$/u.test(k) && !/^[-[ #]|[ ]$/.test(k) ? k : JSON.stringify(k);
};

const isTyped = v => ArrayBuffer.isView(v) && !(v instanceof DataView);
const isPlainObject = v => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const fnName = f => `[function${f.name ? ' ' + f.name : ''}]`;

// A scalar or summary that fits on one line, or null when the value needs a block.
function scalar(v, o) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'number') return num(v);
  if (t === 'boolean') return String(v);
  if (t === 'bigint') return String(v);
  if (t === 'symbol') return str(String(v));
  if (t === 'function') return fnName(v);
  if (t === 'string') return v.includes('\n') ? null : str(v);
  if (o.named && o.named.has(v)) return o.named.get(v);
  if (isTyped(v)) return `${v.constructor.name}(${v.length})`;
  if (v instanceof ArrayBuffer) return `ArrayBuffer(${v.byteLength} bytes)`;
  if (v instanceof Date) return Number.isNaN(+v) ? 'Invalid Date' : v.toISOString();
  if (v instanceof RegExp) return str(String(v));
  if (v instanceof Error) return str(`${v.name}: ${v.message}`);
  if (v instanceof Promise) return '[Promise]';
  if (v instanceof WeakMap || v instanceof WeakSet) return `[${v.constructor.name}]`;
  // a runtime handle (class instance, not plain data) with kind and id: `kind id`
  if (!Array.isArray(v) && !(v instanceof Map) && !(v instanceof Set) && !isPlainObject(v) && v.kind != null && v.id != null)
    return `${v.kind} ${v.id}`;
  return null;
}

const entriesOf = v => v instanceof Map ? [...v.entries()] : Object.keys(v).map(k => [k, v[k]]);
const listOf = v => v instanceof Set ? [...v] : v;

function numberLine(a) {
  const shown = a.slice(0, LIMITS.numbers).map(num).join(', ');
  return a.length > LIMITS.numbers ? `[${shown}, … ${a.length} items]` : `[${shown}]`;
}

// Block YAML. Returns lines (without the leading indent of the first line's context).
function block(v, depth, o, seen) {
  const s = scalar(v, o);
  if (s !== null) return [s];
  if (typeof v === 'string') return ['|', ...v.split('\n').map(l => '  ' + l)];
  if (seen.includes(v)) return ['[circular]'];
  const isList = Array.isArray(v) || v instanceof Set;
  if (isList) {
    const a = listOf(v);
    if (a.length === 0) return ['[]'];
    if (a.every(x => typeof x === 'number')) return [numberLine(a)];
    if (depth >= LIMITS.depth) return [`[array ${a.length}]`];
    const out = [];
    const next = [...seen, v];
    for (const item of a.slice(0, LIMITS.items)) {
      const lines = block(item, depth + 1, o, next);
      if (isMultiline(item, lines)) {
        out.push('- ' + lines[0]);
        for (const l of lines.slice(1)) out.push('  ' + l);
      } else out.push('- ' + lines[0]);
    }
    if (a.length > LIMITS.items) out.push(`# … ${a.length - LIMITS.items} more`);
    return out;
  }
  const ents = entriesOf(v);
  if (ents.length === 0) return ['{}'];
  if (depth >= LIMITS.depth) return ['{…}'];
  const out = [];
  const next = [...seen, v];
  for (const [k, x] of ents.slice(0, LIMITS.keys)) {
    const lines = block(x, depth + 1, o, next);
    if (lines[0] === '|') { out.push(`${key(k)}: |`); for (const l of lines.slice(1)) out.push(l); continue; }
    if (lines.length === 1 && isFlat(x, lines[0])) { out.push(`${key(k)}: ${lines[0]}`); continue; }
    out.push(`${key(k)}:`);
    for (const l of lines) out.push('  ' + l);
  }
  if (ents.length > LIMITS.keys) out.push(`# … ${ents.length - LIMITS.keys} more keys`);
  return out;
}

// A list item whose block is an object or list continues on following lines, indented under the dash.
function isMultiline(item, lines) { return lines.length > 1; }
// A one-line block that can follow `key: ` on the same line: a scalar or summary, a flow list of numbers, [] or {},
// a depth cut or [circular]. A one-key object or a one-item list goes on the next line.
function isFlat(x, line) {
  if (x === null || typeof x !== 'object') return true;
  return /^(\[.*\]|\{\}|\{…\})$/.test(line) || !/^(- |[^\s"]+: |"[^"]*": )/.test(line);
}

/** The whole value as YAML text. A top-level string is returned as it is. */
export function yaml(v, opts = {}) {
  if (typeof v === 'string') return v;
  const o = { named: opts.named || null };
  return block(v, 0, o, []).join('\n');
}

/** One line of flow YAML, for console.log arguments. */
export function yamlInline(v, opts = {}, depth = 0, seen = []) {
  const o = { named: opts.named || null };
  if (typeof v === 'string') return v.includes('\n') ? JSON.stringify(v) : str(v);
  const s = scalar(v, o);
  if (s !== null) return s;
  if (seen.includes(v)) return '[circular]';
  const next = [...seen, v];
  if (Array.isArray(v) || v instanceof Set) {
    const a = listOf(v);
    if (a.every(x => typeof x === 'number')) return numberLine(a);
    if (depth >= LIMITS.depth) return `[array ${a.length}]`;
    const items = a.slice(0, LIMITS.items).map(x => yamlInline(x, opts, depth + 1, next));
    if (a.length > LIMITS.items) items.push(`… ${a.length - LIMITS.items} more`);
    return `[${items.join(', ')}]`;
  }
  const ents = entriesOf(v);
  if (ents.length === 0) return '{}';
  if (depth >= LIMITS.depth) return '{…}';
  const parts = ents.slice(0, LIMITS.keys).map(([k, x]) => `${key(k)}: ${yamlInline(x, opts, depth + 1, next)}`);
  if (ents.length > LIMITS.keys) parts.push(`… ${ents.length - LIMITS.keys} more keys`);
  return `{ ${parts.join(', ')} }`;
}
