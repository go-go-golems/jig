---
part: II · Solids
partAbout: From profiles to solids, the algebra that combines them, the names their faces carry, and the symmetries that copy them.
presets: A-06, S-04
docs: reference
---
# Solids from profiles

Most printed parts are a profile moved through space: pushed straight up, turned about an axis, or carried along a curve. This chapter derives the volume of each kind of sweep from the profile alone, with two theorems older than calculus, and checks the kernel against them to many digits. The formulas matter for more than checking: a closed form for volume is a closed form for mass, which lets the compiler answer "how heavy at this height?" without building the solid ([Chapter 10](lab:book?ch=10)). By the end you can predict the volume of an extrude, a tapered extrude, a revolve and a helical sweep before compiling it.

## 4.1 Extrude: Cavalieri's principle

An **extrude** moves a planar profile along the normal of its plane by a distance $h$. Every section of the result parallel to the sketch plane is a copy of the profile, so by **Cavalieri's principle**, two solids whose sections at every height have equal areas have equal volumes, the volume is the profile's area times the height:

$$
V = A\,h .
$$

The shape of the profile does not enter, only its area, and an inner loop subtracts its area. The plate below is 80 × 50 mm with 4 mm corner radii and four holes of radius 1.7 mm, extruded 4 mm. Its profile's area is

$$
A = 80 \times 50 - 4(1 - \tfrac{\pi}{4})\,4^2 - 4\pi \cdot 1.7^2 = 4000 - 13.73 - 36.32 = 3949.95\ \mathrm{mm^2},
$$

the sketch reports 3,949.9487 mm², and the kernel's volume is 15,799.794686 mm³, which is 4 × 3,949.948671 to within $10^{-12}$ relative. The kernel computes its volume by integrating over the faces of the solid it built; the sketch computes its area from the curves. Two independent routes agree.

```figure
// view: axo
const outline = j.sketch('outline', { on: j.plane.XY })
  .rect('r', 80, 50, { center: true, r: 4 })
  .circle('h1', 1.7, { at: [32, 17] })
  .pattern(['h1'],
    j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y)))
return j.part('plate')
  .material(j.material('PETG'))
  .extrude(outline.profiles(), mm(4), { id: 'body' })
```

**Figure 4.1.** An 80 × 50 × 4 mm plate with four M3 clearance holes, from one sketch. The holes are inner loops of the one profile, so the extrude subtracts them: $V = 3949.95 \times 4 = 15{,}799.79$ mm³, 20.07 g in PETG.

```sketch
// title: Cavalieri: volume is area times height
// Change the radius of h1 or the 4 mm corners; the volume follows A·h.
const outline = j.sketch('outline', { on: j.plane.XY })
  .rect('r', 80, 50, { center: true, r: 4 })
  .circle('h1', 1.7, { at: [32, 17] })
  .pattern(['h1'],
    j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y)))
return j.part('plate')
  .material(j.material('PETG'))
  .extrude(outline.profiles(), mm(4), { id: 'body' })
```

The linearity in $h$ is the property the compiler uses: two compiles at different heights determine the mass at every height, $m(h) = \rho A h$, with no third compile ([Chapter 10](lab:book?ch=10)).

## 4.2 Tapered extrude: the frustum

An extrude with a **taper** offsets the profile inwards (negative angle) or outwards as it rises, so the faces lean by the taper angle. For a square of side $s_0$ and a taper of $-\alpha$ the side at height $z$ is $s(z) = s_0 - 2z\tan\alpha$, and the section areas grow quadratically. Integrating $A(z) = s(z)^2$ from 0 to $h$ gives the **frustum** formula, valid for any pair of similar sections:

$$
V = \frac{h}{3}(A_0 + A_1 + \sqrt{A_0 A_1}).
$$

A 30 mm square extruded 20 mm with a taper of −10° has a top side of $30 - 40\tan 10° = 22.947$ mm, so $A_1 = 526.56$ mm² and

$$
V = \frac{20}{3}\,(900 + 526.56 + 688.41) = 14{,}099.8\ \mathrm{mm^3}.
$$

The kernel gives 14,099.79 mm³. A bare number in the taper slot is degrees, so `taper: -10` and `taper: deg(-10)` compile to the same solid.

```figure
// view: front
const sq = j.sketch('sq', { on: j.plane.XY })
  .rect('r', 30, 30, { center: true })
return j.part('frustum')
  .extrude(sq.profiles(), mm(20), { taper: deg(-10), id: 'f' })
```

**Figure 4.2.** A 30 mm square extruded 20 mm with a −10° taper, front elevation: the sides lean in by 10°, the top is 22.95 mm across, and the volume is the frustum's, 14,099.8 mm³.

