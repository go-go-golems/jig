---
Title: Render a selected interval on the original study clock
Ticket: JIG-023
Status: active
Topics:
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:31.334701195-05:00
WhatFor: ""
WhenToUse: ""
---

# Render a selected interval on the original study clock

## Operator workflow

Select a contiguous interval of a shot and render that interval at production cadence. Artists can inspect the hook pass without tracing the entire study. Preview, video and remote jobs must agree on which absolute frame belongs at the start.

## Implementation and data ownership

Use explicit frame bounds and display the range and output count. Preserve absolute source-frame times, the full-shot camera and trajectory history. Number encoded output from zero. Validate bounds before render; retain cancellation and handle a single selected frame. Provide a Spark job submission or executable export path for the chosen interval and capture backend verification.

## Verification

Compare the first and last images of a subrange to those same frames in the full shot. Test invalid ranges and a one-frame range. Verify decoded frame count and check an OptiX work-area render.

## Runtime contract

The whole-shot sample mapping remains authoritative. Given a source frame index i, compute its original study row exactly as full export does. Iterate over the selected indices inclusively and feed output frames to the encoder in order. At 24 fps a 48-frame work area lasts two seconds independent of its position in the study.

## Failure handling and boundaries

Do not renumber input samples before solving the camera, trail history, clip state or exposure. A native batch uses source frame IDs when locating plates and matrices. Validate the remote input package and report the working directory, expected outputs and job status.

## Implementation entry points

- import/jigcad/src/ui/views/stage-render.jsx
- import/jigcad/src/stage/output-camera.js
- JIG-020/scripts/09-render-spark.py
