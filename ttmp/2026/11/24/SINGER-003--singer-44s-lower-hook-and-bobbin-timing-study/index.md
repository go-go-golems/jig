---
Title: Singer 44S lower hook and bobbin timing study
Ticket: SINGER-003
Status: complete
Topics:
    - cad
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/content/presets/SG-03-upper-head/singer.parts.js
      Note: Shared upper-head geometry and motion law
    - Path: repo://import/jigcad/content/presets/SG-10-hook-pass/hook.parts.js
      Note: Lower assembly and phase registration
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:25:25.558704137-05:00
WhatFor: ""
WhenToUse: ""
---

# Singer 44S lower hook and bobbin timing study

## Overview

SG-10 follows the right-hand rising needle across the hook point. A 121-pose CAD study combines the shared Singer needle and plate with the rotating holder, stationary bobbin case and Class 15 bobbin. The cutaway exposes their relationship at the service rise.

## Key Links

- [Watch the six-second inspection](sources/sg10-hook-pass.mp4) or [inspect the labeled event frame](sources/sg10-hook-pass.png).
- [Solved event receipt](sources/hook-pass.json) and [geometry verification script](scripts/02-verify-hook.mjs).
- [Factory evidence](reference/01-hook-assembly-identification-and-service-timing.md) and [implementation diary](diary/01-lower-hook-reconstruction-diary.md).

## Reproduction

Run script 02 from the Jig repository root. Build the workbench with `make web`, select SG-10, and use **Render… → Preset animation**. Script 03 stages the camera, captures the exact center sample and inserts a two-second inspection hold in the exported 24 fps movie. [Browser capture script](scripts/03-capture-hook-pass.cjs)

[Tasks](tasks.md) · [Changelog](changelog.md)