```sketch
// title: A tapered extrude and the frustum law
// Try taper: deg(10) (it widens), or a circle instead of the square.
const sq = j.sketch('sq', { on: j.plane.XY })
  .rect('r', 30, 30, { center: true })
return j.part('frustum')
  .extrude(sq.profiles(), mm(20), { taper: deg(-10), id: 'f' })
```

Taper is how a printed part gets a draft for easy removal from a mould, and how a peg gets a lead-in. Fit is the subject of [Chapter 9](lab:book?ch=9); here the point is that the volume is still a closed form in the profile.

## 4.3 Revolve: Pappus's theorem

A **revolve** turns a planar profile about an axis in its plane. **Pappus's centroid theorem** (Pappus–Guldinus) gives its volume: the profile's area times the distance its centroid travels,

$$
V = \theta\,r̄\,A ,
$$

where $r̄$ is the distance from the axis to the profile's centroid and $\theta$ the angle turned. The profile must stay on one side of the axis; a profile that crosses it would sweep some of its area twice.

A 4 × 10 mm rectangle centred 25 mm from the Z axis, turned a full turn, makes a ring of volume $2\pi \cdot 25 \cdot 40 = 6283.185307$ mm³; the kernel gives 6,283.185307 mm³, equal to the printed digits. A quarter turn gives a quarter, 1,570.80 mm³. In [A-06](lab:preset/A-06) a 3 × 8 mm section with its centroid 18 mm from Z is revolved onto the plate of Figure 4.1. The ring's volume is

$$
V = 2\pi \cdot 18 \cdot 24 = 2714.34\ \mathrm{mm^3} ,
$$

and the whole part is 15,799.79 + 2,714.34 = 18,514.13 mm³, which is the compiled volume. The ring sits on the plate's top face, touches it, and so joins it: the `op` decision reads `ring → join (touches body1)`.

```figure
// view: axo
const outline = j.sketch('outline', { on: j.plane.XY })
  .rect('r', 'w', 'd', { center: true, r: 4 })
  .circle('h1', 1.7, { at: [32, 17] })
  .pattern(['h1'],
    j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y)))
const section = j.sketch('sec', { on: j.plane.XZ })
  .rect('s', 'ring_t', 'ring_h', { at: ['ring_r - ring_t / 2', 't'] })
return j.part('plate')
  .params({ w: mm(80), d: mm(50), t: mm(4),
    ring_r: mm(18), ring_t: mm(3), ring_h: mm(8) })
  .material(j.material('PETG'))
  .extrude(outline.profiles(), 't', { id: 'body' })
  .revolve(section.profiles(), j.axis.Z, turn(1), { id: 'ring' })
```

**Figure 4.3.** The part of A-06: the plate of Figure 4.1 and a ring revolved from a 3 × 8 mm section whose centroid is 18 mm from the axis. Pappus gives the ring 2,714.34 mm³; the total, 18,514.13 mm³, is the sum because the ring only touches the plate.

```sketch
// title: Pappus: volume is area times the centroid's path
// Change ring_r: the ring's volume grows in proportion. Try turn(0.5).
const outline = j.sketch('outline', { on: j.plane.XY })
  .rect('r', 'w', 'd', { center: true, r: 4 })
  .circle('h1', 1.7, { at: [32, 17] })
  .pattern(['h1'],
    j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y)))
const section = j.sketch('sec', { on: j.plane.XZ })
  .rect('s', 'ring_t', 'ring_h', { at: ['ring_r - ring_t / 2', 't'] })
return j.part('plate')
  .params({ w: mm(80), d: mm(50), t: mm(4),
    ring_r: mm(18), ring_t: mm(3), ring_h: mm(8) })
  .material(j.material('PETG'))
  .extrude(outline.profiles(), 't', { id: 'body' })
  .revolve(section.profiles(), j.axis.Z, turn(1), { id: 'ring' })
```

> **Careful.** `j.plane.XZ` follows replicad's convention: its normal is −Y and its sketch y axis is world +Z. A section drawn on XZ at sketch coordinates (x, y) lies at world (x, 0, y), which is why `['ring_r - ring_t / 2', 't']` puts the ring's foot on the plate's top face.

## 4.4 Sweep: frames along a curve

A **sweep** carries a profile along a path. For a straight path it is an extrude; for a circle about an axis, a revolve. Along a general curve the profile needs a **frame** at every point of the path, an orientation to be carried in, and the choice is not obvious. The Frenet frame, built from the curve's tangent and curvature, is undefined where the curve is straight and flips where the curvature changes sign, which twists the swept solid. jig's default is a **rotation-minimising frame**, computed by the double-reflection method of Wang, Jüttler, Zheng and Liu (2008): each step reflects the previous frame twice so that it turns no more about the tangent than the curve forces it to.

