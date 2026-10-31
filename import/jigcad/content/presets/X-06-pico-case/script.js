// X-06 · Raspberry Pi Pico case: a tray with four M2 standoffs that the
// Pico screws onto, a notch for its micro-USB socket, a notch for wires,
// and a lid that presses on with a lip. The board's numbers are in
// pico.json. Notice the lid: a second body of the same part, drawn as it
// prints, upside down beside the tray, so its lip stands up from the bed.
const B = data.pico
const P = {
  bl: mm(B.board.l), bw: mm(B.board.w), bt: mm(B.board.t),
  hx: mm(B.holes.dx / 2), hy: mm(B.holes.dy / 2),
  usb_w: mm(B.usb.w), usb_h: mm(B.usb.h),
  clear: mm(1),            // round the board inside the walls
  wall: lw(4), floor: layer(8),
  standoff: mm(3),         // under the board: room for the pads and wires
  post: mm(4.5),           // standoff diameter
  board_z: 'floor + standoff',          // underside of the board
  top_z: 'board_z + bt',                // its top face
  H: 'top_z + 6.5 mm',                  // tray height: parts plus 3.9 mm
  iw: 'bl + 2 * clear', id_: 'bw + 2 * clear',   // inside
  W: 'iw + 2 * wall', D: 'id_ + 2 * wall',       // outside
  lid_t: layer(8),
  lip: mm(3), lip_t: mm(1.2),
  gap: mm(0.1),            // round the lip: the snug class, a press fit
  wires: mm(6),            // width of the notch for wires
  lid_y: 'D + 6 mm',       // where the lid lies on the plate
}
const rect = (id, z, w, d, r, y0 = '0 mm') =>
  j.sketch(id, { on: j.plane.offset(j.plane.XY, z) })
    .rect('r', w, d, { center: true, at: [0, y0], r })
// the four mounting holes, from the board's centre
const posts = z => j.sketch(`posts-${z}`, { on: j.plane.offset(j.plane.XY, z) })
  .circle('c', 'post / 2', { at: ['hx', 'hy'] })
  .pattern(['c'], j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y)))

const pico = j.part('pico-case')
  .params(P)
  .expose(['standoff', 'clear', 'gap'], {
    labels: { standoff: 'height under the board', clear: 'room round the board',
      gap: 'gap round the lid lip' },
    ranges: { standoff: [mm(2), mm(10)], clear: [mm(0.5), mm(3)],
      gap: [mm(0.05), mm(0.3)] },
  })
  .extrude(rect('outline', 0, 'W', 'D', mm(3)).profiles(), 'H', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  .extrude(posts('floor').profiles(), 'standoff', { id: 'posts' })
  // M2 screws cut their own thread in the posts
  .hole(posts('board_z'), j.hole.tapped('M2', { depth: 'standoff' }),
    { id: 'screws' })
  // the USB socket's end (−X) and the wires' end (+X): notches from the rim
  .cut(j.sketch('usb', { on: j.plane.offset(j.plane.XY, 'H') })
    .rect('n', '4 * wall', 'usb_w + 2 mm',
      { center: true, at: ['-W / 2', 0] }).profiles(),
  '-(H - top_z + 0.5 mm)', { id: 'usb' })
  .cut(j.sketch('wire', { on: j.plane.offset(j.plane.XY, 'H') })
    .rect('n', '4 * wall', 'wires', { center: true, at: ['W / 2', 0] })
    .profiles(), '-(H - top_z)', { id: 'wires' })
  .chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })
  // the lid, upside down beside the tray: a plate on the bed, and a lip
  // standing up from it that fits inside the walls with the snug gap
  .extrude(rect('lid', 0, 'W', 'D', mm(3), 'lid_y').profiles(), 'lid_t',
    { id: 'lid' })
  .extrude(j.sketch('lip', { on: j.plane.offset(j.plane.XY, 'lid_t') })
    .rect('o', 'iw - 2 * gap', 'id_ - 2 * gap',
      { center: true, at: [0, 'lid_y'] })
    .rect('i', 'iw - 2 * gap - 2 * lip_t', 'id_ - 2 * gap - 2 * lip_t',
      { center: true, at: [0, 'lid_y'] }).profiles(), 'lip', { id: 'lip' })

// One plate, as drawn: the tray upright, the lid on its top face.
return j.print('pico-case', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [pico],
}).orient('+Z').use(j.rules.fdm)
