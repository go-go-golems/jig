---
id: X-05
title: Kernels are cached
group: GPU
about: Switch between three material variants: the first visit compiles a kernel, every later visit swaps the cached one in.
tries: Switch variants a few times and watch the compile time in the status bar|Which edits rebuild, which repack, which only update a uniform?
docs: gpu, architecture
focus: params
---
# Kernels are cached

Changes come in three costs:

| change | cost |
| --- | --- |
| a **dynamic** param (most sliders) | a uniform write — the next frame |
| a transform, a light's power, the clock | a repack of scene data — a millisecond |
| a **static** param, a new material, a new shape kind | a new kernel — compiled once, then **cached by source** |

The **Variant** param here is static: it picks one of three materials. The first time you choose each, the kernel compiles (seconds on a software GPU, tens of milliseconds on a real one). After that, switching is instant — the cache holds the compiled pipeline.
