// H-08 · Cable comb: two rows of cable holes, each with a slit to the edge
// that the cable snaps through, for dressing a bundle neatly.
// Notice the outline of one hole: an arc and three lines drawn as a single
// loop, so the slit and the hole are one cut, then mirrored and patterned
// in the sketch.
const y0 = 'row + sqrt(r * r - slit * slit / 4)'   // where the slit meets
const slots = j.sketch('slots', { on: j.plane.offset(j.plane.XY, 't') })
  .polyline('u', [['x1 + slit / 2', y0], ['x1 + slit / 2', 'H / 2 + 1 mm'],
    ['x1 - slit / 2', 'H / 2 + 1 mm'], ['x1 - slit / 2', y0]])
  .arc('a', { center: ['x1', 'row'], start: ['x1 - slit / 2', y0],
    end: ['x1 + slit / 2', y0] })                  // round the bottom
  .mirror(['u', 'a'], 'X')                         // the lower row
  // 'u' names the polyline's segments and their mirror copies, u.1.m …;
  // the arc's mirror copy is its own entity, a.m
  .pattern(['u', 'a', 'a.m'],
    j.pattern.linear(j.dir('+X'), { count: 'n', step: 'pitch' }))

const comb = j.part('cable-comb')
  .params({
    cable: mm(6.2),     // cable diameter: Cat6 is 6.0–6.5 mm
    r: 'cable / 2 + 0.2 mm',   // the hole: a loose fit round the cable
    slit: 'cable * 0.75',      // the cable squeezes through the slit
    n: 6,               // holes per row: two rows, twelve cables
    pitch: 'cable + 4 mm',     // hole to hole
    row: 'pitch / 2 + 1 mm',   // each row's distance from the middle
    W: 'n * pitch + 6 mm', H: '2 * row + 2 * pitch',
    x1: '-(n - 1) * pitch / 2',   // the first hole
    t: mm(6),           // thickness along the cables
  })
  .configs({
    usb: { cable: mm(4), n: 8 },
    cat6: {},
    power: { cable: mm(8), n: 4 },
  })
  .config('cat6')
  .expose(['cable', 'n', 't'], {
    labels: { cable: 'cable diameter', n: 'holes per row',
      t: 'thickness' },
    ranges: { cable: [mm(3), mm(12)], n: [2, 12], t: [mm(4), mm(12)] },
  })
  .extrude(j.region.rect('W', 'H', { r: 'pitch / 2' }), 't', { id: 'plate' })
  .cut(slots.profiles(), 't', { id: 'slots' })
  // ease the edges of the holes and slits on the top face, so a cable
  // never bends over a sharp corner; the bed face stays square, since a
  // chamfer there would overhang
  .chamfer(j.feat('plate').endFace().edges().and(j.feat('slots').edges()),
    mm(0.6), { id: 'ease' })

return j.print('cable-comb', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [comb],
}).orient('+Z')
