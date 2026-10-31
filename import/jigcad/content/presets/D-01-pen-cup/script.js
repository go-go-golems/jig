// D-01 · Pen cup with pointed windows: a hexagonal cup, shelled, with six
// windows cut by one feature and a pattern.
// Notice the window shape: a rectangle with 45° pointed ends, so its top
// edge prints without supports.
const window = j.sketch('win', { on: j.plane.XZ })
  .polyline('w', [
    [0, 'sill'],                            // 45° point at the bottom
    ['win_w / 2', 'sill + win_w / 2'],
    ['win_w / 2', 'h - lintel - win_w / 2'],
    [0, 'h - lintel'],                      // 45° point at the top: no bridge
    ['-win_w / 2', 'h - lintel - win_w / 2'],
    ['-win_w / 2', 'sill + win_w / 2'],
  ], { closed: true })

const cup = j.part('pen-cup')
  .params({
    af: mm(70),            // across flats of the hexagon
    h: mm(100),            // height
    wall: lw(4),           // four perimeters, 1.8 mm with a 0.45 mm line
    r: mm(4),              // rounding of the six vertical edges
    win_w: mm(14),         // window width
    sill: mm(12),          // solid band at the bottom, above the floor
    lintel: mm(12),        // solid band at the rim
  })
  .expose(['af', 'h', 'win_w', 'wall'], {
    labels: {
      af: 'width across flats', h: 'height',
      win_w: 'window width', wall: 'wall thickness',
    },
    ranges: {
      af: [mm(50), mm(110)], h: [mm(60), mm(150)],
      win_w: [mm(6), mm(24)], wall: [mm(1.2), mm(4)],
    },
  })
  // polygon(…, { inscribed: false }) takes the apothem,
  // so 'af / 2' is half the width across flats
  .extrude(j.sketch('base', { on: j.plane.XY })
    .polygon('hex', 6, 'af / 2', { inscribed: false })
    .profiles(),
    'h', { id: 'body' })
  .fillet(j.feat('body').sideFaces().edges('|Z'), 'r', { id: 'round' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  // one cut through two opposite faces, then turned 60° and 120°:
  // six windows from one sketch
  .cut(window.profiles(), { symmetric: 'af + 10 mm' }, { id: 'window' })
  .pattern(j.feat('window'),
    j.pattern.circular(j.axis.Z, { count: 3, angle: deg(120) }),
    { id: 'windows' })
  // a bed edge gets a chamfer, not a fillet:
  // it takes up elephant's foot and needs no support
  .chamfer(j.feat('body').startFace().edges(), mm(0.6), { id: 'foot' })

// Printed upright: the floor is the bed contact, the windows' 45° points
// need no support.
return j.print('pen-cup', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [cup],
}).orient('+Z')
