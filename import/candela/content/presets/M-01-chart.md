---
id: M-01
title: The material chart
group: Materials
about: Metallic × roughness: the two axes of the metallic/roughness model, side by side under one sky.
tries: Explain why the rough metal row looks brighter than the rough dielectric row|Add a third row with a clear coat|Which of these could not exist in reality?
docs: renderer
---
# The material chart

The top row is a **dielectric** (plastic, paint, stone): a diffuse base under a thin specular reflection of about 4 %. The bottom row is a **metal**: no diffuse at all, a coloured reflection. Roughness runs from 0 (a mirror) to 1 (matte) left to right.

Roughness is *perceptual*: the GGX width is $\alpha = r^2$, so the steps look even. The metal row stays bright at high roughness because of **multiple scattering**: light that bounces between microfacets is not lost (Kulla–Conty compensation).

> **Try it.** Ask the agent to add a row with `.coat(1)` and explain what the coat does to the rough samples.
