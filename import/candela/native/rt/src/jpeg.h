// jpeg.h — JPEG encoding on the GPU with nvJPEG (CANDELA-002 phase 5): the live server sends each progressive frame
// as a JPEG of the display program's packed-RGB output, without copying the image to the host first.
#pragma once
#include <cuda.h>

#include <string>

struct nvjpegHandle;
struct nvjpegEncoderState;
struct nvjpegEncoderParams;

namespace crt {

class JpegEncoder {
 public:
  explicit JpegEncoder(int quality = 88);
  ~JpegEncoder();
  /** rgb: packed 8-bit RGB on the device, rows top-down */
  std::string encode(CUdeviceptr rgb, int width, int height);

 private:
  nvjpegHandle* handle_ = nullptr;
  nvjpegEncoderState* state_ = nullptr;
  nvjpegEncoderParams* params_ = nullptr;
};

}  // namespace crt
