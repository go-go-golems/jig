// headless.ts — render a scene without a browser (CANDELA-002 phases 2–4). A HeadlessRender holds one scene packed at
// one time and hands out, frame by frame, the uniforms a renderer uploads before each launch, exactly as Viewport.frame
// does in the browser. Its buffers are the WebGPU target's storage buffers; the program is given both as WGSL (for the
// Node/Dawn reference, scripts/wgsl-render.ts) and as CUDA (for candela-rt).
import { SceneSession, frameUniforms } from './session';
import { cudaProgram, type CudaProgram, type CudaTargetKind, type CudaTargetChoice } from './targets/cuda';
import { WGSL_PRELUDE, WGSL_MAIN } from './wgsl-entry';
import { optixScene, type OptixScene } from './targets/optix';

export interface HeadlessOptions { width: number; height: number; time?: number; seed?: number; target?: CudaTargetChoice | null; /** false: render without the camera's motion blur (parity checks) */ motionBlur?: boolean }
export interface HeadlessRender {
  ok: true;
  width: number; height: number; time: number;
  wgsl: string;                       // prelude + scene program + main
  cuda: CudaProgram | null;
  /** the target the program is for ('auto' resolved) */
  target: CudaTargetKind | null;
  /** OptiX build inputs (target 'optix'); its O replaces the WebGPU one */
  optix: OptixScene | null;
  /** storage buffers (float4 rows): objects, lights, top-level BVH, scene data (static head + dynamic tail at dynBase) */
  O: Float32Array; LI: Float32Array; BV: Float32Array; SD: Float32Array;
  /** samples accumulated so far, and per launch */
  spp: number; sppPerFrame: number;
  /** the uniforms for the next launch; advances `spp` */
  frame(): Float32Array;
  session: SceneSession;
}
export type HeadlessResult = HeadlessRender | { ok: false; error: string };

/** 'auto' chooses OptiX above this many analytic objects (scenes without meshes) */
export const AUTO_OPTIX_MIN_OBJECTS = 64;

/** WebGPU rejects zero-sized storage buffers; every target gets at least one row */
const nonEmpty = (a: Float32Array) => (a.length ? a : new Float32Array(4));

export async function openRender(files: Record<string, string>, o: HeadlessOptions): Promise<HeadlessResult> {
  const s = new SceneSession({ seed: o.seed || 0 });
  const r = await s.build(files);
  if (!r.ok) return { ok: false, error: r.error ? String(r.error.message || r.error) : 'build failed' };
  const time = o.time || 0;
  if (o.motionBlur === false) s.motionOverride = null;
  s.seek(time, 0);
  const P = s.pack(time);
  const SD = new Float32Array(Math.max(4, P.dynBase * 4 + P.SDd.length));
  SD.set(P.SDs); SD.set(P.SDd, P.dynBase * 4);
  // 'auto': the RT cores pay off with triangle meshes (hardware intersection) or many objects; for a handful of
  // analytic objects the plain-CUDA target's inline BVH walk is faster (measured, CANDELA-002 diary step 16)
  const scene = o.target === 'optix' || o.target === 'auto' ? optixScene(s.compiled, P) : null;
  const target: CudaTargetKind | null = o.target === null ? null : o.target === 'auto' ? (scene!.meshes.length > 0 || scene!.aabbObjects.length > AUTO_OPTIX_MIN_OBJECTS ? 'optix' : 'cuda') : (o.target || 'cuda');
  const optix = target === 'optix' ? scene : null;
  const h: HeadlessRender = {
    ok: true, width: o.width, height: o.height, time,
    wgsl: WGSL_PRELUDE + s.compiled.shared + WGSL_MAIN,
    target,
    cuda: target === null ? null : cudaProgram(s.compiled, target),
    optix,
    O: nonEmpty(optix ? optix.O : P.O), LI: nonEmpty(P.LI), BV: nonEmpty(P.BV), SD,
    spp: 0, sppPerFrame: Math.max(1, (s.compiled.engine && s.compiled.engine.sppPerFrame) || 1),
    frame() {
      const U = P.U.slice();
      const { sppF } = frameUniforms(U, s.compiled, { width: h.width, height: h.height, spp: h.spp, time });
      h.spp += sppF;
      return U;
    },
    session: s,
  };
  return h;
}
