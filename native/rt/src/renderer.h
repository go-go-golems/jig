// renderer.h — what a render job needs from a target (CANDELA-002 phase 4): upload the scene buffers, launch with a
// frame's uniforms, and the three per-pixel float4 buffers the kernel accumulates into (radiance + sample count,
// albedo, normal + depth), which the display program and the output writers read on the device or the host.
#pragma once
#include <cuda.h>

#include <span>
#include <vector>

namespace crt {

class Renderer {
 public:
  virtual ~Renderer() = default;
  virtual void upload(std::span<const float> O, std::span<const float> LI, std::span<const float> BV, std::span<const float> SD) = 0;
  virtual void launch(std::span<const float> U) = 0;
  void sync() { cuCtxSynchronize(); }
  int width() const { return w_; }
  int height() const { return h_; }
  CUdeviceptr accumBuffer() const { return acc_; }
  CUdeviceptr albedoBuffer() const { return aovA_; }
  CUdeviceptr normalBuffer() const { return aovN_; }
  std::vector<float> readAccum() { return read(acc_); }
  std::vector<float> readAlbedo() { return read(aovA_); }
  std::vector<float> readNormal() { return read(aovN_); }

 protected:
  std::vector<float> read(CUdeviceptr p) {
    sync();
    std::vector<float> v(size_t(w_) * h_ * 4);
    cuMemcpyDtoH(v.data(), p, v.size() * 4);
    return v;
  }
  int w_ = 0, h_ = 0;
  CUdeviceptr acc_ = 0, aovA_ = 0, aovN_ = 0;
};

}  // namespace crt
