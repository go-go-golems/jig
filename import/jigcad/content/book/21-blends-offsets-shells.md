---
part: VI · Inside the kernel
presets: M-09, A-01
docs: reference, printing
---
# Blends, offsets and shells

A fillet, a chamfer, a shell and a draft change a solid that already exists: they replace its sharp edges by new faces, hollow it out to a wall, or tilt its sides. All four are built from one idea, the **offset**, a surface moved a fixed distance along its normal, and all four fail in the same way, when the offset distance exceeds a radius of curvature somewhere on the part. This chapter derives the volume a blend adds or removes in closed form and checks the kernel against it to nine digits, explains how jig orders blends and how it searches for the largest radius that works, and shows where offsets break. By the end you can predict the volume of a fillet, chamfer, shell or draft before compiling it, say why a fillet is too large and how large it may be, and decide where a printed part needs a root fillet.

## 21.1 The rolling ball

A **blend** is a face that replaces an edge and joins the two faces that met there. The common kind is the **rolling-ball fillet** of radius $r$: roll a ball of radius $r$ along the edge, touching both faces. The path of its centre is the **spine**, and the fillet face is the **envelope** of the ball, the surface it sweeps, trimmed to the arc between the two lines where it touches the faces. Those lines, the **contact curves** or **rails**, become the edges of the fillet.

The spine has a simple description: every point at distance $r$ from both faces lies on both faces' offset surfaces by $r$, so the spine is the intersection curve of the two offsets. The envelope of a ball of constant radius moving along a curve is a **pipe surface** (a canal surface of constant radius), and its kind follows from the spine:

| edge between | spine | fillet surface |
|---|---|---|
| two planes, straight edge | a line | cylinder of radius $r$ |
| a plane and a cylinder, circular edge | a circle about the axis | torus, minor radius $r$ |
| three equal convex fillets at a corner | a point | sphere of radius $r$ |
| anything else | a space curve | pipe surface, stored as a B-spline |

OpenCascade recognises the analytic cases and stores the exact surface. jig calls `BRepFilletAPI_MakeFillet` with the rational shape option, so the general case comes back as a rational B-spline approximation of the pipe (Chapter 18 treats B-splines).

Which side the ball rolls on depends on the edge. jig classifies an edge by the dihedral angle between its faces. An edge is **convex** when the material angle across it is less than 180°: a box's edges, the rim of a peg's top. The ball rolls inside the material and the fillet removes the corner. An edge is **concave** when the material angle exceeds 180°: the line where a peg stands on a plate. The ball rolls in the air and the fillet fills the corner, adding material. An edge between tangent faces, such as a cylinder's seam, is **smooth** and takes no fillet. The selector predicates `e.convex`, `e.concave` and `e.smooth` expose this classification.

```figure
// view: axo
// zoom: 1.6
// select: root/face[peg/side[circle] ∩ plate/end]
return j.part('b')
  .extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10),
    { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })
```

**Figure 21.1.** A Ø5 mm peg 10 mm tall on a 30 × 30 × 3 mm plate, with a 1 mm fillet on its root, the only concave edge of the peg. The selected face is a torus of major radius 3.5 mm and minor radius 1 mm, named `root/face[peg/side[circle] ∩ plate/end]` after the two faces it blends.

## 21.2 Fillet volumes by Pappus

The cross-section of a fillet, taken in a plane normal to the edge, is the same everywhere along a straight or circular edge: the **spandrel** between the two faces and the quarter circle, a square of side $r$ minus a quarter disc. Its area is

$$
A = r^2 - \tfrac{\pi}{4} r^2 = r^2(1 - \tfrac{\pi}{4}) .
$$

Its centroid lies on the diagonal through the corner. Put the corner at the origin with the faces along the axes; the square has its centroid at $r/2$ and the quarter disc, centred at $(r, r)$, has its centroid $\tfrac{4r}{3\pi}$ from its centre towards the corner, at $r - \tfrac{4r}{3\pi}$. Subtracting moments,

$$
c̄ = \frac{r^2 \cdot \tfrac{r}{2} - \tfrac{\pi r^2}{4}(r - \tfrac{4r}{3\pi})}{r^2(1 - \tfrac{\pi}{4})} = r\,\frac{10 - 3\pi}{12 - 3\pi} = 0.22337\,r
$$

