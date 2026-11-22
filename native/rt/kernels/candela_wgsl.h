// candela_wgsl.h — WGSL's types and built-in functions for CUDA, so that Candela's kernel, translated by
// src/engine/wgsl2cuda.ts, compiles with nvcc/NVRTC (CANDELA-002 design doc 02, §5.6).
//
// Everything lives in namespace `wgsl`. The translated program is placed inside that namespace too, so unqualified
// calls such as `max(a, b)` or `sqrt(x)` find these definitions first and never reach CUDA's global overloads, which
// would make mixed calls ambiguous.
//
// Types keep their WGSL names (f32, i32, u32, vec3f, vec2u, …), so `f32(x)` and `vec3f(a, b, c)` translate unchanged:
// a functional cast and a constructor call. Vectors are small structs with x/y/z/w members; swizzles of two or more
// components are member functions (`v.xyz()`, the translator adds the parentheses). Operators are friend functions
// defined in the class templates, so `v * 2` with an int literal converts like WGSL's abstract integers.
#pragma once

#ifndef __CUDACC_RTC__
#include <cmath>
#include <cstring>
#endif

namespace wgsl {

typedef float f32;
typedef int i32;
typedef unsigned int u32;

#define WG __host__ __device__ __forceinline__

template <class T> struct V2;
template <class T> struct V3;
template <class T> struct V4;

// ---- arithmetic for all vector widths: component-wise, vector ⊕ scalar, scalar ⊕ vector --------------------------
#define WGSL_VEC_OPS(V, N)                                                                                         \
  friend WG V operator+(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] + b[i]; return r; }              \
  friend WG V operator-(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] - b[i]; return r; }              \
  friend WG V operator*(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] * b[i]; return r; }              \
  friend WG V operator/(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] / b[i]; return r; }              \
  friend WG V operator+(V a, T b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] + b; return r; }                 \
  friend WG V operator-(V a, T b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] - b; return r; }                 \
  friend WG V operator*(V a, T b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] * b; return r; }                 \
  friend WG V operator/(V a, T b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] / b; return r; }                 \
  friend WG V operator+(T a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a + b[i]; return r; }                 \
  friend WG V operator-(T a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a - b[i]; return r; }                 \
  friend WG V operator*(T a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a * b[i]; return r; }                 \
  friend WG V operator/(T a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a / b[i]; return r; }                 \
  friend WG V operator-(V a) { V r; for (int i = 0; i < N; i++) r[i] = -a[i]; return r; }                         \
  friend WG V operator^(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] ^ b[i]; return r; }              \
  friend WG V operator&(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] & b[i]; return r; }              \
  friend WG V operator|(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] | b[i]; return r; }              \
  friend WG V operator%(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] % b[i]; return r; }              \
  friend WG V operator>>(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] >> b[i]; return r; }            \
  friend WG V operator<<(V a, V b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] << b[i]; return r; }            \
  friend WG V operator>>(V a, T b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] >> b; return r; }               \
  friend WG V operator<<(V a, T b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] << b; return r; }               \
  friend WG V operator^(V a, T b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] ^ b; return r; }                 \
  friend WG V operator&(V a, T b) { V r; for (int i = 0; i < N; i++) r[i] = a[i] & b; return r; }                 \
  WG V& operator+=(V b) { return *this = *this + b; }                                                              \
  WG V& operator-=(V b) { return *this = *this - b; }                                                              \
  WG V& operator*=(V b) { return *this = *this * b; }                                                              \
  WG V& operator/=(V b) { return *this = *this / b; }                                                              \
  WG V& operator+=(T b) { return *this = *this + b; }                                                              \
  WG V& operator-=(T b) { return *this = *this - b; }                                                              \
  WG V& operator*=(T b) { return *this = *this * b; }                                                              \
  WG V& operator/=(T b) { return *this = *this / b; }                                                              \
  WG V& operator^=(V b) { return *this = *this ^ b; }                                                              \
  WG T& operator[](int i) { return (&x)[i]; }                                                                      \
  WG T operator[](int i) const { return (&x)[i]; }

// swizzles: every combination of the available components, as const member functions
#define S2(a, b) WG V2<T> a##b() const { return V2<T>(a, b); }
#define S3(a, b, c) WG V3<T> a##b##c() const { return V3<T>(a, b, c); }
#define S4(a, b, c, d) WG V4<T> a##b##c##d() const { return V4<T>(a, b, c, d); }

