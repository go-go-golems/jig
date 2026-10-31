// S-03 · Hex-pattern coaster: a disc,
// and one sketch of honeycomb pockets cut into its top face.
// Notice the pattern: one hexagon, copied on a hex lattice,
// filtered to the cells that stay inside the rim.
const lattice = j.frame({
  origin: j.origin,
  x: j.dir(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0),
  z: j.dir('+Z'),
})

// One hexagon of circumradius `cell`, corners at 0°, 60°…:
// its flat sides face 30°, 90°, 150°…, the lattice's neighbour directions.
const hexagon = [0, 1, 2, 3, 4, 5].map(k => [
  `cell * ${Math.cos(k * Math.PI / 3).toFixed(6)}`,
  `cell * ${Math.sin(k * Math.PI / 3).toFixed(6)}`,
])

const cells = j.sketch('cells', { on: j.feat('body').endFace() })
  .polyline('cell', hexagon, { closed: true })
  .pattern(['cell'], j.pattern.hex(lattice, {
    pitch: 'cell * sqrt(3) + web',
    rings: 'ceil(d / 2 / (cell * sqrt(3) + web))',
  })
    .filter((c, { scope }) => Math.hypot(c.at.x, c.at.y) + scope.cell.value <=
      scope.d.value / 2 - scope.rim.value))

const coaster = j.part('coaster')
  .params({
    d: mm(90),        // diameter: most mug bases are 60–80 mm across
    t: mm(4),         // total thickness
    depth: mm(1.6),   // pocket depth: 8 layers of 0.2 mm, holds a drip
    cell: mm(8),      // circumradius of one hexagonal pocket:
                      // 19 of them fit a 90 mm disc
    web: lw(3),       // wall between pockets: three line widths
    rim: mm(4),       // solid band round the edge
  })
  .expose(['d', 'cell', 'web', 'rim'], {
    labels: {
      d: 'diameter', cell: 'pocket size (corner radius)',
      web: 'wall between pockets', rim: 'rim width',
    },
    ranges: {
      d: [mm(70), mm(140)], cell: [mm(3), mm(10)],
      web: [mm(0.9), mm(3)], rim: [mm(2), mm(10)],
    },
  })
  .extrude(j.sketch('disc', { on: j.plane.XY })
    .circle('outline', 'd / 2')
    .profiles(),
    't', { id: 'body' })
  .cut(cells.profiles(), 'depth', { id: 'pockets' })
  // soften the top rim
  .chamfer(j.feat('body').endFace().edges('%circle'), mm(0.8), { id: 'edge' })

return j.print('coaster', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [coaster],
})
