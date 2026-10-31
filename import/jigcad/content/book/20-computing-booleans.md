---
part: VI · Inside the kernel
presets: S-04
docs: naming, reference
---
# How a boolean is computed

Chapter 5 said what a union, an intersection or a difference must produce, and Chapter 19 showed the structure a result is stored in. This chapter follows a boolean through OpenCascade from two input solids to one output: finding which faces can meet, intersecting them, splitting faces and edges along the intersections, deciding which pieces lie inside the other solid, assembling the survivors and merging faces that lie on one surface. It then shows why the hard cases are faces that almost coincide and surfaces that touch without crossing, and works through such a case: a fillet that lost a whole feature without an error. Last, it shows how a boolean reports its history and how jig turns that history into names. By the end you can predict which pieces of each operand survive a boolean, say why an overlap of a line width makes a join robust, and read the history behind any face name.

## 20.1 The pipeline

A B-rep boolean runs in six stages:

| stage | question | output |
|---|---|---|
| culling | which pairs of faces, edges and vertices can touch? | candidate pairs |
| intersection | where do they meet? | intersection points and curves |
| splitting | how do those curves cut the faces and edges? | pieces of each face |
| classification | is each piece inside, outside or on the other solid? | a status per piece |
| assembly | which pieces make the result, and how do they join? | shells and solids |
| merging | which faces of the result lie on one surface? | the final faces |

OpenCascade organises the first four stages as one algorithm, the **General Fuse**: it intersects every pair of sub-shapes of all the arguments, splits everything at the intersections, and builds every piece of space the arguments divide into as a solid, with neighbouring pieces sharing faces. A union, an intersection or a difference is then a choice of pieces. jig calls `BRepAlgoAPI_Fuse`, `BRepAlgoAPI_Cut` or `BRepAlgoAPI_Common` with one body as the argument and the feature's solids as tools (`booleanOp` in src/engine/ops.js), single-threaded, then merges same-domain faces and checks the volume (Section 20.5).

The running example is chapter 5's pair: $A$, a 40 × 30 × 20 mm box centred at the origin, and $B$, a cylinder of radius 12 mm and length 50 mm whose axis is the vertical line x = 20, on $A$'s right face.

## 20.2 Culling with boxes

$A$ has 6 faces and $B$ has 3, so there are 18 face pairs. Most cannot meet, and a cheap test finds them: if the axis-aligned bounding boxes of two faces do not overlap, the faces do not either. For $A$ and $B$, only 3 of the 18 box pairs overlap: $A$'s right, top and bottom faces against $B$'s side. Of the 54 pairs of an edge of one solid and a face of the other, 2 survive: the top and bottom edges of $A$'s right face, against the cylinder.

The saving grows with size. A plate with 40 holes has hundreds of face pairs between the plate and the hole tools, almost all far apart. Kernels store the boxes in a tree, so the candidates are found in roughly $(n + m) \log(n + m)$ steps plus the number of overlaps, rather than $n \cdot m$. Boxes aligned with the axes fit some faces badly: a thread's helical flank fills a box far larger than itself. jig switches OpenCascade to oriented boxes (`SetUseOBB`) for thread tools, which prunes many more pairs there.

## 20.3 Intersection

Each candidate pair is intersected. An **edge–face** intersection gives points: the two surviving edges of $A$ pierce the cylinder at (20, ±12, ±10). A **face–face** (surface–surface) intersection gives curves. For a plane and a cylinder they have closed forms: the plane x = 20 contains the cylinder's axis and cuts it in two lines, y = ±12; the planes z = ±10 are perpendicular to it and cut it in circles. Clipped to the faces, these are four section edges:

| edge | curve | length |
|---|---|--:|
| two | line x = 20, y = ±12, from z = −10 to 10 | 20 mm each |
| two | half circle of radius 12 at z = ±10, inside the box | 12π = 37.699 mm each |