template <class T> struct V2 {
  T x, y;
  WG V2() : x(0), y(0) {}
  WG explicit V2(T s) : x(s), y(s) {}
  WG V2(T a, T b) : x(a), y(b) {}
  template <class U> WG explicit V2(V2<U> v) : x(T(v.x)), y(T(v.y)) {}
  WGSL_VEC_OPS(V2, 2)
  S2(x, x) S2(x, y) S2(y, x) S2(y, y)
};
template <class T> struct V3 {
  T x, y, z;
  WG V3() : x(0), y(0), z(0) {}
  WG explicit V3(T s) : x(s), y(s), z(s) {}
  WG V3(T a, T b, T c) : x(a), y(b), z(c) {}
  WG V3(V2<T> a, T c) : x(a.x), y(a.y), z(c) {}
  WG V3(T a, V2<T> b) : x(a), y(b.x), z(b.y) {}
  template <class U> WG explicit V3(V3<U> v) : x(T(v.x)), y(T(v.y)), z(T(v.z)) {}
  WGSL_VEC_OPS(V3, 3)
#define S3C(a) S2(a, x) S2(a, y) S2(a, z)
  S3C(x) S3C(y) S3C(z)
#define S3CC(a, b) S3(a, b, x) S3(a, b, y) S3(a, b, z)
  S3CC(x, x) S3CC(x, y) S3CC(x, z) S3CC(y, x) S3CC(y, y) S3CC(y, z) S3CC(z, x) S3CC(z, y) S3CC(z, z)
#undef S3C
#undef S3CC
};
template <class T> struct V4 {
  T x, y, z, w;
  WG V4() : x(0), y(0), z(0), w(0) {}
  WG explicit V4(T s) : x(s), y(s), z(s), w(s) {}
  WG V4(T a, T b, T c, T d) : x(a), y(b), z(c), w(d) {}
  WG V4(V3<T> a, T d) : x(a.x), y(a.y), z(a.z), w(d) {}
  WG V4(T a, V3<T> b) : x(a), y(b.x), z(b.y), w(b.z) {}
  WG V4(V2<T> a, V2<T> b) : x(a.x), y(a.y), z(b.x), w(b.y) {}
  WG V4(V2<T> a, T c, T d) : x(a.x), y(a.y), z(c), w(d) {}
  template <class U> WG explicit V4(V4<U> v) : x(T(v.x)), y(T(v.y)), z(T(v.z)), w(T(v.w)) {}
  WGSL_VEC_OPS(V4, 4)
#define S4C(a) S2(a, x) S2(a, y) S2(a, z) S2(a, w)
  S4C(x) S4C(y) S4C(z) S4C(w)
#define S4CC(a, b) S3(a, b, x) S3(a, b, y) S3(a, b, z) S3(a, b, w)
  S4CC(x, x) S4CC(x, y) S4CC(x, z) S4CC(x, w) S4CC(y, x) S4CC(y, y) S4CC(y, z) S4CC(y, w)
  S4CC(z, x) S4CC(z, y) S4CC(z, z) S4CC(z, w) S4CC(w, x) S4CC(w, y) S4CC(w, z) S4CC(w, w)
  S4(x, y, z, w) S4(w, z, y, x) S4(x, x, x, x) S4(y, y, y, y) S4(z, z, z, z) S4(w, w, w, w)
#undef S4C
#undef S4CC
};
#undef S2
#undef S3
#undef S4

typedef V2<f32> vec2f; typedef V3<f32> vec3f; typedef V4<f32> vec4f;
typedef V2<i32> vec2i; typedef V3<i32> vec3i; typedef V4<i32> vec4i;
typedef V2<u32> vec2u; typedef V3<u32> vec3u; typedef V4<u32> vec4u;

