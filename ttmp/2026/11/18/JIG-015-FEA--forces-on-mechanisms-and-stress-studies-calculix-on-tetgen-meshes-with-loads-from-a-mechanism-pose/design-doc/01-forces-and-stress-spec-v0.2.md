---
Title: 'jig assemblies and parts: API spec v0.2, forces (L5) and stress studies (L6)'
Ticket: JIG-015-FEA
Status: active
Topics:
    - assembly
    - engine
    - fea
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - import/jigcad/src/engine/dynamics.js
    - import/jigcad/src/engine/assembly.js
    - import/jigcad/src/engine/fea.js
    - import/jigcad/src/fea/solve.js
    - import/jigcad/tools/fea-wasm/build.sh
ExternalSources:
    - https://github.com/calculix/calculix
    - https://github.com/ufz/tetgen
    - https://github.com/fcweb-project/freecad-web
Summary: >
  Layer 5 adds forces to a mechanism's studies (inverse dynamics on the solver's own joint Jacobian); layer 6 adds
  j.fea stress studies (TetGen C3D10 meshes, CalculiX or a JavaScript reference solver), which can take one
  component's loads from a mechanism pose.
LastUpdated: 2026-11-18T12:00:00-05:00
---

# jig: API spec v0.2, forces and stress studies

Nov 18, 2026 · extends [spec v0.1](../../../14/JIG-014-MECHANISMS--assemblies-as-mechanisms-joints-solved-together-mobility-by-rank-drives-couplings-studies-and-a-mechanism-view/design-doc/01-assembly-spec-v0.1.md)

## Purpose and scope

v0.1 made an assembly a mechanism: joints solved together, drives, studies of readings over a cycle. It left forces out. v0.2 adds two layers on top. **L5** says what each joint carries over a study, and what torque the drive needs. **L6** says whether one part survives a set of loads: peak stress, safety factor and sag. The two layers connect: a stress study can take one component's loads straight from a mechanism pose, so the rod of the slider-crank is checked against the force its pins carry at the worst point of the cycle, with no numbers copied by hand.

```
L4 Readings   .measure · .event · .study        numbers off the pose
   │ masses from the parts, drive rate, gravity, applied wrenches
L5 Forces     .speed · .gravity · .wrench · .reactions     F:<joint>, T:<drive> in every study row
   │ one component's wrenches and body load at one pose
L6 Stress     j.fea · .fix · .force · .pressure · .from    von Mises, safety factor, displacement
```

In scope: rigid-body inverse dynamics (no friction, no compliance); linear static stress on one solid body (linear elastic, isotropic, small displacements, rigid supports); the result as part of the Program (metrics, diagnostics, decisions, trace), the stage and the agent.

Out of scope for v0.2: forward dynamics (time integration), friction and contact, buckling, modal and fatigue analysis, heat, anisotropic printed parts (only a weak-direction strength), assemblies of several deformable parts.

## Design rules this follows

The API keeps the language's rules (fluent immutable builders over a core grammar; lambdas at build time or at run time; an IR with levels; guard proxies that teach; fragments). Concretely:

- **Builders, not new syntax.** Forces are four more methods on the assembly builder. A stress study is a new component, `j.fea(name, opts)`, with the same `_w` copy-on-write builder as a part, the same `.use .with .set` fragment hooks, and the same `compile(opts, ctx)` entry the program loader dispatches on (`value.isFeaStudy`).
- **Lambdas where the load depends on the pose.** `.wrench(ref, row => vector | null)` runs per study row, at compile time, in the same pass that solves the pose.
- **Selections are the language's selections.** Faces are named by `j.feat(…)` and `j.sel.faces(…)`, so a fixture keeps hold of its face through edits.
- **Two phases for slow work.** The compile returns the part with `fea.status: 'pending'` at once; the solve follows as a second engine op (`'fea'`), and the host swaps the program in when it arrives unless a newer compile came first. A study that has been solved is cached by its job key.
- **Every number with its fidelity, every choice with its decision.** Mesh size, refinement, solver, held seat, pose and gravity are decisions; the stress metrics are `approx`.

## L5: forces on a mechanism

```js
const head = j.assembly('head')
  .add(...).joint(...).drive('main', ...)
  .speed('main', turn(3000).div(minute(1)))       // drive rate: inertia enters
  .gravity('-Y')                                  // 1 g; '-Z' by default once forces are asked for; false drops it
  .wrench('slider:wrist', r => r.clamp < -70 ? [0, N(4), 0] : null, { label: 'cloth' })
  .study('cycle', { drive: 'main', from: 0, to: turn(1), steps: 72 })
  .reactions('cycle')
```

