---
Title: Animated section sweeps implementation diary
Ticket: JIG-025
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:33.932681224-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

The current section channel selects a fixed plane. A sweep should move its offset in millimetres while the target bodies continue to move. The plane normal and component references stay in local coordinates. A timeline evaluation at a given second must be deterministic in any render order.

### Review instructions

Sample beginning, midpoint, endpoint and after the endpoint. Inspect a bored sleeve at multiple heights, and verify source meshes remain unchanged. Check that distinct section offsets reach the renderer and that a cleared section restores the source.

## Step 2. Evaluate the plane and inspect a bored sleeve

The section channel now accepts an absolute end time paired with a final offset. A 12 mm tall bored sleeve provides an independent check on plane placement and the hole in its cap. Scrubbing the sleeve in reverse and forward produces the expected volumes.

### Implementation and evidence

The shot normalizer rejects unpaired or non-finite endpoints and a terminal time at or before the key. The evaluator resolves a local plane in millimetres from presentation time, holds it at its final position and lets a later section key replace it. The worker transports the normalized instruction. Both draw passes consume the same resolved plane and the existing section geometry path. The native SG-09 exporter previously assigned one package to all cuts. It now keys packages by the actual isolation and section state, reusing packages for repeated planes and writing distinct packages for distinct cuts.

I ran the shot suite and the ticket's scripts/01-check-swept-sleeve.mjs. The sleeve retained 1/6, 1/2 and 5/6 of its original volume at heights 2, 6 and 10 mm. The cap remained approximately 263.06 mm² across the three cuts. Clearing the track returned the original body object. The checks exercise the normalizer, time evaluator and real compiled geometry. The native job may grow substantially when a long sweep changes its mesh at every captured frame.

### Review instructions

Use section = { components, normal, offset, endOffset, endTime } in a timed shot key. Try a decreasing offset, scrub backwards through a replacement key and clear section with null. The ticket sleeve check asserts that the source body retains its original faces.
