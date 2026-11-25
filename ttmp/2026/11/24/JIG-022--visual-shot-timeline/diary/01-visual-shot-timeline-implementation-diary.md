---
Title: Visual shot timeline implementation diary
Ticket: JIG-022
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/src/ui/views/shot-timeline.jsx
      Note: Visual timeline, key property editing and persistence
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:30.264489942-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

Expose the compiled shot as a time ruler with selectable keys, a playhead, editable times and per-key properties. Time is measured in presentation seconds. The shaft phase and constraint solver stay in the existing study. A timing change must survive a reload and be consumed by both preview and export.

### Review instructions

Load SG-09, move a blend key, save and reopen, check the sampled opacity. Try a duplicate time. Verify camera cut and section entries survive a round trip.

## Step 2. Edit study keys through the real render dialog

The timeline initially reads the effective study shot. Selecting a marker scrubs the preview. Dragging a marker or entering a time validates and sorts the keys through the same normalization function as the preset. Blend, lines, annotations and camera selection have dedicated controls. The properties editor exposes the remaining authored channels. Save writes only the current study's entry to shots.json. Restore authored keys removes that override.

### What worked and what failed

The Chromium script first failed to launch with “Executable doesn't exist” for chromium_headless_shell-1255. The installed 1254 binary ran the same Playwright harness when passed as its optional fourth argument. On SG-09, the test rejected a duplicate time, changed the three-second key to 2.5 s, assigned the named camera, dragged the key, saved and reloaded the project. No page errors occurred. The accompanying screenshot was captured from the render dialog. make web succeeded.

### Decisions and review instructions

Source time remains the presentation clock and never edits the shaft drive. Numeric channels interpolate independently. Invalid edit attempts keep the last valid preview. Review src/render/shot-editor.js, src/ui/views/shot-timeline.jsx, and JIG-022/scripts/01-check-editor.cjs. The shared Stage dialog integration also includes work-area, studio and mask controls. The design bundle is in reMarkable Cloud under /ai/2026/11/24/Jig-Stage.

## Step 3. Play the edited work area and restore authored keys

The shared Render dialog advances its preview only after the current frame is ready, including the asynchronous surface pass. Scrubbing or starting an export stops playback. The integration test played frames 80 through 82, observed the endpoint, reopened the project, restored the authored timeline and found its original three-second cut. The initial playback assertion timed out because the test queried a zoom input by aria-label although it uses a wrapping label. Pointing the assertion at the study frame and Play button verified the endpoint.

Review also identified an unreachable-row edge case in partial studies. Scrubbing to a missing row now holds the previous valid pose and reports the gap. Work areas wholly inside reachable samples can still export. Malformed project JSON keeps its original text while the operator can restore the script-authored keys for preview. Fix that JSON in Code before saving project edits.

### Final integration evidence

The camera test and browser editor test both passed against the workbench on port 18965. `node import/jigcad/test/stage/unit.mjs` passed 21/21, the render shot suite passed, `go test ./...` passed, and `make test-candela` kept all 105 golden scene packs identical and passed its session checks. All six new ticket workspaces passed docmgr doctor. The browser screenshot is under sources/timeline-camera.png. The reMarkable CLI confirmed the six-design PDF and its cloud listing under /ai/2026/11/24/Jig-Stage.

### What warrants a second pair of eyes

Preview playback waits for the selected sample to finish rendering before advancing, so high-SPP previews can run slower than the 24 fps export clock. The movie and mask sequences sample at fixed output indices. Review the first and last frames of a work area when modifying the clock or deciding whether a cyclic endpoint should be included. The full scene and sliced-work-area tests use the same production mapping.
