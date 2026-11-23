// denoiser.cpp — see denoiser.h. Per frame: optixDenoiserComputeAverageColor (the AOV model's HDR normalisation,
// computed from this image so a sequence with a locked exposure still denoises each frame in its own range), then
// optixDenoiserInvoke with one beauty layer and the albedo/normal guide layer.
#include "denoiser.h"

#include <optix.h>
#include <optix_stubs.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <stdexcept>
#include <string>

namespace crt {

#define DX(x) do { OptixResult r_ = (x); if (r_ != OPTIX_SUCCESS) throw std::runtime_error(std::string(#x) + ": " + optixGetErrorName(r_)); } while (0)
#define DC(x) do { CUresult r_ = (x); if (r_ != CUDA_SUCCESS) { const char* m_ = nullptr; cuGetErrorString(r_, &m_); throw std::runtime_error(std::string(#x) + ": " + (m_ ? m_ : "?")); } } while (0)

static OptixImage2D image(CUdeviceptr p, int w, int h) {
  OptixImage2D im = {};
  im.data = p; im.width = (unsigned)w; im.height = (unsigned)h;
  im.rowStrideInBytes = unsigned(w) * 16; im.pixelStrideInBytes = 16; im.format = OPTIX_PIXEL_FORMAT_FLOAT4;
  return im;
}

AiDenoiser::AiDenoiser(CUcontext cuctx, int width, int height) {
  DX(optixInit());
  OptixDeviceContextOptions co = {};
  DX(optixDeviceContextCreate(cuctx, &co, &ctx_));
  OptixDenoiserOptions o = {};
  o.guideAlbedo = 1; o.guideNormal = 1; o.denoiseAlpha = OPTIX_DENOISER_ALPHA_MODE_COPY;
  DX(optixDenoiserCreate(ctx_, OPTIX_DENOISER_MODEL_KIND_AOV, &o, &den_));
  w_ = width; h_ = height;
  alloc();
}

AiDenoiser::~AiDenoiser() {
  release();
  if (den_) optixDenoiserDestroy(den_);
  if (ctx_) optixDeviceContextDestroy(ctx_);
}

void AiDenoiser::alloc() {
  const auto t0 = std::chrono::steady_clock::now();
  const size_t img = size_t(w_) * h_ * 16;
  for (CUdeviceptr* p : {&beauty_, &albedo_, &normal_, &out_}) DC(cuMemAlloc(p, img));
  OptixDenoiserSizes sz = {};
  DX(optixDenoiserComputeMemoryResources(den_, (unsigned)w_, (unsigned)h_, &sz));
  stateBytes_ = sz.stateSizeInBytes;
  scratchBytes_ = std::max(sz.withoutOverlapScratchSizeInBytes, std::max(sz.computeAverageColorSizeInBytes, sz.computeIntensitySizeInBytes));
  DC(cuMemAlloc(&state_, stateBytes_));
  DC(cuMemAlloc(&scratch_, scratchBytes_));
  DC(cuMemAlloc(&avgColor_, 3 * sizeof(float)));
  DC(cuMemAlloc(&intensity_, sizeof(float)));
  DX(optixDenoiserSetup(den_, nullptr, (unsigned)w_, (unsigned)h_, state_, stateBytes_, scratch_, scratchBytes_));
  DC(cuCtxSynchronize());
  setupMs_ = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
}

void AiDenoiser::release() {
  for (CUdeviceptr* p : {&beauty_, &albedo_, &normal_, &out_, &state_, &scratch_, &avgColor_, &intensity_}) { if (*p) cuMemFree(*p); *p = 0; }
}

void AiDenoiser::resize(int width, int height) {
  if (width == w_ && height == h_) return;
  release();
  w_ = width; h_ = height;
  alloc();
}

double AiDenoiser::run() {
  const auto t0 = std::chrono::steady_clock::now();
  const OptixImage2D in = image(beauty_, w_, h_);
  DX(optixDenoiserComputeAverageColor(den_, nullptr, &in, avgColor_, scratch_, scratchBytes_));
  OptixDenoiserParams p = {};
  p.hdrAverageColor = avgColor_;
  p.blendFactor = 0.0f;
  OptixDenoiserGuideLayer g = {};
  g.albedo = image(albedo_, w_, h_);
  g.normal = image(normal_, w_, h_);
  OptixDenoiserLayer l = {};
  l.input = in;
  l.output = image(out_, w_, h_);
  l.type = OPTIX_DENOISER_AOV_TYPE_BEAUTY;
  DX(optixDenoiserInvoke(den_, nullptr, &p, state_, stateBytes_, &g, &l, 1, 0, 0, scratch_, scratchBytes_));
  DC(cuCtxSynchronize());
  return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
}

}  // namespace crt
