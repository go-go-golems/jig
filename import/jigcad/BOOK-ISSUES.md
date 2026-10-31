# Issues found while writing Parts V and VI

Writers append entries here as they go (append with `cat >> BOOK-ISSUES.md <<'EOF'`, never rewrite the file:
several writers share it). One entry per issue:

## chNN · short title · severity (bug: wrong result / bug: crash / gap: missing feature / doc: wrong or missing docs)
- What: one or two sentences.
- Repro: path to a minimal script under /tmp, or the few lines inline.
- Workaround used in the chapter: …

Important bugs (a wrong number, a crash, lost geometry, a diagnostic that lies) are also sent to the editor right away.


## ch23 · Body.topology() counts degenerate edges: wrong genus for balls, cones, blended corners · bug: wrong result
- What: body.js topology() counts every TopExp edge, including degenerate (zero-length) edges at sphere poles and cone apexes. A ball reports G = 1, a cone G = 0.5, a 20 × 20 × 10 block with all 12 edges filleted (8 spherical corners) G = 4; all are genus 0. Excluding edges with BRep_Tool.Degenerated gives G = 0 for all three. Also: `residual` is zero by construction (G is solved from the same formula), so it can never flag anything; chapter 5 says a nonzero residual means an invalid solid. The law brep.eulerPoincare only has teeth because it compares G with the number of holes it drilled.
- Repro: /tmp/ch23/repro/genus.mjs
- Workaround used in the chapter: ch23 §23.6 explains the counting rule (degenerate edges excluded) and says in one sentence that this build counts them, so a ball reports G = 1; the law sketch uses volume (Steiner), not genus.

## ch23 · Finite-difference step scales with the coordinate, not the feature: false conflict far from the origin · bug: wrong result (diagnostic that lies)
- What: solver.js makeProblem uses h = 1e-4 · max(1, |x|). At x = 500 mm that is 0.05 mm, comparable to a 0.065 mm line, so the five-point stencil of an angle residual is wrong and the rank analysis misreads the rows. A consistent 0.1 × 0.05 mm rectangle at (500, 500) with h/v constraints plus angle 90° gets `sketch.overConstrained` and l2 stays at its 0.065 mm start; at (300, 300) the analysis calls length(l2) redundant instead of the angle. At the origin it is right. Measured FD error on a length row: 2.9e-12 at the origin, 3.7e-7 for a 0.5 mm line at x = 200, above RowSpace's 1e-8 tolerance.
- Repro: /tmp/ch23/repro/fdconflict.mjs
- Workaround used in the chapter: §23.4 uses it as the argument for analytic/automatic derivatives, flagged "in this build"; no figure depends on it.

## ch23 · j.structure ignores its arguments; laws do not shrink; a prop returning `true` fails · gap: missing feature / doc
- What: laws.js structure(sort, kind) returns the suite's structural laws (only shape.boolean) whatever it is given (reference.md lists `j.structure(Sort, kind)` ✓; spec example 43 derives laws from ops). laws.check reports the first failing input without shrinking. A property must return `{ ok }`; a bare `true` counts as a failure (undocumented). j.gen has only rect, length, box.
- Repro: /tmp/ch23/repro/structure.mjs
- Workaround used in the chapter: §23.6 writes its own generator with j.law, returns { ok, got, want }, and says jig reports the first counterexample without shrinking.

## ch22 · mesh interference check misses penetration when no vertex is within 2·clearance + 1 · bug: wrong result
- What: inspect.js meshGap runs the edge–triangle crossing test only when some vertex is already within maxD (1.8 mm); a 2 × 2 mm pin straight through a gear's web, or a cube buried in it, reports "∞ mm" and no asm.interference, while { exact: true } reports 0.000 mm and the error. Containment (one solid inside the other) is never tested on the mesh path.
- Repro: node /tmp/ch21-22/repro-mesh-gap.mjs
- Workaround used in the chapter: ch22 states the gate and the containment gap plainly and recommends { exact: true } when a pair matters.

