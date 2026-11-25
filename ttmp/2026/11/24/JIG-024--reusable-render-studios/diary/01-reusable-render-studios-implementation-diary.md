---
Title: Reusable render studios implementation diary
Ticket: JIG-024
Status: active
Topics:
    - cad
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/src/render/studios.js
      Note: Portable studio format and project storage
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:32.717050581-05:00
WhatFor: ""
WhenToUse: ""
---

## Step 1. Establish the design and acceptance case

The user requested “Ok, create a new docmgr ticket for eachof the keyshot stuff, and create a design doc for each, then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”. They added “upload the design docs to remarkable as well”.

A named studio collects rendering choices for repeated use. Lighting, material assignments, background and exposure affect the surface pass. Keep them separate from the assembly definition so switching a studio reuses occurrence geometry and motion.

### Review instructions

Create two visibly different looks, switch between them, reload and compare. Confirm fixed exposure persists across frames and that shader or material changes use the chosen scene settings.

## Step 2. Save the scene used by Candela, with its imported modules

The approved design (Step 1) calls for reusable lighting, material, background and exposure choices. The workbench already stores those choices as Candela scene source. A named studio stores that source, its local look modules and an optional explicit EV in render-studios.json. The active entry is per project. A portable studio JSON file can be imported into another preset. Edits take effect on Save and apply, and saving a new name preserves the other entries.

The Stage viewport and native job exporter use the same source and modules. Selecting a different studio invalidates the queued PBR preview, then rebuilds its look in the existing viewport. A fixed EV bypasses auto-metering. Studio changes are excluded from the mechanical compiler's input file map. Existing projects default to their look.js or the ordinary Stage default.

### Review plan

The browser script makes two different environments and materials. It applies fixed EVs 7 and 9, saves, switches, reloads the document, removes a studio and imports the saved file into SG-06. The work-area fixture sends a selected named studio through the native renderer and records its exposure.

### Test evidence and implementation decisions

The first end-to-end attempt allocated a new graphics context on each switch. The second studio exceeded the browser check's 90-second preview deadline on the full SG-09 assembly. I changed the renderer to retain its viewport and device, rebuilding the scene only when the selected studio or displayed geometry changes. The acceptance fixture now uses the isolated SG-04 needle hardware to check the material pass. Both actual graphics previews were captured. The worker still owns the same CAD geometry.

The visual builder writes a real Candela scene from key light illuminance, top and bottom environment colors, and an optional occurrence material assignment. Users can edit this generated source before saving. “Machined metal” used automatic face finishes and fixed EV 7. “Blue inspection” used a 700 lux directional key, a gradient environment, roughness 0.45 and a blue material override with fixed EV 9. The two 224 × 160 RGB previews had a mean absolute channel difference of 26.19 levels out of 255. The background sample at (0,0) changed from (86,86,86) to (39,59,82).

The test switched to the original studio, reloaded the page, verified the active studio and EV, removed the second entry, and imported its portable JSON into SG-06. The source and EV survived the transfer. The color source is preserved in sources/blue-studio.json. The second fixture imported that same JSON into SG-04 and exported a native job. The remote runner returned a 4-SPP image from OptiX with EV 9, SHA-256 0f5d00cce25d5b0e8622ab1ad9b77d98865d41620771113ad9f314b118efacaa. Pixel (0,0) matched the browser's blue background exactly. Browser and native hardware can sample individual highlights differently.

### Reproduction and review

Run scripts/01-check-studios.cjs and scripts/02-export-inspection-look.cjs with the workbench URL, Playwright module, Chromium executable and one shared output directory. The first fixture supplies the studio file to the second. Submit blue-still.zip using the repository's scripts/submit-stage-job.py. Compare sources/blue.png, sources/machined.png, sources/native-blue.png and the native receipt. The renderer stores scene source, an optional fixed exposure and dependency modules in the preset's render-studios.json, which is excluded from the CAD compiler. This keeps geometry, saved cameras and animation outside the studio definition.
