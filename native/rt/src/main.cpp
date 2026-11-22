// candela-rt — Candela's native render runtime (CANDELA-002 design doc 02).
//
//   candela-rt digest     [--bundle dist-core/candela-core.js] [--content content] [--ids B-01,K-09]
//                         [--times 0,0.37,1.5] [--json out.json]
//   candela-rt session    [--bundle …] [--content …] [--ids W-01,K-09] [--frames 48] [--fps 24] [--json out.json]
//   candela-rt cuda-sweep [--ids …] [--jobs 8] [--json out.json] [--kernels native/rt/kernels]
//   candela-rt render <id> [--size 640x360] [--spp 64] [--time 0] [--out build/parity] [--aov]
//
// `cuda-sweep` translates every preset's WGSL program to CUDA in V8 and compiles it with NVRTC (phase 2, §10.2).
// `render` renders one preset with the plain-CUDA target and writes <out>/<id>.cuda.pfm, the counterpart of
// scripts/wgsl-render.ts (WGSL on Dawn); scripts/compare-pfm.ts compares the two.
//
// `digest` loads the engine bundle into an embedded V8 isolate, reads every file under content/ into a path → text
// map (as src/content/node.ts does), and calls Candela.digestCatalog: each preset is built in V8 and the hashes of its
// generated WGSL and of every buffer `pack` writes are reported, with build and per-frame timings. The same bundle
// run in Node (scripts/core-digest.ts) must produce identical hashes.
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <mutex>
#include <thread>

#include "cuda_runner.h"
#include "js_runtime.h"

namespace fs = std::filesystem;

static std::string readFile(const fs::path& p) {
  std::ifstream f(p, std::ios::binary);
  if (!f) throw std::runtime_error("cannot read " + p.string());
  std::stringstream s; s << f.rdbuf(); return s.str();
}

static std::string arg(int argc, char** argv, const char* name, const char* def) {
  for (int i = 1; i + 1 < argc; i++) if (std::string(argv[i]) == name) return argv[i + 1];
  return def;
}

// content/ as a JS object { 'presets/B-01-hello-sphere.js': '…', … }
static v8::Local<v8::Object> readContent(crt::JsRuntime& rt, const fs::path& dir, size_t* files, size_t* bytes) {
  auto obj = v8::Object::New(rt.isolate());
  for (const auto& e : fs::recursive_directory_iterator(dir)) {
    if (!e.is_regular_file()) continue;
    const std::string rel = fs::relative(e.path(), dir).generic_string();
    const std::string text = readFile(e.path());
    obj->Set(rt.context(), rt.str(rel), rt.str(text)).Check();
    (*files)++; *bytes += text.size();
  }
  return obj;
}

static int cmdDigest(int argc, char** argv) {
  const std::string bundle = arg(argc, argv, "--bundle", "dist-core/candela-core.js");
  const std::string content = arg(argc, argv, "--content", "content");
  const std::string ids = arg(argc, argv, "--ids", "");
  const std::string times = arg(argc, argv, "--times", "0,0.37,1.5");
  const std::string jsonOut = arg(argc, argv, "--json", "");

  crt::JsRuntime rt;
  v8::Isolate::Scope is(rt.isolate());
  v8::HandleScope hs(rt.isolate());
  v8::Context::Scope cs(rt.context());
  int warnings = 0;
  rt.onConsole = [&](const std::string& level, const std::string& text) {
    if (level == "warn" || level == "error") warnings++;
    if (level != "debug") fprintf(stderr, "[js %s] %s\n", level.c_str(), text.substr(0, 300).c_str());
  };

  auto t0 = std::chrono::steady_clock::now();
  rt.runScript(readFile(bundle), bundle);
  const double loadMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  size_t nFiles = 0, nBytes = 0;
  auto contentObj = readContent(rt, content, &nFiles, &nBytes);
  printf("V8 %s; bundle %s loaded in %.1f ms; content: %zu files, %.1f MiB\n", v8::V8::GetVersion(), bundle.c_str(), loadMs, nFiles, nBytes / 1048576.0);

  // --ids a,b,c → ["a","b","c"] (an empty list means every preset)
  auto idsArr = v8::Array::New(rt.isolate());
  { std::stringstream ss(ids); std::string id; uint32_t n = 0; while (std::getline(ss, id, ',')) if (!id.empty()) idsArr->Set(rt.context(), n++, rt.str(id)).Check(); }
  v8::Local<v8::Value> idsV = idsArr;
  auto timesV = rt.fromJSON("[" + times + "]");
  auto res = rt.call("Candela", "digestCatalog", {contentObj, idsV, timesV});
  const std::string json = rt.toJSON(res);
  if (!jsonOut.empty()) { std::ofstream(jsonOut) << json << "\n"; }

  // a short table
  auto arr = res.As<v8::Array>();
  int ok = 0;
  for (uint32_t i = 0; i < arr->Length(); i++) {
    auto r = arr->Get(rt.context(), i).ToLocalChecked().As<v8::Object>();
    auto get = [&](const char* k) { return r->Get(rt.context(), rt.str(k)).ToLocalChecked(); };
    const bool good = get("ok")->IsTrue();
    ok += good;
    if (good) printf("  %-6s shared %s  build %7.1f ms  frame %.3f ms\n", rt.toStdString(get("id")).c_str(), rt.toStdString(get("shared")).c_str(), get("buildMs").As<v8::Number>()->Value(), get("frameMs").As<v8::Number>()->Value());
    else printf("  %-6s FAILED %s\n", rt.toStdString(get("id")).c_str(), rt.toStdString(get("error")).substr(0, 200).c_str());
  }
  printf("%d/%u presets built%s\n", ok, arr->Length(), jsonOut.empty() ? "" : (", digests → " + jsonOut).c_str());
  return ok == (int)arr->Length() ? 0 : 2;
}

