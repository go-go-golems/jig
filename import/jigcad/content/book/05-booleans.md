---
part: II · Solids
presets: S-04, A-06
docs: reference
---
# Booleans and valid solids

Union, intersection and difference are how solids are combined: a boss is joined to a plate, a pocket is cut from a block, a die is a cube intersected with a ball. This chapter explains why the ordinary set operations are the wrong ones for solids and what jig uses instead, gives the volume identity that every boolean must satisfy, and introduces the counting formula that tells a valid solid from a broken one. By the end you can predict the volume of a boolean, compute a solid's genus from its face, edge and vertex counts, and read the diagnostics that report an operation the kernel cannot complete.

## 5.1 Regularised booleans

A solid is a set of points, so the set operations apply. They apply badly. Two 20 × 20 × 10 mm boxes that share a face have, as point sets, an intersection that is that face: a set with area but no volume, which no printer can make. Their difference keeps a face's worth of boundary points on one side and not the other. Ordinary set operations produce such **dangling** pieces whenever solids touch, and touching is the usual case in modelling.

Requicha (1980) defined the fix. The **regularisation** of a set is the closure of its interior: take the interior (which drops every face, edge or point with no volume around it) and add back its boundary. The **regularised** operations are the ordinary ones followed by regularisation:

$$
A ∪* B = cl(int(A \cup B)), \quad A ∩* B = cl(int(A \cap B)), \quad A −* B = cl(int(A − B)) ,
$$

where int is the interior and cl the closure.

Under them, the two touching boxes intersect in the empty set, and their union is one 40 × 20 × 10 mm box with 6 faces, not two boxes with a shared face inside. The kernel confirms it: the union has 8 vertices, 12 edges and 6 faces, and a volume of 8,000 mm³. Regularised sets form a Boolean algebra, so unions reorder and regroup freely, which lets the compiler turn a chain of unions into one n-ary union with fewer slivers.

The die below is the classic example: a cube of side 20 mm intersected with a ball of radius 13 mm, minus three rods of radius 5 mm along the axes.

```js
const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
```

The cube is 8,000 mm³ and the ball 9,202.77 mm³; their intersection is 7,167.02 mm³, and removing the rods leaves 3,868.84 mm³.

```figure
// view: axo
const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })
```

**Figure 5.1.** Cube ∩ ball − rods: a 20 mm cube with its corners rounded by a 13 mm ball and three 10 mm bores along the axes. Volume 3,868.84 mm³; a single shell of genus 5.

```sketch
// title: A die from three primitives
// Grow the ball to mm(14.14): the corners almost return. Shrink the rods.
const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })
```

## 5.2 Inclusion–exclusion

Volume is a measure, and a measure satisfies **inclusion–exclusion**:

$$
\operatorname{vol}(A \cup B) = \operatorname{vol}A + \operatorname{vol}B - \operatorname{vol}(A \cap B) .
$$

The identity holds for regularised operations because they differ from the ordinary ones only by sets of zero volume. It is a check that costs three extra booleans and catches a kernel that lost or doubled material.

Take a 40 × 30 × 20 mm box centred at the origin, $A$, and a cylinder of radius 12 mm and length 50 mm centred on the box's right face, $B$. The kernel measures

| quantity | volume |
|---|--:|
| $\operatorname{vol}A$ | 24,000 mm³ |
| $\operatorname{vol}B$ | 22,619.467106 mm³ |
| $\operatorname{vol}(A \cap B)$ | 4,523.893421 mm³ |
| $\operatorname{vol}A + \operatorname{vol}B - \operatorname{vol}(A \cap B)$ | 42,095.573685 mm³ |
| $\operatorname{vol}(A \cup B)$ | 42,095.573685 mm³ |

and the last two rows agree to every digit printed. The intersection is half of a 24 mm disc 20 mm thick, $\pi \cdot 12^2 \cdot 20 / 2 = 4523.89$ mm³, because the cylinder's axis lies on the box's face and the box is 20 mm tall. The die obeys the same identity for a difference: $\operatorname{vol}(C - R) = \operatorname{vol}C - \operatorname{vol}(C \cap R)$, and $7167.02 - 3298.18 = 3868.84$ mm³, where $C$ is cube ∩ ball and $R$ the rods.

```figure
// view: axo
const A = j.box(mm(40), mm(30), mm(20), { center: true })
const B = j.cyl(mm(12), mm(50), { center: true }).moved(j.tx.move(20, 0, 0))
return j.part('union').add(A.union(B), { id: 'body' })
```

