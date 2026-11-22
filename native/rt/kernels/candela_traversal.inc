// candela_traversal.inc — member of struct Kernel on the OptiX target: traceAll, replacing the translated WGSL
// function (wgsl2cuda omits it). Contract unchanged: the nearest hit (t, object index in O) below tmax; for a
// triangle, gTri = the scene-data row of its record and gBary = its barycentrics, exactly what hitMesh records, so
// finishHit runs unchanged. Unbounded objects (infinite planes) have no box and stay in a loop, as in the WGSL.
//
// payload: 0 t · 1 object (~0u: no hit) · 2 primitive (~0u: analytic) · 3, 4 barycentrics · 5 gTau · 6 gTime ·
//          7 shadow ray (the intersection program skips glowing objects for shadow rays)
__device__ TraceR traceAll(vec3f ro, vec3f rd, f32 tmax, bool shadow) {
  TraceR r{};
  r.t = tmax; r.obj = -1;
  const vec4f cnt = U(19);
  const i32 nObj = i32(cnt.x), nB = i32(cnt.z);
  for (i32 i = nB; i < nObj; i++) {
    if (shadow && (i32(oRow(i, 0).w) & 1) != 0) continue;
    const f32 t = hitObj(i, ro, rd, r.t);
    if (t < r.t) { r.t = t; r.obj = i; }
  }
  if (nB == 0 || (shadow && r.obj >= 0)) return r;   // occluded() only asks whether anything was hit
  unsigned p0 = __float_as_uint(r.t), p1 = ~0u, p2 = ~0u, p3 = 0u, p4 = 0u;
  unsigned p5 = __float_as_uint(gTau), p6 = __float_as_uint(gTime), p7 = shadow ? 1u : 0u;
  optixTrace(params.ias, make_float3(ro.x, ro.y, ro.z), make_float3(rd.x, rd.y, rd.z),
             EPS, r.t,                                         // tmin = EPS: hitMesh ignores hits closer than EPS
             fminf(fmaxf(gTau, 0.0f), 1.0f),                   // ray time = shutter τ (moving meshes' SRT keys span [0, 1])
             shadow ? CANDELA_MASK_SHADOW : (CANDELA_MASK_CAMERA | CANDELA_MASK_SHADOW),
             shadow ? OPTIX_RAY_FLAG_TERMINATE_ON_FIRST_HIT : OPTIX_RAY_FLAG_NONE,
             0, 1, 0, p0, p1, p2, p3, p4, p5, p6, p7);
  if (p1 != ~0u) {
    r.t = __uint_as_float(p0); r.obj = (i32)p1;
    if (p2 != ~0u) { gTri = i32(oRow(r.obj, 4).y) + (i32)p2 * 7; gBary = vec2f(__uint_as_float(p3), __uint_as_float(p4)); }
  }
  return r;
}
