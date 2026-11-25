// headless.ts — render a scene without a browser (CANDELA-002 phases 2–4). A HeadlessRender holds one scene and hands
// out, launch by launch, the uniforms a renderer uploads, exactly as Viewport.frame does in the browser; `seek` moves
// it to another time (a sequence's next frame: behaviours step, the scene is packed again). Its buffers are the
// WebGPU target's storage buffers; the program is given both as WGSL (for the Node/Dawn reference,
// scripts/wgsl-render.ts) and as CUDA (for candela-rt), and so is the display program that turns the accumulated
// radiance into the image the workbench shows (display.ts).
import { SceneSession, frameUniforms } from './session';
import { withParamScope } from './params';
import { cudaProgram, cudaPostProgram, type CudaProgram, type CudaTargetKind, type CudaTargetChoice } from './targets/cuda';
import { WGSL_PRELUDE, WGSL_MAIN } from './wgsl-entry';
import { optixScene, optixFrame, type OptixScene, type OptixFrame } from './targets/optix';
import { displaySource, postSettings, displayUniforms, meterExposure, passesFromBuffers, type PostSettings } from './display';
import { passesToEXR } from './output';
import { digestString } from './digest';

export interface HeadlessOptions {
  width: number; height: number; time?: number;
  /** the frame seed (U row 24 .x, and the pack's seed); a render job uses seed + frame index */
  seed?: number;
  /** Hold auto exposure across independently rendered chunks of one shot. */
  exposureEV?: number;
  target?: CudaTargetChoice | null;
  /** false: render without motion blur (parity checks) */
  motionBlur?: boolean;
  /** shader execution reordering on the OptiX target: 'auto' (default) = scenes without meshes and with more than 64
   *  custom primitives, where it measured faster (G-05 −21 %, F-08 −12 %; mesh scenes +24–39 %; X-02 with built-in
   *  spheres no gain; CANDELA-002 diary steps 22–23) */
  ser?: boolean | 'auto';
  /** false: render every analytic object through the custom intersection program, spheres included (A/B checks) */
  builtinSpheres?: boolean;
  /** param values by id, set before the build (numbers, booleans, strings for choices, [r,g,b] for colours) */
  params?: Record<string, any>;
}
export interface HeadlessRender {
  ok: true;
  width: number; height: number; time: number; seed: number;
  wgsl: string;                       // prelude + scene program + main
  cuda: CudaProgram | null;
  /** the display program (denoise, exposure, tone map, user passes) translated to CUDA (candela_post.cuh) */
  post: CudaProgram | null;
  /** the target the program is for ('auto' resolved) */
  target: CudaTargetKind | null;
  /** OptiX build inputs (target 'optix'): meshes once, the rest per frame; its O replaces the WebGPU one */
  optix: OptixScene | null;
  /** storage buffers (float4 rows): objects, lights, top-level BVH, scene data (static head + dynamic tail at dynBase) */
  O: Float32Array; LI: Float32Array; BV: Float32Array; SD: Float32Array;
  /** bumped whenever the buffers (and the OptiX frame) change: the renderer uploads again */
  version: number;
  /** samples accumulated so far, and per launch */
  spp: number; sppPerFrame: number;
  /** the uniforms for the next launch; advances `spp` */
  frame(): Float32Array;
  /** the uniforms of the id pass (one pinhole sample: instance, face, distance per pixel, as Viewport.idPass) */
  idUniforms(): Float32Array;
  /** move to time t (dt: the step behaviours take; 0 jumps), repack, restart accumulation */
  seek(t: number, dt?: number, seed?: number): void;
  /** the exposure the image is shown at: the camera's manual EV, else the metered one (`meter`) */
  ev: number;
  /** meter the exposure from the accumulation buffer (float4 per pixel); returns and keeps the EV */
  meter(accum: Float32Array): number;
  /** the display program's uniforms for the current samples: { D (128 floats), steps, sigma } (steps 0: no denoise) */
  display(): { D: Float32Array; steps: number; sigma: number };
  /** an OpenEXR file (beauty × exposure, albedo, normal, Z, ids) from the renderer's buffers */
  exr(accum: Float32Array, aovA: Float32Array, aovN: Float32Array, ids: Float32Array | null): Uint8Array;
  postSettings: PostSettings;
  session: SceneSession;
  // ---- live sessions (candela-rt serve, phase 5) ----
  /** hash of the scene program (compiled.shared); the browser computes the same from its own build */
  irHash: string;
  /** a camera override from the workbench's navigation ({ at, target, … } as Viewport.setView), or null */
  view: any;
  setView(view: any): void;
  /** Apply an exported presentation sample. Poses are absolute Candela matrices (metres). */
  setSample(sample: { time: number; view: any; poses: Record<string, number[]> }, dt: number, seed: number): void;
  resize(width: number, height: number): void;
  /** set a param: 'repack' (dynamic: the buffers change, version++), 'rebuild' (static: open the scene again with
   *  paramValues()), or 'unknown' */
  setParam(id: string, value: any): 'repack' | 'rebuild' | 'unknown';
  /** the values set so far (to reopen the scene with after a static change or an edit) */
  paramValues(): Record<string, any>;
}
export type HeadlessResult = HeadlessRender | { ok: false; error: string };

