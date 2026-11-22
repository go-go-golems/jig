// optix_renderer.h — the OptiX target in candela-rt (CANDELA-002 phase 3). It takes the scene's translated program as
// OptiX-IR (wgsl2cuda with traceAll omitted + native/rt/kernels/candela_traversal.inc and candela_optix_programs.cuh),
// builds one GAS per mesh, one GAS of custom primitives for the analytic objects and an IAS over them from the
// OptixScene the engine computes (src/engine/targets/optix.ts), and launches the raygen program once per frame with
// that frame's uniforms. The storage buffers are the WebGPU target's, as on the plain-CUDA target.
#pragma once
#include <cuda.h>
#include <optix.h>

#include <span>
#include <string>
#include <vector>

namespace crt {

struct OptixMeshInput { std::span<const float> vertices; unsigned count; };   // 9 floats per triangle

class OptixRenderer {
 public:
  OptixRenderer(CUcontext ctx, const std::vector<char>& optixIR, int width, int height);
  ~OptixRenderer();
  /** acceleration structures: meshes; per mesh object [mesh, object, mask, 0, 3×4 transform]; analytic AABBs */
  void buildScene(const std::vector<OptixMeshInput>& meshes, std::span<const float> instances, std::span<const float> aabbs, std::span<const int> aabbObjects);
  void upload(std::span<const float> O, std::span<const float> LI, std::span<const float> BV, std::span<const float> SD);
  void launch(std::span<const float> U);
  void sync();
  std::vector<float> readAccum();
  std::vector<float> readAlbedo();
  double buildMs() const { return buildMs_; }
  double pipelineMs() const { return pipelineMs_; }   // optixModuleCreate (OptiX-IR → GPU code) + pipeline
  size_t gasBytes() const { return gasBytes_; }
  std::string log() const { return log_; }

 private:
  CUdeviceptr alloc(size_t bytes);
  void put(CUdeviceptr& p, size_t& cap, const void* data, size_t bytes);
  OptixTraversableHandle buildAS(const OptixBuildInput& in, unsigned flags, CUdeviceptr* out);

  OptixDeviceContext ctx_ = nullptr;
  OptixModule mod_ = nullptr;
  OptixProgramGroup pg_[4] = {};   // raygen, miss, triangle hit group, analytic hit group
  OptixPipeline pipe_ = nullptr;
  OptixShaderBindingTable sbt_ = {};
  int w_, h_;
  CUdeviceptr U_ = 0, O_ = 0, LI_ = 0, BV_ = 0, SD_ = 0, acc_ = 0, aovA_ = 0, aovN_ = 0, aabbObj_ = 0, params_ = 0;
  size_t capU_ = 0, capO_ = 0, capLI_ = 0, capBV_ = 0, capSD_ = 0, capAO_ = 0;
  std::vector<CUdeviceptr> asBuffers_;
  OptixTraversableHandle ias_ = 0;
  double buildMs_ = 0, pipelineMs_ = 0;
  size_t gasBytes_ = 0;
  std::string log_;
};

}  // namespace crt
