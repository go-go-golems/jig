// image_io.h — candela-rt's output files (CANDELA-002 phase 4): PFM (scene-linear radiance, for parity checks), PNG
// (the display-referred image, zlib), and video through ffmpeg with NVENC (raw RGBA frames on a pipe).
#pragma once
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

namespace crt {

/** accum: float4 per pixel (radiance sum, sample count), rows top-down; written bottom-up as PFM requires */
void writePFM(const std::filesystem::path& f, int w, int h, const std::vector<float>& accum);
/** 8-bit RGBA, rows top-down; alpha is dropped (RGB PNG) */
void writePNG(const std::filesystem::path& f, int w, int h, const std::vector<uint8_t>& rgba);
void writeFile(const std::filesystem::path& f, const void* data, size_t bytes);

class VideoWriter {
 public:
  /** codec: h264 | hevc | av1 (NVENC); quality: draft | standard | high | max */
  VideoWriter(const std::filesystem::path& f, int w, int h, double fps, const std::string& codec, const std::string& quality);
  ~VideoWriter();
  void add(const std::vector<uint8_t>& rgba);
  /** closes the pipe; throws when ffmpeg failed */
  void finish();
  const std::string& command() const { return cmd_; }

 private:
  FILE* pipe_ = nullptr;
  std::string cmd_;
  size_t frameBytes_;
};

}  // namespace crt
