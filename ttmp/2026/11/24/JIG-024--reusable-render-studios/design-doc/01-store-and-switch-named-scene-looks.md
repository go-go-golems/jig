---
Title: Store and switch named scene looks
Ticket: JIG-024
Status: active
Topics:
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-24T23:12:32.404308384-05:00
WhatFor: ""
WhenToUse: ""
---

# Store and switch named scene looks

## Operator workflow

A named studio collects rendering choices for repeated use. Lighting, material assignments, background and exposure affect the surface pass. Keep them separate from the assembly definition so switching a studio reuses occurrence geometry and motion.

## Implementation and data ownership

Use the existing Candela look interface and project storage. Bind a studio explicitly for preview and export, propagate look changes to the renderer and invalidate stale previews. Reuse the same settings when preparing a native job. Preserve other named studios when one changes, and offer clear controls to save, apply and remove a studio.

## Verification

Create two visibly different looks, switch between them, reload and compare. Confirm fixed exposure persists across frames and that shader or material changes use the chosen scene settings.

## Runtime contract

A saved studio has an explicit name and the look definition needed to reproduce it. The workbench already compiles look.js into a Candela scene. Reuse that representation for material and lighting meaning. Applying a studio makes the selected scene configuration available to the beauty renderer. Keep the Stage geometry, study and camera independent.

## Failure handling and boundaries

Color-only changes can reuse static geometry. Changed material definitions or environments must refresh the rendered scene. Report errors from invalid look code before publishing a completed image. Saving or switching one named entry must preserve all other entries.

## Implementation entry points

- import/jigcad/src/render/host.js
- import/jigcad/src/render/stage-pbr.js
- import/jigcad/src/ui/views/stage-render.jsx