// ---- scalar built-ins (f32) ----------------------------------------------------------------------------------------
WG f32 abs(f32 x) { return fabsf(x); }
WG i32 abs(i32 x) { return x < 0 ? -x : x; }
WG f32 sqrt(f32 x) { return sqrtf(x); }
WG f32 inverseSqrt(f32 x) { return rsqrtf(x); }
WG f32 exp(f32 x) { return expf(x); }
WG f32 exp2(f32 x) { return exp2f(x); }
WG f32 log(f32 x) { return logf(x); }
WG f32 log2(f32 x) { return log2f(x); }
WG f32 pow(f32 a, f32 b) { return powf(a, b); }
WG f32 sin(f32 x) { return sinf(x); }
WG f32 cos(f32 x) { return cosf(x); }
WG f32 tan(f32 x) { return tanf(x); }
WG f32 asin(f32 x) { return asinf(x); }
WG f32 acos(f32 x) { return acosf(x); }
WG f32 atan(f32 x) { return atanf(x); }
WG f32 atan2(f32 y, f32 x) { return atan2f(y, x); }
WG f32 sinh(f32 x) { return sinhf(x); }
WG f32 cosh(f32 x) { return coshf(x); }
WG f32 tanh(f32 x) { return tanhf(x); }
WG f32 floor(f32 x) { return floorf(x); }
WG f32 ceil(f32 x) { return ceilf(x); }
WG f32 round(f32 x) { return rintf(x); }          // WGSL rounds half to even
WG f32 trunc(f32 x) { return truncf(x); }
WG f32 fract(f32 x) { return x - floorf(x); }
WG f32 sign(f32 x) { return x > 0.f ? 1.f : (x < 0.f ? -1.f : 0.f); }
WG i32 sign(i32 x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }
WG f32 saturate(f32 x) { return fminf(fmaxf(x, 0.f), 1.f); }
WG f32 degrees(f32 x) { return x * 57.29577951308232f; }
WG f32 radians(f32 x) { return x * 0.017453292519943295f; }
WG f32 fma(f32 a, f32 b, f32 c) { return fmaf(a, b, c); }
WG f32 step(f32 edge, f32 x) { return x < edge ? 0.f : 1.f; }
WG f32 smoothstep(f32 lo, f32 hi, f32 x) { f32 t = fminf(fmaxf((x - lo) / (hi - lo), 0.f), 1.f); return t * t * (3.f - 2.f * t); }
WG f32 mix(f32 a, f32 b, f32 t) { return a * (1.f - t) + b * t; }
WG u32 countOneBits(u32 x) {
#ifdef __CUDA_ARCH__
  return __popc(x);
#else
  u32 n = 0; while (x) { n += x & 1u; x >>= 1; } return n;
#endif
}

// min/max/clamp on scalars of mixed literal types (WGSL abstract numbers): the common type, as C++ arithmetic does
template <class A, class B> WG auto min(A a, B b) -> decltype(a + b) { return a < b ? a : b; }
template <class A, class B> WG auto max(A a, B b) -> decltype(a + b) { return a > b ? a : b; }
template <class A, class B, class C> WG auto clamp(A x, B lo, C hi) -> decltype(x + lo + hi) { return min(max(x, lo), hi); }

// ---- vector built-ins (component-wise unless noted) ------------------------------------------------------------------
#define WGSL_VEC_FN1(name)                                                                                          \
  template <class T> WG V2<T> name(V2<T> v) { return V2<T>(name(v.x), name(v.y)); }                                 \
  template <class T> WG V3<T> name(V3<T> v) { return V3<T>(name(v.x), name(v.y), name(v.z)); }                      \
  template <class T> WG V4<T> name(V4<T> v) { return V4<T>(name(v.x), name(v.y), name(v.z), name(v.w)); }
WGSL_VEC_FN1(abs) WGSL_VEC_FN1(sqrt) WGSL_VEC_FN1(inverseSqrt) WGSL_VEC_FN1(exp) WGSL_VEC_FN1(exp2) WGSL_VEC_FN1(log)
WGSL_VEC_FN1(log2) WGSL_VEC_FN1(sin) WGSL_VEC_FN1(cos) WGSL_VEC_FN1(tan) WGSL_VEC_FN1(asin) WGSL_VEC_FN1(acos)
WGSL_VEC_FN1(atan) WGSL_VEC_FN1(floor) WGSL_VEC_FN1(ceil) WGSL_VEC_FN1(round) WGSL_VEC_FN1(trunc) WGSL_VEC_FN1(fract)
WGSL_VEC_FN1(sign) WGSL_VEC_FN1(saturate) WGSL_VEC_FN1(tanh)
#undef WGSL_VEC_FN1

