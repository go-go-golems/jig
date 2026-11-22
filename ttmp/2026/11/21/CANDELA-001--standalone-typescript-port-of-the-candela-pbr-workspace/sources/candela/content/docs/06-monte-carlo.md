---
id: monte-carlo
title: Monte Carlo is the engine
group: Foundations
about: estimators, importance sampling, MIS, Russian roulette, linearity
order: 6
---
# Monte Carlo is the engine

Every integrator is an **estimator** of an integral:

```text
  ⟨I⟩_N = (1/N) Σ_k f(X_k) / p(X_k)          unbiased if p > 0 wherever f ≠ 0;  RMS error ∝ σ / √N

  importance sampling      choose p ∝ f (BSDF sampling, light sampling, environment sampling)
  MIS (power heuristic)    w_a = p_a² / (p_a² + p_b²)     combine strategies; each wins where the other is weak
  Russian roulette         continue with probability q, divide the weight by q  →  still unbiased
```

Two consequences shape the API:

- **Integrators are just kernels.** If the grammar exposes `intersect`, `bsdf.sample`, `lights.sample` and `mis`, users can write their own path tracer (L13).
- **Light transport is linear in emission.** The radiance at a pixel is `Σ_j Φ_j · (response to light j at 1 unit)`. This lets an agent relight a scene by superposition without re-rendering (L16).
