// Loads jig-compute (rust/jig-compute, compiled to wasm32-unknown-unknown) once, in Node or in the engine worker.
// The module has no imports; its exports are a plain C ABI (design doc JIG-001 §6.2).
// Node: the cargo build output, else dist/jig_compute.wasm. Worker: ./jig_compute.wasm next to worker.js.
// JIG_COMPUTE=js (Node env) or init option { compute: 'js' } keeps the engine on its JS implementations.
export const ABI_MAJOR = 1;
const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined' && typeof WorkerGlobalScope === 'undefined';

let X = null;                 // instance exports while Rust is active
let loading = null;
export const status = { active: false, reason: 'not loaded', ms: null, version: null, bytes: null };

async function wasmBytes(opts) {
  if (opts.computeBinary) return opts.computeBinary;
  if (isNode) {
    const fs = await import('node:fs'), url = await import('node:url'), path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const root = path.join(here, '../../..');
    const candidates = [opts.computePath, path.join(root, 'rust/jig-compute/target/wasm32-unknown-unknown/release/jig_compute.wasm'), path.join(root, 'dist/jig_compute.wasm')].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c);
    throw new Error('jig_compute.wasm not found (run cargo build --release --target wasm32-unknown-unknown in rust/jig-compute)');
  }
  const base = opts.base ?? (typeof self !== 'undefined' && self.location ? self.location.href : '');
  const res = await fetch(new URL(opts.computeUrl ?? './jig_compute.wasm', base));
  if (!res.ok) throw new Error(`fetching jig_compute.wasm failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function loadCompute(opts = {}) {
  const forced = opts.compute === 'js' || (isNode && process.env.JIG_COMPUTE === 'js');
  if (forced) { disable('JS forced (JIG_COMPUTE=js or compute: "js")'); return Promise.resolve(null); }
  if (!loading) loading = (async () => {
    const t0 = performance.now();
    try {
      const bytes = await wasmBytes(opts);
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const e = instance.exports;
      const v = e.jc_version();
      if (Math.floor(v / 1000) !== ABI_MAJOR) throw new Error(`jig-compute ABI ${v} does not match the bridge (major ${ABI_MAJOR})`);
      X = e;
      Object.assign(status, { active: true, reason: 'loaded', ms: performance.now() - t0, version: `${Math.floor(v / 1000)}.${v % 1000}`, bytes: bytes.byteLength });
      return X;
    } catch (err) {
      disable(err.message);
      throw err;
    }
  })();
  return loading;
}

/** The exports while Rust is active, else null. */
export const compute = () => X;
export function disable(reason) { X = null; status.active = false; status.reason = reason; }
/** A trap (RuntimeError) means the module state cannot be trusted: switch to JS for the rest of the session. */
export function onTrap(e) {
  if (e instanceof WebAssembly.RuntimeError) { disable(`trap: ${e.message}`); return true; }
  return false;
}

// ── marshalling: views are re-created after every call that may grow memory ──
export function put(X, arr, Ctor) {
  const n = arr.length, bytes = Math.max(8, n * Ctor.BYTES_PER_ELEMENT);
  const p = X.jc_alloc(bytes);
  if (n) new Ctor(X.memory.buffer, p, n).set(arr);
  return { p, bytes };
}
export const release = (X, ...blocks) => { for (const b of blocks) if (b) X.jc_free(b.p, b.bytes); };
/** Copy of the f64 result buffer (n values); throws the module's message when n < 0. */
export function result(X, n) {
  if (n < 0) throw new Error(errorText(X));
  return new Float64Array(X.memory.buffer, X.jc_result_ptr(), n).slice();
}
export function errorText(X) {
  const p = X.jc_error_ptr(), n = X.jc_error_len();
  return new TextDecoder().decode(new Uint8Array(X.memory.buffer, p, n)) || 'jig-compute error';
}
