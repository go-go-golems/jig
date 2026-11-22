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
#include <memory>
#include <thread>

#include "cuda_runner.h"
#include "optix_renderer.h"
#include "js_runtime.h"
#include "image_io.h"
#include "post.h"

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
static crt::NvrtcResult compileCached(const std::string& source, const std::string& hash, const std::string& name, const std::string& kdir, const std::string& arch, const fs::path& cache, bool* hit, bool optixIR = false) {
  uint64_t fh = 1469598103934665603ull; for (unsigned char c : crt::nvrtcOptionsKey()) { fh ^= c; fh *= 1099511628211ull; }
  char fb[9]; snprintf(fb, sizeof fb, "%08x", (unsigned)(fh & 0xffffffffu));
  const fs::path f = cache / (hash + "-" + headersHash(kdir) + "-" + arch + "-" + fb + (optixIR ? ".optixir" : ".cubin"));
  if (fs::exists(f)) { crt::NvrtcResult r; const std::string b = readFile(f); r.cubin.assign(b.begin(), b.end()); r.ok = true; if (hit) *hit = true; return r; }
  if (hit) *hit = false;
  auto r = optixIR ? crt::nvrtcCompile(source, name, kdir, arch, true, {CANDELA_OPTIX_INCLUDE_DIR, CANDELA_CUDA_INCLUDE_DIR})
                   : crt::nvrtcCompile(source, name, kdir, arch);
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
  const std::string backend = arg(argc, argv, "--backend", "cuda");
  const bool optix = backend == "optix";

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
    auto res = rt.call("Candela", "cudaCatalog", {contentObj, idsArr, rt.str(backend)}).As<v8::Array>();
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
  printf("%s (%s), NVRTC → %s, %zu presets, %d compile threads\n", cuda.deviceName().c_str(), arch.c_str(), optix ? "OptiX-IR" : "cubin", jobsV.size(), jobs);
  const fs::path cache = cacheDir(argc, argv);
  std::atomic<size_t> next{0};
  std::mutex printMu;
  auto worker = [&]() {
    for (size_t i; (i = next++) < jobsV.size();) {
      Job& j = jobsV[i];
      if (!j.ok) continue;
      bool hit = false;
      auto r = compileCached(j.source, j.hash, j.id + ".cu", kdir, arch, cache, &hit, optix);
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
    if (optix) {   // create the OptiX module and pipeline once (what a render would do), without a scene
      try { crt::OptixRenderer R(cuda.ctx(), j.bin, 16, 16); } catch (const std::exception& e) { j.ok = false; j.stage = "optix"; j.error = e.what(); continue; }
      ok++;
      if (j.compileMs > 0) { sumMs += j.compileMs; maxMs = std::max(maxMs, j.compileMs); compiled++; }
      continue;
    }
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

static bool hasFlag(int argc, char** argv, const char* name) { for (int i = 1; i < argc; i++) if (std::string(argv[i]) == name) return true; return false; }
static std::vector<std::string> args(int argc, char** argv, const char* name) {
  std::vector<std::string> v;
  for (int i = 1; i + 1 < argc; i++) if (std::string(argv[i]) == name) v.push_back(argv[i + 1]);
  return v;
}
static std::string jsonString(const std::string& s) {
  std::string o = "\"";
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; if ((unsigned char)c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; } else o += c; }
  return o + "\"";
}
// --param id=value: numbers, true/false, JSON arrays/objects as such; anything else is a string (choice params)
static std::string paramsJSON(int argc, char** argv) {
  std::string o = "{";
  for (const auto& kv : args(argc, argv, "--param")) {
    const size_t eq = kv.find('=');
    if (eq == std::string::npos) throw std::runtime_error("--param wants id=value, got " + kv);
    const std::string k = kv.substr(0, eq), v = kv.substr(eq + 1);
    char* end = nullptr;
    strtod(v.c_str(), &end);
    const bool num = !v.empty() && end && *end == 0;
    const bool lit = v == "true" || v == "false" || (!v.empty() && (v[0] == '[' || v[0] == '{'));
    o += (o.size() > 1 ? "," : "") + jsonString(k) + ":" + (num || lit ? v : jsonString(v));
  }
  return o + "}";
}
static std::string pad4(int n) { char b[16]; snprintf(b, sizeof b, "%04d", n); return b; }
static std::string msText(bool hit, double ms) { return hit ? "cached" : std::to_string((int)ms) + " ms"; }

// render: a still or a sequence of one preset, through either target. Each frame: seek (behaviours step by 1/fps),
// repack, upload, accumulate `spp` samples, then the requested outputs — PFM (linear, for parity), PNG and MP4 (the
// display program: the workbench's denoise, exposure, tone map), EXR (beauty × exposure, albedo, normal, Z, ids).
// The exposure is metered on the first frame and held, as the workbench's render queue does (output.ts runRender).
static int cmdRender(int argc, char** argv) {
  if (argc < 3 || argv[2][0] == '-') { fprintf(stderr, "usage: candela-rt render <preset id> [options]\n"); return 1; }
  const std::string id = argv[2];
  const std::string bundle = arg(argc, argv, "--bundle", "dist-core/candela-core.js");
  const std::string content = arg(argc, argv, "--content", "content");
  const std::string size = arg(argc, argv, "--size", "640x360");
  const int sppTarget = std::stoi(arg(argc, argv, "--spp", "64"));
  const std::string requested = arg(argc, argv, "--backend", "auto");
  if (requested != "cuda" && requested != "optix" && requested != "auto") { fprintf(stderr, "--backend auto|cuda|optix\n"); return 1; }
  const std::string kdir = kernelsDir(argc, argv);
  int w = std::stoi(size.substr(0, size.find('x'))), h = std::stoi(size.substr(size.find('x') + 1));
  const bool aov = hasFlag(argc, argv, "--aov"), noMotion = hasFlag(argc, argv, "--no-motion-blur");
  // outputs
  const std::string formats = arg(argc, argv, "--format", "pfm");
  auto want = [&](const char* f) { return ("," + formats + ",").find(std::string(",") + f + ",") != std::string::npos; };
  const bool wPfm = want("pfm"), wPng = want("png"), wExr = want("exr"), wMp4 = want("mp4");
  if (!wPfm && !wPng && !wExr && !wMp4) { fprintf(stderr, "--format: a comma list of pfm, png, exr, mp4\n"); return 1; }
  const bool parityOnly = wPfm && !wPng && !wExr && !wMp4;
  if (wMp4) { w -= w % 2; h -= h % 2; }   // 4:2:0 video wants even dimensions
  // time: a still at --time, or a sequence from --start to --end at --fps (end inclusive, as the workbench's jobs)
  const bool sequence = hasFlag(argc, argv, "--sequence") || !args(argc, argv, "--end").empty() || !args(argc, argv, "--frames").empty();
  const double fps = std::stod(arg(argc, argv, "--fps", "24"));
  // a still without --time: the preset's start time (resolved by the engine); `start` is then reported as -1
  const bool timeGiven = sequence || !args(argc, argv, "--time").empty();
  const double start = std::stod(arg(argc, argv, sequence ? "--start" : "--time", timeGiven ? "0" : "-1"));
  const double end = std::stod(arg(argc, argv, "--end", std::to_string(start + 1).c_str()));
  const int frames = sequence ? (args(argc, argv, "--frames").empty() ? std::max(1, (int)std::lround((end - start) * fps) + 1) : std::stoi(arg(argc, argv, "--frames", "1"))) : 1;
  if (wMp4 && !sequence) { fprintf(stderr, "--format mp4 needs a sequence (--end or --frames)\n"); return 1; }
  const int seed = std::stoi(arg(argc, argv, "--seed", parityOnly ? "0" : "1"));
  const bool fixedSeed = hasFlag(argc, argv, "--fixed-seed");
  const int firstFrame = std::stoi(arg(argc, argv, "--first-frame", "1"));
  const char* home = getenv("HOME");
  const fs::path outDir = arg(argc, argv, "--out", parityOnly ? "build/parity" : (std::string(home ? home : ".") + "/data/pbr-spark/renders/" + id).c_str());
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
  auto opts = rt.fromJSON("{\"width\":" + std::to_string(w) + ",\"height\":" + std::to_string(h) + (timeGiven ? ",\"time\":" + std::to_string(start) : std::string()) + ",\"seed\":" + std::to_string(seed) +
                          ",\"target\":\"" + requested + "\"" + (noMotion ? ",\"motionBlur\":false" : "") + ",\"params\":" + paramsJSON(argc, argv) + "}");
  auto hr = rt.call("Candela", "openRenderPreset", {contentObj, rt.str(id), opts});
  if (!rt.get(hr, "ok")->IsTrue()) { fprintf(stderr, "%s: %s\n", id.c_str(), rt.toStdString(rt.get(hr, "error")).c_str()); return 2; }
  auto H = hr.As<v8::Object>();
  // the engine resolves 'auto': OptiX for meshes or many objects, plain CUDA otherwise (src/engine/headless.ts)
  const std::string backend = rt.toStdString(rt.get(H, "target"));
  const bool optix = backend == "optix";
  const std::string stem = arg(argc, argv, "--name", parityOnly ? (id + "." + backend).c_str() : id.c_str());
  const double buildMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  auto prog = rt.get(H, "cuda");
  bool hit = false;
  auto comp = compileCached(rt.toStdString(rt.get(prog, "source")), rt.toStdString(rt.get(prog, "hash")), id + ".cu", kdir, cuda.arch(), cacheDir(argc, argv), &hit, optix);
  if (!comp.ok) { fprintf(stderr, "%s: NVRTC failed:\n%s\n", id.c_str(), comp.log.c_str()); return 2; }
  const bool display = wPng || wMp4;
  std::unique_ptr<crt::PostProcessor> post;
  bool postHit = false;
  double postMs = 0;
  if (display) {
    auto pp = rt.get(H, "post");
    auto pc = compileCached(rt.toStdString(rt.get(pp, "source")), rt.toStdString(rt.get(pp, "hash")), id + ".post.cu", kdir, cuda.arch(), cacheDir(argc, argv), &postHit, false);
    if (!pc.ok) { fprintf(stderr, "%s: NVRTC failed on the display program:\n%s\n", id.c_str(), pc.log.c_str()); return 2; }
    postMs = pc.ms;
    post = std::make_unique<crt::PostProcessor>(pc.cubin, w, h);
  }
  std::unique_ptr<crt::Renderer> R;
  crt::OptixRenderer* RO = nullptr;
  auto X = rt.get(H, "optix");
  if (optix) {
    auto ro = std::make_unique<crt::OptixRenderer>(cuda.ctx(), comp.cubin, w, h, rt.get(X, "motion")->IsTrue());
    RO = ro.get();
    std::vector<crt::OptixMeshInput> meshes;
    auto ma = rt.get(X, "meshes").As<v8::Array>();
    for (uint32_t i = 0; i < ma->Length(); i++) {
      auto m = ma->Get(rt.context(), i).ToLocalChecked();
      meshes.push_back({rt.view<float>(rt.get(m, "vertices")), (unsigned)rt.get(m, "count").As<v8::Number>()->Value()});
    }
    RO->buildMeshes(meshes);
    R = std::move(ro);
  } else {
    R = std::make_unique<crt::CudaRenderer>(comp.cubin, w, h);
  }
  auto num = [&](v8::Local<v8::Value> o, const char* k) { return rt.get(o, k).As<v8::Number>()->Value(); };
  double lastVersion = -1;
  auto sync = [&]() {   // upload what the last seek changed
    const double v = num(H, "version");
    if (v == lastVersion) return;
    lastVersion = v;
    if (RO) RO->setFrame(rt.view<float>(rt.get(X, "instances")), rt.view<float>(rt.get(X, "srt")), (int)num(X, "motionKeys"), rt.view<float>(rt.get(X, "aabbs")), rt.view<int>(rt.get(X, "aabbObjects")));
    R->upload(rt.view<float>(rt.get(H, "O")), rt.view<float>(rt.get(H, "LI")), rt.view<float>(rt.get(H, "BV")), rt.view<float>(rt.get(H, "SD")));
  };
  std::unique_ptr<crt::VideoWriter> video;
  if (wMp4) video = std::make_unique<crt::VideoWriter>(outDir / (stem + ".mp4"), w, h, fps, arg(argc, argv, "--codec", "h264"), arg(argc, argv, "--quality", "high"));

  int launches = 0;
  double jsMs = 0, renderMs = 0, outMs = 0, asMs = 0, ev = 0;
  std::vector<double> frameMs;
  const auto tJob = std::chrono::steady_clock::now();
  for (int f = 0; f < frames; f++) {
    v8::HandleScope fs_(rt.isolate());
    const double t = sequence ? start + f / fps : num(H, "time");
    const auto ta = std::chrono::steady_clock::now();
    if (f > 0) rt.callMethod(H, "seek", {v8::Number::New(rt.isolate(), t), v8::Number::New(rt.isolate(), 1.0 / fps), v8::Number::New(rt.isolate(), seed + (fixedSeed ? 0 : f))});
    sync();
    if (RO) asMs += RO->frameBuildMs();
    while (num(H, "spp") < sppTarget) {
      v8::HandleScope ls(rt.isolate());
      const auto a = std::chrono::steady_clock::now();
      auto U = rt.callMethod(H, "frame", {});
      jsMs += std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - a).count();
      R->launch(rt.view<float>(U));
      launches++;
    }
    R->sync();
    const auto tb = std::chrono::steady_clock::now();
    renderMs += std::chrono::duration<double, std::milli>(tb - ta).count();
    const std::string fstem = sequence ? stem + "." + pad4(f + firstFrame) : stem;
    std::vector<float> acc;
    if (wPfm || wExr || (f == 0 && (display || wExr))) acc = R->readAccum();
    if (f == 0 && (display || wExr)) ev = rt.callMethod(H, "meter", {rt.floats(acc.data(), acc.size())}).As<v8::Number>()->Value();
    if (wPfm) {
      crt::writePFM(outDir / (fstem + ".pfm"), w, h, acc);
      if (aov) crt::writePFM(outDir / (fstem + ".albedo.pfm"), w, h, R->readAlbedo());
    }
    if (display) {
      auto d = rt.callMethod(H, "display", {});
      post->run(rt.view<float>(rt.get(d, "D")), (int)num(d, "steps"), (float)num(d, "sigma"), R->accumBuffer(), R->albedoBuffer(), R->normalBuffer());
      auto rgba = post->readRGBA8();
      if (wPng) crt::writePNG(outDir / (fstem + ".png"), w, h, rgba);
      if (video) video->add(rgba);
    }
    if (wExr) {
      auto alb = R->readAlbedo(), nrm = R->readNormal();
      // the id pass overwrites the accumulation buffer: last
      auto U = rt.callMethod(H, "idUniforms", {});
      R->launch(rt.view<float>(U));
      auto ids = R->readAccum();
      auto bytes = rt.callMethod(H, "exr", {rt.floats(acc.data(), acc.size()), rt.floats(alb.data(), alb.size()), rt.floats(nrm.data(), nrm.size()), rt.floats(ids.data(), ids.size())});
      auto view = rt.view<uint8_t>(bytes);
      crt::writeFile(outDir / (fstem + ".exr"), view.data(), view.size());
    }
    const auto tc = std::chrono::steady_clock::now();
    outMs += std::chrono::duration<double, std::milli>(tc - tb).count();
    frameMs.push_back(std::chrono::duration<double, std::milli>(tc - ta).count());
    if (sequence) printf("  frame %d/%d  t=%.4f  %.0f ms\n", f + 1, frames, t, frameMs.back()), fflush(stdout);
  }
  if (video) video->finish();
  const double jobMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - tJob).count();
  const int spp = (int)num(H, "spp");
  const int regs = optix ? 0 : static_cast<crt::CudaRenderer*>(R.get())->registers(), local = optix ? 0 : static_cast<crt::CudaRenderer*>(R.get())->localBytes();
  std::ostringstream fm;
  for (size_t i = 0; i < frameMs.size(); i++) fm << (i ? "," : "") << frameMs[i];
  std::ofstream(outDir / (stem + ".json")) << "{\"id\":\"" << id << "\",\"backend\":\"" << backend << "\",\"formats\":" << jsonString(formats) << ",\"asBuildMs\":" << (optix ? RO->buildMs() : 0.0)
      << ",\"pipelineMs\":" << (optix ? RO->pipelineMs() : 0.0) << ",\"motion\":" << (optix && RO->motion() ? "true" : "false") << ",\"width\":" << w << ",\"height\":" << h << ",\"time\":" << (sequence ? start : num(H, "time"))
      << ",\"frames\":" << frames << ",\"fps\":" << fps << ",\"spp\":" << spp << ",\"launches\":" << launches << ",\"buildMs\":" << buildMs << ",\"compileMs\":" << (hit ? 0 : comp.ms) << ",\"cached\":" << (hit ? "true" : "false")
      << ",\"renderMs\":" << renderMs << ",\"outputMs\":" << outMs << ",\"jobMs\":" << jobMs << ",\"jsMs\":" << jsMs << ",\"ev\":" << ev << ",\"registers\":" << regs << ",\"localBytes\":" << local
      << ",\"sppPerSec\":" << spp * double(w) * h * frames / (renderMs / 1000) << ",\"frameMs\":[" << fm.str() << "]}\n";
  const std::string what = sequence ? std::to_string(frames) + " frames, " : "";
  if (optix) printf("%s optix%s: %dx%d %s%d spp in %d launches; build %.0f ms, nvrtc %s, pipeline %.0f ms, AS %.1f ms (%.0f KiB), render %.0f ms (js %.1f ms), output %.0f ms → %s\n", id.c_str(), RO->motion() ? " +motion" : "", w, h, what.c_str(), spp, launches, buildMs,
         msText(hit, comp.ms).c_str(), RO->pipelineMs(), sequence ? asMs : RO->buildMs(), RO->gasBytes() / 1024.0, renderMs, jsMs, outMs, (outDir / stem).string().c_str());
  else printf("%s cuda/nvrtc: %dx%d %s%d spp in %d launches; build %.0f ms, nvrtc %s, render %.0f ms (js %.1f ms), output %.0f ms, %d regs, %d B local → %s\n", id.c_str(), w, h, what.c_str(), spp, launches, buildMs,
         msText(hit, comp.ms).c_str(), renderMs, jsMs, outMs, regs, local, (outDir / stem).string().c_str());
  if (display && !postHit) printf("  display program: nvrtc %.0f ms\n", postMs);
  return 0;
}

int main(int argc, char** argv) {
  if (argc < 2 || std::string(argv[1]) == "--help") {
    fprintf(stderr, "usage: candela-rt digest  [--bundle f] [--content dir] [--ids a,b] [--times 0,0.37] [--json out]\n"
                    "       candela-rt session [--bundle f] [--content dir] [--ids a,b] [--frames 48] [--fps 24] [--json out]\n"
                    "       candela-rt cuda-sweep [--backend cuda|optix] [--ids a,b] [--jobs n] [--json out] [--kernels dir] [--cache dir]\n"
                    "       candela-rt render <id> [--backend auto|cuda|optix] [--size WxH] [--spp n] [--time t] [--param id=value]… [--seed n]\n"
                    "                 [--format pfm,png,exr,mp4] [--sequence --start s --end s | --frames n] [--fps 24] [--fixed-seed]\n"
                    "                 [--codec h264|hevc|av1] [--quality draft|standard|high|max] [--name stem] [--out dir] [--aov] [--no-motion-blur]\n");
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
