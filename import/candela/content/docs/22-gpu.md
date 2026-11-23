---
id: gpu
title: WebGPU, WebGL2 and one kernel
group: The engine
about: WGSL generated once, translated to GLSL; caching by source; what each backend does
order: 22
---
# WebGPU, WebGL2 and one kernel

The path tracer is **written once**, in a strict subset of WGSL, and runs on two backends:

- **WebGPU**: a compute shader, 8 × 8 workgroups, one invocation per pixel; storage buffers for objects, lights, BVH nodes, the scene data (mesh BVHs and triangles, face tables, HDRI tables, media, motion blocks) and the accumulation; a second compute pass for denoising and display into an `rgba8unorm` storage texture, blitted to the canvas.
- **WebGL2**: a fragment shader over a full-screen triangle, writing to three RGBA32F targets (colour, albedo, normal + depth) with ping-pong accumulation; data in RGBA32F textures read with `texelFetch`.

## The subset, and the translation

The kernel and every generated function follow rules that make a line-by-line translation to GLSL ES 3.00 possible: every declaration is typed (`let x: f32 = …` → `float x = …`), functions are `fn name(a: T) -> R {` (→ `R name(T a) {`), structs have one member per line, `select(f, t, c)` has a scalar condition (→ `c ? t : f`), loops are `for` or `loop { … break; }` (→ `for (;;)`), and no function is overloaded (`fmodp`, `fmodp2`, `fmodp3`…). Open the **Shader** view to see the generated WGSL beside its translation.

## Caching

Shaders are cached by **source text**. Structure changes the source; values do not:

| Change | Costs |
| --- | --- |
| a dynamic param, a light's power, a transform, the time | a buffer write and a fresh accumulation |
| a static param, a material's structure, a new shape kind | a new kernel — compiled once, then cached |

Generated code is deduplicated too: materials with identical bodies share one function (the Console's I205 note counts them).

## Fields become code

`fx.pattern(p => fx.noise.fbm(p.P.mul(3)).smoothstep(0.4, 0.7))` is called **once**, with symbolic proxies. Every method call adds a node to a hash-consed DAG; the code generator walks it in dependency order and emits one `let` per node — common subexpressions are computed once. The same DAG is also evaluated **in JS** (to place scattered instances by density at build time) and **on intervals** (to bound a volume's density for delta tracking).
