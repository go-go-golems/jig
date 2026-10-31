---
part: VI · Inside the kernel
presets: M-07, S-06
docs: reference
---
# Curves and surfaces

A B-rep's topology says which faces meet at which edges; its geometry says where they are. Every edge carries a curve and every face a surface, and the kinds available decide what the kernel can represent exactly, how fast it can intersect, and where it must approximate. This chapter builds the standard toolkit from the ground up: parametric curves, Bézier curves and de Casteljau's algorithm, B-splines and de Boor's algorithm, rational B-splines (NURBS) and the exact circle, then the analytic and freeform surfaces that faces are cut from. It ends by measuring which surfaces jig's features actually produce, over every face of every preset, and where the engine treats freeform faces differently. By the end you can evaluate a Bézier or B-spline curve by hand, derive the weight that makes a rational curve a circle, and predict the surface kind of any face a jig feature makes.

## 18.1 Parametric curves

A circle of radius $r$ can be written **implicitly**, as the points with $x^2 + y^2 = r^2$, or **parametrically**, as the path $C(t) = (r\cos t, r\sin t)$ traced as $t$ runs from 0 to 2π. An implicit form answers "is this point on the curve?" with one evaluation; a parametric form answers "give me points along the curve", which is what drawing, meshing, sweeping and intersecting by marching need. Kernels store curves parametrically.

The derivative $C'(t)$ is the **tangent**, its length the **speed**. The shape does not depend on the parametrisation, the speed does: Section 18.4 meets a circle traced at varying speed. The **curvature** is

$$
\kappa = \frac{|C' \times C''|}{|C'|^3} ,
$$

$1/r$ for a circle, 0 for a line. Where curves join, two kinds of smoothness are distinguished. **Parametric continuity** $C^k$ asks the first $k$ derivatives to agree; **geometric continuity** $G^1$ asks only the tangent directions to agree, and $G^2$ also the curvature. A line meeting a tangent arc is $G^1$ but not $G^2$: the curvature jumps from 0 to $1/r$.

The die of Chapter 17 needs only three curve kinds: 6 lines, 15 circles and 21 ellipses, all stored exactly. Sketched splines, font outlines, gear flanks and the edges of sweeps need more, and the first question is whether polynomials suffice. They do not. If $x(t)$ and $y(t)$ are polynomials with $x^2 + y^2 = 1$ for all $t$, the highest powers of $x^2$ and $y^2$ have positive coefficients and cannot cancel, so both are constant. OpenCascade agrees in numbers: asked to convert a circle of radius 10 mm to a non-rational B-spline, it returns degree 7 with 7 control points and a radius error of up to 6.5 × 10⁻⁵ mm. Small, but not zero, and a kernel that stored circles that way could never report a bore's diameter exactly.

## 18.2 Bézier curves and de Casteljau

A **Bézier curve** of degree $n$ is a weighted average of $n + 1$ **control points** $P_0 … P_n$:

$$
C(t) = \sum_{i=0}^{n} B_i^n(t)\,P_i , \qquad B_i^n(t) = \frac{n!}{i!(n-i)!}\,t^i (1-t)^{n-i} , \qquad 0 \le t \le 1 .
$$

The weights $B_i^n$ are the **Bernstein polynomials**. They are non-negative and sum to 1, which gives the properties a designer relies on. The curve starts at $P_0$ and ends at $P_n$; its end tangents point along the first and last legs of the control polygon, $C'(0) = n(P_1 - P_0)$; it lies inside the convex hull of its control points; moving all control points by an affine map moves the curve by the same map; and it wiggles no more than its control polygon does (variation diminishing).

**De Casteljau's algorithm** evaluates the curve by repeated linear interpolation, which is stabler than summing the polynomials:

$$
P_i^0 = P_i , \qquad P_i^r = (1-t)\,P_i^{r-1} + t\,P_{i+1}^{r-1} , \qquad C(t) = P_0^n .
$$

