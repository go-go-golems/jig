// Loads OpenCascade (replicad_single build) once, in Node or in a browser worker.
// Node: reads vendor/occt/replicad_single.wasm. Browser: fetches ./occt/replicad_single.wasm.gz and
// decompresses it with DecompressionStream('gzip').
import initOC from '../../vendor/occt/replicad_single.js';

let ocPromise = null;
let oc = null;
export const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined' && typeof WorkerGlobalScope === 'undefined';

async function loadWasmBytes(opts = {}) {
  if (opts.wasmBinary) return opts.wasmBinary;
  if (isNode) {
    const fs = await import('node:fs');
    const url = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const candidates = [opts.wasmPath, path.join(here, '../../vendor/occt/replicad_single.wasm'), path.join(process.cwd(), 'vendor/occt/replicad_single.wasm')].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c);
    throw new Error('replicad_single.wasm not found');
  }
  const base = opts.base ?? (typeof self !== 'undefined' && self.location ? self.location.href : '');
  // The artifact host serves .wasm but not .gz, so the gzip bytes ship as replicad_single.gz.wasm (integrator).
  const res = await fetch(new URL(opts.wasmUrl ?? './occt/replicad_single.gz.wasm', base));
  if (!res.ok) throw new Error(`fetching OpenCascade failed: ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function loadOC(opts = {}) {
  if (!ocPromise) ocPromise = (async () => {
    const t0 = performance.now();
    const wasmBinary = await loadWasmBytes(opts);
    oc = await initOC({ wasmBinary });
    oc.__loadMs = performance.now() - t0;
    return oc;
  })();
  return ocPromise;
}

export function getOC() {
  if (!oc) throw new Error('OpenCascade is not loaded: call loadOC() first');
  return oc;
}
export const ocReady = () => !!oc;