// candela-rt session: step the presets that move (behaviours, animation) frame by frame in V8 and digest each frame
static int cmdSession(int argc, char** argv) {
  const std::string bundle = arg(argc, argv, "--bundle", "dist-core/candela-core.js");
  const std::string content = arg(argc, argv, "--content", "content");
  const std::string ids = arg(argc, argv, "--ids", "");
  const int frames = std::stoi(arg(argc, argv, "--frames", "48"));
  const double fps = std::stod(arg(argc, argv, "--fps", "24"));
  const std::string jsonOut = arg(argc, argv, "--json", "");

  crt::JsRuntime rt;
  v8::Isolate::Scope is(rt.isolate());
  v8::HandleScope hs(rt.isolate());
  v8::Context::Scope cs(rt.context());
  rt.onConsole = [&](const std::string& level, const std::string& text) { if (level != "debug") fprintf(stderr, "[js %s] %s\n", level.c_str(), text.substr(0, 300).c_str()); };
  rt.runScript(readFile(bundle), bundle);
  size_t nFiles = 0, nBytes = 0;
  auto contentObj = readContent(rt, content, &nFiles, &nBytes);
  auto idsArr = v8::Array::New(rt.isolate());
  { std::stringstream ss(ids); std::string id; uint32_t n = 0; while (std::getline(ss, id, ',')) if (!id.empty()) idsArr->Set(rt.context(), n++, rt.str(id)).Check(); }
  auto opts = rt.fromJSON("{\"fps\":" + std::to_string(fps) + ",\"frames\":" + std::to_string(frames) + "}");
  auto res = rt.call("Candela", "sessionCatalog", {contentObj, idsArr, opts});
  if (!jsonOut.empty()) std::ofstream(jsonOut) << rt.toJSON(res) << "\n";
  auto arr = res.As<v8::Array>();
  int ok = 0;
  printf("V8 %s; %d frames at %g fps per moving preset\n", v8::V8::GetVersion(), frames, fps);
  for (uint32_t i = 0; i < arr->Length(); i++) {
    auto r = arr->Get(rt.context(), i).ToLocalChecked().As<v8::Object>();
    auto get = [&](const char* k) { return r->Get(rt.context(), rt.str(k)).ToLocalChecked(); };
    if (!get("ok")->IsTrue()) { printf("  %-6s FAILED %s\n", rt.toStdString(get("id")).c_str(), rt.toStdString(get("error")).substr(0, 200).c_str()); continue; }
    ok++;
    auto fr = get("frames").As<v8::Array>();
    auto last = fr->Get(rt.context(), fr->Length() - 1).ToLocalChecked().As<v8::Object>();
    printf("  %-6s behaviours %d  animated %-5s  last O %s  %.3f ms/frame\n", rt.toStdString(get("id")).c_str(), (int)get("behaviors").As<v8::Number>()->Value(),
           get("animated")->IsTrue() ? "yes" : "no", rt.toStdString(last->Get(rt.context(), rt.str("O")).ToLocalChecked()).c_str(), get("frameMs").As<v8::Number>()->Value());
  }
  printf("%d/%u moving presets stepped\n", ok, arr->Length());
  return ok == (int)arr->Length() ? 0 : 2;
}

