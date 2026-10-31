---
part: VI · Inside the kernel
partAbout: How a solid is stored, how curves and surfaces are described, how booleans and blends are computed, how a B-rep becomes triangles, and what it takes to build a kernel.
presets: M-07, A-06
docs: reference, printing
---
# Representing solids

A solid in a computer is a finite piece of data that stands for an infinite set of points. There are several ways to choose that data: a tree of operations on simple shapes, a list of the faces that bound the solid, a cloud of triangles, a function that is negative inside, a grid of filled cells. Each answers some questions cheaply and others not at all. This chapter states what a representation must do, works one solid (the die of [Chapter 5](lab:book?ch=5)) through five representations with measured sizes and errors, explains how a tree of operations becomes a boundary, and shows which representation jig uses for which job. By the end you can classify a point against a CSG tree by hand, say what each representation costs for booleans, fillets and printing, and read jig's IR levels as layers of representation.

## 17.1 What a representation must do

Requicha (1980) separated the solid from its representation. The **mathematical model** of a solid is an **r-set**: a bounded, closed, regular, semianalytic subset of space. *Regular* means equal to the closure of its interior, which rules out dangling faces and edges (the regularised booleans of Chapter 5 keep sets regular); *semianalytic* means bounded by finitely many pieces of analytic surfaces, which rules out fractals. A **representation scheme** is a relation between such sets and finite data structures, and it is judged on a short list of properties:

- **Domain**: which solids it can describe at all.
- **Validity**: every syntactically correct representation describes some r-set. A scheme with this property never needs a checker.
- **Completeness** (unambiguity): a representation describes exactly one solid, so any geometric question (a volume, whether a point is inside) has one answer.
- **Uniqueness**: a solid has exactly one representation, so two solids can be compared by comparing data.
- **Conciseness**: the data are small.
- **Closure under operations**: booleans, rigid motions, offsets and blends applied to represented solids give represented solids.

Requicha adds efficacy: how cheaply the representation answers the questions an application asks. No scheme has every property. The trade-offs show up even on a pair of boxes.

Take two 20 × 20 × 10 mm boxes that share a face. OpenCascade's fuse returns a valid solid of 8,000 mm³ with 10 faces, 20 edges and 12 vertices: the four side faces are each split in two along the old shared face. After merging same-domain faces (the step jig runs after every boolean of planes, cylinders and cones), the same solid has 6 faces, 12 edges and 8 vertices. Both B-reps pass OpenCascade's validity check and describe one and the same point set, so the boundary representation is complete but not unique.

## 17.2 CSG and point membership classification

**Constructive solid geometry** (CSG) represents a solid as a tree: leaves are primitives (boxes, cylinders, spheres, cones, tori, or half-spaces), interior nodes are regularised booleans and rigid motions. jig's `j.box`, `j.cyl`, `j.sphere`, `j.cone` and `j.torus` build such trees lazily (src/engine/csg.js): `cube.intersect(ball)` stores a node, not geometry.

CSG scores well on Requicha's list. Every tree of valid primitives is a valid solid, because regularised booleans map r-sets to r-sets. A tree describes exactly one solid. It is concise: the die's tree is 262 bytes of script. It is not unique (`a.union(b)` and `b.union(a)` are different trees for one solid), and it is closed under booleans and motions but not under fillets or offsets, which are not set operations on the leaves.

The basic question asked of a CSG tree is **point membership classification** (PMC): is a point $p$ in, on or out of the solid? Classify $p$ against each leaf, then combine the answers up the tree.

```js
// classify point p against a CSG node: 'in' | 'on' | 'out'
function classify(node, p) {
  if (node.leaf) return node.leaf.classify(p)   // a primitive's test
  const a = classify(node.a, p), b = classify(node.b, p)
  return combine(node.op, a, b)   // the table below
}
```

The combination is a table, and for a union it reads:

