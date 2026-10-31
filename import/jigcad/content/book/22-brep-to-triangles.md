---
part: VI · Inside the kernel
presets: M-09, M-07
docs: printing, reference
---
# From B-rep to triangles

The kernel's solids are exact: a peg is a cylinder of radius 2.5 mm, its root fillet a torus. The screen, the slicer and the STL file all want triangles instead. This chapter explains how jig turns faces into triangles and what that costs: how many segments a circle gets for a given error, how much volume an inscribed mesh loses, what STL, 3MF and STEP each keep, when a mesh is a closed surface, how mass properties differ when computed exactly and from triangles, why a distance between meshes can miss two solids that overlap and how jig's check was fixed, and how a slice is cut from a mesh. By the end you can choose a tolerance for a given error, predict a mesh's volume loss, check a mesh for holes, and know when to trust a check made on triangles.

## 22.1 Tessellation and its two tolerances

**Tessellation** replaces each face of a B-rep by triangles whose vertices lie on the face. Every edge is first divided into segments, once, and both faces that share the edge use the same points; then each face's interior is triangulated between them. Because the vertices lie on the surface, the triangles cut inside a convex surface and outside a concave one, like a polygon **inscribed** in a circle.

Two tolerances control the result. The **chordal deviation** $\varepsilon$ (linear deflection) bounds the distance between a chord or triangle and the surface it replaces. The **angular deflection** $\alpha$ bounds the angle between the normals at the ends of a segment. jig meshes every body with OpenCascade's mesher, a linear deflection of 0.1 % of the body's bounding-box diagonal clamped to 0.05–0.2 mm, and an angular deflection of 0.3 rad (src/engine/mesh.js). The filleted peg of [Chapter 21](lab:book?ch=21), 30 × 30 × 13 mm, gets $\varepsilon = 0.05$ mm.

For a circle of radius $r$, a chord that subtends the angle $\theta$ leaves a gap at its middle, the **sagitta**, of $s = r(1 - \cos\tfrac{\theta}{2})$. Keeping $s \le \varepsilon$ allows $\theta \le 2\arccos(1 - \varepsilon/r)$, so a full circle needs

$$
n = ⌈\frac{\pi}{\arccos(1 - \varepsilon/r)}⌉ \approx \pi\sqrt{\frac{r}{2\varepsilon}}
$$

segments. The count grows with the square root of the radius: four times the radius, twice the segments. Counting the vertices on the top rim of meshed cylinders, with the angular criterion switched off ($\alpha = 3$ rad) and $\varepsilon = 0.05$ mm:

| $r$ | $n$ for $\varepsilon$ | $n$ for $\varepsilon/2$ | measured |
|--:|--:|--:|--:|
| 0.5 mm | 7 | 10 | 10 |
| 2.5 mm | 16 | 23 | 23 |
| 10 mm | 32 | 45 | 45 |
| 40 mm | 63 | 89 | 89 |

Every circle measured, these four and ten more at other radii and deflections, matches the formula with $\varepsilon/2$: the mesher in this build keeps edge chords within half the deflection it is given. With jig's default angular deflection, each segment subtends at most 0.15 rad, so no circle gets fewer than $⌈2\pi / 0.15⌉ = 42$ segments. Small holes are therefore limited by angle and large circles by chord; at $\varepsilon = 0.05$ mm the crossover is near $r = 9$ mm. With the defaults the counts are 42 for radii from 0.5 to 5 mm, 45 at 10 mm, and 59 for a Ø80 disc, whose larger diagonal raises $\varepsilon$ to 0.114 mm. The peg's rim gets 42 segments, with a sagitta of 0.0070 mm.

```figure
// view: plan
return j.part('disc').extrude(j.region.circle(40), mm(10), { id: 'disc' })
```

**Figure 22.1.** A Ø80 × 10 mm disc. Its bounding-box diagonal of 113.6 mm sets the deflection to 0.114 mm, and the mesh divides each circle into 59 chords with a sagitta of 0.057 mm.

