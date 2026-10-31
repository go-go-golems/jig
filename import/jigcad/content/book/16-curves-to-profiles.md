---
part: V · Inside the solver
presets: A-03
docs: solver
---
# From curves to profiles

A solved sketch is a list of curves: segments, arcs, circles, sampled splines. An extrude needs something else: closed regions with an outside and holes, each a loop of exact pieces with a known area. This chapter follows jig's path from one to the other. Curves are intersected pairwise and split where they cross. The pieces form a planar graph whose faces are traced by always turning left, and each face's signed area is computed exactly, arcs included. Faces are then nested, and the even–odd rule decides which are material. Each step is worked on a small example, and the kernel's areas are checked against closed forms. By the end you can predict the profiles of a sketch with crossing, touching and nested curves, compute their areas by hand, and recognise the near-degenerate drawings where a profile appears or disappears.

## 16.1 From solved curves to pieces

The arrangement starts from every non-construction entity of the solved sketch. Lines, arcs and circles stay exact. An ellipse is sampled as a 128-sided polygon, a spline at 24 points per span, and an imported outline is taken as its polyline. Everything becomes one of two **primitives**: a segment from $a$ to $b$, or an arc with centre $c$, radius $r$, start angle and counterclockwise sweep (a full circle is an arc of sweep 2π).

All geometric tests share one tolerance,

$$
\varepsilon = 10^{-7} \cdot \max(1, \text{largest } |\text{coordinate}|) ,
$$

so $\varepsilon = 4 \times 10^{-6}$ mm for a sketch that reaches 40 mm. The tolerance is absolute within a sketch and scales with its size. Every pair of primitives whose bounding boxes overlap (within $\varepsilon$) is tested for intersection, so the cost is quadratic in the number of primitives. That is fine for hand-drawn sketches; Section 16.6 says what a large one would need.

## 16.2 Intersections: three cases

Each intersection is recorded as a parameter on both primitives: $t \in [0, 1]$ along a segment, the angle offset $s \in [0, \text{sweep}]$ along an arc.

**Segment–segment.** Write $p(t) = a + t d_1$ and $q(u) = c + u d_2$. With the 2D cross product $v \times w = v_1 w_2 - v_2 w_1$ of $v = (v_1, v_2)$ and $w = (w_1, w_2)$,

$$
t = \frac{(c - a) \times d_2}{d_1 \times d_2}, \qquad u = \frac{(c - a) \times d_1}{d_1 \times d_2} .
$$

The segments are treated as parallel when $|d_1 \times d_2| \le 10^{-12} |d_1| |d_2|$. Parallel segments farther apart than $\varepsilon$ do not meet. Collinear ones split each other at their endpoints, so an overlap becomes shared pieces. Otherwise a crossing counts if $t$ lies in $[0, 1]$ widened by $\varepsilon / |d_1|$, and $u$ likewise. The parameters are then clamped to $[0, 1]$. The widening is what lets an endpoint that lands on another segment's interior, a **T-junction**, split that segment.

**Segment–arc.** Substituting $p(t)$ into $|p - c|^2 = r^2$ gives $A t^2 + B t + C = 0$ with $A = d \cdot d$, $B = 2 f \cdot d$, $C = f \cdot f - r^2$ and $f = a - c$. A negative discriminant means no crossing, unless the closest point of the line is within $\varepsilon$ of the circle. In that case the contact is a **tangency** with the single root $t = -B / 2A$. Each root is kept if it lies on the segment and within the arc's sweep, with an angular tolerance $\varepsilon / r$.

**Arc–arc.** Let $d$ be the distance between centres. Two arcs of the same circle split each other at their endpoints. Otherwise there is no contact when $d > r_1 + r_2 + \varepsilon$ or $d < |r_1 - r_2| - \varepsilon$. The intersection points lie on the line of centres at distance $a = (r_1^2 - r_2^2 + d^2)/(2d)$ from the first centre, offset by $\pm h$ with $h^2 = r_1^2 - a^2$. When $h^2 \le \varepsilon^2$ the two points are one, a tangency. Each point is kept if it lies within both sweeps.

The worked example of this chapter is a 40 × 20 mm rectangle from (0, 0) to (40, 20) and a circle of radius $10\sqrt{2} = 14.142$ mm centred on the middle of its right side, (40, 10). By hand: the circle meets the line y = 0 where $(x - 40)^2 = 200 - 100$, so at x = 30 and x = 50. Only (30, 0) lies on the bottom segment. The top gives (30, 20) in the same way. Every point of the right side is at most 10 mm from the centre, inside the circle, so the right side has no crossing. The circle is cut at two points, and so are the bottom and the top, once each.

