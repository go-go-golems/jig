# A box with walls

A 60 × 40 × 30 mm box with 2 mm walls and an open top, made by one sketch, one extrude and one shell. It is the smallest part that puts every view of the workbench to work: the code that makes it, the feature graph, the persistent names of its faces, and what a change to one parameter computes again.

> **Try it.** [Look at it from the front](lab:view/stage?view=front), then [select the inside of the front wall](lab:select/shell/inner[body/side[base.outline.bottom]]) and read its genealogy in the inspector. Then [make it 80 mm wide](lab:param/w=80) and [open the trace](lab:show/trace).

## What is on the screen

The **stage** draws the part as a technical drawing: orthographic projection, so every length parallel to the sheet has one scale and the scale bar is valid anywhere on it. Click a face to select it. The inspector beside the sheet shows its persistent name, its area and the chain of features it came from.

The header's pills say what the compile produced: `ok`, the number of features, the sketch DOF left free and the number of bodies, then the volume and the mass in PLA.

## Three features

`base` is a sketch on the XY plane: a centred rectangle `w` by `d` with corners of radius `r`. `body` extrudes its profile by `h`. `shell` removes the end face of `body` and offsets every other face inwards by `wall`:

```js
.shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
```

The [graph](lab:show/graph) draws the same chain: the params feed the sketch, the sketch feeds the extrude, the extrude feeds the shell.

## Names that survive edits

A face is named by the feature that made it and the thing it came from. `body/side[base.outline.bottom]` is the side of the extrude that came from the bottom edge of the rectangle `outline` in the sketch `base`; `shell/inner[body/side[base.outline.bottom]]` is the inner face the shell offset from it, and `body/end` is what is left of the top face: the rim. Change `w` and the names stay the same, which is why a fillet or a hole that refers to them keeps working.

> **Exercise.** Add a 3 mm fillet to the four vertical outside edges: `.fillet(j.sel.edges('|Z').of('body'), mm(3), { id: 'round' })` after the extrude. Press Run and look for `round` in the graph and in the names of the new faces.
