---
part: III · Printing
partAbout: How a solid becomes layers of plastic, and how parts that must fit together are sized for the printer that makes them.
presets: D-01, D-02, C-02, C-03, C-05
docs: printing
---
# Printing as layers

A fused-filament printer does not make a solid; it makes a stack of flat layers, each a few tenths of a millimetre thick, each resting on the one below. This chapter treats printing as the mathematics of that stack: layers as level sets of the solid, the volume they carry, the stair-step error they leave on a slope, and the rules that follow from material needing something underneath. By the end you can predict how much a layer height changes a part's surface and print time, explain why the compiler chose a build direction, and design holes and bed edges that print without support.

## 8.1 Layers are level sets

Fix the **build direction**, the axis that points up on the printer, and call the height along it $z$. A layer of height $t$ is the slab $kt \le z < (k + 1)t$, and the printer draws it from one **section**: the intersection of the solid with the plane $z = (k + \tfrac{1}{2})t$, the layer's middle. Each section is a set of closed loops, an outer loop for each island of material and an inner loop for each hole, the level set of the height function at that $z$.

Summing section area times layer height over the layers approximates the volume:

$$
V \approx \sum_k A((k + \tfrac{1}{2})t)\,t .
$$

This is the midpoint rule for $V = \int A(z)\,dz$, Cavalieri's principle from [Chapter 4](lab:book?ch=4) applied one slab at a time, and its error is $O(t^2)$: for a section area with bounded second derivative it is at most $\tfrac{t^2}{24} \int |A''(z)|\,dz$.

The dome below is a hemisphere of radius $R = 40$ mm, $V = \tfrac{2}{3}\pi R^3 = 134{,}041.3$ mm³. Sliced at three layer heights:

| layer | layers | Σ area · t | difference | print time |
|--:|--:|--:|--:|--:|
| 0.4 mm | 100 | 133,784.3 mm³ | −256.95 mm³ | 69.7 min |
| 0.2 mm | 200 | 133,783.4 mm³ | −257.89 mm³ | 115.9 min |
| 0.1 mm | 400 | 133,783.1 mm³ | −258.23 mm³ | 208.5 min |

The difference does not shrink with $t$, so it is not the midpoint rule's error. For a hemisphere $A(z) = \pi(R^2 - z^2)$, $A'' = -2\pi$, and the rule's error is $\pi R t^2 / 12$: 0.42 mm³ at 0.2 mm, too small to see in the table except as the 1.3 mm³ drift between its first and last rows. The constant 258 mm³ comes from measuring each section as a polygon whose chords stay within $\delta = 0.05$ mm of the true circle. An inscribed polygon with sagitta $\delta$ loses about $\tfrac{2}{3}\delta$ of area per unit of perimeter, and integrating that over the dome gives

$$
\Delta V \approx \tfrac{2}{3}\,\delta \int_0^R 2\pi r(z)\,dz = \tfrac{4}{3}\pi\delta \cdot \tfrac{\pi R^2}{4} = \tfrac{\pi^2 \delta R^2}{3} = 263\ \mathrm{mm^3} .
$$

The slicer's volume is an approximation, and the compiler reports it as one: `fidelity: approx`.

```figure
// view: axo
const quarter = j.sketch('q', { on: j.plane.XZ })
  .arc('a', { center: [0, 0], start: [40, 0], end: [0, 40] })
  .line('l1', 'a.end', [0, 0]).line('l2', [0, 0], 'a.start')
const dome = j.part('dome').material(j.material('PLA'))
  .revolve(quarter.profiles(), j.axis.Z, turn(1), { id: 'dome' })
return j.print('dome', { printer: j.printer('mk4'), parts: [dome] })
  .orient('+Z').slice({ layer: mm(0.2) })
```

**Figure 8.1.** A hemisphere of radius 40 mm, sliced in 200 layers of 0.2 mm. The sum of section areas times 0.2 mm is 133,783.4 mm³, 258 mm³ short of $\tfrac{2}{3}\pi R^3$ because each section's circle is measured as a polygon within 0.05 mm.

```sketch
// title: Slice a dome
// Change layer to mm(0.1) or mm(0.3) and read layers, cusp and print time.
const quarter = j.sketch('q', { on: j.plane.XZ })
  .arc('a', { center: [0, 0], start: [40, 0], end: [0, 40] })
  .line('l1', 'a.end', [0, 0]).line('l2', [0, 0], 'a.start')
const dome = j.part('dome').material(j.material('PLA'))
  .revolve(quarter.profiles(), j.axis.Z, turn(1), { id: 'dome' })
return j.print('dome', { printer: j.printer('mk4'), parts: [dome] })
  .orient('+Z').slice({ layer: mm(0.2) })
```

