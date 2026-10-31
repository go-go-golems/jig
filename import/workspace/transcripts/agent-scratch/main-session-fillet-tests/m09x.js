// M-09 · Rack and pinion: an 18-tooth pinion with a crank drives a 100 mm
// rack along a rail. Notice that the rack is a gear of infinite radius: the
// same module and pressure angle, and j.inspect.gearMesh gives the distance
// from the pinion's axis to the rack's pitch line and the travel per turn.
const modul = mm(2), width = mm(8)
const peg = mm(5)
const pinion = j.lib.gear.spur({ module: modul, teeth: 18, width })
  // a hub and a crank peg on top, to turn it by
  .extrude(j.region.circle(8).on(j.plane.offset(j.plane.XY, 8)), mm(5),
    { id: 'hub' })
  .extrude(j.region.circle(3, { at: [12, 0] })
    .on(j.plane.offset(j.plane.XY, 8)), mm(14), { id: 'crank' })
  .hole([[0, 0]], j.hole.simple(j.fit.hole(peg, 'free')), { id: 'bore' })
const rack = j.lib.gear.rack({ module: modul, teeth: 16, width })
  .port('slide', j.frame({ origin: j.pt(0, 0, 0), x: j.dir('+Y'),
    z: j.dir('+X') }))

const mesh = j.inspect.gearMesh(pinion, rack)
if (!mesh.ok) throw new Error(`no mesh: ${mesh.messages.join('; ')}`)
const yc = mesh.pitchLineDistance.value     // m · z / 2 = 18 mm
const p = Math.PI * 2                       // circular pitch, π · m
const L = 16 * p                            // rack length, 100.5 mm

// The base: a plate, a rail behind the rack, and a peg for the pinion over
// the middle of the rack. Rack and pinion both ride on the plate; their
// ports sit 0.2 mm above it so the interference check sees a gap.
const plate = 4, z0 = plate + 0.2, gap = 0.3
const base = j.part('base')
  .params({ rail: mm(5), railH: mm(6) })
  .extrude(j.region.rect(L + 10, yc + 14 + 6.5 + gap + 5,
    { center: false, at: [-5, -6.5 - gap - 5] }), mm(plate), { id: 'plate' })
  .extrude(j.region.rect(L + 10, 5, { center: false,
    at: [-5, -6.5 - gap - 5] }).on(j.plane.offset(j.plane.XY, plate)),
  'railH', { id: 'rail' })
  .extrude(j.region.circle(2.5, { at: [7.5 * p, yc] })
    .on(j.plane.offset(j.plane.XY, plate)), mm(15), { id: 'peg' })
  .chamfer(j.feat('peg').endFace().edges(), mm(0.5), { id: 'tip' })
  .fillet(j.feat('peg').edges().where(e => e.concave), mm(1.5), { id: 'root' })
  .port('track', j.frame({ origin: j.pt(0, 0, z0), x: j.dir('+Y'),
    z: j.dir('+X') }))
  .port('axle', j.frame({ origin: j.pt(7.5 * p, yc, z0), x: j.dir('+X'),
    z: j.dir('+Z') }))

// Rack on a slider along X, pinion on a revolute joint at its axle.
const drive = j.assembly('rack-and-pinion')
  .params({ travel: mm(0), turn: deg(0) })
  .add('base', base, { ground: true })
  .add('rack', rack).add('pinion', pinion)
  .joint('travel', j.joint.slider(), 'base:track', 'rack:slide')
  .joint('turn', j.joint.revolute(), 'base:axle', 'pinion:axis')
  .interference({ exact: true })

// The print job: all three flat. Not the default, because slicing the
// pinion's involute flanks slows the compile down; set printJob to true.
const printJob = false
const job = j.print('rack-and-pinion', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
}).add('base', base).add('rack', rack).add('pinion', pinion).orient('+Z')
return printJob ? job : drive