`BRepAlgoAPI_Section` returns exactly these, 115.398 mm in all, with the four pierce points as their ends. Analytic pairs (planes, cylinders, cones, spheres, tori) mostly have such formulas. Freeform pairs do not: their intersection is traced by **marching**, stepping along the curve and correcting each step back onto both surfaces, and the result is stored as a B-spline within a tolerance. Marching is reliable while the surfaces cross at a good angle. Where they meet at a small angle θ, an error ε normal to each surface moves the curve by about ε / sin θ, and where they touch (θ = 0) the curve's position is not determined at all.

## 20.4 Splitting and classification

The section edges cut the faces they lie on. $A$'s top face is cut by a half circle into a half disc and the rest; its right face is cut by the two lines into three strips; $B$'s side is cut by all four edges into the part inside the box and the part outside. OpenCascade's General Fuse of $A$ and $B$ (`BRepAlgoAPI_BuilderAlgo`) returns 3 solids, of 19,476.106579, 4,523.893421 and 18,095.573685 mm³, with 14 faces, 23 edges and 14 vertices between them. Each face bounds one or two of the solids:

| piece | from | area mm² | bounds | inside the other solid |
|---|---|--:|---|---|
| left, front, back | $A$ | 600, 800, 800 | $A - B$ | no |
| top and bottom, outer parts | $A$ | 973.81 each | $A - B$ | no |
| right face, two outer strips | $A$ | 60 each | $A - B$ | no |
| right face, middle strip | $A$ | 480 | $A ∩ B$ and $B - A$ | yes |
| top and bottom, half discs | $A$ | 226.19 each | $A ∩ B$ and $B - A$ | yes |
| side, inside the box | $B$ | 753.98 | $A - B$ and $A ∩ B$ | yes |
| side, outside the box | $B$ | 3,015.93 | $B - A$ | no |
| two caps | $B$ | 452.39 each | $B - A$ | no |

The areas check by hand: a half disc is $\pi \cdot 12^2 / 2 = 226.19$, the inner half cylinder $\pi \cdot 12 \cdot 20 = 753.98$, the outer part $2\pi \cdot 12 \cdot 50 - 753.98 = 3015.93$.

**Classification** is the step that labels each piece in, out or on the other solid. In the General Fuse the label is visible in the table: a piece of $A$ inside $B$ separates two solids, $A ∩ B$ on one side and $B - A$ on the other, while a piece outside $B$ bounds only one. In general a kernel classifies one point of a piece, by casting a ray and counting crossings of the other solid's boundary or by looking at the neighbourhood of a point on it, and then spreads the label to adjacent pieces of the same face that are not separated by a section edge. Pieces that lie on the other solid's boundary (coplanar faces) are labelled "on" and need the two normals to decide: same direction for a shared face kept once in a union, opposite for two faces that cancel.

The three operations are then selections:

| result | pieces | faces | volume mm³ |
|---|---|--:|--:|
| $A ∪ B$ | the faces that bound exactly one solid | 10 | 42,095.573685 |
| $A ∩ B$ | the faces of $A ∩ B$ | 4 | 4,523.893421 |
| $A - B$ | the faces of $A - B$: $A$'s outside pieces and $B$'s inside piece | 8 | 19,476.106579 |

The pieces add up: 19,476.106579 + 4,523.893421 = 24,000 mm³, the box, and 18,095.573685 + 4,523.893421 = 22,619.467106 mm³, the cylinder. The union's volume is chapter 5's inclusion–exclusion value. jig does not expose OpenCascade's classifier; these labels come from the General Fuse solids.

## 20.5 Assembly and merging

The selected faces are joined into shells along their shared edges, the shells into solids, and the orientations fixed so that every normal points out of the result. In a difference, $B$'s inside piece keeps its geometry but is turned round: it becomes the concave wall of the cut, its outward normal pointing towards the cylinder's axis.

