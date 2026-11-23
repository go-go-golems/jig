---
id: C-06
title: Bloom, vignette, grain
group: Camera
about: Display passes that imitate a lens and a film: each is a small kernel after the tone map, with its own params.
tries: Turn everything off and compare|Write a pass of your own (see Engines → A custom pass)
docs: exposure
focus: params
---
# Bloom, vignette, grain

- **Bloom** — light scattered inside the lens spreads bright points into a glow. Here a blur of the HDR pixels above the white point, added back.
- **Vignette** — natural falloff: a thin lens's illuminance drops as $\cos^4\theta$ off axis.
- **Grain** — film's silver halide (or a sensor's shot noise) as per-pixel noise, stronger in the mid-tones.

They run after accumulation, in the display pass, so changing them never restarts the render.