## 22.2 What an inscribed mesh loses

A regular $n$-gon inscribed in a circle has area $\tfrac{n}{2}r^2\sin\tfrac{2\pi}{n}$, so it keeps the fraction $\sin(2\pi/n)/(2\pi/n)$ of the disc. A meshed cylinder is a prism on that polygon, and its relative volume loss is

$$
1 - \frac{\sin(2\pi/n)}{2\pi/n} \approx \frac{(2\pi/n)^2}{6} = \frac{4}{3}\cdot\frac{s}{r} ,
$$

the same two-thirds-of-the-sagitta per unit perimeter that made the dome of [Chapter 8](lab:book?ch=8) 258 mm³ short. Measured with signed tetrahedra (Section 22.5):

| cylinder | $n$ | predicted loss | measured loss | relative |
|---|--:|--:|--:|--:|
| $r$ = 2.5 mm, $h$ = 10 mm, defaults | 42 | 0.7316 mm³ | 0.7316 mm³ | 0.37 % |
| the same, angle off | 23 | 2.4331 mm³ | 2.4331 mm³ | 1.24 % |
| $r$ = 40 mm, $h$ = 10 mm, defaults | 59 | 94.9572 mm³ | 94.9570 mm³ | 0.19 % |
| the same, $\varepsilon$ = 0.05 mm, angle off | 89 | 41.7436 mm³ | 41.7443 mm³ | 0.08 % |

A sphere loses more for the same chord, because its triangles fall short in two directions: the default mesh of a sphere of radius 5 mm holds 515.872 mm³ of its 523.599 mm³ (1.48 % less), and one of radius 20 mm 0.51 % less. A concave surface does the opposite: the chords of a root fillet's quarter circle lie in the air, so the mesh adds material there.

The deflection is a setting, not a guarantee, and the STL and 3MF export reports say so: `B-rep → mesh at a linear deflection setting of 0.050 mm (curved faces can stray about twice that)`. Sampling every triangle of the filleted peg's mesh against the exact cylinder and torus gives a largest distance of 0.0070 mm. The default mesh of the Ø10 mm sphere, whose largest triangles near the equator have 2 mm edges, is 0.099 mm inside the sphere: twice the setting.

```figure
// view: axo
return j.part('ball').add(j.sphere(mm(5)), { id: 'ball' })
```

**Figure 22.2.** A sphere of radius 5 mm. Meshed at the default deflection of 0.05 mm it holds 515.872 mm³ of its exact 523.599 mm³, and its largest triangles, near the equator, lie up to 0.099 mm inside the surface.

## 22.3 STL, 3MF and STEP

The three export formats keep different things, and each export returns a report that says which.

**STL** is a list of triangles and nothing else. The binary form jig writes has an 80-byte header, a 4-byte count, and 50 bytes per triangle: a normal and three vertices as 32-bit floats, and two unused bytes. The filleted peg is 1,104 triangles, so 84 + 50 × 1,104 = 55,284 bytes. STL stores no units, so the report lists them as dropped (`units (assumed mm)`), and no shared vertices: each triangle carries its own three, 3,312 in all.

**3MF** is a ZIP package of XML whose model declares `unit="millimeter"` and lists vertices once with triangles that index them; jig adds the plates and print settings as metadata. Its mesh starts as jig's display mesh, in which each face keeps its own vertices: 710 vertices for the peg, of which 554 are distinct positions. The 3MF core specification asks that every triangle edge share its two vertices with exactly one other triangle, so that the mesh is closed by its indices. So the writer welds vertices whose written coordinates are equal before it writes them, which is the merge of Section 22.4, and the peg's file holds the 554 vertices of a closed mesh.

**STEP** (ISO 10303) exchanges the exact B-rep. The peg's file is about 22,000 characters and holds 9 `ADVANCED_FACE` entities on 7 planes, a `CYLINDRICAL_SURFACE` of radius 2.5 and a `TOROIDAL_SURFACE` with radii 3.5 and 1: the fillet of Figure 21.1, not an approximation of it.

