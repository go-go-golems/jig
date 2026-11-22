---
id: sensor
title: The sensor closes the loop
group: Foundations
about: thin lens, EV100, saturation, tone mapping
order: 7
---
# The sensor closes the loop

```text
  thin lens         1/f = 1/z_o + 1/z_i,   aperture diameter A = f / N
  exposure          EV100 = log₂(N² / t) − log₂(S / 100)          f/16, 1/125 s, ISO 100  →  EV100 = 14.97  ("sunny 16")
  saturation        L_max = 1.2 · 2^EV100   (scene luminance that clips the sensor; exposure scale = 1 / L_max)
  reflected meter   EV100 = log₂(L · S / K),  K = 12.5
  time, aperture    motion blur and depth of field are not effects; they are the ∫_T and ∫_A in the measurement equation
  display           scene-referred radiance → tone map (AgX, ACES, PBR Neutral) → display encoding (sRGB, P3, PQ)
```
