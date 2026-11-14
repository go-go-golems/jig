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

## The stage and kine

- The Joints overlay (`src/stage/mechanism-marks.js`, on by default; presets that list their overlays opt in):
  frames of the ports the joints use, a glyph per joint with its solved value, the free motions (an arc about a
  rotation's axis, else velocity arrows), and the paths of point measures over each study.
- `src/engine/kine.js` compiles the solved mechanism to a kine program: the spanning tree as a skeleton, a planar
  four-bar as kine's `solve.fourBar`, a planar slider-crank as `jig.sliderCrank`, any other loop as a
  `jig.table` (cubic Hermite, fourth-order tangents), couplings as derived expressions. `prog.kine(o)`, the
  worker call `kine` and the export format `kine` (a self-contained `.mjs` with the program, its two ops and
  the frames to observe). In the book the compiled lockstitch head matches the hand-written rig to 8e-13 mm.

## Gear couplings and interference over a study

- `couple(j.couple.gear(a, b))`, `j.couple.rack(rack, pinion)` and `j.couple.belt(a, b, { ratio })` find the joint
  that turns each component (through rigid joints to its shaft), take the ratio from the teeth (`meta.sets.gear`)
  and its sign from the axes of a provisional pose: ratio = k · zA/zB · sA · sB · sign(nA · nB), k = −1 for an
  external mesh, +1 internal or belt, s = ±1 for the gear on the joint's b or a side. A rack moves sP · sR ·
  (nP × (P − C)) · d per radian. At the solved pose the axes are checked against `j.inspect.gearMesh`
  (`asm.gearMesh`: centre distance, pitch-line distance, rack alignment).
- Couplings now hold on turned values: a coupled angular joint's value is unwrapped from the last solved pose
  (`MechanismSolver.uvalue`, `settle`), so an 18:30 pair does not jump 216° when the pinion passes 180°.
- kine: a coupling between an angle and a length (a rack) compiles to the op `jig.linear`.
- `.interference(ids, { study })` checks every sampled pose of a study (or every sweep, when no study is named):
  the gap per pair from the display meshes (`meshGapNear`: only triangles inside both boxes grown by the reach,
  1 mm first), and where they overlap the shared volume V(a ∩ b) from one OCCT Common (`K.commonVolume`). Rows get
  `gap a–b` and `overlap a–b` columns; `studies.x.clearance(a, b)` gives { min, overlaps, worst }. An overlap is a
  warning, not an error, so the assembly still compiles and the Mechanism view shows the band and the table.

## Tests

`test/engine/run.mjs` 48: the 18:30 pair and a rack (ratios −0.6 and 9 mm/rad, the wheel's step ≤ 3° across 180°,
a reversed joint flips the sign, axes 1 mm too far give `asm.gearMesh`, a fixed gear is refused, the kine source).
49: one tooth pitch in 11 poses keeps 0.200 mm; half a wheel pitch out of phase overlaps from 10° to 30°, worst
14.37 mm³ at 20°.

## Not built here

Higher pairs (cam, pin in slot, tooth contact), drag to pose on the stage, gear couplings across a turning carrier
(planetary trains: couple the joint values relative to the arm by hand), bevel gears.
