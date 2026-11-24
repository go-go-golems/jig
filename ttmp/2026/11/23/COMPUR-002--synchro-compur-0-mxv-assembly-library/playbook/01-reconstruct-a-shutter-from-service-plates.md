---
Title: Reconstruct a shutter from service plates
Ticket: COMPUR-002
Status: active
Topics:
    - cad
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/tools/preset-check.mjs
      Note: Run a real kernel compile
    - Path: repo://ttmp/2026/11/23/COMPUR-002--synchro-compur-0-mxv-assembly-library/scripts/02-check-home-clearances.mjs
      Note: Report contacts in a shipped preset
    - Path: repo://ttmp/2026/11/23/COMPUR-002--synchro-compur-0-mxv-assembly-library/scripts/check-blade-aperture.mjs
      Note: Project leaf meshes onto pupil samples
    - Path: repo://ttmp/2026/11/23/COMPUR-002--synchro-compur-0-mxv-assembly-library/scripts/check-cocking-mesh.py
      Note: Replay a tooth clearance sweep
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T19:39:24.933712425-05:00
WhatFor: ""
WhenToUse: ""
---

# Reconstruct a shutter from service plates

## 1. Establish the specimen and sources

Record the type number, model suffix, revision, sheet date and drawing orientation in the ticket. Hash each archive with sha256sum. List the members with unzip -Z1. Keep the originals available locally. The model book, generated STEP and rendered screenshots can all descend from the same authoring script. Identify that dependency before counting corroborating sources.

Make one row per service piece. Record its service number, parent group, printed plate, PDF page, callout, quantity and variant. Follow the callout to the visible end of the leader. Where a factory supplement changes the assembly, record the serial or housing index to which it applies. Leave the dimension cell empty when the plate supplies only identity or order.

## 2. Establish the frame and one known scale

Pick an axial datum that survives disassembly and a radial datum that is visible on several plates. On this shutter they are the rear end of the threaded housing flange and the optical axis. Write the sign of Z. Check the largest diameter, clear bore and projection against the same model on the specification sheet.

Estimate an unknown distance from a flat orthographic view using measured pixels times the known length divided by its pixel length. Repeat using another visible known diameter. Record the difference and line thickness as uncertainty. For perspective photographs, use silhouette, relative order and bearing count until an independent scale is available.

## 3. Build and mate one part at a time

1. Ground a supporting plate. Draw it and its holes in the common XY frame at their axial height.
2. Build one moving part as a factory in a project file. Give the pivot a named frame. Assign a stable ID to the bearing hole and each working face.
3. In the preset entry, load the factory file with importPartFile, add the occurrence, then mate the two named ports. Give a moving part a revolute or sliding joint where its physical bearing supports it.
4. Inspect plan and edge-on views. If there are two pieces behind one service number, record both the instance count and resulting body count.
5. Add the next load-bearing neighbor. For a separate cartridge with an unknown mounting pose, use a local frame and list the two or more landmarks needed to register it.

## 4. Verify the motion and the evidence separately

For a pin-slot pair, transform the pin into the leaf's local frame through the working arc. Check that the pin stays within the slot and that the plate clears the swept pin. For gears, compare pitch radius sum with center distance, inspect axial overlap and sample tooth profiles through the operating range. For a cam, include approach, contact and exit. A minimum gap measured only at rest should be recorded with that pose.

Use this record for every dispute:

```text
pair and pose:
source numbers, page and variant:
observed feature or dimension:
design assumption:
comparison and numerical result:
remaining unknown and measurement that resolves it:
```

Run the real kernel with node tools/preset-check.mjs from import/jigcad, passing the preset ID. Read both the diagnostics and body count. Then run the full-assembly regression, rebuild the shelf with make web, and check that the generated files map includes each imported file. Check the full animation whenever a part's pivot, frame, bounds or ID changes.

## 5. Publish a repeatable assembly

Maintain one factory source per family. Link that source as a sibling of each consuming preset's script in the repository. In the browser the build packages each as editable text. Check the new preset in isolation using only the files delivered with that project.

Write the Notes page around one physical question the reader can answer by inspecting the model. Include variant, plate, confidence, known conflicts and a link to the adjoining group. Put the procedure, evidence and validation commands in the ticket, stage only the related files and commit after a working boundary. Include what a bench measurement would settle in the handoff.

The ticket includes three reproducible checks. Run scripts/check-cocking-mesh.py with the system Python and Shapely to sample the actual tooth profiles. Run scripts/check-blade-aperture.mjs with Node to project the assembled leaves at three stroke positions. After rebuilding the shelf, run scripts/02-check-home-clearances.mjs with Node and a preset ID to list touching pairs. Jig uses exact distances for suitable small bodies, mesh distances for complex surfaces and bounding boxes to discard distant pairs. Review a zero distance against the service evidence. A seated plate and a pin cutting through a moving leaf can both yield zero.

Exercise at least one nonzero input before accepting a driven joint graph. In CP-03 the home pose once looked correct while an unrestrained cartridge made the driven solve fail. Adding its rigid seat gave the expected wheel rotations at a 0.05° segment input.
