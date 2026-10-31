// H-10 · Napkin holder: a U-shaped profile extruded to the napkins' width,
// with pointed windows cut through both walls at once.
// Notice the windows: one sketch on the YZ plane, patterned along Y, cut
// through everything along X, so each opening goes through both walls.
const side = j.sketch('side', { on: j.plane.XZ })    // x across, z up
  .polyline('u', [
    ['-gap / 2 - t', 0], ['gap / 2 + t', 0], ['gap / 2 + t', 'H'],
    ['gap / 2', 'H'], ['gap / 2', 'b'], ['-gap / 2', 'b'],
    ['-gap / 2', 'H'], ['-gap / 2 - t', 'H'],
  ], { closed: true })

// one window: 45° points top and bottom, so it prints without a bridge
const y1 = '-(n - 1) * pitch / 2'
const windows = j.sketch('windows', { on: j.plane.YZ })   // x is world Y
  .polyline('w', [
    [y1, 'b + sill'], [`${y1} + ww / 2`, 'b + sill + ww / 2'],
    [`${y1} + ww / 2`, 'H - head - ww / 2'], [y1, 'H - head'],
    [`${y1} - ww / 2`, 'H - head - ww / 2'],
    [`${y1} - ww / 2`, 'b + sill + ww / 2'],
  ], { closed: true })
  .pattern(['w'], j.pattern.linear(j.dir('+X'), { count: 'n', step: 'pitch' }))

const holder = j.part('napkin-holder')
  .params({
    W: mm(170),     // along the napkins: a folded 33 cm napkin is 165 mm
    H: mm(80),      // wall height: half a folded napkin
    gap: mm(40),    // room for the stack, about 50 paper napkins
    t: mm(3),       // wall thickness
    b: mm(4),       // base thickness
    n: 4, pitch: mm(36), ww: mm(20),   // the windows
    sill: mm(10), head: mm(12),        // solid bands below and above them
  })
  .expose(['W', 'H', 'gap', 'n'], {
    labels: { W: 'width', H: 'height', gap: 'napkin stack', n: 'windows' },
    ranges: { W: [mm(100), mm(220)], H: [mm(50), mm(120)],
      gap: [mm(20), mm(70)], n: [0, 6] },
  })
  .extrude(side.profiles(), { symmetric: 'W' }, { id: 'body' })
  // the inside corners take a radius, so the bottom napkin pulls out clean
  .fillet(j.feat('body').edges('|Y').where(e => e.concave), mm(6),
    { id: 'inside' })
  .fillet(j.feat('body').sideFace('u.3').edges('|Y')
    .or(j.feat('body').sideFace('u.7').edges('|Y')), mm(1.4), { id: 'tops' })
  .cut(windows.profiles(), { through: 'all' }, { id: 'windows' })
  .chamfer(j.feat('body').sideFace('u.1').edges(), mm(0.6), { id: 'foot' })

return j.print('napkin-holder', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [holder],
}).orient('+Z')
