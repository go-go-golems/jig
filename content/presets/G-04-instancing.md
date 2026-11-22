---
id: G-04
title: 900 cubes, one BVH
group: Geometry
about: A JS loop places 900 instances in a wave; the BVH makes tracing them cost about as much as tracing nine.
tries: Make it 60×60|Turn the wave into concentric rings
docs: gpu, renderer
---
# 900 cubes, one BVH

The loop runs at build time: JavaScript computes 900 heights and adds 900 placed instances of **one** box. The compiler packs them into a **bounding volume hierarchy** — a tree of boxes, built with the surface-area heuristic — so a ray visits a handful of nodes instead of 900 objects.

Look at the status bar: the per-frame time is close to the simple scenes'. The cubes share one material, coloured by height through `p.P.y`.