/** 'auto' chooses OptiX above this many analytic objects (scenes without meshes) */
export const AUTO_OPTIX_MIN_OBJECTS = 64;

/** WebGPU rejects zero-sized storage buffers; every target gets at least one row */
const nonEmpty = (a: Float32Array) => (a.length ? a : new Float32Array(4));

export async function openRender(files: Record<string, string>, o: HeadlessOptions): Promise<HeadlessResult> {
  const s = new SceneSession({ seed: 0 });
  for (const [id, v] of Object.entries(o.params || {})) s.setParam(id, v);
  const r = await s.build(files);
  if (!r.ok) return { ok: false, error: r.error ? String(r.error.message || r.error) : 'build failed' };
  const unknown = Object.keys(o.params || {}).filter(id => !s.params.defs.has(id));
  if (unknown.length) return { ok: false, error: `no param ${unknown.join(', ')} (params: ${[...s.params.defs.keys()].join(', ') || 'none'})` };
  if (o.motionBlur === false) s.motionOverride = null;
  const seed0 = o.seed || 0;
  s.seek(o.time || 0, 0);
  const packAt = (t: number, seed: number) => {
    const P = s.pack(t, { seed });
    const SD = new Float32Array(Math.max(4, P.dynBase * 4 + P.SDd.length));
    SD.set(P.SDs); SD.set(P.SDd, P.dynBase * 4);
    return { P, SD };
  };
  let { P, SD } = packAt(o.time || 0, seed0);
  // motion transforms: when the shutter samples poses (K ≥ 2) and meshes can move (animation or behaviours)
  const K = Math.round(P.U[24 * 4 + 1] || 0);
  const canMove = !!(s.compiled.animation || s.behaviors.length);
  const motion = o.motionBlur !== false && K >= 2 && canMove;
  // 'auto': the RT cores pay off with triangle meshes (hardware intersection) or many objects; for a handful of
  // analytic objects the plain-CUDA target's inline BVH walk is faster (measured, CANDELA-002 diary step 16)
  const scene = o.target === 'optix' || o.target === 'auto' ? optixScene(s.compiled, P, SD, { motion, spheres: o.builtinSpheres !== false }) : null;
  const target: CudaTargetKind | null = o.target === null ? null : o.target === 'auto' ? (scene!.meshes.length > 0 || scene!.aabbObjects.length + scene!.sphereObjects.length > AUTO_OPTIX_MIN_OBJECTS ? 'optix' : 'cuda') : (o.target || 'cuda');
  const optix = target === 'optix' ? scene : null;
  const ps = postSettings(s.compiled.engine);
  let cam: any = null, meteredEV = 12;
  const h: HeadlessRender = {
    ok: true, width: o.width, height: o.height, time: o.time || 0, seed: seed0,
    wgsl: WGSL_PRELUDE + s.compiled.shared + WGSL_MAIN,
    target,
    cuda: target === null ? null : cudaProgram(s.compiled, target, { ser: o.ser === true || ((o.ser === undefined || o.ser === 'auto') && !!optix && optix.meshes.length === 0 && optix.aabbObjects.length > AUTO_OPTIX_MIN_OBJECTS) }),
    post: target === null ? null : cudaPostProgram(displaySource(ps.userPasses)),
    optix,
    O: nonEmpty(optix ? optix.O : P.O), LI: nonEmpty(P.LI), BV: nonEmpty(P.BV), SD,
    version: 1,
    spp: 0, sppPerFrame: Math.max(1, (s.compiled.engine && s.compiled.engine.sppPerFrame) || 1),
    frame() {
      const U = P.U.slice();
      // the camera can depend on params: evaluate it with this session's parameters
      const f = withParamScope(s.params, () => frameUniforms(U, s.compiled, { width: h.width, height: h.height, spp: h.spp, time: h.time, seed: h.seed, view: h.view }));
      cam = f.cam;
      h.spp += f.sppF;
      return U;
    },
    idUniforms() {
      const U = P.U.slice();
      withParamScope(s.params, () => frameUniforms(U, s.compiled, { width: h.width, height: h.height, spp: 0, time: h.time, seed: h.seed, view: h.view }));
      U.set([h.width, h.height, 0, 1], 0); U[7] = 0; U[87] = 20;
      return U;
    },
    seek(t: number, dt = 0, seed = h.seed) {
      s.seek(t, dt);
      ({ P, SD } = packAt(t, seed));
      h.time = t; h.seed = seed; h.spp = 0;
      let fr: OptixFrame | null = null;
      if (optix) { fr = optixFrame(s.compiled, P, SD, { motion, spheres: optix.builtinSpheres }); Object.assign(optix, fr); }
      h.O = nonEmpty(fr ? fr.O : P.O); h.LI = nonEmpty(P.LI); h.BV = nonEmpty(P.BV); h.SD = SD;
      h.version++;
    },
    get ev() { if (o.exposureEV !== undefined) return o.exposureEV; return cam && cam.ev != null && cam.mode !== 'auto' ? cam.ev : meteredEV; },
    meter(accum: Float32Array) {
      const m = meterExposure(accum, h.width, h.height);
      if (m) meteredEV = m.ev;
      return h.ev;
    },
    display() {
      const { D, denoise } = displayUniforms({ width: h.width, height: h.height, spp: h.spp, ev: h.ev, post: ps.post, userPasses: ps.userPasses, frameN: h.version, fov: cam ? cam.fov : undefined });
      return { D, steps: denoise ? denoise.steps : 0, sigma: denoise ? denoise.sigma : 0 };
    },
    exr(accum, aovA, aovN, ids) {
      const P2 = { width: h.width, height: h.height, ...passesFromBuffers(accum, aovA, aovN, h.width, h.height), spp: h.spp, exposureScale: 1 / (1.2 * Math.pow(2, h.ev)) };
      return passesToEXR(P2, ids ? { data: ids } : null, { attributes: { 'candela.time': h.time.toFixed(6), 'candela.seed': String(h.seed) } });
    },
    postSettings: ps.post,
    session: s,
    irHash: digestString(s.compiled.shared),
    view: null,
    setView(view) { h.view = view || null; h.spp = 0; },
    setSample(sample, dt, seed) {
      if (!sample || !Number.isFinite(sample.time) || !sample.view || !sample.poses)
        throw Error('frame-track sample needs time, view and poses');
      for (const [id, matrix] of Object.entries(sample.poses))
        if (!Array.isArray(matrix) || matrix.length !== 16 || !matrix.every(Number.isFinite))
          throw Error('frame-track pose for ' + id + ' must be a finite 4x4 placement');
      s.setPoses(sample.poses);
      h.setView(sample.view);
      h.seek(sample.time, dt, seed);
    },
    resize(width, height) { h.width = width; h.height = height; h.spp = 0; },
    setParam(id, value) {
      const def = s.params.defs.get(id);
      if (!def) return 'unknown';
      s.setParam(id, value);
      if (def.isStatic) return 'rebuild';
      h.seek(h.time, 0);
      return 'repack';
    },
    paramValues() { return Object.fromEntries(s.params.values); },
  };
  return h;
}
