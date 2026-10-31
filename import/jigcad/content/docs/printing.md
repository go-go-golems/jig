---
id: printing
title: How jig thinks about printing
group: Printing
about: Orientation, overhangs, teardrops, bed edges, fit classes and calibration, slicing and cusp height, exports.
order: 10
---
# How jig thinks about printing

A fused-filament printer lays down a plastic line about 0.45 mm wide, one layer of about 0.2 mm at a time, each layer resting on the one below. Almost every rule in this page follows from that: material needs something under it, round holes print undersized, and curved surfaces come out as stairs. jig turns each rule into a default the compiler applies and records, so the Program says what it decided and why. The numbers below come from compiles in this build; [Chapter 8](lab:book?ch=8) and [Chapter 9](lab:book?ch=9) derive them.

## The print job

A part becomes printable inside a **print job**: a printer, a material, the parts, and what to do with them.

```js
return j.print('bracket', {
  printer: j.printer('mk4'), material: j.material('PETG'), parts: [bracket],
}).orient('auto').slice({ layer: mm(0.2) })
```

`j.printer` knows `generic-fdm`, `mk4` and `mini` (0.45 mm lines, 0.2 mm layers), `x1c` (0.42 mm lines) and `generic-msla` (0.05 mm), and accepts your own: `j.printer({ bed: [180, 180, 180], nozzle: mm(0.6), lw: mm(0.68) })`. The printer also resolves the symbolic units: a wall of `lw(3)` is 1.35 mm on an mk4 and 1.26 mm on an X1C. A part returned without a print job still compiles and exports; it is checked as if printed on `generic-fdm` with +Z up.

## Orientation

The build direction decides which faces need support, how much touches the bed and how tall the print is. `orient('auto')`, the default, tries 26 directions (the faces, edges and corners of a cube) and ranks them **lexicographically**: least support volume first, then most bed contact, then least height. A later criterion only breaks ties in the earlier ones. The decision records the winner and the runner-up. For the L-bracket of [Chapter 8](lab:book?ch=8), a 60 × 30 × 5 mm base with a 40 mm upright:

| direction | support | bed contact | height | how it was chosen |
|---|--:|--:|--:|---|
| +Z (auto) | 0 mm³ | 1,765 mm² | 45 mm | lexicographic winner; next was +Y with 51 mm³ of support |
| −Z | 20,516 mm³ | 300 mm² | 45 mm | fixed; 1,465 mm² overhangs |
| +Y | 0 mm³ | 2,650 mm² | 30 mm | `'min-height'` |

Pass a direction (`'+Y'`), a strategy (`'min-height'`, `'max-contact'`) or a function `(part, ctx) => dir` whose `ctx.default(part)` is the automatic choice.

## Overhangs and supports

A face whose downward normal is more than **45°** from vertical prints over air: each layer sticks out more than about half a line width past the one below, and the line sags. The 45° figure is a calibrated threshold, not a law: the printer profile carries it (`maxOverhang: 45`, 30° for MSLA), and a print job reports what exceeds it as `print.overhang` with an estimate of tree supports. Turn on *Overhang* under *Show ▾* to hatch those faces on the sheet, and print [C-02](lab:preset/C-02) to find your printer's own limit.

Design out overhangs where you can: a 45° point at the top of a window (D-01) needs no support; a flat ceiling does. Bridges, flat spans with support at both ends, print up to about 10 mm in PLA (`bridge: 10` in the profile); [C-03](lab:preset/C-03) measures yours.

## Teardrops

A round hole whose axis lies in the build plane has a ceiling that is flat at its top. jig turns every such hole into a **teardrop**: the circle plus two 45° flats meeting in a point above it, so no part of the ceiling overhangs more than 45°. The decision reads `axis +Y ⟂ build direction +Z → 45° teardrop, tip toward +Z`, and the new faces are named `<hole>/tear.l[…]` and `<hole>/tear.r[…]`.

Because the hole's shape depends on the build direction and the direction depends on the shape, the compiler iterates: orient, re-shape the holes, orient again, until nothing changes (at most four rounds). Turning the bracket to `'min-height'` converges in 2: the cable hole becomes round, because it is now vertical, and the two screw holes become teardrops.

## Bed edges

