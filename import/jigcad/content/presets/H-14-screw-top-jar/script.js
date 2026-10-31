// H-14 · Screw-top jar: a 300 ml jar with a two-start trapezoidal thread
// on its neck, and a lid with the matching internal thread.
// Notice the fit: both threads are sized from the same nominal diameter,
// and the slide class takes 0.2 mm off the neck and adds it to the lid.
const NECK = { d: 64, pitch: 4 }   // thread size in mm: Ø64 × 4, 2 starts,
                                   // so the lid closes in about 1¼ turns
const thread = o => j.lib.thread(NECK,
  { profile: 'trapezoid', starts: 2, fit: 'slide', ...o })

const P = {
  D: mm(70),          // jar body, outside
  H: mm(88),          // body height, to the shoulder
  wall: mm(2),
  floor: layer(10),   // 2 mm
  neck: mm(10),       // threaded length
  bore: mm(54),       // the opening, leaving 2.8 mm under the thread
  lid_d: mm(76),      // lid, across the flats of its 16 sides
  top: mm(3),         // thickness of the lid's top
  lid_x: 'D / 2 + lid_d / 2 + 10 mm',   // the lid is modelled beside the jar
}

// the inside: a cylinder up to the shoulder, then in to the neck's bore,
// rising 1.3 for every 1 inward (38° from vertical), so the shoulder
// prints without support
const inside = j.sketch('inside', { on: j.plane.XZ })   // x: radius, z: up
  .polyline('p', [[0, 'floor'], ['D / 2 - wall', 'floor'],
    ['D / 2 - wall', 'H - 1.3 * (D / 2 - wall - bore / 2)'], ['bore / 2', 'H'],
    ['bore / 2', 'H + neck + 1 mm'], [0, 'H + neck + 1 mm']],
    { closed: true })

const jar = j.part('jar')
  .params(P)
  .expose(['D', 'H'], {
    labels: { D: 'jar diameter', H: 'height to the shoulder' },
    ranges: { D: [mm(66), mm(100)], H: [mm(40), mm(160)] },
  })
  .extrude(j.region.circle('D / 2'), 'H', { id: 'body' })
  .chamfer(j.feat('body').startFace().edges(), mm(0.7),
    { d2: mm(0.4), id: 'foot' })
  // the neck: a hollow threaded tube standing on the shoulder
  .add(thread({ length: 'neck', bore: 'bore' }),
    { at: j.pt(0, 0, 'H'), id: 'neck' })
  .revolve(inside.profiles(), j.axis.Z, turn(1), { op: 'cut', id: 'cavity' })

const lid = j.part('lid')
  .params(P)
  .expose(['lid_d', 'top'], {
    labels: { lid_d: 'lid size across flats', top: 'lid top thickness' },
    ranges: { lid_d: [mm(70), mm(90)], top: [mm(2), mm(5)] },
  })
  // sixteen flats round the lid: a grip with no extra features
  .extrude(j.sketch('cap', { on: j.plane.XY })
    .polygon('c', 16, 'lid_d / 2', { inscribed: false, at: ['lid_x', 0] })
    .profiles(),
    'top + neck + 1 mm', { id: 'cap' })
  // the internal thread, cut from the top's inside face to the rim
  .add(thread({ length: 'neck + 1 mm', internal: true }),
    { at: j.pt('lid_x', 0, 'top'), id: 'thread' })

// Both upright as modelled: the jar on its base, the lid on its top. The
// thread flanks are the only overhang (see the notes).
return j.print('screw-top-jar', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [jar, lid],
}).orient('+Z')
