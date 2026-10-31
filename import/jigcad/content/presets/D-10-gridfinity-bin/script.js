// D-10 · Gridfinity bin: a bin of gx × gy cells and u height units with
// feet, magnet pockets and a stacking lip, its size picked from a table.
// Notice that the feet and the inside are both lofts through rounded
// squares: the same 45° profile as D-09, once added and once removed.
// Gridfinity: 42 mm pitch, bins 0.5 mm smaller (41.5 mm a cell), 7 mm
// units; the foot is 0.8 mm at 45°, 1.8 mm straight, 2.15 mm at 45°.
const sizes = j.table([data.bins.columns,
  ...data.bins.rows.map(r => data.bins.columns.map(c => String(r[c])))])

// a rounded square inset from the bin's outline (or a cell's) at height z;
// its radius shrinks with the inset, so the steps are true 45° slopes
const square = (id, z, inset, w, d, at = [0, 0]) =>
  j.sketch(id, { on: j.plane.offset(j.plane.XY, z) })
    .rect('r', `${w} - 2 * (${inset})`, `${d} - 2 * (${inset})`,
      { center: true, at, r: `r_out - (${inset})` })
const cell0 = ['-(gx - 1) * pitch / 2', '-(gy - 1) * pitch / 2']
const foot = (id, z, inset) => square(id, z, inset, 'cell', 'cell', cell0)
const inner = (id, z, inset) => square(id, z, inset, 'W', 'D')

// four magnet pockets in the first cell, 13 mm from its centre each way,
// drawn as circles: the hole feature drills at every circle centre
let magnets = j.sketch('magnet-points', { on: j.plane.XY })
for (const [k, [sx, sy]] of [[1, 1], [-1, 1], [-1, -1], [1, -1]].entries()) {
  magnets = magnets.circle(`m${k + 1}`, 'magnet / 2',
    { at: [`${cell0[0]} + ${sx} * 13 mm`, `${cell0[1]} + ${sy} * 13 mm`] })
}
magnets = magnets.pattern(['m1', 'm2', 'm3', 'm4'],
  j.pattern.grid(j.dir('+X'), j.dir('+Y'),
    { count: ['gx', 'gy'], step: ['pitch', 'pitch'] }))

const bin = j.part('gridfinity-bin')
  .params({
    gx: 2, gy: 1, u: 3,          // cells across, cells deep, 7 mm units
    pitch: mm(42),
    cell: 'pitch - 0.5 mm',      // 41.5 mm: 0.25 mm clear all round
    W: 'gx * pitch - 0.5 mm',    // outside of the bin
    D: 'gy * pitch - 0.5 mm',
    r_out: mm(3.75),             // corner radius of the outside
    foot_h: mm(4.75),            // 0.8 + 1.8 + 2.15 mm
    H: 'u * 7 mm',               // to the top of the wall
    lip: mm(4.4),                // the stacking lip stands above H
    top: 'H + lip',
    wall: mm(1.2),
    floor: 'foot_h + 1.2 mm',    // the inside floor
    over: mm(0.5),               // tools run past the faces they open
    magnet: mm(6.5),             // pocket for a 6 × 2 mm magnet and glue
    magnet_h: mm(2.4),
  })
  .configs(sizes)                // 1x1x3, 2x1x3, 2x2x6; the middle is active
  .expose(['gx', 'gy', 'u'], {
    labels: { gx: 'cells across', gy: 'cells deep', u: 'height in 7 mm units' },
    ranges: { gx: [1, 4], gy: [1, 4], u: [2, 12] },
  })
  // one foot per cell: a ruled loft up the 45° / straight / 45° profile
  .loft([
    foot('f0', '0 mm', '2.95 mm'), foot('f1', '0.8 mm', '2.15 mm'),
    foot('f2', '2.6 mm', '2.15 mm'), foot('f3', 'foot_h', '0 mm'),
  ], { ruled: true, id: 'foot' })
  .pattern(j.feat('foot'), j.pattern.grid(j.dir('+X'), j.dir('+Y'),
    { count: ['gx', 'gy'], step: ['pitch', 'pitch'] }), { id: 'feet' })
  .extrude(j.sketch('outline', { on: j.plane.offset(j.plane.XY, 'foot_h') })
    .rect('r', 'W', 'D', { center: true, r: 'r_out' }).profiles(),
  'top - foot_h', { id: 'body' })
  // the inside: straight walls, a 45° shelf under the lip, then the lip's
  // socket profile, which ends in a sharp edge at the outside
  .loft([
    inner('i0', 'floor', 'wall'),
    // the shelf under the lip is a little steeper than 45°
    inner('i1', 'top - 4.65 mm - 1.2 * (2.85 mm - wall)', 'wall'),
    inner('i2', 'top - 4.65 mm', '2.85 mm'),
    inner('i3', 'top - 3.95 mm', '2.15 mm'),
    inner('i4', 'top - 2.15 mm', '2.15 mm'),
    inner('i5', 'top + over', '-over'),
  ], { ruled: true, op: 'cut', id: 'inside' })
  // magnet pockets from below, the Gridfinity size
  .hole(magnets, j.hole.simple('magnet', 'magnet_h'), { id: 'magnets' })

// Upright: the feet's 45° steps and the shelf under the lip need no support;
// the magnet pockets open onto the bed.
return j.print('gridfinity-bin', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'), parts: [bin],
}).orient('+Z').use(j.rules.fdm)
