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

## Step 2. Produce a coordinated Singer cycle from the existing assembly

Step 1 landed in 7f4aad1. The Singer's analytic pose already computes a set of joint coordinates from one shaft angle. I exposed that computation as a sampled phase study and used the same function for the static assembly and moving poses.

### Prompt Context

See Step 1. The second producer supplies ordinary study tracks for mechanisms with several coordinated joint values.

### What I did

Extended assembly.study with an angular phase and an at(degrees) callback, added a named Singer study and documented the contract. Added a solver regression and a replay script comparing the new track to the earlier TSV.

### Why

Moving just the crank does not tilt the support or advance the two take-up joints. Rebuilding the upper-head geometry for every angle would also repeat work already done during compilation.

### What worked

The phase regression passed for descending drives, flexible child component IDs, invalid coordinate names and home restoration. SG-03 produced 145 samples. Maximum two-link closure residual was 2.003e-9 mm. The largest distance from the earlier rounded reference points was 0.00006713 mm.

### What didn't work

The two-point reference TSV alone cannot place the ten moving and fixed components. It served as an independent comparison after the solver generated complete placements.

### What I learned

Angular callbacks and native joint studies can share the existing sample storage. The Stage requires no Singer-specific code.

### What was tricky to build

The input angle is displayed in degrees; solved angular joint quantities use radians internally. Flexible subassemblies must prefix the coordinate names returned by the callback.

### What warrants a second pair of eyes

Check the phase callback when adding another mechanism with multiple branches or a joint limit.

### What should be done in the future

Compare the Singer motion against a physically indexed turn when the specimen is measured. That physical calibration remains in SINGER-001.

### Code review instructions

Read assembly.study, runStudy and the SG-03 preset entry. Run the engine case named “phase study” and the ticket's check-singer-study script.

### Technical details

The Singer samples 0 through 720 degrees at five-degree intervals and compares every second sample to the pre-existing ten-degree reference.

## Step 3. Play and inspect a solved pose on the drafting sheet

The phase producer and the component rest metadata landed in cd97d73. I connected the toolbar to a transient Stage frame. Pausing leaves camera control and face picking active. Exit preview restores the compiled assembly.

### Prompt Context

See Step 1. The Stage must handle a native crank and the Singer cycle using the same controls.

### What I did

Added Play, Pause, a keyboard-accessible sample slider, a study selector for multiple tracks and Exit preview. The sheet applies absolute component placements and moves ports and joint annotations by the change from their compiled placement.

### Why

A drawing with a moving part and a stationary pivot label gives the wrong joint location. Camera fit needs to remain stable as the linkage changes its extents.

### What worked

The Stage unit suite passed all 21 checks. In Chromium, the rod was selectable at its quarter-turn position and the marker remained within one screen pixel of the joint. Replaying a fetched study made zero worker calls. A fresh compile, preset switch and delayed old reply were exercised.

### What didn't work

The initial browser pick assertion compared a numeric body index with a component ID. Resolving the selection against the compiled body list verified the picked rod. The first sandboxed make test run failed opening its loopback test server with “listen tcp 127.0.0.1:0: socket: operation not permitted”; I reran the suite with loopback access.

### What I learned

A slow drawing frame can cross an unreachable sample. Each clock advance must check every original row between the last display and the new target before selecting a packed matrix.

### What was tricky to build

A subassembly study may only supply transforms for its own occurrences. The preview keeps other components at their home placements and resolves each marker using the owning component.

### What warrants a second pair of eyes

Check pointer selection near overlaps, use arrow keys through a study limit, and compare a lowered needle in Front and Plan while paused.

### What should be done in the future

When adding a new mechanism, declare its drive study or phase callback and verify reference poses. The toolbar discovers its compiled studies.

### Code review instructions

Follow StudyPlayback and TrackControls in ui/views/study-playback.jsx through the studyPreview event to stage/study-preview.js. Use test/stage/unit.mjs for geometry and the ticket browser script for the integrated sheet.

### Technical details

Playback traverses the authored sample order in four seconds, pauses at the end and preserves source parameters. The range control indexes original rows and announces the actual drive coordinate in degrees or millimetres.