The first layer is pressed onto the bed and spreads a little, the **elephant's foot**, about 0.2 mm. A 45° chamfer of 0.4 to 0.6 mm on the edges that touch the bed takes it up and needs no support. A fillet there does the opposite: it starts horizontal, so its lowest band overhangs. On a 40 × 30 × 10 mm block, 2 mm fillets on the bed edges leave 204.7 mm² past 45° and 12 mm³ of support; 2 mm chamfers leave none. The desk presets add the chamfer explicitly:

```js
.chamfer(j.feat('body').startFace().edges(), mm(0.6), { id: 'foot' })
```

## Fit classes and calibration

Printed holes come out smaller than modelled and pins larger, by amounts that depend on the printer, the material and the slicer. jig sizes mating features from **fit classes**, a clearance per side, plus a hole compensation:

| class | gap per side | use |
|---|--:|---|
| press | 0.05 mm | magnets, dowels that must not move |
| snug | 0.10 mm | parts that hold by friction |
| slide | 0.20 mm | lids, pins that turn |
| free | 0.30 mm | loose screws |
| printInPlace | 0.40 mm | hinges printed assembled |

`j.fit.hole(mm(3), 'slide')` models 3 + 2 × 0.2 + 0.1 = 3.5 mm, which is also what `j.hole.clearance('M3', { fit: 'slide' })` drills. These defaults are starting points, and every fit-aware feature says so with the info `fit.uncalibrated` until you replace them. To calibrate, print [C-01](lab:preset/C-01) or `j.fit.coupon({ kind: 'pin-hole' })`: ten holes from 6.1 to 7.0 mm round a 6 mm pin, and ten loose pins. Measure the holes, note which pin fits how, and give the rows to `j.fit.calibrate`, which fits `actual = a · nominal + b` by least squares and reads a gap for each class from the first hole with that fit. Put the result in `j.fit.profile(name, { classes, holeComp })` and attach it with `.fit(profile)`. [Chapter 9](lab:book?ch=9) does this end to end. [C-04](lab:preset/C-04) finds the print-in-place gap, [C-05](lab:preset/C-05) how small your holes print, round and as teardrops, and [C-06](lab:preset/C-06) which wall thicknesses your slicer fills.

## Slicing and cusp height

`.slice({ layer })` cuts the oriented part into planar sections at the middle of each layer, measures each, and reports layers, filament, mass as printed and print time. Two numbers describe the result:

- The sum of section area × layer height approximates the volume. For a 40 mm dome it falls 258 mm³ (0.19 %) short at every layer height from 0.1 to 0.4 mm, because each section's circles are sampled as polygons within 0.05 mm; the layer height itself contributes under 2 mm³.
- The **cusp height**, the depth of the stair between two layers on a surface, is $c = t\,|\cos\theta|$ for layer height $t$ and a face whose normal makes angle $\theta$ with the build direction (Dolenc and Mäkelä, 1994). Vertical walls have none; shallow slopes have nearly a full layer. The dome's area-weighted mean is exactly $t/2$: 0.1 mm at 0.2 mm layers.

Halving the layer height halves the cusp and roughly doubles the print time: 69.7 min at 0.4 mm, 115.9 min at 0.2 mm and 208.5 min at 0.1 mm for the dome. Adaptive layers are not in this build; G-code is not either, so the slicer of your choice does the toolpaths.

## Exports

*Export ▾* or `j.export.*` gives STL, 3MF, STEP, an SVG preview and the IR bundle, each with a **report** of what it kept, approximated and dropped. Send a slicer **3MF**: it keeps millimetres, plates and part names. STL drops units, so a slicer has to assume millimetres. STEP is the exact B-rep for other CAD programs. The mesh exports measure their deviation from the true surface and report it; it is largest on small arcs.

## Checking a part

`.use(j.rules.fdm)` on a part runs the FDM rules after every compile: overhangs past 45°, bed fit, holes under 1.0 mm, walls under 0.9 mm, horizontal holes without teardrops, first layers under 100 mm². Each finding is a diagnostic with a fix. A thin-walled cup with a 0.6 mm wall and a 0.6 mm vent hole gets `print.thinWall` and `print.thinFeature`. The rules are checks of thresholds, not guarantees: a part that passes can still warp, and one that fails can still print on a well-tuned machine.