## 8.2 Cusp height

Layers turn a slope into stairs. On a face whose normal makes angle $\theta$ with the build direction, the step between two layers rises $t$ and runs $t\tan\theta$; the **cusp height**, the greatest distance from the stair to the true surface measured along the normal, is

$$
c = t\,|\cos\theta| ,
$$

the formula of Dolenc and Mäkelä (1994). A vertical wall ($\theta = 90°$) has no cusp; a gentle slope, nearly a full layer. Faces exactly horizontal are excluded: their height is a layer boundary, and the printer draws them flat.

The compiler reports the largest cusp and the area-weighted mean. For the hemisphere the mean of $|\cos\theta|$ over the curved surface is exactly $\tfrac{1}{2}$, and at 0.2 mm the mean cusp is 0.1000 mm. For a cone whose side rises at 45°, here 80 mm across at the base and cut off 36 mm up with a flat top 8 mm across, every point of the side has $\theta = 45°$, so the cusp is uniform: $0.2 \cos 45° = 0.1414$ mm, which is both the mean and the maximum the compiler reports. The flat top is a layer boundary and adds nothing. Halving the layer height halves every cusp; from the table in 8.1 it multiplies the print time by 1.66 going from 0.4 to 0.2 mm and by 1.80 going from 0.2 to 0.1 mm.

```figure
// view: axo
const side = j.sketch('q', { on: j.plane.XZ })
  .polyline('p', [[0, 0], [40, 0], [4, 36], [0, 36]], { closed: true })
const cone = j.part('cone')
  .revolve(side.profiles(), j.axis.Z, turn(1), { id: 'c' })
return j.print('cone', { printer: j.printer('mk4'), parts: [cone] })
  .orient('+Z').slice({ layer: mm(0.2) })
```

**Figure 8.2.** A truncated cone 80 mm across and 36 mm tall: its side is 45° from vertical everywhere, so at 0.2 mm layers the cusp is $0.2\cos 45° = 0.1414$ mm at every point. Its 180 sections sum to 66,793.0 mm³ against a volume of 66,953.6 mm³.

```sketch
// title: A uniform cusp
// Make it taller ([4, 72], [0, 72]): θ nears 90° and the cusp shrinks.
const side = j.sketch('q', { on: j.plane.XZ })
  .polyline('p', [[0, 0], [40, 0], [4, 36], [0, 36]], { closed: true })
const cone = j.part('cone')
  .revolve(side.profiles(), j.axis.Z, turn(1), { id: 'c' })
return j.print('cone', { printer: j.printer('mk4'), parts: [cone] })
  .orient('+Z').slice({ layer: mm(0.2) })
```

The formula says where layer height matters: on surfaces facing nearly up or down. An adaptive slicer chooses $t$ per layer so that $c$ stays below a target; that needs only this formula and the faces' normals, and it is not in this build.

## 8.3 Overhangs and orientation

Each layer must rest on the one below. A face whose downward normal is more than about **45°** from vertical steps out more than half a line width per layer, and the outer line has nothing under it. This is a threshold that depends on the printer and the material, not a theorem, so jig keeps it in the printer profile (`maxOverhang: 45` for FDM, 30 for resin) and treats it as a calibrated number. [C-02](lab:preset/C-02) prints six ledges from 20° to 70° to find where your printer starts to droop, and [C-03](lab:preset/C-03) finds the longest flat bridge it lays. Faces past the limit are **overhangs**, and they need support: material printed under them and removed afterwards, at a cost in filament, time and surface.

Which faces overhang depends on the build direction, and choosing it is an optimisation over directions on the sphere. jig's default, `orient('auto')`, tries 26 candidates (the six faces, twelve edges and eight corners of a cube) and ranks them **lexicographically**: least support volume, then most bed contact, then least height. A later criterion only breaks ties in an earlier one, so no amount of bed contact buys a cubic millimetre of support. For the L-bracket below, a 60 × 30 × 5 mm base with a 60 × 5 × 40 mm upright, two M4 holes and an 8 mm cable hole:

| direction | support | bed contact | height | print time |
|---|--:|--:|--:|--:|
| +Z (auto) | 0 mm³ | 1,765 mm² | 45 mm | 54.9 min |
| −Z | 20,516 mm³ | 300 mm² | 45 mm | 73.9 min |
| +Y (`'min-height'`) | 0 mm³ | 2,650 mm² | 30 mm | 48.0 min |

Auto chose +Z, and its decision names the runner-up: `support 0 mm³ → bed contact 1765 mm² → height 45.0 mm (next: +Y, support 51 mm³)`. Upside down, 1,465 mm² of the base overhangs and the support estimate is 20,516 mm³, about as much as the part's own 20,558 mm³.

