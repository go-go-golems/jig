---
id: B-04
title: Diagnostics, as you type
group: Basics
about: Builders check units, ranges and physics as you call them. Warnings here are deliberate; errors are one uncomment away.
tries: Fix every warning in this scene|Uncomment the line with lumens as intensity and explain the error|What does W420 protect against?
docs: invariants, units
focus: console
---
# Diagnostics, as you type

This scene builds — with **three warnings**, on purpose. Open the **Console**:

- **W330** — an albedo of 1.0. No real material reflects all light (fresh snow ≈ 0.9, charcoal ≈ 0.03); a perfect reflector makes indirect light converge slowly and look flat.
- **W335** — `metallic(0.5)`: a surface is a metal or it is not. Partial values only make sense at texel boundaries.
- **W420** — `bsdf.add` of a diffuse 0.8 and a mirror 0.9 reflects **1.70** times the light it receives. `mix` (convex) and `layer` (Fresnel-coupled) are valid by construction; `add` is checked.

The commented lines at the bottom are **errors**. Uncomment one at a time and run:

| line | code | why |
| --- | --- | --- |
| `.roughnes(0.4)` | E104 | did-you-mean, from the Proxy around every builder |
| `.intensity(u.lm(800))` | E120 | lumens are flux; intensity is candela (Φ/4π for a point) |
| `.fstop(0.4)` | E123 | N ≥ 0.5 for any lens in air (Abbe sine condition) |
| `p.uv.x * 10` | E201 | JS arithmetic on a field: use `.mul(10)` |

Every diagnostic points at **your** line: the builder captured its call site when you called it.