A result built this way can have several faces on one surface. Two 20 mm cubes side by side fuse into a 40 × 20 × 20 mm block whose top is still two squares, 10 faces in all. Merging **same-domain** faces, those on the same plane or cylinder and sharing an edge, leaves the 6 faces of a box. Two cubes offset by (10, 5, 0), with coplanar tops and bottoms, give 14 faces raw and 10 merged. jig calls `SimplifyResult(true, true, 1e-9)` after every boolean, which merges same-domain faces and edges while keeping the history (Section 20.8). It then compares the volume before and after; if they differ by more than a relative 10⁻⁷, it runs the boolean again without merging. It skips both steps when a tool has freeform faces, where merging seldom finds anything to do.

```figure
// view: axo
return j.part('p')
  .extrude(j.region.rect(20, 20), mm(20), { id: 'a' })
  .extrude(j.region.rect(20, 20, { at: [19.55, 0] }), mm(20), { id: 'b' })
```

**Figure 20.1.** Two 20 mm cubes overlapping by 0.45 mm, one line width, joined: 6 faces after merging and 20 · 20 · 39.55 = 15,820 mm³. The merged top keeps the name `a/end`, with `b/end` as an alias.

## 20.6 Robustness

A kernel decides topology from floating-point numbers, and floating point is not arithmetic: in JavaScript's doubles, 0.1 + 0.2 is 0.30000000000000004. A test such as "is this vertex on that face?" is the sign of a computed quantity near zero, and near zero the sign can be wrong. A single wrong answer can be survived; two inconsistent answers cannot. If one test says a point is on a face and another says the edge through it misses the face, the pieces no longer fit together, and the result has a gap or a dangling edge.

There are three ways out. **Exact predicates** evaluate the sign exactly, using as much precision as each case needs (Shewchuk, 1997). **Exact geometric computation** carries exact numbers through every construction (Yap, 1997), which is costly for curved surfaces. **Tolerances** declare everything within a distance ε to be on, and make every decision with the same ε. OpenCascade takes the third way, with the per-entity tolerances of Chapter 19: 10⁻⁷ mm by default, larger where an algorithm needs it.

The edge of the tolerance shows in a simple experiment. Two 20 mm cubes are placed side by side, the second moved so that they overlap by $d$ (a negative $d$ is a gap), and fused:

| d mm | solids | faces raw | faces merged | smallest raw face mm² | largest vertex tolerance mm |
|---|--:|--:|--:|--:|--:|
| −10⁻³ | 2 | 12 | 12 | 400 | 10⁻⁷ |
| −10⁻⁶ | 2 | 12 | 12 | 400 | 10⁻⁷ |
| −10⁻⁷ | 1 | 10 | 6 | 400 | 2 × 10⁻⁷ |
| −10⁻⁸ | 1 | 10 | 6 | 400 | 1.1 × 10⁻⁷ |
| 0 | 1 | 10 | 6 | 400 | 10⁻⁷ |
| 10⁻⁷ | 1 | 10 | 6 | 400 | 2 × 10⁻⁷ |
| 10⁻⁶ | 1 | 14 | 6 | 2 × 10⁻⁵ | 10⁻⁷ |
| 10⁻³ | 1 | 14 | 6 | 0.02 | 10⁻⁷ |
| 0.45 | 1 | 14 | 6 | 9 | 10⁻⁷ |

A gap of 10⁻⁶ mm leaves two solids. A gap of 10⁻⁷ mm, the default tolerance, is closed: the faces are taken as one and the vertices' tolerances grow to 2 × 10⁻⁷ mm to cover the gap. An overlap of 10⁻⁶ mm is real material: the slab where the cubes overlap has side faces 20 mm long and 10⁻⁶ mm wide, which are **slivers**, faces so thin that any later computation on them is near the tolerance. Here merging removes them, because they lie on the planes of the big faces; where they do not, they stay in the model. Volumes stay right throughout: 15,999.9996 mm³ at an overlap of 10⁻⁶ mm, which is $16000 - 400 \cdot 10^{-6}$. OpenCascade can also widen the tolerance for one operation (`SetFuzzyValue`), so that faces within that distance are treated as coincident; jig does not use it.

