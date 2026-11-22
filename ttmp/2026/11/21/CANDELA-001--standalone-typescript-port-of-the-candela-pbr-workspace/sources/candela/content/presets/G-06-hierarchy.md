---
id: G-06
title: Hierarchy: an orrery
group: Geometry
about: Children inherit their parent’s transform: a planet turns around the sun, a moon around the planet, each with its own clock.
tries: Add a second moon|Tilt the planet’s orbit
docs: architecture
---
# Hierarchy: an orrery

`.child(node)` attaches a node in its parent's frame. Here:

```
sun ─ arm (rotateY: t·0.5) ─ planet (at 1.6 m) ─ arm (rotateY: t·2) ─ moon (at 0.35 m)
```

Each `rotateY` is a field of time, so the transforms move every frame; the host re-packs only the objects whose recipe depends on time. The sun is an emissive sphere *and* a point light at the same place.
