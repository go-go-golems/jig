// common.h — helpers shared by candela-rt's commands (main.cpp): arguments, files, the content directory as a JS
// object, and NVRTC compiles through the on-disk cache.
#pragma once
#include <filesystem>
#include <string>

#include <v8.h>

#include "cuda_runner.h"
#include "js_runtime.h"

std::string readFile(const std::filesystem::path& p);
std::string arg(int argc, char** argv, const char* name, const char* def);
bool hasFlag(int argc, char** argv, const char* name);
/** content/ as a JS object { 'presets/B-01-hello-sphere.js': '…', … } */
v8::Local<v8::Object> readContent(crt::JsRuntime& rt, const std::filesystem::path& dir, size_t* files, size_t* bytes);
std::string kernelsDir(int argc, char** argv);
std::filesystem::path cacheDir(int argc, char** argv);
/** compile through the cache: <cache>/<source hash>-<headers hash>-<arch>-<options hash>.cubin|.optixir */
crt::NvrtcResult compileCached(const std::string& source, const std::string& hash, const std::string& name, const std::string& kdir, const std::string& arch, const std::filesystem::path& cache, bool* hit, bool optixIR = false);
/** candela-rt serve (serve.cpp) */
int cmdServe(int argc, char** argv);