```figure
// view: plan
return j.sketch('x', { on: j.plane.XY })
  .polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })
  .circle('c', 10 * Math.SQRT2, { at: [40, 10] })
```

**Figure 16.1.** A rectangle and a circle through (30, 0), (30, 20), (50, 0) and (50, 20). The arrangement has 6 vertices, 8 edges and 3 bounded faces, and every face is a profile: 542.92, 257.08 and 371.24 mm².

## 16.3 Splitting and the half-edge graph

Each primitive's cut parameters are sorted. Cuts closer together than $\varepsilon$ along the curve are merged: a tangency found from two sides gives two nearly equal roots, and the primitive's own ends win. The pieces between consecutive cuts are the **edges**. Their endpoints become **vertices**, and points within $2\varepsilon$ of each other are merged into one vertex by a grid of cell size $4\varepsilon$. Two edges with the same end vertices and the same midpoint (to a grid cell) are one edge seen twice, as when two curves overlap, and one copy is dropped. A full circle with no cut stays a single closed edge with no vertex.

Next, **dangling** edges are removed. An edge with an end of degree 1 bounds no region, and removing it can expose another, so the removal repeats until every remaining vertex has degree at least 2.

What is left is a planar graph, stored as **half-edges**: each edge becomes two directed copies, **twins** of each other, one per direction. Around each vertex the outgoing half-edges are sorted by the angle of their tangent. Ties, where two curves leave in the same direction as at a tangency, are broken by curvature. To trace a face, arrive at a vertex along a half-edge and leave along the outgoing half-edge that comes next clockwise from its twin. That is the sharpest **left turn**. Repeating until the walk closes traces each bounded face counterclockwise, with the face on the left, and traces the outer boundary of each connected component once clockwise. Every half-edge is used exactly once.

For Figure 16.1 the counts, read with a scratch script from `buildProfiles` (the workbench shows only the profiles), are 6 vertices: the four corners, (30, 0) and (30, 20). There are 8 edges: the bottom and the top in two pieces each, the right and left sides, and the circle in two arcs. That makes 16 half-edges and 4 cycles: three counterclockwise faces and the clockwise outer boundary. Euler's formula for a planar graph, $V - E + F = 1 + C$ with $F$ counting the unbounded face and $C$ the components, checks: $6 - 8 + 4 = 2$, with $C = 1$.

## 16.4 Signed area of loops with arcs

By Green's theorem the area enclosed by a closed curve, traversed counterclockwise, is

$$
A = \frac{1}{2} \oint (x\, dy - y\, dx) ,
$$

and the integral splits into one term per piece. For a segment from $(x_1, y_1)$ to $(x_2, y_2)$ the term is $\tfrac{1}{2}(x_1 y_2 - x_2 y_1)$, and summing it around a polygon is the **shoelace formula**. For an arc it splits the same way: the shoelace term of its chord plus the area between chord and arc, the **circular segment**,

$$
A = \frac{1}{2}(x_1 y_2 - x_2 y_1) + \frac{1}{2} r^2 (\Delta - \sin \Delta) ,
$$

with $\Delta$ the signed sweep: positive counterclockwise, negative clockwise. jig integrates the arc term directly, $\tfrac{1}{2}[r c_1 \sin\theta - r c_2 \cos\theta + r^2 \theta]$ between the end angles for a centre $(c_1, c_2)$, which is the same quantity. A counterclockwise loop has positive area and a clockwise one negative, so the sign records orientation.

The face of Figure 16.1 inside both curves is traced as four pieces:

| piece | from → to | term |
|---|---|--:|
| bottom | (30, 0) → (40, 0) | 0 |
| right | (40, 0) → (40, 20) | 400 |
| top | (40, 20) → (30, 20) | 100 |
| arc, Δ = +π/2 | (30, 20) → (30, 0) | −300 + (50π − 100) = −242.92 |
| **sum** | | **100 + 50π = 257.08** |

