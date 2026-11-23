// post.h — the display program on the GPU (CANDELA-002 phase 4): the workbench's display shaders (display.ts
// displaySource: à-trous denoise, exposure, bloom, user passes, tone map, sRGB), translated to CUDA by wgsl2cuda and
// compiled by NVRTC, run over a renderer's accumulation and AOV buffers. The result is the image the workbench would
// show at the same exposure and sample count, 8-bit RGBA, rows top-down.
#pragma once
#include <cuda.h>

#include <cstdint>
#include <span>
#include <vector>

namespace crt {

class AiDenoiser;

class PostProcessor {
 public:
  PostProcessor(const std::vector<char>& cubin, int width, int height);
  ~PostProcessor();
  /** D: the display uniforms (display.ts displayUniforms, 128 floats); steps/sigma: the denoiser's schedule (0: off) */
  /** ai: denoise with the OptiX AI denoiser instead (the à-trous schedule is then ignored); the last call's denoiser
   *  time is in lastDenoiseMs() */
  void run(std::span<const float> D, int steps, float sigma, CUdeviceptr accum, CUdeviceptr aovA, CUdeviceptr aovN, AiDenoiser* ai = nullptr);
  double lastDenoiseMs() const { return denoiseMs_; }
  std::vector<uint8_t> readRGBA8();
  /** the last image as packed RGB on the device (written by run when rgb output is on) */
  CUdeviceptr rgbBuffer() const { return rgb_; }
  void enableRGB(bool on);
  int width() const { return w_; }
  int height() const { return h_; }

 private:
  CUmodule mod_ = nullptr;
  CUfunction den_ = nullptr, disp_ = nullptr, guides_ = nullptr;
  double denoiseMs_ = 0;
  CUdeviceptr params_ = 0, dsp_ = 0, tA_ = 0, tB_ = 0, out_ = 0, rgb_ = 0;
  int w_, h_;
};

}  // namespace crt
