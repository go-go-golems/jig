# jig assemblies: API spec v0.1

Nov 14, 2026 · living copy: https://claude.ai/artifact/8fkW35itz6gcNykA84Zkpa (this file is a snapshot)

## Purpose and scope

An assembly places parts by joining named frames on them (ports); a mechanism drives an assembly through a cycle and reads numbers off it. v0.1 adds both to jig so that the lockstitch rig, today a hand-written kine program full of copied numbers, can be built from the parts themselves and solved rather than coded.

In scope for v0.1:

- Rigid bodies only, each with 6 coordinates; one body is ground.
- Six lower-pair joints: fixed, revolute, prismatic, cylindrical, ball, planar.
- Closed kinematic loops, solved simultaneously, with mobility found from the rank of the joint Jacobian.
- Drives, couplings between joint values (gear and belt ratios), branch choice and continuation through a cycle.
- Readings, events and studies over a cycle, and compilation of a mechanism to a kine program.

Out of scope: forces and dynamics, contact and higher pairs (cam followers, tooth contact, pin-in-slot), flexible parts, tolerance stacks. Cams and gears appear only as couplings between joint values.

The spec is validated the way the textbook validated the part language: three book chapters (11 ports and frames, 12 the slider-crank, 13 the take-up four-bar) are written against a working prototype, and every figure doubles as a test against the rig's closed forms.

```
L1 Ports      part.port · j.frame.at       a named frame on a part; derived from sketch entities
   │ joints join two ports
L2 Assembly   j.assembly · .add · .joint   joint equations solved at once; M = 6n − rank J
   │ drives fix joint values
L3 Mechanism  .drive · .couple · .hint     drives use up mobility; continuation keeps one branch
   │ one pose per drive value
L4 Readings   .measure · .event · .study   numbers off the pose; studies sweep a drive
```

## What exists today

jig can already name ports and join two parts, but it places bodies by walking a tree, so a closed loop stays open without a word; kine can solve loops, but only the ones written by hand with numbers copied from the CAD.

| Capability | jig today | kine and the rig today | Gap v0.1 closes |
| --- | --- | --- | --- |
| Ports | `part.port(name, j.frame({origin, z}))`, numbers typed in | joint `.at(...)` frames, numbers typed in | ports derived from sketch entities, so they follow dimension changes |
| Joints | `j.joint.revolute()`, `j.joint.slider()`; no fixed joint | revolute (with limits), prismatic, fixed, ball | the six lower pairs with stated equation counts |
| Placement | tree walk from ground; `.params({main: deg(30)})` poses a joint | forward kinematics down the skeleton | all joints solved at once, from a starting pose |
| Closed loops | four-bar probe: bodies only translated, 2 of 4 joints broken, no diagnostic | `solve.fourBar`, `sew.sliderCrank` with lengths passed in | loops closed by the solver; lengths come from the parts |
| Mobility | `summary.dof` counts sketches only | none | M = 6n − rank J, with the Kutzbach count beside it |
| Diagnostics | none for assemblies | `closure` and `assembled` outputs per solve node | under-constrained, redundant, conflict, unreachable, branch jump |
| Readings | none | outputs, trails, `node --test` against closed forms | measures, events, studies over a cycle |

The rig's take-up four-bar shows the cost of the gap: ground D = (−14.53125, 29.0625), coupler 42.625, rocker 36.8125 and eye 67.8125 are typed into `rig.mjs`, and nothing ties them to the lever and link parts drawn in jig.

## Ports

A port is a named right-handed frame on a part, in the part's own coordinates, and a joint always connects two ports. Its z is the joint axis (the axis a revolute turns about, the direction a slider runs), its x is the zero reference the joint value is measured from, and its origin is the point the joint pins.

```js
const web = j.sketch('web', { on: j.plane.XY })   // circles 'main' and 'pin', 15.5 apart
const crank = j.part('crank').extrude(web, 6)
crank.port('pivot', j.frame.at(web, 'main.center', { offset: 3 }))   // z = sketch normal, mid-plane
crank.port('pin',   j.frame.at(web, 'pin.center',  { x: 'main.center', offset: 3 }))
slide.port('guide', j.frame.at(rail, 'axis'))                         // a line: origin at start, z along it
plate.port('top',   j.frame({ origin: j.pt(0, 0, 2), z: j.dir('+Z') }))  // explicit, as today
```