The arc runs counterclockwise from 135° to 225° about (40, 10), bulging left to x = 25.86. Its chord term is $\tfrac{1}{2}(30 \cdot 0 - 30 \cdot 20) = -300$ and its segment $\tfrac{1}{2} \cdot 200 \cdot (\pi/2 - 1) = 57.08$. The face to its left traverses the same arc clockwise ($\Delta = -\pi/2$), so its segment term is −57.08. That face's area is $700 - 50\pi = 542.92$, and the lune outside the rectangle is $150\pi - 100 = 371.24$. The kernel reports 542.920367, 257.079633 and 371.238898 mm², equal to the closed forms to all six decimals. The three add to 1,171.24, and the outer cycle's area is the same number with a minus sign.

The arc term matters because the alternative, sampling arcs into polygons, is what the display does. jig draws arcs in steps of at most 6°, finer (down to 1°) where that keeps each chord within 0.05 mm of the arc. The display polygon of the lens face has an area of 256.7927 mm², 0.287 mm² short. The concave face's polygon is 0.287 mm² too large, because there the chords cut across the face's outside. The loss per step is the circular segment $\tfrac{1}{2} r^2 (\delta - \sin\delta)$: for $r = 10$ and $\delta = 6°$ it is 0.0096 mm², and 30 steps make 0.287 mm². Profiles carry exact areas and exact segments (`line`, `arc`, `circle`); the polygons are for drawing.

The tab of Figure 16.2 is a 40 × 20 mm rectangle with a semicircular end of radius 10 and a Ø8 hole at the semicircle's centre. Its outer loop sums to $0 + (400 + 50\pi) + 400 + 0 = 800 + 50\pi$, where the semicircle's chord term is 400 and its segment $\tfrac{1}{2} \cdot 100 \cdot \pi$. The hole subtracts $16\pi$. The closed form $800 + 34\pi = 906.814150$ mm² is what the kernel reports, to six decimals. The display polygons give 906.6190, short by 0.287 for the semicircle and long by 0.092 for the hole.

```figure
// view: plan
return j.sketch('tab', { on: j.plane.XY })
  .line('b', [0, 0], [40, 0])
  .arc('end', { center: [40, 10], start: [40, 0], end: [40, 20] })
  .line('t', [40, 20], [0, 20])
  .line('l', [0, 20], [0, 0])
  .circle('h', 4, { at: [40, 10] })
```

**Figure 16.2.** A tab: lines, a semicircle and a hole. One profile of 906.814150 mm² = 800 + 34π, with exact pieces line + arc + line + line and a circle as its hole.

## 16.5 Nesting and the even–odd rule

The half-edge walk finds faces within one connected piece of the drawing. The hole of Figure 16.2 touches nothing, so it forms its own **component**. Its circle gives two cycles: a counterclockwise one, a face of area $+16\pi$, and a clockwise one, its outer boundary, of area $-16\pi$. Nesting relates components to each other:

1. Each component's outer boundary is its most negative cycle.
2. For each component, a probe point is taken just inside its outer boundary. Its **parent face** is the smallest face of another component that contains the probe.
3. A face's **depth** is 1 plus the depth of the parent face of its component, and a component with no parent has depth 0. So the faces of a top-level component have depth 1, those inside one of them depth 2, and so on.
4. A face is material if its depth is odd: the **even–odd rule** applied to nesting. A material face's profile has as holes the components whose parent is that face, and its area is the face's area minus their outer areas.

In Figure 16.2 the tab's face has depth 1. The hole's component has the tab's face as parent, so its own face has depth 2 and is not material. Its outer boundary becomes the profile's hole: $957.08 - 50.27 = 906.81$.

Three concentric circles of radii 20, 14 and 8 make three components with depths 1, 2 and 3. The faces at depths 1 and 3 are material: a ring of $\pi(20^2 - 14^2) = 204\pi$ and a disc of $64\pi$. The kernel reports `a∖{b}` 640.884901 mm² and `c` 201.061930 mm², equal to $204\pi$ and $64\pi$ to six decimals. Extrude both and you get a washer with a coin floating in its hole. Leave out the middle circle and the small one becomes a hole.

```figure
// view: plan
return j.sketch('o', { on: j.plane.XY })
  .circle('a', 20).circle('b', 14).circle('c', 8)
```

**Figure 16.3.** Nesting depths 1, 2, 3: a ring of 204π = 640.88 mm² and a disc of 64π = 201.06 mm². The annulus between radii 14 and 8 is at even depth, so it is empty.

