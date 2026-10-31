---
part: VI · Inside the kernel
presets: A-01, M-06
docs: naming, reference
---
# B-rep from the inside

Chapter 5 counted a solid's vertices, edges, faces and loops and checked them with the Euler–Poincaré formula. This chapter opens the boundary representation those counts come from: how topology (what touches what) is kept apart from geometry (where it is), how OpenCascade stores a solid as a tree of shared, oriented sub-shapes, the classic data structures (winged edge, half-edge) and the Euler operators that build them, the odd edges curved surfaces need (seams, degenerate edges, curves in a face's parameter plane), and the tolerances and checks that hold it all together. One small body runs through the whole chapter and is listed completely. By the end you can read any jig body as OpenCascade stores it, explain why every edge is used exactly twice, and tell a valid solid from one that only passes the kernel's checks.

## 19.1 Topology and geometry

A B-rep stores two kinds of information. The **topology** is combinatorial: which faces a shell has, which loops bound a face, which edges make a loop, which vertices end an edge. The **geometry** is numerical: the surface a face lies on, the curve an edge follows, the point a vertex sits at. Topology says that the top face of a box meets the front face along one edge; geometry says the edge is the line from (−10, −10, 10) to (10, −10, 10).

The split matters because the two change at different times. Changing a box from 60 to 80 mm wide moves points and planes but leaves every adjacency as it was, which is why the names of Chapter 6 survive such edits: names are built on topology and history, never on coordinates. A fillet or a boolean changes the topology itself, and only those operations can make or lose faces.

The split also locates the difficulty. Topology is exact: an edge either is or is not in a loop. Geometry is floating point: the circle where a cylinder meets a plane is stored once in 3D and once more in the plane's own coordinates, and the two copies agree only to within a tolerance. Most of what follows is about keeping exact topology consistent with inexact geometry.

## 19.2 OpenCascade's shape hierarchy

OpenCascade (OCCT), the kernel jig runs in WebAssembly, has eight kinds of shape, from the top down:

| kind | what it is | its children |
|---|---|---|
| compound | any collection of shapes | any shapes |
| compsolid | solids glued along faces | solids |
| solid | a region of space | shells |
| shell | a connected set of faces | faces |
| face | a bounded piece of a surface | wires |
| wire | a connected chain of edges: a loop | edges |
| edge | a bounded piece of a curve | vertices |
| vertex | a point | none |

The classes live in two packages. **TopoDS** holds the topology: `TopoDS_Solid`, `TopoDS_Face`, `TopoDS_Edge` and so on, all kinds of `TopoDS_Shape`. **BRep** attaches the geometry and reads it back: `BRep_Tool.Surface(face)`, `BRep_Tool.Curve(edge, …)`, `BRep_Tool.Pnt(vertex)`, `BRep_Tool.Tolerance(…)`. A **wire** is what Chapter 5 called a loop.

A `TopoDS_Shape` is small: a pointer to a shared **TShape**, which holds the list of children and the geometry, plus a **location** (a rigid placement) and an **orientation**. Two shapes can point to the same TShape with different locations or orientations, and that is how sharing works (Section 19.4).

Every jig body is one `TopoDS_Solid` (src/engine/body.js). Its faces, edges and vertices are found with `TopExp_Explorer`, which walks the tree, and are kept in a `ShapeIndex` (src/engine/kernel.js) that drops repeats. Persistent names are stored in the same order as `body.faces`.

## 19.3 One body, completely

The body for this chapter is a 20 × 20 × 10 mm block with a hole 8 mm across through its centre:

```figure
// view: axo
// overlays: hidden
const sk = j.sketch('sk', { on: j.plane.XY })
  .rect('r', 20, 20, { center: true })
  .circle('c', 4)
return j.part('p').extrude(sk.profiles(), mm(10), { id: 'block' })
```

**Figure 19.1.** The worked body: a 20 × 20 × 10 mm block with an 8 mm hole. $V = 10$, $E = 15$, $F = 7$, $L = 9$, $S = 1$, $G = 1$, and the volume is $4000 - 16\pi \cdot 10 = 3497.35$ mm³.

Walking it with `TopExp_Explorer` gives one shell with 7 faces, 9 wires, 15 edges and 10 vertices. Every vertex has a tolerance of 10⁻⁷ mm:

| vertex | point | vertex | point |
|---|---|---|---|
| v0 | (−10, −10, 0) | v5 | (10, 10, 10) |
| v1 | (−10, −10, 10) | v6 | (−10, 10, 0) |
| v2 | (10, −10, 0) | v7 | (−10, 10, 10) |
| v3 | (10, −10, 10) | v8 | (4, 0, 0) |
| v4 | (10, 10, 0) | v9 | (4, 0, 10) |

The edges, each with its curve, its vertices and the two faces that use it:

| edge | curve | vertices | length | faces |
|---|---|---|--:|---|
| e0, e1, e4, e7 | line | v0 v1, v2 v3, v4 v5, v6 v7 | 10 | the vertical corners |
| e2, e5, e8, e10 | line | v0 v2, v2 v4, v4 v6, v6 v0 | 20 | a side and `block/start` |
| e3, e6, e9, e11 | line | v1 v3, v3 v5, v5 v7, v7 v1 | 20 | a side and `block/end` |
| e12 | line | v8 v9 | 10 | `block/side[sk.c]` twice: the seam |
| e13 | circle r 4 | v8 v8 | 25.133 | `block/side[sk.c]`, `block/start` |
| e14 | circle r 4 | v9 v9 | 25.133 | `block/side[sk.c]`, `block/end` |

The faces and their loops, each edge marked F or R for the direction the loop runs it (Section 19.4):

| face | surface | orientation | area mm² | loops |
|---|---|---|--:|---|
| f0 `block/side[sk.r.bottom]` | plane y = −10 | R | 200 | e0R e2F e1F e3R |
| f1 `block/side[sk.r.right]` | plane x = 10 | R | 200 | e1R e5F e4F e6R |
| f2 `block/side[sk.r.top]` | plane y = 10 | R | 200 | e4R e8F e7F e9R |
| f3 `block/side[sk.r.left]` | plane x = −10 | R | 200 | e7R e10F e0F e11R |
| f4 `block/side[sk.c]` | cylinder r 4 | F | 251.327 | e12F e14F e12R e13R |
| f5 `block/start` | plane z = 0 | R | 349.735 | e2R e10R e8R e5R; inner e13F |
| f6 `block/end` | plane z = 10 | F | 349.735 | e3F e6F e9F e11F; inner e14R |

Nine loops: one per face, plus an inner loop in each cap. The circles have a single vertex each, which an edge uses as both its start and its end, and the cylinder is closed up by the seam e12. Chapter 5's bore count (2 vertices, 3 edges, 1 face and 3 loops per hole) is this table's last three edges and the two inner loops.

```sketch
// title: The worked body
// Move the hole with { at: [3, 0] } on the circle; then try [6, 0].
const sk = j.sketch('sk', { on: j.plane.XY })
  .rect('r', 20, 20, { center: true })
  .circle('c', 4)
return j.part('p').extrude(sk.profiles(), mm(10), { id: 'block' })
```

## 19.4 Sharing and orientation

An edge between two faces is stored once and reached twice. `TopExp_Explorer` makes this visible: asked for the block's edges it visits 30, which are 15 edges each reached through two faces, and asked for vertices it visits 60, which are 10 unique ones. jig's `ShapeIndex` folds the repeats together by hashing each TShape with its location and comparing with `IsSame`.

OCCT has three tests of identity, and the edge e0 seen from its two faces tells them apart:

| test | compares | e0 from f0 vs e0 from f3 |
|---|---|---|
| `IsPartner` | the TShape | true |
| `IsSame` | TShape and location | true |
| `IsEqual` | TShape, location and orientation | false |

The two uses differ only in orientation: f0 runs e0 REVERSED and f3 runs it FORWARD. The same holds for every edge of the block. The 30 uses come in 15 pairs, each with one F and one R, and the seam e12 has both of its uses in the cylinder face. The location matters too: a copy of the block moved 30 mm with `moveShape` (a location, no new geometry) is still a partner of the original, but no longer the same; a copy made with `transformShape` builds new geometry and is not even a partner.

**Orientation** is relative to the geometry. A surface $S(u, v)$ has a parametric normal $\partial S / \partial u \times \partial S / \partial v$. A FORWARD face has its outward normal (pointing out of the material) along it; a REVERSED face has it pointing the other way. In the block:

| face | point | ∂S/∂u × ∂S/∂v | orientation | outward normal |
|---|---|---|---|---|
| `block/side[sk.r.bottom]` | (0, −10, 5) | (0, 1, 0) | R | (0, −1, 0) |
| `block/side[sk.c]` | (−4, 0, 5) | (1, 0, 0) | F | (1, 0, 0) |
| `block/start` | (0, 0, 0) | (0, 0, 1) | R | (0, 0, −1) |
| `block/end` | (0, 0, 10) | (0, 0, 1) | F | (0, 0, 1) |

The bore's surface parameters happen to give a normal pointing towards the axis, into the hole, which is out of the material, so the face is FORWARD. Nothing about a face's orientation can be read off the surface alone. jig reads outward normals this way: `faceInfo` flips the surface normal of a REVERSED face.

Loops are oriented too. Traverse a loop in the order and direction its edges are used, and draw its edges' curves in the face's (u, v) plane (Section 19.7). For a FORWARD face the outer loop runs counterclockwise, with the material on the left, and inner loops run clockwise. A REVERSED face has both reversed. The signed areas of the block's loops in their faces' parameter planes bear this out: +400 and −50.27 for `block/end`, −400 and +50.27 for `block/start`, −200 for each side, and +62.83 = 2π · 10 for the bore, whose (u, v) rectangle is 2π wide and 10 high.

```figure
// view: axo
// overlays: normals
// select: block/side[sk.c]
const sk = j.sketch('sk', { on: j.plane.XY })
  .rect('r', 20, 20, { center: true })
  .circle('c', 4)
return j.part('p').extrude(sk.profiles(), mm(10), { id: 'block' })
```

**Figure 19.2.** Outward normals on the block, with the bore selected. Its outward normal points into the hole; the face is FORWARD because its surface's parametric normal points the same way.

> **Try it.** Open the sketch of Section 19.3, turn on [the normals overlay](lab:overlay/normals) and [select the bore](lab:select/block/side[sk.c]). Then [show the IR](lab:show/ir) and read the counts at level L4.

## 19.5 Winged edges and half-edges

The pairing of uses is what the classic B-rep data structures are built on. Baumgart's **winged-edge** structure (1975) stores, for each edge, its two vertices, its two faces and four "wing" edges: the next and the previous edge round each of the two faces. Each vertex and each face points to one edge. Walking round a face means following wings, choosing at each edge the side that belongs to the face, so every step must first ask which way round the current edge is used.

The **half-edge** structure removes that question by splitting each edge into two oppositely directed half-edges, one for each use. Mäntylä (1988) builds a whole modeller on it:

```js
// half-edge records, after Mäntylä (1988)
Solid  { faces, edges, vertices }
Face   { solid, outer: Loop, inner: [Loop] }
Loop   { face, first: HalfEdge }
HalfEdge { loop, start: Vertex, next, prev, edge }
Edge   { he1: HalfEdge, he2: HalfEdge }   // the twin of he1 is he2
```

The block has 15 edges, so 30 half-edges: exactly the 30 oriented edge uses the explorer visits. OCCT's oriented edge inside a wire is a half-edge in all but storage: it has a direction and a loop, but no pointer to its twin. To find the other face of an edge, OCCT code builds a map from edges to the faces that use them, and jig does the same in `Body.edgeFaces`, walking every face's edges and looking each up in the `ShapeIndex`. `edgeFaces` records at most two faces per edge, which is all a manifold solid needs; a seam shows up as `[i, i]`.

In a closed, manifold shell each edge has exactly two uses. Edges used by three or more faces, or solids touching along an edge, are **non-manifold**. Weiler's work on edge-based structures (1985) and his later radial-edge structure handle them by ordering all the uses round an edge. jig does not represent non-manifold bodies: a join whose solids only touch along an edge stays two bodies with the warning `boolean.nonManifold` (Chapter 5).

## 19.6 Euler operators

A modeller that edits half-edges directly can easily leave a dangling edge or an unclosed loop. **Euler operators** are a small set of edits, each of which keeps the Euler–Poincaré formula $V - E + F - R - 2(S - G) = 0$, with $R = L - F$ the number of inner loops (rings). Each changes the six counts by a fixed vector:

| operator | name | ΔV | ΔE | ΔF | ΔR | ΔS | ΔG |
|---|---|--:|--:|--:|--:|--:|--:|
| mvfs | make vertex, face, shell | 1 | 0 | 1 | 0 | 1 | 0 |
| mev | make edge, vertex | 1 | 1 | 0 | 0 | 0 | 0 |
| mef | make edge, face | 0 | 1 | 1 | 0 | 0 | 0 |
| kemr | kill edge, make ring | 0 | −1 | 0 | 1 | 0 | 0 |
| kfmrh | kill face, make ring and hole | 0 | 0 | −1 | 1 | 0 | 1 |
| mekr | make edge, kill ring | 0 | 1 | 0 | −1 | 0 | 0 |

Each row satisfies $ΔV - ΔE + ΔF - ΔR - 2(ΔS - ΔG) = 0$, so any sequence of them does too; each has an inverse (kvfs, kev, kef, mekr, mfkrh, kemr). Mäntylä shows that the set is complete: every valid topology of a closed orientable surface can be built with them.

The worked block takes 21 operators. Start with mvfs, the smallest B-rep there is (one vertex, one face, no edges). Three mev and one mef draw the bottom square: a flat **lamina** of two faces back to back, $V = 4$, $E = 4$, $F = 2$. Four mev raise the vertical edges and four mef close the side faces: the box, $V = 8$, $E = 12$, $F = 6$. In the bottom face, mev draws a bridge edge from a corner to a new vertex, mef draws the circle round that vertex and so makes a disc face, and kemr deletes the bridge, leaving the circle as a ring of the bottom face: $V = 9$, $E = 13$, $F = 7$, $R = 1$. The same three on the top give $V = 10$, $E = 14$, $F = 8$, $R = 2$. Then kfmrh deletes the top disc and makes its circle a ring of the bottom disc, which turns that disc into the wall of a tube and raises the genus: $F = 7$, $R = 3$, $G = 1$. Last, mekr adds the seam from the bottom circle's vertex to the top's, joining the tube's two loops into one: $V = 10$, $E = 15$, $F = 7$, $R = 2$, $S = 1$, $G = 1$. These are the kernel's counts, with $L = F + R = 9$, and the formula holds after every one of the 21 steps (checked in Python).

Euler operators guarantee topological validity only. Where the vertices go is a separate step, and a valid topology can carry impossible geometry, such as faces that pass through each other. OCCT does not build shapes with Euler operators: its algorithms assemble TopoDS shapes directly and are checked afterwards (Section 19.9). jig exposes neither.

## 19.7 Seams, degenerate edges and pcurves

A face is the image of a region of its surface's (u, v) plane, and every edge of a face has a curve in that plane as well as in 3D. The plane curve is a **pcurve** (parametric curve): `BRepAdaptor_Curve2d(edge, face)` reads it back. In the worked block, the circle e13 is a circle of radius 4 about (0, 0) in the bottom face's parameter plane, and a line from (0, 0) to (2π, 0) in the bore's. The pair (3D curve, pcurve) is **same-parameter** when one parameter value gives the same point on both, within the edge's tolerance; every edge of the block reports `SameParameter` true.

A cylinder's (u, v) plane is periodic in u, and a face that goes all the way round needs a cut. The **seam** e12 is that cut: one edge, used twice by the same face, FORWARD with the pcurve u = 0 and REVERSED with the pcurve u = 2π. The bore's loop is the rectangle e12F, e14F, e12R, e13R in (u, v), which closes even though the face does not end in 3D.

A sphere needs more. Its parameters are longitude u and latitude v, and the whole line v = π/2 of the parameter rectangle maps to one point, the north pole. OCCT bounds the face there with a **degenerate edge**: an edge with a pcurve (the segment from (0, π/2) to (2π, π/2)) but no 3D length, whose two ends are the same vertex. A cone has one at its apex. A torus is periodic in both parameters and needs two seams that cross at its only vertex:

| solid | edges in OCCT | of which degenerate | V | E counted | F | L | G |
|---|---|--:|--:|--:|--:|--:|--:|
| sphere r 10 | 3: seam, two poles | 2 | 2 | 1 | 1 | 1 | 0 |
| cone r 10, h 15 | 3: seam, base circle, apex | 1 | 2 | 2 | 2 | 2 | 0 |
| torus 10, 3 | 2: two seams | 0 | 1 | 2 | 1 | 1 | 1 |

