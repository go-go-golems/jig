---
Title: Building the Synchro Compur 0 MXV in JigCAD
Ticket: COMPUR-002
Status: active
Topics:
    - cad
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://import/jigcad/build.mjs
      Note: Shelf assembly and packaging
    - Path: repo://import/jigcad/content/presets/M-11-synchro-compur/compur.parts.js
      Note: Shared part factory definitions
    - Path: repo://import/jigcad/src/engine/worker.js
      Note: Local file resolution and diagnostics
    - Path: repo://import/jigcad/src/ui/views/code.jsx
      Note: Copy a published part file from the Files menu
    - Path: repo://import/jigcad/test/render/compur.test.mjs
      Note: Complete assembly and render acceptance
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T19:39:24.649387242-05:00
WhatFor: ""
WhenToUse: ""
---

# Building the Synchro-Compur 0-MXV in JigCAD

## Start with one exposure

Look into the front of the shutter before winding it. The leaves across the optical axis stop light from reaching the film. Winding stores energy in the main drive. Pressing the release frees a cam. One face on the cam pushes the blade operating ring far enough to uncover the aperture. A later face drives it back. The time for which a point on the film receives light depends on both movements and the time between them. The diaphragm behind the leaves sets the area that can admit light while the shutter is open.

Start at preset M-11. Open Render and play the recorded 1/125 release. Then open CP-02 in plan view and locate a pivot and an operating pin on the same blade. Follow that pin back to the ring. This exercise explains why the assembly needs both a circular bearing and an elongated opening. A pivot fixes the blade's center of rotation. A moving drive pin acts at an offset from that center, and the slot accommodates the changing distance as the two parts turn about different axes.

### Mechanical relationships

```text
cocking ring -> pinion -> main cam <- released by latch
                             |
                 +-----------+------------+
                 |                        |
           lug meets stud          cam meets retard lever
                 |                        |
             blade ring             gear segment / weight
                 |                        |
             five blades          compound wheels -> star
                                                   |
                                                 pallet

speed cam sets the travel available to the retard group
M/X contacts follow release or blade-ring position
V timer delays release of the drive
diaphragm sets the opening behind the shutter
```

The pallet alternately arrests and frees the escapement wheel. In the inherited simulation an averaged braking law represents this effect. The CAD revolutes describe bearings. Contact, spring energy and the calibrated braking law belong to the external dynamics project. CP-03 explicitly couples the wheel angles. Its ideal gear ratios enforce a kinematic relationship without simulating tooth contact.

## Identify the shutter before taking dimensions

Use the top half of factory PDF page 9, printed specification page 1, November 1956. Its table places the size 00 CN-1110-000 above the size 0 CN-1210-000. The caption assigns bracketed dimensions to CN-1210-000. The bottom drawing on the same page depicts another variant. Moving down the page to find a clearer numeral can silently change the model.

| Quantity | Size-0 value | CAD check |
|---|---:|---|
| Maximum outside diameter | 58.5 mm | speed-setting ring |
| Housing outside diameter | 57.1 mm | outer wall of 101 |
| Clear opening | 24 mm | full aperture in the optical stack |
| Front to rear cell seats | 20 mm | rear housing flange to front tube end |
| Rear mounting projection | 6.1 mm | flange end to housing rear |
| Mounting and cell thread designations | M32.5×0.5 and M29.5×0.5 | rear flange thread and cell bores |

The outline fixes a coordinate frame. Set XY perpendicular to the light path, the origin on the optical axis at the rear end of the mounting projection, and +Z toward the subject. Lengths are millimetres. A component may already be drawn at its assembled XY and Z. Adding its bearing position a second time moves it out of the case.

```text
Z = 0         6.1          9.2      10.9       16.2       20 mm
    | flange   | housing    | iris   | plate    | speed cam |
    +----------+------------+--------+----------+-----------+
    rear / film                              front / subject
```

The intermediate Z values above describe the CAD design. Only the envelope values in the table come from the dimensioned drawing. A thread designation specifies the nominal interface. The rear housing carries the external flange thread. The front and rear cell bores use nominal minor diameters. Inspect both builders before using the seats as a gauge.

### Source map

The smaller ZIP contains the reconstruction, design calculations, book and exchange model. Begin with `compur/book/src/chapters/02-sources.md` and `23-limits.md`. Read `compur/cad/parts.mjs` for construction intent, `cad/scripts/` for individual generated builders, `cad/assembly.js` for their relationships and `cad/compur.step` for the exported solids. The STEP file and the scripts share an authoring pipeline. Agreement between them checks export fidelity but supplies no independent dimensional evidence.

