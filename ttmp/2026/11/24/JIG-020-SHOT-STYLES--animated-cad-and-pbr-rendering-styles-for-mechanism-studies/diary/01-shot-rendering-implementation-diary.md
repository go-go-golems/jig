---
Title: Shot rendering implementation diary
Ticket: JIG-020-SHOT-STYLES
Status: active
Topics:
    - cad
    - rendering
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T20:07:41.515904479-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1. Map authorship and create the rendering design

The user asked “ok, create a new ticket, and create a design doc, and ten implement. will the blend and all that be done through code? where are animations defined currently.” I traced the mechanical study, presentation offsets and Candela look through their separate entry points. The same assembly can have three distinct timelines today.

### Decision and implementation

Keep the physical law in the preset's study. Put optional presentation style keyframes beside it in JavaScript and carry data across the worker boundary. Evaluate the camera only once per output frame. The work divides into a Candela color pass, section geometry, shot evaluation and the Stage compositor.

### Review

Inspect SG-09's script.js and meta.json, the preview draw in stage.js, the current workbench exports in stage-render.jsx, and the camera bridge in jig-candela.js. The design records the proposed contract and acceptance checks.

## Step 2. Implement and register the two rendering passes

The study compiler now validates shot keys and transmits the serializable array to the workbench. The new Candela orthographic path shares the sheet's basis, scale and center. Both passes receive the same solved matrices and clipped geometry.

**Code checkpoints** — 4dbc351 (tracks), c50c05b (sections), 915c4da (PBR), c6a705b (camera and markup keys).

### What worked

The two-depth fixture returned exact projected bounding rectangles. The real guide, cap and rod moved together through a 42-pixel translation. The sleeve test preserved its bore, and all 116 combinations of original Singer components and test normals completed. The refreshed browser capture found 3,211 of 3,311 shaded foreground pixels on the thin exploded components within three pixels of a CAD stroke.

### What needed correction

The first registration fixture called light.env.constant. The actual interface is light.env.uniform. After correcting the fixture, the depth-separated shapes aligned. A separate composition run forcing SwiftShader produced “scene data needs 1293 texture rows; this GPU allows null”. Rerunning script 05 with the verified Vulkan/ANGLE launch settings completed successfully.

### Implementation decisions

Use a dialog-local Candela viewport and serialize its GPU jobs. Cancel superseded previews. Publish a frame only after both passes have finished, keeping downloads disabled while a preview is pending. Export movies with fixed sample timestamps. The sectioned mesh and cap are display data. The solver continues to use the original geometry.

## Step 3. Exercise the workbench and archive the result

The browser ran the real 13-second Singer study at 24 fps. A 480 × 320, four-sample H.264 movie is in sources/07-sg09-shot.mp4. Its 312 frames include the flat exploded hold, the sectioned guide, and the returning drive with the needle trail. The result and the end-to-end check were committed at eab3bb1.

### Review and reproduction

Scripts 01 through 06 cover the workbench export, registration, section geometry and PBR, camera layouts, single-body rendering, missing GPU support, rapid changes and cancellation. Front/side, foot inset, turntable, trail and mid-blend frames are captured alongside the movie. The earlier Singer render-dialog check also passed, including both themes and the default CAD movie.

### What warrants a second pair of eyes

Review the camera in a WebGPU-capable interactive browser. Headless tests on this machine verified the WebGL2 backend. At low sample counts reflective steel can look noisy. The sample-count control applies to each output frame.
