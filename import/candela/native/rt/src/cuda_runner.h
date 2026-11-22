// cuda_runner.h — the plain-CUDA target in candela-rt (CANDELA-002 phase 2): compile a scene's translated program with
// NVRTC, load it with the driver API, upload the WebGPU target's storage buffers, launch candela_main once per frame
// with that frame's uniforms, and read the accumulation buffer back.
#pragma once
#include "renderer.h"
#include <cuda.h>

#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace crt {

struct NvrtcResult {
  bool ok = false;
  std::string log;              // compiler output (errors and warnings)
  std::vector<char> cubin;
  double ms = 0;
};

/** the NVRTC options in effect (built-in defaults + CANDELA_NVRTC_FLAGS), for cache keys */
std::string nvrtcOptionsKey();

/** compile CUDA source with NVRTC for the given architecture (e.g. "sm_121"); `includeDir` holds native/rt/kernels.
 *  `optixIR`: produce OptiX-IR (for optixModuleCreate) instead of a cubin; `extraIncludes`: more -I directories. */
NvrtcResult nvrtcCompile(const std::string& source, const std::string& name, const std::string& includeDir, const std::string& arch,
                         bool optixIR = false, const std::vector<std::string>& extraIncludes = {});

class CudaContext {
 public:
  CudaContext();                              // cuInit, device 0, primary context
  ~CudaContext();
  std::string arch() const;                   // "sm_121"
  std::string deviceName() const;
  CUcontext ctx() const { return ctx_; }
 private:
  CUdevice dev_ = 0;
  CUcontext ctx_ = nullptr;
};

class CudaRenderer : public Renderer {
 public:
  CudaRenderer(const std::vector<char>& cubin, int width, int height);
  ~CudaRenderer();
  /** scene buffers, uploaded once: objects, lights, top-level BVH, scene data */
  void upload(std::span<const float> O, std::span<const float> LI, std::span<const float> BV, std::span<const float> SD) override;
  /** one launch: this frame's uniforms, then candela_main over the image in 8×8 blocks */
  void launch(std::span<const float> U) override;
  int localBytes() const { return localBytes_; }
  int registers() const { return registers_; }
 private:
  CUdeviceptr alloc(size_t bytes);
  void put(CUdeviceptr& p, size_t& cap, std::span<const float> data);
  CUmodule mod_ = nullptr;
  CUfunction fn_ = nullptr;
  CUdeviceptr params_ = 0;
  CUdeviceptr U_ = 0, O_ = 0, LI_ = 0, BV_ = 0, SD_ = 0;
  size_t capU_ = 0, capO_ = 0, capLI_ = 0, capBV_ = 0, capSD_ = 0;
  int localBytes_ = 0, registers_ = 0;
};

}  // namespace crt