Nesting compares components, not loops. Curves that cross belong to one component, and every bounded face of a component is at the same depth. Two circles of radius 10 with centres 12 mm apart make one component with three faces: two lunes and a lens. All three are at depth 1, so all three are profiles. The lens area is $2r^2 \arccos(d/2r) - (d/2)\sqrt{4r^2 - d^2} = 200 \arccos 0.6 - 96 = 89.459$ mm², and each lune is $100\pi - 89.459 = 224.700$ mm². The kernel reports 89.459044 and 224.700222 twice. The same holds for Figure 16.1: its lens is a profile, not a hole.

This differs from the **even–odd fill rule** of PostScript and SVG. That rule counts how many loops a ray from a point crosses, and it would make the lens, inside both circles, a hole. The **nonzero winding rule** would fill all three faces. jig's rule fills all three as well, but as three separate, adjacent regions. To get a ring with a lens-shaped window, draw the window as its own closed loop inside, not as the overlap of two loops.

```figure
// view: plan
return j.sketch('o', { on: j.plane.XY })
  .circle('a', 10).circle('b', 10, { at: [12, 0] })
```

**Figure 16.4.** Two crossing circles: one component, three faces, three profiles (224.70, 224.70 and 89.46 mm²). An even–odd fill would leave the lens empty; jig's nesting does not, because crossing curves are not nested.

## 16.6 Open curves, dangling edges and near-coincident points

Pruning makes open geometry harmless and useless. Measured on the 40 × 20 rectangle:

- A 10 mm spur standing on the middle of the top edge splits the top at the T-junction. The spur is pruned (1 edge), and the profile is the rectangle, 800 mm², bounded by five pieces.
- A chord from (10, 0) to (10, 20) splits the rectangle into two profiles, 200 and 600 mm².
- An open polyline of three sides has no profile: all 3 edges are pruned.
- Two rectangles that share an edge (x = 40) split each other at the shared ends. The overlap is kept once, and the result is two adjacent profiles, 800 and 600 mm².

Endpoints merge within $2\varepsilon$, so on a 40 mm sketch a corner closes when its gap is at most about $4 \times 10^{-6}$ mm and stays open at $8 \times 10^{-6}$ mm, giving no profile. An endpoint that falls on another curve's interior is a T-junction and closes the loop at any gap. A left side drawn $10^{-5}$ mm inside the corners still gives one profile, of 799.9998 mm², with its tiny overhangs pruned.

Tangency is where a near-degenerate drawing changes the answer the most. Put a circle centred at (20, 15) inside the rectangle and let its radius approach 5, where it touches the top edge:

| radius (mm) | contact | profiles (mm²) |
|---|---|---|
| 4.999 | 0.001 mm apart | r∖{c} 721.4916 |
| 4.99999 | 0.00001 mm apart | r∖{c} 721.4605 |
| 4.999997 | 3 × 10⁻⁶ apart, within ε | 721.4603 and c 78.5397 |
| 5 | touching | 721.4602 and c 78.5398 |
| 5.00001 | crossing by 0.00001 | 721.4599, 78.5401 and 1.33 × 10⁻⁷ |
| 5.001 | crossing by 0.001 | 721.4289, 78.5711 and 0.000133 |

A separated circle is a nested component, a hole. A touching one shares a vertex with the rectangle, so it is part of the same component and its disc is a depth-1 face, a profile. Extrude all profiles and the hole is filled. A crossing circle adds a third face, the cap above the edge, which becomes a profile however thin. Its area, $\tfrac{1}{2} r^2(\alpha - \sin\alpha)$ with $\cos(\alpha/2) = 5/r$, is $1.33 \times 10^{-7}$ mm² for $r = 5.00001$. jig keeps such slivers: its only filter drops faces with an area below $10\varepsilon^2$. The practical rule for printed parts is to keep holes at least a line width away from an outline they are not meant to cut.

```figure
// view: plan
return j.sketch('s', { on: j.plane.XY })
  .polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })
  .circle('c', 5, { at: [20, 15] })
```

**Figure 16.5.** A circle touching the top edge from inside. It is not a hole: the touch joins it to the outline, and the result is two profiles, 800 − 25π = 721.46 mm² and the disc, 25π = 78.54 mm².

```sketch
// title: When is a circle a hole?
// Set the radius to 4.99: one profile with a hole. Try 5 and 5.01 too.
return j.sketch('s', { on: j.plane.XY })
  .polyline('r', [[0, 0], [40, 0], [40, 20], [0, 20]], { closed: true })
  .circle('c', 5, { at: [20, 15] })
  .line('spur', [32, 20], [32, 30])
```