**Figure 5.2.** $A \cup B$: a 40 × 30 × 20 mm box and a 24 mm cylinder 50 mm long whose axis lies on the box's right face. Its volume, 42,095.57 mm³, equals 24,000 + 22,619.47 − 4,523.89.

```sketch
// title: Inclusion–exclusion on volume
// Return A.intersect(B) or A.subtract(B) instead and add up the volumes.
const A = j.box(mm(40), mm(30), mm(20), { center: true })
const B = j.cyl(mm(12), mm(50), { center: true }).moved(j.tx.move(20, 0, 0))
return j.part('union').add(A.union(B), { id: 'body' })
```

The same identity holds for areas of regions, and the compiler's `shape.boolean` law tests both on random inputs.

## 5.3 Boundary representation and Euler–Poincaré

The kernel does not store a solid as a set of points. It stores a **boundary representation** (B-rep): the faces that bound it, each a piece of a surface; the edges where faces meet; the vertices where edges end; and the **loops** that bound each face, one outer loop and one inner loop per hole in the face. A solid has one or more **shells**, closed connected boundaries, and a **genus**, its number of through-holes.

These counts are not independent. For any valid solid the **Euler–Poincaré formula** holds (Mäntylä, 1988):

$$
V - E + F - (L - F) - 2(S - G) = 0 ,
$$

with $V$ vertices, $E$ edges, $F$ faces, $L$ loops, $S$ shells and $G$ the genus. $L - F$ is the number of inner loops. A box has $V = 8$, $E = 12$, $F = 6$, $L = 6$, $S = 1$, $G = 0$: $8 - 12 + 6 - 0 - 2 = 0$. The compiler counts all six for every body. It cannot know the genus independently, so it solves the formula for $G$ and checks that the answer is a whole number of at least 0; anything else is reported as a nonzero `residual` in the body's topology and a `brep.invalid` warning, because the kernel produced something that is not a solid. Degenerate edges, such as the poles of a sphere, are not counted (Chapter 19).

Run backwards, the formula gives the genus from counts the kernel already has. For the plate below, 170 × 100 × 5 mm with 40 clearance holes, the compiler reports $V = 88$, $E = 132$, $F = 46$, $L = 126$, $S = 1$:

$$
G = S - \tfrac{1}{2}(V - E + F - (L - F)) = 1 - \tfrac{1}{2}(88 - 132 + 46 - 80) = 1 + 39 = 40 ,
$$

one through-hole per bore. The counts themselves follow from how OpenCascade builds a bore: a cylindrical face with a seam edge, bounded by one loop, and a circle at each end with one vertex on the seam. Each bore adds 2 vertices, 3 edges, 1 face and 3 loops (its own, and an inner loop in the top and the bottom face). The die of Figure 5.1 has $V = 30$, $E = 42$, $F = 13$, $L = 22$, $S = 1$, and the formula gives $G = 5$: three bores that cross at the centre leave five independent through-holes.

```figure
// view: axo
let pts = j.sketch('pts', { on: j.plane.offset(j.plane.XY, mm(5)) })
for (let i = 0; i < 8; i++) {
  for (let k = 0; k < 5; k++) {
    pts = pts.point(`p${i}_${k}`, [-70 + i * 20, -40 + k * 20])
  }
}
return j.part('perf')
  .extrude(j.region.rect(170, 100), mm(5), { id: 'body' })
  .hole(pts, j.hole.clearance('M3', { fit: 'slide' }), { id: 'holes' })
```

**Figure 5.3.** A 170 × 100 × 5 mm plate with 40 M3 clearance holes, 3.5 mm each, from one hole feature. $V - E + F - (L - F) - 2(S - G) = 88 - 132 + 46 - 80 - 2(1 - 40) = 0$, so the genus is 40.

```sketch
// title: Genus from counting
// Change the 8 × 5 grid and read V, E, F, L in the IR at level L4.
let pts = j.sketch('pts', { on: j.plane.offset(j.plane.XY, mm(5)) })
for (let i = 0; i < 8; i++) {
  for (let k = 0; k < 5; k++) {
    pts = pts.point(`p${i}_${k}`, [-70 + i * 20, -40 + k * 20])
  }
}
return j.part('perf')
  .extrude(j.region.rect(170, 100), mm(5), { id: 'body' })
  .hole(pts, j.hole.clearance('M3', { fit: 'slide' }), { id: 'holes' })
```

> **Try it.** Open the sketch, [show the IR](lab:show/ir) and find the body at level L4: it prints the six counts and a ✓ for the Euler–Poincaré check.

