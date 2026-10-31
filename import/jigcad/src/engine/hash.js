// Content hashing for cache keys and model hashes: canonical serialisation + a 64-bit FNV-1a style hash.
import { isQuantity } from './units.js';

export function hashStr(str) {
  // two 32-bit lanes (FNV-1a and a multiplicative variant) → 16 hex chars
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519) ^ (h2 >>> 13);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
}

// Canonical text of any builder value. onString(s) is called for every string (to collect expression deps).
export function canon(x, onString, seen = new WeakSet()) {
  const rec = v => canon(v, onString, seen);
  if (v0(x)) return JSON.stringify(x);
  if (typeof x === 'string') { onString?.(x); return JSON.stringify(x); }
  if (typeof x === 'function') return `fn:${hashStr(x.toString())}`;
  if (typeof x !== 'object') return String(x);
  if (seen.has(x)) return '<cycle>';
  seen.add(x);
  try {
    if (isQuantity(x)) return `q:${x.toString()}`;
    if (x instanceof Float64Array || x instanceof Float32Array) return `m:[${Array.from(x).map(n => +n.toFixed(9)).join(',')}]`;
    if (Array.isArray(x)) return `[${x.map(rec).join(',')}]`;
    if (typeof x.key === 'function' && x.constructor?.name === 'Frame') return `frame:${x.key()}`;
    if (x.constructor?.name === 'Transform' && x.m) return `tx:${Array.from(x.m).map(n => +n.toFixed(9)).join(',')}`;
    if (typeof x.toCanon === 'function') return x.toCanon(rec);
    const keys = Object.keys(x).filter(k => !k.startsWith('_') || k === '_cfg').sort();
    const name = x.constructor && x.constructor !== Object ? x.constructor.name : '';
    if (!keys.length && typeof x.toString === 'function' && x.toString !== Object.prototype.toString) return `${name}:${x.toString()}`;
    return `${name}{${keys.map(k => `${k}:${rec(x[k])}`).join(',')}}`;
  } finally { seen.delete(x); }
}
const v0 = x => x == null || typeof x === 'number' || typeof x === 'boolean';
export const hashValue = x => hashStr(canon(x));
