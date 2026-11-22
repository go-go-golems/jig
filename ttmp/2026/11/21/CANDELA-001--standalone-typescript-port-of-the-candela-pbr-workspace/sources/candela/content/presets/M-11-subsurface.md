---
id: M-11
title: Wax, jade, skin
group: Materials
about: Light that enters, wanders and leaves: subsurface scattering as a volume inside a dielectric.
tries: Halve the mean free path of the wax|Put a light behind the jade
docs: media
---
# Wax, jade, skin

Subsurface scattering is not a special trick here: `material.subsurface()` is a **dielectric boundary with a scattering medium inside**, traced as a random walk. The mean free path sets how far light goes before scattering; the albedo sets what fraction survives each event.

| material | albedo | mean free path |
| --- | --- | --- |
| wax | 0.95 0.85 0.7 | 6 mm |
| jade | 0.6 0.9 0.7 | 12 mm |
| skin | 0.95 0.75 0.62 | 4 mm |
| marble | 0.97 0.96 0.94 | 10 mm |

A back light shows the difference most: the thin edges glow.
