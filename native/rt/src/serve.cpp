// serve.cpp — candela-rt serve (CANDELA-002 phase 5, design doc 02 §7): the workbench's OptiX mode. The browser keeps
// building scenes itself (editor, diagnostics, WebGPU preview) and sends the same inputs here; this process builds the
// same scene in its own V8, renders it with the CUDA/OptiX target, runs the workbench's display program, and streams
// progressive JPEG frames back.
//
// Threads: IXWebSocket's threads only queue incoming messages; one session thread owns the V8 isolate, the CUDA
// context, the renderer and the encoder, and alternates between handling queued messages and rendering a batch.
//
// Protocol (JSON text from the browser; see src/app/remote.ts):
//   hello {}                                  → hello { server, gpu, maxSpp }
//   files { files, params?, time?, seed? }    → status, built { ok, error?, irHash, target, buildMs, compileMs, … }
//   param { id, value }                       dynamic: repack; static: rebuild
//   view  { view, width, height }             camera override ({ at, target } or null) and image size
//   clock { t, playing, rate }                seek, or play on this process's clock (behaviours step here)
// Frames go out as one binary message: uint32 little-endian header length, the header JSON
// { type:'frame', t, spp, ev, width, height, renderMs, epoch }, then the JPEG.
#include <ixwebsocket/IXNetSystem.h>
#include <ixwebsocket/IXWebSocketServer.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <csignal>
#include <cstring>
#include <deque>
#include <memory>
#include <mutex>
#include <thread>

#include "common.h"
#include "jpeg.h"
#include "optix_renderer.h"
#include "post.h"

namespace fs = std::filesystem;
using Clock = std::chrono::steady_clock;

namespace {

std::atomic<bool> gStop{false};

struct Incoming {
  enum Kind { Open, Text, Close } kind;
  std::string text;
  std::shared_ptr<ix::WebSocket> ws;   // Open: the connection; others: identifies the sender
};

class Queue {
 public:
  void push(Incoming m) { { std::lock_guard<std::mutex> l(mu_); q_.push_back(std::move(m)); } cv_.notify_one(); }
  std::deque<Incoming> take(std::chrono::milliseconds wait) {
    std::unique_lock<std::mutex> l(mu_);
    if (q_.empty() && wait.count() > 0) cv_.wait_for(l, wait, [&] { return !q_.empty() || gStop.load(); });
    std::deque<Incoming> out;
    out.swap(q_);
    return out;
  }
  void wake() { cv_.notify_all(); }

 private:
  std::mutex mu_;
  std::condition_variable cv_;
  std::deque<Incoming> q_;
};

std::string jstr(const std::string& s) {
  std::string o = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if (c == '\n') o += "\\n";
    else if ((unsigned char)c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += c;
  }
  return o + "\"";
}
double ms(Clock::time_point a, Clock::time_point b) { return std::chrono::duration<double, std::milli>(b - a).count(); }

// the session: everything here runs on the session thread
class Live {
 public:
  Live(int argc, char** argv, Queue& q) : argc_(argc), argv_(argv), q_(q) {
    maxSpp_ = std::stoi(arg(argc, argv, "--max-spp", "2048"));
    maxW_ = std::stoi(arg(argc, argv, "--max-width", "1920"));
  }

  void run() {
    crt::CudaContext cuda;
    cuda_ = &cuda;
    crt::JsRuntime rt;
    rt_ = &rt;
    v8::Isolate::Scope is(rt.isolate());
    v8::HandleScope hs(rt.isolate());
    v8::Context::Scope cs(rt.context());
    rt.onConsole = [&](const std::string& level, const std::string& text) { if (level == "warn" || level == "error") fprintf(stderr, "[js %s] %s\n", level.c_str(), text.substr(0, 300).c_str()); };
    const std::string bundle = arg(argc_, argv_, "--bundle", "dist-core/candela-core.js");
    rt.runScript(readFile(bundle), bundle);
    jpeg_ = std::make_unique<crt::JpegEncoder>(std::stoi(arg(argc_, argv_, "--jpeg-quality", "88")));
    fprintf(stderr, "candela-rt serve: session thread ready (%s, bundle %s)\n", cuda.deviceName().c_str(), bundle.c_str());
    while (!gStop.load()) {
      const bool busy = active() && H_.IsEmpty() == false && (playing_ || spp() < maxSpp_);
      for (auto& m : q_.take(std::chrono::milliseconds(busy ? 0 : 50))) {
        v8::HandleScope ms_(rt.isolate());
        try { handle(m); } catch (const std::exception& e) { sendText("{\"type\":\"error\",\"message\":" + jstr(e.what()) + "}"); fprintf(stderr, "error: %s\n", e.what()); }
      }
      if (gStop.load()) break;
      v8::HandleScope ss(rt.isolate());
      try { step(); } catch (const std::exception& e) { sendText("{\"type\":\"error\",\"message\":" + jstr(e.what()) + "}"); fprintf(stderr, "error: %s\n", e.what()); H_.Reset(); }
    }
    H_.Reset(); files_.Reset(); params_.Reset();
    R_.reset(); post_.reset(); jpeg_.reset();
  }