**Tangent contact** is harder still. Two surfaces that touch without crossing meet in a point or a curve where they are parallel, and a change below the tolerance turns "touch" into "miss" or "cross", with a different topology each time. Contact along an edge is the case chapter 5 reports as `boolean.nonManifold`.

The practical rule follows: keep every decision far from the tolerance. An overlap of 0.45 mm, one line width, is 4.5 million tolerances. The faces it creates are 9 mm² rather than 2 × 10⁻⁵, and the printed part is no different. [S-04](lab:preset/S-04) overlaps its spike and paddle by 1 mm for this reason.

## 20.7 Case study: a fillet that lost a feature

This happened while the book was being written. The part is a disc 40 mm across and 8 mm thick, a hub 16 mm across and 5 mm tall on its centre, and a crank peg 6 mm across and 14 mm tall at (12, 0). A 1 mm fillet round the root of the hub has its outer rim on the disc's top face at radius 8 + 1 = 9 mm. The crank's nearest point to the axis is at 12 − 3 = 9 mm. The rim circle and the crank's root circle touch at one point, (9, 0, 8): a tangent contact.

OpenCascade's `BRepFilletAPI_MakeFillet` reported success (`IsDone()` true, no faulty contours) and returned a solid with 6 faces instead of 8, without the crank. Scanning the radius finds how narrow the failure is:

| r mm | crank kept | faces | BRepCheck valid | volume mm³ |
|---|---|--:|---|--:|
| 0.8 | yes | 8 | yes | 11,461.304743 |
| 0.999 | yes | 8 | yes | 11,465.312599 |
| 1 − 5 × 10⁻⁸ | yes | 8 | yes | |
| 1 − 10⁻⁸ | no | 6 | no | |
| 1 | no | 6 | no | 11,068.108 |
| 1 + 10⁻⁹ | no | 6 | no | |
| 1 + 10⁻⁸ | yes | 9 | yes | |
| 1 + 10⁻⁷ | yes | 9 | yes | 11,465.336 |
| 1.5 | yes | 10 | yes | 11,479.381 |

Below 1 mm the fillet adds the ring of chapter 21's Pappus formula: at 0.8 mm, 7.057929 mm³ on top of the 11,454.246815 mm³ part, which matches the kernel to the last digit printed. Above 1 mm the rim crosses into the crank's root and the result gains faces: at 1 + 10⁻⁷ mm one of them is a sliver of 0.000979 mm², and at 1.5 mm two B-spline patches of 2.63 mm² each, where the blend meets the crank's side. Only within about 5 × 10⁻⁸ mm of the tangent radius is the crank lost.

The broken result shows how. The disc's top face had three loops: its outer circle, the hub's root circle and the crank's root circle. In the result, the hub's loop is replaced by a single loop of two edges: the fillet's rim, 56.549 mm long (2π · 9), and half of the crank's root circle, 9.425 mm long (3π), split at the tangent point. That half circle borders only the disc's top face, so the shell is open, and `IsDeleted` is true for both `crank/side[circle]` and `crank/end`. When the fillet rebuilt the trimmed top face from its edges, the two loops that touched at one point were traced as one, and the crank's faces, no longer joined to anything, were dropped. It is the same degeneracy as the tangent hole of [Chapter 19](lab:book/19), and the same loop-building step a boolean runs when it splits faces.

Nothing in OpenCascade's report flagged it. jig now checks every blend (`checkBlend` in ops.js): a fillet or chamfer rebuilds only the faces along its edges, so no other face may be deleted, and the result must pass `BRepCheck_Analyzer`. When faces are lost, jig retries at 0.98 and 1.02 times the radius; if either works, the radius is tangent rather than too large, and the compile fails with

```text
fillet.tangent: r = 1 mm puts the fillet's rim exactly on
crank/side[circle], crank/end, which OpenCascade then drops;
0.98 mm and 1.02 mm work · fix: r = 0.98 mm
```

