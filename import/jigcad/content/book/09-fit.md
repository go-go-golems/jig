---
part: III · Printing
presets: C-01, C-04, D-04
docs: printing
---
# Fit and calibration

A modelled 3 mm hole prints at less than 3 mm, a 3 mm pin at more, and by how much depends on the printer, the filament, the slicer and the hole's orientation. No formula predicts it, so jig does not pretend one does. This chapter shows how jig sizes mating features from named clearance classes, how a printed coupon and a least-squares fit replace the default classes with measured ones, and how tolerance stacks and print-in-place assemblies use the same gaps. By the end you can calibrate a printer from one coupon and say whether a lid will fit before printing it.

## 9.1 Fit classes and modelled sizes

A **fit class** names an intended relation between a hole and what goes in it, and gives it a clearance **per side**:

| class | gap per side | for |
|---|--:|---|
| press | 0.05 mm | magnets, dowels that must not move |
| snug | 0.10 mm | parts held by friction |
| slide | 0.20 mm | pins that turn, lids that lift off |
| free | 0.30 mm | loose screws |
| printInPlace | 0.40 mm | joints printed assembled |

A fit-aware size is computed from the nominal size $d$, the class's gap $g$, and a **hole compensation** $c$ for the printer's tendency to close holes up:

$$
D = d + 2g + c, \qquad P = d - 2g + 2e ,
$$

where $D$ is the modelled hole, $P$ the modelled pin and $e$ the profile's XY compensation (`xyComp`). With the defaults ($c$ = 0.1 mm, $e$ = 0), `j.fit.hole(mm(3), 'slide')` is $3 + 0.4 + 0.1 = 3.5$ mm, and `j.fit.pin(mm(3), 'press')` is 2.9 mm. The hole library uses the same rule: `j.hole.clearance('M3', { fit: 'slide' })` drills 3.5 mm. On a hole that has become a teardrop ([Chapter 8](lab:book?ch=8)) the compensation is left out.

The defaults are common starting points for a 0.4 mm nozzle and no more. Every feature that uses them says so with the info diagnostic `fit.uncalibrated: using default fit classes and hole compensation; print j.fit.coupon() once to calibrate`, and every resolved class appears in Params as `gap.slide` and the like, with the source `default fit classes (uncalibrated)`.

```figure
// view: axo
return j.part('peg-board')
  .params({ pin: mm(3) })
  .extrude(j.region.rect(30, 20), mm(6), { id: 'body' })
  .hole([[-8, 0], [8, 0]], j.hole.simple(j.fit.hole('pin', 'slide'), mm(6)),
    { id: 'pins' })
  .hole([[0, 5]], j.hole.clearance('M3', { fit: 'slide' }), { id: 'screw' })
```

**Figure 9.1.** A 30 × 20 × 6 mm board with two holes for 3 mm pins and one for an M3 screw, all in the slide class: each is modelled at 3.5 mm. The compile carries `fit.uncalibrated` until a profile replaces the defaults.

```sketch
// title: Fit-aware holes
// Change 'slide' to 'press' or 'free' and read the modelled size in the IR.
return j.part('peg-board')
  .params({ pin: mm(3) })
  .extrude(j.region.rect(30, 20), mm(6), { id: 'body' })
  .hole([[-8, 0], [8, 0]], j.hole.simple(j.fit.hole('pin', 'slide'), mm(6)),
    { id: 'pins' })
  .hole([[0, 5]], j.hole.clearance('M3', { fit: 'slide' }), { id: 'screw' })
```

The battery holder of [D-04](lab:preset/D-04) sizes its pockets with `j.fit.hole('d', 'free')`: a free fit for each cell, so cells drop in and lift out.

## 9.2 A coupon measures the printer

Calibration starts with a print. `j.fit.coupon({ kind: 'pin-hole' })` is a part like any other: a 110 × 14 × 4 mm strip with ten holes, and beside it ten separate 6 mm pins 8 mm long. The holes are 6 mm plus twice a gap stepped from 0.05 to 0.5 mm per side, so modelled at 6.1, 6.2, …, 7.0 mm. Their compensation is off: the coupon measures the raw printer.

[C-01](lab:preset/C-01) is this coupon as a preset, with a proof block. Print it in the material and with the settings you will use, then measure each hole with calipers or a gauge pin, measure a pin, and try the pin in each hole, noting the fit: none, press, snug, slide or free.

```figure
// view: plan
return j.fit.coupon({ kind: 'pin-hole', range: [mm(0.05), mm(0.5)],
  steps: 10 })
```