Take the cubic with $P_0 = (0, 0)$, $P_1 = (10, 20)$, $P_2 = (30, 20)$, $P_3 = (40, 0)$ and $t = 0.25$. Each row interpolates a quarter of the way along the previous one:

| $r$ | points |
|---|---|
| 0 | (0, 0) · (10, 20) · (30, 20) · (40, 0) |
| 1 | (2.5, 5) · (15, 20) · (32.5, 15) |
| 2 | (5.625, 8.75) · (19.375, 18.75) |
| 3 | (9.0625, 11.25) |

so $C(0.25) = (9.0625, 11.25)$. OpenCascade's Geom_BezierCurve gives the same point, and so does jig's own `bezierPoint` in src/engine/fonts.js, which is de Casteljau's algorithm in three lines. The intermediate points also split the curve: $P_0^0, P_0^1, P_0^2, P_0^3$ are the control points of the piece of the curve for $t \le 0.25$, and $P_0^3, P_1^2, P_2^1, P_3^0$ those of the rest. This **subdivision** is how kernels intersect Bézier curves: split until the convex hulls stop overlapping or become flat enough to treat as lines.

Bézier curves reach jig through text. The fonts are TrueType, whose outlines are quadratic Béziers, and jig passes them to the kernel as exact Geom_BezierCurve edges. A 20 mm letter S extruded 3 mm has 66 Bézier edges, all of degree 2, and 45 straight ones; each Bézier edge sweeps a face of the kind OpenCascade calls a **surface of linear extrusion**, 33 of them, plus 6 planes.

```figure
// view: plan
return j.part('s')
  .extrude(j.region.text('S', { size: 20 }), mm(3), { id: 'txt' })
```

**Figure 18.1.** A 20 mm S in Atkinson Hyperlegible Bold, extruded 3 mm. Its outline is 33 quadratic Bézier segments per side and its curved walls are 33 surfaces of linear extrusion over those curves; the measured volume is 609.08 mm³.

## 18.3 B-splines and de Boor

A long Bézier curve has two faults: its degree grows with the number of control points, and moving any control point moves the whole curve. A **B-spline** fixes both by joining low-degree pieces with built-in smoothness. It has a degree $p$, control points $P_0 … P_n$, and a **knot vector** $u_0 \le u_1 \le … \le u_{n+p+1}$ that says where the pieces join:

$$
C(u) = \sum_{i=0}^{n} N_i^p(u)\,P_i .
$$

The basis functions come from the **Cox–de Boor recursion**. $N_i^0(u)$ is 1 for $u_i \le u < u_{i+1}$ and 0 elsewhere, and for $p \ge 1$

$$
N_i^p(u) = (u - u_i)/(u_{i+p} - u_i) \cdot N_i^{p-1}(u) + (u_{i+p+1} - u)/(u_{i+p+1} - u_{i+1}) \cdot N_{i+1}^{p-1}(u) ,
$$

with any term whose denominator is zero dropped. Three properties follow. **Local support**: $N_i^p$ is zero outside $[u_i, u_{i+p+1})$, so moving $P_i$ changes the curve on at most $p + 1$ spans. **Partition of unity**: the basis functions are non-negative and sum to 1, so the convex-hull and affine properties of Bézier curves carry over. **Continuity**: at a knot of multiplicity $k$ the curve is $C^{p-k}$; a cubic with simple knots is $C^2$ everywhere. A **clamped** knot vector repeats its end knots $p + 1$ times so that the curve starts and ends at its end control points; a Bézier curve is the B-spline with knots $0^{p+1}, 1^{p+1}$.

**De Boor's algorithm** generalises de Casteljau's. To evaluate at $u$ in the span $u_k \le u < u_{k+1}$, start from the $p + 1$ control points that are active there, $d_j^0 = P_j$ for $j = k - p … k$, and interpolate $p$ times:

