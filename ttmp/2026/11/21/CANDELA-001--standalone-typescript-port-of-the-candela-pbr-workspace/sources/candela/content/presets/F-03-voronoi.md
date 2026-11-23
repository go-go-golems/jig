---
id: F-03
title: Voronoi: cobbles and cells
group: Fields
about: fx.noise.voronoi gives the distance to the nearest cell centre, the edge distance and a random value per cell.
tries: Give each cell a slightly different roughness too|Turn the cobbles into a giraffe pattern
docs: architecture
---
# Voronoi: cobbles and cells

`fx.noise.voronoi(p)` returns an object of fields:

| field | meaning |
| --- | --- |
| `dist` | distance to the nearest feature point |
| `edge` | distance to the nearest cell border (F2 − F1) |
| `cellRandom` | a random number, constant over each cell |
| `randomVec3` | a random vector per cell |

The floor uses all three: `cellRandom` picks a stone colour from a ramp, `edge` makes the grout, and a **bump** from the same edge distance rounds each cobble — the normal is perturbed by the gradient of a height field, computed by finite differences in the kernel.
