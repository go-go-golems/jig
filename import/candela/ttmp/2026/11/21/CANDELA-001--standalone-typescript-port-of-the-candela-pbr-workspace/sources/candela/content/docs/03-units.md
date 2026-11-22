---
id: units
title: Units are types
group: Foundations
about: radiometry and photometry; conversions by emitter geometry
order: 3
---
# Units are types

Light is energy, and the API treats its units as types. Radiometric quantities are measured in watts. Photometric quantities are the same quantities weighted by the eye's luminous efficiency `V(λ)` and scaled by `K_m = 683 lm/W`.

| Quantity | Definition | Radiometric | Photometric | Constructor |
| --- | --- | --- | --- | --- |
| Flux (power) | `Φ` | W | lumen, `lm` | `u.lm(800)` |
| Intensity | `I = dΦ/dω` | W/sr | candela, `cd = lm/sr` | `u.cd(64)` |
| Irradiance | `E = dΦ/dA` | W/m² | lux, `lx = lm/m²` | `u.lux(500)` |
| Radiance | `L = d²Φ / (dA cosθ dω)` | W/(m²·sr) | nit, `cd/m²` | `u.nit(1000)` |
| Reflectance | `ρ = dΦ_out / dΦ_in` | dimensionless, **bounded [0, 1]** | same | `0.18`, `'#c8553d'` |

The geometry of an emitter decides how one quantity converts into another, and the API does these conversions for you:

```text
  isotropic point light       I = Φ / 4π                 800 lm   →    63.66 cd
  spot, cone half-angle θ     I = Φ / 2π(1 − cos θ)      1200 lm @ 20° → 3167 cd   (power focused into the cone)
  one-sided Lambertian area   L = Φ / (π A)              3000 lm, 1 × 0.5 m → 1909.9 nit
  directional (sun)           specify E⊥ (lux) directly  power is meaningless for an infinitely distant source
```

Colours also carry a **role**: `reflectance` (bounded), `transmittance` (bounded) or `illuminant` (unbounded). The role decides how an RGB triple becomes a spectrum (bounded versus unbounded upsampling) and which checks apply. An "emission colour" of `(4, 4, 4)` is fine. An albedo of `(4, 4, 4)` creates energy.
