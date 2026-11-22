// post.cpp — see post.h. The launch sequence is GPURenderer.display's (src/engine/render.ts): `steps` à-trous passes
// ping-ponging between two float4 images, each with its own copy of the uniforms (display.ts denoiseStepUniforms:
// D(1).w = 0 for the first pass, D(4).xy = step width 2^k and sigma / 2^k), then the display pass, whose D(1).w tells
// it whether its input is denoised.
#include "post.h"
#include "denoiser.h"

#include <cstring>
#include <stdexcept>
#include <string>

namespace crt {

#define PCU(x) do { CUresult r_ = (x); if (r_ != CUDA_SUCCESS) { const char* m_ = nullptr; cuGetErrorString(r_, &m_); throw std::runtime_error(std::string(#x) + ": " + (m_ ? m_ : "?")); } } while (0)

PostProcessor::PostProcessor(const std::vector<char>& cubin, int width, int height) : w_(width), h_(height) {
  PCU(cuModuleLoadData(&mod_, cubin.data()));
  PCU(cuModuleGetFunction(&den_, mod_, "candela_denoise"));
  PCU(cuModuleGetFunction(&disp_, mod_, "candela_display"));
  PCU(cuModuleGetFunction(&guides_, mod_, "candela_guides"));
  size_t psize = 0;
  PCU(cuModuleGetGlobal(&params_, &psize, mod_, "post"));
  if (psize != 7 * sizeof(CUdeviceptr)) throw std::runtime_error("post has an unexpected size " + std::to_string(psize));
  const size_t img = size_t(w_) * h_ * 16;
  PCU(cuMemAlloc(&dsp_, 128 * 4 * 5));   // the uniforms of up to 4 denoise passes and the display pass
  PCU(cuMemAlloc(&tA_, img)); PCU(cuMemAlloc(&tB_, img));
  PCU(cuMemAlloc(&out_, size_t(w_) * h_ * 4));
}

PostProcessor::~PostProcessor() {
  for (CUdeviceptr p : {dsp_, tA_, tB_, out_, rgb_}) if (p) cuMemFree(p);
  if (mod_) cuModuleUnload(mod_);
}

void PostProcessor::run(std::span<const float> D, int steps, float sigma, CUdeviceptr accum, CUdeviceptr aovA, CUdeviceptr aovN, AiDenoiser* ai) {
  if (D.size() < 128) throw std::runtime_error("display uniforms: 128 floats expected");
  steps = steps < 0 ? 0 : steps > 4 ? 4 : steps;
  const unsigned gx = (w_ + 7) / 8, gy = (h_ + 7) / 8;
  CUdeviceptr src = accum;
  denoiseMs_ = 0;
  if (ai) {
    // the AI denoiser on linear radiance: guides from the accumulation buffers, denoise, then display the result
    PCU(cuMemcpyHtoD(dsp_, D.data(), 512));
    const CUdeviceptr p[7] = {dsp_, accum, aovA, aovN, 0, 0, 0};
    PCU(cuMemcpyHtoD(params_, p, sizeof p));
    CUdeviceptr b = ai->beauty(), a = ai->albedo(), n = ai->normal();
    void* args[] = {&b, &a, &n};
    PCU(cuLaunchKernel(guides_, gx, gy, 1, 8, 8, 1, 0, nullptr, args, nullptr));
    denoiseMs_ = ai->run();
    src = ai->output();
    steps = 0;
  }
  for (int k = 0; k <= steps; k++) {
    float d[128];
    std::memcpy(d, D.data(), sizeof d);
    const bool display = k == steps;
    if (display) d[7] = (steps || ai) ? 1.0f : 0.0f;
    else { d[7] = k == 0 ? 0.0f : 1.0f; d[16] = float(1 << k); d[17] = sigma / float(1 << k); }
    const CUdeviceptr dk = dsp_ + size_t(k) * 512;
    PCU(cuMemcpyHtoD(dk, d, sizeof d));
    const CUdeviceptr dst = k % 2 == 0 ? tA_ : tB_;
    const CUdeviceptr p[7] = {dk, src, aovA, aovN, dst, out_, display ? rgb_ : 0};
    PCU(cuMemcpyHtoD(params_, p, sizeof p));
    PCU(cuLaunchKernel(display ? disp_ : den_, gx, gy, 1, 8, 8, 1, 0, nullptr, nullptr, nullptr));
    src = dst;
  }
}

void PostProcessor::enableRGB(bool on) {
  if (on && !rgb_) PCU(cuMemAlloc(&rgb_, size_t(w_) * h_ * 3));
  if (!on && rgb_) { cuMemFree(rgb_); rgb_ = 0; }
}

std::vector<uint8_t> PostProcessor::readRGBA8() {
  PCU(cuCtxSynchronize());
  std::vector<uint8_t> v(size_t(w_) * h_ * 4);
  PCU(cuMemcpyDtoH(v.data(), out_, v.size()));
  return v;
}

}  // namespace crt
