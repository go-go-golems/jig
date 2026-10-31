# Writing chapters for the book

The book (content/book/NN-slug.md) teaches jig from quantities to design search in ten chapters. Parts V and VI go under the hood: how the sketch solver and the solid-modelling kernel work, at the depth of a good university course, with every claim about jig checked against the engine. This guide is the contract for anyone writing those chapters.

## The reader

Someone who designs parts for 3D printing, can read code and school algebra, and wants to understand (and maybe one day build) a CAD kernel and a constraint solver. They know the workbench from Parts I–IV. Define every term at first use, in **bold**. Use standard names and well-known jargon (Jacobian, rank, trust region, NURBS, half-edge, Euler operator) with a one-line definition; do not invent terms.

## Voice and form

Read chapters 3 and 5 first; match them.

- Present tense, plain sentences, precise numbers with units. Address the reader as "you" sparingly. No hype, no rhetorical questions, no "simply" or "just". Colons and semicolons rather than dashes.
- The opening paragraph says what the chapter explains and ends "By the end you can …".
- Numbered sections `## N.1 Title`, then `## N.k Key points` (5–8 bullets), `## Exercises` (3–5, as `> **Exercise.** …`, at least two that are done in the workbench), `## Further reading` (3–6 entries).
- 15–25 KB of Markdown per chapter. Depth over breadth: work one example through completely rather than listing ten.
- Each chapter has 3–6 figures (```figure, compiled and drawn by the Book) and runnable sketches (```sketch, opened in the workbench as a scratch preset), and at least one `> **Try it.**` paragraph with lab: links.
- Every chapter must say plainly what jig does and what it does not do, where the general theory goes further (for example: jig clusters by connected components; a full solver would use a finer decomposition).

## What counts as true

