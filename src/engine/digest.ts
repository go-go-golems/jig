// digest.ts — stable hashes of what the compiler produces: the generated shader source and every buffer `pack`
// writes, at chosen times. Two uses (CANDELA-002 design doc 02):
//   - golden tests for the engine split (phase 1): the refactored targets must reproduce today's bytes;
//   - cross-engine checks (phase 0): the same bundle in Node and in V8 embedded in candela-rt must agree.
// Plain JavaScript only (no crypto, no Node APIs), so it runs unchanged in any V8.
import { build } from './candela';

/** a 64-bit hash (two independent 32-bit lanes, murmur3-style mixing) of an ArrayBuffer view, as 16 hex digits */
export function digestBytes(v: ArrayBufferView): string {
  const n = v.byteLength, words = n >>> 2;
  const u32 = new Uint32Array(v.buffer, v.byteOffset, words);
  let h1 = 0x9747b28c ^ n, h2 = 0x85ebca6b ^ n;
  for (let i = 0; i < words; i++) {
    let k = Math.imul(u32[i], 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
    h1 ^= k; h1 = (h1 << 13) | (h1 >>> 19); h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
    h2 = Math.imul(h2 ^ u32[i], 0x01000193);
  }
  // tail bytes (byteLength not a multiple of 4)
  const tail = new Uint8Array(v.buffer, v.byteOffset + words * 4, n & 3);
  for (let i = 0; i < tail.length; i++) { h1 = Math.imul(h1 ^ tail[i], 0x01000193); h2 = Math.imul(h2 ^ tail[i], 0x5bd1e995); }
  const fmix = (h: number) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  return fmix(h1).toString(16).padStart(8, '0') + fmix(h2).toString(16).padStart(8, '0');
}

export function digestString(s: string): string {
  const u16 = new Uint16Array(s.length);
  for (let i = 0; i < s.length; i++) u16[i] = s.charCodeAt(i);
  return digestBytes(u16);
}

/** the `env` the viewport passes to `pack` at time t (Viewport.repack, src/engine/viewport.ts): poses from the scene's
 *  animation, the seed, and motion-blur samples across the shutter when the camera asks for them */
export function packEnv(compiled: any, animation: ((t: number) => any) | null, time: number, seed = 0): Record<string, any> {
  const poses = (t: number) => (animation ? animation(t) : null);
  const env: Record<string, any> = { time, overrides: null, poses: poses(time), seed };
  const mb = compiled.motionBlur;
  if (mb && mb.interval > 0 && mb.steps >= 2) {
    const K = mb.steps;
    env.motion = { samples: Array.from({ length: K }, (_, k) => { const tk = time + (k / (K - 1) - 0.5) * mb.interval; return { time: tk, poses: poses(tk) }; }) };
  }
  return env;
}

/** hashes of everything `pack` returns at one moment, with the viewport's env */
export function packDigest(compiled: any, animation: ((t: number) => any) | null, time: number): Record<string, string> {
  const P = compiled.pack(packEnv(compiled, animation, time));
  const out: Record<string, string> = {};
  for (const k of ['U', 'O', 'LI', 'BV', 'SDs', 'SDd']) out[k] = digestBytes(P[k]);
  out.meta = digestString(JSON.stringify({ dynBase: P.dynBase, nObjs: P.nObjs, order: P.order, sunDir: P.sunDir, sunElev: P.sunElev, envType: P.envType, moving: P.moving, mats: P.mats }));
  return out;
}

export interface PresetDigest {
  id: string;
  ok: boolean;
  error?: string;
  shared?: string;            // hash of compiled.shared (the generated WGSL)
  lines?: number;
  nU?: number;
  frames?: { t: number; d: Record<string, string> }[];
  buildMs?: number;
  frameMs?: number;           // mean animation(t) + pack over `reps` calls
}

/** build one preset's files, then digest its program and its packed buffers at each time */
export async function digestPreset(id: string, files: Record<string, string>, times: number[], reps = 10): Promise<PresetDigest> {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  let r: any;
  try { r = await build(files); } catch (e: any) { return { id, ok: false, error: String((e && e.message) || e) }; }
  const buildMs = now() - t0;
  if (!r.ok) return { id, ok: false, error: r.error ? String(r.error.message || r.error) : 'build failed', buildMs };
  const c = r.compiled, anim = r.animation || null;
  const frames = times.map(t => ({ t, d: packDigest(c, anim, t) }));
  const t1 = now();
  for (let i = 0; i < reps; i++) c.pack(packEnv(c, anim, i / 24));
  const frameMs = (now() - t1) / reps;
  return { id, ok: true, shared: digestString(c.shared), lines: c.stats.lines, nU: c.nU, frames, buildMs, frameMs };
}