| format | report: kept | approximated | dropped |
|---|---|---|---|
| STL | geometry | B-rep → mesh | units, names, colours, plates, settings |
| 3MF | units, plates, part names, settings | B-rep → mesh | history, names, joints |
| STEP | exact B-rep, units | nothing | names, plates, settings, fit provenance, history |

Send STEP to another CAD program, 3MF to a slicer, and STL only to a program that reads nothing else.

## 22.4 Watertight and manifold

A triangle mesh bounds a solid only if it is a closed surface. It is **watertight** when every edge belongs to at least two triangles, so there are no holes; **manifold** when every edge belongs to exactly two and the triangles round each vertex form a single fan; and **consistently oriented** when the two triangles at each edge traverse it in opposite directions, so that all normals point outwards. For a closed, oriented, manifold surface of genus $g$, the counts of vertices, edges and triangles satisfy the Euler–Poincaré relation of [Chapter 5](lab:book?ch=5) for a polyhedron:

$$
V - E + F = 2 - 2g .
$$

Before vertices are merged, the peg's mesh has 1,506 edges used twice and 300 used once, the edges along B-rep edges, where two faces' triangulations meet at duplicated vertices. Merging vertices whose 32-bit coordinates are identical leaves 554 vertices, 1,656 edges and 1,104 triangles. Every edge is then used exactly twice, in opposite directions, and $554 - 1656 + 1104 = 2$: a closed, oriented sphere-like surface, genus 0, as the solid is. The STL file merges to the same 554 vertices. The merge works with exact equality, without a tolerance, because each B-rep edge was divided once and both faces took the same points.

A mesh made some other way has no such guarantee: two scanned surfaces overlap, a mesh boolean leaves a sliver triangle, two cubes that share only an edge give that edge four triangles. Slicers repair such files by heuristics. jig's meshes come from valid B-reps, and solids that would touch along an edge stay separate bodies with a `boolean.nonManifold` warning.

## 22.5 Mass properties, exactly and from triangles

The **divergence theorem** turns a volume integral into a surface integral: for a vector field $F$, the integral of $\nabla \cdot F$ over a solid equals the flux of $F$ through its boundary surface $S$, $\int \nabla \cdot F\,dV = ∮ F \cdot n\,dA$. With $F = x/3$, whose divergence is 1,

$$
V = \frac{1}{3} ∮ x \cdot n\,dA ,
$$

and fields such as $(x^2/2, 0, 0)$ give the first moments, hence the centroid, and cubic fields the second moments. OpenCascade evaluates these surface integrals face by face, by Gauss quadrature over each face's parameter domain; on the parts of this book the result matches the closed forms to ten digits. That is jig's `volume`, `area` and `mass`, marked `fidelity: exact`.

A mesh applies the same theorem to flat triangles. Join each triangle $(a, b, c)$ to the origin: the **signed tetrahedron** has volume $\tfrac{1}{6}\,a \cdot (b \times c)$, positive when the triangle faces away from the origin and negative when it faces towards it, and the signed volumes sum to the enclosed volume wherever the origin is. The centroid is the volume-weighted mean of the tetrahedra's centroids $(a + b + c)/4$, and the second-moment matrix of a tetrahedron with one vertex at the origin is $\tfrac{V}{20}(aa^T + bb^T + cc^T + ss^T)$ with $s = a + b + c$.

For the filleted peg, with unit density (inertia in mm⁵) and inertia about axes through the centroid:

| | exact (B-rep) | mesh, defaults (1,104 triangles) | mesh, $\varepsilon$ = 0.002 mm (6,980) |
|---|--:|--:|--:|
| volume | 2,900.021684 mm³ | 2,899.3242 mm³ | 2,899.9402 mm³ |
| relative error | | −0.024 % | −0.0028 % |
| centroid height | 1.942263 mm | 1.94075 mm | 1.94206 mm |
| inertia about x | 214,221.328 | 214,186.272 | 214,216.498 |
| inertia about z | 405,641.224 | 405,636.861 | 405,640.746 |

