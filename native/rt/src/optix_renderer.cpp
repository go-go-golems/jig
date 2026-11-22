// optix_renderer.cpp — see optix_renderer.h.
#include "optix_renderer.h"

#include <optix_function_table_definition.h>
#include <optix_stack_size.h>
#include <optix_stubs.h>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>

namespace crt {

#define CU_(x)                                                                                   \
  do {                                                                                           \
    CUresult r_ = (x);                                                                           \
    if (r_ != CUDA_SUCCESS) {                                                                    \
      const char* s_ = nullptr; cuGetErrorString(r_, &s_);                                       \
      throw std::runtime_error(std::string(#x) + ": " + (s_ ? s_ : "CUDA error"));               \
    }                                                                                            \
  } while (0)
#define OX(x)                                                                                    \
  do {                                                                                           \
    OptixResult r_ = (x);                                                                        \
    if (r_ != OPTIX_SUCCESS) throw std::runtime_error(std::string(#x) + ": " + optixGetErrorName(r_) + " " + optixGetErrorString(r_) + (logBuf[0] ? std::string("\n") + logBuf : std::string())); \
  } while (0)

// the launch parameters as the device sees them (candela_optix_params.h)
struct HostParams {
  CUdeviceptr U, O, LI, BV, SD, accum, aovA, aovN;
  OptixTraversableHandle ias;
  CUdeviceptr aabbObjects;
  CUdeviceptr sphereObjects;
};

template <class T> struct SbtRecord { alignas(OPTIX_SBT_RECORD_ALIGNMENT) char header[OPTIX_SBT_RECORD_HEADER_SIZE]; T data; };
struct Empty {};

static char logBuf[8192];

OptixRenderer::OptixRenderer(CUcontext cuctx, const std::vector<char>& ir, int width, int height, bool motion, bool spheres) : motion_(motion), spheres_(spheres) {
  logBuf[0] = 0;
  OX(optixInit());
  OptixDeviceContextOptions co = {};
  co.logCallbackFunction = [](unsigned level, const char* tag, const char* msg, void*) { if (level <= 2) fprintf(stderr, "[optix %u][%s] %s\n", level, tag, msg); };
  co.logCallbackLevel = 4;
  OX(optixDeviceContextCreate(cuctx, &co, &ctx_));

  const auto tp = std::chrono::steady_clock::now();
  OptixModuleCompileOptions mco = {};
  // The whole translated path tracer runs in the raygen program, with much state live across optixTrace calls.
  // OptiX's default limit (128 registers) spills it: K-09 at 960x540, 256 spp took 2.9 s at 128, 1.5 s at 168 and
  // 0.75 s at 255 (the plain-CUDA kernel uses 155 registers and takes 0.97 s). The first module compile takes ~11 s,
  // later ones come from OptiX's disk cache. CANDELA_OPTIX_MAXREG overrides the limit for experiments.
  mco.maxRegisterCount = 255;
  if (const char* e = getenv("CANDELA_OPTIX_MAXREG")) mco.maxRegisterCount = atoi(e);
  mco.optLevel = OPTIX_COMPILE_OPTIMIZATION_LEVEL_3;
  OptixPipelineCompileOptions pco = {};
  // moving meshes: IAS → SRT motion transform → static transform → GAS, a graph of depth 4
  pco.usesMotionBlur = motion_ ? 1 : 0;
  pco.traversableGraphFlags = motion_ ? OPTIX_TRAVERSABLE_GRAPH_FLAG_ALLOW_ANY : OPTIX_TRAVERSABLE_GRAPH_FLAG_ALLOW_SINGLE_LEVEL_INSTANCING;
  pco.numPayloadValues = 8;
  pco.numAttributeValues = 2;
  pco.exceptionFlags = OPTIX_EXCEPTION_FLAG_NONE;
  pco.pipelineLaunchParamsVariableName = "params";
  pco.usesPrimitiveTypeFlags = OPTIX_PRIMITIVE_TYPE_FLAGS_TRIANGLE | OPTIX_PRIMITIVE_TYPE_FLAGS_CUSTOM | (spheres_ ? OPTIX_PRIMITIVE_TYPE_FLAGS_SPHERE : 0u);
  size_t n = sizeof logBuf;
  OX(optixModuleCreate(ctx_, &mco, &pco, ir.data(), ir.size(), logBuf, &n, &mod_));
  log_ = logBuf;
  if (spheres_) {
    OptixBuiltinISOptions bo = {};
    bo.builtinISModuleType = OPTIX_PRIMITIVE_TYPE_SPHERE;
    bo.usesMotionBlur = 0;   // no vertex motion: moving spheres stay custom primitives
    bo.buildFlags = OPTIX_BUILD_FLAG_PREFER_FAST_TRACE | OPTIX_BUILD_FLAG_ALLOW_COMPACTION;   // as buildAS builds the GAS
    OX(optixBuiltinISModuleGet(ctx_, &mco, &pco, &bo, &sphereMod_));
  }

  OptixProgramGroupOptions pgo = {};
  OptixProgramGroupDesc d[5] = {};
  d[0].kind = OPTIX_PROGRAM_GROUP_KIND_RAYGEN; d[0].raygen.module = mod_; d[0].raygen.entryFunctionName = "__raygen__candela";
  d[1].kind = OPTIX_PROGRAM_GROUP_KIND_MISS; d[1].miss.module = mod_; d[1].miss.entryFunctionName = "__miss__candela";
  d[2].kind = OPTIX_PROGRAM_GROUP_KIND_HITGROUP; d[2].hitgroup.moduleCH = mod_; d[2].hitgroup.entryFunctionNameCH = "__closesthit__triangle";
  d[3].kind = OPTIX_PROGRAM_GROUP_KIND_HITGROUP; d[3].hitgroup.moduleCH = mod_; d[3].hitgroup.entryFunctionNameCH = "__closesthit__analytic";
  d[3].hitgroup.moduleIS = mod_; d[3].hitgroup.entryFunctionNameIS = "__intersection__analytic";
  if (spheres_) {
    d[4].kind = OPTIX_PROGRAM_GROUP_KIND_HITGROUP; d[4].hitgroup.moduleCH = mod_; d[4].hitgroup.entryFunctionNameCH = "__closesthit__sphere";
    d[4].hitgroup.moduleIS = sphereMod_; d[4].hitgroup.entryFunctionNameIS = nullptr;
    nPg_ = 5;
  }
  n = sizeof logBuf;
  OX(optixProgramGroupCreate(ctx_, d, (unsigned)nPg_, &pgo, logBuf, &n, pg_));
  OptixPipelineLinkOptions plo = {};
  plo.maxTraceDepth = 1;
  n = sizeof logBuf;
  OX(optixPipelineCreate(ctx_, &pco, &plo, pg_, (unsigned)nPg_, logBuf, &n, &pipe_));
  OptixStackSizes ss = {};
  for (int g = 0; g < nPg_; g++) OX(optixUtilAccumulateStackSizes(pg_[g], &ss, pipe_));
  unsigned dcT = 0, dcS = 0, css = 0;
  OX(optixUtilComputeStackSizes(&ss, 1, 0, 0, &dcT, &dcS, &css));
  OX(optixPipelineSetStackSize(pipe_, dcT, dcS, css, motion_ ? 4 : 2));
  pipelineMs_ = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - tp).count();

  SbtRecord<Empty> rg, ms, hg[3];
  OX(optixSbtRecordPackHeader(pg_[0], &rg));
  OX(optixSbtRecordPackHeader(pg_[1], &ms));
  OX(optixSbtRecordPackHeader(pg_[2], &hg[0]));
  OX(optixSbtRecordPackHeader(pg_[3], &hg[1]));
  if (spheres_) OX(optixSbtRecordPackHeader(pg_[4], &hg[2]));
  const unsigned nHg = spheres_ ? 3 : 2;
  auto up = [&](const void* p, size_t b) { CUdeviceptr x = alloc(b); CU_(cuMemcpyHtoD(x, p, b)); return x; };
  sbt_.raygenRecord = up(&rg, sizeof rg);
  sbt_.missRecordBase = up(&ms, sizeof ms); sbt_.missRecordStrideInBytes = sizeof ms; sbt_.missRecordCount = 1;
  sbt_.hitgroupRecordBase = up(hg, nHg * sizeof hg[0]); sbt_.hitgroupRecordStrideInBytes = sizeof hg[0]; sbt_.hitgroupRecordCount = nHg;

  allocImages(width, height);
  params_ = alloc(sizeof(HostParams));
}

OptixRenderer::~OptixRenderer() {
  for (CUdeviceptr p : meshBuffers_) cuMemFree(p);
  for (CUdeviceptr p : frameBuffers_) cuMemFree(p);
  for (CUdeviceptr p : {U_, O_, LI_, BV_, SD_, aabbObj_, sphereObj_, params_, sbt_.raygenRecord, sbt_.missRecordBase, sbt_.hitgroupRecordBase}) if (p) cuMemFree(p);
  if (pipe_) optixPipelineDestroy(pipe_);
  for (auto g : pg_) if (g) optixProgramGroupDestroy(g);
  if (mod_) optixModuleDestroy(mod_);
  if (sphereMod_) optixModuleDestroy(sphereMod_);
  if (ctx_) optixDeviceContextDestroy(ctx_);
}

CUdeviceptr OptixRenderer::alloc(size_t bytes) { CUdeviceptr p = 0; CU_(cuMemAlloc(&p, bytes < 16 ? 16 : bytes)); return p; }
void OptixRenderer::put(CUdeviceptr& p, size_t& cap, const void* data, size_t bytes) {
  const size_t b = bytes < 16 ? 16 : bytes;
  if (b > cap) { if (p) cuMemFree(p); p = alloc(b); cap = b; }
  if (bytes) CU_(cuMemcpyHtoD(p, data, bytes));
}

// build and compact one acceleration structure; its buffer is kept for the renderer's lifetime
OptixTraversableHandle OptixRenderer::buildAS(const OptixBuildInput& in, unsigned flags, std::vector<CUdeviceptr>& keep) {
  OptixAccelBuildOptions o = {};
  o.buildFlags = flags | OPTIX_BUILD_FLAG_ALLOW_COMPACTION;
  o.operation = OPTIX_BUILD_OPERATION_BUILD;
  OptixAccelBufferSizes sz;
  OX(optixAccelComputeMemoryUsage(ctx_, &o, &in, 1, &sz));
  CUdeviceptr tmp = alloc(sz.tempSizeInBytes), out = alloc(sz.outputSizeInBytes), csz = alloc(8);
  OptixAccelEmitDesc emit = {}; emit.type = OPTIX_PROPERTY_TYPE_COMPACTED_SIZE; emit.result = csz;
  OptixTraversableHandle h;
  OX(optixAccelBuild(ctx_, 0, &o, &in, 1, tmp, sz.tempSizeInBytes, out, sz.outputSizeInBytes, &h, &emit, 1));
  uint64_t compacted = 0;
  CU_(cuMemcpyDtoH(&compacted, csz, 8));
  cuMemFree(tmp); cuMemFree(csz);
  if (compacted && compacted < sz.outputSizeInBytes) {
    CUdeviceptr small = alloc(compacted);
    OX(optixAccelCompact(ctx_, 0, h, small, compacted, &h));
    CU_(cuCtxSynchronize());
    cuMemFree(out); out = small;
  } else compacted = sz.outputSizeInBytes;
  gasBytes_ += compacted;
  keep.push_back(out);
  return h;
}

void OptixRenderer::buildMeshes(const std::vector<OptixMeshInput>& meshes) {
  const auto t0 = std::chrono::steady_clock::now();
  for (CUdeviceptr p : meshBuffers_) cuMemFree(p);
  meshBuffers_.clear(); gasBytes_ = 0;
  // one GAS per mesh: non-indexed triangles in record order, any-hit disabled (opaque)
  gas_.assign(meshes.size(), 0);
  for (size_t m = 0; m < meshes.size(); m++) {
    if (!meshes[m].count) continue;
    CUdeviceptr vb = alloc(meshes[m].vertices.size_bytes());
    CU_(cuMemcpyHtoD(vb, meshes[m].vertices.data(), meshes[m].vertices.size_bytes()));
    OptixBuildInput bi = {};
    bi.type = OPTIX_BUILD_INPUT_TYPE_TRIANGLES;
    auto& t = bi.triangleArray;
    t.vertexFormat = OPTIX_VERTEX_FORMAT_FLOAT3; t.vertexStrideInBytes = 12; t.numVertices = meshes[m].count * 3; t.vertexBuffers = &vb;
    unsigned flags[1] = {OPTIX_GEOMETRY_FLAG_DISABLE_ANYHIT};
    t.flags = flags; t.numSbtRecords = 1;
    gas_[m] = buildAS(bi, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE, meshBuffers_);
    cuMemFree(vb);
  }
  meshBytes_ = gasBytes_;
  meshMs_ = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  buildMs_ = meshMs_;
}

// device layout of one moving instance's transforms: a static transform (frame-time matrix) and, after it, an SRT
// motion transform with `keys` keys whose child is the static transform; both 64-byte aligned
static size_t align64(size_t b) { return (b + OPTIX_TRANSFORM_BYTE_ALIGNMENT - 1) / OPTIX_TRANSFORM_BYTE_ALIGNMENT * OPTIX_TRANSFORM_BYTE_ALIGNMENT; }

void OptixRenderer::setFrame(std::span<const float> instances, std::span<const float> srt, int keys, std::span<const float> aabbs, std::span<const int> aabbObjects,
                             std::span<const float> spheres, std::span<const int> sphereObjects, int glowSpheres) {
  const auto t0 = std::chrono::steady_clock::now();
  for (CUdeviceptr p : frameBuffers_) cuMemFree(p);
  frameBuffers_.clear(); gasBytes_ = meshBytes_;
  // motion transforms, one pair per motion slot
  const size_t stBytes = align64(sizeof(OptixStaticTransform));
  const size_t mtBytes = keys >= 2 ? align64(sizeof(OptixSRTMotionTransform) + size_t(keys - 2) * sizeof(OptixSRTData)) : 0;
  const size_t slotFloats = keys >= 2 ? 12 + 16 * size_t(keys) : 0;
  const size_t slots = slotFloats ? srt.size() / slotFloats : 0;
  if (slots && !motion_) throw std::runtime_error("OptixRenderer: motion transforms in a pipeline built without motion");
  std::vector<OptixTraversableHandle> mtHandle(slots + 1, 0);
  if (slots) {
    const size_t pair = stBytes + mtBytes;
    std::vector<unsigned char> blob(pair * slots, 0);
    CUdeviceptr tb = alloc(blob.size());
    frameBuffers_.push_back(tb);
    // the instance rows name each slot's mesh
    std::vector<unsigned> slotMesh(slots + 1, 0);
    for (size_t k = 0; k + 16 <= instances.size(); k += 16) { const unsigned sl = (unsigned)instances[k + 3]; if (sl && sl <= slots) slotMesh[sl] = (unsigned)instances[k]; }
    for (size_t i = 0; i < slots; i++) {
      const float* d = &srt[i * slotFloats];
      const unsigned mesh = slotMesh[i + 1];
      const CUdeviceptr stAddr = tb + i * pair, mtAddr = stAddr + stBytes;
      auto* st = reinterpret_cast<OptixStaticTransform*>(&blob[i * pair]);
      st->child = mesh < gas_.size() ? gas_[mesh] : 0;
      // object→world (frame time) is the inverse of the world→object rows the engine sends; OptiX wants both
      const float* m = d;   // world→object 3×4
      float inv[12];
      {
        const double a = m[0], b = m[1], c = m[2], e = m[4], f = m[5], g = m[6], i2 = m[8], j = m[9], k2 = m[10];
        const double det = a * (f * k2 - g * j) - b * (e * k2 - g * i2) + c * (e * j - f * i2);
        const double r = det != 0 ? 1.0 / det : 0.0;
        const double R[9] = {(f * k2 - g * j) * r, (c * j - b * k2) * r, (b * g - c * f) * r,
                             (g * i2 - e * k2) * r, (a * k2 - c * i2) * r, (c * e - a * g) * r,
                             (e * j - f * i2) * r, (b * i2 - a * j) * r, (a * f - b * e) * r};
        const double tx = m[3], ty = m[7], tz = m[11];
        for (int row = 0; row < 3; row++) {
          inv[row * 4] = (float)R[row * 3]; inv[row * 4 + 1] = (float)R[row * 3 + 1]; inv[row * 4 + 2] = (float)R[row * 3 + 2];
          inv[row * 4 + 3] = (float)-(R[row * 3] * tx + R[row * 3 + 1] * ty + R[row * 3 + 2] * tz);
        }
      }
      std::memcpy(st->transform, inv, sizeof inv);
      std::memcpy(st->invTransform, m, 12 * sizeof(float));
      OptixTraversableHandle stH = 0;
      OX(optixConvertPointerToTraversableHandle(ctx_, stAddr, OPTIX_TRAVERSABLE_TYPE_STATIC_TRANSFORM, &stH));
      auto* mt = reinterpret_cast<OptixSRTMotionTransform*>(&blob[i * pair + stBytes]);
      mt->child = stH;
      mt->motionOptions.numKeys = (unsigned short)keys;
      mt->motionOptions.flags = OPTIX_MOTION_FLAG_NONE;
      mt->motionOptions.timeBegin = 0.0f;   // the kernel's shutter parameter τ: the ray time is gTau
      mt->motionOptions.timeEnd = 1.0f;
      std::memcpy(mt->srtData, d + 12, size_t(keys) * sizeof(OptixSRTData));
      OX(optixConvertPointerToTraversableHandle(ctx_, mtAddr, OPTIX_TRAVERSABLE_TYPE_SRT_MOTION_TRANSFORM, &mtHandle[i + 1]));
    }
    CU_(cuMemcpyHtoD(tb, blob.data(), blob.size()));
  }
  std::vector<OptixInstance> inst;
  const float id[12] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0};
  for (size_t k = 0; k + 16 <= instances.size(); k += 16) {
    const float* r = &instances[k];
    const unsigned mesh = (unsigned)r[0], slot = (unsigned)r[3];
    if (mesh >= gas_.size() || !gas_[mesh]) continue;
    OptixInstance o = {};
    o.instanceId = (unsigned)r[1];
    o.visibilityMask = (unsigned)r[2];
    o.sbtOffset = 0;
    o.flags = OPTIX_INSTANCE_FLAG_NONE;
    if (slot && slot <= slots) { std::memcpy(o.transform, id, sizeof id); o.traversableHandle = mtHandle[slot]; }
    else { std::memcpy(o.transform, r + 4, 12 * sizeof(float)); o.traversableHandle = gas_[mesh]; }
    inst.push_back(o);
  }
  // analytic objects: one GAS of custom primitives in world space (hitObj applies each object's transform)
  const unsigned nA = (unsigned)aabbObjects.size();
  put(aabbObj_, capAO_, aabbObjects.data(), aabbObjects.size_bytes());
  if (nA) {
    CUdeviceptr ab = alloc(aabbs.size_bytes());
    CU_(cuMemcpyHtoD(ab, aabbs.data(), aabbs.size_bytes()));
    OptixBuildInput bi = {};
    bi.type = OPTIX_BUILD_INPUT_TYPE_CUSTOM_PRIMITIVES;
    auto& c = bi.customPrimitiveArray;
    c.aabbBuffers = &ab; c.numPrimitives = nA; c.strideInBytes = sizeof(OptixAabb);
    unsigned flags[1] = {OPTIX_GEOMETRY_FLAG_DISABLE_ANYHIT};
    c.flags = flags; c.numSbtRecords = 1;
    OptixTraversableHandle h = buildAS(bi, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE, frameBuffers_);
    cuMemFree(ab);
    OptixInstance o = {};
    std::memcpy(o.transform, id, sizeof id);
    o.instanceId = 0; o.visibilityMask = 3; o.sbtOffset = 1; o.flags = OPTIX_INSTANCE_FLAG_NONE; o.traversableHandle = h;
    inst.push_back(o);
  }
  // built-in spheres: world centre + radius; shadow-casting ones (mask camera|shadow) and glowing ones (camera only,
  // as traceAll skips flags & 1 for shadow rays) in two GASes; primitiveIndexOffset continues the numbering, so the
  // closest-hit program indexes sphereObjects with optixGetPrimitiveIndex() for both
  const unsigned nS = (unsigned)sphereObjects.size();
  if (nS && !spheres_) throw std::runtime_error("OptixRenderer: spheres in a pipeline built without the sphere intersector");
  put(sphereObj_, capSO_, sphereObjects.data(), sphereObjects.size_bytes());
  if (nS) {
    std::vector<float> c(size_t(nS) * 3), r(nS);
    for (unsigned i = 0; i < nS; i++) { c[i * 3] = spheres[i * 4]; c[i * 3 + 1] = spheres[i * 4 + 1]; c[i * 3 + 2] = spheres[i * 4 + 2]; r[i] = spheres[i * 4 + 3]; }
    CUdeviceptr cb = alloc(c.size() * 4), rb = alloc(r.size() * 4);
    CU_(cuMemcpyHtoD(cb, c.data(), c.size() * 4)); CU_(cuMemcpyHtoD(rb, r.data(), r.size() * 4));
    const unsigned nSolid = nS - (unsigned)glowSpheres;
    for (int part = 0; part < 2; part++) {
      const unsigned first = part ? nSolid : 0, count = part ? (unsigned)glowSpheres : nSolid;
      if (!count) continue;
      CUdeviceptr vb = cb + size_t(first) * 12, wb = rb + size_t(first) * 4;
      OptixBuildInput bi = {};
      bi.type = OPTIX_BUILD_INPUT_TYPE_SPHERES;
      auto& s = bi.sphereArray;
      s.vertexBuffers = &vb; s.numVertices = count; s.radiusBuffers = &wb; s.singleRadius = 0;
      unsigned flags[1] = {OPTIX_GEOMETRY_FLAG_DISABLE_ANYHIT};
      s.flags = flags; s.numSbtRecords = 1; s.primitiveIndexOffset = first;
      OptixTraversableHandle h = buildAS(bi, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE, frameBuffers_);
      OptixInstance o = {};
      std::memcpy(o.transform, id, sizeof id);
      o.instanceId = 0; o.visibilityMask = part ? 1u : 3u; o.sbtOffset = 2; o.flags = OPTIX_INSTANCE_FLAG_NONE; o.traversableHandle = h;
      inst.push_back(o);
    }
    cuMemFree(cb); cuMemFree(rb);
  }
  ias_ = 0;
  if (!inst.empty()) {
    CUdeviceptr ib = alloc(inst.size() * sizeof(OptixInstance));
    CU_(cuMemcpyHtoD(ib, inst.data(), inst.size() * sizeof(OptixInstance)));
    OptixBuildInput ii = {};
    ii.type = OPTIX_BUILD_INPUT_TYPE_INSTANCES;
    ii.instanceArray.instances = ib; ii.instanceArray.numInstances = (unsigned)inst.size();
    ias_ = buildAS(ii, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE, frameBuffers_);
    cuMemFree(ib);
  }
  CU_(cuCtxSynchronize());
  frameMs_ = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  buildMs_ = meshMs_ + frameMs_;
  meshMs_ = 0;   // later frames report only their own build
}

void OptixRenderer::upload(std::span<const float> O, std::span<const float> LI, std::span<const float> BV, std::span<const float> SD) {
  put(O_, capO_, O.data(), O.size_bytes()); put(LI_, capLI_, LI.data(), LI.size_bytes());
  put(BV_, capBV_, BV.data(), BV.size_bytes()); put(SD_, capSD_, SD.data(), SD.size_bytes());
}

void OptixRenderer::launch(std::span<const float> U) {
  put(U_, capU_, U.data(), U.size_bytes());
  HostParams p = {U_, O_, LI_, BV_, SD_, acc_, aovA_, aovN_, ias_, aabbObj_, sphereObj_};
  CU_(cuMemcpyHtoD(params_, &p, sizeof p));
  logBuf[0] = 0;
  OX(optixLaunch(pipe_, 0, params_, sizeof p, &sbt_, (unsigned)w_, (unsigned)h_, 1));
}

}  // namespace crt
