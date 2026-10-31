---
id: getting-started
title: The first ten minutes
group: Start here
about: Open a preset, read the drafting sheet, change a parameter, select a face and read its name, export a 3MF.
order: 1
---
# The first ten minutes

jigcad is a workbench for **jig**, a language for describing parts to be 3D printed. A part is a short JavaScript script; the workbench compiles it with OpenCascade, draws the result as a technical drawing, and shows every number the compile produced. This page walks through one preset from opening it to exporting a file for the slicer, in the order you would do it.

> **Try it.** Do each step as you read it: [open A-01](lab:preset/A-01), and keep the stage beside this page.

## Open a preset from the shelf

The button at the top left names the open preset, for example *A-01 A box with walls ▾*. It opens the **shelf**: every preset, by group, each with a thumbnail compiled when it scrolls into view, its difficulty and its size. Type to filter (`box`, `first print`, `D-0`), then click a row or press Enter.

A preset is a script, a page of notes and a few settings for the stage. Opening one loads all three and compiles the script. The shelf is grouped by letter: first prints (S), around the house (H), desk and storage (D), workshop and repair (W), mechanisms (M), calibration prints (C), the foundations of the language (A) and design process (E).

## Read the sheet and the pills

Two pills in the header summarise the compile. For A-01 the first reads `ok · 2 features · 0 DOF · 1 body`: the script compiled, it has two features (an extrude and a shell), its sketches leave no **degree of freedom** unfixed, and it made one solid. The second reads `15.3 cm³ · 19 g`: the volume, and the mass in the part's material, PLA at 1.24 g/cm³. Click the first pill to open the feature graph, or the code at the error when there is one.

The **stage** draws the part on a drafting sheet in orthographic projection, so one scale holds for every length parallel to the sheet, and the scale bar at the bottom left is valid anywhere on it. The buttons above it choose the view: *Axo* (axonometric), *Front*, *Side* and *Plan*. Drag to orbit, Shift-drag to pan, use the wheel to zoom, and *Square up* to return to the named view. The blue dimensions are the bounding box, 60 × 40 × 30 mm here. *Show ▾* turns overlays on and off: shadows, grid, names, dims, hidden edges, overhangs, the bed, normals and sketch DOF.

> **Try it.** [Look at it from the front](lab:view/stage?view=front). The front elevation shows the 30 mm height and the 60 mm width at full scale; the hatched band is the ground.

## Change a parameter

The **Params** view lists every parameter. The exposed ones come first as sliders with the labels the script gave them (*outside width*, *outside depth*, *height*, *wall thickness*); below them is every parameter with its value, its expression, the layer it came from and the parameters that depend on it. A change recompiles at once.

> **Try it.** [Make it 80 mm wide](lab:param/w=80). The pills change to 19.2 cm³ and 24 g. `inner_w`, defined as `w - 2 * wall`, follows to 76 mm without being touched.

Then [open the trace](lab:show/trace). It lists what the compile did and how long each step took. When only `wall` changes, the extrude is marked *cached*: measured in Node on the build machine, the first compile took 512 ms and a change of wall from 2 to 2.5 mm took 334 ms, because the extrude was reused and only the shell ran again. [Chapter 2](lab:book?ch=2) explains why that is safe.

To change something that is not a parameter, edit the script in the **Code** view and press *Run* (Ctrl+Enter). A script error puts a red pill in the header and a marker at the line; the stage keeps drawing the last part that compiled.

## Select a face and read its name

Click a face on the sheet. The **Selection** panel beside it shows the face's **persistent name**, its area and centre, and under *Why* the chain of features it came from.

> **Try it.** [Select the inside of the front wall](lab:select/shell/inner[body/side[base.outline.bottom]]).

Its name is `shell/inner[body/side[base.outline.bottom]]`. Read it from the inside out: `base.outline.bottom` is the bottom edge of the rectangle `outline` in the sketch `base`; `body/side[…]` is the side face the extrude `body` swept from that edge; `shell/inner[…]` is the inner face the shell offset from that side. The face's area is 2,072 mm² at 80 mm wide. Change the width again and the name stays the same, which is why a fillet or a hole that refers to it keeps working. The [naming doc](lab:doc?id=naming) explains how names are made, and [Chapter 6](lab:book?ch=6) why they survive edits.

With no face selected, the panel lists every face by name; click one to select it.

## Export a 3MF

*Export ▾* in the header offers five formats:

| item | gives | what the report says it drops or approximates |
|---|---|---|
| STL | a mesh of every body | units (assumed mm), names, colours, plates, settings; the mesh deviation |
| 3MF | a mesh with units, plates, part names and settings | parametric history, persistent names, joints; the mesh deviation |
| STEP | the exact B-rep (AP242) | persistent names, plates, slicer settings, fit provenance |
| IR bundle | L0 to L6 as text in one .json | nothing: it is the compiler's own record |
| Script | `script.js` with your edits | nothing |

Choose **3MF** for a slicer: it keeps millimetres, so the part cannot arrive 25.4 times too large, and it keeps the plates. For A-01 at 80 mm wide the file is `box.3mf`, 36,025 bytes, and its report says the mesh stays within 0.094 mm of the true surface; the 3 mm corner arcs are where it deviates most. Where the page cannot save files, 3MF is greyed out and the text formats (STL, STEP, IR, Script) are copied to the clipboard instead.

## Where next

- [The jig book](lab:book?ch=1) starts from quantities and units and builds up to printing and search.
- [How jig thinks about printing](lab:doc?id=printing): orientation, overhangs, teardrops, fit and slicing.
- [The reference](lab:reference) lists every `j.*` name with its status.
- [S-01 Cable clip for a desk edge](lab:preset/S-01) is the simplest part on the shelf: one sketch, one extrude.
