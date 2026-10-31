---
part: VI · Inside the kernel
presets: A-01, A-03, A-06
docs: reference, naming, solver
---
# Building a kernel

jig's geometry comes from OpenCascade, a C++ kernel compiled to WebAssembly, and its sketch solver (src/engine/sketch/solver.js and linalg.js) is about 600 lines of JavaScript. This chapter is for the reader who wants to replace either, for example in Rust. It lists what jig asks of a kernel and the history each operation must report, compares three architectures on one part, sets out a tolerance policy, says what a better solver would change, measures the WebAssembly costs of the build jig ships, and shows how to test a kernel with laws. By the end you can write the interface your kernel must meet, choose an architecture with its costs in view, and write a property test that catches a kernel which returns wrong geometry without reporting an error.

## 23.1 What jig asks of a kernel

src/engine/KERNEL-API.md lists what the language offers; under it, the engine uses about 70 OpenCascade classes, in four groups:

| group | jig's calls | OpenCascade today | history jig reads |
|---|---|---|---|
| make | extrude, revolve, loft, sweep, primitives | `BRepPrimAPI_MakePrism`, `MakeRevol`, `BRepOffsetAPI_ThruSections`, `MakePipeShell` | faces generated from each profile edge; the two caps |
| combine | join, cut, intersect, split, holes | `BRepAlgoAPI_Fuse`, `Cut`, `Common` | each input face: kept, modified into a list, or deleted |
| modify | fillet, chamfer, shell, draft, thicken | `BRepFilletAPI_MakeFillet`, `MakeChamfer`, `BRepOffsetAPI_MakeThickSolid`, `DraftAngle` | faces modified; faces generated from edges and vertices; faces deleted |
| measure | volume, area, face kind, distance, section, validity, triangles, STEP | `BRepGProp`, `BRepAdaptor_Surface`, `BRepExtrema_DistShapeShape`, `BRepAlgoAPI_Section`, `BRepCheck_Analyzer` | none |

The last column is easy to leave out of a new kernel, and jig cannot work without it. The kernel never sees names like `shell/inner[body/side[base.outline.bottom]]` (Chapter 6). It hands back a **history** for every operation, and `carryNames` in src/engine/body.js turns the history into names by asking three questions of each face, edge or vertex of the input (`historyOf`):

- `IsDeleted(s)`: is `s` gone from the result?
- `Modified(s)`: which pieces of the result does `s` become? Two or more pieces mean a split, named `#a`, `#b`.
- `Generated(s)`: which new faces grew from `s`, such as a side swept from a profile edge or a fillet rolled along an edge?

A fourth rule is implicit: a face no operation touched must come out as the *same* face. OpenCascade's sub-shapes are shared handles, which gives this for free; a kernel that copies its topology must hand out stable identifiers instead.

Cutting a groove 6 mm wide and 4 mm deep across a 60 × 40 × 20 mm block, the boolean reports on its 12 input faces: three kept, five modified into one face each, the top modified into two (`body/end#a` and `body/end#b` in Figure 23.1), and three faces of the groove's box deleted. `Generated` of a face in a boolean returns the intersection edges, so jig reads only `Modified` and `IsDeleted` there. Blends answer through `Generated`: filleting all 12 edges of a box generates 12 cylindrical faces from the edges and 8 spherical faces from the vertices, named `round/face[<edge name>]` and `round/corner[<i>]`. Shells answer through `Generated` too, where `Modified` might be expected: on the rounded box of [A-01](lab:preset/A-01) all 9 inner faces come from `Generated`. A new kernel should document which question each operation answers.

History also guards results: `checkBlend` (src/engine/ops.js) refuses a blend that deletes a face away from its edges (Chapter 20).

```figure
// view: axo
// select: body/end#a
const groove = j.sketch('g', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('r', 'w + 2 mm', 6, { center: true })
return j.part('block')
  .params({ w: mm(60), d: mm(40), h: mm(20) })
  .extrude(j.region.rect('w', 'd'), 'h', { id: 'body' })
  .cut(groove.profiles(), mm(4), { id: 'groove' })
```

**Figure 23.1.** A groove across a 60 × 40 × 20 mm block. The boolean reports the top face as modified into two pieces, named `body/end#a` (selected) and `body/end#b`; without history both would be anonymous.

## 23.2 Three architectures

