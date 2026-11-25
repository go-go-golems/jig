---
Title: Implementation and geometry evidence diary
Ticket: SINGER-002
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T19:00:35.143224085-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Loop the CAD study and collect the part references

The request was “add loop option. Then, hone in on making a true to life set of presets modeling the different pieecs of the singer mechanism”. I split the work at the playback boundary. Looping remains optional for inspecting mechanisms with end stops.

### What I did

Added Loop to the Stage study transport. Inspected the original movies, family parts list and the 2022 service manual, which explicitly includes the 44S. Retrieved the family list separately from the local 2010 parts list for model 4411.

### Why

A loop may cross a missing row at the cycle boundary. Advancing through the original row order retains that information.

### What worked

Four sample-order tests and a Chromium replay covered looping across a seam, switching Loop off while playing, pausing, and restoring the home pose.

### What didn't work

The earlier flat link silhouettes and the catalog's exploded spacing alone cannot determine assembled depth. Additional traced landmarks are needed.

### What I learned

The A-43 parts drawing distinguishes the take-up lever, its supporter, the supporter shaft and retaining hardware. The footage shows the moving joint between the crank-pin boss and the thread eye.

### What was tricky to build

A slow display frame can cross the seam before the sheet draws a new frame. The check includes both sides of that boundary.

### What warrants a second pair of eyes

Compare the visible lever at two indexed frames before assigning a local eye position.

### What should be done in the future

Record the modeling evidence and independently inspect the revised trajectories.

### Code review instructions

Run the Stage sample tests and scripts/04-check-stage-loop.cjs against the built workbench.

### Technical details

Loop defaults off. Replaying uses the cached component poses; a gap still stops the clock.

## Step 2. Register the individual parts and test the assembled head

The Loop checkpoint was ee2786e. The user then asked “commit the images as reference and to write up a vault report later on”. The original photographs, video sheets and source manifests landed in a45e84b. I compared two close-ups of the linkage with catalog plate A and the presser and needle hardware with plate E.

### What I did

Added five isolated studies, rebuilt the combined head from shared parts and retained a new numerical trajectory. The needle now has a rear flat, scarf, thread groove and open eye. The take-up eye is traced beyond the support pin. The presser uses a helical spring, lifting lever, shank and foot. The zigzag setup uses the manual's needle-flow height.

### Why

The previous eye extended from the opposite side of the crank pin. The two photographed pin-to-eye ratios agree on its side and approximate reach. Reconstructing the parts independently also exposes interfaces hidden by a single solid.

### What worked

All eight presets compiled. The refitted combined model has 29 bodies. The largest planar closure error across its 145 samples was 1.73e-9 mm. In the setup view the leftward needle tip was at X = −2.795 and Z = 5.000 mm. Exact-solid checks covered ten needle-hardware pairs at rest and 100 moving-pair tests across 25 phases.

### What didn't work

A guide rib initially occupied 4.4768 mm³ of the needle-bar envelope. After relieving the guide, a 0.9713 mm³ overlap still occurred at the top of the bracket stroke. At integration the complete-head audit found 93 positive intersections at nine sampled poses, including 199.0 mm³ between bar and crank. The initial results are preserved in sources/assembly-fit-initial.tsv.

### What I learned

Closed motion equations can describe bodies occupying the same volume. The open thread eye and forward face of the drive can be identified from the footage. The source does not fix all bearing depths.

### What was tricky to build

I separated the crank journal from the needle-bar sweep, added its bushing, moved the reference web clear of the gate boss, cut clip grooves, set the guard against the lever face and moved the estimated presser-axis spacing from 12 to 22 mm. That spacing is a fitting choice, still awaiting measurement on the actual head.

### What warrants a second pair of eyes

Measure shaft orientation, true bar separation, crank throw, both take-up centers, and the guard clearance on a specimen. The drawings do not establish the complete three-dimensional registration.

### What should be done in the future

Retake fixed-camera views with a scale and handwheel index. The captured original images and current workbench figures can be reused in the later vault report.

### Code review instructions

Run scripts/06-check-presser.mjs, 08-check-needle-hardware.mjs, 11-audit-head-fit.mjs and 12-check-registered-head.mjs from the repository root, using their ticket-relative paths. Open SG-04 and set spread to zero to inspect the fitted needle socket.

### Technical details

The final all-pairs audit sampled 49 shaft positions at 15° intervals. No pair exceeded 0.001 mm³ of common volume after the bounding-box screen. This checks sampled solid geometry. Fabric, elastic response, axial play, tolerances and continuous collision detection require additional evidence.

## Step 3. Capture the fitted assembly and publish the figure index

The hardware milestone was 8aa7383. I added study playback to both isolated drive views, rebuilt the workbench, captured all eight presets and saved four additional detail views. The screenshot script checked the CLI feature and body counts against the loaded browser model. A capture of the Loop control was also refreshed on the assembled model.

The historical Stage regression now reads its original source fixture at ba235fe when comparing to the earlier trajectory. I ran both its worker and Chromium checks using a temporary image destination; the historical figures remain reproducible. The new ticket has its own matching trajectory and capture scripts. The component atlas indexes the original and generated images separately for later vault writing.

## Step 4. Present the upper head and presser assembly in a repeating sequence

The requests were “can you make an exploded view of the entire mechanism?”, “in fact can you make a preset with an animation that explodes and then puts it back together and then does 2 cycles and loops?” and “including the foot and all that”. SG-09 uses the full combined head with the presser lifted by zero mm.

### What I did

I mounted the same 29 occurrences as SG-03 at the first sewing sample. I authored 28 display translations around the stationary casting and added a CAD Stage timeline that reuses the first solved pose during separation.

### Why

An exploded view intentionally separates mating surfaces. Keeping the offsets in the presentation lets the sewing solver and solid model retain the assembled geometry.

### What worked

The preset checker compiled 76 features and 29 bodies. Stage uses a common camera envelope for the assembled and spread parts.

### What was tricky to build

The playback slider indexes both display samples and solved samples. The introductory samples all read solver row zero. After the return, indices advance through the original drive track, including its unreachable-row handling.

### What I learned

The original shaft law spans 720 degrees because the needle alternates sides. The end of the second stroke closes the animation.

### What warrants a second pair of eyes

Inspect the arrangement of fasteners around the presser and take-up assemblies from the front and axonometric views. The offsets illustrate part identity and do not establish a disassembly sequence.

### Code review instructions

Open SG-09 in CAD Stage and scrub through the full-spread hold. Review study-samples.js, study-playback.jsx and the offsets in the preset metadata.

### Technical details

Playback spends three seconds opening, one second at full spread, three seconds closing and six seconds on the two strokes. Only translations change during the introductory samples.

## Step 5. Verify playback in the running workbench and archive the views

The implementation checkpoint was 66dab82. I ran the ticket's scripts/13-check-exploded-head.cjs against the server on port 18965. Chromium confirmed that Loop started enabled and that playback advanced from the last sewing sample into the opening segment.

The script compared all 16 placement matrix entries for each of the 29 occurrences against the prescribed offsets at full spread, and against the home pose after reassembly and at 720 degrees (tolerance 0.00001). It also checked that the presser foot stayed seated while the needle moved. I enlarged the default view after inspecting the first screenshot and reran the browser check. The four SG-09 PNGs in sources/workbench show front and axonometric spread, reassembly and sewing. These are workbench captures of reconstructed parts. The original photographs remain in the ticket's source archive.
