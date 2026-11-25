---
Title: Component ID mask export implementation diary
Ticket: JIG-026
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:35.296913339-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

An editor needs to select an individual occurrence at a specific movie frame. Allocate stable RGB identifiers from the source occurrence list and reserve black for background. An isolated or hidden item must keep its identifier for later frames. A cap belongs to its cut occurrence.

### Review instructions

Check masks against a scene containing overlapping moving components, an isolated component and a cut surface. Decode PNG and verify every non-background pixel has a declared occurrence. Compare silhouette and projection against the ordinary Stage pass.

## Step 2. Render categorical IDs from the Stage depth buffer

The requested mask shares the ordinary drafting raster, camera, pose and clipped body list. A separate Output selector allows the author to keep the shot's isolation, section, projection and framing while switching between the image and its matte. I added an opaque lossless PNG, a color legend, a ZIP of PNG frames with the legend, and a compressed video preview.

### What changed and why

The source program establishes a sorted list of occurrence IDs. Each receives a unique 24-bit color. The allocation reserves black for the background. Bodies belonging to one occurrence share its color, including generated cut faces. Assigning colors before isolation avoids renumbering surviving parts. The raster already computes the nearest visible face per device pixel. The mask resolves that face through the instance table and writes exact, opaque channel bytes with putImageData. It bypasses lighting, strokes, annotations, margins drawn over split views and inset borders. Compression in MP4/WebM can alter channel values, so the PNG sequence is the compositing deliverable. The ZIP carries the absolute output frame numbers, selected interval, rate and dimensions.

### Integration checks and failures

The first browser smoke run stopped with a Playwright strict-mode error selecting Composition after the timeline editor also introduced a label containing that word. I selected the exact accessible name. The second run decoded the isolated and full-spread mask images and checked their pixel identities, then timed out changing Study frame while its custom section preview had begun interpolating back to PBR. I made the test's CAD comparison hold zero surface contribution through its complete diagnostic interval. The mask itself requires no GPU shading. The test exercises two views and a detail inset and examines label colors on every pixel in the saved images.

### Review instructions

Select Render, then choose Output → Component ID mask. Set Style → Preset animation to apply authored isolation or sections. Save ID legend downloads the mapping for the complete source assembly. Save mask sequence includes the legend in the ZIP and follows the inclusive work-area controls. Render preview video uses the ordinary browser encoder. Reordering the source program preserves the sorted palette. Changing occurrence membership can assign different colors on the next export, so retain the legend with each job.

### Verified export

The final browser run passed at 480 × 320. For the spread and the isolated cut, every pixel in the decoded saved PNG agreed with the ordinary drafting pass's visible occurrence at the same image coordinate. The spread contained all 29 occurrence colors. At row 210 the image contained 553 bar pixels, 200 guide pixels, 153 shank pixels and 661 foot pixels. All other pixels were opaque black. The split-view and inset exports contained only colors declared in the legend. Frames 209–211 were exported to a ZIP with their absolute indices. Its middle PNG was byte-identical to the separately downloaded row 210 still. ffprobe counted three frames in the compressed preview. The ticket contains the images, legend, ZIP, MP4, UI screenshot and reproduction script.
