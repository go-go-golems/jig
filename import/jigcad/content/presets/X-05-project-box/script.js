// X-05 · Project box: a box for a small circuit with a lid held by four M3
// screws in heat-set inserts, and a hole for a PG7 cable gland. Notice that
// box and lid are two bodies of one part, laid out side by side as they
// print: they share every param and the same corner list, so the screws
// and the inserts cannot drift apart.
const P = {
  W: mm(90), D: mm(60), H: mm(35),   // outside of the box, without the lid
  r: mm(5),                // corner radius
  wall: lw(5),             // 2.25 mm walls and floor
  lid_t: mm(3),
  boss_wall: lw(3),        // plastic round each insert
  // the bosses sit in the inside corners, touching both walls
  bx: 'W / 2 - wall - 2 mm - boss_wall',
  by: 'D / 2 - wall - 2 mm - boss_wall',
  gland: mm(12.5),         // PG7 cable gland thread
  lid_y: 'D + 8 mm',       // the lid lies beside the box on the plate
}
const outline = (id, y0) => j.sketch(id, { on: j.plane.XY })
  .rect('r', 'W', 'D', { center: true, at: [0, y0], r: 'r' })
const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]]

let box = j.part('project-box')
  .params(P)
  .expose(['W', 'D', 'H', 'gland'], {
    labels: { W: 'width', D: 'depth', H: 'height',
      gland: 'cable gland hole' },
    ranges: { W: [mm(40), mm(200)], D: [mm(30), mm(150)],
      H: [mm(15), mm(80)], gland: [mm(6), mm(20)] },
  })
  .extrude(outline('base', 0).profiles(), 'H', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
// a boss with an M3 × 5.7 mm heat-set insert in each inside corner, from
// the floor to the rim
corners.forEach(([sx, sy], k) => {
  box = box.add(j.lib.insert('M3x5.7').boss({ wall: 'boss_wall',
    height: 'H - wall' }), { at: j.pt(`${sx} * bx`, `${sy} * by`, 'wall'),
    id: `boss${k + 1}` })
})
box = box
  // the gland goes through the right-hand end, half way up; horizontal, so
  // the print job makes it a teardrop
  .hole([j.pt('W / 2', 0, 'H / 2')],
    j.hole.simple(j.fit.hole('gland', 'free'), 'wall + 1 mm'),
    { id: 'gland' })
  .chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })
  // the lid: a second body beside the box, with countersunk screws over the
  // bosses (the same corners, shifted by lid_y)
  .extrude(outline('lid', 'lid_y').profiles(), 'lid_t', { id: 'lid' })
  .hole(corners.map(([sx, sy]) =>
    j.pt(`${sx} * bx`, `lid_y + ${sy} * by`, 'lid_t')),
  j.hole.countersink('M3', { fit: 'free' }), { id: 'screws' })
  .chamfer(j.feat('lid').endFace().edges().minus(j.feat('screws').edges()),
    mm(1), { id: 'edge' })

// One plate, both as they sit: the box on its floor, the lid on its
// underside, so the countersinks open upwards.
return j.print('project-box', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [box],
}).orient('+Z').use(j.rules.fdm)
