---
Title: Move a component-local section plane through a shot
Ticket: JIG-025
Status: active
Topics:
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:33.570796112-05:00
WhatFor: ""
WhenToUse: ""
---

# Move a component-local section plane through a shot

## Operator workflow

The current section channel selects a fixed plane. A sweep should move its offset in millimetres while the target bodies continue to move. The plane normal and component references stay in local coordinates. A timeline evaluation at a given second must be deterministic in any render order.

## Implementation and data ownership

Extend a section key with optional endOffset and endTime. For a sweep, interpolate from offset to endOffset over the specified time interval and hold at the terminal value until another section key or clear. Validate a finite offset and a strictly later end time. Share evaluated clipped geometry and hole-aware caps between surface and drafting passes; native export must distinguish moving geometry from a fixed two-variant shot.

## Verification

Sample beginning, midpoint, endpoint and after the endpoint. Inspect a bored sleeve at multiple heights, and verify source meshes remain unchanged. Check that distinct section offsets reach the renderer and that a cleared section restores the source.

## Runtime contract

For a section starting at second a and ending at b, let f = clamp((t-a)/(b-a),0,1). Evaluate offset(t) = offset + f × (endOffset-offset). Normalize the plane normal exactly once. Changing or clearing the section before b supersedes the sweep. Evaluate by absolute time so scrubbing backwards produces the same cap.

## Failure handling and boundaries

A fixed section has one mesh variant for its clipped state. Moving the plane creates distinct cross sections. A native package needs a variant identity derived from the evaluated geometry or must explicitly reject unsupported export. Clip in component space and then apply the same occurrence transform as the uncut mesh.

## Implementation entry points

- import/jigcad/src/render/shot.js
- import/jigcad/src/stage/section.js
- import/jigcad/src/render/stage-pbr.js
