// candela-optix-ao — the OptiX traversal spike (CANDELA-002 step 3): load a version-0 scene package written by
// scripts/scene-package.ts, build one GAS per mesh and an IAS over the instances, and run Candela's AO integrator
// (ao.cu) on the RT cores. Prints full-frame samples per second (comparable to the WebGPU renderer's spp/s) and
// rays per second, and writes the mean AO as an uncompressed float EXR.
//
//   candela-optix-ao <package-dir> [--spp 1024] [--per-launch 16] [--radius 0.05] [--out ao.exr] [--size WxH]
#include <optix.h>
#include <optix_function_table_definition.h>
#include <optix_stack_size.h>
#include <optix_stubs.h>
#include <cuda_runtime.h>
#include <nlohmann/json.hpp>

#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "params.h"

#define CUDA_CHECK(x) do { cudaError_t e_ = (x); if (e_ != cudaSuccess) { throw std::runtime_error(std::string(#x) + ": " + cudaGetErrorString(e_)); } } while (0)
#define OPTIX_CHECK(x) do { OptixResult r_ = (x); if (r_ != OPTIX_SUCCESS) { throw std::runtime_error(std::string(#x) + ": " + optixGetErrorName(r_) + " " + optixGetErrorString(r_)); } } while (0)

using json = nlohmann::json;

static std::string readFile(const std::string& p) {
  std::ifstream f(p, std::ios::binary);
  if (!f) throw std::runtime_error("cannot read " + p);
  std::stringstream s; s << f.rdbuf(); return s.str();
}

template <class T> struct SbtRecord { __align__(OPTIX_SBT_RECORD_ALIGNMENT) char header[OPTIX_SBT_RECORD_HEADER_SIZE]; T data; };
struct Empty {};

static CUdeviceptr upload(const void* data, size_t bytes) {
  CUdeviceptr p = 0; CUDA_CHECK(cudaMalloc(reinterpret_cast<void**>(&p), bytes));
  if (data) CUDA_CHECK(cudaMemcpy(reinterpret_cast<void*>(p), data, bytes, cudaMemcpyHostToDevice));
  return p;
}

// build (and compact) an acceleration structure
static OptixTraversableHandle buildAS(OptixDeviceContext ctx, const OptixBuildInput& in, unsigned flags, size_t* outBytes) {
  OptixAccelBuildOptions o = {};
  o.buildFlags = flags | OPTIX_BUILD_FLAG_ALLOW_COMPACTION;
  o.operation = OPTIX_BUILD_OPERATION_BUILD;
  OptixAccelBufferSizes sz;
  OPTIX_CHECK(optixAccelComputeMemoryUsage(ctx, &o, &in, 1, &sz));
  CUdeviceptr tmp = upload(nullptr, sz.tempSizeInBytes), out = upload(nullptr, sz.outputSizeInBytes), csz = upload(nullptr, 8);
  OptixAccelEmitDesc emit = {}; emit.type = OPTIX_PROPERTY_TYPE_COMPACTED_SIZE; emit.result = csz;
  OptixTraversableHandle h;
  OPTIX_CHECK(optixAccelBuild(ctx, 0, &o, &in, 1, tmp, sz.tempSizeInBytes, out, sz.outputSizeInBytes, &h, &emit, 1));
  uint64_t compacted = 0; CUDA_CHECK(cudaMemcpy(&compacted, reinterpret_cast<void*>(csz), 8, cudaMemcpyDeviceToHost));
  CUDA_CHECK(cudaFree(reinterpret_cast<void*>(tmp))); CUDA_CHECK(cudaFree(reinterpret_cast<void*>(csz)));
  if (compacted < sz.outputSizeInBytes) {
    CUdeviceptr small = upload(nullptr, compacted);
    OPTIX_CHECK(optixAccelCompact(ctx, 0, h, small, compacted, &h));
    CUDA_CHECK(cudaFree(reinterpret_cast<void*>(out)));
    *outBytes = compacted;
  } else *outBytes = sz.outputSizeInBytes;
  return h;
}