// ---- phase 2: CUDA ----------------------------------------------------------------------------------------------

static std::string kernelsDir(int argc, char** argv) { return arg(argc, argv, "--kernels", CANDELA_KERNELS_DIR); }

// a hash of the target headers, so cached cubins are rebuilt when candela_wgsl.h or an entry point changes
static std::string headersHash(const std::string& dir) {
  uint64_t h = 1469598103934665603ull;
  std::vector<fs::path> files;
  for (const auto& e : fs::directory_iterator(dir)) if (e.is_regular_file()) files.push_back(e.path());
  std::sort(files.begin(), files.end());
  for (const auto& f : files) for (unsigned char c : f.filename().string() + readFile(f)) { h ^= c; h *= 1099511628211ull; }
  char buf[17]; snprintf(buf, sizeof buf, "%016llx", (unsigned long long)h); return buf;
}
static fs::path cacheDir(int argc, char** argv) {
  const char* home = getenv("HOME");
  fs::path d = arg(argc, argv, "--cache", ((home ? std::string(home) : std::string(".")) + "/data/candela/cubin-cache").c_str());
  fs::create_directories(d);
  return d;
}
// compile through the cache: <cache>/<source hash>-<headers hash>-<arch>.cubin
static crt::NvrtcResult compileCached(const std::string& source, const std::string& hash, const std::string& name, const std::string& kdir, const std::string& arch, const fs::path& cache, bool* hit) {
  uint64_t fh = 1469598103934665603ull; for (unsigned char c : crt::nvrtcOptionsKey()) { fh ^= c; fh *= 1099511628211ull; }
  char fb[9]; snprintf(fb, sizeof fb, "%08x", (unsigned)(fh & 0xffffffffu));
  const fs::path f = cache / (hash + "-" + headersHash(kdir) + "-" + arch + "-" + fb + ".cubin");
  if (fs::exists(f)) { crt::NvrtcResult r; const std::string b = readFile(f); r.cubin.assign(b.begin(), b.end()); r.ok = true; if (hit) *hit = true; return r; }
  if (hit) *hit = false;
  auto r = crt::nvrtcCompile(source, name, kdir, arch);
  if (r.ok) std::ofstream(f, std::ios::binary).write(r.cubin.data(), (std::streamsize)r.cubin.size());
  return r;
}
static std::string firstLines(const std::string& s, int n) {
  std::stringstream in(s), out; std::string line; int k = 0;
  while (k < n && std::getline(in, line)) if (line.find("error") != std::string::npos || k > 0) { out << line << "\n"; k++; }
  return out.str().empty() ? s.substr(0, 400) : out.str();
}