- `j.frame.at(sketch, ref, opts)` resolves after the sketch solves, so the port moves when a dimension changes. A port typed as numbers does not, and that drift is the bug this exists to remove.
- A point ref (`'h.center'`, `'l.start'`, a rect corner `'r.bl'`) gives the origin; z defaults to the sketch plane's normal and x to the plane's x.
- A line ref gives the origin at the line's start and z along the line, which is the axis a prismatic joint wants.
- `opts.x` aims x at another ref or a direction; `opts.z` overrides the axis; `opts.offset` slides the origin along z; `opts.flip` reverses z by turning the frame 180° about x.
- Port names are unique per part; inside an assembly `'body:port'` addresses one.
- Feature selectors (`part.feat('bore').axis()`) come after v0.1, once face ids survive edits.

## Joints

Each joint is a fixed set of scalar equations between its two ports in world coordinates, and its equation count c is what the mobility count subtracts. Written with port a on body A and port b on body B, origins p, axes x, y, z:

| Joint | c | Built from | Free motion | Value read back |
| --- | --- | --- | --- | --- |
| `fixed` | 6 | point + axis + twist | none | none |
| `revolute` | 5 | point + axis | rotation about z | θ = atan2((x_a × x_b)·z_a, x_a·x_b) |
| `prismatic` (alias `slider`) | 5 | on-axis + axis + twist | translation along z | s = (p_b − p_a)·z_a |
| `cylindrical` | 4 | on-axis + axis | rotation and translation along z | θ and s |
| `planar` | 3 | axis + in-plane | translation in the xy plane, rotation about z | none |
| `ball` | 3 | point | three rotations | none |

The five primitives:

1. **point** (3): p_b − p_a = 0.
2. **on-axis** (2): (p_b − p_a)·x_a = 0 and (p_b − p_a)·y_a = 0, so b's origin lies on a's z line.
3. **in-plane** (1): (p_b − p_a)·z_a = 0.
4. **axis** (2): z_a·x_b = 0 and z_a·y_b = 0, so the z axes are parallel; z_a·z_b > 0 is checked, not solved.
5. **twist** (1): x_a·y_b = 0, with x_a·x_b > 0 checked.

Options on every joint: `{ limits: [lo, hi] }` is checked and reported as `joint.limit` over a study, not enforced as an inequality in v0.1; `{ zero }` shifts where the value reads 0. Values are in radians and millimetres; `deg()` and `mm()` convert.

## Assemblies: placement, mobility, diagnostics

An assembly solves every joint equation at once from a starting pose and reports its mobility as 6n − rank J; the bare equation count (Kutzbach) is reported beside it, because the two disagree for every planar loop.

```js
const asm = j.assembly('slider-crank')
  .add('frame',  frame, { ground: true })
  .add('crank',  crank)
  .add('rod',    rod)
  .add('slider', slider)
  .joint('main',  j.joint.revolute(),  'frame:main',  'crank:pivot')
  .joint('pin',   j.joint.revolute(),  'crank:pin',   'rod:big')
  .joint('wrist', j.joint.revolute(),  'rod:small',   'slider:wrist')
  .joint('guide', j.joint.prismatic(), 'frame:guide', 'slider:guide')
```

Placement runs in three steps:

1. Each moving body carries 6 coordinates: a translation and a small rotation applied to its current orientation, so there are no Euler angles to lock.
2. The starting pose is a walk from ground along a spanning tree of the joints, tree joints at value 0 or their `hint`.
3. Gauss–Newton with the minimum-norm step (the sketch solver's damped dual normal equations) closes the loop joints from there. Minimum norm moves the bodies as little as possible, which keeps the solution on the branch the pose started near. Converged means every residual is under 1e-9 (mm, or rad times 1 mm).

```latex
M = 6n - \operatorname{rank} J(q) \qquad K = 6n - \sum_i c_i \qquad r = \sum_i c_i - \operatorname{rank} J(q)
```

n is the number of moving bodies, c_i the equation count of joint i, M the mobility, K the Kutzbach count and r the number of redundant equations. The prototype must reproduce these:

| Assembly | n | Σc | K | rank J | M | r |
| --- | --- | --- | --- | --- | --- | --- |
| crank on a frame, one revolute | 1 | 5 | 1 | 5 | 1 | 0 |
| crank in two coaxial bearings | 1 | 10 | −4 | 5 | 1 | 5 |
| slider-crank (3 revolutes, 1 prismatic) | 3 | 20 | −2 | 17 | 1 | 3 |
| four-bar (4 parallel revolutes) | 3 | 20 | −2 | 17 | 1 | 3 |

A redundant equation is not an error in the model; it is a demand on the shop. The four-bar moves only because its four axes are exactly parallel, and the report says so.

| Diagnostic | Raised when | Lists |
| --- | --- | --- |
| `assembly.underconstrained` | M exceeds the number of drives | free motions: the null space of J as one twist (ω, v) per body |
| `assembly.redundant` | r > 0 | the dependent joint rows and the condition they impose, e.g. "axes of main, pin, wrist parallel" |
| `assembly.conflict` | residuals cannot reach 0 | a minimal conflicting set of joints (deletion filter, as for sketches) and the residual |
| `assembly.unreachable` | a drive value the loop cannot reach | the nearest reachable value |
| `assembly.toggle` | rank J with drives drops at a pose | the drive value: a dead centre |
| `assembly.branchJump` | a body moves further in one study step than the step explains | the step and the bodies |
| `assembly.disconnected`, `port.missing`, `joint.selfJoin` | structural errors | the body, port or joint |

```js
result.assembly = {
  bodies:   [{ id, ground, origin: [x, y, z], R: [[...], [...], [...]] }],
  joints:   [{ id, kind, value, residual }],
  mobility: { coords, equations, rank, dof, kutzbach, redundant, drives },
  free:     [{ body, w: [wx, wy, wz], v: [vx, vy, vz] }],
  conflicts, diagnostics,
}
```

## Mechanisms: drives, branches, loops, compiling to kine

A mechanism is an assembly whose mobility is used up by drives: each drive fixes one joint value, so when M equals the number of drives there is one pose per drive value on each branch, and the solver follows one branch through the cycle by continuation.

```js
const theta = deg(30)
asm.drive('main', theta)                                  // one equation: value(main) = theta
   .couple('hookGear', 'main', 'hookShaft', { ratio: 2 }) // value(hookShaft) = 2 · value(main) + offset
   .hint('wrist', deg(0))                                 // branch seed for the loop
```

- `drive(joint, value)` adds one equation; a study sweeps the value.
- `couple(id, a, b, { ratio, offset })` ties two joint values with one equation. It stands in for gears and belts; tooth contact stays out of scope.
- A loop has more than one closure for the same drive value: a four-bar can be open or crossed, a slider can sit on either side of its crank. The starting pose (tree walk plus hints) picks the branch.
- Continuation keeps the branch: each study step starts from the previous solution and is cut in half until it converges within `maxStep` (default 2°). A sign change in a loop's orientation determinant raises `assembly.branchJump`.

`j.kine(asm, { input: 'main' })` compiles a mechanism to a kine program in three passes:

1. Spanning-tree joints become skeleton joints (`revolute(axis)`, `prismatic(axis)`, `fixed()`), placed with `.at()` from the solved port frames.
2. Each loop becomes a solve node. A planar four-bar becomes `solve.fourBar` with a, b, c, d and the branch read off the ports and the solved pose; an in-line slider-crank becomes `sew.sliderCrank`. Any other loop becomes `solve.table`: solved over the cycle at 0.5° and interpolated, so the program stays a pure function of θ.
3. Measures become outputs.

The compiled program must match the solver within 1e-6 mm over 720 samples.

## Readings, events and studies

Readings turn a pose into the numbers the machine is designed around (needle stroke, eye height, transmission angle); a study sweeps a drive and tabulates them; an event marks the drive values where a reading crosses a threshold.

```js
asm.measure('clamp', m => m.point('slider:wrist').z)            // needle-bar stud height
   .measure('eye',   m => m.point('lever:eye'))                  // a point, plotted as a path
   .measure('mu',    m => m.angle('lever:axis', 'rocker:axis'))  // transmission angle
   .event('down',    r => r.clamp < -70)                         // crossings, with direction

const cycle = asm.study('cycle', { drive: 'main', from: 0, to: deg(360), steps: 360 })
cycle.rows             // [{ main, clamp, eye, mu }, ...]
cycle.events           // [{ name: 'down', at, rising }, ...]
cycle.extrema('clamp') // { min: { at, value }, max: { at, value } }
```

- `m.point(ref)`, `m.axis(ref)`, `m.angle(a, b)`, `m.distance(a, b)` and `m.joint(id)` read the solved pose; `m.rate(name)` differentiates a reading by the drive, per radian.
- `asm.interference(['rod', 'frame'], { study: 'cycle' })` reports the overlap volume at each sample by the interference law V(a) + V(b) − V(a ∪ b), and the worst sample.
- `cycle.bake()` returns a kine timeline clip, so a study can drive the existing animation views. `asm.report(name, fn, { unit, digits })` computes one number from the studies after they run.

## Workbench views

Assemblies get a view in the existing jig workbench, not a separate application: a script that returns an assembly opens in an assembly view beside its parts, and the book's figures use the same view.

| View | Shows | Interaction |
| --- | --- | --- |
| Assembly tree | bodies under ground, each joint with its kind and live value | select, hide, isolate |
| Mobility badge | M, drives and r; green when M = drives and r = 0, amber when r > 0, red on a conflict | opens the diagnostics |
| Port and joint glyphs | port triads (x, z); a ring for revolute, a double arrow for prismatic, a square for fixed | hover names; joints in a conflicting set turn red |
| Free motions | null-space twists as arcs and arrows on the bodies | nudges the pose along one twist |
| Drag to pose | the solved assembly under the pointer | drag a body point; minimum-norm solve under joints and drives, as in sketch drag |
| Drive bar | one slider per drive, play and loop, event ticks on the bar | scrubbing moves every view |
| Study plot | readings against the drive value, with a cursor synced to the drive bar | click to jump the pose |
| Layers | ghost poses over a cycle, point traces (the eye path), section plane, exploded along joint axes | toggles |

## Milestones and acceptance tests

Each milestone is done when its test passes against numbers the rig already proves; M1–M5 are built in the book's prototype first and land in jig once chapters 11–13 read well.

| Milestone | Delivers | Acceptance test | Chapter |
| --- | --- | --- | --- |
| M1 | ports from sketch entities | crank pin radius 15.5 → 18 moves port `crank:pin` by 2.5 mm with no edit to the port | 11 |
| M2 | simultaneous placement, mobility by rank | the four mobility rows above, exactly; four-bar closes with every residual < 1e-9 (today 2 of 4 joints stay broken) | 11, 12 |
| M3 | diagnostics | coaxial bearings give r = 5; a mate that contradicts another names both in the conflicting set | 11 |
| M4 | drives, continuation, studies | needle-bar slider-crank (r 15.5, link 60): stroke 31.000 ± 1e-6 mm, lowest at 0°, rise 2.579 mm at 30°, no branch jump in 360 steps | 12 |
| M5 | loops against the rig | take-up eye matches `rig.mjs` `takeUp(θ)` within 1e-6 mm at 720 samples; eye lowest at 138° ± 4°, highest at 251° ± 4° | 13 |
| M6 | readings across the head | hook point passes 0.38 mm behind the needle at 30°, 1.6–2.0 mm above the eye | later |
| M7 | compile to kine | compiled program matches the hand rig within 1e-6 mm over 720 samples | later |
| M8 | workbench views in jig | the views table, in the jig workbench as well as the book | later |

## Changes from writing chapters 11–13

M1–M5 pass in the book's prototype (`book/web/jiglite-asm.js`, tests in `book/test/asm.test.mjs`), and writing the chapters against it changed five things:

- **Reports.** `asm.report(name, fn)` turns studies into the numbers a figure quotes (stroke 31.0000 mm, eye lowest at 138.5°). A study alone is a table.
- **Walk order.** The placement walk takes a hinted or driven joint before any other placeable joint. In declaration order, the take-up's unhinted elbow placed the lever first and the hints were ignored.
- **A wrong closure is silent.** Open and crossed closures satisfy every equation, so the solver reports success on either. Every loop should carry a reading that would look wrong on the other branch; the take-up's oracle reads 101.3 mm off on the crossed closure.
- **Unreachable belongs to studies.** A non-Grashof take-up (rocker 25 mm) stops at 194°; the study reports the unreachable range, and continuation does not jump the gap.
- **Conflicts suppress the mobility report.** At a pose where the joints cannot hold, rank and redundancy are meaningless, so only the conflicting set and the residual are reported (0.05 mm bearing misalignment: front and back, residual 0.05/60 rad).

## Open questions

- [ ] Planar declaration: should `asm.planar('YZ')` drop each body to 3 coordinates, so that K matches M and the three redundant rows per loop stop being reported? The 6D count is more honest about the shop; the 3D count is quieter.
- [ ] Branch persistence across edits: when a length changes, is the branch kept by the sign of each loop's orientation determinant, or re-picked from hints?
- [ ] Loops in kine: `solve.table` keeps programs pure but costs memory and interpolation error; a runtime iterative node needs the previous frame's solution.
- [ ] Naming: `fixed` or `rigid`, and whether `slider` stays as an alias of `prismatic`.
- [ ] Port derivation order: sketch refs first (this spec), or face selectors such as a bore's axis first.
- [ ] Higher pairs for v0.2: cam follower, pin in slot, gear tooth contact, each as a joint with fewer than 3 equations.
