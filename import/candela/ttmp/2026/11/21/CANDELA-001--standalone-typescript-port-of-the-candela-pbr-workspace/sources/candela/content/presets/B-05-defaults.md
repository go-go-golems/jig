---
id: B-05
title: Defaults are announced
group: Basics
about: A scene with no camera and no lights still renders — and the Console says exactly what it assumed.
tries: Add a camera and a light, then compare Explain before and after|What exposure did the meter choose, and why?
docs: sensor, exposure
---
# Defaults are announced

Nothing here says how to look or what lights the scene. The build fills both in — a 50 mm lens at (0, 1.2, 5), an automatic exposure — and **says so**: open **Console → Explain** and **Diagnostics** (I207, I208).

With no lights, only emissive surfaces light the scene: the glowing panel is a material with `.emission(colour, u.nit(…))`, a surface radiating a luminance. It is not sampled as a light (it has no `.emit()`), so it lights the room through BSDF sampling alone — noisier, but correct.

> **Try it.** Replace the panel's `.material(glow)` with `.emit(light.area().luminance(u.nit(2500)))` and run. The noise drops: the panel is now *also* sampled directly (next-event estimation), and the two strategies are combined with multiple importance sampling.
