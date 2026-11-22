// candela-rt — Candela's native render runtime (CANDELA-002 design doc 02). Phase 0: V8 embedding.
//
//   candela-rt digest  [--bundle dist-core/candela-core.js] [--content content] [--ids B-01,K-09] [--times 0,0.37,1.5]
//                      [--json out.json]
//   candela-rt session [--bundle …] [--content …] [--ids W-01,K-09] [--frames 48] [--fps 24] [--json out.json]
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

int main(int argc, char** argv) {
  if (argc < 2 || std::string(argv[1]) == "--help") {
    fprintf(stderr, "usage: candela-rt digest  [--bundle f] [--content dir] [--ids a,b] [--times 0,0.37] [--json out]\n"
                    "       candela-rt session [--bundle f] [--content dir] [--ids a,b] [--frames 48] [--fps 24] [--json out]\n");
    return 1;
  }
  crt::JsRuntime::initProcess(argv[0]);
  int rc = 1;
  try {
    if (std::string(argv[1]) == "digest") rc = cmdDigest(argc, argv);
    else if (std::string(argv[1]) == "session") rc = cmdSession(argc, argv);
    else fprintf(stderr, "unknown command %s\n", argv[1]);
  } catch (const std::exception& e) {
    fprintf(stderr, "error: %s\n", e.what());
    rc = 1;
  }
  crt::JsRuntime::shutdownProcess();
  return rc;
}