 private:
  crt::JsRuntime& rt() { return *rt_; }
  bool active() const { return (bool)client_; }
  v8::Local<v8::Object> H() { return H_.Get(rt().isolate()); }
  double num(v8::Local<v8::Value> o, const char* k) { return rt().get(o, k).As<v8::Number>()->Value(); }
  double spp() { return H_.IsEmpty() ? 0 : num(H(), "spp"); }
  std::string str(v8::Local<v8::Value> o, const char* k) { auto v = rt().get(o, k); return v->IsUndefined() ? std::string() : rt().toStdString(v); }
  v8::Local<v8::Value> n(double x) { return v8::Number::New(rt().isolate(), x); }

  void sendText(const std::string& s) { if (client_) client_->sendText(s); }

  void handle(const Incoming& m) {
    if (m.kind == Incoming::Open) { client_ = m.ws; return; }
    if (m.kind == Incoming::Close) { if (m.ws == client_) client_.reset(); return; }
    if (m.ws != client_) client_ = m.ws;   // the last connection to speak is the one we render for
    auto msg = rt().fromJSON(m.text);
    const std::string type = str(msg, "type");
    if (type == "hello") {
      sendText("{\"type\":\"hello\",\"server\":\"candela-rt\",\"gpu\":" + jstr(cuda_->deviceName()) + ",\"maxSpp\":" + std::to_string(maxSpp_) + ",\"maxWidth\":" + std::to_string(maxW_) + "}");
      if (!H_.IsEmpty()) { sendBuilt(); epoch(true); }
    } else if (type == "files") {
      files_.Reset(rt().isolate(), rt().get(msg, "files").As<v8::Object>());
      auto p = rt().get(msg, "params");
      params_.Reset(rt().isolate(), p->IsObject() ? p.As<v8::Object>() : v8::Object::New(rt().isolate()));
      if (rt().get(msg, "time")->IsNumber()) t_ = num(msg, "time");
      if (rt().get(msg, "seed")->IsNumber()) seed_ = (int)num(msg, "seed");
      rebuild();
    } else if (type == "param") {
      const std::string id = str(msg, "id");
      auto value = rt().get(msg, "value");
      if (params_.IsEmpty()) params_.Reset(rt().isolate(), v8::Object::New(rt().isolate()));
      params_.Get(rt().isolate())->Set(rt().context(), rt().str(id), value).Check();
      if (H_.IsEmpty()) return;
      const std::string r = rt().toStdString(rt().callMethod(H(), "setParam", {rt().str(id), value}));
      if (r == "rebuild") rebuild();
      else if (r == "repack") epoch(true);
      else sendText("{\"type\":\"error\",\"message\":" + jstr("no param " + id) + "}");
    } else if (type == "view") {
      view_.Reset(rt().isolate(), rt().get(msg, "view"));
      int w = (int)num(msg, "width"), h = (int)num(msg, "height");
      if (w > maxW_) { h = (int)std::lround(double(h) * maxW_ / w); w = maxW_; }
      w = std::max(16, w); h = std::max(16, h);
      const bool resized = w != w_ || h != h_;
      w_ = w; h_ = h;
      if (H_.IsEmpty()) return;
      rt().callMethod(H(), "setView", {view_.Get(rt().isolate())});
      if (resized) resize();
      epoch(true);
    } else if (type == "clock") {
      const bool was = playing_;
      playing_ = rt().get(msg, "playing")->IsTrue();
      if (rt().get(msg, "rate")->IsNumber()) rate_ = num(msg, "rate");
      const double t = rt().get(msg, "t")->IsNumber() ? num(msg, "t") : t_;
      lastTick_ = Clock::now();
      if (H_.IsEmpty()) { t_ = t; return; }
      // a pause or a jump: go to the browser's time; while playing, this process keeps the time
      if (!playing_ || !was || std::fabs(t - t_) > 0.25) {
        t_ = t;
        rt().callMethod(H(), "seek", {n(t_), n(0), n(seed_)});
        epoch(false);
      }
    }
  }