The larger ZIP contains the factory scans, course material and a searchable index. Begin with `extracted-text/diagrams/key_pages.md` under its top-level directory, then read the corresponding page in `uploads/Compur-Shutter-Manual-optimized.pdf`. Use the OCR to find a candidate part number and the scan to follow its leader line. In an exploded view, compare both the silhouette and what the indicated piece mates with. A screw next to a callout can otherwise inherit its neighbor's number.

- Factory PDF pages 50–58 cover the related plate series. On p56 the size-0 inset matters for blade order. The repair instructions distinguish first blade 268, middle blades 208 and final blade 267. A single repeated silhouette can conceal different tip treatments.
- Factory pages 81 and 83 show 0-MXV GH Reflex 103 plates. They corroborate 528 and 517 within that variant. Check the heading before carrying a shape or dimension back to the standard model.
- Lesson 9 figures 23–26 show the front stack, 31–37 the speed train, and 39–42 the release. Figures 81–82 and 109–112 distinguish the grounding strip and terminal from the moving flash levers. These 00-MXV photographs establish functional relationships. Their scale and mounting coordinates require separate evidence.
- For the V timer, distinguish the delayed-action movement from the exposure-speed escapement. Both contain rotating trains, but one delays the start and the other controls the exposure. Look for the separate cartridge in Lesson 9 figures 58–59.

For each proposed dimension record one of five origins: a printed dimension, a scaled estimate from a plate, a value derived from other dimensions, an engineering choice, or a calibrated dynamics parameter. Include the variant, datum, uncertainty and comparison used. For example, chapter 3 of the archive estimates some centers to about 0.5 mm. Quoting their generated XY coordinates to four decimals preserves assembly registration but adds no measurement precision.

## Read the assembly library

The following table maps the preset shelf to a physical inspection. Each study has a short script, metadata and notes in its own folder under `import/jigcad/content/presets/`. Inspect the notes alongside the corresponding plates. M-11 combines the original 29 components. Some of those components represent several service pieces, and the cartridge studies use separate local frames.

| Preset | Inspect | Question to answer |
|---|---|---|
| CP-01 | Housing, mounting tube and optical stack | Which surfaces establish the lens and camera interfaces? |
| CP-02 | Blade pack, studs and drive ring | Which parts pivot, and where can each pin travel? |
| CP-03 | Speeds escapement | Which three elements turn independently on the shared post? |
| CP-04 | Cocking and release | Which lug winds the cam, and which lever keeps it wound? |
| CP-05 | Front setting controls | Which plate retains the setting ring and cam? |
| CP-06 | Flash contact study | Which strip grounds the moving contact, and which goes to the terminal? |
| CP-07 | Delayed action | What must run down before the main cam can proceed? |
| CP-08 | Diaphragm | Which pieces govern the optical opening behind the shutter? |
| M-11 | Complete archived arrangement | Does the part keep its registered position throughout the baked release? |

**Follow one load path.** At the slow settings the retard lever's stroke drives a segment. The segment drives a pinion integral with a larger wheel. The larger wheel drives the next pinion. Count each pair separately. The archive's ratio (90/6) × (64/6) × (60/6) = 1600 refers to an equivalent full turn of the sector. The segment actually travels a small fraction of a turn. These tooth counts realize a calibrated design. They need independent confirmation on an original movement.

**Follow one electrical path.** One flash lever closes the circuit in both M and X. The grounding strip maintains continuity on the moving side. X closes the circuit at blade opening. M allows lead time for a flashbulb. The isolated contact study helps identify where the levers meet. Registering it in the full shutter requires locating the pivot and terminal in the common frame and measuring contact angles.

## From a file to a solid

```text
preset folder                  build.mjs / collectContent
  meta.json  script.js   ----> generated content.json
  linked parts file                  |
                                     v
                          host sends project files
                                     |
                         worker.compileFiles(...)
                                     |
                        script calls importPartFile
                                     |
                  factory -> part builder -> assembly
                                     |
                      OpenCascade solids and meshes
                                     |
                       stage / STEP / CAD package
```

A part is a construction history. A feature such as an extrusion changes the solid. A port is a named frame against which another component can be placed. An assembly assigns instance IDs to builders and relates ports by joints. The same part definition can be instantiated several times. Its instance ID identifies the occurrence in exports and in the pose table. Keep that distinction when renaming a blade.

### API and file references

