---
id: L-12
title: Neon: emission and MIS
group: Light
about: Glowing tubes as emissive materials versus registered area lights: the same light, two very different estimators.
tries: Turn the emissive panel into a registered light and compare the noise|Explain multiple importance sampling with this scene
docs: monte-carlo, renderer
---
# Neon: emission and MIS

The neon tubes are **emissive materials** — surfaces that radiate a luminance (`.emission('#ff3366', u.nit(800))`). A path only gets their light when a BSDF-sampled ray happens to hit one: on the glossy floor that works, on the diffuse wall it is slow and noisy.

The panel on the right is an **area light** (`.emit(light.area()…)`): it is also *sampled directly* from every shading point, and the two strategies are weighted by the **power heuristic** so their sum is still one unbiased estimate:

$$w_{light} = \frac{p_{light}^2}{p_{light}^2 + p_{bsdf}^2}$$

Turn **Denoise** off and compare the wall near each.