> **Try it.** Open the last sketch and [show the IR](lab:show/ir): the profiles line of the L3 dump lists the regions and their areas. Change the radius as the comment says and watch the list change between one profile with a hole and two or three profiles. The spur on top never changes it. Then [load A-03](lab:preset/A-03) and read its profile: one loop with two holes, both well inside the outline.

### What jig does not do

The arrangement uses plain floating point with an absolute tolerance. It uses no exact or adaptive-precision predicates (Shewchuk's orientation tests), which make the topological decisions provably consistent. Intersections are found by testing all pairs, not by a sweep line (Bentley–Ottmann), so a sketch with thousands of pieces would be slow. Ellipses and splines enter as polygons. An ellipse that is a whole loop on its own gets its exact area: 157.079633 mm² $= 50\pi$ for semi-axes 10 and 5, against 157.0166 for its 128-gon. A spline loop's area is its polygon's.

Containment for nesting is tested against the sampled display polygons, not the exact curves. Each sampled arc is an inscribed polygon whose chords pass up to 0.05 mm inside the true arc, so one probe point taken next to a loop near an arc can land on the wrong side. An earlier version did exactly that: a Ø2 circle 0.04 mm inside the rim of a Ø100 circle came out as two profiles, the full disc and the small one, and the hole was lost. jig now lets all the sampled points of the inner component's outer loop vote. This is sound because components never cross, so the loop lies wholly inside a face or wholly outside it, and only the few points within the sagitta of an arc can vote wrongly. The same circle at 0.04 mm and at 0.06 mm now gives one profile with a hole, 7,850.84 mm². Slivers are kept, as above, and a curve that touches another within $\varepsilon$ is joined to it, whatever was intended.

## 16.7 Key points

- Solved curves become segments and arcs; ellipses, splines and imports are sampled. One tolerance, $\varepsilon = 10^{-7}$ times the sketch's largest coordinate, governs every test.
- Intersections have three cases: segment–segment by cross products, segment–arc by a quadratic, arc–arc by the radical line. Each widens its test by $\varepsilon$, so T-junctions and tangencies split curves.
- Split pieces form a planar half-edge graph after vertex merging, overlap removal and pruning of dangling edges. Turning left traces every bounded face counterclockwise, and Euler's formula $V - E + F = 1 + C$ checks the counts.
- Signed area is ½∮(x dy − y dx): the shoelace term for segments, plus a circular segment ½r²(Δ − sin Δ) per arc. jig's areas match closed forms to six decimals; the sampled display polygons are off by tenths of a mm².
- Components are nested by containment, and faces at odd depth are material. Crossing curves are one component, so every face they form is a profile, unlike the even–odd fill rule.
- Near-degenerate drawings decide topology: a gap of $8 \times 10^{-6}$ mm opens a loop, a circle touching an outline stops being a hole, and a crossing of $10^{-5}$ mm makes a sliver profile.

## Exercises

> **Exercise.** Compute by hand the profiles of a 30 × 30 mm square with a circle of radius 15 centred on one corner, and each area. Draw it in the workbench and compare with the L3 dump.

> **Exercise.** In Figure 16.4, move the second circle to `at: [20, 0]`, then to `at: [25, 0]`. Predict the number of profiles each time, including the tangent case, and check in the workbench.

> **Exercise.** Write the area of a slot (two semicircles of radius $r$ joined by lines of length $L$) as a sum of piece terms, and show that it equals $2rL + \pi r^2$ wherever the slot is placed.

> **Exercise.** Draw a ring with a lens-shaped window: an outer circle and, inside it, a closed loop of two arcs. Check that it gives one profile with one hole and not three profiles.

## Further reading

- de Berg, Cheong, van Kreveld and Overmars, *Computational Geometry: Algorithms and Applications*, Springer, 3rd ed. 2008: the doubly connected edge list, map overlay and the sweep-line intersection algorithm.
- O'Rourke, *Computational Geometry in C*, Cambridge University Press, 2nd ed. 1998: polygon area, point-in-polygon tests and segment intersection, with code.
- Bentley and Ottmann, *Algorithms for reporting and counting geometric intersections*, IEEE Transactions on Computers C-28(9), 1979: finding all k crossings among n segments in O((n + k) log n).
- Shewchuk, *Adaptive precision floating-point arithmetic and fast robust geometric predicates*, Discrete & Computational Geometry 18, 1997: orientation and incircle tests that are always right and usually fast.
- [How sketches are solved](lab:doc/solver): explicit and constrained sketches, whose solved curves this chapter turns into profiles.
