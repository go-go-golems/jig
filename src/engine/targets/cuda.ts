// targets/cuda.ts — the CUDA translation unit for a compiled scene (CANDELA-002 design doc 02, §5.6). The scene's WGSL
// program (`compiled.shared`: kernel + generated materials and fields) is translated by wgsl2cuda; the parts that
// depend on the target (launch parameters, entry points, and for OptiX the traversal) are headers in
// native/rt/kernels/, found by NVRTC through its include path.
import { cudaSource, type CudaTranslation } from '../wgsl2cuda';
import { digestString } from '../digest';

export type CudaTargetKind = 'cuda' | 'optix';
/** 'auto': the headless driver picks OptiX when the RT cores pay off (meshes, many objects), plain CUDA otherwise */
export type CudaTargetChoice = CudaTargetKind | 'auto';
export interface CudaProgram { source: string; hash: string; lines: number; functions: number; omitted: string[]; translateMs: number }

const TARGETS: Record<CudaTargetKind, { omit: string[]; renameDefs?: Record<string, string>; prelude: string; kernelPrelude: string; epilogue: string }> = {
  // plain CUDA: the translated traceAll walks Candela's own BVH; checks the translation in isolation
  cuda: { omit: [], prelude: '#include "candela_cuda_params.h"', kernelPrelude: '#include "candela_accessors.inc"', epilogue: '#include "candela_compute.cuh"' },
  // OptiX: traceAll comes from the traversal shim (phase 3). (Keeping the BVH walk too, as traceAllBVH, made the raygen
  // program larger and K-09 25 % slower; small scenes use the plain-CUDA target instead, see headless.ts 'auto'.)
  optix: { omit: ['traceAll'], prelude: '#include "candela_optix_params.h"', kernelPrelude: '#include "candela_accessors.inc"\n#include "candela_traversal.inc"', epilogue: '#include "candela_optix_programs.cuh"' },
};

export function cudaProgram(compiled: { shared: string }, target: CudaTargetKind = 'cuda'): CudaProgram {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const { source, translation }: { source: string; translation: CudaTranslation } = cudaSource(compiled.shared, TARGETS[target]);
  return { source, hash: digestString(source), lines: source.split('\n').length, functions: translation.functions.length, omitted: translation.omitted, translateMs: now() - t0 };
}
