// D-04 · Battery holder: a block with one pocket per cell,
// laid out on a grid that a count decides.
// Notice that the cell size comes from a table (cells.csv) as configurations,
// and the grid from `count`.
// Cell sizes: IEC 60086 maxima, AAA Ø10.5 × 44.5, AA Ø14.5 × 50.5,
// C Ø26.2 × 50, D Ø34.2 × 61.5 mm.
const cells = j.table([data.cells.columns,
  ...data.cells.rows.map(r => data.cells.columns.map(c => String(r[c])))])

// one circle at the first grid position, patterned:
// the hole feature drills at every circle centre
const grid = j.sketch('grid', { on: j.plane.offset(j.plane.XY, 'h') })
  .circle('c', 'd / 2',
    { at: ['-(nx - 1) * pitch / 2', '-(ny - 1) * pitch / 2'] })
  .pattern(['c'], j.pattern.grid(j.dir('+X'), j.dir('+Y'),
    { count: ['nx', 'ny'], step: ['pitch', 'pitch'] }))

const holder = j.part('battery-holder')
  .params({
    d: mm(14.5), l: mm(50.5),  // cell diameter and length
                               // (overridden by the active config)
    count: 12,                 // how many cells
    nx: 'ceil(sqrt(count))',   // a near-square grid that holds `count`
    ny: 'ceil(count / nx)',
    web: lw(4),                // plastic between two pockets, at least
    pitch: 'd + 1 mm + web',   // 1 mm covers the free fit and hole
                               // compensation (Ø15.2 mm pocket for AA)
    depth: '0.45 * l',         // deep enough to stand, short enough to grab
    floor: layer(6),
    h: 'depth + floor',
    border: mm(4),
  })
  // AAA, AA, C, D: with none chosen the middle row (AA) is active
  .configs(cells)
  .expose(['count', 'd', 'l'], {
    labels: {
      count: 'number of cells', d: 'cell diameter',
      l: 'cell length',
    },
    ranges: { count: [1, 40], d: [mm(8), mm(36)], l: [mm(30), mm(70)] },
  })
  .extrude(j.sketch('base', { on: j.plane.XY })
    .rect('r', 'nx * pitch + 2 * border - web', 'ny * pitch + 2 * border - web',
      { center: true, r: 'border + d / 2' })
    .profiles(),
    'h', { id: 'body' })
  // a free fit for the cell, with a 1 mm 90° lead-in
  // so cells drop in without catching
  .hole(grid,
    j.hole.countersink(j.fit.hole('d', 'free'), 'd + 2.6 mm',
      deg(90), 'depth'),
    { id: 'pockets' })
  .chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })

return j.print('battery-holder', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [holder],
}).orient('+Z')