## 5.4 Operations that cannot produce a valid solid

Some requests have no valid answer, and the compiler says which and by how much rather than returning a broken body.

A **shell** offsets faces inwards by a wall thickness. Shell a 60 × 40 × 30 mm block by 25 mm and the inner offset of the 40 mm sides crosses itself: there is no solid with that wall. The diagnostic is `brep.invalid: shell of body1 by 25 mm gives an invalid solid`, with the fix `wall < 15 mm (half the smallest dimension)`.

A **fillet** replaces an edge by a rolling-ball blend of radius $r$. On a 50 × 30 × 4 mm plate, the four vertical edges can take at most a radius of half the short side, where the two blends on each end meet. Ask for 20 mm and the compiler searches for the largest radius that works and reports it: `fillet.tooLarge: r = 20 mm is too large for 4 edges of body1; the largest that works is about 14.844 mm`. The reported value comes from a search, a little below the geometric limit of 15 mm.

A **join** of solids that touch only along an edge or at a point has no regularised union with one shell: two 20 × 20 × 10 mm boxes meeting at a vertical edge stay two bodies, and the compiler warns `boolean.nonManifold: join left 2 solids that only touch along an edge or a point`, with the fix to overlap them by at least one line width. [S-04](lab:preset/S-04) overlaps its spike and paddle by 1 mm for exactly this reason.

```figure
// view: plan
const plate = j.sketch('p', { on: j.plane.XY })
  .rect('r', 50, 30, { center: true })
return j.part('mount')
  .extrude(plate.profiles(), mm(4), { id: 'plate' })
  .fillet(j.feat('plate').sideFaces().edges('|Z'), mm(14), { id: 'round' })
```

**Figure 5.4.** A 50 × 30 × 4 mm plate with its vertical edges filleted at 14 mm, in plan: near the largest radius that works. The volume is $6000 - 4(1 - \pi/4) \cdot 14^2 \cdot 4 = 5327.0$ mm³, and the body still satisfies Euler–Poincaré with $V = 16$, $E = 24$, $F = 10$.

```sketch
// title: A fillet that is too large
// expect: fillet.tooLarge
// This asks for 20 mm. Read the diagnostic, then use the radius it reports.
const plate = j.sketch('p', { on: j.plane.XY })
  .rect('r', 50, 30, { center: true })
return j.part('mount')
  .extrude(plate.profiles(), mm(4), { id: 'plate' })
  .fillet(j.feat('plate').sideFaces().edges('|Z'), mm(20), { id: 'round' })
```

## 5.5 Key points

- Ordinary set operations leave faces and edges with no volume around them; regularised operations (Requicha) take the closure of the interior and do not.
- Regularised sets form a Boolean algebra, so unions can be reordered and merged into one n-ary operation.
- Volume satisfies inclusion–exclusion, $\operatorname{vol}(A \cup B) = \operatorname{vol}A + \operatorname{vol}B - \operatorname{vol}(A \cap B)$; the kernel matches it to every printed digit.
- A B-rep stores faces, edges, vertices, loops and shells; a valid solid satisfies $V - E + F - (L - F) - 2(S - G) = 0$.
- The formula gives the genus from the counts: 40 for a plate with 40 holes, 5 for the die.
- Requests with no valid solid are diagnostics with a measured limit: `brep.invalid`, `fillet.tooLarge`, `boolean.nonManifold`.

## Exercises

> **Exercise.** Compute $V$, $E$, $F$, $L$ for a box with one round through-hole, using the bore counts of Section 5.3, and check that the formula gives $G = 1$. Then compile it and compare with the IR.

> **Exercise.** Verify inclusion–exclusion for the die: compute vol(cube), vol(ball), vol(cube ∪ ball) and vol(cube ∩ ball) with `.volume()` inside a script, and return the part whose volume you want to see.

> **Exercise.** Two boxes that touch along an edge stay two bodies. Move one by 0.45 mm so they overlap by a line width, and read how many bodies and faces the join gives.

## Further reading

- Requicha, *Representations for rigid solids: theory, methods, and systems*, ACM Computing Surveys 12(4), 1980: regularised sets and the properties a solid representation must have.
- Mäntylä, *An Introduction to Solid Modeling*, 1988: boundary representations, Euler operators and the Euler–Poincaré formula used here.
- [Part VI, Inside the kernel](lab:book/17): how solids are represented, how a boolean is computed step by step, blends and offsets, and tessellation, in Chapters 17–23.