An **exact B-rep** kernel, in the style of OpenCascade and Parasolid, stores faces on analytic or NURBS surfaces and intersects surfaces to compute booleans (Chapters 19 and 20). A **mesh-first** kernel, in the style of Manifold, computes booleans on triangles; Manifold is designed to always return a manifold mesh. An **implicit** kernel, in the style of libfive, stores a function f(p) that is negative inside; when f is the distance to the surface it is a **signed distance field** (SDF), and triangles appear only when it is sampled.

Compare them on one part: a 20 × 20 × 10 mm block with every edge rounded at 2 mm (Figure 23.2). Rounding every edge of a box by r is the same as growing a box 2r smaller in each direction by a ball of radius r, and **Steiner's formula** gives the volume of a box with sides a, b, c grown by r: slabs on the faces, quarter cylinders on the edges, eighths of a ball at the corners,

$$
V = abc + 2r(ab + bc + ca) + \pi r^2 (a + b + c) + \tfrac{4}{3}\pi r^3 .
$$

With a = b = 16, c = 6 and r = 2 this is 1,536 + 1,792 + 477.52 + 33.51 = 3,839.0324 mm³.

| representation | what is stored | volume | error |
|---|---|--:|--:|
| B-rep (OpenCascade, in jig) | 26 faces: 6 planes, 12 cylinders, 8 spheres | 3,839.0324 mm³ | below 10⁻¹¹ mm³ |
| mesh (jig's display mesh, 0.05 mm deflection) | 1,380 triangles, 1,008 vertices | 3,836.9598 mm³ | −2.07 mm³ (−0.054 %) |
| SDF sampled every 0.5 mm | 46,464 samples | 3,843.5830 mm³ | +4.55 mm³ (+0.12 %) |
| SDF sampled every 0.25 mm | 371,712 samples | 3,838.6970 mm³ | −0.34 mm³ (−0.009 %) |
| SDF sampled every 0.125 mm | 2,973,696 samples (11.3 MiB as float32) | 3,839.3149 mm³ | +0.28 mm³ (+0.007 %) |

The SDF rows come from a Python script: f is the exact distance to the inner 16 × 16 × 6 box minus r, and each grid cell of spacing h counts as filled by the fraction max(0, min(1, ½ − f/h)). The function is exact, six lines with no error at all; the error comes from sampling, and it does not fall steadily with h because the grid crosses the faces at different places. The mesh loses volume because its triangles lie inside the curved faces, and no later boolean, however exact on the triangles, recovers it.

```figure
// view: axo
return j.part('block')
  .params({ r: mm(2) })
  .extrude(j.region.rect(20, 20), mm(10), { id: 'body' })
  .fillet(j.sel.edges(), 'r', { id: 'round' })
```

**Figure 23.2.** A 20 × 20 × 10 mm block with all 12 edges filleted at 2 mm: 6 planar faces, 12 quarter cylinders and 8 spherical corners. The kernel's volume, 3,839.0324 mm³, agrees with Steiner's formula to within 10⁻¹¹ mm³.

```sketch
// title: One part, three representations
// Set r to 4.9 mm and compare the volume with Steiner; then try 5 mm.
return j.part('block')
  .params({ r: mm(2) })
  .extrude(j.region.rect(20, 20), mm(10), { id: 'body' })
  .fillet(j.sel.edges(), 'r', { id: 'round' })
```

The comparison that matters for jig:

| | exact B-rep | mesh-first | implicit / SDF |
|---|---|---|---|
| fillets | exact rolling-ball surfaces on chosen edges; the hardest code in the kernel | strips of triangles, by offsetting or subdividing | an offset f − r rounds every convex edge exactly, but all at once |
| naming | faces are entities; each operation reports history | tag each triangle with its source face (jig's `triFace`) and regroup | no faces until meshing; names from the nearest primitive |
| exactness | exact surfaces, within a tolerance | fixed at tessellation | exact as a function; sampling is not |
| speed | surface intersection; the die of Chapter 5 takes 707 ms | simple, parallel booleans on triangles | samples grow with the cube of the resolution |
| size | 22,980,267 bytes as jig ships it | small | small |

Fillets and names decide it for jig: fillets on chosen edges are what printed parts use most (Chapter 21), and names keep a model editable. An SDF kernel gives up both; a mesh kernel rebuilds names from triangle tags.

**Hybrids** are common. replicad, the wrapper jig's OpenCascade build comes from, can hand a meshed B-rep to Manifold through the manifold-3d package; jig stubs that package out (src/engine/stub-manifold.js), so no mesh boolean runs in jig. jig's own layering is a milder hybrid: B-rep for geometry, meshes for display, slicing and the distance check of freeform bodies. A reasonable plan for a new kernel is exact B-rep for planes, cylinders, cones, spheres and tori, which cover most printed parts, with a mesh fallback for freeform features such as gear flanks, and every result labelled with its fidelity, as jig's metrics are (`fidelity: 'exact'`). In Rust, Fornjot and truck are open-source projects that set out to write B-rep kernels.

## 23.3 A tolerance policy

A **tolerance** is the distance below which two points are treated as one. A double has a 52-bit fraction, so near 300 mm, a large print bed, one unit in the last place is 5.7 × 10⁻¹⁴ mm; printed features are rarely below 0.1 mm. OpenCascade's default tolerance, carried by every vertex, edge and face of a fresh box, is 10⁻⁷ mm: six orders of magnitude above rounding and six below the smallest feature.

Operations widen an entity's tolerance when they cannot meet it. Measured in jig: after the die's booleans the largest vertex tolerance is 1.3 × 10⁻⁷ mm; the block of Figure 23.2 stays at 10⁻⁷ mm; an M8 thread, swept teeth sewn at 3 × 10⁻⁴ mm, ends at 2.5 × 10⁻⁴ mm, far below a layer but 2,500 times the default. jig's own tolerances sit around the kernel's: `KERNEL_TOL` (10⁻⁷ mm) is in every feature's cache key; merging coplanar faces after a boolean uses an angular tolerance of 10⁻⁹, and if the volume changes by more than 10⁻⁷ relative jig redoes the boolean without merging; sewing uses 10⁻⁶ mm.

A policy for a new kernel, in order of importance:

- **One model tolerance, stated.** An absolute ε (10⁻⁶ mm is plenty for printing) in the cache key; widened values stored on the entity and the largest reported with the body.
- **Exact predicates for decisions.** Whether a point is left of a line or above a plane decides topology. Compute these signs exactly (Shewchuk, 1997) instead of comparing with ε: a wrong value makes a solid inaccurate, a wrong sign makes it inconsistent.
- **Tolerances do not chain.** Two points within ε of a third may be 2ε apart; merge through one representative, never pair by pair.
- **Check after every operation.** Validity (`BRepCheck_Analyzer` in jig), Euler–Poincaré (Section 23.6), the volume identity for booleans. Refuse a result rather than pass it on.
- **Test far from the origin**, where rounding grows, and so does any step taken in proportion to a coordinate (Section 23.4).

## 23.4 The solver half

jig's solver (Chapters 11 to 15) does four things in the simplest form that works: five-point finite differences with step $h = 10^{-4} · max(1, |x|)$; a dense Householder QR with column pivoting of $J^T$ for minimum-norm steps and the rank; Gram–Schmidt against accepted rows to find redundancy; and decomposition into connected components only. Each has a known better replacement, and measurement says which matters first.

The staircase sketch at the end of this section is one cluster: K lines of 5 mm joined end to end, alternately horizontal and vertical, the first point fixed; $n = 4K$ unknowns and as many independent equations. At K = 10, drawn a few tenths of a millimetre off, it solves in 2 iterations with rank 40. Timed piece by piece in Node:

| K | n = m | nonzeros in J | finite-difference J | dense QR of J |
|--:|--:|--:|--:|--:|
| 80 | 320 | 798 (0.78 %) | 0.8 ms | 18.9 ms |
| 160 | 640 | 1,598 (0.39 %) | 1.6 ms | 149.3 ms |
| 320 | 1,280 | 3,198 (0.20 %) | 6.1 ms | 1,293.8 ms |

Doubling n multiplies the factorisation time by 7.9, then 8.7: the dense QR is O(n³). The finite differences are cheap because jig perturbs only the unknowns each equation uses. So replace the factorisation first: J is over 99 % zeros, and a **sparse rank-revealing QR** such as SuiteSparseQR (Davis, 2011) factors it in time close to its nonzero count while still reporting the rank the DOF count needs. Then decompose further (Chapter 15): Dulmage–Mendelsohn splits a component into well-, over- and under-constrained blocks, and a drag re-solves only its block.

Finite differences are a matter of accuracy. Against the exact derivative of a length residual |b − a| − L, the five-point error is 2.9 × 10⁻¹² for a 5 mm line at the origin, 2.3 × 10⁻⁸ for the same line at x = 1,000 mm, and 3.7 × 10⁻⁷ for a 0.5 mm line at x = 200 mm. The step grows with the coordinate, not the feature, and the rank test, which separates rows at 10⁻⁸, reads the noise as information. In this build a consistent 0.1 × 0.05 mm rectangle drawn at (500, 500) mm is reported as over-constrained; at the origin it solves.

The cure is exact derivatives. jig's residuals are short (coordinate differences, cross and dot products, a square root, an `atan2`), so write the derivatives by hand or use **forward-mode automatic differentiation**, where every number carries its derivative:

```js
// a dual number: a value and its derivative with respect to one unknown
const D = (v, d = 0) => ({ v, d })
const sub = (a, b) => D(a.v - b.v, a.d - b.d)
const mul = (a, b) => D(a.v * b.v, a.d * b.v + a.v * b.d)
const sqrt = a => D(Math.sqrt(a.v), a.d / (2 * Math.sqrt(a.v)))
// seed ax with d = 1 and every other unknown with d = 0, evaluate the
// residual once, and .d is ∂f/∂ax, exact to rounding
```

In Rust this is a residual function generic over `f64` or a dual type: one pass per unknown a row uses, and no step size to choose (Griewank and Walther, 2008).

```sketch
// title: How the solve grows
// Raise K to 80, then 160; read the iterations and rank in the IR (L3).
const K = 10
const pts = [[0, 0]]
for (let i = 1; i <= K; i++) {
  const [x, y] = pts[i - 1]
  pts.push(i % 2 ? [x + 5.3, y + 0.2] : [x - 0.3, y + 4.6])
}
const cs = [j.c.fix('p.1.start')]
for (let i = 1; i <= K; i++) {
  cs.push(i % 2 ? j.c.horizontal('p.' + i) : j.c.vertical('p.' + i))
}
let sk = j.sketch('stairs', { on: j.plane.XY }).polyline('p', pts)
  .constrain(...cs)
for (let i = 1; i <= K; i++) sk = sk.dim('p.' + i, 5)
return sk
```

## 23.5 WebAssembly

jig loads OpenCascade from a single WebAssembly module (src/engine/oc.js), measured here:

| | bytes | MiB |
|---|--:|--:|
| vendor/occt/replicad_single.wasm | 22,980,267 | 21.9 |
| dist/occt/replicad_single.gz.wasm (gzip, what is shipped) | 7,206,977 | 6.9 |
| the same module under Brotli at its highest setting | 5,012,753 | 4.8 |
| dist/worker.js, jig's engine bundle (gzip) | 415,791 | 0.4 |

The kernel is 17 times the engine bundle. It exposes 502 names to JavaScript, a selection small enough that `BRepPrimAPI_MakeCone` is missing (jig revolves a trapezoid instead), and jig uses about 70 of them; most of the bytes are the modelling algorithms those calls pull in. A Rust kernel covering the four groups of Section 23.1 competes against 22 MB.

**Load time.** In Node, reading and instantiating the raw module takes 314 ms. In headless Chromium from a local server, jig's `init` (fetch, gunzip with `DecompressionStream`, compile, instantiate) took 513, 828 and 653 ms on three fresh pages, and the first compile of a box 137 to 252 ms more. Download comes on top: 1.2 s for 7.2 MB at 50 Mbit/s.

**Memory.** The module starts with 100 MiB of linear memory; in one session it grew to 127.1 MiB after the gear pair of M-07 and 199.1 MiB after the threaded jar of M-06. WebAssembly memory grows but never shrinks, and JavaScript's garbage collector cannot see into it: jig registers every OpenCascade object with a scope (`K.scope()` in kernel.js) that deletes it, and `sweepBodies` frees unreachable bodies. A Rust kernel has the same boundary: every handle that crosses into JavaScript needs an explicit free.

**Threads.** The memory is not shared, so the build is single-threaded and jig turns off OpenCascade's parallel boolean (`SetRunParallel(false)`). Threads need a `SharedArrayBuffer`, which browsers enable only on cross-origin-isolated pages, so a threaded kernel must also control its hosting headers.

**Exceptions.** OpenCascade throws C++ exceptions, which arrive here as WebAssembly exceptions that `ocError` decodes. A Rust kernel should return errors as values carrying what a diagnostic needs, such as the largest radius that worked.

**Determinism.** WebAssembly arithmetic is IEEE 754, so one module gives the same bits on every machine, apart from NaN bit patterns. Determinism is lost above the arithmetic: maps iterated in address order, parallel reductions, budgets measured in time. jig's search for a minimal conflicting set stops after 60 solves or 4 s, so a slow machine could report a larger set; a budget in solves alone would not. The law `compile.deterministic` checks that one model hashes the same twice.

## 23.6 Testing a kernel with laws

A kernel that crashes is easy to catch; the dangerous one returns a slightly wrong solid and says nothing, like the fillet of Chapter 20. Closed forms catch it. A law is a theorem about every input, tested on random ones, as in property-based testing (Claessen and Hughes, 2000). jig's suite (Chapter 10) has four a new kernel should pass first:

| law | theorem | catches |
|---|---|---|
| `extrude.volume` | Cavalieri: $V = A h$ for a random rectangle, sharp or rounded | wrong prisms, wrong arc areas |
| `revolve.volume` | Pappus: $V = \theta r̄ A$ for 90°, 180° or 360° | wrong revolves and partial sweeps |
| `shape.boolean` | inclusion–exclusion: vol(A ∪ B) = vol A + vol B − vol(A ∩ B) for a box and an offset ball | booleans that lose or double material |
| `brep.eulerPoincare` | $V - E + F - (L - F) - 2(S - G) = 0$ with G the number of holes drilled | topology that is not a solid |

Three details make laws work. The generator stays inside the theorem's domain: the revolve law keeps its rectangle on one side of the axis. The tolerance is relative (10⁻⁶ or 10⁻⁵ of the expected value), because volumes run from 1 to 10⁶ mm³. And Euler–Poincaré must not become a free equation. jig solves it for G, so the check is parity: G must come out a whole number ≥ 0, and the compile warns `brep.invalid` when it does not. The law adds an independent genus, the number of holes it drilled. The counts follow the formula's rules: the zero-length **degenerate edges** OpenCascade puts at a sphere's poles and a cone's apex are not edges of the cell structure, so jig skips them. A ball, a cone and the block of Figure 23.2 ($V = 24$, $E = 48$, $F = 26$) all give G = 0; counting the ball's two would give G = 1.

```figure
// view: axo
const ring = j.region.rect(4, 10, { at: [12, 0] }).on(j.plane.XZ)
return j.part('ring').revolve(ring, j.axis.Z, deg(180), { id: 'rev' })
```

**Figure 23.3.** A 4 × 10 mm rectangle with its centroid 12 mm from the Z axis, revolved 180°: one of the inputs the Pappus law draws. The kernel's volume is 1,507.964 mm³, and $\theta r̄ A = \pi \cdot 12 \cdot 40 = 1507.964$ mm³.

A law of your own takes a generator, a property returning `{ ok, got, want }`, and what it pays for. The sketch tests fillets against Steiner's formula on five random blocks and radii. jig's runner reports the first failing input; it does not shrink it to a simpler case, as dedicated property-testing tools do.

```sketch
// title: A law for fillets
// Drop the (4/3)πr³ term from steiner and run: the law fails with a case.
const steiner = (a, b, c, r) => a * b * c + 2 * r * (a * b + b * c + c * a)
  + Math.PI * r * r * (a + b + c) + 4 / 3 * Math.PI * r ** 3
const block = ({ w, d, h, r }) => j.part('block')
  .extrude(j.region.rect(w, d), h, { id: 'body' })
  .fillet(j.sel.edges(), r, { id: 'round' })
const law = j.law('fillet.steiner',
  rnd => {
    const w = 5 + rnd() * 40, d = 5 + rnd() * 40, h = 2 + rnd() * 20
    return { w, d, h, r: (0.05 + rnd() * 0.35) * Math.min(w, d, h) }
  },
  ({ w, d, h, r }) => {
    const got = j.compile(block({ w, d, h, r })).metric('volume').value
    const want = steiner(w - 2 * r, d - 2 * r, h - 2 * r, r)
    return { ok: Math.abs(got - want) <= 1e-6 * want, got, want }
  },
  { justifies: 'kernel test of fillets', source: 'Steiner' })
const [res] = j.laws.check([law], { n: 5, seed: 7 })
if (!res.ok) throw new Error(JSON.stringify(res.counterexample))
return block({ w: 30, d: 20, h: 10, r: 3 })
```

It passes on these 5 samples, and on 40 with seed 3. With the corner term removed it fails on the first input, a 5.02 × 9.38 × 20.08 mm block with r = 1.506 mm: 882.498 mm³ measured against 868.186 mm³ predicted, and the difference, 14.312 mm³, is exactly $\tfrac{4}{3}\pi r^3$, the eight corners left out.

> **Try it.** Run the sketch, break the formula as its hint says, and read the counterexample in the error. [Show the IR](lab:show/ir) of the passing version: 26 faces, the eight corners named `round/corner[…]`.

What jig does and does not do: it runs five laws on seeded random inputs and reports the first failure without shrinking, and `j.structure` does not derive laws from a declared algebra in this build (it returns the suite's structural law whatever it is given). Run a kernel's laws in continuous integration, with hundreds of samples and fixed seeds, and keep every counterexample as a regression case.

## 23.7 Key points

- A kernel for jig must make, combine, modify and measure solids, and report for every operation which input faces were kept, modified, deleted or generated new faces; untouched faces keep their identity.
- On one rounded block the B-rep is exact, the display mesh is 0.054 % short, and a sampled SDF needs about 3 million samples for 0.007 %, though its function is exact.
- Fillets on chosen edges and persistent names favour exact B-rep for jig, with a mesh fallback for freeform features.
- State one model tolerance, decide topology with exact predicates, check every result, and test far from the origin.
- jig's solver time goes to a dense O(n³) QR (1.3 s at 1,280 unknowns, J 99.8 % zeros): sparse rank-revealing QR and finer decomposition come first; exact derivatives fix accuracy.
- The OpenCascade build is 22,980,267 bytes, 7,206,977 gzipped; it starts with 100 MiB that never shrinks, runs on one thread, and loads in 0.5 to 0.8 s locally.
- Cavalieri, Pappus, inclusion–exclusion and Euler–Poincaré (a whole-number genus, compared with the holes drilled) catch a kernel that returns wrong geometry without reporting an error.

## Exercises

> **Exercise.** Open the sketch of Section 23.2 and set r to 4.9 mm. Compute Steiner's formula by hand and compare it with the volume the workbench shows. Then set r to 5 mm and read the diagnostic: why is the largest radius that works a little below 5 mm?

> **Exercise.** In the workbench, write a law `torus.pappus` for `j.torus(R, r)` with $V = 2\pi^2 R r^2$ and a generator that keeps $r < R$. What does it pay for, and what does it add to `revolve.volume`?

> **Exercise.** Run the staircase sketch at K = 40, 80 and 160, note the compile times in the trace, and fit an exponent. Compare it with Section 23.4.

> **Exercise.** Differentiate $\phi = atan2(u \times v, u \cdot v)$ by hand with respect to the end point of u (u, v line directions), and compare with the five-point stencil at h = 0.05 mm on a 0.065 mm line.


## Further reading

- Hoffmann, *Geometric and Solid Modeling: An Introduction*, Morgan Kaufmann, 1989: boolean algorithms and the robustness of floating-point geometry.
- Shewchuk, *Adaptive precision floating-point arithmetic and fast robust geometric predicates*, Discrete & Computational Geometry 18(3), 1997: exact orientation tests at near floating-point speed.
- Pasko, Adzhiev, Sourin and Savchenko, *Function representation in geometric modeling: concepts, implementation and applications*, The Visual Computer 11(8), 1995: the implicit (F-rep) architecture and its operations.
- Griewank and Walther, *Evaluating Derivatives: Principles and Techniques of Algorithmic Differentiation*, 2nd ed., SIAM, 2008: forward and reverse automatic differentiation, and sparse Jacobians.
- Davis, *Algorithm 915, SuiteSparseQR: multifrontal multithreaded rank-revealing sparse QR factorization*, ACM Transactions on Mathematical Software 38(1), 2011: the factorisation a large sketch solver needs.
- Claessen and Hughes, *QuickCheck: a lightweight tool for random testing of Haskell programs*, ICFP 2000: property-based testing with generators and shrinking.
