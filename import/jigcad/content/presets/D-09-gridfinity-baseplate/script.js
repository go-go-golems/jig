// D-09 · Gridfinity baseplate: a frame of 42 mm sockets that Gridfinity bins
// drop into. Notice the socket: one loft through four rounded squares makes
// the stepped 45° profile, and a grid pattern repeats it nx × ny times.
// Gridfinity (Zack Freedman, 2022): 42 mm pitch; the socket is 2.15 mm at
// 45°, 1.8 mm straight and 0.7 mm at 45°, 4.65 mm deep, r 4 mm at the top.
const at0 = ['-(nx - 1) * pitch / 2', '-(ny - 1) * pitch / 2']   // first cell
// one section of the socket: a rounded square `inset` in from the top size,
// at height z; its corner radius shrinks with the inset, so the corners
// are true 45° cones
const section = (id, z, inset) =>
  j.sketch(id, { on: j.plane.offset(j.plane.XY, z) })
    .rect('r', `pitch - 2 * (${inset})`, `pitch - 2 * (${inset})`,
      { center: true, at: at0, r: `r_top - (${inset})` })

const plate = j.part('gridfinity-baseplate')
  .params({
    nx: 3, ny: 2,          // cells across and deep: 126 × 84 mm
    pitch: mm(42),         // the grid
    r_top: mm(4),          // corner radius of a cell at the top
    s1: mm(2.15),          // upper 45° step
    s2: mm(1.8),           // straight band
    s3: mm(0.7),           // lower 45° step
    h: 's1 + s2 + s3',     // 4.65 mm: the plate is the profile, open below
    over: mm(0.5),         // the tool runs past the top and the bottom
  })
  // with none chosen, the middle one is active; 5 × 4 is 210 × 168 mm,
  // as large as a 250 × 210 mm bed takes
  .configs({
    '2x2': { nx: 2, ny: 2 }, '3x2': { nx: 3, ny: 2 }, '5x4': { nx: 5, ny: 4 },
  })
  .expose(['nx', 'ny'], {
    labels: { nx: 'cells across', ny: 'cells deep' },
    ranges: { nx: [1, 5], ny: [1, 5] },
  })
  .extrude(j.sketch('base', { on: j.plane.XY })
    .rect('r', 'nx * pitch', 'ny * pitch', { center: true, r: 'r_top' })
    .profiles(), 'h', { id: 'plate' })
  // the socket of the first cell, from below the plate to above it
  .loft([
    section('s-bottom', '-over', 's1 + s3 + over'),
    section('s-low', 's3', 's1'),
    section('s-high', 's3 + s2', 's1'),
    section('s-top', 'h + over', '-over'),
  ], { ruled: true, op: 'cut', id: 'socket' })
  .pattern(j.feat('socket'), j.pattern.grid(j.dir('+X'), j.dir('+Y'),
    { count: ['nx', 'ny'], step: ['pitch', 'pitch'] }), { id: 'sockets' })

return j.print('gridfinity-baseplate', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [plate],
}).orient('+Z').use(j.rules.fdm)