$$
d_j^r = (1 - \alpha_j^r)\,d_{j-1}^{r-1} + \alpha_j^r\,d_j^{r-1} , \qquad \alpha_j^r = (u - u_j)/(u_{j+p+1-r} - u_j) ,
$$

for $j = k$ down to $k - p + r$ (downwards, so one array holds both levels), and read $C(u) = d_k^p$.

jig's sketches have this curve. `.spline(id, pts, { fit: 'control' })` is a clamped uniform B-spline of degree 3 controlled by the points: for six points the knot vector is 0, 0, 0, 0, 1, 2, 3, 3, 3, 3 (src/engine/sketch/geom2d.js, which evaluates it with the Cox–de Boor recursion as written above). Take $P_0 … P_5$ = (0, 0), (10, 20), (20, 0), (30, 20), (40, 0), (50, 20) and $u = 1.5$, in the span $u_4 = 1 \le u < u_5 = 2$, so $k = 4$ and the active points are $P_1 … P_4$:

| step | $j$ | $\alpha$ | $d_j$ |
|---|--:|--:|---|
| $r = 1$ | 4 | 0.25 | (32.5, 15) |
| | 3 | 0.5 | (25, 10) |
| | 2 | 0.75 | (17.5, 5) |
| $r = 2$ | 4 | 0.25 | (26.875, 11.25) |
| | 3 | 0.75 | (23.125, 8.75) |
| $r = 3$ | 4 | 0.5 | (25, 10) |

so $C(1.5) = (25, 10)$. The same point comes from the basis values: $N_1^3, N_2^3, N_3^3, N_4^3$ at 1.5 are 1/32, 15/32, 15/32, 1/32, and $(10 + 300 + 450 + 40)/32 = 25$, $(20 + 300)/32 = 10$. The sketch's sample at $u = 1.5$ is (25, 10).

```figure
// view: sketch
const pts = [[0, 0], [10, 20], [20, 0], [30, 20], [40, 0], [50, 20]]
return j.sketch('bs', { on: j.plane.XY })
  .polyline('poly', pts)
  .construction('poly')
  .spline('c', pts, { fit: 'control' })
```

**Figure 18.2.** A clamped cubic B-spline (solid) and its control polygon (construction). The curve starts and ends at the end points, follows the zigzag without touching the inner corners, and passes through (25, 10) at $u = 1.5$, the point worked out by de Boor's algorithm.

```sketch
// title: B-spline or interpolating spline
// Try fit: 'interp' (through the points), then degree: 2 with 'control'.
const pts = [[0, 0], [10, 20], [20, 0], [30, 20], [40, 0], [50, 20]]
return j.sketch('bs', { on: j.plane.XY })
  .polyline('poly', pts)
  .construction('poly')
  .spline('c', pts, { fit: 'control' })
```

The default, `fit: 'interp'`, draws a curve through the points instead: a centripetal Catmull–Rom spline, a cubic Hermite curve whose tangents come from neighbouring points. What reaches the kernel is a third curve. src/engine/shapes.js builds every spline edge with OpenCascade's GeomAPI_Interpolate, a $C^2$ cubic B-spline through given points, and the profile hands it either samples of the sketch's curve or the control points themselves:

| spline in a profile | kernel curve | sketch area | solid's volume / height |
|---|---|--:|--:|
| open, 4 points, `interp` | cubic, 75 control points, 73 knots | 507.084 mm² | 507.096 mm² |
| open, 4 points, `control` | cubic, 75 control points, 73 knots | 335.181 mm² | 335.250 mm² |
| closed, 6 points, `interp` | periodic cubic through the 6 points | 871.46 mm² | 908.34 mm² |
| closed, 6 points, `control` | periodic cubic through the 6 points | 618.53 mm² | 908.34 mm² |