```figure
// view: axo
// overlays: dims,overhang,bed
const bracket = j.part('bracket').material(j.material('PETG'))
  .add(j.box(60, 30, 5), { id: 'base' })
  .add(j.box(60, 5, 40), { at: j.tx.move(0, 0, 5), id: 'upright' })
  .hole(j.sketch('hb', { on: j.plane.offset(j.plane.XY, mm(5)) })
    .point('p1', [15, 18]).point('p2', [45, 18]),
    j.hole.clearance('M4', { fit: 'free' }), { id: 'screws' })
  .hole(j.sketch('hc', { on: j.plane.XZ }).point('p', [30, 30]),
    j.hole.simple(mm(8), mm(5)), { id: 'cable' })
return j.print('bracket', { printer: j.printer('mk4'), parts: [bracket] })
```

**Figure 8.3.** The L-bracket in the orientation `auto` chose, +Z up: no face overhangs past 45°, so the overhang overlay hatches nothing. The cable hole through the upright is horizontal in this orientation and has become a teardrop.

```sketch
// title: Choose a build direction
// Add .orient('-Z') or .orient('min-height') and compare support and time.
const bracket = j.part('bracket').material(j.material('PETG'))
  .add(j.box(60, 30, 5), { id: 'base' })
  .add(j.box(60, 5, 40), { at: j.tx.move(0, 0, 5), id: 'upright' })
  .hole(j.sketch('hb', { on: j.plane.offset(j.plane.XY, mm(5)) })
    .point('p1', [15, 18]).point('p2', [45, 18]),
    j.hole.clearance('M4', { fit: 'free' }), { id: 'screws' })
  .hole(j.sketch('hc', { on: j.plane.XZ }).point('p', [30, 30]),
    j.hole.simple(mm(8), mm(5)), { id: 'cable' })
return j.print('bracket', { printer: j.printer('mk4'), parts: [bracket] })
```

## 8.4 Teardrops and a fixpoint

A round hole whose axis lies across the build direction has a ceiling that is flat at the top: the last layers of the arch overhang by nearly 90°. The standard fix is the **teardrop**: replace the top of the circle by two lines at 45° that meet in a point, so no part of the ceiling exceeds the overhang limit. jig applies it to every such hole and records it: `cable.p teardrop → teardrop (axis +Y ⟂ build direction +Z → 45° teardrop, tip toward +Z)`. The new faces are named `cable/tear.l[p]` and `cable/tear.r[p]`. [C-05](lab:preset/C-05) drills holes from 2 to 10 mm down through a plate and sideways through a wall, to compare round holes with teardrops on your printer. A teardrop already removes more material than the circle, and the clearance holes of [Chapter 9](lab:book?ch=9) leave out their hole compensation on teardrops.

This creates a loop. The holes' shapes depend on the build direction, and the build direction, chosen by support volume, depends on the holes' shapes. The compiler resolves it as a **fixpoint**: orient, re-shape the holes, orient again, until the direction and the persistent names stop changing, at most four rounds. For the bracket under `'min-height'` the loop runs twice. Turned to +Y, the cable hole is now vertical and becomes round again, and the two screw holes in the base, now horizontal, become teardrops pointing to +Y; the trace reads `fixpoint: converged in 2`.

```figure
// view: axo
// overlays: dims,overhang,bed
const bracket = j.part('bracket').material(j.material('PETG'))
  .add(j.box(60, 30, 5), { id: 'base' })
  .add(j.box(60, 5, 40), { at: j.tx.move(0, 0, 5), id: 'upright' })
  .hole(j.sketch('hb', { on: j.plane.offset(j.plane.XY, mm(5)) })
    .point('p1', [15, 18]).point('p2', [45, 18]),
    j.hole.clearance('M4', { fit: 'free' }), { id: 'screws' })
  .hole(j.sketch('hc', { on: j.plane.XZ }).point('p', [30, 30]),
    j.hole.simple(mm(8), mm(5)), { id: 'cable' })
return j.print('bracket', { printer: j.printer('mk4'), parts: [bracket] })
  .orient('min-height')
```

**Figure 8.4.** The same bracket under `orient('min-height')`: printed with +Y up, 30 mm tall. Its teardrops moved: the cable hole is round, and the two screw holes in the base are teardrops pointing along +Y. The compiler needed two rounds to agree with itself.

