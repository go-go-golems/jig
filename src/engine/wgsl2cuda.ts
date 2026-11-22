// wgsl2cuda.ts — translate Candela's WGSL program (the kernel plus the code generated for a scene, `compiled.shared`)
// into CUDA C++ (CANDELA-002 design doc 02, §5.6). It relies on the same strict subset wgsl2glsl.ts relies on: typed
// declarations, `fn name(a: T) -> R {`, structs with one member per line, `select(f, t, c)`, `loop {}`, no pointers.
//
// The output has three parts, in this order:
//   1. module constants (`const PI: f32 = …`) as `constexpr`, struct definitions, read-only private tables
//      (`var<private> ETAB: array<f32, 256> = …`) as `__constant__` arrays;
//   2. `struct Kernel { … }`: every other `var<private>` becomes a data member (one Kernel object per thread, so the
//      WGSL per-invocation globals stay per thread) and every `fn` becomes a `__device__` member function, so calls
//      between functions need no forward declarations;
//   3. nothing else: the entry point, the storage accessors (`U`, `objF`, …) and, for OptiX, the replacement for
//      `traceAll`, are supplied by the caller through `kernelPrelude` / `omit` (native/rt/kernels/).
//
// WGSL's types and built-ins keep their names; native/rt/kernels/candela_wgsl.h defines them in namespace `wgsl`.
// Three WGSL rules need explicit handling:
//   - variables declared without an initializer are zero-initialised (`T x{};`);
//   - abstract float literals become f32 (`1.0` → `1.0f`) so no arithmetic is silently done in double precision;
//   - WGSL evaluates operands and arguments left to right and `select` evaluates all three arguments, while C++ leaves
//     argument order unspecified and `?:` evaluates one branch. Calls to functions with side effects (those that write
//     per-thread state such as the random generator's `rngS`, directly or through other calls) are therefore hoisted
//     into temporaries in WGSL order whenever a statement holds two of them or one inside a `select`
//     (`sampleLobe(L, wo, rnd2(), rnd())` → `const auto _s1 = rnd2(); const auto _s2 = rnd(); … sampleLobe(L, wo, _s1, _s2)`).

export interface CudaTranslation {
  /** namespace-scope part: constants, structs, constant tables */
  head: string;
  /** the members of `struct Kernel`: private variables and functions */
  members: string;
  /** names of the translated functions, in source order */
  functions: string[];
  structs: string[];
  /** functions present in the WGSL but left out because the caller provides them */
  omitted: string[];
  /** functions with side effects, whose calls are sequenced */
  impure: string[];
}

const SCALAR: Record<string, string> = { f32: 'f32', i32: 'i32', u32: 'u32', bool: 'bool' };
/** a WGSL type in declaration position → C++ type (WGSL short names are typedefs in candela_wgsl.h) */
function cty(t: string): string {
  t = t.trim();
  if (SCALAR[t]) return SCALAR[t];
  let m = t.match(/^vec([234])<(f32|i32|u32)>$/);
  if (m) return `vec${m[1]}${m[2][0]}`;
  m = t.match(/^vec([234])([fiu])$/);
  if (m) return t;
  return t;
}
/** `array<T, N>` → [T, N] */
function arrayType(t: string): [string, string] | null { const m = t.trim().match(/^array<\s*([\w<>]+)\s*,\s*(\d+)\s*>$/); return m ? [cty(m[1]), m[2]] : null; }

function matchParen(s: string, i: number) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (!d) return k; } } return -1; }
function splitArgs(s: string) { const out: string[] = []; let d = 0, a = 0; for (let k = 0; k < s.length; k++) { const c = s[k]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && !d) { out.push(s.slice(a, k)); a = k + 1; } } out.push(s.slice(a)); return out; }

