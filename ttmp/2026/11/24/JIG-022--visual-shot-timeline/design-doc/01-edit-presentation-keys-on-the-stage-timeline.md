---
Title: Edit presentation keys on the Stage timeline
Ticket: JIG-022
Status: active
Topics:
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:29.840809582-05:00
WhatFor: ""
WhenToUse: ""
---

# Edit presentation keys on the Stage timeline

## Operator workflow

Expose the compiled shot as a time ruler with selectable keys, a playhead, editable times and per-key properties. Time is measured in presentation seconds. The shaft phase and constraint solver stay in the existing study. A timing change must survive a reload and be consumed by both preview and export.

## Implementation and data ownership

Use the existing normalizeShot and shotAt functions. Initialize from the authored preset keys. Save explicit edits as study-specific keys in a project shot file. Preserve unrelated studies and channels. Reject overlapping times and invalid occurrence references. Dragging a key or changing its numeric time uses one validation path. Scrub a key to inspect its pose before committing a change.

## Verification

Load SG-09, move a blend key, save and reopen, check the sampled opacity. Try a duplicate time. Verify camera cut and section entries survive a round trip.

## Runtime contract

Maintain a selected key and scrub position in the editor. Draw markers at time divided by shot duration. During a pointer drag, clamp time to the visible domain and update the draft; at validation, sort time keys and reject collisions. Use the same normalized key representation in the preview and the project override. Keep markup and camera settings intact when editing only timing.

## Failure handling and boundaries

Saving writes one study entry to shots.json. Reopening other studies must not inherit these keys. A code-authored preset with no sidecar still loads its original shot. Never rewrite JavaScript source by searching for a bracket or a decimal timestamp.

## Implementation entry points

- import/jigcad/src/render/shot.js
- import/jigcad/src/ui/views/study-playback.jsx
- import/jigcad/src/ui/views/stage-render.jsx