Every row of `cycle` gains `F:<joint>` (the magnitude of the force the joint puts on its b side, N) and `T:<drive>` (the drive torque, N·mm, or force for a slider), so `extrema`, `events` and `report` work on them as on any reading. The study keeps the vectors: `forces[k].joints[id] = { F, M, at }`, in world coordinates at the joint's origin.

**Masses.** Each component's mass, centre and inertia tensor come from its triangle mesh by the divergence theorem, with the density of its material (PLA when it names none, with a decision saying so). Units throughout L5 and L6: mm, N, s, t (density g/cm³ × 10⁻⁹), so N·mm for moments and MPa for stresses.

**Kinematics.** At each study row the poses at drive ± h (0.25° or 0.05 mm) are solved with the same continuation, and velocities and accelerations come from central differences at constant drive rate: v = (x₊ − x₋)/2h · ω, a = (x₊ − 2x + x₋)/h² · ω², rotations through log SO(3).

**Reactions.** d'Alembert: the generalised forces Q = Σ (applied + weight − m a, applied moments − I α − ω × I ω) over the bodies, and Jᵀ λ = −Q on the solver's own joint Jacobian (drive and coupling rows included). Where the joint rows are redundant (coaxial bearings, a planar loop in 6D), λ is the minimum-norm solution of (J Jᵀ + μ I) λ = J b; the diagnostic `asm.forcesSplit` says the split is the least-norm one, not the shop's. A joint's wrench is assembled from its own rows; a drive's λ is its torque; a coupling's λ is split between its two joints.

**Diagnostics.** `asm.forces` is an error when reactions are asked for a study that does not exist, and a warning when the joints cannot hold the loads in balance at some pose (relative residual over 10⁻⁶: a free motion is not driven, or a load pushes along it); `asm.wrench` (error) names a port the component does not have; `asm.forcesSplit` (info) on redundancy.

## L6: stress studies

```js
const beam = j.part('beam').extrude(j.sketch('s', { on: j.plane.YZ }).rect('r', 6, 6, { center: true }).profiles(), mm(60), { id: 'body' })
return j.fea('cantilever', { part: beam, material: j.material('steel') })
  .params({ F: N(20) })                                     // a slider in the Params view
  .fix(j.feat('body').startFace(), { label: 'root' })
  .force(j.feat('body').endFace(), 'F', { dir: '-Z', label: 'tip' })
  .margin(2)
  .mesh({ size: mm(3) })
```

| Method | Meaning |
| --- | --- |
| `j.fea(name, { part, material, margin, solver })` | a study of one solid body; the material defaults to the part's, then PLA |
| `.fix(faces)` · `.roller(faces)` | all displacements zero · zero normal displacement (a frictionless support; a non-axis-aligned face gets a local frame) |
| `.force(faces, value, { dir })` | a total force spread as a uniform traction (consistent T6 loads); a vector, or a magnitude (quantity or param name) with a direction |
| `.pressure(faces, MPa(p))` | positive into the surface |
| `.gravity(dir)` · `.accel(g, { dir })` | the part's weight; a steady acceleration, whose inertia loads the part the other way |
| `.from(asm, { component, study, at, hold, faces })` | one component's loads at one pose of a mechanism study (below) |
| `.margin(n)` | the safety factor to keep (2) |
| `.mesh({ size, refine, budget })` | element size (a thirtieth of the bounding diagonal by default); refine once at half size when SF < 3, within `budget` dof (150 000) |
| `.check('displacement', { limit, faces })` | a sag limit, as a finding |
| `.solver('ccx' \| 'js')` | CalculiX when its module is present, else the reference solver in JavaScript |
| `.params .use .with .set` | as for parts |

**Loads from a mechanism.** `.from(head, { component: 'rod', study: 'cycle' })` reads the component's L5 results. `at` is a drive value or `'worst'` (default: the row where Σ|F| over its joints is largest). Each joint on the component becomes a *seat*: the faces of the component that are cylinders coaxial with the port's z axis (a bore, a pin), or the faces named in `faces: { port: selector }`. One seat is held (`hold`, else the joint toward ground in the placement tree); the others carry their joint's wrench as a distributing coupling (the force and moment spread over the seat's nodes by area weights, f_i = w_i F/W + w_i (I⁻¹ M_c) × r_i; `mode: 'bearing'` weights max(0, −n·F̂) so a pin pushes only on the half of the bore it bears on). Applied `.wrench`es on the component are carried the same way, and the component's inertia and weight become a body load ρ(g − a(x)) with a(x) = a₀ + α × r + ω × (ω × r). All of it is transformed into the part's own frame. The study then checks that the reaction at the held seat matches the mechanism's λ for that joint (`fea.mechanismBalance` when they differ by more than 2%).

