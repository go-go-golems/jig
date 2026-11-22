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
