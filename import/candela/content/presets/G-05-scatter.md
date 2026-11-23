---
id: G-05
title: Scatter: a forest by density
group: Geometry
about: scene.scatter places instances where a density field allows — evaluated on the CPU at build time, from the same expression graph.
tries: Raise the count to 400|Make the clearing larger|Use a different seed
docs: architecture
---
# Scatter: a forest by density

```js
scene.scatter({ count: 220, seed: 7, area: [16, 16], density: p => …, place: (i, { rng, P }) => tree(rng).at(P[0], 0, P[2]) })
```

`density` is a **field** — the same kind of expression a material uses — but here it is evaluated on the CPU, at build time, by the expression interpreter. Candidate points are kept with probability equal to the density: a clearing in the middle, thinning at the edges.

`place` is a build lambda: it gets a seeded `rng` (same seed → same forest), and must not use `Math.random` (**W501**).