// uncompressed scanline EXR, float32 channels (A, B, G, R: alphabetical, as the format requires)
static void writeEXR(const std::string& path, int W, int H, const std::vector<float>& rgba, const std::string& comment) {
  std::string h;
  auto i32 = [&](int32_t v) { h.append(reinterpret_cast<char*>(&v), 4); };
  auto f32 = [&](float v) { h.append(reinterpret_cast<char*>(&v), 4); };
  auto attr = [&](const char* n, const char* t, const std::string& v) { h += n; h += '\0'; h += t; h += '\0'; i32((int32_t)v.size()); h += v; };
  const uint32_t magic = 20000630, ver = 2; h.append(reinterpret_cast<const char*>(&magic), 4); h.append(reinterpret_cast<const char*>(&ver), 4);
  std::string ch; const char* names[4] = {"A", "B", "G", "R"};
  for (auto n : names) { ch += n; ch += '\0'; int32_t pt = 2; ch.append(reinterpret_cast<char*>(&pt), 4); ch.append(4, '\0'); int32_t one = 1; ch.append(reinterpret_cast<char*>(&one), 4); ch.append(reinterpret_cast<char*>(&one), 4); }
  ch += '\0';
  std::string box; int32_t b[4] = {0, 0, W - 1, H - 1}; box.append(reinterpret_cast<char*>(b), 16);
  float par = 1.f, swc[2] = {0.f, 0.f}, sww = 1.f;
  attr("channels", "chlist", ch);
  attr("comments", "string", comment);
  attr("compression", "compression", std::string(1, '\0'));
  attr("dataWindow", "box2i", box);
  attr("displayWindow", "box2i", box);
  attr("lineOrder", "lineOrder", std::string(1, '\0'));
  attr("pixelAspectRatio", "float", std::string(reinterpret_cast<char*>(&par), 4));
  attr("screenWindowCenter", "v2f", std::string(reinterpret_cast<char*>(swc), 8));
  attr("screenWindowWidth", "float", std::string(reinterpret_cast<char*>(&sww), 4));
  h += '\0';
  const size_t lineBytes = 8 + (size_t)W * 4 * 4;
  uint64_t off = h.size() + (uint64_t)H * 8;
  for (int y = 0; y < H; y++) { h.append(reinterpret_cast<char*>(&off), 8); off += lineBytes; }
  std::ofstream f(path, std::ios::binary); f.write(h.data(), h.size());
  std::vector<float> line((size_t)W * 4);
  const int order[4] = {3, 2, 1, 0};   // A B G R from rgba
  for (int y = 0; y < H; y++) {
    int32_t yy = y, n = W * 4 * 4; f.write(reinterpret_cast<char*>(&yy), 4); f.write(reinterpret_cast<char*>(&n), 4);
    for (int c = 0; c < 4; c++) for (int x = 0; x < W; x++) line[(size_t)c * W + x] = rgba[((size_t)y * W + x) * 4 + order[c]];
    f.write(reinterpret_cast<char*>(line.data()), line.size() * 4);
  }
  (void)f32;
}