  void sendBuilt() {
    if (H_.IsEmpty()) return;
    sendText("{\"type\":\"built\",\"ok\":true,\"irHash\":" + jstr(str(H(), "irHash")) + ",\"target\":" + jstr(target_) + ",\"buildMs\":" + std::to_string(buildMs_) +
             ",\"compileMs\":" + std::to_string(compileMs_) + ",\"pipelineMs\":" + std::to_string(pipelineMs_) + ",\"motion\":" + (RO_ && RO_->motion() ? "true" : "false") +
             ",\"width\":" + std::to_string(w_) + ",\"height\":" + std::to_string(h_) + "}");
  }

  // open the scene from files_ and params_ (a new HeadlessRender), compile its programs, make the renderer
  void rebuild() {
    if (files_.IsEmpty()) return;
    sendText("{\"type\":\"status\",\"state\":\"building\"}");
    const auto t0 = Clock::now();
    auto opts = rt().fromJSON("{\"width\":" + std::to_string(w_) + ",\"height\":" + std::to_string(h_) + ",\"time\":" + std::to_string(t_) + ",\"seed\":" + std::to_string(seed_) + ",\"target\":\"auto\"}");
    opts.As<v8::Object>()->Set(rt().context(), rt().str("params"), params_.IsEmpty() ? v8::Object::New(rt().isolate()).As<v8::Value>() : params_.Get(rt().isolate()).As<v8::Value>()).Check();
    auto hr = rt().call("Candela", "openRender", {files_.Get(rt().isolate()), opts});
    if (!rt().get(hr, "ok")->IsTrue()) {
      H_.Reset(); R_.reset(); RO_ = nullptr;
      sendText("{\"type\":\"built\",\"ok\":false,\"error\":" + jstr(str(hr, "error")) + "}");
      return;
    }
    auto Hn = hr.As<v8::Object>();
    buildMs_ = ms(t0, Clock::now());
    target_ = str(Hn, "target");
    const bool optix = target_ == "optix";
    sendText("{\"type\":\"status\",\"state\":\"compiling\",\"target\":" + jstr(target_) + "}");
    const auto t1 = Clock::now();
    auto prog = rt().get(Hn, "cuda");
    bool hit = false;
    const std::string kdir = kernelsDir(argc_, argv_);
    auto comp = compileCached(str(prog, "source"), str(prog, "hash"), "live.cu", kdir, cuda_->arch(), cacheDir(argc_, argv_), &hit, optix);
    if (!comp.ok) { H_.Reset(); sendText("{\"type\":\"built\",\"ok\":false,\"error\":" + jstr("NVRTC: " + comp.log.substr(0, 4000)) + "}"); return; }
    auto pp = rt().get(Hn, "post");
    bool phit = false;
    auto pc = compileCached(str(pp, "source"), str(pp, "hash"), "live.post.cu", kdir, cuda_->arch(), cacheDir(argc_, argv_), &phit, false);
    if (!pc.ok) { H_.Reset(); sendText("{\"type\":\"built\",\"ok\":false,\"error\":" + jstr("NVRTC (display program): " + pc.log.substr(0, 4000)) + "}"); return; }
    compileMs_ = ms(t1, Clock::now());
    // a new renderer when the program or the target changed; otherwise keep it (its pipeline and buffers)
    const std::string key = target_ + ":" + str(prog, "hash");
    auto X = rt().get(Hn, "optix");
    const bool motion = optix && rt().get(X, "motion")->IsTrue();
    if (!R_ || key != programKey_ || (optix && RO_->motion() != motion)) {
      R_.reset(); RO_ = nullptr;
      const auto t2 = Clock::now();
      if (optix) { auto ro = std::make_unique<crt::OptixRenderer>(cuda_->ctx(), comp.cubin, w_, h_, motion); RO_ = ro.get(); R_ = std::move(ro); }
      else R_ = std::make_unique<crt::CudaRenderer>(comp.cubin, w_, h_);
      pipelineMs_ = ms(t2, Clock::now());
      programKey_ = key;
    } else R_->resize(w_, h_);
    if (RO_) {
      std::vector<crt::OptixMeshInput> meshes;
      auto ma = rt().get(X, "meshes").As<v8::Array>();
      for (uint32_t i = 0; i < ma->Length(); i++) {
        auto m = ma->Get(rt().context(), i).ToLocalChecked();
        meshes.push_back({rt().view<float>(rt().get(m, "vertices")), (unsigned)num(m, "count")});
      }
      RO_->buildMeshes(meshes);
    }
    postCubin_ = pc.cubin;
    post_ = std::make_unique<crt::PostProcessor>(postCubin_, w_, h_);
    post_->enableRGB(true);
    H_.Reset(rt().isolate(), Hn);
    if (!view_.IsEmpty()) rt().callMethod(Hn, "setView", {view_.Get(rt().isolate())});
    version_ = -1;
    sendBuilt();
    fprintf(stderr, "built: %s %dx%d, build %.0f ms, compile %.0f ms%s, renderer %.0f ms\n", target_.c_str(), w_, h_, buildMs_, compileMs_, hit && phit ? " (cached)" : "", pipelineMs_);
    epoch(true);
  }

