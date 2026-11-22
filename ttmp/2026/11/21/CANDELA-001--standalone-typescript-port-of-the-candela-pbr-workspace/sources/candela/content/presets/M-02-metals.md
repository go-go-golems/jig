---
id: M-02
title: Measured metals
group: Materials
about: Ten conductors with their measured complex IOR: the colour of gold and copper is Fresnel, not paint.
tries: Compare exact Fresnel with Schlick for gold at grazing angles|Why is aluminium bluer than silver?|Make them all rough (0.5) — do they stay distinguishable?
docs: renderer
---
# Measured metals

A metal's colour comes from its **complex refractive index** $\eta + ik$, measured per wavelength. Candela keeps three samples (650, 550, 450 nm) and evaluates the exact conductor Fresnel equations, so gold is yellow at normal incidence and whitens toward grazing angles — as real gold does.

| metal | F0 (approx. sRGB) |
| --- | --- |
| Au | 1.00, 0.78, 0.34 |
| Ag | 0.97, 0.96, 0.91 |
| Cu | 0.96, 0.64, 0.54 |
| Al | 0.91, 0.92, 0.92 |
| Fe | 0.56, 0.57, 0.58 |
| Cr | 0.55, 0.56, 0.55 |

> **Try it.** Change `roughness` to 0.5 — the hues remain; brightness barely drops thanks to multiple scattering.
