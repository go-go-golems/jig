// js_runtime.cpp — see js_runtime.h. Written against V8 10.2 (libnode 18, Ubuntu's libnode-dev).
#include "js_runtime.h"

#include <libplatform/libplatform.h>

#include <cstdio>
#include <vector>

namespace crt {

static std::unique_ptr<v8::Platform> gPlatform;

void JsRuntime::initProcess(const char* argv0) {
  (void)argv0;   // libnode links system ICU and embeds its snapshot: no external data files to locate
  gPlatform = v8::platform::NewDefaultPlatform();
  v8::V8::InitializePlatform(gPlatform.get());
  v8::V8::Initialize();
}

void JsRuntime::shutdownProcess() {
  v8::V8::Dispose();
  v8::V8::DisposePlatform();
  gPlatform.reset();
}

// ---- host functions: the only globals scene code can reach besides the ECMAScript built-ins ----
static JsRuntime* runtimeOf(const v8::FunctionCallbackInfo<v8::Value>& info) {
  return static_cast<JsRuntime*>(info.Data().As<v8::Object>()->GetAlignedPointerFromInternalField(0));
}

static void hostConsole(const v8::FunctionCallbackInfo<v8::Value>& info) {
  auto* rt = runtimeOf(info);
  v8::Isolate* iso = info.GetIsolate();
  v8::HandleScope hs(iso);
  std::string text;
  for (int i = 0; i < info.Length(); i++) { if (i) text += ' '; text += rt->toStdString(info[i]); }
  v8::String::Utf8Value level(iso, info.Data().As<v8::Object>()->GetInternalField(1));
  if (rt->onConsole) rt->onConsole(*level ? *level : "log", text);
  else fprintf(stderr, "[js %s] %s\n", *level ? *level : "log", text.c_str());
}

static void hostNow(const v8::FunctionCallbackInfo<v8::Value>& info) {
  using namespace std::chrono;
  static const auto t0 = steady_clock::now();
  info.GetReturnValue().Set(duration<double, std::milli>(steady_clock::now() - t0).count());
}

static int b64val(unsigned char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+' || c == '-') return 62;
  if (c == '/' || c == '_') return 63;
  return -1;
}

// atob: base64 → a "binary string" (one char per byte), as in browsers
static void hostAtob(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* iso = info.GetIsolate();
  v8::String::Utf8Value in(iso, info[0]);
  std::vector<uint8_t> out; out.reserve(in.length() * 3 / 4);
  unsigned acc = 0; int bits = 0;
  for (int i = 0; i < in.length(); i++) {
    const int v = b64val((unsigned char)(*in)[i]);
    if (v < 0) continue;   // '=' padding and whitespace
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push_back((acc >> bits) & 0xff); }
  }
  info.GetReturnValue().Set(v8::String::NewFromOneByte(iso, out.data(), v8::NewStringType::kNormal, (int)out.size()).ToLocalChecked());
}

// btoa: a binary string → base64
static void hostBtoa(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* iso = info.GetIsolate();
  auto s = info[0]->ToString(iso->GetCurrentContext()).ToLocalChecked();
  std::vector<uint8_t> in(s->Length());
  s->WriteOneByte(iso, in.data(), 0, (int)in.size());
  static const char* T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  for (size_t i = 0; i < in.size(); i += 3) {
    const unsigned n = (in[i] << 16) | (i + 1 < in.size() ? in[i + 1] << 8 : 0) | (i + 2 < in.size() ? in[i + 2] : 0);
    out += T[(n >> 18) & 63]; out += T[(n >> 12) & 63];
    out += i + 1 < in.size() ? T[(n >> 6) & 63] : '='; out += i + 2 < in.size() ? T[n & 63] : '=';
  }
  info.GetReturnValue().Set(v8::String::NewFromUtf8(iso, out.c_str()).ToLocalChecked());
}

