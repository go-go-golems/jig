// cuda_runner.cpp — see cuda_runner.h.
#include "cuda_runner.h"

#include <nvrtc.h>

#include <chrono>
#include <stdexcept>

namespace crt {

#define CU(x)                                                                                    \
  do {                                                                                           \
    CUresult r_ = (x);                                                                           \
    if (r_ != CUDA_SUCCESS) {                                                                    \
      const char* s_ = nullptr; cuGetErrorString(r_, &s_);                                       \
      throw std::runtime_error(std::string(#x) + ": " + (s_ ? s_ : "CUDA error"));               \
    }                                                                                            \
  } while (0)

NvrtcResult nvrtcCompile(const std::string& source, const std::string& name, const std::string& includeDir, const std::string& arch) {
  NvrtcResult res;
  const auto t0 = std::chrono::steady_clock::now();
  nvrtcProgram prog;
  if (nvrtcCreateProgram(&prog, source.c_str(), name.c_str(), 0, nullptr, nullptr) != NVRTC_SUCCESS) { res.log = "nvrtcCreateProgram failed"; return res; }
  const std::string inc = "-I" + includeDir, gpu = "--gpu-architecture=" + arch;
  const char* opts[] = {inc.c_str(), gpu.c_str(), "-std=c++17"};
  const nvrtcResult cr = nvrtcCompileProgram(prog, 3, opts);
  size_t logSize = 0;
  nvrtcGetProgramLogSize(prog, &logSize);
  if (logSize > 1) { res.log.resize(logSize); nvrtcGetProgramLog(prog, res.log.data()); res.log.resize(logSize - 1); }
  if (cr == NVRTC_SUCCESS) {
    size_t n = 0;
    nvrtcGetCUBINSize(prog, &n);
    res.cubin.resize(n);
    nvrtcGetCUBIN(prog, res.cubin.data());
    res.ok = true;
  }
  nvrtcDestroyProgram(&prog);
  res.ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  return res;
}

CudaContext::CudaContext() {
  CU(cuInit(0));
  CU(cuDeviceGet(&dev_, 0));
  CU(cuDevicePrimaryCtxRetain(&ctx_, dev_));
  CU(cuCtxSetCurrent(ctx_));
}
CudaContext::~CudaContext() { if (ctx_) cuDevicePrimaryCtxRelease(dev_); }
std::string CudaContext::arch() const {
  int major = 0, minor = 0;
  cuDeviceGetAttribute(&major, CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MAJOR, dev_);
  cuDeviceGetAttribute(&minor, CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MINOR, dev_);
  return "sm_" + std::to_string(major) + std::to_string(minor);
}
std::string CudaContext::deviceName() const { char n[256] = {0}; cuDeviceGetName(n, sizeof n, dev_); return n; }

CudaRenderer::CudaRenderer(const std::vector<char>& cubin, int width, int height) : w_(width), h_(height) {
  CU(cuModuleLoadData(&mod_, cubin.data()));
  CU(cuModuleGetFunction(&fn_, mod_, "candela_main"));
  size_t psize = 0;
  CU(cuModuleGetGlobal(&params_, &psize, mod_, "params"));
  if (psize != 8 * sizeof(CUdeviceptr)) throw std::runtime_error("params has an unexpected size " + std::to_string(psize));
  CU(cuFuncGetAttribute(&localBytes_, CU_FUNC_ATTRIBUTE_LOCAL_SIZE_BYTES, fn_));
  CU(cuFuncGetAttribute(&registers_, CU_FUNC_ATTRIBUTE_NUM_REGS, fn_));
  // the translated kernel calls deep, non-inlined functions; give every thread room for their frames
  size_t stack = 0;
  CU(cuCtxGetLimit(&stack, CU_LIMIT_STACK_SIZE));
  if (stack < 8192) CU(cuCtxSetLimit(CU_LIMIT_STACK_SIZE, 8192));
  const size_t img = size_t(w_) * h_ * 16;
  acc_ = alloc(img); aovA_ = alloc(img); aovN_ = alloc(img);
  CU(cuMemsetD8(acc_, 0, img)); CU(cuMemsetD8(aovA_, 0, img)); CU(cuMemsetD8(aovN_, 0, img));
}
CudaRenderer::~CudaRenderer() {
  for (CUdeviceptr p : {U_, O_, LI_, BV_, SD_, acc_, aovA_, aovN_}) if (p) cuMemFree(p);
  if (mod_) cuModuleUnload(mod_);
}
CUdeviceptr CudaRenderer::alloc(size_t bytes) { CUdeviceptr p = 0; CU(cuMemAlloc(&p, bytes < 16 ? 16 : bytes)); return p; }
void CudaRenderer::put(CUdeviceptr& p, size_t& cap, std::span<const float> data) {
  const size_t bytes = data.size_bytes() < 16 ? 16 : data.size_bytes();
  if (bytes > cap) { if (p) cuMemFree(p); p = alloc(bytes); cap = bytes; }
  if (!data.empty()) CU(cuMemcpyHtoD(p, data.data(), data.size_bytes()));
}
void CudaRenderer::upload(std::span<const float> O, std::span<const float> LI, std::span<const float> BV, std::span<const float> SD) {
  put(O_, capO_, O); put(LI_, capLI_, LI); put(BV_, capBV_, BV); put(SD_, capSD_, SD);
}
void CudaRenderer::launch(std::span<const float> U) {
  put(U_, capU_, U);
  const CUdeviceptr p[8] = {U_, O_, LI_, BV_, SD_, acc_, aovA_, aovN_};
  CU(cuMemcpyHtoD(params_, p, sizeof p));
  CU(cuLaunchKernel(fn_, (w_ + 7) / 8, (h_ + 7) / 8, 1, 8, 8, 1, 0, nullptr, nullptr, nullptr));
}
void CudaRenderer::sync() { CU(cuCtxSynchronize()); }
std::vector<float> CudaRenderer::readAccum() { sync(); std::vector<float> v(size_t(w_) * h_ * 4); CU(cuMemcpyDtoH(v.data(), acc_, v.size() * 4)); return v; }
std::vector<float> CudaRenderer::readAlbedo() { sync(); std::vector<float> v(size_t(w_) * h_ * 4); CU(cuMemcpyDtoH(v.data(), aovA_, v.size() * 4)); return v; }

}  // namespace crt