For a volume, the frame decides only how the profile meets the path. A circle of radius 1 mm drawn on the XZ plane at (10, 0) and swept along a helix of radius 10 mm, pitch 4 mm and 3 turns makes a coil. The helix has length $L = 3\sqrt{(2\pi \cdot 10)^2 + 4^2} = 188.88$ mm, and if the profile were perpendicular to the path the volume would be $\pi \cdot 1^2 \cdot L = 593.38$ mm³. It is not perpendicular: the helix climbs at $\alpha = \arctan(4 / 20\pi) = 3.64°$, so the section normal to the path is the profile's area times $\cos\alpha$, and

$$
V = A\,L\cos\alpha = 593.38 \times 0.99798 = 592.18\ \mathrm{mm^3} .
$$

The kernel gives 592.18 mm³. The 0.2 % between the naive and the true value is the tilt of the profile, not an approximation error.

```figure
// view: axo
const wire = j.sketch('c', { on: j.plane.XZ }).circle('w', 1, { at: [10, 0] })
const path = j.sketch3d('path')
  .helix('h', { pitch: mm(4), turns: 3, r: mm(10) })
return j.part('coil').sweep(wire.profiles(), path, { id: 'wire' })
```

**Figure 4.4.** A 2 mm wire swept along a helix of radius 10 mm, pitch 4 mm, 3 turns, with a rotation-minimising frame. Its volume is $A\,L\cos\alpha$ = 592.18 mm³, because the profile on the XZ plane meets the helix at its climb angle of 3.64°.

```sketch
// title: A helical sweep
// Raise the pitch to 12 mm: the climb angle grows and cos α shrinks.
const wire = j.sketch('c', { on: j.plane.XZ }).circle('w', 1, { at: [10, 0] })
const path = j.sketch3d('path')
  .helix('h', { pitch: mm(4), turns: 3, r: mm(10) })
return j.part('coil').sweep(wire.profiles(), path, { id: 'wire' })
```

Printed threads are sweeps of this kind: `j.lib.thread('M8x1.25', …)` sweeps the ISO tooth profile along a helix with the same frame.

## 4.5 The closed forms as tests

The two theorems are not only explanations; the compiler runs them as **laws**, property tests over random inputs. `extrude.volume` draws random profiles and heights and checks $V = A h$; `revolve.volume` checks $V = \theta r̄ A$. Each law says what it pays for: the first justifies the closed form for mass that search uses, the second is a test of the kernel's revolve. Run in this build with `j.laws.check(j.laws.suite, { n: 8, seed: 1 })`, both pass on all eight samples, together with `brep.eulerPoincare`, `compile.deterministic` and `shape.boolean` from the next chapter. A kernel change that broke either theorem would fail here before it reached a part.

## 4.6 Key points

- An extrude's volume is its profile's area times its height (Cavalieri); inner loops subtract their area.
- A tapered extrude of similar sections has the frustum's volume, $\tfrac{h}{3}(A_0 + A_1 + \sqrt{A_0 A_1})$.
- A revolve's volume is the profile's area times the length of its centroid's path, $\thetar̄ A$ (Pappus–Guldinus).
- A sweep needs a frame along its path; jig's default is the rotation-minimising frame of Wang et al., which neither flips nor twists.
- A swept profile that meets its path at an angle $\alpha$ contributes $A\cos\alpha$ per unit length.
- The kernel's volumes match these closed forms to within $10^{-12}$ relative for the extrude and to the printed digits for the revolve, and the compiler checks them as laws.

## Exercises

> **Exercise.** Predict the volume of a 20 × 20 mm square revolved a half turn about an axis 30 mm from its nearest side. Compile it with a revolve and compare.

> **Exercise.** Make the coil's profile perpendicular to the path by drawing it on a plane through (10, 0, 0) normal to the helix's starting tangent (`j.plane.angle(j.plane.XZ, j.axis.X, …)`). What volume do you expect, and what does the kernel give?

> **Exercise.** [S-04](lab:preset/S-04) is three extrudes that join because they overlap by 1 mm. Compute the volume of each extrude from its sketch, add them, and explain the difference from the compiled volume.

## Further reading

- Wang, Jüttler, Zheng and Liu, *Computation of rotation minimizing frames*, ACM Transactions on Graphics 27(1), 2008: the double-reflection method used for sweeps and threads.
- [The reference](lab:reference): the extrude extents (`symmetric`, `two`, `through`, `to`) and sweep frames.