from each face. Along a straight edge of length $L$ the fillet's volume is $A L$ by Cavalieri ([Chapter 4](lab:book?ch=4)). Around a circular edge it is a solid of revolution, and Pappus gives it: the spandrel at the root of a peg of radius $R$ has its centroid at $R + c̄$ from the axis, so the fillet adds

$$
\Delta V = 2\pi (R + c̄)\,r^2(1 - \tfrac{\pi}{4}) .
$$

For the peg of Figure 21.1, $R = 2.5$ mm and $r = 1$ mm: $A = 0.214602$ mm², $c̄ = 0.223368$ mm, and $\Delta V = 2\pi \cdot 2.723368 \cdot 0.214602 = 3.672143$ mm³. The kernel measures 2,896.349541 mm³ without the fillet and 2,900.021684 mm³ with it, a difference of 3.672143322 mm³, equal to the closed form in all ten digits, and the same holds at every radius the peg accepts:

| $r$ | Pappus | kernel |
|--:|--:|--:|
| 0.5 mm | 0.880388 mm³ | 0.880388 mm³ |
| 1 mm | 3.672143 mm³ | 3.672143 mm³ |
| 2 mm | 15.893316 mm³ | 15.893316 mm³ |
| 3 mm | 38.470630 mm³ | 38.470630 mm³ |
| 9.9 mm | 622.627614 mm³ | 622.627614 mm³ |

A convex fillet removes the same spandrel on the other side of the edge. On the peg's top rim the centroid is at $R - c̄$, so a 1 mm fillet there removes $2\pi \cdot 2.276632 \cdot 0.214602 = 3.069772$ mm³; the kernel removes 3.069772 mm³.

When fillets meet at corners the cross-section argument stops, but for a box whose twelve edges all take the same radius a closed form survives. Such a box is the **Minkowski sum** of a smaller box and a ball of radius $r$: every point within $r$ of the inner box of sides $a = 40 - 2r$, $b = 30 - 2r$, $c = 20 - 2r$. Its volume is given by **Steiner's formula**, a cubic polynomial in $r$ whose terms are the inner box, its six faces pushed out by $r$, its twelve edges grown into quarter cylinders, and its eight corners grown into eighths of a ball:

$$
V = abc + 2r(ab + bc + ca) + \pi r^2(a + b + c) + \tfrac{4}{3}\pi r^3 .
$$

At $r = 3$ mm this is 23,340.849375 mm³, and the kernel gives 23,340.849375 mm³. Its faces are 6 planes, 12 cylinders and 8 spheres, the table's third row: where three equal convex fillets meet, the ball touches all three faces at once and the corner patch is a piece of the ball itself.

```figure
// view: axo
return j.part('rounded')
  .extrude(j.region.rect(40, 30), mm(20), { id: 'box' })
  .fillet(j.feat('box').edges(), mm(3), { id: 'round' })
```

**Figure 21.2.** A 40 × 30 × 20 mm box with every edge filleted at 3 mm: 6 planes, 12 cylinders and 8 sphere octants. Its volume, 23,340.849375 mm³, is Steiner's formula for a 34 × 24 × 14 mm box grown by a 3 mm ball.

```sketch
// title: Pappus for a root fillet
// Change the radius; ΔV = 2π(2.5 + 0.22337 r) · 0.2146 r² mm³.
return j.part('b')
  .extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10),
    { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })
```

## 21.3 Chamfers

A **chamfer** replaces an edge by a ruled face cut at two distances from it. An equal-distance chamfer of a straight edge between planes is a plane; around a circular edge it is a cone, and the kernel reports the peg's tip chamfer as `tip/face[peg/side[circle] ∩ peg/end]` of kind cone. The cross-section is a right triangle of legs $d$, area $d^2/2$, centroid $d/3$ from each face, so Pappus again gives the volume. A 0.5 mm chamfer on the peg's top removes $2\pi(2.5 - \tfrac{0.5}{3}) \cdot 0.125 = 1.832596$ mm³, and a 1 mm chamfer at its root adds $2\pi(2.5 + \tfrac{1}{3}) \cdot 0.5 = 8.901179$ mm³; the kernel agrees in all six decimals for both. A chamfer of leg $d$ moves 0.5 $d^2$ of section where a fillet of radius $d$ moves 0.2146 $d^2$, so for the same footprint it adds or removes 2.33 times as much material.

