---
id: algebra
title: Scattering has an algebra
group: Foundations
about: BSDF invariants and the combinators that preserve them; the microfacet model
order: 4
---
# Scattering has an algebra

A BSDF `f_s` is physically valid when it satisfies three invariants:

```text
  positivity      f_s(ωi, ωo) ≥ 0
  reciprocity     f_s(ωi, ωo) = f_s(ωo, ωi)                         (Helmholtz; refraction picks up an η² factor)
  conservation    ρ(ωo) = ∫ f_s(ωi, ωo) |cos θi| dωi ≤ 1   ∀ ωo        (directional albedo)
```

The API is designed so that **the combinators preserve these invariants by construction**, or check them where construction cannot guarantee it:

| Combinator | Meaning | Energy conserving? |
| --- | --- | --- |
| `bsdf.mix(a, b, t)` | `(1−t)·a + t·b`, `t ∈ [0,1]` | ✅ always: a convex combination of valid BSDFs is valid |
| `a.scale(k)` | `k·a`, `k ∈ [0,1]` | ✅ always |
| `bsdf.layer(top, bottom, …)` | top reflects `F(θ)`; bottom is seen through `(1−F(θi))(1−F(θo))·T` | ✅ by construction (Fresnel-coupled) |
| `bsdf.add(a, b)` | `a + b` | ⚠️ only if `ρa + ρb ≤ 1`, so it is **checked** (W420) |

The leaves of the algebra are a handful of physical models:

```text
  lambert(ρ)                  f = ρ / π

  microfacet (Cook–Torrance)  f = D(h) · G₂(ωi,ωo) · F(ωo·h) / (4 |n·ωi| |n·ωo|)
     GGX distribution         D(h) = α² / (π ((n·h)²(α²−1) + 1)²)          α = roughness²  (perceptual remap)
     Smith, height-correlated G₂ = 1 / (1 + Λ(ωi) + Λ(ωo)),   Λ(ω) = (−1 + √(1 + α² tan²θ)) / 2
     dielectric Fresnel       F0 = ((η−1)/(η+1))²   →  0.04 at η = 1.5;   Schlick: F ≈ F0 + (1−F0)(1−cos θ)⁵
     conductor Fresnel        complex IOR η + ik:    F0 = ((η−1)² + k²) / ((η+1)² + k²)
```

The popular "metallic/roughness" uber-material is **not a primitive**. It is sugar over the algebra: `mix(layer(dielectric, lambert(base)), conductor(F0 = base), metallic)`. L6 shows its full definition in eight lines.
