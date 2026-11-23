// jpeg.cpp — see jpeg.h. nvJPEG takes runtime-API streams; the default stream (0) is the legacy stream that the
// driver-API launches use too, so encoding is ordered after the display kernel. The runtime API attaches to the
// device's primary context, which is the one CudaContext retains.
#include "jpeg.h"

#include <nvjpeg.h>

#include <stdexcept>
#include <string>

namespace crt {

#define NJ(x) do { nvjpegStatus_t s_ = (x); if (s_ != NVJPEG_STATUS_SUCCESS) throw std::runtime_error(std::string(#x) + ": nvjpeg status " + std::to_string((int)s_)); } while (0)

JpegEncoder::JpegEncoder(int quality) {
  NJ(nvjpegCreateSimple(&handle_));
  NJ(nvjpegEncoderStateCreate(handle_, &state_, nullptr));
  NJ(nvjpegEncoderParamsCreate(handle_, &params_, nullptr));
  NJ(nvjpegEncoderParamsSetQuality(params_, quality, nullptr));
  NJ(nvjpegEncoderParamsSetSamplingFactors(params_, NVJPEG_CSS_420, nullptr));
  NJ(nvjpegEncoderParamsSetOptimizedHuffman(params_, 0, nullptr));
}

JpegEncoder::~JpegEncoder() {
  if (params_) nvjpegEncoderParamsDestroy(params_);
  if (state_) nvjpegEncoderStateDestroy(state_);
  if (handle_) nvjpegDestroy(handle_);
}

std::string JpegEncoder::encode(CUdeviceptr rgb, int width, int height) {
  nvjpegImage_t img = {};
  img.channel[0] = reinterpret_cast<unsigned char*>(rgb);
  img.pitch[0] = size_t(width) * 3;
  NJ(nvjpegEncodeImage(handle_, state_, params_, &img, NVJPEG_INPUT_RGBI, width, height, nullptr));
  size_t len = 0;
  NJ(nvjpegEncodeRetrieveBitstream(handle_, state_, nullptr, &len, nullptr));
  std::string out(len, '\0');
  NJ(nvjpegEncodeRetrieveBitstream(handle_, state_, reinterpret_cast<unsigned char*>(out.data()), &len, nullptr));
  out.resize(len);
  return out;
}

}  // namespace crt