The previous body stays on the sheet, crank included. If neither neighbour works, the diagnostic is `fillet.tooLarge` with the largest radius a bisection finds, as in chapter 5. The check reads history rather than volume because a volume computed from an open shell is a number without meaning (11,068.108 mm³ here), while `IsDeleted` names what was lost.

```figure
// view: axo
// select: hub-root/face[hub/side[circle] ∩ disc/end]
return j.part('p')
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5),
    { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] })
    .on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), mm(0.8),
    { id: 'hub-root' })
```

**Figure 20.2.** The hub with a 0.8 mm root fillet, selected: a torus face of 65.46 mm² whose rim stops 0.2 mm short of the crank. The part is 11,461.30 mm³ with 8 faces.

```sketch
// title: A fillet whose rim is tangent to the crank
// expect: fillet.tangent
// Read the diagnostic, then set r to 0.98 mm or 1.02 mm.
return j.part('p')
  .params({ r: mm(1) })
  .extrude(j.region.circle(20), mm(8), { id: 'disc' })
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5),
    { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] })
    .on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .fillet(j.feat('hub').edges().where(e => e.concave), 'r',
    { id: 'hub-root' })
```

> **Try it.** Open the sketch and read the diagnostic, then [set r to 1.02 mm](lab:param/r=1.02) and [select the crank](lab:select/crank/side[circle]): its side now meets the fillet.

## 20.8 History out of a boolean

A boolean reports what happened to each face of its inputs through three queries, the same ones a fillet answers. `Modified(f)` lists the faces that `f` became, `IsDeleted(f)` says whether nothing of it survives, and `Generated(f)` lists shapes of other kinds made from it. For chapter 5's pair:

| input face | in $A ∪ B$ | in $A - B$ |
|---|---|---|
| $A$'s left, front, back | unchanged | unchanged |
| $A$'s top, bottom | modified into 1 face (973.81 mm²) | the same |
| $A$'s right face | modified into 2 faces (60 mm² each) | the same |
| $B$'s side | modified into 1 face (3,015.93 mm²) | modified into 1 face (753.98 mm²) |
| $B$'s caps | unchanged | deleted |

`Generated` returns no faces for a boolean: from $A$'s right face it returns the two section lines, and from $B$'s side four section edges and four vertices. Faces come from faces; only blends make faces from edges.

jig turns this into names (`carryNames` in body.js):

- a face neither modified nor deleted keeps its name;
- a face modified into one face passes its name on;
- a face modified into several pieces names them `#a`, `#b`, … in order of their centres (by z, then y, then x);
- a deleted face's name disappears;
- when several old faces become one, as in a same-domain merge, the oldest name wins and the others are kept as aliases;
- a face no history reaches is called `<feature>/face#n`.

Figure 20.3 is the union above as a part: a block extruded 20 mm and a post of radius 12 mm on its right face, extruded 30 mm from z = −5 and joined. The block's right face becomes `block/side[rect.right]#a` and `#b`, 60 mm² each; the top keeps the name `block/end` at 973.81 mm²; the post's side keeps `post/side[circle]` at 1,507.96 mm², the part outside the block. As a cut instead (`op: 'cut'`), the post's caps disappear and `post/side[circle]` names the concave wall of 753.98 mm².

```figure
// view: axo
// select: block/side[rect.right]#a
return j.part('p')
  .extrude(j.region.rect(40, 30), mm(20), { id: 'block' })
  .extrude(j.region.circle(12, { at: [20, 0] })
    .on(j.plane.offset(j.plane.XY, -5)), mm(30), { id: 'post', op: 'join' })
```

**Figure 20.3.** A block and a post joined, with `block/side[rect.right]#a` selected: one of the two strips the post leaves of the block's right face. 10 faces, 33,047.79 mm³ = 24,000 + π · 12² · 30 − 4,523.89.