An open spline is interpolated through 24 samples per span of the sketch's curve, so the solid follows the sketch to about 2 × 10⁻⁴ of the area, at the price of 75 control points where 4 to 7 would describe the curve. A closed spline is interpolated through its own points whatever `fit` says, so the solid is not the curve the sketch draws: 4 % larger for `interp`, 47 % for `control`. This is an engine bug in this build (reported); until it is fixed, close a spline with a short line so that it is treated as open.

## 18.4 NURBS and the exact circle

A **rational B-spline** gives each control point a **weight** $w_i > 0$:

$$
C(u) = \frac{\sum_i N_i^p(u)\,w_i\,P_i}{\sum_i N_i^p(u)\,w_i} .
$$

With non-uniform knots this is a **NURBS** curve (non-uniform rational B-spline). Raising a weight pulls the curve towards its point; equal weights give back the plain B-spline. Geometrically, a NURBS curve in the plane is the central projection of a polynomial B-spline in space with control points $(w_i x_i, w_i y_i, w_i)$ onto the plane at height 1, so every algorithm for B-splines (de Boor, knot insertion, subdivision) works on the weighted points, and the result is divided at the end.

The payoff is that conics become exact. Take a quadratic rational Bézier with $P_0 = (1, 0)$, $P_1 = (1, 1)$, $P_2 = (0, 1)$ and weights 1, $w$, 1: the end tangents meet at $P_1$, as they must for a quarter of the unit circle. Write $a = (1-t)^2$, $b = 2w\,t(1-t)$ and $c = t^2$. Then

$$
x = (a + b)/(a + b + c) , \qquad y = (b + c)/(a + b + c) ,
$$

and $x^2 + y^2 = 1$ means $(a + b)^2 + (b + c)^2 = (a + b + c)^2$, which after cancelling is $b^2 = 2ac$. That is $4w^2 t^2 (1-t)^2 = 2t^2 (1-t)^2$ for every $t$, so $w^2 = 1/2$ and

$$
w = \frac{\sqrt{2}}{2} \approx 0.7071 .
$$

The curve is exactly a quarter circle, but it is not traced at constant speed: at $t = 0.5$ it is at 45°, by symmetry, while at $t = 0.25$ it is at 21.60°, not 22.5°. In general an arc of angle θ whose middle control point sits where its end tangents meet needs the weight $\cos(\theta/2)$.

OpenCascade stores a full circle analytically (a centre, an axis and a radius) and converts it to NURBS only on request. Asked to convert the circle of radius 10 mm, it returns a periodic rational curve of degree 2 with 6 control points: three 120° arcs, the corner points at distance $10/\cos 60° = 20$ mm from the centre, weights 1, 0.5, 1, 0.5, 1, 0.5 (that is, $\cos 60°$ in the middle of each arc), knots 0, 2π/3, 4π/3, 2π each of multiplicity 2. The largest radius error over 1,001 samples is 5 × 10⁻¹⁵ mm, rounding error. Rational surfaces appear in jig where a circle is swept along something that is not a line or an axis: the wire of the coil in [Chapter 4](lab:book?ch=4) (a circle swept along a helix) is a rational B-spline surface of degree 6 × 10 with 6 × 39 control points. jig's API has no weights: its sketches offer interpolating and uniform B-splines, and conics are exact only as arcs, circles and ellipses.

## 18.5 Surfaces, analytic and freeform

A face is a piece of a parametric surface $S(u, v)$ cut out by loops of edges. Its outward normal is $\pm(S_u \times S_v)/|S_u \times S_v|$, the sign set by the face's orientation flag. The five **analytic** surfaces have closed forms, in OpenCascade's conventions with a frame of origin $O$ and axes $X$, $Y$, $Z$:

| surface | $S(u, v)$ |
|---|---|
| plane | $O + u X + v Y$ |
| cylinder | $O + R(\cos u\,X + \sin u\,Y) + v Z$ |
| cone | $O + (R + v\sin\alpha)(\cos u\,X + \sin u\,Y) + v\cos\alpha\,Z$ |
| sphere | $O + R\cos v\,(\cos u\,X + \sin u\,Y) + R\sin v\,Z$ |
| torus | $O + (R + r\cos v)(\cos u\,X + \sin u\,Y) + r\sin v\,Z$ |

Analytic surfaces make intersections cheap and exact (a plane meets a cylinder in lines, circles or ellipses), carry their defining numbers (a bore reports its radius) and give exact normals. The frame matters: if $X$, $Y$, $Z$ form a left-handed set, $X \times Y = -Z$ and the stored axis points against $S_u \times S_v$. Code that reads the axis instead of differentiating must check the handedness, as jig does: the end caps of a revolve sit on left-handed frames.

Between the analytic surfaces and the general case lie the **swept surfaces**. A **surface of linear extrusion** moves a curve $C(u)$ along a direction $d$, $S(u, v) = C(u) + v\,d$; a **surface of revolution** turns it about an axis by the angle $u$. The general case is the **tensor-product B-spline surface**,

$$
S(u, v) = \sum_i \sum_j N_i^p(u)\,N_j^k(v)\,P_{ij} ,
$$

a grid of control points with a knot vector and degree in each direction, rational when the points carry weights. Evaluation applies de Boor's algorithm along one direction for each row of the grid, then once along the other. These **freeform** surfaces can take any smooth shape, as lofts, twists and blends between curved faces need; they pay with slower intersection (subdivision and marching instead of formulas) and with no defining numbers to read back.

A single revolve can make every analytic kind and a swept one. The profile below has a line perpendicular to the axis, one parallel, one oblique, an arc centred off the axis, a spline, and an arc centred on the axis, and it closes along the axis itself, which sweeps nothing.

```figure
// view: axo
const sec = j.sketch('sec', { on: j.plane.XZ })
  .line('base', [0, 0], [16, 0])
  .line('wall', [16, 0], [16, 6])
  .line('bevel', [16, 6], [12, 12])
  .arc('bead', { center: [8, 12], start: [12, 12], end: [8, 16] })
  .spline('neck', [[8, 16], [5, 19], [6, 26]])
  .arc('dome', { center: [0, 18], start: [6, 26], end: [0, 28] })
  .line('axis', [0, 28], [0, 0])
return j.part('knob')
  .revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'knob' })
```

**Figure 18.3.** One revolve, six surface kinds. Measured on the B-rep: `base` is a plane, `wall` a cylinder of radius 16, `bevel` a cone (semi-angle 33.7°), `bead` a torus, `neck` a surface of revolution over a B-spline, `dome` a sphere of radius 10 centred at height 18. Volume 11,214.71 mm³.

