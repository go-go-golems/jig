---
id: X-01
title: One kernel, two backends
group: GPU
about: The path tracer is written once in a strict subset of WGSL; a line-level translator makes the GLSL ES 3.0 version for WebGL2.
tries: Switch the backend in the status bar and compare the images|Find the select() → ternary rewrite in the GLSL
docs: gpu
focus: shader
---
# One kernel, two backends

| | WebGPU | WebGL2 |
| --- | --- | --- |
| kernel | compute shader, one thread per pixel | fragment shader over a full-screen triangle |
| scene data | storage buffers | RGBA32F textures, 1024 texels wide |
| accumulation | storage buffer | ping-pong float render targets |
| language | WGSL (as written) | GLSL ES 3.0 (translated) |

The **Shader** view shows all three: the generated WGSL, its GLSL translation, and the source the active backend compiled. Both backends render the same image to within noise — that's tested.

The translator handles what this subset uses: structs, `let`/`var`, `loop`, `select` (as a ternary), arrays, `bitcast`, `atan2`. It is about 150 lines, not a compiler.