## ch21/22 (affects ch5, ch19) · body.topology() counts degenerate edges; residual is 0 by construction · bug: wrong result
- What: a box with all 12 edges filleted (r = 3) reports { V: 24, E: 56, F: 26, L: 26, S: 1, G: 4 }: the 8 sphere-pole edges are degenerate and are counted, so the genus derived from the formula is 4 instead of 0. G is computed from V − E + F − (L − F), so `residual` is identically 0 and can never flag an invalid solid (ch5 §5.3 says a nonzero residual means a broken solid).
- Repro: node /tmp/ch21-22/repro-topology.mjs
- Workaround used in the chapter: ch21 quotes face kinds and volume for the rounded box, not V/E/G.

## ch22 · 3MF export is not manifold by the 3MF Core rule (duplicate vertices per face) · gap: missing feature
- What: io.js tmf() writes each face's triangulation with its own vertices; along face boundaries triangle edges do not share vertex indices (Ø10 cylinder: 170 vertices, 84 distinct positions, 170 edges used once). 3MF Core §4.1 requires every triangle edge to share its endpoints with exactly one other triangle. Welding by position gives a closed, consistently oriented mesh (χ = 2), so the fix is to weld before writing.
- Repro: node /tmp/ch21-22/repro-3mf.mjs
- Workaround used in the chapter: ch22 describes it as it is.

## ch22 · STL/3MF report "max deviation" is the deflection parameter, not a bound · bug: diagnostic says something false
- What: the export report says "B-rep → mesh, max deviation 0.050 mm"; the default mesh of a Ø10 sphere is 0.099 mm from the sphere at the equator. On the filleted peg it is 0.007 mm. The number is the mesher's target.
- Repro: node /tmp/ch21-22/repro-deviation.mjs
- Workaround used in the chapter: ch22 calls it the deflection target and gives the measured values.

## ch21 · fillet.order decision labels smooth (seam) edges "concave" · bug: wrong result (cosmetic)
- What: features.js labels every non-convex edge "concave" in the decision; `j.feat('peg').edges()` includes the cylinder's seam, shown as "peg/side[circle] (seam) (concave)". edgeDihedral itself returns 'smooth' and the result is unaffected.
- Repro: node /tmp/ch21-22/repro-seam-label.mjs
- Workaround used in the chapter: ch21 selects with .where(e => e.concave).

## ch21 · fillet.tooLarge search resolution is relative to the requested radius · gap: missing feature (minor)
- What: maxFeasible bisects [0, r] seven times, so the answer is within r/128 of the limit and depends on the request: the peg's root fillet (limit 10 mm, the peg's height) reports 9.922 for r = 10, 9.938 for r = 12, 9.844 for r = 20. The search also assumes feasibility is monotone in r.
- Repro: /tmp/ch21-22/pegmax.mjs
- Workaround used in the chapter: explained in §21.5.

## ch21 · concave-first order has no effect inside one fillet feature · doc: wrong or missing docs
- What: the decision reason ("the root blend adds material, so the rim keeps a full face to roll on") suggests the order matters, but OpenCascade computes all edges of one BRepFilletAPI_MakeFillet together: swapping the Add order gave identical volumes on every case tried (peg, boss, 12 configurations). The order matters between separate fillet features (boss 10 × 10 × 5, rim 2 / root 1: 3164.101653 vs 3162.000892 mm³; rim 4 / root 2 fails rim-first).
- Repro: /tmp/ch21-22/order.mjs, /tmp/ch21-22/order3.mjs
- Workaround used in the chapter: ch21 says what the sort does and where order matters.

## ch22 · no inertia tensor; MatrixOfInertia unbound in the OCC build · gap: missing feature
- What: jig reports volume, area and mass but not the centre of mass or inertia; GProp_GProps.MatrixOfInertia throws "unbound types: gp_Mat" in this build (MomentOfInertia(gp_Ax1) works).
- Repro: /tmp/ch21-22/mass.mjs (uses MomentOfInertia)
- Workaround used in the chapter: ch22 computes inertia in a scratch script and says jig does not expose it.

