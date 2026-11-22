// candela_compute.cuh — entry point of the plain-CUDA target: the WebGPU compute shader's `main`
// (src/engine/render.ts, GPURenderer.compile) with the same 8×8 blocks, the same accumulation rule and the same
// translated renderPixel. Traversal is the translated WGSL traceAll over the top-level BVH, so this target checks the
// translation alone, before OptiX replaces traceAll.
namespace wgsl {
__device__ __forceinline__ float4 f4(vec4f v) { return make_float4(v.x, v.y, v.z, v.w); }
__device__ __forceinline__ float4 add4(float4 a, vec4f b) { return make_float4(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w); }
}
extern "C" __global__ void candela_main() {
  using namespace wgsl;
  Kernel k;
  const u32 gx = blockIdx.x * blockDim.x + threadIdx.x, gy = blockIdx.y * blockDim.y + threadIdx.y;
  const vec2f res = k.U(0).xy();
  if (f32(gx) >= res.x || f32(gy) >= res.y) return;
  const PixOut o = k.renderPixel(vec2f(f32(gx), f32(gy)), u32(k.U(0).z));
  const u32 ix = gy * u32(res.x) + gx;
  if (k.U(0).z < 0.5f) {
    params.accum[ix] = f4(o.c);
    if (i32(k.U(21).w) != 20) { params.aovA[ix] = f4(o.alb); params.aovN[ix] = f4(o.nrm); }
  } else {
    params.accum[ix] = add4(params.accum[ix], o.c);
    params.aovA[ix] = add4(params.aovA[ix], o.alb);
    params.aovN[ix] = add4(params.aovN[ix], o.nrm);
  }
}