```sketch
// title: Names through a join and a cut
// Change op to 'cut' and find which names disappear.
return j.part('p')
  .extrude(j.region.rect(40, 30), mm(20), { id: 'block' })
  .extrude(j.region.circle(12, { at: [20, 0] })
    .on(j.plane.offset(j.plane.XY, -5)), mm(30), { id: 'post', op: 'join' })
```

jig keeps history for faces only. Edges are named from the two faces they separate, so the section edge between the post and the lower strip is `block/side[rect.right]#a ∩ post/side[circle]`, and the edges and vertices that `Generated` reports are not used. Split pieces are lettered by position, so the letters follow where the pieces are, not which side of the cutter they came from. A naming scheme could follow edges and vertices through `Modified` and `Generated` as it follows faces; jig does not.

> **Try it.** Open the join sketch, [select the lower strip](lab:select/block/side[rect.right]#a) and read its *Why*: piece a of a face split by a later feature, swept from `rect.right`.

## 20.9 Key points

- A B-rep boolean culls candidate pairs by bounding boxes, intersects them, splits faces and edges, classifies the pieces, assembles the result and merges same-domain faces.
- OpenCascade's General Fuse builds every piece; union, intersection and difference are selections. For chapter 5's box and cylinder: 3 solids, 14 faces, and 10, 4 and 8 faces selected.
- A piece that separates two General Fuse solids lies inside the other operand; the volumes of the pieces add up to each input exactly.
- jig merges same-domain faces after every boolean and redoes the boolean without merging if the volume changes.
- Within 10⁻⁷ mm OpenCascade treats faces as coincident; just above it, overlaps make slivers. Tangent contacts are the hardest case; an overlap of a line width keeps every decision far from the tolerance.
- A 1 mm fillet whose rim was tangent to a crank lost the crank without an error, but only within about 5 × 10⁻⁸ mm of that radius. jig now refuses any blend that deletes faces away from its edges, and reports `fillet.tangent` when a nearby radius works.
- `Modified`, `IsDeleted` and `Generated` give a boolean's history; jig turns it into names, lettering split pieces and keeping merged names as aliases.

## Exercises

> **Exercise.** In the workbench, cut chapter 5's cylinder from the box as a part (Figure 20.3's sketch with `op: 'cut'`). Predict the number of faces and the volume from the table of Section 20.4, then compile and compare.

> **Exercise.** For $A ∩ B$, list which of the 14 General Fuse faces are selected and which input face each came from. Which names would jig give them?

> **Exercise.** Move the second cube of Figure 20.1 so that the overlap is 0.0001 mm. Predict the face count and the volume from Section 20.6, then compile and compare. Which faces did merging remove, and how wide were they?

> **Exercise.** In the case study, the rim radius is 8 + r and the crank's nearest point 12 − 3. Find the tangent radius for a crank 8 mm across at (14, 0), and check in the workbench that jig reports `fillet.tangent` there.

## Further reading

- Requicha and Voelcker, *Boolean operations in solid modeling: boundary evaluation and merging algorithms*, Proceedings of the IEEE 73(1), 1985: the classify-and-merge pipeline for B-rep booleans.
- Mäntylä, *Boolean operations of 2-manifolds through vertex neighborhood classification*, ACM Transactions on Graphics 5(1), 1986: classification by the neighbourhood of a vertex, including the coplanar cases.
- Hoffmann, *Geometric and Solid Modeling: An Introduction*, Morgan Kaufmann, 1989: surface intersection and robustness in B-rep algorithms.
- Shewchuk, *Adaptive precision floating-point arithmetic and fast robust geometric predicates*, Discrete & Computational Geometry 18, 1997: exact signs at little cost.
- Kettner, Mehlhorn, Pion, Schirra and Yap, *Classroom examples of robustness problems in geometric computations*, Computational Geometry 40(1), 2008: small cases where floating point breaks geometric algorithms.
- [Chapter 6](lab:book/6) for the names this history feeds.
