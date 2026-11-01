// Guard proxies (JIG-012 phase 2): a namespace that refuses a name it does not have.
//
// JavaScript answers `j.fit.hol` with undefined, and the mistake surfaces later and elsewhere, as
// "undefined is not a function" or a NaN in a metric. A guarded namespace throws at the read instead, with the
// name the code probably meant and the names the namespace has:
//
//   TypeError: j.fit.hol does not exist. Did you mean j.fit.hole? (j.fit has: clearance, hole, shaft, …)
//
// Only namespaces are guarded (plain objects, and functions that carry their own members, such as j.frame); the
// values they return (parts, quantities, sketches) are not. Names that tools and the language probe for — then
// (await), toJSON, Symbol.* and the like — pass through as undefined, so `await j.fit` and JSON.stringify keep
// working. `in`, Object.keys and spreading see the real namespace.
//
// The proxy's target is a shadow (an empty object or function), not the namespace itself: the namespaces may be
// frozen, and a proxy may not return a wrapped value for a frozen property of its own target.

export const GUARDED = Symbol.for('jig.guarded');

// names asked for by the language, the console, test tools and serializers: never an error
const PROBES = new Set([
  'then', 'catch', 'finally', 'toJSON', 'toString', 'valueOf', 'toLocaleString', 'constructor', 'prototype', '__proto__',
  'inspect', 'nodeType', 'tagName', '$$typeof', 'asymmetricMatch', '@@__IMMUTABLE_ITERABLE__@@', '@@__IMMUTABLE_RECORD__@@',
  'length', 'name', 'caller', 'arguments', 'kind', 'isPart', 'isAssembly', 'isPrintJob', 'isDesign', 'describe',
]);

/** Edit distance with transpositions (optimal string alignment); case differences count half. */
export function distance(a, b) {
  const A = a.toLowerCase(), B = b.toLowerCase();
  const d = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)]);
  for (let j = 1; j <= B.length; j++) d[0][j] = j;
  for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[A.length][B.length] + (a !== b && A === B ? 0.5 : 0);
}

/** The names among `names` closest to `name` (best first), or [] when none is close enough. */
export function closest(name, names, max = 3) {
  const n = String(name);
  const scored = [];
  for (const c of names) {
    if (c === n) continue;
    const lc = c.toLowerCase(), ln = n.toLowerCase();
    let s = distance(n, c);
    // a prefix or a containment ('faceCount' for 'faces', 'hole' for 'holes') is closer than its edit distance says
    if (lc.startsWith(ln) || ln.startsWith(lc)) s = Math.min(s, 1 + Math.abs(lc.length - ln.length) / 4);
    else if (ln.length >= 4 && (lc.includes(ln) || ln.includes(lc))) s = Math.min(s, 1.5 + Math.abs(lc.length - ln.length) / 4);
    const limit = Math.max(1, Math.min(3, Math.floor(Math.max(n.length, c.length) / 3)));
    if (s <= limit) scored.push([s, c]);
  }
  return scored.sort((x, y) => x[0] - y[0] || x[1].localeCompare(y[1])).slice(0, max).map(x => x[1]);
}