Degenerate edges are a convenience of the parameter plane, not boundaries of the solid, and an Euler count must leave them out. Counted with them, the sphere would give $2 - 3 + 1 = 0$ and a genus of 1, the cone an odd sum and a genus of 0.5. jig's `Body.topology` skips edges for which `BRep_Tool.Degenerated` is true, and gets $2 - 1 + 1 = 2 = 2(S - G)$ with $G = 0$ for the sphere; the counts above are the ones it reports.

```figure
// view: axo
return j.part('p')
  .add(j.sphere(mm(10)), { id: 'ball' })
  .add(j.cone(mm(10), mm(0), mm(15)),
    { id: 'cone', at: j.tx.move(30, 0, -10) })
  .add(j.torus(mm(10), mm(3)), { id: 'ring', at: j.tx.move(65, 0, 0) })
```

**Figure 19.3.** A sphere (4,188.79 mm³ = 4π · 10³ / 3), a cone (1,570.80 mm³) and a torus (1,776.53 mm³ = 2π² · 10 · 3²). The sphere has two degenerate edges and the cone one; the torus has two seams and a single vertex. Their genera are 0, 0 and 1.

## 19.8 Tolerances

OCCT's basic distance is `Precision::Confusion()` = 10⁻⁷ in model units, millimetres in jig: two points closer than that are the same point. Its companions are `Precision::Angular()` = 10⁻¹² rad and `Precision::PConfusion()` = 10⁻⁹ for parameters. jig records "1e-7 mm" as its kernel tolerance in its cache keys and sets no extra (fuzzy) tolerance on booleans.

Beyond the global value, every vertex, edge and face carries its own **tolerance**, which says how far its geometry may be from where the topology says it is. A vertex's tolerance is the radius of a ball that must contain the ends of every edge that meets there; an edge's is the radius of a tube round its 3D curve that must contain the images of its pcurves; a face's bounds the distance of its edges from its surface. Each therefore contains the one below it, and the convention is tol(face) ≤ tol(edge) ≤ tol(vertex). Across five bodies of the presets A-01, M-06, S-04 and W-04, all 2,368 incident vertex–edge and edge–face pairs obey it.

Tolerances start at 10⁻⁷ mm and grow where an algorithm could not do better. In the worked block every one is 10⁻⁷. In the box of [A-01](lab:preset/A-01), shelled with a 2 mm wall, the 16 vertices of the offset inner faces carry 10⁻³ mm, the value jig's `shell` passes to OCCT's offset algorithm, while the 16 outer vertices keep 10⁻⁷. The threaded parts of [M-06](lab:preset/M-06), made by sweeping and sewing, have edges with tolerances up to 5 × 10⁻⁶ mm. This is **tolerant modelling**: rather than demand that geometry close exactly, the kernel records how far apart it is allowed to be and treats everything within that distance as touching. A gap smaller than a vertex's tolerance is no gap; a gap larger is a hole in the shell.

Large tolerances cost accuracy downstream. A boolean against a face whose edges carry 10⁻³ mm treats anything within a micrometre of them as touching, and jig does not tighten or repair tolerances after a feature. For printed parts, where a line is 0.4 mm wide, a micrometre does no harm.

## 19.9 Validity

`BRepCheck_Analyzer` checks a shape sub-shape by sub-shape: vertices lie within tolerance of the curves through them, an edge's 3D curve and pcurves agree, wires are closed and do not cross themselves in their face's parameter plane, a face's loops neither cross nor sit the wrong way round, and a shell is closed and consistently oriented. jig runs it (`isValid` in kernel.js) after every fillet, chamfer and shell and on stacked threads, and refuses a result that fails. It does not run it after booleans, where it would cost time on every feature; the boolean's own checks are described in Chapter 20.

Rebuilding the block's solid by hand from its faces shows what the analyzer catches:

| solid assembled from | valid | volume mm³ |
|---|---|--:|
| all seven faces | yes | 3,497.35 |
| six faces, `block/end` left out | no | |
| `block/end` reversed | no | |
| all seven faces reversed | yes | −3,497.35 |

The last row is a valid shape that is not the block: its outward normals all point inwards, so it is everything except the block, and its volume integral is negative. Local checks cannot see that; a global one can. jig's thicken feature looks for exactly this and reverses solids whose volume comes out negative.

