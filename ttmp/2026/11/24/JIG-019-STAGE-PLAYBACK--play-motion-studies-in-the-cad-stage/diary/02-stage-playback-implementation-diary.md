---
Title: Stage playback implementation diary
Ticket: JIG-019-STAGE-PLAYBACK
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T18:22:28.87952445-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Expose the native study to the CAD Stage

The user asked “ok now implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. I began at the ownership boundary between the worker and the Stage. The compiled assembly already has every sampled placement.

### What I did

Added the read-only studyTrack worker call and a protocol-level transfer test under the ticket scripts. Reviewed F-06 as the native fixture, the Stage drag-preview path and SG-03 as the scripted fixture.

### Why

The worker transfers typed-array buffers to the browser. Returning its only copy would detach the stored transforms after the first read.

### What worked

The test compiled F-06, requested the same 361 poses twice through structured-clone transfer, compared both complete tracks and checked the error for a missing study.

### What didn't work

No failures in the native transfer check. A direct reference to the engine-owned arrays was ruled out by inspection of worker.serve and transferables.

### What I learned

Original row indices survive independently from the packed array indices. That distinction identifies an unreachable interval.

### What was tricky to build

Avoid converting millimetres and world axes to the coordinate system used by the Render exporter. The Stage consumes the engine placements directly.

### What warrants a second pair of eyes

Review the request lifetime when a preset changes while a track fetch is pending.

### What should be done in the future

Connect the selected track to a read-only sheet preview and validate browser controls and the phase-driven Singer producer.

### Code review instructions

Run the ticket's scripts/01-check-study-transfer.mjs with Node from the Jig root. Inspect the worker's studyTrack case beside transferables.

### Technical details

A selected track returns its drive range, rows, sample values and 16 column-major world-transform values per component per reached row.
