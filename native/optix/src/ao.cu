// ao.cu — OptiX device programs for the traversal spike: Candela's AO integrator (kernel.ts traceAOV mode 4) on the
// RT cores. Per sample: a jittered pinhole camera ray, and where it hits, one cosine-weighted occlusion ray of
// length aoRadius from P + Ng·4·EPS. Same estimator as the WGSL kernel, different RNG.
#include <optix.h>
#include "params.h"

extern "C" { __constant__ LaunchParams params; }

static __forceinline__ __device__ float3 operator+(float3 a, float3 b) { return make_float3(a.x + b.x, a.y + b.y, a.z + b.z); }
static __forceinline__ __device__ float3 operator-(float3 a, float3 b) { return make_float3(a.x - b.x, a.y - b.y, a.z - b.z); }
static __forceinline__ __device__ float3 operator*(float3 a, float k) { return make_float3(a.x * k, a.y * k, a.z * k); }
static __forceinline__ __device__ float dot3(float3 a, float3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
static __forceinline__ __device__ float3 cross3(float3 a, float3 b) { return make_float3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
static __forceinline__ __device__ float3 norm3(float3 a) { float l = rsqrtf(fmaxf(dot3(a, a), 1e-30f)); return a * l; }

// PCG hash (as the WGSL kernel's pcgH) and a [0,1) float stream
static __forceinline__ __device__ unsigned pcgH(unsigned v) {
  unsigned s = v * 747796405u + 2891336453u; unsigned w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w;
}
static __forceinline__ __device__ float rnd(unsigned& s) { s = pcgH(s); return (s >> 8) * (1.0f / 16777216.0f); }

constexpr float EPS = 0.0002f;   // kernel.ts EPS
constexpr float TAU = 6.283185307f;

extern "C" __global__ void __raygen__ao() {
  const uint3 idx = optixGetLaunchIndex();
  const unsigned px = idx.x, py = idx.y, W = params.width, H = params.height;
  float ao = 0.f, hits = 0.f;
  for (unsigned s = 0; s < params.spp; s++) {
    const unsigned frame = params.frame + s;
    unsigned rng = pcgH(px + py * 9781u + frame * 6271u + 17u) ^ pcgH(frame * 26699u + 3u);
    const float jx = rnd(rng), jy = rnd(rng);
    const float nx = (px + jx) / W * 2.f - 1.f, ny = 1.f - (py + jy) / H * 2.f;
    const float3 dir = norm3(params.fwd + params.right * nx + params.up * ny);
    unsigned p0 = __float_as_uint(-1.f), p1 = 0, p2 = 0, p3 = 0;
    optixTrace(params.handle, params.eye, dir, 0.f, 1e16f, 0.f, OptixVisibilityMask(255), OPTIX_RAY_FLAG_NONE,
               RAY_CAMERA, RAY_TYPES, RAY_CAMERA, p0, p1, p2, p3);
    const float t = __uint_as_float(p0);
    if (t < 0.f) continue;   // AO of a miss is 0 (traceAOV)
    hits += 1.f;
    float3 Ng = make_float3(__uint_as_float(p1), __uint_as_float(p2), __uint_as_float(p3));
    if (dot3(Ng, dir) > 0.f) Ng = Ng * -1.f;   // face the incoming ray, as Hit.Ng does
    const float3 P = params.eye + dir * t;
    // frame around Ng, cosine-weighted direction (cosHemi)
    const float3 a = fabsf(Ng.x) > 0.9f ? make_float3(0.f, 1.f, 0.f) : make_float3(1.f, 0.f, 0.f);
    const float3 tx = norm3(cross3(a, Ng)), ty = cross3(Ng, tx);
    const float u = rnd(rng), v = rnd(rng), r = sqrtf(u), ph = TAU * v;
    const float3 d = tx * (r * cosf(ph)) + ty * (r * sinf(ph)) + Ng * sqrtf(fmaxf(0.f, 1.f - u));
    unsigned vis = 0;
    optixTrace(params.handle, P + Ng * (EPS * 4.f), d, 0.f, params.aoRadius, 0.f, OptixVisibilityMask(255),
               OPTIX_RAY_FLAG_TERMINATE_ON_FIRST_HIT | OPTIX_RAY_FLAG_DISABLE_CLOSESTHIT | OPTIX_RAY_FLAG_DISABLE_ANYHIT,
               RAY_SHADOW, RAY_TYPES, RAY_SHADOW, vis);
    ao += (float)vis;
  }
  float4& acc = params.accum[py * W + px];
  acc.x += ao; acc.y += ao; acc.z += ao; acc.w += hits;
}

extern "C" __global__ void __closesthit__camera() {
  float3 v[3];
  optixGetTriangleVertexData(optixGetGASTraversableHandle(), optixGetPrimitiveIndex(), optixGetSbtGASIndex(), 0.f, v);
  const float3 n = norm3(optixTransformNormalFromObjectToWorldSpace(cross3(v[1] - v[0], v[2] - v[0])));
  optixSetPayload_0(__float_as_uint(optixGetRayTmax()));
  optixSetPayload_1(__float_as_uint(n.x));
  optixSetPayload_2(__float_as_uint(n.y));
  optixSetPayload_3(__float_as_uint(n.z));
}

extern "C" __global__ void __miss__camera() { optixSetPayload_0(__float_as_uint(-1.f)); }
extern "C" __global__ void __miss__shadow() { optixSetPayload_0(1u); }   // nothing within aoRadius: visible
