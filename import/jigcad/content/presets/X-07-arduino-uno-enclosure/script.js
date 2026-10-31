// X-07 · Arduino Uno enclosure: a base with four insert standoffs on the
// Uno's holes, notches for its USB and power sockets, and a press-on lid
// with windows over the header rows for jumper wires: two bodies of one
// part, the lid drawn upside down beside the base, as it prints. Everything
// about the board is a table in uno.json. Notice the loops: one cut per
// port, one window per header row, one standoff per hole.
// Board coordinates are from the corner by the power jack, with the
// sockets on the edge x = 0. The board's centre is the world origin and the
// board is turned half a turn, so the sockets face +X.
const U = data.uno
const bx = x => `bl / 2 - ${x} mm`       // board x → world x
const by = y => `bw / 2 - ${y} mm`

const P = {
  bl: mm(U.board.l), bw: mm(U.board.w), bt: mm(U.board.t),
  over: mm(6.6),           // the USB socket stands 6.4 mm off the board edge
  clear: mm(1.5),          // room round the other three edges
  wall: lw(5), floor: layer(8),
  standoff: mm(5),         // under the board: its through-hole pins
  board_z: 'floor + standoff', top_z: 'board_z + bt',
  H: 'top_z + 15 mm',      // the sockets are 11 mm tall, the lid lip 3 mm
  gap: mm(1),              // round each socket in its notch
  // the inside, which is not centred on the board: more room at the sockets
  iw: 'bl + over + clear', id_: 'bw + 2 * clear', cx: '(over - clear) / 2',
  W: 'iw + 2 * wall', D: 'id_ + 2 * wall',
  post: mm(7.5),           // standoffs: an M3 insert's 4.0 mm hole + walls
  lid_t: layer(10), lip: mm(3), lip_t: mm(1.2), fit: mm(0.1),
  window: mm(5),           // width of a header window
  lid_y: 'D + 6 mm',       // where the lid lies on the plate
}
const outline = (id, y0) => j.sketch(id, { on: j.plane.XY })
  .rect('r', 'W', 'D', { center: true, at: ['cx', y0], r: mm(4) })

// one circle per hole of the table, at a given height
const postsAt = z => U.holes.reduce((sk, [x, y], k) =>
  sk.circle(`h${k + 1}`, 'post / 2', { at: [bx(x), by(y)] }),
j.sketch(`posts-${z}`, { on: j.plane.offset(j.plane.XY, z) }))

let box = j.part('uno-enclosure')
  .params(P)
  .expose(['standoff', 'clear', 'H'], {
    labels: { standoff: 'height under the board',
      clear: 'room round the board', H: 'height of the base' },
    ranges: { standoff: [mm(3), mm(12)], clear: [mm(0.5), mm(5)],
      H: [mm(20), mm(50)] },
  })
  .extrude(outline('outline', '0 mm').profiles(), 'H', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  .extrude(postsAt('floor').profiles(), 'standoff', { id: 'posts' })
  .hole(postsAt('board_z'), j.hole.insert('M3x4'), { id: 'inserts' })
// a notch from the rim for each socket on the +X end, `gap` all round it
U.ports.forEach(p => {
  box = box.cut(j.sketch(p.name, { on: j.plane.offset(j.plane.XY, 'H') })
    .rect('n', '3 * wall', `${p.w} mm + 2 * gap`,
      { center: true, at: ['cx + W / 2', by(p.y)] }).profiles(),
  `-(H - top_z + gap)`, { id: p.name })
})
box = box
  .chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })
  // the lid, upside down beside the base: a plate on the bed, a lip that
  // fits inside the walls with a snug fit, standing up from it
  .extrude(outline('lid', 'lid_y').profiles(), 'lid_t', { id: 'lid' })
  .extrude(j.sketch('lip', { on: j.plane.offset(j.plane.XY, 'lid_t') })
    .rect('o', 'iw - 2 * fit', 'id_ - 2 * fit',
      { center: true, at: ['cx', 'lid_y'] })
    .rect('i', 'iw - 2 * fit - 2 * lip_t', 'id_ - 2 * fit - 2 * lip_t',
      { center: true, at: ['cx', 'lid_y'] }).profiles(), 'lip', { id: 'lip' })
// a window over each header row; turning the lid over mirrors y, so a
// row at world y lies at lid_y − y
U.headers.forEach(h => {
  box = box.cut(j.sketch(h.name, { on: j.plane.XY })
    .rect('w', `${h.x1 - h.x0} mm`, 'window', { center: true,
      at: [bx((h.x0 + h.x1) / 2), `lid_y - (${by(h.y)})`], r: mm(1) })
    .profiles(), 'lid_t', { id: h.name })
})

// One plate, as drawn: the base upright, the lid on its top face.
return j.print('uno-enclosure', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [box],
}).orient('+Z').use(j.rules.fdm)