With `d2` or `angle` a chamfer is asymmetric, `d` measured on the edge's first face in name order, so a loop of edges is cut consistently. [Chapter 8](lab:book?ch=8) explains why the edges on the bed take a 45° chamfer rather than a fillet.

## 21.4 Order: concave first

When one fillet feature selects both convex and concave edges, jig sorts the concave ones first and records a `fillet.order` decision: "concave first: the root blend adds material, so the rim keeps a full face to roll on". All the edges then go to one OpenCascade fillet builder, which computes them together; on every example tried for this chapter, the order inside a call changed nothing.

Between features, order matters. Take a 10 × 10 × 5 mm boss on the plate, with a 2 mm fillet on its eight convex edges (the rim) and a 1 mm fillet on its four concave root edges:

| construction | volume |
|---|--:|
| one feature, both kinds of edge | 3,162.000892 mm³ |
| rim first, then root | 3,162.000892 mm³ |
| root first, then rim | 3,164.101653 mm³ |

The one-feature result is the one with a closed form. With the rim rounded first, the boss's footprint is a square with 2 mm corners, and sections give the boss $(100 - (4 - \pi) \cdot 4) \cdot 3 + 36 \cdot 2 + 2 \cdot 12 \cdot \pi + \tfrac{2}{3}\pi \cdot 8 = 453.852496$ mm³ (straight sides up to $z = 3$ mm above the plate, then a rounded top whose sections shrink as $\sqrt{4 - s^2}$). The root fillet runs along four 6 mm straight sides, $4 \cdot 6 \cdot 0.214602 = 5.150444$ mm³, and around four quarter tori about the vertical fillets' axes, $2\pi(2 + 0.223368) \cdot 0.214602 = 2.997952$ mm³. With the 2,700 mm³ plate the total is 3,162.000892 mm³. Filleting the root first rounds a square with sharp corners, and the rim's vertical fillets then have to finish on the root fillet: a different surface, 2.1 mm³ heavier.

With a 4 mm rim and a 2 mm root, only one order works. Root first gives 3,086.555675 mm³. Rim first leaves 1 mm of flat side under the top fillet, and the root fillet, needing 2 mm, climbs into the vertical fillets; the compiler refuses it with `fillet.tooLarge: r = 2 mm is too large for 4 edges of body1: its rim runs into rim/face[boss/side[rect.bottom] ∩ boss/side[rect.left]], …, which OpenCascade then drops; the largest that works is about 0.984 mm`. That check, that no face away from the blended edges is deleted, is the case study of Chapter 20. Asking for both in one feature fails too, and its search reports 2.469 mm because it tries one common radius for all twelve edges.

```figure
// view: axo
// zoom: 1.4
return j.part('b')
  .extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.rect(10, 10).on(j.plane.offset(j.plane.XY, 3)), mm(5),
    { id: 'boss' })
  .fillet(j.feat('boss').edges().where(e => !e.smooth),
    e => e.concave ? mm(1) : mm(2), { id: 'all' })
```

**Figure 21.3.** A 10 × 10 × 5 mm boss with a 2 mm rim and a 1 mm root fillet in one feature: the radius slot is a function of the edge, and the decision lists the four concave edges first. Volume 3,162.000892 mm³, the same as rim first, then root.

## 21.5 The largest radius that works

A fillet has no valid result when its radius is too large, for one of three reasons: the fillets on two edges meet and the face between them vanishes; a rail reaches the far boundary of a face it rolls on; or a rail runs into another feature. A 50 × 30 × 4 mm plate's vertical edges ([Chapter 5](lab:book?ch=5)) fail the first way at 15 mm, half the short side. The peg fails the second way at 10 mm, its height. The hub of Chapter 20's case study fails the third way at 1 mm, where the rail on the disc touches the crank.

jig does not compute these limits geometrically. When OpenCascade fails or the blend check refuses a result, it treats feasibility as a yes-or-no test and bisects on $[0, r]$ seven times, keeping the largest radius that succeeded. For the plate and a request of 20 mm:

| step | try | result |
|--:|--:|---|
| 1 | 10 mm | works |
| 2 | 15 mm | fails |
| 3 | 12.5 mm | works |
| 4 | 13.75 mm | works |
| 5 | 14.375 mm | works |
| 6 | 14.6875 mm | works |
| 7 | 14.84375 mm | works |

