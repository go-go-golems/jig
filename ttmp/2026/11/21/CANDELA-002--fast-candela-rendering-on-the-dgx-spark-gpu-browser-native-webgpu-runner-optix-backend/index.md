---
Title: 'Fast Candela rendering on the DGX Spark: GPU browser, native WebGPU runner, OptiX backend'
Ticket: CANDELA-002
Status: active
Topics:
    - pbr
    - gpu
    - webgpu
    - optix
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Make Candela fast on the DGX Spark: measurements, an intern guide, and three steps (GPU browser, native Dawn runner, OptiX)."
LastUpdated: 2026-11-21T19:54:26.575017277-05:00
WhatFor: ""
WhenToUse: ""
---

# Fast Candela rendering on the DGX Spark

- Guide (start here): [design-doc/01-candela-on-the-dgx-spark-intern-guide-to-the-renderer-and-the-gpu-plan.md](design-doc/01-candela-on-the-dgx-spark-intern-guide-to-the-renderer-and-the-gpu-plan.md) — also on reMarkable at `/ai/2026/11/21/CANDELA-002`
- Design (next): [design-doc/02-candela-as-a-compiler-with-backends-the-v8-and-optix-render-runtime.md](design-doc/02-candela-as-a-compiler-with-backends-the-v8-and-optix-render-runtime.md) — candela-rt: V8 + OptiX, engine split, live protocol
- Diary: [log/01-diary.md](log/01-diary.md)
- Measurements: `various/00`–`06` (hardware, GPU probe, throughput, WebCodecs, Dawn, scene stats); scripts in `scripts/`
- Tasks: [tasks.md](tasks.md) · Changelog: [changelog.md](changelog.md)
