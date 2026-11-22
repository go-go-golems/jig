---
id: K-04
title: Faces, parts and ids
group: Machines
about: A shaft assembly whose materials are bound to CAD faces from metadata, by selector and by function; colour it by face or by part, click to read face ids, and export them as id passes.
tries: Colour by faces, then click the gear's flank|Make the journals polished with a selector|Tag the bearing's raceways as lapped in metadata|Read the instance and face at the centre of the frame (render.ids())
docs: cad
focus: params
---
# Faces, parts and ids

A CAD export is not a bag of triangles: it has **parts** (definitions), **instances** of them, and **faces** — the B-rep faces each triangle came from, each with an id and, often, attributes. Candela keeps all three:

- `mesh.*` and `mesh.fromArrays({ positions, indices, faceIds, faces })` build a **definition**: triangles, a face index per triangle, a face table `[{ id, meta }]`, and part metadata.
- `shape.mesh(def)` is an **instance**. Its BVH is built once per definition, so the two bearings here share one; the scene's top-level BVH holds instances.
- The kernel reports the **face** of every hit, so a material can be chosen per face.

Three ways to bind materials to faces, in order of precedence:

```js
shape.mesh(shaft)
  .autoFinish()                                   // 1. from metadata: material, process, finish
  .autoFinish((meta, face) => material.diffuse(…)) //    … or a function of each face
  .face('d2', finish.turned().roughness(0.38))    // 2. by selector — an id, 'd*', /^d[04]$/, a list, a predicate
```

Metadata is set where the part is defined — `withMeta({ material: 'steel' })`, `withFaceMeta(['d0', 'd4'], { process: 'ground' })` — and carried through `mesh.merge`, which also moves each face's axis into the merged frame so the grooves stay right.

**Colour by** switches between the finishes, a colour per face id, and a colour per part. Click anything: the card shows the definition, the instance, the face id and the face's metadata (here the journals carry `tolerance: k6`).

**Ids in output.** The Render view's EXR export writes `id.instance` and `id.face` channels (with `Z`), first-hit and unfiltered, for mattes in compositing; `render.ids(x, y)` returns them at a point.
