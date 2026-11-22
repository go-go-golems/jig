---
id: F-02
title: Marble from noise
group: Fields
about: Veins are a sine wave bent by fractal noise: three lines of fields, no textures.
tries: Make the veins thinner and darker|Turn it into green serpentine|Add a fine bump so the veins catch the light
docs: architecture
focus: params
---
# Marble from noise

The classic Perlin recipe: a sine of position, its phase disturbed by turbulence.

$$v = \left|\sin\big(k\,(x + a\cdot \mathrm{fbm}(\mathbf p))\big)\right|^{s}$$

`fbm` sums octaves of gradient noise, each at twice the frequency and half the amplitude. The vein **sharpness** `s` is a slider; because it is a param (not a JS number), moving it only updates a uniform — no recompile.

Marble is also translucent: the base here is a `layer` of a polished coat over the patterned diffuse; see **Materials → Wax, jade, skin** for real subsurface.