| $a$ ∪* $b$ | $b$ in | $b$ on | $b$ out |
|---|---|---|---|
| $a$ in | in | in | in |
| $a$ on | in | in or on | on |
| $a$ out | in | on | out |

One cell has two answers. A point on the boundary of both arguments can be inside the union or on its boundary, and in/on/out alone cannot tell. The two boxes above show it: the point (20, 10, 5) lies on the shared face, so it is on both boxes, but it is 5 mm inside their union. Tilove (1980) resolved the case by classifying a small **neighbourhood** of the point (which directions from it lead into each argument) and combining neighbourhoods instead of labels: the left box fills the half-ball on one side, the right box the other, and their union is a full ball, so the point is in. Intersection and difference have the same ambiguous cell.

The die is cube ∩ ball − rods, with a 20 mm cube, a ball of radius 13 mm and three rods of radius 5 mm along the axes. Each primitive's test is a sign: the cube's is $\max(|x|, |y|, |z|) - 10$, the ball's $|p| - 13$, a rod's its distance from its axis minus 5. Classifying six points by hand and asking the kernel (by the distance from a vertex at $p$ to the B-rep solid, and whether OpenCascade finds it inside) gives:

| point (mm) | cube | ball | rods | tree gives | B-rep says |
|---|---|---|---|---|---|
| (9, 0, 6) | in | in | out | in | in |
| (6, 6, 0) | in | in | out | in | in |
| (8, 8, 8) | in | out | out | out | out, 0.856 mm away |
| (0, 0, 0) | in | in | in | out | out, 6.124 mm away |
| (10, 6, 0) | on | in | out | on | on |
| (3, 4, 8) | in | in | on | on | on |

The tree and the boundary agree on every point. PMC is what makes CSG cheap to ray-trace and to integrate: a ray is classified in segments, and a volume integral becomes a sum over classified samples.

```figure
// view: axo
const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
return j.part('node').add(cube.intersect(ball), { id: 'body' })
```

**Figure 17.1.** The node cube ∩ ball of the die's tree, evaluated: a ball of radius 13 mm cut by the six faces of a 20 mm cube. Because 13 < 10√2, the ball misses the cube's edges entirely, so the result has 7 faces (six flat discs and one spherical zone), 9 circular edges and no straight ones. Volume 7,167.02 mm³.

## 17.3 Boundary representation

A **boundary representation** (B-rep) stores the surface that encloses the solid, split into **faces**, each a piece of one surface, bounded by **edges**, each a piece of one curve, which end at **vertices**. The connections between them are the **topology**; the surfaces, curves and points are the **geometry**. Chapter 5 counted them; Chapter 19 takes the data structure apart.

The die's B-rep has 13 faces (6 planes, 6 cylinders, 1 sphere) and 42 edges: 15 circles, 6 straight seam lines, and 21 ellipses. The ellipses are worth a sentence. Two cylinders of equal radius whose axes cross meet in two plane ellipses (the boundary of a Steinmetz solid), and OpenCascade recognises the intersection curve as exactly that, so a model built from analytic primitives stays analytic.

On Requicha's list a B-rep is complete but, as the two boxes showed, not unique; it is verbose (the die's STEP file is 105,595 bytes against 262 for its tree); and validity is the hard part. A valid B-rep must describe a closed, oriented surface that does not cross itself, whose edges lie on the faces they bound and whose loops close. The Euler–Poincaré formula is necessary, not sufficient: a B-rep can have the right counts and self-intersecting faces. OpenCascade's checker (BRepCheck_Analyzer) tests the geometric conditions too, and jig runs it after every fillet, chamfer and shell, refusing a result that fails it. The counts leave out **degenerate edges**, the zero-length edges OpenCascade puts at a sphere's poles and a cone's apex: jig reports a ball as 1 face, 1 seam edge and 2 vertices, so $V - E + F = 2$ and the genus is 0. Chapter 19 explains why those edges exist.