- `src/engine/worker.js` under `import/jigcad/` owns `compileFiles({files, entry, options})`. The entry defaults to `script.js`. The map contains the text of each project file. In the script, `await importPartFile(name)` returns the value returned by that file. Nested imports share project data, units and logs. The name must match a key exactly.
- `content/presets/M-11-synchro-compur/compur.parts.js` defines the common part factories. Calling one constructs a fresh builder. The CP folders that need it have a relative link to this file. `build.mjs` reads the bytes while collecting presets. Once opened, each preset has its own project files, so editing a library in an open project affects that copy. Edit the canonical repository file and rebuild to publish an improvement across the shelf.
- `src/engine/part.js` and `assembly.js` implement the builder interfaces. A chain can use `j.part(name)`, `.extrude(region.on(plane), mm(t), {id})` and `.port(name, frame)`. Use `j.assembly(name).add(instance, builder, placement)` to add a part. A grounded member anchors the reference frame.
- `src/engine/program.js` compiles the assembly into inspectable geometry and diagnostics. `src/engine/cadpkg.js` prepares the render package. `content/presets/M-11-synchro-compur/look.js` consumes pose data from `compur-poses.look.js`. `tools/compur-poses.mjs` rebakes from the archive's web simulation when joint centers change.
- `tools/preset-check.mjs` reads the preset files and compiles them in a Node worker with the real kernel. `test/render/compur.test.mjs` also exercises component identities, transforms, material and animation export. A kernel success alone cannot establish gear engagement or electrical timing.

In the Code view, open **Files** and choose **Copy a published part file**.
Select the source preset and its `*.parts.js` file. Jig adds a project-local
copy and opens it for editing. Existing filenames are disabled. Copy any
sibling libraries the selected file imports as well.

This entry is enough to inspect a bearing and its leaf. The base is already drawn in the shutter frame. The joint makes the two axes coincident.

```js
const p = await importPartFile('compur.parts.js')
return j.assembly('First shutter leaf')
  .add('base', p.base(), { ground: true })
  .add('blade1', p.blade1())
  .joint('blade1', j.joint.revolute(),
         'base:blade1Pivot', 'blade1:pivot')
```

## Implement and check a correction

Suppose an intern discovers that a plate aperture is absent. First identify the pins or studs that pass through it. Measure the aperture centerline and angular extent relative to the optical axis, using a known diameter on the same view. A tilted photo cannot provide uniform scale. Check the plate in a second view to distinguish a blind pocket from a through opening. Give the aperture a feature ID so a future reviewer can find it.

```text
for each plate opening:
    locate its two end centers in the plate frame
    build the closed slot profile around the centerline
    remove the profile through the measured plate thickness
for each operating pin:
    sweep from closed to open relative to the plate
    compare swept envelope with the slot boundary
record minimum clearance, datum and pose range
```

Start with a single assembly. Inspect plan and side projections. Verify the count of parts, count of solid bodies, clear bore, distinct axial layers, and pivot alignment. A builder may yield more than one body. An unexpected extra body can reveal a disconnected feature. Compare contact pairs at several angles, especially where a pin enters a slot or a lug reaches a lever. A gap at one endpoint establishes only that pose.

From the repository root, build and exercise the actual shelf.

```sh
make web
cd import/jigcad
node tools/preset-check.mjs CP- --quiet
node --test test/render/compur.test.mjs
```

Open an individual CP entry by searching the preset shelf. Compare its Notes with the manual, use the graph to identify joints, and rotate the view to see axial layering. For production evaluation, supply measured blade thickness and tip form, axial stack, pivot diameters and working clearances. The archive itself flags a cam sleeve crossing a blade boss, axial conflicts involving the opening lug, stop and first wheel, and a tight cocking mesh. Track each by component pair and angle. The shared library now raises the cam sleeve above the plate, separates the opening lug and ring body, relieves the stop track and rephases the cocking teeth. The 127:18 ratio is preserved. At the fixed 21.70 mm center distance, the revised pitch radii sum to 21.65 mm. The 0.05 mm allowance is a reconstruction choice.

The enlarged factory section on PDF p9 shows two lens seats on opposite sides of the leaves. The earlier reconstruction ran a tube through the leaves. In the revised CAD the rear flange joins housing 101 and the relieved front seat 204 starts at Z 11.52 mm. The separateness of the seats is visible in the manufacturer's section. The front skirt length and relief angles are estimates. A remaining conflict lies deeper in the escapement. The first speed wheel overlaps the kicker at the same axial level. Raising that wheel alone would take it out of engagement with the next pinion. Measure both arbor stacks before changing either height. An inherited animation can still play smoothly through overlapping solids.

## Criteria for integrating the remaining studies