- Every number about jig's behaviour (a DOF, a rank, an iteration count, a volume, a face count, a residual, a diagnostic's text) comes from a compile you ran. Closed-form numbers are computed (python3 is available) and, where possible, compared with the kernel's measurement in the text, as chapter 5 does with inclusion–exclusion.
- Never invent a measurement, a diagnostic message or an API. If the engine cannot show something, explain it in prose or with a hand-computed example and say that jig does not expose it.
- References: well-known works only (author, title, venue or publisher, year), each with a one-line note on what it gives the reader. Include only references you are sure of; leave one out rather than guess. Paraphrase; do not quote.
- Claims about other software stay historical and well established (OpenCascade, Parasolid and ACIS are B-rep kernels; SolveSpace and FreeCAD's PlaneGCS are open-source constraint solvers; Manifold does mesh booleans). No claims about their current versions or market position.

## Mechanics

- Front matter: `part: V · Inside the solver` (chapters 11–16) or `part: VI · Inside the kernel` (17–23); `presets:` ids of existing presets that illustrate the chapter; `docs:` ids from content/docs (solver, naming, reference, printing, getting-started).
- Figures: a ```figure block is a script.js body that returns a builder. Directive comments at its top: `// view: axo | front | side | plan | sketch`, `// overlays: dims,dof,grid,names,hidden,normals,overhang`, `// zoom: 1.4`, `// height: 320`, `// select: <face name>`. Each figure compiles in the reader's browser, so keep it under 2 s (no gears, no threads, no print jobs with slicing). The caption is the paragraph right after, starting `**Figure N.k.**`.
- Sketches: a ```sketch block starts `// title: …` then a one-line hint of what to change. A sketch that fails on purpose (to show a diagnostic) carries `// expect: <diagnostic kind>`.
- ```js blocks are listings, not compiled (for pseudocode or engine-side code shown for explanation; keep them short).
- Code lines at most 80 characters.
- Maths is set as Unicode by src/ui/markdown.js, not KaTeX: `\frac{a}{b}`, `\sqrt{x}`, Greek letters, `\cdot \times \le \ge \approx \to \partial \nabla \sum \int \cup \cap \in \perp \parallel`, `\operatorname{rank}`, super- and subscripts of digits, letters, `+ - = ( )`. No matrices, `\left( \right)`, `\mathcal`, `\begin{cases}`, `\hat` on groups; write a matrix as a table or row by row. The checker flags maths it cannot set.
- Links: `lab:preset/S-04`, `lab:book/5`, `lab:doc/solver`, `lab:show/ir`, `lab:view/plan`, `lab:param/w=80`, `lab:select/<face name>`, `lab:node/<feature id>`. Refer to other chapters as "Chapter 13" with a link where useful.

## The check

```sh
node tools/book-check.mjs 11            # compile every figure and sketch of chapter 11, check the rules
node tools/book-check.mjs 11 --detail   # also each sketch's L3 dump (solver, clusters, iterations, unknowns per
                                        # entity, equations per kind, rank), the decisions, and body topology
node tools/book-check.mjs 19 --ir L4    # print an IR level for each block
```

The L3 dump is what the reader sees in the IR view for a sketch node, so it is the reference for numbers in the solver chapters. For anything deeper (a Jacobian's singular values, the iterates of a solve, a mesh's chordal error, OpenCascade internals) write a scratch script under /tmp that imports the engine, for example:

```js
import { register } from 'node:module';
register(new URL('file:///home/claude/jigcad/test/engine/loader.mjs').href);
const W = await import('/home/claude/jigcad/src/engine/worker.js');
await W.handle({ id: 0, op: 'init' });
const r = await W.handle({ id: 1, op: 'compile', entry: 'script.js',
  files: { 'script.js': "return j.part('p').extrude(j.region.rect(20, 10), mm(5))" } });
console.log(r.program.summary, r.program.bodies[0].topology);
// solver internals: src/engine/sketch/{system,constraints,solver,linalg,profiles}.js export their functions;
// kernel internals: src/engine/{kernel,ops,body,mesh,inspect}.js; OpenCascade: getOC() from src/engine/oc.js
```

A chapter is done when `node tools/book-check.mjs NN` reports no problems.

## Boundaries

Write only your own chapter files. Do not edit src/, tools/, tests or other chapters. If you find an engine bug or a missing capability your chapter needs, do not fix it: write around it in the text and report it with a minimal script that shows it.

## The chapters

Part I–IV chapters already cover: units (1), the parameter graph (2), sketches as equations at an introductory level, DOF = n − rank J, redundant vs conflicting and a minimal conflicting set, dragging in one paragraph (3), extrude/revolve/sweep volumes by Cavalieri and Pappus (4), regularised booleans, inclusion–exclusion, B-rep counts and Euler–Poincaré, three failure diagnostics (5), persistent naming (6), patterns (7), layers and overhangs (8), fit (9), design search (10). Build on them; do not repeat them beyond a sentence of reminder.

### Part V · Inside the solver

**11 · Constraints as equations** (11-constraint-equations.md). Entities and their unknowns: point 2, line 4, circle 3, arc 5 (centre, radius, two angles), ellipse 5, spline control points, rigid frames; construction geometry. Every constraint kind jig has (coincident, horizontal, vertical, parallel, perpendicular, collinear, tangent, concentric, equal, symmetric, midpoint, on, fix, distance, distanceX/Y, length, radius, diameter, angle) as residual functions, grouped by family, with how many equations each adds. Design choices in a residual and why they matter: components rather than a distance for coincidence (the gradient of |p − q| at 0), unsigned vs signed distances, cross and dot products for parallel and perpendicular, normalised forms and conditioning, angles without atan2 discontinuities, tangency with its two branches. Dimensions as driving equations whose value is an expression of params; driven (reference) dimensions. The Jacobian: what a row and a column mean; jig's five-point finite differences and their error, against analytic or automatic differentiation. Work one small sketch's Jacobian out by hand and check its rank against the L3 dump.

**12 · Counting freedom** (12-counting-freedom.md). DOF = n − rank J and why counting equations is not enough: Maxwell's count for bar frameworks (2n − 3 in the plane), Laman's theorem for generic rigidity, and why special positions break both (three angles of a triangle, parallel lines). The three rigid motions of an unanchored sketch. Numerical rank: rank-revealing QR with column pivoting, the tolerance, and what happens near a singular configuration. Which coordinates are free: the null space of J, how jig reports free entities and the DOF overlay. Measured examples, including a rigidity counterexample the reader can build.

**13 · Solving the equations** (13-solving.md). Newton–Raphson for square systems and its quadratic convergence; Gauss–Newton and the minimum-norm step for non-square systems (why the least-change solution keeps a sketch close to its drawing); Levenberg–Marquardt damping; Powell's dog leg and trust regions; what jig runs (dog leg by default, LM fallback, the solver slot `.solver(…)` if it exists — check the source) and its tolerances. Branches: a solve picks one of several solutions, the drawing chooses it, and a mirrored drawing gives the mirrored solution. Basins of attraction and failure to converge. Iteration counts measured on real sketches.

**14 · Redundancy and conflict** (14-redundancy-and-conflict.md). Consistent dependence (redundant) vs inconsistent (conflicting); detecting dependent rows incrementally; expressing a dependent row as a combination of others to name which constraints repeat each other; the feasibility test after a least-squares solve; minimal conflicting sets (irreducible infeasible subsets) by a deletion filter, its cost, and QuickXplain as an alternative; the suggested fix ("make it driven: it measures …"). Near-conflicts and ill-conditioning: a constraint set that is solvable but barely.

**15 · Decomposition and dragging** (15-decomposition-and-dragging.md). Why decompose: speed, and errors that stay local. What jig does: clusters as connected components of the unknown–equation graph, solved one by one. What finer methods do: bipartite matching and the Dulmage–Mendelsohn decomposition into well-, over- and under-constrained parts, rigid-cluster (graph-constructive) solvers; their limits. Dragging: a soft target on the dragged point, warm-starting from the last solution, least change for everything else, only the dragged point's cluster re-solved, and why fixed and fully constrained entities do not move. Measured drag examples.

**16 · From curves to profiles** (16-curves-to-profiles.md). How solved curves become regions an extrude can use: intersecting segments and arcs (the three cases and their tolerances), splitting curves at intersections, the planar arrangement as a half-edge graph, tracing faces by turning left, signed area of loops with straight and circular pieces (the shoelace formula plus circular segments), nesting by containment depth and the even–odd rule, open curves and dangling edges, near-coincident points. Measured areas against hand computation.

### Part VI · Inside the kernel

**17 · Representing solids** (17-representing-solids.md). What a representation must do (Requicha: validity, completeness, uniqueness, conciseness, closure under operations). CSG trees and point membership classification; boundary representation; meshes; implicit and signed-distance (F-rep) models; voxels; a comparison table on exactness, booleans, blends, size and what a printer needs. Boundary evaluation (CSG to B-rep). How jig layers them: the feature list as a history, OpenCascade B-rep for geometry, meshes for display, slicing and the quick interference check.

**18 · Curves and surfaces** (18-curves-and-surfaces.md). Parametric curves; Bézier curves and de Casteljau; B-splines (knots, degree, local control) and de Boor; NURBS and the exact circle with weights; analytic surfaces (plane, cylinder, cone, sphere, torus) versus freeform B-spline surfaces; surfaces of extrusion and revolution; how jig's features produce each kind and where the engine treats freeform faces differently (the interference check's mesh fallback, gear flanks). Measured: the surface kinds of real faces.

**19 · B-rep from the inside** (19-brep-inside.md). Topology vs geometry. OpenCascade's hierarchy (vertex, edge, wire, face, shell, solid, compound) and its TopoDS/BRep classes; orientation and shared sub-shapes; winged-edge and half-edge structures (Baumgart, Weiler, Mäntylä); Euler operators and why they keep a model valid; seam edges, degenerate edges, pcurves (edge curves in a face's parameter space); per-entity tolerances and tolerant modelling; validity checking. Work one small body completely (every vertex, edge, face, loop).

**20 · How a boolean is computed** (20-computing-booleans.md). The pipeline of a B-rep boolean: bounding-box culling, surface–surface and edge–face intersection, splitting edges and faces, classifying pieces in/out/on, assembling the result, merging same-domain faces. Robustness: floating point, tolerances, coplanar and tangent contacts, slivers, why overlapping by a line width helps. Case study: a fillet whose rim was tangent to another feature's edge made OpenCascade drop that feature's faces without an error; jig now checks that no face away from the blended edges is deleted (`fillet.tooLarge` … "runs into …"). How history (generated, modified, deleted) comes out of a boolean and feeds persistent naming (chapter 6).

**21 · Blends, offsets and shells** (21-blends-offsets-shells.md). The rolling-ball fillet; the surfaces it makes (cylinder along a straight edge, torus around a circular edge, a pipe surface in general); concave vs convex; the closed-form volume of a peg-root fillet by Pappus (the centroid of the spandrel, r(10 − 3π)/(12 − 3π) from the corner) against the kernel (a Ø5 peg on a plate with a 1 mm root fillet adds 3.672 mm³; check it); chamfers; why jig fillets concave edges first; the largest feasible radius by bisection; offset surfaces and their self-intersection (the radius of curvature limit); shells as offsets; draft. Why a fillet at a peg's root matters for printed parts (stress concentration), in a paragraph.

**22 · From B-rep to triangles** (22-brep-to-triangles.md). Tessellation: chordal deviation and angular deflection, the segment count n = ⌈π / arccos(1 − ε/r)⌉ for a circle of radius r within ε, inscribed polygons and the volume they lose; STL and 3MF as approximations vs STEP as exact; watertight and manifold meshes; mass properties exactly (divergence theorem on the B-rep) vs from a mesh (signed tetrahedra), measured on one part; distances between meshes: why vertex-to-triangle distances miss two meshes that pass through each other and the edge–triangle test that catches it (jig's interference check, fixed this way); slicing as plane–mesh intersection (link to chapter 8).

**23 · Building a kernel** (23-building-a-kernel.md). For a reader who wants to write a kernel and solver (for example in Rust, compiled to WebAssembly). What jig asks of a kernel: the operations in src/engine/KERNEL-API.md and the history every operation must report for naming. Three architectures: exact B-rep (OpenCascade, Parasolid style), mesh-first with robust mesh booleans (Manifold style), implicit/SDF (libfive style), and hybrids; what each costs for fillets, naming, exactness and speed. Tolerance policy. The solver: analytic or automatic derivatives, sparse rank-revealing factorisations, decomposition. WebAssembly: size (the OpenCascade build jig loads is about 23 MB, 7 MB compressed; check), memory, threads, determinism. Testing a kernel with laws: closed forms (Cavalieri, Pappus, inclusion–exclusion, Euler–Poincaré) as property tests on random inputs, as jig's law suite does.
