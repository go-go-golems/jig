// core.ts — entry point of the engine bundle (`dist-core/candela-core.js`, built by scripts/bundle-core.ts) that
// runs outside the browser: in Node and in V8 embedded in candela-rt (CANDELA-002 design doc 02). It must not import
// anything that touches the DOM, WebGPU or Node. The bundle defines `globalThis.Candela` with these exports.
export { build } from './candela';
export { cameraUniforms, inv34 } from './compile';
export { loadCatalog, loadPresets } from '../content/catalog';
export { digestBytes, digestString, packDigest, digestPreset } from './digest';

import { loadPresets } from '../content/catalog';
import { digestPreset, type PresetDigest } from './digest';

/** digest the presets in `content` (path → text, as src/content/node.ts reads it) at the given times */
export async function digestCatalog(content: Record<string, string>, ids: string[] | null, times: number[]): Promise<PresetDigest[]> {
  const presets = loadPresets(content).filter(p => !ids || !ids.length || ids.includes(p.id));
  const out: PresetDigest[] = [];
  for (const p of presets) out.push(await digestPreset(p.id, p.files, times));
  return out;
}

export const version = 'candela-core 0';

// ---- sessions: the scene's callbacks (animation, behaviours) running frame by frame, outside the browser ----
export { SceneSession } from './session';
import { SceneSession } from './session';
import { digestBytes } from './digest';

export interface SessionTrace {
  id: string; ok: boolean; error?: string;
  behaviors?: number; animated?: boolean;
  frames?: { t: number; U: string; O: string; SDd: string }[];
  frameMs?: number;            // mean seek + pack per frame
}

/** step one preset's session at `fps` for `frames` frames (behaviours step by 1/fps) and digest each frame's buffers */
export async function sessionTrace(id: string, files: Record<string, string>, o: { fps: number; frames: number; seed?: number }): Promise<SessionTrace> {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const s = new SceneSession({ seed: o.seed || 0 });
  const r = await s.build(files);
  if (!r.ok) return { id, ok: false, error: r.error ? String(r.error.message || r.error) : 'build failed' };
  const frames: { t: number; U: string; O: string; SDd: string }[] = [];
  let ms = 0;
  for (let f = 0; f < o.frames; f++) {
    const t = f / o.fps, t0 = now();
    s.seek(t, f === 0 ? 0 : 1 / o.fps);
    const P = s.pack();
    ms += now() - t0;
    frames.push({ t, U: digestBytes(P.U), O: digestBytes(P.O), SDd: digestBytes(P.SDd) });
  }
  return { id, ok: true, behaviors: s.behaviors.length, animated: !!s.compiled.animation, frames, frameMs: ms / o.frames };
}

/** session traces for the presets in `content` that move: those with behaviours or an animation export */
export async function sessionCatalog(content: Record<string, string>, ids: string[] | null, o: { fps: number; frames: number; seed?: number }): Promise<SessionTrace[]> {
  const presets = loadPresets(content).filter(p => (!ids || !ids.length || ids.includes(p.id)) && /\.behavior\(|export const animation|export function animation/.test(Object.values(p.files).join('\n')));
  const out: SessionTrace[] = [];
  for (const p of presets) out.push(await sessionTrace(p.id, p.files, o));
  return out;
}

// ---- headless rendering: the CUDA translation and the buffers a native renderer needs ----
export { wgslToCuda } from './wgsl2cuda';
export { cudaProgram } from './targets/cuda';
export { openRender } from './headless';
import { openRender, type HeadlessOptions } from './headless';
import { cudaProgram } from './targets/cuda';
import { build } from './candela';

/** openRender for a preset of `content` by id */
export async function openRenderPreset(content: Record<string, string>, id: string, o: HeadlessOptions) {
  const p = loadPresets(content).find(q => q.id === id);
  if (!p) return { ok: false, error: `no preset ${id}` };
  // a still without a time renders at the preset's start time, as the workbench's render jobs do
  return openRender(p.files, o.time == null ? Object.assign({}, o, { time: (p as any).time || 0 }) : o);
}

/** the CUDA program of every preset (or `ids`), for the NVRTC sweep: { id, ok, error?, source?, hash, lines, … } */
export async function cudaCatalog(content: Record<string, string>, ids: string[] | null, target: 'cuda' | 'optix' = 'cuda') {
  const out: any[] = [];
  for (const p of loadPresets(content).filter(q => !ids || !ids.length || ids.includes(q.id))) {
    try {
      const r: any = await build(p.files);
      if (!r.ok) { out.push({ id: p.id, ok: false, stage: 'build', error: String(r.error && r.error.message || r.error) }); continue; }
      out.push({ id: p.id, ok: true, ...cudaProgram(r.compiled, target) });
    } catch (e: any) { out.push({ id: p.id, ok: false, stage: 'translate', error: String(e.message || e) }); }
  }
  return out;
}
