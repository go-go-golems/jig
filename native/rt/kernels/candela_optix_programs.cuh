// candela_optix_programs.cuh — the OptiX target's programs (CANDELA-002 design doc 02, §6.4).
//   raygen       the WebGPU compute shader's main: translated renderPixel, same accumulation rule
//   triangle CH  object = instance id (the object's index in O), primitive = triangle record index, barycentrics
//   analytic IS  the translated hitObj on the world ray (it applies the object's transform and motion poses)
//   analytic CH  object = the attribute the IS reported
//   miss         leaves payload 1 at ~0u
namespace wgsl {
__device__ __forceinline__ float4 f4o(vec4f v) { return make_float4(v.x, v.y, v.z, v.w); }
__device__ __forceinline__ float4 add4o(float4 a, vec4f b) { return make_float4(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w); }
}

extern "C" __global__ void __raygen__candela() {
  using namespace wgsl;
  const uint3 ix = optixGetLaunchIndex();
  Kernel k;
  const vec2f res = k.U(0).xy();
  const PixOut o = k.renderPixel(vec2f(f32(ix.x), f32(ix.y)), u32(k.U(0).z));
  const u32 i = ix.y * u32(res.x) + ix.x;
  if (k.U(0).z < 0.5f) {
    params.accum[i] = f4o(o.c);
    if (i32(k.U(21).w) != 20) { params.aovA[i] = f4o(o.alb); params.aovN[i] = f4o(o.nrm); }
  } else {
    params.accum[i] = add4o(params.accum[i], o.c);
    params.aovA[i] = add4o(params.aovA[i], o.alb);
    params.aovN[i] = add4o(params.aovN[i], o.nrm);
  }
}

extern "C" __global__ void __closesthit__triangle() {
  const float2 b = optixGetTriangleBarycentrics();
  optixSetPayload_0(__float_as_uint(optixGetRayTmax()));
  optixSetPayload_1(optixGetInstanceId());
  optixSetPayload_2(optixGetPrimitiveIndex());
  optixSetPayload_3(__float_as_uint(b.x));
  optixSetPayload_4(__float_as_uint(b.y));
}

extern "C" __global__ void __intersection__analytic() {
  using namespace wgsl;
  const i32 obj = params.aabbObjects[optixGetPrimitiveIndex()];
  Kernel k;
  k.gTau = __uint_as_float(optixGetPayload_5());
  k.gTime = __uint_as_float(optixGetPayload_6());
  if (optixGetPayload_7() != 0u && (i32(k.oRow(obj, 0).w) & 1) != 0) return;
  const float3 o = optixGetWorldRayOrigin(), d = optixGetWorldRayDirection();
  const f32 t = k.hitObj(obj, vec3f(o.x, o.y, o.z), vec3f(d.x, d.y, d.z), optixGetRayTmax());
  if (t >= optixGetRayTmin() && t < optixGetRayTmax()) optixReportIntersection(t, 0, (unsigned)obj);
}

extern "C" __global__ void __closesthit__analytic() {
  optixSetPayload_0(__float_as_uint(optixGetRayTmax()));
  optixSetPayload_1(optixGetAttribute_0());
  optixSetPayload_2(~0u);
}

extern "C" __global__ void __miss__candela() {}