static int cmdCudaSweep(int argc, char** argv) {
  const std::string bundle = arg(argc, argv, "--bundle", "dist-core/candela-core.js");
  const std::string content = arg(argc, argv, "--content", "content");
  const std::string ids = arg(argc, argv, "--ids", "");
  const std::string jsonOut = arg(argc, argv, "--json", "");
  const std::string kdir = kernelsDir(argc, argv);
  const int jobs = std::stoi(arg(argc, argv, "--jobs", std::to_string(std::max(1u, std::thread::hardware_concurrency() / 2)).c_str()));

  crt::CudaContext cuda;
  const std::string arch = cuda.arch();
  struct Job { std::string id, source, hash, stage, error; bool ok = false; double translateMs = 0, compileMs = 0; size_t cubin = 0; int lines = 0, regs = 0, local = 0; std::string log; std::vector<char> bin; };
  std::vector<Job> jobsV;
  {
    crt::JsRuntime rt;
    v8::Isolate::Scope is(rt.isolate());
    v8::HandleScope hs(rt.isolate());
    v8::Context::Scope cs(rt.context());
    rt.onConsole = [&](const std::string& level, const std::string& text) { if (level == "error") fprintf(stderr, "[js %s] %s\n", level.c_str(), text.substr(0, 300).c_str()); };
    rt.runScript(readFile(bundle), bundle);
    size_t nFiles = 0, nBytes = 0;
    auto contentObj = readContent(rt, content, &nFiles, &nBytes);
    auto idsArr = v8::Array::New(rt.isolate());
    { std::stringstream ss(ids); std::string id; uint32_t n = 0; while (std::getline(ss, id, ',')) if (!id.empty()) idsArr->Set(rt.context(), n++, rt.str(id)).Check(); }
    auto res = rt.call("Candela", "cudaCatalog", {contentObj, idsArr, rt.str("cuda")}).As<v8::Array>();
    for (uint32_t i = 0; i < res->Length(); i++) {
      auto r = res->Get(rt.context(), i).ToLocalChecked();
      Job j;
      j.id = rt.toStdString(rt.get(r, "id"));
      j.ok = rt.get(r, "ok")->IsTrue();
      if (!j.ok) { j.stage = rt.toStdString(rt.get(r, "stage")); j.error = rt.toStdString(rt.get(r, "error")); }
      else { j.source = rt.toStdString(rt.get(r, "source")); j.hash = rt.toStdString(rt.get(r, "hash")); j.lines = (int)rt.get(r, "lines").As<v8::Number>()->Value(); j.translateMs = rt.get(r, "translateMs").As<v8::Number>()->Value(); }
      jobsV.push_back(std::move(j));
    }
  }
  printf("%s (%s), NVRTC, %zu presets, %d compile threads\n", cuda.deviceName().c_str(), arch.c_str(), jobsV.size(), jobs);
  const fs::path cache = cacheDir(argc, argv);
  std::atomic<size_t> next{0};
  std::mutex printMu;
  auto worker = [&]() {
    for (size_t i; (i = next++) < jobsV.size();) {
      Job& j = jobsV[i];
      if (!j.ok) continue;
      bool hit = false;
      auto r = compileCached(j.source, j.hash, j.id + ".cu", kdir, arch, cache, &hit);
      j.compileMs = hit ? 0 : r.ms; j.ok = r.ok; j.log = r.log; j.cubin = r.cubin.size(); j.bin = std::move(r.cubin);
      if (!r.ok) { j.stage = "nvrtc"; j.error = firstLines(r.log, 6); }
      std::lock_guard<std::mutex> lk(printMu);
      fprintf(stderr, "  %-6s %s %s\n", j.id.c_str(), j.ok ? "ok" : "FAILED", hit ? "(cached)" : "");
    }
  };
  const auto t0 = std::chrono::steady_clock::now();
  std::vector<std::thread> pool;
  for (int k = 0; k < jobs; k++) pool.emplace_back(worker);
  for (auto& t : pool) t.join();
  const double wallS = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  // load every module once: registers and local memory of candela_main
  int ok = 0; double sumMs = 0, maxMs = 0; int compiled = 0;
  for (auto& j : jobsV) {
    if (!j.ok) continue;
    CUmodule m; CUfunction f;
    if (cuModuleLoadData(&m, j.bin.data()) != CUDA_SUCCESS || cuModuleGetFunction(&f, m, "candela_main") != CUDA_SUCCESS) { j.ok = false; j.stage = "load"; j.error = "cuModuleLoadData failed"; continue; }
    cuFuncGetAttribute(&j.regs, CU_FUNC_ATTRIBUTE_NUM_REGS, f);
    cuFuncGetAttribute(&j.local, CU_FUNC_ATTRIBUTE_LOCAL_SIZE_BYTES, f);
    cuModuleUnload(m);
    ok++;
    if (j.compileMs > 0) { sumMs += j.compileMs; maxMs = std::max(maxMs, j.compileMs); compiled++; }
  }
  for (auto& j : jobsV) {
    if (j.ok) printf("  %-6s %5d lines  translate %5.1f ms  nvrtc %7.0f ms  cubin %5zu KiB  regs %3d  local %5d B\n", j.id.c_str(), j.lines, j.translateMs, j.compileMs, j.cubin / 1024, j.regs, j.local);
    else printf("  %-6s FAILED at %s: %s\n", j.id.c_str(), j.stage.c_str(), j.error.substr(0, 600).c_str());
  }
  printf("%d/%zu presets compiled and loaded; %d compiled now (mean %.0f ms, max %.0f ms), wall %.1f s\n", ok, jobsV.size(), compiled, compiled ? sumMs / compiled : 0, maxMs, wallS);
  if (!jsonOut.empty()) {
    std::ofstream o(jsonOut);
    o << "[";
    for (size_t i = 0; i < jobsV.size(); i++) {
      const auto& j = jobsV[i];
      std::string err; for (char c : j.error) { if (c == '"' || c == '\\') err += '\\'; if (c == '\n') { err += "\\n"; continue; } if ((unsigned char)c >= 0x20) err += c; }
      o << (i ? ",\n" : "\n") << "{\"id\":\"" << j.id << "\",\"ok\":" << (j.ok ? "true" : "false") << ",\"lines\":" << j.lines << ",\"translateMs\":" << j.translateMs
        << ",\"compileMs\":" << j.compileMs << ",\"cubinBytes\":" << j.cubin << ",\"regs\":" << j.regs << ",\"localBytes\":" << j.local
        << ",\"stage\":\"" << j.stage << "\",\"error\":\"" << err << "\"}";
    }
    o << "\n]\n";
  }
  return ok == (int)jobsV.size() ? 0 : 2;
}