A local cartridge can enter M-11 when its origin, orientation and axial seat are registered to measured size-0 landmarks. With just a circular bearing, rotation about Z remains undetermined. A second noncoincident datum fixes that orientation. Record the transform with its source, instantiate the factory, and inspect the transferred contact and clearance at working poses. A study based on a sister model can remain independently useful until those measurements are available.

Treat the finished shelf as an inspection model. A dimensioned replacement drawing needs tolerances, materials and spring data in addition to the visible shape. A timing claim needs an independent exposure trace. Calibrating the model to a nominal shutter speed and then checking that same speed against the calibration target tests the calculation, while a new measured trace tests the shutter model.

## Bench record for this reconstruction

The gear-profile check in the ticket reads the actual modeled extrusion profiles and port axes. Across 761 sampled cocking-ring positions from −19° to +19°, the minimum planar separation was 0.017339 mm. That result covers the sampled tooth profiles. Axial lug contacts and deformation under spring load require separate checks.

In CP-03, moving the segment +0.05° gives wheel 1 −0.75°, wheel 2 +8° and star −80°. Verify the base-to-cartridge rigid joint when debugging this test. Two components can appear correctly seated at zero while their unconstrained frames move under load from the solver. In CP-08 a first clearance check identified all five guide pins touching the diaphragm cover. Centering the estimated guide slots on their pins cleared the static full-open pose. The 1973 supplement's five-blade replacement specification belongs to the index-88 housing. Its number and finish establish that configuration only.

The archives used in this investigation can be identified by their SHA-256 prefixes. The model ZIP ending in (3) begins 3e7ec0fad14ef01b. The source collection begins 9497ea35c9f83151. The ticket diary records the full digests.

## Component cross-reference

Use the first column below to find a member in the M-11 assembly tree, then open the factory of the same name. Grounded and fixed-at-placement components carry load or define an interface even when they have no animation track.

| Assembly instance IDs | What the builder represents | Evidence and inspection limit |
|---|---|---|
| housing, tube | Outer case, rear flange and separate front cell seat | Specification p9, CP-01. Internal relief and wall gauges are estimates. |
| base, bladePlate | Bearing plate and shutter leaf retainer | Plate 7 and the size-0 inset on p56. Inspect the five studs, openings and relieved stop track. |
| blade1 … blade5 | Service stack 268, 208, 208, 208, 267 | Inset and repair sequence. Swept reconstructions retain flat ends. |
| ring | Common actuator with pins for the five shutter leaves | Plate 7 and closed/open reconstruction. Stroke and swept clearances are checked in CP-02. |
| cam, pinion, cockingRing | Main drive, coaxial winding pinion and setting sector | Lesson 9 figs 39–42. Tooth ratio and backlash allowance belong to the reconstruction. |
| bridge, latch, release | Support, catch and trip | Fig 79 and the operating sequence. The real eccentric and spring preload need measurements. |
| escPlates, retard, segment, weight | Cartridge, input lever, sector and inertia weight | Factory plate 5 and Lesson 9 figs 31–37, 60–62. Stroke engagement changes with speed. |
| w1, w2, star | Compound wheel trains and escape wheel | Archive chapter 11. Verify tooth counts and wheel heights on the actual unit. |
| carrier, pallet | Support for the pallet and its rocking escapement member | Lesson 9 and CP-03. A calibrated average brake supplies the inherited timing law. |
| speedCam, speedRing, cover | Setting profile envelope, operator's ring and retaining cover | Figs 23–26 and the factory envelope. Indexing contours, knurl and engraving are incomplete. |
| iris | Full-open diaphragm envelope in the complete model | CP-08 resolves the five leaves and covers in a separate study of the replacement configuration. |

The light-coverage test projects the actual five blade meshes onto a lattice over the 25 mm working pupil. With 31,417 sample points, the closed pose blocked all samples, 3.7° of ring stroke blocked 18,859 and 7.4° blocked zero. This checks the reconstructed leaf contours at three positions. The diaphragm's independent full-open setting uses the 24 mm factory opening. Neither a light trace through real lenses nor a continuous sweep of all contacts has been measured.

### Interpreting the assembly clearance report

At the assembled reference pose the Jig clearance pass found 30 component pairs touching or overlapping after the seat and blade corrections. At the body-pair level it used 134 exact comparisons, 77 mesh comparisons and 223 bounding-box exclusions. No blade, diaphragm or pallet-carrier pair with the front tube appeared in that list. The tube still meets the retaining cover at the nominal common diameter. The first-wheel/kicker overlap remains an actionable conflict. To obtain the complete list, rebuild the workbench and run the ticket's scripts/02-check-home-clearances.mjs. Use the individual pair and pose when recording a repair.