What a B-rep buys is closure under almost everything a designer does. A fillet replaces an edge by a new face, an offset moves faces along their normals, a draft tilts them, and none of these is a set operation on primitives, so none can be written as a CSG tree. This is why the established mechanical CAD kernels, Parasolid, ACIS and OpenCascade among them, are B-rep kernels.

```figure
// view: axo
// overlays: hidden
const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })
```

**Figure 17.2.** The die as a B-rep, hidden edges shown: 13 faces, 42 edges, 30 vertices. Where two bores cross, the edges are exact ellipses; where a bore leaves a flat disc, a circle.

## 17.4 Meshes

A **triangle mesh** stores vertices and triangles that index them. A mesh bounds a solid when it is **watertight** (every edge is shared by exactly two triangles) and consistently oriented, and is **manifold** when the triangles round each vertex form a single fan. A mesh is the representation of display hardware and of printing: STL is a list of triangles, 3MF an indexed mesh with units.

A mesh is not exact. jig meshes the die with a chordal deviation of 0.05 mm (src/engine/mesh.js chooses min(0.2, max(0.05, 0.001 × diagonal)) mm) and an angular limit of 0.3 rad, which gives 1,970 triangles on 1,703 vertices. The volume of that mesh, summed over signed tetrahedra, is 3,860.88 mm³, 0.21 % less than the B-rep's 3,868.84 mm³: the triangles are inscribed in the curved faces and cut a thin lens of material off each. Chapter 22 derives the segment counts and the volume lost.

Booleans on meshes are possible and, with exact arithmetic for the orientation tests, robust; Manifold is a library built on that idea. Fillets and offsets on meshes are not exact operations and are rarely done. jig does no mesh booleans: every boolean is a B-rep boolean in OpenCascade.

## 17.5 Implicit and signed-distance models

An **implicit** representation describes a solid by a function $f$ of position: $f(p) < 0$ inside, $f(p) = 0$ on the boundary, $f(p) > 0$ outside. When $|f(p)|$ is also the distance from $p$ to the boundary, $f$ is a **signed distance function** (SDF). Pasko and colleagues called the general scheme **function representation** (F-rep).

PMC is free: evaluate $f$. Booleans are free too, at least as sets. With $a$ and $b$ the functions of $A$ and $B$,

$$
A ∪* B : \min(a, b), \quad A ∩* B : \max(a, b), \quad A −* B : \max(a, -b) .
$$

The die is one expression, $f = \max(c, s, -\min(r_1, r_2, r_3))$, with $c$ the cube's test, $s$ the ball's and $r_1$, $r_2$, $r_3$ the rods'. Its sign agrees with the table of Section 17.2 at every point. Its value is another matter. At (8, 8, 8) the expression gives 0.856 mm, which is the true distance to the sphere. At the origin it gives 5 mm (the distance to the nearest rod's surface), but the nearest point of the die is where all three rods leave room, at $x = y = z$ with $2x^2 = 25$, so the true distance is $\sqrt{37.5} = 6.124$ mm, which is what the kernel measured. Min and max of distance functions give a function with the right zero set that underestimates the distance; algorithms that march along rays by the SDF's value still work, but anything that reads $f$ as a distance (an offset $f - d$, a blend width) is distorted near the seams.

Implicit models make blends cheap: replacing min by a smooth minimum (Ricci, 1973) rounds every seam of a union at once, and lattices and variable-density infill are one-line functions. They pay elsewhere: the surface is never stored, so measuring a volume, drawing a picture or making a print means sampling $f$ on a grid. jig has no implicit models; the reference lists `j.field.*` as not supported.

## 17.6 Voxels

**Spatial occupancy enumeration** divides space into cubes (**voxels**) and stores one bit per cell: filled or empty. Validity is automatic, booleans are bitwise operations, and for a fixed grid the representation is unique. It is approximate and large. Sampling the die's implicit function at cell centres inside its 20 mm cube gives:

