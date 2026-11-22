---
id: K-06
title: A tray of fasteners: instancing
group: Machines
about: Hundreds of bolts, nuts and washers from three mesh definitions; triangles are stored once per definition, the scene's BVH holds instances.
tries: Fill the tray with 1200 fasteners and compare the frame time|Make every nut brass|Turn the bolts zinc-plated through metadata|How many triangles are stored, and how many are in the scene?
docs: cad
focus: params
---
# Instancing

A CAD assembly repeats parts: one bolt definition, a hundred placements. Candela traces this the way production renderers do, with **two levels of acceleration**:

- each **definition** gets a bottom-level BVH over its triangles, built once (binned SAH, cached on the definition) and stored once in the scene data;
- the **top-level** BVH is over instances — a transform, a material and a pointer to the definition's BVH — and is rebuilt only when something moves.

A ray tests instance boxes, moves into the instance's local space, and traverses the shared triangle BVH there. Memory and build time grow with the number of **unique** triangles; the frame time grows slowly with instances. The Scene view lists the definitions with their triangle and instance counts; the viewport chip counts triangles across instances.

The fasteners carry their metadata from `mesh.hexBolt`, `mesh.nut` and `mesh.washer`: steel, black oxide for the bolts, clear zinc for nuts and washers. One nut in five is a variant with `withMeta({ material: 'brass' })` — a new definition object that **shares** the triangles and BVH of the original, so it costs no memory.
