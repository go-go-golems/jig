# Tasks

## TODO
- [x] Write intern guide: system walkthrough, Spark measurements, steps 1-3 design <!-- t:sgwr -->
- [x] Upload guide to reMarkable <!-- t:yth8 -->
- [x] Step 1: scripts/render-preset.ts on the headless shell with GPU flags (port of render.js) <!-- t:ampt -->
- [ ] Step 2: native Dawn runner (GPU injection, no-DOM output, batching, 1 GiB cap, NVENC ffmpeg sink, compressed EXR) <!-- t:bqlh -->
- [ ] Step 3: OptiX backend (SDK install, scene package, WGSL->CUDA, GAS/IAS, programs, motion, SER, denoiser) <!-- t:uaob -->
- [x] Step 3 phase 1: OptiX SDK 9.0.0 installed, optixTriangle runs on GB10 (sm_121) <!-- t:uj5d -->
- [x] Step 3 spike: scene package v0 + candela-optix-ao (AO on RT cores, ~16x WebGPU on K-09) <!-- t:qj0x -->
- [x] Phase 2 (doc 02): Gen dialects + wgsl2cuda.ts + header + traversal shim; NVRTC-compile every preset <!-- t:6kif -->
- [ ] Phase 3 (doc 02): OptixTarget + candela-rt render/check; image parity vs WebGPU; measure path-tracing speed-up and NVRTC time <!-- t:6c5q -->
- [ ] Phase 5 (doc 02): candela-rt serve + browser OptiX mode (inputs protocol, IR-hash handshake, nvJPEG frames); supersedes the buffer-level RemoteOptixBackend <!-- t:x4t9 -->
- [x] Phase 0: libnode-dev V8 embedding spike + scripts/bundle-core.ts (K-09 builds in embedded V8, hashes equal Node's) <!-- t:e6pt -->
- [ ] Phase 1: golden pack recorder, then split compile into lower/SceneIR/FrameState/SceneSession/WebGpuTarget (byte-identical) <!-- t:cqz3 -->
- [ ] Phase 4: candela-rt jobs (sequences, EXR AOVs, NVENC); lockstitch reel vs 230 s/stitch <!-- t:hgr5 -->
