// cuda_runner.cpp — see cuda_runner.h.
#include "cuda_runner.h"

#include <nvrtc.h>

#include <chrono>
#include <cstdlib>
#include <sstream>
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

// --use_fast_math: sin/cos/exp/log/pow and division use the approximate hardware units and fp32 denormals flush to
// zero. That is what NVIDIA's Vulkan driver does for the same WGSL on this GPU (the WebGPU target), so paths agree
// (parity sweep: 101/105 presets with >= 99 % of 1-spp pixels within 0.1 %, against 85/105 with IEEE sinf), and NVRTC
// compiles 2.5x faster. It does not assume finite math: the kernel's NaN guards keep working.
const char* const kNvrtcOptions[] = {"-std=c++17", "--use_fast_math"};
std::string nvrtcOptionsKey() {
  std::string k; for (const char* x : kNvrtcOptions) { k += x; k += ' '; }
  if (const char* e = getenv("CANDELA_NVRTC_FLAGS")) k += e;
  return k;
}

NvrtcResult nvrtcCompile(const std::string& source, const std::string& name, const std::string& includeDir, const std::string& arch,
                         bool optixIR, const std::vector<std::string>& extraIncludes) {
  NvrtcResult res;
  const auto t0 = std::chrono::steady_clock::now();
  nvrtcProgram prog;
  if (nvrtcCreateProgram(&prog, source.c_str(), name.c_str(), 0, nullptr, nullptr) != NVRTC_SUCCESS) { res.log = "nvrtcCreateProgram failed"; return res; }
  const std::string inc = "-I" + includeDir, gpu = "--gpu-architecture=" + arch;
  std::vector<std::string> extra;   // CANDELA_NVRTC_FLAGS: extra options, space separated (experiments)
  if (const char* e = getenv("CANDELA_NVRTC_FLAGS")) { std::stringstream ss(e); std::string t; while (ss >> t) extra.push_back(t); }
  std::vector<std::string> incs;
  for (const auto& d : extraIncludes) incs.push_back("-I" + d);
  std::vector<const char*> opts = {inc.c_str(), gpu.c_str()};
  for (auto& x : incs) opts.push_back(x.c_str());
  if (optixIR) opts.push_back("--optix-ir");
  for (const char* x : kNvrtcOptions) opts.push_back(x);
  for (auto& x : extra) opts.push_back(x.c_str());
  const nvrtcResult cr = nvrtcCompileProgram(prog, (int)opts.size(), opts.data());
  size_t logSize = 0;
  nvrtcGetProgramLogSize(prog, &logSize);
  if (logSize > 1) { res.log.resize(logSize); nvrtcGetProgramLog(prog, res.log.data()); res.log.resize(logSize - 1); }
  if (cr == NVRTC_SUCCESS) {
    size_t n = 0;
    if (optixIR) { nvrtcGetOptiXIRSize(prog, &n); res.cubin.resize(n); nvrtcGetOptiXIR(prog, res.cubin.data()); }
    else { nvrtcGetCUBINSize(prog, &n); res.cubin.resize(n); nvrtcGetCUBIN(prog, res.cubin.data()); }
    res.ok = n > 0;
    if (!res.ok) res.log += "\nNVRTC produced no output";
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

CudaRenderer::CudaRenderer(const std::vector<char>& cubin, int width, int height) {
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
  allocImages(width, height);
}
CudaRenderer::~CudaRenderer() {
  for (CUdeviceptr p : {U_, O_, LI_, BV_, SD_}) if (p) cuMemFree(p);
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

}  // namespace crt
