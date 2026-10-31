// H-12 · Curtain-rod end bracket: a cup that a rod's end clicks into, on a
// plate screwed to the side of a window recess. Two to a plate.
// Notice the fits: the cup's bore comes from the free class, so the rod
// turns and slides in it, and its mouth is narrower than the rod, so the
// rod snaps past it and cannot lift out.
const bracket = j.part('rod-bracket')
  .params({
    rod: mm(20),        // rod diameter: 16, 20, 25 and 28 mm are common
    wall: mm(4),        // cup wall
    depth: mm(16),      // how far the rod's end goes into the cup
    mouth: 'rod * 0.85',    // the opening the rod clicks through
    t: mm(5),           // plate thickness
    R: 'rod / 2 + wall',    // cup radius, outside
    s: 'R + 8 mm',          // screws either side of the cup
    pw: '2 * R + 4 mm', // plate width: 2 mm of plate round the cup
  })
  .configs({
    rod16: { rod: mm(16), wall: mm(3.5) },
    rod20: {},
    rod25: { rod: mm(25), wall: mm(4.5), depth: mm(18) },
  })
  .config('rod20')
  .expose(['rod', 'depth', 'mouth'], {
    labels: { rod: 'rod diameter', depth: 'cup depth',
      mouth: 'snap-in opening' },
    ranges: { rod: [mm(10), mm(35)], depth: [mm(8), mm(30)],
      mouth: [mm(8), mm(35)] },
  })
  // the plate: a slot across X with a screw at each end; modelled as it
  // prints, plate down, so +Z is out of the wall and +Y is up
  .extrude(j.region.slot(['-s', 0], ['s', 0], 'pw'), 't', { id: 'plate' })
  // the bed edge: 0.4 mm in and 0.7 mm up, steeper than 45°
  .chamfer(j.feat('plate').startFace().edges(), mm(0.7),
    { d2: mm(0.4), id: 'foot' })
  .extrude(j.region.circle('R'), 't + depth', { id: 'cup' })
  // the bore: blind, down to the plate, sized from the free fit class
  .hole([j.pt(0, 0, 't + depth')], j.hole.simple(j.fit.hole('rod', 'free'),
    'depth'), { id: 'bore' })
  // the mouth: a slot through the cup's upper wall
  .cut(j.sketch('mouth', { on: j.plane.offset(j.plane.XY, 't') })
    .rect('m', 'mouth', 'R + 1 mm', { center: true, at: [0, '(R + 1 mm) / 2'] })
    .profiles(), 'depth', { id: 'mouth' })
  // round the mouth's lips, which the rod pushes past, then the rim
  .fillet(j.feat('mouth').edges('|Z'), mm(1), { id: 'lips' })
  .fillet(j.feat('cup').endFace().edges(), mm(1), { id: 'rim' })
  // countersunk from the front, which faces up as it prints
  .hole([j.pt('-s', 0, 't'), j.pt('s', 0, 't')],
    j.hole.countersink('M4', { fit: 'slide' }), { id: 'screws' })

// Plate down: the cup stands up from it, the screw holes are vertical and
// their countersinks open upward.
return j.print('rod-brackets', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
}).add('bracket', bracket, { qty: 2 }).orient('+Z')