static void writePFM(const fs::path& f, int w, int h, const std::vector<float>& accum) {
  std::ofstream o(f, std::ios::binary);
  o << "PF\n" << w << " " << h << "\n-1.0\n";
  std::vector<float> row(size_t(w) * 3);
  for (int y = h - 1; y >= 0; y--) {
    for (int x = 0; x < w; x++) {
      const float* a = &accum[(size_t(y) * w + x) * 4];
      const float n = a[3] != 0.f ? a[3] : 1.f;
      row[x * 3] = a[0] / n; row[x * 3 + 1] = a[1] / n; row[x * 3 + 2] = a[2] / n;
    }
    o.write(reinterpret_cast<const char*>(row.data()), (std::streamsize)(row.size() * 4));
  }
}

static int cmdRender(int argc, char** argv) {
  if (argc < 3 || argv[2][0] == '-') { fprintf(stderr, "usage: candela-rt render <preset id> [options]\n"); return 1; }
  const std::string id = argv[2];
  const std::string bundle = arg(argc, argv, "--bundle", "dist-core/candela-core.js");
  const std::string content = arg(argc, argv, "--content", "content");
  const std::string size = arg(argc, argv, "--size", "640x360");
  const int sppTarget = std::stoi(arg(argc, argv, "--spp", "64"));
  const double time = std::stod(arg(argc, argv, "--time", "0"));
  const fs::path outDir = arg(argc, argv, "--out", "build/parity");
  const std::string kdir = kernelsDir(argc, argv);
  const int w = std::stoi(size.substr(0, size.find('x'))), h = std::stoi(size.substr(size.find('x') + 1));
  bool aov = false; for (int i = 1; i < argc; i++) if (std::string(argv[i]) == "--aov") aov = true;
  fs::create_directories(outDir);

  crt::CudaContext cuda;
  crt::JsRuntime rt;
  v8::Isolate::Scope is(rt.isolate());
  v8::HandleScope hs(rt.isolate());
  v8::Context::Scope cs(rt.context());
  rt.onConsole = [&](const std::string& level, const std::string& text) { if (level == "warn" || level == "error") fprintf(stderr, "[js %s] %s\n", level.c_str(), text.substr(0, 300).c_str()); };
  rt.runScript(readFile(bundle), bundle);
  size_t nFiles = 0, nBytes = 0;
  auto contentObj = readContent(rt, content, &nFiles, &nBytes);
  const auto t0 = std::chrono::steady_clock::now();
  auto opts = rt.fromJSON("{\"width\":" + std::to_string(w) + ",\"height\":" + std::to_string(h) + ",\"time\":" + std::to_string(time) + ",\"target\":\"cuda\"}");
  auto hr = rt.call("Candela", "openRenderPreset", {contentObj, rt.str(id), opts});
  if (!rt.get(hr, "ok")->IsTrue()) { fprintf(stderr, "%s: %s\n", id.c_str(), rt.toStdString(rt.get(hr, "error")).c_str()); return 2; }
  auto H = hr.As<v8::Object>();
  const double buildMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  auto prog = rt.get(H, "cuda");
  const std::string source = rt.toStdString(rt.get(prog, "source")), hash = rt.toStdString(rt.get(prog, "hash"));
  bool hit = false;
  auto comp = compileCached(source, hash, id + ".cu", kdir, cuda.arch(), cacheDir(argc, argv), &hit);
  if (!comp.ok) { fprintf(stderr, "%s: NVRTC failed:\n%s\n", id.c_str(), comp.log.c_str()); return 2; }
  crt::CudaRenderer R(comp.cubin, w, h);
  R.upload(rt.view<float>(rt.get(H, "O")), rt.view<float>(rt.get(H, "LI")), rt.view<float>(rt.get(H, "BV")), rt.view<float>(rt.get(H, "SD")));
  const auto t1 = std::chrono::steady_clock::now();
  int launches = 0;
  double jsMs = 0;
  while (rt.get(H, "spp").As<v8::Number>()->Value() < sppTarget) {
    v8::HandleScope fs_(rt.isolate());
    const auto a = std::chrono::steady_clock::now();
    auto U = rt.callMethod(H, "frame", {});
    jsMs += std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - a).count();
    R.launch(rt.view<float>(U));
    launches++;
  }
  auto acc = R.readAccum();
  const double renderMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t1).count();
  const int spp = (int)rt.get(H, "spp").As<v8::Number>()->Value();
  const fs::path base = outDir / (id + ".cuda");
  writePFM(base.string() + ".pfm", w, h, acc);
  if (aov) writePFM(base.string() + ".albedo.pfm", w, h, R.readAlbedo());
  std::ofstream(base.string() + ".json") << "{\"id\":\"" << id << "\",\"backend\":\"cuda-nvrtc\",\"width\":" << w << ",\"height\":" << h << ",\"time\":" << time
      << ",\"spp\":" << spp << ",\"launches\":" << launches << ",\"buildMs\":" << buildMs << ",\"compileMs\":" << (hit ? 0 : comp.ms) << ",\"cached\":" << (hit ? "true" : "false")
      << ",\"renderMs\":" << renderMs << ",\"jsMs\":" << jsMs << ",\"registers\":" << R.registers() << ",\"localBytes\":" << R.localBytes()
      << ",\"sppPerSec\":" << spp * double(w) * h / (renderMs / 1000) << "}\n";
  printf("%s cuda/nvrtc: %dx%d %d spp in %d launches; build %.0f ms, nvrtc %s, render %.0f ms (js %.1f ms), %d regs, %d B local → %s.pfm\n", id.c_str(), w, h, spp, launches, buildMs,
         hit ? "cached" : (std::to_string((int)comp.ms) + " ms").c_str(), renderMs, jsMs, R.registers(), R.localBytes(), base.string().c_str());
  return 0;
}

