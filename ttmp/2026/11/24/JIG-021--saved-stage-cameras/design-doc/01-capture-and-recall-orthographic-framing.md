---
Title: Capture and recall orthographic framing
Ticket: JIG-021
Status: active
Topics:
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:28.209712552-05:00
WhatFor: ""
WhenToUse: ""
---

# Capture and recall orthographic framing

## Operator workflow

An inspection of the hook needs a repeatable close-up. Capture the resolved Stage camera after orbit, pan and zoom. Store the world target in millimetres, resolved yaw and pitch in radians, and vertical field height in millimetres. Pixel scale alone would change the framing when the canvas height changes.

## Implementation and data ownership

Keep named cameras in cameras.json in the current project file map. Saving a name adds or explicitly updates that record. Applying it derives pixel scale from the destination height. Shot keys can select a saved camera by name; use the same resolved projection for ink, surfaces and exports. Reject malformed records and report missing names.

## Verification

Save an off-centre axonometric view, change projection, recall it, then render at two sizes. Compare normalized projections and check persistence after reopening the project.

## Runtime contract

The saved record carries the resolved target, vertical field height, and absolute yaw and pitch. Its scale at an output of H pixels is H divided by field height. Horizontal coverage is the field height multiplied by aspect ratio. This makes the target invariant under a size change and makes any aspect-ratio cropping predictable. A key such as {"time":2,"view":{"camera":"Hook close-up"}} selects a named view until the next view key.

## Failure handling and boundaries

Capture after Stage redraw so queued pointer updates are visible. Store independent copies of target coordinates. Refuse nonfinite values, zero spans and sketch-plane inputs. A missing referenced camera should be identified by name.

## Implementation entry points

- import/jigcad/src/stage/camera.js
- import/jigcad/src/stage/output-camera.js
- import/jigcad/src/ui/views/stage.jsx