```sketch
// title: Teardrops follow the build direction
// Select the screw holes' faces: tear.l and tear.r appear only under +Y.
const bracket = j.part('bracket').material(j.material('PETG'))
  .add(j.box(60, 30, 5), { id: 'base' })
  .add(j.box(60, 5, 40), { at: j.tx.move(0, 0, 5), id: 'upright' })
  .hole(j.sketch('hb', { on: j.plane.offset(j.plane.XY, mm(5)) })
    .point('p1', [15, 18]).point('p2', [45, 18]),
    j.hole.clearance('M4', { fit: 'free' }), { id: 'screws' })
  .hole(j.sketch('hc', { on: j.plane.XZ }).point('p', [30, 30]),
    j.hole.simple(mm(8), mm(5)), { id: 'cable' })
return j.print('bracket', { printer: j.printer('mk4'), parts: [bracket] })
  .orient('min-height')
```

The same reasoning shapes openings in walls. The windows of the pen cup in [D-01](lab:preset/D-01) end in 45° points at top and bottom, so their ceilings print without support or a bridge.

## 8.5 Bed edges

The edges that touch the bed meet two problems at once. The first layer is pressed onto the bed and spreads by about 0.2 mm, the **elephant's foot**, and the edge above it is the one most likely to overhang. A 45° chamfer of 0.4 to 0.6 mm answers both: it takes up the spread, and at exactly 45° it never exceeds the overhang limit. A fillet does the opposite. It leaves the bed tangent to it, so its lowest band faces almost straight down.

On a 40 × 30 × 10 mm block, 2 mm fillets on the bed edges overhang over 204.7 mm², the four faces `foot/face[body/side[rect.…] ∩ body/start]`, and need an estimated 12 mm³ of support; 2 mm chamfers on the same edges overhang nowhere. The desk presets end with a chamfer for this reason:

```js
.chamfer(j.feat('body').startFace().edges(), mm(0.6), { id: 'foot' })
```

```figure
// view: front
// overlays: dims,overhang
const block = j.part('block')
  .extrude(j.region.rect(40, 30), mm(10), { id: 'body' })
  .fillet(j.feat('body').startFace().edges(), mm(2), { id: 'foot' })
return j.print('block', { printer: j.printer('mk4'), parts: [block] })
  .orient('+Z')
```

**Figure 8.5.** A 40 × 30 × 10 mm block with 2 mm fillets on its bed edges, front elevation, overhangs hatched: the fillets' lower halves face down by more than 45°, 204.7 mm² in all. Change the fillet to a chamfer and the hatching disappears.

```sketch
// title: Fillet or chamfer on the bed
// Change .fillet to .chamfer and read the overhang diagnostic go away.
const block = j.part('block')
  .extrude(j.region.rect(40, 30), mm(10), { id: 'body' })
  .fillet(j.feat('body').startFace().edges(), mm(2), { id: 'foot' })
return j.print('block', { printer: j.printer('mk4'), parts: [block] })
  .orient('+Z')
```

> **Try it.** [Load D-02](lab:preset/D-02), the business-card holder, and turn on *Overhang* under *Show ▾* in the stage: the back leans 15°, well inside 45°, and the only chamfer is the 0.5 mm foot.

## 8.6 Key points

- A layer is drawn from the solid's section at the layer's middle; the sections are level sets of height.
- Σ area × layer height is the midpoint rule for the volume, with error $O(t^2)$; in practice the section's polygon sampling dominates, 258 mm³ for a 40 mm dome.
- Cusp height is $c = t\,|\cos\theta|$ (Dolenc and Mäkelä): zero on vertical walls, nearly $t$ on shallow slopes, $t/2$ on average over a hemisphere.
- The 45° overhang limit is a calibrated threshold kept in the printer profile, not a law.
- `orient('auto')` ranks 26 directions lexicographically: support, then bed contact, then height.
- Horizontal holes become 45° teardrops; because orientation and teardrops depend on each other, the compiler iterates to a fixpoint.
- Bed edges take a 45° chamfer, not a fillet: the chamfer absorbs elephant's foot and never overhangs.

## Exercises

> **Exercise.** Using $c = t|\cos\theta|$, find the layer height that keeps the cusp of the dome's flattest printed band, the top 2 mm, under 0.05 mm. How many layers would the whole dome then need?

> **Exercise.** Give the bracket a fillet of 3 mm along the inside edge where the upright meets the base. Does the auto orientation change? Read the decision.

> **Exercise.** Write a function `orient: (part, ctx) => …` that returns `'+Y'` when the default's support volume is above 1,000 mm³ and the default otherwise, using `ctx.default(part)`.

## Further reading

- Dolenc and Mäkelä, *Slicing procedures for layered manufacturing techniques*, Computer-Aided Design 26(2), 1994: cusp height and adaptive layer thickness.
- [How jig thinks about printing](lab:doc?id=printing): the defaults of this chapter as a reference page.