/** select(f, t, c) → ((c) ? (t) : (f)), innermost first */
function selects(s: string): string {
  let i: number;
  while ((i = s.search(/\bselect\(/)) >= 0) {
    const open = s.indexOf('(', i), close = matchParen(s, open);
    if (close < 0) throw new Error('wgsl2cuda: unbalanced select: ' + s.trim().slice(0, 120));
    const args = splitArgs(s.slice(open + 1, close));
    if (args.length !== 3) throw new Error('wgsl2cuda: select needs 3 arguments: ' + s.slice(i, close + 1));
    const [f, t, c] = args.map(a => selects(a).trim());
    s = s.slice(0, i) + `((${c}) ? (${t}) : (${f}))` + s.slice(close + 1);
  }
  return s;
}
/** array<T, N>(a, b, …) → {a, b, …} (only in initialiser position) */
function arrayCtor(s: string): string {
  let i: number;
  while ((i = s.search(/\barray<[^>]+>\(/)) >= 0) {
    const open = s.indexOf('(', i), close = matchParen(s, open);
    if (close < 0) throw new Error('wgsl2cuda: unbalanced array constructor');
    s = s.slice(0, i) + '{' + s.slice(open + 1, close) + '}' + s.slice(close + 1);
  }
  return s;
}

// literals: abstract floats → f32; `1i` → `1`; leave hex and identifiers alone
const FLOAT_LIT = /(?<![\w.])(\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)(?![\w.])/g;
function literals(s: string): string {
  return s.replace(FLOAT_LIT, '$1f').replace(/(?<![\w.])(\d+)i\b/g, '$1');
}
// v.xyz → v.xyz() (two to four components; single components are struct members in the header)
const SWIZZLE = /\.([xyzw]{2,4})\b(?!\s*\()/g;

/** functions with side effects: they assign a private variable, or call a function that does (fixpoint) */
export function impureFunctions(src: string): Set<string> {
  const privates = [...src.matchAll(/^var<private>\s+(\w+)/gm)].map(m => m[1]);
  const bodies = new Map<string, string>();
  let cur = '', depth = 0, body: string[] = [];
  for (const L of src.split('\n')) {
    const m = depth === 0 ? L.match(/^fn\s+(\w+)/) : null;
    if (m) { cur = m[1]; body = []; }
    if (cur) body.push(L);
    for (const ch of L.replace(/\/\/.*$/, '')) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (cur && depth === 0) { bodies.set(cur, body.join('\n').replace(/^fn[^{]*{/, '').replace(/\/\/.*$/gm, '')); cur = ''; }
  }
  const impure = new Set<string>();
  for (const [n, b] of bodies) if (privates.some(p => new RegExp(`\\b${p}\\s*(\\[[^\\]]*\\]\\s*)?(\\.\\w+\\s*)?([-+*/|&^]?=)(?!=)`).test(b))) impure.add(n);
  for (let grew = true; grew;) {
    grew = false;
    for (const [n, b] of bodies) if (!impure.has(n) && [...impure].some(f => new RegExp(`\\b${f}\\s*\\(`).test(b))) { impure.add(n); grew = true; }
  }
  return impure;
}

let seqCounter = 0;
/** hoist calls to impure functions out of one statement, in WGSL evaluation order (arguments left to right, inner
 *  calls before the call that uses them). Returns the declarations to put before the statement and the rewritten
 *  statement. Only applied when the order could differ in C++: two impure calls, or one inside a select. */
function sequence(st: string, impure: Set<string>): [string, string] {
  if (!impure.size) return ['', st];
  const re = new RegExp(`\\b(${[...impure].join('|')})\\s*\\(`, 'g');
  const calls = [...st.matchAll(re)];
  if (!calls.length || (calls.length < 2 && !/\bselect\s*\(/.test(st))) return ['', st];
  if (/^\s*(}\s*)?else\b/.test(st) || /^\s*(for|while)\b/.test(st) || /&&|\|\|/.test(st))
    throw new Error('wgsl2cuda: cannot sequence side effects in: ' + st.trim().slice(0, 140));
  const decls: string[] = [];
  const walk = (e: string): string => {
    let out = '', i = 0;
    for (;;) {
      re.lastIndex = i;
      const m = re.exec(e);
      if (!m) return out + e.slice(i);
      const open = e.indexOf('(', m.index + m[1].length), close = matchParen(e, open);
      if (close < 0) throw new Error('wgsl2cuda: unbalanced call in: ' + e.trim().slice(0, 120));
      const args = walk(e.slice(open + 1, close));
      const t = `_s${++seqCounter}`;
      decls.push(`const auto ${t} = ${m[1]}(${args}); `);
      out += e.slice(i, m.index) + t;
      i = close + 1;
    }
  };
  const rewritten = walk(st);
  return [decls.join(''), rewritten];
}

/** split a line's code into statements at top-level `;`, `{` and `}`, sequencing each */
function sequenceLine(code: string, impure: Set<string>): string {
  if (!impure.size) return code;
  let out = '', start = 0, depth = 0;
  const flush = (end: number) => {
    const seg = code.slice(start, end);
    const lead = seg.match(/^\s*/)![0];
    const [decls, st] = sequence(seg.slice(lead.length), impure);
    out += lead + decls + st;
  };
  for (let k = 0; k < code.length; k++) {
    const c = code[k];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (c === ';' || c === '{' || c === '}')) { flush(k); out += c; start = k + 1; }
  }
  flush(code.length);
  return out;
}

/** translate one statement-level line inside a function body */
function stmt(L: string, impure: Set<string> = new Set()): string {
  // a comment-only line passes through unchanged
  if (/^\s*\/\//.test(L)) return L;
  let code = L, comment = '';
  const ci = L.indexOf('//');
  if (ci >= 0) { code = L.slice(0, ci); comment = L.slice(ci); }
  if (!/^\s*for\s*\(/.test(code)) code = sequenceLine(code, impure);
  // declarations (several may share a line: `let a: f32 = …; let b: f32 = …;`)
  code = code.replace(/\b(let|var)\s+(\w+)\s*:\s*(array<[^>]+>)\s*=\s*/g, (_, kw, n, t) => { const [et, k] = arrayType(t)!; return `${kw === 'let' ? 'const ' : ''}${et} ${n}[${k}] = `; });
  code = code.replace(/\bvar\s+(\w+)\s*:\s*(array<[^>]+>)\s*;/g, (_, n, t) => { const [et, k] = arrayType(t)!; return `${et} ${n}[${k}] = {};`; });
  code = code.replace(/\bconst\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `constexpr ${cty(t)} ${n} =`);
  code = code.replace(/\blet\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `const ${cty(t)} ${n} =`);
  code = code.replace(/\bvar\s+(\w+)\s*:\s*([\w<>]+)\s*=/g, (_, n, t) => `${cty(t)} ${n} =`);
  code = code.replace(/\bvar\s+(\w+)\s*:\s*([\w<>]+)\s*;/g, (_, n, t) => `${cty(t)} ${n}{};`);
  if (/\b(let|var)\s+\w+\s*=/.test(code)) throw new Error('wgsl2cuda: untyped declaration: ' + code.trim().slice(0, 120));
  code = code.replace(/\bloop\s*{/g, 'for (;;) {');
  if (/\b(continuing|switch|while|ptr<|override|alias)\b/.test(code)) throw new Error('wgsl2cuda: unsupported construct: ' + code.trim().slice(0, 120));
  code = code.replace(/\bbitcast<(u32|f32|i32)>\(/g, 'bitcast_$1(');
  code = code.replace(/\bvec([234])<(f32|i32|u32)>/g, (_, n, t) => `vec${n}${t[0]}`);
  code = arrayCtor(code);
  if (/\bselect\(/.test(code)) code = selects(code);
  code = code.replace(SWIZZLE, '.$1()');
  code = literals(code);
  return code + comment;
}

export function wgslToCuda(src: string, o: { omit?: string[] } = {}): CudaTranslation {
  const omit = new Set(o.omit || []);
  const lines = src.split('\n');
  const impure = impureFunctions(src);
  seqCounter = 0;
  const head: string[] = [], members: string[] = [];
  const functions: string[] = [], structs: string[] = [], omitted: string[] = [];
  // private arrays that are never assigned element-wise become __constant__ tables
  const written = (name: string) => new RegExp(`\\b${name}\\s*\\[[^\\]]*\\]\\s*=[^=]`).test(src);
  let i = 0;
  let pendingComments: string[] = [];
  while (i < lines.length) {
    const L = lines[i];
    if (/^\s*$/.test(L)) { pendingComments = []; i++; continue; }
    if (/^\s*\/\//.test(L)) { pendingComments.push(L); i++; continue; }
    // module constant
    let m = L.match(/^const\s+(\w+)\s*:\s*([\w<>]+)\s*=\s*(.*);\s*(\/\/.*)?$/);
    if (m) { head.push(`constexpr ${cty(m[2])} ${m[1]} = ${literals(m[3])};${m[4] ? ' ' + m[4] : ''}`); pendingComments = []; i++; continue; }
    // private variable
    m = L.match(/^var<private>\s+(\w+)\s*:\s*(array<[^>]+>|[\w<>]+)\s*=\s*(.*);\s*(\/\/.*)?$/);
    if (m) {
      const at = arrayType(m[2]);
      if (at) {
        const init = literals(arrayCtor(m[3]));
        if (written(m[1])) members.push(`  ${at[0]} ${m[1]}[${at[1]}] = ${init};`);
        else head.push(`__constant__ ${at[0]} ${m[1]}[${at[1]}] = ${init};`);
      } else members.push(`  ${cty(m[2])} ${m[1]} = ${literals(selects(m[3]))};`);
      pendingComments = []; i++; continue;
    }
    // struct
    m = L.match(/^struct\s+(\w+)\s*{\s*$/);
    if (m) {
      structs.push(m[1]);
      head.push(...pendingComments, `struct ${m[1]} {`); pendingComments = [];
      i++;
      for (; i < lines.length && !/^\s*}\s*;?\s*$/.test(lines[i]); i++) {
        const f = lines[i].match(/^(\s*)(\w+)\s*:\s*(array<[^>]+>|[\w<>]+)\s*,?\s*(\/\/.*)?$/);
        if (!f) { if (/^\s*(\/\/.*)?$/.test(lines[i])) { head.push(lines[i]); continue; } throw new Error('wgsl2cuda: struct member: ' + lines[i]); }
        const at = arrayType(f[3]);
        head.push(at ? `${f[1]}${at[0]} ${f[2]}[${at[1]}];` : `${f[1]}${cty(f[3])} ${f[2]};${f[4] ? ' ' + f[4] : ''}`);
      }
      head.push('};');
      i++; continue;
    }
    // function: header line, then lines until the braces balance
    m = L.match(/^fn\s+(\w+)\s*\((.*?)\)\s*(?:->\s*([\w<>]+)\s*)?{(.*)$/);
    if (m) {
      const name = m[1];
      let depth = 0; const body: string[] = [];
      const count = (s: string) => { const c = s.replace(/\/\/.*$/, ''); for (const ch of c) { if (ch === '{') depth++; else if (ch === '}') depth--; } };
      count(L);
      const params = m[2].trim() ? splitArgs(m[2]).map(p => { const k = p.trim().match(/^(\w+)\s*:\s*(.+)$/); if (!k) throw new Error('wgsl2cuda: parameter ' + p); return `${cty(k[2])} ${k[1]}`; }).join(', ') : '';
      body.push(`  __device__ ${m[3] ? cty(m[3]) : 'void'} ${name}(${params}) {${stmt(m[4], impure)}`);
      i++;
      while (depth > 0 && i < lines.length) { count(lines[i]); body.push('  ' + stmt(lines[i], impure)); i++; }
      if (omit.has(name)) { omitted.push(name); pendingComments = []; continue; }
      functions.push(name);
      members.push(...pendingComments.map(c => '  ' + c), ...body); pendingComments = [];
      continue;
    }
    throw new Error(`wgsl2cuda: unexpected top-level line ${i + 1}: ${L.slice(0, 120)}`);
  }
  return { head: head.join('\n'), members: members.join('\n'), functions, structs, omitted, impure: [...impure] };
}

/** a complete CUDA translation unit: the header, the translation inside namespace wgsl, and the caller's parts */
export function cudaSource(shared: string, o: { omit?: string[]; prelude: string; kernelPrelude: string; epilogue: string; header?: string }): { source: string; translation: CudaTranslation } {
  const tr = wgslToCuda(shared, { omit: o.omit });
  const source = [
    '// generated by src/engine/wgsl2cuda.ts from the scene\'s WGSL program; do not edit',
    `#include "${o.header || 'candela_wgsl.h'}"`,
    o.prelude,
    'namespace wgsl {',
    tr.head,
    'struct Kernel {',
    o.kernelPrelude,
    tr.members,
    '};',
    '}  // namespace wgsl',
    o.epilogue,
    '',
  ].join('\n');
  return { source, translation: tr };
}