The exact centroid has a hand check: $(2700 \cdot 1.5 + 196.3495 \cdot 8 + 3.672143 \cdot 3.223368) / 2900.021684 = 1.942263$ mm, the plate, the peg and the fillet ring at $3 + c̄$. The mesh loses mostly round the peg, so its centroid sits a little low, and the inertia about z, dominated by the plate's flat sides, which the mesh represents exactly, is the best of the three. jig reports volume, area and mass as metrics; it does not expose the centroid or the inertia tensor, which were computed here in a scratch script.

## 22.6 Distances between meshes

An assembly's `.interference()` measures the gap between every pair of components ([Chapter 9](lab:book?ch=9)). Pairs whose boxes are far apart are ruled out by box; bodies made only of planes, cylinders, cones, spheres and tori, up to 400 faces a pair, get the exact B-rep distance; freeform bodies such as gears get a distance between their display meshes, shown with `≈`, unless `{ exact: true }` asks for the B-rep everywhere.

The mesh distance used to be the smallest distance from a vertex of either mesh to a triangle of the other. For disjoint meshes it errs only upwards: the true minimum is attained vertex to triangle or edge to edge, and it misses the second case. For meshes that pass through each other it is wrong. Where two closed surfaces cross, the distance is 0 along the crossing curve, and that curve runs through the interiors of triangles of both meshes, away from every vertex.

The case that showed it is the peg of Figure 21.1 inside the Ø5.3 mm bore of a 24-tooth gear 4 mm thick, its underside 0.2 mm above the plate. At that height the root fillet's torus has radius $3.5 - \sqrt{1 - 0.8^2} = 2.9$ mm, wider than the 2.65 mm bore, and the two solids overlap in a thin ring from $z = 3.2$ to 3.473 mm. The fillet's mesh has rows of vertices at $z$ = 3.2443, 3.3451, 3.4594 and 3.5846 mm, and the gear's bore rim lies inside the fillet; but every vertex is at a positive distance from the other mesh's surface. The nearest, at $z = 3.4594$ mm and radius 2.6587 mm, is 0.0087 mm beyond the bore's 42-sided polygon, inside the gear. The vertex-only distance is 0.0087 mm: a clearance, for a pair that overlaps. The exact check reports 0.000 mm and the error `b and g touch or overlap`.

Two triangles in general position intersect exactly when an edge of one crosses the interior of the other. So the fix tests edges against triangles. For an edge from $p$ to $q$ and a triangle $(a, b, c)$, solve

$$
p + w(q - p) = a + u(b - a) + v(c - a)
$$

for $(u, v, w)$ by Cramer's rule, the Möller–Trumbore method; they cross when $u > 0$, $v > 0$, $u + v < 1$ and $0 < w < 1$, with a margin of $10^{-9}$ so that touching at a vertex or along an edge does not count. jig puts each mesh's triangles in a uniform grid of cells, walks each edge of the other mesh in steps of half a cell, tests the triangles in the cells it passes, and sets the gap to 0 when any edge crosses. The peg and gear now report `≈ 0.000 mm` and `asm.interference`, which engine test 42 checks.

