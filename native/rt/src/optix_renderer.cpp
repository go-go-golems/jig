// optix_renderer.cpp — see optix_renderer.h.
#include "optix_renderer.h"

#include <optix_function_table_definition.h>
#include <optix_stack_size.h>
#include <optix_stubs.h>

#include <chrono>
#include <cstdio>
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
};

template <class T> struct SbtRecord { alignas(OPTIX_SBT_RECORD_ALIGNMENT) char header[OPTIX_SBT_RECORD_HEADER_SIZE]; T data; };
struct Empty {};

static char logBuf[8192];

OptixRenderer::OptixRenderer(CUcontext cuctx, const std::vector<char>& ir, int width, int height) : w_(width), h_(height) {
  logBuf[0] = 0;
  OX(optixInit());
  OptixDeviceContextOptions co = {};
  co.logCallbackFunction = [](unsigned level, const char* tag, const char* msg, void*) { if (level <= 2) fprintf(stderr, "[optix %u][%s] %s\n", level, tag, msg); };
  co.logCallbackLevel = 4;
  OX(optixDeviceContextCreate(cuctx, &co, &ctx_));

  OptixModuleCompileOptions mco = {};
  OptixPipelineCompileOptions pco = {};
  pco.usesMotionBlur = 0;
  pco.traversableGraphFlags = OPTIX_TRAVERSABLE_GRAPH_FLAG_ALLOW_SINGLE_LEVEL_INSTANCING;
  pco.numPayloadValues = 8;
  pco.numAttributeValues = 2;
  pco.exceptionFlags = OPTIX_EXCEPTION_FLAG_NONE;
  pco.pipelineLaunchParamsVariableName = "params";
  pco.usesPrimitiveTypeFlags = OPTIX_PRIMITIVE_TYPE_FLAGS_TRIANGLE | OPTIX_PRIMITIVE_TYPE_FLAGS_CUSTOM;
  size_t n = sizeof logBuf;
  OX(optixModuleCreate(ctx_, &mco, &pco, ir.data(), ir.size(), logBuf, &n, &mod_));
  log_ = logBuf;

  OptixProgramGroupOptions pgo = {};
  OptixProgramGroupDesc d[4] = {};
  d[0].kind = OPTIX_PROGRAM_GROUP_KIND_RAYGEN; d[0].raygen.module = mod_; d[0].raygen.entryFunctionName = "__raygen__candela";
  d[1].kind = OPTIX_PROGRAM_GROUP_KIND_MISS; d[1].miss.module = mod_; d[1].miss.entryFunctionName = "__miss__candela";
  d[2].kind = OPTIX_PROGRAM_GROUP_KIND_HITGROUP; d[2].hitgroup.moduleCH = mod_; d[2].hitgroup.entryFunctionNameCH = "__closesthit__triangle";
  d[3].kind = OPTIX_PROGRAM_GROUP_KIND_HITGROUP; d[3].hitgroup.moduleCH = mod_; d[3].hitgroup.entryFunctionNameCH = "__closesthit__analytic";
  d[3].hitgroup.moduleIS = mod_; d[3].hitgroup.entryFunctionNameIS = "__intersection__analytic";
  n = sizeof logBuf;
  OX(optixProgramGroupCreate(ctx_, d, 4, &pgo, logBuf, &n, pg_));
  OptixPipelineLinkOptions plo = {};
  plo.maxTraceDepth = 1;
  n = sizeof logBuf;
  OX(optixPipelineCreate(ctx_, &pco, &plo, pg_, 4, logBuf, &n, &pipe_));
  OptixStackSizes ss = {};
  for (auto& g : pg_) OX(optixUtilAccumulateStackSizes(g, &ss, pipe_));
  unsigned dcT = 0, dcS = 0, css = 0;
  OX(optixUtilComputeStackSizes(&ss, 1, 0, 0, &dcT, &dcS, &css));
  OX(optixPipelineSetStackSize(pipe_, dcT, dcS, css, 2));

  SbtRecord<Empty> rg, ms, hg[2];
  OX(optixSbtRecordPackHeader(pg_[0], &rg));
  OX(optixSbtRecordPackHeader(pg_[1], &ms));
  OX(optixSbtRecordPackHeader(pg_[2], &hg[0]));
  OX(optixSbtRecordPackHeader(pg_[3], &hg[1]));
  auto up = [&](const void* p, size_t b) { CUdeviceptr x = alloc(b); CU_(cuMemcpyHtoD(x, p, b)); return x; };
  sbt_.raygenRecord = up(&rg, sizeof rg);
  sbt_.missRecordBase = up(&ms, sizeof ms); sbt_.missRecordStrideInBytes = sizeof ms; sbt_.missRecordCount = 1;
  sbt_.hitgroupRecordBase = up(hg, sizeof hg); sbt_.hitgroupRecordStrideInBytes = sizeof hg[0]; sbt_.hitgroupRecordCount = 2;

  const size_t img = size_t(w_) * h_ * 16;
  acc_ = alloc(img); aovA_ = alloc(img); aovN_ = alloc(img);
  CU_(cuMemsetD8(acc_, 0, img)); CU_(cuMemsetD8(aovA_, 0, img)); CU_(cuMemsetD8(aovN_, 0, img));
  params_ = alloc(sizeof(HostParams));
}

