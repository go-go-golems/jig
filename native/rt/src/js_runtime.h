// js_runtime.h — V8 embedded in candela-rt (CANDELA-002 design doc 02, §6.2). One JsRuntime owns one isolate and one
// context whose global object holds only what the engine bundle needs (console, performance.now, atob, btoa): scene
// code has no file or network access. All calls happen on the thread that created the runtime.
#pragma once
#include <v8.h>

#include <chrono>
#include <functional>
#include <memory>
#include <cstring>
#include <span>
#include <stdexcept>
#include <string>

namespace crt {

// a JavaScript exception, with the message and stack V8 reported
struct JsError : std::runtime_error { using std::runtime_error::runtime_error; };

class JsRuntime {
 public:
  // process-wide V8 initialisation; call once before creating runtimes
  static void initProcess(const char* argv0);
  static void shutdownProcess();

  explicit JsRuntime(size_t heapLimitBytes = size_t(4) << 30);
  ~JsRuntime();
  JsRuntime(const JsRuntime&) = delete;
  JsRuntime& operator=(const JsRuntime&) = delete;

  v8::Isolate* isolate() const { return iso_; }
  v8::Local<v8::Context> context() const { return ctx_.Get(iso_); }

  // compile and run a script (the engine bundle); throws JsError
  void runScript(const std::string& source, const std::string& name);
  // globalThis.<objectName>.<method>(args…); if the result is a promise, pump microtasks until it settles
  v8::Local<v8::Value> call(const char* objectName, const char* method, std::initializer_list<v8::Local<v8::Value>> args);
  // obj.<method>(args…), with the same promise handling
  v8::Local<v8::Value> callMethod(v8::Local<v8::Object> obj, const char* method, std::initializer_list<v8::Local<v8::Value>> args);
  // obj[key], or undefined
  v8::Local<v8::Value> get(v8::Local<v8::Value> obj, const char* key) const;
  // wait for a promise: microtask checkpoints and platform tasks until it is no longer pending
  v8::Local<v8::Value> settle(v8::Local<v8::Value> maybePromise);

  // value helpers
  v8::Local<v8::String> str(const std::string& s) const;
  std::string toStdString(v8::Local<v8::Value> v) const;
  std::string toJSON(v8::Local<v8::Value> v) const;
  v8::Local<v8::Value> fromJSON(const std::string& json) const;

  // zero-copy view of a typed array's bytes (valid while the array is alive)
  /** a new Float32Array holding a copy of data */
  v8::Local<v8::Float32Array> floats(const float* data, size_t n) const {
    auto ab = v8::ArrayBuffer::New(iso_, n * sizeof(float));
    if (n) std::memcpy(ab->GetBackingStore()->Data(), data, n * sizeof(float));
    return v8::Float32Array::New(ab, 0, n);
  }
  template <class T> std::span<const T> view(v8::Local<v8::Value> v) const {
    auto a = v.As<v8::ArrayBufferView>();
    auto* base = static_cast<const uint8_t*>(a->Buffer()->GetBackingStore()->Data());
    return {reinterpret_cast<const T*>(base + a->ByteOffset()), a->ByteLength() / sizeof(T)};
  }

  // the sink for console.* from scene and engine code (level: log, info, warn, error, debug)
  std::function<void(const std::string& level, const std::string& text)> onConsole;

 private:
  [[noreturn]] void rethrow(v8::TryCatch& tc) const;
  v8::Isolate* iso_ = nullptr;
  v8::ArrayBuffer::Allocator* alloc_ = nullptr;
  v8::Global<v8::Context> ctx_;
};

}  // namespace crt