and the diagnostic reads `the largest that works is about 14.844 mm`, with the fix `r ≤ 14.84 mm`. The limit is 15 mm exactly: 14.999 mm works and 15 mm fails. Seven halvings leave an interval of $r/2^7$, here 0.156 mm, so the answer depends on what was asked: for the peg, a request of 10 mm reports 9.922 mm, 12 mm reports 9.938 mm, and 20 mm reports 9.844 mm. Reaching a fixed tolerance $\tau$ would take $⌈\log_2(r/\tau)⌉$ trials, 12 for 20 mm to within 0.005 mm. Each trial is a full fillet build; the peg's whole compile, search included, takes 0.26 to 0.35 s. The search also assumes that every radius below a working one works, and nothing guarantees it: the hub's fillet works at 0.98 mm and at 1.02 mm and fails at exactly 1 mm, where its rail lies on the crank's edge. jig reports that case as `fillet.tangent`, naming the crank's faces and the two radii that work.

```sketch
// title: How large may the root fillet be?
// expect: fillet.tooLarge
// The peg is 10 mm tall. Ask for 12 mm, read the limit, then use it.
return j.part('b')
  .extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10),
    { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(12), { id: 'root' })
```

## 21.6 Offsets and the curvature limit

The **offset** of a surface $S$ by a distance $d$ is the set of points $p + d\,n(p)$ for $p$ on $S$, with $n$ the unit normal. The offset of a plane is a parallel plane, of a cylinder of radius $R$ a coaxial cylinder of radius $R + d$. A fillet is an offset construction, and so is a shell.

At each point a surface bends by its two **principal curvatures** $\kappa_1$ and $\kappa_2$, the largest and smallest curvature of the curves cut by planes through the normal, and their inverses are the principal radii $\rho = 1/\kappa$. Offsetting towards the centre of curvature shrinks a radius to $\rho - d$. When $d$ reaches $\rho$, the offset collapses to the centre of curvature (a **focal point**), and beyond it the offset folds over and intersects itself, the **swallowtail** familiar from offset curves. So inward offsets are limited by the smallest radius of curvature of the convex regions, and outward offsets by that of the concave ones:

$$
d < \rho_{min} .
$$

A kernel offsets the faces one by one and then repairs where they meet. Two adjacent faces' offsets either overlap, which is trimmed by intersection, or leave a gap, which must be filled. jig's shell asks OpenCascade to fill gaps with arcs (the `GeomAbs_Arc` join), so a convex edge offset outwards becomes a cylinder of radius $d$ and a convex corner a sphere. An outward offset of a convex solid with arc joins is its Minkowski sum with a ball, and Steiner's formula of Section 21.2 gives its volume.

## 21.7 Shells

A **shell** removes the open faces and offsets the rest by the wall thickness $t$, inwards by default; the offset faces bound the cavity. Take a tray 60 × 40 × 30 mm with 5 mm vertical corner radii, open at the top, with 2 mm walls. Inwards, each wall moves 2 mm and each corner cylinder shrinks from 5 to 3 mm, so the cavity is a 56 × 36 mm rounded rectangle with 3 mm corners, 28 mm deep:

$$
V = (2400 - (4 - \pi) \cdot 25) \cdot 30 - (2016 - (4 - \pi) \cdot 9) \cdot 28 = 71{,}356.194490 - 56{,}231.681349 = 15{,}124.513141\ \mathrm{mm^3} ,
$$

and the kernel gives 15,124.513141 mm³. With sharp corners it gives 72,000 − 56 · 36 · 28 = 15,552 mm³ exactly. Outwards (`direction: 'out'`), the sharp box's walls move out 2 mm and its edges and bottom corners grow arcs: the outer surface is the box's Minkowski sum with a 2 mm ball, cut flat at the rim. Steiner's formula less the slab above the rim, $abt + (a + b)\tfrac{\pi t^2}{2} + \tfrac{2}{3}\pi t^3$, less the box itself gives 17,822.064810 mm³, and so does the kernel.

