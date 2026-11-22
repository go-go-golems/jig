// candela_post.cuh — entry points of the display program (CANDELA-002 phase 4), as the WebGPU display pipeline
// (render.ts GPURenderer.display): candela_denoise runs one à-trous step (src → dst), candela_display writes the
// display-referred image (displayPx: exposure, bloom, user passes, tone map, sRGB), 8×8 blocks over the image.
namespace wgsl {
__device__ __forceinline__ unsigned char unorm8(f32 x) { return (unsigned char)__float2int_rn(fminf(fmaxf(x, 0.0f), 1.0f) * 255.0f); }
}
extern "C" __global__ void candela_denoise() {
  using namespace wgsl;
  Kernel k;
  const vec2i res = vec2i(i32(k.D(0).x), i32(k.D(0).y));
  const i32 gx = i32(blockIdx.x * blockDim.x + threadIdx.x), gy = i32(blockIdx.y * blockDim.y + threadIdx.y);
  if (gx >= res.x || gy >= res.y) return;
  const vec3f c = k.denoisePx(vec2i(gx, gy), i32(k.D(4).x), res, k.D(4).y, k.D(0).w);
  post.dst[gy * res.x + gx] = make_float4(c.x, c.y, c.z, 1.0f);
}
extern "C" __global__ void candela_display() {
  using namespace wgsl;
  Kernel k;
  const vec2i res = vec2i(i32(k.D(0).x), i32(k.D(0).y));
  const i32 gx = i32(blockIdx.x * blockDim.x + threadIdx.x), gy = i32(blockIdx.y * blockDim.y + threadIdx.y);
  if (gx >= res.x || gy >= res.y) return;
  const vec4f c = k.displayPx(vec2i(gx, gy), res);
  const i32 i = gy * res.x + gx;
  const uchar4 o = make_uchar4(unorm8(c.x), unorm8(c.y), unorm8(c.z), unorm8(c.w));
  post.out[i] = o;
  if (post.rgb) { post.rgb[i * 3] = o.x; post.rgb[i * 3 + 1] = o.y; post.rgb[i * 3 + 2] = o.z; }
}
