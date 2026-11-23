// optix_renderer.h — the OptiX target in candela-rt (CANDELA-002 phase 3). It takes the scene's translated program as
// OptiX-IR (wgsl2cuda with traceAll omitted + native/rt/kernels/candela_traversal.inc and candela_optix_programs.cuh),
// builds one GAS per mesh, one GAS of custom primitives for the analytic objects and an IAS over them from the
// OptixScene the engine computes (src/engine/targets/optix.ts), and launches the raygen program once per frame with
// that frame's uniforms. The storage buffers are the WebGPU target's, as on the plain-CUDA target.
#pragma once
#include <cuda.h>
#include <optix.h>

#include "renderer.h"

#include <span>
#include <string>
#include <vector>

namespace crt {

struct OptixMeshInput { std::span<const float> vertices; unsigned count; };   // 9 floats per triangle

class OptixRenderer : public Renderer {
 public:
  /** motion: build the pipeline for motion transforms (moving meshes blur; instance → SRT → static → GAS);
   *  spheres: include OptiX's built-in sphere intersector (phase 6) */
  OptixRenderer(CUcontext ctx, const std::vector<char>& optixIR, int width, int height, bool motion = false, bool spheres = false);
  ~OptixRenderer();
  /** once per scene: one GAS per mesh definition */
  void buildMeshes(const std::vector<OptixMeshInput>& meshes);
  /** per frame: instances [mesh, object, mask, motion slot + 1, 3×4 transform]; per motion slot 12 floats world→object
   *  + 16 per key (OptixSRTData); analytic AABBs and their objects. Rebuilds the custom GAS and the IAS. */
  void setFrame(std::span<const float> instances, std::span<const float> srt, int motionKeys, std::span<const float> aabbs, std::span<const int> aabbObjects,
                std::span<const float> spheres = {}, std::span<const int> sphereObjects = {}, int glowSpheres = 0);
  void upload(std::span<const float> O, std::span<const float> LI, std::span<const float> BV, std::span<const float> SD) override;
  void launch(std::span<const float> U) override;
  double buildMs() const { return buildMs_; }       // the last setFrame (or buildMeshes + setFrame, first frame)
  double frameBuildMs() const { return frameMs_; }
  bool motion() const { return motion_; }
  bool spheres() const { return spheres_; }
  double pipelineMs() const { return pipelineMs_; }   // optixModuleCreate (OptiX-IR → GPU code) + pipeline
  size_t gasBytes() const { return gasBytes_; }
  std::string log() const { return log_; }

 private:
  CUdeviceptr alloc(size_t bytes);
  void put(CUdeviceptr& p, size_t& cap, const void* data, size_t bytes);
  OptixTraversableHandle buildAS(const OptixBuildInput& in, unsigned flags, std::vector<CUdeviceptr>& keep);

  OptixDeviceContext ctx_ = nullptr;
  OptixModule mod_ = nullptr, sphereMod_ = nullptr;
  OptixProgramGroup pg_[5] = {};   // raygen, miss, triangle hit group, analytic hit group, sphere hit group
  int nPg_ = 4;
  OptixPipeline pipe_ = nullptr;
  OptixShaderBindingTable sbt_ = {};
  CUdeviceptr U_ = 0, O_ = 0, LI_ = 0, BV_ = 0, SD_ = 0, aabbObj_ = 0, sphereObj_ = 0, params_ = 0;
  size_t capU_ = 0, capO_ = 0, capLI_ = 0, capBV_ = 0, capSD_ = 0, capAO_ = 0, capSO_ = 0;
  std::vector<CUdeviceptr> meshBuffers_, frameBuffers_;   // mesh GASes (scene lifetime); IAS, custom GAS, transforms
  std::vector<OptixTraversableHandle> gas_;
  OptixTraversableHandle ias_ = 0;
  bool motion_ = false, spheres_ = false;
  double buildMs_ = 0, meshMs_ = 0, frameMs_ = 0, pipelineMs_ = 0;
  size_t gasBytes_ = 0, meshBytes_ = 0;
  std::string log_;
};

}  // namespace crt