Now give the tray 1 mm corners and keep the 2 mm wall. The inward offset of each corner would need radius $1 - 2 = -1$ mm, past the focal line, and the compiler reports `feature.failed: shell of body1 by 2 mm failed: shell failed`, with the fix `reduce the thickness or remove small fillets first`. The fix is the curvature limit read backwards: a corner radius of at least the wall thickness, or a thinner wall. A shell so thick that opposite walls cross, 25 mm in a 40 mm block, is `brep.invalid` ([Chapter 5](lab:book?ch=5)).

```figure
// view: axo
return j.part('tray')
  .extrude(j.region.rect(60, 40, { r: 5 }), mm(30), { id: 'body' })
  .shell(j.feat('body').endFace(), mm(2), { id: 'shell' })
```

**Figure 21.4.** A 60 × 40 × 30 mm tray with 5 mm corners shelled to a 2 mm wall, open at the top. The cavity's corners have radius 3 mm, the offset of 5 mm by 2 mm, and the volume is 15,124.513141 mm³.

```sketch
// title: A wall thicker than the corner radius
// expect: feature.failed
// The corners are 1 mm and the wall 2 mm. Try r: 2, or a 1 mm wall.
return j.part('tray')
  .extrude(j.region.rect(60, 40, { r: 1 }), mm(30), { id: 'body' })
  .shell(j.feat('body').endFace(), mm(2), { id: 'shell' })
```

> **Try it.** [Load A-01](lab:preset/A-01), the shelled box with 3 mm corners, and [set wall to 2.9 mm](lab:param/wall=2.9): the shell works, and its inner corners have a radius of 0.1 mm. [Set it to 3 mm](lab:param/wall=3): the corner's offset collapses to a line and the shell fails, as it does for every thicker wall.

## 21.8 Draft

A **draft** tilts faces by an angle about a **neutral plane** that stays fixed, so a part slides out of a mould along the **pull direction** (`pull`, default +Z; the neutral plane defaults to the body's lowest plane along it). A 20 × 20 × 10 mm block with its four sides drafted 5° becomes a frustum whose top side is $20 - 2 \cdot 10 \tan 5° = 18.250227$ mm, so

$$
V = \frac{10}{3}(400 + 333.070776 + 365.004535) = 3660.251034\ \mathrm{mm^3} ,
$$

the kernel's value to six decimals. Drafting a cylinder of radius 10 mm by 5° makes a cone with a top radius of 9.125113 mm and the frustum volume $\tfrac{\pi h}{3}(R_0^2 + R_0 R_1 + R_1^2) = 2874.754440$ mm³, again equal to the kernel. A draft differs from an extrude's taper ([Chapter 4](lab:book?ch=4)) in when it acts: the taper is part of the extrude, while the draft tilts faces that other features have already cut, holes and pockets included. A printed part leaves no mould, so draft matters mostly for printed patterns that moulds are cast from.

## 21.9 Why a peg needs a root fillet

Under load, stress gathers at a sharp inside corner. The **stress concentration factor** $K_t$ is the peak stress divided by the nominal stress the section would carry without the notch. Inglis's solution for an elliptical hole of half-length $a$ across the load, whose tip has radius of curvature $\rho$, gives $K_t = 1 + 2\sqrt{a/\rho}$: 3 for a circle, 7.3 when $\rho = a/10$, and without bound as $\rho \to 0$. A sharp inside corner is the limit $\rho = 0$, where linear elasticity predicts infinite stress and real materials yield or crack. For a shoulder, the published charts (Peterson's) give $K_t$ against $r/d$, the fillet radius over the smaller diameter; it falls steeply as $r/d$ grows from zero and slowly beyond about 0.1. A printed peg is worse off than a machined one: standing upright, its root lies on a layer boundary, and the bond between layers is the weak direction under bending. A 1 mm root fillet spreads the change in section over five 0.2 mm layers and gives the peak stress a 1 mm radius instead of none. It costs 3.67 mm³ and no support: a concave root fillet faces up, and the filleted peg's overhang area is 0 mm². jig computes no stresses; the fillet is a design rule, not an analysis.

