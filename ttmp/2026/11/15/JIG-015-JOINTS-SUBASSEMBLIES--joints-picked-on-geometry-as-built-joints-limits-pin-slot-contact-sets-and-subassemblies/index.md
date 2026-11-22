---
Title: 'Joints picked on geometry, as-built joints, limits, pin-slot, contact sets and subassemblies'
Ticket: JIG-015-JOINTS-SUBASSEMBLIES
Status: active
Topics:
    - assembly
    - engine
    - ui
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - import/jigcad/src/engine/assembly.js
    - import/jigcad/src/engine/mechanism.js
    - import/jigcad/src/engine/io.js
    - import/jigcad/src/ui/joint-insert.js
    - import/jigcad/src/ui/views/mechanism.jsx
    - import/jigcad/src/stage/stage.js
Summary: "The next steps toward FreeCAD's and Fusion's assemblies after JIG-014: joint ends read from geometry and as-built joints (Fusion's joint origins), joint limits that hold, the pin-slot joint, contact sets for drags, and subassemblies (rigid or flexible) with a nested BOM and STEP product structure."
LastUpdated: 2026-11-15T19:30:00-05:00
WhatFor: "Making assemblies the way Fusion and FreeCAD do: pick a bore and a pin, keep parts where they sit, nest mechanisms."
WhenToUse: "Reading or changing joint ends, limits, contact, subassemblies or assembly STEP export."
---

# Joints from geometry and subassemblies

## Overview

JIG-014 made assemblies mechanisms, but every joint end had to be a port written into the part code, limits were
only start values, and an assembly could not contain another. This ticket closes those gaps against Fusion
(joint origins, as-built joints, motion limits, pin-slot, contact sets) and FreeCAD's Assembly workbench
(sub-assemblies):

- **Ports from geometry.** A joint end can be `j.on(comp, selector)`: a cylinder or cone gives its axis (mid-way, or
  `at: 'start' | 'end'` through `j.frame.on(j.on(…), { flip, at, offset })`), a circular edge its centre and axis, a
  straight edge its middle and direction, a planar face its centre and normal (outward on the joint's a end, inward
  on its b end, so two faces meet face to face), a vertex its point. An axis has no sign, so it points along +Z,
  else +Y, else +X. Each choice is recorded as a decision (`kind: 'port'`). This settles the spec's open question on
  port derivation: sketch refs and selectors both work, by the end's type.
- **As-built joints.** `j.joint.revolute({ asBuilt: true | end })` reads one joint frame in the world where the
  components already sit (their `at`), from end a's geometry or the end given, and expresses it in both components,
  so the joint holds at 0 without moving them. A bare component id is a valid end.
- **Joint from the sheet.** The Mechanism view takes a face or an edge selected on the stage as end a or b, a kind and
  "as built", and inserts the `.joint(` line after the script's last `.joint(` (or `.add(`) call, then compiles.
- **Limits hold.** A drive past a limit is held at it (`asm.limit`); a pose that puts a loop joint past one is
  reported; study rows past a limit are gaps marked with the joint (`study.limited`); a drag stops at a limit (clamp
  rows added as an active set). Angles are tracked as turned values for limited joints. Numbers in a slider's limits
  are millimetres; they were read as degrees.
- **Pin-slot.** `j.joint.pinSlot()`: a new `onLineX` primitive (b's origin on a's x line, 2 equations) and the axis
  primitive; its value is the angle, `slide` the slide (also reported for cylindrical joints, with `slideLimits`).
- **Contact sets.** `.contact(ids)`: a drag step that makes a new pair touch is not taken (display-mesh gap), so the
  drag stops just before contact; the stage says which limit or contact stopped it.
- **Subassemblies.** `.add(id, assembly, { at, flexible })`. Components join as `'<id>/<comp>'`. Rigid (default): the
  subassembly is solved on its own, then held as one body by rigid joints to its root (hidden from the joint list);
  its studies, reports and readings come along under its id. Flexible: its joints, drives, hints, couplings,
  readings, events, studies, reports and contact sets join the parent's solve, prefixed, and its readings and
  reports still see their own names. A subassembly's root is fixed where `at` puts it unless a joint from outside
  holds it. The BOM nests (`prog.bom({ group: 'flat' })`, worker call `bom`).
- **STEP with product structure.** An assembly's STEP export is an XCAF document: one product per part (shared by its
  components), one per subassembly, components placed in their parent's frame and named. `STEPCAFControl_Writer.Perform`
  writes it; `Transfer` with a file prefix (even empty) wrote the parts as external documents.

## Tests

`test/engine/run.mjs` 52 (Scotch yoke with a pin-slot: stroke 2r, closed form within 1e-8), 53 (limits: drive held
at 110°, 7 study rows past it, drags to the limits; a contact set stops a drag at about 96°), 54 (bores pinned
through each other, planar faces meeting, as-built joints, bad ends), 55 (a flexible drive geared 2:1 to the parent,
a rigid bracket swung as one body, nested BOM, STEP with 9 products and 8 usages). `test/ui/joint-insert.test.mjs`:
picks to joint ends and the insertion point. Every earlier test passes.

## Not built here

Higher pairs (cam, tooth contact), bevel gears, gear couplings across a turning carrier, contact during studies
(the interference check over a study reports overlaps instead), a picked joint's preview frame on the sheet before
it is inserted, a subassembly reused by reference (each instance is compiled; parts are cached).