#define WGSL_VEC_FN2(name)                                                                                          \
  template <class T> WG V2<T> name(V2<T> a, V2<T> b) { return V2<T>(name(a.x, b.x), name(a.y, b.y)); }              \
  template <class T> WG V3<T> name(V3<T> a, V3<T> b) { return V3<T>(name(a.x, b.x), name(a.y, b.y), name(a.z, b.z)); } \
  template <class T> WG V4<T> name(V4<T> a, V4<T> b) { return V4<T>(name(a.x, b.x), name(a.y, b.y), name(a.z, b.z), name(a.w, b.w)); }
WGSL_VEC_FN2(pow) WGSL_VEC_FN2(atan2) WGSL_VEC_FN2(step)
#undef WGSL_VEC_FN2
template <class T> WG V2<T> min(V2<T> a, V2<T> b) { return V2<T>(min(a.x, b.x), min(a.y, b.y)); }
template <class T> WG V3<T> min(V3<T> a, V3<T> b) { return V3<T>(min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)); }
template <class T> WG V4<T> min(V4<T> a, V4<T> b) { return V4<T>(min(a.x, b.x), min(a.y, b.y), min(a.z, b.z), min(a.w, b.w)); }
template <class T> WG V2<T> max(V2<T> a, V2<T> b) { return V2<T>(max(a.x, b.x), max(a.y, b.y)); }
template <class T> WG V3<T> max(V3<T> a, V3<T> b) { return V3<T>(max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)); }
template <class T> WG V4<T> max(V4<T> a, V4<T> b) { return V4<T>(max(a.x, b.x), max(a.y, b.y), max(a.z, b.z), max(a.w, b.w)); }
template <class V> WG V clampv(V x, V lo, V hi) { return min(max(x, lo), hi); }
template <class T> WG V2<T> clamp(V2<T> x, V2<T> lo, V2<T> hi) { return clampv(x, lo, hi); }
template <class T> WG V3<T> clamp(V3<T> x, V3<T> lo, V3<T> hi) { return clampv(x, lo, hi); }
template <class T> WG V4<T> clamp(V4<T> x, V4<T> lo, V4<T> hi) { return clampv(x, lo, hi); }
// mix with a scalar or a vector weight; smoothstep with scalar or vector edges
template <class V, class W> WG V mix(V a, V b, W t) { return a * (1.f - t) + b * t; }
template <class T> WG V3<T> smoothstep(V3<T> lo, V3<T> hi, V3<T> x) { return V3<T>(smoothstep(lo.x, hi.x, x.x), smoothstep(lo.y, hi.y, x.y), smoothstep(lo.z, hi.z, x.z)); }

// geometry
template <class T> WG T dot(V2<T> a, V2<T> b) { return a.x * b.x + a.y * b.y; }
template <class T> WG T dot(V3<T> a, V3<T> b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
template <class T> WG T dot(V4<T> a, V4<T> b) { return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w; }
WG vec3f cross(vec3f a, vec3f b) { return vec3f(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
WG f32 length(f32 x) { return fabsf(x); }
template <class V> WG f32 length(V v) { return sqrtf(dot(v, v)); }
template <class V> WG f32 distance(V a, V b) { return length(a - b); }
WG f32 distance(f32 a, f32 b) { return fabsf(a - b); }
template <class V> WG V normalize(V v) { return v / sqrtf(dot(v, v)); }
WG vec3f reflect(vec3f i, vec3f n) { return i - n * (2.f * dot(n, i)); }
WG vec3f refract(vec3f i, vec3f n, f32 eta) {
  const f32 d = dot(n, i), k = 1.f - eta * eta * (1.f - d * d);
  if (k < 0.f) return vec3f(0.f);
  return i * eta - n * (eta * d + sqrtf(k));
}
WG vec3f faceForward(vec3f n, vec3f i, vec3f nref) { return dot(nref, i) < 0.f ? n : -n; }

// bit casts (WGSL bitcast<T>)
WG u32 bitcast_u32(f32 x) {
#ifdef __CUDA_ARCH__
  return __float_as_uint(x);
#else
  u32 u; memcpy(&u, &x, 4); return u;
#endif
}
WG f32 bitcast_f32(u32 x) {
#ifdef __CUDA_ARCH__
  return __uint_as_float(x);
#else
  f32 f; memcpy(&f, &x, 4); return f;
#endif
}
WG i32 bitcast_i32(f32 x) { return (i32)bitcast_u32(x); }

}  // namespace wgsl
