# Tasks

## TODO
- [x] Write intern guide: system walkthrough, Spark measurements, steps 1-3 design <!-- t:sgwr -->
- [x] Upload guide to reMarkable <!-- t:yth8 -->
- [x] Step 1: scripts/render-preset.ts on the headless shell with GPU flags (port of render.js) <!-- t:ampt -->
- [ ] Step 2: native Dawn runner (GPU injection, no-DOM output, batching, 1 GiB cap, NVENC ffmpeg sink, compressed EXR) <!-- t:bqlh -->
- [ ] Step 3: OptiX backend (SDK install, scene package, WGSL->CUDA, GAS/IAS, programs, motion, SER, denoiser) <!-- t:uaob -->
- [x] Step 3 phase 1: OptiX SDK 9.0.0 installed, optixTriangle runs on GB10 (sm_121) <!-- t:uj5d -->
- [x] Step 3 spike: scene package v0 + candela-optix-ao (AO on RT cores, ~16x WebGPU on K-09) <!-- t:qj0x -->
