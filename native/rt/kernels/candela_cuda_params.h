// candela_cuda_params.h — launch parameters of the plain-CUDA target (CANDELA-002 phase 2). The buffers are the
// WebGPU target's storage buffers with the same contents (src/engine/render.ts, GPURenderer.prelude): one float4 per
// WGSL vec4f. `params` lives in constant memory; the host fills it with cuModuleGetGlobal + cuMemcpyHtoD.
#pragma once
struct CandelaParams {
  const float4* U;      // uniforms (uni)
  const float4* O;      // object records (objs)
  const float4* LI;     // light records (lits)
  const float4* BV;     // top-level BVH nodes (bvhs)
  const float4* SD;     // scene data: static head, then the dynamic tail at dynBase (sd)
  float4* accum;        // radiance sum, alpha = sample count
  float4* aovA;         // albedo sum
  float4* aovN;         // normal sum, w = depth
};
extern "C" { __constant__ CandelaParams params; }