| cell size | cells | bits | volume | error |
|--:|--:|--:|--:|--:|
| 2 mm | 1,000 | 0.1 KiB | 4,352.00 mm³ | +12.49 % |
| 1 mm | 8,000 | 1.0 KiB | 3,872.00 mm³ | +0.08 % |
| 0.5 mm | 64,000 | 7.8 KiB | 3,857.00 mm³ | −0.31 % |
| 0.25 mm | 512,000 | 62.5 KiB | 3,856.25 mm³ | −0.33 % |
| 0.125 mm | 4,096,000 | 500 KiB | 3,870.92 mm³ | +0.05 % |
| 0.1 mm | 8,000,000 | 977 KiB | 3,867.49 mm³ | −0.035 % |

The error does not fall steadily with the cell size: the cells that straddle the surface are counted whole or not at all, and which way they fall depends on how the grid lines meet the spheres and cylinders. It is bounded by the volume of that boundary layer, roughly the surface area times half a cell. Memory grows as the cube of the resolution, which is why practical voxel systems use **octrees**, subdividing only cells that straddle the boundary. A printer's slicer works in a related representation: each layer is a 2D region, filled at the nozzle's resolution.

## 17.7 The five compared

| | CSG | B-rep | mesh | F-rep / SDF | voxels |
|---|---|---|---|---|---|
| exact geometry | yes | yes | no | yes (as a formula) | no |
| valid by construction | yes | no: needs a checker | no: needs a checker | yes | yes |
| booleans | a new node | surface intersection | robust only with exact tests | min and max | bitwise |
| fillets, offsets | no | yes | approximate | smooth min, $f - d$ (distorted) | morphological, coarse |
| the die | 262 B of script | 105,595 B STEP | 98,584 B STL | an expression | 977 KiB at 0.1 mm |
| point in/out | tree walk | ray or distance test | ray test | one evaluation | one lookup |
| what a printer gets | evaluate first | mesh it first | directly | sample first | slice directly |

