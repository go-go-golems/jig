// 03 · Points, transforms and datums: an affine space acted on by SE(3)
//
// Model
//   Points form an affine space over vectors: p − q is a vector, p + v is a point, p + q is undefined.
//   Rigid motions form the Lie group SE(3) = SO(3) ⋉ ℝ³: composition is associative, there is an identity,
//   and every motion has an inverse. Rotations about one fixed axis form an abelian subgroup ≅ SO(2): angles add.
//   Mirrors and scales leave SE(3) for Sim(3); a mirror is an involution (m·m = id) that reverses handedness.
//   A frame is a transform from local to world coordinates; datum planes and ports are frames.
//   Offsetting a plane is translation along its normal, so offset(a)·offset(b) = offset(a + b).
//
// Grounding
//   Rigid motions SE(3) and homogeneous coordinates, as in kinematics and robotics texts.
//
// Notice
//   - `a.then(b)` means "first a, then b". Order matters: SE(3) is not commutative.
//   - Datums attached to faces follow the model when parameters change.
//   - Ports are named frames a part carries, so joints and placements never guess at faces.
//
// Results in `// →` comments show the illustrative shape of a result.

import { j, mm, deg, turn } from 'jig'

// ── 1. The affine space of points ─────────────────────────────────────────────
const p = j.pt(10, 0, 5)
const q = j.pt(40, 20, 5)
const v = q.sub(p)                         // → vec(30, 20, 0) mm
p.add(v)                                   // → pt(40, 20, 5) mm  = q
v.norm()                                   // → 36.06 mm
v.unit()                                   // → dir(0.832, 0.555, 0)
p.add(v.mul(0.5))                          // → pt(25, 10, 5) mm  (the midpoint is an affine combination)
j.dir('+X').cross(j.dir('+Y'))             // → dir('+Z')
j.dir('+X').angleTo(v)                     // → 33.69°

try { p.add(q) } catch (err) { err.name }  // → 'AffineError'  (points cannot be added, only translated)

// ── 2. Transforms: the group SE(3) ────────────────────────────────────────────
const rz30 = j.tx.rotate(j.axis.Z, deg(30))
const right20 = j.tx.move(20, 0, 0)
const rx90 = j.tx.rotate(j.axis.X, deg(90))

rz30.then(right20).apply(j.pt(10, 0, 0))   // → pt(28.66, 5, 0)    rotate first, then move
right20.then(rz30).apply(j.pt(10, 0, 0))   // → pt(25.98, 15, 0)   move first, then rotate: a different point
rz30.then(rz30.inverse())                  // → tx.identity

// The group laws (checked by the suite as transform.group) let the compiler fuse chains of placements:
j.compile(j.part('p').move(j.sel.bodies(), rz30.then(right20).then(right20.inverse()))).decisions[0]
// → { kind: 'transform.fuse', chose: 'rotate(Z, 30°)', reason: 'move(20) · move(−20) cancels; 1 transform applied instead of 3' }

// Rotations about one axis commute and their angles add.
const rz45 = j.tx.rotate(j.axis.Z, deg(45))
rz30.then(rz45).apply(j.pt(10, 0, 0))                  // → pt(2.588, 9.659, 0)
j.tx.rotate(j.axis.Z, deg(75)).apply(j.pt(10, 0, 0))   // → pt(2.588, 9.659, 0)
rz30.pow(12)                                           // → tx.identity  (12 · 30° = one turn)
j.tx.rotate(j.axis.Z, turn(0.25)).apply(j.pt(10, 0, 0))   // → pt(0, 10, 0)

// ── 3. Leaving SE(3): mirrors and scales ──────────────────────────────────────
const mx = j.tx.mirror(j.plane.YZ)
mx.then(mx)                                // → tx.identity          (an involution)
mx.apply(j.pt(12, 3, 4))                   // → pt(−12, 3, 4)
mx.det                                     // → −1   (mirrors reverse handedness: a right-hand thread becomes left-hand)

// A left and a right handle from one model: mirroring is how printable pairs stay in sync.
const handleR = j.part('handle-R').extrude(j.sketch('h', { on: j.plane.XY }).slot('s', [0, 0], [30, 8], 10).profiles(), mm(6))
const handleL = j.part('handle-L').add(handleR, { at: mx })

// Scale is in Sim(3): it changes lengths. ABS shrinks ≈ 0.6 % as it cools, so compensate before slicing.
const shrinkComp = j.tx.scale(1.006, { about: j.origin })
shrinkComp.apply(j.pt(100, 0, 0))          // → pt(100.6, 0, 0)

// ── 4. Datum planes and the offset law ────────────────────────────────────────
const p10 = j.plane.offset(j.plane.XY, mm(10))
const p25a = p10.offset(mm(15))
const p25b = j.plane.offset(j.plane.XY, mm(25))
j.hash(p25a) === j.hash(p25b)              // → true   (offset(10) · offset(15) is canonicalised to offset(25))

const tilted = j.plane.angle(j.plane.XY, j.axis.X, deg(30))    // a plane through the X axis, tipped 30°
const tri = j.plane.through(j.pt(0, 0, 0), j.pt(10, 0, 0), j.pt(0, 10, 5))
tri.offset(mm(2)).flip()                   // operators compose on any plane

// ── 5. Datums attached to geometry follow the model ───────────────────────────
const box = j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30) })
  .extrude(j.sketch('base', { on: j.plane.XY }).rect('r', 'w', 'd', { center: true }).profiles(), 'h', { id: 'body' })

const side = j.plane.on(j.feat('body').sideFace('r.right'))     // a sketch plane on the right wall
const vent = j.sketch('vent', { on: side }).slot('s', [-10, 15], [10, 15], 4)
const vented = box.cut(vent.profiles(), mm(5), { id: 'vent' })

j.compile(vented.override({ w: mm(80) })).why(side)
// → { resolved: ['body/side[base.r.right]'], frame: { origin: (40, 0, 15) mm, z: '+X' },
//     chain: ['plane.on ← body/side[base.r.right] ← extrude(base) from sketch edge r.right'] }

// ── 6. Seating one part on another with j.tx.align ───────────────────────────
const lid = j.part('lid')
  .extrude(j.sketch('l', { on: j.plane.XY }).rect('r', 60, 40, { center: true }).profiles(), mm(3), { id: 'plate' })

const lidBottom = j.frame.on(j.sel.faces('<Z').of('lid'))       // z = outward normal (−Z in lid coordinates)
const boxTop = j.frame.on(j.sel.faces('>Z').of('box'))          // z = outward normal (+Z)
const seat = j.tx.align(lidBottom.flip(), boxTop)               // map lid's flipped bottom frame onto the box top
seat.apply(j.pt(0, 0, 0))                                       // → pt(0, 0, 30)   (the lid's origin, now on the rim)

// ── 7. Ports: named frames carried by the part ───────────────────────────────
const boxP = box
  .port('lid', j.frame.on(j.sel.faces('>Z').of('box')))
  .port('wall', j.frame.on(j.feat('body').sideFace('r.bottom')))
const lidP = lid.port('seat', j.frame.on(j.sel.faces('<Z').of('lid')))

const kit = j.assembly('kit')
  .add('box', boxP, { ground: true })
  .add('lid', lidP)
  .joint('closed', j.joint.rigid(), 'lid:seat', 'box:lid')       // a joint mates ports: origins coincide, z axes oppose

const K = j.compile(kit)
K.occurrence('lid')
// → { tx: move(0, 0, 30) mm, via: 'joint closed (rigid): lid:seat ↔ box:lid', dof: 0 }
K.dof()                                     // → 0   (box grounded, lid rigidly mated)