int main(int argc, char** argv) {
  if (argc < 2 || std::string(argv[1]) == "--help") {
    fprintf(stderr, "usage: candela-rt digest  [--bundle f] [--content dir] [--ids a,b] [--times 0,0.37] [--json out]\n"
                    "       candela-rt session [--bundle f] [--content dir] [--ids a,b] [--frames 48] [--fps 24] [--json out]\n"
                    "       candela-rt cuda-sweep [--ids a,b] [--jobs n] [--json out] [--kernels dir] [--cache dir]\n"
                    "       candela-rt render <id> [--size WxH] [--spp n] [--time t] [--out dir] [--aov]\n");
    return 1;
  }
  crt::JsRuntime::initProcess(argv[0]);
  int rc = 1;
  try {
    if (std::string(argv[1]) == "digest") rc = cmdDigest(argc, argv);
    else if (std::string(argv[1]) == "session") rc = cmdSession(argc, argv);
    else if (std::string(argv[1]) == "cuda-sweep") rc = cmdCudaSweep(argc, argv);
    else if (std::string(argv[1]) == "render") rc = cmdRender(argc, argv);
    else fprintf(stderr, "unknown command %s\n", argv[1]);
  } catch (const std::exception& e) {
    fprintf(stderr, "error: %s\n", e.what());
    rc = 1;
  }
  crt::JsRuntime::shutdownProcess();
  return rc;
}