  void resize() {
    rt().callMethod(H(), "resize", {n(w_), n(h_)});
    if (R_) R_->resize(w_, h_);
    if (!postCubin_.empty()) { post_ = std::make_unique<crt::PostProcessor>(postCubin_, w_, h_); post_->enableRGB(true); }
  }

  // accumulation restarts; `meter`: meter the exposure again (scene, param or view changes; not clock ticks)
  void epoch(bool meter) {
    epoch_++;
    if (meter) metered_ = 0;
    lastSend_ = Clock::time_point{};
  }

  void upload() {
    auto Hn = H();
    const double v = num(Hn, "version");
    if (v == version_) return;
    version_ = v;
    if (RO_) {
      auto X = rt().get(Hn, "optix");
      RO_->setFrame(rt().view<float>(rt().get(X, "instances")), rt().view<float>(rt().get(X, "srt")), (int)num(X, "motionKeys"), rt().view<float>(rt().get(X, "aabbs")), rt().view<int>(rt().get(X, "aabbObjects")));
    }
    R_->upload(rt().view<float>(rt().get(Hn, "O")), rt().view<float>(rt().get(Hn, "LI")), rt().view<float>(rt().get(Hn, "BV")), rt().view<float>(rt().get(Hn, "SD")));
  }

  void step() {
    if (!active() || H_.IsEmpty() || !R_) return;
    auto Hn = H();
    const auto now = Clock::now();
    if (playing_) {
      // the scene's clock runs here: behaviours step by the real time since the last tick (bounded like the host's)
      const double dt = std::min(0.1, ms(lastTick_, now) / 1000.0) * rate_;
      lastTick_ = now;
      if (dt > 0) { t_ += dt; rt().callMethod(Hn, "seek", {n(t_), n(dt), n(seed_)}); epoch(false); }
    } else if (spp() >= maxSpp_) return;
    upload();
    // a batch of launches sized to ~20 ms (playing: one tick's worth), then maybe a frame
    const auto b0 = Clock::now();
    for (int i = 0; i < batch_ && spp() < maxSpp_; i++) R_->launch(rt().view<float>(rt().callMethod(Hn, "frame", {})));
    R_->sync();
    const double bms = ms(b0, Clock::now());
    renderMs_ += bms;
    const double target = playing_ ? 25.0 : 20.0;
    if (bms < target * 0.6 && batch_ < 256) batch_ = std::min(256, batch_ * 2);
    else if (bms > target * 1.5 && batch_ > 1) batch_ = std::max(1, batch_ / 2);
    // exposure: metered while the image forms (Viewport.frame meters at 2, 8 and 32 samples; here the first meter is at
    // 1 sample, because the first frame goes out right away and an unmetered first image flashes), unless the camera
    // fixes it
    static const double meterAt[3] = {1, 8, 32};
    const double s = spp();
    if (metered_ < 3 && s >= meterAt[metered_]) {
      auto acc = R_->readAccum();
      rt().callMethod(Hn, "meter", {rt().floats(acc.data(), acc.size())});
      while (metered_ < 3 && s >= meterAt[metered_]) metered_++;
    }
    const bool due = playing_ || ms(lastSend_, Clock::now()) >= 100 || s >= maxSpp_;
    if (due) sendFrame();
  }