## ch19 · Body.topology() counts degenerate edges: sphere G = 1, cone G = 0.5 · bug: wrong result
- What: src/engine/body.js topology() takes E from all edges, including degenerate ones (BRep_Tool.Degenerated: sphere poles, cone apex). A sphere reports V 2, E 3, F 1, L 1 → G = 1; a cone G = 0.5. Leaving degenerate edges out gives G = 0 for both (and a torus stays G = 1). Edge naming also calls the sphere's pole edges `ball/surface (boundary)#1/#2`.
- Repro: node /tmp/ch19-20/repro.mjs (sphere, cone).
- Workaround used in the chapter: ch19 §19.7 says jig's count includes degenerate edges and shows the corrected count by hand; update that paragraph if fixed.

## ch19 · Euler–Poincaré residual is 0 by construction; IR prints ✓ for impossible genus · bug: diagnostic says something false
- What: topology() solves G from the counts, so residual = V − E + F − (L − F) − 2(S − G) is always 0 and the IR L4 line always ends ✓, even for G = 0.5 (odd χ, no closed orientable manifold has it). The meaningful check is that χ is even / G is a non-negative integer (or compare with an independent genus). Chapter 5 says a nonzero residual flags a broken solid; it never can be nonzero.
- Repro: node /tmp/ch19-20/repro.mjs (cone, tangent hole: G 0.5 with ✓ in `prog.ir.L4`).
- Workaround used in the chapter: ch19 §19.9 tells the reader to read G, not the ✓.

