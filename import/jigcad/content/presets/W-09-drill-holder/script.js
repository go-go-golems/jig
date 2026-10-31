// W-09 · Cordless drill holder: a wall shelf with a U-slot that the drill's
// handle drops into, so the drill hangs by its body, with six pockets for
// 1/4" bits and two gussets. Notice the print orientation: upside down, the
// shelf's top on the bed, so the gussets, the wall plate and the slot all
// grow straight up and the screw holes become teardrops.
// Side profile on YZ (x is world Y, y world Z): the wall is y = 0, the top
// of the shelf z = 0; the wall plate runs down, the shelf runs out.
const side = j.sketch('side', { on: j.plane.YZ })
  .polyline('p', [
    [0, 0], ['D', 0], ['D', '-sh'], ['t', '-sh'], ['t', '-H'], [0, '-H'],
  ], { closed: true })

// the slot: a stadium from its round end out past the front of the shelf
const slot = j.sketch('slot', { on: j.plane.XY })
  .slot('s', [0, 'D - slot_d + grip / 2'], [0, 'D + grip'], 'grip')

// a gusset under one end of the shelf; `gussets` mirrors it to the other
const gusset = j.sketch('gusset',
  { on: j.plane.offset(j.plane.YZ, 'W / 2 - g_t') })
  .polyline('g', [['t', '-sh'], ['t + g_y', '-sh'], ['t', '-sh - g_z']],
    { closed: true })

// six hex pockets for 1/4" bits, three each side of the slot
const bits = j.sketch('bits', { on: j.plane.XY })
  .polygon('hex', 6, 'af / 2 + 0.15 mm', { inscribed: false,
    at: ['-(grip / 2 + bit_x)', 'D - 15 mm'] })
  .pattern(['hex'], j.pattern.grid(j.dir('+X'), j.dir('-Y'),
    { count: [2, 3], step: ['grip + 2 * bit_x', mm(18)] }))

const holder = j.part('drill-holder')
  .params({
    grip: mm(46),          // slot width: the drill's handle passes, its
                           // body (60 mm and wider) rests on the shelf
    slot_d: mm(55),        // how far back the slot goes
    D: 'slot_d + 26 mm',   // depth of the shelf from the wall
    W: mm(130),            // width
    sh: mm(16),            // shelf thickness
    H: mm(75),             // wall plate height, from the top of the shelf
    t: mm(6),              // wall plate thickness
    g_t: mm(6), g_y: '0.7 * (D - t)', g_z: mm(45),   // gussets
    lead: mm(3),           // chamfer round the top of the slot
    af: mm(6.35),          // 1/4 in hex bits
    bit_x: mm(14),         // bit pockets, out from the edge of the slot
    bit_d: mm(12),
  })
  .expose(['grip', 'slot_d', 'W', 'sh'], {
    labels: {
      grip: 'slot width', slot_d: 'slot depth', W: 'width',
      sh: 'shelf thickness',
    },
    ranges: {
      grip: [mm(30), mm(70)], slot_d: [mm(30), mm(80)], W: [mm(100), mm(200)],
      sh: [mm(10), mm(25)],
    },
  })
  .extrude(side.profiles(), { symmetric: 'W' }, { id: 'body' })
  .cut(slot.profiles(), '-sh', { id: 'slot' })
  // the top edges of the slot, where the drill's body sits
  .chamfer(j.feat('slot').edges().where(e => e.center.z > -1e-6), 'lead',
    { id: 'lead' })
  .extrude(gusset.profiles(), 'g_t', { id: 'gusset' })
  .mirror(j.feat('gusset'), j.plane.YZ, { id: 'gussets' })
  .cut(bits.profiles(), '-bit_d', { id: 'bits' })
  // two #8 / M4 countersunk wood screws, heads flush with the front of the
  // wall plate, below the shelf where a screwdriver reaches them
  .hole([j.pt('-W / 4', 't', '-H + 15 mm'), j.pt('W / 4', 't', '-H + 15 mm')],
    j.hole.countersink('M4', { fit: 'free' }), { id: 'screws' })

// Upside down (−Z up): the top of the shelf is on the bed; the slot's
// chamfer and the bit pockets open onto it.
return j.print('drill-holder', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [holder],
}).orient('-Z').use(j.rules.fdm)