const isNamespace = v => {
  if (typeof v === 'function') return Object.keys(v).length > 0;
  if (!v || typeof v !== 'object' || Array.isArray(v) || ArrayBuffer.isView(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

const visible = real => {
  const out = new Set();
  for (const k of Object.keys(real)) out.add(k);
  if (typeof real === 'object') for (let o = Object.getPrototypeOf(real); o && o !== Object.prototype; o = Object.getPrototypeOf(o))
    for (const k of Object.getOwnPropertyNames(o)) if (k !== 'constructor') out.add(k);
  // functions and namespaces first, then the classes (Quantity, Sketch, …)
  const cls = k => /^[A-Z]/.test(k) ? 1 : 0;
  return [...out].filter(k => !k.startsWith('_')).sort((a, b) => cls(a) - cls(b) || a.localeCompare(b));
};

const listOf = (names, max = 14) => names.length > max ? `${names.slice(0, max).join(', ')}, … ${names.length - max} more` : names.join(', ');

/**
 * Guard a namespace (and, lazily, the namespaces inside it). path names it in messages ('j', 'files').
 * opts.elsewhere(name) → [paths] where the name exists elsewhere (the guard of j answers this for its own tree).
 * opts.hint(path, name) → extra text for the message, or ''.
 */
export function guard(real, path, opts = {}) {
  if (!isNamespace(real) || real[GUARDED]) return real;
  const cache = new Map();
  const shadow = typeof real === 'function' ? function () {} : Object.create(Object.getPrototypeOf(real));
  const proxy = new Proxy(shadow, {
    get(_, k) {
      if (k === GUARDED) return true;
      if (typeof k === 'symbol') return Reflect.get(real, k);
      if (k in real || PROBES.has(k)) {
        const v = Reflect.get(real, k, real);
        if (!isNamespace(v)) return v;
        if (!cache.has(k)) cache.set(k, guard(v, `${path}.${k}`, opts));
        return cache.get(k);
      }
      // a namespace may compute its members (a Proxy of its own): a defined answer is a member
      const v = Reflect.get(real, k, real);
      if (v !== undefined) return v;
      throw missing(real, path, k, opts);
    },
    set(_, k, v) { real[k] = v; return true; },
    has(_, k) { return k === GUARDED || k in real; },
    deleteProperty(_, k) { return delete real[k]; },
    ownKeys() {
      const keys = Reflect.ownKeys(real);
      for (const k of Reflect.ownKeys(shadow)) if (!keys.includes(k) && !Reflect.getOwnPropertyDescriptor(shadow, k).configurable) keys.push(k);
      return keys;
    },
    getOwnPropertyDescriptor(_, k) {
      const d = Reflect.getOwnPropertyDescriptor(real, k);
      if (!d) return Reflect.getOwnPropertyDescriptor(shadow, k);
      const sd = Reflect.getOwnPropertyDescriptor(shadow, k);
      if (sd && !sd.configurable) return sd;
      return { ...d, configurable: true };
    },
    getPrototypeOf() { return Object.getPrototypeOf(real); },
    apply(_, self, args) { return Reflect.apply(real, self, args); },
    construct(_, args, nt) { return Reflect.construct(real, args, nt === proxy ? real : nt); },
  });
  return proxy;
}

function missing(real, path, k, opts) {
  const names = visible(real);
  const near = closest(k, names);
  const also = opts.elsewhere?.(k) ?? [];
  let msg = `${path}.${k} does not exist.`;
  if (near.length) msg += ` Did you mean ${near.map(n => `${path}.${n}`).join(' or ')}?`;
  if (also.length) msg += ` ${k} is ${also.map(p => `${p}.${k}`).join(' and ')}.`;
  const h = opts.hint?.(path, k);
  if (h) msg += ` ${h}`;
  msg += ` (${path} has: ${listOf(names)})`;
  const e = new TypeError(msg);
  e.guard = { path, name: k, near, also };
  return e;
}

/** Where each name lives in a tree of namespaces: name → [paths of the namespaces that have it]. */
export function indexNames(root, path, depth = 3, out = new Map(), seen = new Set()) {
  if (!isNamespace(root) || seen.has(root) || depth < 0) return out;
  seen.add(root);
  for (const k of Object.keys(root)) {
    if (k.startsWith('_')) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(path);
    let v; try { v = root[k]; } catch { continue; }
    indexNames(v, `${path}.${k}`, depth - 1, out, seen);
  }
  return out;
}

/** Guard a tree whose root is `path`, with "it lives elsewhere" answers from its own index. */
export function guardTree(root, path, opts = {}) {
  let index = null;
  const elsewhere = name => {
    index ??= indexNames(root, path);
    return (index.get(name) ?? []).slice(0, 3);
  };
  return guard(root, path, { ...opts, elsewhere: n => [...(opts.elsewhere?.(n) ?? []), ...elsewhere(n)] });
}