JsRuntime::JsRuntime(size_t heapLimitBytes) {
  alloc_ = v8::ArrayBuffer::Allocator::NewDefaultAllocator();
  v8::Isolate::CreateParams cp;
  cp.array_buffer_allocator = alloc_;
  cp.constraints.ConfigureDefaultsFromHeapSize(0, heapLimitBytes);
  iso_ = v8::Isolate::New(cp);
  // promises run only when we ask (settle()); with the default kAuto policy V8 runs them when the call depth
  // returns to zero, and an explicit checkpoint from inside a settle loop can make no progress
  iso_->SetMicrotasksPolicy(v8::MicrotasksPolicy::kExplicit);
  v8::Isolate::Scope is(iso_);
  v8::HandleScope hs(iso_);

  // a holder object carries `this` (and the console level) to the host callbacks
  auto holderT = v8::ObjectTemplate::New(iso_);
  holderT->SetInternalFieldCount(2);
  auto global = v8::ObjectTemplate::New(iso_);
  auto ctx = v8::Context::New(iso_, nullptr, global);
  v8::Context::Scope cs(ctx);
  ctx->AllowCodeGenerationFromStrings(true);   // build() creates modules with new Function
  auto g = ctx->Global();
  auto holder = [&](const char* level) {
    auto h = holderT->NewInstance(ctx).ToLocalChecked();
    h->SetAlignedPointerInInternalField(0, this);
    h->SetInternalField(1, str(level));
    return h;
  };
  auto fn = [&](v8::FunctionCallback cb, v8::Local<v8::Object> data) { return v8::Function::New(ctx, cb, data).ToLocalChecked(); };

  auto console = v8::Object::New(iso_);
  for (const char* level : {"log", "info", "warn", "error", "debug"}) console->Set(ctx, str(level), fn(hostConsole, holder(level))).Check();
  g->Set(ctx, str("console"), console).Check();
  auto perf = v8::Object::New(iso_);
  perf->Set(ctx, str("now"), fn(hostNow, holder("now"))).Check();
  g->Set(ctx, str("performance"), perf).Check();
  g->Set(ctx, str("atob"), fn(hostAtob, holder("atob"))).Check();
  g->Set(ctx, str("btoa"), fn(hostBtoa, holder("btoa"))).Check();
  g->Set(ctx, str("globalThis"), g).Check();
  ctx_.Reset(iso_, ctx);
}

JsRuntime::~JsRuntime() {
  ctx_.Reset();
  iso_->Dispose();
  delete alloc_;
}

v8::Local<v8::String> JsRuntime::str(const std::string& s) const {
  return v8::String::NewFromUtf8(iso_, s.data(), v8::NewStringType::kNormal, (int)s.size()).ToLocalChecked();
}

std::string JsRuntime::toStdString(v8::Local<v8::Value> v) const {
  v8::String::Utf8Value u(iso_, v);
  return *u ? std::string(*u, u.length()) : std::string("<unprintable>");
}

std::string JsRuntime::toJSON(v8::Local<v8::Value> v) const {
  auto s = v8::JSON::Stringify(context(), v);
  return s.IsEmpty() ? "null" : toStdString(s.ToLocalChecked());
}

v8::Local<v8::Value> JsRuntime::fromJSON(const std::string& json) const {
  v8::TryCatch tc(iso_);
  auto v = v8::JSON::Parse(context(), str(json));
  if (v.IsEmpty()) rethrow(tc);
  return v.ToLocalChecked();
}

void JsRuntime::rethrow(v8::TryCatch& tc) const {
  std::string msg = tc.HasCaught() ? toStdString(tc.Exception()) : "unknown JavaScript error";
  if (tc.HasCaught()) {
    auto st = tc.StackTrace(context());
    if (!st.IsEmpty()) msg += "\n" + toStdString(st.ToLocalChecked());
  }
  throw JsError(msg);
}

void JsRuntime::runScript(const std::string& source, const std::string& name) {
  auto ctx = context();
  v8::TryCatch tc(iso_);
  v8::ScriptOrigin origin(iso_, str(name));
  auto script = v8::Script::Compile(ctx, str(source), &origin);
  if (script.IsEmpty()) rethrow(tc);
  if (script.ToLocalChecked()->Run(ctx).IsEmpty()) rethrow(tc);
}

v8::Local<v8::Value> JsRuntime::settle(v8::Local<v8::Value> v) {
  if (!v->IsPromise()) return v;
  auto p = v.As<v8::Promise>();
  while (p->State() == v8::Promise::kPending) {
    iso_->PerformMicrotaskCheckpoint();
    while (v8::platform::PumpMessageLoop(gPlatform.get(), iso_)) {}
  }
  if (p->State() == v8::Promise::kRejected) {
    auto e = p->Result();
    std::string msg = toStdString(e);
    if (e->IsObject()) {
      auto st = e.As<v8::Object>()->Get(context(), str("stack"));
      if (!st.IsEmpty() && st.ToLocalChecked()->IsString()) msg = toStdString(st.ToLocalChecked());
    }
    throw JsError(msg);
  }
  return p->Result();
}

v8::Local<v8::Value> JsRuntime::call(const char* objectName, const char* method, std::initializer_list<v8::Local<v8::Value>> args) {
  auto ctx = context();
  v8::TryCatch tc(iso_);
  v8::Local<v8::Value> objV;
  if (!ctx->Global()->Get(ctx, str(objectName)).ToLocal(&objV) || !objV->IsObject()) throw JsError(std::string("no global object ") + objectName);
  auto obj = objV.As<v8::Object>();
  v8::Local<v8::Value> fnV;
  if (!obj->Get(ctx, str(method)).ToLocal(&fnV) || !fnV->IsFunction()) throw JsError(std::string(objectName) + "." + method + " is not a function");
  std::vector<v8::Local<v8::Value>> argv(args);
  auto r = fnV.As<v8::Function>()->Call(ctx, obj, (int)argv.size(), argv.data());
  if (r.IsEmpty()) rethrow(tc);
  return settle(r.ToLocalChecked());
}

}  // namespace crt
