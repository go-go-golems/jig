// candela_accessors.inc — members of struct Kernel: the WGSL storage accessors (src/engine/render.ts prelude) read
// from the launch parameters. Shared by the plain-CUDA and OptiX targets.
__device__ static vec4f ld4(const float4* p, i32 i) { const float4 v = p[i]; return vec4f(v.x, v.y, v.z, v.w); }
__device__ vec4f U(i32 i) const { return ld4(params.U, i); }
__device__ vec4f objF(i32 i) const { return ld4(params.O, i); }
__device__ vec4f litF(i32 i) const { return ld4(params.LI, i); }
__device__ vec4f bvhF(i32 i) const { return ld4(params.BV, i); }
__device__ vec4f sdF(i32 i) const { return ld4(params.SD, i); }
