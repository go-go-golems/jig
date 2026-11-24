---
Title: CAD Stage playback for motion studies and phase-driven mechanisms
Ticket: JIG-019-STAGE-PLAYBACK
Status: active
Topics:
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/content/presets/SG-03-upper-head/script.js
      Note: Phase-driven acceptance fixture
    - Path: repo://import/jigcad/src/engine/assembly.js
      Note: Native study pose producer
    - Path: repo://import/jigcad/src/engine/worker.js
      Note: Proposed track read boundary
    - Path: repo://import/jigcad/src/stage/stage.js
      Note: Transient drawing and drag behavior
    - Path: repo://import/jigcad/src/ui/views/stage.jsx
      Note: Playback controls and view lifetime
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T10:48:30.732330959-05:00
WhatFor: ""
WhenToUse: ""
---

# CAD Stage playback for motion studies and phase-driven mechanisms

## What the user sees

Open the F-06 slider-crank preset in Stage, select the **cycle** study and press **Play**. The crank turns while the rod and slider follow their solved positions. Pause at 90°, switch to Front and zoom in on the crank pin. The pin marker, its bore and the selected face should remain coincident throughout the camera change. Dragging the playback slider selects a sample. Exiting playback restores the assembly pose from the last compile.

A preset author who already declares the following study has supplied everything the first release needs. Degrees are the drive coordinate. The proposed four-second preview duration is a viewing speed, independent of any physical shaft speed.

```js
.study('cycle', { drive: 'main', from: deg(0), to: deg(360), steps: 360 })
```

## Where the motion already exists

| Source under import/jigcad | Responsibility today | Proposed use |
|---|---|---|
| content/presets/F-06-slider-crank-mechanism/script.js | Declares the cycle above | First end-to-end fixture |
| src/engine/assembly.js, poseTrack and prog.studyPoses(name) | Collect solved world transforms and original row indices, including namespaced component paths for subassemblies | Read one completed track from the worker |
| src/engine/worker.js | Dispatches program calls including dragPose | Expose a read-only operation for the selected track |
| src/stage/stage.js, posedProgram and paint | Apply transient drag poses and update joint annotations | Share the drawing path with a read-only playback preview |
| src/stage/scene.js and src/stage/sheet.js | Draw compiled bodies using supplied component poses | Reuse the meshes, face identities and camera controls |
| src/ui/views/stage.jsx, StageView | Owns the toolbar and Stage lifetime | Own study selection, playback controls and cleanup |

The Render exporter converts CAD matrices into Candela coordinates. Stage consumes Jig world coordinates directly. Reading the worker track avoids exporting geometry or converting positions to metres and back.

## Data contract and ownership

Proposed worker call: `host.call('studyTrack', { name })`. Return the existing track fields: study name, drive name, unit, range, original row indices, sampled drive values and a component-ID map of packed matrices. The row indices identify gaps even when two valid frames sit next to each other in storage. Each component has 16 column-major values per valid sample. Translations are millimetres. An unknown study yields a recoverable error naming the study. A study with a single valid sample can be inspected. Play requires at least two adjacent valid samples.

Fetch once when a study is selected. Associate each request with the current compiled program and a selection generation. Discard late replies after either changes. Copy or structured-clone the requested arrays so the worker retains its original buffers for later inspection and Render export. Keep only the selected track in Stage memory. A 361-sample, 30-component track is approximately 1.32 MiB at 64-bit precision.

```text
preset .study() → compile and solve → worker retains studyPoses(name)
                                              ↓ one request on selection
Play / scrub → original study row → component world transforms → Stage sheet
                                              ↓
                                  posed ports, picks and joint markers
```

## Clock and interaction

Use elapsed time from requestAnimationFrame. Map it to an original study row, preserving authored order for descending drives as well as ascending ones. Draw the exact stored sample. This makes a paused pose reproducible and avoids deforming a rigid link through element-wise matrix interpolation.

```text
on tick(now):
    target = rowAtElapsedTime(now - startedAt, startRow, previewDuration)
    boundary = first missing row between displayedRow and target
    if boundary exists:
        hold preceding valid pose, pause and show the unavailable drive value
    else:
        display target and pause if it is the final row
```

Keep the current pose on Pause or orbit. Scrubbing pauses the clock and shows the drive value with its unit. Selecting an unavailable row reports the gap and holds the previous valid pose. Play at the final row replays from the start. When multiple studies exist, show their names in a selector. Expose accessible Play/Pause names and a keyboard-operable range control. Hide the controls for standalone parts and assemblies without tracks.

Clear the preview before joint editing or drag-to-pose. Drag release already commits overrides, whereas playback is an inspection action. Cancel the animation callback on recompile, preset change or Stage disposal. Pause on tab backgrounding to avoid a jump on return. Disable playback during a failed compile displaying last-good geometry, in sketch editing, and on the fallback sheet until it implements posed picking.

For an occurrence with rest placement T0 and sample placement T, a point stored in rest-world coordinates moves by T × inverse(T0). Use that rule for markers already expressed in world space. Local points use T directly. Resolve picks against the displayed bodies and preserve their persistent face IDs. Preserve the camera framing during playback. Suppress a live numeric annotation when the selected study row lacks its value.

## Phase-driven mechanisms and the Singer

SG-03 currently evaluates assemble() once from phase and swingAt(). A sweep of the crank joint alone cannot reproduce the coordinated gate, slide, rod and take-up angles that its script computes. Its existing trajectory TSV contains only the needle tip and lever eye. Reconstructing ten component transforms from those two points is underdetermined.

After native playback works, add a second producer of the same track. A proposed authoring API would register a scalar phase range and a function returning named joint parameter values. Evaluate that function in the worker for each requested sample against one fixed assembly topology, solve the placements, then emit the ordinary indexed track. The exact DSL spelling is an implementation decision. Geometry is built once per compile. Changing gate amplitude invalidates the track. The Stage consumer accepts either producer without knowing which mechanism supplied it.

The Singer pilot covers 0–720° and uses the existing shared linkage equations. The two-revolution period matters because the gate alternates sides at successive penetrations. Compare the solved tip and eye with SINGER-001 at the same amplitude and phases. This validates playback fidelity to the CAD model. Physical timing remains a separate measurement.

## Delivery and acceptance

1. **Worker contract.** Retrieve F-06's cycle and compare its matrices at 0°, 90° and 360° with the native study. Exercise missing names, descending drives, row gaps, and repeated retrieval after Render export.
2. **Stage preview.** Play, pause, scrub, change camera and resume. Check transformed meshes, joint markers and face selection at the same pose. Count compile calls and worker requests over a full cycle. After the initial fetch both counts should remain zero.
3. **Lifecycle and regressions.** Switch presets during a pending fetch, start a new compile, and leave Stage during playback. Verify stale poses never appear, joint overrides stay unchanged, and ordinary drag-to-pose still commits when used intentionally.
4. **Singer integration.** Add the phase-track producer and exercise the existing 73 reference poses, including alternate penetrations at 0° and 360° and return at 720°. Sample both coupled linkage closures. Record browser screenshots at matching shaft angles and compare against the existing ticket data.

Native study playback can ship after the first three milestones. A Singer-specific toolbar or a per-frame preset rebuild would make every future mechanism pay for a problem already solved by the study infrastructure.
