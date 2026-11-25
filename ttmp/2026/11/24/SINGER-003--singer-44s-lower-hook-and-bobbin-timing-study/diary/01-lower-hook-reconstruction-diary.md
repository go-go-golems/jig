---
Title: Lower hook reconstruction diary
Ticket: SINGER-003
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:09:14.189293067-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Identify the event to reconstruct

The user approved the proposed 2,048-SPP closeout and lower-hook study with “goahead”. The mechanical objective is to observe the rotating point crossing the scarf of the rising needle, reuse existing needle and plate geometry, and show the numerical setup alongside an actual CAD frame. The subsequent question “what abuot more keyshot like functionality?” prompted a separate discussion of saved cameras, timeline authoring, reusable studios and animated section sweeps.

### Evidence and decisions

Singer procedure 3-11 specifies a 3.5 mm needle-bar rise before checking that the hook point lies behind the needle center. Procedure 3-12 checks a lateral gap under its own stated setup. Treat the procedures separately and distinguish factory values, reconstruction inputs and values derived from solved poses. Bring the reference images, source identification, and numeric verification into the ticket so that a viewer can follow the evidence behind the labeled frame.

### Review path

Start with the reference note and its extracted source figures, then the authored part library and solved verification. The browser camera will use the same preset that supplies the motion. The movie and event image need both the prescribed rise and an explicit provenance for the modeled clearance.

## Step 2. Register the lower head and solve the service event

I reused the SG-03 plate, needle and crank–rod closure. The new SG-10 preset has its own reusable library for the rotating G25 holder, restrained M25 case and plastic M41 bobbin. SG-10 uses the source review from Step 1. The upper-head model's estimated needle-eye position at bottom dead center sits above the plate. Carrying that placement into the lower assembly would make the hook miss its working area. I estimated the ring height at −4.0 mm and shifted the needle path vertically by −11.4 mm to satisfy the 28.5 mm straight-stitch bottom datum in §3-10.

### What changed

The shared needle now declares its scarf and eye landmarks alongside the solid cuts. With the right-hand gate held at the representative SG-08 angle, the new library minimizes the shared slider displacement to find bottom dead center, then bisects the rising interval for a 3.5 mm bar lift. The 120-step study brackets this event symmetrically. The solver's exact center sample is 60. The beak rotates leftwards across the needle with an assumed two-to-one speed ratio. The parts book supplies identity and arrangement. The ring depth, hook radius, detailed profiles, gate angle and gear ratio remain reconstruction inputs.

### Geometry evidence and corrections

Script 02 compiles SG-10 through the real worker, obtains the occurrence transforms and finds the named points on their original solids. At the event the point coincides with the scarf witness in X and Z. OpenCascade gives a 0.075 mm point-to-needle distance, matching the chosen midpoint of the separate §3-12 procedure. The eye's upper edge is 1.9983 mm below the point in world Z. At the preceding and following samples the point lies on opposite sides of the needle.

An initial all-pairs audit found 0.0000974 mm³ of common volume between needle and holder at the event even though the apex-to-scarf clearance passed. Moving the inner edge of the beak root outward removed the overlap at that sample. Analytic arcs replaced polygon walls, eliminating axial drafting seams around the cup. The motion remains a short service inspection with an unloaded bobbin and an inferred rotating holder profile.

## Step 3. Qualify the solid sweep and publish the cutaway

Commit 12f8097 contains the reusable lower assembly, 121-pose verification and solved-frame receipt. Checking all 121 samples produced 485 unique bounding-box candidate pairs. The maximum reported OpenCascade common volume was zero. SG-03 still compiled with 29 bodies and SG-10 compiled with 19 features, five bodies and zero residual degrees of freedom. Clearances between samples and specimen dimensions remain open measurement questions.

### What changed and how to reproduce it

The authored cutaway moves the local section plane from +25 mm to zero over 1.2 seconds, then holds it steady at the hook pass. Script 03 runs against the built workbench, selects the authored render and captures the four-second 960 × 600 sequence. The labeled PNG uses the output camera passed to the real color renderer and projects the verified model-space hook point into that image. The projected center falls at approximately (547, 323) pixels. The caption identifies model shaft angle, specified rise and selected midpoint clearance.

The Stage video contains 96 frames. Its noncyclic endpoint sampling brackets the numerical inspection row between adjacent frames. Script 03 inserts a 48-frame hold of the actual row-60 render between those two samples. This produces a six-second, 144-frame H.264 movie at 24 fps with the event visible for two full seconds.

### Validation and tools

The first browser call reported a missing Chromium headless shell revision 1255. The capture script accepts an explicit executable argument. I reran it with the installed revision 1254, Playwright, and the local workbench on port 18965. The decoded test in script 04 compared frames 48, 71 and 95 against the labeled PNG, yielding mean absolute channel differences of 0.538, 0.535 and 0.535 out of 255. The first and final frames differ from the held frame by 19.711 and 18.658 respectively. The movie's SHA-256 is a1365e999be784bb34ad055b008347acc5c8c8f5037fab149e9e953c69d495b3.

Review the section as the plate withdraws, then follow the leader to the hook point during the hold. Inspect scripts 02–04 and the receipt when repeating the work. The manual reference images identify which checks use a fitted bobbin case and which require removing it. Model assumptions and their effect on interpretation are recorded in SG-10's preset notes.