The STEP file is large because it stores more than geometry: 1,783 entities, among them 84 pcurves (each edge's curve in the parameter space of its faces). Gzipped it is 21,756 bytes. The STL is exactly 84 + 50 × 1,970 bytes: a header, a count, and 50 bytes per triangle.

## 17.8 Boundary evaluation

**Boundary evaluation** turns a CSG tree into a B-rep. Requicha and Voelcker (1985) described its classic form as generate, classify, combine. For a node $A$ op $B$, intersect every face of $A$ with every face of $B$ and split both boundaries along the intersection curves; classify each resulting face piece against the other solid (PMC at one interior point of the piece is enough, because a piece does not cross the other boundary); keep pieces by the operation:

| operation | keep from $A$ | keep from $B$ |
|---|---|---|
| $A$ ∪* $B$ | pieces out of $B$ | pieces out of $A$ |
| $A$ ∩* $B$ | pieces in $B$ | pieces in $A$ |
| $A$ −* $B$ | pieces out of $B$ | pieces in $A$, reversed |

Pieces on the other boundary (coincident faces) are kept once if their normals agree and dropped if they oppose, which is the neighbourhood rule of Section 17.2 applied to faces. Then sew the kept pieces into shells and merge faces that lie on one surface. Chapter 20 follows OpenCascade's version of this pipeline and its robustness problems.

jig evaluates the tree bottom-up, each node a B-rep boolean in OpenCascade, so every intermediate result is a real solid that can be measured:

| node | F | E | V | volume (mm³) |
|---|--:|--:|--:|--:|
| cube | 6 | 12 | 8 | 8,000.000 |
| ball | 1 | 1 | 2 | 9,202.772 |
| one rod | 3 | 3 | 2 | 3,141.593 |
| rods (three unions) | 12 | 33 | 23 | 8,010.564 |
| cube ∩ ball | 7 | 9 | 7 | 7,167.020 |
| (cube ∩ ball) − rods | 13 | 42 | 30 | 3,868.845 |

The rods check against closed forms. Two rods of radius $r$ meet in a Steinmetz bicylinder of volume $\frac{16}{3} r^3$, all three in a tricylinder of volume $8(2 - \sqrt{2})\,r^3$, so by inclusion–exclusion

$$
V = 3\pi r^2 \cdot 40 - 3 \cdot \frac{16}{3} r^3 + 8(2 - \sqrt{2})\,r^3 = 9424.778 - 2000.000 + 585.786 = 8010.564\ \mathrm{mm^3}
$$

for $r = 5$, the kernel's value to every printed digit.

```sketch
// title: Evaluate a CSG tree node by node
// Return ball, rods or cube.intersect(ball) instead and read F, E, V at L4.
const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })
```

jig never classifies points against the tree itself: it evaluates boundaries eagerly and asks every later question of the B-rep. A CSG system that kept the tree could answer PMC and ray queries without any surface intersection, and could defer evaluation until a boundary is needed, as OpenSCAD's preview mode does when it draws a tree without evaluating it.

## 17.9 How jig layers them

jig uses four representations, each for what it does best, and the IR view shows them as levels.

The **history** is the part's feature list (IR levels L0 and L1): a generalised CSG tree whose nodes are features. An extrude that joins is a union with a swept solid, a hole a difference, but a fillet or a shell is an operation on the boundary that no CSG tree can express. The history is what the user edits and what parameters flow through; it is replayed, with caching, on every compile.

The **B-rep** (L4) is the evaluated model and the source of truth: volumes, masses, face names and their genealogy (Chapter 6), exact distances, sections for simple bodies, and STEP export all read it.

**Meshes** (L6) are derived from the B-rep: the display, STL and 3MF export, and the analyses that need many cheap queries. The overhang check walks the display triangles but takes the exact normal of planes, cylinders, cones and spheres, so a 45° chamfer is not flagged by its facets. The slicer cuts exact B-rep sections for simple bodies and the display mesh for bodies with more than 80 faces or any freeform face. The interference check of an assembly uses the exact B-rep distance for bodies made only of analytic faces and the mesh distance otherwise. On [M-07](lab:preset/M-07), whose gear flanks are freeform, the mesh check reports the pinion–wheel gap as ≈ 0.203 mm and its pass takes about 1.4 s; `.interference({ exact: true })` reports 0.200 mm and took 3.5 to 5.9 s in four runs. The 3 µm difference is the inscribed triangles of the convex flanks.

**Voxels** and implicit functions jig does not use, and it has no mesh booleans or mesh import.

```figure
// view: axo
const plate = j.sketch('plate', { on: j.plane.XY })
  .rect('r', 40, 30, { center: true, r: 4 })
return j.part('block')
  .extrude(plate.profiles(), mm(8), { id: 'base' })
  .fillet(j.feat('base').endFace().edges(), mm(1.5), { id: 'round' })
  .hole([[-12, 0], [12, 0]], j.hole.clearance('M3'), { id: 'holes' })
```

**Figure 17.3.** A block with three features. Its history is three lines (`base`, `round`, `holes`); its B-rep 20 faces, 46 edges, 28 vertices and 9,272.9 mm³; its display mesh 1,588 triangles at 0.051 mm.

> **Try it.** Open the sketch below, [show the IR](lab:show/ir) and step through the levels: L1 prints the history `plate(sketch) → base(extrude 8 mm) → round(fillet) → holes(hole 2 × clearance M3 slide)`, L4 the B-rep's counts and face names, L6 the triangle count. Then open [M-07](lab:preset/M-07) and compare the gap decision with and without `{ exact: true }`.

```sketch
// title: One part, three representations
// Change the fillet radius: the history keeps 3 features, L4 and L6 change.
const plate = j.sketch('plate', { on: j.plane.XY })
  .rect('r', 40, 30, { center: true, r: 4 })
return j.part('block')
  .extrude(plate.profiles(), mm(8), { id: 'base' })
  .fillet(j.feat('base').endFace().edges(), mm(1.5), { id: 'round' })
  .hole([[-12, 0], [12, 0]], j.hole.clearance('M3'), { id: 'holes' })
```

```figure
// view: front
// overlays: overhang
const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod
  .union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))
  .union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die')
  .add(cube.intersect(ball).subtract(rods), { id: 'body' })
```

**Figure 17.4.** The die with the overhang overlay, front elevation: a mesh analysis that uses the B-rep's exact sphere and cylinder normals. The lower band of the sphere and the tops of the horizontal bores face down by more than 45°.

## 17.10 Key points

- Requicha's model of a solid is an r-set; a representation is judged on domain, validity, completeness, uniqueness, conciseness and closure under operations, and no scheme has them all.
- CSG is valid by construction, complete and concise, but not unique and not closed under fillets and offsets; point membership classification walks the tree, and coincident boundaries need neighbourhoods, not labels.
- A B-rep is complete and closed under booleans, fillets and offsets, but not unique (two touching boxes fuse into 10 faces or, merged, 6) and needs a validity checker.
- Meshes are what displays and printers use; the die's mesh at 0.05 mm loses 0.21 % of its volume.
- Implicit functions make PMC, booleans and blends cheap; min and max of SDFs keep the zero set but not the distance (5 mm against the true 6.124 mm at the die's centre).
- Voxels are valid and simple but large and approximate: 8 million cells for −0.035 % on the die.
- Boundary evaluation splits, classifies and combines face pieces; jig evaluates every CSG node at once in OpenCascade.
- jig layers a history (L0–L1), an OpenCascade B-rep (L4) as the truth, and meshes (L6) for display, export, overhangs, slicing of complex bodies and the quick interference check.

## Exercises

> **Exercise.** Classify (5, 5, 5), (0, 9, 9) and (4, 3, 9) against the die's tree by hand, using the primitive tests of Section 17.2. Then evaluate the die's implicit function at each point and say which values are true distances.

> **Exercise.** Fill in the intersection table (∩*) and the difference table (−*) for PMC in the style of Section 17.2, and find the cells that need a neighbourhood. Give a pair of boxes that realises each one.

> **Exercise.** In the workbench, return `rod.union(rod.moved(j.tx.rotate(j.axis.X, deg(90))))` from the evaluation sketch and check its volume against $2\pi r^2 \cdot 40 - \frac{16}{3} r^3$. Count its ellipse edges at L4 and explain the number.

> **Exercise.** Open Figure 17.3's sketch and add a 0.5 mm chamfer to the bottom edges. How many features, faces and triangles does each IR level report now, and which level changed most?

## Further reading

- Requicha, *Representations for rigid solids: theory, methods, and systems*, ACM Computing Surveys 12(4), 1980: r-sets and the properties of representation schemes used in Section 17.1.
- Tilove, *Set membership classification: a unified approach to geometric intersection problems*, IEEE Transactions on Computers C-29(10), 1980: classification against CSG trees and the neighbourhood argument.
- Requicha and Voelcker, *Boolean operations in solid modeling: boundary evaluation and merging algorithms*, Proceedings of the IEEE 73(1), 1985: the generate–classify–combine pipeline of Section 17.8.
- Hoffmann, *Geometric and Solid Modeling: An Introduction*, Morgan Kaufmann, 1989: CSG, B-rep and robustness of boolean operations in one textbook.
- Pasko, Adzhiev, Sourin and Savchenko, *Function representation in geometric modeling: concepts, implementation and applications*, The Visual Computer 11(8), 1995: F-rep and its operations.
- Mäntylä, *An Introduction to Solid Modeling*, Computer Science Press, 1988: boundary data structures and Euler operators, the background for Chapter 19.