### Pipeline

1. **Surface.** The part's display mesh with its face index per triangle, welded (tolerance 10⁻⁷ of the diagonal) into a closed piecewise-linear complex; facet markers are face index + 1, so every element face knows which named face it lies on.
2. **Mesh.** TetGen on the `.smesh`, switches `-pq1.414/12a<vmax>zQ` with vmax = size³/(6√2); quality-bounded linear tetrahedra.
3. **Quadratic.** Midside nodes on every edge (straight-sided C3D10; curved faces are faceted at the display mesh's tolerance), boundary faces as 6-node triangles with outward normals.
4. **Loads.** Consistent nodal loads: tractions on T6 faces (corner 0, midside A/3 per unit traction), wrenches by distributing coupling, body loads with a degree-3 Keast rule.
5. **Solve.** CalculiX: an input deck (`*NODE`, `*ELEMENT, TYPE=C3D10`, `*BOUNDARY`, `*TRANSFORM` for rollers, `*CLOAD`, `*STATIC`, `*NODE PRINT` U and RF with totals, `*EL PRINT` S), run in a fresh module instance with an in-memory file system, results read from the `.dat`. CalculiX prints RF as the internal force K·u at every component of a printed node, so a load applied on a held node (a body load, a pressure on a supported face) never shows as a reaction; jig subtracts the applied nodal forces (R = K·u − f), which is what the reference solver reports. The `.dat` carries 7 significant digits, which bounds how closely the reactions balance (about 10⁻⁷ relative). The reference solver assembles the same stiffness (4-point rule, block CSR) and runs projected PCG with a block-Jacobi preconditioner; it exists so a study runs where the module does not, and to cross-check CalculiX.
6. **Post.** Integration-point stresses extrapolated to corner nodes and averaged; von Mises per node; peak (nodal) and Gauss peak; per-face max and mean; displacement magnitude; reactions summed over the unique supported nodes and compared with the applied total. A solve whose reaction differs from the load by more than 10⁻³ is refused (`fea.unbalanced`).

### Results

- **Metrics:** `stress` (nodal peak, MPa), `stressGauss`, `safetyFactor` (strength / peak), `displacement` (mm), `feaDOF`.
- **Diagnostics:** `fea.yields` (error: SF < 1), `fea.lowMargin` (SF < margin), `fea.peakAtFixture` (under the margin, with the peak on a held face that refinement did not settle: a rigid support exaggerates stress, read it a little away), `fea.peakConcentration` (under the margin, with the integration-point peak over 1.5× the nodal one: a concentration the mesh does not resolve), `fea.meshNotConverged` (halving the element size moved the peak by more than 10%), `fea.largeDisplacement` (it moves more than 1% of its diagonal: the small-displacement model is stretched), `fea.displacement` (a `.check` missed), `fea.mechanismBalance`, `fea.solverNote`.
- **Decisions:** mesh size and why, refinement, solver, pose, held seat, seats found per port.
- **Trace:** a pass `fea` at level L6 with the element and dof counts, the solver, and the mesh and solve times.
- **`program.fea`:** status, solver, material, strength, margin, peak `{ value, at, faces }`, gauss, displacement, mesh `{ size, nodes, elements, dof, refined }`, applied loads and their total, reaction, balance, checks, pose, per-face stresses, and a surface field (positions, triangles, face markers, von Mises and displacement per vertex) for the stage.

### Stage and agent

- The worker answers the `'fea'` op with a patch (`ok`, `fea`, `metrics`, `summary`, `diagnostics`, `decisions`, `trace`; the stress field a copy) that the host lays over the program the compile gave: the meshes went to the page with the compile's reply, by transfer, so they are detached in the worker and are not sent twice. The program's stress field is its own copy of the cached result's, for the same reason.
- The study's material is the part's for that program: a part that names none (or another) is weighed and costed in the study's material, with a decision saying so.
- The stage's **Stress** overlay hatches each face by its stress band, densest at the peak, with a label `σ … MPa · SF …`; the sheet's title block gains STRESS, PEAK, MOVES and SOLVER rows; the Stage panel lists safety factor, stress and displacement first. A pending study shows the part, with PEAK reading *solving…*.
- The agent's scope gains `await fea.result()` and `await fea.faces()`. They are bridged calls: in the sandbox they cross to the page, wait for the compile's own solve (the host keeps one solve per compile and shares it), and refresh the sandbox's mirror with the solved program, so `program.metrics('safetyFactor')` then answers too. A solve that outlasts the step's 25 s goes on, and the next call picks it up.

## Backends and licences

`tools/fea-wasm/build.sh` builds two separate ES modules (first built Nov 18 with emscripten 6.0.9; `vendor/fea/VERSIONS` and `SHA256SUMS` record the build) into `vendor/fea/`: `ccx.mjs`/`.wasm` (CalculiX 2.22 with SPOOLES, from the freecad-web port pinned at b81991456fdf, rebuilt for wasm32 so Safari can run it) and `tetgen.mjs`/`.wasm` (TetGen 1.6 pinned at b19b98eaeb4d). `build.mjs` copies them to `dist/fea/`. They are loaded at run time, never bundled: CalculiX is GPL-2.0 and TetGen AGPL-3.0, so jig's own code keeps its licence and a deployment that ships the modules ships their sources' notices. In Node, `JIG_TETGEN` and `JIG_CCX` may name native programs (tests use a native tetgen).

## Validation

| Test | What | Result |
| --- | --- | --- |
| engine 52 | steel cantilever 60 × 6 × 6, 20 N at the tip, size 3 | tip 0.0668 mm against Timoshenko 0.0672 (−0.6%); root stress near My/I = 33.3 MPa; reactions balance 2·10⁻¹¹; faces by name; params; cached on recompile |
| engine 55 | PLA column 10 × 10 × 100 on three rollers, 0.01 MPa on top, then its own weight | pressure case exact for quadratic elements (10⁻⁶); gravity reaction = ρ g V exactly (10⁻⁹) |
| engine 54 | slider-crank at 3000 rpm with gravity and a cloth wrench | drive power against dKE/dt within 2.8·10⁻⁴; static torque against dPE/dθ within 5.6·10⁻⁵ |
| engine 53 | the slider-crank's rod from its worst pose | seats found on the bores, `big` held, its reaction equal to the mechanism's λ (0.00%) |
| agent-eval fea | `fea.result()` on the real Host, directly and through the sandbox | one solve per compile; result in MPa, mm, N; mirror refreshed |
| CalculiX reference | `tools/fea-wasm/check-reference.mjs` on CalculiX's own `beam10p` (C3D10, partial supports, nodal loads) | CalculiX wasm through jig's deck and reader: displacements and integration-point stresses identical to `beam10p.dat.ref`; jig's reference solver within 5.7·10⁻⁸ (U) and 1.7·10⁻⁷ (S), which pins the 4-point rule's point order the stress extrapolation relies on |
| engine 52 on CalculiX | the cantilever, CalculiX 2.22 wasm32 and the reference solver on the same mesh | agree to 5.9·10⁻⁸ (displacement, nodal and Gauss peaks) |
| browser | the built bundle in headless Chrome, studies 52 and 53 | both solved by CalculiX in the worker: 1.3 s (7 800 dof) and 4.9 s with its compile (50 000 dof), the same numbers as Node |

## Limitations to state plainly

- A study needs TetGen: without `vendor/fea/tetgen.mjs` (or `JIG_TETGEN`) it compiles to its part and reports that no mesher is present. The modules are build products (5.4 MB with CalculiX) and are not in the repository yet.
- The JavaScript solver is slow (100 k dof: 3 900 iterations, 73 s); it is a fallback and a cross-check, not the product path. An incomplete-Cholesky preconditioner would cut it several-fold.
- The solve runs in the engine worker's queue, so a long solve delays the next compile's reply until it ends. A separate solver worker is the fix if this bites.
- Straight-sided elements on faceted curved faces: stress at a small fillet is under-resolved unless the display mesh is fine there.
- A printed part is not isotropic; `strength` for plastics is the weak (Z) direction's, which is conservative in-plane and still not a layer model.

## Open questions

- [ ] Should `.from()` also accept a list of poses (an envelope), with the worst safety factor reported?
- [ ] Bolted and pressed seats: a fixed seat is stiffer than a pin in a clearance bore; `mode: 'bearing'` approximates contact, a real contact model is v0.3.
- [ ] Design search: `fea.safetyFactor` as an objective needs an asynchronous metric in variant search.
- [ ] Probes: reading stress at a named point or along an edge (`fea.probe(at)`), for figures that quote a value away from the peak.
