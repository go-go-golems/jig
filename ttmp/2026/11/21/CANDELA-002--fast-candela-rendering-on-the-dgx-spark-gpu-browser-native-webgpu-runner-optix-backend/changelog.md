# Changelog

## 2026-11-21

- Initial workspace created

## 2026-11-21

Intern guide written: renderer walkthrough, GB10 measurements, designs for GPU browser rendering, Dawn runner, OptiX backend

### Related Files

- /home/manuel/code/wesen/2026-11-21--pbr-spark/ttmp/2026/11/21/CANDELA-002--fast-candela-rendering-on-the-dgx-spark-gpu-browser-native-webgpu-runner-optix-backend/design-doc/01-candela-on-the-dgx-spark-intern-guide-to-the-renderer-and-the-gpu-plan.md — The guide

## 2026-11-21

Guide uploaded to reMarkable /ai/2026/11/21/CANDELA-002 (header override: stmaryrd.sty missing locally)

## 2026-11-21

Step 1 implemented: scripts/render-preset.ts, tools/lockstitch/render.ts; 1080p stitch at 64 spp in 230 s on the GB10

## 2026-11-21

OptiX traversal spike: K-09 AO at 1080p 1721 spp/s on RT cores vs 105 on WebGPU, images match

## 2026-11-21

Design: compile the JS API to OptiX (wgsl2cuda + traceAll shim) and a live OptiX workbench (server + RemoteOptixBackend); vault report 940ccdb1

## 2026-11-21

Design doc 02: candela-rt (embedded V8 + OptiX), engine split into front end/SceneIR/targets, SceneSession, inputs-level live protocol, phases 0-6

### Related Files

- /home/manuel/code/wesen/2026-11-21--pbr-spark/ttmp/2026/11/21/CANDELA-002--fast-candela-rendering-on-the-dgx-spark-gpu-browser-native-webgpu-runner-optix-backend/design-doc/02-candela-as-a-compiler-with-backends-the-v8-and-optix-render-runtime.md — The design