The rack and pinion of [M-09](lab:preset/M-09) follows the rule. Its base's peg has a 1 mm root fillet, `peg-root`, and the pinion that turns on the peg has a 1.2 mm lead-in chamfer on its bore. The fillet climbs 1 mm up the peg into the space the bore occupies: at the height of the pinion's underside, 0.2 mm above the plate, the torus has radius $3.5 - \sqrt{1 - 0.8^2} = 2.9$ mm, wider than the 2.85 mm bore. The chamfer makes room, and the interference check reports a gap of 0.200 mm between base and pinion; without the chamfer it reports `base and pinion touch or overlap`. [Chapter 22](lab:book?ch=22) explains why that check needed fixing before it could see this overlap.

> **Try it.** [Load M-09](lab:preset/M-09) and [find peg-root in the graph](lab:node/peg-root). Delete the `lead-in` chamfer from the pinion and run: the interference check fails between base and pinion.

## 21.10 What jig does and does not do

jig makes constant-radius rolling-ball fillets with OpenCascade, one radius per edge (a number, or a function of the edge), concave edges sorted first; equal, two-distance and distance–angle chamfers; shells inwards or outwards with arc joins; drafts about a neutral plane; and, when a fillet fails, a bisection for the largest radius that works, plus a check that no face away from the blended edges disappears. It does not offer variable-radius fillets, curvature-continuous (G2) blends, control of the corner patch where several fillets meet (setbacks), blends between faces that do not share an edge, or a geometric limit computed from the spine and the faces' boundaries.

## 21.11 Key points

- A rolling-ball fillet is the envelope of a ball whose centre runs along the intersection of the two faces' offsets: a cylinder along a straight edge, a torus around a circular one, a sphere where three equal convex fillets meet, a pipe surface in general.
- Concave edges gain material and convex edges lose it; the section is the spandrel, area $r^2(1 - \pi/4)$, centroid $r(10 - 3\pi)/(12 - 3\pi)$ from each face.
- Pappus gives circular fillets and chamfers exactly: the peg's 1 mm root fillet adds 3.672143 mm³, as the kernel measures; a fully rounded box obeys Steiner's formula.
- Inside one fillet feature the concave-first order changes nothing measurable; between features it changes the surface, the volume, and sometimes whether the blend exists.
- jig finds the largest working radius by seven bisection steps on $[0, r]$, so its answer is within $r/128$ of the limit and depends on the request.
- An offset towards a centre of curvature fails when the distance reaches the radius: a shell wall must be thinner than the smallest convex corner radius.
- Shells and drafts of prismatic parts have closed-form volumes; the kernel matches them.
- A root fillet bounds the stress concentration at an inside corner and, being concave, prints without support; jig treats it as a rule, not an analysis.

## Exercises

> **Exercise.** Derive the volume a 1 mm fillet removes from the top rim of a Ø20 mm cylinder, and the volume a 1 mm chamfer removes. Compile both on `j.region.circle(10)` extruded 10 mm and compare with your numbers.

> **Exercise.** In the workbench, fillet all twelve edges of a 30 × 30 × 30 mm cube at 5 mm. Predict the volume with Steiner's formula before you compile, then check the IR for the face kinds.

> **Exercise.** For the 50 × 30 × 4 mm plate, how many bisection steps would jig need to report the 15 mm limit to within 0.01 mm from a request of 20 mm? Ask for 15.2 mm instead of 20 mm and explain why the reported value improves.

> **Exercise.** [Load A-01](lab:preset/A-01) and change its shell to `direction: 'out'`. Predict the radius of the outer vertical corners and say which edges of the outer surface are new cylinders and of what radius. Select them to check, and explain why the result no longer depends on the corner radius limit of Section 21.7.

## Further reading

- Rossignac and Requicha, *Constant-radius blending in solid modeling*, Computers in Mechanical Engineering 3(1), 1984: the rolling-ball blend defined through offsets, as in Section 21.1.
- Vida, Martin and Várady, *A survey of blending methods that use parametric surfaces*, Computer-Aided Design 26(5), 1994: rolling-ball, variable-radius and corner blends, and how kernels build them.
- Maekawa, *An overview of offset curves and surfaces*, Computer-Aided Design 31(3), 1999: offsets, their self-intersections and how they are trimmed.
- Hoffmann, *Geometric and Solid Modeling: An Introduction*, Morgan Kaufmann, 1989: blends and offsets in a solid modeller, with the geometry worked out.
- Pilkey and Pilkey, *Peterson's Stress Concentration Factors*, 3rd edition, Wiley, 2008: the charts of $K_t$ for shoulder fillets and notches behind Section 21.9.
