---
Title: Saved Stage cameras implementation diary
Ticket: JIG-021
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/src/stage/saved-camera.js
      Note: Camera representation, capture and field-height conversion
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:28.706428958-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

An inspection of the hook needs a repeatable close-up. Capture the resolved Stage camera after orbit, pan and zoom. Store the world target in millimetres, resolved yaw and pitch in radians, and vertical field height in millimetres. Pixel scale alone would change the framing when the canvas height changes.

### Review instructions

Save an off-centre axonometric view, change projection, recall it, then render at two sizes. Compare normalized projections and check persistence after reopening the project.

## Step 2. Capture a resolved orthographic view and recall it at output resolution

The Stage Cameras menu saves a name, world target, absolute yaw and pitch, and vertical field height in cameras.json. Recall scales the view to the current sheet height and zeroes the pan because the stored target already includes it. A Render composition or an authored view key can select the same name. Capturing the size-independent height avoids storing a stale pixel scale.

### What worked

The projection check in scripts/01-check-framing.mjs compared two world points at the original size and at double resolution. Both normalized image coordinates agreed within 1e-8. The JIG-022 Chromium check saved Inspection, changed the Stage orientation, recalled the view and compared the resolved yaw and field height to the stored values. The integration check then rendered a camera cut.

### Review instructions and boundaries

See src/stage/saved-camera.js and src/ui/views/saved-cameras.jsx. A missing camera name or a malformed record is a user-visible error. The menu is limited to resolved 3D views. Sketch camera bases use a separate projection. The 6-document design bundle was uploaded under /ai/2026/11/24/Jig-Stage; the cloud listing independently confirmed its presence.

## Step 3. Preserve zoom continuity on recall

Independent browser review exposed a scale discontinuity. A recalled 2.5× camera drew at the stored scale but the slider displayed 1.00×, and its next tick discarded the saved scale. Recall now derives the displayed zoom from the resolved scale divided by the current fit scale. The Stage slider and wheel both preserve proportional scale changes. The end-to-end check saved a panned 2.4× view, recalled its exact target and yaw, and verified that moving to 2.45× multiplied scale by 2.45/2.4. Code checkpoint 20bb599 introduced the capture path; the integration checkpoint adds this fix.