**Figure 9.2.** The pin-hole coupon in plan: ten holes modelled at 6.1 to 7.0 mm in a 4 mm strip, and ten 6 mm test pins printed beside it. Eleven bodies in all, 7,071.53 mm³.

```sketch
// title: A fit coupon
// Narrow the range to [mm(0.1), mm(0.3)] with steps: 9 for finer classes.
return j.fit.coupon({ kind: 'pin-hole', range: [mm(0.05), mm(0.5)],
  steps: 10 })
```

## 9.3 Calibration is a least-squares fit

`j.fit.calibrate(rows)` turns measurements into a profile. For the holes it fits a straight line through the (modelled, measured) pairs by least squares,

$$
\text{measured} = a \cdot \text{modelled} + b ,
$$

with $a$ and $b$ the slope and intercept that minimise the sum of squared residuals, and reports $r^2$ and the residual standard deviation so you can judge whether a line describes your printer. For the classes it reads the gaps directly: for each fit, the first hole that gave it, as $(\text{measured hole} - \text{measured pin})/2$.

The rows below are an example written for this chapter, eight holes and one pin; they show the arithmetic, not a real printer.

```js
const rows = [{
  coupon: { kind: 'pin-hole', pin: 6 }, pin: 6.04,
  holes: [[6.1, 5.93], [6.2, 6.04], [6.3, 6.13], [6.4, 6.24],
    [6.5, 6.33], [6.6, 6.44], [6.7, 6.52], [6.8, 6.63]],
  outcomes: ['none', 'press', 'snug', 'snug', 'slide', 'slide',
    'free', 'free'],
}]
```

`j.fit.calibrate(rows)` returns $a = 0.9905$, $b = -0.1061$ mm, $r^2 = 0.99924$, a residual standard deviation of 0.0072 mm, a pin 0.04 mm oversize, and the classes press 0, snug 0.045, slide 0.145 and free 0.24 mm. By the line, a 6 mm hole prints 0.16 mm small, and the line explains all but 0.08 % of the variation.

To print a hole at a target size $D$ the model must ask for $(D - b)/a$, so the compensation is $(D - b)/a - D$. For a 3 mm pin in the slide class, $D = 3 + 2 \times 0.145 = 3.29$ mm and the compensation is $(3.29 + 0.1061)/0.9905 - 3.29 = 0.139$ mm. The profile below uses that value; a part whose holes span a range of sizes would use a function of $d$.

```figure
// view: axo
const rows = [{
  coupon: { kind: 'pin-hole', pin: 6 }, pin: 6.04,
  holes: [[6.1, 5.93], [6.2, 6.04], [6.3, 6.13], [6.4, 6.24],
    [6.5, 6.33], [6.6, 6.44], [6.7, 6.52], [6.8, 6.63]],
  outcomes: ['none', 'press', 'snug', 'snug', 'slide', 'slide',
    'free', 'free'],
}]
const cal = j.fit.calibrate(rows)
const profile = j.fit.profile('my-mk4-petg', {
  classes: cal.classes, holeComp: mm(0.139),
})
return j.part('peg-board')
  .params({ pin: mm(3) })
  .extrude(j.region.rect(30, 20), mm(6), { id: 'body' })
  .hole([[-8, 0], [8, 0]], j.hole.simple(j.fit.hole('pin', 'slide'), mm(6)),
    { id: 'pins' })
  .hole([[0, 5]], j.hole.clearance('M3', { fit: 'slide' }), { id: 'screw' })
  .fit(profile)
```

**Figure 9.3.** The board of Figure 9.1 with the calibrated profile attached by `.fit(profile)`: every slide hole is now modelled at 3 + 2 × 0.145 + 0.139 = 3.429 mm, the `gap.*` params come from `fit 'my-mk4-petg'`, and `fit.uncalibrated` is gone.

```sketch
// title: Calibration as code
// Replace the rows with your own coupon's measurements.
const rows = [{
  coupon: { kind: 'pin-hole', pin: 6 }, pin: 6.04,
  holes: [[6.1, 5.93], [6.2, 6.04], [6.3, 6.13], [6.4, 6.24],
    [6.5, 6.33], [6.6, 6.44], [6.7, 6.52], [6.8, 6.63]],
  outcomes: ['none', 'press', 'snug', 'snug', 'slide', 'slide',
    'free', 'free'],
}]
const cal = j.fit.calibrate(rows)
const profile = j.fit.profile('my-mk4-petg', {
  classes: cal.classes, holeComp: mm(0.139),
})
return j.part('peg-board')
  .params({ pin: mm(3) })
  .extrude(j.region.rect(30, 20), mm(6), { id: 'body' })
  .hole([[-8, 0], [8, 0]], j.hole.simple(j.fit.hole('pin', 'slide'), mm(6)),
    { id: 'pins' })
  .hole([[0, 5]], j.hole.clearance('M3', { fit: 'slide' }), { id: 'screw' })
  .fit(profile)
```

