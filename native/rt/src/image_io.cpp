// image_io.cpp — see image_io.h.
#include "image_io.h"

#include <zlib.h>

#include <cstring>
#include <fstream>
#include <stdexcept>

namespace crt {

void writeFile(const std::filesystem::path& f, const void* data, size_t bytes) {
  std::ofstream o(f, std::ios::binary);
  if (!o) throw std::runtime_error("cannot write " + f.string());
  o.write(static_cast<const char*>(data), (std::streamsize)bytes);
}

void writePFM(const std::filesystem::path& f, int w, int h, const std::vector<float>& accum) {
  std::ofstream o(f, std::ios::binary);
  if (!o) throw std::runtime_error("cannot write " + f.string());
  o << "PF\n" << w << " " << h << "\n-1.0\n";
  std::vector<float> row(size_t(w) * 3);
  for (int y = h - 1; y >= 0; y--) {
    for (int x = 0; x < w; x++) {
      const float* p = &accum[(size_t(y) * w + x) * 4];
      const float n = p[3] > 0 ? p[3] : 1.0f;
      row[x * 3] = p[0] / n; row[x * 3 + 1] = p[1] / n; row[x * 3 + 2] = p[2] / n;
    }
    o.write(reinterpret_cast<const char*>(row.data()), (std::streamsize)(row.size() * 4));
  }
}

static void be32(std::vector<uint8_t>& v, uint32_t x) { v.push_back(x >> 24); v.push_back(x >> 16); v.push_back(x >> 8); v.push_back(x); }
static void chunk(std::vector<uint8_t>& out, const char* type, const std::vector<uint8_t>& data) {
  be32(out, (uint32_t)data.size());
  const size_t start = out.size();
  out.insert(out.end(), type, type + 4);
  out.insert(out.end(), data.begin(), data.end());
  be32(out, (uint32_t)crc32(0, out.data() + start, (uInt)(out.size() - start)));
}

void writePNG(const std::filesystem::path& f, int w, int h, const std::vector<uint8_t>& rgba) {
  // scanlines with filter type 1 (Sub): smaller files than no filter for rendered images, still one pass
  std::vector<uint8_t> raw(size_t(h) * (size_t(w) * 3 + 1));
  for (int y = 0; y < h; y++) {
    uint8_t* r = &raw[size_t(y) * (size_t(w) * 3 + 1)];
    r[0] = 1;
    const uint8_t* s = &rgba[size_t(y) * w * 4];
    for (int x = 0; x < w; x++)
      for (int c = 0; c < 3; c++) r[1 + x * 3 + c] = uint8_t(s[x * 4 + c] - (x ? s[(x - 1) * 4 + c] : 0));
  }
  uLongf zn = compressBound((uLong)raw.size());
  std::vector<uint8_t> z(zn);
  if (compress2(z.data(), &zn, raw.data(), (uLong)raw.size(), 6) != Z_OK) throw std::runtime_error("PNG: deflate failed");
  z.resize(zn);
  std::vector<uint8_t> out = {0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
  std::vector<uint8_t> ihdr;
  be32(ihdr, (uint32_t)w); be32(ihdr, (uint32_t)h);
  ihdr.insert(ihdr.end(), {8, 2, 0, 0, 0});   // 8 bits, RGB, deflate, adaptive filtering, no interlace
  chunk(out, "IHDR", ihdr);
  chunk(out, "IDAT", z);
  chunk(out, "IEND", {});
  writeFile(f, out.data(), out.size());
}

VideoWriter::VideoWriter(const std::filesystem::path& f, int w, int h, double fps, const std::string& codec, const std::string& quality) : frameBytes_(size_t(w) * h * 4) {
  const std::string enc = codec == "hevc" ? "hevc_nvenc" : codec == "av1" ? "av1_nvenc" : "h264_nvenc";
  // constant quality (VBR with a CQ target); lower is better. 4:2:0 for players; hvc1 tag so browsers accept HEVC in MP4
  const int cq = quality == "draft" ? 30 : quality == "standard" ? 24 : quality == "max" ? 14 : 19;
  cmd_ = "ffmpeg -hide_banner -loglevel error -y -f rawvideo -pix_fmt rgba -s " + std::to_string(w) + "x" + std::to_string(h) +
         " -r " + std::to_string(fps) + " -i - -c:v " + enc + " -preset p6 -tune hq -rc vbr -cq " + std::to_string(cq) +
         " -b:v 0 -pix_fmt yuv420p" + (codec == "hevc" ? " -tag:v hvc1" : "") + " -movflags +faststart '" + f.string() + "'";
  pipe_ = popen(cmd_.c_str(), "w");
  if (!pipe_) throw std::runtime_error("cannot start ffmpeg: " + cmd_);
}

VideoWriter::~VideoWriter() { if (pipe_) pclose(pipe_); }

void VideoWriter::add(const std::vector<uint8_t>& rgba) {
  if (!pipe_) throw std::runtime_error("video: already finished");
  if (rgba.size() != frameBytes_) throw std::runtime_error("video: frame size mismatch");
  if (fwrite(rgba.data(), 1, rgba.size(), pipe_) != rgba.size()) throw std::runtime_error("video: ffmpeg stopped reading (" + cmd_ + ")");
}

void VideoWriter::finish() {
  if (!pipe_) return;
  const int rc = pclose(pipe_);
  pipe_ = nullptr;
  if (rc != 0) throw std::runtime_error("ffmpeg failed (exit " + std::to_string(rc) + "): " + cmd_);
}

}  // namespace crt
