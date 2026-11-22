---
id: E-07
title: Realtime, preview, offline
group: Engines
about: Three engine presets: what they trade — resolution, bounces, denoising, samples per frame.
tries: Which engine converges fastest to a clean image here?|Make a custom engine with 8 bounces at half resolution
docs: renderer
focus: params
---
# Realtime, preview, offline

| engine | resolution | bounces | denoise | notes |
| --- | --- | --- | --- | --- |
| `preview()` | ½ | 3 | yes | for editing; fast feedback |
| `realtime()` | 1 | 5 | yes | the default |
| `offline()` | 1 | 12 | no | MIS everywhere, unbiased, slower to look clean |

An engine is a builder too: `engine.offline().scale(0.5).maxDepth(8).denoise(true)` is a valid custom engine. The viewport's engine switch overrides the scene's choice without editing it.