Fit is a calibrated metric, not a law. The spec keeps it out of the law suite on purpose: a measurement made on one spool on one day is evidence about that spool, and the profile records its name so the provenance of every gap is visible in the IR.

## 9.4 Tolerance stacks

A fit between two parts depends on several sizes at once. A lid whose lip drops into a box fits if the box's inside width exceeds the lip's outside width; the lip's outside width is its inside width plus two walls. Each size has a tolerance, and the gap is a sum of signed terms: a **tolerance stack**.

```js
const stack = j.stack('lid in box')
  .add(mm(56).pm(0.15))                 // box, inside width
  .add(mm(2).pm(0.1), { dir: -1 })      // lip wall, left
  .add(mm(2).pm(0.1), { dir: -1 })      // lip wall, right
  .add(mm(51.6).pm(0.15), { dir: -1 })  // lip, inside width
```

The nominal gap is 56 − 2 − 2 − 51.6 = 0.4 mm, 0.2 mm per side. Three analyses give three answers:

| analysis | gap | assumes |
|---|---|---|
| `worstCase()` | −0.1 to 0.9 mm | every size at its limit at once, in the worst direction |
| `rss()` | 0.145 to 0.655 mm | independent errors whose half-ranges are 3σ, combined as $\sqrt{\sum t_i^2}$ |
| `monteCarlo({ n: 20000, seed: 7 })` | mean 0.3994 mm, σ 0.0834 mm, 0.1 % to 99.9 % from 0.144 to 0.657 mm | each size normal and truncated at its limits |

Worst case says the lid can jam, by 0.1 mm. That needs all four sizes at their limits in the same direction at once; the Monte Carlo run drew 20,000 such stacks and the smallest gap among them was 0.074 mm, with no sample below zero. RSS and Monte Carlo agree because the four terms are independent and nearly normal. Every sample lies inside the worst-case interval, which is the stack law `stack.soundness` that the spec uses to check the sampler.

```figure
// view: axo
const lip = j.sketch('lip', { on: j.plane.offset(j.plane.XY, 't') })
  .rect('r', 'lip_w', 'lip_d', { center: true, r: 2 })
const inside = j.sketch('in', { on: j.plane.offset(j.plane.XY, 't + lip_h') })
  .rect('r', 'lip_w - 3.2 mm', 'lip_d - 3.2 mm', { center: true, r: 1 })
return j.part('lid')
  .params({ inner_w: mm(56), inner_d: mm(36), t: mm(2), lip_h: mm(4),
    wall: mm(2), gap: mm(0.2),
    lip_w: 'inner_w - 2 * gap', lip_d: 'inner_d - 2 * gap' })
  .extrude(j.region.rect('inner_w + 2 * wall', 'inner_d + 2 * wall',
    { r: 4 }), 't', { id: 'plate' })
  .extrude(lip.profiles(), 'lip_h', { id: 'lip' })
  .cut(inside.profiles(), 'lip_h', { id: 'hollow' })
```

**Figure 9.4.** A lid for a box 56 × 36 mm inside: a 2 mm plate and a 4 mm lip, 1.6 mm thick, whose outside is the box's inside less 0.2 mm per side, the slide class. In this build an expression cannot name `gap.slide` directly, so the lid states its gap as a param of the same value.

```sketch
// title: A lid with a slide fit
// Set gap to 0.1 mm (snug) and rerun the stack with a 55.8 mm lip.
const lip = j.sketch('lip', { on: j.plane.offset(j.plane.XY, 't') })
  .rect('r', 'lip_w', 'lip_d', { center: true, r: 2 })
const inside = j.sketch('in', { on: j.plane.offset(j.plane.XY, 't + lip_h') })
  .rect('r', 'lip_w - 3.2 mm', 'lip_d - 3.2 mm', { center: true, r: 1 })
return j.part('lid')
  .params({ inner_w: mm(56), inner_d: mm(36), t: mm(2), lip_h: mm(4),
    wall: mm(2), gap: mm(0.2),
    lip_w: 'inner_w - 2 * gap', lip_d: 'inner_d - 2 * gap' })
  .extrude(j.region.rect('inner_w + 2 * wall', 'inner_d + 2 * wall',
    { r: 4 }), 't', { id: 'plate' })
  .extrude(lip.profiles(), 'lip_h', { id: 'lip' })
  .cut(inside.profiles(), 'lip_h', { id: 'hollow' })
```