  void sendFrame() {
    if (!client_ || client_->bufferedAmount() > (8 << 20)) return;   // the browser is behind: skip, the next one is newer
    auto Hn = H();
    auto d = rt().callMethod(Hn, "display", {});
    post_->run(rt().view<float>(rt().get(d, "D")), (int)num(d, "steps"), (float)num(d, "sigma"), R_->accumBuffer(), R_->albedoBuffer(), R_->normalBuffer());
    const std::string jpg = jpeg_->encode(post_->rgbBuffer(), w_, h_);
    char head[320];
    const int hl = snprintf(head, sizeof head, "{\"type\":\"frame\",\"t\":%.6f,\"spp\":%d,\"ev\":%.4f,\"width\":%d,\"height\":%d,\"renderMs\":%.1f,\"epoch\":%d,\"playing\":%s}",
                            t_, (int)spp(), num(Hn, "ev"), w_, h_, renderMs_, epoch_, playing_ ? "true" : "false");
    std::string payload(4, '\0');
    payload[0] = char(hl & 255); payload[1] = char((hl >> 8) & 255); payload[2] = char((hl >> 16) & 255); payload[3] = char((hl >> 24) & 255);
    payload.append(head, hl);
    payload += jpg;
    client_->sendBinary(payload);
    lastSend_ = Clock::now();
  }

  int argc_;
  char** argv_;
  Queue& q_;
  crt::CudaContext* cuda_ = nullptr;
  crt::JsRuntime* rt_ = nullptr;
  std::shared_ptr<ix::WebSocket> client_;
  v8::Global<v8::Object> H_, files_, params_;
  v8::Global<v8::Value> view_;
  std::unique_ptr<crt::Renderer> R_;
  crt::OptixRenderer* RO_ = nullptr;
  std::unique_ptr<crt::PostProcessor> post_;
  std::unique_ptr<crt::JpegEncoder> jpeg_;
  std::vector<char> postCubin_;
  std::string target_, programKey_;
  int w_ = 960, h_ = 540, seed_ = 1, maxSpp_ = 2048, maxW_ = 1920, batch_ = 1, metered_ = 0, epoch_ = 0;
  double t_ = 0, rate_ = 1, version_ = -1, buildMs_ = 0, compileMs_ = 0, pipelineMs_ = 0, renderMs_ = 0;
  bool playing_ = false;
  Clock::time_point lastTick_ = Clock::now(), lastSend_{};
};

}  // namespace

int cmdServe(int argc, char** argv) {
  const int port = std::stoi(arg(argc, argv, "--port", "8790"));
  const std::string bind = arg(argc, argv, "--bind", "0.0.0.0");
  const std::string token = arg(argc, argv, "--token", "");
  ix::initNetSystem();
  Queue q;
  ix::WebSocketServer server(port, bind);
  server.disablePerMessageDeflate();   // JPEG frames do not compress; deflate would only cost time
  server.setOnClientMessageCallback([&](std::shared_ptr<ix::ConnectionState> cs, ix::WebSocket& ws, const ix::WebSocketMessagePtr& msg) {
    // the server owns the WebSocket objects; find the shared_ptr for this one to keep it alive in the session
    std::shared_ptr<ix::WebSocket> sp;
    for (auto& c : server.getClients()) if (c.get() == &ws) sp = c;
    if (!sp) return;
    if (msg->type == ix::WebSocketMessageType::Open) {
      const std::string uri = msg->openInfo.uri;
      if (!token.empty() && uri.find("token=" + token) == std::string::npos) { ws.close(4401, "bad token"); return; }
      fprintf(stderr, "client connected: %s %s\n", cs->getRemoteIp().c_str(), uri.c_str());
      q.push({Incoming::Open, "", sp});
    } else if (msg->type == ix::WebSocketMessageType::Message && !msg->binary) {
      q.push({Incoming::Text, msg->str, sp});
    } else if (msg->type == ix::WebSocketMessageType::Close) {
      fprintf(stderr, "client closed\n");
      q.push({Incoming::Close, "", sp});
    }
  });
  auto res = server.listen();
  if (!res.first) { fprintf(stderr, "listen %s:%d: %s\n", bind.c_str(), port, res.second.c_str()); return 1; }
  std::signal(SIGINT, [](int) { gStop = true; });
  std::signal(SIGTERM, [](int) { gStop = true; });
  server.start();
  fprintf(stderr, "candela-rt serve: ws://%s:%d/%s (the workbench: View → OptiX)\n", bind.c_str(), port, token.empty() ? "" : " (token required)");
  Live live(argc, argv, q);
  std::thread session([&] {
    try { live.run(); } catch (const std::exception& e) { fprintf(stderr, "session thread: %s\n", e.what()); gStop = true; }
  });
  while (!gStop.load()) std::this_thread::sleep_for(std::chrono::milliseconds(100));
  q.wake();
  server.stop();
  session.join();
  ix::uninitNetSystem();
  return 0;
}
