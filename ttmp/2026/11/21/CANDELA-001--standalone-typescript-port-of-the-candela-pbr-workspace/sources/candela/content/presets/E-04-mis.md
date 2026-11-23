---
id: E-04
title: NEE, BSDF sampling, MIS
group: Engines
about: Veach’s test: four glossy plates, four lights of different sizes. Each sampling strategy fails somewhere; multiple importance sampling never does.
tries: Explain which strategy wins on which plate|Look at the noise with denoising off
docs: monte-carlo
focus: params
---
# NEE, BSDF sampling, MIS

The classic scene from Eric Veach's thesis (1997). Four plates go from sharp to rough (top to bottom); four spherical lights go from tiny to large (left to right), with equal power.

- **BSDF sampling** follows the material's lobe: perfect for sharp plates and big lights, hopeless for tiny lights on rough plates.
- **Light sampling (NEE)** aims at the lights: perfect for small lights on rough plates, noisy for big lights on sharp plates.
- **MIS** (power heuristic) uses both and weights each sample by how likely the *other* strategy was to produce it.

> **Try it.** Switch the **Strategy** param and turn **Denoise** off in the viewport.
