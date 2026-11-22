---
id: B-03
title: Builders are values
group: Basics
about: Every call returns a new builder. Sharing is free: one sphere, one material kernel, many instances.
tries: Show me in the Graph which nodes are shared|Make the blue spheres metallic without touching the red ones|How many material kernels did this compile to, and why?
docs: architecture, gpu
---
# Builders are values

`plastic` is defined once; `red` and `blue` are **new builders** derived from it. Nothing is mutated, so `plastic` is still there, unchanged, and every derived value shares the parts it did not change.

That sharing survives compilation. Open the **Graph**: the `sphere` node has many parents, and so does each material. Open the **Console**: the note *I205* counts objects against material kernels — 25 spheres, two kernels. Materials with identical bodies are deduplicated; the BVH instances the geometry.

> **Try it.** In `scene.js`, change `ball` to `shape.sphere(0.32)` and run: one edit, every instance changes. Then give the third column a third colour.

Builders are immutable, so assigning to one is an error (**E105**). In the live world, *handles* are the mutable ones — see the Live presets.
