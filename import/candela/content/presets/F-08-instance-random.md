---
id: F-08
title: One material, many instances
group: Fields
about: p.instance.random gives each instance its own number: 400 pebbles, one material kernel, every one a different colour.
tries: Make the variation subtler|Vary roughness per instance as well
docs: gpu
---
# One material, many instances

Every object carries a random number fixed at build time. Inside a material, `p.instance.random` reads it — so one compiled material produces a different colour on each instance, the way production renderers vary leaves on a tree.

400 pebbles below share **one** material kernel (see I205 in the Console). The colour comes from a ramp indexed by the instance's number; the size and squash come from the seeded `rng` in the build lambda — JavaScript, at build time.