## 9.5 Print in place

A **print-in-place** assembly is printed already assembled: a hinge, a chain, a box with its lid. Its parts must be separate solids on the bed, so every pair that will move against each other needs a gap, and the gap must survive the printer's errors. The class for it is `printInPlace`, 0.4 mm per side by default, twice the slide class because the gap is printed, not assembled.

`j.assembly(…)` places parts by **joints** between named **ports**, frames that the parts carry. A revolute joint leaves one rotational degree of freedom. `.printInPlace(ids, { clearance, pose })` chooses the pose to print in and checks that the parts keep the clearance apart in it. The clamshell below is two 60 × 40 × 10 mm trays on a hinge axis along one long edge, printed open at 180°; the compiler records `h joint → revolute at 180.0° (print pose)` and `base–lid gap → 0.400 mm (minimum distance between components)`, and the assembly has 1 DOF.

```figure
// view: axo
const tray = (name, y) => j.part(name)
  .extrude(j.region.rect(60, 40), mm(10), { id: 'body' })
  .port('hinge', j.frame({ origin: j.pt(0, y, 10),
    x: j.dir('+Y'), z: j.dir('+X') }))
return j.assembly('clamshell')
  .add('base', tray('base', 20), { ground: true })
  .add('lid', tray('lid', 20.4))
  .joint('h', j.joint.revolute({ limits: [deg(0), deg(180)] }),
    'base:hinge', 'lid:hinge')
  .printInPlace(['base', 'lid'], { clearance: mm(0.4), pose: { h: deg(180) } })
```

**Figure 9.5.** A clamshell of two trays joined by a revolute joint and printed open: the lid is turned 180° about the hinge axis and lies 0.4 mm from the base, the measured minimum distance between the two bodies. One degree of freedom remains, the hinge.

```sketch
// title: A print-in-place pose
// Change the pose to deg(150) or the clearance to mm(0.2) and read the gap.
const tray = (name, y) => j.part(name)
  .extrude(j.region.rect(60, 40), mm(10), { id: 'body' })
  .port('hinge', j.frame({ origin: j.pt(0, y, 10),
    x: j.dir('+Y'), z: j.dir('+X') }))
return j.assembly('clamshell')
  .add('base', tray('base', 20), { ground: true })
  .add('lid', tray('lid', 20.4))
  .joint('h', j.joint.revolute({ limits: [deg(0), deg(180)] }),
    'base:hinge', 'lid:hinge')
  .printInPlace(['base', 'lid'], { clearance: mm(0.4), pose: { h: deg(180) } })
```

[C-04](lab:preset/C-04) measures the class directly: ten captive rotors with gaps from 0.15 to 0.60 mm, of which the first that turns freely gives your print-in-place clearance. The library builds on the same classes: `j.lib.hinge.pin({ knuckles: 5, clearance: 'printInPlace' })` bores its knuckles to the pin diameter plus twice the gap.

## 9.6 Key points

- A fit class is a clearance per side: press 0.05, snug 0.10, slide 0.20, free 0.30, print-in-place 0.40 mm by default.
- A fit-aware hole is $d + 2g + c$ and a pin $d - 2g + 2e$; an M3 slide clearance hole is 3.5 mm with the defaults.
- The defaults are flagged `fit.uncalibrated` until a measured profile replaces them.
- `j.fit.coupon` prints graded holes and pins; `j.fit.calibrate` fits measured = a · modelled + b by least squares and reads each class's gap from the first hole that gave it.
- A tolerance stack has three answers: worst case (every limit at once), RSS and Monte Carlo (independent errors); every Monte Carlo sample lies inside the worst-case interval.
- Print-in-place parts are separate bodies posed by joints; the compiler measures their minimum distance in the print pose.

## Exercises

> **Exercise.** With the calibrated profile of Figure 9.3, what does `j.hole.clearance('M3', { fit: 'free' })` model? Compute it, then compile and compare.

> **Exercise.** Tighten every tolerance in the lid stack to ±0.05 mm. What do worst case and RSS give now, and is a slide fit still needed?

> **Exercise.** Change the clamshell's lid offset from 20.4 to 20.2 mm with the clearance left at 0.4 mm. What does the gap decision report?

## Further reading

- [How jig thinks about printing](lab:doc?id=printing): the fit classes and calibration steps as a reference page.
- [The reference: fit](lab:reference): `j.fit.*` and `j.stack` signatures.
