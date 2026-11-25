---
Title: Render work areas implementation diary
Ticket: JIG-023
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/src/render/work-area.js
      Note: Common frame count and mapping to original study samples
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:31.660222933-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

Select a contiguous interval of a shot and render that interval at production cadence. Artists can inspect the hook pass without tracing the entire study. Preview, video and remote jobs must agree on which absolute frame belongs at the start.

### Review instructions

Compare the first and last images of a subrange to those same frames in the full shot. Test invalid ranges and a one-frame range. Verify decoded frame count and check an OptiX work-area render.

## Step 2. Preserve the source clock through the browser and native export

The approved design (Step 1) needs a work area in output-frame units. The browser enumerates a closed interval of indices from its existing 24-fps grid. The mapping to mechanical samples still uses the entire study duration and its cyclic endpoint rule. Seeking a boundary therefore keeps the camera and trail history at their original positions.

The Stage dialog retains the original camera drawing callback. A native ZIP captures the black CAD plate and one white response plate per shaded view, the geometry variants, the actual subview origins, fixed cameras, occurrence matrices and the named studio. The Spark runner combines each native subview with its own response, preserving captions and inset borders, and numbers the output from zero. A single-frame native job produces a PNG. A multi-frame job produces H.264. Outputs carry a SHA-256 receipt with original frame bounds and verified OptiX segments.

### Review and early results

Script 01 compared both work-area boundary previews with manually selected full-study rows 203 and 205. FFprobe decoded three frames for 203–205 and one frame for 203 alone. The test's first exact label lookup for “Samples per pixel” timed out after 30 seconds because the select's options were included in the accessible label. I added an explicit accessible label and repeated the full test.

## Workstation-to-Spark delivery

Added scripts/submit-stage-job.py for a single local submission command. It transfers the selected Stage ZIP and runner to a fresh remote job directory, launches tmux, retrieves the result and receipt into a staging directory, verifies SHA-256, then publishes the local output directory. A failed job keeps its remote log. The working example selected SG-09 frames 203–205 at EV 7 and overrode SPP to 16. bling.local reported 44.1924 ms native for three 320×240 frames. The local copy matched the receipt in sources/ssh-submit-receipt.json.

### Native results and operator procedure

The front/side test produced two independent 160 × 240 OptiX views at the same absolute time. The runner placed them at x = 0 and x = 160 and retained the Stage captions. The checked single-sample 320 × 240 still has SHA-256 123d353f572f5c965204a5b1b6c8ecc2d54a2a2ce1ec497172ae055b8a603663. The three encoded cutaway frames span presentation times 8.4583, 8.5000 and 8.5417 seconds. They used fixed EV 7 and explicit OptiX. Local ffprobe counted three decoded frames, and the movie's hash matched the Spark receipt (0933a4e605365460441bf0f2991a6a19a97288d112eb5c7a7b84395a3de3516e).

Select Render in Stage, set an inclusive first and last output frame in Work area, then choose Render video or Export Spark job. Spark SPP controls native sampling independently of the browser preview. Copy the ZIP to a machine with Candela RT and run the repository's scripts/render-stage-job.py with paths to candela-rt, candela-core.js and the kernel directory. A separate output directory holds the movie or still and receipt. Job preparation uses the Stage drafting pass and can proceed even when local hardware cannot shade a PBR preview.

### Limits and review

The Spark metrics above use one sample per pixel for a fast functional check. They qualify frame selection, composition and backend receipts. For repeatable exposure across independent native jobs, select a studio with fixed EV. Automatic exposure meters the first shaded pass in the exported job. The Stage dialog captures project and camera settings when the job is prepared. The runner uses temporary per-job paths and publishes completed files by renaming them into the output directory.