int main(int argc, char** argv) try {
  if (argc < 2) { fprintf(stderr, "usage: candela-optix-ao <package-dir> [--spp N] [--per-launch k] [--radius r] [--out f.exr] [--size WxH]\n"); return 1; }
  std::string dir = argv[1], out = "ao.exr"; unsigned spp = 1024, perLaunch = 16; float radius = 0.05f; int W = 0, H = 0;
  for (int i = 2; i + 1 < argc; i += 2) {
    std::string k = argv[i], v = argv[i + 1];
    if (k == "--spp") spp = std::stoul(v); else if (k == "--per-launch") perLaunch = std::stoul(v);
    else if (k == "--radius") radius = std::stof(v); else if (k == "--out") out = v;
    else if (k == "--size") sscanf(v.c_str(), "%dx%d", &W, &H);
    else throw std::runtime_error("unknown option " + k);
  }
  const json S = json::parse(readFile(dir + "/scene.json"));
  if (S.value("format", "") != "candela-scene-package" || S.value("version", -1) != 0) throw std::runtime_error("not a version-0 Candela scene package");
  const std::string geo = readFile(dir + "/geometry.bin");
  const json& cam = S["camera"];
  if (!W) { W = cam["width"]; H = cam["height"]; }
  if (W != (int)cam["width"] || H != (int)cam["height"]) fprintf(stderr, "note: --size differs from the package's camera aspect; the image is stretched\n");

  CUDA_CHECK(cudaFree(nullptr));
  OPTIX_CHECK(optixInit());
  OptixDeviceContextOptions co = {};
  co.logCallbackFunction = [](unsigned level, const char* tag, const char* msg, void*) { if (level <= 2) fprintf(stderr, "[optix %u][%s] %s\n", level, tag, msg); };
  co.logCallbackLevel = 4;
  OptixDeviceContext ctx; OPTIX_CHECK(optixDeviceContextCreate(nullptr, &co, &ctx));
  cudaDeviceProp prop; CUDA_CHECK(cudaGetDeviceProperties(&prop, 0));
  printf("device %s (sm_%d%d), OptiX %d.%d.%d\n", prop.name, prop.major, prop.minor, OPTIX_VERSION / 10000, (OPTIX_VERSION % 10000) / 100, OPTIX_VERSION % 100);

  // ---- geometry: one GAS per mesh (non-indexed triangles), one IAS over the instances ----
  auto t0 = std::chrono::steady_clock::now();
  std::vector<OptixTraversableHandle> gas; size_t gasBytes = 0;
  for (const auto& m : S["meshes"]) {
    const size_t tris = m["triangles"], off = m["offset"];
    CUdeviceptr vb = upload(geo.data() + off * 36, tris * 36);
    OptixBuildInput bi = {}; bi.type = OPTIX_BUILD_INPUT_TYPE_TRIANGLES;
    auto& t = bi.triangleArray;
    t.vertexFormat = OPTIX_VERTEX_FORMAT_FLOAT3; t.vertexStrideInBytes = 12; t.numVertices = (unsigned)(tris * 3); t.vertexBuffers = &vb;
    unsigned flags[1] = {OPTIX_GEOMETRY_FLAG_DISABLE_ANYHIT}; t.flags = flags; t.numSbtRecords = 1;
    size_t bytes; gas.push_back(buildAS(ctx, bi, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE | OPTIX_BUILD_FLAG_ALLOW_RANDOM_VERTEX_ACCESS, &bytes));
    gasBytes += bytes;
    // the vertex buffer is kept alive: optixGetTriangleVertexData reads the GAS, not this buffer, but freeing is not
    // needed for a one-shot benchmark
  }
  std::vector<OptixInstance> inst;
  for (const auto& I : S["instances"]) {
    OptixInstance o = {};
    for (int k = 0; k < 12; k++) o.transform[k] = I["transform"][k];
    o.instanceId = (unsigned)inst.size(); o.sbtOffset = 0; o.visibilityMask = 255; o.flags = OPTIX_INSTANCE_FLAG_NONE;
    o.traversableHandle = gas[(size_t)I["mesh"]];
    inst.push_back(o);
  }
  CUdeviceptr ib = upload(inst.data(), inst.size() * sizeof(OptixInstance));
  OptixBuildInput ii = {}; ii.type = OPTIX_BUILD_INPUT_TYPE_INSTANCES; ii.instanceArray.instances = ib; ii.instanceArray.numInstances = (unsigned)inst.size();
  size_t iasBytes; OptixTraversableHandle ias = buildAS(ctx, ii, OPTIX_BUILD_FLAG_PREFER_FAST_TRACE, &iasBytes);
  CUDA_CHECK(cudaDeviceSynchronize());
  const double buildMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  printf("scene %s t=%g: %zu meshes, %zu instances, %d triangles; GAS %.1f KiB, IAS %.1f KiB, built in %.1f ms\n",
         S.value("preset", "?").c_str(), (double)S.value("time", 0.0), gas.size(), inst.size(), (int)S["triangles"], gasBytes / 1024.0, iasBytes / 1024.0, buildMs);

  // ---- module, program groups, pipeline ----
  OptixModuleCompileOptions mco = {};
  OptixPipelineCompileOptions pco = {};
  pco.usesMotionBlur = 0;
  pco.traversableGraphFlags = OPTIX_TRAVERSABLE_GRAPH_FLAG_ALLOW_SINGLE_LEVEL_INSTANCING;
  pco.numPayloadValues = 4; pco.numAttributeValues = 2;
  pco.exceptionFlags = OPTIX_EXCEPTION_FLAG_NONE;
  pco.pipelineLaunchParamsVariableName = "params";
  pco.usesPrimitiveTypeFlags = OPTIX_PRIMITIVE_TYPE_FLAGS_TRIANGLE;
  const std::string ir = readFile(AO_OPTIXIR);
  char log[4096]; size_t logN = sizeof(log);
  OptixModule mod; OPTIX_CHECK(optixModuleCreate(ctx, &mco, &pco, ir.data(), ir.size(), log, &logN, &mod));
  OptixProgramGroupOptions pgo = {};
  OptixProgramGroupDesc d[4] = {};
  d[0].kind = OPTIX_PROGRAM_GROUP_KIND_RAYGEN; d[0].raygen.module = mod; d[0].raygen.entryFunctionName = "__raygen__ao";
  d[1].kind = OPTIX_PROGRAM_GROUP_KIND_MISS; d[1].miss.module = mod; d[1].miss.entryFunctionName = "__miss__camera";
  d[2].kind = OPTIX_PROGRAM_GROUP_KIND_MISS; d[2].miss.module = mod; d[2].miss.entryFunctionName = "__miss__shadow";
  d[3].kind = OPTIX_PROGRAM_GROUP_KIND_HITGROUP; d[3].hitgroup.moduleCH = mod; d[3].hitgroup.entryFunctionNameCH = "__closesthit__camera";
  OptixProgramGroup pg[4]; logN = sizeof(log);
  OPTIX_CHECK(optixProgramGroupCreate(ctx, d, 4, &pgo, log, &logN, pg));
  OptixPipelineLinkOptions plo = {}; plo.maxTraceDepth = 1;
  OptixPipeline pipe; logN = sizeof(log);
  OPTIX_CHECK(optixPipelineCreate(ctx, &pco, &plo, pg, 4, log, &logN, &pipe));
  OptixStackSizes ss = {};
  for (auto& g : pg) OPTIX_CHECK(optixUtilAccumulateStackSizes(g, &ss, pipe));
  unsigned dcT, dcS, css;
  OPTIX_CHECK(optixUtilComputeStackSizes(&ss, 1, 0, 0, &dcT, &dcS, &css));
  OPTIX_CHECK(optixPipelineSetStackSize(pipe, dcT, dcS, css, 2));

  // ---- shader binding table: raygen, two misses, two hit records (camera, shadow) ----
  SbtRecord<Empty> rg, ms[2], hg[2];
  OPTIX_CHECK(optixSbtRecordPackHeader(pg[0], &rg));
  OPTIX_CHECK(optixSbtRecordPackHeader(pg[1], &ms[0])); OPTIX_CHECK(optixSbtRecordPackHeader(pg[2], &ms[1]));
  OPTIX_CHECK(optixSbtRecordPackHeader(pg[3], &hg[0])); OPTIX_CHECK(optixSbtRecordPackHeader(pg[3], &hg[1]));
  OptixShaderBindingTable sbt = {};
  sbt.raygenRecord = upload(&rg, sizeof rg);
  sbt.missRecordBase = upload(ms, sizeof ms); sbt.missRecordStrideInBytes = sizeof(ms[0]); sbt.missRecordCount = 2;
  sbt.hitgroupRecordBase = upload(hg, sizeof hg); sbt.hitgroupRecordStrideInBytes = sizeof(hg[0]); sbt.hitgroupRecordCount = 2;

  // ---- launch ----
  LaunchParams lp = {};
  lp.width = W; lp.height = H; lp.aoRadius = radius; lp.handle = ias;
  auto f3 = [&](const char* k) { return make_float3(cam[k][0], cam[k][1], cam[k][2]); };
  lp.eye = f3("U1"); lp.right = f3("U2"); lp.up = f3("U3"); lp.fwd = f3("U4");
  lp.accum = reinterpret_cast<float4*>(upload(nullptr, (size_t)W * H * sizeof(float4)));
  CUDA_CHECK(cudaMemset(lp.accum, 0, (size_t)W * H * sizeof(float4)));
  CUdeviceptr dp = upload(nullptr, sizeof lp);
  auto launch = [&](unsigned frame, unsigned n) {
    lp.frame = frame; lp.spp = n;
    CUDA_CHECK(cudaMemcpy(reinterpret_cast<void*>(dp), &lp, sizeof lp, cudaMemcpyHostToDevice));
    OPTIX_CHECK(optixLaunch(pipe, 0, dp, sizeof lp, &sbt, W, H, 1));
  };
  launch(1u << 30, 1); CUDA_CHECK(cudaDeviceSynchronize());   // warm-up (not accumulated below: cleared)
  CUDA_CHECK(cudaMemset(lp.accum, 0, (size_t)W * H * sizeof(float4)));
  cudaEvent_t e0, e1; CUDA_CHECK(cudaEventCreate(&e0)); CUDA_CHECK(cudaEventCreate(&e1));
  CUDA_CHECK(cudaEventRecord(e0));
  for (unsigned s = 0; s < spp; s += perLaunch) launch(s, std::min(perLaunch, spp - s));
  CUDA_CHECK(cudaEventRecord(e1)); CUDA_CHECK(cudaEventSynchronize(e1));
  float ms_ = 0; CUDA_CHECK(cudaEventElapsedTime(&ms_, e0, e1));

  std::vector<float> acc((size_t)W * H * 4);
  CUDA_CHECK(cudaMemcpy(acc.data(), lp.accum, acc.size() * 4, cudaMemcpyDeviceToHost));
  double hits = 0, aoSum = 0, covered = 0;
  for (size_t i = 0; i < (size_t)W * H; i++) { hits += acc[i * 4 + 3]; aoSum += acc[i * 4]; covered += acc[i * 4 + 3] > 0; }
  const double samples = (double)W * H * spp, rays = samples + hits, sec = ms_ / 1000.0;
  printf("%dx%d, %u spp (%u per launch), AO radius %g: %.1f ms → %.1f full-frame spp/s, %.0f Msamples/s, %.0f Mrays/s\n",
         W, H, spp, perLaunch, radius, ms_, spp / sec, samples / sec / 1e6, rays / sec / 1e6);
  printf("coverage %.4f, mean AO over hits %.4f, mean AO over frame %.4f\n", covered / ((double)W * H), aoSum / std::max(hits, 1.0), aoSum / samples);
  std::vector<float> img((size_t)W * H * 4);
  for (size_t i = 0; i < (size_t)W * H; i++) { const float a = acc[i * 4] / spp; img[i * 4] = img[i * 4 + 1] = img[i * 4 + 2] = a; img[i * 4 + 3] = acc[i * 4 + 3] > 0 ? 1.f : 0.f; }
  char comment[256]; snprintf(comment, sizeof comment, "candela-optix-ao · %u spp · AO radius %g", spp, radius);
  writeEXR(out, W, H, img, comment);
  printf("→ %s\n", out.c_str());
  return 0;
} catch (const std::exception& e) {
  fprintf(stderr, "error: %s\n", e.what());
  return 1;
}
