---
Title: 'Assemblies as mechanisms: joints solved together, mobility by rank, drives, couplings, studies and a Mechanism view'
Ticket: JIG-014-MECHANISMS
Status: active
Topics:
    - assembly
    - engine
    - ui
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - import/jigcad/src/engine/mechanism.js
    - import/jigcad/src/engine/assembly.js
    - import/jigcad/src/ui/views/mechanism.jsx
ExternalSources:
    - https://claude.ai/artifact/8fkW35itz6gcNykA84Zkpa
Summary: "The README §4.10 solver slot (Newton on SE(3) with Lie-algebra updates) built: every joint's equations solved together, mobility 6n − rank J beside the Kutzbach count, conflicts as a minimal set, drives/hints/couples, measures/events/studies/reports, and a Mechanism view."
LastUpdated: 2026-11-14T13:24:50-05:00
WhatFor: "Assemblies whose joints close loops (four-bars, slider-cranks) and the readings a mechanism is designed around."
WhenToUse: "Reading or changing assembly placement, mobility, studies or the Mechanism view."
---

# Assemblies as mechanisms

## Overview

Before this ticket, `solveAssembly` placed components by walking the joints in order, so a joint that closes a loop
was left broken without a diagnostic (a four-bar probe: bodies only translated, 2 of 4 joints open), and
`assemblyDOF` came from a joint-kind count. Now (`src/engine/mechanism.js`):

- Each moving component has 6 coordinates (a rotation increment and a translation). Joints are sums of five
  primitives (point 3, on-axis 2, in-plane 1, axis 2, twist 1): rigid/snap 6, revolute 5, slider 5, cylindrical 4,
  planar 3, ball 3.
- Placement walks a spanning tree from ground (driven, hinted and coupled joints first), then Gauss–Newton with the
  minimum-norm step closes the loops; a failed direct solve is retried by continuation (relaxed drives, then the
  script's drive values).
- Mobility is 6n − rank J; the Kutzbach count and r = Σc − rank J (redundant equations, with the joints that carry
  them) are reported beside it. When the joints cannot hold, a deletion filter names a minimal conflicting set.
- A joint value given as a param, an override (now also as text: `'90 deg'`), the print pose or `.drive(id, v)`
  drives the joint; any other joint starts at its first limit, as before.
- New builder methods: `.drive .hint .couple(id, jointA, jointB, { ratio, offset }) .measure .event .study .report`;
  `.sweep(jointId, { steps })` (in §4.10 since the start) now runs as a study over the joint's limits.
- ProgramData carries `assembly` (components, joints with solved values, mobility, conflicts, studies, reports); the
  Mechanism view shows it, and its sliders set joint overrides.

The spec this implements, and the book chapters that validated it against the lockstitch rig, are in
`design-doc/01-assembly-spec-v0.1.md` and the living doc linked above.

## Tests

`test/engine/run.mjs` 43–46: slider-crank (Kutzbach −2, rank 17, stroke 31.000000 mm, clamp within 1e-12 of the
closed form, an override driving the crank), take-up four-bar (eye within 3e-12 mm of the closed form over 721
poses, the crossed closure from other hints), coaxial bearings (r = 5; misaligned 0.05 mm: front + back conflict,
residual = the tilt 0.05/60 rad), a 2:1 coupling with a sweep and an event. Tests 01–42 pass unchanged.

## Not built here

Couplings between ports (`j.couple.gear(portA, portB)` with the ratio from the teeth), higher pairs (cam, pin in
slot, tooth contact), interference over a study, port and joint glyphs and free-motion arrows on the stage, and
compiling a mechanism to kine (prototyped in the book: `book/web/jiglite-kine.js`).
