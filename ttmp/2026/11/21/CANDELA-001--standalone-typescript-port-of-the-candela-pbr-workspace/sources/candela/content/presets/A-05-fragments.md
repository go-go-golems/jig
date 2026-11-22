---
id: A-05
title: Fragments: rust and wear
group: Algebra
about: Ready-made fragments add methods to material.pbr: .rust(), .wear(), .dust(), .aged(years) — each lowered into the material’s attributes.
tries: Age the bench by 20 years|Write a fragment of your own that adds .moss()|Try .with(rust) on material.metal() — what error and why?
docs: architecture, grammar
focus: params
---
# Fragments: rust and wear

A **fragment** extends a component kind with new attributes and methods, then *lowers* them into attributes the kind already has. `rust` adds `.rust(amount)` and `.rustScale()`, and at compile time maps `baseColor`, `roughness` and `metallic` through a noise threshold.

```js
material.pbr().metallic(1).with(rust).rust(0.6)
```

Fragments declare what they need (`.requires('baseColor', 'roughness', 'metallic')`). `material.metal('Fe')` is built from a bare conductor BSDF and has none of these, so `.with(rust)` on it is **E130** — the contract is checked, not assumed.
