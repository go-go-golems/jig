// denoiser.h — the OptiX AI denoiser (CANDELA-002 phase 6): the AOV model with albedo and world-space normal guides,
// on linear HDR radiance before the display program tone-maps it. It has its own OptiX device context on the CUDA
// context, so it serves the plain-CUDA target as well as the OptiX one.
#pragma once
#include <cuda.h>

struct OptixDeviceContext_t;
struct OptixDenoiser_t;

namespace crt {

class AiDenoiser {
 public:
  AiDenoiser(CUcontext ctx, int width, int height);
  ~AiDenoiser();
  void resize(int width, int height);
  /** the guide images (filled by the display program's candela_guides) and the output, float4 each */
  CUdeviceptr beauty() const { return beauty_; }
  CUdeviceptr albedo() const { return albedo_; }
  CUdeviceptr normal() const { return normal_; }
  CUdeviceptr output() const { return out_; }
  /** denoise beauty() into output(), guided by albedo() and normal(); returns GPU time in ms (synchronous) */
  double run();
  double setupMs() const { return setupMs_; }

 private:
  void alloc();
  void release();
  OptixDeviceContext_t* ctx_ = nullptr;
  OptixDenoiser_t* den_ = nullptr;
  int w_ = 0, h_ = 0;
  CUdeviceptr beauty_ = 0, albedo_ = 0, normal_ = 0, out_ = 0, state_ = 0, scratch_ = 0, intensity_ = 0, avgColor_ = 0;
  size_t stateBytes_ = 0, scratchBytes_ = 0;
  double setupMs_ = 0;
};

}  // namespace crt
