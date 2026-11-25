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

## Step 4. Finish integration and close the ticket

Commit de41a90 connected the render controls, both drawing passes and camera compositions. An isolation review found that joint marks and numeric face selections could refer to parts hidden by a shot. The final adjustment filters the joint/port annotations and resolves a selected source body by its stable ID in the isolated body list. Script 03 now checks the remaining annotation references as well as the clipped geometry.

The full Go test suite initially encountered the sandbox error “listen tcp 127.0.0.1:0: socket: operation not permitted”. It passed with local HTTP listeners available. The Stage unit suite passed 21/21, make web succeeded and docmgr doctor passed for this ticket.

## Step 5. Publish the workbench and run the same shot on the Spark

The user asked “ok, can you push this and check it out on bling.local which is my DGX spark, and render a high res version with optix over there?” I selected Full HD, 24 fps and 64 samples per pixel. I pushed main at 7f59b22. The Spark already had a jig-018-rt checkout, so I created a separate detached worktree under ~/data/pbr-spark/jig-sg09-7f59b22.

### What changed and why

Script 07 exports two geometry variants and 312 exact cameras and occurrence matrices from the shot. Every sample also has CAD reference plates that encode how the annotations and drafted lines composite over a beauty image. The native render CLI reads the scene and frame track, traces with OptiX, and reuses the first segment's metered exposure for later segments. Running the 64-sample pass on frames with a positive surface contribution avoids shading the 25 fully CAD frames. Scripts 08 through 10 composite, encode, decode and check the movie.

### Preflight evidence

The GB10 reported driver 580.178.04. It rendered frame zero at 1920 × 1080, 64 spp with explicit OptiX selection and metered EV 6.50414. A separate native probe on the section frame found its silhouette within one pixel of the matching CAD outline and confirmed the orange cap. The native batch ran in the sg09-optix-fullhd tmux session.

### Render result and verification

The Spark produced 287 native OptiX beauty frames and 25 fully drafted frames. The assembled H.264 file contains 312 frames over 13 seconds. Six decoded samples were compared with their source composites. Their mean absolute differences were approximately 1–2 levels on the 8-bit scale. The downloaded movie and the Spark copy both hashed to 8b46ab39c8b6be28a05644f21af5ac3293fc2366ff06aa9dfa1b5182ecdc0f46. The MP4 and JSON receipt are archived together under sources/.

The first full Candela test reported stale shader snapshots. Independent x64 and ARM64 regeneration showed exactly two changed fields in each of 105 fixtures on each architecture, the shared shader hash and its line count. All per-frame buffer digests matched. I updated those two fields while retaining fixture order. The isolated Spark checkout passed its 105-fixture ARM64 replay.

## Step 6. Repeat the Spark render at 1,024 samples per pixel

The user requested “ok, do 1024” after reviewing the 64-SPP result. I interpreted this as a second export of the complete 13-second movie at the same resolution, frame rate and exposure. Keeping both versions makes a direct visual and timing comparison possible.

### What changed and why

The new job directory on bling.local is ~/data/pbr-spark/renders/SG-09-optix-1080p-1024spp. It links to the previous job's plates, geometry variants and frame track. Beauty frames, composite frames, receipts and logs are private to the new job. I launched script 09 in the sg09-1024 tmux session with --spp 1024 --ev 6.50414. The encoder previously asserted a fixed 64-SPP receipt. Script 10 now takes the expected SPP as an argument and verifies it for each native segment.

### First evidence and review instructions

The native log reported approximately two seconds for each of the first frames. Script 11 reads the original frame-zero beauty PNGs, crops the same 260 by 455 pixel rectangle from both, and plots the absolute display-RGB difference with eightfold gain. I ran it against the downloaded native images. Their mean absolute channel difference was 2.20 out of 255 across the crop, including its background. This measures change after display processing. It does not measure error against a converged reference. Inspect the spring and plate highlights in the report figure.

### Remaining verification

The job must complete all four OptiX segments, composite all 312 frames and pass the encoder's decoded-frame checks. Record the timing from the four receipts and the Spark wall-clock logs, then check that the downloaded movie matches the receipt hash.