> **Try it.** Open the knob below, then [select the bead](lab:select/knob/side[sec.bead]) and [the neck](lab:select/knob/side[sec.neck]): the selection panel heads each with its kind, `torus` for the bead and `bspline` for the neck (jig's name for every freeform kind, Section 18.7).

```sketch
// title: One revolve, six surface kinds
// Move the dome's centre off the axis: the sphere becomes a torus.
const sec = j.sketch('sec', { on: j.plane.XZ })
  .line('base', [0, 0], [16, 0])
  .line('wall', [16, 0], [16, 6])
  .line('bevel', [16, 6], [12, 12])
  .arc('bead', { center: [8, 12], start: [12, 12], end: [8, 16] })
  .spline('neck', [[8, 16], [5, 19], [6, 26]])
  .arc('dome', { center: [0, 18], start: [6, 26], end: [0, 28] })
  .line('axis', [0, 28], [0, 0])
return j.part('knob')
  .revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'knob' })
```

## 18.6 What jig's features make

Which surface a feature produces depends on the feature and on the curves it starts from. Measured on small test parts:

| feature and input | surface kinds stored |
|---|---|
| extrude of lines, arcs, circles | plane, cylinder |
| extrude of an ellipse, a spline, text | surface of linear extrusion |
| tapered extrude of a square / a circle | B-spline of degree 1 × 1 (exactly flat) / cone |
| twisted extrude of a rectangle | B-spline |
| revolve | plane, cylinder, cone, sphere, torus, surface of revolution (Figure 18.3) |
| loft, square to circle / ruled, square to square | B-spline of degree 8 × 1 / B-spline of degree 1 × 1 |
| sweep of a circle along a helix | rational B-spline, degree 6 × 10 |
| fillet of a straight edge between planes / of a circular edge | cylinder / torus |
| chamfer of a circular edge, countersink | cone |
| thread M8 × 10 | 48 B-spline faces, 24 cylinders |
| spur gear / helical gear | surfaces of linear extrusion and cylinders / all B-spline |

The sides of a tapered square are flat, but the taper is built as a ruled loft between the profile and its offset, so OpenCascade stores each side as a bilinear B-spline patch with 2 × 2 control points; the patches lie in their planes to rounding error, yet the kernel and jig see freeform faces, and `%plane` does not select them. A circle tapers to an exact cone. And a fillet of planes and circles is analytic: OpenCascade recognises the rolling ball between two planes as a cylinder and around a circular edge as a torus, as Chapter 21 explains.

Over the whole preset library (72 presets, 134 bodies, 7,231 faces) the census is:

| surface | faces | share |
|---|--:|--:|
| plane | 4,164 | 57.6 % |
| cylinder | 1,345 | 18.6 % |
| surface of linear extrusion | 1,069 | 14.8 % |
| cone | 393 | 5.4 % |
| B-spline | 191 | 2.6 % |
| torus | 39 | 0.5 % |
| sphere | 30 | 0.4 % |

Analytic faces are 82.6 % of the total. The freeform ones sit in 13 of the 72 presets and come from three sources: gear flanks ([M-07](lab:preset/M-07) has 216 of its 346 faces freeform, M-10 396 of 701), text ([S-06](lab:preset/S-06), the calibration coupons, the drill guide) and threads and lofts (B-spline). No preset has a surface of revolution, a Bézier surface or an offset surface.

## 18.7 Where freeform faces are treated differently

jig classifies a face by its surface: plane, cylinder, cone, sphere, torus, and everything else as `bspline` (B-spline, Bézier, extrusion and revolution surfaces alike) or `other`. The classification steers several decisions, each a trade of exactness for speed:

- **Interference.** Bodies with only analytic faces (and at most 400 faces between them) get OpenCascade's exact B-rep distance; others the display-mesh distance, marked ≈. On M-07 that is ≈ 0.203 mm from the meshes, several times faster than the exact 0.200 mm (Chapter 17).
- **Slicing.** A body with any freeform face, or more than 80 faces, is sliced through its display mesh; exact sections of helical B-splines cost seconds per layer.
- **Overhangs.** Planes, cylinders, cones and spheres use their exact normals; freeform triangles use facet normals with a 0.5° tolerance.
- **Areas and centres.** Freeform faces of a meshed body take their area from the triangulation, since exact integration over swept and lofted B-splines costs seconds.
- **Booleans.** Merging same-domain faces after a boolean is skipped when a tool has freeform faces.

Gear flanks show the representation choice behind those numbers. The involute is an exact curve, but no kernel surface type is an extruded involute, so jig samples each flank at 10 points of the exact involute and hands them to GeomAPI_Interpolate, which returns a cubic B-spline with 12 control points; the root fillet, a trochoid, gets 15 samples and 17 control points. For the M-07 pinion (module 2 mm, 18 teeth) the flank spline departs from the true involute by at most 1.3 × 10⁻⁴ mm, normal to the flank, largest near the base circle where the involute curves fastest. With 5 samples the error would be 3.3 × 10⁻³ mm, with 20 samples 1.5 × 10⁻⁵ mm: it falls roughly as the fourth power of the spacing, as cubic interpolation should. A spur gear of 18 teeth has 72 freeform faces (36 flanks, 36 root fillets), 36 cylinders (tips and roots) and 2 planes; the helical gear, a twisted loft of the same profile, is 108 B-spline faces and 2 planes.

```sketch
// title: A spur gear's flanks
// Try teeth: 12 (undercut) or j.lib.gear.helical: all sides become B-spline.
return j.lib.gear.spur({ module: mm(2), teeth: 18, width: mm(8) })
```

What jig does not do with curves and surfaces is as plain. Its API offers no NURBS weights, no knot insertion or degree elevation, no surface patches built from curve networks, no $G^2$ blends between freeform faces, and no curvature analysis (zebra stripes, curvature combs). It reaches freeform geometry only through features (lofts, twists, sweeps, splines, text), and it reads freeform faces through meshes where speed matters.

## 18.8 Key points

- Kernels store curves and surfaces parametrically; continuity is parametric ($C^k$) or geometric ($G^k$), and polynomials cannot represent a circle exactly.
- A Bézier curve is a Bernstein-weighted average of its control points; de Casteljau's algorithm evaluates and subdivides it by repeated interpolation ((9.0625, 11.25) at $t = 0.25$ in the worked cubic).
- B-splines join low-degree pieces with knots: local support, partition of unity, $C^{p-k}$ at a knot of multiplicity $k$; de Boor's algorithm gives (25, 10) at $u = 1.5$ for jig's clamped cubic.
- Weights make conics exact: a quarter circle needs $w = \sqrt{2}/2$, and OpenCascade's NURBS circle is three 120° arcs with weights 0.5 in the middle.
- Faces are cut from analytic surfaces (plane, cylinder, cone, sphere, torus), swept surfaces (extrusion, revolution) or tensor-product B-splines.
- 82.6 % of the faces in jig's presets are analytic; freeform faces come from gears, text, threads, lofts and tapered polygons.
- Freeform faces send jig to meshes for interference, slicing and overhangs; gear flanks are cubic interpolants within 1.3 × 10⁻⁴ mm of the involute.
- A closed sketch spline is interpolated through its points by the kernel, not drawn as the sketch shows: a bug in this build.

## Exercises

> **Exercise.** Run de Casteljau's algorithm on the cubic of Section 18.2 at $t = 0.75$. Explain from the control polygon why the answer is (30.9375, 11.25) without computing it.

> **Exercise.** Show that a quadratic rational Bézier arc of angle θ, with its middle control point where the end tangents meet, is circular when the middle weight is $\cos(\theta/2)$, and check the 120° arcs OpenCascade uses.

> **Exercise.** In the B-spline sketch, change one inner control point, say (20, 0) to (20, 10), and watch which part of the curve moves. Which spans does local support predict? Then try `degree: 2` and explain the change at the ends.

> **Exercise.** In the knob sketch, make the oblique `bevel` line horizontal and then vertical, and read each face's kind in the face panel. Which surface kinds disappear, and which new plane or cylinder appears?

## Further reading

- Farin, *Curves and Surfaces for CAGD: A Practical Guide*, Morgan Kaufmann, 5th edition 2002: Bézier and B-spline curves and surfaces, de Casteljau and de Boor, with geometric insight throughout.
- Piegl and Tiller, *The NURBS Book*, Springer, 2nd edition 1997: the algorithms of rational B-splines (evaluation, knot insertion, conics) as implemented in kernels.
- de Boor, *A Practical Guide to Splines*, Springer, 1978: the B-spline basis, the recursion and its numerical stability.
- Litvin and Fuentes, *Gear Geometry and Applied Theory*, Cambridge University Press, 2nd edition 2004: involutes, generation by a rack and undercut, behind jig's gear flanks.