The Euler–Poincaré formula is another global check, and it catches a case the analyzer misses. Move the hole of Section 19.3 to `{ at: [6, 0] }`, so that its circle touches the block's right side at (10, 0). The region "square minus a tangent disc" has a boundary that touches itself at one point, and no manifold solid has that as its cross-section. OpenCascade extrudes it anyway, into two bodies: a disc of 502.65 mm³ and a block of 4,502.65 mm³, larger than the 4,000 mm³ box it is cut from, because each cap's single loop runs round the square and then round the circle in the same sense. The analyzer passes the block. Its counts, $V = 10$, $E = 17$, $F = 8$, $L = 8$, give $V - E + F - (L - F) = 1$, an odd number, where every closed orientable surface gives an even one: the genus would be 0.5.

jig solves the genus from the counts and checks that it comes out a whole number. Here it does not, so the IR marks the formula with ✗ and the compile warns `brep.invalid: body1 is not a valid solid: V − E + F − (L − F) = 1 gives genus 0.5, which is not a whole number`, with the fix to look for curves that only touch and to overlap or separate them. The check is necessary, not sufficient: the inside-out solid above has a whole-number genus. Volume against the stock and an even Euler characteristic together catch both cases.

## 19.10 Key points

- Topology (adjacency) is exact; geometry (surfaces, curves, points) is floating point; validity is the agreement of the two within tolerances.
- OCCT shapes form a tree: compound, compsolid, solid, shell, face, wire, edge, vertex. A `TopoDS_Shape` is a shared TShape plus a location and an orientation.
- In a closed manifold shell every edge is used twice, once FORWARD and once REVERSED: the 15 edges of the worked block are 30 half-edges.
- Winged-edge and half-edge structures store those uses; Euler operators edit them while keeping $V - E + F - R - 2(S - G) = 0$. The block takes 21 operators.
- Closed surfaces need seam edges (used twice by one face) and, at poles and apexes, degenerate edges with no length; every edge on a face has a pcurve in its (u, v) plane.
- Each vertex, edge and face has its own tolerance, 10⁻⁷ mm by default, nested face ≤ edge ≤ vertex; A-01's shell leaves 10⁻³ mm on its inner vertices.
- `BRepCheck_Analyzer` checks local consistency; an inside-out solid and a tangent-hole extrusion pass it. jig adds a whole-number-genus check (`brep.invalid`); volume catches the inside-out case.

## Exercises

> **Exercise.** Write the Euler-operator sequence for the block with two separate through holes. How many operators does it take, and what are the final $V$, $E$, $F$, $R$, $G$? Compile it in the workbench and compare with the IR.

> **Exercise.** In the workbench, return `j.part('c').add(j.cyl(mm(5), mm(20)), { id: 'pin' })`. Predict its vertices, edges (which one is the seam?), faces and loops, then read them at IR level L4.

> **Exercise.** The bore's loop has signed area 2π · 10 in its (u, v) plane and the face has area 251.33 mm². Explain the factor between them, and say what the parameter area of a cone's side face would be.

> **Exercise.** In the sketch of Section 19.3, move the hole to `{ at: [5.9, 0] }`, then `[6, 0]`, then `[6.1, 0]`. For each, record the number of bodies, the volume, the genus in the IR and any warning, and explain each result.

## Further reading

- Baumgart, *A polyhedron representation for computer vision*, AFIPS National Computer Conference, 1975: the winged-edge structure.
- Weiler, *Edge-based data structures for solid modeling in curved-surface environments*, IEEE Computer Graphics and Applications 5(1), 1985: why edge-based structures suit curved surfaces, and their trade-offs.
- Mäntylä, *An Introduction to Solid Modeling*, Computer Science Press, 1988: the half-edge structure, Euler operators with proofs, and a complete modeller built on them.
- Stroud, *Boundary Representation Modelling Techniques*, Springer, 2006: a modern account of B-rep data structures, tolerances and checking, from a kernel author.
- Hoffmann, *Geometric and Solid Modeling: An Introduction*, Morgan Kaufmann, 1989: B-reps alongside CSG, with the geometric computations they rest on.
- [Chapter 6](lab:book/6) for the persistent names built on this topology.