OptixRenderer::~OptixRenderer() {
  for (CUdeviceptr p : asBuffers_) cuMemFree(p);
  for (CUdeviceptr p : {U_, O_, LI_, BV_, SD_, acc_, aovA_, aovN_, aabbObj_, params_, sbt_.raygenRecord, sbt_.missRecordBase, sbt_.hitgroupRecordBase}) if (p) cuMemFree(p);
  if (pipe_) optixPipelineDestroy(pipe_);
  for (auto g : pg_) if (g) optixProgramGroupDestroy(g);
  if (mod_) optixModuleDestroy(mod_);
  if (ctx_) optixDeviceContextDestroy(ctx_);
}

CUdeviceptr OptixRenderer::alloc(size_t bytes) { CUdeviceptr p = 0; CU_(cuMemAlloc(&p, bytes < 16 ? 16 : bytes)); return p; }
void OptixRenderer::put(CUdeviceptr& p, size_t& cap, const void* data, size_t bytes) {
  const size_t b = bytes < 16 ? 16 : bytes;
  if (b > cap) { if (p) cuMemFree(p); p = alloc(b); cap = b; }
  if (bytes) CU_(cuMemcpyHtoD(p, data, bytes));
}

// build and compact one acceleration structure; its buffer is kept for the renderer's lifetime
OptixTraversableHandle OptixRenderer::buildAS(const OptixBuildInput& in, unsigned flags, CUdeviceptr* outBuf) {
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
  asBuffers_.push_back(out);
  *outBuf = out;
  return h;
}

void OptixRenderer::buildScene(const std::vector<OptixMeshInput>& meshes, std::span<const float> instances, std::span<const float> aabbs, std::span<const int> aabbObjects) {
  const auto t0 = std::chrono::steady_clock::now();
  CUdeviceptr out;
  // one GAS per mesh: non-indexed triangles in record order, any-hit disabled (opaque)
  std::vector<OptixTraversableHandle> gas(meshes.size(), 0);
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
    gas[m] = buildAS(bi, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE, &out);
    cuMemFree(vb);
  }
  std::vector<OptixInstance> inst;
  for (size_t k = 0; k + 16 <= instances.size(); k += 16) {
    const float* r = &instances[k];
    const unsigned mesh = (unsigned)r[0];
    if (mesh >= gas.size() || !gas[mesh]) continue;
    OptixInstance o = {};
    std::memcpy(o.transform, r + 4, 12 * sizeof(float));
    o.instanceId = (unsigned)r[1];
    o.visibilityMask = (unsigned)r[2];
    o.sbtOffset = 0;
    o.flags = OPTIX_INSTANCE_FLAG_NONE;
    o.traversableHandle = gas[mesh];
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
    OptixTraversableHandle h = buildAS(bi, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE, &out);
    cuMemFree(ab);
    OptixInstance o = {};
    const float id[12] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0};
    std::memcpy(o.transform, id, sizeof id);
    o.instanceId = 0; o.visibilityMask = 3; o.sbtOffset = 1; o.flags = OPTIX_INSTANCE_FLAG_NONE; o.traversableHandle = h;
    inst.push_back(o);
  }
  ias_ = 0;
  if (!inst.empty()) {
    CUdeviceptr ib = alloc(inst.size() * sizeof(OptixInstance));
    CU_(cuMemcpyHtoD(ib, inst.data(), inst.size() * sizeof(OptixInstance)));
    OptixBuildInput ii = {};
    ii.type = OPTIX_BUILD_INPUT_TYPE_INSTANCES;
    ii.instanceArray.instances = ib; ii.instanceArray.numInstances = (unsigned)inst.size();
    ias_ = buildAS(ii, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE, &out);
    cuMemFree(ib);
  }
  CU_(cuCtxSynchronize());
  buildMs_ = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
}

void OptixRenderer::upload(std::span<const float> O, std::span<const float> LI, std::span<const float> BV, std::span<const float> SD) {
  put(O_, capO_, O.data(), O.size_bytes()); put(LI_, capLI_, LI.data(), LI.size_bytes());
  put(BV_, capBV_, BV.data(), BV.size_bytes()); put(SD_, capSD_, SD.data(), SD.size_bytes());
}

void OptixRenderer::launch(std::span<const float> U) {
  put(U_, capU_, U.data(), U.size_bytes());
  HostParams p = {U_, O_, LI_, BV_, SD_, acc_, aovA_, aovN_, ias_, aabbObj_};
  CU_(cuMemcpyHtoD(params_, &p, sizeof p));
  logBuf[0] = 0;
  OX(optixLaunch(pipe_, 0, params_, sizeof p, &sbt_, (unsigned)w_, (unsigned)h_, 1));
}
void OptixRenderer::sync() { CU_(cuCtxSynchronize()); }
std::vector<float> OptixRenderer::readAccum() { sync(); std::vector<float> v(size_t(w_) * h_ * 4); CU_(cuMemcpyDtoH(v.data(), acc_, v.size() * 4)); return v; }
std::vector<float> OptixRenderer::readAlbedo() { sync(); std::vector<float> v(size_t(w_) * h_ * 4); CU_(cuMemcpyDtoH(v.data(), aovA_, v.size() * 4)); return v; }

}  // namespace crt
