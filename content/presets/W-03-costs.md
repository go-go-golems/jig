---
id: W-03
title: What does a change cost?
group: Live
about: Three sliders, three costs: a uniform, a repack, a rebuild. Watch the status bar as you move each.
tries: Which slider recompiles?|Make the count slider dynamic — why is that impossible?
docs: architecture, gpu
focus: params
---
# What does a change cost?

| slider | what it changes | cost |
| --- | --- | --- |
| **Roughness** | a material input | a uniform write: the next frame |
| **Height** | a transform (via `.map`) | a repack of object data |
| **Count** | how many objects exist | a rebuild — the scene's structure changed (static) |

Count must be static: the number of objects decides the BVH and the data layout. The compiler won't let a dynamic param decide structure — `.static()` says so explicitly, and the kernel cache makes a revisited count instant.