## ch19 · A hole tangent to the outline extrudes to a wrong solid with no diagnostic · bug: wrong result
- What: rect 20 × 20 with circle r 4 at (6, 0) (touching the right side at (10, 0)), extruded 10 mm: the profile areas are right (349.73, 50.27 mm²) but body1 is 4,502.65 mm³ (more than the 4,000 mm³ box: its caps' single loop runs round the rectangle and the circle, adding the disc) plus a separate disc body of 502.65 mm³. BRepCheck_Analyzer passes body1; only χ = 1 (G = 0.5) shows it is not a manifold solid. No warning is raised.
- Repro: node /tmp/ch19-20/repro.mjs (tangent hole).
- Workaround used in the chapter: ch19 uses it as the example of a body BRepCheck accepts and Euler–Poincaré rejects; the sketch uses it on purpose with the numbers stated.

## ch20 · fillet.tooLarge for a tangent rim claims "too large" and a false maximum · bug: diagnostic says something false
- What: test 42's hub fillet fails only within about 5e-8 mm of r = 1 (r = 1 − 1e-8 and 1 + 1e-9 lose the crank; 1 − 5e-8, 1 + 1e-8, 1.5, 2 keep it, valid). The message says "r = 1 mm is too large … the largest that works is about 0.992 mm", but 1.5 mm compiles fine; maxFeasible's bisection assumes failure is monotonic in r. Better: say the rim is tangent to another feature's edge and suggest moving off the tangent radius either way.
- Repro: node /tmp/ch19-20/repro.mjs (fillet r=1, r=1.5); radius scan in /tmp/ch19-20/band.mjs.
- Workaround used in the chapter: ch20 §20.7 quotes the message and explains that both smaller and larger radii work.

## ch19 · Binding gaps for the B-rep chapters · gap: missing feature
- What: the replicad OpenCascade build has no TopExp::MapShapesAndAncestors, BRepTools_WireExplorer, BRepClass3d_SolidClassifier, BOPAlgo_ArgumentAnalyzer or BRepCheck status lists, so the chapters cannot show OCCT's edge-to-face map, connected wire order, point classification or why BRepCheck rejects a shape (only IsValid). Not needed by the engine; noted for chapter 23.
- Repro: `Object.keys(getOC())` lacks them.
- Workaround used in the chapter: wire order recovered by chaining pcurve end points; classification shown through General Fuse solids.

## ch15 · drag step drifts coordinates the target does not determine (~1e-4 mm); dragging a fixed point moves free ones · bug: wrong result
- What: dragCluster (src/engine/sketch/solver.js) solves the 2×k least-squares problem M z = rhs in the null space through the regularised normal equations (MᵀM + 1e-12·tr·I) z = Mᵀ rhs. MᵀM has rank ≤ 2, so for k > 2 its condition number is ~1e11–1e12 and rounding leaks into directions the target does not touch. Measured: free 40 mm-wide rectangle, drag top-right to (46, 26): the bottom ends at y = −7.4e-5 (want 0); the 3-DOF outline of ch3 drag gives a foot of 7.999915 (ch3's table rounds to 8); dragging the fixed base of a two-link arm moves the elbow by 2.6e-4 mm and `moved` reports [l1, l2] (want []). Suggested fix: solve the 2×2 system (M Mᵀ) w = rhs, z = Mᵀ w (or QR/SVD of M with a rank cutoff), and skip the step when M has rank 0.
- Repro: /tmp/ch15-16/bug-drag-drift.mjs
- Workaround used in the chapter: ch15 prints the measured values and explains the cause in a short numerical note.

## ch16 · a hole within ~0.05 mm of an arc boundary is not nested (hole lost) · bug: wrong result
- What: buildProfiles (src/engine/sketch/profiles.js) decides nesting with pointInPoly on the sampled display polygon (chord sagitta up to 0.05 mm), probing a point on the inner loop. A Ø2 circle 0.04 mm inside a Ø100 circle (on the −x axis, between two samples) comes out as two profiles, big 7853.98 and small 3.14 mm², instead of big∖{small} 7850.84 mm²; extruding the profiles fills the hole. At 0.06 mm it is right.
- Repro: /tmp/ch15-16/bug-nesting.mjs
- Workaround used in the chapter: ch16 states the limitation with this measurement in its "what jig does not do" section.

## ch16 · sliver faces become profiles · gap: missing feature
- What: a circle that pokes through a line by 1e-5 mm makes a third profile of 1.3e-7 mm² (r = 5.00001 at (20, 15) in a 40 × 20 rectangle); there is no sliver filter beyond area > 10·ε². A circle touching the outline from inside (within ε) turns the would-be hole into its own profile, so extruding all profiles fills it.
- Repro: `j.sketch('s').polyline('r', [[0,0],[40,0],[40,20],[0,20]], { closed: true }).circle('c', 5.00001, { at: [20, 15] })` → 3 profiles.
- Workaround used in the chapter: described as behaviour, with a table.

## ch18 · Closed sketch splines: the solid is not the curve the sketch draws · bug: wrong result
- What: for a closed `.spline(…, { closed: true })` the profile hands the kernel the control points, and shapes.js segEdges always runs GeomAPI_Interpolate (periodic cubic through the points), whatever `fit` is. With `fit: 'control'` the sketch draws (and reports the area of) a uniform B-spline controlled by the points, 618.53 mm², while the solid is the interpolant through them, 908.34 mm² (+47 %). With the default `fit: 'interp'` the sketch draws a centripetal Catmull–Rom (871.46 mm²) and the solid is still the C² interpolant (908.34 mm², +4.2 %). Open splines are fine to ~2e-4 relative (the kernel interpolates 24 samples per span of the sketch's curve, so a 4-point spline becomes a 75-pole B-spline).
- Repro: node /tmp/ch17-18/repro-closed-spline.mjs (imports /tmp/ch17-18/base.mjs)
- Workaround used in the chapter: ch18 §18.3 states the mismatch with these numbers and uses open splines (closed by a line) in figures.

## ch18 · faceInfo gives reversed normals for planes on a left-handed frame (revolve caps): '-Z' selects nothing · bug: wrong result
- What: kernel.js faceInfo takes a plane face's normal from gp_Pln.Axis().Direction() and flips it only for REVERSED faces. The caps of a revolve lie on an indirect (left-handed) gp_Ax3, where Axis().Direction() is opposite to S_u × S_v, so the bottom cap of a revolved disc reports normal (0, 0, 1): `faces('-Z')` returns [] and `faces('+Z')` returns both caps. normalMidUV (D1 cross product) gets it right. Overhang analysis is unaffected (exactNormal re-aligns with the facet normal), selectors and face records are not.
- Repro: node /tmp/ch17-18/repro-revolve-normal.mjs
- Workaround used in the chapter: ch18 §18.5 mentions the left-handed-frame pitfall and that jig's face records get it wrong for revolve caps; no figure selects a revolve cap by normal.

## ch18 · Tapered extrude of a polygon: flat sides stored as degree-1 B-spline surfaces · gap: missing feature
- What: taperedPrism lofts with ThruSections(ruled); for straight edges the result is a bilinear BSplineSurface (2 × 2 poles, exactly planar), not a Geom_Plane. faceInfo calls them 'bspline', so `%plane` misses them, the interference check uses the mesh path, slicing uses the display mesh, and boolean SimplifyResult is skipped for them as tools. A circle tapers to an exact cone.
- Repro: node /tmp/ch17-18/repro-taper-bspline.mjs
- Workaround used in the chapter: ch18 §18.6/18.7 reports it as measured.

## ch18 · KERNEL-API says gears have "exact involutes" · doc: wrong or missing docs
- What: each flank is a cubic B-spline (12 poles, GeomAPI_Interpolate) through 10 samples of the exact involute. Max normal deviation from the involute: 1.3e-4 mm for m = 2, z = 18 (largest near the base circle); 3.3e-3 mm with 5 samples, 1.5e-5 mm with 20. Accurate far beyond printing, but not exact; the root fillet is likewise a 17-pole interpolant of the trochoid.
- Repro: /tmp/ch17-18/t17.mjs
- Workaround used in the chapter: ch18 §18.7 gives the measured deviation.

## ch13/14 · A failed local solve is reported as "no solution": false sketch.overConstrained · bug: wrong result (diagnostic that lies)
- What: solveCluster treats any non-converged solve with residual > 1e-8 as a conflict. A consistent triangle (base fixed 60, sides 35 and 40; two solutions, apex (33.125, ±22.42)) drawn with its apex on the base line (J singular there: the min-norm step never leaves the line) gets `sketch.overConstrained: no solution; minimal conflicting set: fix(t.1) · length(t.2) = 35 mm · length(t.3) = 40 mm`. The same sketch with `.solver(j.solver.lm({ maxIter: 3 }))` gets two "no solution" sets. A conflict needs evidence of a dependency (rank < m with a nonzero residual on it), a perturbed restart, or a softer kind ("did not converge from this start").
- Repro: node /tmp/ch13-14/repro.mjs (cases 1a, 1b)
- Workaround used in the chapter: ch13 §13.8 shows case 1a as a sketch with `// expect: sketch.overConstrained` and says plainly that the diagnostic is false here; ch14 §14.4 says the feasibility test is local.

## ch14 · Two independent conflicts in one cluster: first reported set mixes both, "drop one of the 8" is false · bug: wrong result (diagnostic that lies)
- What: the outline of ch3 with dim(p.3) = 50 (x-chain conflict) and dim(p.4) = 30 (y-chain conflict) reports first {vertical×3, length(p.1), length(p.6), length(p.2), length(p.5), length(p.3)}; length(p.6) and length(p.2) belong to the y-chain, and dropping length(p.6) leaves the x-conflict in place (case 2b). The deletion filter runs while the other conflict is still present.
- Repro: node /tmp/ch13-14/repro.mjs (cases 2a, 2b)
- Workaround used in the chapter: ch14 §14.5 mentions it in one sentence as a limit; all examples have one conflict.

## ch14 · Minimal conflicting set is minimal relative to a hard background, not an IIS of the sketch · doc: wrong or missing docs (and ch3)
- What: with more than 10 candidates the filter holds every constraint outside the first-order dependency fixed. ch3's conflict reports 6 constraints; horizontal(p.1) is omitted although removing it alone also makes the sketch solve (p.1 tilts to (58, 15.36), case 4b); a plain deletion filter over all 12 user constraints returns 7 (with horizontal(p.1)), 13 feasibility tests against 8. Extreme case: perpendicular(p.1, p.3) on two horizontal lines reports a one-element "conflicting set" {perpendicular(p.1, p.3)} (its Jacobian row vanishes at parallel lines, so the support is just that row and the rest is hard). docs/solver.md and ch3 describe the set as one "any one of which can be removed to fix it" without saying relative to what.
- Repro: node /tmp/ch13-14/repro.mjs (cases 3, 4a, 4b); scratch copy with counters: /tmp/ch13-14/filter.mjs (+ solver_inst.js)
- Workaround used in the chapter: ch14 §14.5 explains the hard background and the second-order reason horizontal(p.1) is missed.

## ch13 · 'bfgs' slot runs Levenberg–Marquardt and is reported as "bfgs" · gap: missing feature
- What: RUN.bfgs = levenbergMarquardt and pickStrategy('bfgs') keeps method 'bfgs', so the decision reads `solver → bfgs · slot; converged in 5 iterations` with LM's exact iterates; the unknown-solver error lists only dogleg, lm, newton.
- Repro: node /tmp/ch13-14/repro.mjs (case 5)
- Workaround used in the chapter: not mentioned; ch13 lists dogleg, lm, newton only.

## ch13/14 · Decision and L3 dump show only the last solve of a cluster · gap: missing feature
- What: after a conflict is found and a constraint dropped, the cluster is re-solved from the drawing, and only that solve's method and iterations are reported (ch3's conflict reads `dogleg · default; converged in 0 iterations`); the failed dog-leg solve, its LM fallback (13 iterations to the least-squares point) and the deletion filter's 8 test solves are invisible.
- Repro: node tools/book-check.mjs 3 --detail (the "A conflict to find and fix" block)
- Workaround used in the chapter: ch14 §14.4 says so and gives the hidden numbers from scratch runs.

## ch11 · distance(p, q, 0) between points gives a wrong DOF and a false "redundant" · bug: wrong result (diagnostic that lies)
- What: `j.c.distance('b', 'a', 0)` with `a` fixed pins `b`, but the residual ‖p − q‖ has no derivative at its zero. Drawn apart: solves, then the five-point quotient gives a row of ~1e-7 (≈ 1.17·gap/h), rank 3, "1 DOF remain · free: b (1: x, y)". Drawn on `a`: the row is exactly 0 and the warning says "distance(b, a) = 0 mm is implied by the other constraints; dropped", DOF 2. `coincident` gives rank 4, DOF 0. Suggest rewriting a point–point distance of 0 as a coincidence (or rejecting it).
- Repro: node /tmp/ch11-12/repro/distance0.mjs
- Workaround used in the chapter: ch11 §11.4 uses it as the worked argument for coincidence by components, with the measured table and a sketch block.

## ch12 · a solvable sketch drawn in a special position is reported as overConstrained · bug: wrong result (diagnostic that lies)
- What: a 30–40–60 mm triangle drawn with its corners collinear ([0,0],[30,0],[70,0]) gets `sketch.overConstrained: no solution; minimal conflicting set: length(t.1) = 30 mm · length(t.2) = 40 mm · length(t.3) = 60 mm`. The start is a singular point (J rank 11 of 12, the lift direction has zero gradient), the linear model is inconsistent along the line, and the solver never leaves it. Lifting the middle corner by 0.001 mm solves in 5 iterations. A small random perturbation of the start when the solver stalls at a rank-deficient point with nonzero residual would fix it.
- Repro: node /tmp/ch11-12/repro/flatconflict.mjs
- Workaround used in the chapter: ch12 §12.6 shows it as what happens at a singular configuration, says the conflict is false, and the sketch block tells the reader to lift the corner.

## ch11 · sketch `.import(id, region)` rejects every j.region · bug: crash-like (feature unusable) / doc
- What: reference.md lists `.import(id, region)` ✓ with the example `.import('logo', j.region.text('A'))`; it fails with `sketch.unsupported import logo: the region has no loops` (also for j.region.rect). ops.js regionLoops() looks for toLoops()/loops/profiles; a Region has toProfile(). A raw array of points works and gives a rigid frame with 3 unknowns.
- Repro: node /tmp/ch11-12/repro/import-region.mjs
- Workaround used in the chapter: Figure 11.1 imports a list of corner points.

## ch11 · driven angle (and the angle conflict fix) reports the exterior angle · bug: wrong result (minor)
- What: measure('angle') returns |atan2(u × v, u · v)| between the two lines' direction vectors, so at a 30° polyline corner a driven angle reads 150°, and a conflict involving dim(t.3, t.1) = 31° says "make dim(t.3, t.1) driven (it measures 150°)". The driving residual accepts 30° or 150° (target chosen from the drawing), so the measured value should use the same branch the user wrote.
- Repro: node /tmp/ch11-12/repro/driven-angle.mjs
- Workaround used in the chapter: ch11 §11.5 and ch12 §12.5 say plainly that driven angles are measured between directions.

## ch12 · stage DOF label counts free coordinates, the inspector and warning count entity DOF · gap: UI inconsistency (from source)
- What: src/stage/sketch.js labels a free entity `${e.id} · ${e.dofFree.length} DOF` (free parameters), while sketch-inspector.jsx and sketch.underConstrained use e.dof (rank of the null-space projector on the entity). An unanchored triangle's side shows "4 DOF" on the stage and "(3: start, end)" in the warning. Read from source, not from a rendering.
- Repro: compile `j.sketch('t').polyline('t', [[0,0],[40,0],[40,30]], { closed: true }).dim('t.1',40).dim('t.2',30).dim('t.3',50)`; entityData() gives dof 3, dofFree of length 4 per line.
- Workaround used in the chapter: ch12 §12.7 explains both numbers.

## ch11 (see ch23 entry) · FD step relative to |x|: measured Jacobian errors · bug: wrong result
- What: confirms the ch23 entry. Error of jig's J against analytic gradients (length / parallel rows): 5.3e-11 / 6.8e-13 for a 50 mm line at the origin; 2.1e-5 / 8.9e-5 for a 1 mm line at (1000, 1000); 9.6e-2 / 0.93 at (10000, 10000).
- Repro: /tmp/ch11-12/ex6.mjs
- Workaround used in the chapter: ch11 §11.3 quotes the numbers and says printed parts live near the origin.

## ch21 · shell failure message reads "failed: undefined" · bug: diagnostic says something false (cosmetic)
- What: A-01 with wall = 3 mm (equal to its 3 mm corner radius) gives `feature.failed: shell of body1 by 3 mm failed: undefined`; OpenCascade threw a non-Error, and features.js interpolates e.message. With wall = 3.5 the text is "shell failed".
- Repro: compile content/presets/A-01-box/script.js with options.override { wall: 3 } (/tmp/ch21-22/a01.mjs).
- Workaround used in the chapter: the text quotes the 2 mm / 1 mm-corner case, whose message is "shell failed".

## ch19 · IR L4 formula with a half-integer genus prints "= 1 ✗" for an expression that equals 0 · doc: wrong or missing docs
- What: after the genus fix, the tangent-hole body prints `10 − 17 + 8 − (8 − 8) − 2(1 − 0.5) = 1 ✗`; the expression as printed evaluates to 0 (the 1 is the residual against the rounded genus 0). Printing χ = 1 (odd) or the rounded genus would read correctly.
- Repro: compile /tmp/ch19-20/repro.mjs's tangent hole and read `prog.ir.L4`.
- Workaround used in the chapter: ch19 quotes the brep.invalid warning and says the IR marks the formula ✗, without quoting the line.

## ch11/ch12 · status update · fixed in the build of 18:16
- What: the entries "distance(p, q, 0) between points…" and "a solvable sketch drawn in a special position is reported as overConstrained" are fixed in this build (constraints.js rewrites a zero point distance as two component equations; solver.js retries once from a perturbed drawing before the conflict search). Both repros now print rank 4 / `fully`. ch11 §11.4 and ch12 §12.6 describe the fixed behaviour. Still open: sketch .import of a j.region, the driven-angle exterior value, the stage DOF label.

## ch19–20 · status after the editor's fixes · note
- What: verified on the rebuilt engine: degenerate edges are no longer counted (sphere and cone G = 0), a non-whole genus now raises brep.invalid, and the tangent fillet raises fillet.tangent ("0.98 mm and 1.02 mm work"). Both chapters describe the fixed behaviour. Still open: the tangent-hole solid itself (4,502.65 mm³ block plus a disc body; only the warning is new), the IR L4 "= 1 ✗" wording, and the binding gaps.
- Repro: node /tmp/ch19-20/repro.mjs
- Workaround used in the chapter: none needed beyond the text in §19.9.

## ch23 · update: genus fix verified, chapter rewritten · note
- What: after the engine fix, /tmp/ch23/repro/genus.mjs gives G = 0 for the ball, the cone and the filleted block (E = 48 for the block). §23.6 now describes the parity check (G must be a whole number ≥ 0, else `brep.invalid`) and the skipped degenerate edges. The FD-step false conflict (/tmp/ch23/repro/fdconflict.mjs) still reproduces and is kept in §23.4 as a known limitation.
- Repro: as above.
- Workaround used in the chapter: none needed now for the genus.

## Editor · status after the low-hanging fixes (31 Oct)
Fixed in the engine:
- topology: degenerate edges skipped; genus must be a whole number ≥ 0; `brep.invalid` warning and an honest L4 line otherwise (ch19, ch21, ch23 reports)
- plane normals on left-handed frames (revolve caps) (ch18)
- mesh interference: crossing test for every near pair, plus ray-parity containment (ch22)
- export report: "linear deflection setting", not "max deviation" (ch22)
- tangent fillet rim: `fillet.tangent` with radii either side that work, no false maximum (ch20)
- drag: exact minimum-norm step, no drift (ch15)
- nesting: the outer loop's sampled points vote (ch16)
- singular starts retried once from a slightly moved drawing before conflicts are sought (ch11, ch13)
- distance(p, q, 0) is two component equations (ch11)
- `.import(id, j.region…)` works (rect, circle, slot, text, booleans) (ch11)
- 3MF writer welds vertices: every edge shared by two triangles (ch22)
- "failed: undefined" in shell/draft/pattern messages (ch21)
- docs: gear flanks are B-spline fits through the involute (ch18)

Open (in the text as behaviour or limitations):
- two independent conflicts in one cluster mix in the first reported set; a too-small explicit iteration cap gives a false conflict
- finite-difference step grows with the coordinate (false conflict for tiny features far from the origin)
- closed sketch splines: the solid is not the drawn curve
- a hole tangent to its outline still builds a wrong solid (now warned)
- tapered extrude stores flat sides as degree-1 B-splines
- sliver profiles; a circle touching the outline within ε stops being a hole
- 'bfgs' runs LM; decisions and L3 show only the last solve; driven angle reads 150° at a 30° corner
- law suite: j.structure ignores its arguments, no shrinking, bare `true` fails
- fillet.order labels; concave-first order inside one feature; fillet.tooLarge resolution r/128
- no centroid/inertia exposed (MatrixOfInertia unbound); OpenCascade binding gaps (ancestors, wire explorer, classifier)
- STL export reply `triangles: undefined`
