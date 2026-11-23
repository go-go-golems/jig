---
id: tour
title: A tour of the workbench
group: Start here
about: the views, the tiles, the agent, and what happens when you press Run
order: 1
---
# A tour of the workbench

Candela is a JavaScript API for physically based rendering, and this workbench is where you write scenes with it and watch them render. A scene file builds an **immutable value** — a tree of builders — which the compiler lowers to **generated WGSL** plus **packed data**, which a **progressive path tracer** renders on the GPU: WebGPU compute where the browser has it, WebGL2 otherwise.

## The views

| View | What it shows |
| --- | --- |
| Viewport | the render. Drag to orbit, Shift-drag to pan, wheel to zoom, click to select (meshes report their part, instance and CAD face), Alt-click to meter a point in nit and EV; **IDs** shows the instance/face id pass; drop an `.hdr` on it to add an environment |
| Code | the scene's files. ⌘↵ runs them; diagnostics mark lines |
| Params | every `param` as a control: hairline sliders with units, swatches, switches |
| Notes | what the preset is about, with links that drive the workbench |
| Agent | a chat agent with two tools — `eval` over this API, and `screenshot` |
| Console | diagnostics with codes, logs, `explain` (every default announced), live patches |
| Scene | objects, lights, the camera; live handles for lights; mesh definitions and instances; assets (dropped HDRIs) |
| Render | output at a fixed size, sample count and seed: stills, frame sequences, MP4 and WebM video, OpenEXR with passes and ids; a queue |
| IR | the scene as built, every material lowered to the BSDF algebra |
| Graph | the scene as a DAG: a node with several parents is shared |
| Shader | the generated WGSL, its GLSL translation, and what the GPU is running |
| Lab | the white-furnace test and live readings |
| Docs, Reference | the design, the physics, and the API on one page |

## Tiles

Every view lives in a **tile**. Drag a tab to move it: onto another tile's tabs to join them, onto an edge to split, into the middle to add it. Drag a tile by its **⠿ grip** to move the whole tile: its middle swaps the two tiles, an edge docks it beside. **Double-click** a tile's strip (or press ⤢) to maximise it; Esc restores. ⫿ splits the active view into its own tile. The **Layout** menu has arrangements for coding, rendering, reading and working with the agent; whatever you arrange is kept in this browser.

## What Run does

1. The files run as modules (`import … from 'candela'`), with every builder checking its arguments as you call it — units, ranges, did-you-mean.
2. The scene is **compiled**: materials become WGSL functions (the BSDF algebra as stochastic selection), fields become expressions, SDFs and densities become functions; shapes, lights and media become buffers, and a BVH is built.
3. The kernel is compiled on the GPU **only if its source changed** — shaders are cached by source, so moving a slider or editing a light's power never recompiles.
4. Samples accumulate frame by frame; the meter sets the exposure; the denoiser and tone map turn scene-referred radiance into a picture.
