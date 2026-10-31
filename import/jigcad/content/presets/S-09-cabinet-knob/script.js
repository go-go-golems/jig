// S-09 · Cabinet knob: a turned profile with a fluted grip and an M4 insert.
// Notice the print direction: upside down, the knob narrows as it rises
// from its flat top, so nothing overhangs and the insert hole opens upward.
const section = j.sketch('section', { on: j.plane.XZ })  // x: radius, z: up
  .polyline('p', [
    [0, 0], ['base_d / 2', 0],                 // on the door
    ['neck_d / 2', 'neck'],                    // the neck narrows
    ['d / 2', 'head'],                         // the underside of the head
    ['d / 2', 'H'], [0, 'H'],                  // the rim and the flat top
  ], { closed: true })

// the grip: one V-groove on the rim, patterned in the sketch so a single
// cut makes them all. The sketch sits below the head and the cut rises to
// a solid band under the top: each groove runs out through the 45°
// underside, and stops short of the crown.
const low = j.plane.offset(j.plane.XY, 'head - 2 * groove')
const flutes = j.sketch('flutes', { on: low })
  .polyline('v', [['d / 2 - groove', 0], ['d / 2 + 1 mm', '-groove'],
    ['d / 2 + 1 mm', 'groove']], { closed: true })
  .pattern(['v'], j.pattern.circular(j.axis.Z, { count: 'flutes' }))

const knob = j.part('cabinet-knob')
  .params({
    d: mm(32),          // head diameter
    H: mm(26),          // height off the door
    base_d: mm(20),     // footprint on the door
    neck_d: mm(14),     // narrowest point, where the fingers go round
    neck: mm(8),        // height of the neck
    head: 'neck + (d - neck_d) / 2',   // the underside rises at 45°
    flutes: 12,         // grooves round the rim, for grip
    groove: mm(1.4),    // depth of each groove: a 90° V
    band: mm(2.5),      // solid band between the grooves and the top
  })
  .configs({
    S: { d: mm(25), H: mm(22), base_d: mm(17), neck_d: mm(11) },
    M: {},
    L: { d: mm(40), H: mm(30), base_d: mm(24), neck_d: mm(16), flutes: 16 },
  })
  .config('M')
  .expose(['d', 'H', 'neck_d', 'flutes'], {
    labels: { d: 'head diameter', H: 'height', neck_d: 'neck diameter',
      flutes: 'grip flutes' },
    ranges: { d: [mm(18), mm(50)], H: [mm(18), mm(40)],
      neck_d: [mm(9), mm(24)], flutes: [1, 24] },
  })
  .revolve(section.profiles(), j.axis.Z, turn(1), { id: 'body' })
  // the top is the bed edge when printed upside down: a chamfer, not a
  // fillet, so it needs no support and hides elephant's foot
  .chamfer(j.feat('body').sideFace('p.5').edges(), mm(1.5), { d2: mm(1),
    id: 'crown' })
  .cut(flutes.profiles(), 'H - band - head + 2 * groove', { id: 'grip' })
  // a brass heat-set insert, M4 × 8.1, pressed in from the base with a
  // soldering iron: the cabinet's M4 bolt then screws into metal
  .hole([j.pt(0, 0, 0)], j.hole.insert('M4'), { id: 'insert' })
  .chamfer(j.feat('body').sideFace('p.1').edges('%circle').largest(),
    mm(0.5), { id: 'foot' })

// Upside down: the flat top is the first layer, the head narrows to the
// neck, and the neck widens to the base at 20°, all within 45°.
return j.print('cabinet-knob', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [knob],
}).orient('-Z')