The crossing test runs for every pair that reaches the mesh path, not only when a vertex comes near: a 2 × 2 mm pin pushed straight through the web of a 30-tooth gear has no vertex within 1.8 mm of the other mesh (its own are 7 mm from the gear's faces), and it is found by its long edges crossing the gear's side faces. One solid wholly inside the other crosses nothing, so a last test casts a ray from one vertex of each mesh, slightly skewed so that it misses edges and vertices, and counts the triangles of the other mesh it crosses: an odd count means inside. A 2 mm cube buried in the gear's web is found that way. Both report `≈ 0.000 mm` and `asm.interference`, as `{ exact: true }` does. Coplanar triangles are left to the distance pass, which sees them at distance 0. For the peg and gear the exact check takes about a third of a second.

```figure
// view: front
const peg = j.part('peg')
  .extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10),
    { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })
const collar = j.part('collar')
  .extrude(j.region.circle(8), mm(4), { id: 'ring' })
  .hole([[0, 0]], j.hole.simple(mm(5.3)), { id: 'bore' })
  .chamfer(j.feat('bore').edges().where(e => e.center.z < 0.1), mm(1),
    { id: 'lead-in' })
return j.assembly('a').add('peg', peg, { ground: true })
  .add('collar', collar, { at: j.tx.move(0, 0, 3.2) }).interference()
```

**Figure 22.3.** The filleted peg in a Ø5.3 mm collar 0.2 mm above the plate, with a 1 mm lead-in chamfer on the bore's lower edge. Both parts are planes, cylinders, cones and a torus, so the check is exact: the gap is 0.150 mm, the radial clearance. Without the chamfer it is 0.000 mm and `asm.interference`.

```sketch
// title: A filleted peg through a gear's bore
// expect: asm.interference
// The mesh check sees the overlap. Remove the fillet: ≈ 0.150 mm.
const g = j.lib.gear.spur({ module: mm(1), teeth: 24, width: mm(4) })
  .hole([[0, 0]], j.hole.simple(mm(5.3)), { id: 'bore' })
const b = j.part('b')
  .extrude(j.region.rect(30, 30), mm(3), { id: 'plate' })
  .extrude(j.region.circle(2.5).on(j.plane.offset(j.plane.XY, 3)), mm(10),
    { id: 'peg' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'root' })
return j.assembly('a').add('b', b, { ground: true })
  .add('g', g, { at: j.tx.move(0, 0, 3.2) }).interference()
```

> **Try it.** [Load M-09](lab:preset/M-09), whose base peg carries the same 1 mm root fillet and whose pinion is a gear, so base and pinion are compared on meshes. Read the gap decisions in the trace: 0.200 mm everywhere. Delete the pinion's `lead-in` chamfer and the check reports `base and pinion touch or overlap`; add `{ exact: true }` to `.interference()` and the gaps carry no `≈`.

## 22.7 Slicing as plane–mesh intersection

A layer is the section of the solid at the layer's middle height ([Chapter 8](lab:book?ch=8)). On a mesh the section is cheap: a triangle whose vertices lie on both sides of the plane $z = z_0$ crosses it in a segment, whose ends interpolate linearly along the two edges that change side. The segments chain into closed loops through their shared endpoints, and loops nest by containment with the even–odd rule, outer boundaries counting positive and holes negative, which gives each layer's area. Two details keep the chaining exact: jig lifts the plane by $10^{-7}$ mm so that no vertex lies on it, and it interpolates every edge from its lower end, so the two triangles that share an edge compute bit-identical points.

jig slices bodies made of analytic faces, 80 faces or fewer, exactly: OpenCascade intersects the plane with the B-rep, and the section's curves are divided into polylines within 0.05 mm. Freeform or many-faced bodies, gears and threads, are sliced through their display meshes. On the peg:

| $z$ | exact $\pi r^2$ | mesh section | B-rep section, as polylines |
|--:|--:|--:|--:|
| 3.1 mm, through the fillet | 29.49569 mm² | 29.44020 mm² | 29.30653 mm² |
| 8 mm, through the peg | 19.63495 mm² | 19.56180 mm² | 19.50903 mm² |

At $z = 8$ mm the mesh section is the 42-gon of Section 22.1 and loses exactly the fraction of Section 22.2; the exact section, divided at the coarser angular step of 0.2 rad, has 32 points and loses more. For the 24-tooth gear at mid-width, the mesh section is 413.2927 mm² in 20 ms and the B-rep section 412.9158 mm² in 2.5 s. The gear is a prism, so its true section is its volume over its width, 413.4191 mm², and the mesh is the closer of the two and more than 100 times faster.

## 22.8 What jig does and does not do

jig tessellates with one linear and one angular deflection per body, both fixed by the body's size and not settable from a script; exports STL, 3MF with units and plates, and exact STEP, each with a report; computes exact volume, area and mass from the B-rep; measures interference exactly on analytic bodies and on meshes, with the edge–triangle test, for freeform ones; and slices analytic bodies exactly and others by plane–mesh intersection. It does not measure the real deviation of a mesh, refine a mesh adaptively for a requested error, or expose the centroid or inertia.

## 22.9 Key points

- A circle within chordal deviation $\varepsilon$ needs $⌈\pi/\arccos(1 - \varepsilon/r)⌉$ segments; jig's mesher keeps chords within $\varepsilon/2$ and gives every circle at least 42 segments.
- An inscribed mesh loses about $\tfrac{4}{3}s/r$ of a cylinder's volume, $s$ the sagitta: 0.37 % for the Ø5 peg with defaults; concave surfaces gain.
- The deflection is a setting, not a bound: at 0.050 mm the filleted peg deviates 0.007 mm and a Ø10 sphere 0.099 mm, as the export report warns.
- STL keeps triangles only; 3MF adds units, plates and indexed vertices; STEP keeps the exact B-rep, torus and all.
- A mesh tessellated from a valid B-rep merges into a closed, oriented manifold with $V - E + F = 2 - 2g$; jig's 3MF writer merges the shared vertices so the file is closed by its indices.
- Exact mass properties come from the divergence theorem on the faces, mesh ones from signed tetrahedra; the peg's mesh volume is 0.024 % low.
- Vertex-to-triangle distances miss meshes that pass through each other; jig adds an edge–triangle crossing test and a ray-parity test for containment, and `{ exact: true }` compares the B-reps.
- Slicing a mesh is plane–triangle intersection plus chaining; on gears it is closer than the polyline B-rep section and more than 100 times faster.

## Exercises

> **Exercise.** How many segments does a circle of radius 1 mm need for a sagitta of 0.01 mm? Of radius 100 mm? Check that the ratio is close to $\sqrt{100}$, and explain why jig still gives the 1 mm circle 42.

> **Exercise.** Compile a sphere of radius 10 mm in the workbench and export it as STL. From the report and the formulas of Section 22.2, estimate the mesh's volume; then read the triangle count and deflection from the IR at level L6, and check the file size against 84 + 50 bytes per triangle.

> **Exercise.** Prove that the sum of signed tetrahedron volumes of a closed, consistently oriented mesh does not depend on the choice of the origin. Hint: moving the origin by $t$ changes each term by an amount that is a sum over edges, and each edge appears twice with opposite signs.

> **Exercise.** In the sketch of Section 22.6, move the gear up to `j.tx.move(0, 0, 3.6)`. Compute the torus radius at that height and predict whether the check passes; then add `{ exact: true }` and compare the two gaps.

## Further reading

- Botsch, Kobbelt, Pauly, Alliez and Lévy, *Polygon Mesh Processing*, A K Peters, 2010: mesh data structures, manifoldness, repair and remeshing.
- Mirtich, *Fast and accurate computation of polyhedral mass properties*, Journal of Graphics Tools 1(2), 1996: volume, centroid and inertia of a polyhedron from the divergence theorem.
- Möller and Trumbore, *Fast, minimum storage ray-triangle intersection*, Journal of Graphics Tools 2(1), 1997: the segment–triangle test of Section 22.6.
- Möller, *A fast triangle-triangle intersection test*, Journal of Graphics Tools 2(2), 1997: testing two triangles directly, the alternative to edge–triangle tests.
- 3MF Consortium, *3MF Core Specification*, version 1.3.0: the package, units and the mesh rules of Section 22.3.
