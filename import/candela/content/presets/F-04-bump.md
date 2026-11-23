---
id: F-04
title: Bump: hammered metal
group: Fields
about: fx.bump(height) turns a scalar height in metres into a shading normal: dents from voronoi, scratches from stretched noise.
tries: Halve the dent depth|Add fine circular scratches
docs: renderer
focus: params
---
# Bump: hammered metal

```js
material.metal('Ag').normal(fx.bump(p => dentDepth(p), 1))
```

A bump field is a height in **metres** over the surface; the kernel evaluates it at three nearby points and tilts the normal by its gradient. Nothing moves — silhouettes stay smooth — but the reflection breaks up exactly as it does on a hammered bowl.

Left: hammered silver (voronoi distance squared: round dents). Right: brushed steel (noise stretched 60× along one axis). Middle: the same silver without a bump.
