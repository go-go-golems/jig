// X-02 · LED strip channel: a 200 mm channel for a 10 mm LED strip with a
// diffuser that slides into grooves near the top. Notice that the channel
// is one profile extruded to length, and that the diffuser, a second body
// of the same part, is sized from the grooves, so both change together.
// Section on YZ (x is world Y, y world Z): the channel runs along X, its
// back is z = 0; the diffuser lies beside it on the bed.
const P = {
  strip: mm(10),           // LED strip width: 8 mm and 10 mm are common
  L: mm(200),              // length: fits a 250 mm bed with room to spare
  wi: 'strip + 0.6 mm',    // inside width
  t: mm(2),                // wall
  floor: layer(8),         // 1.6 mm
  H: mm(11),               // height: about 8 mm from the LEDs to the diffuser
  dt: layer(6),            // diffuser thickness: 1.2 mm
  gap: mm(0.2),            // per side round the diffuser: the slide class
  gd: mm(0.9),             // how far each groove goes into the wall
  dg: 'dt + 2 * gap',      // groove height
  lip: mm(1.2),            // the wall above the groove
  z0: 'H - lip - dg - 1.2 * gd',   // the groove's floor
  Wo: 'wi + 2 * t',
  dw: 'wi + 2 * gd - 2 * gap',     // diffuser width: the grooves less the gap
}

const section = j.sketch('section',
  { on: j.plane.offset(j.plane.YZ, '-L / 2') })
  .polyline('p', [
    ['-Wo / 2', 0], ['Wo / 2', 0], ['Wo / 2', 'H'],
    ['wi / 2', 'H'], ['wi / 2', 'z0 + dg + 1.2 * gd'],   // the lip, then the
    ['wi / 2 + gd', 'z0 + dg'], ['wi / 2 + gd', 'z0'],   // groove: its roof
    ['wi / 2', 'z0'], ['wi / 2', 'floor'],               // slopes at 50°
    ['-wi / 2', 'floor'], ['-wi / 2', 'z0'],
    ['-wi / 2 - gd', 'z0'], ['-wi / 2 - gd', 'z0 + dg'],
    ['-wi / 2', 'z0 + dg + 1.2 * gd'], ['-wi / 2', 'H'], ['-Wo / 2', 'H'],
  ], { closed: true })

const channel = j.part('led-channel')
  .params(P)
  .expose(['strip', 'L', 'H'], {
    labels: { strip: 'LED strip width', L: 'length', H: 'height' },
    ranges: {
      strip: [mm(5), mm(20)], L: [mm(40), mm(240)], H: [mm(6), mm(20)],
    },
  })
  .extrude(section.profiles(), 'L', { id: 'body' })
  // two M3 countersunk screws through the floor, heads under the strip
  .hole([j.pt('-L / 2 + 20 mm', 0, 'floor'), j.pt('L / 2 - 20 mm', 0, 'floor')],
    j.hole.countersink('M3', { fit: 'free' }), { id: 'screws' })

  // the diffuser: a strip that fills the grooves less the gap all round,
  // 1 mm shorter than the channel so it slides in from one end; a second
  // body, flat on the bed 5 mm beside the channel
  .extrude(j.sketch('d', { on: j.plane.XY })
    .rect('r', 'L - 1 mm', 'dw', { center: true,
      at: [0, 'Wo / 2 + 5 mm + dw / 2'] }).profiles(), 'dt',
  { id: 'diffuser' })

// One plate: the channel on its back, the walls up, so the grooves' roofs
// are the only faces that look down, at 50°; the diffuser flat beside it.
return j.print('led-channel', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [channel],
}).orient('+Z').use(j.rules.fdm)
