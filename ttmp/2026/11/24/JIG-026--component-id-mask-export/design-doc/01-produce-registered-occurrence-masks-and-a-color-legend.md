---
Title: Produce registered occurrence masks and a color legend
Ticket: JIG-026
Status: active
Topics:
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:34.696600068-05:00
WhatFor: ""
WhenToUse: ""
---

# Produce registered occurrence masks and a color legend

## Operator workflow

An editor needs to select an individual occurrence at a specific movie frame. Allocate stable RGB identifiers from the source occurrence list and reserve black for background. An isolated or hidden item must keep its identifier for later frames. A cap belongs to its cut occurrence.

## Implementation and data ownership

Use Stage projection and resolved display geometry, including pose, visibility and depth ordering. Export a lossless ID image and machine-readable mapping. Preserve hard categorical boundaries, suppress annotations and lighting. Make the mask accessible in the render menu and document what a compressed preview video can preserve.

## Verification

Check masks against a scene containing overlapping moving components, an isolated component and a cut surface. Decode PNG and verify every non-background pixel has a declared occurrence. Compare silhouette and projection against the ordinary Stage pass.

## Runtime contract

Assign each occurrence a numeric ID and encode it as three channel bytes. Rasterize visible surfaces in depth order or through the existing depth buffer into a dedicated output. Single-pixel label values have categorical meaning. Generate the mapping from the complete source list before isolation so a part keeps its code throughout the shot.

## Failure handling and boundaries

Use an opaque, lossless PNG with no light response, antialias blending or color interpolation between labels. Any lossy movie is suitable only as a visual preview. A compositor needs the exact PNG per frame or an equivalently lossless sequence. Test black background, hidden surfaces, section caps, clip planes and overlapping occurrences.

## Implementation entry points

- import/jigcad/src/stage/sheet.js
- import/jigcad/src/stage/output-camera.js
- import/jigcad/src/ui/views/stage-render.jsx
